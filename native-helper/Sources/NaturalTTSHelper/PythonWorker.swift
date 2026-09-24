import Foundation
import Logging
import os

/// The worker's state as /health reports it.
enum WorkerHealth: Sendable {
    /// Loading or reloading the model ("warming").
    case starting
    /// Warm and serving requests ("ok").
    case ready
    /// Died too often in a short time and was not restarted ("error"); only
    /// restarting the helper recovers.
    case failed
}

actor PythonWorker {
    private let logger = Logger(label: "com.naturaltts.helper.worker")
    private let config: Config

    private var process: Process?
    private var stdin: Pipe?
    private var stdout: Pipe?
    private var stderr: Pipe?

    private var isWarm = false

    /// Health mirror readable WITHOUT entering the actor. generate() holds
    /// the actor through a blocking read of the worker's stdout, so an
    /// actor-isolated isReady made /health wait for the whole synthesis
    /// (measured 6.6 s behind a /speak). Set in markWarm(), handleTermination(),
    /// recycle() and shutdown().
    nonisolated let health = OSAllocatedUnfairLock(initialState: WorkerHealth.starting)

    /// Scrubs request text out of anything the helper logs on the worker's behalf.
    nonisolated let redactor = TextRedactor()

    /// Bumped by every start(). Callbacks from a worker process carry the
    /// generation they were started with, so a worker this actor replaced on
    /// purpose (recycle) cannot mark the new one warm or trigger a restart.
    private var generation = 0
    private var shuttingDown = false

    /// Crash-loop bound: an unexpected worker exit is restarted unless this
    /// many exits already happened within crashWindow (then health = failed).
    private let maxRestarts = 3
    private let crashWindow: TimeInterval = 120
    private var crashTimes: [Date] = []

    private let warmupTimeout: TimeInterval = 60.0 // 60 seconds for model load

    /// Every line tts_worker.py's own logger writes starts with this.
    static let workerLinePrefix = "[worker] "

    /// Largest response frame accepted from the worker. tts_worker.py keeps a
    /// response well under it (MAX_AUDIO_SECONDS, audio_too_long).
    static let maxResponseBytes = 100 * 1024 * 1024

    init(config: Config) {
        self.config = config
    }

    func start() async throws {
        logger.info("Starting Python worker subprocess")
        generation += 1
        let generation = self.generation
        isWarm = false
        health.withLock { $0 = .starting }

        let process = Process()
        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        process.executableURL = URL(fileURLWithPath: config.pythonPath)
        process.arguments = [config.workerScriptPath]
        process.standardInput = stdinPipe
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        // Set environment variables for espeak-ng, and keep the worker off the
        // network whatever the launching shell exports (tts_worker.py forces
        // the same; HF_HUB_OFFLINE=0 or "" would otherwise turn the Hub on).
        var environment = ProcessInfo.processInfo.environment
        environment["ESPEAK_DATA_PATH"] = "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data"
        environment["HF_HUB_OFFLINE"] = "1"
        environment["HF_HUB_DISABLE_TELEMETRY"] = "1"
        process.environment = environment

        // Forward worker stderr line by line, through the redactor so request
        // text never reaches the helper's log, and watch for warmup completion.
        // Only lines from the worker's own logger ("[worker] " prefix, one
        // physical line each; tts_worker.py) are logged at info. Anything else
        // on the pipe (a library that escaped the worker's stderr redirect, a
        // native crash message) goes to debug, which the .info handler drops:
        // library output can carry text-derived data the redactor cannot
        // match, such as mlx-audio's phoneme dump of a long chunk.
        let logger = self.logger
        let redactor = self.redactor
        let lines = LineSplitter()
        stderrPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            // EOF: the worker is gone. Clear the handler, or Foundation keeps
            // calling it with empty Data and the helper spins a core at 100%.
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }

            for line in lines.feed(data) {
                let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                if trimmed.hasPrefix(Self.workerLinePrefix) {
                    logger.info("\(redactor.redact(trimmed))")
                } else {
                    logger.debug("[worker, unprefixed] \(redactor.redact(trimmed))")
                }

                if trimmed.contains("Model loaded, ready for requests") {
                    Task { [weak self] in
                        await self?.markWarm(generation: generation)
                    }
                }
            }
        }

        // Monitor process termination
        process.terminationHandler = { [weak self] process in
            Task {
                await self?.handleTermination(exitCode: process.terminationStatus, generation: generation)
            }
        }

        do {
            try process.run()
            self.process = process
            self.stdin = stdinPipe
            self.stdout = stdoutPipe
            self.stderr = stderrPipe

            logger.info("Python worker process started (PID: \(process.processIdentifier))")
        } catch {
            logger.error("Failed to start Python process: \(error)")
            throw WorkerError.processNotRunning
        }
    }

    func waitUntilReady(timeout: TimeInterval = 60.0) async throws {
        logger.info("Waiting for model to warm up (timeout: \(Int(timeout))s)")

        let deadline = Date().addingTimeInterval(timeout)

        while !isWarm && healthState != .failed && Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
        }

        if healthState == .failed {
            logger.error("Python worker failed to start")
            throw WorkerError.processNotRunning
        }
        guard isWarm else {
            logger.error("Model warmup timed out after \(Int(timeout))s")
            throw WorkerError.warmupTimeout
        }

        logger.info("Model warmed up and ready")
    }

    func generate(text: String, voice: String, speed: Float) async throws -> AudioData {
        try await ensureRunning()

        // Never log the text itself, only its size.
        logger.debug("Generating audio: \(text.count) characters (voice: \(voice), speed: \(speed))")
        redactor.remember(text)

        // Create request
        let request = GenerateRequest(text: text, voice: voice, speed: speed)

        // Send request
        try await sendMessage(request)

        // Receive response
        let response: GenerateResponse = try await receiveMessage()

        // Check for error
        // Redacted once, here, so no later log line or response body can carry
        // request text quoted by a worker error.
        if let error = response.error {
            let safe = redactor.redact(error)
            logger.error("Generation failed: \(safe)")
            throw WorkerError.generationFailed(safe)
        }

        // Decode audio
        guard let audioBase64 = response.audioBase64,
              let audioData = Data(base64Encoded: audioBase64),
              let duration = response.duration,
              let sampleRate = response.sampleRate,
              let format = response.format else {
            logger.error("Invalid response from Python worker")
            throw WorkerError.invalidResponse
        }

        logger.debug("Generated \(String(format: "%.2f", duration))s of audio (\(audioData.count) bytes)")

        return AudioData(
            data: audioData,
            duration: duration,
            sampleRate: sampleRate,
            format: format
        )
    }

    nonisolated var healthState: WorkerHealth {
        health.withLock { $0 }
    }

    nonisolated var isReady: Bool {
        healthState == .ready
    }

    func shutdown() async {
        logger.info("Shutting down Python worker")
        shuttingDown = true

        // Send shutdown signal (empty message)
        if let stdin = stdin {
            let zero: UInt32 = 0
            withUnsafeBytes(of: zero.littleEndian) { bytes in
                stdin.fileHandleForWriting.write(Data(bytes))
            }
            try? stdin.fileHandleForWriting.close()
        }

        // Wait for graceful shutdown
        if let process = process, process.isRunning {
            try? await Task.sleep(for: .seconds(2))

            if process.isRunning {
                process.terminate()
                logger.warning("Forcefully terminated Python worker")
            }
        }

        self.process = nil
        self.stdin = nil
        self.stdout = nil
        self.stderr = nil
        self.isWarm = false
        health.withLock { $0 = .starting }
    }

    // MARK: - Private Methods

    private func markWarm(generation: Int) {
        guard generation == self.generation, !shuttingDown else { return }
        isWarm = true
        health.withLock { $0 = .ready }
        logger.info("Python worker marked as warm")
    }

    private func ensureRunning() async throws {
        guard let process = process, process.isRunning else {
            logger.error("Python worker process not running")
            throw WorkerError.processNotRunning
        }

        guard isWarm else {
            logger.warning("Python worker not yet warmed up")
            throw WorkerError.warmupTimeout
        }
    }

    /// Replace a worker whose pipes can no longer be trusted (framing error,
    /// failed write). Not counted as a crash: the next request gets a fresh,
    /// in-sync worker once it has warmed up; until then /health says "warming".
    private func recycle(reason: String) async {
        logger.error("Replacing the Python worker: \(reason)")
        let old = process
        generation += 1 // callbacks from the old worker are ignored from here on
        isWarm = false
        health.withLock { $0 = .starting }
        try? stdin?.fileHandleForWriting.close()
        process = nil
        stdin = nil
        stdout = nil

        if let old, old.isRunning {
            old.terminate()
            let pid = old.processIdentifier
            DispatchQueue.global().asyncAfter(deadline: .now() + 2) {
                if old.isRunning { kill(pid, SIGKILL) }
            }
        }

        guard !shuttingDown else { return }
        do {
            try await start()
        } catch {
            logger.error("Could not restart the Python worker: \(error)")
            health.withLock { $0 = .failed }
        }
    }

    /// An unexpected worker exit (crash, Metal OOM, a bad frame) restarts the
    /// worker, bounded by maxRestarts per crashWindow. Past the bound /health
    /// reports "error" instead of an eternal "warming".
    private func handleTermination(exitCode: Int32, generation: Int) async {
        // A worker replaced by recycle(), or one that exits during shutdown.
        guard generation == self.generation, !shuttingDown else { return }

        logger.error("Python worker terminated unexpectedly (exit code: \(exitCode))")
        isWarm = false
        process = nil
        try? stdin?.fileHandleForWriting.close()
        stdin = nil
        stdout = nil

        let now = Date()
        crashTimes = crashTimes.filter { now.timeIntervalSince($0) < crashWindow } + [now]
        guard crashTimes.count <= maxRestarts else {
            logger.error("Python worker exited \(crashTimes.count) times in \(Int(crashWindow))s; not restarting it. Restart the helper.")
            health.withLock { $0 = .failed }
            return
        }

        logger.warning("Restarting Python worker (restart \(crashTimes.count) of \(maxRestarts) allowed in \(Int(crashWindow))s)")
        do {
            try await start()
        } catch {
            logger.error("Could not restart the Python worker: \(error)")
            health.withLock { $0 = .failed }
        }
    }

    private func sendMessage<T: Encodable>(_ message: T) async throws {
        guard let stdin = stdin else {
            throw WorkerError.processNotRunning
        }

        // Encode message as JSON, behind its length prefix (4 bytes, little-endian)
        let jsonData = try JSONEncoder().encode(message)
        var frame = Data()
        withUnsafeBytes(of: UInt32(jsonData.count).littleEndian) { frame.append(contentsOf: $0) }
        frame.append(jsonData)

        // The throwing write: with SIGPIPE ignored (App.swift) a worker that
        // has gone away is an EPIPE error here, not a signal that kills the
        // helper. A partial frame may have been written, so the pipe cannot be
        // trusted any more either way.
        do {
            try stdin.fileHandleForWriting.write(contentsOf: frame)
        } catch {
            await recycle(reason: "could not write the request to the worker (\(error))")
            throw WorkerError.invalidResponse
        }

        logger.debug("Sent message: \(jsonData.count) bytes")
    }

    /// Reads one response frame. A framing error (a short read, a length of 0
    /// or past maxResponseBytes) leaves the rest of the frame in the pipe, where
    /// every later read would take payload bytes for a length: the worker is
    /// replaced (recycle) before the error is thrown.
    private func receiveMessage<T: Decodable>() async throws -> T {
        guard let stdout = stdout else {
            throw WorkerError.processNotRunning
        }

        // Read length prefix (4 bytes)
        guard let lengthData = try? stdout.fileHandleForReading.read(upToCount: 4),
              lengthData.count == 4 else {
            await recycle(reason: "short read of a response length")
            throw WorkerError.invalidResponse
        }

        let length = lengthData.withUnsafeBytes { bytes in
            bytes.load(as: UInt32.self).littleEndian
        }

        guard length > 0 && Int(length) < Self.maxResponseBytes else {
            // Never log the frame's bytes: they can be request-derived.
            await recycle(reason: "invalid response length \(length)")
            throw WorkerError.invalidResponse
        }

        // Read message body
        guard let messageData = try? stdout.fileHandleForReading.read(upToCount: Int(length)),
              messageData.count == Int(length) else {
            await recycle(reason: "short read of a \(length)-byte response")
            throw WorkerError.invalidResponse
        }

        logger.debug("Received message: \(messageData.count) bytes")

        // Decode JSON
        let decoder = JSONDecoder()
        return try decoder.decode(T.self, from: messageData)
    }
}

// MARK: - Log privacy

/// Keeps the text being read aloud out of the helper's log. The helper never
/// logs request text itself; this also covers what it forwards from the worker
/// (stderr lines, error strings), whatever worker version is installed: any
/// 16-character run shared with one of the two most recent request texts
/// (raw, or NFKD-folded to ASCII the way the worker normalizes) withholds the
/// line, and the old worker's text-echoing formats are cut at their marker.
final class TextRedactor: Sendable {
    private static let window = 16
    private static let keep = 2

    private struct Entry {
        let text: String
        let folded: String
        let windows: Set<String>
    }

    private let recent = OSAllocatedUnfairLock<[Entry]>(initialState: [])

    func remember(_ text: String) {
        let folded = Self.fold(text)
        let windows = Self.windows(of: text).union(Self.windows(of: folded))
        let entry = Entry(text: text, folded: folded, windows: windows)
        recent.withLock { entries in
            entries.append(entry)
            if entries.count > Self.keep { entries.removeFirst(entries.count - Self.keep) }
        }
    }

    func redact(_ line: String) -> String {
        for marker in ["Text normalized: ", "Generating: ", "Next bytes (ascii): "] {
            guard let range = line.range(of: marker) else { continue }
            let rest = line[range.upperBound...]
            // The current worker logs sizes only ("Text normalized: 12 -> 10 chars").
            if rest.range(of: #"^\d+ -> \d+ chars$"#, options: .regularExpression) != nil { continue }
            return line[..<range.upperBound] + "[text withheld]"
        }

        let lineWindows = Self.windows(of: line)
        let leaks = recent.withLock { entries in
            entries.contains { entry in
                if entry.text.count < Self.window {
                    // Short texts: a whole-text match, ignoring 1-3 character texts.
                    return (entry.text.count >= 4 && line.contains(entry.text))
                        || (entry.folded.count >= 4 && line.contains(entry.folded))
                }
                return !entry.windows.isDisjoint(with: lineWindows)
            }
        }
        return leaks ? "[line withheld: contains request text]" : line
    }

    private static func fold(_ text: String) -> String {
        String(String.UnicodeScalarView(text.decomposedStringWithCompatibilityMapping.unicodeScalars.filter(\.isASCII)))
    }

    private static func windows(of text: String) -> Set<String> {
        let characters = Array(text)
        guard characters.count >= window else { return [] }
        var result = Set<String>()
        result.reserveCapacity(characters.count - window + 1)
        for start in 0...(characters.count - window) {
            result.insert(String(characters[start..<(start + window)]))
        }
        return result
    }
}

/// Reassembles newline-terminated lines from pipe chunks. readabilityHandler
/// runs serially for one handle, but the buffer is locked anyway.
final class LineSplitter: Sendable {
    private let pending = OSAllocatedUnfairLock<Data>(initialState: Data())

    func feed(_ data: Data) -> [String] {
        pending.withLock { buffer in
            buffer.append(data)
            var lines: [String] = []
            while let newline = buffer.firstIndex(of: UInt8(ascii: "\n")) {
                let lineData = buffer[buffer.startIndex..<newline]
                lines.append(String(decoding: lineData, as: UTF8.self))
                buffer.removeSubrange(buffer.startIndex...newline)
            }
            return lines
        }
    }
}

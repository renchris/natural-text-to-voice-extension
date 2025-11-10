import Foundation
import Logging

actor PythonWorker {
    private let logger = Logger(label: "com.naturaltts.helper.worker")
    private let config: Config

    private var process: Process?
    private var stdin: Pipe?
    private var stdout: Pipe?
    private var stderr: Pipe?

    private var isWarm = false
    private var restartCount = 0
    private let maxRestarts = 3

    private let warmupTimeout: TimeInterval = 60.0 // 60 seconds for model load

    init(config: Config) {
        self.config = config
    }

    func start() async throws {
        logger.info("Starting Python worker subprocess")

        let process = Process()
        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        process.executableURL = URL(fileURLWithPath: config.pythonPath)
        process.arguments = [config.workerScriptPath]
        process.standardInput = stdinPipe
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        // Set environment variables for espeak-ng
        var environment = ProcessInfo.processInfo.environment
        environment["ESPEAK_DATA_PATH"] = "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data"
        process.environment = environment

        // Monitor stderr for logs and warmup completion
        let logger = self.logger
        stderrPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }

            if let line = String(data: data, encoding: .utf8) {
                let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    logger.debug("[Python] \(trimmed)")

                    // Check for warmup completion
                    if trimmed.contains("Model loaded, ready for requests") {
                        Task {
                            await self?.markWarm()
                        }
                    }
                }
            }
        }

        // Monitor process termination
        process.terminationHandler = { [weak self] process in
            Task {
                await self?.handleTermination(exitCode: process.terminationStatus)
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

        while !isWarm && Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
        }

        guard isWarm else {
            logger.error("Model warmup timed out after \(Int(timeout))s")
            throw WorkerError.warmupTimeout
        }

        logger.info("Model warmed up and ready")
    }

    func generate(text: String, voice: String, speed: Float) async throws -> AudioData {
        try await ensureRunning()

        logger.debug("Generating audio: \(text.prefix(50))... (voice: \(voice), speed: \(speed))")

        // Create request
        let request = GenerateRequest(text: text, voice: voice, speed: speed)

        // Send request
        try await sendMessage(request)

        // Receive response
        let response: GenerateResponse = try await receiveMessage()

        // Check for error
        if let error = response.error {
            logger.error("Generation failed: \(error)")
            throw WorkerError.generationFailed(error)
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

    var isReady: Bool {
        isWarm && process?.isRunning == true
    }

    func shutdown() async {
        logger.info("Shutting down Python worker")

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
    }

    // MARK: - Private Methods

    private func markWarm() {
        isWarm = true
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

    private func handleTermination(exitCode: Int32) {
        logger.error("Python worker terminated unexpectedly (exit code: \(exitCode))")
        isWarm = false
        // Could implement auto-restart here if needed
    }

    private func sendMessage<T: Encodable>(_ message: T) async throws {
        guard let stdin = stdin else {
            throw WorkerError.processNotRunning
        }

        // Encode message as JSON
        let encoder = JSONEncoder()
        let jsonData = try encoder.encode(message)

        // Write length prefix (4 bytes, little-endian)
        var length = UInt32(jsonData.count).littleEndian
        withUnsafeBytes(of: &length) { bytes in
            stdin.fileHandleForWriting.write(Data(bytes))
        }

        // Write message body
        stdin.fileHandleForWriting.write(jsonData)

        logger.debug("Sent message: \(jsonData.count) bytes")
    }

    private func receiveMessage<T: Decodable>() async throws -> T {
        guard let stdout = stdout else {
            throw WorkerError.processNotRunning
        }

        // Read length prefix (4 bytes)
        guard let lengthData = try? stdout.fileHandleForReading.read(upToCount: 4),
              lengthData.count == 4 else {
            throw WorkerError.invalidResponse
        }

        let length = lengthData.withUnsafeBytes { bytes in
            bytes.load(as: UInt32.self).littleEndian
        }

        guard length > 0 && length < 100 * 1024 * 1024 else { // Max 100MB
            logger.error("Invalid message length: \(length) (0x\(String(length, radix: 16)))")
            // Log first few bytes for debugging
            if let peek = try? stdout.fileHandleForReading.read(upToCount: 16) {
                logger.error("Next bytes (hex): \(peek.map { String(format: "%02x", $0) }.joined())")
                logger.error("Next bytes (ascii): \(String(data: peek, encoding: .ascii) ?? "non-ascii")")
            }
            throw WorkerError.invalidResponse
        }

        // Read message body
        guard let messageData = try? stdout.fileHandleForReading.read(upToCount: Int(length)),
              messageData.count == Int(length) else {
            throw WorkerError.invalidResponse
        }

        logger.debug("Received message: \(messageData.count) bytes")

        // Decode JSON
        let decoder = JSONDecoder()
        return try decoder.decode(T.self, from: messageData)
    }
}

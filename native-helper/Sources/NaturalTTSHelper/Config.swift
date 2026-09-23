import Foundation

enum ConfigError: Error, CustomStringConvertible {
    case helpRequested
    case badArgument(String)
    case pythonNotFound(searched: [String])
    case workerNotFound(searched: [String])
    case pathInvalid(what: String, path: String, source: String)

    static let setupHint = "Build the helper's Python environment with native-helper/Scripts/setup-python-env.sh"

    var description: String {
        switch self {
        case .helpRequested:
            return "help requested"
        case .badArgument(let message):
            return "\(message)\n\(LaunchOverrides.usage)"
        case .pythonNotFound(let searched):
            return "No Python environment found (python-env/bin/python3). \(ConfigError.setupHint), "
                + "or pass --python <path> / NATURAL_TTS_PYTHON. Searched: \(searched.joined(separator: ", "))"
        case .workerNotFound(let searched):
            return "tts_worker.py not found. Rebuild with `swift build -c release`, or pass --worker <path> / "
                + "NATURAL_TTS_WORKER. Searched: \(searched.joined(separator: ", "))"
        case .pathInvalid(let what, let path, let source):
            let hint = what == "Python interpreter" ? " \(ConfigError.setupHint)." : ""
            return "\(what) from \(source) does not exist or is not usable: \(path).\(hint)"
        }
    }
}

/// Launch-time overrides, so tests and packaged installs never depend on the
/// machine-wide config file. CLI flags win over environment variables.
struct LaunchOverrides {
    /// Directory holding config.json, used instead of the shared one.
    var configDirectory: URL?
    var port: Int?
    var pythonPath: String?
    var workerScriptPath: String?

    var isEmpty: Bool {
        configDirectory == nil && port == nil && pythonPath == nil && workerScriptPath == nil
    }

    static let usage = """
        usage: natural-tts-helper [--port <n>] [--python <path>] [--worker <path>]
        environment: NATURAL_TTS_CONFIG_DIR  directory holding config.json (read and written there)
                     NATURAL_TTS_PORT, NATURAL_TTS_PYTHON, NATURAL_TTS_WORKER  (flags win)
        With no override the helper reads and writes
        ~/Library/Application Support/NaturalTTS/config.json. With ANY override it never
        writes that shared file; without NATURAL_TTS_CONFIG_DIR it does not read it either.
        """

    static func parse(arguments: [String], environment: [String: String]) throws -> LaunchOverrides {
        var overrides = LaunchOverrides()

        func env(_ key: String) -> String? {
            guard let value = environment[key], !value.isEmpty else { return nil }
            return value
        }
        if let dir = env("NATURAL_TTS_CONFIG_DIR") {
            overrides.configDirectory = URL(fileURLWithPath: absolutePath(dir), isDirectory: true)
        }
        if let port = env("NATURAL_TTS_PORT") { overrides.port = try parsePort(port, source: "NATURAL_TTS_PORT") }
        if let python = env("NATURAL_TTS_PYTHON") { overrides.pythonPath = absolutePath(python) }
        if let worker = env("NATURAL_TTS_WORKER") { overrides.workerScriptPath = absolutePath(worker) }

        var index = 0
        while index < arguments.count {
            let argument = arguments[index]
            index += 1
            if argument.hasPrefix("-psn_") { continue } // LaunchServices process serial number

            var name = argument
            var inlineValue: String?
            if argument.hasPrefix("--"), let equals = argument.firstIndex(of: "=") {
                name = String(argument[..<equals])
                inlineValue = String(argument[argument.index(after: equals)...])
            }

            switch name {
            case "-h", "--help":
                throw ConfigError.helpRequested
            case "--port", "--python", "--worker":
                let value: String
                if let inlineValue {
                    value = inlineValue
                } else if index < arguments.count {
                    value = arguments[index]
                    index += 1
                } else {
                    throw ConfigError.badArgument("\(name) needs a value")
                }
                guard !value.isEmpty else { throw ConfigError.badArgument("\(name) needs a value") }
                switch name {
                case "--port": overrides.port = try parsePort(value, source: "--port")
                case "--python": overrides.pythonPath = absolutePath(value)
                default: overrides.workerScriptPath = absolutePath(value)
                }
            default:
                throw ConfigError.badArgument("unknown argument '\(argument)'")
            }
        }
        return overrides
    }

    private static func parsePort(_ value: String, source: String) throws -> Int {
        guard let port = Int(value), (1...65535).contains(port) else {
            throw ConfigError.badArgument("\(source): '\(value)' is not a TCP port (1-65535)")
        }
        return port
    }

    private static func absolutePath(_ path: String) -> String {
        let expanded = (path as NSString).expandingTildeInPath
        let base = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
        return URL(fileURLWithPath: expanded, relativeTo: base).standardizedFileURL.path
    }
}

/// The effective config plus where (if anywhere) it may be persisted.
struct ResolvedConfig {
    var config: Config
    /// nil = ephemeral: overrides were given without NATURAL_TTS_CONFIG_DIR, so
    /// nothing is written anywhere.
    let persistURL: URL?
    /// true when the port came from --port / NATURAL_TTS_PORT, or the config
    /// names a port outside the extension's discovery range 8249-8260: never
    /// scan the fallback range, fail instead. (Scanning from 8249 for a config
    /// port of 18250 would silently land a test helper on the production range.)
    let portIsExplicit: Bool
    let sourceDescription: String
}

/// config.json. Pre-1.5 files also carry a "secret" (a UUID nothing ever
/// checked); decoding ignores it and the next save drops it.
struct Config: Codable {
    var port: Int
    var pythonPath: String
    var workerScriptPath: String
    let defaultVoice: String

    enum CodingKeys: String, CodingKey {
        case port
        case pythonPath = "python_path"
        case workerScriptPath = "worker_script_path"
        case defaultVoice = "default_voice"
    }

    static let preferredPort = 8249
    static let portRangeCount = 12
    static var discoveryRange: ClosedRange<Int> { preferredPort...(preferredPort + portRangeCount - 1) }

    static let configDirectory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/NaturalTTS")
    static let configFilePath = configDirectory.appendingPathComponent("config.json")

    /// Loads the effective config.
    /// - No override: the shared config.json (read, and later written) — the
    ///   pre-1.5 behaviour.
    /// - NATURAL_TTS_CONFIG_DIR: `<dir>/config.json` instead; flags apply on top.
    /// - Any other override: an in-memory config; the shared file is neither
    ///   read nor written.
    /// Unset interpreter/worker paths are resolved from the executable location
    /// and the source tree; there is no system-Python fallback. Throws a
    /// ConfigError naming Scripts/setup-python-env.sh when nothing usable exists.
    static func load(overrides: LaunchOverrides) throws -> ResolvedConfig {
        let fileURL: URL?
        let source: String
        if let dir = overrides.configDirectory {
            fileURL = dir.appendingPathComponent("config.json")
            source = "\(fileURL!.path) (NATURAL_TTS_CONFIG_DIR)"
        } else if overrides.isEmpty {
            fileURL = configFilePath
            source = configFilePath.path
        } else {
            fileURL = nil
            source = "command-line/environment overrides only (shared config not read or written)"
        }

        var config: Config
        if let fileURL, FileManager.default.fileExists(atPath: fileURL.path) {
            config = try JSONDecoder().decode(Config.self, from: Data(contentsOf: fileURL))
        } else {
            config = Config(
                port: preferredPort,
                pythonPath: "",
                workerScriptPath: "",
                defaultVoice: "af_bella"
            )
        }

        if let port = overrides.port { config.port = port }
        if let python = overrides.pythonPath { config.pythonPath = python }
        if let worker = overrides.workerScriptPath { config.workerScriptPath = worker }

        let pythonSource = overrides.pythonPath != nil ? "--python/NATURAL_TTS_PYTHON" : "config \(source)"
        let workerSource = overrides.workerScriptPath != nil ? "--worker/NATURAL_TTS_WORKER" : "config \(source)"

        if config.pythonPath.isEmpty {
            config.pythonPath = try PathResolver.pythonPath()
        } else if !FileManager.default.isExecutableFile(atPath: config.pythonPath) {
            throw ConfigError.pathInvalid(what: "Python interpreter", path: config.pythonPath, source: pythonSource)
        }

        if config.workerScriptPath.isEmpty {
            config.workerScriptPath = try PathResolver.workerScriptPath()
        } else if !FileManager.default.isReadableFile(atPath: config.workerScriptPath) {
            throw ConfigError.pathInvalid(what: "Worker script", path: config.workerScriptPath, source: workerSource)
        }

        return ResolvedConfig(
            config: config,
            persistURL: fileURL,
            portIsExplicit: overrides.port != nil || !discoveryRange.contains(config.port),
            sourceDescription: source
        )
    }

    /// Returns true if the given TCP port on 127.0.0.1 can be bound right now.
    /// Subject to TOCTOU; callers should still handle bind failure.
    static func isPortAvailable(_ port: Int) -> Bool {
        let sock = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard sock >= 0 else { return false }

        // Match the NIO listener, which sets SO_REUSEADDR: without it a port
        // whose previous listener left TIME_WAIT sockets reads as busy for
        // ~30 s, and a quick restart silently moved the helper to 8250.
        // A port with a live listener still fails to bind.
        var one: Int32 = 1
        _ = setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &one, socklen_t(MemoryLayout<Int32>.size))

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = UInt16(port).bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")

        let bindResult = withUnsafePointer(to: &addr) { addrPtr in
            addrPtr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                Darwin.bind(sock, sockaddrPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        // Close before the connect check: a still-bound probe socket is the
        // most specific match for 127.0.0.1:port and would refuse the connect.
        Darwin.close(sock)
        guard bindResult == 0 else { return false }

        // SO_REUSEADDR also lets a 127.0.0.1 bind succeed beside a WILDCARD
        // (*:port) listener on macOS, which the NIO listener (also
        // SO_REUSEADDR) would then shadow on loopback. Only a TIME_WAIT
        // leftover should pass, so also make sure nothing accepts a connection.
        return !hasLoopbackListener(port)
    }

    /// True when a connect to 127.0.0.1:port is accepted within 250 ms.
    private static func hasLoopbackListener(_ port: Int) -> Bool {
        let sock = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard sock >= 0 else { return false }
        defer { Darwin.close(sock) }
        _ = fcntl(sock, F_SETFL, fcntl(sock, F_GETFL, 0) | O_NONBLOCK)

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = UInt16(port).bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")

        let result = withUnsafePointer(to: &addr) { addrPtr in
            addrPtr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                Darwin.connect(sock, sockaddrPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        if result == 0 { return true }
        guard errno == EINPROGRESS else { return false } // ECONNREFUSED: nobody listening

        var pfd = pollfd(fd: sock, events: Int16(POLLOUT), revents: 0)
        guard poll(&pfd, 1, 250) == 1 else { return false }
        var soError: Int32 = 0
        var length = socklen_t(MemoryLayout<Int32>.size)
        getsockopt(sock, SOL_SOCKET, SO_ERROR, &soError, &length)
        return soError == 0
    }

    /// Scans `count` consecutive ports starting at `startingAt`, returns the first available.
    static func findAvailablePort(startingAt: Int = preferredPort, count: Int = portRangeCount) -> Int? {
        for offset in 0..<count {
            let port = startingAt + offset
            if isPortAvailable(port) {
                return port
            }
        }
        return nil
    }

    /// Writes the config to `url` (the shared file, or NATURAL_TTS_CONFIG_DIR's).
    /// Callers only ever pass ResolvedConfig.persistURL, which is nil whenever an
    /// override is given without NATURAL_TTS_CONFIG_DIR.
    func save(to url: URL) throws {
        let directory = url.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }

        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        let data = try encoder.encode(self)
        // .atomic = write to sibling temp file + fsync + rename. Prevents
        // partial reads by the extension if the helper dies mid-write.
        try data.write(to: url, options: .atomic)
    }
}

/// Finds the Python environment and the worker script when nothing is
/// configured. Looks relative to the executable first (a packaged .app, the
/// SwiftPM resource bundle beside the binary, then the source tree the binary
/// was built in), then relative to the working directory. Never falls back to
/// a system Python: that interpreter lacks mlx and fails only on first /speak.
enum PathResolver {
    static let sourceResources = "Sources/NaturalTTSHelper/Resources"
    static let resourceBundle = "NaturalTTSHelper_NaturalTTSHelper.bundle"
    static let pythonRelative = "python-env/bin/python3"
    static let workerName = "tts_worker.py"

    /// Directory of the running binary with symlinks resolved
    /// (.build/release is a symlink to .build/<triple>/release).
    static var executableDirectory: URL? {
        guard let executable = Bundle.main.executableURL else { return nil }
        return executable.resolvingSymlinksInPath().deletingLastPathComponent()
    }

    /// Directories that may be the `native-helper` source root: the binary's
    /// ancestors (it lives at native-helper/.build/<triple>/release), then cwd.
    static func sourceRootCandidates() -> [URL] {
        var roots: [URL] = []
        if var directory = executableDirectory {
            for _ in 0..<6 {
                roots.append(directory)
                let parent = directory.deletingLastPathComponent()
                if parent.path == directory.path { break }
                directory = parent
            }
        }
        roots.append(URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true))
        return roots.flatMap { [$0, $0.appendingPathComponent("native-helper")] }
    }

    static func pythonCandidates() -> [String] {
        var candidates: [URL] = []
        if let exeDir = executableDirectory {
            candidates.append(exeDir.appendingPathComponent("../Resources/\(pythonRelative)")) // .app bundle
            candidates.append(exeDir.appendingPathComponent(pythonRelative))
        }
        candidates += sourceRootCandidates().map {
            $0.appendingPathComponent("\(sourceResources)/\(pythonRelative)")
        }
        return unique(candidates)
    }

    static func workerCandidates() -> [String] {
        var candidates: [URL] = []
        if let exeDir = executableDirectory {
            candidates.append(exeDir.appendingPathComponent("\(resourceBundle)/\(workerName)"))
            candidates.append(exeDir.appendingPathComponent("\(resourceBundle)/Contents/Resources/\(workerName)"))
            candidates.append(exeDir.appendingPathComponent("../Resources/\(resourceBundle)/\(workerName)")) // .app
            candidates.append(exeDir.appendingPathComponent("../Resources/\(workerName)")) // .app
            candidates.append(exeDir.appendingPathComponent(workerName))
        }
        candidates += sourceRootCandidates().map {
            $0.appendingPathComponent("\(sourceResources)/\(workerName)")
        }
        return unique(candidates)
    }

    static func pythonPath() throws -> String {
        let candidates = pythonCandidates()
        // Deliberately not resolving the venv's python3 symlink: the venv is
        // detected from the path the interpreter is invoked through.
        guard let found = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            throw ConfigError.pythonNotFound(searched: candidates)
        }
        return found
    }

    static func workerScriptPath() throws -> String {
        let candidates = workerCandidates()
        guard let found = candidates.first(where: { FileManager.default.isReadableFile(atPath: $0) }) else {
            throw ConfigError.workerNotFound(searched: candidates)
        }
        return found
    }

    private static func unique(_ urls: [URL]) -> [String] {
        var seen = Set<String>()
        return urls.map { $0.standardizedFileURL.path }.filter { seen.insert($0).inserted }
    }
}

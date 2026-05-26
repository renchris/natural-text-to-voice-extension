import Foundation

struct Config: Codable {
    var port: Int
    let secret: String
    let pythonPath: String
    let workerScriptPath: String
    let defaultVoice: String

    enum CodingKeys: String, CodingKey {
        case port, secret
        case pythonPath = "python_path"
        case workerScriptPath = "worker_script_path"
        case defaultVoice = "default_voice"
    }

    static let preferredPort = 8249
    static let portRangeCount = 12

    static let configDirectory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/NaturalTTS")
    static let configFilePath = configDirectory.appendingPathComponent("config.json")

    static func load() throws -> Config {
        // Check if config exists
        if FileManager.default.fileExists(atPath: configFilePath.path) {
            let data = try Data(contentsOf: configFilePath)
            return try JSONDecoder().decode(Config.self, from: data)
        }

        // Create new config with defaults
        let config = Config.createDefault()
        try config.save()
        return config
    }

    static func createDefault() -> Config {
        return Config(
            port: preferredPort,
            secret: UUID().uuidString,
            pythonPath: findPythonPath(),
            workerScriptPath: findWorkerScriptPath(),
            defaultVoice: "af_bella"
        )
    }

    /// Returns true if the given TCP port on 127.0.0.1 can be bound right now.
    /// Subject to TOCTOU; callers should still handle bind failure.
    static func isPortAvailable(_ port: Int) -> Bool {
        let sock = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard sock >= 0 else { return false }
        defer { Darwin.close(sock) }

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = UInt16(port).bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")

        let bindResult = withUnsafePointer(to: &addr) { addrPtr in
            addrPtr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                Darwin.bind(sock, sockaddrPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return bindResult == 0
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

    func save() throws {
        if !FileManager.default.fileExists(atPath: Config.configDirectory.path) {
            try FileManager.default.createDirectory(
                at: Config.configDirectory,
                withIntermediateDirectories: true
            )
        }

        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        let data = try encoder.encode(self)
        // .atomic = write to sibling temp file + fsync + rename. Prevents
        // partial reads by the extension if the helper dies mid-write.
        try data.write(to: Config.configFilePath, options: .atomic)
    }

    private static func findPythonPath() -> String {
        // Try bundled Python first (in Resources - for production .app bundle)
        if let resourcePath = Bundle.main.resourcePath {
            let bundledPython = "\(resourcePath)/python-env/bin/python3"
            if FileManager.default.fileExists(atPath: bundledPython) {
                return bundledPython
            }
        }

        // Try development location (when running from .build/debug)
        let currentDir = FileManager.default.currentDirectoryPath
        let devPython = "\(currentDir)/Sources/NaturalTTSHelper/Resources/python-env/bin/python3"
        if FileManager.default.fileExists(atPath: devPython) {
            return devPython
        }

        // Fall back to system Python
        let systemPython = "/usr/bin/python3"
        if FileManager.default.fileExists(atPath: systemPython) {
            return systemPython
        }

        // Try finding via PATH
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        process.arguments = ["python3"]

        let pipe = Pipe()
        process.standardOutput = pipe
        try? process.run()
        process.waitUntilExit()

        if let data = try? pipe.fileHandleForReading.readToEnd(),
           let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
           !path.isEmpty {
            return path
        }

        // Default fallback
        return "/usr/bin/python3"
    }

    private static func findWorkerScriptPath() -> String {
        // Try bundled script first
        if let resourcePath = Bundle.main.resourcePath {
            let bundledScript = "\(resourcePath)/tts_worker.py"
            if FileManager.default.fileExists(atPath: bundledScript) {
                return bundledScript
            }
        }

        // Fall back to relative path (for development)
        let currentDir = FileManager.default.currentDirectoryPath
        return "\(currentDir)/Sources/NaturalTTSHelper/Resources/tts_worker.py"
    }
}

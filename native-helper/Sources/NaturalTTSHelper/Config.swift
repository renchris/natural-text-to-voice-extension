import Foundation

struct Config: Codable {
    let port: Int
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
        // Generate random port
        let port = Int.random(in: 8000..<9000)

        // Generate secret token
        let secret = UUID().uuidString

        // Find Python path (system Python or bundled)
        let pythonPath = findPythonPath()

        // Find worker script path
        let workerScriptPath = findWorkerScriptPath()

        return Config(
            port: port,
            secret: secret,
            pythonPath: pythonPath,
            workerScriptPath: workerScriptPath,
            defaultVoice: "af_bella"
        )
    }

    func save() throws {
        // Create config directory if needed
        if !FileManager.default.fileExists(atPath: Config.configDirectory.path) {
            try FileManager.default.createDirectory(
                at: Config.configDirectory,
                withIntermediateDirectories: true
            )
        }

        // Write config
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        let data = try encoder.encode(self)
        try data.write(to: Config.configFilePath)
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

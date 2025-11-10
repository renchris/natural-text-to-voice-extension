import Foundation
import Logging

@main
struct NaturalTTSHelper {
    static func main() async {
        // Configure logging
        LoggingSystem.bootstrap { label in
            var handler = StreamLogHandler.standardOutput(label: label)
            handler.logLevel = .info
            return handler
        }

        let logger = Logger(label: "com.naturaltts.helper")
        logger.info("Natural TTS Helper starting...")
        logger.info("Metal GPU-accelerated TTS with MLX Kokoro-82M")

        do {
            // 1. Load or create config
            logger.info("Loading configuration...")
            let config = try Config.load()
            logger.info("Port: \(config.port)")
            logger.info("Python: \(config.pythonPath)")
            logger.info("Worker script: \(config.workerScriptPath)")

            // 2. Start Python worker subprocess
            logger.info("Starting Python MLX worker...")
            let worker = PythonWorker(config: config)
            try await worker.start()

            // 3. Wait for model to load (with timeout)
            logger.info("Waiting for Kokoro model to warm up...")
            try await worker.waitUntilReady(timeout: 60.0)
            logger.info("Kokoro model loaded and ready")

            // 4. Start HTTP server
            logger.info("Starting HTTP server...")
            let server = HTTPServer(config: config, worker: worker)
            try await server.start()

            // 5. Save config for extension discovery
            try config.save()
            logger.info("Config saved to: \(Config.configFilePath.path)")

            // 6. Log ready status
            logger.info("================================")
            logger.info("Natural TTS Helper is ready!")
            logger.info("Listening on: http://127.0.0.1:\(config.port)")
            logger.info("Model: Kokoro-82M (MLX Metal)")
            logger.info("================================")

            // 7. Set up signal handling for graceful shutdown
            let signalSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
            signalSource.setEventHandler {
                logger.info("Received SIGTERM, shutting down gracefully...")
                Task {
                    await server.shutdown()
                    await worker.shutdown()
                    exit(0)
                }
            }
            signalSource.resume()
            signal(SIGTERM, SIG_IGN)

            // Handle SIGINT (Ctrl+C)
            let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
            intSource.setEventHandler {
                logger.info("Received SIGINT, shutting down gracefully...")
                Task {
                    await server.shutdown()
                    await worker.shutdown()
                    exit(0)
                }
            }
            intSource.resume()
            signal(SIGINT, SIG_IGN)

            // 8. Run server (blocks until shutdown)
            try await server.run()

        } catch {
            logger.error("Fatal error: \(error)")
            logger.error("Helper failed to start")
            exit(1)
        }
    }
}

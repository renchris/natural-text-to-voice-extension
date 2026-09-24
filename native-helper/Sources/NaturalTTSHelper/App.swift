import Foundation
import Logging

@main
struct NaturalTTSHelper {
    static func main() async {
        // A write to a worker that has exited must be an EPIPE error the
        // helper handles (PythonWorker.sendMessage), not a signal that kills it.
        signal(SIGPIPE, SIG_IGN)

        // Configure logging. In a terminal, each line is just the message (warnings and errors keep their level);
        // anywhere else (the brew services log file, a pipe) it keeps swift-log's full "timestamp level label"
        // format, which is what a log file needs.
        let interactive = isatty(STDOUT_FILENO) != 0
        LoggingSystem.bootstrap { label in
            if interactive {
                var handler = TerminalLogHandler()
                handler.logLevel = .info
                return handler
            }
            var handler = StreamLogHandler.standardOutput(label: label)
            handler.logLevel = .info
            return handler
        }

        let logger = Logger(label: "com.naturaltts.helper")

        // 0. Launch overrides (flags win over environment variables)
        let overrides: LaunchOverrides
        do {
            overrides = try LaunchOverrides.parse(
                arguments: Array(CommandLine.arguments.dropFirst()),
                environment: ProcessInfo.processInfo.environment
            )
        } catch ConfigError.helpRequested {
            print(LaunchOverrides.usage)
            exit(0)
        } catch {
            FileHandle.standardError.write(Data("natural-tts-helper: \(error)\n".utf8))
            exit(2)
        }

        // SIGTERM/SIGINT from here on: a bounded, clean exit (Shutdown.swift).
        let shutdown = ShutdownController(logger: logger)
        shutdown.install()

        logger.info("Natural TTS Helper \(HelperInfo.version) (API \(HelperInfo.apiVersion)) starting...")
        logger.info("Metal GPU-accelerated TTS with MLX Kokoro-82M")

        do {
            // 1. Load or create config
            logger.info("Loading configuration...")
            let resolved = try Config.load(overrides: overrides)
            var config = resolved.config
            logger.info("Config source: \(resolved.sourceDescription)")

            // 1a. Ensure configured port is bindable; fall back through 8249..8260
            //     unless the port was given explicitly (--port / NATURAL_TTS_PORT).
            if !Config.isPortAvailable(config.port) {
                if resolved.portIsExplicit {
                    logger.error("Port \(config.port) is in use and was set explicitly (--port/NATURAL_TTS_PORT, or a configured port outside \(Config.discoveryRange)); not scanning the fallback range. Free it or pick another.")
                    exit(1)
                }
                logger.warning("Configured port \(config.port) is in use, scanning fallback range...")
                guard let availablePort = Config.findAvailablePort() else {
                    let last = Config.preferredPort + Config.portRangeCount - 1
                    logger.error("All ports \(Config.preferredPort)..\(last) are in use. Free one and retry.")
                    exit(1)
                }
                config.port = availablePort
                if let persistURL = resolved.persistURL {
                    try config.save(to: persistURL)
                }
                logger.info("Falling back to port \(config.port)")
            }

            logger.info("Port: \(config.port)")
            logger.info("Python: \(config.pythonPath)")
            logger.info("Worker script: \(config.workerScriptPath)")

            // 2. Start Python worker subprocess
            logger.info("Starting Python MLX worker...")
            let worker = PythonWorker(config: config)
            shutdown.register(worker: worker)
            try await worker.start()

            // 3. Wait for model to load (with timeout)
            logger.info("Waiting for Kokoro model to warm up...")
            try await worker.waitUntilReady(timeout: 60.0)
            logger.info("Kokoro model loaded and ready")

            // 4. Start HTTP server
            logger.info("Starting HTTP server...")
            let server = HTTPServer(config: config, worker: worker)
            shutdown.register(server: server)
            try await server.start()

            // 5. Save config for extension discovery (never the shared file when
            //    an override was given; see LaunchOverrides)
            if let persistURL = resolved.persistURL {
                try config.save(to: persistURL)
                logger.info("Config saved to: \(persistURL.path)")
            } else {
                logger.info("Config not persisted (overrides given without NATURAL_TTS_CONFIG_DIR)")
            }

            // 6. Log ready status
            logger.info("================================")
            logger.info("Natural TTS Helper is ready!")
            logger.info("Listening on: http://127.0.0.1:\(config.port)")
            logger.info("Model: Kokoro-82M (MLX Metal)")
            logger.info("================================")

            // 7. Run server (blocks until the listener closes). On a signal the
            //    controller finishes stopping the worker and exits the process.
            try await server.run()
            if shutdown.inProgress { await shutdown.parkUntilExit() }

        } catch {
            if shutdown.inProgress { await shutdown.parkUntilExit() }
            logger.error("Fatal error: \(error)")
            logger.error("Helper failed to start")
            exit(1)
        }
    }
}

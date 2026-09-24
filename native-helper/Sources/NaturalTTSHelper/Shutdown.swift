import Foundation
import Logging
import os

/// SIGTERM / SIGINT handling: a clean exit within ~2 s that never leaves the
/// Python worker behind (`brew services stop` sends SIGTERM and relies on it).
///
/// Why it is built this way. The old handler ran `await server.shutdown()`
/// then `await worker.shutdown()` in a Task. Closing the listener made
/// `server.run()` return, so `main()` returned and the process exited in the
/// middle of that sequence: the worker was never told to stop (a busy one was
/// orphaned, still synthesising), and when the exit did not win the race the
/// helper sat at "Shutting down HTTP server" until the caller's SIGKILL (the
/// gate waits 5 s). Both shutdowns were actor-isolated, and the worker actor
/// is held for a whole synthesis by a blocking read, so nothing bounded them.
///
/// Now every step is nonisolated and bounded, runs on this controller's own
/// queue, and the controller alone exits the process:
/// 1. stop accepting connections;
/// 2. stop the worker (shutdown frame, then SIGTERM, then SIGKILL; ~1.5 s max);
/// 3. shut the event loops down (0.3 s max);
/// 4. exit(0).
/// A watchdog forces the exit (SIGKILL to the worker, then _exit) if the
/// sequence has not finished after `hardDeadline`. main() parks instead of
/// returning while a shutdown runs.
final class ShutdownController: @unchecked Sendable {
    /// Upper bound from the signal to the process being gone.
    static let hardDeadline: TimeInterval = 1.9

    private let logger: Logging.Logger
    private let queue = DispatchQueue(label: "com.naturaltts.helper.shutdown")
    private var sources: [DispatchSourceSignal] = []

    private struct Parts {
        var worker: PythonWorker?
        var server: HTTPServer?
        var started = false
    }
    private let parts = OSAllocatedUnfairLock(initialState: Parts())

    init(logger: Logging.Logger) {
        self.logger = logger
    }

    /// True once a signal has started the shutdown.
    var inProgress: Bool { parts.withLock { $0.started } }

    func register(worker: PythonWorker) { parts.withLock { $0.worker = worker } }
    func register(server: HTTPServer) { parts.withLock { $0.server = server } }

    /// Installs the handlers. Call before the worker starts, so a signal
    /// during warm-up also stops it.
    func install() {
        for (signo, name) in [(SIGTERM, "SIGTERM"), (SIGINT, "SIGINT")] {
            // Ignored as a signal, delivered as a dispatch event instead.
            signal(signo, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: signo, queue: queue)
            source.setEventHandler { [weak self] in self?.begin(name) }
            source.resume()
            sources.append(source)
        }
    }

    private func begin(_ name: String) {
        let (first, worker, server) = parts.withLock { state -> (Bool, PythonWorker?, HTTPServer?) in
            let first = !state.started
            state.started = true
            return (first, state.worker, state.server)
        }
        guard first else {
            logger.info("Received \(name) again; already shutting down")
            return
        }
        logger.info("Received \(name), shutting down gracefully...")

        let logger = self.logger
        DispatchQueue.global().asyncAfter(deadline: .now() + Self.hardDeadline) {
            logger.error("Shutdown still running after \(Self.hardDeadline)s; killing the worker and exiting")
            worker?.killForExit()
            fflush(stdout)
            _exit(0)
        }

        server?.stopListening()
        worker?.stopForExit()
        server?.shutdownEventLoops(timeout: 0.3)
        logger.info("Natural TTS Helper stopped")
        fflush(stdout)
        exit(0)
    }

    /// Never returns: main() waits here once run() has returned because of a
    /// shutdown, so the process ends by the controller's exit(0) and not
    /// before the worker has been stopped.
    func parkUntilExit() async -> Never {
        while true {
            try? await Task.sleep(for: .seconds(60))
        }
    }
}

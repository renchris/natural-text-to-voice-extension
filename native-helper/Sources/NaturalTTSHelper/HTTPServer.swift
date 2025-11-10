import Foundation
import Logging
import NIOCore
import NIOPosix
import NIOHTTP1

actor HTTPServer {
    private let logger = Logger(label: "com.naturaltts.helper.http")
    private let config: Config
    private let worker: PythonWorker

    private var channel: Channel?
    private var eventLoopGroup: MultiThreadedEventLoopGroup?
    private var requestCount = 0
    private let startTime = Date()

    init(config: Config, worker: PythonWorker) {
        self.config = config
        self.worker = worker
    }

    func start() async throws {
        logger.info("Starting HTTP server on 127.0.0.1:\(config.port)")

        let group = MultiThreadedEventLoopGroup(numberOfThreads: System.coreCount)
        self.eventLoopGroup = group

        let bootstrap = ServerBootstrap(group: group)
            .serverChannelOption(ChannelOptions.backlog, value: 256)
            .serverChannelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
            .childChannelInitializer { channel in
                channel.pipeline.configureHTTPServerPipeline().flatMap {
                    channel.pipeline.addHandler(HTTPHandler(server: self))
                }
            }
            .childChannelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
            .childChannelOption(ChannelOptions.maxMessagesPerRead, value: 1)

        do {
            let channel = try await bootstrap.bind(host: "127.0.0.1", port: config.port).get()
            self.channel = channel
            logger.info("HTTP server started successfully")
        } catch {
            logger.error("Failed to start HTTP server: \(error)")
            try await group.shutdownGracefully()
            throw error
        }
    }

    func run() async throws {
        guard let channel = channel else {
            throw NSError(domain: "HTTPServer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Server not started"])
        }

        logger.info("Server listening on 127.0.0.1:\(config.port)")

        // Wait for server to close
        try await channel.closeFuture.get()
    }

    func shutdown() async {
        logger.info("Shutting down HTTP server")

        if let channel = channel {
            try? await channel.close()
        }

        if let group = eventLoopGroup {
            try? await group.shutdownGracefully()
        }

        logger.info("HTTP server shut down")
    }

    // MARK: - Request Handling

    func handleRequest(head: HTTPRequestHead, body: ByteBuffer?) async -> (HTTPResponseHead, ByteBuffer?) {
        requestCount += 1
        logger.debug("[\(requestCount)] \(head.method) \(head.uri)")

        // Check authorization (optional for MVP)
        // if !checkAuth(head) {
        //     return unauthorized()
        // }

        switch (head.method, head.uri) {
        case (.GET, "/health"):
            return await handleHealth()

        case (.POST, "/speak"):
            return await handleSpeak(body: body)

        case (.GET, "/voices"):
            return await handleVoices()

        default:
            return notFound()
        }
    }

    private func handleHealth() async -> (HTTPResponseHead, ByteBuffer?) {
        let isReady = await worker.isReady
        let uptime = Date().timeIntervalSince(startTime)

        let response = HealthResponse(
            status: isReady ? "ok" : "warming",
            model: "kokoro-82m",
            modelLoaded: isReady,
            uptimeSeconds: uptime,
            requestsServed: requestCount
        )

        return jsonResponse(response, status: isReady ? .ok : .serviceUnavailable)
    }

    private func handleSpeak(body: ByteBuffer?) async -> (HTTPResponseHead, ByteBuffer?) {
        guard let body = body else {
            return badRequest("Missing request body")
        }

        // Parse JSON request
        let data: Data
        if let bytes = body.getBytes(at: 0, length: body.readableBytes) {
            data = Data(bytes)
        } else {
            return badRequest("Invalid request body")
        }

        guard let request = try? JSONDecoder().decode(SpeakRequest.self, from: data) else {
            return badRequest("Invalid JSON")
        }

        // Validate text
        guard !request.text.isEmpty else {
            return badRequest("Text cannot be empty")
        }

        guard request.text.count <= 5000 else {
            return badRequest("Text too long (max 5000 characters)")
        }

        // Generate audio
        do {
            let startTime = Date()
            let audio = try await worker.generate(
                text: request.text,
                voice: request.voice ?? config.defaultVoice,
                speed: request.speed ?? 1.0
            )
            let genTime = Date().timeIntervalSince(startTime)
            let rtf = audio.duration / genTime

            logger.info("Generated \(String(format: "%.2f", audio.duration))s audio in \(String(format: "%.2f", genTime))s (RTF: \(String(format: "%.2f", rtf))x)")

            // Create response with audio data
            var head = HTTPResponseHead(version: .http1_1, status: .ok)
            head.headers.add(name: "Content-Type", value: "audio/wav")
            head.headers.add(name: "X-Audio-Duration", value: String(audio.duration))
            head.headers.add(name: "X-Generation-Time", value: String(genTime))
            head.headers.add(name: "X-Real-Time-Factor", value: String(rtf))
            head.headers.add(name: "Access-Control-Allow-Origin", value: "*")

            var buffer = ByteBufferAllocator().buffer(capacity: audio.data.count)
            buffer.writeBytes(audio.data)

            return (head, buffer)

        } catch let error as WorkerError {
            logger.error("Generation failed: \(error.description)")
            let errorResponse = ErrorResponse(
                error: error.code,
                message: error.description,
                retryAfterSeconds: error.code == "warmup_timeout" ? 5 : nil
            )
            return jsonResponse(errorResponse, status: .internalServerError)

        } catch {
            logger.error("Unexpected error: \(error)")
            let errorResponse = ErrorResponse(
                error: "internal_error",
                message: error.localizedDescription,
                retryAfterSeconds: nil
            )
            return jsonResponse(errorResponse, status: .internalServerError)
        }
    }

    private func handleVoices() async -> (HTTPResponseHead, ByteBuffer?) {
        let voices = [
            Voice(id: "af_bella", name: "Bella (US)", language: "en-US"),
            Voice(id: "af_sarah", name: "Sarah (UK)", language: "en-GB"),
            Voice(id: "af_nicole", name: "Nicole (US)", language: "en-US"),
            Voice(id: "af_sky", name: "Sky (US)", language: "en-US"),
            Voice(id: "am_adam", name: "Adam (US)", language: "en-US"),
            Voice(id: "am_michael", name: "Michael (US)", language: "en-US")
        ]

        let response = VoicesResponse(voices: voices)
        return jsonResponse(response, status: .ok)
    }

    // MARK: - Response Helpers

    private func jsonResponse<T: Encodable>(_ data: T, status: HTTPResponseStatus) -> (HTTPResponseHead, ByteBuffer?) {
        guard let jsonData = try? JSONEncoder().encode(data) else {
            return internalError()
        }

        var head = HTTPResponseHead(version: .http1_1, status: status)
        head.headers.add(name: "Content-Type", value: "application/json")
        head.headers.add(name: "Access-Control-Allow-Origin", value: "*")

        var buffer = ByteBufferAllocator().buffer(capacity: jsonData.count)
        buffer.writeBytes(jsonData)

        return (head, buffer)
    }

    private func badRequest(_ message: String) -> (HTTPResponseHead, ByteBuffer?) {
        let error = ErrorResponse(error: "bad_request", message: message, retryAfterSeconds: nil)
        return jsonResponse(error, status: .badRequest)
    }

    private func notFound() -> (HTTPResponseHead, ByteBuffer?) {
        let error = ErrorResponse(error: "not_found", message: "Endpoint not found", retryAfterSeconds: nil)
        return jsonResponse(error, status: .notFound)
    }

    private func unauthorized() -> (HTTPResponseHead, ByteBuffer?) {
        let error = ErrorResponse(error: "unauthorized", message: "Invalid or missing auth token", retryAfterSeconds: nil)
        return jsonResponse(error, status: .unauthorized)
    }

    private func internalError() -> (HTTPResponseHead, ByteBuffer?) {
        var head = HTTPResponseHead(version: .http1_1, status: .internalServerError)
        head.headers.add(name: "Content-Type", value: "text/plain")
        return (head, nil)
    }
}

// MARK: - HTTP Handler

final class HTTPHandler: ChannelInboundHandler {
    typealias InboundIn = HTTPServerRequestPart
    typealias OutboundOut = HTTPServerResponsePart

    private let server: HTTPServer
    private var requestHead: HTTPRequestHead?
    private var bodyBuffer: ByteBuffer?

    init(server: HTTPServer) {
        self.server = server
    }

    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        let part = unwrapInboundIn(data)

        switch part {
        case .head(let head):
            requestHead = head
            bodyBuffer = nil

        case .body(var buffer):
            if bodyBuffer == nil {
                bodyBuffer = buffer
            } else {
                bodyBuffer?.writeBuffer(&buffer)
            }

        case .end:
            guard let head = requestHead else {
                context.close(promise: nil)
                return
            }

            // Save values before clearing
            let savedHead = head
            let savedBody = bodyBuffer

            // Handle request asynchronously
            Task {
                let (responseHead, responseBody) = await server.handleRequest(head: savedHead, body: savedBody)

                // Execute response writing on the EventLoop
                context.eventLoop.execute {
                    context.write(self.wrapOutboundOut(.head(responseHead)), promise: nil)

                    if let body = responseBody {
                        context.write(self.wrapOutboundOut(.body(.byteBuffer(body))), promise: nil)
                    }

                    context.writeAndFlush(self.wrapOutboundOut(.end(nil))).whenComplete { _ in
                        context.close(promise: nil)
                    }
                }
            }

            requestHead = nil
            bodyBuffer = nil
        }
    }
}

import Foundation
import Logging
import NIOCore
import NIOPosix
import NIOHTTP1

actor HTTPServer {
    private let logger = Logger(label: "com.naturaltts.helper.http")
    private let config: Config
    private let worker: PythonWorker
    /// config.port, readable from the channel handler without entering the actor.
    nonisolated let port: Int

    /// Largest request body buffered. A /speak body is 5,000 characters of
    /// JSON; anything past this is answered 413 without reading the rest.
    static let maxBodyBytes = 1024 * 1024
    /// Largest request text in UTF-8 bytes. The 5,000 limit counts grapheme
    /// clusters, and one cluster can be kilobytes ("e" + 1,100 combining
    /// accents): 5,000 of them made an 11 MB worker frame, past the worker's
    /// 10 MB frame limit.
    static let maxTextBytes = 100_000

    private var channel: Channel?
    private var eventLoopGroup: MultiThreadedEventLoopGroup?
    private var requestCount = 0
    private let startTime = Date()

    init(config: Config, worker: PythonWorker) {
        self.config = config
        self.worker = worker
        self.port = config.port
    }

    func start() async throws {
        logger.info("Starting HTTP server on 127.0.0.1:\(config.port)")

        let group = MultiThreadedEventLoopGroup(numberOfThreads: System.coreCount)
        self.eventLoopGroup = group

        let bootstrap = ServerBootstrap(group: group)
            .serverChannelOption(ChannelOptions.backlog, value: 256)
            .serverChannelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
            .childChannelInitializer { channel in
                // No pipelining assistance: it stops reading once a request
                // has ended, so a client that disconnects mid-synthesis went
                // unnoticed until the response was written. One request per
                // connection (HTTPHandler closes after each response).
                channel.pipeline.configureHTTPServerPipeline(withPipeliningAssistance: false).flatMap {
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

        let origin = head.headers.first(name: "Origin")
        if let rejection = rejection(for: head) {
            return rejection
        }

        switch (head.method, head.uri) {
        case (.GET, "/health"):
            return await handleHealth(origin: origin)

        case (.POST, "/speak"):
            return await handleSpeak(body: body, origin: origin)

        case (.GET, "/voices"):
            return await handleVoices(origin: origin)

        default:
            return notFound(origin: origin)
        }
    }

    /// The Host and Origin gates. Needs only the request head, so HTTPHandler
    /// runs it as soon as the head arrives and a rejected request is answered
    /// without buffering its body (a 400 MB body used to be read in full
    /// before the 403). handleRequest runs it again.
    nonisolated func rejection(for head: HTTPRequestHead) -> (HTTPResponseHead, ByteBuffer?)? {
        // DNS-rebinding defence, on every endpoint. A web page that rebinds
        // its own hostname to 127.0.0.1 reaches this port as a same-origin
        // request, so neither CORS nor the Origin check below stops it, but
        // the browser still sends the page's hostname as Host. Only loopback
        // names with our own port are accepted.
        let host = head.headers.first(name: "Host")
        guard isAllowedHost(host) else {
            logger.warning("Rejected request with Host \(host.map { String($0.prefix(100)) } ?? "<missing>") on \(head.uri)")
            let error = ErrorResponse(
                error: "bad_host",
                message: "Host must be 127.0.0.1:\(port), localhost:\(port) or [::1]:\(port)",
                retryAfterSeconds: nil
            )
            return jsonResponse(error, status: .forbidden, origin: nil)
        }

        let origin = head.headers.first(name: "Origin")

        // Origin policy (the privacy policy describes this, keep them in step):
        // - /speak and /voices: a browser request carrying a web-page Origin
        //   (https://…, http://…, "null", anything not an extension scheme) is
        //   rejected with 403, so no website can make the helper read text or
        //   list voices. chrome-extension:// (and the moz-/safari- extension
        //   schemes) are allowed and get Access-Control-Allow-Origin.
        // - Requests with NO Origin header are allowed. Browsers attach Origin
        //   to every cross-origin fetch and to every POST, so a missing Origin
        //   means a local process run by a user on this Mac (curl, a script):
        //   the helper binds 127.0.0.1 only and treats local processes as
        //   trusted, like any other per-user loopback service.
        // - /health is open to any Origin: the extension probes it during
        //   discovery, it reveals only status/version, and without an ACAO
        //   header a web page cannot read the response anyway.
        if head.uri == "/speak" || head.uri == "/voices" {
            if let origin = origin, !isExtensionOrigin(origin) {
                logger.warning("Rejected non-extension origin on \(head.uri): \(origin.prefix(100))")
                return forbidden(origin: nil)
            }
        }
        return nil
    }

    /// 413 for a body past maxBodyBytes. "too long" in the message is what the
    /// extension maps to its text-too-long advice.
    nonisolated func payloadTooLarge(origin: String?) -> (HTTPResponseHead, ByteBuffer?) {
        logger.warning("Rejected a request body over \(Self.maxBodyBytes) bytes")
        let error = ErrorResponse(
            error: "payload_too_large",
            message: "Request too long (max \(Self.maxBodyBytes) bytes)",
            retryAfterSeconds: nil
        )
        return jsonResponse(error, status: .payloadTooLarge, origin: origin)
    }

    private func handleHealth(origin: String?) async -> (HTTPResponseHead, ByteBuffer?) {
        let state = worker.healthState
        let uptime = Date().timeIntervalSince(startTime)

        // "error": the worker died too often and was not restarted; unlike
        // "warming" it will not clear without restarting the helper.
        let status: String
        switch state {
        case .ready: status = "ok"
        case .starting: status = "warming"
        case .failed: status = "error"
        }

        let response = HealthResponse(
            status: status,
            model: "kokoro-82m",
            modelLoaded: state == .ready,
            uptimeSeconds: uptime,
            requestsServed: requestCount,
            version: HelperInfo.version,
            apiVersion: HelperInfo.apiVersion
        )

        // Always return 200 so the extension can read .status and
        // distinguish "warming" from "not running". Treating warmup as 503
        // makes the extension's makeRequest throw InvalidResponseError
        // before it can inspect the body — losing the warming signal.
        return jsonResponse(response, status: .ok, origin: origin)
    }

    private func handleSpeak(body: ByteBuffer?, origin: String?) async -> (HTTPResponseHead, ByteBuffer?) {
        guard let body = body else {
            return badRequest("Missing request body", origin: origin)
        }

        // Parse JSON request
        let data: Data
        if let bytes = body.getBytes(at: 0, length: body.readableBytes) {
            data = Data(bytes)
        } else {
            return badRequest("Invalid request body", origin: origin)
        }

        guard let request = try? JSONDecoder().decode(SpeakRequest.self, from: data) else {
            return badRequest("Invalid JSON", origin: origin)
        }

        // Validate text
        guard !request.text.isEmpty else {
            return badRequest("Text cannot be empty", origin: origin)
        }

        guard request.text.count <= 5000, request.text.utf8.count <= Self.maxTextBytes else {
            return badRequest("Text too long (max 5000 characters, \(Self.maxTextBytes) bytes)", origin: origin)
        }

        // Validate voice against the catalogue. An unknown ID used to reach
        // the worker and come back as a 500 that leaked the Hub URL.
        let voice: String
        if let requested = request.voice {
            guard VoiceCatalogue.contains(requested) else {
                let error = ErrorResponse(
                    error: "unknown_voice",
                    message: "Unknown voice '\(requested)'. GET /voices lists the supported IDs.",
                    retryAfterSeconds: nil
                )
                return jsonResponse(error, status: .badRequest, origin: origin)
            }
            voice = requested
        } else if VoiceCatalogue.contains(config.defaultVoice) {
            voice = config.defaultVoice
        } else {
            voice = VoiceCatalogue.fallbackVoice
        }

        // Generate audio
        do {
            let startTime = Date()
            let audio = try await worker.generate(
                text: request.text,
                voice: voice,
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
            for (name, value) in corsHeaders(for: origin) {
                head.headers.add(name: name, value: value)
            }

            var buffer = ByteBufferAllocator().buffer(capacity: audio.data.count)
            buffer.writeBytes(audio.data)

            return (head, buffer)

        } catch is CancellationError {
            // The client disconnected; nobody reads this response.
            logger.info("Request cancelled: the client went away")
            let errorResponse = ErrorResponse(error: "cancelled", message: "Request cancelled", retryAfterSeconds: nil)
            return jsonResponse(errorResponse, status: .internalServerError, origin: origin)

        } catch let error as WorkerError {
            // PythonWorker already redacts a generationFailed message; redact
            // again so this line never depends on where the error came from.
            logger.error("Generation failed: \(worker.redactor.redact(error.description))")
            let errorResponse = ErrorResponse(
                error: error.code,
                message: error.description,
                retryAfterSeconds: error.code == "warmup_timeout" ? 5 : nil
            )
            return jsonResponse(errorResponse, status: .internalServerError, origin: origin)

        } catch {
            logger.error("Unexpected error: \(worker.redactor.redact(String(describing: error)))")
            let errorResponse = ErrorResponse(
                error: "internal_error",
                message: error.localizedDescription,
                retryAfterSeconds: nil
            )
            return jsonResponse(errorResponse, status: .internalServerError, origin: origin)
        }
    }

    private func handleVoices(origin: String?) async -> (HTTPResponseHead, ByteBuffer?) {
        let response = VoicesResponse(voices: VoiceCatalogue.voices)
        return jsonResponse(response, status: .ok, origin: origin)
    }

    // MARK: - CORS / Origin / Host

    private nonisolated func isAllowedHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == "127.0.0.1:\(port)" || host == "localhost:\(port)" || host == "[::1]:\(port)"
    }

    private nonisolated func isExtensionOrigin(_ origin: String) -> Bool {
        return origin.hasPrefix("chrome-extension://") ||
               origin.hasPrefix("moz-extension://") ||
               origin.hasPrefix("safari-web-extension://")
    }

    private nonisolated func corsHeaders(for origin: String?) -> [(String, String)] {
        guard let origin = origin, isExtensionOrigin(origin) else { return [] }
        return [
            ("Access-Control-Allow-Origin", origin),
            ("Vary", "Origin"),
        ]
    }

    // MARK: - Response Helpers

    private nonisolated func jsonResponse<T: Encodable>(_ data: T, status: HTTPResponseStatus, origin: String? = nil) -> (HTTPResponseHead, ByteBuffer?) {
        guard let jsonData = try? JSONEncoder().encode(data) else {
            return internalError()
        }

        var head = HTTPResponseHead(version: .http1_1, status: status)
        head.headers.add(name: "Content-Type", value: "application/json")
        for (name, value) in corsHeaders(for: origin) {
            head.headers.add(name: name, value: value)
        }

        var buffer = ByteBufferAllocator().buffer(capacity: jsonData.count)
        buffer.writeBytes(jsonData)

        return (head, buffer)
    }

    private nonisolated func badRequest(_ message: String, origin: String? = nil) -> (HTTPResponseHead, ByteBuffer?) {
        let error = ErrorResponse(error: "bad_request", message: message, retryAfterSeconds: nil)
        return jsonResponse(error, status: .badRequest, origin: origin)
    }

    private nonisolated func notFound(origin: String? = nil) -> (HTTPResponseHead, ByteBuffer?) {
        let error = ErrorResponse(error: "not_found", message: "Endpoint not found", retryAfterSeconds: nil)
        return jsonResponse(error, status: .notFound, origin: origin)
    }

    private nonisolated func forbidden(origin: String? = nil) -> (HTTPResponseHead, ByteBuffer?) {
        let error = ErrorResponse(error: "forbidden", message: "Origin not allowed", retryAfterSeconds: nil)
        return jsonResponse(error, status: .forbidden, origin: origin)
    }

    private nonisolated func internalError() -> (HTTPResponseHead, ByteBuffer?) {
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
    /// Set once this request has been answered early (Host/Origin rejection
    /// or an oversized body): the rest of it is ignored, not buffered.
    private var answered = false
    /// The request being handled; cancelled when the client disconnects, so
    /// a /speak nobody will read stops queueing for, or occupying, the worker.
    private var inflight: Task<Void, Never>?
    /// One request per connection: anything after the first request's end
    /// (a pipelined request) is ignored; the connection closes after the reply.
    private var requestDone = false

    init(server: HTTPServer) {
        self.server = server
    }

    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        let part = unwrapInboundIn(data)
        guard !requestDone else { return }

        switch part {
        case .head(let head):
            requestHead = head
            bodyBuffer = nil
            answered = false
            if let rejection = server.rejection(for: head) {
                answered = true
                respond(context: context, rejection)
            }

        case .body(var buffer):
            guard !answered else { return }
            if (bodyBuffer?.readableBytes ?? 0) + buffer.readableBytes > HTTPServer.maxBodyBytes {
                answered = true
                bodyBuffer = nil
                respond(context: context, server.payloadTooLarge(origin: requestHead?.headers.first(name: "Origin")))
                return
            }
            if bodyBuffer == nil {
                bodyBuffer = buffer
            } else {
                bodyBuffer?.writeBuffer(&buffer)
            }

        case .end:
            defer {
                requestHead = nil
                bodyBuffer = nil
                answered = false
            }
            requestDone = true
            guard !answered else { return }
            guard let head = requestHead else {
                context.close(promise: nil)
                return
            }

            // Save values before clearing
            let savedHead = head
            let savedBody = bodyBuffer

            // Handle request asynchronously
            inflight = Task {
                let response = await server.handleRequest(head: savedHead, body: savedBody)

                // Execute response writing on the EventLoop
                context.eventLoop.execute {
                    self.respond(context: context, response)
                }
            }
        }
    }

    func channelInactive(context: ChannelHandlerContext) {
        inflight?.cancel()
        inflight = nil
        context.fireChannelInactive()
    }

    /// Write a whole response and close the connection. Event loop only.
    private func respond(context: ChannelHandlerContext, _ response: (HTTPResponseHead, ByteBuffer?)) {
        let (responseHead, responseBody) = response
        context.write(wrapOutboundOut(.head(responseHead)), promise: nil)
        if let body = responseBody {
            context.write(wrapOutboundOut(.body(.byteBuffer(body))), promise: nil)
        }
        context.writeAndFlush(wrapOutboundOut(.end(nil))).whenComplete { _ in
            context.close(promise: nil)
        }
    }
}

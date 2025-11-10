import Foundation

// MARK: - Request/Response Models

struct SpeakRequest: Codable {
    let text: String
    let voice: String?
    let speed: Float?

    enum CodingKeys: String, CodingKey {
        case text, voice, speed
    }
}

struct HealthResponse: Codable {
    let status: String
    let model: String
    let modelLoaded: Bool
    let uptimeSeconds: Double
    let requestsServed: Int

    enum CodingKeys: String, CodingKey {
        case status, model
        case modelLoaded = "model_loaded"
        case uptimeSeconds = "uptime_seconds"
        case requestsServed = "requests_served"
    }
}

struct Voice: Codable {
    let id: String
    let name: String
    let language: String
}

struct VoicesResponse: Codable {
    let voices: [Voice]
}

struct ErrorResponse: Codable {
    let error: String
    let message: String
    let retryAfterSeconds: Int?

    enum CodingKeys: String, CodingKey {
        case error, message
        case retryAfterSeconds = "retry_after_seconds"
    }
}

// MARK: - Python Worker Protocol

struct GenerateRequest: Codable {
    let text: String
    let voice: String
    let speed: Float
}

struct GenerateResponse: Codable {
    let audioBase64: String?
    let duration: Double?
    let sampleRate: Int?
    let format: String?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case audioBase64 = "audio_base64"
        case duration
        case sampleRate = "sample_rate"
        case format, error
    }
}

// MARK: - Audio Data

struct AudioData {
    let data: Data
    let duration: Double
    let sampleRate: Int
    let format: String
}

// MARK: - Errors

enum WorkerError: Error, CustomStringConvertible {
    case processNotRunning
    case warmupTimeout
    case tooManyRestarts
    case generationFailed(String)
    case invalidResponse

    var description: String {
        switch self {
        case .processNotRunning:
            return "Python worker process not running"
        case .warmupTimeout:
            return "Model warmup timed out"
        case .tooManyRestarts:
            return "Too many subprocess restarts"
        case .generationFailed(let msg):
            return "Audio generation failed: \(msg)"
        case .invalidResponse:
            return "Invalid response from Python worker"
        }
    }

    var code: String {
        switch self {
        case .processNotRunning: return "process_not_running"
        case .warmupTimeout: return "warmup_timeout"
        case .tooManyRestarts: return "too_many_restarts"
        case .generationFailed: return "generation_failed"
        case .invalidResponse: return "invalid_response"
        }
    }
}

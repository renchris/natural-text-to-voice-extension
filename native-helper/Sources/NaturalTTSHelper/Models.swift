import Foundation

// MARK: - Request/Response Models

struct SpeakRequest: Codable {
    let text: String
    let voice: String?
    /// Double, not Float: 1e39 still decodes, so it is refused as
    /// invalid_speed rather than as unparseable JSON.
    let speed: Double?

    enum CodingKeys: String, CodingKey {
        case text, voice, speed
    }
}

/// Identity reported by /health.
enum HelperInfo {
    static let version = "1.5.0"
    /// Bumped when the HTTP contract changes. 2 = the 28-voice catalogue with
    /// accent/gender/grade, 400 unknown_voice, and the Host-header check.
    /// A helper without the field is API 1.
    static let apiVersion = 2
}

struct HealthResponse: Codable {
    let status: String
    let model: String
    let modelLoaded: Bool
    let uptimeSeconds: Double
    let requestsServed: Int
    let version: String
    let apiVersion: Int

    enum CodingKeys: String, CodingKey {
        case status, model, version
        case modelLoaded = "model_loaded"
        case uptimeSeconds = "uptime_seconds"
        case requestsServed = "requests_served"
        case apiVersion // camelCase on the wire, as the extension reads it
    }
}

struct Voice: Codable, Equatable {
    let id: String
    /// Display label, e.g. "Heart (US)".
    let name: String
    /// BCP 47 tag: "en-US" for a*, "en-GB" for b*.
    let language: String
    /// "American" or "British".
    let accent: String
    /// "female" or "male".
    let gender: String
    /// Overall grade from Kokoro's grade sheet (hexgrad/Kokoro-82M VOICES.md).
    let grade: String

    init(_ id: String, _ name: String, grade: String) {
        let american = id.hasPrefix("a")
        self.id = id
        self.name = "\(name) (\(american ? "US" : "UK"))"
        self.language = american ? "en-US" : "en-GB"
        self.accent = american ? "American" : "British"
        self.gender = id.dropFirst().hasPrefix("f") ? "female" : "male"
        self.grade = grade
    }
}

/// The single source of truth for the voices this helper serves: the 28
/// English Kokoro-82M voices (a* American, b* British), grouped and ordered
/// by grade within each group. /voices returns exactly this list and /speak
/// rejects any other ID with 400 unknown_voice. The extension's
/// src/shared/voices.ts mirrors it and can be checked against GET /voices.
/// Non-English voices stay out until normalize_text stops ASCII-folding.
/// Never remove a voice: a stored am_adam or af_sky must keep working.
enum VoiceCatalogue {
    static let voices: [Voice] = [
        // American female
        Voice("af_heart", "Heart", grade: "A"),
        Voice("af_bella", "Bella", grade: "A-"),
        Voice("af_nicole", "Nicole", grade: "B-"),
        Voice("af_aoede", "Aoede", grade: "C+"),
        Voice("af_kore", "Kore", grade: "C+"),
        Voice("af_sarah", "Sarah", grade: "C+"),
        Voice("af_alloy", "Alloy", grade: "C"),
        Voice("af_nova", "Nova", grade: "C"),
        Voice("af_sky", "Sky", grade: "C-"),
        Voice("af_jessica", "Jessica", grade: "D"),
        Voice("af_river", "River", grade: "D"),
        // American male
        Voice("am_fenrir", "Fenrir", grade: "C+"),
        Voice("am_michael", "Michael", grade: "C+"),
        Voice("am_puck", "Puck", grade: "C+"),
        Voice("am_echo", "Echo", grade: "D"),
        Voice("am_eric", "Eric", grade: "D"),
        Voice("am_liam", "Liam", grade: "D"),
        Voice("am_onyx", "Onyx", grade: "D"),
        Voice("am_santa", "Santa", grade: "D-"),
        Voice("am_adam", "Adam", grade: "F+"),
        // British female
        Voice("bf_emma", "Emma", grade: "B-"),
        Voice("bf_isabella", "Isabella", grade: "C"),
        Voice("bf_alice", "Alice", grade: "D"),
        Voice("bf_lily", "Lily", grade: "D"),
        // British male
        Voice("bm_fable", "Fable", grade: "C"),
        Voice("bm_george", "George", grade: "C"),
        Voice("bm_lewis", "Lewis", grade: "D+"),
        Voice("bm_daniel", "Daniel", grade: "D"),
    ]

    /// The voice a NEW install speaks with (OD-5: af_heart, grade A). Written
    /// into a freshly created config.json; an existing config's
    /// default_voice, and any voice a request names, is left as it is.
    static let defaultVoice = "af_heart"

    /// Used when a request names no voice and the configured default_voice
    /// is not in the catalogue.
    static let fallbackVoice = defaultVoice

    private static let ids = Set(voices.map(\.id))

    static func contains(_ id: String) -> Bool { ids.contains(id) }
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
    /// Unique per request; the worker stops a request whose id appears in its
    /// cancel file (PythonWorker.cancel).
    let id: UInt64
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

    /// The code /speak answers with. A worker failure carries the worker's
    /// own code ("invalid_speed", or "internal_error" for
    /// "internal_error: OverflowError"), not a generic "generation_failed".
    var code: String {
        switch self {
        case .processNotRunning: return "process_not_running"
        case .warmupTimeout: return "warmup_timeout"
        case .tooManyRestarts: return "too_many_restarts"
        case .generationFailed(let msg): return Self.workerCode(msg)
        case .invalidResponse: return "invalid_response"
        }
    }

    /// HTTP status for this failure: 400 when the request itself is at fault,
    /// 503 while the engine is down or still warming up (retrying later can
    /// succeed), 500 for anything else that failed on the helper's side.
    var httpStatus: Int {
        switch self {
        case .processNotRunning, .warmupTimeout, .tooManyRestarts: return 503
        case .invalidResponse: return 500
        case .generationFailed:
            return Self.clientErrorCodes.contains(code) ? 400 : 500
        }
    }

    /// Worker error codes caused by the request: a different request succeeds.
    /// audio_too_long is the audio-side twin of text_too_long (the text makes
    /// more than MAX_AUDIO_SECONDS of speech at this speed).
    static let clientErrorCodes: Set<String> = [
        "invalid_speed", "empty_text", "text_too_long", "audio_too_long",
        "unknown_voice", "bad_request",
    ]

    /// "internal_error: OverflowError" -> "internal_error"; "nan_audio" -> "nan_audio".
    static func workerCode(_ message: String) -> String {
        let head = message.split(separator: ":", maxSplits: 1).first.map(String.init) ?? message
        let code = head.trimmingCharacters(in: .whitespaces)
        return code.isEmpty ? "generation_failed" : code
    }
}

/**
 * Native TTS Helper Configuration
 * Stored in ~/Library/Application Support/NaturalTTS/config.json
 */
export interface HelperConfig {
  port: number;
  secret: string;
  python_path: string;
  worker_script_path: string;
  default_voice: string;
}

/**
 * Health check response from native helper
 */
export interface HealthResponse {
  status: string;
  model: string;
  model_loaded: boolean;
  uptime_seconds: number;
  requests_served: number;
}

/**
 * Voice definition
 */
export interface Voice {
  id: string;
  name: string;
  language: string;
}

/**
 * Request parameters for text-to-speech generation
 */
export interface SpeakRequest {
  text: string;
  voice?: string;  // Default: "af_bella"
  speed?: number;  // Default: 1.0, range: 0.5-2.0
}

/**
 * Native TTS Client interface
 */
export interface NativeTTSClient {
  /**
   * Check if native helper is running and responsive
   */
  checkHealth(): Promise<HealthResponse>;

  /**
   * Get list of available voices
   */
  getVoices(): Promise<Voice[]>;

  /**
   * Generate speech from text
   * @param request - Text and optional voice/speed parameters
   * @returns Audio blob in WAV format
   */
  speak(request: SpeakRequest): Promise<Blob>;
}

/**
 * Custom error types for better error handling
 */
export class HelperNotFoundError extends Error {
  constructor(message: string = 'Native TTS Helper not found. Please ensure the helper is running.') {
    super(message);
    this.name = 'HelperNotFoundError';
  }
}

export class ConfigNotFoundError extends Error {
  constructor(message: string = 'Config file not found. Please start the Native TTS Helper first.') {
    super(message);
    this.name = 'ConfigNotFoundError';
  }
}

export class NetworkTimeoutError extends Error {
  constructor(message: string = 'Request to Native TTS Helper timed out.') {
    super(message);
    this.name = 'NetworkTimeoutError';
  }
}

export class InvalidResponseError extends Error {
  constructor(message: string = 'Invalid response from Native TTS Helper.') {
    super(message);
    this.name = 'InvalidResponseError';
  }
}

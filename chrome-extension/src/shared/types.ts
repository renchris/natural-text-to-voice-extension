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
  voice?: string;  // Default: DEFAULT_VOICE (src/shared/voices.ts)
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

/**
 * =============================================================================
 * Extension Message Types (Phase 2.4/2.5)
 * =============================================================================
 * Message passing between popup, background, and offscreen
 */

/**
 * Messages sent from Background to Offscreen Document
 */
export interface SpeakInOffscreenMessage {
  type: 'SPEAK_IN_OFFSCREEN';
  text: string;
  voice: string;
  speed: number;
}

/**
 * Stop whatever is being spoken. Sent by the service worker (stop-speaking
 * command) to every extension page: the offscreen document stops and settles
 * its pending speak request, and an open popup stops its own playback.
 */
export interface StopInOffscreenMessage {
  type: 'STOP_IN_OFFSCREEN';
}

/**
 * Response from Offscreen Document to Background.
 * SPEAK_STOPPED settles a speak request that was cut short by a stop (or
 * superseded by a newer request); it is not a failure.
 */
export interface OffscreenSpeakResponse {
  type: 'SPEAK_COMPLETE' | 'SPEAK_STOPPED' | 'SPEAK_ERROR';
  success: boolean;
  error?: string;
}

/**
 * Response from Offscreen Document to a STOP_IN_OFFSCREEN message
 */
export interface OffscreenStopResponse {
  type: 'STOPPED';
  /** true when something was generating or playing and has been stopped */
  stopped: boolean;
}

/**
 * Sent by the offscreen document to the service worker once nothing has been
 * generating or playing for a while. With the BLOBS reason Chrome never
 * closes the document by itself, so the service worker closes it on this.
 */
export interface OffscreenIdleMessage {
  type: 'OFFSCREEN_IDLE';
}

/**
 * Union type for all offscreen document messages
 */
export type OffscreenMessage =
  | SpeakInOffscreenMessage
  | StopInOffscreenMessage
  | OffscreenIdleMessage
  | OffscreenSpeakResponse;

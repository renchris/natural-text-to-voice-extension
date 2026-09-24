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
  /** Helper HTTP API version; absent before v1.5 (see helper-version.ts) */
  apiVersion?: number;
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
  speak(request: SpeakRequest, signal?: AbortSignal): Promise<Blob>;
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

/**
 * The caller aborted the request (Stop, or a newer speak request superseding
 * it). Not a failure: nothing is shown to the user.
 */
export class RequestAbortedError extends Error {
  constructor(message: string = 'Request aborted.') {
    super(message);
    this.name = 'RequestAbortedError';
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
 * Response from Offscreen Document to Background, sent as soon as the request
 * reaches playback or ends before it: SPEAK_STARTED once audio is playing
 * (the outcome follows later as SPEAK_FINISHED), SPEAK_ERROR if synthesis or
 * the start of playback failed, SPEAK_STOPPED if a stop (or a newer request)
 * cut it short first; a stop is not a failure. SPEAK_COMPLETE is the outcome
 * of a request that finished without ever reporting SPEAK_STARTED.
 *
 * The reply never waits for playback to end: a sendMessage held open past
 * ~5 minutes is dropped when Chrome stops the service worker, and a 5,000-
 * character selection plays for ~5.5 minutes at 1.0x.
 */
export interface OffscreenSpeakResponse {
  type: 'SPEAK_STARTED' | 'SPEAK_COMPLETE' | 'SPEAK_STOPPED' | 'SPEAK_ERROR';
  success: boolean;
  error?: string;
}

/**
 * Sent by the offscreen document, one way, when a request that already
 * answered SPEAK_STARTED ends: played to the end or stopped (success), or
 * failed mid-playback (error).
 */
export interface SpeakFinishedMessage {
  type: 'SPEAK_FINISHED';
  success: boolean;
  stopped?: boolean;
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
 * Asked by the popup when it opens: is the offscreen document speaking (a
 * right-click or shortcut request)? Answered with OffscreenStatusResponse.
 */
export interface OffscreenStatusQuery {
  type: 'OFFSCREEN_STATUS_QUERY';
}

export interface OffscreenStatusResponse {
  type: 'OFFSCREEN_STATUS';
  speaking: boolean;
}

/**
 * Broadcast by the offscreen document when it starts or stops serving a
 * speak request, so an open popup can show (and drop) its Stop button.
 */
export interface OffscreenActivityMessage {
  type: 'OFFSCREEN_ACTIVITY';
  speaking: boolean;
}

/**
 * Union type for all offscreen document messages
 */
export type OffscreenMessage =
  | SpeakInOffscreenMessage
  | StopInOffscreenMessage
  | OffscreenIdleMessage
  | SpeakFinishedMessage
  | OffscreenStatusQuery
  | OffscreenActivityMessage
  | OffscreenSpeakResponse;

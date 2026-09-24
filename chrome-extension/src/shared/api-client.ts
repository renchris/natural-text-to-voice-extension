import {
  NativeTTSClient,
  HealthResponse,
  Voice,
  SpeakRequest,
  HelperConfig,
  HelperNotFoundError,
  NetworkTimeoutError,
  InvalidResponseError,
  RequestAbortedError,
} from './types';
import { getConfig } from './config';
import { DEFAULT_VOICE } from './voices';
import { errorFromResponse } from './helper-errors';

export { HelperError, userMessageForError } from './helper-errors';

/**
 * Timeout for POST /speak, scaled by text length: 30 s plus 15 ms per
 * character, capped at 120 s. A flat 30 s was the real ceiling for long
 * selections; a 4,985-character request took 45 s under GPU contention.
 */
export function speakTimeoutMs(text: string): number {
  return Math.min(120000, 30000 + 15 * text.length);
}

/**
 * HTTP client for Native TTS Helper API
 */
export class ApiClient implements NativeTTSClient {
  private config: Partial<HelperConfig> | null = null;
  private configPromise: Promise<Partial<HelperConfig>> | null = null;

  /**
   * Get configuration (lazy loaded and cached)
   */
  private async getConfig(): Promise<Partial<HelperConfig>> {
    if (this.config) {
      return this.config;
    }

    if (!this.configPromise) {
      this.configPromise = getConfig();
    }

    this.config = await this.configPromise;
    return this.config;
  }

  /**
   * Get base URL for API requests
   */
  private async getBaseUrl(): Promise<string> {
    const config = await this.getConfig();
    if (!config.port) {
      throw new HelperNotFoundError('No port configured for Native TTS Helper');
    }
    return `http://127.0.0.1:${config.port}`;
  }

  /**
   * Make HTTP request with retry logic and error handling
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    timeout: number = 10000,
    maxRetries: number = 2
  ): Promise<T> {
    // Get config and convert ConfigNotFoundError to HelperNotFoundError
    let config;
    try {
      config = await this.getConfig();
    } catch (error) {
      if (error instanceof Error && error.name === 'ConfigNotFoundError') {
        throw new HelperNotFoundError(error.message);
      }
      throw error;
    }

    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    let lastError: Error | null = null;

    // Never retry a POST: a /speak that failed after reaching the helper may
    // still be synthesising, and a retry would generate the speech twice.
    const method = (options.method ?? 'GET').toUpperCase();
    const retries = method === 'POST' ? 0 : maxRetries;

    // The caller's signal (Stop / supersede) aborts the fetch too. Closing
    // the connection is what tells the helper to stop synthesising.
    const callerSignal = options.signal ?? undefined;
    if (callerSignal?.aborted) {
      throw new RequestAbortedError();
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const onCallerAbort = () => controller.abort();
      callerSignal?.addEventListener('abort', onCallerAbort);
      try {
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          ...(options.headers as Record<string, string> || {}),
        };

        // Add secret header if available
        if (config.secret) {
          headers['X-Secret'] = config.secret;
        }

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          // A helper error body ({"error": code}) becomes a HelperError with
          // that code; anything else stays a generic InvalidResponseError.
          throw await errorFromResponse(response, endpoint);
        }

        // For speak endpoint, return blob
        if (endpoint === '/speak') {
          return await response.blob() as T;
        }

        // For other endpoints, parse JSON
        const data = await response.json();
        return data as T;

      } catch (error) {
        lastError = error as Error;

        if (callerSignal?.aborted) {
          throw new RequestAbortedError();
        }

        // Don't retry on certain errors
        if (
          error instanceof InvalidResponseError ||
          (error as Error).name === 'AbortError'
        ) {
          if ((error as Error).name === 'AbortError') {
            throw new NetworkTimeoutError(`Request to ${endpoint} timed out after ${timeout}ms`);
          }
          throw error;
        }

        // Retry on network errors (GET only, see above)
        if (attempt < retries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
      } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', onCallerAbort);
      }
    }

    // All retries failed
    if (lastError) {
      if (lastError.message.includes('fetch')) {
        throw new HelperNotFoundError(
          'Unable to connect to Native TTS Helper. Please ensure it is running.'
        );
      }
      throw lastError;
    }

    throw new HelperNotFoundError('Failed to connect to Native TTS Helper');
  }

  /**
   * Check if native helper is running and responsive
   */
  async checkHealth(): Promise<HealthResponse> {
    return await this.makeRequest<HealthResponse>('/health', {
      method: 'GET',
    }, 10000);
  }

  /**
   * Get list of available voices
   */
  async getVoices(): Promise<Voice[]> {
    const response = await this.makeRequest<{ voices: Voice[] }>('/voices', {
      method: 'GET',
    }, 10000);
    return response.voices;
  }

  /**
   * Generate speech from text
   * @param request - Text and optional voice/speed parameters
   * @param signal - Aborts the request (RequestAbortedError); the helper then
   *   stops the synthesis at its next chunk
   * @returns Audio blob in WAV format
   */
  async speak(request: SpeakRequest, signal?: AbortSignal): Promise<Blob> {
    // Validate parameters BEFORE getting config
    if (!request.text || request.text.trim().length === 0) {
      throw new Error('Text is required for speech generation');
    }

    if (request.speed !== undefined && (request.speed < 0.5 || request.speed > 2.0)) {
      throw new Error('Speed must be between 0.5 and 2.0');
    }

    const config = await this.getConfig();

    // Apply defaults
    const payload = {
      text: request.text,
      voice: request.voice || config.default_voice || DEFAULT_VOICE,
      speed: request.speed !== undefined ? request.speed : 1.0,
    };

    return await this.makeRequest<Blob>('/speak', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    }, speakTimeoutMs(request.text));
  }

  /**
   * Reset cached configuration (useful when helper is restarted)
   */
  resetConfig(): void {
    this.config = null;
    this.configPromise = null;
  }
}

/**
 * Singleton instance of API client
 */
let apiClientInstance: ApiClient | null = null;

/**
 * Get singleton API client instance
 */
export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new ApiClient();
  }
  return apiClientInstance;
}

/**
 * Reset the API client (useful for testing or when helper is restarted)
 */
export function resetApiClient(): void {
  if (apiClientInstance) {
    apiClientInstance.resetConfig();
  }
  apiClientInstance = null;
}

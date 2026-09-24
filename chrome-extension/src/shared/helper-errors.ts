/**
 * Helper error bodies and the user-facing messages for them (C1 D12).
 *
 * The helper answers a failed request with JSON of the form
 * `{"error": "<code>", "message": "...", "retry_after_seconds": n}`. A 1.5
 * helper sends the worker's own code unwrapped (400 for a bad request, 503
 * while the engine is down). Helpers before that wrapped worker failures:
 * `{"error": "generation_failed", "message": "Audio generation failed:
 * nan_audio"}`, and sent an over-long text as a `bad_request` whose message
 * says "Text too long". parseHelperErrorBody recovers the underlying code
 * from any of these shapes.
 */

import { HelperNotFoundError, InvalidResponseError, NetworkTimeoutError } from './types';

/** Codes with their own message. Anything else keeps the helper's code. */
export type HelperErrorCode =
  | 'unknown_voice'
  | 'invalid_speed'
  | 'nan_audio'
  | 'bad_host'
  | 'text_too_long'
  | 'audio_too_long'
  | 'empty_text'
  | 'warmup_timeout'
  | 'helper_down';

/** Codes that may appear inside a wrapped message, most specific first. */
const WRAPPED_CODES: readonly HelperErrorCode[] = [
  'unknown_voice',
  'invalid_speed',
  'nan_audio',
  'audio_too_long',
  'empty_text',
  'text_too_long',
  'bad_host',
];

/** Helper codes meaning the synthesis engine itself is gone. */
const ENGINE_DOWN_CODES = new Set(['process_not_running', 'too_many_restarts']);

/**
 * An error response from the helper, with the code recovered from its body.
 * Extends InvalidResponseError so existing handling (no retry) still applies.
 */
export class HelperError extends InvalidResponseError {
  readonly code: string;
  readonly status: number;
  readonly detail: string;

  constructor(code: string, status: number, detail = '') {
    super(`Helper error ${status}: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'HelperError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Recover the error code from a helper error body, or null when the body is
 * not a helper error object.
 */
export function parseHelperErrorBody(body: unknown): { code: string; detail: string } | null {
  if (!body || typeof body !== 'object') return null;
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (typeof error !== 'string' || error.length === 0) return null;
  const detail = typeof message === 'string' ? message : '';

  const code = error.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((WRAPPED_CODES as readonly string[]).includes(code)) return { code, detail };
  if (ENGINE_DOWN_CODES.has(code)) return { code: 'helper_down', detail };

  const text = detail.toLowerCase();
  if (/too long/.test(text)) return { code: 'text_too_long', detail };
  for (const wrapped of WRAPPED_CODES) {
    if (text.includes(wrapped)) return { code: wrapped, detail };
  }
  return { code, detail };
}

/**
 * Build the error to throw for a non-OK response: a HelperError when the body
 * is a helper error object, else the generic InvalidResponseError as before.
 */
export async function errorFromResponse(
  response: { status: number; statusText?: string; text?: () => Promise<string> },
  endpoint: string
): Promise<Error> {
  let body: unknown = null;
  try {
    if (typeof response.text === 'function') {
      const raw = await response.text();
      body = raw ? JSON.parse(raw) : null;
    }
  } catch {
    body = null;
  }

  const parsed = parseHelperErrorBody(body);
  if (parsed) {
    return new HelperError(parsed.code, response.status, parsed.detail);
  }

  const statusText = response.statusText ?? '';
  if (response.status === 404) {
    return new InvalidResponseError(`Endpoint not found: ${endpoint}`);
  }
  if (response.status >= 500) {
    return new InvalidResponseError(`Server error: ${response.status} ${statusText}`);
  }
  return new InvalidResponseError(`HTTP error: ${response.status} ${statusText}`);
}

const MESSAGES: Record<HelperErrorCode, string> = {
  unknown_voice:
    'Your Natural TTS helper does not have this voice. Pick another voice, or update the helper.',
  invalid_speed: 'The helper rejected the speed. Choose a speed between 0.5× and 2.0×.',
  nan_audio: 'The helper produced broken audio for this text. Try again, or pick another voice.',
  bad_host:
    'The helper refused the request address. Update the Natural TTS helper and the extension, and check that no proxy rewrites 127.0.0.1.',
  text_too_long: 'The selection is too long (5,000 characters at most). Select less text.',
  audio_too_long:
    'This selection makes more than 20 minutes of speech, more than the helper returns at once. Select less text or raise the speed.',
  empty_text: 'There is no speakable text in the selection.',
  warmup_timeout: 'The helper is still loading its voice model. Try again in a few seconds.',
  helper_down: 'The Natural TTS helper is not running. Start it, then try again.',
};

/**
 * What to log about an error on the speak path: its name and, for a helper
 * error, its code; never the message. A helper error's message embeds the
 * helper's detail string, which a worker error could fill with a fragment of
 * the text being read, and console.error ships in the production build.
 */
export function errorSummary(error: unknown): string {
  if (error instanceof HelperError) return `${error.name} ${error.status} ${error.code}`;
  if (error instanceof Error) return error.name;
  return typeof error;
}

/**
 * One clear sentence for the user, for any error the speak path can raise.
 */
export function userMessageForError(error: unknown): string {
  if (error instanceof HelperError) {
    return MESSAGES[error.code as HelperErrorCode] ?? `The helper reported an error (${error.code}).`;
  }
  if (error instanceof HelperNotFoundError) return MESSAGES.helper_down;
  // Discovery's own error lists every port it probed; say it plainly instead.
  if (error instanceof Error && error.name === 'ConfigNotFoundError') return MESSAGES.helper_down;
  if (error instanceof NetworkTimeoutError) {
    return 'The helper took too long to answer. It may be busy; try again or select less text.';
  }
  if (error instanceof InvalidResponseError) return 'Invalid response from the helper. Please try again.';
  if (error instanceof Error && error.message) return error.message;
  return 'An unexpected error occurred. Please try again.';
}

/**
 * True when the helper could not be reached at all: discovery found nothing
 * on 8249-8260, the connection was refused, or the helper answered that its
 * voice engine is gone (helper_down). False for an answer the helper gave on
 * purpose (a 4xx for bad input, a warm-up, a timeout while it is busy): those
 * are real problems a system voice would hide. Drives the OD-2 fallback.
 */
export function isHelperUnavailable(error: unknown): boolean {
  if (error instanceof HelperError) return error.code === 'helper_down';
  if (error instanceof HelperNotFoundError) return true;
  return error instanceof Error && error.name === 'ConfigNotFoundError';
}

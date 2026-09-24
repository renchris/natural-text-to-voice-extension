/**
 * Helper error bodies -> HelperError codes -> user-facing messages (C1 D12).
 *
 * Every case goes through the real ApiClient.speak against a mocked fetch on
 * 127.0.0.1:18249, so the parsing in makeRequest is what is tested.
 */

import { describe, test, expect, mock, beforeEach, afterAll } from 'bun:test';
import { ApiClient, HelperError, userMessageForError } from '../src/shared/api-client';
import { errorSummary, parseHelperErrorBody } from '../src/shared/helper-errors';
import { HelperNotFoundError, InvalidResponseError, NetworkTimeoutError } from '../src/shared/types';

const saved = { chrome: (globalThis as any).chrome, fetch: globalThis.fetch };

let speakResponse: () => Response | Promise<Response> = () => new Response('', { status: 200 });
const fetchMock = mock(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (!url.startsWith('http://127.0.0.1:18249/')) throw new Error(`unexpected URL ${url}`);
  if (url.endsWith('/health')) return new Response(JSON.stringify({ status: 'ok', model: 'kokoro-82m', model_loaded: true }), { status: 200 });
  return speakResponse();
});

const json = (status: number, body: unknown) =>
  () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async () => ({ native_tts_helper_config: { port: 18249, secret: '', default_voice: 'af_bella' } }),
        set: async () => {},
      },
    },
  };
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockClear();
});

afterAll(() => {
  (globalThis as any).chrome = saved.chrome;
  globalThis.fetch = saved.fetch;
  if (saved.chrome === undefined) delete (globalThis as any).chrome;
});

async function speakError(): Promise<unknown> {
  try {
    await new ApiClient().speak({ text: 'Hello there', voice: 'af_bella', speed: 1 });
  } catch (error) {
    return error;
  }
  throw new Error('speak() resolved; expected it to throw');
}

describe('helper error codes (one per code)', () => {
  test('unknown_voice: 400 {"error":"unknown_voice"}', async () => {
    speakResponse = json(400, { error: 'unknown_voice', message: 'Unknown voice: zz_nope' });
    const error = await speakError();
    expect(error).toBeInstanceOf(HelperError);
    expect((error as HelperError).code).toBe('unknown_voice');
    expect((error as HelperError).status).toBe(400);
    expect(userMessageForError(error)).toBe(
      'Your Natural TTS helper does not have this voice. Pick another voice, or update the helper.'
    );
  });

  test('invalid_speed: the worker code wrapped in generation_failed', async () => {
    speakResponse = json(500, { error: 'generation_failed', message: 'Audio generation failed: invalid_speed' });
    const error = await speakError();
    expect((error as HelperError).code).toBe('invalid_speed');
    expect(userMessageForError(error)).toBe('The helper rejected the speed. Choose a speed between 0.5x and 2.0x.');
  });

  test('nan_audio: the worker code wrapped in generation_failed', async () => {
    speakResponse = json(500, { error: 'generation_failed', message: 'Audio generation failed: nan_audio' });
    const error = await speakError();
    expect((error as HelperError).code).toBe('nan_audio');
    expect(userMessageForError(error)).toBe(
      'The helper produced broken audio for this text. Try again, or pick another voice.'
    );
  });

  test('bad_host: {"error":"bad_host"}', async () => {
    speakResponse = json(421, { error: 'bad_host', message: 'Host header not allowed' });
    const error = await speakError();
    expect((error as HelperError).code).toBe('bad_host');
    expect(userMessageForError(error)).toContain('refused the request address');
  });

  test('text too long: bad_request "Text too long (max 5000 characters)" and a text_too_long code', async () => {
    speakResponse = json(400, { error: 'bad_request', message: 'Text too long (max 5000 characters)' });
    const wrapped = await speakError();
    expect((wrapped as HelperError).code).toBe('text_too_long');
    expect(userMessageForError(wrapped)).toBe(
      'The selection is too long (5,000 characters at most). Select less text.'
    );

    speakResponse = json(400, { error: 'text-too-long' });
    expect((await speakError() as HelperError).code).toBe('text_too_long');
  });

  test('audio_too_long: the worker code wrapped in generation_failed', async () => {
    speakResponse = json(500, { error: 'generation_failed', message: 'Audio generation failed: audio_too_long' });
    const error = await speakError();
    expect((error as HelperError).code).toBe('audio_too_long');
    expect(userMessageForError(error)).toContain('20 minutes');
  });

  test('an oversized body: 413 payload_too_large reads as text too long', async () => {
    speakResponse = json(413, { error: 'payload_too_large', message: 'Request too long (max 1048576 bytes)' });
    const error = await speakError();
    expect((error as HelperError).code).toBe('text_too_long');
    expect(userMessageForError(error)).toContain('too long');
  });

  test('helper down: nothing listening on the port', async () => {
    speakResponse = () => { throw new TypeError('Failed to fetch'); };
    const error = await speakError();
    expect(error).toBeInstanceOf(HelperNotFoundError);
    expect(userMessageForError(error)).toBe('The Natural TTS helper is not running. Start it, then try again.');
  });

  test('helper down: the worker process is gone (process_not_running)', async () => {
    speakResponse = json(500, { error: 'process_not_running', message: 'Python worker process not running' });
    const error = await speakError();
    expect((error as HelperError).code).toBe('helper_down');
    expect(userMessageForError(error)).toBe('The Natural TTS helper is not running. Start it, then try again.');
  });
});

describe('helper error fallbacks', () => {
  test('a non-JSON error body is still a generic InvalidResponseError', async () => {
    speakResponse = () => new Response('<html>oops</html>', { status: 502, statusText: 'Bad Gateway' });
    const error = await speakError();
    expect(error).toBeInstanceOf(InvalidResponseError);
    expect(error).not.toBeInstanceOf(HelperError);
    expect(userMessageForError(error)).toBe('Invalid response from the helper. Please try again.');
  });

  test('an unknown code keeps the code in the message', async () => {
    speakResponse = json(500, { error: 'internal_error', message: 'boom' });
    expect(userMessageForError(await speakError())).toBe('The helper reported an error (internal_error).');
  });

  test('warmup_timeout and timeouts read clearly', () => {
    expect(userMessageForError(new HelperError('warmup_timeout', 500))).toContain('still loading');
    expect(userMessageForError(new NetworkTimeoutError())).toContain('took too long');
  });

  test('errorSummary logs the name and code, never the helper\'s detail (EXT-10)', async () => {
    speakResponse = json(500, { error: 'generation_failed', message: 'Audio generation failed: abs(77777777777777777777)' });
    const error = await speakError();
    expect(String((error as Error).message)).toContain('7777');
    const summary = errorSummary(error);
    expect(summary).toBe('HelperError 500 generation_failed');
    expect(summary).not.toContain('7777');
    expect(errorSummary(new TypeError('secret text'))).toBe('TypeError');
    expect(errorSummary('secret text')).toBe('string');
  });

  test('parseHelperErrorBody ignores bodies that are not helper errors', () => {
    expect(parseHelperErrorBody(null)).toBeNull();
    expect(parseHelperErrorBody('text')).toBeNull();
    expect(parseHelperErrorBody({ status: 'ok' })).toBeNull();
    expect(parseHelperErrorBody({ error: '' })).toBeNull();
  });

  test('an error response is not retried', async () => {
    speakResponse = json(500, { error: 'generation_failed', message: 'Audio generation failed: nan_audio' });
    await speakError();
    expect(fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/speak'))).toHaveLength(1);
  });
});

/**
 * Behavioural tests for the offscreen document's speak/stop lifecycle (IN-12).
 *
 * Imports the real offscreen module (and the real API client behind it)
 * against mocked chrome, fetch, Audio and object URLs. No network is used:
 * fetch is replaced for the whole file and restored afterwards.
 */

import { describe, test, expect, mock, beforeAll, beforeEach, afterAll } from 'bun:test';
import type { OffscreenSpeakResponse, OffscreenStopResponse } from '../src/shared/types';
import { resetApiClient } from '../src/shared/api-client';

type Listener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean;

let onMessage: Listener | null = null;

// ---- fetch: /health answers at once; /speak waits until the test releases it
type Deferred = { resolve: () => void; promise: Promise<void> };
const pendingSpeaks: Deferred[] = [];
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { resolve, promise };
}

const defaultFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  if (url.endsWith('/health')) {
    return new Response(JSON.stringify({ status: 'ok', model: 'kokoro-82m', model_loaded: true }), { status: 200 });
  }
  // Connection refused: the helper went away between discovery and /speak.
  if (url.endsWith('/speak') && String(init?.body).includes('"zz_refused"')) {
    throw new TypeError('Failed to fetch');
  }
  // The helper answers, but its voice engine is gone for good.
  if (url.endsWith('/speak') && String(init?.body).includes('"zz_down"')) {
    return new Response(JSON.stringify({ error: 'process_not_running', message: 'Python worker process not running' }), { status: 503 });
  }
  if (url.endsWith('/speak') && String(init?.body).includes('"zz_nope"')) {
    return new Response(JSON.stringify({ error: 'unknown_voice', message: 'Unknown voice: zz_nope' }), { status: 400 });
  }
  if (url.endsWith('/speak')) {
    const gate = deferred();
    pendingSpeaks.push(gate);
    await gate.promise;
    return new Response(new Blob(['RIFF-fake-wav'], { type: 'audio/wav' }), { status: 200 });
  }
  return new Response('not found', { status: 404 });
};
const fetchMock = mock(defaultFetch);

// ---- Audio + object URLs
class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  paused = true;
  error: { message: string } | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = mock(() => { this.paused = true; });
  play = mock(async () => { this.paused = false; });
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  finish(): void {
    this.paused = true;
    this.onended?.();
  }
}

function lastAudio(): FakeAudio {
  return FakeAudio.instances[FakeAudio.instances.length - 1]!;
}

const liveUrls = new Set<string>();
let urlCounter = 0;
const createObjectURL = mock((_blob: Blob) => {
  const url = `blob:fake-${++urlCounter}`;
  liveUrls.add(url);
  return url;
});
const revokeObjectURL = mock((url: string) => { liveUrls.delete(url); });

// ---- idle timer: 60 s timeouts are captured so the test can fire them; every
// other delay goes to the real timer.
const IDLE_MS = 60_000;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const idleTimers = new Map<number, () => void>();
let fakeTimerId = 1_000_000;
function fakeSetTimeout(fn: () => void, ms?: number, ...rest: unknown[]) {
  if (ms === IDLE_MS) {
    const id = ++fakeTimerId;
    idleTimers.set(id, fn);
    return id;
  }
  return (realSetTimeout as any)(fn, ms, ...rest);
}
function fakeClearTimeout(id: any) {
  if (idleTimers.delete(id)) return;
  realClearTimeout(id);
}
function fireIdleTimers(): number {
  const pending = [...idleTimers.values()];
  idleTimers.clear();
  pending.forEach(fn => fn());
  return pending.length;
}
const runtimeSendMessage = mock(async (_message: unknown) => undefined);

const saved = {
  chrome: (globalThis as any).chrome,
  fetch: globalThis.fetch,
  Audio: (globalThis as any).Audio,
  URL: (globalThis as any).URL,
};

function installGlobals(): void {
  (globalThis as any).chrome = {
    runtime: {
      onMessage: { addListener: (fn: Listener) => { onMessage = fn; } },
      sendMessage: runtimeSendMessage,
    },
    storage: {
      local: {
        get: async () => ({ native_tts_helper_config: { port: 18249, secret: '', default_voice: 'af_bella' } }),
        set: async () => {},
      },
    },
  };
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  (globalThis as any).Audio = FakeAudio;
  (globalThis as any).setTimeout = fakeSetTimeout;
  (globalThis as any).clearTimeout = fakeClearTimeout;
  const BaseURL = saved.URL ?? class {};
  (globalThis as any).URL = class extends BaseURL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  };
}

beforeAll(async () => {
  installGlobals();
  await import('../src/offscreen/offscreen');
});

beforeEach(() => {
  installGlobals();
});

afterAll(() => {
  (globalThis as any).chrome = saved.chrome;
  globalThis.fetch = saved.fetch;
  (globalThis as any).Audio = saved.Audio;
  (globalThis as any).URL = saved.URL;
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  if (saved.chrome === undefined) delete (globalThis as any).chrome;
  if (saved.Audio === undefined) delete (globalThis as any).Audio;
});

/** A started reply names the port the helper answered on (the stored 18249). */
const STARTED: OffscreenSpeakResponse = { type: 'SPEAK_STARTED', success: true, port: 18249 };

function send<T>(message: unknown): { returned: boolean; response: Promise<T> } {
  let resolve!: (value: T) => void;
  const response = new Promise<T>(r => { resolve = r; });
  const returned = onMessage!(message, {}, value => resolve(value as T));
  return { returned, response };
}

function speak(text = 'Hello there') {
  return send<OffscreenSpeakResponse>({ type: 'SPEAK_IN_OFFSCREEN', text, voice: 'af_bella', speed: 1 });
}

function stop() {
  return send<OffscreenStopResponse>({ type: 'STOP_IN_OFFSCREEN' });
}

async function until(condition: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(r => setTimeout(r, 1));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function settledWithin<T>(promise: Promise<T>, ms = 50): Promise<T | 'pending'> {
  return Promise.race([promise, new Promise<'pending'>(r => setTimeout(() => r('pending'), ms))]);
}

/** Speak, let it play to the end, and return how the end was reported (SPEAK_FINISHED). */
async function speakToEnd(text = 'Hello there'): Promise<unknown> {
  const before = FakeAudio.instances.length;
  const finishedBefore = finishedMessages().length;
  const { response } = speak(text);
  await until(() => pendingSpeaks.length > 0, '/speak request');
  pendingSpeaks.shift()!.resolve();
  await until(() => FakeAudio.instances.length > before, 'audio element');
  expect(await response).toEqual(STARTED);
  lastAudio().finish();
  await until(() => finishedMessages().length > finishedBefore, 'SPEAK_FINISHED');
  return lastOf(finishedMessages());
}

function idleMessages(): unknown[] {
  return runtimeSendMessage.mock.calls.map(call => call[0]).filter((m: any) => m?.type === 'OFFSCREEN_IDLE');
}

const lastOf = <T>(list: T[]): T | undefined => list[list.length - 1];

function finishedMessages(): unknown[] {
  return runtimeSendMessage.mock.calls.map(call => call[0]).filter((m: any) => m?.type === 'SPEAK_FINISHED');
}

describe('offscreen idle close (IN-09)', () => {
  test('the document arms a 60 s idle timer as soon as it loads', () => {
    // Armed at import time, before any speak request.
    expect(idleTimers.size).toBe(1);
  });

  test('playback end arms the timer; when it fires the document reports OFFSCREEN_IDLE', async () => {
    idleTimers.clear();
    runtimeSendMessage.mockClear();

    expect(await speakToEnd()).toEqual({ type: 'SPEAK_FINISHED', success: true });
    expect(idleTimers.size).toBe(1);
    expect(idleMessages()).toEqual([]);

    expect(fireIdleTimers()).toBe(1);
    expect(idleMessages()).toEqual([{ type: 'OFFSCREEN_IDLE' }]);
  });

  test('a new speak request cancels the pending idle timer', async () => {
    idleTimers.clear();
    runtimeSendMessage.mockClear();
    await speakToEnd();
    expect(idleTimers.size).toBe(1);

    const { response } = speak('again');
    expect(idleTimers.size).toBe(0);
    await until(() => pendingSpeaks.length > 0, '/speak request');

    // Nothing fires while the helper synthesises, however long it takes.
    expect(fireIdleTimers()).toBe(0);
    expect(idleMessages()).toEqual([]);

    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > 0 && !lastAudio().paused, 'playback');
    lastAudio().finish();
    await response;
    await until(() => idleTimers.size === 1, 'idle timer re-armed');
  });

  test('a failed request and a stop both arm the timer too', async () => {
    idleTimers.clear();
    await speak('   ').response; // empty text fails before any fetch
    expect(idleTimers.size).toBe(1);

    idleTimers.clear();
    const { response } = speak('stop me');
    await until(() => pendingSpeaks.length > 0, '/speak request');
    stop();
    await response;
    expect(idleTimers.size).toBe(1);
    pendingSpeaks.shift()!.resolve();
  });
});

describe('offscreen speak / stop', () => {
  test('STOP with nothing active reports stopped:false', async () => {
    const { returned, response } = stop();
    expect(returned).toBe(false);
    expect(await response).toEqual({ type: 'STOPPED', stopped: false });
  });

  test('the reply goes out when playback starts; the end follows as SPEAK_FINISHED (EXT-8)', async () => {
    const before = FakeAudio.instances.length;
    const finishedBefore = finishedMessages().length;
    const { returned, response } = speak();
    expect(returned).toBe(true);

    await until(() => pendingSpeaks.length > 0, '/speak request');
    expect(await settledWithin(response)).toBe('pending');
    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > before, 'audio element');

    const audio = lastAudio();
    expect(audio.play).toHaveBeenCalledTimes(1);
    // The service worker's message is answered now, not after the audio: a
    // reply held for the whole playback was lost past Chrome's ~5-minute cap.
    expect(await settledWithin(response)).toEqual(STARTED);
    expect(finishedMessages().length).toBe(finishedBefore);

    audio.finish();
    await until(() => finishedMessages().length > finishedBefore, 'SPEAK_FINISHED');
    expect(lastOf(finishedMessages())).toEqual({ type: 'SPEAK_FINISHED', success: true });
    expect(liveUrls.has(audio.src)).toBe(false);
  });

  test('a playback error after the start is reported as a failed SPEAK_FINISHED', async () => {
    const before = FakeAudio.instances.length;
    const finishedBefore = finishedMessages().length;
    const { response } = speak();
    await until(() => pendingSpeaks.length > 0, '/speak request');
    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > before, 'audio element');
    expect(await response).toEqual(STARTED);

    const audio = lastAudio();
    audio.error = { message: 'decode failed' };
    audio.onerror?.();
    await until(() => finishedMessages().length > finishedBefore, 'SPEAK_FINISHED');
    const finished = lastOf(finishedMessages()) as { success: boolean; error?: string };
    expect(finished.success).toBe(false);
    expect(finished.error).toContain('decode failed');
  });

  test('STOP during playback pauses, revokes the URL and settles the pending speak', async () => {
    const before = FakeAudio.instances.length;
    const { response } = speak();
    await until(() => pendingSpeaks.length > 0, '/speak request');
    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > before, 'audio element');
    const audio = lastAudio();
    expect(liveUrls.has(audio.src)).toBe(true);

    expect(await response).toEqual(STARTED);
    const finishedBefore = finishedMessages().length;
    const stopped = stop();
    expect(await stopped.response).toEqual({ type: 'STOPPED', stopped: true });

    await until(() => finishedMessages().length > finishedBefore, 'SPEAK_FINISHED');
    expect(lastOf(finishedMessages())).toEqual({ type: 'SPEAK_FINISHED', success: true, stopped: true });
    expect(audio.pause).toHaveBeenCalled();
    expect(liveUrls.has(audio.src)).toBe(false);

    // Nothing is left active.
    expect(await stop().response).toEqual({ type: 'STOPPED', stopped: false });
  });

  test('STOP while the helper is still synthesising settles at once and never plays', async () => {
    const before = FakeAudio.instances.length;
    const { response } = speak();
    await until(() => pendingSpeaks.length > 0, '/speak request');

    expect(await stop().response).toEqual({ type: 'STOPPED', stopped: true });
    expect(await settledWithin(response)).toEqual({ type: 'SPEAK_STOPPED', success: true });

    // The synthesis result arrives later and is discarded.
    pendingSpeaks.shift()!.resolve();
    await new Promise(r => setTimeout(r, 20));
    expect(FakeAudio.instances.length).toBe(before);
  });

  test('STOP and a superseding speak abort the in-flight /speak fetch (the helper then stops synthesising)', async () => {
    const lastSpeakSignal = () => {
      const calls = fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/speak'));
      return (calls[calls.length - 1]?.[1] as RequestInit | undefined)?.signal;
    };

    const first = speak('first');
    await until(() => pendingSpeaks.length > 0, 'first /speak');
    const firstSignal = lastSpeakSignal();
    expect(firstSignal?.aborted).toBe(false);
    expect(await stop().response).toEqual({ type: 'STOPPED', stopped: true });
    expect(firstSignal?.aborted).toBe(true);
    expect(await first.response).toEqual({ type: 'SPEAK_STOPPED', success: true });
    pendingSpeaks.shift()!.resolve();

    const second = speak('second');
    await until(() => pendingSpeaks.length > 0, 'second /speak');
    const secondSignal = lastSpeakSignal();
    const third = speak('third');
    expect(secondSignal?.aborted).toBe(true);
    expect(await settledWithin(second.response)).toEqual({ type: 'SPEAK_STOPPED', success: true });
    pendingSpeaks.shift()!.resolve();
    await until(() => pendingSpeaks.length > 0, 'third /speak');
    expect(lastSpeakSignal()?.aborted).toBe(false);
    expect(await stop().response).toEqual({ type: 'STOPPED', stopped: true });
    pendingSpeaks.shift()!.resolve();
    expect(await third.response).toEqual({ type: 'SPEAK_STOPPED', success: true });
  });

  test('a new speak supersedes the one playing and settles it as stopped', async () => {
    const before = FakeAudio.instances.length;
    const first = speak('first');
    await until(() => pendingSpeaks.length > 0, 'first /speak');
    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > before, 'first audio');
    const firstAudio = lastAudio();

    expect(await first.response).toEqual(STARTED);
    const finishedBefore = finishedMessages().length;

    const second = speak('second');
    await until(() => finishedMessages().length > finishedBefore, 'first SPEAK_FINISHED');
    expect(lastOf(finishedMessages())).toEqual({ type: 'SPEAK_FINISHED', success: true, stopped: true });
    expect(firstAudio.pause).toHaveBeenCalled();

    await until(() => pendingSpeaks.length > 0, 'second /speak');
    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > before + 1, 'second audio');
    expect(await second.response).toEqual(STARTED);
    lastAudio().finish();
    await until(() => finishedMessages().length > finishedBefore + 1, 'second SPEAK_FINISHED');
    expect(lastOf(finishedMessages())).toEqual({ type: 'SPEAK_FINISHED', success: true });
  });

  test('answers the popup\'s status query and broadcasts when it starts and stops serving (EXT-3)', async () => {
    const activity = () => runtimeSendMessage.mock.calls.map(call => call[0]).filter((m: any) => m?.type === 'OFFSCREEN_ACTIVITY');
    const status = () => send<{ type: string; speaking: boolean; voice?: string }>({ type: 'OFFSCREEN_STATUS_QUERY' }).response;
    runtimeSendMessage.mockClear();

    expect(await status()).toEqual({ type: 'OFFSCREEN_STATUS', speaking: false });
    const { response } = speak();
    await until(() => pendingSpeaks.length > 0, '/speak request');
    expect(await status()).toEqual({ type: 'OFFSCREEN_STATUS', speaking: true, voice: 'af_bella' });
    expect(activity()).toEqual([{ type: 'OFFSCREEN_ACTIVITY', speaking: true, engine: 'kokoro', voice: 'af_bella' }]);

    expect(await stop().response).toEqual({ type: 'STOPPED', stopped: true });
    expect(await response).toEqual({ type: 'SPEAK_STOPPED', success: true });
    expect(await status()).toEqual({ type: 'OFFSCREEN_STATUS', speaking: false });
    expect(activity()).toEqual([
      { type: 'OFFSCREEN_ACTIVITY', speaking: true, engine: 'kokoro', voice: 'af_bella' },
      { type: 'OFFSCREEN_ACTIVITY', speaking: false, engine: 'kokoro' },
    ]);
    pendingSpeaks.shift()!.resolve();
  });

  test('empty text settles as an error without calling the helper', async () => {
    const calls = fetchMock.mock.calls.length;
    const { response } = speak('   ');
    const result = await response;
    expect(result.type).toBe('SPEAK_ERROR');
    expect(result.success).toBe(false);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  test('a helper error body reaches the service worker as a clear message (D12)', async () => {
    const { response } = send<OffscreenSpeakResponse>({ type: 'SPEAK_IN_OFFSCREEN', text: 'Hi', voice: 'zz_nope', speed: 1 });
    expect(await response).toEqual({
      type: 'SPEAK_ERROR',
      success: false,
      error: 'Your Natural TTS helper does not have this voice. Pick another voice, or update the helper.',
    });
  });

  test('a refused connection is flagged helperUnavailable, so the worker may use the system voice (OD-2)', async () => {
    const { response } = send<OffscreenSpeakResponse>({ type: 'SPEAK_IN_OFFSCREEN', text: 'Hi', voice: 'zz_refused', speed: 1 });
    expect(await response).toEqual({
      type: 'SPEAK_ERROR',
      success: false,
      error: 'The Natural TTS helper is not running. Start it, then try again.',
      helperUnavailable: true,
    });
  });

  test('a helper whose engine is gone (helper_down) is flagged helperUnavailable too (OD-2)', async () => {
    const { response } = send<OffscreenSpeakResponse>({ type: 'SPEAK_IN_OFFSCREEN', text: 'Hi', voice: 'zz_down', speed: 1 });
    const result = await response;
    expect(result.type).toBe('SPEAK_ERROR');
    expect(result.helperUnavailable).toBe(true);
  });

  test('never touches a real port: every request went to the mocked 18249', () => {
    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith('http://127.0.0.1:18249/')).toBe(true);
    }
  });
});

describe('the port the service worker passes (no chrome.storage here)', () => {
  const helperHealth = () =>
    new Response(JSON.stringify({ status: 'ok', model: 'kokoro-82m', model_loaded: true }), { status: 200 });
  const urls = () => fetchMock.mock.calls.map(call => String(call[0]));
  const posted = () => fetchMock.mock.calls.filter(call => call[1]?.method === 'POST').map(call => String(call[0]));

  beforeEach(() => {
    // A real offscreen document has chrome.runtime and nothing else.
    delete (globalThis as any).chrome.storage;
    fetchMock.mockClear();
  });

  afterAll(() => {
    fetchMock.mockImplementation(defaultFetch);
    // The client is a module singleton shared with later test files: drop the
    // port these tests made it prefer.
    resetApiClient();
  });

  async function speakOn(port: number) {
    const before = FakeAudio.instances.length;
    const { response } = send<OffscreenSpeakResponse>({ type: 'SPEAK_IN_OFFSCREEN', text: 'PRIVATE text', voice: 'af_heart', speed: 1, port });
    await until(() => pendingSpeaks.length > 0, '/speak request');
    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > before, 'audio element');
    const reply = await response;
    lastAudio().finish();
    return reply;
  }

  test('is tried first, and the selection goes there once /health identifies the helper', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === 'http://127.0.0.1:18251/health') return helperHealth();
      if (url === 'http://127.0.0.1:18251/speak') return defaultFetch(input, init);
      throw new TypeError('Failed to fetch');
    });

    expect(await speakOn(18251)).toEqual({ type: 'SPEAK_STARTED', success: true, port: 18251 });
    expect(urls()[0]).toBe('http://127.0.0.1:18251/health');
    expect(posted()).toEqual(['http://127.0.0.1:18251/speak']);
  });

  test('a passed port that is not the helper never receives the selection; discovery finds it (SEC-03)', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      // Some other local service with a conventional /health on the passed port.
      if (url.startsWith('http://127.0.0.1:18252/')) {
        return new Response(JSON.stringify({ status: 'ok', service: 'some-dev-api' }), { status: 200 });
      }
      if (url === 'http://127.0.0.1:8250/health') return helperHealth();
      if (url === 'http://127.0.0.1:8250/speak') return defaultFetch(input, init);
      throw new TypeError('Failed to fetch');
    });

    expect(await speakOn(18252)).toEqual({ type: 'SPEAK_STARTED', success: true, port: 8250 });
    expect(urls()[0]).toBe('http://127.0.0.1:18252/health');
    expect(posted()).toEqual(['http://127.0.0.1:8250/speak']);
  });
});

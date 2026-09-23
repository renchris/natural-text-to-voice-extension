/**
 * Behavioural tests for the offscreen document's speak/stop lifecycle (IN-12).
 *
 * Imports the real offscreen module (and the real API client behind it)
 * against mocked chrome, fetch, Audio and object URLs. No network is used:
 * fetch is replaced for the whole file and restored afterwards.
 */

import { describe, test, expect, mock, beforeAll, beforeEach, afterAll } from 'bun:test';
import type { OffscreenSpeakResponse, OffscreenStopResponse } from '../src/shared/types';

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

const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith('/health')) {
    return new Response(JSON.stringify({ status: 'ok', model_loaded: true }), { status: 200 });
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
});

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

async function speakToEnd(text = 'Hello there'): Promise<OffscreenSpeakResponse> {
  const before = FakeAudio.instances.length;
  const { response } = speak(text);
  await until(() => pendingSpeaks.length > 0, '/speak request');
  pendingSpeaks.shift()!.resolve();
  await until(() => FakeAudio.instances.length > before, 'audio element');
  lastAudio().finish();
  return response;
}

function idleMessages(): unknown[] {
  return runtimeSendMessage.mock.calls.map(call => call[0]).filter((m: any) => m?.type === 'OFFSCREEN_IDLE');
}

describe('offscreen idle close (IN-09)', () => {
  test('the document arms a 60 s idle timer as soon as it loads', () => {
    // Armed at import time, before any speak request.
    expect(idleTimers.size).toBe(1);
  });

  test('playback end arms the timer; when it fires the document reports OFFSCREEN_IDLE', async () => {
    idleTimers.clear();
    runtimeSendMessage.mockClear();

    expect(await speakToEnd()).toEqual({ type: 'SPEAK_COMPLETE', success: true });
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
    expect(idleTimers.size).toBe(1);
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

  test('a speak that plays to the end settles SPEAK_COMPLETE and revokes its URL', async () => {
    const before = FakeAudio.instances.length;
    const { returned, response } = speak();
    expect(returned).toBe(true);

    await until(() => pendingSpeaks.length > 0, '/speak request');
    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > before, 'audio element');

    const audio = lastAudio();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(await settledWithin(response)).toBe('pending');

    audio.finish();
    expect(await response).toEqual({ type: 'SPEAK_COMPLETE', success: true });
    expect(liveUrls.has(audio.src)).toBe(false);
  });

  test('STOP during playback pauses, revokes the URL and settles the pending speak', async () => {
    const before = FakeAudio.instances.length;
    const { response } = speak();
    await until(() => pendingSpeaks.length > 0, '/speak request');
    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > before, 'audio element');
    const audio = lastAudio();
    expect(liveUrls.has(audio.src)).toBe(true);

    const stopped = stop();
    expect(await stopped.response).toEqual({ type: 'STOPPED', stopped: true });

    expect(await settledWithin(response)).toEqual({ type: 'SPEAK_STOPPED', success: true });
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

  test('a new speak supersedes the one playing and settles it as stopped', async () => {
    const before = FakeAudio.instances.length;
    const first = speak('first');
    await until(() => pendingSpeaks.length > 0, 'first /speak');
    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > before, 'first audio');
    const firstAudio = lastAudio();

    const second = speak('second');
    expect(await settledWithin(first.response)).toEqual({ type: 'SPEAK_STOPPED', success: true });
    expect(firstAudio.pause).toHaveBeenCalled();

    await until(() => pendingSpeaks.length > 0, 'second /speak');
    pendingSpeaks.shift()!.resolve();
    await until(() => FakeAudio.instances.length > before + 1, 'second audio');
    lastAudio().finish();
    expect(await second.response).toEqual({ type: 'SPEAK_COMPLETE', success: true });
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

  test('never touches a real port: every request went to the mocked 18249', () => {
    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith('http://127.0.0.1:18249/')).toBe(true);
    }
  });
});

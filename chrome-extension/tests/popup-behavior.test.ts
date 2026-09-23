/**
 * Behavioural tests for the popup (IN-10 and later).
 *
 * Loads the real popup.html body into happy-dom, imports the real popup module
 * against mocked chrome, fetch, Audio and object URLs, and drives it through
 * DOM events. No network: fetch is replaced for the whole file and every
 * request is asserted to go to the mocked 127.0.0.1:18249.
 */

import { describe, test, expect, mock, beforeAll, beforeEach, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---- helper mock: /health and /voices answer at once, /speak waits for the test
type Deferred = { resolve: () => void; promise: Promise<void> };
const pendingSpeaks: Deferred[] = [];
let voicesPayload: unknown = {
  voices: [
    { id: 'af_bella', name: 'Bella (US)', language: 'en-US' },
    { id: 'am_michael', name: 'Michael (US)', language: 'en-US' },
    { id: 'bf_emma', name: 'Emma (UK)', language: 'en-GB' },
  ],
};
const healthPayload: Record<string, unknown> = { status: 'ok', model: 'kokoro-82m', model_loaded: true, apiVersion: 2 };

const fetchMock = mock(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith('/health')) return new Response(JSON.stringify(healthPayload), { status: 200 });
  if (url.endsWith('/voices')) return new Response(JSON.stringify(voicesPayload), { status: 200 });
  if (url.endsWith('/speak')) {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    pendingSpeaks.push({ resolve, promise });
    await promise;
    return new Response(new Blob(['RIFF-fake-wav'], { type: 'audio/wav' }), { status: 200 });
  }
  return new Response('not found', { status: 404 });
});

function speakCalls(): number {
  return fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/speak')).length;
}

// ---- Audio + object URLs
class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  paused = true;
  onended: ((event?: Event) => void) | null = null;
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
const lastAudio = () => FakeAudio.instances[FakeAudio.instances.length - 1]!;
const liveUrls = new Set<string>();
let urlCounter = 0;

let pageSelection = 'Hello from the page';
const storage: Record<string, unknown> = {
  native_tts_helper_config: { port: 18249, secret: '', default_voice: 'af_bella' },
};
let onMessage: ((message: unknown) => boolean) | null = null;

const saved = {
  chrome: (globalThis as any).chrome,
  fetch: globalThis.fetch,
  Audio: (globalThis as any).Audio,
  URL: (globalThis as any).URL,
};

function installGlobals(): void {
  (globalThis as any).chrome = {
    runtime: {
      getManifest: () => ({ version: '1.4.0' }),
      onMessage: { addListener: (fn: (message: unknown) => boolean) => { onMessage = fn; } },
      openOptionsPage: mock(() => {}),
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter(k => k in storage).map(k => [k, storage[k]]));
        },
        set: async (items: Record<string, unknown>) => { Object.assign(storage, items); },
      },
    },
    windows: { getLastFocused: async () => ({ tabs: [{ id: 5, active: true }] }) },
    tabs: { query: async () => [{ id: 5, active: true }], create: mock(async () => ({})) },
    scripting: { executeScript: async () => [{ result: pageSelection }] },
    commands: { getAll: async () => [] },
  };
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  (globalThis as any).Audio = FakeAudio;
  const BaseURL = saved.URL ?? class {};
  (globalThis as any).URL = class extends BaseURL {
    static createObjectURL = (_blob: Blob) => {
      const url = `blob:popup-${++urlCounter}`;
      liveUrls.add(url);
      return url;
    };
    static revokeObjectURL = (url: string) => { liveUrls.delete(url); };
  };
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function until(condition: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (condition()) return;
    await new Promise(r => setTimeout(r, 1));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const tick = () => new Promise(r => setTimeout(r, 5));

beforeAll(async () => {
  installGlobals();
  const html = readFileSync(join(import.meta.dir, '../src/popup/popup.html'), 'utf8');
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
  await import('../src/popup/popup');
  document.dispatchEvent(new (window as any).Event('DOMContentLoaded'));
  await until(() => el<HTMLSelectElement>('voiceSelect').options.length > 1, 'voices loaded');
});

beforeEach(() => {
  installGlobals();
  pageSelection = 'Hello from the page';
});

afterAll(() => {
  (globalThis as any).chrome = saved.chrome;
  globalThis.fetch = saved.fetch;
  (globalThis as any).Audio = saved.Audio;
  (globalThis as any).URL = saved.URL;
  if (saved.chrome === undefined) delete (globalThis as any).chrome;
  if (saved.Audio === undefined) delete (globalThis as any).Audio;
  document.body.innerHTML = '';
});

describe('popup speak button (IN-10)', () => {
  test('connects and enables the speak button', () => {
    expect(el<HTMLButtonElement>('speakButton').disabled).toBe(false);
    expect(el('statusLabel').textContent).toBe('Connected');
  });

  test('two clicks before the first await sends exactly one /speak', async () => {
    const before = speakCalls();
    const button = el<HTMLButtonElement>('speakButton');
    button.click();
    button.click();
    await until(() => pendingSpeaks.length > 0, '/speak');
    await tick();
    expect(speakCalls() - before).toBe(1);

    pendingSpeaks.shift()!.resolve();
    await until(() => el('buttonText').textContent === 'Stop', 'playing state');
    lastAudio().finish();
    await until(() => el('buttonText').textContent === 'Speak Selected Text', 'reset');
  });

  test('Enter on the focused button speaks once (no keydown handler of our own)', async () => {
    const before = speakCalls();
    const button = el<HTMLButtonElement>('speakButton');
    button.focus();
    // What a browser does for Enter on a focused <button>: keydown, then click.
    button.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.click();
    await until(() => pendingSpeaks.length > 0, '/speak');
    await tick();
    expect(speakCalls() - before).toBe(1);

    pendingSpeaks.shift()!.resolve();
    await until(() => el('buttonText').textContent === 'Stop', 'playing state');
    lastAudio().finish();
    await until(() => el('buttonText').textContent === 'Speak Selected Text', 'reset');
  });

  test('while audio plays the button is an enabled Stop, "Playing audio…" shows, and Stop works', async () => {
    const button = el<HTMLButtonElement>('speakButton');
    button.click();
    await until(() => pendingSpeaks.length > 0, '/speak');
    expect(el('buttonText').textContent).toBe('Generating...');
    expect(button.disabled).toBe(true);

    pendingSpeaks.shift()!.resolve();
    await until(() => el('buttonText').textContent === 'Stop', 'playing state');
    const audio = lastAudio();

    // Audio is still playing (not finished) and the controls already say so.
    expect(audio.paused).toBe(false);
    expect(button.disabled).toBe(false);
    expect(button.classList.contains('is-loading')).toBe(false);
    expect(button.classList.contains('is-playing')).toBe(true);
    expect(el('messageContainer').textContent).toBe('Playing audio…');
    expect(el('messageContainer').style.display).toBe('block');

    button.click();
    expect(audio.pause).toHaveBeenCalled();
    expect(liveUrls.has(audio.src)).toBe(false);
    expect(el('buttonText').textContent).toBe('Speak Selected Text');
    expect(button.classList.contains('is-playing')).toBe(false);
    expect(el('messageContainer').style.display).toBe('none');
  });

  test('the stop-speaking broadcast stops popup playback too', async () => {
    el<HTMLButtonElement>('speakButton').click();
    await until(() => pendingSpeaks.length > 0, '/speak');
    pendingSpeaks.shift()!.resolve();
    await until(() => el('buttonText').textContent === 'Stop', 'playing state');
    const audio = lastAudio();

    expect(onMessage!({ type: 'STOP_IN_OFFSCREEN' })).toBe(false);
    expect(audio.pause).toHaveBeenCalled();
    expect(el('buttonText').textContent).toBe('Speak Selected Text');
  });

  test('no selection asks for one, without mentioning an input field, and sends nothing', async () => {
    pageSelection = '';
    const before = speakCalls();
    el<HTMLButtonElement>('speakButton').click();
    await until(() => el('messageContainer').textContent !== 'Playing audio…' && el('messageContainer').style.display === 'block', 'message');
    await tick();
    expect(el('messageContainer').textContent).toBe('Select some text on the page first.');
    expect(el('messageContainer').textContent).not.toMatch(/enter text/i);
    expect(speakCalls()).toBe(before);
    expect(el<HTMLButtonElement>('speakButton').disabled).toBe(false);
  });
});

describe('popup voice list (IN-10)', () => {
  test('voice labels are text, never parsed as HTML', () => {
    const select = el<HTMLSelectElement>('voiceSelect');
    expect(select.querySelectorAll('optgroup').length).toBeGreaterThan(0);
    expect(select.querySelector('img')).toBeNull();
  });

  test('a hostile label from the helper is rendered as literal text', async () => {
    voicesPayload = { voices: [{ id: 'af_bella', name: '<img src=x onerror="alert(1)">Bella', language: 'en-US' }] };
    // The retry path reloads voices through the same code.
    el<HTMLButtonElement>('retryButton').click();
    await until(() => el<HTMLSelectElement>('voiceSelect').options[0]?.textContent?.includes('<img'), 'reloaded');
    const select = el<HTMLSelectElement>('voiceSelect');
    expect(select.querySelector('img')).toBeNull();
    expect(select.options[0].textContent).toBe('<img src=x onerror="alert(1)">Bella');
  });

  test('every request went to the mocked 127.0.0.1:18249', () => {
    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith('http://127.0.0.1:18249/')).toBe(true);
  });
});


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
import { Window } from 'happy-dom';

// A document of its own: page modules bind to the global document at import
// and listen for DOMContentLoaded on it, so a shared one would let another
// page suite's DOMContentLoaded run this page's init (and vice versa).
const pageWindow = new Window();
const savedDom = { window: (globalThis as any).window, document: (globalThis as any).document };

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

// helperDown: every request is refused, as when no helper is installed or running.
let helperDown = false;
// healthScript: how the next /health requests go, one entry each ('abort' = the request times out).
let healthScript: Array<'ok' | 'abort'> = [];
const fetchMock = mock(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url = String(input);
  if (helperDown) throw new TypeError('Failed to fetch');
  if (url.endsWith('/health') && healthScript.shift() === 'abort') throw new DOMException('timed out', 'AbortError');
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
  native_tts_helper_config: { port: 18249, default_voice: 'af_bella' },
};
let onMessage: ((message: unknown) => boolean) | null = null;
// Runtime messages the popup sends (the offscreen status query, a Stop); the
// offscreen document answers the query with speaking: false.
// The service worker's answer to SPEAK_WITH_SYSTEM_VOICE (OD-2).
let systemVoiceReply: unknown = { type: 'SPEAK_STARTED', success: true, engine: 'system' };
const runtimeSendMessage = mock(async (message: { type: string }) => {
  if (message?.type === 'OFFSCREEN_STATUS_QUERY') return { type: 'OFFSCREEN_STATUS', speaking: false };
  if (message?.type === 'SPEAK_WITH_SYSTEM_VOICE') return systemVoiceReply;
  return undefined;
});
const setBadgeText = mock(async (_details: { text: string }) => {});

const saved = {
  chrome: (globalThis as any).chrome,
  fetch: globalThis.fetch,
  Audio: (globalThis as any).Audio,
  URL: (globalThis as any).URL,
};

function installGlobals(): void {
  (globalThis as any).chrome = {
    action: { setBadgeText, setBadgeBackgroundColor: mock(async () => {}), setTitle: mock(async () => {}) },
    runtime: {
      getManifest: () => ({
      name: 'Natural TTS: Private Kokoro Voices for Mac',
      short_name: 'Natural TTS',
      version: '1.4.0',
      action: { default_title: 'Natural TTS' },
    }),
      onMessage: { addListener: (fn: (message: unknown) => boolean) => { onMessage = fn; } },
      sendMessage: runtimeSendMessage,
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
    // The page answers { text, pdf } (selection.ts probeSelection).
    scripting: { executeScript: async () => [{ result: { text: pageSelection, pdf: false } }] },
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
  (globalThis as any).window = pageWindow;
  (globalThis as any).document = pageWindow.document;
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
  pageWindow.document.body.innerHTML = '';
  (globalThis as any).window = savedDom.window;
  (globalThis as any).document = savedDom.document;
  (globalThis as any).chrome = saved.chrome;
  globalThis.fetch = saved.fetch;
  (globalThis as any).Audio = saved.Audio;
  (globalThis as any).URL = saved.URL;
  if (saved.chrome === undefined) delete (globalThis as any).chrome;
  if (saved.Audio === undefined) delete (globalThis as any).Audio;
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
    await until(() => el('buttonText').textContent === 'Speak selected text', 'reset');
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
    await until(() => el('buttonText').textContent === 'Speak selected text', 'reset');
  });

  test('while audio plays the button is an enabled Stop, "Playing audio…" shows, and Stop works', async () => {
    const button = el<HTMLButtonElement>('speakButton');
    button.click();
    await until(() => pendingSpeaks.length > 0, '/speak');
    expect(el('buttonText').textContent).toBe('Generating…');
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

    // A working popup speak clears any error badge a right-click left (D2).
    expect(setBadgeText.mock.calls.map(call => call[0].text)).toContain('');

    button.click();
    expect(audio.pause).toHaveBeenCalled();
    expect(liveUrls.has(audio.src)).toBe(false);
    expect(el('buttonText').textContent).toBe('Speak selected text');
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
    expect(el('buttonText').textContent).toBe('Speak selected text');
  });

  test('on open it asks the offscreen document whether it is speaking (EXT-3)', () => {
    const types = runtimeSendMessage.mock.calls.map(call => (call[0] as { type: string }).type);
    expect(types).toContain('OFFSCREEN_STATUS_QUERY');
  });

  test('right-click / shortcut speech can be stopped from the popup, with no key bound (EXT-3)', async () => {
    const button = el<HTMLButtonElement>('speakButton');
    const speaksBefore = speakCalls();
    onMessage!({ type: 'OFFSCREEN_ACTIVITY', speaking: true });
    expect(el('buttonText').textContent).toBe('Stop');
    expect(button.disabled).toBe(false);

    runtimeSendMessage.mockClear();
    button.click();
    await until(() => el('buttonText').textContent === 'Speak selected text', 'button back to Speak');
    const sent = runtimeSendMessage.mock.calls.map(call => call[0]);
    expect(sent).toEqual([{ type: 'STOP_IN_OFFSCREEN' }]);
    // It stopped the offscreen speech; it did not start a second, overlapping one.
    expect(speakCalls()).toBe(speaksBefore);
  });

  test('the Stop goes away by itself when the offscreen speech ends', () => {
    onMessage!({ type: 'OFFSCREEN_ACTIVITY', speaking: true });
    expect(el('buttonText').textContent).toBe('Stop');
    onMessage!({ type: 'OFFSCREEN_ACTIVITY', speaking: false });
    expect(el('buttonText').textContent).toBe('Speak selected text');
    expect(el<HTMLButtonElement>('speakButton').disabled).toBe(false);
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

  test('voices are grouped by accent and gender with catalogue labels (IN-11)', () => {
    const select = el<HTMLSelectElement>('voiceSelect');
    const groups = [...select.querySelectorAll('optgroup')].map(g => [g.label, [...g.querySelectorAll('option')].map(o => o.textContent)]);
    expect(groups).toEqual([
      ['American Female', ['Bella']],
      ['American Male', ['Michael']],
      ['British Female', ['Emma']],
    ]);
  });

  test('labels come from the catalogue, so a helper label is never rendered, hostile or wrong', async () => {
    voicesPayload = {
      voices: [
        { id: 'af_bella', name: '<img src=x onerror="alert(1)">Bella', language: 'en-US' },
        { id: 'af_sarah', name: 'Sarah (UK)', language: 'en-GB' },
        { id: 'zz_nope', name: 'Not a Kokoro voice', language: 'en-US' },
      ],
    };
    // The retry path reloads voices through the same code.
    el<HTMLButtonElement>('retryButton').click();
    await until(() => el<HTMLSelectElement>('voiceSelect').options.length === 2, 'reloaded');
    const select = el<HTMLSelectElement>('voiceSelect');
    expect(select.querySelector('img')).toBeNull();
    expect([...select.options].map(o => `${o.value}=${o.textContent}`)).toEqual(['af_bella=Bella', 'af_sarah=Sarah']);
    expect(select.textContent).not.toContain('UK');
  });

  test('Retry still works after a successful retry', async () => {
    const retry = el<HTMLButtonElement>('retryButton');
    retry.click();
    await until(() => !retry.disabled, 'first retry finished');
    expect(retry.querySelector('span')!.textContent).toBe('Retry Connection');

    const healthCalls = () => fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/health')).length;
    const before = healthCalls();
    retry.click();
    await until(() => healthCalls() > before, 'second retry reached the helper');
    await until(() => !retry.disabled, 'second retry finished');
  });

  test('a current helper (apiVersion 2) shows no update notice', () => {
    expect(el<HTMLParagraphElement>('helperUpdateNotice').hidden).toBe(true);
  });

  test('an old helper (no apiVersion) shows the update notice and still speaks with its own voices', async () => {
    delete healthPayload.apiVersion;
    voicesPayload = {
      voices: [
        { id: 'af_bella', name: 'Bella (US)', language: 'en-US' },
        { id: 'af_sarah', name: 'Sarah (UK)', language: 'en-GB' },
        { id: 'af_nicole', name: 'Nicole (US)', language: 'en-US' },
        { id: 'af_sky', name: 'Sky (US)', language: 'en-US' },
        { id: 'am_adam', name: 'Adam (US)', language: 'en-US' },
        { id: 'am_michael', name: 'Michael (US)', language: 'en-US' },
      ],
    };
    el<HTMLButtonElement>('retryButton').click();
    await until(() => el<HTMLSelectElement>('voiceSelect').options.length === 6, 'old helper voices');

    const notice = el<HTMLParagraphElement>('helperUpdateNotice');
    expect(notice.hidden).toBe(false);
    // Every pre-1.5 helper was installed from source, where `brew upgrade` fails: the source update.
    expect(notice.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Update the Natural TTS helper. In your source checkout, run: git pull && native-helper/Scripts/quickstart.sh How to update'
    );
    expect(el<HTMLAnchorElement>('helperUpdateSourceLink').getAttribute('href'))
      .toBe('https://github.com/renchris/natural-text-to-voice-extension#updating-a-helper-installed-from-source');
    expect(el('statusLabel').textContent).toBe('Connected');

    const before = speakCalls();
    el<HTMLButtonElement>('speakButton').click();
    await until(() => pendingSpeaks.length > 0, '/speak');
    expect(speakCalls() - before).toBe(1);
    pendingSpeaks.shift()!.resolve();
    await until(() => el('buttonText').textContent === 'Stop', 'playing state');
    lastAudio().finish();
    await until(() => el('buttonText').textContent === 'Speak selected text', 'reset');
  });

  test('the notice goes away once the helper reports apiVersion 2', async () => {
    healthPayload.apiVersion = 2;
    el<HTMLButtonElement>('retryButton').click();
    await until(() => el<HTMLParagraphElement>('helperUpdateNotice').hidden === true, 'notice hidden');
  });

  test('a helper whose engine gave up (/health status "error") is offline with a restart hint, not warming', async () => {
    const saved = { ...healthPayload };
    healthPayload.status = 'error';
    healthPayload.model_loaded = false;
    const retry = el<HTMLButtonElement>('retryButton');
    retry.click();
    await until(() => !retry.disabled, 'retry finished');
    expect(el('statusLabel').textContent).toBe('Offline');
    expect(el('messageContainer').textContent).toContain('Restart the helper');
    Object.assign(healthPayload, saved);
    retry.click();
    await until(() => el('statusLabel').textContent === 'Connected', 'reconnected');
    await until(() => !retry.disabled, 'second retry finished');
  });

  test('Retry while the helper is warming polls until it is ready, instead of reporting an error (EXT-7)', async () => {
    const saved = { ...healthPayload };
    healthPayload.status = 'warming';
    healthPayload.model_loaded = false;
    const retry = el<HTMLButtonElement>('retryButton');
    retry.click();
    await until(() => !retry.disabled, 'retry finished');
    expect(el('statusLabel').textContent).toBe('Warming');
    expect(el('messageContainer').textContent).toContain('Loading TTS model');
    expect(el('messageContainer').className).not.toContain('message-error');
    expect(el<HTMLButtonElement>('speakButton').disabled).toBe(true);

    Object.assign(healthPayload, saved);
    for (let i = 0; i < 100 && el('statusLabel').textContent !== 'Connected'; i++) {
      await new Promise(r => setTimeout(r, 50));
    }
    expect(el('statusLabel').textContent).toBe('Connected');
    await until(() => !el<HTMLButtonElement>('speakButton').disabled, 'speak enabled');
  });

  test('every request went to the mocked 127.0.0.1:18249', () => {
    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith('http://127.0.0.1:18249/')).toBe(true);
  });
});


describe('system-voice fallback in the popup (OD-2)', () => {
  const retry = async () => {
    const button = el<HTMLButtonElement>('retryButton');
    button.click();
    await until(() => !button.disabled && button.querySelector('span')!.textContent === 'Retry Connection', 'retry finished');
    await tick();
  };
  const sent = (type: string) => runtimeSendMessage.mock.calls.map(call => call[0] as any).filter(m => m?.type === type);
  const notice = () => el<HTMLParagraphElement>('fallbackNotice');
  const engine = () => el<HTMLParagraphElement>('engineStatus');

  test('a helper that answers its identity probe but then times out keeps the error state: no fallback promise', async () => {
    healthScript = ['ok', 'abort'];
    try {
      await retry();
      expect(el('statusLabel').textContent).toBe('Offline');
      expect(el('messageContainer').className).toBe('message message-error');
      expect(el('messageContainer').textContent).not.toContain('system voice');
      expect(el<HTMLButtonElement>('speakButton').disabled).toBe(true);
      expect(notice().hidden).toBe(true);
    } finally {
      healthScript = [];
    }
  });

  test('an installed helper whose engine stopped: system voice with a restart hint, no install notice', async () => {
    const savedHealth = { ...healthPayload };
    healthPayload.status = 'error';
    healthPayload.model_loaded = false;
    try {
      await retry();
      expect(el('statusLabel').textContent).toBe('Offline');
      expect(el('messageContainer').className).toBe('message message-info');
      expect(el('messageContainer').textContent).toContain('Restart the helper');
      expect(el<HTMLButtonElement>('speakButton').disabled).toBe(false);
      expect(notice().hidden).toBe(true);
    } finally {
      Object.assign(healthPayload, savedHealth);
    }
  });

  test('helper unreachable: Offline, an info message (not an error), Speak enabled, the install notice with its link', async () => {
    helperDown = true;
    await retry();
    expect(el('statusLabel').textContent).toBe('Offline');
    expect(el('messageContainer').className).toBe('message message-info');
    expect(el('messageContainer').textContent).toContain('system voice');
    expect(el<HTMLButtonElement>('speakButton').disabled).toBe(false);
    expect(el<HTMLSelectElement>('voiceSelect').disabled).toBe(true);
    expect(el<HTMLButtonElement>('retryButton').style.display).toBe('flex');
    expect(notice().hidden).toBe(false);
    expect(notice().textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Install the free Natural TTS helper for natural Kokoro voices: ' +
      'brew install renchris/tap/natural-tts && brew services start natural-tts or build it from source'
    );
    const parts = [...el('helperInstallCommand').querySelectorAll('.command-part')].map(p => p.textContent);
    expect(parts).toEqual(['brew install renchris/tap/natural-tts &&', 'brew services start natural-tts']);
    const link = el<HTMLAnchorElement>('fallbackNoticeLink');
    expect(link.textContent).toBe('or build it from source');
    expect(link.getAttribute('href')).toBe('https://github.com/renchris/natural-text-to-voice-extension#install');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  test('Speak goes to the service worker\'s system voice, and the popup says "System voice" with a working Stop', async () => {
    runtimeSendMessage.mockClear();
    const button = el<HTMLButtonElement>('speakButton');
    button.click();
    await until(() => el('buttonText').textContent === 'Stop', 'system voice playing');

    expect(sent('SPEAK_WITH_SYSTEM_VOICE')).toEqual([
      { type: 'SPEAK_WITH_SYSTEM_VOICE', text: 'Hello from the page', voice: 'af_bella', speed: 1 },
    ]);
    expect(button.disabled).toBe(false);
    expect(engine().hidden).toBe(false);
    expect(engine().textContent).toBe('System voice');
    expect(notice().hidden).toBe(false);

    // A late "Kokoro ended" (the failed helper attempt) does not drop the system voice's Stop.
    onMessage!({ type: 'OFFSCREEN_ACTIVITY', speaking: false, engine: 'kokoro' });
    expect(el('buttonText').textContent).toBe('Stop');

    runtimeSendMessage.mockClear();
    button.click();
    await until(() => el('buttonText').textContent === 'Speak selected text', 'stopped');
    expect(sent('STOP_IN_OFFSCREEN')).toEqual([{ type: 'STOP_IN_OFFSCREEN' }]);
    expect(engine().hidden).toBe(true);
    expect(el<HTMLButtonElement>('speakButton').disabled).toBe(false);
  });

  test('the Stop goes away when the service worker reports the system voice ended', async () => {
    el<HTMLButtonElement>('speakButton').click();
    await until(() => el('buttonText').textContent === 'Stop', 'system voice playing');
    onMessage!({ type: 'OFFSCREEN_ACTIVITY', speaking: false, engine: 'system' });
    expect(el('buttonText').textContent).toBe('Speak selected text');
    expect(engine().hidden).toBe(true);
  });

  test('the system voice failing too is an error in the popup', async () => {
    systemVoiceReply = { type: 'SPEAK_ERROR', success: false, error: 'The system voice could not speak this text.', engine: 'system' };
    el<HTMLButtonElement>('speakButton').click();
    await until(() => el('messageContainer').className === 'message message-error', 'error shown');
    expect(el('messageContainer').textContent).toContain('the system voice could not speak');
    expect(el('buttonText').textContent).toBe('Speak selected text');
    systemVoiceReply = { type: 'SPEAK_STARTED', success: true, engine: 'system' };
  });

  test('"Show an error": the old error state, Speak disabled, no notice, nothing sent to the system voice', async () => {
    storage.whenHelperUnavailable = 'error';
    runtimeSendMessage.mockClear();
    await retry();
    expect(el('messageContainer').className).toBe('message message-error');
    expect(el<HTMLButtonElement>('speakButton').disabled).toBe(true);
    expect(notice().hidden).toBe(true);
    expect(sent('SPEAK_WITH_SYSTEM_VOICE')).toEqual([]);
    delete storage.whenHelperUnavailable;
  });

  test('helper back: the notice goes, and Kokoro speech is labelled "Kokoro · <voice>"', async () => {
    helperDown = false;
    await retry();
    expect(el('statusLabel').textContent).toBe('Connected');
    expect(notice().hidden).toBe(true);

    el<HTMLButtonElement>('speakButton').click();
    await until(() => pendingSpeaks.length > 0, '/speak');
    pendingSpeaks.shift()!.resolve();
    await until(() => el('buttonText').textContent === 'Stop', 'playing state');
    expect(engine().textContent).toBe('Kokoro · Bella (US)');
    expect(engine().hidden).toBe(false);
    lastAudio().finish();
    await until(() => el('buttonText').textContent === 'Speak selected text', 'reset');
    expect(engine().hidden).toBe(true);
  });

  test('right-click Kokoro speech is labelled with its voice', () => {
    onMessage!({ type: 'OFFSCREEN_ACTIVITY', speaking: true, engine: 'kokoro', voice: 'bf_emma' });
    expect(engine().textContent).toBe('Kokoro · Emma (UK)');
    onMessage!({ type: 'OFFSCREEN_ACTIVITY', speaking: false, engine: 'kokoro' });
    expect(engine().hidden).toBe(true);
  });

  test('the helper going away after the popup opened: Speak falls back to the system voice', async () => {
    expect(el('statusLabel').textContent).toBe('Connected');
    helperDown = true;
    runtimeSendMessage.mockClear();
    el<HTMLButtonElement>('speakButton').click();
    await until(() => el('buttonText').textContent === 'Stop', 'system voice playing');
    expect(sent('SPEAK_WITH_SYSTEM_VOICE')).toHaveLength(1);
    expect(el('statusLabel').textContent).toBe('Offline');
    expect(notice().hidden).toBe(false);
    onMessage!({ type: 'OFFSCREEN_ACTIVITY', speaking: false, engine: 'system' });
    helperDown = false;
  });
});

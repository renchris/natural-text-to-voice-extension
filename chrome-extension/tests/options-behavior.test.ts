/**
 * Behavioural tests for the options page voice list (IN-11).
 *
 * Loads the real options.html body and options.ts against mocked chrome and
 * fetch. No network: every request is asserted to go to the mocked
 * 127.0.0.1:18249.
 */

import { describe, test, expect, mock, beforeAll, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';

// A document of its own: page modules bind to the global document at import
// and listen for DOMContentLoaded on it, so a shared one would let another
// page suite's DOMContentLoaded run this page's init (and vice versa).
const pageWindow = new Window();
const savedDom = { window: (globalThis as any).window, document: (globalThis as any).document };

const OLD_HELPER_VOICES = [
  { id: 'af_bella', name: 'Bella (US)', language: 'en-US' },
  { id: 'af_sarah', name: 'Sarah (UK)', language: 'en-GB' },
  { id: 'af_nicole', name: 'Nicole (US)', language: 'en-US' },
  { id: 'af_sky', name: 'Sky (US)', language: 'en-US' },
  { id: 'am_adam', name: 'Adam (US)', language: 'en-US' },
  { id: 'am_michael', name: 'Michael (US)', language: 'en-US' },
];

let voicesAvailable = true;
const fetchMock = mock(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.endsWith('/health')) {
    return new Response(JSON.stringify({ status: 'ok', model: 'kokoro-82m', model_loaded: true }), { status: 200 });
  }
  if (url.endsWith('/voices')) {
    if (!voicesAvailable) return new Response('{"error":"internal_error"}', { status: 500 });
    return new Response(JSON.stringify({ voices: OLD_HELPER_VOICES }), { status: 200 });
  }
  return new Response('not found', { status: 404 });
});

const storage: Record<string, unknown> = {
  native_tts_helper_config: { port: 18249, default_voice: 'af_bella' },
  selectedVoice: 'am_adam',
};
let onStorageChanged: ((changes: unknown) => void) | null = null;

const saved = { chrome: (globalThis as any).chrome, fetch: globalThis.fetch };

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function until(condition: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (condition()) return;
    await new Promise(r => setTimeout(r, 1));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function groups(): Record<string, string[]> {
  const select = el<HTMLSelectElement>('voiceSelect');
  return Object.fromEntries(
    [...select.querySelectorAll('optgroup')].map(g => [g.label, [...g.querySelectorAll('option')].map(o => `${o.value}=${o.textContent}`)])
  );
}

beforeAll(async () => {
  (globalThis as any).window = pageWindow;
  (globalThis as any).document = pageWindow.document;
  (globalThis as any).chrome = {
    runtime: { getManifest: () => ({ version: '1.4.0' }) },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter(k => k in storage).map(k => [k, storage[k]]));
        },
        set: async (items: Record<string, unknown>) => { Object.assign(storage, items); },
      },
      onChanged: { addListener: (fn: (changes: unknown) => void) => { onStorageChanged = fn; } },
    },
  };
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const html = readFileSync(join(import.meta.dir, '../src/options/options.html'), 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');
  await import('../src/options/options');
  document.dispatchEvent(new (window as any).Event('DOMContentLoaded'));
  await until(() => el<HTMLSelectElement>('voiceSelect').querySelectorAll('optgroup').length > 0, 'voices');
});

afterAll(() => {
  pageWindow.document.body.innerHTML = '';
  (globalThis as any).window = savedDom.window;
  (globalThis as any).document = savedDom.document;
  (globalThis as any).chrome = saved.chrome;
  globalThis.fetch = saved.fetch;
  if (saved.chrome === undefined) delete (globalThis as any).chrome;
});

describe('options voice list (IN-11)', () => {
  test('an old six-voice helper: only its voices, grouped, with catalogue labels', () => {
    expect(groups()).toEqual({
      'American Female': ['af_bella=Bella', 'af_nicole=Nicole', 'af_sarah=Sarah', 'af_sky=Sky'],
      'American Male': ['am_michael=Michael', 'am_adam=Adam'],
    });
    // "Sarah (UK)" from the old helper never reaches the page.
    expect(el('voiceSelect').textContent).not.toContain('UK');
  });

  test('the stored voice is selected', () => {
    expect(el<HTMLSelectElement>('voiceSelect').value).toBe('am_adam');
  });

  test('helper voices unavailable: the full 28-voice catalogue in four groups', async () => {
    voicesAvailable = false;
    onStorageChanged!({});
    await until(() => el<HTMLSelectElement>('voiceSelect').options.length === 28, 'catalogue fallback');
    const g = groups();
    expect(Object.keys(g)).toEqual(['American Female', 'American Male', 'British Female', 'British Male']);
    expect(g['British Male']).toEqual(['bm_fable=Fable', 'bm_george=George', 'bm_lewis=Lewis', 'bm_daniel=Daniel']);
    expect(el<HTMLSelectElement>('voiceSelect').value).toBe('am_adam');
  });

  test('"When the helper isn\'t running" offers system voices (default) or an error (OD-2)', () => {
    const select = el<HTMLSelectElement>('fallbackSelect');
    const label = document.querySelector('label[for="fallbackSelect"]')!;
    expect(label.textContent).toBe("When the helper isn't running:");
    expect([...select.options].map(o => `${o.value}=${o.textContent}`)).toEqual([
      'system-voice=Use system voices',
      'error=Show an error',
    ]);
    expect(select.value).toBe('system-voice');
  });

  test('the choice is saved to chrome.storage.local with the other settings, and shown again', async () => {
    const select = el<HTMLSelectElement>('fallbackSelect');
    select.value = 'error';
    el<HTMLButtonElement>('saveButton').click();
    await until(() => storage.whenHelperUnavailable === 'error', 'saved');
    expect(storage.selectedVoice).toBe('am_adam');
    expect(typeof storage.selectedSpeed).toBe('number');

    select.value = 'system-voice';
    onStorageChanged!({});
    await until(() => el<HTMLSelectElement>('fallbackSelect').value === 'error', 'reloaded from storage');
  });

  test('every request went to the mocked 127.0.0.1:18249', () => {
    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith('http://127.0.0.1:18249/')).toBe(true);
  });
});

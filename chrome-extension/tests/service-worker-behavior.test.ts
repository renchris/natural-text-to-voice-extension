/**
 * Behavioural tests for the background service worker.
 *
 * The real module is imported against a mocked `chrome` global; the listeners
 * it registers are captured and driven directly, so these tests exercise the
 * shipped code paths rather than restating constants.
 */

import { describe, test, expect, mock, beforeAll, beforeEach, afterAll } from 'bun:test';

type Listener = (...args: any[]) => unknown;

const listeners: Record<string, Listener> = {};
function capture(name: string) {
  return { addListener: (fn: Listener) => { listeners[name] = fn; } };
}

let pageSelection: unknown = '';
let executeScriptThrows = false;

let executeScriptDelayMs = 0;
const executeScript = mock(async (_injection: unknown) => {
  if (executeScriptDelayMs) await new Promise(r => setTimeout(r, executeScriptDelayMs));
  if (executeScriptThrows) throw new Error('Cannot access contents of the page');
  // The page answers { text, pdf } (selection.ts probeSelection); a string here is its text.
  return [{ result: typeof pageSelection === 'string' ? { text: pageSelection, pdf: false } : pageSelection }];
});
const defaultSendMessage = async (message: { type: string }): Promise<unknown> => {
  if (message.type === 'SPEAK_IN_OFFSCREEN') return { type: 'SPEAK_COMPLETE', success: true };
  return undefined;
};
const sendMessage = mock(defaultSendMessage);
let offscreenExists = true;
const getContexts = mock(async (_filter: unknown) => (offscreenExists ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : []));
const createDocument = mock(async (_params: unknown) => { offscreenExists = true; });
const closeDocument = mock(async () => { offscreenExists = false; });

// chrome.tts: speak() starts at once ("start" event) unless ttsMode says otherwise.
let ttsMode: 'start' | 'reject' = 'start';
let ttsOnEvent: ((event: { type: string; errorMessage?: string }) => void) | null = null;
const ttsSpeak = mock(async (_text: string, options: { onEvent?: (event: { type: string }) => void }) => {
  ttsOnEvent = options.onEvent ?? null;
  if (ttsMode === 'reject') throw new Error('No voice');
  queueMicrotask(() => options.onEvent?.({ type: 'start' }));
});
const ttsStop = mock(() => {
  const onEvent = ttsOnEvent;
  ttsOnEvent = null;
  onEvent?.({ type: 'interrupted' });
});
const ttsGetVoices = mock(async () => [
  { voiceName: 'Samantha', lang: 'en-US', remote: false },
  { voiceName: 'Daniel', lang: 'en-GB', remote: false },
]);
let storedSettings: Record<string, unknown> = { selectedVoice: 'af_nicole', selectedSpeed: 1.25 };

const setBadgeText = mock(async (_details: { text: string }) => {});
const setBadgeBackgroundColor = mock(async (_details: { color: string }) => {});
const setTitle = mock(async (_details: { title: string }) => {});

const mockChrome = {
  action: { setBadgeText, setBadgeBackgroundColor, setTitle },
  runtime: {
    getManifest: () => ({
      name: 'Natural TTS: Private Kokoro Voices for Mac',
      short_name: 'Natural TTS',
      version: '1.4.0',
      action: { default_title: 'Natural TTS' },
    }),
    onInstalled: capture('onInstalled'),
    onStartup: capture('onStartup'),
    onMessage: capture('runtime.onMessage'),
    getContexts,
    getURL: (path: string) => `chrome-extension://test-id/${path.replace(/^\//, '')}`,
    sendMessage,
  },
  contextMenus: {
    onClicked: capture('contextMenus.onClicked'),
    create: mock(() => {}),
    removeAll: mock(async () => {}),
  },
  commands: {
    onCommand: capture('commands.onCommand'),
  },
  scripting: { executeScript },
  offscreen: { createDocument, closeDocument },
  tts: { speak: ttsSpeak, stop: ttsStop, getVoices: ttsGetVoices },
  storage: {
    local: {
      get: mock(async () => ({ ...storedSettings })),
      set: mock(async () => {}),
    },
  },
};

const originalChrome = (globalThis as any).chrome;

beforeAll(async () => {
  (globalThis as any).chrome = mockChrome;
  await import('../src/background/service-worker');
});

afterAll(() => {
  if (originalChrome === undefined) {
    delete (globalThis as any).chrome;
  } else {
    (globalThis as any).chrome = originalChrome;
  }
});

beforeEach(() => {
  (globalThis as any).chrome = mockChrome;
  pageSelection = '';
  executeScriptThrows = false;
  executeScriptDelayMs = 0;
  offscreenExists = true;
  executeScript.mockClear();
  sendMessage.mockClear();
  sendMessage.mockImplementation(defaultSendMessage);
  getContexts.mockClear();
  createDocument.mockClear();
  createDocument.mockImplementation(async () => { offscreenExists = true; });
  closeDocument.mockClear();
  setBadgeText.mockClear();
  setBadgeBackgroundColor.mockClear();
  setTitle.mockClear();
  ttsMode = 'start';
  ttsOnEvent = null;
  ttsSpeak.mockClear();
  ttsStop.mockClear();
  ttsGetVoices.mockClear();
  storedSettings = { selectedVoice: 'af_nicole', selectedSpeed: 1.25 };
});

function speakMessages(): Array<{ type: string; text: string; voice: string; speed: number }> {
  return sendMessage.mock.calls
    .map(call => call[0] as any)
    .filter(message => message.type === 'SPEAK_IN_OFFSCREEN');
}

describe('context menu → selection → offscreen', () => {
  test('reads the selection on demand from the clicked tab and speaks it', async () => {
    pageSelection = 'Hello from the page';

    await listeners['contextMenus.onClicked'](
      { menuItemId: 'natural-tts-speak-selection', selectionText: 'Hello from the page', pageUrl: 'https://example.com/' },
      { id: 11 }
    );

    expect(executeScript).toHaveBeenCalledTimes(1);
    expect((executeScript.mock.calls[0][0] as any).target).toEqual({ tabId: 11 });
    expect(speakMessages()).toEqual([
      { type: 'SPEAK_IN_OFFSCREEN', text: 'Hello from the page', voice: 'af_nicole', speed: 1.25 },
    ]);
  });

  test('falls back to info.selectionText when injection fails (PDF viewer, iframe)', async () => {
    executeScriptThrows = true;

    await listeners['contextMenus.onClicked'](
      { menuItemId: 'natural-tts-speak-selection', selectionText: 'The e€ect', pageUrl: 'https://example.com/doc.pdf' },
      { id: 12 }
    );

    expect(speakMessages().map(m => m.text)).toEqual(['The effect']);
  });

  test('ignores other menu items', async () => {
    await listeners['contextMenus.onClicked'](
      { menuItemId: 'something-else', selectionText: 'x' },
      { id: 1 }
    );

    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('sends nothing when there is no selection at all', async () => {
    await listeners['contextMenus.onClicked'](
      { menuItemId: 'natural-tts-speak-selection', pageUrl: 'https://example.com/' },
      { id: 13 }
    );

    expect(speakMessages()).toEqual([]);
  });
});

describe('keyboard commands (IN-12)', () => {
  test('stop-speaking broadcasts STOP_IN_OFFSCREEN', async () => {
    await listeners['commands.onCommand']('stop-speaking', { id: 3 });

    expect(sendMessage.mock.calls.map(call => call[0])).toEqual([{ type: 'STOP_IN_OFFSCREEN' }]);
    expect(executeScript).not.toHaveBeenCalled();
  });

  test('stop-speaking with no receiver (nothing ever spoke) does not throw', async () => {
    sendMessage.mockImplementationOnce(async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });

    await expect(listeners['commands.onCommand']('stop-speaking', undefined)).resolves.toBeUndefined();
  });

  test('speak-selection reads the selection in the command tab and speaks it', async () => {
    pageSelection = '  Shortcut text  ';

    await listeners['commands.onCommand']('speak-selection', { id: 21 });

    expect((executeScript.mock.calls[0][0] as any).target).toEqual({ tabId: 21 });
    expect(speakMessages()).toEqual([
      { type: 'SPEAK_IN_OFFSCREEN', text: 'Shortcut text', voice: 'af_nicole', speed: 1.25 },
    ]);
  });

  test('speak-selection does nothing when nothing is selected or the page cannot be scripted', async () => {
    pageSelection = '';
    await listeners['commands.onCommand']('speak-selection', { id: 22 });

    executeScriptThrows = true;
    await listeners['commands.onCommand']('speak-selection', { id: 23 });

    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('speak-selection without a tab does not inject', async () => {
    await listeners['commands.onCommand']('speak-selection', undefined);

    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('a stop pressed while the offscreen document is being created is not lost (EXT-6)', async () => {
    pageSelection = 'Wrong text, stop it';
    offscreenExists = false; // first use: createDocument + the 300 ms settle
    const speaking = listeners['contextMenus.onClicked'](
      { menuItemId: 'natural-tts-speak-selection', pageUrl: 'https://example.com/' },
      { id: 21 }
    );
    await new Promise(r => setTimeout(r, 60));
    await listeners['commands.onCommand']('stop-speaking', { id: 21 });
    await speaking;
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(speakMessages()).toEqual([]);
  });

  test('a stop pressed while the shortcut reads the selection is not lost (EXT-6)', async () => {
    pageSelection = 'Wrong text, stop it';
    executeScriptDelayMs = 80;
    const speaking = listeners['commands.onCommand']('speak-selection', { id: 22 });
    await new Promise(r => setTimeout(r, 20));
    await listeners['commands.onCommand']('stop-speaking', { id: 22 });
    await speaking;
    expect(speakMessages()).toEqual([]);

    // A stop only cancels what was asked for before it: the next request speaks.
    executeScriptDelayMs = 0;
    await listeners['commands.onCommand']('speak-selection', { id: 22 });
    expect(speakMessages().map(m => m.text)).toEqual(['Wrong text, stop it']);
  });

  test('unknown commands are ignored', async () => {
    await listeners['commands.onCommand']('something-else', { id: 1 });

    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('offscreen lifetime (IN-09)', () => {
  const click = (tabId: number) => listeners['contextMenus.onClicked'](
    { menuItemId: 'natural-tts-speak-selection', selectionText: 'Read this', pageUrl: 'https://example.com/' },
    { id: tabId }
  );

  test('creates the document with AUDIO_PLAYBACK + BLOBS and a truthful justification', async () => {
    offscreenExists = false;
    pageSelection = 'Read this';

    await click(31);

    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(createDocument.mock.calls[0][0]).toEqual({
      url: 'offscreen/offscreen.html',
      reasons: ['AUDIO_PLAYBACK', 'BLOBS'],
      justification: 'Plays speech generated by the local helper via object URLs, independent of the popup',
    });
    expect(getContexts.mock.calls[0][0]).toEqual({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: ['chrome-extension://test-id/offscreen/offscreen.html'],
    });
    expect(speakMessages().map(m => m.text)).toEqual(['Read this']);
  });

  test('does not create a second document when one already exists', async () => {
    pageSelection = 'Read this';
    await click(32);
    expect(createDocument).not.toHaveBeenCalled();
  });

  test('two requests at once create the document exactly once (single-flight)', async () => {
    offscreenExists = false;
    // getContexts keeps answering "none" until creation finishes, so without
    // the single-flight guard both requests would call createDocument.
    getContexts.mockImplementation(async () => []);
    pageSelection = 'Read this';

    await Promise.all([click(33), click(34)]);

    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(speakMessages()).toHaveLength(2);
    getContexts.mockImplementation(async () => (offscreenExists ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : []));
  });

  test('a createDocument failure is logged with console.warn, not swallowed', async () => {
    offscreenExists = false;
    const failure = new Error('Only a single offscreen document may be created.');
    createDocument.mockImplementation(async () => { throw failure; });
    const warn = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warn as any;
    try {
      pageSelection = 'Read this';
      await click(35);
    } finally {
      console.warn = originalWarn;
    }
    expect(warn.mock.calls.some(call => (call as unknown[]).includes(failure))).toBe(true);
  });

  test('OFFSCREEN_IDLE closes the document', async () => {
    listeners['runtime.onMessage']({ type: 'OFFSCREEN_IDLE' });
    await new Promise(r => setTimeout(r, 0));
    expect(closeDocument).toHaveBeenCalledTimes(1);
  });

  test('OFFSCREEN_IDLE is ignored while a speak request is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    sendMessage.mockImplementation(async (message: { type: string }) => {
      if (message.type === 'SPEAK_IN_OFFSCREEN') {
        await gate;
        return { type: 'SPEAK_COMPLETE', success: true };
      }
      return undefined;
    });
    pageSelection = 'Read this';
    const speaking = click(36);
    for (let i = 0; i < 50 && speakMessages().length === 0; i++) await new Promise(r => setTimeout(r, 1));

    listeners['runtime.onMessage']({ type: 'OFFSCREEN_IDLE' });
    await new Promise(r => setTimeout(r, 0));
    expect(closeDocument).not.toHaveBeenCalled();

    release();
    await speaking;
    listeners['runtime.onMessage']({ type: 'OFFSCREEN_IDLE' });
    await new Promise(r => setTimeout(r, 0));
    expect(closeDocument).toHaveBeenCalledTimes(1);
  });

  test('a closeDocument failure does not throw', async () => {
    closeDocument.mockImplementationOnce(async () => { throw new Error('No current offscreen document.'); });
    listeners['runtime.onMessage']({ type: 'OFFSCREEN_IDLE' });
    await new Promise(r => setTimeout(r, 0));
    expect(closeDocument).toHaveBeenCalledTimes(1);
  });
});

describe('error badge for right-click and shortcut speech (D2)', () => {
  const HELPER_DOWN = 'The Natural TTS helper is not running. Start it, then try again.';
  const click = (tabId: number) => listeners['contextMenus.onClicked'](
    { menuItemId: 'natural-tts-speak-selection', selectionText: 'Read this', pageUrl: 'https://example.com/' },
    { id: tabId }
  );
  const badgeTexts = () => setBadgeText.mock.calls.map(call => call[0].text);
  const titles = () => setTitle.mock.calls.map(call => call[0].title);

  test('a failed right-click speak shows a red "!" and the reason in the tooltip', async () => {
    pageSelection = 'Read this';
    sendMessage.mockImplementation(async (message: { type: string }) =>
      message.type === 'SPEAK_IN_OFFSCREEN' ? { type: 'SPEAK_ERROR', success: false, error: HELPER_DOWN } : undefined
    );

    await click(41);

    expect(badgeTexts()).toEqual(['!']);
    expect(setBadgeBackgroundColor.mock.calls.map(call => call[0].color)).toEqual(['#D93025']);
    expect(titles()).toEqual([`Natural TTS: ${HELPER_DOWN}`]);
  });

  test('the next success clears the badge and restores the tooltip', async () => {
    pageSelection = 'Read this';
    await click(42);

    expect(badgeTexts()).toEqual(['']);
    expect(titles()).toEqual(['Natural TTS']);
    expect(setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  test('a deliberate stop counts as success and clears the badge', async () => {
    pageSelection = 'Read this';
    sendMessage.mockImplementation(async (message: { type: string }) =>
      message.type === 'SPEAK_IN_OFFSCREEN' ? { type: 'SPEAK_STOPPED', success: true } : undefined
    );
    await click(43);
    expect(badgeTexts()).toEqual(['']);
  });

  test('an unreachable offscreen document shows the badge', async () => {
    pageSelection = 'Read this';
    sendMessage.mockImplementation(async () => { throw new Error('Receiving end does not exist.'); });
    await click(44);
    expect(badgeTexts()).toEqual(['!']);
    expect(titles()).toEqual(['Natural TTS: Could not start audio playback. Try again.']);
  });

  test('a shortcut with nothing selected shows the badge instead of failing silently', async () => {
    pageSelection = '';
    await listeners['commands.onCommand']('speak-selection', { id: 45 });
    expect(badgeTexts()).toEqual(['!']);
    expect(titles()[0]).toStartWith('Natural TTS: Nothing to speak.');
    expect(speakMessages()).toEqual([]);
  });

  test('a right-click whose selection cannot be read shows the badge', async () => {
    executeScriptThrows = true;
    await listeners['contextMenus.onClicked'](
      { menuItemId: 'natural-tts-speak-selection', pageUrl: 'https://example.com/' },
      { id: 46 }
    );
    expect(badgeTexts()).toEqual(['!']);
  });

  test('a started playback clears the badge at once; its end arrives later as SPEAK_FINISHED (EXT-8)', async () => {
    pageSelection = 'Read this';
    sendMessage.mockImplementation(async (message: { type: string }) =>
      message.type === 'SPEAK_IN_OFFSCREEN' ? { type: 'SPEAK_STARTED', success: true } : undefined
    );
    await click(48);
    expect(badgeTexts()).toEqual(['']);

    const onMessage = listeners['runtime.onMessage'];
    onMessage({ type: 'SPEAK_FINISHED', success: false, error: 'Failed to play audio: decode failed' });
    await new Promise(r => setTimeout(r, 5));
    expect(badgeTexts()).toEqual(['', '!']);
    expect(titles()[titles().length - 1]).toBe('Natural TTS: Failed to play audio: decode failed');

    onMessage({ type: 'SPEAK_FINISHED', success: true, stopped: true });
    await new Promise(r => setTimeout(r, 5));
    expect(badgeTexts()).toEqual(['', '!', '']);
  });

  test('stop-speaking leaves the badge alone', async () => {
    await listeners['commands.onCommand']('stop-speaking', { id: 47 });
    expect(setBadgeText).not.toHaveBeenCalled();
  });
});

describe('system-voice fallback when the helper is unavailable (OD-2)', () => {
  const HELPER_DOWN = 'The Natural TTS helper is not running. Start it, then try again.';
  const UNAVAILABLE = { type: 'SPEAK_ERROR', success: false, error: HELPER_DOWN, helperUnavailable: true };
  const click = (tabId: number) => listeners['contextMenus.onClicked'](
    { menuItemId: 'natural-tts-speak-selection', selectionText: 'Read this', pageUrl: 'https://example.com/' },
    { id: tabId }
  );
  const badgeTexts = () => setBadgeText.mock.calls.map(call => call[0].text);
  const titles = () => setTitle.mock.calls.map(call => call[0].title);
  const offscreenReplies = (reply: unknown) =>
    sendMessage.mockImplementation(async (message: { type: string }) =>
      message.type === 'SPEAK_IN_OFFSCREEN' ? reply : undefined
    );
  const onMessage = (message: unknown) =>
    new Promise<{ returned: unknown; response: unknown }>(resolve => {
      let returned: unknown;
      const timer = setTimeout(() => resolve({ returned, response: undefined }), 50);
      returned = listeners['runtime.onMessage'](message, {}, (response: unknown) => {
        clearTimeout(timer);
        resolve({ returned, response });
      });
    });
  const activity = () => sendMessage.mock.calls.map(call => call[0] as any).filter(m => m.type === 'OFFSCREEN_ACTIVITY');

  test('helper unreachable: the same text is spoken with chrome.tts at the mapped rate, and no badge', async () => {
    pageSelection = 'Read this';
    offscreenReplies(UNAVAILABLE);

    await click(51);

    expect(speakMessages().map(m => m.text)).toEqual(['Read this']);
    expect(ttsSpeak).toHaveBeenCalledTimes(1);
    const [text, options] = ttsSpeak.mock.calls[0]! as [string, Record<string, unknown>];
    expect(text).toBe('Read this');
    // af_nicole is American: the local en-US voice, speed 1.25 carried over as the rate.
    expect({ rate: options.rate, lang: options.lang, voiceName: options.voiceName, enqueue: options.enqueue })
      .toEqual({ rate: 1.25, lang: 'en-US', voiceName: 'Samantha', enqueue: false });
    expect(badgeTexts()).toEqual(['']);
    expect(setBadgeBackgroundColor).not.toHaveBeenCalled();
    expect(activity()).toEqual([{ type: 'OFFSCREEN_ACTIVITY', speaking: true, engine: 'system' }]);

    // It ends by itself: the popup is told, the badge stays clear.
    ttsOnEvent!({ type: 'end' });
    await new Promise(r => setTimeout(r, 5));
    expect(activity()[activity().length - 1]).toEqual({ type: 'OFFSCREEN_ACTIVITY', speaking: false, engine: 'system' });
    expect(badgeTexts()).not.toContain('!');
  });

  test('a British Kokoro voice picks a British system voice', async () => {
    storedSettings = { selectedVoice: 'bf_emma', selectedSpeed: 0.8 };
    pageSelection = 'Read this';
    offscreenReplies(UNAVAILABLE);
    await click(52);
    const options = ttsSpeak.mock.calls[0]![1] as Record<string, unknown>;
    expect([options.voiceName, options.lang, options.rate]).toEqual(['Daniel', 'en-GB', 0.8]);
    ttsOnEvent!({ type: 'end' });
  });

  test('"Show an error": no system voice, the red badge as before', async () => {
    storedSettings = { selectedVoice: 'af_nicole', selectedSpeed: 1.25, whenHelperUnavailable: 'error' };
    pageSelection = 'Read this';
    offscreenReplies(UNAVAILABLE);
    await click(53);
    expect(ttsSpeak).not.toHaveBeenCalled();
    expect(badgeTexts()).toEqual(['!']);
    expect(titles()).toEqual([`Natural TTS: ${HELPER_DOWN}`]);
  });

  test('a helper that answers with an error (4xx, bad input) does not fall back', async () => {
    pageSelection = 'Read this';
    offscreenReplies({ type: 'SPEAK_ERROR', success: false, error: 'Your Natural TTS helper does not have this voice.' });
    await click(54);
    expect(ttsSpeak).not.toHaveBeenCalled();
    expect(badgeTexts()).toEqual(['!']);
  });

  test('the system voice failing too shows the badge, naming both', async () => {
    ttsMode = 'reject';
    pageSelection = 'Read this';
    offscreenReplies(UNAVAILABLE);
    await click(55);
    expect(ttsSpeak).toHaveBeenCalledTimes(1);
    expect(badgeTexts()).toEqual(['!']);
    expect(titles()[0]).toBe(
      'Natural TTS: The Natural TTS helper is not running, and the system voice could not speak. Start the helper, then try again.'
    );
  });

  test('a system voice failing mid-speech shows the badge', async () => {
    pageSelection = 'Read this';
    offscreenReplies(UNAVAILABLE);
    await click(56);
    ttsOnEvent!({ type: 'error', errorMessage: 'audio device lost' });
    await new Promise(r => setTimeout(r, 5));
    expect(badgeTexts()).toEqual(['', '!']);
  });

  test('stop-speaking stops chrome.tts too, and leaves the badge alone', async () => {
    pageSelection = 'Read this';
    offscreenReplies(UNAVAILABLE);
    await click(57);
    setBadgeText.mockClear();
    ttsStop.mockClear();

    await listeners['commands.onCommand']('stop-speaking', { id: 57 });
    expect(ttsStop).toHaveBeenCalledTimes(1);
    const status = await onMessage({ type: 'SYSTEM_VOICE_STATUS_QUERY' });
    expect(status.response).toEqual({ type: 'SYSTEM_VOICE_STATUS', speaking: false });
    expect(badgeTexts()).not.toContain('!');
  });

  test('a new request supersedes the system voice before it asks the helper', async () => {
    pageSelection = 'Read this';
    offscreenReplies(UNAVAILABLE);
    await click(58);
    ttsStop.mockClear();
    sendMessage.mockImplementation(defaultSendMessage);
    await click(58);
    expect(ttsStop).toHaveBeenCalled();
    expect((await onMessage({ type: 'SYSTEM_VOICE_STATUS_QUERY' })).response)
      .toEqual({ type: 'SYSTEM_VOICE_STATUS', speaking: false });
  });

  test('popup: SPEAK_WITH_SYSTEM_VOICE speaks, reports SPEAK_STARTED, and answers the status query', async () => {
    const { returned, response } = await onMessage({ type: 'SPEAK_WITH_SYSTEM_VOICE', text: 'From the popup', voice: 'am_michael', speed: 2 });
    expect(returned).toBe(true);
    expect(response).toEqual({ type: 'SPEAK_STARTED', success: true, engine: 'system' });
    expect(ttsSpeak.mock.calls[0]![0]).toBe('From the popup');
    expect((ttsSpeak.mock.calls[0]![1] as Record<string, unknown>).rate).toBe(2);
    expect((await onMessage({ type: 'SYSTEM_VOICE_STATUS_QUERY' })).response)
      .toEqual({ type: 'SYSTEM_VOICE_STATUS', speaking: true });

    // The popup's Stop broadcasts STOP_IN_OFFSCREEN: the worker silences chrome.tts, without answering.
    const stopped = await onMessage({ type: 'STOP_IN_OFFSCREEN' });
    expect(stopped.returned).toBe(false);
    expect(stopped.response).toBeUndefined();
    expect(ttsStop).toHaveBeenCalled();
    expect((await onMessage({ type: 'SYSTEM_VOICE_STATUS_QUERY' })).response)
      .toEqual({ type: 'SYSTEM_VOICE_STATUS', speaking: false });
  });

  test('popup: a failing system voice answers SPEAK_ERROR and sets no badge', async () => {
    ttsMode = 'reject';
    const { response } = await onMessage({ type: 'SPEAK_WITH_SYSTEM_VOICE', text: 'From the popup', voice: 'af_heart', speed: 1 });
    expect((response as { type: string }).type).toBe('SPEAK_ERROR');
    expect(setBadgeText).not.toHaveBeenCalled();
  });
});

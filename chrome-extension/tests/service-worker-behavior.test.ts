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

const executeScript = mock(async (_injection: unknown) => {
  if (executeScriptThrows) throw new Error('Cannot access contents of the page');
  return [{ result: pageSelection }];
});
const defaultSendMessage = async (message: { type: string }) => {
  if (message.type === 'SPEAK_IN_OFFSCREEN') return { type: 'SPEAK_COMPLETE', success: true };
  return undefined;
};
const sendMessage = mock(defaultSendMessage);
let offscreenExists = true;
const getContexts = mock(async (_filter: unknown) => (offscreenExists ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : []));
const createDocument = mock(async (_params: unknown) => { offscreenExists = true; });
const closeDocument = mock(async () => { offscreenExists = false; });

const setBadgeText = mock(async (_details: { text: string }) => {});
const setBadgeBackgroundColor = mock(async (_details: { color: string }) => {});
const setTitle = mock(async (_details: { title: string }) => {});

const mockChrome = {
  action: { setBadgeText, setBadgeBackgroundColor, setTitle },
  runtime: {
    getManifest: () => ({ name: 'Natural Text-to-Speech', version: '1.4.0' }),
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
  storage: {
    local: {
      get: mock(async () => ({ selectedVoice: 'af_nicole', selectedSpeed: 1.25 })),
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
    expect(titles()).toEqual(['Natural Text-to-Speech']);
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

  test('stop-speaking leaves the badge alone', async () => {
    await listeners['commands.onCommand']('stop-speaking', { id: 47 });
    expect(setBadgeText).not.toHaveBeenCalled();
  });
});

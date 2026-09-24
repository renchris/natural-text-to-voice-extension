/**
 * Tests for on-demand selection reading (IN-08).
 *
 * The <all_urls> content script is gone; the selection is read with
 * chrome.scripting.executeScript under an activeTab grant, with the
 * context menu's info.selectionText as the fallback.
 */

import { describe, test, expect, mock, beforeEach, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSelection, isPdfContext, resolveContextMenuText } from '../src/shared/selection';

type Injection = { target: { tabId: number; frameIds?: number[] }; func: () => { text: string; pdf: boolean } };

const originalChrome = (globalThis as any).chrome;
let executeScript = mock(async (_injection: Injection): Promise<Array<{ result?: unknown }>> => []);

function installChrome(): void {
  (globalThis as any).chrome = { scripting: { executeScript } };
}

/** The page's probe answer: a string is shorthand for { text, pdf: false }. */
function selectionReturns(value: unknown): void {
  const result = typeof value === 'string' ? { text: value, pdf: false } : value;
  executeScript = mock(async () => [{ result }]);
  installChrome();
}

/** Answer per frame: frames maps frameId (0 = top) to a result, or to an Error to throw. */
function framesReturn(frames: Record<number, { text: string; pdf?: boolean } | Error>): void {
  executeScript = mock(async (injection: Injection) => {
    const frameId = injection.target.frameIds?.[0] ?? 0;
    const answer = frames[frameId];
    if (answer === undefined || answer instanceof Error) throw answer ?? new Error(`no frame ${frameId}`);
    return [{ result: { pdf: false, ...answer } }];
  });
  installChrome();
}

function selectionThrows(message: string): void {
  executeScript = mock(async () => {
    throw new Error(message);
  });
  installChrome();
}

beforeEach(() => {
  selectionReturns('');
});

afterAll(() => {
  if (originalChrome === undefined) {
    delete (globalThis as any).chrome;
  } else {
    (globalThis as any).chrome = originalChrome;
  }
});

describe('readSelection', () => {
  test('injects into the given tab and returns the page selection verbatim', async () => {
    selectionReturns('  Line one\nLine two  ');

    const text = await readSelection(42);

    expect(text).toBe('  Line one\nLine two  ');
    expect(executeScript).toHaveBeenCalledTimes(1);
    const injection = (executeScript.mock.calls[0] as unknown as [Injection])[0];
    expect(injection.target).toEqual({ tabId: 42 });
    expect(typeof injection.func).toBe('function');
  });

  test('the injected function reads getSelection() in the page, and its content type', () => {
    selectionReturns('');
    return readSelection(7).then(() => {
      const injection = (executeScript.mock.calls[0] as unknown as [Injection])[0];
      const originalGetSelection = (globalThis as any).getSelection;
      const originalDocument = (globalThis as any).document;
      try {
        (globalThis as any).document = { activeElement: { tagName: 'BODY' }, contentType: 'text/html' };
        (globalThis as any).getSelection = () => ({ toString: () => 'picked text' });
        expect(injection.func()).toEqual({ text: 'picked text', pdf: false });
        (globalThis as any).getSelection = () => null;
        expect(injection.func()).toEqual({ text: '', pdf: false });
        (globalThis as any).document = { activeElement: { tagName: 'EMBED' }, contentType: 'application/pdf' };
        expect(injection.func().pdf).toBe(true);
      } finally {
        (globalThis as any).getSelection = originalGetSelection;
        (globalThis as any).document = originalDocument;
      }
    });
  });

  test('a document whose focus is on a child frame reports no selection: its own is stale (EXT-1)', () => {
    selectionReturns('');
    return readSelection(7).then(() => {
      const injection = (executeScript.mock.calls[0] as unknown as [Injection])[0];
      const originalGetSelection = (globalThis as any).getSelection;
      const originalDocument = (globalThis as any).document;
      try {
        (globalThis as any).getSelection = () => ({ toString: () => 'stale top-frame text' });
        for (const tagName of ['IFRAME', 'FRAME', 'EMBED', 'OBJECT']) {
          (globalThis as any).document = { activeElement: { tagName }, contentType: 'text/html' };
          expect(injection.func().text).toBe('');
        }
      } finally {
        (globalThis as any).getSelection = originalGetSelection;
        (globalThis as any).document = originalDocument;
      }
    });
  });

  test('returns empty on a restricted page (executeScript throws)', async () => {
    selectionThrows('Cannot access a chrome:// URL');
    expect(await readSelection(1)).toBe('');
  });

  test('returns empty when the frame produced no result', async () => {
    executeScript = mock(async () => []);
    installChrome();
    expect(await readSelection(1)).toBe('');

    selectionReturns(undefined);
    expect(await readSelection(1)).toBe('');

    selectionReturns(123);
    expect(await readSelection(1)).toBe('');

    selectionReturns({ text: 7 });
    expect(await readSelection(1)).toBe('');
  });
});

describe('isPdfContext', () => {
  test('matches .pdf at the end of the page or frame URL, before a query or hash', () => {
    expect(isPdfContext({ pageUrl: 'https://example.com/paper.pdf' })).toBe(true);
    expect(isPdfContext({ pageUrl: 'https://example.com/paper.PDF?download=1' })).toBe(true);
    expect(isPdfContext({ pageUrl: 'file:///Users/me/a.pdf#page=3' })).toBe(true);
    expect(isPdfContext({ pageUrl: 'https://example.com/', frameUrl: 'https://cdn.example.com/x.pdf' })).toBe(true);
  });

  test('matches a click inside Chrome\'s PDF viewer frame, whatever the page URL', () => {
    expect(isPdfContext({
      pageUrl: 'https://arxiv.org/pdf/2401.12345v1',
      frameUrl: 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html',
    })).toBe(true);
  });

  test('does not match pages that merely mention pdf', () => {
    expect(isPdfContext({ pageUrl: 'https://example.com/pdf-tools' })).toBe(false);
    expect(isPdfContext({ pageUrl: 'https://example.com/a.pdf.html' })).toBe(false);
    expect(isPdfContext({ pageUrl: 'https://example.com/?file=a.pdfx' })).toBe(false);
    expect(isPdfContext({})).toBe(false);
  });
});

describe('resolveContextMenuText', () => {
  test('prefers the page selection read on demand', async () => {
    selectionReturns('From the page\nwith a line break');

    const text = await resolveContextMenuText(
      { selectionText: 'From the page with a line break', pageUrl: 'https://example.com/' },
      { id: 5 }
    );

    expect(text).toBe('From the page\nwith a line break');
    expect(executeScript).toHaveBeenCalledTimes(1);
  });

  test('falls back to info.selectionText when the top frame has no selection (iframe, input)', async () => {
    selectionReturns('');

    const text = await resolveContextMenuText(
      { selectionText: '  Text inside a cross-origin iframe  ', pageUrl: 'https://example.com/' },
      { id: 5 }
    );

    expect(text).toBe('Text inside a cross-origin iframe');
  });

  test('falls back to info.selectionText when executeScript fails (PDF viewer, restricted page)', async () => {
    selectionThrows('Cannot access contents of the page');

    const text = await resolveContextMenuText(
      { selectionText: 'Traffic data', pageUrl: 'https://example.com/report.pdf' },
      { id: 9 }
    );

    expect(text).toBe('Traffic data');
  });

  test('does not inject when there is no real tab id', async () => {
    const noTab = await resolveContextMenuText({ selectionText: 'no tab' }, undefined);
    const guestView = await resolveContextMenuText({ selectionText: 'guest view' }, { id: -1 });

    expect(noTab).toBe('no tab');
    expect(guestView).toBe('guest view');
    expect(executeScript).not.toHaveBeenCalled();
  });

  test('cleans PDF ligatures only for PDF pages', async () => {
    selectionThrows('pdf viewer frame');
    const pdf = await resolveContextMenuText(
      { selectionText: 'The tra!c de®nition', pageUrl: 'https://example.com/paper.pdf' },
      { id: 3 }
    );
    expect(pdf).toBe('The traffic definition');

    const html = await resolveContextMenuText(
      { selectionText: 'The tra!c de®nition', pageUrl: 'https://example.com/article' },
      { id: 3 }
    );
    expect(html).toBe('The tra!c de®nition');
  });

  test('a click in a child frame never speaks the top frame\'s stale selection (EXT-1, SEC-02)', async () => {
    // Cross-origin iframe: activeTab does not cover it, so its probe fails.
    framesReturn({ 0: { text: 'PARENT secret sentence here' }, 3: new Error('Cannot access contents of url') });
    const crossOrigin = await resolveContextMenuText(
      { frameId: 3, selectionText: 'IFRAME text to sp', pageUrl: 'https://example.com/' },
      { id: 5 }
    );
    expect(crossOrigin).toBe('IFRAME text to sp');

    // Same-origin iframe: that frame is read, with its full text.
    framesReturn({ 0: { text: 'PARENT secret sentence here' }, 4: { text: 'IFRAME text to speak in full' } });
    const sameOrigin = await resolveContextMenuText(
      { frameId: 4, selectionText: 'IFRAME text to sp', pageUrl: 'https://example.com/' },
      { id: 5 }
    );
    expect(sameOrigin).toBe('IFRAME text to speak in full');
    const targets = executeScript.mock.calls.map(call => (call[0] as unknown as Injection).target);
    expect(targets[0]).toEqual({ tabId: 5, frameIds: [4] });
  });

  test('cleans ligatures for a PDF served without .pdf in the URL, by the document\'s content type (EXT-9)', async () => {
    framesReturn({ 0: { text: '', pdf: true }, 2: new Error('pdf viewer frame') });
    const arxiv = await resolveContextMenuText(
      { frameId: 2, selectionText: 'The tra!c e€ect de®nition', pageUrl: 'https://arxiv.org/pdf/2401.12345v1' },
      { id: 8 }
    );
    expect(arxiv).toBe('The traffic effect definition');

    // Same top-level click, no frame id.
    framesReturn({ 0: { text: '', pdf: true } });
    const top = await resolveContextMenuText(
      { selectionText: 'The tra!c e€ect', pageUrl: 'https://example.com/download?id=42' },
      { id: 8 }
    );
    expect(top).toBe('The traffic effect');
  });

  test('returns empty when nothing is selected anywhere', async () => {
    selectionReturns('   ');
    expect(await resolveContextMenuText({ pageUrl: 'https://example.com/' }, { id: 1 })).toBe('');
  });
});

describe('manifest (IN-08)', () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, '..', 'public', 'manifest.json'), 'utf8'));

  test('declares no content scripts and no <all_urls>', () => {
    expect(manifest.content_scripts).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
  });

  test('reads the selection through activeTab + scripting', () => {
    expect(manifest.permissions).toContain('activeTab');
    expect(manifest.permissions).toContain('scripting');
    expect(manifest.permissions).not.toContain('tabs');
  });

  test('keeps the loopback host permission only', () => {
    expect(manifest.host_permissions).toEqual(['http://127.0.0.1/*']);
  });

  test('sets minimum_chrome_version to 148', () => {
    expect(manifest.minimum_chrome_version).toBe('148');
  });
});

describe('manifest commands (IN-12)', () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, '..', 'public', 'manifest.json'), 'utf8'));

  test('declares speak-selection and stop-speaking with descriptions', () => {
    expect(Object.keys(manifest.commands).sort()).toEqual(['speak-selection', 'stop-speaking']);
    expect(manifest.commands['speak-selection'].description).toBeTruthy();
    expect(manifest.commands['stop-speaking'].description).toBeTruthy();
  });

  test('ships no default keys (the user binds them at chrome://extensions/shortcuts)', () => {
    for (const command of Object.values(manifest.commands) as Array<Record<string, unknown>>) {
      expect(command.suggested_key).toBeUndefined();
    }
  });
});

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

type Injection = { target: { tabId: number }; func: () => string };

const originalChrome = (globalThis as any).chrome;
let executeScript = mock(async (_injection: Injection): Promise<Array<{ result?: unknown }>> => []);

function installChrome(): void {
  (globalThis as any).chrome = { scripting: { executeScript } };
}

function selectionReturns(value: unknown): void {
  executeScript = mock(async () => [{ result: value }]);
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

  test('the injected function reads getSelection() in the page', () => {
    selectionReturns('');
    return readSelection(7).then(() => {
      const injection = (executeScript.mock.calls[0] as unknown as [Injection])[0];
      const originalGetSelection = (globalThis as any).getSelection;
      try {
        (globalThis as any).getSelection = () => ({ toString: () => 'picked text' });
        expect(injection.func()).toBe('picked text');
        (globalThis as any).getSelection = () => null;
        expect(injection.func()).toBe('');
      } finally {
        (globalThis as any).getSelection = originalGetSelection;
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
  });
});

describe('isPdfContext', () => {
  test('matches .pdf at the end of the page or frame URL, before a query or hash', () => {
    expect(isPdfContext({ pageUrl: 'https://example.com/paper.pdf' })).toBe(true);
    expect(isPdfContext({ pageUrl: 'https://example.com/paper.PDF?download=1' })).toBe(true);
    expect(isPdfContext({ pageUrl: 'file:///Users/me/a.pdf#page=3' })).toBe(true);
    expect(isPdfContext({ pageUrl: 'https://example.com/', frameUrl: 'https://cdn.example.com/x.pdf' })).toBe(true);
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

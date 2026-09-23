/**
 * On-demand selection reading.
 *
 * The extension used to inject a content script into every page (<all_urls>)
 * just to answer "what is selected?". That script was the only source of the
 * "Read and change all your data on all websites" install warning, and it was
 * absent from tabs opened before install. Instead, every entry point here is a
 * user gesture (action click, context-menu click or keyboard command), which
 * grants activeTab, and activeTab + "scripting" lets us run one function in the
 * tab when we need the text.
 */

import { cleanupPDFLigatures } from './text-cleanup';

/**
 * Read the current selection in the top frame of a tab.
 *
 * Returns '' on any failure: restricted pages (chrome://, the Web Store), the
 * PDF viewer frame, a tab without an activeTab grant, or a tab that went away.
 * Callers fall back to `info.selectionText` where they have it.
 */
export async function readSelection(tabId: number): Promise<string> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => getSelection()?.toString() ?? '',
    });
    const result = injection?.result;
    return typeof result === 'string' ? result : '';
  } catch {
    return '';
  }
}

/**
 * True when the context-menu click came from a PDF.
 *
 * Replaces the GuestView-era `tab.id < 0` test: the out-of-process-iframe PDF
 * viewer (the default since M145) reports a real tab id, so only the URL tells
 * us the selection came out of a PDF text layer.
 */
export function isPdfContext(info: Pick<chrome.contextMenus.OnClickData, 'pageUrl' | 'frameUrl'>): boolean {
  const pdf = /\.pdf($|[?#])/i;
  return pdf.test(info.pageUrl ?? '') || pdf.test(info.frameUrl ?? '');
}

/**
 * Resolve the text to speak for a context-menu click.
 *
 * 1. If the click came from a real tab, read the selection with
 *    `readSelection`; it keeps the page's own `toString()` (line breaks,
 *    no length cap).
 * 2. If that is empty, use `info.selectionText`. The browser fills it for
 *    every frame type: PDFs, cross-origin iframes and input fields, which
 *    `executeScript` on the top frame cannot see.
 * 3. Clean PDF ligature artefacts only when the page or frame is a PDF.
 */
export async function resolveContextMenuText(
  info: Pick<chrome.contextMenus.OnClickData, 'selectionText' | 'pageUrl' | 'frameUrl'>,
  tab?: Pick<chrome.tabs.Tab, 'id'>
): Promise<string> {
  let text = '';
  if (tab?.id !== undefined && tab.id >= 0) {
    text = (await readSelection(tab.id)).trim();
  }
  if (!text) {
    text = (info.selectionText ?? '').trim();
  }
  if (text && isPdfContext(info)) {
    text = cleanupPDFLigatures(text);
  }
  return text;
}

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

/** What a frame reports about its selection. */
export interface FrameSelection {
  text: string;
  /** The frame's document is a PDF (Chrome's PDF viewer embedder). */
  pdf: boolean;
}

/**
 * Runs IN the page (serialized by executeScript, so it may use page globals
 * only). When the user selects inside an embedded frame, the selection made
 * earlier in THIS document survives, inactive, while focus sits on the frame
 * element; reading it then spoke stale text instead of what was selected. So
 * a document whose focus is on a child frame reports no selection.
 */
export function probeSelection(): FrameSelection {
  const tag = document.activeElement?.tagName;
  const focusInChildFrame = tag === 'IFRAME' || tag === 'FRAME' || tag === 'EMBED' || tag === 'OBJECT';
  return {
    text: focusInChildFrame ? '' : (getSelection()?.toString() ?? ''),
    pdf: document.contentType === 'application/pdf',
  };
}

/**
 * Ask one frame of a tab (the top frame when frameId is undefined or 0) for
 * its selection. null when the frame cannot be scripted: restricted pages
 * (chrome://, the Web Store), the PDF viewer frame, a cross-origin frame
 * activeTab does not cover, a tab without a grant, or a tab that went away.
 */
async function probeFrame(tabId: number, frameId?: number): Promise<FrameSelection | null> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: frameId ? { tabId, frameIds: [frameId] } : { tabId },
      func: probeSelection,
    });
    const result = injection?.result as Partial<FrameSelection> | undefined;
    if (!result || typeof result.text !== 'string') return null;
    return { text: result.text, pdf: result.pdf === true };
  } catch {
    return null;
  }
}

/**
 * Read the current selection in the top frame of a tab (shortcut and popup:
 * they are not told which frame the user means).
 *
 * Returns '' on any failure, and when the selection lives in an embedded
 * frame (focus on the frame element): the top frame's own selection is then
 * stale, and the caller says "nothing to speak" rather than speaking it.
 */
export async function readSelection(tabId: number): Promise<string> {
  return (await probeFrame(tabId))?.text ?? '';
}

/** Chrome's built-in PDF viewer (its component extension id is fixed). */
const PDF_VIEWER_ORIGIN = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/';

/**
 * True when the context-menu click came from a PDF, judged by URL: a path
 * ending in .pdf, or a click inside Chrome's PDF viewer frame.
 *
 * Replaces the GuestView-era `tab.id < 0` test: the out-of-process-iframe PDF
 * viewer (the default since M145) reports a real tab id. A PDF served from a
 * URL without .pdf (arXiv, download endpoints) is caught by the document's
 * own content type instead (resolveContextMenuText).
 */
export function isPdfContext(info: Pick<chrome.contextMenus.OnClickData, 'pageUrl' | 'frameUrl'>): boolean {
  const pdf = /\.pdf($|[?#])/i;
  return pdf.test(info.pageUrl ?? '') || pdf.test(info.frameUrl ?? '') || (info.frameUrl ?? '').startsWith(PDF_VIEWER_ORIGIN);
}

/**
 * Resolve the text to speak for a context-menu click.
 *
 * 1. Read the selection of the frame that was right-clicked (info.frameId),
 *    never the top frame's when the click was in a child frame: the top
 *    frame may still hold an older, inactive selection.
 * 2. If that frame cannot be scripted or has no selection, use
 *    `info.selectionText`. The browser fills it for every frame type: PDFs,
 *    cross-origin iframes and input fields.
 * 3. Clean PDF ligature artefacts only for PDFs: by URL, or because the top
 *    document says it is one (document.contentType), which also covers PDFs
 *    served from URLs without .pdf.
 */
export async function resolveContextMenuText(
  info: Pick<chrome.contextMenus.OnClickData, 'selectionText' | 'pageUrl' | 'frameUrl' | 'frameId'>,
  tab?: Pick<chrome.tabs.Tab, 'id'>
): Promise<string> {
  let text = '';
  let pdf = isPdfContext(info);
  if (tab?.id !== undefined && tab.id >= 0) {
    const frameId = info.frameId ?? 0;
    const clicked = await probeFrame(tab.id, frameId);
    text = (clicked?.text ?? '').trim();
    pdf ||= clicked?.pdf === true;
    if (!pdf && frameId !== 0) {
      // Only the top document's type is used here, never its (stale) text.
      pdf = (await probeFrame(tab.id))?.pdf === true;
    }
  }
  if (!text) {
    text = (info.selectionText ?? '').trim();
  }
  if (text && pdf) {
    text = cleanupPDFLigatures(text);
  }
  return text;
}

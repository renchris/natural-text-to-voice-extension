/**
 * The toolbar error badge (C1 D2).
 *
 * Speech started from the context menu or a keyboard shortcut has no page of
 * its own to show an error in, so a failure used to end in a console line
 * nobody sees. It now puts a red "!" on the toolbar icon and the reason in the
 * icon's tooltip; the next success clears both. chrome.action needs no
 * permission, so this adds no install warning.
 */

export const ERROR_BADGE_TEXT = '!';
export const ERROR_BADGE_COLOR = '#D93025';

/** The toolbar tooltip with no error: the manifest's action.default_title. */
function defaultTitle(): string {
  try {
    const manifest = chrome.runtime.getManifest();
    return manifest.action?.default_title ?? manifest.short_name ?? manifest.name;
  } catch {
    return 'Natural TTS';
  }
}

export async function showErrorBadge(message: string): Promise<void> {
  try {
    await Promise.all([
      chrome.action.setBadgeBackgroundColor({ color: ERROR_BADGE_COLOR }),
      chrome.action.setBadgeText({ text: ERROR_BADGE_TEXT }),
      chrome.action.setTitle({ title: `Natural TTS: ${message}` }),
    ]);
  } catch (error) {
    console.warn('[Badge] Could not show the error badge:', error);
  }
}

export async function clearErrorBadge(): Promise<void> {
  try {
    await Promise.all([
      chrome.action.setBadgeText({ text: '' }),
      chrome.action.setTitle({ title: defaultTitle() }),
    ]);
  } catch (error) {
    console.warn('[Badge] Could not clear the error badge:', error);
  }
}

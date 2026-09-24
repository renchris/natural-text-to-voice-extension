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

/**
 * The system-voice hint (OD-2: speak with a system voice AND tell the user to
 * install the helper). Speech from the context menu or a shortcut that fell
 * back to a system voice has no page to say so in, so the icon gets a neutral
 * "i" and a tooltip naming the helper; the popup it opens shows the install
 * command. The next Kokoro success clears it (clearErrorBadge), an error
 * replaces it.
 */
export const SYSTEM_VOICE_BADGE_TEXT = 'i';
export const SYSTEM_VOICE_BADGE_COLOR = '#5F6368';
export const SYSTEM_VOICE_TITLE =
  'Natural TTS: A system voice read your selection. Install the free Natural TTS helper for Kokoro voices (click for how).';

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

export async function showSystemVoiceHint(): Promise<void> {
  try {
    await Promise.all([
      chrome.action.setBadgeBackgroundColor({ color: SYSTEM_VOICE_BADGE_COLOR }),
      chrome.action.setBadgeText({ text: SYSTEM_VOICE_BADGE_TEXT }),
      chrome.action.setTitle({ title: SYSTEM_VOICE_TITLE }),
    ]);
  } catch (error) {
    console.warn('[Badge] Could not show the system-voice hint:', error);
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

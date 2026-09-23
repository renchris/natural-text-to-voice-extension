/**
 * Popup footer chip showing the key actually bound to "speak-selection".
 *
 * The manifest ships the commands with no default keys (on macOS the
 * obvious Option+Shift chords type characters, e.g. ⌥⇧S is "Í"), so the chip
 * reads the live binding from chrome.commands.getAll(). With no key bound it
 * offers "Set a shortcut"; either way a click opens Chrome's shortcut page.
 */

export const SPEAK_COMMAND = 'speak-selection';
export const SHORTCUTS_PAGE = 'chrome://extensions/shortcuts';
export const UNSET_LABEL = 'Set a shortcut';

export interface ShortcutChipDeps {
  getAll: () => Promise<chrome.commands.Command[]>;
  openShortcutsPage: () => void | Promise<unknown>;
}

const defaultDeps: ShortcutChipDeps = {
  getAll: () => chrome.commands.getAll(),
  openShortcutsPage: () => chrome.tabs.create({ url: SHORTCUTS_PAGE }),
};

/**
 * The key bound to speak-selection, or '' when none is bound.
 */
export async function getSpeakShortcut(deps: Pick<ShortcutChipDeps, 'getAll'> = defaultDeps): Promise<string> {
  try {
    const commands = await deps.getAll();
    return commands.find(command => command.name === SPEAK_COMMAND)?.shortcut ?? '';
  } catch {
    return '';
  }
}

/**
 * Render the chip and make it open the shortcuts page on click.
 */
export async function renderShortcutChip(
  chip: HTMLElement,
  deps: ShortcutChipDeps = defaultDeps
): Promise<void> {
  const shortcut = await getSpeakShortcut(deps);

  if (shortcut) {
    chip.textContent = shortcut;
    chip.classList.remove('is-unset');
    chip.title = `Speak selection: ${shortcut}. Click to change.`;
    chip.setAttribute('aria-label', `Speak selection shortcut ${shortcut}. Change keyboard shortcuts`);
  } else {
    chip.textContent = UNSET_LABEL;
    chip.classList.add('is-unset');
    chip.title = 'Choose keys for Speak selection and Stop speaking';
    chip.setAttribute('aria-label', 'Set a keyboard shortcut');
  }

  chip.onclick = () => {
    void deps.openShortcutsPage();
  };
}

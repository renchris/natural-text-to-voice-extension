/**
 * Tests for the popup footer shortcut chip (IN-12): it shows the key really
 * bound to speak-selection, or "Set a shortcut", and opens the shortcuts page.
 */

import { describe, test, expect, mock } from 'bun:test';
import {
  renderShortcutChip,
  getSpeakShortcut,
  UNSET_LABEL,
} from '../src/popup/shortcut-chip';

function commands(speakShortcut: string | undefined): chrome.commands.Command[] {
  return [
    { name: '_execute_action', shortcut: '⌥⇧N' },
    { name: 'speak-selection', description: 'Speak the selected text', shortcut: speakShortcut },
    { name: 'stop-speaking', description: 'Stop speaking', shortcut: '' },
  ];
}

function chip(): HTMLElement {
  return document.createElement('button') as unknown as HTMLElement;
}

describe('getSpeakShortcut', () => {
  test('returns the key bound to speak-selection', async () => {
    expect(await getSpeakShortcut({ getAll: async () => commands('⌥⇧S') })).toBe('⌥⇧S');
  });

  test('returns empty when unbound, missing, or the API fails', async () => {
    expect(await getSpeakShortcut({ getAll: async () => commands('') })).toBe('');
    expect(await getSpeakShortcut({ getAll: async () => commands(undefined) })).toBe('');
    expect(await getSpeakShortcut({ getAll: async () => [] })).toBe('');
    expect(await getSpeakShortcut({ getAll: async () => { throw new Error('no api'); } })).toBe('');
  });
});

describe('renderShortcutChip', () => {
  test('shows the real binding, not a hard-coded key', async () => {
    const el = chip();
    await renderShortcutChip(el, { getAll: async () => commands('⌘⇧Y'), openShortcutsPage: () => {} });

    expect(el.textContent).toBe('⌘⇧Y');
    expect(el.classList.contains('is-unset')).toBe(false);
  });

  test('shows "Set a shortcut" when no key is bound', async () => {
    const el = chip();
    await renderShortcutChip(el, { getAll: async () => commands(''), openShortcutsPage: () => {} });

    expect(el.textContent).toBe(UNSET_LABEL);
    expect(el.classList.contains('is-unset')).toBe(true);
  });

  test('click opens chrome://extensions/shortcuts', async () => {
    const el = chip();
    const open = mock(() => {});
    await renderShortcutChip(el, { getAll: async () => commands(''), openShortcutsPage: open });

    el.click();
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('default opener targets the shortcuts page', async () => {
    const saved = (globalThis as any).chrome;
    const create = mock(async (_props: { url: string }) => ({}));
    (globalThis as any).chrome = {
      commands: { getAll: async () => commands('') },
      tabs: { create },
    };
    try {
      const el = chip();
      await renderShortcutChip(el);
      expect(el.textContent).toBe(UNSET_LABEL);
      el.click();
      expect(create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
    } finally {
      if (saved === undefined) delete (globalThis as any).chrome;
      else (globalThis as any).chrome = saved;
    }
  });
});

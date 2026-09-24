import { describe, expect, test } from 'bun:test';
import manifest from '../public/manifest.json';

/**
 * The store listing reads these fields (OD-7, OD-14). The Web Store truncates
 * a description past 132 characters, and the toolbar tooltip with no error is
 * action.default_title (restored by clearErrorBadge).
 */
describe('manifest', () => {
  test('carries the OD-7 names', () => {
    expect(manifest.name).toBe('Natural TTS: Private Kokoro Voices for Mac');
    expect(manifest.short_name).toBe('Natural TTS');
    expect(manifest.action.default_title).toBe('Natural TTS');
  });

  test('the description fits the store limit and names both engines', () => {
    expect(manifest.description.length).toBeLessThanOrEqual(132);
    expect(manifest.description).toContain('Kokoro');
    expect(manifest.description).toContain('System voices');
  });

  test('ships no default shortcut keys (OD-14)', () => {
    for (const command of Object.values(manifest.commands)) {
      expect(command).not.toHaveProperty('suggested_key');
    }
  });
});

/**
 * Version skew between the extension and the helper.
 */

import { describe, test, expect } from 'bun:test';
import {
  HELPER_INSTALL_COMMAND,
  HELPER_SOURCE_URL,
  HELPER_UPDATE_COMMAND,
  MIN_HELPER_API_VERSION,
  helperNeedsUpdate,
} from '../src/shared/helper-version';

describe('helperNeedsUpdate', () => {
  test('a helper without apiVersion (pre-v1.5) needs an update', () => {
    expect(helperNeedsUpdate({})).toBe(true);
    expect(helperNeedsUpdate({ apiVersion: undefined })).toBe(true);
  });

  test('apiVersion below 2 needs an update', () => {
    expect(MIN_HELPER_API_VERSION).toBe(2);
    expect(helperNeedsUpdate({ apiVersion: 1 })).toBe(true);
    expect(helperNeedsUpdate({ apiVersion: 0 })).toBe(true);
  });

  test('apiVersion 2 or later does not', () => {
    expect(helperNeedsUpdate({ apiVersion: 2 })).toBe(false);
    expect(helperNeedsUpdate({ apiVersion: 3 })).toBe(false);
  });

  test('a malformed apiVersion is treated as missing', () => {
    expect(helperNeedsUpdate({ apiVersion: Number.NaN })).toBe(true);
    expect(helperNeedsUpdate({ apiVersion: '2' as unknown as number })).toBe(true);
  });

  test('install and update go through Homebrew (OD-1), with the README for source installs', () => {
    expect(HELPER_INSTALL_COMMAND).toBe('brew install renchris/tap/natural-tts && brew services start natural-tts');
    expect(HELPER_UPDATE_COMMAND).toBe('brew upgrade natural-tts && brew services restart natural-tts');
    expect(HELPER_SOURCE_URL).toBe('https://github.com/renchris/natural-text-to-voice-extension#install');
  });
});

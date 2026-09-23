/**
 * Version skew between the extension and the helper.
 */

import { describe, test, expect } from 'bun:test';
import { HELPER_UPDATE_COMMAND, MIN_HELPER_API_VERSION, helperNeedsUpdate } from '../src/shared/helper-version';

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

  test('the update command is the helper quickstart', () => {
    expect(HELPER_UPDATE_COMMAND).toBe('cd native-helper && ./Scripts/quickstart.sh');
  });
});

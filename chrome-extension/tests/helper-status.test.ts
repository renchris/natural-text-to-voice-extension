import { describe, expect, test } from 'bun:test';
import { helperHealthState } from '../src/shared/helper-status';

describe('helperHealthState', () => {
  test('ok with the model loaded is ready', () => {
    expect(helperHealthState({ status: 'ok', model_loaded: true })).toBe('ready');
  });

  test('status "error" is a stopped engine, never warming (which would poll forever)', () => {
    expect(helperHealthState({ status: 'error', model_loaded: false })).toBe('engine-stopped');
    expect(helperHealthState({ status: 'error', model_loaded: true })).toBe('engine-stopped');
  });

  test('warming, or ok without the model, is warming', () => {
    expect(helperHealthState({ status: 'warming', model_loaded: false })).toBe('warming');
    expect(helperHealthState({ status: 'ok', model_loaded: false })).toBe('warming');
  });
});

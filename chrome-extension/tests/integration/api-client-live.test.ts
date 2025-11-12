/**
 * Integration test for API client against a running native helper
 *
 * Prerequisites:
 * - Native helper must be running on port 8249
 * - Run: cd ../native-helper && ./Scripts/quickstart.sh
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { ApiClient } from '../../src/shared/api-client';

// Save original fetch before unit tests mock it
const originalFetch = globalThis.fetch;

// Mock chrome.storage API for this integration test
global.chrome = {
  storage: {
    local: {
      get: async () => ({
        native_tts_helper_config: {
          port: 8249,
          secret: '',
          default_voice: 'af_bella',
        },
      }),
      set: async () => {},
      remove: async () => {},
    },
  },
} as any;

describe('ApiClient Integration Tests (Live Helper)', () => {
  let client: ApiClient;

  beforeAll(async () => {
    // Restore original fetch for integration tests (unit tests mock it globally)
    globalThis.fetch = originalFetch;

    client = new ApiClient();

    // Verify helper is running before starting tests
    try {
      const health = await client.checkHealth();
      console.log(`Connected to helper: ${health.model} (uptime: ${health.uptime_seconds}s)`);
    } catch (error) {
      throw new Error(
        'Cannot connect to native helper. Please start it first:\n' +
        'cd ../native-helper && ./Scripts/quickstart.sh\n\n' +
        `Error: ${(error as Error).message}`
      );
    }
  });

  test('should get health status from running helper', async () => {
    const health = await client.checkHealth();

    expect(health.status).toBe('ok');
    expect(health.model).toBeTruthy();
    expect(health.model_loaded).toBe(true);
    expect(health.uptime_seconds).toBeGreaterThan(0);
    expect(health.requests_served).toBeGreaterThanOrEqual(0);

    console.log(`Health check: ${JSON.stringify(health, null, 2)}`);
  });

  test('should get list of available voices', async () => {
    const voices = await client.getVoices();

    expect(Array.isArray(voices)).toBe(true);
    expect(voices.length).toBeGreaterThan(0);

    // Check voice structure
    const firstVoice = voices[0];
    expect(firstVoice).toHaveProperty('id');
    expect(firstVoice).toHaveProperty('name');
    expect(firstVoice).toHaveProperty('language');

    console.log(`Found ${voices.length} voices. First voice: ${JSON.stringify(firstVoice)}`);
  });

  test('should generate speech from text', async () => {
    const audioBlob = await client.speak({
      text: 'Hello, this is a test of the native TTS system.',
      voice: 'af_bella',
      speed: 1.0,
    });

    expect(audioBlob).toBeInstanceOf(Blob);
    expect(audioBlob.size).toBeGreaterThan(0);
    expect(audioBlob.type).toBe('audio/wav');

    console.log(`Generated audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
  });

  test('should generate speech with custom speed', async () => {
    const audioBlob = await client.speak({
      text: 'Testing faster speech.',
      speed: 1.5,
    });

    expect(audioBlob).toBeInstanceOf(Blob);
    expect(audioBlob.size).toBeGreaterThan(0);

    console.log(`Generated fast speech: ${audioBlob.size} bytes`);
  });

  test('should handle short text', async () => {
    const audioBlob = await client.speak({
      text: 'Hi',
    });

    expect(audioBlob).toBeInstanceOf(Blob);
    expect(audioBlob.size).toBeGreaterThan(0);
  });

  test('should handle longer text', async () => {
    const longText = 'This is a longer test message that contains multiple sentences. ' +
      'The purpose is to verify that the TTS system can handle longer inputs correctly. ' +
      'It should process this text and return a larger audio file.';

    const audioBlob = await client.speak({
      text: longText,
    });

    expect(audioBlob).toBeInstanceOf(Blob);
    expect(audioBlob.size).toBeGreaterThan(1000); // Expect larger file

    console.log(`Generated long speech: ${audioBlob.size} bytes`);
  });
});

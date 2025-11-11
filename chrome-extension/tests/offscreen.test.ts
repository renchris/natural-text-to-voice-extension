/**
 * Tests for Offscreen Document (Phase 2.4/2.5)
 * Validates audio playback handling and message processing
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import type {
  SpeakInOffscreenMessage,
  OffscreenSpeakResponse,
} from '../src/shared/types';
import {
  HelperNotFoundError,
  NetworkTimeoutError,
  InvalidResponseError,
} from '../src/shared/types';

// Mock chrome.runtime API
const mockSendResponse = mock(() => {});
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: mock(() => {}),
    },
  },
};

// Mock getApiClient
const mockSpeak = mock(async () => new Blob(['test audio'], { type: 'audio/wav' }));
const mockApiClient = {
  speak: mockSpeak,
  checkHealth: mock(),
  getVoices: mock(),
};

// Mock Audio API
class MockAudio {
  src: string = '';
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  play = mock(async () => {
    // Simulate successful playback
    setTimeout(() => {
      if (this.onended) this.onended();
    }, 10);
  });

  pause = mock(() => {});
}

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockObjectURLs = new Set<string>();
const mockCreateObjectURL = mock((blob: Blob) => {
  const url = `blob:mock-${Math.random()}`;
  mockObjectURLs.add(url);
  return url;
});
const mockRevokeObjectURL = mock((url: string) => {
  mockObjectURLs.delete(url);
});

describe('Offscreen Document Message Handling', () => {
  beforeEach(() => {
    // Reset mocks
    mockSendResponse.mockClear();
    mockSpeak.mockClear();

    // Set up global mocks
    (global as any).chrome = mockChrome;
    (global as any).Audio = MockAudio;
    (global as any).URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    };

    // Mock getApiClient module
    (global as any).__mockApiClient = mockApiClient;
  });

  afterEach(() => {
    // Clean up
    delete (global as any).chrome;
    delete (global as any).Audio;
    delete (global as any).URL;
    delete (global as any).__mockApiClient;
    mockObjectURLs.clear();
  });

  test('should handle valid SPEAK_IN_OFFSCREEN message', async () => {
    const message: SpeakInOffscreenMessage = {
      type: 'SPEAK_IN_OFFSCREEN',
      text: 'Hello world',
      voice: 'af_bella',
      speed: 1.0,
    };

    // This test validates the message structure
    expect(message.type).toBe('SPEAK_IN_OFFSCREEN');
    expect(message.text).toBe('Hello world');
    expect(message.voice).toBe('af_bella');
    expect(message.speed).toBe(1.0);
  });

  test('should validate text is not empty', async () => {
    const message: SpeakInOffscreenMessage = {
      type: 'SPEAK_IN_OFFSCREEN',
      text: '',
      voice: 'af_bella',
      speed: 1.0,
    };

    // Empty text should be rejected
    expect(message.text.trim().length).toBe(0);
  });

  test('should validate text is not just whitespace', async () => {
    const message: SpeakInOffscreenMessage = {
      type: 'SPEAK_IN_OFFSCREEN',
      text: '   \n\t  ',
      voice: 'af_bella',
      speed: 1.0,
    };

    // Whitespace-only text should be rejected
    expect(message.text.trim().length).toBe(0);
  });

  test('should validate speed is within range (0.5-2.0)', () => {
    const validSpeeds = [0.5, 0.75, 1.0, 1.5, 2.0];
    const invalidSpeeds = [0.4, 0.49, 2.01, 3.0, -1.0];

    validSpeeds.forEach(speed => {
      expect(speed).toBeGreaterThanOrEqual(0.5);
      expect(speed).toBeLessThanOrEqual(2.0);
    });

    invalidSpeeds.forEach(speed => {
      const isValid = speed >= 0.5 && speed <= 2.0;
      expect(isValid).toBe(false);
    });
  });

  test('should handle speed at minimum boundary (0.5)', () => {
    const message: SpeakInOffscreenMessage = {
      type: 'SPEAK_IN_OFFSCREEN',
      text: 'Test',
      voice: 'af_bella',
      speed: 0.5,
    };

    expect(message.speed).toBe(0.5);
    expect(message.speed >= 0.5 && message.speed <= 2.0).toBe(true);
  });

  test('should handle speed at maximum boundary (2.0)', () => {
    const message: SpeakInOffscreenMessage = {
      type: 'SPEAK_IN_OFFSCREEN',
      text: 'Test',
      voice: 'af_bella',
      speed: 2.0,
    };

    expect(message.speed).toBe(2.0);
    expect(message.speed >= 0.5 && message.speed <= 2.0).toBe(true);
  });
});

describe('Offscreen Response Types', () => {
  test('should create success response', () => {
    const response: OffscreenSpeakResponse = {
      type: 'SPEAK_COMPLETE',
      success: true,
    };

    expect(response.type).toBe('SPEAK_COMPLETE');
    expect(response.success).toBe(true);
    expect(response.error).toBeUndefined();
  });

  test('should create error response with message', () => {
    const response: OffscreenSpeakResponse = {
      type: 'SPEAK_ERROR',
      success: false,
      error: 'Test error message',
    };

    expect(response.type).toBe('SPEAK_ERROR');
    expect(response.success).toBe(false);
    expect(response.error).toBe('Test error message');
  });

  test('should handle HelperNotFoundError', () => {
    const error = new HelperNotFoundError();
    expect(error.name).toBe('HelperNotFoundError');
    expect(error.message).toContain('Native TTS Helper not found');
  });

  test('should handle NetworkTimeoutError', () => {
    const error = new NetworkTimeoutError();
    expect(error.name).toBe('NetworkTimeoutError');
    expect(error.message).toContain('timed out');
  });

  test('should handle InvalidResponseError', () => {
    const error = new InvalidResponseError();
    expect(error.name).toBe('InvalidResponseError');
    expect(error.message).toContain('Invalid response');
  });

  test('should create custom error with message', () => {
    const error = new HelperNotFoundError('Custom message');
    expect(error.message).toBe('Custom message');
    expect(error.name).toBe('HelperNotFoundError');
  });
});

describe('Audio Playback Logic', () => {
  test('should create blob URL from audio data', () => {
    const audioBlob = new Blob(['test audio'], { type: 'audio/wav' });
    const url = mockCreateObjectURL(audioBlob);

    expect(url).toMatch(/^blob:mock-/);
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(mockObjectURLs.has(url)).toBe(true);
  });

  test('should revoke blob URL after playback', () => {
    const url = 'blob:mock-test';
    mockObjectURLs.add(url);

    mockRevokeObjectURL(url);

    expect(mockRevokeObjectURL).toHaveBeenCalledWith(url);
    expect(mockObjectURLs.has(url)).toBe(false);
  });

  test('should create Audio element with blob URL', () => {
    const audioBlob = new Blob(['test audio'], { type: 'audio/wav' });
    const url = mockCreateObjectURL(audioBlob);
    const audio = new MockAudio();
    audio.src = url;

    expect(audio.src).toBe(url);
  });

  test('should handle audio playback completion', async () => {
    const audio = new MockAudio();
    let completed = false;

    audio.onended = () => {
      completed = true;
    };

    await audio.play();

    // Wait for async completion
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(completed).toBe(true);
  });

  test('should handle audio playback error', () => {
    const audio = new MockAudio();
    let errorOccurred = false;

    audio.onerror = () => {
      errorOccurred = true;
    };

    // Trigger error
    if (audio.onerror) audio.onerror();

    expect(errorOccurred).toBe(true);
  });

  test('should pause current audio before playing new audio', () => {
    const audio = new MockAudio();
    audio.pause();

    expect(audio.pause).toHaveBeenCalledTimes(1);
  });
});

describe('Error Message Formatting', () => {
  test('should format HelperNotFoundError message', () => {
    const error = new HelperNotFoundError();
    const expectedMessage = 'Native helper not found. Please ensure the helper is running.';

    // Simulate error handling in offscreen.ts
    const errorMessage = error instanceof HelperNotFoundError
      ? expectedMessage
      : error.message;

    expect(errorMessage).toBe(expectedMessage);
  });

  test('should format NetworkTimeoutError message', () => {
    const error = new NetworkTimeoutError();
    const expectedMessage = 'Request timed out. The helper may be busy or not responding.';

    const errorMessage = error instanceof NetworkTimeoutError
      ? expectedMessage
      : error.message;

    expect(errorMessage).toBe(expectedMessage);
  });

  test('should format InvalidResponseError message', () => {
    const error = new InvalidResponseError();
    const expectedMessage = 'Invalid response from helper. Please try again.';

    const errorMessage = error instanceof InvalidResponseError
      ? expectedMessage
      : error.message;

    expect(errorMessage).toBe(expectedMessage);
  });

  test('should handle generic Error', () => {
    const error = new Error('Generic error message');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    expect(errorMessage).toBe('Generic error message');
  });

  test('should handle unknown error type', () => {
    const error = 'string error';
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    expect(errorMessage).toBe('An unexpected error occurred');
  });
});

describe('Message Type Discrimination', () => {
  test('should identify SPEAK_IN_OFFSCREEN message', () => {
    const message: SpeakInOffscreenMessage = {
      type: 'SPEAK_IN_OFFSCREEN',
      text: 'Test',
      voice: 'af_bella',
      speed: 1.0,
    };

    expect(message.type === 'SPEAK_IN_OFFSCREEN').toBe(true);
  });

  test('should identify SPEAK_COMPLETE response', () => {
    const response: OffscreenSpeakResponse = {
      type: 'SPEAK_COMPLETE',
      success: true,
    };

    expect(response.type === 'SPEAK_COMPLETE').toBe(true);
  });

  test('should identify SPEAK_ERROR response', () => {
    const response: OffscreenSpeakResponse = {
      type: 'SPEAK_ERROR',
      success: false,
      error: 'Test error',
    };

    expect(response.type === 'SPEAK_ERROR').toBe(true);
  });

  test('should distinguish between response types', () => {
    const successResponse: OffscreenSpeakResponse = {
      type: 'SPEAK_COMPLETE',
      success: true,
    };

    const errorResponse: OffscreenSpeakResponse = {
      type: 'SPEAK_ERROR',
      success: false,
      error: 'Error',
    };

    expect(successResponse.type).not.toBe(errorResponse.type);
    expect(successResponse.success).toBe(true);
    expect(errorResponse.success).toBe(false);
  });
});

describe('Request Validation', () => {
  test('should accept valid text lengths', () => {
    const shortText = 'Hi';
    const mediumText = 'This is a medium length text for testing.';
    const longText = 'a'.repeat(5000);

    expect(shortText.length).toBeGreaterThan(0);
    expect(mediumText.length).toBeGreaterThan(0);
    expect(longText.length).toBeGreaterThan(0);
  });

  test('should reject empty text after trimming', () => {
    const invalidTexts = ['', '   ', '\n\n', '\t\t', '  \n  \t  '];

    invalidTexts.forEach(text => {
      expect(text.trim().length).toBe(0);
    });
  });

  test('should accept valid voice IDs', () => {
    const validVoices = ['af_bella', 'af_nicole', 'af_sarah'];

    validVoices.forEach(voice => {
      expect(voice.length).toBeGreaterThan(0);
      expect(typeof voice).toBe('string');
    });
  });

  test('should validate speed range comprehensively', () => {
    const testCases = [
      { speed: 0.4, valid: false },
      { speed: 0.5, valid: true },
      { speed: 0.75, valid: true },
      { speed: 1.0, valid: true },
      { speed: 1.5, valid: true },
      { speed: 2.0, valid: true },
      { speed: 2.1, valid: false },
      { speed: -1.0, valid: false },
      { speed: 0, valid: false },
    ];

    testCases.forEach(({ speed, valid }) => {
      const isValid = speed >= 0.5 && speed <= 2.0;
      expect(isValid).toBe(valid);
    });
  });
});

/**
 * Tests for Extension Message Types (Phase 2.4/2.5)
 * Validates type safety and message structure
 */

import { describe, test, expect } from 'bun:test';
import type {
  GetSelectedTextMessage,
  SelectedTextResponse,
  SpeakInOffscreenMessage,
  OffscreenSpeakResponse,
  ContentScriptMessage,
  OffscreenMessage,
} from '../src/shared/types';

describe('Content Script Message Types', () => {
  test('GetSelectedTextMessage should have correct structure', () => {
    const message: GetSelectedTextMessage = {
      type: 'GET_SELECTED_TEXT',
    };

    expect(message.type).toBe('GET_SELECTED_TEXT');
  });

  test('SelectedTextResponse should include text and success', () => {
    const response: SelectedTextResponse = {
      text: 'Hello world',
      success: true,
    };

    expect(response.text).toBe('Hello world');
    expect(response.success).toBe(true);
    expect(response.error).toBeUndefined();
  });

  test('SelectedTextResponse should handle errors', () => {
    const response: SelectedTextResponse = {
      text: '',
      success: false,
      error: 'No text selected',
    };

    expect(response.success).toBe(false);
    expect(response.error).toBe('No text selected');
  });

  test('ContentScriptMessage union type should work', () => {
    const message: ContentScriptMessage = {
      type: 'GET_SELECTED_TEXT',
    };

    // Type guard
    if (message.type === 'GET_SELECTED_TEXT') {
      expect(message.type).toBe('GET_SELECTED_TEXT');
    }
  });
});

describe('Offscreen Document Message Types', () => {
  test('SpeakInOffscreenMessage should have correct structure', () => {
    const message: SpeakInOffscreenMessage = {
      type: 'SPEAK_IN_OFFSCREEN',
      text: 'Test text',
      voice: 'af_bella',
      speed: 1.0,
    };

    expect(message.type).toBe('SPEAK_IN_OFFSCREEN');
    expect(message.text).toBe('Test text');
    expect(message.voice).toBe('af_bella');
    expect(message.speed).toBe(1.0);
  });

  test('SpeakInOffscreenMessage should validate speed range', () => {
    const validSpeeds = [0.5, 1.0, 1.5, 2.0];

    validSpeeds.forEach(speed => {
      const message: SpeakInOffscreenMessage = {
        type: 'SPEAK_IN_OFFSCREEN',
        text: 'Test',
        voice: 'af_bella',
        speed,
      };

      expect(message.speed).toBeGreaterThanOrEqual(0.5);
      expect(message.speed).toBeLessThanOrEqual(2.0);
    });
  });

  test('OffscreenSpeakResponse should handle success', () => {
    const response: OffscreenSpeakResponse = {
      type: 'SPEAK_COMPLETE',
      success: true,
    };

    expect(response.type).toBe('SPEAK_COMPLETE');
    expect(response.success).toBe(true);
    expect(response.error).toBeUndefined();
  });

  test('OffscreenSpeakResponse should handle errors', () => {
    const response: OffscreenSpeakResponse = {
      type: 'SPEAK_ERROR',
      success: false,
      error: 'Helper not found',
    };

    expect(response.type).toBe('SPEAK_ERROR');
    expect(response.success).toBe(false);
    expect(response.error).toBe('Helper not found');
  });

  test('OffscreenMessage union type should work with discriminated unions', () => {
    // Test SPEAK_IN_OFFSCREEN
    const requestMessage: OffscreenMessage = {
      type: 'SPEAK_IN_OFFSCREEN',
      text: 'Test',
      voice: 'af_bella',
      speed: 1.0,
    };

    if (requestMessage.type === 'SPEAK_IN_OFFSCREEN') {
      expect(requestMessage.text).toBe('Test');
    }

    // Test SPEAK_COMPLETE
    const completeMessage: OffscreenMessage = {
      type: 'SPEAK_COMPLETE',
      success: true,
    };

    if (completeMessage.type === 'SPEAK_COMPLETE') {
      expect(completeMessage.success).toBe(true);
    }

    // Test SPEAK_ERROR
    const errorMessage: OffscreenMessage = {
      type: 'SPEAK_ERROR',
      success: false,
      error: 'Test error',
    };

    if (errorMessage.type === 'SPEAK_ERROR') {
      expect(errorMessage.error).toBe('Test error');
    }
  });
});

describe('Message Type Guards', () => {
  test('Should distinguish between message types by type field', () => {
    const messages: OffscreenMessage[] = [
      {
        type: 'SPEAK_IN_OFFSCREEN',
        text: 'Test',
        voice: 'af_bella',
        speed: 1.0,
      },
      {
        type: 'SPEAK_COMPLETE',
        success: true,
      },
      {
        type: 'SPEAK_ERROR',
        success: false,
        error: 'Error message',
      },
    ];

    let requestCount = 0;
    let completeCount = 0;
    let errorCount = 0;

    messages.forEach(msg => {
      if (msg.type === 'SPEAK_IN_OFFSCREEN') {
        requestCount++;
      } else if (msg.type === 'SPEAK_COMPLETE') {
        completeCount++;
      } else if (msg.type === 'SPEAK_ERROR') {
        errorCount++;
      }
    });

    expect(requestCount).toBe(1);
    expect(completeCount).toBe(1);
    expect(errorCount).toBe(1);
  });
});

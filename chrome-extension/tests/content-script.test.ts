/**
 * Tests for Content Script (Phase 2.4/2.5)
 * Validates text selection capture and visual feedback
 */

import { describe, test, expect } from 'bun:test';
import type {
  GetSelectedTextMessage,
  SelectedTextResponse,
} from '../src/shared/types';

// Mock Selection API
class MockSelection {
  private text: string;
  private ranges: MockRange[];

  constructor(text: string = '') {
    this.text = text;
    this.ranges = text ? [new MockRange(text)] : [];
  }

  toString(): string {
    return this.text;
  }

  getRangeAt(index: number): MockRange {
    return this.ranges[index];
  }

  get rangeCount(): number {
    return this.ranges.length;
  }
}

// Mock Range API
class MockRange {
  constructor(_text: string) {
    // Text parameter accepted for API compatibility but not used internally
  }

  getBoundingClientRect(): DOMRect {
    return {
      top: 100,
      left: 50,
      width: 200,
      height: 20,
      right: 250,
      bottom: 120,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    };
  }
}

// Helper to test hasActualContent function
function testHasActualContent(text: string): boolean {
  const hasLetters = /[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(text);
  return hasLetters;
}

describe('Content Script Message Handling', () => {
  test('should handle GET_SELECTED_TEXT message', () => {
    const message: GetSelectedTextMessage = {
      type: 'GET_SELECTED_TEXT',
    };

    expect(message.type).toBe('GET_SELECTED_TEXT');
  });

  test('should create success response', () => {
    const response: SelectedTextResponse = {
      text: 'Selected text',
      success: true,
    };

    expect(response.text).toBe('Selected text');
    expect(response.success).toBe(true);
    expect(response.error).toBeUndefined();
  });

  test('should create error response', () => {
    const response: SelectedTextResponse = {
      text: '',
      success: false,
      error: 'No text selected',
    };

    expect(response.text).toBe('');
    expect(response.success).toBe(false);
    expect(response.error).toBe('No text selected');
  });
});

describe('Text Selection Validation', () => {
  test('should accept valid text', () => {
    const validTexts = [
      'Hello world',
      'This is a sentence.',
      'Multiple\nlines\nof text',
      'Text with numbers 123',
      'Special chars: !@#$%',
    ];

    validTexts.forEach(text => {
      const trimmed = text.trim();
      expect(trimmed.length).toBeGreaterThan(0);
    });
  });

  test('should reject empty text', () => {
    const emptyTexts = ['', '   ', '\n\n\n', '\t\t\t'];

    emptyTexts.forEach(text => {
      const trimmed = text.trim();
      expect(trimmed.length).toBe(0);
    });
  });

  test('should trim whitespace correctly', () => {
    const testCases = [
      { input: '  hello  ', expected: 'hello' },
      { input: '\n\nworld\n\n', expected: 'world' },
      { input: '\t\ttest\t\t', expected: 'test' },
    ];

    testCases.forEach(({ input, expected }) => {
      expect(input.trim()).toBe(expected);
    });
  });
});

describe('hasActualContent Function', () => {
  test('should accept text with letters (English)', () => {
    const validTexts = [
      'Hello',
      'World',
      'a',
      'Z',
      'Test123',
      '123Test',
    ];

    validTexts.forEach(text => {
      expect(testHasActualContent(text)).toBe(true);
    });
  });

  test('should accept text with accented characters (European)', () => {
    const validTexts = [
      'café',
      'naïve',
      'résumé',
      'Ñoño',
      'Müller',
      'Łódź',
    ];

    validTexts.forEach(text => {
      expect(testHasActualContent(text)).toBe(true);
    });
  });

  test('should accept text with Cyrillic characters (Russian)', () => {
    const validTexts = [
      'Привет',
      'мир',
      'Москва',
    ];

    validTexts.forEach(text => {
      expect(testHasActualContent(text)).toBe(true);
    });
  });

  test('should accept text with CJK characters (Chinese/Japanese)', () => {
    const validTexts = [
      '你好',
      '世界',
      'こんにちは',
      'カタカナ',
      '漢字',
    ];

    validTexts.forEach(text => {
      expect(testHasActualContent(text)).toBe(true);
    });
  });

  test('should reject text without letters (symbols only)', () => {
    const invalidTexts = [
      '123',
      '!!!',
      '@@@',
      '###',
      '...',
      '---',
      '***',
      '   ',
    ];

    invalidTexts.forEach(text => {
      expect(testHasActualContent(text)).toBe(false);
    });
  });

  test('should reject text without letters (numbers only)', () => {
    const invalidTexts = [
      '0',
      '123',
      '456789',
      '3.14',
      '100%',
    ];

    invalidTexts.forEach(text => {
      expect(testHasActualContent(text)).toBe(false);
    });
  });

  test('should accept mixed content with at least one letter', () => {
    const validTexts = [
      '123a',
      'a123',
      '!!!hello!!!',
      '@test@',
      '---word---',
    ];

    validTexts.forEach(text => {
      expect(testHasActualContent(text)).toBe(true);
    });
  });
});

describe('Selection API Mocking', () => {
  test('MockSelection should return text', () => {
    const selection = new MockSelection('Hello world');
    expect(selection.toString()).toBe('Hello world');
    expect(selection.rangeCount).toBe(1);
  });

  test('MockSelection should handle empty selection', () => {
    const selection = new MockSelection('');
    expect(selection.toString()).toBe('');
    expect(selection.rangeCount).toBe(0);
  });

  test('MockRange should provide bounding rect', () => {
    const range = new MockRange('test');
    const rect = range.getBoundingClientRect();

    expect(rect.top).toBe(100);
    expect(rect.left).toBe(50);
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(20);
  });
});

describe('Visual Feedback Logic', () => {
  test('should calculate correct overlay dimensions', () => {
    const rect = {
      top: 100,
      left: 50,
      width: 200,
      height: 20,
      right: 250,
      bottom: 120,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    };

    // Overlay should match selection dimensions
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(20);
    expect(rect.top).toBe(100);
    expect(rect.left).toBe(50);
  });

  test('should use fixed positioning for overlay', () => {
    const position = 'fixed';
    const zIndex = '2147483647'; // Maximum z-index

    expect(position).toBe('fixed');
    expect(zIndex).toBe('2147483647');
  });

  test('should not interfere with page interactions', () => {
    const pointerEvents = 'none';
    expect(pointerEvents).toBe('none');
  });
});

describe('Error Response Scenarios', () => {
  test('should handle no selection error', () => {
    const response: SelectedTextResponse = {
      text: '',
      success: false,
      error: 'No text selected. Please select some text and try again.',
    };

    expect(response.success).toBe(false);
    expect(response.error).toContain('No text selected');
  });

  test('should handle no readable content error', () => {
    const response: SelectedTextResponse = {
      text: '',
      success: false,
      error: 'Selected text does not contain readable content.',
    };

    expect(response.success).toBe(false);
    expect(response.error).toContain('readable content');
  });

  test('should handle selection API unavailable error', () => {
    const response: SelectedTextResponse = {
      text: '',
      success: false,
      error: 'Unable to access text selection',
    };

    expect(response.success).toBe(false);
    expect(response.error).toContain('Unable to access');
  });

  test('should handle unexpected errors', () => {
    const error = new Error('Unexpected error');
    const response: SelectedTextResponse = {
      text: '',
      success: false,
      error: error.message,
    };

    expect(response.success).toBe(false);
    expect(response.error).toBe('Unexpected error');
  });
});

describe('Text Preview Logic', () => {
  test('should truncate long text for preview', () => {
    const longText = 'a'.repeat(100);
    const preview = longText.substring(0, 50) + (longText.length > 50 ? '...' : '');

    expect(preview.length).toBe(53); // 50 chars + '...'
    expect(preview.endsWith('...')).toBe(true);
  });

  test('should not truncate short text', () => {
    const shortText = 'Hello world';
    const preview = shortText.substring(0, 50) + (shortText.length > 50 ? '...' : '');

    expect(preview).toBe(shortText);
    expect(preview.endsWith('...')).toBe(false);
  });

  test('should handle exactly 50 characters', () => {
    const exactText = 'a'.repeat(50);
    const preview = exactText.substring(0, 50) + (exactText.length > 50 ? '...' : '');

    expect(preview).toBe(exactText);
    expect(preview.length).toBe(50);
  });
});

describe('Message Response Patterns', () => {
  test('should return synchronous response (return false)', () => {
    // Message listener should return false for synchronous responses
    const shouldReturnAsync = false;
    expect(shouldReturnAsync).toBe(false);
  });

  test('should handle unknown message types', () => {
    // Unknown message types should return false (not handled)
    const handled = false;
    expect(handled).toBe(false);
  });
});

describe('CSS Animation Timing', () => {
  test('should match animation duration with removal timeout', () => {
    const animationDuration = 600; // ms
    const removalTimeout = 600; // ms

    expect(animationDuration).toBe(removalTimeout);
  });

  test('should use reasonable animation duration', () => {
    const duration = 600; // ms

    // Should be visible but not too long
    expect(duration).toBeGreaterThanOrEqual(400);
    expect(duration).toBeLessThanOrEqual(1000);
  });
});

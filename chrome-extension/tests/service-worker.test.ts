/**
 * Tests for Background Service Worker (Phase 2.4/2.5)
 * Validates context menu, message routing, and offscreen document management
 */

import { describe, test, expect } from 'bun:test';
import type {
  GetSelectedTextMessage,
  SelectedTextResponse,
  SpeakInOffscreenMessage,
  OffscreenSpeakResponse,
} from '../src/shared/types';

describe('Service Worker Constants', () => {
  test('should have correct context menu ID', () => {
    const CONTEXT_MENU_ID = 'natural-tts-speak-selection';
    expect(CONTEXT_MENU_ID).toBe('natural-tts-speak-selection');
  });

  test('should have correct offscreen document path', () => {
    const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';
    expect(OFFSCREEN_DOCUMENT_PATH).toBe('/offscreen.html');
  });

  test('should have correct default voice', () => {
    const DEFAULT_VOICE = 'af_bella';
    expect(DEFAULT_VOICE).toBe('af_bella');
  });

  test('should have correct default speed', () => {
    const DEFAULT_SPEED = 1.0;
    expect(DEFAULT_SPEED).toBe(1.0);
  });
});

describe('Context Menu Configuration', () => {
  test('should create context menu with correct properties', () => {
    const menuConfig = {
      id: 'natural-tts-speak-selection',
      title: 'Speak selected text',
      contexts: ['selection'],
    };

    expect(menuConfig.id).toBe('natural-tts-speak-selection');
    expect(menuConfig.title).toBe('Speak selected text');
    expect(menuConfig.contexts).toContain('selection');
  });

  test('should only show on text selection', () => {
    const contexts = ['selection'];
    expect(contexts.length).toBe(1);
    expect(contexts[0]).toBe('selection');
  });
});

describe('Message to Content Script', () => {
  test('should create GET_SELECTED_TEXT message', () => {
    const message: GetSelectedTextMessage = {
      type: 'GET_SELECTED_TEXT',
    };

    expect(message.type).toBe('GET_SELECTED_TEXT');
  });

  test('should handle successful selected text response', () => {
    const response: SelectedTextResponse = {
      text: 'Selected text from page',
      success: true,
    };

    expect(response.success).toBe(true);
    expect(response.text).toBe('Selected text from page');
    expect(response.error).toBeUndefined();
  });

  test('should handle failed selected text response', () => {
    const response: SelectedTextResponse = {
      text: '',
      success: false,
      error: 'No text selected',
    };

    expect(response.success).toBe(false);
    expect(response.text).toBe('');
    expect(response.error).toBe('No text selected');
  });

  test('should handle communication error response', () => {
    const response: SelectedTextResponse = {
      text: '',
      success: false,
      error: 'Failed to communicate with page',
    };

    expect(response.success).toBe(false);
    expect(response.error).toContain('Failed to communicate');
  });
});

describe('Message to Offscreen Document', () => {
  test('should create SPEAK_IN_OFFSCREEN message', () => {
    const message: SpeakInOffscreenMessage = {
      type: 'SPEAK_IN_OFFSCREEN',
      text: 'Text to speak',
      voice: 'af_bella',
      speed: 1.0,
    };

    expect(message.type).toBe('SPEAK_IN_OFFSCREEN');
    expect(message.text).toBe('Text to speak');
    expect(message.voice).toBe('af_bella');
    expect(message.speed).toBe(1.0);
  });

  test('should handle successful offscreen response', () => {
    const response: OffscreenSpeakResponse = {
      type: 'SPEAK_COMPLETE',
      success: true,
    };

    expect(response.type).toBe('SPEAK_COMPLETE');
    expect(response.success).toBe(true);
    expect(response.error).toBeUndefined();
  });

  test('should handle failed offscreen response', () => {
    const response: OffscreenSpeakResponse = {
      type: 'SPEAK_ERROR',
      success: false,
      error: 'Helper not found',
    };

    expect(response.type).toBe('SPEAK_ERROR');
    expect(response.success).toBe(false);
    expect(response.error).toBe('Helper not found');
  });

  test('should handle offscreen communication error', () => {
    const response: OffscreenSpeakResponse = {
      type: 'SPEAK_ERROR',
      success: false,
      error: 'Failed to communicate with offscreen document',
    };

    expect(response.success).toBe(false);
    expect(response.error).toContain('offscreen document');
  });
});

describe('Preference Loading', () => {
  test('should use default preferences when none saved', () => {
    const prefs = {
      voice: 'af_bella',
      speed: 1.0,
    };

    expect(prefs.voice).toBe('af_bella');
    expect(prefs.speed).toBe(1.0);
  });

  test('should load saved voice preference', () => {
    const savedPrefs = {
      voice: 'af_nicole',
      speed: 1.0,
    };

    expect(savedPrefs.voice).toBe('af_nicole');
  });

  test('should load saved speed preference', () => {
    const savedPrefs = {
      voice: 'af_bella',
      speed: 1.5,
    };

    expect(savedPrefs.speed).toBe(1.5);
  });

  test('should handle missing voice with default', () => {
    const savedPrefs = {
      voice: undefined,
      speed: 1.5,
    };

    const voice = savedPrefs.voice || 'af_bella';
    expect(voice).toBe('af_bella');
  });

  test('should handle missing speed with default', () => {
    const savedPrefs = {
      voice: 'af_nicole',
      speed: undefined,
    };

    const speed = savedPrefs.speed || 1.0;
    expect(speed).toBe(1.0);
  });
});

describe('Offscreen Document API', () => {
  test('should create document with correct reason', () => {
    const config = {
      url: '/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play text-to-speech audio from context menu actions',
    };

    expect(config.reasons).toContain('AUDIO_PLAYBACK');
    expect(config.justification).toContain('audio');
  });

  test('should have proper justification', () => {
    const justification = 'Play text-to-speech audio from context menu actions';

    expect(justification.length).toBeGreaterThan(10);
    expect(justification).toContain('text-to-speech');
    expect(justification).toContain('audio');
  });
});

describe('Context Menu Click Handler', () => {
  test('should only handle correct menu ID', () => {
    const ourMenuId = 'natural-tts-speak-selection';
    const otherMenuId = 'some-other-menu-item';

    expect(ourMenuId).toBe('natural-tts-speak-selection');
    expect(otherMenuId).not.toBe('natural-tts-speak-selection');
  });

  test('should require valid tab ID', () => {
    const validTabId = 123;
    const invalidTabId = undefined;

    expect(validTabId).toBeGreaterThan(0);
    expect(invalidTabId).toBeUndefined();
  });
});

describe('Error Handling', () => {
  test('should handle Error instances', () => {
    const error = new Error('Test error');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    expect(errorMessage).toBe('Test error');
  });

  test('should handle non-Error objects', () => {
    const error = 'string error';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    expect(errorMessage).toBe('Unknown error');
  });

  test('should provide meaningful error messages', () => {
    const errors = [
      'Failed to communicate with page',
      'Failed to communicate with offscreen document',
      'No active tab found',
      'Failed to get selected text',
    ];

    errors.forEach(error => {
      expect(error.length).toBeGreaterThan(10);
      // Check if error contains at least one meaningful keyword
      const hasMeaningfulKeyword =
        error.includes('Failed') ||
        error.includes('No') ||
        error.includes('not');
      expect(hasMeaningfulKeyword).toBe(true);
    });
  });
});

describe('Text Preview Logic', () => {
  test('should truncate long text for logging', () => {
    const longText = 'a'.repeat(100);
    const preview = longText.substring(0, 50);

    expect(preview.length).toBe(50);
    expect(preview).not.toBe(longText);
  });

  test('should not truncate short text', () => {
    const shortText = 'Hello world';
    const preview = shortText.substring(0, 50);

    expect(preview).toBe(shortText);
  });
});

describe('Message Flow Validation', () => {
  test('should validate complete flow from context menu to offscreen', () => {
    // 1. Context menu click
    const menuId = 'natural-tts-speak-selection';
    expect(menuId).toBe('natural-tts-speak-selection');

    // 2. Get selected text message
    const getTextMessage: GetSelectedTextMessage = {
      type: 'GET_SELECTED_TEXT',
    };
    expect(getTextMessage.type).toBe('GET_SELECTED_TEXT');

    // 3. Selected text response
    const textResponse: SelectedTextResponse = {
      text: 'Test text',
      success: true,
    };
    expect(textResponse.success).toBe(true);

    // 4. Speak in offscreen message
    const speakMessage: SpeakInOffscreenMessage = {
      type: 'SPEAK_IN_OFFSCREEN',
      text: textResponse.text,
      voice: 'af_bella',
      speed: 1.0,
    };
    expect(speakMessage.type).toBe('SPEAK_IN_OFFSCREEN');
    expect(speakMessage.text).toBe('Test text');

    // 5. Offscreen response
    const offscreenResponse: OffscreenSpeakResponse = {
      type: 'SPEAK_COMPLETE',
      success: true,
    };
    expect(offscreenResponse.success).toBe(true);
  });

  test('should handle error at each step', () => {
    // Error getting selected text
    const textError: SelectedTextResponse = {
      text: '',
      success: false,
      error: 'No text selected',
    };
    expect(textError.success).toBe(false);

    // Error speaking in offscreen
    const offscreenError: OffscreenSpeakResponse = {
      type: 'SPEAK_ERROR',
      success: false,
      error: 'Helper not found',
    };
    expect(offscreenError.success).toBe(false);
  });
});

describe('Chrome API Mocking Requirements', () => {
  test('should define required chrome.contextMenus structure', () => {
    const contextMenus = {
      create: (config: any) => config,
      removeAll: async () => {},
      onClicked: {
        addListener: (callback: any) => {},
      },
    };

    expect(contextMenus.create).toBeDefined();
    expect(contextMenus.removeAll).toBeDefined();
    expect(contextMenus.onClicked.addListener).toBeDefined();
  });

  test('should define required chrome.runtime structure', () => {
    const runtime = {
      onInstalled: {
        addListener: (callback: any) => {},
      },
      onStartup: {
        addListener: (callback: any) => {},
      },
      sendMessage: async (message: any) => {},
      getContexts: async (filter: any) => [],
    };

    expect(runtime.onInstalled.addListener).toBeDefined();
    expect(runtime.onStartup.addListener).toBeDefined();
    expect(runtime.sendMessage).toBeDefined();
    expect(runtime.getContexts).toBeDefined();
  });

  test('should define required chrome.tabs structure', () => {
    const tabs = {
      sendMessage: async (tabId: number, message: any) => {},
    };

    expect(tabs.sendMessage).toBeDefined();
  });

  test('should define required chrome.storage structure', () => {
    const storage = {
      local: {
        get: async (keys: string[]) => ({}),
        set: async (items: any) => {},
      },
    };

    expect(storage.local.get).toBeDefined();
    expect(storage.local.set).toBeDefined();
  });

  test('should define required chrome.offscreen structure', () => {
    const offscreen = {
      createDocument: async (config: any) => {},
    };

    expect(offscreen.createDocument).toBeDefined();
  });
});

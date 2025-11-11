/**
 * Background Service Worker (Phase 2.4/2.5)
 *
 * Manages context menu, coordinates between components,
 * and handles offscreen document for audio playback.
 */

import type {
  GetSelectedTextMessage,
  SelectedTextResponse,
  SpeakInOffscreenMessage,
  OffscreenSpeakResponse,
} from '../shared/types';

/**
 * Constants
 */
const CONTEXT_MENU_ID = 'natural-tts-speak-selection';
const OFFSCREEN_DOCUMENT_PATH = '/offscreen/offscreen.html';

/**
 * Default preferences
 */
const DEFAULT_VOICE = 'af_bella';
const DEFAULT_SPEED = 1.0;

/**
 * Initialize background service worker
 */
console.log('[Natural TTS] Background service worker loaded');

/**
 * Set up context menu on extension install
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] Extension installed/updated');

  // Create context menu item
  await setupContextMenu();
});

/**
 * Set up context menu on startup
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Extension started');

  // Recreate context menu
  await setupContextMenu();
});

/**
 * Create context menu item for text selection
 */
async function setupContextMenu(): Promise<void> {
  try {
    // Remove existing menu items
    await chrome.contextMenus.removeAll();

    // Create new menu item
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Speak selected text',
      contexts: ['selection'],
    });

    console.log('[Background] Context menu created');
  } catch (error) {
    console.error('[Background] Error setting up context menu:', error);
  }
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('[Background] Context menu clicked:', {
    menuItemId: info.menuItemId,
    tabId: tab?.id,
  });

  // Only handle our menu item
  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }

  // Ensure we have a valid tab
  if (!tab?.id) {
    console.error('[Background] No active tab found');
    return;
  }

  try {
    // Get selected text from content script
    const selectedText = await getSelectedText(tab.id);

    if (!selectedText.success || !selectedText.text) {
      console.error('[Background] Failed to get selected text:', selectedText.error);
      return;
    }

    console.log('[Background] Got selected text:', {
      length: selectedText.text.length,
      preview: selectedText.text.substring(0, 50),
    });

    // Get user preferences
    const { voice, speed } = await getPreferences();

    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Send text to offscreen document for speech generation
    const response = await sendToOffscreen({
      type: 'SPEAK_IN_OFFSCREEN',
      text: selectedText.text,
      voice,
      speed,
    });

    if (response.success) {
      console.log('[Background] Speech playback completed successfully');
    } else {
      console.error('[Background] Speech playback failed:', response.error);
    }

  } catch (error) {
    console.error('[Background] Error handling context menu click:', error);
  }
});

/**
 * Get selected text from content script in active tab
 */
async function getSelectedText(tabId: number): Promise<SelectedTextResponse> {
  try {
    const message: GetSelectedTextMessage = {
      type: 'GET_SELECTED_TEXT',
    };

    const response = await chrome.tabs.sendMessage(tabId, message) as SelectedTextResponse;
    return response;

  } catch (error) {
    console.error('[Background] Error getting selected text:', error);
    return {
      text: '',
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with page',
    };
  }
}

/**
 * Get voice and speed preferences from storage
 */
async function getPreferences(): Promise<{ voice: string; speed: number }> {
  try {
    const result = await chrome.storage.local.get(['voice', 'speed']);

    return {
      voice: result.voice || DEFAULT_VOICE,
      speed: result.speed || DEFAULT_SPEED,
    };
  } catch (error) {
    console.error('[Background] Error loading preferences:', error);
    return {
      voice: DEFAULT_VOICE,
      speed: DEFAULT_SPEED,
    };
  }
}

/**
 * Ensure offscreen document exists
 * Creates it if it doesn't exist, or returns if already exists
 */
async function ensureOffscreenDocument(): Promise<void> {
  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    });

    if (existingContexts.length > 0) {
      console.log('[Background] Offscreen document already exists');
      return;
    }

    // Create offscreen document
    console.log('[Background] Creating offscreen document');
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['AUDIO_PLAYBACK' as chrome.offscreen.Reason],
      justification: 'Play text-to-speech audio from context menu actions',
    });

    console.log('[Background] Offscreen document created successfully');

  } catch (error) {
    // Document might already exist - this is not necessarily an error
    console.log('[Background] Offscreen document exists or created');
  }
}

/**
 * Send message to offscreen document
 */
async function sendToOffscreen(
  message: SpeakInOffscreenMessage
): Promise<OffscreenSpeakResponse> {
  try {
    const response = await chrome.runtime.sendMessage(message) as OffscreenSpeakResponse;
    return response;

  } catch (error) {
    console.error('[Background] Error sending message to offscreen:', error);
    return {
      type: 'SPEAK_ERROR',
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with offscreen document',
    };
  }
}

/**
 * Export for testing
 */
if (typeof globalThis !== 'undefined') {
  (globalThis as any).__serviceWorkerTestHelpers = {
    setupContextMenu,
    getSelectedText,
    getPreferences,
    ensureOffscreenDocument,
    sendToOffscreen,
  };
}

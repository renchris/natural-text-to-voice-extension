/**
 * Background Service Worker (Phase 2.4/2.5/2.6)
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
import { loadSettings } from '../shared/settings-defaults';
import { cleanupPDFLigatures } from '../shared/text-cleanup';

/**
 * Constants
 */
const CONTEXT_MENU_ID = 'natural-tts-speak-selection';
const OFFSCREEN_DOCUMENT_PATH = '/offscreen/offscreen.html';

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
    hasSelectionText: !!info.selectionText,
  });

  // Only handle our menu item
  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }

  try {
    let selectedText = '';

    // Determine how to get selected text based on context
    // For regular webpages (tab.id >= 0): use content script for better validation
    // For PDFs (tab.id < 0): use context menu's info.selectionText
    if (tab?.id && tab.id >= 0) {
      // Regular webpage - use content script
      const response = await getSelectedText(tab.id);

      if (!response.success || !response.text) {
        console.error('[Background] Failed to get selected text:', response.error);
        return;
      }

      selectedText = response.text;
      console.log('[Background] Got text from webpage via content script');

    } else {
      // PDF or restricted page - use context menu's selectionText
      // This works because context menu is built-in Chrome API
      // Browser passes selected text directly, bypassing extension isolation
      selectedText = info.selectionText || '';

      if (!selectedText || selectedText.trim().length === 0) {
        console.error('[Background] No text selected in PDF');
        return;
      }

      console.log('[Background] Got text from PDF via context menu');

      // Clean up PDF ligature extraction errors
      // PDFs with incorrect ToUnicode CMap mappings often have ligatures
      // extracted as wrong characters (!, ®, €, etc.)
      const originalText = selectedText;
      selectedText = cleanupPDFLigatures(selectedText);

      // Log if cleanup made changes (helps with debugging)
      if (selectedText !== originalText) {
        console.log('[Background] Cleaned PDF ligatures:', {
          changesDetected: true,
          beforePreview: originalText.substring(0, 50),
          afterPreview: selectedText.substring(0, 50),
        });
      }
    }

    console.log('[Background] Selected text:', {
      length: selectedText.length,
      preview: selectedText.substring(0, 50),
    });

    // Get user preferences
    const { voice, speed } = await getPreferences();

    // Note: Context menu is an explicit user action, so we always play
    // (autoPlay setting is reserved for future use)

    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Send text to offscreen document for speech generation
    const response = await sendToOffscreen({
      type: 'SPEAK_IN_OFFSCREEN',
      text: selectedText,
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
 * Get user preferences from storage
 * Uses centralized settings from Phase 2.6
 */
async function getPreferences(): Promise<{ voice: string; speed: number; autoPlay: boolean }> {
  try {
    const settings = await loadSettings();
    return {
      voice: settings.selectedVoice,
      speed: settings.selectedSpeed,
      autoPlay: settings.autoPlay,
    };
  } catch (error) {
    console.error('[Background] Error loading preferences:', error);
    // Return defaults from loadSettings fallback
    const settings = await loadSettings();
    return {
      voice: settings.selectedVoice,
      speed: settings.selectedSpeed,
      autoPlay: settings.autoPlay,
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

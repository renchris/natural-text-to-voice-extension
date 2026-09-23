/**
 * Background Service Worker (Phase 2.4/2.5/2.6)
 *
 * Manages context menu, coordinates between components,
 * and handles offscreen document for audio playback.
 */

import type {
  SpeakInOffscreenMessage,
  OffscreenSpeakResponse,
} from '../shared/types';
import { loadSettings } from '../shared/settings-defaults';
import { resolveContextMenuText } from '../shared/selection';

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
 *
 * NOTE: an extension-side prewarmHelper() that POSTed /speak with a whitespace
 * text was removed in v1.4.1 — on lazy-load helpers (pre-rebuild) it stripped
 * to empty after normalize_text() and hung the Python worker, breaking every
 * subsequent /speak. Helper-side eager-load (tts_worker.py) is the proper
 * warmup mechanism; extension-side prewarm was redundant.
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] Extension installed/updated');
  await setupContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Extension started');
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
    // Read the selection on demand (activeTab was granted by this click),
    // falling back to info.selectionText for PDFs, iframes and inputs.
    const selectedText = await resolveContextMenuText(info, tab);

    if (!selectedText) {
      console.warn('[Background] No selected text to speak');
      return;
    }

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
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    });

    if (existingContexts.length > 0) {
      console.log('[Background] Offscreen document already exists');
      return;
    }

    console.log('[Background] Creating offscreen document');
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['AUDIO_PLAYBACK' as chrome.offscreen.Reason],
      justification: 'Play text-to-speech audio from context menu actions',
    });

    // createDocument resolves when the URL has been navigated to, but
    // offscreen.js's onMessage listener registers AFTER its module finishes
    // loading. Without this wait, the first sendMessage races the script
    // load and gets dropped silently. 300ms is conservative; the script is
    // ~6KB and parses in well under that on real hardware.
    await new Promise(r => setTimeout(r, 300));

    console.log('[Background] Offscreen document created successfully');

  } catch (error) {
    console.log('[Background] Offscreen document exists or created');
  }
}

/**
 * Send message to offscreen document, retrying once on connection failure
 * (defends against the offscreen-listener registration race).
 */
async function sendToOffscreen(
  message: SpeakInOffscreenMessage
): Promise<OffscreenSpeakResponse> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage(message) as OffscreenSpeakResponse | undefined;
      if (response) return response;
      // No response — the listener wasn't ready. Retry after a short delay.
      console.warn(`[Background] sendMessage returned no response (attempt ${attempt})`);
    } catch (error) {
      console.warn(`[Background] sendMessage threw (attempt ${attempt}):`, error);
    }
    if (attempt === 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return {
    type: 'SPEAK_ERROR',
    success: false,
    error: 'Offscreen document unreachable after retry — check service worker console',
  };
}

/**
 * Export for testing
 */
if (typeof globalThis !== 'undefined') {
  (globalThis as any).__serviceWorkerTestHelpers = {
    setupContextMenu,
    getPreferences,
    ensureOffscreenDocument,
    sendToOffscreen,
  };
}

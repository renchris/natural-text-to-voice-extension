/**
 * Content Script for Text Selection (Phase 2.4/2.5)
 *
 * Injected into all web pages to capture selected text.
 * Listens for messages from popup and provides visual feedback.
 */

import type {
  GetSelectedTextMessage,
  SelectedTextResponse,
  ContentScriptMessage,
} from '../shared/types';

/**
 * Initialize content script
 */
console.log('[Natural TTS] Content script loaded');

/**
 * Listen for messages from popup
 */
chrome.runtime.onMessage.addListener((
  message: ContentScriptMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: SelectedTextResponse) => void
): boolean => {
  // Handle GET_SELECTED_TEXT message
  if (message.type === 'GET_SELECTED_TEXT') {
    const response = handleGetSelectedText();
    sendResponse(response);
    return false; // Synchronous response
  }

  // Unknown message type
  return false;
});

/**
 * Handle GET_SELECTED_TEXT request
 * Captures selected text and provides visual feedback
 */
function handleGetSelectedText(): SelectedTextResponse {
  try {
    // Get current text selection
    const selection = window.getSelection();

    if (!selection) {
      return {
        text: '',
        success: false,
        error: 'Unable to access text selection',
      };
    }

    // Extract selected text
    const selectedText = selection.toString().trim();

    // Validate selection
    if (!selectedText || selectedText.length === 0) {
      return {
        text: '',
        success: false,
        error: 'No text selected. Please select some text and try again.',
      };
    }

    // Validate text contains actual content (not just symbols)
    if (!hasActualContent(selectedText)) {
      return {
        text: '',
        success: false,
        error: 'Selected text does not contain readable content.',
      };
    }

    // Show visual feedback
    showSelectionFeedback(selection);

    console.log('[Content Script] Selected text captured:', {
      length: selectedText.length,
      preview: selectedText.substring(0, 50) + (selectedText.length > 50 ? '...' : ''),
    });

    return {
      text: selectedText,
      success: true,
    };

  } catch (error) {
    console.error('[Content Script] Error capturing selected text:', error);
    return {
      text: '',
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Check if text contains actual readable content
 * Rejects selections that are only symbols, numbers, or whitespace
 */
function hasActualContent(text: string): boolean {
  // Check if text has at least one letter
  const hasLetters = /[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(text);
  return hasLetters;
}

/**
 * Show visual feedback for selected text
 * Temporarily highlights the selection with animation
 */
function showSelectionFeedback(selection: Selection): void {
  try {
    // Get range of selection
    if (selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Create feedback overlay
    const overlay = document.createElement('div');
    overlay.className = 'natural-tts-selection-feedback';

    // Position overlay over selection
    overlay.style.position = 'fixed';
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '2147483647'; // Maximum z-index

    // Add to page
    document.body.appendChild(overlay);

    // Remove after animation completes
    setTimeout(() => {
      overlay.remove();
    }, 600); // Match CSS animation duration

  } catch (error) {
    // Visual feedback is optional - don't fail if it errors
    console.warn('[Content Script] Failed to show visual feedback:', error);
  }
}

/**
 * Export for testing
 */
if (typeof window !== 'undefined') {
  (window as any).__contentScriptTestHelpers = {
    handleGetSelectedText,
    hasActualContent,
    showSelectionFeedback,
  };
}

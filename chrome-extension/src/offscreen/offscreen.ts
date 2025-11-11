/**
 * Offscreen Document for Audio Playback (Phase 2.4/2.5)
 *
 * Handles audio playback from context menu actions reliably,
 * even when the popup is closed. Runs in a hidden document
 * managed by the background service worker.
 */

import { getApiClient } from '../shared/api-client';
import type {
  SpeakInOffscreenMessage,
  OffscreenSpeakResponse,
  OffscreenMessage,
} from '../shared/types';
import {
  HelperNotFoundError,
  NetworkTimeoutError,
  InvalidResponseError,
} from '../shared/types';

/**
 * Current audio playback state
 */
let currentAudio: HTMLAudioElement | null = null;

/**
 * Initialize offscreen document
 */
console.log('[Natural TTS] Offscreen document loaded');

/**
 * Listen for messages from background service worker
 */
chrome.runtime.onMessage.addListener((
  message: OffscreenMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: OffscreenSpeakResponse) => void
): boolean => {
  // Only handle messages from background worker
  if (message.type === 'SPEAK_IN_OFFSCREEN') {
    handleSpeakRequest(message)
      .then(response => sendResponse(response))
      .catch(error => {
        console.error('[Offscreen] Error handling speak request:', error);
        sendResponse({
          type: 'SPEAK_ERROR',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    // Return true to indicate async response
    return true;
  }

  // Unknown message type
  return false;
});

/**
 * Handle speak request from background worker
 */
async function handleSpeakRequest(
  message: SpeakInOffscreenMessage
): Promise<OffscreenSpeakResponse> {
  console.log('[Offscreen] Received speak request:', {
    textLength: message.text.length,
    voice: message.voice,
    speed: message.speed,
  });

  try {
    // Validate text
    if (!message.text || message.text.trim().length === 0) {
      throw new Error('No text provided for speech generation');
    }

    // Validate speed
    if (message.speed < 0.5 || message.speed > 2.0) {
      throw new Error(`Invalid speed: ${message.speed}. Must be between 0.5 and 2.0`);
    }

    // Stop any currently playing audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    // Generate speech using API client
    const client = getApiClient();
    const audioBlob = await client.speak({
      text: message.text,
      voice: message.voice,
      speed: message.speed,
    });

    // Play audio
    await playAudio(audioBlob);

    console.log('[Offscreen] Audio playback complete');

    return {
      type: 'SPEAK_COMPLETE',
      success: true,
    };

  } catch (error) {
    console.error('[Offscreen] Error generating/playing speech:', error);

    // Determine error type
    let errorMessage: string;
    if (error instanceof HelperNotFoundError) {
      errorMessage = 'Native helper not found. Please ensure the helper is running.';
    } else if (error instanceof NetworkTimeoutError) {
      errorMessage = 'Request timed out. The helper may be busy or not responding.';
    } else if (error instanceof InvalidResponseError) {
      errorMessage = 'Invalid response from helper. Please try again.';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = 'An unexpected error occurred';
    }

    return {
      type: 'SPEAK_ERROR',
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Play audio from blob
 * @param audioBlob - Audio data in WAV format
 */
async function playAudio(audioBlob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      currentAudio = audio;

      // Handle playback completion
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        resolve();
      };

      // Handle playback errors
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        reject(new Error('Failed to play audio'));
      };

      // Start playback
      audio.play().catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Export for testing
 */
if (typeof window !== 'undefined') {
  (window as any).__offscreenTestHelpers = {
    playAudio,
    handleSpeakRequest,
  };
}

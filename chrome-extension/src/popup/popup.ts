/**
 * Popup UI for Natural TTS Chrome Extension
 * Handles voice selection, speed control, and speech generation
 */

import { getApiClient } from '../shared/api-client';
import { Voice, HealthResponse } from '../shared/types';
import { HelperNotFoundError, NetworkTimeoutError, InvalidResponseError } from '../shared/types';

// =================================================================================
// TYPES & INTERFACES
// =================================================================================

interface PopupState {
  voices: Voice[];
  selectedVoice: string;
  selectedSpeed: number;
  helperStatus: 'connected' | 'disconnected' | 'checking';
  isGenerating: boolean;
  currentAudio: HTMLAudioElement | null;
}

type MessageType = 'success' | 'error' | 'warning' | 'info';

// =================================================================================
// DOM ELEMENTS
// =================================================================================

// Cache all DOM elements for performance
const elements = {
  voiceSelect: document.getElementById('voiceSelect') as HTMLSelectElement,
  speedSlider: document.getElementById('speedSlider') as HTMLInputElement,
  speedValue: document.getElementById('speedValue') as HTMLSpanElement,
  speakButton: document.getElementById('speakButton') as HTMLButtonElement,
  buttonText: document.getElementById('buttonText') as HTMLSpanElement,
  statusIndicator: document.getElementById('statusIndicator') as HTMLDivElement,
  messageContainer: document.getElementById('messageContainer') as HTMLDivElement,
  settingsButton: document.getElementById('settingsButton') as HTMLButtonElement,
};

// =================================================================================
// STATE MANAGEMENT
// =================================================================================

const state: PopupState = {
  voices: [],
  selectedVoice: 'af_bella', // Default voice
  selectedSpeed: 1.0,
  helperStatus: 'checking',
  isGenerating: false,
  currentAudio: null,
};

// =================================================================================
// INITIALIZATION
// =================================================================================

/**
 * Initialize the popup when DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await init();
  } catch (error) {
    console.error('Failed to initialize popup:', error);
    showMessage('Failed to initialize popup. Please refresh.', 'error');
  }
});

/**
 * Main initialization function
 */
async function init(): Promise<void> {
  // Setup event listeners
  setupEventListeners();

  // Load saved preferences first
  await loadPreferences();

  // Check helper status
  await checkHelperStatus();

  // Load voices if helper is connected
  if (state.helperStatus === 'connected') {
    await loadVoices();
  } else {
    showMessage('Native helper not running. Please start the helper.', 'error');
    elements.speakButton.disabled = true;
  }

  // Update UI to reflect current state
  updateUI();
}

/**
 * Set up all event listeners
 */
function setupEventListeners(): void {
  elements.voiceSelect.addEventListener('change', handleVoiceChange);
  elements.speedSlider.addEventListener('input', handleSpeedChange);
  elements.speakButton.addEventListener('click', handleSpeak);
  elements.settingsButton.addEventListener('click', handleSettings);

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

// =================================================================================
// HELPER STATUS
// =================================================================================

/**
 * Check if native helper is running and responsive
 */
async function checkHelperStatus(): Promise<void> {
  const client = getApiClient();

  try {
    const health: HealthResponse = await client.checkHealth();

    if (health.status === 'ok' && health.model_loaded) {
      state.helperStatus = 'connected';
      updateStatusIndicator('connected', `Helper is running (${health.model})`);
    } else {
      state.helperStatus = 'disconnected';
      updateStatusIndicator('disconnected', 'Helper model not loaded');
    }
  } catch (error) {
    state.helperStatus = 'disconnected';

    if (error instanceof HelperNotFoundError) {
      updateStatusIndicator('disconnected', 'Helper not found - please start the helper');
    } else if (error instanceof NetworkTimeoutError) {
      updateStatusIndicator('disconnected', 'Helper not responding - check if it\'s running');
    } else {
      updateStatusIndicator('disconnected', 'Failed to connect to helper');
    }

    throw error; // Re-throw to be handled by caller
  }
}

/**
 * Update status indicator UI
 */
function updateStatusIndicator(status: 'connected' | 'disconnected' | 'checking', tooltip: string): void {
  elements.statusIndicator.className = `status-dot status-${status}`;
  elements.statusIndicator.title = tooltip;
}

// =================================================================================
// VOICE LOADING
// =================================================================================

/**
 * Load available voices from API
 */
async function loadVoices(): Promise<void> {
  const client = getApiClient();

  try {
    state.voices = await client.getVoices();

    if (state.voices.length === 0) {
      throw new Error('No voices available');
    }

    populateVoiceDropdown();
  } catch (error) {
    console.error('Failed to load voices:', error);
    showMessage('Failed to load voices. Using default.', 'warning');

    // Fallback to default voice
    elements.voiceSelect.innerHTML = `
      <option value="af_bella">Bella (US) - en-US</option>
    `;
  }
}

/**
 * Populate voice dropdown with available voices
 */
function populateVoiceDropdown(): void {
  if (state.voices.length === 0) {
    elements.voiceSelect.innerHTML = '<option value="">No voices available</option>';
    elements.voiceSelect.disabled = true;
    return;
  }

  elements.voiceSelect.innerHTML = state.voices
    .map(voice => `<option value="${voice.id}">${voice.name}</option>`)
    .join('');

  // Set selected voice if it exists in the list
  if (state.voices.some(v => v.id === state.selectedVoice)) {
    elements.voiceSelect.value = state.selectedVoice;
  } else {
    // Default to first voice if saved voice doesn't exist
    state.selectedVoice = state.voices[0].id;
    elements.voiceSelect.value = state.selectedVoice;
  }

  elements.voiceSelect.disabled = false;
}

// =================================================================================
// EVENT HANDLERS
// =================================================================================

/**
 * Handle voice selection change
 */
async function handleVoiceChange(event: Event): Promise<void> {
  const target = event.target as HTMLSelectElement;
  state.selectedVoice = target.value;
  await savePreferences();
}

/**
 * Handle speed slider change
 */
async function handleSpeedChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const speed = parseFloat(target.value);

  state.selectedSpeed = speed;
  elements.speedValue.textContent = `${speed.toFixed(1)}x`;

  // Update ARIA value
  target.setAttribute('aria-valuenow', speed.toString());
  target.setAttribute('aria-valuetext', `${speed.toFixed(1)} times speed`);

  await savePreferences();
}

/**
 * Handle speak button click - main feature
 */
async function handleSpeak(): Promise<void> {
  // Prevent multiple simultaneous generations
  if (state.isGenerating) {
    return;
  }

  // Check if helper is connected
  if (state.helperStatus !== 'connected') {
    showMessage('Helper not connected. Please start the native helper.', 'error');
    return;
  }

  try {
    // Get text to speak
    const text = await getSelectedText();

    if (!text || text.trim().length === 0) {
      showMessage('Please select text on the webpage or enter text to speak.', 'warning');
      return;
    }

    // Validate text length
    if (text.length > 5000) {
      showMessage('Text is too long. Please select less than 5000 characters.', 'warning');
      return;
    }

    // Set loading state
    setLoadingState(true);

    // Generate speech
    const client = getApiClient();
    const audioBlob = await client.speak({
      text: text,
      voice: state.selectedVoice,
      speed: state.selectedSpeed,
    });

    // Stop any currently playing audio
    if (state.currentAudio) {
      state.currentAudio.pause();
      state.currentAudio = null;
    }

    // Play audio
    await playAudio(audioBlob);

    showMessage('Playing audio...', 'success');

  } catch (error) {
    handleSpeakError(error);
  } finally {
    setLoadingState(false);
  }
}

/**
 * Handle settings button click
 */
function handleSettings(): void {
  // Phase 2.6: Open options page
  // For now, show placeholder
  showMessage('Settings page coming in Phase 2.6', 'info');
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboard(event: KeyboardEvent): void {
  // Escape: Close popup (Chrome handles this automatically)
  // Enter: Trigger speak if button is focused
  if (event.key === 'Enter' && document.activeElement === elements.speakButton) {
    handleSpeak();
  }
}

// =================================================================================
// TEXT SELECTION (Phase 2.3 temporary implementation)
// =================================================================================

/**
 * Get selected text from page
 * Phase 2.3: Use prompt for text input (temporary)
 * Phase 2.4: Will get from content script via chrome.tabs.sendMessage
 */
async function getSelectedText(): Promise<string> {
  // TODO Phase 2.4: Get from content script
  // For now, prompt user for text

  return new Promise((resolve) => {
    const text = prompt(
      'Enter text to speak:\n\n(Phase 2.4 will get selected text from webpage automatically)'
    );
    resolve(text || '');
  });
}

// =================================================================================
// AUDIO PLAYBACK
// =================================================================================

/**
 * Play audio from blob
 */
async function playAudio(audioBlob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      state.currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        state.currentAudio = null;
        resolve();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        state.currentAudio = null;
        reject(new Error('Failed to play audio'));
      };

      audio.play().catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

// =================================================================================
// ERROR HANDLING
// =================================================================================

/**
 * Handle errors from speak operation
 */
function handleSpeakError(error: unknown): void {
  console.error('Speak error:', error);

  if (error instanceof HelperNotFoundError) {
    showMessage('Helper not found. Please ensure the native helper is running.', 'error');
  } else if (error instanceof NetworkTimeoutError) {
    showMessage('Request timed out. The helper may be busy or not responding.', 'error');
  } else if (error instanceof InvalidResponseError) {
    showMessage('Invalid response from helper. Please try again.', 'error');
  } else if (error instanceof Error) {
    if (error.message.includes('Text is required')) {
      showMessage('No text provided. Please select text to speak.', 'warning');
    } else if (error.message.includes('Speed must be')) {
      showMessage('Invalid speed value. Please use the slider.', 'error');
    } else {
      showMessage(`Error: ${error.message}`, 'error');
    }
  } else {
    showMessage('An unexpected error occurred. Please try again.', 'error');
  }
}

// =================================================================================
// UI HELPERS
// =================================================================================

/**
 * Show message to user
 */
function showMessage(message: string, type: MessageType = 'info'): void {
  elements.messageContainer.textContent = message;
  elements.messageContainer.className = `message message-${type}`;
  elements.messageContainer.style.display = 'block';

  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      elements.messageContainer.style.display = 'none';
    }, 3000);
  }
}

/**
 * Set loading state for speak button
 */
function setLoadingState(isLoading: boolean): void {
  state.isGenerating = isLoading;
  elements.speakButton.disabled = isLoading;

  if (isLoading) {
    elements.speakButton.classList.add('is-loading');
    elements.buttonText.textContent = 'Generating...';
  } else {
    elements.speakButton.classList.remove('is-loading');
    elements.buttonText.textContent = 'Speak Selected Text';
  }
}

/**
 * Update entire UI based on current state
 */
function updateUI(): void {
  // Update speed display
  elements.speedValue.textContent = `${state.selectedSpeed.toFixed(1)}x`;
  elements.speedSlider.value = state.selectedSpeed.toString();

  // Update button state based on helper status
  if (state.helperStatus !== 'connected') {
    elements.speakButton.disabled = true;
    elements.voiceSelect.disabled = true;
  } else {
    elements.speakButton.disabled = false;
    elements.voiceSelect.disabled = false;
  }
}

// =================================================================================
// PERSISTENCE (chrome.storage)
// =================================================================================

/**
 * Load saved preferences from chrome.storage
 */
async function loadPreferences(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['selectedVoice', 'selectedSpeed']);

    if (result.selectedVoice) {
      state.selectedVoice = result.selectedVoice;
    }

    if (result.selectedSpeed !== undefined) {
      state.selectedSpeed = result.selectedSpeed;
      elements.speedSlider.value = state.selectedSpeed.toString();
      elements.speedValue.textContent = `${state.selectedSpeed.toFixed(1)}x`;
    }
  } catch (error) {
    console.error('Failed to load preferences:', error);
    // Use defaults if loading fails
  }
}

/**
 * Save preferences to chrome.storage
 */
async function savePreferences(): Promise<void> {
  try {
    await chrome.storage.local.set({
      selectedVoice: state.selectedVoice,
      selectedSpeed: state.selectedSpeed,
    });
  } catch (error) {
    console.error('Failed to save preferences:', error);
  }
}

// =================================================================================
// EXPORTS (for testing)
// =================================================================================

// Export functions for testing
if (typeof window !== 'undefined') {
  (window as any).__popupTestHelpers = {
    getState: () => state,
    showMessage,
    checkHelperStatus,
    loadVoices,
  };
}

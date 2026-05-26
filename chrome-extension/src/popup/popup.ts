/**
 * Popup UI for Natural TTS Chrome Extension
 * Handles voice selection, speed control, and speech generation
 */

import { getApiClient, resetApiClient } from '../shared/api-client';
import { Voice, HealthResponse } from '../shared/types';
import { HelperNotFoundError, NetworkTimeoutError, InvalidResponseError } from '../shared/types';
import type { GetSelectedTextMessage, SelectedTextResponse } from '../shared/types';

// =================================================================================
// TYPES & INTERFACES
// =================================================================================

interface PopupState {
  voices: Voice[];
  selectedVoice: string;
  selectedSpeed: number;
  helperStatus: 'connected' | 'disconnected' | 'warming' | 'checking';
  isGenerating: boolean;
  currentAudio: HTMLAudioElement | null;
  warmupPollTimer: ReturnType<typeof setTimeout> | null;
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
  retryButton: document.getElementById('retryButton') as HTMLButtonElement,
  statusLabel: document.getElementById('statusLabel') as HTMLSpanElement,
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
  warmupPollTimer: null,
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
    // Hide retry button when connected
    elements.retryButton.style.display = 'none';
  } else if (state.helperStatus === 'warming') {
    showMessage('Loading TTS model… this can take 30 seconds on first run.', 'info');
    elements.speakButton.disabled = true;
    elements.voiceSelect.innerHTML = '<option value="">Loading TTS model…</option>';
    elements.voiceSelect.disabled = true;
    elements.retryButton.style.display = 'none';
    schedulePollWhileWarming();
  } else {
    showMessage('Native helper not running. Please start the helper and click Retry.', 'error');
    elements.speakButton.disabled = true;
    // Update voice dropdown to show error state
    elements.voiceSelect.innerHTML = '<option value="">Helper not connected - Start helper to load voices</option>';
    elements.voiceSelect.disabled = true;
    // Show retry button when disconnected
    elements.retryButton.style.display = 'block';
  }

  // Update UI to reflect current state
  updateUI();
  const footerVersion = document.getElementById('footerVersion');
  if (footerVersion) footerVersion.textContent = `v${chrome.runtime.getManifest().version}`;
}

/**
 * Poll /health every 2s while the helper reports warming. Stops when the
 * model is ready (transitions UI to connected) or the helper goes away.
 */
function schedulePollWhileWarming(): void {
  if (state.warmupPollTimer) return;
  state.warmupPollTimer = setTimeout(async () => {
    state.warmupPollTimer = null;
    await checkHelperStatus();
    if (state.helperStatus === 'connected') {
      await loadVoices();
      elements.speakButton.disabled = false;
      elements.voiceSelect.disabled = false;
      elements.retryButton.style.display = 'none';
      showMessage('Helper ready.', 'success');
    } else if (state.helperStatus === 'warming') {
      schedulePollWhileWarming();
    } else {
      showMessage('Native helper not running. Please start the helper and click Retry.', 'error');
      elements.retryButton.style.display = 'block';
    }
  }, 2000);
}

/**
 * Set up all event listeners
 */
function setupEventListeners(): void {
  elements.voiceSelect.addEventListener('change', handleVoiceChange);
  elements.speedSlider.addEventListener('input', handleSpeedChange);
  document.querySelectorAll<HTMLButtonElement>('.speed-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseFloat(btn.dataset.delta || '0');
      const next = Math.min(2.0, Math.max(0.5, state.selectedSpeed + delta));
      elements.speedSlider.value = next.toFixed(1);
      elements.speedSlider.dispatchEvent(new Event('input'));
    });
  });
  elements.speakButton.addEventListener('click', handleSpeak);
  elements.settingsButton.addEventListener('click', handleSettings);
  elements.retryButton.addEventListener('click', handleRetryConnection);

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
      // Helper is reachable but the MLX model hasn't finished loading
      // (status === 'warming' OR model_loaded === false). This is distinct
      // from "not running" — surface it as warming so the UI can poll.
      state.helperStatus = 'warming';
      updateStatusIndicator('warming', 'Loading TTS model…');
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

    // Don't re-throw - let initialization continue gracefully
    console.error('Helper connection failed:', error);
  }
}

/**
 * Update status indicator UI
 */
function updateStatusIndicator(status: 'connected' | 'disconnected' | 'checking' | 'warming', tooltip: string): void {
  const labels = {
    checking: 'Checking',
    warming: 'Warming',
    connected: 'Connected',
    disconnected: 'Offline',
  } as const;
  elements.statusIndicator.className = `status-pill status-${status}`;
  elements.statusIndicator.title = tooltip;
  elements.statusIndicator.setAttribute('aria-label', `Helper status: ${labels[status].toLowerCase()}`);
  if (elements.statusLabel) elements.statusLabel.textContent = labels[status];
}

/**
 * Handle retry connection button click
 */
async function handleRetryConnection(): Promise<void> {
  try {
    // Show loading state
    elements.retryButton.disabled = true;
    const span206 = elements.retryButton.querySelector('span');
    if (span206) span206.textContent = 'Connecting...';
    updateStatusIndicator('checking', 'Checking helper status...');

    // Reset API client to force config re-discovery
    resetApiClient();

    // Check helper status
    await checkHelperStatus();

    // If connected, load voices
    if (state.helperStatus === 'connected') {
      await loadVoices();
      showMessage('Successfully connected to helper!', 'success');
      // Hide retry button, enable speak button, enable voice select
      elements.retryButton.style.display = 'none';
      elements.speakButton.disabled = false;
      elements.voiceSelect.disabled = false;
    } else {
      showMessage('Still unable to connect. Ensure the helper is running.', 'error');
      // Keep retry button visible
      const span = elements.retryButton.querySelector('span');
      if (span) span.textContent = 'Retry Connection';
      elements.retryButton.disabled = false;
    }
  } catch (error) {
    console.error('Error during retry:', error);
    showMessage('Failed to retry connection. Check console for details.', 'error');
    const span = elements.retryButton.querySelector('span');
    if (span) span.textContent = 'Retry Connection';
    elements.retryButton.disabled = false;
  }
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
  const groups: Record<string, { label: string; voices: Voice[] }> = {
    af: { label: 'American Female', voices: [] },
    am: { label: 'American Male', voices: [] },
    bf: { label: 'British Female', voices: [] },
    bm: { label: 'British Male', voices: [] },
  };
  const ungrouped: Voice[] = [];
  for (const voice of state.voices) {
    const prefix = voice.id.slice(0, 2);
    if (prefix in groups) groups[prefix].voices.push(voice);
    else ungrouped.push(voice);
  }
  const groupHtml = Object.values(groups)
    .filter(g => g.voices.length > 0)
    .map(g => `<optgroup label="${g.label}">${g.voices.map(v => `<option value="${v.id}" aria-label="${g.label}: ${v.name}">${v.name}</option>`).join('')}</optgroup>`)
    .join('');
  const ungroupedHtml = ungrouped.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  elements.voiceSelect.innerHTML = groupHtml + ungroupedHtml;
  if (state.voices.some(v => v.id === state.selectedVoice)) {
    elements.voiceSelect.value = state.selectedVoice;
  } else {
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
  const pct = ((speed - 0.5) / 1.5) * 100;
  target.style.setProperty('--fill', `${pct}%`);
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
  if (state.currentAudio && !state.currentAudio.paused) {
    state.currentAudio.pause();
    state.currentAudio = null;
    setPlayingState(false);
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
    setPlayingState(true);
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
  console.log('[Popup] Opening options page');
  chrome.runtime.openOptionsPage();
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
 * Get selected text from page via content script
 * Phase 2.4: Get from content script via chrome.tabs.sendMessage
 */
async function getSelectedText(): Promise<string> {
  try {
    // Use lastFocusedWindow so this works when the popup is detached (DevTools
    // open, separate window). currentWindow would resolve to the popup's own
    // window in that case and return no usable tab. lastFocusedWindow tracks
    // the most recently focused normal Chrome window — the page behind.
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    if (!tab || !tab.id) {
      console.error('[Popup] No active tab found');
      showMessage('No active tab found. Please try again.', 'error');
      return '';
    }

    // Send message to content script
    const message: GetSelectedTextMessage = {
      type: 'GET_SELECTED_TEXT',
    };

    const response = await chrome.tabs.sendMessage(tab.id, message) as SelectedTextResponse;

    // Handle response
    if (response.success && response.text) {
      console.log('[Popup] Got selected text:', {
        length: response.text.length,
        preview: response.text.substring(0, 50),
      });
      return response.text;
    } else {
      console.error('[Popup] Failed to get selected text:', response.error);
      showMessage(response.error || 'Failed to get selected text', 'warning');
      return '';
    }

  } catch (error) {
    console.error('[Popup] Error communicating with content script:', error);
    showMessage(
      'Could not access page content. Please refresh the page and try again.',
      'error'
    );
    return '';
  }
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
        setPlayingState(false);
        state.currentAudio = null;
        resolve();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setPlayingState(false);
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
  if (type === 'error' || type === 'warning') {
    elements.messageContainer.setAttribute('role', 'alert');
    elements.messageContainer.setAttribute('aria-live', 'assertive');
  } else {
    elements.messageContainer.setAttribute('role', 'status');
    elements.messageContainer.setAttribute('aria-live', 'polite');
  }
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

function setPlayingState(isPlaying: boolean): void {
  if (isPlaying) {
    elements.speakButton.classList.add('is-playing');
    elements.buttonText.textContent = 'Stop';
  } else {
    elements.speakButton.classList.remove('is-playing');
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
  const initPct = ((state.selectedSpeed - 0.5) / 1.5) * 100;
  elements.speedSlider.style.setProperty('--fill', `${initPct}%`);

  // Speak only enabled when fully connected (warming/disconnected both disable)
  if (state.helperStatus === 'connected') {
    elements.speakButton.disabled = false;
    elements.voiceSelect.disabled = false;
  } else {
    elements.speakButton.disabled = true;
    elements.voiceSelect.disabled = true;
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
      const loadPct = ((state.selectedSpeed - 0.5) / 1.5) * 100;
      elements.speedSlider.style.setProperty('--fill', `${loadPct}%`);
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

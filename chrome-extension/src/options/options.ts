/**
 * Options Page (Phase 2.6)
 *
 * Handles user preferences and settings configuration
 */

import { getApiClient } from '../shared/api-client';
import {
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  VOICE_NAMES,
  type ExtensionSettings,
} from '../shared/settings-defaults';

/**
 * DOM elements
 */
const elements = {
  // Form controls
  voiceSelect: document.getElementById('voiceSelect') as HTMLSelectElement,
  speedSlider: document.getElementById('speedSlider') as HTMLInputElement,
  speedValue: document.getElementById('speedValue') as HTMLSpanElement,
  autoPlayCheckbox: document.getElementById('autoPlayCheckbox') as HTMLInputElement,
  helperAutoRetryCheckbox: document.getElementById('helperAutoRetryCheckbox') as HTMLInputElement,

  // Action buttons
  saveButton: document.getElementById('saveButton') as HTMLButtonElement,
  resetButton: document.getElementById('resetButton') as HTMLButtonElement,

  // Status elements
  statusIndicator: document.getElementById('statusIndicator') as HTMLDivElement,
  statusText: document.getElementById('statusText') as HTMLSpanElement,
  helperStatusText: document.getElementById('helperStatusText') as HTMLSpanElement,
  versionText: document.getElementById('versionText') as HTMLSpanElement,

  // Message container
  messageContainer: document.getElementById('messageContainer') as HTMLDivElement,
};

/**
 * Current settings state
 */
let currentSettings: ExtensionSettings;

/**
 * Initialize options page
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Options] Page loaded');

  try {
    // Set up event listeners
    setupEventListeners();

    // Load and display current settings
    await loadAndDisplaySettings();

    // Check helper status
    await checkHelperStatus();

    // Get and display version
    const manifest = chrome.runtime.getManifest();
    elements.versionText.textContent = manifest.version;

  } catch (error) {
    console.error('[Options] Initialization error:', error);
    showMessage('Failed to initialize settings page', 'error');
  }
});

/**
 * Set up event listeners
 */
function setupEventListeners(): void {
  // Speed slider
  elements.speedSlider.addEventListener('input', handleSpeedChange);

  // Save button
  elements.saveButton.addEventListener('click', handleSave);

  // Reset button
  elements.resetButton.addEventListener('click', handleReset);

  // Listen for storage changes from other contexts
  chrome.storage.onChanged.addListener((changes) => {
    console.log('[Options] Storage changed from another context:', changes);
    // Reload settings if changed elsewhere
    loadAndDisplaySettings();
  });
}

/**
 * Load and display current settings
 */
async function loadAndDisplaySettings(): Promise<void> {
  try {
    currentSettings = await loadSettings();

    // Populate voice dropdown
    await populateVoiceDropdown();

    // Set voice
    elements.voiceSelect.value = currentSettings.selectedVoice;

    // Set speed
    elements.speedSlider.value = currentSettings.selectedSpeed.toString();
    updateSpeedDisplay(currentSettings.selectedSpeed);

    // Set checkboxes
    elements.autoPlayCheckbox.checked = currentSettings.autoPlay;
    elements.helperAutoRetryCheckbox.checked = currentSettings.helperAutoRetry;

    console.log('[Options] Settings loaded:', currentSettings);
  } catch (error) {
    console.error('[Options] Error loading settings:', error);
    showMessage('Failed to load settings', 'error');
  }
}

/**
 * Populate voice dropdown with available voices
 */
async function populateVoiceDropdown(): Promise<void> {
  try {
    const apiClient = getApiClient();
    const voices = await apiClient.getVoices();

    if (voices.length === 0) {
      throw new Error('No voices available');
    }

    // Clear existing options
    elements.voiceSelect.innerHTML = '';

    // Add voice options
    voices.forEach((voice) => {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = VOICE_NAMES[voice.id] || voice.name;
      elements.voiceSelect.appendChild(option);
    });

    elements.voiceSelect.disabled = false;
  } catch (error) {
    console.error('[Options] Error loading voices:', error);
    // Fallback to showing all known voices
    elements.voiceSelect.innerHTML = '';
    Object.entries(VOICE_NAMES).forEach(([id, name]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      elements.voiceSelect.appendChild(option);
    });
  }
}

/**
 * Handle speed slider change
 */
function handleSpeedChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const speed = parseFloat(target.value);
  updateSpeedDisplay(speed);
}

/**
 * Update speed display value
 */
function updateSpeedDisplay(speed: number): void {
  elements.speedValue.textContent = `${speed.toFixed(1)}x`;
  elements.speedSlider.setAttribute('aria-valuenow', speed.toString());
  elements.speedSlider.setAttribute('aria-valuetext', `${speed.toFixed(1)} times speed`);
}

/**
 * Handle save button click
 */
async function handleSave(): Promise<void> {
  try {
    elements.saveButton.disabled = true;
    elements.saveButton.textContent = 'Saving...';

    // Gather settings from form
    const newSettings: ExtensionSettings = {
      selectedVoice: elements.voiceSelect.value,
      selectedSpeed: parseFloat(elements.speedSlider.value),
      autoPlay: elements.autoPlayCheckbox.checked,
      helperAutoRetry: elements.helperAutoRetryCheckbox.checked,
    };

    // Save to storage
    await saveSettings(newSettings);
    currentSettings = newSettings;

    console.log('[Options] Settings saved:', newSettings);
    showMessage('Settings saved successfully!', 'success');

  } catch (error) {
    console.error('[Options] Error saving settings:', error);
    showMessage('Failed to save settings', 'error');
  } finally {
    elements.saveButton.disabled = false;
    elements.saveButton.textContent = 'Save Settings';
  }
}

/**
 * Handle reset button click
 */
async function handleReset(): Promise<void> {
  // Confirm reset
  const confirmed = confirm('Reset all settings to defaults? This cannot be undone.');
  if (!confirmed) {
    return;
  }

  try {
    elements.resetButton.disabled = true;
    elements.resetButton.textContent = 'Resetting...';

    // Save default settings
    await saveSettings(DEFAULT_SETTINGS);
    currentSettings = { ...DEFAULT_SETTINGS };

    // Update UI
    await loadAndDisplaySettings();

    console.log('[Options] Settings reset to defaults');
    showMessage('Settings reset to defaults', 'success');

  } catch (error) {
    console.error('[Options] Error resetting settings:', error);
    showMessage('Failed to reset settings', 'error');
  } finally {
    elements.resetButton.disabled = false;
    elements.resetButton.textContent = 'Reset to Defaults';
  }
}

/**
 * Check helper status
 */
async function checkHelperStatus(): Promise<void> {
  try {
    updateStatusIndicator('checking', 'Checking helper...');

    const apiClient = getApiClient();
    const health = await apiClient.checkHealth();

    if (health.status === 'ok' && health.model_loaded) {
      updateStatusIndicator('connected', `Helper running (${health.model})`);
      elements.helperStatusText.textContent = `Connected (${health.model})`;
      elements.helperStatusText.className = 'helper-status helper-status-connected';
    } else {
      updateStatusIndicator('disconnected', 'Helper model not loaded');
      elements.helperStatusText.textContent = 'Model not loaded';
      elements.helperStatusText.className = 'helper-status helper-status-warning';
    }
  } catch (error) {
    updateStatusIndicator('disconnected', 'Helper not found');
    elements.helperStatusText.textContent = 'Not connected';
    elements.helperStatusText.className = 'helper-status helper-status-error';
    console.error('[Options] Helper connection failed:', error);
  }
}

/**
 * Update status indicator
 */
function updateStatusIndicator(status: 'checking' | 'connected' | 'disconnected', message: string): void {
  elements.statusIndicator.className = `status-dot status-${status}`;
  elements.statusIndicator.title = message;
  elements.statusText.textContent = message;
}

/**
 * Show message to user
 */
function showMessage(message: string, type: 'success' | 'error' | 'info' | 'warning'): void {
  elements.messageContainer.textContent = message;
  elements.messageContainer.className = `message message-${type}`;
  elements.messageContainer.style.display = 'block';

  // Auto-hide success messages
  if (type === 'success') {
    setTimeout(() => {
      elements.messageContainer.style.display = 'none';
    }, 3000);
  }
}

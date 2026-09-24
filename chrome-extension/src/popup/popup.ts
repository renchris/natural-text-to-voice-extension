/**
 * Popup UI for Natural TTS Chrome Extension
 * Handles voice selection, speed control, and speech generation
 */

import { getApiClient, resetApiClient, userMessageForError } from '../shared/api-client';
import { Voice, HealthResponse } from '../shared/types';
import { HelperNotFoundError, NetworkTimeoutError } from '../shared/types';
import { readSelection } from '../shared/selection';
import type {
  OffscreenMessage,
  OffscreenSpeakResponse,
  OffscreenStatusQuery,
  OffscreenStatusResponse,
  SpeakWithSystemVoiceMessage,
  StopInOffscreenMessage,
  SystemVoiceStatusQuery,
  SystemVoiceStatusResponse,
} from '../shared/types';
import { renderShortcutChip } from './shortcut-chip';
import { DEFAULT_VOICE, resolveVoice, voiceLabel } from '../shared/voices';
import { buildVoiceOptionNodes } from '../shared/voice-options';
import { clearErrorBadge } from '../shared/error-badge';
import { errorSummary } from '../shared/helper-errors';
import { HELPER_INSTALL_COMMAND, helperNeedsUpdate, helperUpdate, type HelperUpdate } from '../shared/helper-version';
import { ENGINE_STOPPED_STATUS, WARMING_STATUS, helperHealthState } from '../shared/helper-status';
import {
  DEFAULT_HELPER_UNAVAILABLE_ACTION,
  HELPER_SETUP_NOTICE,
  HELPER_SETUP_URL,
  HELPER_SOURCE_LINK_TEXT,
  SYSTEM_VOICE_FAILED_MESSAGE,
  engineLabel,
  isHelperUnavailableAction,
  shouldUseSystemVoice,
  type HelperUnavailableAction,
  type SpeechEngine,
} from '../shared/system-voice';

// =================================================================================
// TYPES & INTERFACES
// =================================================================================

interface PopupState {
  voices: Voice[];
  selectedVoice: string;
  selectedSpeed: number;
  helperStatus: 'connected' | 'disconnected' | 'warming' | 'checking';
  /** The helper answers but its voice engine died and will not come back (/health status "error"). */
  engineFailed: boolean;
  /**
   * The last probe found no helper at all (HelperNotFoundError), as opposed to
   * one that timed out or answered garbage: only then does Speak fall back.
   */
  helperUnreachable: boolean;
  isGenerating: boolean;
  currentAudio: HTMLAudioElement | null;
  /** The offscreen document is speaking a right-click or shortcut request; the button stops it. */
  offscreenSpeaking: boolean;
  /** Which engine the offscreen-or-system speech uses, while offscreenSpeaking */
  speakingEngine: SpeechEngine | null;
  /** "When the helper isn't running" (OD-2), from the options */
  whenHelperUnavailable: HelperUnavailableAction;
  warmupPollTimer: ReturnType<typeof setTimeout> | null;
}

type MessageType = 'success' | 'error' | 'warning' | 'info';

const PLAYING_MESSAGE = 'Playing audio…';
const OFFSCREEN_PLAYING_MESSAGE = 'Speaking your selection…';
const NOT_RUNNING_MESSAGE = 'Native helper not running. Please start the helper and click Retry.';
const ENGINE_FAILED_MESSAGE = 'The helper’s voice engine stopped. Restart the helper, then click Retry.';
const disconnectedMessage = (): string => (state.engineFailed ? ENGINE_FAILED_MESSAGE : NOT_RUNNING_MESSAGE);
const FALLBACK_NOT_RUNNING_MESSAGE = 'The helper isn’t running, so a system voice will read your selection.';
const FALLBACK_ENGINE_FAILED_MESSAGE =
  'The helper’s voice engine stopped, so a system voice will read your selection. Restart the helper and click Retry for Kokoro voices.';
const fallbackMessage = (): string => (state.engineFailed ? FALLBACK_ENGINE_FAILED_MESSAGE : FALLBACK_NOT_RUNNING_MESSAGE);

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
  updateNotice: document.getElementById('helperUpdateNotice') as HTMLParagraphElement | null,
  updateText: document.getElementById('helperUpdateText') as HTMLElement | null,
  updateCommand: document.getElementById('helperUpdateCommand') as HTMLElement | null,
  updateSourceLink: document.getElementById('helperUpdateSourceLink') as HTMLAnchorElement | null,
  installCommand: document.getElementById('helperInstallCommand') as HTMLElement | null,
  fallbackNoticeText: document.getElementById('fallbackNoticeText') as HTMLElement | null,
  engineStatus: document.getElementById('engineStatus') as HTMLParagraphElement | null,
  fallbackNotice: document.getElementById('fallbackNotice') as HTMLParagraphElement | null,
  fallbackNoticeLink: document.getElementById('fallbackNoticeLink') as HTMLAnchorElement | null,
};

// =================================================================================
// STATE MANAGEMENT
// =================================================================================

const state: PopupState = {
  voices: [],
  selectedVoice: DEFAULT_VOICE,
  selectedSpeed: 1.0,
  helperStatus: 'checking',
  engineFailed: false,
  helperUnreachable: false,
  isGenerating: false,
  currentAudio: null,
  offscreenSpeaking: false,
  speakingEngine: null,
  whenHelperUnavailable: DEFAULT_HELPER_UNAVAILABLE_ACTION,
  warmupPollTimer: null,
};

/**
 * The helper cannot be reached (or its engine stopped) and the user wants
 * system voices then: the popup still speaks, through the service worker's
 * chrome.tts (OD-2). These are exactly the failures handleSpeak falls back on
 * (isHelperUnavailable); a helper that timed out or answered garbage keeps the
 * error state and Retry, as Speak would report the same error.
 */
function onFallback(): boolean {
  return (
    state.helperStatus === 'disconnected' &&
    (state.helperUnreachable || state.engineFailed) &&
    state.whenHelperUnavailable === 'system-voice'
  );
}

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
    enterWarmingState();
  } else if (onFallback()) {
    enterFallbackState();
  } else {
    showMessage(disconnectedMessage(), 'error');
    elements.speakButton.disabled = true;
    // Update voice dropdown to show error state
    setPlaceholderOption('Helper not connected - Start helper to load voices');
    elements.voiceSelect.disabled = true;
    // Show retry button when disconnected
    elements.retryButton.style.display = 'flex';
  }

  // Update UI to reflect current state
  updateUI();
  await syncOffscreenSpeaking();
  const footerVersion = document.getElementById('footerVersion');
  if (footerVersion) footerVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  const shortcutChip = document.getElementById('shortcutChip');
  if (shortcutChip) await renderShortcutChip(shortcutChip);
}

/**
 * The helper answers but its model is (re)loading: say so, keep the controls
 * off, and poll until it is ready. Used on open and by Retry (the helper
 * reports warming while it restarts a worker).
 */
function enterWarmingState(): void {
  showMessage('Loading TTS model… this can take 30 seconds on first run.', 'info');
  elements.speakButton.disabled = true;
  setPlaceholderOption('Loading TTS model…');
  elements.voiceSelect.disabled = true;
  elements.retryButton.style.display = 'none';
  schedulePollWhileWarming();
}

/**
 * The helper is unreachable and system voices are allowed: say so without an
 * error, keep Speak working (a system voice reads the selection), and offer
 * Retry and the setup link for the Kokoro voices.
 */
function enterFallbackState(): void {
  showMessage(fallbackMessage(), 'info');
  elements.speakButton.disabled = false;
  setPlaceholderOption('System voice (Kokoro voices need the helper)');
  elements.voiceSelect.disabled = true;
  elements.retryButton.style.display = 'flex';
  refreshFallbackNotice();
}

/**
 * Show a shell command so a narrow popup wraps it only after an "&&", never
 * inside a word or between the two "&": each command is its own no-wrap part.
 * The text (and so a copy of it) stays exactly the command.
 */
function renderCommand(el: HTMLElement, command: string): void {
  const parts = command.split(' && ');
  el.replaceChildren();
  parts.forEach((part, i) => {
    if (i > 0) el.append(' ');
    const span = document.createElement('span');
    span.className = 'command-part';
    span.textContent = i < parts.length - 1 ? `${part} &&` : part;
    el.append(span);
  });
}

/**
 * Show the one-line "Install the free Natural TTS helper" notice while speech
 * falls back to the system voice, or would. Not when the helper is installed
 * and only its engine stopped: the message says to restart it instead.
 */
function refreshFallbackNotice(): void {
  if (!elements.fallbackNotice) return;
  if (elements.fallbackNoticeText) elements.fallbackNoticeText.textContent = HELPER_SETUP_NOTICE;
  if (elements.installCommand) renderCommand(elements.installCommand, HELPER_INSTALL_COMMAND);
  if (elements.fallbackNoticeLink) {
    elements.fallbackNoticeLink.href = HELPER_SETUP_URL;
    elements.fallbackNoticeLink.textContent = HELPER_SOURCE_LINK_TEXT;
  }
  elements.fallbackNotice.hidden = state.engineFailed || !(onFallback() || state.speakingEngine === 'system');
}

/** Show which engine is speaking ("Kokoro · Bella (US)", "System voice"), or nothing. */
function showEngine(label: string | null): void {
  if (!elements.engineStatus) return;
  elements.engineStatus.textContent = label ?? '';
  elements.engineStatus.hidden = !label;
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
    } else if (onFallback()) {
      enterFallbackState();
    } else {
      showMessage(disconnectedMessage(), 'error');
      elements.speakButton.disabled = true;
      elements.voiceSelect.disabled = true;
      elements.retryButton.style.display = 'flex';
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
      // Convert speed to slider POSITION (0..1) so the log-scaled slider sets
      // the thumb at the right place. handleSpeedChange will re-snap.
      elements.speedSlider.value = speedToPosition(next).toString();
      elements.speedSlider.dispatchEvent(new Event('input'));
    });
  });
  elements.speakButton.addEventListener('click', handleSpeak);
  elements.settingsButton.addEventListener('click', handleSettings);
  elements.retryButton.addEventListener('click', handleRetryConnection);
  // No keydown handler: a focused native <button> already turns Enter and
  // Space into a click, and a second handler made Enter speak twice.

  // The stop-speaking command broadcasts STOP_IN_OFFSCREEN to every extension
  // page; stop the popup's own playback too. Never responds, so the offscreen
  // document's reply is the one the service worker receives.
  chrome.runtime.onMessage.addListener((message: OffscreenMessage) => {
    if (message?.type === 'STOP_IN_OFFSCREEN') {
      stopPopupAudio();
    } else if (message?.type === 'OFFSCREEN_ACTIVITY') {
      showOffscreenSpeaking(message.speaking, message.engine ?? 'kokoro', message.voice);
    }
    return false;
  });
}

// =================================================================================
// HELPER STATUS
// =================================================================================

/**
 * Check if native helper is running and responsive
 */
async function checkHelperStatus(): Promise<void> {
  await loadHelperUnavailableAction();
  try {
    await probeHelper();
  } finally {
    refreshFallbackNotice();
  }
}

async function probeHelper(): Promise<void> {
  const client = getApiClient();

  try {
    const health: HealthResponse = await client.checkHealth();

    // An older helper still works (with the voices it reports); say how to update it.
    showUpdateNotice(helperNeedsUpdate(health) ? helperUpdate(health) : null);
    const healthState = helperHealthState(health);
    state.engineFailed = healthState === 'engine-stopped';
    state.helperUnreachable = false;

    if (healthState === 'ready') {
      state.helperStatus = 'connected';
      updateStatusIndicator('connected', `Helper is running (${health.model})`);
    } else if (healthState === 'engine-stopped') {
      // The worker died repeatedly and the helper gave up restarting it: not
      // "warming", which would poll forever.
      state.helperStatus = 'disconnected';
      updateStatusIndicator('disconnected', ENGINE_STOPPED_STATUS);
    } else {
      // Helper is reachable but the MLX model hasn't finished loading
      // (status === 'warming' OR model_loaded === false). This is distinct
      // from "not running" — surface it as warming so the UI can poll.
      state.helperStatus = 'warming';
      updateStatusIndicator('warming', WARMING_STATUS);
    }
  } catch (error) {
    state.helperStatus = 'disconnected';
    state.engineFailed = false;
    state.helperUnreachable = error instanceof HelperNotFoundError;
    showUpdateNotice(null);

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
 * Show the one-line "Update the Natural TTS helper" notice with the command
 * for how that helper was installed, or hide it (null).
 */
function showUpdateNotice(update: HelperUpdate | null): void {
  if (!elements.updateNotice) return;
  if (update) {
    if (elements.updateText) {
      elements.updateText.textContent = update.fromSource
        ? 'Update the Natural TTS helper. In your source checkout, run:'
        : 'Update the Natural TTS helper:';
    }
    if (elements.updateCommand) renderCommand(elements.updateCommand, update.command);
    if (elements.updateSourceLink) {
      elements.updateSourceLink.href = update.url;
      elements.updateSourceLink.textContent = update.fromSource ? 'How to update' : 'Installed from source?';
    }
  }
  elements.updateNotice.hidden = !update;
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
  const label = elements.retryButton.querySelector('span');
  try {
    // Show loading state
    elements.retryButton.disabled = true;
    if (label) label.textContent = 'Connecting...';
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
    } else if (state.helperStatus === 'warming') {
      // Reachable, still loading: not an error, and it must not stay stuck.
      enterWarmingState();
    } else if (onFallback()) {
      enterFallbackState();
    } else {
      showMessage(state.engineFailed ? ENGINE_FAILED_MESSAGE : 'Still unable to connect. Ensure the helper is running.', 'error');
      elements.speakButton.disabled = true;
      elements.voiceSelect.disabled = true;
    }
  } catch (error) {
    console.error('Error during retry:', error);
    showMessage('Failed to retry connection. Check console for details.', 'error');
  } finally {
    // Always restore the button, including after a successful retry: it is
    // hidden then, but if the helper later goes away it is shown again and
    // must still work.
    if (label) label.textContent = 'Retry Connection';
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
    setPlaceholderOption(voiceLabel(DEFAULT_VOICE), DEFAULT_VOICE);
  }
}

/**
 * Replace the voice list with a single option. Built with textContent, never
 * innerHTML: labels can come from the helper.
 */
function setPlaceholderOption(label: string, value = ''): void {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  elements.voiceSelect.replaceChildren(option);
}

/**
 * Populate the voice dropdown with the catalogue voices the helper reports,
 * grouped by accent and gender (native optgroups), labelled from the
 * catalogue. Older helpers report fewer voices; only those are offered.
 */
function populateVoiceDropdown(): void {
  const offered = state.voices.map(v => v.id);
  const nodes = buildVoiceOptionNodes(offered);
  if (nodes.length === 0) {
    setPlaceholderOption('No voices available');
    elements.voiceSelect.disabled = true;
    return;
  }
  elements.voiceSelect.replaceChildren(...nodes);
  state.selectedVoice = resolveVoice(state.selectedVoice, offered);
  elements.voiceSelect.value = state.selectedVoice;
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
 * Speed slider uses a LOGARITHMIC scale so 1.0x sits at the visual midpoint.
 *   speed = 2^(2·pos − 1)         pos = 0 → 0.5x, pos = 0.5 → 1.0x, pos = 1 → 2.0x
 *   pos   = (log2(speed) + 1) / 2
 * 0.5x and 2.0x are each one octave from 1.0x, so they're equidistant on the
 * track — which matches the user's "half-speed / normal / double-speed" mental
 * model. A linear 0.5–2.0 scale puts 1.0x at 33.3% which feels wrong.
 */
function positionToSpeed(pos: number): number {
  return Math.pow(2, 2 * pos - 1);
}
function speedToPosition(speed: number): number {
  return (Math.log2(speed) + 1) / 2;
}

/**
 * Handle speed slider change
 */
async function handleSpeedChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const rawPos = parseFloat(target.value);
  const rawSpeed = positionToSpeed(rawPos);
  // Snap to 0.1x increments for predictable display and storage.
  const speed = Math.round(rawSpeed * 10) / 10;
  state.selectedSpeed = speed;
  // Snap thumb position to the exact place that matches the rounded speed.
  const snappedPos = speedToPosition(speed);
  if (Math.abs(rawPos - snappedPos) > 0.001) {
    target.value = snappedPos.toString();
  }
  elements.speedValue.textContent = `${speed.toFixed(1)}x`;
  target.style.setProperty('--fill', `${snappedPos * 100}%`);
  target.setAttribute('aria-valuenow', speed.toString());
  target.setAttribute('aria-valuetext', `${speed.toFixed(1)} times speed`);
  await savePreferences();
}

/**
 * Handle speak button click - main feature
 */
async function handleSpeak(): Promise<void> {
  // While audio plays the button is "Stop".
  if (state.currentAudio) {
    stopPopupAudio();
    return;
  }

  // Right-click / shortcut speech is playing: the button stops it. This is
  // the one Stop a default install has (stop-speaking ships without a key).
  if (state.offscreenSpeaking) {
    const stop: StopInOffscreenMessage = { type: 'STOP_IN_OFFSCREEN' };
    chrome.runtime.sendMessage(stop).catch(() => {});
    showOffscreenSpeaking(false, state.speakingEngine ?? 'kokoro');
    return;
  }

  // One request at a time. The guard is set synchronously below, before the
  // first await, so a second click (or Enter) cannot slip in.
  if (state.isGenerating) {
    return;
  }

  // Check if helper is connected (or the system voice may stand in for it)
  if (state.helperStatus !== 'connected' && !onFallback()) {
    showMessage('Helper not connected. Please start the native helper.', 'error');
    return;
  }

  setLoadingState(true);

  try {
    // Get text to speak
    const text = await getSelectedText();

    if (!text || text.trim().length === 0) {
      showMessage('Select some text on the page first.', 'warning');
      return;
    }

    // Validate text length
    if (text.length > 5000) {
      showMessage('Text is too long. Please select less than 5000 characters.', 'warning');
      return;
    }

    // Generate speech. The helper is tried even in the fallback state: it
    // may have started since the popup opened.
    const client = getApiClient();
    let audioBlob: Blob;
    try {
      audioBlob = await client.speak({
        text: text,
        voice: state.selectedVoice,
        speed: state.selectedSpeed,
      });
    } catch (error) {
      await loadHelperUnavailableAction();
      if (!shouldUseSystemVoice(error, state.whenHelperUnavailable)) throw error;
      await speakWithSystemVoice(text);
      return;
    }

    // The audio is here: leave the loading state and make the button a
    // working Stop for as long as it plays.
    setLoadingState(false);
    setPlayingState(true);
    showMessage(PLAYING_MESSAGE, 'info');

    // Resolves once playback has started; onended resets the state.
    await playAudio(audioBlob);
    showEngine(engineLabel('kokoro', state.selectedVoice));

    // Speech works again: drop any error badge a right-click left behind.
    void clearErrorBadge();

  } catch (error) {
    handleSpeakError(error);
  } finally {
    if (state.isGenerating) {
      setLoadingState(false);
    }
  }
}

/**
 * The helper is unreachable: have the service worker speak the text with the
 * system voice (one engine, one place: the popup does not drive chrome.tts
 * itself). The popup then shows Stop and "System voice" until the worker
 * broadcasts that the speech ended.
 */
async function speakWithSystemVoice(text: string): Promise<void> {
  if (state.helperStatus !== 'disconnected') {
    // It was up when the popup opened and is gone now.
    state.helperStatus = 'disconnected';
    state.engineFailed = false;
    state.helperUnreachable = true;
    showUpdateNotice(null);
    updateStatusIndicator('disconnected', 'Helper not found - speaking with a system voice');
    elements.retryButton.style.display = 'flex';
    setPlaceholderOption('System voice (Kokoro voices need the helper)');
    elements.voiceSelect.disabled = true;
  }
  refreshFallbackNotice();

  const request: SpeakWithSystemVoiceMessage = {
    type: 'SPEAK_WITH_SYSTEM_VOICE',
    text,
    voice: state.selectedVoice,
    speed: state.selectedSpeed,
  };
  let reply: OffscreenSpeakResponse | undefined;
  try {
    reply = await chrome.runtime.sendMessage(request) as OffscreenSpeakResponse | undefined;
  } catch (error) {
    console.error('[Popup] System voice request failed:', errorSummary(error));
  }

  setLoadingState(false);
  if (reply?.type === 'SPEAK_STARTED') {
    showOffscreenSpeaking(true, 'system');
  } else if (reply?.success) {
    // Finished (or was stopped) before the reply arrived: nothing to show.
    showMessage(fallbackMessage(), 'info');
  } else {
    showMessage(SYSTEM_VOICE_FAILED_MESSAGE, 'error');
  }
}

/**
 * Handle settings button click
 */
function handleSettings(): void {
  console.log('[Popup] Opening options page');
  chrome.runtime.openOptionsPage();
}

// =================================================================================
// TEXT SELECTION
// =================================================================================

/**
 * Get the selected text in the active tab, read on demand via
 * chrome.scripting (activeTab + scripting; no content script).
 */
async function getSelectedText(): Promise<string> {
  try {
    // Robust tab resolution for both normal popup AND detached popup
    // (DevTools-attached). lastFocusedWindow can resolve to the popup's own
    // window if the popup itself was focused last (e.g., user dragged it,
    // multi-monitor focus), so we explicitly request normal windows via
    // chrome.windows.getLastFocused first and fall back to tabs.query.
    let tab: chrome.tabs.Tab | undefined;
    try {
      const win = await chrome.windows.getLastFocused({
        windowTypes: ['normal'],
        populate: true,
      });
      tab = win.tabs?.find(t => t.active);
    } catch {
      // Fall through to tabs.query
    }
    if (!tab || !tab.id) {
      const queried = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tab = queried[0];
    }

    if (!tab || !tab.id) {
      console.error('[Popup] No active tab found');
      showMessage('No active tab found. Please try again.', 'error');
      return '';
    }

    // Opening the popup granted activeTab on this tab, so read the selection
    // directly. No content script is involved, so tabs opened before install
    // work without a reload. Restricted pages (chrome://, the Web Store) and
    // the PDF viewer return '' — the context menu is the PDF path.
    return (await readSelection(tab.id)).trim();

  } catch (error) {
    console.error('[Popup] Error finding the active tab:', error);
    showMessage('Could not read the selection on this page.', 'error');
    return '';
  }
}

// =================================================================================
// AUDIO PLAYBACK
// =================================================================================

/**
 * Play audio from blob. Resolves as soon as playback has started (so the
 * caller is not held for the length of the speech); ending, failing or being
 * stopped resets the popup through finishPlayback().
 */
async function playAudio(audioBlob: Blob): Promise<void> {
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  state.currentAudio = audio;

  const finishPlayback = (): void => {
    URL.revokeObjectURL(audioUrl);
    if (state.currentAudio === audio) {
      state.currentAudio = null;
      setPlayingState(false);
      hideMessageIf(PLAYING_MESSAGE);
      showEngine(null);
    }
  };

  audio.onended = finishPlayback;
  audio.onerror = () => {
    finishPlayback();
    showMessage('Failed to play audio', 'error');
  };

  try {
    await audio.play();
  } catch (error) {
    finishPlayback();
    throw error;
  }
}

/**
 * Ask the offscreen document whether it is speaking (no document, no answer:
 * nothing is).
 */
async function syncOffscreenSpeaking(): Promise<void> {
  try {
    const query: OffscreenStatusQuery = { type: 'OFFSCREEN_STATUS_QUERY' };
    const reply = await chrome.runtime.sendMessage(query) as OffscreenStatusResponse | undefined;
    if (reply?.type === 'OFFSCREEN_STATUS' && reply.speaking) {
      showOffscreenSpeaking(true, 'kokoro', reply.voice);
      return;
    }
  } catch {
    // No offscreen document: Kokoro is not speaking.
  }
  // The system voice (OD-2 fallback) is spoken by the service worker.
  try {
    const query: SystemVoiceStatusQuery = { type: 'SYSTEM_VOICE_STATUS_QUERY' };
    const reply = await chrome.runtime.sendMessage(query) as SystemVoiceStatusResponse | undefined;
    if (reply?.type === 'SYSTEM_VOICE_STATUS' && reply.speaking) showOffscreenSpeaking(true, 'system');
  } catch {
    // No service worker answer: nothing is speaking.
  }
}

/**
 * Show (or drop) the Stop button for speech the popup does not play itself:
 * Kokoro speech in the offscreen document, or the system voice spoken by the
 * service worker. Never while the popup plays its own audio. An end reported
 * by the other engine is ignored (the offscreen document reports a failed
 * Kokoro attempt ending just as the system voice takes over).
 */
function showOffscreenSpeaking(speaking: boolean, engine: SpeechEngine = 'kokoro', voice?: string): void {
  if (speaking) {
    if (state.currentAudio || state.isGenerating) return;
    state.offscreenSpeaking = true;
    state.speakingEngine = engine;
    setPlayingState(true);
    elements.speakButton.disabled = false;
    showMessage(OFFSCREEN_PLAYING_MESSAGE, 'info');
    showEngine(engineLabel(engine, voice));
    refreshFallbackNotice();
  } else if (state.offscreenSpeaking && (state.speakingEngine === null || state.speakingEngine === engine)) {
    state.offscreenSpeaking = false;
    state.speakingEngine = null;
    setPlayingState(false);
    hideMessageIf(OFFSCREEN_PLAYING_MESSAGE);
    showEngine(null);
    updateUI();
    refreshFallbackNotice();
  }
}

/**
 * Stop the popup's own playback and settle its pending playAudio() promise
 * through the normal end-of-playback path (revoke URL, reset state).
 * Returns false when nothing was playing.
 */
function stopPopupAudio(): boolean {
  const audio = state.currentAudio;
  if (!audio) {
    return false;
  }
  audio.pause();
  audio.onended?.call(audio, new Event('ended'));
  return true;
}

// =================================================================================
// ERROR HANDLING
// =================================================================================

/**
 * Handle errors from speak operation
 */
function handleSpeakError(error: unknown): void {
  console.error('Speak error:', errorSummary(error));

  if (error instanceof Error && error.message.includes('Text is required')) {
    showMessage('No text provided. Please select text to speak.', 'warning');
  } else if (error instanceof Error && error.message.includes('Speed must be')) {
    showMessage('Invalid speed value. Please use the slider.', 'error');
  } else {
    showMessage(userMessageForError(error), 'error');
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
 * Hide the message area if it still shows `message` (and nothing newer).
 */
function hideMessageIf(message: string): void {
  if (elements.messageContainer.textContent === message) {
    elements.messageContainer.style.display = 'none';
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
  // Speed slider — convert state.selectedSpeed (semantic speed 0.5–2.0) to its
  // log-scaled position (0–1) for the slider value + fill bar.
  elements.speedValue.textContent = `${state.selectedSpeed.toFixed(1)}x`;
  const pos = speedToPosition(state.selectedSpeed);
  elements.speedSlider.value = pos.toString();
  elements.speedSlider.style.setProperty('--fill', `${pos * 100}%`);

  // Speak only enabled when fully connected, or when a system voice stands
  // in for an unreachable helper (warming, and disconnected without the
  // fallback, disable it)
  if (state.helperStatus === 'connected' || onFallback()) {
    elements.speakButton.disabled = false;
    elements.voiceSelect.disabled = state.helperStatus !== 'connected';
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
    const result = await chrome.storage.local.get<{ selectedVoice?: string; selectedSpeed?: number }>([
      'selectedVoice',
      'selectedSpeed',
    ]);

    // Only catalogue voices are valid; anything else falls back to the default.
    state.selectedVoice = resolveVoice(result.selectedVoice);

    if (typeof result.selectedSpeed === 'number' && Number.isFinite(result.selectedSpeed)) {
      state.selectedSpeed = result.selectedSpeed;
      const pos = speedToPosition(state.selectedSpeed);
      elements.speedSlider.value = pos.toString();
      elements.speedSlider.style.setProperty('--fill', `${pos * 100}%`);
      elements.speedValue.textContent = `${state.selectedSpeed.toFixed(1)}x`;
    }
  } catch (error) {
    console.error('Failed to load preferences:', error);
    // Use defaults if loading fails
  }
}

/**
 * Read "When the helper isn't running" (OD-2). Read again before each use, so
 * a change made in the options while the popup is open applies.
 */
async function loadHelperUnavailableAction(): Promise<void> {
  try {
    const result = await chrome.storage.local.get<{ whenHelperUnavailable?: unknown }>(['whenHelperUnavailable']);
    state.whenHelperUnavailable = isHelperUnavailableAction(result.whenHelperUnavailable)
      ? result.whenHelperUnavailable
      : DEFAULT_HELPER_UNAVAILABLE_ACTION;
  } catch (error) {
    console.error('Failed to load the fallback setting:', error);
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

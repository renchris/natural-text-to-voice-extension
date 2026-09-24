/**
 * Settings Defaults and Validation (Phase 2.6)
 *
 * Centralized default values and validation for extension settings
 */

import { DEFAULT_VOICE, VOICE_CATALOGUE, VOICE_IDS, isCatalogueVoice, voiceLongLabel } from './voices';
import {
  DEFAULT_HELPER_UNAVAILABLE_ACTION,
  isHelperUnavailableAction,
  type HelperUnavailableAction,
} from './system-voice';

export interface ExtensionSettings {
  // Voice preferences
  selectedVoice: string;
  selectedSpeed: number;
  /** "When the helper isn't running": speak with a system voice (default) or show an error (OD-2) */
  whenHelperUnavailable: HelperUnavailableAction;
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  selectedVoice: DEFAULT_VOICE,
  selectedSpeed: 1.0,
  whenHelperUnavailable: DEFAULT_HELPER_UNAVAILABLE_ACTION,
};

/**
 * Validation constraints
 */
export const SETTINGS_CONSTRAINTS = {
  speed: {
    min: 0.5,
    max: 2.0,
    step: 0.1,
  },
  /** Every catalogue voice (src/shared/voices.ts) is accepted */
  voices: VOICE_IDS,
};

/**
 * Voice display names, derived from the catalogue ("Bella (Female, US)")
 */
export const VOICE_NAMES: Record<string, string> = Object.fromEntries(
  VOICE_CATALOGUE.map(v => [v.id, voiceLongLabel(v.id)])
);

/**
 * Validate settings object
 */
export function validateSettings(settings: Partial<ExtensionSettings>): ExtensionSettings {
  const validated: ExtensionSettings = { ...DEFAULT_SETTINGS };

  // Validate voice
  if (isCatalogueVoice(settings.selectedVoice)) {
    validated.selectedVoice = settings.selectedVoice;
  }

  // Validate speed
  if (settings.selectedSpeed !== undefined) {
    const speed = Number(settings.selectedSpeed);
    if (!isNaN(speed) && speed >= SETTINGS_CONSTRAINTS.speed.min && speed <= SETTINGS_CONSTRAINTS.speed.max) {
      validated.selectedSpeed = speed;
    }
  }

  if (isHelperUnavailableAction(settings.whenHelperUnavailable)) {
    validated.whenHelperUnavailable = settings.whenHelperUnavailable;
  }

  return validated;
}

/**
 * Load settings from storage with defaults
 */
export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    return validateSettings(stored);
  } catch (error) {
    console.error('[Settings] Failed to load settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/** The default voice before OD-5 made it af_heart, and the release that did. */
export const PRE_OD5_DEFAULT_VOICE = 'af_bella';
export const OD5_RELEASE = '1.5.0';

/** -1, 0 or 1 for dotted numeric versions ("1.4.0" < "1.5.0"); a missing part counts as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * OD-5 makes af_heart the default for NEW installs. Before 1.5 the default
 * lived only in code and nothing wrote it to storage, so an install that
 * never touched the voice or speed controls has no stored voice and would
 * silently move from Bella to Heart on update. On an update from an older
 * release, pin the voice it was using. A stored choice is left as it is.
 * Returns true when it wrote the voice.
 */
export async function pinPreviousDefaultVoice(details: { reason?: string; previousVersion?: string } | undefined): Promise<boolean> {
  if (details?.reason !== 'update' || typeof details.previousVersion !== 'string') return false;
  if (compareVersions(details.previousVersion, OD5_RELEASE) >= 0) return false;
  try {
    const stored = await chrome.storage.local.get('selectedVoice');
    if (typeof stored?.selectedVoice === 'string' && stored.selectedVoice.length > 0) return false;
    await chrome.storage.local.set({ selectedVoice: PRE_OD5_DEFAULT_VOICE });
    return true;
  } catch (error) {
    console.error('[Settings] Could not keep the previous default voice:', error);
    return false;
  }
}

/**
 * Save settings to storage
 */
export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const validated = validateSettings(settings);
  await chrome.storage.local.set(validated);
}

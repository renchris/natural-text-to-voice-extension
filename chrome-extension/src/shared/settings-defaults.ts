/**
 * Settings Defaults and Validation (Phase 2.6)
 *
 * Centralized default values and validation for extension settings
 */

import { DEFAULT_VOICE, VOICE_CATALOGUE, VOICE_IDS, isCatalogueVoice, voiceLongLabel } from './voices';

export interface ExtensionSettings {
  // Voice preferences
  selectedVoice: string;
  selectedSpeed: number;
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  selectedVoice: DEFAULT_VOICE,
  selectedSpeed: 1.0,
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

/**
 * Save settings to storage
 */
export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const validated = validateSettings(settings);
  await chrome.storage.local.set(validated);
}

/**
 * Settings Defaults and Validation (Phase 2.6)
 *
 * Centralized default values and validation for extension settings
 */

export interface ExtensionSettings {
  // Voice preferences
  selectedVoice: string;
  selectedSpeed: number;

  // Playback behavior
  autoPlay: boolean;

  // Helper connection
  helperAutoRetry: boolean;
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  selectedVoice: 'af_bella',
  selectedSpeed: 1.0,
  autoPlay: false,
  helperAutoRetry: true,
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
  voices: [
    'af_bella',
    'af_nicole',
    'af_sarah',
    'af_sky',
    'am_adam',
    'am_michael',
  ] as const,
};

/**
 * Voice display names
 */
export const VOICE_NAMES: Record<string, string> = {
  'af_bella': 'Bella (Female, US)',
  'af_nicole': 'Nicole (Female, US)',
  'af_sarah': 'Sarah (Female, US)',
  'af_sky': 'Sky (Female, US)',
  'am_adam': 'Adam (Male, US)',
  'am_michael': 'Michael (Male, US)',
};

/**
 * Validate settings object
 */
export function validateSettings(settings: Partial<ExtensionSettings>): ExtensionSettings {
  const validated: ExtensionSettings = { ...DEFAULT_SETTINGS };

  // Validate voice
  if (settings.selectedVoice && SETTINGS_CONSTRAINTS.voices.includes(settings.selectedVoice as any)) {
    validated.selectedVoice = settings.selectedVoice;
  }

  // Validate speed
  if (settings.selectedSpeed !== undefined) {
    const speed = Number(settings.selectedSpeed);
    if (!isNaN(speed) && speed >= SETTINGS_CONSTRAINTS.speed.min && speed <= SETTINGS_CONSTRAINTS.speed.max) {
      validated.selectedSpeed = speed;
    }
  }

  // Validate boolean settings
  if (typeof settings.autoPlay === 'boolean') {
    validated.autoPlay = settings.autoPlay;
  }

  if (typeof settings.helperAutoRetry === 'boolean') {
    validated.helperAutoRetry = settings.helperAutoRetry;
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

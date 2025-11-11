import { HelperConfig, ConfigNotFoundError } from './types';

/**
 * Storage key for helper configuration in chrome.storage.local
 */
const STORAGE_KEY = 'native_tts_helper_config';

/**
 * Default port to try if no config is stored
 */
const DEFAULT_PORT = 8249;

/**
 * Get the config file path (macOS only for now)
 * Note: Chrome extensions cannot directly read files from the filesystem
 * This is here for documentation purposes only
 */
export function getConfigPath(): string {
  // This path is where the native helper stores its config
  // We can't read it directly from a Chrome extension
  return '~/Library/Application Support/NaturalTTS/config.json';
}

/**
 * Get helper configuration from chrome.storage.local
 * Falls back to trying DEFAULT_PORT if no config is stored
 */
export async function getStoredConfig(): Promise<Partial<HelperConfig>> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const config = result[STORAGE_KEY];

    if (config && config.port) {
      return config;
    }

    // Return minimal config with default port
    return {
      port: DEFAULT_PORT,
      secret: '', // Will be discovered via health check or user input
      default_voice: 'af_bella'
    };
  } catch (error) {
    console.warn('Failed to read config from storage:', error);
    return {
      port: DEFAULT_PORT,
      secret: '',
      default_voice: 'af_bella'
    };
  }
}

/**
 * Save helper configuration to chrome.storage.local
 */
export async function saveConfig(config: Partial<HelperConfig>): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
  } catch (error) {
    console.error('Failed to save config to storage:', error);
    throw new Error('Failed to save configuration');
  }
}

/**
 * Clear stored configuration
 */
export async function clearConfig(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear config from storage:', error);
  }
}

/**
 * Discover helper configuration by trying to connect
 * This attempts to find a running helper and retrieve its configuration
 *
 * @param portsToTry - Array of ports to try (default: [8249, 8250, 8251])
 * @returns Discovered configuration or throws ConfigNotFoundError
 */
export async function discoverConfig(portsToTry: number[] = [8249, 8250, 8251]): Promise<Partial<HelperConfig>> {
  for (const port of portsToTry) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(2000), // 2 second timeout per port
      });

      if (response.ok) {
        // Found a running helper on this port
        const config: Partial<HelperConfig> = {
          port,
          secret: '', // Secret is not exposed via health endpoint
          default_voice: 'af_bella'
        };

        // Save the discovered config
        await saveConfig(config);

        return config;
      }
    } catch (error) {
      // Try next port
      continue;
    }
  }

  throw new ConfigNotFoundError(
    `Native TTS Helper not found on ports: ${portsToTry.join(', ')}. ` +
    'Please ensure the helper is running and try again.'
  );
}

/**
 * Get configuration with auto-discovery fallback
 * 1. Tries to load from storage
 * 2. If no stored config or connection fails, attempts discovery
 * 3. Throws ConfigNotFoundError if helper cannot be found
 */
export async function getConfig(): Promise<Partial<HelperConfig>> {
  // Try stored config first
  const storedConfig = await getStoredConfig();

  if (storedConfig.port) {
    // Verify the stored port is still valid
    try {
      const response = await fetch(`http://127.0.0.1:${storedConfig.port}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        return storedConfig;
      }
    } catch (error) {
      // Stored port is not responding, try discovery
    }
  }

  // Attempt discovery
  return await discoverConfig();
}

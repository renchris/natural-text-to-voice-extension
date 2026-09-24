import { HelperConfig, ConfigNotFoundError } from './types';
import { DEFAULT_VOICE } from './voices';

/**
 * Storage key for helper configuration in chrome.storage.local
 */
const STORAGE_KEY = 'native_tts_helper_config';

/**
 * Default port the helper pins to (Config.swift preferredPort).
 */
const DEFAULT_PORT = 8249;

/**
 * Ports probed during discovery — matches the helper's fallback range
 * (Config.swift preferredPort + portRangeCount).
 */
const DISCOVERY_PORTS: number[] = Array.from({ length: 12 }, (_, i) => DEFAULT_PORT + i);

/**
 * The model every helper reports on /health (v1.4 and later), used as its
 * identity. Any local service may answer 200 on /health (a dev server, or a
 * `kubectl port-forward` / `ssh -L` tunnel on 8249 while the helper sits on
 * 8250), and the next request would POST the user's selection to it.
 */
export const HELPER_MODEL = 'kokoro-82m';

/**
 * True when a /health response comes from the Natural TTS helper: a 2xx whose
 * JSON body names the helper's model. Never throws.
 */
export async function isHelperHealth(response: { ok: boolean; json: () => Promise<unknown> }): Promise<boolean> {
  if (!response.ok) return false;
  try {
    const body = await response.json() as { model?: unknown; status?: unknown } | null;
    return body?.model === HELPER_MODEL && typeof body.status === 'string';
  } catch {
    return false;
  }
}

/** A TCP port number a helper could listen on. */
export function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65535;
}

/**
 * The helper port saved in chrome.storage.local (by discovery, or by the
 * service worker after the offscreen document found the helper), or
 * undefined when none is saved or storage is unavailable. The service worker
 * sends it with each speak request, because the offscreen document has no
 * chrome.storage of its own.
 */
export async function getStoredPort(): Promise<number | undefined> {
  try {
    const result = await chrome.storage.local.get<Record<string, Partial<HelperConfig> | undefined>>(STORAGE_KEY);
    const port = result[STORAGE_KEY]?.port;
    return isValidPort(port) ? port : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Save a port the helper was found on, keeping the rest of the stored config.
 */
export async function saveHelperPort(port: number): Promise<void> {
  if (!isValidPort(port)) return;
  let stored: Partial<HelperConfig> | undefined;
  try {
    const result = await chrome.storage.local.get<Record<string, Partial<HelperConfig> | undefined>>(STORAGE_KEY);
    stored = result[STORAGE_KEY];
  } catch {
    stored = undefined;
  }
  await saveConfig({ default_voice: DEFAULT_VOICE, ...stored, port });
}

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
    const result = await chrome.storage.local.get<Record<string, Partial<HelperConfig> | undefined>>(STORAGE_KEY);
    const config = result[STORAGE_KEY];

    if (config && typeof config.port === 'number' && config.port > 0) {
      return config;
    }

    // Return minimal config with default port
    return {
      port: DEFAULT_PORT,
      secret: '', // Will be discovered via health check or user input
      default_voice: DEFAULT_VOICE
    };
  } catch (error) {
    console.warn('Failed to read config from storage:', error);
    return {
      port: DEFAULT_PORT,
      secret: '',
      default_voice: DEFAULT_VOICE
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
 * @param portsToTry - Array of ports to try (default: 8249..8260)
 * @returns Discovered configuration or throws ConfigNotFoundError
 */
export async function discoverConfig(portsToTry: number[] = DISCOVERY_PORTS): Promise<Partial<HelperConfig>> {
  for (const port of portsToTry) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(2000), // 2 second timeout per port
      });

      if (await isHelperHealth(response)) {
        // Found a running helper on this port
        const config: Partial<HelperConfig> = {
          port,
          secret: '', // Secret is not exposed via health endpoint
          default_voice: DEFAULT_VOICE
        };

        // Save the discovered config. A context without chrome.storage (the
        // offscreen document) cannot save, but the port it found is still
        // the right one: return it rather than moving on to the next port.
        try {
          await saveConfig(config);
        } catch (error) {
          console.warn('Found the helper on port', port, 'but could not save it:', error);
        }

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
 * 1. Tries the preferred port (the stored port the service worker passed to
 *    the offscreen document), else the port stored in chrome.storage
 * 2. Keeps it only if its /health identifies the helper (SEC-03); otherwise,
 *    or if nothing answers, attempts discovery
 * 3. Throws ConfigNotFoundError if helper cannot be found
 */
export async function getConfig(preferredPort?: number): Promise<Partial<HelperConfig>> {
  const storedConfig: Partial<HelperConfig> = isValidPort(preferredPort)
    ? { port: preferredPort, secret: '', default_voice: DEFAULT_VOICE }
    : await getStoredConfig();

  if (storedConfig.port) {
    // Verify the port still serves the helper, not some other local service
    try {
      const response = await fetch(`http://127.0.0.1:${storedConfig.port}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(2000),
      });

      if (await isHelperHealth(response)) {
        return storedConfig;
      }
    } catch (error) {
      // Stored port is not responding, try discovery
    }
  }

  // Attempt discovery
  return await discoverConfig();
}

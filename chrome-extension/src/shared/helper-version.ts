/**
 * Helper/extension version skew, and how the helper is installed and updated.
 *
 * A v1.5 helper reports `"apiVersion": 2` in /health (camelCase on the wire).
 * Older helpers report no apiVersion: they still speak, but offer only six
 * voices, label af_sarah "(UK)" and send bare 500s for errors. The popup
 * keeps working with whatever voices such a helper reports and shows a
 * one-line notice with the command that updates it.
 */

import type { HealthResponse } from './types';

export const MIN_HELPER_API_VERSION = 2;

/**
 * Homebrew is the primary channel (OD-1): a tap whose formula builds the
 * helper from source, run as a login service by `brew services`.
 */
export const HELPER_INSTALL_COMMAND = 'brew install renchris/tap/natural-tts && brew services start natural-tts';
export const HELPER_UPDATE_COMMAND = 'brew upgrade natural-tts && brew services restart natural-tts';

/**
 * Installing or updating from source: the README's install section. Every
 * helper older than 1.5 was installed this way (the tap is new), so the update
 * notice links here beside the Homebrew command.
 */
export const HELPER_SOURCE_URL = 'https://github.com/renchris/natural-text-to-voice-extension#install';

export function helperNeedsUpdate(health: Pick<HealthResponse, 'apiVersion'>): boolean {
  const version = health.apiVersion;
  return typeof version !== 'number' || !Number.isFinite(version) || version < MIN_HELPER_API_VERSION;
}

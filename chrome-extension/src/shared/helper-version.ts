/**
 * Helper/extension version skew, and how the helper is installed and updated.
 *
 * A v1.5 helper reports `"apiVersion": 2` in /health (camelCase on the wire).
 * Older helpers report no apiVersion: they still speak, but offer only six
 * voices, label af_sarah "(UK)" and send bare 500s for errors. The popup
 * keeps working with whatever voices such a helper reports and shows a
 * one-line notice with the command that updates it (helperUpdate).
 */

import type { HealthResponse } from './types';

export const MIN_HELPER_API_VERSION = 2;

/**
 * Homebrew is the primary channel (OD-1): a tap whose formula builds the
 * helper from source, run as a login service by `brew services`.
 */
export const HELPER_INSTALL_COMMAND = 'brew install renchris/tap/natural-tts && brew services start natural-tts';

/**
 * Updating a helper installed from source, run in the checkout: pull, then
 * quickstart.sh rebuilds the helper and restarts it in its tmux session. Every
 * helper older than 1.5 was installed this way (the tap is new with 1.5), and
 * `brew upgrade` fails for it ("No available formula" or "not installed").
 */
export const HELPER_SOURCE_UPDATE_COMMAND = 'git pull && native-helper/Scripts/quickstart.sh';
/** Updating a helper Homebrew installed: one that reports an apiVersion, after a later API bump. */
export const HELPER_BREW_UPDATE_COMMAND = 'brew upgrade natural-tts && brew services restart natural-tts';

/** Installing from source: the README's install section. */
export const HELPER_SOURCE_URL = 'https://github.com/renchris/natural-text-to-voice-extension#install';
/** Updating a source install: the README section for it (stop an old helper before switching to Homebrew). */
export const HELPER_SOURCE_UPDATE_URL =
  'https://github.com/renchris/natural-text-to-voice-extension#updating-a-helper-installed-from-source';

export function helperNeedsUpdate(health: Pick<HealthResponse, 'apiVersion'>): boolean {
  const version = health.apiVersion;
  return typeof version !== 'number' || !Number.isFinite(version) || version < MIN_HELPER_API_VERSION;
}

/** What the update notice shows for a helper that needs an update. */
export interface HelperUpdate {
  /** The helper reports no apiVersion: it predates 1.5 and was installed from source. */
  fromSource: boolean;
  command: string;
  url: string;
}

/**
 * The update for this helper, chosen by how it can have been installed: no
 * apiVersion means a pre-1.5 helper, which was installed from source; a helper
 * that reports one can be a Homebrew install (the formula ships 1.5 or later).
 */
export function helperUpdate(health: Pick<HealthResponse, 'apiVersion'>): HelperUpdate {
  const version = health.apiVersion;
  const fromSource = typeof version !== 'number' || !Number.isFinite(version);
  return fromSource
    ? { fromSource, command: HELPER_SOURCE_UPDATE_COMMAND, url: HELPER_SOURCE_UPDATE_URL }
    : { fromSource, command: HELPER_BREW_UPDATE_COMMAND, url: HELPER_SOURCE_URL };
}

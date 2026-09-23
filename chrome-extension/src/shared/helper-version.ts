/**
 * Helper/extension version skew.
 *
 * A v1.5 helper reports `"apiVersion": 2` in /health (camelCase on the wire).
 * Older helpers report no apiVersion: they still speak, but offer only six
 * voices, label af_sarah "(UK)" and send bare 500s for errors. The popup
 * keeps working with whatever voices such a helper reports and shows a
 * one-line notice with the command that updates it.
 */

import type { HealthResponse } from './types';

export const MIN_HELPER_API_VERSION = 2;

/** Run from the repository root; rebuilds the Python environment and the helper. */
export const HELPER_UPDATE_COMMAND = 'cd native-helper && ./Scripts/quickstart.sh';

export function helperNeedsUpdate(health: Pick<HealthResponse, 'apiVersion'>): boolean {
  const version = health.apiVersion;
  return typeof version !== 'number' || !Number.isFinite(version) || version < MIN_HELPER_API_VERSION;
}

/**
 * What a /health answer means, shared by the popup and the options page so
 * both name the same state the same way.
 */

import type { HealthResponse } from './types';

/**
 * ready: the voice model is loaded. engine-stopped: the helper's worker died
 * repeatedly and the helper gave up restarting it (/health status "error");
 * only restarting the helper brings it back. warming: reachable, model still
 * loading (status "warming", or model_loaded false).
 */
export type HelperHealthState = 'ready' | 'engine-stopped' | 'warming';

export function helperHealthState(health: Pick<HealthResponse, 'status' | 'model_loaded'>): HelperHealthState {
  if (health.status === 'ok' && health.model_loaded) return 'ready';
  if (health.status === 'error') return 'engine-stopped';
  return 'warming';
}

/** Status line for engine-stopped: what happened and the one thing that fixes it. */
export const ENGINE_STOPPED_STATUS = 'The helper’s voice engine stopped - restart the helper';

/** Status line while the model loads. */
export const WARMING_STATUS = 'Loading TTS model…';

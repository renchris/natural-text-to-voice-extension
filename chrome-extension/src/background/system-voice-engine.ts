/**
 * The system-voice engine (OD-2): speaks through chrome.tts from the service
 * worker when the helper cannot be reached.
 *
 * It follows the offscreen document's protocol so the service worker treats
 * both engines alike: speakWithSystemVoice() resolves as soon as speech has
 * started (SPEAK_STARTED) or ended before that (SPEAK_ERROR / SPEAK_STOPPED /
 * SPEAK_COMPLETE); how a started speech ends is reported later through
 * `onFinished`. Starting, ending and stopping are broadcast as
 * OFFSCREEN_ACTIVITY (engine 'system') so an open popup can show Stop and
 * "System voice".
 */

import type { OffscreenActivityMessage, OffscreenSpeakResponse } from '../shared/types';
import { systemVoiceLang, systemVoiceOptions } from '../shared/system-voice';

export const SYSTEM_VOICE_ERROR = 'The system voice could not speak this text.';

const STOPPED: OffscreenSpeakResponse = { type: 'SPEAK_STOPPED', success: true, engine: 'system' };

export interface SystemVoiceFinished {
  success: boolean;
  stopped?: boolean;
  error?: string;
}

export interface SystemVoiceHooks {
  /** True once a stop (or a newer request) has cancelled this request. */
  isStopped?: () => boolean;
  /** How a speech that already answered SPEAK_STARTED ended. */
  onFinished?: (outcome: SystemVoiceFinished) => void;
}

interface Speech {
  started: boolean;
  settled: boolean;
  settle: (response: OffscreenSpeakResponse) => void;
}

let current: Speech | null = null;

/** True while the system voice is speaking a request this worker started. */
export function isSystemVoiceSpeaking(): boolean {
  return current !== null && current.started;
}

function broadcast(speaking: boolean): void {
  const activity: OffscreenActivityMessage = { type: 'OFFSCREEN_ACTIVITY', speaking, engine: 'system' };
  try {
    Promise.resolve(chrome.runtime.sendMessage(activity)).catch(() => {
      // No popup open: nothing to tell.
    });
  } catch {
    // No popup open: nothing to tell.
  }
}

/**
 * Stop the system voice. Settles the request being spoken (SPEAK_STOPPED)
 * at once rather than waiting for chrome.tts's "interrupted" event. Also
 * silences speech a previous worker instance started, whose state is gone.
 * Returns true when a request of this worker was active.
 */
export function stopSystemVoice(): boolean {
  const speech = current;
  try {
    chrome.tts?.stop();
  } catch (error) {
    console.warn('[SystemVoice] chrome.tts.stop failed:', error);
  }
  if (!speech) return false;
  speech.settle(STOPPED);
  return true;
}

async function listVoices(): Promise<chrome.tts.TtsVoice[]> {
  try {
    return (await chrome.tts.getVoices()) ?? [];
  } catch (error) {
    console.warn('[SystemVoice] getVoices failed; no voice can be checked as local:', error);
    return [];
  }
}

/**
 * Speak `text` with a system voice matching the accent of `kokoroVoice`, at
 * `speed` mapped to a chrome.tts rate. Never rejects.
 */
export async function speakWithSystemVoice(
  text: string,
  kokoroVoice: string,
  speed: number,
  hooks: SystemVoiceHooks = {}
): Promise<OffscreenSpeakResponse> {
  const stopped = hooks.isStopped ?? (() => false);
  if (typeof chrome === 'undefined' || !chrome.tts) {
    return { type: 'SPEAK_ERROR', success: false, error: SYSTEM_VOICE_ERROR, engine: 'system' };
  }
  if (!text || text.trim().length === 0) {
    return { type: 'SPEAK_ERROR', success: false, error: 'There is no speakable text in the selection.', engine: 'system' };
  }

  // This request replaces whatever the system voice is saying.
  if (current) stopSystemVoice();

  const voices = await listVoices();
  if (stopped()) return STOPPED;
  const options = systemVoiceOptions(kokoroVoice, speed, voices);
  if (!options) {
    console.warn('[SystemVoice] No local platform voice is available; not sending the text off this computer');
    return { type: 'SPEAK_ERROR', success: false, error: SYSTEM_VOICE_ERROR, engine: 'system' };
  }

  return new Promise<OffscreenSpeakResponse>(resolve => {
    const speech: Speech = {
      started: false,
      settled: false,
      settle: response => {
        if (speech.settled) return;
        speech.settled = true;
        if (current === speech) current = null;
        if (speech.started) {
          broadcast(false);
          hooks.onFinished?.({
            success: response.success,
            ...(response.type === 'SPEAK_STOPPED' ? { stopped: true } : {}),
            ...(response.error ? { error: response.error } : {}),
          });
        } else {
          resolve(response);
        }
      },
    };
    const start = () => {
      if (speech.settled || speech.started) return;
      speech.started = true;
      broadcast(true);
      resolve({ type: 'SPEAK_STARTED', success: true, engine: 'system' });
    };
    current = speech;

    const onEvent = (event: chrome.tts.TtsEvent) => {
      switch (event.type) {
        case 'start':
          start();
          break;
        case 'end':
          speech.settle({ type: 'SPEAK_COMPLETE', success: true, engine: 'system' });
          break;
        case 'interrupted':
        case 'cancelled':
          speech.settle(STOPPED);
          break;
        case 'error':
          console.warn('[SystemVoice] chrome.tts error event:', event.errorMessage);
          speech.settle({ type: 'SPEAK_ERROR', success: false, error: SYSTEM_VOICE_ERROR, engine: 'system' });
          break;
      }
    };

    console.log('[SystemVoice] Speaking', { textLength: text.length, lang: systemVoiceLang(kokoroVoice), ...options });
    let queued: Promise<void>;
    try {
      queued = Promise.resolve(chrome.tts.speak(text, { ...options, onEvent }));
    } catch (error) {
      queued = Promise.reject(error);
    }
    // chrome.tts.speak resolves right away, before the speech ends, once the
    // utterance was accepted (enqueue: false, so it is speaking now). Count
    // that as started too: some voices never send a "start" event.
    queued.then(start, (error: unknown) => {
      console.warn('[SystemVoice] chrome.tts.speak failed:', error);
      speech.settle({ type: 'SPEAK_ERROR', success: false, error: SYSTEM_VOICE_ERROR, engine: 'system' });
    });
  });
}

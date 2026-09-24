/**
 * Offscreen Document for Audio Playback (Phase 2.4/2.5)
 *
 * Handles audio playback from context menu actions reliably,
 * even when the popup is closed. Runs in a hidden document
 * managed by the background service worker.
 */

import { getApiClient, userMessageForError } from '../shared/api-client';
import { errorSummary, isHelperUnavailable } from '../shared/helper-errors';
import type {
  SpeakInOffscreenMessage,
  OffscreenSpeakResponse,
  OffscreenStopResponse,
  OffscreenMessage,
  OffscreenIdleMessage,
  SpeakFinishedMessage,
  OffscreenStatusResponse,
  OffscreenActivityMessage,
} from '../shared/types';

/**
 * The one speak request this document is serving.
 *
 * `settle` records the outcome exactly once, whichever comes first: the audio
 * ends, generation or playback fails, a STOP arrives, or a newer speak request
 * supersedes this one. The service worker's pending message is answered at
 * the latest when playback starts (`started`, SPEAK_STARTED); an outcome after
 * that is reported as a one-way SPEAK_FINISHED message.
 */
interface SpeakJob {
  settled: boolean;
  /** Playback began and SPEAK_STARTED was sent. */
  started: boolean;
  start: () => void;
  audio: HTMLAudioElement | null;
  audioUrl: string | null;
  /** Resolves playAudio() when playback is cut short */
  endPlayback: (() => void) | null;
  /** Aborts the /speak fetch; the closed connection makes the helper stop synthesising */
  abort: AbortController;
  /** The Kokoro voice requested, reported to an open popup */
  voice: string;
  /** The port the helper answered on, once known */
  port?: number;
  settle: (response: OffscreenSpeakResponse) => void;
}

let activeJob: SpeakJob | null = null;

const STOPPED_RESPONSE: OffscreenSpeakResponse = { type: 'SPEAK_STOPPED', success: true };

/**
 * How long the document may sit with nothing generating or playing before it
 * asks the service worker to close it. The BLOBS reason means Chrome never
 * closes it by itself, so this timer is what frees it.
 */
export const OFFSCREEN_IDLE_MS = 60_000;

let idleTimer: ReturnType<typeof setTimeout> | null = null;

function armIdleTimer(): void {
  cancelIdleTimer();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (activeJob) return;
    const idle: OffscreenIdleMessage = { type: 'OFFSCREEN_IDLE' };
    chrome.runtime.sendMessage(idle).catch((error: unknown) => {
      console.warn('[Offscreen] Could not report idle:', error);
    });
  }, OFFSCREEN_IDLE_MS);
}

function cancelIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

/**
 * Initialize offscreen document
 */
console.log('[Offscreen] Document loaded');

// If no speak request ever arrives (the service worker failed after creating
// us), still close after the idle period.
armIdleTimer();

/**
 * Listen for messages from background service worker
 */
chrome.runtime.onMessage.addListener((
  message: OffscreenMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: OffscreenSpeakResponse | OffscreenStopResponse | OffscreenStatusResponse) => void
): boolean => {

  if (message.type === 'SPEAK_IN_OFFSCREEN') {
    handleSpeakRequest(message).then(sendResponse);

    // Return true to indicate async response
    return true;
  }

  if (message.type === 'STOP_IN_OFFSCREEN') {
    sendResponse({ type: 'STOPPED', stopped: stopSpeaking() });
    return false;
  }

  // The popup asks on open, so it can offer Stop for speech it did not start.
  if (message.type === 'OFFSCREEN_STATUS_QUERY') {
    sendResponse(activeJob
      ? { type: 'OFFSCREEN_STATUS', speaking: true, voice: activeJob.voice }
      : { type: 'OFFSCREEN_STATUS', speaking: false });
    return false;
  }

  // Unknown message type
  return false;
});

/**
 * Stop the active speak request: pause the audio, revoke its URL and settle
 * the pending promise with SPEAK_STOPPED. If synthesis is still in flight its
 * result is discarded when it arrives. Returns false when nothing was active.
 */
function stopSpeaking(): boolean {
  const job = activeJob;
  if (!job) {
    return false;
  }
  job.abort.abort();
  releaseAudio(job);
  job.endPlayback?.();
  job.endPlayback = null;
  job.settle(STOPPED_RESPONSE);
  return true;
}

function releaseAudio(job: SpeakJob): void {
  if (job.audio) {
    job.audio.pause();
    job.audio = null;
  }
  if (job.audioUrl) {
    URL.revokeObjectURL(job.audioUrl);
    job.audioUrl = null;
  }
}

/**
 * Handle speak request from background worker.
 * Always resolves (never rejects) with the response to send back.
 */
function handleSpeakRequest(
  message: SpeakInOffscreenMessage
): Promise<OffscreenSpeakResponse> {
  console.log('[Offscreen] Received speak request:', {
    textLength: message.text.length,
    voice: message.voice,
    speed: message.speed,
  });

  // A new request supersedes whatever is speaking now; settle that one.
  stopSpeaking();
  cancelIdleTimer();

  return new Promise<OffscreenSpeakResponse>(resolve => {
    const job: SpeakJob = {
      settled: false,
      started: false,
      audio: null,
      audioUrl: null,
      endPlayback: null,
      abort: new AbortController(),
      voice: message.voice,
      start: () => {
        if (job.settled || job.started) return;
        job.started = true;
        resolve({ type: 'SPEAK_STARTED', success: true, ...(job.port ? { port: job.port } : {}) });
      },
      settle: (response) => {
        if (job.settled) return;
        job.settled = true;
        if (activeJob === job) {
          activeJob = null;
          // Playback ended, failed or was stopped: start the idle countdown.
          armIdleTimer();
          broadcastActivity(false, job.voice);
        }
        if (job.started) {
          reportFinished(response);
        } else {
          resolve(response);
        }
      },
    };
    activeJob = job;
    broadcastActivity(true, job.voice);

    runSpeakJob(message, job).then(job.settle, (error) => {
      releaseAudio(job);
      job.settle(toErrorResponse(error));
    });
  });
}

async function runSpeakJob(
  message: SpeakInOffscreenMessage,
  job: SpeakJob
): Promise<OffscreenSpeakResponse> {
  // Validate text
  if (!message.text || message.text.trim().length === 0) {
    throw new Error('No text provided for speech generation');
  }

  // Validate speed
  if (message.speed < 0.5 || message.speed > 2.0) {
    throw new Error(`Invalid speed: ${message.speed}. Must be between 0.5 and 2.0`);
  }

  // Generate speech using API client
  const client = getApiClient();
  const audioBlob = await client.speak({
    text: message.text,
    voice: message.voice,
    speed: message.speed,
  }, job.abort.signal, { port: message.port });
  job.port = client.port;

  // Stopped (or superseded) while the helper was synthesising: do not play.
  if (job.settled) {
    return STOPPED_RESPONSE;
  }

  await playAudio(audioBlob, job);

  if (job.settled) {
    return STOPPED_RESPONSE;
  }

  console.log('[Offscreen] Audio playback complete');
  return {
    type: 'SPEAK_COMPLETE',
    success: true,
    ...(job.port ? { port: job.port } : {}),
  };
}

/** Tell an open popup whether a speak request is being served, and with which voice. */
function broadcastActivity(speaking: boolean, voice: string): void {
  const activity: OffscreenActivityMessage = speaking
    ? { type: 'OFFSCREEN_ACTIVITY', speaking, engine: 'kokoro', voice }
    : { type: 'OFFSCREEN_ACTIVITY', speaking, engine: 'kokoro' };
  chrome.runtime.sendMessage(activity).catch(() => {
    // No popup open (and the service worker ignores it): nothing to tell.
  });
}

/** The outcome of a request whose reply (SPEAK_STARTED) has already gone. */
function reportFinished(response: OffscreenSpeakResponse): void {
  const finished: SpeakFinishedMessage = {
    type: 'SPEAK_FINISHED',
    success: response.success,
    ...(response.type === 'SPEAK_STOPPED' ? { stopped: true } : {}),
    ...(response.error ? { error: response.error } : {}),
  };
  chrome.runtime.sendMessage(finished).catch((error: unknown) => {
    console.warn('[Offscreen] Could not report the end of playback:', error);
  });
}

function toErrorResponse(error: unknown): OffscreenSpeakResponse {
  console.error('[Offscreen] Error generating/playing speech:', errorSummary(error));

  return {
    type: 'SPEAK_ERROR',
    success: false,
    error: userMessageForError(error),
    // The service worker may then speak with the system voice (OD-2).
    ...(isHelperUnavailable(error) ? { helperUnavailable: true } : {}),
  };
}

/**
 * Play audio from blob. Resolves when playback ends or is stopped.
 * @param audioBlob - Audio data in WAV format
 * @param job - The speak request this playback belongs to
 */
function playAudio(audioBlob: Blob, job: SpeakJob): Promise<void> {
  return new Promise((resolve, reject) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    job.audio = audio;
    job.audioUrl = audioUrl;
    job.endPlayback = resolve;

    // Handle playback completion
    audio.onended = () => {
      releaseAudio(job);
      job.endPlayback = null;
      resolve();
    };

    // Handle playback errors
    audio.onerror = () => {
      console.error('[Offscreen] Audio playback error:', audio.error);
      releaseAudio(job);
      job.endPlayback = null;
      reject(new Error(`Failed to play audio: ${audio.error?.message || 'Unknown error'}`));
    };

    // Start playback; once it is playing, answer the service worker.
    audio.play().then(() => job.start(), (error) => {
      console.error('[Offscreen] Failed to start audio playback:', error);
      releaseAudio(job);
      job.endPlayback = null;
      reject(error);
    });
  });
}

/**
 * The system-voice fallback (OD-2): pure decisions shared by the service
 * worker (which drives chrome.tts) and the popup (which routes its fallback
 * speech through the service worker).
 *
 * When the Natural TTS helper cannot be reached, the same text is spoken with
 * a voice built into the OS through chrome.tts, unless the user chose "Show an
 * error" in the options. Only an unreachable helper falls back: a helper that
 * answers and rejects the request (a 4xx for bad input, a timeout while it is
 * busy) is reported as before, since a system voice would hide a real problem.
 */

import { HELPER_SOURCE_URL } from './helper-version';
import { isHelperUnavailable } from './helper-errors';
import { voiceLabel } from './voices';

/** Values of the "When the helper isn't running" setting. */
export type HelperUnavailableAction = 'system-voice' | 'error';

export const HELPER_UNAVAILABLE_ACTIONS: readonly HelperUnavailableAction[] = ['system-voice', 'error'];

export const DEFAULT_HELPER_UNAVAILABLE_ACTION: HelperUnavailableAction = 'system-voice';

export function isHelperUnavailableAction(value: unknown): value is HelperUnavailableAction {
  return typeof value === 'string' && (HELPER_UNAVAILABLE_ACTIONS as readonly string[]).includes(value);
}

/** Which engine is speaking. */
export type SpeechEngine = 'kokoro' | 'system';

/**
 * The one-line fallback notice: this sentence, the Homebrew install command
 * (HELPER_INSTALL_COMMAND) and a "from source" link to the README.
 */
export const HELPER_SETUP_URL = HELPER_SOURCE_URL;
export const HELPER_SETUP_NOTICE = 'Install the free Natural TTS helper for natural Kokoro voices:';
export const HELPER_SOURCE_LINK_TEXT = 'or build it from source';

export const SYSTEM_VOICE_LABEL = 'System voice';

/** "Kokoro · Bella (US)" or "System voice": which engine is speaking, for the popup. */
export function engineLabel(engine: SpeechEngine, kokoroVoice?: string | null): string {
  if (engine === 'system') return SYSTEM_VOICE_LABEL;
  return kokoroVoice ? `Kokoro · ${voiceLabel(kokoroVoice)}` : 'Kokoro';
}

/** Shown (badge tooltip, popup) when the helper is down and the system voice failed too. */
export const SYSTEM_VOICE_FAILED_MESSAGE =
  'The Natural TTS helper is not running, and the system voice could not speak. Start the helper, then try again.';

/**
 * True when this failure should be spoken with the system voice instead:
 * the helper is unreachable and the user has not asked for an error.
 */
export function shouldUseSystemVoice(error: unknown, action: HelperUnavailableAction): boolean {
  return action === 'system-voice' && isHelperUnavailable(error);
}

/** chrome.tts accepts rates from 0.1 to 10 (1 = the voice's normal rate). */
export const SYSTEM_RATE_MIN = 0.1;
export const SYSTEM_RATE_MAX = 10;

/**
 * The chrome.tts rate for a Kokoro speed. Both are multiples of the voice's
 * normal pace, so the value carries over; it is only clamped to what chrome.tts
 * accepts. A value that is not a finite number speaks at the normal rate.
 */
export function systemVoiceRate(speed: number): number {
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return 1;
  return Math.min(SYSTEM_RATE_MAX, Math.max(SYSTEM_RATE_MIN, speed));
}

/** The accent of the chosen Kokoro voice: `b*` voices are British, the rest American. */
export function systemVoiceLang(kokoroVoice: string | undefined | null): 'en-US' | 'en-GB' {
  return typeof kokoroVoice === 'string' && kokoroVoice.startsWith('b') ? 'en-GB' : 'en-US';
}

function normaliseLang(lang: string | undefined): string {
  return (lang ?? '').replace(/_/g, '-').toLowerCase();
}

/**
 * macOS sound-effect voices that report en-US but do not read text as speech
 * (they sing, whisper or ring). Never picked as the fallback voice.
 */
const NOVELTY_VOICES = new Set(
  [
    'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Deranged', 'Good News',
    'Hysterical', 'Jester', 'Organ', 'Pipe Organ', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox',
  ].map(name => name.toLowerCase())
);

/**
 * A voice that speaks on this computer: not remote (a remote voice sends the
 * text to a server, which PRIVACY.md rules out) and not a novelty voice.
 */
function isLocalSpeechVoice(v: chrome.tts.TtsVoice): v is chrome.tts.TtsVoice & { voiceName: string } {
  return (
    v.remote !== true &&
    typeof v.voiceName === 'string' &&
    v.voiceName.length > 0 &&
    !NOVELTY_VOICES.has(v.voiceName.toLowerCase())
  );
}

/**
 * The voice to ask chrome.tts for: the first local (non-remote) voice whose
 * language is exactly `lang`, skipping the macOS novelty voices. Undefined
 * when no local voice speaks that language. chrome.tts lists the system's
 * default voice first, so for the user's own language this is usually the
 * voice they chose in System Settings.
 */
export function pickSystemVoice(
  voices: readonly chrome.tts.TtsVoice[] | undefined | null,
  lang: string
): string | undefined {
  const want = normaliseLang(lang);
  return (voices ?? []).find(v => isLocalSpeechVoice(v) && normaliseLang(v.lang) === want)?.voiceName;
}

/**
 * The chrome.tts options for speaking with the given Kokoro voice and speed:
 * a local voice of the Kokoro voice's accent, else the default voice, taken
 * as the first local voice listed (the system default) so that Chrome is
 * never left to choose a remote one. Null when voices were listed and none of
 * them is local: speaking would send the text off this computer, so the
 * fallback fails instead. An empty or unreadable list leaves the choice to
 * chrome.tts (on macOS its voices are the system's own).
 */
export function systemVoiceOptions(
  kokoroVoice: string,
  speed: number,
  voices: readonly chrome.tts.TtsVoice[] | undefined | null
): Pick<chrome.tts.TtsOptions, 'rate' | 'lang' | 'voiceName' | 'enqueue'> | null {
  const base = {
    rate: systemVoiceRate(speed),
    // A new request replaces whatever the system voice is saying.
    enqueue: false,
  };
  const lang = systemVoiceLang(kokoroVoice);
  const accentVoice = pickSystemVoice(voices, lang);
  if (accentVoice) return { ...base, voiceName: accentVoice, lang };
  const defaultVoice = (voices ?? []).find(isLocalSpeechVoice)?.voiceName;
  if (defaultVoice) return { ...base, voiceName: defaultVoice };
  if (voices && voices.length > 0) return null;
  return base;
}

/**
 * The system-voice fallback (OD-2): engine selection, speed -> rate mapping,
 * voice choice, the chrome.tts engine (start, end, errors, stop, supersede)
 * and the "When the helper isn't running" setting.
 */

import { describe, test, expect, mock, beforeEach, afterAll } from 'bun:test';
import {
  DEFAULT_HELPER_UNAVAILABLE_ACTION,
  HELPER_SETUP_NOTICE,
  HELPER_SETUP_URL,
  SYSTEM_RATE_MAX,
  SYSTEM_RATE_MIN,
  engineLabel,
  isHelperUnavailableAction,
  pickSystemVoice,
  shouldUseSystemVoice,
  systemVoiceLang,
  systemVoiceOptions,
  systemVoiceRate,
} from '../src/shared/system-voice';
import { HelperError, isHelperUnavailable } from '../src/shared/helper-errors';
import {
  ConfigNotFoundError,
  HelperNotFoundError,
  InvalidResponseError,
  NetworkTimeoutError,
  RequestAbortedError,
} from '../src/shared/types';
import { DEFAULT_SETTINGS, validateSettings } from '../src/shared/settings-defaults';
import {
  SYSTEM_VOICE_ERROR,
  isSystemVoiceSpeaking,
  speakWithSystemVoice,
  stopSystemVoice,
} from '../src/background/system-voice-engine';

const MAC_VOICES: chrome.tts.TtsVoice[] = [
  { voiceName: 'Bad News', lang: 'en-US', remote: false },
  { voiceName: 'Google US English', lang: 'en-US', remote: true },
  { voiceName: 'Samantha', lang: 'en-US', remote: false },
  { voiceName: 'Thomas', lang: 'fr-FR', remote: false },
  { voiceName: 'Daniel', lang: 'en_GB', remote: false },
];

describe('engine selection: only an unreachable helper falls back', () => {
  test('discovery found nothing / connection refused -> system voice', () => {
    expect(shouldUseSystemVoice(new HelperNotFoundError(), 'system-voice')).toBe(true);
    expect(shouldUseSystemVoice(new ConfigNotFoundError('Native TTS Helper not found on ports: 8249'), 'system-voice')).toBe(true);
  });

  test('the helper answers that its engine is gone (helper_down) -> system voice', () => {
    expect(shouldUseSystemVoice(new HelperError('helper_down', 503, 'process not running'), 'system-voice')).toBe(true);
  });

  test('a 4xx for bad input, a timeout, a bad response or an abort -> no fallback', () => {
    for (const error of [
      new HelperError('unknown_voice', 400),
      new HelperError('text_too_long', 400),
      new HelperError('warmup_timeout', 503),
      new NetworkTimeoutError(),
      new InvalidResponseError(),
      new RequestAbortedError(),
      new Error('Speed must be between 0.5 and 2.0'),
      'not an error',
    ]) {
      expect(isHelperUnavailable(error)).toBe(false);
      expect(shouldUseSystemVoice(error, 'system-voice')).toBe(false);
    }
  });

  test('"Show an error" never falls back', () => {
    expect(shouldUseSystemVoice(new HelperNotFoundError(), 'error')).toBe(false);
    expect(shouldUseSystemVoice(new HelperError('helper_down', 503), 'error')).toBe(false);
  });
});

describe('speed -> chrome.tts rate', () => {
  test('the Kokoro speeds carry over unchanged', () => {
    for (const speed of [0.5, 0.8, 1, 1.25, 2]) expect(systemVoiceRate(speed)).toBe(speed);
  });

  test('clamped to what chrome.tts accepts (0.1 to 10)', () => {
    expect(SYSTEM_RATE_MIN).toBe(0.1);
    expect(SYSTEM_RATE_MAX).toBe(10);
    expect(systemVoiceRate(0)).toBe(0.1);
    expect(systemVoiceRate(-3)).toBe(0.1);
    expect(systemVoiceRate(25)).toBe(10);
  });

  test('a non-number speaks at the normal rate', () => {
    expect(systemVoiceRate(Number.NaN)).toBe(1);
    expect(systemVoiceRate(Number.POSITIVE_INFINITY)).toBe(1);
    expect(systemVoiceRate('fast' as unknown as number)).toBe(1);
  });
});

describe('voice choice', () => {
  test('the Kokoro voice prefix picks the language: b* British, everything else American', () => {
    expect(systemVoiceLang('bf_emma')).toBe('en-GB');
    expect(systemVoiceLang('bm_george')).toBe('en-GB');
    expect(systemVoiceLang('af_heart')).toBe('en-US');
    expect(systemVoiceLang('am_michael')).toBe('en-US');
    expect(systemVoiceLang(undefined)).toBe('en-US');
  });

  test('the first local voice of that language, skipping remote and novelty voices', () => {
    expect(pickSystemVoice(MAC_VOICES, 'en-US')).toBe('Samantha');
  });

  test('language tags match across "_" and "-" and case', () => {
    expect(pickSystemVoice(MAC_VOICES, 'en-GB')).toBe('Daniel');
    expect(pickSystemVoice([{ voiceName: 'Kate', lang: 'EN-gb' }], 'en-GB')).toBe('Kate');
  });

  test('no local voice of that language -> undefined (the default voice)', () => {
    expect(pickSystemVoice([{ voiceName: 'Google UK English Female', lang: 'en-GB', remote: true }], 'en-GB')).toBeUndefined();
    expect(pickSystemVoice([], 'en-US')).toBeUndefined();
    expect(pickSystemVoice(undefined, 'en-US')).toBeUndefined();
  });

  test('options: rate, no queueing, and the accent\'s voice with its lang', () => {
    expect(systemVoiceOptions('bf_emma', 1.5, MAC_VOICES)).toEqual({ rate: 1.5, enqueue: false, voiceName: 'Daniel', lang: 'en-GB' });
  });

  test('no local voice of the accent: the default voice, taken as the first LOCAL voice (never a remote one)', () => {
    const voices = [
      { voiceName: 'Google UK English Male', lang: 'en-GB', remote: true },
      { voiceName: 'Zarvox', lang: 'en-US', remote: false },
      { voiceName: 'Thomas', lang: 'fr-FR', remote: false },
    ];
    expect(systemVoiceOptions('bm_george', 1, voices)).toEqual({ rate: 1, enqueue: false, voiceName: 'Thomas' });
  });

  test('only remote voices: no options (the text must not leave this computer)', () => {
    expect(systemVoiceOptions('af_heart', 1, [{ voiceName: 'Google US English', lang: 'en-US', remote: true }])).toBeNull();
  });

  test('an empty or unreadable voice list leaves the choice to chrome.tts', () => {
    expect(systemVoiceOptions('af_heart', 0.5, [])).toEqual({ rate: 0.5, enqueue: false });
    expect(systemVoiceOptions('af_heart', 0.5, undefined)).toEqual({ rate: 0.5, enqueue: false });
  });

  test('labels for the popup', () => {
    expect(engineLabel('kokoro', 'af_bella')).toBe('Kokoro · Bella (US)');
    expect(engineLabel('kokoro', 'bf_emma')).toBe('Kokoro · Emma (UK)');
    expect(engineLabel('kokoro')).toBe('Kokoro');
    expect(engineLabel('system', 'af_bella')).toBe('System voice');
    expect(HELPER_SETUP_NOTICE).toBe('Install the free Natural TTS helper for natural Kokoro voices:');
    expect(HELPER_SETUP_URL).toBe('https://github.com/renchris/natural-text-to-voice-extension#install');
  });
});

describe('the "When the helper isn\'t running" setting', () => {
  test('defaults to system voices', () => {
    expect(DEFAULT_HELPER_UNAVAILABLE_ACTION).toBe('system-voice');
    expect(DEFAULT_SETTINGS.whenHelperUnavailable).toBe('system-voice');
    expect(validateSettings({}).whenHelperUnavailable).toBe('system-voice');
  });

  test('keeps a valid choice and drops anything else', () => {
    expect(validateSettings({ whenHelperUnavailable: 'error' }).whenHelperUnavailable).toBe('error');
    expect(validateSettings({ whenHelperUnavailable: 'system-voice' }).whenHelperUnavailable).toBe('system-voice');
    expect(validateSettings({ whenHelperUnavailable: 'loud' as never }).whenHelperUnavailable).toBe('system-voice');
    expect(isHelperUnavailableAction('error')).toBe(true);
    expect(isHelperUnavailableAction(undefined)).toBe(false);
  });
});

// ---- the chrome.tts engine, against a mocked chrome.tts

type TtsMode = 'start' | 'no-start-event' | 'reject' | 'error-event';
let ttsMode: TtsMode = 'start';
let voices: chrome.tts.TtsVoice[] = MAC_VOICES;
let lastOnEvent: ((event: chrome.tts.TtsEvent) => void) | null = null;
const speak = mock(async (_text: string, options: chrome.tts.TtsOptions) => {
  lastOnEvent = options.onEvent ?? null;
  if (ttsMode === 'reject') throw new Error('Invalid voice');
  if (ttsMode === 'error-event') options.onEvent?.({ type: 'error', errorMessage: 'synth failed' });
  if (ttsMode === 'start') queueMicrotask(() => options.onEvent?.({ type: 'start', charIndex: 0 }));
});
const stop = mock(() => {
  const onEvent = lastOnEvent;
  lastOnEvent = null;
  onEvent?.({ type: 'interrupted' });
});
const getVoices = mock(async () => voices);
const sendMessage = mock(async (_message: unknown) => undefined);
const savedChrome = (globalThis as any).chrome;

function activity(): unknown[] {
  return sendMessage.mock.calls.map(call => call[0]).filter((m: any) => m?.type === 'OFFSCREEN_ACTIVITY');
}

beforeEach(() => {
  (globalThis as any).chrome = { tts: { speak, stop, getVoices }, runtime: { sendMessage } };
  ttsMode = 'start';
  voices = MAC_VOICES;
  lastOnEvent = null;
  speak.mockClear();
  stop.mockClear();
  getVoices.mockClear();
  sendMessage.mockClear();
});

afterAll(() => {
  if (savedChrome === undefined) delete (globalThis as any).chrome;
  else (globalThis as any).chrome = savedChrome;
});

describe('system-voice engine (chrome.tts)', () => {
  test('speaks the text at the mapped rate with a matching local voice; start, then end', async () => {
    const onFinished = mock((_outcome: unknown) => {});
    const response = await speakWithSystemVoice('Read this aloud', 'bf_emma', 1.5, { onFinished });

    expect(response).toEqual({ type: 'SPEAK_STARTED', success: true, engine: 'system' });
    expect(speak).toHaveBeenCalledTimes(1);
    const [text, options] = speak.mock.calls[0]!;
    expect(text).toBe('Read this aloud');
    expect({ ...options, onEvent: undefined }).toEqual({ rate: 1.5, enqueue: false, voiceName: 'Daniel', lang: 'en-GB', onEvent: undefined });
    expect(isSystemVoiceSpeaking()).toBe(true);
    expect(activity()).toEqual([{ type: 'OFFSCREEN_ACTIVITY', speaking: true, engine: 'system' }]);

    lastOnEvent!({ type: 'end' });
    expect(onFinished.mock.calls).toEqual([[{ success: true }]]);
    expect(isSystemVoiceSpeaking()).toBe(false);
    expect(activity()).toEqual([
      { type: 'OFFSCREEN_ACTIVITY', speaking: true, engine: 'system' },
      { type: 'OFFSCREEN_ACTIVITY', speaking: false, engine: 'system' },
    ]);
  });

  test('no local voice for the accent: the first local voice, without a lang', async () => {
    voices = [{ voiceName: 'Samantha', lang: 'en-US' }];
    await speakWithSystemVoice('Hello', 'bm_george', 1);
    const options = speak.mock.calls[0]![1];
    expect(options.voiceName).toBe('Samantha');
    expect(options.lang).toBeUndefined();
    lastOnEvent!({ type: 'end' });
  });

  test('only remote voices: an error, and nothing is spoken', async () => {
    voices = [{ voiceName: 'Google US English', lang: 'en-US', remote: true }];
    const response = await speakWithSystemVoice('Hello', 'af_heart', 1);
    expect(response).toEqual({ type: 'SPEAK_ERROR', success: false, error: SYSTEM_VOICE_ERROR, engine: 'system' });
    expect(speak).not.toHaveBeenCalled();
  });

  test('getVoices failing still speaks, with the default voice', async () => {
    getVoices.mockImplementationOnce(async () => { throw new Error('no voices'); });
    expect((await speakWithSystemVoice('Hello', 'af_heart', 1)).type).toBe('SPEAK_STARTED');
    expect(speak.mock.calls[0]![1].voiceName).toBeUndefined();
    lastOnEvent!({ type: 'end' });
  });

  test('a voice that never sends "start" still counts as started once speak() accepted it', async () => {
    ttsMode = 'no-start-event';
    expect((await speakWithSystemVoice('Hello', 'af_heart', 1)).type).toBe('SPEAK_STARTED');
    lastOnEvent!({ type: 'end' });
  });

  test('speak() rejecting is an error, before anything started', async () => {
    ttsMode = 'reject';
    const response = await speakWithSystemVoice('Hello', 'af_heart', 1);
    expect(response).toEqual({ type: 'SPEAK_ERROR', success: false, error: SYSTEM_VOICE_ERROR, engine: 'system' });
    expect(isSystemVoiceSpeaking()).toBe(false);
    expect(activity()).toEqual([]);
  });

  test('an error event before the start is an error', async () => {
    ttsMode = 'error-event';
    expect((await speakWithSystemVoice('Hello', 'af_heart', 1)).type).toBe('SPEAK_ERROR');
  });

  test('an error event after the start is reported through onFinished', async () => {
    const onFinished = mock((_outcome: unknown) => {});
    await speakWithSystemVoice('Hello', 'af_heart', 1, { onFinished });
    lastOnEvent!({ type: 'error', errorMessage: 'audio device lost' });
    expect(onFinished.mock.calls).toEqual([[{ success: false, error: SYSTEM_VOICE_ERROR }]]);
  });

  test('no chrome.tts, or no text: an error without calling speak()', async () => {
    expect((await speakWithSystemVoice('   ', 'af_heart', 1)).type).toBe('SPEAK_ERROR');
    (globalThis as any).chrome = { runtime: { sendMessage } };
    expect((await speakWithSystemVoice('Hello', 'af_heart', 1)).type).toBe('SPEAK_ERROR');
    expect(speak).not.toHaveBeenCalled();
  });

  test('stop: chrome.tts.stop, the speech settles as stopped at once', async () => {
    const onFinished = mock((_outcome: unknown) => {});
    await speakWithSystemVoice('Hello', 'af_heart', 1, { onFinished });
    expect(stopSystemVoice()).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls).toEqual([[{ success: true, stopped: true }]]);
    expect(isSystemVoiceSpeaking()).toBe(false);
  });

  test('stop with nothing of ours speaking still silences chrome.tts and reports false', () => {
    expect(stopSystemVoice()).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('a stop that lands while the voices are listed: nothing is spoken', async () => {
    let stopped = false;
    getVoices.mockImplementationOnce(async () => { stopped = true; return MAC_VOICES; });
    const response = await speakWithSystemVoice('Hello', 'af_heart', 1, { isStopped: () => stopped });
    expect(response).toEqual({ type: 'SPEAK_STOPPED', success: true, engine: 'system' });
    expect(speak).not.toHaveBeenCalled();
  });

  test('a new request supersedes the one speaking', async () => {
    const first = mock((_outcome: unknown) => {});
    await speakWithSystemVoice('First', 'af_heart', 1, { onFinished: first });
    await speakWithSystemVoice('Second', 'af_heart', 1);
    expect(first.mock.calls).toEqual([[{ success: true, stopped: true }]]);
    expect(speak.mock.calls.map(call => call[0])).toEqual(['First', 'Second']);
    expect(isSystemVoiceSpeaking()).toBe(true);
    lastOnEvent!({ type: 'end' });
    expect(isSystemVoiceSpeaking()).toBe(false);
  });
});

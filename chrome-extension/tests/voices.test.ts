/**
 * The voice catalogue (IN-11) and the settings validation built on it.
 */

import { describe, test, expect } from 'bun:test';
import {
  DEFAULT_VOICE,
  VOICE_CATALOGUE,
  VOICE_GROUPS,
  VOICE_IDS,
  findVoice,
  groupLabel,
  groupVoiceIds,
  isCatalogueVoice,
  resolveVoice,
  voiceLabel,
  voiceLongLabel,
} from '../src/shared/voices';
import { DEFAULT_SETTINGS, VOICE_NAMES, validateSettings } from '../src/shared/settings-defaults';

// The helper's catalogue, IN-06, in its order (Kokoro grade sheet).
const IN06 = {
  'American Female': ['af_heart', 'af_bella', 'af_nicole', 'af_aoede', 'af_kore', 'af_sarah', 'af_alloy', 'af_nova', 'af_sky', 'af_jessica', 'af_river'],
  'American Male': ['am_fenrir', 'am_michael', 'am_puck', 'am_echo', 'am_eric', 'am_liam', 'am_onyx', 'am_santa', 'am_adam'],
  'British Female': ['bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily'],
  'British Male': ['bm_fable', 'bm_george', 'bm_lewis', 'bm_daniel'],
};

describe('voice catalogue', () => {
  test('has exactly the 28 IN-06 voices, in IN-06 order', () => {
    expect(VOICE_IDS).toEqual(Object.values(IN06).flat());
    expect(new Set(VOICE_IDS).size).toBe(28);
  });

  test('every group matches IN-06 and the group labels are in display order', () => {
    expect(VOICE_GROUPS.map(g => g.label)).toEqual(Object.keys(IN06));
    const grouped = groupVoiceIds(VOICE_IDS);
    expect(Object.fromEntries(grouped.map(g => [g.group.label, g.voices.map(v => v.id)]))).toEqual(IN06);
  });

  test('a* voices are US and b* voices are UK; the second letter is the gender', () => {
    for (const v of VOICE_CATALOGUE) {
      expect(v.accent).toBe(v.id.startsWith('a') ? 'US' : 'UK');
      expect(v.gender).toBe(v.id[1] === 'f' ? 'female' : 'male');
      expect(groupLabel(v)).toBe(`${v.accent === 'US' ? 'American' : 'British'} ${v.gender === 'female' ? 'Female' : 'Male'}`);
    }
  });

  test('af_sarah is American, not "(UK)" (C1 D9)', () => {
    expect(voiceLabel('af_sarah')).toBe('Sarah (US)');
    expect(voiceLongLabel('af_sarah')).toBe('Sarah (Female, US)');
  });

  test('every voice has a name and a Kokoro grade', () => {
    for (const v of VOICE_CATALOGUE) {
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.grade).toMatch(/^[A-F][+-]?$/);
    }
    expect(findVoice('af_heart')?.grade).toBe('A');
    expect(findVoice('af_bella')?.grade).toBe('A-');
    expect(findVoice('am_adam')?.grade).toBe('F+');
    expect(findVoice('bf_emma')?.grade).toBe('B-');
  });

  test('the default stays af_bella (OD-5 pending) and is a catalogue voice', () => {
    expect(DEFAULT_VOICE).toBe('af_bella');
    expect(isCatalogueVoice(DEFAULT_VOICE)).toBe(true);
    expect(DEFAULT_SETTINGS.selectedVoice).toBe(DEFAULT_VOICE);
  });

  test('ids outside the catalogue are dropped from groups', () => {
    const grouped = groupVoiceIds(['zz_nope', 'bm_george', 'jf_alpha']);
    expect(grouped.map(g => [g.group.label, g.voices.map(v => v.id)])).toEqual([['British Male', ['bm_george']]]);
  });
});

describe('resolveVoice', () => {
  const oldHelper = ['af_bella', 'af_sarah', 'af_nicole', 'af_sky', 'am_adam', 'am_michael'];

  test('keeps a stored catalogue voice', () => {
    expect(resolveVoice('bm_george')).toBe('bm_george');
    expect(resolveVoice('am_adam', oldHelper)).toBe('am_adam');
  });

  test('replaces a non-catalogue or missing voice with the default', () => {
    expect(resolveVoice('zz_nope')).toBe('af_bella');
    expect(resolveVoice(undefined)).toBe('af_bella');
    expect(resolveVoice(42)).toBe('af_bella');
  });

  test('a stored voice the helper does not offer falls back to the default, then the first offered', () => {
    expect(resolveVoice('af_heart', oldHelper)).toBe('af_bella');
    expect(resolveVoice('af_heart', ['bm_george', 'bf_emma'])).toBe('bf_emma');
  });
});

describe('settings validation against the catalogue', () => {
  test('accepts any catalogue voice, not only the old six', () => {
    for (const id of ['af_heart', 'bf_emma', 'bm_george', 'am_santa']) {
      expect(validateSettings({ selectedVoice: id }).selectedVoice).toBe(id);
    }
  });

  test('rejects a voice outside the catalogue', () => {
    expect(validateSettings({ selectedVoice: 'zz_nope' }).selectedVoice).toBe('af_bella');
  });

  test('VOICE_NAMES is derived from the catalogue', () => {
    expect(Object.keys(VOICE_NAMES)).toEqual([...VOICE_IDS]);
    expect(VOICE_NAMES['bm_george']).toBe('George (Male, UK)');
    expect(VOICE_NAMES['af_sarah']).toBe('Sarah (Female, US)');
  });
});

/**
 * The 28 English Kokoro-82M voices, mirroring the helper's catalogue (IN-06).
 *
 * This is the single source of voice labels and of which voice IDs the
 * extension accepts. Order and grades follow Kokoro's own grade sheet
 * (hexgrad/Kokoro-82M VOICES.md): within each group, best graded first.
 * `a*` voices are American English, `b*` British English.
 */

export type VoiceAccent = 'US' | 'UK';
export type VoiceGender = 'female' | 'male';

export interface CatalogueVoice {
  id: string;
  name: string;
  accent: VoiceAccent;
  gender: VoiceGender;
  /** Overall grade from Kokoro's VOICES.md, e.g. 'A', 'B-', 'F+' */
  grade: string;
}

/**
 * The default voice for a fresh install: af_heart, Kokoro's best graded
 * voice (OD-5, 2026-09-23). A voice the user already chose stays theirs:
 * only an absent or invalid stored choice falls back to this. An install
 * updated from before 1.5 with no stored voice keeps af_bella, the default it
 * was using (pinPreviousDefaultVoice, settings-defaults.ts). Change it here
 * and nowhere else.
 */
export const DEFAULT_VOICE = 'af_heart';

function voice(id: string, name: string, grade: string): CatalogueVoice {
  return {
    id,
    name,
    accent: id.startsWith('b') ? 'UK' : 'US',
    gender: id[1] === 'm' ? 'male' : 'female',
    grade,
  };
}

export const VOICE_CATALOGUE: readonly CatalogueVoice[] = [
  // American female
  voice('af_heart', 'Heart', 'A'),
  voice('af_bella', 'Bella', 'A-'),
  voice('af_nicole', 'Nicole', 'B-'),
  voice('af_aoede', 'Aoede', 'C+'),
  voice('af_kore', 'Kore', 'C+'),
  voice('af_sarah', 'Sarah', 'C+'),
  voice('af_alloy', 'Alloy', 'C'),
  voice('af_nova', 'Nova', 'C'),
  voice('af_sky', 'Sky', 'C-'),
  voice('af_jessica', 'Jessica', 'D'),
  voice('af_river', 'River', 'D'),
  // American male
  voice('am_fenrir', 'Fenrir', 'C+'),
  voice('am_michael', 'Michael', 'C+'),
  voice('am_puck', 'Puck', 'C+'),
  voice('am_echo', 'Echo', 'D'),
  voice('am_eric', 'Eric', 'D'),
  voice('am_liam', 'Liam', 'D'),
  voice('am_onyx', 'Onyx', 'D'),
  voice('am_santa', 'Santa', 'D-'),
  voice('am_adam', 'Adam', 'F+'),
  // British female
  voice('bf_emma', 'Emma', 'B-'),
  voice('bf_isabella', 'Isabella', 'C'),
  voice('bf_alice', 'Alice', 'D'),
  voice('bf_lily', 'Lily', 'D'),
  // British male
  voice('bm_fable', 'Fable', 'C'),
  voice('bm_george', 'George', 'C'),
  voice('bm_lewis', 'Lewis', 'D+'),
  voice('bm_daniel', 'Daniel', 'D'),
];

export interface VoiceGroup {
  accent: VoiceAccent;
  gender: VoiceGender;
  label: string;
}

/** The four groups, in display order. */
export const VOICE_GROUPS: readonly VoiceGroup[] = [
  { accent: 'US', gender: 'female', label: 'American Female' },
  { accent: 'US', gender: 'male', label: 'American Male' },
  { accent: 'UK', gender: 'female', label: 'British Female' },
  { accent: 'UK', gender: 'male', label: 'British Male' },
];

const BY_ID = new Map(VOICE_CATALOGUE.map(v => [v.id, v]));

export const VOICE_IDS: readonly string[] = VOICE_CATALOGUE.map(v => v.id);

export function findVoice(id: string | undefined | null): CatalogueVoice | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function isCatalogueVoice(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/** "Bella (US)"; an unknown ID is returned as-is. */
export function voiceLabel(id: string): string {
  const v = BY_ID.get(id);
  return v ? `${v.name} (${v.accent})` : id;
}

/** "Bella (Female, US)"; an unknown ID is returned as-is. */
export function voiceLongLabel(id: string): string {
  const v = BY_ID.get(id);
  if (!v) return id;
  return `${v.name} (${v.gender === 'female' ? 'Female' : 'Male'}, ${v.accent})`;
}

export function groupLabel(v: CatalogueVoice): string {
  return VOICE_GROUPS.find(g => g.accent === v.accent && g.gender === v.gender)!.label;
}

/**
 * Group the given voice IDs by accent and gender, in catalogue order. IDs
 * outside the catalogue are dropped: the extension never offers a voice it
 * would refuse to store.
 */
export function groupVoiceIds(ids: Iterable<string>): Array<{ group: VoiceGroup; voices: CatalogueVoice[] }> {
  const wanted = new Set(ids);
  return VOICE_GROUPS.map(group => ({
    group,
    voices: VOICE_CATALOGUE.filter(
      v => wanted.has(v.id) && v.accent === group.accent && v.gender === group.gender
    ),
  })).filter(entry => entry.voices.length > 0);
}

/**
 * The voice to use given what is stored and what the helper offers: the
 * stored voice if it is valid and offered, else the default if offered, else
 * the first offered catalogue voice. With no helper list, only catalogue
 * validity is checked.
 */
export function resolveVoice(stored: unknown, offered?: readonly string[]): string {
  const offeredSet = offered ? new Set(offered.filter(isCatalogueVoice)) : null;
  const usable = (id: string) => isCatalogueVoice(id) && (!offeredSet || offeredSet.has(id));
  if (typeof stored === 'string' && usable(stored)) return stored;
  if (usable(DEFAULT_VOICE)) return DEFAULT_VOICE;
  const first = offeredSet ? VOICE_IDS.find(id => offeredSet.has(id)) : undefined;
  return first ?? DEFAULT_VOICE;
}

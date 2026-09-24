// Chapter list and captions for the YouTube master, from the take's own timeline (GUI_PASS.md item 4).
//
// Usage: node scripts/capture/youtube-meta.mjs <master-timeline.json> <out-dir>
//
//   <master-timeline.json> is written by the person assembling the master, from the cut points they used:
//     { "duration": 44.2,                                   // seconds, ffprobe of the finished master
//       "clips":    [ { "id": "s1-rightclick", "at": 5.93 }, … ],   // when each clip's WAV starts in the master
//       "chapters": [ { "at": 0, "title": "Select text, right-click, listen" }, … ] }
//   Clip ids are the ids in assets/media/src/selections.json; "at" is where the WAV itself starts (the adelay the
//   mux used), not where the speech starts: each clip opens with ~0.3 s of silence, measured here from the WAV.
//
// Writes <out-dir>/chapters.txt (the lines to paste under "Chapters" in the description) and
// <out-dir>/youtube-master.srt (one caption per sentence, the exact text of each clip, timed by its share of the
// clip's speech). Refuses a chapter list YouTube would ignore: the first must start at 0:00, there must be at
// least three, and each must last at least 10 s (the rule docs/publishing/YOUTUBE.md states). Exit 1 on any breach.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [inPath, outDir] = process.argv.slice(2);
if (!inPath || !outDir) { console.error('usage: node youtube-meta.mjs <master-timeline.json> <out-dir>'); process.exit(64); }
const AUDIO = join(dirname(fileURLToPath(import.meta.url)), '../../assets/media/src/audio');
const SEL = join(AUDIO, '../selections.json');
const tl = JSON.parse(readFileSync(inPath, 'utf8'));
const texts = Object.fromEntries(JSON.parse(readFileSync(SEL, 'utf8')).selections.map((s) => [s.id, s.text]));
const fail = (m) => { console.error(`youtube-meta: ${m}`); process.exit(1); };

// Speech onset and end of a 16-bit mono PCM WAV (the helper's format): the first and last sample above -40 dBFS.
function speechSpan(file) {
  const b = readFileSync(file);
  let off = 12, data = null, rate = 24000;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(off + 12);
    if (id === 'data') { data = b.subarray(off + 8, off + 8 + size); break; }
    off += 8 + size + (size % 2);
  }
  if (!data) fail(`${file}: no data chunk`);
  const n = data.length / 2, th = 32768 * 0.01;
  let first = 0, last = n - 1;
  while (first < n && Math.abs(data.readInt16LE(first * 2)) < th) first++;
  while (last > first && Math.abs(data.readInt16LE(last * 2)) < th) last--;
  return { start: first / rate, end: (last + 1) / rate };
}

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const srtTime = (t) => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};

// Chapters, with YouTube's three rules.
const ch = [...(tl.chapters ?? [])].sort((a, b) => a.at - b.at);
if (!(tl.duration > 0)) fail('"duration" (seconds) is required');
if (ch.length < 3) fail(`YouTube needs at least 3 chapters, got ${ch.length}`);
if (ch[0].at !== 0) fail('the first chapter must start at 0:00');
ch.forEach((c, i) => {
  const end = i + 1 < ch.length ? ch[i + 1].at : tl.duration;
  if (end - c.at < 10) fail(`chapter ${i + 1} "${c.title}" lasts ${(end - c.at).toFixed(1)} s; YouTube needs 10 s`);
  if (/[<>]/.test(c.title)) fail(`chapter ${i + 1}: YouTube rejects < and > in descriptions`);
});
const chapters = ch.map((c) => `${mmss(c.at)} ${c.title}`).join('\n') + '\n';

// Captions: each clip's exact text, one cue per sentence, timed by character share of the clip's speech.
const cues = [];
for (const c of tl.clips ?? []) {
  const text = texts[c.id];
  if (!text) fail(`clip "${c.id}" is not in selections.json`);
  const span = speechSpan(join(AUDIO, `${c.id}.wav`));
  const start = c.at + span.start, end = c.at + span.end;
  if (end > tl.duration + 0.05) fail(`clip "${c.id}" runs to ${end.toFixed(2)} s, past the end of the master`);
  const sentences = text.match(/[^.!?]+[.!?]+["”’]?\s*/g)?.map((s) => s.trim()) ?? [text];
  const total = sentences.reduce((a, s) => a + s.length, 0);
  let t = start;
  for (const s of sentences) {
    const d = ((end - start) * s.length) / total;
    cues.push({ from: t, to: t + d, text: s });
    t += d;
  }
}
cues.sort((a, b) => a.from - b.from);
const srt = cues.map((q, i) => `${i + 1}\n${srtTime(q.from)} --> ${srtTime(q.to)}\n${q.text}\n`).join('\n');

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'chapters.txt'), chapters);
writeFileSync(join(outDir, 'youtube-master.srt'), srt);
console.log(`chapters.txt: ${ch.length} chapters, ok for YouTube\nyoutube-master.srt: ${cues.length} cues from ${(tl.clips ?? []).length} clips`);

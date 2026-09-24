// Remove idle time from a terminal recording and encode it as a lossless animated WebP.
//
// Usage: node retime.mjs <in.gif> <out.webp> [--fps 25] [--idle 120] [--hold 6000]
//
//   Decodes <in.gif> to constant-rate PNG frames (ffmpeg), merges runs of identical frames (by content hash), and
//   caps every run at --idle ms, except the last, which is held for --hold ms before the loop restarts. Frames are
//   never edited: the result shows every distinct screen the recording showed, in order, with waits shortened.
//   Encodes with img2webp (lossless, -min_size), the flat-terminal recipe of the demo-recording skill.
import { readdirSync, readFileSync, mkdtempSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const [inGif, out, ...rest] = process.argv.slice(2);
if (!inGif || !out) { console.error('usage: node retime.mjs <in.gif> <out.webp> [--fps 25] [--idle 120] [--hold 6000]'); process.exit(64); }
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return Number(i === -1 ? d : rest[i + 1]); };
const fps = opt('fps', 25);
const idle = opt('idle', 120);
const hold = opt('hold', 6000);
const step = 1000 / fps;

const work = mkdtempSync(join(tmpdir(), 'ntts-retime-'));
execFileSync('ffmpeg', ['-v', 'error', '-i', inGif, '-vf', `fps=${fps}`, join(work, '%06d.png')]);
const files = readdirSync(work).filter((f) => f.endsWith('.png')).sort();
const runs = [];
for (const f of files) {
  const path = join(work, f);
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  const last = runs.at(-1);
  if (last && last.hash === hash) last.ms += step; else runs.push({ path, hash, ms: step });
}
const realMs = runs.reduce((a, r) => a + r.ms, 0);
for (const r of runs) r.ms = Math.min(r.ms, idle);
runs.at(-1).ms = hold;
const args = ['-loop', '0', '-min_size', '-m', '4'];
for (const r of runs) args.push('-d', String(Math.round(r.ms)), r.path);
args.push('-o', out);
execFileSync('img2webp', args, { stdio: ['ignore', 'ignore', 'inherit'] });
const total = runs.reduce((a, r) => a + Math.round(r.ms), 0);
console.log(`${out}: ${files.length} frames (${(realMs / 1000).toFixed(1)} s real) -> ${runs.length} distinct, ${(total / 1000).toFixed(1)} s, ${statSync(out).size} bytes; work dir ${work}`);

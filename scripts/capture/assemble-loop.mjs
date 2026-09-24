// Assemble a looping animated WebP from a shoot.mjs screencast, keeping the real frame timing.
//
// Usage: node assemble-loop.mjs <cast-dir> <out.webp> [--from s] [--to s] [--fps 20] [--hold ms] [--lead ms]
//                               [--crop WxH+X+Y] [--scale W]
//
//   Chrome's screencast emits a frame only when something repaints, so frames.json is a variable-rate timeline.
//   This resamples it onto a constant <fps> grid between --from and --to (seconds after the cast started; default:
//   the first and last frame), always showing the latest frame at or before each tick, exactly as the screen did.
//   Consecutive identical frames are merged into one longer frame (webpinfo durations stay exact).
//   --lead holds the first frame for <ms> extra; --hold holds the last frame for <ms> extra before the loop restarts.
//   Encodes lossless (`img2webp -m 6`), so every decoded frame is the captured frame, pixel for pixel. The earlier
//   `-near_lossless 40` let the animation encoder treat near-equal pixels as unchanged between sub-frames, and the
//   drift left a ghost of an earlier frame on screen (measured: "…ing voices…" faint behind "Heart" in every
//   Connected frame of status.webp). Flat UI captures are small lossless anyway (~23 KB for status.webp).
//   Needs img2webp and ImageMagick 7 on PATH.
import { readFileSync, mkdtempSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const [dir, out, ...rest] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: node assemble-loop.mjs <cast-dir> <out.webp> [--from s] [--to s] [--fps n] [--hold ms] [--lead ms] [--crop g] [--scale w]'); process.exit(64); }
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i === -1 ? d : rest[i + 1]; };
const meta = JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8'));
const rel = meta.frames.map((f) => ({ file: f.file, t: f.t - meta.start }));
const from = Number(opt('from', rel[0].t));
const to = Number(opt('to', rel.at(-1).t));
const fps = Number(opt('fps', '20'));
const hold = Number(opt('hold', '0'));
const lead = Number(opt('lead', '0'));
const crop = opt('crop');
const scale = opt('scale');
const step = 1000 / fps;

// Constant-rate resample: the frame on screen at each tick.
const ticks = [];
for (let t = from; t <= to + 1e-9; t += step / 1000) {
  let cur = rel[0];
  for (const f of rel) { if (f.t <= t) cur = f; else break; }
  ticks.push(cur.file);
}
// Optional crop/scale into a work dir, then merge identical neighbours by content hash.
const work = mkdtempSync(join(tmpdir(), 'ntts-loop-'));
const prepared = new Map();
const prep = (file) => {
  if (prepared.has(file)) return prepared.get(file);
  let path = join(dir, file);
  if (crop || scale) {
    const dst = join(work, file);
    const args = [path];
    if (crop) args.push('-crop', crop, '+repage');
    if (scale) args.push('-filter', 'Lanczos', '-resize', `${scale}x`);
    args.push(`PNG24:${dst}`);
    execFileSync('magick', args);
    path = dst;
  }
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  const v = { path, hash };
  prepared.set(file, v);
  return v;
};
const runs = [];
for (const file of ticks) {
  const { path, hash } = prep(file);
  const last = runs.at(-1);
  if (last && last.hash === hash) last.ms += step; else runs.push({ path, hash, ms: step });
}
runs[0].ms += lead;
runs.at(-1).ms += hold;
const args = ['-loop', '0', '-m', '6'];
for (const r of runs) args.push('-d', String(Math.round(r.ms)), r.path);
args.push('-o', out);
execFileSync('img2webp', args, { stdio: ['ignore', 'ignore', 'inherit'] });
const total = runs.reduce((a, r) => a + Math.round(r.ms), 0);
console.log(`${out}: ${runs.length} stored frames (from ${ticks.length} ticks at ${fps} fps), ${total} ms, ${statSync(out).size} bytes`);

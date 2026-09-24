#!/usr/bin/env node
// Generates the demo audio: one WAV per entry in selections.json, made by a real Natural TTS helper that this
// script launches on --port and stops afterwards. It never talks to a helper it did not start, and it always
// passes --port/--python/--worker, so the shared ~/Library/Application Support/NaturalTTS/config.json is never
// read or written. Writes audio/<id>.wav and audio/manifest.json (sha256, duration, voice, speed, identity).
//
//   node assets/media/src/make-audio.mjs --port 18249 [--python <env>/bin/python3] [--worker <tts_worker.py>]
//                                        [--binary <helper>] [--only <id>]
//   node assets/media/src/make-audio.mjs --check   (no helper: texts are verbatim in article.html, and every
//                                                  WAV matches selections.json and its manifest sha256)
//
// Kokoro draws random phase, so a re-run produces audio that sounds the same but is not byte-identical; the
// manifest's sha256 identifies the committed files.

import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const RES = join(REPO, 'native-helper/Sources/NaturalTTSHelper/Resources');
const argv = process.argv.slice(2);
const opt = (n, f) => { const i = argv.indexOf(`--${n}`); return i === -1 ? f : argv[i + 1]; };
const PORT = Number(opt('port', '18249'));
const PYTHON = resolve(opt('python', join(RES, 'python-env/bin/python3')));
const WORKER = resolve(opt('worker', join(RES, 'tts_worker.py')));
const BINARY = resolve(opt('binary', join(REPO, 'native-helper/.build/release/natural-tts-helper')));
const ONLY = opt('only', null);
const BASE = `http://127.0.0.1:${PORT}`;
const OUTDIR = join(HERE, 'audio');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

// Every selection must be text a viewer can actually see on the page: compare against article.html's visible
// text with tags stripped and whitespace collapsed.
const articleText = readFileSync(join(HERE, 'article.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&#9632;/g, ' ').replace(/\s+/g, ' ');
const { selections } = JSON.parse(readFileSync(join(HERE, 'selections.json'), 'utf8'));
for (const s of selections) {
  if (!articleText.includes(s.text)) throw new Error(`selection ${s.id} is not verbatim in article.html: ${s.text}`);
}

function wavSeconds(buf) {
  let off = 12, fmt, data;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') { data = Math.min(size, buf.length - off - 8); break; }
    off += 8 + size + (size % 2);
  }
  return { seconds: data / (fmt.channels * fmt.bits / 8) / fmt.rate, sampleRate: fmt.rate, channels: fmt.channels, bits: fmt.bits };
}

if (argv.includes('--check')) {
  const manifest = JSON.parse(readFileSync(join(OUTDIR, 'manifest.json'), 'utf8'));
  let bad = 0;
  for (const s of selections) {
    const m = manifest.files[`${s.id}.wav`];
    const f = join(OUTDIR, `${s.id}.wav`);
    const why = !m ? 'no manifest entry' : !existsSync(f) ? 'file missing'
      : (m.text !== s.text || m.voice !== s.voice || m.speed !== s.speed) ? 'text/voice/speed differ from selections.json'
      : createHash('sha256').update(readFileSync(f)).digest('hex') !== m.sha256 ? 'sha256 differs from manifest' : null;
    if (why) { console.error(`STALE ${s.id}.wav: ${why}`); bad++; }
  }
  if (bad) process.exit(1);
  console.log(`${selections.length} demo WAVs match selections.json, article.html and manifest.json`);
  process.exit(0);
}

const inUse = await new Promise((r) => { const s = net.connect({ host: '127.0.0.1', port: PORT }); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
if (inUse) throw new Error(`port ${PORT} is in use; choose a free one (this script only uses a helper it starts)`);
for (const p of [PYTHON, WORKER, BINARY]) if (!existsSync(p)) throw new Error(`not found: ${p}`);

const child = spawn(BINARY, ['--port', String(PORT), '--python', PYTHON, '--worker', WORKER], { stdio: 'ignore' });
const stop = () => { try { child.kill('SIGTERM'); } catch { /* already gone */ } };
process.once('SIGINT', () => { stop(); process.exit(130); });
try {
  let health;
  for (let t = Date.now(); Date.now() - t < 120_000; await sleep(100)) {
    try { const r = await fetch(`${BASE}/health`); health = await r.json(); if (health.status === 'ok' && health.model_loaded) break; } catch { /* starting */ }
  }
  if (health?.status !== 'ok') throw new Error('helper did not become ready in 120 s');
  const voices = (await (await fetch(`${BASE}/voices`)).json()).voices?.map((v) => v.id) ?? [];

  const workerSrc = readFileSync(WORKER, 'utf8');
  const identity = {
    generated_at: new Date().toISOString(),
    helper_version: health.version,
    helper_git_sha: sh('git', ['-C', REPO, 'rev-parse', 'HEAD']),
    helper_tree_dirty: (sh('git', ['-C', REPO, 'status', '--porcelain', '--', 'native-helper']) || '') !== '',
    model_id: workerSrc.match(/^MODEL_ID = "([^"]+)"/m)?.[1],
    model_revision: workerSrc.match(/^MODEL_REVISION = "([0-9a-f]{40})"/m)?.[1],
    mlx_audio: sh(PYTHON, ['-c', "import importlib.metadata as m;print(m.version('mlx-audio'))"]),
    mlx: sh(PYTHON, ['-c', "import importlib.metadata as m;print(m.version('mlx'))"]),
    machine: `${sh('sysctl', ['-n', 'machdep.cpu.brand_string'])}, macOS ${sh('sw_vers', ['-productVersion'])}`,
    request: 'POST /speak {"text","voice","speed"} with no Origin header, response body saved unmodified',
  };

  const manifestPath = join(OUTDIR, 'manifest.json');
  const manifest = existsSync(manifestPath) && ONLY ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { files: {} };
  mkdirSync(OUTDIR, { recursive: true });
  for (const s of selections) {
    if (ONLY && s.id !== ONLY) continue;
    if (!voices.includes(s.voice)) throw new Error(`voice ${s.voice} is not offered by this helper`);
    const r = await fetch(`${BASE}/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: s.text, voice: s.voice, speed: s.speed }) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok) throw new Error(`/speak ${s.id}: ${r.status} ${buf.toString('utf8', 0, 200)}`);
    writeFileSync(join(OUTDIR, `${s.id}.wav`), buf);
    const w = wavSeconds(buf);
    manifest.files[`${s.id}.wav`] = {
      id: s.id, voice: s.voice, speed: s.speed, text: s.text,
      seconds: +w.seconds.toFixed(3), sample_rate: w.sampleRate, channels: w.channels, bits: w.bits,
      bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), ...identity,
    };
    console.log(`${s.id}.wav  ${w.seconds.toFixed(2)} s  ${s.voice} ${s.speed}x`);
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  stop();
  await sleep(1500);
}

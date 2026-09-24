#!/usr/bin/env node
// Natural TTS helper benchmark. Launches its OWN helper on a port you choose, measures it, stops it, and
// writes bench/results.json. It never talks to a helper it did not start, and it always passes --port,
// --python and --worker, so the helper never reads or writes the shared
// ~/Library/Application Support/NaturalTTS/config.json.
//
//   node bench/run.mjs --port 18249 [--python <env>/bin/python3] [--worker <tts_worker.py>] [--binary <helper>]
//                      [--voice af_heart] [--speed 1.0] [--runs 5] [--cold-starts 3] [--out bench/results.json]
//                      [--gpu-idle-max 15] [--load-max 12] [--gpu-idle-secs 10] [--wait 300]
//
// What it measures (bench/README.md explains each number):
//   1. launch -> ready: spawn to the first /health that says status "ok" and model_loaded, per cold start.
//   2. first /speak after ready (the short text), per cold start.
//   3. warm synthesis: each text once untimed, then --runs timed requests per text, round-robin across texts.
//      Real-time factor = audio seconds / client wall seconds. Audio seconds come from the WAV header.
//   4. the worker's lifetime peak physical footprint (`footprint`, phys_footprint_peak).
//   5. machine and software identity.
// Node 22+ (global fetch). No dependencies.

import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const RES = join(REPO, 'native-helper/Sources/NaturalTTSHelper/Resources');

// ---------- arguments ----------
const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
  return v;
}
if (argv.includes('-h') || argv.includes('--help')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).join('\n'));
  process.exit(0);
}
const PORT = Number(opt('port', '18249'));
const PYTHON = resolve(opt('python', join(RES, 'python-env/bin/python3')));
const WORKER = resolve(opt('worker', join(RES, 'tts_worker.py')));
const BINARY = resolve(opt('binary', join(REPO, 'native-helper/.build/release/natural-tts-helper')));
const VOICE = opt('voice', 'af_heart');
const SPEED = Number(opt('speed', '1.0'));
const RUNS = Number(opt('runs', '5'));
const COLD_STARTS = Number(opt('cold-starts', '3'));
const OUT = resolve(opt('out', join(HERE, 'results.json')));
const GPU_IDLE_MAX = Number(opt('gpu-idle-max', '15'));
const GPU_WAIT_S = Number(opt('wait', '300'));
const LOAD_MAX = Number(opt('load-max', '12'));
const GPU_IDLE_SECS = Number(opt('gpu-idle-secs', '10'));
const WORK = join(os.tmpdir(), `ntts-bench-${PORT}-${Date.now()}`);
mkdirSync(WORK, { recursive: true });
const BASE = `http://127.0.0.1:${PORT}`;

for (const [what, p] of [['--python', PYTHON], ['--worker', WORKER], ['--binary', BINARY]]) {
  if (!existsSync(p)) throw new Error(`${what} not found: ${p}${what === '--binary' ? ' (run `swift build -c release` in native-helper)' : ''}`);
}
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error(`bad --port ${PORT}`);

const log = (...a) => console.error(`[bench ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now() / 1000;
const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...o }).trim();
const tryShell = (cmd, args, o) => { try { return sh(cmd, args, o); } catch { return null; } };

// ---------- texts: derived from native-helper/examples/sample-texts.json exactly as C2/W2 built them ----------
function buildTexts() {
  const d = JSON.parse(readFileSync(join(REPO, 'native-helper/examples/sample-texts.json'), 'utf8'));
  const c = d.creative;
  const strings = (xs) => xs.map((x) => (typeof x === 'string' ? x : x.text));
  const all = [...d.short, ...d.medium, ...d.long, ...strings(c.dialogue), ...c.poetry, ...c.technical, ...c.storytelling].join(' ');
  const texts = [
    { id: 'S15', label: 'sentence', source: 'medium[1]', text: d.medium[1] },
    { id: 'M60', label: 'paragraph', source: 'long[1] + medium[0]', text: `${d.long[1]} ${d.medium[0]}` },
    {
      id: 'L400', label: 'page', source: 'long[0..2] + technical + storytelling + poetry + medium[0..2]',
      text: [...d.long, ...c.technical, ...c.storytelling, ...c.poetry, ...d.medium.slice(0, 3)].join(' '),
    },
    {
      id: 'X4985', label: 'long article', source: 'short + medium + long + dialogue + poetry + technical + storytelling, repeated, cut to 4,985 chars',
      text: Array(5).fill(all).join(' ').slice(0, 4985),
    },
  ];
  // The helper's per-request limit is 5,000 characters; these lengths are the C2/W2 fixtures.
  const expect = { S15: 123, M60: 408, L400: 2644, X4985: 4985 };
  for (const t of texts) {
    if (t.text.length !== expect[t.id]) throw new Error(`${t.id} is ${t.text.length} chars, expected ${expect[t.id]}: sample-texts.json changed`);
    t.chars = t.text.length;
    t.words = t.text.split(/\s+/).filter(Boolean).length;
    t.sha256 = createHash('sha256').update(t.text).digest('hex');
  }
  return texts;
}

// ---------- WAV header ----------
export function wavInfo(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a RIFF/WAVE body');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bitsPerSample: buf.readUInt16LE(off + 22) };
    if (id === 'data') { data = { declared: size, available: buf.length - off - 8 }; break; }
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV has no fmt or data chunk');
  const bytes = Math.min(data.declared, data.available);
  const frameBytes = fmt.channels * (fmt.bitsPerSample / 8);
  return { ...fmt, dataBytes: bytes, headerMatchesBody: data.declared === data.available, seconds: bytes / frameBytes / fmt.sampleRate };
}

// ---------- probes ----------
function gpuUtil() {
  const out = tryShell('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator']);
  const m = out && out.match(/"Device Utilization %"=(\d+)/);
  return m ? Number(m[1]) : null;
}
function portInUse(port) {
  return new Promise((r) => {
    const s = net.connect({ host: '127.0.0.1', port });
    s.once('connect', () => { s.destroy(); r(true); });
    s.once('error', () => r(false));
  });
}
function footprint(pid) {
  const f = join(WORK, `fp-${pid}-${Date.now()}.json`);
  if (tryShell('footprint', ['-p', String(pid), '-j', f]) === null && !existsSync(f)) return null;
  try {
    const p = JSON.parse(readFileSync(f, 'utf8')).processes.find((x) => x.pid === pid);
    return p ? { current_mb: +(p.auxiliary.phys_footprint / 2 ** 20).toFixed(1), peak_mb: +(p.auxiliary.phys_footprint_peak / 2 ** 20).toFixed(1) } : null;
  } catch { return null; }
}
function workerPid(helperPid) {
  const kids = (tryShell('pgrep', ['-P', String(helperPid)]) || '').split('\n').filter(Boolean).map(Number);
  for (const k of kids) {
    const cmd = tryShell('ps', ['-o', 'command=', '-p', String(k)]) || '';
    if (cmd.includes('tts_worker.py')) return k;
  }
  return null;
}
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const r = (v) => +v.toFixed(4);
  return { median: r(med), min: r(s[0]), max: r(s[n - 1]), n, values: xs.map(r) };
};

// ---------- helper lifecycle (only processes this script spawned) ----------
const live = new Set(); // helpers this script started and has not yet seen exit
const killLive = () => { for (const c of live) c.kill('SIGTERM'); };
process.once('SIGINT', () => { killLive(); process.exit(130); });
process.once('SIGTERM', () => { killLive(); process.exit(143); });
async function launch(tag) {
  if (await portInUse(PORT)) throw new Error(`port ${PORT} is already in use; pick a free one (this script never stops a helper it did not start)`);
  const logFile = join(WORK, `helper-${tag}.log`);
  const fd = openSync(logFile, 'w');
  const t0 = now();
  const child = spawn(BINARY, ['--port', String(PORT), '--python', PYTHON, '--worker', WORKER], { stdio: ['ignore', fd, fd] });
  closeSync(fd);
  live.add(child);
  child.once('exit', () => live.delete(child));
  let exited = null;
  child.once('exit', (code, sig) => { exited = { code, sig }; });
  let health = null;
  while (now() - t0 < 120) {
    if (exited) throw new Error(`helper exited during start (${JSON.stringify(exited)}); log: ${logFile}`);
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) { health = await r.json(); if (health.status === 'ok' && health.model_loaded) break; }
    } catch { /* not listening yet */ }
    await sleep(25);
  }
  const ready = now() - t0;
  if (!health || health.status !== 'ok') { child.kill('SIGTERM'); throw new Error(`helper not ready after 120 s; log: ${logFile}`); }
  return { child, ready, health, logFile, exitedRef: () => exited };
}
async function stop(h) {
  const wpid = workerPid(h.child.pid);
  h.child.kill('SIGTERM');
  for (let i = 0; i < 200 && !h.exitedRef(); i++) await sleep(50);
  if (!h.exitedRef()) { h.child.kill('SIGKILL'); await sleep(200); }
  for (let i = 0; i < 100 && wpid && tryShell('ps', ['-p', String(wpid)])?.includes(String(wpid)); i++) await sleep(50);
  return { worker_left_behind: !!(wpid && (tryShell('ps', ['-o', 'pid=', '-p', String(wpid)]) || '').trim()) };
}
async function speak(text, voice = VOICE, speed = SPEED) {
  const t0 = now();
  const r = await fetch(`${BASE}/speak`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice, speed }),
    signal: AbortSignal.timeout(120_000),
  });
  const ttfb = now() - t0;
  const buf = Buffer.from(await r.arrayBuffer());
  const wall = now() - t0;
  if (!r.ok) throw new Error(`/speak ${r.status}: ${buf.toString('utf8', 0, 300)}`);
  const wav = wavInfo(buf);
  return {
    wall_s: wall, ttfb_s: ttfb, audio_s: wav.seconds, rtf: wav.seconds / wall, bytes: buf.length, wav,
    header_audio_s: Number(r.headers.get('x-audio-duration')), server_generation_s: Number(r.headers.get('x-generation-time')), buf,
  };
}

// ---------- identity ----------
function identity(health) {
  const py = tryShell(PYTHON, ['-c', "import sys,importlib.metadata as m;print(sys.version.split()[0]);print(m.version('mlx'));print(m.version('mlx-audio'))"]);
  const [python, mlx, mlxAudio] = (py || '\n\n').split('\n');
  const workerSrc = readFileSync(WORKER, 'utf8');
  const git = (a) => tryShell('git', ['-C', REPO, ...a]);
  return {
    machine: {
      chip: tryShell('sysctl', ['-n', 'machdep.cpu.brand_string']),
      model: tryShell('sysctl', ['-n', 'hw.model']),
      cpu_cores: { performance: Number(tryShell('sysctl', ['-n', 'hw.perflevel0.physicalcpu'])), efficiency: Number(tryShell('sysctl', ['-n', 'hw.perflevel1.physicalcpu'])) },
      gpu_cores: Number((tryShell('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator']) || '').match(/"gpu-core-count"\s*=\s*(\d+)/)?.[1]) || null,
      memory_gb: Math.round(Number(tryShell('sysctl', ['-n', 'hw.memsize'])) / 2 ** 30),
      macos: tryShell('sw_vers', ['-productVersion']), macos_build: tryShell('sw_vers', ['-buildVersion']), darwin: os.release(),
    },
    software: {
      helper_version: health.version, helper_api_version: health.apiVersion,
      helper_git_sha: git(['rev-parse', 'HEAD']),
      helper_tree_dirty: (git(['status', '--porcelain', '--', 'native-helper']) || '') !== '',
      helper_binary_sha256: createHash('sha256').update(readFileSync(BINARY)).digest('hex'),
      worker_sha256: createHash('sha256').update(workerSrc).digest('hex'),
      python, mlx, mlx_audio: mlxAudio,
      model_id: workerSrc.match(/^MODEL_ID = "([^"]+)"/m)?.[1] ?? null,
      model_revision: workerSrc.match(/^MODEL_REVISION = "([0-9a-f]{40})"/m)?.[1] ?? null,
      mlx_cache_limit_mb: Number(process.env.NTTS_MLX_CACHE_LIMIT_MB || workerSrc.match(/NTTS_MLX_CACHE_LIMIT_MB", "(\d+)"/)?.[1]),
      node: process.version,
    },
  };
}

// ---------- main ----------
async function main() {
  const texts = buildTexts();
  const byId = Object.fromEntries(texts.map((t) => [t.id, t]));

  // Wait for an otherwise idle machine: GPU utilization <= GPU_IDLE_MAX and 1-minute load average <= LOAD_MAX
  // on GPU_IDLE_SECS consecutive 1 s samples. Past --wait seconds it runs anyway and marks the result contended.
  let gpuBefore = [];
  let gpuIdleReached = false;
  const tWait = now();
  for (let calm = 0, lastNote = 0; ;) {
    const u = gpuUtil(); gpuBefore.push(u);
    const load1 = os.loadavg()[0];
    calm = u !== null && u <= GPU_IDLE_MAX && load1 <= LOAD_MAX ? calm + 1 : 0;
    if (calm >= GPU_IDLE_SECS) { gpuIdleReached = true; break; }
    if (now() - tWait > GPU_WAIT_S) { log(`machine never idle (GPU <= ${GPU_IDLE_MAX}%, load1 <= ${LOAD_MAX}, for ${GPU_IDLE_SECS} s) within ${GPU_WAIT_S} s; running anyway, result marked contended`); break; }
    if (now() - lastNote > 60) { lastNote = now(); log(`waiting for an idle machine: GPU ${u}%, load1 ${load1.toFixed(1)}`); }
    await sleep(1000);
  }
  const gpuWaitS = now() - tWait;
  const gpuDuring = [];
  const sampler = setInterval(() => gpuDuring.push(gpuUtil()), 2000);
  const startedAt = new Date().toISOString();
  const loadStart = os.loadavg();

  // 1-2. Cold starts.
  const cold = [];
  let h = null;
  for (let i = 1; i <= COLD_STARTS; i++) {
    h = await launch(`cold${i}`);
    const wpid = workerPid(h.child.pid);
    const fpReady = wpid ? footprint(wpid) : null;
    const first = await speak(byId.S15.text);
    cold.push({ launch_to_ready_s: h.ready, first_speak_s: first.wall_s, first_speak_rtf: first.rtf, launch_to_first_audio_s: h.ready + first.wall_s, worker_pid: wpid, worker_footprint_after_ready: fpReady });
    log(`cold ${i}: ready ${h.ready.toFixed(3)} s, first /speak ${first.wall_s.toFixed(3)} s`);
    if (i < COLD_STARTS) { await stop(h); h = null; await sleep(1000); }
  }

  // 3. Warm runs on the last helper.
  const wpid = workerPid(h.child.pid);
  const warm = Object.fromEntries(texts.map((t) => [t.id, []]));
  const fpAfter = {};
  for (const t of texts) { const r = await speak(t.text); writeFileSync(join(WORK, `${t.id}-${VOICE}.wav`), r.buf); log(`warm-up ${t.id}: ${r.wall_s.toFixed(3)} s`); }
  for (let run = 1; run <= RUNS; run++) {
    for (const t of texts) {
      const r = await speak(t.text);
      delete r.buf;
      warm[t.id].push(r);
      log(`run ${run} ${t.id}: ${r.wall_s.toFixed(3)} s wall, ${r.audio_s.toFixed(2)} s audio, ${r.rtf.toFixed(1)}x`);
      if (run === RUNS) fpAfter[t.id] = footprint(wpid);
    }
  }
  const fpEnd = footprint(wpid);
  const ident = identity(h.health);
  const stopped = await stop(h);
  clearInterval(sampler);
  const finishedAt = new Date().toISOString();

  const nums = (xs) => xs.filter((x) => typeof x === 'number');
  const results = {
    schema: 1,
    tool: 'bench/run.mjs',
    clean: gpuIdleReached && Math.max(loadStart[0], os.loadavg()[0]) <= LOAD_MAX * 1.5,
    generated_at: finishedAt,
    ...ident,
    conditions: {
      port: PORT, voice: VOICE, speed: SPEED, runs_per_text: RUNS, cold_starts: COLD_STARTS,
      client: 'node fetch, one request at a time, no Origin header', started_at: startedAt, finished_at: finishedAt,
      idle_before_start: { reached: gpuIdleReached, gpu_max_pct: GPU_IDLE_MAX, load1_max: LOAD_MAX, window_s: GPU_IDLE_SECS, waited_s: +gpuWaitS.toFixed(1), last_gpu_samples_pct: gpuBefore.slice(-GPU_IDLE_SECS) },
      gpu_utilization_pct_during: nums(gpuDuring).length ? { ...stats(nums(gpuDuring)), values: undefined, note: 'includes this benchmark\'s own requests' } : null,
      load_average_start: loadStart.map((x) => +x.toFixed(2)), load_average_end: os.loadavg().map((x) => +x.toFixed(2)),
      worker_left_behind_after_stop: stopped.worker_left_behind,
    },
    texts: texts.map(({ text, ...t }) => ({ ...t, preview: `${text.slice(0, 60)}…` })),
    startup: {
      launch_to_ready_s: stats(cold.map((c) => c.launch_to_ready_s)),
      first_speak_after_ready_s: stats(cold.map((c) => c.first_speak_s)),
      launch_to_first_audio_s: stats(cold.map((c) => c.launch_to_first_audio_s)),
      first_speak_text: 'S15',
    },
    warm: texts.map((t) => {
      const rs = warm[t.id];
      return {
        id: t.id, label: t.label, words: t.words, chars: t.chars,
        audio_s: stats(rs.map((r) => r.audio_s)),
        wall_s: stats(rs.map((r) => r.wall_s)),
        rtf: stats(rs.map((r) => r.rtf)),
        ttfb_s: stats(rs.map((r) => r.ttfb_s)),
        server_generation_s: stats(rs.map((r) => r.server_generation_s)),
        wav_format: (({ format, channels, sampleRate, bitsPerSample }) => ({ format, channels, sample_rate: sampleRate, bits_per_sample: bitsPerSample }))(rs[0].wav),
        wav_bytes: rs[0].bytes,
        header_vs_wav_audio_s_max_diff: +Math.max(...rs.map((r) => Math.abs(r.header_audio_s - r.audio_s))).toFixed(4),
      };
    }),
    memory: {
      worker_footprint_after_ready_mb: cold.map((c) => c.worker_footprint_after_ready?.peak_mb ?? null),
      worker_footprint_peak_after_text_mb: Object.fromEntries(Object.entries(fpAfter).map(([k, v]) => [k, v?.peak_mb ?? null])),
      worker_footprint_peak_mb: fpEnd?.peak_mb ?? null,
      worker_footprint_end_mb: fpEnd?.current_mb ?? null,
      method: '`footprint -p <worker pid> -j`: phys_footprint_peak is the lifetime peak of the worker process on the last cold start; the Swift helper itself is not included',
    },
    notes: [
      'Real-time factor = audio seconds (from the WAV header) / client wall seconds for the whole request.',
      'Time to first audio currently equals the full synthesis time: the helper returns the complete WAV, no streaming (compare ttfb_s with wall_s).',
      `Scratch files (helper logs, one WAV per text) were written to ${WORK} and are not part of the result.`,
    ],
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);
  log(`wrote ${OUT}`);
}

main().catch(async (e) => { console.error(e.stack || String(e)); killLive(); await sleep(1500); process.exit(1); });

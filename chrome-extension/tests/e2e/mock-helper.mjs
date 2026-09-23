// Mock Natural TTS helper for the end-to-end suite.
//
// Speaks the helper's HTTP surface (/health, /voices, /speak) and records every
// request it receives, bodies included. The e2e runner asserts against that log.
// A pass therefore proves the extension's traffic reached THIS process, not a
// real helper that happens to be listening on 127.0.0.1:8249.
//
// It also serves the test page (/e2e/page.html) the runner selects text on.
//
// Import:     const mock = await startMockHelper();   // ephemeral port
// Standalone: node tests/e2e/mock-helper.mjs [--port N] [--speak-delay-ms N]
//
// It never binds 8249-8260, the range a real helper owns.

import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const HELPER_PORT_MIN = 8249;
export const HELPER_PORT_MAX = 8260;

/** One second of silence, 24 kHz mono 16-bit: the helper's real output format. */
export function silentWav(seconds = 1, sampleRate = 24000) {
  const n = Math.round(sampleRate * seconds);
  const wav = Buffer.alloc(44 + n * 2); // zero-filled samples = silence
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + n * 2, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(n * 2, 40);
  return wav;
}

const PAGE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Natural TTS e2e page</title></head>
<body>
<h1>Natural TTS end-to-end page</h1>
<p id="first">${'The quick brown fox jumps over the lazy dog while the helper takes its time. '.repeat(9).trim()}</p>
<p id="second">A second paragraph, so the selection carries a line break.</p>
</body></html>`;

/**
 * @param {{ port?: number, host?: string, speakDelayMs?: number }} [opts]
 */
export async function startMockHelper(opts = {}) {
  const host = opts.host ?? '127.0.0.1';
  const inHelperRange = p => p >= HELPER_PORT_MIN && p <= HELPER_PORT_MAX;
  if (opts.port && inHelperRange(opts.port)) {
    throw new Error(`mock-helper refuses port ${opts.port}: ${HELPER_PORT_MIN}-${HELPER_PORT_MAX} belongs to a real helper`);
  }
  const t0 = Date.now();
  const wav = silentWav();

  /** @type {{ at: number, method: string, url: string, body: string, answered?: number, closedEarly?: boolean }[]} */
  const requests = [];
  const behaviour = { speakDelayMs: opts.speakDelayMs ?? 0, speakStatus: 200, speakError: null };
  const pending = new Set();

  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const entry = { at: Date.now() - t0, method: req.method, url: req.url, body };
      requests.push(entry);
      const json = (status, value) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(value));
      };

      if (req.url === '/e2e/page.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(PAGE_HTML);
      }
      if (req.url === '/health') {
        return json(200, {
          status: 'ok',
          model: 'mock',
          model_loaded: true,
          uptime_seconds: Math.round((Date.now() - t0) / 1000),
          requests_served: requests.filter(r => r.url === '/speak').length,
          apiVersion: 2,
        });
      }
      if (req.url === '/voices') {
        return json(200, { voices: [{ id: 'af_bella', name: 'Bella', language: 'en-US' }] });
      }
      if (req.url === '/speak' && req.method === 'POST') {
        if (behaviour.speakStatus !== 200) {
          entry.answered = Date.now() - t0;
          return json(behaviour.speakStatus, behaviour.speakError ?? { error: 'generation_failed', message: 'mock failure' });
        }
        const timer = setTimeout(() => {
          pending.delete(timer);
          if (res.destroyed) return;
          entry.answered = Date.now() - t0;
          res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length });
          res.end(wav);
        }, behaviour.speakDelayMs);
        pending.add(timer);
        res.on('close', () => {
          if (!res.writableEnded) entry.closedEarly = true;
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, host, resolve);
  });
  const port = server.address().port;
  if (inHelperRange(port)) {
    server.close();
    throw new Error(`mock-helper refuses port ${port}: ${HELPER_PORT_MIN}-${HELPER_PORT_MAX} belongs to a real helper`);
  }

  return {
    port,
    requests,
    /** Requests to /speak, with their parsed JSON bodies. */
    speakRequests() {
      return requests
        .filter(r => r.url === '/speak')
        .map(r => ({ ...r, json: safeJson(r.body) }));
    },
    /** Configure how the next /speak calls are answered. */
    setSpeak({ delayMs = 0, status = 200, error = null } = {}) {
      behaviour.speakDelayMs = delayMs;
      behaviour.speakStatus = status;
      behaviour.speakError = error;
    },
    async close() {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
      server.closeAllConnections();
      await new Promise(resolve => server.close(() => resolve()));
    },
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Standalone mode.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = name => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? Number(process.argv[i + 1]) : undefined;
  };
  const mock = await startMockHelper({ port: arg('--port'), speakDelayMs: arg('--speak-delay-ms') });
  console.log(`mock-helper listening on http://127.0.0.1:${mock.port}`);
  const stop = async () => {
    await mock.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

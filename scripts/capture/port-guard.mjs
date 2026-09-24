// Port guard for capture sessions: keeps the capture browser away from any helper it must not use.
//
// Usage: node port-guard.mjs <browserWsUrl> <log.jsonl> [--block 8249,8251] [--hold-health <port>:<ms>]
//                             [--serve https://essays.example/=<dir>]
//
// Auto-attaches (flatten, waitForDebuggerOnStart) to every target the capture browser creates, including the
// extension's service worker, offscreen document and popup, enables Fetch for http://127.0.0.1:*/* in each,
// and then for every request:
//   - a port in --block (default 8249) is failed with ConnectionRefused, exactly as if nothing listened there;
//   - any other port is continued unmodified, optionally after a delay (--hold-health <port>:<ms> delays every
//     /health request a popup page makes to that port, so the popup's real "Checking" state, which normally
//     lasts a few milliseconds, stays on screen long enough to be seen; the response itself is never altered);
// --serve answers every request under an https origin from a local directory (Fetch.fulfillRequest), so a demo
// page shows a neutral address in the omnibox instead of a file:// path that names the home directory;
// and appends one JSON line per request to <log.jsonl> ({t, target, url, method, action}).
//
// Why: a machine can run an older helper on the default port 8249. Seeding the extension's stored port to the
// capture helper keeps discovery off 8249 while that helper is up; this guard makes it impossible for the
// capture browser to reach 8249 at all, and its log is the proof. It never touches any process.
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const [wsUrl, logPath, ...rest] = process.argv.slice(2);
if (!wsUrl || !logPath) {
  console.error('usage: node port-guard.mjs <browserWsUrl> <log.jsonl> [--block 8249,...] [--hold-health <port>:<ms>]');
  process.exit(64);
}
const opt = (n) => { const i = rest.indexOf(`--${n}`); return i === -1 ? undefined : rest[i + 1]; };
const blocked = new Set((opt('block') ?? '8249').split(',').map(Number));
const [holdPort, holdMs] = (opt('hold-health') ?? '0:0').split(':').map(Number);
const [serveOrigin, serveDir] = (opt('serve') ?? '=').split('=');
const MIME = { '.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const t0 = Date.now();
const log = (e) => appendFileSync(logPath, JSON.stringify({ t: (Date.now() - t0) / 1000, ...e }) + '\n');

const ws = new WebSocket(wsUrl);
let seq = 0;
const pending = new Map();
const sessions = new Map(); // sessionId -> { targetId, url, type }
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const m = { id: ++seq, method, params }; if (sessionId) m.sessionId = sessionId;
  pending.set(m.id, { res, rej }); ws.send(JSON.stringify(m));
});
const quiet = (p) => p.catch(() => undefined);

async function arm(sessionId, info) {
  sessions.set(sessionId, { targetId: info.targetId, url: info.url, type: info.type });
  // Recurse: workers and frames started by this target are attached too, paused until armed.
  await quiet(send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId));
  const patterns = [{ urlPattern: 'http://127.0.0.1:*/*', requestStage: 'Request' }];
  if (serveOrigin) patterns.push({ urlPattern: `${serveOrigin}*`, requestStage: 'Request' });
  await quiet(send('Fetch.enable', { patterns }, sessionId));
  await quiet(send('Runtime.runIfWaitingForDebugger', {}, sessionId));
  log({ action: 'armed', type: info.type, target: info.url });
}

ws.onmessage = async (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    return;
  }
  if (m.method === 'Target.attachedToTarget') {
    arm(m.params.sessionId, m.params.targetInfo);
  } else if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params;
    const s = sessions.get(m.sessionId) ?? { url: '?', type: '?' };
    if (serveOrigin && request.url.startsWith(serveOrigin)) {
      const rel = normalize(decodeURIComponent(new URL(request.url).pathname)).replace(/^\/+/, '');
      const file = join(serveDir, rel || 'index.html');
      const ok = file.startsWith(serveDir) && existsSync(file);
      const body = ok ? readFileSync(file) : Buffer.from('not found');
      log({ target: s.url, method: request.method, url: request.url, action: ok ? `served ${rel}` : 'served 404' });
      await quiet(send('Fetch.fulfillRequest', { requestId, responseCode: ok ? 200 : 404,
        responseHeaders: [{ name: 'Content-Type', value: MIME[extname(file)] ?? 'application/octet-stream' }],
        body: body.toString('base64') }, m.sessionId));
      return;
    }
    const u = new URL(request.url);
    const port = Number(u.port);
    const base = { target: s.url, type: s.type, method: request.method, url: request.url };
    if (blocked.has(port)) {
      log({ ...base, action: 'refused' });
      await quiet(send('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }, m.sessionId));
      return;
    }
    if (port === holdPort && u.pathname === '/health' && s.url.includes('/popup/')) {
      log({ ...base, action: `held ${holdMs} ms` });
      await new Promise((r) => setTimeout(r, holdMs));
    } else {
      log({ ...base, action: 'passed' });
    }
    await quiet(send('Fetch.continueRequest', { requestId }, m.sessionId));
  } else if (m.method === 'Target.targetInfoChanged') {
    // A tab is attached while still about:blank and navigated afterwards (shoot.mjs does exactly that), so the
    // URL recorded at attach time is stale; without this, --hold-health never matched a popup opened in a tab.
    const { targetId, url } = m.params.targetInfo;
    for (const s of sessions.values()) if (s.targetId === targetId && s.url !== url) s.url = url;
  } else if (m.method === 'Target.detachedFromTarget') {
    sessions.delete(m.params.sessionId);
  }
};

ws.onopen = async () => {
  await send('Target.setDiscoverTargets', { discover: true }); // delivers Target.targetInfoChanged (URL updates)
  // Browser level: attach to every existing and future target, paused at start until armed. Pages are reached
  // through their tab target (Chrome refuses a filter that allows both), so arm() re-applies auto-attach there.
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
    filter: [{ type: 'page', exclude: true }, {}] });
  log({ action: 'guard-ready', blocked: [...blocked], hold: holdPort ? `${holdPort}:${holdMs}` : null });
  console.log(`port-guard ready: refusing ${[...blocked].join(',')}; log ${logPath}`);
};
ws.onclose = () => process.exit(0);
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

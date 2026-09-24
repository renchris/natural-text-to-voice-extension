#!/usr/bin/env node
// Headed end-to-end suite: the built extension (dist/) in Chrome for Testing,
// talking to tests/e2e/mock-helper.mjs.
//
// Usage (from chrome-extension/):  bun run test:e2e
//   (= bun run build && node tests/e2e/run-e2e.mjs)
// Env: CHROME_PATH=<binary> overrides the browser. E2E_HEADLESS=1 runs headless.
//
// Why raw CDP instead of Playwright's own launch: a real helper may be
// listening on 127.0.0.1:8249, and the extension always starts discovery
// there. Every request the extension makes to 127.0.0.1:8249-8260 is paused
// with the CDP Fetch domain on each target (service worker, offscreen
// document, pages) BEFORE that target runs a line of code, then rewritten to
// the mock's port (or failed, for the helper-down case). Playwright attaches
// to the same targets with its own waitForDebuggerOnStart and resumes them
// itself, which would race that setup, so this runner owns the one CDP
// connection. playwright-core is used to locate Chrome for Testing.
//
// Driving the service worker without test hooks in the shipped bundle: the
// worker is caught paused on start, and at a beforeScriptExecution breakpoint
// (the first moment chrome.* exists) a small instrumentation script records
// the listeners it registers (contextMenus.onClicked, commands.onCommand) and
// the offscreen replies to SPEAK_IN_OFFSCREEN. If the worker was already
// running when the runner attached, it is restarted with chrome.runtime.reload
// and caught on the way up. The runner then calls the real listeners with the
// arguments Chrome passes on a context-menu click or a keyboard command.
// Nothing is added to dist/.
//
// A real click would grant activeTab. The page therefore lives on 127.0.0.1,
// which host_permissions already grant, so chrome.scripting can read it the
// way activeTab lets it after a click. The fallback case uses a host outside
// host_permissions (mapped to 127.0.0.1 by --host-resolver-rules), where
// scripting is refused and info.selectionText must be spoken instead.
//
// Every assertion about speech checks the /speak body the MOCK received, so a
// pass cannot have been served by a real helper.
//
// The system-voice fallback (OD-2) is observed the same way: the
// instrumentation wraps chrome.tts.speak in the worker, records each call and
// every event chrome.tts reports for it, and forces volume 0 so the run stays
// silent (--mute-audio does not reach the OS speech synthesizer).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startMockHelper, HELPER_PORT_MIN, HELPER_PORT_MAX } from './mock-helper.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..', '..');
const DIST = path.join(PKG_ROOT, 'dist');
const CONTEXT_MENU_ID = 'natural-tts-speak-selection';
const HELPER_DOWN_MESSAGE = 'The Natural TTS helper is not running. Start it, then try again.';
const FALLBACK_HOST = 'e2e-fallback.test'; // mapped to 127.0.0.1, but outside host_permissions

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[e2e]', ...a);

// ---------------------------------------------------------------------------
// Chrome for Testing

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const require = createRequire(import.meta.url);
  try {
    const { chromium } = require(require.resolve('playwright-core', { paths: [PKG_ROOT] }));
    const exe = chromium.executablePath();
    if (exe && fs.existsSync(exe)) return exe;
  } catch {
    /* fall through to the cache scan */
  }
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  const found = [];
  for (const name of fs.existsSync(cache) ? fs.readdirSync(cache) : []) {
    const m = /^chromium-(\d+)$/.exec(name);
    if (!m) continue;
    for (const plat of ['chrome-mac-arm64', 'chrome-mac-x64', 'chrome-mac']) {
      const bin = path.join(cache, name, plat, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      if (fs.existsSync(bin)) found.push({ rev: Number(m[1]), bin });
    }
  }
  if (!found.length) {
    throw new Error('No Chrome for Testing found. Run: cd chrome-extension && bunx playwright-core install chromium');
  }
  return found.sort((a, b) => b.rev - a.rev)[0].bin;
}

// ---------------------------------------------------------------------------
// Minimal CDP client (flattened sessions)

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.calls = new Map();
    this.handlers = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id !== undefined) {
        const call = this.calls.get(msg.id);
        if (!call) return;
        this.calls.delete(msg.id);
        if (msg.error) call.reject(new Error(`${call.method}: ${msg.error.message}`));
        else call.resolve(msg.result);
      } else {
        for (const h of this.handlers) h(msg.method, msg.params, msg.sessionId);
      }
    });
  }
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new CDP(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error(`cannot connect to ${url}`)), { once: true });
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.calls.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(msg));
    });
  }
  on(fn) {
    this.handlers.push(fn);
  }
  close() {
    this.ws.close();
  }
}

// ---------------------------------------------------------------------------
// Service-worker instrumentation, evaluated while the worker is paused on start.

const SW_INSTRUMENTATION = `(() => {
  const g = globalThis;
  g.__e2e = { listeners: {}, offscreenReplies: [], tts: [] };
  for (const [ns, ev] of [['contextMenus', 'onClicked'], ['commands', 'onCommand']]) {
    const event = chrome[ns][ev];
    const add = event.addListener.bind(event);
    event.addListener = fn => {
      (g.__e2e.listeners[ns + '.' + ev] ||= []).push(fn);
      return add(fn);
    };
  }
  if (chrome.tts) {
    const speak = chrome.tts.speak.bind(chrome.tts);
    Object.defineProperty(chrome.tts, 'speak', {
      configurable: true,
      writable: true,
      value: (text, options = {}, ...rest) => {
        const { onEvent, ...recorded } = options;
        const call = { text, options: recorded, events: [] };
        g.__e2e.tts.push(call);
        return speak(text, {
          ...options,
          volume: 0,
          onEvent: event => {
            call.events.push(event.type);
            if (onEvent) onEvent(event);
          },
        }, ...rest);
      },
    });
  }
  const runtime = chrome.runtime;
  const send = runtime.sendMessage.bind(runtime);
  Object.defineProperty(runtime, 'sendMessage', {
    configurable: true,
    writable: true,
    value: async (message, ...rest) => {
      const reply = await send(message, ...rest);
      if (message && message.type === 'SPEAK_IN_OFFSCREEN') g.__e2e.offscreenReplies.push(reply);
      return reply;
    },
  });
  return 'instrumented';
})()`;

// ---------------------------------------------------------------------------
// The harness: browser + interception + helpers

async function launch(mockPort) {
  const exe = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ntts-e2e-profile-'));
  const args = [
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    `--host-resolver-rules=MAP ${FALLBACK_HOST} 127.0.0.1`,
    'about:blank',
  ];
  if (process.env.E2E_HEADLESS === '1') args.unshift('--headless=new');
  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', d => (stderr = (stderr + d).slice(-4000)));

  const portFile = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 20000;
  while (!fs.existsSync(portFile) || fs.readFileSync(portFile, 'utf8').split('\n').length < 2) {
    if (Date.now() > deadline || proc.exitCode !== null) {
      proc.kill('SIGKILL');
      throw new Error(`Chrome did not expose a DevTools port.\n${stderr}`);
    }
    await sleep(100);
  }
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  const cdp = await CDP.connect(`ws://127.0.0.1:${port}${wsPath}`);
  log(`${(await cdp.send('Browser.getVersion')).product} (${exe}); mock helper on 127.0.0.1:${mockPort}`);

  const h = {
    cdp,
    proc,
    profile,
    targets: new Map(), // sessionId -> targetInfo
    interceptMode: 'mock', // 'mock' | 'down'
    intercepted: [], // { url, rewrittenTo | failed }
    swSession: null,
    instrumented: new Set(), // SW sessions that ran SW_INSTRUMENTATION
    notPaused: new Set(), // SW sessions attached after their script had already run
    extensionId: null,
  };

  cdp.on(async (method, params, sessionId) => {
    try {
      if (method === 'Target.attachedToTarget') {
        await onAttached(h, params);
      } else if (method === 'Target.detachedFromTarget') {
        if (process.env.E2E_DEBUG) log('detached', h.targets.get(params.sessionId)?.url);
        h.targets.delete(params.sessionId);
        if (params.sessionId === h.swSession) h.swSession = null;
      } else if (method === 'Debugger.paused') {
        await onDebuggerPaused(h, sessionId);
      } else if (method === 'Fetch.requestPaused') {
        await onPaused(h, params, sessionId, mockPort);
      }
    } catch (e) {
      // Targets can vanish mid-call (closed tabs, reloaded workers).
      if (!/No session|Target closed|not found|No target/i.test(String(e.message))) log('cdp handler:', e.message);
    }
  });

  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  return h;
}

async function onAttached(h, { sessionId, targetInfo, waitingForDebugger }) {
  if (process.env.E2E_DEBUG) log("attached", targetInfo.type, targetInfo.url, "waiting=" + waitingForDebugger);
  const { cdp } = h;
  h.targets.set(sessionId, targetInfo);
  // Intercept this target's helper traffic before it runs.
  await cdp
    .send('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:82*', requestStage: 'Request' }] }, sessionId)
    .catch(() => {});
  // Reach frames and workers inside it too.
  await cdp
    .send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId)
    .catch(() => {});

  const swMatch = /^chrome-extension:\/\/([a-p]{32})\/background\/service-worker\.js$/.exec(targetInfo.url);
  const swAlreadyAttached = h.swSession && h.targets.get(h.swSession)?.targetId === targetInfo.targetId;
  if (targetInfo.type === 'service_worker' && swMatch && !swAlreadyAttached) {
    h.extensionId = swMatch[1];
    h.swSession = sessionId;
    if (waitingForDebugger) {
      // Paused on start, the worker has no chrome.* bindings yet. Break again
      // just before its script runs, when they exist (see onDebuggerPaused).
      await cdp.send('Debugger.enable', {}, sessionId);
      await cdp.send('Debugger.setInstrumentationBreakpoint', { instrumentation: 'beforeScriptExecution' }, sessionId);
    } else {
      h.notPaused.add(sessionId);
    }
  }
  if (waitingForDebugger) await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
}

async function onDebuggerPaused(h, sessionId) {
  const { cdp } = h;
  if (sessionId === h.swSession && !h.instrumented.has(sessionId)) {
    const r = await cdp.send('Runtime.evaluate', { expression: SW_INSTRUMENTATION, returnByValue: true }, sessionId);
    if (process.env.E2E_DEBUG) log('instrumentation', JSON.stringify(r).slice(0, 400));
    if (r.result?.value === 'instrumented') h.instrumented.add(sessionId);
  }
  await cdp.send('Debugger.resume', {}, sessionId);
  // Disabling the domain also drops the instrumentation breakpoint.
  if (sessionId === h.swSession) await cdp.send('Debugger.disable', {}, sessionId);
}

async function onPaused(h, { requestId, request }, sessionId, mockPort) {
  const url = new URL(request.url);
  const port = Number(url.port);
  if (url.hostname === '127.0.0.1' && port >= HELPER_PORT_MIN && port <= HELPER_PORT_MAX) {
    if (h.interceptMode === 'down') {
      h.intercepted.push({ url: request.url, failed: true });
      await h.cdp.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }, sessionId);
      return;
    }
    url.port = String(mockPort);
    h.intercepted.push({ url: request.url, rewrittenTo: url.href });
    await h.cdp.send('Fetch.continueRequest', { requestId, url: url.href }, sessionId);
    return;
  }
  await h.cdp.send('Fetch.continueRequest', { requestId }, sessionId);
}

/** Evaluate an async expression in the extension's service worker. */
async function sw(h, expression) {
  const deadline = Date.now() + 15000;
  while (!h.swSession) {
    if (Date.now() > deadline) throw new Error('service worker not attached');
    await sleep(50);
  }
  const r = await h.cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    h.swSession
  );
  if (r.exceptionDetails) throw new Error(`SW evaluate failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

async function waitFor(what, fn, timeoutMs = 15000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(stepMs);
  }
}

/** Open a tab, wait for load, and select the page's two paragraphs. Returns { tabId, selection }. */
async function openPageWithSelection(h, url) {
  // Without the "tabs" permission, tabs.query hides the URL of hosts outside
  // host_permissions, so find the new tab by id instead.
  const tabIds = () => sw(h, `chrome.tabs.query({}).then(tabs => tabs.map(t => t.id))`);
  const before = new Set(await tabIds());
  const { targetId } = await h.cdp.send('Target.createTarget', { url });
  const sessionId = await waitFor('page session', () => {
    for (const [sid, info] of h.targets) if (info.targetId === targetId) return sid;
    return null;
  });
  const selection = await waitFor('page load + selection', async () => {
    const r = await h.cdp
      .send(
        'Runtime.evaluate',
        {
          expression: `(() => {
            const a = document.getElementById('first'), b = document.getElementById('second');
            if (!a || !b) return '';
            const range = document.createRange();
            range.setStart(a.firstChild, 0);
            range.setEnd(b.firstChild, b.firstChild.length);
            getSelection().removeAllRanges();
            getSelection().addRange(range);
            return getSelection().toString();
          })()`,
          returnByValue: true,
        },
        sessionId
      )
      .catch(() => ({ result: { value: '' } }));
    return r.result?.value || '';
  });
  const fresh = (await tabIds()).filter(id => !before.has(id));
  if (fresh.length !== 1) throw new Error(`expected one new tab for ${url}, found ${fresh.length}`);
  const tabId = fresh[0];
  return { tabId, selection, targetId };
}

// ---------------------------------------------------------------------------
// Assertions

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const clickMenu = (tabId, selectionText, pageUrl) =>
  `globalThis.__e2e.pending = globalThis.__e2e.listeners['contextMenus.onClicked'][0](
     { menuItemId: ${JSON.stringify(CONTEXT_MENU_ID)}, selectionText: ${JSON.stringify(selectionText)},
       pageUrl: ${JSON.stringify(pageUrl)}, editable: false },
     { id: ${tabId} }).then(() => (globalThis.__e2e.settledAt = Date.now()));
   globalThis.__e2e.settledAt = null; Date.now()`;

const badge = h =>
  sw(h, `(async () => ({ text: await chrome.action.getBadgeText({}), title: await chrome.action.getTitle({}) }))()`);

const offscreenCount = h =>
  sw(h, `chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }).then(c => c.length)`);

const lastReply = h => sw(h, `globalThis.__e2e.offscreenReplies.at(-1) ?? null`);

// ---------------------------------------------------------------------------
// Cases

async function run() {
  if (!fs.existsSync(path.join(DIST, 'manifest.json'))) throw new Error('dist/ is missing: run "bun run build" first');
  const shipped = fs.readdirSync(DIST, { recursive: true }).filter(f => String(f).endsWith('.js'));
  const hooked = shipped.filter(f => fs.readFileSync(path.join(DIST, String(f)), 'utf8').includes('TestHelpers'));
  if (hooked.length) throw new Error(`dist/ still ships test hooks: ${hooked.join(', ')}`);

  const mock = await startMockHelper();
  const pageUrl = `http://127.0.0.1:${mock.port}/e2e/page.html`;
  const fallbackUrl = `http://${FALLBACK_HOST}:${mock.port}/e2e/page.html`;
  let h;
  try {
    h = await launch(mock.port);

    // Restart the service worker under the instrumentation.
    // The launch-time worker is usually caught paused on start and
    // instrumented. If it was already running when we attached, restart it.
    const first = await waitFor('service worker', () => h.swSession, 20000);
    await waitFor('service worker start', () => h.instrumented.has(first) || h.notPaused.has(first), 20000);
    if (!h.instrumented.has(first)) {
      await sw(h, `setTimeout(() => chrome.runtime.reload(), 50), 'reloading'`);
      await waitFor('instrumented service worker', () => h.swSession && h.instrumented.has(h.swSession), 20000);
    }
    await waitFor('listeners registered', () =>
      sw(h, `!!(globalThis.__e2e.listeners['contextMenus.onClicked'] && globalThis.__e2e.listeners['commands.onCommand'])`)
    );
    check('service worker instrumented before its script ran; dist ships no test hooks', true, `extension ${h.extensionId}`);

    // --- Case 1: context-menu path reads the selection via chrome.scripting;
    //     a /speak that takes 40 s still plays; the offscreen document is alive at 45 s.
    {
      const page = await openPageWithSelection(h, pageUrl);
      const expected = page.selection.trim();
      mock.setSpeak({ delayMs: 40000 });
      const before = mock.speakRequests().length;
      const t0 = await sw(h, clickMenu(page.tabId, 'SELECTIONTEXT-MUST-NOT-BE-USED', pageUrl));
      const req = await waitFor('the mock to receive /speak', () => mock.speakRequests()[before], 20000);
      check(
        'context menu: /speak body carries the page selection read by chrome.scripting',
        req.json?.text === expected && expected.includes('\n') && expected.length > 500,
        `${req.json?.text?.length} chars, voice ${req.json?.voice}, line break ${expected.includes('\n')}`
      );
      await waitFor('t=45 s', async () => Date.now() - t0 >= 45000, 60000, 250);
      const alive = await offscreenCount(h);
      check('offscreen document is alive 45 s after the request', alive === 1, `${alive} offscreen context(s)`);
      await waitFor('speech to settle', () => sw(h, 'globalThis.__e2e.settledAt'), 30000, 250);
      const settled = await sw(h, 'globalThis.__e2e.settledAt');
      const reply = await lastReply(h);
      // The offscreen document answers when playback starts (SPEAK_STARTED); the end follows as a
      // one-way SPEAK_FINISHED, so no reply is held for the length of the audio (EXT-8).
      check(
        'a /speak answered after 40 s still plays',
        reply?.type === 'SPEAK_STARTED' && settled - t0 >= 40000 && mock.speakRequests().length === before + 1,
        `${reply?.type} after ${((settled - t0) / 1000).toFixed(1)} s, /speak POSTs ${mock.speakRequests().length - before}`
      );
      await h.cdp.send('Target.closeTarget', { targetId: page.targetId });
    }

    // --- Case 2: where chrome.scripting cannot read the page, info.selectionText is spoken.
    {
      const page = await openPageWithSelection(h, fallbackUrl);
      mock.setSpeak({ delayMs: 0 });
      const before = mock.speakRequests().length;
      const fallbackText = 'Fallback text from the context menu';
      await sw(h, clickMenu(page.tabId, `  ${fallbackText}  `, fallbackUrl));
      const req = await waitFor('the mock to receive /speak', () => mock.speakRequests()[before], 20000);
      check(
        'context menu fallback: info.selectionText is spoken when the page cannot be scripted',
        req.json?.text === fallbackText,
        `body text ${JSON.stringify(req.json?.text)}`
      );
      await waitFor('speech to settle', () => sw(h, 'globalThis.__e2e.settledAt'), 20000);
      await h.cdp.send('Target.closeTarget', { targetId: page.targetId });
    }

    // --- Case 3: stop-speaking settles a pending request long before the helper answers.
    {
      const page = await openPageWithSelection(h, pageUrl);
      mock.setSpeak({ delayMs: 40000 });
      const before = mock.speakRequests().length;
      await sw(h, clickMenu(page.tabId, '', pageUrl));
      await waitFor('the mock to receive /speak', () => mock.speakRequests()[before], 20000);
      const tStop = await sw(
        h,
        `globalThis.__e2e.listeners['commands.onCommand'][0]('stop-speaking', undefined).then(() => Date.now())`
      );
      await waitFor('the stopped request to settle', () => sw(h, 'globalThis.__e2e.settledAt'), 10000, 50);
      const settled = await sw(h, 'globalThis.__e2e.settledAt');
      const reply = await lastReply(h);
      const b = await badge(h);
      check(
        'stop-speaking settles the pending request',
        reply?.type === 'SPEAK_STOPPED' && settled - tStop < 3000 && b.text === '',
        `${reply?.type} ${settled - tStop} ms after stop, badge ${JSON.stringify(b.text)}`
      );
      await h.cdp.send('Target.closeTarget', { targetId: page.targetId });
    }

    // --- Case 4: helper down (connection refused) -> the system voice speaks the
    //     selection through chrome.tts and there is no badge (OD-2); stop-speaking
    //     silences it.
    {
      const page = await openPageWithSelection(h, pageUrl);
      const expected = page.selection.trim();
      h.interceptMode = 'down';
      const speaksBefore = mock.speakRequests().length;
      const refusedBefore = h.intercepted.filter(i => i.failed).length;
      const ttsBefore = await sw(h, 'globalThis.__e2e.tts.length');
      await sw(h, clickMenu(page.tabId, '', pageUrl));
      await waitFor('the fallback request to settle', () => sw(h, 'globalThis.__e2e.settledAt'), 60000, 250);
      const call = await waitFor(
        'chrome.tts to start speaking',
        () => sw(h, `(() => { const c = globalThis.__e2e.tts[${ttsBefore}]; return c && c.events.includes('start') ? c : null; })()`),
        15000,
        100
      ).catch(() => sw(h, `globalThis.__e2e.tts[${ttsBefore}] ?? null`));
      const speaking = await sw(h, 'chrome.tts.isSpeaking()');
      const b = await badge(h);
      const refused = h.intercepted.filter(i => i.failed).length - refusedBefore;
      check(
        'helper down: chrome.tts speaks the selection (system voice) and no badge is set',
        call?.text === expected &&
          call.events.includes('start') &&
          b.text === '' &&
          refused > 0 &&
          mock.speakRequests().length === speaksBefore,
        `tts ${call ? `${call.text.length} chars, rate ${call.options.rate}, voice ${JSON.stringify(call.options.voiceName ?? 'default')}, events [${call.events}]` : 'not called'}, isSpeaking ${speaking}, badge ${JSON.stringify(b.text)}, ${refused} refused request(s)`
      );
      // PRIVACY.md: the fallback names a platform voice itself, never leaving the choice to Chrome, and that
      // voice is neither remote nor another extension's engine.
      const voiceName = call?.options?.voiceName;
      const chosen = typeof voiceName === 'string'
        ? await sw(h, `chrome.tts.getVoices().then(vs => { const v = vs.find(v => v.voiceName === ${JSON.stringify(voiceName)}); return v ? { remote: v.remote === true, extensionId: v.extensionId ?? null } : null; })`)
        : null;
      check(
        'the system voice is a named local platform voice',
        !!chosen && !chosen.remote && !chosen.extensionId,
        `voiceName ${JSON.stringify(voiceName ?? null)}, listed as ${JSON.stringify(chosen)}`
      );

      // The stop must be what ended the speech: live speech before it, an "interrupted"/"cancelled" event (a
      // natural "end" means the utterance simply finished) and nothing speaking after it.
      const speakingBeforeStop = await sw(h, 'chrome.tts.isSpeaking()');
      await sw(h, `globalThis.__e2e.listeners['commands.onCommand'][0]('stop-speaking', undefined)`);
      const events = await waitFor(
        'chrome.tts to stop',
        () => sw(h, `(() => { const e = globalThis.__e2e.tts[${ttsBefore}]?.events ?? []; return e.some(t => t === 'interrupted' || t === 'cancelled' || t === 'end') ? e : null; })()`),
        10000,
        100
      ).catch(() => null);
      const speakingAfterStop = await waitFor(
        'chrome.tts.isSpeaking() to be false',
        async () => ((await sw(h, 'chrome.tts.isSpeaking()')) === false ? 'false' : null),
        3000,
        100
      ).catch(() => 'true');
      const after = await badge(h);
      const interrupted = !!events && events.some(t => t === 'interrupted' || t === 'cancelled') && !events.includes('end');
      check(
        'stop-speaking stops the system voice',
        speakingBeforeStop === true && interrupted && speakingAfterStop === 'false' && after.text === '',
        `isSpeaking before ${speakingBeforeStop}, events [${events}], isSpeaking after ${speakingAfterStop}, badge ${JSON.stringify(after.text)}`
      );
      await h.cdp.send('Target.closeTarget', { targetId: page.targetId });
    }

    // --- Case 5: helper down with "Show an error" chosen -> red "!" badge with the
    //     reason and no system voice; the next success clears it.
    {
      const page = await openPageWithSelection(h, pageUrl);
      await sw(h, `chrome.storage.local.set({ whenHelperUnavailable: 'error' }).then(() => 'set')`);
      h.interceptMode = 'down';
      const speaksBefore = mock.speakRequests().length;
      const refusedBefore = h.intercepted.filter(i => i.failed).length;
      const ttsBefore = await sw(h, 'globalThis.__e2e.tts.length');
      await sw(h, clickMenu(page.tabId, '', pageUrl));
      await waitFor('the failed request to settle', () => sw(h, 'globalThis.__e2e.settledAt'), 60000, 250);
      const b = await badge(h);
      const refused = h.intercepted.filter(i => i.failed).length - refusedBefore;
      const ttsCalls = (await sw(h, 'globalThis.__e2e.tts.length')) - ttsBefore;
      check(
        'helper down, "Show an error": red "!" badge with the helper-down reason, no system voice',
        b.text === '!' &&
          b.title === `Natural TTS: ${HELPER_DOWN_MESSAGE}` &&
          refused > 0 &&
          ttsCalls === 0 &&
          mock.speakRequests().length === speaksBefore,
        `badge ${JSON.stringify(b.text)}, title ${JSON.stringify(b.title)}, ${refused} refused request(s), ${ttsCalls} chrome.tts call(s)`
      );
      await sw(h, `chrome.storage.local.remove('whenHelperUnavailable').then(() => 'removed')`);

      h.interceptMode = 'mock';
      mock.setSpeak({ delayMs: 0 });
      await sw(h, clickMenu(page.tabId, '', pageUrl));
      await waitFor('the recovery request to settle', () => sw(h, 'globalThis.__e2e.settledAt'), 30000, 250);
      const after = await badge(h);
      check(
        'helper back: the next successful speak clears the badge and restores the "Natural TTS" tooltip',
        after.text === '' && after.title === 'Natural TTS' && mock.speakRequests().length === speaksBefore + 1,
        `badge ${JSON.stringify(after.text)}, title ${JSON.stringify(after.title)}`
      );
      await h.cdp.send('Target.closeTarget', { targetId: page.targetId });
    }

    // Every helper-range request was rewritten to the mock or refused: nothing reached a real helper.
    const unhandled = h.intercepted.filter(i => !i.failed && !i.rewrittenTo);
    check(
      'every 127.0.0.1:8249-8260 request was intercepted (rewritten to the mock or refused)',
      h.intercepted.length > 0 && unhandled.length === 0,
      `${h.intercepted.length} intercepted`
    );
  } finally {
    if (h) {
      await h.cdp.send('Browser.close').catch(() => {});
      h.cdp.close();
      await Promise.race([new Promise(r => h.proc.once('exit', r)), sleep(5000)]);
      if (h.proc.exitCode === null && h.proc.signalCode === null) h.proc.kill('SIGKILL');
      fs.rmSync(h.profile, { recursive: true, force: true });
    }
    await mock.close();
  }
}

const started = Date.now();
run()
  .catch(e => check('suite ran to completion', false, e.stack || e.message))
  .finally(() => {
    const failed = results.filter(r => !r.ok);
    log(`${results.length - failed.length}/${results.length} passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    process.exit(failed.length || !results.length ? 1 : 0);
  });

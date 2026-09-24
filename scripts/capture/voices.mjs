// Voices-loop driver: the anchored toolbar popup, its voice <select> opened as the NATIVE macOS list (grouped by
// American / British, female / male), the cursor walking down the list, and a real click on another voice.
//
// Usage: node voices.mjs <browserWsUrl> <extId> <chromePid> <timeline.json> [options]
//   --mode prep|full   prep: size the browser window (--window), close any open popup, reset the voice to --from,
//                      open the real anchored popup and wait until it is Connected with its voices loaded; prints
//                      the popup's screen bounds. full (default): the timed take on an already-open popup.
//   --window x,y,w,h   prep: browser window bounds in screen points (default 40,40,1280,1040: tall enough that the
//                      open list stays inside the browser window, so nothing of another app is recorded)
//   --from <voiceId>   prep: the voice the popup opens on (default af_heart)
//   --to <title>       full: the voice to pick, by its title in the list (default Emma)
//   --step <s>         full: seconds per row while the cursor walks down the list (default 0.085)
//
// The list is a native NSMenu, so CDP cannot reach it: the open, the walk and the pick are real OS events (click,
// move from build.sh), with each row located through the Accessibility API (axmenu). Before the pick it re-reads
// the list and refuses to click if it has closed. Every step's time goes into the timeline.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const [wsUrl, extId, pidArg, outJson] = argv;
if (!wsUrl || !extId || !pidArg || !outJson) {
  console.error('usage: node voices.mjs <browserWsUrl> <extId> <chromePid> <timeline.json> [--mode prep|full] [...]');
  process.exit(64);
}
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const mode = opt('mode', 'full');
const [wx, wy, ww, wh] = opt('window', '40,40,1280,1040').split(',').map(Number);
const fromVoice = opt('from', 'af_heart');
const toTitle = opt('to', 'Emma');
const step = Number(opt('step', '0.085'));
const pid = String(Number(pidArg));

const tool = (name, ...args) => execFileSync(name, args.map(String), { encoding: 'utf8' }).trim();
const ws = new WebSocket(wsUrl);
let seq = 0; const pending = new Map(); const log = [];
let t0 = Date.now();
const mark = (s, extra = {}) => { const t = (Date.now() - t0) / 1000; log.push({ step: s, t, wall: Date.now(), ...extra }); console.log(t.toFixed(3), s, Object.keys(extra).length ? JSON.stringify(extra) : ''); };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const m = { id: ++seq, method, params }; if (sessionId) m.sessionId = sessionId;
  pending.set(m.id, { res, rej }); ws.send(JSON.stringify(m));
});
ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = m.id && pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (sec) => { const d = t0 + sec * 1000 - Date.now(); if (d > 0) await sleep(d); };
const evalIn = async (sid, expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sid);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
  return r.result.value;
};
const targets = async () => (await send('Target.getTargets')).targetInfos;
const attach = async (t) => (await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId;
const popupTarget = async () => (await targets()).find((t) => t.url.startsWith(`chrome-extension://${extId}/popup/`));
const listItems = () => {
  try {
    const seen = new Set();
    return tool('axmenu', pid).split('\n').map((l) => { const [geo, title] = l.split('\t'); const [x, y, w, h] = geo.split(' ').map(Number); return { x, y, w, h, title }; })
      .filter((i) => { const k = `${i.y}|${i.title}`; if (seen.has(k)) return false; seen.add(k); return true; });
  } catch { return []; }
};

ws.onopen = async () => {
  try {
    if (mode === 'prep') {
      const page = (await targets()).find((t) => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
      const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.targetId });
      await send('Browser.setWindowBounds', { windowId, bounds: { left: wx, top: wy, width: ww, height: wh, windowState: 'normal' } });
      const old = await popupTarget();
      if (old) { await evalIn(await attach(old), 'window.close(),1').catch(() => {}); await sleep(400); }
      const sw = (await targets()).find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extId}/`));
      if (!sw) throw new Error('extension service worker not found');
      const sws = await attach(sw);
      await evalIn(sws, `chrome.storage.local.set({selectedVoice:${JSON.stringify(fromVoice)}}).then(()=>1)`);
      await send('Target.activateTarget', { targetId: page.targetId });
      let pop = null;
      for (let attempt = 0; attempt < 4 && !pop; attempt++) {
        await evalIn(sws, 'chrome.action.openPopup().then(()=>"ok",(e)=>String(e))');
        for (let w = 0; w < 2000 && !pop; w += 150) { pop = await popupTarget(); if (!pop) await sleep(150); }
      }
      if (!pop) throw new Error('popup did not open');
      const ps = await attach(pop);
      for (let w = 0; w < 8000; w += 200) {
        const ok = await evalIn(ps, `document.getElementById('statusLabel').textContent==='Connected' && document.getElementById('voiceSelect').value===${JSON.stringify(fromVoice)} && document.querySelectorAll('#voiceSelect optgroup').length>=4`);
        if (ok) break; await sleep(200);
      }
      const geo = await evalIn(ps, `(()=>{const r=document.getElementById('voiceSelect').getBoundingClientRect();const bx=(outerWidth-innerWidth)/2,by=(outerHeight-innerHeight)/2;
        return {popup:[screenX,screenY,outerWidth,outerHeight],select:[screenX+bx+r.left+r.width/2,screenY+by+r.top+r.height/2],value:document.getElementById('voiceSelect').value}})()`);
      console.log('prep', JSON.stringify(geo));
      writeFileSync(outJson, JSON.stringify({ mode, geo }, null, 2));
      process.exit(0);
    }
    const pop = await popupTarget();
    if (!pop) throw new Error('no open popup: run --mode prep first');
    const ps = await attach(pop);
    const geo = await evalIn(ps, `(()=>{const r=document.getElementById('voiceSelect').getBoundingClientRect();const bx=(outerWidth-innerWidth)/2,by=(outerHeight-innerHeight)/2;
      return {select:[Math.round(screenX+bx+r.left+r.width/2),Math.round(screenY+by+r.top+r.height/2)],value:document.getElementById('voiceSelect').value}})()`);
    t0 = Date.now();
    mark('start', geo);
    await until(0.8);
    tool('click', geo.select[0], geo.select[1], 0.05);
    mark('select-click');
    let items = [];
    for (let w = 0; w < 3000 && !items.length; w += 100) { items = listItems(); if (!items.length) await sleep(100); }
    if (!items.length) throw new Error('the native list did not open');
    const voices = items.filter((i) => !/^(American|British) (Female|Male)$/.test(i.title));
    const from = voices.findIndex((i) => i.y === Math.min(...voices.filter((v) => Math.abs(v.y + v.h / 2 - geo.select[1]) < 12).map((v) => v.y)));
    const to = voices.findIndex((i) => i.title === toTitle);
    if (to < 0) throw new Error(`no voice titled ${toTitle}`);
    mark('list-open', { rows: items.length, voices: voices.length, from: voices[Math.max(0, from)]?.title, to: toTitle });
    await until(1.5);
    for (let k = Math.max(0, from); k <= to; k++) {
      const v = voices[k]; tool('move', v.x + 60, v.y + v.h / 2);
      await sleep(step * 1000);
    }
    mark('hover-target');
    await sleep(700);
    const again = listItems().find((i) => i.title === toTitle);
    const target = voices[to];
    if (!again || again.y !== target.y) throw new Error('list closed or moved before the pick; not clicking');
    const out = tool('click', target.x + 60, target.y + target.h / 2, 0.05);
    mark('pick', { downAt: Number(out.match(/down_at=(\d+)/)[1]) });
    tool('move', 1600, 300);
    await sleep(600);
    const after = await evalIn(ps, `({value:document.getElementById('voiceSelect').value,label:document.getElementById('voiceSelect').selectedOptions[0].textContent})`);
    mark('picked', after);
    writeFileSync(outJson, JSON.stringify({ mode, geo, t0, log }, null, 2));
    process.exit(0);
  } catch (err) { console.error('ERR', err.message); writeFileSync(outJson, JSON.stringify({ error: err.message, log })); process.exit(2); }
};

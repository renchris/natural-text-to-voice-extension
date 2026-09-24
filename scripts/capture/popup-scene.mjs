// Popup scene driver (promo video scene c): speak from the real anchored popup, switch the voice in its native
// grouped list, raise the speed, and speak again.
//
// Usage: node popup-scene.mjs <browserWsUrl> <extId> <chromePid> <timeline.json> [options]
//   --sel1 <text>   the first sentence to select and speak (default: s2-british in selections.json)
//   --voice <title> the voice to pick in the native list before the first speak (default Emma)
//   --plus <n>      how many times to press the popup's + speed button before the second speak (default 3: 1.3x)
//   --sel2 <text>   the second sentence (default: s3-speed)
//   --cursor        for a take that RECORDS the cursor: every gesture is real OS input the viewer can follow. Each
//                   sentence is selected with a real drag, the popup is opened by a real click on the pinned toolbar
//                   button (axfind), and the pointer glides between targets and stays where it clicked. Selecting
//                   the second sentence closes the popup (a click on the page does), so it is opened again the same
//                   way before the second Speak, and it reopens on Emma at 1.3x, which is itself part of the story.
//   --scroll2 <px>  cursor mode: before the second selection, scroll the page with a real wheel gesture until that
//                   sentence's first line sits <px> below the toolbar (so its drag lands where no other app's window
//                   is on top); needs room below the article, e.g. --pad 700
//   --pad <px>      add this much bottom padding to the article page before anything happens (off screen at the
//                   start; it only lets the page scroll further). Disclose it with the take.
//
// Page selections go through the DOM (animated word by word; the popup stays open because nothing takes focus from
// it). Everything inside the popup is a REAL OS click at the element's screen position (popup screenX/Y + border +
// the element's rect): the voice box (which opens the native NSMenu), the voice row (found through the
// Accessibility API, re-checked before the click), Speak, and +. The timeline records each speak click's mouse-down
// time (from click.swift) so each scene's clip can be muxed at that click plus the lag measured on the take.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const [wsUrl, extId, pidArg, outJson] = argv;
if (!wsUrl || !extId || !pidArg || !outJson) { console.error('usage: node popup-scene.mjs <ws> <extId> <chromePid> <timeline.json> [...]'); process.exit(64); }
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const sel1 = opt('sel1', 'Scribes murmured as they copied, and a letter that arrived in a village was often read to everyone who gathered to hear it.');
const sel2 = opt('sel2', 'Listening turned long shifts into something closer to a shared education.');
const voiceTitle = opt('voice', 'Emma');
const plus = Number(opt('plus', '3'));
const pid = String(Number(pidArg));
const cursor = argv.includes('--cursor');
const scroll2 = opt('scroll2') ? Number(opt('scroll2')) : null;
const pad = Number(opt('pad', '0'));

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
const evalIn = async (sid, expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sid);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
  return r.result.value;
};
const targets = async () => (await send('Target.getTargets')).targetInfos;
const attach = async (t) => (await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId;
const listItems = () => {
  try {
    return tool('axmenu', pid).split('\n').map((l) => { const [geo, title] = l.split('\t'); const [x, y, w, h] = geo.split(' ').map(Number); return { x, y, w, h, title }; });
  } catch { return []; }
};
const glide = (x, y, secs, drag = false) => tool('glide', Math.round(x), Math.round(y), secs, ...(drag ? ['--drag'] : []));
const clickAt = (x, y) => tool('click', x, y, 0.05, ...(cursor ? ['--stay'] : []));
// The front-most normal window under a screen point must be the capture browser's (winlist lists front to back).
function assertOnCapture(x, y, what) {
  for (const l of tool('winlist').split('\n')) {
    const m = l.match(/pid=(\d+) layer=(-?\d+) onscreen=true .*bounds=(-?\d+),(-?\d+) (\d+)x(\d+)$/);
    if (!m || m[2] !== '0') continue;
    const [bx, by, bw, bh] = m.slice(3).map(Number);
    if (x < bx || y < by || x >= bx + bw || y >= by + bh) continue;
    if (m[1] !== pid) throw new Error(`${what}: another app's window is on top at ${x},${y}; not pressing`);
    return;
  }
  throw new Error(`${what}: no window at ${x},${y}`);
}
// A real drag over exactly this sentence: the first and last characters come from the DOM, the drag is OS input.
const dragSelect = async (ps, text) => {
  const e = await evalIn(ps, `(()=>{const t=${JSON.stringify(text)};const p=[...document.querySelectorAll('article p')].find(p=>p.textContent.includes(t));
    const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n,total=0,chars=[];while(n=w.nextNode()){chars.push([n,total]);total+=n.length}
    const all=chars.map(c=>c[0].data).join('');const a=all.indexOf(t),b=a+t.length;
    const at=(pos)=>{for(const [nd,start] of chars){if(start<=pos&&pos<start+nd.length)return [nd,pos-start]}};
    const rect=(pos)=>{const r=document.createRange();const [nd,o]=at(pos);r.setStart(nd,o);r.setEnd(nd,o+1);return r.getBoundingClientRect()};
    const f=rect(a),l=rect(b-1),oy=screenY+outerHeight-innerHeight;
    return [screenX+f.left+1,oy+f.top+f.height/2,screenX+l.right-1,oy+l.top+l.height/2]})()`);
  assertOnCapture(Math.round(e[0]), Math.round(e[1]), 'drag start'); assertOnCapture(Math.round(e[2]), Math.round(e[3]), 'drag end');
  glide(e[0], e[1], 0.5);
  glide(e[2], e[3], 0.9, true);
  await sleep(120);
  const got = await evalIn(ps, 'getSelection().toString()');
  if (got.replace(/\s+/g, ' ').trim() !== text) throw new Error(`drag selected ${JSON.stringify(got)}; retake`);
  return got;
};
const actionButton = () => {
  const [x, y] = tool('axfind', pid, 'Natural TTS', 'AXPopUpButton').split(/[ \t]/).map(Number);
  assertOnCapture(x, y, 'toolbar button');
  return [x, y];
};
const selectIn = (ps, text) => async (steps = 22) => {
  for (let i = 1; i <= steps; i++) {
    await evalIn(ps, `(()=>{const t=${JSON.stringify(text)};const p=[...document.querySelectorAll('article p')].find(p=>p.textContent.includes(t));
      const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n,total=0,chars=[];while(n=w.nextNode()){chars.push([n,total]);total+=n.length}
      const all=chars.map(c=>c[0].data).join('');const a=all.indexOf(t),b=a+t.length;let target=a+Math.floor((b-a)*${i}/${steps});
      if(${i}<${steps}){const sp=all.indexOf(' ',target);target=sp<0||sp>b?b:sp}
      const at=(pos)=>{let node=chars[0][0],off=0;for(const [nd,start] of chars){if(start<=pos){node=nd;off=Math.min(nd.length,pos-start)}}return [node,off]};
      const r=document.createRange();r.setStart(...at(a));r.setEnd(...at(target));const s=getSelection();s.removeAllRanges();s.addRange(r);return 1})()`);
    await sleep(40);
  }
  return evalIn(ps, 'getSelection().toString()');
};

ws.onopen = async () => {
  try {
    const all = await targets();
    const page = all.find((t) => t.type === 'page' && t.url.startsWith('https://essays.example/'));
    if (!page) throw new Error('article page not found');
    const ps = await attach(page);
    if (pad) await evalIn(ps, `document.body.style.paddingBottom='${pad}px'`);
    if (cursor) {
      await send('Page.bringToFront', {}, ps);
      await sleep(400);
      const r = await evalIn(ps, `[screenX+innerWidth-160,screenY+outerHeight-innerHeight+innerHeight*0.6]`);
      tool('move', Math.round(r[0]), Math.round(r[1]));
    } else tool('move', 1700, 300);
    t0 = Date.now();
    mark('start');
    // 1) select the first sentence
    await sleep(500);
    mark('select1', { chars: (cursor ? await dragSelect(ps, sel1) : await selectIn(ps, sel1)()).length });
    // 2) open the real anchored popup
    await sleep(400);
    const sw = (await targets()).find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extId}/`));
    const sws = cursor ? null : await attach(sw);
    const openPopup = async () => {
      let pop = null;
      for (let a = 0; a < (cursor ? 1 : 4) && !pop; a++) {
        if (cursor) {
          // looked up again after the glide: Chrome's media-controls button appears while audio plays and shifts the icons
          let [bx, by] = actionButton(); glide(bx, by, 0.6);
          const [nx, ny] = actionButton(); if (nx !== bx || ny !== by) { glide(nx, ny, 0.25); [bx, by] = [nx, ny]; }
          const o = clickAt(bx, by); mark('popup-click', { downAt: Number(o.match(/down_at=(\d+)/)[1]) }); }
        else await evalIn(sws, 'chrome.action.openPopup().then(()=>"ok",(e)=>String(e))');
        for (let w = 0; w < 2000 && !pop; w += 100) { pop = (await targets()).find((t) => t.url.startsWith(`chrome-extension://${extId}/popup/`)); if (!pop) await sleep(100); }
      }
      if (!pop) throw new Error('popup did not open');
      return attach(pop);
    };
    let pops = await openPopup();
    for (let w = 0; w < 6000; w += 100) { if (await evalIn(pops, `document.getElementById('statusLabel').textContent==='Connected' && document.querySelectorAll('#voiceSelect optgroup').length>=4`)) break; await sleep(100); }
    mark('popup-open');
    const at = async (sel) => evalIn(pops, `(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();const bx=(outerWidth-innerWidth)/2,by=(outerHeight-innerHeight)/2;
      return [Math.round(screenX+bx+r.left+r.width/2),Math.round(screenY+by+r.top+r.height/2)]})()`);
    // 3) the native voice list: open it, walk to the voice, pick it
    await sleep(700);
    const [sx, sy] = await at('#voiceSelect');
    if (cursor) glide(sx, sy, 0.5);
    clickAt(sx, sy);
    let items = [];
    for (let w = 0; w < 3000 && !items.length; w += 100) { items = listItems(); if (!items.length) await sleep(100); }
    if (!items.length) throw new Error('the native list did not open');
    mark('list-open', { rows: items.length });
    const voices = items.filter((i) => !/^(American|British) (Female|Male)$/.test(i.title));
    const cur = await evalIn(pops, `document.getElementById('voiceSelect').selectedOptions[0].textContent`);
    const from = Math.max(0, voices.findIndex((v) => v.title === cur));
    const to = voices.findIndex((v) => v.title === voiceTitle);
    if (to < 0) throw new Error('no voice ' + voiceTitle);
    await sleep(500);
    if (cursor) glide(voices[to].x + 60, voices[to].y + voices[to].h / 2, 1.3);   // the highlight follows the pointer row by row
    else for (let k = from; k <= to; k++) { tool('move', voices[k].x + 60, voices[k].y + voices[k].h / 2); await sleep(15); }
    await sleep(600);
    const again = listItems().find((i) => i.title === voiceTitle);
    if (!again || again.y !== voices[to].y) throw new Error('list closed or moved; not clicking');
    clickAt(voices[to].x + 60, voices[to].y + voices[to].h / 2);
    if (!cursor) tool('move', 1700, 300);
    await sleep(500); // the select's value changes after the list's closing flash
    mark('voice-picked', { value: await evalIn(pops, `document.getElementById('voiceSelect').value`) });
    // 4) Speak (real click), then wait for the popup to return to idle
    const speak = async (label) => {
      const [bx, by] = await at('#speakButton');
      if (cursor) glide(bx, by, 0.5);
      const out = clickAt(bx, by);
      if (!cursor) tool('move', 1700, 300);
      const downAt = Number(out.match(/down_at=(\d+)/)[1]);
      mark(label, { downAt, tDown: (downAt - t0) / 1000 });
      await sleep(600);
      for (let w = 0; w < 20000; w += 100) {
        const idle = await evalIn(pops, `!document.getElementById('speakButton').classList.contains('is-playing') && !document.getElementById('speakButton').classList.contains('is-loading')`);
        if (idle) break; await sleep(100);
      }
      mark(label + '-end');
    };
    await sleep(900);
    await speak('speak1');
    // 5) raise the speed with the popup's own + button
    await sleep(500);
    for (let k = 0; k < plus; k++) { const [px, py] = await at('button.speed-step[data-delta="0.1"]'); if (cursor && k === 0) glide(px, py, 0.5); clickAt(px, py); await sleep(300); }
    if (!cursor) tool('move', 1700, 300);
    mark('speed', { value: await evalIn(pops, `document.getElementById('speedValue').textContent`) });
    // 6) select the second sentence and speak again
    await sleep(400);
    if (cursor && scroll2 != null) {
      const g = await evalIn(ps, `(()=>{const t=${JSON.stringify(sel2)};const p=[...document.querySelectorAll('article p')].find(p=>p.textContent.includes(t));
        const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n,total=0,chars=[];while(n=w.nextNode()){chars.push([n,total]);total+=n.length}
        const a=chars.map(c=>c[0].data).join('').indexOf(t);let node,off;for(const [nd,st] of chars){if(st<=a&&a<st+nd.length){node=nd;off=a-st}}
        const r=document.createRange();r.setStart(node,off);r.setEnd(node,off+1);const b=r.getBoundingClientRect();
        return {dy:Math.round(b.top-${scroll2}),x:screenX+innerWidth*0.3,y:screenY+outerHeight-innerHeight+innerHeight*0.72}})()`);
      assertOnCapture(Math.round(g.x), Math.round(g.y), 'scroll point');
      glide(g.x, g.y, 0.6);
      mark('scroll', { out: tool('scroll', g.dy, 0.9) });
      await sleep(350);
    }
    if (cursor) {
      mark('select2', { chars: (await dragSelect(ps, sel2)).length });   // this click on the page closes the popup
      await sleep(400);
      pops = await openPopup();
      for (let w = 0; w < 6000; w += 100) { if (await evalIn(pops, `document.getElementById('statusLabel').textContent==='Connected'`)) break; await sleep(100); }
      mark('popup-reopen', { voice: await evalIn(pops, `document.getElementById('voiceSelect').value`), speed: await evalIn(pops, `document.getElementById('speedValue').textContent`) });
    } else mark('select2', { chars: (await selectIn(ps, sel2)()).length });
    await sleep(500);
    await speak('speak2');
    writeFileSync(outJson, JSON.stringify({ t0, log }, null, 2));
    process.exit(0);
  } catch (err) { console.error('ERR', err.message); writeFileSync(outJson, JSON.stringify({ error: err.message, log })); process.exit(2); }
};

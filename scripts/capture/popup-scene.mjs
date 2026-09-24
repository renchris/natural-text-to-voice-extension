// Popup scene driver (promo video scene c): speak from the real anchored popup, switch the voice in its native
// grouped list, raise the speed, and speak again.
//
// Usage: node popup-scene.mjs <browserWsUrl> <extId> <chromePid> <timeline.json> [options]
//   --sel1 <text>   the first sentence to select and speak (default: s2-british in selections.json)
//   --voice <title> the voice to pick in the native list before the first speak (default Emma)
//   --plus <n>      how many times to press the popup's + speed button before the second speak (default 3: 1.3x)
//   --sel2 <text>   the second sentence (default: s3-speed)
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
    tool('move', 1700, 300);
    t0 = Date.now();
    mark('start');
    // 1) select the first sentence
    await sleep(500);
    mark('select1', { chars: (await selectIn(ps, sel1)()).length });
    // 2) open the real anchored popup
    await sleep(400);
    const sw = (await targets()).find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extId}/`));
    const sws = await attach(sw);
    let pop = null;
    for (let a = 0; a < 4 && !pop; a++) {
      await evalIn(sws, 'chrome.action.openPopup().then(()=>"ok",(e)=>String(e))');
      for (let w = 0; w < 2000 && !pop; w += 100) { pop = (await targets()).find((t) => t.url.startsWith(`chrome-extension://${extId}/popup/`)); if (!pop) await sleep(100); }
    }
    if (!pop) throw new Error('popup did not open');
    const pops = await attach(pop);
    for (let w = 0; w < 6000; w += 100) { if (await evalIn(pops, `document.getElementById('statusLabel').textContent==='Connected' && document.querySelectorAll('#voiceSelect optgroup').length>=4`)) break; await sleep(100); }
    mark('popup-open');
    const at = async (sel) => evalIn(pops, `(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();const bx=(outerWidth-innerWidth)/2,by=(outerHeight-innerHeight)/2;
      return [Math.round(screenX+bx+r.left+r.width/2),Math.round(screenY+by+r.top+r.height/2)]})()`);
    // 3) the native voice list: open it, walk to the voice, pick it
    await sleep(700);
    const [sx, sy] = await at('#voiceSelect');
    tool('click', sx, sy, 0.05);
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
    for (let k = from; k <= to; k++) { tool('move', voices[k].x + 60, voices[k].y + voices[k].h / 2); await sleep(15); }
    await sleep(600);
    const again = listItems().find((i) => i.title === voiceTitle);
    if (!again || again.y !== voices[to].y) throw new Error('list closed or moved; not clicking');
    tool('click', voices[to].x + 60, voices[to].y + voices[to].h / 2, 0.05);
    tool('move', 1700, 300);
    await sleep(500); // the select's value changes after the list's closing flash
    mark('voice-picked', { value: await evalIn(pops, `document.getElementById('voiceSelect').value`) });
    // 4) Speak (real click), then wait for the popup to return to idle
    const speak = async (label) => {
      const [bx, by] = await at('#speakButton');
      const out = tool('click', bx, by, 0.05);
      tool('move', 1700, 300);
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
    for (let k = 0; k < plus; k++) { const [px, py] = await at('button.speed-step[data-delta="0.1"]'); tool('click', px, py, 0.05); await sleep(300); }
    tool('move', 1700, 300);
    mark('speed', { value: await evalIn(pops, `document.getElementById('speedValue').textContent`) });
    // 6) select the second sentence and speak again
    await sleep(400);
    mark('select2', { chars: (await selectIn(ps, sel2)()).length });
    await sleep(500);
    await speak('speak2');
    writeFileSync(outJson, JSON.stringify({ t0, log }, null, 2));
    process.exit(0);
  } catch (err) { console.error('ERR', err.message); writeFileSync(outJson, JSON.stringify({ error: err.message, log })); process.exit(2); }
};

// Hero-video driver: the demo article, paragraph 2 selected, the NATIVE context menu, "Speak selected text".
//
// Usage: node hero.mjs <browserWsUrl> <extId> <pageUrlSubstring> <timeline.json> [options]
//   --mode prep|menu|full   prep: scroll paragraph 2 into place and clear the selection, then exit (run it before
//                           the recorder starts, so the first frame is already steady).
//                           menu: select, right-click, hover "Speak selected text", then run --shot and leave the
//                           menu open (store screenshot 1). full (default): the timed hero take, ending in a click.
//   --para <text>           the start of the paragraph to select (default: paragraph 2 of the demo article)
//   --sel <text>            select exactly this sentence (inside whichever paragraph contains it) instead of the
//                           whole paragraph; prep then places that paragraph with --top
//   --top <px>              where paragraph 2's top edge sits in the viewport after prep (default 300)
//   --park <x,y>            screen point to park the real cursor before the menu opens (default 1600,300); it
//                           must be off the capture window, or the menu opens with an item under the cursor
//   --shot <cmd>            menu mode: shell command run while "Speak selected text" is highlighted
//   --at k=s,...            full mode: override the schedule (select, right, hover, click; seconds from start)
//   --pid <pid>             the capture browser's main pid (CHROME_PID in env.txt), for axmenu
//   --popup-at <s>          full mode: open the real anchored toolbar popup at this second (chrome.action.openPopup
//                           from the service worker), to show the speaking state; omit for no popup
//   --cursor                full mode, for a take that RECORDS the cursor (sckrec without --no-cursor): every gesture
//                           is real OS input the viewer can follow. A real drag selects the text (glide --drag from
//                           the first character to the last), a real right-click opens the menu, the pointer glides
//                           onto the item and clicks it, and with --popup-at it glides to the pinned toolbar button
//                           (found through Accessibility, axfind) and clicks it: the popup opens the way a user opens
//                           it. The window is brought to the front first, and every point is checked to be on the
//                           capture window (winlist z-order) before anything is pressed there.
//
// Without --cursor, real input only where it matters: the selection is set through the DOM (animated word by word), the right-click
// is a CDP mouse event (which is what opens Chrome's native NSMenu), and the hover and the click on the menu item
// are real OS events (move, click from build.sh), because CDP cannot reach a native menu. The menu item is located
// through the Accessibility API (axmenu), never by a hard-coded offset. Every step's wall time goes into the
// timeline, and the click's own mouse-down time comes from click.swift, so audio can be muxed at the right frame.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const [wsUrl, extId, match, outJson] = argv;
if (!wsUrl || !extId || !match || !outJson) {
  console.error('usage: node hero.mjs <browserWsUrl> <extId> <pageUrlSubstring> <timeline.json> [--mode prep|menu|full] [...]');
  process.exit(64);
}
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const mode = opt('mode', 'full');
const paraText = opt('para', 'Reading aloud never really left us');
const selText = opt('sel', '');
const top = Number(opt('top', '300'));
const [parkX, parkY] = opt('park', '1600,300').split(',').map(Number);
const shot = opt('shot', '');
const popupAt = opt('popup-at') ? Number(opt('popup-at')) : null;
const cursor = argv.includes('--cursor');
// full-mode schedule, seconds from start
const AT = { select: 0.8, right: 2.7, hover: 3.5, click: 4.4 };
for (const kv of (opt('at', '') || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); AT[k] = Number(v); }

const tool = (name, ...args) => execFileSync(name, args.map(String), { encoding: 'utf8' }).trim();
const ws = new WebSocket(wsUrl);
let seq = 0; const pending = new Map(); const log = [];
let t0 = Date.now(); // reset at 'start', so the schedule does not absorb connection set-up
const mark = (step, extra = {}) => { const t = (Date.now() - t0) / 1000; log.push({ step, t, wall: Date.now(), ...extra }); console.log(t.toFixed(3), step, Object.keys(extra).length ? JSON.stringify(extra) : ''); };
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
const findPara = selText
  ? `[...document.querySelectorAll('article p')].find(p=>p.textContent.replace(/\\s+/g,' ').includes(${JSON.stringify(selText)}))`
  : `[...document.querySelectorAll('article p')].find(p=>p.innerText.trim().startsWith(${JSON.stringify(paraText)}))`;

async function menuItem(title, ms = 3000) {
  for (let w = 0; w < ms; w += 100) {
    try { const [x, y] = tool('axmenu', String(chromePid), title).split(' ').map(Number); return { x, y }; } catch { await sleep(100); }
  }
  throw new Error(`menu item "${title}" did not appear`);
}
let chromePid;
const glide = (x, y, secs, drag = false) => tool('glide', Math.round(x), Math.round(y), secs, ...(drag ? ['--drag'] : []));
// The front-most normal window (layer 0) under a screen point must be the capture browser's, or a real press there
// would land in another app. winlist lists windows front to back.
function assertOnCapture(x, y, what) {
  for (const l of tool('winlist').split('\n')) {
    const m = l.match(/pid=(\d+) layer=(-?\d+) onscreen=true .*bounds=(-?\d+),(-?\d+) (\d+)x(\d+)$/);
    if (!m || m[2] !== '0') continue;
    const [bx, by, bw, bh] = m.slice(3).map(Number);
    if (x < bx || y < by || x >= bx + bw || y >= by + bh) continue;
    if (Number(m[1]) !== chromePid) throw new Error(`${what}: another app's window is on top at ${x},${y}; not pressing`);
    return;
  }
  throw new Error(`${what}: no window at ${x},${y}`);
}

ws.onopen = async () => {
  try {
    const { targetInfos } = await send('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page' && t.url.includes(match));
    if (!page) throw new Error('page target not found for ' + match);
    const { sessionId: ps } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    chromePid = Number(opt('pid', '0')) || Number(tool('pgrep', '-f', `remote-debugging-port=${new URL(wsUrl).port}`).split('\n')[0]);
    if (mode === 'prep') {
      const r = await evalIn(ps, `(()=>{const p=${findPara};getSelection().removeAllRanges();
        document.documentElement.style.scrollBehavior='auto';scrollTo(0,0);scrollTo(0,p.getBoundingClientRect().top-${top});
        const b=p.getBoundingClientRect();return {top:b.top,bottom:b.bottom,scrollY}})()`);
      console.log('prep', JSON.stringify(r));
      process.exit(0);
    }
    let parked;
    if (cursor) {
      await send('Page.bringToFront', {}, ps);
      await sleep(400);
      const r = await evalIn(ps, `(()=>{const p=${findPara};const b=p.getBoundingClientRect();
        return [screenX+Math.min(innerWidth-110,b.right+80),screenY+outerHeight-innerHeight+(b.top+b.bottom)/2]})()`);
      parked = tool('move', r[0], r[1]);               // rests in the page, in view from the first frame
    } else parked = tool('move', parkX, parkY);
    const orig = parked.match(/orig=(\d+) (\d+)/).slice(1).map(Number);
    t0 = Date.now();
    mark('start', { parked });
    // 1) animated selection of paragraph 2, word boundary by word boundary (~1.4 s)
    await until(mode === 'full' ? AT.select : 0.2);
    const geo = await evalIn(ps, `(()=>{const p=${findPara};window.__p=p;
      const text=p.innerText.trim();const b=p.getBoundingClientRect();
      return {words:text.split(/\\s+/).length,chars:text.length,left:b.left,top:b.top,bottom:b.bottom,
        screenX,screenY,chromeH:outerHeight-innerHeight,innerW:innerWidth}})()`);
    mark('select-begin', { words: geo.words });
    const toScreen = (x, y) => [geo.screenX + x, geo.screenY + geo.chromeH + y];
    if (cursor) {
      // the first and last character of the text to select, from the DOM; the drag itself is real
      const ends = await evalIn(ps, `(()=>{const p=window.__p;const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n,total=0,chars=[];
        while(n=w.nextNode()){chars.push([n,total]);total+=n.length}
        const all=chars.map(c=>c[0].data).join('');const sel=${JSON.stringify(selText)};
        let a=sel?all.indexOf(sel):0, b=sel?a+sel.length:total; if(a<0) throw new Error('sentence not found');
        while(/\\s/.test(all[a]))a++; while(/\\s/.test(all[b-1]))b--;
        const at=(pos)=>{let node=chars[0][0],off=0;for(const [nd,start] of chars){if(start<=pos&&pos<start+nd.length){node=nd;off=pos-start}}return [node,off]};
        const rect=(pos)=>{const r=document.createRange();const [nd,o]=at(pos);r.setStart(nd,o);r.setEnd(nd,o+1);return r.getBoundingClientRect()};
        const f=rect(a),l=rect(b-1);getSelection().removeAllRanges();
        return {x1:f.left+1,y1:f.top+f.height/2,x2:l.right-1,y2:l.top+l.height/2}})()`);
      const [sx, sy] = toScreen(ends.x1, ends.y1), [ex, ey] = toScreen(ends.x2, ends.y2);
      assertOnCapture(sx, sy, 'drag start'); assertOnCapture(ex, ey, 'drag end');
      glide(sx, sy, 0.55);
      const d = glide(ex, ey, selText ? 0.9 : 1.5, true);
      mark('drag', { from: [sx, sy], to: [ex, ey], out: d });
      await sleep(120);
    }
    const steps = cursor ? 0 : 28;
    for (let i = 1; i <= steps; i++) {
      await evalIn(ps, `(()=>{const p=window.__p;const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n,total=0,chars=[];
        while(n=w.nextNode()){chars.push([n,total]);total+=n.length}
        const all=chars.map(c=>c[0].data).join('');const sel=${JSON.stringify(selText)};
        const a=sel?all.indexOf(sel):0, b=sel?a+sel.length:total; if(a<0) throw new Error('sentence not found');
        let target=a+Math.floor((b-a)*${i}/${steps});
        if(${i}<${steps}){const sp=all.indexOf(' ',target);target=sp<0||sp>b?b:sp}
        const at=(pos)=>{let node=chars[0][0],off=0;for(const [nd,start] of chars){if(start<=pos){node=nd;off=Math.min(nd.length,pos-start)}}return [node,off]};
        const r=document.createRange();r.setStart(...at(a));r.setEnd(...at(target));const s=getSelection();s.removeAllRanges();s.addRange(r);return 1})()`);
      await sleep(45);
    }
    const selected = await evalIn(ps, 'getSelection().toString()');
    mark('select-done', { chars: selected.length });
    if (cursor) {
      const want = await evalIn(ps, `${JSON.stringify(selText)}||window.__p.innerText.trim()`);
      if (selected.replace(/\s+/g, ' ').trim() !== want.replace(/\s+/g, ' ').trim()) throw new Error(`drag selected ${JSON.stringify(selected)}, not the text; retake`);
    }
    // 2) native context menu: a CDP right-click inside the selection (first line, ~200 CSS px in)
    const first = await evalIn(ps, `(()=>{const r=getSelection().getRangeAt(0).getClientRects()[0];return {x:r.left,y:r.top,w:r.width,h:r.height}})()`);
    const cx = first.x + Math.min(200, first.w / 2), cy = first.y + first.h / 2;
    if (cursor) {
      const [rx, ry] = toScreen(cx, cy);
      assertOnCapture(rx, ry, 'right-click');
      await until(Math.max(0, AT.right - 0.45));
      glide(rx, ry, 0.4);
      await until(AT.right);
      const out = tool('click', rx, ry, 0.05, '--right', '--stay');
      mark('right-click', { css: [cx, cy], screen: [rx, ry], downAt: Number(out.match(/down_at=(\d+)/)[1]) });
    } else {
      await until(mode === 'full' ? AT.right : 1.9);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy }, ps);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'right', clickCount: 1 }, ps);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'right', clickCount: 1 }, ps);
      mark('right-click', { css: [cx, cy], screen: [geo.screenX + cx, geo.screenY + geo.chromeH + cy] });
    }
    const item = await menuItem('Speak selected text');
    let items = ''; try { items = tool('axmenu', String(chromePid)); } catch { /* listed below if possible */ }
    mark('menu-open', { item, items: items.split('\n') });
    // 3) real cursor onto the item (highlight), then either the still or the real click
    if (mode === 'menu') {
      await sleep(300);
      const out = tool('hover', item.x, item.y, 0.6, shot || 'true');
      mark('menu-shot', { out });
      // hover restores the cursor to the parked point; the menu stays open (close the browser, or click outside)
      writeFileSync(outJson, JSON.stringify({ t0, mode, geo, selected, orig, item, log }, null, 2));
      process.exit(0);
    }
    await until(AT.hover);
    if (cursor) glide(item.x, item.y, 0.35); else tool('move', item.x, item.y);
    mark('hover');
    await until(AT.click - 0.05);
    // Never click blind: if the menu closed (the operator clicked elsewhere), the point is some other window.
    const again = await menuItem('Speak selected text', 300).catch(() => null);
    if (!again || again.x !== item.x || again.y !== item.y) throw new Error('menu closed or moved before the click; not clicking');
    const out = tool('click', item.x, item.y, 0.05, ...(cursor ? ['--stay'] : []));
    const downAt = Number(out.match(/down_at=(\d+)/)[1]);
    mark('speak-click', { downAt, tDown: (downAt - t0) / 1000 });
    if (!cursor) tool('move', parkX, parkY);
    // 4) optional: the real anchored popup, opened from the service worker, shows the speaking state
    if (popupAt != null && cursor) {
      // the real way: the pointer goes to the pinned toolbar button and clicks it
      // Located only now, and again after the glide: once audio plays, Chrome adds its media-controls button to the
      // toolbar and every icon to its right shifts, so a position read earlier can be the Extensions (puzzle) button.
      const findButton = () => tool('axfind', chromePid, 'Natural TTS', 'AXPopUpButton').split(/[ \t]/).slice(0, 2).map(Number);
      await until(popupAt - 0.75);
      let [bx, by] = findButton();
      assertOnCapture(bx, by, 'toolbar button');
      glide(bx, by, 0.6);
      const [nx, ny] = findButton();
      if (nx !== bx || ny !== by) { glide(nx, ny, 0.25); [bx, by] = [nx, ny]; }
      await until(popupAt);
      if (findButton().join() !== [bx, by].join()) throw new Error('toolbar button moved before the click; not clicking');
      const o = tool('click', bx, by, 0.05, '--stay');
      mark('popup-click', { at: [bx, by], downAt: Number(o.match(/down_at=(\d+)/)[1]) });
      await sleep(900);
      glide(bx - 430, by + 260, 0.6);                 // off the popup, onto the page, so no tooltip shows
      mark('cursor-rest');
    } else if (popupAt != null) {
      await until(popupAt);
      const sw = (await send('Target.getTargets')).targetInfos
        .find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extId}/`));
      if (!sw) throw new Error('extension service worker not found');
      const { sessionId: sws } = await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
      const r = await evalIn(sws, 'chrome.action.openPopup().then(()=>"ok",(e)=>String(e))');
      mark('popup-open', { r });
    }
    // The cursor stays parked until the recorder stops; put it back afterwards with: move <orig>.
    writeFileSync(outJson, JSON.stringify({ t0, mode, geo, selected, orig, item, log }, null, 2));
    process.exit(0);
  } catch (err) { console.error('ERR', err.message); writeFileSync(outJson, JSON.stringify({ error: err.message, log })); process.exit(2); }
};

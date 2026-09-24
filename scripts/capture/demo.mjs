// Timed hero-demo driver over raw CDP (CfT --load-extension, or branded Chrome + Extensions.loadUnpacked).
// Usage: node demo.mjs <browserWsUrl> <extId> <pageUrlSubstring> <timeline.json> [paragraphSelector] [--text <exact text>]
//                     [--menu-only]
//   paragraphSelector defaults to '#mw-content-text p' (a Wikipedia article); the first match longer
//   than 200 characters is selected.
// Steps: animate a text selection -> open the REAL toolbar popup -> bump speed x3 inside the popup
//        -> close popup -> native right-click context menu.
// --text "<exact text>": select only that text inside the paragraph (a clip that is one sentence, such as
//   s1-rightclick), instead of the whole paragraph. The paragraph is then the first match that contains it.
// --menu-only (the README hero, GUI_PASS.md "Hero video"): animate the selection, then open the native context menu
//   at 2.4 s. No popup and no speed change, so the speech stays at the 1.0x of hero.wav. It exits with the menu open;
//   the caller hovers and clicks "Speak selected text" with the native tools and records that click's wall time.
// Popup: Extensions.triggerAction on the tab target selected BY URL (never the first 'tab' target: the
// hidden component-extension page is listed first and crashed Chrome 153 6/6). If no popup target
// appears, retry with chrome.action.openPopup() from the service worker (R09 verifier: pinned
// openPopup 3/3, pinned triggerAction 6/7).
// Writes wall-clock timestamps per step so audio can be muxed at the exact offset later.
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
let MENU_ONLY = false, ONLY = null;
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--menu-only') MENU_ONLY = true;
  else if (args[i] === '--text') ONLY = args[++i];
  else pos.push(args[i]);
}
const [wsUrl, extId, match, outJson, paraSel = '#mw-content-text p'] = pos;
if (!wsUrl || !extId || !match || !outJson) {
  console.error('usage: node demo.mjs <browserWsUrl> <extId> <pageUrlSubstring> <timeline.json> [paragraphSelector] [--text <exact text>] [--menu-only]');
  process.exit(64);
}
const ws = new WebSocket(wsUrl);
let seq = 0; const pending = new Map(); const log = [];
const t0 = Date.now();
const mark = (step) => { const t = (Date.now() - t0) / 1000; log.push({ step, t, wall: Date.now() }); console.log(t.toFixed(3), step); };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const m = { id: ++seq, method, params }; if (sessionId) m.sessionId = sessionId;
  pending.set(m.id, { res, rej }); ws.send(JSON.stringify(m));
});
ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = m.id && pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (sec) => { const d = t0 + sec * 1000 - Date.now(); if (d > 0) await sleep(d); };
const evalIn = async (sid, expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sid)).result.value;

ws.onopen = async () => {
  try {
    const { targetInfos } = await send('Target.getTargets', { filter: [{}] });
    const page = targetInfos.find((t) => t.type === 'page' && t.url.includes(match));
    const tab = targetInfos.find((t) => t.type === 'tab' && t.url.includes(match));
    if (!page || !tab) throw new Error('page/tab target not found for ' + match);
    await send('Target.activateTarget', { targetId: page.targetId });
    const { sessionId: ps } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    mark('start');
    // 1) animated selection of the lead paragraph, word by word (~1.2 s)
    await until(0.6);
    const words = await evalIn(ps, `(()=>{const only=${JSON.stringify(ONLY)};
      const p=[...document.querySelectorAll(${JSON.stringify(paraSel)})].find(x=>only?x.textContent.includes(only):x.innerText.trim().length>200);
      if(!p) throw new Error('no paragraph matches');
      const from=only?p.textContent.indexOf(only):0; window.__from=from; window.__to=only?from+only.length:p.textContent.length;
      p.scrollIntoView({block:'center'}); window.__p=p; return (only||p.innerText).split(/\\s+/).length})()`);
    mark('select-begin');
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      await evalIn(ps, `(()=>{const p=window.__p;const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n,total=0,chars=[];while(n=walker.nextNode()){chars.push([n,total]);total+=n.length}
        const at=(pos)=>{let node=chars[0][0],o=0;for(const [nd,start] of chars){if(start<=pos){node=nd;o=Math.min(nd.length,pos-start)}}return [node,o]};
        const target=window.__from+Math.floor((window.__to-window.__from)*${i}/${steps});
        const r=document.createRange();r.setStart(...at(window.__from));r.setEnd(...at(target));const s=getSelection();s.removeAllRanges();s.addRange(r);return 1})()`);
      await sleep(50);
    }
    mark('select-done');
    // Right-click INSIDE the selection (its first line): a right-click outside it makes macOS select the word under
    // the pointer instead, which would replace a one-sentence selection.
    const box = await evalIn(ps, `(()=>{const r=getSelection().getRangeAt(0).getClientRects()[0];
      return {x:r.x+Math.min(120,r.width/2),y:r.y+r.height/2}})()`);
    if (MENU_ONLY) {
      await until(2.4);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }, ps);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 }, ps);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 }, ps);
      mark('context-menu');
      const selected = await evalIn(ps, 'getSelection().toString()');
      writeFileSync(outJson, JSON.stringify({ t0, words, selected, box, mode: 'menu-only', log }, null, 2));
      process.exit(0);
    }
    // 2) open the real toolbar popup anchored to the action icon
    await until(2.2);
    const findPopup = async () => (await send('Target.getTargets')).targetInfos
      .find((t) => t.url.startsWith(`chrome-extension://${extId}/popup/`));
    const waitPopup = async (ms) => { for (let w = 0; w < ms; w += 150) { const p = await findPopup(); if (p) return p; await sleep(150); } return null; };
    await send('Extensions.triggerAction', { id: extId, targetId: tab.targetId });
    let pop = await waitPopup(900);
    for (let attempt = 1; !pop && attempt <= 3; attempt++) {
      console.error(`popup target missing; openPopup() retry ${attempt}/3`);
      const sw = (await send('Target.getTargets')).targetInfos
        .find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extId}/`));
      if (!sw) throw new Error('extension service worker not found (idle? open the popup once to wake it)');
      await send('Target.activateTarget', { targetId: page.targetId });
      const { sessionId: sws } = await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
      await send('Runtime.evaluate', { expression: 'chrome.action.openPopup().then(()=>1,(e)=>String(e))', awaitPromise: true, returnByValue: true }, sws);
      pop = await waitPopup(1500);
    }
    if (!pop) throw new Error('popup did not open after triggerAction + 3 openPopup retries');
    mark('popup-open');
    await sleep(400); // popup fade-in (R09: wait >= 400 ms before any capture)
    const { sessionId: pops } = await send('Target.attachToTarget', { targetId: pop.targetId, flatten: true });
    // 3) bump speed three times (1.0x -> 1.3x) using the popup's own + button
    for (const at of [3.6, 4.1, 4.6]) {
      await until(at);
      await evalIn(pops, `document.querySelector('button.speed-step[data-delta="0.1"]').click()`);
      mark('speed+');
    }
    const speed = await evalIn(pops, `document.getElementById('speedValue').textContent`);
    // 4) close popup, then native right-click menu on the selection
    await until(6.0);
    await evalIn(pops, 'window.close()');
    mark('popup-closed');
    await until(6.6);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }, ps);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 }, ps);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 }, ps);
    mark('context-menu');
    writeFileSync(outJson, JSON.stringify({ t0, words, speed, box, log }, null, 2));
    process.exit(0);
  } catch (err) { console.error('ERR', err.message); writeFileSync(outJson, JSON.stringify({ error: err.message, log })); process.exit(2); }
};

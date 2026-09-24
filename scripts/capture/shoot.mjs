// Headless-safe capture of an extension page (or any page) through CDP only: no window server, no cursor.
//
// Usage:
//   node shoot.mjs <browserWsUrl> <url> [--png out.png] [--cast <dir> --secs N] [--width 360] [--dpr 2]
//                  [--settle ms] [--wait-for <js>] [--before <js>] [--at <ms>:<js>]... [--fit]
//
//   Opens <url> in a new tab, forces the light colour scheme and a viewport <width> CSS px wide at <dpr>, waits
//   <settle> ms (default 1500), then (with --wait-for) until the expression is truthy (15 s cap, else exit 4), and
//   with --fit resizes the viewport to the page's rendered height, repeating until two measurements agree, so the
//   image is cropped to the content by construction (no post-crop). Scrollbars are hidden (a real popup window is
//   sized to its content and never shows one) and the final layout is asserted to fit the viewport. Then:
//     --png   Page.captureScreenshot of that viewport (width*dpr x height*dpr).
//     --cast  Page.startScreencast for N seconds; every frame is written as <dir>/f0000.png with its compositor
//             timestamp in <dir>/frames.json, so a loop can be assembled with the real timing (assemble-loop.mjs).
//             --before runs once just before the screencast starts (e.g. "location.reload()"); each --at runs at
//             <ms> after it starts. Scripts run in the page with a user gesture.
//             Headless Chrome 153 delivers screencast frames at 1x CSS size whatever the device scale factor, so
//             add --grab to replace the screencast with back-to-back Page.captureScreenshot calls: full <dpr>
//             resolution, ~15-30 frames/s, each stamped with the midpoint of its capture call.
//   Prints the final viewport and image size. Closes the tab it opened; never touches any other target.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [wsUrl, url, ...rest] = process.argv.slice(2);
if (!wsUrl || !url) { console.error('usage: node shoot.mjs <browserWsUrl> <url> [--png f] [--cast dir --secs N] ...'); process.exit(64); }
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i === -1 ? d : rest[i + 1]; };
const all = (n) => rest.flatMap((a, i) => (a === `--${n}` ? [rest[i + 1]] : []));
const width = Number(opt('width', '360'));
const dpr = Number(opt('dpr', '2'));
const settle = Number(opt('settle', '1500'));
const png = opt('png');
const castDir = opt('cast');
const secs = Number(opt('secs', '4'));
const before = opt('before');
const at = all('at').map((s) => { const k = s.indexOf(':'); return [Number(s.slice(0, k)), s.slice(k + 1)]; });
const fit = rest.includes('--fit');
const grab = rest.includes('--grab');
const waitFor = opt('wait-for');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ws = new WebSocket(wsUrl);
let seq = 0; const pending = new Map(); const listeners = [];
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const m = { id: ++seq, method, params }; if (sessionId) m.sessionId = sessionId;
  pending.set(m.id, { res, rej }); ws.send(JSON.stringify(m));
});
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(`${JSON.stringify(m.error)}`)) : p.res(m.result); return; }
  for (const l of listeners) l(m);
};
const evaluate = async (s, expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }, s);
  if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
};

ws.onopen = async () => {
  let targetId;
  const bail = setTimeout(async () => {
    console.error('ERR timeout');
    if (targetId) await Promise.race([send('Target.closeTarget', { targetId }).catch(() => {}), sleep(2000)]);
    process.exit(3);
  }, (settle + secs * 1000 + 30000));
  try {
    ({ targetId } = await send('Target.createTarget', { url: 'about:blank' }));
    const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, s);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, s);
    const metrics = (h) => send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: dpr, mobile: false }, s);
    await send('Emulation.setScrollbarsHidden', { hidden: true }, s);
    await metrics(800);
    await send('Page.navigate', { url }, s);
    await sleep(settle);
    if (waitFor) {
      const until = Date.now() + 15000;
      while (!(await evaluate(s, waitFor).catch(() => false))) {
        if (Date.now() > until) { console.error(`ERR --wait-for never became true: ${waitFor}`); process.exitCode = 4; throw new Error('wait-for timeout'); }
        await sleep(100);
      }
      await sleep(400); // let transitions (pill colour, fades) finish
    }
    let height = 800;
    if (fit) {
      const measure = () => evaluate(s, 'Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))');
      await metrics(1); await sleep(150);
      height = await measure();
      for (let i = 0; i < 10; i++) {
        await metrics(height); await sleep(300);
        await metrics(1); await sleep(150);
        const again = await measure();
        if (again === height) break;
        height = again;
      }
      await metrics(height); await sleep(300);
    }
    const [sw, sh] = await evaluate(s, '[document.documentElement.scrollWidth, document.documentElement.scrollHeight]');
    if (sw > width) console.error(`WARN content is ${sw}px wide, viewport ${width}px`);
    if (fit && sh > height) console.error(`WARN content is ${sh}px tall, viewport ${height}px`);
    if (png) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, s);
      writeFileSync(png, Buffer.from(data, 'base64'));
      console.log(`png ${png} viewport ${width}x${height} css @${dpr}x`);
    }
    if (castDir) {
      mkdirSync(castDir, { recursive: true });
      const frames = [];
      listeners.push((m) => {
        if (m.method !== 'Page.screencastFrame' || m.sessionId !== s) return;
        const f = `f${String(frames.length).padStart(4, '0')}.png`;
        writeFileSync(join(castDir, f), Buffer.from(m.params.data, 'base64'));
        frames.push({ file: f, t: m.params.metadata.timestamp });
        send('Page.screencastFrameAck', { sessionId: m.params.sessionId }, s).catch(() => {});
      });
      let grabbing = false; let grabLoop = Promise.resolve(); let skipped = 0;
      if (grab) {
        grabbing = true;
        grabLoop = (async () => {
          while (grabbing) {
            const a = Date.now() / 1000;
            // A capture issued while a navigation commits can go unanswered; drop it and ask again.
            const r = await Promise.race([send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, s),
              sleep(400).then(() => null)]);
            if (!r) { skipped++; continue; }
            const { data } = r;
            const f = `f${String(frames.length).padStart(4, '0')}.png`;
            writeFileSync(join(castDir, f), Buffer.from(data, 'base64'));
            frames.push({ file: f, t: (a + Date.now() / 1000) / 2 });
          }
        })();
      } else {
        await send('Page.startScreencast', { format: 'png', maxWidth: width * dpr, maxHeight: height * dpr, everyNthFrame: 1 }, s);
      }
      await sleep(250);
      const t0 = Date.now() / 1000;
      if (before) await evaluate(s, before).catch((e) => console.error('before:', e.message));
      for (const [ms, js] of at.sort((a, b) => a[0] - b[0])) {
        const wait = ms - (Date.now() / 1000 - t0) * 1000;
        if (wait > 0) await sleep(wait);
        await evaluate(s, js).catch((e) => console.error(`at ${ms}:`, e.message));
      }
      const left = secs * 1000 - (Date.now() / 1000 - t0) * 1000;
      if (left > 0) await sleep(left);
      if (grab) { grabbing = false; await grabLoop; } else await send('Page.stopScreencast', {}, s);
      writeFileSync(join(castDir, 'frames.json'), JSON.stringify({ start: t0, end: Date.now() / 1000, width, height, dpr, frames }, null, 1));
      console.log(`cast ${castDir}: ${frames.length} frames over ${secs}s, viewport ${width}x${height} css @${dpr}x${grab ? `, ${skipped} unanswered captures dropped` : ''}`);
    }
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 2;
  } finally {
    if (targetId) await send('Target.closeTarget', { targetId }).catch(() => {});
    clearTimeout(bail);
    ws.close();
    setTimeout(() => process.exit(), 100);
  }
};

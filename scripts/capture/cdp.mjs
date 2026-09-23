// Minimal CDP client (Node 22 global WebSocket). Usage:
//   node cdp.mjs <browserWsUrl> <targetUrlSubstring> <js expression>
// Attaches (flatten) to the first target whose url contains the substring and evaluates the expression.
const [ws, match, expr] = process.argv.slice(2);
const sock = new WebSocket(ws);
let id = 0; const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const msg = { id: ++id, method, params }; if (sessionId) msg.sessionId = sessionId;
  pending.set(msg.id, { res, rej }); sock.send(JSON.stringify(msg));
});
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
sock.onopen = async () => {
  try {
    const { targetInfos } = await send('Target.getTargets');
    if (match === '--list') { for (const t of targetInfos) console.log(t.type, t.url, t.targetId); process.exit(0); }
    const t = targetInfos.find((t) => t.url.includes(match));
    if (!t) throw new Error('no target matching ' + match);
    const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    console.log(JSON.stringify(r.result.value ?? r.result, null, 0), r.exceptionDetails ? 'EXCEPTION ' + JSON.stringify(r.exceptionDetails.exception?.description) : '');
    process.exit(0);
  } catch (err) { console.error('ERR', err.message); process.exit(2); }
};

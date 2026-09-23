// Browser-level CDP call: node cdp-browser.mjs <wsUrl> <Method> '<jsonParams>'
const [ws, method, params] = process.argv.slice(2);
const s = new WebSocket(ws);
s.onopen = () => s.send(JSON.stringify({ id: 1, method, params: JSON.parse(params || '{}') }));
s.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id === 1) {
    console.log(JSON.stringify(m.result ?? m.error));
    process.exit(m.error ? 2 : 0);
  }
};
s.onerror = (e) => { console.error('ws error', e.message); process.exit(3); };

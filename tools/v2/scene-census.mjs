#!/usr/bin/env node
// Scene-graph census during a benchmark segment (which subtrees cost updateMatrixWorld / projectObject, and how many of their
// objects actually moved over 1 s).
//   node tools/v2/scene-census.mjs --web <web build dir> [--seg downtown] [--after 8] [--out file.json]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const PORT = +(o.port || 9341),
  SEG = o.seg || 'downtown',
  out = path.resolve(o.out || 'docs/v2/reports/scene-census.json');
const p = spawn(
  'npx',
  [
    'electron',
    'desktop/app',
    `--remote-debugging-port=${PORT}`,
    `--ps-web-root=${path.resolve(o.web)}`,
    '--ps-bench=census',
    '--ps-bench-stay',
    '--ps-bench-out=/tmp/bench-census-run.json',
    '--ps-query=mute',
    '--ps-fullscreen',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 120 && !ws; i++) {
  await sleep(1000);
  try {
    const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(
      (x) => x.type === 'page' && /index\.html/.test(x.url),
    );
    if (t) ws = new WebSocket(t.webSocketDebuggerUrl);
  } catch (e) {
    /* not up */
  }
}
if (!ws) {
  p.kill('SIGKILL');
  process.exit(1);
}
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const wait = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && wait.has(m.id)) {
    wait.get(m.id)(m);
    wait.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    wait.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description;
};
for (;;) {
  const cur = await ev('game?.bench?.seg?.id || ""');
  if (cur === SEG) break;
  await sleep(300);
}
await sleep(1000 * +(o.after || 8));
const res = await ev(`(async () => {
  const sc = game.scene, snap = new Map();
  const key = (x) => { let n = x.name || x.userData?.kind || x.type; let p = x.parent, d = 0; while (p && p !== sc && d < 6) { if (p.name) { n = p.name + '/' + n; } p = p.parent; d++; } return n.split('/').slice(0, 2).join('/'); };
  const top = new Map(); let total = 0, auto = 0, wauto = 0, visible = 0;
  sc.traverse((x) => { total++; if (x.matrixAutoUpdate) auto++; if (x.matrixWorldAutoUpdate) wauto++; if (x.visible) visible++; snap.set(x, x.matrixWorld.elements.slice()); });
  await new Promise((r) => setTimeout(r, 1000));
  const per = new Map();
  for (const tc of sc.children) {
    const e = { name: (tc.name || tc.type) + (tc.userData?.kind ? '[' + tc.userData.kind + ']' : ''), objs: 0, auto: 0, moved: 0, meshes: 0, visMeshes: 0 };
    tc.traverse((x) => { e.objs++; if (x.matrixAutoUpdate) e.auto++; if (x.isMesh) { e.meshes++; let v = true; for (let q = x; q; q = q.parent) if (!q.visible) { v = false; break; } if (v) e.visMeshes++; }
      const s = snap.get(x); if (s) { const m = x.matrixWorld.elements; for (let i = 0; i < 16; i++) if (Math.abs(m[i] - s[i]) > 1e-6) { e.moved++; break; } } });
    const k = e.name; const pe = per.get(k); if (pe) { for (const f of ['objs', 'auto', 'moved', 'meshes', 'visMeshes']) pe[f] += e[f]; pe.n++; } else per.set(k, { ...e, n: 1 });
  }
  return JSON.stringify({ total, auto, wauto, visible, topChildren: sc.children.length, per: [...per.values()].sort((a, b) => b.objs - a.objs).slice(0, 60) });
})()`);
fs.writeFileSync(out, typeof res === 'string' ? res : JSON.stringify(res));
console.log('wrote', out);
p.kill('SIGTERM');
await sleep(1500);
try {
  p.kill('SIGKILL');
} catch (e) {
  /* gone */
}
process.exit(0);

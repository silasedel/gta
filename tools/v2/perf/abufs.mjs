// Which code allocates ArrayBuffers / typed arrays while playing (Nov 19: most full GCs are "external memory pressure",
// i.e. ArrayBuffer churn, not JS objects). Wraps the typed-array constructors for N seconds while the player drives downtown and
// reports bytes and counts per call site.   node tools/v2/perf/abufs.mjs [--secs 8] [--at 407,-110]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SECS = +(o.secs || 8), at = String(o.at || '407,-110').split(',').map(Number);
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(fs.readFileSync('tools/v2/physics/labPage.js', 'utf8'));
  await b.eval(`JSON.stringify(__lab.findSpot(${at[0]}, ${at[1]}))`);
  await b.eval(`(() => { const S = __lab.spot; game.teleport(S.x0 + S.rx * 2.4, undefined, S.z0 + S.rz * 2.4); return 1; })()`);
  await b.sleep(9000);
  for (let k = 0; k < 2; k++) { await b.key('Enter', true, 'Enter'); await b.key('Enter', false, 'Enter'); await b.sleep(700); }
  await b.eval(`__lab.spawn('sedan3', 0).then(() => { __lab.v.playerDriven = false; return 1; })`);
  await b.eval(`(() => { const S = __lab.spot, v = __lab.v; const t = v.body.translation(); game.teleport(t.x + S.rx * 2.2, undefined, t.z + S.rz * 2.2); return 1; })()`);
  await b.sleep(800); await b.eval('(game.enterVehicle(__lab.v), 1)'); await b.sleep(2500);
  const runP = b.eval(`__lab.run({ kmh: 50, sEnd: 300, maxT: ${SECS + 6} }).then(() => 1)`, 200000);
  await b.sleep(2000);
  await b.eval(`(() => { const S = window.__AB = new Map(); const names = ['Float32Array','Float64Array','Uint8Array','Uint16Array','Uint32Array','Int32Array','Int16Array','Uint8ClampedArray','ArrayBuffer'];
    window.__ABorig = {}; for (const n of names) { const O = window[n]; window.__ABorig[n] = O;
      const W = new Proxy(O, { construct(t, args, nt) { const r = Reflect.construct(t, args, nt); const by = r.byteLength || 0; if (by >= 64) { const st = (new Error().stack || '').split('\\n').slice(2, 5).map((l) => l.trim().replace(/^at /, '').replace(/https?:\\/\\/[^/]+\\//, '').replace(/\\?[^:)]*/, '')).join(' < '); const e = S.get(st) || [0, 0, n]; e[0] += by; e[1]++; S.set(st, e); } return r; } });
      window[n] = W; } return 1; })()`);
  await b.sleep(SECS * 1000);
  const r = await b.eval(`(() => { for (const [n, O] of Object.entries(window.__ABorig)) window[n] = O; const tot = [...window.__AB.values()].reduce((s, e) => s + e[0], 0);
    return JSON.stringify({ secs: ${SECS}, MBperSec: +(tot / 1e6 / ${SECS}).toFixed(2), top: [...window.__AB].sort((p, q) => q[1][0] - p[1][0]).slice(0, 25).map(([k, e]) => [+(e[0] / 1e6 / ${SECS}).toFixed(3), e[1], e[2], k]) }); })()`);
  await runP.catch(() => {});
  fs.writeFileSync('docs/v2/reports/abufs.json', r); console.log(r);
});

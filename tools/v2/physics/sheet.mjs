// r2-physics: review sheets for the lab runs. One JPG per test: screenshot strip (replayed poses) + per-frame plots of
// suspension travel per wheel, body pitch / roll, vertical acceleration and speed; carphys 1 (Rapier ray-cast) dashed vs
// carphys 2 (shape-cast) solid when both reports exist.
//   node tools/v2/physics/sheet.mjs [--tests curb20,...] [--a docs/v2/reports/physics-lab-1.json] [--b docs/v2/reports/physics-lab-2.json]
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const A = o.a && fs.existsSync(o.a) ? JSON.parse(fs.readFileSync(o.a, 'utf8')) : (fs.existsSync('docs/v2/reports/physics-lab-1.json') ? JSON.parse(fs.readFileSync('docs/v2/reports/physics-lab-1.json', 'utf8')) : null);
const B = JSON.parse(fs.readFileSync(o.b || 'docs/v2/reports/physics-lab-2.json', 'utf8'));
const tests = String(o.tests || Object.keys(B.tests).join(',')).split(',');
const SH = 'docs/v2/shots/r2-physics', LAB = SH + '/lab';
const TITLE = { curb: 'Curb 15 cm: up and off the far edge', pothole: 'Pothole (right wheels)', rock: 'Rock 12 cm (left wheels)', bump: 'Speed hump 7.5 cm' };
const strip = (name, phys, chase = false) => fs.readdirSync(LAB).filter((f) => f.startsWith(`${name}_p${phys}_`) && f.endsWith('.jpg') && f.includes('_chase_') === chase).sort().map((f) => 'file://' + path.resolve(LAB, f));
const html = (name) => {
  const kind = name.replace(/\d+$/, ''), kmh = name.replace(/^\D+/, '');
  const b = B.tests[name], a0 = A?.tests?.[name];
  const imgs = strip(name, B.phys), chase = strip(name, B.phys, true);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#101317;color:#e8ecef;font:14px/1.35 -apple-system,Helvetica,Arial,sans-serif;width:1600px}
  h1{font-size:24px;margin:18px 22px 4px;font-weight:650;letter-spacing:.2px} .sub{margin:0 22px 12px;color:#9aa6b2}
  .strip{display:grid;grid-template-columns:repeat(${Math.min(5, Math.max(1, imgs.length))},1fr);gap:4px;margin:0 22px}
  .strip img{width:100%;display:block;border-radius:3px}
  .plots{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 22px 18px}
  canvas{background:#171b21;border-radius:6px;width:100%} .lg{color:#9aa6b2;font-size:12px;margin:2px 4px}
  .sum{margin:0 22px 18px;color:#c9d1d9;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap}
  </style></head><body>
  <h1>${TITLE[kind] || kind} at ${kmh} km/h - ${B.key}</h1>
  <div class="sub">Shape-cast suspension (carphys 2), every physics tick (1/60 s), replayed poses in the strip, left to right, then top to bottom. Plots against distance along the test lane (m); obstacle at 45 m. ${a0 ? 'Dashed = old Rapier ray-cast controller (carphys 1), same run.' : ''}</div>
  <div class="strip">${imgs.map((s) => `<img src="${s}">`).join('')}</div>
  ${chase.length ? `<div class="sub" style="margin-top:10px">Chase camera, same replayed run:</div><div class="strip" style="grid-template-columns:repeat(5,1fr)">${chase.map((s) => `<img src="${s}">`).join('')}</div>` : ''}
  <div class="plots">
    <div><canvas id="tr" width="760" height="300"></canvas><div class="lg">Suspension travel (cm, + = compression from ride height): <b style="color:#4fc3f7">FL</b> <b style="color:#ff8a65">FR</b> <b style="color:#81c784">RL</b> <b style="color:#ffd54f">RR</b></div></div>
    <div><canvas id="pr" width="760" height="300"></canvas><div class="lg">Body attitude (deg): <b style="color:#ce93d8">pitch (+ nose up)</b> <b style="color:#80deea">roll (+ right side down)</b></div></div>
    <div><canvas id="ay" width="760" height="240"></canvas><div class="lg">Body vertical acceleration (m/s2)</div></div>
    <div><canvas id="kmh" width="760" height="240"></canvas><div class="lg">Speed (km/h)</div></div>
  </div>
  <div class="sum">${JSON.stringify({ carphys2: b.summary, carphys1: a0?.summary || null, params: b.spawn?.params || null })}</div>
  <script>
  const B = ${JSON.stringify(b.rec.filter((r, i) => i % 1 === 0))}, A = ${JSON.stringify(a0 ? a0.rec : [])};
  const S0 = 30, S1 = 66;
  function plot(id, series, lo, hi, ticks) {
    const c = document.getElementById(id), x = c.getContext('2d'), W = c.width, H = c.height, L = 46, R = 10, T = 10, Bm = 24;
    const sx = (s) => L + (s - S0) / (S1 - S0) * (W - L - R), sy = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - Bm);
    x.strokeStyle = '#2a313a'; x.fillStyle = '#7d8894'; x.font = '11px Menlo'; x.lineWidth = 1;
    for (const v of ticks) { x.beginPath(); x.moveTo(L, sy(v)); x.lineTo(W - R, sy(v)); x.stroke(); x.fillText(String(v), 4, sy(v) + 4); }
    for (let s = S0; s <= S1; s += 5) { x.beginPath(); x.moveTo(sx(s), T); x.lineTo(sx(s), H - Bm); x.stroke(); x.fillText(s + ' m', sx(s) - 10, H - 7); }
    x.strokeStyle = '#ffffff33'; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(sx(45), T); x.lineTo(sx(45), H - Bm); x.stroke(); x.setLineDash([]);
    for (const [data, f, col, dash] of series) { if (!data.length) continue; x.strokeStyle = col; x.lineWidth = dash ? 1.2 : 1.8; x.setLineDash(dash ? [5, 4] : []); x.beginPath(); let first = true;
      for (const r of data) { if (r.s < S0 || r.s > S1) continue; const v = f(r); if (!Number.isFinite(v)) continue; const px = sx(r.s), py = sy(Math.max(lo, Math.min(hi, v))); if (first) { x.moveTo(px, py); first = false; } else x.lineTo(px, py); } x.stroke(); }
    x.setLineDash([]);
  }
  const C = ['#4fc3f7', '#ff8a65', '#81c784', '#ffd54f'];
  const trS = []; for (let i = 0; i < 4; i++) { trS.push([A, (r) => r.tr[i] * 100, C[i] + '99', true]); trS.push([B, (r) => r.tr[i] * 100, C[i], false]); }
  plot('tr', trS, -16, 16, [-15, -10, -5, 0, 5, 10, 15]);
  plot('pr', [[A, (r) => r.pitch, '#ce93d899', true], [A, (r) => r.roll, '#80deea99', true], [B, (r) => r.pitch, '#ce93d8', false], [B, (r) => r.roll, '#80deea', false]], -4, 4, [-4, -2, 0, 2, 4]);
  plot('ay', [[A, (r) => r.ay, '#ffab9199', true], [B, (r) => r.ay, '#ffab91', false]], -30, 30, [-30, -15, 0, 15, 30]);
  plot('kmh', [[A, (r) => r.kmh, '#b0bec599', true], [B, (r) => r.kmh, '#b0bec5', false]], 0, Math.max(30, ${+kmh} * 1.3), [0, 10, 20, 30, 40, 50].filter((v) => v <= Math.max(30, ${+kmh} * 1.3)));
  document.title = 'ready';
  </script></body></html>`;
};
await withBrowser({ width: 1600, height: 1200, maxSeconds: 300 }, async (br) => {
  for (const name of tests) {
    if (!B.tests[name]) continue;
    const f = path.resolve(`${SH}/.sheet_${name}.html`); fs.writeFileSync(f, html(name));
    await br.goto('file://' + f); await br.waitFor("document.title === 'ready' && [...document.images].every((i) => i.complete)", 30);
    const h = await br.eval('document.body.scrollHeight');
    await br.screenshot(`${SH}/${name}_sheet.jpg`, { quality: 90, clip: { x: 0, y: 0, width: 1600, height: h } });
    fs.unlinkSync(f); console.log('sheet', name);
  }
});

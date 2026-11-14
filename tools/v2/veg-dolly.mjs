#!/usr/bin/env node
// Vegetation pop / warp test (V2 test browser only, see browser.mjs): lock the camera on one countryside tree (and separately
// one palm), dolly straight at it from 400 m to 15 m in 2 m steps, and diff consecutive frames inside the plant's screen box.
// A LOD swap that changes shape, size, lean or colour shows up as a spike against the neighbouring steps.
//   node tools/v2/veg-dolly.mjs [--spot hwy] [--from 400] [--to 15] [--step 2]
// Writes docs/v2/reports/vegetation-dolly.json and docs/v2/shots/vegetation/dolly/<subject>_<d>.jpg (every 10th frame kept)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { withBrowser, GAME_READY } from './browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const W = 960, H = 540, FROM = +(o.from || 400), TO = +(o.to || 15), STEP = +(o.step || 2);
const OUT = path.resolve('docs/v2/shots/vegetation/dolly'); fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'veg-dolly-'));
const spots = JSON.parse(fs.readFileSync(path.resolve('docs/v2/reports/vegetation-spots.json'), 'utf8'));
const spot = spots[o.spot || 'hwy'];
const HIDE = `(() => { game.timeExternal = true; game.timeOfDay = 11; if (!window.__vc) { window.__vc = document.createElement('style'); window.__vc.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }'; document.head.appendChild(window.__vc); } const gc = game.renderer && game.renderer.domElement; for (const c of document.querySelectorAll('canvas')) if (c !== gc) c.style.setProperty('display', 'none', 'important'); return true; })()`;
// pick a subject with a clear 400 m approach: the direction with the fewest other trees near the line of sight
const PICK = (palm) => `(() => { const cs = game.vegetation.countryside, s = ${JSON.stringify(spot)}; const cx = s.x - s.dz * 40, cz = s.z + s.dx * 40;
  const all = cs.treesNear(cx, cz, 700), cands = all.filter((t) => t.palm === ${palm} && t.kind !== 'seagrapeT' && t.kind !== 'buttonwood' && Math.hypot(t.x - cx, t.z - cz) < 260);
  let best = null;
  for (const t of cands.slice(0, 60)) for (let k = 0; k < 24; k++) { const an = k / 24 * 6.2832, ux = Math.cos(an), uz = Math.sin(an); let occ = 0;
    for (const q of all) { if (q === t) continue; const dx = q.x - t.x, dz = q.z - t.z, along = dx * ux + dz * uz; if (along < 3 || along > ${FROM}) continue; const off = Math.abs(-dx * uz + dz * ux); if (off < 7 + along * 0.02) occ++; }
    if (!best || occ < best.occ) best = { t, ux, uz, occ }; }
  return JSON.stringify(best); })()`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rawOf(file) { return execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-'], { maxBuffer: W * H * 3 + 1024 }); }
function diffBox(A, B, box) {
  let sum = 0, n = 0, big = 0; const [x0, y0, x1, y1] = box.map((v) => Math.round(v));
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) { const i = (y * W + x) * 3; const d = (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3; sum += d; n++; if (d > 40) big++; }
  return { mean: n ? sum / n : 0, changed: n ? big / n : 0, px: n };
}

const report = { when: new Date().toISOString(), spot: o.spot || 'hwy', from: FROM, to: TO, step: STEP, subjects: {} };
await withBrowser({ width: W, height: H, maxSeconds: +(o.max || 2400) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await b.eval(HIDE);
  await b.eval(`game.teleport(${spot.x - spot.dz * 40}, null, ${spot.z + spot.dx * 40}, 0) || true`);
  await b.waitFor(GAME_READY + ' && game.vegetation && game.vegetation.countryside', 600); await sleep(6000);
  for (const palm of (o.only === 'tree' ? [false] : o.only === 'palm' ? [true] : [false, true])) {
    const name = palm ? 'palm' : 'tree';
    await b.eval(HIDE);
    const pk = JSON.parse(await b.eval(PICK(palm)));
    if (!pk) { console.log('no subject for', name); continue; }
    const { t, ux, uz } = pk, cy = t.y + (palm ? 5.5 : 3.6) * t.s, rad = (palm ? 5.5 : 6.5) * t.s;
    console.log(name, JSON.stringify({ kind: t.kind, x: +t.x.toFixed(1), z: +t.z.toFixed(1), s: +t.s.toFixed(2), occluders: pk.occ }));
    const rows = []; let prev = null;
    await b.eval('game.vegetation.freezeWind = true; game.settings = game.settings || {}; game.settings.filmGrain = 0; game.settings.motionBlur = false; true'); // grain and camera motion blur are frame noise, not plant change
    for (let d = FROM, k = 0; d >= TO - 1e-6; d -= STEP, k++) {
      const box = JSON.parse(await b.eval(`(() => { const ex = ${t.x} + ${ux} * ${d}, ez = ${t.z} + ${uz} * ${d}, gy = game.city.groundHeightAt(ex, ez), ey = Math.max(${cy}, (Number.isFinite(gy) ? gy : 0) + 2);
        game.cameraOverride = (dt, cam) => { cam.position.set(ex, ey, ez); cam.lookAt(${t.x}, ${cy}, ${t.z}); if (cam.fov !== 30) { cam.fov = 30; cam.updateProjectionMatrix(); } return true; };
        const dist = Math.hypot(${d}, ey - ${cy}), half = Math.atan(${rad} / dist) / (15 * Math.PI / 180) * ${H / 2}; return JSON.stringify([${W / 2} - half * 1.1, ${H / 2} - half * 1.25, ${W / 2} + half * 1.1, ${H / 2} + half * 1.1]); })()`));
      await sleep(k === 0 ? 3000 : 220);
      const f = path.join(TMP, `${name}_${k}.jpg`);
      let ok = false; for (let r = 0; r < 4 && !ok; r++) { try { await b.screenshot(f, { format: 'jpeg', quality: 92 }); ok = true; } catch (e) { await sleep(1500); } }
      if (!ok) { console.log('skip frame at', d); prev = null; continue; }
      const raw = rawOf(f);
      if (prev) rows.push({ d, ...diffBox(prev, raw, box), box: box.map((v) => Math.round(v)) });
      if (k % 10 === 0 || (d > 54 && d < 82) || d < 17) fs.copyFileSync(f, path.join(OUT, `${name}_${String(Math.round(d)).padStart(3, '0')}.jpg`));
      prev = raw; fs.rmSync(f, { force: true });
    }
    await b.eval('game.vegetation.freezeWind = false; game.cameraOverride = null; true');
    // spike = this step's change over the median of its +-8 neighbours (scale change alone grows smoothly as the camera nears)
    for (let i = 0; i < rows.length; i++) { const nb = rows.slice(Math.max(0, i - 8), i + 9).filter((_, j) => j !== Math.min(8, i)).map((r) => r.mean).sort((x, y) => x - y); rows[i].spike = +(rows[i].mean / Math.max(0.3, nb[nb.length >> 1] || 0.3)).toFixed(2); rows[i].mean = +rows[i].mean.toFixed(2); rows[i].changed = +rows[i].changed.toFixed(4); }
    const band = (lo, hi) => { const r = rows.filter((x) => x.d >= lo && x.d <= hi); const m = r.reduce((p, x) => (x.spike > (p?.spike || 0) ? x : p), null); return m ? { maxSpike: m.spike, atD: m.d, mean: m.mean, changed: m.changed } : null; };
    report.subjects[name] = { subject: { kind: t.kind, x: t.x, z: t.z, s: t.s, occluders: pk.occ }, bands: palm || t.kind ? { lodSwap_56_80: band(56, 80), far_80_400: band(80, FROM), near_15_56: band(TO, 56) } : null, worst: [...rows].sort((x, y) => y.spike - x.spike).slice(0, 6), rows };
    console.log(name, JSON.stringify(report.subjects[name].bands), 'worst', JSON.stringify(report.subjects[name].worst.map((r) => [r.d, r.spike, r.mean])));
  }
  report.veg = JSON.parse(await b.eval('JSON.stringify(game.vegetation.countryside.stats())'));
  if (b.errors.length) report.consoleErrors = [...new Set(b.errors)].slice(0, 10);
});
fs.rmSync(TMP, { recursive: true, force: true });
const RP = path.resolve('docs/v2/reports/vegetation-dolly.json'); if (o.only && fs.existsSync(RP)) { const old = JSON.parse(fs.readFileSync(RP, 'utf8')); report.subjects = { ...old.subjects, ...report.subjects }; }
fs.writeFileSync(RP, JSON.stringify(report, null, 1));
console.log('done', report.consoleErrors ? 'errors: ' + report.consoleErrors.length : 'no errors');

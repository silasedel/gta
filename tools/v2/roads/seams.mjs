#!/usr/bin/env node
// Road seam audit (round 2, r2-roads, item 11): ~26 junction / road-end types, picked once from the road graph (cached in
// docs/v2/reports/r2roads-seam-picks.json so before / after shoot the same places). Per pick:
//   * geometry probe: rays straight down along every curb return and leg curb line (0.25 m along, 7 offsets across the curb),
//     flags  raised  = curb / slab height inside the carriageway (spikes, triangles poking into the road)
//            notch   = road height where the sidewalk should be, between slab samples (gaps, missing wedges)
//            zfight  = two different opaque surfaces within 4 mm at one point (decals / paint excluded)
//            step    = a jump > 4 cm in the curb top along the curb line (broken / doubled curb tops)
//   * three views: top (26 m up), corner (close at the first curb return), approach (driver on the first leg)
// Muted, headless; sheet: docs/v2/shots/roads/<set>_seams_sheet.jpg (python tools/v2/roads/sheet.py)
//   node tools/v2/roads/seams.mjs --set before [--only urban4_signal,...] [--repick] [--noshots] [--q "&x=0"]
// -> docs/v2/reports/r2roads-seams-<set>.json, docs/v2/shots/roads/<set>_seam_<id>_<view>.jpg
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after';
const DIR = path.resolve('docs/v2/shots/roads'); fs.mkdirSync(DIR, { recursive: true });
const PICKS = path.resolve('docs/v2/reports/r2roads-seam-picks.json');

const PICK_JS = `(() => {
  const G = game.city.roadGraph, C = game.city, zoneAt = C.zoneAt || (() => ''), distAt = C.districtAt || (() => ''), T = 200;
  const E = (k) => G.edges[k], deg = (n) => (n.edges || []).length;
  const legDir = (n, e) => { const p = e.a === n.id ? e.pts : e.pts.slice().reverse(), q = p[Math.min(2, p.length - 1)]; const dx = q[0] - n.x, dz = q[1] - n.z, L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L]; };
  const minAng = (n) => { const ds = n.edges.map((k) => legDir(n, E(k))); let m = 9; for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) m = Math.min(m, Math.acos(Math.max(-1, Math.min(1, ds[i][0] * ds[j][0] + ds[i][1] * ds[j][1])))); return m; };
  const cand = {}, add = (k, n, score, extra = {}) => { if (!cand[k] || score > cand[k].score) cand[k] = { id: n.id, x: +n.x.toFixed(1), z: +n.z.toFixed(1), score, ...extra }; };
  const near = (n, r) => { let c = 0; for (const m of G.nodes) if (m !== n && deg(m) >= 3 && Math.hypot(m.x - n.x, m.z - n.z) < r) c++; return c; };
  for (const n of G.nodes) {
    const es = (n.edges || []).map(E).filter(Boolean); if (!es.length) continue;
    if (es.length === 2 && es.some((e) => e.bridge) && es.some((e) => !e.bridge && !e.elevated)) { const r0 = (n.id * 2654435761 % 1000) / 1000; add(es.some((e) => (e.sidewalk || 0) > 0) ? 'bridge_join_curbed' : 'bridge_join', n, r0); continue; }
    if (es.some((e) => e.elevated)) continue;
    const d = es.length, sw = es.filter((e) => (e.sidewalk || 0) > 0).length, kinds = es.map((e) => e.kind || ''), z = String(zoneAt(n.x, n.z) || ''), dist = String(distAt(n.x, n.z) || '');
    const ctrl = es.map((e) => (e.a === n.id ? e.controlA : e.controlB)).filter(Boolean), sig = ctrl.includes('signal'), stop = ctrl.includes('stop');
    const minLen = Math.min(...es.map((e) => e.length || 0)), big = kinds.some((k) => /trunk|primary/.test(k)), one = es.some((e) => e.oneway), ang = d >= 2 ? minAng(n) : 9;
    const keys = /Key Largo|Key West|Marathon/.test(dist), seam = Math.min(Math.abs(n.x / T - Math.round(n.x / T)), Math.abs(n.z / T - Math.round(n.z / T))) * T;
    const J = d >= 3 && C.junctionOf ? C.junctionOf(n.id) : null, bridgeNear = es.some((e) => e.bridge);
    const r = (n.id * 2654435761 % 1000) / 1000; // tie breaker
    if (d === 1) { if (sw && /residential/.test(kinds[0]) && minLen > 60) add('culdesac', n, r); else if (!sw && minLen > 80) add('road_end_open', n, r); continue; }
    if (d === 2) { if (bridgeNear && es.some((e) => !e.bridge) && sw === 1) add('bridge_join_curbed', n, r); else if (bridgeNear && es.some((e) => !e.bridge)) add('bridge_join', n, r);
      if (sw === 1 && !bridgeNear) add('sidewalk_end', n, r); else if (!bridgeNear && es.every((e) => /residential|tertiary|secondary/.test(e.kind || '')) && sw === 2) add('driveway_block', n, r); continue; }
    if (minLen < 30 && !/median|divided/.test('')) { if (one && big) add('median_crossing', n, r); else add('close_cluster', n, r); continue; }
    if (minLen < 40) continue;
    if (J && J.corners.some((c) => c.kind === 'gore')) add('gore_nose', n, r);
    if (d >= 5) add('deg5', n, r);
    if (keys) { add('keys_lane', n, r); continue; }
    if (seam < 6 && sw === d) add('tile_seam', n, r);
    if (bridgeNear) add('near_bridge', n, r);
    if (ang < 0.85 && sw === d) add('skew_curbed', n, r + (0.85 - ang));
    if (ang < 0.85 && !sw) add('skew_open', n, r + (0.85 - ang));
    if (sw && sw < d) add('mixed_curb', n, r);
    if (one && sw === d && !big) add('oneway_urban', n, r);
    if (/downtown/.test(z) && sig && d === 4) add('downtown4_signal', n, r);
    if (sig && d === 4 && sw === d && !/downtown/.test(z)) add('urban4_signal', n, r);
    if (sig && d === 3 && sw === d) add('urban3_signal', n, r);
    if (!sig && stop && d === 4 && sw === d) add('allway_stop', n, r);
    if (!sig && stop && d === 3 && sw === d && kinds.every((k) => /residential/.test(k))) add('resid_T', n, r);
    if (d === 3 && !sw && /rural|wilderness/.test(z)) add('rural_T', n, r);
    if (d === 4 && !sw && /rural|wilderness/.test(z)) add('rural4', n, r);
    if (kinds.some((k) => /trunk/.test(k)) && kinds.some((k) => /secondary|tertiary|residential/.test(k)) && sig) add('trunk_cross', n, r);
    if (kinds.some((k) => /primary/.test(k)) && kinds.some((k) => /residential/.test(k)) && sw === d) add('primary_resid', n, r);
    if (/town|residential/.test(z) && /Homestead|Florida City|Naples|Clewiston|Okeechobee|Fort Myers/.test(dist) && d === 4 && sw === d) add('town4', n, r);
    if (/beach|nightlife/.test(z) && d >= 3 && sw === d) add('beach_grid', n, r);
  }
  return JSON.stringify(cand);
})()`;

const camJS = (s, id) => `(() => {
  const C = game.city, G = C.roadGraph, gy = (X, Z) => (C.groundHeightAt(X, Z) || 0), s = ${JSON.stringify(s)}, n = G.nodes[${id}]; let eye, look;
  const J = C.junctionOf ? C.junctionOf(${id}) : null, e0 = G.edges[n.edges[0]], P = e0.a === n.id ? e0.pts : e0.pts.slice().reverse();
  const L0 = Math.hypot(P[1][0] - n.x, P[1][1] - n.z) || 1, dx = (P[1][0] - n.x) / L0, dz = (P[1][1] - n.z) / L0;
  if (s.v === 'top') { eye = [n.x + 6, gy(n.x, n.z) + 26, n.z + 9]; look = [n.x, gy(n.x, n.z), n.z]; }
  else if (s.v === 'corner') { const c = J && J.corners.find((c) => c.kind === 'fillet' && c.arc.length > 2) || (J && J.corners.find((c) => c.arc.length));
    if (c) { const m = c.arc[c.arc.length >> 1], vx = m[0] - n.x, vz = m[1] - n.z, vl = Math.hypot(vx, vz) || 1; // look at the return from the road side, 3 m up
      eye = [m[0] - vx / vl * 6 + vz / vl * 2, 0, m[1] - vz / vl * 6 - vx / vl * 2]; eye[1] = gy(eye[0], eye[2]) + 3.2; look = [m[0], gy(m[0], m[1]) + 0.1, m[1]]; }
    else { const ex = P[Math.min(P.length - 1, 1)]; eye = [n.x + dx * 4 - dz * 5, gy(n.x, n.z) + 3, n.z + dz * 4 + dx * 5]; look = [n.x - dz * (e0.width / 2), gy(n.x, n.z), n.z + dx * (e0.width / 2)]; } }
  else { const d0 = 28, hw = e0.width / 2; eye = [n.x + dx * d0 - dz * hw * 0.4, 0, n.z + dz * d0 + dx * hw * 0.4]; eye[1] = gy(eye[0], eye[2]) + 1.7; look = [n.x, gy(n.x, n.z) + 0.6, n.z]; }
  game.teleport(eye[0], undefined, eye[2], 0); window.__scam = [eye, look]; game.cameraOverride = (dt, c) => { c.position.fromArray(eye); c.lookAt(look[0], look[1], look[2]); return true; };
  return 1; })()`;

const RAY_JS = (id) => `(async () => { const M = await import('/src/world/surfaces/seamProbe.js'); return JSON.stringify(M.seamProbe(game, ${id})); })()`;

let picks = null;
if (!o.repick && fs.existsSync(PICKS)) picks = JSON.parse(fs.readFileSync(PICKS, 'utf8'));
const REPF = `docs/v2/reports/r2roads-seams-${SET}.json`;
const rep = o.merge && fs.existsSync(REPF) ? JSON.parse(fs.readFileSync(REPF, 'utf8')) : { set: SET, when: new Date().toISOString(), q: o.q || '', picks: {} }; // --merge: add to an earlier run of the set
await withBrowser({ width: 1600, height: 900, maxSeconds: +(o.max || 2400) }, async (b) => {
  await b.goto('http://127.0.0.1:' + (o.port || 5200) + '/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 11; try { game.weather?.set?.('clear', { instant: true }); } catch (e) {} return 1; })()`);
  if (!picks) { picks = JSON.parse(await b.eval(PICK_JS)); fs.writeFileSync(PICKS, JSON.stringify(picks, null, 1)); console.log('picked', Object.keys(picks).length, Object.keys(picks).join(',')); }
  const ids = o.only ? String(o.only).split(',') : Object.keys(picks);
  for (const k of ids) {
    const p = picks[k]; if (!p) continue;
    await b.eval(`(() => { game.cameraOverride = null; game.timeOfDay = 11; game.teleport(${p.x}, undefined, ${p.z}, 0); return 1; })()`);
    await b.sleep(2500); for (let i = 0; i < 40; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 2) break; await b.sleep(1000); }
    // the near tile under the node must be built (its group is named tile-near-tx,tz) before probing / shooting
    for (let i = 0; i < 40; i++) { const ok = await b.eval(`(() => { const T = 200, k = 'tile-near-' + Math.floor(${p.x} / T) + ',' + Math.floor(${p.z} / T); let f = false; game.scene.traverse((o) => { if (o.name === k && o.children.length) f = true; }); return f; })()`); if (ok) break; await b.sleep(1000); }
    await b.sleep(1500);
    let pr = null; try { pr = JSON.parse(await b.eval(RAY_JS(p.id), 180000)); } catch (e) { pr = { error: String(e.message || e).slice(0, 200) }; }
    rep.picks[k] = { ...p, probe: pr }; fs.writeFileSync(REPF, JSON.stringify(rep, null, 1)); // saved per pick (a killed run keeps what it measured) console.log(k, p.id, pr && !pr.error ? `raised ${pr.raised} notch ${pr.notch} zfight ${pr.zfight} step ${pr.step} (${pr.samples} rays, ${pr.ms} ms)` : JSON.stringify(pr));
    if (!o.noshots) for (const v of ['top', 'corner', 'approach']) { await b.eval(camJS({ v }, p.id)); await b.sleep(1500); await b.screenshot(path.join(DIR, `${SET}_seam_${k}_${v}.jpg`)); }
  }
  rep.errors = [...new Set(b.errors)].slice(0, 20); if (rep.errors.length) console.log('ERRORS\n' + rep.errors.join('\n'));
});
fs.writeFileSync(`docs/v2/reports/r2roads-seams-${SET}.json`, JSON.stringify(rep, null, 1));
if (!o.noshots) try { execFileSync('python3', ['tools/v2/roads/sheet.py', SET], { stdio: 'inherit' }); } catch (e) { console.log('sheet failed', e.message); }

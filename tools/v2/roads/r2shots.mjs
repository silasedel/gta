#!/usr/bin/env node
// Round 2 roads review shots (muted, 1920x1080 by default). Spots from a JSON file or built-ins:
//   node tools/v2/roads/r2shots.mjs --set before --spots tools/v2/roads/spots/r2_sr916.json [--only id,id] [--q "&x=0"] [--ab "&x=0"]
// spot: { id, tod?, eye: [x, y, z], look: [x, y, z] }  (y = meters above the ground at that point)
//    or { id, tod?, road: { x, z, dir: 1|-1, back: m, up: m, ahead: m, side: m (+ = right of travel), lookSide: m } }
//       (camera on the nearest graph edge to (x, z), looking along it; dir picks the travel direction)
//    or { id, tod?, node: { x, z, dist, up, yaw } }  (orbit camera on the nearest 3+ way node: yaw deg around it, dist m out)
// --ab "<query>": shoot every spot twice in two page loads (q first = A, then ab = B) -> <set>_<id>_A.png / _B.png
// -> docs/v2/shots/roads/<set>_<id>.png and docs/v2/reports/r2roads-shots-<set>.json (camera, frame time, errors)
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'r2';
const DIR = path.resolve(o.dir || 'docs/v2/shots/roads');
fs.mkdirSync(DIR, { recursive: true });
let SPOTS = o.spots ? JSON.parse(fs.readFileSync(o.spots, 'utf8')) : [];
if (o.only) {
  const keep = new Set(String(o.only).split(','));
  SPOTS = SPOTS.filter((s) => keep.has(s.id));
}
const camJS = (s) => `(() => {
  const C = game.city, G = C.roadGraph, gy = (X, Z) => (C.groundHeightAt(X, Z) || 0); const s = ${JSON.stringify(s)}; let eye, look;
  if (s.eye) { eye = [s.eye[0], gy(s.eye[0], s.eye[2]) + s.eye[1], s.eye[2]]; look = [s.look[0], gy(s.look[0], s.look[2]) + s.look[1], s.look[2]]; }
  else if (s.road) { const R = s.road, q = G.nearestEdge(R.x, R.z, {}, 400); if (!q) return 'no edge'; const e = q.edge, P = e.pts; let bi = 0, bd = 1e9;
    for (let i = 0; i < P.length - 1; i++) { const d = Math.hypot((P[i][0] + P[i + 1][0]) / 2 - R.x, (P[i][1] + P[i + 1][1]) / 2 - R.z); if (d < bd) { bd = d; bi = i; } }
    const at = (i) => P[Math.max(0, Math.min(P.length - 1, i))]; const dir = R.dir || 1;
    // walk along the polyline from the nearest point by a signed distance
    const walk = (dist) => { let i = bi, x = (P[bi][0] + P[bi + 1][0]) / 2, z = (P[bi][1] + P[bi + 1][1]) / 2, left = Math.abs(dist), sg = Math.sign(dist) * dir;
      while (left > 0) { const j = sg > 0 ? i + 1 : i; const t = at(j); const dx = t[0] - x, dz = t[1] - z, L = Math.hypot(dx, dz); if (L >= left || (sg > 0 ? j >= P.length - 1 : j <= 0)) { const k = Math.min(1, left / (L || 1)); return [x + dx * k, z + dz * k, dx / (L || 1) * sg, dz / (L || 1) * sg]; } x = t[0]; z = t[1]; left -= L; i = sg > 0 ? i + 1 : i - 1; }
      return [x, z, 0, 1]; };
    const b = walk(-(R.back || 8)), f = walk(R.ahead || 40); let tx = f[0] - b[0], tz = f[1] - b[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; const rx = -tz, rz = tx;
    eye = [b[0] + rx * (R.side || 0), 0, b[1] + rz * (R.side || 0)]; eye[1] = gy(eye[0], eye[2]) + (R.up ?? 2.5);
    look = [f[0] + rx * (R.lookSide ?? R.side ?? 0), 0, f[1] + rz * (R.lookSide ?? R.side ?? 0)]; look[1] = gy(look[0], look[2]) + (R.lookUp ?? 0); window.__r2edge = { id: e.id, name: e.name, kind: e.kind }; }
  else if (s.cover) { const Cv = s.cover, L = (window.__covers || []).filter((c) => c[0] === Cv.part); let best = null, bd = 1e9; for (const c of L) { const d = Math.hypot(c[1] - Cv.x, c[2] - Cv.z); if (d < bd) { bd = d; best = c; } }
    if (!best || bd > 60) { game.teleport(Cv.x, undefined, Cv.z, 0); return 'no cover yet'; } const yaw = (Cv.yaw || 30) * Math.PI / 180, D = Cv.dist || 3; eye = [best[1] + Math.sin(yaw) * D, 0, best[2] + Math.cos(yaw) * D]; eye[1] = gy(eye[0], eye[2]) + (Cv.up || 1.6); look = [best[1], gy(best[1], best[2]), best[2]]; window.__r2edge = { cover: best }; }
  else if (s.node) { const N = s.node; let best = null, bd = 1e9; for (const n of G.nodes) { if ((n.edges || []).length < (N.deg || 3)) continue; const d = Math.hypot(n.x - N.x, n.z - N.z); if (d < bd) { bd = d; best = n; } }
    if (!best) return 'no node'; const yaw = (N.yaw || 0) * Math.PI / 180, D = N.dist || 18; eye = [best.x + Math.sin(yaw) * D, 0, best.z + Math.cos(yaw) * D]; eye[1] = gy(eye[0], eye[2]) + (N.up || 8);
    look = [best.x + (N.lx || 0), gy(best.x, best.z), best.z + (N.lz || 0)]; window.__r2edge = { node: best.id, x: best.x, z: best.z }; }
  game.teleport(eye[0], undefined, eye[2], 0); window.__scam = [eye, look]; game.cameraOverride = (dt, c) => { c.position.fromArray(eye); c.lookAt(look[0], look[1], look[2]); return true; };
  return JSON.stringify({ eye: eye.map((v) => +v.toFixed(1)), look: look.map((v) => +v.toFixed(1)), edge: window.__r2edge }); })()`;

const rep = { set: SET, when: new Date().toISOString(), shots: {} };
async function run(q, suffix) {
  await withBrowser(
    { width: +(o.w || 1920), height: +(o.h || 1080), maxSeconds: +(o.max || 1500) },
    async (b) => {
      await b.goto('http://127.0.0.1:' + (o.port || 5200) + '/?mute' + (q || ''));
      await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
      if (!(await startGame(b))) console.log('WARN: title did not close');
      await b.eval(
        `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; try { game.weather?.set?.('clear', { instant: true }); } catch (e) {} return 1; })()`,
      );
      for (const s of SPOTS) {
        await b.eval(
          `(() => { game.timeOfDay = ${s.tod ?? 11}; game.cameraOverride = null; return 1; })()`,
        );
        const cam = await b.eval(camJS(s));
        await b.sleep(+(o.settle || 2500));
        for (let i = 0; i < +(o.stream || 40); i++) {
          const p = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
          if (p < 2) break;
          await b.sleep(1000);
        }
        await b.eval(camJS(s));
        await b.sleep(1200);
        const ms = await b.eval(
          `new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 1500) requestAnimationFrame(f); else res(+(ts.reduce((p, c) => p + c, 0) / ts.length).toFixed(1)); }; requestAnimationFrame(f); })`,
        );
        const file = path.join(DIR, `${SET}_${s.id}${suffix}.${o.fmt || 'png'}`);
        await b.screenshot(file);
        rep.shots[s.id + suffix] = { cam: JSON.parse(cam.startsWith('{') ? cam : '{}'), ms };
        console.log(s.id + suffix, cam, ms + ' ms');
      }
      rep.errors = [...new Set(b.errors)].slice(0, 30);
      if (rep.errors.length) console.log('ERRORS\n' + rep.errors.join('\n'));
    },
  );
}
if (o.ab) {
  await run(o.q || '', '_A');
  await run(o.ab, '_B');
} else await run(o.q || '', '');
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/r2roads-shots-${SET}.json`, JSON.stringify(rep, null, 2));

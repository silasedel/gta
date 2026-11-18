#!/usr/bin/env node
// r3-world review shots (muted, one page load): fixed eye / look spots, a camera on the nearest countryside mangrove, a low road
// view for the tar crack sealer, and a traffic dump around chosen points (why cars stand still there).
//   node tools/v2/maproads/r3world-shots.mjs --set before --spots tools/v2/maproads/r3world-spots.json [--only id,id] [--q "&x=1"]
// spot: { id, tod?, eye: [x, yAboveGround, z], look: [x, yAboveGround, z], fov? }
//    or { id, mangrove: { x, z, dist, up, yaw, fov } }   (teleport near x, z, then aim at the nearest mangrove from dist m away)
//    or { id, traffic: { x, z, r } }                      (no shot: list the cars within r m, their speed and AI state)
// -> docs/v2/shots/world/<set>_<id>.jpg and docs/v2/reports/r3world-<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'r3';
const DIR = path.resolve('docs/v2/shots/world'); fs.mkdirSync(DIR, { recursive: true });
let SPOTS = JSON.parse(fs.readFileSync(o.spots || 'tools/v2/maproads/r3world-spots.json', 'utf8'));
if (o.only) { const keep = new Set(String(o.only).split(',')); SPOTS = SPOTS.filter((s) => keep.has(s.id)); }
const rep = { set: SET, when: new Date().toISOString(), shots: {} };
const gy = 'const C = game.city, gy = (X, Z) => (C.groundHeightAt(X, Z) || 0);';
const camJS = (s) => `(() => { ${gy} const s = ${JSON.stringify(s)}; let eye, look;
  if (s.eye) { eye = [s.eye[0], gy(s.eye[0], s.eye[2]) + s.eye[1], s.eye[2]]; look = [s.look[0], gy(s.look[0], s.look[2]) + s.look[1], s.look[2]]; }
  else if (s.mangrove) { const M = s.mangrove, cs = game.vegetation && game.vegetation.countryside; const t = cs && cs.nearestTree(M.x, M.z, 'mangrove'); if (!t) return 'no mangrove';
    const yaw = (M.yaw || 0) * Math.PI / 180, D = M.dist || 90; eye = [t.x + Math.sin(yaw) * D, 0, t.z + Math.cos(yaw) * D]; eye[1] = Math.max(gy(eye[0], eye[2]), C.seaLevel ?? 0) + (M.up || 6); look = [t.x, t.y + 2.5, t.z]; window.__r3t = t; }
  const fov = s.fov || (s.mangrove && s.mangrove.fov) || 0;
  game.cameraOverride = (dt, c) => { c.position.fromArray(eye); c.lookAt(look[0], look[1], look[2]); if (fov && c.fov !== fov) { c.fov = fov; c.updateProjectionMatrix(); } return true; };
  return JSON.stringify({ eye: eye.map((v) => +v.toFixed(1)), look: look.map((v) => +v.toFixed(1)), tree: window.__r3t || null }); })()`;
const trafficJS = (T) => `(() => { const V = game.vehicles, out = []; const x = ${T.x}, z = ${T.z}, r = ${T.r || 120};
  for (const v of V.list || []) { const t = v.body && v.body.translation(); if (!t || Math.hypot(t.x - x, t.z - z) > r) continue; const ai = v.ai;
    out.push({ p: [+t.x.toFixed(1), +t.y.toFixed(2), +t.z.toFixed(1)], sp: +(v.speed || 0).toFixed(1), parked: !!v.parked, flooded: !!v.flooded, inWater: !!v.inWater, ai: ai ? { edge: ai.edge && ai.edge.id, d: ai.d && +ai.d.toFixed(1), stuckT: +(ai.stuckT || 0).toFixed(1), waitT: +(ai.waitT || 0).toFixed(1), blockedT: +(ai.blockedT || 0).toFixed(1), seen: ai.seenBlock ? String(ai.seenBlock.kind || ai.seenBlock.type || 'x') : null } : null,
      water: !!(game.city.isWater && game.city.isWater(t.x, t.z)), g: +(game.city.groundHeightAt(t.x, t.z) || 0).toFixed(2) }); }
  return JSON.stringify(out); })()`;
await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; try { game.weather?.set?.('clear', { instant: true }); } catch (e) {} return 1; })()`);
  for (const s of SPOTS) {
    const p = s.eye || (s.mangrove && [s.mangrove.x, 0, s.mangrove.z]) || (s.traffic && [s.traffic.x, 0, s.traffic.z]);
    await b.eval(`(() => { game.timeOfDay = ${s.tod ?? 12}; game.cameraOverride = null; const c = game.camera; window.__r3fov0 ||= c.fov; if (c.fov !== window.__r3fov0) { c.fov = window.__r3fov0; c.updateProjectionMatrix(); } window.__r3t = null; game.teleport(${p[0]}, undefined, ${p[2]}, 0); return 1; })()`);
    await b.sleep(+(o.settle || 3000));
    for (let i = 0; i < 40; i++) { const n = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (n < 2) break; await b.sleep(1000); }
    if (s.traffic) { await b.sleep((s.traffic.wait || 20) * 1000); const r = await b.eval(trafficJS(s.traffic)); rep.shots[s.id] = { traffic: JSON.parse(r) }; console.log(s.id, r); continue; }
    if (s.mangrove) await b.sleep(4000); // countryside cells fill in after the tiles
    const cam = await b.eval(camJS(s)); await b.sleep(2000);
    const file = path.join(DIR, `${SET}_${s.id}.jpg`);
    await b.screenshot(file);
    rep.shots[s.id] = { cam: cam.startsWith('{') ? JSON.parse(cam) : cam, file: path.relative(process.cwd(), file) };
    console.log(s.id, cam);
  }
  rep.errors = [...new Set(b.errors)].slice(0, 30);
  if (rep.errors.length) console.log('ERRORS\n' + rep.errors.join('\n'));
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/r3world-${SET}.json`, JSON.stringify(rep, null, 2));

#!/usr/bin/env node
// Player movement / foot placement test (PLAYER helper). Real game, muted; an autopilot holds W (or Shift+W) and steers
// the camera yaw toward each waypoint, while a per-frame probe records foot-to-ground error (planted feet, from the foot
// IK), capsule-to-ground error, stuck time (input held but not moving) and float / sink frames.
// Courses: Nico's west stair up onto the deck, along the deck, down the bay stair, out along the dock; a curb crossing
// downtown; a slope. Shots at checkpoints.
//   node tools/v2/player/walktest.mjs --set w1 [--only house,curb,slope] [--gait walk|jog] [--q "&nico=old"]
// -> docs/v2/reports/player-walk-<set>.json, docs/v2/shots/player/<set>_<course>_<n>.png
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
import { shotsIn } from './shots.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'w';
const SHOTS = path.resolve('docs/v2/shots/player'); fs.mkdirSync(SHOTS, { recursive: true });
const only = o.only ? String(o.only).split(',') : ['house', 'curb', 'slope'];
const gait = o.gait || 'walk';
const rep = { set: SET, gait, when: new Date().toISOString(), courses: {} };

// in-page helpers: autopilot + probe
const LIB = `(() => {
  if (window.__wt) return 1;
  const THREE = game.THREE, R = game.RAPIER, W = game.world, QF = R.QueryFilterFlags, P = game.player;
  const wt = window.__wt = { pts: [], i: 0, on: false, log: [], stats: null, cam: 'follow' };
  const groundAt = (x, y, z) => { const h = W.castRay(new R.Ray({ x, y: y + 0.6, z }, { x: 0, y: -1, z: 0 }), 2.5, true, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS, undefined, P.collider); return h ? y + 0.6 - h.timeOfImpact : null; };
  const reset = () => { wt.stats = { frames: 0, moving: 0, plantedSamples: 0, errSum: 0, errMax: 0, errAbs: [], float: 0, sink: 0, stuckT: 0, stuckMax: 0, capErrMax: 0, airFrames: 0, stairSamples: 0, yMin: 1e9, yMax: -1e9, dist: 0, slide: [] }; wt.fp = [null, null]; wt.stuck = 0; wt.prev = P.position.clone(); };
  reset(); wt.reset = reset;
  const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code }));
  wt.go = (pts, jog) => { wt.pts = pts; wt.i = 0; wt.on = true; wt.done = false; wt.jog = jog; reset(); if (jog) key('ShiftLeft', true); key('KeyW', true); };
  wt.stop = () => { wt.on = false; key('KeyW', false); key('ShiftLeft', false); };
  game.cameraOverride = (dt, cam) => { const h = P.heading; const back = 3.6;
    cam.position.set(P.position.x - Math.sin(h) * back + Math.cos(h) * 1.2, P.position.y + 1.7, P.position.z - Math.cos(h) * back - Math.sin(h) * 1.2);
    cam.lookAt(P.position.x + Math.sin(h) * 2, P.position.y + 0.9, P.position.z + Math.cos(h) * 2); return true; };
  game.updaters.push(function walkProbe(dt) {
    if (!wt.on) return;
    const p = P.position, tg = wt.pts[wt.i];
    if (!tg) { wt.stop(); wt.done = true; return; }
    const dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.45) { wt.i++; return; }
    game.cameraYaw = Math.atan2(-dx, -dz);
    const S = wt.stats; S.frames++;
    S.dist += Math.hypot(p.x - wt.prev.x, p.z - wt.prev.z); wt.prev.copy(p);
    S.yMin = Math.min(S.yMin, p.y); S.yMax = Math.max(S.yMax, p.y);
    const sp = P.state.speed || 0;
    if (sp > 0.6) S.moving++;
    if (!P.state.grounded) S.airFrames++;
    // stuck: input held, barely moving
    if (sp < 0.25) { wt.stuck += dt; S.stuckT += dt; S.stuckMax = Math.max(S.stuckMax, wt.stuck); } else wt.stuck = 0;
    // capsule bottom vs the static ground under its center (should be ~0 on flat / ramps)
    const t = P.body.translation(); const gy = groundAt(t.x, t.y - P.capsule.center + 0.3, t.z);
    if (gy !== null && P.state.grounded) S.capErrMax = Math.max(S.capErrMax, Math.abs((t.y - P.capsule.center) - gy));
    const f = game.playerCharacter?.footIK?.stats;
    if (f && f.active && P.state.grounded) for (let k = 0; k < 2; k++) {
      if ((f.plant?.[k] ?? 0) < 0.85 || f.err[k] === null || f.err[k] === undefined) continue;
      const e = f.err[k]; S.plantedSamples++; S.errSum += Math.abs(e); S.errMax = Math.max(S.errMax, Math.abs(e)); S.errAbs.push(+Math.abs(e).toFixed(4));
      if (e > 0.03) S.float++; if (e < -0.03) S.sink++; if (f.stair?.[k]) S.stairSamples++;
    }
    // foot sliding: horizontal speed of a firmly planted foot (should be ~0 m/s while the body moves)
    const ch = game.playerCharacter;
    if (ch?.getBone && f && P.state.grounded && dt > 0) for (let k = 0; k < 2; k++) {
      const fb = ch.getBone(k ? 'RightFoot' : 'LeftFoot'); if (!fb) continue; const w = fb.getWorldPosition(new THREE.Vector3());
      const prev = wt.fp[k]; wt.fp[k] = w;
      if (prev && (f.plant?.[k] ?? 0) > 0.95 && sp > 0.8) S.slide.push(+(Math.hypot(w.x - prev.x, w.z - prev.z) / dt).toFixed(3));
    }
    if (wt.stuck > 3) { wt.stop(); wt.done = 'stuck'; }
  });
  return 1; })()`;

const COURSES = {
  // house-local waypoints (converted with game.nicoHouse.toWorld): yard -> west stair flight 2 -> landing -> flight 1 ->
  // deck -> north deck -> bay stair platform -> down the bay stair -> yard -> dock -> dock head
  house: { local: true, start: [-11.2, 0, 8.6], pts: [[-11.2, 6.2], [-11.2, 3.6], [-10.2, 3.6], [-8.1, 3.6], [-7.5, 3.0], [-7.5, -4.8], [5.3, -4.8], [5.3, -7.0], [4.2, -7.0], [0.3, -7.0], [1.8, -12.6], [1.8, -15.5], [1.8, -24.0]], shots: [1, 3, 5, 8, 9, 11, 12] },
  // downtown: road center -> across the curb onto the sidewalk and back (found at run time)
  curb: { find: 'curb' },
  // steepest walkable land slope near the house (found at run time)
  slope: { find: 'slope' },
};

await withBrowser({ width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 11; return 1; })()`);
  await b.eval(LIB);
  for (const cid of only) {
    const C = COURSES[cid]; if (!C) continue;
    // resolve the course in world space
    const plan = JSON.parse(await b.eval(`(() => { const C = ${JSON.stringify(C)}; const city = game.city, THREE = game.THREE;
      if (C.local) { const H = game.nicoHouse; const w = (x, y, z) => H.toWorld(new THREE.Vector3(x, y, z));
        const s = w(C.start[0], C.start[1], C.start[2]); return JSON.stringify({ start: [s.x, s.z], pts: C.pts.map(([x, z]) => { const p = w(x, 0, z); return { x: p.x, z: p.z }; }) }); }
      if (C.find === 'curb') {
        // a downtown street edge whose sidewalk is raised: sample perpendicular from the edge center
        const G = city.roadGraph; let best = null;
        for (const e of G.edges) { if (e.bridge || e.elevated || !e.pts || e.length < 30) continue; const m = e.pts[Math.floor(e.pts.length / 2)]; const mx = m.x ?? m[0], mz = m.z ?? m[1];
          if (Math.hypot(mx - 407, mz + 110) > 500) continue; const q = e.pts[Math.floor(e.pts.length / 2) + 1] || e.pts[Math.floor(e.pts.length / 2) - 1]; const qx = q.x ?? q[0], qz = q.z ?? q[1];
          let dx = qx - mx, dz = qz - mz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const nx = -dz, nz = dx; const half = (e.width || 10) / 2;
          const h0 = city.groundHeightAt(mx, mz), h1 = city.groundHeightAt(mx + nx * (half + 2.5), mz + nz * (half + 2.5));
          if (!Number.isFinite(h0) || !Number.isFinite(h1)) continue; const step = h1 - h0;
          if (step > 0.08 && step < 0.3 && (!best || Math.abs(step - 0.15) < Math.abs(best.step - 0.15))) best = { step, mx, mz, nx, nz, half }; }
        if (!best) return JSON.stringify({ err: 'no curb' });
        const P0 = { x: best.mx + best.nx * (best.half - 3), z: best.mz + best.nz * (best.half - 3) }, P1 = { x: best.mx + best.nx * (best.half + 3.5), z: best.mz + best.nz * (best.half + 3.5) };
        return JSON.stringify({ start: [P0.x - best.nx * 1, P0.z - best.nz * 1], pts: [P0, P1, P0, P1], step: best.step });
      }
      if (C.find === 'slope') {
        const H = game.nicoHouse?.spot || { x: -873.6, z: 4825.2 }; let best = null;
        for (let r = 20; r < 420; r += 12) for (let k = 0; k < 24; k++) { const an = k / 24 * Math.PI * 2, x = H.x + Math.sin(an) * r, z = H.z + Math.cos(an) * r;
          if (city.isWater?.(x, z)) continue; for (let j = 0; j < 8; j++) { const b2 = j / 8 * Math.PI * 2, x2 = x + Math.sin(b2) * 14, z2 = z + Math.cos(b2) * 14; if (city.isWater?.(x2, z2)) continue;
            const g = (city.groundHeightAt(x2, z2) - city.groundHeightAt(x, z)) / 14; if (!Number.isFinite(g)) continue;
            if (g > 0.06 && g < 0.45 && (!best || g > best.g)) best = { g, x, z, x2, z2 }; } }
        if (!best) return JSON.stringify({ err: 'no slope' });
        return JSON.stringify({ start: [best.x, best.z], pts: [{ x: best.x2, z: best.z2 }, { x: best.x, z: best.z }], grade: best.g });
      }
      return '{}'; })()`));
    if (plan.err) { console.log(cid, plan.err); rep.courses[cid] = plan; continue; }
    const sh = C.shots || [0, Math.floor(plan.pts.length / 2), plan.pts.length - 1];
    const h0 = Math.atan2(plan.pts[0].x - plan.start[0], plan.pts[0].z - plan.start[1]);
    await b.eval(`(() => { game.teleport(${plan.start[0]}, undefined, ${plan.start[1]}, ${h0}); return 1; })()`);
    await b.sleep(3500);
    await b.eval(`(() => { window.__wt.go(${JSON.stringify(plan.pts)}, ${gait === 'jog'}); return 1; })()`);
    const t0 = Date.now(); let lastI = -1, n = 0;
    while (Date.now() - t0 < 90000) {
      const s = JSON.parse(await b.eval(`JSON.stringify({ i: window.__wt.i, done: window.__wt.done, on: window.__wt.on })`));
      if (s.i !== lastI && sh.includes(s.i)) { await b.sleep(250); await b.screenshot(path.join(SHOTS, `${SET}_${cid}_${n++}.png`), { format: 'jpeg', quality: 85 }); }
      lastI = s.i;
      if (s.done || !s.on) break;
      await b.sleep(150);
    }
    await b.eval(`(() => { window.__wt.stop(); return 1; })()`);
    const res = JSON.parse(await b.eval(`(() => { const S = window.__wt.stats, e = S.errAbs.slice().sort((x, y) => x - y); const q = (p) => e.length ? e[Math.min(e.length - 1, Math.floor(e.length * p))] : null;
      return JSON.stringify({ done: window.__wt.done, reached: window.__wt.i, of: window.__wt.pts.length, frames: S.frames, dist: +S.dist.toFixed(1), plantedSamples: S.plantedSamples, footErrMean: S.plantedSamples ? +(S.errSum / S.plantedSamples).toFixed(4) : null,
        footErrP50: q(0.5), footErrP95: q(0.95), footErrMax: +S.errMax.toFixed(4), floatFrames: S.float, sinkFrames: S.sink, stairSamples: S.stairSamples, stuckSecs: +S.stuckT.toFixed(2), stuckMax: +S.stuckMax.toFixed(2),
        capsuleGroundErrMax: +S.capErrMax.toFixed(3), slideP50: (() => { const v = S.slide.slice().sort((x, y) => x - y); return v.length ? v[Math.floor(v.length * 0.5)] : null; })(), slideP90: (() => { const v = S.slide.slice().sort((x, y) => x - y); return v.length ? v[Math.floor(v.length * 0.9)] : null; })(), slideN: S.slide.length, airFrames: S.airFrames, yRange: [+S.yMin.toFixed(2), +S.yMax.toFixed(2)] }); })()`));
    rep.courses[cid] = { ...plan, ...res };
    console.log(cid, JSON.stringify(res));
  }
  if (o.shots) {     // look shots in the same page (one browser slot): --shots front,side,... (or 'all')
    rep.shots = { shots: {} };
    await b.eval(`(() => { const i = game.updaters.findIndex((f) => f.name === 'walkProbe'); if (i >= 0) game.updaters.splice(i, 1); game.cameraOverride = null; return 1; })()`);
    await shotsIn(b, { ...o, set: SET, only: o.shots === 'all' || o.shots === true ? undefined : o.shots }, rep.shots);
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 30); console.log('ERRORS', rep.errors.join('\n')); }
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/player-walk-${SET}.json`, JSON.stringify(rep, null, 2));

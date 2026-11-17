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
const only = o.only ? String(o.only).split(',') : ['house', 'curb', 'slope', 'wall'];
const gaits = String(o.gait || 'walk').split(',');
const rep = { set: SET, gaits, when: new Date().toISOString(), courses: {} };

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
    if (sp < 0.25) { wt.stuck += dt; S.stuckT += dt; S.stuckMax = Math.max(S.stuckMax, wt.stuck); (wt.held ||= []).push([p.x, p.z]); } else { wt.stuck = 0; wt.held = []; }
    // capsule bottom vs the static ground under its center (should be ~0 on flat / ramps)
    const t = P.collider.translation(); const gy = groundAt(t.x, t.y - P.capsule.center + 0.3, t.z);
    if (gy !== null && P.state.grounded) S.capErrMax = Math.max(S.capErrMax, Math.abs((t.y - P.capsule.center) - gy));
    const f = game.playerCharacter?.footIK?.stats;
    if (f && f.active && P.state.grounded) for (let k = 0; k < 2; k++) {
      if ((f.plant?.[k] ?? 0) < 0.85 || f.err[k] === null || f.err[k] === undefined) continue;
      const e = f.err[k]; S.plantedSamples++; S.errSum += Math.abs(e); S.errMax = Math.max(S.errMax, Math.abs(e)); S.errAbs.push(+Math.abs(e).toFixed(4));
      if (e > 0.03) S.float++; if (e < -0.03) S.sink++; if (f.stair?.[k]) S.stairSamples++;
    }
    // foot sliding: horizontal speed of a firmly planted sole (footIK measures it on the skinned mesh)
    if (f && f.active && P.state.grounded && sp > 0.8) for (let k = 0; k < 2; k++) if ((f.plant?.[k] ?? 0) > 0.95 && (f.lift?.[k] ?? 1) < 0.012 && (f.flat?.[k] ?? 1) < 0.02 && !f.stair?.[k]) S.slide.push(+(f.slide?.[k] ?? 0).toFixed(3));
    if (wt.stuck > 3) { wt.stop(); wt.done = 'stuck'; wt.stuckAt = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]; try { const H = game.nicoHouse; const l = H.group.worldToLocal(p.clone()); wt.stuckLocal = [+l.x.toFixed(2), +l.y.toFixed(2), +l.z.toFixed(2)]; } catch (e) {} }
  });
  return 1; })()`;

const COURSES = {
  // house-local waypoints (converted with game.nicoHouse.toWorld): yard -> west stair flight 2 -> landing -> flight 1 ->
  // deck -> north deck -> bay stair platform -> down the bay stair -> yard -> dock -> dock head
  house: { local: true, start: [-11.2, 0, 8.6], pts: [[-11.2, 6.2], [-11.2, 3.6], [-10.2, 3.6], [-8.1, 3.6], [-7.5, 3.0], [-7.5, -4.8], [5.3, -4.8], [5.3, -7.0], [4.2, -7.0], [0.3, -7.0], [1.8, -8.6], [1.8, -12.6], [1.8, -15.5], [1.8, -24.0]], shots: [1, 3, 5, 8, 9, 12, 13] },
  // downtown: road center -> across the curb onto the sidewalk and back (found at run time)
  curb: { find: 'curb', pre: [407, -110] },
  // walk straight into the lattice skirt under the front porch: must stop (no pass-through) and not vibrate
  wall: { local: true, start: [-2.2, 0, 9.0], pts: [[-2.2, 7.0], [-2.2, 1.0]], shots: [1], expectStuck: true },
  // steepest walkable land slope near the house (found at run time)
  slope: { find: 'slope', pre: [2398, 660] },   // South Beach: the sand slopes down into the surf
};

await withBrowser({ width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 900) }, async (b) => {
  const T0 = Date.now(), lg = (...m) => console.log(`[${Math.round((Date.now() - T0) / 1000)}s]`, ...m);
  lg('slot acquired, loading');
  const dump = setInterval(() => { b.eval(`JSON.stringify({ ready: !!(window.game && game.ready), boot: window.__boot?.stages?.slice?.(-1), title: game?.ui?.title })`, 5000).then((x) => lg('state', x)).catch(() => lg('state: page busy')); if (b.errors.length) lg('errors so far', b.errors.slice(-3).join(' | ')); }, 30000);
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  lg('game ready');
  if (!(await startGame(b))) console.log('WARN: title did not close');
  lg('gameplay live'); clearInterval(dump);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 11; return 1; })()`);
  await b.eval(LIB);
  for (const gait of gaits) for (const cid0 of only) {
    const C = COURSES[cid0]; if (!C) continue; const cid = gaits.length > 1 ? cid0 + '_' + gait : cid0;
    if (C.pre) {   // stream the area in first so the finder sees its cars and colliders
      await b.eval(`(() => { game.teleport(${C.pre[0]}, undefined, ${C.pre[1]}, 0); return 1; })()`); await b.sleep(3000);
      for (let i = 0; i < 25; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    }
    // resolve the course in world space
    const plan = JSON.parse(await b.eval(`(() => { const C = ${JSON.stringify(C)}; const city = game.city, THREE = game.THREE;
      if (C.local) { const H = game.nicoHouse; const w = (x, y, z) => H.toWorld(new THREE.Vector3(x, y, z));
        const s = w(C.start[0], C.start[1], C.start[2]); return JSON.stringify({ start: [s.x, s.z], pts: C.pts.map(([x, z]) => { const p = w(x, 0, z); return { x: p.x, z: p.z }; }) }); }
      if (C.find === 'curb') {
        // a downtown street edge whose sidewalk is raised: sample perpendicular from the edge center
        const G = city.roadGraph; let best = null;
        for (const e of G.edges) { if (e.bridge || e.elevated || !e.pts || e.length < 30) continue; const m = e.pts[Math.floor(e.pts.length / 2)]; const mx = m.x ?? m[0], mz = m.z ?? m[1];
          if (Math.hypot(mx - 407, mz + 110) > 450) continue; const q = e.pts[Math.floor(e.pts.length / 2) + 1] || e.pts[Math.floor(e.pts.length / 2) - 1]; const qx = q.x ?? q[0], qz = q.z ?? q[1];
          let dx = qx - mx, dz = qz - mz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const nx = -dz, nz = dx; const half = (e.width || 10) / 2;
          const h0 = city.groundHeightAt(mx, mz), h1 = city.groundHeightAt(mx + nx * (half + 2.5), mz + nz * (half + 2.5));
          if (!Number.isFinite(h0) || !Number.isFinite(h1)) continue; const step = h1 - h0;
          if (!(step > 0.08 && step < 0.3)) continue;
          // nothing parked / standing on the crossing line (cars at the curb, poles, hydrants)
          const W = game.world, R = game.RAPIER; let clear = true;
          for (let k = -3; k <= 3 && clear; k++) { const px = mx + nx * (half + k), pz = mz + nz * (half + k), y = city.groundHeightAt(px, pz);
            if ((game.vehicles?.list || []).some((v) => { try { const t = v.body.translation(); return Math.hypot(t.x - px, t.z - pz) < 4; } catch (e) { return false; } })) clear = false;
            else if (W.intersectionWithShape({ x: px, y: y + 1.1, z: pz }, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(0.45), R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, game.player.collider)) clear = false; }
          if (clear && (!best || Math.abs(step - 0.15) < Math.abs(best.step - 0.15))) best = { step, mx, mz, nx, nz, half }; }
        if (!best) return JSON.stringify({ err: 'no curb' });
        const P0 = { x: best.mx + best.nx * (best.half - 3), z: best.mz + best.nz * (best.half - 3) }, P1 = { x: best.mx + best.nx * (best.half + 2.6), z: best.mz + best.nz * (best.half + 2.6) };
        return JSON.stringify({ start: [P0.x - best.nx * 1, P0.z - best.nz * 1], pts: [P0, P1, P0, P1], step: best.step });
      }
      if (C.find === 'slope') {
        const R = game.RAPIER, W = game.world, P = game.player;
        const H = { x: game.player.position.x, z: game.player.position.z }; let best = null;
        for (let r = 0; r < 700; r += 10) for (let k = 0; k < 20; k++) { const an = k / 20 * Math.PI * 2, x = H.x + Math.sin(an) * r, z = H.z + Math.cos(an) * r;
          for (let j = 0; j < 8; j++) { const b2 = j / 8 * Math.PI * 2, x2 = x + Math.sin(b2) * 14, z2 = z + Math.cos(b2) * 14;
            const h0 = city.groundHeightAt(x, z), h2 = city.groundHeightAt(x2, z2), g = (h2 - h0) / 14; if (!Number.isFinite(g)) continue;
            if (!(Math.abs(g) > 0.03 && Math.abs(g) < 0.45) || h2 < -0.35 || h0 < -0.35 || (best && Math.abs(g) <= Math.abs(best.g))) continue;
            // a real, even slope (not a seawall / curb edge) with nothing in the way
            let ok = true;
            for (let k = 1; k < 7 && ok; k++) { const f = k / 7, xx = x + (x2 - x) * f, zz = z + (z2 - z) * f, hh = city.groundHeightAt(xx, zz);
              if (!Number.isFinite(hh) || Math.abs(hh - (h0 + (h2 - h0) * f)) > 0.25 || hh < -0.35) ok = false;
              else if (W.intersectionWithShape({ x: xx, y: hh + 1.2, z: zz }, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(0.9), R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.collider)) ok = false; }
            if (ok) best = { g, x, z, x2, z2 }; } }
        if (!best) { // fallback: a bridge approach ramp of the road network (the Keys are flat), walked at the road edge
          const G = city.roadGraph; let bb = null;
          for (const e of G.edges) {
            if (!(e.bridge || e.elevated) || !e.pts || e.pts.length < 2 || e.length < 60) continue;
            const pts = e.pts.map((q) => ({ x: q.x ?? q[0], z: q.z ?? q[1], y: q.y ?? q[2] }));
            if (Math.hypot(pts[0].x - H.x, pts[0].z - H.z) > 3500) continue;
            let i = 1; while (i < pts.length - 1 && Math.hypot(pts[i].x - pts[0].x, pts[i].z - pts[0].z) < 45) i++;
            let dx = pts[i].x - pts[0].x, dz = pts[i].z - pts[0].z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
            const off = (e.width || 8) / 2 - 0.8;
            const a0 = { x: pts[0].x - dx * 25 - dz * off, z: pts[0].z - dz * 25 + dx * off }, a1 = { x: pts[i].x - dz * off, z: pts[i].z + dx * off };
            if (city.isWater?.(a0.x, a0.z)) continue;
            const h0 = city.groundHeightAt(a0.x, a0.z), h1 = city.groundHeightAt(a1.x, a1.z, 60);
            const g = (h1 - h0) / (L + 25);
            if (Number.isFinite(g) && g > 0.02 && g < 0.15 && (!bb || g > bb.g)) bb = { g, a0, a1, dx, dz, name: e.name || e.id };
          }
          if (!bb) return JSON.stringify({ err: 'no slope' });
          const { a0, a1, dx, dz } = bb;
          return JSON.stringify({ start: [a0.x - dx * 2, a0.z - dz * 2], pts: [a1, a0], grade: 'bridge ramp ' + bb.name + ' ' + bb.g.toFixed(3) });
        }
        return JSON.stringify({ start: [best.x, best.z], pts: [{ x: best.x2, z: best.z2 }, { x: best.x, z: best.z }], grade: best.g });
      }
      return '{}'; })()`));
    lg('course', cid, plan.err || (plan.pts?.length + ' points'));
    if (plan.err) { console.log(cid, plan.err); rep.courses[cid] = plan; continue; }
    const sh = C.shots || [0, Math.floor(plan.pts.length / 2), plan.pts.length - 1];
    const h0 = Math.atan2(plan.pts[0].x - plan.start[0], plan.pts[0].z - plan.start[1]);
    await b.eval(`(() => { game.teleport(${plan.start[0]}, undefined, ${plan.start[1]}, ${h0}); return 1; })()`);
    await b.sleep(3500);
    for (let i = 0; i < 25; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); const g = await b.eval('!!game.player.state.grounded'); if (q < 3 && g) break; await b.sleep(1000); }
    await b.eval(`(() => { const P = game.player; game.teleport(${plan.start[0]}, undefined, ${plan.start[1]}, ${h0}); return 1; })()`); await b.sleep(1500);
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
      const H2 = (window.__wt.held || []).slice(-90); let jit = null; if (H2.length > 10) { const mx = H2.reduce((a, q) => a + q[0], 0) / H2.length, mz = H2.reduce((a, q) => a + q[1], 0) / H2.length; jit = +Math.max(...H2.map((q) => Math.hypot(q[0] - mx, q[1] - mz))).toFixed(4); }
      return JSON.stringify({ blockedJitter: jit, done: window.__wt.done, stuckAt: window.__wt.stuckAt, stuckLocal: window.__wt.stuckLocal, reached: window.__wt.i, of: window.__wt.pts.length, frames: S.frames, dist: +S.dist.toFixed(1), plantedSamples: S.plantedSamples, footErrMean: S.plantedSamples ? +(S.errSum / S.plantedSamples).toFixed(4) : null,
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

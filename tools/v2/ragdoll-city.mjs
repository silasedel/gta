// Ragdolls in the real city (full game on :5200 through the isolated test browser):
//   1. a parked sedan driven at 40 km/h into a pedestrian on a street (the vehicles module's own hit test fires)
//   2. a heavy punch to a pedestrian standing on a slope
//   3. six simultaneous lethal ragdolls: frame time and ragdoll physics cost
// Shots -> docs/v2/shots/ragdoll/city_*.png, numbers -> docs/v2/shots/ragdoll/city.json
import fs from 'node:fs';
import { withBrowser, GAME_READY } from './browser.mjs';
const dir = 'docs/v2/shots/ragdoll';
const out = {};
await withBrowser({ width: 1100, height: 700, maxSeconds: 420 }, async (b) => { for (let attempt = 0; attempt < 2; attempt++) { try {
  await b.goto('http://127.0.0.1:5200/');
  await b.waitFor(GAME_READY, 240);
  await b.sleep(2000);
  await b.click(550, 567); await b.key('Enter'); await b.key('Enter', false); // dismiss the title screen
  await b.sleep(4000);
  // helpers in the page: ragdoll cost probe, camera, a wait that lets the real loop run
  await b.eval(`(() => {
    const g = window.game; const T = window.__rt = { cost: [], frames: [] };
    const i = g.fixedHooks.findIndex((f) => f.name === 'ragdollFixed');
    if (i >= 0) { const f = g.fixedHooks[i]; g.fixedHooks[i] = function ragdollFixed(h) { const t = performance.now(); f(h); T.cost.push(performance.now() - t); }; }
    let last = performance.now(); const tick = (n) => { T.frames.push(n - last); last = n; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    T.cam = (px, py, pz, tx, ty, tz) => { g.cameraOverride = (dt, c) => { c.position.set(px, py, pz); c.lookAt(tx, ty, tz); return true; }; };
    T.follow = (ped, side) => { const V = g.THREE ? null : null; g.cameraOverride = (dt, c) => { const p = ped.pos; c.position.set(p.x + side.x, p.y + 1.8, p.z + side.z); c.lookAt(p.x, p.y + 0.6, p.z); return true; }; };
    return i;
  })()`);
  // ---------- 1. car hit on a street
  out.carSetup = JSON.parse(await b.eval(`(async () => {
    const g = window.game, THREE = g.THREE, P = g.player.position;
    const v = g.vehicles.spawn('sedan', P.clone().add(new THREE.Vector3(10, 0, 0)), 0, { color: 0x2a6fdb });
    if (!v) return JSON.stringify({ err: 'no car' });
    await new Promise((r) => setTimeout(r, 800));
    const t = v.body.translation(), r = v.body.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).setY(0).normalize();
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const pos = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(fwd, 7);
    const ped = g.peds.spawnAt(new THREE.Vector3(pos.x, undefined, pos.z), {}); ped.state = 'idle'; ped.idleStyle = null; ped.pinned = 60;
    const T = window.__rt; T.carPed = ped; T.car = v; T.trace = [];
    T.follow(ped, side.clone().multiplyScalar(5).addScaledVector(fwd, -1.5));
    const sp = 40 / 3.6; let drive = 1.6, el = 0;
    const pin = ped.pos.clone(), pinH = Math.atan2(side.x, side.z); // stand still on the lane (no dodging) until hit
    const hook = function carTestDrive(h) { el += h; if (!ped.rag && ped.state !== 'dead' && ped.state !== 'down') { ped.pos.copy(pin); ped.heading = pinH; ped.state = 'idle'; } if (drive > 0) { drive -= h; const lv = v.body.linvel(); v.body.setLinvel({ x: fwd.x * sp, y: lv.y, z: fwd.z * sp }, true); v.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
      if (T.trace.length < 400) { const c = v.body.translation(); T.trace.push([+el.toFixed(2), +Math.hypot(c.x - ped.pos.x, c.z - ped.pos.z).toFixed(2), +(v.speed || 0).toFixed(1), ped.state, !!ped.rag]); } };
    g.fixedHooks.push(hook); T.carHook = hook;
    return JSON.stringify({ car: [t.x, t.y, t.z].map((x) => +x.toFixed(1)), ped: ped.pos.toArray().map((x) => +x.toFixed(1)), pedState: ped.state });
  })()`, 60000));
  // wait for contact, then grab frames while the body is in the air / landing
  for (let i = 0; i < 40; i++) { await b.sleep(150); if (await b.eval('!!(window.__rt.carPed.rag)')) break; }
  for (const [i, ms] of [[1, 250], [2, 600], [3, 2500]]) { await b.sleep(ms); await b.screenshot(`${dir}/city_car_${i}.png`); }
  out.car = JSON.parse(await b.eval(`(() => { const T = window.__rt, g = window.game; g.fixedHooks.splice(g.fixedHooks.indexOf(T.carHook), 1); const tr = T.trace; const hitI = tr.findIndex((x) => x[4]);
    return JSON.stringify({ hit: hitI >= 0, hitAt: hitI >= 0 ? tr[hitI] : null, closest: Math.min(...tr.map((x) => x[1])), state: T.carPed.state, rag: !!T.carPed.rag, frozen: T.carPed.rag ? !!T.carPed.rag.frozen : null, trace: tr.filter((_, i) => i % 15 === 0) }); })()`));
  console.log('car', JSON.stringify(out.carSetup), JSON.stringify(out.car));
  // ---------- 2. heavy punch on a slope
  out.slope = JSON.parse(await b.eval(`(async () => {
    const g = window.game, THREE = g.THREE || (await import('three')), P = g.player.position, gA = g.peds._nav.groundAt;
    let best = null;
    for (let r = 4; r < 120 && !best; r += 4) for (let a = 0; a < 6.28; a += 0.3) {
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r, y = gA(x, z, P.y), y2 = gA(x + 1, z, P.y), y3 = gA(x, z + 1, P.y);
      const sl = Math.hypot(y2 - y, y3 - y); if (sl > 0.1 && sl < 0.45 && Math.abs(y - P.y) < 6) { best = { x, z, y, sl, dx: y2 - y, dz: y3 - y }; break; }
    }
    if (!best) return JSON.stringify({ err: 'no slope within 120 m' });
    const ped = g.peds.spawnAt(new THREE.Vector3(best.x, best.y, best.z), {}); ped.state = 'idle';
    const down = new THREE.Vector3(-best.dx, 0, -best.dz).normalize();
    window.__rt.follow(ped, new THREE.Vector3(down.z, 0, -down.x).multiplyScalar(4));
    await new Promise((r) => setTimeout(r, 700));
    const rnd = Math.random; Math.random = () => 0.1;
    try { g.peds.damage(ped, 34, down, 'melee', { heavy: true, strength: 0.9, byPlayer: false }); } finally { Math.random = rnd; }
    const T = window.__rt; T.slopePed = ped; T.slopeTrack = []; const t0 = performance.now();
    T.slopeTimer = setInterval(() => T.slopeTrack.push([+((performance.now() - t0) / 1000).toFixed(1), ped.state]), 100);
    return JSON.stringify({ slopeDeg: +(Math.atan(best.sl) * 57.3).toFixed(1) });
  })()`, 60000));
  if (!out.slope.err) {
    await b.sleep(500); await b.screenshot(`${dir}/city_slope_1.png`);
    await b.sleep(5500); await b.screenshot(`${dir}/city_slope_2.png`);
    Object.assign(out.slope, JSON.parse(await b.eval(`(() => { const T = window.__rt; clearInterval(T.slopeTimer); const tr = T.slopeTrack; return JSON.stringify({ states: [...new Set(tr.map((x) => x[1]))], track: tr.filter((_, i) => i % 6 === 0) }); })()`)));
  }
  console.log('slope', JSON.stringify(out.slope));
  // ---------- 3. six active ragdolls at once
  out.six = JSON.parse(await b.eval(`(async () => {
    const g = window.game, THREE = g.THREE || (await import('three')), P = g.player.position, T = window.__rt;
    const peds = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; const p = g.peds.spawnAt(new THREE.Vector3(P.x + Math.cos(a) * 4, undefined, P.z + Math.sin(a) * 4), {}); p.state = 'idle'; peds.push(p); }
    T.cam(P.x + 7, P.y + 4, P.z + 7, P.x, P.y + 0.5, P.z);
    await new Promise((r) => setTimeout(r, 1500));
    const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
    const p95 = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * 0.95)] || 0; };
    T.frames.length = 0; await new Promise((r) => setTimeout(r, 2500));
    const base = { avg: avg(T.frames), p95: p95(T.frames), n: T.frames.length };
    T.frames.length = 0; T.cost.length = 0;
    for (const p of peds) g.peds.damage(p, 200, new THREE.Vector3(p.pos.x - P.x, 0, p.pos.z - P.z), 'bullet', { strength: 0.7 });
    const active0 = peds.filter((p) => p.rag).length;
    await new Promise((r) => setTimeout(r, 900)); T.shotNow = true;
    await new Promise((r) => setTimeout(r, 1600));
    const during = { avg: avg(T.frames), p95: p95(T.frames), n: T.frames.length };
    const cost = { avgMsPerSubstep: +avg(T.cost).toFixed(3), maxMs: +Math.max(0, ...T.cost).toFixed(3), substeps: T.cost.length };
    const frozen = peds.filter((p) => p.rag && p.rag.frozen).length;
    await new Promise((r) => setTimeout(r, 2500));
    return JSON.stringify({ ragdollsStarted: active0, frozenAfter2_5s: frozen, frozenAfter5s: peds.filter((p) => p.rag && p.rag.frozen).length, frameMs: { before: base, during }, ragdollPhysicsCost: cost });
  })()`, 90000));
  await b.screenshot(`${dir}/city_six.png`);
  console.log('six', JSON.stringify(out.six));
  fs.writeFileSync(`${dir}/city.json`, JSON.stringify(out, null, 1));
  break; } catch (e) { console.log('attempt failed (page reload by another agent?)', String(e).slice(0, 160)); await b.goto('http://127.0.0.1:5200/'); await b.waitFor(GAME_READY, 240); } }
  const errs = b.errors.filter((e) => !/favicon/.test(e)); if (errs.length) console.log('CONSOLE ERRORS', errs.slice(0, 12));
});

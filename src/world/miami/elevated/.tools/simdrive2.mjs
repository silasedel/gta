// ELEVATED headless physics drive: every lane of every elevated chain at 60 / 120 / 180 km/h with a Rapier ray-cast
// vehicle set up like the game's "super" (same suspension, wheel layout, grip, downforce) on the module's real colliders.
// Fast complement to the in-game drive (drive.mjs). usage: node simdrive.mjs [speeds] [minLen]
import fs from 'node:fs';
import { makeWorld } from './world.mjs';
import { P } from '../params.js';
const SPEEDS = (process.argv[2] || '60,120,180').split(',').map(Number), MINLEN = +(process.argv[3] || 40);
const W = await makeWorld(); const { RAPIER, world, net, kind } = W;
const spec = { L: 4.6, W: 2.04, wb: 2.7, r: 0.35, yb: 0.12, belt: 0.74, mass: 1450, grip: 3.1, steer: 0.5, susp: [0.26, 56], downforce: 1.6 };
const [restLen, stiff] = spec.susp, groundOff = restLen - 9.81 / (4 * stiff) + spec.r;
function makeCar(x, y, z, heading) {
  const q = { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y + groundOff + 0.08, z).setRotation(q).setLinearDamping(0.02).setAngularDamping(0.35)
    .setAdditionalMassProperties(spec.mass, { x: 0, y: -0.24, z: -0.15 }, { x: spec.mass / 12 * (0.4 + spec.L ** 2) * 1.15, y: spec.mass / 12 * (spec.W ** 2 + spec.L ** 2) * 1.15, z: spec.mass / 12 * (spec.W ** 2 + 0.4) * 1.3 }, { x: 0, y: 0, z: 0, w: 1 }));
  const H = spec.belt - spec.yb, rr = 0.08;
  const col = world.createCollider(RAPIER.ColliderDesc.roundCuboid(spec.W / 2 - 0.02 - rr, (H - 0.06) / 2 - rr, spec.L / 2 - 0.03 - rr, rr).setTranslation(0, (spec.yb + 0.06 + spec.belt) / 2 - groundOff, 0).setDensity(0).setFriction(0.6), body);
  const vc = world.createVehicleController(body); vc.indexUpAxis = 1; vc.setIndexForwardAxis = 2;
  for (const [sx, front] of [[1, 1], [-1, 1], [1, 0], [-1, 0]]) {
    vc.addWheel({ x: sx * (spec.W / 2 - 0.25), y: 0, z: front ? spec.wb / 2 : -spec.wb / 2 }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, restLen, spec.r);
    const i = vc.numWheels() - 1; vc.setWheelSuspensionStiffness(i, stiff); vc.setWheelSuspensionCompression(i, 0.55 * 2 * Math.sqrt(stiff)); vc.setWheelSuspensionRelaxation(i, 0.75 * 2 * Math.sqrt(stiff));
    vc.setWheelMaxSuspensionTravel(i, 0.25); vc.setWheelMaxSuspensionForce(i, spec.mass * 40); vc.setWheelFrictionSlip(i, spec.grip); vc.setWheelSideFrictionStiffness(i, 1.0);
  }
  return { body, col, vc };
}
function laneRoute(c, dir, frac) {
  const F = {}, pts = [];
  const extA = c.endA === 'street' || c.endA === 'junction' ? 15 : 0, extB = c.endB === 'street' || c.endB === 'junction' ? 15 : 0;
  for (let s = c.s0 - extA; s <= c.s1 + extB; s += 1) { const sc = Math.max(0, Math.min(c.length, s)); net.framesAt(c, sc, F); const o = Math.max(-F.hw + 1.3, Math.min(F.hw - 1.3, frac * F.hw)), b = s - sc;
    pts.push([F.x - F.tz * o + F.tx * b, F.y + P.ROAD_Y + F.bank * o, F.z + F.tx * o + F.tz * b, s >= c.s0 + 2 && s <= c.s1 - 2 ? 1 : 0]); }
  if (dir < 0) pts.reverse();
  return pts;
}
const res = []; const t0 = performance.now(); let simSec = 0;
const dt = 1 / 60; world.timestep = dt;
for (const c of net.chains) {
  if (c.s1 - c.s0 < MINLEN) continue;
  let ym = 0; for (let i = 0; i < c.n; i++) ym = Math.max(ym, c.y[i]); if (ym < 1.0) continue;
  const lanes = net.laneOffsets(c, c.n >> 1), hwm = net.framesAt(c, c.length / 2).hw;
  const dirs = lanes.some((l) => !l.fwd) ? [1, -1] : [1];
  for (const dir of dirs) {
    const own = lanes.filter((l) => (dir > 0 ? l.fwd : !l.fwd)); if (!own.length) continue;
    const ln = dir > 0 ? own[own.length - 1] : own[0]; // rightmost lane in the direction of travel
    const pts = laneRoute(c, dir, ln.o / hwm); if (pts.length < 10) continue;
    for (const kmh of SPEEDS) {
      const p0 = pts[2], p1 = pts[6], car = makeCar(p0[0], p0[1], p0[2], Math.atan2(p1[0] - p0[0], p1[2] - p0[2]));
      const r = { cid: c.id, name: c.name || c.kind, dir, kmh, len: Math.round(c.s1 - c.s0), drops: 0, bumps: 0, hits: 0, hitKinds: {}, done: false, maxDev: 0, ex: [] };
      let idx = 2, steps = 0, prevOff = null, ema = null, lastProg = 0, steerCur = 0; const maxSteps = Math.ceil((pts.length / (kmh / 3.6 * 0.6) + 60) / dt);
      while (steps++ < maxSteps) {
        const t = car.body.translation(), lv = car.body.linvel(), sp = Math.hypot(lv.x, lv.z), rot = car.body.rotation();
        const hd = Math.atan2(2 * (rot.w * rot.y + rot.x * rot.z), 1 - 2 * (rot.y * rot.y + rot.x * rot.x));
        let best = idx, bd = 1e9; for (let j = idx; j < Math.min(pts.length, idx + 30); j++) { const d = Math.hypot(pts[j][0] - t.x, pts[j][2] - t.z); if (d < bd) { bd = d; best = j; } }
        if (best > idx) { idx = best; lastProg = steps; }
        if (idx >= pts.length - 3) { r.done = true; break; }
        if (steps - lastProg > 360) break; // stalled 6 s
        const onDeck = pts[idx][3]; if (onDeck) r.maxDev = Math.max(r.maxDev, bd);
        const off = t.y - groundOff - pts[idx][1];
        if (onDeck && off < -0.35) { r.drops++; r.ex.length < 3 && r.ex.push(['drop', +t.x.toFixed(1), +t.z.toFixed(1), +off.toFixed(2)]); if (off < -3) break; }
        ema = ema === null ? off : ema + (off - ema) * 0.15;
        if (onDeck && steps > 60 && Math.abs(off - ema) > 0.05) { r.bumps++; r.ex.length < 3 && r.ex.push(['bump', +t.x.toFixed(1), +t.z.toFixed(1), +(off - ema).toFixed(3)]); }
        world.contactPairsWith(car.col, (o) => { const k = kind.get(o.handle); if (k && k !== 'deck' && k !== 'street' && k !== 'ground') { let touch = false; world.contactPair(car.col, o, (m) => { if (m.numContacts() > 0) touch = true; }); if (touch) { r.hits++; r.hitKinds[k] = (r.hitKinds[k] || 0) + 1; r.ex.length < 3 && r.ex.push(['hit:' + k, +t.x.toFixed(1), +t.z.toFixed(1)]); } } });
        // pure pursuit + speed control (lateral 6.5 m/s^2 in curves)
        const Ld = Math.max(6, sp * 0.8); let k = idx; while (k < pts.length - 1 && Math.hypot(pts[k][0] - t.x, pts[k][2] - t.z) < Ld) k++;
        let alpha = Math.atan2(pts[k][0] - t.x, pts[k][2] - t.z) - hd; alpha = Math.atan2(Math.sin(alpha), Math.cos(alpha));
        const delta = Math.atan2(2 * spec.wb * Math.sin(alpha), Ld), maxSt = spec.steer * (1 + (0.24 - 1) * Math.min(1, sp / 42));
        steerCur += Math.max(-2.5 * dt, Math.min(2.5 * dt, Math.max(-maxSt, Math.min(maxSt, delta)) - steerCur));
        let kap = 0; for (let j = idx + 1; j < Math.min(pts.length - 1, idx + Math.max(30, sp * 3)); j++) { const a = pts[j - 1], b = pts[j], cc = pts[j + 1]; let d = Math.atan2(cc[0] - b[0], cc[2] - b[2]) - Math.atan2(b[0] - a[0], b[2] - a[2]); d = Math.atan2(Math.sin(d), Math.cos(d)); kap = Math.max(kap, Math.abs(d)); }
        const vT = Math.min(kmh / 3.6, kap > 1e-4 ? Math.sqrt(6.5 / kap) : 1e9);
        const fwd = sp < vT - 0.5, brk = sp > vT + 1.5;
        for (let w = 0; w < 4; w++) { car.vc.setWheelSteering(w, w < 2 ? steerCur : 0); car.vc.setWheelEngineForce(w, fwd ? 13200 / 4 * Math.max(0, 1 - Math.pow(sp / (330 / 3.6), 2.2)) : 0); car.vc.setWheelBrake(w, brk ? Math.min(1, (sp - vT) / 6) * spec.mass * 2.6 * dt : 0.06 * spec.mass * 2.6 * dt * (fwd ? 0 : 1)); }
        car.vc.updateVehicle(dt);
        let g = 0; for (let w = 0; w < 4; w++) if (car.vc.wheelIsInContact(w)) g++;
        if (g >= 2) { const df = spec.mass * 9.81 * 0.35 * spec.downforce * Math.min(4, (sp / 30) ** 2); car.body.applyImpulse({ x: 0, y: -df * dt, z: 0 }, true); }
        world.step(); simSec += dt;
      }
      r.maxDev = +r.maxDev.toFixed(2); res.push(r);
      world.removeVehicleController(car.vc); world.removeRigidBody(car.body);
    }
  }
}
const clean = res.filter((r) => r.done && !r.drops && !r.bumps && !r.hits);
const sum = { runs: res.length, clean: clean.length, notDone: res.filter((r) => !r.done).length, withDrops: res.filter((r) => r.drops).length, withBumps: res.filter((r) => r.bumps).length, withHits: res.filter((r) => r.hits).length, km: +(res.filter((r) => r.done).reduce((a, r) => a + r.len, 0) / 1000).toFixed(1), simMin: +(simSec / 60).toFixed(1), wallS: +((performance.now() - t0) / 1000).toFixed(0) };
console.log(JSON.stringify(sum));
for (const r of res) if (!(r.done && !r.drops && !r.bumps && !r.hits)) console.log(JSON.stringify({ cid: r.cid, name: r.name, dir: r.dir, kmh: r.kmh, len: r.len, done: r.done, drops: r.drops, bumps: r.bumps, hits: r.hitKinds, dev: r.maxDev, ex: r.ex }));
fs.writeFileSync(new URL('./last_simdrive_' + SPEEDS.join('_') + '.json', import.meta.url), JSON.stringify({ sum, res }));

// r2-physics offline harness: the carphys 2 controller (src/vehicles/physics/suspension.js) on a Rapier world in Node,
// no browser. Flat ground plus one obstacle; same cruise control as the in-game lab. For fast tuning and regression checks.
//   node tools/v2/physics/sim.mjs [--test curb|drop|pothole|rock|bump|flat|brake|corner] [--kmh 20] [--cls sedan] [--json out.json] [--every 3]
import RAPIER from '@dimforge/rapier3d-compat';
import { createShapeVehicle } from '../../../src/vehicles/physics/suspension.js';
import { installRelief } from '../../../src/vehicles/physics/relief.js';
import fs from 'node:fs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
await RAPIER.init();
const CLS = {
  sedan: { mass: 1450, susp: [0.36, 34], r: 0.33, tw: 0.225, archGap: 0.04, grip: 2.25, antiRoll: 5, comY: 0.48, L: 4.85, W: 1.85, wb: 2.8, track: 1.58, belt: 1.0, yb: 0.2, arch: 'sedan', drive: 'fwd', engine: 7000 },
  suv: { mass: 1750, susp: [0.4, 27], r: 0.37, tw: 0.25, archGap: 0.07, grip: 2.2, antiRoll: 6, comY: 0.6, L: 4.8, W: 1.9, wb: 2.85, track: 1.62, belt: 1.15, yb: 0.28, arch: 'suv', drive: 'awd', engine: 8000 },
  super: { mass: 1450, susp: [0.26, 56], r: 0.34, tw: 0.3, archGap: 0.045, grip: 3.1, antiRoll: 7, comY: 0.4, L: 4.5, W: 2.0, wb: 2.65, track: 1.68, belt: 0.8, yb: 0.12, arch: 'super', wedge: true, drive: 'awd', engine: 13500 },
};
const spec = { ...CLS[o.cls || 'sedan'] }; spec.cls = spec.arch;
const test = o.test || 'curb', kmh = +(o.kmh || 20);
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60;
world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 400).setTranslation(0, -0.5, 0));
const S0 = 45;
const game = { RAPIER, world, physics: {}, player: null };
installRelief(game);
if (test === 'curb' || test === 'drop') world.createCollider(RAPIER.ColliderDesc.cuboid(1.6, 0.075, 3.5).setTranslation(0, 0.075, S0 + 3.5));
if (test === 'rock') { // half-buried rock under the left wheels (+x = left), 12 cm proud
  const pts = []; for (let i = 0; i < 60; i++) { const u = Math.random() * 2 - 1, th = Math.random() * 6.283, s = Math.sqrt(1 - u * u); pts.push(s * Math.cos(th) * 0.34, u * 0.24, s * Math.sin(th) * 0.28); }
  world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setTranslation(spec.track / 2, 0.12 - 0.24, S0));
}
if (test === 'pothole') game.physics.addRelief({ kind: 'pothole', x: -spec.track / 2, z: S0, ax: 0, az: 1, len: 1.3, wid: 1.2, D: 0.065 });
if (test === 'bump') game.physics.addRelief({ kind: 'bump', x: 0, z: S0, ax: 0, az: 1, len: 0.9, wid: 3.4, D: 0.075 });
// chassis like vehicles.js createVehicle
const [restLen, stiff] = spec.susp, eqLen = restLen - 9.81 / (4 * stiff), groundOff = eqLen + spec.r, m = spec.mass, L = spec.L, W = spec.W, H = spec.belt - spec.yb;
const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, groundOff + 0.02, 0).setAngularDamping(0.35).setLinearDamping(0.02)
  .setAdditionalMassProperties(m, { x: 0, y: spec.comY - groundOff, z: 0.05 }, { x: m / 12 * (H * H + L * L) * 1.15, y: m / 12 * (W * W + L * L) * 1.15, z: m / 12 * (W * W + H * H) * 1.3 }, { x: 0, y: 0, z: 0, w: 1 }));
world.createCollider(RAPIER.ColliderDesc.cuboid(W / 2 - 0.1, H / 2, L / 2 - 0.1).setTranslation(0, (spec.yb + spec.belt) / 2 - groundOff, 0).setDensity(0), body);
body.recomputeMassPropertiesFromColliders();
const wheels = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ x: sx * spec.track / 2, z: sz * spec.wb / 2 }));
const vc = createShapeVehicle(game, body, wheels, spec, restLen, stiff, { isPlayer: () => true });
// settle, then cruise
const rec = []; const target = kmh / 3.6; let t = 0;
const q2e = (r) => { const sinp = 2 * (r.w * r.x - r.z * r.y); const pitch = Math.asin(Math.max(-1, Math.min(1, sinp))); const roll = Math.atan2(2 * (r.w * r.z + r.x * r.y), 1 - 2 * (r.x * r.x + r.z * r.z)); return { pitch: -pitch * 57.2958, roll: roll * 57.2958 }; };
let pvy = 0, pv = null;
for (let k = 0; k < 60 * 30; k++) {
  const p = body.translation(), sp = vc.currentVehicleSpeed();
  const settle = k < 90;
  let thr = 0, brake = 0, steer = 0;
  if (!settle) {
    if (test === 'brake') { if (p.z < 40) thr = Math.max(0, Math.min(1, (target - sp) * 0.9 + 0.15)); else brake = 1; }
    else if (test === 'corner') { thr = Math.max(0, Math.min(1, (target - sp) * 0.9 + 0.15)); steer = p.z > 30 ? +(o.steer || 0.12) : 0; }
    else thr = Math.max(0, Math.min(1, (target - sp) * 0.9 + 0.15 * target / 10));
    steer += -p.x * 0.3; // hold x = 0
  }
  for (let i = 0; i < 4; i++) {
    const front = i < 2; vc.setWheelSteering(i, front ? steer * 0.6 : 0);
    const drv = spec.drive === 'awd' || (spec.drive === 'fwd' ? front : !front);
    vc.setWheelEngineForce(i, drv ? thr * spec.engine / (spec.drive === 'awd' ? 4 : 2) : 0);
    vc.setWheelBrake(i, (brake ? brake : (thr ? 0 : 0.06)) * m * 2.6 / 60 * (front ? 1.15 : 0.85));
  }
  vc.updateVehicle(1 / 60);
  world.step(); t += 1 / 60;
  const lv = body.linvel(), ay = (lv.y - pvy) * 60; pvy = lv.y;
  let along = 0, alat = 0; { const r0 = body.rotation(); const fwx = 2 * (r0.x * r0.z + r0.w * r0.y), fwz = 1 - 2 * (r0.x * r0.x + r0.y * r0.y); const fl = Math.hypot(fwx, fwz) || 1;
    if (pv) { const ax = (lv.x - pv.x) * 60, az = (lv.z - pv.z) * 60; along = (ax * fwx + az * fwz) / fl / 9.81; alat = (ax * fwz - az * fwx) / fl / 9.81; } pv = { x: lv.x, z: lv.z }; }
  const at = q2e(body.rotation());
  rec.push({ t: +t.toFixed(3), s: +p.z.toFixed(3), x: +p.x.toFixed(3), y: +p.y.toFixed(4), kmh: +(sp * 3.6).toFixed(2), pitch: +at.pitch.toFixed(3), roll: +at.roll.toFixed(3), ay: +ay.toFixed(2), gl: +along.toFixed(3), gy: +alat.toFixed(3),
    tr: [0, 1, 2, 3].map((i) => +vc.wheelState(i).travel.toFixed(4)), ft: [0, 1, 2, 3].map((i) => Math.round(vc.wheelState(i).ft)), c: [0, 1, 2, 3].map((i) => (vc.wheelIsInContact(i) ? 1 : 0)) });
  if (p.z > (test === 'brake' ? 1e9 : 66) || (test === 'brake' && !settle && p.z > 41 && Math.abs(sp) < 0.05)) break;
}
const win = rec.filter((r) => r.s > S0 - 6 && r.s < S0 + 16);
const base = rec.filter((r) => r.t > 1.4 && r.s < S0 - 8);
const stat = (arr, f) => ({ min: +Math.min(...arr.map(f)).toFixed(3), max: +Math.max(...arr.map(f)).toFixed(3) });
const dyn = rec.filter((r) => r.t > 1.6);
const sm = (f) => { const v = dyn.map(f); const o2 = []; for (let i = 0; i < v.length; i++) { let q = 0, n = 0; for (let j = Math.max(0, i - 5); j <= Math.min(v.length - 1, i + 5); j++) { q += v[j]; n++; } o2.push(q / n); } return o2; };
console.log(JSON.stringify({ dyn: { pitch: stat(dyn, (r) => r.pitch), roll: stat(dyn, (r) => r.roll), gLong: { min: +Math.min(...sm((r) => r.gl)).toFixed(3), max: +Math.max(...sm((r) => r.gl)).toFixed(3) }, gLat: { min: +Math.min(...sm((r) => r.gy)).toFixed(3), max: +Math.max(...sm((r) => r.gy)).toFixed(3) }, stopS: test === 'brake' ? +(rec[rec.length - 1].s - 40).toFixed(2) : undefined } }));
console.log(JSON.stringify({ test, kmh, cls: o.cls || 'sedan', params: vc.params,
  flat: { ftFL: stat(base.slice(-60), (r) => r.ft[0]), trFL: stat(base.slice(-60), (r) => r.tr[0] * 100), pitch: stat(base.slice(-60), (r) => r.pitch) },
  obstacle: win.length ? { pitch: stat(win, (r) => r.pitch), roll: stat(win, (r) => r.roll), y: stat(win, (r) => r.y), ay: stat(win, (r) => r.ay), tr: [0, 1, 2, 3].map((i) => stat(win, (r) => r.tr[i] * 100)), kmh: stat(win, (r) => r.kmh), air: win.filter((r) => r.c.reduce((x, y) => x + y) < 4).length } : null }));
if (o.every) for (const r of rec.filter((r, i) => i % +o.every === 0 && r.s > S0 - 3 && r.s < S0 + 14)) console.log(r.s.toFixed(2), r.y.toFixed(3), r.kmh.toFixed(1), 'p', r.pitch.toFixed(2), 'r', r.roll.toFixed(2), 'tr', r.tr.map((v) => (v * 100).toFixed(1)).join(' '), 'ft', r.ft.join(' '), r.c.join(''));
if (o.json) fs.writeFileSync(o.json, JSON.stringify({ test, kmh, rec }));

// RAGDOLL bench: the combat range harness (flat ground, same peds interface) plus a staircase and a drivable box car.
// Scripted, deterministic scenarios (punch, gunshot, car hit, fall down stairs) rendered as frame strips plus
// bone-space metrics (limb interpenetration, wrong-way knee / elbow bends, neck over-bend, jitter). Used by
// tools/v2/ragdoll-shots.mjs through tools/v2/browser.mjs. Works with any ragdoll implementation behind game.peds.
import * as THREE from 'three';
import { createRangeGame } from '../../gameplay/combat/rangeHarness.js';

const game = await createRangeGame({});
const R = game.range;
// staircase: 9 steps of 0.18 m rise / 0.30 m run going up toward -Z from z = 20, landing 2 m deep at the top
const STAIR = { x: 8, z0: 20, rise: 0.18, run: 0.3, n: 9 };
for (let i = 0; i < STAIR.n; i++) R.addBox(STAIR.x, 0, STAIR.z0 - STAIR.run * (i + 0.5), 3, STAIR.rise * (i + 1), STAIR.run, 'concrete');
const TOPY = STAIR.rise * STAIR.n, TOPZ = STAIR.z0 - STAIR.run * STAIR.n;
R.addBox(STAIR.x, 0, TOPZ - 1, 3, TOPY, 2, 'concrete');
R.finalizeGround(80);
game.teleport(-30, 0, -30, 0);
game.manual = true;
game.start();

const peds = game.peds;
let ped = null, car = null, carDrive = null;
const SEG = [ // bone pairs + radius for the bone-space penetration metric; group = limb chain id
  ['Hips', 'Spine1', 0.11, 'T'], ['Spine1', 'Spine2', 0.10, 'T'], ['Spine2', 'Neck', 0.11, 'T'], ['Head', 'HeadTop_End', 0.08, 'T'],
  ['LeftArm', 'LeftForeArm', 0.04, 'AL'], ['LeftForeArm', 'LeftHand', 0.035, 'AL'], ['RightArm', 'RightForeArm', 0.04, 'AR'], ['RightForeArm', 'RightHand', 0.035, 'AR'],
  ['LeftUpLeg', 'LeftLeg', 0.06, 'LL'], ['LeftLeg', 'LeftFoot', 0.045, 'LL'], ['RightUpLeg', 'RightLeg', 0.06, 'LR'], ['RightLeg', 'RightFoot', 0.045, 'LR'],
];
// pairs that touch anatomically (joint neighbours, arm next to chest, thigh next to pelvis) are not counted
const SKIP = new Set(['0-1', '1-2', '2-3', '2-4', '2-6', '0-8', '0-10', '4-5', '6-7', '8-9', '10-11', '1-4', '1-6', '0-4', '0-6']);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
function segDist(p1, q1, p2, q2) {
  const d1 = _a.subVectors(q1, p1), d2 = _b.subVectors(q2, p2), r = _c.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r); let s, t;
  const c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  s = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e; if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  const x = p1.clone().addScaledVector(d1, s), y = p2.clone().addScaledVector(d2, t); return x.distanceTo(y);
}
function wp(name) { const b = ped.char.getBone(name); return b ? b.getWorldPosition(new THREE.Vector3()) : null; }
function metrics() {
  const P = SEG.map(([a, b]) => [wp(a), wp(b)]);
  let pen = 0, penPairs = [];
  for (let i = 0; i < SEG.length; i++) for (let j = i + 1; j < SEG.length; j++) {
    if (SKIP.has(i + '-' + j) || SEG[i][3] === SEG[j][3] || !P[i][0] || !P[i][1] || !P[j][0] || !P[j][1]) continue;
    const depth = SEG[i][2] + SEG[j][2] - segDist(P[i][0], P[i][1], P[j][0], P[j][1]);
    if (depth > 0.025) { pen = Math.max(pen, depth); penPairs.push(SEG[i][0] + '/' + SEG[j][0]); }
  }
  // wrong-way bends. knee: shin must bend backwards relative to the thigh; elbow: forearm must not hyperextend
  const right = wp('RightUpLeg').sub(wp('LeftUpLeg')).normalize();
  const bend = (a, b, c, axis) => { const u = wp(b).sub(wp(a)).normalize(), v = wp(c).sub(wp(b)).normalize(); return { ang: Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1)), side: _d.crossVectors(u, v).dot(axis) }; };
  let wrong = 0;
  for (const s of ['Left', 'Right']) {
    const k = bend(s + 'UpLeg', s + 'Leg', s + 'Foot', right); if (k.ang > 0.15 && k.side > 0) wrong = Math.max(wrong, k.ang); // knee bent forwards (right = -X for a +Z facing body, a normal knee bend gives side < 0)
  }
  const elbow = []; for (const s of ['Left', 'Right']) elbow.push(+bend(s + 'Arm', s + 'ForeArm', s + 'Hand', right).ang.toFixed(2));
  const hd = wp('HeadTop_End') || wp('Head'), nk = wp('Neck'), sp = wp('Spine2');
  const neck = Math.acos(THREE.MathUtils.clamp(hd.clone().sub(nk).normalize().dot(nk.clone().sub(sp).normalize()), -1, 1));
  return { pen: +pen.toFixed(3), penPairs, kneeWrong: +wrong.toFixed(2), neck: +neck.toFixed(2), elbow, pelvisY: +wp('Hips').y.toFixed(2), state: ped.state };
}

const SC = {
  punch: { pos: [0, 0, 0], heading: Math.PI, cam: [3.0, 0.5, 0.6, 0, 0, 0], fire() { peds.damage(ped, 34, new THREE.Vector3(0.15, 0, 1), 'melee', { heavy: true, strength: 0.9, limb: 'head', point: wp('Head'), byPlayer: true }); } },
  shove: { pos: [0, 0, 0], heading: Math.PI, cam: [3.0, 0.5, 0.6, 0, 0, 0], fire() { peds.knockDown(ped, new THREE.Vector3(0, 0, -1), { kind: 'melee', strength: 0.5, balance: true, lethal: false, vel: { x: 0, y: 0.1, z: -0.9 }, point: wp('Spine2'), impulse: new THREE.Vector3(0, 2, -18) }); } },
  gun: { pos: [0, 0, 0], heading: Math.PI, cam: [3.0, 0.5, 0.4, 0, 0, 0], fire() { peds.damage(ped, 140, new THREE.Vector3(0, 0, 1), 'bullet', { limb: 'chest', zone: 'torso', strength: 0.6, point: wp('Spine2'), byPlayer: true }); } },
  car: { pos: [0, 0, 0], heading: -Math.PI / 2, cam: [4.2, 0.9, -0.6, 0, 0, 0], car: 40, fire: null },
  stairs: { pos: [STAIR.x, TOPY, TOPZ + 0.25], heading: Math.PI, cam: [3.6, 0.7, 0.4, 0, 0, 0], fire() { peds.damage(ped, 35, new THREE.Vector3(0, 0, 1), 'melee', { heavy: true, strength: 1, limb: 'chest', point: wp('Spine2'), byPlayer: true }); } },
};
let sheet = null, sctx = null;
window.bench = {
  // run one scenario; frames = seconds at which to grab a tile; returns { sheet dataURL, metrics per frame, worst }
  run(name, frames = [0, 0.12, 0.25, 0.45, 0.7, 1.0, 1.5, 2.2, 3.2, 4.5], tile = [380, 380]) {
    const s = SC[name];
    for (const p of peds.list) { p.active = false; if (p.rag) { try { peds.rag.remove(p.rag); } catch (e) { /* */ } } game.scene.remove(p.root); try { game.world.removeRigidBody(p.body); } catch (e) { /* */ } }
    peds.list.length = 0;
    for (const v of game.vehicles.list) { game.scene.remove(v.mesh); try { game.world.removeRigidBody(v.body); } catch (e) { /* */ } }
    game.vehicles.list.length = 0; car = null; carDrive = null;
    ped = peds.spawnAt({ x: s.pos[0], y: s.pos[1], z: s.pos[2] }, { heading: s.heading, seed: 2053, outfit: 'residential' });
    ped.speed = 0;
    const [cx, cy, cz, tx, ty, tz] = s.cam;
    const off = new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]);
    const look = new THREE.Vector3(off.x, off.y + 0.9, off.z), camOff = new THREE.Vector3(cx - tx, cy - ty, cz - tz);
    game.cameraOverride = (dt, c) => {
      const h = wp('Hips'); if (h) look.lerp(_d.set(h.x, Math.max(h.y, (name === 'stairs' ? 0 : off.y) + 0.55), h.z), Math.min(1, dt * 6));
      c.position.copy(look).add(camOff); c.lookAt(look); c.fov = 45; c.updateProjectionMatrix(); return true; };
    game.step(45); // settle the idle animation
    if (s.car) {
      const kmh = s.car, v = kmh / 3.6;
      car = game.vehicles.spawn('sedan', { x: s.pos[0], y: 0, z: s.pos[2] - 9 }, 0, { color: 0x2a6fdb });
      let hitDone = false, t = 0;
      carDrive = (dt) => {
        t += dt; const lv = car.body.linvel(); const tr = car.body.translation();
        const target = hitDone && t > 0.5 ? Math.max(0, lv.z - 7 * dt) : v; // brake hard 0.5 s after the hit
        car.body.setLinvel({ x: lv.x, y: lv.y, z: target }, true);
        if (!hitDone && tr.z + 2.25 >= ped.pos.z - 0.3) { hitDone = true; t = 0; peds.damage(ped, kmh * 1.5, new THREE.Vector3(0, 0.1, 1), 'car', { point: wp('LeftLeg') }); }
      };
      game.fixedHooks.push((dt) => carDrive && carDrive(dt));
      // drive until contact, then the frames start
      for (let i = 0; i < 120 && ped.state !== 'down' && ped.state !== 'dead'; i++) game.step(1);
    } else s.fire();
    const W = tile[0], H = tile[1];
    sheet = document.createElement('canvas'); const COLS = 5; sheet.width = W * COLS; sheet.height = H * Math.ceil(frames.length / COLS); sctx = sheet.getContext('2d');
    const out = []; let t = 0, worst = { pen: 0, kneeWrong: 0, neck: 0 }, penFrames = 0, n = 0;
    const cvs = game.renderer.domElement;
    let fi = 0;
    const end = frames[frames.length - 1];
    while (t <= end + 1e-6) {
      game.step(1); t += 1 / 60; n++;
      const m = metrics();
      worst.pen = Math.max(worst.pen, m.pen); worst.kneeWrong = Math.max(worst.kneeWrong, m.kneeWrong); worst.neck = Math.max(worst.neck, m.neck); if (m.pen > 0) penFrames++;
      if (fi < frames.length && t >= frames[fi] - 1e-6) {
        const sw = cvs.width, sh = cvs.height; let sc = Math.min(sw / W, sh / H) * 0.98;
        const X = (fi % COLS) * W, Y = Math.floor(fi / COLS) * H; sc = Math.min(sw / W, sh / H) * 0.98;
        sctx.drawImage(cvs, (sw - W * sc) / 2, (sh - H * sc) / 2, W * sc, H * sc, X, Y, W, H);
        sctx.fillStyle = 'rgba(0,0,0,.55)'; sctx.fillRect(X, Y, 92, 20); sctx.fillStyle = '#fff'; sctx.font = '600 13px system-ui'; sctx.fillText(frames[fi].toFixed(2) + ' s', X + 6, Y + 15);
        out.push(Object.assign({ t: frames[fi] }, m)); fi++;
      }
    }
    return { name, frames: out, worst, penFrames, steps: n, rag: peds.rag.active.length, sheet: sheet.toDataURL('image/png') };
  },
};
window.benchReady = true;

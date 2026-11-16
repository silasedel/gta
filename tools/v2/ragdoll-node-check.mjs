// usage: node tools/v2/ragdoll-node-check.mjs gun|punch|car   (EVERY=1 for every frame)
// node-only physics check of src/npc/ragdoll.js on a synthetic T-pose skeleton (no rendering)
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRagdollSystem } from '../../src/npc/ragdoll.js';
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setTranslation(0, -0.5, 0));
const stairs = process.argv.includes('stairs');
if (stairs) for (let i = 0; i < 9; i++) world.createCollider(RAPIER.ColliderDesc.cuboid(1.5, 0.09 * (i + 1), 0.15).setTranslation(0, 0.09 * (i + 1), 2 + 0.3 * (8 - i) ));
const game = { world, RAPIER, fixedHooks: [] };
// skeleton: [name, parent, local offset]
const S = [['Hips', null, [0, 0.95, 0]], ['Spine', 'Hips', [0, 0.1, 0]], ['Spine1', 'Spine', [0, 0.12, 0]], ['Spine2', 'Spine1', [0, 0.13, 0]], ['Neck', 'Spine2', [0, 0.17, 0]], ['Head', 'Neck', [0, 0.1, 0.02]],
  ['LeftShoulder', 'Spine2', [0.05, 0.12, 0]], ['LeftArm', 'LeftShoulder', [0.12, 0, 0]], ['LeftForeArm', 'LeftArm', [0.28, 0, 0]], ['LeftHand', 'LeftForeArm', [0.25, 0, 0]],
  ['RightShoulder', 'Spine2', [-0.05, 0.12, 0]], ['RightArm', 'RightShoulder', [-0.12, 0, 0]], ['RightForeArm', 'RightArm', [-0.28, 0, 0]], ['RightHand', 'RightForeArm', [-0.25, 0, 0]],
  ['LeftUpLeg', 'Hips', [0.09, -0.06, 0]], ['LeftLeg', 'LeftUpLeg', [0, -0.42, 0]], ['LeftFoot', 'LeftLeg', [0, -0.4, 0]], ['LeftToeBase', 'LeftFoot', [0, -0.06, 0.13]],
  ['RightUpLeg', 'Hips', [-0.09, -0.06, 0]], ['RightLeg', 'RightUpLeg', [0, -0.42, 0]], ['RightFoot', 'RightLeg', [0, -0.4, 0]], ['RightToeBase', 'RightFoot', [0, -0.06, 0.13]]];
function makeChar(x, y, z, heading) {
  const root = new THREE.Group(); root.position.set(x, y, z); root.rotation.y = heading;
  const arm = new THREE.Group(); root.add(arm); const bones = {}, rest = {};
  for (const [n, p, o] of S) { const b = new THREE.Bone(); b.name = n; b.position.set(...o); (p ? bones[p] : arm).add(b); bones[n] = b; rest[n] = { q: b.quaternion.clone(), p: b.position.clone() }; }
  // idle pose: arms down, slight elbow + knee bend
  bones.LeftArm.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.3);
  bones.RightArm.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.3);
  bones.LeftForeArm.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.3);
  bones.RightForeArm.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
  bones.LeftLeg.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.1); bones.RightLeg.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.1);
  root.updateMatrixWorld(true);
  return { root, model: root, getBone: (n) => bones[n] || null, getRest: (n) => rest[n] || null, bones };
}
const rag = createRagdollSystem(game, 6);
const mode = process.argv[2] || 'gun';
const ch = makeChar(0, stairs ? 0.81 + 0.0 : 0, stairs ? 1.2 : 0, stairs ? Math.PI : 0);
if (stairs) { /* landing */ world.createCollider(RAPIER.ColliderDesc.cuboid(1.5, 0.405, 1).setTranslation(0, 0.405, 0.85)); }
const O = {
  gun: { kind: 'bullet', strength: 0.6, lethal: true, vel: { x: 0, y: 0, z: -0.6 }, hit: { impulse: new THREE.Vector3(0, 2, -18), point: new THREE.Vector3(0, 1.35, 0.1) } },
  punch: { kind: 'melee', strength: 0.9, lethal: false, balance: true, vel: { x: 0, y: 0.3, z: -1.5 }, hit: { impulse: new THREE.Vector3(0, 3, -30), point: new THREE.Vector3(0, 1.6, 0.1) } },
  car: { kind: 'car', strength: 0.7, lethal: true, vel: { x: 0, y: 1.8, z: -8.9 }, hit: { impulse: new THREE.Vector3(0, 0, -53), point: new THREE.Vector3(0, 0.5, 0.1) } },
  stairs: { kind: 'melee', strength: 1, lethal: false, balance: true, vel: { x: 0, y: 0.3, z: 1.5 }, hit: { impulse: new THREE.Vector3(0, 3, 30), point: new THREE.Vector3(0, 2.2, 1.2) } },
}[mode];
const rd = rag.start(ch, O);
const h = 1 / 60; world.timestep = h;
const P = (n) => ch.bones[n].getWorldPosition(new THREE.Vector3());
let arch = 0, knee = 0;
const relX = (a, b) => { const r = new THREE.Quaternion().copy(a.body.rotation()).invert().multiply(new THREE.Quaternion().copy(b.body.rotation())); if (r.w < 0) r.set(-r.x, -r.y, -r.z, -r.w); return 2 * Math.asin(Math.max(-1, Math.min(1, r.x))); };
for (let i = 0; i < 300; i++) {
  for (const f of game.fixedHooks) f(h); world.step(); rag.update(h);
  if (!rd.frozen && !rd.recovered) { arch = Math.min(arch, relX(rd.byKey.pelvis, rd.byKey.chest)); for (const k of ['shinL', 'shinR']) { const p = rd.byKey[k]; const r = new THREE.Quaternion().copy(p.parent.body.rotation()).invert().multiply(new THREE.Quaternion().copy(p.body.rotation())); if (r.w < 0) r.set(-r.x, -r.y, -r.z, -r.w); const a = 2 * Math.acos(Math.min(1, r.w)); knee = Math.max(knee, a); } }
  if (i % (process.env.EVERY ? +process.env.EVERY : 15) === (process.env.EVERY ? 0 : 14) || rd.frozen) {
    let mv = 0, mw = 0, wk = ''; if (!rd.frozen) for (const p of rd.parts) { const v = p.body.linvel(), w = p.body.angvel(); mv = Math.max(mv, Math.hypot(v.x, v.y, v.z)); const ww = Math.hypot(w.x, w.y, w.z); if (ww > mw) { mw = ww; wk = p.key; } } mv = mv.toFixed(2) + ' w' + mw.toFixed(2) + wk + ' still' + rd.still.toFixed(2);
    const hp = P('Hips'), hd = P('Head');
    console.log(((i + 1) / 60).toFixed(2), rd.mode, 'hips', hp.toArray().map((v) => v.toFixed(2)).join(','), 'head y', hd.y.toFixed(2), 'maxV', mv, rd.frozen ? 'FROZEN ' + rd.why : '', rd.recovered ? 'RECOVERED' : '', rd.settled ? 'settled' : '');
    if (rd.frozen || rd.recovered) break;
  }
}
console.log('worst spine extension (rad, negative = arch back)', arch.toFixed(2), 'worst knee bend', knee.toFixed(2));

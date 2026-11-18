// r4-anim: solves the kneel clip's joint angles on the X Bot canonical rig by coordinate descent toward joint targets
// (meters; facing +Z, character-left +X). Prints the ops to paste into src/player/proceduralClips.js (kneel).
import fs from 'node:fs';
import * as THREE from 'three';
const buf = fs.readFileSync(new URL('../../../public/assets/characters/Xbot.glb', import.meta.url));
const jlen = buf.readUInt32LE(12); const J = JSON.parse(buf.slice(20, 20 + jlen).toString());
const joints = new Set(J.skins[0].joints);
const objs = J.nodes.map((n, i) => { const o = joints.has(i) ? new THREE.Bone() : new THREE.Object3D(); o.name = (n.name || '').replace(/^mixamorig[:_]?/, '');
  if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); return o; });
J.nodes.forEach((n, i) => (n.children || []).forEach((c) => objs[i].add(objs[c])));
const root = new THREE.Group(); J.scenes[0].nodes.forEach((i) => root.add(objs[i]));
const B = {}; objs.forEach((o) => { if (o.isBone && !B[o.name]) B[o.name] = o; });
const hips0 = B.Hips.position.clone();
const D = Math.PI / 180, E = new THREE.Euler();
const pose = {};   // bone -> [ex, ey, ez] degrees
const set = () => { for (const n in pose) { const [x, y, z] = pose[n]; B[n].quaternion.setFromEuler(E.set(x * D, y * D, z * D, 'XYZ')); } root.updateMatrixWorld(true); };
const P = (n) => B[n].getWorldPosition(new THREE.Vector3());
const HIPS = [0, -48, -10];
B.Hips.position.set(hips0.x + HIPS[0], hips0.y + HIPS[1], hips0.z + HIPS[2]);
Object.assign(pose, { Spine: [24, 0, 0], Spine1: [8, 0, 0], Spine2: [0, 0, 0], Neck: [0, 0, 0], Head: [14, 0, 0],
  LeftUpLeg: [-85, 0, 0], LeftLeg: [90, 0, 0], LeftFoot: [0, 0, 0], RightUpLeg: [0, 0, 0], RightLeg: [90, 0, 0], RightFoot: [40, 0, 0], RightToeBase: [0, 0, 0],
  LeftArm: [0, -40, -60], LeftForeArm: [0, -60, 0], LeftHand: [0, 0, 0], RightArm: [0, 10, 75], RightForeArm: [0, 10, 0], RightHand: [0, 0, 0] });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function solve(bones, targets, iters = 400) {
  const init = Object.fromEntries(bones.map((b) => [b, pose[b].slice()]));
  const cost = () => { set(); let c = 0; for (const [n, t, w] of targets) { const p = P(n); c += w * (typeof t === 'function' ? t(p) : p.distanceToSquared(t)); }
    for (const b of bones) for (let k = 0; k < 3; k++) c += 1e-7 * (pose[b][k] - init[b][k]) ** 2; return c; };
  let step = 8, best = cost();
  for (let it = 0; it < iters && step > 0.05; it++) { let imp = false;
    for (const b of bones) for (let k = 0; k < 3; k++) for (const s of [step, -step]) { pose[b][k] += s; const c = cost(); if (c < best) { best = c; imp = true; } else pose[b][k] -= s; }
    if (!imp) step *= 0.5; }
  return best;
}
const groundY = (y0) => (p) => (p.y - y0) ** 2;
// legs: left foot planted forward (knee up), right knee down with the toes tucked under
console.log('legL', solve(['LeftUpLeg', 'LeftLeg', 'LeftFoot'], [['LeftLeg', V(0.11, 0.5, 0.36), 1], ['LeftFoot', V(0.11, 0.085, 0.34), 3], ['LeftToeBase', V(0.11, 0.025, 0.46), 3]]).toFixed(5));
console.log('legR', solve(['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'], [['RightLeg', V(-0.1, 0.06, -0.06), 3], ['RightFoot', V(-0.1, 0.15, -0.47), 2], ['RightToeBase', V(-0.1, 0.03, -0.44), 3], ['RightToe_End', V(-0.1, 0.015, -0.34), 2]]).toFixed(5));
const kneeL = P('LeftLeg');
console.log('kneeL', kneeL.toArray().map((x) => +x.toFixed(3)));
// arms: left forearm across the raised knee, hand hanging over it; right hand resting on the right thigh
const wL = V(kneeL.x - 0.01, kneeL.y + 0.07, kneeL.z + 0.08);
console.log('armL', solve(['LeftArm', 'LeftForeArm', 'LeftHand'], [['LeftHand', wL, 4], ['LeftForeArm', V(kneeL.x + 0.05, kneeL.y + 0.12, kneeL.z - 0.2), 1], ['LeftHandMiddle1', V(wL.x - 0.01, wL.y - 0.07, wL.z + 0.05), 2]]).toFixed(5));
const hR = P('RightUpLeg'), kR = P('RightLeg'); const thR = V().lerpVectors(hR, kR, 0.38);
const wR = V(thR.x - 0.02, thR.y, thR.z + 0.1);
console.log('armR', solve(['RightArm', 'RightForeArm', 'RightHand'], [['RightHand', wR, 4], ['RightForeArm', V(-0.24, 0.62, -0.12), 0.5], ['RightHandMiddle1', V(wR.x + 0.01, wR.y - 0.09, wR.z + 0.01), 2]]).toFixed(5));
set();
const r = (v) => v.toArray().map((x) => +x.toFixed(3));
for (const n of ['Hips', 'Head', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToe_End', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToe_End', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandMiddle1', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle1']) if (B[n]) console.log(n.padEnd(16), JSON.stringify(r(P(n))));
const ops = (n) => { const [x, y, z] = pose[n].map((a) => Math.round(a)); const o = []; if (z) o.push(`['z', ${z}]`); if (y) o.push(`['y', ${y}]`); if (x) o.push(`['x', ${x}]`); return `${n}: [${o.join(', ')}]`; };
console.log('{ ' + Object.keys(pose).filter((n) => pose[n].some((a) => Math.round(a))).map(ops).join(', ') + ' }');

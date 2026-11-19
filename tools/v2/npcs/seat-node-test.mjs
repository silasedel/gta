#!/usr/bin/env node
// Seat solver numbers without a browser: a person's skeleton (joint landmarks from tools/v2/npcs/out/meta/<id>.json, arms
// laid out to the canonical T-pose), the game's own clips (src/npc/arch/anim.js), seated by src/npc/seat.js on a mock
// anchor. Prints torso / head pitch, hip error, hand-to-grip and foot errors.
//   node tools/v2/npcs/seat-node-test.mjs [p07] [sedan|truck|low|conv] [driver|passenger]
import fs from 'node:fs';
import * as THREE from 'three';
import { buildClipsFor } from '../../../src/npc/arch/anim.js';
import { seatCharacter } from '../../../src/npc/seat.js';
const [id = 'p07', car = 'sedan', role = 'driver'] = process.argv.slice(2);
const meta = JSON.parse(fs.readFileSync(`tools/v2/npcs/out/meta/${id}.json`, 'utf8'));
const J = {};
for (const [n, p] of Object.entries(meta.joints)) J[n] = new THREE.Vector3(p[0], p[2], -p[1]);
// canonical arms: every arm joint on the shoulder line, straight out along +-X
for (const S of ['Left', 'Right']) {
  const sg = S === 'Left' ? 1 : -1;
  const a = J[S + 'Arm'];
  let x = Math.abs(a.x);
  for (const n of ['ForeArm', 'Hand']) {
    const len = J[S + n].distanceTo(J[S + (n === 'ForeArm' ? 'Arm' : 'ForeArm')]);
    x += len;
    J[S + n] = new THREE.Vector3(sg * x, a.y, a.z);
  }
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'])
    for (let j = 1; j <= 3; j++) {
      const k = S + 'Hand' + f + j;
      const z = { Index: 0.03, Middle: 0.01, Ring: -0.01, Pinky: -0.03, Thumb: 0.05 }[f];
      J[k] = new THREE.Vector3(
        sg * (x + (f === 'Thumb' ? 0.02 : 0.09) + j * 0.03),
        a.y - 0.005,
        a.z + z,
      );
    }
}
const PARENT = { Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck' };
for (const S of ['Left', 'Right']) {
  Object.assign(PARENT, {
    [S + 'Shoulder']: 'Spine2',
    [S + 'Arm']: S + 'Shoulder',
    [S + 'ForeArm']: S + 'Arm',
    [S + 'Hand']: S + 'ForeArm',
    [S + 'UpLeg']: 'Hips',
    [S + 'Leg']: S + 'UpLeg',
    [S + 'Foot']: S + 'Leg',
    [S + 'ToeBase']: S + 'Foot',
  });
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
    PARENT[S + 'Hand' + f + '1'] = S + 'Hand';
    PARENT[S + 'Hand' + f + '2'] = S + 'Hand' + f + '1';
    PARENT[S + 'Hand' + f + '3'] = S + 'Hand' + f + '2';
  }
}
const model = new THREE.Group();
const bones = {};
const order = ['Hips', ...Object.keys(PARENT)];
for (const n of order) {
  const b = new THREE.Bone();
  b.name = 'mixamorig' + n;
  bones[n] = b;
}
for (const n of order) {
  const p = PARENT[n];
  const b = bones[n];
  if (p) {
    bones[p].add(b);
    b.position.copy(J[n]).sub(J[p]);
  } else {
    model.add(b);
    b.position.copy(J[n]);
  }
}
model.updateMatrixWorld(true);
const sk = new THREE.Skeleton(order.map((n) => bones[n]));
sk.calculateInverses();
const sm = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
sm.bind(sk);
model.add(sm);
const clips = buildClipsFor({ root: model, bones }, J.Hips.y);
const mixer = new THREE.AnimationMixer(model);
const drive = mixer.clipAction(clips[process.env.CLIP || 'drive']);
drive.play();
const root = new THREE.Group();
const holder = new THREE.Group();
holder.add(model);
root.add(holder);
const ch = {
  root,
  getBone: (n) => bones[n],
  archetype: { height: meta.height },
  update(dt) {
    mixer.update(dt);
  },
};
const CARS = {
  sedan: {
    hip: [0.37, 0.52, -0.25],
    heel: [0.37, 0.17, 0.62],
    roofY: 1.38,
    doorX: 0.74,
    wheel: { c: [0.37, 0.88, 0.16], r: 0.19, tilt: 0.42 },
  },
  truck: {
    hip: [0.42, 1.0, 0.1],
    heel: [0.42, 0.55, 0.85],
    roofY: 1.92,
    doorX: 0.82,
    wheel: { c: [0.42, 1.37, 0.55], r: 0.2, tilt: 0.5 },
  },
  low: {
    hip: [0.38, 0.36, -0.4],
    heel: [0.38, 0.12, 0.55],
    roofY: 1.1,
    doorX: 0.72,
    wheel: { c: [0.38, 0.68, 0.05], r: 0.18, tilt: 0.55 },
  },
  sofa: {
    hip: [0, 0.54, -0.32],
    heel: [0, 0, 0.3],
    roofY: NaN,
    doorX: 3,
    wheel: { c: [0, 1, 0], r: 0.2, tilt: 0.3 },
  },
  conv: {
    hip: [0.36, 0.5, -0.3],
    heel: [0.36, 0.15, 0.55],
    roofY: 9,
    doorX: 0.74,
    wheel: { c: [0.36, 0.86, 0.12], r: 0.2, tilt: 0.35 },
  },
};
const C = CARS[car];
const shell = new THREE.Group();
shell.add(root);
const hip = new THREE.Vector3().fromArray(C.hip),
  heel = new THREE.Vector3().fromArray(C.heel);
if (role !== 'driver') {
  hip.x = -hip.x;
  heel.x = -heel.x;
}
const anchor = {
  open: car === 'sofa',
  recline: car === 'sofa' ? 20 : undefined,
  id: role === 'driver' ? 'driver' : 'front',
  i: role === 'driver' ? 0 : 1,
  yaw: 0,
  hip,
  heel,
  roofY: C.roofY,
  doorX: C.doorX,
  wheel:
    role === 'driver'
      ? { c: new THREE.Vector3().fromArray(C.wheel.c), r: C.wheel.r, tilt: C.wheel.tilt }
      : null,
};
seatCharacter(ch, anchor, { role, vehicle: { steerCur: 0 } });
for (let i = 0; i < 90; i++) ch.update(1 / 30, { driving: true });
const g = (n) => bones[n].getWorldPosition(new THREE.Vector3());
const mid = g('LeftUpLeg').add(g('RightUpLeg')).multiplyScalar(0.5);
const tor = g('Neck').sub(mid),
  hv = g('Head').sub(g('Neck'));
const crown = g('Head').add(hv.clone().normalize().multiplyScalar(0.17));
const S = ch._seat;
console.log(
  JSON.stringify({
    id,
    car,
    role,
    torsoPitch: +(Math.atan2(-tor.z, tor.y) * 57.3).toFixed(1),
    headPitch: +(Math.atan2(-hv.z, hv.y) * 57.3).toFixed(1),
    hipErr: +mid.distanceTo(hip).toFixed(3),
    crownToRoof: +(C.roofY - crown.y).toFixed(3),
    lhand: g('LeftHand')
      .toArray()
      .map((x) => +x.toFixed(2)),
    rhand: g('RightHand')
      .toArray()
      .map((x) => +x.toFixed(2)),
    lfoot: g('LeftFoot')
      .toArray()
      .map((x) => +x.toFixed(2)),
    rfoot: g('RightFoot')
      .toArray()
      .map((x) => +x.toFixed(2)),
    knee: g('LeftLeg')
      .toArray()
      .map((x) => +x.toFixed(2)),
    hipJ: g('LeftUpLeg')
      .toArray()
      .map((x) => +x.toFixed(2)),
    extra: S.extraRecline,
    reachLean: S.reachLean,
    sink: S.sink,
    chin: S.chin,
  }),
);
if (process.env.DBG)
  console.log(
    JSON.stringify({
      lsh: g('LeftArm')
        .toArray()
        .map((x) => +x.toFixed(2)),
      lel: g('LeftForeArm')
        .toArray()
        .map((x) => +x.toFixed(2)),
      arm: +(
        g('LeftArm').distanceTo(g('LeftForeArm')) + g('LeftForeArm').distanceTo(g('LeftHand'))
      ).toFixed(3),
      lshould: g('LeftShoulder')
        .toArray()
        .map((x) => +x.toFixed(2)),
      neck: g('Neck')
        .toArray()
        .map((x) => +x.toFixed(2)),
    }),
  );

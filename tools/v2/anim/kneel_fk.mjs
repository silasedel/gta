// r4-anim: FK check of a procedural clip on the X Bot canonical rig (node, no browser): prints joint world positions
// (meters, character facing +Z, left +X) at time t. Usage: node tools/v2/anim/kneel_fk.mjs [clip] [t]
import fs from 'node:fs';
import * as THREE from 'three';
import { buildProceduralClips } from '../../../src/player/proceduralClips.js';
const buf = fs.readFileSync(new URL('../../../public/assets/characters/Xbot.glb', import.meta.url));
const jlen = buf.readUInt32LE(12); const J = JSON.parse(buf.slice(20, 20 + jlen).toString());
const objs = J.nodes.map((n) => { const o = J.skins?.[0]?.joints?.includes(J.nodes.indexOf(n)) ? new THREE.Bone() : new THREE.Object3D(); o.name = (n.name || '').replace(/^mixamorig[:_]?/, '');
  if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); return o; });
J.nodes.forEach((n, i) => (n.children || []).forEach((c) => objs[i].add(objs[c])));
const root = new THREE.Group(); J.scenes[0].nodes.forEach((i) => root.add(objs[i]));
const bones = {}; objs.forEach((o) => { if (o.isBone && !bones[o.name]) bones[o.name] = o; });
const rest = {}; for (const n in bones) rest[n] = { q: bones[n].quaternion.clone(), p: bones[n].position.clone() };
const rig = { root, bones, rest };
const clips = buildProceduralClips(rig);
const name = process.argv[2] || 'kneel', t = +(process.argv[3] || 0);
const clip = clips[name]; if (!clip) { console.log('no clip', Object.keys(clips)); process.exit(1); }
const mixer = new THREE.AnimationMixer(root); const a = mixer.clipAction(clip); a.play(); mixer.setTime(t);
root.updateMatrixWorld(true);
const P = (n) => { const v = bones[n]?.getWorldPosition(new THREE.Vector3()); return v ? v.toArray().map((x) => +x.toFixed(3)) : null; };
for (const n of ['Hips', 'Spine2', 'Head', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandMiddle1', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle1']) console.log(n.padEnd(16), JSON.stringify(P(n)));
if (process.argv[4] === 'rest') for (const n of ['Hips', 'Spine', 'LeftArm', 'LeftUpLeg', 'LeftFoot']) console.log(n, rest[n].q.toArray().map((x) => +x.toFixed(3)), rest[n].p.toArray().map((x) => +x.toFixed(2)));

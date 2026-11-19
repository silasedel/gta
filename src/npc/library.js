// Body library access for the NPC track.
// The character track (src/player) owns the human library and createCharacter(). Its boot loads only a first batch
// of the bodies (40 of 129) to keep the loading screen short. "No repeating person" needs every body available, so
// this module registers the remaining bodies with the character library behind the loading screen, using the
// character track's own exported loader (loadHumanGLB) and the same preparation steps as its prepareHumanBase /
// shareClips. Everything is feature-checked: if the character track changes its internals, this quietly does nothing
// and the NPC system works with whatever bodies are loaded.
import * as THREE from 'three';
import { loadHumanManifest, loadHumanGLB } from '../player/humans.js';
import { normBone } from '../player/characterModel.js';

const UP = new THREE.Vector3(0, 1, 0);
function makeRig(scene) {
  const bones = {};
  scene.traverse((o) => {
    if (o.isBone && !bones[normBone(o.name)]) bones[normBone(o.name)] = o;
  });
  const rest = {};
  for (const n in bones) rest[n] = { q: bones[n].quaternion.clone(), p: bones[n].position.clone() };
  return { root: scene, bones, rest, restClip: null };
}
function setRest(rig) {
  for (const n in rig.bones) {
    rig.bones[n].quaternion.copy(rig.rest[n].q);
    rig.bones[n].position.copy(rig.rest[n].p);
  }
}
function facingYaw(rig) {
  const l = rig.bones.LeftUpLeg.getWorldPosition(new THREE.Vector3()),
    r = rig.bones.RightUpLeg.getWorldPosition(new THREE.Vector3());
  const left = l.sub(r);
  left.y = 0;
  left.normalize();
  const fwd = new THREE.Vector3().crossVectors(left, UP);
  return Math.atan2(fwd.x, fwd.z);
}
const ALIGN = [
  ['LeftArm', 'LeftForeArm'],
  ['LeftForeArm', 'LeftHand'],
  ['RightArm', 'RightForeArm'],
  ['RightForeArm', 'RightHand'],
  ['LeftUpLeg', 'LeftLeg'],
  ['LeftLeg', 'LeftFoot'],
  ['RightUpLeg', 'RightLeg'],
  ['RightLeg', 'RightFoot'],
  ['LeftShoulder', 'LeftArm'],
  ['RightShoulder', 'RightArm'],
];
function alignRestTo(rig, ref) {
  setRest(ref);
  ref.root.updateMatrixWorld(true);
  setRest(rig);
  rig.root.updateMatrixWorld(true);
  const C = new THREE.Quaternion().setFromAxisAngle(UP, facingYaw(rig) - facingYaw(ref));
  const order = [
    'LeftShoulder',
    'RightShoulder',
    'LeftArm',
    'RightArm',
    'LeftForeArm',
    'RightForeArm',
    'LeftUpLeg',
    'RightUpLeg',
    'LeftLeg',
    'RightLeg',
  ];
  for (const n of order) {
    const pair = ALIGN.find((p) => p[0] === n);
    const b = rig.bones[n],
      c = rig.bones[pair[1]],
      rb = ref.bones[n],
      rc = ref.bones[pair[1]];
    if (!b || !c || !rb || !rc) continue;
    const dt = c
      .getWorldPosition(new THREE.Vector3())
      .sub(b.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const dr = rc
      .getWorldPosition(new THREE.Vector3())
      .sub(rb.getWorldPosition(new THREE.Vector3()))
      .normalize()
      .applyQuaternion(C);
    if (dt.dot(dr) > 0.9995) continue;
    const R = new THREE.Quaternion().setFromUnitVectors(dt, dr);
    const w = b.getWorldQuaternion(new THREE.Quaternion());
    const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(pw.invert().multiply(R.multiply(w))).normalize();
    b.updateMatrixWorld(true);
  }
  for (const n in rig.bones)
    rig.rest[n] = { q: rig.bones[n].quaternion.clone(), p: rig.bones[n].position.clone() };
}
function prepareHumanBase(gltf, entry, LIB) {
  const scene = gltf.scene;
  const rig = makeRig(scene);
  if (!rig.bones.Hips || !rig.bones.LeftUpLeg) return null;
  alignRestTo(rig, LIB.sources.xbot);
  setRest(rig);
  scene.updateMatrixWorld(true);
  const yaw = facingYaw(rig);
  const lods = [[], [], []];
  let skin = null;
  const box = new THREE.Box3();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mm = /LOD(\d)/.exec(o.name);
    const l = mm ? +mm[1] : 0;
    lods[Math.min(2, l)].push(o.name);
    if (l === 0 && o.isSkinnedMesh) {
      o.skeleton.update();
      o.computeBoundingBox();
      const bb = o.boundingBox.clone().applyMatrix4(o.matrixWorld);
      box.union(bb);
      if (o.material?.name === 'Human.body' || o.material?.name === 'skinS') skin = bb;
    }
  });
  const headB = rig.bones.Head.getWorldPosition(new THREE.Vector3());
  const top = skin ? skin.max.y : box.max.y;
  const headTop = new THREE.Vector3(headB.x, top, headB.z + 0.01);
  return {
    kind: 'human',
    entry,
    gltf,
    scene,
    rig,
    yaw,
    height: top - box.min.y,
    minY: box.min.y,
    clips: {},
    headTop,
    lods,
  };
}
function shareClips(ref, B) {
  const r0 = ref.rig.rest.Hips.p,
    b0 = B.rig.rest.Hips.p;
  const k = (b0.y || 1) / (r0.y || 1);
  const hipsName = B.rig.bones.Hips.name + '.position';
  for (const name in ref.clips) {
    const c = ref.clips[name];
    const tracks = c.tracks.map((tr) => {
      if (tr.name !== hipsName) return tr;
      const v = tr.values.slice();
      for (let i = 0; i < v.length; i += 3) {
        v[i] = b0.x + (v[i] - r0.x) * k;
        v[i + 1] = b0.y + (v[i + 1] - r0.y) * k;
        v[i + 2] = b0.z + (v[i + 2] - r0.z) * k;
      }
      return new THREE.VectorKeyframeTrack(tr.name, tr.times, v);
    });
    const nc = new THREE.AnimationClip(c.name, c.duration, tracks);
    nc.userData = { ...c.userData, _interps: undefined };
    if (nc.userData.speed) nc.userData.speed *= k;
    B.clips[name] = nc;
  }
}
const lib = () => (typeof window !== 'undefined' ? window.__chars : null);
function compatible(LIB) {
  try {
    if (
      !LIB ||
      !(LIB.humans instanceof Map) ||
      !Array.isArray(LIB.humanEntries) ||
      !LIB.sources?.xbot?.bones?.Hips
    )
      return false;
    const ref = LIB.humanRef;
    if (
      !ref ||
      ref.kind !== 'human' ||
      !ref.rig?.bones?.Hips ||
      !ref.rig.rest?.Hips?.p ||
      !ref.clips?.walk ||
      !ref.lods ||
      !ref.headTop
    )
      return false;
    return [
      'kind',
      'entry',
      'gltf',
      'scene',
      'rig',
      'yaw',
      'height',
      'minY',
      'clips',
      'headTop',
      'lods',
    ].every((k) => k in ref);
  } catch (e) {
    return false;
  }
}
/** Register every body of the manifest with the character library. Returns { ok, loaded, total, added, ms }. */
export async function unlockAllBodies(onProgress) {
  const LIB = lib();
  const t0 = performance.now();
  if (!compatible(LIB))
    return {
      ok: false,
      loaded: LIB?.humans?.size || 0,
      total: LIB?.humanEntries?.length || 0,
      added: 0,
      ms: 0,
    };
  const todo = LIB.humanEntries.filter(
    (e) => e.id !== 'player' && e.v === 2 && !LIB.humans.has(e.id),
  );
  let added = 0;
  for (let i = 0; i < todo.length; i += 6) {
    const batch = todo.slice(i, i + 6);
    const gl = await Promise.all(batch.map((e) => loadHumanGLB(e).catch(() => null)));
    for (let k = 0; k < batch.length; k++) {
      try {
        if (!gl[k] || LIB.humans.has(batch[k].id)) continue;
        const B = prepareHumanBase(gl[k], batch[k], LIB);
        if (!B || B.rig.bones.Hips.name !== LIB.humanRef.rig.bones.Hips.name) continue;
        shareClips(LIB.humanRef, B);
        LIB.humans.set(batch[k].id, B);
        added++;
      } catch (e) {
        console.warn('[npc] body', batch[k].id, e);
      }
    }
    onProgress?.(LIB.humans.size, LIB.humanEntries.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return {
    ok: true,
    loaded: LIB.humans.size,
    total: LIB.humanEntries.length,
    added,
    ms: Math.round(performance.now() - t0),
  };
}
/** Manifest entries of every body that can be instantiated right now (excluding the player and police bodies). */
export function loadedBodies() {
  const LIB = lib();
  if (LIB?.humans instanceof Map)
    return [...LIB.humans.values()]
      .map((b) => b.entry)
      .filter((e) => e && e.id !== 'player' && e.zone !== 'cop' && e.zone !== 'player');
  return [];
}
export async function allBodies() {
  const m = await loadHumanManifest();
  return (m.people || []).filter(
    (e) => e.id !== 'player' && e.zone !== 'cop' && e.zone !== 'player',
  );
}
export const allBodyIds = () => {
  const LIB = lib();
  return LIB?.humans instanceof Map ? [...LIB.humans.keys()] : [];
};

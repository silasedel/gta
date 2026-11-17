// Southline — character models + animation system (CHARACTER agent)
// Realistic rigged humans (Ready Player Me sample avatar + Mixamo "Michelle") driven by
// Mixamo clips (Soldier / X Bot) retargeted at load time with a world-space-delta retargeter,
// plus procedurally authored clips (jump, fall, punch L/R, driving sit, two death falls).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildProceduralClips } from './proceduralClips.js';
import { addHairShell, makeHairMaterial } from './hairShell.js';
import { loadHumanManifest, loadHumanGLB, makeSkinMat, makeHairMat, makeGarmentMat, makeTexturedMat, makeAtlasSkinMat, makeAtlasMat } from './humans.js';
import { PERSONAS } from '../npc/personality.js';
import { preloadNico, decorateNico } from './nico/index.js';
import { NICO_MODEL, preloadNicoTripo, decorateNicoTripo } from './nicoTripo/index.js';
import { rng, pick, SKIN_TONES, HAIR, genOutfit, makeHeadAccessories, makePhone, attachToBone, makeCopCap, makeDutyBelt, makeCase, makeSunglasses } from './pedStyle.js';
import { makeTopMaterial, makeRecolorMaterial, makeSkinMaterial, makeMichelleVariantMap, limbIndices } from './characterMaterials.js';

const BASE = '/assets/characters/';
let LIB = null;
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export const normBone = (n) => n.replace(/^mixamorig[:_]?/, '');

function makeRig(scene, restClip = null) {
  const bones = {};
  scene.traverse((o) => { if (o.isBone && !bones[normBone(o.name)]) bones[normBone(o.name)] = o; });
  const rest = {};
  for (const n in bones) rest[n] = { q: bones[n].quaternion.clone(), p: bones[n].position.clone() };
  const rig = { root: scene, bones, rest, restClip };
  if (restClip) { // bake the rest clip's first frame into "rest"
    applyClip(rig, restClip, 0);
    for (const n in bones) rest[n] = { q: bones[n].quaternion.clone(), p: bones[n].position.clone() };
  }
  return rig;
}
function setRest(rig) { for (const n in rig.bones) { rig.bones[n].quaternion.copy(rig.rest[n].q); rig.bones[n].position.copy(rig.rest[n].p); } }
function clipInterps(clip) {
  if (!clip.userData) clip.userData = {};
  if (!clip.userData._interps) clip.userData._interps = clip.tracks.map((tr) => {
    const dot = tr.name.lastIndexOf('.');
    return { node: normBone(tr.name.slice(0, dot)), prop: tr.name.slice(dot + 1), interp: tr.createInterpolant() };
  });
  return clip.userData._interps;
}
function applyClip(rig, clip, t) {
  for (const it of clipInterps(clip)) {
    const b = rig.bones[it.node]; if (!b) continue;
    if (it.prop === 'quaternion') b.quaternion.fromArray(it.interp.evaluate(t)).normalize();
    else if (it.prop === 'position' && it.node === 'Hips') b.position.fromArray(it.interp.evaluate(t));
  }
}
function facingYaw(rig) {
  const l = rig.bones.LeftUpLeg.getWorldPosition(new THREE.Vector3());
  const r = rig.bones.RightUpLeg.getWorldPosition(new THREE.Vector3());
  const left = l.sub(r); left.y = 0; left.normalize();
  const fwd = new THREE.Vector3().crossVectors(left, UP);
  return Math.atan2(fwd.x, fwd.z);
}
function boneOrder(rig) {
  const out = [];
  const walk = (b) => { if (b.isBone) { out.push(b); b.children.forEach(walk); } };
  walk(rig.bones.Hips);
  return out;
}

// Rotate limb bones so the rig's rest pose matches the reference rig's T-pose (A-pose -> T-pose fix)
const ALIGN = [['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'],
  ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'],
  ['LeftShoulder', 'LeftArm'], ['RightShoulder', 'RightArm']];
function alignRestTo(rig, ref) {
  setRest(ref); ref.root.updateMatrixWorld(true);
  setRest(rig); rig.root.updateMatrixWorld(true);
  const C = new THREE.Quaternion().setFromAxisAngle(UP, facingYaw(rig) - facingYaw(ref));
  const order = ['LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
  for (const n of order) {
    const pair = ALIGN.find((p) => p[0] === n); const b = rig.bones[n], c = rig.bones[pair[1]], rb = ref.bones[n], rc = ref.bones[pair[1]];
    if (!b || !c || !rb || !rc) continue;
    const dt = c.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
    const dr = rc.getWorldPosition(new THREE.Vector3()).sub(rb.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(C);
    if (dt.dot(dr) > 0.9995) continue;
    const R = new THREE.Quaternion().setFromUnitVectors(dt, dr);
    const w = b.getWorldQuaternion(new THREE.Quaternion());
    const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(pw.invert().multiply(R.multiply(w))).normalize();
    b.updateMatrixWorld(true);
  }
  for (const n in rig.bones) rig.rest[n] = { q: rig.bones[n].quaternion.clone(), p: rig.bones[n].position.clone() };
}

// World-space delta retarget: target_world = C * src_world(t) * src_rest^-1 * C^-1 * tgt_rest
function retarget(src, clip, tgt, opts = {}) {
  const fps = opts.fps || 30;
  setRest(src); src.root.updateMatrixWorld(true);
  const sRest = {}; for (const n in src.bones) sRest[n] = src.bones[n].getWorldQuaternion(new THREE.Quaternion()).invert();
  const sHip0 = src.bones.Hips.getWorldPosition(new THREE.Vector3());
  const sYaw = facingYaw(src);
  setRest(tgt); tgt.root.updateMatrixWorld(true);
  const tRest = {}; for (const n in tgt.bones) tRest[n] = tgt.bones[n].getWorldQuaternion(new THREE.Quaternion());
  const tHip0 = tgt.bones.Hips.getWorldPosition(new THREE.Vector3());
  const tYaw = facingYaw(tgt);
  const hipParentQ = tgt.bones.Hips.parent.getWorldQuaternion(new THREE.Quaternion());
  const hipParentInv = new THREE.Matrix4().copy(tgt.bones.Hips.parent.matrixWorld).invert();
  const C = new THREE.Quaternion().setFromAxisAngle(UP, tYaw - sYaw), Ci = C.clone().invert();
  const ratio = tHip0.y / sHip0.y;
  const fwd = new THREE.Vector3(Math.sin(tYaw), 0, Math.cos(tYaw));
  const order = boneOrder(tgt);
  const N = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(N);
  const qData = order.map(() => new Float32Array(N * 4));
  const hipW = [];
  const feet = { L: [], R: [] };
  const world = new Map();
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * clip.duration; times[i] = t;
    setRest(src); applyClip(src, clip, t); src.root.updateMatrixWorld(true);
    world.clear();
    order.forEach((b, bi) => {
      const n = normBone(b.name);
      const parentW = b === tgt.bones.Hips ? hipParentQ : (world.get(b.parent) || hipParentQ);
      const w = new THREE.Quaternion();
      const sb = src.bones[n];
      if (sb && (!opts.skip || !opts.skip(n))) {
        sb.getWorldQuaternion(_q1);
        w.copy(C).multiply(_q1).multiply(sRest[n]).multiply(Ci).multiply(tRest[n]);
      } else {
        w.copy(parentW).multiply(tgt.rest[n].q);
      }
      world.set(b, w);
      _q2.copy(parentW).invert().multiply(w).normalize();
      _q2.toArray(qData[bi], i * 4);
    });
    const d = src.bones.Hips.getWorldPosition(_v1).sub(sHip0).applyQuaternion(C).multiplyScalar(ratio);
    hipW.push(d.clone());
    for (const s of ['L', 'R']) {
      const fb = src.bones[s === 'L' ? 'LeftFoot' : 'RightFoot'];
      if (!fb) continue;
      const fp = fb.getWorldPosition(_v2).sub(src.bones.Hips.getWorldPosition(new THREE.Vector3())).applyQuaternion(C).multiplyScalar(ratio);
      feet[s].push({ z: fp.dot(fwd), y: fb.getWorldPosition(new THREE.Vector3()).y * ratio });
    }
  }
  // remove horizontal drift (in-place locomotion)
  if (opts.inPlace) {
    const a = hipW[0], b = hipW[N - 1];
    hipW.forEach((d, i) => { const k = i / (N - 1); d.x -= a.x + (b.x - a.x) * k; d.z -= a.z + (b.z - a.z) * k; });
  }
  const tracks = [];
  order.forEach((b, bi) => {
    const n = normBone(b.name);
    if (opts.filter && !opts.filter(n)) return;
    tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, qData[bi]));
  });
  if (!opts.filter || opts.filter('Hips')) {
    const pd = new Float32Array(N * 3);
    hipW.forEach((d, i) => { _v1.copy(tHip0).add(d).applyMatrix4(hipParentInv).toArray(pd, i * 3); });
    tracks.push(new THREE.VectorKeyframeTrack(tgt.bones.Hips.name + '.position', times, pd));
  }
  const out = new THREE.AnimationClip(opts.name || clip.name, clip.duration, tracks);
  out.userData = out.userData || {};
  // gait analysis: stance-foot backward speed (m/s) and phase of left-foot-forward
  if (opts.gait && feet.L.length) {
    const dt = clip.duration / (N - 1);
    const vs = [];
    for (const s of ['L', 'R']) {
      const f = feet[s]; const minY = Math.min(...f.map((p) => p.y));
      for (let i = 0; i < N - 1; i++) if (f[i].y < minY + 0.035) { const v = -(f[i + 1].z - f[i].z) / dt; if (v > 0) vs.push(v); }
    }
    vs.sort((x, y) => x - y);
    out.userData.speed = vs.length ? vs[Math.floor(vs.length / 2)] : 1.5;
    let bi = 0; feet.L.forEach((p, i) => { if (p.z > feet.L[bi].z) bi = i; });
    out.userData.phase = bi / (N - 1);
  }
  setRest(src); setRest(tgt);
  src.root.updateMatrixWorld(true); tgt.root.updateMatrixWorld(true);
  return out;
}

// Stance-foot speed measured on the TARGET rig (the retarget estimate scales the source rig's stride by hip height
// only; a body with other leg proportions then slides its planted feet). Samples the in-place clip on the rig and
// takes the median backward speed of whichever foot is down. Sets clip.userData.speed (used for gait playback rate).
function measureGait(rig, clip, N = 90) {
  const L = rig.bones.LeftFoot, R = rig.bones.RightFoot; if (!L || !R) return;
  const yaw = (setRest(rig), rig.root.updateMatrixWorld(true), facingYaw(rig)), fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const P = { L: [], R: [] }, v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const t = (i / N) * clip.duration;
    setRest(rig); applyClip(rig, clip, t); rig.root.updateMatrixWorld(true);
    for (const [k, b] of [['L', L], ['R', R]]) { b.getWorldPosition(v); P[k].push({ z: v.dot(fwd), y: v.y }); }
  }
  setRest(rig); rig.root.updateMatrixWorld(true);
  const dt = clip.duration / N, vs = [];
  for (const k of ['L', 'R']) {
    const f = P[k], minY = Math.min(...f.map((p) => p.y));
    for (let i = 0; i < N; i++) { const a = f[i], b = f[(i + 1) % N]; if (a.y < minY + 0.03 && b.y < minY + 0.03) { const s = -(b.z - a.z) / dt; if (s > 0) vs.push(s); } }
  }
  if (vs.length < 4) return;
  vs.sort((x, y) => x - y);
  const m = vs[Math.floor(vs.length / 2)];
  if (m > 0.3 && m < 12) { clip.userData.speedRetarget = clip.userData.speed; clip.userData.speed = m; }
}

const UPPER = new Set(['Spine', 'Spine1', 'Spine2', 'Neck', 'Head']);
function isUpperBody(n) { return UPPER.has(n) || /Shoulder|Arm|Hand/.test(n); }

async function loadAll() {
  const loader = new GLTFLoader();
  const load = (f) => loader.loadAsync(BASE + f).catch((e) => { console.warn('[characters] failed', f, e); return null; });
  const [soldier, xbot, michelle, rpm] = await Promise.all(['Soldier.glb', 'Xbot.glb', 'Michelle.glb', 'readyplayer.me.glb'].map(load));
  return { soldier, xbot, michelle, rpm };
}

function prepareBase(gltf, restClipName, kind, ref) {
  const scene = gltf.scene;
  const restClip = restClipName ? gltf.animations.find((c) => c.name === restClipName) : null;
  const rig = makeRig(scene, restClip);
  if (ref) alignRestTo(rig, ref);
  if (kind === 'male') {
    const head = scene.getObjectByName('Wolf3D_Head');
    try { if (head && head.isSkinnedMesh) addHairShell(head); } catch (e) { console.warn('[characters] hair shell failed', e); }
  }
  setRest(rig); scene.updateMatrixWorld(true);
  const yaw = facingYaw(rig);
  // bounds in rest pose (bind geometry)
  const box = new THREE.Box3();
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible || /Headwear/.test(o.material?.name || '')) return;
    if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    else { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
  });
  let headTop = null;
  const headMesh = scene.getObjectByName('Wolf3D_Head');
  if (headMesh?.geometry) { headMesh.geometry.computeBoundingBox(); const hb = headMesh.geometry.boundingBox; headTop = new THREE.Vector3((hb.min.x + hb.max.x) / 2, hb.max.y, (hb.min.z + hb.max.z) / 2).applyMatrix4(headMesh.matrixWorld); }
  return { kind, gltf, scene, rig, yaw, height: box.max.y - box.min.y, minY: box.min.y, clips: {}, headTop };
}

const STY = ['phone', 'talk', 'film', 'cower', 'lie', 'sitGround', 'sitBench', 'lean', 'dance', 'kneel', 'volley', 'swim'];
const _qa = new THREE.Quaternion();
const GETUPS = ['getUpBack', 'getUpFwd'], DEADS = ['deadBack', 'deadFwd'], PUNCHES = ['punchR', 'punchL'];
const FULL_STYLES = new Set(['cower', 'lie', 'sitGround', 'sitBench', 'lean', 'dance', 'kneel', 'volley', 'swim']);
const findClip = (gl, name) => gl?.animations.find((c) => c.name.toLowerCase() === name.toLowerCase());
function buildClipsFor(B, g, sources, procClips) {
  const tgt = B.rig; const C = B.clips;
  const rt = (srcName, gl, clipName, name, o = {}) => {
    const src = sources[srcName]; const clip = findClip(gl, clipName);
    if (!src || !clip) return;
    try { C[name] = retarget(src, clip, tgt, { name, ...o }); } catch (e) { console.warn('[characters] retarget failed', name, e); }
  };
  rt('xbot', g.xbot, 'idle', 'idle', {});
  rt('soldier', g.soldier, 'Idle', 'idle2', {});
  rt('soldier', g.soldier, 'Walk', 'walk', { inPlace: true, gait: true });
  rt('xbot', g.xbot, 'walk', 'walk2', { inPlace: true, gait: true });
  rt('xbot', g.xbot, 'run', 'run', { inPlace: true, gait: true });
  rt('soldier', g.soldier, 'Run', 'sprint', { inPlace: true, gait: true });
  if (sources.xbot) for (const name in procClips) {
    const pc = procClips[name];
    try { C[name] = retarget(sources.xbot, pc, tgt, { name, filter: pc.userData?.upperOnly ? isUpperBody : null }); } catch (e) { console.warn('[characters] proc retarget failed', name, e); }
  }
  if (!C.idle && C.idle2) C.idle = C.idle2;
  if (!C.walk && C.walk2) C.walk = C.walk2;
  if (!C.sprint && C.run) C.sprint = C.run;
}

// ---------- MPFB human library ----------
function prepareHumanBase(gltf, entry) {
  const scene = gltf.scene;
  const rig = makeRig(scene, null);
  if (!rig.bones.Hips || !rig.bones.LeftUpLeg) return null;
  alignRestTo(rig, LIB.sources.xbot);
  setRest(rig); scene.updateMatrixWorld(true);
  const yaw = facingYaw(rig);
  const lods = [[], [], []];
  let skin = null;
  const box = new THREE.Box3();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mm = /LOD(\d)/.exec(o.name); const l = mm ? +mm[1] : 0;
    lods[Math.min(2, l)].push(o.name);
    if (l === 0 && o.isSkinnedMesh) {
      o.skeleton.update(); o.computeBoundingBox();
      const bb = o.boundingBox.clone().applyMatrix4(o.matrixWorld);
      box.union(bb);
      if (o.material?.name === 'Human.body' || o.material?.name === 'skinS') skin = bb;
    }
  });
  const headB = rig.bones.Head.getWorldPosition(new THREE.Vector3());
  const top = skin ? skin.max.y : box.max.y;
  const headTop = new THREE.Vector3(headB.x, top, headB.z + 0.01);
  return { kind: 'human', entry, gltf, scene, rig, yaw, height: top - box.min.y, minY: box.min.y, clips: {}, headTop, lods };
}
function shareClips(ref, B) {
  const r0 = ref.rig.rest.Hips.p, b0 = B.rig.rest.Hips.p;
  const k = (b0.y || 1) / (r0.y || 1);
  const hipsName = B.rig.bones.Hips.name + '.position';
  for (const name in ref.clips) {
    const c = ref.clips[name];
    const tracks = c.tracks.map((tr) => {
      if (tr.name !== hipsName) return tr;
      const v = tr.values.slice();
      for (let i = 0; i < v.length; i += 3) { v[i] = b0.x + (v[i] - r0.x) * k; v[i + 1] = b0.y + (v[i + 1] - r0.y) * k; v[i + 2] = b0.z + (v[i + 2] - r0.z) * k; }
      return new THREE.VectorKeyframeTrack(tr.name, tr.times, v);
    });
    const nc = new THREE.AnimationClip(c.name, c.duration, tracks);
    nc.userData = { ...c.userData, _interps: undefined };
    if (nc.userData.speed) nc.userData.speed *= k;
    B.clips[name] = nc;
  }
}
async function ensureHuman(entry) {
  if (LIB.humans.has(entry.id)) return LIB.humans.get(entry.id);
  const gltf = await loadHumanGLB(entry);
  if (!gltf) return null;
  const B = prepareHumanBase(gltf, entry);
  if (!B) return null;
  // all MPFB people share one skeleton layout: retarget once (reference person), then share the rotation
  // tracks and only rescale the hips translation per person -> ~1 ms instead of ~150 ms per person
  const ref = LIB.humanRef;
  if (ref && ref.rig.bones.Hips.name === B.rig.bones.Hips.name) shareClips(ref, B);
  else { buildClipsFor(B, LIB.srcG, LIB.sources, LIB.procClips); if (!LIB.humanRef) LIB.humanRef = B; }
  LIB.humans.set(entry.id, B);
  if (LIB.game) warmHumanBase(LIB.game, B);
  return B;
}
// GPU warm-up: draw every LOD of a freshly loaded body (with the runtime materials) a few times, far below the
// world with culling off, so geometry upload + main/shadow shader variants happen at load time and runtime LOD
// switches never upload or compile. At boot this runs inside main.js' warm-up frames behind the loading screen.
let _warmGroup = null;
function warmHumanBase(game, B) {
  const scene = game?.scene; if (!scene || !B?.scene) return;
  if (!_warmGroup) { _warmGroup = new THREE.Group(); _warmGroup.name = 'humanWarmup'; _warmGroup.position.set(0, -5000, 0); scene.add(_warmGroup); }
  B.shared ||= {};
  const skin = B.shared.skinS ||= makeAtlasSkinMat();
  const atl = LIB.warmAtlas ||= makeAtlasMat([]);
  const saved = [];
  B.scene.traverse((o) => {
    if (!o.isMesh) return;
    saved.push([o, o.material, o.visible, o.frustumCulled, o.castShadow]);
    const nm = o.material?.name;
    if (nm === 'skinS') o.material = skin; else if (nm === 'atlasC') o.material = atl;
    o.visible = true; o.frustumCulled = false; o.castShadow = true;
  });
  const first = saved[0]?.[0]; if (!first) return;
  let n = 0;
  B.warming = true;
  first.onBeforeRender = () => {
    if (++n !== 6) return;
    setTimeout(() => {
      for (const [o, m, v, f, c] of saved) { o.material = m; o.visible = v; o.frustumCulled = f; o.castShadow = c; }
      first.onBeforeRender = () => {};
      _warmGroup.remove(B.scene); B.warming = false;
      B.scene.traverse((o) => { if (o.isSkinnedMesh) { try { o.skeleton.dispose(); } catch (e) { /* ignore */ } } });
      if (!_warmGroup.children.length) { scene.remove(_warmGroup); _warmGroup = null; }
    }, 0);
  };
  _warmGroup.add(B.scene);
}
const INITIAL_HUMANS = 40;
async function initHumans() {
  const man = await loadHumanManifest();
  const people = man.people || [];
  LIB.humanEntries = people;
  if (!people.length || !LIB.sources.xbot) return;
  const t0 = performance.now();
  // initial set: the player + a spread of every zone, rest streams in the background
  const byZone = {};
  for (const p of people) if (p.id !== 'player') (byZone[p.zone] ||= []).push(p);
  const first = [people.find((p) => p.id === 'player')].filter(Boolean);
  const zones = Object.keys(byZone);
  for (let i = 0; first.length < INITIAL_HUMANS; i++) {
    let added = false;
    for (const z of zones) { const e = byZone[z][i]; if (e && first.length < INITIAL_HUMANS) { first.push(e); added = true; } }
    if (!added) break;
  }
  if (first[0]) await ensureHuman(first[0]).catch(() => null); // the reference skeleton (player) first
  await Promise.all(first.slice(1).map((e) => ensureHuman(e).catch(() => null)));
  console.log('[humans] initial', LIB.humans.size, 'people in', Math.round(performance.now() - t0), 'ms');
  // no background streaming: every GLB parse + skeleton setup is a long main-thread task (stutter in play).
  // The crowd uses the INITIAL_HUMANS people loaded behind the loading screen (+ per-instance colour variation).
}
const ZONE_POOLS = {
  beach: ['beach', 'beach', 'beach', 'casual', 'sport'], business: ['business', 'business', 'casual'], downtown: ['business', 'casual'], night: ['nightlife', 'casual'], nightlife: ['nightlife', 'casual'],
  port: ['port'], industrial: ['port', 'casual'], sport: ['sport'], park: ['sport', 'casual'], casual: ['casual', 'casual', 'sport'], residential: ['casual', 'casual', 'sport'],
  commercial: ['casual', 'business'], causeway: ['sport', 'casual'], cop: ['cop'],
};
export function humansLoaded() { return LIB?.humans?.size || 0; }
export function humansTotal() { return LIB?.humanEntries?.length || 0; }
export function zonePool(zone) { return ZONE_POOLS[zone] || ZONE_POOLS.casual; }
function pickHuman(variant, seed, opts) {
  if (!LIB.humans || !LIB.humans.size) return null;
  if (variant === 'player') return LIB.humans.get('player') || null;
  const r = rng(seed * 11 + 1);
  const want = zonePool(opts.outfit || opts.zone || (opts.beach ? 'beach' : 'casual'));
  const zsel = want[Math.floor(r() * want.length)];
  const pool = [...LIB.humans.values()].filter((b) => b.entry.id !== 'player');
  let cands = pool.filter((b) => b.entry.zone === zsel);
  if (opts.outfit === 'cop' || opts.zone === 'cop') { const cc = pool.filter((b) => b.entry.zone === 'cop'); if (cc.length) cands = cc; }
  if (!cands.length) cands = pool.filter((b) => want.includes(b.entry.zone));
  if (!cands.length) cands = pool;
  const g = opts.gender ? (String(opts.gender)[0] === 'f' ? 'f' : 'm') : null;
  if (g) {
    let gc = cands.filter((b) => b.entry.gender === g);
    if (!gc.length) gc = pool.filter((b) => b.entry.gender === g && want.includes(b.entry.zone));
    if (!gc.length) gc = pool.filter((b) => b.entry.gender === g);
    if (gc.length) cands = gc;
  }
  if (opts.exclude && opts.exclude.size) {
    const okG = (b) => !g || b.entry.gender === g;
    let ex = cands.filter((b) => !opts.exclude.has(b.entry.id));
    if (!ex.length) ex = pool.filter((b) => want.includes(b.entry.zone) && okG(b) && !opts.exclude.has(b.entry.id));
    if (!ex.length && opts.outfit !== 'business' && opts.outfit !== 'beach') ex = pool.filter((b) => (b.entry.zone === 'casual' || b.entry.zone === 'sport') && okG(b) && !opts.exclude.has(b.entry.id));
    if (ex.length) cands = ex;
  }
  // avoid duplicates of the same person close together: rotate by seed
  return cands[Math.floor(r() * cands.length) % cands.length];
}
const HAIR_NATURAL = { dark: [0x120d0a, 0x1d140e, 0x2a1d14, 0x0c0a09], brown: [0x3d2a1a, 0x4f3622, 0x5a4029], fair: [0x8a6a3e, 0xa88a58, 0x7a5a36, 0x9b5a2e], grey: [0x8f8a80, 0xb5b0a6, 0x6e6a64] };
const G_BRIGHT = [0xe07f68, 0x2f8a86, 0xe6b3b5, 0xa6d3bf, 0x9cc1de, 0xe8d78a, 0xb8a8d2, 0x5fb3b8, 0xe89a85, 0xb5443e, 0xc9a043, 0x2a6fb5, 0xf0ede6];
const G_NEUTRAL = [0xf0ede6, 0xe9e1cf, 0xd6c4a0, 0x2a3442, 0x5a6450, 0x3a3a3c, 0xb5a385, 0x1f1f21, 0x8e9094, 0xa95d3d, 0x6b7a8f];
const G_SHORTS = [0xb5a385, 0x5d7598, 0x1f2a3c, 0x5a6450, 0x2a3442, 0x1f1f21, 0xd6c4a0, 0xf0ede6, 0x8e9094];
function humanGarment(kind, r, zone) {
  const p = (a) => a[Math.floor(r() * a.length) % a.length];
  if (zone === 'cop' || kind === 'copshirt' || kind === 'coptrousers') return { c: kind === 'coptrousers' || kind === 'shorts' || kind === 'trousers' ? 0x151c2c : 0x1d2a45, pat: 0 };
  if (/bikini|briefs|trunks|boardshorts/.test(kind)) { const c = p(G_BRIGHT.concat([0x1f1f21, 0x2a3442])); return { c, pat: r() < 0.35 ? (r() < 0.5 ? 1 : 2) : 0, c2: p([0xf0ede6, 0x1f1f21, 0xe8d78a, 0x2f8a86]) }; }
  if (kind === 'shorts') return { c: p(G_SHORTS), pat: 0 };
  if (zone === 'nightlife' || zone === 'night') return { c: p([0x1f1f21, 0x3a3a3c, 0x5a1f2e, 0x2a3442, 0xf0ede6, 0x3b2a4a]), pat: 0 };
  return { c: r() < 0.5 ? p(G_BRIGHT) : p(G_NEUTRAL), pat: r() < 0.18 ? 1 : 0, c2: p([0xf0ede6, 0x2a3442, 0x1f1f21]) };
}
// player outfit (v2 model): plain teal short-sleeve button-up (slot 3), denim jeans (slot 4), off-white buttons (slot 5)
const PLAYER_PAL = { shirt: 0x2aa9a6, jeans: 0x2f4a6e, buttons: 0xe9e6dc };
function humanMaterials(base, seed, zone, variant) {
  const e = base.entry; const r = rng(seed * 5 + 9);
  if (e.v === 2) {
    const years = e.years || 30;
    const hairSet = years > 58 && r() < 0.7 ? HAIR_NATURAL.grey : (e.race === 'white' && r() < 0.45) ? (r() < 0.5 ? HAIR_NATURAL.fair : HAIR_NATURAL.brown) : r() < 0.7 ? HAIR_NATURAL.dark : HAIR_NATURAL.brown;
    const hairC = variant === 'player' ? 0x15100c : hairSet[Math.floor(r() * hairSet.length)];
    const pal = []; pal[2] = hairC;
    const garments = {};
    for (const g of e.garments || []) {
      const c = g.kind === 'vest' ? { c: 0xc8f020, pat: 0 } : humanGarment(g.kind, r, zone);
      if (pal[g.slot] === undefined) pal[g.slot] = c.c;
      garments[g.slot] = g.kind;
    }
    if (variant === 'player') { pal[3] = PLAYER_PAL.shirt; pal[4] = PLAYER_PAL.jeans; pal[5] = PLAYER_PAL.buttons; } // fixed outfit
    base.shared ||= {};
    const skin = base.shared.skinS ||= makeAtlasSkinMat();
    const atlas = makeAtlasMat(pal);
    return { mats: { skinS: skin, atlasC: atlas }, garments: { __v2: atlas, slots: garments, fixed: variant === 'player' }, hairC };
  }
  base.shared ||= {};
  const out = {}; const garments = {};
  const years = e.years || 30;
  const hairSet = years > 58 && r() < 0.7 ? HAIR_NATURAL.grey : (e.race === 'white' && r() < 0.45) ? (r() < 0.5 ? HAIR_NATURAL.fair : HAIR_NATURAL.brown) : r() < 0.7 ? HAIR_NATURAL.dark : HAIR_NATURAL.brown;
  const hairC = variant === 'player' ? 0x15100c : hairSet[Math.floor(r() * hairSet.length)];
  for (const [name, em] of Object.entries(e.materials || {})) {
    if (em.k === 'skin') out[name] = base.shared[name] ||= makeSkinMat(em);
    else if (em.k === 'hair') out[name] = makeHairMat(em, hairC);
    else if (em.k === 'brow') { const m = makeTexturedMat(em, 'brow'); m.color.setHex(hairC).multiplyScalar(1.6).addScalar(0.15); out[name] = m; }
    else if (em.k === 'garment') { const kind = name.replace('garment_', ''); const g = humanGarment(kind, r, zone); out[name] = garments[kind] = makeGarmentMat(kind, g.c, g.pat, g.c2); }
    else out[name] = base.shared[name] ||= makeTexturedMat(em, em.k);
  }
  return { mats: out, garments, hairC };
}
function restyleHuman(garments, seed, zone) {
  const r = rng(seed * 29 + zone.length * 7);
  if (garments.__v2) {
    if (garments.fixed) return;
    const pal = garments.__v2.userData.pal.value;
    for (const slot in garments.slots) { const k = garments.slots[slot]; if (k === 'vest') continue; pal[+slot].setHex((zone === 'cop' ? { c: 0x1c2a44 } : humanGarment(k, r, zone)).c); }
    return;
  }
  for (const kind in garments) {
    const g = humanGarment(kind, r, zone); const m = garments[kind];
    m.color.setHex(g.c); m.userData.g.pat.value = g.pat; if (g.c2 !== undefined) m.userData.g.c2.value.setHex(g.c2);
  }
}

export async function preloadCharacters(game) {
  if (LIB) return LIB;
  const g = await loadAll();
  if (!g.rpm && !g.michelle) { LIB = { failed: true }; return LIB; }
  const sources = {};
  if (g.soldier) sources.soldier = makeRig(g.soldier.scene, g.soldier.animations.find((c) => c.name === 'TPose'));
  if (g.xbot) sources.xbot = makeRig(g.xbot.scene, null);
  if (sources.soldier && sources.xbot) alignRestTo(sources.soldier, sources.xbot);
  const procClips = sources.xbot ? buildProceduralClips(sources.xbot) : {};
  const bases = {};
  if (g.rpm) bases.male = prepareBase(g.rpm, null, 'male', sources.xbot);
  if (g.michelle) bases.female = prepareBase(g.michelle, 'TPose', 'female', sources.xbot);
  for (const key in bases) buildClipsFor(bases[key], g, sources, procClips);
  LIB = { bases, sources, procClips, srcG: g, matCache: new Map(), humans: new Map(), humanEntries: [], game };
  if (typeof window !== 'undefined') window.__chars = LIB;
  try { await initHumans(); } catch (e) { console.warn('[humans] init failed', e); }
  // Nico = the user's own main-character model (src/player/nicoTripo, tools/v2/player/build.sh). ?nico=old (or a load
  // failure) falls back to the pipeline Nico below; any failure there keeps the v1 player model.
  if (NICO_MODEL === 'tripo') try {
    const A = await preloadNicoTripo();
    const scene = A.gltf.scene; const rig = makeRig(scene, null);
    if (rig.bones.Hips && sources.xbot) {
      alignRestTo(rig, sources.xbot); setRest(rig); scene.updateMatrixWorld(true);
      const B = { kind: 'nico', tripo: true, assets: A, scene, rig, yaw: facingYaw(rig), height: A.meta.height, targetH: A.meta.height, minY: 0, clips: {}, headTop: null };
      buildClipsFor(B, g, sources, procClips);
      try { for (const n of ['walk', 'walk2', 'run', 'sprint']) if (B.clips[n]) measureGait(rig, B.clips[n]); } catch (e) { console.warn('[nico] gait measure', e); }
      if (B.clips.idle && B.clips.walk) LIB.nico = B;
    }
  } catch (e) { console.warn('[nico] user model unavailable, using the pipeline Nico', e); }
  if (!LIB.nico) try {
    const A = await preloadNico();
    const scene = A.gltf.scene; const rig = makeRig(scene, null);
    if (rig.bones.Hips && sources.xbot) {
      alignRestTo(rig, sources.xbot); setRest(rig); scene.updateMatrixWorld(true);
      const B = { kind: 'nico', assets: A, scene, rig, yaw: facingYaw(rig), height: A.meta.height, minY: 0, clips: {}, headTop: null };
      buildClipsFor(B, g, sources, procClips);
      if (B.clips.idle && B.clips.walk) LIB.nico = B;
    }
  } catch (e) { console.warn('[nico] unavailable, using the v1 player', e); }
  console.log('[characters] ready', Object.fromEntries(Object.entries(bases).map(([k, b]) => [k, Object.fromEntries(Object.entries(b.clips).map(([n, c]) => [n, c.userData.speed ? +c.userData.speed.toFixed(2) : +c.duration.toFixed(2)]))])));
  return LIB;
}

// ---------- seeded variation (palettes in pedStyle.js) ----------
function getMaterials(base, variant, seed) {
  const cache = LIB.matCache;
  const r = rng(seed + 17);
  if (base.kind === 'female') {
    const vi = 1 + Math.floor(r() * 10);
    const key = 'f' + vi;
    if (!cache.has(key)) {
      const src = base.scene.getObjectByProperty('isMesh', true).material;
      const m = src.clone();
      if (vi > 0) m.map = makeMichelleVariantMap(src.map, vi);
      m.roughness = 0.8; m.metalness = 0;
      cache.set(key, { '*': m });
    }
    return cache.get(key);
  }
  if (variant === 'player') {
    const key = 'player';
    if (!cache.has(key)) cache.set(key, buildMaleSet(base, { player: true, skin: [0.9, 0.77, 0.66], hair: 0x15100c, hairStyle: 1, beard: false, stubble: 1,
      shirt: 0x1f8c8c /* teal overshirt */, shirt2: 0x34363a /* charcoal crew-neck tee */, open: true, sleeve: 0, cuff: 0, pants: 0x1d2533, shoes: 0x3b2c22 }));
    return cache.get(key);
  }
  const zone = opts_beach(seed) || 'residential';
  const opt = Object.assign({ skin: pick(r, SKIN_TONES), hair: pick(r, HAIR), hairStyle: r() < 0.85 ? 1 : 0, beard: r() < 0.3, stubble: r() < 0.5 ? 0.8 : 0 }, genOutfit(r, zone));
  return buildMaleSet(base, opt); // unique per ped (uniform-only differences, shaders shared)
}
const _beachSeeds = new Map();
const opts_beach = (seed) => _beachSeeds.get(seed);

function buildMaleSet(base, o) {
  const set = {};
  o.hemY = base.rig.bones.Hips.getWorldPosition(new THREE.Vector3()).y - 0.09;
  base.scene.traverse((m) => {
    if (!m.isMesh) return;
    const mat = m.material; const n = mat.name || '';
    if (n === 'CharHair') set[n] = o.hairStyle ? makeHairMaterial(o.hair) : null;
    else if (/Headwear/.test(n)) set[n] = null; // hide the hat
    else if (/Outfit_Top/.test(n)) set[n] = set.__top = makeTopMaterial(mat, m.geometry, o, limbIndices(m.skeleton));
    else if (/Outfit_Bottom/.test(n)) set[n] = set.__bottom = makeRecolorMaterial(mat, m.geometry, { color: o.pants, denim: o.denim ?? (o.pants === 0x1d2533), shorts: o.shorts, skin: o.skin, roughness: 0.92 }, limbIndices(m.skeleton));
    else if (/Footwear/.test(n)) set[n] = set.__shoes = makeRecolorMaterial(mat, m.geometry, { color: o.shoes, sole: o.sole ?? (o.player ? 0x1c1a18 : 0xe8e6e0), sandal: o.sandal, skin: o.skin, roughness: o.player ? 0.6 : 0.75 }, limbIndices(m.skeleton));
    else if (/Wolf3D_Skin/.test(n)) set[n] = makeSkinMaterial(mat, m.geometry, { tone: o.skin, hair: o.hair, hairStyle: o.hairStyle, stubble: o.stubble });
    else if (/Wolf3D_Body/.test(n)) { const c = mat.clone(); c.color.setRGB(...o.skin); c.roughness = 0.68; c.metalness = 0; set[n] = c; }
    else if (/Beard/.test(n)) { if (!o.beard) set[n] = null; else { const c = mat.clone(); c.color.setHex(o.hair).multiplyScalar(3); set[n] = c; } }
  });
  set.__opt = o;
  return set;
}

function restyleSet(set, o) {
  const u = (m) => m?.userData?.uniforms;
  const t = u(set.__top), b = u(set.__bottom), f = u(set.__shoes);
  if (t) { t.uShirt.value.setHex(o.shirt); t.uTee.value.setHex(o.shirt2 ?? o.shirt); t.uSleeve.value = o.sleeve || 0; t.uStripe.value = o.stripe || 0; }
  if (b) { b.uColor.value.setHex(o.pants); b.uDenim.value = o.denim ? 1 : 0; b.uShorts.value = o.shorts || 0; }
  if (f) { f.uColor.value.setHex(o.shoes); f.uSole.value.setHex(o.sole); f.uSandal.value = o.sandal || 0; }
}

// ---------------------------------------------------------------- global human LOD manager
// Every human (peds, drivers, cops, interiors staff, gameplay spawns) registers here; mesh LOD is chosen by distance
// to the main camera with hysteresis (LOD1 > ~15 m, LOD2 > ~35 m) and then a triangle budget over the in-view set
// (nearest first), so the total cost stays bounded however many systems spawn people. Ticked from onBeforeRender
// of whichever human mesh renders first in a frame (no main.js hook needed), re-evaluated every 3 frames.
export const LOD_CFG = { up1: 17, down0: 15, up2: 38, down1: 35, far: 70, budget: 380000, maxFull: 6, shadowDist: 32, every: 3 };
const _lodReg = new Set();
let _lodFrame = -1, _lodN = 0;
const _lodFr = new THREE.Frustum(), _lodM = new THREE.Matrix4(), _lodS = new THREE.Sphere(), _lodV = new THREE.Vector3(), _lodC = [];
export const lodStats = { tris: 0, inView: 0, levels: [0, 0, 0], total: 0 };
function lodTick(game) {
  const r = game.renderer; const f = r ? r.info.render.frame : 0;
  if (f === _lodFrame) return; _lodFrame = f;
  if ((_lodN++ % LOD_CFG.every) !== 0) return;
  const cam = game.camera; if (!cam) return;
  cam.updateMatrixWorld(); _lodM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _lodFr.setFromProjectionMatrix(_lodM);
  const cp = cam.getWorldPosition(_lodV);
  _lodC.length = 0;
  for (const c of _lodReg) {
    const L = c._lod; if (!L) continue;
    let vis = true, top = c.root; for (let o = c.root; o; o = o.parent) { top = o; if (!o.visible) vis = false; }
    if (top !== game.scene) { if (++L.off > 200) _lodReg.delete(c); continue; } // detached: drop (re-registers on render)
    L.off = 0;
    if (!vis) { L.inView = false; continue; }
    const rp = c.root.getWorldPosition(L.wp);
    L.d = rp.distanceTo(cp);
    _lodS.center.set(rp.x, rp.y + 0.9, rp.z); _lodS.radius = 1.6;
    L.inView = _lodFr.intersectsSphere(_lodS);
    // distance level with hysteresis
    let lv = L.want;
    if (lv === 0 && L.d > LOD_CFG.up1) lv = 1;
    if (lv <= 1 && L.d > LOD_CFG.up2) lv = 2;
    if (lv === 2 && L.d < LOD_CFG.down1) lv = 1;
    if (lv >= 1 && L.d < LOD_CFG.down0) lv = 0;
    L.want = lv;
    _lodC.push(c);
  }
  _lodC.sort((a, b) => a._lod.d - b._lod.d);
  let tris = 0, full = 0; const lv3 = [0, 0, 0]; let inView = 0;
  for (const c of _lodC) {
    const L = c._lod; let lv = L.want;
    if (L.inView) {
      inView++;
      if (lv === 0 && full >= LOD_CFG.maxFull) lv = 1;
      while (lv < 2 && tris + L.tris[lv] > LOD_CFG.budget) lv++;
      if (lv === 0) full++;
      tris += L.tris[lv]; lv3[lv]++;
    }
    c._applyLOD(lv, L.d);
  }
  lodStats.tris = tris; lodStats.inView = inView; lodStats.levels = lv3; lodStats.total = _lodReg.size;
}

export function createCharacter(game, opts = {}) {
  const variant = opts.variant || 'player';
  const seed = opts.seed ?? 0;
  if (!LIB || LIB.failed) return fallbackCharacter(variant);
  const r = rng(seed * 7 + 3);
  const zone0 = opts.outfit || opts.zone || (opts.beach ? 'beach' : 'residential');
  const personaName = opts.personality || null;
  let persona = personaName ? (PERSONAS[personaName] || PERSONAS.calm) : null;
  let base = opts.noHuman ? null : pickHuman(variant, seed, opts);
  if (variant === 'player' && LIB.nico && !opts.legacy) base = LIB.nico;
  const isNico = base?.kind === 'nico';
  const isHuman = !!base && !isNico;
  if (!base) {
    base = LIB.bases.male;
    if (variant === 'ped' && LIB.bases.female && (r() < 0.3 || !base)) base = LIB.bases.female;
    if (!base) base = LIB.bases.female;
  }
  const model = SkeletonUtils.clone(base.scene);
  _beachSeeds.set(seed, zone0);
  let hm = null;
  const mats = isNico ? {} : isHuman ? (hm = humanMaterials(base, seed, zone0, variant)).mats : getMaterials(base, variant, seed);
  const detail = [], meshes = [];
  const lodMeshes = [[], [], []];
  const lodHook = () => { if (character?._lod && !_lodReg.has(character)) _lodReg.add(character); lodTick(game); };
  model.traverse((m) => {
    if (!m.isMesh) return;
    const nm = m.material?.name;
    if (isHuman) {
      if (mats[nm]) m.material = mats[nm];
      const lm = /LOD(\d)/.exec(m.name); const l = lm ? Math.min(2, +lm[1]) : 0;
      lodMeshes[l].push(m);
      m.frustumCulled = true;
      if (m.isSkinnedMesh && m.geometry) { if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); const bs = m.geometry.boundingSphere.clone(); bs.radius *= 1.5; m.boundingSphere = bs; }
      m.onBeforeRender = lodHook;
      const k = base.entry.materials?.[nm]?.k;
      m.castShadow = !(k === 'eye' || k === 'brow' || k === 'lash'); m.receiveShadow = true;
      if (l > 0) m.visible = false;
      if (k === 'eye' || k === 'brow' || k === 'lash') detail.push(m);
      meshes.push(m);
      return;
    }
    const repl = mats['*'] || (nm in mats ? mats[nm] : undefined);
    if (repl === null) { m.visible = false; return; }
    if (repl) m.material = repl;
    m.castShadow = true; m.receiveShadow = true;
    const mn = (m.material?.name || '') + ' ' + m.name;
    if (variant === 'ped' && /Teeth/.test(mn)) { m.visible = false; return; }
    if (/Eye|Teeth|Beard/.test(mn)) detail.push(m);
    meshes.push(m);
  });
  const root = new THREE.Group(); root.name = 'character-' + variant;
  const holder = new THREE.Group();
  holder.add(model);
  const hmac = isHuman ? (base.entry.hmacro ?? 0.5) : 0.5;
  const targetH = variant === 'player' ? (base.targetH || 1.8) : isHuman ? (base.entry.gender === 'f' ? 1.53 + hmac * 0.42 : 1.63 + hmac * 0.42) + (r() - 0.5) * 0.03
    : base.kind === 'female' ? 1.55 + r() * 0.23 : 1.64 + r() * 0.31;
  const sc = targetH / base.height;
  const build = variant === 'player' || isHuman ? 1 : 0.9 + r() * 0.24; // slim .. heavy (MPFB humans carry their own build)
  holder.scale.set(sc * build, sc, sc * (0.96 + (build - 1) * 0.8));
  holder.rotation.y = -base.yaw;
  holder.position.y = -base.minY * sc;
  root.add(holder);

  // accessories (male base: head-space anchored at the head top)
  let phone = null; let accGroup = null; let copGear = null; let carryCase = null;
  const headBone = base.rig.bones.Head ? model.getObjectByName(base.rig.bones.Head.name) : null;
  // female base: tone down the stylised head size + vary proportions (bone scale is not animated)
  if (base.kind === 'female' && headBone) headBone.scale.setScalar(0.8 + r() * 0.1);
  if (base.kind === 'female') {
    const sp = base.rig.bones.Spine1 ? model.getObjectByName(base.rig.bones.Spine1.name) : null;
    if (sp) { const k = 0.92 + r() * 0.18; sp.scale.set(k, 1, k); const s2 = base.rig.bones.Spine2 ? model.getObjectByName(base.rig.bones.Spine2.name) : null; if (s2) s2.scale.set(1 / k, 1, 1 / k); }
  }
  const handBone = base.rig.bones.RightHand ? model.getObjectByName(base.rig.bones.RightHand.name) : null;
  const shortHair = isHuman && (!base.entry.hair || /^short/.test(base.entry.hair));
  if (variant === 'ped' && (base.kind === 'male' || (isHuman && shortHair)) && headBone && base.headTop) {
    try {
      const acc = makeHeadAccessories(rng(seed * 13 + 5), zone0 === 'beach', true);
      if (zone0 === 'business' || zone0 === 'cop') acc.group.clear();
      if (acc.group.children.length) attachToBone(headBone, base.rig.bones.Head.matrixWorld, base.headTop, acc.group);
      accGroup = acc.group;
      if (acc.kinds.some((k) => k !== 'sunglasses' && k !== 'headphones')) model.traverse((m) => { if (m.name === 'CharHairShell') m.visible = false; });
      if (isHuman) { acc.group.position.y -= 0.022; if (acc.kinds.some((k) => k !== 'sunglasses' && k !== 'headphones')) model.traverse((m) => { if (m.isMesh && m.material?.name === 'hair') { m.visible = false; m.userData.hide = true; } }); }
    } catch (e) { console.warn('[characters] accessories failed', e); }
  }
  if (variant === 'ped' && handBone) {
    try {
      phone = makePhone();
      const hp = base.rig.bones.RightHand.getWorldPosition(new THREE.Vector3());
      const off = base.kind === 'male' ? new THREE.Vector3(-0.075, -0.03, 0.0) : new THREE.Vector3(-0.075, -0.03, 0);
      phone.position.copy(off);
      attachToBone(handBone, base.rig.bones.RightHand.matrixWorld, hp, phone);
      phone.visible = false;
    } catch (e) { phone = null; }
  }

  const mixer = new THREE.AnimationMixer(model);
  const C = base.clips;
  // actions are created lazily the first time they get a non-zero weight (32 clips x 53 tracks of property
  // bindings per character was the main cost of spawning and of every mixer update)
  const realA = {}, stubs = {};
  const realize = (n) => {
    let a = realA[n];
    if (!a) { a = mixer.clipAction(C[n]); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = 0; a.setEffectiveWeight(0); a.play(); realA[n] = a; }
    return a;
  };
  const mkStub = (n) => { const sb = { time: 0, setEffectiveWeight(w) { if (w > 0.001) { const a = realize(n); a.time = sb.time; a.setEffectiveWeight(w); } }, getEffectiveWeight() { return 0; }, getClip() { return C[n]; } }; return sb; };
  const A = new Proxy(realA, { get(t, n) { if (t[n]) return t[n]; if (typeof n === 'string' && C[n]) return (stubs[n] ||= mkStub(n)); return undefined; } });
  const isPed = variant === 'ped';
  const loco = [];
  const pushLoco = (n, fallbackSpeed) => { if (C[n]) loco.push({ n, c: C[n], v: C[n].userData.speed || fallbackSpeed, ph: C[n].userData.phase || 0 }); };
  const walkName = isPed && A.walk2 && r() < 0.35 ? 'walk2' : 'walk';
  const idleName = isPed && A.idle2 && r() < 0.5 ? 'idle2' : 'idle';
  pushLoco(walkName, 1.4); pushLoco('run', 3.6); pushLoco('sprint', 5.5);
  loco.sort((x, y) => x.v - y.v);
  // keep speeds monotonically spaced
  for (let i = 1; i < loco.length; i++) if (loco[i].v < loco[i - 1].v + 0.6) loco[i].v = loco[i - 1].v + 0.6;
  const wsBuf = new Array(3).fill(0);

  const st = { s: 0, phase: 0, idleT: r() * 5, air: 0, airT: 0, jumpT: 0, drive: 0, dead: 0, deadT: 0, deadName: 'deadBack',
    punchT: -1, punchName: 'punchR', prevPunch: false, prevDead: false, accum: 0, lean: 0, prevHeading: null,
    styleW: 0, styleName: null, upW: 0, guardW: 0, look: 0, lookYaw: 0, hitT: -1, throwT: -1, getUpName: null, getUpT: 0, snap: null, snapT: 0, snapDur: 0 };
  const approach = (x, t, rate, dt) => x + (t - x) * (1 - Math.exp(-rate * dt));
  const setW = (a, w) => { if (a) a.setEffectiveWeight(w); };
  const setT = (a, t) => { if (a) a.time = t; };

  function update(dt, anim = {}) {
    dt = Math.min(dt || 0, 0.1);
    const dead = !!anim.dead;
    const driving = !!anim.driving && !dead;
    const airborne = !dead && !driving && anim.grounded === false;
    const speed = dead || driving ? 0 : Math.max(0, anim.speed || 0);
    // low-pass anim speed; ignore brief dips (prevents 'pausing in place' when the controller speed flickers)
    if (speed < st.s * 0.6 && !dead && !driving && !airborne) st.dipT = (st.dipT || 0) + dt; else st.dipT = 0;
    const sIn = st.dipT > 0 && st.dipT < 0.18 ? st.s : speed;
    st.s = approach(st.s, sIn, sIn > st.s ? 8 : 5, dt);

    if (dead && !st.prevDead) { st.deadT = 0; st.deadName = anim.deadStyle === 'fwd' && A.deadFwd ? 'deadFwd' : anim.deadStyle === 'back' ? 'deadBack' : (A.deadFwd && Math.random() < 0.5) ? 'deadFwd' : 'deadBack'; }
    st.prevDead = dead;
    st.dead = approach(st.dead, dead ? 1 : 0, dead ? 14 : 3, dt);
    if (dead) st.deadT += dt;
    st.drive = approach(st.drive, driving ? 1 : 0, 6, dt);
    if (airborne) { st.airT += dt; if (anim.jumping) st.jumpT += dt; } else { st.airT = 0; st.jumpT = 0; }
    // only show the airborne pose for real jumps / falls (brief 'not grounded' flickers keep locomotion)
    st.air = approach(st.air, airborne && (st.airT > 0.3 || anim.jumping) ? 1 : 0, airborne ? 8 : 14, dt);

    // punch trigger (alternating jabs)
    const p = !!anim.punch;
    if (p && !st.prevPunch && !dead && !driving && (st.punchT < 0 || st.punchT > 0.22)) {
      st.punchT = 0; st.punchName = st.punchName === 'punchR' ? 'punchL' : 'punchR';
    }
    st.prevPunch = p;
    let punchW = 0;
    if (st.punchT >= 0) {
      const pc = C[st.punchName]; const dur = pc ? pc.duration : 0.5;
      st.punchT += dt;
      if (st.punchT > dur) st.punchT = -1;
      else punchW = Math.min(1, st.punchT / 0.05) * Math.min(1, (dur - st.punchT) / 0.14);
    }

    // locomotion weights by speed
    // get-up (one-shot, overrides everything; started by anim.getUp = 'back' | 'fwd')
    if (anim.getUp && anim.getUp !== st.getUpPrev && A[anim.getUp === 'fwd' ? 'getUpFwd' : 'getUpBack']) { st.getUpName = anim.getUp === 'fwd' ? 'getUpFwd' : 'getUpBack'; st.getUpT = 0; }
    st.getUpPrev = anim.getUp || null;
    let gw = 0;
    if (st.getUpName) { const gd = C[st.getUpName].duration; st.getUpT += dt; gw = st.getUpT < gd - 0.3 ? 1 : Math.max(0, (gd - st.getUpT) / 0.3); if (st.getUpT > gd) st.getUpName = null; }
    for (const gn of GETUPS) if (A[gn]) { setT(A[gn], gn === st.getUpName ? Math.min(st.getUpT, C[gn].duration - 0.001) : 0); setW(A[gn], gn === st.getUpName ? gw : 0); }
    const base = (1 - st.dead) * (1 - st.drive) * (1 - gw);
    const locoW = base * (1 - st.air);
    const ws = wsBuf; ws.fill(0);
    let idleW = 0;
    const s = st.s;
    if (!loco.length || s <= 0.05) idleW = 1;
    else if (s < loco[0].v) { const k = s / loco[0].v; const kk = THREE.MathUtils.smoothstep(k, 0.0, 0.75); idleW = 1 - kk; ws[0] = kk; }
    else {
      let done = false;
      for (let i = 0; i < loco.length - 1; i++) {
        if (s < loco[i + 1].v) { const k = (s - loco[i].v) / (loco[i + 1].v - loco[i].v); ws[i] = 1 - k; ws[i + 1] = k; done = true; break; }
      }
      if (!done) ws[loco.length - 1] = 1;
    }
    // phase-synchronised gait cycles (no foot sliding)
    let D = 0, wsum = 0;
    loco.forEach((l, i) => { D += ws[i] * l.v * l.c.duration; wsum += ws[i]; });
    if (wsum > 0.001) {
      D /= wsum;
      // walk cadence never too slow while blending out. The player passes its real ground speed: the cycle then advances
      // exactly as far as the body travels (stride per clip measured on the rig), so planted feet do not slide.
      const effS = Math.max(Number.isFinite(anim.groundSpeed) && s > 0.3 ? anim.groundSpeed : s, loco[0].v * 0.55);
      const prevPh = st.phase;
      st.phase = (st.phase + dt * effS / Math.max(D, 0.3)) % 1;
      if (character) character.gaitPhase = st.phase;      // phase 0 = left foot plant, 0.5 = right (nico/pose.js layers on it)
      // foot plants at phase 0 (left) and 0.5 (right) -> footstep events for the player
      if (variant === 'player' && game?.emit && locoW * wsum > 0.35 && anim.grounded !== false) {
        const crossed = (a, b, x) => (a <= b ? (a < x && b >= x) : (a < x || b >= x));
        if (crossed(prevPh, st.phase, 0.5) || crossed(prevPh, st.phase, 0.999)) {
          const pp = root.position;
          let surface = 'concrete';
          try { surface = game.surfaceAt?.(pp.x, pp.z) || 'concrete'; } catch (e) { /* ignore */ }
          try { game.emit('footstep', { surface, position: pp.clone(), run: s > 3 }); } catch (e) { /* ignore */ }
        }
      }
    }
    for (let i = 0; i < loco.length; i++) { const l = loco[i], a = A[l.n]; setT(a, ((st.phase + l.ph) % 1) * l.c.duration); setW(a, ws[i] * locoW); }
    st.idleT += dt;
    // idle styles (phone / talk / film / cower) replace the plain idle while standing
    const FULL = FULL_STYLES;
    if (anim.idleStyle === undefined && persona && persona.idles) {
      st.pIdleT = (st.pIdleT ?? 0) - dt;
      if (st.pIdleT <= 0) { st.pIdleT = 3 + r() * 6; st.pIdle = persona.idles[Math.floor(r() * persona.idles.length)]; }
      anim = Object.assign({}, anim, { idleStyle: st.pIdle });
    }
    const wantStyle = STY.includes(anim.idleStyle) && A[anim.idleStyle] ? anim.idleStyle : null;
    if (wantStyle && wantStyle !== st.styleName) { if (st.styleW < 0.05 || !st.styleName) st.styleName = wantStyle; }
    st.styleW = approach(st.styleW, wantStyle && wantStyle === st.styleName ? 1 : 0, wantStyle === 'cower' ? 10 : 4, dt);
    if (st.styleW < 0.02 && !wantStyle) st.styleName = null;
    const cower = FULL.has(st.styleName);
    const styleW = st.styleW * (cower ? 1 : idleW);
    for (const sn of STY) if (A[sn]) { setT(A[sn], st.idleT % C[sn].duration); setW(A[sn], sn === st.styleName ? styleW * locoW : 0); }
    if (cower) ws.forEach((w, i) => { ws[i] = w * (1 - st.styleW); });
    if (cower) for (let i = 0; i < loco.length; i++) setW(A[loco[i].n], ws[i] * locoW);
    const idleA = A[idleName];
    if (idleA) { setT(idleA, st.idleT % idleA.getClip().duration); setW(idleA, idleW * locoW * (1 - styleW)); }
    // upper-body overlays: phone call, dog leash; one-shots: hit reaction, throw
    st.callW = approach(st.callW || 0, anim.call ? 1 : 0, 4, dt);
    if (A.phoneCall) { setT(A.phoneCall, st.idleT % C.phoneCall.duration); setW(A.phoneCall, st.callW * 4 * locoW); }
    // greet wave / argue gestures (personality reactions)
    st.waveW = approach(st.waveW || 0, anim.wave ? 1 : 0, 6, dt);
    if (A.wave) { setT(A.wave, (st.idleT * 0.9) % C.wave.duration); setW(A.wave, st.waveW * 5 * locoW); }
    st.argW = approach(st.argW || 0, anim.argue ? 1 : 0, 5, dt);
    if (A.argue) { setT(A.argue, st.idleT % C.argue.duration); setW(A.argue, st.argW * 4 * locoW); }
    st.leashW = approach(st.leashW || 0, anim.leash ? 1 : 0, 4, dt);
    if (A.leash) { setT(A.leash, st.idleT % C.leash.duration); setW(A.leash, st.leashW * 3 * locoW); }
    if (anim.hit && !st.prevHit) st.hitT = 0;
    st.prevHit = !!anim.hit;
    if (A.hitReact) {
      let hw = 0; const d = C.hitReact.duration;
      if (st.hitT >= 0) { st.hitT += dt; if (st.hitT > d) st.hitT = -1; else hw = Math.min(1, st.hitT / 0.04) * Math.min(1, (d - st.hitT) / 0.2); }
      setT(A.hitReact, Math.max(0, Math.min(st.hitT, d - 0.001))); setW(A.hitReact, hw * 6 * base);
    }
    if (anim.throw && !st.prevThrow) st.throwT = 0;
    st.prevThrow = !!anim.throw;
    if (A.throwDisc) {
      let tw = 0; const d = C.throwDisc.duration;
      if (st.throwT >= 0) { st.throwT += dt; if (st.throwT > d) st.throwT = -1; else tw = Math.min(1, st.throwT / 0.15) * Math.min(1, (d - st.throwT) / 0.3); }
      setT(A.throwDisc, Math.max(0, Math.min(st.throwT, d - 0.001))); setW(A.throwDisc, tw * 5 * base);
    }
    if (phone) phone.visible = ((st.styleName === 'phone' || st.styleName === 'film') && st.styleW > 0.4) || st.callW > 0.4;
    // hands-up flailing while fleeing (upper-body overlay)
    st.upW = approach(st.upW, anim.handsUp && s > 1 ? 1 : 0, 6, dt);
    if (A.handsUp) { setT(A.handsUp, st.idleT % C.handsUp.duration); setW(A.handsUp, st.upW * 3 * locoW); }

    // air
    const airW = base * st.air;
    const jf = anim.jumping ? THREE.MathUtils.smoothstep(st.airT, 0.45, 0.9) : 1;
    if (A.jump) { setT(A.jump, Math.min(st.jumpT, C.jump.duration - 0.001)); setW(A.jump, airW * (1 - jf)); }
    if (A.fall) { setT(A.fall, (st.airT * 1.0) % C.fall.duration); setW(A.fall, airW * jf); }
    // drive
    if (A.drive) { setT(A.drive, (st.idleT * 0.5) % C.drive.duration); setW(A.drive, (1 - st.dead) * st.drive); }
    // dead
    for (const dn of DEADS) if (A[dn]) {
      setT(A[dn], Math.min(st.deadT, C[dn].duration - 0.001));
      setW(A[dn], dn === st.deadName ? st.dead : 0);
    }
    // punch overlay (upper body only, overrides arms)
    for (const pn of PUNCHES) if (A[pn]) {
      setT(A[pn], pn === st.punchName && st.punchT >= 0 ? st.punchT : 0);
      setW(A[pn], pn === st.punchName ? punchW * 8 * (1 - st.dead) * (1 - st.drive) : 0);
    }
    // squared-up guard stance (peds fighting back)
    st.guardW = approach(st.guardW, anim.guard && !dead ? 1 : 0, 8, dt);
    if (st.guardW > 0.01 && A.punchR && !(st.punchT >= 0)) { setT(A.punchR, 0); setW(A.punchR, st.guardW * 6 * base); }

    // subtle lean into turns / acceleration (on the holder, keeps root clean)
    let turn = 0;
    if (st.prevHeading !== null && dt > 0) {
      let dh = root.rotation.y - st.prevHeading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      turn = THREE.MathUtils.clamp(dh / dt, -4, 4);
    }
    st.prevHeading = root.rotation.y;
    const targetLean = -turn * Math.min(1, s / 6) * 0.05 * base * (1 - st.air);
    st.lean = approach(st.lean, targetLean, 6, dt);
    // drunk weave (on the holder, keeps the root clean)
    holder.rotation.z = st.lean + (persona?.sway ? Math.sin(st.idleT * 1.7) * persona.sway * 0.12 * Math.min(1, 0.3 + s) : 0);
    // weight: pitch forward when accelerating / sprinting, rock back when braking
    const rawAcc = dt > 0 ? (speed - (st.prevSpeed ?? speed)) / dt : 0;
    st.prevSpeed = speed;
    st.acc = approach(st.acc || 0, THREE.MathUtils.clamp(rawAcc, -12, 12), 5, dt);
    const pitchT = (THREE.MathUtils.clamp(st.acc * 0.011, -0.07, 0.08) + 0.045 * THREE.MathUtils.smoothstep(s, 3.5, 7)) * base * (1 - st.air);
    st.pitch = approach(st.pitch || 0, pitchT, 7, dt);
    holder.rotation.x = st.pitch;

    // throttle far / off-screen peds
    if (opts.lod && opts.lod > 1) {
      st.accum += dt;
      st.lodTick = ((st.lodTick || 0) + 1) % opts.lod;
      if (st.lodTick !== 0) return;
      mixer.update(st.accum); st.accum = 0;
    } else mixer.update(dt);
    // procedural head look-at (yaw only, applied on top of the animation)
    let wantYaw = 0, wantLook = 0;
    if (anim.lookAt && headBone && !dead && !driving) {
      const dx = anim.lookAt.x - root.position.x, dz = anim.lookAt.z - root.position.z;
      let a = Math.atan2(dx, dz) - root.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) < 1.9) { wantYaw = THREE.MathUtils.clamp(a, -1.1, 1.1); wantLook = 1; }
    }
    st.look = approach(st.look, wantLook, 4, dt); st.lookYaw = approach(st.lookYaw, wantYaw, 5, dt);
    if (headBone && st.look > 0.01) {
      const yaw = st.lookYaw * st.look;
      headBone.parent.getWorldQuaternion(_q1);
      _q2.setFromAxisAngle(UP, yaw * 0.75);
      // rotate about world up, expressed in the head's parent space
      const qa = _qa.copy(_q1).invert().multiply(_q2).multiply(_q1);
      headBone.quaternion.premultiply(qa);
    }
    // blend out of a captured pose (e.g. ragdoll -> get-up) so there is no pop
    if (st.snap && st.snapT < st.snapDur) {
      st.snapT += opts.lod > 1 ? dt * opts.lod : dt;
      const k = THREE.MathUtils.smoothstep(st.snapT / st.snapDur, 0, 1);
      for (const e of st.snap) { e.b.quaternion.slerpQuaternions(e.q, e.b.quaternion, k); e.b.position.lerpVectors(e.p, e.b.position, k); }
      if (st.snapT >= st.snapDur) st.snap = null;
    }
  }

  const character = {
    root, model, mixer, base: base.kind,
    update,
    setVisible(v) { root.visible = v; },
    getBone(name) { return base.rig.bones[name] ? model.getObjectByName(base.rig.bones[name].name) : null; },
    getRest(name) { return base.rig.rest?.[name] || null; }, // rest (T) pose local transform, used by ragdoll joint limits
    restyle(zone) {
      const z = zone === true ? 'beach' : zone || 'residential';
      if (isHuman && hm) restyleHuman(hm.garments, seed, z);
      if (mats.__top && mats.__opt) { const o = genOutfit(rng(seed * 31 + z.length * 977), z); restyleSet(mats, o); }
      character.setCopGear(z === 'cop');
      if (accGroup) accGroup.visible = z !== 'business' && z !== 'cop' && z !== 'downtown';
      const wantCase = (z === 'business' || (z === 'downtown' && (seed % 2 === 0))) && variant === 'ped';
      if (wantCase && !carryCase && handBone) {
        try { const hp = base.rig.bones.RightHand.getWorldPosition(new THREE.Vector3()); carryCase = attachToBone(handBone, base.rig.bones.RightHand.matrixWorld, hp, makeCase(base.kind === 'female' ? 'bag' : 'briefcase')); } catch (e) { carryCase = null; }
      }
      if (carryCase) carryCase.visible = wantCase;
    },
    setCopGear(on) {
      if (!on && !copGear) return;
      if (on && !copGear && headBone && base.headTop) {
        try {
          const cap = makeCopCap(); if (isHuman) cap.position.y -= 0.012;
          if (rng(seed * 3 + 7)() < 0.45) cap.add(makeSunglasses(isHuman ? -0.022 : 0));
          copGear = [attachToBone(headBone, base.rig.bones.Head.matrixWorld, base.headTop, cap)];
          const hb = base.rig.bones.Hips; const hp = hb.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.02, 0.01));
          const hipsBone = model.getObjectByName(hb.name);
          if (hipsBone) { const belt = makeDutyBelt(); if (isHuman) { belt.scale.set(1.18, 1.1, 1.22); belt.position.y -= 0.06; } copGear.push(attachToBone(hipsBone, hb.matrixWorld, hp, belt)); }
        } catch (e) { copGear = []; }
      }
      if (copGear) copGear.forEach((g) => { g.visible = on; });
      if (accGroup) accGroup.visible = !on;
      model.traverse((m) => { if (m.name === 'CharHairShell' && on) m.visible = false; });
    },
    hasPhone: !!phone,
    personality: personaName, persona,
    setPersonality(n) { persona = PERSONAS[n] || null; st.pIdleT = 0; if (character) { character.personality = n; character.persona = persona; } },
    // free per-instance GPU resources (shared geometry / textures / base materials stay alive)
    _applyLOD(lv, d) {
      const L = character._lod;
      const sh = d < LOD_CFG.shadowDist && lv < 2;
      if (L.cur === lv && L.sh === sh) return;
      L.cur = lv; L.sh = sh;
      lodMeshes.forEach((arr, i) => arr.forEach((m) => { m.visible = i === lv && !m.userData.hide; }));
      for (const m of meshes) m.castShadow = sh && !detail.includes(m);
    },
    dispose() {
      _lodReg.delete(character);
      try { mixer.stopAllAction(); mixer.uncacheRoot(model); } catch (e) { /* ignore */ }
      const shared = new Set(Object.values(base.shared || {}));
      model.traverse((o) => {
        if (o.isSkinnedMesh && o.skeleton) { try { o.skeleton.dispose(); } catch (e) { /* ignore */ } }
        if (o.isMesh && isHuman) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m && !shared.has(m) && (m.name === 'atlasC' || m.name === 'hair' || m.name === 'brow' || /^garment_/.test(m.name))) { try { m.dispose(); } catch (e) { /* ignore */ } } }
      });
    },
    // capture the current bone pose (e.g. from a ragdoll) and blend from it into animation over `dur` seconds
    snapshotPose(dur = 0.35) {
      const arr = [];
      model.traverse((o) => { if (o.isBone) arr.push({ b: o, q: o.quaternion.clone(), p: o.position.clone() }); });
      st.snap = arr; st.snapT = 0; st.snapDur = dur;
    },
    human: isHuman ? base.entry : null,
    zoneTag: isHuman ? base.entry.zone : zone0,
    setLOD(n) {
      if (opts.lod === n) return;
      opts.lod = n;
      if (isHuman) return; // mesh LOD + shadows are owned by the global LOD manager (lodTick)

      for (const m of detail) m.visible = n < 3;
      for (const m of meshes) m.castShadow = n < 4;
    },
  };
  update(0, { speed: 0, grounded: true });
  if (isNico) { try { (base.tripo ? decorateNicoTripo : decorateNico)(character, { game, model, assets: base.assets, opts }); } catch (e) { console.warn('[nico] decorate failed', e); } }
  if (zone0 === 'cop' || zone0 === 'business') character.restyle(zone0);
  if (isHuman && variant !== 'player') {
    const t = base.entry.tris || [34000, 10000, 3400];
    character._lod = { want: 2, cur: 0, off: 0, sh: true, d: 1e9, inView: false, wp: new THREE.Vector3(), tris: [t[0], t[1] ?? t[0], t[2] ?? t[1] ?? t[0]] };
    _lodReg.add(character);
  }
  return character;
}

function fallbackCharacter(variant) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: variant === 'ped' ? 0x3366aa : 0xcc6644 }));
  body.position.y = 0.85; body.castShadow = true; root.add(body);
  return { root, update(dt, a = {}) { body.rotation.x = a.dead ? -Math.PI / 2 : 0; body.position.y = a.dead ? 0.3 : 0.85; }, setVisible(v) { root.visible = v; }, setLOD() {} };
}

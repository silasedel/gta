// Procedurally authored keyframe clips on the X Bot canonical rig
// (all bone rest rotations identity, T-pose, facing +Z, character-left = +X, up = +Y; hips units = cm).
// Rotations are lists of [axis, degrees] applied in order (first op applied first).
import * as THREE from 'three';

const D2R = Math.PI / 180;
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
function q(ops) {
  const out = new THREE.Quaternion();
  const t = new THREE.Quaternion();
  for (const [a, d] of ops || []) { t.setFromAxisAngle(AX[a], d * D2R); out.premultiply(t); }
  return out;
}

// relaxed standing arms
const RELAX = {
  LeftArm: [['z', -74], ['y', -6]], RightArm: [['z', 74], ['y', 6]],
  LeftForeArm: [['y', -14]], RightForeArm: [['y', 14]],
};
// closed fists (X Bot finger axes: fingers along +-X, palm faces -Y)
const FIST = {};
for (const side of ['Left', 'Right']) {
  const sg = side === 'Left' ? -1 : 1;
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let k = 1; k <= 3; k++) FIST[side + 'Hand' + f + k] = [['z', sg * (k === 1 ? 75 : 85)]];
  FIST[side + 'HandThumb1'] = [['y', sg * -20]]; FIST[side + 'HandThumb2'] = [['z', sg * 35]]; FIST[side + 'HandThumb3'] = [['z', sg * 40]];
}
const GUARD = {
  LeftArm: [['z', -68], ['y', -32]], RightArm: [['z', 68], ['y', 32]],
  LeftForeArm: [['y', -128], ['x', -10]], RightForeArm: [['y', 128], ['x', -10]],
  Spine: [['x', 6]], Spine1: [['y', -6]], Head: [['x', 6]],
  LeftHand: [['z', -10]], RightHand: [['z', 10]],
  ...FIST,
};

function makeClip(rig, name, keys, { relax = true, hipsKey = true } = {}) {
  const boneSet = new Set();
  keys.forEach((k) => Object.keys(k.b || {}).forEach((b) => boneSet.add(b)));
  if (relax) Object.keys(RELAX).forEach((b) => boneSet.add(b));
  const times = new Float32Array(keys.map((k) => k.t));
  const tracks = [];
  for (const bn of boneSet) {
    const bone = rig.bones[bn]; if (!bone) continue;
    const vals = new Float32Array(keys.length * 4);
    keys.forEach((k, i) => {
      const ops = (k.b && k.b[bn]) || (relax ? RELAX[bn] : null) || [];
      q(ops).toArray(vals, i * 4);
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', times, vals));
  }
  if (hipsKey) {
    const hips = rig.bones.Hips; const r0 = rig.rest.Hips.p;
    const hq = new Float32Array(keys.length * 4), hp = new Float32Array(keys.length * 3);
    keys.forEach((k, i) => {
      q(k.hipsRot).toArray(hq, i * 4);
      const o = k.hips || [0, 0, 0];
      hp[i * 3] = r0.x + o[0]; hp[i * 3 + 1] = r0.y + o[1]; hp[i * 3 + 2] = r0.z + o[2];
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(hips.name + '.quaternion', times, hq));
    tracks.push(new THREE.VectorKeyframeTrack(hips.name + '.position', times, hp));
  }
  return new THREE.AnimationClip(name, keys[keys.length - 1].t, tracks);
}
const merge = (...ps) => Object.assign({}, ...ps);

export function buildProceduralClips(rig) {
  const clips = {};

  // ---- JUMP (takeoff -> tucked apex) ----
  clips.jump = makeClip(rig, 'jump', [
    { t: 0, hips: [0, -8, 0], b: { Spine: [['x', 16]], Head: [['x', -6]], LeftUpLeg: [['x', -34]], LeftLeg: [['x', 55]], RightUpLeg: [['x', -24]], RightLeg: [['x', 50]],
      LeftArm: [['z', -62], ['y', 35]], RightArm: [['z', 62], ['y', -35]], LeftForeArm: [['y', -20]], RightForeArm: [['y', 20]], LeftFoot: [['x', -15]], RightFoot: [['x', -15]] } },
    { t: 0.16, hips: [0, 3, 0], b: { Spine: [['x', -6]], Head: [['x', -4]], LeftUpLeg: [['x', -62]], LeftLeg: [['x', 85]], RightUpLeg: [['x', 14]], RightLeg: [['x', 22]],
      LeftArm: [['z', -40], ['y', 40]], RightArm: [['z', 30], ['y', 45]], LeftForeArm: [['y', -55]], RightForeArm: [['y', 60]], LeftFoot: [['x', 15]], RightFoot: [['x', 35]] } },
    { t: 0.42, hips: [0, 0, 0], b: { Spine: [['x', 6]], LeftUpLeg: [['x', -70]], LeftLeg: [['x', 100]], RightUpLeg: [['x', -30]], RightLeg: [['x', 85]],
      LeftArm: [['z', -30], ['y', 15]], RightArm: [['z', 32], ['y', 5]], LeftForeArm: [['y', -55]], RightForeArm: [['y', 50]], LeftFoot: [['x', 10]], RightFoot: [['x', 15]] } },
    { t: 0.8, hips: [0, 0, 0], b: { Spine: [['x', 8]], LeftUpLeg: [['x', -45]], LeftLeg: [['x', 65]], RightUpLeg: [['x', -20]], RightLeg: [['x', 55]],
      LeftArm: [['z', -28], ['y', -5]], RightArm: [['z', 30], ['y', -5]], LeftForeArm: [['y', -40]], RightForeArm: [['y', 35]] } },
  ]);

  // ---- FALL (looping flail, arms out for balance) ----
  const fallA = { Spine: [['x', -8]], Head: [['x', -10]], LeftUpLeg: [['x', -38]], LeftLeg: [['x', 55]], RightUpLeg: [['x', 8]], RightLeg: [['x', 30]],
    LeftArm: [['z', -42], ['y', -18]], RightArm: [['z', 38], ['y', 22]], LeftForeArm: [['y', -40]], RightForeArm: [['y', 35]] };
  const fallB = { Spine: [['x', -3]], Head: [['x', -5]], LeftUpLeg: [['x', 6]], LeftLeg: [['x', 35]], RightUpLeg: [['x', -36]], RightLeg: [['x', 60]],
    LeftArm: [['z', -36], ['y', 16]], RightArm: [['z', 44], ['y', -10]], LeftForeArm: [['y', -30]], RightForeArm: [['y', 45]] };
  clips.fall = makeClip(rig, 'fall', [{ t: 0, b: fallA }, { t: 0.5, b: fallB }, { t: 1.0, b: fallA }]);

  // ---- PUNCHES (upper body only) ----
  const jabR = merge(GUARD, { RightArm: [['y', 84], ['x', 4]], RightForeArm: [['y', 4]], RightHand: [], Spine: [['x', 8], ['y', 16]], Spine1: [['y', 14]], Spine2: [['y', 6]], Head: [['y', -18], ['x', 6]] });
  const jabL = merge(GUARD, { LeftArm: [['y', -84], ['x', 4]], LeftForeArm: [['y', -4]], LeftHand: [], Spine: [['x', 8], ['y', -16]], Spine1: [['y', -14]], Spine2: [['y', -6]], Head: [['y', 18], ['x', 6]] });
  const wind = (side) => merge(GUARD, side === 'R'
    ? { Spine: [['x', 6], ['y', -10]], Spine1: [['y', -10]], RightArm: [['z', 60], ['y', 18]] }
    : { Spine: [['x', 6], ['y', 10]], Spine1: [['y', 10]], LeftArm: [['z', -60], ['y', -18]] });
  for (const side of ['R', 'L']) {
    const c = makeClip(rig, 'punch' + side, [
      { t: 0, b: GUARD }, { t: 0.07, b: wind(side) }, { t: 0.15, b: side === 'R' ? jabR : jabL },
      { t: 0.22, b: side === 'R' ? jabR : jabL }, { t: 0.38, b: GUARD }, { t: 0.5, b: GUARD },
    ], { hipsKey: false });
    c.userData = c.userData || {}; c.userData.upperOnly = true;
    clips['punch' + side] = c;
  }

  // ---- DRIVING SIT (root origin = seat surface / hip point) ----
  const sit = (k) => ({
    Spine: [['x', -10]], Spine1: [['x', 2]], Head: [['x', 6 + k], ['y', k * 2]],
    LeftUpLeg: [['x', -84], ['z', -6]], RightUpLeg: [['x', -84], ['z', 6]], LeftLeg: [['x', 70]], RightLeg: [['x', 76]],
    LeftFoot: [['x', -8]], RightFoot: [['x', -14]],
    LeftArm: [['z', -52], ['y', -48]], RightArm: [['z', 52], ['y', 48]],
    LeftForeArm: [['y', -50], ['x', -20]], RightForeArm: [['y', 50], ['x', -20]],
    LeftHand: [['x', 20]], RightHand: [['x', 20]],
  });
  clips.drive = makeClip(rig, 'drive', [{ t: 0, hips: [0, -92, -6], b: sit(0) }, { t: 2, hips: [0, -92, -6], b: sit(3) }, { t: 4, hips: [0, -92, -6], b: sit(0) }]);

  // ---- DEATH FALLS ----
  const buckle = { Spine: [['x', 18]], Head: [['x', 20]], LeftUpLeg: [['x', -30]], LeftLeg: [['x', 60]], RightUpLeg: [['x', -18]], RightLeg: [['x', 50]],
    LeftArm: [['z', -40], ['y', 20]], RightArm: [['z', 35], ['y', -25]], LeftForeArm: [['y', -30]], RightForeArm: [['y', 40]] };
  const lieBack = { Spine: [['x', -4]], Neck: [['y', 25]], Head: [['y', 15], ['x', -10]], LeftUpLeg: [['x', -8], ['z', -10]], LeftLeg: [['x', 12]],
    RightUpLeg: [['x', -28], ['z', 6]], RightLeg: [['x', 40]], LeftArm: [['z', -18], ['y', 10]], RightArm: [['z', 40], ['y', -20]],
    LeftForeArm: [['y', -25]], RightForeArm: [['y', 60]], LeftFoot: [['x', 30]], RightFoot: [['x', 20]] };
  clips.deadBack = makeClip(rig, 'deadBack', [
    { t: 0, b: {} },
    { t: 0.22, hips: [0, -28, -10], hipsRot: [['x', -12]], b: buckle },
    { t: 0.62, hips: [0, -86, -55], hipsRot: [['x', -88], ['y', 8]], b: merge(lieBack, { Spine: [['x', 8]], Head: [['x', 15]] }) },
    { t: 0.74, hips: [0, -83, -60], hipsRot: [['x', -86], ['y', 8]], b: lieBack },
    { t: 0.9, hips: [0, -85, -61], hipsRot: [['x', -89], ['y', 8]], b: lieBack },
  ]);
  const lieFwd = { Spine: [['x', 2]], Neck: [['y', -30]], Head: [['y', -30], ['x', -20]], LeftUpLeg: [['x', 4], ['z', -12]], LeftLeg: [['x', 25]],
    RightUpLeg: [['x', -20], ['z', 10]], RightLeg: [['x', 50]], LeftArm: [['z', 10], ['y', -10]], RightArm: [['z', -30], ['y', -35]],
    LeftForeArm: [['y', -70]], RightForeArm: [['y', 20]], LeftFoot: [['x', 50]], RightFoot: [['x', 40]] };
  clips.deadFwd = makeClip(rig, 'deadFwd', [
    { t: 0, b: {} },
    { t: 0.2, hips: [0, -22, 8], hipsRot: [['x', 15]], b: merge(buckle, { Spine: [['x', 25]] }) },
    { t: 0.6, hips: [0, -88, 62], hipsRot: [['x', 90], ['y', -10]], b: merge(lieFwd, { Spine: [['x', -6]] }) },
    { t: 0.72, hips: [0, -85, 66], hipsRot: [['x', 87], ['y', -10]], b: lieFwd },
    { t: 0.88, hips: [0, -87, 67], hipsRot: [['x', 89], ['y', -10]], b: lieFwd },
  ]);
  // ---- IDLE STYLES (full body) ----
  const stand = { LeftUpLeg: [['z', -3]], RightUpLeg: [['z', 3]] };
  const phoneA = merge(stand, { RightArm: [['z', 72], ['y', 28]], RightForeArm: [['y', 118], ['x', -15]], RightHand: [['x', -25]],
    LeftArm: [['z', -74], ['y', -18]], LeftForeArm: [['y', -55]], Neck: [['x', 14]], Head: [['x', 22]], Spine: [['x', 4]] });
  const phoneB = merge(phoneA, { Head: [['x', 20], ['y', 6]], RightHand: [['x', -18]] });
  clips.phone = makeClip(rig, 'phone', [{ t: 0, b: phoneA }, { t: 1.6, b: phoneB }, { t: 3.2, b: phoneA }]);
  const filmA = merge(stand, { RightArm: [['z', 12], ['y', 66]], RightForeArm: [['y', 98], ['x', -10]], LeftArm: [['z', -12], ['y', -66]], LeftForeArm: [['y', -98], ['x', -10]],
    Head: [['x', 4]], Spine: [['x', -3]] });
  clips.film = makeClip(rig, 'film', [{ t: 0, b: filmA }, { t: 1.5, b: merge(filmA, { Spine: [['y', 8]], Head: [['x', 6]] }) }, { t: 3, b: filmA }]);
  const talk0 = merge(stand, { Head: [['y', 4]] });
  const talk1 = merge(stand, { RightArm: [['z', 64], ['y', 26]], RightForeArm: [['y', 80], ['x', -25]], RightHand: [['x', -20]], Head: [['y', -6], ['x', 4]] });
  const talk2 = merge(stand, { LeftArm: [['z', -66], ['y', -22]], LeftForeArm: [['y', -70], ['x', -20]], RightForeArm: [['y', 30]], Head: [['y', 8], ['z', 4]] });
  const talk3 = merge(stand, { RightArm: [['z', 60], ['y', 36]], RightForeArm: [['y', 60]], LeftArm: [['z', -62], ['y', -34]], LeftForeArm: [['y', -60]], Head: [['x', -4]] });
  clips.talk = makeClip(rig, 'talk', [{ t: 0, b: talk0 }, { t: 0.9, b: talk1 }, { t: 1.7, b: talk0 }, { t: 2.6, b: talk2 }, { t: 3.4, b: talk3 }, { t: 4.2, b: talk0 }]);
  const cowerA = { Spine: [['x', 38]], Spine1: [['x', 10]], Neck: [['x', 20]], Head: [['x', 20]],
    LeftUpLeg: [['x', -105], ['z', -8]], RightUpLeg: [['x', -100], ['z', 8]], LeftLeg: [['x', 125]], RightLeg: [['x', 120]], LeftFoot: [['x', -20]], RightFoot: [['x', -20]],
    LeftArm: [['z', 30], ['y', -55]], RightArm: [['z', -30], ['y', 55]], LeftForeArm: [['y', -135]], RightForeArm: [['y', 135]] };
  const cowerB = merge(cowerA, { Spine: [['x', 40], ['y', 3]], Head: [['x', 24]] });
  clips.cower = makeClip(rig, 'cower', [{ t: 0, hips: [0, -48, -12], b: cowerA }, { t: 0.15, hips: [0, -49, -12], b: cowerB }, { t: 0.3, hips: [0, -48, -12], b: cowerA }]);

  // ---- BEACH: lying on a towel / sitting on the sand ----
  const lie = { Spine: [['x', -4]], Head: [['x', -12]], LeftUpLeg: [['x', -4], ['z', -6]], RightUpLeg: [['x', -18], ['z', 5]], RightLeg: [['x', 30]],
    LeftArm: [['z', 40], ['y', 60]], RightArm: [['z', -40], ['y', -60]], LeftForeArm: [['y', -120]], RightForeArm: [['y', 120]], LeftFoot: [['x', 30]], RightFoot: [['x', 20]] };
  clips.lie = makeClip(rig, 'lie', [{ t: 0, hips: [0, -92, -40], hipsRot: [['x', -90]], b: lie }, { t: 3, hips: [0, -91.5, -40], hipsRot: [['x', -90]], b: merge(lie, { Head: [['x', -12], ['y', 8]] }) }, { t: 6, hips: [0, -92, -40], hipsRot: [['x', -90]], b: lie }]);
  const sitG = { Spine: [['x', -22]], Spine1: [['x', 4]], Head: [['x', 14]], LeftUpLeg: [['x', -80], ['z', -8]], RightUpLeg: [['x', -62], ['z', 6]], LeftLeg: [['x', 8]], RightLeg: [['x', 70]],
    LeftArm: [['z', -70], ['y', 50]], RightArm: [['z', 70], ['y', -50]], LeftForeArm: [['y', -10]], RightForeArm: [['y', 10]], LeftHand: [['z', 70]], RightHand: [['z', -70]] };
  clips.sitGround = makeClip(rig, 'sitGround', [{ t: 0, hips: [0, -86, -6], b: sitG }, { t: 2.5, hips: [0, -86, -6], b: merge(sitG, { Head: [['x', 10], ['y', -12]] }) }, { t: 5, hips: [0, -86, -6], b: sitG }]);

  const upper = (c) => { c.userData = c.userData || {}; c.userData.upperOnly = true; return c; };
  // ---- SIT ON A BENCH (root = bench front edge on the ground, seat ~0.45 m) ----
  const sitB = (k) => ({ Spine: [['x', -4 + k]], Spine1: [['x', 3]], Head: [['x', 4 + k * 2], ['y', k * 6]],
    LeftUpLeg: [['x', -86], ['z', -5]], RightUpLeg: [['x', -86], ['z', 5]], LeftLeg: [['x', 84]], RightLeg: [['x', 80 + k * 3]], LeftFoot: [['x', 4]], RightFoot: [['x', 6]],
    LeftArm: [['z', -70], ['y', -32]], RightArm: [['z', 70], ['y', 32]], LeftForeArm: [['y', -58]], RightForeArm: [['y', 58]], LeftHand: [['x', 10]], RightHand: [['x', 10]] });
  clips.sitBench = makeClip(rig, 'sitBench', [{ t: 0, hips: [0, -50, -8], b: sitB(0) }, { t: 2.2, hips: [0, -49.5, -8], b: sitB(2) }, { t: 4.4, hips: [0, -50, -8], b: sitB(0) }]);
  // ---- LEAN AGAINST A WALL (wall behind the character) ----
  const leanP = (k) => ({ Spine: [['x', -7]], Spine1: [['x', -2]], Head: [['x', 2 + k], ['y', -10 + k * 4]],
    LeftUpLeg: [['x', -2], ['z', -3]], RightUpLeg: [['x', -22], ['z', 4]], RightLeg: [['x', 55]], RightFoot: [['x', 15]],
    LeftArm: [['z', -64], ['y', -50]], RightArm: [['z', 64], ['y', 52]], LeftForeArm: [['y', -118]], RightForeArm: [['y', 116], ['x', 6]] });
  clips.lean = makeClip(rig, 'lean', [{ t: 0, hips: [0, -2, -7], hipsRot: [['x', -6]], b: leanP(0) }, { t: 2.5, hips: [0, -2, -7], hipsRot: [['x', -6]], b: leanP(3) }, { t: 5, hips: [0, -2, -7], hipsRot: [['x', -6]], b: leanP(0) }]);
  // ---- DANCE (club / street, 1 beat = 0.55 s) ----
  const dA = { Spine: [['x', 6], ['y', 10]], Head: [['x', 10]], LeftUpLeg: [['x', -18]], LeftLeg: [['x', 30]], RightUpLeg: [['x', -6]], RightLeg: [['x', 14]],
    LeftArm: [['z', -42], ['y', -12]], RightArm: [['z', 62], ['y', 8]], LeftForeArm: [['y', -125], ['x', -20]], RightForeArm: [['y', 105]], LeftHand: [['z', -20]], RightHand: [['z', 15]] };
  const dB = { Spine: [['x', 2], ['y', -10]], Head: [['x', -2]], LeftUpLeg: [['x', -6]], LeftLeg: [['x', 14]], RightUpLeg: [['x', -18]], RightLeg: [['x', 30]],
    LeftArm: [['z', -62], ['y', -8]], RightArm: [['z', 42], ['y', 12]], LeftForeArm: [['y', -105]], RightForeArm: [['y', 125], ['x', -20]], LeftHand: [['z', -15]], RightHand: [['z', 20]] };
  clips.dance = makeClip(rig, 'dance', [{ t: 0, hips: [-2, -6, 0], hipsRot: [['y', 12]], b: dA }, { t: 0.55, hips: [2, -1, 0], hipsRot: [['y', -12]], b: dB }, { t: 1.1, hips: [-2, -6, 0], hipsRot: [['y', 12]], b: dA }]);
  // ---- PHONE CALL (upper overlay, hand at the ear) ----
  const call = (k) => ({ RightArm: [['z', 38], ['y', 34]], RightForeArm: [['y', 152]], RightHand: [['z', -20], ['x', -10]], Head: [['z', 8 + k], ['y', k * 3]],
    LeftArm: [['z', -64], ['y', 16]], LeftForeArm: [['y', -95]], LeftHand: [['z', 10]] });
  clips.phoneCall = upper(makeClip(rig, 'phoneCall', [{ t: 0, b: call(0) }, { t: 1.6, b: call(4) }, { t: 3.2, b: call(0) }], { hipsKey: false }));
  // ---- VOLLEYBALL (ready + bump/set loop) ----
  const vReady = { Spine: [['x', 22]], Head: [['x', -18]], LeftUpLeg: [['x', -38], ['z', -8]], RightUpLeg: [['x', -38], ['z', 8]], LeftLeg: [['x', 58]], RightLeg: [['x', 58]],
    LeftArm: [['z', -62], ['y', -40]], RightArm: [['z', 62], ['y', 40]], LeftForeArm: [['y', -30]], RightForeArm: [['y', 30]] };
  const vHit = { Spine: [['x', 4]], Head: [['x', -30]], LeftUpLeg: [['x', -12], ['z', -6]], RightUpLeg: [['x', -12], ['z', 6]], LeftLeg: [['x', 18]], RightLeg: [['x', 18]],
    LeftArm: [['z', -8], ['y', -70]], RightArm: [['z', 8], ['y', 70]], LeftForeArm: [['y', -50]], RightForeArm: [['y', 50]] };
  clips.volley = makeClip(rig, 'volley', [{ t: 0, hips: [0, -13, 0], b: vReady }, { t: 0.9, hips: [0, -13, 0], b: vReady }, { t: 1.2, hips: [0, -2, 0], b: vHit }, { t: 1.6, hips: [0, -10, 0], b: vReady }, { t: 2.4, hips: [0, -13, 0], b: vReady }]);
  // ---- FRISBEE / BALL THROW (upper overlay) ----
  const tWind = { RightArm: [['z', 55], ['y', -55]], RightForeArm: [['y', 70]], Spine: [['y', 25]], Spine1: [['y', 10]], LeftArm: [['z', -55], ['y', -30]], LeftForeArm: [['y', -40]] };
  const tRel = { RightArm: [['z', 82], ['y', 75]], RightForeArm: [['y', 8]], Spine: [['y', -18]], Spine1: [['y', -8]], LeftArm: [['z', -70], ['y', 10]], LeftForeArm: [['y', -20]] };
  clips.throwDisc = upper(makeClip(rig, 'throwDisc', [{ t: 0, b: RELAX }, { t: 0.5, b: tWind }, { t: 0.72, b: tRel }, { t: 1.1, b: merge(RELAX, { RightArm: [['z', 70], ['y', 40]] }) }, { t: 2.2, b: RELAX }], { hipsKey: false }));
  // ---- SWIM (front crawl; root at the water surface) ----
  const sw = (lp, rp, kick, breath) => ({
    Head: [['x', -25], ['y', breath]], Spine: [['x', -6]],
    LeftArm: lp === 0 ? [['z', 78], ['y', -8]] : lp === 1 ? [['y', -88], ['x', 10]] : lp === 2 ? [['z', -80]] : [['z', 20], ['y', 40], ['x', -50]],
    RightArm: rp === 0 ? [['z', -78], ['y', 8]] : rp === 1 ? [['y', 88], ['x', 10]] : rp === 2 ? [['z', 80]] : [['z', -20], ['y', -40], ['x', -50]],
    LeftForeArm: [['y', lp === 3 ? -70 : -12]], RightForeArm: [['y', rp === 3 ? 70 : 12]],
    LeftUpLeg: [['x', kick]], RightUpLeg: [['x', -kick]], LeftLeg: [['x', 15]], RightLeg: [['x', 15]], LeftFoot: [['x', 40]], RightFoot: [['x', 40]] });
  const swK = (t, a, b, k, br) => ({ t, hips: [0, -104, 0], hipsRot: [['x', 82]], b: sw(a, b, k, br) });
  clips.swim = makeClip(rig, 'swim', [swK(0, 0, 2, 12, 0), swK(0.4, 1, 3, -12, 0), swK(0.8, 2, 0, 12, 35), swK(1.2, 3, 1, -12, 0), swK(1.6, 0, 2, 12, 0)]);
  // ---- KNEEL / GARDEN ----
  const kn = (k) => ({ Spine: [['x', 32 + k]], Spine1: [['x', 8]], Head: [['x', 18]], LeftUpLeg: [['x', -88]], LeftLeg: [['x', 92]], RightUpLeg: [['x', 4]], RightLeg: [['x', 96]], RightFoot: [['x', 40]],
    LeftArm: [['z', -58], ['y', -48 - k]], RightArm: [['z', 58], ['y', 48 + k]], LeftForeArm: [['y', -26 + k]], RightForeArm: [['y', 26 - k]] });
  // r4-anim (user: "animation looks terrible, like punching the ground"): the old kneel hung both straight arms down beside the
  // hips (fists at 0.3 m, into the ground on shorter people) and sank the planted foot's toes 8 cm under the floor. Solved on
  // the X Bot rig (tools/v2/anim/kneel_solve.mjs): right knee on the ground with the toes tucked under, left foot flat with
  // the knee up, left forearm across the raised knee with the hand hanging over it, right hand resting on the thigh; a slow
  // breath in the back and shoulders. ?r4kneel=0 = the old pose.
  const kn2 = (k) => ({ Spine: [['x', 24 + k]], Spine1: [['x', 8]], Head: [['x', 14 - k]],
    LeftUpLeg: [['z', 4], ['y', -3], ['x', -93]], LeftLeg: [['z', -3], ['y', -9], ['x', 91]], LeftFoot: [['z', 4], ['y', 3], ['x', -13]],
    RightUpLeg: [['z', -2], ['y', 1], ['x', -5]], RightLeg: [['z', 1], ['y', 11], ['x', 105]], RightFoot: [['z', -34], ['y', 16], ['x', -61]], RightToeBase: [['y', -27], ['x', -20]],
    LeftArm: [['z', -43 + k * 0.5], ['y', -90], ['x', -18]], LeftForeArm: [['z', 16], ['y', -28], ['x', -42]], LeftHand: [['z', -13], ['y', 17], ['x', 1]],
    RightArm: [['z', 90 - k * 0.5], ['y', 46], ['x', -29]], RightForeArm: [['z', -2], ['y', 11 + k], ['x', 6]], RightHand: [['z', -4]] });
  const OLD_KNEEL = typeof location !== 'undefined' && /[?&]r4kneel=0/.test(location.search);
  clips.kneel = OLD_KNEEL ? makeClip(rig, 'kneel', [{ t: 0, hips: [0, -50, -10], b: kn(0) }, { t: 0.8, hips: [0, -50, -10], b: kn(8) }, { t: 1.6, hips: [0, -50, -10], b: kn(0) }])
    : makeClip(rig, 'kneel', [{ t: 0, hips: [0, -46.5, -10], b: kn2(0) }, { t: 1.4, hips: [0, -46.1, -10], b: kn2(2.5) }, { t: 2.8, hips: [0, -46.5, -10], b: kn2(0) }]);
  // ---- GET UP (from lying on the back / front; root under the pelvis) ----
  const lieB = { Spine: [['x', -4]], Head: [['x', -6]], LeftUpLeg: [['x', -6], ['z', -10]], RightUpLeg: [['x', -10], ['z', 10]], LeftLeg: [['x', 10]], RightLeg: [['x', 14]], LeftArm: [['z', -40]], RightArm: [['z', 40]] };
  clips.getUpBack = makeClip(rig, 'getUpBack', [
    { t: 0, hips: [0, -92, 0], hipsRot: [['x', -88]], b: lieB },
    { t: 0.45, hips: [0, -88, 0], hipsRot: [['x', -60]], b: { Spine: [['x', 25]], Head: [['x', 20]], LeftUpLeg: [['x', -40]], RightUpLeg: [['x', -55]], LeftLeg: [['x', 70]], RightLeg: [['x', 110]], LeftArm: [['z', -70], ['y', 60]], RightArm: [['z', 70], ['y', -60]] } },
    { t: 1.0, hips: [0, -72, 8], hipsRot: [['x', -10]], b: { Spine: [['x', 45]], Head: [['x', 10]], LeftUpLeg: [['x', -100]], RightUpLeg: [['x', -110]], LeftLeg: [['x', 125]], RightLeg: [['x', 130]], LeftArm: [['z', -70], ['y', -20]], RightArm: [['z', 70], ['y', 40]], RightForeArm: [['y', 20]] } },
    { t: 1.55, hips: [0, -40, 6], hipsRot: [['x', 0]], b: { Spine: [['x', 40]], Head: [['x', 0]], LeftUpLeg: [['x', -95]], RightUpLeg: [['x', -70]], LeftLeg: [['x', 110]], RightLeg: [['x', 95]] } },
    { t: 2.1, hips: [0, -6, 0], b: { Spine: [['x', 10]], LeftUpLeg: [['x', -12]], RightUpLeg: [['x', -8]], LeftLeg: [['x', 18]], RightLeg: [['x', 12]] } },
    { t: 2.5, b: {} }]);
  const lieF = { Spine: [['x', 2]], Head: [['x', -30], ['y', 30]], LeftUpLeg: [['x', 2], ['z', -8]], RightUpLeg: [['x', -4], ['z', 8]], LeftArm: [['z', 10], ['y', -60]], RightArm: [['z', -10], ['y', 60]], LeftForeArm: [['y', -90]], RightForeArm: [['y', 90]] };
  clips.getUpFwd = makeClip(rig, 'getUpFwd', [
    { t: 0, hips: [0, -92, 0], hipsRot: [['x', 88]], b: lieF },
    { t: 0.5, hips: [0, -70, 0], hipsRot: [['x', 70]], b: { Spine: [['x', -10]], Head: [['x', -30]], LeftArm: [['z', -10], ['y', -80]], RightArm: [['z', 10], ['y', 80]], LeftForeArm: [['y', -20]], RightForeArm: [['y', 20]], LeftUpLeg: [['x', -30]], RightUpLeg: [['x', -30]], LeftLeg: [['x', 60]], RightLeg: [['x', 60]] } },
    { t: 1.05, hips: [0, -60, -10], hipsRot: [['x', 15]], b: { Spine: [['x', 50]], Head: [['x', -10]], LeftUpLeg: [['x', -95]], RightUpLeg: [['x', -95]], LeftLeg: [['x', 120]], RightLeg: [['x', 120]], LeftArm: [['z', -40], ['y', -70]], RightArm: [['z', 40], ['y', 70]] } },
    { t: 1.6, hips: [0, -38, -4], b: { Spine: [['x', 35]], LeftUpLeg: [['x', -90]], RightUpLeg: [['x', -65]], LeftLeg: [['x', 105]], RightLeg: [['x', 90]] } },
    { t: 2.1, hips: [0, -5, 0], b: { Spine: [['x', 8]], LeftUpLeg: [['x', -10]], RightUpLeg: [['x', -8]], LeftLeg: [['x', 14]], RightLeg: [['x', 10]] } },
    { t: 2.5, b: {} }]);
  // ---- HIT REACTION (upper overlay) + LEASH (dog walking, upper overlay) ----
  clips.hitReact = upper(makeClip(rig, 'hitReact', [{ t: 0, b: RELAX },
    { t: 0.09, b: { Spine: [['x', -14], ['y', 12]], Spine1: [['x', -8]], Head: [['x', -22], ['y', -15]], LeftArm: [['z', -40], ['y', -35]], RightArm: [['z', 30], ['y', 45]], LeftForeArm: [['y', -90]], RightForeArm: [['y', 100]] } },
    { t: 0.3, b: { Spine: [['x', 10], ['y', -4]], Head: [['x', 12]], LeftArm: [['z', -55], ['y', -20]], RightArm: [['z', 50], ['y', 25]], LeftForeArm: [['y', -60]], RightForeArm: [['y', 60]] } },
    { t: 0.6, b: RELAX }], { hipsKey: false }));
  clips.leash = upper(makeClip(rig, 'leash', [{ t: 0, b: merge(RELAX, { RightArm: [['z', 62], ['y', 30]], RightForeArm: [['y', 55]], RightHand: [['x', 20]] }) },
    { t: 1, b: merge(RELAX, { RightArm: [['z', 60], ['y', 36]], RightForeArm: [['y', 50]], RightHand: [['x', 25]] }) }, { t: 2, b: merge(RELAX, { RightArm: [['z', 62], ['y', 30]], RightForeArm: [['y', 55]], RightHand: [['x', 20]] }) }], { hipsKey: false }));

  // ---- WAVE / GREET (upper overlay) ----
  const wv = (k) => merge(RELAX, { RightArm: [['z', -10], ['y', 15]], RightForeArm: [['y', 40 + k * 30], ['x', -10]], RightHand: [['z', k * 15]], Head: [['y', -8], ['x', -4]] });
  clips.wave = upper(makeClip(rig, 'wave', [{ t: 0, b: RELAX }, { t: 0.2, b: wv(-1) }, { t: 0.45, b: wv(1) }, { t: 0.7, b: wv(-1) }, { t: 0.95, b: wv(1) }, { t: 1.25, b: RELAX }], { hipsKey: false }));
  // ---- ARGUE (upper overlay: animated gesturing, leaning in) ----
  const ag = (k) => ({ Spine: [['x', 8], ['y', k * 6]], Head: [['x', 6], ['y', -k * 8]], RightArm: [['z', 55], ['y', 40 + k * 10]], RightForeArm: [['y', 70 + k * 25]], LeftArm: [['z', -58], ['y', -35 + k * 8]], LeftForeArm: [['y', -60 + k * 20]] });
  clips.argue = upper(makeClip(rig, 'argue', [{ t: 0, b: ag(-1) }, { t: 0.35, b: ag(1) }, { t: 0.7, b: ag(-1) }, { t: 1.05, b: ag(1) }, { t: 1.4, b: ag(-1) }], { hipsKey: false }));

  // ---- HANDS UP / FLAIL while fleeing (upper body overlay) ----
  const upA = { LeftArm: [['z', 50], ['y', -10]], RightArm: [['z', -40], ['y', 15]], LeftForeArm: [['y', -50]], RightForeArm: [['y', 30]], Head: [['x', -8]] };
  const upB = { LeftArm: [['z', 40], ['y', 10]], RightArm: [['z', -52], ['y', -8]], LeftForeArm: [['y', -30]], RightForeArm: [['y', 55]], Head: [['x', -6]] };
  const hu = makeClip(rig, 'handsUp', [{ t: 0, b: upA }, { t: 0.3, b: upB }, { t: 0.6, b: upA }], { hipsKey: false });
  hu.userData = hu.userData || {}; hu.userData.upperOnly = true; clips.handsUp = hu;
  return clips;
}

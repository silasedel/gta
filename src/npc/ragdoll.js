// Active ragdolls (RAGDOLL track). Our own simple active-ragdoll system on Rapier:
//  - 15 dynamic capsules with a 75 kg human mass distribution (pelvis, abdomen, chest, head, upper / lower arms,
//    thighs, shins, feet).
//  - Anatomical joint limits enforced by the Rapier solver: spherical joints with per-axis swing / twist limits for the
//    spine, neck, shoulders, hips and ankles, revolute hinges for knees and elbows that only flex one way. Limits are
//    measured from the rig's rest (T) pose, so every body part's frame is "how far this bone has rotated from rest".
//  - Self collision through collision groups: torso, left arm, right arm, left leg and right leg are separate groups
//    that collide with each other (arms cannot pass through the torso, legs cannot pass through each other); jointed
//    neighbours skip contacts.
//  - Muscles: a stable (implicit) PD motor on every joint drives toward the animation pose at the moment of impact.
//    Torque impulses are applied in equal and opposite pairs, so muscles never push the body around. Strength fades
//    over 0.5 - 1.5 s depending on the kind and power of the hit; a joint-friction floor keeps nothing floppy forever.
//  - Reactions: balance on survivable hits (hit leg goes weak, the other braces, a capture-point stumble step and
//    leg / core support forces applied as internal force pairs between pelvis and planted feet), protective arms when
//    falling, per-height impact velocity for car hits so the legs are swept and the body rolls onto the hood.
//  - Settling: sleep detection; the dead are frozen (bodies removed, pose kept); the living report `settled` so the
//    caller can blend into a get-up clip, or `recovered` when they kept their feet.
//  - Physics runs in game.fixedHooks (every fixed substep). Hard cap on simultaneously simulated ragdolls (oldest
//    frozen first).
import * as THREE from 'three';

// key, bone, end bone, radius, parent, mass (kg), joint, collision class
const PARTS = [
  ['pelvis', 'Hips', 'Spine1', 0.11, null, 11.0, null, 'T'],
  ['abdomen', 'Spine1', 'Spine2', 0.10, 'pelvis', 10.0, 'spine', 'T'],
  ['chest', 'Spine2', 'Neck', 0.115, 'abdomen', 17.0, 'chest', 'T'],
  ['head', 'Head', 'HeadTop_End', 0.095, 'chest', 5.5, 'neck', 'T'],
  ['uArmL', 'LeftArm', 'LeftForeArm', 0.047, 'chest', 2.1, 'shoulderL', 'AL'], ['lArmL', 'LeftForeArm', 'LeftHand', 0.04, 'uArmL', 1.6, 'elbow', 'AL'],
  ['uArmR', 'RightArm', 'RightForeArm', 0.047, 'chest', 2.1, 'shoulderR', 'AR'], ['lArmR', 'RightForeArm', 'RightHand', 0.04, 'uArmR', 1.6, 'elbow', 'AR'],
  ['thighL', 'LeftUpLeg', 'LeftLeg', 0.068, 'pelvis', 8.0, 'hipL', 'LL'], ['shinL', 'LeftLeg', 'LeftFoot', 0.05, 'thighL', 3.7, 'knee', 'LL'], ['footL', 'LeftFoot', 'LeftToeBase', 0.04, 'shinL', 1.2, 'ankle', 'LL'],
  ['thighR', 'RightUpLeg', 'RightLeg', 0.068, 'pelvis', 8.0, 'hipR', 'LR'], ['shinR', 'RightLeg', 'RightFoot', 0.05, 'thighR', 3.7, 'knee', 'LR'], ['footR', 'RightFoot', 'RightToeBase', 0.04, 'shinR', 1.2, 'ankle', 'LR'],
];
// Anatomical limits in the parent's rest frame (X = character left, Y = up, Z = forward; right-hand rule).
// [xMin, xMax, yMin, yMax, zMin, zMax] in radians for spherical joints, [min, max] flexion for hinges.
//   spine/neck: +X flexes forward, Z bends sideways, Y twists.   hips: -X flexes the thigh forward, +Z moves the leg
//   to the character's left.   shoulders (arm along +-X in the T pose): Z raises / lowers, Y swings forward / back,
//   X twists the arm.   ankles: +X points the toes down.
const LIMITS = {
  spine: [-0.2, 0.55, -0.3, 0.3, -0.3, 0.3],
  chest: [-0.15, 0.45, -0.3, 0.3, -0.25, 0.25],
  neck: [-0.55, 0.7, -1.0, 1.0, -0.55, 0.55],
  shoulderL: [-1.4, 1.4, -1.7, 0.7, -1.5, 1.35],
  shoulderR: [-1.4, 1.4, -0.7, 1.7, -1.35, 1.5],
  hipL: [-2.0, 0.35, -0.5, 0.5, -0.3, 0.8],
  hipR: [-2.0, 0.35, -0.5, 0.5, -0.8, 0.3],
  ankle: [-0.4, 0.8, -0.3, 0.3, -0.3, 0.3],
  knee: [-0.03, 2.4],
  elbow: [-0.03, 2.5],
};
const BRACED = { hipL: [-2.0, 0.15, -0.5, 0.5, -0.3, 0.8], hipR: [-2.0, 0.15, -0.5, 0.5, -0.8, 0.3], spine: [-0.08, 0.55, -0.25, 0.25, -0.25, 0.25], chest: [-0.06, 0.45, -0.25, 0.25, -0.2, 0.2], neck: [-0.3, 0.7, -0.9, 0.9, -0.45, 0.45] };
// muscle natural frequency (rad/s) per joint type, and which fade group it belongs to
const MUSCLE = { spine: [15, 'core'], chest: [15, 'core'], neck: [13, 'neck'], shoulderL: [11, 'arm'], shoulderR: [11, 'arm'], elbow: [10, 'arm'], hipL: [15, 'leg'], hipR: [15, 'leg'], knee: [15, 'leg'], ankle: [12, 'leg'] };
// hinge fallback axes (rest frame) for straight limbs: positive rotation = flexion
const HINGE_AXIS = { shinL: [1, 0, 0], shinR: [1, 0, 0], lArmL: [0, -1, 0], lArmR: [0, 1, 0] };
const REST_PARENT = {
  Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', HeadTop_End: 'Head',
  LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot',
  RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot',
};
export const LIMB_PARTS = {
  head: 'head', neck: 'head', chest: 'chest', torso: 'chest', spine: 'abdomen', back: 'chest', stomach: 'abdomen', pelvis: 'pelvis', hips: 'pelvis',
  leftarm: 'uArmL', leftupperarm: 'uArmL', leftforearm: 'lArmL', lefthand: 'lArmL', rightarm: 'uArmR', rightupperarm: 'uArmR', rightforearm: 'lArmR', righthand: 'lArmR',
  leftleg: 'thighL', leftthigh: 'thighL', leftshin: 'shinL', leftcalf: 'shinL', leftfoot: 'footL', rightleg: 'thighR', rightthigh: 'thighR', rightshin: 'shinR', rightcalf: 'shinR', rightfoot: 'footR',
};
// collision groups: membership << 16 | filter. Bit 0x0004 (torso) stays the "flesh" bit other systems test for.
const G = { T: 0x0004, AL: 0x0008, AR: 0x0010, LL: 0x0020, LR: 0x0040 };
export const RAG_GROUP_MASK = 0x007c;
const WORLD_BITS = 0xffff & ~RAG_GROUP_MASK;
const groupsFor = (cls) => ((G[cls] << 16) | WORLD_BITS | (RAG_GROUP_MASK & ~G[cls])) >>> 0;
const AXIS = { x: 3, y: 4, z: 5 };
const GRAV = 9.81;

// how long muscles keep their strength, by kind of hit (seconds), harder hits fade faster
function fadeTime(kind, strength, lethal) {
  const s = THREE.MathUtils.clamp(strength ?? 0.6, 0, 1);
  if (kind === 'car' || kind === 'explosion') return 0.5 + 0.2 * (1 - s);
  if (kind === 'bullet') return lethal ? 0.75 - 0.25 * s : 0.9 - 0.3 * s;
  if (kind === 'fall') return 1.0;
  return 1.5 - 0.5 * s; // melee / push
}
const lethalOpt = (o) => o.lethal !== false;
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const vec = (v) => new THREE.Vector3(v.x, v.y, v.z);
const quat = (r) => new THREE.Quaternion(r.x, r.y, r.z, r.w);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
// world rotation vector (axis * angle) that takes orientation a to orientation b
function rotErr(a, b, out) {
  _q3.copy(b).multiply(_q.copy(a).invert());
  if (_q3.w < 0) { _q3.x = -_q3.x; _q3.y = -_q3.y; _q3.z = -_q3.z; _q3.w = -_q3.w; }
  const s = Math.sqrt(Math.max(0, 1 - _q3.w * _q3.w));
  if (s < 1e-6) return out.set(_q3.x * 2, _q3.y * 2, _q3.z * 2);
  const ang = 2 * Math.acos(Math.min(1, _q3.w));
  return out.set(_q3.x / s * ang, _q3.y / s * ang, _q3.z / s * ang);
}
// frame with Y along `dir` and X as close as possible to `side`
function segFrame(dir, side) {
  const y = dir.clone().normalize();
  let x = side.clone().addScaledVector(y, -side.dot(y));
  if (x.lengthSq() < 1e-6) { x = new THREE.Vector3(0, 0, 1).addScaledVector(y, -y.z); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); }
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export function createRagdollSystem(game, maxActive = 6) {
  const { world, RAPIER } = game;
  const active = [];
  const stats = { started: 0, frozen: 0, evicted: 0, recovered: 0 };

  function freeze(rd) {
    if (!rd || rd.frozen) return;
    try { chestForward(rd); } catch (e) { /* ignore */ }
    rd.frozen = true; rd.settled = true;
    rd.worldPose = rd.parts.map((p) => ({ b: p.bone, m: p.bone.matrixWorld.clone() }));
    for (const p of rd.parts) { try { world.removeRigidBody(p.body); } catch (e) { /* ignore */ } }
    const i = active.indexOf(rd); if (i >= 0) active.splice(i, 1);
    stats.frozen++;
  }
  function remove(rd) {
    if (!rd) return;
    freeze(rd);
    rd.meshes.forEach((m) => { m.frustumCulled = true; });
  }

  // rest-pose world rotation of every bone (current root placement), from the rig's rest locals
  function restWorld(character) {
    if (!character.getRest) return null;
    const hips = character.getBone('Hips'); if (!hips) return null;
    const base = hips.parent.getWorldQuaternion(new THREE.Quaternion());
    const out = {};
    const get = (n) => {
      if (out[n]) return out[n];
      const r = character.getRest(n); if (!r) return null;
      const par = n === 'Hips' ? base : get(REST_PARENT[n]);
      if (!par) return null;
      return (out[n] = par.clone().multiply(r.q));
    };
    for (const n of ['Hips', ...Object.keys(REST_PARENT)]) get(n);
    return out.Hips ? out : null;
  }

  /**
   * opts: { vel:{x,y,z}, spin, hit:{ point, impulse, part? }, kind:'melee'|'bullet'|'car'|'explosion'|'fall',
   *         strength 0..1, lethal, balance (try to keep the feet), massScale }
   */
  function start(character, opts = {}) {
    if (!world || !RAPIER || !character?.getBone) return null;
    while (active.length >= maxActive) { freeze(active[0]); stats.evicted++; }
    character.root.updateMatrixWorld(true);
    const kind = opts.kind || (opts.vel && Math.hypot(opts.vel.x, opts.vel.z) > 4 ? 'car' : 'melee');
    const lethal = opts.lethal !== false; // callers say so; unknown = dead (no protective reflexes)
    const strength = opts.strength ?? 0.7;
    const vel = opts.vel || { x: 0, y: 0, z: 0 };
    const rootQ = character.root.getWorldQuaternion(new THREE.Quaternion());
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ); // character faces +Z, its left is +X
    const rest = restWorld(character);
    const massScale = opts.massScale || 1;
    const parts = []; const byKey = {};
    const feetY = [];
    for (const n of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) { const b = character.getBone(n); if (b) feetY.push(b.getWorldPosition(_v).y); }
    const groundY = feetY.length ? Math.min(...feetY) - 0.05 : character.root.position.y;
    try {
      for (const [key, bn, en, rad, parentKey, mass0, jt, cls] of PARTS) {
        const bone = character.getBone(bn);
        if (!bone) continue;
        const a = bone.getWorldPosition(new THREE.Vector3());
        const endB = character.getBone(en);
        let b;
        if (endB) b = endB.getWorldPosition(new THREE.Vector3());
        else if (key === 'head') { const nk = character.getBone('Neck'); const nb = nk ? nk.getWorldPosition(new THREE.Vector3()) : a.clone().addScaledVector(UP, -0.1); b = a.clone().add(a.clone().sub(nb).normalize().multiplyScalar(0.2)); }
        else if (key.startsWith('foot')) b = a.clone().add(new THREE.Vector3(0, 0, 0.14).applyQuaternion(rootQ)).setY(groundY + 0.04);
        else continue;
        if (key.startsWith('lArm')) { const hd = character.getBone(bn.replace('ForeArm', 'Hand')); if (hd) b.addScaledVector(b.clone().sub(a).normalize(), 0.07); } // forearm capsule covers the hand
        const dir = b.clone().sub(a); let len = dir.length(); if (len < 0.02) { len = 0.1; dir.set(0, 1, 0); } dir.normalize();
        const mass = mass0 * massScale;
        // body orientation: rotation of the bone away from its rest pose, applied to the root frame
        bone.getWorldQuaternion(_q2);
        let B;
        if (rest && rest[bn]) B = _q2.clone().multiply(rest[bn].clone().invert()).multiply(rootQ);
        else B = segFrame(dir, left).multiply(segFrame(new THREE.Vector3(0, 1, 0).applyQuaternion(rootQ), left).invert()).multiply(rootQ); // fallback: impact pose is neutral
        const pa = parentKey ? byKey[parentKey] : null;
        let hingeAxis = null, hinge0 = 0, hingeLim = null;
        if (pa && (jt === 'knee' || jt === 'elbow')) {
          // hinge: child frame = parent frame turned about the flexion axis only (forearm / shin twist goes to the bone offset)
          const pDir = pa.dir; const fb = HINGE_AXIS[key];
          const fallbackW = new THREE.Vector3(fb[0], fb[1], fb[2]).applyQuaternion(pa.B0);
          let ax = new THREE.Vector3().crossVectors(pDir, dir);
          const ang = Math.acos(THREE.MathUtils.clamp(pDir.dot(dir), -1, 1));
          if (ang < 0.12 || ax.lengthSq() < 1e-6 || ax.clone().normalize().dot(fallbackW) < 0.3) { ax = fallbackW.clone(); hinge0 = ang * Math.sign(new THREE.Vector3().crossVectors(pDir, dir).dot(ax) || 1); }
          else { ax.normalize(); hinge0 = ang; }
          hingeAxis = ax.clone().applyQuaternion(pa.B0.clone().invert()).normalize(); // parent-local
          B = pa.B0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(hingeAxis, hinge0));
        }
        const center = a.clone().addScaledVector(dir, len * 0.5);
        let colQ, half;
        if (key === 'pelvis' || key === 'chest') {
          // wide torso pieces: capsule across the body (left-right)
          const across = left.clone();
          const up = dir.clone();
          center.copy(a).addScaledVector(up, key === 'pelvis' ? len * 0.15 : len * 0.42);
          colQ = segFrame(across, up);
          half = key === 'pelvis' ? 0.075 : 0.085;
        } else { colQ = segFrame(dir, left); half = Math.max(0.02, len * 0.5 - rad * 0.6); }
        const lv = new THREE.Vector3(vel.x, vel.y, vel.z);
        if (kind === 'car') {
          // bumper sweeps the legs, the upper body lags behind: the body rotates onto the hood
          const h = center.y - groundY, f = THREE.MathUtils.clamp(1 - (h - 0.55) / 0.85, 0.18, 1);
          lv.set(vel.x * f, vel.y * (0.4 + 0.8 * f), vel.z * f);
        }
        const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(center.x, center.y, center.z).setRotation({ x: B.x, y: B.y, z: B.z, w: B.w })
          .setLinvel(lv.x, lv.y, lv.z).setLinearDamping(0.05).setAngularDamping(key.startsWith('foot') ? 3 : key.startsWith('lArm') || key === 'head' ? 1.0 : 0.5)
          .setCcdEnabled(kind === 'car' || kind === 'explosion').setCanSleep(true);
        try { desc.setAdditionalSolverIterations?.(kind === 'car' || kind === 'explosion' ? 6 : 2); } catch (e) { /* older rapier */ }
        const body = world.createRigidBody(desc);
        const Binv = B.clone().invert();
        const cq = Binv.clone().multiply(colQ);
        const col = RAPIER.ColliderDesc.capsule(half, rad).setMass(mass).setFriction(0.8).setRestitution(0.02)
          .setRotation({ x: cq.x, y: cq.y, z: cq.z, w: cq.w })
          .setCollisionGroups(groupsFor(cls));
        world.createCollider(col, body);
        bone.matrixWorld.decompose(_p, _q2, _s);
        const part = {
          key, bone, body, cls, mass, jt, len, rad, dir: dir.clone(), B0: B.clone(), c0: center.clone(), anchor: a.clone(),
          offQ: Binv.clone().multiply(_q2), offP: _p.clone().sub(center).applyQuaternion(Binv), scale: _s.clone(),
          axisL: new THREE.Vector3(0, 1, 0).applyQuaternion(cq), twistK: Math.min(1, (rad * rad / 2) / ((len * len) / 12 + rad * rad / 4)),
          parent: null, joint: null, rel0: null, relT: null, gain: 1, Ired: 1, wn: 0, group: 'core', hingeAxis, hingeLim: null,
        };
        if (pa) {
          part.parent = pa;
          const a1 = a.clone().sub(pa.c0).applyQuaternion(pa.B0.clone().invert());
          const a2 = a.clone().sub(center).applyQuaternion(Binv);
          let jd;
          if (hingeAxis) {
            jd = RAPIER.JointData.revolute({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z }, { x: hingeAxis.x, y: hingeAxis.y, z: hingeAxis.z });
            const L = LIMITS[jt];
            jd.limitsEnabled = true; jd.limits = [Math.min(L[0], hinge0 - 0.05), Math.max(L[1], hinge0 + 0.05)]; hingeLim = jd.limits.slice();
          } else jd = RAPIER.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z });
          const j = world.createImpulseJoint(jd, pa.body, body, true);
          try { j.setContactsEnabled(false); } catch (e) { /* ignore */ }
          part.rel0 = pa.B0.clone().invert().multiply(B);
          if (!hingeAxis && LIMITS[jt] && rest) {
            // per-axis swing / twist limits; widened if the animation pose already sits outside them (no pop)
            // a person bracing against a blow (balance mode) holds the trunk: much less back extension than a limp body
            const L = opts.balance && BRACED[jt] ? BRACED[jt] : LIMITS[jt], r = part.rel0.w < 0 ? part.rel0.clone().set(-part.rel0.x, -part.rel0.y, -part.rel0.z, -part.rel0.w) : part.rel0;
            const cur = [2 * Math.asin(THREE.MathUtils.clamp(r.x, -1, 1)), 2 * Math.asin(THREE.MathUtils.clamp(r.y, -1, 1)), 2 * Math.asin(THREE.MathUtils.clamp(r.z, -1, 1))];
            ['x', 'y', 'z'].forEach((k, i) => {
              const lo = Math.min(L[i * 2], cur[i] - 0.05), hi = Math.max(L[i * 2 + 1], cur[i] + 0.05);
              try { j.rawSet.jointSetLimits(j.handle, AXIS[k], lo, hi); } catch (e) { /* ignore */ }
            });
          }
          part.joint = j; part.hingeLim = hingeLim;
          part.relT = part.rel0.clone();
          const M = MUSCLE[jt] || [12, 'core']; part.wn = M[0]; part.group = M[1];
        }
        parts.push(part); byKey[key] = part;
      }
    } catch (e) {
      console.warn('[ragdoll] build failed', e);
      for (const p of parts) { try { world.removeRigidBody(p.body); } catch (e2) { /* ignore */ } }
      return null;
    }
    if (parts.length < 6) { for (const p of parts) world.removeRigidBody(p.body); return null; }
    // effective (reduced) inertia per joint: subtree about the joint vs the rest of the body about the joint
    const kids = (p) => parts.filter((c) => { for (let x = c; x; x = x.parent) if (x === p) return true; return false; });
    let Mtot = 0; for (const p of parts) Mtot += p.mass;
    for (const p of parts) {
      if (!p.parent) continue;
      const sub = new Set(kids(p)); let Ic = 0, Ip = 0;
      for (const q of parts) {
        const I = q.mass * ((q.len * q.len) / 12 + q.rad * q.rad / 4) + q.mass * q.c0.distanceToSquared(p.anchor);
        if (sub.has(q)) Ic += I; else Ip += I;
      }
      // the torque acts on the child body first and reaches the rest of the chain through the joint solver; capping the
      // effective inertia at a few times the child's own keeps the impulses inside what 4+2 solver iterations resolve
      const Icom = p.mass * ((p.len * p.len) / 12 + p.rad * p.rad / 4);
      p.Ired = Math.max(0.002, Math.min((Ic * Ip) / (Ic + Ip), Icom * 1.5));
      p.sub = [...sub];
    }
    if (opts.spin && byKey.pelvis && kind !== 'car') byKey.pelvis.body.setAngvel({ x: (Math.random() - 0.5) * opts.spin, y: (Math.random() - 0.5) * opts.spin * 0.5, z: (Math.random() - 0.5) * opts.spin }, true);
    let hitPart = null;
    if (opts.hit && opts.hit.impulse) {
      let tgt = opts.hit.part && byKey[opts.hit.part];
      const pt = opts.hit.point;
      if (!tgt && pt) { let bd = Infinity; for (const p of parts) { const t = p.body.translation(); const d = (t.x - pt.x) ** 2 + (t.y - pt.y) ** 2 + (t.z - pt.z) ** 2; if (d < bd) { bd = d; tgt = p; } } }
      if (tgt) {
        hitPart = tgt;
        // a braced (balancing) body is stiff: most of the blow moves the whole person, so they step instead of folding
        const share = opts.balance && !lethalOpt(opts) ? 0.35 : 1;
        const I = { x: opts.hit.impulse.x * share, y: opts.hit.impulse.y * share, z: opts.hit.impulse.z * share };
        try { if (pt) tgt.body.applyImpulseAtPoint(I, { x: pt.x, y: pt.y, z: pt.z }, true); else tgt.body.applyImpulse(I, true); } catch (e) { /* ignore */ }
        if (share < 1) { let M = 0; for (const p of parts) M += p.mass; const k = (1 - share) / M; for (const p of parts) p.body.applyImpulse({ x: opts.hit.impulse.x * k * p.mass, y: opts.hit.impulse.y * k * p.mass, z: opts.hit.impulse.z * k * p.mass }, true); }
      }
    }
    const meshes = []; character.model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; meshes.push(o); } });
    // which leg was hit / is on the side of the blow: it goes weak, the other braces
    let weak = 'L';
    {
      const d = opts.hit?.impulse ? vec(opts.hit.impulse).setY(0) : new THREE.Vector3(vel.x, 0, vel.z);
      const side = opts.hit?.point ? opts.hit.point.clone().sub(byKey.pelvis.c0).dot(left) : 0;
      if (hitPart && /R$/.test(hitPart.key)) weak = 'R'; else if (hitPart && /L$/.test(hitPart.key)) weak = 'L';
      else if (Math.abs(side) > 0.04) weak = side > 0 ? 'L' : 'R';
      else weak = d.dot(left) > 0 ? 'R' : 'L';
    }
    const balance = !!opts.balance && !lethal && !!byKey.footL && !!byKey.footR;
    const rd = {
      parts, byKey, meshes, age: 0, still: 0, frozen: false, settled: false, recovered: false, character, kind, lethal, strength,
      fade: fadeTime(kind, strength, lethal), floor: lethal ? 0 : 0.12, mode: balance ? 'balance' : 'fall', modeT: 0,
      weak, brace: weak === 'L' ? 'R' : 'L', groundY, h0: byKey.pelvis.c0.y - groundY, Mtot, step: null, protect: !lethal,
      severity: THREE.MathUtils.clamp(Math.hypot(vel.x, vel.z) / 3 + (opts.hit?.impulse ? vec(opts.hit.impulse).length() / 120 : 0), 0, 1),
    };
    active.push(rd); stats.started++;
    return rd;
  }

  // ---------------- muscles (every fixed substep)
  const _e = new THREE.Vector3(), _w = new THREE.Vector3(), _tq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _cq = new THREE.Quaternion();
  function strengthOf(rd, p) {
    if (rd.mode === 'balance') return p.gain;
    const t = rd.modeT;
    let F = rd.fade;
    if (rd.lethal && p.group === 'leg') F *= 0.6;       // the dead crumple: legs give out first
    else if (rd.lethal && p.group === 'arm') F *= 0.8;
    else if (p.group === 'neck') F *= 1.15;
    const s = rd.floor + (1 - rd.floor) * (1 - smooth(t / F));
    return s * p.gain;
  }
  function muscles(rd, h) {
    for (const p of rd.parts) {
      const pa = p.parent; if (!pa) continue;
      if (p.body.isSleeping() && pa.body.isSleeping()) continue;
      const s = strengthOf(rd, p);
      const wn = p.wn, kp = s * wn * wn, kd = 2 * 0.9 * wn * Math.sqrt(s) + (rd.lethal ? 2.0 : 3.0); // joint friction floor
      _pq.copy(quat(pa.body.rotation())); _cq.copy(quat(p.body.rotation()));
      _tq.copy(_pq).multiply(p.relT);
      rotErr(_cq, _tq, _e);
      const wc = p.body.angvel(), wp = pa.body.angvel();
      _w.set(wc.x - wp.x, wc.y - wp.y, wc.z - wp.z);
      // implicit PD: alpha = (kp e - (kp h + kd) w) / (1 + kd h + kp h^2)
      const den = 1 + kd * h + kp * h * h;
      _v.copy(_e).multiplyScalar(kp).addScaledVector(_w, -(kp * h + kd)).multiplyScalar(p.Ired * h / den);
      if (!Number.isFinite(_v.x + _v.y + _v.z)) continue;
      if (_v.lengthSq() < 1e-10) continue;
      // a thin capsule has far less inertia about its own long axis: scale the twist part down to match (no spinning feet)
      if (p.twistK < 0.9 && p.key !== 'pelvis' && p.key !== 'chest') {
        _v2.copy(p.axisL).applyQuaternion(_cq); const tw = _v.dot(_v2);
        _v.addScaledVector(_v2, -tw * (1 - p.twistK));
      }
      p.body.applyTorqueImpulse({ x: _v.x, y: _v.y, z: _v.z }, false); // never wakes a sleeping body
      pa.body.applyTorqueImpulse({ x: -_v.x, y: -_v.y, z: -_v.z }, false);
    }
  }
  const footDown = (rd, f) => { const t = f.body.translation(); return t.y - rd.groundY < 0.16; };
  // balance: legs carry the weight, the core keeps the torso upright, a stumble step catches the fall
  function balanceForces(rd, h) {
    const P = rd.byKey.pelvis, C = rd.byKey.chest;
    const fL = rd.byKey.footL, fR = rd.byKey.footR;
    const planted = [fL, fR].filter((f) => footDown(rd, f) && !(rd.step && rd.step.foot === f && rd.step.t < rd.step.dur));
    const sup = (1 - smooth((rd.modeT - 1.2) / 0.5)) * (1 - 0.35 * rd.severity);
    if (!planted.length || sup <= 0) return;
    const M = rd.Mtot, pt = P.body.translation(), pv = P.body.linvel();
    const hgt = pt.y - rd.groundY;
    // legs: vertical support (internal pair pelvis <-> planted feet)
    let Fy = M * (GRAV * 0.95 + 70 * (rd.h0 - hgt) - 14 * pv.y);
    Fy = THREE.MathUtils.clamp(Fy, 0, 1.6 * M * GRAV) * sup;
    // horizontal: legs push against the motion of the centre of mass (bounded by friction)
    // horizontal: hip / ankle strategy, legs pull the centre of mass back over the feet (bounded by friction)
    const cv = comVel(rd).clone(), cp = comPos(rd, _c);
    let sx = 0, sz = 0; for (const f of [fL, fR]) { const t = f.body.translation(); sx += t.x / 2; sz += t.z / 2; }
    let Fx = -M * (14 * (cp.x - sx) + 3 * cv.x) * sup, Fz = -M * (14 * (cp.z - sz) + 3 * cv.z) * sup;
    const fh = Math.hypot(Fx, Fz), fmax = 0.6 * Fy; if (fh > fmax) { Fx *= fmax / fh; Fz *= fmax / fh; }
    P.body.applyImpulse({ x: Fx * h, y: Fy * h, z: Fz * h }, true);
    for (const f of planted) f.body.applyImpulse({ x: -Fx * h / planted.length, y: -Fy * h / planted.length, z: -Fz * h / planted.length }, true);
    // core: keep pelvis and chest upright
    for (const [b, I] of [[P, 3.5], [C, 3.2]]) {
      const up = _v2.set(0, 1, 0).applyQuaternion(quat(b.body.rotation()));
      _v3.crossVectors(up, UP); // tilt axis * sin
      const w = b.body.angvel();
      const kp = 90 * sup, kd = 16 * sup;
      b.body.applyTorqueImpulse({ x: (kp * _v3.x - kd * w.x) * I * h, y: (-kd * 0.5 * w.y) * I * h, z: (kp * _v3.z - kd * w.z) * I * h }, true);
    }
    // stumble step: the unloaded (weak) foot is carried to the capture point
    const st = rd.step;
    if (st && st.t < st.dur) {
      st.t += h;
      const f = st.foot, ft = f.body.translation(), fv = f.body.linvel();
      const k = Math.min(1, st.t / st.dur);
      const tx = st.from.x + (st.to.x - st.from.x) * smooth(k), tz = st.from.z + (st.to.z - st.from.z) * smooth(k);
      const ty = rd.groundY + 0.06 + Math.sin(Math.PI * k) * 0.12;
      const sh = f.parent, m = f.mass + (sh ? sh.mass : 0); // carried lower leg: force shared by shin and foot (no flick)
      const Fsx = m * (160 * (tx - ft.x) - 22 * fv.x), Fsy = m * (160 * (ty - ft.y) - 22 * fv.y), Fsz = m * (160 * (tz - ft.z) - 22 * fv.z);
      const kf = sh ? f.mass / m : 1;
      f.body.applyImpulse({ x: Fsx * h * kf, y: Fsy * h * kf, z: Fsz * h * kf }, true);
      if (sh) sh.body.applyImpulse({ x: Fsx * h * (1 - kf), y: Fsy * h * (1 - kf), z: Fsz * h * (1 - kf) }, true);
      P.body.applyImpulse({ x: -Fsx * h, y: -Fsy * h, z: -Fsz * h }, true);
    }
  }
  function comVel(rd) {
    let x = 0, y = 0, z = 0;
    for (const p of rd.parts) { const v = p.body.linvel(); x += v.x * p.mass; y += v.y * p.mass; z += v.z * p.mass; }
    return _s.set(x / rd.Mtot, y / rd.Mtot, z / rd.Mtot);
  }
  function comPos(rd, out) {
    out.set(0, 0, 0);
    for (const p of rd.parts) { const t = p.body.translation(); out.x += t.x * p.mass; out.y += t.y * p.mass; out.z += t.z * p.mass; }
    return out.multiplyScalar(1 / rd.Mtot);
  }
  // hinge guard: under heavy contact (a car on the legs) the solver can be overpowered and a knee / elbow pushed past
  // its limit. Remove the child's relative spin that drives it further out and pull it back, every substep.
  function hingeGuard(rd) {
    for (const p of rd.parts) {
      if (!p.hingeLim || p.body.isSleeping()) continue;
      const a = relAngle(p), lo = p.hingeLim[0], hi = p.hingeLim[1];
      const over = a > hi ? a - hi : a < lo ? a - lo : 0;
      if (Math.abs(over) < 0.02) continue;
      _v2.copy(p.hingeAxis).applyQuaternion(quat(p.parent.body.rotation())); // world hinge axis
      const wc = p.body.angvel(), wp = p.parent.body.angvel();
      const rel = (wc.x - wp.x) * _v2.x + (wc.y - wp.y) * _v2.y + (wc.z - wp.z) * _v2.z;
      let dw = 0;
      if (rel * over > 0) dw -= rel;           // stop moving further past the limit
      dw -= over * 12;                          // and come back (rad/s)
      p.body.setAngvel({ x: wc.x + _v2.x * dw, y: wc.y + _v2.y * dw, z: wc.z + _v2.z * dw }, true);
    }
  }
  function ragdollFixed(h) {
    for (const rd of active) {
      if (rd.frozen) continue;
      try {
        hingeGuard(rd);
        muscles(rd, h);
        if (rd.mode === 'balance') balanceForces(rd, h);
      } catch (e) { /* body removed mid-step */ }
    }
  }
  if (Array.isArray(game.fixedHooks)) game.fixedHooks.push(ragdollFixed);

  // ---------------- behaviour (per frame): targets, step planning, falling, settling
  const _c = new THREE.Vector3();
  function setArmReach(rd, side, dirW, elbowFlex, gain) {
    const U = rd.byKey['uArm' + side], L = rd.byKey['lArm' + side], ch = rd.byKey.chest;
    if (!U || !ch) return;
    const ur = quat(U.body.rotation());
    const cur = new THREE.Vector3(0, 1, 0).applyQuaternion(ur).normalize(); // body Y is not the arm axis: use the anchor -> elbow direction
    const ut = U.body.translation(), ua = U.anchor.clone().sub(U.c0).applyQuaternion(U.B0.clone().invert()).applyQuaternion(ur).add(vec(ut));
    cur.copy(vec(ut)).sub(ua).normalize();
    const R = new THREE.Quaternion().setFromUnitVectors(cur, dirW.clone().normalize());
    const tgtW = R.multiply(ur);
    U.relT.copy(quat(ch.body.rotation()).invert().multiply(tgtW)); U.gain = gain;
    if (L && L.hingeAxis) { L.relT.setFromAxisAngle(L.hingeAxis, elbowFlex); L.gain = gain; }
  }
  function behave(rd, dt) {
    const P = rd.byKey.pelvis, C = rd.byKey.chest;
    const chestUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quat(C.body.rotation())).y;
    const hgt = P.body.translation().y - rd.groundY;
    if (rd.mode === 'balance') {
      const legs = { L: ['thighL', 'shinL', 'footL'], R: ['thighR', 'shinR', 'footR'] };
      const t = rd.modeT;
      // hit leg goes weak for a moment (knee gives), the other braces
      const weakK = t < 0.35 ? 0.4 : 1;
      for (const k of legs[rd.weak]) rd.byKey[k].gain = weakK;
      for (const k of legs[rd.brace]) rd.byKey[k].gain = 1.35;
      const wk = rd.byKey['shin' + rd.weak];
      if (wk?.hingeAxis) wk.relT.setFromAxisAngle(wk.hingeAxis, Math.min(2.3, wk.rel0Flex ??= relAngle(wk)) + (t < 0.35 ? 0.35 : 0));
      // plan one (or two) stumble steps toward the capture point
      const cv = comVel(rd).clone(), cp = comPos(rd, _c);
      const vh = Math.hypot(cv.x, cv.z);
      const tc = Math.sqrt(Math.max(0.5, rd.h0 + 0.1) / GRAV);
      const cap = new THREE.Vector3(cp.x + cv.x * tc, 0, cp.z + cv.z * tc);
      const fLp = rd.byKey.footL.body.translation(), fRp = rd.byKey.footR.body.translation();
      const sup = new THREE.Vector3((fLp.x + fRp.x) / 2, 0, (fLp.z + fRp.z) / 2);
      const off = cap.clone().sub(sup);
      if ((!rd.step || (rd.step.t >= rd.step.dur + 0.05 && (rd.steps || 0) < 3)) && t > 0.08 && (off.length() > 0.16 || vh > 0.45)) {
        // first step with the weak (unloaded) leg, then whichever foot is further from the capture point
        let footKey = 'foot' + rd.weak;
        if (rd.step) { const dL = Math.hypot(fLp.x - cap.x, fLp.z - cap.z), dR = Math.hypot(fRp.x - cap.x, fRp.z - cap.z); footKey = dL > dR ? 'footL' : 'footR'; }
        const f = rd.byKey[footKey], ft = f.body.translation();
        const to = cap.clone().addScaledVector(off.clone().normalize(), 0.06);
        const reach = to.clone().sub(new THREE.Vector3(ft.x, 0, ft.z)); if (reach.length() > 0.7) reach.setLength(0.7);
        rd.step = { foot: f, from: new THREE.Vector3(ft.x, 0, ft.z), to: new THREE.Vector3(ft.x, 0, ft.z).add(reach), t: 0, dur: 0.26 };
        rd.steps = (rd.steps || 0) + 1;
        // the stepping leg goes soft so the step is not fought by its own muscles
        for (const k of legs[footKey.slice(-1)]) rd.byKey[k].gain = 0.35;
      }
      // fell anyway? -> fall mode. kept the feet and calmed down? -> recovered
      if (chestUp < 0.55 || hgt < 0.62 * rd.h0) { rd.mode = 'fall'; rd.modeT = 0; rd.fade = 0.9; rd.floor = 0.12; for (const p of rd.parts) p.gain = 1; }
      else if (t > 0.85 && vh < 0.35 && chestUp > 0.85 && (!rd.step || rd.step.t >= rd.step.dur)) { rd.recovered = true; stats.recovered++; }
      else if (t > 2.2) { rd.mode = 'fall'; rd.modeT = 0; rd.fade = 0.9; rd.floor = 0.12; }
      return;
    }
    // falling: arms reach out to break the fall, chin tucks; once the hands land, the arms soften
    if (rd.protect) {
      const cv = comVel(rd);
      const falling = hgt > 0.35 * rd.h0 && rd.modeT < 1.6;
      if (falling) {
        let fd = new THREE.Vector3(cv.x, 0, cv.z);
        if (fd.lengthSq() < 0.04) fd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat(C.body.rotation())).setY(0);
        if (fd.lengthSq() < 1e-4) fd.set(0, 0, 1);
        fd.normalize();
        const fwdBody = new THREE.Vector3(0, 0, 1).applyQuaternion(quat(C.body.rotation())).setY(0).normalize();
        const back = fwdBody.dot(fd) < -0.3;
        const leftW = new THREE.Vector3(1, 0, 0).applyQuaternion(quat(C.body.rotation()));
        for (const s of ['L', 'R']) {
          const d = fd.clone().multiplyScalar(back ? 0.45 : 0.75).add(new THREE.Vector3(0, -0.85, 0)).addScaledVector(leftW, (s === 'L' ? 1 : -1) * (back ? 0.55 : 0.25));
          setArmReach(rd, s, d, back ? 0.2 : 0.35, 1.6);
        }
        const H = rd.byKey.head; if (H && back) { H.relT.copy(H.rel0).multiply(_q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45)); H.gain = 1.4; }
      } else if (!rd.protectDone) {
        rd.protectDone = true;
        for (const s of ['L', 'R']) { const U = rd.byKey['uArm' + s], L = rd.byKey['lArm' + s]; if (U) U.gain = 0.5; if (L) L.gain = 0.5; }
      }
    }
  }
  function relAngle(p) { const r = p.parent ? quat(p.parent.body.rotation()).invert().multiply(quat(p.body.rotation())) : null; if (!r) return 0; if (r.w < 0) r.set(-r.x, -r.y, -r.z, -r.w); const s = Math.sqrt(Math.max(0, 1 - r.w * r.w)); const ang = 2 * Math.acos(Math.min(1, r.w)); return s < 1e-5 ? 0 : ang * Math.sign(r.x * p.hingeAxis.x + r.y * p.hingeAxis.y + r.z * p.hingeAxis.z); }

  function drive(rd) {
    for (const p of rd.parts) {
      const t = p.body.translation(), r = p.body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      _q2.copy(_q).multiply(p.offQ);
      _p.copy(p.offP).applyQuaternion(_q).add(_v.set(t.x, t.y, t.z));
      _m.compose(_p, _q2, p.scale);
      _m2.copy(p.bone.parent.matrixWorld).invert().multiply(_m);
      _m2.decompose(p.bone.position, p.bone.quaternion, p.bone.scale);
      p.bone.updateMatrixWorld(true);
    }
  }

  function update(dt) {
    for (const rd of active.slice()) {
      rd.age += dt; rd.modeT += dt;
      try { behave(rd, dt); } catch (e) { console.warn('[ragdoll] behave', e); }
      drive(rd);
      let maxV = 0, maxW = 0, asleep = true;
      for (const p of rd.parts) {
        const v = p.body.linvel(), w = p.body.angvel();
        maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z)); maxW = Math.max(maxW, Math.hypot(w.x, w.y, w.z));
        if (!p.body.isSleeping()) asleep = false;
      }
      if (!Number.isFinite(maxV) || maxV > 70) { rd.why = 'blowup ' + maxV; console.warn('[ragdoll] unstable, frozen', maxV); freeze(rd); continue; }
      if (rd.mode === 'balance') { rd.still = 0; continue; }
      // car victims: once down on the road the tumble is damped hard (no cartwheeling across the street)
      if ((rd.kind === 'car' || rd.kind === 'explosion') && !rd.landDamped && rd.modeT > 0.6 && rd.byKey.pelvis.body.translation().y - rd.groundY < 0.45) {
        rd.landDamped = true; for (const p of rd.parts) p.body.setAngularDamping(2.2);
      }
      // settled = the body has stopped travelling (small limbs may still twitch a little)
      rd.still = (maxV < 0.2 && maxW < 2.5) || asleep ? rd.still + dt : 0;
      rd.settled = rd.still > 0.3 && rd.modeT > 0.6;
      if ((rd.lethal && (rd.still > 0.6 || asleep)) || rd.age > 12) { rd.why = 'settled ' + rd.age.toFixed(2); freeze(rd); }
      else if (!rd.lethal && rd.age > 8) freeze(rd);
    }
  }
  function pelvisPos(rd) { if (!rd || rd.frozen) return null; const p = rd.byKey?.pelvis; return p ? p.body.translation() : null; }
  // body frames: X = character left, Y = up, Z = forward (at rest)
  function chestForward(rd) {
    const ch = rd?.byKey?.chest; if (!ch) return null;
    if (rd.frozen) return rd.lastChestFwd || null;
    return (rd.lastChestFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat(ch.body.rotation())));
  }
  // pose summary for get-up / recovery: pelvis + head world positions, lying face up?, facing yaw
  function poseInfo(rd) {
    if (!rd) return null;
    const pel = rd.byKey.pelvis, hd = rd.byKey.head || rd.byKey.chest;
    if (!pel || !hd) return null;
    const f = chestForward(rd);
    return { pelvis: pel.bone.getWorldPosition(new THREE.Vector3()), head: hd.bone.getWorldPosition(new THREE.Vector3()), faceUp: f ? f.y > 0 : true, heading: f ? Math.atan2(f.x, f.z) : 0 };
  }
  // hand the pose back to animation: the caller has already moved / turned character.root to where the body lies or
  // stands; re-express the bones under the new root from the bodies (so a pose snapshot taken next has no offset pop),
  // then release the bodies
  function handoff(rd) {
    if (!rd) return;
    if (!rd.frozen) { try { rd.character.root.updateMatrixWorld(true); drive(rd); } catch (e) { /* ignore */ } }
    else if (rd.worldPose) { try { rd.character.root.updateMatrixWorld(true); for (const w of rd.worldPose) { _m2.copy(w.b.parent.matrixWorld).invert().multiply(w.m); _m2.decompose(w.b.position, w.b.quaternion, w.b.scale); w.b.updateMatrixWorld(true); } } catch (e) { /* ignore */ } }
    remove(rd);
  }
  const isSettled = (rd) => !!rd && (rd.frozen || rd.settled);
  // ready to get up: lying still for half a second (the get-up starts from a settled pose, not from a timer)
  const readyToGetUp = (rd) => !!rd && !rd.lethal && (rd.frozen || (rd.settled && rd.still > 0.5));
  return { start, update, remove, handoff, readyToGetUp, freeze, pelvisPos, poseInfo, chestForward, isSettled, active, stats, maxActive };
}

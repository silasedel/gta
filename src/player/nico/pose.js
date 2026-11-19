// Southline V2 — Nico's relaxed-stance layer (CHARACTER track). Runs after the animation mixer each frame and corrects
// the v1 clips' stiff wide A-stance in world space (independent of each bone's local axes): arms hang close to the body
// with soft elbows and curled fingers, shoulders drop, feet come in under the hips, a slight weight shift onto one leg.
// Full strength standing still; arms keep part of the correction while walking; off for driving, swimming, special idles.
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _qd = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// rotate a bone by a world-space rotation (axis, angle) about its own pivot
function rotateWorld(bone, axis, angle) {
  if (!bone || !bone.parent || Math.abs(angle) < 1e-5) return;
  _qd.setFromAxisAngle(axis, angle);
  bone.getWorldQuaternion(_qw);
  bone.parent.getWorldQuaternion(_qp);
  _qw.premultiply(_qd);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}

// turn bone so the direction bone -> child moves toward `want` (world, normalized) by fraction k
function aimToward(bone, child, want, k, maxAngle = 1.2) {
  if (!bone || !child) return;
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _d.subVectors(_b, _a).normalize();
  _ax.crossVectors(_d, want);
  const s = _ax.length();
  if (s < 1e-5) return;
  _ax.multiplyScalar(1 / s);
  const ang = Math.min(maxAngle, Math.atan2(s, _d.dot(want))) * k;
  rotateWorld(bone, _ax, ang);
}

export function createRelaxedPose({
  model,
  bone,
  character = null,
  proportions = true,
  keepLegs = false,
  // shoulder line and idle arms (per hero): armOut = how far the hanging upper arm points out from vertical (0.36 =
  // clear of a broad man's lats), shoulderLift / shoulderBack = clavicle raise / pull back (radians at full posture),
  // shoulderWide = the shoulder joint moved out along the clavicle (1 = the rig's own width)
  armOut = 0.36,
  shoulderLift = 0.08,
  shoulderBack = 0.1,
  shoulderWide = 1,
}) {
  const B = (n) => bone(n);
  let w = 0;
  let wArms = 0;
  let wLoco = 0;
  let wPost = 0;
  let t = 0;
  // locomotion layer, locked to the gait phase (0 = left foot plant, 0.5 = right): the pelvis rolls down toward the
  // swinging leg and yaws with it, the chest counter-rotates, the arms swing opposite to the legs; when running the
  // elbows bend and the swing grows. Small world-space rotations on top of the clips (no foot sliding: the legs and
  // root are untouched).
  const _f = new THREE.Vector3(),
    _r = new THREE.Vector3(),
    _l = new THREE.Vector3();
  function locomotion(ph, speed, k) {
    const hips = B('Hips');
    if (!hips) return;
    model.updateMatrixWorld(true);
    _f.set(0, 0, 1).applyQuaternion(model.getWorldQuaternion(_qp)).setY(0).normalize();
    _r.crossVectors(UP, _f).normalize(); // character's left
    const run = THREE.MathUtils.smoothstep(2.2, 4.0, speed);
    const c = Math.cos(ph * Math.PI * 2),
      sn = Math.sin(ph * Math.PI * 2);
    // pelvis: roll toward the swing side, yaw forward with the swinging hip
    // keepLegs: the roll / yaw goes on the lower spine, so the legs (and the planted feet) do not swing with the pelvis
    const pel = keepLegs ? B('Spine') || hips : hips;
    rotateWorld(pel, _f, 0.06 * c * k * (1 - 0.4 * run));
    rotateWorld(pel, UP, -0.09 * c * k * (1 - 0.3 * run));
    const sp2 = B('Spine2');
    const sp1 = B('Spine1');
    if (sp1) rotateWorld(sp1, UP, 0.07 * c * k);
    if (sp2) rotateWorld(sp2, UP, 0.07 * c * k); // shoulders counter the pelvis
    if (sp2) rotateWorld(sp2, _r, (0.05 + 0.1 * run) * k); // lean into the stride (more when running)
    for (const side of ['Left', 'Right']) {
      const sg = side === 'Left' ? 1 : -1;
      const swing = -sg * c; // left arm back at the left foot plant
      const arm = B(side + 'Arm');
      const fa = B(side + 'ForeArm');
      const amp = 0.2 + 0.25 * run;
      if (arm) rotateWorld(arm, _l.copy(_r).multiplyScalar(-1), swing * amp * k);
      if (fa)
        rotateWorld(
          fa,
          _l.copy(_r).multiplyScalar(-1),
          (0.25 + 0.9 * run + 0.15 * Math.max(0, swing)) * k,
        );
    }
  }
  const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
  return {
    // drop every layer at once (ragdoll: the bodies own the bones; the get-up then starts with no stale stance on top)
    cut() {
      w = 0;
      wArms = 0;
      wLoco = 0;
      wPost = 0;
    },
    update(dt, anim = {}) {
      t += dt;
      // proportions: a thicker neck and a head a touch larger than the base mesh (about 7.5 heads tall)
      const nk = B('Neck');
      const hd = B('Head');
      if (proportions && nk) nk.scale.set(1.12, 1.0, 1.12); // pipeline Nico only (the user's model has its own head size)
      if (proportions && hd) hd.scale.set(1.1 / 1.12, 1.1, 1.1 / 1.12); // ref_48: about 7.5 heads tall
      const special =
        anim.driving ||
        anim.swimming ||
        anim.wading ||
        anim.dead ||
        anim.idleStyle ||
        anim.punch ||
        anim.handsUp ||
        anim.guard ||
        anim.throw ||
        anim.call ||
        anim.wave ||
        anim.hit ||
        anim.getUp ||
        anim.jumping ||
        anim.grounded === false;
      const speed = anim.speed || 0;
      const wantIdle = special ? 0 : THREE.MathUtils.smoothstep(0.6, 0.05, speed);
      const wantArms = special
        ? 0
        : Math.max(wantIdle, 0.12 * THREE.MathUtils.smoothstep(4.5, 1.0, speed)); // moving: let the arms swing
      const r = Math.min(1, dt * 4);
      w += (wantIdle - w) * r;
      wArms += (wantArms - wArms) * r;
      const wantLoco = special ? 0 : THREE.MathUtils.smoothstep(0.3, 1.2, speed);
      wLoco += (wantLoco - wLoco) * r;
      if (wLoco > 0.01 && character && typeof character.gaitPhase === 'number')
        locomotion(character.gaitPhase, speed, wLoco);
      // athletic posture (user, Nov 17: "his shoulders are too low ... keep him decently buff"): chest up, clavicles
      // neutral-to-slightly raised and back. Also under the standing styles (phone, talk, aim rest) and, lighter, while
      // walking; off when seated, swimming, down or airborne. '__nicoPoseOld' = the old dropped-shoulder layer (A/B).
      const OLD = !!globalThis.__nicoPoseOld;
      // broader shoulders: the arm joint sits further out along the clavicle. Bone positions go back to the animated
      // value every frame (nicoTripo/index.js), so this never compounds.
      if (shoulderWide !== 1 && !OLD) {
        for (const side of ['Left', 'Right'])
          B(side + 'Arm')?.position.multiplyScalar(shoulderWide);
      }
      const postureOK = !(
        anim.driving ||
        anim.swimming ||
        anim.wading ||
        anim.dead ||
        anim.getUp ||
        anim.jumping ||
        anim.grounded === false ||
        anim.idleStyle === 'cower'
      );
      const wantPost =
        OLD || !postureOK ? 0 : 0.45 + 0.55 * THREE.MathUtils.smoothstep(2.5, 0.3, speed);
      wPost += (wantPost - wPost) * r;
      if (wPost > 0.01) {
        model.updateMatrixWorld(true);
        const pf = _t
          .set(0, 0, 1)
          .applyQuaternion(model.getWorldQuaternion(_qp))
          .setY(0)
          .normalize()
          .clone();
        const pr = new THREE.Vector3().crossVectors(UP, pf).normalize().negate(); // character's right
        const s1 = B('Spine1'),
          s2 = B('Spine2'),
          nk2 = B('Neck');
        if (s1) rotateWorld(s1, pr, 0.05 * wPost); // chest up / sternum lifted
        if (s2) rotateWorld(s2, pr, 0.045 * wPost);
        if (nk2) rotateWorld(nk2, pr, -0.08 * wPost); // eyes stay level
        for (const side of ['Left', 'Right']) {
          const sgn = side === 'Left' ? -1 : 1;
          const sh = B(side + 'Shoulder');
          if (sh) {
            rotateWorld(sh, pf, -sgn * shoulderLift * wPost);
            rotateWorld(sh, UP, -sgn * shoulderBack * wPost);
          } // clavicle up a touch and back
        }
      }
      if (wArms < 0.01) return;
      const root = B('Hips');
      if (!root) return;

      model.updateMatrixWorld(true);
      // character frame: forward and right in world space
      const fwd = _t
        .set(0, 0, 1)
        .applyQuaternion(model.getWorldQuaternion(_qp))
        .setY(0)
        .normalize()
        .clone();
      const right = new THREE.Vector3().crossVectors(UP, fwd).normalize().negate();
      const breathe = Math.sin(t * 1.6) * 0.015;
      for (const side of ['Left', 'Right']) {
        const sgn = side === 'Left' ? -1 : 1; // left side is -right
        const out = right.clone().multiplyScalar(sgn);
        // shoulders down and slightly back
        const sh = B(side + 'Shoulder');
        if (sh && OLD)
          rotateWorld(sh, fwd, sgn * (0.13 + breathe) * wArms); // old layer: clavicle drops (the user's 'pulled down' shoulders)
        else if (sh) rotateWorld(sh, fwd, sgn * breathe * 0.6 * wArms); // breathing only
        // upper arm hangs close to the body, a touch forward
        const want = new THREE.Vector3(0, -1, 0)
          .addScaledVector(out, OLD ? 0.17 : armOut)
          .addScaledVector(fwd, OLD ? -0.01 : 0.02)
          .normalize(); // hanging clear of the lats (bulk), a touch forward
        aimToward(B(side + 'Arm'), B(side + 'ForeArm'), want, 0.85 * wArms);
        // soft elbow: forearm swings ~16 degrees forward
        const fa = B(side + 'ForeArm');
        const hand = B(side + 'Hand');
        if (fa && hand) {
          fa.getWorldPosition(_a);
          hand.getWorldPosition(_b);
          _d.subVectors(_b, _a).normalize();
          const fwant = _d
            .clone()
            .addScaledVector(fwd, 0.12)
            .addScaledVector(out, -0.03)
            .normalize(); // soft elbow, hands beside the thighs
          aimToward(fa, hand, fwant, 0.9 * wArms, 0.35);
        }
        // relaxed fingers: each joint curls toward the palm (palm faces the thigh, so toward the body)
        for (const f of fingers) {
          for (let j = 1; j <= 3; j++) {
            const b0 = B(side + 'Hand' + f + j);
            const b1 = B(side + 'Hand' + f + (j + 1));
            if (!b0 || !b1) continue;
            b0.getWorldPosition(_a);
            b1.getWorldPosition(_b);
            _d.subVectors(_b, _a).normalize();
            const cwant = _d
              .clone()
              .addScaledVector(out, -0.55)
              .addScaledVector(fwd, 0.15)
              .normalize();
            const curl = (j === 1 ? 0.35 : 0.5) + (f === 'Pinky' ? 0.15 : f === 'Index' ? -0.1 : 0);
            aimToward(b0, b1, cwant, curl * wArms, 0.6);
          }
        }
      }
      if (w < 0.01) return;
      // feet under the hips (the v1 idle stands wide); the right leg carries the weight, the left knee softens
      for (const side of ['Left', 'Right']) {
        const sgn = side === 'Left' ? -1 : 1;
        const up = B(side + 'UpLeg');
        const foot = B(side + 'Foot');
        if (!up || !foot) continue;
        up.getWorldPosition(_a);
        foot.getWorldPosition(_b);
        root.getWorldPosition(_t);
        const hipOff = _a.clone().sub(_t).dot(right);
        const footOff = _b.clone().sub(_t).dot(right);
        const target = hipOff * 1.25 + sgn * 0.015; // feet about shoulder width
        const dir = _b.clone().sub(_a);
        const len = dir.length();
        dir.addScaledVector(right, target - footOff).normalize();
        if (len > 0.1) aimToward(up, foot, dir, w, 0.2);
      }
      // weight on the right leg: pelvis tilts a little, chest counters, head levels
      const sp = B('Spine');
      const sp2 = B('Spine2');
      rotateWorld(keepLegs ? B('Spine') || root : root, fwd, 0.035 * w);
      if (sp) rotateWorld(sp, fwd, -0.03 * w);
      if (sp2) rotateWorld(sp2, fwd, -0.012 * w);
    },
  };
}

// Port Solana V2 — Nico's relaxed-stance layer (CHARACTER track). Runs after the animation mixer each frame and corrects
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

export function createRelaxedPose({ model, bone }) {
  const B = (n) => bone(n);
  let w = 0;
  let wArms = 0;
  let t = 0;
  const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
  return {
    update(dt, anim = {}) {
      t += dt;
      // proportions: a thicker neck and a head a touch larger than the base mesh (about 7.5 heads tall)
      const nk = B('Neck');
      const hd = B('Head');
      if (nk) nk.scale.set(1.12, 1.0, 1.12);
      if (hd) hd.scale.set(1.10 / 1.12, 1.10, 1.10 / 1.12);         // ref_48: about 7.5 heads tall
      const special = anim.driving || anim.swimming || anim.wading || anim.dead || anim.idleStyle || anim.punch
        || anim.handsUp || anim.guard || anim.throw || anim.call || anim.wave || anim.hit || anim.getUp || anim.jumping
        || anim.grounded === false;
      const speed = anim.speed || 0;
      const wantIdle = special ? 0 : THREE.MathUtils.smoothstep(0.6, 0.05, speed);
      const wantArms = special ? 0 : Math.max(wantIdle, 0.45 * THREE.MathUtils.smoothstep(4.5, 1.0, speed));
      const r = Math.min(1, dt * 4);
      w += (wantIdle - w) * r;
      wArms += (wantArms - wArms) * r;
      if (wArms < 0.01) return;
      const root = B('Hips');
      if (!root) return;

      model.updateMatrixWorld(true);
      // character frame: forward and right in world space
      const fwd = _t.set(0, 0, 1).applyQuaternion(model.getWorldQuaternion(_qp)).setY(0).normalize().clone();
      const right = new THREE.Vector3().crossVectors(UP, fwd).normalize().negate();
      const breathe = Math.sin(t * 1.6) * 0.015;
      for (const side of ['Left', 'Right']) {
        const sgn = side === 'Left' ? -1 : 1;       // left side is -right
        const out = right.clone().multiplyScalar(sgn);
        // shoulders down and slightly back
        const sh = B(side + 'Shoulder');
        if (sh) rotateWorld(sh, fwd, sgn * (0.13 + breathe) * wArms);      // clavicle drops (lowers the shoulder point)
        // upper arm hangs close to the body, a touch forward
        const want = new THREE.Vector3(0, -1, 0).addScaledVector(out, 0.17).addScaledVector(fwd, -0.01).normalize();     // at the sides, clear of the lats
        aimToward(B(side + 'Arm'), B(side + 'ForeArm'), want, 0.85 * wArms);
        // soft elbow: forearm swings ~16 degrees forward
        const fa = B(side + 'ForeArm');
        const hand = B(side + 'Hand');
        if (fa && hand) {
          fa.getWorldPosition(_a);
          hand.getWorldPosition(_b);
          _d.subVectors(_b, _a).normalize();
          const fwant = _d.clone().addScaledVector(fwd, 0.12).addScaledVector(out, -0.03).normalize();     // soft elbow, hands beside the thighs
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
            const cwant = _d.clone().addScaledVector(out, -0.55).addScaledVector(fwd, 0.15).normalize();
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
        const target = hipOff * 1.25 + sgn * 0.015;            // feet about shoulder width
        const dir = _b.clone().sub(_a);
        const len = dir.length();
        dir.addScaledVector(right, (target - footOff)).normalize();
        if (len > 0.1) aimToward(up, foot, dir, w, 0.2);
      }
      // weight on the right leg: pelvis tilts a little, chest counters, head levels
      const sp = B('Spine');
      const sp2 = B('Spine2');
      rotateWorld(root, fwd, 0.035 * w);
      if (sp) rotateWorld(sp, fwd, -0.03 * w);
      if (sp2) rotateWorld(sp2, fwd, -0.012 * w);
    },
  };
}

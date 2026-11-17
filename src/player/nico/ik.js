// Southline V2 — arm IK for reach-and-grab and held items (CHARACTER track). Two-bone analytic IK applied after the
// animation, blended by weight; the spine leans in for far targets; fingers open on the way and close on arrival.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _ax = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _pi = new THREE.Quaternion(), _r = new THREE.Quaternion();
function rotateWorld(bone, rWorld) {               // apply a world-space rotation to a bone
  bone.parent.getWorldQuaternion(_p); _pi.copy(_p).invert();
  bone.quaternion.premultiply(_q.copy(_pi).multiply(rWorld).multiply(_p)); bone.updateWorldMatrix(false, true);
}
export const GRIPS = { open: 0.05, relaxed: 0.25, flat: 0.02, pinch: 0.55, phone: 0.6, cylinder: 0.8, bottle: 0.72, fist: 1.0, pistol: 0.85 };

export function createArmIK(model, bone, side) {
  const upper = bone(side + 'Arm'), lower = bone(side + 'ForeArm'), hand = bone(side + 'Hand'), spine = bone('Spine1'), spine2 = bone('Spine2');
  const fingers = ['Index', 'Middle', 'Ring', 'Pinky'].map((f) => [1, 2, 3].map((k) => bone(side + 'Hand' + f + k)));
  const thumb = [1, 2, 3].map((k) => bone(side + 'HandThumb' + k));
  const sgn = side === 'Right' ? 1 : -1;
  const st = { w: 0, wT: 0, target: new THREE.Vector3(), from: new THREE.Vector3(), t: 0, dur: 0.45, holdAfter: true, resolve: null, curl: 0.25, curlT: 0.25, held: null, grip: 'relaxed', dist: Infinity, reaching: false, curlOn: 0 };
  function curlFingers(amount, weight) {
    if (weight <= 0.001 || !hand) return;
    // hinge axis: across the knuckles (index -> pinky), sign chosen so that a positive angle closes the hand
    const i1 = fingers[0][0], p1 = fingers[3][0]; if (!i1 || !p1) return;
    i1.getWorldPosition(_a); p1.getWorldPosition(_b); _ax.subVectors(_b, _a).normalize().multiplyScalar(sgn);
    for (let f = 0; f < 4; f++) for (let k = 0; k < 3; k++) {
      const b = fingers[f][k]; if (!b) continue;
      const ang = amount * (k === 0 ? 1.15 : k === 1 ? 1.45 : 1.0) * (1 + f * 0.05) * weight;
      rotateWorld(b, _r.setFromAxisAngle(_ax, ang));
    }
    if (thumb[0]) {
      thumb[0].getWorldPosition(_a); hand.getWorldPosition(_b); fingers[1][0].getWorldPosition(_c);
      _v.subVectors(_c, _b).normalize();                                     // along the hand
      rotateWorld(thumb[0], _r.setFromAxisAngle(_v, -0.55 * amount * weight * sgn));
      if (thumb[1]) rotateWorld(thumb[1], _r.setFromAxisAngle(_ax, 0.5 * amount * weight));
      if (thumb[2]) rotateWorld(thumb[2], _r.setFromAxisAngle(_ax, 0.6 * amount * weight));
    }
  }
  const api = {
    get active() { return st.w > 0.02; }, get target() { return st.target; }, get held() { return st.held; }, state: st,
    reach(point, o = {}) {
      if (!upper) return Promise.resolve();
      hand.getWorldPosition(st.from); st.target.copy(point); st.t = 0; st.dur = o.duration ?? 0.42; st.wT = 1; st.holdAfter = o.hold !== false; st.reaching = true; st.curlT = st.held ? st.curlT : GRIPS.open;
      if (st.resolve) st.resolve(); return new Promise((res) => { st.resolve = res; });
    },
    release() { st.wT = 0; st.reaching = false; if (st.resolve) { st.resolve(); st.resolve = null; } if (!st.held) st.curlT = GRIPS.relaxed; },
    hold(obj, o = {}) {
      if (st.held && st.held.parent === hand) hand.remove(st.held);
      st.held = obj || null;
      if (!obj) { st.curlT = GRIPS.relaxed; st.curlOn = 0; return; }
      st.grip = o.grip || 'cylinder'; st.curlT = (GRIPS[st.grip] ?? 0.8) * (o.radius ? THREE.MathUtils.clamp(1.25 - o.radius * 9, 0.35, 1.1) : 1); st.curlOn = 1;
      // the object sits in the palm: palm centre is ~8 cm along the hand, 2.5 cm toward the palm side
      hand.updateWorldMatrix(true, false); fingers[1][0].getWorldPosition(_a); hand.getWorldPosition(_b);
      const along = _a.sub(_b); const palm = hand.worldToLocal(_b.clone().addScaledVector(along, 0.9));
      fingers[0][0].getWorldPosition(_v); fingers[3][0].getWorldPosition(_w); const across = _w.sub(_v).normalize().multiplyScalar(sgn);
      const nrm = new THREE.Vector3().crossVectors(along.clone().normalize(), across).normalize();                        // out of the palm
      const pw = hand.getWorldPosition(new THREE.Vector3()).addScaledVector(along, 0.9).addScaledVector(nrm, (o.radius ?? 0.03) + 0.008);
      hand.add(obj); obj.position.copy(hand.worldToLocal(pw));
      if (o.offset) obj.position.add(o.offset);
      // object +Y runs along the knuckle line (a bottle stands in the fist) unless a rotation is given
      const m = new THREE.Matrix4().makeBasis(nrm.clone().cross(across).normalize(), across.clone().multiplyScalar(-sgn), nrm.clone().cross(across).normalize().cross(across.clone().multiplyScalar(-sgn)));
      obj.quaternion.setFromRotationMatrix(m).premultiply(hand.getWorldQuaternion(new THREE.Quaternion()).invert());
      if (o.rotation) obj.quaternion.multiply(o.rotation.isQuaternion ? o.rotation : new THREE.Quaternion().setFromEuler(o.rotation));
    },
    update(dt) {
      if (!upper) return;
      st.w += (st.wT - st.w) * Math.min(1, dt * (st.wT > st.w ? 9 : 5));
      st.curl += (st.curlT - st.curl) * Math.min(1, dt * 10);
      if (st.w > 0.004) {
        st.t = Math.min(1, st.t + dt / st.dur);
        const e = st.t * st.t * (3 - 2 * st.t);
        hand.getWorldPosition(_c);
        // move the effective goal from where the hand was to the target along a slightly raised arc
        _t.lerpVectors(st.from, st.target, e); _t.y += Math.sin(e * Math.PI) * 0.04 * st.from.distanceTo(st.target);
        // spine assist for far targets
        upper.getWorldPosition(_a); const reachLen = upper.getWorldPosition(_v).distanceTo(lower.getWorldPosition(_w)) + lower.getWorldPosition(_w).distanceTo(_c);
        const need = _a.distanceTo(_t) - reachLen * 0.97;
        if (need > 0 && spine) {
          _v.subVectors(_t, _a).normalize(); spine.getWorldPosition(_w); _b.subVectors(_a, _w).normalize();
          _ax.crossVectors(_b, _v); const sl = _ax.length();
          if (sl > 1e-4) { const ang = Math.min(0.55, need / Math.max(0.25, _a.distanceTo(_w))) * st.w; _ax.divideScalar(sl); rotateWorld(spine, _r.setFromAxisAngle(_ax, ang * 0.6)); if (spine2) rotateWorld(spine2, _r.setFromAxisAngle(_ax, ang * 0.4)); }
        }
        // two-bone solve (weight-blended against the animated pose)
        const q0u = upper.quaternion.clone(), q0l = lower.quaternion.clone();
        upper.getWorldPosition(_a); lower.getWorldPosition(_b); hand.getWorldPosition(_c);
        const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c); const d = THREE.MathUtils.clamp(_a.distanceTo(_t), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.004);
        const cur = Math.acos(THREE.MathUtils.clamp(_v.subVectors(_a, _b).normalize().dot(_w.subVectors(_c, _b).normalize()), -1, 1));
        const want = Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
        _ax.crossVectors(_w, _v); if (_ax.lengthSq() < 1e-8) _ax.set(0, 1, 0); _ax.normalize();
        rotateWorld(lower, _r.setFromAxisAngle(_ax, cur - want));
        hand.getWorldPosition(_c); _v.subVectors(_c, _a).normalize(); _w.subVectors(_t, _a).normalize();
        rotateWorld(upper, _r.setFromUnitVectors(_v, _w));
        // keep the elbow below / outside: swing around the shoulder-target axis toward a natural pole
        lower.getWorldPosition(_b); _v.subVectors(_t, _a).normalize(); _c.subVectors(_b, _a); _c.addScaledVector(_v, -_c.dot(_v));
        _w.set(0, -1, 0).addScaledVector(model.getWorldDirection(new THREE.Vector3()), -0.35); _w.addScaledVector(_v, -_w.dot(_v));
        if (_c.lengthSq() > 1e-6 && _w.lengthSq() > 1e-6) { _c.normalize(); _w.normalize(); let ang = Math.acos(THREE.MathUtils.clamp(_c.dot(_w), -1, 1)); if (_ax.crossVectors(_c, _w).dot(_v) < 0) ang = -ang; rotateWorld(upper, _r.setFromAxisAngle(_v, ang * 0.6)); }
        upper.quaternion.slerpQuaternions(q0u, upper.quaternion.clone(), st.w); lower.quaternion.slerpQuaternions(q0l, lower.quaternion.clone(), st.w);
        upper.updateWorldMatrix(false, true);
        st.dist = hand.getWorldPosition(_c).distanceTo(st.target);
        if (st.reaching && st.t >= 1) { st.reaching = false; if (!st.held) st.curlT = GRIPS.pinch; if (st.resolve) { const r = st.resolve; st.resolve = null; r({ distance: st.dist }); } if (!st.holdAfter) st.wT = 0; }
      }
      const cw = Math.max(st.w, st.curlOn);
      if (cw > 0.01) curlFingers(st.curl, cw);
    },
  };
  return api;
}

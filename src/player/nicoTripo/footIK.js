// Southline — light foot IK for the player (curbs, stairs, slopes, docks): after the animation, each foot looks down at
// the real collision ground under it, the pelvis drops so the lower foot can reach, the other leg bends (two-bone
// analytic IK in world space, knee stays in its bend plane), and a planted foot tilts to the ground slope.
// Off while airborne, driving, swimming, sitting / scripted poses, ragdoll and dead. Stats in footIK.stats for tests.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _h = new THREE.Vector3(), _k = new THREE.Vector3(), _a = new THREE.Vector3(), _t = new THREE.Vector3();
const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _qs = new THREE.Quaternion();

function rotateWorld(bone, q) {                       // apply a world-space rotation to a bone (about its own pivot)
  bone.parent.getWorldQuaternion(_p);
  _qs.copy(_p).invert().multiply(q).multiply(_p);
  bone.quaternion.premultiply(_qs);
  bone.updateMatrixWorld(true);
}
function setWorldQuat(bone, qw) {
  bone.parent.getWorldQuaternion(_p);
  bone.quaternion.copy(_p.invert().multiply(qw));
  bone.updateMatrixWorld(true);
}

export function createFootIK({ game, model, bone, root }) {
  const legs = ['Left', 'Right'].map((s) => ({ s, up: bone(s + 'UpLeg'), lo: bone(s + 'Leg'), ft: bone(s + 'Foot'), toe: bone(s + 'ToeBase'), off: 0, n: new THREE.Vector3(0, 1, 0), plant: 0, gy: null }));
  const ok = legs.every((l) => l.up && l.lo && l.ft);
  const st = { w: 0, pelvis: 0, ankleH: null, stats: { err: [0, 0], off: [0, 0], pelvis: 0, active: false } };
  // ankle height above the sole in the bind pose (feet flat on the ground at y = 0)
  const restAnkle = () => {
    if (st.ankleH !== null) return st.ankleH;
    model.updateMatrixWorld(true);
    const y0 = root.getWorldPosition(_t).y;
    st.ankleH = Math.max(0.05, Math.min(0.14, legs[0].ft.getWorldPosition(_a).y - y0));
    return st.ankleH;
  };
  function ground(x, y, z) {
    const R = game?.RAPIER, W = game?.world; if (!R || !W) return null;
    const QF = R.QueryFilterFlags;
    try {
      const hit = W.castRayAndGetNormal(new R.Ray({ x, y: y + 0.55, z }, { x: 0, y: -1, z: 0 }), 1.25, true,
        QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS, undefined, game.player?.collider);
      if (!hit) return null;
      return { y: y + 0.55 - hit.timeOfImpact, n: hit.normal };
    } catch (e) { return null; }
  }
  // two-bone IK: put the ankle of leg l at world point T (knee bends in its current plane)
  function solve(l, T, fwd) {
    l.up.getWorldPosition(_h); l.lo.getWorldPosition(_k); l.ft.getWorldPosition(_a);
    const a = _k.distanceTo(_h), b = _a.distanceTo(_k);
    const c = THREE.MathUtils.clamp(_t.copy(T).sub(_h).length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    _u.subVectors(_h, _k).normalize(); _w.subVectors(_a, _k).normalize();
    const theta = Math.acos(THREE.MathUtils.clamp(_u.dot(_w), -1, 1));
    const want = Math.acos(THREE.MathUtils.clamp((a * a + b * b - c * c) / (2 * a * b), -1, 1));
    _n.crossVectors(_u, _w);
    if (_n.lengthSq() < 1e-8) _n.crossVectors(fwd, UP); _n.normalize();
    rotateWorld(l.lo, _q.setFromAxisAngle(_n, want - theta));
    l.up.getWorldPosition(_h); l.ft.getWorldPosition(_a);
    rotateWorld(l.up, _q.setFromUnitVectors(_u.subVectors(_a, _h).normalize(), _w.subVectors(T, _h).normalize()));
  }
  return {
    stats: st.stats,
    update(dt, anim = {}) {
      if (!ok) return;
      const P = game?.player;
      const on = !(anim.driving || anim.swimming || anim.dead || anim.grounded === false || anim.jumping || anim.idleStyle || anim.getUp || anim.ragdoll)
        && !(P?.state?.inVehicle) && !(P?.ragdoll) && root.visible !== false;
      st.w += ((on ? 1 : 0) - st.w) * Math.min(1, dt * (on ? 8 : 14));
      st.stats.active = st.w > 0.05;
      if (st.w < 0.01) { model.position.y = 0; st.pelvis = 0; return; }
      const ankH = restAnkle();
      model.position.y = 0; model.updateMatrixWorld(true);
      const rootY = root.getWorldPosition(_t).y;
      _f.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_qf)).setY(0).normalize();
      // 1) ground under each foot (relative to the root plane the animation stands on)
      for (const l of legs) {
        l.ft.getWorldPosition(_a);
        const g = ground(_a.x, rootY, _a.z);
        const want = g ? THREE.MathUtils.clamp(g.y - rootY, -0.4, 0.4) : 0;
        l.off += (want - l.off) * Math.min(1, dt * 18);
        if (g) l.n.set(g.n.x, g.n.y, g.n.z); else l.n.copy(UP);
        const lift = _a.y - rootY - ankH;                  // the animation's own foot lift (swing)
        l.plant += ((lift < 0.045 ? 1 : 0) - l.plant) * Math.min(1, dt * 12);
        l.gy = g ? g.y : null; l.lift = lift;
      }
      // 2) pelvis down so the lower foot reaches (never up: the capsule already stands on the higher ground)
      const pv = Math.min(0, legs[0].off, legs[1].off) * st.w;
      st.pelvis += (pv - st.pelvis) * Math.min(1, dt * 14);
      model.position.y = st.pelvis; model.updateMatrixWorld(true);
      // 3) each leg reaches its own ground; planted feet follow the slope
      for (let i = 0; i < 2; i++) {
        const l = legs[i];
        const fq = l.ft.getWorldQuaternion(new THREE.Quaternion());
        l.ft.getWorldPosition(_a);
        const raise = (l.off - st.pelvis) * st.w;
        if (Math.abs(raise) > 0.002) { _t.copy(_a); _t.y += raise; solve(l, _t, _f); }
        setWorldQuat(l.ft, fq);                            // the foot keeps its animated orientation...
        const tilt = Math.min(0.45, Math.acos(THREE.MathUtils.clamp(l.n.y, -1, 1)));
        if (tilt > 0.01 && l.plant > 0.05) {               // ...then lies flat on the slope / ramp when planted
          _n.crossVectors(UP, l.n).normalize();
          rotateWorld(l.ft, _q.setFromAxisAngle(_n, tilt * l.plant * st.w));
        }
        l.ft.getWorldPosition(_a);
        st.stats.off[i] = l.off; st.stats.err[i] = l.gy === null ? null : (_a.y - ankH) - l.gy;
      }
      st.stats.pelvis = st.pelvis;
    },
  };
}

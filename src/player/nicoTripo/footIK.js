// Southline — light foot IK for the player (curbs, stairs, slopes, docks): after the animation, each foot looks down at
// the real collision ground under it, the pelvis drops so the lower foot can reach, the other leg bends (two-bone
// analytic IK in world space, knee stays in its bend plane), and a planted foot tilts to the ground slope.
// Off while airborne, driving, swimming, sitting / scripted poses, ragdoll and dead. Stats in footIK.stats for tests.
import * as THREE from 'three';
import { createStairs } from './stairs.js';

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

export function createFootIK({ game, model, bone, root, mesh = null }) {
  const legs = ['Left', 'Right'].map((s) => ({ s, up: bone(s + 'UpLeg'), lo: bone(s + 'Leg'), ft: bone(s + 'Foot'), toe: bone(s + 'ToeBase'), off: 0, n: new THREE.Vector3(0, 1, 0), plant: 0, gy: null, marks: [], c: new THREE.Vector3(), prevC: null }));
  const ok = legs.every((l) => l.up && l.lo && l.ft);
  const st = { w: 0, pelvis: 0, stats: { err: [0, 0], off: [0, 0], plant: [0, 0], lift: [0, 0], flat: [0, 0], stair: [false, false], slide: [0, 0], pelvis: 0, active: false } };
  const stairs = createStairs(game);
  // sole markers: the lowest vertices of each shoe in the bind pose (heel to toe). Their skinned positions give the real
  // sole height every frame, so a planted foot is put exactly on the ground and the error is measured on the mesh itself.
  if (mesh?.geometry?.attributes?.position) {
    const pos = mesh.geometry.attributes.position; let minY = Infinity;
    for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i));
    for (const [k, l] of legs.entries()) {
      const cand = [];
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), x = pos.getX(i); if (y < minY + 0.012 && (k === 0 ? x > 0.02 : x < -0.02)) cand.push([pos.getZ(i), i]); }
      cand.sort((p, q) => p[0] - q[0]);
      const n = Math.min(16, cand.length);
      for (let j = 0; j < n; j++) l.marks.push(cand[Math.floor(j * (cand.length - 1) / Math.max(1, n - 1))][1]);
    }
  }
  const _m = new THREE.Vector3();
  // world sole height (min of the markers) and marker center -> l.sole, l.c
  function sole(l) {
    if (!l.marks.length) { l.ft.getWorldPosition(l.c); l.sole = l.c.y - 0.09; return l.sole; }
    let lo = Infinity, hi = -Infinity; l.c.set(0, 0, 0);
    l.mp ||= l.marks.map(() => new THREE.Vector3());
    for (let k = 0; k < l.marks.length; k++) { mesh.getVertexPosition(l.marks[k], _m); _m.applyMatrix4(mesh.matrixWorld); l.mp[k].copy(_m); lo = Math.min(lo, _m.y); hi = Math.max(hi, _m.y); l.c.add(_m); }
    l.c.multiplyScalar(1 / l.marks.length); l.sole = lo; l.spread = hi - lo; return lo;
  }
  function ground(x, y, z) {
    const R = game?.RAPIER, W = game?.world; if (!R || !W) return null;
    const QF = R.QueryFilterFlags;
    try {
      const hit = W.castRayAndGetNormal(new R.Ray({ x, y: y + 0.55, z }, { x: 0, y: -1, z: 0 }), 1.25, true,
        QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS, undefined, game.player?.collider);
      if (!hit) return null;
      const gy = y + 0.55 - hit.timeOfImpact;
      // stair ramps run through the tread nosings: stand on the tread itself
      const tr = stairs.treadAt(x, z, gy);
      if (tr !== null && tr <= gy + 0.02 && tr > gy - 0.3) return { y: tr, n: UP, stair: true };
      return { y: gy, n: hit.normal };
    } catch (e) { return null; }
  }
  // two-bone IK: put the ankle of leg l at world point T (knee bends in its current plane)
  function solve(l, T, fwd) {
    l.up.getWorldPosition(_h); l.lo.getWorldPosition(_k); l.ft.getWorldPosition(_a);
    const a = _k.distanceTo(_h), b = _a.distanceTo(_k);
    const c = THREE.MathUtils.clamp(T.distanceTo(_h), Math.abs(a - b) + 1e-3, a + b - 1e-3);     // (T may be _t: never write into it)
    _u.subVectors(_h, _k).normalize(); _w.subVectors(_a, _k).normalize();
    const theta = Math.acos(THREE.MathUtils.clamp(_u.dot(_w), -1, 1));
    const want = Math.acos(THREE.MathUtils.clamp((a * a + b * b - c * c) / (2 * a * b), -1, 1));
    _n.crossVectors(_u, _w);
    if (_n.lengthSq() < 1e-3) _n.crossVectors(fwd, UP); _n.normalize();     // near-straight leg: its bend plane is noise; knee goes forward
    rotateWorld(l.lo, _q.setFromAxisAngle(_n, want - theta));
    l.up.getWorldPosition(_h); l.ft.getWorldPosition(_a);
    rotateWorld(l.up, _q.setFromUnitVectors(_u.subVectors(_a, _h).normalize(), _w.subVectors(T, _h).normalize()));
  }
  return {
    stats: st.stats, stairs, legs, sole, mesh,
    update(dt, anim = {}) {
      if (!ok) return;
      const P = game?.player;
      const on = !(anim.driving || anim.swimming || anim.dead || anim.grounded === false || anim.jumping || anim.idleStyle || anim.getUp || anim.ragdoll)
        && !(P?.state?.inVehicle) && !(P?.ragdoll) && root.visible !== false;
      // landing: after a real fall / jump the knees take the impact (pelvis dips, feet stay on the ground), scaled by air time
      const airborne = anim.grounded === false || anim.jumping;
      if (airborne && !anim.swimming) st.air = (st.air || 0) + dt;
      else if (on && (st.air || 0) > 0.28) { st.land = THREE.MathUtils.clamp(st.air / 0.8, 0.35, 1); st.landT = 0; st.air = 0; st.w = Math.max(st.w, 0.85); }
      else st.air = 0;
      st.w += ((on ? 1 : 0) - st.w) * Math.min(1, dt * (on ? 8 : 14));
      st.stats.active = st.w > 0.05;
      if (st.w < 0.01) { model.position.y = 0; st.pelvis = 0; for (const l of legs) { l.prevOk = false; l.prevPreOk = false; l.corr?.set(0, 0, 0); } return; }
      let dip = 0;
      if (st.land) { st.landT += dt; const k = st.landT / 0.42; dip = k >= 1 ? 0 : -0.11 * st.land * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - k * 0.3); if (k >= 1) st.land = 0; }
      model.position.y = 0; model.updateMatrixWorld(true);
      const rootY = root.getWorldPosition(_t).y;
      _f.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_qf)).setY(0).normalize();
      // 1) ground under each sole, the animation's own lift, and the shift each foot needs (relative to the animation)
      for (const l of legs) {
        const so = sole(l);
        const g = ground(l.c.x, rootY, l.c.z);
        const want = g ? THREE.MathUtils.clamp(g.y - rootY, -0.4, 0.4) : 0;
        l.off += (want - l.off) * Math.min(1, dt * 18);
        if (g) l.n.set(g.n.x, g.n.y, g.n.z); else l.n.copy(UP);
        const lift = so - rootY;                            // > 0: the clip lifts this foot (swing); ~0: planted
        l.plant += ((lift < 0.035 ? 1 : 0) - l.plant) * Math.min(1, dt * 12);
        // planted: pull the sole exactly onto the plane (clips float / sink a few cm after retargeting)
        l.shift = l.off - THREE.MathUtils.clamp(lift, -0.06, 0.06) * l.plant;
        l.gy = g ? g.y : null; l.stair = !!g?.stair; l.lift = lift;
        // stance foot locking: the sole vertices touching the ground (in the animation, this frame and the last) should
        // not move in the world. Whatever they do move (clip speed vs ground speed, blends, turning in place) is
        // collected as a correction that holds the foot where it was planted; it fades out while the foot swings.
        if (l.marks.length) {
          l.pre ||= l.marks.map(() => new THREE.Vector3()); l.prevPre ||= l.marks.map(() => new THREE.Vector3());
          for (let k = 0; k < l.mp.length; k++) l.pre[k].copy(l.mp[k]);
          let n = 0; const dxs = l.dxs || (l.dxs = []), dzs = l.dzs || (l.dzs = []); dxs.length = 0; dzs.length = 0;
          if (l.prevPreOk) for (let k = 0; k < l.pre.length; k++) {
            if (l.pre[k].y - rootY < 0.012 && l.prevPre[k].y - (l.prevRootY ?? rootY) < 0.012) { dxs.push(l.pre[k].x - l.prevPre[k].x); dzs.push(l.pre[k].z - l.prevPre[k].z); n++; }
          }
          l.corr ||= new THREE.Vector3();
          if (n >= 3) {
            dxs.sort((x, y) => x - y); dzs.sort((x, y) => x - y);
            const mx = dxs[n >> 1], mz = dzs[n >> 1];
            if (Math.hypot(mx, mz) < 0.3) { l.corr.x -= mx; l.corr.z -= mz; } else l.corr.set(0, 0, 0);    // a teleport is not a slide
            l.corr.clampLength(0, 0.15);
          } else l.corr.multiplyScalar(Math.exp(-dt * 9));
          for (let k = 0; k < l.pre.length; k++) l.prevPre[k].copy(l.pre[k]);
          l.prevRootY = rootY; l.prevPreOk = true;
        }
      }
      // 2) pelvis down so the lower foot reaches (never up: the capsule already stands on the higher ground)
      const pv = Math.min(0, legs[0].shift, legs[1].shift) * st.w;
      st.pelvis += (pv - st.pelvis) * Math.min(1, dt * 14);
      model.position.y = st.pelvis + dip; model.updateMatrixWorld(true);
      // 3) each leg reaches its own ground; planted feet follow the slope
      for (let i = 0; i < 2; i++) {
        const l = legs[i];
        const fq = l.ft.getWorldQuaternion(new THREE.Quaternion());
        l.ft.getWorldPosition(_a);
        const raise = (l.shift - st.pelvis) * st.w - dip;
        const cx = (l.corr?.x || 0) * st.w, cz = (l.corr?.z || 0) * st.w;
        if (Math.abs(raise) > 0.002 || cx * cx + cz * cz > 1e-6) { _t.copy(_a); _t.y += raise; _t.x += cx; _t.z += cz; solve(l, _t, _f); }
        setWorldQuat(l.ft, fq);                            // the foot keeps its animated orientation...
        const tilt = Math.min(0.45, Math.acos(THREE.MathUtils.clamp(l.n.y, -1, 1)));
        if (tilt > 0.01 && l.plant > 0.05) {               // ...then lies flat on the slope / ramp when planted
          _n.crossVectors(UP, l.n).normalize();
          rotateWorld(l.ft, _q.setFromAxisAngle(_n, tilt * l.plant * st.w));
        }
        // measured on the skinned mesh after IK: sole-to-ground error and planted-foot slide speed
        const so = sole(l);
        st.stats.off[i] = l.off; st.stats.err[i] = l.gy === null ? null : so - l.gy; st.stats.plant[i] = l.plant; st.stats.stair[i] = l.stair; st.stats.lift[i] = l.lift; st.stats.flat[i] = l.spread;
        // slide: speed of the same sole vertices while they touch the ground (within 1 cm) in this and the last frame;
        // the heel-to-toe roll moves the contact point but not a touching vertex, so this is pure sliding
        const sl = l.sl || (l.sl = []); sl.length = 0;
        if (l.prevOk && l.gy !== null && dt > 0) for (let k = 0; k < l.mp.length; k++) {
          const q = l.mp[k], pq = l.prevM[k];
          if (q.y - l.gy < 0.01 && pq.y - (l.prevGy ?? l.gy) < 0.01) sl.push(Math.hypot(q.x - pq.x, q.z - pq.z) / dt);
        }
        sl.sort((x, y) => x - y);
        st.stats.slide[i] = sl.length >= 3 ? sl[Math.floor(sl.length / 2)] : null;
        l.prevM ||= l.mp.map(() => new THREE.Vector3()); for (let k = 0; k < l.mp.length; k++) l.prevM[k].copy(l.mp[k]); l.prevGy = l.gy; l.prevOk = true;
      }
      st.stats.pelvis = st.pelvis;
    },
  };
}

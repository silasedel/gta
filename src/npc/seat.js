// Seated people in vehicles (r2-people, item 2): ONE solver for the AI drivers, passengers and the player.
// The car side (r2-cars, src/vehicles/vehicles.js) measures a seat anchor per model in SHELL space (ground y = 0, +Z forward,
// +X = the car's left): hip = H-point, heel = floor point under the heels, yaw, roofY (headliner), doorX (inner door |x|),
// wheel { c, r, tilt } for the driver. seatCharacter() puts a character (the user's people from src/npc/arch/character.js,
// or the player from src/player/characterModel.js) into that seat and keeps it there on every update:
//   - root moved so the hip joints sit exactly on the H-point, torso reclined against the backrest
//   - head kept under the roof (more recline, a little cushion sink, chin down)
//   - legs: two-bone IK to the footwell (driver's right foot on the pedal, toes up), knees up and apart
//   - driver: hands on the rim at ten-to-two (following the steering), fingers wrapped around it
//   - passenger: hands resting on the thighs, fingers relaxed
//   - elbows kept inside the door
// Works on any rig with the game's Mixamo-named joints: everything is solved in world space and the finger curl axes come
// from the bind pose (skeleton.boneInverses), so no per-rig axis tables.
import * as THREE from 'three';

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _g = V(), _t = V(), _p = V();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const D2R = Math.PI / 180;
const FING = ['Index', 'Middle', 'Ring', 'Pinky'];
const wp = (b, out) => b.getWorldPosition(out);

function bone(ch, n) { return ch.getBone?.(n) || null; }
/** rotate a bone (world-space delta) so its world direction `from` turns into `to` */
function swing(b, from, to, k = 1) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(_e.copy(from).normalize(), _f.copy(to).normalize());
  if (k < 1) _q.slerp(_q3.identity(), 1 - k);
  rotWorld(b, _q);
}
/** apply a world-space rotation delta q to bone b (keeps its world position) */
function rotWorld(b, q) {
  b.getWorldQuaternion(_q2);
  _q2.premultiply(q);
  b.parent.getWorldQuaternion(_q3).invert();
  b.quaternion.copy(_q3.multiply(_q2));
  b.updateMatrixWorld(true);
}
/** set bone b's world rotation to target (quaternion) */
function setWorldQ(b, target) { b.parent.getWorldQuaternion(_q3).invert(); b.quaternion.copy(_q3.multiply(target)); b.updateMatrixWorld(true); }

/** two-bone IK: upper (a) -> lower (b) -> end (c); end to `target`, bend toward `pole` (world points) */
function twoBone(a, b, c, target, pole, w = 1) {
  const pa = wp(a, V()), pb = wp(b, V()), pc = wp(c, V());
  if (w < 1) target = V().copy(pc).lerp(target, w);
  const l1 = pa.distanceTo(pb), l2 = pb.distanceTo(pc);
  const t = _t.copy(target).sub(pa); let d = t.length();
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.9995); t.setLength(d);
  const dir = _d.copy(t).normalize();
  const pv = _p.copy(pole).sub(pa); pv.addScaledVector(dir, -pv.dot(dir));
  if (pv.lengthSq() < 1e-8) { pv.copy(pb).sub(pa); pv.addScaledVector(dir, -pv.dot(dir)); }
  pv.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const elbow = _g.copy(pa).addScaledVector(dir, l1 * cosA).addScaledVector(pv, l1 * sinA);
  swing(a, _a.copy(pb).sub(pa), _b.copy(elbow).sub(pa));
  wp(b, pb); wp(c, pc);
  swing(b, _a.copy(pc).sub(pb), _b.copy(pa).add(t).sub(pb));
  return elbow;
}

// ---------------------------------------------------------------- hand frames from the bind pose
// Rest (bind) world rotations of the finger joints, so curling works on any rig: palm normal = model -Y in the T-pose.
function handRig(ch) {
  if (ch._seatHands !== undefined) return ch._seatHands;
  let sk = null; ch.root.traverse((o) => { if (!sk && o.isSkinnedMesh && o.visible !== undefined) sk = o.skeleton; });
  const out = {};
  if (sk) {
    const idx = new Map(sk.bones.map((b, i) => [b, i]));
    const restW = (b) => { const i = idx.get(b); return i === undefined ? null : new THREE.Matrix4().copy(sk.boneInverses[i]).invert(); };
    for (const S of ['Left', 'Right']) {
      const H = bone(ch, S + 'Hand'); if (!H) continue;
      const rec = { H, f: {} };
      const hw = restW(H); if (!hw) continue;
      const hp = V().setFromMatrixPosition(hw);
      const m1 = bone(ch, S + 'HandMiddle1'), i1 = bone(ch, S + 'HandIndex1'), k1 = bone(ch, S + 'HandPinky1');
      if (!m1 || !i1 || !k1) continue;
      const fr = V().setFromMatrixPosition(restW(m1)).sub(hp).normalize(), ar = V().setFromMatrixPosition(restW(k1)).sub(V().setFromMatrixPosition(restW(i1))).normalize();
      // which way the palm faces relative to f x a (rest palm faces -Y)
      rec.palmSign = Math.sign(V().crossVectors(fr, ar).dot(V(0, -1, 0))) || 1;
      for (const f of [...FING, 'Thumb']) for (let j = 1; j <= 3; j++) {
        const b = bone(ch, S + 'Hand' + f + j); if (!b) continue;
        const w = restW(b), pw = b.parent && idx.has(b.parent) ? restW(b.parent) : null;
        // rest local rotation (relative to the parent's rest frame)
        const lq = new THREE.Quaternion();
        if (w && pw) { _m.copy(pw).invert().multiply(w); _m.decompose(_a, lq, _b); }
        rec.f[f + j] = { b, lq };
      }
      out[S] = rec;
    }
  }
  ch._seatHands = Object.keys(out).length ? out : null;
  return ch._seatHands;
}
/** current hand basis: f = wrist -> middle knuckle, a = index -> pinky knuckle (orthonormalized) */
function handBasis(ch, S, f, a) {
  const H = bone(ch, S + 'Hand'), m1 = bone(ch, S + 'HandMiddle1'), i1 = bone(ch, S + 'HandIndex1'), k1 = bone(ch, S + 'HandPinky1');
  if (!H || !m1 || !i1 || !k1) return false;
  f.copy(wp(m1, _a)).sub(wp(H, _b)).normalize();
  a.copy(wp(k1, _a)).sub(wp(i1, _b)); a.addScaledVector(f, -a.dot(f)).normalize();
  return true;
}
const basisQ = (f, a, out) => { _c.crossVectors(f, a); _m2.makeBasis(f, a, _c); return out.setFromRotationMatrix(_m2); };
/** turn the hand so its basis becomes (fDes, aDes) */
function orientHand(ch, S, fDes, aDes, k = 1) {
  const H = bone(ch, S + 'Hand'); const f = V(), a = V();
  if (!H || !handBasis(ch, S, f, a)) return;
  const ad = V().copy(aDes).addScaledVector(fDes, -aDes.dot(fDes)).normalize();
  const qc = basisQ(f, a, new THREE.Quaternion()), qd = basisQ(V().copy(fDes).normalize(), ad, new THREE.Quaternion());
  const dq = qd.multiply(qc.invert());
  if (k < 1) dq.slerp(new THREE.Quaternion(), 1 - k);
  rotWorld(H, dq);
}
/** curl the fingers: reset to the rest pose, then flex each joint toward the palm. c = [mcp, pip, dip] degrees,
 *  thumb = [cmc, mcp, ip] degrees, spread (deg, + = fan out) */
function curlHand(ch, S, c, thumb, spread = 0) {
  const R = handRig(ch)?.[S]; if (!R) return;
  const H = R.H; const f = V(), a = V();
  if (!handBasis(ch, S, f, a)) return;
  const palm = V().crossVectors(f, a).multiplyScalar(R.palmSign).normalize();
  for (const k in R.f) R.f[k].b.quaternion.copy(R.f[k].lq);
  H.updateMatrixWorld(true);
  const ax = V(), dir = V(), q = new THREE.Quaternion();
  FING.forEach((fn, i) => {
    for (let j = 1; j <= 3; j++) {
      const e = R.f[fn + j]; if (!e) continue;
      const child = R.f[fn + (j + 1)]?.b;
      if (child) dir.copy(wp(child, _a)).sub(wp(e.b, _b)); else dir.copy(wp(e.b, _a)).sub(wp(R.f[fn + (j - 1)]?.b || H, _b));
      ax.crossVectors(dir, palm); if (ax.lengthSq() < 1e-10) continue; ax.normalize();
      // pinky and ring curl a touch more than the index (a real relaxed / gripping hand), all four stay together
      const ang = c[j - 1] * (1 + i * 0.05) * D2R;
      q.setFromAxisAngle(ax, ang); rotWorld(e.b, q);
      if (j === 1 && spread) { q.setFromAxisAngle(palm, (i - 1.5) * spread * D2R * (S === 'Left' ? 1 : -1)); rotWorld(e.b, q); }
    }
  });
  if (thumb) for (let j = 1; j <= 3; j++) {
    const e = R.f['Thumb' + j]; if (!e) continue;
    const child = R.f['Thumb' + (j + 1)]?.b;
    if (child) dir.copy(wp(child, _a)).sub(wp(e.b, _b)); else dir.copy(wp(e.b, _a)).sub(wp(R.f['Thumb' + (j - 1)]?.b || H, _b));
    ax.crossVectors(dir, palm); if (ax.lengthSq() < 1e-10) continue; ax.normalize();
    q.setFromAxisAngle(ax, thumb[j - 1] * D2R); rotWorld(e.b, q);
    // the thumb also swings in toward the index (opposition)
    if (j === 1) { q.setFromAxisAngle(palm, (S === 'Left' ? -1 : 1) * thumb[0] * 0.5 * D2R); rotWorld(e.b, q); }
  }
}

// ---------------------------------------------------------------- the solver
function changed(ch, S) {
  // the mixer only runs on some frames for far people: when no bone moved since our last solve, skip (the solve is not
  // idempotent for the corrective swings, and the bones still hold last frame's solved pose)
  const b = bone(ch, 'RightForeArm'); if (!b) return true;
  if (S.lastQ && S.lastQ.equals(b.quaternion)) return false;
  return true;
}
function solve(ch, S, dt) {
  const A = S.anchor, root = ch.root, shell = root.parent; if (!shell) return;
  if (!changed(ch, S)) return;
  shell.updateWorldMatrix(true, false);
  root.updateMatrixWorld(true);
  const sm = shell.matrixWorld;
  const up = V().setFromMatrixColumn(sm, 1).normalize(), fwd = V().setFromMatrixColumn(sm, 2).normalize(), left = V().setFromMatrixColumn(sm, 0).normalize();
  // the seat frame turns with the anchor's yaw
  if (A.yaw) { _q.setFromAxisAngle(up, A.yaw); fwd.applyQuaternion(_q); left.applyQuaternion(_q); }
  const toW = (v, out = V()) => out.copy(v).applyMatrix4(sm);
  const Hips = bone(ch, 'Hips'), LU = bone(ch, 'LeftUpLeg'), RU = bone(ch, 'RightUpLeg'), Sp = bone(ch, 'Spine'), Neck = bone(ch, 'Neck'), Head = bone(ch, 'Head');
  if (!Hips || !LU || !RU) return;
  const scale = S.scale || 1;
  const w = THREE.MathUtils.clamp(S.w ?? 1, 0, 1);   // blend-in weight (entering the car)
  // ---- 1. torso recline against the backrest (absolute: measured, then corrected)
  const recline = (S.recline ?? 16) + (S.extraRecline || 0) - (S.reachLean || 0);
  if (Sp && Neck) {
    const hipMid = V().addVectors(wp(LU, _a), wp(RU, _b)).multiplyScalar(0.5);
    const tor = V().copy(wp(Neck, _a)).sub(hipMid);
    const want = V().copy(up).multiplyScalar(Math.cos(recline * D2R)).addScaledVector(fwd, -Math.sin(recline * D2R));
    // only the pitch (keep the side lean / twist of the clip)
    const curP = Math.atan2(-tor.dot(fwd), tor.dot(up)), wantP = recline * D2R;
    _q.setFromAxisAngle(left, -(wantP - curP) * w); rotWorld(Sp, _q);
    void want;
  }
  // ---- 2. hips on the H-point
  const mid = V().addVectors(wp(LU, _a), wp(RU, _b)).multiplyScalar(0.5);
  const hipW = toW(A.hip);
  // a short driver slides the seat forward on its track before leaning in
  if (S.slide) hipW.addScaledVector(fwd, S.slide);
  const sink = S.sink || 0;
  hipW.addScaledVector(up, -sink);
  const delta = V().copy(hipW).sub(mid);
  // delta is in world space: express it in the root's parent (shell) space
  const inv = (S._inv ||= new THREE.Matrix4()).copy(sm).invert();
  const p0 = V().copy(root.position);
  const pw = V().copy(p0).applyMatrix4(sm).add(delta).applyMatrix4(inv);
  root.position.copy(pw);
  root.updateMatrixWorld(true);
  // eyes on the road: the head stays near upright whatever the recline (absolute), plus the head-room chin tuck
  if (Neck && Head) {
    const hv = V().copy(wp(Head, _a)).sub(wp(Neck, _b));
    const hp = Math.atan2(-hv.dot(fwd), hv.dot(up)) / D2R;   // + = tipped back
    const want = (S.role === 'driver' ? -3 : 2) - (S.chin || 0);
    _q.setFromAxisAngle(left, (hp - want) * D2R * w); rotWorld(Neck, _q);
  }
  // ---- 3. head under the roof: crown = head joint + 0.2 m along the neck -> head line
  if (Head && Neck && Number.isFinite(A.roofY) && !S.open) {
    const hd = wp(Head, V()), nk = wp(Neck, V());
    const crown = V().copy(hd).addScaledVector(V().copy(hd).sub(nk).normalize(), 0.17 * scale);
    const crownY = V().copy(crown).applyMatrix4(inv).y;
    const over = crownY - (A.roofY - 0.02);
    if (over > 0.004 && S.fit < 24) { S.fit++; if ((S.extraRecline || 0) < 14) S.extraRecline = Math.min(14, (S.extraRecline || 0) + Math.max(1, over * 60)); else if (sink < 0.06) S.sink = Math.min(0.06, sink + Math.max(0.005, over)); else S.chin = Math.min(14, (S.chin || 0) + Math.max(1, over * 80)); }
  }
  // ---- 4. legs to the footwell
  const heelW = toW(A.heel);
  const legs = [['Left', 1], ['Right', -1]];
  const driver = S.role === 'driver';
  for (const [s, sg] of legs) {
    const U = bone(ch, s + 'UpLeg'), L = bone(ch, s + 'Leg'), F = bone(ch, s + 'Foot'), T = bone(ch, s + 'ToeBase');
    if (!U || !L || !F) continue;
    const hipJ = wp(U, V());
    const sideOff = V().copy(hipJ).sub(hipW).dot(left);
    // feet a little wider than the hips; the driver's right foot sits on the gas pedal (further right and forward)
    const ped = driver && s === 'Right';
    const tgt = V().copy(heelW).addScaledVector(left, sideOff * 1.25 + (ped ? -0.05 : sg * 0.02)).addScaledVector(fwd, ped ? 0.04 : -0.01).addScaledVector(up, 0.075 * scale);
    // knee pole: up, forward and a little out (knees apart)
    const pole = V().copy(hipJ).addScaledVector(up, 0.6).addScaledVector(fwd, 0.5).addScaledVector(left, sg * 0.18);
    // feet stay on the floor but within reach: knees always keep some bend (a car seat never has straight legs)
    const legLen = wp(U, _a).distanceTo(wp(L, _b)) + wp(L, _a).distanceTo(wp(F, _b));
    { const dv = V().copy(tgt).sub(hipJ); const dy = dv.dot(up); const hz = V().copy(dv).addScaledVector(up, -dy); const reach = legLen * 0.9;
      if (dv.length() > reach && reach > Math.abs(dy)) { const hl = Math.sqrt(reach * reach - dy * dy); hz.setLength(hl); tgt.copy(hipJ).add(hz).addScaledVector(up, dy); } }
    twoBone(U, L, F, tgt, pole, w);
    // keep the knee out of the door / center console
    if (Number.isFinite(A.doorX)) {
      const kn = wp(L, V()).applyMatrix4(inv); const lim = A.doorX - 0.07;
      if (Math.abs(kn.x) > lim) { /* rare: very narrow cars; the IK pole already keeps knees forward */ }
    }
    // foot: heel down, toes up (pedal foot more)
    if (T) {
      const fd = V().copy(wp(T, _a)).sub(wp(F, _b));
      const pitch = (ped ? 26 : 12) * D2R;
      const want = V().copy(fwd).multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch)).addScaledVector(left, sg * 0.12).normalize();
      swing(F, fd, want, w);
      // the toe base flat with the foot
      const td = V().copy(wp(T, _a)).sub(wp(F, _b));
      void td;
    }
  }
  // ---- 5. arms and hands
  const doorX = Number.isFinite(A.doorX) ? A.doorX : 0.75;
  for (const [s, sg] of legs) {
    const Ar = bone(ch, s + 'Arm'), Fa = bone(ch, s + 'ForeArm'), Hn = bone(ch, s + 'Hand');
    if (!Ar || !Fa || !Hn) continue;
    const sh = wp(Ar, V());
    if (driver && A.wheel) {
      const W = A.wheel; const c = toW(W.c); const tilt = W.tilt ?? 0.38; const r = (W.r ?? 0.19) * 1.0;
      // wheel plane: U = in-plane up (top leans forward), X = car left, N = toward the driver (up and back)
      const U = V().copy(up).multiplyScalar(Math.cos(tilt)).addScaledVector(fwd, Math.sin(tilt));
      const N = V().copy(up).multiplyScalar(Math.sin(tilt)).addScaledVector(fwd, -Math.cos(tilt));
      // ten-to-two, turning with the wheel (hands follow it about 70 degrees, then hold)
      const steer = THREE.MathUtils.clamp((S.vehicle?.steerCur || 0) * 3.2, -1.2, 1.2);
      S.steer = THREE.MathUtils.lerp(S.steer || 0, steer, 1 - Math.exp(-(dt || 0.016) * 10));
      const ang = (sg * 62) * D2R - S.steer;
      const R = V().copy(left).multiplyScalar(Math.sin(ang)).addScaledVector(U, Math.cos(ang)).normalize();
      const Tup = V().crossVectors(N, R).normalize(); if (Tup.dot(U) < 0 && Math.abs(ang) < 1.4) Tup.negate();
      const g = V().copy(c).addScaledVector(R, r);
      // palm just behind the rim (the rim is ~3.5 cm thick), the wrist back along the fingers
      // a handshake grip: fingers forward around the front of the rim, thumb up on the inside, palm facing the hub
      const fDes = V().copy(N).multiplyScalar(-0.86).addScaledVector(R, -0.4).addScaledVector(Tup, 0.12).normalize();
      const aDes = V().copy(Tup).negate();
      const palmC = V().copy(g).addScaledVector(R, 0.034 * scale).addScaledVector(N, 0.012);
      const wrist = V().copy(palmC).addScaledVector(fDes, -0.072 * scale);
      // elbow: down, out and back; never through the door
      const pole = V().copy(sh).addScaledVector(up, -0.7).addScaledVector(left, sg * (0.35 - 0.07 * (S.elbowIn?.[s] || 0))).addScaledVector(fwd, -0.15);
      twoBone(Ar, Fa, Hn, wrist, pole, w);
      // out of reach: sit up / lean toward the wheel a little (next frames), never through the roof
      { const armLen = wp(Ar, _a).distanceTo(wp(Fa, _b)) + wp(Fa, _a).distanceTo(wp(Hn, _b)); const short = sh.distanceTo(wrist) - armLen * 0.94;   // elbows keep a bend
        if (short > 0.004 && S.reachFit < 24) { S.reachFit = (S.reachFit || 0) + 1; if ((S.slide || 0) < 0.08) S.slide = Math.min(0.08, (S.slide || 0) + Math.max(0.01, short * 0.8)); else S.reachLean = Math.min(12, (S.reachLean || 0) + Math.max(0.8, short * 50)); } }
      orientHand(ch, s, fDes, aDes, w);
      curlHand(ch, s, [58 * w, 78 * w, 44 * w], [18 * w, 22 * w, 20 * w], 0);
    } else {
      // passenger (or a driver with no wheel): hands rest on the thighs, palms down, fingers relaxed
      const U = bone(ch, s + 'UpLeg'), L = bone(ch, s + 'Leg'); if (!U || !L) continue;
      const hj = wp(U, V()), kn = wp(L, V());
      const thigh = V().copy(kn).sub(hj);
      const tgt = V().copy(hj).addScaledVector(thigh, 0.5).addScaledVector(up, 0.085 * scale).addScaledVector(left, -sg * 0.02);
      const fDes = V().copy(thigh).normalize().addScaledVector(left, -sg * 0.25).addScaledVector(up, -0.25).normalize();
      const wrist = V().copy(tgt).addScaledVector(fDes, -0.07 * scale);
      const pole = V().copy(sh).addScaledVector(up, -0.6).addScaledVector(left, sg * (0.3 - 0.07 * (S.elbowIn?.[s] || 0))).addScaledVector(fwd, -0.3);
      twoBone(Ar, Fa, Hn, wrist, pole, w);
      orientHand(ch, s, fDes, V().copy(left).multiplyScalar(sg), w);
      curlHand(ch, s, [16, 24, 12], [8, 14, 10], -2);
    }
    // elbow inside the door panel
    const el = wp(Fa, V()).applyMatrix4(inv);
    const lim = doorX - 0.06;
    // an elbow through the door panel swings its pole inward on the next frames
    if (Math.sign(el.x) === Math.sign(A.hip.x || sg) && Math.abs(el.x) > lim && S.elbowFix < 12) { S.elbowFix++; (S.elbowIn ||= {})[s] = Math.min(6, (S.elbowIn[s] || 0) + 1); }
  }
  const rf = bone(ch, 'RightForeArm'); S.lastQ = (S.lastQ || new THREE.Quaternion()).copy(rf.quaternion);
}

/** put a character into a seat (anchor in the space of the character root's parent, normally the car shell) */
export function seatCharacter(ch, anchor, opts = {}) {
  if (!ch?.root || !anchor) return false;
  const role = opts.role || (anchor.id === 'driver' || anchor.i === 0 ? 'driver' : 'passenger');
  ch.root.rotation.set(0, anchor.yaw || 0, 0);
  ch.root.scale.setScalar(1);
  const vs = opts.vehicle?.spec || null;
  const S = { open: !!(opts.open ?? (vs && (vs.convertible || vs.roadster || vs.cls === 'roadster' || vs.bike))), anchor, role, vehicle: opts.vehicle || null, fit: 0, reachFit: 0, reachLean: 0, slide: 0, elbowFix: 0, sink: 0, extraRecline: 0, chin: 0, steer: 0,
    scale: (ch.archetype?.height || ch.personMeta?.height || 1.78) / 1.78 };
  ch._seat = S;
  if (!ch._seatWrapped) {
    const orig = ch.update;
    ch.update = function (dt, anim = {}) {
      const r = orig.call(this, dt, anim);
      const s = ch._seat;
      if (s && anim.driving && !anim.dead) { try { solve(ch, s, dt); } catch (e) { if (!s.warned) { s.warned = true; console.warn('[seat] solve', e); } } }
      return r;
    };
    ch._seatWrapped = true;
  }
  // settle: a few solves so the head-room fit converges before the first frame is seen
  for (let i = 0; i < 6; i++) { S.lastQ = null; ch.update(i ? 0.016 : 0.5, { driving: true, speed: 0, grounded: true }); }
  return true;
}
export function unseatCharacter(ch) { if (ch) ch._seat = null; }
/** create one of the user's people, add it to the shell and seat it (null while none fits / is loaded yet) */
export function createSeatedPerson(game, shell, anchor, opts = {}) {
  const ch = game.npc?.createDriver?.({ pos: opts.pos, role: opts.role || (anchor.i ? 'passenger' : 'driver'), seed: opts.seed, gender: opts.gender });
  if (!ch) return null;
  ch.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  shell.add(ch.root);
  seatCharacter(ch, anchor, opts);
  return ch;
}

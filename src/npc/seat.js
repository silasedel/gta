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


// ---------------------------------------------------------------- seat probe (never trust a stale anchor)
// Rays against the car's own meshes, once per car model + seat: down from above the anchor's hip onto the cushion
// (the H-point sits ~10 cm above the compressed cushion) and up to the headliner. A re-converted or swapped model whose
// anchor was not re-derived still seats people on its real cushion and under its real roof.
const PROBES = new Map();
const _rc = new THREE.Raycaster();
function isPersonPart(o) { for (let p = o; p; p = p.parent) { if (p.name && /^(npc-|character-)/.test(p.name)) return true; } return false; }
export function probeSeat(shell, anchor, key = null) {
  // per car MODEL + seat: the model key when given, else the anchor's own numbers (identical for every car of a model)
  const h0 = anchor.hip;
  const k = (key || ('a' + h0.x.toFixed(3) + ',' + h0.y.toFixed(3) + ',' + h0.z.toFixed(3) + ',' + (anchor.roofY ?? 0).toFixed?.(3))) + ':' + (anchor.id || anchor.i);
  if (k && PROBES.has(k)) return PROBES.get(k);
  const out = { cushionY: null, roofY: null };
  try {
    shell.updateWorldMatrix(true, true);
    const meshes = []; shell.traverse((o) => { if (o.isMesh && o.visible !== false && !o.isSkinnedMesh && !o.isInstancedMesh && !isPersonPart(o)) meshes.push(o); });
    const glass = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return !!(m && (m.transparent || m.transmission > 0 || /glass|window/i.test((m.name || '') + (o.name || '')))); };
    const W = (x, y, z) => shell.localToWorld(new THREE.Vector3(x, y, z));
    const h = anchor.hip;
    const dn = shell.localToWorld(new THREE.Vector3(0, -1, 0)).sub(shell.localToWorld(new THREE.Vector3())).normalize();
    // single-sided shells must still stop the rays from inside (the roof seen from below is a back face)
    const sides = []; for (const o of meshes) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && m.side !== THREE.DoubleSide) { sides.push([m, m.side]); m.side = THREE.DoubleSide; }
    try {
      // cushion: under the thighs (a little ahead of the hip joint), the highest plausible hit of three rays
      let best = null;
      for (const [dx, dz] of [[0, 0.08], [0.06, 0.14], [-0.06, 0.14]]) {
        _rc.set(W(h.x + dx, h.y + 0.32, h.z + dz), dn); _rc.far = 0.95;
        for (const i of _rc.intersectObjects(meshes, false)) {
          if (glass(i.object)) continue;
          const y = shell.worldToLocal(i.point.clone()).y;
          if (y > h.y + 0.05) continue;                // dash, wheel, visor or roof above the anchor: keep looking down
          if (y > h.y - 0.25 && (best === null || y > best)) best = y;   // a cushion is never far from the H-point
          break;
        }
      }
      out.cushionY = best;
      // headliner: straight up from where the head is (a little behind the hip), glass roofs count as roof
      const y0 = (best ?? h.y - 0.1) + 0.35;
      let roof = null;
      for (const [dx, dz] of [[0, -0.12], [0, -0.02]]) {
        _rc.set(W(h.x + dx, y0, h.z + dz), dn.clone().negate()); _rc.far = 1.4;
        const hit = _rc.intersectObjects(meshes, false)[0];
        if (!hit) continue;
        const y = shell.worldToLocal(hit.point.clone()).y;
        if (roof === null || y < roof) roof = y;
      }
      out.roofY = roof;
    } finally { for (const [m, sd] of sides) m.side = sd; }
  } catch (e) { /* keep the anchor */ }
  if (k) PROBES.set(k, out);
  return out;
}

// ---------------------------------------------------------------- the solver
const WATCH = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
function changed(ch, S) {
  // three's mixer only rewrites a bone whose animated value changed, and far people animate on some frames only: solve
  // whenever ANY watched bone differs from what the last solve left (a static arm with a breathing spine must re-solve)
  if (!S.lastQs) return true;
  for (let i = 0; i < WATCH.length; i++) { const b = bone(ch, WATCH[i]); if (b && !S.lastQs[i].equals(b.quaternion)) return true; }
  return false;
}
function remember(ch, S) { S.lastQs ||= WATCH.map(() => new THREE.Quaternion()); WATCH.forEach((n, i) => { const b = bone(ch, n); if (b) S.lastQs[i].copy(b.quaternion); }); }
function solve(ch, S, dt) {
  const A = S.anchor, root = ch.root, shell = root.parent; if (!shell) return;
  if (!changed(ch, S)) { if (S.manual && S.lastRoot) { root.position.copy(S.lastRoot); root.rotation.set(0, S.yawNow ?? A.yaw ?? 0, 0); } return; }
  S.t = (S.t || 0) + (dt || 0);
  if (S.manual) { S.yawNow = (A.yaw || 0) + (S.life ? Math.sin(S.t * 0.11 + S.life.p1) * 0.04 : 0); root.rotation.set(0, S.yawNow, 0); }
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
  // subtle life (furniture sitters): slow breathing-scale recline drift and weight shifts, desynchronized per person
  const lifeR = S.life ? Math.sin(S.t * 0.35 + S.life.p0) * 1.4 + Math.sin(S.t * 0.07 + S.life.p1) * 2.2 : 0;
  const recline = (S.fixRecline ?? A.recline ?? S.recline ?? 16) + lifeR + (S.extraRecline || 0) - (S.reachLean || 0);
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
  const hipW = toW(S.hip || A.hip);   // probed: the cushion under a stale / high anchor
  if (A.standing) { const lu = bone(ch, 'LeftUpLeg'), ll = bone(ch, 'LeftLeg'), lf = bone(ch, 'LeftFoot');
    if (lu && ll && lf) { const legLen = wp(lu, _a).distanceTo(wp(ll, _b)) + wp(ll, _a).distanceTo(wp(lf, _b)); const hy = A.heel.y + legLen * 0.985 + 0.075 * scale; hipW.copy(toW(_c.set((S.hip || A.hip).x, hy, (S.hip || A.hip).z))); } }
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
  const roofY = Number.isFinite(S.roofY) ? S.roofY : A.roofY;
  if (Head && Neck && Number.isFinite(roofY) && !S.open) {
    const hd = wp(Head, V()), nk = wp(Neck, V());
    const crown = V().copy(hd).addScaledVector(V().copy(hd).sub(nk).normalize(), 0.2 * scale);   // same crown as tools/v2/cars/headroom.mjs
    const crownY = V().copy(crown).applyMatrix4(inv).y;
    const over = crownY - (roofY - 0.04);
    if (over > 0.004 && S.fit < 60) { S.fit++; if ((S.reachLean || 0) > 0) { S.reachLean = Math.max(0, S.reachLean - Math.max(1, over * 60)); S.headFirst = true; } else if (sink < 0.08) S.sink = Math.min(0.08, sink + Math.max(0.006, over));   // upright first: sink into the cushion
      else if ((S.extraRecline || 0) < Math.min(14, S.maxExtra ?? 14)) S.extraRecline = Math.min(14, S.maxExtra ?? 14, (S.extraRecline || 0) + Math.max(1, over * 60)); else if ((S.chin || 0) < 14) S.chin = Math.min(14, (S.chin || 0) + Math.max(1, over * 80)); else if (sink < 0.12) S.sink = Math.min(0.12, sink + Math.max(0.006, over)); else S.extraRecline = Math.min(S.maxExtra ?? 26, (S.extraRecline || 0) + Math.max(1, over * 60)); }
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
    { const dv = V().copy(tgt).sub(hipJ); const dy = dv.dot(up); const hz = V().copy(dv).addScaledVector(up, -dy); const reach = legLen * (A.standing ? 0.985 : 0.9);
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
      const pitch = (A.standing ? 0 : ped ? 26 : 12) * D2R;
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
    const grip = A.grips?.find((q) => q.side === s);
    if (grip) {
      // a stick / lever / helm grip given by the vehicle (boats): wrist just behind the grip, fist around it
      const gw = toW(grip.p); const fDes = V().copy(fwd).multiplyScalar(0.7).addScaledVector(up, -0.35).addScaledVector(left, -sg * 0.35).normalize();
      const wrist = V().copy(gw).addScaledVector(fDes, -0.07 * scale);
      const pole = V().copy(sh).addScaledVector(up, -0.7).addScaledVector(left, sg * 0.35).addScaledVector(fwd, -0.15);
      twoBone(Ar, Fa, Hn, wrist, pole, w);
      orientHand(ch, s, fDes, V().copy(up).multiplyScalar(-1).addScaledVector(left, sg * 0.2).normalize(), w);
      curlHand(ch, s, [55 * w, 75 * w, 42 * w], [14 * w, 14 * w, 8 * w], 0);
    } else if (driver && A.wheel && !A.grips) {
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
        if (short > 0.004 && S.reachFit < 24 && !S.headFirst) {   // the head under the roof wins over arm reach
 S.reachFit = (S.reachFit || 0) + 1; if ((S.slide || 0) < 0.08) S.slide = Math.min(0.08, (S.slide || 0) + Math.max(0.01, short * 0.8)); else S.reachLean = Math.min(12, (S.reachLean || 0) + Math.max(0.8, short * 50)); } }
      orientHand(ch, s, fDes, aDes, w);
      curlHand(ch, s, [58 * w, 78 * w, 44 * w], [14 * w, 14 * w, 8 * w], 0);
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
  // look around now and then (head yaw on the neck), low amplitude
  if (S.life && Neck) { const look = Math.sin(S.t * 0.13 + S.life.p2) * 0.6 + Math.sin(S.t * 0.031 + S.life.p0) * 0.4; _q.setFromAxisAngle(up, look * 0.32 * w); rotWorld(Neck, _q); }
  if (S.manual) S.lastRoot = (S.lastRoot || new THREE.Vector3()).copy(root.position);
  remember(ch, S);
}

/** put a character into a seat (anchor in the space of the character root's parent, normally the car shell) */
const _wp0 = new THREE.Vector3();
/** the camera the far-skip measures against (set by seatCharacter from opts.game / the vehicle's game) */
export const S_CAM = { cam: null };
// per car model + seat id (shell space): hipDY moves the H-point down (m), recline is the whole recline (deg), maxExtra caps
// the head-room ladder's extra recline on top of it (debug: globalThis.__seatFix overrides entries live)
export const SEAT_FIX = (typeof globalThis !== 'undefined' && globalThis.__seatFix) || {
  coupe4: { driver: { hipDY: -0.2, recline: 17 }, front: { hipDY: -0.2, recline: 17 } },   // Nico's crown ~6 cm under the headliner
};
if (typeof globalThis !== 'undefined') globalThis.__seatFix = SEAT_FIX;
export function seatCharacter(ch, anchor, opts = {}) {
  if (opts.game?.camera) S_CAM.cam = opts.game.camera; else if (!S_CAM.cam && typeof window !== 'undefined' && window.game?.camera) S_CAM.cam = window.game.camera;
  if (!ch?.root || !anchor) return false;
  const role = opts.role || (anchor.id === 'driver' || anchor.i === 0 ? 'driver' : 'passenger');
  ch.root.rotation.set(0, anchor.yaw || 0, 0);
  ch.root.scale.setScalar(1);
  const vs = opts.vehicle?.spec || null;
  const S = { open: !!(opts.open ?? anchor.open ?? (vs && (vs.convertible || vs.roadster || vs.cls === 'roadster' || vs.bike))), anchor, role, vehicle: opts.vehicle || null, fit: 0, reachFit: 0, reachLean: 0, slide: 0, elbowFix: 0, sink: 0, extraRecline: 0, chin: 0, steer: 0,
    scale: (ch.archetype?.height || ch.personMeta?.height || 1.78) / 1.78, isPlayer: !!(ch.isNico || opts.player) };
  ch._seat = S;
  // probe the real cushion and headliner of this car (cached per model + seat)
  if (opts.probe !== false && ch.root.parent) {
    const v = opts.vehicle; const pr = probeSeat(ch.root.parent, anchor, v ? (v.typeKey || v.spec?.key || v.spec?.name || null) : null);
    S.probe = pr;
    if (Number.isFinite(pr.cushionY) && !anchor.fixed) {   // hand-checked anchors (seats.py seatFix: fixed) keep their hip
      const want = pr.cushionY + 0.1;      // H-point ~10 cm above the compressed cushion
      if (Math.abs(anchor.hip.y - want) > 0.04) S.hip = anchor.hip.clone().setY(want);
    }
    if (Number.isFinite(pr.roofY) && !S.open) S.roofY = Number.isFinite(anchor.roofY) ? Math.min(anchor.roofY, pr.roofY) : pr.roofY;
  }
  // hand-set seats for cars whose low roof the generic fit can't meet without folding the driver (user, coupe4: "his head
  // STILL pokes through"): a lower hip and a fixed, moderate recline, as old muscle cars are driven
  const fx = SEAT_FIX[opts.vehicle?.typeKey]?.[anchor.id];
  if (fx) { S.hip = anchor.hip.clone(); S.hip.y += fx.hipDY; if (fx.dz) S.hip.z += fx.dz; S.fixRecline = fx.recline; S.maxExtra = fx.maxExtra ?? 2; }
  if (opts.manual) { S.manual = true; S.life = opts.life || { p0: Math.random() * 6.28, p1: Math.random() * 6.28, p2: Math.random() * 6.28 }; return true; }
  if (!ch._seatWrapped) {
    const orig = ch.update;
    ch.update = function (dt, anim = {}) {
      const s0 = ch._seat;
      // far from the camera a seated person holds the last solved pose (no mixer, no solve): a person seen through car
      // glass beyond ~45 m does not need breathing or steering hands, and it keeps traffic cheap
      if (s0 && s0.solved && anim.driving && !s0.isPlayer && S_CAM.cam) {
        ch.root.getWorldPosition(_wp0);
        if (_wp0.distanceToSquared(S_CAM.cam.position) > 45 * 45) return null;
      }
      const r = orig.call(this, dt, anim);
      const s = ch._seat;
      if (s && anim.driving && !anim.dead) { try { solve(ch, s, dt); s.solved = true; } catch (e) { if (!s.warned) { s.warned = true; console.warn('[seat] solve', e); } } }
      return r;
    };
    ch._seatWrapped = true;
  }
  // settle: a few solves so the head-room fit converges before the first frame is seen
  for (let i = 0; i < 6; i++) { S.lastQs = null; ch.update(i ? 0.016 : 0.5, { driving: true, speed: 0, grounded: true }); }
  return true;
}
export function unseatCharacter(ch) { if (ch) ch._seat = null; }
/** run the seat pose once (manual sitters: call right after the character's own update each frame) */
export function solveSeat(ch, dt) { const s = ch?._seat; if (!s) return; try { solve(ch, s, dt); } catch (e) { if (!s.warned) { s.warned = true; console.warn('[seat] solve', e); } } }
/** tallest person (standing height incl. hair / hat, meters) whose seated crown clears this seat's real roof by >= 5 cm:
 *  seated crown above the cushion ~0.52 x stature (+ 2 cm sink allowance); open cars / boats: no limit */
export function seatMaxHeight(shell, anchor, opts = {}) {
  const vs = opts.vehicle?.spec;
  if (!shell || !anchor || anchor.open || (vs && (vs.convertible || vs.roadster || vs.cls === 'roadster'))) return Infinity;
  const pr = probeSeat(shell, anchor, opts.key || null);
  const cushion = Number.isFinite(pr.cushionY) && !anchor.fixed ? pr.cushionY : anchor.hip.y - 0.1;
  const roof = Number.isFinite(pr.roofY) ? (Number.isFinite(anchor.roofY) ? Math.min(anchor.roofY, pr.roofY) : pr.roofY) : anchor.roofY;
  if (!Number.isFinite(roof)) return Infinity;
  return (roof - cushion - 0.08) / 0.56;   // r2-cars' headroom run 4: 0.52 / 5 cm let 4-8 cm more head through
}
/** create one of the user's people, add it to the shell and seat it (null while none fits / is loaded yet) */
export function createSeatedPerson(game, shell, anchor, opts = {}) {
  const ch = game.npc?.createDriver?.({ pos: opts.pos, role: opts.role || (anchor.i ? 'passenger' : 'driver'), seed: opts.seed, gender: opts.gender, anchor, shell, vehicle: opts.vehicle });
  if (!ch) return null;
  ch.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  shell.add(ch.root);
  seatCharacter(ch, anchor, opts);
  return ch;
}

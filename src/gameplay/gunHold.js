// How hands hold weapons (player, police, any Mixamo-rigged character).
// Weapon models have their origin at the grip (palm center on the handle), +Z barrel, +Y up, +X the gun's left side.
// The hand frame comes from the bones: F = wrist -> middle knuckle, S = pinky -> index knuckle (index side),
// N = palm normal (the side the thumb closes over). A right hand holds a gun with Z ~ F, Y ~ S, X ~ N.
//   holdWeapon(model, root, { aim, recoil, kick, reload, dt, low })
//     aim: world point -> aim pose (two-bone IK: long guns shouldered at the right shoulder pocket, handguns pushed out
//          in a two-handed grip); null -> handguns / melee follow the animated hand, long guns sit at low ready.
// Bone edits are applied after the animation mixer and before rendering; fingers curl around the grip.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const NAMES = {
  hand: 'RightHand', fore: 'RightForeArm', arm: 'RightArm', lhand: 'LeftHand', lfore: 'LeftForeArm', larm: 'LeftArm',
};
const FING = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'];
function find(root, suffix) { let f = null; root.traverse((o) => { if (!f && (o.isBone || o.type === 'Bone') && o.name.endsWith(suffix)) f = o; }); return f; }
// bones of a character root (cached on the root)
export function rigOf(root) {
  if (!root) return null;
  let r = root.userData.__gunRig;
  if (r && r.hand && r.hand.parent) return r;
  r = {};
  for (const k in NAMES) r[k] = find(root, NAMES[k]);
  for (const side of ['Right', 'Left']) for (const f of FING) for (let i = 1; i <= 3; i++) r[side + 'Hand' + f + i] = find(root, side + 'Hand' + f + i);
  r.rest = new Map();   // finger rest rotations: curls are applied from rest every frame (clips may not key fingers)
  for (const side of ['Right', 'Left']) for (const f of FING) for (let i = 1; i <= 3; i++) { const b = r[side + 'Hand' + f + i]; if (b) r.rest.set(b, b.quaternion.clone()); }
  r.ok = !!(r.hand && r.fore && r.arm && r.RightHandMiddle1 && r.RightHandIndex1 && r.RightHandPinky1);
  r.lok = !!(r.lhand && r.lfore && r.larm && r.LeftHandMiddle1 && r.LeftHandIndex1 && r.LeftHandPinky1);
  Object.defineProperty(root.userData, '__gunRig', { value: r, enumerable: false, configurable: true, writable: true });
  return r;
}
const wp = (o, v) => o.getWorldPosition(v);
// hand frame in world space: { o: wrist, F, S, N }
function frame(r, side, out) {
  const P = side === 'R' ? 'RightHand' : 'LeftHand', h = side === 'R' ? r.hand : r.lhand;
  wp(h, out.o); wp(r[P + 'Middle1'], out.F).sub(out.o); out.len = out.F.length(); out.F.normalize();
  wp(r[P + 'Index1'], out.S); wp(r[P + 'Pinky1'], _a); out.S.sub(_a); out.S.addScaledVector(out.F, -out.S.dot(out.F)).normalize();
  out.N.crossVectors(out.F, out.S).normalize();
  const th = r[P + 'Thumb2'] || r[P + 'Thumb1'];
  if (th) { wp(th, _a).sub(out.o); if (_a.dot(out.N) < 0) out.N.negate(); }
  return out;
}
const mkFrame = () => ({ o: new THREE.Vector3(), F: new THREE.Vector3(), S: new THREE.Vector3(), N: new THREE.Vector3(), len: 0.09 });
const FR = mkFrame(), FL = mkFrame();
// rotate a bone by a world-space quaternion
function rotW(bone, q) {
  bone.getWorldQuaternion(_q2); _q2.premultiply(q);
  bone.parent.getWorldQuaternion(_q).invert(); bone.quaternion.copy(_q.multiply(_q2)); bone.updateMatrixWorld(true);
}
// two-bone IK: upper/lower/end bones, world target, pole hint (world point)
const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _C = new THREE.Vector3(), _T = new THREE.Vector3(), _dir = new THREE.Vector3(), _bend = new THREE.Vector3(), _E = new THREE.Vector3();
function ik2(up, lo, end, target, pole) {
  wp(up, _A); wp(lo, _B); wp(end, _C);
  const la = _A.distanceTo(_B), lb = _B.distanceTo(_C);
  _T.copy(target); _dir.subVectors(_T, _A); let d = _dir.length(); if (d < 1e-4) return; _dir.multiplyScalar(1 / d);
  d = Math.min(d, (la + lb) * 0.999); d = Math.max(d, Math.abs(la - lb) + 1e-3);
  _bend.subVectors(pole, _A); _bend.addScaledVector(_dir, -_bend.dot(_dir)); if (_bend.lengthSq() < 1e-8) _bend.set(0, -1, 0); _bend.normalize();
  const ca = THREE.MathUtils.clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
  _E.copy(_A).addScaledVector(_dir, la * ca).addScaledVector(_bend, la * sa);
  _a.subVectors(_B, _A).normalize(); _b.subVectors(_E, _A).normalize(); _q.setFromUnitVectors(_a, _b); rotW(up, _q.clone());
  wp(lo, _B); wp(end, _C); _T.copy(_A).addScaledVector(_dir, d);
  _a.subVectors(_C, _B).normalize(); _b.subVectors(_T, _B).normalize(); _q.setFromUnitVectors(_a, _b); rotW(lo, _q.clone());
}
// rotate the hand so its frame (F, S) matches the wanted (F, S)
const _M1 = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _x1 = new THREE.Vector3(), _x2 = new THREE.Vector3(), _f2 = new THREE.Vector3(), _s2 = new THREE.Vector3();
function orientHand(r, side, Fw, Sw) {
  const fr = frame(r, side, side === 'R' ? FR : FL);
  _x1.crossVectors(fr.F, fr.S).normalize(); _M1.makeBasis(fr.F, fr.S, _x1);
  _f2.copy(Fw).normalize(); _s2.copy(Sw).addScaledVector(_f2, -Sw.dot(_f2)).normalize(); _x2.crossVectors(_f2, _s2).normalize(); _M2.makeBasis(_f2, _s2, _x2);
  _M2.multiply(_M1.transpose()); _q.setFromRotationMatrix(_M2); rotW(side === 'R' ? r.hand : r.lhand, _q.clone());
}
// curl fingers toward the palm (angles per joint, radians)
const CURL = {
  pistolR: { Index: [0.35, 0.55, 0.3], Middle: [1.1, 1.35, 0.7], Ring: [1.15, 1.35, 0.7], Pinky: [1.2, 1.3, 0.7], Thumb: [0.25, 0.45, 0.3] },
  longR: { Index: [0.4, 0.6, 0.35], Middle: [1.1, 1.35, 0.7], Ring: [1.15, 1.35, 0.7], Pinky: [1.2, 1.3, 0.7], Thumb: [0.3, 0.5, 0.3] },
  meleeR: { Index: [1.0, 1.3, 0.7], Middle: [1.1, 1.35, 0.75], Ring: [1.15, 1.35, 0.75], Pinky: [1.2, 1.3, 0.75], Thumb: [0.45, 0.6, 0.35] },
  supportL: { Index: [0.6, 0.8, 0.4], Middle: [0.75, 0.9, 0.5], Ring: [0.8, 0.95, 0.5], Pinky: [0.85, 0.95, 0.5], Thumb: [0.2, 0.3, 0.2] },
};
function relax(r, side) {
  const P = side === 'R' ? 'RightHand' : 'LeftHand';
  for (const f of FING) for (let i = 1; i <= 3; i++) { const b = r[P + f + i], q = b && r.rest.get(b); if (q) b.quaternion.copy(q); }
  (side === 'R' ? r.hand : r.lhand)?.updateMatrixWorld(true);
}
// fingers back to rest (call when the character puts the weapon away)
export function releaseHands(root) { const r = root?.userData?.__gunRig; if (!r || !r.ok) return; relax(r, 'R'); if (r.lok) relax(r, 'L'); r.curled = false; }
function curl(r, side, set) {
  relax(r, side);
  const fr = frame(r, side, side === 'R' ? FR : FL), P = side === 'R' ? 'RightHand' : 'LeftHand';
  for (const f of FING) {
    const ang = set[f]; if (!ang) continue;
    for (let i = 1; i <= 3; i++) {
      const b = r[P + f + i], c = r[P + f + (i + 1)] || (b && b.children.find((x) => x.isBone));
      if (!b || !c) continue;
      wp(b, _a); wp(c, _b); _c.subVectors(_b, _a).normalize();
      const n = f === 'Thumb' ? _d.copy(fr.N).addScaledVector(fr.F, 0.5).normalize() : fr.N;
      _e.crossVectors(_c, n); if (_e.lengthSq() < 1e-6) continue; _e.normalize();
      _q.setFromAxisAngle(_e, ang[i - 1]); rotW(b, _q.clone());
    }
  }
}
// grip offsets in the hand frame (meters): palm center along F, out of the palm along N, along S
const GRIP = { pistol: { a: 0.062, b: 0.022, c: 0.004 }, long: { a: 0.062, b: 0.022, c: 0.004 }, melee: { a: 0.058, b: 0.02, c: 0.0 } };
// gun pose from the right hand frame
function gunFromHand(model, kind, fr, out) {
  const g = GRIP[kind] || GRIP.pistol, hp = model.userData.holdPoint;
  if (kind === 'melee') { _c.copy(fr.S); _b.copy(fr.N); }            // business end out of the index side of the fist
  else { _c.copy(fr.F); _b.copy(fr.S); }
  // basis X = Y x Z
  _a.crossVectors(_b, _c).normalize(); _b.crossVectors(_c, _a).normalize();
  _m.makeBasis(_a, _b, _c); out.quaternion.setFromRotationMatrix(_m);
  out.position.copy(fr.o).addScaledVector(fr.F, g.a).addScaledVector(fr.N, g.b).addScaledVector(fr.S, g.c);
  if (hp && hp.lengthSq() > 0) out.position.sub(_d.copy(hp).applyQuaternion(out.quaternion));
}
const _pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
const _Z = new THREE.Vector3(), _Y = new THREE.Vector3(), _X = new THREE.Vector3(), _O = new THREE.Vector3(), _fw = new THREE.Vector3(), _lf = new THREE.Vector3(), _sh = new THREE.Vector3();
// wanted gun basis from a direction (roll keeps the slide up)
function basisFrom(dir, roll = 0) {
  _Z.copy(dir).normalize(); _X.crossVectors(UP, _Z); if (_X.lengthSq() < 1e-6) _X.set(1, 0, 0); _X.normalize(); _Y.crossVectors(_Z, _X).normalize();
  if (roll) { _q.setFromAxisAngle(_Z, roll); _X.applyQuaternion(_q); _Y.applyQuaternion(_q); }
}
// wrist target for a wanted gun origin + basis (inverse of gunFromHand for guns: F = Z, S = Y, N = X)
function wristFor(model, kind, origin, out) {
  const g = GRIP[kind] || GRIP.pistol, hp = model.userData.holdPoint;
  out.copy(origin);
  if (hp && hp.lengthSq() > 0) out.add(_d.set(0, 0, 0).addScaledVector(_X, hp.x).addScaledVector(_Y, hp.y).addScaledVector(_Z, hp.z));
  return out.addScaledVector(_Z, -g.a).addScaledVector(_X, -g.b).addScaledVector(_Y, -g.c);
}
const _FL = new THREE.Vector3(), _SL = new THREE.Vector3(), _W = new THREE.Vector3(), _pole = new THREE.Vector3(), _lg = new THREE.Vector3(), _sm = new WeakMap();
// main entry. Returns true when the model was placed.
export function holdWeapon(model, root, o = {}) {
  const r = rigOf(root); if (!r || !r.ok || !model) return false;
  const ud = model.userData, kind = ud.hold || 'pistol';
  root.updateMatrixWorld(true);
  // body axes from the character root
  root.getWorldQuaternion(_q); _fw.set(0, 0, 1).applyQuaternion(_q).setY(0).normalize(); _lf.crossVectors(UP, _fw).normalize();
  const aiming = !!o.aim && kind !== 'melee', lowReady = !aiming && kind === 'long' && !o.free;
  const reload = !!o.reload && kind !== 'melee';
  if (aiming || lowReady || reload) {
    wp(r.arm, _sh);
    let dir;
    if (reload) {
      dir = _e.copy(_fw).multiplyScalar(0.85).addScaledVector(_lf, kind === 'long' ? 0.5 : 0.25).addScaledVector(UP, 0.25).normalize();
      basisFrom(dir, kind === 'long' ? -0.6 : -0.35);
      _O.copy(_sh).addScaledVector(_lf, kind === 'long' ? 0.12 : 0.16).addScaledVector(_fw, 0.3).addScaledVector(UP, -0.24);
    } else if (aiming) {
      // first guess from the shoulder, then aim from the muzzle area so the barrel converges on the crosshair point
      dir = _e.subVectors(o.aim, _sh).normalize();
      for (let it = 0; it < 2; it++) {
        basisFrom(dir);
        if (kind === 'long') {
          const bt = ud.butt || _a.set(0, 0.03, -0.25);
          _O.copy(_sh).addScaledVector(_lf, 0.075).addScaledVector(_fw, 0.03).addScaledVector(UP, -0.035)
            .addScaledVector(_X, -bt.x).addScaledVector(_Y, -bt.y).addScaledVector(_Z, -bt.z);
          _O.addScaledVector(_Y, -(ud.sightLine ? ud.sightLine.y * 0.25 : 0));
        } else _O.copy(_sh).addScaledVector(_lf, 0.17).addScaledVector(UP, -0.06).addScaledVector(dir, 0.5);
        dir = _e.subVectors(o.aim, _a.copy(_O).addScaledVector(_Y, ud.sightLine ? ud.sightLine.y : 0.05)).normalize();
      }
      basisFrom(dir);
      if (o.recoil) { const k = o.recoil * (o.kick || 0.02); _q.setFromAxisAngle(_X, -k * 5); _Z.applyQuaternion(_q); _Y.applyQuaternion(_q); _O.addScaledVector(_Z, -Math.min(0.05, k * 1.3)); }
    } else {
      dir = _e.copy(_fw).multiplyScalar(0.75).addScaledVector(_lf, 0.42).addScaledVector(UP, -0.5).normalize();
      basisFrom(dir, -0.35);
      _O.copy(_sh).addScaledVector(_lf, -0.02).addScaledVector(_fw, 0.2).addScaledVector(UP, -0.36);
    }
    // smooth pose changes (aim in / out, reload)
    let s = _sm.get(model); const dt = o.dt ?? 0.016;
    if (!s) { s = { o: _O.clone(), z: _Z.clone(), y: _Y.clone(), t: 0 }; _sm.set(model, s); }
    const k = s.t < (o.time ?? 0) - 0.25 ? 1 : 1 - Math.exp(-dt * (aiming ? 22 : 12));
    s.t = o.time ?? 0;
    s.o.lerp(_O, k); s.z.lerp(_Z, k).normalize(); s.y.lerp(_Y, k); s.y.addScaledVector(s.z, -s.y.dot(s.z)).normalize();
    _O.copy(s.o); _Z.copy(s.z); _Y.copy(s.y); _X.crossVectors(_Y, _Z).normalize();
    // right arm to the grip, hand aligned with the gun
    wristFor(model, kind, _O, _W);
    wp(r.fore, _pole); _pole.copy(_sh).addScaledVector(UP, -0.6).addScaledVector(_lf, -0.35).addScaledVector(_fw, -0.1);
    ik2(r.arm, r.fore, r.hand, _W, _pole);
    orientHand(r, 'R', _Z, _Y);
  } else _sm.delete(model);
  curl(r, 'R', kind === 'melee' ? CURL.meleeR : kind === 'long' ? CURL.longR : CURL.pistolR);
  // place the weapon from the (possibly IK'd) right hand
  frame(r, 'R', FR);
  gunFromHand(model, kind, FR, _pose);
  if (aiming || lowReady || reload) { _m.makeBasis(_X, _Y, _Z); _pose.quaternion.setFromRotationMatrix(_m); }
  model.position.copy(_pose.position); model.quaternion.copy(_pose.quaternion); model.updateMatrixWorld(true);
  // support hand
  if (r.lok && (aiming || lowReady || reload) && o.support !== false) {
    const two = ud.twoHand || kind === 'long';
    if (reload) {
      const bb = ud.bbox; _lg.set(0.0, bb ? bb.min[1] + 0.02 : -0.1, kind === 'long' ? 0.13 : -0.01); model.localToWorld(_lg);
      _W.copy(_lg).addScaledVector(_Y, -0.05).addScaledVector(_Z, -0.04).addScaledVector(_X, 0.03);
      wp(r.larm, _a); _pole.copy(_a).addScaledVector(UP, -0.6).addScaledVector(_lf, 0.4);
      ik2(r.larm, r.lfore, r.lhand, _W, _pole);
      orientHand(r, 'L', _FL.copy(UP), _SL.copy(_Z));
    } else if (two && ud.leftGrip) {
      _lg.copy(ud.leftGrip); model.localToWorld(_lg);
      const Fl = _FL.copy(_Z).multiplyScalar(0.45).addScaledVector(_X, -0.9).normalize();
      _W.copy(_lg).addScaledVector(_Y, -0.03).addScaledVector(Fl, -0.055).addScaledVector(_Z, -0.01);
      wp(r.larm, _c); _pole.copy(_c).addScaledVector(UP, -0.7).addScaledVector(_lf, 0.3);
      ik2(r.larm, r.lfore, r.lhand, _W, _pole);
      orientHand(r, 'L', Fl, _SL.copy(_Z));
    } else {
      // two-handed handgun grip: left hand wraps the right hand on the gun's left side
      _lg.set(0.034, -0.035, -0.012); model.localToWorld(_lg);
      const Fl = _FL.copy(_Y).multiplyScalar(-0.8).addScaledVector(_Z, 0.35).addScaledVector(_X, -0.3).normalize();
      _W.copy(_lg).addScaledVector(Fl, -0.05);
      wp(r.larm, _c); _pole.copy(_c).addScaledVector(UP, -0.7).addScaledVector(_lf, 0.25);
      ik2(r.larm, r.lfore, r.lhand, _W, _pole);
      orientHand(r, 'L', Fl, _SL.copy(_Z).addScaledVector(_Y, 0.4));
    }
    curl(r, 'L', CURL.supportL);
  } else if (r.lok) relax(r, 'L');
  r.curled = true;
  return true;
}

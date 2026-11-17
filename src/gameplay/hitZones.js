// Per-limb hit zones: capsules that follow the character's bones (character.getBone), analytic ray / sweep tests.
import * as THREE from 'three';

// Fitted to the user's scanned Nico (tools/v2/player/measure.py: 85th-percentile distance of each limb's skinned
// vertices from its bone segment, rest pose, 1.83 m) and scaled per character from its own skeleton, so kids, tall
// people and heavy builds get matching zones and bullets hit what is visibly there:
//   length scale s = |Hips -> Neck| / 0.6055, width scale w = mean(shoulder joint spread / 0.377, hip joint spread / 0.2284)
// A character may carry an exact fit (character.hitFit = { radii: { key: r } }); the player does (nico_tripo.json fit).
// The torso is two side-by-side capsules (an oval cross-section: 0.42 m wide, 0.27 m deep) instead of one fat round
// one, so shots that pass beside the waist or in front of the chest miss like they visibly should.
// key, bone A, bone B (null = sphere / offset point), radius (m, reference body), zone, damage multiplier, options
//   lat: lateral offset (+ = character's left) in reference meters, tw: radius scales with the width scale,
//   ext: extend the segment past B by this fraction of its length (hands past the wrist, toes)
export const LIMBS = [
  ['head', 'Head', null, 0.118, 'head', 4.0],
  ['neck', 'Neck', 'Head', 0.066, 'head', 2.5],
  ['torso_upper', 'Spine2', 'Neck', 0.135, 'torso', 1.25, { lat: 0.075, tw: 1 }],
  ['torso_upper', 'Spine2', 'Neck', 0.135, 'torso', 1.25, { lat: -0.075, tw: 1 }],
  ['torso_lower', 'Hips', 'Spine2', 0.13, 'torso', 1.0, { lat: 0.07, tw: 1 }],
  ['torso_lower', 'Hips', 'Spine2', 0.13, 'torso', 1.0, { lat: -0.07, tw: 1 }],
  ['upperarm_l', 'LeftArm', 'LeftForeArm', 0.08, 'arm', 0.7], ['forearm_l', 'LeftForeArm', 'LeftHand', 0.054, 'arm', 0.6],
  ['upperarm_r', 'RightArm', 'RightForeArm', 0.08, 'arm', 0.7], ['forearm_r', 'RightForeArm', 'RightHand', 0.054, 'arm', 0.6],
  ['forearm_l', 'LeftHand', 'LeftHandMiddle1', 0.05, 'arm', 0.5, { ext: 0.9 }], ['forearm_r', 'RightHand', 'RightHandMiddle1', 0.05, 'arm', 0.5, { ext: 0.9 }],
  ['thigh_l', 'LeftUpLeg', 'LeftLeg', 0.118, 'leg', 0.75, { tw: 0.5 }], ['shin_l', 'LeftLeg', 'LeftFoot', 0.085, 'leg', 0.6],
  ['thigh_r', 'RightUpLeg', 'RightLeg', 0.118, 'leg', 0.75, { tw: 0.5 }], ['shin_r', 'RightLeg', 'RightFoot', 0.085, 'leg', 0.6],
  ['shin_l', 'LeftFoot', 'LeftToeBase', 0.06, 'leg', 0.5, { ext: 0.6 }], ['shin_r', 'RightFoot', 'RightToeBase', 0.06, 'leg', 0.5, { ext: 0.6 }],
];
const REF = { hipsNeck: 0.6055, shoulders: 0.377, hips: 0.2284 };
// head sphere center from the Head joint: up along Neck->Head (m, reference body) and back. The player's rig pivots the
// head at the skull base (center 0.105 above); the crowd rig (src/npc/people) at mid-face (0.06); Mixamo-style rigs 0.09.
const HEAD_UP = { tripo: 0.105, person: 0.06, other: 0.09 };
const FALLBACK = { Spine2: ['Spine2', 'Spine1', 'Spine'], Neck: ['Neck', 'Spine2', 'Spine1'], LeftHandMiddle1: ['LeftHandMiddle1', 'LeftHandIndex1'], RightHandMiddle1: ['RightHandMiddle1', 'RightHandIndex1'] };

const boneCache = new WeakMap();
function bonesOf(char) {
  if (!char || typeof char.getBone !== 'function') return null;
  let b = boneCache.get(char);
  if (b !== undefined) return b;
  b = {};
  const get = (n) => { for (const k of FALLBACK[n] || [n]) { const o = char.getBone(k); if (o) return o; } return null; };
  for (const [, a, c] of LIMBS) { if (!(a in b)) b[a] = get(a); if (c && !(c in b)) b[c] = get(c); }
  for (const n of ['LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']) if (!(n in b)) b[n] = get(n);
  if (!b.Hips || !b.Head) b = null;
  boneCache.set(char, b);
  return b;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const _l = new THREE.Vector3(), _f = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
const clampN = (x, a, b) => (Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : 1);
// fill segments for a character (world space) -> [{key, a, b, r, zone, mult}]
export function limbSegments(char, out = []) {
  out.length = 0;
  const bones = bonesOf(char);
  if (!bones) return out;
  const fit = char.hitFit || null;
  // proportions from the live skeleton (includes the character's scale)
  const hp = bones.Hips.getWorldPosition(_p), nk = bones.Neck ? bones.Neck.getWorldPosition(_n) : null;
  const s = fit?.s ?? clampN(nk ? hp.distanceTo(nk) / REF.hipsNeck : 1, 0.55, 1.35);
  let w = s;
  if (!fit?.w) {
    const la = bones.LeftArm, ra = bones.RightArm, lu = bones.LeftUpLeg, ru = bones.RightUpLeg;
    const k1 = la && ra ? la.getWorldPosition(_a).distanceTo(ra.getWorldPosition(_b)) / REF.shoulders : s;
    const k2 = lu && ru ? lu.getWorldPosition(_a).distanceTo(ru.getWorldPosition(_b)) / REF.hips : s;
    w = clampN((k1 + k2) / 2, 0.6, 1.6);
  } else w = fit.w;
  // character's left (lateral axis) from the hip joints, else the shoulders
  if (bones.LeftUpLeg && bones.RightUpLeg) _l.subVectors(bones.LeftUpLeg.getWorldPosition(_a), bones.RightUpLeg.getWorldPosition(_b));
  else if (bones.LeftArm && bones.RightArm) _l.subVectors(bones.LeftArm.getWorldPosition(_a), bones.RightArm.getWorldPosition(_b));
  else _l.set(1, 0, 0);
  if (_l.lengthSq() < 1e-8) _l.set(1, 0, 0); _l.normalize();
  const shLat = bones.LeftArm && bones.RightArm ? _q.subVectors(bones.LeftArm.getWorldPosition(_a), bones.RightArm.getWorldPosition(_b)) : null;
  for (const [key, A, B, r0, zone, mult, o] of LIMBS) {
    const ba = bones[A]; if (!ba) continue;
    const a = ba.getWorldPosition(new THREE.Vector3());
    let b;
    let r = (fit?.radii?.[key] ?? r0) * (o?.tw ? 1 + (w / s - 1) * o.tw : 1) * s;
    if (B) {
      const bb = bones[B]; if (!bb) continue; b = bb.getWorldPosition(new THREE.Vector3());
      if (o?.ext) b.addScaledVector(_u.subVectors(b, a), o.ext);
    } else { // head sphere: from the head joint up along neck->head (rig dependent), a touch back
      const nkp = bones.Neck ? bones.Neck.getWorldPosition(_n) : _n.set(a.x, a.y - 0.1, a.z);
      _u.subVectors(a, nkp); if (_u.lengthSq() < 1e-6) _u.set(0, 1, 0); _u.normalize();
      // crowd rig: the head joint moved from mid-face (neck->head 0.16 m) to the skull base (0.11 m) on Nov 17; the
      // center height follows the joint: 0.06 above a mid-face joint, ~0.10 above a skull-base joint (people re-rig in progress)
      const dNH = bones.Neck ? a.distanceTo(nkp) / s : 0.16;
      const up = fit?.headUp ?? (char.human?.person ? THREE.MathUtils.clamp(HEAD_UP.tripo - 0.865 * (dNH - 0.108), HEAD_UP.person, HEAD_UP.tripo) : HEAD_UP.other);
      a.addScaledVector(_u, up * s);
      if (fit?.headBack) { _f.crossVectors(_l, _u).normalize(); a.addScaledVector(_f, -fit.headBack * s); }        // _f = forward
      b = a.clone();
    }
    if (o?.lat) {
      // torso halves: offset along the body's lateral axis (shoulders for the chest, hips for the waist)
      const ax = A === 'Spine2' && shLat ? _w.copy(shLat).normalize() : _l;
      const d = o.lat * w;
      a.addScaledVector(ax, d); b.addScaledVector(ax, d);
    }
    out.push({ key, a, b, r, zone, mult });
  }
  return out;
}

// Debug view: draws every character's hit zones as translucent capsules that follow the bones (call .dispose() to
// remove). hitZoneDebug(game, [game.playerCharacter, ...peds]) -> { group, update(), dispose() }
export function hitZoneDebug(game, chars) {
  const group = new THREE.Group(); group.name = 'hitZoneDebug';
  const COL = { head: 0xff3b30, torso: 0xffcc00, arm: 0x34c759, leg: 0x0a84ff };
  const mats = {}; for (const z in COL) mats[z] = new THREE.MeshBasicMaterial({ color: COL[z], transparent: true, opacity: 0.38, depthTest: false, depthWrite: false });
  const wire = {}; for (const z in COL) wire[z] = new THREE.MeshBasicMaterial({ color: COL[z], wireframe: true, transparent: true, opacity: 0.6, depthTest: false });
  const pool = []; let used = 0;
  const segs = [];
  const take = (zone) => {
    let m = pool[used];
    if (!m) { m = { body: new THREE.Mesh(new THREE.CapsuleGeometry(1, 1, 6, 16), mats.head), wire: null }; m.wire = new THREE.Mesh(m.body.geometry, wire.head); m.body.renderOrder = 999; m.wire.renderOrder = 1000; group.add(m.body, m.wire); pool.push(m); }
    m.body.material = mats[zone]; m.wire.material = wire[zone]; m.body.visible = m.wire.visible = true; used++; return m;
  };
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion();
  function update() {
    used = 0;
    for (const c of chars) {
      if (!c) continue; c.root?.updateMatrixWorld?.(true);
      for (const sg of limbSegments(c, segs)) {
        const m = take(sg.zone);
        d.subVectors(sg.b, sg.a); const len = d.length();
        // CapsuleGeometry(1, 1): radius 1, straight part 1 -> scale to (r, len, r) with the caps kept round
        m.body.geometry.dispose?.();
        const g = new THREE.CapsuleGeometry(sg.r, Math.max(1e-4, len), 6, 16);
        m.body.geometry = g; m.wire.geometry = g;
        m.body.position.copy(sg.a).addScaledVector(d, 0.5); m.wire.position.copy(m.body.position);
        q.setFromUnitVectors(up, len > 1e-5 ? d.clone().divideScalar(len) : up); m.body.quaternion.copy(q); m.wire.quaternion.copy(q);
      }
    }
    for (let i = used; i < pool.length; i++) { pool[i].body.visible = pool[i].wire.visible = false; }
  }
  game.scene.add(group); update();
  const hook = () => { try { update(); } catch (e) { /* debug only */ } };
  game.updaters?.push(hook);
  return { group, update, dispose() { const i = game.updaters?.indexOf(hook); if (i >= 0) game.updaters.splice(i, 1); game.scene.remove(group); group.traverse((o) => o.geometry?.dispose?.()); } };
}

// closest distance between segment p1-q1 and p2-q2; returns {d, s, t}
function segSeg(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const cx = p1.x + d1x * s - (p2.x + d2x * t), cy = p1.y + d1y * s - (p2.y + d2y * t), cz = p1.z + d1z * s - (p2.z + d2z * t);
  return { d: Math.sqrt(cx * cx + cy * cy + cz * cz), s, t };
}

const _segs = [];
// ray (origin o, unit dir d, length L) against targets [{obj, kind, char, pos}] -> nearest limb hit or null
export function rayLimbs(o, d, L, targets, pad = 0) {
  let best = null;
  const end = _w.set(o.x + d.x * L, o.y + d.y * L, o.z + d.z * L).clone();
  for (const tg of targets) {
    // coarse reject: body centre to ray distance
    const cx = tg.pos.x - o.x, cy = tg.pos.y + 1.0 - o.y, cz = tg.pos.z - o.z;
    const along = cx * d.x + cy * d.y + cz * d.z;
    if (along < -1.5 || along > L + 1.5) continue;
    const px = cx - d.x * along, py = cy - d.y * along, pz = cz - d.z * along;
    if (px * px + py * py + pz * pz > 2.6) continue;
    limbSegments(tg.char, _segs);
    for (const sg of _segs) {
      const r = segSeg(o, end, sg.a, sg.b);
      const R = sg.r + pad;
      if (r.d > R) continue;
      const tAlong = r.s * L - Math.sqrt(Math.max(0, R * R - r.d * r.d));
      if (!best || tAlong < best.t) {
        best = { t: Math.max(0, tAlong), limb: sg.key, zone: sg.zone, mult: sg.mult, target: tg, point: new THREE.Vector3(o.x + d.x * tAlong, o.y + d.y * tAlong, o.z + d.z * tAlong) };
      }
    }
  }
  return best;
}
// swept segment (weapon from p to q) against a target's limbs; returns best (closest) limb overlap or null
export function segLimbs(p, q, radius, tg) {
  limbSegments(tg.char, _segs);
  let best = null;
  for (const sg of _segs) {
    const r = segSeg(p, q, sg.a, sg.b);
    const pen = sg.r + radius - r.d;
    if (pen < 0) continue;
    if (!best || pen > best.pen) {
      const pt = new THREE.Vector3().copy(sg.a).lerp(sg.b, r.t);
      best = { pen, limb: sg.key, zone: sg.zone, mult: sg.mult, point: pt, target: tg };
    }
  }
  return best;
}
// candidates: live peds (with characters) + active cop units
export function hitTargets(game, G, center, radius) {
  const out = [];
  for (const ped of game.peds?.list || []) {
    if (!ped || ped.dead || ped.state === 'dead' || !ped.char || !ped.pos) continue;
    if (center && Math.hypot(ped.pos.x - center.x, ped.pos.z - center.z) > radius) continue;
    out.push({ obj: ped, kind: 'ped', char: ped.char, pos: ped.pos });
  }
  for (const u of G.police?.units || []) {
    if (!u.active || u.dead) continue;
    if (center && Math.hypot(u.pos.x - center.x, u.pos.z - center.z) > radius) continue;
    out.push({ obj: u, kind: 'cop', char: u.char, pos: u.pos });
  }
  for (const n of G.extraTargets || []) {
    if (!n.alive || n.dead || !n.char) continue;
    if (center && Math.hypot(n.pos.x - center.x, n.pos.z - center.z) > radius) continue;
    out.push({ obj: n, kind: 'npc', char: n.char, pos: n.pos });
  }
  return out;
}

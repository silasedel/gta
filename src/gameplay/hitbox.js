// Per-limb hitboxes: capsules that follow the character's bones (character.getBone), analytic ray / sweep tests.
import * as THREE from 'three';

// key, bone A, bone B (or null = sphere above A), radius, zone, damage multiplier
export const LIMBS = [
  ['head', 'Head', null, 0.115, 'head', 4.0],
  ['neck', 'Neck', 'Head', 0.06, 'head', 2.5],
  ['torso_upper', 'Spine2', 'Neck', 0.165, 'torso', 1.25],
  ['torso_lower', 'Hips', 'Spine2', 0.155, 'torso', 1.0],
  ['upperarm_l', 'LeftArm', 'LeftForeArm', 0.055, 'arm', 0.7], ['forearm_l', 'LeftForeArm', 'LeftHand', 0.047, 'arm', 0.6],
  ['upperarm_r', 'RightArm', 'RightForeArm', 0.055, 'arm', 0.7], ['forearm_r', 'RightForeArm', 'RightHand', 0.047, 'arm', 0.6],
  ['thigh_l', 'LeftUpLeg', 'LeftLeg', 0.085, 'leg', 0.75], ['shin_l', 'LeftLeg', 'LeftFoot', 0.062, 'leg', 0.6],
  ['thigh_r', 'RightUpLeg', 'RightLeg', 0.085, 'leg', 0.75], ['shin_r', 'RightLeg', 'RightFoot', 0.062, 'leg', 0.6],
];
const FALLBACK = { Spine2: ['Spine2', 'Spine1', 'Spine'], Neck: ['Neck', 'Spine2', 'Spine1'] };

const boneCache = new WeakMap();
function bonesOf(char) {
  if (!char || typeof char.getBone !== 'function') return null;
  let b = boneCache.get(char);
  if (b !== undefined) return b;
  b = {};
  const get = (n) => { for (const k of FALLBACK[n] || [n]) { const o = char.getBone(k); if (o) return o; } return null; };
  for (const [, a, c] of LIMBS) { if (!(a in b)) b[a] = get(a); if (c && !(c in b)) b[c] = get(c); }
  if (!b.Hips || !b.Head) b = null;
  boneCache.set(char, b);
  return b;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
// fill segments for a character (world space) -> [{key, a, b, r, zone, mult}]
export function limbSegments(char, out = []) {
  out.length = 0;
  const bones = bonesOf(char);
  if (!bones) return out;
  for (const [key, A, B, r, zone, mult] of LIMBS) {
    const ba = bones[A]; if (!ba) continue;
    const a = ba.getWorldPosition(new THREE.Vector3());
    let b;
    if (B) { const bb = bones[B]; if (!bb) continue; b = bb.getWorldPosition(new THREE.Vector3()); }
    else { // head sphere: centre a bit above the head bone along neck->head
      const nk = bones.Neck ? bones.Neck.getWorldPosition(_n) : _n.set(a.x, a.y - 0.1, a.z);
      _u.subVectors(a, nk); if (_u.lengthSq() < 1e-6) _u.set(0, 1, 0); _u.normalize();
      a.addScaledVector(_u, 0.09); b = a.clone();
    }
    out.push({ key, a, b, r, zone, mult });
  }
  return out;
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

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
  ['torso_upper', 'Spine2', 'Neck', 0.135, 'torso', 1.25, { lat: 0.075, tw: 1, side: 1 }],
  ['torso_upper', 'Spine2', 'Neck', 0.135, 'torso', 1.25, { lat: -0.075, tw: 1, side: -1 }],
  ['torso_lower', 'Hips', 'Spine2', 0.13, 'torso', 1.0, { lat: 0.07, tw: 1, side: 1 }],
  ['torso_lower', 'Hips', 'Spine2', 0.13, 'torso', 1.0, { lat: -0.07, tw: 1, side: -1 }],
  ['upperarm_l', 'LeftArm', 'LeftForeArm', 0.08, 'arm', 0.7],
  ['forearm_l', 'LeftForeArm', 'LeftHand', 0.054, 'arm', 0.6],
  ['upperarm_r', 'RightArm', 'RightForeArm', 0.08, 'arm', 0.7],
  ['forearm_r', 'RightForeArm', 'RightHand', 0.054, 'arm', 0.6],
  ['forearm_l', 'LeftHand', 'LeftHandMiddle1', 0.05, 'arm', 0.5, { ext: 0.9, fit: 'hand_l' }],
  ['forearm_r', 'RightHand', 'RightHandMiddle1', 0.05, 'arm', 0.5, { ext: 0.9, fit: 'hand_r' }],
  ['thigh_l', 'LeftUpLeg', 'LeftLeg', 0.118, 'leg', 0.75, { tw: 0.5 }],
  ['shin_l', 'LeftLeg', 'LeftFoot', 0.085, 'leg', 0.6],
  ['thigh_r', 'RightUpLeg', 'RightLeg', 0.118, 'leg', 0.75, { tw: 0.5 }],
  ['shin_r', 'RightLeg', 'RightFoot', 0.085, 'leg', 0.6],
  ['shin_l', 'LeftFoot', 'LeftToeBase', 0.06, 'leg', 0.5, { ext: 0.6, fit: 'foot_l' }],
  ['shin_r', 'RightFoot', 'RightToeBase', 0.06, 'leg', 0.5, { ext: 0.6, fit: 'foot_r' }],
];
const REF = { hipsNeck: 0.6055, shoulders: 0.377, hips: 0.2284 };
// head sphere center from the Head joint: up along Neck->Head (m, reference body) and back. The player's rig pivots the
// head at the skull base (center 0.105 above); the crowd rig (src/npc/people) at mid-face (0.06); Mixamo-style rigs 0.09.
const HEAD_UP = { tripo: 0.105, person: 0.06, other: 0.09 };
const FALLBACK = {
  Spine2: ['Spine2', 'Spine1', 'Spine'],
  Neck: ['Neck', 'Spine2', 'Spine1'],
  LeftHandMiddle1: ['LeftHandMiddle1', 'LeftHandIndex1'],
  RightHandMiddle1: ['RightHandMiddle1', 'RightHandIndex1'],
};

const boneCache = new WeakMap();
function bonesOf(char) {
  if (!char || typeof char.getBone !== 'function') return null;
  let b = boneCache.get(char);
  if (b !== undefined) return b;
  b = {};
  const get = (n) => {
    for (const k of FALLBACK[n] || [n]) {
      const o = char.getBone(k);
      if (o) return o;
    }
    return null;
  };
  for (const [, a, c] of LIMBS) {
    if (!(a in b)) b[a] = get(a);
    if (c && !(c in b)) b[c] = get(c);
  }
  for (const n of ['LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']) if (!(n in b)) b[n] = get(n);
  if (!b.Hips || !b.Head) b = null;
  boneCache.set(char, b);
  return b;
}

const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _n = new THREE.Vector3(),
  _u = new THREE.Vector3(),
  _w = new THREE.Vector3();
const _l = new THREE.Vector3(),
  _f = new THREE.Vector3(),
  _p = new THREE.Vector3(),
  _q = new THREE.Vector3();
const clampN = (x, a, b) => (Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : 1);
// ---- per-character fit from its own skinned mesh (once, lazily, cached): every limb's radius = 85th percentile of the
// distance of the vertices skinned mostly to that limb from its bone segment; the torso halves get the body's real depth
// and width; the head sphere sits on the head vertices' center. Kids, heavy builds, women, hats: all fit what is drawn.
const BONE_FIT = {
  Head: 'head',
  HeadTop_End: 'head',
  Neck: 'neck',
  Spine2: 'torso_upper',
  LeftShoulder: 'torso_upper',
  RightShoulder: 'torso_upper',
  Hips: 'torso_lower',
  Spine: 'torso_lower',
  Spine1: 'torso_lower',
  LeftArm: 'upperarm_l',
  LeftForeArm: 'forearm_l',
  LeftForeArmRoll: 'forearm_l',
  RightArm: 'upperarm_r',
  RightForeArm: 'forearm_r',
  RightForeArmRoll: 'forearm_r',
  LeftUpLeg: 'thigh_l',
  LeftLeg: 'shin_l',
  RightUpLeg: 'thigh_r',
  RightLeg: 'shin_r',
  LeftFoot: 'foot_l',
  LeftToeBase: 'foot_l',
  RightFoot: 'foot_r',
  RightToeBase: 'foot_r',
};
const fitOf = (n) => {
  const b = n.replace(/^mixamorig[:_]?/, '');
  if (BONE_FIT[b]) return BONE_FIT[b];
  if (/^LeftHand/.test(b)) return 'hand_l';
  if (/^RightHand/.test(b)) return 'hand_r';
  return null;
};
const autoCache = new WeakMap();
const pct = (arr, p) => {
  if (!arr.length) return null;
  arr.sort((x, y) => x - y);
  return arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
};
export function autoFit(char) {
  if (!char?.root) return null;
  const hit = autoCache.get(char);
  if (hit !== undefined) return hit;
  let fit = null;
  try {
    const bones = bonesOf(char);
    if (!bones) throw new Error('no bones');
    // the most detailed body mesh (LOD0, or unnamed), skip eyes / lashes / hair cards
    const meshes = [];
    char.root.traverse((m) => {
      if (
        m.isSkinnedMesh &&
        m.geometry?.attributes?.skinIndex &&
        !/eye|lash|brow|teeth|tongue|hairshell|haircard/i.test(
          m.name + ' ' + (m.material?.name || ''),
        )
      )
        meshes.push(m);
    });
    const lodN = (m) => {
      const r = /LOD(\d)/.exec(m.name);
      return r ? +r[1] : 0;
    };
    const minL = Math.min(...meshes.map(lodN));
    const body = meshes.filter((m) => lodN(m) === minL);
    if (!body.length) throw new Error('no mesh');
    char.root.updateMatrixWorld(true);
    const pts = {};
    const v = new THREE.Vector3();
    const total = body.reduce((n, m) => n + m.geometry.attributes.position.count, 0),
      stride = Math.max(1, Math.floor(total / 6000));
    for (const m of body) {
      const g = m.geometry,
        si = g.attributes.skinIndex,
        sw = g.attributes.skinWeight,
        names = m.skeleton.bones.map((b) => fitOf(b.name));
      for (let i = 0; i < g.attributes.position.count; i += stride) {
        let best = 0,
          bw = -1;
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k);
          if (w > bw) {
            bw = w;
            best = si.getComponent(i, k);
          }
        }
        const key = names[best];
        if (!key) continue;
        m.getVertexPosition(i, v);
        v.applyMatrix4(m.matrixWorld);
        (pts[key] ||= []).push(v.clone());
      }
    }
    const W = (n) => bones[n]?.getWorldPosition(new THREE.Vector3());
    const segDist = (p, a, b) => {
      const ab = _u.subVectors(b, a),
        t = Math.max(0, Math.min(1, _w.subVectors(p, a).dot(ab) / Math.max(1e-9, ab.lengthSq())));
      return p.distanceTo(_n.copy(a).addScaledVector(ab, t));
    };
    const radii = {},
      lat = {},
      fwdOff = {};
    for (const [key, A, B, , , , o] of LIMBS) {
      const id = o?.fit || key;
      if (radii[id] !== undefined || !B || o?.side) continue;
      const P = pts[id],
        a = W(A),
        b = W(B);
      if (!P || P.length < 12 || !a || !b) continue;
      if (o?.ext) b.addScaledVector(_q.subVectors(b, a), o.ext);
      radii[id] = pct(
        P.map((p) => segDist(p, a, b)),
        0.85,
      );
    }
    // torso halves: real half-depth (front-back) and half-width around the spine segment
    const left =
      W('LeftUpLeg') && W('RightUpLeg')
        ? W('LeftUpLeg').sub(W('RightUpLeg')).normalize()
        : new THREE.Vector3(1, 0, 0);
    for (const [id, A, B] of [
      ['torso_upper', 'Spine2', 'Neck'],
      ['torso_lower', 'Hips', 'Spine2'],
    ]) {
      const P = pts[id],
        a = W(A),
        b = W(B);
      if (!P || P.length < 30 || !a || !b) continue;
      const ax = b.clone().sub(a).normalize(),
        lt = left.clone().addScaledVector(ax, -left.dot(ax)).normalize(),
        fw = new THREE.Vector3().crossVectors(lt, ax).normalize();
      // the spine runs along the back, not the middle of the body: center the oval on the flesh (front/back extents)
      const dep = [],
        wid = [];
      for (const p of P) {
        const d = p.clone().sub(a);
        dep.push(d.dot(fw));
        wid.push(d.dot(lt));
      }
      const f0 = pct(dep, 0.06),
        f1 = pct(dep, 0.94),
        w0 = pct(wid, 0.05),
        w1 = pct(wid, 0.95);
      const hd = (f1 - f0) / 2,
        hw = (w1 - w0) / 2;
      radii[id] = hd;
      lat[id] = Math.max(0, hw - hd);
      fwdOff[id] = (f0 + f1) / 2;
    }
    // head: sphere on the head vertices
    let head = null;
    if (pts.head?.length > 20 && bones.Head) {
      const c = new THREE.Vector3();
      for (const p of pts.head) c.add(p);
      c.multiplyScalar(1 / pts.head.length);
      const hj = W('Head'),
        nk = bones.Neck ? W('Neck') : hj.clone().setY(hj.y - 0.1),
        up = hj.clone().sub(nk).normalize(),
        fw = new THREE.Vector3().crossVectors(left, up).normalize();
      const off = c.clone().sub(hj);
      head = {
        up: off.dot(up),
        back: -off.dot(fw),
        r: pct(
          pts.head.map((p) => p.distanceTo(c)),
          0.85,
        ),
      };
    }
    fit = {
      auto: true,
      radii,
      lat,
      fwd: fwdOff,
      head,
      n: Object.values(pts).reduce((n, a) => n + a.length, 0),
    };
  } catch (e) {
    fit = null;
  }
  autoCache.set(char, fit);
  return fit;
}

// fill segments for a character (world space) -> [{key, a, b, r, zone, mult}]
export function limbSegments(char, out = []) {
  out.length = 0;
  const bones = bonesOf(char);
  if (!bones) return out;
  const fit = char.hitFit || null;
  const af = char.hitAuto === false ? null : autoFit(char); // measured on this character's own mesh (preferred)
  // proportions from the live skeleton (includes the character's scale)
  const hp = bones.Hips.getWorldPosition(_p),
    nk = bones.Neck ? bones.Neck.getWorldPosition(_n) : null;
  const s = fit?.s ?? clampN(nk ? hp.distanceTo(nk) / REF.hipsNeck : 1, 0.55, 1.35);
  let w = s;
  if (!fit?.w) {
    const la = bones.LeftArm,
      ra = bones.RightArm,
      lu = bones.LeftUpLeg,
      ru = bones.RightUpLeg;
    const k1 =
      la && ra ? la.getWorldPosition(_a).distanceTo(ra.getWorldPosition(_b)) / REF.shoulders : s;
    const k2 =
      lu && ru ? lu.getWorldPosition(_a).distanceTo(ru.getWorldPosition(_b)) / REF.hips : s;
    w = clampN((k1 + k2) / 2, 0.6, 1.6);
  } else w = fit.w;
  // character's left (lateral axis) from the hip joints, else the shoulders
  if (bones.LeftUpLeg && bones.RightUpLeg)
    _l.subVectors(bones.LeftUpLeg.getWorldPosition(_a), bones.RightUpLeg.getWorldPosition(_b));
  else if (bones.LeftArm && bones.RightArm)
    _l.subVectors(bones.LeftArm.getWorldPosition(_a), bones.RightArm.getWorldPosition(_b));
  else _l.set(1, 0, 0);
  if (_l.lengthSq() < 1e-8) _l.set(1, 0, 0);
  _l.normalize();
  const shLat =
    bones.LeftArm && bones.RightArm
      ? _q.subVectors(bones.LeftArm.getWorldPosition(_a), bones.RightArm.getWorldPosition(_b))
      : null;
  for (const [key, A, B, r0, zone, mult, o] of LIMBS) {
    const ba = bones[A];
    if (!ba) continue;
    const a = ba.getWorldPosition(new THREE.Vector3());
    let b;
    const fid = o?.fit || key;
    let r =
      af?.radii?.[fid] ?? (fit?.radii?.[key] ?? r0) * (o?.tw ? 1 + (w / s - 1) * o.tw : 1) * s;
    if (key === 'head' && af?.head) r = af.head.r;
    if (B) {
      const bb = bones[B];
      if (!bb) continue;
      b = bb.getWorldPosition(new THREE.Vector3());
      if (o?.ext) b.addScaledVector(_u.subVectors(b, a), o.ext);
    } else {
      // head sphere: from the head joint up along neck->head (rig dependent), a touch back
      const nkp = bones.Neck ? bones.Neck.getWorldPosition(_n) : _n.set(a.x, a.y - 0.1, a.z);
      _u.subVectors(a, nkp);
      if (_u.lengthSq() < 1e-6) _u.set(0, 1, 0);
      _u.normalize();
      // crowd rig: the head joint moved from mid-face (neck->head 0.16 m) to the skull base (0.11 m) on Nov 17; the
      // center height follows the joint: 0.06 above a mid-face joint, ~0.10 above a skull-base joint (people re-rig in progress)
      const dNH = bones.Neck ? a.distanceTo(nkp) / s : 0.16;
      const up = af?.head
        ? af.head.up / s
        : (fit?.headUp ??
          (char.human?.person
            ? THREE.MathUtils.clamp(
                HEAD_UP.tripo - 0.865 * (dNH - 0.108),
                HEAD_UP.person,
                HEAD_UP.tripo,
              )
            : HEAD_UP.other));
      a.addScaledVector(_u, up * s);
      const back = af?.head ? af.head.back / s : fit?.headBack;
      if (back) {
        _f.crossVectors(_l, _u).normalize();
        a.addScaledVector(_f, -back * s);
      } // _f = forward
      b = a.clone();
    }
    if (o?.lat) {
      // torso halves: offset along the body's lateral axis (shoulders for the chest, hips for the waist)
      const ax = A === 'Spine2' && shLat ? _w.copy(shLat).normalize() : _l;
      const d = af?.lat?.[key] !== undefined ? af.lat[key] * Math.sign(o.lat) : o.lat * w;
      a.addScaledVector(ax, d);
      b.addScaledVector(ax, d);
      if (af?.fwd?.[key]) {
        // flesh center in front of the spine line
        _f.crossVectors(_w.copy(ax).normalize(), _u.subVectors(b, a).normalize()).normalize();
        a.addScaledVector(_f, af.fwd[key]);
        b.addScaledVector(_f, af.fwd[key]);
      }
    }
    out.push({ key, a, b, r, zone, mult });
  }
  return out;
}

// Debug view: draws every character's hit zones as translucent capsules that follow the bones (call .dispose() to
// remove). hitZoneDebug(game, [game.playerCharacter, ...peds]) -> { group, update(), dispose() }
export function hitZoneDebug(game, chars) {
  const group = new THREE.Group();
  group.name = 'hitZoneDebug';
  const COL = { head: 0xff3b30, torso: 0xffcc00, arm: 0x34c759, leg: 0x0a84ff };
  const mats = {};
  for (const z in COL)
    mats[z] = new THREE.MeshBasicMaterial({
      color: COL[z],
      transparent: true,
      opacity: 0.38,
      depthTest: false,
      depthWrite: false,
    });
  const wire = {};
  for (const z in COL)
    wire[z] = new THREE.MeshBasicMaterial({
      color: COL[z],
      wireframe: true,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
    });
  const pool = [];
  let used = 0;
  const segs = [];
  const take = (zone) => {
    let m = pool[used];
    if (!m) {
      m = { body: new THREE.Mesh(new THREE.CapsuleGeometry(1, 1, 6, 16), mats.head), wire: null };
      m.wire = new THREE.Mesh(m.body.geometry, wire.head);
      m.body.renderOrder = 999;
      m.wire.renderOrder = 1000;
      group.add(m.body, m.wire);
      pool.push(m);
    }
    m.body.material = mats[zone];
    m.wire.material = wire[zone];
    m.body.visible = m.wire.visible = true;
    used++;
    return m;
  };
  const up = new THREE.Vector3(0, 1, 0),
    d = new THREE.Vector3(),
    q = new THREE.Quaternion();
  function update() {
    used = 0;
    for (const c of chars) {
      if (!c) continue;
      c.root?.updateMatrixWorld?.(true);
      for (const sg of limbSegments(c, segs)) {
        const m = take(sg.zone);
        d.subVectors(sg.b, sg.a);
        const len = d.length();
        // CapsuleGeometry(1, 1): radius 1, straight part 1 -> scale to (r, len, r) with the caps kept round
        m.body.geometry.dispose?.();
        const g = new THREE.CapsuleGeometry(sg.r, Math.max(1e-4, len), 6, 16);
        m.body.geometry = g;
        m.wire.geometry = g;
        m.body.position.copy(sg.a).addScaledVector(d, 0.5);
        m.wire.position.copy(m.body.position);
        q.setFromUnitVectors(up, len > 1e-5 ? d.clone().divideScalar(len) : up);
        m.body.quaternion.copy(q);
        m.wire.quaternion.copy(q);
      }
    }
    for (let i = used; i < pool.length; i++) {
      pool[i].body.visible = pool[i].wire.visible = false;
    }
  }
  game.scene.add(group);
  update();
  const hook = () => {
    try {
      update();
    } catch (e) {
      /* debug only */
    }
  };
  game.updaters?.push(hook);
  return {
    group,
    update,
    dispose() {
      const i = game.updaters?.indexOf(hook);
      if (i >= 0) game.updaters.splice(i, 1);
      game.scene.remove(group);
      group.traverse((o) => o.geometry?.dispose?.());
    },
  };
}

// closest distance between segment p1-q1 and p2-q2; returns {d, s, t}
function segSeg(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x,
    d1y = q1.y - p1.y,
    d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x,
    d2y = q2.y - p2.y,
    d2z = q2.z - p2.z;
  const rx = p1.x - p2.x,
    ry = p1.y - p2.y,
    rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z,
    e = d2x * d2x + d2y * d2y + d2z * d2z,
    f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) {
    s = t = 0;
  } else if (a <= 1e-9) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z,
        den = a * e - b * b;
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const cx = p1.x + d1x * s - (p2.x + d2x * t),
    cy = p1.y + d1y * s - (p2.y + d2y * t),
    cz = p1.z + d1z * s - (p2.z + d2z * t);
  return { d: Math.sqrt(cx * cx + cy * cy + cz * cz), s, t };
}

const _segs = [];
// ray (origin o, unit dir d, length L) against targets [{obj, kind, char, pos}] -> nearest limb hit or null
export function rayLimbs(o, d, L, targets, pad = 0) {
  let best = null;
  const end = _w.set(o.x + d.x * L, o.y + d.y * L, o.z + d.z * L).clone();
  for (const tg of targets) {
    // coarse reject: body centre to ray distance
    const cx = tg.pos.x - o.x,
      cy = tg.pos.y + 1.0 - o.y,
      cz = tg.pos.z - o.z;
    const along = cx * d.x + cy * d.y + cz * d.z;
    if (along < -1.5 || along > L + 1.5) continue;
    const px = cx - d.x * along,
      py = cy - d.y * along,
      pz = cz - d.z * along;
    if (px * px + py * py + pz * pz > 2.6) continue;
    limbSegments(tg.char, _segs);
    for (const sg of _segs) {
      const r = segSeg(o, end, sg.a, sg.b);
      const R = sg.r + pad;
      if (r.d > R) continue;
      const tAlong = r.s * L - Math.sqrt(Math.max(0, R * R - r.d * r.d));
      if (!best || tAlong < best.t) {
        best = {
          t: Math.max(0, tAlong),
          limb: sg.key,
          zone: sg.zone,
          mult: sg.mult,
          target: tg,
          point: new THREE.Vector3(o.x + d.x * tAlong, o.y + d.y * tAlong, o.z + d.z * tAlong),
        };
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

// Pedestrian wardrobe + accessories for a hot coastal city (CHARACTER agent).
import * as THREE from 'three';

export function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
export const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

export const SKIN_TONES = [[0.97, 0.88, 0.8], [0.95, 0.84, 0.75], [0.9, 0.76, 0.65], [0.84, 0.68, 0.55], [0.78, 0.6, 0.47], [0.68, 0.5, 0.38],
  [0.58, 0.42, 0.31], [0.48, 0.34, 0.25], [0.4, 0.28, 0.21], [0.32, 0.22, 0.17]];
export const HAIR = [0x0e0b09, 0x1a120d, 0x2a1d14, 0x3d2a1a, 0x5a4029, 0x7a5a36, 0xa07c4c, 0x8a8478, 0xb9b3a8, 0x4a2a1a];

const C = {
  coral: 0xe07f68, teal: 0x2f8a86, white: 0xf0ede6, pink: 0xe6b3b5, mint: 0xa6d3bf, sky: 0x9cc1de, lemon: 0xe8d78a, lavender: 0xb8a8d2,
  sand: 0xd6c4a0, navy: 0x2a3442, olive: 0x5a6450, charcoal: 0x3a3a3c, khaki: 0xb5a385, rust: 0xa95d3d, black: 0x1f1f21, heather: 0x8e9094,
  cream: 0xe9e1cf, aqua: 0x5fb3b8, salmon: 0xe89a85, denimL: 0x5d7598, denimD: 0x1f2a3c, red: 0xb5443e, mustard: 0xc9a043,
};
const BRIGHT = [C.coral, C.teal, C.pink, C.mint, C.sky, C.lemon, C.lavender, C.aqua, C.salmon, C.red, C.mustard];
const NEUTRAL = [C.white, C.cream, C.sand, C.navy, C.olive, C.charcoal, C.khaki, C.black, C.heather, C.rust];
const mixPick = (r, pBright = 0.45) => (r() < pBright ? pick(r, BRIGHT) : pick(r, NEUTRAL));

// returns material options for the male base (top / bottom / shoes)
export function genOutfit(r, zone) {
  if (zone === true) zone = 'beach'; else if (!zone) zone = 'residential';
  if (zone === 'casual') zone = 'residential';
  const business = zone === 'business';
  if (business) zone = 'downtown';
  const beach = zone === 'beach';
  const o = {};
  if (zone === 'cop') { // police uniform
    Object.assign(o, { topType: 'uniform', shirt: 0x1c2a44, shirt2: 0x1c2a44, sleeve: 1, shorts: 0, pants: 0x1a2236, denim: false, sandal: 0, shoes: 0x111111, sole: 0x111111 });
    return o;
  }
  if (zone === 'downtown' && (business || r() < 0.7)) { // business attire
    o.topType = 'suit'; o.shirt = pick(r, [C.navy, C.charcoal, C.black, 0x4a4f57, C.khaki, 0x3b4a5c]); o.shirt2 = pick(r, [C.white, 0xcfe0ee, C.cream, 0xe8d8de]);
    o.sleeve = 0; o.shorts = 0; o.pants = r() < 0.75 ? o.shirt : pick(r, [C.charcoal, C.navy, C.khaki]); o.denim = false;
    o.sandal = 0; o.shoes = pick(r, [0x1a1a1a, 0x3a2618, 0x2a2a2e]); o.sole = 0x151515; return o;
  }
  if (zone === 'night') { // going-out clothes
    o.topType = 'night'; o.shirt = pick(r, [C.black, C.charcoal, 0x5a1f2e, C.navy, C.white, C.coral, C.teal, 0x3b2a4a]); o.shirt2 = pick(r, [C.black, C.white, o.shirt]);
    o.sleeve = r() < 0.5 ? 1 : 0; o.stripe = 0; o.shorts = 0; o.pants = pick(r, [C.black, C.charcoal, C.denimD, C.white, C.navy]); o.denim = o.pants === C.denimD;
    o.sandal = 0; o.shoes = pick(r, [0x111111, 0xe9e7e2, 0x3a2618]); o.sole = pick(r, [0x111111, 0xefefef]); return o;
  }
  if (beach && r() < 0.45) { // swimwear: shirtless + trunks
    o.topType = 'swim'; o.shirt = C.white; o.shirt2 = C.white; o.sleeve = 3; o.shorts = 1; o.pants = pick(r, BRIGHT.concat([C.navy, C.teal, C.black])); o.denim = false;
    o.sandal = 1; o.shoes = pick(r, [0x222222, C.teal, C.coral, 0x3a2a1e]); o.sole = pick(r, [0x2a2a2a, 0xc8b48a]); return o;
  }
  const t = r();
  const tops = beach ? ['tank', 'tank', 'tee', 'tee', 'linen', 'guayabera', 'athletic'] : ['tee', 'tee', 'linen', 'guayabera', 'jacket', 'athletic', 'tank', 'polo'];
  const top = pick(r, tops);
  o.topType = top;
  switch (top) {
    case 'tank': o.shirt = mixPick(r, 0.6); o.shirt2 = o.shirt; o.sleeve = 2; break;
    case 'tee': o.shirt = mixPick(r, 0.5); o.shirt2 = o.shirt; o.sleeve = 1; break;
    case 'polo': o.shirt = mixPick(r, 0.4); o.shirt2 = o.shirt; o.sleeve = 1; break;
    case 'linen': o.shirt = pick(r, [C.white, C.cream, C.sky, C.sand, C.pink, C.mint]); o.shirt2 = r() < 0.5 ? C.white : mixPick(r, 0.3); o.sleeve = r() < 0.6 ? 1 : 0; break;
    case 'guayabera': o.shirt = pick(r, [C.white, C.cream, C.sky, C.mint, C.sand, C.lemon]); o.shirt2 = o.shirt; o.sleeve = 1; o.stripe = 1; break;
    case 'athletic': o.shirt = pick(r, [C.black, C.charcoal, C.heather, C.teal, C.coral, C.navy]); o.shirt2 = o.shirt; o.sleeve = r() < 0.5 ? 2 : 1; break;
    default: o.shirt = pick(r, [C.olive, C.navy, C.charcoal, C.khaki, C.rust, C.denimL]); o.shirt2 = mixPick(r, 0.3); o.sleeve = 0; break;
  }
  const shorts = beach ? r() < 0.88 : r() < 0.4;
  if (shorts) {
    const kind = pick(r, beach ? ['board', 'board', 'cargo', 'athletic'] : ['cargo', 'chino', 'athletic', 'denim']);
    o.shorts = 1;
    o.pants = kind === 'board' ? pick(r, BRIGHT.concat([C.navy, C.teal])) : kind === 'cargo' ? pick(r, [C.khaki, C.olive, C.sand]) : kind === 'athletic' ? pick(r, [C.black, C.charcoal, C.navy, C.heather])
      : kind === 'denim' ? pick(r, [C.denimL, C.denimD]) : pick(r, [C.khaki, C.sand, C.navy]);
    o.denim = kind === 'denim';
  } else {
    o.shorts = 0;
    const kind = pick(r, ['jeans', 'jeans', 'chino', 'linen', 'jogger']);
    o.pants = kind === 'jeans' ? pick(r, [C.denimD, C.denimL, 0x2b3550]) : kind === 'chino' ? pick(r, [C.khaki, C.sand, C.navy, C.olive]) : kind === 'linen' ? pick(r, [C.white, C.cream, C.sand]) : pick(r, [C.black, C.charcoal, C.heather]);
    o.denim = kind === 'jeans';
  }
  const sandal = beach ? r() < 0.6 : r() < 0.15;
  o.sandal = sandal ? 1 : 0;
  o.shoes = sandal ? pick(r, [0x3a2a1e, 0x222222, C.teal, C.coral]) : pick(r, [0xe9e7e2, 0xe9e7e2, 0x222222, 0x6c6c6a, 0x4a3426, C.navy]);
  o.sole = sandal ? pick(r, [0x2a2a2a, 0xc8b48a]) : pick(r, [0xefefef, 0x1c1c1c, 0xe0d6c0]);
  return o;
}

// ---------- accessories ----------
const G = {};
function geo() {
  if (G.ready) return G;
  G.lens = new THREE.BoxGeometry(0.046, 0.026, 0.006);
  G.bridge = new THREE.BoxGeometry(0.11, 0.006, 0.006);
  G.temple = new THREE.BoxGeometry(0.004, 0.005, 0.1);
  G.capDome = new THREE.SphereGeometry(0.106, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  G.capBrim = new THREE.CylinderGeometry(0.085, 0.085, 0.008, 18, 1, false, -Math.PI / 2, Math.PI);
  G.bucket = new THREE.CylinderGeometry(0.098, 0.112, 0.085, 18);
  G.bucketBrim = new THREE.CylinderGeometry(0.15, 0.17, 0.012, 20);
  G.strawCrown = new THREE.CylinderGeometry(0.094, 0.106, 0.095, 18);
  G.strawBrim = new THREE.CylinderGeometry(0.21, 0.22, 0.006, 24);
  G.band = new THREE.CylinderGeometry(0.107, 0.107, 0.018, 18, 1, true);
  G.phBand = new THREE.TorusGeometry(0.112, 0.01, 6, 20, Math.PI);
  G.phCup = new THREE.CylinderGeometry(0.036, 0.036, 0.03, 14);
  G.phone = new THREE.BoxGeometry(0.15, 0.009, 0.072);
  G.ready = true; return G;
}
const matCache = new Map();
function mat(hex, rough = 0.8, metal = 0) {
  const k = hex + ':' + rough + ':' + metal;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
  return matCache.get(k);
}
function mesh(g, m, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; o.rotation.z = rz; o.castShadow = true; return o;
}

// Builds accessories in base-model space relative to the head-top point (Y up, +Z forward).
export function makeHeadAccessories(r, beach, hairOn) {
  const g = geo(); const grp = new THREE.Group(); const kinds = [];
  const pHat = beach ? 0.5 : 0.32;
  if (r() < pHat) {
    const kind = pick(r, beach ? ['cap', 'bucket', 'straw', 'straw', 'cap'] : ['cap', 'cap', 'bucket', 'straw']);
    kinds.push(kind);
    if (kind === 'cap') {
      const col = pick(r, [0x1f1f21, 0xf0ede6, 0x2a3442, 0xb5443e, 0x2f8a86, 0xb5a385, 0xe07f68]);
      const m = mat(col, 0.85);
      grp.add(mesh(g.capDome, m, 0, -0.072, -0.004, 1, 0.82, 1.04));
      grp.add(mesh(g.capBrim, m, 0, -0.068, 0.088, 1, 1, 1.05, 0.12));
    } else if (kind === 'bucket') {
      const m = mat(pick(r, [0xd6c4a0, 0xf0ede6, 0x5a6450, 0x1f1f21, 0x9cc1de]), 0.9);
      grp.add(mesh(g.bucket, m, 0, -0.058, -0.004));
      grp.add(mesh(g.bucketBrim, m, 0, -0.1, -0.004));
    } else {
      const m = mat(pick(r, [0xd9c08a, 0xcdb27a, 0xe3d2a6]), 0.95);
      grp.add(mesh(g.strawCrown, m, 0, -0.052, -0.004));
      grp.add(mesh(g.strawBrim, m, 0, -0.096, -0.004));
      grp.add(mesh(g.band, mat(pick(r, [0x1f1f21, 0x2a3442, 0x8a3b2e]), 0.8), 0, -0.085, -0.004));
    }
  } else if (r() < 0.12) {
    kinds.push('headphones');
    const m = mat(pick(r, [0x1f1f21, 0xf0ede6, 0x7a7a7a, 0xb5443e]), 0.4, 0.2);
    grp.add(mesh(g.phBand, m, 0, -0.088, -0.005));
    grp.add(mesh(g.phCup, m, 0.098, -0.118, -0.005, 1, 1, 1, 0, Math.PI / 2));
    grp.add(mesh(g.phCup, m, -0.098, -0.118, -0.005, 1, 1, 1, 0, Math.PI / 2));
  }
  if (r() < (beach ? 0.55 : 0.3)) {
    kinds.push('sunglasses');
    const lm = mat(pick(r, [0x0c0c0e, 0x1a1208, 0x0b1a22]), 0.12, 0.4);
    const fm = mat(pick(r, [0x111111, 0x3a2a1e, 0xb08a3c]), 0.4, 0.3);
    grp.add(mesh(g.lens, lm, 0.033, -0.108, 0.118));
    grp.add(mesh(g.lens, lm, -0.033, -0.108, 0.118));
    grp.add(mesh(g.bridge, fm, 0, -0.098, 0.119));
    grp.add(mesh(g.temple, fm, 0.071, -0.1, 0.07));
    grp.add(mesh(g.temple, fm, -0.071, -0.1, 0.07));
  }
  return { group: grp, kinds };
}

// police gear: peaked cap (head-top space) and duty belt (hips space)
export function makeCopCap() {
  const g = geo(); const grp = new THREE.Group(); const m = mat(0x141b2c, 0.7);
  grp.add(mesh(g.capDome, m, 0, -0.072, -0.004, 1.02, 0.8, 1.05));
  grp.add(mesh(new THREE.CylinderGeometry(0.112, 0.108, 0.04, 18), m, 0, -0.03, -0.004));
  grp.add(mesh(g.capBrim, mat(0x0a0a0a, 0.3, 0.2), 0, -0.07, 0.09, 1, 1, 1.0, 0.18));
  grp.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.006), mat(0xc9a43a, 0.3, 0.8), 0, -0.035, 0.112));
  return grp;
}
export function makeSunglasses(dy = 0) {
  const g = geo(); const grp = new THREE.Group();
  const lm = mat(0x0a0a0c, 0.1, 0.5), fm = mat(0x111111, 0.4, 0.3);
  grp.add(mesh(g.lens, lm, 0.033, -0.108 + dy, 0.118)); grp.add(mesh(g.lens, lm, -0.033, -0.108 + dy, 0.118));
  grp.add(mesh(g.bridge, fm, 0, -0.098 + dy, 0.119)); grp.add(mesh(g.temple, fm, 0.071, -0.1 + dy, 0.07)); grp.add(mesh(g.temple, fm, -0.071, -0.1 + dy, 0.07));
  return grp;
}
export function makeDutyBelt() {
  const grp = new THREE.Group();
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.055, 20, 1, true), mat(0x0d0d0d, 0.45, 0.1));
  belt.scale.set(1, 1, 0.78); belt.castShadow = true; grp.add(belt);
  const holster = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.08), mat(0x111111, 0.5)); holster.position.set(-0.17, -0.05, 0); grp.add(holster);
  const cuffs = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.035), mat(0x151515, 0.5)); cuffs.position.set(0.02, -0.005, -0.13); grp.add(cuffs);
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.035), mat(0x151515, 0.5)); pouch.position.set(-0.1, -0.01, 0.12); grp.add(pouch);
  const radio = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.035), mat(0x1a1a1a, 0.5)); radio.position.set(0.15, 0, 0.06); grp.add(radio);
  return grp;
}

// briefcase / handbag hanging from the right hand (authored in T-pose hand space: fingers along -X)
export function makeCase(kind = 'briefcase') {
  const grp = new THREE.Group();
  if (kind === 'briefcase') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.085, 0.4), mat(0x2a1a10, 0.45, 0.05)); body.position.set(-0.21, -0.02, 0); body.castShadow = true; grp.add(body);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.12), mat(0x111111, 0.4)); h.position.set(-0.05, -0.02, 0); grp.add(h);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.28), mat(0x5a2e22, 0.5)); body.position.set(-0.2, -0.02, 0); body.castShadow = true; grp.add(body);
  }
  return grp;
}

export function makePhone() {
  const g = geo();
  const p = new THREE.Mesh(g.phone, mat(0x111114, 0.25, 0.3)); p.castShadow = true;
  return p;
}

// attach `obj` (authored in base-model space at anchor point `anchor`) to `bone`, compensating the bone's rest transform
export function attachToBone(bone, restMatrixWorld, anchor, obj) {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  restMatrixWorld.decompose(p, q, s);
  const qi = q.clone().invert();
  const holder = new THREE.Group();
  holder.quaternion.copy(qi);
  holder.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
  holder.position.copy(anchor).sub(p).applyQuaternion(qi).divide(s);
  holder.add(obj);
  bone.add(holder);
  return holder;
}

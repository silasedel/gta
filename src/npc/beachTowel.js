// Beach towels and small beach things next to sunbathers (r2-people; user: "she's going through the towel, the towel
// looks fake: no fit to the ground, no wrinkles, no towel fuzziness"). A towel is a subdivided sheet draped on the sand
// (ground height per vertex + a few mm of soft lift, curled edges, folds and ripples), terry cloth (fine loop fuzz in the
// albedo and normal maps, roughness 0.95, a soft sheen at grazing angles), solid or striped, sand dusted toward the
// edges. restOnTowel() lifts a lying / sitting person so the back, buttocks and heels rest on the towel top.
import * as THREE from 'three';

const TEX = new Map();
let NORMAL = null;
const rnd = (s) => { let a = s | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// terry loops: a dense grain of small bright / dark dots on the base color (the fuzz), plus the woven border bands
function terryMap(color, stripes, seed) {
  const key = color + ':' + stripes; if (TEX.has(key)) return TEX.get(key);
  const c = canvas(256, 512), g = c.getContext('2d'), r = rnd(seed);
  const base = new THREE.Color(color), alt = new THREE.Color(0xf4f1ea);
  for (let y = 0; y < 512; y += 4) {
    const band = stripes ? Math.floor(y / 64) % 2 === 1 : false;
    const col = band ? alt : base;
    g.fillStyle = '#' + col.getHexString(); g.fillRect(0, y, 256, 4);
  }
  // woven hem bands near both short ends
  for (const y0 of [18, 470]) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, y0, 256, 12); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y0 + 12, 256, 3); }
  const img = g.getImageData(0, 0, 256, 512), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 34 + ((i >> 2) % 3 === 0 ? 6 : -4); d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n)); }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  TEX.set(key, t); return t;
}
function terryNormal() {
  if (NORMAL) return NORMAL;
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), r = rnd(7); const h = new Float32Array(S * S);
  for (let k = 0; k < 2600; k++) { const x = r() * S, y = r() * S, rad = 1.2 + r() * 1.6; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const q = Math.max(0, 1 - Math.hypot(dx, dy) / rad); if (q > 0) { const xx = (x + dx + S) % S | 0, yy = (y + dy + S) % S | 0; h[yy * S + xx] += q; } } }
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = h[y * S + (x + 1) % S] - h[y * S + (x + S - 1) % S], hy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
    const nx = -hx * 0.9, ny = -hy * 0.9, nz = 1, l = Math.hypot(nx, ny, nz); const i = (y * S + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  NORMAL = new THREE.CanvasTexture(c); NORMAL.wrapS = NORMAL.wrapT = THREE.RepeatWrapping; NORMAL.repeat.set(5, 10);
  return NORMAL;
}
const MATS = new Map();
function towelMat(color, stripes, seed) {
  const key = color + ':' + stripes; if (MATS.has(key)) return MATS.get(key);
  const m = new THREE.MeshPhysicalMaterial({ map: terryMap(color, stripes, seed), normalMap: terryNormal(), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95, metalness: 0,
    sheen: 0.7, sheenRoughness: 0.75, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5), vertexColors: true, side: THREE.DoubleSide, name: 'towel' });
  MATS.set(key, m); return m;
}

/** a towel draped on the ground at world (x, z), long side along heading. groundAt(x, z) -> y. */
export function makeTowel(x, z, heading, color, groundAt, seed = 1) {
  const W = 0.86, L = 1.78, NX = 16, NZ = 34, r = rnd(seed * 977 + 13);
  const g = new THREE.PlaneGeometry(W, L, NX, NZ); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  const s = Math.sin(heading), c = Math.cos(heading);
  // a few folds and ripples (random directions), one soft bunch near the head end where the body pushed it
  const waves = []; for (let k = 0; k < 5; k++) { const a = r() * Math.PI; waves.push([Math.cos(a), Math.sin(a), 6 + r() * 14, r() * 6.28, 0.003 + r() * 0.006]); }
  const fold = { z: (r() - 0.5) * 0.9, w: 0.05 + r() * 0.05, h: 0.012 + r() * 0.016 };
  const y0 = groundAt(x, z);
  const sand = new THREE.Color(0.86, 0.79, 0.64);
  for (let i = 0; i < n; i++) {
    const lx = pos.getX(i), lz = pos.getZ(i);
    const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
    let y = groundAt(wx, wz) - y0 + 0.012;
    for (const [dx, dz, f, p, a] of waves) y += Math.sin((lx * dx + lz * dz) * f + p) * a;
    y += Math.exp(-Math.pow((lz - fold.z) / fold.w, 2)) * fold.h;
    // edges curl up a little and corners lift (a towel never lies perfectly flat at its rim)
    const ex = 1 - Math.min(1, (W / 2 - Math.abs(lx)) / 0.05), ez = 1 - Math.min(1, (L / 2 - Math.abs(lz)) / 0.05);
    y += Math.max(ex, ez) * (0.006 + r() * 0.006) + ex * ez * 0.012;
    pos.setY(i, y);
    // sand dusting toward the edges and in a few patches
    const dust = Math.min(1, Math.max(ex, ez) * 0.8 + (r() < 0.04 ? 0.35 : 0));
    const k = 1 - dust * 0.45; const cc = new THREE.Color(1, 1, 1).lerp(sand, dust * 0.6);
    col[i * 3] = cc.r * k + (1 - k) * sand.r; col[i * 3 + 1] = cc.g * k + (1 - k) * sand.g; col[i * 3 + 2] = cc.b * k + (1 - k) * sand.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const stripes = (seed % 3) === 0;
  const m = new THREE.Mesh(g, towelMat(color, stripes, seed));
  m.position.set(x, y0, z); m.rotation.y = heading; m.receiveShadow = true; m.castShadow = false; m.name = 'beach-towel';
  m.userData.disposeGeo = true;
  m.userData.baseCol = col.slice();
  m.add(towelSkirt(W, L, x, z, y0, s, c, groundAt));
  return m;
}
// a soft contact shadow on the sand around (and just under) the towel rim: sand darkens where the cloth meets it
let SKIRT_MAT = null;
function towelSkirt(W, L, x, z, y0, s, c, groundAt) {
  const PAD = 0.16, g = new THREE.PlaneGeometry(W + PAD * 2, L + PAD * 2, 22, 42); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const lx = pos.getX(i), lz = pos.getZ(i);
    const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
    pos.setY(i, groundAt(wx, wz) - y0 + 0.003);
    // signed distance to the towel rectangle (negative inside)
    const qx = Math.abs(lx) - W / 2, qz = Math.abs(lz) - L / 2;
    const sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1;
    col[i * 4 + 3] = sd < -0.06 ? 0 : 0.42 * Math.exp(-Math.max(sd, 0) / 0.045) * Math.min(1, (sd + 0.06) / 0.04);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  SKIRT_MAT ||= new THREE.MeshBasicMaterial({ color: 0x241a10, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: 'towel-contact' });
  const m = new THREE.Mesh(g, SKIRT_MAT); m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1; m.name = 'towel-contact';
  return m;
}
// contact darkening on the towel under a lying / sitting body (baked into the towel's vertex colors once the body has
// settled): the cloth goes dark where the back, buttocks, legs and arms press on it, fading within a few cm
const SEGS = [['Hips', 'Spine2', 0.15], ['Spine2', 'Neck', 0.14], ['Neck', 'Head', 0.09], ['Hips', 'LeftUpLeg', 0.12], ['Hips', 'RightUpLeg', 0.12],
  ['LeftUpLeg', 'LeftLeg', 0.08], ['RightUpLeg', 'RightLeg', 0.08], ['LeftLeg', 'LeftFoot', 0.055], ['RightLeg', 'RightFoot', 0.055],
  ['LeftArm', 'LeftForeArm', 0.05], ['RightArm', 'RightForeArm', 0.05], ['LeftForeArm', 'LeftHand', 0.04], ['RightForeArm', 'RightHand', 0.04]];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _ab = new THREE.Vector3();
export function bakeTowelContact(ped) {
  const t = ped.towel, ch = ped.char; if (!t || !ch || !t.userData.baseCol) return;
  const segs = [];
  for (const [a, b, rad] of SEGS) { const A = ch.getBone(a), B = ch.getBone(b); if (!A || !B) continue; segs.push([A.getWorldPosition(new THREE.Vector3()), B.getWorldPosition(new THREE.Vector3()), rad]); }
  if (!segs.length) return;
  t.updateMatrixWorld(true);
  const pos = t.geometry.attributes.position, colA = t.geometry.attributes.color, base = t.userData.baseCol;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i).applyMatrix4(t.matrixWorld);
    let occ = 0;
    for (const [A, B, rad] of segs) {
      _ab.subVectors(B, A); const L2 = _ab.lengthSq() || 1e-6;
      const u = THREE.MathUtils.clamp(_a.subVectors(_p, A).dot(_ab) / L2, 0, 1);
      const gap = Math.max(0, _b.copy(A).addScaledVector(_ab, u).distanceTo(_p) - rad);
      occ = Math.max(occ, Math.exp(-gap / 0.07));
    }
    const k = 1 - 0.68 * occ;
    colA.setXYZ(i, base[i * 3] * k, base[i * 3 + 1] * k, base[i * 3 + 2] * k);
  }
  colA.needsUpdate = true; t.userData.contact = true;
}
export function clearTowelContact(t) {
  if (!t?.userData.contact) return;
  const colA = t.geometry.attributes.color; colA.array.set(t.userData.baseCol); colA.needsUpdate = true; t.userData.contact = false;
}
/** flip-flops (and sometimes a beach bag) set down beside the towel */
export function makeBeachThings(x, z, heading, groundAt, seed = 1) {
  const r = rnd(seed * 31 + 5), grp = new THREE.Group(); grp.name = 'beach-things';
  const s = Math.sin(heading), c = Math.cos(heading);
  const put = (o, lx, lz, ry) => { const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c; o.position.set(wx, groundAt(wx, wz), wz); o.rotation.y = heading + ry; grp.add(o); };
  // flip-flops (user: "they read as dark ovals"): foot-shaped thin rubber soles in light / colored rubber, about
  // 24 x 8 cm, a slim strap in a contrasting color
  const solePal = [0xd8c7a6, 0x6f9fd8, 0xe6a85a, 0xa9b0b6, 0xd77a6a, 0x8fc7a4];
  const sole = new THREE.MeshStandardMaterial({ color: solePal[(r() * solePal.length) | 0], roughness: 0.8 });
  const strap = new THREE.MeshStandardMaterial({ color: [0xf4f1ea, 0x2a6fc0, 0xd94b3d, 0xf2c14e][(r() * 4) | 0], roughness: 0.6 });
  const soleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.009, 18, 1);
  { const p = soleGeo.attributes.position; for (let i = 0; i < p.count; i++) { const zz = p.getZ(i); p.setX(i, p.getX(i) * (0.62 + 0.26 * Math.max(0, zz / 0.04))); p.setZ(i, zz * 2.6); } soleGeo.computeVertexNormals(); }
  const strapGeo = new THREE.TorusGeometry(0.03, 0.0055, 5, 14, Math.PI);
  for (const k of [-1, 1]) {
    const f = new THREE.Group();
    const so = new THREE.Mesh(soleGeo, sole); so.position.y = 0.0045; so.castShadow = true; so.receiveShadow = true; f.add(so);
    const st = new THREE.Mesh(strapGeo, strap); st.rotation.x = -0.35; st.position.set(0, 0.009, 0.025); st.castShadow = true; f.add(st);
    put(f, 0.56 + k * 0.065, 0.75 + r() * 0.1, (r() - 0.5) * 0.5);
  }
  if (false) {   // the box bag read as a crate in the close-up: off until there is a real bag model
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.14, 2, 2, 2), new THREE.MeshStandardMaterial({ color: [0xe8d9b5, 0x6aa6b5, 0xc96f5a][(r() * 3) | 0], roughness: 0.9 }));
    const p = bag.geometry.attributes.position; for (let i = 0; i < p.count; i++) { p.setX(i, p.getX(i) * (1 - Math.max(0, p.getY(i)) * 0.5)); } bag.geometry.computeVertexNormals();
    bag.position.y = 0.13; const b = new THREE.Group(); b.add(bag); put(b, -0.62, 0.35 + r() * 0.5, (r() - 0.5) * 0.8);
  }
  grp.userData.disposeGeo = true;
  return grp;
}
const PARTS = [['Hips', 0.1], ['Spine1', 0.11], ['Spine2', 0.11], ['Head', 0.09], ['LeftFoot', 0.045], ['RightFoot', 0.045], ['LeftLeg', 0.06], ['RightLeg', 0.06], ['LeftHand', 0.025], ['RightHand', 0.025]];
const _v = new THREE.Vector3();
/** after the character update: the body rests on the towel / sand (nothing sinks below it, nothing floats above it) */
export function restOnTowel(ped, groundAt) {
  const ch = ped.char, root = ped.root; if (!ch || !root) return;
  if (ped._rest === undefined || (ped._restN = (ped._restN || 0) + 1) < 30) {
    root.updateMatrixWorld(true);
    // the pelvis sets the height (buttocks / sacrum on the towel); limbs may lift it only a little (a folded leg or a hand
    // that the clip pushes into the sand must not float the whole body: sitGround rose 25 cm before)
    let need = -1e9, hip = null;
    for (const [n, rad] of PARTS) { const b = ch.getBone(n); if (!b) continue; b.getWorldPosition(_v); const top = groundAt(_v.x, _v.z) + (ped.towel ? 0.016 : 0.004); const k = top - (_v.y - rad); need = Math.max(need, k); if (n === 'Hips') hip = k; }
    if (hip !== null) need = Math.min(need, hip + 0.035);
    if (need > -1e8) ped._rest = THREE.MathUtils.clamp(need, -0.12, 0.25);
  }
  if (ped._rest) root.position.y += ped._rest;
  if (LOWER_LEGS && ped.idleStyle === 'lie') { root.updateMatrixWorld(true); lowerLegs(ch, groundAt, ped.towel ? 0.016 : 0.004); }
  if (ped._restN === 40 && ped.towel) { root.updateMatrixWorld(true); bakeTowelContact(ped); }
}
// lying: the clip holds the legs a few cm up (heels 14 cm over the towel); swing each leg down about the hip until
// the ankle sits ~7 cm over the cloth (heel on the towel). Feedback per frame, so it converges with or without a clip track.
const LOWER_LEGS = false; // parked: in one run the legs rose into a V instead of settling (check the sign before enabling)
const _H = new THREE.Vector3(), _F = new THREE.Vector3(), _ax = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _UP = new THREE.Vector3(0, 1, 0);
function lowerLegs(ch, groundAt, lift) {
  for (const side of ['Left', 'Right']) {
    const up = ch.getBone(side + 'UpLeg'), ft = ch.getBone(side + 'Foot'); if (!up || !ft || !up.parent) continue;
    up.getWorldPosition(_H); ft.getWorldPosition(_F);
    const ty = groundAt(_F.x, _F.z) + lift + 0.07;
    _ax.subVectors(_F, _H); const hz = Math.hypot(_ax.x, _ax.z); if (hz < 0.3) continue;   // only legs lying out flat
    const d = THREE.MathUtils.clamp(Math.atan2(_F.y - _H.y, hz) - Math.atan2(ty - _H.y, hz), -0.08, 0.3);
    if (Math.abs(d) < 0.004) continue;
    _ax.cross(_UP).normalize();
    up.getWorldQuaternion(_q1); _q2.setFromAxisAngle(_ax, -d).multiply(_q1);
    up.parent.getWorldQuaternion(_q1); up.quaternion.copy(_q1.invert().multiply(_q2));
    up.updateMatrixWorld(true);
  }
}

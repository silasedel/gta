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
// r7-towels: the terry pile comes from the user's downloaded towel scan (Models/_Inbox/towel-laying-flat-on-the-ground:
// "towel Material" base color + normal, 1024 px in public/assets/npc/towel/). The albedo is near-white loops: it is
// multiplied into each towel's own design (stripes / border bands / a print) so every towel is real terry cloth.
const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
let TERRY = null, TERRY_WAIT = null;
function terryImage() {
  if (TERRY || TERRY_WAIT || typeof Image === 'undefined') return TERRY;
  TERRY_WAIT = new Image(); TERRY_WAIT.crossOrigin = 'anonymous';
  TERRY_WAIT.onload = () => { TERRY = TERRY_WAIT; for (const fn of TEX.values()) fn.redraw?.(); };
  TERRY_WAIT.src = BASE + 'assets/npc/towel/terry_albedo.jpg';
  return null;
}
const PAL = [0xe07f68, 0x2f8a86, 0xf0ede6, 0xe8d78a, 0x9cc1de, 0xb8a8d2, 0xe6b3b5, 0x3b6fb6, 0xf2a541, 0x5fb49c, 0xd94f5c, 0x24416b];
const hex = (c) => '#' + new THREE.Color(c).getHexString();
// a towel design, 256 x 512 (u across the width, v along the length); v 0..FR and 1-FR..1 are the fringe
const FR = 0.035;
function drawDesign(g, W, H, color, kind, seed) {
  const r = rnd(seed * 131 + 7), c2 = PAL[(r() * PAL.length) | 0], white = 0xf6f3ec, f = Math.round(H * FR);
  g.clearRect(0, 0, W, H);
  g.fillStyle = hex(color); g.fillRect(0, f, W, H - 2 * f);
  if (kind === 'cabana') {   // long stripes running down the towel, two colors and thin white pinstripes
    const n = 5 + ((r() * 4) | 0), w = W / n;
    for (let i = 0; i < n; i++) { g.fillStyle = hex(i % 2 ? c2 : color); g.fillRect(i * w, f, w + 1, H - 2 * f); g.fillStyle = hex(white); g.fillRect(i * w - 2, f, 4, H - 2 * f); }
  } else if (kind === 'bands') {   // solid with woven bands across both ends
    for (const end of [0, 1]) for (let k = 0; k < 3; k++) { const y = end ? H - f - 40 - k * 22 : f + 28 + k * 22; g.fillStyle = hex(k === 1 ? white : c2); g.fillRect(0, y, W, k === 1 ? 8 : 14); }
  } else if (kind === 'print') {   // a simple repeated print: dots or soft waves
    g.fillStyle = hex(r() < 0.5 ? white : c2);
    if (r() < 0.5) { for (let y = f + 18; y < H - f; y += 34) for (let x = ((y / 34) | 0) % 2 ? 17 : 0; x < W + 20; x += 34) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); } }
    else { g.lineWidth = 7; g.strokeStyle = g.fillStyle; for (let y = f + 24; y < H - f; y += 46) { g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x / 22) * 8); g.stroke(); } }
    g.fillStyle = hex(c2); g.fillRect(0, f, W, 10); g.fillRect(0, H - f - 10, W, 10);
  }
  // hems: a flat woven band just inside each end and along the long sides
  g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(0, f + 2, W, 5); g.fillRect(0, H - f - 7, W, 5); g.fillRect(0, f, 4, H - 2 * f); g.fillRect(W - 4, f, 4, H - 2 * f);
  // fringe: loose threads (alpha-tested), a little uneven
  g.fillStyle = hex(color);
  for (const end of [0, 1]) for (let x = 2; x < W; x += 5) { const len = f * (0.55 + r() * 0.45); g.fillRect(x, end ? H - f : f - len, 2.4, len); }
  // keep the cut-out (fringe gaps): multiply blends make transparent texels opaque, so the alpha is restored after
  MASK ||= canvas(W, H); const mg = MASK.getContext('2d'); mg.globalCompositeOperation = 'copy'; mg.drawImage(g.canvas, 0, 0);
  // terry pile: the scanned loops multiplied in (tiled 2 x 4 across the towel), or a fine noise until the scan has loaded
  if (TERRY) {
    g.globalCompositeOperation = 'multiply';
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 2; tx++) g.drawImage(TERRY, tx * W / 2, ty * H / 4, W / 2, H / 4);
    g.globalCompositeOperation = 'source-over';
  } else {
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const n = (r() - 0.5) * 26; d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n)); }
    g.putImageData(img, 0, 0);
  }
  // the scan is very bright: deepen the pile contrast a touch (sunlit terry is never flat)
  g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(232,232,232,1)'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(MASK, 0, 0); g.globalCompositeOperation = 'source-over';
}
let MASK = null;
function terryMap(color, kind, seed) {
  const key = color + ':' + kind + ':' + (seed % 4); if (TEX.has(key)) return TEX.get(key);
  const c = canvas(256, 512), g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.redraw = () => { drawDesign(g, 256, 512, color, kind, seed % 4); t.needsUpdate = true; };
  t.redraw(); terryImage();
  TEX.set(key, t); return t;
}
function terryNormal() {
  if (NORMAL) return NORMAL;
  NORMAL = new THREE.TextureLoader().load(BASE + 'assets/npc/towel/terry_normal.jpg');
  NORMAL.wrapS = NORMAL.wrapT = THREE.RepeatWrapping; NORMAL.repeat.set(2, 4); NORMAL.anisotropy = 4;
  return NORMAL;
}
const MATS = new Map();
function towelMat(color, kind, seed) {
  const key = color + ':' + kind + ':' + (seed % 4); if (MATS.has(key)) return MATS.get(key);
  const m = new THREE.MeshPhysicalMaterial({ map: terryMap(color, kind, seed), normalMap: terryNormal(), normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.97, metalness: 0,
    sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5), vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, name: 'towel' });
  MATS.set(key, m); return m;
}
const KINDS = ['cabana', 'bands', 'print', 'cabana', 'bands', 'solid'];

const RIMS = new Map();
const TW = 0.86, TL = 1.8, NX = 14, NZ = 36, THICK = 0.005;
/** a towel draped on the ground at world (x, z), long side along heading. groundAt(x, z) -> y. */
export function makeTowel(x, z, heading, color, groundAt, seed = 1) {
  const g = new THREE.PlaneGeometry(TW, TL, NX, NZ); g.rotateX(-Math.PI / 2);
  // thickness: a band of side faces around the rim (the cloth edge, ~5 mm, reaching into the sand: never a gap under it)
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.Mesh(g, towelMat(color, KINDS[seed % KINDS.length], seed));
  m.receiveShadow = true; m.castShadow = false; m.name = 'beach-towel';
  m.userData.disposeGeo = true; m.userData.seed = seed; m.userData.groundAt = groundAt;
  const rim = new THREE.Mesh(new THREE.BufferGeometry(), RIMS.get(color) || RIMS.set(color, new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.72), roughness: 1, side: THREE.DoubleSide, name: 'towel-rim' })).get(color));
  rim.name = 'towel-rim'; rim.receiveShadow = true; m.add(rim); m.userData.rim = rim;
  drapeTowel(m, x, z, heading);
  return m;
}
const _sand = new THREE.Color(0.86, 0.79, 0.64), _cc = new THREE.Color();
/** lay (or re-lay) a towel at world (x, z, heading) on its ground: heights per vertex follow the sand, soft folds */
export function drapeTowel(m, x, z, heading) {
  const groundAt = m.userData.groundAt, seed = m.userData.seed || 1, r = rnd(seed * 977 + 13);
  const g = m.geometry, pos = g.attributes.position, n = pos.count, col = g.attributes.color.array;
  const s = Math.sin(heading), c = Math.cos(heading);
  const waves = []; for (let k = 0; k < 4; k++) { const a = r() * Math.PI; waves.push([Math.cos(a), Math.sin(a), 7 + r() * 12, r() * 6.28, 0.0015 + r() * 0.003]); }
  // one or two soft long ridges (where it was pulled / sat on) and a slight puff along one side
  const folds = []; for (let k = 0; k < 1 + (r() < 0.5 ? 1 : 0); k++) folds.push({ z: (r() - 0.5) * 1.2, w: 0.04 + r() * 0.05, h: 0.006 + r() * 0.01, tilt: (r() - 0.5) * 0.6 });
  const y0 = groundAt(x, z);
  for (let i = 0; i < n; i++) {
    const lx = (i % (NX + 1)) / NX * TW - TW / 2, lz = Math.floor(i / (NX + 1)) / NZ * TL - TL / 2;
    const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
    let y = groundAt(wx, wz) - y0 + THICK;
    for (const [dx, dz, f, p, a] of waves) y += (Math.sin((lx * dx + lz * dz) * f + p) * 0.5 + 0.5) * a;
    for (const F of folds) y += Math.exp(-Math.pow((lz - F.z - lx * F.tilt) / F.w, 2)) * F.h;
    // the rim sits on the sand (only the cloth thickness), the fringe lies flat on it
    const ex = 1 - Math.min(1, (TW / 2 - Math.abs(lx)) / 0.06), ez = 1 - Math.min(1, (TL / 2 - Math.abs(lz)) / 0.08);
    const e = Math.max(ex, ez); y = y * (1 - e * 0.7) + (groundAt(wx, wz) - y0 + 0.002) * e * 0.7;
    pos.setX(i, lx); pos.setY(i, y); pos.setZ(i, lz);
    const dust = Math.min(1, e * 0.55 + (r() < 0.035 ? 0.3 : 0));
    _cc.setRGB(1, 1, 1).lerp(_sand, dust * 0.55);
    col[i * 3] = _cc.r; col[i * 3 + 1] = _cc.g; col[i * 3 + 2] = _cc.b;
  }
  pos.needsUpdate = true; g.attributes.color.needsUpdate = true;
  g.computeVertexNormals(); g.computeBoundingSphere();
  m.userData.baseCol = col.slice(); m.userData.contact = false;
  m.position.set(x, y0, z); m.rotation.y = heading; m.updateMatrixWorld(true);
  // the rim band: perimeter of the top sheet down 1.5 cm into the sand
  const ring = [];
  for (let ix = 0; ix <= NX; ix++) ring.push(ix);
  for (let iz = 1; iz <= NZ; iz++) ring.push(iz * (NX + 1) + NX);
  for (let ix = NX - 1; ix >= 0; ix--) ring.push(NZ * (NX + 1) + ix);
  for (let iz = NZ - 1; iz >= 1; iz--) ring.push(iz * (NX + 1));
  const rp = new Float32Array(ring.length * 6), idx = [];
  for (let k = 0; k < ring.length; k++) { const i = ring[k]; rp[k * 6] = pos.getX(i); rp[k * 6 + 1] = pos.getY(i); rp[k * 6 + 2] = pos.getZ(i); rp[k * 6 + 3] = pos.getX(i); rp[k * 6 + 4] = pos.getY(i) - THICK - 0.015; rp[k * 6 + 5] = pos.getZ(i);
    const a0 = k * 2, b0 = ((k + 1) % ring.length) * 2; idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1); }
  const rg = m.userData.rim.geometry; rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setIndex(idx); rg.computeVertexNormals(); rg.computeBoundingSphere();
  // the contact shadow on the sand
  if (m.userData.skirt) { m.remove(m.userData.skirt); m.userData.skirt.geometry.dispose(); }
  m.userData.skirt = towelSkirt(TW, TL, x, z, y0, s, c, groundAt); m.add(m.userData.skirt);
  if (m.userData.things) placeThings(m.userData.things, x, z, heading, groundAt);
  m.userData.at = [x, z, heading];
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
/** things set down beside the towel: flip-flops, often a tote bag, sometimes a book or a sunscreen bottle. Built in
 *  towel space (child.userData.local = [lx, lz, ry]) so drapeTowel can move them with the towel. */
export function makeBeachThings(x, z, heading, groundAt, seed = 1) {
  const r = rnd(seed * 31 + 5), grp = new THREE.Group(); grp.name = 'beach-things';
  const put = (o, lx, lz, ry) => { o.userData.local = [lx, lz, ry]; grp.add(o); };
  const side = r() < 0.5 ? -1 : 1;
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
    put(f, side * 0.6 + k * 0.065, -0.72 + r() * 0.1, (r() - 0.5) * 0.5);
  }
  if (r() < 0.65) {   // a soft canvas / straw tote lying on its side, handles flopped over
    const col = [0xe8d9b5, 0x6aa6b5, 0xc96f5a, 0xd9c08a, 0x2f5f8a][(r() * 5) | 0];
    const bg = new THREE.BoxGeometry(0.4, 0.13, 0.3, 6, 3, 6), bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) { const X = bp.getX(i), Y = bp.getY(i), Z = bp.getZ(i); const pinch = 1 - 0.35 * Math.pow(Z / 0.15, 2); bp.setY(i, Y * pinch + 0.065); bp.setX(i, X * (1 - 0.12 * (Z / 0.15 + 1) * 0.5)); }
    bg.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.92 });
    const bag = new THREE.Group(); const body = new THREE.Mesh(bg, bm); body.castShadow = true; body.receiveShadow = true; bag.add(body);
    const hg = new THREE.TorusGeometry(0.1, 0.009, 6, 16, Math.PI);
    for (const k of [-1, 1]) { const h = new THREE.Mesh(hg, bm); h.rotation.set(-Math.PI / 2, 0, 0); h.position.set(k * 0.07, 0.012, 0.16); h.scale.set(0.8, 1, 0.5); bag.add(h); }
    put(bag, side * 0.68, 0.25 + r() * 0.35, side * (1.2 + (r() - 0.5) * 0.6));
  }
  if (r() < 0.45) {   // a paperback, face down and open or closed
    const bk = new THREE.Group(), cover = new THREE.MeshStandardMaterial({ color: [0x2a4f7a, 0xc0392b, 0xf2c14e, 0x1f8a70, 0x6c3483][(r() * 5) | 0], roughness: 0.7 }), paper = new THREE.MeshStandardMaterial({ color: 0xf2ecd9, roughness: 0.9 });
    const open = r() < 0.5;
    if (open) { for (const k of [-1, 1]) { const pg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.18), paper); pg.position.set(k * 0.058, 0.008, 0); pg.rotation.z = -k * 0.08; bk.add(pg); const cv = new THREE.Mesh(new THREE.BoxGeometry(0.113, 0.002, 0.182), cover); cv.position.set(k * 0.058, 0.015, 0); cv.rotation.z = -k * 0.08; bk.add(cv); } }
    else { const pg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.18), paper); pg.position.y = 0.011; bk.add(pg); for (const y of [0.001, 0.022]) { const cv = new THREE.Mesh(new THREE.BoxGeometry(0.113, 0.002, 0.182), cover); cv.position.y = y; bk.add(cv); } }
    bk.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    put(bk, -side * 0.62, 0.55 + r() * 0.2, (r() - 0.5) * 1.2);
  }
  if (r() < 0.35) {   // sunscreen bottle lying down
    const bt = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.11, 4, 10), new THREE.MeshStandardMaterial({ color: [0xf5f0e1, 0xf2a541, 0x3b8fd1][(r() * 3) | 0], roughness: 0.4 }));
    bt.rotation.z = Math.PI / 2; bt.position.y = 0.025; bt.castShadow = true; const gb = new THREE.Group(); gb.add(bt);
    put(gb, -side * 0.55, 0.15 + r() * 0.2, r() * 3);
  }
  grp.userData.disposeGeo = true;
  placeThings(grp, x, z, heading, groundAt);
  return grp;
}
export function placeThings(grp, x, z, heading, groundAt) {
  const s = Math.sin(heading), c = Math.cos(heading);
  for (const o of grp.children) { const L = o.userData.local; if (!L) continue; const wx = x + L[0] * c + L[1] * s, wz = z - L[0] * s + L[1] * c; o.position.set(wx, groundAt(wx, wz), wz); o.rotation.y = heading + L[2]; }
}
const PARTS = [['Hips', 0.1], ['Spine1', 0.11], ['Spine2', 0.11], ['Head', 0.09], ['LeftFoot', 0.045], ['RightFoot', 0.045], ['LeftLeg', 0.06], ['RightLeg', 0.06], ['LeftHand', 0.025], ['RightHand', 0.025]];
const _v = new THREE.Vector3();
/** after the character update: the body rests on the towel / sand (nothing sinks below it, nothing floats above it) */
export function restOnTowel(ped, groundAt) {
  const ch = ped.char, root = ped.root; if (!ch || !root) return;
  // r7-towels: once the clip pose has settled (frame 12), re-lay the towel under the body: lying = from just beyond the
  // head to just past the heels; sitting = from behind the buttocks to past the feet
  if (ped.towel && ped._restN === 12 && !ped.towel.userData.fitted) { try { fitTowel(ped); } catch (e) { /* keep it */ } }
  if (ped._rest === undefined || (ped._restN = (ped._restN || 0) + 1) < 30) {
    root.updateMatrixWorld(true);
    // the pelvis sets the height (buttocks / sacrum on the towel); limbs may lift it only a little (a folded leg or a hand
    // that the clip pushes into the sand must not float the whole body: sitGround rose 25 cm before)
    let need = -1e9, hip = null;
    for (const [n, rad] of PARTS) { const b = ch.getBone(n); if (!b) continue; b.getWorldPosition(_v); const top = groundAt(_v.x, _v.z) + (ped.towel ? 0.009 : 0.004); const k = top - (_v.y - rad); need = Math.max(need, k); if (n === 'Hips') hip = k; }
    if (hip !== null) need = Math.min(need, hip + 0.035);
    if (need > -1e8) ped._rest = THREE.MathUtils.clamp(need, -0.12, 0.25);
  }
  if (ped._rest) root.position.y += ped._rest;
  if (LOWER_LEGS && ped.idleStyle === 'lie') { root.updateMatrixWorld(true); lowerLegs(ch, groundAt, ped.towel ? 0.009 : 0.004); }
  if (ped._restN === 40 && ped.towel) { root.updateMatrixWorld(true); bakeTowelContact(ped); }
}
// lying: the clip holds the legs a few cm up (heels 14 cm over the towel); swing each leg down about the hip until
// the ankle sits ~7 cm over the cloth (heel on the towel). Feedback per frame, so it converges with or without a clip track.
// r7-towels: on again. The V came from frames without an animation update (LOD / off-screen skips): the correction was
// applied on top of the previous frame's corrected bone and accumulated. Now a leg is only corrected when its bone holds
// a fresh clip value (not the quaternion we wrote last time).
const LOWER_LEGS = !(typeof location !== 'undefined' && /[?&]lowerlegs=0\b/.test(location.search));
const _H = new THREE.Vector3(), _F = new THREE.Vector3(), _ax = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _UP = new THREE.Vector3(0, 1, 0);
function lowerLegs(ch, groundAt, lift) {
  for (const side of ['Left', 'Right']) {
    const up = ch.getBone(side + 'UpLeg'), ft = ch.getBone(side + 'Foot'); if (!up || !ft || !up.parent) continue;
    const mine = up.userData._llq; if (mine && mine.equals(up.quaternion)) continue;   // no clip update since our last write
    up.getWorldPosition(_H); ft.getWorldPosition(_F);
    const ty = groundAt(_F.x, _F.z) + lift + 0.07;
    _ax.subVectors(_F, _H); const hz = Math.hypot(_ax.x, _ax.z); if (hz < 0.3) continue;   // only legs lying out flat
    const d = THREE.MathUtils.clamp(Math.atan2(_F.y - _H.y, hz) - Math.atan2(ty - _H.y, hz), -0.08, 0.3);
    if (Math.abs(d) < 0.004) continue;
    _ax.cross(_UP).normalize();
    up.getWorldQuaternion(_q1); _q2.setFromAxisAngle(_ax, -d).multiply(_q1);
    up.parent.getWorldQuaternion(_q1); up.quaternion.copy(_q1.invert().multiply(_q2));
    (up.userData._llq ||= new THREE.Quaternion()).copy(up.quaternion);
    up.updateMatrixWorld(true);
  }
}

// r7-towels: fit the towel to the settled body (see restOnTowel)
const _hd = new THREE.Vector3(), _ft = new THREE.Vector3(), _hp = new THREE.Vector3(), _t2 = new THREE.Vector3();
function fitTowel(ped) {
  const ch = ped.char, t = ped.towel; ped.root.updateMatrixWorld(true);
  const H = ch.getBone('Head'), Hp = ch.getBone('Hips'), LF = ch.getBone('LeftFoot'), RF = ch.getBone('RightFoot'); if (!H || !Hp || !LF || !RF) return;
  H.getWorldPosition(_hd); Hp.getWorldPosition(_hp); LF.getWorldPosition(_ft); RF.getWorldPosition(_t2); _ft.add(_t2).multiplyScalar(0.5);
  let ax, az, a0, a1;   // towel axis (unit, xz) and its two ends along it, measured from the hips
  if (ped.idleStyle === 'lie') {
    ax = _hd.x - _ft.x; az = _hd.z - _ft.z; const l = Math.hypot(ax, az); if (l < 0.6) return; ax /= l; az /= l;
    const hs = (_hd.x - _hp.x) * ax + (_hd.z - _hp.z) * az, fs = (_ft.x - _hp.x) * ax + (_ft.z - _hp.z) * az;
    a1 = hs + 0.2; a0 = fs - 0.12;                    // past the crown, past the heels
    if (a1 - a0 > TL) a1 = a0 + TL;                    // tall people: feet on the cloth, head may reach the sand end
  } else {
    ax = _ft.x - _hp.x; az = _ft.z - _hp.z; const l = Math.hypot(ax, az); if (l < 0.2) return; ax /= l; az /= l;
    a0 = -0.45; a1 = l + 0.12;
  }
  const mid = (a0 + a1) / 2 + (TL - (a1 - a0) > 0 ? 0 : 0);
  const cx = _hp.x + ax * mid, cz = _hp.z + az * mid;
  drapeTowel(t, cx, cz, Math.atan2(ax, az));
  t.userData.fitted = true;
}

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
  return m;
}
/** flip-flops (and sometimes a beach bag) set down beside the towel */
export function makeBeachThings(x, z, heading, groundAt, seed = 1) {
  const r = rnd(seed * 31 + 5), grp = new THREE.Group(); grp.name = 'beach-things';
  const s = Math.sin(heading), c = Math.cos(heading);
  const put = (o, lx, lz, ry) => { const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c; o.position.set(wx, groundAt(wx, wz), wz); o.rotation.y = heading + ry; grp.add(o); };
  const strap = new THREE.MeshStandardMaterial({ color: [0x1d1d22, 0xd94b3d, 0x2a6fc0, 0xf2c14e][(r() * 4) | 0], roughness: 0.7 });
  const sole = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.85 });
  for (const k of [-1, 1]) {
    const f = new THREE.Group();
    const so = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.012, 14), sole); so.scale.set(1, 1, 2.5); so.position.y = 0.006; f.add(so);
    const st = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 14, Math.PI), strap); st.rotation.x = -0.4; st.position.set(0, 0.012, 0.03); f.add(st);
    put(f, 0.55 + k * 0.07, 0.75 + r() * 0.1, (r() - 0.5) * 0.6);
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
    let need = -1e9;
    for (const [n, rad] of PARTS) { const b = ch.getBone(n); if (!b) continue; b.getWorldPosition(_v); const top = groundAt(_v.x, _v.z) + (ped.towel ? 0.016 : 0.004); need = Math.max(need, top - (_v.y - rad)); }
    if (need > -1e8) ped._rest = THREE.MathUtils.clamp(need, -0.12, 0.25);
  }
  if (ped._rest) root.position.y += ped._rest;
}

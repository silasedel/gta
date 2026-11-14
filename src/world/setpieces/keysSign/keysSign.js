// KEYS-SIGN track: the "Welcome to the Keys" roadside set piece (top-priority set piece #3).
// buildKeysSign(THREE, { textures, mile, seed }) -> { group, colliders, lights, perches, update(dt, ctx), scatterBirds(), dispose() }
// Local frame: the board faces +Z (toward oncoming drivers) turned a little to the road, which runs along Z on the -X side.
// Ground is y = 0. colliders are local-space descriptors { type: 'box'|'cyl', x, y, z, hx, hy, hz | r, hh, ry }.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drawFHWA } from '../../signs/lettering.js';
import { fbm, vnoise, rng, makeCanvas, normalsFromHeight, hexRgb, lerp, clamp } from '../../signs/util.js';

export const KEYS_SIGN = { width: 6.4, height: 3.6, bottom: 2.05, yaw: -0.27 };
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

// Baked art (public/assets/signs). Falls back to painting in code if the files are missing.
export async function loadKeysSignTextures(THREE, { base = BASE, anisotropy = 16 } = {}) {
  const L = new THREE.TextureLoader();
  const tex = async (file, srgb) => { const t = await L.loadAsync(base + 'assets/signs/' + file); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy; return t; };
  const side = async (name) => {
    const meta = await (await fetch(base + 'assets/signs/' + name + '.json')).json();
    const [color, normal, orm] = await Promise.all([tex(name + '_color.jpg', true), tex(name + '_normal.jpg'), tex(name + '_orm.jpg')]);
    return { color, normal, orm, outline: meta.outline };
  };
  try { const [front, back] = await Promise.all([side('keys_welcome'), side('keys_back')]); return { front, back }; }
  catch (e) {
    console.warn('[keys-sign] baked art missing, painting in code', e);
    const art = await import('./art.js');
    const conv = (o) => { const c = new THREE.CanvasTexture(o.color); c.colorSpace = THREE.SRGBColorSpace; c.anisotropy = anisotropy; return { color: c, normal: new THREE.CanvasTexture(o.normal), orm: new THREE.CanvasTexture(o.orm), outline: o.outline }; };
    return { front: conv(art.paintKeysWelcome({ width: 2048 })), back: conv(art.paintKeysBack({ width: 1024 })) };
  }
}

// ---------------------------------------------------------------- procedural PBR surfaces (cached per THREE build)
const TEXC = new Map();
function surface(THREE, key, size, fn, { repeat = [1, 1], strength = 2.5, rough = 0.85, metal = 0 } = {}) {
  if (TEXC.has(key)) return TEXC.get(key);
  const c = makeCanvas(size), x = c.getContext('2d'), id = x.createImageData(size, size), d = id.data, hf = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const o = fn(i / size, j / size), k = (j * size + i) * 4; d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = 255; hf[j * size + i] = o[3]; }
  x.putImageData(id, 0, 0);
  const n = makeCanvas(size), nx = n.getContext('2d'), nd = nx.createImageData(size, size); normalsFromHeight(hf, size, size, strength * size / 256, nd.data, true); nx.putImageData(nd, 0, 0);
  const map = new THREE.CanvasTexture(c), nm = new THREE.CanvasTexture(n);
  for (const t of [map, nm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 8; }
  map.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map, normalMap: nm, roughness: rough, metalness: metal });
  TEXC.set(key, m); return m;
}
// tileable fbm: wrap by blending
const tn = (u, v, f, s, oct = 4) => { const a = fbm(u * f, v * f, oct, s), b = fbm((u - 1) * f, v * f, oct, s), c = fbm(u * f, (v - 1) * f, oct, s), d = fbm((u - 1) * f, (v - 1) * f, oct, s); return lerp(lerp(a, b, u), lerp(c, d, u), v); };
const mixc = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
function materials(THREE) {
  const C = (h) => hexRgb(h);
  const timber = surface(THREE, 'timber', 256, (u, v) => { const g = tn(u * 9, v * 0.6, 6, 3), kn = tn(u, v, 5, 9), cr = Math.pow(Math.abs(Math.sin((u * 38 + g * 4) * 3.14)), 12), t = clamp(g * 1.1 - 0.1 + kn * 0.25), c = mixc(C('#57503f'), C('#a59a86'), t), k = 1 - cr * 0.45; return [c[0] * k, c[1] * k, c[2] * k * 0.98, g * 0.6 - cr * 0.8]; }, { repeat: [1, 1], strength: 3, rough: 0.9 });
  const concrete = surface(THREE, 'concrete', 256, (u, v) => { const n = tn(u, v, 6, 21), sp = vnoise(u * 180, v * 180, 5), st = Math.max(0, tn(u * 5, v * 0.4, 5, 30) - 0.55) * 1.4, pit = sp > 0.86 ? 1 : 0, t = clamp(0.3 + n * 0.6 + (sp - 0.5) * 0.14), c = mixc(C('#8f8b80'), C('#d3cfc2'), t), k = (1 - st * 0.45) * (1 - pit * 0.25); return [c[0] * k, c[1] * k, c[2] * k * 0.97, n * 0.4 + sp * 0.15 - pit * 0.6]; }, { repeat: [0.5, 0.5], strength: 2, rough: 0.88 });
  const galv = surface(THREE, 'galv', 128, (u, v) => { const n = tn(u, v, 10, 41, 3), sp = vnoise(u * 40, v * 40, 7), t = clamp(0.25 + n * 0.5 + sp * 0.25), c = mixc(C('#7d8587'), C('#c2c9ca'), t); return [c[0], c[1], c[2], n * 0.2]; }, { repeat: [2, 2], strength: 0.8, rough: 0.5, metal: 0.75 });
  const rock = surface(THREE, 'coralrock', 256, (u, v) => { const n = tn(u, v, 5, 51, 5), p = tn(u, v, 22, 53, 2), pit = clamp((0.42 - p) * 7), t = clamp(n * 1.2 - 0.1), c = mixc(C('#a89f8a'), C('#efe8d4'), t), k = 1 - pit * 0.55; return [c[0] * k, c[1] * k, c[2] * k, n * 0.8 - pit * 1.4]; }, { repeat: [1.5, 1.5], strength: 4, rough: 0.95 });
  const bark = surface(THREE, 'palmbark', 256, (u, v) => { const ring = Math.pow(Math.abs(Math.sin(v * 3.1416 * 22 + tn(u, v, 4, 61) * 2.4)), 5), n = tn(u * 3, v, 8, 63), t = clamp(0.25 + n * 0.6 - ring * 0.35), c = mixc(C('#5d5142'), C('#b3a58c'), t); return [c[0], c[1], c[2], n * 0.5 - ring * 0.9]; }, { repeat: [2, 5], strength: 3.5, rough: 0.92 });
  const soil = surface(THREE, 'mulch', 256, (u, v) => { const n = tn(u, v, 30, 71, 3), m = tn(u, v, 6, 73), ch = vnoise(u * 90, v * 30, 75), t = clamp(n * 0.7 + ch * 0.4 - 0.1), c = mixc(C('#3a2c20'), C('#8a6b4c'), t), sh = m > 0.62 ? 1 : 0, cc = mixc(c, C('#d9cfb8'), sh * 0.6 * ch); return [cc[0], cc[1], cc[2], n + ch * 0.4]; }, { repeat: [3, 3], strength: 3, rough: 0.97 });
  const pole = surface(THREE, 'creosote', 256, (u, v) => { const g = tn(u * 12, v * 0.5, 5, 81), cr = Math.pow(Math.abs(Math.sin((u * 20 + g * 3) * 3.14)), 14), t = clamp(g * 0.9), c = mixc(C('#3d342a'), C('#7a6c5a'), t), k = 1 - cr * 0.5; return [c[0] * k, c[1] * k, c[2] * k, g * 0.5 - cr]; }, { repeat: [2, 6], strength: 3, rough: 0.93 });
  const paintEdge = new THREE.MeshStandardMaterial({ color: 0x1a3440, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.6, metalness: 0.3 });
  const coconut = new THREE.MeshStandardMaterial({ color: 0x6f5a2e, roughness: 0.8 });
  const cone = new THREE.MeshStandardMaterial({ color: 0xd96a2a, roughness: 0.75 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.7 });
  const can = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.35, metalness: 0.9 });
  const insul = new THREE.MeshStandardMaterial({ color: 0x8a5a44, roughness: 0.3 });
  return { timber, concrete, galv, rock, bark, soil, pole, paintEdge, dark, coconut, cone, white, can, insul };
}
// alpha-cut plant cards painted on canvas
function plantTextures(THREE) {
  if (TEXC.has('plants')) return TEXC.get('plants');
  const R = rng(5);
  const mk = (w, h, fn) => { const c = makeCanvas(w, h), x = c.getContext('2d'); fn(x); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const frond = mk(512, 160, (x) => { // rachis along the middle, leaflets raking outward
    for (let i = 0; i < 64; i++) { const t = i / 63, px = 14 + t * 486, L = (70 * Math.sin(Math.PI * Math.pow(t, 0.6)) + 8) * (0.85 + R() * 0.3); for (const s of [-1, 1]) { const g = 70 + R() * 70 | 0; x.strokeStyle = `rgb(${g * 0.5 | 0},${g + 40},${g * 0.42 | 0})`; x.lineWidth = 5.5 - t * 2.5; x.lineCap = 'round'; x.beginPath(); x.moveTo(px, 80); x.quadraticCurveTo(px + 16, 80 + s * L * 0.5, px + 30 + R() * 10, 80 + s * L); x.stroke(); x.strokeStyle = 'rgba(20,50,20,0.5)'; x.lineWidth = 1; x.stroke(); } }
    x.strokeStyle = '#b5a96a'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, 80); x.lineTo(505, 80); x.stroke();
  });
  const grape = mk(256, 256, (x) => { // a spray of round, red-veined sea grape leaves
    for (let i = 0; i < 9; i++) { const cx = 50 + R() * 156, cy = 50 + R() * 156, r = 30 + R() * 16, g = x.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, r); const yl = R() < 0.18; g.addColorStop(0, yl ? '#c9b24a' : '#6fa45a'); g.addColorStop(1, yl ? '#9a6a2a' : '#2f6b3c'); x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, r, r * 0.92, R() * 3, 0, 6.3); x.fill(); x.strokeStyle = 'rgba(16,40,22,0.7)'; x.lineWidth = 1.5; x.stroke(); x.strokeStyle = 'rgba(190,70,60,0.8)'; x.lineWidth = 1.6; const a = R() * 6.3; for (let v = -2; v <= 2; v++) { x.beginPath(); x.moveTo(cx - Math.cos(a) * r * 0.8, cy - Math.sin(a) * r * 0.8); x.lineTo(cx + Math.cos(a + v * 0.5) * r * 0.85, cy + Math.sin(a + v * 0.5) * r * 0.85); x.stroke(); } }
  });
  const grass = mk(256, 256, (x) => { for (let i = 0; i < 70; i++) { const bx = 128 + R.gauss() * 46, L = 90 + R() * 150, lean = R.gauss() * 70, g = 90 + R() * 80 | 0; x.strokeStyle = R() < 0.25 ? `rgb(${g + 60},${g + 40},${g * 0.5 | 0})` : `rgb(${g * 0.55 | 0},${g + 30},${g * 0.4 | 0})`; x.lineWidth = 2 + R() * 3.5; x.lineCap = 'round'; x.beginPath(); x.moveTo(bx, 256); x.quadraticCurveTo(bx + lean * 0.3, 256 - L * 0.6, bx + lean, 256 - L); x.stroke(); } });
  const mats = {};
  for (const [k, t] of [['frond', frond], ['grape', grape], ['grass', grass]]) mats[k] = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, metalness: 0 });
  TEXC.set('plants', mats); return mats;
}

export function buildKeysSign(THREE, opts = {}) {
  const { textures = null, mile = 106, seed = 11, ground = true } = opts;
  const R = rng(seed), M = materials(THREE), PM = plantTextures(THREE);
  const group = new THREE.Group(); group.name = 'keys-welcome-sign';
  const bins = {}; // material key -> geometries
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const put = (key, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, parent = null) => {
    m4.compose(v3(x, y, z), q.setFromEuler(e.set(rx, ry, rz, 'YXZ')), v3(sx, sy, sz));
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m4); if (parent) g.applyMatrix4(parent);
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    (bins[key] ||= []).push(g); return g;
  };
  const colliders = [];
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r0, r1, h, n = 10) => new THREE.CylinderGeometry(r0, r1, h, n);

  // ------------------------------------------------ the sign assembly (yawed toward the road)
  const S = KEYS_SIGN, signM = new THREE.Matrix4().makeRotationY(S.yaw);
  const sign = new THREE.Group(); sign.rotation.y = S.yaw; group.add(sign);
  let frontMat = null, backMat = null;
  if (textures) {
    const ol = textures.front.outline, shape = new THREE.Shape(ol.map(([u, v]) => new THREE.Vector2((u - 0.5) * S.width, (1 - v) * S.height)));
    const fg = new THREE.ShapeGeometry(shape, 4), uv = fg.attributes.uv, pos = fg.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / S.width + 0.5, pos.getY(i) / S.height);
    const T = 0.075;
    frontMat = new THREE.MeshStandardMaterial({ map: textures.front.color, normalMap: textures.front.normal, normalScale: new THREE.Vector2(1.5, 1.5), roughnessMap: textures.front.orm, metalnessMap: textures.front.orm, aoMap: textures.front.orm, roughness: 1, metalness: 0.5, emissiveMap: textures.front.color, emissive: new THREE.Color(1, 0.94, 0.82), emissiveIntensity: 0 });
    backMat = new THREE.MeshStandardMaterial({ map: textures.back.color, normalMap: textures.back.normal, roughnessMap: textures.back.orm, metalnessMap: textures.back.orm, roughness: 1, metalness: 1 });
    const front = new THREE.Mesh(fg, frontMat); front.position.set(0, S.bottom, 0.2 + T / 2); front.castShadow = true; front.receiveShadow = true; sign.add(front);
    const bg = fg.clone(); bg.rotateY(Math.PI); const back = new THREE.Mesh(bg, backMat); back.position.set(0, S.bottom, 0.2 - T / 2); back.receiveShadow = true; sign.add(back);
    // cut edge
    const ep = [], n = ol.length; for (let i = 0; i < n; i++) { const a = ol[i], b = ol[(i + 1) % n], ax = (a[0] - 0.5) * S.width, ay = (1 - a[1]) * S.height, bx = (b[0] - 0.5) * S.width, by = (1 - b[1]) * S.height; ep.push(ax, ay, T / 2, bx, by, T / 2, bx, by, -T / 2, ax, ay, T / 2, bx, by, -T / 2, ax, ay, -T / 2); }
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); eg.computeVertexNormals();
    const edge = new THREE.Mesh(eg, new THREE.MeshStandardMaterial({ color: 0x23404a, roughness: 0.8, side: THREE.DoubleSide })); edge.position.set(0, S.bottom, 0.2); edge.castShadow = true; sign.add(edge);
  }
  // posts, stringers, braces, brackets, footings
  const postX = [-1.75, 1.75], postH = S.bottom + S.height - 0.25;
  for (const px of postX) {
    put('timber', box(0.26, postH, 0.26), px, postH / 2, 0, 0, 0, 0, 1, 1, 1, signM);
    put('timber', box(0.3, 0.06, 0.3), px, postH + 0.03, 0, 0, 0, 0, 1, 1, 1, signM); // weather cap
    put('concrete', cyl(0.42, 0.46, 0.34, 18), px, 0.17, 0, 0, 0, 0, 1, 1, 1, signM);
    put('timber', box(0.14, 2.6, 0.14), px, 1.05, -0.95, 0.72, 0, 0, 1, 1, 1, signM); // raking brace to the back
    put('concrete', box(0.5, 0.2, 0.5), px, 0.1, -1.85, 0, 0, 0, 1, 1, 1, signM);
    for (const by of [0.6, 1.5, S.bottom + 0.5, S.bottom + 1.8, S.bottom + 3.0]) { put('galv', cyl(0.028, 0.028, 0.02, 8), px, by, 0.135, Math.PI / 2, 0, 0, 1, 1, 1, signM); put('galv', cyl(0.045, 0.045, 0.006, 8), px, by, 0.132, Math.PI / 2, 0, 0, 1, 1, 1, signM); }
    const w = new THREE.Vector3(px, 0, 0).applyMatrix4(signM); colliders.push({ type: 'box', x: w.x, y: postH / 2, z: w.z, hx: 0.15, hy: postH / 2, hz: 0.15, ry: S.yaw });
  }
  for (const sy of [S.bottom + 0.35, S.bottom + 1.75, S.bottom + 3.05]) { put('timber', box(4.6, 0.19, 0.045), 0, sy, 0.152, 0, 0, 0, 1, 1, 1, signM); for (const px of postX) put('galv', box(0.32, 0.26, 0.012), px, sy, 0.13, 0, 0, 0, 1, 1, 1, signM); }
  { const w = new THREE.Vector3(0, 0, 0.2).applyMatrix4(signM); colliders.push({ type: 'box', x: w.x, y: S.bottom + S.height / 2, z: w.z, hx: S.width / 2 - 0.1, hy: S.height / 2 - 0.1, hz: 0.06, ry: S.yaw }); }
  // floodlights on arms over the top edge, wired back along the post
  const lights = [], lenses = [];
  for (const lx of [-1.75, 1.75]) {
    const top = postH + 0.06;
    put('galv', cyl(0.03, 0.03, 0.75, 8), lx, top + 0.36, 0, 0, 0, 0, 1, 1, 1, signM);
    put('galv', cyl(0.028, 0.028, 1.5, 8), lx, top + 0.72, 0.72, Math.PI / 2, 0, 0, 1, 1, 1, signM);
    put('dark', box(0.42, 0.13, 0.3), lx, top + 0.66, 1.5, -1.05, 0, 0, 1, 1, 1, signM);
    put('dark', box(0.46, 0.02, 0.36), lx, top + 0.78, 1.46, -1.05, 0, 0, 1, 1, 1, signM); // visor
    put('galv', cyl(0.012, 0.012, postH, 6), lx + 0.1, postH / 2, -0.14, 0, 0, 0, 1, 1, 1, signM); // conduit
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), new THREE.MeshStandardMaterial({ color: 0x555a5e, emissive: new THREE.Color(1, 0.9, 0.72), emissiveIntensity: 0, roughness: 0.2 }));
    lens.position.set(lx, top + 0.6, 1.44); lens.rotation.x = Math.PI - 1.05 + Math.PI; lens.rotation.x = Math.PI / 2 + 0.52; sign.add(lens); lenses.push(lens);
    const lp = new THREE.Vector3(lx, top + 0.58, 1.42).applyMatrix4(signM), lt = new THREE.Vector3(lx * 0.55, S.bottom + S.height * 0.45, 0.2).applyMatrix4(signM);
    lights.push({ position: lp, target: lt, color: 0xffe6b8, intensity: 1 });
  }
  put('galv', box(0.3, 0.4, 0.14), -1.75, 1.5, -0.22, 0, 0, 0, 1, 1, 1, signM); // switch / photocell box
  put('dark', cyl(0.035, 0.035, 0.07, 8), -1.75, 1.74, -0.22, 0, 0, 0, 1, 1, 1, signM);

  // ------------------------------------------------ planted bed: coral rock ring, mulch, sea grape, palms, weeds
  const bedRX = 5.2, bedRZ = 2.7, bedC = [0.6, -0.1];
  { const g = new THREE.CircleGeometry(1, 40); g.rotateX(-Math.PI / 2); const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); p.setY(i, 0.16 * (1 - r * r)); uv.setXY(i, p.getX(i) * 2.2, p.getZ(i) * 1.2); } g.computeVertexNormals(); put('soil', g, bedC[0], 0.05, bedC[1], 0, 0, 0, bedRX, 1, bedRZ); }
  const rockG = new THREE.IcosahedronGeometry(1, 2); { const p = rockG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.78 + 0.5 * fbm(x * 1.7 + 5, y * 1.7 + z * 1.3, 3, 7); p.setXYZ(i, x * k, y * k * 0.72, z * k); } rockG.computeVertexNormals(); }
  for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 2 + R.gauss() * 0.04, s = 0.22 + R() * 0.26, rr = 1 + R.gauss() * 0.025; put('rock', rockG, bedC[0] + Math.cos(a) * bedRX * rr, s * 0.35, bedC[1] + Math.sin(a) * bedRZ * rr, R() * 0.4, R() * 6.3, R() * 0.4, s * (0.9 + R() * 0.5), s, s * (0.9 + R() * 0.5)); }
  for (const [x, z, s] of [[-2.9, 1.5, 0.55], [3.6, 1.2, 0.7], [0.3, 1.9, 0.42], [4.3, -0.9, 0.5]]) put('rock', rockG, x, s * 0.4, z, 0, R() * 6.3, 0, s * 1.3, s, s);
  colliders.push({ type: 'box', x: bedC[0], y: 0.2, z: bedC[1], hx: bedRX, hy: 0.2, hz: bedRZ, ry: 0 });
  // sea grape: stout crooked stems under a dome of leaf sprays
  const card = new THREE.PlaneGeometry(1, 1);
  const seaGrape = (x, z, h, w) => {
    for (let i = 0; i < 5; i++) { const a = R() * 6.3, l = h * (0.5 + R() * 0.3); put('bark', cyl(0.03, 0.06, l, 6), x + Math.cos(a) * 0.25, l / 2 * 0.9, z + Math.sin(a) * 0.25, 0.35 * Math.sin(a), 0, -0.35 * Math.cos(a)); }
    const n = Math.round(60 * w * h);
    for (let i = 0; i < n; i++) { const a = R() * 6.3, el = Math.acos(R() * 0.95), rr = 0.55 + 0.45 * Math.sqrt(R()), s = 0.55 + R() * 0.4; put('grape', card, x + Math.cos(a) * Math.sin(el) * w * rr, 0.25 + Math.cos(el) * h * rr * 0.9 + R() * 0.15, z + Math.sin(a) * Math.sin(el) * w * rr * 0.85, (R() - 0.5) * 1.2 - 0.3, a + Math.PI / 2 + R.gauss() * 0.5, R() * 6.3, s); }
  };
  seaGrape(-3.1, -0.3, 1.5, 1.35); seaGrape(3.7, -0.2, 1.9, 1.6); seaGrape(1.2, -1.5, 1.3, 1.2); seaGrape(-0.6, 1.2, 0.8, 1.0); seaGrape(2.3, 1.3, 0.7, 0.9);
  // coconut palms
  const crowns = [];
  const palm = (x, z, h, lean, la) => {
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(v3(x + Math.cos(la) * lean * t * t, h * t, z + Math.sin(la) * lean * t * t)); }
    const curve = new THREE.CatmullRomCurve3(pts), tg = new THREE.TubeGeometry(curve, 16, 0.17, 9, false);
    { const p = tg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + 0.75 * Math.exp(-y / 0.5) - 0.18 * (y / h); const t = clamp(y / h), cx = x + Math.cos(la) * lean * t * t, cz = z + Math.sin(la) * lean * t * t; p.setX(i, cx + (p.getX(i) - cx) * k); p.setZ(i, cz + (p.getZ(i) - cz) * k); } tg.computeVertexNormals(); }
    put('bark', tg);
    const top = pts[8], crown = new THREE.Group(); crown.position.copy(top); group.add(crown); crowns.push(crown);
    const fg = [];
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * Math.PI * 2 + R.gauss() * 0.12, up = 0.95 - (i % 3) * 0.42 + R.gauss() * 0.08, L = 3.1 + R() * 0.9, W = 1.25, seg = 9, P = [], U = [], I = [];
      for (let s = 0; s <= seg; s++) { const t = s / seg, r = L * t, y = Math.sin(up) * r - (0.5 + 0.45 * (1 - up)) * r * r / L * 0.62, d = Math.cos(up) * r, wv = W * (0.25 + 0.75 * Math.sin(Math.PI * Math.pow(t, 0.7))) * 0.5, dr = wv * 0.55;
        const cx = Math.cos(a) * d, cz = Math.sin(a) * d, sx = -Math.sin(a), sz = Math.cos(a);
        P.push(cx - sx * wv, y - dr, cz - sz * wv, cx, y, cz, cx + sx * wv, y - dr, cz + sz * wv); U.push(t, 0, t, 0.5, t, 1);
        if (s < seg) { const o = s * 3; I.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals(); fg.push(g.toNonIndexed());
    }
    const fm = new THREE.Mesh(mergeGeometries(fg), PM.frond); fm.castShadow = true; crown.add(fm);
    for (let i = 0; i < 5; i++) { const a = R() * 6.3; const c = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), M.coconut); c.position.set(Math.cos(a) * 0.24, -0.22 - R() * 0.1, Math.sin(a) * 0.24); c.scale.y = 1.15; crown.add(c); }
    colliders.push({ type: 'cyl', x, y: 1.5, z, r: 0.24, hh: 1.5 });
  };
  palm(4.9, -2.3, 8.6, 1.5, 0.5); palm(-4.4, -3.0, 7.2, 1.2, 2.8); palm(6.8, 0.6, 5.4, 0.9, -0.4);
  // weeds along the barrier, posts and rocks
  const tuft = [card.clone().translate(0, 0.5, 0), card.clone().translate(0, 0.5, 0).rotateY(Math.PI / 2)];
  const weed = (x, z, s) => { const ry = R() * 3; for (const t of tuft) put('grass', t, x, 0.02, z, 0, ry, 0, s * (0.8 + R() * 0.5), s, s); };
  for (let i = 0; i < 46; i++) weed(-3.95 + R.gauss() * 0.14, -11 + R() * 26, 0.3 + R() * 0.45);
  for (let i = 0; i < 40; i++) { const a = R() * 6.3; weed(bedC[0] + Math.cos(a) * (bedRX + 0.25 + R() * 0.5), bedC[1] + Math.sin(a) * (bedRZ + 0.25 + R() * 0.5), 0.3 + R() * 0.5); }
  for (let i = 0; i < 26; i++) weed(-2.5 + R() * 6, -0.6 + R.gauss() * 0.8, 0.45 + R() * 0.6);

  // ------------------------------------------------ road edge: jersey barrier run, then W-beam guardrail
  { const s = new THREE.Shape(); const pr = [[-0.3, 0], [0.3, 0], [0.3, 0.075], [0.18, 0.33], [0.1, 0.81], [-0.1, 0.81], [-0.18, 0.33], [-0.3, 0.075]]; s.moveTo(pr[0][0], pr[0][1]); for (const p of pr.slice(1)) s.lineTo(p[0], p[1]);
    const seg = new THREE.ExtrudeGeometry(s, { depth: 3.62, bevelEnabled: false });
    for (let i = 0; i < 6; i++) { const z = -9.5 + i * 3.66, yaw = R.gauss() * 0.006; put('concrete', seg, -4.35 + R.gauss() * 0.012, 0, z, 0, yaw, 0); put('dark', box(0.06, 0.05, 0.02), -4.35, 0.84, z + 1.8); colliders.push({ type: 'box', x: -4.35, y: 0.4, z: z + 1.81, hx: 0.3, hy: 0.4, hz: 1.81, ry: 0 }); }
    // sloped end section facing traffic
    const end = new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: false }); { const p = end.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getZ(i) / 2.4; p.setY(i, p.getY(i) * (1 - 0.82 * t)); } end.computeVertexNormals(); } put('concrete', end, -4.35, 0, 12.46);
    // guardrail beyond the barrier
    const wb = new THREE.Shape(); const wp = [[0, -0.155], [0.035, -0.12], [0.035, -0.06], [0, -0.02], [0, 0.02], [0.035, 0.06], [0.035, 0.12], [0, 0.155], [-0.012, 0.155], [0.02, 0.12], [0.02, 0.06], [-0.012, 0.02], [-0.012, -0.02], [0.02, -0.06], [0.02, -0.12], [-0.012, -0.155]]; wb.moveTo(wp[0][0], wp[0][1]); for (const p of wp.slice(1)) wb.lineTo(p[0], p[1]);
    put('galv', new THREE.ExtrudeGeometry(wb, { depth: 15, bevelEnabled: false }), -4.5, 0.58, -24.6, 0, 0, 0, -1, 1, 1);
    for (let z = -24; z <= -10.5; z += 1.9) { put('galv', box(0.1, 0.9, 0.14), -4.38, 0.42, z); put('timber', box(0.14, 0.34, 0.18), -4.44, 0.6, z); }
    colliders.push({ type: 'box', x: -4.45, y: 0.4, z: -17.1, hx: 0.12, hy: 0.4, hz: 7.5, ry: 0 });
  }
  // ------------------------------------------------ utility poles with crossarms, transformer, sagging conductors
  const poleZ = [-64, -32, 0, 32, 64], poleX = 8.2, poleH = 11.2, wirePts = [], perches = [];
  const att = [[-1.05, poleH - 0.55], [-0.35, poleH - 0.55], [1.05, poleH - 0.55], [0.12, poleH - 2.0], [0.14, poleH - 4.3], [0.14, poleH - 4.75]], sagOf = [0.75, 0.8, 0.7, 0.95, 1.5, 1.7];
  poleZ.forEach((pz, i) => {
    const lx = R.gauss() * 0.02, lz = R.gauss() * 0.02;
    put('pole', cyl(0.115, 0.165, poleH, 10), poleX, poleH / 2, pz, lz, 0, lx);
    put('pole', box(2.5, 0.11, 0.13), poleX, poleH - 0.7, pz + 0.14);
    put('galv', box(0.04, 0.9, 0.012), poleX - 0.45, poleH - 1.05, pz + 0.2, 0, 0, 0.9); put('galv', box(0.04, 0.9, 0.012), poleX + 0.45, poleH - 1.05, pz + 0.2, 0, 0, -0.9);
    for (const a of att.slice(0, 3)) { put('insul', cyl(0.045, 0.06, 0.15, 8), poleX + a[0], poleH - 0.6, pz + 0.14); }
    put('insul', cyl(0.04, 0.04, 0.1, 8), poleX + 0.12, poleH - 2.0, pz, 0, 0, Math.PI / 2);
    if (i === 2) { put('galv', cyl(0.27, 0.27, 0.78, 14), poleX - 0.42, poleH - 2.9, pz); put('galv', cyl(0.28, 0.28, 0.03, 14), poleX - 0.42, poleH - 2.5, pz); put('insul', cyl(0.03, 0.045, 0.2, 8), poleX - 0.42, poleH - 2.38, pz); put('galv', box(0.5, 0.06, 0.06), poleX - 0.2, poleH - 2.9, pz); }
    if (i === 1 || i === 3) { // street light arm
      put('galv', cyl(0.03, 0.03, 2.2, 8), poleX - 1.1, poleH - 3.2, pz, 0, 0, Math.PI / 2 - 0.22); put('dark', box(0.55, 0.11, 0.24), poleX - 2.25, poleH - 2.98, pz);
    }
    colliders.push({ type: 'cyl', x: poleX, y: 2, z: pz, r: 0.17, hh: 2 });
    if (i < poleZ.length - 1) att.forEach((a, k) => { const z1 = poleZ[i + 1], n = 14; for (let s = 0; s < n; s++) { const t0 = s / n, t1 = (s + 1) / n, y0 = a[1] - sagOf[k] * 4 * t0 * (1 - t0), y1 = a[1] - sagOf[k] * 4 * t1 * (1 - t1); wirePts.push(poleX + a[0], y0, pz + (z1 - pz) * t0 + 0.14, poleX + a[0], y1, pz + (z1 - pz) * t1 + 0.14); if (k < 4 && (i === 1 || i === 2) && s > 1 && s < n - 2 && R() < 0.3) perches.push(v3(poleX + a[0], y0 + 0.012, pz + (z1 - pz) * t0 + 0.14)); } });
  });
  put('galv', cyl(0.008, 0.008, 9.2, 5), poleX + 1.9, 4.1, 0, 0, 0, -0.44); // guy wire
  { const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3)); const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x15171a })); wires.name = 'wires'; group.add(wires); }

  // ------------------------------------------------ mile marker, litter, cone, hubcap
  { const c = makeCanvas(128, 512), x = c.getContext('2d'); x.fillStyle = '#0c6a43'; x.fillRect(0, 0, 128, 512); x.strokeStyle = '#e9efe9'; x.lineWidth = 6; x.strokeRect(6, 6, 116, 500);
    drawFHWA(x, 'MILE', 64, 78, 38, { series: 'C', align: 'center' }); String(mile).split('').forEach((dch, i) => drawFHWA(x, dch, 64, 200 + i * 128, 96, { series: 'D', align: 'center' }));
    const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, 'rgba(60,50,30,0)'); g.addColorStop(1, 'rgba(60,50,30,0.35)'); x.fillStyle = g; x.fillRect(0, 0, 128, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.45 })); mm.position.set(-3.75, 1.75, 16.2); mm.rotation.y = 0.06; group.add(mm);
    put('galv', box(0.3, 1.2, 0.004), -3.75, 1.75, 16.195, 0, 0.06, 0); put('galv', box(0.07, 2.35, 0.03), -3.75, 1.17, 16.17, 0, 0.06, 0.012);
    colliders.push({ type: 'cyl', x: -3.75, y: 0.8, z: 16.17, r: 0.05, hh: 0.8, bend: true }); }
  put('can', cyl(0.033, 0.033, 0.12, 10), -3.7, 0.035, 4.2, Math.PI / 2, 0.7, 0); put('can', cyl(0.033, 0.03, 0.1, 10), -3.2, 0.035, -2.6, Math.PI / 2, 2.1, 0, 1, 0.8, 1);
  put('white', cyl(0.045, 0.032, 0.11, 10), -3.4, 0.045, 6.6, Math.PI / 2, 1.2, 0); put('white', new THREE.IcosahedronGeometry(0.16, 1), 2.9, 0.42, 1.55, 0.3, 0.5, 0, 1.2, 0.5, 0.8);
  put('cone', new THREE.ConeGeometry(0.16, 0.62, 12, 1, true), -3.3, 0.16, 11.2, 1.45, 0.6, 0); put('dark', box(0.36, 0.03, 0.36), -3.38, 0.18, 10.93, 1.45, 0.6, 0);
  put('can', cyl(0.19, 0.19, 0.03, 20), -3.98, 0.2, 1.4, 0, 0, 1.25); put('dark', cyl(0.07, 0.07, 0.034, 10), -3.98, 0.2, 1.4, 0, 0, 1.25);

  // ------------------------------------------------ ground: shoulder apron with tire marks
  if (ground) {
    const c = makeCanvas(512), x = c.getContext('2d'), id = x.createImageData(512, 512), d = id.data;
    for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) { const u = i / 512, v = j / 512, n = fbm(u * 60, v * 60, 3, 91), sp = vnoise(u * 300, v * 300, 93), m = fbm(u * 6, v * 6, 3, 95), k = (j * 512 + i) * 4, t = clamp(0.25 + n * 0.5 + sp * 0.3), gr = m > 0.6 ? (m - 0.6) * 2 : 0; d[k] = lerp(lerp(112, 168, t), 96, gr); d[k + 1] = lerp(lerp(104, 158, t), 106, gr); d[k + 2] = lerp(lerp(88, 136, t), 68, gr); const ex = Math.min(u, 1 - u, v, 1 - v); d[k + 3] = 255 * clamp(ex * 9 + (n - 0.5) * 0.6); }
    x.putImageData(id, 0, 0);
    // tire marks swinging onto the shoulder and back
    x.globalCompositeOperation = 'source-atop'; x.lineCap = 'round';
    for (const [o, a] of [[0, 0.5], [16, 0.42]]) { x.strokeStyle = `rgba(28,26,24,${a})`; x.lineWidth = 5.5; x.beginPath(); x.moveTo(34 + o, 500); x.bezierCurveTo(60 + o, 380, 120 + o, 330, 96 + o, 200); x.bezierCurveTo(80 + o, 120, 44 + o, 80, 30 + o, 10); x.stroke(); }
    x.fillStyle = 'rgba(40,36,30,0.25)'; x.beginPath(); x.ellipse(110, 300, 22, 40, 0.2, 0, 6.3); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const ap = new THREE.Mesh(new THREE.PlaneGeometry(22, 34), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    ap.rotation.x = -Math.PI / 2; ap.position.set(3.2, 0.025, 0); ap.receiveShadow = true; ap.name = 'apron'; group.add(ap);
  }
  // night glow: soft pool of light on the bed and face (additive), driven by update()
  const glowTex = (() => { const c = makeCanvas(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 2, 64, 64, 64); g.addColorStop(0, 'rgba(255,236,190,1)'); g.addColorStop(0.4, 'rgba(255,220,160,0.35)'); g.addColorStop(1, 'rgba(255,220,160,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), glowMat); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.3, 1.4); sign.add(pool);
  const halos = lenses.map((l) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); s.scale.set(1.5, 1.5, 1); s.position.copy(l.position); sign.add(s); return s; });

  // ------------------------------------------------ merge static parts per material
  const MAT = { timber: M.timber, concrete: M.concrete, galv: M.galv, rock: M.rock, bark: M.bark, soil: M.soil, pole: M.pole, dark: M.dark, cone: M.cone, white: M.white, can: M.can, insul: M.insul, grape: PM.grape, grass: PM.grass };
  for (const k of Object.keys(bins)) { const mesh = new THREE.Mesh(mergeGeometries(bins[k]), MAT[k]); mesh.name = 'ks_' + k; mesh.castShadow = !['soil', 'grass'].includes(k); mesh.receiveShadow = true; group.add(mesh); for (const g of bins[k]) g.dispose(); }

  // ------------------------------------------------ birds on the wires (wildlife hook: perches + scatterBirds)
  const birdGeo = (() => { const b = new THREE.SphereGeometry(0.07, 8, 6); b.scale(0.8, 0.9, 1.5); const h = new THREE.SphereGeometry(0.042, 8, 6); h.translate(0, 0.07, 0.085); const bk = new THREE.ConeGeometry(0.014, 0.05, 5); bk.rotateX(Math.PI / 2); bk.translate(0, 0.068, 0.145); const tl = new THREE.BoxGeometry(0.05, 0.012, 0.12); tl.translate(0, -0.02, -0.13); return mergeGeometries([b, h, bk, tl].map((g) => g.toNonIndexed())); })();
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8 }), wingGeo = new THREE.PlaneGeometry(0.2, 0.09); wingGeo.translate(0.1, 0, 0); wingGeo.rotateX(-Math.PI / 2);
  const birds = perches.slice(0, 11).map((p, i) => {
    const g = new THREE.Group(), body = new THREE.Mesh(birdGeo, birdMat); body.position.y = 0.06; g.add(body);
    const wl = new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0x2f2a26, roughness: 0.8, side: THREE.DoubleSide })), wr = wl.clone(); wr.scale.x = -1; wl.position.y = wr.position.y = 0.09; wl.visible = wr.visible = false; g.add(wl, wr);
    g.position.copy(p); g.rotation.y = (R() < 0.5 ? 0 : Math.PI) + Math.PI / 2 + R.gauss() * 0.3; group.add(g);
    return { g, wl, wr, home: p.clone(), homeYaw: g.rotation.y, state: 0, t: R() * 10, ph: R() * 6, r: 6 + R() * 9, sp: 0.7 + R() * 0.5, delay: 0 };
  });
  let scatterT = 0;
  function scatterBirds(cause = 'noise') { if (scatterT > 0) return false; scatterT = 26 + R() * 14; birds.forEach((b, i) => { b.state = 1; b.t = 0; b.delay = i * 0.07 + R() * 0.25; }); return true; }
  const tmp = new THREE.Vector3();
  let clock = 0;
  function update(dt, ctx = {}) {
    clock += dt;
    const night = clamp(ctx.night ?? 0);
    if (frontMat) frontMat.emissiveIntensity = 0.16 * night;
    for (const l of lenses) l.material.emissiveIntensity = 6 * night;
    glowMat.opacity = 0.16 * night; for (const h of halos) h.material.opacity = 0.75 * night;
    crowns.forEach((c, i) => { c.rotation.z = Math.sin(clock * 0.7 + i * 2) * 0.025 * (1 + (ctx.wind || 0)); c.rotation.x = Math.cos(clock * 0.53 + i) * 0.02; });
    if (ctx.playerLocal && scatterT <= 0) { for (const b of birds) { if (b.home.distanceToSquared(ctx.playerLocal) < 16 * 16 * (ctx.loud ? 9 : 1) && (ctx.loud || ctx.playerLocal.y > 4 || b.home.distanceToSquared(ctx.playerLocal) < 121)) { scatterBirds('player'); break; } } }
    if (scatterT > 0) scatterT -= dt;
    for (const b of birds) {
      if (b.state === 0) { b.g.position.y = b.home.y + Math.max(0, Math.sin(clock * 0.9 + b.ph) - 0.985) * 1.2; b.g.rotation.x = Math.sin(clock * 1.7 + b.ph) * 0.06; continue; }
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.t += dt; b.wl.visible = b.wr.visible = true;
      const f = Math.sin(clock * 22 + b.ph) * 0.9; b.wl.rotation.z = f; b.wr.rotation.z = -f;
      const back = scatterT < 6 ? clamp(1 - scatterT / 6) : 0, k = clamp(b.t / 2.2) * (1 - back);
      const a = b.ph + b.t * b.sp * 0.8; tmp.set(b.home.x + Math.cos(a) * b.r * k, b.home.y + (3 + b.r * 0.35) * k + Math.sin(b.t * 1.3) * 0.5 * k, b.home.z + Math.sin(a) * b.r * 1.6 * k);
      b.g.rotation.y = Math.atan2(tmp.x - b.g.position.x, tmp.z - b.g.position.z); b.g.position.copy(tmp);
      if (scatterT <= 0) { b.state = 0; b.wl.visible = b.wr.visible = false; b.g.position.copy(b.home); b.g.rotation.set(0, b.homeYaw, 0); }
    }
  }
  function dispose() { group.traverse((o) => { if (o.isMesh || o.isLineSegments) { if (!TEXC.has(o.material) && o.geometry) o.geometry.dispose(); } }); }
  return { group, colliders, lights, perches, birds, update, scatterBirds, dispose, sign, size: S };
}

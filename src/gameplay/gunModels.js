// Procedural weapon models v2 (meters). Grip/hand at the origin, barrel along +Z.
// Side profiles are extruded with bevels (real silhouettes), parts are merged per material (few draw calls),
// PBR materials use procedural roughness/bump maps (parkerized steel, stippled polymer, wood grain).
// userData: muzzle (local), eject (ejection port, local), flash ('pistol'|'rifle'|'shotgun'|'suppressed'|'revolver'), optic.
// All designs are original.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- procedural textures
function canvasTex(w, h, draw, srgb = false, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noise(g, w, h, base, amp, size = 1) {
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, base + (Math.random() - 0.5) * amp));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (size > 1) { g.globalAlpha = 0.5; g.drawImage(g.canvas, 0, 0, w / size, h / size, 0, 0, w, h); g.globalAlpha = 1; }
}
let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = {
    parkRough: canvasTex(256, 256, (g, w, h) => { noise(g, w, h, 150, 70, 2); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,90,90,${Math.random() * 0.4})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 30, 1); } }, false, 6),
    polyBump: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5000; i++) { const v = Math.random() < 0.5 ? 40 : 210; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 0.6 + Math.random() * 1.2, 0, 6.3); g.fill(); } }, false, 8),
    polyRough: canvasTex(128, 128, (g, w, h) => noise(g, w, h, 205, 50), false, 6),
    wood: canvasTex(256, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#6b3e1f'); gr.addColorStop(0.5, '#8a5630'); gr.addColorStop(1, '#5e3418');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${40 + Math.random() * 30},${20 + Math.random() * 15},8,${0.15 + Math.random() * 0.35})`; g.lineWidth = 0.5 + Math.random() * 2; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4 + (Math.random() - 0.5) * 2); g.stroke(); }
    }, true, 2),
    woodRough: canvasTex(128, 128, (g, w, h) => noise(g, w, h, 140, 60), false, 3),
    checker: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); g.strokeStyle = '#303030'; g.lineWidth = 2; for (let i = -w; i < w * 2; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } }, false, 10),
    knurl: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#909090'; g.fillRect(0, 0, w, h); g.fillStyle = '#404040'; for (let x = 0; x < w; x += 4) for (let y = 0; y < h; y += 4) if ((x + y) % 8 === 0) g.fillRect(x, y, 2, 2); }, false, 12),
  };
  return TEX;
}
let MAT = null;
function materials() {
  if (MAT) return MAT;
  const T = textures();
  MAT = {
    steel: new THREE.MeshPhysicalMaterial({ color: 0x2b2e33, metalness: 0.9, roughness: 0.42, roughnessMap: T.parkRough, clearcoat: 0.15, clearcoatRoughness: 0.6 }),
    steelDark: new THREE.MeshPhysicalMaterial({ color: 0x17191c, metalness: 0.85, roughness: 0.5, roughnessMap: T.parkRough }),
    blued: new THREE.MeshPhysicalMaterial({ color: 0x1f2633, metalness: 0.95, roughness: 0.25, roughnessMap: T.parkRough, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    stainless: new THREE.MeshPhysicalMaterial({ color: 0xb9bcc0, metalness: 1, roughness: 0.28, roughnessMap: T.parkRough }),
    alu: new THREE.MeshStandardMaterial({ color: 0x24272a, metalness: 0.7, roughness: 0.55, roughnessMap: T.parkRough }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x1c1d1b, metalness: 0.0, roughness: 0.82, roughnessMap: T.polyRough }),
    stipple: new THREE.MeshStandardMaterial({ color: 0x1a1b19, metalness: 0.0, roughness: 0.9, bumpMap: T.polyBump, bumpScale: 1.2 }),
    fde: new THREE.MeshStandardMaterial({ color: 0x8d7756, metalness: 0.0, roughness: 0.8, roughnessMap: T.polyRough }),
    fdeStipple: new THREE.MeshStandardMaterial({ color: 0x86704f, metalness: 0.0, roughness: 0.9, bumpMap: T.polyBump, bumpScale: 1.0 }),
    odg: new THREE.MeshStandardMaterial({ color: 0x4b5138, metalness: 0.05, roughness: 0.75, roughnessMap: T.polyRough }),
    wood: new THREE.MeshStandardMaterial({ map: T.wood, roughness: 0.55, roughnessMap: T.woodRough, metalness: 0 }),
    woodChecker: new THREE.MeshStandardMaterial({ map: T.wood, roughness: 0.6, bumpMap: T.checker, bumpScale: 1.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.95 }),
    knurl: new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.8, roughness: 0.5, bumpMap: T.knurl, bumpScale: 1.5 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a14f, metalness: 1, roughness: 0.3 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x5577aa, metalness: 0.1, roughness: 0.02, transmission: 0.2, transparent: true, opacity: 0.85, iridescence: 0.8, iridescenceIOR: 1.6, clearcoat: 1, envMapIntensity: 2 }),
    glassClear: new THREE.MeshPhysicalMaterial({ color: 0xbfe0ff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.25, iridescence: 0.6, clearcoat: 1 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    tritium: new THREE.MeshBasicMaterial({ color: 0x9dff7a }),
    white: new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.6 }),
    blade: new THREE.MeshPhysicalMaterial({ color: 0xd5dade, metalness: 1, roughness: 0.15, clearcoat: 0.6 }),
    grenade: new THREE.MeshStandardMaterial({ color: 0x46502f, roughness: 0.7, metalness: 0.15, bumpMap: T.polyBump, bumpScale: 0.4 }),
    tape: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92, bumpMap: T.polyRough, bumpScale: 0.6 }),
  };
  return MAT;
}

// ---------------------------------------------------------------- part builders (bake transforms, merge per material)
class Builder {
  constructor() { this.parts = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }
  box(w, h, d, mat, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
  cyl(r1, r2, len, mat, x = 0, y = 0, z = 0, seg = 16, axis = 'z', open = false) {
    const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open);
    return this.add(g, mat, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
  }
  // side profile [[z, y], ...] (forward, up) extruded across X with bevel
  prof(pts, thick, mat, x = 0, bevel = null, holes = null) {
    if (bevel === null) bevel = Math.min(0.005, thick * 0.14);
    const sh = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
    if (holes) for (const h of holes) sh.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, thick - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
    g.rotateY(-Math.PI / 2); g.translate(thick / 2 - bevel + x, 0, 0);
    // planar UVs scaled for the detail textures
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getZ(i) * 8 + p.getX(i) * 8; uv[i * 2 + 1] = p.getY(i) * 8; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return this.add(g, mat);
  }
  // picatinny rail along Z
  rail(z0, z1, y, mat, width = 0.021) {
    const len = z1 - z0;
    this.box(width * 0.75, 0.006, len, mat, 0, y, (z0 + z1) / 2);
    for (let z = z0 + 0.003; z < z1 - 0.004; z += 0.01) this.box(width, 0.0045, 0.0052, mat, 0, y + 0.005, z + 0.0026);
    return this;
  }
  serrations(z0, z1, y0, y1, x, n, mat, depth = 0.0015) {
    for (let i = 0; i < n; i++) { const z = z0 + (z1 - z0) * (i / (n - 1)); this.box(depth, y1 - y0, 0.0018, mat, x, (y0 + y1) / 2, z, 0.25); }
    return this;
  }
  build(meshName = 'weapon') {
    const g = new THREE.Group(); g.name = meshName;
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat); m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
    return g;
  }
}

// ---------------------------------------------------------------- shared sub-assemblies
function redDot(b, M, z, y) { // compact tube red dot on the rail
  b.box(0.026, 0.008, 0.05, M.alu, 0, y + 0.004, z);
  b.cyl(0.016, 0.016, 0.052, M.alu, 0, y + 0.026, z, 18);
  b.cyl(0.0175, 0.0175, 0.008, M.alu, 0, y + 0.026, z + 0.026, 18);
  b.cyl(0.0175, 0.0175, 0.008, M.alu, 0, y + 0.026, z - 0.026, 18);
  b.cyl(0.0135, 0.0135, 0.002, M.lens, 0, y + 0.026, z + 0.029, 18);
  b.cyl(0.0135, 0.0135, 0.002, M.lens, 0, y + 0.026, z - 0.029, 18);
  b.cyl(0.006, 0.006, 0.012, M.alu, 0.019, y + 0.026, z, 10, 'x');
  b.cyl(0.0012, 0.0012, 0.001, M.dot, 0, y + 0.026, z + 0.0285, 8);
}
function holo(b, M, z, y) { // open-window holographic sight
  b.box(0.03, 0.006, 0.08, M.alu, 0, y + 0.003, z);
  b.box(0.004, 0.036, 0.075, M.alu, 0.016, y + 0.024, z); b.box(0.004, 0.036, 0.075, M.alu, -0.016, y + 0.024, z);
  b.box(0.036, 0.004, 0.075, M.alu, 0, y + 0.043, z);
  b.box(0.026, 0.03, 0.002, M.glassClear, 0, y + 0.024, z + 0.03);
  b.box(0.026, 0.03, 0.002, M.glassClear, 0, y + 0.024, z - 0.02);
  b.cyl(0.0025, 0.0025, 0.0005, M.dot, 0, y + 0.024, z + 0.031, 10);
  b.box(0.012, 0.012, 0.03, M.alu, 0.022, y + 0.012, z - 0.02);
}
function scope(b, M, z, y, len = 0.32, r = 0.0155, obj = 0.026, eye = 0.021) { // variable-power riflescope
  b.cyl(r, r, len * 0.55, M.steelDark, 0, y, z, 20);
  b.cyl(obj, r, len * 0.18, M.steelDark, 0, y, z + len * 0.35, 20);
  b.cyl(obj, obj, len * 0.12, M.steelDark, 0, y, z + len * 0.5, 20);
  b.cyl(r, eye, len * 0.12, M.steelDark, 0, y, z - len * 0.33, 20);
  b.cyl(eye, eye, len * 0.1, M.knurl, 0, y, z - len * 0.44, 20);
  b.cyl(obj * 0.86, obj * 0.86, 0.002, M.lens, 0, y, z + len * 0.565, 22);
  b.cyl(eye * 0.82, eye * 0.82, 0.002, M.lens, 0, y, z - len * 0.495, 20);
  b.cyl(0.0085, 0.0085, 0.022, M.knurl, 0, y + r + 0.009, z, 14, 'y');      // elevation turret
  b.cyl(0.0085, 0.0085, 0.022, M.knurl, r + 0.009, y, z, 14, 'x');          // windage turret
  b.cyl(0.006, 0.006, 0.016, M.knurl, -r - 0.006, y, z + 0.02, 12, 'x');    // parallax
  for (const dz of [-len * 0.18, len * 0.14]) { b.box(0.026, 0.02, 0.016, M.steelDark, 0, y - r - 0.006, z + dz); b.cyl(r + 0.004, r + 0.004, 0.016, M.steelDark, 0, y, z + dz, 20); }
}
function sights(b, M, zr, zf, y, tritium = true) {
  b.box(0.022, 0.009, 0.01, M.steelDark, 0, y + 0.0045, zr); b.box(0.007, 0.006, 0.01, M.steelDark, 0, y + 0.012, zr); // notch posts
  b.box(0.0045, 0.009, 0.008, M.steelDark, 0, y + 0.0045, zf);
  if (tritium) { b.cyl(0.0012, 0.0012, 0.001, M.tritium, 0.0065, y + 0.008, zr - 0.0052, 6); b.cyl(0.0012, 0.0012, 0.001, M.tritium, -0.0065, y + 0.008, zr - 0.0052, 6); b.cyl(0.0013, 0.0013, 0.001, M.tritium, 0, y + 0.007, zf - 0.0042, 6); }
}
function suppressor(b, M, z, y, r, len) {
  b.cyl(r, r, len, M.steelDark, 0, y, z + len / 2, 20);
  b.cyl(r * 0.97, r * 0.97, len * 0.12, M.knurl, 0, y, z + len * 0.08, 20);
  b.cyl(r * 0.5, r * 0.5, 0.002, M.rubber, 0, y, z + len + 0.001, 14);
}
function curvedMag(b, M, mat, z, y, h, w, depth, curve, ribs = true) {
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([z + curve * t * t + depth * 0.5, y - h * t]); }
  for (let i = n; i >= 0; i--) { const t = i / n; pts.push([z + curve * t * t - depth * 0.5, y - h * t]); }
  b.prof(pts, w, mat, 0, 0.002);
  if (ribs) for (let i = 1; i < 4; i++) { const t = i / 4; b.box(w + 0.002, 0.004, depth * 0.85, mat, 0, y - h * t, z + curve * t * t); }
  b.box(w + 0.004, 0.008, depth + 0.006, M.polymer, 0, y - h - 0.002, z + curve);
}

// ---------------------------------------------------------------- weapons
const BUILD = {
  pistol(b, M) { // striker-fired polymer service pistol
    // frame: dust cover + open trigger guard
    b.prof([[-0.05, 0.0], [0.125, 0.0], [0.129, -0.006], [0.126, -0.022], [0.07, -0.022], [0.066, -0.03], [0.06, -0.047], [0.046, -0.054], [0.012, -0.054], [0.004, -0.045], [0.0, -0.027], [-0.012, -0.024], [-0.05, -0.016]],
      0.028, M.polymer, 0, 0.003, [[[0.009, -0.028], [0.016, -0.048], [0.04, -0.048], [0.052, -0.045], [0.056, -0.028]]]);
    // grip (18 deg rake) with beavertail and finger swell, stippled
    b.prof([[-0.002, -0.024], [-0.012, -0.06], [-0.016, -0.075], [-0.024, -0.1], [-0.03, -0.128], [-0.074, -0.12], [-0.066, -0.075], [-0.06, -0.03], [-0.07, -0.01], [-0.06, -0.006], [-0.048, -0.014]], 0.03, M.stipple, 0, 0.005);
    b.box(0.032, 0.01, 0.046, M.polymer, 0, -0.128, -0.052, -0.31);                                                   // mag baseplate
    b.prof([[0.028, -0.026], [0.034, -0.026], [0.033, -0.04], [0.029, -0.046], [0.025, -0.044], [0.027, -0.036]], 0.006, M.steelDark, 0, 0.001); // trigger
    b.box(0.007, 0.009, 0.006, M.steelDark, 0.0145, -0.018, 0.0);                                                     // mag release
    b.box(0.006, 0.006, 0.014, M.steelDark, 0.0145, -0.006, 0.05);                                                    // slide stop
    b.rail(0.072, 0.12, -0.026, M.polymer, 0.02);
    // slide
    b.prof([[-0.058, 0.0], [0.122, 0.0], [0.131, 0.008], [0.131, 0.026], [0.12, 0.035], [-0.05, 0.035], [-0.059, 0.026]], 0.03, M.steel, 0, 0.003);
    b.serrations(-0.05, -0.024, 0.004, 0.03, 0.0152, 7, M.steelDark); b.serrations(-0.05, -0.024, 0.004, 0.03, -0.0152, 7, M.steelDark);
    b.serrations(0.092, 0.114, 0.006, 0.028, 0.0152, 5, M.steelDark); b.serrations(0.092, 0.114, 0.006, 0.028, -0.0152, 5, M.steelDark);
    b.box(0.003, 0.011, 0.04, M.steelDark, 0.0152, 0.027, 0.02);                                                      // ejection port
    b.box(0.02, 0.005, 0.036, M.brass, 0, 0.034, 0.02);                                                               // barrel hood
    b.cyl(0.0068, 0.0068, 0.008, M.steelDark, 0, 0.017, 0.13, 18); b.cyl(0.0045, 0.0045, 0.0085, M.rubber, 0, 0.017, 0.13, 12);
    b.box(0.006, 0.006, 0.01, M.steelDark, 0.015, 0.005, -0.03);                                                      // takedown
    sights(b, M, -0.047, 0.12, 0.035);
    return { muzzle: [0, 0.017, 0.136], eject: [0.016, 0.027, 0.02], flash: 'pistol' };
  },
  revolver(b, M) { // large-frame double action, stainless with wood grips
    b.prof([[-0.045, 0.0], [-0.03, 0.038], [0.0, 0.044], [0.075, 0.044], [0.078, 0.0], [0.045, -0.01], [0.034, -0.03], [0.004, -0.022], [-0.03, -0.012]], 0.03, M.stainless);
    // rounded wood grip (bird's-head curve)
    const gp = []; for (let i = 0; i <= 10; i++) { const t = i / 10; gp.push([-0.012 - t * 0.028 - Math.sin(t * Math.PI) * 0.006, -0.01 - t * 0.1]); }
    for (let i = 10; i >= 0; i--) { const t = i / 10; gp.push([-0.05 - t * 0.026 + Math.sin(t * Math.PI) * 0.01 - (t > 0.85 ? (t - 0.85) * 0.06 : 0), -0.004 - t * 0.106]); }
    b.prof(gp, 0.036, M.woodChecker, 0, 0.008);
    b.cyl(0.0275, 0.0275, 0.058, M.stainless, 0, 0.02, 0.035, 28);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; b.box(0.0045, 0.006, 0.036, M.steelDark, Math.cos(a) * 0.0262, 0.02 + Math.sin(a) * 0.0262, 0.033, 0, 0, a + Math.PI / 2); }
    b.cyl(0.0085, 0.0085, 0.004, M.steel, 0, 0.02, 0.065, 16);
    b.cyl(0.0115, 0.0115, 0.2, M.stainless, 0, 0.027, 0.175, 24);                                                     // round barrel
    b.prof([[0.08, 0.008], [0.262, 0.008], [0.272, 0.016], [0.272, 0.027], [0.08, 0.027]], 0.019, M.stainless);         // half underlug
    b.prof([[0.08, 0.034], [0.27, 0.034], [0.27, 0.044], [0.085, 0.044]], 0.008, M.stainless);                         // top rib
    for (let z = 0.1; z < 0.26; z += 0.02) b.box(0.0085, 0.003, 0.009, M.steelDark, 0, 0.043, z);
    b.cyl(0.0068, 0.0068, 0.003, M.rubber, 0, 0.027, 0.2755, 14);
    b.prof([[0.25, 0.044], [0.268, 0.044], [0.268, 0.052], [0.256, 0.052]], 0.005, M.steelDark); b.box(0.0055, 0.003, 0.004, M.dot, 0, 0.05, 0.262);
    b.box(0.016, 0.008, 0.012, M.steelDark, 0, 0.048, -0.025); b.box(0.005, 0.004, 0.012, M.steelDark, 0, 0.053, -0.025); // rear sight
    b.prof([[-0.052, 0.034], [-0.034, 0.052], [-0.026, 0.05], [-0.036, 0.03]], 0.008, M.stainless);                  // hammer
    b.prof([[0.012, -0.012], [0.02, -0.012], [0.016, -0.04], [0.008, -0.038]], 0.006, M.stainless);                  // trigger
    b.cyl(0.004, 0.004, 0.08, M.stainless, 0, 0.004, 0.105, 10);                                                       // ejector rod
    b.cyl(0.003, 0.003, 0.008, M.steel, 0.016, 0.03, 0.01, 8, 'x');                                                   // cylinder release
    return { muzzle: [0, 0.027, 0.277], eject: null, flash: 'revolver' };
  },
  microsmg(b, M) { // compact machine pistol with integral suppressor
    b.prof([[-0.06, 0.0], [0.14, 0.0], [0.14, 0.05], [-0.04, 0.05], [-0.06, 0.035]], 0.038, M.steel);
    b.prof([[-0.02, 0.0], [0.03, 0.0], [0.015, -0.13], [-0.03, -0.13]], 0.032, M.stipple);
    b.box(0.024, 0.18, 0.026, M.steelDark, 0, -0.07, 0.0, 0.12);                                                      // mag in grip
    b.box(0.03, 0.012, 0.032, M.polymer, 0, -0.165, -0.012);
    b.prof([[0.035, 0.0], [0.05, 0.0], [0.05, -0.04], [0.038, -0.035]], 0.008, M.steelDark);                          // trigger guard front
    b.rail(-0.04, 0.12, 0.05, M.alu, 0.019);
    suppressor(b, M, 0.14, 0.025, 0.019, 0.14);
    b.cyl(0.006, 0.006, 0.17, M.steel, 0.022, 0.012, -0.12, 10);                                                       // folding stock rails
    b.cyl(0.006, 0.006, 0.17, M.steel, -0.022, 0.012, -0.12, 10);
    b.box(0.05, 0.07, 0.012, M.rubber, 0, -0.01, -0.21);
    redDot(b, M, 0.03, 0.055);
    return { muzzle: [0, 0.025, 0.285], eject: [0.02, 0.035, 0.06], flash: 'suppressed' };
  },
  smg(b, M) { // roller-style SMG, holographic sight, slotted handguard
    b.prof([[-0.08, 0.0], [0.16, 0.0], [0.17, 0.012], [0.17, 0.055], [-0.07, 0.055], [-0.09, 0.04]], 0.044, M.steel);
    b.prof([[-0.03, 0.0], [0.03, 0.0], [0.012, -0.125], [-0.04, -0.125], [-0.045, -0.06]], 0.034, M.stipple);
    curvedMag(b, M, M.steelDark, 0.08, 0.0, 0.17, 0.026, 0.036, 0.04);
    b.prof([[0.15, 0.002], [0.33, 0.002], [0.33, 0.052], [0.15, 0.052]], 0.05, M.polymer);
    for (let z = 0.17; z < 0.32; z += 0.035) { b.box(0.002, 0.01, 0.022, M.steelDark, 0.026, 0.027, z); b.box(0.002, 0.01, 0.022, M.steelDark, -0.026, 0.027, z); }
    b.cyl(0.0085, 0.0085, 0.05, M.steelDark, 0, 0.028, 0.355, 14);
    b.cyl(0.014, 0.011, 0.035, M.steelDark, 0, 0.028, 0.39, 8);                                                        // birdcage
    b.rail(-0.06, 0.32, 0.055, M.alu);
    b.cyl(0.01, 0.01, 0.12, M.steelDark, 0.026, 0.045, 0.06, 10);                                                      // cocking tube
    b.box(0.01, 0.014, 0.02, M.steelDark, 0.034, 0.045, 0.12);
    b.prof([[-0.09, 0.045], [-0.1, 0.045], [-0.29, 0.03], [-0.3, -0.07], [-0.27, -0.075], [-0.12, -0.01], [-0.09, 0.0]], 0.036, M.polymer);
    b.box(0.04, 0.1, 0.015, M.rubber, 0, -0.02, -0.3, -0.1);
    holo(b, M, 0.02, 0.064);
    return { muzzle: [0, 0.028, 0.41], eject: [0.024, 0.04, 0.05], flash: 'rifle' };
  },
  rifle(b, M) { // direct-impingement style assault rifle, FDE furniture
    // lower + magwell
    b.prof([[-0.09, 0.0], [0.11, 0.0], [0.13, -0.012], [0.13, -0.065], [0.075, -0.065], [0.07, -0.02], [0.02, -0.02], [-0.02, -0.04], [-0.09, -0.02]], 0.044, M.alu);
    b.prof([[-0.028, -0.01], [0.02, -0.01], [0.004, -0.12], [-0.045, -0.115], [-0.05, -0.06]], 0.034, M.fdeStipple);   // grip
    b.prof([[0.01, -0.02], [0.07, -0.02], [0.07, -0.045], [0.015, -0.045]], 0.006, M.alu);                             // trigger guard
    curvedMag(b, M, M.fde, 0.1, -0.06, 0.2, 0.03, 0.06, 0.05);
    // upper with rail
    b.prof([[-0.095, 0.0], [0.17, 0.0], [0.17, 0.05], [-0.095, 0.05]], 0.042, M.alu);
    b.box(0.004, 0.018, 0.06, M.steelDark, 0.022, 0.03, 0.05);                                                        // ejection port
    b.box(0.006, 0.012, 0.02, M.alu, 0.024, 0.03, -0.01);                                                             // forward assist
    b.cyl(0.006, 0.006, 0.03, M.alu, 0.03, 0.03, -0.01, 10, 'x');
    b.box(0.03, 0.01, 0.02, M.alu, 0, 0.055, -0.1);                                                                   // charging handle
    b.rail(-0.09, 0.17, 0.05, M.alu);
    // free-float handguard
    b.prof([[0.17, -0.005], [0.45, -0.005], [0.45, 0.056], [0.17, 0.056]], 0.048, M.fde);
    for (let z = 0.2; z < 0.44; z += 0.04) { b.box(0.002, 0.012, 0.026, M.steelDark, 0.025, 0.028, z); b.box(0.002, 0.012, 0.026, M.steelDark, -0.025, 0.028, z); b.box(0.014, 0.002, 0.026, M.steelDark, 0, -0.006, z); }
    b.rail(0.18, 0.44, 0.056, M.alu);
    b.cyl(0.0095, 0.0095, 0.17, M.steelDark, 0, 0.026, 0.535, 14);
    b.cyl(0.013, 0.013, 0.02, M.steelDark, 0, 0.026, 0.48, 12);                                                       // gas block
    b.prof([[0.6, 0.012], [0.665, 0.012], [0.665, 0.04], [0.6, 0.04]], 0.026, M.steelDark);                          // brake
    for (const z of [0.615, 0.632, 0.649]) { b.box(0.0275, 0.006, 0.006, M.rubber, 0, 0.034, z); }
    // stock (buffer tube + adjustable stock)
    b.cyl(0.015, 0.015, 0.17, M.alu, 0, 0.026, -0.18, 16);
    b.prof([[-0.16, 0.042], [-0.3, 0.044], [-0.322, 0.05], [-0.326, -0.05], [-0.31, -0.055], [-0.23, -0.004], [-0.16, 0.008]], 0.04, M.fde);
    b.box(0.042, 0.1, 0.012, M.rubber, 0, 0.0, -0.332);
    redDot(b, M, 0.05, 0.059);
    b.box(0.02, 0.03, 0.01, M.steelDark, 0, 0.073, 0.42);                                                             // folding front BUIS
    return { muzzle: [0, 0.026, 0.67], eject: [0.025, 0.03, 0.05], flash: 'rifle', optic: 'reddot' };
  },
  carbine(b, M) { // short-barrel carbine, ODG furniture, LPVO and suppressor
    b.prof([[-0.09, 0.0], [0.11, 0.0], [0.13, -0.012], [0.13, -0.065], [0.075, -0.065], [0.07, -0.02], [0.02, -0.02], [-0.02, -0.04], [-0.09, -0.02]], 0.044, M.alu);
    b.prof([[-0.028, -0.01], [0.02, -0.01], [0.004, -0.12], [-0.045, -0.115], [-0.05, -0.06]], 0.034, M.stipple);
    b.prof([[0.01, -0.02], [0.07, -0.02], [0.07, -0.045], [0.015, -0.045]], 0.006, M.alu);
    b.box(0.028, 0.12, 0.058, M.steelDark, 0, -0.115, 0.1, 0.08);                                                    // straight mag
    b.box(0.032, 0.012, 0.062, M.polymer, 0, -0.178, 0.105);
    b.prof([[-0.095, 0.0], [0.17, 0.0], [0.17, 0.05], [-0.095, 0.05]], 0.042, M.alu);
    b.box(0.004, 0.018, 0.06, M.steelDark, 0.022, 0.03, 0.05);
    b.rail(-0.09, 0.17, 0.05, M.alu);
    b.prof([[0.17, -0.005], [0.36, -0.005], [0.36, 0.056], [0.17, 0.056]], 0.048, M.odg);
    b.rail(0.18, 0.36, 0.056, M.alu);
    for (let z = 0.2; z < 0.35; z += 0.04) { b.box(0.002, 0.012, 0.026, M.steelDark, 0.025, 0.028, z); b.box(0.002, 0.012, 0.026, M.steelDark, -0.025, 0.028, z); }
    b.prof([[0.3, -0.005], [0.33, -0.005], [0.325, -0.065], [0.305, -0.065]], 0.022, M.odg);                         // vertical grip
    b.cyl(0.0095, 0.0095, 0.03, M.steelDark, 0, 0.026, 0.375, 14);
    suppressor(b, M, 0.39, 0.026, 0.02, 0.16);
    b.cyl(0.015, 0.015, 0.15, M.alu, 0, 0.026, -0.17, 16);
    b.prof([[-0.15, 0.05], [-0.29, 0.05], [-0.305, 0.04], [-0.305, -0.06], [-0.285, -0.065], [-0.2, 0.0], [-0.15, 0.0]], 0.042, M.odg);
    b.box(0.044, 0.11, 0.014, M.rubber, 0, -0.005, -0.312);
    scope(b, M, 0.03, 0.09, 0.26, 0.0152, 0.0215, 0.021);
    return { muzzle: [0, 0.026, 0.555], eject: [0.025, 0.03, 0.05], flash: 'suppressed', optic: 'lpvo' };
  },
  shotgun(b, M) { // pump action, wood furniture
    b.prof([[-0.06, -0.015], [0.15, -0.015], [0.15, 0.05], [0.12, 0.06], [-0.04, 0.06], [-0.06, 0.045]], 0.046, M.blued);
    b.box(0.004, 0.022, 0.05, M.steelDark, 0.023, 0.032, 0.06);                                                       // ejection port
    b.prof([[0.0, -0.015], [0.06, -0.015], [0.06, -0.04], [0.005, -0.04]], 0.006, M.steelDark);
    b.cyl(0.0105, 0.0105, 0.56, M.blued, 0, 0.042, 0.43, 18);
    b.cyl(0.0135, 0.0135, 0.48, M.blued, 0, 0.011, 0.39, 18);                                                         // mag tube
    b.cyl(0.0145, 0.0145, 0.012, M.blued, 0, 0.011, 0.632, 16);                                                         // mag cap
    b.prof([[0.2, -0.008], [0.38, -0.008], [0.38, 0.03], [0.2, 0.03]], 0.05, M.wood);                                   // pump
    for (let z = 0.215; z < 0.37; z += 0.018) b.box(0.052, 0.003, 0.006, M.steelDark, 0, -0.008, z);
    b.prof([[-0.06, 0.045], [-0.06, -0.015], [-0.12, -0.05], [-0.38, -0.085], [-0.4, -0.08], [-0.4, 0.02], [-0.38, 0.03], [-0.15, 0.045]], 0.04, M.wood);
    b.box(0.042, 0.11, 0.016, M.rubber, 0, -0.028, -0.405, -0.12);
    b.cyl(0.0025, 0.0025, 0.004, M.brass, 0, 0.056, 0.705, 8, 'y');
    b.box(0.012, 0.004, 0.08, M.steelDark, 0, 0.062, 0.02);
    return { muzzle: [0, 0.042, 0.71], eject: [0.024, 0.032, 0.06], flash: 'shotgun' };
  },
  sawnoff(b, M) { // cut-down side-by-side, hammers, pistol-grip stub
    b.prof([[-0.05, -0.01], [0.07, -0.01], [0.07, 0.045], [-0.04, 0.045], [-0.05, 0.03]], 0.06, M.blued);
    b.prof([[-0.04, 0.0], [-0.015, -0.01], [-0.06, -0.12], [-0.11, -0.12], [-0.1, -0.09], [-0.06, 0.02]], 0.04, M.woodChecker);
    b.cyl(0.0155, 0.0155, 0.3, M.blued, -0.0155, 0.028, 0.22, 18); b.cyl(0.0155, 0.0155, 0.3, M.blued, 0.0155, 0.028, 0.22, 18);
    b.cyl(0.011, 0.011, 0.002, M.rubber, -0.0155, 0.028, 0.371, 14); b.cyl(0.011, 0.011, 0.002, M.rubber, 0.0155, 0.028, 0.371, 14);
    b.box(0.012, 0.006, 0.29, M.blued, 0, 0.046, 0.22);
    b.prof([[0.06, -0.012], [0.22, -0.012], [0.22, 0.02], [0.06, 0.02]], 0.058, M.woodChecker);
    for (const x of [-0.016, 0.016]) b.prof([[-0.045, 0.04], [-0.035, 0.065], [-0.025, 0.062], [-0.032, 0.04]], 0.008, M.steelDark, x);
    b.prof([[0.0, -0.01], [0.05, -0.01], [0.05, -0.035], [0.005, -0.035]], 0.006, M.steelDark);
    return { muzzle: [0, 0.028, 0.372], eject: null, flash: 'shotgun' };
  },
  sniper(b, M) { // bolt-action precision rifle in a modular chassis
    b.prof([[-0.08, 0.0], [0.17, 0.0], [0.17, 0.05], [-0.08, 0.05]], 0.044, M.steel);                                     // receiver
    b.cyl(0.0075, 0.0075, 0.04, M.steel, 0.034, 0.035, -0.02, 10, 'x');                                                     // bolt handle
    b.add(new THREE.SphereGeometry(0.011, 14, 10), M.steelDark, 0.058, 0.03, -0.02);
    b.prof([[-0.09, -0.01], [0.48, -0.01], [0.48, 0.032], [0.2, 0.032], [0.17, 0.0], [-0.09, 0.0]], 0.056, M.odg);          // chassis
    for (let z = 0.22; z < 0.47; z += 0.04) { b.box(0.002, 0.014, 0.024, M.steelDark, 0.029, 0.012, z); b.box(0.002, 0.014, 0.024, M.steelDark, -0.029, 0.012, z); }
    b.prof([[-0.028, -0.01], [0.02, -0.01], [0.004, -0.12], [-0.045, -0.115], [-0.05, -0.06]], 0.034, M.stipple);
    b.prof([[0.01, -0.01], [0.07, -0.01], [0.07, -0.04], [0.015, -0.04]], 0.006, M.steelDark);
    b.box(0.03, 0.085, 0.07, M.steelDark, 0, -0.05, 0.1);                                                                   // box mag
    b.cyl(0.0125, 0.0105, 0.52, M.steelDark, 0, 0.026, 0.73, 18);                                                          // fluted barrel
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.box(0.0025, 0.0025, 0.3, M.steel, Math.cos(a) * 0.0112, 0.026 + Math.sin(a) * 0.0112, 0.65); }
    b.prof([[0.99, 0.008], [1.06, 0.008], [1.06, 0.044], [0.99, 0.044]], 0.03, M.steelDark);                                // brake
    for (const z of [1.005, 1.025, 1.045]) b.box(0.031, 0.008, 0.007, M.rubber, 0, 0.034, z);
    b.prof([[-0.09, 0.05], [-0.38, 0.05], [-0.395, 0.035], [-0.395, -0.08], [-0.37, -0.085], [-0.2, -0.03], [-0.12, -0.02], [-0.09, 0.0]], 0.046, M.odg);
    b.box(0.03, 0.025, 0.14, M.odg, 0, 0.065, -0.24);                                                                       // cheek riser
    b.box(0.048, 0.14, 0.018, M.rubber, 0, -0.016, -0.405);
    b.box(0.03, 0.03, 0.03, M.steelDark, 0, -0.1, -0.33);                                                                   // monopod
    b.rail(-0.08, 0.17, 0.05, M.alu);
    scope(b, M, 0.03, 0.098, 0.36, 0.017, 0.031, 0.022);
    for (const s of [-1, 1]) { b.box(0.008, 0.16, 0.008, M.alu, s * 0.025, -0.09, 0.44, 0.35, 0, s * 0.18); }
    return { muzzle: [0, 0.026, 1.07], eject: [0.025, 0.035, 0.03], flash: 'rifle', optic: 'scope' };
  },
  grenade(b, M) {
    b.add(new THREE.SphereGeometry(0.036, 18, 14).scale(1, 1.2, 1), M.grenade);
    for (let i = 0; i < 5; i++) b.cyl(0.0372 * (1 - Math.abs(i - 2) * 0.13), 0.0372 * (1 - Math.abs(i - 2) * 0.13), 0.003, M.steelDark, 0, -0.03 + i * 0.015, 0, 18, 'y');
    b.cyl(0.013, 0.015, 0.03, M.steel, 0, 0.052, 0, 14, 'y');
    b.prof([[-0.006, 0.062], [0.008, 0.062], [0.012, -0.02], [0.006, -0.02]], 0.012, M.steel, 0.02);                     // spoon (side view)
    b.add(new THREE.TorusGeometry(0.013, 0.0018, 6, 18), M.stainless, -0.016, 0.064, 0, 0, Math.PI / 2, 0);
    return { muzzle: [0, 0, 0], eject: null };
  },
  bat(b, M) {
    const pts = []; const prof = [[0, 0.019], [0.02, 0.021], [0.03, 0.014], [0.25, 0.015], [0.45, 0.024], [0.7, 0.034], [0.84, 0.034], [0.85, 0.026], [0.855, 0]];
    for (const [z, r] of prof) pts.push(new THREE.Vector2(r, z));
    const g = new THREE.LatheGeometry(pts, 20); g.rotateX(Math.PI / 2); g.translate(0, 0, -0.08);
    b.add(g, M.wood);
    b.cyl(0.0165, 0.0165, 0.17, M.tape, 0, 0, 0.02, 16);
    return { muzzle: [0, 0, 0.7], eject: null };
  },
  knife(b, M) { // folding tactical knife, open
    b.prof([[-0.06, -0.012], [0.055, -0.012], [0.06, -0.006], [0.06, 0.012], [-0.05, 0.012], [-0.065, 0.004]], 0.016, M.stipple);
    b.prof([[-0.055, -0.012], [0.055, -0.012], [0.055, 0.012], [-0.05, 0.012]], 0.019, M.steelDark);
    b.prof([[0.055, -0.006], [0.15, -0.002], [0.2, 0.012], [0.16, 0.014], [0.07, 0.014], [0.055, 0.01]], 0.0035, M.blade, 0, 0.0008);
    b.cyl(0.006, 0.006, 0.02, M.steel, 0, 0.0, 0.05, 12, 'x');
    b.cyl(0.004, 0.004, 0.022, M.steel, 0, 0.004, -0.05, 10, 'x');
    return { muzzle: [0, 0, 0.18], eject: null };
  },
};

const cache = new Map();
export function buildWeaponModel(type) {
  const M = materials();
  const key = BUILD[type] ? type : 'pistol';
  let proto = cache.get(key);
  if (!proto) {
    const b = new Builder();
    let info = {};
    try { info = BUILD[key](b, M) || {}; } catch (e) { console.warn('[gunModels]', key, e); }
    proto = { group: b.build('weapon-' + key), info };
    cache.set(key, proto);
  }
  const g = proto.group.clone(); // shares geometry + materials
  const inf = proto.info;
  g.userData.muzzle = new THREE.Vector3(...(inf.muzzle || [0, 0, 0.2]));
  g.userData.eject = inf.eject ? new THREE.Vector3(...inf.eject) : null;
  g.userData.flash = inf.flash || null;
  g.userData.optic = inf.optic || null;
  return g;
}
export const MODEL_KEYS = Object.keys(BUILD);

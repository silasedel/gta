// Procedural weapon models v3 (meters). Grip/hand at the origin, barrel along +Z, up +Y.
// - Side profiles are extruded with bevels (real silhouettes); static parts are merged per material (few draw calls).
// - Moving parts are separate named nodes (slide, bolt, mag, trigger, hammer, cylinder, pump, breech, boltHandle)
//   driven by model.userData.animate({ slide, bolt, pump, trigger, hammer, cylinder, breech, boltHandle, magOut }).
// - PBR sets are generated in code: albedo with wear and scratches, normal maps derived from height canvases
//   (stippling, checkering, knurling, wood grain, parkerizing), roughness maps.
// - Attachments are built on the gun: sight (irons | reddot | holo | acog | scope), mag (std | ext | drum),
//   muzzle (none | suppressor | comp), grip (none | vertical | angled), laser, light; skins swap the finish.
// userData: muzzle, eject, flash, optic, suppressed, leftGrip, sightLine, tris + non-enumerable parts / animate /
// magClone / laser / light (non-enumerable so Object3D.clone() never tries to serialize them).
// All designs and maker marks are original (Solana Arms, Caballo, Wasp, Kestrel, Biscayne, Coastline, Breaker, Hacksaw, Longshot).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- procedural textures
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function tex(c, srgb = false, repeat = 1) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function noise(g, w, h, base, amp, size = 1) {
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, base + (Math.random() - 0.5) * amp)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  if (size > 1) { g.globalAlpha = 0.5; g.drawImage(g.canvas, 0, 0, w / size, h / size, 0, 0, w, h); g.globalAlpha = 1; }
}
// height canvas (grayscale) -> tangent-space normal map
function normalFrom(hc, strength = 2, repeat = 1) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const c = canvas(w, h, (g) => {
    const out = g.createImageData(w, h); const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
    }
    g.putImageData(out, 0, 0);
  });
  return tex(c, false, repeat);
}
const rnd = (a, b) => a + Math.random() * (b - a);
// worn metal albedo: fine grain, long scratches, silvered patches where the finish has rubbed off
function wornMetal(base, wear, rust = 0) {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},0.035)`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    for (let i = 0; i < 9 * wear; i++) { const x = Math.random() * w, y = Math.random() * h, r = rnd(20, 70); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(190,194,200,${0.1 * wear})`); gr.addColorStop(1, 'rgba(215,218,222,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.lineCap = 'round';
    for (let i = 0; i < 90 * wear; i++) { g.strokeStyle = `rgba(215,218,222,${rnd(0.05, 0.3)})`; g.lineWidth = rnd(0.4, 1.0); const x = Math.random() * w, y = Math.random() * h, a = rnd(-0.5, 0.5) + (Math.random() < 0.2 ? 1.2 : 0), l = rnd(8, 90); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 60 * rust; i++) { const x = Math.random() * w, y = Math.random() * h, r = rnd(6, 40); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rnd(120, 170)},${rnd(50, 80)},${rnd(15, 30)},0.85)`); gr.addColorStop(0.6, 'rgba(110,52,20,0.35)'); gr.addColorStop(1, 'rgba(90,40,15,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  });
}
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const stippleH = canvas(256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5200; i++) { const v = Math.random() < 0.5 ? 40 : 215; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 0.7 + Math.random() * 1.3, 0, 6.3); g.fill(); } });
  const checkerH = canvas(128, 128, (g, w, h) => { g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#202020'; g.lineWidth = 2.2; for (let i = -w; i < w * 2; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } });
  const knurlH = canvas(64, 64, (g, w, h) => { g.fillStyle = '#909090'; g.fillRect(0, 0, w, h); g.strokeStyle = '#202020'; g.lineWidth = 1.6; for (let i = -w; i < w * 2; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } });
  const parkH = canvas(256, 256, (g, w, h) => noise(g, w, h, 128, 90, 2));
  const woodC = canvas(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#6b3e1f'); gr.addColorStop(0.5, '#8a5630'); gr.addColorStop(1, '#5e3418'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 150; i++) { g.strokeStyle = `rgba(${40 + Math.random() * 30},${20 + Math.random() * 15},8,${0.15 + Math.random() * 0.35})`; g.lineWidth = 0.5 + Math.random() * 2.4; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 6 + (Math.random() - 0.5) * 2); g.stroke(); }
    for (let i = 0; i < 5; i++) { const x = Math.random() * w, y = Math.random() * h; for (let r = 14; r > 2; r -= 3) { g.strokeStyle = `rgba(45,22,8,${0.35})`; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, r * 2.2, r, 0, 0, 6.3); g.stroke(); } }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(30,15,6,${rnd(0.2, 0.5)})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rnd(1, 4), rnd(1, 2), rnd(0, 3), 0, 6.3); g.fill(); } // dents
  });
  const woodH = canvas(256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? 30 : 220},${30},${30},0.35)`; g.lineWidth = 1; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.04 + i) * 3); g.stroke(); } });
  const pattern = (draw) => tex(canvas(512, 512, draw), true, 1);
  TEX = {
    parkRough: tex(canvas(256, 256, (g, w, h) => { noise(g, w, h, 150, 70, 2); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(70,70,70,${Math.random() * 0.5})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 40, 1); } }), false, 3),
    parkN: normalFrom(parkH, 0.7, 6), stippleN: normalFrom(stippleH, 3.2, 8), checkerN: normalFrom(checkerH, 3.5, 10), knurlN: normalFrom(knurlH, 3.5, 12), woodN: normalFrom(woodH, 1.6, 2),
    polyRough: tex(canvas(128, 128, (g, w, h) => noise(g, w, h, 205, 50)), false, 6),
    polyAlb: tex(canvas(256, 256, (g, w, h) => { noise(g, w, h, 222, 46, 2); g.lineCap = 'round'; for (let i = 0; i < 50; i++) { g.strokeStyle = `rgba(255,255,255,${rnd(0.1, 0.35)})`; g.lineWidth = rnd(0.5, 1.6); const x = Math.random() * w, y = Math.random() * h, a = rnd(0, 6.3), l = rnd(6, 50); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } for (let i = 0; i < 8; i++) { const x = Math.random() * w, y = Math.random() * h, r = rnd(30, 80); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(120,115,105,0.1)'); gr.addColorStop(1, 'rgba(120,115,105,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }), true, 2),
    wood: tex(woodC, true, 2), woodRough: tex(canvas(128, 128, (g, w, h) => noise(g, w, h, 140, 70)), false, 3),
    steelWorn: tex(wornMetal('#3a3e44', 1), true, 1), darkWorn: tex(wornMetal('#1f2226', 0.8), true, 1), bluedWorn: tex(wornMetal('#232b3a', 1.2), true, 1), stainWorn: tex(wornMetal('#b4b7bb', 0.5), true, 1),
    rust: tex(wornMetal('#4a4640', 1.4, 1), true, 1),
    // ---- original skin patterns
    camo: pattern((g, w, h) => { g.fillStyle = '#4c5637'; g.fillRect(0, 0, w, h); const cols = ['#2c3320', '#6d6a45', '#8a7a52', '#3b4a2c', '#23281b']; for (let i = 0; i < 90; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 7; k++) g.quadraticCurveTo(x + rnd(-70, 70), y + rnd(-50, 50), x + rnd(-60, 60), y + rnd(-40, 40)); g.fill(); } for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(30,36,22,0.7)'; g.lineWidth = rnd(2, 5); g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.bezierCurveTo(x + rnd(-30, 30), y - 40, x + rnd(-30, 30), y - 70, x + rnd(-40, 40), y - 110); g.stroke(); } }),
    tide: pattern((g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#12c7c0'); gr.addColorStop(0.5, '#6a4bd8'); gr.addColorStop(1, '#ff3f9a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(255,255,255,${0.12 + (k % 3) * 0.08})`; g.lineWidth = 2 + (k % 4); g.beginPath(); for (let x = 0; x <= w; x += 8) { const y = k * 40 + Math.sin(x * 0.03 + k) * 16 + Math.sin(x * 0.011 + k * 2) * 22; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } }),
    deco: pattern((g, w, h) => { g.fillStyle = '#f3d9c4'; g.fillRect(0, 0, w, h); const cols = ['#ff9e7a', '#3fc1b5', '#ffd27a', '#f48fb1', '#2e8f9a']; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { const cx = tx * 128 + 64, cy = ty * 128 + 128; for (let k = 7; k >= 1; k--) { g.fillStyle = cols[(k + tx + ty) % cols.length]; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, k * 17, Math.PI, 2 * Math.PI); g.fill(); } g.strokeStyle = '#3a2b2a'; g.lineWidth = 2; for (let a = 0; a <= 8; a++) { const an = Math.PI + a * Math.PI / 8; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(an) * 120, cy + Math.sin(an) * 120); g.stroke(); } } }),
    carbon: pattern((g, w, h) => { g.fillStyle = '#141518'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { const f = ((x + y) / 16) % 2 === 0; const gr = g.createLinearGradient(x, y, x + (f ? 16 : 0), y + (f ? 0 : 16)); gr.addColorStop(0, '#0d0e10'); gr.addColorStop(0.5, '#3b3e44'); gr.addColorStop(1, '#0d0e10'); g.fillStyle = gr; g.fillRect(x, y, 16, 16); } }),
    scroll: normalFrom(canvas(256, 256, (g, w, h) => { g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#303030'; g.lineWidth = 2.5; for (let i = 0; i < 26; i++) { const x = (i % 5) * 52 + 26, y = Math.floor(i / 5) * 52 + 26; g.beginPath(); for (let a = 0; a < 9; a += 0.2) { const r = 3 + a * 2.4; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; a ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); } }), 2.6, 3),
  };
  return TEX;
}
const MATS = new Map();
export const SKINS = [
  { key: 'factory', name: 'Factory Black', price: 0 }, { key: 'fde', name: 'Dune Tan', price: 350 }, { key: 'odg', name: 'Mangrove Green', price: 350 },
  { key: 'nickel', name: 'Bright Nickel', price: 900 }, { key: 'gold', name: 'Calle Oro Engraved', price: 6500 }, { key: 'camo', name: 'Glades Camo', price: 1200 },
  { key: 'tide', name: 'Neon Tide', price: 1800 }, { key: 'deco', name: 'Deco Sunrise', price: 1800 }, { key: 'carbon', name: 'Carbon Weave', price: 1500 }, { key: 'rust', name: 'Salt Rust', price: 150 },
];
function materials(skin = 'factory', wear = 0.6) {
  const key = skin + '|' + Math.round(wear * 4);
  if (MATS.has(key)) return MATS.get(key);
  const T = textures(), S = THREE.MeshStandardMaterial, Ph = THREE.MeshPhysicalMaterial;
  const nS = new THREE.Vector2(0.35, 0.35), nB = new THREE.Vector2(1, 1);
  const wornMap = (t) => (wear > 0.15 ? t : null);
  const M = {
    steel: new Ph({ color: wear > 0.15 ? 0xbfc3c9 : 0x2b2e33, map: wornMap(T.steelWorn), metalness: 0.9, roughness: 0.42 + wear * 0.1, roughnessMap: T.parkRough, normalMap: T.parkN, normalScale: nS, clearcoat: 0.15, clearcoatRoughness: 0.6 }),
    steelDark: new Ph({ color: wear > 0.15 ? 0xc8c8c8 : 0x17191c, map: wornMap(T.darkWorn), metalness: 0.85, roughness: 0.52, roughnessMap: T.parkRough, normalMap: T.parkN, normalScale: nS }),
    blued: new Ph({ color: wear > 0.15 ? 0xd0d4dc : 0x1f2633, map: wornMap(T.bluedWorn), metalness: 0.95, roughness: 0.27, roughnessMap: T.parkRough, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    stainless: new Ph({ color: 0xffffff, map: T.stainWorn, metalness: 1, roughness: 0.3, roughnessMap: T.parkRough, normalMap: T.parkN, normalScale: nS }),
    alu: new S({ color: wear > 0.15 ? 0xa9adb3 : 0x24272a, map: wornMap(T.darkWorn), metalness: 0.7, roughness: 0.55, roughnessMap: T.parkRough, normalMap: T.parkN, normalScale: nS }),
    polymer: new S({ color: 0x2a2b29, map: T.polyAlb, metalness: 0.0, roughness: 0.82, roughnessMap: T.polyRough, normalMap: T.parkN, normalScale: nS }),
    stipple: new S({ color: 0x262725, map: T.polyAlb, metalness: 0.0, roughness: 0.9, normalMap: T.stippleN, normalScale: nB }),
    fde: new S({ color: 0xa48a64, map: T.polyAlb, metalness: 0.0, roughness: 0.8, roughnessMap: T.polyRough, normalMap: T.parkN, normalScale: nS }),
    fdeStipple: new S({ color: 0x9c835c, map: T.polyAlb, metalness: 0.0, roughness: 0.9, normalMap: T.stippleN, normalScale: nB }),
    odg: new S({ color: 0x5a6143, map: T.polyAlb, metalness: 0.05, roughness: 0.75, roughnessMap: T.polyRough, normalMap: T.parkN, normalScale: nS }),
    wood: new S({ map: T.wood, roughness: 0.5, roughnessMap: T.woodRough, normalMap: T.woodN, normalScale: nS, metalness: 0 }),
    woodChecker: new S({ map: T.wood, roughness: 0.62, normalMap: T.checkerN, normalScale: nB }),
    rubber: new S({ color: 0x161616, map: T.polyAlb, roughness: 0.96, normalMap: T.checkerN, normalScale: nS }),
    bore: new THREE.MeshBasicMaterial({ color: 0x020202 }),
    knurl: new S({ color: 0x1b1d20, metalness: 0.8, roughness: 0.5, normalMap: T.knurlN, normalScale: nB }),
    brass: new S({ color: 0xc9a14f, metalness: 1, roughness: 0.3, roughnessMap: T.parkRough }),
    copper: new S({ color: 0xb87333, metalness: 1, roughness: 0.35 }),
    lens: new Ph({ color: 0x5577aa, metalness: 0.1, roughness: 0.02, transparent: true, opacity: 0.85, iridescence: 0.8, iridescenceIOR: 1.6, clearcoat: 1, envMapIntensity: 2 }),
    lensAmber: new Ph({ color: 0xc8742a, metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.8, iridescence: 1, clearcoat: 1, envMapIntensity: 2 }),
    glassClear: new Ph({ color: 0xbfe0ff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.22, iridescence: 0.6, clearcoat: 1 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a1a }), tritium: new THREE.MeshBasicMaterial({ color: 0x9dff7a }), laserLens: new THREE.MeshBasicMaterial({ color: 0xff3040 }),
    lightLens: new Ph({ color: 0xfff6d8, emissive: 0x554a30, roughness: 0.05, metalness: 0.2, clearcoat: 1 }),
    white: new S({ color: 0xf0f0ee, roughness: 0.6 }), red: new S({ color: 0xb2241c, roughness: 0.5 }),
    blade: new Ph({ color: 0xffffff, map: T.stainWorn, metalness: 1, roughness: 0.16, clearcoat: 0.6 }),
    grenade: new S({ color: 0x46502f, roughness: 0.7, metalness: 0.15, normalMap: T.stippleN, normalScale: nS }),
    tape: new S({ color: 0x151515, roughness: 0.92, normalMap: T.checkerN, normalScale: nS }),
    crowbar: new Ph({ color: 0xffffff, map: tex(wornMetal('#7a1d16', 1.6, 0.25), true, 1), metalness: 0.6, roughness: 0.5, roughnessMap: T.parkRough }),
    bottle: new Ph({ color: 0x4a7a3a, roughness: 0.06, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.62, clearcoat: 1, envMapIntensity: 1.6 }),
    bottleAmber: new Ph({ color: 0x8a4a14, roughness: 0.06, transparent: true, opacity: 0.66, clearcoat: 1, envMapIntensity: 1.6 }),
    liquid: new S({ color: 0xc9a14f, roughness: 0.2, transparent: true, opacity: 0.8 }),
    rag: new S({ color: 0xd8d2c2, roughness: 1, normalMap: T.stippleN, normalScale: nS }),
    label: null, furn: null, furnGrip: null,
  };
  // ---- skins: swap the finish of receivers, furniture and grips
  const cerakote = (t, rep = 6) => { const tt = t.clone(); tt.repeat.set(rep, rep); tt.needsUpdate = true; return new S({ map: tt, metalness: 0.25, roughness: 0.55, roughnessMap: T.polyRough, normalMap: T.parkN, normalScale: nS }); };
  if (skin === 'fde') { M.polymer = M.fde; M.stipple = M.fdeStipple; M.furn = M.fde; M.furnGrip = M.fdeStipple; M.alu = new S({ color: 0x7d6a4c, metalness: 0.4, roughness: 0.6, roughnessMap: T.parkRough, normalMap: T.parkN, normalScale: nS }); }
  else if (skin === 'odg') { M.polymer = M.odg; M.stipple = new S({ color: 0x454b33, roughness: 0.9, normalMap: T.stippleN, normalScale: nB }); M.furn = M.odg; M.furnGrip = M.stipple; }
  else if (skin === 'nickel') { M.steel = M.stainless; M.blued = M.stainless; M.alu = M.stainless; M.steelDark = new Ph({ color: 0x8d9197, metalness: 1, roughness: 0.3, roughnessMap: T.parkRough }); }
  else if (skin === 'gold') { const gold = new Ph({ color: 0xe6b54a, metalness: 1, roughness: 0.22, normalMap: T.scroll, normalScale: new THREE.Vector2(0.8, 0.8), clearcoat: 0.5 }); M.steel = gold; M.blued = gold; M.alu = gold; M.stainless = gold; M.steelDark = new Ph({ color: 0xb8892e, metalness: 1, roughness: 0.3 }); const ivory = new Ph({ color: 0xf0e7d2, roughness: 0.35, clearcoat: 0.6, normalMap: T.checkerN, normalScale: nS }); M.stipple = ivory; M.woodChecker = ivory; M.furnGrip = ivory; }
  else if (skin === 'camo') { const c = cerakote(T.camo, 5); M.polymer = c; M.furn = c; M.alu = c; M.steel = c; M.fde = c; M.odg = c; }
  else if (skin === 'tide') { const c = cerakote(T.tide, 4); M.steel = c; M.alu = c; M.blued = c; M.furn = M.polymer; }
  else if (skin === 'deco') { const c = cerakote(T.deco, 7); M.steel = c; M.alu = c; M.blued = c; M.furn = new S({ color: 0xf3e6d6, roughness: 0.7, normalMap: T.parkN, normalScale: nS }); M.furnGrip = new S({ color: 0x2e8f9a, roughness: 0.9, normalMap: T.stippleN, normalScale: nB }); M.stipple = M.furnGrip; M.polymer = M.furn; }
  else if (skin === 'carbon') { const c = new Ph({ map: (() => { const t = T.carbon.clone(); t.repeat.set(10, 10); t.needsUpdate = true; return t; })(), metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 }); M.polymer = c; M.furn = c; M.fde = c; M.odg = c; }
  else if (skin === 'rust') { const r = new S({ map: T.rust, color: 0xffffff, metalness: 0.55, roughness: 0.85, roughnessMap: T.parkRough, normalMap: T.parkN, normalScale: nB }); M.steel = r; M.blued = r; M.steelDark = r; M.alu = r; M.stainless = r; }
  MATS.set(key, M);
  return M;
}
// engraved / stamped markings as an alpha decal (maker mark, model, caliber, serial)
const markCache = new Map();
function markMat(text, color = 'rgba(150,154,160,0.5)') {
  const k = text + color; if (markCache.has(k)) return markCache.get(k);
  const c = canvas(512, 64, (g) => { g.clearRect(0, 0, 512, 64); g.fillStyle = color; g.font = '600 26px "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText(text, 6, 34); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.4, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  markCache.set(k, m); return m;
}

// ---------------------------------------------------------------- builder (bakes transforms, merges per material, named moving parts)
class Builder {
  constructor(lo = false) { this.lo = lo; this.root = { parts: new Map(), kids: [], marks: [], nodes: [] }; this.cur = this.root; this.piv = [0, 0, 0]; }
  // start a moving part: geometry added until end() belongs to it. anim: { kind: 'slide', axis, travel } | { kind: 'rot', axis, angle } | { kind: 'bolt', ... }
  begin(name, pivot = [0, 0, 0], anim = { kind: 'slide', axis: [0, 0, -1], travel: 0.04 }) { const n = { name, pivot, anim, parts: new Map(), marks: [] }; this.root.kids.push(n); this.cur = n; this.piv = pivot; return this; }
  end() { this.cur = this.root; this.piv = [0, 0, 0]; return this; }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x - this.piv[0], y - this.piv[1], z - this.piv[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!this.cur.parts.has(mat)) this.cur.parts.set(mat, []);
    this.cur.parts.get(mat).push(g);
    return this;
  }
  box(w, h, d, mat, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
  cyl(r1, r2, len, mat, x = 0, y = 0, z = 0, seg = 16, axis = 'z', open = false) {
    const g = new THREE.CylinderGeometry(r1, r2, len, this.lo ? Math.max(6, seg >> 1) : seg, 1, open);
    return this.add(g, mat, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
  }
  // barrel with a real (dark) bore at the muzzle end
  barrel(r, len, mat, y, z0, M, bore = 0.55, seg = 18) { this.cyl(r, r, len, mat, 0, y, z0 + len / 2, seg); this.cyl(r * bore, r * bore, 0.004, M.bore, 0, y, z0 + len + 0.0005, 12); return this; }
  // side profile [[z, y], ...] (forward, up) extruded across X with bevel
  prof(pts, thick, mat, x = 0, bevel = null, holes = null) {
    if (bevel === null) bevel = Math.min(0.005, thick * 0.14);
    const sh = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u - this.piv[2], v - this.piv[1])));
    if (holes) for (const h of holes) sh.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u - this.piv[2], v - this.piv[1]))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, thick - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: this.lo ? 1 : 2, curveSegments: 6 });
    g.rotateY(-Math.PI / 2); g.translate(thick / 2 - bevel + x - this.piv[0], 0, 0);
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getZ(i) * 8 + p.getX(i) * 8; uv[i * 2 + 1] = p.getY(i) * 8; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const save = this.piv; this.piv = [0, 0, 0]; this.add(g, mat); this.piv = save; return this;
  }
  // receiver / slide: the ejection port is cut only into the right-hand (-X) half
  recv(pts, thick, mat, port, bevel = 0.003) { this.prof(pts, thick / 2 + 0.0005, mat, thick / 4, bevel); return this.prof(pts, thick / 2 + 0.0005, mat, -thick / 4, bevel, port ? [port] : null); }
  rail(z0, z1, y, mat, width = 0.021) {
    const len = z1 - z0; this.box(width * 0.75, 0.006, len, mat, 0, y, (z0 + z1) / 2);
    if (this.lo) { this.box(width, 0.0045, len, mat, 0, y + 0.005, (z0 + z1) / 2); return this; }
    for (let z = z0 + 0.003; z < z1 - 0.004; z += 0.01) this.box(width, 0.0045, 0.0052, mat, 0, y + 0.005, z + 0.0026);
    return this;
  }
  serrations(z0, z1, y0, y1, x, n, mat, depth = 0.0015) { if (this.lo) return this; for (let i = 0; i < n; i++) { const z = z0 + (z1 - z0) * (i / (n - 1)); this.box(depth, y1 - y0, 0.0018, mat, x, (y0 + y1) / 2, z, 0.25); } return this; }
  pin(x, y, z, r, mat) { if (this.lo) return this; return this.cyl(r, r, 0.0012, mat, x, y, z, 10, 'x'); }
  // roll mark on a side face (+x = the gun's left side). w along Z.
  mark(text, x, y, z, w = 0.09, h = 0.011, color) { if (this.lo) return this; this.cur.marks.push({ text, x: x - this.piv[0], y: y - this.piv[1], z: z - this.piv[2], w, h, color }); return this; }
  node(name, x, y, z) { this.root.nodes.push({ name, x, y, z }); return this; }
  _mesh(parts, marks, g) {
    for (const [mat, geos] of parts) { const merged = mergeGeometries(geos, false); if (!merged) continue; merged.computeBoundingSphere(); const m = new THREE.Mesh(merged, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    for (const mk of marks) { const m = new THREE.Mesh(new THREE.PlaneGeometry(mk.w, mk.h), markMat(mk.text, mk.color)); m.position.set(mk.x, mk.y, mk.z); m.rotation.y = mk.x >= 0 ? Math.PI / 2 : -Math.PI / 2; g.add(m); }
  }
  build(meshName = 'weapon') {
    const g = new THREE.Group(); g.name = meshName;
    this._mesh(this.root.parts, this.root.marks, g);
    for (const k of this.root.kids) { const p = new THREE.Group(); p.name = k.name; p.position.set(...k.pivot); p.userData.anim = Object.assign({ rest: k.pivot.slice() }, k.anim); this._mesh(k.parts, k.marks, p); g.add(p); }
    for (const n of this.root.nodes) { const o = new THREE.Object3D(); o.name = n.name; o.position.set(n.x, n.y, n.z); g.add(o); }
    return g;
  }
}

// ---------------------------------------------------------------- attachments
function redDot(b, M, z, y) { // compact tube red dot
  b.box(0.026, 0.008, 0.05, M.alu, 0, y + 0.004, z); b.cyl(0.016, 0.016, 0.052, M.alu, 0, y + 0.026, z, 18, 'z', true);
  b.cyl(0.0175, 0.0175, 0.008, M.alu, 0, y + 0.026, z + 0.026, 18); b.cyl(0.0175, 0.0175, 0.008, M.alu, 0, y + 0.026, z - 0.026, 18);
  b.cyl(0.0135, 0.0135, 0.002, M.lensAmber, 0, y + 0.026, z + 0.029, 18); b.cyl(0.0135, 0.0135, 0.002, M.lens, 0, y + 0.026, z - 0.029, 18);
  b.cyl(0.006, 0.006, 0.012, M.knurl, 0.019, y + 0.026, z, 10, 'x'); b.cyl(0.005, 0.005, 0.008, M.knurl, 0, y + 0.045, z, 10, 'y');
  b.cyl(0.0012, 0.0012, 0.001, M.dot, 0, y + 0.026, z - 0.0302, 8);
}
function miniDot(b, M, z, y) { // slide-mounted open reflex
  b.box(0.024, 0.006, 0.042, M.alu, 0, y + 0.003, z); b.box(0.003, 0.022, 0.006, M.alu, 0.0105, y + 0.016, z + 0.016); b.box(0.003, 0.022, 0.006, M.alu, -0.0105, y + 0.016, z + 0.016);
  b.box(0.024, 0.003, 0.006, M.alu, 0, y + 0.0275, z + 0.016); b.box(0.019, 0.02, 0.0012, M.lensAmber, 0, y + 0.016, z + 0.016); b.box(0.01, 0.008, 0.016, M.alu, 0, y + 0.008, z - 0.012);
  b.cyl(0.0009, 0.0009, 0.0006, M.dot, 0, y + 0.016, z + 0.0152, 6);
}
function holo(b, M, z, y) { // open-window holographic sight with hood
  b.box(0.03, 0.006, 0.08, M.alu, 0, y + 0.003, z); b.box(0.004, 0.036, 0.075, M.alu, 0.016, y + 0.024, z); b.box(0.004, 0.036, 0.075, M.alu, -0.016, y + 0.024, z);
  b.box(0.036, 0.004, 0.075, M.alu, 0, y + 0.043, z); b.box(0.026, 0.03, 0.002, M.glassClear, 0, y + 0.024, z + 0.03); b.box(0.026, 0.03, 0.002, M.lens, 0, y + 0.024, z - 0.02);
  b.cyl(0.0025, 0.0025, 0.0005, M.dot, 0, y + 0.024, z - 0.0212, 10); b.box(0.012, 0.012, 0.03, M.alu, 0.022, y + 0.012, z - 0.02); b.cyl(0.005, 0.005, 0.01, M.knurl, -0.021, y + 0.01, z - 0.02, 10, 'x');
}
function acog(b, M, z, y) { // 4x prism sight with fiber strip
  b.box(0.026, 0.01, 0.07, M.steelDark, 0, y + 0.005, z);
  b.prof([[z - 0.06, y + 0.012], [z + 0.03, y + 0.012], [z + 0.075, y + 0.008], [z + 0.075, y + 0.052], [z + 0.03, y + 0.05], [z - 0.02, y + 0.046], [z - 0.06, y + 0.042]], 0.034, M.steelDark, 0, 0.004);
  b.cyl(0.0175, 0.0175, 0.003, M.lens, 0, y + 0.03, z + 0.0765, 18); b.cyl(0.012, 0.012, 0.003, M.lens, 0, y + 0.027, z - 0.0612, 16);
  b.box(0.006, 0.004, 0.06, M.red, 0, y + 0.0525, z + 0.01); b.cyl(0.005, 0.005, 0.012, M.knurl, 0.02, y + 0.03, z, 10, 'x'); b.cyl(0.005, 0.005, 0.01, M.knurl, 0, y + 0.056, z - 0.03, 10, 'y');
}
function scope(b, M, z, y, len = 0.32, r = 0.0155, obj = 0.026, eye = 0.021) { // variable-power riflescope in rings
  b.cyl(r, r, len * 0.55, M.steelDark, 0, y, z, 20); b.cyl(obj, r, len * 0.18, M.steelDark, 0, y, z + len * 0.35, 20); b.cyl(obj, obj, len * 0.12, M.steelDark, 0, y, z + len * 0.5, 20);
  b.cyl(r, eye, len * 0.12, M.steelDark, 0, y, z - len * 0.33, 20); b.cyl(eye, eye, len * 0.1, M.knurl, 0, y, z - len * 0.44, 20);
  b.cyl(obj * 0.86, obj * 0.86, 0.002, M.lens, 0, y, z + len * 0.565, 22); b.cyl(eye * 0.82, eye * 0.82, 0.002, M.lensAmber, 0, y, z - len * 0.495, 20);
  b.cyl(0.0085, 0.0085, 0.022, M.knurl, 0, y + r + 0.009, z, 14, 'y'); b.cyl(0.0085, 0.0085, 0.022, M.knurl, r + 0.009, y, z, 14, 'x'); b.cyl(0.006, 0.006, 0.016, M.knurl, -r - 0.006, y, z + 0.02, 12, 'x');
  for (const dz of [-len * 0.18, len * 0.14]) { b.box(0.026, 0.02, 0.016, M.steelDark, 0, y - r - 0.006, z + dz); b.cyl(r + 0.004, r + 0.004, 0.016, M.steelDark, 0, y, z + dz, 20); b.pin(0.014, y - r - 0.006, z + dz, 0.003, M.steel); }
}
function irons(b, M, zr, zf, y, tritium = true) {
  b.box(0.022, 0.009, 0.01, M.steelDark, 0, y + 0.0045, zr); b.box(0.007, 0.007, 0.011, M.bore, 0, y + 0.0075, zr);
  b.box(0.0045, 0.009, 0.008, M.steelDark, 0, y + 0.0045, zf);
  if (tritium && !b.lo) { b.cyl(0.0012, 0.0012, 0.001, M.tritium, 0.0075, y + 0.006, zr - 0.0052, 6); b.cyl(0.0012, 0.0012, 0.001, M.tritium, -0.0075, y + 0.006, zr - 0.0052, 6); b.cyl(0.0013, 0.0013, 0.001, M.tritium, 0, y + 0.006, zf - 0.0042, 6); }
}
function flipIrons(b, M, zr, zf, y) { // folding rail sights (rifles)
  for (const [z, w] of [[zr, 0.014], [zf, 0.006]]) { b.box(0.022, 0.008, 0.016, M.steelDark, 0, y + 0.004, z); b.box(0.004, 0.026, 0.006, M.steelDark, 0.008, y + 0.02, z); b.box(0.004, 0.026, 0.006, M.steelDark, -0.008, y + 0.02, z); b.box(w, z === zr ? 0.012 : 0.02, 0.004, M.steelDark, 0, y + (z === zr ? 0.027 : 0.02), z); }
}
function optic(b, M, kind, z, y, o = {}) {
  if (kind === 'reddot') o.mini ? miniDot(b, M, z, y) : redDot(b, M, z, y);
  else if (kind === 'holo') holo(b, M, z, y);
  else if (kind === 'acog') acog(b, M, z, y);
  else if (kind === 'scope') scope(b, M, z + (o.sz || 0), y + (o.sy ?? 0.034), o.len || 0.3, o.r || 0.0155, o.obj || 0.024, 0.021);
  return { reddot: 0.026, holo: 0.024, acog: 0.03, scope: o.sy ?? 0.034, irons: 0.012 }[kind] ?? 0.012;
}
// muzzle device at the barrel end (z, y); returns the extra length
function muzzleDev(b, M, kind, y, z, r = 0.017, len = 0.17) {
  if (kind === 'suppressor') {
    b.cyl(r * 0.55, r * 0.55, 0.012, M.steelDark, 0, y, z + 0.006, 14); b.cyl(r, r, len, M.steelDark, 0, y, z + 0.012 + len / 2, 22);
    b.cyl(r * 1.02, r * 1.02, len * 0.14, M.knurl, 0, y, z + 0.012 + len * 0.1, 22); b.cyl(r * 1.02, r * 1.02, 0.006, M.knurl, 0, y, z + 0.012 + len - 0.003, 22);
    b.cyl(r * 0.42, r * 0.42, 0.003, M.bore, 0, y, z + 0.0125 + len, 14); b.mark('SALTWORKS  QD-9  PORT SOLANA FL', r * 0.72, y + r * 0.72, z + len * 0.55, len * 0.6, 0.007);
    return 0.012 + len;
  }
  if (kind === 'comp') {
    b.prof([[z, y - r * 0.8], [z + 0.045, y - r * 0.8], [z + 0.045, y + r * 0.8], [z, y + r * 0.8]], r * 1.7, M.steelDark, 0, 0.002);
    for (const dz of [0.012, 0.024, 0.036]) { b.box(r * 1.75, r * 0.5, 0.006, M.bore, 0, y + r * 0.45, z + dz); }
    b.cyl(r * 0.45, r * 0.45, 0.003, M.bore, 0, y, z + 0.0455, 12);
    return 0.045;
  }
  return 0;
}
// under-barrel accessories on a bottom rail at (z, y): grip, laser (left side), light (right side or under)
function under(b, M, A, z, y, o = {}) {
  let left = null;
  if (A.grip === 'vertical') { b.box(0.022, 0.008, 0.03, M.alu, 0, y - 0.004, z); b.cyl(0.0125, 0.0145, 0.085, M.furnGrip || M.stipple, 0, y - 0.05, z, 14, 'y'); b.cyl(0.015, 0.015, 0.006, M.polymer, 0, y - 0.094, z, 14, 'y'); left = [0, y - 0.05, z]; }
  else if (A.grip === 'angled') { b.prof([[z - 0.05, y], [z + 0.05, y], [z + 0.045, y - 0.012], [z - 0.02, y - 0.038], [z - 0.05, y - 0.03]], 0.026, M.furnGrip || M.stipple, 0, 0.004); left = [0, y - 0.02, z - 0.01]; }
  if (A.laser) { const lx = o.laserX ?? 0.022, ly = o.laserY ?? y + 0.012, lz = o.laserZ ?? z + 0.07; b.box(0.016, 0.02, 0.045, M.alu, lx, ly, lz); b.cyl(0.0045, 0.0045, 0.002, M.laserLens, lx, ly, lz + 0.0235, 10); b.cyl(0.004, 0.004, 0.006, M.knurl, lx + 0.009, ly, lz - 0.01, 8, 'x'); b.node('fx_laser', lx, ly, lz + 0.025); }
  if (A.light) { const lx = o.lightX ?? -0.022, ly = o.lightY ?? y + 0.012, lz = o.lightZ ?? z + 0.07; b.cyl(0.011, 0.011, 0.05, M.alu, lx, ly, lz, 16); b.cyl(0.0135, 0.0135, 0.016, M.knurl, lx, ly, lz + 0.03, 16); b.cyl(0.0115, 0.0115, 0.002, M.lightLens, lx, ly, lz + 0.039, 16); b.cyl(0.008, 0.008, 0.004, M.rubber, lx, ly, lz - 0.027, 10); b.node('fx_light', lx, ly, lz + 0.04); }
  return left;
}
function curvedMag(b, M, mat, z, y, h, w, depth, curve, ribs = true) {
  const pts = [], n = 8;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([z + curve * t * t + depth * 0.5, y - h * t]); }
  for (let i = n; i >= 0; i--) { const t = i / n; pts.push([z + curve * t * t - depth * 0.5, y - h * t]); }
  b.prof(pts, w, mat, 0, 0.002);
  if (ribs && !b.lo) for (let i = 1; i < 5; i++) { const t = i / 5; b.box(w + 0.002, 0.003, depth * 0.85, mat, 0, y - h * t, z + curve * t * t); }
  b.box(w + 0.004, 0.008, depth + 0.006, M.polymer, 0, y - h - 0.002, z + curve);
  b.cyl(0.0045, 0.0045, depth * 0.7, M.brass, 0, y + 0.004, z, 8); b.cyl(0.003, 0.0045, 0.012, M.copper, 0, y + 0.004, z + depth * 0.4, 8); // top round
}
function drumMag(b, M, z, y, r, w) {
  b.box(w, 0.05, 0.05, M.steelDark, 0, y - 0.022, z); b.cyl(r, r, w + 0.012, M.steelDark, 0, y - 0.045 - r, z, 26, 'x');
  b.cyl(r * 0.5, r * 0.5, w + 0.016, M.steel, 0, y - 0.045 - r, z, 18, 'x'); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; b.box(w + 0.014, 0.004, r * 0.42, M.steel, 0, y - 0.045 - r + Math.sin(a) * r * 0.72, z + Math.cos(a) * r * 0.72, a); }
  b.cyl(0.006, 0.006, 0.012, M.knurl, w / 2 + 0.01, y - 0.045 - r, z, 10, 'x');
}

// ---------------------------------------------------------------- weapons
const MAG_AX = [0, -0.978, -0.208]; // pistol-grip magazine travel (18 deg rake)
const BUILD = {
  pistol(b, M, A) { // striker-fired polymer service pistol
    b.prof([[-0.05, 0.0], [0.125, 0.0], [0.129, -0.006], [0.126, -0.022], [0.07, -0.022], [0.066, -0.03], [0.06, -0.047], [0.046, -0.054], [0.012, -0.054], [0.004, -0.045], [0.0, -0.027], [-0.012, -0.024], [-0.05, -0.016]],
      0.028, M.polymer, 0, 0.003, [[[0.009, -0.028], [0.016, -0.048], [0.04, -0.048], [0.052, -0.045], [0.056, -0.028]]]);
    b.prof([[-0.002, -0.024], [-0.012, -0.06], [-0.016, -0.075], [-0.024, -0.1], [-0.03, -0.128], [-0.074, -0.12], [-0.066, -0.075], [-0.06, -0.03], [-0.07, -0.01], [-0.06, -0.006], [-0.048, -0.014]], 0.03, M.stipple, 0, 0.005);
    b.box(0.007, 0.009, 0.006, M.steelDark, 0.0145, -0.018, 0.0); b.box(0.006, 0.006, 0.014, M.steelDark, 0.0145, -0.006, 0.05); b.box(0.006, 0.006, 0.01, M.steelDark, 0.015, 0.005, -0.03);
    b.pin(0.0146, -0.012, 0.035, 0.0022, M.steelDark).pin(0.0146, -0.018, -0.02, 0.0018, M.steelDark).pin(-0.0146, -0.012, 0.035, 0.0022, M.steelDark);
    b.rail(0.072, 0.12, -0.026, M.polymer, 0.02);
    b.barrel(0.0068, 0.136, M.steelDark, 0.017, 0.0, M, 0.6); b.cyl(0.004, 0.004, 0.12, M.steel, 0, 0.004, 0.066, 8);          // barrel + guide rod (seen when the slide is back)
    b.mark('SOLANA ARMS  SERVICE 9   9x19   PS-041877', 0.0142, -0.009, 0.062, 0.1, 0.007, 'rgba(160,160,160,0.6)');
    b.begin('trigger', [0, -0.026, 0.031], { kind: 'rot', axis: [1, 0, 0], angle: 0.32 });
    b.prof([[0.028, -0.026], [0.034, -0.026], [0.033, -0.04], [0.029, -0.046], [0.025, -0.044], [0.027, -0.036]], 0.006, M.steelDark, 0, 0.001).end();
    b.begin('mag', [0, 0, 0], { kind: 'slide', axis: MAG_AX, travel: 0.16 });
    const ext = A.mag === 'ext';
    b.box(0.022, 0.112, 0.03, M.steelDark, 0, -0.07, -0.0405, 0.21); b.box(0.032, ext ? 0.034 : 0.01, 0.046, M.polymer, 0, ext ? -0.142 : -0.13, ext ? -0.057 : -0.053, 0.21);
    b.cyl(0.0046, 0.0046, 0.024, M.brass, 0, -0.008, -0.012, 8); b.end();
    b.begin('slide', [0, 0, 0], { kind: 'slide', axis: [0, 0, -1], travel: 0.045 });
    b.recv([[-0.058, 0.0], [0.122, 0.0], [0.131, 0.008], [0.131, 0.026], [0.12, 0.035], [-0.05, 0.035], [-0.059, 0.026]], 0.03, M.steel, [[0.0, 0.019], [0.04, 0.019], [0.04, 0.031], [0.0, 0.031]]);
    b.serrations(-0.05, -0.024, 0.004, 0.03, 0.0152, 7, M.steelDark).serrations(-0.05, -0.024, 0.004, 0.03, -0.0152, 7, M.steelDark);
    b.serrations(0.092, 0.114, 0.006, 0.028, 0.0152, 5, M.steelDark).serrations(0.092, 0.114, 0.006, 0.028, -0.0152, 5, M.steelDark);
    b.box(0.012, 0.012, 0.038, M.stainless, -0.0085, 0.025, 0.02); b.box(0.004, 0.004, 0.012, M.steelDark, -0.0152, 0.024, -0.008);       // barrel hood, extractor
    b.box(0.014, 0.012, 0.003, M.steelDark, 0, 0.014, -0.0585);                                                                     // striker plate
    b.mark('SERVICE 9', 0.0153, 0.017, 0.06, 0.05, 0.009); b.mark('PORT SOLANA FL', -0.0153, 0.017, 0.055, 0.06, 0.007);
    if (A.sight === 'reddot') { optic(b, M, 'reddot', -0.022, 0.035, { mini: true }); irons(b, M, -0.05, 0.12, 0.035, true); } else irons(b, M, -0.047, 0.12, 0.035);
    b.end();
    const ml = muzzleDev(b, M, A.muzzle, 0.017, 0.136, 0.0165, 0.16);
    under(b, M, A, 0.03, -0.03, { laserX: 0, laserY: -0.04, laserZ: 0.085, lightX: 0, lightY: -0.045, lightZ: 0.095 });
    return { muzzle: [0, 0.017, 0.137 + ml], eject: [-0.016, 0.027, 0.02], flash: 'pistol', leftGrip: [-0.012, -0.06, -0.02], sightY: A.sight === 'reddot' ? 0.051 : 0.044 };
  },
  revolver(b, M, A) { // large-frame double action, stainless with checkered wood grips
    b.prof([[-0.045, 0.0], [-0.03, 0.038], [0.0, 0.044], [0.075, 0.044], [0.078, 0.0], [0.045, -0.01], [0.034, -0.03], [0.004, -0.022], [-0.03, -0.012]], 0.03, M.stainless, 0, null, [[[0.006, -0.006], [0.064, -0.006], [0.064, 0.04], [0.006, 0.04]]]);
    const gp = []; for (let i = 0; i <= 10; i++) { const t = i / 10; gp.push([-0.012 - t * 0.028 - Math.sin(t * Math.PI) * 0.006, -0.01 - t * 0.1]); }
    for (let i = 10; i >= 0; i--) { const t = i / 10; gp.push([-0.05 - t * 0.026 + Math.sin(t * Math.PI) * 0.01 - (t > 0.85 ? (t - 0.85) * 0.06 : 0), -0.004 - t * 0.106]); }
    b.prof(gp, 0.036, M.woodChecker, 0, 0.008); b.cyl(0.006, 0.006, 0.038, M.brass, 0, -0.05, -0.04, 12, 'x');                      // grip medallion
    b.barrel(0.0115, 0.2, M.stainless, 0.027, 0.075, M, 0.55, 24);
    b.prof([[0.08, 0.008], [0.262, 0.008], [0.272, 0.016], [0.272, 0.027], [0.08, 0.027]], 0.019, M.stainless);
    b.prof([[0.08, 0.034], [0.27, 0.034], [0.27, 0.044], [0.085, 0.044]], 0.008, M.stainless);
    if (!b.lo) for (let z = 0.1; z < 0.26; z += 0.02) b.box(0.0085, 0.003, 0.009, M.bore, 0, 0.0435, z);
    b.prof([[0.25, 0.044], [0.268, 0.044], [0.268, 0.052], [0.256, 0.052]], 0.005, M.steelDark); b.box(0.0055, 0.003, 0.004, M.dot, 0, 0.05, 0.262);
    b.box(0.016, 0.008, 0.012, M.steelDark, 0, 0.048, -0.025); b.box(0.005, 0.005, 0.013, M.bore, 0, 0.05, -0.025);
    b.cyl(0.004, 0.004, 0.08, M.stainless, 0, 0.004, 0.105, 10); b.cyl(0.003, 0.003, 0.008, M.steel, 0.016, 0.03, 0.01, 8, 'x');
    b.mark('CABALLO .44 MAG', 0.0098, 0.018, 0.175, 0.08, 0.009, 'rgba(40,40,44,0.8)'); b.mark('CABALLO FIREARMS  HIALEAH FL  C44-20931', -0.0098, 0.018, 0.17, 0.1, 0.007, 'rgba(40,40,44,0.8)');
    b.begin('cylinder', [0, 0.02, 0.035], { kind: 'rot', axis: [0, 0, 1], angle: 1 });
    b.cyl(0.0275, 0.0275, 0.058, M.stainless, 0, 0.02, 0.035, 28);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; b.box(0.0045, 0.008, 0.036, M.steelDark, Math.cos(a) * 0.0268, 0.02 + Math.sin(a) * 0.0268, 0.028, 0, 0, a + Math.PI / 2); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.cyl(0.0062, 0.0062, 0.002, M.brass, Math.cos(a) * 0.017, 0.02 + Math.sin(a) * 0.017, 0.0052, 10); b.cyl(0.0022, 0.0022, 0.0022, M.stainless, Math.cos(a) * 0.017, 0.02 + Math.sin(a) * 0.017, 0.005, 6); b.cyl(0.0056, 0.0056, 0.002, M.bore, Math.cos(a) * 0.017, 0.02 + Math.sin(a) * 0.017, 0.0648, 10); }
    b.end();
    b.begin('hammer', [0, 0.03, -0.036], { kind: 'rot', axis: [1, 0, 0], angle: -0.75 });
    b.prof([[-0.052, 0.034], [-0.034, 0.052], [-0.026, 0.05], [-0.036, 0.03]], 0.008, M.stainless).end();
    b.begin('trigger', [0, -0.012, 0.016], { kind: 'rot', axis: [1, 0, 0], angle: 0.4 });
    b.prof([[0.012, -0.012], [0.02, -0.012], [0.016, -0.04], [0.008, -0.038]], 0.006, M.stainless).end();
    if (A.sight === 'reddot') { b.rail(0.0, 0.06, 0.046, M.steelDark, 0.018); optic(b, M, 'reddot', 0.03, 0.052); }
    const ml = muzzleDev(b, M, A.muzzle, 0.027, 0.275, 0.014);
    if (A.laser) under(b, M, { laser: true }, 0.12, 0.004, { laserX: 0, laserY: -0.006, laserZ: 0.16 });
    return { muzzle: [0, 0.027, 0.277 + ml], eject: null, flash: 'revolver', leftGrip: [-0.014, -0.06, -0.03], sightY: A.sight === 'reddot' ? 0.078 : 0.056 };
  },
  microsmg(b, M, A) { // compact machine pistol, magazine in the grip, folding wire stock
    b.recv([[-0.06, 0.0], [0.14, 0.0], [0.14, 0.05], [-0.04, 0.05], [-0.06, 0.035]], 0.038, M.steel, [[0.035, 0.026], [0.085, 0.026], [0.085, 0.044], [0.035, 0.044]]);
    b.prof([[-0.02, 0.0], [0.03, 0.0], [0.015, -0.13], [-0.03, -0.13]], 0.032, M.stipple);
    b.prof([[0.03, 0.0], [0.075, 0.0], [0.075, -0.006], [0.07, -0.04], [0.035, -0.045], [0.03, -0.04]], 0.008, M.steelDark, 0, 0.001, [[[0.036, -0.006], [0.068, -0.006], [0.065, -0.036], [0.038, -0.039]]]);
    b.rail(-0.04, 0.12, 0.05, M.alu, 0.019); b.barrel(0.0085, 0.03, M.steelDark, 0.025, 0.14, M);
    b.cyl(0.006, 0.006, 0.17, M.steel, 0.022, 0.012, -0.12, 10); b.cyl(0.006, 0.006, 0.17, M.steel, -0.022, 0.012, -0.12, 10); b.box(0.05, 0.07, 0.012, M.rubber, 0, -0.01, -0.21);
    b.box(0.006, 0.012, 0.02, M.steelDark, 0.02, 0.012, 0.01); b.pin(0.0192, 0.02, 0.1, 0.003, M.steelDark).pin(0.0192, 0.02, -0.03, 0.003, M.steelDark);
    b.mark('WASP MP-9K  9x19', 0.0192, 0.014, 0.085, 0.07, 0.008); b.mark('WASP ORDNANCE  OPA-LOCKA FL  W9-7731', -0.0192, 0.014, 0.05, 0.11, 0.007);
    b.begin('bolt', [0, 0, 0], { kind: 'slide', axis: [0, 0, -1], travel: 0.045 }); b.box(0.034, 0.016, 0.048, M.stainless, 0, 0.035, 0.06); b.cyl(0.006, 0.006, 0.022, M.knurl, 0, 0.058, 0.09, 10, 'y'); b.end();
    b.begin('trigger', [0, -0.004, 0.05], { kind: 'rot', axis: [1, 0, 0], angle: 0.3 }); b.prof([[0.047, -0.004], [0.053, -0.004], [0.05, -0.03], [0.045, -0.028]], 0.006, M.steelDark, 0, 0.001).end();
    b.begin('mag', [0, 0, 0], { kind: 'slide', axis: [0, -0.993, -0.12], travel: 0.2 });
    const mh = A.mag === 'ext' ? 0.25 : 0.18; b.box(0.024, mh, 0.026, M.steelDark, 0, -mh / 2 + 0.02, 0.0 - (mh - 0.18) * 0.06, 0.12); b.box(0.03, 0.012, 0.032, M.polymer, 0, -mh + 0.015, -0.012 - (mh - 0.18) * 0.12); b.end();
    if (A.sight === 'irons') irons(b, M, -0.03, 0.125, 0.06, false); else optic(b, M, A.sight, 0.03, 0.055);
    const ml = muzzleDev(b, M, A.muzzle, 0.025, 0.17, 0.019, 0.14);
    under(b, M, A, 0.1, 0.0, { laserX: 0.024, laserY: 0.02, laserZ: 0.11, lightX: 0, lightY: -0.014, lightZ: 0.11 });
    return { muzzle: [0, 0.025, 0.172 + ml], eject: [-0.02, 0.035, 0.06], flash: 'rifle', leftGrip: [0, -0.02, 0.1], sightY: 0.082 };
  },
  smg(b, M, A) { // roller-style SMG, slotted handguard, fixed stock
    b.recv([[-0.08, 0.0], [0.16, 0.0], [0.17, 0.012], [0.17, 0.055], [-0.07, 0.055], [-0.09, 0.04]], 0.044, M.steel, [[0.02, 0.03], [0.08, 0.03], [0.08, 0.048], [0.02, 0.048]]);
    b.prof([[-0.03, 0.0], [0.03, 0.0], [0.012, -0.125], [-0.04, -0.125], [-0.045, -0.06]], 0.034, M.furnGrip || M.stipple);
    b.prof([[0.03, 0.0], [0.07, 0.0], [0.07, -0.04], [0.035, -0.042], [0.03, -0.036]], 0.008, M.steelDark, 0, 0.001, [[[0.036, -0.005], [0.064, -0.005], [0.064, -0.035], [0.038, -0.036]]]);
    b.prof([[0.15, 0.002], [0.33, 0.002], [0.33, 0.052], [0.15, 0.052]], 0.05, M.furn || M.polymer);
    if (!b.lo) for (let z = 0.17; z < 0.32; z += 0.035) { b.box(0.002, 0.01, 0.022, M.bore, 0.0255, 0.027, z); b.box(0.002, 0.01, 0.022, M.bore, -0.0255, 0.027, z); }
    b.barrel(0.0085, 0.05, M.steelDark, 0.028, 0.33, M); b.rail(-0.06, 0.32, 0.055, M.alu); b.rail(0.19, 0.31, -0.004, M.alu, 0.02);
    b.cyl(0.01, 0.01, 0.12, M.steelDark, 0.026, 0.045, 0.2, 10);
    b.prof([[-0.09, 0.045], [-0.1, 0.045], [-0.29, 0.03], [-0.3, -0.07], [-0.27, -0.075], [-0.12, -0.01], [-0.09, 0.0]], 0.036, M.furn || M.polymer); b.box(0.04, 0.1, 0.015, M.rubber, 0, -0.02, -0.3, -0.1);
    b.box(0.004, 0.01, 0.03, M.steelDark, 0.0225, 0.012, -0.01); b.pin(0.0222, 0.008, 0.11, 0.003, M.steelDark).pin(0.0222, 0.03, -0.06, 0.003, M.steelDark).pin(0.0222, 0.008, -0.05, 0.003, M.steelDark);
    b.mark('KESTREL K-5  9x19', 0.0222, 0.018, 0.115, 0.07, 0.009); b.mark('KESTREL DEFENSE  MEDLEY FL  K5-44102', -0.0222, 0.018, 0.06, 0.11, 0.007);
    b.begin('bolt', [0, 0, 0], { kind: 'slide', axis: [0, 0, -1], travel: 0.05 }); b.box(0.04, 0.016, 0.058, M.stainless, 0, 0.039, 0.05); b.end();
    b.begin('charging', [0, 0, 0], { kind: 'slide', axis: [0, 0, -1], travel: 0.09 }); b.box(0.01, 0.014, 0.02, M.steelDark, 0.034, 0.045, 0.25); b.cyl(0.006, 0.006, 0.016, M.knurl, 0.044, 0.045, 0.25, 10, 'x'); b.end();
    b.begin('trigger', [0, -0.004, 0.05], { kind: 'rot', axis: [1, 0, 0], angle: 0.3 }); b.prof([[0.047, -0.004], [0.053, -0.004], [0.05, -0.03], [0.045, -0.028]], 0.006, M.steelDark, 0, 0.001).end();
    b.begin('mag', [0, 0, 0], { kind: 'slide', axis: [0, -0.97, 0.24], travel: 0.2 });
    if (A.mag === 'drum') drumMag(b, M, 0.1, 0.0, 0.05, 0.03); else curvedMag(b, M, M.steelDark, 0.1, 0.0, A.mag === 'ext' ? 0.24 : 0.17, 0.026, 0.036, A.mag === 'ext' ? 0.07 : 0.04);
    b.end();
    const top = 0.064; if (A.sight === 'irons') flipIrons(b, M, -0.04, 0.3, top - 0.004); else optic(b, M, A.sight, 0.02, top, { len: 0.24 });
    const ml = muzzleDev(b, M, A.muzzle, 0.028, 0.38, 0.019, 0.16);
    if (A.muzzle === 'none') b.cyl(0.014, 0.011, 0.03, M.steelDark, 0, 0.028, 0.385, 8);
    const lg = under(b, M, A, 0.25, -0.004, { laserX: 0.032, laserY: 0.03, laserZ: 0.27, lightX: -0.034, lightY: 0.03, lightZ: 0.27 });
    return { muzzle: [0, 0.028, (A.muzzle === 'none' ? 0.402 : 0.382 + ml)], eject: [-0.024, 0.04, 0.05], flash: 'rifle', leftGrip: lg || [0, 0.0, 0.24], sightY: 0.09 };
  },
  rifle(b, M, A) { return arPattern(b, M, A, { furn: M.furn || M.fde, grip: M.furnGrip || M.fdeStipple, hg: 0.45, barrel: 0.6, name: 'BISCAYNE GR-27  5.56', maker: 'BISCAYNE ARMORY  MIAMI FL  GR27-081145', mag: 'curved', stock: 'adj', defOptic: 0.05 }); },
  carbine(b, M, A) { return arPattern(b, M, A, { furn: M.furn || M.odg, grip: M.furnGrip || M.stipple, hg: 0.36, barrel: 0.42, name: 'COASTLINE C-10  .308', maker: 'COASTLINE RIFLE WORKS  HOMESTEAD FL  C10-3390', mag: 'straight', stock: 'fixed', defOptic: 0.03 }); },
  shotgun(b, M, A) { // pump action, wood furniture
    b.recv([[-0.06, -0.015], [0.15, -0.015], [0.15, 0.05], [0.12, 0.06], [-0.04, 0.06], [-0.06, 0.045]], 0.046, M.blued, [[0.035, 0.022], [0.085, 0.022], [0.085, 0.044], [0.035, 0.044]]);
    b.prof([[0.0, -0.015], [0.06, -0.015], [0.06, -0.045], [0.005, -0.045]], 0.008, M.steelDark, 0, 0.001, [[[0.008, -0.019], [0.054, -0.019], [0.054, -0.04], [0.01, -0.04]]]);
    b.barrel(0.0105, 0.56, M.blued, 0.042, 0.15, M, 0.8); const tube = A.mag === 'ext' ? 0.56 : 0.48;
    b.cyl(0.0135, 0.0135, tube, M.blued, 0, 0.011, 0.15 + tube / 2, 18); b.cyl(0.0148, 0.0148, 0.014, M.knurl, 0, 0.011, 0.15 + tube + 0.004, 16);
    b.box(0.03, 0.04, 0.012, M.blued, 0, 0.026, 0.52);                                                                                // barrel band
    b.prof([[-0.06, 0.045], [-0.06, -0.015], [-0.12, -0.05], [-0.38, -0.085], [-0.4, -0.08], [-0.4, 0.02], [-0.38, 0.03], [-0.15, 0.045]], 0.04, M.wood);
    b.box(0.042, 0.11, 0.016, M.rubber, 0, -0.028, -0.405, -0.12); b.cyl(0.0025, 0.0025, 0.004, M.brass, 0, 0.056, 0.705, 8, 'y');
    b.box(0.006, 0.006, 0.012, M.steelDark, 0, 0.063, -0.03); b.pin(0.0232, 0.0, 0.1, 0.003, M.steelDark).pin(0.0232, 0.0, 0.0, 0.003, M.steelDark);
    b.mark('BREAKER 12 GA  3 IN', 0.0232, 0.006, 0.09, 0.08, 0.009); b.mark('BREAKER GUN CO.  KEY PALOMA FL  B12-5567', -0.0232, 0.006, 0.06, 0.12, 0.007);
    if (!b.lo) for (let i = 0; i < 4; i++) { b.cyl(0.0098, 0.0098, 0.06, M.red, 0.034, 0.03, -0.01 + i * 0.026, 12, 'y'); b.cyl(0.01, 0.01, 0.012, M.brass, 0.034, 0.0, -0.01 + i * 0.026, 12, 'y'); } // side saddle shells
    if (!b.lo) b.box(0.012, 0.064, 0.11, M.polymer, 0.027, 0.02, 0.03);
    b.begin('bolt', [0, 0, 0], { kind: 'slide', axis: [0, 0, -1], travel: 0.05 }); b.box(0.04, 0.02, 0.048, M.stainless, 0, 0.033, 0.06); b.end();
    b.begin('pump', [0, 0, 0], { kind: 'slide', axis: [0, 0, -1], travel: 0.085 });
    b.prof([[0.22, -0.01], [0.4, -0.01], [0.4, 0.032], [0.22, 0.032]], 0.05, M.wood, 0, 0.008);
    if (!b.lo) for (let z = 0.235; z < 0.39; z += 0.016) b.box(0.052, 0.036, 0.004, M.bore, 0, 0.011, z);
    b.box(0.004, 0.006, 0.14, M.steelDark, 0.016, 0.011, 0.16); b.box(0.004, 0.006, 0.14, M.steelDark, -0.016, 0.011, 0.16); b.end();
    b.begin('trigger', [0, -0.018, 0.03], { kind: 'rot', axis: [1, 0, 0], angle: 0.3 }); b.prof([[0.027, -0.018], [0.033, -0.018], [0.03, -0.04], [0.025, -0.038]], 0.006, M.steelDark, 0, 0.001).end();
    if (A.sight !== 'irons') { b.rail(-0.03, 0.11, 0.06, M.alu, 0.019); optic(b, M, A.sight, 0.04, 0.065); } else b.box(0.012, 0.004, 0.08, M.steelDark, 0, 0.062, 0.02);
    const ml = muzzleDev(b, M, A.muzzle, 0.042, 0.71, 0.014);
    if (A.light) { b.box(0.034, 0.02, 0.02, M.alu, 0, 0.0, 0.6); under(b, M, { light: true }, 0.6, 0.0, { lightX: 0, lightY: -0.014, lightZ: 0.62 }); }
    return { muzzle: [0, 0.042, 0.712 + ml], eject: [-0.024, 0.032, 0.06], flash: 'shotgun', leftGrip: [0, 0.0, 0.31], sightY: A.sight !== 'irons' ? 0.091 : 0.068 };
  },
  sawnoff(b, M) { // cut-down side-by-side, exposed hammers, break action
    b.prof([[-0.05, -0.01], [0.07, -0.01], [0.07, 0.045], [-0.04, 0.045], [-0.05, 0.03]], 0.06, M.blued, 0, 0.006);
    b.prof([[-0.04, 0.0], [-0.015, -0.01], [-0.06, -0.12], [-0.11, -0.12], [-0.1, -0.09], [-0.06, 0.02]], 0.04, M.woodChecker, 0, 0.008);
    b.prof([[0.0, -0.01], [0.05, -0.01], [0.05, -0.04], [0.005, -0.04]], 0.008, M.steelDark, 0, 0.001, [[[0.007, -0.014], [0.044, -0.014], [0.044, -0.035], [0.009, -0.035]]]);
    b.box(0.014, 0.006, 0.03, M.steelDark, 0, 0.05, -0.01); b.pin(0.0302, 0.018, 0.02, 0.004, M.steelDark).pin(0.0302, 0.005, -0.02, 0.003, M.steelDark);    // top lever
    b.mark('HACKSAW  12 GA', 0.0302, 0.03, 0.02, 0.05, 0.008);
    for (const x of [-0.016, 0.016]) { b.begin(x < 0 ? 'hammer' : 'hammerR', [x, 0.04, -0.04], { kind: 'rot', axis: [1, 0, 0], angle: -0.7 }); b.prof([[-0.045, 0.04], [-0.035, 0.065], [-0.025, 0.062], [-0.032, 0.04]], 0.008, M.steelDark, x).end(); }
    b.begin('trigger', [0, -0.012, 0.022], { kind: 'rot', axis: [1, 0, 0], angle: 0.3 }); b.prof([[0.02, -0.012], [0.026, -0.012], [0.023, -0.032], [0.018, -0.03]], 0.006, M.steelDark, 0.006, 0.001); b.prof([[0.03, -0.012], [0.036, -0.012], [0.033, -0.032], [0.028, -0.03]], 0.006, M.steelDark, -0.006, 0.001).end();
    b.begin('breech', [0, -0.008, 0.075], { kind: 'rot', axis: [1, 0, 0], angle: 0.6 });
    for (const x of [-0.0155, 0.0155]) { b.cyl(0.0155, 0.0155, 0.3, M.blued, x, 0.028, 0.22, 18); b.cyl(0.0112, 0.0112, 0.003, M.bore, x, 0.028, 0.3712, 14); b.cyl(0.0125, 0.0125, 0.003, M.brass, x, 0.028, 0.0695, 14); }
    b.box(0.012, 0.006, 0.29, M.blued, 0, 0.046, 0.22); b.prof([[0.08, -0.012], [0.22, -0.012], [0.22, 0.02], [0.08, 0.02]], 0.058, M.woodChecker, 0, 0.008); b.cyl(0.002, 0.002, 0.003, M.brass, 0, 0.05, 0.36, 6, 'y');
    b.end();
    return { muzzle: [0, 0.028, 0.374], eject: null, flash: 'shotgun', leftGrip: [0, 0.0, 0.15], sightY: 0.055 };
  },
  sniper(b, M, A) { // bolt-action precision rifle in a modular chassis
    b.recv([[-0.08, 0.0], [0.17, 0.0], [0.17, 0.05], [-0.08, 0.05]], 0.044, M.steel, [[0.0, 0.024], [0.075, 0.024], [0.075, 0.046], [0.0, 0.046]]);
    b.prof([[-0.09, -0.01], [0.48, -0.01], [0.48, 0.032], [0.2, 0.032], [0.17, 0.0], [-0.09, 0.0]], 0.056, M.furn || M.odg);
    if (!b.lo) for (let z = 0.22; z < 0.47; z += 0.04) { b.box(0.002, 0.014, 0.024, M.bore, 0.0285, 0.012, z); b.box(0.002, 0.014, 0.024, M.bore, -0.0285, 0.012, z); }
    b.prof([[-0.028, -0.01], [0.02, -0.01], [0.004, -0.12], [-0.045, -0.115], [-0.05, -0.06]], 0.034, M.furnGrip || M.stipple);
    b.prof([[0.01, -0.01], [0.07, -0.01], [0.07, -0.04], [0.015, -0.04]], 0.008, M.steelDark, 0, 0.001, [[[0.018, -0.014], [0.064, -0.014], [0.064, -0.035], [0.02, -0.035]]]);
    b.cyl(0.0125, 0.0105, 0.52, M.steelDark, 0, 0.026, 0.73, 18); b.cyl(0.0058, 0.0058, 0.003, M.bore, 0, 0.026, 0.9905, 12);
    if (!b.lo) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.box(0.0025, 0.0025, 0.3, M.steel, Math.cos(a) * 0.0114, 0.026 + Math.sin(a) * 0.0114, 0.65); }
    b.prof([[-0.09, 0.05], [-0.38, 0.05], [-0.395, 0.035], [-0.395, -0.08], [-0.37, -0.085], [-0.2, -0.03], [-0.12, -0.02], [-0.09, 0.0]], 0.046, M.furn || M.odg, 0, null, [[[-0.34, 0.0], [-0.24, 0.0], [-0.2, 0.03], [-0.34, 0.03]]]);
    b.box(0.03, 0.025, 0.14, M.furn || M.odg, 0, 0.065, -0.24); b.cyl(0.004, 0.004, 0.03, M.steel, 0.018, 0.05, -0.2, 8, 'y'); b.cyl(0.004, 0.004, 0.03, M.steel, 0.018, 0.05, -0.28, 8, 'y');
    b.box(0.048, 0.14, 0.018, M.rubber, 0, -0.016, -0.405); b.box(0.03, 0.03, 0.03, M.steelDark, 0, -0.1, -0.33); b.cyl(0.006, 0.006, 0.02, M.knurl, 0, -0.07, -0.33, 10, 'y');
    b.rail(-0.08, 0.17, 0.05, M.alu); b.rail(0.24, 0.46, -0.012, M.alu, 0.02);
    for (const s of [-1, 1]) { b.box(0.008, 0.16, 0.008, M.alu, s * 0.027, -0.09, 0.44, 0.35, 0, s * 0.18); b.box(0.014, 0.012, 0.02, M.rubber, s * 0.042, -0.166, 0.412); } b.box(0.05, 0.014, 0.024, M.alu, 0, -0.016, 0.47);   // bipod
    b.mark('LONGSHOT M-308  7.62', 0.0222, 0.014, 0.1, 0.08, 0.009); b.mark('LONGSHOT PRECISION  PORT CASSIA FL  L3-00782', -0.0222, 0.014, 0.07, 0.13, 0.007);
    b.begin('boltHandle', [0, 0.036, -0.02], { kind: 'bolt', axis: [0, 0, -1], travel: 0.09, lift: -1.0 });
    b.cyl(0.0098, 0.0098, 0.13, M.stainless, 0, 0.036, 0.03, 14); b.cyl(0.0075, 0.0075, 0.04, M.steel, -0.034, 0.03, -0.02, 10, 'x'); b.add(new THREE.SphereGeometry(0.011, 14, 10), M.knurl, -0.058, 0.026, -0.02); b.cyl(0.0105, 0.0105, 0.016, M.steelDark, 0, 0.036, -0.045, 14); b.end();
    b.begin('trigger', [0, -0.012, 0.04], { kind: 'rot', axis: [1, 0, 0], angle: 0.25 }); b.prof([[0.037, -0.012], [0.043, -0.012], [0.04, -0.034], [0.035, -0.032]], 0.006, M.red, 0, 0.001).end();
    b.begin('mag', [0, 0, 0], { kind: 'slide', axis: [0, -1, 0], travel: 0.13 }); const mh = A.mag === 'ext' ? 0.125 : 0.085; b.box(0.03, mh, 0.07, M.steelDark, 0, -0.01 - mh / 2, 0.1); b.box(0.034, 0.008, 0.074, M.polymer, 0, -0.012 - mh, 0.1); b.cyl(0.0058, 0.0058, 0.05, M.brass, 0, -0.006, 0.1, 8); b.end();
    if (A.sight === 'scope') scope(b, M, 0.03, 0.098, 0.36, 0.017, 0.031, 0.022); else if (A.sight === 'acog') optic(b, M, 'acog', 0.04, 0.059); else flipIrons(b, M, -0.06, 0.15, 0.055);
    let ml = muzzleDev(b, M, A.muzzle, 0.026, 0.99, 0.022, 0.22);
    if (A.muzzle === 'none') { b.prof([[0.99, 0.008], [1.06, 0.008], [1.06, 0.044], [0.99, 0.044]], 0.03, M.steelDark); for (const z of [1.005, 1.025, 1.045]) b.box(0.031, 0.008, 0.007, M.bore, 0, 0.034, z); b.cyl(0.0058, 0.0058, 0.003, M.bore, 0, 0.026, 1.0605, 12); ml = 0.07; }
    return { muzzle: [0, 0.026, 0.995 + ml], eject: [-0.025, 0.035, 0.03], flash: A.muzzle === 'suppressor' ? 'suppressed' : 'rifle', leftGrip: [0, -0.005, 0.3], sightY: A.sight === 'scope' ? 0.098 : 0.085 };
  },
  grenade(b, M) {
    b.add(new THREE.SphereGeometry(0.036, b.lo ? 10 : 22, b.lo ? 8 : 16).scale(1, 1.2, 1), M.grenade);
    for (let i = 0; i < 5; i++) b.cyl(0.0372 * (1 - Math.abs(i - 2) * 0.13), 0.0372 * (1 - Math.abs(i - 2) * 0.13), 0.003, M.steelDark, 0, -0.03 + i * 0.015, 0, 18, 'y');
    if (!b.lo) for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; b.box(0.003, 0.07, 0.003, M.steelDark, Math.cos(a) * 0.036, 0, Math.sin(a) * 0.036); }
    b.cyl(0.013, 0.015, 0.03, M.steel, 0, 0.052, 0, 14, 'y'); b.prof([[-0.006, 0.062], [0.008, 0.062], [0.012, -0.02], [0.006, -0.02]], 0.012, M.steel, 0.02);
    b.add(new THREE.TorusGeometry(0.013, 0.0018, 6, 18), M.stainless, -0.016, 0.064, 0, 0, Math.PI / 2, 0); b.mark('FRAG  M-33  LOT PS-12', 0.037, 0.0, 0.0, 0.05, 0.008, 'rgba(230,200,60,0.85)');
    return { muzzle: [0, 0, 0], eject: null };
  },
  bat(b, M) {
    const pts = []; for (const [z, r] of [[0, 0.019], [0.02, 0.021], [0.03, 0.014], [0.25, 0.015], [0.45, 0.024], [0.7, 0.034], [0.84, 0.034], [0.85, 0.026], [0.855, 0]]) pts.push(new THREE.Vector2(r, z));
    const g = new THREE.LatheGeometry(pts, b.lo ? 10 : 24); g.rotateX(Math.PI / 2); g.translate(0, 0, -0.08); b.add(g, M.wood);
    b.cyl(0.0165, 0.0165, 0.17, M.tape, 0, 0, 0.02, 16); b.mark('ASH 34   SOLANA SLUGGER', 0.0338, 0, 0.6, 0.16, 0.014, 'rgba(30,20,12,0.85)'); b.cyl(0.0344, 0.0344, 0.004, M.red, 0, 0, 0.48, 20);
    return { muzzle: [0, 0, 0.7], eject: null, leftGrip: [0, 0, 0.1] };
  },
  knife(b, M) { // folding tactical knife, open
    b.prof([[-0.06, -0.012], [0.055, -0.012], [0.06, -0.006], [0.06, 0.012], [-0.05, 0.012], [-0.065, 0.004]], 0.016, M.stipple);
    b.prof([[-0.055, -0.012], [0.055, -0.012], [0.055, 0.012], [-0.05, 0.012]], 0.019, M.steelDark);
    b.prof([[0.055, -0.006], [0.15, -0.002], [0.2, 0.012], [0.16, 0.014], [0.07, 0.014], [0.055, 0.01]], 0.0035, M.blade, 0, 0.0008, [[[0.075, 0.006], [0.088, 0.006], [0.088, 0.011], [0.075, 0.011]]]);
    b.cyl(0.006, 0.006, 0.02, M.steel, 0, 0.0, 0.05, 12, 'x'); b.cyl(0.004, 0.004, 0.022, M.steel, 0, 0.004, -0.05, 10, 'x'); b.box(0.003, 0.004, 0.06, M.steel, 0.011, 0.006, -0.015);
    return { muzzle: [0, 0, 0.18], eject: null };
  },
  crowbar(b, M) { // gooseneck wrecking bar: hex shank, claw, chisel tip
    const hex = (len, z) => b.add(new THREE.CylinderGeometry(0.0105, 0.0105, len, 6), M.crowbar, 0, 0, z, Math.PI / 2);
    hex(0.62, 0.21);
    const pts = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * 2.7; pts.push(new THREE.Vector3(0, 0.05 - Math.cos(a) * 0.05, 0.52 + Math.sin(a) * 0.05)); }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0105, 6), M.crowbar);
    b.prof([[0.535, 0.092], [0.5, 0.118], [0.494, 0.112], [0.52, 0.086]], 0.026, M.blade, 0, 0.001, [[[0.508, 0.108], [0.5, 0.115], [0.498, 0.113], [0.506, 0.106]]]);          // claw
    b.prof([[-0.1, 0.0105], [-0.16, 0.004], [-0.16, -0.001], [-0.1, -0.0105]], 0.024, M.blade, 0, 0.001);                                                                         // chisel
    b.mark('BREAKER TOOL  30 IN  FORGED', 0.0094, 0.0, 0.2, 0.14, 0.009, 'rgba(240,230,210,0.7)');
    return { muzzle: [0, 0.05, 0.56], eject: null, leftGrip: [0, 0, 0.2] };
  },
  bottle(b, M, A, opts) { // long-neck beer bottle (held by the neck, body forward); broken = jagged body
    const glass = M.bottleAmber, prof = opts.broken
      ? [[0.0, 0.0125], [0.07, 0.013], [0.1, 0.02], [0.13, 0.031]]
      : [[0.0, 0.0125], [0.07, 0.013], [0.1, 0.02], [0.125, 0.031], [0.235, 0.031], [0.245, 0.027], [0.246, 0]];
    const g = new THREE.LatheGeometry(prof.map(([z, r]) => new THREE.Vector2(r, z)), b.lo ? 10 : 24); g.rotateX(Math.PI / 2); g.translate(0, 0, -0.04); b.add(g, glass);
    b.cyl(0.0138, 0.0138, 0.008, glass, 0, 0, -0.037, 16);
    if (opts.broken) { for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, h = 0.025 + ((i * 7) % 5) * 0.012; const sh = new THREE.Shape([new THREE.Vector2(-0.011, 0), new THREE.Vector2(0.011, 0), new THREE.Vector2(((i % 3) - 1) * 0.006, h)]); const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.002, bevelEnabled: false }); sg.rotateX(Math.PI / 2); sg.rotateZ(a + Math.PI / 2); sg.translate(Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.089); b.add(sg, glass); } }
    else { b.cyl(0.0315, 0.0315, 0.07, M.label || (M.label = labelMat()), 0, 0, 0.14, 24, 'z', true); b.cyl(0.0142, 0.0142, 0.006, M.brass, 0, 0, -0.043, 14); b.cyl(0.0285, 0.0285, 0.06, M.liquid, 0, 0, 0.17, 16); }
    return { muzzle: [0, 0, opts.broken ? 0.11 : 0.2], eject: null };
  },
  molotov(b, M) { // liquor bottle with a fuel-soaked rag wick
    const prof = [[0.0, 0.014], [0.06, 0.015], [0.085, 0.03], [0.1, 0.036], [0.2, 0.036], [0.21, 0.03], [0.211, 0]];
    const g = new THREE.LatheGeometry(prof.map(([z, r]) => new THREE.Vector2(r, z)), b.lo ? 10 : 24); g.rotateX(Math.PI / 2); g.rotateX(Math.PI); g.translate(0, 0, 0.12); b.add(g, M.bottle);
    b.cyl(0.033, 0.033, 0.07, M.liquid, 0, 0, -0.03, 16); b.cyl(0.0365, 0.0365, 0.05, M.label || (M.label = labelMat()), 0, 0, -0.03, 24, 'z', true);
    b.cyl(0.011, 0.014, 0.05, M.rag, 0, 0, 0.14, 10); b.box(0.02, 0.004, 0.06, M.rag, 0.004, 0.006, 0.19, 0.3, 0.2, 0.4); b.box(0.016, 0.004, 0.05, M.rag, -0.005, -0.004, 0.185, -0.4, -0.2, 0.1);
    b.node('fx_wick', 0, 0.01, 0.215);
    return { muzzle: [0, 0, 0.2], eject: null };
  },
};
function labelMat() {
  const c = canvas(256, 128, (g, w, h) => { g.fillStyle = '#f2e6c8'; g.fillRect(0, 0, w, h); g.fillStyle = '#b3261e'; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16); g.fillStyle = '#1d3b5a'; g.font = '900 34px Georgia, serif'; g.textAlign = 'center'; g.fillText('TERN KEY', w / 2, 62); g.font = '600 15px Arial'; g.fillText('ISLAND LAGER  ·  PORT SOLANA', w / 2, 88); g.beginPath(); g.arc(w / 2, 100, 6, 0, 6.3); g.fill(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, side: THREE.DoubleSide });
}
// shared AR-pattern builder (assault rifle and carbine differ in furniture, barrel, magazine and stock)
function arPattern(b, M, A, o) {
  b.prof([[-0.09, 0.0], [0.11, 0.0], [0.13, -0.012], [0.13, -0.065], [0.075, -0.065], [0.07, -0.02], [0.02, -0.02], [-0.02, -0.04], [-0.09, -0.02]], 0.044, M.alu);
  b.prof([[-0.028, -0.01], [0.02, -0.01], [0.004, -0.12], [-0.045, -0.115], [-0.05, -0.06]], 0.034, o.grip);
  b.prof([[0.01, -0.02], [0.07, -0.02], [0.07, -0.05], [0.015, -0.05]], 0.008, M.alu, 0, 0.001, [[[0.018, -0.023], [0.064, -0.023], [0.064, -0.045], [0.02, -0.045]]]);
  b.recv([[-0.095, 0.0], [0.17, 0.0], [0.17, 0.05], [-0.095, 0.05]], 0.042, M.alu, [[0.02, 0.022], [0.08, 0.022], [0.08, 0.04], [0.02, 0.04]]);
  b.box(0.006, 0.012, 0.02, M.alu, -0.024, 0.03, -0.01); b.cyl(0.006, 0.006, 0.03, M.knurl, -0.03, 0.03, -0.01, 10, 'x');                    // forward assist
  b.box(0.004, 0.008, 0.016, M.steelDark, 0.0225, -0.006, 0.02); b.box(0.004, 0.012, 0.01, M.steelDark, 0.0225, -0.008, 0.085);           // selector, mag release
  b.pin(0.0222, -0.006, 0.105, 0.0035, M.steelDark).pin(0.0222, -0.006, -0.07, 0.0035, M.steelDark).pin(-0.0222, -0.006, 0.02, 0.005, M.steelDark);
  b.rail(-0.09, 0.17, 0.05, M.alu);
  b.prof([[0.17, -0.005], [o.hg, -0.005], [o.hg, 0.056], [0.17, 0.056]], 0.048, o.furn, 0, 0.006);
  if (!b.lo) for (let z = 0.2; z < o.hg - 0.01; z += 0.04) { b.box(0.002, 0.012, 0.026, M.bore, 0.0245, 0.028, z); b.box(0.002, 0.012, 0.026, M.bore, -0.0245, 0.028, z); b.box(0.014, 0.002, 0.026, M.bore, 0, -0.0055, z); }
  b.rail(0.18, o.hg - 0.01, 0.056, M.alu); b.rail(o.hg - 0.14, o.hg - 0.02, -0.01, M.alu, 0.02);
  b.barrel(0.0095, o.barrel - o.hg, M.steelDark, 0.026, o.hg, M, 0.5, 14); b.cyl(0.013, 0.013, 0.02, M.steelDark, 0, 0.026, o.hg + 0.03, 12);
  b.cyl(0.015, 0.015, 0.17, M.alu, 0, 0.026, -0.18, 16); b.cyl(0.017, 0.017, 0.012, M.steelDark, 0, 0.026, -0.1, 16);
  if (o.stock === 'adj') b.prof([[-0.16, 0.042], [-0.3, 0.044], [-0.322, 0.05], [-0.326, -0.05], [-0.31, -0.055], [-0.23, -0.004], [-0.16, 0.008]], 0.04, o.furn, 0, null, [[[-0.3, -0.03], [-0.25, -0.004], [-0.3, 0.0]]]);
  else b.prof([[-0.15, 0.05], [-0.29, 0.05], [-0.305, 0.04], [-0.305, -0.06], [-0.285, -0.065], [-0.2, 0.0], [-0.15, 0.0]], 0.042, o.furn);
  b.box(0.042, 0.1, 0.012, M.rubber, 0, 0.0, -0.332 + (o.stock === 'adj' ? 0 : 0.02));
  b.mark(o.name, 0.0222, -0.012, 0.1, 0.06, 0.008); b.mark(o.maker, -0.0222, -0.012, 0.03, 0.12, 0.007); b.mark('SAFE   SEMI   AUTO', 0.0222, -0.016, 0.02, 0.04, 0.005);
  b.begin('bolt', [0, 0, 0], { kind: 'slide', axis: [0, 0, -1], travel: 0.055 }); b.box(0.038, 0.016, 0.058, M.stainless, 0, 0.031, 0.05); if (!b.lo) for (let i = 0; i < 4; i++) b.box(0.039, 0.003, 0.004, M.steelDark, 0, 0.036, 0.03 + i * 0.012); b.end();
  b.begin('charging', [0, 0, 0], { kind: 'slide', axis: [0, 0, -1], travel: 0.07 }); b.box(0.03, 0.008, 0.024, M.alu, 0, 0.054, -0.098); b.box(0.044, 0.008, 0.008, M.alu, 0, 0.054, -0.108); b.end();
  b.begin('ejectionCover', [-0.022, 0.022, 0.05], { kind: 'rot', axis: [0, 0, 1], angle: 1.5 }); b.box(0.002, 0.02, 0.062, M.alu, -0.023, 0.012, 0.05); b.end();
  b.begin('trigger', [0, -0.02, 0.04], { kind: 'rot', axis: [1, 0, 0], angle: 0.3 }); b.prof([[0.037, -0.02], [0.043, -0.02], [0.04, -0.042], [0.035, -0.04]], 0.006, M.steelDark, 0, 0.001).end();
  b.begin('mag', [0, 0, 0], { kind: 'slide', axis: [0, -0.98, 0.2], travel: 0.22 });
  if (A.mag === 'drum') drumMag(b, M, 0.1, -0.05, 0.058, 0.03);
  else if (o.mag === 'curved') curvedMag(b, M, M.furn || M.fde, 0.1, -0.06, A.mag === 'ext' ? 0.27 : 0.2, 0.03, 0.06, A.mag === 'ext' ? 0.09 : 0.05);
  else { const mh = A.mag === 'ext' ? 0.17 : 0.12; b.box(0.028, mh, 0.058, M.steelDark, 0, -0.055 - mh / 2, 0.1, 0.08); b.box(0.032, 0.012, 0.062, M.polymer, 0, -0.058 - mh, 0.105 + mh * 0.04); b.cyl(0.0056, 0.0056, 0.045, M.brass, 0, -0.052, 0.1, 8); }
  b.end();
  if (A.sight === 'irons') flipIrons(b, M, -0.07, o.hg - 0.04, 0.059); else optic(b, M, A.sight, o.defOptic, 0.059, { len: 0.26, obj: 0.0215, r: 0.0152, sz: 0.01 });
  let ml = muzzleDev(b, M, A.muzzle, 0.026, o.barrel, 0.02, 0.16);
  if (A.muzzle === 'none') { b.prof([[o.barrel, 0.012], [o.barrel + 0.05, 0.012], [o.barrel + 0.05, 0.04], [o.barrel, 0.04]], 0.026, M.steelDark, 0, 0.004); for (const dz of [0.012, 0.025, 0.038]) b.box(0.0275, 0.006, 0.005, M.bore, 0, 0.034, o.barrel + dz); b.cyl(0.005, 0.005, 0.003, M.bore, 0, 0.026, o.barrel + 0.0505, 10); ml = 0.05; }
  const lg = under(b, M, A, o.hg - 0.08, -0.01, { laserX: 0.031, laserY: 0.03, laserZ: o.hg - 0.07, lightX: -0.033, lightY: 0.03, lightZ: o.hg - 0.07 });
  return { muzzle: [0, 0.026, o.barrel + 0.002 + ml], eject: [-0.025, 0.03, 0.05], flash: 'rifle', leftGrip: lg || [0, 0.0, o.hg - 0.12], sightY: A.sight === 'scope' ? 0.093 : 0.085 };
}

export const WEAPON_ATTACH = {
  pistol: { sight: ['irons', 'reddot'], mag: ['std', 'ext'], muzzle: ['none', 'suppressor', 'comp'], grip: ['none'], laser: true, light: true },
  revolver: { sight: ['irons', 'reddot'], mag: ['std'], muzzle: ['none', 'comp'], grip: ['none'], laser: true, light: false },
  microsmg: { sight: ['irons', 'reddot', 'holo'], mag: ['std', 'ext'], muzzle: ['none', 'suppressor'], grip: ['none'], laser: true, light: true },
  smg: { sight: ['irons', 'reddot', 'holo', 'acog'], mag: ['std', 'ext', 'drum'], muzzle: ['none', 'suppressor', 'comp'], grip: ['none', 'vertical', 'angled'], laser: true, light: true },
  rifle: { sight: ['irons', 'reddot', 'holo', 'acog'], mag: ['std', 'ext', 'drum'], muzzle: ['none', 'suppressor', 'comp'], grip: ['none', 'vertical', 'angled'], laser: true, light: true },
  carbine: { sight: ['irons', 'reddot', 'holo', 'acog', 'scope'], mag: ['std', 'ext'], muzzle: ['none', 'suppressor', 'comp'], grip: ['none', 'vertical', 'angled'], laser: true, light: true },
  shotgun: { sight: ['irons', 'reddot', 'holo'], mag: ['std', 'ext'], muzzle: ['none', 'comp'], grip: ['none'], laser: false, light: true },
  sawnoff: { sight: ['irons'], mag: ['std'], muzzle: ['none'], grip: ['none'], laser: false, light: false },
  sniper: { sight: ['irons', 'acog', 'scope'], mag: ['std', 'ext'], muzzle: ['none', 'suppressor', 'comp'], grip: ['none'], laser: false, light: false },
};
export const DEFAULT_ATTACH = {};
for (const k of Object.keys(BUILD)) DEFAULT_ATTACH[k] = { sight: k === 'sniper' ? 'scope' : 'irons', mag: 'std', muzzle: 'none', grip: 'none', laser: false, light: false };
// keep only options this weapon accepts
export function normalizeAttach(type, att = {}) {
  const A = Object.assign({}, DEFAULT_ATTACH[type] || DEFAULT_ATTACH.pistol), ok = WEAPON_ATTACH[type];
  if (!ok) return A;
  for (const s of ['sight', 'mag', 'muzzle', 'grip']) if (att[s] && ok[s].includes(att[s])) A[s] = att[s];
  A.laser = !!att.laser && ok.laser; A.light = !!att.light && ok.light;
  return A;
}

const cache = new Map();
const _ax = new THREE.Vector3();
function runtime(g, info, A) {
  const ud = g.userData, parts = {};
  g.traverse((o) => { if (o !== g && o.userData?.anim) parts[o.name] = o; });
  const hide = (k, v) => Object.defineProperty(ud, k, { value: v, enumerable: false, configurable: true, writable: true });
  ud.muzzle = new THREE.Vector3(...(info.muzzle || [0, 0, 0.2])); ud.eject = info.eject ? new THREE.Vector3(...info.eject) : null;
  ud.suppressed = A.muzzle === 'suppressor'; ud.flash = ud.suppressed ? 'suppressed' : (info.flash || null); ud.optic = A.sight;
  ud.leftGrip = new THREE.Vector3(...(info.leftGrip || [0, 0, 0.1])); ud.sightLine = new THREE.Vector3(0, info.sightY ?? 0.05, -0.08);
  hide('parts', parts);
  const KEY = { slide: 'slide', bolt: 'bolt', pump: 'pump', trigger: 'trigger', hammer: 'hammer', cylinder: 'cylinder', breech: 'breech', boltHandle: 'boltHandle', magOut: 'mag', charging: 'charging', cover: 'ejectionCover' };
  hide('animate', (s) => {
    for (const k in s) {
      const p = parts[KEY[k] || k]; if (!p) continue; const a = p.userData.anim, v = s[k];
      if (a.kind === 'slide') p.position.set(a.rest[0] + a.axis[0] * a.travel * v, a.rest[1] + a.axis[1] * a.travel * v, a.rest[2] + a.axis[2] * a.travel * v);
      else if (a.kind === 'rot') p.quaternion.setFromAxisAngle(_ax.set(a.axis[0], a.axis[1], a.axis[2]), a.angle * v);
      else if (a.kind === 'bolt') { const lift = Math.min(1, v / 0.3), back = Math.max(0, (v - 0.3) / 0.7); p.quaternion.setFromAxisAngle(_ax.set(0, 0, 1), a.lift * lift); p.position.set(a.rest[0], a.rest[1], a.rest[2] - a.travel * back); }
      if (k === 'hammer' && parts.hammerR) parts.hammerR.quaternion.copy(p.quaternion);
      if (k === 'slide' && parts.bolt && !('bolt' in s)) { const ba = parts.bolt.userData.anim; parts.bolt.position.z = ba.rest[2] - ba.travel * v; }
    }
  });
  hide('magClone', () => { const m = parts.mag; if (!m) return null; const c = m.clone(); c.position.set(0, 0, 0); c.quaternion.identity(); return c; });
  hide('laser', g.getObjectByName('fx_laser') || null); hide('light', g.getObjectByName('fx_light') || null); hide('wick', g.getObjectByName('fx_wick') || null);
  let tris = 0; g.traverse((m) => { if (m.isMesh) { const ge = m.geometry; tris += (ge.index ? ge.index.count : ge.attributes.position.count) / 3; } }); ud.tris = Math.round(tris);
  return g;
}
// opts: { attachments, skin, wear (0..1), broken (bottle), lod (0 | 1) }
export function buildWeaponModel(type, opts = {}) {
  const key = BUILD[type] ? type : 'pistol';
  const A = normalizeAttach(key, opts.attachments), skin = opts.skin || 'factory', wear = opts.wear ?? 0.6, lod = opts.lod ? 1 : 0;
  const ck = [key, A.sight, A.mag, A.muzzle, A.grip, A.laser ? 1 : 0, A.light ? 1 : 0, skin, Math.round(wear * 4), opts.broken ? 1 : 0, lod].join('|');
  let proto = cache.get(ck);
  if (!proto) {
    const M = Object.assign({}, materials(skin, wear)), b = new Builder(!!lod);
    let info = {};
    try { info = BUILD[key](b, M, A, opts) || {}; } catch (e) { console.warn('[gunModels]', key, e); }
    proto = { group: b.build('weapon-' + key), info };
    cache.set(ck, proto);
  }
  const g = proto.group.clone();   // shares geometry + materials; moving parts are independent nodes
  g.userData.weapon = key; g.userData.attach = A; g.userData.skin = skin;
  return runtime(g, proto.info, A);
}
export const MODEL_KEYS = Object.keys(BUILD);
export function disposeWeaponCaches() { for (const p of cache.values()) p.group.traverse((m) => { if (m.isMesh) m.geometry.dispose(); }); cache.clear(); }

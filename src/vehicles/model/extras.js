// Per-car extras that make every car different: Southline license plates, bumper stickers, roof and bed accessories,
// cabin interior and dash clutter.  All original art drawn on canvases; geometry is cached and shared where the same
// combination repeats, so recycling traffic does not grow GPU memory.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng } from './rng.js';

// ---------------------------------------------------------------- plates (fictional state of Southline; rear plate only)
const PL = 'BCDFGHJKLMNPRSTVWXYZ'; // consonants only: no accidental words
export function plateText(seed) {
  const r = rng(seed ^ 0x51a7e), l = () => PL[r.int(PL.length)], d = () => r.int(10);
  const f = r.int(4);
  return f === 0 ? `${l()}${l()}${l()} ${d()}${l()}${d()}` : f === 1 ? `${d()}${l()}${l()} ${l()}${d()}${d()}` : f === 2 ? `${l()}${d()}${d()} ${d()}${l()}${l()}` : `${l()}${l()}${d()} ${d()}${d()}${l()}`;
}
export const PLATE_STYLES = ['standard', 'reef', 'glades', 'sunset', 'commercial', 'temp', 'classic'];
export function plateMaterial(plate) {
  const style = PLATE_STYLES[plate.style] || 'standard', text = plate.text || 'CAL 000';
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d'), grad = (a, b) => { const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  let ink = '#14305a', head = '#d2562a', sub = 'SUNSHINE COAST';
  if (style === 'standard') { c.fillStyle = grad('#fbf8ee', '#f3e3bd'); c.fillRect(0, 0, 256, 128); c.fillStyle = '#f08a2c'; c.beginPath(); c.arc(128, 128, 60, Math.PI, 0); c.fill(); c.fillStyle = 'rgba(251,248,238,0.78)'; c.fillRect(0, 40, 256, 88); c.fillStyle = '#2e8f6a'; for (const x of [22, 234]) { c.beginPath(); c.arc(x, 24, 11, 0, 7); c.fill(); } c.fillStyle = '#f2a23a'; for (const x of [22, 234]) { c.beginPath(); c.arc(x, 24, 6, 0, 7); c.fill(); } }
  else if (style === 'reef') { c.fillStyle = grad('#7fd8d8', '#1d6fa0'); c.fillRect(0, 0, 256, 128); c.fillStyle = '#ff8a6a'; for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse(20 + i * 38, 122, 14, 22 + (i % 3) * 8, 0, 0, 7); c.fill(); } ink = '#06243f'; head = '#06243f'; sub = 'PROTECT OUR REEFS'; }
  else if (style === 'glades') { c.fillStyle = grad('#eaf2d8', '#9fbf78'); c.fillRect(0, 0, 256, 128); c.strokeStyle = '#4e7a3a'; c.lineWidth = 3; for (let i = 0; i < 26; i++) { c.beginPath(); c.moveTo(i * 10, 128); c.lineTo(i * 10 + (i % 2 ? 5 : -4), 96 - (i % 5) * 4); c.stroke(); } ink = '#1e3a1c'; head = '#1e3a1c'; sub = 'RIVER OF GRASS'; }
  else if (style === 'sunset') { c.fillStyle = grad('#ffb25a', '#e0457a'); c.fillRect(0, 0, 256, 128); c.fillStyle = '#2a1238'; c.fillRect(0, 108, 256, 20); ink = '#2a1238'; head = '#fff4dc'; sub = 'THE KEYS'; }
  else if (style === 'commercial') { c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, 256, 128); ink = '#1a1a1a'; head = '#1a1a1a'; sub = 'COMMERCIAL'; }
  else if (style === 'temp') { c.fillStyle = '#fdfdf8'; c.fillRect(0, 0, 256, 128); ink = '#111'; head = '#111'; sub = 'TEMPORARY TAG  EXP 12-26'; }
  else { c.fillStyle = '#1c2b4a'; c.fillRect(0, 0, 256, 128); ink = '#f2d77a'; head = '#f2d77a'; sub = 'HORSELESS CARRIAGE'; }
  c.strokeStyle = ink; c.lineWidth = 5; c.strokeRect(4, 4, 248, 120);
  c.textAlign = 'center'; c.fillStyle = head; c.font = 'bold 22px sans-serif'; c.fillText('SOUTHLINE', 128, 30);
  c.fillStyle = ink; c.font = style === 'temp' ? 'bold 46px monospace' : 'bold 54px monospace'; c.fillText(text, 128, 92);
  c.font = 'bold 12px sans-serif'; c.fillText(sub, 128, 116);
  if (style !== 'temp') { c.fillStyle = '#e8c22a'; c.fillRect(214, 10, 30, 18); c.fillStyle = '#222'; c.font = 'bold 11px sans-serif'; c.fillText(String(1 + (text.charCodeAt(0) % 12)).padStart(2, '0') + '-27', 229, 23); }
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5, metalness: 0.25, polygonOffset: true, polygonOffsetFactor: -3 });
}

// ---------------------------------------------------------------- stickers (one shared atlas, 32 original designs)
const STICKER_DEFS = [
  ['KEY PALOMA', '#0f6f8a', '#fff'], ['I BRAKE FOR IGUANAS', '#f4e04a', '#1a1a1a'], ['PORT CASSIA BAIT & ICE', '#103a5c', '#ffd27a'], ['SALT LIFE-ISH', '#e9f4f4', '#0a6b78'],
  ['LAKE AMARO BASS CLUB', '#2c5a2a', '#f2f0d0'], ['97.3 THE TIDE', '#ff5a7a', '#fff'], ['MY OTHER CAR IS A SKIFF', '#fff', '#b3121b'], ['SAWPALM RIDGE', '#5a3a1e', '#f4dca0'],
  ['HONK IF YOU LOVE CAFECITO', '#3b1f12', '#f2c078'], ['TERN KEY DIVE CO.', '#0b2a4a', '#6fe0e0'], ['NO WAKE ZONE', '#fff', '#d9541e'], ['LOCAL 305 DOCKWORKERS', '#1a1a1a', '#f0b62a'],
  ['CITRUS FLATS FRESH', '#f39a1e', '#fff'], ['BABY IN CAR', '#ffe14a', '#111'], ['STUDENT DRIVER', '#ffe14a', '#111'], ['SOUTHLINE SURF SUPPLY', '#16c1b0', '#103040'],
  ['KP', '#fff', '#111', 'oval'], ['PC', '#fff', '#111', 'oval'], ['26.2', '#fff', '#111', 'oval'], ['TK', '#fff', '#111', 'oval'],
  ['GATORS HAVE RIGHT OF WAY', '#2f6d3a', '#fff'], ['EVERGLADES AIRBOAT TOURS', '#d8cdb0', '#3a2a12'], ['RADIO CALLE 8  1040 AM', '#b3121b', '#ffe9a0'], ['PELICAN PARKING ONLY', '#1d3f8f', '#fff'],
  ['HURRICANE SURVIVOR', '#444', '#f2f2f2'], ["HOW'S MY DRIVING? 555-0142", '#fff', '#1a1a1a'], ['MANGROVE MILE 5K', '#7c2fbf', '#fff'], ['DOMINO KINGS LITTLE HAVANA', '#101214', '#e7dcc4'],
  ['PROUD PARENT  PALM GROVE ELEM.', '#1fb5b0', '#fff'], ['BRICKELL RUN CLUB', '#101214', '#ff6a2b'], ['FISH FEAR ME', '#0e5e7a', '#fff'], ['REEF SAFE  KEEP IT BLUE', '#eaf6ff', '#0a4a7a'],
];
let _stickerMat = null; const _stickerGeo = new Map();
function stickerMat() {
  if (_stickerMat) return _stickerMat;
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const c = cv.getContext('2d');
  STICKER_DEFS.forEach(([txt, bg, fg, shape], i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 64;
    c.save(); c.translate(x, y);
    if (shape === 'oval') { c.fillStyle = bg; c.beginPath(); c.ellipse(128, 32, 70, 29, 0, 0, 7); c.fill(); c.strokeStyle = fg; c.lineWidth = 4; c.beginPath(); c.ellipse(128, 32, 64, 24, 0, 0, 7); c.stroke(); c.fillStyle = fg; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 128, 34); }
    else { c.fillStyle = bg; c.fillRect(3, 3, 250, 58); c.strokeStyle = fg; c.lineWidth = 2; c.strokeRect(7, 7, 242, 50); c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; let fs = 30; c.font = `bold ${fs}px sans-serif`; while (c.measureText(txt).width > 228 && fs > 10) { fs -= 1; c.font = `bold ${fs}px sans-serif`; } c.fillText(txt, 128, 33); }
    c.restore();
  });
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  _stickerMat = new THREE.MeshStandardMaterial({ map: tx, transparent: true, alphaTest: 0.5, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  return _stickerMat;
}
export const STICKER_COUNT = STICKER_DEFS.length;
export function stickerMeshes(list, t, A) {
  const out = [];
  for (const s of list) {
    const id = s.id % STICKER_COUNT;
    let g = _stickerGeo.get(id);
    if (!g) { g = new THREE.PlaneGeometry(0.28, 0.07); const u0 = (id % 4) / 4, v1 = 1 - Math.floor(id / 4) / 8, uv = g.attributes.uv; uv.setXY(0, u0, v1); uv.setXY(1, u0 + 0.25, v1); uv.setXY(2, u0, v1 - 0.125); uv.setXY(3, u0 + 0.25, v1 - 0.125); _stickerGeo.set(id, g); }
    const m = new THREE.Mesh(g, stickerMat());
    const where = s.where === 'glass' && !A.glassRear ? 'trunk' : s.where;
    if (where === 'glass') { m.position.set(s.u * 0.45, A.glassRear[0], A.glassRear[1] - 0.02); m.rotation.set(-0.0, Math.PI, s.rot || 0); m.scale.setScalar(0.7); }
    else if (where === 'trunk') m.position.set(s.u * A.hwRear * 0.6, A.trunkY, A.trunkZ);
    else m.position.set(s.u * A.hwRear * 0.7, A.bumperRy, A.bumperRz);
    if (where !== 'glass') { m.rotation.set(0, Math.PI, s.rot || 0); m.scale.setScalar(s.scale || 1); }
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------- vertex-colored helper
function col(g, r, gg, b) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg ?? r; a[i * 3 + 2] = b ?? r; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const rb = (sx, sy, sz, rad, x, y, z, rx = 0) => { const g = new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(rad, sx / 2.01, sy / 2.01, sz / 2.01)); if (rx) g.rotateX(rx); return g.translate(x, y, z); };
const bx = (sx, sy, sz, x, y, z, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(sx, sy, sz); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); return g.translate(x, y, z); };
const cy = (r0, r1, h, x, y, z, rx = 0, rz = 0, seg = 10) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); return g.translate(x, y, z); };

// ---------------------------------------------------------------- cabin (seats, dash, door cards, tub)
const cabinCache = new Map(), cabinMats = new Map();
const TRIMS = { clothGrey: 0x5a5c61, clothBeige: 0xa59879, clothBlack: 0x222326, leatherBlack: 0x1b1b1e, leatherTan: 0x8f6540, leatherRed: 0x74181c, leatherCream: 0xcfc1a1, vinyl: 0x34363a };
export const TRIM_IDS = Object.keys(TRIMS);
export function cabinMaterial(trim) {
  if (!cabinMats.has(trim)) cabinMats.set(trim, new THREE.MeshStandardMaterial({ color: TRIMS[trim] ?? TRIMS.clothGrey, roughness: trim.startsWith('leather') ? 0.55 : 0.9, vertexColors: true }));
  return cabinMats.get(trim);
}
export function buildCabinGeo(t, typeKey, A) {
  if (cabinCache.has(typeKey)) return cabinCache.get(typeKey);
  const P = [], { belt, yb, zA, zD, roofY } = t, sh = A.seatHalf, seatZ = zA - (t.coupe ? 1.15 : 1.25), fy = yb + 0.1, k = 0.16, pl = 0.22;
  const cabL = zA - 0.02 - (zD + 0.05), sy = Math.max(fy + 0.24, belt - 0.33), dk = 2.2; // dk: plastics keep a dark tone regardless of trim color
  const dark = (g, v = 0.1) => col(g, v * dk * 0.45, v * dk * 0.45, v * dk * 0.47);
  P.push(dark(bx(2 * sh, 0.04, cabL, 0, fy, (zA + zD) / 2), 0.05));                                            // floor
  P.push(dark(bx(2 * sh, belt - fy, 0.05, 0, (belt + fy) / 2, zA - 0.03), 0.06));                              // firewall
  P.push(dark(bx(2 * sh, Math.max(0.2, belt - fy - 0.1), 0.05, 0, (belt + fy) / 2 - 0.05, zD + 0.06), 0.08));  // rear bulkhead
  P.push(dark(rb(2 * A.dashX - 0.04, 0.24, 0.46, 0.09, 0, A.cowlY - 0.1, zA - 0.3), 0.1));                     // dashboard
  P.push(dark(rb(0.36, 0.11, 0.2, 0.05, 0.38, A.cowlY + 0.03, zA - 0.38), 0.08));                              // binnacle
  P.push(col(bx(0.26, 0.07, 0.012, 0.38, A.cowlY + 0.03, zA - 0.485, -0.3), 0.75, 0.95, 1.1));                 // gauges
  P.push(col(bx(0.2, 0.12, 0.012, 0, A.cowlY - 0.02, zA - 0.535, -0.2), 0.55, 0.85, 1.15));                    // center screen
  P.push(dark(rb(0.2, 0.2, 0.9, 0.05, 0, sy - 0.02, seatZ + 0.05), 0.12));                                     // center console
  P.push(col(cy(0.012, 0.012, 0.11, 0, sy + 0.12, seatZ + 0.3, -0.25), 0.7));                                  // shifter
  for (const sx of [1, -1]) P.push(dark(bx(0.035, belt - fy - 0.05, cabL - 0.1, sx * (sh - 0.02), (belt + fy) / 2, (zA + zD) / 2), pl)); // door cards
  for (const sx of [1, -1]) P.push(col(rb(0.06, 0.05, 0.5, 0.02, sx * (sh - 0.06), sy + 0.16, seatZ + 0.05), 0.55));  // armrests
  const backH = Math.min(0.66, (roofY - belt) * 0.5 + 0.24);
  const seat = (x, z, w) => { P.push(col(rb(w, 0.15, 0.5, 0.06, x, sy, z), 1)); P.push(col(rb(w - 0.03, backH, 0.13, 0.06, x, sy + backH / 2 - 0.02, z - 0.29, -k), 1)); if (w < 0.8) P.push(col(rb(0.25, 0.17, 0.1, 0.045, x, Math.min(sy + backH + 0.1, roofY - 0.17), z - 0.37, -k), 0.92)); };
  seat(0.38, seatZ, 0.5); seat(-0.38, seatZ, 0.5);
  // rear bench: its back must stay ahead of the rear glass base (zD), or it pokes through the deck lid
  const zRear = Math.max(seatZ - 0.95, zD + 0.48);
  if (!t.coupe && cabL > 2.1 && zRear <= seatZ - 0.68) { seat(0, zRear, 2 * sh - 0.22); for (const sx of [1, -1]) P.push(col(rb(0.25, 0.15, 0.1, 0.045, sx * 0.4, Math.min(sy + backH + 0.06, roofY - 0.3), zRear - 0.37, -k), 0.92)); }
  if (t.van && t.windows && cabL > 3.4) seat(0, seatZ - 1.9, 2 * sh - 0.22);
  if (!t.convertible) P.push(dark(bx(0.2, 0.06, 0.03, 0, roofY - 0.14, zA - 0.62), 0.1));                       // mirror
  const g = mergeGeometries(P, false);
  cabinCache.set(typeKey, g);
  return g;
}

// ---------------------------------------------------------------- dash clutter
export const DASH_ITEMS = ['tissue', 'freshener', 'dice', 'phone', 'dashcam', 'cup', 'cap', 'permit', 'bobble', 'papers', 'sunglasses', 'beads'];
const dashCache = new Map(); let _dashMat = null;
export function dashItemsMesh(ids, t, A, seed) {
  if (!ids.length) return null;
  const key = t.label + '|' + ids.join(',') + '|' + (seed % 7);
  let g = dashCache.get(key);
  if (!g) {
    const r = rng(seed % 7 + 3), P = [], y = A.cowlY + 0.025, z0 = t.zA - 0.2, mx = 0, my = t.roofY - 0.2, mz = t.zA - 0.62;
    for (const id of ids) {
      const x = r.range(-A.dashX + 0.2, A.dashX - 0.25) * (id === 'phone' ? 0.2 : 1), z = z0 - r.range(0, 0.1), hue = new THREE.Color().setHSL(r(), 0.6, 0.55);
      if (id === 'tissue') P.push(col(rb(0.22, 0.08, 0.12, 0.015, -Math.abs(x), y + 0.04, z), hue.r, hue.g, hue.b), col(bx(0.07, 0.04, 0.03, -Math.abs(x), y + 0.09, z), 1.6));
      else if (id === 'freshener') P.push(col(bx(0.06, 0.09, 0.004, mx, my - 0.09, mz, 0, 0.5), hue.r * 0.8, hue.g, hue.b * 0.6), col(cy(0.0015, 0.0015, 0.08, mx, my - 0.03, mz), 0.4));
      else if (id === 'dice') { for (const dx of [-0.025, 0.03]) P.push(col(rb(0.045, 0.045, 0.045, 0.01, mx + dx, my - 0.1 - (dx > 0 ? 0.03 : 0), mz), 1.5, 1.5, 1.4)); }
      else if (id === 'phone') P.push(col(bx(0.075, 0.15, 0.01, 0.1, y + 0.1, t.zA - 0.5, -0.3), 0.05), col(bx(0.065, 0.135, 0.004, 0.1, y + 0.1, t.zA - 0.507, -0.3), 0.6, 1.2, 1.5), col(cy(0.008, 0.008, 0.08, 0.1, y + 0.03, t.zA - 0.47), 0.1));
      else if (id === 'dashcam') P.push(col(rb(0.07, 0.04, 0.04, 0.01, -0.12, my + 0.03, mz + 0.08), 0.06));
      else if (id === 'cup') P.push(col(cy(0.035, 0.028, 0.1, 0.02, y - 0.13, t.zA - 0.95), 1.5, 1.45, 1.3), col(cy(0.037, 0.037, 0.012, 0.02, y - 0.075, t.zA - 0.95), 0.5, 0.25, 0.1));
      else if (id === 'cap') P.push(col(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y, z - 0.02), hue.r, hue.g, hue.b), col(bx(0.14, 0.008, 0.09, x, y + 0.005, z + 0.08), hue.r * 0.8, hue.g * 0.8, hue.b * 0.8));
      else if (id === 'permit') P.push(col(bx(0.07, 0.11, 0.003, mx + 0.01, my - 0.1, mz + 0.01), hue.r, hue.g, hue.b));
      else if (id === 'bobble') P.push(col(cy(0.02, 0.03, 0.05, x, y + 0.025, z), 0.4, 0.25, 0.15), col(new THREE.SphereGeometry(0.035, 8, 6).translate(x, y + 0.08, z), 1.3, 1.0, 0.75));
      else if (id === 'papers') P.push(col(bx(0.21, 0.006, 0.28, x, y + 0.004, z - 0.03, 0, 0), 1.6, 1.6, 1.5), col(bx(0.2, 0.004, 0.26, x + 0.03, y + 0.01, z - 0.02), 1.4, 1.5, 1.6));
      else if (id === 'sunglasses') P.push(col(bx(0.13, 0.03, 0.01, x, y + 0.02, z), 0.04), col(bx(0.01, 0.01, 0.1, x - 0.06, y + 0.02, z - 0.05), 0.04), col(bx(0.01, 0.01, 0.1, x + 0.06, y + 0.02, z - 0.05), 0.04));
      else if (id === 'beads') { for (let i = 0; i < 7; i++) P.push(col(new THREE.SphereGeometry(0.008, 5, 4).translate(mx + Math.sin(i - 3) * 0.012, my - 0.02 - i * 0.017, mz), hue.r, hue.g, hue.b)); }
    }
    if (!P.length) return null;
    g = mergeGeometries(P, false); dashCache.set(key, g);
  }
  _dashMat ||= new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.7, vertexColors: true });
  return new THREE.Mesh(g, _dashMat);
}

// ---------------------------------------------------------------- exterior accessories
export const ACCESSORIES = {
  roofRack: { fits: (t) => !t.convertible && !t.bed && !t.box && !t.bus && !t.wedge },
  roofBox: { fits: (t) => !t.convertible && !t.bed && !t.box && !t.bus && !t.coupe, needs: 'roofRack' },
  kayak: { fits: (t) => !t.convertible && !t.box && !t.bus && !t.coupe && !t.bed, needs: 'roofRack' },
  surfboard: { fits: (t) => !t.convertible && !t.box && !t.bus && !t.wedge && !t.bed, needs: 'roofRack' },
  ladder: { fits: (t) => !!(t.van || t.bed) },
  lightBar: { fits: (t) => !!(t.bed || t.offroad) },
  bullBar: { fits: (t) => !!(t.bed || t.offroad || t.roofRails) },
  hitch: { fits: (t) => !!(t.bed || t.offroad || t.roofRails || t.van) },
  bedBox: { fits: (t) => !!t.bed },
  bedCargo: { fits: (t) => !!t.bed },
  flag: { fits: (t) => !t.box && !t.bus },
  wing: { fits: (t) => !!t.coupe && !t.wing && !t.convertible },
};
const accCache = new Map(); let _accMat = null;
export function accessoryMesh(list, t, A, typeKey) {
  const key = typeKey + '|' + list.map((a) => a.id + (a.c ?? '')).join(',');
  let g = accCache.get(key);
  if (!g) {
    const P = [], { roofY, zB, zC, W, L, yb, belt } = t, rc = (zB + zC) / 2, rl = Math.max(0.6, (zB - zC) * 0.8), rx = A.roofHalf - 0.1, ry = roofY + 0.012;
    const ids = list.map((a) => a.id), has = (id) => ids.includes(id), zr = -L / 2, zf = L / 2;
    const rack = has('roofRack') || has('roofBox') || has('kayak') || has('surfboard') || (has('ladder') && !t.bed);
    if (rack) { for (const z of [rc + rl * 0.32, rc - rl * 0.32]) { P.push(col(rb(2 * rx + 0.16, 0.028, 0.05, 0.012, 0, ry + 0.085, z), 0.05)); for (const sx of [1, -1]) P.push(col(bx(0.04, 0.085, 0.05, sx * rx, ry + 0.042, z), 0.06)); } }
    for (const a of list) {
      const hue = new THREE.Color().setHSL(((a.c ?? 0) * 0.137) % 1, 0.75, 0.5);
      if (a.id === 'roofBox') P.push(col(rb(0.8, 0.3, Math.min(2.0, rl * 1.15), 0.12, 0.05, ry + 0.25, rc - 0.05), (a.c ?? 0) % 2 ? 0.9 : 0.06));
      else if (a.id === 'kayak') P.push(col(new THREE.SphereGeometry(1, 14, 8).scale(0.32, 0.17, Math.min(1.9, rl * 1.3)).translate(-0.15, ry + 0.27, rc), hue.r, hue.g, hue.b));
      else if (a.id === 'surfboard') P.push(col(new THREE.SphereGeometry(1, 14, 6).scale(0.26, 0.028, 1.05).translate(0.25, ry + 0.13, rc - 0.1), 1.3, 1.25, 1.05), col(bx(0.012, 0.1, 0.16, 0.25, ry + 0.19, rc - 0.95, 0.4), hue.r, hue.g, hue.b));
      else if (a.id === 'ladder') { const ly = t.bed ? belt + 0.75 : ry + 0.12, lz = t.bed ? -0.4 : rc, ll = t.bed ? 2.6 : Math.min(3.2, rl * 1.5), lx = t.bed ? 0.55 : 0.35;
        if (t.bed) for (const z of [t.zD - 0.1, zr + 0.25]) { for (const sx of [1, -1]) P.push(col(bx(0.045, 0.78, 0.045, sx * (W / 2 - 0.14), belt + 0.36, z), 0.06)); P.push(col(bx(W - 0.24, 0.045, 0.045, 0, belt + 0.73, z), 0.06)); }
        for (const sx of [1, -1]) P.push(col(bx(0.03, 0.07, ll, lx + sx * 0.19, ly, lz), 1.1, 0.6, 0.12)); for (let i = 0; i < 9; i++) P.push(col(bx(0.38, 0.025, 0.03, lx, ly, lz - ll / 2 + 0.2 + i * (ll - 0.4) / 8), 1.0, 1.0, 1.05)); }
      else if (a.id === 'lightBar') { P.push(col(rb(Math.min(1.2, 2 * rx), 0.07, 0.09, 0.02, 0, ry + 0.06, zB - 0.12), 0.05)); P.push(col(bx(Math.min(1.14, 2 * rx - 0.06), 0.045, 0.01, 0, ry + 0.06, zB - 0.07), 1.7, 1.7, 1.6)); }
      else if (a.id === 'bullBar') { for (const sx of [1, -1]) P.push(col(cy(0.028, 0.028, 0.55, sx * 0.33, yb + 0.42, zf + 0.12), 0.06)); for (const y of [0.25, 0.5, 0.68]) P.push(col(cy(0.028, 0.028, 0.95, 0, yb + y, zf + 0.12, 0, Math.PI / 2), 0.06)); }
      else if (a.id === 'hitch') { P.push(col(bx(0.07, 0.07, 0.26, 0, yb + 0.06, zr - 0.02), 0.05)); P.push(col(new THREE.SphereGeometry(0.03, 8, 6).translate(0, yb + 0.14, zr - 0.12), 1.4)); }
      else if (a.id === 'bedBox') P.push(col(rb(W - 0.3, 0.3, 0.45, 0.03, 0, belt + 0.05, t.zD - 0.35), 1.1, 1.12, 1.15));
      else if (a.id === 'bedCargo') { const r = rng((a.c ?? 1) * 77); for (let i = 0; i < 4; i++) { const h = new THREE.Color().setHSL(r(), 0.5, 0.45); P.push(col(rb(r.range(0.3, 0.6), r.range(0.2, 0.45), r.range(0.3, 0.6), 0.03, r.range(-0.45, 0.45), belt - 0.2, zr + 0.5 + i * 0.32), h.r, h.g, h.b)); } }
      else if (a.id === 'flag') { P.push(col(cy(0.004, 0.004, 0.7, -(A.roofHalf - 0.05), roofY + 0.3, zC + 0.1), 0.4)); P.push(col(bx(0.003, 0.14, 0.22, -(A.roofHalf - 0.05), roofY + 0.56, zC - 0.02), hue.r, hue.g, hue.b)); }
      else if (a.id === 'wing') { const wy = t.tailY + 0.2; P.push(col(rb(W - 0.2, 0.03, 0.26, 0.012, 0, wy, zr + 0.22), 0.05)); for (const sx of [1, -1]) P.push(col(bx(0.03, 0.2, 0.1, sx * (W / 2 - 0.45), wy - 0.1, zr + 0.24), 0.05)); }
    }
    if (!P.length) return null;
    g = mergeGeometries(P, false); accCache.set(key, g);
  }
  _accMat ||= new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.25, vertexColors: true });
  const m = new THREE.Mesh(g, _accMat); m.castShadow = true;
  return m;
}

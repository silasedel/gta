// Aircraft kit, liveries: canvas painters for lofted fuselages and lifting surfaces, invented operators, registrations, wear.
// Every operator here is original to Port Solana. When the design system publishes brands (game.design.brands) with the
// same ids, useDesignBrands() overrides names / colors so aircraft match billboards and products.
import { THREE, rng, clamp, lerp, DEG } from './core.js';

export const OPERATORS = {
  // airlines
  atlantica: { name: 'Atlantica Sur', short: 'ATLANTICA SUR', kind: 'airline', colors: ['#12305c', '#f0604a', '#f7f5ef'], scheme: 'tailwrap', font: '700 100px "Gill Sans", "Helvetica Neue", Arial', logo: 'sunwave' },
  guava: { name: 'Guava Jet', short: 'guava jet', kind: 'airline', colors: ['#ff5d8f', '#2fbf71', '#ffffff'], scheme: 'bellywave', font: '800 100px "Avenir Next", "Helvetica Neue", Arial', logo: 'guava' },
  sawgrass: { name: 'Sawgrass Regional', short: 'Sawgrass', kind: 'airline', colors: ['#1f6b45', '#f2c230', '#fbfaf4'], scheme: 'cheat', font: 'italic 700 100px Georgia, "Times New Roman", serif', logo: 'blades' },
  nordlys: { name: 'Nordlys Air', short: 'NORDLYS', kind: 'airline', colors: ['#0e1c3a', '#35d0c0', '#f6f8fa'], scheme: 'aurora', font: '300 100px "Helvetica Neue", Arial', logo: 'aurora' },
  meridiano: { name: 'Meridiano 80', short: 'MERIDIANO 80', kind: 'airline', colors: ['#00897b', '#ff8f1f', '#fdfcf8'], scheme: 'blocks', font: '800 100px Futura, "Trebuchet MS", Arial', logo: 'meridian' },
  halyard: { name: 'Halyard Cargo', short: 'HALYARD CARGO', kind: 'cargo', colors: ['#f3c11b', '#2b2f36', '#e9e9e6'], scheme: 'cargo', font: '900 100px "Arial Black", Impact, Arial', logo: 'knot' },
  // general aviation, helicopters, services
  paloma: { name: 'Paloma Seaplane Tours', short: 'PALOMA', kind: 'tours', colors: ['#1565c0', '#ffffff', '#ffb300'], scheme: 'swoop', font: 'italic 800 100px "Gill Sans", "Trebuchet MS", Arial', logo: 'dove', tagline: 'SEAPLANE TOURS' },
  bayfront: { name: 'Bayfront Heli Tours', short: 'BAYFRONT', kind: 'tours', colors: ['#00a3a3', '#ff6f61', '#ffffff'], scheme: 'swoop', font: '800 100px Futura, "Trebuchet MS", Arial', logo: 'sunwave', tagline: 'HELI TOURS' },
  skycam: { name: 'Solana 4 News', short: 'SKYCAM 4', kind: 'news', colors: ['#c8102e', '#10131a', '#ffffff'], scheme: 'news', font: 'italic 900 100px "Arial Black", Impact, Arial', logo: 'four' },
  pspd: { name: 'Southline Police', short: 'POLICE', kind: 'police', colors: ['#10213f', '#f5f5f2', '#d9a521'], scheme: 'police', font: '800 100px "Helvetica Neue", Arial', logo: 'shield', tagline: 'SOUTHLINE POLICE · AIR UNIT' },
  marine: { name: 'Solana Marine Rescue', short: 'MARINE RESCUE', kind: 'rescue', colors: ['#f25c05', '#f7f7f4', '#12305c'], scheme: 'rescue', font: '800 100px "Helvetica Neue", Arial', logo: 'anchor', tagline: 'SOLANA COUNTY' },
  medflight: { name: 'Solana MedFlight', short: 'MedFlight', kind: 'medevac', colors: ['#c8102e', '#ffffff', '#1b2a49'], scheme: 'blocks', font: 'italic 800 100px "Helvetica Neue", Arial', logo: 'cross', tagline: 'AIR AMBULANCE' },
  ternkey: { name: 'Tern Key Flying Club', short: 'TERN KEY', kind: 'club', colors: ['#d94f30', '#f4efe2', '#2a3d52'], scheme: 'cheat', font: '700 100px Georgia, serif', logo: 'tern', tagline: 'FLYING CLUB' },
  citrus: { name: 'Citrus Flats Ag Air', short: 'CITRUS FLATS', kind: 'ag', colors: ['#f2b705', '#1d5c2e', '#f5f3ea'], scheme: 'ag', font: '900 100px "Arial Black", Impact, Arial', logo: 'orange', tagline: 'AG AIR' },
  beachads: { name: 'Sky Signs of Solana', short: 'SKY SIGNS', kind: 'banner', colors: ['#e8423a', '#fff7df', '#1c4e80'], scheme: 'sunburst', font: '800 100px Futura, "Trebuchet MS", Arial', logo: 'sunwave', tagline: 'AERIAL ADS' },
  aerocayo: { name: 'Aero Cayo Charter', short: 'AERO CAYO', kind: 'charter', colors: ['#0b3954', '#bfd7ea', '#ff5a5f'], scheme: 'tailwrap', font: '600 100px "Avenir Next", "Helvetica Neue", Arial', logo: 'meridian', tagline: 'CHARTER' },
  private1: { name: 'Private', short: '', kind: 'private', colors: ['#7a1f2b', '#d9c59a', '#f3f1ea'], scheme: 'cheat', font: '700 100px Georgia, serif', logo: null },
  private2: { name: 'Private', short: '', kind: 'private', colors: ['#1d2d44', '#c0c5ce', '#eef0f2'], scheme: 'swoop', font: '700 100px Georgia, serif', logo: null },
  private3: { name: 'Private', short: '', kind: 'private', colors: ['#2e6f40', '#e8e2c8', '#f6f4ec'], scheme: 'blocks', font: '700 100px Georgia, serif', logo: null },
  private4: { name: 'Private', short: '', kind: 'private', colors: ['#111315', '#c9a227', '#2a2d31'], scheme: 'stealth', font: '700 100px Georgia, serif', logo: null },
  blimpco: { name: 'Largo Lighter-Than-Air', short: 'SUNDOWNER', kind: 'blimp', colors: ['#f4f1e8', '#1565c0', '#ff8f1f'], scheme: 'blimp', font: '800 100px Futura, "Trebuchet MS", Arial', logo: 'sunwave' },
};
export function useDesignBrands(brands) {
  if (!brands) return;
  for (const id in OPERATORS) { const b = brands[id] || brands['air_' + id]; if (b) { if (b.name) OPERATORS[id].name = b.name; if (b.palette?.length >= 3) OPERATORS[id].colors = b.palette.slice(0, 3); } }
}
export function registration(seed) {
  const R = rng(seed * 7 + 91), L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return 'N' + R.int(1, 9) + R.int(0, 9) + R.int(0, 9) + (R.chance(0.5) ? R.int(0, 9) + L[R.int(0, 23)] : L[R.int(0, 23)] + L[R.int(0, 23)]);
}

// ---------------------------------------------------------------------------------------------- logos (unit space: 1 = logo height, origin center, canvas y down)
export const LOGOS = {
  sunwave(c, col) { c.fillStyle = col[1]; c.beginPath(); c.arc(0, 0.05, 0.36, Math.PI, 0); c.fill(); c.strokeStyle = col[0]; c.lineWidth = 0.09; for (let i = 0; i < 3; i++) { c.beginPath(); for (let x = -0.5; x <= 0.5; x += 0.05) c.lineTo(x, 0.16 + i * 0.13 + Math.sin(x * 9 + i) * 0.035); c.stroke(); } },
  guava(c, col) { c.fillStyle = col[1]; c.beginPath(); c.ellipse(0, 0.03, 0.4, 0.46, 0, 0, 7); c.fill(); c.fillStyle = col[0]; c.beginPath(); c.ellipse(0, 0.05, 0.31, 0.37, 0, 0, 7); c.fill(); c.fillStyle = '#fff3'; for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse(Math.cos(i * 0.9) * 0.14, 0.05 + Math.sin(i * 0.9) * 0.17, 0.028, 0.045, i, 0, 7); c.fill(); } c.fillStyle = col[1]; c.beginPath(); c.ellipse(0.12, -0.44, 0.16, 0.07, -0.6, 0, 7); c.fill(); },
  blades(c, col) { c.strokeStyle = col[1]; c.lineCap = 'round'; for (let i = -3; i <= 3; i++) { c.lineWidth = 0.06; c.beginPath(); c.moveTo(i * 0.09, 0.45); c.quadraticCurveTo(i * 0.11, 0, i * 0.2 + 0.1, -0.4 + Math.abs(i) * 0.07); c.stroke(); } },
  aurora(c, col) { for (let i = 0; i < 4; i++) { c.strokeStyle = i % 2 ? col[1] : '#8ef0d0'; c.globalAlpha = 0.9 - i * 0.15; c.lineWidth = 0.1; c.beginPath(); c.moveTo(-0.5, 0.35 - i * 0.18); c.bezierCurveTo(-0.15, -0.25 - i * 0.1, 0.15, 0.45 - i * 0.2, 0.5, -0.3 - i * 0.05); c.stroke(); } c.globalAlpha = 1; },
  meridian(c, col) { c.strokeStyle = col[1]; c.lineWidth = 0.07; c.beginPath(); c.arc(0, 0, 0.4, 0, 7); c.stroke(); c.beginPath(); c.ellipse(0, 0, 0.17, 0.4, 0, 0, 7); c.stroke(); c.beginPath(); c.moveTo(-0.4, 0); c.lineTo(0.4, 0); c.stroke(); c.fillStyle = col[1]; c.beginPath(); c.arc(0.17, -0.12, 0.07, 0, 7); c.fill(); },
  knot(c, col) { c.strokeStyle = col[1]; c.lineWidth = 0.11; c.lineCap = 'round'; c.beginPath(); c.moveTo(-0.4, 0.3); c.bezierCurveTo(0.5, 0.3, 0.5, -0.4, 0, -0.4); c.bezierCurveTo(-0.5, -0.4, -0.5, 0.3, 0.4, 0.3); c.stroke(); },
  dove(c, col) { c.fillStyle = col[1]; c.beginPath(); c.moveTo(-0.5, 0.1); c.quadraticCurveTo(-0.1, -0.1, 0.1, -0.45); c.quadraticCurveTo(0.12, -0.1, 0.5, -0.05); c.quadraticCurveTo(0.2, 0.1, 0.1, 0.35); c.quadraticCurveTo(-0.1, 0.15, -0.5, 0.1); c.fill(); c.fillStyle = col[2]; c.beginPath(); c.arc(0.33, -0.03, 0.03, 0, 7); c.fill(); },
  four(c, col) { c.fillStyle = col[0]; c.beginPath(); c.arc(0, 0, 0.48, 0, 7); c.fill(); c.fillStyle = col[2]; c.font = 'italic 900 0.78px "Arial Black", Impact, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('4', -0.02, 0.04); },
  shield(c, col) { c.fillStyle = col[2]; c.beginPath(); c.moveTo(0, -0.48); c.lineTo(0.4, -0.34); c.quadraticCurveTo(0.42, 0.2, 0, 0.5); c.quadraticCurveTo(-0.42, 0.2, -0.4, -0.34); c.closePath(); c.fill(); c.fillStyle = col[0]; c.beginPath(); c.moveTo(0, -0.36); c.lineTo(0.3, -0.25); c.quadraticCurveTo(0.31, 0.14, 0, 0.37); c.quadraticCurveTo(-0.31, 0.14, -0.3, -0.25); c.closePath(); c.fill(); c.fillStyle = col[2]; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 1.2566; c.beginPath(); c.moveTo(Math.cos(a) * 0.17, Math.sin(a) * 0.17); c.lineTo(Math.cos(a + 2.513) * 0.17, Math.sin(a + 2.513) * 0.17); c.lineTo(Math.cos(a + 5.027) * 0.17, Math.sin(a + 5.027) * 0.17); c.fill(); } },
  anchor(c, col) { c.strokeStyle = col[2]; c.lineWidth = 0.08; c.lineCap = 'round'; c.beginPath(); c.arc(0, -0.34, 0.1, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, -0.24); c.lineTo(0, 0.42); c.moveTo(-0.2, -0.08); c.lineTo(0.2, -0.08); c.stroke(); c.beginPath(); c.arc(0, 0.08, 0.34, 0.15, Math.PI - 0.15); c.stroke(); },
  cross(c, col) { c.fillStyle = col[0]; c.fillRect(-0.14, -0.45, 0.28, 0.9); c.fillRect(-0.45, -0.14, 0.9, 0.28); c.fillStyle = col[1]; c.fillRect(-0.05, -0.34, 0.1, 0.68); },
  tern(c, col) { c.fillStyle = col[0]; c.beginPath(); c.moveTo(-0.5, -0.1); c.quadraticCurveTo(-0.2, -0.3, 0, 0); c.quadraticCurveTo(0.2, -0.3, 0.5, -0.1); c.quadraticCurveTo(0.2, -0.12, 0.05, 0.2); c.lineTo(0, 0.4); c.lineTo(-0.05, 0.2); c.quadraticCurveTo(-0.2, -0.12, -0.5, -0.1); c.fill(); },
  orange(c, col) { c.fillStyle = '#f28c0f'; c.beginPath(); c.arc(0, 0.06, 0.4, 0, 7); c.fill(); c.fillStyle = col[1]; c.beginPath(); c.ellipse(0.14, -0.38, 0.2, 0.09, -0.5, 0, 7); c.fill(); c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(-0.12, -0.06, 0.09, 0, 7); c.fill(); },
};

// ---------------------------------------------------------------------------------------------- fuselage painter
export class Livery {
  constructor(L, { w = 2048, h = 1024, base = '#f4f4f2' } = {}) {
    this.L = L; this.w = w; this.h = h; this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    this.c = this.canvas.getContext('2d'); this.c.fillStyle = base; this.c.fillRect(0, 0, w, h); this._perim = new Map();
  }
  X(z) { return this.L.zToU(z) * this.w; }
  Y(v) { return (1 - v) * this.h; }
  V(z, y, side) { return this.L.aToV(z, this.L.yToA(z, y, side)); }
  perim(z) { const k = Math.round(z * 4); if (this._perim.has(k)) return this._perim.get(k); const a = new THREE.Vector3(), b = new THREE.Vector3(); let p = 0; this.L.at(z, -180, b); for (let q = -174; q <= 180; q += 6) { this.L.at(z, q, a); p += Math.hypot(a.x - b.x, a.y - b.y); b.copy(a); } this._perim.set(k, p); return p; }
  // band between body heights y0(z)..y1(z) (numbers or functions of z) on the chosen sides, from z0 to z1
  band(y0, y1, color, { z0 = this.L.zMin, z1 = this.L.zMax, sides = 'both', n = 48 } = {}) {
    const f0 = typeof y0 === 'function' ? y0 : () => y0, f1 = typeof y1 === 'function' ? y1 : () => y1, c = this.c; c.fillStyle = color;
    for (const side of sides === 'both' ? [1, -1] : [sides === 'L' ? 1 : -1]) {
      c.beginPath();
      for (let i = 0; i <= n; i++) { const z = lerp(z0, z1, i / n); c.lineTo(this.X(z), this.Y(this.V(z, f1(z), side))); }
      for (let i = n; i >= 0; i--) { const z = lerp(z0, z1, i / n); c.lineTo(this.X(z), this.Y(this.V(z, f0(z), side))); }
      c.closePath(); c.fill();
    }
  }
  // everything below height y(z) (wraps under the belly) / above it (over the roof)
  below(y, color, opt = {}) { const f = typeof y === 'function' ? y : () => y; this.band(-99, f, color, opt); }
  above(y, color, opt = {}) { const f = typeof y === 'function' ? y : () => y; this.band(f, 99, color, opt); }
  zone(z0, z1, color) { this.c.fillStyle = color; this.c.fillRect(this.X(z0), 0, this.X(z1) - this.X(z0), this.h); }
  _place(side, z, y, hM, fn) {
    const c = this.c, sx = this.w / this.L.len, sy = this.h / this.perim(z);
    c.save(); c.translate(this.X(z), this.Y(this.V(z, y, side))); if (side > 0) c.rotate(Math.PI); c.scale(sx * hM, sy * hM); fn(c); c.restore();
  }
  // text with cap height about hM meters, centered at (z, y) on a side (+1 left, -1 right); reads correctly on both sides
  text(side, z, y, hM, str, { font = '700 100px "Helvetica Neue", Arial', color = '#111', align = 'center', outline = null, spacing = 0 } = {}) {
    this._place(side, z, y, hM, (c) => { c.scale(0.0138, 0.0138); c.font = font; c.textAlign = align; c.textBaseline = 'middle'; try { c.letterSpacing = spacing + 'px'; } catch (e) { /* older canvas */ } if (outline) { c.strokeStyle = outline; c.lineWidth = 9; c.lineJoin = 'round'; c.strokeText(str, 0, 0); } c.fillStyle = color; c.fillText(str, 0, 0); });
  }
  logo(side, z, y, hM, name, colors) { const fn = LOGOS[name]; if (fn) this._place(side, z, y, hM, (c) => fn(c, colors)); }
  // row of cabin windows (painted; airliners). Returns the list of [z, y] centers for the emissive pass.
  windowRow(y, z0, z1, pitch, wM, hM, { skip = [], color = '#1a2330' } = {}) {
    const list = [];
    for (let z = z0; z >= z1; z -= pitch) { if (skip.some(([a, b]) => z <= a && z >= b)) continue; list.push(z);
      for (const side of [1, -1]) this._place(side, z, y, 1, (c) => { c.fillStyle = '#9aa0a6'; rr(c, -wM * 0.62, -hM * 0.58, wM * 1.24, hM * 1.16, wM * 0.5); c.fill(); c.fillStyle = color; rr(c, -wM / 2, -hM / 2, wM, hM, wM * 0.42); c.fill(); c.fillStyle = 'rgba(160,190,220,0.35)'; rr(c, -wM / 2, -hM / 2, wM, hM * 0.4, wM * 0.42); c.fill(); }); }
    return list;
  }
  door(side, z, y0, y1, wM, { color = 'rgba(40,44,50,0.75)', handle = true } = {}) {
    const ym = (y0 + y1) / 2, hM = y1 - y0;
    this._place(side, z, ym, 1, (c) => { c.strokeStyle = color; c.lineWidth = 0.025; rr(c, -wM / 2, -hM / 2, wM, hM, 0.12); c.stroke(); if (handle) { c.fillStyle = color; c.fillRect(-wM * 0.3, hM * 0.12, 0.14, 0.04); } c.fillStyle = '#1a2330'; rr(c, -0.09, -hM * 0.28, 0.18, 0.26, 0.07); c.fill(); });
  }
  // wear: soot streak (z0 -> z1, aft), general grime, chipped paint on the nose, seeded
  streak(side, z0, z1, y, wM, color = 'rgba(30,26,22,0.5)') {
    const c = this.c, x0 = this.X(z0), x1 = this.X(z1), yy = this.Y(this.V((z0 + z1) / 2, y, side)), hh = wM * this.h / this.perim((z0 + z1) / 2);
    const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, color); g.addColorStop(1, 'rgba(30,26,22,0)'); c.fillStyle = g;
    c.beginPath(); c.moveTo(x0, yy - hh * 0.3); c.quadraticCurveTo((x0 + x1) / 2, yy - hh * 0.8, x1, yy - hh); c.lineTo(x1, yy + hh); c.quadraticCurveTo((x0 + x1) / 2, yy + hh * 0.8, x0, yy + hh * 0.3); c.fill();
  }
  wear(seed, k = 0.5) {
    const R = rng(seed + 17), c = this.c, { w, h } = this;
    for (let i = 0; i < 90 * k; i++) { const x = R() * w, y = R() * h, r = 20 + R() * 120; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${R.chance(0.6) ? '70,62,50' : '255,255,255'},${0.03 + R() * 0.06 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
    for (let i = 0; i < 40 * k; i++) { const x = R() * w, y = R() * h, len = 30 + R() * 160; const g = c.createLinearGradient(x, 0, x - len, 0); g.addColorStop(0, `rgba(40,34,28,${0.1 + R() * 0.14 * k})`); g.addColorStop(1, 'rgba(40,34,28,0)'); c.fillStyle = g; c.fillRect(x - len, y, len, 1.5 + R() * 3); }
    // belly grime band (v near 0 and 1)
    for (const [y0, y1] of [[h * 0.9, h], [0, h * 0.1]]) { const g = c.createLinearGradient(0, y0, 0, y1); const a = `rgba(52,46,40,${0.3 * k})`, b = 'rgba(52,46,40,0)'; g.addColorStop(0, y0 ? b : a); g.addColorStop(1, y0 ? a : b); c.fillStyle = g; c.fillRect(0, y0, w, y1 - y0); }
    // paint chips at the nose
    c.fillStyle = 'rgba(150,152,155,0.8)'; for (let i = 0; i < 70 * k; i++) c.fillRect(w - R() * R() * w * 0.05, R() * h, 1 + R() * 2.5, 1 + R() * 2);
  }
  texture() { const t = new THREE.CanvasTexture(this.canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

// ---------------------------------------------------------------------------------------------- surface painter (wings, tails)
// Canvas layout matches liftSurface uv0: left half = top surface (leading edge at x = 0), right half = bottom (leading edge at x = w).
// s = span fraction (0 root, 1 tip) -> canvas y from bottom to top.
export class SurfLivery {
  constructor({ w = 512, h = 1024, base = '#f4f4f2' } = {}) { this.w = w; this.h = h; this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h; this.c = this.canvas.getContext('2d'); this.c.fillStyle = base; this.c.fillRect(0, 0, w, h); }
  // rectangle in (s, chord fraction) space on 'top' | 'bottom' | 'both'
  rect(s0, s1, x0, x1, color, surf = 'both') {
    const c = this.c, { w, h } = this; c.fillStyle = color;
    if (surf !== 'bottom') c.fillRect(x0 * w / 2, (1 - s1) * h, (x1 - x0) * w / 2, (s1 - s0) * h);
    if (surf !== 'top') c.fillRect(w - x1 * w / 2, (1 - s1) * h, (x1 - x0) * w / 2, (s1 - s0) * h);
  }
  // polygon in (s, x) space
  poly(pts, color, surf = 'both') {
    const c = this.c, { w, h } = this; c.fillStyle = color;
    for (const sf of surf === 'both' ? ['top', 'bottom'] : [surf]) { c.beginPath(); for (const [s, x] of pts) c.lineTo(sf === 'top' ? x * w / 2 : w - x * w / 2, (1 - s) * h); c.closePath(); c.fill(); }
  }
  // text reading along the span; sizeS = glyph height as a fraction of the chord; aspect = span / chord of the surface
  text(surf, s, x, size, str, { color = '#111', font = '700 100px "Helvetica Neue", Arial', aspect = 4, rot = -Math.PI / 2, flip = false } = {}) {
    const c = this.c, { w, h } = this; c.save();
    c.translate(surf === 'top' ? x * w / 2 : w - x * w / 2, (1 - s) * h); c.rotate(rot * (flip ? -1 : 1));
    const px = size * w / 2; c.scale(px / 72 * (h / (w / 2)) / aspect, px / 72); c.font = font; c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(str, 0, 0); c.restore();
  }
  logo(surf, s, x, size, name, colors, { aspect = 2 } = {}) {
    const fn = LOGOS[name]; if (!fn) return; const c = this.c, { w, h } = this; c.save();
    c.translate(surf === 'top' ? x * w / 2 : w - x * w / 2, (1 - s) * h); const px = size * w / 2; c.rotate(-Math.PI / 2 * (surf === 'top' ? 1 : -1)); c.scale(px * (h / (w / 2)) / aspect, px); fn(c, colors); c.restore();
  }
  wear(seed, k = 0.5) {
    const R = rng(seed + 5), c = this.c, { w, h } = this;
    for (let i = 0; i < 50 * k; i++) { const x = R() * w, y = R() * h, r = 15 + R() * 70; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(60,54,46,${0.03 + R() * 0.07 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
    for (let i = 0; i < 30 * k; i++) { const y = R() * h, x0 = R() * w * 0.3; const len = 20 + R() * 90, top = R.chance(0.5); const xa = top ? x0 : w - x0; const g = c.createLinearGradient(xa, 0, xa + (top ? len : -len), 0); g.addColorStop(0, `rgba(40,34,28,${0.12 * k})`); g.addColorStop(1, 'rgba(40,34,28,0)'); c.fillStyle = g; c.fillRect(Math.min(xa, xa + (top ? len : -len)), y, len, 1.5 + R() * 2); }
    c.fillStyle = 'rgba(150,152,155,0.7)'; for (let i = 0; i < 60 * k; i++) { const top = R.chance(0.5); c.fillRect(top ? R() * R() * 8 : w - R() * R() * 8, R() * h, 1 + R() * 2, 1 + R() * 3); }   // leading-edge chips
  }
  texture() { const t = new THREE.CanvasTexture(this.canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
}

// ---------------------------------------------------------------------------------------------- scheme painters (fuselage)
// g = geometry hints in body space: { belt (window sill height), roof, belly, noseZ, tailZ, finZ (where the fin root starts), titleZ, titleY, regZ, regY }
export function paintFuselage(Lv, op, g, { seed = 1, registration: reg = 'N000PS', wearK = 0.5, titles = true, titleH = 0.3, regH = 0.2 } = {}) {
  const [c0, c1, c2] = op.colors, R = rng(seed), len = g.noseZ - g.tailZ, mid = (g.belt + g.belly) / 2, H = g.roof - g.belly;
  const c = Lv.c; c.fillStyle = c2; c.fillRect(0, 0, Lv.w, Lv.h);
  const wave = (amp, freq, ph) => (z) => amp * Math.sin((z - g.tailZ) / len * freq * Math.PI + ph);
  switch (op.scheme) {
    case 'cheat': { const y = g.belt - H * (0.1 + R() * 0.06), t = H * 0.085; Lv.band(y - t, y + t, c0); Lv.band(y - t * 2.1, y - t * 1.35, c1); Lv.band(y + t * 1.35, y + t * 1.7, c1);
      const up = (z) => y + Math.max(0, (g.finZ + len * 0.12 - z) / (len * 0.2)) ** 2 * H * 1.5; Lv.band((z) => up(z) - t, (z) => up(z) + t * 2.4, c0, { z1: g.finZ + len * 0.14 }); Lv.zone(g.tailZ, g.finZ - len * 0.04, c0); break; }
    case 'swoop': { const f = (z) => g.belly + H * (0.1 + 0.95 * Math.pow(clamp((g.noseZ - z) / len, 0, 1), 1.9)); Lv.below((z) => f(z), c0); Lv.band((z) => f(z), (z) => f(z) + H * 0.085, c2); Lv.band((z) => f(z) + H * 0.085, (z) => f(z) + H * 0.19, c1 === '#ffffff' ? op.colors[2] : c1); break; }
    case 'bellywave': { const w1 = wave(H * 0.07, 5, R() * 6); Lv.below((z) => mid - H * 0.05 + w1(z), c0); Lv.band((z) => mid - H * 0.05 + w1(z), (z) => mid + H * 0.03 + w1(z) * 1.3, c1); Lv.zone(g.tailZ, g.finZ - len * 0.02, c0); break; }
    case 'tailwrap': { const zc = g.finZ + len * 0.1; for (let i = 0; i < 2; i++) { const col = i ? c1 : c0, off = i * len * 0.045; c.fillStyle = col; c.beginPath(); c.moveTo(Lv.X(g.tailZ), 0); c.lineTo(Lv.X(zc - off), 0); c.lineTo(Lv.X(zc - off - len * 0.16), Lv.h / 2); c.lineTo(Lv.X(zc - off), Lv.h); c.lineTo(Lv.X(g.tailZ), Lv.h); c.fill(); } Lv.below(g.belly + H * 0.18, c0, { z0: g.finZ }); Lv.band(g.belly + H * 0.18, g.belly + H * 0.215, c1, { z0: g.finZ }); break; }
    case 'aurora': { Lv.zone(g.tailZ, g.finZ + len * 0.02, c0); for (let i = 0; i < 4; i++) { const w1 = wave(H * 0.16, 2.2 + i * 0.5, i * 1.3); Lv.band((z) => mid + w1(z) - H * 0.03 + i * H * 0.07, (z) => mid + w1(z) + H * 0.02 + i * H * 0.07, i % 2 ? c1 : '#8ef0d0', { z0: g.tailZ, z1: g.finZ + len * 0.42 }); } Lv.below(g.belly + H * 0.14, c0); break; }
    case 'blocks': { const zc = g.finZ + len * 0.16, sl = len * 0.1; const blk = (za, zb, col) => { c.fillStyle = col; for (const [ya, yb, d] of [[0, Lv.h / 2, 1], [Lv.h / 2, Lv.h, -1]]) { c.beginPath(); c.moveTo(Lv.X(za - (d > 0 ? sl : 0)), ya); c.lineTo(Lv.X(zb - (d > 0 ? sl : 0)), ya); c.lineTo(Lv.X(zb - (d > 0 ? 0 : sl)), yb); c.lineTo(Lv.X(za - (d > 0 ? 0 : sl)), yb); c.fill(); } }; blk(g.tailZ - sl, zc - len * 0.1, c0); blk(zc - len * 0.1, zc - len * 0.045, c1); blk(zc - len * 0.03, zc, c0); break; }
    case 'cargo': { Lv.zone(g.tailZ, g.finZ + len * 0.05, c1); Lv.below(g.belly + H * 0.3, c0); Lv.band(g.belly + H * 0.3, g.belly + H * 0.34, c1); break; }
    case 'police': { Lv.below(mid + H * 0.06, c0); Lv.band(mid + H * 0.06, mid + H * 0.1, op.colors[2]); Lv.zone(g.tailZ, g.finZ - len * 0.05, c0); break; }
    case 'rescue': { c.fillStyle = c1; c.fillRect(0, 0, Lv.w, Lv.h); Lv.zone(g.noseZ - len * 0.16, g.noseZ, c0); Lv.zone(g.tailZ, g.finZ + len * 0.02, c0); const zc = g.noseZ - len * 0.34, sl = len * 0.07;
      for (const [za, zb, col] of [[zc - len * 0.07, zc, c0], [zc - len * 0.095, zc - len * 0.075, op.colors[2]]]) { c.fillStyle = col; for (const [ya, yb, d] of [[0, Lv.h / 2, 1], [Lv.h / 2, Lv.h, -1]]) { c.beginPath(); c.moveTo(Lv.X(za - (d > 0 ? 0 : sl)), ya); c.lineTo(Lv.X(zb - (d > 0 ? 0 : sl)), ya); c.lineTo(Lv.X(zb - (d > 0 ? sl : 0)), yb); c.lineTo(Lv.X(za - (d > 0 ? sl : 0)), yb); c.fill(); } } break; }
    case 'news': { c.fillStyle = c1; c.fillRect(0, 0, Lv.w, Lv.h); const f = (z) => g.belly + H * (0.25 + 0.5 * Math.pow(clamp((z - g.tailZ) / len, 0, 1), 1.4)); Lv.band((z) => f(z), (z) => f(z) + H * 0.2, c0); Lv.band((z) => f(z) + H * 0.22, (z) => f(z) + H * 0.26, c2); break; }
    case 'ag': { c.fillStyle = c0; c.fillRect(0, 0, Lv.w, Lv.h); Lv.band(mid - H * 0.06, mid + H * 0.06, c1); Lv.band(mid + H * 0.09, mid + H * 0.12, c2); Lv.zone(g.noseZ - len * 0.06, g.noseZ, '#2a2c2f'); break; }
    case 'sunburst': { c.fillStyle = c1; c.fillRect(0, 0, Lv.w, Lv.h); for (let i = 0; i < 7; i++) { const a = (i - 3) * H * 0.2; Lv.band((z) => mid + a * (g.noseZ - z) / len - H * 0.035, (z) => mid + a * (g.noseZ - z) / len + H * 0.035, i % 2 ? op.colors[2] : c0, { z1: g.noseZ - len * 0.12 }); } Lv.zone(g.noseZ - len * 0.12, g.noseZ, c0); break; }
    case 'stealth': { c.fillStyle = c0; c.fillRect(0, 0, Lv.w, Lv.h); Lv.band(mid, mid + H * 0.025, c1); Lv.band(mid + H * 0.05, mid + H * 0.06, c1); break; }
    case 'blimp': { Lv.zone(g.tailZ, g.tailZ + len * 0.2, c1); Lv.zone(g.noseZ - len * 0.07, g.noseZ, c1); Lv.below(g.belly + H * 0.2, c1); Lv.band(g.belly + H * 0.2, g.belly + H * 0.23, op.colors[2]); break; }
    default: break;
  }
  // titles, logo and registration (both sides)
  const dark = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) < 140; };
  const bgAt = op.scheme === 'police' || op.scheme === 'cargo' ? c0 : op.scheme === 'news' || op.scheme === 'rescue' ? c1 : op.scheme === 'ag' || op.scheme === 'stealth' ? c0 : op.scheme === 'sunburst' ? c1 : c2;
  const ink = op.scheme === 'police' ? op.colors[1] : op.scheme === 'stealth' ? c1 : dark(bgAt) ? '#ffffff' : (dark(c0) ? c0 : '#15181d');
  for (const side of [1, -1]) {
    if (titles && op.short) { Lv.text(side, g.titleZ, g.titleY, titleH, op.short, { font: op.font, color: ink, outline: op.scheme === 'news' ? '#000' : null });
      if (op.tagline && g.tagY != null) Lv.text(side, g.titleZ, g.tagY, titleH * 0.36, op.tagline, { font: '600 100px "Helvetica Neue", Arial', color: ink, spacing: 6 });
      if (op.logo && g.logoZ != null) Lv.logo(side, g.logoZ, g.logoY ?? g.titleY, g.logoH ?? titleH * 1.9, op.logo, op.colors); }
    const regBg = g.regOnColor ? c0 : c2;
    Lv.text(side, g.regZ, g.regY, regH, reg, { font: '700 100px "Helvetica Neue", Arial', color: g.regInk || (dark(g.regBg || (op.scheme === 'ag' || op.scheme === 'stealth' || op.scheme === 'news' || op.scheme === 'rescue' ? bgAt : regBg)) ? '#ffffff' : '#15181d') });
  }
  Lv.wear(seed, wearK);
  return Lv;
}
// Wings and tail surfaces in the operator's colors. kind: 'wing' | 'htail' | 'fin'.
export function paintSurface(op, kind, { seed = 1, registration: reg = '', wearK = 0.5, side = 1, aspect = 4, logoH = 0.6 } = {}) {
  const [c0, c1, c2] = op.colors, S = new SurfLivery({ base: ['police', 'ag', 'stealth'].includes(op.scheme) && kind !== 'wing' ? c0 : op.scheme === 'ag' || op.scheme === 'stealth' ? c0 : op.scheme === 'news' ? c1 : c2 });
  if (kind === 'fin') {
    const full = ['tailwrap', 'aurora', 'cargo', 'bellywave', 'police', 'blimp'].includes(op.scheme);
    if (full) S.rect(0, 1, 0, 1, op.scheme === 'cargo' ? c1 : c0);
    else if (op.scheme === 'blocks' || op.scheme === 'rescue') { S.poly([[0, 0], [1, 0], [1, 1], [0.45, 1], [0, 0.4]], c0); S.poly([[0, 0.4], [0.45, 1], [0.3, 1], [0, 0.6]], c1); }
    else if (op.scheme === 'cheat' || op.scheme === 'swoop' || op.scheme === 'sunburst') { S.rect(0.55, 1, 0, 1, c0); S.rect(0.47, 0.52, 0, 1, c1 === '#ffffff' ? op.colors[2] : c1); }
    if (op.logo) { S.logo('top', 0.58, 0.45, logoH, op.logo, full ? [c2, c1, c2] : op.colors, { aspect }); S.logo('bottom', 0.58, 0.45, logoH, op.logo, full ? [c2, c1, c2] : op.colors, { aspect }); }
  } else {
    const tipCol = op.scheme === 'stealth' ? c1 : c0;
    S.rect(0.9, 1.0, 0, 1, tipCol); if (op.scheme !== 'stealth') S.rect(0.86, 0.885, 0, 1, c1 === '#ffffff' ? op.colors[2] : c1);
    if (kind === 'wing') { S.rect(0, 0.16, 0.12, 0.7, 'rgba(40,42,46,0.55)', 'top'); S.rect(0, 1, 0, 0.035, 'rgba(180,182,186,0.5)');   // walkway, leading-edge strip
      if (reg) S.text(side > 0 ? 'bottom' : 'top', 0.55, 0.5, 0.42, reg, { aspect, color: op.scheme === 'ag' || op.scheme === 'stealth' ? '#ffffff' : '#15181d', flip: side < 0 }); }
  }
  S.wear(seed, wearK);
  return S.texture();
}
export function pickOperator(kindList, seed) { const R = rng(seed * 13 + 3); const ids = Object.keys(OPERATORS).filter((id) => kindList.includes(OPERATORS[id].kind)); return ids.length ? ids[Math.floor(R() * ids.length)] : 'private1'; }

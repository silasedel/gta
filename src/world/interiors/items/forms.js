// Product forms: the shared geometry of every kind of physical item (can, bottle, chip bag, carton, hot dog ...).
// One form = one BufferGeometry reused by every product of that shape; the product's own look comes from its atlas cell.
// Cell layout (uv, v up): the lower 80 % is the label art, the top 20 % is four color swatches (cap / body or liquid / secondary / metal or dark).
// Models sit on y = 0, origin at the bottom center, front toward +Z, real-world meters.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LV = 0.8;
export const uvL = (u, v) => [u, v * LV];                      // into the label art
export const uvS = (i) => [(i + 0.5) / 4, LV + (1 - LV) / 2];   // swatch i (0 cap, 1 body, 2 secondary, 3 metal/dark)

export class FormBuilder {
  constructor() { this.parts = []; }
  // geometry + matrix; uv: number (swatch) | fn(u, v, pos, normal) -> [u, v]
  geo(g, m, uv) {
    g = g.index ? g.toNonIndexed() : g.clone(); if (m) g.applyMatrix4(m); const U = g.attributes.uv, P = g.attributes.position, N = g.attributes.normal, p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { let r; if (typeof uv === 'number') r = uvS(uv); else { p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); r = uv(U.getX(i), U.getY(i), p, n); } U.setXY(i, r[0], r[1]); }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); this.parts.push(g); return this;
  }
  box(sx, sy, sz, x, y, z, uv, rot) { const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot?.[0] || 0, rot?.[1] || 0, rot?.[2] || 0)).setPosition(x, y, z); return this.geo(new THREE.BoxGeometry(sx, sy, sz), m, uv); }
  cyl(r1, r0, h, x, y, z, uv, seg = 14, rot, open = false) { const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot?.[0] || 0, rot?.[1] || 0, rot?.[2] || 0)).setPosition(x, y, z); return this.geo(new THREE.CylinderGeometry(r1, r0, h, seg, 1, open), m, uv); }
  sphere(r, x, y, z, uv, seg = 10, scale) { const m = new THREE.Matrix4().makeScale(scale?.[0] || 1, scale?.[1] || 1, scale?.[2] || 1).setPosition(x, y, z); return this.geo(new THREE.SphereGeometry(r, seg, Math.max(5, Math.round(seg * 0.7))), m, uv); }
  // surface of revolution [[r, y], ...]; uv(u around with the front at 0.5, y, r)
  lathe(pts, uv, seg = 16) { const g = new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(Math.max(1e-4, q[0]), q[1])), seg); g.rotateY(Math.PI); return this.geo(g, null, typeof uv === 'number' ? uv : (u, v, p) => uv(u, p.y, Math.hypot(p.x, p.z))); }
  done(meta = {}) { const g = mergeGeometries(this.parts, false); g.computeBoundingBox(); const b = g.boundingBox; g.userData = { size: { w: b.max.x - b.min.x, h: b.max.y - b.min.y, d: b.max.z - b.min.z }, shared: true, ...meta }; this.parts.length = 0; return g; }
}
// label wrap for a band of a lathe: y in [y0, y1] maps to label v 0..1, u around the full label; outside -> swatch
const band = (y0, y1, sw = 1) => (u, y) => (y >= y0 - 1e-4 && y <= y1 + 1e-4 ? uvL(u, (y - y0) / (y1 - y0)) : uvS(sw));
const flatFace = (axis, w, h, u0 = 0, u1 = 1, sw = 1) => (u, v, p, n) => { if (axis === 'z' ? n.z > 0.5 : axis === 'y' ? n.y > 0.5 : n.x > 0.5) return uvL(u0 + (u1 - u0) * (axis === 'y' ? p.x / w + 0.5 : axis === 'z' ? p.x / w + 0.5 : p.z / w + 0.5), axis === 'y' ? 0.5 - p.z / h : p.y / h); return uvS(sw); };

const FORMS = new Map(), CACHE = new Map();
export function registerForm(name, def) { FORMS.set(name, def); } // def: { build(F, p) -> geometry, aspect (label w/h), px (label height in pixels) }
export function formDef(name) { return FORMS.get(name); }
export function formGeometry(name, params) { const key = name + ':' + JSON.stringify(params || {}); let g = CACHE.get(key); if (!g) { const d = FORMS.get(name); if (!d) throw new Error('unknown product form ' + name); g = d.build(new FormBuilder(), params || {}); g.userData.form = name; CACHE.set(key, g); } return g; }

// ---------------------------------------------------------------- cylinders
registerForm('can', { aspect: 2.2, px: 150, build(F, p) { const r = p.r || 0.033, h = p.h || 0.122; // aluminum can: tapered shoulder, recessed lid with tab
  F.lathe([[r * 0.78, 0], [r * 0.97, 0.006], [r, 0.012], [r, h - 0.014], [r * 0.82, h - 0.002], [r * 0.82, h]], band(0.004, h - 0.01, 3)); F.cyl(r * 0.8, r * 0.8, 0.001, 0, h - 0.004, 0, 3, 14); F.cyl(r * 0.84, r * 0.84, 0.004, 0, h - 0.001, 0, 3, 14, null, true); F.box(r * 0.3, 0.0015, r * 0.55, 0, h - 0.002, r * 0.2, 3); return F.done({ hold: 'can' }); } });
registerForm('tin', { aspect: 2.4, px: 130, build(F, p) { const r = p.r || 0.037, h = p.h || 0.11; F.lathe([[r, 0], [r * 1.02, 0.003], [r, 0.006], [r, h - 0.006], [r * 1.02, h - 0.003], [r, h]], band(0.008, h - 0.008, 3)); F.cyl(r, r, 0.001, 0, h, 0, 3, 14); return F.done({ hold: 'can' }); } });
registerForm('bottle', { aspect: 2.2, px: 150, build(F, p) { const r = p.r || 0.035, h = p.h || 0.225, nr = r * 0.4, l0 = h * (p.l0 ?? 0.3), l1 = h * (p.l1 ?? 0.62); // PET soda bottle: petaloid base, label band, shoulder, neck, cap
  F.lathe([[r * 0.55, 0], [r * 0.95, 0.012], [r, 0.03], [r * 0.93, h * 0.2], [r, l0], [r, l1], [r * 0.96, h * 0.7], [r * 0.6, h * 0.84], [nr, h * 0.9], [nr, h - 0.016]], band(l0, l1, 1));
  F.cyl(nr * 1.18, nr * 1.18, 0.018, 0, h - 0.009, 0, 0, 12); F.cyl(nr * 1.3, nr * 1.3, 0.004, 0, h - 0.022, 0, 0, 12); return F.done({ hold: 'bottle' }); } });
registerForm('glassbottle', { aspect: 2.0, px: 130, build(F, p) { const r = p.r || 0.03, h = p.h || 0.23, nr = r * 0.42; // longneck: body label + neck label (same art, upper strip)
  F.lathe([[r * 0.9, 0], [r, 0.008], [r, h * 0.5], [r * 0.9, h * 0.58], [nr * 1.1, h * 0.76], [nr, h * 0.8], [nr, h - 0.012], [nr * 1.12, h - 0.01], [nr * 1.12, h]], (u, y) => (y > h * 0.1 && y < h * 0.46 ? uvL(u, (y - h * 0.1) / (h * 0.36) * 0.8) : y > h * 0.8 && y < h * 0.93 ? uvL(u, 0.82 + (y - h * 0.8) / (h * 0.13) * 0.18) : uvS(1)));
  F.cyl(nr * 1.18, nr * 1.18, 0.008, 0, h - 0.003, 0, 0, 12); return F.done({ hold: 'bottle' }); } });
registerForm('cup', { aspect: 2.0, px: 130, build(F, p) { const r1 = p.r1 || 0.045, r0 = p.r0 || 0.03, h = p.h || 0.12; // paper cup with lid (coffee) or dome lid + straw (fountain)
  F.lathe([[r0, 0], [r0, 0.002], [r1, h]], band(0.004, h - 0.004, 1)); F.cyl(r0, r0, 0.001, 0, 0.001, 0, 1, 12);
  if (p.lid === 'dome') { F.lathe([[r1 * 1.04, h - 0.004], [r1 * 1.04, h + 0.004], [r1 * 0.9, h + 0.02], [r1 * 0.45, h + 0.03], [0.006, h + 0.031]], 0); F.cyl(0.0035, 0.0035, 0.09, r1 * 0.2, h + 0.05, 0, 2, 6, [0, 0, -0.12]); }
  else if (p.lid !== 'none') { F.lathe([[r1 * 1.05, h - 0.006], [r1 * 1.05, h + 0.003], [r1 * 0.94, h + 0.011], [r1 * 0.9, h + 0.011], [r1 * 0.86, h + 0.005], [0.002, h + 0.005]], 0); F.box(0.012, 0.004, 0.007, 0, h + 0.012, r1 * 0.72, 0); }
  if (p.sleeve) F.cyl(r1 * 0.93 + 0.0015, r0 + (r1 - r0) * 0.38 + 0.0015, h * 0.42, 0, h * 0.58, 0, 2, 16, null, true); return F.done({ hold: 'cup' }); } });
registerForm('tub', { aspect: 2.4, px: 120, build(F, p) { const r = p.r || 0.047, h = p.h || 0.1; F.lathe([[r * 0.88, 0], [r, h - 0.014]], band(0.003, h - 0.016, 1)); F.cyl(r * 0.88, r * 0.88, 0.001, 0, 0.001, 0, 1, 14); F.cyl(r * 1.04, r * 1.04, 0.016, 0, h - 0.008, 0, 0, 16); return F.done({ hold: 'cup' }); } });
registerForm('jar', { aspect: 2.2, px: 120, build(F, p) { const r = p.r || 0.04, h = p.h || 0.13; F.lathe([[r * 0.9, 0], [r, 0.008], [r, h * 0.78], [r * 0.82, h * 0.86], [r * 0.82, h - 0.02]], band(h * 0.12, h * 0.72, 1)); F.cyl(r * 0.88, r * 0.88, 0.022, 0, h - 0.011, 0, 0, 14); return F.done({ hold: 'can' }); } });
// ---------------------------------------------------------------- boxes and cartons
registerForm('box', { aspect: 2.0, px: 170, build(F, p) { const w = p.w || 0.19, h = p.h || 0.28, d = p.d || 0.06; // front = left half of the label, back = right half; sides repeat the edge color
  F.geo(new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().makeTranslation(0, h / 2, 0), (u, v, pos, n) => (n.z > 0.5 ? uvL(u * 0.5, v) : n.z < -0.5 ? uvL(0.5 + u * 0.5, v) : n.y > 0.5 ? uvL(0.02 + u * 0.46, 0.97) : Math.abs(n.x) > 0.5 ? uvL(0.01, v) : uvS(3))); return F.done({ hold: 'hand' }); } });
registerForm('carton', { aspect: 1.6, px: 170, build(F, p) { const w = p.w || 0.095, h = p.h || 0.24, gh = w * 0.42, bh = h - gh; // gable-top carton: four label faces around, folded top
  F.geo(new THREE.BoxGeometry(w, bh, w), new THREE.Matrix4().makeTranslation(0, bh / 2, 0), (u, v, pos, n) => (n.z > 0.5 ? uvL(u * 0.25, v * 0.82) : n.x > 0.5 ? uvL(0.25 + u * 0.25, v * 0.82) : n.z < -0.5 ? uvL(0.5 + u * 0.25, v * 0.82) : n.x < -0.5 ? uvL(0.75 + u * 0.25, v * 0.82) : uvS(2)));
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0.004, gh), new THREE.Vector2(-0.004, gh)]), g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-w / 2, bh, 0);
  F.geo(g, null, (u, v, pos, n) => (Math.abs(n.z) > 0.3 ? uvL(n.z > 0 ? 0.125 : 0.625, 0.84 + (pos.y - bh) / gh * 0.16) : uvS(2))); F.box(w * 0.98, 0.018, 0.006, 0, h + 0.006, 0, 2); if (p.spout) F.cyl(0.014, 0.014, 0.012, 0, bh + gh * 0.45, w * 0.26, 0, 10, [1.0, 0, 0]); return F.done({ hold: 'hand' }); } });
registerForm('jug', { aspect: 1.5, px: 150, build(F, p) { const w = p.w || 0.15, h = p.h || 0.25, r = w / 2; // gallon jug: rounded body, label on the front, handle, cap
  F.lathe([[r * 0.85, 0], [r, 0.012], [r, h * 0.62], [r * 0.82, h * 0.74], [r * 0.3, h * 0.9], [r * 0.26, h - 0.02]], (u, y) => (u > 0.2 && u < 0.8 && y > h * 0.12 && y < h * 0.58 ? uvL((u - 0.2) / 0.6, (y - h * 0.12) / (h * 0.46)) : uvS(1)), 8);
  F.cyl(r * 0.3, r * 0.3, 0.022, 0, h - 0.01, 0, 0, 10); F.box(0.02, h * 0.3, 0.03, 0, h * 0.72, -r * 0.72, 1, [0.45, 0, 0]); return F.done({ hold: 'bottle' }); } });
registerForm('pack', { aspect: 1.7, px: 90, build(F, p) { const w = p.w || 0.055, h = p.h || 0.088, d = p.d || 0.022; F.geo(new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().makeTranslation(0, h / 2, 0), (u, v, pos, n) => (n.z > 0.5 ? uvL(u * 0.5, v) : n.z < -0.5 ? uvL(0.5 + u * 0.5, v) : uvL(0.02, 0.5))); return F.done({ hold: 'pinch' }); } });
registerForm('case', { aspect: 2.6, px: 200, build(F, p) { const w = p.w || 0.4, h = p.h || 0.125, d = p.d || 0.265; // 12-pack fridge box: label on the long faces and the top
  F.geo(new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().makeTranslation(0, h / 2, 0), (u, v, pos, n) => (Math.abs(n.z) > 0.5 ? uvL(u * 0.6, v * 0.5) : n.y > 0.5 ? uvL(u * 0.6, 0.5 + v * 0.5) : Math.abs(n.x) > 0.5 ? uvL(0.62 + u * 0.38, v * 0.5) : uvS(2))); F.box(0.09, 0.004, 0.03, 0, h + 0.001, 0, 3); return F.done({ hold: 'two-hands' }); } });
// ---------------------------------------------------------------- flexible packs
function pillow(F, w, h, d, crimp, lay) { // heat-sealed bag: bulged front and back from a grid, crimped ends
  const nx = 6, ny = 8, pos = [], uv = [], nor = [], idx = [];
  for (const s of [1, -1]) { const base = pos.length / 3; for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const u = i / nx, v = j / ny, ex = Math.sin(u * Math.PI), ey = Math.min(1, Math.min(v, 1 - v) / crimp); const bz = d / 2 * Math.pow(ex, 0.6) * Math.pow(Math.sin(Math.min(1, ey) * Math.PI / 2), 0.7) * (1 - 0.25 * Math.pow(Math.abs(v - 0.42) * 2, 2));
      pos.push((u - 0.5) * w * (1 - 0.04 * Math.sin(v * Math.PI)), v * h, s * bz); nor.push(0, 0, s); uv.push(...uvL(s > 0 ? u * 0.5 : 1 - u * 0.5, v)); }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = base + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1; if (s > 0) idx.push(a, b, e, a, e, c); else idx.push(a, e, b, a, c, e); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (lay) { g.rotateX(-Math.PI / 2); g.translate(0, d / 2, h / 2); } F.parts.push(g.toNonIndexed());
}
registerForm('bag', { aspect: 1.5, px: 190, build(F, p) { pillow(F, p.w || 0.19, p.h || 0.26, p.d || 0.07, 0.1, false); return F.done({ hold: 'hand' }); } });
registerForm('bar', { aspect: 5.6, px: 64, build(F, p) { const w = p.w || 0.045, h = p.h || 0.14, d = p.d || 0.02; pillow(F, w, h, d, 0.08, true); const g = F.parts.pop(); g.rotateY(Math.PI / 2); // lies on its back, long side along x; label reads along the bar
  const U = g.attributes.uv; for (let i = 0; i < U.count; i++) { const u = U.getX(i), v = U.getY(i) / LV; if (u <= 0.5) U.setXY(i, v, LV * 0.5 + u * LV); else U.setXY(i, v, (1 - u) * LV); } F.parts.push(g); return F.done({ hold: 'pinch' }); } });
registerForm('pouch', { aspect: 1.5, px: 150, build(F, p) { const w = p.w || 0.15, h = p.h || 0.2; pillow(F, w, h, p.d || 0.03, 0.06, false); F.box(w, 0.03, 0.003, 0, h + 0.014, 0, 2); return F.done({ hold: 'hand' }); } });
registerForm('flat', { aspect: 1.5, px: 170, build(F, p) { const w = p.w || 0.21, h = p.h || 0.275, t = p.t || 0.004; // magazine / card / ticket: stands upright (planograms tilt or lay it)
  F.geo(new THREE.BoxGeometry(w, h, t), new THREE.Matrix4().makeTranslation(0, h / 2, 0), (u, v, pos, n) => (n.z > 0.5 ? uvL(u * 0.5, v) : n.z < -0.5 ? uvL(0.5 + u * 0.5, v) : uvS(2))); return F.done({ hold: 'pinch' }); } });
registerForm('blister', { aspect: 1.5, px: 130, build(F, p) { const w = p.w || 0.09, h = p.h || 0.15; F.geo(new THREE.BoxGeometry(w, h, 0.002), new THREE.Matrix4().makeTranslation(0, h / 2, 0), (u, v, pos, n) => (n.z > 0.5 ? uvL(u * 0.5, v) : n.z < -0.5 ? uvL(0.5 + u * 0.5, v) : uvS(2))); F.box(w * 0.6, h * 0.5, 0.022, 0, h * 0.36, 0.012, 1); return F.done({ hold: 'pinch' }); } });
// ---------------------------------------------------------------- food
registerForm('sausage', { aspect: 2, px: 64, build(F, p) { const r = p.r || 0.013, l = p.l || 0.15; // roller-grill hot dog / taquito: lies along x; label art is its skin
  const g = new THREE.CapsuleGeometry(r, l - 2 * r, 4, 10); g.rotateZ(Math.PI / 2); g.translate(0, r, 0); F.geo(g, null, (u, v) => uvL(u, v)); return F.done({ hold: 'pinch', food: true }); } });
registerForm('hotdog', { aspect: 2, px: 96, build(F, p) { const l = 0.155; // bun, sausage, mustard zigzag: swatches 0 bun crust, 1 bun crumb, 2 mustard; sausage skin from the label
  for (const s of [-1, 1]) { const g = new THREE.CapsuleGeometry(0.019, l - 0.05, 4, 10); g.rotateZ(Math.PI / 2); g.scale(1, 1.05, 0.8); g.rotateX(s * 0.42); g.translate(0, 0.022, s * 0.017); F.geo(g, null, (u, v, pos, n) => (n.y > 0.55 && Math.abs(pos.z) < 0.012 ? uvS(1) : uvS(0))); }
  const sg = new THREE.CapsuleGeometry(0.0115, l - 0.01, 4, 10); sg.rotateZ(Math.PI / 2); sg.translate(0, 0.036, 0); F.geo(sg, null, (u, v) => uvL(u, v));
  if (p.mustard !== false) { const pts = []; for (let i = 0; i <= 18; i++) pts.push(new THREE.Vector3(-l * 0.42 + i * l * 0.84 / 18, 0.0475 + (i % 2 ? 0.0006 : 0), (i % 2 ? 1 : -1) * 0.006)); F.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 54, 0.0022, 5), null, 2); } return F.done({ hold: 'hand', food: true }); } });
registerForm('donut', { aspect: 1, px: 96, build(F, p) { const g = new THREE.TorusGeometry(0.03, 0.017, 10, 20); g.rotateX(Math.PI / 2); g.scale(1, 0.85, 1); g.translate(0, 0.0145, 0); F.geo(g, null, (u, v, pos, n) => (n.y > 0.25 ? uvL(pos.x / 0.1 + 0.5, pos.z / 0.1 + 0.5) : uvS(0))); return F.done({ hold: 'pinch', food: true }); } });
registerForm('slice', { aspect: 1, px: 110, build(F, p) { const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.075, 0.2), new THREE.Vector2(-0.075, 0.2)]), g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.1); // pizza slice lying flat, tip toward +z
  F.geo(g, null, (u, v, pos, n) => (n.y > 0.5 ? uvL(pos.x / 0.16 + 0.5, 0.5 - pos.z / 0.21) : uvS(0))); const c = new THREE.CapsuleGeometry(0.011, 0.14, 3, 8); c.rotateZ(Math.PI / 2); c.translate(0, 0.012, -0.1); F.geo(c, null, 0); return F.done({ hold: 'hand', food: true }); } });
registerForm('wedge', { aspect: 1.6, px: 120, build(F, p) { const s = new THREE.Shape([new THREE.Vector2(-0.085, 0), new THREE.Vector2(0.085, 0), new THREE.Vector2(-0.085, 0.085)]), g = new THREE.ExtrudeGeometry(s, { depth: 0.075, bevelEnabled: false }); g.translate(0, 0, -0.0375); // sandwich wedge pack
  F.geo(g, null, (u, v, pos, n) => (n.z > 0.5 ? uvL((pos.x + 0.085) / 0.17 * 0.5, pos.y / 0.085) : n.x > 0.2 ? uvL(0.5 + (pos.z + 0.0375) / 0.075 * 0.5, (pos.y) / 0.085) : uvS(2))); return F.done({ hold: 'hand', food: true }); } });
registerForm('loaf', { aspect: 2, px: 110, build(F, p) { const g = new THREE.CapsuleGeometry(p.r || 0.05, p.l || 0.2, 5, 12); g.rotateZ(Math.PI / 2); g.scale(1, 0.9, 1); g.translate(0, (p.r || 0.05) * 0.9, 0); F.geo(g, null, (u, v) => uvL(u, v)); return F.done({ hold: 'hand', food: true }); } });
registerForm('roll', { aspect: 2.5, px: 80, build(F, p) { const r = p.r || 0.055, h = p.h || 0.1; F.cyl(r, r, h, 0, h / 2, 0, (u, v, pos, n) => (Math.abs(n.y) > 0.5 ? uvS(1) : uvL(u, v)), 16); F.cyl(r * 0.36, r * 0.36, h + 0.001, 0, h / 2, 0, 2, 10); return F.done({ hold: 'hand' }); } });
registerForm('icebag', { aspect: 1.4, px: 170, build(F, p) { pillow(F, 0.3, 0.46, 0.13, 0.08, true); return F.done({ hold: 'two-hands' }); } });
registerForm('lighter', { aspect: 1.2, px: 64, build(F) { F.geo(new THREE.CapsuleGeometry(0.0085, 0.05, 3, 8), new THREE.Matrix4().makeScale(1.35, 1, 0.75).setPosition(0, 0.034, 0), (u, v) => uvL(u, v)); F.box(0.016, 0.014, 0.011, 0, 0.074, 0, 3); return F.done({ hold: 'pinch' }); } });
registerForm('shades', { aspect: 2, px: 64, build(F) { for (const s of [-1, 1]) { F.box(0.058, 0.04, 0.004, s * 0.034, 0.03, 0, 1); F.box(0.004, 0.012, 0.13, s * 0.066, 0.042, -0.065, 0); } F.box(0.016, 0.008, 0.004, 0, 0.04, 0, 0); return F.done({ hold: 'pinch', wear: 'eyes' }); } });
export { LV, band, flatFace };

// Wheels: 16 original rim designs as real geometry, tires with a lathe-turned profile and bump-mapped tread.
// buildWheel() returns shared, cached geometry per (radius, width, style, tire kind); materials come from materials.js.
// Wheel space: spins about local X, outer face toward +X, origin at the wheel center.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sharedMats } from './materials.js';

export const WHEEL_STYLES = [
  { id: 'star5', label: '5-spoke star', tags: ['sport', 'std'] },
  { id: 'split5', label: 'Split 5-spoke', tags: ['sport', 'lux'] },
  { id: 'six', label: '6-spoke', tags: ['std', 'truck'] },
  { id: 'twin7', label: '7 twin-spoke', tags: ['lux', 'std'] },
  { id: 'multi10', label: '10-spoke', tags: ['sport', 'std'] },
  { id: 'multi15', label: '15-spoke', tags: ['lux'] },
  { id: 'mesh', label: 'Cross-lace mesh', tags: ['sport', 'lux', 'classic'] },
  { id: 'turbine', label: 'Turbine', tags: ['sport', 'lux'] },
  { id: 'slot4', label: '4-slot dish', tags: ['classic', 'muscle'] },
  { id: 'slot5', label: '5-slot rally', tags: ['classic', 'muscle', 'truck'] },
  { id: 'deep5', label: 'Deep-dish 5', tags: ['muscle', 'sport'] },
  { id: 'steel', label: 'Steel wheel', tags: ['cheap', 'work'] },
  { id: 'hubcap', label: 'Full wheel cover', tags: ['cheap', 'std'] },
  { id: 'truck8', label: '8-hole truck', tags: ['truck', 'work', 'heavy'] },
  { id: 'aero', label: 'Aero disc', tags: ['ev', 'std'] },
  { id: 'wire', label: 'Wire spoke', tags: ['classic', 'lux'] },
  { id: 'beadlock', label: 'Beadlock 6', tags: ['truck', 'offroad'] },
];
export const wheelStyleIds = WHEEL_STYLES.map((s) => s.id);

function colored(g, c) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c; a[i * 3 + 1] = c; a[i * 3 + 2] = c; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const toAxisX = (g) => g.rotateY(Math.PI / 2); // shape z (extrusion) -> +x
function extr(shape, depth, bevel = 0.004, curve = 10) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: curve });
}
// one spoke as a tapered, optionally swept blade from radius r0 to r1 (in the wheel plane), extruded along the axis
function spoke(r0, r1, w0, w1, depth, sweep = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w0, r0); s.lineTo(w0, r0);
  s.quadraticCurveTo(w0 * 0.8 + sweep * 0.6, (r0 + r1) / 2, w1 + sweep, r1);
  s.lineTo(-w1 + sweep, r1);
  s.quadraticCurveTo(-w0 * 0.8 + sweep * 0.6, (r0 + r1) / 2, -w0, r0);
  return toAxisX(extr(s, depth, Math.min(0.005, w1 * 0.4)));
}
function discWithHoles(r1, holes, depth) {
  const s = new THREE.Shape(); s.absarc(0, 0, r1, 0, Math.PI * 2, false);
  for (const h of holes) { const p = new THREE.Path(); p.absellipse(h[0], h[1], h[2], h[3], 0, Math.PI * 2, true, h[4] || 0); s.holes.push(p); }
  return toAxisX(extr(s, depth, 0.003, 20));
}
const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg).rotateZ(-Math.PI / 2);

// concave face: pull vertices toward the hub inward along the axis
function dish(g, r1, amount) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const rad = Math.hypot(p.getY(i), p.getZ(i)); p.setX(i, p.getX(i) - amount * Math.pow(Math.max(0, 1 - rad / r1), 1.3)); }
  return g;
}

const cache = new Map();
let _tireBump = null, _tireMat = null, _rimMats = new Map();
function tireBump() {
  if (_tireBump) return _tireBump;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#808080'; c.fillRect(0, 0, 64, 256);
  // v 0..1 runs across the profile (13 points): sidewall | shoulder | tread (about 0.36..0.64) | shoulder | sidewall
  const y0 = 256 * 0.335, y1 = 256 * 0.665;
  c.fillStyle = '#b0b0b0'; c.fillRect(0, y0, 64, y1 - y0);
  c.fillStyle = '#303030';
  for (const f of [0.3, 0.5, 0.7]) c.fillRect(0, y0 + (y1 - y0) * f - 3, 64, 6);                 // circumferential grooves
  c.lineWidth = 5; c.strokeStyle = '#303030';
  for (const [a, b] of [[0, 0.3], [0.7, 1]]) { c.beginPath(); c.moveTo(8, y0 + (y1 - y0) * a); c.lineTo(40, y0 + (y1 - y0) * b); c.stroke(); } // shoulder sipes
  c.lineWidth = 3; c.beginPath(); c.moveTo(20, y0 + (y1 - y0) * 0.3); c.lineTo(44, y0 + (y1 - y0) * 0.5); c.moveTo(44, y0 + (y1 - y0) * 0.5); c.lineTo(20, y0 + (y1 - y0) * 0.7); c.stroke();
  // sidewall rings + lettering ticks
  c.fillStyle = '#9a9a9a';
  for (const f of [0.12, 0.2, 0.8, 0.88]) c.fillRect(0, 256 * f, 64, 3);
  c.fillStyle = '#a8a8a8'; for (const f of [0.15, 0.83]) c.fillRect(6, 256 * f, 36, 7);
  _tireBump = new THREE.CanvasTexture(cv); _tireBump.wrapS = _tireBump.wrapT = THREE.RepeatWrapping; _tireBump.repeat.set(34, 1); _tireBump.anisotropy = 4;
  return _tireBump;
}
export function tireMat() {
  if (_tireMat) return _tireMat;
  _tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.88, metalness: 0, bumpMap: tireBump(), bumpScale: 2.2 });
  return _tireMat;
}
export function wheelRimMat(color = 0xc9ced3, finish = 'alloy') {
  const k = color + ':' + finish;
  if (!_rimMats.has(k)) {
    const P = { alloy: [0.9, 0.26], polished: [1, 0.1], chrome: [1, 0.04], gloss: [0.55, 0.2], satin: [0.8, 0.42], steel: [0.5, 0.6], plastic: [0.25, 0.45] }[finish] || [0.9, 0.26];
    _rimMats.set(k, new THREE.MeshStandardMaterial({ color, metalness: P[0], roughness: P[1], envMapIntensity: 1.2, vertexColors: true }));
  }
  return _rimMats.get(k);
}

function tireProfile(r, tw, kind) {
  const sw = tw / 2, lowPro = kind === 'sport', chunky = kind === 'allterrain' || kind === 'mud' || kind === 'truck';
  const ri = r * (lowPro ? 0.76 : chunky ? 0.6 : 0.68), bul = chunky ? 1.07 : 1.03, sh = chunky ? 0.022 : 0.035;
  const half = [[ri, 0.8], [ri + 0.018, 0.96], [(ri + r) / 2, bul], [r - sh - 0.02, 1.0], [r - sh * 0.35, 0.86], [r - 0.003, 0.62], [r, 0.3]];
  const pts = half.map(([rad, a]) => [rad, -sw * a]);
  for (let i = half.length - 1; i >= 0; i--) pts.push([half[i][0], sw * half[i][1]]);
  return { pts: [...pts.slice(0, 7), ...pts.slice(7)], ri };
}

function buildRimGeo(style, ri, tw, r) {
  const sw = tw / 2, face = sw - 0.022, parts = [];
  const add = (g, c = 1) => parts.push(colored(g, c));
  // barrel with outer lip and inner dark throat
  const deep = style === 'deep5' || style === 'slot4' || style === 'wire';
  const fz = deep ? face - Math.min(0.07, tw * 0.28) : face - 0.012; // axial position of the spoke face
  add(lathe([[ri - 0.03, -sw * 0.8], [ri - 0.022, fz - 0.02], [ri - 0.016, fz], [ri - 0.01, face - 0.004], [ri + 0.004, face + 0.004], [ri + 0.008, face - 0.008]], 32), 1);
  add(new THREE.CircleGeometry(ri - 0.02, 20).rotateY(Math.PI / 2).translate(-sw * 0.5, 0, 0), 0.12); // dark back plate
  const r1 = ri - 0.02, hub = Math.max(0.055, ri * 0.24);
  const ring = (n, fn) => { for (let i = 0; i < n; i++) { const g = fn(i); g.rotateX((i / n) * Math.PI * 2); parts.push(g); } };
  const sp = (n, w0, w1, depth, sweep, conc, c = 1) => ring(n, () => colored(dish(spoke(hub * 0.8, r1 + 0.004, w0, w1, depth, sweep).translate(fz - depth, 0, 0), r1, conc), c));
  let lugs = 5, capR = hub * 0.55;
  switch (style) {
    case 'star5': sp(5, 0.03, 0.045, 0.03, 0, 0.02); break;
    case 'split5': ring(5, (i) => { const a = spoke(hub * 0.8, r1, 0.011, 0.014, 0.026, 0.035).translate(fz - 0.026, 0, 0), b = spoke(hub * 0.8, r1, 0.011, 0.014, 0.026, -0.035).translate(fz - 0.026, 0, 0); return colored(dish(mergeGeometries([a, b]), r1, 0.025), 1); }); break;
    case 'six': sp(6, 0.028, 0.036, 0.03, 0, 0.012); lugs = 6; break;
    case 'twin7': ring(7, () => { const a = spoke(hub * 0.8, r1, 0.008, 0.009, 0.022, 0.02).translate(fz - 0.022, 0, 0), b = spoke(hub * 0.8, r1, 0.008, 0.009, 0.022, -0.02).translate(fz - 0.022, 0, 0); return colored(dish(mergeGeometries([a, b]), r1, 0.03), 1); }); break;
    case 'multi10': sp(10, 0.012, 0.016, 0.024, 0, 0.022); break;
    case 'multi15': sp(15, 0.008, 0.011, 0.02, 0, 0.018); break;
    case 'mesh': sp(12, 0.007, 0.008, 0.018, 0.05, 0.02); sp(12, 0.007, 0.008, 0.018, -0.05, 0.02); break;
    case 'turbine': sp(9, 0.02, 0.03, 0.022, 0.07, 0.015); break;
    case 'deep5': sp(5, 0.032, 0.04, 0.026, 0, 0.0); break;
    case 'beadlock': sp(6, 0.026, 0.04, 0.03, 0, 0.01); ring(18, () => colored(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 6).rotateZ(Math.PI / 2).translate(face + 0.002, ri + 0.0, 0), 0.75)); lugs = 6; break;
    case 'wire': ring(28, (i) => colored(new THREE.CylinderGeometry(0.0028, 0.0028, r1 - hub * 0.6, 4).translate(0, (r1 + hub * 0.6) / 2, 0).rotateX(i % 2 ? 0.14 : -0.14).translate(fz - 0.01 - (i % 2) * 0.012, 0, 0), 1)); add(new THREE.CylinderGeometry(hub * 0.7, hub * 0.85, 0.07, 14).rotateZ(Math.PI / 2).translate(fz - 0.02, 0, 0), 1); lugs = 0; capR = hub * 0.5; break;
    case 'slot4': { const h = []; for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; h.push([Math.cos(a) * r1 * 0.62, Math.sin(a) * r1 * 0.62, r1 * 0.17, r1 * 0.12, a + Math.PI / 2]); } add(discWithHoles(r1 + 0.004, h, 0.012).translate(fz - 0.012, 0, 0), 1); break; }
    case 'slot5': { const h = []; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; h.push([Math.cos(a) * r1 * 0.66, Math.sin(a) * r1 * 0.66, r1 * 0.15, r1 * 0.09, a + Math.PI / 2]); } add(dish(discWithHoles(r1 + 0.004, h, 0.012).translate(fz - 0.012, 0, 0), r1, -0.012), 1); break; }
    case 'steel': { const h = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; h.push([Math.cos(a) * r1 * 0.74, Math.sin(a) * r1 * 0.74, r1 * 0.07, r1 * 0.07, 0]); } add(dish(discWithHoles(r1 + 0.004, h, 0.008).translate(fz - 0.02, 0, 0), r1, -0.025), 1); capR = hub * 0.9; break; }
    case 'truck8': { const h = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; h.push([Math.cos(a) * r1 * 0.68, Math.sin(a) * r1 * 0.68, r1 * 0.11, r1 * 0.11, 0]); } add(dish(discWithHoles(r1 + 0.004, h, 0.012).translate(fz - 0.012, 0, 0), r1, -0.03), 1); lugs = 8; capR = hub * 0.8; break; }
    case 'hubcap': { const h = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; h.push([Math.cos(a) * r1 * 0.7, Math.sin(a) * r1 * 0.7, r1 * 0.16, r1 * 0.05, a]); } add(dish(discWithHoles(ri - 0.002, h, 0.008).translate(face - 0.006, 0, 0), ri, -0.016), 1); lugs = 0; capR = hub * 0.7; break; }
    case 'aero': { const h = []; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; h.push([Math.cos(a) * r1 * 0.72, Math.sin(a) * r1 * 0.72, r1 * 0.2, r1 * 0.035, a + 0.5]); } add(discWithHoles(ri - 0.004, h, 0.008).translate(face - 0.008, 0, 0), 1); lugs = 0; capR = hub * 0.6; break; }
    default: sp(5, 0.03, 0.045, 0.03, 0, 0.02);
  }
  // hub, center cap, lug nuts
  add(new THREE.CylinderGeometry(hub, hub * 1.15, 0.035, 18).rotateZ(Math.PI / 2).translate(fz - 0.014, 0, 0), 0.9);
  add(new THREE.SphereGeometry(capR, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).rotateZ(-Math.PI / 2).translate(fz + 0.003, 0, 0), 1);
  for (let i = 0; i < lugs; i++) { const a = (i / lugs) * Math.PI * 2 + 0.3; add(new THREE.CylinderGeometry(0.009, 0.011, 0.018, 6).rotateZ(Math.PI / 2).translate(fz + 0.006, Math.cos(a) * hub * 0.78, Math.sin(a) * hub * 0.78), 0.7); }
  // brake rotor behind the face
  if (style !== 'hubcap' && style !== 'aero') {
    add(new THREE.CylinderGeometry(ri * 0.84, ri * 0.84, 0.024, 28).rotateZ(Math.PI / 2).translate(fz - 0.085, 0, 0), 0.34);
    add(new THREE.CylinderGeometry(ri * 0.4, ri * 0.4, 0.05, 16).rotateZ(Math.PI / 2).translate(fz - 0.07, 0, 0), 0.2);
  }
  return mergeGeometries(parts, false);
}

/**
 * Shared geometry set for a wheel.  opts: { r, tw, style, tire: 'road'|'sport'|'allterrain'|'mud'|'truck'|'whitewall' }
 * -> { tire, rim, lo, flat, caliper, ri, key }  (BufferGeometries; cached, never dispose per car)
 */
export function wheelGeos(opts) {
  const r = +opts.r.toFixed(3), tw = +opts.tw.toFixed(3), style = wheelStyleIds.includes(opts.style) ? opts.style : 'star5', kind = opts.tire || 'road';
  const key = `${r}|${tw}|${style}|${kind}`;
  if (cache.has(key)) return cache.get(key);
  const { pts, ri } = tireProfile(r, tw, kind);
  const tire = lathe(pts, 36);
  if (kind === 'mud' || kind === 'allterrain') { // real lugs on the shoulders
    const lug = [], n = 22, sw = tw / 2;
    for (let i = 0; i < n; i++) for (const s of [1, -1]) { const g = new THREE.BoxGeometry(tw * 0.3, 0.02, (2 * Math.PI * r / n) * 0.5); g.translate(s * sw * 0.72, r - 0.004, 0); g.rotateX(((i + (s > 0 ? 0 : 0.5)) / n) * Math.PI * 2); lug.push(g.toNonIndexed()); }
    const tl = mergeGeometries([tire.toNonIndexed(), ...lug], false);
    tire.dispose(); cache.set(key + ':t', tl);
  }
  const tireG = cache.get(key + ':t') || tire;
  const flat = tireG.clone(); { const p = flat.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -r * 0.45) { p.setY(i, -r * 0.45 - (y + r * 0.45) * 0.25); p.setX(i, p.getX(i) * 1.12); } } flat.computeVertexNormals(); }
  const rim = buildRimGeo(style, ri, tw, r);
  const loPts = [pts[0], pts[2], pts[5], pts[pts.length - 6], pts[pts.length - 3], pts[pts.length - 1]];
  const lo = mergeGeometries([colored(lathe(loPts, 12), 0.09), colored(new THREE.CircleGeometry(ri, 10).rotateY(Math.PI / 2).translate(tw * 0.3, 0, 0), 0.7)], false);
  const caliper = new THREE.BoxGeometry(0.07, ri * 0.5, 0.12).translate(tw / 2 - 0.1, ri * 0.6, 0);
  const res = { tire: tireG, rim, lo, flat, caliper, ri, key };
  cache.set(key, res);
  return res;
}
let _loMat = null;
export function wheelLoMat() { return _loMat ||= new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.2, vertexColors: true }); }

/** Assemble one wheel node. opts: { r, tw, style, tire, rimColor, rimFinish, caliperColor|null, hubcapMissing } */
export function buildWheel(opts) {
  let style = opts.style;
  if (opts.hubcapMissing && style === 'hubcap') style = 'steel';
  const g = wheelGeos({ ...opts, style });
  const spin = new THREE.Group();
  const tire = new THREE.Mesh(g.tire, tireMat()); tire.castShadow = true;
  const steelish = style === 'steel';
  const rim = new THREE.Mesh(g.rim, wheelRimMat(opts.hubcapMissing ? 0x1a1a1c : opts.rimColor ?? (steelish ? 0x25272a : 0xc9ced3), opts.hubcapMissing ? 'steel' : opts.rimFinish || (steelish ? 'steel' : style === 'hubcap' ? 'plastic' : 'alloy')));
  const lo = new THREE.Mesh(g.lo, wheelLoMat()); lo.visible = false;
  spin.add(tire, rim, lo);
  let cal = null;
  if (opts.caliperColor != null) cal = new THREE.Mesh(g.caliper, new THREE.MeshStandardMaterial({ color: opts.caliperColor, metalness: 0.3, roughness: 0.4 }));
  return { spin, tire, rim, lo, caliper: cal, detail: cal ? [tire, rim, cal] : [tire, rim], flatGeo: g.flat, tireGeo: g.tire, ri: g.ri };
}

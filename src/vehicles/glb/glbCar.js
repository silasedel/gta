// Library cars (the user's Models/Cars, converted by tools/v2/cars/convert.py) -> the same `car` object carModel2.buildCar
// returns (src/vehicles/INTERNALS.md section A), so physics, traffic, damage, lights and enter/exit work unchanged.
//
// One GLB per model: body0/1/2 (LODs) with four material slots (S_paint, S_glass, S_trim, S_lamp), wheel0/1 (+ wheelR0/1
// when the rear wheels differ), caliper0 (does not spin).  Vertex color alpha carries a packed parameter per slot:
//   trim: roughness / metal (a < 0.5 dielectric, rough = a / 0.49; a >= 0.5 metal, rough = (a - 0.5) / 0.49)
//   glass: 1 window (tinted) / 0 lamp lens (clear);   lamp: channel / 16 (see model/body/mats.js LAMP)
// Geometry is converted once per model and shared by every car of that model; per car there are only the paint material,
// the lamp material (decal sheet with its own plate) and the wheel InstancedMesh.  Draw calls: 4 body + 1 wheel set.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carPaint } from '../model/materials.js';
import { trimMaterial, glassMaterial, lampMaterial, SHEET } from '../model/body/mats.js';
import { wheelMat } from '../model/body/wheel.js';
import { plateMaterial } from '../model/extras.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'assets/vehicles/cars/';
let _loader = null;
function loader() {
  if (_loader) return _loader;
  _loader = new GLTFLoader();
  const d = new DRACOLoader(); d.setDecoderPath((import.meta.env?.BASE_URL || '/') + 'assets/humans/draco/'); _loader.setDRACOLoader(d);
  return _loader;
}

const models = new Map(); // key -> { man, lv: [{ paint, trim, glass, lamp }], wheel: [g0, g1], wheelR, ready }
const pending = new Map();
export const glbStats = { loaded: 0, failed: 0, ms: 0, bytes: 0 };

// ------------------------------------------------------------------ attribute conversion (once per model)
function unpackRM(a) { return a >= 0.5 ? [Math.min(1, (a - 0.5) / 0.49), 1] : [Math.min(1, a / 0.49), 0]; }
function col4(g) {
  const c = g.getAttribute('color');
  const n = g.getAttribute('position').count;
  const rgb = new Float32Array(n * 3), a = new Float32Array(n);
  if (!c) { rgb.fill(0.5); a.fill(0.5); return { rgb, a }; }
  for (let i = 0; i < n; i++) { rgb[i * 3] = c.getX(i); rgb[i * 3 + 1] = c.getY(i); rgb[i * 3 + 2] = c.getZ(i); a[i] = c.itemSize > 3 ? c.getW(i) : 0.5; }
  return { rgb, a };
}
// ONE fleet style: every library model's trim is pulled into the same calibrated ranges per material class, so 47 cars from
// different sources share one light response (no pure-black CG plastic, no paper-white trim, no mirror-rough chrome).
//   metal (chrome, alloy, brushed):  neutral, albedo luminance 0.55..0.8, roughness 0.08..0.5; dark "metal" -> painted (metal 0)
//   dielectric (plastic, rubber, interior, fabric): albedo luminance 0.025..0.62, roughness 0.32..0.95
//   near-black plastics / rubber: roughness >= 0.5 unless authored as gloss piano black (< 0.25 stays at 0.22)
const lum3 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function calibrate(rgb, rm, i) {
  let r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2], ro = rm[i * 2]; const metal = rm[i * 2 + 1] > 0.5;
  const L = lum3(r, g, b);
  let lo = 0.025, hi = 0.62;
  if (metal && L < 0.12) { rm[i * 2 + 1] = 0; ro = Math.max(0.35, Math.min(0.7, ro)); }   // dark "metal" trim is painted / plastic (art guide)
  else if (metal) { // chrome / alloy: neutral (sat <= 0.08) and bright, 0.55-0.8
    const m = (r + g + b) / 3; r = m + (r - m) * 0.25; g = m + (g - m) * 0.25; b = m + (b - m) * 0.25;
    lo = 0.55; hi = 0.8; ro = Math.min(0.5, Math.max(0.08, ro));
  }
  else if (L < 0.06) ro = ro < 0.25 ? 0.22 : Math.max(0.5, Math.min(0.95, ro));
  else ro = Math.min(0.95, Math.max(0.32, ro));
  if (L > hi) { const k = hi / L; r *= k; g *= k; b *= k; } else if (L < lo) { const k = L > 1e-4 ? lo / L : 0; if (k) { r *= k; g *= k; b *= k; } else { r = g = b = lo; } }
  rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b; rm[i * 2] = ro;
}
function prepTrim(g) {
  const { rgb, a } = col4(g), n = a.length, rm = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const [r, m] = unpackRM(a[i]); rm[i * 2] = r; rm[i * 2 + 1] = m; calibrate(rgb, rm, i); }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
  g.setAttribute('aPat', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}
function prepGlass(g) {
  const { a } = col4(g), n = a.length, w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = a[i] > 0.5 ? 1 : 0;
  g.deleteAttribute('color'); g.setAttribute('aWin', new THREE.BufferAttribute(w, 1));
  return g;
}
const WHITE_UV = [(SHEET.white[0] + SHEET.white[2] / 2) / SHEET.w, 1 - (SHEET.white[1] + SHEET.white[3] / 2) / SHEET.h];
function prepLamp(g) {
  const { rgb, a } = col4(g), n = a.length, ch = new Float32Array(n), rm = new Float32Array(n * 2);
  const uv = g.getAttribute('uv'), uvs = new Float32Array(n * 2);
  const [px, py, pw, ph] = SHEET.plate;
  for (let i = 0; i < n; i++) {
    ch[i] = Math.round(a[i] * 16);
    rm[i * 2] = 0.22; rm[i * 2 + 1] = 0;
    const u = uv ? uv.getX(i) : -1, v = uv ? uv.getY(i) : -1;
    if (ch[i] === 14 && u > -0.5) { // plate: 0..1 over the plate -> the plate region of the decal sheet
      uvs[i * 2] = (px + u * pw) / SHEET.w; uvs[i * 2 + 1] = 1 - (py + (1 - v) * ph) / SHEET.h;
      rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = 1; rm[i * 2] = 0.45;
    } else { uvs[i * 2] = WHITE_UV[0]; uvs[i * 2 + 1] = WHITE_UV[1]; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  g.setAttribute('aLamp', new THREE.BufferAttribute(ch, 1));
  g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}
function prepPaint(g) { g.deleteAttribute('color'); if (g.getAttribute('uv')) g.deleteAttribute('uv'); return g; }
function prepWheel(g, fix) {
  prepTrim(g);
  const n = g.getAttribute('position').count;
  g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aFix', new THREE.BufferAttribute(new Float32Array(n).fill(fix ? 1 : 0), 1));
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g.deleteAttribute('aPat'); g.setAttribute('aPat', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}
// old bias-ply look (cars.json whitewall: [inner, outer] radius fraction): a dirty off-white band on the black sidewall
function whitewall(g, R, tw, band) {
  const [b0, b1] = Array.isArray(band) ? band : [0.7, 0.82];
  const p = g.getAttribute('position'), c = g.getAttribute('color'), rm = g.getAttribute('aRM');
  if (!p || !c || !rm) return;
  for (let i = 0; i < p.count; i++) {
    const rr = Math.hypot(p.getY(i), p.getZ(i)) / R, L = 0.2126 * c.getX(i) + 0.7152 * c.getY(i) + 0.0722 * c.getZ(i);
    if (rr > b0 && rr < b1 && L < 0.08 && rm.getY(i) < 0.5 && Math.abs(p.getX(i)) > tw * 0.28) { c.setXYZ(i, 0.5, 0.48, 0.43); rm.setX(i, 0.85); }
  }
  c.needsUpdate = true; rm.needsUpdate = true;
}
function mergeSafe(list) {
  let gs = list.filter(Boolean);
  if (!gs.length) return null;
  if (gs.length === 1) return gs[0];
  if (!gs.every((g) => g.index)) gs = gs.map((g) => (g.index ? g.toNonIndexed() : g));
  const keys = Object.keys(gs[0].attributes).filter((k) => gs.every((g) => g.getAttribute(k)));
  for (const g of gs) for (const k of Object.keys(g.attributes)) if (!keys.includes(k)) g.deleteAttribute(k);
  return mergeGeometries(gs, false);
}

// collision hull: the body's extreme points along 98 directions (a convex hull of ~100 points instead of 1500; same shape)
function hullPoints(h0, belt = 1, floor = 0.24) {
  // mirrors stick out above the belt: points wider than the lower body are left out (the hull hugs the body, not the mirrors)
  let wLow = 0; for (let i = 0; i < h0.length; i += 3) if (h0[i + 1] < belt - 0.05) wLow = Math.max(wLow, Math.abs(h0[i]));
  // floor: nothing below 0.24 m (spoilers and sills would scrape the road under hard compression and trip the car)
  const hs = []; for (let i = 0; i < h0.length; i += 3) if (!(wLow > 0.5 && Math.abs(h0[i]) > wLow + 0.01)) hs.push(h0[i], Math.max(h0[i + 1], floor), h0[i + 2]);
  const h = hs, n = h.length / 3, keep = new Set(), dirs = [];
  for (let i = 0; i < 98; i++) { const y = 1 - (i + 0.5) / 98 * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996; dirs.push([Math.cos(a) * r, y, Math.sin(a) * r]); }
  for (const d of dirs) { let best = -1, bv = -1e9; for (let i = 0; i < n; i++) { const v = h[i * 3] * d[0] + h[i * 3 + 1] * d[1] * 1.0 + h[i * 3 + 2] * d[2]; if (v > bv) { bv = v; best = i; } } keep.add(best); }
  const out = new Float32Array(keep.size * 3); let k = 0;
  for (const i of keep) { out[k++] = h[i * 3]; out[k++] = h[i * 3 + 1]; out[k++] = h[i * 3 + 2]; }
  return out;
}
/** load (once) and convert a model; resolves to the model record or null */
export function loadCarModel(key) {
  if (models.has(key)) return Promise.resolve(models.get(key));
  if (pending.has(key)) return pending.get(key);
  const t0 = performance.now();
  const p = (async () => {
    const man = await (await fetch(BASE + key + '.json')).json();
    const gltf = await loader().loadAsync(BASE + key + '.glb');
    const parts = {}, texMats = {};
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      let n = o; while (n && !/^(body[012]|wheel[01]|wheelR[01]|caliper0)$/.test(n.name)) n = n.parent;
      if (!n) return;
      const slot = String(o.material?.name || '').replace(/^S_/, '').replace(/\.\d+$/, '') || 'trim';
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      if (/^T_/.test(slot)) texMats[slot] ||= texturedMaterial(o.material);
      (parts[n.name] ||= {})[slot] = mergeSafe([(parts[n.name] || {})[slot], g]);
    });
    const lv = [0, 1, 2].map((l) => {
      const P = parts['body' + l] || {};
      const tex = Object.keys(P).filter((k) => /^T_/.test(k)).map((k) => ({ geo: prepTrim(P[k]), mat: texMats[k] }));
      return { paint: P.paint ? prepPaint(P.paint) : null, trim: P.trim ? prepTrim(P.trim) : null, glass: P.glass ? prepGlass(P.glass) : null, lamp: P.lamp ? prepLamp(P.lamp) : null, tex };
    });
    const wheelGeo = (name) => {
      const P = parts[name]; if (!P) return null;
      const list = Object.values(P).map((g) => prepWheel(g, false));
      return mergeSafe(list);
    };
    const cal = parts.caliper0 ? mergeSafe(Object.values(parts.caliper0).map((g) => prepWheel(g, true))) : null;
    let wheel = [mergeSafe([wheelGeo('wheel0'), cal]), wheelGeo('wheel1')];
    if (man.wheelDonor && man.wheelDonor !== key) { // crude source wheels (8-sided): borrow a better wheel, scaled to this tire
      const d = await loadCarModel(man.wheelDonor);
      if (d?.wheel?.[0]) { const k = man.r / d.man.r; wheel = d.wheel.map((g) => g && g.clone().scale(k, k, k)); }
    }
    const wheelR = parts.wheelR0 ? [mergeSafe([wheelGeo('wheelR0'), cal]), wheelGeo('wheelR1')] : null;
    if (man.cfg?.whitewall) for (const g of [...wheel, ...(wheelR || [])]) if (g) whitewall(g, man.r, man.tw || 0.22, man.cfg.whitewall);
    for (const L of lv) for (const k in L) if (L[k]?.isBufferGeometry) { L[k].computeBoundingSphere(); L[k].computeBoundingBox(); }
    // body side wall at door height between the axles (door decals sit on it)
    let sideX = 0;
    { const P = lv[1].paint || lv[0].paint, a = P?.getAttribute('position'), s_ = man.shape, wb = man.wb, r = man.r;
      if (a) for (let i = 0; i < a.count; i++) { const y = a.getY(i), z = a.getZ(i); if (y > s_.yb + 0.25 && y < s_.belt - 0.08 && Math.abs(z) < wb / 2 - r * 1.2) sideX = Math.max(sideX, Math.abs(a.getX(i))); } }
    const rec = { key, man, lv, wheel, wheelR, sideX: sideX || man.dims.W / 2 - 0.1, hull: man.hull ? hullPoints(man.hull, man.shape?.belt) : null };
    models.set(key, rec);
    glbStats.loaded++; glbStats.ms += performance.now() - t0; glbStats.bytes += man.bytes || 0;
    return rec;
  })().catch((e) => { console.warn('[cars] model failed', key, e); glbStats.failed++; models.set(key, null); return null; }).finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
export const isCarLoaded = (key) => !!models.get(key);
export const carModelRecord = (key) => models.get(key) || null;

// ------------------------------------------------------------------ per-car decal sheet (plate; badge/lettering left blank)
function decalSheet(look) {
  const cv = document.createElement('canvas'); cv.width = SHEET.w; cv.height = SHEET.h;
  const c = cv.getContext('2d');
  const pm = plateMaterial(look.plate || { text: 'SLN 000', style: 0 });
  try { c.drawImage(pm.map.image, ...SHEET.plate); } catch (e) { /* no canvas */ }
  pm.map.dispose(); pm.dispose();
  c.fillStyle = '#ffffff'; c.fillRect(SHEET.white[0] - 4, SHEET.white[1] - 4, SHEET.white[2] + 8, SHEET.white[3] + 8);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  return { texture: tx };
}

// a US plate (30.5 x 15.2 cm) mapped onto the plate region of the per-car decal sheet
let _plateGeo = null;
function plateGeo() {
  if (_plateGeo) return _plateGeo;
  const g = new THREE.PlaneGeometry(0.305, 0.152), uv = g.getAttribute('uv'), [px, py, pw, ph] = SHEET.plate;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (px + uv.getX(i) * pw) / SHEET.w, 1 - (py + (1 - uv.getY(i)) * ph) / SHEET.h);
  return (_plateGeo = g);
}
// shared contact shadow (same look as carModel2)
let _contactMat = null;
const CONTACT_GEO = new THREE.PlaneGeometry(1, 1);
function contactMat() {
  if (_contactMat) return _contactMat;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const c = cv.getContext('2d'), img = c.createImageData(64, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 64; i++) {
    const u = (i + 0.5) / 64 * 2 - 1, v = (j + 0.5) / 128 * 2 - 1, d = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
    const a = Math.max(0, Math.min(1, (1 - d) / 0.42)), o = (j * 64 + i) * 4, val = Math.round(255 * a * a * (3 - 2 * a) * 0.85);
    img.data[o] = img.data[o + 1] = img.data[o + 2] = val; img.data[o + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  _contactMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
  return _contactMat;
}

// textured parts of low-poly models (box trucks, vans): the source texture, roughness / metal from the vertex alpha
function texturedMaterial(src) {
  const m = new THREE.MeshStandardMaterial({ map: src.map || null, color: src.color?.clone?.() || new THREE.Color(1, 1, 1), normalMap: src.normalMap || null,
    roughness: 1, metalness: 1, envMapIntensity: 1.1, vertexColors: false, side: src.side ?? THREE.FrontSide, alphaTest: src.alphaTest || 0, transparent: false });
  if (m.map) { m.map.anisotropy = 4; m.map.colorSpace = THREE.SRGBColorSpace; }
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nvarying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRM = aRM;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(vRM.x, 0.3, 0.85);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = vRM.y * step(0.3, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));');
  };
  m.customProgramCacheKey = () => 'ps-cartex-v2';
  return m;
}
// ------------------------------------------------------------------ taxi: roof sign (lit at night) + door lettering
let _taxi = null;
function taxiAssets() {
  if (_taxi) return _taxi;
  const cv = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const sign = cv(256, 64, (c) => { c.fillStyle = '#f7f2e4'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#121212'; c.font = 'bold 30px "Arial Black", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TAXI', 128, 34); c.fillStyle = '#121212'; for (let i = 0; i < 16; i++) c.fillRect(i * 16 + (i % 2) * 0, 0, 8, 6); });
  const door = cv(512, 128, (c) => { c.clearRect(0, 0, 512, 128); for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#111' : 'rgba(0,0,0,0)'; c.fillRect(i * 16, 96 + j * 14, 16, 14); }
    c.fillStyle = '#111'; c.font = 'bold 46px "Arial Black", Arial, sans-serif'; c.textAlign = 'center'; c.fillText('SOUTHLINE CAB', 256, 64); c.font = 'bold 18px Arial, sans-serif'; c.fillText('305-555-0199', 256, 88); });
  const signMat = new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: new THREE.Color(0xfff0c0), emissiveIntensity: 0.4, roughness: 0.4 });
  const doorMat = new THREE.MeshStandardMaterial({ map: door, transparent: true, roughness: 0.35, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  return (_taxi = { signMat, doorMat, signGeo: new THREE.BoxGeometry(0.86, 0.26, 0.3) });
}
function addTaxi(levels, t, M, lightMats) {
  const A = taxiAssets();
  const roofZ = (t.zB + t.zC) / 2, sign = new THREE.Mesh(A.signGeo, A.signMat);
  sign.position.set(0, t.roofY + 0.12, roofZ); sign.rotation.y = Math.PI / 2;
  const sign2 = sign.clone();
  levels[0].add(sign); levels[1].add(sign2);
  sign.onBeforeRender = () => { A.signMat.emissiveIntensity = Math.max(0.35, lightMats.sign?.emissiveIntensity ?? 0.4); };
  const ln = Math.min(t.wb - 2 * (t.r + 0.2), 2.4), h = ln / 4.2, y = Math.min(t.belt - h / 2 - 0.08, t.yb + 0.25 + h / 2 + (t.belt - t.yb) * 0.25);
  for (const sd of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(ln, h), A.doorMat);
    p.rotation.y = sd * Math.PI / 2; p.position.set(sd * (M.sideX + 0.012), y, 0); p.renderOrder = 3;
    levels[0].add(p); levels[1].add(p.clone());
  }
}
// ------------------------------------------------------------------ ambulance / fire engine: side lettering (Southline)
const _svc = {};
function serviceMat(kind) {
  if (_svc[kind]) return _svc[kind];
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  if (kind === 'ambulance') {
    g.fillStyle = '#c8141c'; g.fillRect(0, 196, 1024, 26); g.fillStyle = '#1a3f8f'; g.fillRect(0, 226, 1024, 10);
    g.fillStyle = '#c8141c'; g.font = 'bold 118px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('AMBULANCE', 512, 92);
    g.fillStyle = '#1a3f8f'; g.font = 'bold 38px Arial, sans-serif'; g.fillText('SOUTHLINE FIRE RESCUE  ·  EMS', 512, 168);
  } else {
    g.fillStyle = '#f2d14b'; g.fillRect(0, 200, 1024, 20);
    g.fillStyle = '#f7f2e0'; g.font = 'bold 74px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SOUTHLINE FIRE RESCUE', 512, 110);
  }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  return (_svc[kind] = new THREE.MeshStandardMaterial({ map: tx, transparent: true, roughness: 0.4, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }));
}
function addServiceLivery(levels, t, M) {
  const sh = M.man.shape, half = Math.max(M.sideX, (sh.bodyW || t.W) / 2, M.man.dims.W / 2 - 0.2) + 0.015;
  const rear = sh.rear ?? -t.L / 2, ln = Math.abs(rear) * 1.25, h = ln / 4;
  const y = t.livery === 'ambulance' ? t.belt + (t.roofY - t.belt) * 0.45 : t.yb + (t.belt - t.yb) * 0.75, z = rear * 0.45;
  for (const sd of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(ln, h), serviceMat(t.livery));
    p.rotation.y = sd * Math.PI / 2; p.position.set(sd * half, y, z); p.renderOrder = 3;
    levels[0].add(p); levels[1].add(p.clone());
  }
}
// one wheel material for every library car (the rims keep their own baked colors; aTint = 0 everywhere)
let _wmat = null;
const wheelMaterial = () => (_wmat ||= Object.assign(wheelMat(0xffffff, 'alloy'), { name: 'car-wheel' }));

// wheel instances: N visual wheels follow the four physics wheel nodes (extra axles hang off the rear nodes)
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _flip = new THREE.Matrix4().makeRotationY(Math.PI);
function wheelInstances(geo, n, L) {
  const im = new THREE.InstancedMesh(geo, wheelMaterial(), n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.castShadow = true; im.frustumCulled = true;
  im.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.4, 0), L / 2 + 1);
  return im;
}
function syncWheels(im, vis, maxY, mud = 0) {
  _inv.copy(im.matrixWorld).invert();
  for (let i = 0; i < vis.length; i++) {
    const w = vis[i];
    w.node.updateWorldMatrix(true, false);
    _m.multiplyMatrices(_inv, w.node.matrixWorld);
    if (maxY != null && _m.elements[13] > maxY) _m.elements[13] = maxY;
    if (w.side < 0) _m.multiply(_flip);
    im.setMatrixAt(i, _m);
    im.instanceColor.setX(i, (w.side < 0 ? -1 : 1) * w.spin.rotation.x); im.instanceColor.setY(i, mud);
  }
  im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
}

/**
 * buildGlbCar(key, look, spec, info) -> car (INTERNALS.md section A).  The model must be loaded (isCarLoaded).
 * look: catalog.rollLook output (color, finish, wear, twoTone, tint, plate...).  spec: CAR_TYPES[key].
 */
export function buildGlbCar(key, look, t, info) {
  const M = models.get(key);
  if (!M) return null;
  const man = M.man;
  const root = new THREE.Group(), shell = new THREE.Group();
  root.add(shell);
  const wear = { dirt: 0, rust: 0, fade: 0, seed: 0, ...(look.wear || {}) };
  const shape = { dirtTop: t.belt + 0.05, halfL: t.L / 2, halfWb: t.wb / 2, r: t.r };
  const finish = look.finish || (t.classic ? 'solid' : t.taxi || t.heavy ? 'gloss' : 'metallic');
  const tt = look.twoTone && look.twoTone.y != null ? { color: look.twoTone.color, y: t.yb + (t.belt - t.yb) * look.twoTone.y } : null;
  const roofColor = t.livery === 'police' ? 0xf2f2f2 : look.twoTone?.roof ?? null;
  const roofTone = roofColor != null ? { color: roofColor, y: t.belt + 0.07 } : null;
  // racing stripe (Nico's pickup, mock-up): one paint-shader box over the hood (windshield base -> where the hood drops to the
  // grille) and one over the cab roof.  Paint faces only: glass, lamps, grille and trim are other slots and never get it.
  const st = look.stripe;
  let patch = null;
  if (st) {
    const S = { ...(man.stripe || {}), ...st }, front = man.shape?.front ?? t.L / 2;
    const hz0 = S.hood?.[0] ?? t.zA - 0.2, hz1 = S.hood?.[1] ?? front - 0.3, hy0 = S.hoodY ?? t.noseY - 0.1;
    // hood: from just under the windshield base to where the hood bends down to the grille
    patch = { min: [-st.w / 2, hy0, hz0], max: [st.w / 2, t.roofY + 0.3, hz1], color: st.color ?? 0x0c0d0f, strength: 1, satin: st.satin ?? true };
    if (st.roofW) patch.min2 = [-st.roofW / 2, S.roofY ?? t.roofY - 0.2, S.roof?.[0] ?? t.zC - 0.1], patch.max2 = [st.roofW / 2, t.roofY + 0.3, S.roof?.[1] ?? t.zB + 0.3];
  }
  const paint = carPaint({ color: look.color, finish, wear, shape, twoTone: tt, patch, roofTone }); paint.name = 'car-paint';
  // an old, sun-baked parked car (look.old, e.g. Nico's classic): flat milky chrome, chalky rubber, dusty hazy glass
  const glass = look.old ? glassMaterial(0, { dusty: true }) : glassMaterial(look.tint ?? 1); glass.name ||= 'car-glass';
  const trim = trimMaterial({ worn: !!look.old }); trim.name ||= 'car-trim';
  const sheet = decalSheet(look);
  const lamps = lampMaterial(sheet, { ambulance: t.police === 'ambulance', fire: t.police === 'fire', busSign: false });
  const lightMats = lamps.lightMats;
  const big = t.heavy ? 2.2 : 1;
  const lod = new THREE.LOD(), levels = [], slots = { paint: [], glass: [], roof: [] }, sets = [];
  let paint0 = null;
  // physics wheel nodes FL FR RL RR (+X = left), positioned by vehicles.js every frame (steer.position.y = -suspension)
  const susp = t.susp || [0.36, 34], restY = -(susp[0] - 9.81 / (4 * susp[1]));
  const wheels = [];
  const W4 = man.wheels;
  [[1, true, 0], [-1, true, 1], [1, false, 2], [-1, false, 3]].forEach(([side, front, i]) => {
    const steer = new THREE.Group(), spin = new THREE.Group(); steer.add(spin);
    const p = W4[i].pos;
    const x = side * Math.abs(p[0]), z = front ? t.wb / 2 : -t.wb / 2;
    steer.position.set(x, restY, z); root.add(steer);
    wheels.push({ steer, spin, side, front, detail: [], lo: null, tireMesh: null, flatGeo: null, tireGeo: null, x, z, r: t.r });
  });
  // visual wheel list (extra axles: children of the nearest rear node, same spin)
  const vis = wheels.map((w, i) => { const n = new THREE.Object3D(); n.position.z = W4[i].pos[2] - w.z; w.steer.add(n); return { node: n, spin: w.spin, side: w.side, front: w.front, virtual: !!W4[i].virtual }; }).filter((v) => !v.virtual);
  const visR = [];
  for (const e of man.extraWheels || []) {
    const zg = e.pos[2];
    const host = wheels[e.side > 0 ? 2 : 3];
    const n = new THREE.Object3D(); n.position.set(e.side * Math.abs(e.pos[0]) - host.x, 0, zg - host.z); host.steer.add(n);
    (M.wheelR ? visR : vis).push({ node: n, spin: host.spin, side: e.side, front: false });
  }
  const front = vis.filter((w) => w.front), rear = vis.filter((w) => !w.front);
  for (const level of [0, 1, 2]) {
    const G = M.lv[level], g = new THREE.Group();
    if (G.paint) { const m = new THREE.Mesh(G.paint, paint); m.castShadow = level < 2; m.receiveShadow = level < 2; g.add(m); slots.paint.push(m); if (level === 0) paint0 = m; }
    if (G.trim) { const m = new THREE.Mesh(G.trim, trim); m.castShadow = level < 2; m.receiveShadow = level < 2; g.add(m); }
    if (G.glass) { const m = new THREE.Mesh(G.glass, glass); m.renderOrder = 2; g.add(m); slots.glass.push(m); }
    if (G.lamp) { const m = new THREE.Mesh(G.lamp, lamps.material); g.add(m); }
    for (const T of G.tex || []) { const m = new THREE.Mesh(T.geo, T.mat); m.castShadow = level < 2; m.receiveShadow = level < 2; g.add(m); }
    if (level < 2) {
      if (M.wheelR) {
        const a = wheelInstances(M.wheel[level], front.length, t.L), b = wheelInstances(M.wheelR[level], rear.length + visR.length, t.L);
        g.add(a, b); sets.push([a, front], [b, rear.concat(visR)]);
      } else {
        const a = wheelInstances(M.wheel[level], vis.length, t.L); g.add(a); sets.push([a, vis]);
      }
    }
    levels.push(g);
  }
  lod.addLevel(levels[0], 0);
  lod.addLevel(levels[1], 28 * big, 0.12);   // LOD0 (~80k) only close up; LOD1 (10k) holds well to ~100 m
  lod.addLevel(levels[2], 100 * big, 0.12);
  shell.add(lod);
  // rear license plate on the measured plate mount (Florida needs no front plate; the front recess stays a dark bracket)
  let plateMat = null;
  const PA = man.plates?.rear;
  if (PA) {
    plateMat = new THREE.MeshStandardMaterial({ map: sheet.texture, roughness: 0.45, metalness: 0.2, name: 'car-plate', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const g = plateGeo(), pm0 = new THREE.Mesh(g, plateMat);
    pm0.position.set(PA[0], PA[1], PA[2] - 0.006); pm0.rotation.y = Math.PI;
    levels[0].add(pm0); levels[1].add(pm0.clone());
  }
  if (t.taxi) addTaxi(levels, t, M, lightMats);
  if (t.livery === 'ambulance' || t.livery === 'fire') addServiceLivery(levels, t, M);
  const contact = new THREE.Mesh(CONTACT_GEO, contactMat());
  contact.scale.set(t.W + 0.25, t.L + 0.35, 1); contact.rotation.x = -Math.PI / 2; contact.position.y = 0.025; contact.renderOrder = 1; contact.userData.contactShadow = true;
  shell.add(contact);
  const mud = Math.min(0.9, (look.wear?.dirt ?? 0) * 1.6 + (look.wear?.rust ?? 0) * 0.3); // per-car tire dust / mud
  // visual wheel cap under the fender: r + arch gap + 1.5 cm (Rapier ray-cast); car.wheelCapExtra lets another suspension
  // (r2-physics carphys 2: + 4.5 cm, the tire tucks into the well liner at full bump) raise it
  const capBase = t.r + (t.archGap ?? Math.max(0.04, man.archGap ?? 0.06));
  const lodUpdate = lod.update.bind(lod);
  lod.update = (camera) => {
    lodUpdate(camera);
    const maxY = capBase + (car.wheelCapExtra ?? 0.015);
    for (const [im, list] of sets) if (im.parent.visible) syncWheels(im, list, maxY, mud);
    lamps.sync();
  };
  lamps.sync();
  const steeringWheel = new THREE.Group(); levels[0].add(steeringWheel);
  const seatZ = t.zA - (t.coupe ? 1.05 : 1.15);
  const car = {
    steerMax: t.steerMax ?? 0.6, root, shell, wheels, lightMats, spec: t, paint, paintMats: [paint], parts: { paint: paint0, roof: null }, slots,
    deformable: paint0 ? [paint0] : [], steeringWheel, wipers: [], info, lod, kit: 'base', look, glb: true,
    hull: M.hull, plate: { text: look.plate?.text || '' }, _res: null, anchors: null, wheelSets: sets.map((s) => s[0]),
    // hip points (H-point) per seat, driver first; measured per model (man.seats), the old spec estimate only as a fallback
    seats: man.seats?.length ? man.seats.map((q) => ({ x: q.hip[0], y: q.hip[1], z: q.hip[2], yaw: q.yaw || 0, id: q.id }))
      : [{ x: 0.38, y: t.belt - 0.25, z: seatZ }, { x: -0.38, y: t.belt - 0.25, z: seatZ }, ...(t.coupe ? [] : [{ x: 0.38, y: t.belt - 0.25, z: seatZ - 0.95 }, { x: -0.38, y: t.belt - 0.25, z: seatZ - 0.95 }])],
    seatAnchors: man.seats || null, steerWheel: man.wheel || null,
    dispose() {
      paint.dispose(); lamps.material.dispose(); sheet.texture.dispose(); plateMat?.dispose();
      for (const [im] of sets) im.dispose();
      if (paint0?.userData.ownGeo) paint0.geometry.dispose();
    },
  };
  return car;
}

let _canvas = null;
/** a static library prop (car under a cover): LOD group of trim meshes, ground at y = 0, faces +Z */
export function buildStaticCar(key) {
  const M = models.get(key);
  if (!M) return null;
  // a car under a cover: faded gray-tan canvas (matte, albedo ~0.27), not the model's black cover (a black hole at distance)
  const lod = new THREE.LOD(), trim = key === 'covered1' ? (_canvas ||= new THREE.MeshStandardMaterial({ color: 0x8f877a, roughness: 0.95, metalness: 0, name: 'car-cover-canvas' })) : trimMaterial();
  M.lv.forEach((L, i) => {
    const g = new THREE.Group();
    if (L.trim) { const m = new THREE.Mesh(L.trim, trim); m.castShadow = i < 2; m.receiveShadow = i === 0; g.add(m); }
    lod.addLevel(g, [0, 30, 90][i], 0.12);
  });
  const root = new THREE.Group(); root.add(lod);
  const contact = new THREE.Mesh(CONTACT_GEO, contactMat());
  contact.scale.set(M.man.dims.W + 0.4, M.man.dims.L + 0.5, 1); contact.rotation.x = -Math.PI / 2; contact.position.y = 0.02; contact.renderOrder = 1;
  root.add(contact);
  root.userData.dims = M.man.dims;
  return root;
}

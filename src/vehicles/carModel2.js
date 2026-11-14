// Procedural, original car models for Port Solana (V2 engine), bodies v3.
// Bodies come from model/body/body.js (design sheet per archetype: lofted wall with real creases, lids, greenhouse with black
// window surrounds, layered lamp units, grilles, interior) merged into four geometries per model and LOD; wheels are one
// InstancedMesh per car (model/body/wheel.js).  A car draws with five calls at LOD0: paint, trim, glass, lamps+decals, wheels.
// Every car is built from a seeded "look" (catalog.js rollLook) so no two are alike.
// Shell coordinates: ground y = 0, +Z forward, +X left, z = 0 mid-wheelbase.
import * as THREE from 'three';
import { CAR_TYPES, MODELS, CLASSES, ALL_KEYS, rollVariant, rollLook, lookSignature, legacyLook } from './catalog.js';
import { carPaint } from './model/materials.js';
import { wheelStyleIds } from './model/wheels.js';
import { plateMaterial, accessoryMesh, dashItemsMesh, STICKER_COUNT } from './model/extras.js';
import { buildBodyGeo, MODELSENGINE } from './model/body/body.js';
import { trimMaterial, glassMaterial, brokenGlass, lampMaterial, SHEET } from './model/body/mats.js';
import { wheelGeometry, wheelMat, wheelSet, syncWheelSet } from './model/body/wheel.js';
import { dentMesh } from './damage.js';
import { getBrand, logoCanvas } from '../design/index.js';
export { CAR_TYPES, MODELS, CLASSES, ALL_KEYS, rollVariant, rollLook, lookSignature };

for (const k in MODELS) MODELSENGINE.set(k, MODELS[k].engine);
export function brokenGlassMat() { return brokenGlass(); }

// ---------------------------------------------------------------- decal sheet (plate + badge + lettering, one texture per car)
const TRIM_COLORS = { clothGrey: 0x5a5c61, clothBeige: 0xa59879, clothBlack: 0x26272a, leatherBlack: 0x1d1d20, leatherTan: 0x8f6540, leatherRed: 0x74181c, leatherCream: 0xcfc1a1, vinyl: 0x34363a };
const badgeCanvas = new Map(), letterCanvas = new Map();
function badgeArt(brandName) {
  if (badgeCanvas.has(brandName)) return badgeCanvas.get(brandName);
  let cv = null;
  try {
    const brand = getBrand(brandName);
    if (brand) {
      let src = null;
      try { src = logoCanvas(brand, 128, { pad: 0.06, variant: 'mark', mono: '#dfe3e7' }); } catch (e) { src = null; }
      if (!src) src = logoCanvas(brand, 128, { pad: 0.06, mono: '#dfe3e7' });
      cv = src;
    }
  } catch (e) { cv = null; }
  if (!cv) { // fallback: chrome oval with the initial
    cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    c.strokeStyle = '#e4e8ec'; c.lineWidth = 9; c.beginPath(); c.ellipse(64, 64, 54, 40, 0, 0, 7); c.stroke();
    c.fillStyle = '#e4e8ec'; c.font = 'bold 54px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(brandName || '?')[0], 64, 68);
  }
  badgeCanvas.set(brandName, cv);
  return cv;
}
function letterArt(model) {
  if (letterCanvas.has(model)) return letterCanvas.get(model);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c = cv.getContext('2d');
  const txt = String(model || '').replace(/\s*\(.*\)/, '').toUpperCase();
  let fs = 40; c.font = `italic 700 ${fs}px "Helvetica Neue", Arial, sans-serif`;
  while (c.measureText(txt).width > 244 && fs > 12) { fs -= 2; c.font = `italic 700 ${fs}px "Helvetica Neue", Arial, sans-serif`; }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const g = c.createLinearGradient(0, 12, 0, 52); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#c3c8ce'); g.addColorStop(0.55, '#767b81'); g.addColorStop(1, '#dde1e5');
  c.fillStyle = g; c.fillText(txt, 128, 34);
  letterCanvas.set(model, cv);
  return cv;
}
function decalSheet(look, info) {
  const cv = document.createElement('canvas'); cv.width = SHEET.w; cv.height = SHEET.h;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, SHEET.w, SHEET.h);
  const pm = plateMaterial(look.plate || { text: 'CAL 000', style: 0 });
  try { c.drawImage(pm.map.image, ...SHEET.plate); } catch (e) { /* ignore */ }
  pm.map.dispose(); pm.dispose();
  if (info?.brand) { const b = badgeArt(info.brand); const [x, y, w, h] = SHEET.badge; const k = Math.min(w / b.width, h / b.height); c.drawImage(b, x + (w - b.width * k) / 2, y + (h - b.height * k) / 2, b.width * k, b.height * k); }
  if (info?.name) { const l = letterArt(info.name); c.drawImage(l, ...SHEET.letter); }
  c.fillStyle = '#ffffff'; c.fillRect(SHEET.white[0] - 4, SHEET.white[1] - 4, SHEET.white[2] + 8, SHEET.white[3] + 8);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  return { texture: tx };
}

// ---------------------------------------------------------------- liveries (police, taxi, bus, ambulance, fire): one decal mesh
let _signTex = null;
const canvasTex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; };
const decalTex = {}, decalMat = {}, decalGeo = new Map();
function liveryMesh(t, kind) {
  decalTex[kind] ||= canvasTex(512, 128, (c) => {
    c.clearRect(0, 0, 512, 128);
    if (kind === 'taxi') { for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#111' : 'rgba(0,0,0,0)'; c.fillRect(i * 16, 90 + j * 16, 16, 16); } c.fillStyle = '#111'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.fillText('SOLANA CAB', 256, 70); }
    else if (kind === 'bus') { c.fillStyle = '#0e8f9a'; c.fillRect(0, 70, 512, 24); c.fillStyle = '#ff7a2b'; c.fillRect(0, 96, 512, 10); c.fillStyle = '#0b2a3a'; c.font = 'bold 34px sans-serif'; c.textAlign = 'left'; c.fillText('SOLANA TRANSIT', 14, 50); }
    else if (kind === 'ambulance') { c.fillStyle = '#c8141c'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('AMBULANCE', 256, 50); c.fillRect(236, 82, 40, 40); c.fillStyle = '#fff'; c.fillRect(250, 86, 12, 32); c.fillRect(240, 96, 32, 12); }
    else if (kind === 'fire') { c.fillStyle = '#f2d14b'; c.fillRect(0, 96, 512, 14); c.fillStyle = '#f7f2e0'; c.font = 'bold 34px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SOUTHLINE FIRE RESCUE', 256, 52, 490); }
    else { c.fillStyle = '#f2f4f7'; c.fillRect(0, 0, 512, 128); c.fillStyle = '#c9a227'; c.fillRect(0, 0, 512, 10); c.fillRect(0, 118, 512, 10); c.fillStyle = '#0b1a33'; c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PSPD', 256, 52); c.font = 'bold 20px sans-serif'; c.fillText('SOUTHLINE POLICE', 256, 100); }
  });
  const mat = decalMat[kind] ||= new THREE.MeshStandardMaterial({ map: decalTex[kind], transparent: true, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  const gk = t.label + '|' + kind;
  let g = decalGeo.get(gk);
  if (!g) {
    let ln = t.wb - 2 * (t.r + 0.14), h = (t.belt - t.yb) * 0.5, y = t.yb + 0.14 + h / 2, zc = -0.05, xw = t.W / 2 + 0.014;
    if (t.box) { const bl = t.box.front + t.L / 2; ln = bl * 0.85; h = ln / 4; zc = (t.box.front - t.L / 2) / 2; y = t.belt + (t.box.top - t.belt) * 0.55; xw = (t.W + 0.06) / 2 + 0.008; }
    if (t.bus) { ln = t.L * 0.8; h = ln / 4; y = t.yb + 0.15 + h / 2; zc = 0; }
    const parts = [];
    for (const s of [1, -1]) { const p = new THREE.PlaneGeometry(ln, h); p.rotateY(s * Math.PI / 2); p.translate(s * xw, y, zc); parts.push(p); }
    const pos = [], uv = [], nor = [], idx = [];
    for (const p of parts) { const b = pos.length / 3; pos.push(...p.attributes.position.array); uv.push(...p.attributes.uv.array); nor.push(...p.attributes.normal.array); for (const i of p.index.array) idx.push(b + i); }
    g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    decalGeo.set(gk, g);
  }
  return new THREE.Mesh(g, mat);
}
// stickers: all of a car's stickers merged into one mesh (one shared atlas from extras.js)
let _stickerAtlas = null;
function stickerAtlasMat() {
  if (_stickerAtlas) return _stickerAtlas;
  // borrow the atlas from extras.js by building a throwaway sticker mesh once
  return null;
}

// ---------------------------------------------------------------- contact shadow
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

// ---------------------------------------------------------------- assemble
/**
 * buildCar(key, look | colorHex, opts) -> car (see src/vehicles/INTERNALS.md section A).
 * Legacy call buildCar(key, color, { kit, wheel: { spokes, rimColor }, blackRoof }) still works.
 */
export function buildCar(typeKey, lookOrColor, opts = {}) {
  if (!CAR_TYPES[typeKey]) typeKey = 'sedan';
  const t = CAR_TYPES[typeKey], info = MODELS[typeKey];
  const look = lookOrColor && typeof lookOrColor === 'object' ? lookOrColor : legacyLook(typeKey, lookOrColor, opts);
  const kit = t.kit || look.kit || 'base';
  const root = new THREE.Group(), shell = new THREE.Group();
  root.add(shell);
  // paint: clear coat with flake, wear, two-tone (lower split or roof + pillars)
  const wear = { dirt: 0, rust: 0, fade: 0, seed: 0, ...(look.wear || {}) };
  const shape = { dirtTop: t.belt + 0.05, halfL: t.L / 2, halfWb: t.wb / 2, r: t.r };
  const finish = look.finish || (t.taxi || t.heavy ? 'gloss' : 'metallic');
  let patch = null;
  if (wear.patch) {
    const zBp = (t.zB + t.zC) / 2 + 0.1, P = wear.patch.panel, W2 = t.W / 2 + 0.2, top = t.belt + 0.25;
    const bx = P === 'hood' ? [[-W2, 0, t.zA + 0.03], [W2, top, t.L / 2 + 0.3]] : P === 'trunk' ? [[-W2, t.belt - 0.3, -t.L / 2 - 0.3], [W2, top, t.zD - 0.05]]
      : P === 'doorFL' ? [[0, 0, zBp], [W2, top, t.zA - 0.05]] : P === 'doorFR' ? [[-W2, 0, zBp], [0, top, t.zA - 0.05]] : P === 'fenderFL' ? [[0, 0, t.zA - 0.05], [W2, top, t.L / 2 - 0.25]] : [[-W2, 0, t.zA - 0.05], [0, top, t.L / 2 - 0.25]];
    patch = { min: bx[0], max: bx[1], color: wear.patch.color, strength: 1 };
  }
  const tt = look.twoTone && look.twoTone.y != null ? { color: look.twoTone.color, y: t.yb + (t.belt - t.yb) * look.twoTone.y } : null;
  const roofColor = t.police === 'bar' && !t.box ? 0xf2f2f2 : look.twoTone?.roof ?? null;
  const roofTone = roofColor != null ? { color: roofColor, y: t.belt + 0.07 } : null;
  const paint = carPaint({ color: look.color, finish, wear, shape, twoTone: tt, patch, roofTone });
  const paintMats = [paint];
  const glass = glassMaterial(look.tint ?? 1);
  const trim = trimMaterial();
  const sheet = decalSheet(look, info);
  const lamps = lampMaterial(sheet, { ambulance: t.police === 'ambulance', fire: t.police === 'fire', busSign: !!t.busLivery, seat: TRIM_COLORS[look.trim] ?? TRIM_COLORS.clothGrey });
  const lightMats = lamps.lightMats;
  for (const k of look.lightsOut || []) { const m = { headL: 'head', headR: 'head', tailL: 'tail', tailR: 'tail' }[k]; if (m && Math.random() < 0) lightMats[m].emissive.setHex(0); }
  // wheels
  const wl = look.wheel || {};
  let style = wheelStyleIds.includes(wl.style) ? wl.style : (t.heavy ? 'truck8' : 'star5');
  const hubcapMissing = (look.missing || []).length && style === 'hubcap';
  if (hubcapMissing) style = 'steel';
  const tireKind = t.offroad ? 'mud' : t.bed || t.heavy ? 'allterrain' : t.cls === 'super' || t.cls === 'sports' ? 'sport' : 'road';
  const caliper = t.cls === 'super' || t.cls === 'sports' || kit === 'sport' ? (t.caliper ?? 0xd8261b) : null;
  const wg = wheelGeometry({ r: t.r, tw: t.tw, style, tire: tireKind, caliper });
  const rimFinish = hubcapMissing ? 'steel' : wl.finish === 'chrome' ? 'chrome' : style === 'steel' ? 'steel' : style === 'hubcap' ? 'plastic' : 'alloy';
  const rimColor = hubcapMissing ? 0x1a1a1c : wl.rimColor ?? t.rimColor ?? (style === 'steel' ? 0x25272a : 0xc9ced3);
  const wMat = wheelMat(rimColor, rimFinish);

  const lod = new THREE.LOD(), slots = { paint: [], glass: [], roof: [] }, levels = [], wheelSets = [];
  let geo0 = null, paint0 = null;
  for (const level of [0, 1, 2]) {
    const geo = buildBodyGeo(t, typeKey, kit, level), g = new THREE.Group();
    if (level === 0) geo0 = geo;
    if (geo.paint) { const m = new THREE.Mesh(geo.paint, paint); m.castShadow = level < 2; m.receiveShadow = level === 0; g.add(m); slots.paint.push(m); if (level === 0) paint0 = m; }
    if (geo.trim) { const m = new THREE.Mesh(geo.trim, trim); m.castShadow = level < 2; m.receiveShadow = level === 0; g.add(m); }
    if (geo.glass) { const m = new THREE.Mesh(geo.glass, glass); m.renderOrder = 2; g.add(m); slots.glass.push(m); }
    if (geo.lamp) { const m = new THREE.Mesh(geo.lamp, lamps.material); g.add(m); }
    if (level < 2) { const ws = wheelSet(level === 0 ? wg.hi : wg.lo, wMat, t.L); ws.userData.maxY = t.r + geo.D.archGap - 0.015; g.add(ws); wheelSets.push(ws); }
    levels.push(g);
  }
  const big = t.heavy ? 2.2 : 1;
  lod.addLevel(levels[0], 0);
  lod.addLevel(levels[1], 34 * big, 0.12);
  lod.addLevel(levels[2], 105 * big, 0.12);
  shell.add(lod);
  const contact = new THREE.Mesh(CONTACT_GEO, contactMat());
  contact.scale.set(t.W + 0.5, t.L + 0.7, 1); contact.rotation.x = -Math.PI / 2; contact.position.y = 0.025; contact.renderOrder = 1; contact.userData.contactShadow = true;
  shell.add(contact);
  const detail = levels[0], mid = levels[1], A = geo0.anchors;
  const livery = t.taxi ? 'taxi' : t.police === 'bar' ? 'police' : t.busLivery ? 'bus' : t.ambulance ? 'ambulance' : t.fire ? 'fire' : null;
  if (livery) { detail.add(liveryMesh(t, livery)); mid.add(liveryMesh(t, livery)); }
  // pre-existing dents (real vertex deformation; clones the paint geometry for this car only)
  for (const d of look.dents || []) dentMesh(paint0, { x: d.x, y: d.y, z: d.z, cy: t.belt * 0.7 }, d.depth, d.radius);
  // accessories and dash clutter (only on cars that roll them; shared vertex-color material)
  if (look.accessories?.length) { const am = accessoryMesh(look.accessories, t, A, typeKey); if (am) { detail.add(am); mid.add(am.clone()); } }
  const dm = dashItemsMesh(look.dash || [], t, A, look.seed || 0); if (dm) detail.add(dm);

  // wheel nodes (vehicles.js drives steer position / rotation and spin.rotation.x)
  const susp = t.susp || [0.36, 34], restY = -(susp[0] - 9.81 / (4 * susp[1]));
  // [car-bodies C1] tuck each axle so the tire's outer face sits >= 2.5 cm inside the widest body over the arch
  const wheelX = { F: 9, R: 9, steerMax: 0.62 };
  if (geo0?.paint && geo0.D) {
    const a = geo0.paint.attributes.position.array, D = geo0.D;
    for (const [k, wz] of [['F', t.wb / 2], ['R', -t.wb / 2]]) {
      let mx = 0;
      for (let i = 0; i < a.length; i += 3) { const y = a[i + 1]; if (Math.abs(a[i + 2] - wz) < t.r * 0.55 && y > D.wcy && y < D.wcy + D.Ra + 0.2) mx = Math.max(mx, Math.abs(a[i])); }
      if (mx > 0.3) wheelX[k] = mx - t.tw / 2 - 0.025;
    }
    // visual steer limit: the front-outer tire corner must stay inside the body wall (sampled ahead of the axle)
    const wz = t.wb / 2, bins = new Float32Array(24); // wall half-width over z in [wz, wz + 1.2 r], at hub height and above
    for (let i = 0; i < a.length; i += 3) { const dz = a[i + 2] - wz, y = a[i + 1]; if (dz < 0 || dz >= t.r * 1.2 || y < D.wcy - 0.05 || y > D.wcy + D.Ra + 0.1) continue; const b = Math.min(23, (dz / (t.r * 1.2) * 24) | 0); bins[b] = Math.max(bins[b], Math.abs(a[i])); }
    const xc = Math.min(t.W / 2 - t.tw / 2 - 0.03, wheelX.F);
    let lim = 0.62;
    for (let th = 0.05; th <= 0.62; th += 0.01) {
      const cx = xc + (t.tw / 2) * Math.cos(th) + t.r * 0.92 * Math.sin(th), cz = t.r * 0.92 * Math.cos(th) - (t.tw / 2) * Math.sin(th);
      const b = Math.min(23, Math.max(0, (cz / (t.r * 1.2) * 24) | 0));
      if (bins[b] > 0.3 && cx > bins[b] + 0.03) { lim = th - 0.01; break; }
    }
    wheelX.steerMax = Math.max(0.3, lim); // never below ~17 deg: a little tire showing at full lock is normal
  }
  const wheels = [];
  [[1, true], [-1, true], [1, false], [-1, false]].forEach(([side, front]) => {
    const steer = new THREE.Group(), spin = new THREE.Group();
    steer.add(spin);
    const x = side * Math.min(t.W / 2 - t.tw / 2 - 0.03, front ? wheelX.F : wheelX.R), z = front ? t.wb / 2 : -t.wb / 2;
    steer.position.set(x, restY, z);
    root.add(steer);
    wheels.push({ steer, spin, side, front, detail: [], lo: null, tireMesh: null, flatGeo: null, tireGeo: null, x, z, r: t.r });
  });
  // per frame (called by the renderer through the LOD): wheel instances follow the wheel nodes; lamp channels follow lightMats
  const lodUpdate = lod.update.bind(lod);
  lod.update = (camera) => {
    lodUpdate(camera);
    for (const ws of wheelSets) if (ws.parent.visible) syncWheelSet(ws, wheels);
    lamps.sync();
  };
  lamps.sync();
  const steeringWheel = new THREE.Group(); detail.add(steeringWheel);
  const seatZ = t.zA - (t.coupe ? 1.05 : 1.15);
  const car = {
    steerMax: wheelX.steerMax, root, shell, wheels, lightMats, spec: t, paint, paintMats, parts: { paint: paint0, roof: null }, slots, deformable: paint0 ? [paint0] : [], steeringWheel, wipers: [], info, lod, kit, look,
    hull: geo0.hull, plate: { text: look.plate?.text || '' }, _res: [acquire('b|' + typeKey + '|' + kit, () => bodyGeos(typeKey, kit))], anchors: A, wheelSets,
    seats: [{ x: 0.38, y: t.belt - 0.25, z: seatZ }, { x: -0.38, y: t.belt - 0.25, z: seatZ }, ...(t.coupe ? [] : [{ x: 0.38, y: t.belt - 0.25, z: seatZ - 0.95 }, { x: -0.38, y: t.belt - 0.25, z: seatZ - 0.95 }])],
    dispose() {
      paint.dispose(); lamps.material.dispose(); sheet.texture.dispose(); wMat.dispose();
      for (const ws of wheelSets) ws.dispose();
      if (paint0?.userData.ownGeo) paint0.geometry.dispose();
    },
  };
  return car;
}

// ---------------------------------------------------------------- GPU residency (unchanged contract)
const residency = new Map();
const gpuStats = { acquires: 0, releases: 0, evictions: 0, geosFreed: 0, ownFreed: 0 };
function bodyGeos(key, kit) { const out = []; for (const l of [0, 1, 2]) { const r = buildBodyGeo(CAR_TYPES[key], key, kit, l); for (const k of ['paint', 'trim', 'glass', 'lamp']) if (r[k]) out.push(r[k]); } return out; }
function acquire(k, geosFn) { let e = residency.get(k); if (!e) { e = { refs: 0, geos: geosFn(), idleSince: 0, resident: true }; residency.set(k, e); } e.refs++; e.resident = true; e.idleSince = 0; gpuStats.acquires++; return k; }
export function releaseCar(car) {
  if (!car || !car._res) return;
  const now = performance.now();
  for (const k of car._res) { const e = residency.get(k); if (!e) continue; e.refs = Math.max(0, e.refs - 1); if (!e.refs) e.idleSince = now; gpuStats.releases++; }
  car._res = null;
  try { car.dispose?.(); } catch (e) { /* ignore */ }
}
export function evictIdleModels(idleMs = 30000, max = 2) {
  const now = performance.now(); let n = 0;
  for (const e of residency.values()) { if (e.refs || !e.resident || !e.idleSince || now - e.idleSince < idleMs) continue; for (const g of e.geos) g.dispose(); e.resident = false; gpuStats.evictions++; gpuStats.geosFreed += e.geos.length; if (++n >= max) break; }
  return n;
}
export function noteOwnGeoFreed(n = 1) { gpuStats.ownFreed += n; }
export function modelGpuStats() { let resident = 0, residentGeos = 0, inUse = 0; for (const e of residency.values()) { if (e.resident) { resident++; residentGeos += e.geos.length; } if (e.refs) inUse++; } return { ...gpuStats, models: residency.size, resident, residentGeos, inUse }; }

const built = new Set();
export function isBuilt(key, kit = 'base') { return !!CAR_TYPES[key] && built.has(key + '|' + kit); }
export function wheelBuilt() { return true; }
export function prebuild(key, kit = 'base') {
  const t = CAR_TYPES[key]; if (!t) return;
  for (const l of [0, 1, 2]) buildBodyGeo(t, key, kit, l);
  wheelGeometry({ r: t.r, tw: t.tw, style: t.heavy ? 'truck8' : 'star5', tire: 'road', caliper: null });
  built.add(key + '|' + kit);
}
/** triangle / draw-call audit for one model: -> { lod0: { tris, calls }, lod1, lod2 } (wheels: +1 call, tris listed separately) */
export function modelStats(key, kit = 'base') {
  const t = CAR_TYPES[key], out = {};
  for (const l of [0, 1, 2]) { const b = buildBodyGeo(t, key, kit, l); out['lod' + l] = { ...b.stats }; }
  const wg = wheelGeometry({ r: t.r, tw: t.tw, style: t.heavy ? 'truck8' : 'star5', tire: 'road', caliper: null });
  out.wheelTris = { lod0: wg.hi.attributes.position.count / 3 * 4, lod1: wg.lo.attributes.position.count / 3 * 4 };
  out.lod0.calls += 1; out.lod1.calls += 1; out.lod0.tris += out.wheelTris.lod0; out.lod1.tris += out.wheelTris.lod1;
  return out;
}

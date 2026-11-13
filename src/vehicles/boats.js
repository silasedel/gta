// Port Solana boats: original procedural hulls + multi-point buoyancy physics, wake/foam, police boats.
// Exposed through game.vehicles (nearest / enter / exit / HUD speed / AUDIO model fields).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSkids } from './skids.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fin = (x, f = 0) => (Number.isFinite(x) ? x : f);
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- catalogue (all invented brands)
export const BOAT_TYPES = {
  console: { trimDeg: 7, brand: 'Tarpon', name: 'Reef 24 CC', L: 7.2, W: 2.5, draft: 0.45, sheer: 0.75, bowRise: 0.45, mass: 1800, thrust: 15000, vmax: 72, turn: 1.0,
    engine: 'outboard', engines: 2, colors: [0xf4f4f2, 0x1d3f8f, 0x0e5e7a], stripe: 0x1fb5b0, console: true, tTop: true },
  racer: { trimDeg: 5.5, brand: 'Vireo', name: 'Offshore 39', L: 11.5, W: 2.6, draft: 0.5, sheer: 0.85, bowRise: 0.5, mass: 3000, thrust: 36000, vmax: 125, turn: 0.75,
    engine: 'inboard', engines: 2, colors: [0xffc21a, 0xb3121b, 0x101214, 0xf2f2f2], stripe: 0x101214, cockpit: true, pointy: true },
  cruiser: { trimDeg: 5, brand: 'Aurelia', name: 'Bayliner 34', L: 10.5, W: 3.4, draft: 0.75, sheer: 1.25, bowRise: 0.5, mass: 5500, thrust: 30000, vmax: 58, turn: 0.7,
    engine: 'inboard', engines: 2, colors: [0xf4f4f2, 0xe7dcc4], stripe: 0x173b8f, cabin: true },
  jetski: { trimDeg: 3, brand: 'Pico', name: 'WaveRider', L: 3.2, W: 1.2, draft: 0.22, sheer: 0.45, bowRise: 0.18, mass: 350, thrust: 4200, vmax: 95, turn: 1.8,
    engine: 'jetski', engines: 1, colors: [0xff5a1f, 0x9be22d, 0x2a8cff, 0xffc21a], stripe: 0x101214, jet: true },
  skiff: { trimDeg: 6, brand: 'Corvo', name: 'Flats 17', L: 5.2, W: 1.9, draft: 0.3, sheer: 0.55, bowRise: 0.25, mass: 700, thrust: 5000, vmax: 50, turn: 1.2,
    engine: 'outboard', engines: 1, colors: [0xd8cdb0, 0x2f6d3a, 0xa9aeb4], stripe: 0x5a6470, skiff: true },
  police: { trimDeg: 6.5, brand: 'Marlin', name: 'Patrol 29', L: 8.8, W: 2.8, draft: 0.5, sheer: 0.85, bowRise: 0.45, mass: 3200, thrust: 26000, vmax: 95, turn: 0.95,
    engine: 'outboard', engines: 2, colors: [0x0b1a33], stripe: 0xf2f2f2, console: true, tTop: true, police: true },
};
const MAXRPM = { outboard: 6000, inboard: 5200, jetski: 7500 };

// ---------------------------------------------------------------- materials
let M = null;
function mats() {
  if (M) return M;
  M = {
    deck: new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.85, side: THREE.DoubleSide }),
    teak: new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.7 }),
    under: new THREE.MeshStandardMaterial({ color: 0x8a2a24, roughness: 0.6, side: THREE.DoubleSide }), // antifouling
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.1 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.2 }),
    seat: new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.55 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1118, roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1 }),
    engine: new THREE.MeshPhysicalMaterial({ color: 0x1b1d20, metalness: 0.4, roughness: 0.3, clearcoat: 1 }),
    canvas: new THREE.MeshStandardMaterial({ color: 0x1c2a3a, roughness: 0.9 }),
    paints: new Map(),
  };
  return M;
}
function paint(c) {
  const m = mats();
  if (!m.paints.has(c)) m.paints.set(c, new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.15, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }));
  return m.paints.get(c);
}
function textTexture(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const decals = new Map();
function decalMat(text, color) {
  const k = text + color;
  if (!decals.has(k)) decals.set(k, new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.4,
    map: textTexture(512, 96, (c) => { c.clearRect(0, 0, 512, 96); c.fillStyle = color; c.font = 'italic bold 60px sans-serif'; c.textBaseline = 'middle'; c.fillText(text, 12, 50); }) }));
  return decals.get(k);
}

// ---------------------------------------------------------------- hull geometry (lofted V-hull with chines)
// local frame: +z bow, y=0 waterline at design draft, x left (port = +x)
function hullSections(t) {
  const L = t.L, hw = t.W / 2;
  const N = 28, out = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;                               // 0 transom .. 1 bow tip
    const z = -L / 2 + u * L;
    const bowT = clamp((u - 0.55) / 0.45, 0, 1);  // forward 45% narrows to the stem
    const w = hw * (t.pointy ? Math.cos(bowT * Math.PI / 2) ** 1.1 : Math.sqrt(Math.max(0, 1 - bowT * bowT))) * (1 - 0.06 * (1 - u));
    const keel = -t.draft + t.bowRise * bowT * bowT * 1.6;          // keel rises toward the bow
    const sheer = t.sheer + t.bowRise * 0.6 * bowT * bowT;          // sheer rises toward the bow
    const chineY = keel + (t.draft * 0.55);
    out.push({ z, w: Math.max(0.001, w), keel, chineY, sheer });
  }
  return out;
}
function buildHull(t) {
  const S = hullSections(t);
  const pos = [], idx = [];
  // ring per section: sheerL, chineL, keel, chineR, sheerR (+ flare point under sheer)
  const ring = (s) => [
    [s.w, s.sheer], [s.w * 1.02, (s.sheer + s.chineY) / 2], [s.w * 0.92, s.chineY], [0, s.keel], [-s.w * 0.92, s.chineY], [-s.w * 1.02, (s.sheer + s.chineY) / 2], [-s.w, s.sheer],
  ];
  const R = 7;
  for (const s of S) for (const [x, y] of ring(s)) pos.push(x, y, s.z);
  for (let i = 0; i < S.length - 1; i++) for (let k = 0; k < R - 1; k++) {
    const a = i * R + k, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // transom
  const tc = pos.length / 3; pos.push(0, (S[0].sheer + S[0].keel) / 2, S[0].z);
  for (let k = 0; k < R - 1; k++) idx.push(tc, k + 1, k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // split: topsides (paint) vs bottom (antifouling) by height
  const ng = g.toNonIndexed();
  const p = ng.attributes.position, n = ng.attributes.normal;
  const top = [], topN = [], bot = [], botN = [];
  for (let i = 0; i < p.count; i += 3) {
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const [A, B] = cy > -0.02 ? [top, topN] : [bot, botN];
    for (let k = 0; k < 3; k++) { A.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k)); B.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k)); }
  }
  const mk = (P, N) => { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return gg; };
  // deck = plan outline at sheer height (slightly inset)
  const sh = new THREE.Shape();
  sh.moveTo(S[0].w * 0.96, S[0].z);
  for (const s of S) sh.lineTo(s.w * 0.96, s.z);
  for (let i = S.length - 1; i >= 0; i--) sh.lineTo(-S[i].w * 0.96, S[i].z);
  const deck = new THREE.ShapeGeometry(sh, 2); deck.rotateX(Math.PI / 2);
  // ShapeGeometry is in XY -> after rotateX: y -> z ; place at average sheer (follow sheer by vertex)
  const dp = deck.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const z = dp.getZ(i); const u = clamp((z + t.L / 2) / t.L, 0, 1);
    const s = S[Math.min(S.length - 1, Math.round(u * (S.length - 1)))];
    dp.setY(i, s.sheer - 0.04);
  }
  deck.computeVertexNormals();
  return { topsides: mk(top, topN), bottom: mk(bot, botN), deck, sections: S };
}

const box = (g, sx, sy, sz, x, y, z, rx = 0, ry = 0) => { const b = new THREE.BoxGeometry(sx, sy, sz); if (rx || ry) b.rotateX(rx).rotateY(ry); b.translate(x, y, z); g.push(b); };
const geoCache = new Map();
function buildBoatGeometry(key) {
  if (geoCache.has(key)) return geoCache.get(key);
  const t = BOAT_TYPES[key];
  const H = buildHull(t), S = H.sections;
  const at = (z) => S[clamp(Math.round(((z + t.L / 2) / t.L) * (S.length - 1)), 0, S.length - 1)];
  const parts = { chrome: [], trim: [], seat: [], glass: [], engine: [], teak: [], canvas: [], paint: [] };
  const L = t.L, W = t.W;
  // strakes along the bottom + rub rail along the sheer
  for (const sx of [1, -1]) {
    for (let i = 2; i < S.length - 3; i += 1) {
      const s = S[i], s2 = S[i + 1];
      box(parts.trim, 0.05, 0.04, s2.z - s.z + 0.02, sx * s.w * 0.55, (s.keel + s.chineY) / 2 + 0.02, (s.z + s2.z) / 2);
      box(parts.trim, 0.06, 0.06, s2.z - s.z + 0.02, sx * s.w * 1.0, s.sheer - 0.02, (s.z + s2.z) / 2);
    }
  }
  const deckY = (z) => at(z).sheer - 0.04;
  // bow rails
  if (!t.jet) for (const sx of [1, -1]) {
    for (let i = Math.floor(S.length * 0.45); i < S.length - 2; i++) {
      const s = S[i], s2 = S[i + 1];
      const g = new THREE.CylinderGeometry(0.018, 0.018, Math.hypot(s2.z - s.z, s2.w - s.w) + 0.02, 6); g.rotateX(Math.PI / 2);
      g.rotateY(Math.atan2(sx * (s2.w - s.w), s2.z - s.z)); g.translate(sx * (s.w + s2.w) / 2 * 0.9, s.sheer + 0.32, (s.z + s2.z) / 2); parts.chrome.push(g);
      if (i % 3 === 0) { const st = new THREE.CylinderGeometry(0.015, 0.015, 0.32, 6); st.translate(sx * s.w * 0.9, s.sheer + 0.16, s.z); parts.chrome.push(st); }
    }
  }
  // engines at the transom
  const tz = -L / 2;
  if (t.engine === 'outboard') {
    for (let e = 0; e < t.engines; e++) {
      const x = t.engines === 1 ? 0 : (e ? -0.42 : 0.42);
      box(parts.engine, 0.42, 0.7, 0.55, x, S[0].sheer + 0.2, tz - 0.25);          // cowling
      box(parts.engine, 0.16, 0.9, 0.22, x, S[0].keel + 0.25, tz - 0.32);           // leg
      box(parts.trim, 0.36, 0.06, 0.5, x, S[0].keel - 0.15, tz - 0.36);             // cavitation plate / skeg
    }
  } else if (t.engine === 'inboard') {
    box(parts.teak, W * 0.8, 0.06, 0.6, 0, S[0].keel + t.draft * 0.9, tz - 0.3);  // swim platform
    for (let e = 0; e < t.engines; e++) box(parts.chrome, 0.12, 0.12, 0.25, e ? -0.5 : 0.5, S[0].keel + 0.35, tz - 0.05);
  } else {
    box(parts.trim, 0.3, 0.2, 0.25, 0, S[0].keel + 0.15, tz - 0.08); // jet nozzle
  }
  // type-specific superstructure
  const midZ = -L * 0.08;
  if (t.console) {
    box(parts.paint, 0.9, 1.0, 0.8, 0, deckY(midZ) + 0.5, midZ);
    box(parts.glass, 0.95, 0.4, 0.04, 0, deckY(midZ) + 1.15, midZ + 0.38, -0.35);
    box(parts.seat, 1.0, 0.25, 0.6, 0, deckY(midZ) + 0.45, midZ - 1.0);
    box(parts.seat, 1.0, 0.6, 0.2, 0, deckY(midZ) + 0.75, midZ - 1.3);
    box(parts.seat, W * 0.6, 0.35, 0.8, 0, deckY(L * 0.3) + 0.2, L * 0.3);           // bow seating
    if (t.tTop) {
      for (const sx of [0.45, -0.45]) for (const sz of [0.3, -1.3]) { const p = new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6); p.translate(sx, deckY(midZ) + 0.95, midZ + sz); parts.chrome.push(p); }
      box(parts.canvas, 1.5, 0.08, 2.2, 0, deckY(midZ) + 1.95, midZ - 0.5);
    }
  }
  if (t.cockpit) {
    box(parts.glass, W * 0.75, 0.35, 0.05, 0, deckY(0) + 0.25, L * 0.05, -0.9);
    for (const sx of [0.45, -0.45]) { box(parts.seat, 0.55, 0.5, 0.6, sx, deckY(-L * 0.1) + 0.1, -L * 0.1); box(parts.seat, 0.55, 0.6, 0.15, sx, deckY(-L * 0.1) + 0.4, -L * 0.1 - 0.35); }
    box(parts.trim, W * 0.7, 0.06, L * 0.25, 0, deckY(-L * 0.32) + 0.04, -L * 0.32);   // engine hatch vents
  }
  if (t.cabin) {
    box(parts.paint, W * 0.78, 0.9, L * 0.38, 0, deckY(L * 0.05) + 0.45, L * 0.05);
    box(parts.glass, W * 0.8, 0.35, L * 0.36, 0, deckY(L * 0.05) + 0.8, L * 0.05);
    box(parts.paint, W * 0.7, 0.08, L * 0.36, 0, deckY(L * 0.05) + 1.0, L * 0.02);
    box(parts.seat, W * 0.7, 0.4, 1.0, 0, deckY(-L * 0.3) + 0.2, -L * 0.3);
    box(parts.teak, W * 0.85, 0.03, L * 0.25, 0, deckY(-L * 0.3) + 0.01, -L * 0.3);
  }
  if (t.skiff) {
    box(parts.seat, W * 0.75, 0.08, 0.35, 0, deckY(0) + 0.3, 0);
    box(parts.seat, W * 0.6, 0.35, 0.5, 0, deckY(-L * 0.35) + 0.15, -L * 0.35);
  }
  if (t.jet) {
    box(parts.seat, 0.45, 0.25, 1.4, 0, deckY(-0.3) + 0.22, -0.3);
    box(parts.paint, 0.55, 0.3, 0.6, 0, deckY(0.6) + 0.2, 0.6);
    box(parts.chrome, 0.75, 0.04, 0.04, 0, deckY(0.6) + 0.5, 0.55);
  }
  if (t.police) {
    box(parts.trim, 1.3, 0.08, 0.35, 0, deckY(midZ) + 2.05, midZ - 0.2);
  }
  const out = { hull: H, parts: {} };
  for (const k in parts) if (parts[k].length) out.parts[k] = mergeGeometries(parts[k].map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal') n.deleteAttribute(a); return n; }), false);
  // hull point cloud for the convex collider
  const hp = [];
  for (const s of S) for (const [x, y] of [[s.w, s.sheer], [s.w * 0.92, s.chineY], [0, s.keel], [-s.w * 0.92, s.chineY], [-s.w, s.sheer]]) hp.push(x, y, s.z);
  out.hullPts = new Float32Array(hp);
  geoCache.set(key, out);
  return out;
}

// small per-boat parts share geometry (per type for the decal plate) so spawning boats allocates no GPU buffers
const SHG = { nav: null, pole: null, bar: null, decal: new Map() };
function sharedGeo(k, mk) { return SHG[k] || (SHG[k] = mk()); }
function buildBoatMesh(key, color) {
  const t = BOAT_TYPES[key], m = mats(), G = buildBoatGeometry(key);
  const root = new THREE.Group();
  const add = (g, mat, cast = true) => { const me = new THREE.Mesh(g, mat); me.castShadow = cast; me.receiveShadow = true; root.add(me); return me; };
  const hullMat = paint(color);
  add(G.hull.topsides, hullMat); add(G.hull.bottom, m.under); add(G.hull.deck, m.deck, false);
  for (const k in G.parts) add(G.parts[k], k === 'paint' ? hullMat : k === 'glass' ? m.glass : m[k] || m.trim, k !== 'glass');
  // boot stripe + brand decals
  const S = G.hull.sections, mid = S[Math.floor(S.length * 0.45)];
  const dm = decalMat(t.police ? 'PSPD MARINE' : `${t.brand.toUpperCase()} ${t.name}`, t.police ? '#f2f2f2' : '#' + (t.stripe >>> 0).toString(16).padStart(6, '0'));
  for (const sx of [1, -1]) {
    const pl = new THREE.Mesh(SHG.decal.get(key) || SHG.decal.set(key, new THREE.PlaneGeometry(t.L * 0.32, t.L * 0.06)).get(key), dm);
    pl.position.set(sx * (mid.w * 1.02 + 0.012), (mid.sheer + mid.chineY) / 2 + 0.05, -t.L * 0.05); pl.rotation.y = sx * Math.PI / 2;
    root.add(pl);
  }
  // navigation lights: port red (+x), starboard green (-x), white stern pole
  const lightMats = {
    red: new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 0.2 }),
    green: new THREE.MeshStandardMaterial({ color: 0x003000, emissive: 0x10ff40, emissiveIntensity: 0.2 }),
    white: new THREE.MeshStandardMaterial({ color: 0x808080, emissive: 0xffffff, emissiveIntensity: 0.2 }),
    bar: new THREE.MeshStandardMaterial({ color: 0x000a40, emissive: 0x1a3cff, emissiveIntensity: 0.2 }),
  };
  const bowS = S[S.length - 4];
  const nl = (mat, x, y, z) => { const me = new THREE.Mesh(sharedGeo('nav', () => new THREE.BoxGeometry(0.08, 0.06, 0.12)), mat); me.position.set(x, y, z); root.add(me); };
  nl(lightMats.red, bowS.w * 0.8, bowS.sheer + 0.06, bowS.z); nl(lightMats.green, -bowS.w * 0.8, bowS.sheer + 0.06, bowS.z);
  const pole = new THREE.Mesh(sharedGeo('pole', () => new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6)), m.chrome); pole.position.set(0, S[2].sheer + 0.55, S[2].z); root.add(pole);
  nl(lightMats.white, 0, S[2].sheer + 1.12, S[2].z);
  if (t.police) { const b = new THREE.Mesh(sharedGeo('bar', () => new THREE.BoxGeometry(1.1, 0.12, 0.25)), lightMats.bar); b.position.set(0, S[Math.floor(S.length * 0.42)].sheer + 2.12, -t.L * 0.08 - 0.2); root.add(b); }
  return { root, lightMats, hullPts: G.hullPts, spec: t };
}

// ---------------------------------------------------------------- system
export function createBoats(game, opts = {}) {
  const { RAPIER, world, scene } = game;
  const city = game.city;
  const SEA = city?.seaLevel ?? -0.12;
  const boats = [];
  const QF = RAPIER.QueryFilterFlags;
  const foam = createSkids(scene, 900);
  foam.mesh.material.uniforms.color.value.setRGB(0.95, 0.97, 1.0);
  foam.mesh.material.depthTest = true;
  const isWater = (x, z) => (city?.isWater ? city.isWater(x, z) : false);
  const bedY = (x, z) => (city?.groundHeightAt ? city.groundHeightAt(x, z) : SEA - 5);
  const env = game.env;
  // water surface: the ocean module's height if it exposes one, else gentle swell
  const waterY = (x, z, t) => {
    const e = env?.waterHeightAt?.(x, z, t) ?? env?.waveHeightAt?.(x, z, t);
    if (Number.isFinite(e)) return e;
    return SEA + 0.12 * Math.sin(x * 0.045 + t * 0.9) + 0.08 * Math.sin(z * 0.06 - t * 1.1) + 0.04 * Math.sin((x + z) * 0.13 + t * 1.7);
  };
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
  let nameN = 0;

  function makeBoat(key, pos, heading, o = {}) {
    const t = BOAT_TYPES[key];
    const color = o.color ?? t.colors[(Math.random() * t.colors.length) | 0];
    const mesh = buildBoatMesh(key, color);
    scene.add(mesh.root);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, heading);
    const m = t.mass, L = t.L, W = t.W, Hh = t.sheer + t.draft;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, SEA + 0.05, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.05).setAngularDamping(0.3).setCanSleep(false)
      .setAdditionalMassProperties(m, { x: 0, y: -t.draft * 0.3, z: -L * 0.05 }, { x: m / 12 * (Hh * Hh + L * L), y: m / 12 * (W * W + L * L), z: m / 12 * (W * W + Hh * Hh) * 1.4 }, { x: 0, y: 0, z: 0, w: 1 }));
    let col = null;
    try { const hd = RAPIER.ColliderDesc.convexHull(mesh.hullPts); if (hd) col = world.createCollider(hd.setDensity(0).setFriction(0.6).setRestitution(0.2), body); } catch (e) { col = null; }
    if (!col) col = world.createCollider(RAPIER.ColliderDesc.cuboid(W / 2, Hh / 2, L / 2).setTranslation(0, (t.sheer - t.draft) / 2, 0).setDensity(0).setFriction(0.6), body);
    try { body.recomputeMassPropertiesFromColliders(); } catch (e) { /* ignore */ }
    // float points (local): 3 stations x 2 sides + bow + stern keel
    const floats = [];
    for (const zf of [-0.38, -0.05, 0.25]) for (const sx of [1, -1]) floats.push(new THREE.Vector3(sx * W * 0.32, -t.draft * 0.6, zf * L));
    floats.push(new THREE.Vector3(0, -t.draft * 0.4, L * 0.42), new THREE.Vector3(0, -t.draft * 0.8, -L * 0.45));
    const b = {
      isBoat: true, typeKey: key, spec: t, name: o.name || `${t.brand} ${t.name} #${++nameN}`,
      body, mesh: mesh.root, car: null, lightMats: mesh.lightMats, collider: col, floats, groundOff: t.draft,
      ctrl: { throttle: 0, steer: 0, brake: 0, handbrake: false }, playerDriven: false, ai: null, police: !!t.police,
      speed: 0, speedKmh: 0, rpm: 0, gear: 1, throttle: 0, load: 0, engineOn: false, submerged: 0, alive: true, disposed: false,
      velocity: new THREE.Vector3(), health: 1000, disabled: false, locked: false, beached: false, wakeT: 0, ccd: false,
      model: { key, brand: t.brand, name: t.name, class: 'boat', engine: t.engine, maxRpm: MAXRPM[t.engine], idleRpm: 700, gears: [1],
        sound: { engine: t.engine, cylinders: t.engine === 'inboard' ? 8 : t.engine === 'jetski' ? 3 : 6, aspiration: 'na', exhaust: t.engine === 'inboard' ? 'loud' : 'sporty', count: t.engines } },
      setControls(c) { this.ctrl.throttle = clamp(+c.throttle || 0, -1, 1); this.ctrl.steer = clamp(+c.steer || 0, -1, 1); this.ctrl.brake = clamp(+c.brake || 0, 0, 1); this.ctrl.handbrake = !!c.handbrake; },
      seatPosition() { const tr = body.translation(), r = body.rotation(); _q.set(r.x, r.y, r.z, r.w); return new THREE.Vector3(0, t.sheer + 0.3, -L * 0.15).applyQuaternion(_q).add(_v.set(tr.x, tr.y, tr.z)); },
      exitPosition() { return exitSpot(this); },
      horn() { /* boats: no horn */ },
      flip() { const tr = body.translation(); placeBoat(this, { x: tr.x, z: tr.z }, this.heading); },
      siren(on) { this.sirenOn = on === undefined ? !this.sirenOn : !!on; return this.sirenOn; },
      setChaseTarget(tg) { this.chaseTarget = tg || null; if (this.police && tg) this.sirenOn = true; },
      get position() { const tr = body.translation(); return new THREE.Vector3(tr.x, tr.y, tr.z); },
      get heading() { const r = body.rotation(); _q.set(r.x, r.y, r.z, r.w); _v.set(0, 0, 1).applyQuaternion(_q); return Math.atan2(_v.x, _v.z); },
      external: !!o.external,
    };
    boats.push(b);
    return b;
  }
  function placeBoat(b, p, heading) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, heading);
    b.body.setTranslation({ x: p.x, y: SEA + 0.05, z: p.z }, true); b.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    b.body.setLinvel({ x: 0, y: 0, z: 0 }, true); b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  // give a mooring back to the CITY only while its tile is streamed in (its static boat collider is live then);
  // releasing against an unloaded tile once touched a stale collider and panicked the physics world
  const pendingRelease = new Map();
  function flushReleases() {
    for (const [id, p] of pendingRelease) {
      if (city?.collidersReadyAt && !city.collidersReadyAt(p.x, p.z)) continue;
      const listed = typeof city?.moorings === 'function' ? city.moorings(p.x, p.z, 3).some((m) => m.id === id) : true;
      if (!listed) continue;
      pendingRelease.delete(id);
      try { city?.releaseMooring?.(id); } catch (e) { console.warn('[boats] releaseMooring', e); }
    }
  }
  function removeBoat(b) {
    const i = boats.indexOf(b); if (i < 0 || b.playerDriven) return false;
    boats.splice(i, 1); b.alive = false; b.disposed = true; scene.remove(b.mesh);
    if (b.moorId != null && !b.everDriven) pendingRelease.set(b.moorId, b.moorPos || b.body.translation());
    for (const k in b.lightMats) b.lightMats[k].dispose();
    foam.end(b.name);
    try { world.removeRigidBody(b.body); } catch (e) { /* ignore */ }
    return true;
  }

  // ---- exit: dock / land within 4 m, else the water beside the hull (player swims)
  const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  // a standable deck/quay/beach surface at (x, z): the highest fixed surface between the water and ~1.5 m above it
  // (rays start low, so a neighbouring roof or cabin top is never picked), with ~1.8 m of headroom above it
  const _uray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  function deckAt(x, z, maxY) {
    _ray.origin = { x, y: maxY, z }; _ray.dir = { x: 0, y: -1, z: 0 };
    const hit = world.castRay(_ray, maxY - (SEA - 0.3), true, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS);
    if (!hit) return null;
    const y = maxY - (hit.timeOfImpact ?? hit.toi);
    if (y < SEA + 0.05) return null; // that is the seabed / a submerged step: water
    _uray.origin = { x, y: y + 0.15, z }; _uray.dir = { x: 0, y: 1, z: 0 };
    if (world.castRay(_uray, 1.75, true, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS)) return null; // no headroom (under a roof / inside a structure)
    return y;
  }
  function exitSpot(b) {
    const tr = b.body.translation(), r = b.body.rotation(); _q.set(r.x, r.y, r.z, r.w);
    const t = b.spec;
    const cands = [];
    for (const d of [t.W / 2 + 0.8, t.W / 2 + 1.8, t.W / 2 + 3.0, 4.0]) for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2; cands.push([Math.cos(ang) * d, Math.sin(ang) * (d + t.L * 0.3)]); }
    // marina berths: the dock is often off the bow or stern (bow/stern-in moorings), a few metres beyond the hull
    for (const ext of [0.8, 1.8, 3.0, 4.5]) for (const end of [-1, 1]) for (const lat of [0, 0.35, -0.35]) cands.push([lat * t.W, end * (t.L / 2 + ext)]);
    // pass 1: dock decks near water level (<= 1.5 m above it); nearest to the hull wins
    let best = null, bd = 1e9;
    for (const [lx, lz] of cands) {
      _v.set(lx, 0, lz).applyQuaternion(_q); const x = tr.x + _v.x, z = tr.z + _v.z;
      const y = deckAt(x, z, SEA + 1.5); if (y == null) continue;
      const d = Math.hypot(_v.x, _v.z); if (d < bd) { bd = d; best = new THREE.Vector3(x, y, z); }
    }
    if (best) return best;
    // pass 2 (beached on a sloping shore / higher quay): any standable surface up to 3 m above the hull
    for (const [lx, lz] of cands) {
      _v.set(lx, 0, lz).applyQuaternion(_q); const x = tr.x + _v.x, z = tr.z + _v.z;
      const y = deckAt(x, z, tr.y + 3); if (y == null) continue;
      const d = Math.hypot(_v.x, _v.z); if (d < bd) { bd = d; best = new THREE.Vector3(x, y, z); }
    }
    if (best) return best;
    _v.set(t.W / 2 + 1.2, 0, 0).applyQuaternion(_q);
    return new THREE.Vector3(tr.x + _v.x, SEA - 0.8, tr.z + _v.z);
  }

  // ---- dock guard: piers sit only 0.42 m above the water, so a hull driven into one would ride up onto the deck.
  // Bow (or stern when reversing) over a pier/dock deck while moving toward it -> kill that motion (small rebound);
  // hull centre already up on a deck -> slide it back off toward the water. Beaches are not decks (sloping sand).
  const _dray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), _df = new THREE.Vector3();
  function deckUnder(x, z) {
    const sf = city?.surfaceAt?.(x, z);
    if (sf !== undefined && sf !== 'wood' && !isWater(x, z)) return false; // land / beach / quay: not a floating dock
    _dray.origin = { x, y: SEA + 2, z }; _dray.dir = { x: 0, y: -1, z: 0 };
    const hit = world.castRay(_dray, 2.25, true, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS);
    if (!hit) return false;
    const y = SEA + 2 - (hit.timeOfImpact ?? hit.toi);
    return y > SEA + 0.05 && y < SEA + 1.6;
  }
  function dockGuard(b, tr, lv) {
    const t = b.spec; _df.set(0, 0, 1).applyQuaternion(_q); _df.y = 0; _df.normalize();
    const vF = lv.x * _df.x + lv.z * _df.z;
    const reach = t.L / 2 + 0.4;
    const bowOn = vF > 0.3 && deckUnder(tr.x + _df.x * reach, tr.z + _df.z * reach);
    const sternOn = vF < -0.3 && deckUnder(tr.x - _df.x * reach, tr.z - _df.z * reach);
    const midOn = deckUnder(tr.x, tr.z);
    if (!bowOn && !sternOn && !midOn) return;
    let nx = lv.x, ny = lv.y, nz = lv.z;
    if (bowOn || sternOn) { const k = vF * 1.25; nx -= _df.x * k; nz -= _df.z * k; } // stop at the dock edge, slight bounce back
    if (midOn) { const away = bowOn || vF > 0 ? -1 : 1; nx = _df.x * away * 2.5; nz = _df.z * away * 2.5; } // slide back off the deck
    if (ny > 0) ny = 0;
    b.body.setLinvel({ x: nx, y: ny, z: nz }, true);
    b.dockHits = (b.dockHits || 0) + 1;
  }

  // ---- physics
  const _pt = { x: 0, y: 0, z: 0 }, _imp = { x: 0, y: 0, z: 0 };
  function boatTick(b, dt, time) {
    const body = b.body, t = b.spec;
    const tr = body.translation();
    if (![tr.x, tr.y, tr.z].every(Number.isFinite)) { placeBoat(b, b.lastGood || { x: 0, z: 0 }, 0); return; }
    const r = body.rotation(); _q.set(r.x, r.y, r.z, r.w);
    const lv = body.linvel(), av = body.angvel();
    if (![lv.x, lv.y, lv.z, av.x, av.y, av.z].every(Number.isFinite) || Math.hypot(lv.x, lv.y, lv.z) > 80) { body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true); return; }
    const m = t.mass, g = 9.81;
    // buoyancy at each float point (spring on submerged depth + vertical damping)
    let wet = 0, sternWet = false;
    const k = (m * g) / (b.floats.length * 0.22);
    for (let i = 0; i < b.floats.length; i++) {
      _w.copy(b.floats[i]).applyQuaternion(_q); const px = tr.x + _w.x, py = tr.y + _w.y, pz = tr.z + _w.z;
      if (!isWater(px, pz) && bedY(px, pz) > SEA - 0.2) continue; // over land: no buoyancy (beached)
      const depth = waterY(px, pz, time) - py;
      if (depth <= 0) continue;
      wet++; if (i === b.floats.length - 1) sternWet = true;
      // point velocity v + w x r
      const vy = lv.y + (av.z * _w.x - av.x * _w.z);
      const f = (k * Math.min(depth, 0.9) - vy * m * 0.9 / b.floats.length) * dt;
      _pt.x = px; _pt.y = py; _pt.z = pz; _imp.x = 0; _imp.y = Math.max(0, f); _imp.z = 0;
      body.applyImpulseAtPoint(_imp, _pt, true);
    }
    const wf = wet / b.floats.length;
    dockGuard(b, tr, lv);
    // hull hung up on a seawall toe / pier edge while over deep water: the prop is still in the water
    if (!sternWet && wf > 0 && isWater(tr.x, tr.z) && bedY(tr.x, tr.z) < SEA - 1.5) sternWet = true;
    b.submerged = 0;
    // local velocity
    _f.set(0, 0, 1).applyQuaternion(_q); _f.y = 0; _f.normalize(); _r.set(_f.z, 0, -_f.x); // left
    const vF = lv.x * _f.x + lv.z * _f.z, vS = lv.x * _r.x + lv.z * _r.z;
    const sp = Math.abs(vF), vmax = t.vmax / 3.6;
    b.speed = vF; b.speedKmh = Math.hypot(lv.x, lv.z) * 3.6;
    // beached: hull resting on ground with little water -> stall
    const groundBelow = !isWater(tr.x, tr.z) || bedY(tr.x, tr.z) > tr.y - t.draft - 0.15;
    b.beached = wf < 0.35 && groundBelow;
    if (wf > 0) {
      const planing = clamp((sp - vmax * 0.35) / (vmax * 0.25), 0, 1);
      // drag: much stronger sideways than forward; planing hulls slip through with less drag
      const cF = (0.9 - 0.45 * planing) * m * 0.0045;
      const side = m * (1.2 * vS + 0.3 * vS * Math.abs(vS)); // keel resists sideways slip strongly
      const fwd = cF * vF * Math.abs(vF) + m * 0.04 * vF;
      _imp.x = -(_f.x * fwd + _r.x * side) * dt * wf;
      _imp.z = -(_f.z * fwd + _r.z * side) * dt * wf;
      _imp.y = 0;
      body.applyImpulse(_imp, true);
      body.setAngularDamping(1.6 * wf + 0.3);
      body.setLinearDamping(b.beached ? 1.5 : 0.05);
      // throttle -> prop thrust at the stern, only when it is in the water
      const c = (b.playerDriven && !b.boarding) || b.ai || b.chaseTarget ? b.ctrl : { throttle: 0, steer: 0 };
      const on = b.engineOn && !b.disabled;
      let thr = on ? c.throttle : 0;
      if (b.beached && thr > 0) thr = 0; // aground: forward drive is useless, but backing off the sand still works
      const thrust = (thr >= 0 ? thr * t.thrust * Math.max(0, 1 - (Math.max(0, vF) / vmax) ** 2) : thr * t.thrust * 0.4 * (vF > -6 ? 1 : 0)) * (sternWet ? 1 : 0);
      if (thrust) {
        _w.set(0, -t.draft * 0.6, -t.L * 0.45).applyQuaternion(_q);
        _pt.x = tr.x + _w.x; _pt.y = tr.y + _w.y; _pt.z = tr.z + _w.z;
        _imp.x = _f.x * thrust * dt; _imp.y = 0; _imp.z = _f.z * thrust * dt;
        body.applyImpulseAtPoint(_imp, _pt, true);
      }
      // rudder / jet steering: yaw needs flow (speed) or thrust; roll into the turn; bow lift when planing
      const flow = Math.min(1, (sp + Math.abs(thr) * 5) / 8);
      const Iy = m / 12 * (t.W * t.W + t.L * t.L), Ix = m / 12 * ((t.sheer + t.draft) ** 2 + t.L * t.L);
      const yawT = c.steer * t.turn * Iy * 0.6 * flow * Math.sign(vF || 1) * wf;
      _w.set(0, yawT * dt, 0); body.applyTorqueImpulse(_w, true);
      _w.copy(_f).multiplyScalar(-c.steer * m * 0.9 * Math.min(1, sp / 12) * wf * dt); body.applyTorqueImpulse(_w, true);
      // planing trim: bow rises through the hump (~0.25-0.5 vmax) and settles lower at full plane.  A PD on pitch plus
      // a feed-forward that cancels the buoyancy restoring moment at the target angle (else the floats flatten it).
      {
        const rel = Math.max(0, vF) / vmax, ss = (a, b2, x) => { const u = clamp((x - a) / (b2 - a), 0, 1); return u * u * (3 - 2 * u); };
        const thMax = (t.trimDeg ?? 6.5) * Math.PI / 180;
        const target = thr > 0 ? thMax * ss(0.12, 0.38, rel) * (1 - 0.5 * ss(0.45, 0.85, rel)) * (0.4 + 0.6 * thr) * wf : 0;
        _w.set(0, 0, 1).applyQuaternion(_q); const pitch = Math.asin(clamp(_w.y, -1, 1)); // + = bow up
        const pRate = -(av.x * _r.x + av.z * _r.z); // + = bow rising
        if (b.pitchK == null) { b.pitchK = 0; for (const fp of b.floats) b.pitchK += fp.z * fp.z; b.pitchK *= (m * g) / (b.floats.length * 0.22); }
        const tq = target > 0.002 || pitch > 0.01 ? (b.pitchK * target * 0.9 + Ix * (6 * (target - pitch) - 2.5 * pRate)) * (target > 0.002 ? 1 : 0.3) : 0;
        if (tq) { _w.copy(_r).multiplyScalar(-tq * dt); body.applyTorqueImpulse(_w, true); }
        b.trim = pitch;
      }
      // gauges for AUDIO / HUD
      const mr = b.model.maxRpm;
      b.throttle = Math.abs(thr); b.load = Math.abs(thr) * (sternWet ? 1 : 0.2);
      const target = on ? 700 + (mr - 700) * clamp(0.25 * Math.abs(thr) + 0.75 * sp / vmax, 0, 1) * (sternWet ? 1 : 1.25) : 0;
      b.rpm += (Math.min(mr, target) - b.rpm) * Math.min(1, dt * 6);
      // wake + spray + foam trail (render-side effects throttled)
      b.wakeT -= dt;
      if (b.wakeT <= 0 && sp > 2) {
        b.wakeT = 0.12;
        _w.set(0, 0, -t.L / 2).applyQuaternion(_q);
        foam.add(b.name, { x: tr.x + _w.x, y: SEA + 0.03, z: tr.z + _w.z }, _r.x, _r.z, Math.min(t.W * 1.6, 0.8 + sp * 0.12), Math.min(0.8, 0.25 + sp / 30));
        if (sp > 9) { _w.set(0, 0, t.L * 0.3).applyQuaternion(_q); game.fx?.splash?.(new THREE.Vector3(tr.x + _w.x, SEA + 0.1, tr.z + _w.z), Math.min(2, sp / 25)); }
        else if (Math.random() < 0.3) game.fx?.ripple?.(new THREE.Vector3(tr.x, SEA, tr.z));
      } else if (sp <= 2) foam.end(b.name);
    } else {
      // out of the water: on sand/land the hull grinds to a stop
      if (groundBelow) { body.setLinearDamping(2.5); body.setAngularDamping(2.5); } else { body.setLinearDamping(0.05); body.setAngularDamping(0.3); }
      b.rpm += ((b.engineOn ? 900 : 0) - b.rpm) * Math.min(1, dt * 4);
      foam.end(b.name);
    }
    if (!b.beached && wf > 0.5) (b.lastGood ||= { x: 0, z: 0 }), (b.lastGood.x = tr.x), (b.lastGood.z = tr.z);
  }

  // ---- water navigation grid (coarse, around the player): 8 m cells, blocked = land / shallow / pier / quay.
  // Built incrementally (time-budgeted per frame), used for A* routes (marinas, piers) and for police spawns that
  // must be in open water connected to the player's water body.
  const NAV = { cell: 8, half: 80, grid: null, gen: null, cx: 0, cz: 0, builtAt: -1e9, stats: { builds: 0, lastMs: 0, paths: 0, fails: 0 } };
  const NAV_FLAGS = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS;
  const _nray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  function structAbove(x, z) { // a fixed collider (pier, quay, piling, hull of a static boat) reaching above the water surface
    _nray.origin = { x, y: SEA + 4, z }; _nray.dir = { x: 0, y: -1, z: 0 };
    const h = world.castRay(_nray, 4.25, true, NAV_FLAGS);
    return !!h;
  }
  function* navBuild(cx, cz) {
    const N = NAV.half * 2, c = NAV.cell, x0 = cx - NAV.half * c, z0 = cz - NAV.half * c;
    const blk = new Uint8Array(N * N); let t0 = performance.now(), spent = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = x0 + (i + 0.5) * c, z = z0 + (j + 0.5) * c;
        let ok = isWater(x, z) && bedY(x, z) < SEA - 0.9;
        if (ok) for (const [ox, oz] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) if (!isWater(x + ox * c, z + oz * c)) { ok = false; break; }
        if (ok && (!city?.collidersReadyAt || city.collidersReadyAt(x, z))) {
          if (structAbove(x, z) || structAbove(x + 3, z) || structAbove(x - 3, z) || structAbove(x, z + 3) || structAbove(x, z - 3)) ok = false;
        }
        blk[j * N + i] = ok ? 0 : 1;
        if ((i & 31) === 31) { spent += performance.now() - t0; yield; t0 = performance.now(); }
      }
      spent += performance.now() - t0; yield; t0 = performance.now();
    }
    spent += performance.now() - t0; yield; t0 = performance.now();
    // clearance (cells to the nearest blocked cell, 8-neighbour BFS, capped)
    const dist = new Uint8Array(N * N).fill(255), q = new Int32Array(N * N); let qh = 0, qt = 0;
    for (let k = 0; k < N * N; k++) if (blk[k]) { dist[k] = 0; q[qt++] = k; }
    while (qh < qt) { const k = q[qh++], d = dist[k]; if (d >= 12) continue; const i = k % N, j = (k / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const kk = jj * N + ii; if (dist[kk] > d + 1) { dist[kk] = d + 1; q[qt++] = kk; } } }
    spent += performance.now() - t0; yield; t0 = performance.now();
    // connected water bodies (4-neighbour labels): routes and police spawns never cross into another basin
    const comp = new Int32Array(N * N).fill(-1); let nc = 0;
    for (let k0 = 0; k0 < N * N; k0++) { if (blk[k0] || comp[k0] >= 0) continue; qh = 0; qt = 0; q[qt++] = k0; comp[k0] = nc;
      while (qh < qt) { const k = q[qh++], i = k % N, j = (k / N) | 0;
        if (i > 0 && !blk[k - 1] && comp[k - 1] < 0) { comp[k - 1] = nc; q[qt++] = k - 1; } if (i < N - 1 && !blk[k + 1] && comp[k + 1] < 0) { comp[k + 1] = nc; q[qt++] = k + 1; }
        if (j > 0 && !blk[k - N] && comp[k - N] < 0) { comp[k - N] = nc; q[qt++] = k - N; } if (j < N - 1 && !blk[k + N] && comp[k + N] < 0) { comp[k + N] = nc; q[qt++] = k + N; } }
      nc++; }
    spent += performance.now() - t0;
    NAV.grid = { x0, z0, N, c, blk, dist, comp, cx, cz };
    NAV.stats.builds++; NAV.stats.lastMs = +spent.toFixed(1);
  }
  function navStep(budgetMs = 1.2) {
    if (!NAV.gen) return;
    const t0 = performance.now();
    try { while (performance.now() - t0 < budgetMs) { if (NAV.gen.next().done) { NAV.gen = null; break; } } } catch (e) { NAV.gen = null; console.warn('[boats] nav build', e); }
  }
  function navEnsure(p, force = false) {
    if (NAV.gen || !city?.isWater) return;
    const g = NAV.grid, now = performance.now();
    const far = !g || Math.hypot(p.x - g.cx, p.z - g.cz) > NAV.half * NAV.cell * 0.45;
    if (far || force || now - NAV.builtAt > 45000) { NAV.builtAt = now; NAV.cx = p.x; NAV.cz = p.z; NAV.gen = navBuild(p.x, p.z); }
  }
  const cellOf = (g, x, z) => { const i = Math.floor((x - g.x0) / g.c), j = Math.floor((z - g.z0) / g.c); return i < 0 || j < 0 || i >= g.N || j >= g.N ? -1 : j * g.N + i; };
  const cellXZ = (g, k) => ({ x: g.x0 + ((k % g.N) + 0.5) * g.c, z: g.z0 + (((k / g.N) | 0) + 0.5) * g.c });
  function nearestFree(g, k, maxR = 6, minDist = 1) {
    if (k < 0) return -1; if (!g.blk[k] && g.dist[k] >= minDist) return k;
    const i0 = k % g.N, j0 = (k / g.N) | 0;
    for (let r = 1; r <= maxR; r++) { let best = -1, bd = -1; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= g.N || j >= g.N) continue; const kk = j * g.N + i; if (!g.blk[kk] && g.dist[kk] >= minDist && g.dist[kk] > bd) { bd = g.dist[kk]; best = kk; } } if (best >= 0) return best; }
    return -1;
  }
  function losFree(g, a, b) { // grid line of sight with >= 1 cell clearance
    let i0 = a % g.N, j0 = (a / g.N) | 0; const i1 = b % g.N, j1 = (b / g.N) | 0;
    const di = Math.abs(i1 - i0), dj = Math.abs(j1 - j0), si = i0 < i1 ? 1 : -1, sj = j0 < j1 ? 1 : -1; let err = di - dj;
    for (let n = 0; n < 400; n++) { const k = j0 * g.N + i0; if (g.blk[k] || g.dist[k] < 2) return false; if (i0 === i1 && j0 === j1) return true; const e2 = 2 * err; if (e2 > -dj) { err -= dj; i0 += si; } if (e2 < di) { err += di; j0 += sj; } }
    return false;
  }
  function navPath(sx, sz, tx, tz) {
    const g = NAV.grid; if (!g) return null;
    const s = nearestFree(g, cellOf(g, sx, sz), 4); let t = nearestFree(g, cellOf(g, tx, tz), 8, 2);
    if (s < 0 || t < 0) { NAV.stats.fails++; return null; }
    if (g.comp[t] !== g.comp[s]) { // target in another basin (or behind land): head for the closest reachable water instead
      const kt = t, ti0 = kt % g.N, tj0 = (kt / g.N) | 0; t = -1;
      for (let r = 1; r <= 40 && t < 0; r++) for (let dj = -r; dj <= r && t < 0; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = ti0 + di, j = tj0 + dj; if (i < 0 || j < 0 || i >= g.N || j >= g.N) continue; const kk = j * g.N + i; if (g.comp[kk] === g.comp[s] && g.dist[kk] >= 1) { t = kk; break; } }
      if (t < 0) { NAV.stats.fails++; return null; }
    }
    const N = g.N, M = N * N, gs = new Float32Array(M).fill(Infinity), from = new Int32Array(M).fill(-1), closed = new Uint8Array(M);
    const heap = [], push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const ti = t % N, tj = (t / N) | 0, H = (k) => { const di = Math.abs(k % N - ti), dj = Math.abs(((k / N) | 0) - tj); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
    gs[s] = 0; push(s, H(s)); let n = 0, found = false;
    while (heap.length && n++ < 30000) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; if (k === t) { found = true; break; }
      const i = k % N, j = (k / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const kk = jj * N + ii; if (g.blk[kk] || closed[kk]) continue;
        if (di && dj && (g.blk[j * N + ii] || g.blk[jj * N + i])) continue; // no corner cutting
        const ng = gs[k] + (di && dj ? 1.414 : 1) * (1 + 8 / Math.pow(g.dist[kk] + 0.5, 1.5)); // stay well off piers, jetties and seawalls
        if (ng < gs[kk]) { gs[kk] = ng; from[kk] = k; push(kk, ng + H(kk)); } }
    }
    if (!found) { NAV.stats.fails++; return null; }
    const cells = []; for (let k = t; k >= 0; k = from[k]) cells.push(k); cells.reverse();
    // string pulling
    const out = []; let a = 0;
    while (a < cells.length - 1) { let b2 = cells.length - 1; while (b2 > a + 1 && !losFree(g, cells[a], cells[b2])) b2--; out.push(cellXZ(g, cells[b2])); a = b2; }
    NAV.stats.paths++;
    return out;
  }
  // open water connected to the player's water body (flood fill on the grid), clearance >= minClear cells
  function navSpawnSpot(p, rMin, rMax, minClear = 3) {
    const g = NAV.grid; if (!g) return null;
    const s = nearestFree(g, cellOf(g, p.x, p.z), 4); if (s < 0) return null;
    const M = g.N * g.N, seen = new Uint8Array(M), q = new Int32Array(M); let qh = 0, qt = 0; q[qt++] = s; seen[s] = 1;
    const good = [], ok2 = [];
    while (qh < qt) { const k = q[qh++]; const i = k % g.N, j = (k / g.N) | 0;
      const w = cellXZ(g, k), d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d >= rMin && d <= rMax) { if (g.dist[k] >= minClear) good.push(k); else if (g.dist[k] >= 2) ok2.push(k); }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.N || jj >= g.N) continue; const kk = jj * g.N + ii; if (seen[kk] || g.blk[kk]) continue; seen[kk] = 1; q[qt++] = kk; } }
    const pool = good.length ? good : ok2; if (!pool.length) return null;
    for (let tries = 0; tries < 20; tries++) {
      const k = pool[(Math.random() * pool.length) | 0], w = cellXZ(g, k);
      if (boats.some((b) => { const t = b.body.translation(); return Math.hypot(t.x - w.x, t.z - w.z) < 20; })) continue;
      return { x: w.x, z: w.z, heading: Math.atan2(p.x - w.x, p.z - w.z), clear: g.dist[k] * g.c };
    }
    return null;
  }

  // ---- AI for police boats: chase the player's boat
  function aiTick(b, dt = 1 / 60) {
    const tg = b.chaseTarget; if (!tg) { b.ctrl.throttle = 0; return; }
    const tr = b.body.translation();
    const gx = tg.x ?? tg.position?.x, gz = tg.z ?? tg.position?.z;
    const nv = b.nav || (b.nav = { path: null, i: 0, t: 0, tx: 0, tz: 0, stuck: 0, rev: 0 });
    // aim point: direct when the grid says the line is clear, else the next A* waypoint
    let ax = gx, az = gz;
    const g = NAV.grid;
    if (g) {
      nv.t -= dt;
      const ks = cellOf(g, tr.x, tr.z), kt = cellOf(g, gx, gz);
      const fs = nearestFree(g, ks, 2), ft = nearestFree(g, kt, 3);
      const direct = fs >= 0 && ft >= 0 && losFree(g, fs, ft);
      if (direct) nv.path = null;
      else {
        if (nv.t <= 0 || (nv.path && Math.hypot(gx - nv.tx, gz - nv.tz) > 40)) { nv.path = navPath(tr.x, tr.z, gx, gz); nv.i = 0; nv.t = 2.0; nv.tx = gx; nv.tz = gz; }
        if (nv.path && nv.path.length) {
          // advance only when the next waypoint is in clear line of sight (no cutting across a jetty)
          const kb = nearestFree(g, ks, 1);
          while (nv.i < nv.path.length - 1 && Math.hypot(nv.path[nv.i].x - tr.x, nv.path[nv.i].z - tr.z) < 14) {
            const kn = cellOf(g, nv.path[nv.i + 1].x, nv.path[nv.i + 1].z); if (kb >= 0 && kn >= 0 && !losFree(g, kb, kn)) break; nv.i++; }
          ax = nv.path[nv.i].x; az = nv.path[nv.i].z;
        }
      }
    }
    const dx = ax - tr.x, dz = az - tr.z, dist = Math.hypot(gx - tr.x, gz - tr.z);
    const hd = b.heading, fx = Math.sin(hd), fz = Math.cos(hd);
    const lx = dx * fz - dz * fx, lz = dx * fx + dz * fz, ang = Math.atan2(lx, lz);
    let steer = clamp(ang * 1.5, -1, 1), thr = dist > 12 ? 1 : 0.3;
    if (Math.abs(ang) > 1.2) thr = Math.min(thr, 0.45); // tight turn: slow down so the rudder bites
    // local avoidance: feelers ±30° ahead (fine isWater + structure rays) push the rudder away from walls and piers
    { const lxv = fz, lzv = -fx; let bl = 0, br = 0, bc = 0; const sp = Math.abs(b.speed);
      for (const d of [7, Math.max(14, sp * 1.4)]) {
        for (const [side, sa] of [[1, 0.5], [-1, 0.5], [0, 0]]) { const ca = Math.cos(sa), sn = Math.sin(sa) * side;
          const px = tr.x + (fx * ca + lxv * sn) * d, pz = tr.z + (fz * ca + lzv * sn) * d;
          if (!isWater(px, pz) || structAbove(px, pz)) { if (side > 0) bl++; else if (side < 0) br++; else bc++; } } }
      if (bl > br) steer -= 0.8 * (bl - br); else if (br > bl) steer += 0.8 * (br - bl);
      steer = clamp(steer, -1, 1);
      if (bc && thr > 0) thr = Math.min(thr, sp > 3 ? 0 : 0.35); }
    // harbour speed: the closer the nearest pier / jetty / seawall, the slower (a planing hull can't turn inside 20 m)
    if (g) { const k0 = cellOf(g, tr.x, tr.z), c = k0 >= 0 ? g.dist[k0] : 99;
      let vAllow = c <= 1 ? 4 : c <= 2 ? 6 : c <= 4 ? 9 : c <= 6 ? 14 : 99;
      if (Math.abs(ang) > 0.6) vAllow = Math.min(vAllow, 10);
      if (b.speed > vAllow) thr = b.speed > vAllow + 3 ? -0.4 : 0; }
    // look ahead on the grid: blocked water ahead -> ease off
    if (g) { const la = Math.max(10, Math.abs(b.speed) * 1.6), k = cellOf(g, tr.x + fx * la, tr.z + fz * la); if (k >= 0 && g.blk[k] && dist > la && Math.abs(b.speed) > 4) thr = Math.min(thr, 0.35); }
    // stuck recovery: back off with opposite rudder
    if (nv.rev > 0) { nv.rev -= dt; thr = -0.8; steer = -steer; if (nv.rev <= 0) nv.t = 0; }
    else if (thr > 0.1 && Math.abs(b.speed) < 1.0) { nv.stuck += dt; if (nv.stuck > 2.0) { nv.stuck = 0; nv.rev = 2.0 + Math.random(); nv.revs = (nv.revs || 0) + 1;
        // repeatedly stuck (hull hung on a wall toe): nudge it toward the nearest open water cell
        if (g && (nv.revs % 2 === 0)) { const k0 = cellOf(g, tr.x, tr.z), kf = nearestFree(g, k0, 6, 2); if (kf >= 0) { const w = cellXZ(g, kf), dd = Math.hypot(w.x - tr.x, w.z - tr.z) || 1, m = b.spec.mass;
          b.body.applyImpulse({ x: (w.x - tr.x) / dd * m * 2.5, y: m * 1.2, z: (w.z - tr.z) / dd * m * 2.5 }, true); nv.nudges = (nv.nudges || 0) + 1; } } } }
    else nv.stuck = Math.max(0, nv.stuck - dt);
    b.ctrl.steer = steer; b.ctrl.throttle = thr;
  }

  // ---- spawning on the water near the player (moorings if the CITY exposes them)
  function shoreWaterSpot(near, rMin, rMax) {
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
      if (!isWater(x, z) || bedY(x, z) > SEA - 1.2) continue;
      // close to land (within ~30 m) and away from other boats
      let land = false;
      for (let k = 0; k < 8 && !land; k++) { const aa = (k / 8) * Math.PI * 2; if (!isWater(x + Math.cos(aa) * 28, z + Math.sin(aa) * 28)) land = true; }
      if (!land) continue;
      if (boats.some((b) => { const t = b.body.translation(); return Math.hypot(t.x - x, t.z - z) < 14; })) continue;
      let ok = true;
      for (let k = 0; k < 8 && ok; k++) { const aa = (k / 8) * Math.PI * 2; if (!isWater(x + Math.cos(aa) * 6, z + Math.sin(aa) * 6)) ok = false; }
      if (!ok) continue;
      return { x, z, heading: Math.random() * Math.PI * 2 };
    }
    return null;
  }
  const MIX = ['console', 'console', 'skiff', 'cruiser', 'jetski', 'racer', 'skiff', 'console'];
  // CITY mooring types -> our drivable boats (no sailboats: sloops become cruisers, yachts the biggest cruiser)
  const MOOR_KIND = { console: 'console', cruiser: 'cruiser', sloop: 'cruiser', yacht: 'cruiser', skiff: 'skiff', jetski: 'jetski', racer: 'racer' };
  const moorSlots = (x, z, r) => (typeof city?.moorings === 'function' ? (city.moorings(x, z, r) || []) : []).filter((m) => !m.claimed)
    .map((m) => ({ id: m.id, x: m.x, z: m.z, heading: m.heading ?? 0, length: m.length, kind: MOOR_KIND[m.type] || (m.length > 9 ? 'cruiser' : 'console') }));
  function fillFrom(slots, cap = 7) {
    for (const s of slots) {
      if (boats.length >= cap) break;
      const key = s.kind && BOAT_TYPES[s.kind] ? s.kind : MIX[(Math.random() * MIX.length) | 0];
      if (s.id != null && city?.claimMooring && !city.claimMooring(s.id)) continue;
      // a shorter drivable boat in a long berth: slide it toward the dock end so the gap matches the static boat's
      let px = s.x, pz = s.z; const L = BOAT_TYPES[key].L;
      if (s.length && s.length > L + 0.6) { const fx = Math.sin(s.heading ?? 0), fz = Math.cos(s.heading ?? 0);
        for (const end of [1, -1]) { const ex = s.x + fx * end * (s.length / 2 + 1.6), ez = s.z + fz * end * (s.length / 2 + 1.6);
          if (structAbove(ex, ez)) { const sh = (s.length - L) / 2 * 0.95; px = s.x + fx * end * sh; pz = s.z + fz * end * sh; break; } } }
      const b = makeBoat(key, { x: px, z: pz }, s.heading ?? 0);
      b.moorId = s.id ?? null; if (b.moorId != null) { b.moorPos = { x: s.x, z: s.z }; pendingRelease.delete(b.moorId); }
    }
  }
  let mgrT = 0;
  function manager(dt) {
    mgrT -= dt; if (mgrT > 0) return; mgrT = 1.0;
    if (pendingRelease.size) flushReleases();
    const pp = game.player?.position; if (!pp || !city?.isWater) return;
    // far boats are parked out of the simulation (or recycled)
    for (const b of boats.slice()) {
      const t = b.body.translation(), d = Math.hypot(t.x - pp.x, t.z - pp.z);
      const far = d > 320 && !b.playerDriven;
      if (far && !b.frozen) { b.frozen = true; try { b.body.setEnabled(false); } catch (e) { /* ignore */ } }
      else if (!far && b.frozen) { b.frozen = false; try { b.body.setEnabled(true); } catch (e) { /* ignore */ } }
      if (d > 700 && !b.playerDriven && !b.external && !b.everDriven) removeBoat(b);
      // an untouched mooring swap goes back to being a static CITY boat once the player is well away
      else if (b.moorId != null && d > 260 && !b.playerDriven && !b.everDriven && !b.external && !b.chaseTarget) removeBoat(b);
    }
    // every moored boat near the player is swapped for a drivable one, so any of them can be stolen
    if (typeof city?.moorings === 'function') {
      const near = moorSlots(pp.x, pp.z, 160).sort((a, b) => Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(b.x - pp.x, b.z - pp.z));
      if (near.length) fillFrom(near.slice(0, 2), 14);
    }
    // keep a few civilian boats along nearby shores
    const civ = boats.filter((b) => !b.police && Math.hypot(b.body.translation().x - pp.x, b.body.translation().z - pp.z) < 350).length;
    if (civ < 4) {
      const slots = city.boatSlots?.(pp, 350) || moorSlots(pp.x, pp.z, 240);
      if (slots && slots.length) fillFrom(slots.slice(0, 1));
      else { const s = shoreWaterSpot(pp, 40, 300); if (s) fillFrom([s]); }
    }
    // police boats when wanted and the player is on the water in a boat
    const pv = game.player?.state?.vehicle;
    const wanted = Math.max(+game.wanted?.level || 0, +game.player?.wanted || 0);
    if (pv?.isBoat || boats.some((b) => b.chaseTarget)) navEnsure(pp);
    const cops = boats.filter((b) => b.police && b.chaseTarget);
    if (pv?.isBoat && wanted > 0 && cops.length < Math.min(2, wanted)) {
      // only once the nav grid around the player exists: open water, connected to the player's water body
      const s = NAV.grid && Math.hypot(pp.x - NAV.grid.cx, pp.z - NAV.grid.cz) < NAV.half * NAV.cell * 0.6 ? (navSpawnSpot(pp, 120, 260, 3) || navSpawnSpot(pp, 70, 420, 2)) : null;
      if (s) { const c = makeBoat('police', s, s.heading); c.engineOn = true; c.setChaseTarget(pv.body ? { get x() { return pv.body.translation().x; }, get z() { return pv.body.translation().z; } } : pp); c.external = true; }
    }
    if (!(pv?.isBoat) || wanted <= 0) for (const c of boats.filter((b) => b.police && b.chaseTarget)) { c.chaseTarget = null; c.sirenOn = false; c.ctrl.throttle = 0; }
  }
  // initial boats near the spawn beach / marina
  {
    const sp = city?.playerSpawn;
    if (sp && city?.isWater) {
      const slots = city.boatSlots?.(sp, 400) || moorSlots(sp.x, sp.z, 240);
      if (slots && slots.length) fillFrom(slots.slice(0, 5));
      else for (let i = 0; i < 4; i++) { const s = shoreWaterSpot(sp, 20, 400); if (s) fillFrom([s]); }
    }
  }

  // ---- hooks
  let time = 0, prevPD = new WeakMap();
  function boatsFixed(dt) {
    if (!(dt > 0 && dt < 0.2)) return;
    time += dt;
    for (const b of boats) {
      if (b.frozen) continue;
      if (b.playerDriven !== (prevPD.get(b) || false)) {
        prevPD.set(b, b.playerDriven);
        if (b.playerDriven) { startBoarding(b); b.everDriven = true; if (!b.engineOn && !b.disabled) { b.engineOn = true; game.emit?.('engineStart', { vehicle: b }); } }
        else { b.engineOffT = 3; }
      }
      if (!b.playerDriven && b.engineOffT > 0) { b.engineOffT -= dt; if (b.engineOffT <= 0 && !b.chaseTarget) { b.engineOn = false; game.emit?.('engineStop', { vehicle: b }); } }
      const wantCcd = b.playerDriven || !!b.chaseTarget;
      if (wantCcd !== b.ccd) { b.body.enableCcd(wantCcd); b.ccd = wantCcd; }
      if (b.chaseTarget && !b.playerDriven) aiTick(b, dt);
      try { boatTick(b, dt, time); } catch (e) { console.error('[boats]', e); }
    }
  }
  Object.defineProperty(boatsFixed, 'name', { value: 'boatsFixed' });
  game.fixedHooks.push(boatsFixed);

  function update(dt) {
    try { manager(dt); } catch (e) { console.error('[boats] manager', e); }
    navStep(1.2);
    try { proximitySwap(dt); } catch (e) { console.warn('[boats] swap', e); }
    boardingStep(dt);
    const h = game.timeOfDay ?? 12, night = h < 6.6 || h > 18.7;
    const et = game.clock?.elapsed ?? 0;
    for (const b of boats) {
      const tr = b.body.translation(), r = b.body.rotation();
      b.mesh.position.set(tr.x, tr.y, tr.z); b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      const lv = b.body.linvel(); b.velocity.set(lv.x, lv.y, lv.z);
      const lit = night && (b.engineOn || b.playerDriven) ? 4 : 0.15;
      b.lightMats.red.emissiveIntensity = lit; b.lightMats.green.emissiveIntensity = lit; b.lightMats.white.emissiveIntensity = lit;
      if (b.police) b.lightMats.bar.emissiveIntensity = b.sirenOn ? ((et * 2.6) % 1 < 0.5 ? 9 : 0.3) : 0.2;
    }
    foam.flush();
  }
  // ---- boarding: a short scripted move from where the player stood/swam onto the deck (main.js renders the player
  // at BOARD.position while BOARD.active; the boat ignores the controls meanwhile, the player collider stays off)
  const BOARD = { active: false, type: null, t: 0, dur: 0.8, vehicle: null, position: new THREE.Vector3(), heading: 0, from: new THREE.Vector3(), side: 1 };
  const _bq = new THREE.Quaternion(), _bv = new THREE.Vector3();
  function seatLocal(t, out) { return out.set(0, t.sheer * 0.55, -t.L * 0.12); }
  function startBoarding(b) {
    const P = game.player, pp = P?.position; if (!pp) return;
    const tr = b.body.translation();
    const inWater = !!P.swimming || ((P.waterDepth || 0) > 1.0 && !P.state?.grounded); // on a dock / quay / beach = hop on
    BOARD.active = true; BOARD.vehicle = b; BOARD.t = 0; BOARD.type = inWater ? 'climb' : 'hop';
    BOARD.dur = inWater ? 0.85 : 0.65; BOARD.from.set(pp.x, pp.y, pp.z);
    const r = b.body.rotation(); _bq.set(r.x, r.y, r.z, r.w); _bv.set(1, 0, 0).applyQuaternion(_bq);
    BOARD.side = (pp.x - tr.x) * _bv.x + (pp.z - tr.z) * _bv.z >= 0 ? 1 : -1;
    b.boarding = true;
    game.emit?.('boatBoardStart', { vehicle: b, type: BOARD.type, duration: BOARD.dur });
  }
  const smooth = (u) => u * u * (3 - 2 * u);
  function boardingStep(dt) {
    if (!BOARD.active) return;
    const b = BOARD.vehicle;
    if (!b || !b.alive || !b.playerDriven) { BOARD.active = false; if (b) b.boarding = false; return; }
    BOARD.t = Math.min(1, BOARD.t + dt / BOARD.dur);
    const t = b.spec, tr = b.body.translation(), r = b.body.rotation(); _bq.set(r.x, r.y, r.z, r.w);
    const seat = seatLocal(t, _bv).applyQuaternion(_bq).add(tr);
    const u = BOARD.t, F = BOARD.from, out = BOARD.position;
    if (BOARD.type === 'climb') {
      // reach the gunwale (side nearest the start), pull up, roll over onto the deck
      _w.set(BOARD.side * (t.W / 2 + 0.15), t.sheer - 0.9, -t.L * 0.05).applyQuaternion(_bq).add(tr); // hands-on-gunwale body pos
      if (u < 0.45) { const k = smooth(u / 0.45); out.lerpVectors(F, _w, k); }
      else { const k = smooth((u - 0.45) / 0.55); out.lerpVectors(_w, seat, k); out.y += Math.sin(k * Math.PI) * 0.35; }
    } else {
      const k = smooth(u); out.lerpVectors(F, seat, k);
      out.y += Math.sin(k * Math.PI) * (0.55 + Math.max(0, seat.y - F.y) * 0.3); // hop arc
    }
    BOARD.heading = u < 0.6 ? Math.atan2(tr.x - out.x, tr.z - out.z) : b.heading;
    if (BOARD.t >= 1) { BOARD.active = false; b.boarding = false; game.emit?.('boatBoardEnd', { vehicle: b }); }
  }
  // hull-outline distance (shared by nearest() and the car/boat arbitration in vehicles.js)
  function hullDist(b, pos) {
    const tr = b.body.translation(), hd = b.heading, fx = Math.sin(hd), fz = Math.cos(hd), dx = pos.x - tr.x, dz = pos.z - tr.z;
    const lz = clamp(dx * fx + dz * fz, -b.spec.L / 2, b.spec.L / 2), lx = clamp(dx * fz - dz * fx, -b.spec.W / 2, b.spec.W / 2);
    const ex = dx - (fx * lz + fz * lx), ez = dz - (fz * lz - fx * lx);
    return Math.hypot(ex, ez, Math.max(0, Math.abs((pos.y ?? tr.y) - tr.y) - 2.5));
  }
  // every static moored boat close to a player on foot / swimming becomes the drivable one (no cap), so F always works
  let swapT = 0;
  function proximitySwap(dt) {
    swapT -= dt; if (swapT > 0) return; swapT = 0.2;
    const P = game.player, pp = P?.position; if (!pp || P.state?.inVehicle || typeof city?.moorings !== 'function') return;
    const near = moorSlots(pp.x, pp.z, 40).filter((m) => Math.hypot(m.x - pp.x, m.z - pp.z) - (m.length || 8) / 2 < 16);
    for (const m of near) {
      if (boats.length >= 16) { // make room: drop the farthest idle boat (abandoned ones count once they are 150 m away)
        let far = null, fd = 0; for (const q of boats) { if (q.playerDriven || q.chaseTarget || q.external || q === game.player?.state?.vehicle) continue; const t = q.body.translation(), d = Math.hypot(t.x - pp.x, t.z - pp.z); if (d > fd && d > (q.everDriven ? 150 : 60)) { fd = d; far = q; } }
        if (far) removeBoat(far); else if (boats.length >= 28) break;
      }
      fillFrom([m], 28);
    }
  }
  function nearest(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const b of boats) {
      if (b.frozen || b.disabled) continue;
      const d = hullDist(b, pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  return { list: boats, nearest, update, spawn: (key, pos, heading = 0, o = {}) => makeBoat(BOAT_TYPES[key] ? key : 'console', pos, heading, { ...o, external: true }), remove: removeBoat, types: BOAT_TYPES, hullDist, boarding: BOARD,
    nav: { stats: NAV.stats, get grid() { return NAV.grid; }, get building() { return !!NAV.gen; }, path: navPath, spawnSpot: navSpawnSpot, ensure: navEnsure } };
}

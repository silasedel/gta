// Southline boats: original procedural hulls + multi-point buoyancy physics, wake/foam, police boats.
// Exposed through game.vehicles (nearest / enter / exit / HUD speed / AUDIO model fields).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSkids } from './skids.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fin = (x, f = 0) => (Number.isFinite(x) ? x : f);
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- catalogue (all invented brands)
export const BOAT_TYPES = {
  console: {
    brand: 'Tarpon',
    name: 'Reef 24 CC',
    L: 7.2,
    W: 2.5,
    draft: 0.45,
    sheer: 0.75,
    bowRise: 0.45,
    mass: 1800,
    thrust: 15000,
    vmax: 72,
    turn: 1.0,
    engine: 'outboard',
    engines: 2,
    colors: [0xf4f4f2, 0x1d3f8f, 0x0e5e7a],
    stripe: 0x1fb5b0,
    console: true,
    tTop: true,
  },
  racer: {
    brand: 'Vireo',
    name: 'Offshore 39',
    L: 11.5,
    W: 2.6,
    draft: 0.5,
    sheer: 0.85,
    bowRise: 0.5,
    mass: 3000,
    thrust: 36000,
    vmax: 125,
    turn: 0.75,
    engine: 'inboard',
    engines: 2,
    colors: [0xffc21a, 0xb3121b, 0x101214, 0xf2f2f2],
    stripe: 0x101214,
    cockpit: true,
    pointy: true,
  },
  cruiser: {
    brand: 'Aurelia',
    name: 'Bayliner 34',
    L: 10.5,
    W: 3.4,
    draft: 0.75,
    sheer: 1.25,
    bowRise: 0.5,
    mass: 5500,
    thrust: 30000,
    vmax: 58,
    turn: 0.7,
    engine: 'inboard',
    engines: 2,
    colors: [0xf4f4f2, 0xe7dcc4],
    stripe: 0x173b8f,
    cabin: true,
  },
  jetski: {
    brand: 'Pico',
    name: 'WaveRider',
    L: 3.2,
    W: 1.2,
    draft: 0.22,
    sheer: 0.45,
    bowRise: 0.18,
    mass: 350,
    thrust: 4200,
    vmax: 95,
    turn: 1.8,
    engine: 'jetski',
    engines: 1,
    colors: [0xff5a1f, 0x9be22d, 0x2a8cff, 0xffc21a],
    stripe: 0x101214,
    jet: true,
  },
  skiff: {
    brand: 'Corvo',
    name: 'Flats 17',
    L: 5.2,
    W: 1.9,
    draft: 0.3,
    sheer: 0.55,
    bowRise: 0.25,
    mass: 700,
    thrust: 5000,
    vmax: 50,
    turn: 1.2,
    engine: 'outboard',
    engines: 1,
    colors: [0xd8cdb0, 0x2f6d3a, 0xa9aeb4],
    stripe: 0x5a6470,
    skiff: true,
  },
  police: {
    brand: 'Marlin',
    name: 'Patrol 29',
    L: 8.8,
    W: 2.8,
    draft: 0.5,
    sheer: 0.85,
    bowRise: 0.45,
    mass: 3200,
    thrust: 26000,
    vmax: 95,
    turn: 0.95,
    engine: 'outboard',
    engines: 2,
    colors: [0x0b1a33],
    stripe: 0xf2f2f2,
    console: true,
    tTop: true,
    police: true,
  },
};
const MAXRPM = { outboard: 6000, inboard: 5200, jetski: 7500 };

// ---------------------------------------------------------------- materials
let M = null;
function mats() {
  if (M) return M;
  M = {
    deck: new THREE.MeshStandardMaterial({
      color: 0xe9e4d6,
      roughness: 0.85,
      side: THREE.DoubleSide,
    }),
    teak: new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.7 }),
    under: new THREE.MeshStandardMaterial({
      color: 0x8a2a24,
      roughness: 0.6,
      side: THREE.DoubleSide,
    }), // antifouling
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.1 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.2 }),
    seat: new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.55 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x0b1118,
      roughness: 0.05,
      transparent: true,
      opacity: 0.55,
      clearcoat: 1,
    }),
    engine: new THREE.MeshPhysicalMaterial({
      color: 0x1b1d20,
      metalness: 0.4,
      roughness: 0.3,
      clearcoat: 1,
    }),
    canvas: new THREE.MeshStandardMaterial({ color: 0x1c2a3a, roughness: 0.9 }),
    paints: new Map(),
  };
  return M;
}
function paint(c) {
  const m = mats();
  if (!m.paints.has(c))
    m.paints.set(
      c,
      new THREE.MeshPhysicalMaterial({
        color: c,
        metalness: 0.15,
        roughness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        side: THREE.DoubleSide,
      }),
    );
  return m.paints.get(c);
}
function textTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const decals = new Map();
function decalMat(text, color) {
  const k = text + color;
  if (!decals.has(k))
    decals.set(
      k,
      new THREE.MeshStandardMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        roughness: 0.4,
        map: textTexture(512, 96, (c) => {
          c.clearRect(0, 0, 512, 96);
          c.fillStyle = color;
          c.font = 'italic bold 60px sans-serif';
          c.textBaseline = 'middle';
          c.fillText(text, 12, 50);
        }),
      }),
    );
  return decals.get(k);
}

// ---------------------------------------------------------------- hull geometry (lofted V-hull with chines)
// local frame: +z bow, y=0 waterline at design draft, x left (port = +x)
function hullSections(t) {
  const L = t.L,
    hw = t.W / 2;
  const N = 28,
    out = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N; // 0 transom .. 1 bow tip
    const z = -L / 2 + u * L;
    const bowT = clamp((u - 0.55) / 0.45, 0, 1); // forward 45% narrows to the stem
    const w =
      hw *
      (t.pointy ? Math.cos((bowT * Math.PI) / 2) ** 1.1 : Math.sqrt(Math.max(0, 1 - bowT * bowT))) *
      (1 - 0.06 * (1 - u));
    const keel = -t.draft + t.bowRise * bowT * bowT * 1.6; // keel rises toward the bow
    const sheer = t.sheer + t.bowRise * 0.6 * bowT * bowT; // sheer rises toward the bow
    const chineY = keel + t.draft * 0.55;
    out.push({ z, w: Math.max(0.001, w), keel, chineY, sheer });
  }
  return out;
}
function buildHull(t) {
  const S = hullSections(t);
  const pos = [],
    idx = [];
  // ring per section: sheerL, chineL, keel, chineR, sheerR (+ flare point under sheer)
  const ring = (s) => [
    [s.w, s.sheer],
    [s.w * 1.02, (s.sheer + s.chineY) / 2],
    [s.w * 0.92, s.chineY],
    [0, s.keel],
    [-s.w * 0.92, s.chineY],
    [-s.w * 1.02, (s.sheer + s.chineY) / 2],
    [-s.w, s.sheer],
  ];
  const R = 7;
  for (const s of S) for (const [x, y] of ring(s)) pos.push(x, y, s.z);
  for (let i = 0; i < S.length - 1; i++)
    for (let k = 0; k < R - 1; k++) {
      const a = i * R + k,
        b = a + 1,
        c = a + R,
        d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  // transom
  const tc = pos.length / 3;
  pos.push(0, (S[0].sheer + S[0].keel) / 2, S[0].z);
  for (let k = 0; k < R - 1; k++) idx.push(tc, k + 1, k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // split: topsides (paint) vs bottom (antifouling) by height
  const ng = g.toNonIndexed();
  const p = ng.attributes.position,
    n = ng.attributes.normal;
  const top = [],
    topN = [],
    bot = [],
    botN = [];
  for (let i = 0; i < p.count; i += 3) {
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const [A, B] = cy > -0.02 ? [top, topN] : [bot, botN];
    for (let k = 0; k < 3; k++) {
      A.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
      B.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k));
    }
  }
  const mk = (P, N) => {
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    gg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    return gg;
  };
  // deck = plan outline at sheer height (slightly inset)
  const sh = new THREE.Shape();
  sh.moveTo(S[0].w * 0.96, S[0].z);
  for (const s of S) sh.lineTo(s.w * 0.96, s.z);
  for (let i = S.length - 1; i >= 0; i--) sh.lineTo(-S[i].w * 0.96, S[i].z);
  const deck = new THREE.ShapeGeometry(sh, 2);
  deck.rotateX(Math.PI / 2);
  // ShapeGeometry is in XY -> after rotateX: y -> z ; place at average sheer (follow sheer by vertex)
  const dp = deck.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const z = dp.getZ(i);
    const u = clamp((z + t.L / 2) / t.L, 0, 1);
    const s = S[Math.min(S.length - 1, Math.round(u * (S.length - 1)))];
    dp.setY(i, s.sheer - 0.04);
  }
  deck.computeVertexNormals();
  return { topsides: mk(top, topN), bottom: mk(bot, botN), deck, sections: S };
}

const box = (g, sx, sy, sz, x, y, z, rx = 0, ry = 0) => {
  const b = new THREE.BoxGeometry(sx, sy, sz);
  if (rx || ry) b.rotateX(rx).rotateY(ry);
  b.translate(x, y, z);
  g.push(b);
};
const geoCache = new Map();
function buildBoatGeometry(key) {
  if (geoCache.has(key)) return geoCache.get(key);
  const t = BOAT_TYPES[key];
  const H = buildHull(t),
    S = H.sections;
  const at = (z) => S[clamp(Math.round(((z + t.L / 2) / t.L) * (S.length - 1)), 0, S.length - 1)];
  const parts = {
    chrome: [],
    trim: [],
    seat: [],
    glass: [],
    engine: [],
    teak: [],
    canvas: [],
    paint: [],
  };
  const L = t.L,
    W = t.W;
  // strakes along the bottom + rub rail along the sheer
  for (const sx of [1, -1]) {
    for (let i = 2; i < S.length - 3; i += 1) {
      const s = S[i],
        s2 = S[i + 1];
      box(
        parts.trim,
        0.05,
        0.04,
        s2.z - s.z + 0.02,
        sx * s.w * 0.55,
        (s.keel + s.chineY) / 2 + 0.02,
        (s.z + s2.z) / 2,
      );
      box(
        parts.trim,
        0.06,
        0.06,
        s2.z - s.z + 0.02,
        sx * s.w * 1.0,
        s.sheer - 0.02,
        (s.z + s2.z) / 2,
      );
    }
  }
  const deckY = (z) => at(z).sheer - 0.04;
  // bow rails
  if (!t.jet)
    for (const sx of [1, -1]) {
      for (let i = Math.floor(S.length * 0.45); i < S.length - 2; i++) {
        const s = S[i],
          s2 = S[i + 1];
        const g = new THREE.CylinderGeometry(
          0.018,
          0.018,
          Math.hypot(s2.z - s.z, s2.w - s.w) + 0.02,
          6,
        );
        g.rotateX(Math.PI / 2);
        g.rotateY(Math.atan2(sx * (s2.w - s.w), s2.z - s.z));
        g.translate(((sx * (s.w + s2.w)) / 2) * 0.9, s.sheer + 0.32, (s.z + s2.z) / 2);
        parts.chrome.push(g);
        if (i % 3 === 0) {
          const st = new THREE.CylinderGeometry(0.015, 0.015, 0.32, 6);
          st.translate(sx * s.w * 0.9, s.sheer + 0.16, s.z);
          parts.chrome.push(st);
        }
      }
    }
  // engines at the transom
  const tz = -L / 2;
  if (t.engine === 'outboard') {
    for (let e = 0; e < t.engines; e++) {
      const x = t.engines === 1 ? 0 : e ? -0.42 : 0.42;
      box(parts.engine, 0.42, 0.7, 0.55, x, S[0].sheer + 0.2, tz - 0.25); // cowling
      box(parts.engine, 0.16, 0.9, 0.22, x, S[0].keel + 0.25, tz - 0.32); // leg
      box(parts.trim, 0.36, 0.06, 0.5, x, S[0].keel - 0.15, tz - 0.36); // cavitation plate / skeg
    }
  } else if (t.engine === 'inboard') {
    box(parts.teak, W * 0.8, 0.06, 0.6, 0, S[0].keel + t.draft * 0.9, tz - 0.3); // swim platform
    for (let e = 0; e < t.engines; e++)
      box(parts.chrome, 0.12, 0.12, 0.25, e ? -0.5 : 0.5, S[0].keel + 0.35, tz - 0.05);
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
    box(parts.seat, W * 0.6, 0.35, 0.8, 0, deckY(L * 0.3) + 0.2, L * 0.3); // bow seating
    if (t.tTop) {
      for (const sx of [0.45, -0.45])
        for (const sz of [0.3, -1.3]) {
          const p = new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6);
          p.translate(sx, deckY(midZ) + 0.95, midZ + sz);
          parts.chrome.push(p);
        }
      box(parts.canvas, 1.5, 0.08, 2.2, 0, deckY(midZ) + 1.95, midZ - 0.5);
    }
  }
  if (t.cockpit) {
    box(parts.glass, W * 0.75, 0.35, 0.05, 0, deckY(0) + 0.25, L * 0.05, -0.9);
    for (const sx of [0.45, -0.45]) {
      box(parts.seat, 0.55, 0.5, 0.6, sx, deckY(-L * 0.1) + 0.1, -L * 0.1);
      box(parts.seat, 0.55, 0.6, 0.15, sx, deckY(-L * 0.1) + 0.4, -L * 0.1 - 0.35);
    }
    box(parts.trim, W * 0.7, 0.06, L * 0.25, 0, deckY(-L * 0.32) + 0.04, -L * 0.32); // engine hatch vents
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
  for (const k in parts)
    if (parts[k].length)
      out.parts[k] = mergeGeometries(
        parts[k].map((g) => {
          const n = g.index ? g.toNonIndexed() : g;
          for (const a of Object.keys(n.attributes))
            if (a !== 'position' && a !== 'normal') n.deleteAttribute(a);
          return n;
        }),
        false,
      );
  // hull point cloud for the convex collider
  const hp = [];
  for (const s of S)
    for (const [x, y] of [
      [s.w, s.sheer],
      [s.w * 0.92, s.chineY],
      [0, s.keel],
      [-s.w * 0.92, s.chineY],
      [-s.w, s.sheer],
    ])
      hp.push(x, y, s.z);
  out.hullPts = new Float32Array(hp);
  geoCache.set(key, out);
  return out;
}

function buildBoatMesh(key, color) {
  const t = BOAT_TYPES[key],
    m = mats(),
    G = buildBoatGeometry(key);
  const root = new THREE.Group();
  const add = (g, mat, cast = true) => {
    const me = new THREE.Mesh(g, mat);
    me.castShadow = cast;
    me.receiveShadow = true;
    root.add(me);
    return me;
  };
  const hullMat = paint(color);
  add(G.hull.topsides, hullMat);
  add(G.hull.bottom, m.under);
  add(G.hull.deck, m.deck, false);
  for (const k in G.parts)
    add(
      G.parts[k],
      k === 'paint' ? hullMat : k === 'glass' ? m.glass : m[k] || m.trim,
      k !== 'glass',
    );
  // boot stripe + brand decals
  const S = G.hull.sections,
    mid = S[Math.floor(S.length * 0.45)];
  const dm = decalMat(
    t.police ? 'PSPD MARINE' : `${t.brand.toUpperCase()} ${t.name}`,
    t.police ? '#f2f2f2' : '#' + (t.stripe >>> 0).toString(16).padStart(6, '0'),
  );
  for (const sx of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(t.L * 0.32, t.L * 0.06), dm);
    pl.position.set(sx * (mid.w * 1.02 + 0.012), (mid.sheer + mid.chineY) / 2 + 0.05, -t.L * 0.05);
    pl.rotation.y = (sx * Math.PI) / 2;
    root.add(pl);
  }
  // navigation lights: port red (+x), starboard green (-x), white stern pole
  const lightMats = {
    red: new THREE.MeshStandardMaterial({
      color: 0x400000,
      emissive: 0xff1010,
      emissiveIntensity: 0.2,
    }),
    green: new THREE.MeshStandardMaterial({
      color: 0x003000,
      emissive: 0x10ff40,
      emissiveIntensity: 0.2,
    }),
    white: new THREE.MeshStandardMaterial({
      color: 0x808080,
      emissive: 0xffffff,
      emissiveIntensity: 0.2,
    }),
    bar: new THREE.MeshStandardMaterial({
      color: 0x000a40,
      emissive: 0x1a3cff,
      emissiveIntensity: 0.2,
    }),
  };
  const bowS = S[S.length - 4];
  const nl = (mat, x, y, z) => {
    const me = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), mat);
    me.position.set(x, y, z);
    root.add(me);
  };
  nl(lightMats.red, bowS.w * 0.8, bowS.sheer + 0.06, bowS.z);
  nl(lightMats.green, -bowS.w * 0.8, bowS.sheer + 0.06, bowS.z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), m.chrome);
  pole.position.set(0, S[2].sheer + 0.55, S[2].z);
  root.add(pole);
  nl(lightMats.white, 0, S[2].sheer + 1.12, S[2].z);
  if (t.police) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.25), lightMats.bar);
    b.position.set(0, S[Math.floor(S.length * 0.42)].sheer + 2.12, -t.L * 0.08 - 0.2);
    root.add(b);
  }
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
    return (
      SEA +
      0.12 * Math.sin(x * 0.045 + t * 0.9) +
      0.08 * Math.sin(z * 0.06 - t * 1.1) +
      0.04 * Math.sin((x + z) * 0.13 + t * 1.7)
    );
  };
  const _q = new THREE.Quaternion(),
    _v = new THREE.Vector3(),
    _w = new THREE.Vector3(),
    _f = new THREE.Vector3(),
    _r = new THREE.Vector3();
  let nameN = 0;

  function makeBoat(key, pos, heading, o = {}) {
    const t = BOAT_TYPES[key];
    const color = o.color ?? t.colors[(Math.random() * t.colors.length) | 0];
    const mesh = buildBoatMesh(key, color);
    scene.add(mesh.root);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, heading);
    const m = t.mass,
      L = t.L,
      W = t.W,
      Hh = t.sheer + t.draft;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, SEA + 0.05, pos.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.05)
        .setAngularDamping(0.3)
        .setCanSleep(false)
        .setAdditionalMassProperties(
          m,
          { x: 0, y: -t.draft * 0.3, z: -L * 0.05 },
          {
            x: (m / 12) * (Hh * Hh + L * L),
            y: (m / 12) * (W * W + L * L),
            z: (m / 12) * (W * W + Hh * Hh) * 1.4,
          },
          { x: 0, y: 0, z: 0, w: 1 },
        ),
    );
    let col = null;
    try {
      const hd = RAPIER.ColliderDesc.convexHull(mesh.hullPts);
      if (hd)
        col = world.createCollider(hd.setDensity(0).setFriction(0.6).setRestitution(0.2), body);
    } catch (e) {
      col = null;
    }
    if (!col)
      col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(W / 2, Hh / 2, L / 2)
          .setTranslation(0, (t.sheer - t.draft) / 2, 0)
          .setDensity(0)
          .setFriction(0.6),
        body,
      );
    // float points (local): 3 stations x 2 sides + bow + stern keel
    const floats = [];
    for (const zf of [-0.38, -0.05, 0.25])
      for (const sx of [1, -1])
        floats.push(new THREE.Vector3(sx * W * 0.32, -t.draft * 0.6, zf * L));
    floats.push(
      new THREE.Vector3(0, -t.draft * 0.4, L * 0.42),
      new THREE.Vector3(0, -t.draft * 0.8, -L * 0.45),
    );
    const b = {
      isBoat: true,
      typeKey: key,
      spec: t,
      name: o.name || `${t.brand} ${t.name} #${++nameN}`,
      body,
      mesh: mesh.root,
      car: null,
      lightMats: mesh.lightMats,
      collider: col,
      floats,
      groundOff: t.draft,
      ctrl: { throttle: 0, steer: 0, brake: 0, handbrake: false },
      playerDriven: false,
      ai: null,
      police: !!t.police,
      speed: 0,
      speedKmh: 0,
      rpm: 0,
      gear: 1,
      throttle: 0,
      load: 0,
      engineOn: false,
      submerged: 0,
      alive: true,
      disposed: false,
      velocity: new THREE.Vector3(),
      health: 1000,
      disabled: false,
      locked: false,
      beached: false,
      wakeT: 0,
      ccd: false,
      model: {
        key,
        brand: t.brand,
        name: t.name,
        class: 'boat',
        engine: t.engine,
        maxRpm: MAXRPM[t.engine],
        idleRpm: 700,
        gears: [1],
        sound: {
          engine: t.engine,
          cylinders: t.engine === 'inboard' ? 8 : t.engine === 'jetski' ? 3 : 6,
          aspiration: 'na',
          exhaust: t.engine === 'inboard' ? 'loud' : 'sporty',
          count: t.engines,
        },
      },
      setControls(c) {
        this.ctrl.throttle = clamp(+c.throttle || 0, -1, 1);
        this.ctrl.steer = clamp(+c.steer || 0, -1, 1);
        this.ctrl.brake = clamp(+c.brake || 0, 0, 1);
        this.ctrl.handbrake = !!c.handbrake;
      },
      seatPosition() {
        const tr = body.translation(),
          r = body.rotation();
        _q.set(r.x, r.y, r.z, r.w);
        return new THREE.Vector3(0, t.sheer + 0.3, -L * 0.15)
          .applyQuaternion(_q)
          .add(_v.set(tr.x, tr.y, tr.z));
      },
      exitPosition() {
        return exitSpot(this);
      },
      horn() {
        /* boats: no horn */
      },
      flip() {
        const tr = body.translation();
        placeBoat(this, { x: tr.x, z: tr.z }, this.heading);
      },
      siren(on) {
        this.sirenOn = on === undefined ? !this.sirenOn : !!on;
        return this.sirenOn;
      },
      setChaseTarget(tg) {
        this.chaseTarget = tg || null;
        if (this.police && tg) this.sirenOn = true;
      },
      get position() {
        const tr = body.translation();
        return new THREE.Vector3(tr.x, tr.y, tr.z);
      },
      get heading() {
        const r = body.rotation();
        _q.set(r.x, r.y, r.z, r.w);
        _v.set(0, 0, 1).applyQuaternion(_q);
        return Math.atan2(_v.x, _v.z);
      },
      external: !!o.external,
    };
    boats.push(b);
    return b;
  }
  function placeBoat(b, p, heading) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, heading);
    b.body.setTranslation({ x: p.x, y: SEA + 0.05, z: p.z }, true);
    b.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  function removeBoat(b) {
    const i = boats.indexOf(b);
    if (i < 0 || b.playerDriven) return false;
    boats.splice(i, 1);
    b.alive = false;
    b.disposed = true;
    scene.remove(b.mesh);
    for (const k in b.lightMats) b.lightMats[k].dispose();
    foam.end(b.name);
    try {
      world.removeRigidBody(b.body);
    } catch (e) {
      /* ignore */
    }
    return true;
  }

  // ---- exit: dock / land within 4 m, else the water beside the hull (player swims)
  const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  function exitSpot(b) {
    const tr = b.body.translation(),
      r = b.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const t = b.spec;
    let best = null;
    for (const d of [t.W / 2 + 0.8, t.W / 2 + 1.8, t.W / 2 + 3.0, 4.0])
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        _v.set(Math.cos(ang) * d, 0, Math.sin(ang) * (d + t.L * 0.3)).applyQuaternion(_q);
        const x = tr.x + _v.x,
          z = tr.z + _v.z;
        _ray.origin = { x, y: tr.y + 4, z };
        _ray.dir = { x: 0, y: -1, z: 0 };
        const hit = world.castRay(
          _ray,
          8,
          true,
          QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS,
        );
        if (hit) {
          const y = tr.y + 4 - (hit.timeOfImpact ?? hit.toi);
          if (y > SEA + 0.05) {
            best = new THREE.Vector3(x, y, z);
            break;
          } // dock / quay / beach above the water
        }
      }
    if (best) return best;
    _v.set(t.W / 2 + 1.2, 0, 0).applyQuaternion(_q);
    return new THREE.Vector3(tr.x + _v.x, SEA - 0.8, tr.z + _v.z);
  }

  // ---- physics
  const _pt = { x: 0, y: 0, z: 0 },
    _imp = { x: 0, y: 0, z: 0 };
  function boatTick(b, dt, time) {
    const body = b.body,
      t = b.spec;
    const tr = body.translation();
    if (![tr.x, tr.y, tr.z].every(Number.isFinite)) {
      placeBoat(b, b.lastGood || { x: 0, z: 0 }, 0);
      return;
    }
    const r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const lv = body.linvel(),
      av = body.angvel();
    if (
      ![lv.x, lv.y, lv.z, av.x, av.y, av.z].every(Number.isFinite) ||
      Math.hypot(lv.x, lv.y, lv.z) > 80
    ) {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    const m = t.mass,
      g = 9.81;
    // buoyancy at each float point (spring on submerged depth + vertical damping)
    let wet = 0,
      sternWet = false;
    const k = (m * g) / (b.floats.length * 0.22);
    for (let i = 0; i < b.floats.length; i++) {
      _w.copy(b.floats[i]).applyQuaternion(_q);
      const px = tr.x + _w.x,
        py = tr.y + _w.y,
        pz = tr.z + _w.z;
      if (!isWater(px, pz) && bedY(px, pz) > SEA - 0.2) continue; // over land: no buoyancy (beached)
      const depth = waterY(px, pz, time) - py;
      if (depth <= 0) continue;
      wet++;
      if (i === b.floats.length - 1) sternWet = true;
      // point velocity v + w x r
      const vy = lv.y + (av.z * _w.x - av.x * _w.z);
      const f = (k * Math.min(depth, 0.9) - (vy * m * 0.9) / b.floats.length) * dt;
      _pt.x = px;
      _pt.y = py;
      _pt.z = pz;
      _imp.x = 0;
      _imp.y = Math.max(0, f);
      _imp.z = 0;
      body.applyImpulseAtPoint(_imp, _pt, true);
    }
    const wf = wet / b.floats.length;
    b.submerged = 0;
    // local velocity
    _f.set(0, 0, 1).applyQuaternion(_q);
    _f.y = 0;
    _f.normalize();
    _r.set(_f.z, 0, -_f.x); // left
    const vF = lv.x * _f.x + lv.z * _f.z,
      vS = lv.x * _r.x + lv.z * _r.z;
    const sp = Math.abs(vF),
      vmax = t.vmax / 3.6;
    b.speed = vF;
    b.speedKmh = Math.hypot(lv.x, lv.z) * 3.6;
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
      const c = b.playerDriven || b.ai || b.chaseTarget ? b.ctrl : { throttle: 0, steer: 0 };
      const on = b.engineOn && !b.disabled;
      let thr = on ? c.throttle : 0;
      if (b.beached) thr = 0;
      const thrust =
        (thr >= 0
          ? thr * t.thrust * Math.max(0, 1 - (Math.max(0, vF) / vmax) ** 2)
          : thr * t.thrust * 0.4 * (vF > -6 ? 1 : 0)) * (sternWet ? 1 : 0);
      if (thrust) {
        _w.set(0, -t.draft * 0.6, -t.L * 0.45).applyQuaternion(_q);
        _pt.x = tr.x + _w.x;
        _pt.y = tr.y + _w.y;
        _pt.z = tr.z + _w.z;
        _imp.x = _f.x * thrust * dt;
        _imp.y = 0;
        _imp.z = _f.z * thrust * dt;
        body.applyImpulseAtPoint(_imp, _pt, true);
      }
      // rudder / jet steering: yaw needs flow (speed) or thrust; roll into the turn; bow lift when planing
      const flow = Math.min(1, (sp + Math.abs(thr) * 5) / 8);
      const Iy = (m / 12) * (t.W * t.W + t.L * t.L),
        Ix = (m / 12) * ((t.sheer + t.draft) ** 2 + t.L * t.L);
      const yawT = c.steer * t.turn * Iy * 0.6 * flow * Math.sign(vF || 1) * wf;
      _w.set(0, yawT * dt, 0);
      body.applyTorqueImpulse(_w, true);
      _w.copy(_f).multiplyScalar(-c.steer * m * 0.9 * Math.min(1, sp / 12) * wf * dt);
      body.applyTorqueImpulse(_w, true);
      if (planing > 0 && thr > 0) {
        _w.copy(_r).multiplyScalar(-Ix * 0.35 * planing * thr * dt);
        body.applyTorqueImpulse(_w, true);
      }
      // gauges for AUDIO / HUD
      const mr = b.model.maxRpm;
      b.throttle = Math.abs(thr);
      b.load = Math.abs(thr) * (sternWet ? 1 : 0.2);
      const target = on
        ? 700 +
          (mr - 700) *
            clamp(0.25 * Math.abs(thr) + (0.75 * sp) / vmax, 0, 1) *
            (sternWet ? 1 : 1.25)
        : 0;
      b.rpm += (Math.min(mr, target) - b.rpm) * Math.min(1, dt * 6);
      // wake + spray + foam trail (render-side effects throttled)
      b.wakeT -= dt;
      if (b.wakeT <= 0 && sp > 2) {
        b.wakeT = 0.12;
        _w.set(0, 0, -t.L / 2).applyQuaternion(_q);
        foam.add(
          b.name,
          { x: tr.x + _w.x, y: SEA + 0.03, z: tr.z + _w.z },
          _r.x,
          _r.z,
          Math.min(t.W * 1.6, 0.8 + sp * 0.12),
          Math.min(0.8, 0.25 + sp / 30),
        );
        if (sp > 9) {
          _w.set(0, 0, t.L * 0.3).applyQuaternion(_q);
          game.fx?.splash?.(
            new THREE.Vector3(tr.x + _w.x, SEA + 0.1, tr.z + _w.z),
            Math.min(2, sp / 25),
          );
        } else if (Math.random() < 0.3) game.fx?.ripple?.(new THREE.Vector3(tr.x, SEA, tr.z));
      } else if (sp <= 2) foam.end(b.name);
    } else {
      // out of the water: on sand/land the hull grinds to a stop
      if (groundBelow) {
        body.setLinearDamping(2.5);
        body.setAngularDamping(2.5);
      } else {
        body.setLinearDamping(0.05);
        body.setAngularDamping(0.3);
      }
      b.rpm += ((b.engineOn ? 900 : 0) - b.rpm) * Math.min(1, dt * 4);
      foam.end(b.name);
    }
    if (window.__boatDbg && b.playerDriven && (window.__bdn = (window.__bdn || 0) + 1) % 60 === 0)
      console.log(
        'BDBG ' +
          JSON.stringify({
            vF: +vF.toFixed(2),
            vS: +vS.toFixed(2),
            wf,
            sternWet,
            beached: b.beached,
            on: b.engineOn,
            thr: b.ctrl.throttle,
            steer: b.ctrl.steer,
            wy: +av.y.toFixed(3),
            y: +tr.y.toFixed(2),
            frozen: !!b.frozen,
          }),
      );
    if (!b.beached && wf > 0.5)
      ((b.lastGood ||= { x: 0, z: 0 }), (b.lastGood.x = tr.x), (b.lastGood.z = tr.z));
  }

  // ---- AI for police boats: chase the player's boat
  function aiTick(b) {
    const tg = b.chaseTarget;
    if (!tg) {
      b.ctrl.throttle = 0;
      return;
    }
    const tr = b.body.translation();
    const dx = (tg.x ?? tg.position?.x) - tr.x,
      dz = (tg.z ?? tg.position?.z) - tr.z;
    const hd = b.heading,
      fx = Math.sin(hd),
      fz = Math.cos(hd);
    const lx = dx * fz - dz * fx,
      lz = dx * fx + dz * fz;
    b.ctrl.steer = clamp(Math.atan2(lx, lz) * 1.5, -1, 1);
    b.ctrl.throttle = Math.hypot(dx, dz) > 12 ? 1 : 0.3;
  }

  // ---- spawning on the water near the player (moorings if the CITY exposes them)
  function shoreWaterSpot(near, rMin, rMax) {
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2,
        r = rMin + Math.random() * (rMax - rMin);
      const x = near.x + Math.cos(a) * r,
        z = near.z + Math.sin(a) * r;
      if (!isWater(x, z) || bedY(x, z) > SEA - 1.2) continue;
      // close to land (within ~30 m) and away from other boats
      let land = false;
      for (let k = 0; k < 8 && !land; k++) {
        const aa = (k / 8) * Math.PI * 2;
        if (!isWater(x + Math.cos(aa) * 28, z + Math.sin(aa) * 28)) land = true;
      }
      if (!land) continue;
      if (
        boats.some((b) => {
          const t = b.body.translation();
          return Math.hypot(t.x - x, t.z - z) < 14;
        })
      )
        continue;
      let ok = true;
      for (let k = 0; k < 8 && ok; k++) {
        const aa = (k / 8) * Math.PI * 2;
        if (!isWater(x + Math.cos(aa) * 6, z + Math.sin(aa) * 6)) ok = false;
      }
      if (!ok) continue;
      return { x, z, heading: Math.random() * Math.PI * 2 };
    }
    return null;
  }
  const MIX = ['console', 'console', 'skiff', 'cruiser', 'jetski', 'racer', 'skiff', 'console'];
  function fillFrom(slots) {
    for (const s of slots) {
      if (boats.length >= 7) break;
      const key = s.kind && BOAT_TYPES[s.kind] ? s.kind : MIX[(Math.random() * MIX.length) | 0];
      if (s.id != null && city?.claimMooring && !city.claimMooring(s.id)) continue;
      const b = makeBoat(key, { x: s.x, z: s.z }, s.heading ?? 0);
      b.moorId = s.id ?? null;
    }
  }
  let mgrT = 0;
  function manager(dt) {
    mgrT -= dt;
    if (mgrT > 0) return;
    mgrT = 1.0;
    const pp = game.player?.position;
    if (!pp || !city?.isWater) return;
    // far boats are parked out of the simulation (or recycled)
    for (const b of boats.slice()) {
      const t = b.body.translation(),
        d = Math.hypot(t.x - pp.x, t.z - pp.z);
      const far = d > 320 && !b.playerDriven;
      if (far && !b.frozen) {
        b.frozen = true;
        try {
          b.body.setEnabled(false);
        } catch (e) {
          /* ignore */
        }
      } else if (!far && b.frozen) {
        b.frozen = false;
        try {
          b.body.setEnabled(true);
        } catch (e) {
          /* ignore */
        }
      }
      if (d > 700 && !b.playerDriven && !b.external && !b.everDriven) removeBoat(b);
    }
    // keep a few civilian boats along nearby shores
    const civ = boats.filter(
      (b) =>
        !b.police && Math.hypot(b.body.translation().x - pp.x, b.body.translation().z - pp.z) < 350,
    ).length;
    if (civ < 4) {
      const slots =
        city.boatSlots?.(pp, 350) ||
        city.moorings?.filter?.((m) => !m.claimed && Math.hypot(m.x - pp.x, m.z - pp.z) < 350) ||
        null;
      if (slots && slots.length) fillFrom(slots.slice(0, 1));
      else {
        const s = shoreWaterSpot(pp, 40, 300);
        if (s) fillFrom([s]);
      }
    }
    // police boats when wanted and the player is on the water in a boat
    const pv = game.player?.state?.vehicle;
    const wanted = game.player?.wanted ?? game.wanted?.level ?? 0;
    const cops = boats.filter((b) => b.police && b.chaseTarget);
    if (pv?.isBoat && wanted > 0 && cops.length < Math.min(2, wanted)) {
      const s =
        shoreWaterSpot(pp, 120, 220) ||
        (() => {
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * 6.28;
            const x = pp.x + Math.cos(a) * 150,
              z = pp.z + Math.sin(a) * 150;
            if (isWater(x, z) && bedY(x, z) < SEA - 1.5) return { x, z, heading: a + Math.PI };
          }
          return null;
        })();
      if (s) {
        const c = makeBoat('police', s, s.heading);
        c.engineOn = true;
        c.setChaseTarget(
          pv.body
            ? {
                get x() {
                  return pv.body.translation().x;
                },
                get z() {
                  return pv.body.translation().z;
                },
              }
            : pp,
        );
        c.external = true;
      }
    }
    if (!pv?.isBoat || wanted <= 0)
      for (const c of boats.filter((b) => b.police && b.chaseTarget)) {
        c.chaseTarget = null;
        c.sirenOn = false;
        c.ctrl.throttle = 0;
      }
  }
  // initial boats near the spawn beach / marina
  {
    const sp = city?.playerSpawn;
    if (sp && city?.isWater) {
      const slots = city.boatSlots?.(sp, 400) || null;
      if (slots && slots.length) fillFrom(slots.slice(0, 5));
      else
        for (let i = 0; i < 4; i++) {
          const s = shoreWaterSpot(sp, 20, 400);
          if (s) fillFrom([s]);
        }
    }
  }

  // ---- hooks
  let time = 0,
    prevPD = new WeakMap();
  function boatsFixed(dt) {
    if (!(dt > 0 && dt < 0.2)) return;
    time += dt;
    for (const b of boats) {
      if (b.frozen) continue;
      if (b.playerDriven !== (prevPD.get(b) || false)) {
        prevPD.set(b, b.playerDriven);
        if (b.playerDriven) {
          b.everDriven = true;
          if (!b.engineOn && !b.disabled) {
            b.engineOn = true;
            game.emit?.('engineStart', { vehicle: b });
          }
        } else {
          b.engineOffT = 3;
        }
      }
      if (!b.playerDriven && b.engineOffT > 0) {
        b.engineOffT -= dt;
        if (b.engineOffT <= 0 && !b.chaseTarget) {
          b.engineOn = false;
          game.emit?.('engineStop', { vehicle: b });
        }
      }
      const wantCcd = b.playerDriven || !!b.chaseTarget;
      if (wantCcd !== b.ccd) {
        b.body.enableCcd(wantCcd);
        b.ccd = wantCcd;
      }
      if (b.chaseTarget && !b.playerDriven) aiTick(b);
      try {
        boatTick(b, dt, time);
      } catch (e) {
        console.error('[boats]', e);
      }
    }
  }
  Object.defineProperty(boatsFixed, 'name', { value: 'boatsFixed' });
  game.fixedHooks.push(boatsFixed);

  function update(dt) {
    try {
      manager(dt);
    } catch (e) {
      console.error('[boats] manager', e);
    }
    const h = game.timeOfDay ?? 12,
      night = h < 6.6 || h > 18.7;
    const et = game.clock?.elapsed ?? 0;
    for (const b of boats) {
      const tr = b.body.translation(),
        r = b.body.rotation();
      b.mesh.position.set(tr.x, tr.y, tr.z);
      b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      const lv = b.body.linvel();
      b.velocity.set(lv.x, lv.y, lv.z);
      const lit = night && (b.engineOn || b.playerDriven) ? 4 : 0.15;
      b.lightMats.red.emissiveIntensity = lit;
      b.lightMats.green.emissiveIntensity = lit;
      b.lightMats.white.emissiveIntensity = lit;
      if (b.police)
        b.lightMats.bar.emissiveIntensity = b.sirenOn ? ((et * 2.6) % 1 < 0.5 ? 9 : 0.3) : 0.2;
    }
    foam.flush();
  }
  function nearest(pos, maxDist) {
    let best = null,
      bd = maxDist;
    for (const b of boats) {
      if (b.frozen || b.disabled) continue;
      const tr = b.body.translation();
      // distance to the hull outline (boats are long): project into hull frame
      const hd = b.heading,
        fx = Math.sin(hd),
        fz = Math.cos(hd),
        dx = pos.x - tr.x,
        dz = pos.z - tr.z;
      const lz = clamp(dx * fx + dz * fz, -b.spec.L / 2, b.spec.L / 2),
        lx = clamp(dx * fz - dz * fx, -b.spec.W / 2, b.spec.W / 2);
      const ex = dx - (fx * lz + fz * lx),
        ez = dz - (fz * lz - fx * lx);
      const d = Math.hypot(ex, ez, Math.max(0, Math.abs((pos.y ?? tr.y) - tr.y) - 1.5));
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }
  return {
    list: boats,
    nearest,
    update,
    spawn: (key, pos, heading = 0, o = {}) =>
      makeBoat(BOAT_TYPES[key] ? key : 'console', pos, heading, { ...o, external: true }),
    remove: removeBoat,
    types: BOAT_TYPES,
  };
}

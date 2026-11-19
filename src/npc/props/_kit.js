// NPC prop kit (NPC-AI track): shared helpers for every prop people carry, ride, sit on or work with.
// Everything here is procedural and seeded: materials are small tiling PBR sets (albedo + roughness + normal)
// drawn on canvases, cached by family, and tinted per use. No flat untextured surfaces.
//
// Conventions for every builder in this folder:
//   buildX(THREE, opts = { seed, ...colors }) -> THREE.Group
//   - real scale in meters, origin on the ground at the footprint center, front faces +Z
//   - group.userData.anchors = { name: THREE.Vector3 (local) }  hand grips, seats, attach points
//   - group.userData.kind = 'stroller' etc.; group.userData.parts = { name: Object3D } for animated parts
//   - meshes castShadow = true (set by finish())
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------- seeded random
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed >>> 0 : hashStr(seed ?? 'x')) || 1;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  return f;
}

// ---------------------------------------------------------------- palettes (sun-faded coastal colors)
export const PAL = {
  brights: [
    0xe07f68, 0x2f8a86, 0xe6b3b5, 0xa6d3bf, 0x9cc1de, 0xe8d78a, 0xb8a8d2, 0x5fb3b8, 0xe89a85,
    0xb5443e, 0xc9a043, 0x2a6fb5, 0xd95f9a, 0x58a55c, 0xf08a2c,
  ],
  neutrals: [
    0xf0ede6, 0xe9e1cf, 0xd6c4a0, 0x2a3442, 0x5a6450, 0x3a3a3c, 0xb5a385, 0x1f1f21, 0x8e9094,
    0xa95d3d, 0x6b7a8f,
  ],
  woods: [0x8a6a46, 0x6e4f33, 0xa9895f, 0x4c3626, 0xc2a57a],
  metals: [0xb9bcc0, 0x8d9197, 0x5c6066, 0x2c2e31],
  plastics: [0x1f1f21, 0xf0ede6, 0x2a6fb5, 0xb5443e, 0x58a55c, 0xe8d78a, 0x8e9094],
};

// ---------------------------------------------------------------- procedural texture sets
const hasDOM = typeof document !== 'undefined';
const texCache = new Map();
function canvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return c;
}
// height field (Float32Array n*n, 0..1) -> { rough, normal } canvases; albedo is a gray detail map multiplied by material.color
function setFromHeight(n, H, opts) {
  const { rough = 0.7, roughVar = 0.15, bump = 1.0, albedoVar = 0.18, albedoBase = 0.9 } = opts;
  const a = canvas(n),
    r = canvas(n),
    nm = canvas(n);
  const ax = a.getContext('2d'),
    rx = r.getContext('2d'),
    nx = nm.getContext('2d');
  const ai = ax.createImageData(n, n),
    ri = rx.createImageData(n, n),
    ni = nx.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        h = H[i];
      const hx = H[y * n + ((x + 1) % n)] - H[y * n + ((x + n - 1) % n)];
      const hy = H[((y + 1) % n) * n + x] - H[((y + n - 1) % n) * n + x];
      let vx = -hx * bump * 4,
        vy = -hy * bump * 4,
        vz = 1;
      const l = Math.hypot(vx, vy, vz);
      vx /= l;
      vy /= l;
      vz /= l;
      const o = i * 4;
      const al = Math.max(0, Math.min(1, albedoBase + (h - 0.5) * albedoVar * 2));
      ai.data[o] = ai.data[o + 1] = ai.data[o + 2] = al * 255;
      ai.data[o + 3] = 255;
      const rr = Math.max(0.04, Math.min(1, rough + (0.5 - h) * roughVar * 2));
      ri.data[o] = 255;
      ri.data[o + 1] = rr * 255;
      ri.data[o + 2] = 0;
      ri.data[o + 3] = 255;
      ni.data[o] = (vx * 0.5 + 0.5) * 255;
      ni.data[o + 1] = (vy * 0.5 + 0.5) * 255;
      ni.data[o + 2] = (vz * 0.5 + 0.5) * 255;
      ni.data[o + 3] = 255;
    }
  ax.putImageData(ai, 0, 0);
  rx.putImageData(ri, 0, 0);
  nx.putImageData(ni, 0, 0);
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: mk(a, true), roughnessMap: mk(r, false), normalMap: mk(nm, false) };
}
// tileable value noise
function noiseField(n, cells, r) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * cells,
        fy = (y / n) * cells,
        x0 = Math.floor(fx),
        y0 = Math.floor(fy),
        tx = fx - x0,
        ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx),
        sy = ty * ty * (3 - 2 * ty);
      const a = g[(y0 % cells) * cells + (x0 % cells)],
        b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = g[((y0 + 1) % cells) * cells + (x0 % cells)],
        d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      out[y * n + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  return out;
}
function fbm(n, r, base = 4, oct = 4) {
  const out = new Float32Array(n * n);
  let amp = 0.5,
    tot = 0;
  for (let o = 0; o < oct; o++) {
    const f = noiseField(n, base << o, r);
    for (let i = 0; i < out.length; i++) out[i] += f[i] * amp;
    tot += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

const FAMILIES = {
  // name: (n, r) => { H, opts }
  plastic: (n, r) => {
    const f = fbm(n, r, 16, 3);
    return {
      H: f,
      opts: { rough: 0.42, roughVar: 0.1, bump: 0.25, albedoVar: 0.05, albedoBase: 0.97 },
    };
  },
  plasticRough: (n, r) => {
    const f = fbm(n, r, 32, 3);
    return {
      H: f,
      opts: { rough: 0.7, roughVar: 0.12, bump: 0.6, albedoVar: 0.08, albedoBase: 0.95 },
    };
  },
  paint: (n, r) => {
    const f = fbm(n, r, 8, 4);
    return {
      H: f,
      opts: { rough: 0.38, roughVar: 0.2, bump: 0.3, albedoVar: 0.1, albedoBase: 0.95 },
    };
  },
  metal: (n, r) => {
    const f = fbm(n, r, 4, 3),
      H = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      const s = r() * 0.5;
      for (let x = 0; x < n; x++) H[y * n + x] = f[y * n + x] * 0.5 + s;
    }
    return {
      H,
      opts: { rough: 0.32, roughVar: 0.22, bump: 0.35, albedoVar: 0.12, albedoBase: 0.92 },
    };
  },
  rubber: (n, r) => {
    const f = fbm(n, r, 32, 3);
    return {
      H: f,
      opts: { rough: 0.92, roughVar: 0.06, bump: 0.8, albedoVar: 0.1, albedoBase: 0.9 },
    };
  },
  fabric: (n, r) => {
    const f = fbm(n, r, 8, 3),
      H = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const w =
          0.5 +
          0.25 * Math.sin((x * Math.PI * 2 * 32) / n) +
          0.25 * Math.sin((y * Math.PI * 2 * 32) / n);
        H[y * n + x] = w * 0.7 + f[y * n + x] * 0.3;
      }
    return {
      H,
      opts: { rough: 0.9, roughVar: 0.08, bump: 1.0, albedoVar: 0.14, albedoBase: 0.92 },
    };
  },
  canvas: (n, r) => {
    const f = fbm(n, r, 8, 3),
      H = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const w =
          (Math.sin((x * Math.PI * 2 * 20) / n) > 0 ? 0.7 : 0.35) *
          (Math.sin((y * Math.PI * 2 * 20) / n) > 0 ? 1 : 0.6);
        H[y * n + x] = w * 0.75 + f[y * n + x] * 0.25;
      }
    return {
      H,
      opts: { rough: 0.94, roughVar: 0.05, bump: 1.3, albedoVar: 0.18, albedoBase: 0.9 },
    };
  },
  wood: (n, r) => {
    const f = fbm(n, r, 4, 4),
      H = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const g = Math.sin(((x / n) * 14 + f[y * n + x] * 5) * Math.PI * 2) * 0.5 + 0.5;
        H[y * n + x] = g * 0.6 + f[y * n + x] * 0.4;
      }
    return {
      H,
      opts: { rough: 0.72, roughVar: 0.16, bump: 0.7, albedoVar: 0.3, albedoBase: 0.85 },
    };
  },
  wicker: (n, r) => {
    const H = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const u = (x / n) * 16,
          v = (y / n) * 16,
          cu = Math.floor(u),
          cv = Math.floor(v);
        const over = (cu + cv) % 2 === 0;
        const a = Math.sin((u - cu) * Math.PI),
          b = Math.sin((v - cv) * Math.PI);
        H[y * n + x] = over ? 0.45 + 0.5 * b : 0.25 + 0.4 * a;
      }
    return {
      H,
      opts: { rough: 0.85, roughVar: 0.1, bump: 1.6, albedoVar: 0.35, albedoBase: 0.82 },
    };
  },
  leather: (n, r) => {
    const f = fbm(n, r, 32, 3),
      g = fbm(n, r, 64, 2),
      H = new Float32Array(n * n);
    for (let i = 0; i < H.length; i++) H[i] = Math.abs(f[i] - 0.5) * 1.2 + g[i] * 0.4;
    return {
      H,
      opts: { rough: 0.58, roughVar: 0.18, bump: 0.9, albedoVar: 0.16, albedoBase: 0.9 },
    };
  },
  cardboard: (n, r) => {
    const f = fbm(n, r, 8, 4),
      H = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        H[y * n + x] =
          0.5 + 0.2 * Math.sin((x * Math.PI * 2 * 40) / n) + (f[y * n + x] - 0.5) * 0.5;
    return {
      H,
      opts: { rough: 0.93, roughVar: 0.05, bump: 0.5, albedoVar: 0.16, albedoBase: 0.92 },
    };
  },
  foam: (n, r) => {
    const f = fbm(n, r, 64, 2);
    return {
      H: f,
      opts: { rough: 0.96, roughVar: 0.03, bump: 0.9, albedoVar: 0.08, albedoBase: 0.96 },
    };
  },
  rust: (n, r) => {
    const f = fbm(n, r, 6, 5);
    const H = new Float32Array(n * n);
    for (let i = 0; i < H.length; i++) H[i] = Math.pow(f[i], 1.6);
    return { H, opts: { rough: 0.8, roughVar: 0.25, bump: 1.2, albedoVar: 0.5, albedoBase: 0.75 } };
  },
  rope: (n, r) => {
    const H = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        H[y * n + x] = 0.5 + 0.5 * Math.sin(((x + y) * Math.PI * 2 * 12) / n);
    return {
      H,
      opts: { rough: 0.95, roughVar: 0.04, bump: 1.5, albedoVar: 0.25, albedoBase: 0.88 },
    };
  },
  fur: (n, r) => {
    const f = fbm(n, r, 4, 3),
      H = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        H[y * n + x] =
          0.5 +
          0.35 * Math.sin(((y / n) * 60 + f[y * n + x] * 6) * Math.PI * 2) * (0.6 + 0.4 * r());
    return {
      H,
      opts: { rough: 0.95, roughVar: 0.04, bump: 1.4, albedoVar: 0.3, albedoBase: 0.86 },
    };
  },
  skinlike: (n, r) => {
    const f = fbm(n, r, 32, 3);
    return {
      H: f,
      opts: { rough: 0.6, roughVar: 0.1, bump: 0.3, albedoVar: 0.06, albedoBase: 0.97 },
    };
  },
};
export const MATERIAL_FAMILIES = Object.keys(FAMILIES);
function texSet(family) {
  if (!hasDOM) return {};
  let s = texCache.get(family);
  if (!s) {
    const gen = FAMILIES[family] || FAMILIES.plastic;
    const { H, opts } = gen(128, rng('npcprop:' + family));
    s = setFromHeight(128, H, opts);
    texCache.set(family, s);
  }
  return s;
}
const matCache = new Map();
/**
 * Cached PBR material. family: one of MATERIAL_FAMILIES. color: hex number.
 * opts: { metal, rough (multiplier), repeat (tiles per meter-ish UV unit, default 3), emissive, emissiveIntensity, transparent, opacity, side, clearcoat }
 */
export function M(family, color = 0xffffff, opts = {}) {
  const key = family + ':' + color + ':' + JSON.stringify(opts);
  let m = matCache.get(key);
  if (m) return m;
  const s = texSet(family);
  const rep = opts.repeat ?? 3;
  const clone = (t) => {
    if (!t) return null;
    const c = t.clone();
    c.repeat.set(rep, rep);
    c.needsUpdate = true;
    return c;
  };
  const metal = opts.metal ?? (family === 'metal' ? 0.9 : family === 'rust' ? 0.4 : 0);
  const P = opts.clearcoat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  m = new P({
    color,
    map: clone(s.map),
    roughnessMap: clone(s.roughnessMap),
    normalMap: clone(s.normalMap),
    roughness: opts.rough ?? 1,
    metalness: metal,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  if (opts.clearcoat) {
    m.clearcoat = opts.clearcoat;
    m.clearcoatRoughness = 0.15;
  }
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  m.name = 'npcprop_' + family;
  matCache.set(key, m);
  return m;
}
export const chrome = () => M('metal', 0xd9dde2, { rough: 0.35 });
export const glass = (tint = 0x9fc4d0, opacity = 0.35) => {
  const k = 'glass:' + tint + ':' + opacity;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color: tint,
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      opacity,
      transmission: 0,
      clearcoat: 1,
    });
    matCache.set(k, m);
  }
  return m;
};

// A printed / painted label: draw(ctx, w, h) on a canvas -> material (albedo only + given roughness). Cache by key.
const labelCache = new Map();
export function label(key, w, h, draw, opts = {}) {
  let m = labelCache.get(key);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const fam = texSet(opts.family || 'paint');
  m = new THREE.MeshStandardMaterial({
    map: t,
    roughness: opts.rough ?? 0.7,
    metalness: 0,
    normalMap: fam.normalMap || null,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    alphaTest: opts.alphaTest ?? 0,
  });
  if (opts.emissive) {
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveMap = t;
    m.emissiveIntensity = opts.emissive;
  }
  labelCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------- geometry helpers (cached)
const geoCache = new Map();
const G = (key, make) => {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
};
export const box = (w, h, d, r = 0) =>
  G(`b:${w}:${h}:${d}:${r}`, () =>
    r > 0
      ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2))
      : new THREE.BoxGeometry(w, h, d),
  );
export const cyl = (rt, rb, h, seg = 16, open = false) =>
  G(`c:${rt}:${rb}:${h}:${seg}:${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
export const sphere = (r, ws = 16, hs = 12, phiL = Math.PI * 2, thS = 0, thL = Math.PI) =>
  G(
    `s:${r}:${ws}:${hs}:${phiL}:${thS}:${thL}`,
    () => new THREE.SphereGeometry(r, ws, hs, 0, phiL, thS, thL),
  );
export const capsule = (r, len, seg = 10) =>
  G(`cap:${r}:${len}:${seg}`, () => new THREE.CapsuleGeometry(r, len, 4, seg));
export const torus = (R, r, rs = 8, ts = 24, arc = Math.PI * 2) =>
  G(`t:${R}:${r}:${rs}:${ts}:${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
export const cone = (r, h, seg = 16, open = false) =>
  G(`cone:${r}:${h}:${seg}:${open}`, () => new THREE.ConeGeometry(r, h, seg, 1, open));
export const plane = (w, h, sw = 1, sh = 1) =>
  G(`p:${w}:${h}:${sw}:${sh}`, () => new THREE.PlaneGeometry(w, h, sw, sh));
// bent tube through points [[x,y,z], ...] (not cached: shapes are usually unique)
export function tube(points, radius = 0.012, seg = 6, closed = false, tension = 0.5) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed,
    'catmullrom',
    tension,
  );
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), radius, seg, closed);
}
// surface of revolution from a profile [[radius, y], ...]
export function lathe(profile, seg = 20) {
  return new THREE.LatheGeometry(
    profile.map((p) => new THREE.Vector2(p[0], p[1])),
    seg,
  );
}
// a spoked wheel (tire + rim + hub + spokes) lying in the YZ plane, axle along X
export function wheel(radius, width, opts = {}) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(
    torus(radius - width * 0.5, width * 0.5, 8, 20),
    M('rubber', opts.tire ?? 0x1c1c1e),
  );
  tire.rotation.y = Math.PI / 2;
  g.add(tire);
  const rimR = radius - width;
  const rim = new THREE.Mesh(
    cyl(rimR, rimR, width * 0.7, 18, true),
    M(opts.rimFamily || 'metal', opts.rim ?? 0xc8ccd0, { side: THREE.DoubleSide }),
  );
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  const hub = new THREE.Mesh(
    cyl(radius * 0.16, radius * 0.16, width * 1.1, 10),
    M('metal', opts.hub ?? 0x8d9197),
  );
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  const n = opts.spokes ?? 6;
  if (opts.disc) {
    const d = new THREE.Mesh(cyl(rimR, rimR, width * 0.25, 18), M('plastic', opts.disc));
    d.rotation.z = Math.PI / 2;
    g.add(d);
  } else
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(
        cyl(width * 0.08, width * 0.08, rimR * 2, 5),
        M('metal', opts.rim ?? 0xc8ccd0),
      );
      s.rotation.x = (i / n) * Math.PI;
      g.add(s);
    }
  g.userData.spin = true;
  return g;
}
export function mesh(
  geo,
  mat,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  return m;
}
// last step of every builder: shadows, kind, anchors as Vector3
export function finish(group, kind, anchors = {}, parts = {}) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  group.userData.kind = kind;
  const a = {};
  for (const k in anchors) {
    const v = anchors[k];
    a[k] = v.isVector3 ? v : new THREE.Vector3(v[0], v[1], v[2]);
  }
  group.userData.anchors = a;
  group.userData.parts = parts;
  return group;
}
export function triCount(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry;
      n += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  return Math.round(n);
}
export { THREE };

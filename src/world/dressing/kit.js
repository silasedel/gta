// world-dressing kit: procedural props and Keys houses. Every part is merged with city-look's mergeProp, so it draws with the
// shared triplanar PBR prop material (real CC0 textures sampled in world space, tinted per part / per instance).
// Each builder returns a BufferGeometry in local space (origin at the ground, +Z = front).
import * as THREE from 'three';
import { mergeProp, SURF } from '../city/propmat.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function rng(seed) {
  let s = (Math.floor(Math.abs(seed) * 9973) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function mtx(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);

// part list helper
class Parts {
  constructor() {
    this.list = [];
  }
  box(x, y, z, w, h, d, surf, color, o = {}) {
    this.list.push({
      g: BOX,
      m: mtx(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, w, h, d),
      surf,
      color,
      tint: o.tint ?? 0,
      emis: o.emis || 0,
    });
    return this;
  }
  cyl(x, y, z, r, h, surf, color, o = {}) {
    this.list.push({
      g: o.lo ? CYL6 : CYL,
      m: mtx(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, r * 2, h, r * 2),
      surf,
      color,
      tint: o.tint ?? 0,
    });
    return this;
  }
  geo(g, m, surf, color, o = {}) {
    this.list.push({ g, m, surf, color, tint: o.tint ?? 0 });
    return this;
  }
  // thin box from point a to point b (wires, rails, braces)
  beam(a, b, t, surf, color, o = {}) {
    const d = new THREE.Vector3().subVectors(b, a);
    const L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    this.list.push({
      g: BOX,
      m: new THREE.Matrix4().compose(mid, q, new THREE.Vector3(t, o.th ?? t, L)),
      surf,
      color,
      tint: o.tint ?? 0,
    });
    return this;
  }
  build() {
    return mergeProp(this.list);
  }
}
export { Parts, SURF };

// ---------------------------------------------------------------- small props
export function wheelStop() {
  return new Parts()
    .box(0, 0.06, 0, 1.8, 0.12, 0.22, SURF.concrete, 0xd8d4c8, { tint: 1 })
    .box(-0.55, 0.125, 0, 0.3, 0.012, 0.23, SURF.paint, 0xe8c838)
    .box(0.55, 0.125, 0, 0.3, 0.012, 0.23, SURF.paint, 0xe8c838)
    .build();
}

export function lightPole(double = true) {
  const p = new Parts()
    .cyl(0, 0.35, 0, 0.32, 0.7, SURF.concrete, 0xc8c4bc)
    .cyl(0, 5.2, 0, 0.09, 9.4, SURF.galv, 0xb8bcc0)
    .box(0, 9.6, 0, 0.12, 0.12, 2.4 * (double ? 1 : 0.5), SURF.galv, 0xb8bcc0);
  for (const s of double ? [-1, 1] : [1]) {
    p.box(0, 9.55, s * 1.25, 0.5, 0.14, 0.8, SURF.paint, 0x55585c);
    p.box(0, 9.46, s * 1.25, 0.42, 0.03, 0.68, SURF.glass, 0xfff4d8, { emis: 1 });
  }
  return p.build();
}

export function payStation() {
  return new Parts()
    .box(0, 0.04, 0, 0.6, 0.08, 0.5, SURF.concrete, 0xbdb8ae)
    .box(0, 0.75, 0, 0.42, 1.4, 0.32, SURF.paint, 0x2f5a7a, { tint: 1 })
    .box(0, 1.52, 0.02, 0.5, 0.12, 0.4, SURF.paint, 0x24465f)
    .box(0, 1.1, 0.165, 0.26, 0.2, 0.01, SURF.glass, 0x9fd8c8, { emis: 0.5 })
    .box(0, 0.8, 0.165, 0.2, 0.06, 0.01, SURF.steel, 0xb0b0b0)
    .box(0, 0.55, 0.165, 0.3, 0.16, 0.01, SURF.iron, 0x303030)
    .build();
}

export function signPost(w = 0.6, h = 0.75) {
  // post only; the face is a separate textured board (see signBoard)
  return new Parts().cyl(0, 1.3, 0, 0.035, 2.6, SURF.galv, 0xa8acb0, { lo: 1 }).build();
}

export function mailbox(r) {
  const col = [0x2a2a2a, 0x2c4f7c, 0xd8d4c8, 0x7a2a22, 0x2f6a4a, 0xc8b070][(r() * 6) | 0];
  const lean = (r() - 0.5) * 0.12;
  const p = new Parts()
    .box(0, 0.55, 0, 0.1, 1.1, 0.1, r() < 0.6 ? SURF.planks : SURF.wood, 0xb0a48c, { rz: lean })
    .box(0, 1.12, 0.05, 0.24, 0.24, 0.5, SURF.rustPaint, col, { rz: lean, tint: 1 })
    .cyl(0, 1.24, 0.05, 0.12, 0.5, SURF.rustPaint, col, { rx: Math.PI / 2, rz: lean, tint: 1 });
  if (r() < 0.7) p.box(0.14, 1.25, 0.15, 0.02, 0.2, 0.05, SURF.paint, 0xc8302a, { rz: lean - 0.6 });
  return p.build();
}

export function wheelieBin(color) {
  return new Parts()
    .box(0, 0.5, 0, 0.58, 1.0, 0.72, SURF.plastic, color, { tint: 1 })
    .box(0, 1.03, -0.02, 0.62, 0.06, 0.78, SURF.plastic, color, { tint: 1, rx: -0.04 })
    .cyl(-0.27, 0.1, -0.33, 0.1, 0.06, SURF.rubber, 0x222222, { rz: Math.PI / 2 })
    .cyl(0.27, 0.1, -0.33, 0.1, 0.06, SURF.rubber, 0x222222, { rz: Math.PI / 2 })
    .build();
}

export function dumpster() {
  return new Parts()
    .box(0, 0.75, 0, 1.9, 1.2, 1.4, SURF.rustPaint, 0x2f5a3a, { tint: 1 })
    .box(0, 1.4, -0.05, 1.95, 0.08, 1.45, SURF.plastic, 0x1d1d1d, { rx: 0.08 })
    .box(0, 0.12, 0, 1.7, 0.24, 1.2, SURF.iron, 0x303030)
    .box(-1.0, 0.8, 0, 0.08, 0.1, 0.9, SURF.iron, 0x404040)
    .build();
}

export function crabTrapStack(r) {
  const p = new Parts();
  const n = 2 + ((r() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const c = [0xd8c43a, 0x3a8a4a, 0x2a2a2a, 0xc86a2a][(r() * 4) | 0];
    p.box((r() - 0.5) * 0.1, 0.3 + i * 0.6, (r() - 0.5) * 0.1, 0.6, 0.58, 0.6, SURF.galv, c, {
      ry: (r() - 0.5) * 0.3,
      tint: 1,
    });
  }
  if (r() < 0.6) p.box(0.65, 0.3, 0.1, 0.6, 0.58, 0.6, SURF.galv, 0xd8c43a, { ry: 0.4, tint: 1 });
  return p.build();
}

export function buoyPile(r) {
  const p = new Parts();
  for (let i = 0; i < 5; i++) {
    const c = [0xf06a2a, 0xffffff, 0xe8d02a, 0xd83a3a][(r() * 4) | 0];
    p.cyl((r() - 0.5) * 1.2, 0.14, (r() - 0.5) * 1.2, 0.14, 0.42, SURF.plastic, c, {
      rx: Math.PI / 2,
      ry: r() * 3,
      tint: 1,
    });
  }
  return p.build();
}

export function coralRock(r) {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    const y = P.getY(i);
    const z = P.getZ(i);
    const k = 0.75 + Math.abs(Math.sin(x * 9.1 + z * 7.3 + y * 5.7 + r() * 0.01)) * 0.4;
    P.setXYZ(i, x * k, Math.max(-0.1, y) * k * 0.7, z * k);
  }
  g.computeVertexNormals();
  return new Parts()
    .geo(g, mtx(0, 0.15, 0, 0, 0, 0, 1.4, 1, 1.1), SURF.concrete, 0xd8ccb0, { tint: 1 })
    .build();
}

export function propaneTank() {
  return new Parts()
    .cyl(0, 0.62, 0, 0.32, 1.0, SURF.paint, 0xe8e6e0)
    .box(0, 1.2, 0, 0.18, 0.12, 0.18, SURF.steel, 0xa0a0a0)
    .build();
}

export function picnicTable() {
  const p = new Parts();
  for (const z of [-0.12, 0.12]) p.box(0, 0.74, z, 1.8, 0.04, 0.22, SURF.planks, 0xb8a888);
  for (const s of [-1, 1]) {
    p.box(0, 0.44, s * 0.55, 1.8, 0.04, 0.24, SURF.planks, 0xb8a888);
    p.box(s * 0.7, 0.37, 0, 0.06, 0.08, 1.4, SURF.planks, 0x9a8a6a);
    p.box(s * 0.7, 0.37, 0, 0.06, 0.8, 0.06, SURF.planks, 0x9a8a6a, { rx: 0.55 });
    p.box(s * 0.7, 0.37, 0, 0.06, 0.8, 0.06, SURF.planks, 0x9a8a6a, { rx: -0.55 });
  }
  return p.build();
}

export function kayak(color) {
  const g = new THREE.SphereGeometry(0.5, 12, 6);
  return new Parts()
    .geo(g, mtx(0, 0.18, 0, 0, 0, 0, 0.62, 0.32, 3.6), SURF.plastic, color, { tint: 1 })
    .box(0, 0.33, 0.1, 0.4, 0.04, 0.7, SURF.plastic, 0x1d1d1d)
    .build();
}

// V hull: a box whose bow tapers to a point and whose bottom closes to a keel
function hullGeo(L, W, H) {
  const g = new THREE.BoxGeometry(W, H, L, 2, 2, 6);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i);
    const y = P.getY(i);
    const z = P.getZ(i);
    const f = z / (L / 2);
    const bow = f > 0.25 ? 1 - Math.pow((f - 0.25) / 0.75, 1.6) * 0.95 : 1;
    const keel = y < 0 ? 0.35 : 1;
    x *= bow * keel;
    P.setXYZ(i, x, y + (f > 0.4 ? (f - 0.4) * 0.35 * H : 0), z);
  }
  g.computeVertexNormals();
  return g;
}

export function boatOnTrailer(r) {
  const L = 5.2 + r() * 2.4;
  const W = 2.0 + r() * 0.35;
  const hc = [0xf2f0ea, 0xe8e4d8, 0x2c4f6c, 0x9ab8c0, 0xd8c8a0][(r() * 5) | 0];
  const p = new Parts();
  // trailer frame, axle, wheels, tongue, jack
  for (const s of [-1, 1]) p.box(s * 0.75, 0.55, -0.2, 0.08, 0.1, L * 0.9, SURF.galv, 0xb0b4b8);
  p.beam(
    new THREE.Vector3(-0.75, 0.55, L * 0.42),
    new THREE.Vector3(0, 0.55, L * 0.42 + 1.6),
    0.09,
    SURF.galv,
    0xb0b4b8,
  );
  p.beam(
    new THREE.Vector3(0.75, 0.55, L * 0.42),
    new THREE.Vector3(0, 0.55, L * 0.42 + 1.6),
    0.09,
    SURF.galv,
    0xb0b4b8,
  );
  p.box(0, 0.45, L * 0.42 + 1.75, 0.12, 0.12, 0.4, SURF.iron, 0x404040);
  p.cyl(0.18, 0.3, L * 0.42 + 1.3, 0.04, 0.6, SURF.galv, 0xa0a0a0, { lo: 1 });
  p.box(0, 0.38, -0.6, 1.9, 0.08, 0.08, SURF.galv, 0xa0a4a8);
  for (const s of [-1, 1]) {
    p.cyl(s * 0.98, 0.33, -0.6, 0.33, 0.2, SURF.rubber, 0x1c1c1c, { rz: Math.PI / 2 });
    p.cyl(s * 1.0, 0.33, -0.6, 0.16, 0.21, SURF.galv, 0xc0c0c0, { rz: Math.PI / 2 });
    p.box(s * 0.98, 0.72, -0.6, 0.34, 0.04, 0.95, SURF.rustPaint, 0x8a8a8a);
  }
  // hull, deck, console, outboard
  const hy = 0.6 + 0.45;
  p.geo(hullGeo(L, W, 0.9), mtx(0, hy, -0.2), SURF.plastic, hc, { tint: 1 });
  p.box(0, hy + 0.47, -0.4, W * 0.82, 0.04, L * 0.7, SURF.plastic, 0xe0dcd0);
  p.box(0, hy + 0.47, -0.2, W * 1.0, 0.06, L * 0.9, SURF.plastic, 0x3a3a3a, { tint: 0 }); // rub rail
  if (r() < 0.75) {
    p.box(0, hy + 0.95, -0.1, 0.75, 0.9, 0.6, SURF.plastic, 0xeeeae0);
    p.box(0, hy + 1.45, 0.05, 0.75, 0.1, 0.4, SURF.glass, 0x506070);
    if (r() < 0.5) {
      // T-top
      for (const s of [-1, 1])
        p.cyl(s * 0.55, hy + 1.6, -0.1, 0.025, 2.1, SURF.steel, 0xd0d0d0, { lo: 1 });
      p.box(
        0,
        hy + 2.65,
        -0.1,
        1.5,
        0.08,
        1.7,
        SURF.plastic,
        [0x1d3a5a, 0x2a5a4a, 0xd8d4c8][(r() * 3) | 0],
      );
    }
  }
  p.box(
    0,
    hy + 0.5,
    -L / 2 - 0.25,
    0.45,
    0.8,
    0.5,
    SURF.plastic,
    [0x1d1d1d, 0xe8e8e8, 0x3a4a5a][(r() * 3) | 0],
  );
  p.box(0, hy - 0.2, -L / 2 - 0.3, 0.14, 0.8, 0.18, SURF.plastic, 0x2a2a2a);
  return { geo: p.build(), L: L + 2, W: W + 0.2 };
}

// ---------------------------------------------------------------- power line pole (wooden, crossarm, insulators, transformer)
export function utilityPole(r, transformer = false) {
  const lean = (r() - 0.5) * 0.04;
  const p = new Parts()
    .cyl(0, 5.5, 0, 0.14, 11, SURF.creosote, 0x8a7a68, { rz: lean, tint: 1 })
    .box(0, 10.2, 0, 2.4, 0.12, 0.12, SURF.creosote, 0x7a6a58)
    .box(0, 9.5, 0, 1.4, 0.09, 0.09, SURF.creosote, 0x7a6a58);
  for (const x of [-1.05, 0, 1.05]) p.cyl(x, 10.36, 0, 0.05, 0.2, SURF.glass, 0x6a8a9a, { lo: 1 });
  for (const s of [-1, 1])
    p.beam(
      new THREE.Vector3(0, 9.7, 0),
      new THREE.Vector3(s * 0.8, 10.15, 0),
      0.05,
      SURF.galv,
      0x909090,
    );
  if (transformer) {
    p.cyl(0.32, 8.3, 0, 0.26, 1.0, SURF.galv, 0x8a9096);
    p.box(0.32, 8.85, 0, 0.3, 0.06, 0.3, SURF.galv, 0x7a8086);
  }
  return p.build();
}

// ---------------------------------------------------------------- fences
export function fenceSegment(type, len, r) {
  const p = new Parts();
  if (type === 'chain') {
    for (let x = 0; x <= len + 0.01; x += len)
      p.cyl(x - len / 2, 0.75, 0, 0.03, 1.5, SURF.galv, 0xa8acb0, { lo: 1 });
    p.cyl(0, 1.48, 0, 0.02, len, SURF.galv, 0xa8acb0, { lo: 1, rz: Math.PI / 2 });
    // mesh panel: a thin galvanized sheet (the triplanar texture reads as a weave at range)
    p.box(0, 0.74, 0, len, 1.42, 0.01, SURF.galv, 0x8e9296);
  } else {
    // weathered picket / board fence, some boards missing or leaning
    const col = [0xe8e4da, 0xb8a888, 0x9ab8b0, 0xd8c8a8][(r() * 4) | 0];
    p.box(0, 0.35, 0, len, 0.07, 0.04, SURF.planks, col, { tint: 1 });
    p.box(0, 0.95, 0, len, 0.07, 0.04, SURF.planks, col, { tint: 1 });
    for (let x = -len / 2 + 0.06; x < len / 2; x += 0.16) {
      if (r() < 0.05) continue;
      const h = 1.15 + (r() - 0.5) * 0.06;
      p.box(x, h / 2, 0.03, 0.09, h, 0.02, SURF.planks, col, {
        rz: r() < 0.06 ? (r() - 0.5) * 0.3 : 0,
        tint: 1,
      });
    }
    p.box(-len / 2, 0.6, -0.02, 0.09, 1.2, 0.09, SURF.planks, 0x9a8a70);
  }
  return p.build();
}

// ---------------------------------------------------------------- Keys house (stilt or ground floor), unique per seed
// returns { geo, w, d, h, colliders: [{x,y,z,hx,hy,hz}] (local), roofY, front: z of the front wall, door: [x, z] }
const SIDING = [
  0x8fb8a8, 0xe8d8a8, 0xf0ece0, 0x9ab8d0, 0xe8b8a0, 0xc8d8a0, 0xd8a8b8, 0xb0c8c0, 0xf0d890,
  0xa8c0b8,
];
const ROOFC = [0xb8bcc0, 0x9aa0a8, 0x8a4a3a, 0x5a6a72, 0xd8d4c8, 0x6a7a5a];
export function keysHouse(seed) {
  const r = rng(seed);
  const p = new Parts();
  const stilt = r() < 0.6;
  const w = 9 + r() * 6;
  const d = 7.5 + r() * 4;
  const base = stilt ? 2.6 + r() * 0.8 : 0.5;
  const wallH = 2.8;
  const col = SIDING[(r() * SIDING.length) | 0];
  const trim = r() < 0.7 ? 0xf2f0ea : 0xd8d0b8;
  const roofCol = ROOFC[(r() * ROOFC.length) | 0];
  const siding = r() < 0.7 ? SURF.planks : SURF.plaster;
  const cols = [];
  // foundation / piles
  if (stilt) {
    for (const x of [-w / 2 + 0.3, -w / 6, w / 6, w / 2 - 0.3]) {
      for (const z of [-d / 2 + 0.3, 0, d / 2 - 0.3])
        p.box(x, base / 2, z, 0.35, base, 0.35, r() < 0.5 ? SURF.concrete : SURF.planks, 0xd0ccc0);
    }
    // lattice skirt on part of the front, storage room under one end
    if (r() < 0.6)
      p.box(-w / 4, base / 2, d / 2 - 0.3, w / 2 - 0.4, base - 0.2, 0.04, SURF.planks, 0xf0ece0);
    if (r() < 0.6)
      p.box(w / 4, base / 2 - 0.05, 0, w / 3, base - 0.1, d - 1, siding, col, { tint: 1 });
    p.box(0, base - 0.12, 0, w + 0.2, 0.24, d + 0.2, SURF.planks, 0x9a8a70);
  } else {
    p.box(0, base / 2, 0, w + 0.3, base, d + 0.3, SURF.concrete, 0xc8c4b8);
  }
  // walls
  p.box(0, base + wallH / 2, 0, w, wallH, d, siding, col, { tint: 1 });
  cols.push({ x: 0, y: base + wallH / 2, z: 0, hx: w / 2, hy: (base + wallH) / 2, hz: d / 2 });
  // corner boards and band
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1])
      p.box(
        sx * (w / 2 + 0.02),
        base + wallH / 2,
        sz * (d / 2 + 0.02),
        0.14,
        wallH,
        0.14,
        SURF.paint,
        trim,
      );
  }
  p.box(0, base + 0.06, 0, w + 0.08, 0.12, d + 0.08, SURF.paint, trim);
  // windows with frames and shutters on front and back, door on the front
  const nWin = Math.max(2, Math.floor(w / 3.2));
  const doorI = (r() * nWin) | 0;
  const shutter = r() < 0.6;
  const shC = [0x4a6a7a, 0x3a5a4a, 0xe8e4da, 0x6a5a4a, 0x2a4a6a][(r() * 5) | 0];
  let door = [0, d / 2];
  for (const sz of [1, -1]) {
    for (let i = 0; i < nWin; i++) {
      const x = -w / 2 + (i + 0.5) * (w / nWin);
      const fz = sz * (d / 2 + 0.03);
      if (sz > 0 && i === doorI) {
        p.box(
          x,
          base + 1.05,
          fz,
          0.95,
          2.1,
          0.06,
          SURF.wood,
          [0x6a4a3a, 0xe8e4da, 0x3a5a6a][(r() * 3) | 0],
        );
        p.box(x, base + 2.15, fz, 1.1, 0.1, 0.08, SURF.paint, trim);
        door = [x, d / 2];
        continue;
      }
      p.box(x, base + 1.5, fz, 1.0, 1.2, 0.04, SURF.glass, 0x30404a);
      p.box(x, base + 2.14, fz, 1.2, 0.1, 0.08, SURF.paint, trim);
      p.box(x, base + 0.86, fz + sz * 0.03, 1.2, 0.08, 0.12, SURF.paint, trim);
      p.box(x, base + 1.5, fz + sz * 0.01, 0.06, 1.2, 0.05, SURF.paint, trim);
      if (shutter) {
        for (const s of [-1, 1])
          p.box(x + s * 0.72, base + 1.5, fz, 0.42, 1.3, 0.05, SURF.planks, shC, { tint: 1 });
      }
      if (r() < 0.15) p.box(x, base + 1.2, fz + sz * 0.3, 0.6, 0.4, 0.55, SURF.galv, 0xc8c8c0); // window AC
    }
  }
  // side windows
  for (const sx of [-1, 1])
    p.box(sx * (w / 2 + 0.03), base + 1.5, 0, 0.04, 1.1, 0.9, SURF.glass, 0x30404a);
  // roof: gable (metal) or hip-ish low pitch
  const pitch = 0.32 + r() * 0.2;
  const ov = 0.6;
  const rw = d / 2 + ov;
  const rise = rw * Math.tan(pitch);
  const top = base + wallH;
  for (const s of [-1, 1]) {
    p.box(
      0,
      top + rise / 2,
      (s * rw) / 2,
      w + ov * 2,
      0.08,
      rw / Math.cos(pitch),
      r() < 0.8 ? SURF.galv : SURF.rustPaint,
      roofCol,
      { rx: s * pitch, tint: 1 },
    );
  }
  // gable ends
  const tri = new THREE.BufferGeometry();
  tri.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, -d / 2, 0, 0, d / 2, 0, rise, 0], 3),
  );
  tri.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  for (const sx of [-1, 1]) {
    const m = mtx((sx * w) / 2, top, 0, 0, sx > 0 ? 0 : Math.PI, 0);
    p.geo(tri, m, siding, col, { tint: 1 });
  }
  // fascia
  for (const s of [-1, 1])
    p.box(0, top - 0.05, s * (d / 2 + ov), w + ov * 2, 0.16, 0.05, SURF.paint, trim);
  // porch: deck across the front with posts, rail and roof, stairs down
  const porchD = 2.2 + r() * 0.8;
  if (stilt || r() < 0.6) {
    const py = base;
    p.box(0, py - 0.08, d / 2 + porchD / 2, w * 0.9, 0.12, porchD, SURF.planks, 0xa89a80);
    for (const x of [-w * 0.45, -w * 0.15, w * 0.15, w * 0.45]) {
      p.box(x, (py + 2.6) / 2, d / 2 + porchD - 0.1, 0.14, py + 2.6, 0.14, SURF.planks, trim);
    }
    p.box(0, py + 0.95, d / 2 + porchD - 0.1, w * 0.9, 0.06, 0.08, SURF.planks, trim);
    for (let x = -w * 0.45; x < w * 0.45; x += 0.14)
      p.box(x, py + 0.5, d / 2 + porchD - 0.1, 0.04, 0.85, 0.04, SURF.planks, trim);
    p.box(0, py + 2.7, d / 2 + porchD / 2, w * 0.95, 0.06, porchD + 0.3, SURF.galv, roofCol, {
      rx: -0.1,
      tint: 1,
    });
    cols.push({
      x: 0,
      y: py - 0.08,
      z: d / 2 + porchD / 2,
      hx: w * 0.45,
      hy: 0.06,
      hz: porchD / 2,
    });
    if (stilt) {
      // straight stair down the side of the porch
      const steps = Math.ceil(py / 0.19);
      const sx = w * 0.45 + 0.6;
      for (let i = 0; i < steps; i++) {
        const y = py - (i + 1) * (py / steps);
        p.box(sx, y + 0.02, d / 2 + porchD - 0.6 - i * 0.26, 1.0, 0.05, 0.3, SURF.planks, 0xa89a80);
      }
      for (const s of [-0.5, 0.5]) {
        p.beam(
          new THREE.Vector3(sx + s, py, d / 2 + porchD - 0.5),
          new THREE.Vector3(sx + s, 0.05, d / 2 + porchD - 0.5 - steps * 0.26),
          0.06,
          SURF.planks,
          0x9a8a70,
          { th: 0.25 },
        );
      }
    }
  }
  // AC condenser, meter, hose bib
  p.box(-w / 2 - 0.5, stilt ? base - 0.4 : 0.4, -d / 4, 0.7, 0.7, 0.7, SURF.galv, 0xd0d0c8);
  p.box(w / 2 + 0.06, base + 1.4, -d / 3, 0.06, 0.4, 0.3, SURF.galv, 0xa0a0a0);
  return {
    geo: p.build(),
    w,
    d,
    h: top + rise,
    colliders: cols,
    door,
    stilt,
    base,
    roofY: top + rise,
  };
}

// bait and tackle shop: low block building, deep porch, sign board slot (textured board added by the caller)
export function baitShop(seed) {
  const r = rng(seed);
  const p = new Parts();
  const w = 12;
  const d = 8;
  const h = 3.4;
  p.box(0, 0.15, 0, w + 0.4, 0.3, d + 0.4, SURF.concrete, 0xc8c4b8);
  p.box(0, 0.3 + h / 2, 0, w, h, d, SURF.planks, 0x6aa8b0, { tint: 1 });
  p.box(0, 0.3 + h + 0.4, d / 2 + 0.05, w, 0.8, 0.1, SURF.planks, 0x6aa8b0, { tint: 1 }); // false front
  p.box(0, 0.3 + h + 0.05, 0, w + 0.6, 0.12, d + 0.6, SURF.rustPaint, 0x9a9890);
  // porch
  p.box(0, 0.22, d / 2 + 1.6, w, 0.14, 3.2, SURF.planks, 0x9a8a70);
  for (const x of [-w / 2 + 0.2, -w / 6, w / 6, w / 2 - 0.2])
    p.box(x, 1.8, d / 2 + 3.0, 0.16, 3.2, 0.16, SURF.planks, 0xe8e4da);
  p.box(0, 3.45, d / 2 + 1.6, w + 0.3, 0.08, 3.4, SURF.galv, 0xb0b4b8, { rx: -0.08 });
  // storefront glazing and screen door
  p.box(-3, 1.6, d / 2 + 0.03, 4.2, 1.6, 0.04, SURF.glass, 0x30404a);
  p.box(3, 1.6, d / 2 + 0.03, 3.2, 1.6, 0.04, SURF.glass, 0x30404a);
  p.box(0, 1.35, d / 2 + 0.04, 1.0, 2.1, 0.05, SURF.wood, 0x3a5a4a);
  // ice chest by the door
  p.box(1.6, 0.85, d / 2 + 0.6, 1.6, 1.1, 0.8, SURF.paint, 0xf0f0f0);
  p.box(1.6, 1.42, d / 2 + 0.6, 1.66, 0.06, 0.86, SURF.galv, 0xc8c8c8);
  // bait tanks, bench, crab traps, buoys hung on the wall
  p.box(-4.5, 0.75, d / 2 + 0.8, 1.2, 0.7, 0.7, SURF.plastic, 0x2a6a8a);
  p.box(-1.6, 0.5, d / 2 + 2.6, 1.6, 0.08, 0.4, SURF.planks, 0xa89a80);
  for (let i = 0; i < 4; i++)
    p.cyl(
      -5 + i * 0.6,
      2.4,
      d / 2 + 0.12,
      0.14,
      0.4,
      SURF.plastic,
      [0xf06a2a, 0xffffff, 0xe8d02a, 0xd83a3a][i],
      { rx: Math.PI / 2 },
    );
  p.box(-w / 2 - 0.5, 0.4, -1, 0.7, 0.7, 0.7, SURF.galv, 0xd0d0c8);
  return {
    geo: p.build(),
    w,
    d,
    h: h + 0.8,
    signY: 0.3 + h + 0.45,
    signZ: d / 2 + 0.12,
    colliders: [{ x: 0, y: 0.3 + h / 2, z: 0, hx: w / 2, hy: h / 2 + 0.3, hz: d / 2 }],
  };
}

// canvas sign board texture
export function signTexture(lines, opts = {}) {
  const c = document.createElement('canvas');
  c.width = opts.w || 1024;
  c.height = opts.h || 256;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#f2ead6';
  g.fillRect(0, 0, c.width, c.height);
  // weathering: streaks and chips
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(80,60,40,${Math.random() * 0.08})`;
    g.fillRect(
      Math.random() * c.width,
      Math.random() * c.height,
      2 + Math.random() * 6,
      6 + Math.random() * 40,
    );
  }
  g.strokeStyle = opts.edge || '#1d4a5a';
  g.lineWidth = 14;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    g.fillStyle = ln.color || opts.ink || '#1d4a5a';
    g.font = `bold ${ln.px || 96}px Georgia, serif`;
    g.fillText(ln.text, c.width / 2, (c.height * (i + 0.5)) / lines.length + (ln.dy || 0));
  });
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(240,234,214,${Math.random() * 0.5})`;
    g.beginPath();
    g.arc(Math.random() * c.width, Math.random() * c.height, Math.random() * 5, 0, 6.3);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

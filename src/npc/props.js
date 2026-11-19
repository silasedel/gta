// Props people carry, push, ride, sit on and work with (NPC-AI track).
// Each prop is ONE merged mesh (vertex colors + a shared grain/bump material), so a crowd full of strollers, carts,
// coolers and hats costs one draw call per prop. Seeded: colors, proportions and details differ per instance.
// Conventions: meters; ground props have the origin on the ground, front = +Z (the same frame as the person who
// uses them); held / worn props have the origin at the grip or attach point. userData.anchors holds local points
// for hands, seats and queues.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, mixHex } from './rand.js';
import { preloadLib, libGet } from '../world/libprops.js';
preloadLib(['cap']); // r4-library: the user's baseball cap (Cap 1, street/cap.glb) for 'cap' / 'capBack' hats; code cap until it loads

const BR = [
  0xe07f68, 0x2f8a86, 0xe6b3b5, 0xa6d3bf, 0x9cc1de, 0xe8d78a, 0xb8a8d2, 0x5fb3b8, 0xe89a85,
  0xb5443e, 0xc9a043, 0x2a6fb5, 0xd95f9a, 0x58a55c, 0xf08a2c,
];
const NE = [
  0xf0ede6, 0xe9e1cf, 0xd6c4a0, 0x2a3442, 0x5a6450, 0x3a3a3c, 0xb5a385, 0x1f1f21, 0x8e9094,
  0xa95d3d, 0x6b7a8f,
];
const WOOD = [0x8a6a46, 0x6e4f33, 0xa9895f, 0x4c3626, 0xc2a57a],
  STEEL = 0xb9bcc0,
  DARK = 0x1c1c1e,
  RUBBER = 0x18181a,
  CHROME = 0xd4d8dc,
  CARD = 0xb08a5a;

let _mat = null,
  _matDS = null;
function grainTex() {
  const n = 128,
    c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  const d = x.createImageData(n, n);
  const r = rng(991);
  for (let i = 0; i < n * n; i++) {
    const v = 205 + r() * 50 - ((i % n) % 9 === 0 ? 14 : 0);
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v;
    d.data[i * 4 + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function bumpTex() {
  const n = 128,
    c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  const d = x.createImageData(n, n);
  const r = rng(417);
  for (let i = 0; i < n * n; i++) {
    d.data[i * 4] = 118 + r() * 20;
    d.data[i * 4 + 1] = 118 + r() * 20;
    d.data[i * 4 + 2] = 255;
    d.data[i * 4 + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}
export function propMaterial(doubleSide = false) {
  if (!_mat) {
    const g = typeof document !== 'undefined' ? grainTex() : null,
      b = typeof document !== 'undefined' ? bumpTex() : null;
    _mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: g,
      normalMap: b,
      roughness: 0.72,
      metalness: 0.04,
      name: 'npcProp',
    });
    _matDS = _mat.clone();
    _matDS.side = THREE.DoubleSide;
    _matDS.name = 'npcPropDS';
  }
  return doubleSide ? _matDS : _mat;
}
const _m4 = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _v = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _c = new THREE.Color();
class PB {
  constructor() {
    this.g = [];
    this.anchors = {};
    this.ds = false;
  }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m4.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m4);
    const n = g.attributes.position.count,
      col = new Float32Array(n * 3);
    _c.setHex(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv)
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    this.g.push(g);
    return this;
  }
  box(w, h, d, c, x, y, z, rx, ry, rz) {
    return this.add(new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz);
  }
  cyl(rt, rb, h, c, x, y, z, rx, ry, rz, seg = 10, open = false) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), c, x, y, z, rx, ry, rz);
  }
  sph(r, c, x, y, z, sx = 1, sy = 1, sz = 1, ws = 10, hs = 7, th0 = 0, th1 = Math.PI) {
    return this.add(
      new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, th0, th1),
      c,
      x,
      y,
      z,
      0,
      0,
      0,
      sx,
      sy,
      sz,
    );
  }
  tor(R, r, c, x, y, z, rx, ry, rz, arc = Math.PI * 2, ts = 14) {
    return this.add(new THREE.TorusGeometry(R, r, 5, ts, arc), c, x, y, z, rx, ry, rz);
  }
  cone(r, h, c, x, y, z, rx, ry, rz, seg = 10, open = false) {
    return this.add(new THREE.ConeGeometry(r, h, seg, 1, open), c, x, y, z, rx, ry, rz);
  }
  // bar between two points
  bar(a, b, r, c, seg = 6) {
    const d = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = d.length();
    const g = new THREE.CylinderGeometry(r, r, L, seg, 1);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const e = new THREE.Euler().setFromQuaternion(_q);
    return this.add(g, c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, e.x, e.y, e.z);
  }
  tube(pts, r, c, seg = 5) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return this.add(new THREE.TubeGeometry(curve, pts.length * 5, r, seg, false), c);
  }
  wheel(R, w, x, y, z, tire = RUBBER, hub = STEEL) {
    this.cyl(R, R, w, tire, x, y, z, 0, 0, Math.PI / 2, 14);
    return this.cyl(R * 0.55, R * 0.55, w * 1.08, hub, x, y, z, 0, 0, Math.PI / 2, 10);
  }
  // striped / banded cloth plane in XZ (w along X, d along Z), bands along Z
  cloth(w, d, cols, x, y, z, ry = 0, bands = 8, sag = 0, r = null) {
    const g = new THREE.PlaneGeometry(w, d, 6, bands);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setY(
        i,
        (r ? (r() - 0.5) * 0.012 : 0) - sag * (1 - Math.pow(Math.abs(p.getX(i)) / (w / 2), 2)),
      );
    g.computeVertexNormals();
    const ng = g.toNonIndexed();
    const n = ng.attributes.position.count,
      col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      const zc =
        (ng.attributes.position.getZ(i) +
          ng.attributes.position.getZ(i + 1) +
          ng.attributes.position.getZ(i + 2)) /
        3;
      const b = Math.min(bands - 1, Math.max(0, Math.floor((zc / d + 0.5) * bands)));
      _c.setHex(cols[b % cols.length]);
      for (let k = 0; k < 3; k++) {
        col[(i + k) * 3] = _c.r;
        col[(i + k) * 3 + 1] = _c.g;
        col[(i + k) * 3 + 2] = _c.b;
      }
    }
    _m4.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1));
    ng.applyMatrix4(_m4);
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.g.push(ng);
    this.ds = true;
    return this;
  }
  anchor(name, x, y, z) {
    this.anchors[name] = new THREE.Vector3(x, y, z);
    return this;
  }
  build(kind) {
    const geo = mergeGeometries(this.g, false);
    for (const g of this.g) g.dispose();
    const m = new THREE.Mesh(geo, propMaterial(this.ds));
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = 'prop-' + kind;
    m.userData.kind = kind;
    m.userData.anchors = this.anchors;
    m.userData.tris = geo.attributes.position.count / 3;
    return m;
  }
}
const pk = (r, a) => r.pick(a);

// ================================================================ pushed / ridden
export function stroller(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const fab = pk(r, BR.concat([0x2a3442, 0x3a3a3c, 0x8e9094])),
    fr = pk(r, [DARK, STEEL, 0x6b7a8f]),
    jog = r.chance(0.3);
  const wy = jog ? 0.15 : 0.09,
    wr = wy;
  for (const s of [-1, 1]) {
    P.bar([s * 0.24, 1.0, -0.42], [s * 0.22, 0.2, 0.3], 0.012, fr);
    P.bar([s * 0.22, 0.62, -0.02], [s * 0.24, wy, -0.3], 0.012, fr);
    P.bar([s * 0.22, 0.2, 0.3], [s * (jog ? 0.02 : 0.22), wy, 0.4], 0.012, fr);
    P.wheel(wr, 0.035, s * 0.27, wy, -0.3);
    if (!jog) P.wheel(wr * 0.9, 0.03, s * 0.24, wy * 0.9, 0.4);
  }
  if (jog) P.wheel(wr, 0.035, 0, wy, 0.42);
  P.bar([-0.24, 1.0, -0.42], [0.24, 1.0, -0.42], 0.016, DARK);
  P.bar([-0.22, 0.2, 0.3], [0.22, 0.2, 0.3], 0.01, fr);
  P.box(0.4, 0.03, 0.34, fab, 0, 0.5, 0.02, -0.12);
  P.box(0.4, 0.42, 0.03, fab, 0, 0.71, -0.17, -0.35);
  P.box(0.4, 0.2, 0.03, fab, 0, 0.4, 0.2, 0.5);
  P.box(0.03, 0.14, 0.34, fab, -0.2, 0.57, 0.02);
  P.box(0.03, 0.14, 0.34, fab, 0.2, 0.57, 0.02);
  P.sph(0.25, fab, 0, 0.9, -0.1, 0.9, 0.75, 1.0, 10, 5, 0, Math.PI * 0.5); // canopy
  P.box(0.36, 0.16, 0.3, mixHex(fab, 0x000000, 0.45), 0, 0.26, -0.02); // basket
  const skin = pk(r, [0xf1d3bd, 0xd2a27c, 0x9a6a48, 0x6b452e]);
  P.sph(0.075, skin, 0, 0.73, -0.06);
  P.sph(
    0.078,
    pk(r, [0xf0ede6, 0xe6b3b5, 0x9cc1de, 0xe8d78a]),
    0,
    0.755,
    -0.075,
    1,
    0.75,
    1,
    8,
    4,
    0,
    Math.PI * 0.5,
  );
  P.box(
    0.3,
    0.1,
    0.3,
    pk(r, [0xf0ede6, 0xe6b3b5, 0x9cc1de, 0xa6d3bf, 0xe8d78a]),
    0,
    0.57,
    0.06,
    -0.12,
  );
  P.cyl(0.03, 0.028, 0.1, 0xf0ede6, 0.3, 0.86, -0.3); // cup in holder
  return P.anchor('handL', 0.2, 1.0, -0.42)
    .anchor('handR', -0.2, 1.0, -0.42)
    .anchor('user', 0, 0, -0.78)
    .build('stroller');
}
export function mobilityScooter(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const body = pk(r, [0x2a6fb5, 0xb5443e, 0x58a55c, 0x8e9094, 0x7a3b8a, 0xc9a043, 0x2f8a86]),
    seat = pk(r, [DARK, 0x3a3a3c, 0x5a4636]);
  P.box(0.5, 0.07, 1.0, body, 0, 0.19, 0.02);
  P.box(0.52, 0.2, 0.42, body, 0, 0.3, -0.34);
  P.box(0.4, 0.02, 0.5, 0x2c2e31, 0, 0.235, 0.12);
  for (const s of [-1, 1]) {
    P.wheel(0.13, 0.07, s * 0.27, 0.13, -0.38);
    P.wheel(0.11, 0.06, s * (r.chance(0.5) ? 0.24 : 0.06), 0.11, 0.48);
  }
  P.sph(0.2, body, 0, 0.2, 0.5, 1.2, 0.7, 0.8, 10, 5, 0, Math.PI * 0.5);
  P.bar([0, 0.24, 0.42], [0, 0.92, 0.28], 0.03, 0x2c2e31);
  P.box(0.2, 0.12, 0.08, body, 0, 0.93, 0.27, 0.2);
  P.bar([-0.26, 0.96, 0.24], [0.26, 0.96, 0.24], 0.015, CHROME);
  P.cyl(0.02, 0.02, 0.1, DARK, -0.24, 0.96, 0.24, 0, 0, Math.PI / 2);
  P.cyl(0.02, 0.02, 0.1, DARK, 0.24, 0.96, 0.24, 0, 0, Math.PI / 2);
  // basket (wire look: dark open box with rim) + item
  P.box(0.32, 0.2, 0.22, 0x2a2c2e, 0, 0.72, 0.46);
  P.box(0.34, 0.015, 0.24, CHROME, 0, 0.825, 0.46);
  if (r.chance(0.7)) P.cyl(0.04, 0.035, 0.14, pk(r, [0xf0ede6, 0xb5443e]), 0.08, 0.86, 0.46);
  if (r.chance(0.6))
    P.box(0.14, 0.14, 0.1, pk(r, [CARD, 0xe9e1cf, 0x2f8a86]), -0.07, 0.86, 0.46, 0, 0.3);
  P.cyl(0.035, 0.035, 0.3, CHROME, 0, 0.45, -0.3);
  P.box(0.46, 0.08, 0.42, seat, 0, 0.62, -0.28);
  P.box(0.44, 0.4, 0.07, seat, 0, 0.86, -0.5, -0.1);
  for (const s of [-1, 1]) {
    P.box(0.05, 0.03, 0.3, DARK, s * 0.25, 0.82, -0.28);
    P.bar([s * 0.25, 0.64, -0.42], [s * 0.25, 0.82, -0.4], 0.012, CHROME);
  }
  P.cyl(0.03, 0.03, 0.02, 0xfff4c0, 0, 0.36, 0.66, Math.PI / 2);
  if (r.chance(0.35)) {
    P.bar([0.22, 0.5, -0.52], [0.22, 1.7, -0.52], 0.006, 0xf0ede6);
    P.box(0.005, 0.14, 0.22, 0xf08a2c, 0.22, 1.63, -0.41);
  }
  return P.anchor('seat', 0, 0.66, -0.28)
    .anchor('handL', 0.24, 0.96, 0.24)
    .anchor('handR', -0.24, 0.96, 0.24)
    .build('mobilityScooter');
}
export function walker(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const fr = pk(r, [0x2a6fb5, 0xb5443e, STEEL, 0x7a3b8a, 0x2c2e31]);
  for (const s of [-1, 1]) {
    P.bar([s * 0.25, 0.9, 0.0], [s * 0.26, 0.1, 0.22], 0.012, fr);
    P.bar([s * 0.25, 0.9, 0.0], [s * 0.26, 0.1, -0.22], 0.012, fr);
    P.wheel(0.09, 0.03, s * 0.27, 0.09, 0.22);
    P.wheel(0.09, 0.03, s * 0.27, 0.09, -0.22);
    P.cyl(0.018, 0.018, 0.12, DARK, s * 0.25, 0.9, -0.04, Math.PI / 2);
    P.bar([s * 0.25, 0.86, 0.02], [s * 0.25, 0.8, -0.08], 0.006, CHROME);
  }
  P.box(0.44, 0.03, 0.26, DARK, 0, 0.56, 0.06);
  P.box(0.4, 0.16, 0.2, pk(r, [DARK, 0x3a3a3c, 0x2a3442]), 0, 0.42, 0.06);
  P.bar([-0.25, 0.74, 0.12], [0.25, 0.74, 0.12], 0.014, DARK);
  return P.anchor('handL', 0.25, 0.9, -0.04)
    .anchor('handR', -0.25, 0.9, -0.04)
    .anchor('user', 0, 0, -0.42)
    .build('walker');
}
export function cane(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x6e4f33, 0x2c2e31, STEEL, 0x4c3626]);
  P.cyl(0.011, 0.009, 0.86, c, 0, -0.43, 0);
  P.tor(0.05, 0.011, c, 0, 0.0, -0.05, 0, Math.PI / 2, 0, Math.PI, 8);
  P.cyl(0.014, 0.014, 0.03, RUBBER, 0, -0.86, 0);
  return P.build('cane');
} // origin: grip, shaft goes down
export function bicycle(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const fr = pk(r, BR.concat([DARK, 0xf0ede6])),
    cruiser = r.chance(0.55);
  const R = 0.34,
    wb = 0.52;
  for (const z of [-wb, wb]) {
    P.tor(R, 0.022, RUBBER, 0, R, z, 0, Math.PI / 2, 0, Math.PI * 2, 20);
    P.tor(R - 0.03, 0.008, CHROME, 0, R, z, 0, Math.PI / 2, 0, Math.PI * 2, 16);
    P.cyl(0.03, 0.03, 0.08, STEEL, 0, R, z, 0, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++)
      P.bar(
        [0, R + Math.cos(i * 0.785) * (R - 0.03), z + Math.sin(i * 0.785) * (R - 0.03)],
        [0, R - Math.cos(i * 0.785) * (R - 0.03), z - Math.sin(i * 0.785) * (R - 0.03)],
        0.003,
        CHROME,
        4,
      );
  }
  const bb = [0, 0.3, -0.06],
    seatT = [0, 0.86, -0.2],
    head = [0, 0.84, 0.36];
  P.bar(bb, seatT, 0.016, fr);
  P.bar(seatT, head, 0.016, fr);
  P.bar(bb, [0, 0.8, 0.34], 0.018, fr);
  P.bar(bb, [0, R, -wb], 0.012, fr);
  P.bar(seatT, [0, R, -wb], 0.01, fr);
  P.bar(head, [0, R, wb], 0.014, fr);
  P.bar(head, [0, 1.02, 0.3], 0.012, CHROME);
  P.bar(
    [-0.28, cruiser ? 1.06 : 1.0, cruiser ? 0.2 : 0.32],
    [0.28, cruiser ? 1.06 : 1.0, cruiser ? 0.2 : 0.32],
    0.011,
    CHROME,
  );
  P.box(0.14, 0.05, 0.26, pk(r, [DARK, 0x6e4f33, 0xf0ede6]), 0, 0.93, -0.22);
  P.cyl(0.09, 0.09, 0.008, CHROME, 0.045, 0.3, -0.06, 0, 0, Math.PI / 2, 14);
  P.bar([0.07, 0.3, -0.06], [0.07, 0.14, -0.02], 0.008, DARK);
  P.bar([-0.07, 0.3, -0.06], [-0.07, 0.46, -0.1], 0.008, DARK);
  P.box(0.09, 0.02, 0.06, DARK, 0.12, 0.14, -0.02);
  P.box(0.09, 0.02, 0.06, DARK, -0.12, 0.46, -0.1);
  if (cruiser) {
    P.box(0.3, 0.2, 0.22, 0x9a7b4f, 0, 0.98, 0.56);
    P.tor(R + 0.02, 0.006, fr, 0, R, -wb, 0, Math.PI / 2, 0, Math.PI * 0.9, 12);
  }
  return P.anchor('seat', 0, 0.95, -0.22)
    .anchor('handL', 0.26, cruiser ? 1.06 : 1.0, cruiser ? 0.2 : 0.32)
    .anchor('handR', -0.26, cruiser ? 1.06 : 1.0, cruiser ? 0.2 : 0.32)
    .build('bicycle');
}
export function skateboard(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const long = r.chance(0.3),
    L = long ? 1.0 : 0.8;
  P.box(0.2, 0.012, L, pk(r, [0x1f1f21, 0x8a6a46, 0xc2a57a]), 0, 0.095, 0);
  P.box(0.19, 0.004, L - 0.02, pk(r, BR), 0, 0.087, 0);
  for (const z of [-L * 0.36, L * 0.36]) {
    P.box(0.14, 0.03, 0.05, STEEL, 0, 0.07, z);
    for (const s of [-1, 1])
      P.cyl(
        0.028,
        0.028,
        0.035,
        pk(r, [0xf0ede6, 0xe8d78a, 0xb5443e, 0x58a55c]),
        s * 0.09,
        0.028,
        z,
        0,
        0,
        Math.PI / 2,
      );
  }
  return P.anchor('stand', 0, 0.1, 0).build('skateboard');
}
export function rollerLuggage(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, BR.concat(NE)),
    h = r.range(0.5, 0.72);
  P.box(0.38, h, 0.24, c, 0, h / 2 + 0.05, 0);
  for (let i = 1; i < 4; i++)
    P.box(0.385, 0.012, 0.245, mixHex(c, 0x000000, 0.25), 0, 0.05 + (h * i) / 4, 0);
  for (const s of [-1, 1]) {
    P.cyl(0.03, 0.03, 0.03, DARK, s * 0.15, 0.03, -0.09, 0, 0, Math.PI / 2);
    P.bar([s * 0.09, h + 0.05, -0.09], [s * 0.09, h + 0.45, -0.09], 0.008, CHROME);
  }
  P.bar([-0.09, h + 0.45, -0.09], [0.09, h + 0.45, -0.09], 0.012, DARK);
  P.box(0.06, 0.09, 0.005, 0xf0ede6, 0.12, h * 0.8, 0.123);
  return P.anchor('handle', 0, h + 0.45, -0.09).build('rollerLuggage');
}
function boxes(P, r, x, y, z, n) {
  let yy = y;
  for (let i = 0; i < n; i++) {
    const w = r.range(0.3, 0.46),
      h = r.range(0.2, 0.34),
      d = r.range(0.28, 0.4),
      c = pk(r, [CARD, 0xa67c4e, 0xc09a68, 0x9c7a50]);
    const ry = (r() - 0.5) * 0.3;
    P.box(w, h, d, c, x, yy + h / 2, z, 0, ry);
    P.box(w + 0.004, 0.006, 0.05, 0xd9c9a0, x, yy + h + 0.002, z, 0, ry);
    P.box(
      0.1,
      0.07,
      0.004,
      0xf0ede6,
      x + 0.05,
      yy + h * 0.55,
      z + (d / 2) * Math.cos(ry) + 0.004,
      0,
      ry,
    );
    yy += h;
  }
  return yy;
}
export function handTruck(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0xb5443e, 0x2a6fb5, 0x2c2e31, 0xc9a043]);
  for (const s of [-1, 1]) {
    P.bar([s * 0.2, 0.06, 0.02], [s * 0.2, 1.2, -0.12], 0.014, c);
    P.wheel(0.11, 0.05, s * 0.26, 0.11, -0.06);
  }
  P.bar([-0.2, 1.2, -0.12], [0.2, 1.2, -0.12], 0.014, c);
  P.bar([-0.2, 0.6, -0.05], [0.2, 0.6, -0.05], 0.01, c);
  P.box(0.44, 0.012, 0.26, STEEL, 0, 0.03, 0.14);
  boxes(P, r, 0, 0.04, 0.17, r.int(2, 4));
  return P.anchor('handL', 0.2, 1.2, -0.12)
    .anchor('handR', -0.2, 1.2, -0.12)
    .anchor('user', 0, 0, -0.5)
    .build('handTruck');
}
export function boxStack(seed = 1) {
  const r = rng(seed),
    P = new PB();
  boxes(P, r, 0, 0, 0, r.int(2, 4));
  if (r.chance(0.7)) boxes(P, r, 0.5, 0, 0.05, r.int(1, 3));
  if (r.chance(0.4)) boxes(P, r, 0.2, 0, 0.48, 1);
  return P.build('boxStack');
}
export function carryBox(seed = 1) {
  const r = rng(seed),
    P = new PB();
  boxes(P, r, 0, -0.15, 0, 1);
  return P.build('carryBox');
} // origin: center between the hands

// ================================================================ beach
export function beachTowel(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const a = pk(r, BR),
    b = pk(r, [0xf0ede6, 0xe9e1cf, ...BR]),
    c = r.chance(0.4) ? pk(r, BR) : a;
  P.cloth(
    0.9,
    1.85,
    r.chance(0.3) ? [a] : [a, b, c, b],
    0,
    0.025,
    0,
    0,
    pk(r, [6, 9, 12, 16]),
    0,
    r,
  );
  return P.anchor('lie', 0, 0.03, 0).build('beachTowel');
}
export function beachUmbrella(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const a = pk(r, BR),
    b = r.chance(0.6) ? 0xf0ede6 : pk(r, BR),
    tilt = r.range(-0.22, 0.22),
    tz = r.range(-0.15, 0.15);
  const top = new THREE.Vector3(0, 2.05, 0).applyEuler(new THREE.Euler(tz, 0, tilt));
  P.bar([0, -0.3, 0], [top.x, top.y, top.z], 0.018, 0xe9e9e9);
  P.sph(0.12, 0xd9c7a0, 0, 0.02, 0, 1, 0.3, 1, 8, 4, 0, Math.PI / 2);
  const g = new THREE.ConeGeometry(1.08, 0.42, 16, 1, true).toNonIndexed();
  const n = g.attributes.position.count,
    col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const ax =
        (g.attributes.position.getX(i) +
          g.attributes.position.getX(i + 1) +
          g.attributes.position.getX(i + 2)) /
        3,
      az =
        (g.attributes.position.getZ(i) +
          g.attributes.position.getZ(i + 1) +
          g.attributes.position.getZ(i + 2)) /
        3;
    const seg = Math.floor((Math.atan2(az, ax) / (Math.PI * 2) + 1) * 8) % 2;
    _c.setHex(seg ? a : b);
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = _c.r;
      col[(i + k) * 3 + 1] = _c.g;
      col[(i + k) * 3 + 2] = _c.b;
    }
  }
  _m4.compose(
    _v.copy(top).multiplyScalar(0.94),
    _q.setFromEuler(_e.set(tz, 0, tilt)),
    _s.set(1, 1, 1),
  );
  g.applyMatrix4(_m4);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  P.g.push(g);
  P.ds = true;
  return P.build('beachUmbrella');
}
export function beachChair(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const a = pk(r, BR),
    b = r.chance(0.5) ? 0xf0ede6 : pk(r, BR);
  for (const s of [-1, 1]) {
    P.bar([s * 0.28, 0.02, 0.3], [s * 0.28, 0.72, -0.42], 0.013, 0xdadada);
    P.bar([s * 0.28, 0.02, -0.3], [s * 0.28, 0.4, 0.34], 0.013, 0xdadada);
    P.box(0.04, 0.02, 0.36, 0x8a6a46, s * 0.3, 0.44, 0.02);
  }
  P.cloth(0.54, 0.5, [a, b], 0, 0.27, 0.1, 0, 4, 0.05);
  const g = new PB();
  P.box(0.54, 0.56, 0.015, a, 0, 0.5, -0.27, -0.55);
  P.box(0.54, 0.12, 0.017, b, 0, 0.56, -0.305, -0.55);
  return P.anchor('seat', 0, 0.3, 0.02).build('beachChair');
}
export function cooler(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x2a6fb5, 0xb5443e, 0x2f8a86, 0xf0ede6, 0x58a55c, 0xf08a2c]),
    open = r.chance(0.35);
  P.box(0.6, 0.34, 0.36, c, 0, 0.17, 0);
  if (open) {
    P.box(0.6, 0.05, 0.36, 0xf0ede6, 0, 0.5, -0.19, -1.3);
    P.box(0.54, 0.02, 0.3, 0xdff2fa, 0, 0.335, 0);
    for (let i = 0; i < 5; i++)
      P.cyl(
        0.032,
        0.032,
        0.12,
        pk(r, BR),
        r.range(-0.22, 0.22),
        0.36,
        r.range(-0.1, 0.1),
        r.range(0.9, 1.5),
        r.range(0, 3),
      );
  } else P.box(0.62, 0.06, 0.38, 0xf0ede6, 0, 0.37, 0);
  P.bar([-0.33, 0.28, -0.1], [-0.33, 0.28, 0.1], 0.012, 0xf0ede6);
  P.bar([0.33, 0.28, -0.1], [0.33, 0.28, 0.1], 0.012, 0xf0ede6);
  return P.anchor('seat', 0, 0.4, 0).build('cooler');
}
export function beachBag(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0xd9c08a, 0xe07f68, 0x2f8a86, 0xf0ede6]);
  P.box(0.42, 0.3, 0.16, c, 0, 0.15, 0);
  P.tor(0.11, 0.01, mixHex(c, 0, 0.3), 0, 0.31, 0, 0, 0, 0, Math.PI, 8);
  P.cyl(0.05, 0.05, 0.36, pk(r, BR), 0.08, 0.33, 0, 0, 0, 1.2);
  P.cyl(0.025, 0.03, 0.12, 0xf08a2c, -0.12, 0.34, 0.02);
  return P.build('beachBag');
}
export function volleyballNet(seed = 1) {
  const P = new PB();
  for (const s of [-1, 1]) {
    P.cyl(0.05, 0.05, 2.6, 0xdedede, s * 4.6, 1.3, 0);
    P.cyl(0.075, 0.075, 1.6, 0x2a6fb5, s * 4.6, 0.9, 0);
  }
  P.box(9.1, 0.07, 0.02, 0xf5f5f5, 0, 2.43, 0);
  P.box(9.1, 0.05, 0.02, 0xf5f5f5, 0, 1.45, 0);
  for (let i = 0; i <= 30; i++) P.box(0.012, 0.95, 0.012, 0x2a2a2a, -4.5 + i * 0.3, 1.94, 0);
  for (let j = 1; j < 5; j++) P.box(9.0, 0.012, 0.012, 0x2a2a2a, 0, 1.45 + j * 0.19, 0);
  for (const z of [-8, 8]) P.box(8.0, 0.02, 0.05, 0x2a6fb5, 0, 0.012, z);
  for (const x of [-4, 4]) P.box(0.05, 0.02, 16, 0x2a6fb5, x, 0.012, 0);
  return P.build('volleyballNet');
}
export function ball(seed = 1, radius = 0.105) {
  const r = rng(seed),
    P = new PB();
  const a = pk(r, [0xf2efe6, 0xe8d78a, 0x2a6fb5]),
    b = pk(r, [0xf2efe6, 0x2a6fb5, 0xe8d78a, 0xb5443e]);
  P.sph(radius, a, 0, 0, 0, 1, 1, 1, 12, 8);
  P.tor(radius * 1.005, radius * 0.06, b, 0, 0, 0, Math.PI / 2, 0, 0);
  P.tor(radius * 1.005, radius * 0.06, b, 0, 0, 0, 0, 0.8, 0);
  return P.build('ball');
}
export function lifeguardCan(seed = 1) {
  const P = new PB();
  P.sph(0.09, 0xd9432b, 0, 0, 0, 1, 1, 3.4, 8, 6);
  P.bar([0.09, 0, -0.18], [0.09, 0, 0.18], 0.01, 0xf0ede6);
  P.bar([-0.09, 0, -0.18], [-0.09, 0, 0.18], 0.01, 0xf0ede6);
  return P.build('lifeguardCan');
}

// ================================================================ vendors and street stations
function umbrellaTop(P, r, x, y, z, R = 1.0) {
  const a = pk(r, BR),
    b = r.chance(0.6) ? 0xf0ede6 : pk(r, BR);
  P.bar([x, 0.9, z], [x, y + 0.2, z], 0.018, 0xdadada);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2,
      a1 = ((i + 1) / 8) * Math.PI * 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          x,
          y + 0.36,
          z,
          x + Math.cos(a0) * R,
          y,
          z + Math.sin(a0) * R,
          x + Math.cos(a1) * R,
          y,
          z + Math.sin(a1) * R,
        ],
        3,
      ),
    );
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 1, 0, 0, 1, 0], 2));
    g.computeVertexNormals();
    P.add(g, i % 2 ? a : b);
  }
  P.ds = true;
}
function fruitPile(P, r, x, y, z, w, d, kind) {
  const F = {
    mango: [0xe9a23b, 0.05, 1.3],
    orange: [0xf08a2c, 0.042, 1],
    lime: [0x7fb23a, 0.03, 1],
    papaya: [0xd9b24a, 0.07, 1.8],
    coconut: [0x5b7a3a, 0.085, 1.1],
    banana: [0xe9d04a, 0.03, 3.2],
    avocado: [0x3f5a2a, 0.045, 1.3],
    pineapple: [0xc9a043, 0.07, 1.6],
    watermelon: [0x2f7a3a, 0.12, 1.3],
  }[kind];
  const n = Math.max(3, Math.floor((w * d) / (F[1] * F[1] * 5)));
  for (let i = 0; i < n; i++)
    P.sph(
      F[1],
      mixHex(F[0], r.chance(0.5) ? 0xb5443e : 0x5a6450, r() * 0.18),
      x + (r() - 0.5) * (w - F[1] * 2),
      y + F[1] * (0.7 + (i % 3) * 0.5),
      z + (r() - 0.5) * (d - F[1] * 2),
      1,
      kind === 'banana' ? 1 : 1,
      F[2],
      7,
      5,
    );
  if (kind === 'pineapple')
    for (let i = 0; i < 3; i++)
      P.cone(
        0.04,
        0.14,
        0x4f7a2f,
        x + (r() - 0.5) * w * 0.6,
        y + 0.2,
        z + (r() - 0.5) * d * 0.5,
        0,
        0,
        0,
        5,
      );
}
export function fruitCart(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const wood = pk(r, WOOD),
    paint = pk(r, BR);
  P.box(1.5, 0.08, 0.85, wood, 0, 0.78, 0);
  P.box(1.5, 0.14, 0.04, paint, 0, 0.86, 0.43);
  P.box(1.5, 0.14, 0.04, paint, 0, 0.86, -0.43);
  P.box(0.04, 0.14, 0.85, paint, 0.75, 0.86, 0);
  P.box(0.04, 0.14, 0.85, paint, -0.75, 0.86, 0);
  for (const s of [-1, 1]) {
    P.tor(0.38, 0.025, 0x3a2a1e, s * 0.82, 0.4, -0.05, 0, Math.PI / 2, 0, Math.PI * 2, 18);
    for (let i = 0; i < 4; i++)
      P.bar(
        [s * 0.82, 0.4 + Math.cos(i * 0.785) * 0.37, -0.05 + Math.sin(i * 0.785) * 0.37],
        [s * 0.82, 0.4 - Math.cos(i * 0.785) * 0.37, -0.05 - Math.sin(i * 0.785) * 0.37],
        0.012,
        wood,
        4,
      );
    P.cyl(0.05, 0.05, 0.06, 0x3a2a1e, s * 0.82, 0.4, -0.05, 0, 0, Math.PI / 2);
  }
  P.bar([-0.82, 0.4, -0.05], [0.82, 0.4, -0.05], 0.02, 0x3a2a1e);
  P.box(0.06, 0.74, 0.06, wood, 0.6, 0.37, 0.36);
  P.box(0.06, 0.74, 0.06, wood, -0.6, 0.37, 0.36);
  P.bar([-0.7, 0.8, -0.42], [-0.9, 0.95, -0.9], 0.02, wood);
  P.bar([0.7, 0.8, -0.42], [0.9, 0.95, -0.9], 0.02, wood);
  P.bar([-0.9, 0.95, -0.9], [0.9, 0.95, -0.9], 0.022, wood);
  const kinds = r.shuffle([
    'mango',
    'orange',
    'lime',
    'papaya',
    'coconut',
    'banana',
    'avocado',
    'pineapple',
    'watermelon',
  ]);
  for (let i = 0; i < 6; i++) {
    const cx = -0.5 + (i % 3) * 0.5,
      cz = i < 3 ? 0.2 : -0.2,
      cy = i < 3 ? 0.84 : 0.94;
    P.box(
      0.44,
      0.12,
      0.34,
      pk(r, [0x9a7b4f, 0x7a5c3a, 0x58a55c, 0xb5443e]),
      cx,
      cy,
      cz,
      i < 3 ? 0.18 : 0,
    );
    fruitPile(P, r, cx, cy + 0.04, cz, 0.4, 0.3, kinds[i]);
  }
  umbrellaTop(P, r, 0.35, 2.15, -0.3, 1.15);
  P.bar([-0.55, 0.9, -0.38], [-0.55, 1.75, -0.38], 0.012, STEEL);
  P.bar([-0.55, 1.75, -0.38], [-0.3, 1.75, -0.38], 0.01, STEEL);
  P.cyl(0.11, 0.11, 0.02, STEEL, -0.3, 1.5, -0.38);
  P.cyl(0.13, 0.02, 0.12, STEEL, -0.3, 1.4, -0.38); // hanging scale
  for (let i = 0; i < 3; i++) {
    P.cyl(0.045, 0.035, 0.11, 0xe8f1f4, 0.55 - i * 0.1, 0.96, 0.36);
    P.cyl(0.04, 0.035, 0.03, pk(r, [0xe9a23b, 0xd9432b, 0xf08a2c]), 0.55 - i * 0.1, 1.0, 0.36);
  } // cups of cut fruit
  return P.anchor('vendor', 0, 0, -0.95)
    .anchor('customer', 0, 0, 1.15)
    .anchor('sign', 0, 1.15, 0.46)
    .build('fruitCart');
}
export function hotDogStand(seed = 1) {
  const r = rng(seed),
    P = new PB();
  P.box(1.3, 0.62, 0.7, 0xc9cdd1, 0, 0.62, 0);
  P.box(1.34, 0.03, 0.74, CHROME, 0, 0.945, 0);
  P.box(1.3, 0.34, 0.02, pk(r, [0xb5443e, 0x2a6fb5, 0xe8d78a]), 0, 0.62, 0.36);
  for (const s of [-1, 1]) P.wheel(0.2, 0.07, s * 0.7, 0.2, -0.05, RUBBER, 0xc9cdd1);
  P.cyl(0.07, 0.07, 0.04, RUBBER, 0, 0.07, 0.5, 0, 0, Math.PI / 2);
  P.bar([0, 0.3, 0.3], [0, 0.07, 0.5], 0.015, STEEL);
  for (let i = 0; i < 3; i++) {
    P.box(0.3, 0.03, 0.26, CHROME, -0.42 + i * 0.36, 0.975, -0.14);
    P.sph(0.02, DARK, -0.42 + i * 0.36, 1.0, -0.14);
  } // steam well lids
  P.box(0.5, 0.02, 0.24, 0x2c2e31, 0.3, 0.97, 0.2);
  for (let i = 0; i < 5; i++)
    P.cyl(0.014, 0.014, 0.15, 0xb5553a, 0.12 + i * 0.09, 0.995, 0.2, Math.PI / 2); // griddle with dogs
  for (let i = 0; i < 4; i++)
    (P.cyl(
      0.028,
      0.03,
      0.17,
      [0xe8c020, 0xc0392b, 0x3f8f3a, 0xf0ede6][i],
      -0.5 + i * 0.09,
      1.05,
      0.24,
    ),
      P.cone(
        0.012,
        0.05,
        [0xe8c020, 0xc0392b, 0x3f8f3a, 0xf0ede6][i],
        -0.5 + i * 0.09,
        1.16,
        0.24,
      )); // condiments
  P.box(0.14, 0.12, 0.12, CHROME, -0.12, 1.02, 0.25); // napkins
  umbrellaTop(P, r, -0.2, 2.2, -0.2, 1.2);
  P.box(0.5, 0.3, 0.34, pk(r, [0x2a6fb5, 0xb5443e]), 0.95, 0.15, -0.2);
  P.box(0.52, 0.05, 0.36, 0xf0ede6, 0.95, 0.32, -0.2); // drinks cooler
  P.cyl(0.15, 0.15, 0.4, 0xdedede, -0.95, 0.24, -0.15);
  P.sph(0.15, 0xdedede, -0.95, 0.44, -0.15, 1, 0.5, 1, 10, 4, 0, Math.PI / 2); // propane tank
  P.bar([0.6, 0.95, -0.34], [0.6, 1.7, -0.34], 0.012, STEEL);
  return P.anchor('vendor', 0, 0, -0.85)
    .anchor('customer', 0, 0, 1.1)
    .anchor('sign', 0, 0.62, 0.372)
    .anchor('menu', 0.6, 1.45, -0.33)
    .build('hotDogStand');
}
export function vendorCart(seed = 1, type = 'coconut') {
  const r = rng(seed),
    P = new PB();
  const c =
    type === 'icecream'
      ? pk(r, [0xf0ede6, 0xe6b3b5, 0x9cc1de])
      : type === 'churro'
        ? pk(r, [0xc9a043, 0xb5443e])
        : pk(r, [0x58a55c, 0x2f8a86, 0xe8d78a]);
  P.box(1.0, 0.6, 0.6, c, 0, 0.58, 0);
  P.box(1.04, 0.03, 0.64, type === 'icecream' ? CHROME : pk(r, WOOD), 0, 0.895, 0);
  for (const s of [-1, 1]) P.wheel(0.16, 0.05, s * 0.55, 0.16, -0.1);
  P.cyl(0.06, 0.06, 0.03, RUBBER, 0, 0.06, 0.38, 0, 0, Math.PI / 2);
  P.bar([-0.4, 0.9, -0.3], [-0.5, 1.0, -0.62], 0.014, STEEL);
  P.bar([0.4, 0.9, -0.3], [0.5, 1.0, -0.62], 0.014, STEEL);
  P.bar([-0.5, 1.0, -0.62], [0.5, 1.0, -0.62], 0.016, STEEL);
  if (type === 'coconut') {
    fruitPile(P, r, 0, 0.9, 0, 0.9, 0.5, 'coconut');
    P.box(0.3, 0.02, 0.2, pk(r, WOOD), -0.3, 0.93, 0.18);
    P.box(0.3, 0.004, 0.05, STEEL, -0.3, 0.945, 0.18, 0, 0.5);
    P.cyl(0.035, 0.03, 0.12, 0xf0ede6, 0.4, 0.97, 0.22);
  } else if (type === 'icecream') {
    P.box(0.4, 0.04, 0.4, CHROME, -0.2, 0.92, 0);
    P.box(0.4, 0.04, 0.4, CHROME, 0.26, 0.92, 0);
    P.cyl(0.05, 0.03, 0.03, 0xc9a043, 0.42, 1.2, -0.25);
    P.bar([0.42, 0.9, -0.25], [0.42, 1.2, -0.25], 0.006, STEEL);
    for (let i = 0; i < 4; i++) P.cone(0.03, 0.12, 0xd9b27a, -0.4 + i * 0.07, 0.99, 0.26, Math.PI);
  } else {
    P.box(0.5, 0.34, 0.4, 0xdcecf2, -0.2, 1.08, 0);
    P.box(0.52, 0.02, 0.42, CHROME, -0.2, 1.26, 0);
    for (let i = 0; i < 9; i++)
      P.cyl(
        0.012,
        0.012,
        0.26,
        0xc98a3c,
        -0.38 + (i % 5) * 0.08,
        0.96 + Math.floor(i / 5) * 0.06,
        0,
        0,
        0,
        Math.PI / 2 - 0.1,
        5,
      );
    P.box(0.3, 0.05, 0.3, 0x2c2e31, 0.3, 0.93, 0);
    P.box(0.26, 0.02, 0.2, 0xf0ede6, 0.3, 0.965, 0);
  }
  umbrellaTop(P, r, 0.3, 2.1, -0.25, 1.0);
  return P.anchor('vendor', 0, 0, -0.9)
    .anchor('customer', 0, 0, 1.05)
    .anchor('sign', 0, 0.6, 0.31)
    .build(type + 'Cart');
}
export function foldingChair(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x8e9094, 0x5a6450, 0x2a3442, 0xb5a385, 0x6e4f33]);
  for (const s of [-1, 1]) {
    P.bar([s * 0.2, 0, 0.2], [s * 0.2, 0.86, -0.2], 0.011, STEEL);
    P.bar([s * 0.2, 0, -0.2], [s * 0.2, 0.46, 0.2], 0.011, STEEL);
  }
  P.box(0.42, 0.025, 0.4, c, 0, 0.46, 0.02);
  P.box(0.42, 0.2, 0.02, c, 0, 0.76, -0.18, -0.1);
  return P.anchor('seat', 0, 0.48, 0.02).build('foldingChair');
}
export function plasticChair(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0xf0ede6, 0xf0ede6, 0x58a55c, 0xb5443e, 0x2a6fb5, 0xe9e1cf]);
  for (const [x, z] of [
    [-0.2, 0.2],
    [0.2, 0.2],
    [-0.21, -0.2],
    [0.21, -0.2],
  ])
    P.bar([x * 1.15, 0, z * 1.15], [x, 0.44, z], 0.02, c);
  P.box(0.46, 0.03, 0.44, c, 0, 0.44, 0);
  P.box(0.46, 0.4, 0.03, c, 0, 0.66, -0.22, -0.12);
  for (const s of [-1, 1]) {
    P.box(0.04, 0.03, 0.4, c, s * 0.24, 0.64, 0);
    P.bar([s * 0.24, 0.45, 0.18], [s * 0.24, 0.64, 0.18], 0.015, c);
  }
  return P.anchor('seat', 0, 0.46, 0).build('plasticChair');
}
export function milkCrate(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x2a6fb5, 0xb5443e, 0x1f1f21, 0x58a55c, 0xf08a2c]);
  P.box(0.34, 0.03, 0.34, c, 0, 0.015, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    P.box(0.34, 0.06, 0.02, c, Math.sin(a) * 0.16, 0.27, Math.cos(a) * 0.16, 0, a);
    P.box(0.34, 0.06, 0.02, c, Math.sin(a) * 0.16, 0.12, Math.cos(a) * 0.16, 0, a);
    P.box(0.03, 0.3, 0.03, c, Math.sin(a + 0.785) * 0.226, 0.15, Math.cos(a + 0.785) * 0.226);
  }
  if (r.chance(0.6)) P.box(0.3, 0.05, 0.3, pk(r, [0x8a6a46, 0xb5443e, 0x5a6450]), 0, 0.325, 0);
  return P.anchor('seat', 0, 0.35, 0).build('milkCrate');
}
export function dominoTable(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const wood = pk(r, WOOD),
    felt = pk(r, [0x2f6a4a, 0x7a2f2f, 0x2a4a6a, wood]);
  P.box(0.92, 0.04, 0.92, wood, 0, 0.74, 0);
  P.box(0.8, 0.006, 0.8, felt, 0, 0.763, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2,
      sx = Math.sin(a),
      cz = Math.cos(a);
    P.box(0.92, 0.035, 0.05, mixHex(wood, 0, 0.2), sx * 0.435, 0.78, cz * 0.435, 0, a);
    P.box(0.3, 0.012, 0.03, mixHex(wood, 0, 0.3), sx * 0.36, 0.772, cz * 0.36, 0, a);
    const n = r.int(3, 7);
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 0.03;
      P.box(0.024, 0.048, 0.009, 0xf4f0e6, sx * 0.355 + cz * off, 0.8, cz * 0.355 - sx * off, 0, a);
    }
    P.box(0.05, 0.72, 0.05, wood, Math.sin(a + 0.785) * 0.56, 0.36, Math.cos(a + 0.785) * 0.56);
  }
  // the line of play: tiles end to end with turns, doubles laid crosswise
  let x = -0.22,
    z = -0.05,
    dir = 0;
  for (let k = 0; k < r.int(9, 15); k++) {
    const dbl = r.chance(0.2);
    const L = 0.05,
      ry = dir + (dbl ? Math.PI / 2 : 0);
    P.box(L, 0.009, 0.025, 0xf4f0e6, x, 0.771, z, 0, ry);
    P.box(0.003, 0.0095, 0.025, DARK, x, 0.771, z, 0, ry);
    for (let d = 0; d < 2; d++)
      P.sph(
        0.004,
        DARK,
        x + Math.cos(ry) * (d ? 0.012 : -0.012),
        0.776,
        z - Math.sin(ry) * (d ? 0.012 : -0.012),
        1,
        0.3,
        1,
        4,
        3,
      );
    const st = dbl ? 0.04 : 0.052;
    x += Math.cos(dir) * st;
    z -= Math.sin(dir) * st;
    if (Math.abs(x) > 0.24 || Math.abs(z) > 0.2) {
      dir += Math.PI / 2;
      x += Math.cos(dir) * 0.04;
      z -= Math.sin(dir) * 0.04;
    }
  }
  P.cyl(0.022, 0.018, 0.04, 0xf0ede6, 0.3, 0.79, 0.3);
  P.cyl(0.022, 0.018, 0.04, 0xf0ede6, -0.32, 0.79, -0.28);
  P.box(0.09, 0.004, 0.13, 0xf5f0d8, 0.28, 0.768, -0.3, 0, 0.3);
  const m = P.build('dominoTable');
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    m.userData.anchors['seat' + i] = new THREE.Vector3(Math.sin(a) * 0.86, 0, Math.cos(a) * 0.86);
  }
  return m;
}
export function cone(seed = 1) {
  const P = new PB();
  P.box(0.36, 0.03, 0.36, 0xe8641e, 0, 0.015, 0);
  P.cyl(0.035, 0.14, 0.68, 0xe8641e, 0, 0.37, 0, 0, 0, 0, 12);
  P.cyl(0.085, 0.105, 0.1, 0xf0f0f0, 0, 0.42, 0, 0, 0, 0, 12);
  return P.build('cone');
}
export function barricade(seed = 1) {
  const P = new PB();
  for (const s of [-1, 1]) {
    P.bar([s * 0.55, 0, 0.25], [s * 0.55, 1.0, 0], 0.02, 0xe8e8e8);
    P.bar([s * 0.55, 0, -0.25], [s * 0.55, 1.0, 0], 0.02, 0xe8e8e8);
  }
  for (let i = 0; i < 8; i++)
    P.box(0.15, 0.2, 0.025, i % 2 ? 0xe8641e : 0xf4f4f4, -0.53 + i * 0.15, 0.82, 0.02);
  for (let i = 0; i < 8; i++)
    P.box(0.15, 0.12, 0.025, i % 2 ? 0xf4f4f4 : 0xe8641e, -0.53 + i * 0.15, 0.45, 0.13, 0.2);
  P.cyl(0.05, 0.05, 0.06, 0xf0a020, 0.4, 1.06, 0, Math.PI / 2);
  return P.build('barricade');
}
export function wheelbarrow(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x3f6a3a, 0xb5443e, 0x2c2e31, 0x2a6fb5]);
  P.box(0.6, 0.26, 0.8, c, 0, 0.5, 0.1, 0.12);
  P.box(0.52, 0.06, 0.7, 0x8f8a80, 0, 0.63, 0.1, 0.12);
  P.wheel(0.18, 0.08, 0, 0.18, 0.62);
  for (const s of [-1, 1]) {
    P.bar([s * 0.28, 0.42, 0.5], [s * 0.3, 0.6, -0.95], 0.016, 0x6e4f33);
    P.bar([s * 0.26, 0.4, -0.25], [s * 0.26, 0, -0.3], 0.014, STEEL);
    P.bar([s * 0.05, 0.18, 0.62], [s * 0.26, 0.42, 0.3], 0.012, STEEL);
  }
  return P.anchor('handL', 0.3, 0.6, -0.95).anchor('handR', -0.3, 0.6, -0.95).build('wheelbarrow');
}
export function shovel(seed = 1) {
  const P = new PB();
  P.cyl(0.016, 0.016, 1.1, 0x8a6a46, 0, -0.35, 0);
  P.box(0.2, 0.26, 0.015, STEEL, 0, -1.0, 0.01, 0.1);
  P.tor(0.05, 0.012, 0x8a6a46, 0, 0.22, 0, 0, 0, 0, Math.PI * 2, 8);
  return P.build('shovel');
} // origin: upper grip
export function broom(seed = 1) {
  const r = rng(seed),
    P = new PB();
  P.cyl(0.013, 0.013, 1.3, pk(r, [0x8a6a46, 0x2a6fb5, 0xb5443e]), 0, -0.45, 0);
  P.box(0.34, 0.05, 0.06, 0x6e4f33, 0, -1.11, 0);
  P.box(0.34, 0.16, 0.05, pk(r, [0xc9a043, 0x1f1f21, 0xb5443e]), 0, -1.2, 0, 0.12);
  return P.build('broom');
}
export function hoseNozzle() {
  const P = new PB();
  P.cyl(0.016, 0.016, 0.12, 0x2f7a3a, 0, 0, 0.02, Math.PI / 2);
  P.cyl(0.02, 0.012, 0.1, 0xc9a043, 0, 0, 0.13, Math.PI / 2);
  P.box(0.02, 0.09, 0.03, 0x2c2e31, 0, -0.05, 0.02);
  return P.build('hoseNozzle');
}
export function bucket(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x2a6fb5, 0xb5443e, 0xf0ede6, 0xe8641e, 0x58a55c]);
  P.cyl(0.15, 0.115, 0.27, c, 0, 0.135, 0, 0, 0, 0, 12);
  P.cyl(0.14, 0.14, 0.01, 0xdff2fa, 0, 0.25, 0, 0, 0, 0, 12);
  P.tor(0.15, 0.006, STEEL, 0, 0.27, 0, 0, 0, 0, Math.PI, 10);
  P.box(0.1, 0.05, 0.07, 0xe8d04a, 0.05, 0.28, 0.02, 0, 0.5);
  return P.build('bucket');
}
export function toolbox(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0xb5443e, 0x2a6fb5, 0x2c2e31, 0xc9a043]);
  P.box(0.5, 0.2, 0.22, c, 0, 0.1, 0);
  P.box(0.5, 0.05, 0.22, mixHex(c, 0, 0.3), 0, 0.225, 0);
  P.bar([-0.12, 0.3, 0], [0.12, 0.3, 0], 0.012, DARK);
  P.bar([-0.12, 0.25, 0], [-0.12, 0.3, 0], 0.008, DARK);
  P.bar([0.12, 0.25, 0], [0.12, 0.3, 0], 0.008, DARK);
  return P.build('toolbox');
}
export function trashBin(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x2f5a3a, 0x2a4a6a, 0x3a3a3c]);
  P.box(0.56, 0.9, 0.62, c, 0, 0.55, 0);
  P.box(0.6, 0.06, 0.68, mixHex(c, 0, 0.25), 0, 1.03, 0.0);
  for (const s of [-1, 1]) P.wheel(0.1, 0.04, s * 0.26, 0.1, -0.3);
  P.bar([-0.24, 1.0, -0.36], [0.24, 1.0, -0.36], 0.015, mixHex(c, 0, 0.3));
  return P.anchor('handL', 0.2, 1.0, -0.36).anchor('handR', -0.2, 1.0, -0.36).build('trashBin');
}
export function trashBag(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x1c1c1e, 0x1c1c1e, 0xf0ede6]);
  P.sph(0.22, c, 0, 0.19, 0, 1, 0.85, 1, 8, 6);
  P.cone(0.06, 0.14, c, 0, 0.42, 0, 0, 0, 0, 6);
  return P.build('trashBag');
}
export function leafBlower() {
  const P = new PB();
  P.box(0.14, 0.2, 0.3, 0xe8641e, 0, -0.08, 0);
  P.cyl(0.04, 0.03, 0.7, 0x2c2e31, 0, -0.16, 0.5, Math.PI / 2 - 0.25);
  return P.build('leafBlower');
}
export function fishingRod(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const L = r.range(2.1, 2.9);
  P.cyl(0.014, 0.014, 0.4, 0x2c2e31, 0, 0, 0.05, Math.PI / 2);
  P.bar([0, 0, 0.25], [0, 0.55, L], 0.006, pk(r, [0x1f1f21, 0x2a6fb5, 0xb5443e]), 5);
  P.cyl(0.04, 0.04, 0.05, CHROME, 0, -0.06, 0.18, 0, 0, Math.PI / 2);
  for (let i = 1; i < 5; i++)
    P.tor(
      0.012,
      0.002,
      CHROME,
      0,
      (0.55 * i) / 4.6 - 0.02,
      0.25 + ((L - 0.25) * i) / 4.6,
      0,
      0,
      0,
      Math.PI * 2,
      6,
    );
  P.bar([0, 0.55, L], [0, -0.9, L + 0.6], 0.0016, 0xeaf6ff, 3);
  return P.anchor('tip', 0, 0.55, L).build('fishingRod');
} // origin: grip; rod extends forward and up
export function tackleBucket(seed = 1) {
  const r = rng(seed),
    P = new PB();
  P.cyl(0.15, 0.13, 0.36, pk(r, [0xf0ede6, 0xe8641e, 0x2a6fb5]), 0, 0.18, 0, 0, 0, 0, 12);
  P.tor(0.15, 0.006, STEEL, 0, 0.36, 0, 0, 0, 0, Math.PI, 10);
  P.box(0.36, 0.16, 0.2, pk(r, [0x5a6450, 0x2c2e31, 0xb5a385]), 0.4, 0.08, 0.05, 0, 0.3);
  P.box(0.36, 0.02, 0.2, 0x8e9094, 0.4, 0.17, 0.05, 0, 0.3);
  return P.build('tackleBucket');
}
export function ringLight(seed = 1) {
  const P = new PB();
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094;
    P.bar([0, 0.55, 0], [Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42], 0.01, DARK);
  }
  P.cyl(0.013, 0.013, 1.15, DARK, 0, 1.0, 0);
  P.tor(0.23, 0.028, 0xfff6e0, 0, 1.6, 0, 0, 0, 0, Math.PI * 2, 24);
  P.tor(0.23, 0.031, 0x2c2e31, 0, 1.6, -0.012, 0, 0, 0, Math.PI * 2, 24);
  P.box(0.075, 0.15, 0.01, 0x111114, 0, 1.6, 0.01);
  P.box(0.065, 0.135, 0.004, 0x9fd3ff, 0, 1.6, 0.017);
  const m = P.anchor('subject', 0, 0, 1.3).build('ringLight');
  return m;
}
export function guitarCase(seed = 1) {
  const r = rng(seed),
    P = new PB();
  P.box(0.4, 0.07, 1.1, 0x1f1f21, 0, 0.035, 0);
  P.box(0.36, 0.01, 1.04, pk(r, [0x7a2f3f, 0x2a3a6a, 0x5a3a7a]), 0, 0.075, 0);
  P.box(0.4, 0.05, 1.1, 0x1f1f21, -0.42, 0.3, 0, 0, 0, 1.15);
  for (let i = 0; i < 10; i++)
    P.cyl(
      0.012,
      0.012,
      0.003,
      pk(r, [0xc9a043, 0xb9bcc0]),
      (r() - 0.5) * 0.28,
      0.082,
      (r() - 0.5) * 0.8,
    );
  for (let i = 0; i < 3; i++)
    P.box(0.066, 0.002, 0.156, 0x6f8f6a, (r() - 0.5) * 0.2, 0.083, (r() - 0.5) * 0.6, 0, r() * 3);
  return P.build('guitarCase');
}
export function guitar(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0xc98a3c, 0x8a5a2e, 0x2c2e31, 0xd9b27a]);
  P.cyl(0.19, 0.19, 0.1, c, 0, 0, 0, Math.PI / 2, 0, 0, 14);
  P.cyl(0.14, 0.14, 0.1, c, 0.22, 0.02, 0, Math.PI / 2, 0, 0, 12);
  P.cyl(0.045, 0.045, 0.102, DARK, 0.1, 0.01, 0, Math.PI / 2);
  P.box(0.52, 0.045, 0.025, 0x4c3626, 0.6, 0.03, 0.04);
  P.box(0.14, 0.06, 0.02, 0x4c3626, 0.92, 0.035, 0.035);
  return P.build('guitar');
} // origin: body center, neck toward +X
export function speaker(seed = 1) {
  const P = new PB();
  P.box(0.3, 0.5, 0.28, 0x1f1f21, 0, 0.25, 0);
  P.cyl(0.11, 0.11, 0.02, 0x3a3a3c, 0, 0.2, 0.145, Math.PI / 2, 0, 0, 14);
  P.cyl(0.05, 0.05, 0.02, 0x3a3a3c, 0, 0.4, 0.145, Math.PI / 2);
  P.bar([-0.1, 0.52, 0], [0.1, 0.52, 0], 0.012, 0x3a3a3c);
  return P.build('speaker');
}
export function bucketDrums(seed = 1) {
  const P = new PB();
  for (const [x, z, c, h] of [
    [-0.3, 0, 0xf0ede6, 0.36],
    [0.05, 0.12, 0xe8641e, 0.38],
    [0.36, -0.02, 0x2a6fb5, 0.3],
  ])
    P.cyl(0.13, 0.15, h, c, x, h / 2, z, Math.PI, 0, 0, 12);
  P.cyl(0.16, 0.16, 0.015, STEEL, 0.1, 0.02, -0.3, 0, 0, 0, 12);
  return P.build('bucketDrums');
}
export function tipHat(seed = 1) {
  const r = rng(seed),
    P = new PB();
  P.cyl(0.1, 0.085, 0.09, 0x3a2a1e, 0, 0.045, 0, Math.PI, 0, 0, 12, true);
  P.cyl(0.18, 0.18, 0.008, 0x3a2a1e, 0, 0.004, 0, 0, 0, 0, 14);
  for (let i = 0; i < 6; i++)
    P.cyl(0.012, 0.012, 0.003, 0xc9a043, (r() - 0.5) * 0.1, 0.012, (r() - 0.5) * 0.1);
  P.ds = true;
  return P.build('tipHat');
}
export function gurney(seed = 1) {
  const P = new PB();
  P.box(0.56, 0.08, 1.9, 0x2a2c2e, 0, 0.86, 0);
  P.box(0.52, 0.09, 1.3, 0xd9432b, 0, 0.93, -0.25);
  P.box(0.52, 0.09, 0.62, 0xd9432b, 0, 1.06, 0.6, -0.4);
  P.box(0.4, 0.07, 0.3, 0xf0ede6, 0, 1.2, 0.72, -0.4);
  for (const s of [-1, 1]) {
    P.bar([s * 0.26, 0.82, -0.8], [s * 0.26, 0.12, 0.6], 0.016, CHROME);
    P.bar([s * 0.26, 0.82, 0.7], [s * 0.26, 0.12, -0.6], 0.016, CHROME);
    for (const z of [-0.62, 0.62]) P.wheel(0.07, 0.035, s * 0.26, 0.07, z);
    P.bar([s * 0.3, 1.02, -0.7], [s * 0.3, 1.02, 0.2], 0.012, CHROME);
  }
  for (const z of [-0.5, 0.0]) P.box(0.54, 0.012, 0.05, 0x2c2e31, 0, 0.98, z);
  return P.anchor('lie', 0, 0.98, -0.1)
    .anchor('pushL', 0.24, 0.95, -0.98)
    .anchor('pushR', -0.24, 0.95, -0.98)
    .build('gurney');
}
export function medicBag(seed = 1) {
  const P = new PB();
  P.box(0.5, 0.3, 0.26, 0xd9432b, 0, 0.15, 0);
  P.box(0.5, 0.03, 0.262, 0xdfe8e0, 0, 0.22, 0);
  P.box(0.1, 0.1, 0.006, 0xf0ede6, 0, 0.12, 0.134);
  P.box(0.03, 0.08, 0.008, 0x2a6fb5, 0, 0.12, 0.136);
  P.box(0.08, 0.03, 0.008, 0x2a6fb5, 0, 0.12, 0.136);
  P.tor(0.09, 0.012, DARK, 0, 0.31, 0, 0, 0, 0, Math.PI, 8);
  return P.build('medicBag');
}
export function bat(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0xc2a57a, 0x8a6a46, 0x8e9094, 0x1f1f21]);
  P.cyl(0.032, 0.016, 0.62, c, 0, 0.42, 0, 0, 0, 0, 8);
  P.cyl(0.016, 0.014, 0.28, mixHex(c, 0, 0.3), 0, -0.02, 0);
  P.cyl(0.024, 0.024, 0.02, c, 0, -0.17, 0);
  return P.build('bat');
} // origin: grip, barrel up
export function coffeeWindowTray(seed = 1) {
  const P = new PB();
  P.box(0.3, 0.01, 0.2, 0x8a6a46, 0, 0, 0);
  P.cyl(0.035, 0.028, 0.085, 0xf0ede6, -0.07, 0.045, 0);
  for (let i = 0; i < 4; i++)
    P.cyl(
      0.018,
      0.014,
      0.03,
      0xf0ede6,
      0.03 + (i % 2) * 0.05,
      0.02,
      -0.03 + Math.floor(i / 2) * 0.06,
    );
  return P.build('cafecitoTray');
}

// ================================================================ bags (origin at the attach point)
export function tote(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0xe9e1cf, 0xd6c4a0, 0x2a3442, 0x1f1f21, ...BR]);
  P.box(0.34, 0.36, 0.1, c, 0, -0.42, 0);
  P.box(0.2, 0.14, 0.004, pk(r, BR), 0, -0.4, 0.053);
  P.tor(0.11, 0.008, mixHex(c, 0, 0.25), 0, -0.24, 0.03, 0, 0, 0, Math.PI, 8);
  P.tor(0.11, 0.008, mixHex(c, 0, 0.25), 0, -0.24, -0.03, 0, 0, 0, Math.PI, 8);
  return P.build('tote');
} // hangs from the hand or shoulder
export function shoppingBags(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const n = r.int(1, 3);
  for (let i = 0; i < n; i++) {
    const c = pk(r, [0xf0ede6, 0x1f1f21, 0xe6b3b5, 0xc9a043, 0x2f8a86, 0xb5443e, CARD]),
      h = r.range(0.24, 0.36),
      w = r.range(0.2, 0.3),
      z = (i - (n - 1) / 2) * 0.09;
    P.box(w, h, 0.08, c, 0, -0.16 - h / 2, z, 0, r.range(-0.2, 0.2));
    P.tor(0.06, 0.004, 0x2c2e31, 0, -0.14, z, 0, 0, 0, Math.PI, 6);
    P.box(
      w * 0.5,
      h * 0.25,
      0.082,
      mixHex(c, r.chance(0.5) ? 0x000000 : 0xffffff, 0.5),
      0,
      -0.16 - h / 2,
      z,
    );
  }
  return P.build('shoppingBags');
}
export function briefcase(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x2a1a10, 0x1f1f21, 0x5a3a22, 0x8e9094]);
  P.box(0.42, 0.3, 0.09, c, 0, -0.22, 0);
  P.tor(0.05, 0.008, DARK, 0, -0.07, 0, 0, 0, 0, Math.PI, 6);
  P.box(0.03, 0.02, 0.095, 0xc9a043, 0.1, -0.1, 0);
  P.box(0.03, 0.02, 0.095, 0xc9a043, -0.1, -0.1, 0);
  return P.build('briefcase');
}
export function purse(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x5a2e22, 0x1f1f21, 0xc9a043, 0xe6b3b5, 0xf0ede6, 0xb5443e, 0x2f8a86, 0x8a6a46]);
  P.box(0.26, 0.17, 0.09, c, 0, -0.3, 0);
  P.box(0.26, 0.08, 0.095, mixHex(c, 0, 0.2), 0, -0.25, 0);
  P.tor(0.12, 0.006, pk(r, [0xc9a043, DARK]), 0, -0.2, 0, 0, 0, 0, Math.PI, 8);
  P.sph(0.012, 0xc9a043, 0, -0.29, 0.05);
  return P.build('purse');
}
export function backpack(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, BR.concat([0x1f1f21, 0x2a3442, 0x5a6450, 0x8e9094]));
  P.box(0.3, 0.42, 0.16, c, 0, -0.02, -0.1);
  P.sph(0.15, c, 0, 0.19, -0.1, 1, 0.5, 0.55, 8, 4, 0, Math.PI / 2);
  P.box(0.22, 0.16, 0.05, mixHex(c, 0, 0.25), 0, -0.1, -0.2);
  for (const s of [-1, 1]) P.box(0.05, 0.42, 0.02, mixHex(c, 0, 0.35), s * 0.1, 0.0, 0.0);
  if (r.chance(0.4)) P.cyl(0.035, 0.035, 0.2, pk(r, [STEEL, 0x2a6fb5, 0xe6b3b5]), 0.17, -0.1, -0.1);
  return P.build('backpack');
} // origin: between the shoulder blades
export function duffel(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x1f1f21, 0x2a3442, 0xb5443e, 0x8e9094, 0x2f8a86]);
  P.cyl(0.13, 0.13, 0.5, c, 0, -0.3, 0, 0, 0, Math.PI / 2, 10);
  P.tor(0.1, 0.008, DARK, 0, -0.17, 0, 0, Math.PI / 2, 0, Math.PI, 8);
  P.box(0.3, 0.004, 0.03, 0xf0ede6, 0, -0.17, 0);
  return P.build('duffel');
}
export function yogaMat(seed = 1) {
  const r = rng(seed),
    P = new PB();
  P.cyl(0.06, 0.06, 0.62, pk(r, BR), 0, -0.25, 0, 0, 0, Math.PI / 2, 10);
  P.tor(0.062, 0.006, DARK, -0.2, -0.25, 0, 0, Math.PI / 2, 0);
  P.tor(0.062, 0.006, DARK, 0.2, -0.25, 0, 0, Math.PI / 2, 0);
  return P.build('yogaMat');
}

// ================================================================ worn (origin: top of the skull for hats, nose bridge for eyewear)
export function hat(seed = 1, kind = 'cap') {
  const r = rng(seed),
    P = new PB();
  const c = pk(
    r,
    [
      0x1f1f21, 0xf0ede6, 0x2a3442, 0xb5443e, 0x2f8a86, 0xb5a385, 0xe07f68, 0xc9a043, 0x58a55c,
      0x5d7598, 0xd95f9a,
    ],
  );
  const LC = (kind === 'cap' || kind === 'capBack') && libGet('cap');
  if (LC) {
    // library cap: crown on the skull (top 7 mm over it), brim to +Z (or back), one color per person
    const s = kind === 'capBack' ? -1 : 1;
    P.add(
      LC.parts[0].geometry,
      c,
      0,
      0.007 - 0.153 * 0.85,
      s * 0.035,
      0,
      s > 0 ? 0 : Math.PI,
      0,
      1.02,
      0.85,
      1.02,
    );
  } else if (kind === 'cap' || kind === 'capBack') {
    P.sph(0.1, c, 0, -0.085, -0.004, 1, 0.92, 1.1, 12, 5, 0, Math.PI / 2);
    const s = kind === 'capBack' ? -1 : 1;
    P.cyl(
      0.085,
      0.085,
      0.01,
      r.chance(0.3) ? pk(r, [0x1f1f21, 0xf0ede6]) : c,
      0,
      -0.078,
      s * 0.105,
      s * 0.1,
      0,
      0,
      12,
    );
    P.sph(0.012, c, 0, 0.008, -0.004);
    P.box(0.05, 0.035, 0.004, pk(r, [0xf0ede6, 0xc9a043, 0x1f1f21, 0xb5443e]), 0, -0.04, 0.1, -0.2);
  } else if (kind === 'straw') {
    const s = pk(r, [0xd9c08a, 0xcdb27a, 0xe3d2a6]);
    P.cyl(0.092, 0.104, 0.1, s, 0, -0.045, -0.004, 0, 0, 0, 14);
    P.cyl(0.22, 0.23, 0.008, s, 0, -0.096, -0.004, 0, 0, 0, 18);
    P.cyl(
      0.106,
      0.106,
      0.022,
      pk(r, [0x1f1f21, 0x2a3442, 0x8a3b2e, 0xe07f68]),
      0,
      -0.082,
      -0.004,
      0,
      0,
      0,
      14,
    );
  } else if (kind === 'bucket') {
    P.cyl(0.092, 0.11, 0.09, c, 0, -0.05, -0.004, 0, 0, 0, 14);
    P.cyl(0.14, 0.17, 0.05, c, 0, -0.108, -0.004, 0, 0, 0, 14, true);
    P.ds = true;
  } else if (kind === 'fedora') {
    const s = pk(r, [0xd9c08a, 0xe9e1cf, 0x3a3a3c, 0x8a6a46]);
    P.cyl(0.085, 0.1, 0.1, s, 0, -0.04, -0.004, 0, 0, 0, 14);
    P.cyl(0.15, 0.155, 0.008, s, 0, -0.092, -0.004, 0.05, 0, 0, 16);
    P.cyl(
      0.101,
      0.101,
      0.024,
      pk(r, [0x1f1f21, 0x2a3442, 0x7a2f2f]),
      0,
      -0.078,
      -0.004,
      0,
      0,
      0,
      14,
    );
  } else if (kind === 'visor') {
    P.cyl(0.098, 0.1, 0.035, c, 0, -0.085, -0.004, 0, 0, 0, 14, true);
    P.cyl(0.09, 0.09, 0.008, c, 0, -0.092, 0.1, 0.15, 0, 0, 12);
    P.ds = true;
  } else if (kind === 'beanie') {
    P.sph(0.102, c, 0, -0.07, -0.006, 1, 1.05, 1.08, 12, 6, 0, Math.PI * 0.55);
    P.cyl(0.103, 0.103, 0.03, mixHex(c, 0, 0.2), 0, -0.1, -0.006, 0, 0, 0, 14);
  } else if (kind === 'hardhat') {
    const h = pk(r, [0xf0d020, 0xf0ede6, 0xe8641e, 0x2a6fb5]);
    P.sph(0.108, h, 0, -0.07, -0.004, 1, 0.95, 1.12, 12, 5, 0, Math.PI / 2);
    P.cyl(0.118, 0.122, 0.012, h, 0, -0.072, 0.02, 0.06, 0, 0, 14);
    P.box(0.02, 0.05, 0.2, h, 0, -0.012, -0.004);
  } else if (kind === 'headwrap') {
    P.sph(0.104, c, 0, -0.06, -0.012, 1, 1.0, 1.1, 12, 6, 0, Math.PI * 0.6);
    P.sph(0.05, c, 0, 0.0, 0.03, 1.2, 0.8, 1);
  }
  return P.build('hat-' + kind);
}
export function sunglasses(seed = 1, clear = false) {
  const r = rng(seed),
    P = new PB();
  const fr = pk(r, [0x111111, 0x3a2a1e, 0xb08a3c, 0xf0ede6, 0xb5443e]),
    ln = clear ? 0xcfe3ea : pk(r, [0x0c0c0e, 0x1a1208, 0x0b1a22, 0x2a4a5a, 0x5a3a1a]),
    round = r.chance(0.3);
  for (const s of [-1, 1]) {
    if (round) P.cyl(0.023, 0.023, 0.005, ln, s * 0.032, 0, 0.012, Math.PI / 2, 0, 0, 10);
    else P.box(0.046, 0.03, 0.005, ln, s * 0.032, 0, 0.012);
    P.box(0.05, 0.005, 0.007, fr, s * 0.032, 0.016, 0.012);
    P.box(0.004, 0.005, 0.1, fr, s * 0.07, 0.008, -0.04);
  }
  P.box(0.018, 0.005, 0.006, fr, 0, 0.008, 0.012);
  return P.build(clear ? 'glasses' : 'sunglasses');
}
export function headphones(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x1f1f21, 0xf0ede6, 0x7a7a7a, 0xb5443e, 0x2a6fb5]);
  P.tor(0.105, 0.01, c, 0, -0.1, -0.005, 0, 0, 0, Math.PI, 12);
  for (const s of [-1, 1])
    P.cyl(0.038, 0.038, 0.03, c, s * 0.1, -0.115, -0.005, 0, 0, Math.PI / 2, 10);
  return P.build('headphones');
}
export function lanyard(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x2a6fb5, 0xb5443e, 0x1f1f21, 0x58a55c]);
  P.bar([-0.06, 0, 0.02], [0, -0.28, 0.1], 0.004, c, 4);
  P.bar([0.06, 0, 0.02], [0, -0.28, 0.1], 0.004, c, 4);
  P.box(0.06, 0.09, 0.004, 0xf0ede6, 0, -0.33, 0.1);
  P.box(0.03, 0.03, 0.005, 0x9a6a48, 0, -0.315, 0.101);
  return P.build('lanyard');
} // origin: base of the neck
export function stethoscope() {
  const P = new PB();
  P.tor(0.07, 0.006, 0x2c2e31, 0, -0.03, 0.03, Math.PI / 2 - 0.4, 0, 0, Math.PI * 2, 12);
  P.bar([0.05, -0.05, 0.07], [0.04, -0.3, 0.11], 0.005, 0x2c2e31, 4);
  P.cyl(0.02, 0.02, 0.01, CHROME, 0.04, -0.31, 0.115, Math.PI / 2);
  return P.build('stethoscope');
}
export function camera(seed = 1) {
  const P = new PB();
  P.box(0.13, 0.085, 0.06, 0x1f1f21, 0, 0, 0);
  P.cyl(0.036, 0.036, 0.08, 0x1f1f21, 0, 0, 0.06, Math.PI / 2, 0, 0, 10);
  P.cyl(0.03, 0.03, 0.005, 0x3a5a7a, 0, 0, 0.102, Math.PI / 2);
  P.box(0.04, 0.02, 0.03, 0x1f1f21, 0, 0.05, 0);
  return P.build('camera');
}
export function chain(seed = 1) {
  const r = rng(seed),
    P = new PB();
  P.tor(
    0.075,
    r.chance(0.4) ? 0.006 : 0.003,
    pk(r, [0xd4af37, 0xd4af37, 0xc0c0c0]),
    0,
    -0.04,
    0.035,
    Math.PI / 2 - 0.55,
    0,
    0,
    Math.PI * 2,
    14,
  );
  if (r.chance(0.5)) P.sph(0.012, 0xd4af37, 0, -0.1, 0.095);
  return P.build('chain');
}
export function apron(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x1f1f21, 0xf0ede6, 0x2f6a4a, 0x7a2f2f, 0x2a3442, 0xc9a043]);
  P.box(0.3, 0.34, 0.012, c, 0, -0.08, 0.125);
  P.box(0.36, 0.42, 0.012, c, 0, -0.44, 0.13);
  P.box(0.2, 0.12, 0.014, mixHex(c, 0, 0.2), 0, -0.4, 0.136);
  return P.build('apron');
} // origin: sternum
export function toolBelt(seed = 1) {
  const P = new PB();
  P.cyl(0.17, 0.17, 0.05, 0x6e4f33, 0, 0, 0, 0, 0, 0, 14, true);
  P.box(0.1, 0.14, 0.05, 0x8a6a46, 0.17, -0.07, 0.03);
  P.box(0.09, 0.12, 0.05, 0x8a6a46, -0.16, -0.06, 0.05);
  P.cyl(0.012, 0.012, 0.2, 0x8a6a46, 0.2, -0.08, -0.03);
  P.box(0.03, 0.06, 0.025, STEEL, 0.2, -0.2, -0.03);
  P.ds = true;
  return P.build('toolBelt');
}
export function babyCarrier(seed = 1) {
  const r = rng(seed),
    P = new PB();
  const c = pk(r, [0x2a3442, 0x8e9094, 0x1f1f21, 0x5a6450, 0xe6b3b5]);
  const skin = pk(r, [0xf1d3bd, 0xd2a27c, 0x9a6a48, 0x6b452e]);
  P.box(0.26, 0.3, 0.12, c, 0, -0.1, 0.16);
  P.sph(0.07, skin, 0, 0.1, 0.16);
  P.sph(
    0.074,
    pk(r, [0xf0ede6, 0xe8d78a, 0x9cc1de]),
    0,
    0.12,
    0.155,
    1,
    0.7,
    1,
    8,
    4,
    0,
    Math.PI / 2,
  );
  for (const s of [-1, 1]) {
    P.cyl(0.028, 0.024, 0.14, skin, s * 0.1, -0.28, 0.18, 0.3);
    P.box(0.04, 0.34, 0.015, c, s * 0.1, 0.06, 0.06, -0.5);
  }
  return P.build('babyCarrier');
} // origin: sternum

// ================================================================ held (origin at the grip)
export function cup(seed = 1, kind = 'coffee') {
  const r = rng(seed),
    P = new PB();
  if (kind === 'coffee') {
    P.cyl(0.04, 0.03, 0.11, 0xf0ede6, 0, 0.02, 0, 0, 0, 0, 10);
    P.cyl(0.042, 0.042, 0.012, pk(r, [0x1f1f21, 0xf0ede6, 0x6e4f33]), 0, 0.08, 0, 0, 0, 0, 10);
    P.cyl(
      0.039,
      0.034,
      0.05,
      pk(r, [0x8a6a46, 0x2f6a4a, 0xb5443e, 0xc9a043]),
      0,
      0.02,
      0,
      0,
      0,
      0,
      10,
    );
  } else if (kind === 'iced') {
    P.cyl(0.042, 0.032, 0.14, 0xd8c3a0, 0, 0.03, 0, 0, 0, 0, 10);
    P.cyl(0.044, 0.044, 0.01, 0xf0ede6, 0, 0.105, 0, 0, 0, 0, 10);
    P.cyl(0.004, 0.004, 0.2, pk(r, [0x2f8a86, 0xb5443e, 0x1f1f21]), 0.01, 0.1, 0, 0.1);
  } else if (kind === 'bottle') {
    P.cyl(0.03, 0.03, 0.14, pk(r, [0x6a4a1e, 0x2f5a2a, 0x6a4a1e]), 0, 0.0, 0, 0, 0, 0, 8);
    P.cyl(0.012, 0.028, 0.08, 0x6a4a1e, 0, 0.11, 0, 0, 0, 0, 8);
    P.cyl(
      0.031,
      0.031,
      0.06,
      pk(r, [0xf0ede6, 0xc9a043, 0xb5443e, 0x2a6fb5]),
      0,
      0.0,
      0,
      0,
      0,
      0,
      8,
    );
  } else if (kind === 'can') {
    P.cyl(0.032, 0.032, 0.12, pk(r, BR), 0, 0.0, 0, 0, 0, 0, 10);
    P.cyl(0.03, 0.03, 0.004, CHROME, 0, 0.062, 0);
  } else if (kind === 'party') {
    P.cyl(0.045, 0.03, 0.12, pk(r, [0xb5443e, 0x2a6fb5]), 0, 0.02, 0, 0, 0, 0, 10);
  } else if (kind === 'coconut') {
    P.sph(0.085, 0x5b7a3a, 0, 0, 0, 1, 1.1, 1, 8, 6);
    P.cyl(0.03, 0.03, 0.006, 0xf0ede6, 0, 0.09, 0);
    P.cyl(0.004, 0.004, 0.14, pk(r, [0xb5443e, 0xe8d78a]), 0.01, 0.14, 0, 0.2);
  } else if (kind === 'icecream') {
    P.cone(0.032, 0.11, 0xd9b27a, 0, -0.02, 0, Math.PI, 0, 0, 8);
    P.sph(0.04, pk(r, [0xf4e6c8, 0xe6b3b5, 0x6e4f33, 0xa6d3bf]), 0, 0.055, 0);
    if (r.chance(0.5)) P.sph(0.036, pk(r, [0xf4e6c8, 0xe6b3b5, 0x6e4f33, 0xe8d78a]), 0, 0.105, 0);
  } else if (kind === 'water') {
    P.cyl(0.03, 0.03, 0.17, 0xcfe6f2, 0, 0.02, 0, 0, 0, 0, 8);
    P.cyl(0.014, 0.014, 0.02, pk(r, [0x2a6fb5, 0xf0ede6]), 0, 0.115, 0);
  } else if (kind === 'hotdog') {
    P.box(0.16, 0.02, 0.06, 0xf0ede6, 0, 0, 0);
    P.cyl(0.024, 0.024, 0.15, 0xd9b27a, 0, 0.025, 0, 0, 0, Math.PI / 2, 8);
    P.cyl(0.015, 0.015, 0.17, 0xb5553a, 0, 0.04, 0, 0, 0, Math.PI / 2, 6);
    P.box(0.14, 0.004, 0.008, 0xe8c020, 0, 0.056, 0);
  }
  return P.build('cup-' + kind);
}
export function paperMap(seed = 1) {
  const r = rng(seed),
    P = new PB();
  P.cloth(0.42, 0.3, [0xe9f0e4, 0xcfe3ea, 0xe9e1cf, 0xcfe6c8], 0, 0, 0, 0, 6, -0.02, r);
  P.box(0.02, 0.003, 0.02, 0xd9432b, r.range(-0.1, 0.1), 0.004, r.range(-0.05, 0.05));
  return P.build('paperMap');
}
export function cigarette() {
  const P = new PB();
  P.cyl(0.004, 0.004, 0.07, 0xf4f0e6, 0, 0, 0.035, Math.PI / 2, 0, 0, 5);
  P.cyl(0.0042, 0.0042, 0.02, 0xc98a3c, 0, 0, 0.0, Math.PI / 2, 0, 0, 5);
  P.cyl(0.0042, 0.0042, 0.006, 0xff5a1e, 0, 0, 0.072, Math.PI / 2, 0, 0, 5);
  return P.build('cigarette');
}
export function clipboard() {
  const P = new PB();
  P.box(0.23, 0.32, 0.008, 0x6e4f33, 0, 0, 0);
  P.box(0.21, 0.28, 0.003, 0xf5f2ea, 0, -0.01, 0.006);
  P.box(0.08, 0.03, 0.012, CHROME, 0, 0.145, 0.006);
  return P.build('clipboard');
}
export function flyers(seed = 1) {
  const r = rng(seed),
    P = new PB();
  for (let i = 0; i < 4; i++)
    P.box(0.11, 0.16, 0.002, pk(r, BR), 0, 0, i * 0.003, 0, 0, r.range(-0.1, 0.1));
  return P.build('flyers');
}
export function squeegee() {
  const P = new PB();
  P.cyl(0.012, 0.012, 0.5, 0x2a6fb5, 0, -0.1, 0);
  P.box(0.3, 0.03, 0.02, DARK, 0, -0.36, 0);
  return P.build('squeegee');
}
export function sponge(seed = 1) {
  const P = new PB();
  P.box(0.14, 0.05, 0.09, 0xe8d04a, 0, 0, 0);
  return P.build('sponge');
}
export function leashHandle() {
  const P = new PB();
  P.tor(0.035, 0.007, DARK, 0, 0, 0, 0, 0, 0, Math.PI * 2, 8);
  return P.build('leash');
}
export function trashGrabber() {
  const P = new PB();
  P.cyl(0.008, 0.008, 0.9, STEEL, 0, -0.3, 0.1, 0.3);
  P.box(0.03, 0.06, 0.02, 0xe8641e, 0, -0.74, 0.24);
  return P.build('grabber');
}

// a painted sign (plane with a canvas texture): draw(ctx, w, h). One extra draw call; used by vendor stations.
export function signPlane(w, h, draw, px = 256) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.round((px * h) / w);
  const ctx = c.getContext('2d');
  draw(ctx, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }),
  );
  m.name = 'prop-sign';
  return m;
}
export function paintSign(
  ctx,
  w,
  h,
  title,
  lines,
  bg = '#f4e9c8',
  ink = '#2a2a2a',
  accent = '#c0392b',
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(3, w * 0.02);
  ctx.strokeRect(w * 0.02, w * 0.02, w - w * 0.04, h - w * 0.04);
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fs = h * (lines.length ? 0.3 : 0.5);
  ctx.font = `900 ${fs}px "Arial Black", Impact, sans-serif`;
  while (ctx.measureText(title).width > w * 0.9 && fs > 6) {
    fs *= 0.92;
    ctx.font = `900 ${fs}px "Arial Black", Impact, sans-serif`;
  }
  ctx.fillText(title, w / 2, lines.length ? h * 0.24 : h / 2);
  ctx.fillStyle = ink;
  lines.forEach((l, i) => {
    let f2 = (h * 0.5) / Math.max(2, lines.length);
    ctx.font = `700 ${f2}px Georgia, serif`;
    while (ctx.measureText(l).width > w * 0.88 && f2 > 5) {
      f2 *= 0.92;
      ctx.font = `700 ${f2}px Georgia, serif`;
    }
    ctx.fillText(l, w / 2, h * 0.46 + (i + 0.5) * ((h * 0.5) / lines.length));
  });
}
export const PROP_BUILDERS = {
  stroller,
  mobilityScooter,
  walker,
  cane,
  bicycle,
  skateboard,
  rollerLuggage,
  handTruck,
  boxStack,
  carryBox,
  beachTowel,
  beachUmbrella,
  beachChair,
  cooler,
  beachBag,
  volleyballNet,
  ball,
  lifeguardCan,
  fruitCart,
  hotDogStand,
  vendorCart,
  foldingChair,
  plasticChair,
  milkCrate,
  dominoTable,
  cone,
  barricade,
  wheelbarrow,
  shovel,
  broom,
  hoseNozzle,
  bucket,
  toolbox,
  trashBin,
  trashBag,
  leafBlower,
  fishingRod,
  tackleBucket,
  ringLight,
  guitarCase,
  guitar,
  speaker,
  bucketDrums,
  tipHat,
  gurney,
  medicBag,
  bat,
  coffeeWindowTray,
  tote,
  shoppingBags,
  briefcase,
  purse,
  backpack,
  duffel,
  yogaMat,
  hat,
  sunglasses,
  headphones,
  lanyard,
  stethoscope,
  camera,
  chain,
  apron,
  toolBelt,
  babyCarrier,
  cup,
  paperMap,
  cigarette,
  clipboard,
  flyers,
  squeegee,
  sponge,
  leashHandle,
  trashGrabber,
};

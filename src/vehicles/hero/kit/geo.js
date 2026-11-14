// Hero-car geometry kit: small, dependable building blocks shared by the body, wheel, cockpit and engine builders.
// Conventions: meters, y up, car faces +Z, +X = car's left, ground y = 0, z = 0 mid-wheelbase.
// Every geometry that leaves this file is NON-INDEXED with position + normal + uv (uv in meters unless stated),
// so anything can be merged with anything (Bucket.merged()).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const smoother = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
export const DEG = Math.PI / 180;

// ---------------------------------------------------------------- normalization
/** Make a geometry mergeable: non-indexed, position + normal + uv only. */
export function norm(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.groups = [];
  return g;
}

/** Smooth normals with hard edges where faces meet at more than `deg`. Returns a non-indexed geometry. */
export function creased(g, deg = 38) {
  const uv = g.attributes.uv ? g : null;
  let out = toCreasedNormals(g, deg * DEG);
  if (!uv && out.attributes.uv) out.deleteAttribute('uv');
  return norm(out);
}

/** Box-projected UVs in meters (pick the dominant axis per triangle). scale = uv units per meter. */
export function uvBox(g, scale = 1) {
  g = norm(g);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i += 3) {
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < 3; k++) { ax += Math.abs(n.getX(i + k)); ay += Math.abs(n.getY(i + k)); az += Math.abs(n.getZ(i + k)); }
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      if (ax >= ay && ax >= az) uv.setXY(i + k, z * scale, y * scale);
      else if (ay >= az) uv.setXY(i + k, x * scale, z * scale);
      else uv.setXY(i + k, x * scale, y * scale);
    }
  }
  uv.needsUpdate = true;
  return g;
}

/** Mirror across the YZ plane (x -> -x), fixing winding and normals. Returns a new geometry. */
export function mirrorX(g) {
  const o = norm(g.clone());
  const names = Object.keys(o.attributes);
  for (const nm of names) {
    const a = o.attributes[nm], s = a.itemSize, arr = a.array;
    if (nm === 'position' || nm === 'normal') for (let i = 0; i < arr.length; i += s) arr[i] = -arr[i];
    // swap vertex 1 and 2 of every triangle
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < s; k++) { const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k; const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; }
    }
    a.needsUpdate = true;
  }
  return o;
}

/** Reverse triangle winding and normals (turn a surface inside out). */
export function flip(g) {
  const o = norm(g.clone());
  for (const nm of Object.keys(o.attributes)) {
    const a = o.attributes[nm], s = a.itemSize, arr = a.array;
    if (nm === 'normal') for (let i = 0; i < arr.length; i++) arr[i] = -arr[i];
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < s; k++) { const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k; const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; }
    }
  }
  return o;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** Transform matrix from { p:[x,y,z], r:[rx,ry,rz] (XYZ euler, radians), s: number | [sx,sy,sz], m: Matrix4 }. */
export function xfMatrix(xf) {
  if (!xf) return _m.identity().clone();
  if (xf.isMatrix4) return xf;
  if (xf.m) return xf.m;
  const r = xf.r || [0, 0, 0], p = xf.p || [0, 0, 0], s = xf.s ?? 1;
  _e.set(r[0] || 0, r[1] || 0, r[2] || 0, xf.order || 'XYZ'); _q.setFromEuler(_e);
  _p.set(p[0] || 0, p[1] || 0, p[2] || 0);
  if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
/** Clone + transform a geometry (keeps it mergeable). Negative-determinant scales are winding-corrected. */
export function xf(g, t) {
  const m = xfMatrix(t);
  let o = norm(g.clone());
  o.applyMatrix4(m);
  if (m.determinant() < 0) { o = flip(o); const n = o.attributes.normal; for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i]; }
  return o;
}

// ---------------------------------------------------------------- Bucket: collect geometry per material key
export class Bucket {
  constructor() { this.parts = {}; }
  /** add(key, geometry, transform?, mirror?)  mirror: true = also add the x-mirrored copy, 'only' = add only the mirrored copy */
  add(key, geo, t, mirror) {
    if (!geo) return this;
    const g = t ? xf(geo, t) : norm(geo.index ? geo.toNonIndexed() : geo.clone());
    const list = (this.parts[key] ||= []);
    if (mirror !== 'only') list.push(g);
    if (mirror) list.push(mirrorX(g));
    return this;
  }
  /** Merge another bucket (optionally transformed / mirrored) into this one. */
  addBucket(b, t, mirror) { for (const k in b.parts) for (const g of b.parts[k]) this.add(k, g, t, mirror); return this; }
  box(key, sx, sy, sz, t, mirror) { return this.add(key, uvBox(new THREE.BoxGeometry(sx, sy, sz)), t, mirror); }
  merged() {
    const out = {};
    for (const k in this.parts) if (this.parts[k].length) out[k] = this.parts[k].length === 1 ? this.parts[k][0] : mergeGeometries(this.parts[k], false);
    return out;
  }
  tris() { let n = 0; for (const k in this.parts) for (const g of this.parts[k]) n += g.attributes.position.count / 3; return n; }
}

/** Turn { key: geometry } into a Group of meshes using materials from `mats` (object or function key -> material). */
export function meshesFrom(geos, mats, opts = {}) {
  const grp = new THREE.Group();
  for (const k in geos) {
    const mat = typeof mats === 'function' ? mats(k) : mats[k];
    if (!mat) { console.warn('[hero] no material for key', k); continue; }
    const m = new THREE.Mesh(geos[k], mat);
    m.name = (opts.prefix || '') + k;
    m.castShadow = opts.castShadow ?? true; m.receiveShadow = opts.receiveShadow ?? true;
    grp.add(m);
  }
  return grp;
}

// ---------------------------------------------------------------- primitives
/** Rounded box centered on the origin, uv box-projected in meters. */
export function rbox(w, h, d, r = 0.01, seg = 3) {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return uvBox(new RoundedBoxGeometry(w, h, d, seg, Math.max(rr, 1e-4)));
}
/** Cylinder along an axis ('x' | 'y' | 'z'), optional open ends. */
export function cyl(r0, r1, len, seg = 20, axis = 'y', open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
  if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  return norm(g);
}
/**
 * Lathe: profile = [[radius, h], ...] revolved around `axis` (h runs along the axis).
 * uv: u = 0..1 around, v = 0..1 along the profile.  crease in degrees (0 = fully smooth).
 */
export function lathe(profile, seg = 48, axis = 'y', crease = 35, arc = Math.PI * 2, arcStart = 0) {
  const pts = profile.map((p) => new THREE.Vector2(Math.max(0, p[0]), p[1]));
  let g = new THREE.LatheGeometry(pts, seg, arcStart, arc);
  if (crease > 0) g = toCreasedNormals(g, crease * DEG);
  g = norm(g);
  if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}

/** Closed 2D loop helpers (arrays of [a, b]). */
export const sect = {
  circle(r, n = 16) { const o = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; o.push([Math.cos(a) * r, Math.sin(a) * r]); } return o; },
  ellipse(rx, ry, n = 16) { const o = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; o.push([Math.cos(a) * rx, Math.sin(a) * ry]); } return o; },
  /** superellipse: e = 2 ellipse, larger = boxier */
  superellipse(rx, ry, e = 4, n = 24) {
    const o = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); o.push([Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * rx, Math.sign(s) * Math.pow(Math.abs(s), 2 / e) * ry]); }
    return o;
  },
  /** rounded rectangle w x h centered, corner radius r, k points per corner */
  rrect(w, h, r, k = 4) {
    r = Math.min(r, w / 2, h / 2);
    const o = [], cs = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 1], [-w / 2 + r, -h / 2 + r, 2], [w / 2 - r, -h / 2 + r, 3]];
    for (const [cx, cy, q] of cs) for (let i = 0; i <= k; i++) { const a = (q + i / k) * Math.PI / 2; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return o;
  },
  /** symmetric airfoil-like section: chord c (along a), thickness t (along b), n points; leading edge at +a */
  airfoil(c, t, n = 20, camber = 0) {
    const o = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.cos(a), s = Math.sin(a);
      const u = (x + 1) / 2; // 0 trailing .. 1 leading
      const th = t * (0.25 + 0.75 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.9)) * 0.5;
      o.push([x * c / 2, s * th + camber * c * (1 - (2 * u - 1) ** 2)]);
    }
    return o;
  },
  scale(s, sx, sy = sx) { return s.map((p) => [p[0] * sx, p[1] * sy]); },
  offset(s, da, db) { return s.map((p) => [p[0] + da, p[1] + db]); },
};

/**
 * Loft through rings of 3D points (each ring = array of Vector3 with the same count).
 * opts: { closed: ring is a closed loop (default true), capStart, capEnd, crease (deg, default 38), flip, uvScale }
 * uv: u = distance around the ring (m), v = distance along the loft (m).
 */
export function loftRings(rings, opts = {}) {
  const closed = opts.closed !== false, n = rings[0].length, m = rings.length;
  const pos = [], uvs = [], idx = [];
  const cols = closed ? n + 1 : n;
  let vAcc = 0;
  for (let j = 0; j < m; j++) {
    if (j > 0) { let d = 0; for (let i = 0; i < n; i++) d += rings[j][i].distanceTo(rings[j - 1][i]); vAcc += d / n; }
    let uAcc = 0;
    for (let i = 0; i < cols; i++) {
      const p = rings[j][i % n];
      if (i > 0) uAcc += p.distanceTo(rings[j][(i - 1) % n]);
      pos.push(p.x, p.y, p.z); uvs.push(uAcc * (opts.uvScale || 1), vAcc * (opts.uvScale || 1));
    }
  }
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (j, rev) => {
    const ctr = new THREE.Vector3(); for (const p of rings[j]) ctr.add(p); ctr.multiplyScalar(1 / n);
    const ci = pos.length / 3; pos.push(ctr.x, ctr.y, ctr.z); uvs.push(0, 0);
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) { const p = rings[j][i]; pos.push(p.x, p.y, p.z); uvs.push((p.x - ctr.x) * (opts.uvScale || 1), (p.y - ctr.y + p.z - ctr.z) * (opts.uvScale || 1)); }
    for (let i = 0; i < n; i++) { const a = base + i, b = base + (i + 1) % n; if (rev) idx.push(ci, b, a); else idx.push(ci, a, b); }
  };
  if (closed && opts.capStart) cap(0, false);
  if (closed && opts.capEnd) cap(m - 1, true);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  // orientation: make the first quad face away from the ring centroid (closed) unless told otherwise
  if (closed) {
    const ctr = new THREE.Vector3(); for (const p of rings[0]) ctr.add(p); ctr.multiplyScalar(1 / n);
    const a = rings[0][0], b = rings[0][1 % n], c = rings[1][0];
    const nn = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(b, a));
    const out = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).sub(ctr);
    if ((nn.dot(out) < 0) !== !!opts.flip) g.setIndex(reverseIndex(idx));
  } else if (opts.flip) g.setIndex(reverseIndex(idx));
  g = toCreasedNormals(g, (opts.crease ?? 38) * DEG);
  return norm(g);
}
function reverseIndex(idx) { const o = idx.slice(); for (let i = 0; i < o.length; i += 3) { const t = o[i + 1]; o[i + 1] = o[i + 2]; o[i + 2] = t; } return o; }

/**
 * Sweep a 2D section along a 3D path.
 * path: array of points; each is [x,y,z] or { p:[x,y,z], s: scale | [sa, sb], twist: radians, sec: own section }
 * section: closed loop of [a, b]; with the default up hint and a path along +Z, a = +X and b = +Y.
 * opts: { up:[0,1,0], caps: true | false | 'start' | 'end', crease, closed: section is a closed loop (default true), flip, smoothPath: n (Catmull-Rom resample) }
 */
export function sweep(path, section, opts = {}) {
  let pts = path.map((q) => (Array.isArray(q) ? { p: q } : q));
  if (opts.smoothPath) pts = resamplePath(pts, opts.smoothPath);
  const P = pts.map((q) => new THREE.Vector3(q.p[0], q.p[1], q.p[2]));
  const up0 = new THREE.Vector3(...(opts.up || [0, 1, 0])).normalize();
  const rings = [];
  const T = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3();
  let prevR = null;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    T.subVectors(b, a).normalize();
    R.crossVectors(up0, T);
    if (R.lengthSq() < 1e-6) { if (prevR) R.copy(prevR); else R.set(1, 0, 0); }
    R.normalize();
    if (prevR && R.dot(prevR) < 0) R.negate();
    prevR = R.clone();
    U.crossVectors(T, R).normalize();
    const q = pts[i], s = q.s ?? 1, sa = Array.isArray(s) ? s[0] : s, sb = Array.isArray(s) ? s[1] : s;
    const tw = q.twist || 0, ct = Math.cos(tw), st = Math.sin(tw);
    const sec = q.sec || section;
    rings.push(sec.map(([x, y]) => {
      const xa = (x * ct - y * st) * sa, yb = (x * st + y * ct) * sb;
      return new THREE.Vector3().copy(P[i]).addScaledVector(R, xa).addScaledVector(U, yb);
    }));
  }
  const caps = opts.caps ?? true;
  return loftRings(rings, { closed: opts.closed !== false, capStart: caps === true || caps === 'start', capEnd: caps === true || caps === 'end', crease: opts.crease, flip: opts.flip, uvScale: opts.uvScale });
}
/** Catmull-Rom resample of a path of { p, s, twist } to n points (s and twist are interpolated linearly). */
export function resamplePath(pts, n) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q.p[0], q.p[1], q.p[2])), false, 'centripetal');
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), f = t * (pts.length - 1), i0 = Math.min(pts.length - 2, Math.floor(f)), k = f - i0;
    const v = curve.getPoint(t);
    const a = pts[i0], b = pts[i0 + 1];
    const sA = a.s ?? 1, sB = b.s ?? 1;
    const s = Array.isArray(sA) || Array.isArray(sB)
      ? [lerp(Array.isArray(sA) ? sA[0] : sA, Array.isArray(sB) ? sB[0] : sB, k), lerp(Array.isArray(sA) ? sA[1] : sA, Array.isArray(sB) ? sB[1] : sB, k)]
      : lerp(sA, sB, k);
    out.push({ p: [v.x, v.y, v.z], s, twist: lerp(a.twist || 0, b.twist || 0, k) });
  }
  return out;
}
/** Round tube through points (hoses, wires, piping, stitch beads). */
export function tube(points, radius = 0.01, radial = 8, seg = 0, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))), closed, 'centripetal');
  const g = new THREE.TubeGeometry(curve, seg || Math.max(8, points.length * 6), radius, radial, closed);
  return norm(g);
}
/** Flat extruded plate from a 2D outline ([[x,y],...]) with optional holes; lies in XY, thickness along +Z from 0. */
export function plate(outline, depth, bevel = 0, holes = []) {
  const sh = new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.ExtrudeGeometry(sh, bevel > 0
    ? { depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 8 }
    : { depth, bevelEnabled: false, curveSegments: 8 });
  if (bevel > 0) g.translate(0, 0, bevel);
  return uvBox(g);
}
/** Regular polygon outline (n sides, circumradius r, rotation rot). Hexagons: poly(6, r, Math.PI / 6) is flat-topped. */
export function poly(n, r, rot = 0, cx = 0, cy = 0) {
  const o = []; for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o;
}
/** Canvas texture helper (sRGB by default). */
export function canvasTex(w, h, draw, opts = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 8;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
  if (opts.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function triCount(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return Math.round(n);
}
export { THREE, mergeGeometries, mergeVertices };

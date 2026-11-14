// Port Solana V2 yachts: the build context ("ctx") every yacht definition and every kit part draws into.
// One Builder collects, in yacht-local coordinates (+z bow, +x port, y up, y = 0 at the design waterline, meters):
//   - geometry, bucketed by (lod, zone, material key) and merged into a handful of meshes at the end
//   - colliders (fine set for the local walk world, coarse set for the main physics world)
//   - nav graph, spots (seats, loungers, stations), interactables, areas (rooms), lights, ladders, doors
//   - movable parts (doors, wheel, throttles, radar) as separate Object3Ds
// Nothing here knows about the game; a preview page and the game both consume the same output.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); };
export function hashStr(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed >>> 0 : hashStr(seed)) || 1;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  return f;
}
// Monotone cubic through keyframes [[x, y], ...]; also accepts a function or a constant.
export function curve(keys) {
  if (typeof keys === 'function') return keys;
  if (typeof keys === 'number') return () => keys;
  const n = keys.length, xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  if (n === 1) return () => ys[0];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) || 1e-9);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _n3 = new THREE.Matrix3();
const V3 = (a) => (a && a.isVector3 ? a : new THREE.Vector3(a[0], a[1], a[2]));

// Planar UVs in meters picked by the dominant normal axis (so tiling textures keep a real-world scale).
function worldUV(pos, nor, count, scale, ox, oy) {
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const ax = Math.abs(nor[i * 3]), ay = Math.abs(nor[i * 3 + 1]), az = Math.abs(nor[i * 3 + 2]);
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u * scale + ox; uv[i * 2 + 1] = v * scale + oy;
  }
  return uv;
}

class Bucket {
  constructor() { this.chunks = []; this.verts = 0; this.inds = 0; this.hasColor = false; }
}

export class Builder {
  /** @param {{mats: {get(key): THREE.Material}, seed?: number|string, maxLod?: number}} opts */
  constructor(opts = {}) {
    this.mats = opts.mats; this.seed = opts.seed ?? 1; this.rand = rng(this.seed); this.maxLod = opts.maxLod ?? 2;
    this.buckets = new Map();
    this.M = new THREE.Matrix4(); this.Gi = null; this._stack = [];
    this._lod = 0; this._zone = 'ext';
    this.colliders = []; this.coarse = [];
    this.nav = { nodes: new Map(), links: [] };
    this.spots = []; this.interacts = []; this.areas = []; this.lights = []; this.ladders = []; this.doors = [];
    this.parts = {}; this.updaters = []; this.meta = {}; this.decks = [];
    this.stats = { prims: 0 };
    this.root = opts.root || this; // sub-builders (movable parts) register gameplay data on the root
  }

  // ---------------------------------------------------------------- scoping
  /** Run fn with a level-of-detail tag: 0 = silhouette (always drawn), 1 = exterior detail (< ~250 m), 2 = fine and interior detail (< ~70 m). Skipped entirely when above the build's maxLod. */
  lod(n, fn) { if (n > this.maxLod) return this; const p = this._lod; this._lod = n; try { fn(this); } finally { this._lod = p; } return this; }
  /** Run fn with a zone tag ('ext', 'int:main', 'int:lower', ...). Interior zones can be hidden when nobody can see them. */
  zone(name, fn) { const p = this._zone; this._zone = name; try { fn(this); } finally { this._zone = p; } return this; }
  /** Run fn inside a local frame at pos, rotated by heading (yaw about +y, radians; 0 keeps +z forward). Nests. */
  at(pos, heading, fn) {
    this._stack.push(this.M.clone());
    _e.set(0, heading || 0, 0); _q.setFromEuler(_e); _m.compose(V3(pos), _q, _one);
    this.M.multiply(_m);
    try { fn(this); } finally { this.M.copy(this._stack.pop()); }
    return this;
  }
  /** Like at(), with a full rotation [rx, ry, rz] (order YXZ). */
  frame(pos, rot, fn) {
    this._stack.push(this.M.clone());
    _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(V3(pos), _q, _one);
    this.M.multiply(_m);
    try { fn(this); } finally { this.M.copy(this._stack.pop()); }
    return this;
  }
  /** Mirror helper: calls fn(+1) then fn(-1) (port, starboard). */
  both(fn) { fn(1); fn(-1); return this; }
  /** Transform a local point by the current frame -> THREE.Vector3 in yacht space. */
  P(p) { return V3(p).clone().applyMatrix4(this.M); }
  /** Current frame yaw (radians) added to a local heading. */
  H(h = 0) { _v.set(Math.sin(h), 0, Math.cos(h)).transformDirection(this.M); return Math.atan2(_v.x, _v.z); }

  // ---------------------------------------------------------------- raw geometry
  /**
   * Add a BufferGeometry (position + normal required) in the current frame.
   * o.color: number|THREE.Color -> per-vertex color (use with the 'vc*' materials); o.uv: 'world' (default, meters) | 'keep';
   * o.uvScale (default 1), o.m: extra local Matrix4 applied before the frame.
   */
  add(geom, mat, o = {}) {
    if (this._lod > this.maxLod || !mat) return this;
    let g = geom;
    if (!g.attributes.normal) g.computeVertexNormals();
    const pa = g.attributes.position, count = pa.count;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
    pos.set(pa.array.subarray(0, count * 3)); nor.set(g.attributes.normal.array.subarray(0, count * 3));
    let uv;
    if (o.uv === 'keep' && g.attributes.uv) { uv = new Float32Array(count * 2); uv.set(g.attributes.uv.array.subarray(0, count * 2)); }
    else {
      // UVs are taken in the geometry's own frame, plus a per-object offset so repeated parts do not show the same grain
      const j = o.uvJitter === false ? 0 : (this.stats.prims * 0.6180339887) % 1;
      uv = worldUV(pos, nor, count, o.uvScale ?? 1, j * 3.1, j * 1.7);
    }
    _m2.copy(this.M); if (this.Gi) _m2.premultiply(this.Gi); if (o.m) _m2.multiply(o.m);
    _n3.getNormalMatrix(_m2);
    const e = _m2.elements, n = _n3.elements;
    for (let i = 0; i < count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      pos[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = nor[i * 3], b = nor[i * 3 + 1], c = nor[i * 3 + 2];
      let nx = n[0] * a + n[3] * b + n[6] * c, ny = n[1] * a + n[4] * b + n[7] * c, nz = n[2] * a + n[5] * b + n[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1; nor[i * 3] = nx / l; nor[i * 3 + 1] = ny / l; nor[i * 3 + 2] = nz / l;
    }
    let col = null;
    if (o.color !== undefined && o.color !== null) {
      const c = o.color.isColor ? o.color : new THREE.Color(o.color);
      col = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    } else if (g.attributes.color) { col = new Float32Array(count * 3); col.set(g.attributes.color.array.subarray(0, count * 3)); }
    let idx = null;
    if (g.index) { idx = new Uint32Array(g.index.count); idx.set(g.index.array); }
    const key = this._lod + '|' + this._zone + '|' + mat;
    let b = this.buckets.get(key); if (!b) this.buckets.set(key, b = new Bucket());
    b.chunks.push({ pos, nor, uv, col, idx, count });
    b.verts += count; b.inds += idx ? idx.length : count; if (col) b.hasColor = true;
    this.stats.prims++;
    g.dispose?.();
    return this;
  }

  _prim(g, mat, pos, o, col) {
    _e.set(o.rot?.[0] || 0, o.rot?.[1] || 0, o.rot?.[2] || 0, 'YXZ'); _q.setFromEuler(_e);
    const lm = new THREE.Matrix4().compose(V3(pos), _q, _one);
    if (mat && g) this.add(g, mat, { ...o, m: lm });
    if (o.solid && col) this.collide({ ...col, m: lm, tag: o.tag });
    return this;
  }
  /** Box centered at pos. size [sx, sy, sz]. o: { rot:[rx,ry,rz], color, solid, tag } */
  box(mat, size, pos, o = {}) { return this._prim(mat ? new THREE.BoxGeometry(size[0], size[1], size[2]) : null, mat, pos, o, { type: 'box', h: [size[0] / 2, size[1] / 2, size[2] / 2] }); }
  /** Rounded box (cushions, soft furniture, molded parts). o.r = corner radius, o.seg = smoothness (default 3). */
  rbox(mat, size, pos, o = {}) {
    const r = Math.min(o.r ?? 0.04, Math.min(size[0], size[1], size[2]) / 2 - 1e-3);
    return this._prim(mat ? new RoundedBoxGeometry(size[0], size[1], size[2], o.seg ?? 3, r) : null, mat, pos, o, { type: 'box', h: [size[0] / 2, size[1] / 2, size[2] / 2] });
  }
  /** Cylinder along +y, centered at pos. o: { seg, open, rot, solid, color, arc:[start, length] } */
  cyl(mat, rTop, rBot, h, pos, o = {}) {
    const g = mat ? new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 16, 1, !!o.open, o.arc?.[0] ?? 0, o.arc?.[1] ?? Math.PI * 2) : null;
    return this._prim(g, mat, pos, o, { type: 'cyl', hh: h / 2, r: Math.max(rTop, rBot) });
  }
  cone(mat, r, h, pos, o = {}) { return this.cyl(mat, 0, r, h, pos, o); }
  sphere(mat, r, pos, o = {}) {
    const g = mat ? new THREE.SphereGeometry(r, o.seg ?? 16, o.segH ?? Math.max(6, (o.seg ?? 16) >> 1), 0, Math.PI * 2, o.theta?.[0] ?? 0, o.theta?.[1] ?? Math.PI) : null;
    if (g && o.scale) g.scale(o.scale[0], o.scale[1], o.scale[2]);
    return this._prim(g, mat, pos, o, { type: 'ball', r });
  }
  torus(mat, R, r, pos, o = {}) { return this._prim(new THREE.TorusGeometry(R, r, o.segR ?? 8, o.seg ?? 24, o.arc ?? Math.PI * 2), mat, pos, o, null); }
  /** Straight round bar from a to b (rails, stanchions, legs, pipes). */
  rod(mat, a, b, r, o = {}) {
    const A = V3(a), B = V3(b), d = _v.copy(B).sub(A), len = d.length(); if (len < 1e-5) return this;
    const g = new THREE.CylinderGeometry(o.r2 ?? r, r, len, o.seg ?? 8, 1, o.open ?? true);
    _q.setFromUnitVectors(_v2.set(0, 1, 0), d.clone().normalize());
    const lm = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), _q, _one);
    this.add(g, mat, { ...o, m: lm });
    if (o.solid) this.collide({ type: 'cyl', hh: len / 2, r: Math.max(r, o.solidR ?? r), m: lm, tag: o.tag });
    return this;
  }
  /** Smooth tube through points (bent rails, hoses, bimini frames). o: { r, seg, closed, tension } */
  tube(mat, pts, r, o = {}) {
    const P = pts.map(V3); if (P.length < 2) return this;
    if (P.length === 2) return this.rod(mat, P[0], P[1], r, o);
    const c = new THREE.CatmullRomCurve3(P, !!o.closed, 'catmullrom', o.tension ?? 0.25);
    return this.add(new THREE.TubeGeometry(c, o.div ?? Math.max(8, P.length * 6), r, o.seg ?? 8, !!o.closed), mat, o);
  }
  /** Lathe: profile [[r, y], ...] revolved about +y at pos. */
  lathe(mat, profile, pos, o = {}) {
    const g = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), o.seg ?? 24, o.arc?.[0] ?? 0, o.arc?.[1] ?? Math.PI * 2);
    return this._prim(g, mat, pos, o, null);
  }
  /** One quad a-b-c-d (counterclockwise seen from the front). o.uvs = [[u,v] x4] for atlas decals. */
  quad(mat, a, b, c, d, o = {}) {
    const A = V3(a), B = V3(b), C = V3(c), D = V3(d);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z, D.x, D.y, D.z], 3));
    const uvs = o.uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
    g.setIndex(o.double ? [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    return this.add(g, mat, { ...o, uv: o.uvs ? 'keep' : o.uv });
  }
  /**
   * Lofted grid: fn(i, j) -> [x, y, z] for i in 0..nu, j in 0..nv. Smooth normals. o: { flip, closeU, uvFn(i,j)->[u,v], skip(i,j)->bool (drop a cell), double }
   * The workhorse for hulls, hardtops, cowls, domes, sails.
   */
  grid(mat, nu, nv, fn, o = {}) {
    const W = nu + 1, H = nv + 1, pos = new Float32Array(W * H * 3), uv = new Float32Array(W * H * 2);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const p = fn(i, j), k = j * W + i; pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      if (o.uvFn) { const t = o.uvFn(i, j, p); uv[k * 2] = t[0]; uv[k * 2 + 1] = t[1]; }
    }
    const idx = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      if (o.skip && o.skip(i, j)) continue;
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      if (o.flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      if (o.double) { if (o.flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
    }
    if (!idx.length) return this;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return this.add(g, mat, { ...o, uv: o.uvFn ? 'keep' : 'world' });
  }
  /** Ruled strip between two polylines of equal length (walls, coamings, bulwark faces). */
  ruled(mat, A, B, o = {}) {
    const n = A.length - 1;
    return this.grid(mat, n, o.div ?? 1, (i, j) => { const a = A[i], b = B[i], t = j / (o.div ?? 1); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }, o);
  }
  /**
   * Prism: a 2D polygon [[p, q], ...] extruded along an axis between a0 and a1.
   *   axis 'y': (p, q) = (x, z) -> horizontal plate (decks, tabletops, platforms)
   *   axis 'x': (p, q) = (z, y) -> side-profile plate (arch legs, fins, stringers, bulkheads across the beam)
   *   axis 'z': (p, q) = (x, y) -> transverse profile extruded fore-aft (coamings, beams, molded seat bases)
   * o: { holes: [poly, ...], capMat (a0-side cap), capMat2 (a1-side cap), sideMat, solid, smoothAngle (deg, default 40), noCaps }
   */
  prism(mat, poly, axis, a0, a1, o = {}) {
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    const area = THREE.ShapeUtils.area(poly.map((p) => new THREE.Vector2(p[0], p[1])));
    const contour = (area < 0 ? poly.slice().reverse() : poly).map((p) => new THREE.Vector2(p[0], p[1]));
    const holes = (o.holes || []).map((h) => { const hv = h.map((p) => new THREE.Vector2(p[0], p[1])); return THREE.ShapeUtils.area(hv) > 0 ? hv.reverse() : hv; });
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = contour.concat(...holes);
    // map (p, q, a) -> xyz so that a counterclockwise polygon (in p, q) faces +axis
    const map = axis === 'y' ? (p, q, a) => [q, a, p] : axis === 'x' ? (p, q, a) => [a, q, p] : (p, q, a) => [p, q, a];
    // for 'y' and 'x' the user-facing order is (x, z) and (z, y): swap so the mapping above stays right-handed
    const PQ = axis === 'y' ? (v) => [v.y, v.x] : axis === 'x' ? (v) => [v.x, v.y] : (v) => [v.x, v.y];
    const flipCaps = axis === 'y' || axis === 'x';
    const mk = (posArr, idxArr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3)); g.setIndex(idxArr); g.computeVertexNormals(); return g; };
    const colPos = [], colIdx = [];
    const pushCol = (posArr, idxArr) => { const base = colPos.length / 3; for (const v of posArr) colPos.push(v); for (const k of idxArr) colIdx.push(k + base); };
    if (!o.noCaps) for (const top of [true, false]) {
      const a = top ? a1 : a0, pp = [], ii = [];
      for (const v of all) { const [p, q] = PQ(v); pp.push(...map(p, q, a)); }
      for (const t of tris) { if (top !== flipCaps) ii.push(t[0], t[1], t[2]); else ii.push(t[0], t[2], t[1]); }
      const m2 = top ? (o.capMat2 ?? o.capMat ?? mat) : (o.capMat ?? mat);
      if (m2) this.add(mk(pp, ii), m2, o);
      if (o.solid) pushCol(pp, ii);
    }
    const sideMat = o.sideMat ?? mat, cosT = Math.cos(((o.smoothAngle ?? 40) * Math.PI) / 180);
    for (const ring of [contour, ...holes]) {
      const n = ring.length, pp = [], ii = [];
      const dir = (i) => { const a = ring[i], b = ring[(i + 1) % n]; const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
      for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n];
        const [pa, qa] = PQ(a), [pb, qb] = PQ(b);
        const k = pp.length / 3;
        pp.push(...map(pa, qa, a0), ...map(pb, qb, a0), ...map(pb, qb, a1), ...map(pa, qa, a1));
        if (flipCaps) ii.push(k, k + 2, k + 1, k, k + 3, k + 2); else ii.push(k, k + 1, k + 2, k, k + 2, k + 3);
      }
      const g = mk(pp, ii);
      // smooth across shallow corners: average the normals of neighboring side quads
      const na = g.attributes.normal;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, d0 = dir(i), d1 = dir(j);
        if (d0[0] * d1[0] + d0[1] * d1[1] < cosT) continue;
        const v1 = i * 4 + 1, v2 = i * 4 + 2, w0 = j * 4, w3 = j * 4 + 3;
        const nx = na.getX(v1) + na.getX(w0), ny = na.getY(v1) + na.getY(w0), nz = na.getZ(v1) + na.getZ(w0), l = Math.hypot(nx, ny, nz) || 1;
        for (const v of [v1, v2, w0, w3]) na.setXYZ(v, nx / l, ny / l, nz / l);
      }
      if (sideMat) this.add(g, sideMat, o);
      if (o.solid) pushCol(pp, ii);
    }
    if (o.solid) this.collide({ type: 'mesh', verts: new Float32Array(colPos), idx: new Uint32Array(colIdx), tag: o.tag });
    return this;
  }
  /** Horizontal slab: polygon [[x, z], ...], top face at y, thickness t downward. */
  plate(mat, poly, y, t, o = {}) { return this.prism(mat, poly, 'y', y - t, y, { ...o, capMat: o.bottomMat ?? o.capMat ?? mat, capMat2: mat, sideMat: o.sideMat ?? o.edgeMat ?? mat }); }

  // ---------------------------------------------------------------- colliders
  /**
   * Register a collider for the walk world. { type: 'box'|'cyl'|'ball'|'mesh', h|hh,r|r|verts,idx, m?: local Matrix4, tag?, id?, coarse? }
   * tag: 'floor' | 'wall' | 'rail' | 'stair' | 'furniture' | 'door' | 'glass' (used for footstep sounds and vaulting rules).
   */
  collide(c) {
    _m2.copy(this.M); if (c.m) _m2.multiply(c.m);
    const out = { type: c.type, tag: c.tag || 'solid', id: c.id || null, enabled: c.enabled !== false };
    if (c.type === 'mesh') {
      const v = new Float32Array(c.verts.length), e = _m2.elements;
      for (let i = 0; i < v.length; i += 3) { const x = c.verts[i], y = c.verts[i + 1], z = c.verts[i + 2]; v[i] = e[0] * x + e[4] * y + e[8] * z + e[12]; v[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; v[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
      out.verts = v; out.idx = c.idx;
    } else {
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); _m2.decompose(p, q, s);
      out.p = [p.x, p.y, p.z]; out.q = [q.x, q.y, q.z, q.w];
      if (c.type === 'box') out.h = c.h.slice(); else if (c.type === 'cyl') { out.hh = c.hh; out.r = c.r; } else out.r = c.r;
    }
    (c.coarse ? this.root.coarse : this.root.colliders).push(out);
    return out;
  }
  /** Invisible solid box (centered). Use for anything whose visual is not a simple primitive. */
  solidBox(size, pos, o = {}) { return this._prim(null, null, pos, { ...o, solid: true }, { type: 'box', h: [size[0] / 2, size[1] / 2, size[2] / 2] }); }
  /** Invisible ramp between two floor points (stairs are walked on ramps: smooth, no step jitter). */
  ramp(a, b, width, o = {}) {
    const A = V3(a), B = V3(b), d = B.clone().sub(A), run = Math.hypot(d.x, d.z), len = d.length(), th = o.t ?? 0.12;
    const yaw = Math.atan2(d.x, d.z), pitch = -Math.atan2(d.y, run);
    _e.set(pitch, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
    const c = A.clone().add(B).multiplyScalar(0.5).addScaledVector(up, -th / 2);
    return this.collide({ type: 'box', h: [width / 2, th / 2, len / 2], m: new THREE.Matrix4().compose(c, _q, _one), tag: o.tag || 'stair' });
  }

  // ---------------------------------------------------------------- gameplay data
  /** Nav node for crew and guests (and the walk test). o: { deck, area } */
  node(id, pos, o = {}) { const p = this.P(pos); this.root.nav.nodes.set(id, { id, x: p.x, y: p.y, z: p.z, ...o }); return id; }
  /** Link two nav nodes. o: { type: 'walk' | 'stairs' | 'ladder' | 'door', door: id } */
  link(a, b, o = {}) { this.root.nav.links.push({ a, b, type: o.type || 'walk', door: o.door || null }); return this; }
  /** Chain of links through node ids. */
  path(ids, o = {}) { for (let i = 0; i < ids.length - 1; i++) this.link(ids[i], ids[i + 1], o); return this; }
  /**
   * A place a person can use. type: 'seat' | 'lounge' | 'stand' | 'lean' | 'dance' | 'helm' | 'bar' | 'tub' | 'bed' | 'work' | 'dine' | 'watch'
   * o: { heading, node (nearest nav node id), tags: ['guest', 'crew', 'owner', 'sun', 'shade', 'party', ...], seatH (seat height above floor), id }
   */
  spot(type, pos, o = {}) {
    const p = this.P(pos);
    const s = { type, x: p.x, y: p.y, z: p.z, heading: this.H(o.heading || 0), node: o.node || null, tags: o.tags || [], seatH: o.seatH ?? (type === 'seat' || type === 'dine' || type === 'bar' ? 0.45 : 0), id: o.id || `${type}${this.root.spots.length}`, data: o.data || null };
    this.root.spots.push(s); return s;
  }
  /**
   * Something the player can use with the interact key. type: 'helm' | 'door' | 'eat' | 'drink' | 'sit' | 'lounge' | 'tub' | 'lights' | 'stereo' |
   * 'ladder' | 'gate' | 'tender' | 'anchor' | 'bed' | 'shower' | 'tv' | 'fridge' | 'dance' | 'horn' | 'jetski' | 'passerelle'
   * o: { r (reach, default 1.3), label, heading, data, id }
   */
  interact(type, pos, o = {}) {
    const p = this.P(pos);
    const it = { type, x: p.x, y: p.y, z: p.z, r: o.r ?? 1.3, label: o.label || null, heading: this.H(o.heading || 0), data: o.data || null, id: o.id || `${type}${this.root.interacts.length}` };
    this.root.interacts.push(it); return it;
  }
  /** A named room or deck area. bounds [x0, z0, x1, z1] in the current frame (axis-aligned use only), y0..y1 height span. privacy: 'public' | 'guest' | 'private' | 'crew' | 'machinery' */
  area(id, name, bounds, y0, y1, o = {}) {
    const a = this.P([bounds[0], y0, bounds[1]]), b = this.P([bounds[2], y1, bounds[3]]);
    this.root.areas.push({ id, name, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), privacy: o.privacy || 'guest', deck: o.deck || null, interior: !!o.interior });
    return this;
  }
  /**
   * A light fixture. group: 'nav' | 'anchor' | 'deck' | 'uw' (underwater) | 'int' | 'courtesy' | 'party' | 'spot'
   * o: { color, intensity, range, dir:[x,y,z] (spot), angle, real (wants a real light when the player is near), size (fixture radius, 0 = no fixture mesh) }
   */
  light(group, pos, o = {}) {
    const p = this.P(pos);
    const L = { group, x: p.x, y: p.y, z: p.z, color: o.color ?? 0xfff1d6, intensity: o.intensity ?? 1, range: o.range ?? 6, dir: o.dir ? V3(o.dir).clone().transformDirection(this.M).toArray() : null, angle: o.angle ?? 0.9, real: o.real !== false, zone: this._zone };
    this.root.lights.push(L);
    const size = o.size ?? 0.035;
    if (size > 0) {
      const key = 'emit:' + group + ':' + (L.color >>> 0).toString(16);
      if (o.shape === 'bar') this.box(key, [o.len ?? 0.4, size * 0.5, size], pos, { rot: o.rot });
      else this.cyl(key, size, size, size * 0.5, pos, { seg: 10, rot: o.rot });
    }
    return L;
  }
  /** Ladder volume: the walk controller attaches when the player pushes into it. bottom/top are floor points; facing = heading the climber faces. */
  ladder(bottom, top, o = {}) {
    const a = this.P(bottom), b = this.P(top);
    this.root.ladders.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, facing: this.H(o.facing || 0), r: o.r ?? 0.45, id: o.id || 'ladder' + this.root.ladders.length });
    if (o.navA && o.navB) this.link(o.navA, o.navB, { type: 'ladder' });
    return this;
  }
  /**
   * A movable part built in its own frame at pos/heading (doors, wheels, throttles, hatches, radar scanners).
   * fn(sub) draws with a sub-builder; returns { id, group, pos, heading }. The runtime animates group.rotation / position.
   */
  part(id, pos, heading, fn, o = {}) {
    if (this._lod > this.maxLod) return null;
    const sub = new Builder({ mats: this.mats, seed: this.seed + ':' + id, maxLod: 9, root: this.root });
    sub._lod = 0; sub._zone = 'part';
    // gameplay data registered from inside the part must land in yacht space
    _e.set(0, heading || 0, 0); _q.setFromEuler(_e);
    const world = this.M.clone().multiply(new THREE.Matrix4().compose(V3(pos), _q, _one));
    sub.M = world.clone(); sub.Gi = world.clone().invert(); // gameplay data lands in yacht space, geometry stays in the part's own frame
    fn(sub);
    const group = sub.toGroup(); group.name = 'part:' + id;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); world.decompose(p, q, s);
    group.position.copy(p); group.quaternion.copy(q);
    const rec = { id, group, lod: this._lod, zone: this._zone, home: { p: p.clone(), q: q.clone() }, data: o.data || null };
    this.root.parts[id] = rec; return rec;
  }
  /** Register a per-frame callback fn(dt, rt) (rt = the yacht runtime: rt.state, rt.time, rt.parts, rt.lightsOn, ...). */
  onUpdate(fn) { this.root.updaters.push(fn); return this; }

  // ---------------------------------------------------------------- output
  _merge(b) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(b.verts * 3), nor = new Float32Array(b.verts * 3), uv = new Float32Array(b.verts * 2);
    const col = b.hasColor ? new Float32Array(b.verts * 3).fill(1) : null;
    const idx = b.verts > 65535 ? new Uint32Array(b.inds) : new Uint16Array(b.inds);
    let vo = 0, io = 0;
    for (const c of b.chunks) {
      pos.set(c.pos, vo * 3); nor.set(c.nor, vo * 3); uv.set(c.uv, vo * 2); if (col && c.col) col.set(c.col, vo * 3);
      if (c.idx) { for (let i = 0; i < c.idx.length; i++) idx[io + i] = c.idx[i] + vo; io += c.idx.length; }
      else { for (let i = 0; i < c.count; i++) idx[io + i] = vo + i; io += c.count; }
      vo += c.count;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  /** Merge everything into a Group: children 'lod0' | 'lod1' | 'lod2', each holding one mesh per (zone, material). */
  toGroup() {
    const root = new THREE.Group();
    const lods = [0, 1, 2].map((n) => { const g = new THREE.Group(); g.name = 'lod' + n; root.add(g); return g; });
    let tris = 0, meshes = 0;
    for (const [key, b] of this.buckets) {
      const [lod, zone, mat] = key.split('|');
      const material = this.mats.get(mat);
      const mesh = new THREE.Mesh(this._merge(b), material);
      mesh.name = zone + ':' + mat; mesh.userData.zone = zone; mesh.userData.mat = mat;
      const transparent = !!material.transparent;
      mesh.castShadow = !transparent && +lod <= 1 && !mat.startsWith('emit'); mesh.receiveShadow = !transparent;
      if (transparent) mesh.renderOrder = 2;
      lods[Math.min(2, +lod)].add(mesh);
      tris += b.inds / 3; meshes++;
    }
    root.userData.tris = Math.round(tris); root.userData.meshes = meshes;
    this.buckets.clear();
    return root;
  }
}

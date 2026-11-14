// Boat construction kit: geometry buckets + primitives. Every boat is built by a model function that draws into a Kit.
//
// HOW IT WORKS
//   const K = new Kit();
//   K.box('gel', S.deck, 1, 0.1, 2, 0, 0.5, 0);          // bucket, palette slot, size..., position...
//   const eng = K.part('engine0', x, y, z);               // a movable child (own Object3D, own pivot)
//   const obj = K.toObject3D(materials);                   // THREE.Group, one mesh per bucket, children per part
//
// BUCKETS (one draw call each; the per-boat material set in materials.js has one material per bucket)
//   hull     topsides + bottom; uv = livery texture coordinates (see hull.js)
//   gel      molded gelcoat parts (decks, liners, consoles, hardtops); glossy; color from the palette slot
//   nonskid  textured walking surfaces; color from the palette slot
//   vinyl    upholstery; color from the palette slot
//   matte    plastics, rubber, canvas, rope, paint without gloss; color from the palette slot
//   metal    polished stainless / chrome;   alu = brushed or painted aluminum (rougher)
//   teak     wood (own shared texture; slot ignored)
//   glass    windshields, windows (transparent)
//   screen   chartplotters and gauges (uv into the shared screen atlas; pass keepUV)
//   decal    name, hailing port, registration, logos (uv into the per-boat decal atlas; pass keepUV)
//   lamp     navigation / anchor / courtesy lights (emissive at night); color from the palette slot
//   beaconA / beaconB  flashing emergency lights (police, fire)
//   sail     sailcloth (double sided)
//
// PALETTE: color is never baked into vertices. Each vertex carries uv1 pointing at one of 32 palette slots, and every boat
// has its own 32-pixel palette texture (identity.js), so two boats built from the same model still differ.
//
// FRAME: +Z bow, +X port, +Y up, meters. y = 0 is the design waterline.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const PALETTE_N = 32;
// Palette slots. 0..15 are per-boat (seeded); 16..31 are fixed colors shared by every boat.
export const S = {
  hull: 0, hull2: 1, boot: 2, bottom: 3, deck: 4, liner: 5, nonskid: 6, upA: 7, upB: 8, canvas: 9, cowl: 10, cowl2: 11,
  accent: 12, console: 13, top: 14, gear: 15,
  white: 16, black: 17, rubber: 18, gray: 19, red: 20, green: 21, orange: 22, yellow: 23, blue: 24, steel: 25, alu: 26,
  rope: 27, tan: 28, navy: 29, amber: 30, offwhite: 31,
};
export const FIXED_COLORS = {
  16: 0xf4f4f0, 17: 0x0c0d0f, 18: 0x1b1c1e, 19: 0x7d8288, 20: 0xc4161c, 21: 0x12a150, 22: 0xf2641a, 23: 0xf3c318, 24: 0x1f5fbf,
  25: 0xe6eaee, 26: 0xb9bec4, 27: 0xcdb98a, 28: 0xb89b6e, 29: 0x14233f, 30: 0xffb02e, 31: 0xe9e4d6,
};

export function rng(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  const f = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  f.shuffle = (arr) => { const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  return f;
}
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _nv = new THREE.Vector3();
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const NO_SHADOW = new Set(['glass', 'decal', 'screen', 'lamp', 'beaconA', 'beaconB']);
const KEEP_UV = new Set(['hull', 'screen', 'decal']);

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}

export class Kit {
  constructor(name = 'boat') {
    this.name = name; this.buckets = {}; this.parts = []; this.stack = [new THREE.Matrix4()]; this.pivot = new THREE.Vector3(); this.rot = new THREE.Euler();
    this.tris = 0; this.anchors = {}; this.uvScale = 1; this.tasks = []; this.ti = 0;
  }
  get M() { return this.stack[this.stack.length - 1]; }
  // transform stack: everything added inside fn is transformed by m (THREE.Matrix4)
  with(m, fn) { this.stack.push(new THREE.Matrix4().multiplyMatrices(this.M, m)); try { fn(); } finally { this.stack.pop(); } return this; }
  at(x, y, z, fn, rx = 0, ry = 0, rz = 0) { return this.with(mat4(x, y, z, rx, ry, rz), fn); }
  // run fn for port (+1) and starboard (-1); the starboard pass is a true mirror (winding is fixed automatically)
  mirror(fn) { fn(1); this.with(new THREE.Matrix4().makeScale(-1, 1, 1), () => fn(-1)); return this; }
  // a movable child part with its own pivot (in the current transform's space). Returns a Kit; draw into it in LOCAL coords.
  part(name, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const k = new Kit(name); _v.set(x, y, z).applyMatrix4(this.M); k.pivot.copy(_v); k.rot.set(rx, ry, rz, 'YXZ'); this.parts.push(k); return k;
  }
  bucket(name) { return this.buckets[name] || (this.buckets[name] = { chunks: [], verts: 0, idx: 0 }); }

  // Append a THREE.BufferGeometry (consumed: do not reuse it). m = extra local matrix (optional).
  // Work is deferred: add() only records the task (with the transform captured now); flush() does the geometry work, and
  // can be time-sliced (flush(budgetMs) returns false while tasks remain) so spawning a boat never stalls a frame.
  add(bucket, slot, geo, m = null, opts = {}) {
    this.tasks.push({ bucket, slot, geo, M: m ? new THREE.Matrix4().multiplyMatrices(this.M, m) : this.M.clone(), opts });
    return this;
  }
  flush(budgetMs = Infinity) {
    const t0 = performance.now();
    while (this.ti < this.tasks.length) { const t = this.tasks[this.ti]; this.tasks[this.ti++] = null; this._add(t.bucket, t.slot, typeof t.geo === 'function' ? t.geo() : t.geo, t.M, t.opts); if (performance.now() - t0 > budgetMs) return false; }
    for (const p of this.parts) if (!p.flush(budgetMs - (performance.now() - t0))) return false;
    return true;
  }
  _add(bucket, slot, geo, M0, opts = {}) {
    const B = this.bucket(bucket);
    const M = _m.copy(M0);
    const flip = M.determinant() < 0;
    _n.getNormalMatrix(M);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, n = P.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const keep = opts.keepUV ?? KEEP_UV.has(bucket), us = (opts.uvScale ?? this.uvScale);
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(M); _nv.fromBufferAttribute(N, i).applyMatrix3(_n).normalize();
      pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z; nor[i * 3] = _nv.x; nor[i * 3 + 1] = _nv.y; nor[i * 3 + 2] = _nv.z;
      if (keep && U) { uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); }
      else { // box projection in meters so tiling textures (non-skid, vinyl grain, canvas weave, teak) keep a real-world scale
        const ax = Math.abs(_nv.x), ay = Math.abs(_nv.y), az = Math.abs(_nv.z);
        if (ay >= ax && ay >= az) { uv[i * 2] = _v.x * us; uv[i * 2 + 1] = _v.z * us; } else if (ax >= az) { uv[i * 2] = _v.z * us; uv[i * 2 + 1] = _v.y * us; } else { uv[i * 2] = _v.x * us; uv[i * 2 + 1] = _v.y * us; }
      }
    }
    let idx;
    if (geo.index) { idx = Uint32Array.from(geo.index.array); } else { idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; }
    if (flip) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    B.chunks.push({ pos, nor, uv, idx, slot: slot ?? S.white });
    B.verts += n; B.idx += idx.length; this.tris += idx.length / 3;
    geo.dispose();
    return this;
  }

  // ---- primitives (sizes in meters; rx/ry/rz Euler 'YXZ')
  box(bucket, slot, sx, sy, sz, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(bucket, slot, () => new THREE.BoxGeometry(sx, sy, sz), mat4(x, y, z, rx, ry, rz)); }
  // rounded box: r = edge radius
  rbox(bucket, slot, sx, sy, sz, r, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 1) {
    r = Math.min(r, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4);
    return this.add(bucket, slot, () => (r > 0.002 ? new RoundedBoxGeometry(sx, sy, sz, seg, r) : new THREE.BoxGeometry(sx, sy, sz)), mat4(x, y, z, rx, ry, rz));
  }
  // cylinder along local Y (r1 = top radius, r2 = bottom radius)
  cyl(bucket, slot, r1, r2, h, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 14, open = false) { return this.add(bucket, slot, () => new THREE.CylinderGeometry(r1, r2, h, seg, 1, open), mat4(x, y, z, rx, ry, rz)); }
  sphere(bucket, slot, r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 14) { return this.add(bucket, slot, () => new THREE.SphereGeometry(r, seg, Math.max(6, (seg * 0.6) | 0)), mat4(x, y, z, 0, 0, 0, sx, sy, sz)); }
  torus(bucket, slot, R, r, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 24, tseg = 8, arc = Math.PI * 2) { return this.add(bucket, slot, () => new THREE.TorusGeometry(R, r, tseg, seg, arc), mat4(x, y, z, rx, ry, rz)); }
  // straight rod between two points
  rod(bucket, slot, a, b, r, seg = 8) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length(); if (L < 1e-5) return this;
    const m = new THREE.Matrix4().compose(A.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1));
    return this.add(bucket, slot, () => new THREE.CylinderGeometry(r, r, L, seg, 1, false), m);
  }
  // bent tube through points (smooth corners). pts = [[x,y,z], ...]; tension 0 = sharp, 0.5 = flowing
  tube(bucket, slot, pts, r, o = {}) {
    if (pts.length < 2) return this;
    if (pts.length === 2) return this.rod(bucket, slot, pts[0], pts[1], r, o.seg || 8);
    return this.add(bucket, slot, () => { const P = (o.fillet ? filletPath(pts, o.fillet) : pts).map((p) => new THREE.Vector3(...p));
      const curve = new THREE.CatmullRomCurve3(P, !!o.closed, 'catmullrom', o.tension ?? (o.fillet ? 0.05 : 0.35));
      return new THREE.TubeGeometry(curve, o.steps || Math.max(8, P.length * (o.per || 4)), r, o.seg || 7, !!o.closed); });
  }
  // surface of revolution about local Y. profile = [[radius, y], ...] bottom -> top
  lathe(bucket, slot, profile, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 20) { return this.add(bucket, slot, () => new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg), mat4(x, y, z, rx, ry, rz)); }
  // extruded 2D outline. pts = [[x, y], ...] (counter-clockwise), extruded along local +Z by depth, optional bevel
  extrude(bucket, slot, pts, depth, m = null, o = {}) {
    return this.add(bucket, slot, () => { const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
      for (const h of o.holes || []) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
      return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!o.bevel, bevelThickness: o.bevel || 0, bevelSize: o.bevel || 0, bevelSegments: o.bevelSeg || 2, curveSegments: o.curve || 8 }); }, m);
  }
  // flat plate from a plan outline [[x, z], ...] at height y (top surface), thickness t (0 = single sided, faces up)
  plate(bucket, slot, outline, y, t = 0.02, o = {}) {
    const mk = () => { const sh = new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], -p[1])));
      for (const h of o.holes || []) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], -p[1]))));
      return t > 0 ? new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 6 }) : new THREE.ShapeGeometry(sh, 6); };
    // shape is in XY (y = -z); rotate so it lies in XZ facing up, top at y
    return this.add(bucket, slot, mk, new THREE.Matrix4().makeTranslation(0, y, 0).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, 0, t > 0 ? -t : 0)));
  }
  // Lofted skin through rings. rings = [[ [x,y,z], ... ], ...] all with the same point count.
  //   o.closed  ring is a closed loop          o.capA / o.capB  fan caps on the first / last ring
  //   o.crease  [pointIndex, ...] hard edges running along the loft        o.creaseRings [ringIndex, ...] hard edges across
  //   o.uv      (ringIndex, pointIndex, point) -> [u, v]   (use with keepUV buckets)
  //   o.flip    reverse the facing
  loft(bucket, slot, rings, o = {}) {
    const R = rings.length, Nn = rings[0].length; if (R < 2 || Nn < 2) return this;
    this.add(bucket, slot, () => this._loftGeo(rings, o), o.m || null, { keepUV: !!o.uv || undefined, uvScale: o.uvScale });
    for (const [flag, ring, rev] of [[o.capA, rings[0], false], [o.capB, rings[R - 1], true]]) if (flag) this.fan(bucket, slot, ring, rev !== !!o.flip, o);
    return this;
  }
  _loftGeo(rings, o) {
    const R = rings.length, Nn = rings[0].length;
    const crease = new Set(o.crease || []), creaseR = new Set(o.creaseRings || []);
    // column / row maps: creased columns and rows are duplicated so normals split there
    const cols = []; for (let j = 0; j < Nn; j++) { cols.push(j); if (crease.has(j) && j > 0 && (j < Nn - 1 || o.closed)) cols.push(j); }
    const rows = []; for (let i = 0; i < R; i++) { rows.push(i); if (creaseR.has(i) && i > 0 && i < R - 1) rows.push(i); }
    const C = cols.length, Rr = rows.length, pos = new Float32Array(Rr * C * 3), uv = new Float32Array(Rr * C * 2);
    for (let a = 0; a < Rr; a++) for (let b = 0; b < C; b++) {
      const p = rings[rows[a]][cols[b]], k = (a * C + b);
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      if (o.uv) { const t = o.uv(rows[a], cols[b], p); uv[k * 2] = t[0]; uv[k * 2 + 1] = t[1]; }
    }
    const idx = [];
    const quad = (a, b, c, d) => { if (o.flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); };
    for (let a = 0; a < Rr - 1; a++) { if (rows[a] === rows[a + 1]) continue;
      for (let b = 0; b < C - 1; b++) { if (cols[b] === cols[b + 1]) continue; quad(a * C + b, a * C + b + 1, (a + 1) * C + b, (a + 1) * C + b + 1); }
      if (o.closed) quad(a * C + C - 1, a * C, (a + 1) * C + C - 1, (a + 1) * C);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // triangle fan over a (roughly planar, convex-ish) ring of points
  fan(bucket, slot, ring, rev = false, o = {}) {
    const n = ring.length, c = [0, 0, 0]; for (const p of ring) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
    const pos = [c[0], c[1], c[2]], idx = []; for (const p of ring) pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < n; i++) { const a = 1 + i, b = 1 + ((i + 1) % n); if (i === n - 1 && !o.closed && !o.capClosed) break; if (rev) idx.push(0, b, a); else idx.push(0, a, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (o.uv) { const uv = [0.5, 0.5]; ring.forEach((p, j) => { const t = o.uv(-1, j, p); uv.push(t[0], t[1]); }); const t0 = o.uv(-1, -1, c); uv[0] = t0[0]; uv[1] = t0[1]; g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); }
    return this.add(bucket, slot, g, o.m || null, { keepUV: !!o.uv || undefined });
  }
  // textured quad (screens, decals). Corners a,b,c,d = bottom-left, bottom-right, top-right, top-left; uv rect [u0, v0, u1, v1]
  quad(bucket, slot, a, b, c, d, uvRect = [0, 0, 1, 1]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
    const [u0, v0, u1, v1] = uvRect; g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    return this.add(bucket, slot, g, null, { keepUV: true });
  }
  // named anchor in boat space (helm, seats, cleats, lights ...). Stored transformed by the current stack.
  anchor(name, x, y, z, extra = {}) { _v.set(x, y, z).applyMatrix4(this.M); (this.anchors[name] ||= []).push({ x: _v.x, y: _v.y, z: _v.z, ...extra }); return this; }

  // ---- output
  geometries() {
    this.flush();
    const out = {};
    for (const name in this.buckets) {
      const B = this.buckets[name]; if (!B.verts) continue;
      const pos = new Float32Array(B.verts * 3), nor = new Float32Array(B.verts * 3), uv = new Float32Array(B.verts * 2), uv1 = new Float32Array(B.verts * 2);
      const idx = B.verts > 65535 ? new Uint32Array(B.idx) : new Uint16Array(B.idx);
      let vo = 0, io = 0;
      for (const c of B.chunks) {
        pos.set(c.pos, vo * 3); nor.set(c.nor, vo * 3); uv.set(c.uv, vo * 2);
        const u = (c.slot + 0.5) / PALETTE_N, n = c.pos.length / 3;
        for (let i = 0; i < n; i++) { uv1[(vo + i) * 2] = u; uv1[(vo + i) * 2 + 1] = 0.5; }
        for (let i = 0; i < c.idx.length; i++) idx[io + i] = c.idx[i] + vo;
        vo += n; io += c.idx.length;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
      g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.computeBoundingBox();
      out[name] = g;
    }
    return out;
  }
  // mats: { bucketName: Material }. Returns a Group; child parts become named child Groups at their pivots.
  toObject3D(mats, shadows = true) {
    const root = new THREE.Group(); root.name = this.name; root.position.copy(this.pivot); root.rotation.copy(this.rot);
    const G = this.geometries();
    for (const name in G) {
      const me = new THREE.Mesh(G[name], mats[name] || mats.matte); me.name = name;
      me.castShadow = shadows && !NO_SHADOW.has(name); me.receiveShadow = name !== 'glass' && name !== 'decal';
      if (name === 'decal') me.renderOrder = 2; if (name === 'glass') me.renderOrder = 3;
      root.add(me);
    }
    root.userData.parts = {};
    for (const p of this.parts) { const o = p.toObject3D(mats, shadows); root.add(o); root.userData.parts[p.name] = o; Object.assign(root.userData.parts, prefixed(p.name, o.userData.parts)); }
    return root;
  }
  // all vertices of the given buckets (plus parts) in boat space: used for colliders, bounds and the static marina variants
  countTris() { this.flush(); let t = this.tris; for (const p of this.parts) t += p.countTris(); return t; }
}
function prefixed(prefix, parts) { const o = {}; for (const k in parts || {}) o[prefix + '/' + k] = parts[k]; return o; }
// average the normals across the seam of a closed loft so there is no visible line
function weldSeam(g, rows, cols) {
  const n = g.attributes.normal;
  // the closing quads share positions between column C-1 and column 0 only through indices, so normals are already
  // accumulated per vertex; nothing to weld unless a ring repeats its first point (callers should not repeat it)
  return n;
}
// insert extra points around each interior corner so a Catmull-Rom tube bends with radius ~r instead of overshooting
export function filletPath(pts, r) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i - 1]), b = new THREE.Vector3(...pts[i]), c = new THREE.Vector3(...pts[i + 1]);
    const d1 = a.clone().sub(b), d2 = c.clone().sub(b), l1 = d1.length(), l2 = d2.length(); d1.normalize(); d2.normalize();
    const k = Math.min(r, l1 * 0.45, l2 * 0.45);
    const p1 = b.clone().addScaledVector(d1, k), p2 = b.clone().addScaledVector(d2, k), mid = b.clone().multiplyScalar(0.5).addScaledVector(p1, 0.25).addScaledVector(p2, 0.25);
    out.push([p1.x, p1.y, p1.z], [mid.x, mid.y, mid.z], [p2.x, p2.y, p2.z]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// ring helpers for loft()
export function ringRect(w, h, r, y0, z, n = 4) { // rounded rectangle in the XY plane at z, centered on x, bottom at y0
  const pts = [], hw = w / 2, rr = Math.min(r, hw, h / 2);
  const corners = [[hw - rr, y0 + rr, -Math.PI / 2], [hw - rr, y0 + h - rr, 0], [-hw + rr, y0 + h - rr, Math.PI / 2], [-hw + rr, y0 + rr, Math.PI]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z]); }
  return pts;
}
export function ringEllipse(rx, ry, cx, cy, z, n = 16) { const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z]); } return pts; }
// superellipse ring in the XZ plane at height y (plan view), exponent e (2 = ellipse, higher = boxier)
export function ringPlan(hw, hl, y, e = 2.6, n = 24, cx = 0, cz = 0) { const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); pts.push([cx + Math.sign(c) * Math.abs(c) ** (2 / e) * hw, y, cz + Math.sign(s) * Math.abs(s) ** (2 / e) * hl]); } return pts; }

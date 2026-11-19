// Interiors engine kit: merged static geometry builder.
// Everything static in an interior (shell, fixtures, clutter) is appended to a Geo, grouped by material, and becomes one mesh per
// material. Every vertex carries three baked-light attributes (bk0 main lights, bk1 accent lights, bk2 daylight) filled by bake.js.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _nn = new THREE.Vector3();
const IDENT = new THREE.Matrix4();
export function M4(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, out = new THREE.Matrix4()) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); return out.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)); }

const UNIT = new Map();
const unit = (key, make) => { let g = UNIT.get(key); if (!g) UNIT.set(key, g = make()); return g; };
export const unitBox = () => unit('box', () => new THREE.BoxGeometry(1, 1, 1));
export const unitCyl = (seg = 12, r2 = 1, open = false) => unit(`cyl${seg}:${r2}:${open}`, () => new THREE.CylinderGeometry(r2, 1, 1, seg, 1, open));
export const unitSphere = (seg = 10) => unit('sph' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.7))));
export const unitPlane = () => unit('pl', () => new THREE.PlaneGeometry(1, 1));

export class Geo {
  constructor() { this.parts = new Map(); this.stack = [new THREE.Matrix4()]; this.cur = this.stack[0]; }
  // ---- local frames: g.at(x, z, ry, () => { ...build in the fixture's own frame... }, y)
  push(m) { const c = this.cur.clone().multiply(m); this.stack.push(c); this.cur = c; return this; }
  pop() { this.stack.pop(); this.cur = this.stack[this.stack.length - 1]; return this; }
  at(x, z, ry, fn, y = 0) { this.push(M4(x, y, z, ry)); try { fn(); } finally { this.pop(); } return this; }
  // store-local position of a point given in the current frame
  local(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.cur); }
  yaw() { const e = this.cur.elements; return Math.atan2(e[8], e[10]); }
  _part(mat) { let p = this.parts.get(mat); if (!p) this.parts.set(mat, p = { pos: [], nor: [], uv: [], idx: [], n: 0 }); return p; }

  // Append a BufferGeometry. opt.uvRect = [u0, v0, u1, v1] maps the geometry's 0..1 uvs into an atlas cell;
  // otherwise materials with userData.uvw (meters per texture tile) get world-projected uvs so textures keep real scale.
  add(mat, geo, m4, opt) {
    const p = this._part(mat), M = _m.multiplyMatrices(this.cur, m4 || IDENT); _n3.getNormalMatrix(M);
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, I = geo.index, base = p.n;
    const r = opt && opt.uvRect, uvw = r ? 0 : (opt && opt.uvw != null ? opt.uvw : mat.userData.uvw || 0), flip = M.determinant() < 0;
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i).applyMatrix4(M); _nn.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
      p.pos.push(_p.x, _p.y, _p.z); p.nor.push(_nn.x, _nn.y, _nn.z);
      if (r) p.uv.push(r[0] + U.getX(i) * (r[2] - r[0]), r[1] + U.getY(i) * (r[3] - r[1]));
      else if (uvw) { const ax = Math.abs(_nn.x), ay = Math.abs(_nn.y), az = Math.abs(_nn.z); if (ay > 0.7) p.uv.push(_p.x / uvw, _p.z / uvw); else if (ax > az) p.uv.push(_p.z / uvw, _p.y / uvw); else p.uv.push(_p.x / uvw, _p.y / uvw); }
      else p.uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
    }
    const n = I ? I.count : P.count;
    for (let i = 0; i < n; i += 3) { const a = base + (I ? I.getX(i) : i), b = base + (I ? I.getX(i + 1) : i + 1), c = base + (I ? I.getX(i + 2) : i + 2); if (flip) p.idx.push(a, c, b); else p.idx.push(a, b, c); }
    p.n += P.count; return this;
  }
  // ---- primitives (centered at x, y, z unless noted). o: { ry, rx, rz, uvRect, uvw }
  box(mat, x, y, z, sx, sy, sz, o) { return this.add(mat, unitBox(), M4(x, y, z, o?.ry || 0, sx, sy, sz, o?.rx || 0, o?.rz || 0), o); }
  boxB(mat, x, y0, z, sx, sy, sz, o) { return this.box(mat, x, y0 + sy / 2, z, sx, sy, sz, o); } // base at y0
  cyl(mat, x, y, z, r, h, o) { return this.add(mat, unitCyl(o?.seg || 12, o?.r2 != null ? o.r2 / r : 1, !!o?.open), M4(x, y, z, o?.ry || 0, r, h, r, o?.rx || 0, o?.rz || 0), o); }
  cylB(mat, x, y0, z, r, h, o) { return this.cyl(mat, x, y0 + h / 2, z, r, h, o); }
  sphere(mat, x, y, z, r, o) { return this.add(mat, unitSphere(o?.seg || 10), M4(x, y, z, o?.ry || 0, r * (o?.sx || 1), r * (o?.sy || 1), r * (o?.sz || 1)), o); }
  // vertical quad facing +Z (rx = -PI/2 lays it flat facing up). step > 0 tessellates for smoother baked light.
  plane(mat, x, y, z, w, h, o) {
    const st = o?.step || 0, g = st ? new THREE.PlaneGeometry(1, 1, Math.max(1, Math.ceil(w / st)), Math.max(1, Math.ceil(h / st))) : unitPlane();
    return this.add(mat, g, M4(x, y, z, o?.ry || 0, w, h, 1, o?.rx || 0, o?.rz || 0), o);
  }
  // surface of revolution from a profile [[r, y], ...] (bottom to top), base at y
  lathe(mat, pts, x, y, z, o) { const g = new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(Math.max(0.0001, q[0]), q[1])), o?.seg || 12); return this.add(mat, g, M4(x, y, z, o?.ry || 0, o?.s || 1, o?.s || 1, o?.s || 1, o?.rx || 0, o?.rz || 0), o); }
  // extruded 2D outline [[x, y], ...] (counter-clockwise), depth along +Z, centered in z
  extrude(mat, pts, depth, x, y, z, o) {
    const sh = new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0], q[1]))); const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: o?.curve || 6 }); g.translate(0, 0, -depth / 2);
    return this.add(mat, g, M4(x, y, z, o?.ry || 0, 1, 1, 1, o?.rx || 0, o?.rz || 0), o);
  }
  // tube along a polyline [[x, y, z], ...] (cables, rails, neon)
  tube(mat, pts, r, o) { const c = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])), false, 'catmullrom', o?.tension ?? 0.3); return this.add(mat, new THREE.TubeGeometry(c, o?.segs || pts.length * 5, r, o?.seg || 6, false), null, o); }

  vertexCount() { let n = 0; for (const p of this.parts.values()) n += p.n; return n; }
  // Build one mesh per material. Returns { meshes, bake } where bake = { pos, nor, apply(bk0, bk1, bk2) } covers every baked part.
  build(group, o = {}) { const it = this.buildIter(group, o); let r = it.next(); while (!r.done) r = it.next(); return r.value; }
  // r7: same, as a generator that yields after each material's mesh (the build of a big store was one 300-600 ms step)
  *buildIter(group, o = {}) {
    const meshes = [], ranges = []; let total = 0, t0 = performance.now();
    for (const [mat, p] of this.parts) {
      if (o.slice && performance.now() - t0 > o.slice) { yield; t0 = performance.now(); }
      if (!p.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
      g.setIndex(p.n > 65535 ? new THREE.Uint32BufferAttribute(p.idx, 1) : new THREE.Uint16BufferAttribute(p.idx, 1));
      if (mat.userData.baked) { for (const k of ['bk0', 'bk1', 'bk2']) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(p.n * 3), 3)); ranges.push({ g, start: total, n: p.n }); total += p.n; }
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = !!o.cast && !mat.transparent; mesh.receiveShadow = false; mesh.matrixAutoUpdate = false;
      if (mat.userData.order) mesh.renderOrder = mat.userData.order;
      group.add(mesh); meshes.push(mesh);
    }
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    for (const r of ranges) { pos.set(r.g.attributes.position.array, r.start * 3); nor.set(r.g.attributes.normal.array, r.start * 3); }
    const apply = (bk0, bk1, bk2, off = 0) => { for (const r of ranges) { const a = (r.start + off) * 3, b = a + r.n * 3; r.g.attributes.bk0.array.set(bk0.subarray(a, b)); r.g.attributes.bk1.array.set(bk1.subarray(a, b)); r.g.attributes.bk2.array.set(bk2.subarray(a, b)); r.g.attributes.bk0.needsUpdate = r.g.attributes.bk1.needsUpdate = r.g.attributes.bk2.needsUpdate = true; } };
    this.parts.clear();
    return { meshes, bake: { pos, nor, count: total, apply } };
  }
}

// Trimming: cut a tessellated B-spline half skin into panels, glass, lamp lenses and openings along smooth curves
// drawn in orthographic views (like tape drawings: side, top, front) or along the skin's own feature lines ('rz').
// Cuts are exact (new vertices are solved on the true surface), panel shut lines are real V-grooves with depth,
// openings return their rim so ducts, lips, jambs and lamp housings can be extruded from them.  No z-fighting anywhere:
// nothing is laid on top of the skin, the skin itself is divided.
import * as THREE from 'three';

export const RS = 0.1; // 'rz' view: one ring step counts as 10 cm, so corner radii behave like in the other views

/** Compile { view, shape, mask } into f(x, y, z, u, v). */
export function viewFn(skin, view, shape, mask) {
  let f;
  if (typeof view === 'function') f = view;
  else if (view === 'side') f = (x, y, z) => shape(z, y);
  else if (view === 'top') f = (x, y, z) => shape(x, z);
  else if (view === 'front') f = (x, y, z) => shape(x, y);
  else if (view === 'rz') f = (x, y, z, u) => shape(skin.ringOf(u) * RS, z);
  else throw new Error('unknown view ' + view);
  if (!mask) return f;
  return (x, y, z, u, v) => (mask(x, y, z, u, v) ? f(x, y, z, u, v) : 9);
}

export class TriMesh {
  /** skin from makeSkin(), g from skin.grid(). lod 0 = full detail (grooves, walls). */
  constructor(skin, g, lod = 0) {
    this.skin = skin; this.lod = lod;
    this.P = Array.from(g.P); this.N = Array.from(g.N); this.UV = Array.from(g.UV); this.M = Array.from(g.M);
    const n = this.P.length / 3;
    this.groove = new Float32Array(n * 2); this.nVert = n; // groove depth per vertex (grown on demand)
    this.ta = []; this.tb = []; this.tc = []; this.mat = []; this.part = []; this.dead = [];
    const { nU, nV } = g;
    for (let j = 0; j < nV; j++) for (let i = 0; i < nU; i++) {
      const q = j * (nU + 1) + i;
      this._tri(q, q + 1, q + nU + 1, 0, 0); this._tri(q + 1, q + nU + 2, q + nU + 1, 0, 0);
    }
    this.mats = ['paint']; this.parts = ['body'];
    this.segs = {};   // region id -> flat [i, j, i, j, ...] rim edges (interior of the region on the left, seen from outside)
    this.extra = [];  // extra triangles (walls, ducts, inner skins): { part, mat, pos, nor, uv }
    this._p = [0, 0, 0]; this._n = [0, 0, 0];
  }
  _tri(a, b, c, m, p) { this.ta.push(a); this.tb.push(b); this.tc.push(c); this.mat.push(m); this.part.push(p); this.dead.push(0); return this.ta.length - 1; }
  matId(name) { let i = this.mats.indexOf(name); if (i < 0) { this.mats.push(name); i = this.mats.length - 1; } return i; }
  partId(name) { let i = this.parts.indexOf(name); if (i < 0) { this.parts.push(name); i = this.parts.length - 1; } return i; }
  _addVert(i, j, t) {
    const { P, N, UV, M, skin } = this;
    const u = UV[i * 2] + (UV[j * 2] - UV[i * 2]) * t, v = UV[i * 2 + 1] + (UV[j * 2 + 1] - UV[i * 2 + 1]) * t;
    const p = skin.point(u, v, this._p), n = skin.normal(u, v, this._n);
    if (P[i * 3] === 0 && P[j * 3] === 0) { p[0] = 0; n[0] = 0; const l = Math.hypot(n[1], n[2]) || 1; n[1] /= l; n[2] /= l; }
    P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); UV.push(u, v);
    M.push(M[i * 2] + (M[j * 2] - M[i * 2]) * t, M[i * 2 + 1] + (M[j * 2 + 1] - M[i * 2 + 1]) * t);
    const k = this.nVert++;
    if (k >= this.groove.length) { const g = new Float32Array(this.groove.length * 2); g.set(this.groove); this.groove = g; }
    return k;
  }
  _cut(a, b, L, f, F, cache) {
    const i = Math.min(a, b), j = Math.max(a, b), key = i * 4194304 + j;
    let k = cache.get(key); if (k !== undefined) return k;
    const { UV, skin } = this;
    let t0 = 0, f0 = F[i] - L, t1 = 1, f1 = F[j] - L, t = f0 / (f0 - f1);
    for (let it = 0; it < 3; it++) {
      const u = UV[i * 2] + (UV[j * 2] - UV[i * 2]) * t, v = UV[i * 2 + 1] + (UV[j * 2 + 1] - UV[i * 2 + 1]) * t;
      const p = skin.point(u, v, this._p), ft = f(p[0], p[1], p[2], u, v) - L;
      if (Math.abs(ft) < 3e-5) break;
      if ((ft < 0) === (f0 < 0)) { t0 = t; f0 = ft; } else { t1 = t; f1 = ft; }
      t = t0 + (t1 - t0) * (f0 / (f0 - f1));
    }
    k = this._addVert(i, j, Math.max(0.001, Math.min(0.999, t)));
    F[k] = L; cache.set(key, k);
    return k;
  }
  /**
   * Low-level: split candidate triangles along the iso-lines f = L for each level and call assign(t, band) for every
   * resulting triangle (band = number of levels below its centroid value).  Returns { F, created: [Set per level] }.
   */
  split(f, levels, where, assign) {
    const { ta, tb, tc, P, UV } = this, cand = [], F = [];
    for (let t = 0, n = ta.length; t < n; t++) if (!this.dead[t] && (!where || where(this.mats[this.mat[t]], this.parts[this.part[t]], t))) cand.push(t);
    const val = (i) => (F[i] !== undefined ? F[i] : (F[i] = f(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], UV[i * 2], UV[i * 2 + 1])));
    const created = [];
    for (const L of levels) {
      const cache = new Map();
      for (let ci = 0, n = cand.length; ci < n; ci++) {
        const t = cand[ci], a = ta[t], b = tb[t], c = tc[t];
        const sa = val(a) >= L, sb = val(b) >= L, sc = val(c) >= L;
        if (sa === sb && sb === sc) continue;
        let A, B, Cc;
        if (sa !== sb && sa !== sc) { A = a; B = b; Cc = c; } else if (sb !== sa && sb !== sc) { A = b; B = c; Cc = a; } else { A = c; B = a; Cc = b; }
        const e1 = this._cut(A, B, L, f, F, cache), e2 = this._cut(A, Cc, L, f, F, cache);
        ta[t] = A; tb[t] = e1; tc[t] = e2;
        cand.push(this._tri(e1, B, Cc, this.mat[t], this.part[t]), this._tri(e1, Cc, e2, this.mat[t], this.part[t]));
      }
      created.push(new Set(cache.values()));
    }
    for (const t of cand) {
      const m = (val(ta[t]) + val(tb[t]) + val(tc[t])) / 3;
      let band = 0; for (const L of levels) if (m > L) band++;
      assign(t, band);
    }
    return { F, created };
  }
  _rim(id, set, pred) {
    const s = (this.segs[id] ||= []), { ta, tb, tc } = this;
    for (let t = 0, n = ta.length; t < n; t++) {
      if (!pred(t)) continue;
      const a = ta[t], b = tb[t], c = tc[t];
      if (set.has(a) && set.has(b)) s.push(a, b);
      if (set.has(b) && set.has(c)) s.push(b, c);
      if (set.has(c) && set.has(a)) s.push(c, a);
    }
  }
  /**
   * Apply a region.  r = { id, view, shape, mask, kind, ... }
   *  kind 'mat'   : inside becomes material r.mat; optional r.border = { w, mat } band just inside the outline (glass frit, trim ring); r.rim = true keeps the outline
   *  kind 'panel' : inside becomes part r.id (r.part to override), with a V-groove shut line (r.gap half-width, r.depth) at lod 0.  Cut only out of 'body' unless r.from is given.
   *  kind 'hole'  : inside is removed; the rim is kept in segs[id]
   *  r.over = [material names] restricts the cut to those materials;  r.from = [part names] restricts to those parts.
   */
  apply(r) {
    if (r.lod != null && this.lod > r.lod) return;
    const f = viewFn(this.skin, r.view, r.shape, r.mask);
    const over = r.over, from = r.from || (r.kind === 'panel' ? ['body'] : null);
    const where = (m, p) => (!over || over.includes(m)) && (!from || from.includes(p));
    if (r.kind === 'mat') {
      const mid = this.matId(r.mat), bid = r.border ? this.matId(r.border.mat) : -1;
      const levels = r.border ? [-r.border.w, 0] : [0];
      const marks = new Set();
      const res = this.split(f, levels, where, (t, band) => { if (band === 0) { this.mat[t] = mid; marks.add(t); } else if (r.border && band === 1) { this.mat[t] = bid; marks.add(t); } });
      if (r.rim) this._rim(r.id, res.created[levels.length - 1], (t) => marks.has(t));
    } else if (r.kind === 'panel') {
      const pid = this.partId(r.part || r.id), gid = this.matId('gap');
      if (this.lod > 0 || r.gap === 0) { this.split(f, [0], where, (t, band) => { if (band === 0) this.part[t] = pid; }); return; }
      const g = r.gap ?? 0.0028, inner = new Set();
      const res = this.split(f, [-g, 0, g], where, (t, band) => {
        if (band === 0) this.part[t] = pid;
        else if (band === 1) { this.part[t] = pid; this.mat[t] = gid; inner.add(t); }
        else if (band === 2) this.mat[t] = gid;
      });
      const d = r.depth ?? 0.009;
      for (const k of res.created[1]) this.groove[k] = Math.max(this.groove[k], d);
      this._rim(r.id, res.created[1], (t) => inner.has(t));
    } else if (r.kind === 'hole') {
      const gone = new Set();
      const res = this.split(f, [0], where, (t, band) => { if (band === 0) { this.dead[t] = 1; gone.add(t); } });
      this._rim(r.id, res.created[0], (t) => gone.has(t));
    } else throw new Error('unknown region kind ' + r.kind);
  }
  /** Vertex position including the shut-line groove push. */
  _pos(i, out) {
    const d = this.groove[i], { P, N } = this;
    out[0] = P[i * 3] - N[i * 3] * d; out[1] = P[i * 3 + 1] - N[i * 3 + 1] * d; out[2] = P[i * 3 + 2] - N[i * 3 + 2] * d;
    return out;
  }
  addExtra(part, mat, pos, nor, uv) { this.extra.push({ part, mat, pos, nor, uv: uv || new Array((pos.length / 3) * 2).fill(0) }); }
  /**
   * Extrude the rim of a region into a wall (duct, wheel-arch lip, door jamb, lamp bucket).
   * o = { part, mat, depth, dir: 'normal' | [x,y,z], toX: number (extrude sideways to the plane x = toX instead), taper: 0..1 (shrink the far loop toward its center),
   *       cap: { mat, part } closes the far end, push: start the wall this far along the direction (m) }
   * Returns the far-loop centroid [x, y, z] (or null if the region has no rim).
   */
  walls(id, o) {
    const s = this.segs[id]; if (!s || !s.length) return null;
    const { N } = this, pa = [0, 0, 0];
    const far = new Map(), near = new Map(), wn = new Map();
    const ctr = [0, 0, 0]; let cn = 0;
    const idxs = new Set(s);
    for (const i of idxs) { this._pos(i, pa); ctr[0] += pa[0]; ctr[1] += pa[1]; ctr[2] += pa[2]; cn++; }
    ctr[0] /= cn; ctr[1] /= cn; ctr[2] /= cn;
    for (const i of idxs) {
      this._pos(i, pa);
      let dx, dy, dz;
      if (o.toX != null) { dx = o.toX - pa[0]; dy = 0; dz = 0; }
      else if (Array.isArray(o.dir)) { dx = o.dir[0] * o.depth; dy = o.dir[1] * o.depth; dz = o.dir[2] * o.depth; }
      else { dx = -N[i * 3] * o.depth; dy = -N[i * 3 + 1] * o.depth; dz = -N[i * 3 + 2] * o.depth; }
      const st = o.push ? o.push / (Math.hypot(dx, dy, dz) || 1) : 0;
      near.set(i, [pa[0] + dx * st, pa[1] + dy * st, pa[2] + dz * st]);
      let fx = pa[0] + dx, fy = pa[1] + dy, fz = pa[2] + dz;
      if (o.taper) { const cx = ctr[0] + dx, cy = ctr[1] + dy, cz = ctr[2] + dz; fx += (cx - fx) * o.taper; fy += (cy - fy) * o.taper; fz += (cz - fz) * o.taper; }
      far.set(i, [fx, fy, fz]); wn.set(i, [0, 0, 0]);
    }
    const quads = [];
    for (let k = 0; k < s.length; k += 2) {
      const i = s[k], j = s[k + 1], a = near.get(i), b = near.get(j), b2 = far.get(j), a2 = far.get(i);
      const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], dx = a2[0] - a[0], dy = a2[1] - a[1], dz = a2[2] - a[2];
      const nx = ey * dz - ez * dy, ny = ez * dx - ex * dz, nz = ex * dy - ey * dx;
      for (const q of [i, j]) { const w = wn.get(q); w[0] += nx; w[1] += ny; w[2] += nz; }
      quads.push(i, j);
    }
    for (const w of wn.values()) { const l = Math.hypot(w[0], w[1], w[2]) || 1; w[0] /= l; w[1] /= l; w[2] /= l; }
    const pos = [], nor = [], uv = [];
    const put = (p, n, u, v) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uv.push(u, v); };
    for (let k = 0; k < quads.length; k += 2) {
      const i = quads[k], j = quads[k + 1], a = near.get(i), b = near.get(j), b2 = far.get(j), a2 = far.get(i), ni = wn.get(i), nj = wn.get(j);
      const dl = Math.hypot(a2[0] - a[0], a2[1] - a[1], a2[2] - a[2]);
      const ua = a[2] + a[1], ub = b[2] + b[1];
      put(a, ni, ua, 0); put(b, nj, ub, 0); put(b2, nj, ub, dl);
      put(a, ni, ua, 0); put(b2, nj, ub, dl); put(a2, ni, ua, dl);
    }
    this.addExtra(o.part || 'body', o.mat, pos, nor, uv);
    let fc = [0, 0, 0]; for (const p of far.values()) { fc[0] += p[0]; fc[1] += p[1]; fc[2] += p[2]; } fc = fc.map((x) => x / far.size);
    if (o.cap) {
      const cp = [], cnr = [], cuv = [];
      for (let k = 0; k < s.length; k += 2) {
        const a = far.get(s[k]), b = far.get(s[k + 1]);
        const nx = (a[1] - fc[1]) * (b[2] - fc[2]) - (a[2] - fc[2]) * (b[1] - fc[1]), ny = (a[2] - fc[2]) * (b[0] - fc[0]) - (a[0] - fc[0]) * (b[2] - fc[2]), nz = (a[0] - fc[0]) * (b[1] - fc[1]) - (a[1] - fc[1]) * (b[0] - fc[0]);
        const l = Math.hypot(nx, ny, nz) || 1;
        for (const p of [fc, a, b]) { cp.push(p[0], p[1], p[2]); cnr.push(nx / l, ny / l, nz / l); cuv.push(p[2] + p[0], p[1]); }
      }
      this.addExtra(o.cap.part || o.part || 'body', o.cap.mat, cp, cnr, cuv);
    }
    return fc;
  }
  /** Ordered rim loops of a region as arrays of [x, y, z] (for sweeping seals, light guides, trims along an outline). */
  loops(id) {
    const s = this.segs[id]; if (!s) return [];
    const next = new Map(); for (let k = 0; k < s.length; k += 2) next.set(s[k], s[k + 1]);
    const out = [], seen = new Set(), p = [0, 0, 0];
    for (const start of next.keys()) {
      if (seen.has(start)) continue;
      const loop = []; let i = start, guard = 0;
      while (i !== undefined && !seen.has(i) && guard++ < 100000) { seen.add(i); this._pos(i, p); loop.push([p[0], p[1], p[2], this.N[i * 3], this.N[i * 3 + 1], this.N[i * 3 + 2]]); i = next.get(i); }
      if (loop.length > 2) out.push(loop);
    }
    return out;
  }
  /** Inner skin of a part: its painted surface offset inward by t and turned inside out (panel thickness / headliner / door inner). */
  inner(part, t, mat, o = {}) {
    const pid = this.parts.indexOf(part); if (pid < 0) return;
    const { ta, tb, tc, P, N, M } = this, pos = [], nor = [], uv = [];
    const skip = (o.skip || ['gap']).map((m) => this.mats.indexOf(m));
    const only = o.only ? o.only.map((m) => this.mats.indexOf(m)) : null;
    for (let k = 0; k < ta.length; k++) {
      if (this.dead[k] || this.part[k] !== pid || skip.includes(this.mat[k]) || (only && !only.includes(this.mat[k]))) continue;
      if (o.where && !o.where(P[ta[k] * 3], P[ta[k] * 3 + 1], P[ta[k] * 3 + 2])) continue;
      for (const i of [ta[k], tc[k], tb[k]]) {
        pos.push(P[i * 3] - N[i * 3] * t, P[i * 3 + 1] - N[i * 3 + 1] * t, P[i * 3 + 2] - N[i * 3 + 2] * t);
        nor.push(-N[i * 3], -N[i * 3 + 1], -N[i * 3 + 2]); uv.push(M[i * 2], M[i * 2 + 1]);
      }
    }
    this.addExtra(o.part || part, mat, pos, nor, uv);
  }
  /**
   * Final geometry: { partName: { matName: BufferGeometry } }.  Parts listed in `sided` become nameL (x > 0 half) and nameR (mirrored);
   * all others contain both halves.  uv = metric coordinates (meters).
   */
  build(sided = []) {
    const { ta, tb, tc, P, N, M, mats, parts } = this, buckets = new Map();
    const bucket = (part, mat) => { const k = part + '|' + mat; let b = buckets.get(k); if (!b) { b = { part, mat, pos: [], nor: [], uv: [] }; buckets.set(k, b); } return b; };
    const gapId = mats.indexOf('gap'), a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    for (let t = 0; t < ta.length; t++) {
      if (this.dead[t]) continue;
      const B = bucket(parts[this.part[t]], mats[this.mat[t]]);
      this._pos(ta[t], a); this._pos(tb[t], b); this._pos(tc[t], c);
      B.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      if (this.mat[t] === gapId) {
        let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        B.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      } else for (const i of [ta[t], tb[t], tc[t]]) B.nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      for (const i of [ta[t], tb[t], tc[t]]) B.uv.push(M[i * 2], M[i * 2 + 1]);
    }
    for (const e of this.extra) { const B = bucket(e.part, e.mat); for (const x of e.pos) B.pos.push(x); for (const x of e.nor) B.nor.push(x); for (const x of e.uv) B.uv.push(x); }
    const out = {};
    const emit = (name, mat, pos, nor, uv) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      (out[name] ||= {})[mat] = g;
    };
    const mirrored = (B) => {
      const n = B.pos.length / 3, pos = new Array(n * 3), nor = new Array(n * 3), uv = new Array(n * 2);
      for (let t = 0; t < n; t += 3) for (let k = 0; k < 3; k++) {
        const src = t + (k === 0 ? 0 : k === 1 ? 2 : 1), dst = t + k;
        pos[dst * 3] = -B.pos[src * 3]; pos[dst * 3 + 1] = B.pos[src * 3 + 1]; pos[dst * 3 + 2] = B.pos[src * 3 + 2];
        nor[dst * 3] = -B.nor[src * 3]; nor[dst * 3 + 1] = B.nor[src * 3 + 1]; nor[dst * 3 + 2] = B.nor[src * 3 + 2];
        uv[dst * 2] = B.uv[src * 2]; uv[dst * 2 + 1] = B.uv[src * 2 + 1];
      }
      return { pos, nor, uv };
    };
    for (const B of buckets.values()) {
      if (!B.pos.length) continue;
      const m = mirrored(B);
      if (sided.includes(B.part)) { emit(B.part + 'L', B.mat, B.pos, B.nor, B.uv); emit(B.part + 'R', B.mat, m.pos, m.nor, m.uv); }
      else emit(B.part, B.mat, B.pos.concat(m.pos), B.nor.concat(m.nor), B.uv.concat(m.uv));
    }
    return out;
  }
  triCount() { let n = 0; for (let t = 0; t < this.ta.length; t++) if (!this.dead[t]) n++; for (const e of this.extra) n += e.pos.length / 9; return n * 2; }
}

/** Convex-hull point cloud (both halves) from a coarse grid of the skin, floor-limited so low noses do not act as ramps. */
export function hullPoints(skin, minY = 0.2, nu = 1.2, nv = 0.6) {
  const g = skin.grid(nu, nv), out = [];
  for (let i = 0; i < g.P.length; i += 3) {
    const x = g.P[i], y = Math.max(minY, g.P[i + 1]), z = g.P[i + 2];
    out.push(x, y, z); if (x > 0.01) out.push(-x, y, z);
  }
  return new Float32Array(out);
}

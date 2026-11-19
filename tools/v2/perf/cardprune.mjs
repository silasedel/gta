#!/usr/bin/env node
// r2-perf: leaf-card pruning LOD for library trees (r2-veg's LOD1 candidates). Foliage made of alpha cards cannot be
// simplified by edge collapse (each card is its own little island), so a far level keeps a deterministic subset of the
// cards and scales each kept card about its own centre so the crown's projected coverage stays the same.
// Coverage is checked on 8 side views + 1 top view with a solid-triangle software raster (128 px), LOD0 vs pruned; the
// scale factor is solved per model so the coverage ratio lands within --tol (default 3 %).
// Bark / trunk primitives (material name /bark|trunk|wood|stem|branch/i, or opaque without alpha) are copied untouched.
// Output: <key>_lod1p.glb next to the source (plain, uncompressed; same material names, same textures).
//   node tools/v2/perf/cardprune.mjs --files public/assets/models/vegetation/mangrove.glb,... [--keep 0.45] [--tol 0.03]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, decodePrim, writeGlb, initDraco } from './glbio.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const KEEP = +(o.keep || 0.45),
  TOL = +(o.tol || 0.03),
  RES = 128;
await initDraco();

const BARK = /bark|trunk|wood|stem|branch/i;
function isLeaf(g, prim) {
  const m = g.json.materials?.[prim.material];
  if (!m) return false;
  if (BARK.test(m.name || '')) return false;
  return (
    m.alphaMode === 'MASK' ||
    m.alphaMode === 'BLEND' ||
    /leaf|leaves|frond|foliage|crown|palm|flower|bloom|needle/i.test(m.name || '')
  );
}
// connected components over shared vertex indices (and over identical positions, so cards split on UV seams stay whole)
function components(d) {
  const n = d.count,
    par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const f = (x) => {
    while (par[x] !== x) {
      par[x] = par[par[x]];
      x = par[x];
    }
    return x;
  };
  const u = (x, y) => {
    x = f(x);
    y = f(y);
    if (x !== y) par[y] = x;
  };
  const P = d.attrs.POSITION.data,
    key = new Map();
  for (let i = 0; i < n; i++) {
    const k =
      Math.round(P[i * 3] * 1e4) +
      ',' +
      Math.round(P[i * 3 + 1] * 1e4) +
      ',' +
      Math.round(P[i * 3 + 2] * 1e4);
    const j = key.get(k);
    if (j === undefined) key.set(k, i);
    else u(i, j);
  }
  for (let t = 0; t < d.idx.length; t += 3) {
    u(d.idx[t], d.idx[t + 1]);
    u(d.idx[t], d.idx[t + 2]);
  }
  const comp = new Map(); // root -> { tris: [], verts: Set }
  for (let t = 0; t < d.idx.length; t += 3) {
    const r = f(d.idx[t]);
    let c = comp.get(r);
    if (!c) comp.set(r, (c = { tris: [], verts: new Set() }));
    c.tris.push(t);
    for (let k = 0; k < 3; k++) c.verts.add(d.idx[t + k]);
  }
  return [...comp.values()];
}
const hash = (i) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// software coverage: fraction of a RES x RES raster covered by any triangle, 8 side views + top, shared bounds per model
function coverage(tris, bounds) {
  const views = [];
  for (let k = 0; k < 8; k++)
    views.push([Math.cos((k * Math.PI) / 4), 0, Math.sin((k * Math.PI) / 4)]);
  views.push([0, 1, 0]);
  const c = [(bounds[0] + bounds[3]) / 2, (bounds[1] + bounds[4]) / 2, (bounds[2] + bounds[5]) / 2];
  const R =
    Math.max(bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]) * 0.6 || 1;
  const out = [];
  for (const v of views) {
    const up = Math.abs(v[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    const rx = [
      up[1] * v[2] - up[2] * v[1],
      up[2] * v[0] - up[0] * v[2],
      up[0] * v[1] - up[1] * v[0],
    ];
    const rl = Math.hypot(...rx);
    rx[0] /= rl;
    rx[1] /= rl;
    rx[2] /= rl;
    const ry = [
      v[1] * rx[2] - v[2] * rx[1],
      v[2] * rx[0] - v[0] * rx[2],
      v[0] * rx[1] - v[1] * rx[0],
    ];
    const img = new Uint8Array(RES * RES);
    const pr = (p) => [
      ((((p[0] - c[0]) * rx[0] + (p[1] - c[1]) * rx[1] + (p[2] - c[2]) * rx[2]) / R) * RES) / 2 +
        RES / 2,
      ((((p[0] - c[0]) * ry[0] + (p[1] - c[1]) * ry[1] + (p[2] - c[2]) * ry[2]) / R) * RES) / 2 +
        RES / 2,
    ];
    for (const t of tris) {
      const A = pr(t[0]),
        B = pr(t[1]),
        C = pr(t[2]);
      const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))),
        x1 = Math.min(RES - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))),
        y1 = Math.min(RES - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      const e = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
      const ar = e(A, B, C[0], C[1]);
      if (Math.abs(ar) < 1e-9) continue;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5,
            py = y + 0.5,
            w0 = e(B, C, px, py),
            w1 = e(C, A, px, py),
            w2 = e(A, B, px, py);
          if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0))
            img[y * RES + x] = 1;
        }
    }
    let s = 0;
    for (const b of img) s += b;
    out.push(s / (RES * RES));
  }
  return out;
}

function prune(file) {
  const g = readGlb(file);
  const prims = new Map(),
    leafs = [];
  g.json.meshes.forEach((m, mi) =>
    m.primitives.forEach((p, pi) => {
      const d = decodePrim(g, p);
      prims.set(mi + ':' + pi, d);
      if (isLeaf(g, p)) leafs.push([mi + ':' + pi, d]);
    }),
  );
  if (!leafs.length) return { skipped: 'no leaf primitives' };
  // bounds and LOD0 triangle list (all primitives: bark occludes too). Node transforms are ignored (library trees are
  // single-node), which is fine for a coverage ratio.
  const allTris = (map) => {
    const T = [];
    for (const d of map.values()) {
      const P = d.attrs.POSITION.data;
      for (let t = 0; t < d.idx.length; t += 3)
        T.push(
          [0, 1, 2].map((k) => [
            P[d.idx[t + k] * 3],
            P[d.idx[t + k] * 3 + 1],
            P[d.idx[t + k] * 3 + 2],
          ]),
        );
    }
    return T;
  };
  const b = [1e30, 1e30, 1e30, -1e30, -1e30, -1e30];
  for (const d of prims.values()) {
    const P = d.attrs.POSITION.data;
    for (let i = 0; i < P.length; i += 3)
      for (let c = 0; c < 3; c++) {
        b[c] = Math.min(b[c], P[i + c]);
        b[c + 3] = Math.max(b[c + 3], P[i + c]);
      }
  }
  const cov0 = coverage(allTris(prims), b);
  const comps = new Map(leafs.map(([k, d]) => [k, components(d)]));
  const build = (scale) => {
    const out = new Map(prims);
    for (const [k, d] of leafs) {
      const P = Float32Array.from(d.attrs.POSITION.data),
        idx = [];
      comps.get(k).forEach((c, ci) => {
        if (hash(ci + k.length * 7919) > KEEP) return;
        let cx = 0,
          cy = 0,
          cz = 0;
        for (const v of c.verts) {
          cx += P[v * 3];
          cy += P[v * 3 + 1];
          cz += P[v * 3 + 2];
        }
        cx /= c.verts.size;
        cy /= c.verts.size;
        cz /= c.verts.size;
        for (const v of c.verts) {
          P[v * 3] = cx + (d.attrs.POSITION.data[v * 3] - cx) * scale;
          P[v * 3 + 1] = cy + (d.attrs.POSITION.data[v * 3 + 1] - cy) * scale;
          P[v * 3 + 2] = cz + (d.attrs.POSITION.data[v * 3 + 2] - cz) * scale;
        }
        for (const t of c.tris) idx.push(d.idx[t], d.idx[t + 1], d.idx[t + 2]);
      });
      out.set(k, {
        ...d,
        attrs: { ...d.attrs, POSITION: { ...d.attrs.POSITION, data: P } },
        idx: Uint32Array.from(idx),
      });
    }
    return out;
  };
  // solve the scale (coverage is monotonic in it): bisection on the mean coverage ratio
  const ratio = (s) => {
    const c = coverage(allTris(build(s)), b);
    return c.reduce((x, v, i) => x + v / Math.max(1e-6, cov0[i]), 0) / c.length;
  };
  let lo = 1,
    hi = (1 / Math.sqrt(KEEP)) * 1.3,
    best = 1;
  for (let it = 0; it < 12; it++) {
    const mid = (lo + hi) / 2,
      r = ratio(mid);
    best = mid;
    if (Math.abs(r - 1) < TOL * 0.5) break;
    if (r < 1) lo = mid;
    else hi = mid;
  }
  const fin = build(best),
    covF = coverage(allTris(fin), b);
  const tris0 = [...prims.values()].reduce((s, d) => s + d.idx.length / 3, 0),
    tris1 = [...fin.values()].reduce((s, d) => s + d.idx.length / 3, 0);
  const outFile = file.replace(/\.glb$/i, '_lod1p.glb');
  if (!o.dry) writeGlb(outFile, g, fin);
  return {
    out: path.relative(ROOT, outFile),
    tris0,
    tris1,
    keep: KEEP,
    scale: +best.toFixed(3),
    cover0: cov0.map((v) => +v.toFixed(3)),
    cover1: covF.map((v) => +v.toFixed(3)),
    maxViewErr: +Math.max(...covF.map((v, i) => Math.abs(v / Math.max(1e-6, cov0[i]) - 1))).toFixed(
      3,
    ),
  };
}

for (const f0 of String(o.files || '')
  .split(',')
  .filter(Boolean)) {
  const f = path.resolve(ROOT, f0);
  if (!f.startsWith(path.join(ROOT, 'public'))) {
    console.log('skip (outside public)', f0);
    continue;
  }
  try {
    console.log(path.basename(f), JSON.stringify(prune(f)));
  } catch (e) {
    console.log('FAIL', f0, e.message);
  }
}

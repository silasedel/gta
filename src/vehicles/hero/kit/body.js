// Body builder: car definition (master curves + tape-drawn regions) -> trimmed panel geometry per LOD.
// A car definition module exports `def = { key, K, curves, zs, section(z), nose, tail, deform, regions(ctx), after(ctx), sided, hullMinY }`.
import * as THREE from 'three';
import { makeSkin, heightMaps, mix } from './surf.js';
import { TriMesh, hullPoints } from './trim.js';

/**
 * Standard 15-ring section from master curves c = { yb, wS, W, yW, wSh, ySh, wB, yB, wR, yR, yC } (all functions of z)
 * and shape coefficients k (per car, optional functions of z):
 *   rings: 0 keel, 1 floor, 2 sill edge, 3 sill, 4 lower side, 5 waist (max width), 6 upper side, 7 crest (shoulder),
 *          8 shelf, 9 belt (base of the side glass / hood line), 10 glass, 11 rail (roof rail / inner hood line), 12 roof A, 13 roof B, 14 center
 */
export function stdSection(c, z, k = {}) {
  const K = (name, d) => { const v = k[name]; return v == null ? d : typeof v === 'function' ? v(z) : v; };
  const yb = c.yb(z), wS = c.wS(z), W = c.W(z), yW = c.yW(z), wSh = c.wSh(z), ySh = c.ySh(z), wB = c.wB(z), yB = c.yB(z), wR = c.wR(z), yR = c.yR(z), yC = c.yC(z);
  const sr = K('sillR', 0.045), lo = K('lower', 0.72), up = K('upper', 0.3), upY = K('upperY', 0.6), sh = K('shelf', 0.55), shY = K('shelfY', 0.4);
  const gl = K('glass', 0.5), glY = K('glassY', 0.52), tum = K('tumble', 0.02), rA = K('roofA', 0.66), rAy = K('roofAy', 0.72), rB = K('roofB', 0.33), spine = K('spine', 0);
  return [
    [0, yb], [wS * 0.55, yb], [wS - 0.025, yb], [wS + sr * 0.7, yb + sr],
    [mix(wS + sr * 0.7, W, lo), mix(yb + sr, yW, 0.5)],
    [W, yW],
    [mix(W, wSh, up) + K('bulge', 0), mix(yW, ySh, upY)],
    [wSh, ySh],
    [mix(wSh, wB, sh), mix(ySh, yB, shY)],
    [wB, yB],
    [mix(wB, wR, gl) + tum, mix(yB, yR, glY)],
    [wR, yR],
    [wR * rA, mix(yR, yC, rAy)],
    [wR * rB, yC - spine],
    [0, yC],
  ];
}

const cache = new Map();
/**
 * Build (and cache) the trimmed body of a car definition at a LOD.
 * Returns { parts: { partName: { matName: BufferGeometry } }, skin, hm (height maps, lod 0 only), mesh, tris, ms }
 */
export function buildBody(def, lod = 0) {
  const ck = def.key + '|' + lod;
  if (cache.has(ck)) return cache.get(ck);
  const t0 = performance.now();
  const skin = (def._skin ||= makeSkin({ zs: def.zs, section: def.section, nose: def.nose, tail: def.tail, deform: def.deform }));
  const dens = def.density || [[7, 3.5], [3, 1.5], [1.4, 0.7]];
  const g = skin.grid(dens[lod][0], dens[lod][1]);
  const hm = lod === 0 ? (def._hm ||= heightMaps(g, 0.01)) : def._hm || null;
  const mesh = new TriMesh(skin, g, lod);
  const ctx = { def, skin, mesh, lod, hm, g };
  for (const r of def.regions(ctx)) mesh.apply(r);
  if (def.after) def.after(ctx);
  const parts = mesh.build(def.sided || []);
  const res = { parts, skin, hm, mesh, tris: mesh.triCount(), ms: performance.now() - t0, ctx };
  cache.set(ck, res);
  return res;
}
export function bodyHull(def) { return (def._hull ||= hullPoints(def._skin || makeSkin({ zs: def.zs, section: def.section, nose: def.nose, tail: def.tail, deform: def.deform }), def.hullMinY ?? 0.26)); }

/** Evenly spaced station list from z0 to z1 (step about `step`), with extra stations merged in. */
export function stations(z0, z1, step = 0.1, extra = []) {
  const n = Math.round((z1 - z0) / step), out = [];
  for (let i = 0; i <= n; i++) out.push(z0 + ((z1 - z0) * i) / n);
  for (const e of extra) if (out.every((z) => Math.abs(z - e) > step * 0.3)) out.push(e);
  return out.sort((a, b) => a - b);
}
export { THREE };

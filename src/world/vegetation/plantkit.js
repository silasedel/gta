// Shared plant pieces: branching skeletons and foliage clusters (used by shrubs.js and trees.js).
import * as THREE from 'three';
import { tube, cards, UP } from './geom.js';
import { BARK, leafUV, barkU } from './textures.js';

const V3 = THREE.Vector3;
export function cellRect(cell, u0 = 0, u1 = 1, v0 = 0, v1 = 1) { const a = leafUV(cell, u0, v1), b = leafUV(cell, u1, v0); return [a[0], a[1], b[0], b[1]]; }

// one branch (tube) with recursive children. P: { radial, segLen, children: [n per depth], spread, lenK, rK, up, wobble, childStart,
// leafFrom (depth at which foliage starts), barkCol, onLeaf(pos, dir, depth, t) }
export function branch(gb, R, start, dir, len, r0, depth, P, lod) {
  const nSeg = Math.max(2, Math.round(len / (P.segLen * (lod ? 2 : 1)))), pts = [start.clone()], d = dir.clone().normalize(), p = start.clone();
  const wob = new V3();
  for (let i = 1; i <= nSeg; i++) {
    wob.set(R() - 0.5, (R() - 0.5) * 0.5, R() - 0.5).multiplyScalar(P.wobble);
    d.add(wob).addScaledVector(UP, P.up * (depth + 1) * 0.5).normalize();
    if (P.sag) d.y -= P.sag * (i / nSeg) * (depth ? 1 : 0.4), d.normalize();
    p.addScaledVector(d, len / nSeg); pts.push(p.clone());
  }
  const radial = Math.max(3, (lod ? 3 : P.radial) - depth), col = P.barkCol || [1, 1, 1], rTip = r0 * (P.tipK ?? 0.45);
  const rAt = (i) => r0 + (rTip - r0) * Math.pow(i / nSeg, 0.9);
  let arc = 0; const arcs = pts.map((q, i) => (arc += i ? q.distanceTo(pts[i - 1]) : 0));
  if (r0 > 0.012) tube(gb.bark, pts, radial, (i, a) => rAt(i) * (1 + (P.flare && depth === 0 ? P.flare * Math.exp(-arcs[i] / 0.5) * (1 + 0.4 * Math.sin(a * 4 + r0 * 50)) : 0)),
    (i, j) => [barkU(P.barkU ?? BARK.tree, j / radial), arcs[i] / (P.barkRep ?? 1.2) + depth * 0.37], () => col, (i) => [Math.max(0, pts[i].y), depth * 0.08, 0]);
  const kids = P.children[depth] ?? 0;
  if (depth < P.children.length && kids) for (let k = 0; k < kids; k++) {
    const t = (P.childStart ?? 0.3) + (1 - (P.childStart ?? 0.3)) * ((k + R() * 0.8) / kids), i = Math.min(nSeg - 1, Math.floor(t * nSeg));
    const ax = new V3().crossVectors(d, new V3(R() - 0.5, R() - 0.5, R() - 0.5)).normalize();
    const nd = dir.clone().normalize().applyAxisAngle(ax, P.spread * (0.6 + R() * 0.6)).applyAxisAngle(UP, k * 2.4 + R());
    branch(gb, R, pts[i], nd, len * P.lenK * (0.75 + R() * 0.5), rAt(i) * P.rK, depth + 1, P, lod);
  }
  if (P.onLeaf && depth >= (P.leafFrom ?? 0)) { const nl = Math.max(1, Math.round(nSeg * (P.leafPerSeg ?? 0.6))); for (let k = 0; k < nl; k++) { const t = 1 - k / nl * (P.leafSpan ?? 0.6), i = Math.max(1, Math.round(t * nSeg)); P.onLeaf(pts[i], d, depth, t); } }
  return pts[nSeg];
}

// foliage cluster at c: k crossed cards; ctr = plant center for outward normals; col tint; flutter weight
export function cluster(gb, R, c, size, cell, ctr, col, k = 3, lift = 0, fl = 0.8) {
  const uvr = cellRect(cell); uvr.lift = lift;
  cards(gb.leaf, c, size, k, R() * Math.PI, uvr, col, (sy) => [Math.max(0, c.y), sy > 0 ? fl : fl * 0.5, R() * 6.28], ctr, 0.45, R);
}

// flat ground card (leaf litter, fallen fronds)
export function groundCard(gb, R, c, size, cell, col) {
  const uvr = cellRect(cell), a = R() * 6.28, ca = Math.cos(a) * size / 2, sa = Math.sin(a) * size / 2, b = gb.leaf.count;
  const pts = [[-ca + sa, -sa - ca], [ca + sa, sa - ca], [ca - sa, sa + ca], [-ca - sa, -sa + ca]];
  pts.forEach(([x, z], i) => gb.leaf.vert(new V3(c.x + x, c.y + 0.015 + R() * 0.01, c.z + z), UP, i === 0 || i === 3 ? uvr[0] : uvr[2], i < 2 ? uvr[1] : uvr[3], col, [0, 0, 0]));
  gb.leaf.quad(b, b + 1, b + 2, b + 3);
}

// bent blade card rising from the base and arching outward (grasses)
export function bladeCard(gb, R, base, az, h, w, lean, uvr, col) {
  const rows = 4, ca = Math.cos(az), sa = Math.sin(az), b = gb.leaf.count, side = new V3(-sa, 0, ca);
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, out = lean * t * t * h, y = h * t * (1 - 0.25 * lean * t * t), c = new V3(base.x + ca * out, base.y + y, base.z + sa * out);
    const n = new V3(ca, 0.8, sa).normalize();
    for (const sg of [-1, 1]) gb.leaf.vert(c.clone().addScaledVector(side, sg * w / 2), n, sg < 0 ? uvr[0] : uvr[2], uvr[1] + (uvr[3] - uvr[1]) * t, col, [y, t * 0.9, az * 3]);
  }
  for (let i = 0; i < rows; i++) gb.leaf.quad(b + i * 2, b + i * 2 + 1, b + i * 2 + 3, b + i * 2 + 2);
}

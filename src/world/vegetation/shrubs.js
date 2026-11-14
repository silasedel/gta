// Shrubs, hedges, clumps and grasses. buildShrub({ kind, seed, lod, size, length }) -> { bark, leaf, height, tris }
// Each shrub has a real woody skeleton (visible through gaps), foliage clusters filling an uneven, lobed envelope,
// dead / sun-bleached patches, flowers from the atlas, and leaf litter on the ground. Every seed differs.
import * as THREE from 'three';
import { GB, rng, UP } from './geom.js';
import { CELL } from './textures.js';
import { branch, cluster, groundCard, bladeCard, cellRect } from './plantkit.js';
import { fanLeaf } from './palms.js';

const V3 = THREE.Vector3;
export const SHRUB_KINDS = ['seagrape', 'hibiscus', 'croton', 'bougainvillea', 'ixora', 'hedge', 'sawpalmetto', 'grass', 'sawgrass'];

const SH = {
  seagrape: { cell: CELL.seagrape, H: [1.6, 2.8], W: [1.6, 2.6], n: 70, size: [0.55, 0.8], stems: [4, 7], bark: [0.75, 0.6, 0.55], dead: 0.12, litter: 5 },
  hibiscus: { cell: CELL.hibiscus, H: [1.3, 2.2], W: [1.1, 1.8], n: 80, size: [0.42, 0.6], stems: [3, 6], bark: [0.8, 0.75, 0.65], dead: 0.06, litter: 3 },
  croton: { cell: CELL.croton, H: [0.8, 1.4], W: [0.8, 1.3], n: 55, size: [0.38, 0.55], stems: [3, 5], bark: [0.8, 0.75, 0.65], dead: 0.05, litter: 2 },
  bougainvillea: { cell: CELL.bougainvillea, H: [1.5, 2.6], W: [1.6, 2.8], n: 95, size: [0.45, 0.7], stems: [4, 7], bark: [0.7, 0.62, 0.52], dead: 0.06, litter: 4, sprawl: 0.35 },
  ixora: { cell: CELL.ixora, H: [0.8, 1.3], W: [0.9, 1.5], n: 70, size: [0.36, 0.5], stems: [4, 6], bark: [0.75, 0.7, 0.6], dead: 0.05, litter: 2, round: true },
  hedge: { cell: CELL.hedge, H: [1.0, 1.5], W: [0.75, 1.0], n: 0, size: [0.42, 0.55], stems: [0, 0], bark: [0.7, 0.62, 0.52], dead: 0.08, litter: 3 },
};

function finish(gb, H) { const bark = gb.bark.build(), leaf = gb.leaf.build(); return { bark, leaf, height: H, tris: gb.bark.tris + gb.leaf.tris }; }
const rr = (R, [a, b]) => a + (b - a) * R();

export function buildShrub(opts = {}) {
  const kind = SHRUB_KINDS.includes(opts.kind) ? opts.kind : 'seagrape', R = rng((opts.seed ?? 1) * 5.17 + SHRUB_KINDS.indexOf(kind) * 37 + 1), lod = opts.lod | 0, sz = opts.size ?? 1;
  const gb = { bark: new GB(), leaf: new GB() };
  if (kind === 'hedge') return hedge(gb, R, opts, lod);
  if (kind === 'sawpalmetto') return sawPalmetto(gb, R, opts, lod);
  if (kind === 'grass' || kind === 'sawgrass') return grass(gb, R, kind, opts, lod);
  const P = SH[kind], H = rr(R, P.H) * sz, W = rr(R, P.W) * sz, ctr = new V3(0, H * 0.55, 0);
  // lobed envelope: a few random bulges so the outline is never a perfect dome
  const lobes = Array.from({ length: 5 }, () => ({ d: new V3(R() - 0.5, R() * 0.6, R() - 0.5).normalize(), k: 0.12 + R() * 0.25 }));
  const env = (dir) => { let k = 1; for (const l of lobes) k += l.k * Math.max(0, dir.dot(l.d)) ** 3 - 0.06; return k; };
  // woody skeleton: stems from the root crown fanning out, with side twigs
  const nS = Math.round(rr(R, P.stems));
  const BP = { radial: 5, segLen: 0.3, children: [3, 2], spread: 0.8, lenK: 0.5, rK: 0.6, up: 0.04, wobble: 0.25, childStart: 0.35, barkCol: P.bark, sag: P.sprawl || 0 };
  for (let s = 0; s < nS; s++) { const a = s * 2.4 + R(), out = 0.35 + R() * 0.4; branch(gb, R, new V3(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05), new V3(Math.cos(a) * out, 1, Math.sin(a) * out), H * (0.42 + R() * 0.18), 0.025 + R() * 0.02, 0, BP, lod); }
  // foliage clusters on the envelope shell (denser on top and the sunny side), with dead patches and gaps
  const n = Math.round(P.n * (lod ? 0.4 : 1) * Math.sqrt(sz)), deadDir = new V3(R() - 0.5, 0, R() - 0.5).normalize();
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * 6.28, sy = P.round ? u : Math.abs(u) * 0.9 + 0.1, rxy = Math.sqrt(1 - sy * sy);
    const dir = new V3(Math.cos(a) * rxy, sy, Math.sin(a) * rxy), k = env(dir) * (0.7 + 0.3 * Math.sqrt(R()));
    const c = new V3(dir.x * W / 2 * k, H * 0.5 + dir.y * H * 0.5 * k, dir.z * W / 2 * k); if (c.y < 0.15) c.y = 0.15 + R() * 0.15;
    const deadish = dir.dot(deadDir) > 0.6 && R() < P.dead * 4, inner = R() < 0.15;
    const g = 0.85 + R() * 0.25, col = deadish ? [1.15, 0.95, 0.55] : inner ? [0.6, 0.65, 0.6] : [g, g * (0.95 + R() * 0.1), g * (0.9 + R() * 0.1)];
    cluster(gb, R, inner ? c.multiplyScalar(0.6) : c, rr(R, P.size) * (lod ? 1.5 : 1) * Math.sqrt(sz), P.cell, ctr, col, lod ? 2 : 3, 0, 0.8);
  }
  if (!lod) for (let i = 0; i < P.litter; i++) { const a = R() * 6.28, d = R() * W * 0.55; groundCard(gb, R, new V3(Math.cos(a) * d, 0, Math.sin(a) * d), 0.5 + R() * 0.5, CELL.litter, [0.9 + R() * 0.2, 0.9, 0.85]); }
  return finish(gb, H);
}

// clipped hedge: foliage clusters packed on a rounded-box surface (crossed cards, outward normals), sheared top, thin woody base
function hedge(gb, R, opts, lod) {
  const P = SH.hedge, L = opts.length ?? 2.4, H = rr(R, P.H) * (opts.size ?? 1), D = rr(R, P.W), step = lod ? 0.5 : 0.26;
  const ctr = new V3(0, H * 0.55, 0), bulge = R() * 6;
  for (let x = -L / 2 + 0.1; x <= L / 2 - 0.1; x += step) for (let y = 0.3; y <= H; y += step) for (let z = -D / 2 + 0.1; z <= D / 2 - 0.1; z += step) {
    const ex = Math.abs(x) / (L / 2), ey = (y - 0.3) / (H - 0.3), ez = Math.abs(z) / (D / 2);
    if (Math.max(ex, ey, ez) < 0.7 && !(ey > 0.85)) continue; // shell only
    if (R() < 0.05) continue; // small gaps
    const p = new V3(x + (R() - 0.5) * step * 0.6, Math.min(H - 0.08, y + (R() - 0.5) * step * 0.5), z + (R() - 0.5) * step * 0.6);
    p.addScaledVector(new V3(Math.sign(x) * ex, ey * 0.5, Math.sign(z) * ez), 0.05 * Math.sin(x * 2.3 + bulge)); // uneven shear
    const dead = R() < P.dead * (y < 0.6 ? 2 : 0.6), g = 0.85 + R() * 0.25;
    cluster(gb, R, p, step * (1.9 + R() * 0.5), CELL.hedge, ctr.clone().setX(p.x * 0.5), dead ? [1.15, 0.95, 0.6] : [g, g, g * 0.95], lod ? 2 : 3, 0, 0.25);
  }
  if (!lod) { const BP = { radial: 4, segLen: 0.25, children: [2], spread: 0.6, lenK: 0.5, rK: 0.6, up: 0.05, wobble: 0.3, childStart: 0.4, barkCol: P.bark };
    for (let x = -L / 2 + 0.25; x < L / 2; x += 0.45) branch(gb, R, new V3(x + (R() - 0.5) * 0.2, 0, (R() - 0.5) * D * 0.4), new V3((R() - 0.5) * 0.4, 1, (R() - 0.5) * 0.4), 0.55, 0.02 + R() * 0.012, 0, BP, lod);
    for (let i = 0; i < 4; i++) groundCard(gb, R, new V3((R() - 0.5) * L, 0, (R() > 0.5 ? 1 : -1) * (D / 2 + R() * 0.3)), 0.4 + R() * 0.3, CELL.litter, [1, 0.95, 0.9]); }
  return finish(gb, H);
}

// saw palmetto clump: creeping stems with fans on long petioles, silver-green to yellow-green per clump
function sawPalmetto(gb, R, opts, lod) {
  const sz = opts.size ?? 1, n = Math.round((lod ? 8 : 14 + R() * 10) * sz), silver = R() < 0.4, H = 1.4 * sz;
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * 0.9 * sz, base = new V3(Math.cos(a) * d, 0.05 + R() * 0.25, Math.sin(a) * d);
    const col = silver ? [0.8 + R() * 0.1, 0.95, 1.05] : [0.95 + R() * 0.15, 1, 0.75 + R() * 0.15];
    fanLeaf(gb.leaf, R, base, a + (R() - 0.5), 0.5 + R() * 0.7, (0.6 + R() * 0.7) * sz, (0.45 + R() * 0.25) * sz, { col, dead: R() < 0.1 }, 0.5, lod);
  }
  if (!lod) for (let i = 0; i < 3; i++) groundCard(gb, R, new V3((R() - 0.5) * 1.6 * sz, 0, (R() - 0.5) * 1.6 * sz), 0.6, CELL.litter, [1, 0.95, 0.9]);
  return finish(gb, H);
}

// grasses: fountain grass (ornamental, plumes) or sawgrass (stiff, tall, serrated, tan tips)
function grass(gb, R, kind, opts, lod) {
  const saw = kind === 'sawgrass', sz = opts.size ?? 1, H = (saw ? 1.4 + R() * 1.0 : 0.7 + R() * 0.5) * sz, n = Math.round((saw ? 14 : 11) * (lod ? 0.5 : 1));
  const uvr = cellRect(CELL.grass, saw ? 0.52 : 0.02, saw ? 0.98 : 0.48, 0.02, 1);
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + R() * 0.6, d = R() * 0.12 * sz, g = 0.85 + R() * 0.3; bladeCard(gb, R, new V3(Math.cos(a) * d, 0, Math.sin(a) * d), a, H * (0.75 + R() * 0.35), (saw ? 0.6 : 0.55) * sz, saw ? 0.25 + R() * 0.3 : 0.6 + R() * 0.5, uvr, [g, g, g * (saw ? 0.9 : 1)]); }
  if (saw && !lod) for (let i = 0; i < 3; i++) bladeCard(gb, R, new V3((R() - 0.5) * 0.2, 0, (R() - 0.5) * 0.2), R() * 6.28, H * 0.6, 0.5, 1.2, uvr, [1.25, 1.05, 0.7]); // dead, bent-over blades
  return finish(gb, H);
}

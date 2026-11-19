// Interior art kit: fashion retail fixtures (boutiques, streetwear, shoe stores). Same conventions as venue.js.
//   garmentRack wallBay foldTable mannequin fittingRooms sneakerWall
// Garments are merged static geometry in a handful of fabric materials per store (a palette), so a full store stays at a few draw calls.
import * as THREE from 'three';
import { libModel } from '../kit/models.js';
import { FIXTURES } from '../lighting.js';
import { venuePalette, venueMats } from './venue.js';
import '../kit/venueSurfaces.js';

const fab = (ctx, c) => ctx.M.surf('fabric', { c, uvw: 0.35 });
// one hanging garment centered on the rail at (x, y = rail, z), facing +z. Shops pass: a draped cloth grid per kind (shirt with
// sleeves, jacket, dress, pants with the leg split), vertical folds deepening toward the hem, a slight belly, closed side edges;
// each kind is built once and reused (world-projected fabric uvs come from the material).
const GARM = new Map();
function garmentGeo(kind) {
  let g = GARM.get(kind); if (g) return g;
  const L = kind === 'dress' ? 0.95 : kind === 'jacket' ? 0.72 : kind === 'pants' ? 0.9 : 0.66, NY = 6, NU = 6, T = 0.012;
  const hw = (t) => kind === 'dress' ? (t < 0.06 ? 0.09 + t / 0.06 * 0.06 : t < 0.38 ? 0.15 - (t - 0.06) * 0.03 : 0.14 + (t - 0.38) / 0.62 * 0.13)
    : kind === 'pants' ? 0.17 + t * 0.03
    : kind === 'jacket' ? (t < 0.07 ? 0.08 + t / 0.07 * 0.15 : t < 0.82 ? 0.245 : 0.205)
    : (t < 0.07 ? 0.07 + t / 0.07 * 0.15 : t < 0.5 ? 0.235 : 0.19);
  const gap = (t, u) => kind === 'pants' && t > 0.38 && Math.abs(u) < 0.035 * (0.6 + t);
  const pos = [], idx = [], ph = kind.length * 1.7;
  const P = (t, f, side) => { const w = hw(t), u = (f * 2 - 1) * w, fold = 0.007 * Math.sin(u * 34 + ph + t * 2) * (0.3 + 0.7 * t), belly = 0.01 * Math.cos((f * 2 - 1) * 1.45) * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.3)));
    return [side * (T / 2 + belly) + fold, -0.05 - t * L - (kind === 'shirt' || kind === 'jacket' ? 0.025 * Math.cos((f * 2 - 1) * Math.PI) * t * t : 0), u]; };
  for (const side of [1, -1]) { const b = pos.length / 3; for (let j = 0; j <= NY; j++) for (let i = 0; i <= NU; i++) pos.push(...P(j / NY, i / NU, side));
    for (let j = 0; j < NY; j++) for (let i = 0; i < NU; i++) { const t = (j + 0.5) / NY, u = ((i + 0.5) / NU * 2 - 1) * hw(t); if (gap(t, u)) continue; const a = b + j * (NU + 1) + i, c = a + NU + 1;
      if (side > 0) idx.push(a, c, a + 1, a + 1, c, c + 1); else idx.push(a, a + 1, c, a + 1, c + 1, c); } }
  const half = (NY + 1) * (NU + 1); // side edges + hem join front and back
  for (let j = 0; j < NY; j++) for (const i of [0, NU]) { const a = j * (NU + 1) + i, c = a + NU + 1, a2 = a + half, c2 = c + half; if (i === 0) idx.push(a, a2, c, c, a2, c2); else idx.push(a, c, a2, c, c2, a2); }
  for (let i = 0; i < NU; i++) { const a = NY * (NU + 1) + i, a2 = a + half; idx.push(a, a + 1, a2, a + 1, a2 + 1, a2); }
  g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.setIndex(idx); g.computeVertexNormals(); GARM.set(kind, g); return g;
}
// folded garment for stacks: soft rounded slab (bevelled), a touch narrower or wider per piece
// folded garment for stacks: a slab with a rolled front edge (the fold) instead of a sharp box
function foldPiece(G, m, x, y, z, ry, sx, sz) { G.at(x, z, ry, () => { G.box(m, 0, 0.016, -0.01, 0.27 * sx, 0.026, 0.22 * sz); G.cyl(m, 0, 0.016, 0.1 * sz, 0.014, 0.27 * sx, { rz: Math.PI / 2, seg: 6 }); }, y); }
export function foldedStack(ctx, x, y, z, ry, c, n, o = {}) { const R = ctx.R, m = fab(ctx, c), m2 = fab(ctx, c.map ? c.map((v) => Math.max(0, Math.round(v * 0.88))) : c);
  for (let k = 0; k < n; k++) { const sx = (o.w || 0.28) / 0.27 * (0.96 + R() * 0.08), sz = (o.d || 0.25) / 0.24 * (0.96 + R() * 0.06); foldPiece(ctx.G, k % 3 === 2 ? m2 : m, x + R.jit(0.008), y + k * 0.032, z + R.jit(0.008), ry + R.jit(0.05), sx, sz); } }
function garment(ctx, x, y, z, ry, c, kind = 'shirt') {
  const { G, M } = ctx, m = fab(ctx, c), hg = M.flat('#c9ccd1', { metal: 0.9, rough: 0.3 }), sh = kind === 'pants' ? 0.36 : 0.42;
  G.at(x, z, ry, () => { G.add(hg, new THREE.TorusGeometry(0.025, 0.003, 4, 10, Math.PI * 1.2), new THREE.Matrix4().makeTranslation(0, 0.02, 0)); G.box(hg, 0, -0.04, 0, 0.004, 0.004, sh - 0.02);
    G.add(m, garmentGeo(kind), null); if (kind === 'shirt' || kind === 'jacket') G.box(m, 0, -0.065, 0, 0.03, 0.03, 0.12); }, y);
}
// straight or round floor rack (o.round). Garments in the palette colors, slightly fanned.
export function garmentRack(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, R = ctx.R, pal = o.pal || venuePalette(), chrome = o.metal === 'black' ? M.flat('#141416', { rough: 0.35, metal: 0.6 }) : o.metal === 'brass' ? venueMats(ctx, pal).brass : M.flat('#c9ccd1', { metal: 1, rough: 0.2, probe: 0.8 });
  const cols = o.colors, kinds = o.kinds || ['shirt', 'shirt', 'jacket', 'dress'], h = o.h || 1.45, L = o.l || 1.3;
  G.at(x, z, ry, () => {
    if (o.round) { const r = o.r || 0.5; G.add(chrome, new THREE.TorusGeometry(r, 0.013, 6, 28), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, h, 0)); G.cylB(chrome, 0, 0, 0, 0.022, h, { seg: 8 }); G.cylB(chrome, 0, 0, 0, 0.32, 0.02, { seg: 18 });
      const n = Math.round(r * 2 * Math.PI / 0.09); for (let i = 0; i < n; i++) { if (R.chance(o.sparse ?? 0.12)) continue; const a = i / n * 6.283; garment(ctx, Math.cos(a) * r, h, Math.sin(a) * r, -a, R.pick(cols), R.pick(kinds)); }
      ctx.solid(-r - 0.25, 0, -r - 0.25, r + 0.25, h, r + 0.25, { occ: false }); ctx.shadow(0, 0, 2 * r + 0.5, 2 * r + 0.5); }
    else { G.cyl(chrome, 0, h, 0, 0.013, L, { rz: Math.PI / 2, seg: 8 }); for (const s of [-1, 1]) { G.cylB(chrome, s * L / 2, 0.04, 0, 0.016, h - 0.04, { seg: 8 }); G.box(chrome, s * L / 2, 0.02, 0, 0.05, 0.04, 0.5); }
      for (let u = -L / 2 + 0.06; u < L / 2 - 0.04; u += o.pitch || 0.075) { if (R.chance(o.sparse ?? 0.1)) continue; garment(ctx, u, h, R.jit(0.01), Math.PI / 2 + R.jit(0.08), R.pick(cols), R.pick(kinds)); }
      ctx.solid(-L / 2, 0, -0.28, L / 2, h, 0.28, { occ: false }); ctx.shadow(0, 0, L, 0.55); }
    for (let k = 0; k < 2; k++) ctx.poi('browse', R.jit(0.3), 0.75, Math.PI, {});
  });
}
// wall bay (local z = 0 is the wall): back panel, two face-out bars with garments, a shelf of folded stacks, a lit header
export function wallBay(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, R = ctx.R, pal = o.pal || venuePalette(), L = o.l || 1.8, panel = o.panel || M.surf('walnut', { c: pal.wood }), metal = o.metal === 'brass' ? venueMats(ctx, pal).brass : M.flat(o.metal === 'black' ? '#141416' : '#c9ccd1', { metal: 0.9, rough: 0.25 });
  G.at(x, z, ry, () => {
    G.plane(panel, 0, 1.35, 0.012, L, 2.5, { step: 0.4 }); G.box(M.flat(pal.dark, { rough: 0.5 }), 0, 2.66, 0.08, L + 0.04, 0.14, 0.16);
    if (o.led) FIXTURES.led(ctx, [-L / 2 + 0.05, 2.58, 0.14], [L / 2 - 0.05, 2.58, 0.14], { color: o.led, k: 1.1, glow: 2.2, w: 0.01, d: [0, -1, 0.25], every: 0.6 });
    for (const [bx, by] of [[-L / 4, 1.85], [L / 4, 1.85], [-L / 4, 1.05], [L / 4, 1.05]]) { if (by < 1.5 && o.shelfLow) continue; G.cyl(metal, bx, by, 0.2, 0.01, 0.4, { rx: Math.PI / 2, seg: 6 }); for (let i = 0; i < 6; i++) garment(ctx, bx, by, 0.12 + i * 0.05, 0, R.pick(o.colors), R.pick(o.kinds || ['shirt', 'jacket'])); }
    const sy = o.shelfLow ? 1.0 : 0.42; G.box(panel, 0, sy, 0.2, L - 0.04, 0.03, 0.36); for (let u = -L / 2 + 0.2; u < L / 2 - 0.15; u += 0.34) foldedStack(ctx, u, sy + 0.015, 0.2, 0, R.pick(o.colors), R.int(3, 7));
    ctx.solid(-L / 2, 0, 0, L / 2, 2.6, 0.42, { occ: false });
  });
}
// nesting display table with folded stacks and a few accessories
export function foldTable(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, R = ctx.R, pal = o.pal || venuePalette(), top = o.top || M.surf('walnut', { c: pal.wood, probe: 0.3 }), w = o.w || 1.4, d = o.d || 0.8, h = o.h || 0.78;
  G.at(x, z, ry, () => { G.boxB(top, 0, 0, 0, w, h, d); G.boxB(top, w * 0.32, 0, d * 0.62, w * 0.55, h * 0.62, d * 0.6);
    for (const [px, py, pz, pw] of [[-w * 0.3, h, 0, w * 0.35], [w * 0.15, h, 0, w * 0.4], [w * 0.32, h * 0.62, d * 0.62, w * 0.45]]) for (let u = px - pw / 2 + 0.16; u < px + pw / 2; u += 0.32) foldedStack(ctx, u, py, pz, 0, R.pick(o.colors), R.int(4, 8));
    ctx.solid(-w / 2, 0, -d / 2, w / 2, h, d / 2 + d * 0.62, { occ: false }); ctx.shadow(0, d * 0.3, w + 0.2, d * 1.7); ctx.poi('browse', 0, -d / 2 - 0.5, 0, {}); });
}
// abstract display mannequin on a stand, dressed in a top and a bottom color
export function mannequin(ctx, x, z, ry, o = {}) {
  if (o.lib && libModel(ctx, o.lib, x, z, ry)) { ctx.G.at(x, z, ry, () => { ctx.solid(-0.22, 0, -0.22, 0.22, 1.8, 0.22, { occ: false }); ctx.shadow(0, 0, 0.5, 0.5); }); return; } // r7: the user's mannequins
  const { G, M } = ctx, skin = M.flat(o.skin || '#e8e2d8', { rough: 0.35, probe: 0.3 }), top = fab(ctx, o.top || [240, 240, 236]), bot = fab(ctx, o.bottom || [30, 40, 70]), base = M.flat('#141416', { rough: 0.3, metal: 0.6 });
  G.at(x, z, ry, () => { G.cylB(base, 0, 0, 0, 0.2, 0.02, { seg: 18 }); G.cylB(base, 0, 0.02, 0, 0.012, 0.85, { seg: 6 });
    G.lathe(bot, [[0.001, 0], [0.13, 0.02], [0.15, 0.2], [0.16, 0.34]], 0, 0.82, 0, { seg: 14 }); G.lathe(top, [[0.16, 0], [0.14, 0.15], [0.17, 0.32], [0.18, 0.4], [0.06, 0.48], [0.001, 0.49]], 0, 1.16, 0, { seg: 16, sz: 0.7 });
    for (const s of [-1, 1]) G.cyl(top, s * 0.2, 1.4, 0, 0.045, 0.32, { rz: s * 0.25, seg: 8 }); G.cyl(skin, 0, 1.69, 0, 0.04, 0.1, { seg: 8 }); G.sphere(skin, 0, 1.83, 0, 0.1, { seg: 12, sy: 1.25 });
    ctx.solid(-0.22, 0, -0.22, 0.22, 1.9, 0.22, { occ: false }); ctx.shadow(0, 0, 0.45, 0.45); });
}
// curtained fitting rooms along a wall (local z = 0 is the wall): n booths of 1.0 m with a mirror and a hook
export function fittingRooms(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, n = o.n || 2, pal = o.pal || venuePalette(), wall = M.surf('plaster', { c: o.wallC || [226, 220, 210] }), cur = M.surf('velvet', { c: o.curtain || pal.velvet, n: 14 }), rail = M.flat('#141416', { rough: 0.4, metal: 0.6 });
  G.at(x, z, ry, () => { const W = n * 1.05;
    for (let i = 0; i <= n; i++) { const px = -W / 2 + i * 1.05; G.boxB(wall, px, 0, 0.6, 0.06, 2.3, 1.2); ctx.solid(px - 0.03, 0, 0, px + 0.03, 2.3, 1.2); }
    for (let i = 0; i < n; i++) { const cx = -W / 2 + (i + 0.5) * 1.05; G.cyl(rail, cx, 2.15, 1.18, 0.01, 1.0, { rz: Math.PI / 2, seg: 6 }); G.plane(cur, cx - 0.12, 1.1, 1.17, 0.75, 2.05, { step: 0.3 }); G.plane(cur, cx - 0.12, 1.1, 1.165, 0.75, 2.05, { ry: Math.PI, step: 0.3 });
      G.plane(M.flat('#cfd6dc', { metal: 0.95, rough: 0.04, probe: 1.3 }), cx, 1.2, 0.015, 0.5, 1.5); G.box(rail, cx + 0.35, 1.7, 0.03, 0.02, 0.02, 0.06); FIXTURES.can(ctx, cx, 2.3, 0.6, { lamp: 'warm', k: 2, cone: 0.5 }); }
    G.box(wall, 0, 2.38, 0.6, W + 0.06, 0.16, 1.2); });
}
// sneaker wall (local z = 0 is the wall): lit shelves, one shoe per slot (two-box sneaker form)
// side-on sneaker (heel -> toe along x, 0.27 m): upper with collar dip and tongue rise, a thicker cupsole; shared per part
const SHOE = {};
function shoeGeo(part) { if (SHOE[part]) return SHOE[part]; const sh = new THREE.Shape();
  if (part === 'sole') { sh.moveTo(-0.135, 0); sh.lineTo(0.12, 0); sh.quadraticCurveTo(0.14, 0, 0.14, 0.018); sh.lineTo(-0.137, 0.024); sh.lineTo(-0.135, 0); }
  else { sh.moveTo(-0.13, 0.02); sh.lineTo(-0.133, 0.075); sh.quadraticCurveTo(-0.12, 0.09, -0.1, 0.085); sh.quadraticCurveTo(-0.05, 0.062, 0.0, 0.08); sh.lineTo(0.035, 0.07); sh.quadraticCurveTo(0.1, 0.05, 0.128, 0.032); sh.quadraticCurveTo(0.14, 0.022, 0.136, 0.018); sh.lineTo(-0.13, 0.02); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: part === 'sole' ? 0.1 : 0.088, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, part === 'sole' ? -0.05 : -0.044); return (SHOE[part] = g); }
export function sneakerWall(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx, R = ctx.R, L = o.l || 2.4, rows = o.rows || 6, shelf = M.flat(o.shelfC || '#e8e8e4', { rough: 0.3 }), cols = o.colors || [[240, 240, 236], [20, 20, 22], [220, 40, 50], [40, 120, 220], [250, 200, 40]];
  G.at(x, z, ry, () => { G.plane(M.flat(o.backC || '#16161a', { rough: 0.6 }), 0, 1.4, 0.01, L, 2.4);
    for (let r = 0; r < rows; r++) { const y = 0.45 + r * 0.34; G.box(shelf, 0, y, 0.15, L - 0.06, 0.02, 0.26); FIXTURES.led(ctx, [-L / 2 + 0.05, y - 0.015, 0.27], [L / 2 - 0.05, y - 0.015, 0.27], { color: o.led || '#eaf6ff', k: 0.45, glow: 2.2, w: 0.008, d: [0, -1, 0.1], every: 1.2 });
      for (let u = -L / 2 + 0.18; u < L / 2 - 0.12; u += 0.3) { if (R.chance(0.08)) continue; const c = R.pick(cols), c2 = R.pick(cols); const fl = R.chance(0.5) ? 1 : -1, ms = new THREE.Matrix4().compose(new THREE.Vector3(u, y + 0.01, 0.15), new THREE.Quaternion(), new THREE.Vector3(fl, 1, 1)); G.add(fab(ctx, c), shoeGeo('upper'), ms); G.add(R.chance(0.7) ? M.flat('#f2f2ee', { rough: 0.6 }) : fab(ctx, c2), shoeGeo('sole'), ms); } }
    ctx.solid(-L / 2, 0, 0, L / 2, 2.6, 0.3, { occ: false }); });
}

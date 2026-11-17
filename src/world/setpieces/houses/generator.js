// Seeded house generator (track: houses). Six styles built from the Nico house kit's techniques: every board, sash,
// shutter slat, tile row and rail is real geometry merged per material, painted surfaces peel by per-piece wear,
// the glass is lit from inside at night. Three importance levels from one description:
//   lod 0 (near, < ~60 m): full detail                 lod 1 (mid): walls, openings, roof shapes, porch, rails as solids
//   lod 2 (far): body box, roof volume, lit window cards
// House-local frame (same as Nico's house): +X across the lot, +Z toward the street, y = 0 at the yard grade.
//   planHouse({ seed, w, d, style?, stilt?, base?, district?, drvU?, front?, back?, side? }) -> spec
//   buildHouse(hk, spec, lod) -> { batch, colliders, lamps, tris }
import { PALETTES, CURTAINS, styleWeights, pickWeighted } from './styles.js';
const CURB_LIB = !(typeof location !== 'undefined' && /[?&]lotprops=0/.test(location.search)); // props pass: curb props drawn by lotProps

const PI = Math.PI;

// ---------------------------------------------------------------- plan
export function planHouse(inp) {
  const seed = (inp.seed | 0) || 1;
  let s = (seed * 2654435761) >>> 0 || 1; const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const pick = (a) => a[(r() * a.length) | 0];
  const style = inp.style || (inp.stilt && r() < 0.75 ? 'keys' : pickWeighted(styleWeights(inp.district, inp.zone, false), r));
  const P = PALETTES[style];
  const w = Math.max(6.5, inp.w), d = Math.max(6, inp.d);
  const front = inp.front ?? 3.0, side = inp.side ?? 1.5;
  const sp = { seed, style, w, d, front, side, drvU: inp.drvU ?? (r() < 0.5 ? -1 : 1) * (w / 2 + 2.2), wear: 0.06 + r() * r() * 0.5 };
  sp.colors = { body: pick(P.body), trim: pick(P.trim), accent: pick(P.accent), roof: pick(P.roof), curtain: CURTAINS.map(() => pick(CURTAINS)) };
  sp.stories = 1; sp.wallH = 2.75;
  if (style === 'keys') {
    sp.base = inp.base ?? (inp.stilt === false ? 0.55 : 2.6 + r() * 0.8); sp.stilt = sp.base > 1.5;
    sp.finish = r() < 0.6 ? 'vboard' : 'lap'; sp.roof = { type: r() < 0.75 ? 'gableX' : 'hip', cover: 'tin', pitch: 0.42 + r() * 0.2, ov: 0.5 };
    sp.window = 'sash'; sp.shutter = pick(['bahama', 'louver', 'bahama', 'none']); sp.porch = { kind: 'deck', d: Math.min(front - 0.3, 2.2 + r() * 0.6) };
    sp.lattice = sp.stilt && r() < 0.75; sp.storage = sp.stilt && r() < 0.5; sp.windowAC = r() < 0.5;
  } else if (style === 'ranch') {
    sp.base = 0.32; sp.stilt = false; sp.finish = r() < 0.65 ? 'stucco' : 'lap';
    sp.roof = { type: r() < 0.55 ? 'hip' : 'gableX', cover: 'shingle', pitch: 0.28 + r() * 0.12, ov: 0.6 };
    sp.window = 'jalousie'; sp.awning = r() < 0.6; sp.shutter = r() < 0.3 ? 'panel' : 'none'; sp.porch = { kind: 'stoop', d: 1.6 };
    sp.carport = Math.abs(sp.drvU) < w / 2 + 4 && r() < 0.6; sp.windowAC = r() < 0.25;
  } else if (style === 'med') {
    sp.base = 0.3; sp.stilt = false; sp.finish = 'stucco'; sp.stories = d * w > 110 && r() < 0.45 ? 2 : 1; sp.wallH = 2.9;
    sp.roof = { type: 'hip', cover: 'barrel', pitch: 0.36 + r() * 0.08, ov: 0.45 };
    sp.window = 'arched'; sp.grille = r() < 0.7; sp.porch = { kind: 'loggia', d: Math.min(front - 0.3, 2.2) }; sp.shutter = r() < 0.35 ? 'panel' : 'none';
  } else if (style === 'deco') {
    sp.base = 0.45; sp.stilt = false; sp.finish = 'stucco'; sp.stories = 2; sp.wallH = 2.9;
    sp.roof = { type: 'flat', cover: 'flat', parapet: 0.9 + r() * 0.5, ov: 0 };
    sp.window = 'deco'; sp.porch = { kind: 'eyebrow', d: 1.2 }; sp.duplex = w > 8.5; sp.fin = r() < 0.75; sp.bands = 2 + ((r() * 2) | 0);
  } else if (style === 'mcm') {
    sp.base = 0.25; sp.stilt = false; sp.finish = 'stucco';
    sp.roof = { type: r() < 0.4 ? 'butterfly' : 'flat', cover: 'flat', pitch: 0.12, ov: 1.25, parapet: 0 };
    sp.window = 'ribbon'; sp.breeze = r() < 0.75; sp.stone = r() < 0.6; sp.porch = { kind: 'canopy', d: 1.8 }; sp.carport = Math.abs(sp.drvU) < w / 2 + 4 && r() < 0.7;
  } else { // bungalow
    sp.base = 0.65; sp.stilt = false; sp.finish = r() < 0.7 ? 'lap' : 'stucco';
    sp.roof = { type: r() < 0.7 ? 'gableZ' : 'hip', cover: r() < 0.6 ? 'shingle' : 'tin', pitch: 0.55 + r() * 0.2, ov: 0.45 };
    sp.window = 'sash'; sp.bars = r() < 0.6; sp.awning = r() < 0.35; sp.shutter = 'none'; sp.porch = { kind: 'porch', d: Math.min(front - 0.3, 2.3) };
    sp.windowAC = r() < 0.55; sp.ironFence = r() < 0.65;
  }
  // per-house odds
  sp.dish = r() < 0.35; sp.solar = style !== 'med' && style !== 'deco' && r() < 0.2; sp.acPad = r() < 0.85; sp.hose = r() < 0.6;
  sp.porchStuff = (r() * 4) | 0; sp.flamingos = r() < 0.12 ? 2 : 0; sp.number = 100 + ((r() * 9800) | 0);
  sp.lit = sp.colors.curtain.map(() => (r() < 0.55 ? 0.35 + r() * 0.65 : 0));
  sp.doorSide = (r() - 0.5) * 0.4;
  if (inp.yard) { // map lots: the generator also draws the yard (street-placed lots get theirs from world-dressing)
    const y = inp.yard; sp.yard = { gap: Math.max(1.5, y.gap), back: Math.max(0, y.back ?? 4), side: Math.max(0.8, y.side ?? 2.5) };
    sp.fence = { keys: 'picket', ranch: r() < 0.6 ? 'chain' : 'none', med: 'wall', deco: 'pipe', mcm: r() < 0.5 ? 'breeze' : 'none', bungalow: sp.ironFence ? 'iron' : 'chain' }[style];
    sp.pool = sp.yard.back > 8.5 && w > 8 && style !== 'bungalow' && r() < 0.55; sp.cage = sp.pool && (style === 'ranch' || style === 'mcm') && r() < 0.6;
    sp.car = r() < 0.65; sp.bins = r() < 0.8; sp.palms = 1 + ((r() * 3) | 0); sp.shrubs = 3 + ((r() * 5) | 0); sp.hedge = r() < 0.5;
  }
  sp.rng = r;
  return sp;
}

// ---------------------------------------------------------------- build
// sync build (preview, mid / far merges); buildHouseGen yields between sections so the world module can spread a
// full-detail build over several frames
export function buildHouse(hk, sp, lod = 0) { const g = buildHouseGen(hk, sp, lod); let r = g.next(); while (!r.done) r = g.next(); return r.value; }
export function* buildHouseGen(hk, sp, lod = 0) {
  const THREE = hk.THREE, kit = hk, M = kit.M, mat = kit.mat;
  const B = kit.batch('house'), cols = [], lamps = [];
  let s = (sp.seed * 7919 + lod * 13 + 5) >>> 0 || 1; const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const L0 = lod === 0, L1 = lod <= 1, C = sp.colors, wear0 = sp.wear;
  // draw-call budget: one material per surface family (about 9 per house at full detail)
  const PAINT = mat.paint({ peel: 'a', fade: 0.22 }), PEEL = PAINT, STUCCO = mat.stucco(), WOOD = mat.wood(), CONC = mat.concrete();
  const WIN = mat.houseWindow(), BULB = WIN, METAL = mat.metalPaint(), STEEL = METAL, PLAST = mat.plastic(), TIN = mat.tin(), SHING = mat.shingle();
  const MATS = { rubber: () => PLAST, matte: () => PLAST, ceramic: () => PLAST, pavers: () => CONC };
  const matX = new Proxy(mat, { get: (t, k) => MATS[k] || t[k] });
  const WALLM = sp.finish === 'stucco' ? STUCCO : PAINT;
  const vary = (c, a = 0.05) => kit.vary(c, r, a);
  const wr = (k = 0) => Math.max(0, Math.min(1, wear0 + k + (r() - 0.5) * 0.2));
  const w = sp.w, d = sp.d, x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const F = sp.base, H1 = sp.wallH, top = F + H1 * sp.stories, T = 0.16;
  const box = (m, sx, sy, sz, x, y, z, o = {}, ry = 0, rx = 0, rz = 0) => B.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), o);
  const col = (x, y, z, sx, sy, sz, ry = 0) => cols.push({ shape: 'box', p: [x, y, z], h: [sx / 2, sy / 2, sz / 2], ry });

  // ---------- wall frames ----------
  const mkWall = (a, b, id) => {
    const tx = b[0] - a[0], tz = b[1] - a[1], Lw = Math.hypot(tx, tz), ux = tx / Lw, uz = tz / Lw, nx = -uz, nz = ux, ry = Math.atan2(-uz, ux);
    return { id, a, b, L: Lw, ux, uz, nx, nz, ry, open: [],
      p: (u, o) => [a[0] + ux * u + nx * o, a[1] + uz * u + nz * o],
      m(u, y, o, rx = 0, ry2 = 0, rz = 0) { return M(a[0] + ux * u + nx * o, y, a[1] + uz * u + nz * o, rx, ry + ry2, rz); } };
  };
  const walls = { front: mkWall([x0, z1], [x1, z1], 'front'), right: mkWall([x1, z1], [x1, z0], 'right'), back: mkWall([x1, z0], [x0, z0], 'back'), left: mkWall([x0, z0], [x0, z1], 'left') };
  const wallList = [walls.front, walls.right, walls.back, walls.left];
  // u on the front wall from a plan x
  const uF = (x) => x - x0;

  // ---------- openings ----------
  const winW = { sash: 0.95, jalousie: 1.1, arched: 1.0, deco: 1.2, ribbon: 2.4 }[sp.window] || 1;
  const winH = { sash: 1.45, jalousie: 1.25, arched: 1.55, deco: 1.35, ribbon: 0.75 }[sp.window] || 1.4;
  const sill = sp.window === 'ribbon' ? 1.55 : 0.85;
  let ci = 0;
  const addWin = (Wl, u, floor, o = {}) => Wl.open.push({ kind: 'window', u, w: o.w ?? winW, sill: F + floor * H1 + (o.sill ?? sill), h: o.h ?? winH, type: o.type ?? sp.window, lit: sp.lit[ci % sp.lit.length], curtain: C.curtain[(ci++) % C.curtain.length], floor });
  const doorU = Math.max(1.2, Math.min(w - 1.2, w / 2 + sp.doorSide * w));
  const garage = (sp.style === 'med' || (sp.style === 'mcm' && !sp.carport) || (sp.style === 'ranch' && !sp.carport && r() < 0.5)) && w > 9.5 && sp.stories === 1 ? (sp.drvU > 0 ? 'right' : 'left') : null;
  const gW = 2.7;
  for (let fl = 0; fl < sp.stories; fl++) for (const Wl of wallList) {
    const isF = Wl.id === 'front', Lw = Wl.L, busy = [];
    if (isF && fl === 0) {
      if (sp.duplex) { for (const u of [Lw * 0.3, Lw * 0.7]) { Wl.open.push({ kind: 'door', u, w: 0.9, sill: F, h: 2.1 }); busy.push([u - 0.8, u + 0.8]); } }
      else { Wl.open.push({ kind: 'door', u: doorU, w: sp.style === 'med' ? 1.15 : 0.92, sill: F, h: sp.style === 'med' ? 2.3 : 2.08, arch: sp.style === 'med' }); busy.push([doorU - 0.9, doorU + 0.9]); }
      if (garage) { const gu = garage === 'right' ? Lw - gW / 2 - 0.5 : gW / 2 + 0.5; Wl.open.push({ kind: 'garage', u: gu, w: gW, sill: F - sp.base + 0.02, h: 2.25 }); busy.push([gu - gW / 2 - 0.4, gu + gW / 2 + 0.4]); }
    }
    if (Wl.id === 'back' && fl === 0 && !sp.stilt) { const u = Lw * (0.3 + r() * 0.4); Wl.open.push({ kind: sp.style === 'mcm' ? 'slider' : 'door', u, w: sp.style === 'mcm' ? 2.4 : 0.9, sill: F, h: 2.08, glazed: true }); busy.push([u - (sp.style === 'mcm' ? 1.5 : 0.8), u + (sp.style === 'mcm' ? 1.5 : 0.8)]); }
    if (Wl.id === 'front' && sp.stilt && fl === 0) { /* deck door already */ }
    const ww = winW + 0.9, n = Math.max(1, Math.floor((Lw - 0.6) / (ww + (isF ? 0.7 : 1.4))));
    for (let k = 0; k < n; k++) {
      const u = (Lw / n) * (k + 0.5) + (r() - 0.5) * 0.25;
      if (busy.some(([a, b]) => u + winW / 2 + 0.2 > a && u - winW / 2 - 0.2 < b)) continue;
      if (u - winW / 2 < 0.45 || u + winW / 2 > Lw - 0.45) continue;
      if (sp.style === 'deco' && !isF && r() < 0.35) { addWin(Wl, u, fl, { type: 'port', w: 0.7, h: 0.7, sill: 1.2 }); continue; }
      if (Wl.id !== 'front' && r() < 0.18) { addWin(Wl, u, fl, { w: 0.6, h: 0.6, sill: 1.45, type: sp.window === 'ribbon' ? 'ribbon' : sp.window === 'jalousie' ? 'jalousie' : 'sash' }); continue; }
      addWin(Wl, u, fl);
    }
    if (sp.style === 'deco' && isF && fl === 1) { if (!Wl.open.some((o) => o.floor === 1 && o.u > Lw - 1.6)) addWin(Wl, Lw - 0.75, 1, { type: 'corner', w: 1.2 }); }
  }

  // ---------- foundation / stilts ----------
  if (sp.stilt) {
    const xs = [], zs = [], nX = Math.max(3, Math.round(w / 3) + 1), nZ = Math.max(2, Math.round(d / 3.2) + 1);
    for (let i = 0; i < nX; i++) xs.push(x0 + 0.2 + (w - 0.4) * i / (nX - 1));
    for (let j = 0; j < nZ; j++) zs.push(z0 + 0.2 + (d - 0.4) * j / (nZ - 1));
    const zDeck = z1 + sp.porch.d - 0.15; zs.push(zDeck);
    for (const x of xs) for (const z of zs) {
      if (L1) B.cyl(WOOD, 0.14, 0.15, F + 0.3, M(x, (F + 0.3) / 2 - 0.3, z), { seg: L0 ? 10 : 6, color: vary(0x9a9388, 0.08), wear: 0.5 });
      if (L0) B.cyl(CONC, 0.24, 0.26, 0.12, M(x, 0.03, z), { seg: 10, color: 0xb8b2a6 });
      cols.push({ shape: 'cyl', p: [x, F / 2, z], r: 0.16, hh: F / 2 });
    }
    // girders on each z line, joists, cross braces
    for (const z of zs) box(WOOD, w + 0.3, 0.29, 0.09, 0, F - 0.32, z, { color: vary(0x8e877c), wear: 0.5 });
    if (L0) {
      for (let x = x0 + 0.2; x <= x1; x += 0.41) box(WOOD, 0.045, 0.235, zDeck - z0 + 0.1, x, F - 0.12, (z0 + zDeck) / 2, { color: vary(0x8e877c), wear: 0.4 });
      for (let i = 0; i < xs.length - 1; i++) { const z = zs[0], xa = xs[i], xb = xs[i + 1]; B.strut(WOOD, [xa, 0.25, z + 0.18], [xb, F - 0.5, z + 0.18], 0.14, 0.04, { color: vary(0x8e877c), wear: 0.6 }); }
      for (let j = 0; j < zs.length - 2; j++) { const x = xs[0]; B.strut(WOOD, [x - 0.18, 0.25, zs[j]], [x - 0.18, F - 0.5, zs[j + 1]], 0.14, 0.04, { color: vary(0x8e877c), wear: 0.6 }); B.strut(WOOD, [x1 - 0.02, 0.25, zs[j + 1]], [x1 - 0.02, F - 0.5, zs[j]], 0.14, 0.04, { color: vary(0x8e877c), wear: 0.6 }); }
    }
    // lattice skirt along the front between piles, storage room under one end
    if (sp.lattice && L1) {
      const y0 = 0.05, y1 = F - 0.5, zL = z1 - 0.2;
      if (L0) { for (let k = -1; k <= 1; k += 2) for (let t = -w / 2; t < w / 2 + (y1 - y0); t += 0.24) { const xa = Math.max(x0, Math.min(x1, t)), xb = Math.max(x0, Math.min(x1, t + k * (y1 - y0))); const ya = y0 + Math.abs(xa - t), yb = y0 + Math.abs(xb - t); if (Math.abs(xb - xa) < 0.05) continue; B.strut(PAINT, [xa, ya, zL + (k > 0 ? 0 : 0.02)], [xb, yb, zL + (k > 0 ? 0 : 0.02)], 0.035, 0.012, { color: vary(C.trim, 0.04), wear: wr(0.1) }); } }
      else box(PAINT, w, y1 - y0, 0.03, 0, (y0 + y1) / 2, zL, { color: kit.mul(C.trim, 0.85), wear: 0.4 });
      box(PAINT, w, 0.1, 0.05, 0, y1 + 0.05, zL, { color: C.trim, wear: wr() });
    }
    if (sp.storage) {
      const sx0 = sp.drvU > 0 ? x0 + 0.2 : x1 - 3.4, sx1 = sx0 + 3.2, sz0 = z0 + 0.3, sz1 = z0 + 3.3;
      if (L0) for (let x = sx0; x < sx1; x += 0.28) for (const z of [sz1]) box(PAINT, 0.26, F - 0.6, 0.025, x + 0.14, (F - 0.6) / 2 + 0.05, z, { color: vary(C.body), wear: wr(0.2), grain: 1 });
      else box(PAINT, sx1 - sx0, F - 0.6, 0.05, (sx0 + sx1) / 2, (F - 0.6) / 2 + 0.05, sz1, { color: C.body, wear: wr(0.2) });
      for (const x of [sx0, sx1]) box(PAINT, 0.04, F - 0.6, sz1 - sz0, x, (F - 0.6) / 2 + 0.05, (sz0 + sz1) / 2, { color: kit.mul(C.body, 0.95), wear: wr(0.2) });
      if (L1) box(PAINT, 0.85, 1.95, 0.045, (sx0 + sx1) / 2, 1.0, sz1 + 0.03, { color: C.trim, wear: wr(0.1) });
      col((sx0 + sx1) / 2, F / 2, (sz0 + sz1) / 2, sx1 - sx0, F, sz1 - sz0);
      if (L0) box(CONC, sx1 - sx0 + 0.6, 0.08, sz1 - sz0 + 0.6, (sx0 + sx1) / 2, 0.02, (sz0 + sz1) / 2, { color: 0xbab4a8 });
    }
    // floor platform
    box(WOOD, w + 0.12, 0.2, d + 0.12, 0, F - 0.1, 0, { color: vary(0x8a8478), wear: 0.5 });
  } else {
    // stem wall / slab edge with a painted water table
    box(sp.finish === 'stucco' ? STUCCO : CONC, w + 0.12, F + 0.05, d + 0.12, 0, (F + 0.05) / 2 - 0.05, 0, { color: sp.finish === 'stucco' ? kit.mul(C.body, 0.82) : 0xb3ada2, wear: 0.4 });
  }
  col(0, F + (top - F) / 2, 0, w, top - F, d);
  if (!sp.stilt) col(0, F / 2, 0, w + 0.1, F, d + 0.1);

  yield;
  // ---------- walls with openings ----------
  for (const Wl of wallList) {
    const holes = Wl.open.map((o) => ({ u0: o.u - o.w / 2 - (o.kind === 'window' && sp.window === 'arched' ? 0 : 0), u1: o.u + o.w / 2, y0: o.sill, y1: o.sill + o.h + (o.arch || (o.kind === 'window' && o.type === 'arched') ? o.w / 2 : 0) }));
    const yb = sp.stilt ? F : F, yt = top + (sp.roof.type === 'flat' || sp.roof.type === 'butterfly' ? (sp.roof.parapet || 0.25) : 0);
    // solid core (always), siding boards over it (near)
    solid(Wl, yb, yt, holes, WALLM, sp.finish === 'stucco' ? C.body : kit.mul(C.body, 0.92), sp.finish === 'stucco' ? -0.004 : -0.022);
    if (L0 && sp.finish === 'lap') lap(Wl, yb + 0.05, top - 0.05, () => [0, Wl.L], holes, C.body);
    if (L0 && sp.finish === 'vboard') vboard(Wl, yb + 0.05, () => top - 0.05, holes, C.body);
    // corner boards / quoins, water table, frieze
    if (sp.finish !== 'stucco') { for (const u of [0.06, Wl.L - 0.06]) box(PAINT, 0.13, top - yb, 0.05, ...wp(Wl, u, (yb + top) / 2, 0.03), { color: vary(C.trim, 0.03), wear: wr(0.1), grain: 1 }, Wl.ry); }
    if (L1) box(sp.finish === 'stucco' ? STUCCO : PAINT, Wl.L + 0.1, sp.finish === 'stucco' ? 0.18 : 0.14, 0.05, ...wp(Wl, Wl.L / 2, yb + 0.08, 0.035), { color: sp.finish === 'stucco' ? kit.mul(C.trim, 0.95) : C.trim, wear: wr(0.2) }, Wl.ry);
    if (L1 && sp.finish !== 'stucco') box(PAINT, Wl.L + 0.1, 0.2, 0.04, ...wp(Wl, Wl.L / 2, top - 0.1, 0.035), { color: C.trim, wear: wr(0.05) }, Wl.ry);
    // deco: horizontal speed bands, mcm stone veneer panel
    if (sp.style === 'deco' && L1 && (Wl.id === 'front' || Wl.id === 'left' || Wl.id === 'right')) for (let k = 0; k < sp.bands; k++) {
      const y = top + 0.15 - 0.22 * (k + 1); bandAround(Wl, y, 0.07, 0.06, holes, C.trim);
    }
    if (sp.style === 'deco' && L1) box(STUCCO, Wl.L + 0.18, 0.12, 0.12, ...wp(Wl, Wl.L / 2, F + H1 + 0.02, 0.06), { color: C.trim, wear: 0.3 }, Wl.ry);
    if (sp.stone && Wl.id === 'front' && L1) { const ua = sp.drvU > 0 ? 0.3 : Wl.L - 2.5, ub = ua + 2.2; if (!holes.some((h) => h.u1 > ua && h.u0 < ub)) box(mat.stoneVeneer(), ub - ua, top - F, 0.06, ...wp(Wl, (ua + ub) / 2, (F + top) / 2, 0.03), { color: 0xd8cfc0, wear: 0.3 }, Wl.ry); }
    for (const o of Wl.open) opening(Wl, o);
    yield;
  }

  // ---------- roof ----------
  roof();
  yield;

  // ---------- porch / entry ----------
  porch();
  yield;
  if (sp.carport) carport();
  extras();
  yield;
  const plants = [], cars = [], curb = []; // curb: library mailbox / carts spots (house-local) for src/world/props/lotProps.v2.js
  if (sp.yard) yard();
  if (lod < 2) livedIn();

  return { batch: B, colliders: cols, lamps, plants, cars, curb, spec: sp };

  // =================================================================== helpers
  function wp(Wl, u, y, o) { const [x, z] = Wl.p(u, o); return [x, y, z]; }
  // solid wall pieces around rectangular holes (outer face at o = 0)
  function solid(Wl, y0, y1, holes, m, color, o0) {
    const us = new Set([0, Wl.L]); for (const h of holes) { us.add(Math.max(0, Math.min(Wl.L, h.u0))); us.add(Math.max(0, Math.min(Wl.L, h.u1))); }
    const ua = [...us].sort((a, b) => a - b);
    for (let i = 0; i < ua.length - 1; i++) {
      const a = ua[i], b = ua[i + 1]; if (b - a < 0.005) continue; const um = (a + b) / 2;
      const cut = holes.filter((h) => h.u0 <= um && h.u1 >= um).map((h) => [h.y0, h.y1]).sort((p, q) => p[0] - q[0]);
      let y = y0;
      const emit = (ya, yb2) => { if (yb2 - ya < 0.01) return; box(m, b - a + (L0 ? 0 : 0.002), yb2 - ya, T, ...wp(Wl, um, (ya + yb2) / 2, o0 - T / 2), { color, wear: [Math.min(1, wear0 + 0.25), wear0 * 0.6], grain: 1, uv: [Wl.a[0] + Wl.a[1] + a * 0.7, ya] }, Wl.ry); };
      for (const [ha, hb] of cut) { emit(y, Math.min(y1, ha)); y = Math.max(y, hb); }
      emit(y, y1);
    }
  }
  function intervals(a, b, cuts) { let segs = [[a, b]]; for (const [c0, c1] of cuts) { const n = []; for (const [p, q] of segs) { if (c1 <= p || c0 >= q) { n.push([p, q]); continue; } if (c0 > p) n.push([p, c0]); if (c1 < q) n.push([c1, q]); } segs = n; } return segs.filter(([p, q]) => q - p > 0.04); }
  function lap(Wl, y0, y1, uRange, holes, color) {
    const bh = 0.2;
    for (let y = y0; y < y1 - 0.02; y += bh * 0.84) {
      const [ua, ub] = uRange(y + bh / 2); if (ub - ua < 0.1) continue;
      const cuts = holes.filter((h) => y + bh > h.y0 && y < h.y1).map((h) => [h.u0 - 0.07, h.u1 + 0.07]);
      const c = vary(color, 0.03), wv = wr(0.05);
      for (const [p, q] of intervals(ua, ub, cuts)) box(PAINT, q - p, bh, 0.022, ...wp(Wl, (p + q) / 2, y + bh / 2, 0.012), { color: c, wear: [Math.min(1, wv + 0.15), wv], grain: 0, bevel: 0.003 }, Wl.ry, -0.07);
    }
  }
  function vboard(Wl, y0, yTop, holes, color) {
    const bw = 0.29;
    for (let u = 0.02; u < Wl.L - 0.02; u += bw) {
      const yt = yTop(u + bw / 2), c = vary(color, 0.035), wv = wr(0.05);
      const cuts = holes.filter((h) => u + bw > h.u0 - 0.07 && u < h.u1 + 0.07).map((h) => [h.y0 - 0.07, h.y1 + 0.1]);
      const ww = Math.min(bw - 0.006, Wl.L - 0.02 - u);
      for (const [p, q] of intervals(y0, yt, cuts)) {
        box(PAINT, ww, q - p, 0.02, ...wp(Wl, u + ww / 2, (p + q) / 2, 0.01), { color: c, wear: [Math.min(1, wv + 0.25), wv * 0.7], grain: 1, bevel: 0.003 }, Wl.ry);
        if (u + bw < Wl.L - 0.05) box(PAINT, 0.055, q - p, 0.018, ...wp(Wl, u + bw - 0.003, (p + q) / 2, 0.029), { color: vary(color, 0.03), wear: wv, grain: 1, bevel: 0.004 }, Wl.ry);
      }
    }
  }
  function bandAround(Wl, y, h, o, holes, color) {
    const cuts = holes.filter((hh) => y + h > hh.y0 && y < hh.y1).map((hh) => [hh.u0 - 0.03, hh.u1 + 0.03]);
    for (const [p, q] of intervals(-0.03, Wl.L + 0.03, cuts)) box(STUCCO, q - p, h, o, ...wp(Wl, (p + q) / 2, y, o / 2), { color, wear: 0.25 }, Wl.ry);
  }

  // one opening: frame, glass, sashes, shutters, awnings, bars, doors
  function opening(Wl, o) {
    const uc = o.u, y0 = o.sill, y1 = o.sill + o.h, ow = o.w, trimC = vary(C.trim, 0.03), wv = wr(0.1);
    const B2 = (m, sx, sy, sz, u, y, oo, opt = {}, rx = 0, rz = 0) => box(m, sx, sy, sz, ...wp(Wl, u, y, oo), opt, Wl.ry, rx, rz);
    const glass = (u, y, gw, gh, oo = -0.06) => { B2(WIN, gw, gh, 0.012, u, y, oo, { color: o.curtain, wear: o.lit, uvS: 0 }); };
    if (o.kind === 'window') {
      const stucco = sp.finish === 'stucco';
      if (o.type === 'port') { // round porthole: ring of trim around a round glass
        const R = ow / 2, cy = y0 + R;
        B.cyl(WIN, R, R, 0.012, kit.mulM(Wl.m(uc, cy, -0.06), M(0, 0, 0, PI / 2)), { seg: 20, color: o.curtain, wear: o.lit });
        if (L1) B.geo(STUCCO, new THREE.TorusGeometry(R + 0.04, 0.05, 6, 22), Wl.m(uc, cy, 0.02), { color: C.trim, wear: 0.2 });
        if (L0) for (const a of [0, PI / 2]) B2(METAL, a ? 0.03 : ow, a ? ow : 0.03, 0.02, uc, cy, -0.04, { color: 0xe8e8e8 });
        return;
      }
      if (lod === 2) { glass(uc, (y0 + y1) / 2, ow, o.h, 0.02); return; }
      // jambs, head, sill (as reveal) and outside casing
      for (const s2 of [-1, 1]) B2(stucco ? STUCCO : PAINT, 0.04, o.h, T, uc + s2 * (ow / 2 - 0.02), (y0 + y1) / 2, -T / 2, { color: trimC, wear: wv });
      B2(stucco ? STUCCO : PAINT, ow, 0.04, T, uc, y1 - 0.02, -T / 2, { color: trimC, wear: wv });
      B2(stucco ? CONC : PAINT, ow + 0.22, 0.05, 0.12 + (stucco ? 0.02 : 0), uc, y0 - 0.01, 0.03, { color: stucco ? kit.mul(C.trim, 0.95) : trimC, wear: Math.min(1, wv + 0.2), bevel: 0.008 }, 0.12);
      if (!stucco) { for (const s2 of [-1, 1]) B2(PAINT, 0.09, o.h + 0.06, 0.025, uc + s2 * (ow / 2 + 0.04), (y0 + y1) / 2, 0.035, { color: trimC, wear: wv, grain: 1 }); B2(PAINT, ow + 0.22, 0.1, 0.03, uc, y1 + 0.05, 0.035, { color: trimC, wear: wv }); }
      else if (sp.style !== 'mcm' && o.type !== 'arched') { // stucco: raised band surround
        for (const s2 of [-1, 1]) B2(STUCCO, 0.08, o.h + 0.12, 0.035, uc + s2 * (ow / 2 + 0.04), (y0 + y1) / 2 + 0.02, 0.015, { color: kit.mul(C.trim, 0.98), wear: 0.2 });
        B2(STUCCO, ow + 0.16, 0.09, 0.035, uc, y1 + 0.045, 0.015, { color: kit.mul(C.trim, 0.98), wear: 0.2 });
      }
      // glass and sash / glazing detail
      const gw = ow - 0.08, gh = o.h - 0.06, yc = (y0 + y1) / 2;
      glass(uc, yc, gw, gh, -0.07);
      if (L0) {
        if (o.type === 'sash' || o.type === 'corner') { // two sashes, meeting rail, muntins
          B2(PAINT, gw, 0.05, 0.04, uc, yc, -0.05, { color: trimC, wear: wv });
          for (const y of [y0 + 0.05, y1 - 0.05]) B2(PAINT, gw, 0.05, 0.035, uc, y, -0.05, { color: trimC, wear: wv });
          for (const s2 of [-1, 1]) B2(PAINT, 0.045, gh, 0.035, uc + s2 * (gw / 2 - 0.02), yc, -0.05, { color: trimC, wear: wv });
          if (r() < 0.6) { B2(PAINT, 0.02, gh / 2 - 0.05, 0.02, uc, yc + gh / 4, -0.055, { color: trimC, wear: wv }); B2(PAINT, gw, 0.02, 0.02, uc, yc + gh / 4, -0.055, { color: trimC, wear: wv }); }
        } else if (o.type === 'jalousie') { // aluminum frame with tilted glass louvers and a crank
          for (const s2 of [-1, 1]) B2(STEEL, 0.035, gh, 0.05, uc + s2 * (gw / 2 - 0.017), yc, -0.05, { color: 0xc4c6c4 });
          const nl = Math.floor(gh / 0.105);
          for (let k = 0; k < nl; k++) B2(WIN, gw - 0.07, 0.1, 0.006, uc, y0 + 0.08 + k * (gh - 0.04) / nl, -0.03, { color: o.curtain, wear: o.lit }, -0.55);
          B2(STEEL, 0.025, 0.08, 0.04, uc + gw / 2 - 0.12, y0 + 0.1, -0.11, { color: 0x9a9a98 });
        } else if (o.type === 'arched') { // casement pair, arched transom with radial muntins, keystone
          B2(PAINT, 0.04, gh, 0.04, uc, yc, -0.05, { color: 0x3a2a20, wear: 0.2 });
          B2(PAINT, gw, 0.04, 0.04, uc, y1 - 0.05, -0.05, { color: 0x3a2a20, wear: 0.2 });
        } else if (o.type === 'deco' || o.type === 'ribbon') { // steel casements with horizontal muntins
          const nb = o.type === 'deco' ? 3 : 1;
          for (let k = 1; k <= nb; k++) B2(METAL, gw, 0.025, 0.03, uc, y0 + 0.03 + (gh * k) / (nb + 1), -0.05, { color: o.type === 'deco' ? 0xf2f2ee : 0x2b2b2b });
          const nv = o.type === 'ribbon' ? 4 : 2; for (let k = 1; k < nv; k++) B2(METAL, 0.03, gh, 0.03, uc - gw / 2 + (gw * k) / nv, yc, -0.05, { color: o.type === 'deco' ? 0xf2f2ee : 0x2b2b2b });
        }
        // insect screen tint on lower sash of some
      }
      // arched head: half-ring of stucco trim with keystone, glass fan
      if (o.type === 'arched') {
        const R = ow / 2, cy = y1;
        const fan = new THREE.CircleGeometry(R - 0.04, 14, 0, PI); B.geo(WIN, fan, Wl.m(uc, cy, -0.07), { color: o.curtain, wear: o.lit });
        if (L1) { const ring = new THREE.RingGeometry(R - 0.02, R + 0.09, 16, 1, 0, PI); B.geo(STUCCO, ring, Wl.m(uc, cy, 0.03), { color: C.trim, wear: 0.2 }); B2(STUCCO, 0.16, 0.24, 0.06, uc, cy + R + 0.04, 0.04, { color: kit.mul(C.trim, 0.96), wear: 0.25 }); }
        // fill the stucco corners above the rectangle hole around the arch
        const cnr = new THREE.Shape(); cnr.moveTo(-R, 0); cnr.lineTo(-R, R); cnr.lineTo(R, R); cnr.lineTo(R, 0); cnr.absarc(0, 0, R, 0, PI, false);
        B.geo(STUCCO, new THREE.ShapeGeometry(cnr, 8), Wl.m(uc, cy, -0.004), { color: C.body, wear: 0.3, uvMul: [1 / 1.4, 1 / 1.4] });
      }
      // mid range keeps shutters, awnings and AC units as single solids (slats, struts, bars only up close)
      // shutters
      const sh = o.type === 'sash' || o.type === 'arched' || o.type === 'jalousie' ? sp.shutter : 'none';
      if (sh === 'bahama' && o.floor === 0) { // top-hinged, propped open on two struts
        const sw = ow + 0.16, sh2 = o.h + 0.08, ang = 0.55 + r() * 0.25, cy = y1 + 0.08 - Math.cos(ang) * sh2 / 2, oo = Math.sin(ang) * sh2 / 2 + 0.05;
        // r2-keys (user review item 10): up close the shutter is a real louvered frame (stiles, rails, blades set INSIDE the frame
        // depth) instead of a solid panel with thin slats hovering on / through its face (that read as a thin layered model and
        // crawled into dots); farther out one solid panel. Same r() sequence as before.
        // the tilt sign follows the wall frame: the leaf hangs from the hinge and swings its bottom OUT (the old solid panel had the
        // opposite tilt on some walls, hidden because a symmetric box looks the same both ways)
        const outZ = (() => { const [xa, za] = Wl.p(uc, 0), [xb, zb] = Wl.p(uc, 1); return (xb - xa) * Math.sin(Wl.ry) + (zb - za) * Math.cos(Wl.ry); })(), ra = outZ > 0 ? -ang : ang;
        const fc = { color: vary(C.accent), wear: wr(0.2) }, at = (t) => [y1 + 0.08 - t * Math.cos(ang), 0.05 + t * Math.sin(ang)];
        if (!L0) B2(PEEL, sw, sh2, 0.035, uc, cy, oo, fc, ra);
        else { for (const s3 of [-1, 1]) B2(PEEL, 0.065, sh2, 0.04, uc + s3 * (sw / 2 - 0.0325), cy, oo, fc, ra);
          for (const t of [0.045, sh2 - 0.045]) { const [yy, zz] = at(t); B2(PEEL, sw - 0.13, 0.09, 0.04, uc, yy, zz, fc, ra); }
          for (let k = 0; k < 9; k++) { const t = 0.1 + (k + 0.5) * (sh2 - 0.2) / 9, [yy, zz] = at(t); B2(PEEL, sw - 0.13, (sh2 - 0.2) / 9 * 1.12, 0.014, uc, yy, zz, { color: vary(C.accent, 0.04), wear: wr(0.25) }, ra + Math.sign(ra) * 0.55); } }
        if (L0) for (const s2 of [-1, 1]) B.rod(STEEL, wp(Wl, uc + s2 * (sw / 2 - 0.1), y0 + 0.15, 0.04), wp(Wl, uc + s2 * (sw / 2 - 0.1), cy - Math.cos(ang) * sh2 / 2 + 0.02, oo + Math.sin(ang) * sh2 / 2), 0.008, { color: 0x8a8a86 });
      } else if (sh === 'louver' || sh === 'panel' || (sh === 'bahama' && o.floor > 0)) { // side-hinged pair, open against the wall
        for (const s2 of [-1, 1]) {
          const cu = uc + s2 * (ow / 2 + 0.06 + ow / 4);
          // r2-keys: louvered leaf = stiles + rails + blades within the frame depth up close (no backing panel with slats through
          // its face); a raised-panel leaf keeps its panel; farther out one solid leaf. Same r() sequence as before.
          const fc = { color: vary(C.accent), wear: wr(0.2) }, lh = o.h + 0.06, yc2 = (y0 + y1) / 2, nk = Math.floor(o.h / 0.075);
          if (sh !== 'panel' && L0) { for (const s3 of [-1, 1]) B2(PEEL, 0.055, lh, 0.034, cu + s3 * (ow / 4 - 0.0275), yc2, 0.05, fc);
            for (const yy of [y0 - 0.03 + 0.045, y1 + 0.03 - 0.045]) B2(PEEL, ow / 2 - 0.11, 0.09, 0.034, cu, yy, 0.05, fc);
            const pitch = (lh - 0.18) / nk; for (let k = 0; k < nk; k++) B2(PEEL, ow / 2 - 0.11, pitch * 1.15, 0.012, cu, y0 - 0.03 + 0.09 + (k + 0.5) * pitch, 0.05, { color: vary(C.accent, 0.03), wear: wr(0.25) }, -0.6); }
          else { B2(PEEL, ow / 2, lh, 0.03, cu, yc2, 0.05, fc); if (L0) for (const fy of [0.3, 0.72]) B2(PEEL, ow / 2 - 0.1, o.h * 0.36, 0.012, cu, y0 + o.h * fy, 0.069, { color: kit.mul(C.accent, 0.92), wear: wr(0.2) }); }
          if (sh !== 'panel' && L0) B2(STEEL, 0.03, 0.05, 0.03, cu + s2 * (ow / 4 - 0.02), (y0 + y1) / 2, 0.08, { color: 0x2a2a2a });
        }
      }
      // metal awning (ranch / bungalow): striped aluminum hood on arms
      if (sp.awning && o.floor === 0 && Wl.id !== 'back' && o.h > 1) {
        const aw = ow + 0.35, dep = 0.65, ya = y1 + 0.22;
        if (!L0) B2(METAL, aw, 0.03, dep + 0.06, uc, ya - dep * 0.35, dep / 2, { color: vary(C.accent, 0.03) }, 0.62);
        else for (let k = 0; k < Math.round(aw / 0.15); k++) B2(METAL, 0.15, 0.012, dep + 0.06, uc - aw / 2 + 0.075 + k * 0.15, ya - dep * 0.35, dep / 2, { color: k % 2 ? 0xf2f0ea : vary(C.accent, 0.03) }, 0.62);
        B2(METAL, aw, 0.12, 0.012, uc, ya - dep * 0.62 - 0.03, dep - 0.02, { color: 0xf2f0ea });
        if (L0) for (const s2 of [-1, 1]) B.rod(STEEL, wp(Wl, uc + s2 * aw / 2, y1 - 0.25, 0.02), wp(Wl, uc + s2 * aw / 2, ya - dep * 0.6, dep - 0.04), 0.01, { color: 0xb8b8b4 });
      }
      // security bars / iron grille
      if ((sp.bars || sp.grille) && o.floor === 0 && L0) {
        const n = Math.round(ow / 0.12), ga = o.type === 'arched' ? o.h + ow * 0.4 : o.h;
        for (let k = 0; k <= n; k++) B2(METAL, 0.018, ga, 0.018, uc - ow / 2 + (ow * k) / n, y0 + ga / 2, 0.06, { color: 0x1c1c1c });
        for (const fy of [0.08, 0.5, 0.92]) B2(METAL, ow + 0.04, 0.025, 0.015, uc, y0 + ga * fy, 0.06, { color: 0x1c1c1c });
        if (sp.grille) for (let k = 0; k < n; k += 2) B.geo(METAL, new THREE.TorusGeometry(0.05, 0.008, 4, 10), Wl.m(uc - ow / 2 + (ow * (k + 1)) / n, y0 + ga * 0.29, 0.06), { color: 0x1c1c1c });
      }
      // window AC unit in some lower sashes
      if (sp.windowAC && o.floor === 0 && Wl.id !== 'front' && o.type === 'sash' && r() < 0.35) {
        B2(METAL, ow - 0.12, 0.38, 0.55, uc, y0 + 0.22, 0.12, { color: 0xd8d6cc, wear: 0.4 });
        if (L0) for (let k = 0; k < 7; k++) B2(METAL, ow - 0.25, 0.012, 0.01, uc, y0 + 0.08 + k * 0.04, 0.4, { color: 0x8a8a84 });
        B2(METAL, ow - 0.1, 0.03, 0.4, uc, y0 + 0.02, 0.25, { color: 0x6a6a64 });
      }
      return;
    }
    if (o.kind === 'door' || o.kind === 'slider') {
      if (lod === 2) return;
      const dw = o.w, dh = o.h, yc = y0 + dh / 2, doorC = o.kind === 'slider' ? 0xd0d0cc : vary(C.accent, 0.04);
      B2(PAINT, dw + 0.2, 0.1, 0.05, uc, y0 + dh + 0.05, 0.03, { color: trimC, wear: wv });
      for (const s2 of [-1, 1]) B2(PAINT, 0.1, dh, 0.05, uc + s2 * (dw / 2 + 0.05), yc, 0.03, { color: trimC, wear: wv, grain: 1 });
      if (o.kind === 'slider') { glass(uc, yc, dw - 0.06, dh - 0.06, -0.06); if (L0) { B2(METAL, 0.05, dh, 0.06, uc, yc, -0.05, { color: 0xc8c8c4 }); for (const y of [y0 + 0.03, y0 + dh - 0.03]) B2(METAL, dw, 0.05, 0.06, uc, y, -0.05, { color: 0xc8c8c4 }); } return; }
      B2(PAINT, dw, dh, 0.05, uc, yc, -0.06, { color: doorC, wear: wr(0.1), grain: 1 });
      if (L0) {
        if (o.glazed || r() < 0.4) glass(uc, y0 + dh * 0.72, dw * 0.55, dh * 0.32, -0.03);
        else for (const fy of [0.27, 0.72]) for (const s2 of [-1, 1]) B2(PAINT, dw * 0.34, dh * 0.34, 0.015, uc + s2 * dw * 0.22, y0 + dh * fy, -0.03, { color: kit.mul(doorC, 0.93), wear: wr(0.1) });
        B.cyl(STEEL, 0.03, 0.03, 0.05, kit.mulM(Wl.m(uc + dw / 2 - 0.12, y0 + 1.0, -0.01), M(0, 0, 0, PI / 2)), { color: 0xb89a50, seg: 8 });
        B2(CONC, dw + 0.4, 0.04, 0.35, uc, y0 + 0.01, 0.17, { color: 0xb8b2a6 });          // threshold
        if (Wl.id === 'front') {
          // house numbers
          const digs = String(sp.number).split('').map(Number), dW = 0.11;
          for (let k = 0; k < digs.length; k++) { const g = new THREE.PlaneGeometry(dW, 0.16); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (digs[k] + uv.getX(i)) / 10); B.geo(mat.digits(), g, Wl.m(uc + dw / 2 + 0.3 + (k - (digs.length - 1) / 2) * dW, y0 + 1.75, 0.02), { color: sp.style === 'mcm' ? 0x1a1a1a : 0xc8a050 }); }
          // porch light
          const lu = uc - dw / 2 - 0.3, ly = y0 + 1.85;
          B2(METAL, 0.12, 0.26, 0.08, lu, ly, 0.06, { color: 0x2a2a2a });
          B2(BULB, 0.08, 0.16, 0.06, lu, ly - 0.02, 0.1, { color: 0xfff0d0, wear: sp.lit[0] > 0 || r() < 0.6 ? 1 : 0 });
          lamps.push({ pos: wp(Wl, lu, ly, 0.3), color: 0xffcf96, intensity: 26, range: 7 });
          // doormat
          B2(matX.rubber(), 0.8, 0.012, 0.5, uc, y0 + 0.006, 0.45, { color: [0x5a4030, 0x2a3a4a, 0x6a2a2a][(r() * 3) | 0] });
        }
      }
      if (o.arch && L1) { const R = dw / 2 + 0.1; const ring = new THREE.RingGeometry(R, R + 0.14, 16, 1, 0, PI); B.geo(STUCCO, ring, Wl.m(uc, y0 + dh, 0.04), { color: C.trim, wear: 0.2 }); const cn = new THREE.Shape(); cn.moveTo(-R, 0); cn.lineTo(-R, R); cn.lineTo(R, R); cn.lineTo(R, 0); cn.absarc(0, 0, R, 0, PI, false); B.geo(STUCCO, new THREE.ShapeGeometry(cn, 8), Wl.m(uc, y0 + dh, -0.004), { color: C.body, wear: 0.3, uvMul: [0.7, 0.7] }); B2(PAINT, dw, 0.05, 0.05, uc, y0 + dh + 0.025, -0.06, { color: kit.mul(C.accent, 0.9) }); const fan = new THREE.CircleGeometry(R - 0.02, 12, 0, PI); B.geo(WIN, fan, Wl.m(uc, y0 + dh, -0.07), { color: o.curtain || 0xe8dcc0, wear: 0.6 }); }
      return;
    }
    if (o.kind === 'garage') {
      const gw = o.w, gh = o.h, yc = y0 + gh / 2;
      B2(METAL, gw, gh, 0.05, uc, yc, -0.07, { color: sp.style === 'med' ? 0x6a4a30 : 0xf0eee8, wear: 0.3 });
      if (L1) for (let k = 1; k < 4; k++) B2(METAL, gw, 0.025, 0.02, uc, y0 + (gh * k) / 4, -0.04, { color: sp.style === 'med' ? 0x5a3a24 : 0xd8d6d0 });
      if (L0) { for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) B2(METAL, gw / 4 - 0.12, gh / 4 - 0.12, 0.015, uc - gw / 2 + gw / 8 + (gw * j) / 4, y0 + gh / 8 + (gh * k) / 4, -0.035, { color: sp.style === 'med' ? 0x7a5a3c : 0xfafaf6, wear: 0.3 }); for (let j = 0; j < 4; j++) glass(uc - gw / 2 + gw / 8 + (gw * j) / 4, y0 + gh * 0.85, gw / 4 - 0.2, 0.22, -0.02); }
      for (const s2 of [-1, 1]) B2(sp.finish === 'stucco' ? STUCCO : PAINT, 0.12, gh, 0.06, uc + s2 * (gw / 2 + 0.06), yc, 0.03, { color: C.trim, wear: wv });
      B2(sp.finish === 'stucco' ? STUCCO : PAINT, gw + 0.36, 0.14, 0.06, uc, y0 + gh + 0.07, 0.03, { color: C.trim, wear: wv });
    }
  }

  // ---------------------------------------------------------------- roof
  function roof() {
    const R = sp.roof, ov = R.ov, ex0 = x0 - ov, ex1 = x1 + ov, ez0 = z0 - ov, ez1 = z1 + ov, eaveY = top + 0.02;
    const roofC = vary(C.roof, 0.04);
    if (R.type === 'flat' || R.type === 'butterfly') {
      const pY = top + (R.parapet || 0.2);
      if (R.type === 'flat' && R.ov < 0.3) { // parapet roof (deco): coping, roof deck below, scuppers
        box(CONC, w - 0.2, 0.06, d - 0.2, 0, top + 0.05, 0, { color: 0x9a968e, wear: 0.6 });
        for (const Wl of wallList) box(STUCCO, Wl.L + 0.12, 0.08, T + 0.1, ...wp(Wl, Wl.L / 2, pY + 0.04, -T / 2), { color: C.trim, wear: 0.4 }, Wl.ry);
        if (sp.style === 'deco' && L1) { // stepped central parapet with a fin
          const Wl = walls.front, uc = sp.fin ? Wl.L * (r() < 0.5 ? 0.25 : 0.75) : Wl.L / 2;
          box(STUCCO, 2.4, 0.7, T, ...wp(Wl, Wl.L / 2, pY + 0.35, -T / 2), { color: C.body, wear: 0.3 }, Wl.ry); box(STUCCO, 2.5, 0.08, T + 0.1, ...wp(Wl, Wl.L / 2, pY + 0.74, -T / 2), { color: C.trim, wear: 0.4 }, Wl.ry);
          box(STUCCO, 1.4, 0.45, T, ...wp(Wl, Wl.L / 2, pY + 0.92, -T / 2), { color: C.body, wear: 0.3 }, Wl.ry);
          if (sp.fin) { box(STUCCO, 0.3, top - F + 1.6, 0.7, ...wp(Wl, uc, (F + 0.3 + top + 1.6) / 2, 0.35), { color: C.trim, wear: 0.25 }, Wl.ry); for (let k = 0; k < 3; k++) box(STUCCO, 0.34, 0.06, 0.74, ...wp(Wl, uc, top + 1.2 - k * 0.25, 0.35), { color: C.body, wear: 0.25 }, Wl.ry); }
        }
        if (L0) for (const u of [0.6, walls.back.L - 0.6]) box(METAL, 0.18, 0.12, 0.35, ...wp(walls.back, u, top + 0.08, 0.15), { color: 0x8a8a84 }, walls.back.ry);
        cols.push({ shape: 'box', p: [0, pY / 2 + top / 2, 0], h: [w / 2, (pY - top) / 2 + 0.05, d / 2], ry: 0 });
        return;
      }
      // mid-century: thin flat or butterfly roof with deep eaves, exposed beam ends, fascia
      const th = 0.22;
      if (R.type === 'flat') {
        box(CONC, ex1 - ex0, th, ez1 - ez0, 0, eaveY + 0.25 + th / 2, (ez0 + ez1) / 2, { color: 0xd8d4cc, wear: 0.4 });
        box(PAINT, ex1 - ex0 + 0.04, 0.3, 0.06, 0, eaveY + 0.35, ez1, { color: C.trim, wear: wr() }); box(PAINT, ex1 - ex0 + 0.04, 0.3, 0.06, 0, eaveY + 0.35, ez0, { color: C.trim, wear: wr() });
        for (const x of [ex0, ex1]) box(PAINT, 0.06, 0.3, ez1 - ez0, x, eaveY + 0.35, (ez0 + ez1) / 2, { color: C.trim, wear: wr() });
        if (L0) for (let x = x0 + 0.4; x < x1; x += 1.2) box(WOOD, 0.1, 0.2, ez1 - ez0 + 0.25, x, eaveY + 0.12, (ez0 + ez1) / 2, { color: 0x6a5240, wear: 0.4 });
        // clerestory band under the roof (glass strip)
        if (L1) box(WIN, w - 0.4, 0.22, 0.02, 0, top + 0.13, z1 + 0.012, { color: 0xe8dcc0, wear: 0.4 });
      } else {
        const dzh = (ez1 - ez0) / 2, rise = 0.6;
        for (const sgn of [-1, 1]) { const zc = sgn * dzh / 2 + (ez0 + ez1) / 2, ang = Math.atan2(rise, dzh) * sgn;
          box(CONC, ex1 - ex0, th, Math.hypot(dzh, rise), 0, eaveY + 0.3 + rise / 2, zc, { color: 0xd8d4cc, wear: 0.4 }, 0, ang);
          box(PAINT, ex1 - ex0 + 0.04, 0.28, 0.06, 0, eaveY + 0.3 + rise + 0.02, sgn > 0 ? ez1 : ez0, { color: C.trim, wear: wr() }); }
        for (const x of [ex0, ex1]) { const sh = new THREE.Shape(); sh.moveTo(ez0, 0); sh.lineTo((ez0 + ez1) / 2, -rise); sh.lineTo(ez1, 0); sh.lineTo(ez1, -0.3); sh.lineTo((ez0 + ez1) / 2, -rise - 0.3); sh.lineTo(ez0, -0.3); sh.lineTo(ez0, 0);
          B.geo(PAINT, new THREE.ShapeGeometry(sh), M(x + (x > 0 ? 0.031 : -0.031), eaveY + 0.3 + rise + 0.02, 0, 0, x > 0 ? PI / 2 : -PI / 2, 0), { color: C.trim, wear: 0.3 }); }
        // glass gable infill between wall top and the V
        for (const Wl of [walls.left, walls.right]) if (L1) { const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(d, 0); tri.lineTo(d, rise * (d / (ez1 - ez0)) + 0.25); tri.lineTo(d / 2, 0.25); tri.lineTo(0, rise * (d / (ez1 - ez0)) + 0.25); B.geo(WIN, new THREE.ShapeGeometry(tri), Wl.m(0, top, -0.02), { color: 0xe8dcc0, wear: 0.35 }); }
      }
      cols.push({ shape: 'box', p: [0, eaveY + 0.4, (ez0 + ez1) / 2], h: [(ex1 - ex0) / 2, 0.15, (ez1 - ez0) / 2], ry: 0 });
      return;
    }
    // pitched: build planes as (P0,P1 eave left/right, P2,P3 top right/left)
    const planes = [], gables = [];
    const pitch = R.pitch;
    if (R.type === 'gableX') { const half = (ez1 - ez0) / 2, rise = half * pitch, zr = (ez0 + ez1) / 2, ry2 = eaveY + rise;
      planes.push([[ex0, eaveY, ez1], [ex1, eaveY, ez1], [ex1, ry2, zr], [ex0, ry2, zr]], [[ex1, eaveY, ez0], [ex0, eaveY, ez0], [ex0, ry2, zr], [ex1, ry2, zr]]);
      gables.push([walls.left, d / 2, (d / 2) * pitch], [walls.right, d / 2, (d / 2) * pitch]);
    } else if (R.type === 'gableZ') { const half = (ex1 - ex0) / 2, rise = half * pitch, xr = (ex0 + ex1) / 2, ry2 = eaveY + rise;
      planes.push([[ex1, eaveY, ez1], [ex1, eaveY, ez0], [xr, ry2, ez0], [xr, ry2, ez1]], [[ex0, eaveY, ez0], [ex0, eaveY, ez1], [xr, ry2, ez1], [xr, ry2, ez0]]);
      gables.push([walls.front, w / 2, (w / 2) * pitch], [walls.back, w / 2, (w / 2) * pitch]);
    } else { // hip
      const Wx = ex1 - ex0, Dz = ez1 - ez0, m2 = Math.min(Wx, Dz) / 2, rise = m2 * pitch, ry2 = eaveY + rise;
      if (Wx >= Dz) { const zr = (ez0 + ez1) / 2, ra = ex0 + m2, rb = ex1 - m2;
        planes.push([[ex0, eaveY, ez1], [ex1, eaveY, ez1], [rb, ry2, zr], [ra, ry2, zr]], [[ex1, eaveY, ez0], [ex0, eaveY, ez0], [ra, ry2, zr], [rb, ry2, zr]], [[ex1, eaveY, ez1], [ex1, eaveY, ez0], [rb, ry2, zr], [rb, ry2, zr]], [[ex0, eaveY, ez0], [ex0, eaveY, ez1], [ra, ry2, zr], [ra, ry2, zr]]);
      } else { const xr = (ex0 + ex1) / 2, ra = ez1 - m2, rb = ez0 + m2;
        planes.push([[ex1, eaveY, ez1], [ex1, eaveY, ez0], [xr, ry2, rb], [xr, ry2, ra]], [[ex0, eaveY, ez0], [ex0, eaveY, ez1], [xr, ry2, ra], [xr, ry2, rb]], [[ex0, eaveY, ez1], [ex1, eaveY, ez1], [xr, ry2, ra], [xr, ry2, ra]], [[ex1, eaveY, ez0], [ex0, eaveY, ez0], [xr, ry2, rb], [xr, ry2, rb]]); }
    }
    for (const pl of planes) roofPlane(pl, R.cover, roofC);
    // gable end walls (wall finish), barge boards
    for (const [Wl, halfU, rise] of gables) {
      const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(Wl.L, 0); tri.lineTo(halfU, rise + 0.02); tri.lineTo(0, 0);
      B.geo(WALLM, new THREE.ShapeGeometry(tri), Wl.m(0, top, sp.finish === 'stucco' ? 0 : -0.02), { color: sp.finish === 'stucco' ? C.body : kit.mul(C.body, 0.92), wear: wear0, uvMul: [1 / 1.4, 1 / 1.4] });
      if (L0 && sp.finish === 'lap') lap(Wl, top, top + rise, (y) => { const t = (y - top) / rise; return [halfU * t, Wl.L - halfU * t]; }, [], C.body);
      if (L0 && sp.finish === 'vboard') vboard(Wl, top, (u) => top + rise * Math.max(0, Math.min(u / halfU, (Wl.L - u) / halfU)), [], C.body);
      if (L1) { // gable vent
        const vy = top + rise * 0.45; box(PAINT, 0.6, 0.5, 0.04, ...wp(Wl, halfU, vy, 0.04), { color: C.trim, wear: wr() }, Wl.ry);
        if (L0) for (let k = 0; k < 6; k++) box(PAINT, 0.5, 0.05, 0.012, ...wp(Wl, halfU, vy - 0.18 + k * 0.07, 0.07), { color: kit.mul(C.trim, 0.8) }, Wl.ry, -0.6);
      }
      const ovU = sp.roof.ov, ph = rise / halfU;
      for (const sgn of [-1, 1]) { const ua = sgn < 0 ? -ovU : Wl.L + ovU, ub = halfU; const a = wp(Wl, ua, top + 0.02 - ovU * ph + 0.08, ovU + 0.03), b = wp(Wl, ub, top + rise + 0.1, ovU + 0.03); B.strut(PAINT, a, b, 0.2, 0.04, { color: C.trim, wear: wr(0.1), roll: 0 }); }
    }
    // fascia + gutter along each eave, soffit
    for (const pl of planes) { const [a, b] = pl; if (Math.abs(a[1] - eaveY) > 0.01 || Math.abs(b[1] - eaveY) > 0.01) continue;
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]), ry = Math.atan2(-(b[2] - a[2]), b[0] - a[0]), cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2;
      const nx = -(b[2] - a[2]) / len, nz = (b[0] - a[0]) / len;
      box(PAINT, len, 0.2, 0.035, cx, eaveY - 0.06, cz, { color: C.trim, wear: wr(0.05) }, ry);
      if (L1) box(PAINT, len - 0.1, 0.03, ov, cx - nx * ov / 2, eaveY - 0.15, cz - nz * ov / 2, { color: kit.mul(C.trim, 0.9), wear: wr(0.1) }, ry);
      if (L0 && sp.style !== 'keys' || (L0 && r() < 0.5)) { box(METAL, len, 0.12, 0.13, cx + nx * 0.08, eaveY - 0.05, cz + nz * 0.08, { color: 0xeeece6 }, ry); }
    }
    if (L0) { // downspouts at two corners
      for (const [x, z] of [[x1 + 0.08, z1 + 0.08], [x0 - 0.08, z0 - 0.08]]) { box(METAL, 0.07, top - 0.1, 0.07, x, (top - 0.1) / 2 + 0.05, z, { color: 0xeeece6 }); box(METAL, 0.07, 0.07, 0.4, x, 0.08, z + (z > 0 ? 0.2 : -0.2), { color: 0xeeece6 }); }
    }
    cols.push({ shape: 'box', p: [0, eaveY + 0.6, 0], h: [w / 2 + 0.2, 0.6, d / 2 + 0.2], ry: 0 });
  }
  // one pitched roof plane with its covering
  function roofPlane(pl, cover, roofC) {
    const [P0, P1, P2, P3] = pl, V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
    const p0 = V(P0), p1 = V(P1), p2 = V(P2), p3 = V(P3), uAx = p1.clone().sub(p0), Lu = uAx.length(); uAx.normalize();
    const mid23 = p3.clone().add(p2).multiplyScalar(0.5), up = mid23.clone().sub(p0); up.sub(uAx.clone().multiplyScalar(up.dot(uAx))); const Hv = up.length(); const vAx = up.clone().normalize();
    const nrm = new THREE.Vector3().crossVectors(uAx, vAx).normalize(); if (nrm.y < 0) nrm.negate();
    const ua = p3.clone().sub(p0).dot(uAx), ub = p2.clone().sub(p0).dot(uAx);
    const basis = new THREE.Matrix4().makeBasis(uAx, vAx, nrm).setPosition(p0);
    const at = (u, v, o) => new THREE.Matrix4().multiplyMatrices(basis, M(u, v, o));
    // deck (sheathing) under the covering
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(Lu, 0); sh.lineTo(ub, Hv); sh.lineTo(ua, Hv); sh.lineTo(0, 0);
    const deckM = cover === 'tin' ? TIN : cover === 'shingle' ? SHING : STUCCO;
    const g = new THREE.ShapeGeometry(sh); B.geo(deckM, g, at(0, 0, 0.01), { color: cover === 'barrel' ? kit.mul(roofC, 0.8) : roofC, wear: cover === 'tin' ? 0.3 + wear0 * 0.6 : wear0, uvMul: cover === 'tin' ? [1, 1 / Math.max(1, Hv)] : [1 / (deckM.userData.uvScale || 1), 1 / (deckM.userData.uvScale || 1)] });
    const under = new THREE.ShapeGeometry(sh); { const na = under.attributes.normal; for (let i = 0; i < na.count; i++) na.setZ(i, -na.getZ(i)); under.setIndex(Array.from(under.index.array).reverse()); } B.geo(WOOD, under, at(0, 0, -0.005), { color: 0x7a7468, wear: 0.4 });
    const vmax = (u) => (u < ua ? Hv * (ua > 0 ? u / ua : 1) : u > ub ? Hv * (Lu - ub > 0 ? (Lu - u) / (Lu - ub) : 1) : Hv);
    if (cover === 'tin' && L1) { // standing ribs every 0.23 m (mid: every 0.46)
      const st = L0 ? 0.23 : 0.46;
      for (let u = 0.1; u < Lu - 0.05; u += st) { const vm = vmax(u); if (vm < 0.1) continue; B.box(TIN, 0.03, vm, 0.025, at(u, vm / 2, 0.022), { color: roofC, wear: 0.3 + wear0 * 0.6, grain: 1, uvS: 1 }); }
    } else if (cover === 'shingle' && L0) {
      for (let v = 0.0; v < Hv - 0.05; v += 0.145) { const t = v / Hv, a = ua * t, b = Lu - (Lu - ub) * t; if (b - a < 0.1) continue; B.box(SHING, b - a, 0.16, 0.012, at((a + b) / 2, v + 0.08, 0.018), { color: vary(roofC, 0.03), wear: wear0, grain: 0, uvS: 1.8 }); }
    } else if (cover === 'barrel' && L1) {
      const st = 0.26, cyl = new THREE.CylinderGeometry(0.11, 0.11, 1, L0 ? 8 : 4, 1, true, -PI / 2, PI);
      for (let u = 0.13; u < Lu - 0.05; u += st) { const vm = vmax(u); if (vm < 0.15) continue;
        B.geo(STUCCO, cyl, new THREE.Matrix4().multiplyMatrices(at(u, vm / 2, 0.01), M(0, 0, 0, 0, 0, 0, 1, vm, 1)), { color: vary(roofC, 0.07), wear: 0.3 + r() * 0.3, uvMul: [0.4, vm / 1.4] });
        if (L0) for (let v = 0.38; v < vm - 0.1; v += 0.38) B.box(STUCCO, 0.24, 0.035, 0.03, at(u, v, 0.11), { color: kit.mul(roofC, 0.85), wear: 0.4 }); }
    }
    // ridge / hip caps along the top and sloped edges
    if (L1) {
      if (ub - ua > 0.1) { const a = p3.clone(), b = p2.clone(); B.rod(cover === 'barrel' ? STUCCO : cover === 'tin' ? TIN : SHING, [a.x, a.y + 0.06, a.z], [b.x, b.y + 0.06, b.z], cover === 'barrel' ? 0.13 : 0.08, { color: kit.mul(roofC, 0.92), seg: 6, wear: 0.4 }); }
      if (ua > 0.1) B.rod(cover === 'barrel' ? STUCCO : cover === 'tin' ? TIN : SHING, [p0.x, p0.y + 0.06, p0.z], [p3.x, p3.y + 0.06, p3.z], cover === 'barrel' ? 0.12 : 0.07, { color: kit.mul(roofC, 0.92), seg: 6, wear: 0.4 });
    }
  }

  // ---------------------------------------------------------------- porch / entry
  function porch() {
    const P = sp.porch, Wl = walls.front, doors = Wl.open.filter((o) => o.kind === 'door'); if (!P) return;
    const pd = P.d;
    if (P.kind === 'deck') { // Keys: deck across the front on the piles, balustrade, stair down on the driveway side, porch roof
      const zA = z1, zB = z1 + pd, y = F;
      box(WOOD, w + 0.1, 0.24, pd, 0, y - 0.32, (zA + zB) / 2, { color: vary(0x8a8478), wear: 0.5 });
      if (L0) for (let x = x0 + 0.07; x < x1; x += 0.146) box(WOOD, 0.14, 0.038, pd - 0.02, x, y - 0.019, (zA + zB) / 2, { color: vary(0xa49c90, 0.07), wear: 0.4, grain: 2 });
      else box(WOOD, w, 0.04, pd, 0, y - 0.02, (zA + zB) / 2, { color: 0xa49c90, wear: 0.4 });
      col(0, y - 0.15, (zA + zB) / 2, w, 0.3, pd);
      const stairX = sp.drvU > 0 ? x1 - 0.65 : x0 + 0.65;
      railing([[x0, zB - 0.05], [x1, zB - 0.05]], y, [[stairX - 0.6, stairX + 0.6]]);
      railing([[x0 + 0.05, zA], [x0 + 0.05, zB]], y, []); railing([[x1 - 0.05, zA], [x1 - 0.05, zB]], y, []);
      // stair: straight run down toward the street at the deck edge
      const n = Math.ceil(y / 0.19), rise = y / n, run = 0.27, sz = zB;
      for (let i = 0; i < n - 1; i++) { const yy = y - rise * (i + 1), zz = sz + run * (i + 0.5); if (L1) box(WOOD, 1.1, 0.04, run + 0.02, stairX, yy, zz, { color: vary(0xa49c90, 0.06), wear: 0.5 }); }
      for (const s2 of [-1, 1]) { B.strut(WOOD, [stairX + s2 * 0.57, y - 0.1, sz], [stairX + s2 * 0.57, 0.05, sz + run * n], 0.26, 0.045, { color: 0x8a8478, wear: 0.5 }); if (L1) railLine([stairX + s2 * 0.6, y + 0.95, sz], [stairX + s2 * 0.6, 0.95, sz + run * n]); }
      cols.push({ shape: 'box', p: [stairX, y / 2 - 0.15, sz + run * n / 2], h: [0.55, 0.06, run * n / 2 * 1.08], ry: 0, rx: Math.atan2(y, run * n), ramp: true });
      // porch roof on posts over part of the deck
      const px0 = x0 + 0.2, px1 = x1 - 0.2, yr = top + 0.05;
      for (const x of [px0, (px0 + px1) / 2, px1]) { box(PAINT, 0.14, yr - y, 0.14, x, (y + yr) / 2, zB - 0.12, { color: C.trim, wear: wr(0.1), grain: 1, bevel: 0.01 }); cols.push({ shape: 'box', p: [x, (y + yr) / 2, zB - 0.12], h: [0.08, (yr - y) / 2, 0.08], ry: 0 }); }
      box(PAINT, px1 - px0 + 0.3, 0.2, 0.1, 0, yr - 0.1, zB - 0.12, { color: C.trim, wear: wr(0.1) });
      roofPlane([[px0 - 0.3, yr - 0.15, zB + 0.25], [px1 + 0.3, yr - 0.15, zB + 0.25], [px1 + 0.3, yr + 0.3, z1 + 0.02], [px0 - 0.3, yr + 0.3, z1 + 0.02]], sp.roof.cover, vary(C.roof, 0.04));
      if (L0) porchStuff(y, z1 + 0.6, zB - 0.4);
      ceilingFan(0, yr - 0.3, (zA + zB) / 2);
    } else if (P.kind === 'porch' || P.kind === 'stoop' || P.kind === 'loggia' || P.kind === 'canopy' || P.kind === 'eyebrow') {
      const du = doors[0]?.u ?? w / 2, wide = P.kind === 'porch' ? Math.min(w - 0.4, Math.max(4.2, w * 0.65)) : P.kind === 'loggia' ? Math.min(w - 1, 4.8) : P.kind === 'eyebrow' ? (sp.duplex ? w - 0.6 : 2.4) : 2.6;
      let pcx = sp.duplex ? 0 : Math.max(x0 + wide / 2 + 0.2, Math.min(x1 - wide / 2 - 0.2, x0 + du)), zA = z1, zB = z1 + pd;
      const y = P.kind === 'porch' ? F : Math.min(F, 0.35);
      // slab / floor and steps
      box(CONC, wide, y + 0.04, pd, pcx, (y + 0.04) / 2 - 0.02, (zA + zB) / 2, { color: sp.style === 'deco' ? 0xe0d8cc : 0xbab4a8, wear: 0.45 });
      if (L0 && sp.style === 'deco') for (let k = 0; k < 40; k++) box(CONC, 0.03, 0.002, 0.03, pcx + (r() - 0.5) * wide, y + 0.021, zA + r() * pd, { color: [0x7a9a9a, 0xd06a6a, 0x3a3a3a][k % 3] });   // terrazzo chips
      col(pcx, y / 2, (zA + zB) / 2, wide, y, pd);
      const nS = Math.max(1, Math.round(y / 0.18));
      for (let i = 0; i < nS; i++) { const sy = y - (y / nS) * (i + 1), sz = zB + 0.3 * i + 0.15; box(CONC, 1.5, y / nS + 0.02, 0.32, pcx + (sp.duplex ? 0 : 0), sy + (y / nS) / 2 - 0.01, sz, { color: 0xc4beb2, wear: 0.4 }); }
      if (P.kind === 'porch') { // bungalow: tapered columns on brick piers, low wall / balusters, gable or shed roof
        const xs = [pcx - wide / 2 + 0.2, pcx + wide / 2 - 0.2], ytop = top - 0.1;
        for (const x of xs) { box(STUCCO, 0.42, 0.85, 0.42, x, y + 0.42, zB - 0.25, { color: kit.mul(C.trim, 0.96), wear: 0.4 }); B.cyl(PAINT, 0.1, 0.15, ytop - y - 0.85, M(x, y + 0.85 + (ytop - y - 0.85) / 2, zB - 0.25, 0, PI / 4), { seg: 4, color: C.trim, wear: wr(0.1) }); cols.push({ shape: 'box', p: [x, (y + ytop) / 2, zB - 0.25], h: [0.2, (ytop - y) / 2, 0.2], ry: 0 }); }
        railing([[xs[0] + 0.2, zB - 0.25], [pcx - 0.8, zB - 0.25]], y, []); railing([[pcx + 0.8, zB - 0.25], [xs[1] - 0.2, zB - 0.25]], y, []);
        box(PAINT, wide, 0.22, 0.12, pcx, ytop + 0.05, zB - 0.25, { color: C.trim, wear: wr(0.1) });
        roofPlane([[pcx - wide / 2 - 0.25, ytop + 0.05, zB + 0.2], [pcx + wide / 2 + 0.25, ytop + 0.05, zB + 0.2], [pcx + wide / 2 + 0.25, top + 0.45, z1], [pcx - wide / 2 - 0.25, top + 0.45, z1]], sp.roof.cover, vary(C.roof, 0.04));
        if (L0) { box(PAINT, wide - 0.2, 0.02, pd - 0.2, pcx, ytop - 0.08, (zA + zB) / 2, { color: 0xa9cfd6 }); porchStuff(y, z1 + 0.5, zB - 0.6, pcx, wide); }
        ceilingFan(pcx, ytop - 0.3, (zA + zB) / 2);
      } else if (P.kind === 'loggia') { // three arches on columns, barrel roof over
        const n = 3, yt = F + H1 - 0.05, sp2 = wide / n;
        for (let k = 0; k <= n; k++) { const x = pcx - wide / 2 + k * sp2; B.cyl(STUCCO, 0.15, 0.17, yt - y - 0.6, M(x, y + (yt - y - 0.6) / 2, zB - 0.2), { seg: L0 ? 12 : 6, color: C.trim, wear: 0.3 }); box(STUCCO, 0.42, 0.2, 0.42, x, y + 0.1, zB - 0.2, { color: C.trim, wear: 0.3 }); box(STUCCO, 0.42, 0.18, 0.42, x, yt - 0.6, zB - 0.2, { color: C.trim, wear: 0.3 }); cols.push({ shape: 'cyl', p: [x, (y + yt) / 2, zB - 0.2], r: 0.17, hh: (yt - y) / 2 }); }
        for (let k = 0; k < n; k++) { const xc = pcx - wide / 2 + (k + 0.5) * sp2, R = sp2 / 2 - 0.15; const sh = new THREE.Shape(); sh.moveTo(-sp2 / 2, -0.55); sh.lineTo(-R, -0.55); sh.absarc(0, -0.55, R, PI, 0, true); sh.lineTo(sp2 / 2, -0.55); sh.lineTo(sp2 / 2, 0.45); sh.lineTo(-sp2 / 2, 0.45);
          const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false, curveSegments: L0 ? 10 : 5 }); B.geo(STUCCO, eg, M(xc, yt - 0.05, zB - 0.35), { color: C.body, wear: 0.3, uvMul: [0.7, 0.7] }); }
        roofPlane([[pcx - wide / 2 - 0.3, yt + 0.35, zB + 0.3], [pcx + wide / 2 + 0.3, yt + 0.35, zB + 0.3], [pcx + wide / 2 + 0.3, top + 0.55, z1], [pcx - wide / 2 - 0.3, top + 0.55, z1]], 'barrel', vary(C.roof, 0.04));
        if (L0) { porchStuff(y, z1 + 0.5, zB - 0.6, pcx, wide); for (const x of [pcx - wide / 2 + 0.3, pcx + wide / 2 - 0.3]) potPlant(x, y, zA + 0.4, 0xb8643c); }
        lamps.push({ pos: [pcx, yt - 0.3, (zA + zB) / 2], color: 0xffd9a8, intensity: 18, range: 6 });
        if (L1) { B.rod(METAL, [pcx, yt + 0.3, (zA + zB) / 2], [pcx, yt - 0.25, (zA + zB) / 2], 0.008, { color: 0x1a1a1a }); B.cyl(BULB, 0.12, 0.09, 0.3, M(pcx, yt - 0.4, (zA + zB) / 2), { seg: 6, color: 0xffe8c0, wear: 1 }); }
      } else if (P.kind === 'canopy') { // mid-century: flat canopy on thin steel posts, breeze-block screen wall
        const yt = top + 0.05;
        box(CONC, wide + 0.8, 0.12, pd + 0.4, pcx, yt + 0.25, (zA + zB) / 2 + 0.2, { color: 0xe6e2da, wear: 0.3 });
        box(PAINT, wide + 0.84, 0.2, 0.05, pcx, yt + 0.25, zB + 0.42, { color: C.trim, wear: 0.2 });
        for (const x of [pcx - wide / 2, pcx + wide / 2]) { box(METAL, 0.08, yt + 0.25 - y, 0.08, x, (y + yt + 0.25) / 2, zB + 0.1, { color: 0x2b2b2b }); cols.push({ shape: 'box', p: [x, (y + yt) / 2, zB + 0.1], h: [0.05, (yt - y) / 2, 0.05], ry: 0 }); }
        if (sp.breeze && L1) { const bx = pcx + (sp.drvU > 0 ? -1 : 1) * (wide / 2 + 1.0); box(mat.breeze(), 1.6, 2.0, 0.2, bx, y + 1.0, zA + pd * 0.6, { color: C.trim === 0x2b2b2b ? 0xf0ede6 : C.trim, wear: 0.3 }, PI / 2 * 0); cols.push({ shape: 'box', p: [bx, y + 1, zA + pd * 0.6], h: [0.8, 1, 0.1], ry: 0 }); }
        if (L0) { potPlant(pcx + wide / 2 - 0.4, y, zB - 0.3, 0x2b2b2b, true); potPlant(pcx - wide / 2 + 0.4, y, zB - 0.3, 0xe07a2a, true); }
      } else if (P.kind === 'eyebrow' || P.kind === 'stoop') { // deco eyebrow canopy / ranch stoop with roof extension on posts
        const yt = P.kind === 'eyebrow' ? F + 2.45 : top - 0.05;
        if (P.kind === 'eyebrow') { box(STUCCO, wide + 0.3, 0.1, 0.8, pcx, yt, z1 + 0.4, { color: C.trim, wear: 0.3 }); box(STUCCO, wide + 0.3, 0.08, 0.06, pcx, yt + 0.09, z1 + 0.78, { color: C.trim, wear: 0.3 }); if (L1) for (const x of [pcx - wide / 2 + 0.1, pcx + wide / 2 - 0.1]) box(METAL, 0.05, 0.9, 0.05, x, y + 0.45 + 0.04, zB - 0.1, { color: 0xf2f2ee }); if (L1) box(METAL, wide - 0.2, 0.05, 0.05, pcx, y + 0.9, zB - 0.1, { color: 0xf2f2ee }); }
        else { for (const x of [pcx - wide / 2 + 0.15, pcx + wide / 2 - 0.15]) { box(METAL, 0.1, yt - y, 0.1, x, (y + yt) / 2, zB - 0.12, { color: 0xf2f0ea }); if (L0) for (let k = 0; k < 6; k++) B.geo(METAL, new THREE.TorusGeometry(0.06, 0.008, 4, 10), M(x, y + 0.5 + k * 0.32, zB - 0.12, 0, PI / 2), { color: 0xf2f0ea }); cols.push({ shape: 'box', p: [x, (y + yt) / 2, zB - 0.12], h: [0.06, (yt - y) / 2, 0.06], ry: 0 }); }
          roofPlane([[pcx - wide / 2 - 0.25, yt, zB + 0.15], [pcx + wide / 2 + 0.25, yt, zB + 0.15], [pcx + wide / 2 + 0.25, top + 0.32, z1], [pcx - wide / 2 - 0.25, top + 0.32, z1]], sp.roof.cover, vary(C.roof, 0.04));
          if (L0) porchStuff(y, z1 + 0.4, zB - 0.4, pcx, wide); }
      }
    }
  }
  function railLine(a, b) { B.strut(PAINT, a, b, 0.09, 0.05, { color: C.trim, wear: wr(0.1) }); }
  function railing(path, y, gaps) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], Lr = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / Lr, uz = (b[1] - a[1]) / Lr;
      const segs = intervals(0, Lr, gaps.map(([g0, g1]) => { const t0 = (g0 - a[0]) * ux + 0 * uz, t1 = (g1 - a[0]) * ux; return [Math.min(t0, t1), Math.max(t0, t1)]; }).filter(() => Math.abs(uz) < 0.5));
      for (const [p, q] of segs) {
        const A = [a[0] + ux * p, a[1] + uz * p], Bq = [a[0] + ux * q, a[1] + uz * q], ry = Math.atan2(-uz, ux), cx = (A[0] + Bq[0]) / 2, cz = (A[1] + Bq[1]) / 2, len = q - p;
        box(PAINT, len, 0.06, 0.12, cx, y + 0.98, cz, { color: C.trim, wear: wr(0.15) }, ry);
        box(PAINT, len, 0.05, 0.08, cx, y + 0.1, cz, { color: C.trim, wear: wr(0.2) }, ry);
        for (const t of [0, len]) box(PAINT, 0.1, 1.02, 0.1, A[0] + ux * t, y + 0.51, A[1] + uz * t, { color: C.trim, wear: wr(0.15), bevel: 0.01 }, ry);
        if (L0) for (let t = 0.12; t < len - 0.05; t += 0.12) box(PAINT, 0.036, 0.85, 0.036, A[0] + ux * t, y + 0.55, A[1] + uz * t, { color: vary(C.trim, 0.02), wear: wr(0.15), grain: 1 }, ry);
        else if (L1) box(PAINT, len, 0.85, 0.02, cx, y + 0.55, cz, { color: kit.mul(C.trim, 0.85), wear: 0.3 }, ry);
        cols.push({ shape: 'box', p: [cx, y + 0.55, cz], h: [len / 2, 0.55, 0.06], ry });
      }
    }
  }
  function ceilingFan(x, y, z) { if (!L0) return; B.rod(STEEL, [x, y + 0.3, z], [x, y, z], 0.012, { color: 0x2a2a2a }); B.cyl(METAL, 0.09, 0.07, 0.12, M(x, y - 0.04, z), { color: 0x3a3028, seg: 10 }); for (let k = 0; k < 4; k++) box(WOOD, 0.55, 0.008, 0.12, x + Math.cos(k * PI / 2 + 0.3) * 0.32, y - 0.06, z + Math.sin(k * PI / 2 + 0.3) * 0.32, { color: 0x6a4a30 }, -(k * PI / 2 + 0.3)); }
  function potPlant(x, y, z, potC, tall = false) {
    B.cyl(PLAST, 0.17, 0.12, 0.3, M(x, y + 0.15, z), { seg: 10, color: potC });
    B.cyl(matX.matte(), 0.15, 0.15, 0.02, M(x, y + 0.29, z), { seg: 10, color: 0x3a2a1c });
    const n = tall ? 7 : 11; for (let k = 0; k < n; k++) { const a = k * 2.4 + r(), l = tall ? 0.6 + r() * 0.5 : 0.25 + r() * 0.2; B.strut(PLAST, [x, y + 0.3, z], [x + Math.cos(a) * l * 0.45, y + 0.3 + l, z + Math.sin(a) * l * 0.45], tall ? 0.09 : 0.06, 0.006, { color: vary(0x3f6a2a, 0.12), roll: a }); }
  }
  function chair(x, y, z, ry, c, rock = false) {
    const P2 = (sx, sy, sz, lx, ly, lz, rx = 0) => box(rock ? WOOD : PLAST, sx, sy, sz, x + Math.cos(ry) * lx + Math.sin(ry) * lz, y + ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz, { color: c, wear: 0.4 }, ry, rx);
    P2(0.5, 0.04, 0.48, 0, 0.44, 0); P2(0.5, 0.5, 0.04, 0, 0.72, -0.24, -0.18);
    for (const sx of [-0.22, 0.22]) { for (const sz of [-0.2, 0.2]) P2(0.04, 0.44, 0.04, sx, 0.22, sz); P2(0.04, 0.04, 0.42, sx, 0.62, 0); }
    if (rock) for (const sx of [-0.22, 0.22]) P2(0.03, 0.04, 0.8, sx, 0.02, 0);
  }
  function porchStuff(y, za, zb, cx = 0, wide = w) {
    const n = sp.porchStuff + 1;
    const cc = [0xf2f0ea, 0x2a6a4a, 0x8a5a3a, 0xe8e2d2][(r() * 4) | 0];
    for (let k = 0; k < n; k++) { const x = cx - wide / 2 + 0.6 + r() * (wide - 1.2), z = za + r() * Math.max(0.1, zb - za); const t = (k + sp.seed) % 4;
      if (t === 0 || t === 1) chair(x, y, z, PI + (r() - 0.5) * 0.8, cc, sp.style === 'bungalow' || sp.style === 'keys');
      else if (t === 2) potPlant(x, y, z, [0xb8643c, 0x2a5a8a, 0xe8e2d2][(r() * 3) | 0], r() < 0.5);
      else { box(PLAST, 0.5, 0.42, 0.5, x, y + 0.21, z, { color: 0x3a3a3a }); box(PLAST, 0.56, 0.03, 0.56, x, y + 0.43, z, { color: 0x2a2a2a }); } }
  }

  function carport() {
    if (lod === 2) return;
    const sgn = sp.drvU > 0 ? 1 : -1, xa = sgn > 0 ? x1 : x1 - w - 3.6, cw = 3.6, cxm = sgn > 0 ? x1 + cw / 2 + 0.05 : x0 - cw / 2 - 0.05, zA = z0 + 0.5, zB = z1 + 0.6, yt = Math.min(top, 2.9);
    for (const z of [zA, (zA + zB) / 2, zB]) { box(METAL, 0.1, yt, 0.1, cxm + sgn * (cw / 2 - 0.1), yt / 2, z, { color: sp.style === 'mcm' ? 0x2b2b2b : 0xf2f0ea }); cols.push({ shape: 'box', p: [cxm + sgn * (cw / 2 - 0.1), yt / 2, z], h: [0.06, yt / 2, 0.06], ry: 0 }); }
    box(sp.style === 'mcm' ? CONC : METAL, cw + 0.2, 0.1, zB - zA + 0.4, cxm, yt + 0.05, (zA + zB) / 2, { color: sp.style === 'mcm' ? 0xe6e2da : 0xe8e6e0, wear: 0.4 });
    box(PAINT, 0.05, 0.22, zB - zA + 0.44, cxm + sgn * (cw / 2 + 0.1), yt + 0.02, (zA + zB) / 2, { color: C.trim, wear: 0.3 });
    if (L0) for (let z = zA; z < zB; z += 0.6) box(METAL, cw, 0.05, 0.04, cxm, yt - 0.03, z, { color: 0xd8d6d0 });
    // utility shelves / storage at the back of the carport
    if (L0) { box(WOOD, cw - 0.4, 0.04, 0.45, cxm, 1.0, zA + 0.3, { color: 0x8a7a64 }); box(WOOD, cw - 0.4, 0.04, 0.45, cxm, 1.6, zA + 0.3, { color: 0x8a7a64 }); for (let k = 0; k < 5; k++) box(PLAST, 0.35, 0.3, 0.35, cxm - cw / 2 + 0.5 + k * 0.6, 1.0 + 0.17 + (k % 2) * 0.6, zA + 0.3, { color: [0x3a5a8a, 0xd8d0b8, 0x8a3a2a, 0x2a2a2a][k % 4] }); }
  }

  function extras() {
    if (lod === 2) return;
    const side = sp.drvU > 0 ? -1 : 1, sx = side > 0 ? x1 : x0;
    // AC condenser on a pad beside the house, refrigerant lines
    if (sp.acPad) { const x = sx + side * 0.75, z = z0 + d * 0.35, y = sp.stilt ? F - 0.25 : 0;
      if (sp.stilt) box(WOOD, 1.0, 0.06, 1.0, x, y - 0.04, z, { color: 0x8a8478 });
      else box(CONC, 1.0, 0.1, 1.0, x, 0.05, z, { color: 0xb8b2a6 });
      box(METAL, 0.78, 0.72, 0.78, x, y + 0.08 + 0.36, z, { color: 0xc8c6bc, wear: 0.4 });
      if (L0) { B.cyl(METAL, 0.3, 0.3, 0.02, M(x, y + 0.81, z), { seg: 16, color: 0x2a2a2a }); for (let k = 0; k < 8; k++) box(METAL, 0.8, 0.012, 0.01, x, y + 0.82, z - 0.3 + k * 0.085, { color: 0x6a6a64 }); for (let k = 0; k < 14; k++) for (const q of [-1, 1]) box(METAL, 0.79, 0.012, 0.01, x, y + 0.15 + k * 0.045, z + q * 0.395, { color: 0x8a8a84 });
        B.tube(STEEL, [[x - side * 0.3, y + 0.3, z + 0.2], [sx + side * 0.05, y + 0.35, z + 0.25], [sx + side * 0.04, F + 0.6, z + 0.25]], 0.012, { color: 0x1a1a1a }); }
      cols.push({ shape: 'box', p: [x, y + 0.45, z], h: [0.42, 0.45, 0.42], ry: 0 });
    }
    // electric meter and hose bib with a coiled hose
    if (L0) { const Wl = side > 0 ? walls.right : walls.left, u = Wl.L * 0.7;
      box(METAL, 0.3, 0.45, 0.14, ...wp(Wl, u, (sp.stilt ? 1.5 : F + 1.3), 0.08), { color: 0x9a9c98 }, Wl.ry);
      B.cyl(WIN, 0.08, 0.08, 0.04, kit.mulM(Wl.m(u, (sp.stilt ? 1.6 : F + 1.4), 0.16), M(0, 0, 0, PI / 2)), { color: 0xd8e0e0, wear: 0 });
      if (sp.hose) { const [hx, hz] = Wl.p(u + 1.2, 0.25); B.geo(matX.rubber(), new THREE.TorusGeometry(0.22, 0.035, 6, 18), M(hx, 0.5, hz, 0, Wl.ry), { color: 0x2f6a3a }); B.geo(matX.rubber(), new THREE.TorusGeometry(0.2, 0.035, 6, 18), M(hx, 0.48, hz, 0.15, Wl.ry), { color: 0x2f6a3a }); box(STEEL, 0.06, 0.06, 0.15, ...wp(Wl, u + 1.2, 0.75, 0.06), { color: 0xb08a40 }, Wl.ry); } }
    // satellite dish, solar water heater, vent stacks
    if (sp.dish && L1) { const x = x1 - 0.6, y = top + 0.2, z = z0 + 0.6; B.rod(STEEL, [x, y - 0.3, z], [x, y + 0.4, z], 0.03, { color: 0x9a9a98 }); B.geo(METAL, new THREE.SphereGeometry(0.38, 12, 6, 0, PI * 2, 0, 0.9), M(x, y + 0.45, z + 0.1, -1.1, 0.4), { color: 0xe6e6e2 }); }
    if (sp.solar && L1 && sp.roof.type !== 'flat') { box(METAL, 1.2, 0.08, 2.0, x0 + 1.6, top + 0.9, z0 + 1.0, { color: 0x1a2430 }, 0, -0.35); if (L0) box(METAL, 0.5, 0.5, 1.2, x0 + 1.6, top + 1.4, z0 + 0.4, { color: 0xe8e6e0 }, PI / 2, 0); }
    if (L0 && sp.roof.type !== 'flat' && sp.roof.type !== 'butterfly') for (const x of [x0 + w * 0.3, x0 + w * 0.62]) B.cyl(STEEL, 0.04, 0.04, 0.5, M(x, top + 0.4 + d * 0.25 * sp.roof.pitch, z0 + d * 0.25), { color: 0x6a6a68, seg: 8 });
    // lawn flamingos
    if (L0) for (let k = 0; k < sp.flamingos; k++) { const x = (r() - 0.5) * w, z = z1 + sp.front + 0.6 + r(); B.rod(STEEL, [x, 0, z], [x, 0.45, z], 0.006, { color: 0x3a3a3a }); B.geo(PLAST, new THREE.SphereGeometry(0.12, 8, 6), M(x, 0.55, z, 0, r() * 6, 0, 1, 0.7, 1.4), { color: 0xf06a9a }); B.strut(PLAST, [x, 0.6, z + 0.12], [x, 0.85, z + 0.18], 0.04, 0.04, { color: 0xf06a9a }); }
  }
  // ---------------------------------------------------------------- yard (map lots)
  function yard() {
    const Y = sp.yard, zRoad = z1 + Y.gap, zLine = zRoad - 0.9, sideX = w / 2 + Y.side;
    const g = garage ? walls.front.open.find((o) => o.kind === 'garage') : null;
    const xd = g ? x0 + g.u : sp.carport ? (sp.drvU > 0 ? x1 + 1.85 : x0 - 1.85) : Math.max(-sideX + 1.7, Math.min(sideX - 1.7, sp.drvU > 0 ? x1 + 1.7 : x0 - 1.7));
    const zd0 = g ? z1 + 0.05 : sp.carport ? z0 + 0.6 : z1 - 1.5, dw = 3.0;
    // driveway: poured panels with saw-cut joints and stains (lod 0), one slab at mid range
    if (lod < 2) {
      const len = zRoad - zd0, n = L0 ? Math.max(1, Math.round(len / 3)) : 1;
      if (sp.style === 'keys' && !sp.pavedDrive) { // keys lots: a crushed-shell drive worn into the sand, not poured concrete (Nov 17 mock-up)
        const SH = mat.pbr('shell_floor_01', { rep: 2.6, gain: 1.4, grunge: true }); box(SH, dw + 0.4, 0.03, len + 0.2, xd, -0.005, zd0 + len / 2, { color: vary(0xd6cdb8, 0.05), wear: 0.5 }); }
      else for (let k = 0; k < n; k++) { const za = zd0 + (len * k) / n, zb = zd0 + (len * (k + 1)) / n; box(CONC, dw - 0.02, 0.06, zb - za - (L0 ? 0.02 : 0), xd, 0.0, (za + zb) / 2, { color: vary(0xbfbfba, 0.035), wear: 0.3 + r() * 0.4 }); }   // neutral weathered concrete (was tan)
      if (L0) for (let k = 0; k < 3; k++) { // soft oil stains (same r() calls as the old dark boxes, so the lot layout does not shift)
        const sw = 0.7 + r() * 0.8, sl = 0.6 + r() * 0.9, sx = xd + (r() - 0.5) * 1.2, sz = zd0 + 1 + r() * (len - 2), sr = r() * 3, g = new THREE.PlaneGeometry(sw, sl); g.rotateX(-PI / 2);
        B.geo(mat.oilStain(), g, M(sx, 0.032, sz, 0, sr, 0), {}); g.dispose(); }
      // walkway from the entry steps to the driveway / street (pavers)
      const door = walls.front.open.find((o) => o.kind === 'door'), xw = door ? x0 + door.u : 0, zw0 = z1 + (sp.porch?.d ?? 1) + 0.2;
      if (zRoad - zw0 > 0.6) { const n2 = L0 ? Math.max(1, Math.round((zRoad - zw0) / 0.62)) : 1; for (let k = 0; k < n2; k++) { const za = zw0 + ((zRoad - zw0) * k) / n2, zb = zw0 + ((zRoad - zw0) * (k + 1)) / n2; box(matX.pavers(), 1.1, 0.05, zb - za - (L0 ? 0.04 : 0), xw, 0.0, (za + zb) / 2, { color: vary(0xd8ccb4, 0.05), wear: 0.3 }); } }
      // front fence along the lot line, gaps at the driveway and the walk (gate)
      const gaps = [[xd - dw / 2 - 0.1, xd + dw / 2 + 0.1], [xw - 0.65, xw + 0.65]];
      fence(sp.fence, -sideX, sideX, zLine, gaps);
      // mailbox and bins at the curb
      const mx = xd + (xd > 0 ? -1 : 1) * (dw / 2 + 0.5);
      if (CURB_LIB) { // props pass: the user's library mailbox + carts per house (src/world/props/lotProps.v2.js via houses.v2.js); rng kept
        r(); if (sp.bins && L1) { r(); r(); r(); r(); }
        curb.push({ kind: 'mailbox', x: mx, z: zRoad - 0.5 });
        if (sp.bins) curb.push({ kind: 'carts', x: xd + (xd > 0 ? 1 : -1) * (dw / 2 + 0.8), z: zRoad - 0.75, side: { x: (xd > 0 ? -1 : 1) * (w / 2 + 0.8), z: z1 - 1.3 } });
      } else {
      B.box(WOOD, 0.1, 1.05, 0.1, M(mx, 0.52, zRoad - 0.4), { color: 0xe8e4da, wear: 0.3 });
      B.box(METAL, 0.22, 0.24, 0.48, M(mx, 1.12, zRoad - 0.4), { color: [0x2a2a2a, 0xe8e4da, 0x2a4a6a, 0x6a2a2a][(r() * 4) | 0], wear: 0.3 });
      if (L0) { B.cyl(METAL, 0.11, 0.11, 0.48, M(mx, 1.24, zRoad - 0.4, PI / 2), { seg: 10, color: 0x2a2a2a }); B.box(METAL, 0.02, 0.12, 0.03, M(mx + 0.12, 1.25, zRoad - 0.3), { color: 0xc8302a }); }
      }
      if (sp.bins && L1 && !CURB_LIB) for (let k = 0; k < 2; k++) { const bx = xd + (xd > 0 ? 1 : -1) * (dw / 2 + 0.4 + k * 0.72), bz = zRoad - 0.6; B.box(PLAST, 0.6, 1.0, 0.7, M(bx, 0.5, bz, 0, (r() - 0.5) * 0.3), { color: [0x2f5a3a, 0x3a3e44, 0x2c4f7c][k + ((r() * 2) | 0)] }); if (L0) B.box(PLAST, 0.64, 0.05, 0.74, M(bx, 1.02, bz), { color: 0x2a2a2a }); cols.push({ shape: 'box', p: [bx, 0.5, bz], h: [0.3, 0.5, 0.35], ry: 0 }); }
      if (sp.car) cars.push({ x: xd, z: Math.min(zRoad - 3.2, zd0 + 2.8 + (g ? 1 : 0)), ry: PI });
    }
    // pool behind the house (flush with the yard): coping, tile band, water; screen cage on some
    if (sp.pool && lod < 2) {
      const pw = Math.min(w - 2, 8), pd = Math.min(Y.back - 3.5, 4.2), pz = z0 - 2.0 - pd / 2;
      box(CONC, pw + 2.4, 0.06, pd + 2.4, 0, 0.0, pz, { color: 0xd8d0c0, wear: 0.3 });
      for (const sgn of [-1, 1]) { box(CONC, pw + 0.6, 0.08, 0.3, 0, 0.04, pz + sgn * (pd / 2 + 0.15), { color: 0xeee8dc }); box(CONC, 0.3, 0.08, pd, sgn * (pw / 2 + 0.15), 0.04, pz, { color: 0xeee8dc }); }
      box(mat.poolWater(), pw, 0.02, pd, 0, 0.035, pz, { color: 0x3ab8d0, uvS: 3 });
      if (L0) { for (const sgn of [-1, 1]) { box(matX.ceramic(), pw, 0.04, 0.02, 0, 0.02, pz + sgn * (pd / 2 - 0.01), { color: 0x2a5a9a }); } box(STEEL, 0.04, 0.9, 0.04, pw / 2 - 0.4, 0.45, pz - pd / 2 + 0.05, { color: 0xd8d8d4 }); box(STEEL, 0.04, 0.9, 0.04, pw / 2 - 0.9, 0.45, pz - pd / 2 + 0.05, { color: 0xd8d8d4 }); for (let k = 0; k < 2; k++) chair(-pw / 2 + 1 + k * 1.1, 0.06, pz + pd / 2 + 0.9, PI, 0xf2f0ea); }
      if (sp.cage && L1) { const cx0 = -pw / 2 - 1.3, cx1 = pw / 2 + 1.3, cz0 = pz - pd / 2 - 1.3, ch = 3.4;
        for (const x of [cx0, (cx0 + cx1) / 2, cx1]) for (const z of [cz0, z0]) box(METAL, 0.08, ch, 0.08, x, ch / 2, z, { color: 0xe8e8e4 });
        box(METAL, cx1 - cx0, 0.08, 0.08, 0, ch, cz0, { color: 0xe8e8e4 }); for (const x of [cx0, cx1]) box(METAL, 0.08, 0.08, z0 - cz0, x, ch, (cz0 + z0) / 2, { color: 0xe8e8e4 });
        if (L0) { box(mat.screen(), cx1 - cx0, ch, 0.01, 0, ch / 2, cz0); for (const x of [cx0, cx1]) box(mat.screen(), 0.01, ch, z0 - cz0, x, ch / 2, (cz0 + z0) / 2); box(mat.screen(), cx1 - cx0, 0.01, z0 - cz0, 0, ch, (cz0 + z0) / 2); }
        cols.push({ shape: 'box', p: [0, ch / 2, cz0], h: [(cx1 - cx0) / 2, ch / 2, 0.05], ry: 0 }); }
    }
    // planting (instanced by the world module): palms at the corners, shrubs along the front, a hedge on one side
    for (let k = 0; k < sp.palms; k++) { const sx = (k % 2 ? 1 : -1) * (w / 2 + 0.6 + r() * Math.max(0.2, Y.side - 1)), sz = z1 + 0.8 + r() * Math.max(0.3, Y.gap - 2.5); if (Math.abs(sx - xd) < 2.2) continue; plants.push({ kind: sp.style === 'med' ? 'royal' : r() < 0.6 ? 'coconut' : r() < 0.5 ? 'queen' : 'sabal', x: sx, z: sz, s: 0.75 + r() * 0.4 }); }
    for (let k = 0; k < sp.shrubs; k++) { const sx = x0 + 0.5 + r() * (w - 1), sz = z1 + (sp.porch ? 0.3 : 0.6) + r() * 0.4; if (Math.abs(sx - xd) < 2 || sp.porch?.kind === 'deck') continue; plants.push({ kind: ['hibiscus', 'croton', 'ixora', 'bougainvillea'][(r() * 4) | 0], x: sx, z: sz, s: 0.6 + r() * 0.35 }); }
    if (sp.frontHedge) for (let x = -sideX + 0.6; x < sideX - 0.4; x += 1.3) { if (Math.abs(x - xd) < 2.2) continue; plants.push({ kind: 'hedge', x, z: zLine - 0.75, s: 0.95 }); }   // keys lots: a clipped hedge behind the front fence
    if (sp.hedge) { const hx = (xd > 0 ? -1 : 1) * (sideX - 0.4); for (let z = z0 - 1; z < zLine - 0.5; z += 1.6) plants.push({ kind: 'hedge', x: hx, z, s: 0.9 }); }
  }
  function fence(type, xa, xb, z, gaps) {
    if (!type || type === 'none') return;
    const segs = intervals(xa, xb, gaps);
    for (const [p, q] of segs) {
      const len = q - p, cx = (p + q) / 2;
      if (type === 'chain') { const h = 1.2; for (let x = p; x <= q + 0.01; x += Math.min(2.4, len)) B.cyl(STEEL, 0.03, 0.03, h + 0.05, M(Math.min(x, q), (h + 0.05) / 2, z), { seg: 6, color: 0xb8bab6 }); B.rod(STEEL, [p, h, z], [q, h, z], 0.02, { color: 0xb8bab6 }); if (L0) box(mat.chainlink(), len, h - 0.05, 0.005, cx, h / 2, z, { color: 0xc8cac6, uvS: 0.06 }); else box(STEEL, len, h - 0.05, 0.01, cx, h / 2, z, { color: 0x8a8c88 }); }
      else if (type === 'wood') { const h = 1.55; for (let x = p; x <= q + 0.01; x += Math.min(2.4, len)) box(WOOD, 0.1, h + 0.12, 0.1, Math.min(x, q), (h + 0.12) / 2, z + 0.06, { color: vary(0x8a7a62, 0.06), wear: 0.8, grain: 1 });   // keys: weathered board privacy fence
        for (const y of [0.3, h - 0.25]) box(WOOD, len, 0.09, 0.04, cx, y, z + 0.04, { color: 0x7a6a52, wear: 0.7 });
        if (L0) for (let x = p + 0.07; x < q - 0.03; x += 0.15 + (r() < 0.06 ? 0.05 : 0)) { if (r() < 0.03) continue; const bh = h - 0.04 - r() * 0.08; box(WOOD, 0.135, bh, 0.018, x, bh / 2 + 0.03, z, { color: vary(r() < 0.15 ? 0xa59478 : 0x8f8470, 0.08), wear: 0.5 + r() * 0.4, grain: 1 }, 0, (r() - 0.5) * 0.03); }
        else box(WOOD, len, h, 0.03, cx, h / 2, z, { color: 0x857a66, wear: 0.6 }); }
      else if (type === 'picket') { const h = 1.0; for (const y of [0.25, 0.8]) box(PAINT, len, 0.08, 0.04, cx, y, z - 0.03, { color: C.trim, wear: wr(0.2) }); if (L0) for (let x = p + 0.05; x < q; x += 0.14) box(PAINT, 0.08, h, 0.02, x, h / 2, z, { color: vary(C.trim, 0.03), wear: wr(0.25), grain: 1 }); else box(PAINT, len, h, 0.03, cx, h / 2, z, { color: kit.mul(C.trim, 0.9), wear: 0.3 }); }
      else if (type === 'iron') { const h = 1.25; box(CONC, len, 0.3, 0.25, cx, 0.15, z, { color: kit.mul(C.trim, 0.95) }); for (const y of [0.42, h]) box(METAL, len, 0.03, 0.03, cx, y, z, { color: 0x1a1a1a }); if (L0) for (let x = p + 0.06; x < q; x += 0.12) { box(METAL, 0.02, h - 0.3, 0.02, x, 0.3 + (h - 0.3) / 2, z, { color: 0x1a1a1a }); B.cyl(METAL, 0.0, 0.025, 0.07, M(x, h + 0.035, z), { seg: 4, color: 0x1a1a1a }); } else box(METAL, len, h - 0.3, 0.01, cx, 0.3 + (h - 0.3) / 2, z, { color: 0x2a2a2a }); }
      else if (type === 'wall' || type === 'pipe' || type === 'breeze') { const h = type === 'pipe' ? 0.6 : 1.1; box(type === 'breeze' ? mat.breeze() : STUCCO, len, h, 0.2, cx, h / 2, z, { color: type === 'breeze' ? 0xf0ede6 : C.body, wear: 0.4 }); box(STUCCO, len + 0.05, 0.06, 0.28, cx, h + 0.03, z, { color: C.trim, wear: 0.3 }); for (const x of [p, q]) box(STUCCO, 0.38, h + 0.25, 0.38, x, (h + 0.25) / 2, z, { color: C.trim, wear: 0.3 }); if (type === 'pipe') { box(STEEL, len, 0.04, 0.04, cx, h + 0.45, z, { color: 0xe8e8e8 }); if (L0) for (let x = p + 1; x < q; x += 1.2) box(STEEL, 0.04, 0.45, 0.04, x, h + 0.22, z, { color: 0xe8e8e8 }); } }
      cols.push({ shape: 'box', p: [cx, 0.6, z], h: [len / 2, 0.6, 0.08], ry: 0 });
    }
  }

  // ---------------------------------------------------------------- lived-in layer (every lot, mid and near)
  // foundation planting along the front and the quiet side (instanced vegetation, kept out of the porch, steps, stair and
  // carport volumes), pots by the entry, and the back yard: clothesline, kettle grill and chairs, a kid's bike or a kayak.
  function livedIn() {
    const pd = sp.porch ? sp.porch.d : 0, door = walls.front.open.find((o) => o.kind === 'door'), xDoor = door ? x0 + door.u : 0, drvSide = sp.drvU > 0 ? 1 : -1;
    const stairX = sp.stilt ? (sp.drvU > 0 ? x1 - 0.65 : x0 + 0.65) : null, zf = z1 + pd + 0.75;
    const blocked = (x, z) => (Math.abs(x - xDoor) < 1.1 && z > z1 - 0.2) || (stairX !== null && Math.abs(x - stairX) < 1.1 && z > z1) || (x * drvSide > w / 2 + 0.2 && sp.carport);
    const kinds = { keys: ['seagrape', 'croton', 'hibiscus'], ranch: ['ixora', 'croton', 'hedge'], med: ['bougainvillea', 'hibiscus', 'ixora'], deco: ['croton', 'ixora', 'hibiscus'], mcm: ['croton', 'sawpalmetto', 'ixora'], bungalow: ['hibiscus', 'croton', 'bougainvillea'] }[sp.style];
    if (!sp.yard) { // street lots: foundation planting (map lots plant in yard())
      for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.25 + r() * 0.5) { if (blocked(x, zf) || r() < 0.2) continue; plants.push({ kind: kinds[(r() * kinds.length) | 0], x, z: zf + (r() - 0.5) * 0.3, s: 0.55 + r() * 0.3 }); }
      const xs = -drvSide * (w / 2 + 0.9);
      for (let z = z0 + 0.6; z < z1; z += 1.5 + r()) if (r() < 0.75) plants.push({ kind: r() < 0.3 ? 'seagrape' : kinds[(r() * kinds.length) | 0], x: xs + (r() - 0.5) * 0.4, z, s: 0.6 + r() * 0.35 });
      if (r() < 0.7) plants.push({ kind: sp.style === 'med' ? 'royal' : 'coconut', x: -drvSide * (w / 2 + 1.6 + r()), z: z1 + pd + 1.6 + r() * 1.5, s: 0.8 + r() * 0.35 });
    }
    // entry pots
    if (L1 && door) { const y = sp.porch?.kind === 'porch' || sp.porch?.kind === 'deck' ? F : 0.05, zz = sp.porch?.kind === 'deck' ? z1 + 0.5 : z1 + pd + 0.35; for (const s2 of [-1, 1]) if (r() < 0.75) { const px = xDoor + s2 * 0.95; if (stairX !== null && Math.abs(px - stairX) < 0.9) continue; B.cyl(PLAST, 0.2, 0.14, 0.36, M(px, y + 0.18, zz), { seg: L0 ? 10 : 6, color: [0xb8643c, 0x2a5a8a, 0xe8e2d2, 0x3a3a3a][(r() * 4) | 0] }); if (L0) potPlant(px, y + 0.06, zz, 0x5a3a24, r() < 0.5); else B.geo(PLAST, new THREE.SphereGeometry(0.3, 6, 4), M(px, y + 0.6, zz, 0, 0, 0, 1, 1.2, 1), { color: vary(0x3f6a2a, 0.12) }); } }
    if (lod > 1) return;
    // back yard
    const zb = z0 - 2.6 - r() * 1.5, xb = (r() - 0.5) * (w - 2);
    if (r() < 0.6 && sp.style !== 'deco') { // clothesline: two T posts, three lines, a few things pegged out
      const xa = xb - 2.2, xc = xb + 2.2; for (const x of [xa, xc]) { box(STEEL, 0.06, 1.9, 0.06, x, 0.95, zb, { color: 0x8a8c88 }); box(STEEL, 0.06, 0.06, 0.9, x, 1.9, zb, { color: 0x8a8c88 }); }
      if (L0) for (const dz of [-0.35, 0, 0.35]) B.rod(STEEL, [xa, 1.88, zb + dz], [xc, 1.88, zb + dz], 0.006, { color: 0xd8d8d0 });
      for (let k = 0; k < 4; k++) if (r() < 0.8) box(PLAST, 0.5 + r() * 0.4, 0.6 + r() * 0.4, 0.01, xa + 0.6 + k * 1.0, 1.5, zb + [-0.35, 0, 0.35][k % 3], { color: [0xf2f0ea, 0x2a6a9a, 0xd84a4a, 0xf0c94a, 0x3a8a5a][(r() * 5) | 0] });
    }
    if (r() < 0.7) { const gx = -drvSide * (w / 2 - 1.2), gz = z0 - 1.4; B.cyl(METAL, 0.28, 0.22, 0.32, M(gx, 0.95, gz), { seg: L0 ? 12 : 6, color: 0x1a1a1a }); B.geo(METAL, new THREE.SphereGeometry(0.29, L0 ? 12 : 6, 4, 0, PI * 2, 0, PI / 2), M(gx, 1.11, gz), { color: 0x1a1a1a }); if (L0) for (let k = 0; k < 3; k++) { const a = k * 2.09; B.rod(STEEL, [gx + Math.cos(a) * 0.2, 0.85, gz + Math.sin(a) * 0.2], [gx + Math.cos(a) * 0.3, 0, gz + Math.sin(a) * 0.3], 0.012, { color: 0x3a3a3a }); }
      for (let k = 0; k < 2; k++) chair(gx + 1.2 + k * 0.8, 0.02, gz - 0.8 - r() * 0.5, r() * 6, [0xf2f0ea, 0x2a6a4a, 0x2a4a6a][(r() * 3) | 0]); }
    if (r() < 0.35) { const kx = xb + (r() - 0.5) * 2, kz = zb - 1.5; B.geo(PLAST, new THREE.CapsuleGeometry(0.28, 2.6, 4, L0 ? 10 : 5), M(kx, 0.25, kz, PI / 2, r() * 0.5 + PI / 2, 0, 1, 1, 0.5), { color: [0xe85a2a, 0x2a8ab8, 0xe8c82a, 0x3aa86a][(r() * 4) | 0] }); }
    else if (r() < 0.4) { const bx2 = xDoor + 1.6, bz2 = z1 + pd + 1.2; for (const dz of [-0.45, 0.45]) B.geo(mat.plastic(), new THREE.TorusGeometry(0.25, 0.03, 5, L0 ? 14 : 8), M(bx2 + 0.1, 0.27, bz2 + dz, 0.35, PI / 2), { color: 0x1a1a1a }); box(METAL, 0.04, 0.04, 0.9, bx2 + 0.1, 0.5, bz2, { color: [0xd82a4a, 0x2a6ad8, 0xf0a020][(r() * 3) | 0] }, 0, 0.35); }
  }

}

// Town centers (track: houses / towns). On whatever street grid the map holds (the map-roads track owns it), each town
// gets a main street with shops and civic places, sidewalks with curbs, crosswalks, street furniture and a small plaza.
// Everything is placed by rules, never scattered:
//   main street  = the highest-class named road with the most length near the town center
//   frontage     = both sides of the main street within the core radius, outside junctions, shops facing the street,
//                  widths from a program (anchor places first: cafe on the plaza, bank and pharmacy on corners, church
//                  at the end), so no two neighbors share a size, color, awning or front
//   plaza        = the free frontage block nearest the center: paving, fountain, shade trees, benches, cafe seating
//   furniture    = lamps every 24 m at the curb (alternating sides), benches and bins by shop entries, planters between
// Every footprint (shop, plaza, awning reach, lamp, bench, planter, tree crown) goes through one footprint index and is
// rejected if it overlaps a road, water, a map building that stays, or anything already placed.
import { buildShop, KINDS, BODY, hex, signAtlas } from './shops.js';

const RANK = { trunk: 5, primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, living_street: 1 };
const PROGRAM = ['cafe', 'pharmacy', 'hardware', 'bakery', 'diner', 'bank', 'books', 'barber', 'bait', 'florist', 'seafood', 'realty', 'icecream', 'laundry', 'motel', 'church', 'school', 'marina'];
const WIDTH = { cafe: [8, 10], pharmacy: [11, 13], hardware: [12, 15], bakery: [7, 8.5], diner: [11, 13], bank: [10, 12], books: [7, 8.5], barber: [6, 7], bait: [8, 9.5], florist: [6, 7], seafood: [9, 11], realty: [7, 8], icecream: [6, 7], laundry: [9, 10], motel: [20, 26], church: [10, 11], school: [24, 30], marina: [9, 10] };
const DEPTH = { motel: 9, church: 16, school: 14, hardware: 16, diner: 12 };
const NAME = {
  cafe: ['%T Coffee House', 'Morning Tide Cafe', 'The Driftwood Cafe'], pharmacy: ['%T Drug Co.', 'Harborview Pharmacy'], hardware: ['%T Hardware & Marine', 'Anchor Hardware'],
  bakery: ['Sea Salt Bakery', 'Golden Crust Bakery'], diner: ['The %T Diner', 'Lighthouse Diner'], bank: ['%T Savings Bank', 'First Island Bank'], books: ['Tidewater Books', 'Pelican Books'],
  barber: ['Sharp Tide Barber', 'Old Salt Barber'], bait: ['%T Bait & Tackle', 'Reel Deal Bait'], florist: ['Hibiscus Florist', 'Bloom & Brine'], seafood: ['%T Fish Market', 'Snapper Seafood'],
  realty: ['Seabreeze Realty', '%T Island Realty'], icecream: ['Scoops by the Sea', 'Coconut Creamery'], laundry: ['Suds & Sun Laundry', 'Island Wash'], motel: ['%T Motor Inn', 'Sand Dollar Motel'],
  church: ['%T Chapel', 'Harbor Community Church'], school: ['%T Elementary', '%T Academy'], marina: ['%T Marina Office', 'Harbor Master'],
};

export function planTown(town, env) {
  const { D, isWater, roadDist, groundAt, buildingsNear, lots } = env;
  const rg = D.roadGraph, cx = town.x, cz = town.z, R = Math.min(330, Math.max(180, (town.r || 600) * 0.4));
  let s = (Math.abs(Math.round(cx * 7 + cz * 13)) * 2654435761) >>> 0 || 1; const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  // ---- main street ----
  const score = new Map();
  for (const e of rg.edges) { if (e.elevated || e.bridge || /service|footway|path|track|motorway/.test(e.kind || '')) continue;
    let len = 0; for (let i = 0; i < e.pts.length - 1; i++) { const a = e.pts[i], b = e.pts[i + 1], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (Math.hypot(mx - cx, mz - cz) < R) len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    if (len < 10) continue; const key = e.name || 'edge:' + e.id, o = score.get(key) || { len: 0, rank: 0, edges: [] }; o.len += len; o.rank = Math.max(o.rank, RANK[e.kind] || 1); o.edges.push(e); score.set(key, o); }
  let main = null, best = 0; for (const [k, o] of score) { const v = o.len * (1 + o.rank * 0.6); if (v > best) { best = v; main = { name: k, ...o }; } }
  if (!main) return null;
  // ---- footprint index (grid of oriented rectangles) ----
  const G = 8, grid = new Map(), placed = [];
  const corners = (q) => { const c = Math.cos(q.ry), sn = Math.sin(q.ry); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [q.x + c * a * q.hw + sn * b * q.hd, q.z - sn * a * q.hw + c * b * q.hd]); };
  const inRect = (q, x, z, pad = 0) => { const dx = x - q.x, dz = z - q.z, c = Math.cos(q.ry), sn = Math.sin(q.ry), u = dx * c - dz * sn, v = dx * sn + dz * c; return Math.abs(u) <= q.hw + pad && Math.abs(v) <= q.hd + pad; };
  const overlaps = (a, b) => { for (const [x, z] of corners(a)) if (inRect(b, x, z)) return true; for (const [x, z] of corners(b)) if (inRect(a, x, z)) return true; return inRect(a, b.x, b.z) || inRect(b, a.x, a.z); };
  const cellsOf = (q) => { const cs = corners(q), out = []; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of cs) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } for (let i = Math.floor(x0 / G); i <= Math.floor(x1 / G); i++) for (let j = Math.floor(z0 / G); j <= Math.floor(z1 / G); j++) out.push(i * 100003 + j); return out; };
  const free = (q, o = {}) => {
    for (const k of cellsOf(q)) for (const p of grid.get(k) || []) if (overlaps(q, p)) return false;
    // sample the rectangle: no road surface (except where allowed), no water, no kept map building
    const nu = Math.max(2, Math.ceil(q.hw / 1.5)), nv = Math.max(2, Math.ceil(q.hd / 1.5)), c = Math.cos(q.ry), sn = Math.sin(q.ry);
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const u = (i / nu * 2 - 1) * q.hw, v = (j / nv * 2 - 1) * q.hd, x = q.x + c * u + sn * v, z = q.z - sn * u + c * v;
      if (isWater(x, z)) return false; if (!o.onRoad && roadDist(x, z) < (o.roadPad ?? 0.3)) return false;
      for (const b of buildingsNear(x, z)) if (!lots.claims(b) && b._bb && x > b._bb[0] && x < b._bb[1] && z > b._bb[2] && z < b._bb[3]) return false; }
    return true;
  };
  const add = (q) => { placed.push(q); for (const k of cellsOf(q)) { let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(q); } return q; };
  // ---- junctions on the main street (no shops across them) ----
  const nodes = [];
  for (const e of main.edges) for (const id of [e.a, e.b]) { const n = rg.nodes?.[id]; if (!n || nodes.includes(n)) continue; const deg = n.edges?.length ?? 0; if (deg >= 3 && Math.hypot(n.x - cx, n.z - cz) < R + 20) nodes.push(n); }
  const nearJunction = (x, z, pad) => nodes.some((n) => Math.hypot(n.x - x, n.z - z) < pad);
  // ---- frontage walk ----
  const out = { name: town.name, main: main.name, shops: [], plaza: null, walks: [], crossings: [], furniture: [], trees: [], reserved: [] };
  // the city already draws sidewalks (edge sidewalk width) and zebra crossings at junctions: use its width, draw ours only where it has none
  const cityWalk = main.edges.some((e) => (e.sidewalk || 0) > 0), sideW = Math.max(2.4, Math.min(4, main.edges.find((e) => e.sidewalk > 0)?.sidewalk || 3.2));
  const frontage = [];
  for (const e of main.edges) { const hw = (e.width || 7) / 2;
    for (let i = 0; i < e.pts.length - 1; i++) { const a = e.pts[i], b = e.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (let t = 0; t < L; t += 2) { const x = a[0] + tx * t, z = a[1] + tz * t; if (Math.hypot(x - cx, z - cz) > R) continue; frontage.push({ x, z, tx, tz, hw, e }); } } }
  if (!frontage.length) return null;
  frontage.sort((p, q) => Math.hypot(p.x - cx, p.z - cz) - Math.hypot(q.x - cx, q.z - cz));
  // sidewalks (both sides, gaps at junctions) and crosswalks
  if (!cityWalk) for (const f of frontage) for (const side of [1, -1]) { if (nearJunction(f.x, f.z, f.hw + 4)) continue; const nx = -f.tz * side, nz = f.tx * side, o = f.hw + sideW / 2; out.walks.push({ x: f.x + nx * o, z: f.z + nz * o, y: groundAt(f.x + nx * o, f.z + nz * o), ry: Math.atan2(f.tx, f.tz), len: 2.02, w: sideW, nx, nz }); }
  if (!cityWalk) for (const n of nodes) for (const k of n.edges || []) { const e = rg.edges[k]; if (!e || e.bridge) continue; const atA = e.a === n.id, p = atA ? e.pts[0] : e.pts[e.pts.length - 1], q = atA ? e.pts[1] : e.pts[e.pts.length - 2], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, dx = (q[0] - p[0]) / L, dz = (q[1] - p[1]) / L, off = 9 + (e.width || 7) * 0.2; out.crossings.push({ x: n.x + dx * off, z: n.z + dz * off, y: groundAt(n.x + dx * off, n.z + dz * off), dx, dz, w: e.width || 7 }); }
  // plaza: nearest frontage block that is free for 28 x 26 m behind the sidewalk
  for (const f of frontage.slice(0, 60)) { if (out.plaza) break; for (const side of [1, -1]) { if (nearJunction(f.x, f.z, f.hw + 16)) continue; const nx = -f.tz * side, nz = f.tx * side, dep = 26, o = f.hw + sideW + 0.4 + dep / 2;
      const q = { x: f.x + nx * o, z: f.z + nz * o, ry: Math.atan2(-nx, -nz), hw: 14, hd: dep / 2, kind: 'plaza' }; if (!free(q)) continue; out.plaza = add(q); out.plaza.nx = nx; out.plaza.nz = nz; break; } }
  // shops: walk outward from the center on each side; program order gives the anchors first
  let pi = 0; const used = new Set(), seq = PROGRAM.slice();
  const tryShop = (f, side, kind) => {
    const [wa, wb] = WIDTH[kind], w = wa + r() * (wb - wa), d = DEPTH[kind] ?? 11 + r() * 3, nx = -f.tz * side, nz = f.tx * side, o = f.hw + sideW + 0.15 + d / 2 + (kind === 'church' || kind === 'bank' ? 2.5 : 0) + (kind === 'motel' ? 3.5 : 0) + (kind === 'school' ? 5 : 0);
    if (nearJunction(f.x, f.z, f.hw + w / 2 + 3)) return null;
    const q = { x: f.x + nx * o, z: f.z + nz * o, ry: Math.atan2(-nx, -nz), hw: w / 2 + 0.3, hd: d / 2 + 0.3, kind }; if (!free(q)) return null;
    // the awning / canopy reach over the sidewalk is part of the footprint (lamps and trees keep out of it)
    add(q); add({ x: f.x + nx * (f.hw + sideW * 0.55), z: f.z + nz * (f.hw + sideW * 0.55), ry: q.ry, hw: w / 2, hd: sideW * 0.3, kind: 'awning' });
    return { ...q, w, d, side, f };
  };
  const MAXS = Math.min(20, seq.length + 4), usedNames = new Set();
  for (const f of frontage) { if (out.shops.length >= MAXS) break;
    for (const side of [1, -1]) { const kind = seq[pi % seq.length]; if ((used.has(kind) && pi < seq.length) || (pi >= seq.length && /motel|church|school|marina|bank/.test(kind))) { pi++; continue; }
      const sh = tryShop(f, side, kind); if (!sh) continue; used.add(kind); pi++;
      const P = KINDS[kind].palette, k2 = out.shops.length;
      sh.seed = (Math.round(sh.x * 31 + sh.z * 17) >>> 0) || 1;
      sh.colors = { body: hex(BODY[(k2 * 7 + 3) % BODY.length]), trim: [0xfaf6ee, 0xf2ede2, 0xe6dccb, 0xfdfaf2][k2 % 4], accent: hex(P[k2 % P.length]), awn: hex(P[(k2 + 1) % P.length]), interior: [0xf0d8a8, 0xe8e0c8, 0xf4e4c0, 0xd8e4e8][k2 % 4] };
      sh.stories = KINDS[kind].stories[(k2 + (sh.seed & 1)) % KINDS[kind].stories.length];
      { const names = NAME[kind].map((n) => n.replace('%T', town.short || town.name.split(' ').pop())); sh.name = names.find((n, j) => !usedNames.has(n) && j >= ((sh.seed >>> 3) % names.length)) || names.find((n) => !usedNames.has(n)); if (!sh.name) { out.shops.pop(); continue; } usedNames.add(sh.name); }
      sh.lit = 0.28 + r() * 0.2; sh.shutters = r() < 0.5; sh.balcony = sh.stories > 1 && r() < 0.4; sh.y = groundAt(sh.x, sh.z);
      out.shops.push(sh); } }
  // reserve the shop and plaza footprints for the house generator (map houses under them are not built)
  for (const q of placed) if (q.kind !== 'awning') out.reserved.push(q);
  // ---- furniture (rules: lamps every 24 m at the curb alternating sides; benches + bins at shop entries; planters between) ----
  let lampS = 0;
  for (const f of frontage) for (const side of [1, -1]) {
    const nx = -f.tz * side, nz = f.tx * side, ry = Math.atan2(f.tx, f.tz);
    if (nearJunction(f.x, f.z, f.hw + 5)) continue;
    const key = Math.round((f.x * f.tx + f.z * f.tz) / 2);
    if ((key % 12 === 0) && (((key / 12) | 0) % 2 === (side > 0 ? 0 : 1))) { const q = { x: f.x + nx * (f.hw + 0.55), z: f.z + nz * (f.hw + 0.55), ry, hw: 0.3, hd: 0.3, kind: 'lamp' }; if (free(q, { roadPad: 0.1 })) { add(q); out.furniture.push({ ...q, y: groundAt(q.x, q.z) }); lampS++; } }
  }
  for (const sh of out.shops) { if (/church|school|motel/.test(sh.kind)) continue; const f = sh.f, nx = -f.tz * sh.side, nz = f.tx * sh.side, tx = f.tx, tz = f.tz;
    const pos = (u, o) => ({ x: f.x + nx * (f.hw + o) + tx * u + (sh.x - f.x - nx * (sh.x - f.x) * 0) * 0, z: f.z + nz * (f.hw + o) + tz * u });
    const at = (u, o) => { const base = { x: sh.x - nx * (sh.d / 2 + 0.3 + sideW + 0.15), z: sh.z - nz * (sh.d / 2 + 0.3 + sideW + 0.15) }; return { x: base.x + tx * u + nx * o, z: base.z + tz * u + nz * o }; };
    void pos;
    // bench (facing the street) and bin beside it near the curb
    const sideU = (sh.seed & 2 ? 1 : -1) * (sh.w / 2 - 1.2), b = at(sideU, 1.3), bq = { ...b, ry: Math.atan2(-nx, -nz) + Math.PI, hw: 0.85, hd: 0.35, kind: 'bench' };
    if (free(bq, { roadPad: 0.6 })) { add(bq); out.furniture.push({ ...bq, y: groundAt(bq.x, bq.z) }); const bn = at(sideU + 1.25, 1.0), nq = { ...bn, ry: bq.ry, hw: 0.3, hd: 0.3, kind: 'bin' }; if (free(nq, { roadPad: 0.5 })) { add(nq); out.furniture.push({ ...nq, y: groundAt(nq.x, nq.z) }); } }
    // planter with a shrub at the far end of the frontage
    const p = at(-sideU, 0.9), pq = { ...p, ry: bq.ry, hw: 0.6, hd: 0.6, kind: 'planter' }; if (free(pq, { roadPad: 0.5 })) { add(pq); out.furniture.push({ ...pq, y: groundAt(pq.x, pq.z) }); }
    // cafe / bakery / icecream: two bistro tables with umbrellas on the sidewalk
    if (/cafe|bakery|icecream|diner/.test(sh.kind)) for (const u of [-sh.w * 0.25, sh.w * 0.25]) { const t = at(u, sideW * 0.42), tq = { ...t, ry: 0, hw: 0.8, hd: 0.8, kind: 'bistro' }; if (free(tq, { roadPad: 0.6 })) { add(tq); out.furniture.push({ ...tq, y: groundAt(tq.x, tq.z), color: sh.colors.awn }); } }
  }
  // plaza furniture: fountain in the middle, four shade trees, benches around, cafe tables on the street side
  if (out.plaza) { const P = out.plaza, c = Math.cos(P.ry), sn = Math.sin(P.ry), at = (u, v) => ({ x: P.x + c * u + sn * v, z: P.z - sn * u + c * v });
    out.plazaY = groundAt(P.x, P.z);
    for (const [u, v] of [[-8.5, -7.5], [8.5, -7.5], [-8.5, 6.5], [8.5, 6.5]]) { const t = at(u, v); out.trees.push({ kind: (u > 0) === (v > 0) ? 'royal' : 'sabal', x: t.x, z: t.z, y: out.plazaY + 0.25, s: 0.9 }); }   // narrow crowns: clear of the shops and the fountain
    for (const [u, v, a] of [[0, -6.5, 0], [0, 6.0, Math.PI], [-6.5, 0, Math.PI / 2], [6.5, 0, -Math.PI / 2]]) { const t = at(u, v); out.furniture.push({ ...t, ry: P.ry + a, kind: 'bench', y: out.plazaY }); }
  }
  out.counts = { shops: out.shops.length, lamps: lampS, furniture: out.furniture.length, crossings: out.crossings.length, walks: out.walks.length };
  return out;
}

// furniture and plaza geometry into a kit batch (world coordinates relative to an origin)
export function buildStreetscape(hk, plan, ox, oz, lod = 0) {
  const kit = hk, THREE = hk.THREE, M = kit.M, mat = kit.mat, B = kit.batch('street'), cols = [], lamps = [], L0 = lod === 0;
  const CONC = mat.concrete(), MET = mat.metalPaint(), WOOD = mat.wood(), STU = mat.stucco(), PAV = mat.pbr('scuffed_cement', { rep: 1.6, grunge: true, gain: 1.9 }), BULB = mat.houseBulb(), WATER = mat.poolWater(), PLAST = mat.plastic();
  const P = (x, z) => [x - ox, z - oz];
  // sidewalks: 2 m slabs with curb faces and joints
  for (const w of plan.walks) { const [x, z] = P(w.x, w.z), y = (w.y ?? 0); B.box(PAV, w.w, 0.14, w.len, M(x, y + 0.05, z, 0, w.ry), { color: 0xd8d2c6, wear: 0.3 });
    if (L0) B.box(CONC, 0.18, 0.16, w.len, M(x - w.nx * (w.w / 2 - 0.09), y + 0.06, z - w.nz * (w.w / 2 - 0.09), 0, w.ry), { color: 0xc4beb2 }); }
  // crosswalks: white bars across the road
  for (const c of plan.crossings) { const [x, z] = P(c.x, c.z), ry = Math.atan2(c.dx, c.dz), n = Math.floor(c.w / 0.9); for (let k = 0; k < n; k++) { const u = -c.w / 2 + 0.45 + k * 0.9; B.box(PLAST, 0.5, 0.012, 3.0, M(x + Math.cos(ry) * u, (c.y ?? 0) + 0.035, z - Math.sin(ry) * u, 0, ry), { color: 0xf2f2ee }); } }
  for (const f of plan.furniture) { const [x, z] = P(f.x, f.z), y = f.y ?? 0, m = (lx, ly, lz, rx = 0, ry2 = 0) => M(x, y, z, 0, f.ry).multiply(M(lx, ly, lz, rx, ry2));
    if (f.kind === 'lamp') { B.cyl(MET, 0.06, 0.09, 4.6, m(0, 2.3, 0), { seg: 8, color: 0x1e3a2a }); B.cyl(MET, 0.16, 0.2, 0.3, m(0, 0.15, 0), { seg: 8, color: 0x1e3a2a });
      if (L0) { B.cyl(MET, 0.18, 0.12, 0.12, m(0, 4.7, 0), { seg: 8, color: 0x1e3a2a }); B.cyl(BULB, 0.16, 0.2, 0.42, m(0, 4.45, 0), { seg: 8, color: 0xfff2d8, wear: 1 }); for (let k = 0; k < 4; k++) B.box(MET, 0.02, 0.42, 0.02, m(Math.cos(k * 1.57) * 0.18, 4.45, Math.sin(k * 1.57) * 0.18), { color: 0x1e3a2a }); }
      else B.cyl(BULB, 0.18, 0.18, 0.42, m(0, 4.45, 0), { seg: 6, color: 0xfff2d8, wear: 1 });
      cols.push({ shape: 'cyl', p: [x, y + 2.3, z], r: 0.1, hh: 2.3 }); lamps.push({ pos: [x, y + 4.4, z], color: 0xffd9a8, intensity: 30, range: 12 }); }
    else if (f.kind === 'bench') { for (const lx of [-0.75, 0.75]) B.box(MET, 0.06, 0.45, 0.5, m(lx, 0.22, 0), { color: 0x1e2a22 }); for (let k = 0; k < 4; k++) B.box(WOOD, 1.7, 0.035, 0.09, m(0, 0.45, -0.18 + k * 0.11), { color: 0x9a6a3a, wear: 0.3 }); for (let k = 0; k < 3; k++) B.box(WOOD, 1.7, 0.09, 0.035, m(0, 0.62 + k * 0.12, -0.26, -0.15), { color: 0x9a6a3a, wear: 0.3 }); cols.push({ shape: 'box', p: [x, y + 0.4, z], h: [0.85, 0.4, 0.3], ry: f.ry }); }
    else if (f.kind === 'bin') { B.cyl(MET, 0.26, 0.24, 0.85, m(0, 0.43, 0), { seg: L0 ? 14 : 8, color: 0x1e3a2a }); if (L0) for (let k = 0; k < 10; k++) B.box(MET, 0.03, 0.75, 0.02, m(Math.cos(k * 0.63) * 0.265, 0.43, Math.sin(k * 0.63) * 0.265, 0, -k * 0.63), { color: 0x1e3a2a }); B.cyl(MET, 0.28, 0.28, 0.05, m(0, 0.87, 0), { seg: 10, color: 0x1a2a20 }); cols.push({ shape: 'cyl', p: [x, y + 0.45, z], r: 0.27, hh: 0.45 }); }
    else if (f.kind === 'planter') { B.box(STU, 1.2, 0.6, 1.2, m(0, 0.3, 0), { color: 0xe8e0d0, wear: 0.3 }); B.box(STU, 1.32, 0.06, 1.32, m(0, 0.62, 0), { color: 0xd8d0c0 }); B.box(mat.matte(), 1.05, 0.04, 1.05, m(0, 0.6, 0), { color: 0x3a2a1c }); cols.push({ shape: 'box', p: [x, y + 0.3, z], h: [0.6, 0.3, 0.6], ry: f.ry }); plan.trees.push({ kind: ['ixora', 'croton', 'hibiscus'][Math.abs(Math.round(f.x + f.z)) % 3], x: f.x, z: f.z, y: y + 0.6, s: 0.55, small: true }); }
    else if (f.kind === 'bistro') { B.cyl(MET, 0.35, 0.35, 0.03, m(0, 0.74, 0), { seg: 14, color: 0xe8e8e4 }); B.cyl(MET, 0.03, 0.03, 2.3, m(0, 1.15, 0), { seg: 6, color: 0xd8d8d8 }); B.cyl(PLAST, 0.02, 1.1, 0.35, m(0, 2.25, 0), { seg: 8, color: f.color ?? 0x2f6b5a });
      for (const a of [0.4, 2.5, 4.4]) { const cx2 = Math.cos(a) * 0.62, cz2 = Math.sin(a) * 0.62; B.box(MET, 0.4, 0.03, 0.4, m(cx2, 0.45, cz2, 0, -a), { color: 0x2a2a2a }); B.box(MET, 0.4, 0.4, 0.03, m(cx2 + Math.cos(a) * 0.2, 0.65, cz2 + Math.sin(a) * 0.2, 0, -a + Math.PI / 2), { color: 0x2a2a2a }); } cols.push({ shape: 'cyl', p: [x, y + 0.4, z], r: 0.4, hh: 0.4 }); }
  }
  // plaza: pavers with a border, a round fountain, lawn panels
  if (plan.plaza) { const Pz = plan.plaza, [x, z] = P(Pz.x, Pz.z), y = plan.plazaY ?? 0, m = (lx, ly, lz) => M(x, y, z, 0, Pz.ry).multiply(M(lx, ly, lz));
    B.box(PAV, Pz.hw * 2, 0.12, Pz.hd * 2, m(0, 0.04, 0), { color: 0xe2d6c0, wear: 0.3 });
    if (L0) for (let u = -Pz.hw + 1; u < Pz.hw; u += 2) B.box(CONC, 0.04, 0.005, Pz.hd * 2, m(u, 0.103, 0), { color: 0xb8ac98 });
    for (const [u, v] of [[-8.5, -7.5], [8.5, -7.5], [-8.5, 6.5], [8.5, 6.5]]) { B.box(STU, 3.2, 0.25, 3.2, m(u, 0.12, v), { color: 0xe8e0d0 }); B.box(mat.matte(), 2.9, 0.02, 2.9, m(u, 0.24, v), { color: 0x4a6a2a }); }
    B.cyl(STU, 3.2, 3.3, 0.55, m(0, 0.28, 0), { seg: L0 ? 32 : 12, color: 0xece4d4, wear: 0.3 }); B.cyl(WATER, 3.0, 3.0, 0.05, m(0, 0.48, 0), { seg: L0 ? 32 : 12, color: 0x4ab0c0 });
    B.cyl(STU, 0.35, 0.45, 1.6, m(0, 1.1, 0), { seg: 12, color: 0xece4d4 }); B.cyl(STU, 1.3, 0.9, 0.25, m(0, 1.95, 0), { seg: 16, color: 0xece4d4 }); B.cyl(WATER, 1.2, 1.2, 0.04, m(0, 2.06, 0), { seg: 16, color: 0x6ac0d0 }); B.cyl(STU, 0.12, 0.2, 0.7, m(0, 2.4, 0), { seg: 10, color: 0xece4d4 });
    if (L0) for (let k = 0; k < 12; k++) { const a = k * 0.5236; B.cyl(WATER, 0.03, 0.06, 0.55, M(x, y, z, 0, Pz.ry).multiply(M(Math.cos(a) * 1.25, 1.75, Math.sin(a) * 1.25, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)), { seg: 5, color: 0xd8f0f4 }); }
    cols.push({ shape: 'cyl', p: [x, y + 0.5, z], r: 3.3, hh: 0.5 });
    for (const t of plan.trees) if (!t.small) { const [tx, tz] = P(t.x, t.z); cols.push({ shape: 'cyl', p: [tx, y + 1.5, tz], r: 0.35, hh: 1.5 }); }
  }
  return { batch: B, colliders: cols, lamps };
}

export { buildShop, signAtlas, NAME };

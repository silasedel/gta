#!/usr/bin/env node
// world-dressing: emptiness audit of the merged world.
// Loads the live build through src/world/miami/data.js (the game's own loader, files read from public/ on disk),
// rasterizes every tile at CELL m and flags land cells that carry nothing: no building, no road, no tree or prop,
// and a flat ground kind (plain land, paved, parking, dirt, or synthetic land with no cover).
// Connected empty cells become regions, ranked by area. Writes:
//   docs/v2/reports/world-dressing-empty.json   ranked list (top 60) + per-cause totals
//   docs/v2/shots/world-dressing/heatmap.png    whole world (water blue, roads dark, buildings brown, dressed green, empty red)
//   docs/v2/shots/world-dressing/heatmap_real.png   the real Miami rectangle at full cell resolution
// Usage: node --max-old-space-size=6000 src/world/dressing/tools/audit_empty.mjs [--cell 20] [--dressed]
//   --dressed: also count the world-dressing placements (src/world/dressing/plan.js) as content (the "after" audit)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const args = process.argv.slice(2);
const argOf = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const CELL = +argOf('cell', 20);
const DRESSED = args.includes('--dressed');
const TAG = argOf('tag', DRESSED ? 'after' : 'before');

// fetch from public/ on disk (no dev server load)
globalThis.fetch = async (url) => {
  const p = path.join(ROOT, 'public', String(url).replace(/^https?:\/\/[^/]+/, ''));
  const buf = fs.readFileSync(p);
  return new Response(buf);
};

const { loadMiamiData } = await import(path.join(ROOT, 'src/world/miami/data.js'));
const t0 = Date.now();
const data = await loadMiamiData(null, { bundle: false });
const man = data.manifest;
await Promise.all(man.regions.map((rk) => data.loadRegion(rk)));
console.log(`data + ${man.regions.length} regions in ${Date.now() - t0} ms`);

const B = data.bounds;
const W = Math.ceil((B.maxX - B.minX) / CELL);
const H = Math.ceil((B.maxZ - B.minZ) / CELL);
const N = W * H;
// cell class: 0 water, 1 empty-flat, 2 lawn-bare, 3 road, 4 building, 5 dressed (props / trees / natural cover)
const cls = new Uint8Array(N);
const why = new Uint8Array(N); // cause code for empty cells
const content = new Uint16Array(N);
const kindOf = new Uint8Array(N);
const KINDS = ['none', 'land', 'paved', 'parking', 'grass', 'park', 'beach', 'dirt', 'wood', 'natural'];
const kIdx = (k) => Math.max(0, KINDS.indexOf(k));
const ci = (x, z) => {
  const i = Math.floor((x - B.minX) / CELL);
  const j = Math.floor((z - B.minZ) / CELL);
  if (i < 0 || j < 0 || i >= W || j >= H) return -1;
  return j * W + i;
};
function pip(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
const inRings = (rings, x, z) => pip(rings[0], x, z) && !rings.slice(1).some((h) => pip(h, x, z));
function eachCellIn(rings, fn) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of rings[0]) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  const i0 = Math.floor((x0 - B.minX) / CELL);
  const i1 = Math.floor((x1 - B.minX) / CELL);
  const j0 = Math.floor((z0 - B.minZ) / CELL);
  const j1 = Math.floor((z1 - B.minZ) / CELL);
  let hit = false;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const x = B.minX + (i + 0.5) * CELL;
      const z = B.minZ + (j + 0.5) * CELL;
      if (inRings(rings, x, z)) {
        fn(j * W + i);
        hit = true;
      }
    }
  }
  return hit;
}
function mark(x, z, add = 1) {
  const c = ci(x, z);
  if (c >= 0) content[c] = Math.min(65535, content[c] + add);
}

// 1. ground kind per cell (areas), building and road cells
const isBld = new Uint8Array(N);
const isRoad = new Uint8Array(N);
const NATURAL = new Set(['scrub', 'forest', 'pine', 'sawgrass', 'wetland', 'mangrove', 'farmland', 'grove', 'wild', 'island', 'golf', 'campground', 'dune']);
let tiles = 0;
for (const key of man.tiles) {
  const [tx, tz] = key.split('_').map(Number);
  const t = data.getTile(tx, tz);
  if (!t) continue;
  tiles++;
  for (const a of t.areas) {
    let k = a.kind;
    if (NATURAL.has(a.cls) && !data.inRealMiami(a.rings[0][0][0], a.rings[0][0][1])) k = 'natural';
    if (a.cls === 'dirt' || a.cls === 'construction' || a.cls === 'gravel' || a.cls === 'rock') k = 'dirt';
    const kk = kIdx(k);
    eachCellIn(a.rings, (c) => {
      // later, more specific areas win over the plain land polygon
      if (kk !== 1 || kindOf[c] === 0) kindOf[c] = kk;
    });
  }
  for (const b of t.buildings) {
    if (!eachCellIn(b.rings, (c) => (isBld[c] = 1))) {
      const c = ci(b.cx, b.cz);
      if (c >= 0) isBld[c] = 1;
    }
  }
  for (const r of t.roads) {
    const hw = r.width / 2 + 2;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1];
      const [bx, bz] = r.pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / (CELL / 2)));
      for (let s = 0; s <= n; s++) {
        const x = ax + ((bx - ax) * s) / n;
        const z = az + ((bz - az) * s) / n;
        for (const [ox, oz] of [[0, 0], [hw, 0], [-hw, 0], [0, hw], [0, -hw]]) {
          const c = ci(x + ox, z + oz);
          if (c >= 0) isRoad[c] = 1;
        }
      }
    }
  }
  for (const p of t.paths) {
    for (const [x, z] of p.pts) mark(x, z, 1);
  }
  for (const tr of t.trees) mark(tr[0], tr[1], 3);
  for (const l of t.lamps) mark(l[0], l[1], 1);
  for (const p of t.props) mark(p.x, p.z, 1);
  for (const p of t.busStops) mark(p[0], p[1], 2);
  for (const p of t.piers) eachCellIn(p.rings, (c) => (content[c] += 2));
}
console.log(`${tiles} tiles rasterized at ${CELL} m (${W} x ${H})`);

// 2. optional: the dressing plan's own placements
if (DRESSED) {
  const plan = await import(path.join(ROOT, 'src/world/dressing/plan.js'));
  const n = plan.auditPlacements(data, (x, z, w) => mark(x, z, w));
  console.log(`dressing placements counted: ${n}`);
}

// 3. classify
const CAUSE = ['', 'plain land, no land use (M.land gray)', 'paved / plaza with nothing on it', 'parking lot with nothing on it', 'dirt / gravel / construction', 'synthetic land with no cover', 'bare lawn (grass, no trees or props)'];
let land = 0;
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const c = j * W + i;
    const x = B.minX + (i + 0.5) * CELL;
    const z = B.minZ + (j + 0.5) * CELL;
    if (data.isWater(x, z)) {
      cls[c] = 0;
      continue;
    }
    land++;
    if (isBld[c]) {
      cls[c] = 4;
      continue;
    }
    if (isRoad[c]) {
      cls[c] = 3;
      continue;
    }
    const k = KINDS[kindOf[c]];
    const real = data.inRealMiami(x, z);
    const cover = data.coverAt(x, z);
    if (content[c] > 0 || k === 'natural' || k === 'beach' || k === 'wood' || (!real && NATURAL.has(cover))) {
      cls[c] = 5;
      continue;
    }
    if (k === 'grass' || k === 'park') {
      cls[c] = 2;
      why[c] = 6;
      continue;
    }
    cls[c] = 1;
    why[c] = k === 'land' ? 1 : k === 'paved' ? 2 : k === 'parking' ? 3 : k === 'dirt' ? 4 : k === 'none' ? (real ? 1 : 5) : 1;
  }
}

// 4. regions: connected empty cells (flat gray + bare lawn), 4-neighbor flood fill
const reg = new Int32Array(N).fill(-1);
const regions = [];
const stack = new Int32Array(N);
for (let c0 = 0; c0 < N; c0++) {
  if ((cls[c0] !== 1 && cls[c0] !== 2) || reg[c0] >= 0) continue;
  const id = regions.length;
  const r = { id, cells: 0, gray: 0, lawn: 0, sx: 0, sz: 0, x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, causes: {} };
  let sp = 0;
  stack[sp++] = c0;
  reg[c0] = id;
  while (sp) {
    const c = stack[--sp];
    const i = c % W;
    const j = (c / W) | 0;
    const x = B.minX + (i + 0.5) * CELL;
    const z = B.minZ + (j + 0.5) * CELL;
    r.cells++;
    if (cls[c] === 1) r.gray++;
    else r.lawn++;
    r.sx += x;
    r.sz += z;
    r.x0 = Math.min(r.x0, x);
    r.x1 = Math.max(r.x1, x);
    r.z0 = Math.min(r.z0, z);
    r.z1 = Math.max(r.z1, z);
    r.causes[why[c]] = (r.causes[why[c]] || 0) + 1;
    for (const n of [i > 0 ? c - 1 : -1, i < W - 1 ? c + 1 : -1, j > 0 ? c - W : -1, j < H - 1 ? c + W : -1]) {
      if (n >= 0 && reg[n] < 0 && (cls[n] === 1 || cls[n] === 2)) {
        reg[n] = id;
        stack[sp++] = n;
      }
    }
  }
  regions.push(r);
}
const A = CELL * CELL;
for (const r of regions) {
  r.area = r.cells * A;
  r.cx = Math.round(r.sx / r.cells);
  r.cz = Math.round(r.sz / r.cells);
  // score: gray area counts double (the user's complaint is flat gray ground)
  r.score = (r.gray * 2 + r.lawn) * A;
  r.district = data.districtAt(r.cx, r.cz);
  r.zone = data.zoneAt(r.cx, r.cz);
  r.real = data.inRealMiami(r.cx, r.cz);
  const top = Object.entries(r.causes).sort((a, b) => b[1] - a[1])[0];
  r.cause = CAUSE[+top[0]];
  r.causes = Object.fromEntries(Object.entries(r.causes).map(([k, v]) => [CAUSE[+k], v * A]));
  delete r.sx;
  delete r.sz;
}
regions.sort((a, b) => b.score - a.score);
const totals = {};
let grayA = 0;
let lawnA = 0;
for (let c = 0; c < N; c++) {
  if (cls[c] === 1) grayA += A;
  if (cls[c] === 2) lawnA += A;
  if (why[c]) totals[CAUSE[why[c]]] = (totals[CAUSE[why[c]]] || 0) + A;
}
const realGray = (() => {
  let s = 0;
  const RR = data.realRect;
  for (let c = 0; c < N; c++) {
    if (cls[c] !== 1) continue;
    const x = B.minX + ((c % W) + 0.5) * CELL;
    const z = B.minZ + (((c / W) | 0) + 0.5) * CELL;
    if (x >= RR.minX && x < RR.maxX && z >= RR.minZ && z < RR.maxZ) s += A;
  }
  return s;
})();
const out = {
  build: man.build,
  tag: TAG,
  cell: CELL,
  landKm2: +((land * A) / 1e6).toFixed(2),
  emptyGrayKm2: +(grayA / 1e6).toFixed(2),
  emptyGrayRealMiamiKm2: +(realGray / 1e6).toFixed(2),
  bareLawnKm2: +(lawnA / 1e6).toFixed(2),
  byCauseKm2: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, +(v / 1e6).toFixed(3)])),
  regionsOver2000m2: regions.filter((r) => r.area >= 2000).length,
  ranked: regions.slice(0, 60).map((r, i) => ({
    rank: i + 1,
    x: r.cx,
    z: r.cz,
    areaM2: r.area,
    grayM2: r.gray * A,
    lawnM2: r.lawn * A,
    bbox: [r.x0, r.z0, r.x1, r.z1].map(Math.round),
    district: r.district,
    zone: r.zone,
    real: r.real,
    cause: r.cause,
    causes: r.causes,
  })),
};
const outJ = path.join(ROOT, `docs/v2/reports/world-dressing-empty${TAG === 'before' ? '' : '-' + TAG}.json`);
fs.writeFileSync(outJ, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, ranked: out.ranked.slice(0, 20).map((r) => `${r.rank}. (${r.x}, ${r.z}) ${Math.round(r.areaM2)} m2 ${r.district}/${r.zone} ${r.real ? 'real' : 'synth'} - ${r.cause}`) }, null, 1));

// 5. heatmaps
function png(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const crcT = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (b) => {
    let c = -1;
    for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type), body]);
    const cb = Buffer.alloc(4);
    cb.writeUInt32BE(crc(tb));
    return Buffer.concat([len, tb, cb]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}
const COL = [[22, 52, 88], [235, 40, 30], [245, 170, 40], [60, 60, 66], [150, 110, 80], [70, 130, 70]];
function render(file, x0, z0, x1, z1, step) {
  const w = Math.floor((x1 - x0) / step);
  const h = Math.floor((z1 - z0) / step);
  const rgb = Buffer.alloc(w * h * 3);
  const k = Math.max(1, Math.round(step / CELL));
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      // worst class in the block wins for empty (so small empty patches stay visible at low zoom)
      let best = -1;
      let land = 0;
      const cnt = [0, 0, 0, 0, 0, 0];
      for (let a = 0; a < k; a++) {
        for (let b = 0; b < k; b++) {
          const c = ci(x0 + px * step + a * CELL + 1, z0 + py * step + b * CELL + 1);
          if (c < 0) continue;
          cnt[cls[c]]++;
          if (cls[c]) land++;
        }
      }
      if (!land) best = 0;
      else if (cnt[1] / land > 0.35) best = 1;
      else if (cnt[2] / land > 0.5) best = 2;
      else best = cnt.indexOf(Math.max(...cnt.slice(1)), 1);
      const col = COL[best];
      rgb[(py * w + px) * 3] = col[0];
      rgb[(py * w + px) * 3 + 1] = col[1];
      rgb[(py * w + px) * 3 + 2] = col[2];
    }
  }
  png(file, w, h, rgb);
  return [w, h];
}
const shots = path.join(ROOT, 'docs/v2/shots/world-dressing');
fs.mkdirSync(shots, { recursive: true });
const suf = TAG === 'before' ? '' : '_' + TAG;
console.log('heatmap', render(path.join(shots, `heatmap${suf}.png`), B.minX, B.minZ, B.maxX, B.maxZ, CELL * 2));
const RR = data.realRect;
console.log('heatmap_real', render(path.join(shots, `heatmap_real${suf}.png`), RR.minX, RR.minZ, RR.maxX, RR.maxZ, CELL / 2 > 5 ? CELL / 2 : CELL));
// Key Paloma around the spawn
const sp = (data.setpieces || []).find((s) => s.id === 'nico_house');
if (sp) console.log('heatmap_spawn', render(path.join(shots, `heatmap_spawn${suf}.png`), sp.x - 1200, sp.z - 1200, sp.x + 1200, sp.z + 1200, CELL / 2 > 5 ? CELL / 2 : CELL), sp);

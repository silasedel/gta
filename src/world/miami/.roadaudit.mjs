// headless benchmark of the DATA path (data.js + adapter + builders + streamer); CITY dev tool
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
const here = path.dirname(fileURLToPath(import.meta.url)),
  projRoot = path.resolve(here, '../../..');
const rd = (u) => {
  for (const p of [path.join(projRoot, 'public', u), path.join(projRoot, u)])
    if (fs.existsSync(p)) return fs.readFileSync(p);
  throw new Error('404 ' + u);
};
globalThis.fetch = async (u) => {
  const b = rd(u);
  return {
    ok: true,
    json: async () => JSON.parse(b.toString('utf8')),
    arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  };
};
globalThis.document ??= {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () =>
      new Proxy(
        {},
        {
          get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {} })),
          set: (o, k, v) => ((o[k] = v), true),
        },
      ),
  }),
};
await RAPIER.init();
const { loadMiamiData } = await import('./data.js');
const { createDataProvider } = await import('./dataProvider.js');
const { createTileBuilder } = await import(
  process.argv[2] === 'live' ? './tilebuild.js' : './.tilebuild_next.js'
);

const t0 = performance.now();
const data = await loadMiamiData(null);
const provider = createDataProvider(data);
console.log(
  'data load ms',
  (performance.now() - t0) | 0,
  'tiles',
  data.tileKeys.length,
  'edges',
  data.roadGraph.edges.length,
);
const M = new Proxy(
  {},
  {
    get: (o, k) =>
      (o[k] ??= k.toString().includes('Depth')
        ? new THREE.MeshDepthMaterial()
        : new THREE.MeshStandardMaterial()),
  },
);
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const nodeIdx = new Map();
for (const n of provider.nodes)
  nodeIdx.set(Math.round(n.x * 2) + ',' + Math.round(n.z * 2), {
    degree: n.deg,
    width: Math.max(0, ...n.edges.map((e) => e.width)),
  });
const _ne = {};
let elevated = null;
if (!process.env.NOELEV) {
  try {
    const { createElevated } = await import('./elevated.js');
    elevated = createElevated({ THREE, RAPIER, world, data, materials: M });
  } catch (e) {
    console.log('no elevated', String(e).slice(0, 120));
  }
}
const b = createTileBuilder({
  districtAt: data.districtAt,
  roadKindAt: (x, z) => data.roadGraph.nearestEdge(x, z, {}, 14)?.edge?.kind,
  elevated,
  auditTags: true,
  M,
  provider,
  root: new THREE.Group(),
  world,
  RAPIER,
  zoneAt: data.zoneAt,
  nodeAt: (p) => nodeIdx.get(Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2)) || null,
  onSidewalk: (x, z) => Math.abs(data.groundHeightAt(x, z) - 0.15) < 0.02,
  groundAt: (x, z) => Math.max(0, data.groundHeightAt(x, z)),
  isWater: (x, z) => data.isWater(x, z),
  roadDist: (x, z) => {
    const r = data.roadGraph.nearestEdge(x, z, {}, 40);
    return r ? r.dist - r.edge.width / 2 : 99;
  },
  roadDirAt: (x, z) => {
    const r = data.roadGraph.nearestEdge(x, z, _ne, 60);
    return r ? Math.atan2(r.point.x - x, r.point.z - z) : 0;
  },
});

import zlib from 'node:zlib';
const T = provider.tileSize,
  MODE = process.argv[3] || '';
const run = (g) => {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
};
const tileList = data.tileKeys.map((k) => String(k).split(/[,_:]/).map(Number));
const tc0 = performance.now();
for (const [tx, tz] of tileList) {
  const t = {
    tx,
    tz,
    k: tx + ',' + tz,
    x0: tx * T,
    z0: tz * T,
    cx: (tx + 0.5) * T,
    cz: (tz + 0.5) * T,
  };
  run(b.buildColliders(t));
}
world.step();
console.log(
  'tiles',
  tileList.length,
  'colliders',
  world.colliders.len(),
  'build s',
  ((performance.now() - tc0) / 1000).toFixed(1),
);
if (MODE === 'probe') {
  const PTS = JSON.parse(process.argv[4]);
  world.step();
  for (const [x, z] of PTS) {
    const tile = provider.getTile(Math.floor(x / T), Math.floor(z / T));
    const hits = [];
    world.intersectionsWithRay(
      new RAPIER.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }),
      60,
      true,
      (h) => {
        hits.push([+(40 - h.timeOfImpact).toFixed(2), b.colTags.get(h.collider.handle)]);
        return true;
      },
    );
    const rs = [];
    for (const r of tile.roads) {
      const pr = b.roadProfile(r, tile);
      let best = 1e9,
        bi = 0;
      pr.pts.forEach((p, i) => {
        const dd = Math.hypot(p[0] - x, p[1] - z);
        if (dd < best) {
          best = dd;
          bi = i;
        }
      });
      if (best < r.width / 2 + 4)
        rs.push([
          r.name,
          r.kind,
          r.width,
          +best.toFixed(1),
          pr.ys ? +pr.ys[bi].toFixed(2) : 'g',
          r.y ? r.y.map((v) => +v.toFixed(1)).join('/') : '',
        ]);
    }
    console.log(
      JSON.stringify([x, z]),
      'hits',
      JSON.stringify(hits),
      'roads',
      JSON.stringify(rs),
      'dataY',
      data.groundHeightAt(x, z, 20).toFixed(2),
      'areasIn',
      (tile.areas || [])
        .filter((a) => {
          const r0 = a.rings[0];
          let c = false;
          for (let i = 0, j = r0.length - 1; i < r0.length; j = i++) {
            const [xi, zi] = r0[i],
              [xj, zj] = r0[j];
            if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
          }
          return c;
        })
        .map((a) => a.kind)
        .join('|'),
      'gh',
      data.groundHeightAt(x, z).toFixed(2),
      'surf',
      data.surfaceAt(x, z),
      'swIn',
      b
        .sidewalksOf(tile)
        .filter((rg) => {
          const r0 = rg[0];
          let c = false;
          for (let i = 0, j = r0.length - 1; i < r0.length; j = i++) {
            const [xi, zi] = r0[i],
              [xj, zj] = r0[j];
            if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
          }
          return c;
        })
        .map((rg) => [rg[0].length, rg.length]),
      'tile',
      tile.tx,
      tile.tz,
    );
  }
  process.exit(0);
}
const tagOf = (c) => b.colTags.get(c.handle) || (c.shape.type === 1 ? 'cuboid' : '?');
const cnt = {},
  fails = [];
const bump = (cat, x, z) => {
  if (typeof inB === 'function' && !inB(x, z)) return;
  cnt[cat] = (cnt[cat] || 0) + 1;
  if (fails.length < 200000) fails.push([x, z, cat]);
};
const qY = (a, p = 0) => {
  const cy = Math.cos(a / 2),
    sy = Math.sin(a / 2),
    cp = Math.cos(-p / 2),
    sp = Math.sin(-p / 2);
  return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
}; // yaw a, pitch p (nose up > 0)
const carBox = new RAPIER.Cuboid(1.0, 0.5, 2.25),
  person = new RAPIER.Capsule(0.55, 0.3);
const SOLIDOK = /^(building)$/; // reported separately
const boxHit = (cat, x, y, z, rot) => {
  let hitTag = null;
  world.intersectionsWithShape({ x, y, z }, rot, carBox, (c) => {
    hitTag = tagOf(c);
    return false;
  });
  if (hitTag) bump(cat + ':' + hitTag, x, z);
  return !!hitTag;
};
const rayY = (x, z, yTop) => {
  const h = world.castRay(new RAPIER.Ray({ x, y: yTop, z }, { x: 0, y: -1, z: 0 }), 30, true);
  return h ? yTop - h.timeOfImpact : null;
};
const BB = provider.bounds,
  inB = (x, z) => x > BB.minX + 25 && x < BB.maxX - 25 && z > BB.minZ + 25 && z < BB.maxZ - 25;
const DRIVE =
  /motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|_link|road/;
let nLane = 0,
  nTurn = 0,
  nRay = 0;
// smooth profile check along a polyline of samples [x,z,yExpected,heading]
function surfaceCheck(cat, S) {
  let prev = null;
  const hist = [];
  for (const [x, z, ye] of S) {
    nRay++;
    const y = rayY(x, z, ye + 2.5);
    if (y === null || y < ye - 1.0) {
      bump(cat + ':hole', x, z);
      prev = null;
      continue;
    }
    if (Math.abs(y - ye) > 0.05 && y < ye + 1.2) {
      const d = y - ye;
      bump(
        cat + ':visMismatch' + (Math.abs(d - 0.1) < 0.03 ? '_curb' : d > 0 ? '_higher' : '_lower'),
        x,
        z,
      );
      if (d > 0) {
        const bk = (Math.round(d * 20) / 20).toFixed(2);
        globalThis.HB = globalThis.HB || {};
        HB[cat + bk] = (HB[cat + bk] || 0) + 1;
      }
    }
    if (prev) {
      const d = Math.hypot(x - prev[0], z - prev[1]) || 0.5,
        step = y - prev[2];
      if (Math.abs(step) > 0.08 + Math.abs(ye - prev[3])) bump(cat + ':step', x, z);
      hist.push([x, z, y]);
      if (hist.length >= 9) {
        const h0 = hist[hist.length - 9],
          h1 = hist[hist.length - 5],
          h2 = hist[hist.length - 1],
          d1 = Math.hypot(h1[0] - h0[0], h1[1] - h0[1]) || 2,
          d2 = Math.hypot(h2[0] - h1[0], h2[1] - h1[1]) || 2;
        const s1 = (Math.atan2(h1[2] - h0[2], d1) * 180) / Math.PI,
          s2 = (Math.atan2(h2[2] - h1[2], d2) * 180) / Math.PI;
        if (Math.abs(s2 - s1) / ((d1 + d2) / 2) > 6) bump(cat + ':kink', h1[0], h1[1]);
      }
    } else hist.length = 0;
    prev = [x, z, y, ye];
  }
}
for (const [tx, tz] of tileList) {
  const tile = provider.getTile(tx, tz);
  if (!tile) continue;
  b.resolveDecks(tile);
  const x0 = tx * T,
    z0 = tz * T,
    inT = (x, z) => x >= x0 && x < x0 + T && z >= z0 && z < z0 + T;
  const ends = new Map(),
    key = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
  for (const r of tile.roads) {
    if (elevated && elevated.ownsEdge && elevated.ownsEdge(r.edgeId ?? r.id)) {
      cnt.ownedSkipped = (cnt.ownedSkipped || 0) + 1;
      continue;
    } // ELEVATED's decks are swept by its own audit (real lane geometry)
    if (
      r.pts.length < 2 ||
      !DRIVE.test(r.kind) ||
      /footway|path|pedestrian|cycleway|steps/.test(r.kind)
    )
      continue;
    const pr = b.roadProfile(r, tile),
      P = pr.pts,
      ys = pr.ys,
      hw = r.width / 2,
      total = Math.max(1, (r.lanesFwd || 1) + (r.lanesBack || 0)),
      lw = r.width / total;
    for (const [i, j] of [
      [0, 1],
      [P.length - 1, P.length - 2],
    ]) {
      const a = P[i],
        c = P[j],
        l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1,
        k = key(a);
      if (!ends.has(k)) ends.set(k, []);
      ends
        .get(k)
        .push({
          r,
          dx: (c[0] - a[0]) / l,
          dz: (c[1] - a[1]) / l,
          y: ys ? ys[i] : 0,
          hw,
          lw,
          P,
          ys,
          rev: i !== 0,
        });
    }
    for (let k = 0; k < total; k++) {
      const o = -hw + lw * (k + 0.5),
        S = [];
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i],
          c = P[i + 1],
          L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (L < 0.01) continue;
        const dx = (c[0] - a[0]) / L,
          dz = (c[1] - a[1]) / L,
          rot = qY(Math.atan2(dx, dz), ys ? Math.atan2(ys[i + 1] - ys[i], L) : 0);
        for (let s = 0; s < L; s += 0.5) {
          const x = a[0] + dx * s - dz * o,
            z = a[1] + dz * s + dx * o,
            y0p = ys ? ys[i] + (ys[i + 1] - ys[i]) * (s / L) : 0,
            own = elevated && elevated.ownsEdge(r.edgeId ?? r.id),
            y = own ? (elevated.heightAt(x, z, y0p + 1.0) ?? y0p + 0.05) : y0p + 0.05;
          if (!inT(x, z)) continue;
          S.push([x, z, y]);
          if (((s * 2) | 0) % 4 === 0) {
            nLane++;
            boxHit(r.kind === 'service' ? 'laneSvc' : 'lane', x, y + 0.35 + 0.5, z, rot);
          }
        }
      }
      surfaceCheck('lane', S);
    }
  }
  // turn arcs through every junction (ground and deck)
  for (const n of tile.nodes || []) {
    if (n.degree < 3 || !inT(n.x, n.z)) continue;
    const E = ends.get(key([n.x, n.z])) || [];
    if (E.length < 2) continue;
    const lv = b.nodeLevel(tile, n);
    if (!lv.kind) continue;
    for (const a of E)
      for (const c of E) {
        if (a === c) continue;
        if (Math.abs(a.y - lv.y) > 0.3 || Math.abs(c.y - lv.y) > 0.3) continue;
        const tin = [-a.dx, -a.dz],
          tout = [c.dx, c.dz];
        if (tin[0] * tout[0] + tin[1] * tout[1] < -0.8) continue; // no U-turns
        const D = n.width / 2 + 5,
          oA = Math.max(0, Math.min(a.hw - 1.1, a.lw / 2)),
          oC = Math.max(0, Math.min(c.hw - 1.1, c.lw / 2));
        const P0 = [n.x + a.dx * D + -tin[1] * oA, n.z + a.dz * D + tin[0] * oA],
          P3 = [n.x + c.dx * D + -tout[1] * oC, n.z + c.dz * D + tout[0] * oC];
        const k = D * 0.7,
          P1 = [P0[0] + tin[0] * k, P0[1] + tin[1] * k],
          P2 = [P3[0] - tout[0] * k, P3[1] - tout[1] * k];
        const bez = (t) => {
          const u = 1 - t;
          return [
            u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0],
            u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1],
          ];
        };
        const legY = (e, d) => {
          if (!e.ys) return 0;
          const P = e.P,
            ys = e.ys,
            n = P.length;
          let acc = 0;
          for (let q = 0; q < n - 1; q++) {
            const i0 = e.rev ? n - 1 - q : q,
              i1 = e.rev ? n - 2 - q : q + 1,
              L = Math.hypot(P[i1][0] - P[i0][0], P[i1][1] - P[i0][1]);
            if (acc + L >= d) {
              const t = L ? (d - acc) / L : 0;
              return ys[i0] + (ys[i1] - ys[i0]) * t;
            }
            acc += L;
          }
          return ys[e.rev ? 0 : n - 1];
        };
        const Rd = n.width / 2 + 3.0,
          expY = (p, t) => {
            const dx = p[0] - n.x,
              dz = p[1] - n.z,
              dist = Math.hypot(dx, dz);
            if (dist < Rd) return lv.y + 0.05;
            const e = t < 0.5 ? a : c;
            return legY(e, Math.max(0, dx * e.dx + dz * e.dz)) + 0.05;
          };
        const N = Math.ceil((D * 2) / 0.5),
          S = [];
        let prevP = bez(0),
          bad = false;
        for (let i = 1; i <= N; i++) {
          const p = bez(i / N),
            hd = Math.atan2(p[0] - prevP[0], p[1] - prevP[1]);
          prevP = p;
          const y = expY(p, i / N);
          S.push([p[0], p[1], y]);
          if (i % 2 === 0 && !bad) {
            nTurn++;
            if (boxHit('turn', p[0], y + 0.35 + 0.5, p[1], qY(hd))) bad = true;
          }
        }
        surfaceCheck('turn', S);
      }
  }
}
// 2D-wall artefacts: near-vertical triangles taller than 0.3 m inside flat ground colliders (roads / junctions / decks / areas)
let nWall = 0;
world.forEachCollider((c) => {
  const tg = tagOf(c);
  if (!/^(road|junction|deck|area)$/.test(tg) || c.shape.type !== 6) return;
  const V = c.shape.vertices,
    I = c.shape.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3,
      b2 = I[t + 1] * 3,
      d = I[t + 2] * 3,
      ys = [V[a + 1], V[b2 + 1], V[d + 1]],
      h = Math.max(...ys) - Math.min(...ys);
    const ux = V[b2] - V[a],
      uy = V[b2 + 1] - V[a + 1],
      uz = V[b2 + 2] - V[a + 2],
      vx = V[d] - V[a],
      vy = V[d + 1] - V[a + 1],
      vz = V[d + 2] - V[a + 2],
      ny = uz * vx - ux * vz,
      nx = uy * vz - uz * vy,
      nz = ux * vy - uy * vx,
      nl = Math.hypot(nx, ny, nz) || 1;
    if (Math.abs(ny / nl) < 0.3 && h > 0.3) {
      nWall++;
      bump('wall2D:' + tg, V[a], V[a + 2]);
    }
  }
});
const sortO = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
console.log(
  'samples lane',
  nLane,
  'turnSamples',
  nTurn,
  'rays',
  nRay,
  'elapsed s',
  ((performance.now() - tc0) / 1000).toFixed(1),
);
console.log(JSON.stringify(sortO(cnt)));
console.log('higher-hist', JSON.stringify(sortO(globalThis.HB || {})));
fs.writeFileSync(
  path.join(here, '.roadaudit_' + (process.argv[2] || 'next') + '.json'),
  JSON.stringify({ cnt, fails: fails.slice(0, 50000) }),
);
// top-down map: roads grey, failures red
if (MODE === 'png') {
  const B = provider.bounds,
    W = 2048,
    sc = W / (B.maxX - B.minX),
    H = Math.ceil((B.maxZ - B.minZ) * sc),
    img = Buffer.alloc(W * H * 3, 0);
  for (let i = 0; i < img.length; i += 3) {
    img[i] = 18;
    img[i + 1] = 30;
    img[i + 2] = 44;
  }
  const px = (x, z, r, g, bl, rad = 0) => {
    const cx = ((x - B.minX) * sc) | 0,
      cz = ((z - B.minZ) * sc) | 0;
    for (let dx = -rad; dx <= rad; dx++)
      for (let dz = -rad; dz <= rad; dz++) {
        const X = cx + dx,
          Z = cz + dz;
        if (X < 0 || Z < 0 || X >= W || Z >= H) continue;
        const o = (Z * W + X) * 3;
        img[o] = r;
        img[o + 1] = g;
        img[o + 2] = bl;
      }
  };
  for (const e of data.roadGraph.edges) {
    const P = e.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
      for (let s = 0; s < L; s += 1 / sc) {
        const t = s / L;
        px(
          P[i][0] + (P[i + 1][0] - P[i][0]) * t,
          P[i][1] + (P[i + 1][1] - P[i][1]) * t,
          e.elevated ? 120 : 150,
          e.elevated ? 150 : 150,
          e.elevated ? 200 : 150,
        );
      }
    }
  }
  for (const [x, z] of fails) px(x, z, 255, 40, 40, 2);
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const crc = (buf) => {
    let c,
      crcT = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcT[n] = c >>> 0;
    }
    let x = 0xffffffff;
    for (const v of buf) x = crcT[(x ^ v) & 255] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  };
  const chunk = (t, d) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path.join(projRoot, 'docs/showcase/city/road_audit.png'), png);
  console.log('png', W, H);
}

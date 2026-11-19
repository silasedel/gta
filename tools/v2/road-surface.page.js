// Map-wide road SURFACE audit, page side (user, Nov 19: "not a single road that's glitched"). Driven by
// `node tools/v2/road-audit.mjs --surface`. Every tile's ground surfaces are built exactly as the near builder builds them
// (window.__tbSurfaceTile in src/world/miami/tilebuild.js: areas, terrain grid, slabs, roads, junctions, caps, curbs,
// markings, decals, elevated pieces) into tagged batches that never reach the scene, then probed geometrically:
//   hole         a carriageway point (road piece centerline / lanes / edges, 0.5 m steps) with no road surface over it
//                (terrain / sand shows through: the user's "sand patch in the middle of the road")
//   terrainOver  the terrain mesh at or above the road top under a road (pokes through / z-fights the asphalt)
//   zfight       two opaque ground layers (asphalt, junction, slab, parking, area fills ...) in the same plane (< 6 mm apart)
//                at one point, from different pieces (a junction over its approach ribbon, two ribbons over each other)
//   markOverlap  two paint / decal quads of different pieces in the same plane at one point (flicker between paint layers)
//   step         the road top jumps > 2 cm between two samples 0.5 m apart along a piece (a ledge between pieces / at seams)
//   hardEdge     an open (curb-less) road edge standing > 10 cm proud (the liked verge has ~7 cm) of the ground right next to it with no bevel, or the
//                ground burying the edge (> 2 cm over the asphalt edge)
//   curbFloat    a curb / slab face whose foot hangs > 1 cm above the ground in front of it (light under the curb)
//   slabBox      a raised slab edge facing open ground (not a road) that drops > 8 cm straight down (a box set on the sand)
// Findings are clustered (same class within 6 m) and carry world x / z, tile, count and the pieces involved.
const r2 = (v) => Math.round(v * 100) / 100;
const OPAQUE = [
  'asphalt',
  'junction',
  'dirtRoad',
  'parking',
  'sidewalk',
  'promenade',
  'panels',
  'apron',
  'runway',
  'taxiway',
  'wood',
  'land',
  'sand',
  'grass',
  'elev',
];
const ROADLIKE = new Set(['asphalt', 'junction', 'dirtRoad', 'elev']);
const PAVED = new Set([
  'asphalt',
  'junction',
  'dirtRoad',
  'elev',
  'sidewalk',
  'promenade',
  'panels',
  'parking',
  'apron',
  'runway',
  'taxiway',
  'wood',
]);
const PAINT = ['lines', 'marks', 'decals'];
const SLAB = new Set(['sidewalk', 'promenade', 'panels']);

// triangle index over a set of batches: up-facing triangles hashed into 2 m cells
function triIndex(list) {
  const CELL = 2,
    grid = new Map(),
    T = [];
  for (const [name, b] of list) {
    const P = b.p,
      nt = Math.floor(P.length / 9);
    for (let t = 0; t < nt; t++) {
      const i = t * 9,
        ax = P[i],
        ay = P[i + 1],
        az = P[i + 2],
        bx = P[i + 3],
        by = P[i + 4],
        bz = P[i + 5],
        cx = P[i + 6],
        cy = P[i + 7],
        cz = P[i + 8];
      const ux = bx - ax,
        uy = by - ay,
        uz = bz - az,
        vx = cx - ax,
        vy = cy - ay,
        vz = cz - az;
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx,
        l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(l > 1e-9)) continue;
      const k = T.length;
      T.push({ name, tag: b.t[t] || '?', i, P, ny: ny / l, nx: nx / l, nz: nz / l });
      if (Math.abs(ny / l) < 0.35) continue; // walls are indexed separately by the caller
      const x0 = Math.floor(Math.min(ax, bx, cx) / CELL),
        x1 = Math.floor(Math.max(ax, bx, cx) / CELL),
        z0 = Math.floor(Math.min(az, bz, cz) / CELL),
        z1 = Math.floor(Math.max(az, bz, cz) / CELL);
      if ((x1 - x0) * (z1 - z0) > 4000) continue;
      for (let gx = x0; gx <= x1; gx++)
        for (let gz = z0; gz <= z1; gz++) {
          const key = gx * 65536 + gz;
          let c = grid.get(key);
          if (!c) grid.set(key, (c = []));
          c.push(k);
        }
    }
  }
  // all triangles covering (x, z): [{ name, tag, y }] (strict interior, 1 mm inset so shared edges count once)
  const hits = (x, z, out) => {
    out.length = 0;
    const c = grid.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL));
    if (!c) return out;
    for (const k of c) {
      const tr = T[k],
        P = tr.P,
        i = tr.i;
      const ax = P[i],
        az = P[i + 2],
        bx = P[i + 3],
        bz = P[i + 5],
        cx = P[i + 6],
        cz = P[i + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-10) continue;
      const w0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d,
        w1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d,
        w2 = 1 - w0 - w1;
      const e = -1e-6;
      if (w0 < e || w1 < e || w2 < e) continue; // inclusive: a point on a shared edge / vertex is covered
      const y = w0 * P[i + 1] + w1 * P[i + 4] + w2 * P[i + 7];
      let dup = false;
      for (const o of out)
        if (o.tag === tr.tag && o.name === tr.name && Math.abs(o.y - y) < 1e-4) {
          dup = true;
          break;
        } // the same surface counted once (both triangles of an edge)
      if (!dup) out.push({ name: tr.name, tag: tr.tag, y, k });
    }
    return out;
  };
  return { T, hits };
}

export async function auditTile(game, tx, tz, opts = {}) {
  const S = await window.__tbSurfaceTile(tx, tz);
  if (!S) return null;
  const city = game.city,
    G = game.miamiData?.roadGraph || city.roadGraph,
    out = [];
  const B = S.batches,
    isW = (x, z) => {
      try {
        return !!city.isWater(x, z);
      } catch (e) {
        return false;
      }
    };
  const claims = city.groundClaims;
  const claimed = (x, z) => !!(claims && claims.list && claims.list.length && claims.at(x, z, 0.5));
  const opaque = triIndex(OPAQUE.filter((k) => B[k]).map((k) => [k, B[k]]));
  const paint = triIndex(PAINT.filter((k) => B[k]).map((k) => [k, B[k]]));
  const terr = S.terrain ? triIndex([['terrain', { p: S.terrain, t: [] }]]) : null;
  const H = [],
    H2 = [],
    H3 = [];
  const terrY = (x, z) => {
    if (!terr) return null;
    terr.hits(x, z, H3);
    let y = null;
    for (const h of H3) if (y === null || h.y > y) y = h.y;
    return y;
  };
  const topPaved = (x, z) => {
    opaque.hits(x, z, H);
    let y = null,
      nm = null;
    for (const h of H)
      if (PAVED.has(h.name) && (y === null || h.y > y)) {
        y = h.y;
        nm = h.name;
      }
    return y === null ? null : { y, name: nm };
  };
  const X0 = tx * 200,
    Z0 = tz * 200,
    inTile = (x, z) => x >= X0 && x < X0 + 200 && z >= Z0 && z < Z0 + 200;
  const add = (cls, x, z, d) => out.push({ cls, x: r2(x), z: r2(z), tile: tx + ',' + tz, ...d });
  // junction outlines / discs whose node lies in a neighbor tile (that tile draws them): exact polygons from city.junctionOf
  const JN = [];
  for (const n of G.nodes) {
    if (
      !n ||
      (n.edges || []).length < 3 ||
      n.x < X0 - 80 ||
      n.x > X0 + 280 ||
      n.z < Z0 - 80 ||
      n.z > Z0 + 280
    )
      continue;
    let J = null;
    try {
      J = city.junctionOf(n.id);
    } catch (e) {
      /* */
    }
    let w = 0;
    for (const k of n.edges) w = Math.max(w, G.edges[k]?.width || 0);
    JN.push({ x: n.x, z: n.z, P: J ? J.poly : null, R: w / 2 + 3 });
  }
  const inJunc = (x, z) => {
    for (const j of JN) {
      if (j.P) {
        const P = j.P;
        let ins = false;
        for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
          const xa = P[a][0],
            za = P[a][1],
            xb = P[b][0],
            zb = P[b][1];
          if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) ins = !ins;
        }
        if (ins) return true;
      } else if ((x - j.x) ** 2 + (z - j.z) ** 2 < j.R * j.R) return true;
    }
    return false;
  };
  // ---- per road piece: coverage, terrain, steps, open edges
  for (const r of S.roads) {
    if (r.ys && Math.max(...r.ys) > 1.5) continue; // real decks: the elevated audit (map-audit deck*) owns them; low ramps / humps are checked here
    const P = r.pts,
      hw = r.width / 2;
    let prevY = null,
      prevS = -9;
    // elevated-network pieces: elevated.js draws its own (smoothed) geometry; only the stretch near a ground junction must be paved
    let ownEnds = null;
    if (r.owned) {
      ownEnds = [];
      for (const p of [P[0], P[P.length - 1]])
        for (const j of JN)
          if (j.P && Math.abs(j.x - p[0]) < 0.5 && Math.abs(j.z - p[1]) < 0.5) ownEnds.push(p);
      if (!ownEnds.length) continue;
    }
    const offs = [0, -hw * 0.5, hw * 0.5, -(hw - 0.2), hw - 0.2];
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const ax = P[i - 1][0],
        az = P[i - 1][1],
        bx = P[i][0],
        bz = P[i][1],
        L = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
      if (L < 1e-6) continue;
      const dx = (bx - ax) / L,
        dz = (bz - az) / L,
        nx = -dz,
        nz = dx;
      for (let s = 0; s < L; s += 0.5) {
        const cx = ax + dx * s,
          cz = az + dz * s,
          sa = acc + s;
        if (!inTile(cx, cz)) continue;
        if (ownEnds && !ownEnds.some((p) => (p[0] - cx) ** 2 + (p[1] - cz) ** 2 < 30 * 30))
          continue;
        if (isW(cx, cz) || claimed(cx, cz)) {
          prevY = null;
          continue;
        }
        for (let oi = 0; oi < offs.length; oi++) {
          const o = offs[oi],
            x = cx + nx * o,
            z = cz + nz * o;
          if (!inTile(x, z) || isW(x, z) || claimed(x, z)) continue;
          opaque.hits(x, z, H);
          let top = null,
            topN = null;
          for (const h of H)
            if (ROADLIKE.has(h.name) || PAVED.has(h.name)) {
              if (top === null || h.y > top) {
                top = h.y;
                topN = h.name;
              }
            }
          if (top === null && !inJunc(x, z)) {
            add('hole', x, z, {
              edge: r.edgeId,
              kind: r.kind,
              terr: r2(terrY(x, z) ?? -9),
              what: H.map((h) => h.name).join('+') || 'nothing',
            });
            continue;
          }
          if (top === null) continue; // a junction outline drawn by the neighbor tile (the node lies there) covers it
          const ty = terrY(x, z);
          if (ty !== null && ty > top - 0.004)
            add('terrainOver', x, z, { edge: r.edgeId, dy: r2(ty - top), on: topN });
          // coplanar opaque layers from different pieces
          for (let a = 0; a < H.length; a++)
            for (let b = a + 1; b < H.length; b++) {
              const p = H[a],
                q = H[b];
              if (Math.abs(p.y - q.y) > 0.006) continue;
              if (p.tag === q.tag && p.name === q.name) continue;
              add('zfight', x, z, {
                a: p.name + ':' + p.tag,
                b: q.name + ':' + q.tag,
                dy: r2((p.y - q.y) * 1000) / 1000,
              });
              a = H.length;
              break;
            }
          if (oi === 0) {
            if (prevY !== null && sa - prevS <= 0.51 && Math.abs(top - prevY) > 0.02)
              add('step', x, z, { edge: r.edgeId, dy: r2(top - prevY) });
            prevY = top;
            prevS = sa;
          }
          // paint over paint from different pieces at the same height
          paint.hits(x, z, H2);
          for (let a = 0; a < H2.length; a++)
            for (let b = a + 1; b < H2.length; b++) {
              const p = H2[a],
                q = H2[b];
              if (p.name !== q.name || Math.abs(p.y - q.y) > 0.002 || p.tag === q.tag) continue;
              add('markOverlap', x, z, { a: p.name + ':' + p.tag, b: q.name + ':' + q.tag });
              a = H2.length;
              break;
            }
        }
        // open edges: just outside each carriageway edge
        if (!r.sidewalks)
          for (const side of [-1, 1]) {
            const ex = cx + nx * side * (hw - 0.05),
              ez = cz + nz * side * (hw - 0.05),
              ox = cx + nx * side * (hw + 0.35),
              oz = cz + nz * side * (hw + 0.35);
            if (!inTile(ox, oz) || isW(ox, oz) || claimed(ox, oz)) continue;
            const re = topPaved(ex, ez);
            if (!re || !ROADLIKE.has(re.name)) continue;
            const po = topPaved(ox, oz);
            if (po && po.y > re.y - 0.06) continue; // paved on (junction, another road, a bevel / apron)
            const ty = terrY(ox, oz);
            if (ty === null) continue;
            const lip = re.y - Math.max(ty, po ? po.y : -9);
            if (lip > 0.1) add('hardEdge', ox, oz, { edge: r.edgeId, lip: r2(lip), kind: r.kind });
            else if (ty > re.y + 0.02)
              add('hardEdge', ox, oz, { edge: r.edgeId, lip: r2(lip), buried: 1, kind: r.kind });
          }
      }
      acc += L;
    }
  }
  // ---- curb / slab faces: foot over the ground in front of it, or a box edge on open ground
  for (const name of ['sidewalk', 'promenade', 'panels', 'asphalt', 'junction']) {
    const b = B[name];
    if (!b) continue;
    const P = b.p,
      nt = Math.floor(P.length / 9);
    for (let t = 0; t < nt; t++) {
      const i = t * 9;
      const ux = P[i + 3] - P[i],
        uy = P[i + 4] - P[i + 1],
        uz = P[i + 5] - P[i + 2],
        vx = P[i + 6] - P[i],
        vy = P[i + 7] - P[i + 1],
        vz = P[i + 8] - P[i + 2];
      let nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(l > 1e-9)) continue;
      nx /= l;
      ny /= l;
      nz /= l;
      if (Math.abs(ny) > 0.2) continue; // walls only
      const ys = [P[i + 1], P[i + 4], P[i + 7]],
        yb = Math.min(...ys),
        yt = Math.max(...ys);
      if (yt - yb < 0.04) continue;
      const mx = (P[i] + P[i + 3] + P[i + 6]) / 3,
        mz = (P[i + 2] + P[i + 5] + P[i + 8]) / 3;
      if (!inTile(mx, mz) || isW(mx, mz)) continue;
      const fx = mx + nx * 0.12,
        fz = mz + nz * 0.12,
        pv = topPaved(fx, fz),
        ty = terrY(fx, fz),
        g = Math.max(pv ? pv.y : -9, ty ?? -9);
      if (g < -5) continue;
      if (yb > g + 0.01)
        add('curbFloat', mx, mz, {
          on: name,
          src: b.t[t],
          gap: r2(yb - g),
          front: pv ? pv.name : 'terrain',
        });
      if (SLAB.has(name) && !pv && yt - Math.max(g, yb) > 0.08)
        add('slabBox', mx, mz, { on: name, src: b.t[t], drop: r2(yt - g) });
    }
  }
  // ---- cluster (6 m grid per class: linear, a tile can hold tens of thousands of raw samples)
  const C = [],
    cg = new Map(),
    R = 6;
  for (const f of out) {
    const key = f.cls + ':' + Math.floor(f.x / R) + ',' + Math.floor(f.z / R);
    const c = cg.get(key);
    if (c) {
      c.n++;
      if (c.ex.length < 3) {
        const e = f.a ? f.a + '|' + f.b : f.what || f.edge || f.on;
        if (!c.ex.includes(e)) c.ex.push(e);
      }
      continue;
    }
    const nc = { ...f, n: 1, ex: [f.a ? f.a + '|' + f.b : f.what || f.edge || f.src || f.on] };
    cg.set(key, nc);
    C.push(nc);
  }
  const counts = {};
  for (const f of C) counts[f.cls] = (counts[f.cls] || 0) + 1;
  return { tile: [tx, tz], counts, findings: C, tris: opaque.T.length };
}

// every tile that holds a drawable road piece (from the road graph, no tile loading)
export function roadTiles(game) {
  const G = game.miamiData?.roadGraph || game.city.roadGraph,
    set = new Set();
  for (const e of G.edges) {
    if (!e || !e.pts) continue;
    for (let i = 0; i < e.pts.length; i++) {
      const p = e.pts[i];
      set.add(Math.floor(p[0] / 200) + ',' + Math.floor(p[1] / 200));
      if (i) {
        const q = e.pts[i - 1],
          L = Math.hypot(p[0] - q[0], p[1] - q[1]);
        for (let s = 50; s < L; s += 50)
          set.add(
            Math.floor((q[0] + ((p[0] - q[0]) * s) / L) / 200) +
              ',' +
              Math.floor((q[1] + ((p[1] - q[1]) * s) / L) / 200),
          );
      }
    }
  }
  return [...set].map((k) => k.split(',').map(Number));
}

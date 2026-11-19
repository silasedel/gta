// City adapter for gameplay: works with the CONTRACT4 city API (Miami) and shims the legacy grid city.
// Never hard-code geography in gameplay code — go through this.
import * as THREE from 'three';
import { rand, pointNear, groundAt, fixedOnlyFlags } from './util.js';

class Heap {
  constructor() {
    this.a = [];
  }
  push(n, f) {
    const a = this.a;
    a.push([f, n]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    if (!a.length) return null;
    const top = a[0][1];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

export function createCityAdapter(game) {
  const city = game.city || {};
  const g = city.grid && city.grid.xs && city.grid.zs ? city.grid : null;
  const isNew = typeof city.zoneAt === 'function' || !!city.roadGraph || !!city.bounds;

  const bounds =
    city.bounds ||
    (g
      ? {
          minX: Math.min(...g.xs) - 40,
          maxX: Math.max(...g.xs) + 120,
          minZ: Math.min(...g.zs) - 40,
          maxZ: Math.max(...g.zs) + 40,
        }
      : {
          minX: -(city.half || 500),
          maxX: city.half || 500,
          minZ: -(city.half || 500),
          maxZ: city.half || 500,
        });
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const mapScale = Math.max(1, Math.min(2.5, span / 1100)); // 1 for the old 1 km city, up to 2.5 for real-scale Miami
  const seaLevel = city.seaLevel ?? 0;

  function isWater(x, z) {
    try {
      if (city.isWater) return !!city.isWater(x, z);
    } catch (e) {
      /* ignore */
    }
    try {
      return city.surfaceAt?.(x, z) === 'water';
    } catch (e) {
      return false;
    }
  }
  function groundHeight(x, z) {
    const y = groundAt(game, x, z, 60); // static colliders when streamed in
    if (y > -50 && y !== 0) return y;
    try {
      if (city.groundHeightAt) {
        const h = city.groundHeightAt(x, z);
        if (Number.isFinite(h)) return h;
      }
    } catch (e) {
      /* ignore */
    }
    return y;
  }
  function zoneAt(x, z) {
    try {
      if (city.zoneAt) return city.zoneAt(x, z) || 'commercial';
    } catch (e) {
      /* ignore */
    }
    const s = (() => {
      try {
        return city.surfaceAt?.(x, z);
      } catch (e) {
        return null;
      }
    })();
    if (s === 'water') return 'water';
    if (s === 'sand') return 'beach';
    if (s === 'grass' || s === 'grass_short' || s === 'grass_long') return 'park';
    return 'commercial';
  }
  function districtAt(x, z) {
    try {
      return city.districtAt?.(x, z) || null;
    } catch (e) {
      return null;
    }
  }
  const inBounds = (p, m = 10) =>
    p.x > bounds.minX + m &&
    p.x < bounds.maxX - m &&
    p.z > bounds.minZ + m &&
    p.z < bounds.maxZ - m;

  // ---------------- point queries
  function okPoint(p, near, rMin, rMax) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
    if (!inBounds(p)) return false;
    const d = near ? Math.hypot(p.x - near.x, p.z - near.z) : 0;
    if (near && (d < rMin || d > rMax * 1.15)) return false;
    if (isWater(p.x, p.z)) return false;
    return true;
  }
  function sidewalkPoint(near, rMin = 0, rMax = 120, zone = null, opts = {}) {
    const tries = opts.tries || 14;
    if (city.randomSidewalkPoint) {
      for (let i = 0; i < tries; i++) {
        let p = null;
        try {
          p = isNew ? city.randomSidewalkPoint(near, rMax, zone || undefined) : null;
        } catch (e) {
          p = null;
        }
        if (!p) break;
        p = p.clone ? p.clone() : new THREE.Vector3(p.x, p.y || 0, p.z);
        if (!okPoint(p, near, rMin, rMax)) continue;
        if (zone && zoneAt(p.x, p.z) !== zone && !opts.zoneLoose) continue;
        if (opts.avoidView && opts.inView?.(p)) continue;
        return p;
      }
    }
    if (g && near) {
      for (let i = 0; i < 4; i++) {
        const r = pointNear(
          game,
          near,
          rMin,
          rMax,
          opts.wall ? 'wall' : 'sidewalk',
          !!opts.avoidView,
          20,
        );
        if (r && (!zone || opts.zoneLoose || zoneAt(r.position.x, r.position.z) === zone)) {
          r.position.heading = r.heading;
          return Object.assign(r.position, { heading: r.heading });
        }
      }
    }
    if (city.randomSidewalkPoint && near) {
      // legacy: rejection-sample the global function
      for (let i = 0; i < 300; i++) {
        const p = city.randomSidewalkPoint();
        if (okPoint(p, near, rMin, rMax) && (!zone || opts.zoneLoose || zoneAt(p.x, p.z) === zone))
          return p.clone();
      }
    }
    return null;
  }
  function roadPoint(near, rMin = 0, rMax = 150, opts = {}) {
    if (isNew && city.randomRoadPoint) {
      for (let i = 0; i < (opts.tries || 14); i++) {
        let r = null;
        try {
          r = city.randomRoadPoint(near, rMax);
        } catch (e) {
          r = null;
        }
        if (!r) break;
        const p = r.position.clone
          ? r.position.clone()
          : new THREE.Vector3(r.position.x, r.position.y || 0, r.position.z);
        if (!okPoint(p, near, rMin, rMax)) continue;
        if (opts.avoidView && opts.inView?.(p)) continue;
        return { position: p, heading: r.heading ?? 0, edgeId: r.edgeId };
      }
    }
    if (g && near) {
      const r = pointNear(game, near, rMin, rMax, 'road', !!opts.avoidView, 50);
      if (r) return r;
    }
    if (city.randomRoadPoint && near) {
      for (let i = 0; i < 300; i++) {
        const r = city.randomRoadPoint();
        if (okPoint(r.position, near, rMin, rMax))
          return { position: r.position.clone(), heading: r.heading };
      }
    }
    return null;
  }
  function storefrontsNear(near, radius) {
    const arr = city.storefronts || city.shopLots || [];
    const out = [];
    for (const s of arr) {
      const x = s.x ?? s.pos?.x,
        z = s.z ?? s.pos?.z;
      if (!Number.isFinite(x)) continue;
      if (Math.hypot(x - near.x, z - near.z) <= radius) out.push(s);
    }
    return out;
  }

  // ---------------- road graph (real one, or synthesized from the legacy grid)
  let graph = city.roadGraph || null;
  if (!graph && g) {
    const nodes = [],
      edges = [],
      idOf = new Map();
    const xs = g.xs.slice().sort((a, b) => a - b),
      zs = g.zs.slice().sort((a, b) => a - b);
    for (const x of xs)
      for (const z of zs) {
        const id = nodes.length;
        nodes.push({ id, x, z });
        idOf.set(x + ',' + z, id);
      }
    const W = g.roadWidth || 14;
    for (let i = 0; i < xs.length; i++)
      for (let j = 0; j < zs.length; j++) {
        const a = idOf.get(xs[i] + ',' + zs[j]);
        if (i + 1 < xs.length) {
          const b = idOf.get(xs[i + 1] + ',' + zs[j]);
          edges.push({
            id: edges.length,
            a,
            b,
            pts: [
              [xs[i], zs[j]],
              [xs[i + 1], zs[j]],
            ],
            width: W,
            lanesFwd: 2,
            lanesBack: 2,
            oneway: false,
            speedKmh: 50,
          });
        }
        if (j + 1 < zs.length) {
          const b = idOf.get(xs[i] + ',' + zs[j + 1]);
          edges.push({
            id: edges.length,
            a,
            b,
            pts: [
              [xs[i], zs[j]],
              [xs[i], zs[j + 1]],
            ],
            width: W,
            lanesFwd: 2,
            lanesBack: 2,
            oneway: false,
            speedKmh: 50,
          });
        }
      }
    graph = { nodes, edges, synthetic: true };
  }
  let adj = null,
    nodeById = null;
  function buildAdj() {
    if (adj || !graph) return;
    adj = new Map();
    nodeById = new Map();
    for (const n of graph.nodes) nodeById.set(n.id, n);
    for (const e of graph.edges) {
      if (!e.pts || e.pts.length < 2) continue;
      let len = 0;
      for (let i = 1; i < e.pts.length; i++)
        len += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
      e._len = len;
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a).push({ to: e.b, e, fwd: true });
      adj.get(e.b).push({ to: e.a, e, fwd: false });
    }
  }
  function segClosest(px, pz, ax, az, bx, bz) {
    const dx = bx - ax,
      dz = bz - az,
      l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    const x = ax + dx * t,
      z = az + dz * t;
    return {
      t,
      x,
      z,
      d: Math.hypot(px - x, pz - z),
      dir: { x: dx / Math.sqrt(l2), z: dz / Math.sqrt(l2) },
    };
  }
  function nearestEdge(x, z) {
    if (!graph) return null;
    if (graph.nearestEdge && !graph.synthetic) {
      try {
        return graph.nearestEdge(x, z);
      } catch (e) {
        /* fall through */
      }
    }
    let best = null;
    for (const e of graph.edges) {
      const p = e.pts;
      if (!p) continue;
      for (let i = 1; i < p.length; i++) {
        const c = segClosest(x, z, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
        if (!best || c.d < best.dist)
          best = { edge: e, seg: i, t: c.t, dist: c.d, point: { x: c.x, z: c.z }, dir: c.dir };
      }
    }
    return best;
  }
  function nodePos(id) {
    buildAdj();
    return nodeById.get(id);
  }
  // A* from world point A to world point B -> array of {x,z} waypoints (road-following); null if unavailable
  function findPath(ax, az, bx, bz, maxExpand = 25000) {
    if (!graph) return null;
    buildAdj();
    const ea = nearestEdge(ax, az),
      eb = nearestEdge(bx, bz);
    if (!ea || !eb) return null;
    if (ea.edge === eb.edge) return [{ x: eb.point.x, z: eb.point.z }];
    const goalNodes = new Map();
    for (const nid of [eb.edge.a, eb.edge.b]) {
      const n = nodePos(nid);
      if (n) goalNodes.set(nid, Math.hypot(n.x - eb.point.x, n.z - eb.point.z));
    }
    const gS = new Map(),
      came = new Map(),
      open = new Heap();
    for (const nid of [ea.edge.a, ea.edge.b]) {
      const n = nodePos(nid);
      if (!n) continue;
      const c = Math.hypot(n.x - ea.point.x, n.z - ea.point.z);
      gS.set(nid, c);
      came.set(nid, null);
      open.push(nid, c + Math.hypot(n.x - bx, n.z - bz));
    }
    let found = null,
      expand = 0;
    const closed = new Set();
    while (open.size && expand++ < maxExpand) {
      const cur = open.pop();
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (goalNodes.has(cur)) {
        found = cur;
        break;
      }
      const gc = gS.get(cur);
      for (const l of adj.get(cur) || []) {
        const ng = gc + (l.e._len || 1) * (l.e.kind === 'service' ? 1.4 : 1);
        if (ng < (gS.get(l.to) ?? Infinity)) {
          gS.set(l.to, ng);
          came.set(l.to, { from: cur, link: l });
          const n = nodePos(l.to);
          open.push(l.to, ng + (n ? Math.hypot(n.x - bx, n.z - bz) : 0));
        }
      }
    }
    if (found == null) return null;
    const pts = [];
    let cur = found;
    const chain = [];
    while (came.get(cur)) {
      chain.push(came.get(cur));
      cur = came.get(cur).from;
    }
    chain.reverse();
    // start with the entry node of the car's own edge (cur is now the start node), following that edge's polyline
    {
      const sn = nodePos(cur);
      if (sn) {
        const ep = ea.edge.pts,
          fromA = cur === ea.edge.a;
        const seq = fromA ? ep.slice(0, ea.seg ?? 1).reverse() : ep.slice(ea.seg ?? 1);
        for (const q of seq) pts.push({ x: q[0], z: q[1] });
        if (!seq.length) pts.push({ x: sn.x, z: sn.z });
      }
    }
    for (const c of chain) {
      const p = c.link.e.pts;
      const seq = c.link.fwd ? p : p.slice().reverse();
      for (let i = 1; i < seq.length; i++) pts.push({ x: seq[i][0], z: seq[i][1] });
    }
    pts.push({ x: eb.point.x, z: eb.point.z });
    return pts;
  }
  // a point on the road network roughly `dist` metres ahead along `dir` from `pos` (for roadblocks)
  function roadAhead(pos, dir, dist) {
    if (!graph) return null;
    buildAdj();
    const ne = nearestEdge(pos.x, pos.z);
    if (!ne) return null;
    let e = ne.edge;
    const pa = nodePos(e.a),
      pb = nodePos(e.b);
    if (!pa || !pb) return null;
    let toward = (pb.x - pa.x) * dir.x + (pb.z - pa.z) * dir.z >= 0 ? e.b : e.a;
    let at = { x: ne.point.x, z: ne.point.z };
    let left = dist;
    for (let hop = 0; hop < 30; hop++) {
      const n = nodePos(toward);
      if (!n) return null;
      const seg = Math.hypot(n.x - at.x, n.z - at.z);
      if (seg >= left) {
        const k = left / (seg || 1);
        const x = at.x + (n.x - at.x) * k,
          z = at.z + (n.z - at.z) * k;
        const dl = Math.hypot(n.x - at.x, n.z - at.z) || 1;
        return {
          x,
          z,
          dir: { x: (n.x - at.x) / dl, z: (n.z - at.z) / dl },
          width: e.width || 10,
          edge: e,
        };
      }
      left -= seg;
      at = { x: n.x, z: n.z };
      // continue on the outgoing edge best aligned with dir
      let best = null,
        bs = -2;
      for (const l of adj.get(toward) || []) {
        if (l.e === e) continue;
        const m = nodePos(l.to);
        if (!m) continue;
        const dx = m.x - n.x,
          dz = m.z - n.z,
          d = Math.hypot(dx, dz) || 1;
        const s = (dx * dir.x + dz * dir.z) / d;
        if (s > bs) {
          bs = s;
          best = l;
        }
      }
      if (!best || bs < 0.2) return { x: at.x, z: at.z, dir, width: e.width || 10, edge: e };
      e = best.e;
      toward = best.to;
    }
    return null;
  }

  // ---------------- respawn points (hospital / police station) near a position
  const POI_ZONES = {
    hospital: ['downtown', 'business', 'commercial', 'residential'],
    police: ['downtown', 'business', 'commercial', 'nightlife'],
  };
  function respawnPoint(kind, near) {
    const pois = city.pois?.[kind] || city.pois?.[kind + 's'];
    if (Array.isArray(pois) && pois.length) {
      let best = null,
        bd = Infinity;
      for (const p of pois) {
        const x = p.x ?? p.pos?.x,
          z = p.z ?? p.pos?.z;
        const d = Math.hypot(x - near.x, z - near.z);
        if (d < bd) {
          bd = d;
          best = new THREE.Vector3(x, p.y ?? p.pos?.y ?? 0, z);
        }
      }
      if (best) return best;
    }
    const fronts = storefrontsNear(near, 900).filter((s) =>
      POI_ZONES[kind].includes(zoneAt(s.x, s.z)),
    );
    if (fronts.length) {
      fronts.sort(
        (a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z),
      );
      const s = fronts[Math.min(fronts.length - 1, kind === 'hospital' ? 1 : 2)];
      const f = s.facing ?? 0;
      return new THREE.Vector3(
        s.x + Math.sin(f) * ((s.d || 10) / 2 + 2),
        s.y ?? 0.15,
        s.z + Math.cos(f) * ((s.d || 10) / 2 + 2),
      );
    }
    for (const z of POI_ZONES[kind]) {
      const p = sidewalkPoint(near, 120, 700, z);
      if (p) return p;
    }
    return (
      sidewalkPoint(near, 60, 500) ||
      (city.playerSpawn ? city.playerSpawn.clone() : new THREE.Vector3())
    );
  }

  return {
    city,
    isNew,
    bounds,
    mapScale,
    seaLevel,
    isWater,
    groundHeight,
    zoneAt,
    districtAt,
    inBounds,
    sidewalkPoint,
    roadPoint,
    storefrontsNear,
    nearestEdge,
    findPath,
    roadAhead,
    respawnPoint,
    get graph() {
      return graph;
    },
  };
}

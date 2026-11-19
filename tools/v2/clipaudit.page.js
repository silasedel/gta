// Clipping / placement audit, page side (track: clipping sweep). Driven by tools/v2/clipaudit.mjs:
//   const A = await import('/tools/v2/clipaudit.page.js'); await A.auditArea(game, { name, x, z, r })
// Categories (all coordinates are world x, y, z):
//   overlap   hard props whose footprints intersect each other (poles, palms, trees, signs, lamps, benches, bins, hydrants, ...)
//   building  hard props inside / through a building footprint (map buildings, generated house lots, town reservations)
//   road      props on a ground road carriageway or junction fill, or under / on a deck footprint
//   ground    props whose base floats above / sinks below the solid ground (fixed colliders) by more than 5 cm
//   zfight    up-facing surfaces from different triangles covering the same spot within 2 cm (same depth bias)
//   barricade guardrail runs with gaps, kinks (wrong yaw), short orphan pieces or a foot off the ground
//   flap      static scene objects that move vertically while nothing happens (height-query flapping)
const EPS = 0.02;
// footprint radius (m, at scale 1), height, hard = solid (clips visibly); soft plants only conflict with hard props
const KIND = {
  palm: [0.3, 9, 1],
  tree: [0.32, 8, 1],
  lamp: [0.15, 7.6, 1],
  mast: [0.18, 6.5, 1],
  upole: [0.15, 10, 1],
  signPost: [0.06, 3.6, 1],
  hydrant: [0.17, 0.8, 1],
  bin: [0.32, 1.1, 1],
  bench: [0.45, 1, 1],
  bike: [0.4, 1, 1],
  kiosk: [0.8, 3, 1],
  shelter: [1.0, 2.8, 1],
  cafe: [0.55, 1, 1],
  umbrella: [0.06, 2.6, 1],
  hut: [1.6, 4.8, 1],
  blob: [0.6, 1.4, 0],
  flower: [0.6, 1.3, 0],
  vegPalm: [0.3, 9, 1],
  vegTree: [0.32, 8, 1],
  vegShrub: [0.5, 1.5, 0],
};
const SRC = {
  // placement source (file:function) for each prop kind of the city tile builder
  palm: 'tilebuild.js:seedRealProps/buildRoads/palmDress',
  tree: 'tilebuild.js:seedRealProps',
  lamp: 'tilebuild.js:buildRoads/seedRealProps',
  mast: 'tilebuild.js:buildRoads(signals)',
  upole: 'tilebuild.js:buildRoads(utility poles)',
  signPost: 'tilebuild.js:buildRoads(street signs)',
  hydrant: 'tilebuild.js:buildRoads(hydrants)',
  bin: 'tilebuild.js:shopDress/buildRoads',
  bench: 'tilebuild.js:shopDress/plazaDress',
  bike: 'tilebuild.js:shopDress',
  kiosk: 'tilebuild.js:beachDress',
  shelter: 'tilebuild.js:buildRoads(bus stops)',
  cafe: 'tilebuild.js:shopFrontDress',
  umbrella: 'tilebuild.js:beachDress',
  hut: 'tilebuild.js:beachDress',
  blob: 'tilebuild.js:islandDress/plazaDress',
  flower: 'tilebuild.js:plazaDress',
};

function env(game) {
  const R = game.RAPIER,
    W = game.world,
    T = game.THREE || window.THREE,
    city = game.city;
  const QF = R.QueryFilterFlags,
    FIX = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS;
  const ray = (x, z, top) => {
    const h = W.castRay(new R.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), 30, true, FIX);
    return h ? top - h.timeOfImpact : null;
  };
  return { R, W, T, city, ray };
}

// ---------------------------------------------------------------- collect static items in the area
function collect(game, A) {
  const { T, city } = env(game),
    out = [],
    inA = (x, z) => (x - A.x) ** 2 + (z - A.z) ** 2 < A.r * A.r;
  const st = city.streamer;
  for (const t of st.tiles.values()) {
    if (!t.near || !t.props) continue;
    const P = t.props;
    for (const kind of Object.keys(SRC))
      for (const p of P[kind] || []) {
        if (!inA(p.x, p.z)) continue;
        const s = p.s || 1;
        out.push({
          kind,
          src: p.elev
            ? 'elevated/network.js:lamps'
            : p.real
              ? 'tilebuild.js:seedRealProps(' + kind + ')'
              : SRC[kind],
          x: p.x,
          y: p.y || 0,
          z: p.z,
          r: KIND[kind][0] * s,
          h: KIND[kind][1] * s,
          hard: KIND[kind][2],
          ref: p,
        });
      }
  }
  // vegetation fields (trees / palms / shrubs placed by world-dressing, houses, towns, vegetation): one item per instance
  const seen = new Set(),
    m = new T.Matrix4(),
    v = new T.Vector3();
  game.scene.traverse((o) => {
    if (!o.name || !o.name.startsWith('vegField_')) return;
    const kind = o.name.slice(9),
      type = game.vegetation?.types?.[kind] || 'shrub',
      k = type === 'palm' ? 'vegPalm' : type === 'tree' ? 'vegTree' : 'vegShrub';
    let owner = o.userData?.src || o.parent?.name || 'scene';
    o.traverse((im) => {
      if (!im.isInstancedMesh) return;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        v.setFromMatrixPosition(m);
        if (!inA(v.x, v.z)) continue;
        const key = kind + ':' + v.x.toFixed(2) + ',' + v.z.toFixed(2);
        if (seen.has(key)) continue;
        seen.add(key);
        const s = Math.cbrt(Math.abs(m.determinant())) || 1;
        out.push({
          kind: k,
          sp: kind,
          src: 'vegetation field ' + kind + ' (' + owner + ')',
          x: v.x,
          y: v.y,
          z: v.z,
          r: KIND[k][0] * s,
          h: KIND[k][1] * s,
          hard: KIND[k][2],
        });
      }
    });
  });
  // world-dressing / set-piece placements registered in the shared occupancy index (src/world/ground/occupancy.js)
  const occ = game.occupancy || globalThis.__southlineOccupancy;
  if (occ && occ.items)
    for (const it of occ.items()) {
      if (it.audit === false || !inA(it.x, it.z)) continue;
      if (out.some((q) => q.ref === it.ref && it.ref)) continue;
      const k = KIND[it.kind] ? it.kind : null;
      out.push({
        kind: it.kind,
        src: it.src,
        x: it.x,
        y: it.y ?? 0,
        z: it.z,
        r: it.r,
        h: it.h ?? (k ? KIND[k][1] : 2),
        hard: it.hard ?? 1,
        occ: true,
      });
    }
  return out;
}

function buildingsIn(game, A) {
  const city = game.city,
    data = game.miamiData,
    out = [];
  const TS = city.streamer.tileSize,
    t0x = Math.floor((A.x - A.r) / TS),
    t1x = Math.floor((A.x + A.r) / TS),
    t0z = Math.floor((A.z - A.r) / TS),
    t1z = Math.floor((A.z + A.r) / TS);
  for (let tx = t0x; tx <= t1x; tx++)
    for (let tz = t0z; tz <= t1z; tz++) {
      const tile = data?.getTile?.(tx, tz);
      if (!tile) continue;
      for (const b of tile.buildings || []) {
        if (!b.rings || !b.rings[0] || b.part) continue;
        out.push({ ring: b.rings[0], h: b.h || 6, id: b.id, src: 'map building' });
      }
    }
  return out;
}
const pip = (r, x, z) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i],
      [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax,
    dz = bz - az,
    L2 = dx * dx + dz * dz;
  let t = L2 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const ringD = (r, x, z) => {
  let d = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    d = Math.min(d, segD(x, z, r[j][0], r[j][1], r[i][0], r[i][1]));
  return d;
};

// ---------------------------------------------------------------- audit
export async function auditArea(game, A, opts = {}) {
  const E = env(game),
    { city } = E,
    res = {
      name: A.name,
      x: A.x,
      z: A.z,
      r: A.r,
      items: 0,
      overlap: [],
      building: [],
      road: [],
      ground: [],
      zfight: [],
      zfightRaw: 0,
      barricade: [],
      flap: [],
    };
  const items = collect(game, A);
  res.items = items.length;
  // grid for neighbor search
  const G = new Map(),
    C = 4,
    key = (i, j) => i * 100003 + j;
  items.forEach((it, n) => {
    const k = key(Math.floor(it.x / C), Math.floor(it.z / C));
    if (!G.has(k)) G.set(k, []);
    G.get(k).push(n);
  });
  // a. overlap
  items.forEach((a, ia) => {
    const gi = Math.floor(a.x / C),
      gj = Math.floor(a.z / C);
    for (let i = gi - 1; i <= gi + 1; i++)
      for (let j = gj - 1; j <= gj + 1; j++)
        for (const ib of G.get(key(i, j)) || []) {
          if (ib <= ia) continue;
          const b = items[ib];
          if (!a.hard && !b.hard) continue;
          if (a.ref && a.ref === b.ref) continue;
          if (
            (a.kind === 'cafe' && b.kind === 'umbrella') ||
            (a.kind === 'umbrella' && b.kind === 'cafe')
          )
            continue; // parasol through its own table
          const d = Math.hypot(a.x - b.x, a.z - b.z),
            pen = a.r + b.r - d;
          if (pen <= EPS) continue;
          if (a.y + a.h < b.y || b.y + b.h < a.y) continue; // vertically apart (deck lamp over a street)
          if (d < 0.01 && a.kind === b.kind && a.src === b.src) {
            res.overlap.push({
              x: +a.x.toFixed(2),
              y: +a.y.toFixed(2),
              z: +a.z.toFixed(2),
              a: a.kind,
              b: b.kind,
              srcA: a.src,
              srcB: b.src,
              pen: +pen.toFixed(2),
              dup: true,
            });
            continue;
          }
          res.overlap.push({
            x: +a.x.toFixed(2),
            y: +a.y.toFixed(2),
            z: +a.z.toFixed(2),
            a: a.kind,
            b: b.kind,
            srcA: a.src,
            srcB: b.src,
            pen: +pen.toFixed(2),
          });
        }
  });
  // a0. doubled poles: two lamp / utility poles / signal masts standing side by side (< 1.5 m apart)
  const PL = { lamp: 1, upole: 1, mast: 1 };
  items.forEach((a, ia) => {
    if (!PL[a.kind] || a.y > 1.5) return;
    const gi = Math.floor(a.x / C),
      gj = Math.floor(a.z / C);
    for (let i = gi - 1; i <= gi + 1; i++)
      for (let j = gj - 1; j <= gj + 1; j++)
        for (const ib of G.get(key(i, j)) || []) {
          if (ib <= ia) continue;
          const b = items[ib];
          if (!PL[b.kind] || b.y > 1.5) continue;
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d < 1.5 && d >= a.r + b.r + EPS)
            res.overlap.push({
              x: +a.x.toFixed(2),
              y: +a.y.toFixed(2),
              z: +a.z.toFixed(2),
              a: a.kind + '-double',
              b: b.kind,
              srcA: a.src,
              srcB: b.src,
              pen: +(1.5 - d).toFixed(2),
            });
        }
  });
  // a1. pole through a crown: a tall pole (utility pole, lamp, signal mast) standing inside a palm / tree canopy
  const CROWN = { palm: 2.6, vegPalm: 2.6, tree: 3.2, vegTree: 3.2 },
    POLE = { upole: 1, lamp: 1, mast: 1 };
  items.forEach((a) => {
    if (!CROWN[a.kind]) return;
    const cr = CROWN[a.kind] * (a.h / KIND[a.kind][1]),
      cy = a.y + a.h * 0.62;
    const gi = Math.floor(a.x / C),
      gj = Math.floor(a.z / C);
    for (let i = gi - 1; i <= gi + 1; i++)
      for (let j = gj - 1; j <= gj + 1; j++)
        for (const ib of G.get(key(i, j)) || []) {
          const b = items[ib];
          if (!POLE[b.kind] || b.y + b.h < cy) continue;
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d >= cr * 0.8 || d < a.r + b.r) continue; // trunk contact is counted above
          res.overlap.push({
            x: +b.x.toFixed(2),
            y: +b.y.toFixed(2),
            z: +b.z.toFixed(2),
            a: a.kind + '-crown',
            b: b.kind,
            srcA: a.src,
            srcB: b.src,
            pen: +(cr * 0.8 - d).toFixed(2),
          });
        }
  });
  // a2. buildings
  const blds = buildingsIn(game, A),
    lots = (await import('/src/world/setpieces/houses/lots.js')).lots;
  for (const b of blds) {
    let a0 = Infinity,
      a1 = -Infinity,
      c0 = Infinity,
      c1 = -Infinity;
    for (const [x, z] of b.ring) {
      a0 = Math.min(a0, x);
      a1 = Math.max(a1, x);
      c0 = Math.min(c0, z);
      c1 = Math.max(c1, z);
    }
    b.bb = [a0, a1, c0, c1];
    b.claimed = lots.claims ? lots.claims({ ...b, rings: [b.ring] }) : false;
  }
  for (const it of items) {
    if (!it.hard || it.y > 1.5) continue; // roof props / deck lamps
    for (const b of blds) {
      const [a0, a1, c0, c1] = b.bb;
      if (it.x < a0 - it.r || it.x > a1 + it.r || it.z < c0 - it.r || it.z > c1 + it.r) continue;
      const inside = pip(b.ring, it.x, it.z),
        d = ringD(b.ring, it.x, it.z);
      if (inside || d < it.r - EPS) {
        res.building.push({
          x: +it.x.toFixed(2),
          y: +it.y.toFixed(2),
          z: +it.z.toFixed(2),
          kind: it.kind,
          src: it.src,
          inside,
          bld: b.id ?? null,
        });
        break;
      }
    }
    for (const q of lots.reserved || []) {
      const dx = it.x - q.x,
        dz = it.z - q.z,
        c = Math.cos(q.ry || 0),
        s = Math.sin(q.ry || 0),
        u = dx * c - dz * s,
        v = dx * s + dz * c;
      if (
        Math.abs(u) < q.hw - 0.3 &&
        Math.abs(v) < q.hd - 0.3 &&
        !String(it.src).includes('town')
      ) {
        res.building.push({
          x: +it.x.toFixed(2),
          y: +it.y.toFixed(2),
          z: +it.z.toFixed(2),
          kind: it.kind,
          src: it.src,
          inside: true,
          bld: 'town:' + (q.id || ''),
        });
        break;
      }
    }
  }
  // b. roads + decks
  const rg = game.miamiData?.roadGraph || city.roadGraph,
    segs = [];
  for (const e of rg.edges) {
    if (!e.pts || e.pts.length < 2) continue;
    if (e.elevated || e.bridge) continue;
    let near = false;
    for (const p of e.pts)
      if ((p[0] - A.x) ** 2 + (p[1] - A.z) ** 2 < (A.r + 200) ** 2) {
        near = true;
        break;
      }
    if (!near) continue;
    for (let i = 0; i < e.pts.length - 1; i++)
      segs.push([e.pts[i][0], e.pts[i][1], e.pts[i + 1][0], e.pts[i + 1][1], e.width / 2, e.kind]);
  }
  const nodes = (rg.nodes || []).filter(
    (n) => (n.edges || []).length >= 3 && (n.x - A.x) ** 2 + (n.z - A.z) ** 2 < (A.r + 50) ** 2,
  );
  const el = city.elevated;
  for (const it of items) {
    if (it.y > 1.5) continue;
    let worst = null;
    for (const s of segs) {
      const d = segD(it.x, it.z, s[0], s[1], s[2], s[3]),
        gap = d - s[4];
      if (gap < it.r - 0.05 && (!worst || gap < worst.gap)) worst = { gap, kind: s[5] };
    }
    if (worst && !(it.kind === 'vegShrub' || it.kind === 'blob' || it.kind === 'flower')) {
      res.road.push({
        x: +it.x.toFixed(2),
        y: +it.y.toFixed(2),
        z: +it.z.toFixed(2),
        kind: it.kind,
        src: it.src,
        gap: +worst.gap.toFixed(2),
        road: worst.kind,
      });
      continue;
    }
    if (worst) {
      res.road.push({
        x: +it.x.toFixed(2),
        y: +it.y.toFixed(2),
        z: +it.z.toFixed(2),
        kind: it.kind,
        src: it.src,
        gap: +worst.gap.toFixed(2),
        road: worst.kind,
      });
      continue;
    }
    if (el && el.footprintAt) {
      let f = null;
      try {
        f = el.footprintAt(it.x, it.z);
      } catch (e) {
        /* */
      }
      if (f && (f.type === 1 || f.y - 1.3 < it.y + it.h)) {
        res.road.push({
          x: +it.x.toFixed(2),
          y: +it.y.toFixed(2),
          z: +it.z.toFixed(2),
          kind: it.kind,
          src: it.src,
          deck: +f.y.toFixed(2),
        });
      }
    }
  }
  // c. ground: median of 4 fixed-collider probes just outside the footprint, from 2 m above the base
  for (const it of items) {
    if (it.kind === 'vegShrub' && it.y < -0.1) continue; // mangroves in the shallows
    if (it.ref && it.ref.elev) continue; // ELEVATED deck lamps stand on the barrier top (not on the deck surface)
    const o = it.r + 0.35,
      hs = [];
    for (const [dx, dz] of [
      [o, 0],
      [-o, 0],
      [0, o],
      [0, -o],
    ]) {
      const h = E.ray(it.x + dx, it.z + dz, it.y + 2);
      if (h !== null) hs.push(h);
    }
    if (hs.length < 2) continue;
    hs.sort((a, b) => a - b);
    const g = hs.length === 4 ? (hs[1] + hs[2]) / 2 : hs[0],
      dy = it.y - g;
    // a base inside the range spanned by the probes is fine (curb edge, slope); outside it by more than 5 cm is not
    const lo = hs[0],
      hi = hs[hs.length - 1];
    if (!it.hard && it.y - g > 0.4 && it.y - g < 0.75) continue; // plants in a raised planter box (planter has no collider)
    if (it.y > hi + 0.05 || it.y < lo - 0.05) {
      if (Math.abs(dy) > 0.05)
        res.ground.push({
          x: +it.x.toFixed(2),
          y: +it.y.toFixed(2),
          z: +it.z.toFixed(2),
          kind: it.kind,
          src: it.src,
          dy: +dy.toFixed(3),
          ground: +g.toFixed(3),
        });
    }
  }
  // d. z-fighting candidates
  if (opts.zfight !== false) Object.assign(res, zfight(game, A));
  // e. barricades (guardrail runs of the tile builder: B.guard meshes)
  res.barricade = barricades(game, A, E);
  return res;
}

// up-facing triangles of every visible static mesh (non-instanced) in the area, rasterized on a 1 m grid
function zfight(game, A) {
  const T = game.THREE || window.THREE,
    CELL = 1.5,
    cells = new Map(),
    meshes = [],
    box = new T.Box3(),
    aBox = new T.Box3(
      new T.Vector3(A.x - A.r, -50, A.z - A.r),
      new T.Vector3(A.x + A.r, 400, A.z + A.r),
    );
  const skip = (o) => {
    for (let p = o; p; p = p.parent) {
      if (!p.visible) return true;
      const n = p.name || '';
      if (
        /^(vehicle|car|ped|npc|player|nico|mid|far|chunk-|miami-land-base|ocean|sky|vegField)/i.test(
          n,
        ) ||
        p.userData?.vehicle ||
        p.userData?.isPed
      )
        return true;
    }
    return false;
  };
  game.scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry?.attributes?.position)
      return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    box.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    if (!box.intersectsBox(aBox)) return;
    if (box.max.y - box.min.y > 300) return;
    if (skip(o)) return;
    const FARM = game.city.materials?.far;
    if (FARM && o.material === FARM && o.geometry.attributes.aTile) {
      const A2 = o.geometry.attributes.aTile;
      if (A2.count && A2.getX(0) > -1e5) return;
    }
    meshes.push(o);
  });
  const va = new T.Vector3(),
    vb = new T.Vector3(),
    vc = new T.Vector3(),
    n = new T.Vector3(),
    e1 = new T.Vector3(),
    e2 = new T.Vector3();
  const depthKey = (m) => {
    m = Array.isArray(m) ? m[0] : m;
    if (!m) return '0';
    return (
      (m.polygonOffset ? m.polygonOffsetFactor + '/' + m.polygonOffsetUnits : '0') +
      (m.transparent && !m.depthWrite ? 'T' : '')
    );
  };
  let tris = 0;
  const matName = new Map(),
    MK = new Map();
  for (const [k, v] of Object.entries(game.city.materials || {}))
    if (v && v.uuid) MK.set(v.uuid, k);
  const matKey = (m) => MK.get(m.uuid) || m.name || m.type;
  const tEnd = performance.now() + 120000;
  meshes.forEach((o, mi) => {
    if (performance.now() > tEnd) return;
    const LOT = o.geometry.attributes.aLot,
      LM = game.houses?.kit?.lotMask;
    const g = o.geometry,
      P = g.attributes.position,
      I = g.index,
      nT = I ? I.count / 3 : P.count / 3,
      mw = o.matrixWorld;
    const groups = g.groups && g.groups.length && Array.isArray(o.material) ? g.groups : null;
    const matAt = (f) => {
      if (!groups) return Array.isArray(o.material) ? o.material[0] : o.material;
      for (const gr of groups)
        if (f * 3 >= gr.start && f * 3 < gr.start + gr.count) return o.material[gr.materialIndex];
      return o.material[0];
    };
    for (let f = 0; f < nT; f++) {
      const ia = I ? I.getX(f * 3) : f * 3,
        ib = I ? I.getX(f * 3 + 1) : f * 3 + 1,
        ic = I ? I.getX(f * 3 + 2) : f * 3 + 2;
      va.fromBufferAttribute(P, ia).applyMatrix4(mw);
      vb.fromBufferAttribute(P, ib).applyMatrix4(mw);
      vc.fromBufferAttribute(P, ic).applyMatrix4(mw);
      e1.subVectors(vb, va);
      e2.subVectors(vc, va);
      n.crossVectors(e1, e2);
      const L = n.length();
      if (L < 1e-6) continue;
      n.divideScalar(L);
      if (Math.abs(n.y) < 0.97) continue; // up-facing (or down-facing double-sided) flat surfaces only
      if (n.y < 0 && va.y < 0.5) continue; // undersides at ground level are never seen
      if (LOT && LM && LM.hidden && LM.hidden(Math.round(LOT.getX(ia)))) continue; // house lot hidden in the merged mesh (its full build shows)
      const x0 = Math.min(va.x, vb.x, vc.x),
        x1 = Math.max(va.x, vb.x, vc.x),
        z0 = Math.min(va.z, vb.z, vc.z),
        z1 = Math.max(va.z, vb.z, vc.z);
      if (x1 < A.x - A.r || x0 > A.x + A.r || z1 < A.z - A.r || z0 > A.z + A.r) continue;
      if ((x1 - x0) * (z1 - z0) > 40000) continue; // map-scale planes (sea, land base): not a layer that can fight locally
      const m = matAt(f);
      if (!m || m.visible === false || (m.transparent && m.opacity < 0.05)) continue;
      tris++;
      const CA = g.attributes.color;
      const col = CA
        ? Math.round((CA.getX(ia) + CA.getX(ib) + CA.getX(ic)) * 40) * 1e6 +
          Math.round((CA.getY(ia) + CA.getY(ib) + CA.getY(ic)) * 40) * 1e3 +
          Math.round((CA.getZ(ia) + CA.getZ(ib) + CA.getZ(ic)) * 40)
        : -1;
      const dk = depthKey(m),
        det = (vb.z - vc.z) * (va.x - vc.x) + (vc.x - vb.x) * (va.z - vc.z);
      if (Math.abs(det) < 1e-9) continue;
      for (let gx = Math.ceil(x0 / CELL - 0.5); gx + 0.5 <= x1 / CELL; gx++)
        for (let gz = Math.ceil(z0 / CELL - 0.5); gz + 0.5 <= z1 / CELL; gz++) {
          const px = (gx + 0.5) * CELL,
            pz = (gz + 0.5) * CELL;
          if ((px - A.x) ** 2 + (pz - A.z) ** 2 > A.r * A.r) continue;
          const l1 = ((vb.z - vc.z) * (px - vc.x) + (vc.x - vb.x) * (pz - vc.z)) / det,
            l2 = ((vc.z - va.z) * (px - vc.x) + (va.x - vc.x) * (pz - vc.z)) / det,
            l3 = 1 - l1 - l2;
          if (l1 < 1e-4 || l2 < 1e-4 || l3 < 1e-4) continue;
          const y = l1 * va.y + l2 * vb.y + l3 * vc.y,
            k = gx + ',' + gz;
          let c = cells.get(k);
          if (!c) cells.set(k, (c = []));
          c.push(y, mi, f, n.y > 0 ? 1 : -1, dk, m.uuid, col);
          matName.set(m.uuid, matKey(m));
        }
    }
  });
  const list = [],
    bySrc = {},
    floatDecal = [];
  let raw = 0;
  for (const [k, c] of cells) {
    // floating road paint / junction pads / crosswalks: a decal layer with nothing right under it
    for (let i = 0; i < c.length; i += 7) {
      const mk = matName.get(c[i + 5]);
      if (c[i + 3] < 0 || !/^(markings|junction)$/.test(mk || '')) continue;
      let below = -Infinity;
      for (let j = 0; j < c.length; j += 7)
        if (j !== i && c[j + 3] > 0 && c[j] < c[i] - 0.001 && c[j] > below) below = c[j];
      if (below > -Infinity && c[i] - below > 0.1 && c[i] - below < 12 && floatDecal.length < 300) {
        const [gx, gz] = k.split(',').map(Number);
        floatDecal.push({
          x: (gx + 0.5) * CELL,
          y: +c[i].toFixed(3),
          z: (gz + 0.5) * CELL,
          gap: +(c[i] - below).toFixed(3),
          mat: mk,
          src: 'tilebuild.js:buildRoads(' + mk + ')',
        });
        break;
      }
    }
  }
  for (const [k, c] of cells) {
    if (c.length < 14) continue;
    let hit = null;
    for (let i = 0; i < c.length && !hit; i += 7)
      for (let j = i + 7; j < c.length; j += 7) {
        if (c[i + 3] !== c[j + 3]) continue; // opposite facings never fight
        if (Math.abs(c[i] - c[j]) >= EPS) continue;
        if (c[i + 1] === c[j + 1] && c[i + 2] === c[j + 2]) continue;
        raw++;
        if (c[i + 4] !== c[j + 4] && c[i + 5] !== c[j + 5]) continue; // different depth bias: resolved by polygon offset
        if (c[i + 5] === c[j + 5] && c[i + 6] === c[j + 6] && Math.abs(c[i] - c[j]) < 0.001)
          continue; // identical surface (same material, color, height): draws the same either way
        if (c[i + 5] === c[j + 5] && Math.abs(c[i] - c[j]) < 1e-5 && c[i + 1] === c[j + 1]) {
          /* exact duplicate in the same mesh and material: still a fight when colors differ */
        }
        hit = [i, j];
        break;
      }
    if (!hit) continue;
    const [i, j] = hit,
      [gx, gz] = k.split(',').map(Number),
      mA = meshes[c[i + 1]],
      mB = meshes[c[j + 1]];
    const nm = (o) => {
      const a = [];
      for (let p = o; p && p !== game.scene && a.length < 3; p = p.parent) a.push(p.name || p.type);
      return a.join('<');
    };
    const pair = [
      nm(mA) + ' [' + matName.get(c[i + 5]) + ']',
      nm(mB) + ' [' + matName.get(c[j + 5]) + ']',
    ]
      .sort()
      .join(' | ');
    bySrc[pair] = (bySrc[pair] || 0) + 1;
    if (list.length < 400)
      list.push({
        x: (gx + 0.5) * CELL,
        y: +c[i].toFixed(3),
        z: (gz + 0.5) * CELL,
        dy: +(c[j] - c[i]).toFixed(4),
        a: nm(mA) + ' [' + matName.get(c[i + 5]) + ']',
        b: nm(mB) + ' [' + matName.get(c[j + 5]) + ']',
      });
  }
  return {
    floatDecal,
    zfight: list,
    zfightCells: Object.values(bySrc).reduce((s, v) => s + v, 0),
    zfightBySrc: bySrc,
    zfightRaw: raw,
  };
}

// guardrail runs: the B.guard batch of each near tile (posts = small vertical boxes 0.1 x 0.76 x 0.1)
function barricades(game, A, E) {
  const out = [],
    T = game.THREE || window.THREE,
    M = game.city.materials;
  const gm = M && M.guardrail;
  if (!gm) return out;
  const posts = [];
  game.city.root.traverse((o) => {
    if (!o.isMesh || o.material !== gm || o.name === 'string-light-cables') return;
    const P = o.geometry.attributes.position;
    if (!P) return;
    const v = new T.Vector3();
    // posts: clusters of 24 (BoxGeometry non-indexed after merge) or 8 vertices with a 0.1 m footprint; take their centers
    const n = P.count;
    for (let i = 0; i + 24 <= n; i += 24) {
      let x0 = Infinity,
        x1 = -Infinity,
        y0 = Infinity,
        y1 = -Infinity,
        z0 = Infinity,
        z1 = -Infinity;
      for (let k = 0; k < 24; k++) {
        v.fromBufferAttribute(P, i + k).applyMatrix4(o.matrixWorld);
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y);
        y1 = Math.max(y1, v.y);
        z0 = Math.min(z0, v.z);
        z1 = Math.max(z1, v.z);
      }
      if (y1 - y0 > 0.6 && y1 - y0 < 0.9 && x1 - x0 < 0.2 && z1 - z0 < 0.2) {
        const x = (x0 + x1) / 2,
          z = (z0 + z1) / 2;
        if ((x - A.x) ** 2 + (z - A.z) ** 2 < A.r * A.r) posts.push({ x, z, y0 });
      }
    }
  });
  if (!posts.length) return out;
  // chain posts: each post's nearest neighbors; runs = connected components at <= 2.6 m
  const used = new Set(),
    runs = [];
  for (let i = 0; i < posts.length; i++) {
    if (used.has(i)) continue;
    const run = [i];
    used.add(i);
    for (let q = 0; q < run.length; q++) {
      const a = posts[run[q]];
      for (let j = 0; j < posts.length; j++)
        if (!used.has(j) && Math.hypot(posts[j].x - a.x, posts[j].z - a.z) < 2.6) {
          used.add(j);
          run.push(j);
        }
    }
    runs.push(run.map((k) => posts[k]));
  }
  for (const r of runs) {
    // a. short orphan piece
    if (r.length < 5)
      out.push({
        x: +r[0].x.toFixed(2),
        z: +r[0].z.toFixed(2),
        y: +r[0].y0.toFixed(2),
        why: 'orphan run of ' + r.length + ' posts',
        src: 'tilebuild.js:buildRoads(causeway guardrail)',
      });
    // b. gaps: run endpoints close (< 12 m) to another run's endpoint
    // c. foot off the ground
    for (const p of r) {
      const g = E.ray(p.x + 0.4, p.z, p.y0 + 2);
      if (g !== null && Math.abs(g - p.y0) > 0.08) {
        out.push({
          x: +p.x.toFixed(2),
          z: +p.z.toFixed(2),
          y: +p.y0.toFixed(2),
          why:
            'post foot ' +
            (p.y0 - g > 0 ? 'floating ' : 'sunk ') +
            Math.abs(p.y0 - g).toFixed(2) +
            ' m',
          src: 'tilebuild.js:buildRoads(causeway guardrail)',
        });
        break;
      }
    }
  }
  const ends = [];
  for (const r of runs) {
    if (r.length < 2) continue; // farthest pair approximates the two ends
    let a = r[0],
      b = r[0],
      best = 0;
    for (const p of r) {
      const d = Math.hypot(p.x - r[0].x, p.z - r[0].z);
      if (d > best) {
        best = d;
        a = p;
      }
    }
    best = 0;
    for (const p of r) {
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (d > best) {
        best = d;
        b = p;
      }
    }
    ends.push([a, r], [b, r]);
  }
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) {
      if (ends[i][1] === ends[j][1]) continue;
      const d = Math.hypot(ends[i][0].x - ends[j][0].x, ends[i][0].z - ends[j][0].z);
      if (d < 12)
        out.push({
          x: +ends[i][0].x.toFixed(2),
          z: +ends[i][0].z.toFixed(2),
          y: +ends[i][0].y0.toFixed(2),
          why: 'gap ' + d.toFixed(1) + ' m between runs',
          src: 'tilebuild.js:buildRoads(causeway guardrail)',
        });
    }
  return out;
}

// f. flapping: static scene objects whose world y changes while the camera and time stand still
export async function flapScan(game, A, frames = 45) {
  const T = game.THREE || window.THREE,
    objs = [],
    v = new T.Vector3();
  const dyn = (o) => {
    for (let p = o; p; p = p.parent) {
      const n = (p.name || '').toLowerCase();
      if (
        p.userData?.vehicle ||
        p.userData?.dynamic ||
        /vehicle|car_|ped|npc|player|nico|bird|wildlife|fx|particle|cloud|ocean|water|boat|heli|plane|traffic|cop|police|camera|sky|sun|moon|light|flag|wave|people|crowd/.test(
          n,
        )
      )
        return true;
    }
    return false;
  };
  const roots = [
    game.city.root,
    ...game.scene.children.filter((c) =>
      /^(dressing|houses|towns|keys|nicoHouse|setpiece|sign)/i.test(c.name || ''),
    ),
  ];
  for (const root of roots)
    root.traverse((o) => {
      if (!o.isMesh && !o.isGroup) return;
      if (o.isInstancedMesh) return;
      o.getWorldPosition(v);
      if ((v.x - A.x) ** 2 + (v.z - A.z) ** 2 > A.r * A.r) return;
      if (o.isSkinnedMesh || dyn(o)) return;
      objs.push([o, v.y, v.y, v.y]);
    });
  for (let f = 0; f < frames; f++) {
    await new Promise((r) => requestAnimationFrame(r));
    for (const e of objs) {
      e[0].getWorldPosition(v);
      e[2] = Math.min(e[2], v.y);
      e[3] = Math.max(e[3], v.y);
    }
  }
  const out = [];
  for (const [o, , lo, hi] of objs)
    if (hi - lo > 0.02) {
      const a = [];
      for (let p = o; p && p !== game.scene && a.length < 4; p = p.parent) a.push(p.name || p.type);
      o.getWorldPosition(v);
      out.push({
        x: +v.x.toFixed(2),
        y: +v.y.toFixed(2),
        z: +v.z.toFixed(2),
        range: +(hi - lo).toFixed(3),
        src: a.join('<'),
      });
    }
  return out;
}

// Test-only synthetic "real-scale" city exposing the CONTRACT4 API (used by hudtest.html?demo=osm). Not loaded by the game.
export function makeSyntheticCity() {
  const B = { minX: -3500, maxX: 3500, minZ: -2500, maxZ: 2500 };
  const land = [
    [
      [-3500, -2500],
      [600, -2500],
      [300, -800],
      [500, 600],
      [200, 2500],
      [-3500, 2500],
    ],
  ];
  const island = [
    [1500, -2200],
    [1900, -2200],
    [2000, 2200],
    [1600, 2300],
    [1450, 0],
  ];
  land.push(island);
  const beach = [
    [
      [1880, -2200],
      [1990, -2200],
      [2090, 2200],
      [1990, 2300],
    ],
  ];
  const water = [
    [
      [700, -1300],
      [900, -1250],
      [950, -1000],
      [720, -1050],
    ],
  ];
  const park = [
    [
      [-1200, -400],
      [-900, -420],
      [-880, -150],
      [-1210, -120],
    ],
    [
      [-2600, 900],
      [-2200, 900],
      [-2200, 1200],
      [-2600, 1200],
    ],
  ];
  const nodes = [],
    edges = [],
    adj = new Map();
  const nid = (x, z) => {
    const id = nodes.length;
    nodes.push({ id, x, z });
    return id;
  };
  const addE = (a, b, name, kind, width, bridge = false, oneway = false) => {
    const A = nodes[a],
      Bn = nodes[b],
      mx = (A.x + Bn.x) / 2 + (Math.random() - 0.5) * 6,
      mz = (A.z + Bn.z) / 2 + (Math.random() - 0.5) * 6;
    const e = {
      id: edges.length,
      a,
      b,
      pts: [
        [A.x, A.z],
        [mx, mz],
        [Bn.x, Bn.z],
      ],
      width,
      kind,
      name,
      bridge,
      oneway,
      lanesFwd: 1,
      lanesBack: oneway ? 0 : 1,
      speedKmh: 50,
    };
    edges.push(e);
    for (const n of [a, b]) {
      if (!adj.has(n)) adj.set(n, []);
      adj.get(n).push(e);
    }
  };
  // rotated grid on mainland
  const ang = 0.18,
    ca = Math.cos(ang),
    sa = Math.sin(ang),
    grid = [];
  const NI = 34,
    NJ = 26,
    sp = 140;
  for (let i = 0; i < NI; i++) {
    grid[i] = [];
    for (let j = 0; j < NJ; j++) {
      const u = -3300 + i * sp,
        v = -2300 + j * sp,
        x = u * ca - v * sa,
        z = u * sa + v * ca;
      grid[i][j] = x > -3450 && x < 280 && z > -2450 && z < 2450 ? nid(x, z) : -1;
    }
  }
  for (let i = 0; i < NI; i++)
    for (let j = 0; j < NJ; j++) {
      const a = grid[i][j];
      if (a < 0) continue;
      if (i + 1 < NI && grid[i + 1][j] >= 0)
        addE(
          a,
          grid[i + 1][j],
          `NW ${j + 1}th Street`,
          j % 5 === 0 ? 'primary' : 'residential',
          j % 5 === 0 ? 14 : 8,
        );
      if (j + 1 < NJ && grid[i][j + 1] >= 0)
        addE(
          a,
          grid[i][j + 1],
          `NW ${i + 1}th Avenue`,
          i % 6 === 0 ? 'secondary' : 'residential',
          i % 6 === 0 ? 12 : 8,
          false,
          i % 2 === 1,
        );
    }
  // causeway (bridge) to island + island spine
  const c0 = nid(250, 200),
    c1 = nid(1550, 150),
    s0 = nid(1700, -2100),
    s1 = nid(1780, 2150);
  let nearest = 0,
    bd = 1e9;
  for (const n of nodes)
    if (n.id < c0) {
      const d = Math.hypot(n.x - 250, n.z - 200);
      if (d < bd) {
        bd = d;
        nearest = n.id;
      }
    }
  addE(nearest, c0, 'Bay Causeway', 'primary', 14);
  addE(c0, c1, 'Bay Causeway', 'trunk', 16, true);
  const mid = nid(1620, 120);
  addE(c1, mid, 'Bay Causeway', 'primary', 14);
  addE(s0, mid, 'Ocean Drive', 'secondary', 12);
  addE(mid, s1, 'Ocean Drive', 'secondary', 12);
  const buildingPolys = [];
  for (let i = 0; i < NI - 1; i++)
    for (let j = 0; j < NJ - 1; j++) {
      const a = grid[i][j],
        b = grid[i + 1][j + 1];
      if (a < 0 || b < 0) continue;
      for (let k = 0; k < 4; k++) {
        const u = -3300 + (i + 0.25 + (k % 2) * 0.5) * sp,
          v = -2300 + (j + 0.25 + (k >> 1) * 0.5) * sp,
          cx = u * ca - v * sa,
          cz = u * sa + v * ca;
        if (cx > -1200 && cx < -880 && cz > -420 && cz < -120) continue;
        const w = 20 + Math.random() * 25,
          d = 20 + Math.random() * 25,
          pts = [];
        for (const [px, pz] of [
          [-w, -d],
          [w, -d],
          [w, d],
          [-w, d],
        ])
          pts.push([cx + px * ca - pz * sa, cz + px * sa + pz * ca]);
        const poly = pts;
        poly.h = Math.random() < 0.15 ? 60 + Math.random() * 120 : 8 + Math.random() * 20;
        buildingPolys.push(poly);
      }
    }
  const segD = (e, x, z) => {
    let best = { d: 1e18 };
    for (let i = 0; i < e.pts.length - 1; i++) {
      const [ax, az] = e.pts[i],
        [bx, bz] = e.pts[i + 1],
        dx = bx - ax,
        dz = bz - az,
        L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
      const px = ax + dx * t,
        pz = az + dz * t,
        d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { d, t, px, pz, dx, dz };
    }
    return best;
  };
  const roadGraph = {
    nodes,
    edges,
    nearestEdge(x, z) {
      let be = null,
        bs = null;
      for (const e of edges) {
        const s = segD(e, x, z);
        if (!bs || s.d < bs.d) {
          bs = s;
          be = e;
        }
      }
      const L = Math.hypot(bs.dx, bs.dz) || 1;
      return {
        edge: be,
        t: bs.t,
        dist: bs.d,
        point: { x: bs.px, z: bs.pz },
        dir: { x: bs.dx / L, z: bs.dz / L },
      };
    },
    edgesAt(id) {
      return adj.get(id) || [];
    },
  };
  const districtAt = (x, z) =>
    x > 1300
      ? 'South Beach'
      : x > 280
        ? 'Biscayne Bay'
        : z < -800
          ? x < -1500
            ? 'Allapattah'
            : 'Wynwood'
          : z > 800
            ? x < -1500
              ? 'Little Havana'
              : 'Brickell'
            : 'Downtown';
  return {
    bounds: B,
    seaLevel: -0.12,
    mapLayers: { land, water, beach, park, buildingPolys, roadEdges: edges.map((e) => e.pts) },
    roadGraph,
    districtAt,
    streetNameAt(x, z) {
      const r = roadGraph.nearestEdge(x, z);
      return r && r.dist < 30 ? r.edge.name : null;
    },
    isWater(x, z) {
      return x > 300 && !(x > 1450 && x < 2000);
    },
    roads: [],
    buildings: [],
  };
}

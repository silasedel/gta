// Street life helpers (npc-life track): walk signals at mapped traffic lights (same fixed-time plan the traffic
// uses in src/vehicles/roadnet.js), stationary crowd spots (benches, cafe tables, storefront groups, shop doors)
// and a frame-budget governor for the crowd size. Used by people.v2.js (crowd tier) and peds.js (near tier).

const SIG_CYCLE = 34;
const SIG_GREEN = 13;
const FOOT = /foot|path|cycle|steps|pedestrian|track|service_private/;
const FOOD = /restaurant|cafe|bar|pub|fast_food|ice_cream/;

/** Walk signals. A pedestrian crossing in direction (dx, dz) walks with the parallel traffic's green. */
export function createSignals(game) {
  let nodeEdges = null;
  let nodeById = null;
  function build() {
    nodeEdges = new Map();
    nodeById = new Map();
    const g = game.city?.roadGraph;
    if (!g?.nodes || !g?.edges) {
      return;
    }
    for (const n of g.nodes) {
      nodeById.set(n.id, n);
    }
    // same edge order and filter as roadnet.fromGraph + finalize, so phases match the cars
    for (const e of g.edges) {
      if (!e.pts || e.pts.length < 2 || !nodeById.has(e.a) || !nodeById.has(e.b)) {
        continue;
      }
      if (FOOT.test(e.kind || 'road')) {
        continue;
      }
      for (const id of [e.a, e.b]) {
        let arr = nodeEdges.get(id);
        if (!arr) {
          arr = [];
          nodeEdges.set(id, arr);
        }
        arr.push(e);
      }
    }
  }
  function angleAt(e, nodeId) {
    const p = e.pts;
    const atB = e.b === nodeId;
    const i0 = atB ? p.length - 1 : 0;
    const i1 = atB ? Math.max(0, p.length - 2) : Math.min(p.length - 1, 1);
    return Math.atan2(p[i1][0] - p[i0][0], p[i1][1] - p[i0][1]);
  }
  /** null: no signal here; else { walk: bool, wait: seconds until walk (approx) } */
  function walkState(nodeId, dx, dz) {
    if (!nodeEdges) {
      build();
    }
    const node = nodeById.get(nodeId);
    const edges = nodeEdges.get(nodeId);
    if (!node || !edges || edges.length < 3 || !(node.signal || node.control === 'signal')) {
      return null;
    }
    // the edge most parallel to the crossing direction carries the traffic we walk beside
    const ca = Math.atan2(dx, dz);
    let best = edges[0];
    let bs = -1;
    for (const e of edges) {
      const s = Math.abs(Math.cos(angleAt(e, nodeId) - ca));
      if (s > bs) {
        bs = s;
        best = e;
      }
    }
    let state = null;
    const gt = game.traffic;
    if (typeof gt?.signalAt === 'function') {
      state = gt.signalAt(nodeId, best.id) || null;
    }
    const ref = angleAt(edges[0], nodeId);
    const phase = Math.abs(Math.sin(angleAt(best, nodeId) - ref)) < 0.6 ? 0 : 1;
    const off = ((nodeId * 7.31) % SIG_CYCLE + SIG_CYCLE) % SIG_CYCLE;
    const k = (performance.now() / 1000 + off) % SIG_CYCLE;
    const s = phase === 0 ? k : (k + SIG_CYCLE / 2) % SIG_CYCLE;
    if (!state) {
      state = s < SIG_GREEN ? 'green' : s < SIG_GREEN + 3 ? 'yellow' : 'red';
    }
    // only start crossing with enough green left (a "walk" phase of about 9 s)
    const walk = state === 'green' && s < SIG_GREEN - 4;
    const wait = walk ? 0 : (SIG_CYCLE - s) % SIG_CYCLE;
    return { walk, wait };
  }
  return { walkState };
}

/** Stationary spots near a point for the crowd tier: bench seats, cafe chairs, storefront groups, shop doors. */
export function createSpots(game) {
  const city = game.city || {};
  const taken = new Set();
  const keyOf = (x, z) => Math.round(x * 4) + ':' + Math.round(z * 4);
  const ground = (x, z) => {
    try {
      const g = city.groundHeightAt?.(x, z);
      return Number.isFinite(g) ? g : 0;
    } catch (e) {
      return 0;
    }
  };
  const _out = [];
  function benchSeat(cx, cz, rMin, rMax) {
    const list = city.benchesNear ? city.benchesNear(cx, cz, rMax, _out) : [];
    for (let k = 0; k < 6 && list.length; k++) {
      const b = list[(Math.random() * list.length) | 0];
      const d = Math.hypot(b.pos.x - cx, b.pos.z - cz);
      if (d < rMin) {
        continue;
      }
      const side = Math.random() < 0.5 ? -0.45 : 0.45;
      const fx = Math.sin(b.heading);
      const fz = Math.cos(b.heading);
      const x = b.pos.x + fx * 0.12 + fz * side;
      const z = b.pos.z + fz * 0.12 - fx * side;
      const key = keyOf(x, z);
      if (taken.has(key)) {
        continue;
      }
      return { kind: 'bench', key, x, y: b.pos.y, z, heading: b.heading };
    }
    return null;
  }
  function front(cx, cz, rMin, rMax, food) {
    if (!city.storefrontsNear) {
      return null;
    }
    const list = city.storefrontsNear(cx, cz, rMax, []);
    for (let k = 0; k < 8 && list.length; k++) {
      const f = list[(Math.random() * list.length) | 0];
      if (food !== undefined && FOOD.test(String(f.kind)) !== food) {
        continue;
      }
      const fx = f.fx ?? f.x;
      const fz = f.fz ?? f.z;
      if (Math.hypot(fx - cx, fz - cz) < rMin) {
        continue;
      }
      return f;
    }
    return null;
  }
  /** a chair at one of the sidewalk cafe tables tilebuild.js places in front of food and drink shops */
  function cafeSeat(cx, cz, rMin, rMax) {
    const f = front(cx, cz, rMin, rMax, true);
    if (!f) {
      return null;
    }
    const fx = f.fx ?? f.x;
    const fz = f.fz ?? f.z;
    const ox = Math.sin(f.facing || 0);
    const oz = Math.cos(f.facing || 0);
    const T = [[-2.6, 2.8], [2.6, 2.8], [0, 5.2]][(Math.random() * 3) | 0];
    const tx = fx + ox * T[1] - oz * T[0];
    const tz = fz + oz * T[1] + ox * T[0];
    // tables only stand on the raised sidewalk (curb height)
    if (Math.abs(ground(tx, tz) - 0.15) > 0.05) {
      return null;
    }
    const a = Math.random() * Math.PI * 2;
    const x = tx + Math.sin(a) * 0.62;
    const z = tz + Math.cos(a) * 0.62;
    const key = keyOf(x, z);
    if (taken.has(key)) {
      return null;
    }
    return { kind: 'cafe', key, x, y: ground(x, z), z, heading: a + Math.PI, table: { x: tx, z: tz } };
  }
  /** a small group standing on the sidewalk in front of a shop (talking), facing a shared center */
  function group(cx, cz, rMin, rMax) {
    const f = front(cx, cz, rMin, rMax);
    if (!f) {
      return null;
    }
    const ox = Math.sin(f.facing || 0);
    const oz = Math.cos(f.facing || 0);
    const gx = (f.fx ?? f.x) + ox * 1.6;
    const gz = (f.fz ?? f.z) + oz * 1.6;
    const key = keyOf(gx, gz);
    if (taken.has(key)) {
      return null;
    }
    return { kind: 'group', key, x: gx, y: ground(gx, gz), z: gz, n: 2 + ((Math.random() * 3) | 0) };
  }
  /** a shop door: people walk out of it onto the sidewalk, or into it from the sidewalk */
  function door(cx, cz, rMin, rMax) {
    const f = front(cx, cz, rMin, rMax);
    if (!f) {
      return null;
    }
    const x = f.fx ?? f.x;
    const z = f.fz ?? f.z;
    return { kind: 'door', x, y: ground(x, z), z, facing: f.facing || 0 };
  }
  return {
    benchSeat,
    cafeSeat,
    group,
    door,
    take(key) {
      if (key) {
        taken.add(key);
      }
    },
    free(key) {
      if (key) {
        taken.delete(key);
      }
    },
  };
}

/**
 * Frame-budget governor: scales the crowd between 0.35 and 1 so the frame stays near 16.7 ms.
 * Shrinks fast when frames run long, grows back slowly (no oscillation, no mass pop).
 */
export function createGovernor(game) {
  let k = 1;
  let avg = 16.7;
  return {
    update(dt) {
      const ms = Number.isFinite(game.perf?.frameMs) ? game.perf.frameMs : dt * 1000;
      avg += (Math.min(ms, 60) - avg) * Math.min(1, dt * 2);
      if (avg > 18.2) {
        k = Math.max(0.35, k - dt * 0.25);
      } else if (avg < 16.9) {
        k = Math.min(1, k + dt * 0.04);
      }
      return k;
    },
    get k() {
      return k;
    },
    get avgMs() {
      return avg;
    },
  };
}

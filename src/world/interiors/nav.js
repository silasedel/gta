// Navigation grid for staff and customers: built from the interior's colliders (store-local), A* with smoothing.
// Covers the lot plus an apron in front of the storefront (queues, the walk-up window, entering and leaving).
export function buildNav(plan, colliders, o = {}) {
  const cell = o.cell || 0.2,
    pad = o.pad ?? 0.26,
    apron = o.apron ?? 5,
    x0 = plan.lot.x0 - 1.5,
    z0 = plan.lot.z0,
    x1 = plan.lot.x1 + 1.5,
    z1 = plan.lot.z1 + apron;
  const nx = Math.ceil((x1 - x0) / cell),
    nz = Math.ceil((z1 - z0) / cell),
    blocked = new Uint8Array(nx * nz);
  const mark = (ax, az, bx, bz) => {
    const i0 = Math.max(0, Math.floor((ax - x0) / cell)),
      i1 = Math.min(nx - 1, Math.floor((bx - x0) / cell)),
      j0 = Math.max(0, Math.floor((az - z0) / cell)),
      j1 = Math.min(nz - 1, Math.floor((bz - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * nx + i] = 1;
  };
  for (const c of colliders) {
    const [x, y, z, hx, hy, hz, ry] = c;
    if (y + hy < 0.2 || y - hy > 1.75) continue;
    let ex = hx,
      ez = hz;
    if (ry) {
      const cs = Math.abs(Math.cos(ry)),
        sn = Math.abs(Math.sin(ry));
      ex = hx * cs + hz * sn;
      ez = hx * sn + hz * cs;
    }
    mark(x - ex - pad, z - ez - pad, x + ex + pad, z + ez + pad);
  }
  // outside the lot only the apron in front is walkable
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * cell,
        z = z0 + (j + 0.5) * cell;
      if (z < plan.lot.z1 - 0.05 && (x < plan.lot.x0 + 0.05 || x > plan.lot.x1 - 0.05))
        blocked[j * nx + i] = 1;
    }
  const idx = (x, z) => {
    const i = Math.floor((x - x0) / cell),
      j = Math.floor((z - z0) / cell);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  const free = (x, z) => {
    const k = idx(x, z);
    return k >= 0 && !blocked[k];
  };
  const center = (k) => ({
    x: x0 + ((k % nx) + 0.5) * cell,
    z: z0 + (Math.floor(k / nx) + 0.5) * cell,
  });
  // nearest free cell to a point (spiral search up to r meters)
  function nearestFree(x, z, r = 1.2) {
    if (free(x, z)) return { x, z };
    const n = Math.ceil(r / cell);
    let best = null,
      bd = Infinity;
    const ci = Math.floor((x - x0) / cell),
      cj = Math.floor((z - z0) / cell);
    for (let dj = -n; dj <= n; dj++)
      for (let di = -n; di <= n; di++) {
        const i = ci + di,
          j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz || blocked[j * nx + i]) continue;
        const d = di * di + dj * dj;
        if (d < bd) {
          bd = d;
          best = j * nx + i;
        }
      }
    return best == null ? null : center(best);
  }
  function los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az),
      n = Math.ceil(d / (cell * 0.5));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!free(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }
  const open = new Int32Array(nx * nz),
    gS = new Float32Array(nx * nz),
    from = new Int32Array(nx * nz),
    stamp = new Uint32Array(nx * nz);
  let gen = 0;
  // A* (binary heap on f). Returns [{ x, z }, ...] from just after the start to the goal, or null.
  function path(ax, az, bx, bz) {
    const a = nearestFree(ax, az, 1.5),
      b = nearestFree(bx, bz, 1.5);
    if (!a || !b) return null;
    const s = idx(a.x, a.z),
      g = idx(b.x, b.z);
    if (s === g) return [{ x: bx, z: bz }];
    gen++;
    const heap = [s],
      f = new Map();
    const gi = g % nx,
      gj = Math.floor(g / nx),
      h = (k) => {
        const dx = Math.abs((k % nx) - gi),
          dz = Math.abs(Math.floor(k / nx) - gj);
        return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
      };
    gS[s] = 0;
    stamp[s] = gen;
    from[s] = -1;
    f.set(s, h(s));
    let found = false,
      guard = 0;
    while (heap.length && guard++ < 40000) {
      let bi = 0;
      for (let i = 1; i < heap.length; i++) if (f.get(heap[i]) < f.get(heap[bi])) bi = i;
      const cur = heap.splice(bi, 1)[0];
      if (cur === g) {
        found = true;
        break;
      }
      open[cur] = gen + 1e6;
      const ci = cur % nx,
        cj = Math.floor(cur / nx);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ci + di,
            j = cj + dj;
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const k = j * nx + i;
          if (blocked[k] || open[k] === gen + 1e6) continue;
          if (di && dj && (blocked[cj * nx + i] || blocked[j * nx + ci])) continue;
          const ng = gS[cur] + (di && dj ? 1.414 : 1);
          if (stamp[k] === gen && ng >= gS[k]) continue;
          const fresh = stamp[k] !== gen;
          gS[k] = ng;
          stamp[k] = gen;
          from[k] = cur;
          f.set(k, ng + h(k));
          if (fresh || !heap.includes(k)) heap.push(k);
        }
    }
    if (!found) return null;
    const raw = [];
    for (let k = g; k !== -1 && k !== s; k = from[k]) raw.push(center(k));
    raw.reverse();
    if (raw.length) raw[raw.length - 1] = { x: b.x, z: b.z };
    const out = [];
    let px = a.x,
      pz = a.z,
      i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      while (j > i && !los(px, pz, raw[j].x, raw[j].z)) j--;
      out.push(raw[j]);
      px = raw[j].x;
      pz = raw[j].z;
      i = j + 1;
    }
    return out;
  }
  return { cell, nx, nz, x0, z0, blocked, free, nearestFree, los, path, idx, center };
}

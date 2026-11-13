// Miami city — tile streaming with LOD + per-frame time budget.
// Units: CHUNK = CH x CH tiles. Far layer is per chunk; inside chunks closer than midR, every tile
// has a mid mesh, and tiles within nearR get the full-detail build (mid hidden once near is ready).
// Static colliders exist only for tiles within colR of any focus point (player, player car).
// All heavy work runs as generator jobs, resumed each frame until the time budget is spent.

export function createStreamer(opts) {
  const {
    tileSize = 200, chunkTiles = 4, nearR = 350, midR = 1500, colR = 250, budgetMs = 3,
    bounds, buildNear, buildMid, buildColliders, removeColliders, buildFar, dispose, origin = { x: 0, z: 0 },
  } = opts;
  const OX = origin.x, OZ = origin.z;
  const CH = chunkTiles, CS = tileSize * CH;
  const tx0 = Math.floor((bounds.minX - OX) / tileSize), tx1 = Math.floor((bounds.maxX - OX - 1e-6) / tileSize);
  const tz0 = Math.floor((bounds.minZ - OZ) / tileSize), tz1 = Math.floor((bounds.maxZ - OZ - 1e-6) / tileSize);
  const cx0 = Math.floor(tx0 / CH), cx1 = Math.floor(tx1 / CH), cz0 = Math.floor(tz0 / CH), cz1 = Math.floor(tz1 / CH);
  const tiles = new Map(), chunks = new Map();
  const key = (a, b) => a * 100003 + b;
  const tileOf = (tx, tz) => {
    const k = key(tx, tz); let t = tiles.get(k);
    if (!t) { t = { tx, tz, k, x0: OX + tx * tileSize, z0: OZ + tz * tileSize, cx: OX + (tx + 0.5) * tileSize, cz: OZ + (tz + 0.5) * tileSize, near: null, mid: null, col: null, job: null, colJob: null, d: 0 }; tiles.set(k, t); }
    return t;
  };
  for (let a = cx0; a <= cx1; a++) for (let b = cz0; b <= cz1; b++) chunks.set(key(a, b), { a, b, k: key(a, b), far: null, job: null, mid: null, midJob: null, x0: OX + a * CS, z0: OZ + b * CS, active: false });

  const jobs = []; // { gen, prio, done(result), kind, tile }
  // listeners told BEFORE a tile's static colliders are removed (so dynamic bodies there can be frozen / despawned first)
  const removingCbs = [];
  function removeTileCols(t, list) {
    if (!list || !list.length) return;
    const b = { minX: t.x0, minZ: t.z0, maxX: t.x0 + tileSize, maxZ: t.z0 + tileSize, tx: t.tx, tz: t.tz };
    for (const fn of removingCbs) { try { fn(b); } catch (e) { console.error('[miami] onTileCollidersRemoving listener', e); } }
    removeColliders(list);
  }
  const stats = { jobsRun: 0, msLast: 0, near: 0, mid: 0, far: 0, col: 0, queued: 0, maxStep: { near: 0, mid: 0, far: 0, col: 0 } };
  const distRect = (x, z, x0, z0, s) => Math.hypot(Math.max(x0 - x, 0, x - (x0 + s)), Math.max(z0 - z, 0, z - (z0 + s)));
  function enqueue(kind, owner, gen, prio, done) { const j = { kind, owner, gen, prio, done, cancelled: false }; jobs.push(j); return j; }

  let frame = 0;
  function update(focus /* [{x,z}] first = camera */) {
    frame++;
    const cam = focus[0];
    // ---- chunk level: far vs active ----
    for (const c of chunks.values()) {
      const dmin = distRect(cam.x, cam.z, c.x0, c.z0, CS);
      const wantActive = c.active ? dmin < midR + 150 : dmin < midR;
      c.prio = dmin;
      if (wantActive !== c.active) c.active = wantActive;
      if (!c.far && !c.job) c.job = enqueue('far', c, buildFar(c.a, c.b, CS), 1e6 + dmin, (res) => { c.far = res; c.job = null; });
      if (c.active && !c.mid && !c.midJob) c.midJob = enqueue('mid', c, buildMid(c.a, c.b, CS), dmin + 2000, (res) => { c.mid = res; c.midJob = null; });
      if (!c.active) { if (c.midJob) { c.midJob.cancelled = true; c.midJob = null; } if (c.mid) { dispose(c.mid); c.mid = null; } }
    }
    // ---- tile level ----
    const tr = Math.ceil((midR + CS) / tileSize);
    const ctx = Math.floor((cam.x - OX) / tileSize), ctz = Math.floor((cam.z - OZ) / tileSize);
    for (let tx = Math.max(tx0, ctx - tr); tx <= Math.min(tx1, ctx + tr); tx++) for (let tz = Math.max(tz0, ctz - tr); tz <= Math.min(tz1, ctz + tr); tz++) {
      const ch = chunks.get(key(Math.floor(tx / CH), Math.floor(tz / CH)));
      if (!ch || !ch.active) continue;
      const t = tileOf(tx, tz);
      t.d = Math.hypot(t.cx - cam.x, t.cz - cam.z);
      const wantNear = t.near ? t.d < nearR + 80 : t.d < nearR;
      if (wantNear && !t.near && !t.job) t.job = enqueue('near', t, buildNear(t), t.d, (res) => { t.near = res; t.job = null; });
      if (!wantNear && t.near && ch.mid) { dispose(t.near); t.near = null; }
    }
    for (let fi = 1; fi < focus.length; fi++) {
      const f = focus[fi], rr = Math.ceil(((f.r ?? colR) + 60) / tileSize), fx = Math.floor((f.x - OX) / tileSize), fz = Math.floor((f.z - OZ) / tileSize);
      for (let tx = Math.max(tx0, fx - rr); tx <= Math.min(tx1, fx + rr); tx++) for (let tz = Math.max(tz0, fz - rr); tz <= Math.min(tz1, fz + rr); tz++) tileOf(tx, tz);
    }
    // ---- visibility: chunk far meshes, tile mid/near ----
    for (const c of chunks.values()) { if (c.far) c.far.visible = !(c.active && c.mid); if (c.mid) c.mid.visible = c.active; }
    for (const t of tiles.values()) {
      const ch = chunks.get(key(Math.floor(t.tx / CH), Math.floor(t.tz / CH)));
      if (!ch.active) { // chunk went far: drop the near build
        if (t.job && t.job.kind === 'near') { t.job.cancelled = true; t.job = null; }
        if (t.near) { dispose(t.near); t.near = null; }
      }
      // ---- colliders: kept within each anchor's radius (focus[i].r, default colR) ----
      let excess = Infinity, dc = Infinity;
      for (const f of focus) { const d2 = distRect(f.x, f.z, t.x0, t.z0, tileSize); const e = d2 - (f.r ?? colR); if (e < excess) excess = e; if (d2 < dc) dc = d2; }
      const wantCol = t.col ? excess < 60 : excess < 0;
      if (wantCol && !t.col && !t.colJob) t.colJob = enqueue('col', t, buildColliders(t), dc - 500, (res) => { t.col = res; t.colJob = null; });
      if (!wantCol && t.col) { removeTileCols(t, t.col); t.col = null; }
      if (!wantCol && t.colJob) { t.colJob.cancelled = true; t.colJob = null; if (t._colPartial) { removeTileCols(t, t._colPartial); t._colPartial = null; } }
    }
    // ---- run jobs within the time budget ----
    const t0 = performance.now();
    if (jobs.length) {
      jobs.sort((a, b) => a.prio - b.prio);
      while (jobs.length && performance.now() - t0 < budgetMs) {
        const j = jobs[0];
        if (j.cancelled) { jobs.shift(); if (j.gen.return) { const r = j.gen.return(); if (r && r.value) dispose(r.value); } continue; }
        const ts = performance.now();
        const r = j.gen.next();
        const dt = performance.now() - ts; if (dt > stats.maxStep[j.kind]) stats.maxStep[j.kind] = dt;
        stats.jobsRun++;
        if (r.done) { jobs.shift(); if (j.cancelled) { if (r.value) { if (j.kind === 'col') removeTileCols(j.owner, r.value); else dispose(r.value); } } else j.done(r.value); }
      }
    }
    stats.msLast = performance.now() - t0; stats.queued = jobs.length;
    stats.near = 0; stats.mid = 0; stats.col = 0; stats.far = 0;
    for (const t of tiles.values()) { if (t.near) stats.near++; if (t.col) stats.col++; }
    for (const c of chunks.values()) { if (c.far && c.far.visible) stats.far++; if (c.mid) stats.mid++; }
  }
  function nearMask(arr, size, camX, camZ) {
    // fills arr (size*size) with 1 where a tile has a finished near build; returns the window origin in tile coords
    const ox = Math.floor((camX - OX) / tileSize) - (size >> 1), oz = Math.floor((camZ - OZ) / tileSize) - (size >> 1);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const t = tiles.get(key(ox + i, oz + j)); arr[j * size + i] = t && t.near ? 1 : 0; }
    return [ox, oz];
  }
  function chunkReady(c) {
    // the far mesh stays visible until every tile of the chunk has at least its mid mesh
    for (let i = 0; i < CH; i++) for (let j = 0; j < CH; j++) {
      const tx = c.a * CH + i, tz = c.b * CH + j;
      if (tx < tx0 || tx > tx1 || tz < tz0 || tz > tz1) continue;
      const t = tiles.get(key(tx, tz)); if (!t || (!t.mid && !t.near)) return false;
    }
    return true;
  }
  function pending() { return jobs.length; }
  function readyAround(x, z, r) {
    for (const t of tiles.values()) { if (distRect(x, z, t.x0, t.z0, tileSize) < Math.min(r, colR) && !t.col) return false; if (Math.hypot(t.cx - x, t.cz - z) < Math.min(r, nearR) && !t.near) return false; }
    return tiles.size > 0;
  }
  function collidersReadyAt(x, z) { const t = tiles.get(key(Math.floor((x - OX) / tileSize), Math.floor((z - OZ) / tileSize))); return !!(t && t.col); }
  function onTileCollidersRemoving(fn) { removingCbs.push(fn); return () => { const i = removingCbs.indexOf(fn); if (i >= 0) removingCbs.splice(i, 1); }; }
  return { update, stats, tiles, chunks, pending, readyAround, tileSize, nearMask, collidersReadyAt, onTileCollidersRemoving };
}

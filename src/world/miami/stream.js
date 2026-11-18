// Miami city — tile streaming with LOD + per-frame time budget.
// Units: CHUNK = CH x CH tiles. Far layer is per chunk; inside chunks closer than midR, every tile
// has a mid mesh, and tiles within nearR get the full-detail build (mid hidden once near is ready).
// Static colliders exist only for tiles within colR of any focus point (player, player car).
// All heavy work runs as generator jobs, resumed each frame until the time budget is spent.

// r2-perf streaming fix (QA-045, QA-009/010: far chunk drawn and no colliders within 70 m of the player after a teleport):
//   - readyAround(x, z, r) checks EVERY tile whose rectangle lies within r (missing tiles count as not ready), by distance
//     to the tile rectangle (not its centre), and needs the near build AND the colliders
//   - collidersReadyAt(x, z) needs the colliders of every tile within 3 m of the point
//   - near / collider job priorities are refreshed every frame from the current camera, player and look-ahead (they kept
//     the priority of the place they were queued at, so after a teleport the old area's jobs ran first), and near jobs
//     for tiles now far from all of them are cancelled (never within nearR + 160 m of the player)
//   - the mid build of a chunk under / next to the player runs ahead of other chunks' mids (its far mesh, drawn until the
//     mid exists, was what showed within 70 m)
// Verified Nov 17 (tools/v2/perf/r2-tele.mjs, 7 spots): before, readiness said yes with 19 near tiles missing within 120 m
// and 13 far chunks drawn within 70 m of the player; after, 0 and 0 (2 spots honestly not ready yet under a 100+ job
// backlog). ?streamfix=0 restores the old behavior (A/B).
const STREAM_FIX = !(typeof location !== 'undefined' && /[?&]streamfix=0\b/.test(location.search));

export function createStreamer(opts) {
  const {
    tileSize = 200, chunkTiles = 4, nearR = 350, midR = 1500, colR = 250, budgetMs = 3,
    // far LOD only within farR of the camera (the camera's far plane is 8 km); chunks past farR + 1.5 km are freed.
    // Before this, a far mesh was built and kept for every chunk of the whole 31 x 45 km world: memory grew for
    // minutes after loading (about 20 new geometries per second while standing still) until the tab crashed.
    farR = 9000,
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
    const cam = focus[0], pl = focus[1] && Number.isFinite(focus[1].x) ? focus[1] : null; // focus[1] = player
    // ---- chunk level: far vs active ----
    for (const c of chunks.values()) {
      const dmin = distRect(cam.x, cam.z, c.x0, c.z0, CS);
      // the player's surroundings stay active even while a title / cut-scene camera is far away (the first gameplay frame
      // used to start on bare ground while everything around the spawn rebuilt)
      const dP = pl ? distRect(pl.x, pl.z, c.x0, c.z0, CS) : Infinity;
      const wantActive = c.active ? (dmin < midR + 150 || dP < nearR + 230) : (dmin < midR || dP < nearR + 80);
      c.prio = dmin;
      if (wantActive !== c.active) c.active = wantActive;
      if (dmin < farR) {
        if (!c.far && !c.job) c.job = enqueue('far', c, buildFar(c.a, c.b, CS), 1e6 + dmin, (res) => { c.far = res; c.job = null; });
      } else if (dmin > farR + 1500) {
        if (c.job) { c.job.cancelled = true; c.job = null; }
        if (c.far) { dispose(c.far); c.far = null; }
      }
      const midPrio = STREAM_FIX && Math.min(dmin, dP) < nearR ? Math.min(dmin, dP) : dmin + 2000;
      if (c.active && !c.mid && !c.midJob) c.midJob = enqueue('mid', c, buildMid(c.a, c.b, CS), midPrio, (res) => { c.mid = res; c.midJob = null; });
      else if (STREAM_FIX && c.midJob && !c.midJob.cancelled) c.midJob.prio = midPrio;
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
      // look-ahead (fast player car): tiles near where the car will be in a few seconds count as near too, so full detail
      // (palms, poles, props) is built before the car gets there instead of popping in right in front of it
      const la = focus.lookAhead; let dn = la ? Math.min(t.d, Math.hypot(t.cx - la.x, t.cz - la.z) + 40) : t.d;
      if (pl) dn = Math.min(dn, Math.hypot(t.cx - pl.x, t.cz - pl.z));
      const wantNear = t.near ? dn < nearR + 80 : dn < nearR;
      if (wantNear && !t.near && !t.job) t.job = enqueue('near', t, buildNear(t), dn, (res) => { t.near = res; t.job = null; });
      else if (t.job && t.job.kind === 'near' && !t.job.cancelled) t.job.prio = dn;
      if (!wantNear && t.near && ch.mid) { dispose(t.near); t.near = null; }
    }
    if (pl) { // near builds around the player when the player is outside the camera's tile window
      const pr = Math.ceil((nearR + 80) / tileSize), ptx = Math.floor((pl.x - OX) / tileSize), ptz = Math.floor((pl.z - OZ) / tileSize);
      for (let tx = Math.max(tx0, ptx - pr); tx <= Math.min(tx1, ptx + pr); tx++) for (let tz = Math.max(tz0, ptz - pr); tz <= Math.min(tz1, ptz + pr); tz++) {
        if (Math.abs(tx - ctx) <= tr && Math.abs(tz - ctz) <= tr) continue; // handled above
        const ch = chunks.get(key(Math.floor(tx / CH), Math.floor(tz / CH)));
        if (!ch || !ch.active) continue;
        const t = tileOf(tx, tz);
        t.d = Math.hypot(t.cx - cam.x, t.cz - cam.z);
        const dn = Math.hypot(t.cx - pl.x, t.cz - pl.z);
        const wantNear = t.near ? dn < nearR + 80 : dn < nearR;
        if (wantNear && !t.near && !t.job) t.job = enqueue('near', t, buildNear(t), dn, (res) => { t.near = res; t.job = null; });
        else if (t.job && t.job.kind === 'near' && !t.job.cancelled) t.job.prio = dn;
        if (!wantNear && t.near && ch.mid) { dispose(t.near); t.near = null; }
      }
    }
    for (let fi = 1; fi < focus.length; fi++) {
      const f = focus[fi], rr = Math.ceil(((f.r ?? colR) + 60) / tileSize), fx = Math.floor((f.x - OX) / tileSize), fz = Math.floor((f.z - OZ) / tileSize);
      for (let tx = Math.max(tx0, fx - rr); tx <= Math.min(tx1, fx + rr); tx++) for (let tz = Math.max(tz0, fz - rr); tz <= Math.min(tz1, fz + rr); tz++) tileOf(tx, tz);
    }
    // ---- visibility: chunk far meshes, tile mid/near ----
    for (const c of chunks.values()) { if (c.far) c.far.visible = !(c.active && c.mid); if (c.mid) c.mid.visible = c.active; }
    // stage 1 perf: every tile ever touched stayed in the map and was tested against every focus point (camera, player,
    // car, look-ahead and one anchor per streamed car / ped) every frame, with a hypot per pair. After a few minutes of
    // driving that was thousands of tiles x ~70 anchors (several ms a frame). Now: squared distances (no sqrt), and an
    // empty tile (no near build, colliders or jobs) far outside the camera window and every anchor's reach is dropped
    // (tileOf recreates it on demand). Same decisions as before: wantCol = some anchor within r (+60 m to keep).
    const pruneM = 60 + 2 * tileSize;
    for (const t of tiles.values()) {
      const ch = chunks.get(key(Math.floor(t.tx / CH), Math.floor(t.tz / CH)));
      if (!ch.active) { // chunk went far: drop the near build
        if (t.job && t.job.kind === 'near') { t.job.cancelled = true; t.job = null; }
        if (t.near) { dispose(t.near); t.near = null; }
      }
      // ---- colliders: kept within each anchor's radius (focus[i].r, default colR) ----
      let in0 = false, in60 = false, inReach = false;
      const x1 = t.x0 + tileSize, z1 = t.z0 + tileSize;
      for (let fi = 0; fi < focus.length; fi++) {
        const f = focus[fi], r = f.r ?? colR;
        const dx = Math.max(t.x0 - f.x, 0, f.x - x1), dz = Math.max(t.z0 - f.z, 0, f.z - z1), d2 = dx * dx + dz * dz;
        if (d2 < (r + pruneM) * (r + pruneM)) { inReach = true; if (d2 < (r + 60) * (r + 60)) { in60 = true; if (d2 < r * r) { in0 = true; break; } } }
      }
      const wantCol = t.col ? in60 : in0;
      if (wantCol && !t.col && !t.colJob) {
        let dc = Infinity; for (const f of focus) { const d = distRect(f.x, f.z, t.x0, t.z0, tileSize); if (d < dc) dc = d; }
        t.colJob = enqueue('col', t, buildColliders(t), dc - 500, (res) => { t.col = res; t.colJob = null; });
      }
      if (!wantCol && t.col) { removeTileCols(t, t.col); t.col = null; }
      if (!wantCol && t.colJob) { t.colJob.cancelled = true; t.colJob = null; if (t._colPartial) { removeTileCols(t, t._colPartial); t._colPartial = null; } }
      if (!inReach && !t.near && !t.col && !t.job && !t.colJob && !t._colPartial && (Math.abs(t.tx - ctx) > tr || Math.abs(t.tz - ctz) > tr)) tiles.delete(t.k);
    }
    // ---- refresh near / collider job priorities from where the camera, player and look-ahead are NOW ----
    if (STREAM_FIX && jobs.length) {
      const la = focus.lookAhead;
      for (const j of jobs) {
        if (j.cancelled) { j.prio = -1e9; continue; } // cleared at the head of the queue right away
        const t = j.owner;
        if (j.kind === 'near') {
          let dn = Math.hypot(t.cx - cam.x, t.cz - cam.z);
          if (la) dn = Math.min(dn, Math.hypot(t.cx - la.x, t.cz - la.z) + 40);
          let dpl = Infinity; if (pl) { dpl = Math.hypot(t.cx - pl.x, t.cz - pl.z); dn = Math.min(dn, dpl); }
          j.prio = dn;
          if (dn > nearR + 160 && dpl > nearR + 160) { j.cancelled = true; j.prio = -1e9; if (t.job === j) t.job = null; }
        } else if (j.kind === 'col') {
          let dc = Infinity; for (const f of focus) { const d = distRect(f.x, f.z, t.x0, t.z0, tileSize); if (d < dc) dc = d; }
          j.prio = dc - 500;
        }
      }
    }
    // ---- run jobs within the time budget ----
    const t0 = performance.now();
    if (jobs.length) {
      jobs.sort((a, b) => a.prio - b.prio);
      const B = focus.budgetMs || budgetMs;
      runJobs(t0, B);
    }
    stats.msLast = performance.now() - t0; stats.queued = jobs.length;
    stats.near = 0; stats.mid = 0; stats.col = 0; stats.far = 0;
    for (const t of tiles.values()) { if (t.near) stats.near++; if (t.col) stats.col++; }
    for (const c of chunks.values()) { if (c.far && c.far.visible) stats.far++; if (c.mid) stats.mid++; }
  }
  function runJobs(t0, B) {
    {
      while (jobs.length && performance.now() - t0 < B) {
        const j = jobs[0];
        if (j.cancelled) { jobs.shift(); if (j.gen.return) { const r = j.gen.return(); if (r && r.value) dispose(r.value); } continue; }
        const ts = performance.now();
        const r = j.gen.next();
        const dt = performance.now() - ts; if (dt > stats.maxStep[j.kind]) stats.maxStep[j.kind] = dt;
        { const K = stats.msByKind || (stats.msByKind = {}); K[j.kind] = (K[j.kind] || 0) + dt; } // r2-perf: total job time per kind
        if (dt > 30) { const L = stats.longSteps || (stats.longSteps = {}); L[j.kind + (dt > 100 ? '>100' : '>30')] = (L[j.kind + (dt > 100 ? '>100' : '>30')] || 0) + 1; // r2-perf: step-length histogram
          if (dt > 60) { const LL = stats.longList || (stats.longList = []); LL.push([j.kind, Math.round(ts), Math.round(ts + dt), j.owner?.tx ?? j.owner?.a, j.owner?.tz ?? j.owner?.b]); if (LL.length > 80) LL.shift(); } }
        stats.jobsRun++;
        if (r.done) { const DN = stats.doneByKind || (stats.doneByKind = {}); DN[j.kind] = (DN[j.kind] || 0) + 1; jobs.shift(); if (j.cancelled) { if (r.value) { if (j.kind === 'col') removeTileCols(j.owner, r.value); else dispose(r.value); } } else j.done(r.value); }
      }
    }
  }
  // stage 1 perf: the per-frame budget (3-5 ms) left hundreds of jobs queued for half a minute after loading (mid / far
  // LOD of the surroundings: the first view showed bare ground). The same queue (same order: nearest first) now also runs in
  // the browser's idle time between frames, never past the idle deadline, so frames are not made longer. ?noidlestream
  // turns it off.
  if (typeof requestIdleCallback === 'function' && !(typeof location !== 'undefined' && /[?&]noidlestream\b/.test(location.search))) {
    const idle = (dl) => {
      try { if (jobs.length && dl.timeRemaining() > 3) { const t0 = performance.now(); runJobs(t0, Math.min(12, dl.timeRemaining() - 2)); stats.idleMs = (stats.idleMs || 0) + performance.now() - t0; } } catch (e) { /* never break */ }
      requestIdleCallback(idle, { timeout: 500 });
    };
    requestIdleCallback(idle, { timeout: 500 });
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
    if (!STREAM_FIX) {
      for (const t of tiles.values()) { if (distRect(x, z, t.x0, t.z0, tileSize) < Math.min(r, colR) && !t.col) return false; if (Math.hypot(t.cx - x, t.cz - z) < Math.min(r, nearR) && !t.near) return false; }
      return tiles.size > 0;
    }
    // every tile whose rectangle is within r: near build (within nearR) and colliders (within colR); a tile that does not
    // exist yet is not ready
    const rc = Math.min(r, colR), rn = Math.min(r, nearR), R = Math.max(rc, rn);
    const a0 = Math.max(tx0, Math.floor((x - R - OX) / tileSize)), a1 = Math.min(tx1, Math.floor((x + R - OX) / tileSize));
    const b0 = Math.max(tz0, Math.floor((z - R - OZ) / tileSize)), b1 = Math.min(tz1, Math.floor((z + R - OZ) / tileSize));
    let any = false;
    for (let tx = a0; tx <= a1; tx++) for (let tz = b0; tz <= b1; tz++) {
      const d = distRect(x, z, OX + tx * tileSize, OZ + tz * tileSize, tileSize);
      if (d >= R) continue;
      const t = tiles.get(key(tx, tz)); if (!t) return false;
      if (d < rc && !t.col) return false;
      if (d < rn && !t.near) return false;
      any = true;
    }
    return any;
  }
  function collidersReadyAt(x, z) {
    if (!STREAM_FIX) { const t = tiles.get(key(Math.floor((x - OX) / tileSize), Math.floor((z - OZ) / tileSize))); return !!(t && t.col); }
    const M = 3; // a body at a tile edge touches the neighbour's colliders too
    for (let tx = Math.floor((x - M - OX) / tileSize); tx <= Math.floor((x + M - OX) / tileSize); tx++) for (let tz = Math.floor((z - M - OZ) / tileSize); tz <= Math.floor((z + M - OZ) / tileSize); tz++) {
      if (tx < tx0 || tx > tx1 || tz < tz0 || tz > tz1) continue;
      const t = tiles.get(key(tx, tz)); if (!t || !t.col) return false;
    }
    return true;
  }
  function onTileCollidersRemoving(fn) { removingCbs.push(fn); return () => { const i = removingCbs.indexOf(fn); if (i >= 0) removingCbs.splice(i, 1); }; }
  return { update, stats, tiles, chunks, pending, readyAround, tileSize, nearMask, collidersReadyAt, onTileCollidersRemoving };
}

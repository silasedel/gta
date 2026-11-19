// Cell streamer: content is generated once per ~200 m cell the first time the player comes near,
// instantiated within loadR and torn down beyond unloadR (state persists across reloads).
export function createCellStreamer(game, opts) {
  const CELL = opts.cell || 200,
    LOAD = opts.loadR || 250,
    UNLOAD = opts.unloadR || 400,
    PER_TICK = opts.perTick || 1;
  const cells = new Map(); // key -> { cx, cz, data, loaded }
  let t = 0;
  const key = (i, j) => i + ',' + j;
  function tick(dt, force = false) {
    t -= dt;
    if (t > 0 && !force) return;
    t = opts.interval ?? 0.35;
    const p = game.player?.position;
    if (!p) return;
    const i0 = Math.floor((p.x - LOAD) / CELL),
      i1 = Math.floor((p.x + LOAD) / CELL);
    const j0 = Math.floor((p.z - LOAD) / CELL),
      j1 = Math.floor((p.z + LOAD) / CELL);
    let budget = force ? 999 : PER_TICK;
    const want = [];
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const cx = (i + 0.5) * CELL,
          cz = (j + 0.5) * CELL;
        const d = Math.hypot(cx - p.x, cz - p.z);
        if (d - CELL * 0.71 > LOAD) continue;
        want.push({ i, j, cx, cz, d });
      }
    want.sort((a, b) => a.d - b.d);
    for (const w of want) {
      if (budget <= 0) break;
      const k = key(w.i, w.j);
      let c = cells.get(k);
      if (!c) {
        c = { i: w.i, j: w.j, cx: w.cx, cz: w.cz, data: null, loaded: false };
        cells.set(k, c);
      }
      if (!c.data) {
        try {
          c.data = opts.generate(c) || {};
        } catch (e) {
          console.warn('[gameplay stream] gen', e);
          c.data = {};
        }
        budget--;
      }
      if (!c.loaded) {
        try {
          opts.load(c);
        } catch (e) {
          console.warn('[gameplay stream] load', e);
        }
        c.loaded = true;
        budget--;
      }
    }
    for (const c of cells.values()) {
      if (!c.loaded) continue;
      if (Math.hypot(c.cx - p.x, c.cz - p.z) - CELL * 0.71 > UNLOAD) {
        try {
          opts.unload(c);
        } catch (e) {
          console.warn('[gameplay stream] unload', e);
        }
        c.loaded = false;
      }
    }
  }
  return { cells, tick, CELL };
}

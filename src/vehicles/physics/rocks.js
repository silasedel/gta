// r2-physics: colliders for the drawn ground-cover rocks (countryside limestone / coral rock). Every rendered rock with
// scale >= 0.2 within 70 m of the player gets a static convex hull made from its own mesh vertices times its instance
// matrix, so a tire climbs exactly the rock you see and Nico steps on it. Streamed: added up to 24 per frame, dropped
// beyond 95 m. Source: game.vegetation.rocksNear(x, z, r, minS) (r2-veg) -> [{ x, y, z, s, m: 16 floats, pos: Float32Array }].
export function installRocks(game) {
  const { RAPIER, world } = game;
  const P = (game.physics ||= {});
  const live = new Map();
  let t = 0, queue = [];
  const keyOf = (r) => `${Math.round(r.x * 20)}:${Math.round(r.z * 20)}`;
  function hullOf(r) {
    const src = r.pos, m = r.m, n = src.length / 3;
    const step = n > 200 ? 2 : 1, out = new Float32Array(Math.ceil(n / step) * 3); let k = 0;
    for (let i = 0; i < n; i += step) { const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
      out[k++] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[k++] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[k++] = m[2] * x + m[6] * y + m[10] * z + m[14]; }
    return out.subarray(0, k);
  }
  function tick(dt) {
    const src = game.vegetation?.rocksNear || game.countryside?.rocksNear; if (!src) return;
    const pp = game.player?.position; if (!pp) return;
    if ((t -= dt) <= 0) {
      t = 1.0;
      let list = []; try { list = src(pp.x, pp.z, 70, 0.2) || []; } catch (e) { list = []; }
      const want = new Set();
      for (const r of list) { const k = keyOf(r); want.add(k); if (!live.has(k)) queue.push([k, r]); }
      for (const [k, rec] of live) if (!want.has(k) && (() => { const d = Math.hypot(rec.x - pp.x, rec.z - pp.z); return d > 95 || d < 66; })()) { try { world.removeCollider(rec.col, false); } catch (e) { /* */ } live.delete(k); }
    }
    for (let i = 0; i < 24 && queue.length; i++) {
      const [k, r] = queue.shift(); if (live.has(k)) continue;
      try {
        const d = RAPIER.ColliderDesc.convexHull(hullOf(r)); if (!d) continue;
        const col = world.createCollider(d.setFriction(0.9));
        live.set(k, { col, x: r.x, z: r.z });
      } catch (e) { /* degenerate hull */ }
    }
  }
  game.updaters?.push?.(tick);
  P.rocks = { count: () => live.size, pending: () => queue.length };
  return P.rocks;
}

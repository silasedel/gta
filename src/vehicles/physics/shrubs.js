// r2-physics: bushes are soft but real (QA: a sprint went 4.5 m straight through drawn bushes at the spawn / Keys / glades).
// Every drawn library shrub (instanced meshes whose material has userData.vegCls === 'shrub': place(), lotPlanting, nicoStreet,
// countryside) within 50 m of the player is registered as a soft zone (radius = 75 % of its drawn crown radius). city.bushAt is
// wrapped to include them, so the existing slowdown applies: the player drops to ~45 % speed inside and cannot sprint through;
// cars are dragged as in flower beds. Shrubs taller than 1.5 m also get a solid core (a capsule of 55 % of the crown radius)
// that blocks like a hedge.
export function installShrubs(game) {
  const { RAPIER, world } = game;
  const P = (game.physics ||= {});
  const T = game.THREE;
  const zones = new Map(), cores = new Map(), CELL = 8, grid = new Map();
  const geoInfo = new WeakMap();
  const m = T ? new T.Matrix4() : null, mw = T ? new T.Matrix4() : null, v = T ? new T.Vector3() : null;
  let t = 0;
  function info(g) { let i = geoInfo.get(g); if (i) return i; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox; i = { r: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2, h: b.max.y, min: b.min.y }; geoInfo.set(g, i); return i; }
  function rebuildGrid() { grid.clear(); for (const zn of zones.values()) { const k = Math.floor(zn.x / CELL) + ',' + Math.floor(zn.z / CELL); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(zn); } }
  function shrubAt(x, z, pad = 0) {
    let best = 0; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = grid.get((cx + i) + ',' + (cz + j)); if (!a) continue;
      for (const zn of a) { const d = Math.hypot(x - zn.x, z - zn.z), r = zn.r + pad; if (d < r) best = Math.max(best, 1 - d / r); } }
    return best;
  }
  function scan() {
    const pp = game.player?.position; if (!pp || !T) return;
    const want = new Set(), R2 = 50 * 50;
    game.scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.count) return; const ud = o.material?.userData; if (!ud) return;
      // library shrubs carry vegCls 'shrub'; the countryside streamer's own shrub slots only carry userData.veg (leaf / plain family):
      // taken when the plant stands on the ground and is bush-sized (0.5-4 m tall, crown >= 0.35 m), never tree crowns or grass tufts
      const lib = ud.vegCls === 'shrub', fam = ud.veg?.family;
      if (!lib && !(ud.veg && !ud.vegCls && (fam === 'leaf' || fam === 'plain'))) return;
      const gi = info(o.geometry); if (!lib && (gi.min > 0.4)) return; o.updateWorldMatrix(true, false);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); mw.multiplyMatrices(o.matrixWorld, m); v.setFromMatrixPosition(mw);
        const dx = v.x - pp.x, dz = v.z - pp.z; if (dx * dx + dz * dz > R2) continue;
        const sc = Math.hypot(mw.elements[0], mw.elements[1], mw.elements[2]), sy = Math.hypot(mw.elements[4], mw.elements[5], mw.elements[6]);
        const r = gi.r * sc, h = gi.h * sy; if (r < 0.15 || (!lib && (r < 0.35 || h < 0.5 || h > 4))) continue;
        const k = Math.round(v.x * 4) + ':' + Math.round(v.z * 4); want.add(k);
        if (!zones.has(k)) zones.set(k, { x: v.x, y: v.y, z: v.z, r: r * 0.75, h });
      }
    });
    for (const k of zones.keys()) if (!want.has(k)) { const zn = zones.get(k); if (Math.hypot(zn.x - pp.x, zn.z - pp.z) > 60 || Math.hypot(zn.x - pp.x, zn.z - pp.z) < 45) { zones.delete(k); const c = cores.get(k); if (c) { try { world.removeRigidBody(c); } catch (e) { /* */ } cores.delete(k); } } }
    // hedge cores for the big ones
    let made = 0;
    for (const [k, zn] of zones) {
      if (zn.h <= 1.5 || cores.has(k) || made > 30) continue;
      try { const rr = Math.max(0.2, zn.r / 0.75 * 0.55), hh = Math.max(0.3, zn.h * 0.45);
        const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(zn.x, zn.y + hh + rr * 0.3, zn.z)); b.userData = { tag: 'shrub-core' };
        world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(0.05, hh - rr), rr).setFriction(0.6), b); cores.set(k, b); made++; } catch (e) { /* */ }
    }
    rebuildGrid();
  }
  // wrap the city's bush test (player slowdown in main.js, car drag in vehicles.js)
  const C = game.city;
  if (C && !C.__r2Shrubs) { const orig = C.bushAt ? C.bushAt.bind(C) : null; C.bushAt = (x, z, pad = 0) => Math.max(orig ? orig(x, z, pad) : 0, shrubAt(x, z, pad)); C.__r2Shrubs = true; }
  game.updaters?.push?.(function shrubScan(dt) { if ((t -= dt) <= 0) { t = 1.0; try { scan(); } catch (e) { /* */ } } });
  P.shrubs = { count: () => zones.size, cores: () => cores.size, at: shrubAt };
  return P.shrubs;
}

(() => {
  const NH = game.nicoHouse,
    g = NH.group,
    T = game.THREE,
    inv = new T.Matrix4().copy(g.matrixWorld).invert();
  const L = (x, z) => {
    const v = new T.Vector3(x, 0, z).applyMatrix4(inv);
    return [+v.x.toFixed(1), +v.z.toFixed(1)];
  };
  const out = { spot: NH.spot, edges: [], lots: [], ground: [] };
  for (const e of game.city.roadGraph.edges) {
    let near = false;
    for (const p of e.pts) {
      const x = p.x ?? p[0],
        z = p.z ?? p[1];
      if (Math.hypot(x - NH.spot.x, z - NH.spot.z) < 160) {
        near = true;
        break;
      }
    }
    if (!near) continue;
    out.edges.push({
      id: e.id,
      name: e.name,
      kind: e.kind,
      width: e.width,
      cA: e.controlA,
      cB: e.controlB,
      a: e.a,
      b: e.b,
      pts: e.pts.map((p) => L(p.x ?? p[0], p.z ?? p[1])),
    });
  }
  for (const l of game.lots?.near?.(NH.spot.x, NH.spot.z, 160) || []) {
    const c = L(l.x, l.z);
    out.lots.push({
      id: l.id,
      src: l.source,
      c,
      w: l.w,
      d: l.d,
      hd: +(l.heading - NH.spot.heading).toFixed(2),
      style: l.style,
    });
  }
  for (let lx = -60; lx <= 60; lx += 10)
    for (let lz = -40; lz <= 70; lz += 10) {
      const v = new T.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld);
      out.ground.push([
        lx,
        lz,
        +(game.city.groundHeightAt(v.x, v.z) - g.position.y).toFixed(2),
        game.city.isWater(v.x, v.z) ? 1 : 0,
      ]);
    }
  out.gy = g.position.y;
  out.veg = !!game.vegetation?.place;
  out.vegKeys = game.vegetation ? Object.keys(game.vegetation) : null;
  out.vehicles = game.vehicles
    ? Object.keys(game.vehicles).filter((k) => typeof game.vehicles[k] === 'function')
    : null;
  out.dressing = game.dressing?.stats?.();
  return JSON.stringify(out);
})();

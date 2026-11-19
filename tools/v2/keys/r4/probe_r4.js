(() => {
  const net = game.city?.elevated?.network;
  const out = { chains: [], water: null };
  if (net)
    for (const c of net.chains) {
      let zmax = -1e9,
        wn = 0,
        ymax = 0;
      for (let i = 0; i < c.n; i++) {
        zmax = Math.max(zmax, c.z[i]);
        wn += c.water[i];
        ymax = Math.max(ymax, c.y[i]);
      }
      if (zmax < 4000) continue;
      const pc = net.piers.filter((p) => p.chain === c.id);
      out.chains.push({
        id: c.id,
        name: c.name,
        kind: c.kind,
        len: Math.round(c.length),
        water: +(wn / c.n).toFixed(2),
        ymax: +ymax.toFixed(1),
        piers: pc.length,
        cols: pc[0]?.cols.length,
        soffit: pc[0] && +(pc[0].soffit - pc[0].cols[0][2]).toFixed(1),
        hw: +c.hw[c.n >> 1].toFixed(1),
        x0: Math.round(c.x[0]),
        z0: Math.round(c.z[0]),
        x1: Math.round(c.x[c.n - 1]),
        z1: Math.round(c.z[c.n - 1]),
      });
    }
  const sc = game.scene;
  let ocean = null;
  sc.traverse((o) => {
    if (!ocean && /ocean|water|sea/i.test(o.name || '') && o.isMesh)
      ocean = { name: o.name, y: o.position.y };
  });
  out.water = ocean;
  out.seabed = [
    [-2100, 6200],
    [-2300, 6300],
    [-1700, 6400],
    [-1000, 5600],
  ].map(([x, z]) => [
    x,
    z,
    game.city.isWater?.(x, z),
    +(game.city.seabedDepthAt?.(x, z) ?? NaN).toFixed(2),
  ]);
  out.boatsKeys = Object.keys(game).filter((k) => /boat|veg|islet|sign/i.test(k));
  return JSON.stringify(out);
})();

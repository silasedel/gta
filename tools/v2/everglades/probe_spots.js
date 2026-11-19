(() => {
  const c = game.city, T = c.terrain, L = T.LAYERS.map((l) => l.key), G = c.roadGraph, out = { layers: L, cells: [] };
  const hist = {};
  for (let x = -6500; x <= 500; x += 100) for (let z = -6500; z <= 3500; z += 100) {
    const d = c.districtAt(x, z); if (!d || !/Everglades|Big Cypress/.test(d)) continue;
    const k = c.isWater(x, z) ? 'WATER' : L[T.layerAt(x, z)]; hist[d + ':' + k] = (hist[d + ':' + k] || 0) + 1;
  }
  out.hist = hist;
  // candidate camp sites: dry-ish land next to wet prairie, 40-150 m from a minor road
  const cand = [];
  for (let x = -6500; x <= 500; x += 60) for (let z = -6500; z <= 3500; z += 60) {
    const d = c.districtAt(x, z); if (!d || !/^(Everglades|Big Cypress)$/.test(d)) continue;
    if (c.isWater(x, z)) continue;
    let wet = 0, water = 0; for (let a = 0; a < 12; a++) { const ax = x + Math.cos(a * 0.5236) * 50, az = z + Math.sin(a * 0.5236) * 50; if (c.isWater(ax, az)) water++; const kk = L[T.layerAt(ax, az)]; if (kk === 'sawgrass' || kk === 'marsh') wet++; }
    const ne = G.nearestEdge ? G.nearestEdge(x, z, {}, 300) : null; const rd = ne ? ne.dist : 1e9;
    cand.push({ x, z, d, k: L[T.layerAt(x, z)], wet, water, rd: Math.round(rd), road: ne?.edge?.name || null, kind: ne?.edge?.kind || null, h: +c.groundHeightAt(x, z).toFixed(2) });
  }
  out.n = cand.length;
  out.campsWater = cand.filter((p) => p.water >= 3 && p.water <= 8 && p.rd > 25 && p.rd < 160).slice(0, 40);
  out.campsWet = cand.filter((p) => p.wet >= 8 && p.rd > 30 && p.rd < 140).sort((a, b) => a.rd - b.rd).slice(0, 40);
  out.deep = cand.filter((p) => p.wet >= 12 && p.rd > 400).slice(0, 30);
  return JSON.stringify(out);
})()

(() => {
  const NH = game.nicoHouse, sp = NH.spot, T = game.THREE, h0 = sp.streetHeading || 0, c = Math.cos(h0), s = Math.sin(h0);
  const toW = (lx, lz) => [sp.x + lx * c + lz * s, sp.z - lx * s + lz * c];
  const rows = [];
  for (let z = -90; z <= 50; z += 2) { let row = ''; for (let x = -70; x <= 60; x += 2) { const [wx, wz] = toW(x, z); let ch = '.';
      if (game.city.isWater?.(wx, wz)) ch = '~'; else { let r = null; try { r = game.city.roadGraph.nearestEdge(wx, wz, {}, 25); } catch (e) {} if (r && r.edge && Math.hypot(r.point.x - wx, r.point.z - wz) < r.edge.width / 2) ch = '#'; }
      if (x === 0 && z === 0) ch = 'O'; row += ch; } rows.push(String(z).padStart(4) + ' ' + row); }
  const gh = []; for (let z = -40; z <= 20; z += 4) { const r = []; for (let x = -40; x <= 40; x += 8) { const [wx, wz] = toW(x, z); r.push((game.city.groundHeightAt?.(wx, wz) ?? NaN).toFixed(1)); } gh.push(z + ': ' + r.join(' ')); }
  const an = {}; for (const [k, a] of Object.entries(NH.anchors)) if (a?.pos) { const p = a.pos; const dx = p.x - sp.x, dz = p.z - sp.z; an[k] = [+(dx * c - dz * s).toFixed(1), +(dx * s + dz * c).toFixed(1), +p.y.toFixed(2)]; }
  return JSON.stringify({ spot: { x: sp.x, z: sp.z, heading: sp.heading, streetHeading: h0, yaw: sp.yaw }, yardY: NH.group.position.y, sea: game.city.seaLevel, stats: NH.house.stats, anchorsStreetFrame: an, map: rows, gh }, null, 1);
})()

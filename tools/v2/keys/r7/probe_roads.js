// r7: roads within 90 m of Nico's lot, in the lot street frame S (x, z), and the player on the dock
(async () => {
  const NH = game.nicoHouse,
    sp = NH.spot,
    h = sp.streetHeading || 0,
    c = Math.cos(h),
    s = Math.sin(h),
    oz = NH.r4oz || 0,
    y0 = NH.group.position.y;
  const W = (x, z) => [sp.x + x * c + (z + oz) * s, sp.z - x * s + (z + oz) * c];
  const toS = (wx, wz) => {
    const dx = wx - sp.x,
      dz = wz - sp.z;
    return [+(dx * c - dz * s).toFixed(1), +(dx * s + dz * c - oz).toFixed(1)];
  };
  const G = game.city.roadGraph,
    E = G.edges || [],
    out = { oz, roads: [] };
  for (const e of E) {
    const P = e.pts || [];
    if (!P.some(([x, z]) => Math.hypot(x - sp.x, z - sp.z) < 110)) continue;
    out.roads.push({
      id: e.id,
      name: e.name,
      kind: e.kind,
      w: e.width,
      pts: P.map(([x, z]) => toS(x, z)),
    });
  }
  const [px, pz] = W(-3.7, P4z());
  function P4z() {
    return (NH.house.r4site?.wall ?? -21) - 3;
  }
  game.teleport(px, y0 + 2, pz, 0);
  await new Promise((r) => setTimeout(r, 2500));
  out.playerOnPlat = +(game.player.position.y - y0).toFixed(3);
  out.canal = [];
  for (const z of [-15, -8, -2]) {
    const [wx, wz] = W(17.4, z);
    out.canal.push([
      z,
      !!game.city.isWater(wx, wz),
      +(game.city.groundHeightAt(wx, wz) - y0).toFixed(2),
    ]);
  }
  out.site = NH.house.r4site;
  out.skiff = !!NH.skiff;
  out.junk = NH.house.stats.junk;
  out.failed = NH.house.stats.failed;
  return JSON.stringify(out);
})();

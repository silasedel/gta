(async () => {
  game.teleport(-1013, undefined, 4965, 0);
  await new Promise((r) => setTimeout(r, 14000));
  const c = game.city,
    sb = c.seabed,
    pos = sb.mesh.geometry.attributes.position;
  const out = {
    vis: sb.mesh.visible,
    c: sb.mesh.geometry.boundingSphere?.center?.toArray().map(Math.round),
    rows: [],
  };
  // walk from the beach out to sea in the direction away from land (try 4 headings, pick the one with water first)
  for (const [dx, dz] of [
    [-1, 0],
    [0, 1],
    [-0.7, 0.7],
    [1, 0],
    [0, -1],
  ]) {
    const row = [];
    for (let s = 0; s <= 60; s += 4) {
      const x = -1016 + dx * s,
        z = 4968 + dz * s;
      let best = 1e9,
        by = null;
      for (let i = 0; i < pos.count; i++) {
        const d = (pos.getX(i) - x) ** 2 + (pos.getZ(i) - z) ** 2;
        if (d < best) {
          best = d;
          by = pos.getY(i);
        }
      }
      row.push([
        s,
        c.isWater(x, z) ? 1 : 0,
        +by.toFixed(2),
        +(c.seabedDepthAt(x, z) ?? -1).toFixed(2),
        +c.terrain.heightAt(x, z).toFixed(2),
      ]);
    }
    out.rows.push([dx, dz, row]);
  }
  return JSON.stringify(out);
})();

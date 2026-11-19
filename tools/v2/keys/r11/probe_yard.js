// r11: what the yard-plant part placed (node tools/v2/keys/r8/shots8.mjs ... --probe tools/v2/keys/r11/probe_yard.js)
(() => {
  const NH = game.nicoHouse;
  const found = {};
  NH.group.traverse((o) => {
    if (o.isInstancedMesh && o.name.startsWith('r11_')) found[o.name] = o.count;
  });
  const stats = NH.stats || NH.house?.stats || null;
  return JSON.stringify({
    instanced: found,
    yardPlants: stats?.yardPlants ?? null,
    dropped: stats?.yardDropped ?? null,
    failed: stats?.failed ?? null,
  });
})();

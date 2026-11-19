(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  for (const [n, x, z] of [
    ['overtown', 0, -682],
    ['liberty', -528, -1232],
  ]) {
    game.teleport(x, undefined, z, 0);
    await sleep(25000);
    out[n] = __libBuildings.audit();
  }
  return out;
})();

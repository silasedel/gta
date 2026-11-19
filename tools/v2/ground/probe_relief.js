(() => {
  const D = game.miamiData,
    th = D.terrainHeightAt;
  const r = { has: !!th.relief, stats: th.reliefStats };
  if (!th.relief) return JSON.stringify({ err: 'no relief', src: String(th).slice(0, 300) });
  r.zones = {};
  for (let x = -3000; x <= 1000; x += 500)
    for (let z = 3000; z <= 6000; z += 500) {
      const k = D.zoneAt(x, z);
      (r.zones[k] = r.zones[k] || []).push([x, z]);
    }
  for (const k in r.zones) r.zones[k] = r.zones[k].slice(0, 4);
  // cost: fresh chunks far away + cached calls
  let t0 = performance.now();
  let s = 0;
  for (let i = 0; i < 40; i++) s += th(-3000 + i * 64, 2000 + (i % 5) * 64);
  r.msPer40FreshChunks = +(performance.now() - t0).toFixed(1);
  t0 = performance.now();
  for (let i = 0; i < 100000; i++) s += th(-3000 + (i % 400) * 0.37, 2000 + (i % 77) * 0.5);
  r.usPerCachedCall = +((performance.now() - t0) / 100).toFixed(3);
  t0 = performance.now();
  for (let i = 0; i < 100000; i++)
    s += game.city.groundHeightAt(-3000 + (i % 400) * 0.37, 2000 + (i % 77) * 0.5);
  r.usPerGroundHeightAt = +((performance.now() - t0) / 100).toFixed(3);
  // relief histogram around the Keys house and across a rural area
  const hist = (cx, cz, R) => {
    let mn = 9,
      mx = -9,
      n = 0,
      nz = 0;
    for (let x = cx - R; x <= cx + R; x += 4)
      for (let z = cz - R; z <= cz + R; z += 4) {
        const v = th.relief(x, z);
        mn = Math.min(mn, v);
        mx = Math.max(mx, v);
        n++;
        if (Math.abs(v) > 0.02) nz++;
      }
    return { mn: +mn.toFixed(2), mx: +mx.toFixed(2), share: +(nz / n).toFixed(2) };
  };
  r.keysHouse = hist(-873, 4825, 200);
  r.rural = hist(-2000, -3000, 300);
  r.glades = hist(-6000, 1000, 300);
  r.nicoLot = [th.relief(-873, 4825), th.relief(-880, 4835), th.relief(-860, 4810)].map(
    (v) => +v.toFixed(3),
  );
  return JSON.stringify(r);
})();

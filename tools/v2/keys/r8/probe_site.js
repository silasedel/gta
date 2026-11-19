// r8 probe (run inside the game page by shots8.mjs --probe): the lot's numbers in the house frame H (theta = pi/4 - street heading)
(() => {
  const NH = game.nicoHouse,
    sp = NH.spot,
    h = sp.streetHeading || 0,
    oz = NH.r4oz ?? 0,
    th = Math.PI / 4 - h,
    c = Math.cos(h),
    s = Math.sin(h),
    c2 = Math.cos(th),
    s2 = Math.sin(th);
  const HtoW = (x, z) => {
    const dx = x,
      dz = z + 7;
    const xs = dx * c2 + dz * s2,
      zs = -7 - dx * s2 + dz * c2;
    return [sp.x + xs * c + (zs + oz) * s, sp.z - xs * s + (zs + oz) * c];
  };
  const C = game.city,
    out = {
      spot: sp,
      oz,
      th,
      yGround: NH.group.position.y,
      sea: C.seaLevel,
      log: !!game.renderer.capabilities?.logarithmicDepthBuffer,
      center: HtoW(0, -7),
      grid: [],
    };
  for (let z = -46; z <= 34; z += 2) {
    let row = '';
    for (let x = -40; x <= 40; x += 2) {
      const [wx, wz] = HtoW(x, z);
      row += C.isWater(wx, wz) ? '~' : C.groundHeightAt(wx, wz) - out.yGround > -0.3 ? '#' : '.';
    }
    out.grid.push(z.toString().padStart(4) + ' ' + row);
  }
  const hs = [];
  for (const [x, z] of [
    [0, -7],
    [15.6, 0],
    [15.6, -10],
    [15.6, 10],
    [0, -14],
    [0, -18],
    [0, -22],
    [-20, -18],
    [20, -18],
    [-18, 24],
    [25, 5],
  ]) {
    const [wx, wz] = HtoW(x, z);
    hs.push([x, z, +C.groundHeightAt(wx, wz).toFixed(2), C.isWater(wx, wz)]);
  }
  out.heights = hs;
  let terrCast = null;
  game.scene.traverse((o) => {
    if (terrCast === null && o.isMesh && /terrain/i.test(o.name || ''))
      terrCast = { name: o.name, cast: o.castShadow, ro: o.renderOrder };
  });
  out.terrain = terrCast;
  return JSON.stringify(out, null, 1);
})();

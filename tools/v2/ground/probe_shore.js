(async () => {
  const u = game.env.ocean.uniforms,
    t0 = performance.now();
  while (u.uHasShore.value < 0.5 && performance.now() - t0 < 240000)
    await new Promise((r) => setTimeout(r, 500));
  const tex = u.tShore.value;
  if (!tex) return JSON.stringify({ err: 'no shore', ms: performance.now() - t0 });
  const d = tex.image.data;
  let sum = 0,
    zero = 0,
    h = 0;
  for (let i = 0; i < d.length; i++) {
    sum += d[i];
    if (!d[i]) zero++;
    h = (Math.imul(h, 31) + d[i]) | 0;
  }
  return JSON.stringify({
    ms: Math.round(performance.now() - t0),
    w: tex.image.width,
    h: tex.image.height,
    sum,
    landCells: zero,
    hash: h,
  });
})();

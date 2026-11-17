(() => { const L = window.__labP, d = L.d, W = L.W; const sx = W.x - d.x * 2.2, sz = W.z - d.z * 2.2, h = Math.atan2(d.x, d.z);
  game.teleport(sx, undefined, sz, h); game.cameraYaw = h + Math.PI;
  const gy = game.city.groundHeightAt(W.x, W.z) || 0; window.__cam(W.x - L.n.x * 5 - d.x * 2, gy + 2.0, W.z - L.n.z * 5 - d.z * 2, W.x, gy + 0.5, W.z);
  return JSON.stringify({ at: [+sx.toFixed(1), +sz.toFixed(1)] }); })()

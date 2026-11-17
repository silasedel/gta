(() => { // clear view of a construction site: try 16 headings x 3 distances/heights, keep the first camera whose rays to 5 points
  // of the fence are not blocked by any collider (buildings, the tower itself)
  const all = __workNear(window.__siteAt[0], window.__siteAt[1], 2500).filter((p) => p.v === 'jersey'); if (!all.length) return 'none';
  const s0 = all.sort((a, b) => Math.hypot(a.x - window.__siteAt[0], a.z - window.__siteAt[1]) - Math.hypot(b.x - window.__siteAt[0], b.z - window.__siteAt[1]))[0];
  const site = all.filter((p) => Math.hypot(p.x - s0.x, p.z - s0.z) < 90); let cx = 0, cz = 0; for (const p of site) { cx += p.x; cz += p.z; } cx /= site.length; cz /= site.length;
  const R = game.RAPIER, W = game.world, pts = [site[0], site[Math.floor(site.length / 4)], site[Math.floor(site.length / 2)], site[Math.floor(site.length * 3 / 4)], { x: cx, y: 0.5, z: cz }];
  let best = null;
  for (const [d, h] of [[38, 14], [55, 22], [70, 30]]) for (let k = 0; k < 16 && !best; k++) { const a = k / 16 * Math.PI * 2, ex = cx + Math.sin(a) * d, ez = cz + Math.cos(a) * d, ey = (game.city.groundHeightAt(ex, ez) || 0) + h;
    let clear = 0; for (const p of pts) { const dx = p.x - ex, dy = (p.y || 0.5) + 0.6 - ey, dz = p.z - ez, L = Math.hypot(dx, dy, dz); const hit = W.castRay(new R.Ray({ x: ex, y: ey, z: ez }, { x: dx / L, y: dy / L, z: dz / L }), L - 1.5, true); if (!hit) clear++; }
    if (clear >= 4) best = [ex, ey, ez]; if (best) break; }
  if (!best) return 'no clear view';
  game.cameraOverride = (dt, cam) => { cam.position.set(best[0], best[1], best[2]); cam.lookAt(cx, 1, cz); return true; };
  return JSON.stringify({ site: [+cx.toFixed(1), +cz.toFixed(1), site.length], cam: best.map((v) => +v.toFixed(1)) });
})()

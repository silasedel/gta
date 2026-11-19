(() => {
  // street-level hero view of a tower site's gate: from the road in front of it, the ROAD CLOSED barricades and jersey fence low,
  // the bare topping-out tower rising behind
  const g = __workNear(window.__siteAt[0], window.__siteAt[1], 600).filter(
    (p) =>
      p.v === 'barricade2' && Math.hypot(p.x - window.__siteAt[0], p.z - window.__siteAt[1]) < 120,
  );
  if (!g.length) return 'no gate';
  let gx = 0,
    gz = 0;
  for (const p of g) {
    gx += p.x;
    gz += p.z;
  }
  gx /= g.length;
  gz /= g.length;
  const e = game.city.roadGraph.nearestEdge(gx, gz, {}, 80);
  if (!e) return 'no road';
  let ox = e.point.x - gx,
    oz = e.point.z - gz;
  const ol = Math.hypot(ox, oz) || 1;
  ox /= ol;
  oz /= ol;
  const cx = gx + ox * (ol + 6) - e.dir.x * 5,
    cz = gz + oz * (ol + 6) - e.dir.z * 5,
    gy = game.city.groundHeightAt(cx, cz) || 0;
  game.cameraOverride = (dt, cam) => {
    cam.fov = 70;
    cam.updateProjectionMatrix();
    cam.position.set(cx, gy + 1.7, cz);
    cam.lookAt(gx, gy + 7, gz);
    return true;
  };
  return JSON.stringify({
    gate: [+gx.toFixed(1), +gz.toFixed(1), g.length],
    cam: [+cx.toFixed(1), +cz.toFixed(1)],
  });
})();

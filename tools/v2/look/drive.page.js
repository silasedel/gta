// r2-look: put the player's car on a long straight road near (x, z) and cruise at a fixed speed (throttle wrapper +
// heading-locked velocity each frame). window.__cruise(car, x, z, kmh) -> {x, z, hd, len}; window.__cruiseStop(car)
window.__cruise = (car, x0, z0, kmh, minLen = 160) => {
  const G = game.city.roadGraph; let best = null;
  for (const e of G.edges) {
    if (!e.pts || e.pts.length < 2) continue;
    for (let i = 1; i < e.pts.length; i++) {
      const p = e.pts[i - 1], q = e.pts[i]; const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L < minLen) continue; const d = Math.hypot(p[0] - x0, p[1] - z0);
      const sc = d - L * 0.5; if (!best || sc < best.sc) best = { sc, p, q, L, y: e.y?.[i - 1] ?? 0, kind: e.kind };
    }
  }
  if (!best) return null;
  const { p, q } = best; const dx = (q[0] - p[0]) / best.L, dz = (q[1] - p[1]) / best.L, hd = Math.atan2(dx, dz);
  const sx = p[0] + dx * 10 - dz * 1.8, sz = p[1] + dz * 10 + dx * 1.8; // right lane
  const gy = game.city.groundHeightAt(sx, sz, (best.y || 0) + 2);
  const b = car.body, v = kmh / 3.6, qq = new game.THREE.Quaternion().setFromAxisAngle(new game.THREE.Vector3(0, 1, 0), hd);
  b.setTranslation({ x: sx, y: gy + (car.groundOff || 0.5) + 0.2, z: sz }, true); b.setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }, true);
  b.setLinvel({ x: dx * v, y: 0, z: dz * v }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  car.__origSet = car.__origSet || car.setControls.bind(car);
  car.setControls = (c) => car.__origSet({ ...c, throttle: 0.6, steer: 0, brake: 0, handbrake: false });
  window.__cruiseOn = true;
  const hold = () => { if (!window.__cruiseOn) return; const lv = b.linvel(); b.setLinvel({ x: dx * v, y: lv.y, z: dz * v }, true); requestAnimationFrame(hold); };
  requestAnimationFrame(hold);
  return { x: sx, z: sz, hd, len: best.L, kind: best.kind };
};
window.__cruiseStop = (car) => { window.__cruiseOn = false; if (car?.__origSet) car.setControls = car.__origSet; };

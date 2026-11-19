(() => {
  if (!window.__noCrime) {
    const e0 = game.emit;
    game.emit = (n, d) => (n === 'crime' || n === 'witness' ? 0 : e0.call(game, n, d));
    window.__noCrime = 1;
  }
  const p = game.player.position;
  const L = game.regSigns
    .list(p.x, p.z, 150)
    .filter((s) => s.kind === 'stop')
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  const s = L[0];
  if (!s) return 'no stop sign';
  const e = game.city.roadGraph.nearestEdge(s.x, s.z, {}, 40);
  const d = e.dir;
  let ox = s.x - e.point.x,
    oz = s.z - e.point.z;
  const ol = Math.hypot(ox, oz) || 1;
  ox /= ol;
  oz /= ol;
  const S = {
      x: e.point.x - d.x * 18 + ox * Math.max(0, ol - 1.6),
      z: e.point.z - d.z * 18 + oz * Math.max(0, ol - 1.6),
    },
    gy = (q) => game.city.groundHeightAt(q.x, q.z) || 0;
  const v = game.vehicles.spawn(
    'sedan',
    new game.THREE.Vector3(S.x, gy(S) + 0.5, S.z),
    Math.atan2(s.x - S.x, s.z - S.z),
    { snap: false },
  );
  window.__car = v;
  window.__rec = { px: s.x, pz: s.z };
  const C = { x: e.point.x - ox * 7 + d.x * 7, z: e.point.z - oz * 7 + d.z * 7 };
  window.__cam(C.x, gy(C) + 2.5, C.z, s.x, s.y + 1.4, s.z);
  return JSON.stringify({
    s: [+s.x.toFixed(1), +s.z.toFixed(1)],
    ol: +ol.toFixed(1),
    dyn: game.dynProps.stats,
  });
})();

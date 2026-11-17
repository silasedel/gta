(() => {
  const D = game.dynProps; if (!D) return 'no dynProps';
  const px = window.__pushAt[0], pz = window.__pushAt[1], k = window.__pushK || 0;
  const recs = D.near(px, pz, 150).filter((r) => r.cls === 'push' && r.kind === 'bin');
  if (!recs.length) return 'no carts near';
  recs.sort((a, b) => Math.hypot(a.px - px, a.pz - pz) - Math.hypot(b.px - px, b.pz - pz));
  const r = recs[Math.min(k, recs.length - 1)]; window.__rec = r;
  const e = game.city.roadGraph.nearestEdge(r.px, r.pz, {}, 40); if (!e) return 'no road';
  const dx = e.dir.x, dz = e.dir.z; let ox = r.px - e.point.x, oz = r.pz - e.point.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
  const sx = e.point.x - dx * 16 + ox * 1.2, sz = e.point.z - dz * 16 + oz * 1.2, h = Math.atan2(r.px - sx, r.pz - sz);
  const gy = game.city.groundHeightAt(sx, sz) || 0;
  const v = game.vehicles.spawn('sedan', new game.THREE.Vector3(sx, gy + 0.5, sz), h, { snap: false }); window.__car = v;
  const cx = e.point.x - ox * 7 + dx * 4, cz = e.point.z - oz * 7 + dz * 4;
  window.__cam(cx, (game.city.groundHeightAt(cx, cz) || 0) + 2.4, cz, r.px - dx * 1.5, r.py + 0.5, r.pz - dz * 1.5);
  return JSON.stringify({ rec: [r.kind, +r.px.toFixed(2), +r.pz.toFixed(2)], road: [e.edge.name, +ol.toFixed(1)], car: !!v, start: [+sx.toFixed(1), +sz.toFixed(1)] });
})()

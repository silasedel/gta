(() => {
  const D = game.dynProps; const px = window.__pushAt[0], pz = window.__pushAt[1];
  const recs = D.near(px, pz, 150).filter((r) => r.cls === 'push' && r.kind === 'bin' && r !== window.__rec);
  recs.sort((a, b) => Math.hypot(a.px - px, a.pz - pz) - Math.hypot(b.px - px, b.pz - pz));
  const r = recs[window.__walkK || 0]; window.__wrec = r; if (!r) return 'none';
  const e = game.city.roadGraph.nearestEdge(r.px, r.pz, {}, 40); let ox = r.px - e.point.x, oz = r.pz - e.point.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
  const sx = r.px - ox * 2.4, sz = r.pz - oz * 2.4, h = Math.atan2(ox, oz);
  game.teleport(sx, undefined, sz, h); game.cameraYaw = h + Math.PI; game.cameraPitch = 0.25;
  const cx = r.px - ox * 3 + e.dir.x * 4.5, cz = r.pz - oz * 3 + e.dir.z * 4.5; window.__cam(cx, r.py + 2.2, cz, r.px - ox * 0.8, r.py + 0.6, r.pz - oz * 0.8);
  return JSON.stringify({ wrec: [+r.px.toFixed(2), +r.pz.toFixed(2)], h: +h.toFixed(2) });
})()

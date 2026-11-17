(() => { if (!window.__noCrime) { const e0 = game.emit; game.emit = (n, d) => (n === 'crime' || n === 'witness' ? 0 : e0.call(game, n, d)); window.__noCrime = 1; }
  const [x, z] = window.__hyAt; const h = __findKind('hydrant', x, z, 400)[0]; if (!h) return 'no hydrant';
  const e = game.city.roadGraph.nearestEdge(h.x, h.z, {}, 40); const d = e.dir; let ox = h.x - e.point.x, oz = h.z - e.point.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
  const S = { x: e.point.x - d.x * 18 + ox * (ol - 1.2), z: e.point.z - d.z * 18 + oz * (ol - 1.2) }, gy = (p) => game.city.groundHeightAt(p.x, p.z) || 0;
  const v = game.vehicles.spawn('sedan', new game.THREE.Vector3(S.x, gy(S) + 0.5, S.z), Math.atan2(h.x - S.x, h.z - S.z), { snap: false }); window.__car = v; window.__rec = { px: h.x, pz: h.z };
  const C = { x: e.point.x - ox * 6 + d.x * 6, z: e.point.z - oz * 6 + d.z * 6 }; window.__cam(C.x, gy(C) + 2.5, C.z, h.x, h.y + 1.5, h.z);
  return JSON.stringify({ h, car: !!v }); })()

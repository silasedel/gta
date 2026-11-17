(() => {
  // physics lab on a quiet lane: test carts on the road, a car driven into them, the player walking into another pair
  if (!window.__noCrime) { const e0 = game.emit; game.emit = (n, d) => (n === 'crime' || n === 'witness' ? 0 : e0.call(game, n, d)); window.__noCrime = 1; }
  const [x, z] = window.__lab || [-805, 4766];
  const e = game.city.roadGraph.nearestEdge(x, z, {}, 80); const d = e.dir, n = { x: d.z, z: -d.x };
  const P = e.point, gy = (q) => game.city.groundHeightAt(q.x, q.z) || 0;
  const A = { x: P.x + n.x * 0.6, z: P.z + n.z * 0.6 }, W = { x: P.x + d.x * 22 + n.x * 0.6, z: P.z + d.z * 22 + n.z * 0.6 };
  game.lotProps.add('lab:a', [{ kind: 'carts', x: A.x, y: gy(A), z: A.z, ry: Math.atan2(n.x, n.z), seed: 11 }]);
  game.lotProps.add('lab:w', [{ kind: 'carts', x: W.x, y: gy(W), z: W.z, ry: Math.atan2(-d.x, -d.z), seed: 23 }]);
  window.__labP = { P, d, n, A, W };
  const S = { x: P.x - d.x * 18 + n.x * 0.3, z: P.z - d.z * 18 + n.z * 0.3 };
  const v = game.vehicles.spawn('sedan', new game.THREE.Vector3(S.x, gy(S) + 0.5, S.z), Math.atan2(d.x, d.z), { snap: false }); window.__car = v;
  window.__rec = { px: A.x, pz: A.z };
  const C = { x: P.x - n.x * 7 + d.x * 3, z: P.z - n.z * 7 + d.z * 3 }; window.__cam(C.x, gy(C) + 2.2, C.z, A.x + d.x * 2, gy(A) + 0.5, A.z + d.z * 2);
  game.teleport(P.x + d.x * 60, undefined, P.z + d.z * 60, 0);
  return JSON.stringify({ road: e.edge.name, P: [+P.x.toFixed(1), +P.z.toFixed(1)], car: !!v, lot: game.lotProps.stats });
})()

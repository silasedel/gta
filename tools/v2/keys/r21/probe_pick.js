// Pick probe: what is under given pixels of the F camera, and how far the street is from the canal's end (H frame)
(() => {
  const NH = game.nicoHouse, T = game.THREE, C = NH.center, gy = NH.group.position.y;
  const s = { eye: [10.32, 4.6, -6.79], hdg: 75, pitch: -30, fov: 70 };
  const cam = new T.PerspectiveCamera(s.fov, 1600 / 900, 0.1, 2000);
  cam.position.set(C.x + s.eye[0], gy + s.eye[1], C.z + s.eye[2]);
  const h = (s.hdg * Math.PI) / 180, p = (s.pitch * Math.PI) / 180;
  cam.lookAt(cam.position.clone().add(new T.Vector3(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p))));
  cam.updateMatrixWorld(true);
  const rc = new T.Raycaster();
  const chain = (o) => { const a = []; for (let q = o; q && a.length < 7; q = q.parent) a.push((q.name || q.type) + (q.isInstancedMesh ? '[I]' : '')); return a.join(' < '); };
  const out = { picks: {}, road: [] };
  for (const [k, px, py] of [['slab', 250, 520], ['slab2', 300, 500], ['van', 1090, 180], ['van2', 1120, 200], ['grey', 1300, 280]]) {
    rc.setFromCamera(new T.Vector2((px / 1600) * 2 - 1, -(py / 900) * 2 + 1), cam);
    const hs = rc.intersectObjects(game.scene.children, true).filter((x) => x.object.visible !== false).slice(0, 3);
    out.picks[k] = hs.map((x) => ({ d: +x.distance.toFixed(1), o: chain(x.object), m: x.object.material?.name, inst: x.instanceId, p: [+(x.point.x - C.x).toFixed(1), +(x.point.y - gy).toFixed(2), +(x.point.z - C.z).toFixed(1)] }));
  }
  let fg = null;
  NH.group.traverse((o) => { if (o.name === 'r4_ext_site_h') fg = o; });
  for (const z of [16, 20, 24, 28, 32]) for (const x of [12.6, 18.6, 26.6]) {
    const w = new T.Vector3(x, 0, z).applyMatrix4(fg.matrixWorld);
    const r = game.city.roadGraph?.nearestEdge?.(w.x, w.z, {}, 60);
    out.road.push([x, z, r ? +(Math.hypot(r.point.x - w.x, r.point.z - w.z) - r.edge.width / 2).toFixed(1) : null, !!game.city.isWater(w.x, w.z)]);
  }
  out.vehicles = [];
  for (const v of game.vehicles?.list || game.traffic?.cars || []) {
    const q = v.mesh?.position || v.group?.position || v.position;
    if (q && Math.hypot(q.x - C.x, q.z - C.z) < 60) out.vehicles.push([v.name || v.model || v.kind || v.id, +(q.x - C.x).toFixed(1), +(q.y - gy).toFixed(2), +(q.z - C.z).toFixed(1), v.parked, v.spawnTag || v.owner]);
  }
  return JSON.stringify(out, null, 1);
})()

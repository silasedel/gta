(() => {
  const NH = game.nicoHouse, T = game.THREE, C = NH.center;
  const rel = (p) => p && [+(p.x - C.x).toFixed(2), +(p.y - NH.group.position.y).toFixed(2), +(p.z - C.z).toFixed(2)];
  const out = { anchors: {} };
  for (const k of ['hoop', 'hoopRim', 'spawnYard', 'carport']) out.anchors[k] = NH.anchors[k] && rel(NH.anchors[k].pos);
  const tags = {};
  for (const c of NH.house.colliders) tags[c.shape + ':' + c.tag] = (tags[c.shape + ':' + c.tag] || 0) + 1;
  out.tags = tags;
  let tris = 0, meshes = 0;
  NH.group.traverse((o) => { if (o.isMesh && o.geometry) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
  out.tris = tris; out.meshes = meshes;
  const rc = new T.Raycaster(new T.Vector3(C.x, 2, C.z + 20), new T.Vector3(0, 0, -1), 0, 60);
  const t0 = performance.now(); const h = rc.intersectObject(NH.group, true); out.rayMs = performance.now() - t0; out.rayHit = h[0] && h[0].distance;
  let fd = null; NH.group.traverse((o) => { if (o.name === 'r8_frontdoor') fd = o; });
  out.frontdoor = !!fd;
  out.carsNear = (game.vehicles?.list || game.traffic?.cars || []).length;
  return JSON.stringify(out);
})()

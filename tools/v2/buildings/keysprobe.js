(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = game.THREE,
    NH = game.nicoHouse;
  const E = NH.toWorld(new T.Vector3(-30, 40, 75)),
    Lk = NH.toWorld(new T.Vector3(-5, 0, 8));
  game.player && game.teleport(E.x, undefined, E.z, 0);
  game.cameraOverride = (dt, cam) => {
    cam.position.copy(E);
    cam.fov = 55;
    cam.updateProjectionMatrix();
    cam.lookAt(Lk);
    return true;
  };
  await sleep(20000);
  const cam = game.camera,
    rc = new T.Raycaster(),
    hits = {},
    lib = {};
  for (let i = 0; i < 48; i++)
    for (let j = 0; j < 14; j++) {
      rc.setFromCamera(new T.Vector2(-1 + (i + 0.5) / 24, 1 - ((j + 0.5) / 14) * 0.9), cam);
      const h = rc
        .intersectObjects(game.scene.children, true)
        .find(
          (x) =>
            x.object.visible &&
            x.distance > 120 &&
            !/sky|water|ocean|land|terrain|ground/i.test(x.object.name || ''),
        );
      if (!h) continue;
      let o = h.object,
        path = [];
      while (o && o !== game.scene && path.length < 3) {
        path.push(o.name || o.type);
        o = o.parent;
      }
      const k = path.join(' < ');
      hits[k] = (hits[k] || 0) + 1;
      if (/^lib-/.test(h.object.name)) lib[h.object.name] = (lib[h.object.name] || 0) + 1;
    }
  return {
    cam: [E.x, E.y, E.z],
    libraryHits: lib,
    farHits: Object.fromEntries(
      Object.entries(hits)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25),
    ),
  };
})();

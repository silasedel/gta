(async () => {
  const T = game.THREE,
    R = game.RAPIER || window.RAPIER,
    c = game.city,
    D = game.miamiData,
    SEA = c.seaLevel ?? -0.12;
  const out = { places: [] };
  // places: Keys shore by Nico's + a Biscayne Bay shore inside real Miami (first real-Miami water cell next to land, searched from the origin)
  let bis = null;
  for (let r = 300; r < 9000 && !bis; r += 300)
    for (let k = 0; k < 24 && !bis; k++) {
      const x = Math.cos((k / 24) * 6.283) * r,
        z = Math.sin((k / 24) * 6.283) * r;
      if (D.inRealMiami(x, z) && c.isWater(x, z) && !c.isWater(x + 30, z)) bis = [x, z];
    }
  const places = [
    ['keys', -1016, 4968],
    ['keys2', -958, 4858],
  ];
  if (bis) places.push(['biscayne', bis[0], bis[1]]);
  const rc = new T.Raycaster();
  rc.far = 30;
  for (const [nm, px, pz] of places) {
    game.teleport(px + 5, undefined, pz + 5, 0);
    await new Promise((r) => setTimeout(r, 16000));
    const vis = [];
    game.scene.traverse((o) => {
      if (
        o.isMesh &&
        !o.isInstancedMesh &&
        o.visible &&
        (o.name === 'seabed' ||
          /^terrain/.test((Array.isArray(o.material) ? o.material[0] : o.material)?.name || ''))
      )
        vis.push(o);
    });
    const res = {
      name: nm,
      at: [Math.round(px), Math.round(pz)],
      tested: 0,
      missing: 0,
      off: 0,
      worst: [],
      seabed: !!c.seabed?.mesh?.visible,
    };
    let tries = 0;
    while (res.tested < 100 && tries < 3000) {
      tries++;
      const a = Math.random() * 6.283,
        d = Math.sqrt(Math.random()) * 100,
        x = px + Math.cos(a) * d,
        z = pz + Math.sin(a) * d;
      if (!c.isWater(x, z)) continue;
      rc.set(new T.Vector3(x, 10, z), new T.Vector3(0, -1, 0));
      const h = rc.intersectObjects(vis, false)[0];
      if (!h) continue;
      const vy = h.point.y,
        depth = SEA - vy;
      if (depth < 0.1 || depth > 1.5) continue;
      res.tested++;
      let py = null;
      try {
        const hit = game.world.castRay(new R.Ray({ x, y: 10, z }, { x: 0, y: -1, z: 0 }), 30, true);
        if (hit) py = 10 - (hit.timeOfImpact ?? hit.toi);
      } catch (e) {}
      if (py === null || py < vy - 1.0) {
        res.missing++;
        if (res.worst.length < 6)
          res.worst.push([
            'missing',
            +x.toFixed(1),
            +z.toFixed(1),
            +vy.toFixed(2),
            py === null ? null : +py.toFixed(2),
          ]);
      } else if (Math.abs(py - vy) > 0.05) {
        res.off++;
        if (res.worst.length < 6)
          res.worst.push(['off', +x.toFixed(1), +z.toFixed(1), +vy.toFixed(2), +py.toFixed(2)]);
      }
    }
    out.places.push(res);
  }
  return JSON.stringify(out);
})();

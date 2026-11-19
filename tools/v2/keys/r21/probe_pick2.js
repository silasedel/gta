// Pick probe in a site-frame camera (spot CANAL): what is under given pixels
(() => {
  const NH = game.nicoHouse, T = game.THREE, gy = NH.group.position.y;
  let fg = null;
  NH.group.traverse((o) => { if (o.name === 'r4_ext_site_h') fg = o; });
  fg.updateMatrixWorld(true);
  const inv = fg.matrixWorld.clone().invert();
  const cam = new T.PerspectiveCamera(62, 1600 / 900, 0.1, 2000);
  cam.position.copy(new T.Vector3(13.4, 2.4, -8.0).applyMatrix4(fg.matrixWorld));
  cam.lookAt(new T.Vector3(20.0, -1.2, 4.0).applyMatrix4(fg.matrixWorld));
  cam.updateMatrixWorld(true);
  const rc = new T.Raycaster();
  const chain = (o) => { const a = []; for (let q = o; q && a.length < 6; q = q.parent) a.push(q.name || q.type); return a.join(' < '); };
  const out = {};
  for (const [k, px, py] of [['g1', 1000, 336], ['g2', 900, 330], ['g3', 1150, 345]]) {
    rc.setFromCamera(new T.Vector2((px / 1600) * 2 - 1, -(py / 900) * 2 + 1), cam);
    out[k] = rc.intersectObjects(game.scene.children, true).filter((x) => x.object.visible !== false).slice(0, 4).map((x) => {
      const h = x.point.clone().applyMatrix4(inv);
      return { o: chain(x.object), m: x.object.material?.name, h: [+h.x.toFixed(1), +h.y.toFixed(2), +h.z.toFixed(1)] };
    });
  }
  return JSON.stringify(out, null, 1);
})()

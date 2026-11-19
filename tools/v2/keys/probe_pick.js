// which meshes cover given house-local points near the ground (stray-polygon hunt): name path, material, bbox size
(() => {
  const NH = game.nicoHouse,
    T = game.THREE,
    PTS = window.__pickPts || [
      [-11.6, -22.9],
      [-3.5, -20.8],
      [13.3, -29.5],
      [16.0, -11.8],
      [-8, -24],
      [-16, -21],
    ];
  const W = PTS.map(([x, z]) => {
      const v = NH.toWorld(new T.Vector3(x, 0, z));
      return [x, z, v];
    }),
    res = {},
    bb = new T.Box3(),
    m = new T.Matrix4();
  game.scene.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || !o.geometry) return;
    let p = o,
      vis = true;
    while (p) {
      if (!p.visible) {
        vis = false;
        break;
      }
      p = p.parent;
    }
    if (!vis) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    o.updateWorldMatrix(true, false);
    const test = (mw, tag) => {
      bb.copy(g.boundingBox).applyMatrix4(mw);
      const sz = bb.getSize(new T.Vector3());
      if (Math.max(sz.x, sz.z) > 120) return;
      for (const [x, z, v] of W)
        if (
          v.x > bb.min.x &&
          v.x < bb.max.x &&
          v.z > bb.min.z &&
          v.z < bb.max.z &&
          bb.min.y < v.y + 1.5 &&
          bb.max.y > v.y - 1.5
        ) {
          let path = o.name || '?';
          let q = o.parent;
          for (let i = 0; i < 4 && q; i++, q = q.parent) path = (q.name || '?') + '/' + path;
          const k = `${x},${z}`;
          (res[k] ||= []).push(
            `${path}${tag} | ${o.material?.name || o.material?.type} | size ${sz.x.toFixed(1)}x${sz.y.toFixed(2)}x${sz.z.toFixed(1)} y ${bb.min.y.toFixed(2)}`,
          );
        }
    };
    if (o.isInstancedMesh) {
      for (let i = 0; i < Math.min(o.count, 3000); i++) {
        o.getMatrixAt(i, m);
        m.premultiply(o.matrixWorld);
        test(m, '#' + i);
      }
    } else test(o.matrixWorld, '');
  });
  for (const k in res) res[k] = [...new Set(res[k])].slice(0, 25);
  return JSON.stringify(res, null, 1);
})();

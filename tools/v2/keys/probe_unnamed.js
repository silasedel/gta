(() => {
  const T = game.THREE,
    c = new T.Vector3(-846.2, 0, 4802.3),
    M = new T.Matrix4(),
    P = new T.Vector3(),
    out = [];
  game.scene.traverse((o) => {
    if (!o.isInstancedMesh || o.name) return;
    let n = 0;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, M);
      M.premultiply(o.matrixWorld);
      P.setFromMatrixPosition(M);
      if (Math.hypot(P.x - c.x, P.z - c.z) < 6) n++;
    }
    if (!n) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    let path = [];
    let q = o;
    for (let k = 0; k < 6 && q; k++, q = q.parent) path.push(q.type + ':' + (q.name || ''));
    out.push({
      n,
      count: o.count,
      verts: o.geometry.attributes.position.count,
      attrs: Object.keys(o.geometry.attributes),
      mat: {
        type: m.type,
        name: m.name,
        map: m.map?.name || m.map?.image?.src?.slice(-40) || null,
        color: m.color?.getHexString(),
        alphaTest: m.alphaTest,
        side: m.side,
        ud: Object.keys(m.userData || {}),
      },
      path,
      ud: Object.keys(o.userData || {}),
      geomName: o.geometry.name,
    });
  });
  return JSON.stringify(out, null, 1);
})();

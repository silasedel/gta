(async () => {
  const T = game.THREE,
    R = game.RAPIER || window.RAPIER;
  game.teleport(-866, undefined, 4855, 0);
  await new Promise((r) => setTimeout(r, 16000));
  const ST = R.ShapeType || {};
  const groundC = (c) => {
    try {
      const t = c.shapeType();
      if (t === ST.TriMesh || t === ST.HeightField) return true;
      if (t === ST.Cuboid) {
        const he = c.halfExtents();
        return he.x > 4 && he.z > 4;
      }
    } catch (e) {}
    return false;
  };
  const ray = (x, y, z) => {
    try {
      const h = game.world.castRay(
        new R.Ray({ x, y: y + 4, z }, { x: 0, y: -1, z: 0 }),
        12,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        groundC,
      );
      return h ? y + 4 - (h.timeOfImpact ?? h.toi) : null;
    } catch (e) {
      return null;
    }
  };
  const M = new T.Matrix4(),
    P = new T.Vector3(),
    out = [];
  game.scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count || o.name || o.parent?.name) return;
    let vis = true;
    for (let q = o; q; q = q.parent) if (q.visible === false) vis = false;
    let fl = 0,
      n = 0,
      ex = [];
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, M);
      P.setFromMatrixPosition(M).applyMatrix4(o.matrixWorld);
      const d0 = Math.min(
        Math.hypot(P.x + 876, P.z - 4864),
        Math.hypot(P.x + 855, P.z - 4848),
        Math.hypot(P.x + 930, P.z - 4965),
      );
      if (d0 > 30) continue;
      n++;
      const hy = ray(P.x, P.y, P.z);
      if (hy !== null && P.y - hy > 0.25) {
        fl++;
        if (ex.length < 3)
          ex.push([+P.x.toFixed(1), +P.y.toFixed(2), +P.z.toFixed(1), +hy.toFixed(2)]);
      }
    }
    if (!n) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const chain = [];
    for (let q = o.parent; q && chain.length < 8; q = q.parent)
      chain.push(
        (q.name || q.type) +
          (q.userData && Object.keys(q.userData).length
            ? '{' + Object.keys(q.userData).slice(0, 3).join(',') + '}'
            : ''),
      );
    out.push({
      vis,
      mat: m && m.name,
      mtype: m && m.type,
      map: m && m.map && (m.map.name || m.map.source?.data?.src || '').toString().slice(-60),
      count: o.count,
      n,
      fl,
      bbMin: bb.min.toArray().map((v) => +v.toFixed(2)),
      bbMax: bb.max.toArray().map((v) => +v.toFixed(2)),
      attrs: Object.keys(o.geometry.attributes),
      chain,
      ex,
    });
  });
  return JSON.stringify(out);
})();

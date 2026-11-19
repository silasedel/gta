(() => {
  const NH = game.nicoHouse,
    T = game.THREE,
    out = { sections: [] };
  NH.group.traverse((o) => {
    if (o.isInstancedMesh && /keysDock/.test(o.name)) {
      const m = new T.Matrix4(),
        p = new T.Vector3();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        out.sections.push([o.name.slice(0, 40), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
      }
    }
  });
  out.ground = [];
  for (let z = -8; z >= -40; z -= 2) {
    const w = NH.toWorld(new T.Vector3(1.8, 0, z));
    out.ground.push([
      z,
      +(game.city.groundHeightAt(w.x, w.z) - NH.group.position.y).toFixed(2),
      game.city.isWater(w.x, w.z) ? 1 : 0,
    ]);
  }
  return JSON.stringify(out);
})();

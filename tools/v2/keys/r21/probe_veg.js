// Vegetation probe: every mesh / instance whose base lies over water beyond Nico's bay wall or in the canal (site frame H)
(() => {
  const NH = game.nicoHouse, T = game.THREE, P = game.nicoHouse_canal;
  let fg = null;
  NH.group.traverse((o) => { if (o.name === 'r4_ext_site_h') fg = o; });
  fg.updateMatrixWorld(true);
  const inv = fg.matrixWorld.clone().invert();
  const out = [];
  const m4 = new T.Matrix4(), v = new T.Vector3();
  const test = (o, wp, k) => {
    const h = wp.clone().applyMatrix4(inv);
    const wet = (h.z < -16.6 && h.x > -40 && h.x < 50 && h.z > -45) || (P && P.inside(wp.x, wp.z));
    if (wet && Math.abs(h.y) < 3) out.push({ o: (o.name || '?') + ' < ' + (o.parent?.name || '?'), m: o.material?.name || (Array.isArray(o.material) ? o.material[0]?.name : ''), k, h: [+h.x.toFixed(1), +h.y.toFixed(2), +h.z.toFixed(1)] });
  };
  game.scene.traverse((o) => {
    if (!o.visible) return;
    const nm = (o.name || '') + ' ' + (o.parent?.name || '') + ' ' + (o.material?.name || '');
    if (!/veg|plant|banana|palm|leaf|leaves|bush|shrub|grass|ear|tree|frond|alocasia|monstera|tuft|weed/i.test(nm)) return;
    if (/r8water|terrain|seabed/i.test(nm)) return;
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); test(o, v, i); }
    } else if (o.isMesh) { o.getWorldPosition(v); test(o, v, -1); }
  });
  return JSON.stringify(out.slice(0, 60), null, 0);
})()

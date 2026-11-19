(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  game.cameraOverride = (dt, cam) => {
    cam.position.set(395, 1.8, -60);
    cam.lookAt(395, 8, -200);
    return true;
  };
  await sleep(15000);
  const L = globalThis.__libBuildings,
    out = { stats: L.stats(), byModel: {} };
  let tris = 0;
  L.group.traverse((o) => {
    if (!o.isInstancedMesh || !o.visible || !o.count) return;
    const g = o.geometry,
      t = ((g.index ? g.index.count : g.attributes.position.count) / 3) * o.count;
    tris += t;
    const k = o.name;
    out.byModel[k] = (out.byModel[k] || 0) + Math.round(t);
  });
  out.libTris = Math.round(tris);
  out.renderTris = game.renderer.info.render.triangles;
  out.calls = game.renderer.info.render.calls;
  out.byModel = Object.fromEntries(
    Object.entries(out.byModel)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15),
  );
  return out;
})();

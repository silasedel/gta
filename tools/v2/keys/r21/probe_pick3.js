// Pick probe: the plant in the bay right of the skiff (SKIFF camera) and the boats near the house (site frame H)
(() => {
  const NH = game.nicoHouse, T = game.THREE;
  let fg = null;
  NH.group.traverse((o) => { if (o.name === 'r4_ext_site_h') fg = o; });
  fg.updateMatrixWorld(true);
  const inv = fg.matrixWorld.clone().invert();
  const cam = new T.PerspectiveCamera(50, 1600 / 900, 0.1, 2000);
  cam.position.copy(new T.Vector3(-1.0, 3.2, -29.0).applyMatrix4(fg.matrixWorld));
  cam.lookAt(new T.Vector3(-5.9, -0.2, -24.1).applyMatrix4(fg.matrixWorld));
  cam.updateMatrixWorld(true);
  const rc = new T.Raycaster();
  const chain = (o) => { const a = []; for (let q = o; q && a.length < 6; q = q.parent) a.push(q.name || q.type); return a.join(' < '); };
  const out = { plant: [], boats: [] };
  for (const [px, py] of [[1070, 175], [1060, 190], [1085, 165]]) {
    rc.setFromCamera(new T.Vector2((px / 1600) * 2 - 1, -(py / 900) * 2 + 1), cam);
    const hs = [];
    game.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible) try { (o.isInstancedMesh ? T.InstancedMesh : T.Mesh).prototype.raycast.call(o, rc, hs); } catch (e) {} });
    hs.sort((a, b) => a.distance - b.distance);
    out.plant.push(hs.slice(0, 2).map((x) => { const h = x.point.clone().applyMatrix4(inv); return { o: chain(x.object), m: x.object.material?.name, inst: x.instanceId, h: [+h.x.toFixed(1), +h.y.toFixed(2), +h.z.toFixed(1)] }; }));
  }
  for (const b of game.boatSystem?.boats || game.boatSystem?.list || []) {
    const t = b.body?.translation?.();
    if (!t) continue;
    const h = new T.Vector3(t.x, 0, t.z).applyMatrix4(inv);
    if (Math.abs(h.x) < 80 && Math.abs(h.z) < 80) out.boats.push({ n: b.name, k: b.typeKey, h: [+h.x.toFixed(1), +h.z.toFixed(1)], moored: b.moored, owner: b.owner, src: b.spawnSrc || b.tag || b.marina });
  }
  out.bsKeys = Object.keys(game.boatSystem || {}).slice(0, 40);
  return JSON.stringify(out, null, 1);
})()

// Collider audit: horizontal rays across the house (B frame) at several heights; each ray's first hit on the house's colliders
// (Rapier, the house body only) against its first hit on the drawn house meshes (three.js). Mismatches over 0.25 m are listed
// with the B-frame point, the collider tag and the mesh / material: phys-first = an invisible wall, mesh-first = walking into
// geometry (or a prop with no collider).
(() => {
  const NH = game.nicoHouse, T = game.THREE, R = game.RAPIER, W = game.world;
  let fb = null;
  NH.group.traverse((o) => { if (o.name === 'r4_ext_house_b') fb = o; });
  fb.updateMatrixWorld(true);
  const toW = (x, y, z) => new T.Vector3(x, y, z).applyMatrix4(fb.matrixWorld);
  const inv = fb.matrixWorld.clone().invert();
  const meshes = [];
  NH.group.traverse((o) => {
    if ((o.isMesh || o.isInstancedMesh) && o.material && o.material.colorWrite !== false && !(o.material.transparent && o.material.opacity < 0.3) && !/water|portal|occluder|r4skiff|grass|weed/i.test(o.name + (o.material.name || '') + (o.parent?.name || ''))) meshes.push(o);
  });
  const rc = new T.Raycaster();
  rc.firstHitOnly = true;
  const bodyH = NH.body.handle;
  const out = { n: 0, bad: [] };
  const heights = [0.45, 1.2, 3.6 + 0.45, 3.6 + 1.2, 2.75 + 0.5];
  const rays = [];
  for (const y of heights) {
    for (let z = -15; z <= 1.01; z += 0.5) rays.push([-12, y, z, 1, 0], [15, y, z, -1, 0]);
    for (let x = -10; x <= 14.01; x += 0.5) rays.push([x, y, -16, 0, 1], [x, y, 2, 0, -1]);
  }
  const dirW = (dx, dz) => { const a = toW(0, 0, 0), b = toW(dx, 0, dz); return b.sub(a).normalize(); };
  for (const [x, y, z, dx, dz] of rays) {
    const o = toW(x, y, z), d = dirW(dx, dz), L = 30;
    const h = W.castRay(new R.Ray(o, d), L, true, undefined, undefined, undefined, undefined, (c) => c.parent() && c.parent().handle === bodyH && c.isEnabled());
    const dp = h ? h.timeOfImpact : L;
    rc.set(o, d);
    rc.far = L;
    // the house's meshes switch three's raycast off (camera / picking perf): call the prototype's directly
    const hits = [];
    for (const m of meshes) (m.isInstancedMesh ? T.InstancedMesh : T.Mesh).prototype.raycast.call(m, rc, hits);
    hits.sort((a, b) => a.distance - b.distance);
    const hm = hits[0];
    const dm = hm ? hm.distance : L;
    out.n++;
    if (Math.abs(dp - dm) > 0.25) {
      const first = dp < dm ? 'phys' : 'mesh', t = Math.min(dp, dm);
      const p = o.clone().addScaledVector(d, t).applyMatrix4(inv);
      const desc = h ? NH.colliderDesc(h.collider) : null;
      out.bad.push({ f: first, p: [+p.x.toFixed(2), +y.toFixed(2), +p.z.toFixed(2)], dir: [dx, dz], gap: +Math.abs(dp - dm).toFixed(2), col: desc ? desc.tag + (desc.id ? ':' + desc.id : '') : null, mesh: hm ? (hm.object.name || hm.object.parent?.name || '?') + '/' + (hm.object.material?.name || '') : null });
    }
  }
  return JSON.stringify(out);
})()

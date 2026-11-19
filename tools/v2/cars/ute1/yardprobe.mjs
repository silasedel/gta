// Nico's yard probe (house-local frame of game.nicoHouse.toWorld): visible yard sheet height (house.yardY) vs the physics
// ground (static ray down) on a 1 m grid -> holes; top-down shots with local-axis markers (red +X every 2 m, blue +Z).
//   TAG=yp node tools/v2/cars/r2.mjs tools/v2/cars/ute1/yardprobe.mjs
const TAG = process.env.TAG || 'yp';
const steps = [
  {
    eval: `(() => { game.timeOfDay = 12; game.teleport(-866.1, undefined, 4836.4, 2.6); return 1; })()`,
    sleep: 22000,
  },
  {
    log: 'holes',
    eval: `(() => { const NH = game.nicoHouse, T = game.THREE, R = game.RAPIER, W = game.world; if (!NH) return 'no house';
    const inv = new T.Matrix4().copy(NH.group.matrixWorld).invert(); const out = [], miss = [];
    for (let x = -26; x <= 14; x += 1) for (let z = -8; z <= 24; z += 1) {
      const yv = NH.house.yardY ? NH.house.yardY(x, z) : 0; const w = NH.toWorld(new T.Vector3(x, yv, z));
      const h = W.castRay(new R.Ray({ x: w.x, y: w.y + 6, z: w.z }, { x: 0, y: -1, z: 0 }), 20, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC | R.QueryFilterFlags.EXCLUDE_SENSORS);
      if (!h) { miss.push([x, z]); continue; }
      const py = w.y + 6 - h.timeOfImpact, d = +(w.y - py).toFixed(2);
      if (d > 0.25) out.push([x, z, d, +w.y.toFixed(2)]);
    }
    const ta = NH.house.anchors?.truckR4;
    return JSON.stringify({ h0: NH.spot?.heading, anchor: ta && [ta.pos.x, ta.pos.z, ta.heading], holes: out, miss: miss.length, missS: miss.slice(0, 40) }); })()`,
  },
  {
    eval: `(() => { const NH = game.nicoHouse, T = game.THREE; const g = new T.Group(); window.__mk = g; game.scene.add(g);
    const box = (x, z, c, s) => { const m = new T.Mesh(new T.BoxGeometry(s, 3, s), new T.MeshBasicMaterial({ color: c })); m.position.copy(NH.toWorld(new T.Vector3(x, 1.5, z))); g.add(m); };
    for (let k = -12; k <= 6; k++) box(k * 2, 0, k === 0 ? 0xffffff : 0xff0000, k % 5 === 0 ? 0.5 : 0.25);
    for (let k = -4; k <= 12; k++) if (k) box(0, k * 2, 0x0044ff, k % 5 === 0 ? 0.5 : 0.25);
    const ta = NH.house.anchors?.truckR4; if (ta) box(ta.pos.x, ta.pos.z, 0x00ff00, 0.6);
    const c = NH.toWorld(new T.Vector3(-6, 0, 8)); game.cameraOverride = (dt, cam) => { cam.position.set(c.x, c.y + 38, c.z + 0.01); cam.lookAt(c.x, c.y, c.z); cam.up.set(0, 0, -1); if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return true; }; return 1; })()`,
    sleep: 2500,
  },
  { shot: `docs/v2/shots/cars/ute1/${TAG}_top.png` },
];
export default steps;

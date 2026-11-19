// Paint / LOD check at distance (user: "from a bit of a distance the paint jobs get screwed up"): truck9 in Nico's yard and
// three parked library cars beside it, each filmed at 10 / 30 / 60 / 100 / 150 m along its 3/4 view with the field of view
// narrowed so the car keeps its size (THREE.LOD picks the level by distance, not by fov: what you see is that level).
//   TAG=d1 node tools/v2/cars/r2.mjs tools/v2/cars/r2/dist.mjs -> docs/v2/shots/cars/r2/<TAG>_<car>_<dist>.png
const TAG = process.env.TAG || 'd1';
const D = 'docs/v2/shots/cars/r2';
const CARS = (process.env.CARS || 'sedan5,suv12,suv4').split(',');
const DIST = (process.env.DIST || '10,30,60,100,150').split(',').map(Number);
const steps = [
  {
    eval: `(() => { game.timeOfDay = ${process.env.TOD || 11}; game.teleport(-866.1, undefined, 4836.4, 2.6); return 1; })()`,
    sleep: 18000,
  },
  {
    log: 'programs',
    eval: `(() => JSON.stringify((game.renderer.info.programs || []).filter((p) => p.diagnostics && !p.diagnostics.runnable).map((p) => p.name)))()`,
  },
  {
    eval: `(async () => { const t9 = (game.vehicles.nicoCars || []).find((c) => c.typeKey === 'truck9'); window.__dc = { truck9: t9 };
    const T = window.THREE || game.THREE, p = t9.mesh.position; let i = 0;
    for (const k of ${JSON.stringify(CARS)}) { const v = await game.vehicles.spawnParked(k, { x: p.x + 9 + i * 6, z: p.z - 14, heading: 1.2, color: [0x8f949b, 0xb3121b, 0x173b8f][i % 3] }); window.__dc[k] = v; i++; }
    return Object.keys(window.__dc).join(','); })()`,
    sleep: 4000,
  },
];
for (const k of ['truck9', ...CARS])
  for (const d of DIST) {
    steps.push({
      eval: `(() => { const T = window.THREE || game.THREE; const v = window.__dc['${k}']; if (!v) return 'missing';
    const dir = new T.Vector3(0.62, 0.22, 0.75).normalize().multiplyScalar(${d});
    const fov = 2 * Math.atan(3.6 / ${d}) * 180 / Math.PI;
    game.cameraOverride = (dt, cam) => { const m = v.mesh; cam.position.copy(dir.clone().applyQuaternion(m.quaternion).add(m.position)); cam.lookAt(m.position.x, m.position.y + 0.8, m.position.z); if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); } return true; }; return 1; })()`,
      sleep: 1600,
    });
    steps.push({ shot: `${D}/${TAG}_${k}_${d}.png` });
  }
steps.push({ eval: `(() => { game.cameraOverride = null; return 1; })()` });
export default steps;

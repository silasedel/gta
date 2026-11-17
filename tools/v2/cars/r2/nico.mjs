// Nico's truck and convertible close-ups: docs/v2/shots/cars/r2/<TAG>_<car>_<view>.png
const TAG = process.env.TAG || 'nico';
const D = 'docs/v2/shots/cars/r2';
const VIEWS = { f34: [3.6, 1.6, 5.4], side: [5.6, 1.2, 0.2], r34: [-3.4, 1.9, -5.2], top: [2.2, 4.2, 3.0] };
const steps = [{ eval: `(() => { game.timeOfDay = +(${JSON.stringify(process.env.TOD || '10')}); game.teleport(-866.1, undefined, 4836.4, 2.6); return 1; })()`, sleep: 16000 },
  { log: 'cars', eval: `(() => JSON.stringify((game.vehicles.nicoCars || []).map((v) => [v.typeKey, v.look?.finish, v.car.paint.color.getHexString(), v.car.paint.metalness, v.car.paint.roughness])))()` }];
for (const k of (process.env.KEYS || 'truck9,coupe4').split(',')) for (const [vn, off] of Object.entries(VIEWS)) {
  steps.push({ eval: `(() => { const T = window.THREE || game.THREE; const v = (game.vehicles.nicoCars || []).find((c) => c.typeKey === '${k}'); if (!v) return 'missing'; window.__cv = v;
    const off = new T.Vector3(${off.join(',')});
    game.cameraOverride = (dt, cam) => { const m = window.__cv.mesh; cam.position.copy(off.clone().applyQuaternion(m.quaternion).add(m.position)); cam.lookAt(m.position.x, m.position.y - 0.1, m.position.z); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; }; return 1; })()`, sleep: 1200 });
  steps.push({ shot: `${D}/${TAG}_${k}_${vn}.png` });
}
export default steps;

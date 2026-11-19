// Nico's truck (truck9) review: 11:00 3/4 front / rear / top, 09:00 driver-side 3/4 close-up into the cab, shader check.
//   TAG=t9a node tools/v2/cars/r2.mjs tools/v2/cars/r2/truck.mjs  -> docs/v2/shots/cars/r2/<TAG>_<view>.png
const TAG = process.env.TAG || 't9';
const D = 'docs/v2/shots/cars/r2';
const SHOTS = [
  ['9.08', 'f34_0905', [3.9, 1.7, 5.6]],
  ['9.08', 'cab_0905', [2.7, 1.55, 1.2]],
  ['9.08', 'side_0905', [5.8, 1.3, 0.2]],
  ['12.5', 'f34_1230', [3.9, 1.7, 5.6]],
  ['12.5', 'r34_1230', [-3.6, 2.0, -5.4]],
  ['12.5', 'top_1230', [2.4, 4.6, 3.2]],
  ['12.5', 'grille_1230', [0.5, 1.3, 4.6]],
];
const steps = [
  {
    eval: `(() => { game.timeOfDay = 11; game.teleport(-866.1, undefined, 4836.4, 2.6); return 1; })()`,
    sleep: 18000,
  },
  {
    log: 'truck',
    eval: `(() => { const v = (game.vehicles.nicoCars || []).find((c) => c.typeKey === 'truck9'); if (!v) return 'missing';
    const r = game.renderer || game.render?.renderer; const bad = (r?.info?.programs || []).filter((p) => p.diagnostics && !p.diagnostics.runnable).map((p) => p.name);
    const P = v.car.paint, U = P.userData.wearUniforms || {}, f = (k) => U[k] ? (U[k].value.toArray ? U[k].value.toArray().map((x) => +x.toFixed(3)) : U[k].value) : 'none';
    const used = new Set(); v.car.shell.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) used.add(m.name + ':' + (m === P)); });
    return JSON.stringify({ color: P.color.getHexString(), m: P.metalness, rough: P.roughness, cc: P.clearcoat, key: P.customProgramCacheKey?.(), stripe: v.look?.stripe, uPatchMin: f('uPatchMin'), uPatchMax: f('uPatchMax'), uPatch2Min: f('uPatch2Min'), uPatchLine: f('uPatchLine'), uFlare: f('uFlare'), uFlare2: f('uFlare2'), uWearOffset: f('uWearOffset'), used: [...used], badPrograms: bad }); })()`,
  },
];
let tod = null;
for (const [t, vn, off] of SHOTS) {
  if (t !== tod) {
    steps.push({ eval: `(() => { game.timeOfDay = ${t}; return 1; })()`, sleep: 1500 });
    tod = t;
  }
  steps.push({
    eval: `(() => { const T = window.THREE || game.THREE; const v = (game.vehicles.nicoCars || []).find((c) => c.typeKey === 'truck9'); if (!v) return 'missing'; window.__cv = v;
    const off = new T.Vector3(${off.join(',')});
    game.cameraOverride = (dt, cam) => { const m = window.__cv.mesh; cam.position.copy(off.clone().applyQuaternion(m.quaternion).add(m.position)); cam.lookAt(m.position.x, m.position.y + 0.9, m.position.z); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; }; return 1; })()`,
    sleep: 1500,
  });
  steps.push({ shot: `${D}/${TAG}_${vn}.png` });
}
// parked yard instance vs the same truck once entered / driven a few meters (lead: the stripe showed on a driven truck)
steps.push({
  eval: `(() => { game.cameraOverride = null; const v = (game.vehicles.nicoCars || []).find((c) => c.typeKey === 'truck9'); window.__t9 = v; const t = v.mesh.position; game.teleport(t.x + 2.5, undefined, t.z, 0); return 1; })()`,
  sleep: 1200,
});
steps.push({ eval: `(() => { game.enterVehicle(window.__t9); return 1; })()`, sleep: 2500 });
steps.push({
  log: 'truckDriven',
  eval: `(() => { const v = (game.vehicles.nicoCars || []).find((c) => c.typeKey === 'truck9'); if (!v) return 'missing';
    const r = game.renderer || game.render?.renderer; const bad = (r?.info?.programs || []).filter((p) => p.diagnostics && !p.diagnostics.runnable).map((p) => p.name);
    const P = v.car.paint, U = P.userData.wearUniforms || {}, f = (k) => U[k] ? (U[k].value.toArray ? U[k].value.toArray().map((x) => +x.toFixed(3)) : U[k].value) : 'none';
    const used = new Set(); v.car.shell.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) used.add(m.name + ':' + (m === P)); });
    return JSON.stringify({ color: P.color.getHexString(), m: P.metalness, rough: P.roughness, cc: P.clearcoat, key: P.customProgramCacheKey?.(), stripe: v.look?.stripe, uPatchMin: f('uPatchMin'), uPatchMax: f('uPatchMax'), uPatch2Min: f('uPatch2Min'), uPatchLine: f('uPatchLine'), uFlare: f('uFlare'), uFlare2: f('uFlare2'), uWearOffset: f('uWearOffset'), used: [...used], badPrograms: bad }); })()`,
});
steps.push({
  eval: `(() => { const T = window.THREE || game.THREE; const off = new T.Vector3(3.9, 1.7, 5.6);
  game.cameraOverride = (dt, cam) => { const m = window.__t9.mesh; cam.position.copy(off.clone().applyQuaternion(m.quaternion).add(m.position)); cam.lookAt(m.position.x, m.position.y + 0.9, m.position.z); return true; }; return 1; })()`,
  sleep: 1500,
});
steps.push({ shot: `${D}/${TAG}_driven_f34.png` });
export default steps;

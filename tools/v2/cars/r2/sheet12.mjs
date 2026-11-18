// Fleet contact sheet in game: 12 library cars parked on a downtown street, each filmed 3/4 front from ~8 m at 11:00.
//   TAG=f1 CARS=a,b,... node tools/v2/cars/r2.mjs tools/v2/cars/r2/sheet12.mjs -> docs/v2/shots/cars/r2/<TAG>_<car>.png
const TAG = process.env.TAG || 'f1';
const CARS = (process.env.CARS || 'sedan1,sedan5,sedan8,hatch1,suv4,suv7,suv12,van6,van7,coupe2,police1,truck9').split(',');
const AT = (process.env.AT || '407,-110').split(',').map(Number);
const steps = [{ eval: `(() => { game.timeOfDay = 11; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`, sleep: 16000 }];
CARS.forEach((k, i) => {
  steps.push({ log: k, eval: `(async () => { for (const v of window.__sc || []) { try { game.vehicles.remove(v); } catch (e) {} } window.__sc = [];
    const v = await game.vehicles.spawnParked('${k}', { x: ${AT[0]} + 10 + (${i} % 3) * 9, z: ${AT[1]} + 8 + ((${i} / 3) | 0) * 10, heading: 0.4, keepSpot: true });
    if (!v) return 'no car'; window.__sc.push(v); window.__cv = v; return v.typeKey; })()`, sleep: 2500 });
  steps.push({ eval: `(() => { const T = window.THREE || game.THREE; const v = window.__cv; if (!v) return 0; const off = new T.Vector3(4.6, 1.8, 6.4);
    game.cameraOverride = (dt, cam) => { const m = v.mesh; cam.position.copy(off.clone().applyQuaternion(m.quaternion).add(m.position)); cam.lookAt(m.position.x, m.position.y + 0.7, m.position.z); if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); } return true; }; return 1; })()`, sleep: 1500 });
  steps.push({ shot: `docs/v2/shots/cars/r2/${TAG}_${k}.png` });
});
steps.push({ eval: `(() => { game.cameraOverride = null; return 1; })()` });
export default steps;

// every library model parked in a row with a driver, glass hidden, side close-up each: docs/v2/shots/cars/r2/seat_<key>.png
const D = 'docs/v2/shots/cars/r2';
const KEYS = (process.env.KEYS || 'sedan10,suv12,sedan3,truck2,conv1,hatch2,police1,suv7').split(
  ',',
);
const steps = [
  {
    eval: `(() => { game.timeOfDay = 12; game.teleport(407, undefined, -110, 0); return 1; })()`,
    sleep: 12000,
  },
];
for (const k of KEYS) {
  steps.push({
    log: k,
    eval: `(async () => { const T = window.THREE || game.THREE, V = game.vehicles, pp = game.player.position;
    if (window.__cv) { try { V.remove(window.__cv); } catch (e) {} }
    const v = await V.spawnParked('${k}', { x: pp.x + 6, z: pp.z + 2, heading: 0 }); window.__cv = v; await new Promise((r) => setTimeout(r, 900));
    V.addDriver(v); for (const g of v.car.slots?.glass || []) g.visible = false;
    game.cameraOverride = (dt, cam) => { const c = window.__cv, m = c.mesh, a = c.seatAnchor(0), g = c.groundOff;
      const e = new T.Vector3(3.4, a.hip.y + 0.3 - g, a.hip.z + 0.15).applyQuaternion(m.quaternion).add(m.position); cam.position.copy(e);
      cam.lookAt(new T.Vector3(0, a.hip.y + 0.2 - g, a.hip.z + 0.15).applyQuaternion(m.quaternion).add(m.position)); if (cam.fov !== 42) { cam.fov = 42; cam.updateProjectionMatrix(); } return true; };
    return JSON.stringify({ key: v.typeKey, hip: v.seatAnchor(0).hip, drv: !!v.driverChar }); })()`,
    sleep: 900,
  });
  steps.push({ shot: `${D}/seat_${k}.png` });
}
export default steps;

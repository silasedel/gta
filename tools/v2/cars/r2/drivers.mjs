// side close-ups of AI cars with drivers (seat anchors check)
const D = 'docs/v2/shots/cars/r2';
const steps = [
  {
    eval: `(() => { game.timeOfDay = 12; game.teleport(407, undefined, -110, 0); return 1; })()`,
    sleep: 500,
  },
  { sleep: 14000 },
];
for (let i = 0; i < 8; i++) {
  steps.push({
    log: 'car' + i,
    eval: `(() => { const T = window.THREE || game.THREE, pp = game.player.position; window.__seen ||= new Set();
    const list = game.vehicles.list.filter((v) => v.driverChar && v.car?.glb && !window.__seen.has(v.typeKey)).sort((a, b) => a.mesh.position.distanceTo(pp) - b.mesh.position.distanceTo(pp));
    const v = list[0]; if (!v) return 'none'; window.__seen.add(v.typeKey); window.__cv = v;
    for (const g of v.car.slots?.glass || []) g.visible = false; // look inside
    game.cameraOverride = (dt, cam) => { const m = window.__cv.mesh, a = window.__cv.seatAnchor(0); const e = new T.Vector3(3.2, a.hip.y + 0.25 - window.__cv.groundOff, a.hip.z + 0.1).applyQuaternion(m.quaternion).add(m.position);
      cam.position.copy(e); const l = new T.Vector3(0, a.hip.y + 0.15 - window.__cv.groundOff, a.hip.z + 0.1).applyQuaternion(m.quaternion).add(m.position); cam.lookAt(l); if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); } return true; };
    return v.typeKey + ' ' + JSON.stringify(v.seatAnchor(0).hip); })()`,
    sleep: 300,
  });
  steps.push({ sleep: 700, shot: `${D}/drv_${i}.png` });
}
export default steps;

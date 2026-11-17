const KEYS = (process.env.KEYS || 'hatch2,police1').split(',');
const steps = [{ eval: `(() => { game.timeOfDay = 12; game.teleport(407, undefined, -110, 0); return 1; })()`, sleep: 12000 }];
for (const k of KEYS) {
  steps.push({ log: k, eval: `(async () => { const T = window.THREE || game.THREE, V = game.vehicles, pp = game.player.position;
    if (window.__cv) { try { V.remove(window.__cv); } catch (e) {} }
    const v = await V.spawnParked('${k}', { x: pp.x + 6, z: pp.z + 2, heading: 0 }); window.__cv = v; await new Promise((r) => setTimeout(r, 900));
    V.addDriver(v); for (const g of v.car.slots?.glass || []) g.visible = false; await new Promise((r) => setTimeout(r, 400));
    const ch = v.driverChar, sh = v.car.shell; const heads = [];
    ch.root.traverse((o) => { if (o.isBone && /Head$/.test(o.name)) heads.push(o); });
    const mk = (c) => new T.Mesh(new T.SphereGeometry(0.035), new T.MeshBasicMaterial({ color: c, depthTest: false }));
    const a = v.seatAnchor(0); const s1 = mk(0xff0000); s1.position.copy(a.hip); s1.renderOrder = 99; sh.add(s1);
    const s2 = mk(0x00ff00); s2.position.set(a.hip.x, v.spec.roofY, a.hip.z); s2.renderOrder = 99; sh.add(s2);
    const s3 = mk(0x0000ff); s3.position.set(a.hip.x, 0, a.hip.z); s3.renderOrder = 99; sh.add(s3);
    heads.forEach((h) => { const s = mk(0xffff00); s.renderOrder = 99; h.add(s); });
    let meshes = 0; ch.root.traverse((o) => { if (o.isSkinnedMesh) meshes++; });
    game.cameraOverride = (dt, cam) => { const c = window.__cv, m = c.mesh, a = c.seatAnchor(0), g = c.groundOff;
      const e = new T.Vector3(3.4, a.hip.y + 0.3 - g, a.hip.z + 0.15).applyQuaternion(m.quaternion).add(m.position); cam.position.copy(e);
      cam.lookAt(new T.Vector3(0, a.hip.y + 0.2 - g, a.hip.z + 0.15).applyQuaternion(m.quaternion).add(m.position)); if (cam.fov !== 42) { cam.fov = 42; cam.updateProjectionMatrix(); } return true; };
    return JSON.stringify({ heads: heads.length, meshes, shellY: sh.position.y, g: v.groundOff, meshPos: v.mesh.position.y, root: v.car.root === v.mesh }); })()`, sleep: 900 });
  steps.push({ shot: `docs/v2/shots/cars/r2/hipviz_${k}.png` });
}
export default steps;

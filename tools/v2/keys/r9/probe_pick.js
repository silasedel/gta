// r9: what is under given pixels of a spot camera (spots9.json F): ray against every visible mesh (house meshes have raycast muted,
// so the prototype raycast is called directly)
(async () => { const T = game.THREE, NH = game.nicoHouse, s = { eye: [10.32, 4.6, -6.79], hdg: 75, pitch: -30, fov: 70 }, W = 1600, H = 900;
  const C = NH.center.clone(), gy = NH.group.position.y, eye = new T.Vector3(C.x + s.eye[0], gy + s.eye[1], C.z + s.eye[2]);
  const h = s.hdg * Math.PI / 180, p = s.pitch * Math.PI / 180, look = eye.clone().add(new T.Vector3(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p)));
  const cam = new T.PerspectiveCamera(s.fov, W / H, 0.1, 2000); cam.position.copy(eye); cam.lookAt(look); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const meshes = []; game.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible && o.material && o.material.visible !== false && o.name !== 'nh:occluder') meshes.push(o); });
  const rc = new T.Raycaster(), out = {};
  for (const [px, py] of [[217, 600], [240, 580], [200, 620], [1500, 150], [1150, 120]]) { rc.setFromCamera(new T.Vector2(px / W * 2 - 1, -(py / H * 2 - 1)), cam); const hits = [];
    for (const m of meshes) { const f = m.isInstancedMesh ? T.InstancedMesh.prototype.raycast : T.Mesh.prototype.raycast; try { f.call(m, rc, hits); } catch (e) {} }
    hits.sort((a, b) => a.distance - b.distance);
    out[px + ',' + py] = hits.slice(0, 4).map((x) => ({ n: x.object.name, mat: x.object.material?.name, par: x.object.parent?.name, d: +x.distance.toFixed(1), y: +x.point.y.toFixed(2), inst: x.instanceId })); }
  return JSON.stringify(out, null, 1); })()

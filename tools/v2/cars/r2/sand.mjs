// cars on sand: find a sand spot near Nico's, park a car, measure visual ground vs physics under each wheel, list what is drawn
// there (materials: transparent / depthWrite / alphaTest), low wheel close-ups.  TAG env -> shot names.
const TAG = process.env.TAG || 'sand';
const D = 'docs/v2/shots/cars/r2';
export default [
  {
    eval: `(() => { game.timeOfDay = 10; game.teleport(-866.1, undefined, 4836.4, 2.6); return 1; })()`,
    sleep: 14000,
  },
  {
    log: 'spot',
    eval: `(() => { const pp = game.player.position, S = game.sand, sf = (x, z) => (game.surfaceAt || game.city.surfaceAt)(x, z); const kinds = {}; let best = null, bd = 1e9;
      for (let r = 6; r < 420; r += 5) for (let a = 0; a < 6.28; a += 0.08) { const x = pp.x + Math.cos(a) * r, z = pp.z + Math.sin(a) * r; const k = sf(x, z); kinds[k] = (kinds[k] || 0) + 1;
        if (!(S?.isSand(x, z) || k === 'sand') || game.city.isWater(x, z)) continue; let ok = true; for (const [dx, dz] of [[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,-3]]) { const k2 = sf(x + dx, z + dz); if (!(S?.isSand(x + dx, z + dz) || k2 === 'sand') || game.city.isWater(x + dx, z + dz)) ok = false; } if (ok && r < bd) { bd = r; best = { x, z }; } }
      window.__spot = best; return JSON.stringify({ best, d: bd, kinds }); })()`,
  },
  {
    eval: `(async () => { const s = window.__spot; if (!s) return 'none'; game.teleport(s.x + 6, undefined, s.z + 2, 0); await new Promise((r) => setTimeout(r, 4000));
      const v = await game.vehicles.spawnParked('${process.env.KEY || 'conv1'}', { x: s.x, z: s.z, heading: 0.4 }); window.__cv = v; await new Promise((r) => setTimeout(r, 2500)); return v.typeKey + ' soft ' + v.soft; })()`,
    sleep: 1500,
  },
  {
    log: 'probe',
    eval: `(() => { const T = window.THREE || game.THREE, v = window.__cv; if (!v) return 'no car'; const out = { soft: +(v.soft || 0).toFixed(2), wheels: [] };
      const rc = new T.Raycaster(); const objs = []; game.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible) objs.push(o); });
      const carSet = new Set(); v.mesh.traverse((o) => carSet.add(o));
      for (const w of v.car.wheels) { const p = w.steer.getWorldPosition(new T.Vector3());
        rc.set(new T.Vector3(p.x, p.y + 2, p.z), new T.Vector3(0, -1, 0)); rc.far = 6;
        const hits = rc.intersectObjects(objs, false).filter((h) => !carSet.has(h.object)).slice(0, 4);
        let phys = null; try { const R = game.RAPIER, QF = R.QueryFilterFlags; const hit = game.world.castRay(new R.Ray({ x: p.x, y: p.y + 0.4, z: p.z }, { x: 0, y: -1, z: 0 }), 4, true, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS); if (hit) phys = p.y + 0.4 - (hit.timeOfImpact ?? hit.toi); } catch (e) {}
        out.wheels.push({ tireBottom: +(p.y - v.spec.r).toFixed(3), phys: phys && +phys.toFixed(3), hits: hits.map((h) => { const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material; return { y: +h.point.y.toFixed(3), name: h.object.name || h.object.type, mat: m?.name || m?.type, transparent: m?.transparent, depthWrite: m?.depthWrite, alphaTest: m?.alphaTest, ro: h.object.renderOrder, opacity: m?.opacity, blending: m?.blending, alphaHash: m?.alphaHash, side: m?.side }; }) }); }
      return JSON.stringify(out); })()`,
  },
  {
    eval: `(() => { const T = window.THREE || game.THREE; const v = window.__cv; window.__off = new T.Vector3(2.6, 0.35, 1.45);
      game.cameraOverride = (dt, cam) => { const m = window.__cv.mesh, w = window.__cv.car.wheels[0].steer.getWorldPosition(new T.Vector3()); cam.position.copy(window.__off.clone().applyQuaternion(m.quaternion).add(m.position)); cam.position.y = w.y + 0.05; cam.lookAt(w.x, w.y - 0.25, w.z); if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); } return true; }; return 1; })()`,
    sleep: 1500,
    shot: `${D}/${TAG}_wheel_low.png`,
  },
  {
    eval: `(() => { const T = window.THREE || game.THREE; window.__off.set(4.5, 1.6, 0.2); return 1; })()`,
    sleep: 900,
    shot: `${D}/${TAG}_side.png`,
  },
  {
    eval: `(() => { const T = window.THREE || game.THREE; window.__off.set(2.2, 1.1, 2.6); return 1; })()`,
    sleep: 900,
    shot: `${D}/${TAG}_f34.png`,
  },
];

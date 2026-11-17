// draw-call cost per group at the current camera: hide one group, read renderer.info over a few frames, restore
(async () => { const NH = game.nicoHouse, T = game.THREE; const sp = NH.toWorld(new T.Vector3(1.4, 4.9, 6.9)), lk = NH.toWorld(new T.Vector3(-6.5, 0, 23));
  game.cameraOverride = (dt, cam) => { cam.position.copy(sp); cam.lookAt(lk); return true; }; game.timeOfDay = 11;
  const frames = (n) => new Promise((res) => { let k = 0, s = 0; const f = () => { if (k++ > 1) s += game.renderer.info.render.calls; if (k < n + 2) requestAnimationFrame(f); else res(Math.round(s / n)); }; requestAnimationFrame(f); });
  await new Promise((r) => setTimeout(r, 3000));
  const groups = { nh_site: NH.group.getObjectByName('nh_site'), nh_detail: NH.group.getObjectByName('nh_detail'), nh_ext: NH.group.getObjectByName('nh_ext'), nh_int: NH.group.getObjectByName('nh_int'), keysLots: game.scene.getObjectByName('keysLots'), houses: game.scene.getObjectByName('houses') };
  const veg = []; game.scene.traverse((o) => { if (o.parent === game.scene && /veg|field/i.test(o.name || '') ) veg.push(o); });
  const out = { base: await frames(6), groups: {} };
  for (const [k, g] of Object.entries(groups)) { if (!g) { out.groups[k] = 'missing'; continue; } const v = g.visible; g.visible = false; out.groups[k] = out.base - await frames(6); g.visible = v; }
  { const vs = veg.map((o) => o.visible); veg.forEach((o) => o.visible = false); out.groups.vegTop = [veg.length, out.base - await frames(6)]; veg.forEach((o, i) => o.visible = vs[i]); }
  const top = {}; game.scene.children.forEach((c) => { let n = 0; c.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible) n++; }); top[c.name || c.type] = (top[c.name || c.type] || 0) + n; });
  out.meshesByTop = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 25);
  return JSON.stringify(out); })()

(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  game.teleport(-930, undefined, 4930, 0); await sleep(25000);
  const L = __libBuildings, out = { lib: [], fences: 0, meshesNear: {} };
  for (const e of L.entries.values()) if (Math.hypot(e.x + 930, e.z - 4930) < 250) out.lib.push([e.name, Math.round(e.x), Math.round(e.z)]);
  L.group.traverse((o) => { if (o.isInstancedMesh && o.count) { const m = new game.THREE.Matrix4(), p = new game.THREE.Vector3(); let n = 0; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); p.setFromMatrixPosition(m); if (Math.hypot(p.x + 930, p.z - 4930) < 250) n++; } if (n) out.meshesNear[o.name] = n; } });
  // every visible mesh whose bounding sphere center is within 120 m and whose material is a dark flat color without map
  const T = game.THREE, dark = {}; game.scene.traverse((o) => { if (!o.isMesh || !o.visible) return; const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { if (!m || m.map || !m.color) continue; const c = m.color; if (c.r < 0.25 && c.g < 0.3 && c.b > c.r && c.b < 0.5) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const s = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld); if (Math.hypot(s.x + 930, s.z - 4930) < 200) { let p = o, path = []; while (p && p !== game.scene && path.length < 4) { path.push(p.name || p.type); p = p.parent; } const k = path.join(' < ') + ' :' + (m.name || m.type) + ' #' + c.getHexString(); dark[k] = (dark[k] || 0) + 1; } } } });
  out.darkBluishNoMap = dark; return out; })()

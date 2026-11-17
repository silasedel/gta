(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  game.teleport(-930, undefined, 4930, 0); await sleep(25000);
  const out = []; game.scene.traverse((o) => { if (!o.isMesh || !o.visible) return; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m || !m.color || m.map) return;
    const hx = m.color.getHexString(); if (!/^(2a3550|1d3f8f|183b8d|183b8f|0e1418|1c2528)$/.test(hx)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); const c = bb.getCenter(new game.THREE.Vector3()), s = bb.getSize(new game.THREE.Vector3());
    if (Math.hypot(c.x + 930, c.z - 4930) > 220) return;
    const chain = []; let p = o; while (p && p !== game.scene) { chain.push((p.name || p.type) + (p.userData && Object.keys(p.userData).length ? JSON.stringify(Object.keys(p.userData)) : '')); p = p.parent; }
    out.push({ color: hx, mat: m.name || m.type, center: c.toArray().map((v) => +v.toFixed(1)), size: s.toArray().map((v) => +v.toFixed(2)), tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, chain: chain.slice(0, 7).join(' < ') }); });
  return out.filter((x) => x.size[1] > 0.8 && (x.size[0] > 1 || x.size[2] > 1)).slice(0, 30); })()

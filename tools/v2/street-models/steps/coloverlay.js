(() => {
  // collider debug overlay: every Rapier collider within r of (x, y, z) drawn as bright wireframe over the scene
  // (cuboid / cylinder / cone / ball / capsule from their shape data; trimesh soups clipped to triangles inside r)
  const THREE = game.THREE, R = game.RAPIER, W = game.world;
  window.__colOverlay = (x, y, z, r = 2.2) => {
    if (window.__colLines) { game.scene.remove(window.__colLines); window.__colLines.geometry.dispose(); window.__colLines = null; }
    const P = [], C = [], push = (a, b, col) => { P.push(a.x, a.y, a.z, b.x, b.y, b.z); C.push(...col, ...col); };
    const seen = new Set(), q = new THREE.Quaternion(), t = new THREE.Vector3(), v = new THREE.Vector3(), w = new THREE.Vector3();
    W.intersectionsWithShape({ x, y, z }, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(r), (c) => { seen.add(c); return true; });
    let n = 0;
    for (const c of seen) {
      const tr = c.translation(), ro = c.rotation(); t.set(tr.x, tr.y, tr.z); q.set(ro.x, ro.y, ro.z, ro.w);
      const body = c.parent(), dyn = body && body.isDynamic && body.isDynamic(), col = dyn ? [0.1, 1, 0.2] : body && body.isFixed && body.isFixed() && body.numColliders && body.numColliders() < 6 ? [1, 0.85, 0.1] : [1, 0.15, 0.1];
      const L = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(t);
      const st = c.shapeType();
      if (st === R.ShapeType.Cuboid) { const h = c.halfExtents(); const k = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) k.push(L(sx * h.x, sy * h.y, sz * h.z));
        for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) push(k[a], k[b], col); n++; }
      else if (st === R.ShapeType.Cylinder || st === R.ShapeType.Cone || st === R.ShapeType.Capsule) { const hh = c.halfHeight(), rr = c.radius(), N = 16;
        for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2; for (const sy of [-1, 1]) { const rt = st === R.ShapeType.Cone && sy > 0 ? 0.0 : rr; push(L(Math.cos(a0) * rt, sy * hh, Math.sin(a0) * rt), L(Math.cos(a1) * rt, sy * hh, Math.sin(a1) * rt), col); }
          if (i % 4 === 0) push(L(Math.cos(a0) * rr, -hh, Math.sin(a0) * rr), L(Math.cos(a0) * (st === R.ShapeType.Cone ? 0 : rr), hh, Math.sin(a0) * (st === R.ShapeType.Cone ? 0 : rr)), col); } n++; }
      else if (st === R.ShapeType.Ball) { const rr = c.radius(); for (let i = 0; i < 16; i++) { const a0 = i / 16 * Math.PI * 2, a1 = (i + 1) / 16 * Math.PI * 2; push(L(Math.cos(a0) * rr, 0, Math.sin(a0) * rr), L(Math.cos(a1) * rr, 0, Math.sin(a1) * rr), col); push(L(0, Math.cos(a0) * rr, Math.sin(a0) * rr), L(0, Math.cos(a1) * rr, Math.sin(a1) * rr), col); } n++; }
      else if (st === R.ShapeType.TriMesh) { const V = c.vertices(), I = c.indices(), rr2 = r * r;
        for (let i = 0; i < I.length; i += 3) { const ok = [I[i], I[i + 1], I[i + 2]].every((j) => { v.set(V[j * 3], V[j * 3 + 1], V[j * 3 + 2]).applyQuaternion(q).add(t); return (v.x - x) ** 2 + (v.z - z) ** 2 < rr2 && v.y > y - 1.2; });
          if (!ok) continue; const a = new THREE.Vector3(V[I[i] * 3], V[I[i] * 3 + 1], V[I[i] * 3 + 2]).applyQuaternion(q).add(t), b = new THREE.Vector3(V[I[i + 1] * 3], V[I[i + 1] * 3 + 1], V[I[i + 1] * 3 + 2]).applyQuaternion(q).add(t), d = new THREE.Vector3(V[I[i + 2] * 3], V[I[i + 2] * 3 + 1], V[I[i + 2] * 3 + 2]).applyQuaternion(q).add(t);
          if (Math.max(a.y, b.y, d.y) - Math.min(a.y, b.y, d.y) < 0.02 && Math.abs(a.y - y) < 0.3) continue; // skip flat ground triangles
          push(a, b, [1, 0.15, 0.1]); push(b, d, [1, 0.15, 0.1]); push(d, a, [1, 0.15, 0.1]); } n++; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.95 }));
    m.renderOrder = 9999; m.frustumCulled = false; game.scene.add(m); window.__colLines = m; return n;
  };
  return 'coloverlay ok';
})()

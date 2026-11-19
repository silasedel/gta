(() => {
  // curb camera: nearest road edge to (x, z); camera on one side at height h, looking along the road
  window.__curbCam = (x, z, side = 1, h = 1.7, ahead = 25, off = 0) => {
    const r = game.city.roadGraph.nearestEdge(x, z, {}, 200);
    if (!r) return 'no edge';
    const e = r.edge,
      d = r.dir,
      n = [d.z * side, -d.x * side],
      w = (e.width || 7) / 2 + off;
    const ex = r.point.x + n[0] * w,
      ez = r.point.z + n[1] * w,
      gy = game.city.groundHeightAt(ex, ez) || 0;
    game.cameraOverride = (dt, cam) => {
      cam.position.set(ex - d.x * 4, gy + h, ez - d.z * 4);
      cam.lookAt(ex + d.x * ahead + n[0] * 3, gy + 0.3, ez + d.z * ahead + n[1] * 3);
      return true;
    };
    return {
      edge: e.id,
      kind: e.kind,
      name: e.name,
      width: e.width,
      at: [+ex.toFixed(1), +ez.toFixed(1)],
    };
  };
  // kit instances near (x, z): per part name, positions of the drawn instances (after culling)
  window.__kitNear = (x, z, R = 60) => {
    const K = game.city.streetKit;
    if (!K) return 'no kit';
    const out = {};
    const byGeo = new Map();
    for (const n in K.parts) for (const p of K.parts[n]) byGeo.set(p.geometry, n);
    game.city.root.traverse((o) => {
      if (!o.isInstancedMesh) return;
      const n = byGeo.get(o.geometry);
      if (!n) return;
      const A = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        const px = A[i * 16 + 12],
          pz = A[i * 16 + 14];
        if (Math.hypot(px - x, pz - z) < R) {
          (out[n] ||= new Set()).add(
            px.toFixed(1) + ',' + A[i * 16 + 13].toFixed(2) + ',' + pz.toFixed(1),
          );
        }
      }
    });
    const r = {};
    for (const n in out) r[n] = [...out[n]];
    return r;
  };
  // lookAt camera: eye at (x, y, z) looking at (lx, ly, lz)
  window.__cam = (x, y, z, lx, ly, lz) => {
    game.cameraOverride = (dt, cam) => {
      cam.position.set(x, y, z);
      cam.lookAt(lx, ly, lz);
      return true;
    };
    return 1;
  };
  return 'helpers ok';
})();
(() => {
  // frame the k-th lot (nearest to (x, z)) from the street: mailbox + carts in view
  window.__lookLot = (x, z, k = 0, back = 5.5, side = 2.2, h = 1.8) => {
    const L = game.lotProps;
    if (!L) return 'no lotProps';
    const list = [...L.owners.entries()]
      .map(([o, its]) => ({ o, its, mb: its.find((i) => i.name.startsWith('mailbox')) || its[0] }))
      .filter((e) => e.mb)
      .sort((a, b) => Math.hypot(a.mb.x - x, a.mb.z - z) - Math.hypot(b.mb.x - x, b.mb.z - z));
    const e = list[k];
    if (!e) return 'none';
    const m = e.mb,
      fx = Math.sin(m.ry + (m.name === 'mailbox_post' ? Math.PI / 2 : 0)),
      fz = Math.cos(m.ry + (m.name === 'mailbox_post' ? Math.PI / 2 : 0));
    const cx = m.x + fx * back + fz * side,
      cz = m.z + fz * back - fx * side,
      gy = game.city.groundHeightAt(cx, cz) || m.y;
    game.cameraOverride = (dt, cam) => {
      cam.position.set(cx, gy + h, cz);
      cam.lookAt(m.x - fz * 1.2, m.y + 0.7, m.z + fx * 1.2);
      return true;
    };
    return JSON.stringify({
      owner: e.o,
      items: e.its.map((i) => [
        i.name,
        +i.x.toFixed(1),
        +i.z.toFixed(1),
        +(i.vc ? i.vc.r : -1).toFixed(0),
      ]),
    });
  };
  return 'helpers2 ok';
})();
(() => {
  // props of one kind around (x, z) in collider-built tiles: [{x, y, z}] nearest first
  window.__findKind = (kind, x, z, R = 600) => {
    const out = [];
    for (let i = -R; i <= R; i += 200)
      for (let j = -R; j <= R; j += 200) {
        const tx = Math.floor((x + i) / 200) * 200 + 100,
          tz = Math.floor((z + j) / 200) * 200 + 100;
        for (const p of game.city.colliderSourceAt(tx, tz, 145))
          if (p.kind === kind && !out.some((q) => q.x === p.x && q.z === p.z)) out.push(p);
      }
    return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  };
  // camera 'd' m from a point, looking at it from the nearest road (street view of a prop group)
  window.__lookAt = (x, y, z, d = 7, h = 1.9, side = 0.35) => {
    const e = game.city.roadGraph.nearestEdge(x, z, {}, 80);
    let ox = e ? e.point.x - x : 1,
      oz = e ? e.point.z - z : 0;
    const l = Math.hypot(ox, oz) || 1;
    ox /= l;
    oz /= l;
    const cx = x + (ox * Math.cos(side) - oz * Math.sin(side)) * d,
      cz = z + (oz * Math.cos(side) + ox * Math.sin(side)) * d,
      gy = game.city.groundHeightAt(cx, cz) || 0;
    game.cameraOverride = (dt, cam) => {
      cam.position.set(cx, gy + h, cz);
      cam.lookAt(x, y + 0.6, z);
      return true;
    };
    return [+cx.toFixed(1), +cz.toFixed(1)];
  };
  return 'helpers3 ok';
})();

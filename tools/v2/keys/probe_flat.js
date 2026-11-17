// lists flat meshes (bbox height < 1.2 m) covering points of a local-frame area: finds stray ground polygons
(() => { const NH = game.nicoHouse, g = NH.group, T = game.THREE; const AREA = window.__flatArea || [5, 40, -35, 5, 3];
  const pts = []; for (let x = AREA[0]; x <= AREA[1]; x += AREA[4]) for (let z = AREA[2]; z <= AREA[3]; z += AREA[4]) pts.push(new T.Vector3(x, 0, z).applyMatrix4(g.matrixWorld));
  const hits = {}, bb = new T.Box3(), v = new T.Vector3();
  game.scene.traverse((o) => { if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return; let p = o, vis = true; while (p) { if (!p.visible) { vis = false; break; } p = p.parent; } if (!vis) return;
    const geo = o.geometry; if (!geo) return; if (!geo.boundingBox) geo.computeBoundingBox(); o.updateWorldMatrix(true, false);
    if (o.isInstancedMesh) { for (let i = 0; i < Math.min(o.count, 4000); i++) { const m = new T.Matrix4(); o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); bb.copy(geo.boundingBox).applyMatrix4(m); if (bb.max.y - bb.min.y > 1.2) continue; for (const p of pts) if (p.x > bb.min.x && p.x < bb.max.x && p.z > bb.min.z && p.z < bb.max.z) { const k = (o.name || '?') + ' | ' + (o.material?.name || ''); hits[k] = (hits[k] || 0) + 1; } } return; }
    bb.copy(geo.boundingBox).applyMatrix4(o.matrixWorld); if (bb.max.y - bb.min.y > 1.2 || bb.max.x - bb.min.x > 600) return;
    let path = o.name; let q = o.parent; for (let i = 0; i < 3 && q; i++, q = q.parent) path = (q.name || '?') + '/' + path;
    for (const p of pts) if (p.x > bb.min.x && p.x < bb.max.x && p.z > bb.min.z && p.z < bb.max.z) { const k = path + ' | ' + (Array.isArray(o.material) ? 'multi' : o.material?.name || o.material?.type) + ' | y ' + bb.min.y.toFixed(2) + '..' + bb.max.y.toFixed(2); hits[k] = (hits[k] || 0) + 1; } });
  return JSON.stringify(Object.entries(hits).sort((a, b) => b[1] - a[1]).slice(0, 60), null, 0); })()

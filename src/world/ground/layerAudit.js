// Ground layer audit (overnight ground pass). In the page:
//   const A = await import('/src/world/ground/layerAudit.js'); A.layerScan(game, { x, z, r: 40, step: 1 })
// Casts rays straight down on a grid and lists every drawn ground layer under each point (meshes in the whole scene, not instanced),
// then reports: layer counts by material, and overlap pairs = two different opaque ground layers within 4 cm of each other at the
// same point (z-fight / poke-through candidates), with sample positions. Decals, road lines and markings are expected overlays and
// are not counted as overlaps.
import * as THREE from 'three';
const OVERLAY = /roadDecals|roadLines|markings|graffiti|shoulder/;
export function layerScan(game, o = {}) {
  const T = THREE;
  const { x = game.camera.position.x, z = game.camera.position.z, r = 30, step = 1, top = 3, depth = 4 } = o;
  const rc = new T.Raycaster(), down = new T.Vector3(0, -1, 0), org = new T.Vector3(); rc.camera = game.camera;
  const roots = [game.scene];
  const mats = {}, pairs = {}, samples = {};
  const name = (h) => { const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material; return (m && (m.name || m.type)) + (h.object.name ? '@' + h.object.name : ''); };
  let pts = 0;
  for (let gz = z - r; gz <= z + r; gz += step) for (let gx = x - r; gx <= x + r; gx += step) {
    const gy = game.city.groundHeightAt ? game.city.groundHeightAt(gx, gz) || 0 : 0;
    org.set(gx, gy + top, gz); rc.set(org, down); rc.far = top + depth; pts++;
    let hs0 = []; try { hs0 = rc.intersectObjects(roots, true); } catch (e) { continue; } const hs = hs0.filter((h) => h.object.isMesh && !h.object.isSprite && !h.object.isInstancedMesh && h.object.visible && !h.object.isSkinnedMesh && Math.abs(h.face?.normal?.y ?? 1) > 0.7);
    // ground-ish hits only: within 0.6 m of the first hit's height
    if (!hs.length) continue; const y0 = hs[0].point.y; const g = hs.filter((h) => h.point.y > y0 - 0.6);
    for (const h of g) { const k = name(h); mats[k] = (mats[k] || 0) + 1; }
    const solid = g.filter((h) => !OVERLAY.test(name(h)));
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = name(solid[i]), b = name(solid[j]); if (a === b) continue; const dy = Math.abs(solid[i].point.y - solid[j].point.y); if (dy > 0.04) continue;
      const k = [a, b].sort().join(' | '); pairs[k] = (pairs[k] || 0) + 1; (samples[k] ||= []).length < 4 && samples[k].push([+gx.toFixed(1), +gz.toFixed(1), +solid[i].point.y.toFixed(3), +solid[j].point.y.toFixed(3)]);
    }
  }
  return { pts, mats, pairs, samples };
}

// instanced objects (plants, props) standing on a road carriageway near (x, z): counts by mesh / material / parent chain
export function onRoad(game, o = {}) {
  const { x = game.camera.position.x, z = game.camera.position.z, r = 40, margin = 0.25 } = o; const G = game.city.roadGraph, q = {}, out = {}; let n = 0;
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
  game.scene.traverse((ob) => { if (!ob.isInstancedMesh || !ob.visible || !ob.count) return; ob.updateMatrixWorld();
    const chain = []; let a = ob; for (let k = 0; k < 4 && a; k++) { if (a.name) chain.push(a.name); a = a.parent; }
    const mat = Array.isArray(ob.material) ? ob.material[0] : ob.material, key = chain.join('<') + ' / ' + (mat && (mat.name || mat.type));
    for (let i = 0; i < ob.count; i++) { ob.getMatrixAt(i, m4); p.setFromMatrixPosition(m4).applyMatrix4(ob.matrixWorld); if (Math.abs(p.x - x) > r || Math.abs(p.z - z) > r) continue;
      const e = G.nearestEdge(p.x, p.z, q, 20); if (!e || e.edge.elevated || e.dist > e.edge.width / 2 - margin) continue;
      const s = new THREE.Vector3().setFromMatrixScale(m4); if (s.x < 0.01) continue; n++;
      const k2 = out[key] || (out[key] = { n: 0, at: [] }); k2.n++; if (k2.at.length < 3) k2.at.push([+p.x.toFixed(1), +p.z.toFixed(1)]); } });
  return { n, list: out };
}

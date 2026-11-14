// Instanced vegetation fields with three LODs and dithered cross-fades (no visible pop):
//   LOD0 full geometry (near), LOD1 simplified geometry (mid), LOD2 baked impostor (2 crossed cards with a rendered image of the plant, far).
// createVegField(renderer, kind, items, opts) -> { group, update(camera), stats(), dispose() }
//   items: [{ x, y, z, ry, s }] ; opts: { variants: 4, dist: [d0, d1, d2], seed, shadows: true }
// Instances are re-bucketed by camera distance (with overlapping fade bands) when the camera moves; draw calls per field are
// variants x (2 + 2 + 1) at most, and only buckets with instances are drawn.
import * as THREE from 'three';
import { buildGeometry, KIND_TYPE } from './index.js';
import { makeVegMaterial, vegUniforms } from './materials.js';

const DEF_DIST = { palm: [45, 160, 900], tree: [55, 190, 1100], shrub: [28, 90, 260] };

// bake an impostor: two orthographic views (front, side) of the full-detail plant into one RGBA texture (left / right half)
const _bakeCache = new Map();
function bakeImpostor(renderer, kind, seed, geo, bark, leaf) {
  const key = kind + ':' + seed; if (_bakeCache.has(key)) return _bakeCache.get(key);
  const bb = new THREE.Box3(); geo.leaf.computeBoundingBox(); geo.bark.computeBoundingBox();
  bb.copy(geo.leaf.boundingBox); if (geo.bark.index.count) bb.union(geo.bark.boundingBox);
  const half = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, 0.5) / 2 * 1.04, hgt = (bb.max.y - Math.min(0, bb.min.y)) * 1.03, cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2;
  const S = 512, rt = new THREE.WebGLRenderTarget(S * 2, Math.round(S * Math.min(2, hgt / (half * 2))), { samples: 4, colorSpace: THREE.NoColorSpace });
  const scene = new THREE.Scene(); scene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.95));
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo.bark, bark)); g.add(new THREE.Mesh(geo.leaf, leaf)); scene.add(g);
  const cam = new THREE.OrthographicCamera(-half, half, hgt, 0, 0.1, 400);
  const prev = { rt: renderer.getRenderTarget(), cc: renderer.getClearColor(new THREE.Color()), ca: renderer.getClearAlpha(), sun: vegUniforms.uSunCol.value.clone(), as: renderer.autoClear, sm: renderer.shadowMap.enabled };
  vegUniforms.uSunCol.value.setRGB(0, 0, 0); renderer.setClearColor(0x3e5a2c, 0); renderer.autoClear = false; renderer.setRenderTarget(rt); renderer.clear();
  for (let v = 0; v < 2; v++) {
    const a = v * Math.PI / 2; cam.position.set(cx + Math.sin(a) * 100, Math.min(0, bb.min.y), cz + Math.cos(a) * 100); cam.lookAt(cx, Math.min(0, bb.min.y), cz); cam.updateMatrixWorld();
    rt.viewport.set(v * S, 0, S, rt.height); rt.scissor.set(v * S, 0, S, rt.height); rt.scissorTest = true;
    renderer.setRenderTarget(rt); renderer.render(scene, cam);
  }
  rt.viewport.set(0, 0, rt.width, rt.height); rt.scissorTest = false;
  renderer.setRenderTarget(prev.rt); renderer.setClearColor(prev.cc, prev.ca); renderer.autoClear = prev.as; vegUniforms.uSunCol.value.copy(prev.sun);
  rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  // geometry: two crossed quads, each showing its view; normals lean up so the far canopy reads lit from the sky
  const pos = [], nor = [], uv = [], idx = [];
  for (let v = 0; v < 2; v++) {
    const a = v * Math.PI / 2, ax = [Math.cos(a), 0, -Math.sin(a)], b = pos.length / 3;
    for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      pos.push(cx + ax[0] * sx * half, Math.min(0, bb.min.y) + sy * hgt, cz + ax[2] * sx * half); nor.push(Math.sin(a) * 0.35, 0.9, Math.cos(a) * 0.35);
      uv.push((v + (sx + 1) / 2) / 2, sy);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ig.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); ig.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  ig.setAttribute('aWind', new THREE.Float32BufferAttribute(pos.map((p, i) => (i % 3 === 1 ? p * 0.6 : 0)), 3)); ig.setIndex(idx); ig.computeBoundingSphere();
  const out = { geometry: ig, texture: rt.texture, rt };
  _bakeCache.set(key, out); g.clear();
  return out;
}

export function createVegField(renderer, kind, items, opts = {}) {
  const type = KIND_TYPE[kind] || 'shrub', [d0, d1, d2] = opts.dist || DEF_DIST[type], b0 = Math.max(4, d0 * 0.18), b1 = Math.max(8, d1 * 0.15), b2 = d2 * 0.1;
  const nV = opts.variants ?? 4, seed = opts.seed ?? 1, group = new THREE.Group(); group.name = 'vegField_' + kind;
  const fades = [[0, 0, d0 - b0, d0], [d0 - b0, d0, d1 - b1, d1], [d1 - b1, d1, d2 - b2, d2]];
  const mats = fades.map((f, l) => l < 2 ? { bark: makeVegMaterial('bark', { fade: f, lean: 0.006, sway: 0.0035 }), leaf: makeVegMaterial('leaf', { fade: f, lean: 0.006, sway: 0.0035 }) } : null);
  const variants = [], bakeM = { bark: makeVegMaterial('bark'), leaf: makeVegMaterial('leaf') };
  for (let v = 0; v < nV; v++) {
    const vs = seed * 31 + v * 7 + 1, g0 = buildGeometry(kind, { seed: vs, lod: 0, ...opts.build }), g1 = buildGeometry(kind, { seed: vs, lod: 1, ...opts.build });
    const imp = bakeImpostor(renderer, kind, vs, g0, bakeM.bark.mat, bakeM.leaf.mat), impMat = makeVegMaterial('imp', { map: imp.texture, fade: fades[2], lean: 0.006, sway: 0.0035, alphaTest: 0.5, transl: 0.3 });
    const parts = [];
    const mk = (geo, m, lod, cast) => { if (!geo.index || !geo.index.count) return; const im = new THREE.InstancedMesh(geo, m.mat, Math.max(16, items.length)); im.count = 0; im.frustumCulled = false; im.castShadow = cast && opts.shadows !== false; im.receiveShadow = true; im.customDepthMaterial = m.depth; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(im); parts.push({ im, lod, tris: geo.index.count / 3 }); };
    mk(g0.bark, mats[0].bark, 0, true); mk(g0.leaf, mats[0].leaf, 0, true); mk(g1.bark, mats[1].bark, 1, true); mk(g1.leaf, mats[1].leaf, 1, true); mk(imp.geometry, impMat, 2, false);
    variants.push({ parts, tris: [g0.tris, g1.tris, 4] });
  }
  // per-item matrices (scale and yaw), variant from a position hash
  const mats4 = items.map((it) => new THREE.Matrix4().compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry ?? 0), new THREE.Vector3().setScalar(it.s ?? 1)));
  const varOf = items.map((it) => Math.abs(Math.floor(it.x * 12.9898 + it.z * 78.233)) % nV);
  const last = new THREE.Vector3(1e9, 0, 0), frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  const radius = type === 'palm' ? 7 : type === 'tree' ? 10 : 2.5;
  let counts = [0, 0, 0];
  function update(camera, force = false) {
    camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    if (!force && camera.position.distanceToSquared(last) < 1 && !update.dirtyView) return;
    last.copy(camera.position);
    for (const V of variants) for (const p of V.parts) p.im.count = 0;
    counts = [0, 0, 0];
    for (let i = 0; i < items.length; i++) {
      const it = items[i], dx = it.x - camera.position.x, dz = it.z - camera.position.z, dy = (it.y ?? 0) - camera.position.y, d = Math.sqrt(dx * dx + dz * dz + dy * dy);
      if (d > d2) continue;
      sph.center.set(it.x, (it.y ?? 0) + radius * 0.6, it.z); sph.radius = radius * (it.s ?? 1) * 1.4; if (d > 15 && !frustum.intersectsSphere(sph)) continue;
      const V = variants[varOf[i]];
      const inL = [d < d0, d > d0 - b0 && d < d1, d > d1 - b1];
      for (const p of V.parts) if (inL[p.lod]) { p.im.setMatrixAt(p.im.count++, mats4[i]); }
      for (let l = 0; l < 3; l++) if (inL[l]) counts[l]++;
    }
    for (const V of variants) for (const p of V.parts) { p.im.instanceMatrix.needsUpdate = true; p.im.visible = p.im.count > 0; }
  }
  update.dirtyView = true;
  function stats() {
    let draws = 0, tris = 0; const lodTris = [0, 0, 0];
    for (const V of variants) for (const p of V.parts) if (p.im.count) { draws++; tris += p.im.count * p.tris; lodTris[p.lod] += p.im.count * p.tris; }
    return { kind, items: items.length, instancesPerLOD: counts.slice(), drawCalls: draws, tris, lodTris, trisPerPlant: variants.map((v) => v.tris), dist: [d0, d1, d2] };
  }
  function dispose() { for (const V of variants) for (const p of V.parts) { p.im.dispose(); } group.clear(); }
  return { group, update, stats, dispose, variants };
}

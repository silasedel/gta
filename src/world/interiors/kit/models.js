// Library models for interior fixtures (public/assets/models/street/*.glb, built by tools/v2/street-models/build_props.sh).
// Loaded once by the engine (preloadModels); fixtures call libModel() and fall back to their code-built version while a file is missing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const BASE = '/assets/models/street/', cache = new Map();
let started = null, done = false;
export function preloadModels(names = ['atm']) {
  if (started) return started;
  const gl = new GLTFLoader();
  started = Promise.all(names.map(async (n) => {
    try {
      const s = (await gl.loadAsync(BASE + n + '.glb')).scene; s.updateMatrixWorld(true); const parts = [];
      s.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (o.material.map) o.material.map.anisotropy = 8; if (o.material.metalness > 0.6) o.material.metalness = 0.6; parts.push({ geometry: g, material: o.material }); } });
      cache.set(n, parts);
    } catch (e) { console.warn('[interiors] model missing', n, e?.message); }
  })).then(() => { done = true; });
  return started;
}
// add a loaded model at (x, z) facing ry in the current G frame; false when it has not loaded (caller draws its fallback)
export function libModel(ctx, name, x, z, ry, y = 0) {
  const parts = cache.get(name); if (!parts) return false;
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  for (const p of parts) ctx.G.add(ctx.M.adopt(p.material), p.geometry, m);
  return true;
}
// builds wait for the files (a missing file still ends the wait: done is set either way)
export const modelsReady = () => done || !started;

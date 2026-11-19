// Library models for interior fixtures (public/assets/models/street/*.glb, built by tools/v2/street-models/build_props.sh).
// Loaded once by the engine (preloadModels); fixtures call libModel() and fall back to their code-built version while a file is missing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadModelProducts } from '../items/modelProducts.js';
const BASE = '/assets/models/street/',
  cache = new Map();
let started = null,
  done = false;
export const hasModel = (n) => cache.has(n);
// r7: interior-only library models converted from Models/ (tools/v2/street-models/convert.py) live next to this code
const LOCAL = {
  pistol_a: new URL('../models/pistol_a.glb', import.meta.url).href,
  pistol_b: new URL('../models/pistol_b.glb', import.meta.url).href,
  cart: new URL('../models/cart.glb', import.meta.url).href,
  mannequin_m: new URL('../models/mannequin_m.glb', import.meta.url).href,
  mannequin_torso: new URL('../models/mannequin_torso.glb', import.meta.url).href,
  clothing_rack: new URL('../models/clothing_rack.glb', import.meta.url).href,
  barrel: new URL('../models/barrel.glb', import.meta.url).href,
  card_reader: new URL('../models/card_reader.glb', import.meta.url).href,
  tv: new URL('../models/tv.glb', import.meta.url).href,
  backbar_set: new URL('../models/backbar_set.glb', import.meta.url).href,
};
export function preloadModels(
  names = [
    'atm',
    'wall_clock',
    'plant_ficus',
    'plant_palm',
    'bin_commercial',
    ...Object.keys(LOCAL),
  ],
) {
  if (started) return started;
  const gl = new GLTFLoader();
  started = Promise.all([
    loadModelProducts().catch(() => {}),
    ...names.map(async (n) => {
      try {
        const s = (await gl.loadAsync(LOCAL[n] || BASE + n + '.glb')).scene;
        s.updateMatrixWorld(true);
        const parts = [];
        s.traverse((o) => {
          if (o.isMesh) {
            const g = o.geometry.clone();
            g.applyMatrix4(o.matrixWorld);
            if (o.material.map) o.material.map.anisotropy = 8;
            if (o.material.metalness > 0.6) o.material.metalness = 0.6;
            parts.push({ geometry: g, material: o.material });
          }
        });
        cache.set(n, parts);
      } catch (e) {
        console.warn('[interiors] model missing', n, e?.message);
      }
    }),
  ]).then(() => {
    done = true;
  });
  return started;
}
// add a loaded model at (x, z) facing ry in the current G frame; false when it has not loaded (caller draws its fallback)
export function libModel(ctx, name, x, z, ry, y = 0, sc = 1, rx = 0, rz = 0) {
  const parts = cache.get(name);
  if (!parts) return false;
  const m =
    rx || rz
      ? new THREE.Matrix4()
          .makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'))
          .setPosition(x, y, z)
      : new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  if (sc !== 1) m.multiply(new THREE.Matrix4().makeScale(sc, sc, sc));
  for (const p of parts) ctx.G.add(ctx.M.adopt(p.material), p.geometry, m);
  return true;
}
// builds wait for the files (a missing file still ends the wait: done is set either way)
export const modelsReady = () => done || !started;

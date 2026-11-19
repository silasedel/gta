// Everglades r7: GLB loading for the glades module (one load per file, shared materials, shadows on).
// Files: public/assets/models/everglades/* (tools/v2/everglades/build_models.sh), plus the docks / keys / buildings sets.
import * as THREE from 'three';

const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
const cache = new Map();
let loaderP = null;
const loader = () =>
  loaderP ||
  (loaderP = import('three/addons/loaders/GLTFLoader.js').then(
    ({ GLTFLoader }) => new GLTFLoader(),
  ));

// path relative to assets/models/ ('everglades/gator_a.glb'); opts.fix(scene) runs once after load
export function loadModel(path, opts = {}) {
  let p = cache.get(path);
  if (!p) {
    p = loader()
      .then((l) => l.loadAsync(BASE + 'assets/models/' + path))
      .then((g) => {
        const s = g.scene;
        s.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = opts.shadow !== false;
            o.receiveShadow = true;
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of ms)
              if (m) {
                m.side = m.side ?? THREE.FrontSide;
                if (m.map) m.map.anisotropy = 4;
              }
          }
        });
        if (opts.fix) opts.fix(s);
        s.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(s);
        s.userData.box = box;
        return s;
      })
      .catch((e) => {
        console.warn('[everglades] model', path, e);
        return null;
      });
    cache.set(path, p);
  }
  return p;
}

// flat list of { geometry, material, matrix } of a loaded scene (for InstancedMesh pools); the matrix is the node's
// transform relative to the scene root
export function partsOf(scene, pre = null) {
  const out = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.matrixWorld.clone();
    if (pre) m.premultiply(pre);
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    if (ms.length === 1) out.push({ geometry: o.geometry, material: ms[0], matrix: m });
    else
      for (const gr of o.geometry.groups) {
        const g = o.geometry.clone();
        g.clearGroups();
        g.setIndex(Array.from(o.geometry.index.array.slice(gr.start, gr.start + gr.count)));
        out.push({ geometry: g, material: ms[gr.materialIndex], matrix: m });
      }
  });
  return out;
}

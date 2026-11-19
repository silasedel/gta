// r4-library (Nov 18): the user's library props for code that used to build them from boxes (storefront ATMs, police
// roadblocks, beach umbrellas, NPC caps, Keys picnic tables). Files: public/assets/models/street/*.glb, built by
// tools/v2/street-models/build_props.sh (origin on the ground, front = +Z, meters, 1K textures).
//   preloadLib(['atm', ...])           start loading (once per name)
//   libGet(name)                       { parts: [{ geometry, material }], box } once loaded, else null (sync)
//   libClone(name)                     a Group of meshes sharing the template geometry / material, or null
//   libSwap(group, name, opts)         the group keeps its code-built children until the model has loaded, then shows the model
//   libInstancer(parent, name)         add(matrix) now, one InstancedMesh per part once loaded; onMissing(fn) for the fallback
// ?libprops=0 = every caller keeps its code-built prop.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE =
  ((typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/') +
  'assets/models/street/';
export const LIB_OFF = typeof location !== 'undefined' && /[?&]libprops=0/.test(location.search);
const cache = new Map(),
  pending = new Map();
let gl = null;

export function preloadLib(names) {
  if (LIB_OFF) return Promise.resolve(false);
  return Promise.all(
    [].concat(names).map((n) => {
      if (pending.has(n)) return pending.get(n);
      gl ||= new GLTFLoader();
      const p = gl
        .loadAsync(BASE + n + '.glb')
        .then((g) => {
          g.scene.updateMatrixWorld(true);
          const parts = [],
            box = new THREE.Box3();
          g.scene.traverse((o) => {
            if (!o.isMesh) return;
            const geo = o.geometry.clone();
            geo.applyMatrix4(o.matrixWorld);
            geo.computeBoundingBox();
            geo.computeBoundingSphere();
            box.union(geo.boundingBox);
            const m = o.material;
            if (m.map) m.map.anisotropy = 4;
            if (m.metalness > 0.6) m.metalness = 0.6; // ART_STYLE: no mirror-metal props without an env probe
            parts.push({ geometry: geo, material: m });
          });
          cache.set(n, { parts, box });
          return true;
        })
        .catch((e) => {
          console.warn('[libprops] model missing, code-built kept:', n, e?.message);
          return false;
        });
      pending.set(n, p);
      return p;
    }),
  );
}
export const libGet = (n) => cache.get(n) || null;
export const libLoaded = (n) => pending.get(n) || preloadLib([n]).then((a) => a[0]);

export function libClone(n, { shadow = true, receive = true } = {}) {
  const t = cache.get(n);
  if (!t) return null;
  const g = new THREE.Group();
  g.name = 'lib-' + n;
  for (const p of t.parts) {
    const m = new THREE.Mesh(p.geometry, p.material);
    m.castShadow = shadow;
    m.receiveShadow = receive;
    g.add(m);
  }
  return g;
}

// keep `group`'s code-built children until the model arrives, then replace them (scale / offset applied to the model only)
export function libSwap(group, n, { scale = 1, y = 0, ry = 0, onSwap } = {}) {
  const put = () => {
    const c = libClone(n);
    if (!c) return false;
    for (const ch of [...group.children]) if (!ch.userData.keepOnSwap) group.remove(ch);
    c.scale.setScalar(scale);
    c.position.y = y;
    c.rotation.y = ry;
    group.add(c);
    group.userData.lib = n;
    onSwap && onSwap(group, c);
    return true;
  };
  if (LIB_OFF) return group;
  if (!put())
    libLoaded(n).then((ok) => {
      if (ok) put();
    });
  return group;
}

// repeated props: matrices collected now, drawn as instanced meshes when the model is in; fallback(matrix) per item if missing
export function libInstancer(parent, n, { shadow = true } = {}) {
  const mats = [];
  let missing = null,
    built = null;
  const build = () => {
    const t = cache.get(n);
    if (!t || !mats.length) return;
    built = t.parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geometry, p.material, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.name = 'lib-' + n;
      parent.add(im);
      return im;
    });
  };
  return {
    add(m) {
      mats.push(m.clone());
      return this;
    },
    onMissing(fn) {
      missing = fn;
      return this;
    },
    flush() {
      if (!mats.length) return;
      libLoaded(n).then((ok) => {
        if (ok) build();
        else if (missing) mats.forEach(missing);
      });
    },
    dispose() {
      if (built)
        for (const im of built) {
          parent.remove(im);
          im.dispose();
        }
      built = null;
    },
  };
}

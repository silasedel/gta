// Shared GLB loading for the airport (library models converted by tools/v2/buildings/convert_v2.sh and
// tools/v2/airport/convert.sh: meters, origin at the footprint center on the ground, front toward +Z).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { calibrate } from '../art/calibrate.js';

const BASE =
  ((typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/') + 'assets/models/';
const loader = new GLTFLoader();
const cache = new Map();
export function loadModel(path) {
  // 'buildings/control_tower' | 'airport/terminal_hall' ...
  if (!cache.has(path))
    cache.set(
      path,
      loader
        .loadAsync(BASE + path + '.glb')
        .then((g) => {
          g.scene.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = true;
            o.receiveShadow = true;
            for (const m of [].concat(o.material)) {
              if (m.map) m.map.anisotropy = 8;
              if (m.metalness > 0.7) m.metalness = 0.7;
              if (/glass|vitre|window|clear/i.test(m.name || '') && !m.map) {
                m.transparent = true;
                m.opacity = Math.min(m.opacity, 0.4);
                m.depthWrite = false;
                m.roughness = 0.06;
              } else if (/floor/i.test(m.name || '') && path.includes('terminal_hall')) {
                m.color.set(0xc8c0b2);
                m.roughness = 0.3;
                m.metalness = 0;
                m.map = null;
              } // the hall's black slab -> polished terrazzo
              if (path.endsWith('control_tower') || path.endsWith('control_tower_lod1')) {
                m.color.multiplyScalar(2.4);
                m.userData.artCal = { cls: 'tower-lift' };
              } // the source atlas is near black: light concrete / glass
              try {
                calibrate(m, {
                  hint: path,
                  fallback: path.startsWith('buildings/') ? 'building' : 'generic',
                });
              } catch (e) {
                /* */
              }
            }
          });
          return g.scene;
        })
        .catch((e) => {
          console.warn('[airport] model missing', path, e?.message || e);
          return null;
        }),
    );
  return cache.get(path);
}
// triangle soup of a collision GLB (all meshes, model frame) -> { vertices, indices } for a Rapier trimesh
const colCache = new Map();
export function loadCollision(path) {
  if (!colCache.has(path))
    colCache.set(
      path,
      loader
        .loadAsync(BASE + path + '.glb')
        .then((g) => {
          const V = [],
            I = [];
          g.scene.updateMatrixWorld(true);
          g.scene.traverse((o) => {
            if (!o.isMesh) return;
            const geo = o.geometry,
              p = geo.attributes.position,
              b = V.length / 3,
              v = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
              V.push(v.x, v.y, v.z);
            }
            if (geo.index) for (let i = 0; i < geo.index.count; i++) I.push(b + geo.index.getX(i));
            else for (let i = 0; i < p.count; i++) I.push(b + i);
          });
          return { vertices: new Float32Array(V), indices: new Uint32Array(I) };
        })
        .catch(() => null),
    );
  return colCache.get(path);
}
// place a fixed trimesh collider for a model instance (x, y, z, heading) on one shared fixed body
export function addTrimesh(world, RAPIER, body, col, x, y, z, heading, scale = 1) {
  if (!col || !col.indices.length) return null;
  const c = Math.cos(heading),
    s = Math.sin(heading),
    v = col.vertices,
    out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 3) {
    const lx = v[i] * scale,
      ly = v[i + 1] * scale,
      lz = v[i + 2] * scale;
    out[i] = x + lx * c + lz * s;
    out[i + 1] = y + ly;
    out[i + 2] = z - lx * s + lz * c;
  }
  try {
    return world.createCollider(RAPIER.ColliderDesc.trimesh(out, col.indices), body);
  } catch (e) {
    console.warn('[airport] trimesh', e);
    return null;
  }
}

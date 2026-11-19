// Vegetation registry: build(kind, opts) for every plant kind, plus instanced LOD fields (see field.js).
//   buildGeometry(kind, { seed, height, lod }) -> { bark, leaf, height, tris }   (raw geometries, shared materials)
//   build(kind, opts) -> { group, height, tris }                                 (ready-to-add meshes, casts shadows)
import * as THREE from 'three';
import { buildPalm, PALM_SPECIES } from './palms.js';
import { buildShrub, SHRUB_KINDS } from './shrubs.js';
import { buildTree, TREE_KINDS } from './trees.js';
import { sharedVegMaterials } from './materials.js';

export const KINDS = [...PALM_SPECIES, ...SHRUB_KINDS, ...TREE_KINDS];
export const KIND_TYPE = Object.fromEntries([
  ...PALM_SPECIES.map((k) => [k, 'palm']),
  ...SHRUB_KINDS.map((k) => [k, 'shrub']),
  ...TREE_KINDS.map((k) => [k, 'tree']),
]);

export function buildGeometry(kind, opts = {}) {
  const t = KIND_TYPE[kind];
  if (t === 'palm') {
    const p = buildPalm({ ...opts, species: kind });
    return { bark: p.trunk, leaf: p.fronds, height: p.height, tris: p.tris };
  }
  if (t === 'shrub') return buildShrub({ ...opts, kind });
  if (t === 'tree') return buildTree({ ...opts, kind });
  throw new Error('unknown vegetation kind ' + kind);
}

export function build(kind, opts = {}) {
  const g = buildGeometry(kind, opts),
    M = sharedVegMaterials(),
    group = new THREE.Group();
  group.name = 'veg_' + kind;
  if (g.bark && g.bark.index.count) {
    const m = new THREE.Mesh(g.bark, opts.barkMaterial || M.bark);
    m.castShadow = true;
    m.receiveShadow = true;
    m.customDepthMaterial = M.barkDepth;
    group.add(m);
  }
  if (g.leaf && g.leaf.index.count) {
    const m = new THREE.Mesh(g.leaf, opts.leafMaterial || M.leaf);
    m.castShadow = true;
    m.receiveShadow = true;
    m.customDepthMaterial = M.leafDepth;
    group.add(m);
  }
  return { group, height: g.height, tris: g.tris, geometry: g };
}

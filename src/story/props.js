// Mission prop library: GLBs built by tools/v2/mission/convert_props.py into
// public/assets/models/mission/ (see manifest.json for sizes, triangle counts and suggested use).
// Each prop is loaded once; callers get a clone that shares geometry and materials.
import { LOD } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'assets/models/mission/';
const loader = new GLTFLoader();
const cache = new Map();
let manifestPromise = null;

/** The manifest ({ props: { id: entry } }), fetched once. */
export function loadMissionManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(BASE + 'manifest.json').then((r) => r.json());
  }
  return manifestPromise;
}

function loadScene(file) {
  if (!cache.has(file)) {
    cache.set(
      file,
      loader.loadAsync(BASE + file).then((gltf) => gltf.scene),
    );
  }
  return cache.get(file);
}

/**
 * Returns a fresh clone of a mission prop (meters, y = 0 at its base, centered in x/z).
 * Props over 2 m come with a far LOD: pass { lod: true } to get a THREE.LOD instead.
 */
export async function loadMissionProp(id, { lod = false } = {}) {
  const manifest = await loadMissionManifest();
  const entry = manifest.props[id];
  if (!entry) {
    throw new Error(`Unknown mission prop: ${id}`);
  }
  const near = (await loadScene(entry.file)).clone(true);
  near.name = id;
  near.userData.missionProp = entry;
  if (!lod || !entry.lod1) {
    return near;
  }
  const far = (await loadScene(entry.lod1.file)).clone(true);
  const group = new LOD();
  group.name = id;
  group.userData.missionProp = entry;
  group.addLevel(near, 0);
  group.addLevel(far, entry.lod1.distance);
  return group;
}

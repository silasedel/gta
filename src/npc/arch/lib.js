// NPC archetype library (PEOPLE-LOOK track): loads the generated archetypes (public/assets/npc/arch/*.glb + atlases),
// prepares each one once (rig, LOD meshes, its own bound clip set, shared materials and textures) and hands out
// archetype bases for createNpc(). Loading is lazy and budgeted: archetypes are fetched when a place needs them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { buildClipsFor } from './anim.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
export const ROOT = BASE + 'assets/npc/';
export const normBone = (n) => n.replace(/^mixamorig[:_]?/, '');

let _loader = null;
function loader() {
  if (_loader) return _loader;
  _loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(BASE + 'assets/humans/draco/');
  _loader.setDRACOLoader(draco);
  return _loader;
}
const texCache = new Map();
/** drop a cached texture promise (the people library unloads people it no longer needs) */
export function forgetTex(url) {
  texCache.delete(url + '|s');
  texCache.delete(url + '|l');
}
/** cached texture: decoded off the main thread (ImageBitmap), no flip (glTF UV convention), sRGB for color maps */
export function loadTex(url, srgb = true, mips = true) {
  const key = url + (srgb ? '|s' : '|l');
  if (texCache.has(key)) return texCache.get(key);
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('npc texture ' + url + ' ' + res.status);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob, {
      imageOrientation: 'none',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    const t = new THREE.Texture(bmp);
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    t.generateMipmaps = mips;
    t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  })();
  texCache.set(key, p);
  p.catch(() => texCache.delete(key));
  return p;
}

let _index = null;
export async function loadIndex() {
  if (_index) return _index;
  _index = fetch(ROOT + 'arch/index.json')
    .then((r) => (r.ok ? r.json() : { archetypes: [] }))
    .catch(() => ({ archetypes: [] }));
  return _index;
}
const bases = new Map(),
  pending = new Map();
export const loadedBases = () => [...bases.values()];
export const getBase = (id) => bases.get(id) || null;
export const isLoading = (id) => pending.has(id);

/** load and prepare one archetype -> base { id, meta, scene, rig, clips, tex, shared } */
export function loadArchetype(id) {
  if (bases.has(id)) return Promise.resolve(bases.get(id));
  if (pending.has(id)) return pending.get(id);
  const p = (async () => {
    const idx = await loadIndex();
    const meta = idx.archetypes.find((a) => a.id === id);
    if (!meta) throw new Error('unknown archetype ' + id);
    const S = ROOT + 'shared/';
    const [gltf, a, n, hair, eye, brow, lash, shoe] = await Promise.all([
      loader().loadAsync(ROOT + 'arch/' + meta.file),
      loadTex(ROOT + 'arch/' + id + '_a.webp', true),
      loadTex(ROOT + 'arch/' + id + '_n.webp', false),
      meta.hair
        ? loadTex(S + 'hair_' + (meta.hair === 'bun' ? 'ponytail01' : meta.hair) + '.webp', true)
        : null,
      loadTex(S + 'eye_' + (meta.eyes || 'brown') + '.webp', true),
      loadTex(S + 'brow_' + meta.brows + '.webp', true),
      loadTex(S + 'lash_' + meta.lashes + '.webp', true),
      meta.shoes
        ? loadTex(
            S + 'shoe_' + (/^heels/.test(meta.shoes) ? 'dress_black' : meta.shoes) + '.webp',
            true,
          )
        : null,
    ]);
    const scene = gltf.scene;
    const bones = {};
    scene.traverse((o) => {
      if (o.isBone) bones[normBone(o.name)] = o;
    });
    const rig = { root: scene, bones };
    const meshes = {};
    scene.traverse((o) => {
      if (o.isMesh) meshes[o.name] = o;
    });
    const hipH = bones.Hips.getWorldPosition(new THREE.Vector3()).y;
    const t0 = performance.now();
    const clips = buildClipsFor(rig, hipH);
    const box = new THREE.Box3();
    scene.updateMatrixWorld(true);
    const lod0 = meshes.LOD0_body;
    lod0.geometry.computeBoundingBox();
    box.copy(lod0.geometry.boundingBox);
    const base = {
      id,
      meta,
      scene,
      rig,
      meshes,
      clips,
      hipH,
      height: meta.height || box.max.y - box.min.y,
      tex: { a, n },
      shared: { hair, eye, brow, lash, shoe },
      bindMs: Math.round(performance.now() - t0),
    };
    bases.set(id, base);
    pending.delete(id);
    return base;
  })();
  pending.set(id, p);
  p.catch((e) => {
    pending.delete(id);
    console.warn('[npc] archetype', id, e);
  });
  return p;
}

// ------------------------------------------------------------------ which archetypes fit a place
// ped zones (peds.js / people.v2.js) -> archetype place tags, in order of preference
export const PLACE_TAGS = {
  beach: ['beach', 'tourist', 'sport'],
  causeway: ['sport', 'street', 'tourist'],
  park: ['sport', 'street', 'tourist'],
  sport: ['sport', 'beach'],
  business: ['business', 'street', 'work'],
  downtown: ['business', 'street', 'work'],
  commercial: ['street', 'tourist', 'business'],
  nightlife: ['nightlife', 'street'],
  night: ['nightlife', 'street'],
  club: ['nightlife'],
  bar: ['bar', 'nightlife'],
  port: ['port', 'work'],
  industrial: ['work', 'port'],
  kitchen: ['kitchen'],
  work: ['work'],
  residential: ['street', 'tourist', 'sport', 'work'],
  casual: ['street', 'tourist', 'beach'],
  cop: ['police'],
  police: ['police'],
  bartender: ['bar'],
  server: ['bar', 'work'],
  barista: ['bar', 'work'],
  host: ['business', 'bar'],
  bouncer: ['security'],
  dj: ['nightlife'],
  guest: ['nightlife', 'street'],
  cook: ['kitchen'],
  gang_garzas: ['gang_garzas'],
  gang_lyric: ['gang_lyric'],
  gang_wolves: ['gang_wolves'],
  security: ['security'],
  tourist: ['tourist'],
  water: ['beach'],
};
export async function archetypesFor(zone) {
  const idx = await loadIndex();
  const tags = PLACE_TAGS[zone] || PLACE_TAGS.residential;
  return idx.archetypes.filter((a) => a.place.some((p) => tags.includes(p))).map((a) => a.id);
}
export function archetypesForSync(zone, idx) {
  const tags = PLACE_TAGS[zone] || PLACE_TAGS.residential;
  return (idx?.archetypes || []).filter((a) => a.place.some((p) => tags.includes(p)));
}

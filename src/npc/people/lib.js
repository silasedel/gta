// The user's people (PEOPLE helper, overnight Nov 17): ~98 Tripo / library people from Models/NPCs and Models/Characters,
// rigged by tools/v2/npcs/rig_person.py onto the game's 52-joint humanoid skeleton and exported to
// public/assets/npc/people/<id>.glb (+ <id>_a.webp albedo, <id>_n.webp normal, <id>_o.webp occlusion/roughness/metal,
// optional <id>_a2.webp 2K albedo for close-ups). index.json lists them with role / places / height.
// Every rig is exported in the canonical T-pose (arms exactly along +-X, legs straight down); at load the joints are
// re-based to identity world rotations, so ONE bound clip set (src/npc/arch/anim.js) fits every person: the clips are
// built once and shared (only the hips translation is rescaled per person), so loading a person costs a GLB parse +
// texture decode (off thread) and no per-person animation binding.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { buildClipsFor } from '../arch/anim.js';
import { loadTex, forgetTex } from '../arch/lib.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
export const PROOT = BASE + 'assets/npc/people/';
const normBone = (n) => n.replace(/^mixamorig[:_]?/, '');
const OWN_CLIPS = typeof location !== 'undefined' && /[?&]pclips=own/.test(location.search);

let _loader = null;
function loader() {
  if (_loader) return _loader;
  _loader = new GLTFLoader();
  const draco = new DRACOLoader(); draco.setDecoderPath(BASE + 'assets/humans/draco/'); _loader.setDRACOLoader(draco);
  return _loader;
}

let _index = null;
export function loadPeopleIndex() {
  if (_index) return _index;
  _index = fetch(PROOT + 'index.json').then((r) => (r.ok ? r.json() : { people: [] })).catch(() => ({ people: [] }));
  return _index;
}
const bases = new Map(), pending = new Map();
export const loadedPeople = () => [...bases.values()];
export const getPerson = (id) => bases.get(id) || null;
export const isLoadingPerson = (id) => pending.has(id);
export const loadingCount = () => pending.size;

// joints -> identity world rotations (positions kept), inverse bind matrices recomputed: the mesh is unchanged at
// rest and every person's rest frame is the canonical one
const _q = new THREE.Quaternion(), _p = new THREE.Vector3();
function canonicalize(scene) {
  scene.updateMatrixWorld(true);
  const bones = []; scene.traverse((o) => { if (o.isBone) bones.push(o); });
  const wp = new Map(bones.map((b) => [b, b.getWorldPosition(new THREE.Vector3())]));
  for (const b of bones) {            // traverse order = parents first
    b.parent.updateMatrixWorld(true);
    b.parent.getWorldQuaternion(_q); b.quaternion.copy(_q.invert());
    b.scale.set(1, 1, 1);
    b.position.copy(b.parent.worldToLocal(_p.copy(wp.get(b))));
    b.updateMatrixWorld(true);
  }
  scene.updateMatrixWorld(true);
  scene.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.calculateInverses(); o.skeleton.pose(); } });
}

// one clip set for everybody (built on the first person), hips translation rescaled by hip height
let REF = null;
function shareClips(ref, rig, hipH) {
  const k = hipH / ref.hipH;
  const hb = rig.bones.Hips; const r0 = ref.r0, b0 = hb.position;
  const out = {};
  for (const n in ref.clips) {
    const c = ref.clips[n];
    const tracks = c.tracks.map((tr) => {
      if (!tr.name.endsWith('.position')) return tr;
      const v = tr.values.slice();
      for (let i = 0; i < v.length; i += 3) { v[i] = b0.x + (v[i] - r0.x) * k; v[i + 1] = b0.y + (v[i + 1] - r0.y) * k; v[i + 2] = b0.z + (v[i + 2] - r0.z) * k; }
      return new THREE.VectorKeyframeTrack(tr.name, tr.times, v);
    });
    const nc = new THREE.AnimationClip(c.name, c.duration, tracks);
    nc.userData = { ...c.userData };
    if (nc.userData.speed) nc.userData.speed *= k;
    out[n] = nc;
  }
  return out;
}

// ------------------------------------------------------------------ material (one per person and tint variant)
const _mats = new Map();
export function personMaterial(base, variant = 0) {
  const key = base.id + ':' + variant;
  let m = _mats.get(key);
  if (m) return m;
  const t = base.tex;
  m = new THREE.MeshStandardMaterial({ name: 'personBody', map: t.a, normalMap: t.n || null, roughnessMap: t.o || null, metalnessMap: t.o || null,
    roughness: t.o ? 1 : 0.78, metalness: t.o ? 1 : 0, envMapIntensity: 0.85 });
  if (t.n) m.normalScale.set(0.8, 0.8);
  // matte skin, hair and cloth (user, Nov 17: never shiny): the scanned roughness is clamped, metal kept for buckles only
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = max(roughnessFactor, 0.62);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = min(metalnessFactor * 0.6, 0.35);');
  };
  m.customProgramCacheKey = () => 'personBody1';
  // per-spawn variation: small value / warmth shift on the whole person (clothes and skin stay plausible)
  if (variant) {
    const r = ((variant * 2654435761) >>> 0) / 4294967296;
    const v = 0.955 + r * 0.09, w = (((variant * 40503) % 97) / 97 - 0.5) * 0.05;
    m.color.setRGB(v * (1 + w), v, v * (1 - w));
  }
  m.userData.person = base.id; m.userData.shared = true;
  _mats.set(key, m);
  return m;
}
/** close-up texture level for a person: 0 = 1K albedo / 512 normal (crowd), 1 = 2K albedo, 2 = full 4K albedo + 2K normal */
const HI = { 1: { a: '_a2.webp' }, 2: { a: '_a4.webp', n: '_n2.webp' } };
export async function hiRes(base, level) {
  level = level === true ? 1 : level === false ? 0 : (level | 0);
  if (!base.meta.a2) level = 0;
  base.hiWant = level;
  const tex = base.tex;
  tex.hi ||= {};
  const get = async (key, srgb) => {
    if (!tex.hi[key]) { try { tex.hi[key] = await loadTex(PROOT + base.id + key, srgb); } catch (e) { tex.hi[key] = null; } }
    return tex.hi[key];
  };
  let a = tex.a, n = tex.n;
  if (level >= 1) a = (await get(HI[level].a, true)) || (level === 2 ? await get(HI[1].a, true) : null) || tex.a;
  if (level === 2) n = (await get(HI[2].n, false)) || tex.n;
  if (base.hiWant !== level || !bases.has(base.id)) return false;      // superseded while loading
  for (const [k, m] of _mats) if (k.startsWith(base.id + ':') && (m.map !== a || m.normalMap !== n)) { const re = !!m.normalMap !== !!n; m.map = a; m.normalMap = n; if (re) m.needsUpdate = true; }
  // release levels not in use
  for (const key of Object.keys(tex.hi)) {
    const t = tex.hi[key]; if (!t || t === a || t === n) continue;
    tex.hi[key] = null; forgetTex(PROOT + base.id + key); setTimeout(() => t.dispose(), 1500);
  }
  return true;
}

/** load and prepare one person -> base { id, person: true, meta, scene, rig, meshes, clips, hipH, height, tex, shared } */
export function loadPerson(id) {
  if (bases.has(id)) return Promise.resolve(bases.get(id));
  if (pending.has(id)) return pending.get(id);
  const p = (async () => {
    const idx = await loadPeopleIndex(); const meta = idx.people.find((a) => a.id === id);
    if (!meta) throw new Error('unknown person ' + id);
    const [gltf, a, n, o] = await Promise.all([
      loader().loadAsync(PROOT + meta.file),
      loadTex(PROOT + id + '_a.webp', true), meta.n === false ? null : loadTex(PROOT + id + '_n.webp', false).catch(() => null),
      meta.o === false ? null : loadTex(PROOT + id + '_o.webp', false).catch(() => null),
    ]);
    const scene = gltf.scene;
    canonicalize(scene);
    const bones = {}; scene.traverse((ob) => { if (ob.isBone) bones[normBone(ob.name)] = ob; });
    const rig = { root: scene, bones };
    const meshes = {}; scene.traverse((ob) => { if (ob.isMesh) meshes[ob.name] = ob; });
    const hipH = bones.Hips.getWorldPosition(new THREE.Vector3()).y;
    const t0 = performance.now();
    let clips;
    if (!REF || OWN_CLIPS) {
      clips = buildClipsFor(rig, hipH);
      if (!REF) REF = { clips, hipH, r0: bones.Hips.position.clone() };
    } else clips = shareClips(REF, rig, hipH);
    const m2 = {
      gender: meta.g, years: meta.years, race: meta.race || 'mixed', heels: meta.gait === 'heels', hair: '', hairColor: null,
      place: meta.places, poses: meta.poses || [], height: meta.height, role: meta.role, age: meta.age, a2: !!meta.a2, ...meta,
    };
    const base = { id, person: true, meta: m2, scene, rig, meshes, clips, hipH, height: meta.height, tex: { a, n, o, hi: {} }, shared: {}, bindMs: Math.round(performance.now() - t0) };
    bases.set(id, base); pending.delete(id);
    return base;
  })();
  pending.set(id, p);
  p.catch((e) => { pending.delete(id); console.warn('[people] person', id, e); });
  return p;
}

/** free a loaded person (no live instances may remain): geometry, textures, materials */
export function unloadPerson(id) {
  const b = bases.get(id); if (!b) return false;
  bases.delete(id);
  b.scene.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); if (o.isSkinnedMesh) { try { o.skeleton.dispose(); } catch (e) { /* */ } } });
  for (const [k, m] of _mats) if (k.startsWith(id + ':')) { m.dispose(); _mats.delete(k); }
  for (const t of [b.tex.a, b.tex.n, b.tex.o, ...Object.values(b.tex.hi || {})]) if (t && t.dispose) t.dispose();
  // loadTex caches by URL: drop them so a later reload fetches fresh textures
  forgetTex(PROOT + id + '_a.webp'); forgetTex(PROOT + id + '_n.webp'); forgetTex(PROOT + id + '_o.webp');
  return true;
}

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
  // user (Nov 18): NEVER the main character as an NPC. p56 "Man In Palm Print Shirt And Cargo Pants" is Nico's look; any entry
  // marked player / nico is dropped too. Filtering here covers the near cast, the far crowd, venues and mission stand-ins.
  const NOT_NPC = new Set(['p56']);
  const keep = (p) => p && !NOT_NPC.has(p.id) && !p.player && !/\bnico\b/i.test(String(p.name || '') + ' ' + String(p.role || ''));
  _index = fetch(PROOT + 'index.json').then((r) => (r.ok ? r.json() : { people: [] })).catch(() => ({ people: [] }))
    .then((j) => { if (Array.isArray(j?.people)) j.people = j.people.filter(keep); else if (Array.isArray(j)) return j.filter(keep); return j; });
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

// r3-people (user, Nov 17 PM: "generated people walk with their arms out"): about 60 of the Tripo people were generated
// with raised, palms-forward arms; the rigger straightened the arms onto +-X but kept the roll, so the clips (built for
// palms DOWN in the T-pose) hang their arms palms-forward with the elbow folding sideways. index.json armRoll {L, R}
// (degrees, measured offline by tools/v2/npcs/palm_survey.py -> palm_roll.py) rolls each arm's mesh about the arm axis
// back to palms down, by re-binding: the arm chain is posed by the roll, the posed mesh becomes the new rest (inverse
// bind matrices recomputed), bones back to identity world rotations. Shared clips and the far crowd bake pick it up.
// '?armroll=0' = off (A/B).
const ARM_ROLL = !(typeof location !== 'undefined' && /[?&]armroll=0/.test(location.search));
const ROLL_K = (typeof location !== 'undefined' && +(/[?&]armrollk=([-0-9.]+)/.exec(location.search) || [])[1]) || 1;   // debug: scale / flip the roll
const _m4 = new THREE.Matrix4(), _wp = new THREE.Vector3();
const ROLL_SPLIT = ((typeof location !== 'undefined' && (/[?&]rollsplit=([0-9.,]+)/.exec(location.search) || [])[1]) || '0.2,0.5,0.3').split(',').map(Number);   // debug A/B
function rollArms(scene, bones, roll) {
  if (!roll) return;
  for (const S of ['Left', 'Right']) {
    const deg = (+roll[S[0]] || 0) * ROLL_K; const top = bones[S + 'Arm'];
    if (!top || Math.abs(deg) < 1) continue;
    // split the roll down the chain like a real forearm twist (the scan's upper arm is mostly fine: sleeve patches stay
    // on the outside of the arm; the forearm / hand carry the supination): cumulative upper arm 20 %, forearm 70 %,
    // hand 100 %, so no single joint blend has to absorb the whole twist
    const fore = bones[S + 'ForeArm'], hand = bones[S + 'Hand'];
    const parts = fore && hand ? [[top, ROLL_SPLIT[0]], [fore, ROLL_SPLIT[1]], [hand, ROLL_SPLIT[2]]] : [[top, 1]];
    const chain = []; top.traverse((o) => { if (o.isBone) chain.push(o); });
    scene.updateMatrixWorld(true);
    const before = new Map(chain.map((b) => [b, b.matrixWorld.clone()]));
    // pose: roll about +X (the arm axis in the canonical rest); bones have identity world rotations here, so a local
    // rotation of the top bone is a world rotation, and the forearm's share is expressed in its parent's (rolled) frame
    for (const [b, k] of parts) b.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (deg * k * Math.PI) / 180);
    scene.updateMatrixWorld(true);
    const posed = new Map(chain.map((b) => [b, b.matrixWorld.clone()]));
    const wpos = new Map(chain.map((b) => [b, b.getWorldPosition(new THREE.Vector3())]));
    // back to identity world rotations at the posed joint positions
    for (const b of chain) {
      b.quaternion.identity();
      b.updateMatrixWorld(true);
      b.position.copy(b.parent.worldToLocal(_wp.copy(wpos.get(b))));
      b.updateMatrixWorld(true);
    }
    scene.updateMatrixWorld(true);
    // inverse bind: new = rest^-1 * posed * old (the posed mesh is the new rest). The LODs share one skin, so the same
    // Matrix4 objects can sit in several skeletons: update each matrix once
    const done = new Set();
    scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const sk = o.skeleton;
      sk.bones.forEach((b, i) => {
        const inv = sk.boneInverses[i];
        if (!before.has(b) || done.has(inv)) return;
        done.add(inv);
        _m4.copy(b.matrixWorld).invert().multiply(posed.get(b));
        inv.premultiply(_m4);
      });
    });
  }
  // (no skeleton.pose(): the rolled bones' inverse binds are not plain inverses of their rest matrices any more)
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
  if (t.n) m.normalScale.set(0.8, -0.8); // y < 0: glTF UVs (flipY false), no tangents in the GLBs (GLTFLoader's own flip)
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
// perf (Nov 19): the close-up level uses the 2K albedo too: one 4K upload (+ mips) was a 230 ms frame, and a person fills at
// most ~800 px of the 1898 px Retina height, which 2K covers (?people4k=1 = the 4K albedo)
const HI = { 1: { a: '_a2.webp' }, 2: { a: (typeof location !== 'undefined' && /[?&]people4k=1\b/.test(location.search)) ? '_a4.webp' : '_a2.webp', n: '_n2.webp' } };
// r7 (interiors agent: 165 ms frames on walk-in): a new close-up texture is uploaded on its own (renderer.initTexture)
// before any material shows it, so the upload is not added to the first frame that draws the person
let HI_R = null;
export function setHiRenderer(r) { HI_R = r || null; }
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
  if (HI_R) { for (const t of [a, n]) if (t && !t.userData.up) { try { HI_R.initTexture(t); } catch (e) { /* */ } t.userData.up = true; await new Promise((r) => requestAnimationFrame(r)); } }
  if (base.hiWant !== level || !bases.has(base.id)) return false;
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
    if (ARM_ROLL && meta.armRoll) { try { rollArms(scene, bones, meta.armRoll); } catch (e) { console.warn('[people] arm roll', id, e); } }
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

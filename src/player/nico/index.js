// Port Solana V2 — Nico, the protagonist (CHARACTER track). Loads the model built by src/player/pipeline/nico_build.py and
// turns a characterModel.js character (skeleton + animation state machine) into Nico: skin / eye / hair materials, mesh LODs,
// facial animation (blink, gaze, expressions, speech), body change morphs, skin states, hand IK (reachTo / holdItem), wardrobe.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeSkinState, makeSkinMaterial, makeEyeMaterial, makeLashMaterial, makeMouthMaterial, makeHairShellMaterial, tex, texturesReady } from './materials.js';
import { createFace } from './face.js';
import { createArmIK } from './ik.js';
import { createOutfit, preloadWardrobe } from '../wardrobe/outfit.js';

const DIR = '/assets/characters/nico/';
let ASSETS = null;
export const NICO_LOD = { d0: 3.6, d1: 16, d2: 42 };           // camera distances for mesh LOD 0/1/2/3 (hysteresis 12 %)

export function preloadNico() {
  if (ASSETS) return ASSETS;
  ASSETS = (async () => {
    const [gltf, meta] = await Promise.all([new GLTFLoader().loadAsync(DIR + 'nico.glb'), fetch(DIR + 'nico_meta.json').then((r) => r.json())]);
    // drop all-zero morph targets per primitive (the body primitive carries no facial units): saves most of the morph texture
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry.morphAttributes.position) return;
      const g = o.geometry, pos = g.morphAttributes.position, nrm = g.morphAttributes.normal, keep = [];
      pos.forEach((a, i) => { const arr = a.array; let nz = false; for (let k = 0; k < arr.length; k += 7) if (arr[k] !== 0) { nz = true; break; } if (!nz) for (let k = 0; k < arr.length; k++) if (Math.abs(arr[k]) > 1e-6) { nz = true; break; } if (nz) keep.push(i); });
      const names = Object.keys(o.morphTargetDictionary).sort((a, b) => o.morphTargetDictionary[a] - o.morphTargetDictionary[b]);
      g.morphAttributes.position = keep.map((i) => pos[i]); if (nrm) g.morphAttributes.normal = keep.map((i) => nrm[i]);
      o.morphTargetDictionary = {}; keep.forEach((i, k) => { o.morphTargetDictionary[names[i]] = k; });
      o.morphTargetInfluences = keep.map(() => 0);
      o.userData.morphDict = o.morphTargetDictionary;
    });
    // hair mask (scalp + length) as pixels, to cut the scalp out of the head mesh for the shells
    const hairMask = await new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, 512, 512); res(x.getImageData(0, 0, 512, 512).data); }; im.onerror = () => res(null); im.src = DIR + 'tex/head_hair.webp'; });
    gltf.scene.traverse((o) => {
      if (!o.isMesh || o.material?.name !== 'skin_head' || !hairMask) return;
      const g = o.geometry, uv = g.attributes.uv, idx = g.index.array, on = new Uint8Array(uv.count), out = [];
      for (let i = 0; i < uv.count; i++) { const x = Math.min(511, Math.max(0, Math.floor(uv.getX(i) * 512))), y = Math.min(511, Math.max(0, Math.floor(uv.getY(i) * 512))); on[i] = hairMask[(y * 512 + x) * 4] > 40 ? 1 : 0; }
      for (let t = 0; t < idx.length; t += 3) if (on[idx[t]] || on[idx[t + 1]] || on[idx[t + 2]]) out.push(idx[t], idx[t + 1], idx[t + 2]);
      const sg = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) sg.setAttribute(k, g.attributes[k]);
      sg.setIndex(out); sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.7, 0), 0.4); sg.boundingBox = new THREE.Box3(new THREE.Vector3(-0.3, 1.4, -0.3), new THREE.Vector3(0.3, 2, 0.3));
      g.userData.scalpGeo = sg;
    });
    // request every texture now so they stream in behind the loading screen
    const st = makeSkinState(); ['head', 'body', 'far'].forEach((k) => makeSkinMaterial(k, st)); makeEyeMaterial(0.015); makeLashMaterial(); makeMouthMaterial('teeth', { value: 0 }); makeMouthMaterial('tongue', { value: 0 });
    tex('head_hair.webp');
    await preloadWardrobe().catch((e) => console.warn('[nico] wardrobe preload failed', e));
    return { gltf, meta };
  })();
  return ASSETS;
}
export { texturesReady };

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

// Called by characterModel.createCharacter for the player variant, after the generic character exists.
export function decorateNico(character, { game, model, assets, opts = {} }) {
  const meta = assets.meta;
  const skin = makeSkinState();
  const hairState = { uHairLen: { value: 0.034 }, uHairC: { value: new THREE.Color(0x1c130d) }, uComb: { value: new THREE.Vector3(0.35, 0.05, 0.55) }, uWet: skin.uWet };
  const mouth = { value: 0 };
  const mats = { skin_head: makeSkinMaterial('head', skin), skin_body: makeSkinMaterial('body', skin), skin_far: makeSkinMaterial('far', skin),
    lashes: makeLashMaterial(), teeth: makeMouthMaterial('teeth', mouth), tongue: makeMouthMaterial('tongue', mouth) };
  const lod = [[], [], [], []]; const faceMeshes = []; const bodyMeshes = []; const eyes = {}; const shells = [[], []];
  const lodOf = (o) => { const m = /LOD(\d)/.exec(o.name) || /LOD(\d)/.exec(o.parent?.name || ''); return m ? +m[1] : -1; };
  const all = []; model.traverse((o) => { if (o.isMesh) all.push(o); });
  for (const o of all) {
    const nm = o.material?.name; const L = lodOf(o);
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    if (o.userData.morphDict) o.morphTargetDictionary = o.userData.morphDict;
    if (nm === 'eye') {
      const side = /EyeL/.test(o.name) ? 'L' : 'R';
      o.material = makeEyeMaterial(meta.eyes[side].radius); o.material.userData.u.uSide.value = side === 'L' ? 1 : -1;
      o.castShadow = false; eyes[side] = o; lod[0].push(o); lod[1].push(o); continue;
    }
    if (nm === 'brows') { o.visible = false; o.userData.off = true; continue; }       // brows are painted into the head maps (with the scar)
    if (mats[nm]) o.material = mats[nm];
    if (nm === 'lashes') { o.castShadow = false; o.renderOrder = 3; }
    if (L >= 0) { lod[L].push(o); if (L < 2) { bodyMeshes.push(o); if (nm === 'skin_head') faceMeshes.push(o); } else bodyMeshes.push(o); }
    else { lod[0].push(o); lod[1].push(o); if (o.morphTargetDictionary) faceMeshes.push(o); }
    // hair shells on the head primitive of LOD0 / LOD1
    if (nm === 'skin_head' && o.geometry.userData.scalpGeo && L < 2) {
      const n = L === 0 ? 22 : 12;
      for (let i = 0; i < n; i++) {
        const sm = new THREE.SkinnedMesh(o.geometry.userData.scalpGeo, makeHairShellMaterial(i, n, hairState));
        sm.name = 'NicoHairShell'; sm.bind(o.skeleton, o.bindMatrix); sm.frustumCulled = false; sm.castShadow = i === Math.floor(n * 0.6); sm.receiveShadow = true;
        o.parent.add(sm); shells[L].push(sm); lod[L].push(sm);
      }
    }
  }
  const bone = (n) => model.getObjectByName(n) || model.getObjectByName('mixamorig' + n);
  const face = createFace({ model, meta, faceMeshes, eyes, bone, mouth, skin });
  const outfit = createOutfit({ character, model, bone, skin, meta, game });

  // ---- mesh LOD by camera distance
  let cur = -1; let hat = false;
  const setMeshLOD = (L) => {
    if (L === cur) return; cur = L;
    lod.forEach((arr, i) => arr.forEach((o) => { if (!lod[L].includes(o)) o.visible = false; }));
    lod[L].forEach((o) => { o.visible = !o.userData.off; });
    shells.forEach((arr) => arr.forEach((s) => { if (hat) s.visible = false; }));
    outfit.setLOD(L);
  };
  setMeshLOD(opts.meshLOD ?? 1);

  // ---- body change (BIG_UPDATE 0a): subtle, capped
  const body = { fat: 0.5, muscle: 0.3 };
  const applyBody = () => {
    const f = THREE.MathUtils.clamp(body.fat, 0, 1), mu = THREE.MathUtils.clamp(body.muscle, 0, 1);
    const w = { fat: Math.max(0, (f - 0.5) * 2) * 0.85, thin: Math.max(0, (0.5 - f) * 2) * 0.7, muscle: mu * 0.8 };
    for (const o of bodyMeshes) for (const k in w) { const i = o.morphTargetDictionary?.[k]; if (i !== undefined) o.morphTargetInfluences[i] = w[k]; }
    outfit.setBody(w);
  };
  applyBody();

  // ---- arms: IK reach / hold
  const ik = { right: createArmIK(model, bone, 'Right'), left: createArmIK(model, bone, 'Left') };
  const baseUpdate = character.update;
  let lodT = 0; const camP = new THREE.Vector3();
  character.update = (dt, anim = {}) => {
    baseUpdate(dt, anim);
    // forearm roll bones take half of the hand's twist (no candy-wrapper wrists)
    for (const s of ['Left', 'Right']) { const h = bone(s + 'Hand'), r = bone(s + 'ForeArmRoll'); if (h && r) { _q.copy(h.quaternion); _q.x = 0; _q.z = 0; _q.normalize(); r.quaternion.slerpQuaternions(_q2.identity(), _q, 0.5); } }
    ik.right.update(dt); ik.left.update(dt);
    const lookT = ik.right.active ? ik.right.target : ik.left.active ? ik.left.target : (anim.lookAt || null);
    face.update(dt, { lookAt: face.lookTarget || lookT, dead: !!anim.dead, speaking: anim.speaking, swimming: !!anim.swimming, effort: anim.sprint ? 1 : 0 });
    outfit.update(dt, anim);
    // skin states: wet while swimming / in rain, dries off; sweat after sprinting in the sun
    const s = character.skin; const env = game?.env || {};
    const rain = game?.weather?.rain ?? env.rain ?? 0;
    const wetTarget = anim.swimming || anim.underwater ? 1 : anim.wading ? 0.45 : Math.min(1, rain * 0.9);
    s.wetness += (wetTarget - s.wetness) * Math.min(1, dt * (wetTarget > s.wetness ? 1.6 : 0.035));
    s.sweat += ((anim.sprint ? 1 : 0) * 0.9 - s.sweat) * Math.min(1, dt * (anim.sprint ? 0.05 : 0.02));
    skin.uWet.value = s.wetness; skin.uSweat.value = Math.max(s.sweat, s.wetness * 0.5); skin.uBurn.value = s.sunburn; skin.uTan.value = s.tan; skin.uFlush.value = Math.max(s.flush, s.sweat * 0.5);
    outfit.setWet(s.wetness);
    // mesh LOD
    if (opts.meshLOD === undefined && game?.camera && (lodT -= dt) <= 0) {
      lodT = 0.25; const d = game.camera.getWorldPosition(camP).distanceTo(character.root.getWorldPosition(_v)) * (game.camera.fov ? Math.tan(THREE.MathUtils.degToRad(game.camera.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(25)) : 1);
      const h = (x, up) => x * (up ? 1.12 : 1);
      let L = cur < 0 ? 1 : cur;
      if (d < NICO_LOD.d0) L = 0; else if (d < h(NICO_LOD.d0, cur === 0)) L = cur === 0 ? 0 : 1; else if (d < NICO_LOD.d1) L = 1; else if (d < h(NICO_LOD.d1, cur <= 1)) L = Math.max(1, Math.min(cur, 2)); else if (d < NICO_LOD.d2) L = 2; else L = d < h(NICO_LOD.d2, cur <= 2) && cur === 2 ? 2 : 3;
      setMeshLOD(L);
    }
  };

  Object.assign(character, {
    isNico: true, base: 'nico', meta, face, outfit,
    skin: { wetness: 0, sweat: 0, sunburn: 0, tan: 0.15, flush: 0, state: skin },
    body: { get fat() { return body.fat; }, set fat(v) { body.fat = v; applyBody(); }, get muscle() { return body.muscle; }, set muscle(v) { body.muscle = v; applyBody(); }, set(o) { Object.assign(body, o); applyBody(); } },
    setMeshLOD(L) { opts.meshLOD = L; setMeshLOD(L); }, autoLOD() { opts.meshLOD = undefined; }, get meshLOD() { return cur; },
    setHairHidden(b) { hat = b; shells.forEach((arr, L) => arr.forEach((s) => { s.visible = !b && L === cur; })); },
    hair: hairState,
    lookAt(p) { face.lookTarget = p || null; },
    // Hand IK to an exact world point. Resolves when the hand is there. { hand: 'right'|'left'|'auto', duration, hold }
    reachTo(point, o = {}) {
      if (!point) { ik.right.release(); ik.left.release(); return Promise.resolve(); }
      let hand = o.hand || 'auto';
      if (hand === 'auto') { const loc = _v.copy(point); character.root.worldToLocal(loc); hand = loc.x > 0.03 ? 'left' : 'right'; }     // +X is the character's left
      return ik[hand].reach(point, o);
    },
    // Put an object in the hand with a matching grip. holdItem(null) lets go. { hand, grip: 'cylinder'|'pinch'|'flat'|'phone'|'fist', radius, offset, rotation }
    holdItem(obj, o = {}) {
      const hand = o.hand || (ik.left.held && !obj ? 'left' : 'right');
      if (!obj) { ik.right.hold(null); ik.left.hold(null); return; }
      ik[hand].hold(obj, o);
    },
    releaseReach() { ik.right.release(); ik.left.release(); },
    ik,
  });
  return character;
}

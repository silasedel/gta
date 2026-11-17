// Southline — Nico from the user's own main-character model (Models/Main Character 1, Tripo FBX), rigged by
// tools/v2/player/build.sh onto the game's Mixamo-named skeleton. characterModel.js retargets every clip onto it at load
// (same path as the pipeline Nico), so locomotion, procedural clips, ragdoll, weapons, driving and sitting all work.
// This file turns the generic character into Nico: hero materials (4K albedo, normal, matte roughness), mesh LOD,
// relaxed stance, hand IK, foot IK on slopes / steps, wet skin, light body change, and a fail-safe wardrobe.
// Roll back to the pipeline Nico with ?nico=old (NICO_MODEL below).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createArmIK } from '../nico/ik.js';
import { createRelaxedPose } from '../nico/pose.js';
import { createBakedOutfit } from './outfit.js';
import { createFootIK } from './footIK.js';

const DIR = '/assets/characters/nico_tripo/';
export const NICO_MODEL = (() => {
  try { const q = new URLSearchParams(location.search).get('nico'); return q === 'old' ? 'old' : 'tripo'; } catch (e) { return 'tripo'; }
})();
export const TRIPO_LOD = { d0: 14, d1: 40 };        // camera distance (m, at a 25 deg half-fov) for LOD 0 / 1 / 2, 12 % hysteresis

let ASSETS = null;
function loadTex(file, srgb) {
  return new THREE.TextureLoader().loadAsync(DIR + file).then((t) => {
    t.flipY = false;                                   // glTF UV convention (the GLB comes from Blender's glTF exporter)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    return t;
  });
}
export function preloadNicoTripo() {
  if (ASSETS) return ASSETS;
  ASSETS = (async () => {
    const [gltf, meta, map, normalMap, orm, mask] = await Promise.all([
      new GLTFLoader().loadAsync(DIR + 'nico_tripo.glb'),
      fetch(DIR + 'nico_tripo.json').then((r) => r.json()),
      loadTex('albedo.webp', true), loadTex('normal.webp', false), loadTex('orm.webp', false),
      loadTex('regions.webp', false).catch(() => null),
    ]);
    return { gltf, meta, tex: { map, normalMap, orm, mask } };
  })();
  return ASSETS;
}

// one hero material: albedo + tangent-space normal + matte roughness (G of the ORM map), no metal. Wetness darkens and
// glosses it; the wardrobe region mask (R = shirt, G = pants, B = shoes) lets outfits recolor the baked clothes.
function makeMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({
    name: 'nicoTripo', map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(1, 1),
    roughnessMap: tex.orm, roughness: 1, metalness: 0, envMapIntensity: 0.85,
  });
  const u = {
    uWet: { value: 0 },
    uTint: { value: [new THREE.Vector4(1, 1, 1, 0), new THREE.Vector4(1, 1, 1, 0), new THREE.Vector4(1, 1, 1, 0)] },   // rgb + amount per region
    uMask: { value: tex.mask },
  };
  m.userData.u = u;
  m.customProgramCacheKey = () => 'nicoTripo' + (tex.mask ? 'M' : '');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWet; uniform vec4 uTint[3];${tex.mask ? '\nuniform sampler2D uMask;' : ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
${tex.mask ? `{
  vec3 rg = texture2D(uMask, vMapUv).rgb;
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  for (int i = 0; i < 3; i++) {
    float k = rg[i] * uTint[i].a;
    // keep the baked shading and fabric detail (luminance), swap the hue: lum * tint, normalized to the tint's own lum
    vec3 tinted = uTint[i].rgb * (lum / max(0.08, dot(uTint[i].rgb, vec3(0.299, 0.587, 0.114)))) * mix(0.55, 1.0, dot(uTint[i].rgb, vec3(0.299, 0.587, 0.114)));
    diffuseColor.rgb = mix(diffuseColor.rgb, tinted, k);
  }
}` : ''}
diffuseColor.rgb *= 1.0 - 0.28 * uWet;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, uWet);`);
  };
  return m;
}

const _v = new THREE.Vector3(), _cam = new THREE.Vector3();

// Called by characterModel.createCharacter for the player variant (base.tripo), after the generic character exists.
export function decorateNicoTripo(character, { game, model, assets, opts = {} }) {
  const mat = makeMaterial(assets.tex);
  const lod = [[], [], []];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = /LOD(\d)/.exec(o.name) || /LOD(\d)/.exec(o.parent?.name || '');
    const L = m ? Math.min(2, +m[1]) : 0;
    o.material = mat; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    o.userData.noDetailCull = true;
    lod[L].push(o);
  });
  const bone = (n) => model.getObjectByName(n) || model.getObjectByName('mixamorig' + n) || model.getObjectByName('mixamorig:' + n);
  let cur = -1;
  const setMeshLOD = (L) => { if (L === cur) return; cur = L; lod.forEach((arr, i) => arr.forEach((o) => { o.visible = i === L; })); };
  setMeshLOD(opts.meshLOD ?? 0);

  const outfit = createBakedOutfit({ character, game, material: mat });
  const ik = { right: createArmIK(model, bone, 'Right'), left: createArmIK(model, bone, 'Left') };
  const relaxed = createRelaxedPose({ model, bone, character, proportions: false, keepLegs: true });
  const feet = createFootIK({ game, model, bone, root: character.root, mesh: lod[0][0] || null });

  // body change (game.player.body): subtle and capped, through bone scale (no morph targets on a scanned body)
  const body = { fat: 0.5, muscle: 0.8 };
  const applyBody = () => {
    const f = THREE.MathUtils.clamp(body.fat, 0, 1), mu = THREE.MathUtils.clamp(body.muscle, 0, 1);
    const belly = 1 + (f - 0.5) * 0.12, chest = 1 + (f - 0.5) * 0.06 + (mu - 0.8) * 0.08, limb = 1 + (f - 0.5) * 0.06 + (mu - 0.8) * 0.06;
    const sp = bone('Spine'), s1 = bone('Spine1'), s2 = bone('Spine2');
    if (sp) sp.scale.set(belly, 1, belly);
    if (s1) s1.scale.set(chest / belly, 1, chest / belly);
    if (s2) s2.scale.set(1 / chest, 1, 1 / chest);                    // the shoulders / neck / head keep their size
    for (const s of ['Left', 'Right']) {
      const a = bone(s + 'Arm'), fa = bone(s + 'ForeArm'), ul = bone(s + 'UpLeg'), lg = bone(s + 'Leg');
      if (a) a.scale.set(limb, 1, limb); if (fa) fa.scale.set(1 / limb, 1, 1 / limb);
      if (ul) ul.scale.set(limb, 1, limb); if (lg) lg.scale.set(1 / limb, 1, 1 / limb);
    }
  };
  applyBody();

  const skin = { wetness: 0, sweat: 0, sunburn: 0, tan: 0.7, flush: 0, wetLine: 0 };
  let lookTarget = null, lodT = 0;
  const baseUpdate = character.update;
  // The mixer only writes a bone when its animated value changed since the last frame (three's PropertyMixer), so on a
  // still pose the layers below (relaxed stance, hand IK, foot IK) would find last frame's result and add to it again
  // (a leg folding up over a few seconds), and so would gunHold / scripts that pose bones later in the frame. Every bone
  // goes back to last frame's animated value first; the mixer then overwrites the ones whose animation moved.
  const allBones = []; model.traverse((o) => { if (o.isBone) allBones.push(o); });
  const preQ = allBones.map((b) => b.quaternion.clone()), preP = allBones.map((b) => b.position.clone());
  character.update = (dt, anim = {}) => {
    if (character.__ragdoll) return;         // src/player/ragdoll.v2.js: the ragdoll bodies drive the bones
    if (lookTarget && !anim.lookAt) anim = Object.assign({}, anim, { lookAt: lookTarget });
    for (let i = 0; i < allBones.length; i++) { allBones[i].quaternion.copy(preQ[i]); allBones[i].position.copy(preP[i]); }
    baseUpdate(dt, anim);
    for (let i = 0; i < allBones.length; i++) { preQ[i].copy(allBones[i].quaternion); preP[i].copy(allBones[i].position); }
    try { relaxed.update(dt, anim); } catch (e) { /* cosmetic layer */ }
    ik.right.update(dt); ik.left.update(dt);
    try { feet.update(dt, anim); } catch (e) { /* cosmetic layer */ }
    // wet skin and clothes: soaked in the water / rain, dries off over about a minute and a half
    const rain = game?.weather?.rain ?? game?.env?.rain ?? 0;
    const feetY = game?.player?.position?.y ?? character.root.position.y;
    const inWater = anim.swimming || anim.underwater || anim.wading || (-0.12 - feetY) > 0.05;
    const wetT = inWater ? 1 : Math.min(1, rain * 0.9);
    skin.wetness += (wetT - skin.wetness) * Math.min(1, dt * (wetT > skin.wetness ? 1.6 : 0.03));
    mat.userData.u.uWet.value = skin.wetness;
    if (opts.meshLOD === undefined && game?.camera && (lodT -= dt) <= 0) {
      lodT = 0.25;
      const fovK = game.camera.fov ? Math.tan(THREE.MathUtils.degToRad(game.camera.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(25)) : 1;
      const d = game.camera.getWorldPosition(_cam).distanceTo(character.root.getWorldPosition(_v)) * fovK;
      const up = (x, L) => x * (cur <= L ? 1.12 : 1);
      setMeshLOD(d < up(TRIPO_LOD.d0, 0) ? 0 : d < up(TRIPO_LOD.d1, 1) ? 1 : 2);
    }
  };

  Object.assign(character, {
    isNico: true, base: 'nico', tripo: true, meta: assets.meta, outfit, material: mat, footIK: feet,
    // hit zones (src/gameplay/hitZones.js): this rig pivots the head at the skull base, the head center sits 0.105 m above
    // it and 1 cm back (tools/v2/player/measure.py); limb radii are the table's reference values (fitted on this body)
    hitFit: { headUp: assets.meta?.fit?.head?.center_off?.[2] ?? 0.105, headBack: assets.meta?.fit?.head?.center_off?.[1] ?? 0.0095 },
    face: null,
    // ragdoll capsules fitted to this body (src/npc/ragdoll.js reads character.ragdollRadii when present): a little inside
    // the measured skin + cloth radii (measure.py) so neighbor parts do not start interpenetrated
    ragdollRadii: { pelvis: 0.13, abdomen: 0.13, chest: 0.14, head: 0.11, uArmL: 0.07, uArmR: 0.07, lArmL: 0.05, lArmR: 0.05, thighL: 0.10, thighR: 0.10, shinL: 0.075, shinR: 0.075, footL: 0.05, footR: 0.05 },
    skin,
    body: { get fat() { return body.fat; }, set fat(v) { body.fat = v; applyBody(); }, get muscle() { return body.muscle; }, set muscle(v) { body.muscle = v; applyBody(); }, set(o) { Object.assign(body, o); applyBody(); } },
    setMeshLOD(L) { opts.meshLOD = Math.min(2, L); setMeshLOD(Math.min(2, L)); }, autoLOD() { opts.meshLOD = undefined; }, get meshLOD() { return cur; },
    setHairHidden() { /* hair is part of the scanned head */ },
    lookAt(p) { lookTarget = p || null; },
    reachTo(point, o = {}) {
      if (!point) { ik.right.release(); ik.left.release(); return Promise.resolve(); }
      let hand = o.hand || 'auto';
      if (hand === 'auto') { const loc = _v.copy(point); character.root.worldToLocal(loc); hand = loc.x > 0.03 ? 'left' : 'right'; }
      return ik[hand].reach(point, o);
    },
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

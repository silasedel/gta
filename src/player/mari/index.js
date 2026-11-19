// Southline — Mari, the second protagonist (the user's Tripo model, Nov 19). Built by tools/v2/player/build_mari.sh onto
// Nico's Mixamo-named skeleton, so every clip, the seat solver, hand / foot IK and the ragdoll work on her unchanged.
// Her name lives only in MARI.name (the user may rename her). Switching, the save slice and the follower are in
// ../characters.v2.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { addJiggle, JIGGLE_DIST } from './jiggle.js';
import { createShoulderCorrective } from './shoulders.js';

export const MARI = {
  id: 'mari',
  name: 'Mari',
  // phone contact line under her name
  role: 'Partner',
  // Her start: her small apartment above the dive shop on the Overseas Highway in Key Largo (storefront 'scuba_diving'
  // at -1170, 5469, door facing the highway), about 330 m up the island from Nico's house and 380 m from the marina
  // where the story crew works. She stands on the sidewalk 7 m out from the shop's door point (the storefront point
  // itself is inside the walk-in shop), facing the street.
  // Also where she goes back to when a new game starts.
  home: { x: -1164.4, z: 5472.8, heading: 0.93, place: 'Key Largo dive shop' },
};

const DIR = '/assets/characters/mari/';
let ASSETS = null;

function loadTex(file, srgb) {
  return new THREE.TextureLoader().loadAsync(DIR + file).then((t) => {
    t.flipY = false; // glTF UV convention (the GLB comes from Blender's glTF exporter)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    return t;
  });
}

// GLB + meta + hero textures (4K albedo, normal, matte roughness). No wardrobe region mask: her outfit is the baked one.
export function preloadMari() {
  if (ASSETS) return ASSETS;
  ASSETS = (async () => {
    const [gltf, meta, map, normalMap, orm] = await Promise.all([
      new GLTFLoader().loadAsync(DIR + 'mari.glb'),
      fetch(DIR + 'mari.json').then((r) => r.json()),
      loadTex('albedo.webp', true),
      loadTex('normal.webp', false),
      loadTex('orm.webp', false),
    ]);
    return {
      gltf,
      meta,
      tex: { map, normalMap, orm, mask: null },
      // her idle arms hang closer than Nico's (0.36): narrower lats; shoulder line checked in game (Nov 19)
      pose: { armOut: 0.17, shoulderLift: 0.1, shoulderBack: 0.1, shoulderWide: 1.03 },
      // arms-down shoulder shapes (shoulders.js), hooked in by decorateHero
      corrective: createShoulderCorrective,
      // soft-tissue / ponytail secondary motion (jiggle.js), hooked in by decorateHero
      jiggle: { add: addJiggle, albedoUrl: DIR + 'albedo_1k.webp', dist: JIGGLE_DIST },
    };
  })();
  return ASSETS;
}

// World-space ground material for set-piece ground sheets (Nico's yard, lot pads): the terrain's ground recipes (hex-tiled
// user ground scans, src/world/terrain/groundShader.js) on any mesh, so a hand-built yard matches the terrain around it.
//   makeGroundMaterial(renderer, { base = 'yard', grass = 'scrub', vertexColors = true })
// The mesh's vertex colors steer it (the yard sheet's existing paint): green-shifted colors blend toward the grass recipe,
// and the color's brightness against the sheet's base tone darkens ruts and shade. Texture arrays load asynchronously.
import * as THREE from 'three';
import { loadGroundArrays } from '../terrain/groundtex.js';
import { GROUND_GLSL_HEAD, recipeUniforms } from '../terrain/groundShader.js';
import { vegUniforms } from '../vegetation/materials.js';

export function makeGroundMaterial(renderer, o = {}) {
  const keys = [o.base || 'yard', o.grass || 'scrub'], U = recipeUniforms(keys);
  const tGC = { value: null }, tGN = { value: null };
  loadGroundArrays(renderer).then((t) => { tGC.value = t.col; tGN.value = t.aux; mat.needsUpdate = true; });
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, vertexColors: o.vertexColors ?? true });
  mat.name = 'ground:' + keys.join('+');
  mat.customProgramCacheKey = () => 'ps-groundsurf-' + keys.join('+');
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGC, tGN, uRA: U.uRA, uRB: U.uRB, uRC: U.uRC, uRD: U.uRD, uTA: U.uTA, uTB: U.uTB, uRN: U.uRN, uVegTime: vegUniforms.uVegTime });
    sh.vertexShader = 'varying vec3 vL;\nvarying vec3 vBary;\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying float vShore;\n' + sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
      vL = vec3(0.0); vBary = vec3(1.0, 0.0, 0.0); vShore = 48.0;
      vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);`);
    sh.fragmentShader = GROUND_GLSL_HEAD.replace(/\bNC\b/g, '2') + sh.fragmentShader
      .replace('#include <color_fragment>', '')
      .replace('#include <map_fragment>', /* glsl */`
      vec2 wp = vWP.xz, gdx = dFdx(wp), gdy = dFdy(wp);
      bool gWantN = distance(cameraPosition, vWP) < 200.0;
      vec3 vcol = vec3(0.86, 0.83, 0.76);
      #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
        vcol = vColor.rgb;
      #endif
      // the sheet's paint: grass lowers blue against green; brightness against the base tone = ruts, shade, damp
      float gr = clamp((0.916 - vcol.b / max(vcol.g, 0.01)) / 0.37, 0.0, 1.0);
      gr = smoothstep(0.15, 0.85, gr + (gF(wp * 0.35) - 0.5) * 0.5);
      float rel = clamp(vcol.g / mix(0.83, 0.62, gr), 0.45, 1.25);
      GS a = gRecipe(0, wp, gdx, gdy, gWantN); GS b = a;
      float wb = 0.0;
      if (gr > 0.01) { b = gRecipe(1, wp, gdx, gdy, gWantN); float ta = 1.0 - gr + a.h * 0.5, tb = gr + b.h * 0.5, mx = max(ta, tb) - 0.2; ta = max(ta - mx, 0.0); tb = max(tb - mx, 0.0); wb = tb / (ta + tb); }
      vec3 alb = mix(a.alb, b.alb, wb) * mix(0.9, 1.08, gF(wp * 0.05 + 2.0)) * rel;
      float tRough = mix(a.rough, b.rough, wb) * mix(0.8, 1.0, smoothstep(0.6, 0.9, rel));
      vec2 gTilt = mix(a.tilt, b.tilt, wb);
      diffuseColor.rgb *= alb * mix(1.0, mix(a.ao, b.ao, wb), 0.65);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(tRough, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', /* glsl */`{
        vec3 Nw = normalize(vWN), Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x), Bw = normalize(vec3(0.0, 0.0, 1.0) - Nw * Nw.z);
        normal = normalize((viewMatrix * vec4(normalize(Tw * gTilt.x + Bw * gTilt.y + Nw), 0.0)).xyz);
      }`);
  };
  mat.userData.ground = { keys, U };
  return mat;
}

// Ground pass: an existing world-space ground material (city open land, M.land) re-shaded with the terrain's recipes over the
// user's ground scans, so city lots / verges match the terrain look (hex-tiled, no repeats). Recipes `keys` (2 or 3) are mixed by
// two scales of world noise and texture height; earlier patches on the material (wear, edge blends) keep working.
//   patchRecipeGround(mat, renderer, ['scrub', 'lawn', 'dirt'], { mix: [0.45, 0.72] })
export function patchRecipeGround(mat, renderer, keys = ['scrub', 'lawn', 'dirt'], o = {}) {
  if (!mat || mat.userData.recipeGround) return mat; mat.userData.recipeGround = keys.join('+');
  const NC = keys.length, U = recipeUniforms(keys), tGC = { value: null }, tGN = { value: null };
  loadGroundArrays(renderer).then((t) => { tGC.value = t.col; tGN.value = t.aux; mat.needsUpdate = true; });
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.map = null; mat.normalMap = null; mat.roughnessMap = null; mat.aoMap = null; mat.color.setRGB(1, 1, 1); mat.roughness = 1; mat.metalness = 0;
  const [m0, m1] = o.mix || [0.45, 0.72];
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, { tGC, tGN, uRA: U.uRA, uRB: U.uRB, uRC: U.uRC, uRD: U.uRD, uTA: U.uTA, uTB: U.uTB, uRN: U.uRN, uVegTime: vegUniforms.uVegTime });
    sh.vertexShader = 'varying vec3 vRgW;\nvarying vec3 vRgN;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vRgW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRgN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = GROUND_GLSL_HEAD.replace(/\bNC\b/g, String(NC)).replace('varying vec3 vL; varying vec3 vBary; varying vec3 vWP; varying vec3 vWN; varying float vShore;', 'varying vec3 vRgW; varying vec3 vRgN;') + sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
      vec2 wp = vRgW.xz, gdx = dFdx(wp), gdy = dFdy(wp);
      bool gWantN = distance(cameraPosition, vRgW) < 220.0;
      GS a = gRecipe(0, wp, gdx, gdy, gWantN), b = gRecipe(1, wp, gdx, gdy, gWantN);
      float n = gF(wp * 0.021 + 3.0) * 0.7 + gN(wp * 0.11 - 1.0) * 0.3;
      float wb = smoothstep(${m0.toFixed(3)}, ${m1.toFixed(3)}, n + (b.h - a.h) * 0.25);
      vec3 alb = mix(a.alb, b.alb, wb); float tRough = mix(a.rough, b.rough, wb), tAo = mix(a.ao, b.ao, wb); vec2 gTilt = mix(a.tilt, b.tilt, wb); float th = mix(a.h, b.h, wb);
      ${NC > 2 ? `{ float nd = gF(wp * 0.043 + 9.0); float wd = smoothstep(0.66, 0.84, nd + (0.5 - th) * 0.3); if (wd > 0.0) { GS d = gRecipe(2, wp, gdx, gdy, gWantN); alb = mix(alb, d.alb, wd); tRough = mix(tRough, d.rough, wd); tAo = mix(tAo, d.ao, wd); gTilt = mix(gTilt, d.tilt, wd); } }` : ''}
      alb *= mix(0.86, 1.1, gF(wp * 0.0095)) * mix(0.94, 1.05, gN(wp * 0.0023 + 5.0));
      diffuseColor.rgb *= alb * mix(1.0, tAo, 0.65);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(tRough, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', /* glsl */`{
        vec3 Nw = normalize(vRgN), Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x), Bw = normalize(vec3(0.0, 0.0, 1.0) - Nw * Nw.z);
        normal = normalize((viewMatrix * vec4(normalize(Tw * gTilt.x + Bw * gTilt.y + Nw), 0.0)).xyz);
      }`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|recipe:' + keys.join('+');
  mat.userData.pbr = 'recipe-ground'; mat.needsUpdate = true;
  return mat;
}

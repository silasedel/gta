// Rain puddles for set-piece ground (r2-ground). Standing water at given spots of any MeshStandard / MeshPhysical ground material:
// it fills while it rains and shrinks back toward its lowest point as the weather dries (game weather -> WEATHER_U, see
// src/render/wetSurfaces.js: y = puddles 0..1 fills at rain / 90 s and dries over ~7 min, x = wetness, z = rain intensity).
//   patchPuddles(material, [{ x, z, r }])     world coords; r = radius when full (m). Up to 8 per material.
// Look: muddy, darkened mirror water with a ragged noise edge, rain ripple rings while it rains, a soaked dark rim that
// lingers a little after the water has gone. Placed where the ground actually dips (the caller sculpts the low spot).
import * as THREE from 'three';
import { WEATHER_U } from '../../render/wetSurfaces.js';

const MAX = 8;
export function patchPuddles(mat, list = []) {
  if (!mat || !list.length || mat.userData.r2Puddles) return mat;
  mat.userData.r2Puddles = true;
  const P = Array.from({ length: MAX }, (_, i) => {
    const p = list[i];
    return p
      ? new THREE.Vector4(p.x, p.z, Math.max(0.2, p.r || 1.2), (i * 0.618) % 1)
      : new THREE.Vector4(1e6, 1e6, 0.1, 0);
  });
  const U = { uPud: { value: P } };
  mat.userData.puddles = U;
  const prev = mat.onBeforeCompile,
    prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    if (!/lights_physical_pars_fragment/.test(sh.fragmentShader)) return; // not a lit standard / physical shader: stays dry
    sh.uniforms.uWeather = { value: WEATHER_U }; // bind the shared weather (materials built outside ShaderLib's copy would read zeros)
    sh.vertexShader =
      'varying vec3 vPdW;\n' +
      sh.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n  vPdW = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    sh.fragmentShader =
      `uniform vec4 uPud[${MAX}]; varying vec3 vPdW;
float pdH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pdN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(pdH(i), pdH(i + vec2(1.0, 0.0)), f.x), mix(pdH(i + vec2(0.0, 1.0)), pdH(i + vec2(1.0, 1.0)), f.x), f.y); }
float pdWater = 0.0; vec2 pdRip = vec2(0.0);
` +
      sh.fragmentShader
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
  {
    vec2 wp = vPdW.xz; float lvl = uWeather.y, dampK = max(uWeather.x * 0.6, lvl);
    float best = 9.0;
    for (int i = 0; i < ${MAX}; i++) { vec4 p = uPud[i]; vec2 d = wp - p.xy; if (dot(d, d) > p.z * p.z * 4.0) continue;
      float e = length(d) / p.z + (pdN(wp * 1.7 + p.w * 31.0) - 0.5) * 0.42 + (pdN(wp * 5.3 - p.w * 17.0) - 0.5) * 0.12; // ragged, puddle-shaped edge
      best = min(best, e); }
    if (best < 2.0 && dampK > 0.001) {
      float L = 0.12 + 0.88 * lvl; // the water line shrinks toward the lowest point as it dries
      pdWater = (1.0 - smoothstep(L - 0.06, L + 0.015, best)) * step(0.015, lvl);
      float damp = (1.0 - smoothstep(L, L + 0.45, best)) * clamp(dampK * 1.4, 0.0, 1.0); // soaked rim, lingers a little longer
      diffuseColor.rgb *= mix(1.0, 0.62, damp);
      roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, damp);
      if (pdWater > 0.0) {
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.3 + vec3(0.012, 0.011, 0.009), pdWater * 0.92); // muddy, dark: the sky mirror does the rest
        roughnessFactor = mix(roughnessFactor, 0.03, pdWater);
        // rain: ripple rings from drops on a 22 cm grid, each cell its own phase
        if (uWeather.z > 0.01) { vec2 g = wp / 0.22, ci = floor(g), cf = fract(g) - 0.5; float h = pdH(ci), ph = fract(uWeather.w * (0.9 + h * 0.6) + h * 7.0);
          vec2 o = (vec2(pdH(ci + 3.1), pdH(ci + 7.7)) - 0.5) * 0.5; vec2 q = cf - o; float rr = length(q), ring = sin((rr - ph * 0.45) * 60.0) * (1.0 - ph) * smoothstep(ph * 0.45 + 0.06, ph * 0.45, rr);
          pdRip = q / max(rr, 1e-3) * ring * 0.35 * uWeather.z * step(h, 0.35 + uWeather.z * 0.5); }
      }
    }
  }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
  if (pdWater > 0.0) { vec3 nUp = normalize((viewMatrix * vec4(pdRip.x, 1.0, pdRip.y, 0.0)).xyz); normal = normalize(mix(normal, nUp, pdWater)); }`,
        );
  };
  mat.customProgramCacheKey = () => prevKey() + '|r2pud';
  mat.needsUpdate = true;
  return mat;
}

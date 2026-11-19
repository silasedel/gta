// Weathering for one object (r8, user: the derelict van must look old): every standard material under `root` is cloned (the
// originals stay shared and clean) and patched to read sun-faded, rusted and grimy, in the object's own frame so the wear
// stays put when it moves.
//   import { weatherObject } from '../world/props/weathered.js'
//   weatherObject(root, { fade: 0.6, rust: 0.45, grime: 0.5, seed: 3, skip: /glass|lamp|light/i })
// fade: chalky, desaturated, lighter paint on top surfaces; rust: brown-orange blooms with rough dull centres, strongest low
// on the body and near edges; grime: dark salt-dust band rising from the bottom, streaks under the windows.
import * as THREE from 'three';

const GLSL = /* glsl */ `
uniform vec4 uWx; // fade, rust, grime, seed
uniform vec2 uWy; // object min y, height
varying vec3 vWxP; varying vec3 vWxN;
float wxH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float wxN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wxH(i), wxH(i + vec3(1, 0, 0)), f.x), mix(wxH(i + vec3(0, 1, 0)), wxH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wxH(i + vec3(0, 0, 1)), wxH(i + vec3(1, 0, 1)), f.x), mix(wxH(i + vec3(0, 1, 1)), wxH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float wxF(vec3 p) { return wxN(p) * 0.55 + wxN(p * 2.3 + 7.1) * 0.3 + wxN(p * 5.7 - 3.3) * 0.15; }
`;

export function weatherObject(root, o = {}) {
  if (!root) return 0;
  const fade = o.fade ?? 0.6,
    rust = o.rust ?? 0.45,
    grime = o.grime ?? 0.5,
    seed = o.seed ?? 1,
    skip = o.skip || /glass|lamp|light|lens|plate|mirror/i;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(),
    box = new THREE.Box3();
  root.traverse((m) => {
    if (m.isMesh && m.geometry) {
      m.geometry.computeBoundingBox?.();
      const b = m.geometry.boundingBox
        .clone()
        .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      box.union(b);
    }
  });
  const uWx = { value: new THREE.Vector4(fade, rust, grime, seed) },
    uWy = { value: new THREE.Vector2(box.min.y, Math.max(0.5, box.max.y - box.min.y)) };
  const done = new Map();
  let n = 0;
  root.traverse((m) => {
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const out = mats.map((mt) => {
      if (!mt || !mt.isMeshStandardMaterial || skip.test(mt.name || '') || mt.transparent)
        return mt;
      let c = done.get(mt);
      if (c) return c;
      c = mt.clone();
      c.name = (mt.name || 'mat') + ':weathered';
      const prev = mt.onBeforeCompile,
        pk = mt.customProgramCacheKey?.bind(mt);
      c.onBeforeCompile = function (sh, r) {
        if (prev) prev.call(this, sh, r);
        sh.uniforms.uWx = uWx;
        sh.uniforms.uWy = uWy;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWxP; varying vec3 vWxN;')
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n  vWxP = position; vWxN = normal;',
          );
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\n' + GLSL)
          .replace(
            '#include <lights_physical_fragment>',
            `
  roughnessFactor = mix(roughnessFactor, 0.92, max(wxR, uWx.x * 0.55));
  metalnessFactor *= 1.0 - max(wxR, uWx.x * 0.6);
#include <lights_physical_fragment>`,
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
  float wxR = smoothstep(0.5, 0.64, wxF(vWxP * 1.6 + uWx.w) + (1.0 - clamp((vWxP.y - uWy.x) / uWy.y, 0.0, 1.0)) * 0.3 - 0.12) * uWx.y;
  { float h01 = clamp((vWxP.y - uWy.x) / uWy.y, 0.0, 1.0), up = clamp(normalize(vWxN).y, 0.0, 1.0);
    // sun fade: top surfaces chalky and desaturated
    float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), fd = uWx.x * (0.35 + 0.65 * up) * (0.7 + 0.3 * wxF(vWxP * 0.7 + 3.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l) * vec3(0.98, 0.92, 0.8) * 0.82 + vec3(0.05, 0.045, 0.03), fd); // chalky, yellowed
    // rust blooms: dark brown core, orange rim, stronger low on the body
    float rn = wxF(vWxP * 1.6 + uWx.w) + (1.0 - h01) * 0.28 - 0.12, core = smoothstep(0.52, 0.64, rn), rim = smoothstep(0.42, 0.53, rn) - core;
    vec3 rustC = mix(vec3(0.42, 0.2, 0.09), vec3(0.24, 0.12, 0.06), wxN(vWxP * 9.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, rustC, core * uWx.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.55, 0.36), rim * uWx.y * 0.8);
    // grime: salt dust rising from the rocker panels, run streaks from the window line
    float band = smoothstep(0.42, 0.0, h01 + (wxN(vWxP * vec3(3.0, 0.5, 3.0)) - 0.5) * 0.12);
    float streak = smoothstep(0.55, 0.85, wxN(vec3(vWxP.x * 6.0, vWxP.y * 0.4, vWxP.z * 6.0) + 11.0)) * smoothstep(0.85, 0.35, h01);
    diffuseColor.rgb *= 1.0 - uWx.z * (band * 0.6 + streak * 0.35);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.45, 0.38), uWx.z * band * 0.35); }`,
          );
      };
      c.customProgramCacheKey = () => (pk ? pk() : '') + '|weathered';
      done.set(mt, c);
      n++;
      return c;
    });
    m.material = Array.isArray(m.material) ? out : out[0];
  });
  return n;
}

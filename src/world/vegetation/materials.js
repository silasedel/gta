// Vegetation materials: one bark and one leaf material family shared by every plant.
// Shader additions (onBeforeCompile on MeshStandardMaterial, so shadows, fog and tone mapping stay standard):
//  - wind: geometry attribute aWind = (attachment height in m, leaf flutter weight 0..1, phase). Bend grows with height^1.6,
//    so trunks barely move and crowns sway; leaflets flutter on top.
//  - per-instance variation from a hash of the instance position: lean direction and amount, hue / value jitter, leaf wear
//    (yellowing, brown tips), bark staining. No two instances look the same even when they share a geometry variant.
//  - leaves: two-sided, alpha-cut, backlit translucency (sun behind the leaf glows through) and a soft wrap term.
//  - LOD cross-fade: uFade = (inNear, inFar, outNear, outFar) in m; a screen-space dither makes LOD swaps invisible.
import * as THREE from 'three';
import { barkAtlas, leafAtlas } from './textures.js';

export const vegUniforms = {
  uVegTime: { value: 0 }, uVegGust: { value: 0.45 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  // shared wind (copied every frame from game.wind when it exists): direction the air moves to, mean speed, clock of the gust field
  uVegWindDir: { value: new THREE.Vector2(-1, 0) }, uVegCam: { value: new THREE.Vector3() }, uVegCamOn: { value: 0 }, uVegWindSpeed: { value: 3 }, uVegWindT: { value: 0 }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
};

const VERT_HEAD = `
attribute vec3 aWind;
uniform float uVegTime; uniform float uVegGust; uniform float uLean; uniform float uSway; uniform vec2 uVegWindDir; uniform float uVegWindSpeed; uniform float uVegWindT; uniform vec3 uVegCam; uniform float uVegCamOn;
float vegGust(vec2 p) { // same travelling gust bands as game.wind.sample(): palms, shrubs, trees and grass react to one front together
  vec2 d = uVegWindDir; float along = dot(p, d), across = -p.x * d.y + p.y * d.x, s = max(uVegWindSpeed, 0.5), t = uVegWindT;
  float a = sin(6.2831 * ((along - s * 0.9 * t) / 140.0 + 0.13 * sin(across / 90.0)));
  float b = sin(6.2831 * ((along - s * 0.7 * t) / 37.0 + across / 210.0) + 1.7);
  float c = sin(6.2831 * ((along - s * 0.6 * t) / 9.5) + across * 0.11 + 4.1);
  return clamp(0.5 + 0.3 * a + 0.16 * b + 0.07 * c, 0.0, 1.0);
}
varying vec2 vVegHash; varying float vVegFl; varying vec3 vVegW; varying float vVegDist;
`;
const VERT_BODY = `
#ifdef USE_INSTANCING
  vec3 vIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 vIp = vec3(0.0);
#endif
  vec3 vIw = (modelMatrix * vec4(vIp, 1.0)).xyz;
  float vh = fract(sin(dot(vIw.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float vh2 = fract(vh * 91.7 + 0.13);
  vVegHash = vec2(vh, vh2); vVegFl = aWind.y;
  float bh = max(aWind.x, 0.0), bend = pow(bh, 1.6);
  vec2 ld = vec2(cos(vh * 6.2831), sin(vh * 6.2831));
  transformed.xz += ld * bend * uLean * (vh2 - 0.25);
  float ph = vh * 6.2831 + aWind.z;
  float gst = vegGust(vIw.xz), wspd = clamp(uVegWindSpeed / 4.0, 0.06, 2.2);
  float sway = (0.3 + gst * 1.1 + (sin(uVegTime * 1.1 + vh * 6.2831) * 0.6 + sin(uVegTime * 2.3 + vh * 11.0) * 0.25) * (0.3 + gst)) * wspd;
  transformed.xz += uVegWindDir * bend * sway * uSway;
  transformed.xz += vec2(-uVegWindDir.y, uVegWindDir.x) * bend * sin(uVegTime * 0.9 + vh * 4.0) * uSway * 0.3 * wspd;
  float fl = aWind.y * (0.25 + gst) * wspd;
  transformed += normal * sin(uVegTime * 5.3 + ph + transformed.y * 0.7) * 0.05 * fl;
  transformed.y += sin(uVegTime * 2.1 + ph) * 0.09 * fl * aWind.y;
  vec4 vegW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  vegW = instanceMatrix * vegW;
#endif
  vegW = modelMatrix * vegW; vVegW = vegW.xyz; vVegDist = distance(vIw, uVegCamOn > 0.5 ? uVegCam : cameraPosition); // the view camera, also in the shadow pass (LOD fades match)
`;
const FRAG_HEAD = `
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uTransl; uniform float uWear; uniform vec4 uFade; uniform float uTintAmt;
varying vec2 vVegHash; varying float vVegFl; varying vec3 vVegW; varying float vVegDist;
float vegDither() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); }
`;
// LOD dither + per-instance tint/wear; runs right after the map is sampled
const FRAG_COLOR = `
  #ifdef USE_MAP
  { // keep thin leaflets from dissolving in the mip chain: scale alpha up with the sampled mip level
    vec2 tdx = dFdx(vMapUv * 2048.0), tdy = dFdy(vMapUv * 2048.0);
    diffuseColor.a *= 1.0 + max(0.0, 0.5 * log2(max(dot(tdx, tdx), dot(tdy, tdy)))) * 0.3;
  }
  #endif
  {
    float dn = vegDither();
    if (uFade.y > 0.0 && dn >= smoothstep(uFade.x, uFade.y, vVegDist)) discard;
    if (uFade.w > 0.0 && dn < smoothstep(uFade.z, uFade.w, vVegDist)) discard;
    vec3 tj = vec3(0.92 + 0.16 * vVegHash.x, 0.93 + 0.14 * vVegHash.y, 0.88 + 0.2 * fract(vVegHash.x * 13.7));
    diffuseColor.rgb *= mix(vec3(1.0), tj, uTintAmt);
    float wear = uWear * smoothstep(0.35, 1.0, vVegHash.y);
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    vec3 dry = vec3(lum * 1.25, lum * 1.05, lum * 0.45);
    diffuseColor.rgb = mix(diffuseColor.rgb, dry, clamp(wear * (0.25 + 0.75 * smoothstep(0.55, 1.0, vVegFl)), 0.0, 0.85));
  }
`;
const FRAG_TRANSL = `
  {
    vec3 Vd = normalize(vVegW - cameraPosition);
    float back = pow(max(dot(Vd, normalize(uSunDir)), 0.0), 3.0);
    float up = clamp(uSunDir.y * 2.0, 0.0, 1.0);
    totalEmissiveRadiance += diffuseColor.rgb * uSunCol * (back * uTransl * 1.2 + uTransl * 0.06) * up * vec3(0.9, 1.05, 0.6);
  }
`;

// multi-view impostor (field.js bakeImpostor): camera-facing quad around the plant's axis, nearest two baked azimuths
const IMP_VERT_HEAD = `
uniform vec4 uImp; // views, radius, y0, height
varying vec2 vImpUv0; varying vec2 vImpUv1; varying float vImpF;
`;
const IMP_NORMAL = `
  vec3 objectNormal;
  vec2 impDir;
  {
    mat4 impM = modelMatrix;
  #ifdef USE_INSTANCING
    impM = impM * instanceMatrix;
  #endif
    vec3 camL = (inverse(impM) * vec4(uVegCamOn > 0.5 ? uVegCam : cameraPosition, 1.0)).xyz;
    impDir = camL.xz; float l = length(impDir); impDir = l > 1e-4 ? impDir / l : vec2(0.0, 1.0);
    objectNormal = normalize(vec3(impDir.x, 0.0, impDir.y) * 0.45 + vec3(0.0, 0.9, 0.0));
    float V = uImp.x, ph = atan(impDir.x, impDir.y) / 6.2831853; ph = ph < 0.0 ? ph + 1.0 : ph;
    float fk = ph * V, k0 = floor(fk); vImpF = fk - k0; float k1 = mod(k0 + 1.0, V); k0 = mod(k0, V);
    vImpUv0 = vec2((k0 + uv.x) / V, uv.y); vImpUv1 = vec2((k1 + uv.x) / V, uv.y);
  }
`;
const IMP_POS = `
  vec3 transformed = vec3(impDir.y * position.x * uImp.y, uImp.z + position.y * uImp.w, -impDir.x * position.x * uImp.y);
`;
const IMP_FRAG_HEAD = `
uniform vec4 uImp; varying vec2 vImpUv0; varying vec2 vImpUv1; varying float vImpF;
`;
const IMP_MAP = `
  { // blend the two nearest baked azimuths by a screen-space dither (no ghosted double image)
    vec2 impUv = vegDither() < vImpF ? vImpUv1 : vImpUv0;
    vec4 sampledDiffuseColor = texture2D( map, impUv );
    diffuseColor *= sampledDiffuseColor;
  }
`;

function patch(kind, local) {
  return (sh) => {
    Object.assign(sh.uniforms, vegUniforms, local);
    if (kind === 'imp') {
      sh.vertexShader = IMP_VERT_HEAD + sh.vertexShader.replace('#include <beginnormal_vertex>', IMP_NORMAL).replace('#include <begin_vertex>', IMP_POS);
      sh.fragmentShader = IMP_FRAG_HEAD + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment_imp>');
    }
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY).replace(IMP_POS, IMP_POS + VERT_BODY);
    if (sh.fragmentShader.includes('#include <map_fragment>') || sh.fragmentShader.includes('#include <map_fragment_imp>')) {
      sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_COLOR).replace('#include <map_fragment_imp>', IMP_MAP + FRAG_COLOR);
      if (kind === 'leaf' || kind === 'imp') sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_TRANSL)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n#ifdef DOUBLE_SIDED\n normal *= faceDirection;\n#endif'); // foliage: keep the authored (outward / upward) normal on both faces
    } else { // depth material: dither only
      sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        { float dn = vegDither(); if (uFade.y > 0.0 && dn >= smoothstep(uFade.x, uFade.y, vVegDist)) discard; if (uFade.w > 0.0 && dn < smoothstep(uFade.z, uFade.w, vVegDist)) discard; }`);
    }
  };
}

function localUniforms(o) {
  const im = o.map && o.map.userData && o.map.userData.impostor;
  return { uImp: { value: new THREE.Vector4(im ? im.views : 8, im ? im.R : 1, im ? im.y0 : 0, im ? im.hgt : 1) }, uLean: { value: o.lean ?? 0.012 }, uSway: { value: o.sway ?? 0.006 }, uTransl: { value: o.transl ?? 0.55 }, uWear: { value: o.wear ?? 0.5 },
    uTintAmt: { value: o.tint ?? 1 }, uFade: { value: new THREE.Vector4(...(o.fade || [0, 0, 0, 0])) } };
}

// family: 'bark' | 'leaf' | 'imp' (impostor, map given). Returns { mat, depth, u } where u holds the per-material uniforms.
export function makeVegMaterial(family, o = {}) {
  const u = localUniforms(o);
  let mat;
  if (family === 'plain') { // untextured vertex-colour parts (flowers, rocks, pebbles)
    mat = new THREE.MeshStandardMaterial({ roughness: o.roughness ?? 0.88, metalness: 0, vertexColors: true, side: o.side ?? THREE.DoubleSide });
  } else if (family === 'bark') {
    const B = barkAtlas();
    mat = new THREE.MeshStandardMaterial({ map: B.map, normalMap: B.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: B.roughnessMap, roughness: 1, metalness: 0, vertexColors: true });
  } else {
    const map = family === 'imp' ? o.map : leafAtlas().map;
    mat = new THREE.MeshStandardMaterial({ map, alphaTest: o.alphaTest ?? 0.42, side: THREE.DoubleSide, roughness: o.roughness ?? 0.8, metalness: 0, envMapIntensity: 0.55, vertexColors: family !== 'imp', alphaToCoverage: true });
  }
  mat.onBeforeCompile = patch(family, u);
  mat.customProgramCacheKey = () => 'veg-' + family;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: family === 'bark' || family === 'plain' ? null : mat.map, alphaTest: family === 'bark' || family === 'plain' ? 0 : (o.alphaTest ?? 0.42), side: family === 'bark' ? THREE.FrontSide : THREE.DoubleSide });
  depth.onBeforeCompile = patch('depth', u);
  depth.customProgramCacheKey = () => 'veg-depth-' + family;
  mat.userData.veg = { family, u, depth };
  return { mat, depth, u };
}

let _shared = null;
// shared full-detail materials (used by palmGeometry call sites and the old city builders)
export function sharedVegMaterials() {
  if (_shared) return _shared;
  const bark = makeVegMaterial('bark', { lean: 0.006, sway: 0.0035, wear: 0.6 }), leaf = makeVegMaterial('leaf', { lean: 0.006, sway: 0.0035, wear: 0.55 });
  _shared = { bark: bark.mat, barkDepth: bark.depth, leaf: leaf.mat, leafDepth: leaf.depth };
  return _shared;
}

// per-frame: wind clock and sun (pass a DirectionalLight, or find the strongest one in the scene)
let _sun = null;
// view camera for the LOD dither (so shadow-map passes fade exactly like the visible pass)
export function setVegCamera(cam) { if (cam) { vegUniforms.uVegCam.value.copy(cam.position); vegUniforms.uVegCamOn.value = 1; } }
export function updateVegetation(t, scene, sun, wind) {
  vegUniforms.uVegTime.value = t;
  if (wind && wind.dir) { vegUniforms.uVegWindDir.value.copy(wind.dir); vegUniforms.uVegWindSpeed.value = wind.speed ?? 3; vegUniforms.uVegWindT.value = wind.time ?? t; }
  else vegUniforms.uVegWindT.value = t;
  vegUniforms.uVegGust.value = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.13)) + 0.35 * Math.max(0, Math.sin(t * 0.41) * Math.sin(t * 0.067 + 1.3));
  if (!sun && scene) {
    if (!_sun || !_sun.parent) { _sun = null; let best = 0; scene.traverse((o) => { if (o.isDirectionalLight && o.intensity > best) { best = o.intensity; _sun = o; } }); }
    sun = _sun;
  }
  if (sun) {
    const d = vegUniforms.uSunDir.value.copy(sun.position); if (sun.target) d.sub(sun.target.position); d.normalize();
    vegUniforms.uSunCol.value.copy(sun.color).multiplyScalar(Math.min(1.5, sun.intensity * 0.35));
  }
}

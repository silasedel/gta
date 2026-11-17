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
import { FRAME_NOISE } from '../../render/frameNoise.js';

export const vegUniforms = {
  uFrameN: FRAME_NOISE, // stage 1: temporal dither offset (TAA resolves the LOD cross-fade instead of a fixed dot pattern)
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
varying vec2 vVegHash; varying vec2 vVegHash2; varying float vVegFl; varying vec3 vVegW; varying float vVegDist;
uniform vec4 uShape; uniform float uCrownY; uniform vec2 uCrownC; uniform float uSpread; // model height, bend, twist (rad), frond droop; crown attachment height (m)
float vegInstH() {
#ifdef USE_INSTANCING
  vec3 p = (modelMatrix * vec4(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2], 1.0)).xyz;
#else
  vec3 p = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#endif
  return fract(sin(dot(p.xz, vec2(12.9898, 78.233))) * 43758.5453);
}
bool vegMirrored() { return fract(vegInstH() * 173.31 + 0.27) > 0.5; }
`;
const VERT_MIRROR_N = `
#if defined(VEG_MIRROR) && !defined(VEG_IMP)
  if (vegMirrored()) { objectNormal.x = -objectNormal.x;
  #ifdef USE_TANGENT
    objectTangent.x = -objectTangent.x;
  #endif
  }
#endif
`;
const VERT_BODY = `
#ifdef USE_INSTANCING
  vec3 vIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 vIp = vec3(0.0);
#endif
  vec3 vIw = (modelMatrix * vec4(vIp, 1.0)).xyz;
  float vh = fract(sin(dot(vIw.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float vh2 = fract(vh * 91.7 + 0.13), vh3 = fract(vh * 37.13 + 0.61), vh4 = fract(vh * 251.9 + 0.37), vh5 = fract(vh * 13.71 + 0.83), vh6 = fract(vh * 547.3 + 0.19);
  vVegHash = vec2(vh, vh2); vVegHash2 = vec2(vh3, vh4); vVegFl = aWind.y;
#ifndef VEG_IMP
#ifdef VEG_MIRROR
  if (fract(vh * 173.31 + 0.27) > 0.5) transformed.x = -transformed.x; // per-instance mirror (normals flipped in beginnormal)
#endif
  if (uShape.x > 0.0) { // per-instance shape: crown spread + frond droop around the crown's own attachment point, then trunk twist + S-bend (grow with height, the base stays planted)
    if (aWind.y > 0.0 && transformed.y > uCrownY) {
      vec2 cc = uCrownC;
#ifdef VEG_MIRROR
      if (fract(vh * 173.31 + 0.27) > 0.5) cc.x = -cc.x;
#endif
      vec2 rel = transformed.xz - cc; float cr = length(rel);
      transformed.xz = cc + rel * (1.0 + uSpread * (vh6 - 0.5));
      transformed.y -= uShape.w * (vh6 - 0.3) * cr * cr * aWind.y;
    }
    float st = clamp(transformed.y / uShape.x, 0.0, 1.0);
    float tw = uShape.z * (vh5 - 0.5) * 2.0 * st, ct = cos(tw), sn = sin(tw);
    transformed.xz = mat2(ct, sn, -sn, ct) * transformed.xz;
    vec2 bd = vec2(cos(vh3 * 6.2831), sin(vh3 * 6.2831));
    transformed.xz += bd * uShape.y * uShape.x * (vh4 - 0.35) * (st * st - 0.35 * st * st * st);
  }
#endif
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
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uTransl; uniform float uWear; uniform vec4 uFade; uniform float uTintAmt; uniform float uFrameN;
uniform vec3 uJit; uniform vec4 uGrade; // per-instance hue (warm/cool) / saturation / brightness jitter; per-material color gain + saturation
varying vec2 vVegHash; varying vec2 vVegHash2; varying float vVegFl; varying vec3 vVegW; varying float vVegDist;
float vegDither() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy + 5.588238 * uFrameN, vec2(0.06711056, 0.00583715)))); }
float vegDitherS() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); }
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
    {
      vec3 c = diffuseColor.rgb * uGrade.rgb; float l0 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float hj = uJit.x * (vVegHash2.x - 0.5) * 2.0, sj = uGrade.w * (1.0 + uJit.y * (vVegHash2.y - 0.5) * 2.0), bj = 1.0 + uJit.z * (fract(vVegHash.x * 7.31 + vVegHash2.y) - 0.5) * 2.0;
      c *= vec3(1.0 + 0.5 * hj, 1.0 + 0.08 * hj, 1.0 - 0.8 * hj); // warm (sun-bleached, yellower) <-> cool (shaded, bluer green)
      float l1 = dot(c, vec3(0.2126, 0.7152, 0.0722)); c *= l0 / max(l1, 1e-4);
      diffuseColor.rgb = max(mix(vec3(l0), c, sj) * bj, 0.0);
    }
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
    vec2 vd = impDir; float ux = uv.x;
  #ifdef VEG_MIRROR
    if (vegMirrored()) { vd.x = -vd.x; ux = 1.0 - ux; } // a mirrored plant seen from azimuth a = the baked plant seen from -a, flipped
  #endif
    float V = uImp.x, ph = atan(vd.x, vd.y) / 6.2831853; ph = ph < 0.0 ? ph + 1.0 : ph;
    float fk = ph * V, k0 = floor(fk); vImpF = fk - k0; float k1 = mod(k0 + 1.0, V); k0 = mod(k0, V);
    vImpUv0 = vec2((k0 + ux) / V, uv.y); vImpUv1 = vec2((k1 + ux) / V, uv.y);
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
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + VERT_MIRROR_N).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY).replace(IMP_POS, IMP_POS + VERT_BODY);
    if (sh.fragmentShader.includes('#include <map_fragment>') || sh.fragmentShader.includes('#include <map_fragment_imp>')) {
      sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_COLOR).replace('#include <map_fragment_imp>', IMP_MAP + FRAG_COLOR);
      if (kind === 'leaf' || kind === 'imp') sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_TRANSL)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n#ifdef DOUBLE_SIDED\n normal *= faceDirection;\n#endif'); // foliage: keep the authored (outward / upward) normal on both faces
      else if (local.uMirrorOn && local.uMirrorOn.value) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n#ifdef DOUBLE_SIDED\n normal *= faceDirection;\n#endif'); // mirrored bark: winding flips, keep the transformed normal
    } else { // depth material: dither only
      sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        { float dn = vegDitherS(); if (uFade.y > 0.0 && dn >= smoothstep(uFade.x, uFade.y, vVegDist)) discard; if (uFade.w > 0.0 && dn < smoothstep(uFade.z, uFade.w, vVegDist)) discard; }`);
    }
  };
}

function localUniforms(o) {
  const im = o.map && o.map.userData && o.map.userData.impostor;
  return { uImp: { value: new THREE.Vector4(im ? im.views : 8, im ? im.R : 1, im ? im.y0 : 0, im ? im.hgt : 1) }, uLean: { value: o.lean ?? 0.012 }, uSway: { value: o.sway ?? 0.006 }, uTransl: { value: o.transl ?? 0.55 }, uWear: { value: o.wear ?? 0.5 },
    uTintAmt: { value: o.tint ?? 1 }, uFade: { value: new THREE.Vector4(...(o.fade || [0, 0, 0, 0])) },
    uShape: { value: new THREE.Vector4(...(o.shape || [0, 0, 0, 0])) }, uCrownY: { value: o.crownY ?? 1e4 }, uCrownC: { value: new THREE.Vector2(...(o.crownC || [0, 0])) }, uSpread: { value: o.spread ?? 0.18 }, uMirrorOn: { value: o.mirror ? 1 : 0 },
    uJit: { value: new THREE.Vector3(...(o.jitter || [0, 0, 0])) }, uGrade: { value: new THREE.Vector4(...(o.grade || [1, 1, 1, 1])) } };
}

// family: 'bark' | 'leaf' | 'imp' (impostor, map given). Returns { mat, depth, u } where u holds the per-material uniforms.
export function makeVegMaterial(family, o = {}) {
  const u = localUniforms(o);
  let mat;
  if (family === 'plain') { // untextured vertex-colour parts (flowers, rocks, pebbles)
    mat = new THREE.MeshStandardMaterial({ roughness: o.roughness ?? 0.88, metalness: 0, vertexColors: true, side: o.side ?? THREE.DoubleSide });
  } else if (family === 'bark') {
    const B = o.map ? null : barkAtlas(); // o.map: a library model's own bark texture (models.js)
    mat = new THREE.MeshStandardMaterial({ map: o.map || B.map, normalMap: o.map ? (o.normalMap || null) : B.normalMap, normalScale: o.normalScale ? new THREE.Vector2(...o.normalScale) : new THREE.Vector2(1.1, 1.1), roughnessMap: o.map ? null : B.roughnessMap, roughness: o.map ? (o.roughness ?? 0.9) : 1, metalness: 0, vertexColors: true, side: o.side ?? THREE.FrontSide });
  } else {
    const map = family === 'imp' || o.map ? o.map : leafAtlas().map;
    mat = new THREE.MeshStandardMaterial({ map, normalMap: family !== 'imp' && o.normalMap ? o.normalMap : null, normalScale: o.normalScale ? new THREE.Vector2(...o.normalScale) : new THREE.Vector2(1, 1), alphaTest: o.alphaTest ?? 0.42, side: THREE.DoubleSide, roughness: o.roughness ?? 0.8, metalness: 0, envMapIntensity: 0.55, vertexColors: family !== 'imp', alphaToCoverage: true });
  }
  const defs = {}; if (o.mirror) defs.VEG_MIRROR = ''; if (family === 'imp') defs.VEG_IMP = '';
  if (o.mirror && family === 'bark') mat.side = THREE.DoubleSide; // mirrored instances flip the winding
  mat.defines = { ...(mat.defines || {}), ...defs };
  const pk = 'veg-' + family + (o.mirror ? '-m' : '');
  mat.onBeforeCompile = patch(family, u);
  mat.customProgramCacheKey = () => pk;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: family === 'bark' || family === 'plain' ? null : mat.map, alphaTest: family === 'bark' || family === 'plain' ? 0 : (o.alphaTest ?? 0.42), side: family === 'bark' ? THREE.FrontSide : THREE.DoubleSide });
  depth.defines = { ...(depth.defines || {}), ...defs }; if (o.mirror) depth.side = THREE.DoubleSide;
  depth.onBeforeCompile = patch('depth', u);
  depth.customProgramCacheKey = () => 'veg-depth-' + family + (o.mirror ? '-m' : '');
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

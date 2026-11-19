// Wheels for the merged car bodies: tire (sidewall + tread pattern), rim (16 designs from model/wheels.js), brake disc, hub and
// caliper merged into ONE geometry per design; a car draws its four wheels with ONE InstancedMesh.
// Instance matrix = the wheel's steer frame (suspension travel, steering, damage tilt); the spin angle rides in instanceColor.r
// and is applied in the vertex shader, so calipers (aFix = 1) stay put while everything else turns.
import * as THREE from 'three';
import { wheelGeos } from '../wheels.js';
import { PAT, R3CAR } from './mats.js';

const cache = new Map();
function attrs(g, color, rm, pat, tint, fix, uvMap) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count;
  const C = new Float32Array(n * 3),
    RM = new Float32Array(n * 2),
    P = new Float32Array(n),
    TI = new Float32Array(n),
    F = new Float32Array(n);
  const src = g.attributes.color;
  for (let i = 0; i < n; i++) {
    const shade = src ? src.getX(i) : 1;
    const c = typeof color === 'function' ? color(shade, i) : color;
    C[i * 3] = c[0];
    C[i * 3 + 1] = c[1];
    C[i * 3 + 2] = c[2];
    const r = typeof rm === 'function' ? rm(shade) : rm;
    RM[i * 2] = r[0];
    RM[i * 2 + 1] = r[1];
    P[i] = pat;
    TI[i] = typeof tint === 'function' ? tint(shade) : tint;
    F[i] = fix;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  let uv = g.attributes.uv
    ? g.attributes.uv.clone()
    : new THREE.BufferAttribute(new Float32Array(n * 2), 2);
  if (uvMap)
    for (let i = 0; i < n; i++) {
      const [u, v] = uvMap(uv.getX(i), uv.getY(i));
      uv.setXY(i, u, v);
    }
  out.setAttribute('uv', uv);
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setAttribute('aRM', new THREE.BufferAttribute(RM, 2));
  out.setAttribute('aPat', new THREE.BufferAttribute(P, 1));
  out.setAttribute('aTint', new THREE.BufferAttribute(TI, 1));
  out.setAttribute('aFix', new THREE.BufferAttribute(F, 1));
  return out;
}
function merge(list) {
  const names = ['position', 'normal', 'uv', 'color', 'aRM', 'aPat', 'aTint', 'aFix'];
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of names) {
    const sz = list[0].attributes[k].itemSize,
      arr = new Float32Array(n * sz);
    let o = 0;
    for (const g of list) {
      arr.set(g.attributes[k].array, o);
      o += g.attributes[k].array.length;
    }
    out.setAttribute(k, new THREE.BufferAttribute(arr, sz));
  }
  out.computeBoundingSphere();
  return out;
}
/** -> { hi, lo } merged wheel geometries (cached; shared by every car using the same design) */
export function wheelGeometry({ r, tw, style, tire, caliper }) {
  const key = [r.toFixed(3), tw.toFixed(3), style, tire, caliper ?? 'x'].join('|');
  if (cache.has(key)) return cache.get(key);
  const W = wheelGeos({ r, tw, style, tire });
  const parts = [];
  // tire: lathe profile; uv.y re-mapped so 0..1 spans the tread and the sidewalls fall outside (lettering rings there)
  parts.push(
    attrs(W.tire.clone(), [0.034, 0.034, 0.036], [0.86, 0], PAT.tread, 0, 0, (u, v) => [
      u,
      (v - 0.36) / 0.28,
    ]),
  );
  // rim: shades from wheels.js (1 face, 0.9 hub, 0.7 lugs, 0.34 disc, 0.2 hub throat, 0.12 back plate)
  parts.push(
    attrs(
      W.rim.clone(),
      (s) => (s > 0.5 ? [s, s, s] : s > 0.3 ? [0.42, 0.43, 0.44] : [s * 0.25, s * 0.25, s * 0.26]),
      (s) => (s > 0.5 ? [0.3, 0.9] : s > 0.3 ? [0.45, 0.85] : [0.8, 0.2]),
      0,
      (s) => (s > 0.5 ? 1 : 0),
      0,
    ),
  );
  if (caliper != null) {
    const c = new THREE.Color(caliper);
    const g = new THREE.BoxGeometry(0.06, W.ri * 0.55, 0.13).translate(
      tw / 2 - 0.09,
      W.ri * 0.58,
      0.02,
    );
    parts.push(attrs(g, [c.r, c.g, c.b], [0.35, 0.25], 0, 0, 1));
  }
  const hi = merge(parts);
  const lo = merge([
    attrs(
      W.lo.clone(),
      (s) => (s > 0.5 ? [0.75, 0.75, 0.75] : [0.03, 0.03, 0.03]),
      (s) => (s > 0.5 ? [0.35, 0.8] : [0.85, 0]),
      0,
      (s) => (s > 0.5 ? 1 : 0),
      0,
    ),
  ]);
  const res = { hi, lo, ri: W.ri };
  cache.set(key, res);
  return res;
}

const _base = new Map();
/** per-car wheel material (rim color + finish as uniforms; the GL program is shared) */
export function wheelMat(rimColor = 0xc9ced3, finish = 'alloy') {
  const RM = {
    alloy: [0.28, 0.92],
    polished: [0.1, 1],
    chrome: [0.05, 1.0],
    gloss: [0.2, 0.55],
    satin: [0.42, 0.8],
    steel: [0.55, 0.55],
    plastic: [0.45, 0.2],
  }[finish] || [0.28, 0.92];
  // r3 (user: "weird looking tires"): double-sided, so open game-rip sidewalls never show the sky through them
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.5,
    metalness: 0,
    envMapIntensity: 1.3,
    side: R3CAR ? THREE.DoubleSide : THREE.FrontSide,
  });
  const U = {
    uRim: { value: new THREE.Color(rimColor) },
    uRimRM: { value: new THREE.Vector2(RM[0], RM[1]) },
  };
  m.userData.wheelUniforms = U;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = U.uRim;
    sh.uniforms.uRimRM = U.uRimRM;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aRM; attribute float aPat; attribute float aTint; attribute float aFix;
varying vec2 vRM; varying float vPat; varying vec3 vObjPos; varying vec3 vObjN; varying vec2 vUv2; varying float vTint; varying float vMud;`,
      )
      .replace(
        '#include <color_vertex>',
        `#if defined( USE_COLOR_ALPHA )
  vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
  vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
  vColor *= color;
#endif`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
  float spinA = 0.0; vMud = 0.0;
  #ifdef USE_INSTANCING_COLOR
    spinA = instanceColor.r * (1.0 - aFix);
    vMud = instanceColor.g;
  #endif
  float spC = cos(spinA), spS = sin(spinA);
  objectNormal = vec3(objectNormal.x, spC * objectNormal.y - spS * objectNormal.z, spS * objectNormal.y + spC * objectNormal.z);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  transformed = vec3(transformed.x, spC * transformed.y - spS * transformed.z, spS * transformed.y + spC * transformed.z);
  vRM = aRM; vPat = aPat; vObjPos = position; vObjN = normal; vUv2 = uv; vTint = aTint;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uRim; uniform vec2 uRimRM;
varying vec2 vRM; varying float vPat; varying vec3 vObjPos; varying vec3 vObjN; varying vec2 vUv2; varying float vTint; varying float vMud;
float patMask = 0.0;
float rubK = 0.0;
float wh3(vec3 i) { return fract(sin(dot(i, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float wnoise(vec3 p) {   // smooth value noise (the r2 dust was one hash per 2.5 cm cube: a blocky checkerboard on every tire)
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wh3(i), wh3(i + vec3(1, 0, 0)), f.x), mix(wh3(i + vec3(0, 1, 0)), wh3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wh3(i + vec3(0, 0, 1)), wh3(i + vec3(1, 0, 1)), f.x), mix(wh3(i + vec3(0, 1, 1)), wh3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void wheelPattern(inout vec3 col) {
  int pt = int(vPat + 0.5);
  if (pt != 3) return;
  vec2 uv = vUv2;
  float fade = 1.0 - smoothstep(0.02, 0.08, fwidth(uv.x * 54.0) * 0.05 + fwidth(uv.y) * 0.5);
  if (uv.y < 0.0 || uv.y > 1.0) {
    // sidewall: a raised ring and blocky lettering band
    float r = uv.y < 0.0 ? -uv.y : uv.y - 1.0;
    float ring = smoothstep(0.03, 0.0, abs(r - 0.55) - 0.03);
    float letters = step(0.55, fract(uv.x * 60.0)) * step(0.28, r) * step(r, 0.42) * step(0.62, fract(uv.x * 3.0 + 0.2));
    col *= 1.0 + (ring * 0.7 + letters * 1.1) * fade;
    return;
  }
  float grooves = smoothstep(0.035, 0.0, abs(fract(uv.y * 4.0 + 0.5) - 0.5) - 0.06);
  float sipe = smoothstep(0.05, 0.0, abs(fract(uv.x * 72.0 + uv.y * 2.5) - 0.5) - 0.44) * step(0.2, abs(uv.y - 0.5));
  float hole = max(grooves, sipe * 0.7) * fade;
  col *= 1.0 - hole * 0.6;
  patMask = hole;
}`,
      )
      .replace(
        '#include <color_fragment>',
        R3CAR
          ? `#include <color_fragment>
  diffuseColor.rgb *= mix(vec3(1.0), uRim, vTint);
  wheelPattern(diffuseColor.rgb);
  // rubber: every dark dielectric wheel part (tire, carcass, valve) is one calibrated rubber, ~0.045 linear albedo, neutral
  float lumW = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  rubK = (1.0 - step(0.5, vRM.y)) * (1.0 - smoothstep(0.07, 0.11, lumW)) * (1.0 - vTint);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.043, 0.043, 0.045) * (0.92 + 1.2 * lumW), rubK);
  // road dust: soft patches, mostly on the rubber, a pale gray-brown film (not a tan checkerboard)
  float dn = wnoise(vObjPos * 13.0) * 0.65 + wnoise(vObjPos * 41.0) * 0.35;
  float mudK = vMud * smoothstep(0.3, 0.8, dn) * mix(0.35, 0.75, rubK);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.18, 0.15), clamp(mudK, 0.0, 0.6));`
          : '#include <color_fragment>\n  diffuseColor.rgb *= mix(vec3(1.0), uRim, vTint);\n  wheelPattern(diffuseColor.rgb);\n  float mudK = vMud * (0.55 + 0.45 * fract(sin(dot(floor(vObjPos * 40.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453));\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.31, 0.24), clamp(mudK, 0.0, 0.85));',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        R3CAR
          ? `#include <roughnessmap_fragment>
  roughnessFactor = mix(mix(vRM.x, uRimRM.x, vTint), 0.95, patMask);
  // rubber: 0.88 face on, a soft satin sheen (0.68) at grazing angles; dust is matte
  float nvW = abs(dot(normalize(vNormal), normalize(vViewPosition)));
  roughnessFactor = mix(roughnessFactor, mix(0.68, 0.88, smoothstep(0.0, 0.45, nvW)), rubK);
  roughnessFactor = mix(roughnessFactor, 0.95, clamp(mudK * 1.4, 0.0, 1.0));`
          : '#include <roughnessmap_fragment>\n  roughnessFactor = mix(mix(mix(vRM.x, uRimRM.x, vTint), 0.95, patMask), 0.95, clamp(vMud, 0.0, 0.9));',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\n  metalnessFactor = mix(vRM.y, uRimRM.y, vTint) * (1.0 - patMask);',
      );
  };
  m.customProgramCacheKey = () => 'ps-carwheel-v3' + (R3CAR ? '-r3' : '');
  return m;
}

const _m = new THREE.Matrix4(),
  _inv = new THREE.Matrix4(),
  _flip = new THREE.Matrix4().makeRotationY(Math.PI);
/** one InstancedMesh for a car's four wheels; call sync(wheels) each frame (car LOD.update does it) */
export function wheelSet(geo, mat, L) {
  const im = new THREE.InstancedMesh(geo, mat, 4);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(12), 3);
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.castShadow = true;
  im.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.4, 0), L / 2 + 0.8);
  im.frustumCulled = true;
  im.userData.isWheelSet = true;
  return im;
}
export function syncWheelSet(im, wheels) {
  _inv.copy(im.matrixWorld).invert();
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    w.steer.updateWorldMatrix(false, false);
    _m.multiplyMatrices(_inv, w.steer.matrixWorld);
    // never let suspension travel push the tire into the fender (the arch top is at r + archGap in shell space)
    if (im.userData.maxY != null && _m.elements[13] > im.userData.maxY)
      _m.elements[13] = im.userData.maxY;
    if (w.side < 0) _m.multiply(_flip);
    im.setMatrixAt(i, _m);
    im.instanceColor.setX(i, (w.side < 0 ? -1 : 1) * w.spin.rotation.x);
  }
  im.instanceMatrix.needsUpdate = true;
  im.instanceColor.needsUpdate = true;
}

// Port Solana — MPFB2/MakeHuman (CC0) human library loader + materials (CHARACTER agent).
// The library (public/assets/humans/humans.json + *.glb) is generated headless in Blender by
// tools in docs/showcase/characters (see stats.md). Each person: mixamo-compatible rig, 3 LODs,
// shared textures in /assets/humans/tex.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const ROOT = '/assets/humans/';
let manifest = null;
let loader = null;
const texCache = new Map();
const glbCache = new Map();

function getLoader() {
  if (loader) return loader;
  loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(ROOT + 'draco/');
  loader.setDRACOLoader(draco);
  return loader;
}

export async function loadHumanManifest() {
  if (manifest) return manifest;
  try {
    const r = await fetch(ROOT + 'humans.json');
    if (!r.ok) throw new Error(r.status);
    manifest = await r.json();
  } catch (e) {
    console.warn('[humans] no manifest', e);
    manifest = { people: [] };
  }
  return manifest;
}

export function loadHumanGLB(entry) {
  if (!glbCache.has(entry.id)) glbCache.set(entry.id, getLoader().loadAsync(ROOT + entry.file).catch((e) => { console.warn('[humans] failed', entry.id, e); return null; }));
  return glbCache.get(entry.id);
}

const texLoader = new THREE.TextureLoader();
function tex(path, srgb = true) {
  if (!path) return null;
  const key = path + (srgb ? '|s' : '|l');
  if (texCache.has(key)) return texCache.get(key);
  const t = texLoader.load(ROOT + path);
  t.flipY = false; // glTF UV convention
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

// ---------- shader helpers ----------
const HASH = `
float hhash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

// Skin: textured, soft "subsurface-like" wrap + reddish rim, slight micro-roughness variation.
export function makeSkinMat(entryMat, tint) {
  const m = new THREE.MeshStandardMaterial({ map: tex(entryMat.d), roughness: 0.56, metalness: 0, name: 'skin' });
  m.color.copy(tint || new THREE.Color(1, 1, 1));
  m.userData.sss = { value: 0.55 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSSS = m.userData.sss;
    sh.fragmentShader = 'uniform float uSSS;\n' + HASH + sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor + (hhash(vMapUv * 900.0) - 0.5) * 0.08, 0.35, 0.8);')
      .replace('#include <opaque_fragment>', `
  {
    // cheap subsurface approximation: scattered red light where light grazes + soft rim
    float ndv = clamp(dot(normalize(normal), normalize(-vViewPosition)), 0.0, 1.0);
    vec3 scat = diffuseColor.rgb * vec3(1.0, 0.42, 0.3) * uSSS;
    outgoingLight += scat * (0.08 + 0.18 * pow(1.0 - ndv, 2.0)) * (reflectedLight.indirectDiffuse * 2.0 + reflectedLight.directDiffuse * 0.35);
  }
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'mpfbSkin';
  return m;
}

// Hair cards: alpha-tested, tintable (natural colours incl. blond/grey), anisotropic-ish sheen via low roughness
export function makeHairMat(entryMat, color) {
  const m = new THREE.MeshStandardMaterial({ map: tex(entryMat.d), normalMap: tex(entryMat.n, false), alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.55, metalness: 0, name: 'hair' });
  m.userData.hair = { value: new THREE.Color(color ?? 0x2a1d14) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHairC = m.userData.hair;
    sh.fragmentShader = 'uniform vec3 uHairC;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 hx = texture2D(map, vMapUv);
  float hl = dot(hx.rgb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb *= uHairC * (0.55 + hl * 2.2);
  diffuseColor.a *= hx.a;
#endif`);
  };
  m.customProgramCacheKey = () => 'mpfbHair';
  return m;
}

// Garment shells (generated from the body surface, body UVs): solid colour + knit/weave micro detail + optional print
export function makeGarmentMat(kind, color, pattern = 0, color2 = 0xffffff) {
  const sport = /bikini|briefs|trunks/.test(kind);
  const m = new THREE.MeshStandardMaterial({ color, roughness: sport ? 0.55 : 0.88, metalness: 0, name: 'garment_' + kind, side: THREE.FrontSide });
  m.userData.g = { pat: { value: pattern }, c2: { value: new THREE.Color(color2) } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPat = m.userData.g.pat; sh.uniforms.uC2 = m.userData.g.c2;
    sh.vertexShader = sh.vertexShader.replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>\nvarying vec2 vGUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\n vGUv = uv;');
    sh.fragmentShader = 'uniform float uPat; uniform vec3 uC2; varying vec2 vGUv;\n' + HASH + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 q = vGUv * vec2(1400.0, 1400.0);
    float knit = 0.92 + 0.08 * sin(q.x) * sin(q.y * 0.5) + 0.06 * (hhash(floor(q * 0.5)) - 0.5);
    diffuseColor.rgb *= knit;
    if (uPat > 0.5 && uPat < 1.5) { // stripes
      float s = step(0.5, fract(vGUv.y * 90.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, uC2 * knit, s * 0.85);
    } else if (uPat > 1.5) { // dotted/floral-ish print
      vec2 g = fract(vGUv * 70.0) - 0.5;
      float d = smoothstep(0.22, 0.16, length(g + (hhash(floor(vGUv * 70.0)) - 0.5) * 0.3));
      diffuseColor.rgb = mix(diffuseColor.rgb, uC2 * knit, d);
    }
  }`);
  };
  m.customProgramCacheKey = () => 'mpfbGarment';
  return m;
}

export function makeTexturedMat(entryMat, k) {
  const alpha = k === 'brow' || k === 'lash';
  const m = new THREE.MeshStandardMaterial({
    map: tex(entryMat.d), normalMap: tex(entryMat.n, false), roughness: k === 'eye' ? 0.12 : (entryMat.r ?? 0.7), metalness: 0,
    alphaTest: alpha ? 0.3 : 0, side: alpha ? THREE.DoubleSide : THREE.FrontSide, name: k,
  });
  if (k === 'shoes') m.roughness = Math.max(0.35, m.roughness);
  if (k === 'cloth') m.roughness = 0.85;
  return m;
}


// ---------------- v2 library: one skinned mesh per LOD, shared atlases ----------------
// atlasS = skins (LOD0 body), atlasC = clothes / hair / eyes / small skins / white garment texel.
// COLOR_0: r = tint slot/16 (1 skin, 2 hair, 3+ garments), g = hem band, b = fabric/16, a = panel (pocket) mask; uv1 = cloth pattern space.
export function makeAtlasSkinMat(tint) {
  return makeSkinMat({ d: 'atlasS.jpg' }, tint);
}
export function makeAtlasMat(palette, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex('atlasC.webp'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, name: 'atlasC' });
  // optional re-tint of a baked-in top (the player's shirt): non-skin, non-denim texels between waist and collar height
  const topTint = opts.topTint != null ? new THREE.Color(opts.topTint) : null;
  m.userData.top = { value: topTint || new THREE.Color(1, 1, 1) };
  m.customProgramCacheKey = () => 'atlasC' + (topTint ? 'T' : '');
  const pal = []; for (let i = 0; i < 12; i++) pal.push(new THREE.Color(1, 1, 1));
  (palette || []).forEach((c, i) => { if (c !== undefined && c !== null) pal[i].set(c); });
  m.userData.pal = { value: pal };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPal = m.userData.pal; sh.uniforms.uTop = m.userData.top;
    sh.vertexShader = `#if !defined(USE_COLOR) && !defined(USE_COLOR_ALPHA)
attribute vec4 color;
#endif
#ifndef USE_UV1
attribute vec2 uv1;
#endif
varying vec4 vG; varying vec2 vU1; varying float vLY;
` + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vG = vec4(color); vU1 = uv1; vLY = position.y;');
    sh.fragmentShader = (topTint ? '#define TOP_TINT\n' : '') + 'uniform vec3 uPal[12]; uniform vec3 uTop; varying vec4 vG; varying vec2 vU1; varying float vLY;\n' + HASH + `
float foldH(vec2 u) { return 0.5 + 0.5 * sin(u.y * 24.0 + sin(u.x * 9.0) * 1.5); }
float fabricH(vec2 u, float fab) {
  // fine weave fades out with screen-space frequency (no moire), folds stay
  float fw = max(fwidth(u.x), fwidth(u.y));
  float h = 0.0, f = 1.0;
  if (fab < 1.5) { f = 260.0; vec2 q = u * vec2(f, f * 1.4); h = 0.5 + 0.5 * sin(q.x) * sin(q.y); }
  else if (fab < 2.5) { f = 420.0; h = 0.5 + 0.5 * sin((u.x + u.y) * f); }
  else if (fab < 3.5) { f = 300.0; h = 0.5 + 0.25 * sin(u.x * f) + 0.25 * sin(u.y * f * 1.1 + sin(u.x * 40.0)); }
  else if (fab < 4.5) { f = 500.0; h = 0.5 + 0.15 * sin(u.y * f); }
  else if (fab < 5.5) { f = 160.0; vec2 q = fract(u * f) - 0.5; h = smoothstep(0.35, 0.2, length(q)); }
  else if (fab < 6.5) { f = 340.0; h = 0.5 + 0.5 * sin(u.x * f) * sin(u.y * f * 0.5); }
  else if (fab < 7.5) { f = 220.0; h = 0.5 + 0.5 * smoothstep(0.75, 1.0, sin(u.x * f)); }
  else if (fab < 8.5) { f = 200.0; h = 0.5 + 0.2 * sin(u.x * f); }
  else { f = 120.0; h = 0.5 + 0.3 * sin(u.y * f + sin(u.x * 30.0) * 3.0); }
  float aa = 1.0 - smoothstep(0.15, 0.6, fw * f);
  h = mix(0.5, h, aa);
  // soft drape folds (low frequency)
  h += 0.12 * sin(u.y * 24.0 + sin(u.x * 9.0) * 1.5) + 0.05 * sin(u.x * 31.0 + u.y * 5.0);
  return h;
}
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
  float gSlot = floor(vG.r * 16.0 + 0.5);
  float gFab = floor(vG.b * 16.0 + 0.5);
#ifdef TOP_TINT
  if (gSlot < 1.5 && vLY > 0.9 && vLY < 1.5) {
    vec3 c0 = diffuseColor.rgb;
    float warm = c0.r - c0.b, lum0 = dot(c0, vec3(0.3, 0.59, 0.11));
    bool denim = c0.b > c0.g * 1.12 && c0.b > c0.r * 1.2;
    if (warm < 0.06 && !denim) diffuseColor.rgb = uTop * clamp(0.45 + lum0 * 2.6, 0.35, 1.25);
  }
#endif
  if (gSlot > 2.5) {
    vec3 tint = uPal[int(min(gSlot, 11.0))];
    float h = fabricH(vU1, gFab);
    float shade = 0.95 + 0.05 * h - 0.18 * vG.g;            // hems / seams slightly darker (folded edge)
    vec3 col = tint * shade;
    if (gFab > 4.5 && gFab < 5.5) col = mix(col, vec3(0.85, 0.87, 0.9), step(0.92, fract(vU1.y * 6.0)) * 0.9);   // reflective bands
    if (gFab > 6.5 && gFab < 7.5) col *= 0.93 + 0.07 * smoothstep(0.85, 1.0, sin(vU1.x * 220.0));               // guayabera pleats
    if (gFab > 9.5 && gFab < 10.5) {                         // police uniform: badge, shoulder patches, trouser stripe
      if (vG.a > 0.85) col = vec3(0.80, 0.82, 0.86);
      else if (vG.a > 0.5) col = mix(vec3(0.85, 0.68, 0.22), vec3(0.08, 0.12, 0.25), step(0.5, fract(vU1.x * 160.0 + vU1.y * 160.0)) * 0.6);
      else if (vG.a > 0.2) col = vec3(0.86, 0.70, 0.26);
    } else if (vG.a > 0.5) col *= 0.88;                      // pockets / panels
    diffuseColor.rgb = col;
  } else if (gSlot > 1.5) {
    float hl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb = uPal[2] * (0.55 + hl * 2.2);
  }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (floor(vG.r * 16.0 + 0.5) > 2.5) {
    float hh = foldH(vU1);
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
    float dhx = dFdx(hh), dhy = dFdy(hh);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
    normal = normalize(abs(det) * normal - grad * 0.006);
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  { float fs = floor(vG.r * 16.0 + 0.5); float fb = floor(vG.b * 16.0 + 0.5);
    if (fs > 2.5) roughnessFactor = (fb > 9.5 && vG.a > 0.85) ? 0.25 : fb > 3.5 && fb < 4.5 ? 0.45 : fb > 7.5 && fb < 8.5 ? 0.6 : 0.9;
    else if (fs > 1.5) roughnessFactor = 0.55; }`);
  };
  m.customProgramCacheKey = () => 'mpfbAtlasC' + (topTint ? 'T' : ''); // tinted (player) variant compiles its own program
  return m;
}

export function humanManifest() { return manifest; }

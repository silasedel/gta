// Shared vehicle materials: PBR paint with procedural wear (dirt, rain streaks, rust, sun fade, mismatched panel, two-tone),
// glass tints, chrome, plastics, rubber.  Every vehicle model in src/vehicles/** takes its materials from here so the whole
// fleet reads as one world.  API is stable (see src/vehicles/INTERNALS.md); the implementation may be improved in place.
//
// Wear is computed in the fragment shader from the mesh's own geometry-space position (attribute `position`), which for body
// panels must be SHELL space: ground y = 0, +Z forward, x = 0 centerline, meters.  Meshes that live in another local space
// (a door with its own pivot, a trailer) set material.userData.wearOffset (Vector3 added to the position before sampling).
import * as THREE from 'three';
import { linkEnv } from './envlink.js';

// ---------------------------------------------------------------- shared grime noise (generated once, tileable)
let _grime = null;
export function grimeTexture() {
  if (_grime) return _grime;
  const N = 256, data = new Uint8Array(N * N * 4);
  // tileable value noise, 4 independent channels: R blotches (fBm), G fine speckle, B streak columns, A rust cells
  const rnd = (s) => { let x = s | 0; return () => ((x = (x * 1664525 + 1013904223) | 0) >>> 0) / 4294967296; };
  const lattice = (P, seed) => { const r = rnd(seed), a = new Float32Array(P * P); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
  const sm = (t) => t * t * (3 - 2 * t);
  const sample = (L, P, x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const a = L[((yi % P + P) % P) * P + ((xi % P + P) % P)], b = L[((yi % P + P) % P) * P + (((xi + 1) % P + P) % P)];
    const c = L[(((yi + 1) % P + P) % P) * P + ((xi % P + P) % P)], d = L[(((yi + 1) % P + P) % P) * P + (((xi + 1) % P + P) % P)];
    return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
  };
  const oct = [4, 8, 16, 32, 64].map((P, i) => [P, lattice(P, 101 + i * 17)]);
  const oct2 = [8, 16, 32].map((P, i) => [P, lattice(P, 977 + i * 31)]);
  const speck = lattice(128, 4242), streak = lattice(64, 5151), streak2 = lattice(16, 6161);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, o = (y * N + x) * 4;
    let f = 0, amp = 0.5, tot = 0;
    for (const [P, L] of oct) { f += amp * sample(L, P, u * P, v * P); tot += amp; amp *= 0.55; }
    let g = 0; amp = 0.5; let tot2 = 0;
    for (const [P, L] of oct2) { g += amp * sample(L, P, u * P, v * P); tot2 += amp; amp *= 0.5; }
    data[o] = Math.round(255 * Math.min(1, Math.max(0, (f / tot - 0.2) / 0.6)));
    data[o + 1] = Math.round(255 * sample(speck, 128, u * 128, v * 128));
    // streaks: strongly stretched along v (use as vertical run-off when sampled with (z, y))
    data[o + 2] = Math.round(255 * Math.min(1, sample(streak, 64, u * 64, v * 3) * 0.7 + sample(streak2, 16, u * 16, v * 2) * 0.5));
    // rust cells: ridged noise -> blotchy islands with hard-ish edges
    const rr = Math.abs(g / tot2 - 0.5) * 2;
    data[o + 3] = Math.round(255 * Math.min(1, Math.max(0, 1 - rr * 1.6)));
  }
  _grime = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  _grime.wrapS = _grime.wrapT = THREE.RepeatWrapping;
  _grime.magFilter = THREE.LinearFilter; _grime.minFilter = THREE.LinearMipmapLinearFilter; _grime.generateMipmaps = true;
  _grime.needsUpdate = true;
  return _grime;
}

// ---------------------------------------------------------------- wear shader injection (shared by paint and other body mats)
const WEAR_VERT_DECL = /* glsl */`
varying vec3 vWearPos;
varying vec3 vWearN;
uniform vec3 uWearOffset;
`;
const WEAR_FRAG_DECL = /* glsl */`
uniform float uWet;
float wetBead = 0.0;
vec2 wetGrad = vec2(0.0);
// rain beads: one droplet per 9 mm cell, jittered, sized at random; beads sit on up-facing and side panels,
// run into streaks on steep sides; returns height 0..1 and its gradient for the clear-coat normal
void computeBeads(vec3 p, vec3 n) {
  if (uWet <= 0.001) {
    return;
  }
  float up = clamp(n.y, 0.0, 1.0);
  vec2 q = abs(n.y) > 0.5 ? p.xz : (abs(n.x) > 0.5 ? vec2(p.z, p.y * 0.55) : vec2(p.x, p.y * 0.55));
  q *= 110.0;
  vec2 c = floor(q);
  vec2 f = fract(q);
  float h = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(c, vec2(269.5, 183.3))) * 43758.5453);
  vec2 ctr = vec2(0.3, 0.3) + vec2(h, h2) * 0.4;
  float rad = 0.12 + 0.3 * h2;
  vec2 d = f - ctr;
  float k = 1.0 - dot(d, d) / (rad * rad);
  float present = step(1.0 - uWet * (0.35 + 0.55 * up), h);
  wetBead = clamp(k, 0.0, 1.0) * present;
  wetGrad = k > 0.0 ? -d / rad * present : vec2(0.0);
}
varying vec3 vWearPos;
varying vec3 vWearN;
uniform sampler2D uGrime;
uniform vec4 uWear;        // dirt, rust, fade, seed (0..1 each; seed 0..64)
uniform vec3 uDirtColor;
uniform vec4 uWearShape;   // dirtTopY, bodyLength/2, wheelbase/2, wheel radius
uniform vec4 uTwoTone;     // rgb = second color, a = split height (y below it gets the second color; <= 0 disables)
uniform vec4 uPatchMin;    // xyz = box min, w = strength (0 disables): a replaced panel in another color
uniform vec3 uPatchMax;
uniform vec3 uPatchColor;
uniform float uPatchSatin;  // 1 = the patch is a satin (non-metallic, no clear coat) panel, e.g. a matte black hood stripe
uniform vec4 uRoofTone;    // rgb = roof / pillar color, a = height above which it applies (<= 0 disables)
uniform float uFlake;      // metallic flake strength (0 = solid paint)
float wearDirt; float wearRust; float wearFade; float wearPatch = 0.0;
// metallic flake: sub-millimeter cells with random orientation; returns a normal tilt, faded out with distance (no shimmer)
vec3 flakeTilt(vec3 p) {
  vec3 c = floor(p * 900.0);
  float h1 = fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  float h2 = fract(sin(dot(c, vec3(269.5, 183.3, 246.1))) * 43758.5453);
  float h3 = fract(sin(dot(c, vec3(113.5, 271.9, 124.6))) * 43758.5453);
  float fw = length(fwidth(p)) * 900.0;
  return (vec3(h1, h2, h3) - 0.5) * (1.0 - smoothstep(0.2, 0.6, fw));
}
vec4 grimeTri(vec3 p, vec3 w) {
  return texture2D(uGrime, p.zy) * w.x + texture2D(uGrime, p.zx) * w.y + texture2D(uGrime, p.xy) * w.z;
}
void computeWear(inout vec3 albedo) {
  vec3 p = vWearPos; vec3 n = normalize(vWearN);
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  float seed = uWear.w;
  vec4 nLo = grimeTri(p * 0.37 + seed * 0.731, w);
  vec4 nHi = grimeTri(p * 1.9 + seed * 1.37, w);
  // two-tone split and a replaced panel (both before dirt, so grime lies over them)
  if (uTwoTone.a > 0.0) {
    float e = smoothstep(uTwoTone.a + 0.004, uTwoTone.a - 0.004, p.y);
    albedo = mix(albedo, uTwoTone.rgb, e);
  }
  if (uRoofTone.a > 0.0) {
    float e = smoothstep(uRoofTone.a - 0.004, uRoofTone.a + 0.004, p.y);
    albedo = mix(albedo, uRoofTone.rgb, e);
  }
  if (uPatchMin.w > 0.0) {
    vec3 inside = step(uPatchMin.xyz, p) * step(p, uPatchMax);
    wearPatch = inside.x * inside.y * inside.z * min(1.0, uPatchMin.w);
    albedo = mix(albedo, uPatchColor, wearPatch);
  }
  // road film: strongest low on the body and thrown up behind the wheels; a little dust on upward faces
  float low = 1.0 - smoothstep(uWearShape.w * 0.6, uWearShape.x, p.y);
  float behindF = exp(-pow((p.z - (uWearShape.z - uWearShape.w * 1.6)) / (uWearShape.w * 1.3), 2.0));
  float behindR = exp(-pow((p.z - (-uWearShape.z - uWearShape.w * 1.6)) / (uWearShape.w * 1.3), 2.0));
  float spray = max(behindF, behindR) * (1.0 - smoothstep(uWearShape.w * 1.2, uWearShape.w * 3.2, p.y));
  float topDust = smoothstep(0.55, 0.95, n.y) * 0.35;
  float streaks = texture2D(uGrime, vec2(p.z * 2.3 + seed, p.y * 0.21)).b * w.x;
  float d = uWear.x * (low * 1.25 + spray * 0.9 + topDust + streaks * 0.45 + 0.12);
  d *= 0.55 + 0.9 * nLo.r;
  d += uWear.x * uWear.x * (nHi.g - 0.5) * 0.25;
  wearDirt = clamp(d, 0.0, 1.0);
  // sun fade / clear-coat failure on upward faces (hood, roof, deck)
  float fadeMask = smoothstep(0.35, 0.9, n.y) * smoothstep(1.0 - uWear.z * 1.15, 1.0 - uWear.z * 0.6, nLo.r * 0.75 + nHi.r * 0.25 + 0.12);
  wearFade = clamp(fadeMask * step(0.02, uWear.z), 0.0, 1.0);
  // rust: creeps up from the sills and wheel-arch lips, plus scattered chips
  float edge = clamp(low * 0.9 + spray * 0.7, 0.0, 1.0);
  float rustN = nLo.a * 0.65 + nHi.a * 0.35;
  float rA = 1.15 - uWear.y * (0.45 + 0.6 * edge);
  float r = smoothstep(rA, rA + 0.07, rustN + edge * 0.25);
  wearRust = clamp(r * step(0.02, uWear.y), 0.0, 1.0);
  vec3 faded = mix(albedo, vec3(dot(albedo, vec3(0.33))) * 1.25 + 0.08, 0.6);
  albedo = mix(albedo, faded, wearFade);
  vec3 rustCol = mix(vec3(0.06, 0.02, 0.008), vec3(0.2, 0.075, 0.02), nHi.g);
  albedo = mix(albedo, rustCol, wearRust);
  albedo = mix(albedo, uDirtColor * (0.75 + 0.5 * nHi.r), wearDirt * 0.88);
}
`;

function injectWear(mat) {
  mat.onBeforeCompile = (shader) => {
    const U = mat.userData.wearUniforms;
    for (const k in U) shader.uniforms[k] = U[k];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + WEAR_VERT_DECL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWearPos = position + uWearOffset;\n  vWearN = normal;');
    shader.uniforms.uWet = PAINT_WET;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WEAR_FRAG_DECL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  computeWear(diffuseColor.rgb);\n  computeBeads(vWearPos, normalize(vWearN));\n  diffuseColor.rgb *= 1.0 - uWet * 0.14 * (1.0 - wearDirt);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.92, max(wearDirt * 0.9, max(wearRust, wearFade * 0.55)));\n  roughnessFactor = mix(roughnessFactor, 0.62, wearPatch * uPatchSatin);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor *= (1.0 - max(wearDirt * 0.85, wearRust));\n  metalnessFactor *= 1.0 - wearPatch * uPatchSatin;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n  #ifdef USE_CLEARCOAT\n  material.clearcoat *= (1.0 - max(wearDirt * 0.95, max(wearRust, wearFade))) * (1.0 - 0.9 * wearPatch * uPatchSatin);\n  material.clearcoat = max(material.clearcoat, uWet * 0.9);\n  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.015, uWet);\n  #endif')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  if (uFlake > 0.0) normal = normalize(normal + flakeTilt(vWearPos) * uFlake * (1.0 - wearDirt) * (1.0 - smoothstep(6.0, 10.0, length(vViewPosition))));')
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n  #ifdef USE_CLEARCOAT\n  if (wetBead > 0.0) clearcoatNormal = normalize(clearcoatNormal + vec3(wetGrad * 0.9, 0.0));\n  #endif');
  };
  mat.customProgramCacheKey = () => 'ps-wear-v3';
}

// Shared wetness for every car paint (0 dry .. 1 soaked, with beads).  Weather drives it: setPaintWetness(w).
export const PAINT_WET = { value: 0 };
export function setPaintWetness(w) {
  PAINT_WET.value = Math.max(0, Math.min(1, +w || 0));
}

const DIRT_COLORS = { dust: 0x9a8a72, sand: 0xb9a98a, mud: 0x4f4032, salt: 0xa9a8a2, soot: 0x2e2c2a, clay: 0x8a5a3a };
const hex = (h) => new THREE.Color(h);

/**
 * Per-car body paint.  One instance per car (uniform values are per car; the GL program is shared).
 * opts: { color, finish: 'gloss'|'metallic'|'pearl'|'matte'|'satin'|'chrome'|'primer'|'plastic', flake,
 *         wear: { dirt, rust, fade, seed, dirtColor: hex|'dust'|'mud'|... },
 *         twoTone: { color, y } | null, patch: { min:[x,y,z], max:[x,y,z], color, strength } | null,
 *         shape: { dirtTop, halfL, halfWb, r }  // from the model spec; defaults suit a sedan }
 * Change later with setPaintColor / setWear.
 */
export function carPaint(opts = {}) {
  const finish = opts.finish || 'metallic';
  const F = {
    gloss: { metalness: 0.05, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.025 },
    metallic: { metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.025 },
    pearl: { metalness: 0.35, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.03, sheen: 0.6, iridescence: 0.35 },
    matte: { metalness: 0.2, roughness: 0.78, clearcoat: 0, clearcoatRoughness: 0.5 },
    satin: { metalness: 0.4, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 },
    chrome: { metalness: 1, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 },
    primer: { metalness: 0, roughness: 0.9, clearcoat: 0, clearcoatRoughness: 0.6 },
    plastic: { metalness: 0, roughness: 0.62, clearcoat: 0, clearcoatRoughness: 0.5 },
  }[finish] || {};
  const m = new THREE.MeshPhysicalMaterial({
    color: opts.color ?? 0x888888, envMapIntensity: 1.2,
    metalness: opts.flake ?? F.metalness, roughness: F.roughness, clearcoat: F.clearcoat, clearcoatRoughness: F.clearcoatRoughness,
  });
  if (F.sheen) { m.sheen = F.sheen; m.sheenRoughness = 0.3; m.sheenColor = hex(opts.color ?? 0x888888).offsetHSL(0.08, 0, 0.1); }
  if (F.iridescence) { m.iridescence = F.iridescence; m.iridescenceIOR = 1.6; }
  const w = opts.wear || {}, sh = opts.shape || {};
  const dc = typeof w.dirtColor === 'string' ? DIRT_COLORS[w.dirtColor] ?? DIRT_COLORS.dust : w.dirtColor ?? DIRT_COLORS.dust;
  const tt = opts.twoTone, pt = opts.patch;
  m.userData.finish = finish;
  m.userData.wearUniforms = {
    uGrime: { value: grimeTexture() },
    uWear: { value: new THREE.Vector4(w.dirt ?? 0, w.rust ?? 0, w.fade ?? 0, ((w.seed ?? 0) % 64 + 64) % 64) },
    uDirtColor: { value: hex(dc) },
    uWearShape: { value: new THREE.Vector4(sh.dirtTop ?? 0.95, sh.halfL ?? 2.35, sh.halfWb ?? 1.4, sh.r ?? 0.33) },
    uTwoTone: { value: tt ? new THREE.Vector4(...hex(tt.color).toArray(), tt.y ?? 0.6) : new THREE.Vector4(0, 0, 0, 0) },
    uPatchMin: { value: pt ? new THREE.Vector4(pt.min[0], pt.min[1], pt.min[2], pt.strength ?? 1) : new THREE.Vector4(0, 0, 0, 0) },
    uPatchMax: { value: pt ? new THREE.Vector3(...pt.max) : new THREE.Vector3() },
    uPatchColor: { value: hex(pt?.color ?? 0x6a6d70) },
    uPatchSatin: { value: pt?.satin ? 1 : 0 },
    uWearOffset: { value: new THREE.Vector3() },
    uRoofTone: { value: opts.roofTone ? new THREE.Vector4(...hex(opts.roofTone.color).toArray(), opts.roofTone.y) : new THREE.Vector4(0, 0, 0, 0) },
    uFlake: { value: opts.flakeAmt ?? ({ metallic: 0.22, pearl: 0.16, satin: 0.12 }[finish] || 0) },
  };
  injectWear(m);
  return linkEnv(m);
}
/** A companion material that shares the wear uniforms of `paint` (same dirt on bumpers, cladding, trim, bed liner...). */
export function wornMaterial(paint, params) {
  const m = linkEnv(new THREE.MeshPhysicalMaterial({ envMapIntensity: 1, ...params }));
  m.userData.wearUniforms = { ...paint.userData.wearUniforms, uRoofTone: { value: new THREE.Vector4(0, 0, 0, 0) }, uFlake: { value: 0 }, uTwoTone: { value: new THREE.Vector4(0, 0, 0, 0) }, uPatchMin: { value: new THREE.Vector4(0, 0, 0, 0) }, uWearOffset: { value: new THREE.Vector3() } };
  injectWear(m);
  return linkEnv(m);
}
export function setPaintColor(mat, color, finish) {
  mat.color.set(color);
  if (finish && finish !== mat.userData.finish) { const n = carPaint({ color, finish }); for (const k of ['metalness', 'roughness', 'clearcoat', 'clearcoatRoughness', 'sheen', 'iridescence']) mat[k] = n[k]; mat.userData.finish = finish; n.dispose(); }
}
export function setWear(mat, { dirt, rust, fade, dirtColor } = {}) {
  const u = mat.userData.wearUniforms; if (!u) return;
  if (dirt != null) u.uWear.value.x = dirt; if (rust != null) u.uWear.value.y = rust; if (fade != null) u.uWear.value.z = fade;
  if (dirtColor != null) u.uDirtColor.value.set(typeof dirtColor === 'string' ? DIRT_COLORS[dirtColor] ?? DIRT_COLORS.dust : dirtColor);
}
export function setWearOffset(mat, x, y, z) { mat.userData.wearUniforms?.uWearOffset.value.set(x, y, z); }

// ---------------------------------------------------------------- shared (not per-car) materials
let S = null;
export function sharedMats() {
  if (S) return S;
  const std = (p) => linkEnv(new THREE.MeshStandardMaterial(p));
  const phys = (p) => linkEnv(new THREE.MeshPhysicalMaterial(p));
  S = {
    chrome: std({ color: 0xe9edf0, metalness: 1, roughness: 0.07, envMapIntensity: 1.4 }),
    chromeDark: std({ color: 0x4a4e53, metalness: 1, roughness: 0.16 }),
    brushed: std({ color: 0xb9bdc2, metalness: 1, roughness: 0.34 }),
    steel: std({ color: 0x7c8187, metalness: 0.9, roughness: 0.5 }),
    galvanized: std({ color: 0x9aa0a4, metalness: 0.8, roughness: 0.62 }),
    blackPlastic: std({ color: 0x121315, metalness: 0, roughness: 0.62 }),
    greyPlastic: std({ color: 0x3b3e42, metalness: 0, roughness: 0.7 }),
    texturedPlastic: std({ color: 0x1a1b1d, metalness: 0, roughness: 0.85 }),
    pianoBlack: phys({ color: 0x050506, metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    rubber: std({ color: 0x0e0e0f, metalness: 0, roughness: 0.93 }),
    tire: std({ color: 0x131313, metalness: 0, roughness: 0.9 }),
    underbody: std({ color: 0x08090a, metalness: 0.1, roughness: 1 }),
    carbon: phys({ color: 0x0c0d0f, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
    leatherBlack: std({ color: 0x17171a, roughness: 0.6 }), leatherTan: std({ color: 0x8a623c, roughness: 0.6 }),
    leatherRed: std({ color: 0x6e1418, roughness: 0.58 }), leatherCream: std({ color: 0xcdbf9f, roughness: 0.62 }),
    clothGrey: std({ color: 0x4a4c50, roughness: 0.95 }), clothBeige: std({ color: 0x9c8f78, roughness: 0.95 }), clothBlack: std({ color: 0x1c1d20, roughness: 0.96 }),
    vinyl: std({ color: 0x2a2b2e, roughness: 0.7 }),
    brakeDisc: std({ color: 0x5c6064, metalness: 0.9, roughness: 0.42 }),
    mirror: std({ color: 0xdfe6ec, metalness: 1, roughness: 0.02, envMapIntensity: 1.6 }),
    lensClear: phys({ color: 0xffffff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.28, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, depthWrite: false }),
    glassBroken: std({ color: 0x9aa3a8, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0.18, depthWrite: false }),
    burnt: std({ color: 0x16120f, metalness: 0.2, roughness: 0.85 }),
    _glass: [], _calipers: new Map(), _rims: new Map(),
  };
  return S;
}
/** Window glass by tint level: 0 clear (factory green-ish), 1 light, 2 dark, 3 limo.  Shared instances. */
export function glassMat(tint = 1) {
  const s = sharedMats(), t = Math.max(0, Math.min(3, tint | 0));
  if (!s._glass[t]) {
    const P = [{ color: 0x9fb4b0, opacity: 0.3 }, { color: 0x3a4a4c, opacity: 0.5 }, { color: 0x10171b, opacity: 0.74 }, { color: 0x040608, opacity: 0.9 }][t];
    s._glass[t] = linkEnv(new THREE.MeshPhysicalMaterial({ ...P, metalness: 0.1, roughness: 0.04, transparent: true, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, depthWrite: false }));
  }
  return s._glass[t];
}
/** Wheel rim finish; shared per (color, finish). finish: 'alloy'|'polished'|'chrome'|'gloss'|'satin'|'steel' */
export function rimMat(color = 0xc9ced3, finish = 'alloy') {
  const s = sharedMats(), k = color + ':' + finish;
  if (!s._rims.has(k)) {
    const P = { alloy: [0.95, 0.24], polished: [1, 0.1], chrome: [1, 0.04], gloss: [0.6, 0.18], satin: [0.8, 0.42], steel: [0.6, 0.6] }[finish] || [0.95, 0.24];
    s._rims.set(k, linkEnv(new THREE.MeshStandardMaterial({ color, metalness: P[0], roughness: P[1], envMapIntensity: 1.2 })));
  }
  return s._rims.get(k);
}
export function caliperMat(color = 0x333333) {
  const s = sharedMats();
  if (!s._calipers.has(color)) s._calipers.set(color, new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4 }));
  return s._calipers.get(color);
}
/** Emissive lamp material (per car: vehicles.js drives emissiveIntensity). kind: 'head'|'tail'|'amber'|'reverse'|'drl'|'red'|'blue'|'white' */
export function lampMat(kind = 'head', extra = {}) {
  const P = {
    head: { color: 0x8f989f, emissive: 0xfff2dc, metalness: 0.9, roughness: 0.1 },   // chrome reflector seen through a clear lens, not a white blob
    drl: { color: 0xffffff, emissive: 0xe8f2ff, roughness: 0.2 },
    tail: { color: 0x5a0606, emissive: 0xff1a0a, roughness: 0.25 },
    amber: { color: 0x8a4a00, emissive: 0xff8a00, roughness: 0.3 },
    reverse: { color: 0xbfbfbf, emissive: 0xffffff, roughness: 0.2 },
    red: { color: 0x400000, emissive: 0xff0a0a, roughness: 0.3 },
    blue: { color: 0x000a40, emissive: 0x1a3cff, roughness: 0.3 },
    white: { color: 0xd8dde0, emissive: 0xffffff, roughness: 0.2 },
  }[kind] || {};
  // lamps are conformal patches a few millimeters off the body: pull them forward in depth so they never z-fight at range
  return new THREE.MeshStandardMaterial({
    emissiveIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    ...P,
    ...extra,
  });
}
export { DIRT_COLORS };

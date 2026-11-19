// Materials for the merged car bodies (model/body/*).  A car draws with at most five calls at LOD0:
//   paint  (per car: model/materials.js carPaint, clear coat + flake + wear + wet beads)
//   trim   (one shared material for every car: vertex color + per-vertex roughness/metalness + procedural patterns
//           for grille mesh, slats, tread; black plastics, chrome, rubber, lamp housings, interior)
//   glass  (shared per tint: windows tinted, lamp lenses clear, both in one mesh via a per-vertex flag)
//   lamp   (per car: emissive channels driven through lightMats proxies + the car's plate / badge / lettering decal sheet)
//   wheels (one InstancedMesh for the four wheels, spin applied in the vertex shader)
import * as THREE from 'three';
import { linkEnv } from '../envlink.js';

// ---------------------------------------------------------------- trim
// pattern ids (aPat): 0 none, 1 honeycomb mesh, 2 horizontal slats, 3 tire tread (uses uv), 4 vertical slats,
// 5 square mesh, 6 tire sidewall rings (uses uv), 7 seat stitching (quilted), 8 brake disc (radial grooves, uses uv)
export const PAT = { none: 0, hex: 1, slats: 2, tread: 3, vslats: 4, square: 5, sidewall: 6, quilt: 7, disc: 8 };
const TRIM_VERT = /* glsl */`
attribute vec2 aRM;
attribute float aPat;
varying vec2 vRM;
varying float vPat;
varying vec3 vObjPos;
varying vec3 vObjN;
`;
const TRIM_FRAG = /* glsl */`
varying vec2 vRM;
varying float vPat;
varying vec3 vObjPos;
varying vec3 vObjN;
float patMask = 0.0;
vec2 planeUV(vec3 p, vec3 n) {
  vec3 a = abs(n);
  return a.z >= a.x && a.z >= a.y ? p.xy : (a.x >= a.y ? p.zy : p.xz);
}
float hexHole(vec2 q) {
  q *= 1.0 / 0.017;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(q, r) - h;
  vec2 b = mod(q - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 ag = abs(g);
  float d = max(dot(ag, normalize(vec2(1.0, 1.7320508))), ag.x);
  float aa = fwidth(d) * 1.2 + 1e-4;
  return 1.0 - smoothstep(0.36 - aa, 0.36 + aa, d);
}
void applyPattern(inout vec3 col) {
  int pt = int(vPat + 0.5);
  if (pt == 0) return;
  vec3 n = normalize(vObjN);
  vec2 q = planeUV(vObjPos, n);
  float fade = 1.0 - smoothstep(0.012, 0.05, fwidth(q.x) + fwidth(q.y));
  if (fade < 0.02) { col *= 0.45; return; }
  float hole = 0.0;
  if (pt == 1) hole = hexHole(q);
  else if (pt == 2 || pt == 4) {
    float c = (pt == 2 ? q.y : q.x) / 0.042;
    float f = abs(fract(c) - 0.5);
    float aa = fwidth(c) + 1e-4;
    hole = smoothstep(0.24 - aa, 0.24 + aa, f);
  }
  else if (pt == 5) {
    vec2 c = q / 0.014;
    vec2 f = abs(fract(c) - 0.5);
    float aa = fwidth(c.x) + 1e-4;
    hole = smoothstep(0.12 - aa, 0.12 + aa, min(f.x, f.y));
  }
  else if (pt == 3) {
    vec2 uv = vUv;
    float g1 = smoothstep(0.03, 0.0, abs(fract(uv.y * 4.0) - 0.5) - 0.44);
    float blocks = step(0.5, fract(uv.x * 54.0 + step(0.5, fract(uv.y * 2.0)) * 0.5));
    float sipe = smoothstep(0.08, 0.0, abs(fract(uv.x * 108.0 + uv.y * 3.0) - 0.5) - 0.42);
    hole = max(g1, sipe * 0.6) * fade + blocks * 0.1;
    col *= 1.0 - hole * 0.55;
    patMask = hole;
    return;
  }
  else if (pt == 6) {
    float r = vUv.y;
    float ring = smoothstep(0.012, 0.0, abs(fract(r * 7.0) - 0.5) - 0.47);
    float letters = step(0.6, fract(vUv.x * 46.0)) * step(0.35, r) * step(r, 0.62) * step(0.55, fract(vUv.x * 2.0 + 0.1));
    col *= 1.0 + ring * 0.6 + letters * 0.9;
    return;
  }
  else if (pt == 7) {
    vec2 c = q / 0.07;
    vec2 f = abs(fract(c) - 0.5);
    float seam = smoothstep(0.03, 0.0, min(f.x, f.y) - 0.0);
    col *= 1.0 - seam * 0.35 * fade;
    patMask = 0.0;
    return;
  }
  else if (pt == 8) {
    float slot = smoothstep(0.02, 0.0, abs(fract(vUv.x * 18.0 + vUv.y * 1.5) - 0.5) - 0.47) * step(0.25, vUv.y);
    col *= 1.0 - slot * 0.5 * fade;
    return;
  }
  hole *= fade;
  col = mix(col, vec3(0.006), hole * 0.92);
  patMask = hole;
}
`;
let _trim = null, _trimWorn = null;
/** trim of every library car; trimMaterial({ worn: true }): old cars - chrome gone flat and milky, rubber chalky (shared) */
export function trimMaterial(o = {}) {
  if (o.worn) return (_trimWorn ||= wornTrim());
  if (_trim) return _trim;
  // W2 (Nov 19 playtest: flickering layers / "diamonds" on bodies): seals, badges' plates, decal film and cowl panels lie on
  // the paint within a millimeter or two; a small depth pull makes the trim win those ties at every range instead of
  // alternating triangle by triangle (hidden under-skins 0-3 cm behind the paint are deleted by the converter)
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0, envMapIntensity: 1.25, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + TRIM_VERT)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRM = aRM; vPat = aPat; vObjPos = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TRIM_FRAG)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  applyPattern(diffuseColor.rgb);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(vRM.x, 0.95, patMask);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = vRM.y * (1.0 - patMask);');
    if (!sh.fragmentShader.includes('varying vec2 vUv;')) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'varying vec2 vUv;\n#include <common>');
    if (!sh.vertexShader.includes('varying vec2 vUv;')) sh.vertexShader = sh.vertexShader.replace('#include <common>', 'varying vec2 vUv;\n#include <common>').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vUv = uv;');
  };
  m.customProgramCacheKey = () => 'ps-cartrim-v1';
  _trim = m;
  return m;
}
function wornTrim() {
  const base = trimMaterial(), m = base.clone(); m.name = 'car-trim-worn';
  m.onBeforeCompile = (sh) => {
    base.onBeforeCompile(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = max(roughnessFactor, vRM.y > 0.5 ? 0.38 : 0.62);')
      .replace('applyPattern(diffuseColor.rgb);', 'applyPattern(diffuseColor.rgb);\n  if (vRM.y > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.41, 0.39), 0.35);\n  else if (dot(diffuseColor.rgb, vec3(0.33)) < 0.06) diffuseColor.rgb += vec3(0.022, 0.02, 0.018);\n  else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15))) * 0.95 + 0.03, 0.45);');
  };
  m.customProgramCacheKey = () => 'ps-cartrim-worn-v2';
  return m;
}

// ---------------------------------------------------------------- wheels (instanced; spin about local X in the shader)
// attributes: aRM, aPat (as trim), aTint (1 = takes the per-car rim color), aFix (1 = does not spin: caliper)
// instanced: instanceMatrix (steer frame), aSpin (radians), instanceColor (rim color)
const WHEEL_VERT = /* glsl */`
attribute float aTint;
attribute float aFix;
attribute float aSpin;
attribute vec3 aRim;
varying float vTint;
varying vec3 vRim;
`;
const _wheelMats = new Map();
export function wheelMaterial(finish = 'alloy') {
  if (_wheelMats.has(finish)) return _wheelMats.get(finish);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0, envMapIntensity: 1.3 });
  const RM = { alloy: [0.28, 0.92], chrome: [0.05, 1.0], gloss: [0.2, 0.55], satin: [0.42, 0.8], steel: [0.55, 0.55], plastic: [0.45, 0.2] }[finish] || [0.28, 0.92];
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRimRM = { value: new THREE.Vector2(RM[0], RM[1]) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUv;\n' + TRIM_VERT + WHEEL_VERT)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float sa = aSpin * (1.0 - aFix);
  float cs = cos(sa), sn = sin(sa);
  objectNormal = vec3(objectNormal.x, cs * objectNormal.y - sn * objectNormal.z, sn * objectNormal.y + cs * objectNormal.z);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed = vec3(transformed.x, cs * transformed.y - sn * transformed.z, sn * transformed.y + cs * transformed.z);
  vRM = aRM; vPat = aPat; vObjPos = position; vObjN = normal; vUv = uv; vTint = aTint; vRim = aRim;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUv;\nvarying float vTint;\nvarying vec3 vRim;\nuniform vec2 uRimRM;\n' + TRIM_FRAG)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(vec3(1.0), vRim, vTint);\n  applyPattern(diffuseColor.rgb);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(mix(vRM.x, uRimRM.x, vTint), 0.95, patMask);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix(vRM.y, uRimRM.y, vTint) * (1.0 - patMask);');
  };
  m.customProgramCacheKey = () => 'ps-carwheel-v1-' + finish;
  _wheelMats.set(finish, m);
  return m;
}

// ---------------------------------------------------------------- glass (windows tinted per car tint level; lamp lenses clear)
const _glass = [];
// r3 (user: "weird glitched windows, the transparency isn't looking good, the layers are weird"): one physically plausible
// pane.  Absorption by tint level (factory glass passes ~65 %, privacy ~15 %); the reflection is added on top at full
// strength (premultiplied), so the cabin reads through the glass but darker, and the street mirrors at grazing angles.
// ?r3car=0 restores the r2 look (opacity 0.62 / 0.74 / 0.8 / 0.92, fake-sky veil, no face-forward normals).
export const R3CAR = (() => { try { return new URLSearchParams(location.search).get('r3car') !== '0'; } catch (e) { return true; } })();
const TINTS = R3CAR ? [
  { color: 0x2a3634, opacity: 0.36 },   // 0 factory (faint green)
  { color: 0x1a2326, opacity: 0.46 },   // 1 light
  { color: 0x0e1418, opacity: 0.64 },   // 2 dark
  { color: 0x030507, opacity: 0.86 },   // 3 limo / privacy
] : [
  { color: 0x34413f, opacity: 0.62 },   // 0 factory (green-ish; still dark enough to reflect)
  { color: 0x1c2528, opacity: 0.74 },   // 1 light (ref_57: dark enough that the reflection reads over the cabin)
  { color: 0x0e1418, opacity: 0.8 },    // 2 dark
  { color: 0x030507, opacity: 0.92 },   // 3 limo
];
let _dusty = null;
/** glassMaterial(tint): windows by tint level; glassMaterial(0, { dusty: true }): an old parked car's dusty, hazy glass (shared) */
export function glassMaterial(tint = 1, o = {}) {
  if (o.dusty) {
    if (_dusty) return _dusty;
    const m = glassMaterial(0).clone(); m.onBeforeCompile = glassMaterial(0).onBeforeCompile; m.premultipliedAlpha = true;
    m.color.set(0x6b6a62); m.opacity = 0.78; m.roughness = 0.34; m.clearcoatRoughness = 0.3; m.envMapIntensity = 0.75; m.name = 'car-glass-dusty';
    m.customProgramCacheKey = () => 'ps-carglass-v2';
    return (_dusty = m);
  }
  const t = Math.max(0, Math.min(3, tint | 0));
  if (_glass[t]) return _glass[t];
  const P = TINTS[t];
  const m = new THREE.MeshPhysicalMaterial({ color: P.color, opacity: P.opacity, transparent: true, depthWrite: false, metalness: 0, roughness: 0.1,   // 0.06 put a hot sun blob on side glass (QA #17)
    // art guide: glass env <= 1.5 (2.6 painted a white sky sheet on every windshield)
    clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.35, side: THREE.DoubleSide, specularIntensity: 0.8,
    // the window wins its near-coplanar ties with cowl / seal trim (the black sawtooth "diamonds" along a windshield base)
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  linkEnv(m);
  const R3 = R3CAR;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWin;\nvarying float vWin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWin = aWin;');
    if (R3) {
      // face-forward: a quarter of some models' window triangles are wound inward (truck9, hatch1), so on a DoubleSide pane
      // their normal pointed into the cabin and they mirrored the ground = the dark polygon patches on the windshield
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  if (dot(normal, vViewPosition) < 0.0) normal = -normal;\n  nonPerturbedNormal = normal;')
        .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\n  if (dot(clearcoatNormal, vViewPosition) < 0.0) clearcoatNormal = -clearcoatNormal;');
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWin;')
      // lens (vWin 0): near-clear, a hint of the lamp color below; window (1): the tint.  Fresnel keeps grazing glass reflective.
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor = mix(vec4(0.92, 0.94, 0.96, 0.1), diffuseColor, vWin);')
      // premultiplied output: the tint (diffuse) is scaled by alpha, the reflection (specular + clearcoat) is added at full
      // strength, so a dark window still mirrors the sky and street like real glass
      .replace('#include <opaque_fragment>', R3 ? `float cv = clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0);
  float fr = pow(1.0 - cv, 5.0);   // Schlick: ~4 % face on, a mirror only at grazing angles
  float ga = clamp(diffuseColor.a + fr * 0.7 * vWin, 0.0, 1.0);
  vec3 spec = max(outgoingLight - totalDiffuse - totalEmissiveRadiance, vec3(0.0)) * (0.6 + 0.4 * fr);
  vec3 rw = inverseTransformDirection(reflect(normalize(-vViewPosition), normal), viewMatrix);
  vec3 skyC = mix(vec3(0.16, 0.15, 0.14), mix(vec3(0.75, 0.82, 0.9), vec3(0.32, 0.5, 0.78), clamp(rw.y * 1.6, 0.0, 1.0)), smoothstep(-0.12, 0.05, rw.y));
  // no flat gray veil face on (the r2 sky term, 8 %+, read as milky fog over the cabin); sky mostly at grazing angles
  spec += skyC * vWin * (0.02 + 0.45 * fr);
  gl_FragColor = vec4(totalDiffuse * ga + spec, ga);` : `float fr = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 3.0);
  float ga = clamp(diffuseColor.a + fr * 0.6 * vWin, 0.0, 1.0);
  vec3 spec = max(outgoingLight - totalDiffuse - totalEmissiveRadiance, vec3(0.0)) * (0.5 + 0.6 * fr);
  // sky / street mirror: a world-space sky gradient seen in the reflected direction (works without a scene env map)
  vec3 rw = inverseTransformDirection(reflect(normalize(-vViewPosition), normal), viewMatrix);
  vec3 skyC = mix(vec3(0.16, 0.15, 0.14), mix(vec3(0.75, 0.82, 0.9), vec3(0.32, 0.5, 0.78), clamp(rw.y * 1.6, 0.0, 1.0)), smoothstep(-0.12, 0.05, rw.y));
  spec += skyC * vWin * (0.08 + 0.32 * fr); // (was 0.12 + 0.55: side glass read as an opaque silver mirror, people inside invisible)
  gl_FragColor = vec4(totalDiffuse * ga + spec, ga);`)
      .replace('#include <premultiplied_alpha_fragment>', '');
  };
  m.premultipliedAlpha = true;
  m.customProgramCacheKey = () => 'ps-carglass-v3' + (R3 ? '-r3' : '');
  _glass[t] = m;
  return m;
}
let _broken = null;
export function brokenGlass() {
  return _broken ||= new THREE.MeshStandardMaterial({ color: 0x9aa3a8, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
}

// ---------------------------------------------------------------- lamps + decals (per car)
// channels (aLamp): see LAMP; base color from vertex color, decal texels from the car's decal sheet (uv), alpha-tested.
export const LAMP = { none: 0, head: 1, drl: 2, lens: 3, fog: 4, tail: 5, tailLed: 6, reverse: 7, blinkL: 8, blinkR: 9, red: 10, blue: 11, sign: 12, amber: 13, plate: 14 };
const NCH = 16; // 15 = seat trim (base color times the car's trim color)
const LAMP_EMISSIVE = { head: 0xfff2dc, drl: 0xe8f2ff, lens: 0xfff6e8, fog: 0xffffff, tail: 0xff0402, tailLed: 0xff0a04, reverse: 0xffffff, blinkL: 0xff8a00, blinkR: 0xff8a00,
  red: 0xff0a0a, blue: 0x1a3cff, sign: 0xffe9a0, amber: 0xff8a00, plate: 0xfff4e0 };
// a lightMats entry: what vehicles.js and net/session.js touch (emissiveIntensity, color, emissive, dispose)
function proxy(kind) {
  return { isLampProxy: true, kind, emissiveIntensity: 0, emissive: new THREE.Color(LAMP_EMISSIVE[kind] ?? 0xffffff), color: new THREE.Color(0xffffff), dispose() {} };
}
/** -> { material, lightMats, sync() } ; sheet = { texture } (the per-car decal canvas) */
export function lampMaterial(sheet, opts = {}) {
  const lightMats = {};
  for (const k of Object.keys(LAMP)) if (k !== 'none') lightMats[k] = proxy(k);
  if (opts.ambulance) lightMats.blue.emissive.setHex(0xffffff);
  if (opts.fire) lightMats.blue.emissive.setHex(0xff2a0a);
  if (opts.busSign) lightMats.sign.emissive.setHex(0xffb020);
  const E = Array.from({ length: NCH }, () => new THREE.Vector3());
  const keys = Object.keys(LAMP);
  const uniforms = { uLampE: { value: E }, uSeat: { value: new THREE.Color(opts.seat ?? 0x5a5c61) } };
  // a real lamp build-up on every car: a clear polycarbonate lens on top (clear coat: sharp sun / sky reflection), behind it a
  // chrome reflector bowl with fine facets (head / fog / reverse / DRL), or a deep colored lens with optics ridges (tail, brake,
  // blinkers: the color reads darker at grazing angles, i.e. from the depth of the lens, not a flat red paint); lit lamps glow
  // from a hot core outward through the facets instead of a flat emissive slab
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, map: sheet?.texture || null, alphaTest: 0.35, roughness: 0.35, metalness: 0, envMapIntensity: 1.2,
    clearcoat: 1, clearcoatRoughness: 0.035, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  m.name = 'car-lamp';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLampE = uniforms.uLampE; sh.uniforms.uSeat = uniforms.uSeat;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLamp;\nattribute vec2 aRM;\nvarying float vLamp;\nvarying vec2 vRM;\nvarying vec3 vLampP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLamp = aLamp; vRM = aRM; vLampP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uLampE[${NCH}];\nuniform vec3 uSeat;\nvarying float vLamp;\nvarying vec2 vRM;\nvarying vec3 vLampP;`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  if (vLamp > 14.5) diffuseColor.rgb *= uSeat;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = vRM.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    int ch = int(vLamp + 0.5);
    float ndv = clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0);
    // optics: fine reflector facets / lens ridges in the lamp's own space (no UVs needed), fading out with distance
    float near = 1.0 - smoothstep(4.0, 14.0, length(vViewPosition));
    // parallax: the reflector / optics sit ~3 cm behind the lens, so their pattern slides against the lens with the view
    vec3 lp3 = vLampP + vec3(normalize(vViewPosition).xy * 0.03, 0.0);
    float facet = 0.5 + 0.5 * sin(lp3.x * 260.0) * sin(lp3.y * 260.0 + lp3.z * 180.0);
    float ridge = 0.5 + 0.5 * sin((lp3.y + lp3.x * 0.3) * 420.0);
    bool white = ch == 1 || ch == 2 || ch == 3 || ch == 4 || ch == 7;
    bool colored = ch == 5 || ch == 6 || ch == 8 || ch == 9 || ch == 10 || ch == 13;
    #ifdef LAMP_LEGACY
    white = false; colored = false; ndv = 1.0; near = 0.0;
    #endif
    if (white) { // chrome reflector bowl behind clear polycarbonate
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.81, 0.83), 0.65) * (1.0 - 0.18 * facet * near);
      metalnessFactor = 0.92; roughnessFactor = mix(0.07, 0.2, facet * near);
    } else if (colored) { // deep tinted lens: darker and more saturated at grazing angles, ridged optics
      diffuseColor.rgb *= (0.38 + 0.62 * ndv) * (1.0 - 0.22 * ridge * near);
      metalnessFactor = 0.0; roughnessFactor = 0.12;
    }
    vec3 E = uLampE[ch];
    // lit: a tight hot core seen head-on, the light breaking through facets / ridges; the lens body stays readable (head lamps
    // are capped so bloom does not swallow the front end: the beam goes onto the road, not into the lens)
    if (white) E = min(E, vec3(1.6));
    float core = white ? 0.35 + 2.6 * pow(ndv, 9.0) : 0.45 + 0.75 * pow(ndv, 1.6);
    float tex = white ? 0.75 + 0.5 * facet * near : colored ? 0.7 + 0.45 * ridge * near : 1.0;
    totalEmissiveRadiance = E * core * tex;
  }`);
  };
  if (globalThis.__lampLegacy) { m.defines = { LAMP_LEGACY: '' }; m.clearcoat = 0; } // A/B: the old flat lamp (studio ?lampv1)
  m.customProgramCacheKey = () => 'ps-carlamp-v3' + (globalThis.__lampLegacy ? 'L' : '');
  const broken = new Set();
  const sync = () => {
    for (let i = 1; i < 15; i++) {
      const p = lightMats[keys[i]];
      if (!p) continue;
      const k = p.emissiveIntensity;
      E[i].set(p.emissive.r * k, p.emissive.g * k, p.emissive.b * k);
    }
    // channel aliases: the amber side markers follow the blinkers; the plate lamp follows the tail lamps
    E[LAMP.amber].copy(E[LAMP.blinkL]).max(E[LAMP.blinkR]);
    const t = lightMats.tail.emissiveIntensity;
    E[LAMP.plate].set(1, 0.96, 0.88).multiplyScalar(t > 1.5 ? 0.25 : 0);
  };
  return { material: m, lightMats, sync, broken, uniforms };
}

// ---------------------------------------------------------------- per-car decal sheet (plate, badge, model lettering)
// layout (512 x 128): plate [0,256) x [0,128); badge [256,384) x [0,128); lettering [384,512) x [0,64); white [496,512) x [112,128)
export const SHEET = { w: 512, h: 128, plate: [0, 0, 256, 128], badge: [256, 0, 128, 128], letter: [384, 0, 128, 64], white: [500, 116, 8, 8] };
export function sheetUV(region, u, v) { // u, v in 0..1 inside the region (v up)
  const [x, y, w, h] = SHEET[region];
  return [(x + u * w) / SHEET.w, 1 - (y + (1 - v) * h) / SHEET.h];
}

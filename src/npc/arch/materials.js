// NPC materials (PEOPLE-LOOK track).
// - Body: ONE physical material for skin and clothes. The archetype atlas carries albedo + material byte (map RGBA,
//   A = slot << 5 | fabric) and a half-size packed map (R,G tangent normal, B ambient occlusion). The fabric picks roughness,
//   specular, sheen, metalness and a tiling micro-normal (knit, rib, weave, twill, pique, pores, grain, ripstop),
//   so cloth reads as cloth up close and skin gets wrap lighting with a warm scatter instead of plastic shine.
//   Per person: skin tint, hair tint, and a hue / value shift per garment slot (one archetype, many looks).
// - Hair: matte cards, alpha-tested, Kajiya-Kay specular with two weak shifted lobes (no shiny helmet).
// - Eyes, brows, lashes, shoes: small standard materials on shared textures.
import * as THREE from 'three';
import { RENDER_R2, A2C_R2_GLSL } from '../../render/frameNoise.js';

// fabric table: [roughness, specular, sheen, sheenRough, metal, microTile, microRepeat (per UV unit), microStrength]
export const FABRICS = [
  [0.57, 0.24, 0.00, 0.5, 0, 5, 140, 0.22],   // 0 skin
  [0.92, 0.28, 0.45, 0.65, 0, 0, 48, 0.55],   // 1 jersey
  [0.92, 0.28, 0.45, 0.65, 0, 1, 38, 0.65],   // 2 rib
  [0.90, 0.28, 0.40, 0.6, 0, 4, 44, 0.55],    // 3 pique
  [0.86, 0.34, 0.18, 0.5, 0, 3, 52, 0.75],    // 4 denim
  [0.84, 0.34, 0.18, 0.5, 0, 3, 70, 0.5],     // 5 twill
  [0.76, 0.38, 0.22, 0.45, 0, 2, 85, 0.35],   // 6 poplin / oxford
  [0.90, 0.30, 0.18, 0.6, 0, 2, 46, 0.65],    // 7 linen
  [0.80, 0.34, 0.28, 0.5, 0, 3, 95, 0.38],    // 8 suiting
  [0.64, 0.38, 0.2, 0.5, 0, 7, 70, 0.3],      // 9 nylon (matte cotton-nylon)
  [0.30, 0.62, 0.65, 0.3, 0, 2, 130, 0.12],   // 10 satin
  [0.48, 0.48, 0.00, 0.5, 0, 6, 36, 0.4],     // 11 leather
  [0.42, 0.50, 0.25, 0.4, 0, 0, 95, 0.22],    // 12 lycra
  [0.80, 0.30, 0.20, 0.5, 0, 7, 30, 0.65],    // 13 mesh
  [0.93, 0.28, 0.12, 0.6, 0, 2, 36, 0.7],     // 14 canvas
  [0.95, 0.24, 0.50, 0.7, 0, 1, 20, 0.85],    // 15 knit (beanies)
  [0.64, 0.40, 0.28, 0.45, 0, 2, 110, 0.22],  // 16 rayon
  [0.40, 0.55, 0.55, 0.3, 0, 2, 150, 0.12],   // 17 silk
  [0.84, 0.34, 0.16, 0.5, 0, 3, 62, 0.45],    // 18 drill
  [0.80, 0.34, 0.16, 0.5, 0, 3, 84, 0.42],    // 19 uniform
  [0.72, 0.34, 0.00, 0.5, 0, 6, 46, 0.3],     // 20 rubber
  [0.95, 0.24, 0.35, 0.7, 0, 2, 30, 0.8],     // 21 tweed
  [0.80, 0.28, 0.10, 0.6, 0, 5, 140, 0.3],    // 22 short hair / stubble on skin
  [0.34, 0.50, 0.00, 0.5, 0, 6, 200, 0.05],   // 23 poly (buttons)
  [0.30, 1.00, 0.00, 0.5, 1, 6, 200, 0.05],   // 24 metal (zips, badges)
  [0.12, 0.70, 0.00, 0.5, 0, 6, 200, 0.02],   // 25 patent leather
];

// ------------------------------------------------------------------ micro-normal atlas (4 x 2 tiles of 256 px)
let _micro = null;
function* tileHeight(k, N) { // generator: yields every 32 rows (boot pacing); returns the height field
  const h = new Float32Array(N * N);
  const rnd = mulberry(1000 + k);
  const noise = valueNoise(N, 16, rnd), noise2 = valueNoise(N, 64, rnd);
  for (let y = 0; y < N; y++) { if (y && (y & 31) === 0) yield; for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N; let val = 0;
    if (k === 0) {        // jersey: columns of V loops
      const cx = 16, cy = 22; const fx = (u * cx) % 1, fy = (v * cy) % 1;
      const a = Math.exp(-(((fx - 0.27) - (fy - 0.5) * 0.35) ** 2) / 0.018 - ((fy - 0.5) ** 2) / 0.12);
      const b = Math.exp(-(((fx - 0.73) + (fy - 0.5) * 0.35) ** 2) / 0.018 - ((fy - 0.5) ** 2) / 0.12);
      val = a + b + noise2[y * N + x] * 0.15;
    } else if (k === 1) { // rib: vertical wales with knit loops
      const fx = (u * 10) % 1; const w = Math.sin(fx * Math.PI) ** 1.5; const lp = 0.5 + 0.5 * Math.cos(v * 40 * Math.PI * 2 + (fx > 0.5 ? Math.PI : 0));
      val = w * (0.75 + 0.25 * lp) + noise2[y * N + x] * 0.1;
    } else if (k === 2) { // plain weave with slubs
      const p = 24; const fx = (u * p) % 1, fy = (v * p) % 1; const cx = Math.floor(u * p), cy = Math.floor(v * p);
      const over = (cx + cy) % 2 === 0;
      const warp = Math.sin(fx * Math.PI) * (over ? 1 : 0.55), weft = Math.sin(fy * Math.PI) * (over ? 0.55 : 1);
      val = Math.max(warp, weft) + noise[y * N + x] * 0.25 + Math.max(0, noise2[y * N + x] - 0.6) * 0.6;
    } else if (k === 3) { // 3/1 twill: diagonal ridges
      const p = 28; const d = ((u + v) * p) % 1; const sub = ((u - v) * p * 3) % 1;
      val = Math.sin(d * Math.PI) ** 1.2 * (0.85 + 0.15 * Math.sin(sub * Math.PI)) + noise2[y * N + x] * 0.12 + noise[y * N + x] * 0.12;
    } else if (k === 4) { // pique: honeycomb cells
      const p = 14; const fx = (u * p) % 1, fy = (v * p * 1.15 + (Math.floor(u * p) % 2) * 0.5) % 1;
      val = 1 - Math.min(1, Math.hypot(fx - 0.5, fy - 0.5) * 2.2) + noise2[y * N + x] * 0.1;
    } else if (k === 5) { // skin: pores and fine cross wrinkles
      val = noise[y * N + x] * 0.35 + noise2[y * N + x] * 0.25 + Math.sin((u * 3 + v * 7) * 40) * 0.05 + Math.sin((u * 6 - v * 2.5) * 52) * 0.05;
    } else if (k === 6) { // leather / rubber grain: soft cells
      val = cellular(u, v, 18, 77) * 0.8 + noise2[y * N + x] * 0.2;
    } else {              // ripstop / mesh grid
      const p = 12; const fx = (u * p) % 1, fy = (v * p) % 1;
      val = Math.max(Math.exp(-((fx - 0.5) ** 2) / 0.004), Math.exp(-((fy - 0.5) ** 2) / 0.004)) * 0.6 + noise2[y * N + x] * 0.3 + Math.sin(u * 96 * Math.PI) * 0.06;
    }
    h[y * N + x] = val;
  } }
  // pores: sparse pits
  if (k === 5) for (let i = 0; i < 900; i++) { const px = rnd() * N, py = rnd() * N, r = 1 + rnd() * 1.6; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = ((Math.floor(px) + dx) % N + N) % N, yy = ((Math.floor(py) + dy) % N + N) % N; h[yy * N + xx] -= 0.5 * Math.exp(-(dx * dx + dy * dy) / (r * r)); } }
  return h;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function valueNoise(N, cells, rnd) {
  const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * cells, fy = (y / N) * cells; const x0 = Math.floor(fx), y0 = Math.floor(fy); const tx = fx - x0, ty = fy - y0;
    const s = (a) => a * a * (3 - 2 * a); const i = (xx, yy) => g[((yy % cells + cells) % cells) * cells + ((xx % cells + cells) % cells)];
    out[y * N + x] = (i(x0, y0) * (1 - s(tx)) + i(x0 + 1, y0) * s(tx)) * (1 - s(ty)) + (i(x0, y0 + 1) * (1 - s(tx)) + i(x0 + 1, y0 + 1) * s(tx)) * s(ty);
  }
  return out;
}
function cellular(u, v, n, seed) {
  const r = mulberry(seed); const pts = []; for (let i = 0; i < n * n; i++) pts.push([r(), r()]);
  cellular.cache ||= new Map(); const key = n + ':' + seed; if (!cellular.cache.has(key)) cellular.cache.set(key, pts);
  const P = cellular.cache.get(key); const cx = Math.floor(u * n), cy = Math.floor(v * n); let d1 = 9, d2 = 9;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const gx = ((cx + dx) % n + n) % n, gy = ((cy + dy) % n + n) % n; const p = P[gy * n + gx];
    const d = Math.hypot(u * n - (cx + dx + p[0]), v * n - (cy + dy + p[1])); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return Math.min(1, (d2 - d1) * 1.6);
}
export function microAtlas() {
  if (_micro) return _micro;
  const g = microAtlasSteps(); let r = g.next(); while (!r.done) r = g.next();
  return _micro;
}
// stage 1 boot pacing: the same atlas built one tile per step (main.js builds it in short tasks during loading)
export async function prewarmMicroAtlas(breathe) {
  if (_micro) return _micro;
  const g = microAtlasSteps(); let r = g.next(); while (!r.done) { await breathe(); r = g.next(); }
  return _micro;
}
function* microAtlasSteps() {
  const N = 256, W = N * 4, H = N * 2; const data = new Uint8Array(W * H * 4);
  for (let k = 0; k < 8; k++) {
    if (k) yield;
    const h = yield* tileHeight(k, N); let mn = 1e9, mx = -1e9; for (const v of h) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    const ox = (k % 4) * N, oy = Math.floor(k / 4) * N; const sc = 4.0 / (mx - mn || 1);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const g = (xx, yy) => h[((yy + N) % N) * N + ((xx + N) % N)];
      const dx = (g(x + 1, y) - g(x - 1, y)) * 0.5 * sc, dy = (g(x, y + 1) - g(x, y - 1)) * 0.5 * sc;
      let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l;
      const i = ((oy + y) * W + ox + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = ((g(x, y) - mn) / (mx - mn || 1)) * 255; data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  if (!_micro) _micro = t;
  return _micro;
}
let _fabTex = null;
function fabricTexture() {   // 32 x 2 float lookup: row 0 = rough, spec, sheen, sheenRough ; row 1 = metal, tile, repeat/256, strength
  if (_fabTex) return _fabTex;
  const d = new Float32Array(32 * 2 * 4);
  FABRICS.forEach((f, i) => { d.set([f[0], f[1], f[2], f[3]], i * 4); d.set([f[4], f[5] / 8, f[6] / 256, f[7]], (32 + i) * 4); });
  const t = new THREE.DataTexture(d, 32, 2, THREE.RGBAFormat, THREE.FloatType); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
  _fabTex = t; return t;
}

// ------------------------------------------------------------------ body (skin + clothes)
const HEAD = /* glsl */`
uniform sampler2D uMicro; uniform sampler2D uFab; uniform vec3 uSkinTint; uniform vec3 uHairTint; uniform vec4 uSlot[6]; uniform float uMicroK;
float gSkin = 0.0;
vec3 hueShift(vec3 c, float a, float v) {
  const mat3 toY = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toR = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 y = toY * c; float h = atan(y.z, y.y) + a; float ch = length(y.yz);
  return max(vec3(0.0), toR * vec3(y.x, ch * cos(h), ch * sin(h))) * v;
}
`;
export function makeBodyMaterial(base) {
  const m = new THREE.MeshPhysicalMaterial({ map: base.tex.a, normalMap: base.tex.n, aoMap: base.tex.n, roughness: 0.85, metalness: 0, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(1, 1, 1), specularIntensity: 1 });
  m.name = 'npcBody';
  m.normalScale.set(1, 1);
  const U = {
    uMicro: { value: microAtlas() }, uFab: { value: fabricTexture() }, uSkinTint: { value: new THREE.Color(1, 1, 1) }, uHairTint: { value: new THREE.Color(1, 1, 1) },
    uSlot: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4(0, 1, 0, 0)) }, uMicroK: { value: 0.6 },
  };
  m.userData.u = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    let f = sh.fragmentShader;
    f = f.replace('#include <common>', '#include <common>\n' + HEAD);
    f = f.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'vec3 irradiance = dotNL * directLight.color;',
      `float wrapK = 0.5 * gSkin; float nlRaw = dot( geometryNormal, directLight.direction );
       float nlW = saturate( ( nlRaw + wrapK ) / ( 1.0 + wrapK ) );
       vec3 irradiance = ( dotNL + max( 0.0, nlW - dotNL ) * vec3( 1.0, 0.42, 0.28 ) * 1.4 * gSkin ) * directLight.color;`)
      .replace('reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );',
        'reflectedLight.directSpecular += irradiance * min( BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material ), vec3( 0.6 ) );'));
    f = f.replace('#include <map_fragment>', `#include <map_fragment>
      vec4 nmT = texture2D( normalMap, vNormalMapUv );
      ivec2 tsz = textureSize( map, 0 ); float codeB = floor( texelFetch( map, clamp( ivec2( vMapUv * vec2( tsz ) ), ivec2( 0 ), tsz - 1 ), 0 ).a * 255.0 + 0.5 ); float fabI = mod( codeB, 32.0 ); float slotI = floor( codeB / 32.0 );
      vec4 fabA = texture2D( uFab, vec2( ( fabI + 0.5 ) / 32.0, 0.25 ) ); vec4 fabB = texture2D( uFab, vec2( ( fabI + 0.5 ) / 32.0, 0.75 ) );
      gSkin = fabI < 0.5 ? 1.0 : 0.0;
      if ( fabI < 0.5 ) diffuseColor.rgb *= uSkinTint;
      else if ( abs( fabI - 22.0 ) < 0.5 ) diffuseColor.rgb = mix( diffuseColor.rgb * uSkinTint, diffuseColor.rgb * uHairTint, 0.85 );
      int si = int( slotI );
      vec4 sv = si == 1 ? uSlot[1] : si == 2 ? uSlot[2] : si == 3 ? uSlot[3] : si == 4 ? uSlot[4] : si == 5 ? uSlot[5] : uSlot[0];
      if ( slotI > 0.5 && ( abs( sv.x ) > 0.001 || abs( sv.y - 1.0 ) > 0.001 ) ) diffuseColor.rgb = hueShift( diffuseColor.rgb, sv.x, sv.y );`);
    f = f.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = fabB.x > 0.5 ? fabA.x : max( fabA.x, 0.5 );`);
    f = f.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = fabB.x;`);
    f = f.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `
      vec3 mapN = vec3( nmT.rg * 2.0 - 1.0, 0.0 );
      { // tiling micro detail (fabric / pores), fades out with distance through its mips
        float tile = floor( fabB.y * 8.0 + 0.5 ); vec2 org = vec2( mod( tile, 4.0 ), floor( tile / 4.0 ) ) * vec2( 0.25, 0.5 );
        vec2 muv = vNormalMapUv * fabB.z * 256.0;
        vec2 g1 = dFdx( muv ), g2 = dFdy( muv );
        vec2 st = org + fract( muv ) * vec2( 0.25, 0.5 );
        vec4 mt = textureGrad( uMicro, st, g1 * vec2( 0.25, 0.5 ), g2 * vec2( 0.25, 0.5 ) );
        float fade = ( 1.0 - smoothstep( 0.15, 1.2, max( length( g1 ), length( g2 ) ) ) ) * smoothstep( 0.08, 0.35, abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ) );
        mapN.xy += ( mt.rg * 2.0 - 1.0 ) * fabB.w * fade * uMicroK;
        diffuseColor.rgb *= mix( 1.0, 0.82 + 0.3 * mt.b, fabB.w * fade * ( gSkin > 0.5 ? 0.15 : 0.5 ) );
      }
      mapN.z = sqrt( max( 0.05, 1.0 - dot( mapN.xy, mapN.xy ) ) );`);
    f = f.replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
      { vec3 dn = fwidth( normal ); float nv = max( dn.x, max( dn.y, dn.z ) ); roughnessFactor = max( roughnessFactor, min( 1.0, nv * 2.5 ) ); }`);
    f = f.replace('float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;', 'float ambientOcclusion = ( nmT.b - 1.0 ) * aoMapIntensity + 1.0;');
    f = f.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      material.specularColor *= fabA.y / 0.5 * ( 1.0 - metalnessFactor ) + metalnessFactor;
      material.specularF90 = mix( 0.5 + 0.5 * fabA.y, 1.0, metalnessFactor );
      #ifdef USE_SHEEN
      material.sheenColor = min( diffuseColor.rgb * fabA.z * 0.9, vec3( 0.35 ) );
      material.sheenRoughness = clamp( fabA.w, 0.07, 1.0 );
      #endif`);
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'npcBody1';
  return m;
}

// ------------------------------------------------------------------ hair cards: matte, Kajiya-Kay
const HAIR_HEAD = /* glsl */`
vec3 gHairT = vec3( 0.0, 1.0, 0.0 ); float gHairShift = 0.0;
float kkSpec( vec3 T, vec3 H, float e ) { float th = dot( T, H ); return pow( sqrt( max( 0.0, 1.0 - th * th ) ), e ); }
`;
export function makeHairMaterial(tex, color) {
  const m = new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(color), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.8, metalness: 0, envMapIntensity: 0.35 });
  m.name = 'npcHair'; m.alphaToCoverage = true;
  m.onBeforeCompile = (sh) => {
    let f = sh.fragmentShader;
    sh.uniforms.uRenderR2 = RENDER_R2; // r2-render: capped A2C edge (no fixed checkerboard on far hair)
    f = f.replace('#include <common>', '#include <common>\nuniform float uRenderR2;\n' + HAIR_HEAD).replace('#include <alphatest_fragment>', A2C_R2_GLSL);
    f = f.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment
      .replace('vec3 irradiance = dotNL * directLight.color;', 'float nlW = saturate( ( dot( geometryNormal, directLight.direction ) + 0.35 ) / 1.35 ); vec3 irradiance = nlW * directLight.color;')
      .replace('reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );',
        `vec3 Hh = normalize( directLight.direction + geometryViewDir );
         vec3 T1 = normalize( gHairT + geometryNormal * ( 0.08 + gHairShift ) ), T2 = normalize( gHairT - geometryNormal * ( 0.12 - gHairShift ) );
         float s1 = kkSpec( T1, Hh, 90.0 ) * 0.055, s2 = kkSpec( T2, Hh, 24.0 ) * 0.07;
         reflectedLight.directSpecular += directLight.color * saturate( dotNL + 0.2 ) * saturate( dot( geometryNormal, geometryViewDir ) * 2.0 ) * min( vec3( 0.12 ), vec3( s1 ) + s2 * material.diffuseColor * 2.0 );`));
    f = f.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 dpx = dFdx( - vViewPosition ), dpy = dFdy( - vViewPosition ); vec2 dux = dFdx( vMapUv ), duy = dFdy( vMapUv );
        float det = dux.x * duy.y - dux.y * duy.x; vec3 tv = ( dpy * dux.x - dpx * duy.x ) * sign( det );
        gHairT = normalize( tv - normal * dot( tv, normal ) + vec3( 1e-5 ) );
        gHairShift = ( texture2D( map, vMapUv * 7.0 ).g - 0.5 ) * 0.15; }`);
    f = f.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= 2.0;`);
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'npcHair1';
  return m;
}
export function makeEyeMaterial(tex) {
  const m = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 0.25 });
  m.name = 'npcEye'; return m;
}
export function makeBrowMaterial(tex, color, lash = false) {
  const m = new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(color), alphaTest: lash ? 0.25 : 0.3, side: THREE.DoubleSide, roughness: 0.85, depthWrite: true });
  m.name = lash ? 'npcLash' : 'npcBrow'; m.alphaToCoverage = true; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2;
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= 2.0;'); };
  m.customProgramCacheKey = () => 'npcBrow1';
  return m;
}
export function makeShoeMaterial(tex) {
  const m = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.62, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.2, 0.2, 0.2), envMapIntensity: 0.6 });
  m.name = 'npcShoe'; return m;
}

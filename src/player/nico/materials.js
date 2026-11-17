// Southline V2 — Nico materials (CHARACTER track): skin (subsurface approximation, pore + micro normal detail,
// sweat / wetness / sunburn / tan), eyes (refractive cornea, parallax iris, socket shadow), hair shells, lashes, teeth, cloth.
import * as THREE from 'three';
import { FRAME_NOISE, RENDER_R2 } from '../../render/frameNoise.js';

const TEX = '/assets/characters/nico/tex/';
const loader = new THREE.TextureLoader();
const cache = new Map();
export function tex(file, { srgb = false, repeat = false, aniso = 16, base = TEX } = {}) {
  const key = base + file + (srgb ? '|s' : '');
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(base + file);
  t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t); return t;
}
// resolves once every texture requested so far has finished loading (the viewer / loading screen waits on it)
export function texturesReady() {
  return Promise.all([...cache.values()].map((t) => new Promise((res) => {
    const t0 = performance.now();
    const chk = () => { if ((t.image && (t.image.complete !== false) && (t.image.width || t.image.videoWidth)) || performance.now() - t0 > 12000) res(); else setTimeout(chk, 40); };
    chk();
  })));
}

// shared per-character skin state (one uniform set drives head + body + far materials)
export function makeSkinState() {
  return {
    uSSS: { value: 1.0 }, uWet: { value: 0 }, uWetLine: { value: 3.0 }, uSweat: { value: 0 }, uBurn: { value: 0 }, uTan: { value: 0 }, uFlush: { value: 0 },
    uCover: { value: null }, uCoverOn: { value: 0 }, uTattoo: { value: null }, uTattooOn: { value: 0 },
  };
}

const SKIN_PARS = /* glsl */`
uniform float uSSS, uWetU, uWetLine, uSweat, uBurn, uTan, uFlush, uCoverOn, uTattooOn, uMicroTile;
varying float vWetH;
// wet only up to the highest water line reached (bind-pose height in meters), soaking a few cm above it
#define uWet ( uWetU * ( 1.0 - smoothstep( uWetLine - 0.02, uWetLine + 0.08, vWetH ) ) )
uniform sampler2D uM2, uMicro, uDrops, uCover, uTattoo, uHairMaskS;
float nicoThick = 0.0; float nicoBead = 0.0; vec2 nicoBeadN = vec2(0.0);
`;

export function makeSkinMaterial(kind, state) {
  // kind: 'head' | 'body' | 'far'
  const far = kind === 'far';
  const m = new THREE.MeshPhysicalMaterial({
    name: 'skin_' + kind,
    map: tex(far ? 'skin_far.webp' : kind + '_albedo.webp', { srgb: true }),
    roughness: far ? 0.6 : 1.0, metalness: 0, ior: 1.4, clearcoat: 0, specularIntensity: 0.5,
    sheen: far ? 0 : 0.28, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xc89078),     // soft second lobe: faint warm sheen at grazing angles
  });
  if (!far) {
    m.normalMap = tex(kind + '_normal.webp'); m.normalScale = kind === 'head' ? new THREE.Vector2(1.0, -1.0) : new THREE.Vector2(1.0, -1.0);   // pores read as craters at full strength
    const m1 = tex(kind + '_m1.webp'); m.aoMap = m1; m.roughnessMap = m1; m.aoMapIntensity = 0.85;
  }
  const u = { uM2: { value: far ? null : tex(kind + '_m2.webp') }, uMicro: { value: far ? null : tex('skin_micro_n.webp', { repeat: true }) },
    uDrops: { value: far ? null : tex('droplets.webp', { repeat: true }) }, uMicroTile: { value: kind === 'head' ? 34 : 60 },
    uHairMaskS: { value: kind === 'head' ? tex('head_hair.webp') : null } };
  m.userData.u = u; m.userData.state = state;
  m.defines = { NICO_SKIN: 1 }; if (far) m.defines.NICO_FAR = 1; if (kind === 'body') m.defines.NICO_BODY = 1;
  if (kind === 'head') m.defines.NICO_HEAD = 1;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, state, { uWetU: state.uWet, uWetLine: state.uWetLine || { value: 3.0 } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWetH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWetH = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_PARS)
      .replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );', /* glsl */`
        {
          float ndl = dot( geometryNormal, directLight.direction );
          vec3 wr = uSSS * vec3( 0.24, 0.11, 0.07 );
          vec3 dif = saturate( ( vec3( ndl ) + wr ) / ( 1.0 + wr ) );
          float band = smoothstep( -0.35, 0.05, ndl ) * ( 1.0 - smoothstep( 0.05, 0.6, ndl ) );
          dif += band * uSSS * vec3( 0.05, 0.010, 0.0 );
          vec3 h2 = normalize( directLight.direction + geometryNormal * 0.4 );
          float back = pow( saturate( dot( geometryViewDir, - h2 ) ), 6.0 ) * min( nicoThick, 0.6 ) * 0.35;     // ears glow only faintly when backlit
          reflectedLight.directDiffuse += directLight.color * ( dif + back * vec3( 0.55, 0.30, 0.20 ) * uSSS ) * BRDF_Lambert( material.diffuseColor );
        }`))
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
      #ifdef NICO_BODY
        if ( uCoverOn > 0.5 && texture2D( uCover, vMapUv ).r > 0.5 ) discard;
        if ( uTattooOn > 0.5 ) { vec4 tt = texture2D( uTattoo, vMapUv ); diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * tt.rgb, tt.a ); }
      #endif
      #ifndef NICO_FAR
        vec3 m2 = texture2D( uM2, vMapUv ).rgb;
        #ifdef NICO_BODY
          float tanK = uTan * ( 1.0 - 0.8 * m2.b );
        #else
          float tanK = uTan;
        #endif
        diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.80, 0.74, 0.66 ), tanK );
        // olive cast: the MakeHuman base skin is pink; pull its saturation toward a tanned olive-brown
        { float lum = dot( diffuseColor.rgb, vec3( 0.30, 0.55, 0.15 ) ); diffuseColor.rgb = mix( vec3( lum ), diffuseColor.rgb, 0.78 ) * vec3( 1.0, 0.99, 0.95 ); }
        float burn = clamp( uBurn * m2.g + uFlush * m2.g * 0.6, 0.0, 1.0 );
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.22, 0.70, 0.66 ), burn * 0.75 );
        // water and sweat beads: more beads appear as the amount rises
        float wetAmt = clamp( max( uWet, uSweat * m2.r ), 0.0, 1.0 );
        vec4 dr = texture2D( uDrops, vMapUv * uMicroTile * 0.22 );
        nicoBead = dr.a * step( 1.0 - wetAmt * 0.85, dr.b ) * step( 0.02, wetAmt );
        nicoBeadN = ( dr.rg * 2.0 - 1.0 ) * nicoBead;
        diffuseColor.rgb *= 1.0 - 0.12 * uWet;
        nicoThick = texture2D( roughnessMap, vMapUv ).b;
        // cavity: the baked AO also darkens the albedo, so creases and forms read in direct sun (AO alone only shades sky light)
        diffuseColor.rgb *= mix( 1.0, texture2D( roughnessMap, vMapUv ).r, 0.45 );
      #endif
      #ifdef NICO_HEAD
      {
        // barber fade: under the hair shells and for ~2 cm outside the hairline the scalp carries short dark stubble,
        // so the haircut never ends in a hard helmet edge (sides, nape, temples)
        float inH = step( 0.5, texture2D( uHairMaskS, vMapUv ).r );
        float soft = 0.0;
        for ( int i = 0; i < 12; i ++ ) {
          float a = float( i ) * 0.5236;
          vec2 o = vec2( cos( a ), sin( a ) );
          soft += step( 0.5, texture2D( uHairMaskS, vMapUv + o * 0.010 ).r ) * 0.6 + step( 0.5, texture2D( uHairMaskS, vMapUv + o * 0.022 ).r ) * 0.4;
        }
        soft /= 12.0;
        float fadeK = max( inH, smoothstep( 0.05, 0.9, soft ) * 0.9 );
        vec2 sc = floor( vMapUv * 2600.0 );
        float dots = fract( sin( dot( sc, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        float stub = fadeK * ( 0.55 + 0.45 * step( 0.35, dots ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.075, 0.058, 0.048 ), clamp( stub * 0.85, 0.0, 0.9 ) );
      }
      #endif`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
      #ifndef NICO_FAR
        roughnessFactor = clamp( roughnessFactor * 1.15 + 0.12, 0.55, 0.9 );          // matte skin, no plastic shine (ref_54 / ref_51 noon sun)
        roughnessFactor = mix( roughnessFactor, 0.22, clamp( max( uWet, uSweat * m2.r * 0.7 ), 0.0, 1.0 ) * 0.75 );
        roughnessFactor = mix( roughnessFactor, 0.05, nicoBead );
      #endif`)
      .replace('mapN.xy *= normalScale;', /* glsl */`
        vec3 mic = texture2D( uMicro, vNormalMapUv * uMicroTile ).xyz * 2.0 - 1.0;
        float micK = 0.30 * ( 1.0 - smoothstep( 0.0015, 0.006, max( fwidth( vNormalMapUv.x ), fwidth( vNormalMapUv.y ) ) * uMicroTile ) );   // fades out with distance: no shimmer
        mapN.xy += mic.xy * micK;
        mapN.xy = mix( mapN.xy, nicoBeadN * 1.6, nicoBead * 0.85 );
        mapN.xy *= normalScale;`);
  };
  m.customProgramCacheKey = () => 'nicoSkin_' + kind;
  return m;
}

// ---------------------------------------------------------------- eyes
export function makeEyeMaterial(radius) {
  const u = {
    uIris: { value: tex('eye_iris.webp', { srgb: true }) }, uSclera: { value: tex('eye_sclera.webp', { srgb: true }) },
    uR: { value: radius }, uIR: { value: 0.47 }, uPupil: { value: 0.30 }, uBlink: { value: 0 },
    uEyeQ: { value: new THREE.Vector4(0, 0, 0, 1) }, uSide: { value: 1 }, uLid: { value: new THREE.Vector4(0.80, 0.36, 0.30, 0.0) },   // half-angles: horizontal, up, down; w unused
  };
  // the sky probe is unoccluded: a real eye sits in a socket under the brow, so most of the sky never reaches it.
  // Keep one small wet highlight (clearcoat) and cut the environment reflection that made the eyes look glassy.
  const m = new THREE.MeshPhysicalMaterial({ name: 'eye', color: 0xffffff, roughness: 0.2, metalness: 0, ior: 1.376, clearcoat: 0.55, clearcoatRoughness: 0.06, envMapIntensity: 0.18, specularIntensity: 0.6 });
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyeN; varying vec3 vEyeV; uniform float uR, uIR, uBlink;')
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        vec3 en = normalize( position ); float eth = acos( clamp( en.z, -1.0, 1.0 ) );
        float ek = 1.0 - smoothstep( 0.0, uIR * 1.3, eth ); ek = ek * ek * ( 3.0 - 2.0 * ek );
        transformed += en * ( 0.075 * uR * ek * ( 1.0 - uBlink ) );
        vEyeN = en; vEyeV = ( inverse( modelMatrix ) * vec4( cameraPosition, 1.0 ) ).xyz - transformed;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        varying vec3 vEyeN; varying vec3 vEyeV; uniform mat3 normalMatrix;
        uniform sampler2D uIris, uSclera; uniform float uR, uIR, uPupil, uBlink, uSide; uniform vec4 uEyeQ, uLid;
        vec3 qrot( vec4 q, vec3 v ) { return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v ); }
        float eyeCornea = 0.0; vec3 eyeNrmL = vec3( 0.0, 0.0, 1.0 );`)
      .replace('#include <map_fragment>', /* glsl */`
        vec3 en = normalize( vEyeN ); float eth = acos( clamp( en.z, -1.0, 1.0 ) );
        eyeCornea = 1.0 - smoothstep( uIR * 0.98, uIR * 1.16, eth );
        // cornea: a smaller sphere riding on the globe; its normal bends the highlight and refracts the view of the iris
        vec3 cn = normalize( en * uR - vec3( 0.0, 0.0, uR * 0.40 ) );
        eyeNrmL = normalize( mix( en, cn, eyeCornea ) );
        vec3 vdir = normalize( vEyeV );
        vec3 rf = refract( - vdir, eyeNrmL, 1.0 / 1.376 );
        float zi = uR * cos( uIR ) - uR * 0.02;                      // iris plane just behind the limbus ring
        vec3 p0 = en * uR * ( 1.0 + 0.075 * eyeCornea );
        float tHit = ( zi - p0.z ) / min( rf.z, -0.05 );
        vec2 iuv = ( p0 + rf * tHit ).xy / ( uR * sin( uIR ) );
        float ir = length( iuv );
        float rt = ir < uPupil ? ir * ( 0.30 / uPupil ) : 0.30 + ( ir - uPupil ) * ( 0.70 / ( 1.0 - uPupil ) );
        vec4 irisC = texture2D( uIris, vec2( 0.5 ) + 0.5 * iuv / max( ir, 1e-4 ) * rt * vec2( uSide, -1.0 ) );
        vec2 sdir = en.xy / max( length( en.xy ), 1e-4 );
        vec3 sclC = texture2D( uSclera, vec2( 0.5 ) + 0.5 * ( eth / PI ) * sdir * vec2( uSide, -1.0 ) ).rgb;
        float inIris = ( 1.0 - smoothstep( 0.93, 1.03, ir ) ) * eyeCornea;
        vec3 ecol = mix( sclC * vec3( 0.88, 0.83, 0.79 ), irisC.rgb * vec3( 0.17, 0.12, 0.09 ), inIris );     // dark brown iris (ref_48), clean off-white sclera
        ecol *= 1.0 - 0.35 * smoothstep( 0.80, 1.0, ir ) * ( 1.0 - smoothstep( 1.0, 1.25, ir ) );     // limbal shadow ring
        // socket shadow: where the lids and the socket shade the globe (in head space, so it does not turn with the eye)
        vec3 sn = qrot( uEyeQ, en );
        float sx = atan( sn.x, sn.z ), sy = atan( sn.y, sn.z );
        float up = uLid.y * ( 1.0 - uBlink );
        float dEl = length( vec2( sx / uLid.x, sy / ( sy > 0.0 ? up + 0.02 : uLid.z ) ) );
        float lidAO = 1.0 - 0.86 * smoothstep( 0.30, 1.0, dEl );
        lidAO *= 1.0 - 0.35 * smoothstep( up * 0.25, up * 0.95, sy );                                  // upper lid + lash shadow
        // where the lids and socket shade the globe it reads as warm lid shadow, not a sky-lit grey ring
        diffuseColor.rgb = mix( vec3( 0.14, 0.085, 0.065 ), ecol, lidAO );`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( 0.30, 0.10, eyeCornea );')
      .replace('#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
        normal = normalize( normalMatrix * eyeNrmL ); nonPerturbedNormal = normal;`);
  };
  m.customProgramCacheKey = () => 'nicoEye';
  return m;
}

export function makeLashMaterial() {
  return new THREE.MeshStandardMaterial({ name: 'lashes', map: tex('lashes.webp', { srgb: true }), color: 0x0c0907, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, alphaTest: 0.02 });
}
export function makeMouthMaterial(kind, mouth) {
  const m = new THREE.MeshPhysicalMaterial({ name: kind, map: tex(kind + '.webp', { srgb: true }), roughness: kind === 'teeth' ? 0.22 : 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15, transparent: kind === 'teeth', alphaTest: kind === 'teeth' ? 0.5 : 0 });
  m.transparent = false;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMouth = mouth;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uMouth;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix( 0.10, 0.82, smoothstep( 0.0, 0.7, uMouth ) );');     // the mouth is a dark cavity until it opens
  };
  m.customProgramCacheKey = () => 'nicoMouth_' + kind;
  return m;
}

// ---------------------------------------------------------------- hair shells (short textured crop: strands with real depth)
// One layer per shell; the vertex shader pushes the scalp out along the normal (plus a combed slant), the fragment shader
// keeps a strand only while the layer is below that strand's length (strand id from a hashed cell pattern in head UV space).
export function makeHairShellMaterial(layer, layers, state) {
  const k = layer / (layers - 1);
  const u = { uFrameN: FRAME_NOISE, uRenderR2: RENDER_R2, uK: { value: k }, uLen: state.uHairLen, uHairC: state.uHairC, uHairMask: { value: tex('head_hair.webp') }, uComb: state.uComb, uWetH: state.uWet };
  const m = new THREE.MeshStandardMaterial({ name: 'hairShell', color: 0xffffff, roughness: 0.42, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.35 });
  m.userData.u = u; m.userData.layer = layer;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uK, uLen; uniform vec3 uComb; uniform sampler2D uHairMask; varying vec2 vHUv; varying float vHLen;')
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        vec4 hm = texture2D( uHairMask, uv ); vHUv = uv; vHLen = hm.g;
        float hl = uLen * hm.g * hm.r;
        // strands lift off the scalp, then bend toward the comb direction and sag a little as they get longer
        vec3 comb = uComb - normal * dot( uComb, normal );
        transformed += normal * ( hl * uK * ( 1.0 - 0.35 * uK ) ) + comb * ( hl * uK * uK * 0.85 ) + vec3( 0.0, - hl * uK * uK * 0.22, 0.0 );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        uniform float uK, uWetH, uFrameN, uRenderR2; uniform vec3 uHairC; uniform sampler2D uHairMask; varying vec2 vHUv; varying float vHLen;
        float ignT( vec2 p ) { return uRenderR2 > 0.5 ? fract( fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ) + 0.61803399 * uFrameN ) : fract( 52.9829189 * fract( dot( p + 5.588238 * uFrameN, vec2( 0.06711056, 0.00583715 ) ) ) ); }
        float hh( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }`)
      .replace('#include <map_fragment>', /* glsl */`
        vec4 hm = texture2D( uHairMask, vHUv );
        if ( hm.r < 0.5 ) discard;
        // soft natural hairline: the painted mask is hard-edged, so thin the strands out over the last ~2 cm inside it
        {
          float soft = 0.0;
          for ( int i = 0; i < 8; i ++ ) {
            float a = float( i ) * 0.785398;
            soft += step( 0.5, texture2D( uHairMask, vHUv + vec2( cos( a ), sin( a ) ) * 0.013 ).r );
          }
          soft /= 8.0;
          float keep = smoothstep( 0.25, 1.0, soft );
          // stage 1 anti-grain: when a strand cell is smaller than ~2 px the hashed pattern aliases into "sand"; switch to a
          // temporal dither (TAA averages it into a soft edge)
          float pxl = max( fwidth( vHUv.x ), fwidth( vHUv.y ) ) * 1250.0;
          float rnd = mix( hh( floor( vHUv * 1250.0 ) + 11.3 ), ignT( gl_FragCoord.xy ), smoothstep( 0.3, 0.7, pxl ) );
          if ( rnd > keep * 1.2 - 0.1 ) discard;
        }
        // strands: two cell scales (clumps + single hairs); each cell holds one strand of random length and position
        float dens = mix( 1250.0, 760.0, hm.g );
        vec2 g = vHUv * dens; vec2 c = floor( g ); vec2 f = fract( g ) - 0.5;
        // strand LOD: cells under ~2 px wide cannot show single strands without aliasing. Fade the outer shells out with a
        // temporal dither (coverage ~ the average strand coverage at that height) and let the base shell carry the color.
        float sLod = smoothstep( 0.35, 0.8, max( fwidth( g.x ), fwidth( g.y ) ) );
        float id = hh( c ); vec2 off = ( vec2( hh( c + 7.1 ), hh( c + 3.7 ) ) - 0.5 ) * 0.55;
        float clump = hh( floor( vHUv * dens * 0.17 ) );
        float slen = ( 0.45 + 0.55 * id ) * ( 0.75 + 0.25 * clump );
        float rad = mix( 0.42, 0.10, uK ) * ( 0.8 + 0.4 * hh( c + 1.3 ) );
        if ( uK > 0.001 ) {
          bool strand = !( uK > slen || length( f - off * ( 1.0 - uK * 0.5 ) ) > rad );
          float cover = ( 1.0 - smoothstep( 0.45, 1.0, uK ) ) * 0.55; // rough average strand coverage at this shell height
          bool keepT = ignT( gl_FragCoord.xy + uK * 37.0 ) < cover;
          if ( !( sLod < 0.5 ? strand : keepT ) ) discard;
        }
        float tip = uK / max( slen, 0.01 );
        vec3 hc = uHairC * ( 0.55 + 0.85 * id ) * mix( 0.42, 1.25, tip ) * mix( 1.0, 0.7, uWetH );     // dark at the roots (self-shadow), lighter tips
        hc = mix( hc, uHairC * 0.95 * mix( 0.5, 1.15, uK ) * mix( 1.0, 0.7, uWetH ), sLod ); // LOD: average strand color, no per-cell noise
        if ( uK <= 0.001 ) hc = uHairC * 0.35;
        diffuseColor.rgb = hc;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( 0.62, 0.3, uWetH );');
  };
  m.customProgramCacheKey = () => 'nicoHairShell';
  return m;
}

// ---------------------------------------------------------------- cloth
// uv  = unique garment atlas (baked AO/detail in the future), uv1 = fabric space in meters (+V up the garment).
// Vertex color: r = panel shade / AO, g = hem or seam band, b = flutter weight (free cloth far from the body), a = decal panel id.
const fabricCache = new Map();
export function makeClothMaterial(o = {}) {
  const m = new THREE.MeshPhysicalMaterial({ name: 'cloth', color: new THREE.Color(o.color ?? 0xffffff), roughness: o.roughness ?? 0.82, metalness: o.metalness ?? 0, side: THREE.DoubleSide,
    sheen: o.sheen ?? 0.35, sheenRoughness: o.sheenRoughness ?? 0.6, sheenColor: new THREE.Color(o.sheenColor ?? 0xffffff) });
  if (o.specular !== undefined) m.specularIntensity = o.specular;
  // `construct`: the camp shirt cut gets real construction drawn on it (placket, buttonholes, yoke, side and armhole seams,
  // stitching, hem and pocket topstitch), targeted drape folds and creases, linen slub weave, sun fade and wash variation.
  if (o.construct) m.defines = { SHIRT: '' };
  if (o.shoe) m.defines = { SHOE: '' };
  if (o.shorts) m.defines = { SHORTS: '' };
  if (o.cargo) m.defines = { SHORTS: '', CARGO: '' };
  if (o.leather) m.defines = { ...(m.defines || {}), LEATHER: '' };
  if (o.openShirt) m.defines = { ...(m.defines || {}), OPENSHIRT: '' };
  if (o.clothSim) m.defines = { ...(m.defines || {}), CLOTHSIM: '' };
  if (o.print) { m.map = tex(o.print, { srgb: true, repeat: true, base: '' }); }
  const u = { uRepeat: { value: 1 / (o.repeatM || 0.6) }, uWeave: { value: o.weave ?? 1 }, uWeaveScale: { value: o.weaveScale ?? 2400 }, uFold: { value: o.fold ?? 1 },
    uTime: o.time || { value: 0 }, uWind: o.wind || { value: new THREE.Vector3(0.4, 0, 0.2) }, uFlutter: { value: o.flutter ?? 1 }, uWetC: o.wet || { value: 0 }, uWetLine: o.wetLine || { value: 3.0 },
    uSwing: o.swing || { value: new THREE.Vector3() }, uCP: { value: Array.from({ length: 40 }, () => new THREE.Vector3()) }, uColor2: { value: new THREE.Color(o.color2 ?? 0xffffff) }, uPattern: { value: o.pattern ?? 0 }, uDecal: { value: o.decal ? tex(o.decal, { srgb: true, base: '' }) : null },
    uDecalRect: { value: new THREE.Vector4(...(o.decalRect || [0, 0, 0, 0])) }, uDecalPanel: { value: o.decalPanel ?? -1 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 uv1;\nattribute vec4 color;\nvarying vec2 vFab; varying vec4 vGc; varying float vWetH; uniform float uTime, uFlutter; uniform vec3 uWind, uSwing;\n#ifdef CLOTHSIM\nattribute vec4 clothW; uniform vec3 uCP[ 40 ];\n#endif\n#if defined( SHIRT ) || defined( SHOE ) || defined( SHORTS )\nvarying vec3 vRest; varying vec3 vRestN;\n#endif\n#ifdef SHOE\nvarying vec2 vShoeUv;\n#endif')
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        vFab = uv1; vGc = color; vWetH = position.y;
        #if defined( SHIRT ) || defined( SHOE ) || defined( SHORTS )
          vRest = position;
          vRestN = normal;
        #endif
        #ifdef SHOE
          vShoeUv = uv;
        #endif
        float fl = color.b * uFlutter;
        float ph = position.x * 9.0 + position.y * 13.0 + position.z * 7.0;
        // woven cotton holds its shape: no idle ripple. Only real air (uWind is about 0.12 x m/s) makes a slow travelling
        // wave run across the loose panels, and it is small; a calm day leaves the fabric still.
        float windAmt = smoothstep( 0.12, 0.6, length( uWind ) );
        float wave = sin( uTime * 2.4 - dot( position, vec3( 6.0, 3.0, 6.0 ) ) ) * 0.7 + sin( uTime * 3.7 - dot( position, vec3( 9.0, 5.0, 4.0 ) ) ) * 0.3;
        transformed += normal * wave * 0.0012 * fl * windAmt;
        transformed += uWind * ( 0.006 * fl * windAmt );
        // spring-simulated swing (hem, sleeve ends, collar tips): lower / looser cloth lags more; never pushed into the body
        {
          vec3 sw = uSwing * color.b * uFlutter * ( 0.85 + 0.15 * sin( ph * 0.7 ) );
          float dn = dot( sw, normal );
          if ( dn < 0.0 ) sw -= normal * dn * 0.9;
          transformed += sw;
        }
        #ifdef CLOTHSIM
        {
          // multi-point cloth: blend of the two nearest simulated particles' offsets
          // (body collision is solved on the particles; inner and outer layers of a hem move together)
          vec3 cd = uCP[ int( clothW.x + 0.5 ) ] * clothW.y + uCP[ int( clothW.z + 0.5 ) ] * clothW.w;
          transformed += cd;
        }
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        varying vec2 vFab; varying vec4 vGc; varying float vWetH; uniform float uWetLine; uniform float uRepeat, uWeave, uWeaveScale, uFold, uWetC, uPattern, uDecalPanel; uniform vec3 uColor2; uniform sampler2D uDecal; uniform vec4 uDecalRect;
        float ch( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
        float cn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( ch( i ), ch( i + vec2( 1, 0 ) ), f.x ), mix( ch( i + vec2( 0, 1 ) ), ch( i + vec2( 1, 1 ) ), f.x ), f.y ); }
        float clothH( vec2 u ) {                                   // drape folds + crumple (meters) and thread relief
          float h = 0.5 * sin( u.x * 55.0 + sin( u.y * 14.0 ) * 2.2 + cn( u * 9.0 ) * 4.0 ) * ( 0.5 + 0.5 * cn( u * 5.0 + 3.0 ) );
          h += 0.6 * ( cn( u * 38.0 ) - 0.5 ) + 0.3 * ( cn( u * 90.0 ) - 0.5 );
          return h * uFold;
        }
        float weaveH( vec2 u ) { vec2 q = u * uWeaveScale; return ( sin( q.x ) * sin( q.y ) ) * step( 0.0, sin( q.x * 0.5 ) * sin( q.y * 0.5 ) ) + 0.35 * sin( q.x * 2.0 ) * sin( q.y * 2.0 ); }
        #if defined( SHIRT ) || defined( SHOE ) || defined( SHORTS )
        varying vec3 vRest; varying vec3 vRestN;
        #endif
        #ifdef SHOE
        varying vec2 vShoeUv;
        #endif
        float aaLineS( float d, float halfW ) {
          float f = max( fwidth( d ), 1e-6 );
          return 1.0 - smoothstep( halfW, halfW + f * 1.2, abs( d ) );
        }
        #ifdef SHIRT
        // thin anti-aliased line around d = 0 (halfW in d's own units)
        float aaLine( float d, float halfW ) {
          float f = max( fwidth( d ), 1e-6 );
          return 1.0 - smoothstep( halfW, halfW + f * 1.2, abs( d ) );
        }
        // running-stitch dashes along coordinate a (meters), ~3 mm per stitch; fades to an even tone when too small to see
        float dashA( float a ) {
          float t = a * 330.0;
          float f = fwidth( t );
          float d = smoothstep( 0.18, 0.3, fract( t ) ) * ( 1.0 - smoothstep( 0.76, 0.88, fract( t ) ) );
          return mix( d, 0.5, smoothstep( 0.3, 0.8, f ) );
        }
        const float HEM_Y = 0.905;
        const float V_Y = 1.385;
        // x: seam shadow (darker, sunk), y: thread
        vec2 shirtSeams() {
          float px = vRest.x, py = vRest.y, pz = vRest.z;
          float ax = abs( px );
          float front = step( 0.0, pz ), back = 1.0 - front;
          float sleeve = smoothstep( 0.60, 0.64, vGc.r ) * smoothstep( 0.13, 0.16, abs( vRest.x ) );
          float torso = 1.0 - sleeve;
          float r = 0.0, t = 0.0;
          // bottom hem: double-turned, topstitched 12 mm up
          float low = torso * step( py, 1.0 );
          r += aaLine( py - HEM_Y - 0.006, 0.006 ) * 0.35 * low;
          t += aaLine( py - HEM_Y - 0.012, 0.00045 ) * dashA( px ) * low;
          // front placket (left front laps over right): overlap edge, two stitch rows, buttonholes under the buttons
          float plk = front * torso * step( py, V_Y ) * step( HEM_Y, py );
          #ifdef OPENSHIRT
          plk = 0.0;
          #endif
          r += aaLine( px + 0.0175, 0.0007 ) * 1.6 * plk;
          t += ( aaLine( px + 0.0140, 0.00042 ) + aaLine( px - 0.0165, 0.00042 ) ) * dashA( py ) * plk;
          float k = clamp( floor( ( 1.335 - py ) / 0.095 + 0.5 ), 0.0, 4.0 );
          float dy = py - ( 1.335 - k * 0.095 );
          float hole = step( abs( dy ), 0.0088 ) * plk;
          r += aaLine( px, 0.00045 ) * 2.5 * hole;
          t += aaLine( ax - 0.0011, 0.00035 ) * hole;
          // back yoke seam with its topstitch
          float yk = back * torso * step( ax, 0.23 );
          r += aaLine( py - 1.392, 0.0011 ) * yk;
          t += aaLine( py - 1.385, 0.00042 ) * dashA( px ) * yk;
          // shoulder seam (yoke to front) a little forward of the shoulder top
          float sh = torso * step( 1.40, py ) * step( 0.07, ax ) * step( ax, 0.22 );
          r += aaLine( vRestN.z - 0.12, 0.0 ) * 0.9 * sh;
          // armhole seam where the sleeve panel meets the body, felled stitch on the body side
          float ah = vGc.r - 0.62;
          float nearArm = step( 1.15, py ) * smoothstep( 0.13, 0.16, ax );
          r += aaLine( ah, 0.0025 ) * 1.1 * nearArm;
          t += aaLine( ah + 0.009, 0.0012 ) * dashA( px + py + pz ) * 0.9 * nearArm;
          // side seams down the flanks
          float sd = torso * step( py, 1.26 ) * step( HEM_Y, py ) * step( 0.11, ax );
          r += aaLine( vRestN.z, 0.012 ) * 0.8 * sd;
          // sleeve hems, collar edge and pocket edge topstitch (from the hem attribute)
          float up = max( sleeve, step( 1.15, py ) );
          #ifdef OPENSHIRT
          up = max( up, front * step( 0.95, py ) );
          #endif
          t += aaLine( vGc.g - 0.82, 0.008 ) * dashA( px + py + pz ) * up;
          // pocket mouth: folded hem with a stitch row 15 mm down
          float pk = front * step( 0.040, px ) * step( px, 0.142 ) * step( 1.19, py ) * step( py, 1.335 );
          t += aaLine( py - 1.315, 0.00042 ) * dashA( px ) * pk;
          r += aaLine( py - 1.329, 0.0006 ) * 0.6 * pk;
          return vec2( clamp( r, 0.0, 1.0 ), clamp( t, 0.0, 1.0 ) );
        }
        // drape folds, waist bunching, underarm pull lines, sleeve folds and storage creases (height in meters)
        float shirtH() {
          float px = vRest.x, py = vRest.y, pz = vRest.z;
          float ax = abs( px );
          float sleeve = smoothstep( 0.60, 0.64, vGc.r ) * smoothstep( 0.13, 0.16, abs( vRest.x ) );
          float torso = 1.0 - sleeve;
          float front = step( 0.0, pz );
          float n1 = cn( vec2( px * 23.0 + pz * 17.0, py * 9.0 ) );
          float drape = sin( ( px + pz * 0.6 ) * 52.0 + n1 * 3.5 + sin( py * 7.0 ) * 1.2 ) * smoothstep( 1.28, 0.92, py ) * torso;
          float waist = sin( py * 150.0 + n1 * 6.0 + sin( px * 35.0 ) * 1.6 ) * smoothstep( 0.90, 0.96, py ) * smoothstep( 1.08, 1.0, py ) * torso * ( 0.3 + 0.7 * cn( vec2( px * 30.0, pz * 30.0 ) ) );
          float pit = smoothstep( 0.15, 0.20, ax ) * smoothstep( 1.17, 1.27, py ) * smoothstep( 1.43, 1.34, py ) * torso;
          float pull = sin( ( py * 0.8 + ax * 0.6 ) * 210.0 + n1 * 2.5 ) * pit;
          float slv = sin( vFab.y * 140.0 + vFab.x * 30.0 + n1 * 3.0 ) * sleeve * ( 0.35 + 0.65 * smoothstep( 0.2, -0.6, vRestN.y ) );
          float crease = exp( - abs( py - 1.112 + ( cn( vec2( px * 14.0, 2.0 ) ) - 0.5 ) * 0.02 ) * 650.0 ) * front * torso * 0.35 * smoothstep( 0.3, 0.7, cn( vec2( px * 9.0, 5.0 ) ) )
                       + exp( - abs( ax - 0.155 ) * 750.0 ) * smoothstep( 1.30, 1.0, py ) * front * torso * 0.55;
          float crumple = cn( vRest.xy * 90.0 + vRest.z * 40.0 ) - 0.5;
          return drape * 0.0030 + waist * 0.0010 + pull * 0.0006 + slv * 0.0013 + crease * 0.0006 + crumple * 0.0004;
        }
        // linen-cotton plain weave with slubs (thicker, lighter thread runs)
        float linenW( vec2 u, out float slub ) {
          vec2 q = u * vec2( 3300.0, 3000.0 );
          float over = step( 0.0, sin( q.x * 0.5 ) * sin( q.y * 0.5 ) );
          float w = mix( 0.5 + 0.5 * sin( q.x ), 0.5 + 0.5 * sin( q.y ), over );
          float rowY = floor( q.y / 6.2832 ), rowX = floor( q.x / 6.2832 );
          slub = step( 0.82, ch( vec2( rowY, 3.1 ) ) ) * smoothstep( 0.55, 0.85, cn( vec2( u.x * 45.0, rowY * 0.37 ) ) )
               + step( 0.86, ch( vec2( rowX, 7.7 ) ) ) * smoothstep( 0.55, 0.85, cn( vec2( rowX * 0.41, u.y * 45.0 ) ) );
          slub = min( slub, 1.0 );
          return w;
        }
        #endif`)
      .replace('#include <map_fragment>', /* glsl */`
        #ifdef USE_MAP
          diffuseColor.rgb *= texture2D( map, vFab * uRepeat ).rgb;
        #endif
        if ( uPattern > 0.5 && uPattern < 1.5 ) diffuseColor.rgb = mix( diffuseColor.rgb, uColor2, step( 0.5, fract( vFab.y * 28.0 ) ) );                                    // horizontal stripes
        else if ( uPattern > 1.5 && uPattern < 2.5 ) diffuseColor.rgb = mix( diffuseColor.rgb, uColor2, step( 0.82, fract( vFab.x * 70.0 ) ) );                               // pinstripe
        else if ( uPattern > 2.5 && uPattern < 3.5 ) { float a = step( 0.5, fract( vFab.x * 22.0 ) ), b = step( 0.5, fract( vFab.y * 22.0 ) ); diffuseColor.rgb = mix( diffuseColor.rgb, uColor2, 0.5 * ( a + b ) * 0.85 ); }   // gingham
        else if ( uPattern > 3.5 && uPattern < 4.5 ) { float c1 = cn( vFab * 14.0 ) + 0.5 * cn( vFab * 31.0 ); diffuseColor.rgb = mix( diffuseColor.rgb, uColor2, smoothstep( 0.72, 0.76, c1 ) ); diffuseColor.rgb = mix( diffuseColor.rgb, uColor2 * 0.45, smoothstep( 1.02, 1.05, c1 ) ); }   // camo
        else if ( uPattern > 4.5 && uPattern < 5.5 ) diffuseColor.rgb *= 0.82 + 0.3 * cn( vFab * vec2( 900.0, 60.0 ) ) * cn( vFab * 12.0 + 4.0 );                             // denim / washed twill
        if ( uDecalPanel > -0.5 && abs( vGc.a * 8.0 - uDecalPanel ) < 0.5 ) {
          vec2 duv = ( vFab - uDecalRect.xy ) / uDecalRect.zw;
          if ( duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0 ) { vec4 dc = texture2D( uDecal, vec2( duv.x, 1.0 - duv.y ) ); diffuseColor.rgb = mix( diffuseColor.rgb, dc.rgb, dc.a ); }
        }
        float weaveAA = 1.0 - smoothstep( 0.25, 0.9, max( fwidth( vFab.x ), fwidth( vFab.y ) ) * uWeaveScale );
        #ifdef SHIRT
        {
          float slub;
          float lw = linenW( vFab, slub );
          float lAA = 1.0 - smoothstep( 0.2, 0.8, max( fwidth( vFab.x ), fwidth( vFab.y ) ) * 3300.0 / 6.2832 );
          diffuseColor.rgb *= 0.95 + 0.07 * lw * lAA + 0.035 * slub;
          float py = vRest.y;
          // sun fade on the shoulder tops and sleeve tops, a soft wash-fade patch low on the back, broad dye variation
          float sun = smoothstep( 0.2, 0.8, vRestN.y ) * smoothstep( 1.28, 1.42, py );
          vec3 faded = mix( diffuseColor.rgb, vec3( dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) ) ), 0.22 ) * 1.22 + 0.012;
          diffuseColor.rgb = mix( diffuseColor.rgb, faded, 0.55 * sun );
          float wash = smoothstep( 0.16, 0.02, length( vec2( vRest.x + 0.08, ( py - 1.04 ) * 0.8 ) ) ) * step( vRest.z, 0.0 );
          diffuseColor.rgb *= 1.0 + 0.055 * wash;
          diffuseColor.rgb *= 0.965 + 0.07 * cn( vRest.xy * 5.0 + vRest.z * 3.0 );
          // folds: valleys a touch darker
          float fh = clamp( shirtH() / 0.003, -1.0, 1.0 );
          diffuseColor.rgb *= 1.0 + 0.06 * fh * uFold;
          // seams darker, thread tone-on-tone and a little lighter
          vec2 sm2 = shirtSeams();
          diffuseColor.rgb *= 1.0 - 0.22 * sm2.x;
          diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.32 + 0.02, 0.85 * sm2.y );
        }
        #elif defined( SHORTS )
        {
          // chino shorts: waistband with belt loops, fly with J-stitch, slant front pockets, back welt pockets,
          // leg hem topstitch, crotch whiskers and soft wear on the seat and thighs
          float px = vRest.x, py = vRest.y, pz = vRest.z, ax = abs( px );
          float front = step( 0.0, pz );
          #ifdef CARGO
          diffuseColor.rgb *= 0.95 + 0.08 * cn( vFab * vec2( 700.0, 700.0 ) ) + 0.04 * cn( vFab * 6.0 + 2.0 );          // cotton twill, washed
          #else
          diffuseColor.rgb *= 0.82 + 0.3 * cn( vFab * vec2( 900.0, 60.0 ) ) * cn( vFab * 12.0 + 4.0 );
          #endif
          float fwy = max( fwidth( py ), 1e-5 ), fwx = max( fwidth( px ), 1e-5 );
          float ln = 0.0, th = 0.0;
          // waistband 4 cm with a seam below it and topstitch
          ln += 1.0 - smoothstep( 0.0, fwy * 1.5 + 0.0005, abs( py - 1.02 ) );
          th += ( 1.0 - smoothstep( 0.0, fwy + 0.0003, abs( py - 1.045 ) ) ) * step( 0.4, fract( px * 300.0 ) );
          // belt loops (front sides, hips, back center)
          float loops = 0.0;
          for ( int i = 0; i < 3; i ++ ) {
            float lx = i == 0 ? 0.075 : i == 1 ? 0.15 : 0.0;
            float isBack = i == 2 ? 1.0 : 0.0;
            float inX = 1.0 - smoothstep( 0.005, 0.005 + fwx * 1.5, abs( ax - lx ) );
            float inSide = mix( front, 1.0 - front, isBack );
            loops = max( loops, inX * inSide * step( 1.008, py ) * step( py, 1.058 ) );
          }
          // fly: a J-shaped stitch on the wearer's left of center
          float fly = front * step( 0.88, py ) * step( py, 1.02 );
          float jx = px - 0.022 + 0.018 * ( 1.0 - smoothstep( 0.88, 0.93, py ) );
          th += ( 1.0 - smoothstep( 0.0, fwx + 0.0003, abs( jx ) ) ) * fly * step( 0.4, fract( py * 300.0 ) );
          ln += ( 1.0 - smoothstep( 0.0, fwx * 1.5 + 0.0004, abs( px ) ) ) * fly;
          // slant front pockets: from the waistband 7 cm out from center down to the side
          float pk = front * step( 0.9, py ) * step( py, 1.02 );
          float sl = ( ax - 0.085 ) - ( 1.02 - py ) * 0.75;
          ln += ( 1.0 - smoothstep( 0.0, fwx * 1.5 + 0.0005, abs( sl ) ) ) * pk * step( ax, 0.2 );
          // back welt pockets
          float bw = ( 1.0 - front ) * step( 0.05, ax ) * step( ax, 0.15 );
          ln += ( 1.0 - smoothstep( 0.0, fwy * 1.5 + 0.0004, abs( py - 0.965 ) ) ) * bw;
          // leg hem topstitch 2 cm up
          th += aaLineS( vGc.g - 0.55, 0.03 ) * step( py, 0.75 ) * step( 0.4, fract( ( px + pz ) * 300.0 ) );
          // whiskers at the crotch front and wear on the seat
          float wh = front * smoothstep( 0.06, 0.02, ax - 0.07 ) * smoothstep( 0.78, 0.86, py ) * smoothstep( 0.95, 0.88, py );
          diffuseColor.rgb *= 1.0 + 0.08 * wh * smoothstep( 0.6, 1.0, sin( ( py - ax * 0.6 ) * 260.0 ) );
          diffuseColor.rgb *= 1.0 + 0.05 * ( 1.0 - front ) * smoothstep( 0.98, 0.9, py ) * cn( vRest.xy * 30.0 );
          #ifdef CARGO
          {
            // outer-thigh cargo pocket (17 x 20 cm) with a flap, pleat and snap; on the leg's outer side
            float outer = smoothstep( 0.5, 0.8, vRestN.x * sign( px ) );
            float cy0 = 0.52, cy1 = 0.72;
            float cz = pz - 0.0;
            float inP = outer * step( cy0, py ) * step( py, cy1 ) * step( abs( cz ), 0.085 );
            float edgeP = inP * ( 1.0 - smoothstep( 0.0, 0.004 + fwy, min( min( py - cy0, cy1 - py ), 0.085 - abs( cz ) ) ) );
            ln += edgeP * 1.6;
            diffuseColor.rgb *= 1.0 - 0.06 * inP;
            float flapY = cy1 - 0.055;
            ln += outer * step( abs( cz ), 0.09 ) * ( 1.0 - smoothstep( 0.0, fwy * 1.5 + 0.0012, abs( py - flapY ) ) ) * 1.2;
            diffuseColor.rgb *= 1.0 - 0.10 * outer * step( abs( cz ), 0.09 ) * smoothstep( flapY, flapY - 0.012, py ) * step( cy0, py );
            th += outer * step( abs( cz ), 0.08 ) * ( 1.0 - smoothstep( 0.0, fwy + 0.0003, abs( py - flapY - 0.008 ) ) ) * step( 0.4, fract( pz * 300.0 ) );
            ln += outer * ( 1.0 - smoothstep( 0.0, 0.0012 + fwx, abs( cz ) ) ) * step( cy0 + 0.02, py ) * step( py, flapY ) * 0.5;
            // knee seams across the front of each leg
            ln += front * ( 1.0 - smoothstep( 0.0, fwy * 1.5 + 0.0006, abs( py - 0.47 ) ) ) * step( 0.03, ax );
            // back patch pockets
            float bp = ( 1.0 - front ) * step( 0.82, py ) * step( py, 0.97 ) * step( 0.04, ax ) * step( ax, 0.16 );
            ln += bp * ( 1.0 - smoothstep( 0.0, 0.003 + fwy, min( min( py - 0.82, 0.97 - py ), min( ax - 0.04, 0.16 - ax ) ) ) );
            // outseam down the side
            ln += ( 1.0 - smoothstep( 0.0, 0.0015 + fwx, abs( vRestN.z ) ) ) * step( py, 0.95 ) * step( 0.06, ax ) * 0.6;
            // dirt, scuffs and fraying at the stacked hems; dusty knees
            float hemD = smoothstep( 0.20, 0.06, py );
            diffuseColor.rgb *= 1.0 - 0.22 * hemD * ( 0.5 + 0.5 * cn( vRest.xz * 60.0 + py * 30.0 ) );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.42, 0.36, 0.28 ), 0.18 * hemD * cn( vRest.xz * 25.0 ) );
            diffuseColor.rgb *= 1.0 + 0.06 * front * smoothstep( 0.06, 0.0, abs( py - 0.50 ) ) * cn( vRest.xy * 40.0 );
            // stacking creases above the shoe and knee/back-of-knee creases
            diffuseColor.rgb *= 1.0 - 0.10 * smoothstep( 0.24, 0.08, py ) * smoothstep( 0.4, 1.0, sin( py * 260.0 + cn( vRest.xz * 30.0 ) * 6.0 ) );
            diffuseColor.rgb *= 1.0 - 0.08 * ( 1.0 - front ) * smoothstep( 0.05, 0.0, abs( py - 0.44 ) ) * smoothstep( 0.3, 1.0, sin( py * 300.0 + px * 40.0 ) );
          }
          #endif
          diffuseColor.rgb *= 1.0 - 0.32 * clamp( ln, 0.0, 1.0 );
          diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.25, 0.8 * clamp( th, 0.0, 1.0 ) );
          diffuseColor.rgb *= 1.0 - 0.18 * loops * ( 0.6 + 0.4 * step( 0.5, fract( py * 200.0 ) ) );
          diffuseColor.rgb *= 1.0 - 0.12 * smoothstep( 0.6, 1.0, vGc.g ) * step( py, 0.75 );
        }
        #elif defined( SHOE )
        {
          // modeled low-top (sneakers.py): uv0 = (s heel->toe, arch 0 outer base .. 1 inner base; < 0 on the sole),
          // vertex color a = lace. Panels and seams are drawn from (s, arch) so they stay crisp at any distance.
          float s = vShoeUv.x, a = vShoeUv.y, sy = vRest.y;
          float lace = smoothstep( 0.5, 0.9, vGc.a );
          float sole = 1.0 - step( -0.05, a );
          vec3 leather = diffuseColor.rgb * ( 0.975 + 0.04 * cn( vRest.xz * 520.0 + sy * 410.0 ) );
          // panels: toe cap and heel counter are separate leather pieces (a hair warmer), the eyestay a little greyer
          float capLine = 0.78 + 0.07 * ( 1.0 - sin( clamp( a, 0.0, 1.0 ) * PI ) );
          float toeCap = step( capLine, s );
          float heelLine = 0.20 + 0.06 * abs( cos( clamp( a, 0.0, 1.0 ) * PI ) );
          float heel = step( s, heelLine ) * step( sy, 0.072 );
          float eyestay = step( 0.30, a ) * step( a, 0.70 ) * step( 0.40, s ) * step( s, 0.76 );
          leather *= mix( vec3( 1.0 ), vec3( 1.02, 0.99, 0.95 ), max( toeCap, heel ) );
          leather *= mix( 1.0, 0.94, eyestay );
          // seams (sunk) with a stitch row 2.5 mm inside each panel edge
          float fs = max( fwidth( s ), 1e-5 ), fa = max( fwidth( a ), 1e-5 );
          float seam = max( aaLineS( s - capLine, fs * 0.8 ), aaLineS( s - heelLine, fs * 0.8 ) * step( sy, 0.072 ) );
          float st = aaLineS( s - capLine + 0.012, fs * 0.6 ) + aaLineS( s - heelLine - 0.012, fs * 0.6 ) * step( sy, 0.07 );
          st *= step( 0.45, fract( ( a * 0.24 + sy ) * 260.0 ) );
          leather *= 1.0 - 0.30 * seam - 0.18 * clamp( st, 0.0, 1.0 );
          // eyelets: two rows along the eyestay
          float ey = 0.0;
          for ( int i = 0; i < 5; i ++ ) {
            float es = 0.47 + float( i ) * 0.055;
            ey = max( ey, 1.0 - smoothstep( 0.0025, 0.0040, length( vec2( ( s - es ) * 0.27, ( abs( a - 0.5 ) - 0.115 ) * 0.24 ) ) ) );
          }
          leather = mix( leather, vec3( 0.20, 0.20, 0.21 ), ey * step( 0.40, s ) * step( s, 0.76 ) );
          // collar lining shows as a darker padded rim
          leather *= 1.0 - 0.22 * smoothstep( 0.5, 1.0, vGc.g );
          // cupsole: off-white rubber, a groove 12 mm up, darker grime at the ground line, tread underneath
          vec3 rubber = vec3( 0.86, 0.84, 0.79 ) * ( 0.96 + 0.05 * cn( vRest.xz * 380.0 ) );
          rubber *= 1.0 - 0.35 * aaLineS( sy - 0.013, max( fwidth( sy ), 1e-5 ) * 1.2 );
          rubber *= 1.0 - 0.25 * smoothstep( 0.006, 0.0, sy );
          rubber = mix( rubber, vec3( 0.45, 0.42, 0.38 ), 0.35 * smoothstep( 0.004, -0.002, sy ) );
          vec3 laceC = vec3( 0.90, 0.89, 0.86 ) * ( 0.9 + 0.12 * sin( vFab.x * 2600.0 ) );
          vec3 shoeC = mix( mix( leather, rubber, sole ), laceC, lace );
          // light scuffs and dust: toe, outer side, sole edge
          float scuff = smoothstep( 0.62, 0.82, cn( vRest.xz * 95.0 + sy * 60.0 ) ) * ( 0.4 + 0.6 * toeCap );
          shoeC *= 1.0 - 0.10 * scuff;
          shoeC = mix( shoeC, vec3( 0.55, 0.50, 0.43 ), 0.10 * cn( vRest.xz * 14.0 + 3.0 ) * smoothstep( 0.05, 0.0, sy ) );
          diffuseColor.rgb = shoeC;
        }
        #else
        diffuseColor.rgb *= ( 0.80 + 0.20 * vGc.r ) * ( 1.0 - 0.10 * vGc.g ) * ( 1.0 + 0.05 * weaveH( vFab ) * weaveAA * uWeave );
        #endif
        #ifdef SHIRT
        {
          // the print is dyed into the weave: thread-scale breakup and soft uneven dye, so it never reads as a sticker
          float th = cn( vFab * 1400.0 ) * 0.6 + cn( vFab * vec2( 2600.0, 320.0 ) ) * 0.4;
          diffuseColor.rgb *= mix( 1.0, 0.88 + 0.22 * th, weaveAA );
          diffuseColor.rgb *= 0.95 + 0.08 * cn( vFab * 22.0 + 5.0 );
        }
        #endif
        float wetK = uWetC * ( 1.0 - smoothstep( uWetLine - 0.02, uWetLine + 0.10, vWetH ) );       // wicks a little above the water line
        diffuseColor.rgb *= mix( 1.0, 0.58, wetK );
        if ( ! gl_FrontFacing ) diffuseColor.rgb *= 0.55;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( roughness, 0.32, uWetC * ( 1.0 - smoothstep( uWetLine - 0.02, uWetLine + 0.10, vWetH ) ) * 0.85 );')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        {
          float fw = max( fwidth( vFab.x ), fwidth( vFab.y ) );
          #ifdef SHIRT
            float slubN;
            float lwN = linenW( vFab, slubN );
            vec2 smN = shirtSeams();
            float hC = shirtH() * uFold
                     + ( lwN * 0.00006 + slubN * 0.00008 ) * ( 1.0 - smoothstep( 0.2, 0.8, fw * 3300.0 / 6.2832 ) )
                     - smN.x * 0.00035 + smN.y * 0.00012;
          #else
            float hC = clothH( vFab ) * 0.0045 + weaveH( vFab ) * 0.00010 * uWeave * ( 1.0 - smoothstep( 0.25, 0.9, fw * uWeaveScale ) );
          #endif
          #ifdef CARGO
          {
            // trousers: horizontal bunching over the knee and behind it, and the stacked break above the shoe
            float py = vRest.y;
            float kz = smoothstep( 0.38, 0.46, py ) * smoothstep( 0.60, 0.50, py );
            hC += kz * 0.0018 * sin( py * 165.0 + cn( vRest.xz * 30.0 ) * 3.0 ) * ( 0.55 + 0.45 * cn( vRest.xz * 12.0 + 2.0 ) );
            float az = smoothstep( 0.24, 0.07, py );
            hC += az * 0.0026 * sin( py * 205.0 + cn( vRest.xz * 25.0 ) * 4.0 );
          }
          #endif
          vec3 dpx = dFdx( - vViewPosition ), dpy = dFdy( - vViewPosition );
          float dhx = dFdx( hC ), dhy = dFdy( hC );
          vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx );
          float det = dot( dpx, r1 );
          normal = normalize( abs( det ) * normal - sign( det ) * ( dhx * r1 + dhy * r2 ) );
        }`);
  };
  m.customProgramCacheKey = () => 'nicoCloth' + (m.map ? 'M' : '') + (o.construct ? 'S' : '') + (o.shoe ? 'H' : '') + (o.clothSim ? 'C' : '') + (o.shorts ? 'P' : '') + (o.cargo ? 'G' : '') + (o.leather ? 'L' : '') + (o.openShirt ? 'O' : '');
  return m;
}

// Pearl shirt button: four sewn-through holes with a cross of thread, a raised rim and a faint nacre play of color.
// `centers` are the bind-pose heights (meters) of the buttons down the placket; the button faces +z.
export function makeButtonMaterial(o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    name: 'shirtButton',
    color: new THREE.Color(o.color ?? 0xf1ece2),
    roughness: 0.3,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
    iridescence: 0.35,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [220, 480],
    sheen: 0,
  });
  const u = {
    uThread: { value: new THREE.Color(o.thread ?? 0x2b7f7c) },
    uTop: { value: o.top ?? 1.335 },
    uStep: { value: o.step ?? 0.095 },
    uCount: { value: (o.count ?? 5) - 1 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBtn; varying vec3 vBtnN; varying vec2 vBtnUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBtn = position; vBtnN = normal; vBtnUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBtn; varying vec3 vBtnN; varying vec2 vBtnUv; uniform vec3 uThread; uniform float uTop, uStep, uCount;')
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
        vec2 bp = ( vBtnUv - 0.5 ) * 0.0112;
        float br = length( bp );
        float face = smoothstep( 0.3, 0.7, vBtnN.z );
        float holes = 0.0;
        for ( int i = 0; i < 4; i ++ ) {
          vec2 hc = vec2( ( i == 0 || i == 3 ) ? 0.00125 : -0.00125, i < 2 ? 0.00125 : -0.00125 );
          holes = max( holes, 1.0 - smoothstep( 0.00045, 0.00062, length( bp - hc ) ) );
        }
        float th = 0.0;
        if ( max( abs( bp.x ), abs( bp.y ) ) < 0.0014 ) {
          th = max( 1.0 - smoothstep( 0.00025, 0.0004, abs( bp.x - bp.y ) * 0.7071 ), 1.0 - smoothstep( 0.00025, 0.0004, abs( bp.x + bp.y ) * 0.7071 ) );
        }
        float dish = smoothstep( 0.0046, 0.0036, br );
        diffuseColor.rgb *= mix( 1.0, 0.93, dish * 0.5 );
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.18, holes * face );
        diffuseColor.rgb = mix( diffuseColor.rgb, uThread, th * face );`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness;');
  };
  m.customProgramCacheKey = () => 'shirtButton';
  return m;
}

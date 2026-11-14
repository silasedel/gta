// Port Solana V2 — Nico materials (CHARACTER track): skin (subsurface approximation, pore + micro normal detail,
// sweat / wetness / sunburn / tan), eyes (refractive cornea, parallax iris, socket shadow), hair shells, lashes, teeth, cloth.
import * as THREE from 'three';

const TEX = '/assets/characters/nico/tex/';
const loader = new THREE.TextureLoader();
const cache = new Map();
export function tex(file, { srgb = false, repeat = false, aniso = 8, base = TEX } = {}) {
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
    uSSS: { value: 1.0 }, uWet: { value: 0 }, uSweat: { value: 0 }, uBurn: { value: 0 }, uTan: { value: 0 }, uFlush: { value: 0 },
    uCover: { value: null }, uCoverOn: { value: 0 }, uTattoo: { value: null }, uTattooOn: { value: 0 },
  };
}

const SKIN_PARS = /* glsl */`
uniform float uSSS, uWet, uSweat, uBurn, uTan, uFlush, uCoverOn, uTattooOn, uMicroTile;
uniform sampler2D uM2, uMicro, uDrops, uCover, uTattoo;
float nicoThick = 0.0; float nicoBead = 0.0; vec2 nicoBeadN = vec2(0.0);
`;

export function makeSkinMaterial(kind, state) {
  // kind: 'head' | 'body' | 'far'
  const far = kind === 'far';
  const m = new THREE.MeshPhysicalMaterial({
    name: 'skin_' + kind,
    map: tex(far ? 'skin_far.webp' : kind + '_albedo.webp', { srgb: true }),
    roughness: far ? 0.6 : 1.0, metalness: 0, ior: 1.4, clearcoat: far ? 0 : 0.10, clearcoatRoughness: 0.32,
  });
  if (!far) {
    m.normalMap = tex(kind + '_normal.webp'); m.normalScale = new THREE.Vector2(1, -1);
    const m1 = tex(kind + '_m1.webp'); m.aoMap = m1; m.roughnessMap = m1; m.aoMapIntensity = 0.85;
  }
  const u = { uM2: { value: far ? null : tex(kind + '_m2.webp') }, uMicro: { value: far ? null : tex('skin_micro_n.webp', { repeat: true }) },
    uDrops: { value: far ? null : tex('droplets.webp', { repeat: true }) }, uMicroTile: { value: kind === 'head' ? 34 : 60 } };
  m.userData.u = u; m.userData.state = state;
  m.defines = { NICO_SKIN: 1 }; if (far) m.defines.NICO_FAR = 1; if (kind === 'body') m.defines.NICO_BODY = 1;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, state);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_PARS)
      .replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );', /* glsl */`
        {
          float ndl = dot( geometryNormal, directLight.direction );
          vec3 wr = uSSS * vec3( 0.42, 0.16, 0.09 );
          vec3 dif = saturate( ( vec3( ndl ) + wr ) / ( 1.0 + wr ) );
          float band = smoothstep( -0.35, 0.05, ndl ) * ( 1.0 - smoothstep( 0.05, 0.6, ndl ) );
          dif += band * uSSS * vec3( 0.11, 0.012, 0.0 );
          vec3 h2 = normalize( directLight.direction + geometryNormal * 0.4 );
          float back = pow( saturate( dot( geometryViewDir, - h2 ) ), 4.0 ) * nicoThick;
          reflectedLight.directDiffuse += directLight.color * ( dif + back * vec3( 1.3, 0.30, 0.15 ) * uSSS ) * BRDF_Lambert( material.diffuseColor );
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
        diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.80, 0.70, 0.62 ), tanK );
        float burn = clamp( uBurn * m2.g + uFlush * m2.g * 0.6, 0.0, 1.0 );
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.22, 0.70, 0.66 ), burn * 0.75 );
        // water and sweat beads: more beads appear as the amount rises
        float wetAmt = clamp( max( uWet, uSweat * m2.r ), 0.0, 1.0 );
        vec4 dr = texture2D( uDrops, vMapUv * uMicroTile * 0.22 );
        nicoBead = dr.a * step( 1.0 - wetAmt * 0.85, dr.b ) * step( 0.02, wetAmt );
        nicoBeadN = ( dr.rg * 2.0 - 1.0 ) * nicoBead;
        diffuseColor.rgb *= 1.0 - 0.12 * uWet;
        nicoThick = texture2D( roughnessMap, vMapUv ).b;
      #endif`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
      #ifndef NICO_FAR
        roughnessFactor = mix( roughnessFactor, 0.22, clamp( max( uWet, uSweat * m2.r * 0.7 ), 0.0, 1.0 ) * 0.75 );
        roughnessFactor = mix( roughnessFactor, 0.05, nicoBead );
      #endif`)
      .replace('mapN.xy *= normalScale;', /* glsl */`
        vec3 mic = texture2D( uMicro, vNormalMapUv * uMicroTile ).xyz * 2.0 - 1.0;
        float micK = 0.55 * ( 1.0 - smoothstep( 0.0015, 0.006, max( fwidth( vNormalMapUv.x ), fwidth( vNormalMapUv.y ) ) * uMicroTile ) );   // fades out with distance: no shimmer
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
  const m = new THREE.MeshPhysicalMaterial({ name: 'eye', color: 0xffffff, roughness: 0.2, metalness: 0, ior: 1.376, clearcoat: 1.0, clearcoatRoughness: 0.04 });
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
        vec3 ecol = mix( sclC * vec3( 0.86, 0.80, 0.76 ), irisC.rgb * 0.52, inIris );
        ecol *= 1.0 - 0.35 * smoothstep( 0.80, 1.0, ir ) * ( 1.0 - smoothstep( 1.0, 1.25, ir ) );     // limbal shadow ring
        // socket shadow: where the lids and the socket shade the globe (in head space, so it does not turn with the eye)
        vec3 sn = qrot( uEyeQ, en );
        float sx = atan( sn.x, sn.z ), sy = atan( sn.y, sn.z );
        float up = uLid.y * ( 1.0 - uBlink );
        float dEl = length( vec2( sx / uLid.x, sy / ( sy > 0.0 ? up + 0.02 : uLid.z ) ) );
        float lidAO = 1.0 - 0.86 * smoothstep( 0.30, 1.0, dEl );
        lidAO *= 1.0 - 0.35 * smoothstep( up * 0.25, up * 0.95, sy );                                  // upper lid + lash shadow
        diffuseColor.rgb = ecol * lidAO;`)
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
  const u = { uK: { value: k }, uLen: state.uHairLen, uHairC: state.uHairC, uHairMask: { value: tex('head_hair.webp') }, uComb: state.uComb, uWetH: state.uWet };
  const m = new THREE.MeshStandardMaterial({ name: 'hairShell', color: 0xffffff, roughness: 0.42, metalness: 0, side: THREE.DoubleSide });
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
        uniform float uK, uWetH; uniform vec3 uHairC; uniform sampler2D uHairMask; varying vec2 vHUv; varying float vHLen;
        float hh( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }`)
      .replace('#include <map_fragment>', /* glsl */`
        vec4 hm = texture2D( uHairMask, vHUv );
        if ( hm.r < 0.5 ) discard;
        // strands: two cell scales (clumps + single hairs); each cell holds one strand of random length and position
        float dens = mix( 1250.0, 760.0, hm.g );
        vec2 g = vHUv * dens; vec2 c = floor( g ); vec2 f = fract( g ) - 0.5;
        float id = hh( c ); vec2 off = ( vec2( hh( c + 7.1 ), hh( c + 3.7 ) ) - 0.5 ) * 0.55;
        float clump = hh( floor( vHUv * dens * 0.17 ) );
        float slen = ( 0.45 + 0.55 * id ) * ( 0.75 + 0.25 * clump );
        float rad = mix( 0.42, 0.10, uK ) * ( 0.8 + 0.4 * hh( c + 1.3 ) );
        if ( uK > slen || length( f - off * ( 1.0 - uK * 0.5 ) ) > rad ) { if ( uK > 0.001 ) discard; }
        float tip = uK / max( slen, 0.01 );
        vec3 hc = uHairC * ( 0.55 + 0.85 * id ) * mix( 0.42, 1.25, tip ) * mix( 1.0, 0.7, uWetH );     // dark at the roots (self-shadow), lighter tips
        if ( uK <= 0.001 ) hc = uHairC * 0.35;
        diffuseColor.rgb = hc;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( 0.48, 0.22, uWetH );');
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
  if (o.print) { m.map = tex(o.print, { srgb: true, repeat: true, base: '' }); }
  const u = { uRepeat: { value: 1 / (o.repeatM || 0.6) }, uWeave: { value: o.weave ?? 1 }, uWeaveScale: { value: o.weaveScale ?? 2400 }, uFold: { value: o.fold ?? 1 },
    uTime: o.time || { value: 0 }, uWind: o.wind || { value: new THREE.Vector3(0.4, 0, 0.2) }, uFlutter: { value: o.flutter ?? 1 }, uWetC: o.wet || { value: 0 },
    uColor2: { value: new THREE.Color(o.color2 ?? 0xffffff) }, uPattern: { value: o.pattern ?? 0 }, uDecal: { value: o.decal ? tex(o.decal, { srgb: true, base: '' }) : null },
    uDecalRect: { value: new THREE.Vector4(...(o.decalRect || [0, 0, 0, 0])) }, uDecalPanel: { value: o.decalPanel ?? -1 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 uv1;\nattribute vec4 color;\nvarying vec2 vFab; varying vec4 vGc; uniform float uTime, uFlutter; uniform vec3 uWind;\n#ifdef SHIRT\nvarying vec3 vRest; varying vec3 vRestN;\n#endif')
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        vFab = uv1; vGc = color;
        #ifdef SHIRT
          vRest = position;
          vRestN = normal;
        #endif
        float fl = color.b * uFlutter;
        float ph = position.x * 9.0 + position.y * 13.0 + position.z * 7.0;
        transformed += normal * ( sin( uTime * 5.3 + ph ) * 0.0035 + sin( uTime * 8.1 + ph * 1.7 ) * 0.0018 ) * fl * ( 0.5 + length( uWind ) );
        transformed += uWind * ( 0.012 * fl * ( 0.6 + 0.4 * sin( uTime * 2.1 + ph * 0.3 ) ) );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        varying vec2 vFab; varying vec4 vGc; uniform float uRepeat, uWeave, uWeaveScale, uFold, uWetC, uPattern, uDecalPanel; uniform vec3 uColor2; uniform sampler2D uDecal; uniform vec4 uDecalRect;
        float ch( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
        float cn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( ch( i ), ch( i + vec2( 1, 0 ) ), f.x ), mix( ch( i + vec2( 0, 1 ) ), ch( i + vec2( 1, 1 ) ), f.x ), f.y ); }
        float clothH( vec2 u ) {                                   // drape folds + crumple (meters) and thread relief
          float h = 0.5 * sin( u.x * 55.0 + sin( u.y * 14.0 ) * 2.2 + cn( u * 9.0 ) * 4.0 ) * ( 0.5 + 0.5 * cn( u * 5.0 + 3.0 ) );
          h += 0.6 * ( cn( u * 38.0 ) - 0.5 ) + 0.3 * ( cn( u * 90.0 ) - 0.5 );
          return h * uFold;
        }
        float weaveH( vec2 u ) { vec2 q = u * uWeaveScale; return ( sin( q.x ) * sin( q.y ) ) * step( 0.0, sin( q.x * 0.5 ) * sin( q.y * 0.5 ) ) + 0.35 * sin( q.x * 2.0 ) * sin( q.y * 2.0 ); }
        #ifdef SHIRT
        varying vec3 vRest; varying vec3 vRestN;
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
        const float HEM_Y = 0.872;
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
          float sd = torso * step( py, 1.26 ) * step( HEM_Y, py );
          r += aaLine( vRestN.z, 0.012 ) * 0.8 * sd;
          // sleeve hems, collar edge and pocket edge topstitch (from the hem attribute)
          float up = max( sleeve, step( 1.15, py ) );
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
        #else
        diffuseColor.rgb *= ( 0.80 + 0.20 * vGc.r ) * ( 1.0 - 0.10 * vGc.g ) * ( 1.0 + 0.05 * weaveH( vFab ) * weaveAA * uWeave );
        #endif
        diffuseColor.rgb *= mix( 1.0, 0.62, uWetC );
        if ( ! gl_FrontFacing ) diffuseColor.rgb *= 0.55;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( roughness, 0.35, uWetC * 0.8 );')
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
          vec3 dpx = dFdx( - vViewPosition ), dpy = dFdy( - vViewPosition );
          float dhx = dFdx( hC ), dhy = dFdy( hC );
          vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx );
          float det = dot( dpx, r1 );
          normal = normalize( abs( det ) * normal - sign( det ) * ( dhx * r1 + dhy * r2 ) );
        }`);
  };
  m.customProgramCacheKey = () => 'nicoCloth' + (m.map ? 'M' : '') + (o.construct ? 'S' : '');
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
      .replace('#include <common>', '#include <common>\nvarying vec3 vBtn; varying vec3 vBtnN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBtn = position; vBtnN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBtn; varying vec3 vBtnN; uniform vec3 uThread; uniform float uTop, uStep, uCount;')
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
        float bk = clamp( floor( ( uTop - vBtn.y ) / uStep + 0.5 ), 0.0, uCount );
        vec2 bp = vec2( vBtn.x, vBtn.y - ( uTop - bk * uStep ) );
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

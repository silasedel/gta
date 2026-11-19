// Stage 1 weather: wet surfaces and puddles for every MeshStandard / MeshPhysical material (one global shader patch).
// Imported by main.js before any material compiles. The weather module writes WEATHER_U each frame:
//   x = wetness 0..1 (surfaces darken and turn glossy), y = puddles 0..1 (standing water on flat ground),
//   z = rain intensity 0..1 (ripples in puddles), w = time in seconds.
// How it reaches every material: three.js clones ShaderLib uniforms per material, but copies a Float32Array value by
// reference, so all materials share this one array. ShaderMaterials that include the lighting chunk get the
// declaration but no value (they stay dry).
// Opt out per material: material.defines = { NO_WET: '' } (interiors, water, glass that is already glossy).
import * as THREE from 'three';

export const WEATHER_U = new Float32Array([0, 0, 0, 0]);

(function patch() {
  const C = THREE.ShaderChunk;
  if (C.lights_physical_fragment.includes('stage1 wet')) return;
  for (const k of ['standard', 'physical']) {
    const L = THREE.ShaderLib[k];
    if (L && L.uniforms && !L.uniforms.uWeather) L.uniforms.uWeather = { value: WEATHER_U };
  }
  C.lights_physical_pars_fragment =
    /* glsl */ `
uniform vec4 uWeather;
float wetHash( vec2 p ) { p = fract( p * vec2( 123.34, 345.45 ) ); p += dot( p, p + 34.345 ); return fract( p.x * p.y ); }
float wetNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( wetHash( i ), wetHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( wetHash( i + vec2( 0.0, 1.0 ) ), wetHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// rain ripples: expanding rings in a jittered cell grid (two layers), returns a small xz normal tilt
vec2 wetRipple( vec2 p, float t ) {
  vec2 acc = vec2( 0.0 );
  for ( int L = 0; L < 2; L ++ ) {
    vec2 q = p * ( L == 0 ? 2.3 : 3.7 ) + float( L ) * 17.3;
    vec2 c = floor( q ); vec2 f = fract( q ) - 0.5;
    float h = wetHash( c + float( L ) * 3.1 );
    vec2 o = ( vec2( wetHash( c + 1.7 ), wetHash( c + 9.2 ) ) - 0.5 ) * 0.6;
    float ph = fract( t * ( 0.9 + 0.5 * h ) + h );
    vec2 d = f - o; float r = length( d );
    float ring = sin( ( r - ph * 0.45 ) * 60.0 ) * ( 1.0 - ph ) * smoothstep( 0.45, 0.0, abs( r - ph * 0.45 ) * 6.0 );
    acc += ( r > 1e-4 ? d / r : vec2( 0.0 ) ) * ring;
  }
  return acc * 0.12;
}
` + C.lights_physical_pars_fragment;
  const find = 'material.roughness = min( material.roughness, 1.0 );';
  if (!C.lights_physical_fragment.includes(find)) {
    console.warn('[wet] chunk layout changed; not patched');
    return;
  }
  C.lights_physical_fragment = C.lights_physical_fragment.replace(
    find,
    `${find}
#ifndef NO_WET
if ( uWeather.x > 0.001 ) { // stage1 wet
  vec3 wN = ( vec4( normal, 0.0 ) * viewMatrix ).xyz;                       // view -> world (rotation transpose)
  vec3 wP = ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;
  float up = smoothstep( 0.5, 0.92, wN.y );
  float wet = uWeather.x * mix( 0.3, 1.0, up );                               // walls catch some rain, ground the most
  // puddles: low-frequency patches on flat, upward surfaces only (curbs and roofs edges stay dry-ish)
  float pn = wetNoise( wP.xz * 0.11 ) * 0.65 + wetNoise( wP.xz * 0.43 + 7.0 ) * 0.35;
  float puddle = uWeather.y * up * smoothstep( 0.47, 0.71, pn + 0.18 * uWeather.y ); // r8: wider, soft rim (was 0.52..0.66: a hard outline)
  float porous = ( 1.0 - metalnessFactor ) * smoothstep( 0.25, 0.7, roughnessFactor );
  // living surfaces (grass, leaves: green-dominant albedo, or alpha-tested cards) darken but barely turn glossy and
  // never hold puddles; hard surfaces (asphalt, concrete, roofs, paint) get the full sheen
  vec3 dc = material.diffuseColor;
  float leafy = smoothstep( 0.01, 0.06, dc.g - max( dc.r, dc.b ) * 0.92 );
  #ifdef USE_ALPHATEST
    leafy = max( leafy, 0.85 );
  #endif
  // user (Nov 17): rain looked like one plain shiny layer. Real wet ground varies: drier and wetter patches, and porous
  // sand / soil soak the water up (darker, satin at most) while sealed surfaces (asphalt, concrete, paint) gloss.
  // Sand: bright, warm, low-saturation albedo. The surface's own roughness detail is kept (aggregate stays rough).
  float lum = dot( dc, vec3( 0.299, 0.587, 0.114 ) );
  float sandy = smoothstep( 0.22, 0.4, lum ) * smoothstep( 0.02, 0.08, dc.r - dc.b ) * ( 1.0 - smoothstep( 0.25, 0.45, dc.r - dc.b ) );
  float patchW = mix( 0.55, 1.0, smoothstep( 0.3, 0.7, wetNoise( wP.xz * 0.045 + 3.1 ) * 0.7 + wetNoise( wP.xz * 0.21 ) * 0.3 ) );
  wet *= patchW;
  float sheen = wet * ( 1.0 - 0.8 * leafy ) * ( 1.0 - 0.75 * sandy );
  puddle *= ( 1.0 - leafy ) * ( 1.0 - 0.7 * sandy );
  material.diffuseColor *= mix( 1.0, 0.6, wet * max( porous, sandy ) ) * mix( 1.0, 0.85, puddle ) * mix( 1.0, 0.82, wet * sandy );
  float wetR = mix( mix( 0.2, 0.42, 1.0 - up ), 0.55, sandy ) + ( material.roughness - 0.6 ) * 0.3;
  material.roughness = mix( material.roughness, clamp( wetR, 0.12, 0.85 ), sheen * 0.85 );
  material.roughness = mix( material.roughness, 0.08, puddle * puddle ); // r8: the mirror sets in toward the middle (gloss rose in a ring at the rim) and is never razor-sharp (sparkle / flicker under TAA)
  // standing water is flat: tilt the shading normal back toward world up, plus rain ripples while it rains
  vec2 rip = uWeather.z > 0.01 ? wetRipple( wP.xz, uWeather.w ) * uWeather.z : vec2( 0.0 );
  vec3 flatN = normalize( ( viewMatrix * vec4( rip.x, 1.0, rip.y, 0.0 ) ).xyz );
  normal = normalize( mix( normal, flatN, puddle ) );
}
#endif`,
  );
})();

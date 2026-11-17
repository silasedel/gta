// Look pass 3 (overnight Nov 17, "look" helper): global lighting upgrades that need a shader patch.
//   - Soft sun shadows (PCSS-style): a blocker search estimates how far the occluder is, and the filter radius grows
//     with that distance (contact shadows stay crisp, a palm's shadow 8 m away gets a wide soft penumbra). The disk is
//     rotated per pixel with interleaved gradient noise advanced every frame (uFrameN), so TAA resolves it: no fixed
//     dot pattern, no grain. A receiver-plane depth gradient keeps sloped ground free of acne inside the wider kernel.
// Runtime A/B (only in a page loaded with ?look3): game.look3 = false restores the old look without a reload.
// LOOK_U is shared by reference with every lit built-in material (same mechanism as WEATHER_U in wetSurfaces.js):
//   x = frame index (0..15, from frameNoise.js), y = soft shadows on (0/1), z = penumbra meters per meter of
//   occluder distance, w = minimum filter radius in shadow-map texels.
// ShaderMaterials that include the shadow chunk get the declaration but no value (all zero): they keep the stock filter.
import * as THREE from 'three';

// OFF by default until verified (lead): the shader patches are only installed with ?look3 in the URL; then game.look3
// (default true in such a session) switches the look at run time for in-session A/B
export const LOOK3_ENABLED = typeof location !== 'undefined' && /[?&]look3\b/.test(location.search) && !/[?&]look3=0\b/.test(location.search);
export const LOOK3_DEFAULT = LOOK3_ENABLED;
export const LOOK_U = new Float32Array([0, LOOK3_DEFAULT ? 1 : 0, 0.022, 1.6]);
// LOOK_V (fog): x = aerial-perspective density cap for clear weather (0 = the old fixed cap), y = haze color pull
// toward the warm sun side, z/w spare. Shared with every fogged built-in material (and ShaderMaterials that merge
// UniformsLib.fog after this module loaded).
export const LOOK_V = new Float32Array([0, 0, 0, 0]);
export const LOOKU_DECL = '#ifndef PS_LOOKU\n#define PS_LOOKU\nuniform vec4 uLookU;\nuniform vec4 uLookV;\n#endif\n';
// depth range of the sun shadow cameras (environment.js: near 1, far 900): converts a shadow-depth difference to meters
const SUN_DEPTH_M = 899.0;

(function patch() {
  const C = THREE.ShaderChunk;
  if (!LOOK3_ENABLED || C.shadowmap_pars_fragment.includes('psPCSS')) return;
  for (const k of Object.keys(THREE.ShaderLib)) {
    const L = THREE.ShaderLib[k];
    if (L && L.uniforms && !L.uniforms.uLookU) { L.uniforms.uLookU = { value: LOOK_U }; L.uniforms.uLookV = { value: LOOK_V }; }
  }
  for (const k of ['fog', 'lights']) {
    const U = THREE.UniformsLib[k];
    if (U && !U.uLookU) { U.uLookU = { value: LOOK_U }; U.uLookV = { value: LOOK_V }; }
  }
  C.fog_pars_fragment = LOOKU_DECL + C.fog_pars_fragment;
  const head = '#elif defined( SHADOWMAP_TYPE_PCF_SOFT )';
  const tail = '#elif defined( SHADOWMAP_TYPE_VSM )';
  let s = C.shadowmap_pars_fragment;
  const a = s.indexOf(head), b = s.indexOf(tail);
  if (a < 0 || b < a) { console.warn('[look3] PCF soft branch not found: soft shadows off'); return; }
  const fn = LOOKU_DECL + /* glsl */`
	float psIgn( vec2 p ) { return fract( 52.9829189 * fract( dot( p + 5.588238 * uLookU.x, vec2( 0.06711056, 0.00583715 ) ) ) ); }
	// sc: projected + biased shadow coord; mPerUv: shadow frustum width in meters (passed through shadow.radius)
	float psPCSS( sampler2D shadowMap, vec2 shadowMapSize, float mPerUv, vec3 sc ) {
		float texel = 1.0 / shadowMapSize.x;
		// receiver plane depth gradient (dz per shadow uv): the wider kernel would otherwise hit the receiver itself
		vec3 dx = dFdx( sc ), dy = dFdy( sc );
		float det = dx.x * dy.y - dx.y * dy.x;
		vec2 dz = abs( det ) > 1e-12 ? vec2( dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z ) / det : vec2( 0.0 );
		float dzMax = 5.0 * mPerUv / ${SUN_DEPTH_M.toFixed(1)}; // slopes up to ~79 degrees to the light
		dz = clamp( dz, vec2( -dzMax ), vec2( dzMax ) );
		float minR = uLookU.w * texel;
		float searchR = max( 0.55 / mPerUv, minR * 2.0 ); // finds occluders up to ~25 m away
		float a0 = psIgn( gl_FragCoord.xy ) * 6.2831853;
		float bSum = 0.0, bN = 0.0;
		for ( int i = 0; i < 8; i ++ ) {
			float fi = float( i );
			float a = a0 + fi * 2.39996323;
			vec2 o = vec2( cos( a ), sin( a ) ) * sqrt( ( fi + 0.5 ) / 8.0 ) * searchR;
			float d = unpackRGBAToDepth( texture2D( shadowMap, sc.xy + o ) );
			float zr = sc.z + dot( dz, o ) - 0.06 / ${SUN_DEPTH_M.toFixed(1)};
			if ( d < zr ) { bSum += d; bN += 1.0; }
		}
		if ( bN < 0.5 ) return 1.0;
		float dzM = max( sc.z - bSum / bN, 0.0 ) * ${SUN_DEPTH_M.toFixed(1)};
		float penR = clamp( dzM * uLookU.z * 0.5 / mPerUv, minR, searchR );
		float sum = 0.0;
		for ( int i = 0; i < 12; i ++ ) {
			float fi = float( i );
			float a = a0 + 1.1 + fi * 2.39996323;
			vec2 o = vec2( cos( a ), sin( a ) ) * sqrt( ( fi + 0.5 ) / 12.0 ) * penR;
			sum += step( sc.z + dot( dz, o ), unpackRGBAToDepth( texture2D( shadowMap, sc.xy + o ) ) );
		}
		return sum / 12.0;
	}
`;
  // the helper must sit before getShadow (same #ifdef USE_SHADOWMAP block)
  const gs = s.indexOf('float getShadow(');
  if (gs < 0) { console.warn('[look3] getShadow not found'); return; }
  s = s.slice(0, gs) + fn + '\n\t' + s.slice(gs);
  const a2 = s.indexOf(head), b2 = s.indexOf(tail);
  const body = s.slice(a2 + head.length, b2);
  s = s.slice(0, a2) + head + `
			if ( uLookU.y > 0.5 && shadowRadius > 20.0 ) {
				shadow = psPCSS( shadowMap, shadowMapSize, shadowRadius, shadowCoord.xyz );
			} else {
` + body + `
			}
		` + s.slice(b2);
  C.shadowmap_pars_fragment = s;
})();

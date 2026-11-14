import * as THREE from 'three';

// Global fog upgrade: exponential height fog with sun in-scattering.
// Uses FogExp2's fogDensity as a linear extinction coefficient and the first
// directional light (the sun / moon, which casts shadows so it sorts first) for in-scatter.
export const FOG_HEIGHT_FALLOFF = 0.0045;
export const FOG_INSCATTER = 0.055;
export const FOG_INSCATTER_POW = 7.0;
// look track: daytime aerial-perspective floor (added to FogExp2 density while the sun is up) and the haze color model
// ?lookoff in the URL restores the pre-look-track picture (fog, sky, grade, lights, ground detail) for matched before/after shots
export const LOOK_OFF = typeof location !== 'undefined' && /[?&]lookoff\b/.test(location.search);
export const FOG_DAY_HAZE = LOOK_OFF ? 0.0 : 0.00016;

// Shared haze color (fog chunk and sky horizon use the same function, so geometry melts into the sky):
// away from the sun the fog color is pulled toward a pale blue-gray; toward the sun a broad warm Mie lobe glows,
// even at noon. fc = scene fog color, rd = unit view ray (world), sw = unit sun dir (world), sc = sun color * intensity.
export const HAZE_GLSL = LOOK_OFF ? /* glsl */`
vec3 psHazeColor( vec3 fc, vec3 rd, vec3 sw, vec3 sc ) {
	return fc + sc * ${FOG_INSCATTER.toFixed(4)} * pow( max( dot( rd, sw ), 0.0 ), ${FOG_INSCATTER_POW.toFixed(1)} );
}
` : /* glsl */`
vec3 psHazeColor( vec3 fc, vec3 rd, vec3 sw, vec3 sc ) {
	float day = smoothstep( 0.02, 0.35, sw.y );
	float mu = max( dot( rd, sw ), 0.0 );
	float l = dot( fc, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 col = mix( fc, vec3( l ) * vec3( 0.93, 0.99, 1.08 ), 0.6 * day );
	col += sc * day * ( 0.010 + 0.030 * mu * mu + 0.05 * pow( mu, 12.0 ) );
	// Mie in-scatter toward the sun, clamped: at full strength it painted a flat white-pink veil over the far skyline
	vec3 mie = sc * ${FOG_INSCATTER.toFixed(4)} * pow( mu, ${FOG_INSCATTER_POW.toFixed(1)} );
	col += mie * ( 0.18 / max( 0.18, dot( mie, vec3( 0.333 ) ) ) );
	return col;
}
`;

let patched = false;
export function patchFogChunks() {
  if (patched) return; patched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogPosition;
#endif
`;
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogPosition = mvPosition.xyz;
#endif
`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogPosition;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif
`;
  // mark materials that have the directional light uniforms declared
  if (!C.lights_pars_begin.includes('FOG_HAS_DIRLIGHTS')) {
    C.lights_pars_begin = C.lights_pars_begin + '\n#if NUM_DIR_LIGHTS > 0\n#define FOG_HAS_DIRLIGHTS\n#endif\n#ifdef USE_FOG\n' + HAZE_GLSL + '#endif\n';
  }
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
	#ifdef FOG_EXP2
	{
		vec3 fogRayW = ( vec4( vFogPosition, 0.0 ) * viewMatrix ).xyz; // world-space camera->frag
		float fogDist = length( fogRayW );
		float fogK = ${FOG_HEIGHT_FALLOFF.toFixed(5)};
		float fogY0 = max( cameraPosition.y, 0.0 );
		float fogDY = fogRayW.y;
		float fogH = abs( fogK * fogDY ) > 1e-3 ? ( 1.0 - exp( - fogK * fogDY ) ) / ( fogK * fogDY ) : 1.0;
		float fogDen = fogDensity;
		vec3 fogCol = fogColor;
		vec3 fogExt = vec3( 1.0 );
		#ifdef FOG_HAS_DIRLIGHTS
			vec3 fogSun = normalize( ( vec4( directionalLights[ 0 ].direction, 0.0 ) * viewMatrix ).xyz );
			float fogDay = smoothstep( 0.1, 0.5, fogSun.y );
			fogDen += ${FOG_DAY_HAZE.toFixed(6)} * fogDay;
			// Miami air at 3 to 5 km is mild: cap the extinction so far buildings keep their contrast and shadow sides
			// (the environment ramp reaches 0.0007 at sunset and night: 94 % fog at 4 km, a white veil). Dense fog
			// (underwater, weather fog above 0.002) passes through unchanged.
			${LOOK_OFF ? '' : 'if ( fogDensity < 0.002 ) fogDen = min( fogDen, 0.00019 );'}
			fogCol = psHazeColor( fogColor, fogRayW / max( fogDist, 1e-4 ), fogSun, directionalLights[ 0 ].color );
			fogExt = mix( vec3( 1.0 ), vec3( ${LOOK_OFF ? '1.0, 1.0, 1.0' : '0.86, 1.0, 1.16'} ), fogDay ); // Rayleigh: blue goes first
		#endif
		float fogOpt = fogDen * fogDist * exp( - fogK * fogY0 ) * fogH;
		vec3 fogF3 = clamp( 1.0 - exp( - fogOpt * fogExt ), 0.0, 1.0 );
		float fogFactor = fogF3.g;
		gl_FragColor.rgb = gl_FragColor.rgb * ( 1.0 - fogF3 ) + fogCol * fogF3;
	}
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#endif
#endif
`;
}

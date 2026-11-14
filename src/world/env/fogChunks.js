import * as THREE from 'three';

// Global fog upgrade: exponential height fog with sun in-scattering.
// Uses FogExp2's fogDensity as a linear extinction coefficient and the first
// directional light (the sun / moon, which casts shadows so it sorts first) for in-scatter.
export const FOG_HEIGHT_FALLOFF = 0.0045;
export const FOG_INSCATTER = 0.055;
export const FOG_INSCATTER_POW = 7.0;

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
    C.lights_pars_begin = C.lights_pars_begin + '\n#if NUM_DIR_LIGHTS > 0\n#define FOG_HAS_DIRLIGHTS\n#endif\n';
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
		float fogOpt = fogDensity * fogDist * exp( - fogK * fogY0 ) * fogH;
		float fogFactor = clamp( 1.0 - exp( - fogOpt ), 0.0, 1.0 );
		vec3 fogCol = fogColor;
		#ifdef FOG_HAS_DIRLIGHTS
			float fogSd = max( dot( vFogPosition / max( length( vFogPosition ), 1e-4 ), directionalLights[ 0 ].direction ), 0.0 );
			fogCol += directionalLights[ 0 ].color * ${FOG_INSCATTER.toFixed(4)} * pow( fogSd, ${FOG_INSCATTER_POW.toFixed(1)} );
		#endif
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
	}
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#endif
#endif
`;
}

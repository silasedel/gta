// Stage 1 anti-grain: specular anti-aliasing for every MeshStandard/MeshPhysical material.
// Normal-mapped surfaces (gravel, asphalt, sand, bark, paint flakes) catch the sun in highlights smaller than a pixel.
// They sparkle as a field of bright dots ("grain"), worst at golden hour and on wet surfaces at night. three.js only
// widens the highlight for curvature of the vertex normal; this also accounts for the per-pixel variation of the
// normal-mapped normal (Kaplanyan-Hill style "geometric specular AA"):
//   roughness^2 += min(2 * variance(normal in screen space), KAPPA)
// Patched into ShaderChunk at import time (main.js imports this first, before any material compiles).
import * as THREE from 'three';

const KAPPA = 0.18;
const SIGMA = 0.5;

export const specularAA = { kappa: KAPPA, sigma: SIGMA, patched: false };
(function patch() {
  const C = THREE.ShaderChunk;
  if (C.lights_physical_fragment.includes('stage1 specular AA')) {
    specularAA.patched = true;
    return;
  }
  const find = 'material.roughness = min( material.roughness, 1.0 );';
  if (!C.lights_physical_fragment.includes(find)) {
    console.warn('[specularAA] chunk layout changed; not patched');
    return;
  }
  C.lights_physical_fragment = C.lights_physical_fragment.replace(
    find,
    `${find}
{ // stage1 specular AA: widen highlights where the shading normal varies inside a pixel
  vec3 sdx = dFdx( normal ), sdy = dFdy( normal );
  float sVar = ${SIGMA.toFixed(2)} * ( dot( sdx, sdx ) + dot( sdy, sdy ) );
  float sA2 = material.roughness * material.roughness + min( 2.0 * sVar, ${KAPPA.toFixed(2)} );
  material.roughness = min( sqrt( sA2 ), 1.0 );
}`,
  );
  specularAA.patched = true;
})();

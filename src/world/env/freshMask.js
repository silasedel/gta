// r4-water: uniforms shared by every shader that needs to know "is this inland (fresh) water" near the camera.
// waves.js fills the mask (camera-centered, 2 km, 8 m cells); the ocean passes and the terrain ground shader read it.
//   tFresh     R8: 0 = sea .. 1 = inland water; land cells carry their nearest water's value (no land/water blend at the bank)
//   uFreshRect (x0, z0, 1 / span, on)
//   uR4        1 = r4 shoreline look on (smooth soft banks, murky inland water, damp bank band); ?r4water=0 = 0
import * as THREE from 'three';

export const R4WATER = !(typeof location !== 'undefined' && /[?&]r4water=0\b/.test(location.search));
export const FRESH_U = {
  tFresh: { value: null },
  uFreshRect: { value: new THREE.Vector4(0, 0, 1, 0) },
  uR4: { value: R4WATER ? 1 : 0 },
};

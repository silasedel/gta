// r2-physics: world / vehicle physics helpers (see src/vehicles/physics/README.md)
//   game.physics.clearForCar / findCarSpot / watchParked   (clearance.js: parked-car spawns never land on fences, props, cars)
//   game.physics.colliderOverlay                           (overlay.js: wireframe of every collider, ?colliders=1 or F9)
import { installClearance } from './clearance.js';
import { installRelief } from './relief.js';
import { installRocks } from './rocks.js';

export const order = 5;

export async function initV2(game) {
  try { installRelief(game); } catch (e) { console.error('[r2-physics] relief', e); }
  try { installRocks(game); } catch (e) { console.error('[r2-physics] rocks', e); }
  try { installClearance(game); } catch (e) { console.error('[r2-physics] clearance', e); }
  try { const { installOverlay } = await import('./overlay.js'); installOverlay(game); } catch (e) { console.warn('[r2-physics] overlay', e); }
}

// r2-physics: world / vehicle physics helpers (see src/vehicles/physics/README.md)
//   game.physics.clearForCar / findCarSpot / watchParked   (clearance.js: parked-car spawns never land on fences, props, cars)
//   game.physics.propImpact / damageAt                     (impacts.js: momentum + contact damage, ?impacts=1)
//   game.physics.solidCars                                 (solidCars.js: walking into a car never moves it)
//   game.physics.colliderOverlay                           (overlay.js: wireframe of every collider, ?colliders=1 or F9)
import { installClearance } from './clearance.js';
import { installRelief } from './relief.js';
import { installRocks } from './rocks.js';
import { installTrunks } from './trunks.js';
import { installImpacts } from './impacts.js';
import { installSolidCars } from './solidCars.js';

export const order = 5;

export async function initV2(game) {
  try { installRelief(game); } catch (e) { console.error('[r2-physics] relief', e); }
  try { installTrunks(game); } catch (e) { console.error('[r2-physics] trunks', e); }
  try { installRocks(game); } catch (e) { console.error('[r2-physics] rocks', e); }
  try { installSolidCars(game); } catch (e) { console.error('[r2-physics] solid cars', e); }
  try { installImpacts(game); } catch (e) { console.error('[r2-physics] impacts', e); }
  try { installClearance(game); } catch (e) { console.error('[r2-physics] clearance', e); }
  try { const { installOverlay } = await import('./overlay.js'); installOverlay(game); } catch (e) { console.warn('[r2-physics] overlay', e); }
}

// Keeps linked car materials pointed at the current scene environment map (see model/envlink.js).
import { syncEnv } from './model/envlink.js';
export const order = 200;
export function initV2(game) {
  game.updaters?.push?.(() => { const s = game.scene; if (s) syncEnv(s.environment); });
}

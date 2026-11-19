// Z-fight detector hook (render track, Nov 18): game.zfight(opts) -> Promise of the scan result (src/render/zfightScan.js).
// The scanner module loads on first use only. Used by tools/v2/render/zfight.mjs; any agent can call it in a session
// to find coplanar surfaces in view (and the mesh / material names of both sides) before and after a fix.
export const order = 90;
export function initV2(game) {
  let scan = null;
  game.zfight = async (opts = {}) => {
    if (!scan) { const m = await import('./zfightScan.js'); scan = m.makeZFightScanner(game); }
    return scan(opts);
  };
}

// paint audit: every car (traffic + parked) seen at 4 spots over ~3 minutes -> histogram by color family
const SPOTS = [[407, -110], [600, 300], [-866.1, 4836.4], [120, 900]];
const steps = [{ eval: `(() => { window.__seenCars = new Map(); game.timeOfDay = 12; return 1; })()` }];
for (const [x, z] of SPOTS) {
  steps.push({ eval: `(() => { game.teleport(${x}, undefined, ${z}, 0); return 1; })()`, sleep: 20000 });
  for (let k = 0; k < 2; k++) steps.push({ sleep: 12000, eval: `(() => { for (const v of game.vehicles.list) { const c = v.car?.paint?.color; if (!c || !v.car.glb) continue; window.__seenCars.set(v.uid || v.id, { k: v.typeKey, hex: c.getHexString(), fin: v.look?.finish, ai: !!v.ai }); } return window.__seenCars.size; })()` });
}
steps.push({ log: 'hist', eval: `(() => {
  const T = window.THREE || game.THREE, fam = (hex) => { const c = new T.Color('#' + hex), h = {}; c.getHSL(h); const L = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    if (h.s < 0.12) return L > 0.45 ? 'white' : L > 0.2 ? 'silver' : L > 0.04 ? 'gray' : 'black';
    const d = h.h * 360; if (h.s < 0.3 || L < 0.03) return 'earth';
    if (d < 15 || d > 340) return 'red'; if (d < 45) return h.l < 0.35 ? 'earth' : 'orange'; if (d < 70) return h.l < 0.45 ? 'earth' : 'yellow';
    if (d < 165) return 'green'; if (d < 255) return 'blue'; if (d < 300) return 'purple'; return 'pink'; };
  const H = {}, F = {}; let n = 0; for (const e of window.__seenCars.values()) { const f = fam(e.hex); H[f] = (H[f] || 0) + 1; F[e.fin] = (F[e.fin] || 0) + 1; n++; }
  const pct = Object.fromEntries(Object.entries(H).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v * 100 / n).toFixed(1)]));
  return JSON.stringify({ n, pct, finish: F }); })()` });
export default steps;

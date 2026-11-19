// r10 (playtest Nov 19: "plants look terrible, use my plant-pot models"): the potted plants of the r8 house are the user's models, placed
// on purpose (corners, beside doors, on counters), never scattered on the floors.
//   palmL / palmS: the user's "Plant Pot 1 - Four Potted Palms" (Models/Plant Pots), split into a large (2.1 m) and a small (1.0 m) pot
//                  by tools/v2/keys/r10/palm_pot.py -> public/assets/models/keys/plants/palm_pot_*.glb
//   ficus:         the user's "Potted Plant 1 - Rubber Plant In Clay Pot" (already in the game as models/vegetation/potted_ficus.glb)
//   succulent:     Poly Haven potted_plant_04 (CC0, public/assets/city/models/potted_succulent), a tabletop pot
// Leaves are alpha-tested (no sorting, no flicker), cast no shadow indoors, and one collider per pot.
import { glb } from './glb.js';

const KIND = {
  palmL: { file: 'plants/palm_pot_large.glb', r: 0.32, h: 0.5 },
  palmS: { file: 'plants/palm_pot_small.glb', r: 0.17, h: 0.25 },
  ficus: { file: '../vegetation/potted_ficus.glb', r: 0.28, h: 0.45 },
  succulent: { file: '../../city/models/potted_succulent/potted_plant_04_1k.gltf', r: 0.09, h: 0.27 },
};
const leafy = (m) => { if (m.map && (m.transparent || m.alphaTest > 0 || /leaf|leaves|ficus|plant/i.test(m.name || ''))) { m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; m.side = 2; } m.roughness = Math.max(0.55, m.roughness ?? 0.6); m.metalness = 0; };

// Fr: an r4 frame (frame(ctx, 'house') / 'site'); parent: Fr.groups.int (indoors) or .ext / .detail; s: uniform scale
export function potPlant(ctx, Fr, kind, x, y, z, o = {}) {
  const K = KIND[kind]; if (!K) return null; const s = o.s ?? 1, inside = !!o.interior;
  const p = glb(ctx.kit, K.file, { parent: o.parent || (inside ? Fr.groups.int : Fr.groups.detail), pos: [x, y, z], ry: o.ry ?? 0, scale: s, interior: inside, cast: !inside && o.cast !== false, mat: (m) => { leafy(m); if (o.tint) m.color?.multiplyScalar(o.tint); } });
  if (!o.noCol) Fr.col.cyl(x, y + K.h * s / 2, z, K.r * s, K.h * s, { tag: 'pot' });
  ctx.async.push(p);
  return p;
}

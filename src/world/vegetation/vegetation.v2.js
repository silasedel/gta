// game.vegetation: build(kind, opts) -> THREE.Group (palms, shrubs, trees; every seed differs), kinds, field(kind, items, opts) for
// instanced LOD fields (near / mid / impostor with dithered cross-fades), stats(). Also drives the sun direction for leaf translucency,
// and the wind clock when no other system does (the Miami materials update drives it in the city).
import * as THREE from 'three';
import { build, buildGeometry, KINDS, KIND_TYPE } from './index.js';
import { sharedVegMaterials, vegUniforms, updateVegetation, setVegCamera } from './materials.js';
import { createCountryside, CS_ON } from './countryside.js';
import { createVegField } from './field.js';
import { PALM_SPECIES } from './palms.js';
import { inMapBuilding } from '../ground/occupancy.js';

export const order = 60;
const ALIAS = { coconut_palm: 'coconut', royal_palm: 'royal', sabal_palm: 'sabal', cabbage_palm: 'sabal', date_palm: 'date', queen_palm: 'queen', sea_grape: 'seagrape', saw_palmetto: 'sawpalmetto', live_oak: 'liveoak', slash_pine: 'slashpine', gumbo_limbo: 'gumbo', bald_cypress: 'cypress' };
const MODEL_KIND = { coconut: ['coconut', 0.5], royal: ['royal', 1] }; // kind -> [model, share of the items]
const SHRUB_H = { seagrape: 2.2, hibiscus: 1.75, croton: 1.1, bougainvillea: 2.05, ixora: 1.05, hedge: 1.25, sawpalmetto: 1.4, grass: 1.0, sawgrass: 1.9 };
export async function initV2(game) {
  // clearance: no plant inside a road (edge width + margin), on / under / over a bridge, deck or ramp footprint, on a sidewalk,
  // pier or building footprint. Used by every field() (dressing, set pieces) and the countryside streamer.
  const clearStats = { checked: 0, fieldDropped: 0, road: 0, deck: 0, surface: 0 }, _ne = {};
  const BAD_SURF = /^(asphalt|sidewalk|building|pier|wood|tile|pavers)$/;
  function clearAt(x, z, r = 1.2) {
    const C = game.city; if (!C) return true; clearStats.checked++;
    const G = C.roadGraph; if (G && G.nearestEdge) { const e = G.nearestEdge(x, z, _ne, 40); if (e && e.dist - e.edge.width / 2 < r + 1.5) { clearStats.road++; return false; } }
    const E = C.elevated; if (E && E.footprintAt) for (const [dx, dz] of [[0, 0], [r + 2, 0], [-r - 2, 0], [0, r + 2], [0, -r - 2]]) { let f = null; try { f = E.footprintAt(x + dx, z + dz); } catch (e) { /* */ } if (f) { clearStats.deck++; return false; } }
    if (C.surfaceAt) { let s = ''; try { s = C.surfaceAt(x, z); } catch (e) { /* */ } if (BAD_SURF.test(String(s))) { clearStats.surface++; return false; } }
    if (r >= 1 && !/[?&]clipfix=0/.test(location.search) && inMapBuilding(game, x, z, 0.7)) { clearStats.building = (clearStats.building || 0) + 1; return false; } // clipping sweep: no trunk through a building wall
    return true;
  }
  const fields = [];
  let t = 0, lastSeen = -1, cs = null, csFailed = false;
  game.vegetation = {
    kinds: KINDS, types: KIND_TYPE, palms: PALM_SPECIES,
    // build one plant: opts { seed, height, lod, size, length (hedges), lean, wear } -> Group at the origin (base at y=0)
    // aliases and set-piece options: radius / height (m) -> size, lean: [dx, dz] top offset in m (palms) -> lean amount + yaw
    build(kind, opts = {}) {
      const k = ALIAS[kind] || kind, o = { ...opts }, type = KIND_TYPE[k];
      if (!type) throw new Error('unknown vegetation kind ' + kind);
      if (type === 'shrub' && o.height && !o.size) o.size = Math.max(0.4, Math.min(1.8, o.height / (SHRUB_H[k] || 1.6)));
      let leanV = null; if (Array.isArray(o.lean)) { leanV = o.lean; o.lean = Math.min(0.4, Math.hypot(leanV[0], leanV[1]) / Math.max(1, o.height || 8)); }
      const p = build(k, o), g = p.group;
      if (leanV && Math.hypot(leanV[0], leanV[1]) > 0.05) { const bb = new THREE.Box3().setFromObject(g.children[g.children.length - 1]), c = bb.getCenter(new THREE.Vector3()); if (Math.hypot(c.x, c.z) > 0.05) { const w = new THREE.Group(); g.rotation.y = Math.atan2(c.x, c.z) - Math.atan2(leanV[0], leanV[1]); w.add(g); w.userData.tris = p.tris; w.userData.height = p.height; return w; } }
      g.userData.tris = p.tris; g.userData.height = p.height; return g;
    },
    buildGeometry,
    materials: sharedVegMaterials(),
    // instanced field with LODs: items [{x,y,z,ry,s}] in world space; added to game.scene unless opts.parent is given
    field(kind, items, opts = {}) {
      // greenery: library-model palms (models.js) take a share of every coconut field and all royal palm fields
      const k0 = ALIAS[kind] || kind, mk = !opts.model && !opts.noModel && MODEL_KIND[k0], md = mk && game.city?.flora?.models?.[mk[0]];
      if (md) {
        const A = [], B = []; for (const it of items) { const h = Math.abs(Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5453) % 1; (h < mk[1] ? A : B).push(it); }
        const subs = [A.length ? game.vegetation.field(kind, A, { ...opts, model: md }) : null, B.length ? game.vegetation.field(kind, B, { ...opts, noModel: true }) : null].filter(Boolean);
        return { group: subs[0]?.group || new THREE.Group(), subs, update(c, f) { for (const x of subs) x.update(c, f); }, stats() { return subs.map((x) => x.stats()); }, remove() { for (const x of subs) x.remove(); }, dispose() { for (const x of subs) x.remove(); } };
      }
      if (!opts.noClear) { const n0 = items.length; items = items.filter((it) => clearAt(it.x, it.z, KIND_TYPE[ALIAS[kind] || kind] === 'shrub' ? 0.6 : 1.2)); clearStats.fieldDropped += n0 - items.length; }
      const f = createVegField(game.renderer, kind, items, opts); (opts.parent || game.scene).add(f.group); fields.push(f);
      f.remove = () => { const i = fields.indexOf(f); if (i >= 0) fields.splice(i, 1); f.group.removeFromParent(); f.dispose(); };
      if (game.camera) f.update(game.camera, true);
      return f;
    },
    stats() { return fields.map((f) => f.stats()); },
    clearAt, clearStats,
  };
  game.updaters.push((dt) => {
    try {
      t += dt || 0;
      const cur = vegUniforms.uVegTime.value;
      if (game.vegetation.freezeWind) { /* test hook: hold the wind clock (dolly pop test) */ } else if (cur === lastSeen) updateVegetation(t, game.scene, null, game.wind); // nobody else advanced the wind clock this frame
      else updateVegetation(cur, game.scene, null, game.wind), vegUniforms.uVegTime.value = cur;
      lastSeen = vegUniforms.uVegTime.value;
      if (game.camera) { setVegCamera(game.camera); for (const f of fields) f.update(game.camera); }
      // countryside streamer (synthetic land): created once the city terrain exists; ?veg2=0 keeps the old per-tile flora
      const C = game.city;
      if (CS_ON && !cs && !csFailed && C && C.terrain && C.flora && C.flora.countryside && game.camera) {
        try { const D = C.roadGraph, nd = {}; const MD = game.miamiData, TS = C.streamer?.tileSize || 200; // junction mouths (curb returns reach past the leg edges) count as road too
          const roadDist = D && D.nearestEdge ? (x, z) => { const r = D.nearestEdge(x, z, nd, 40); let g = r ? r.dist - r.edge.width / 2 : 99; if (g < 14 && MD?.getTile) { const t = MD.getTile(Math.floor(x / TS), Math.floor(z / TS)); for (const n of t?.nodes || []) if (n.degree >= 3 && n.width) g = Math.min(g, Math.hypot(n.x - x, n.z - z) - n.width / 2 - 2); } return g; } : null;
          cs = createCountryside({ renderer: game.renderer, scene: game.scene, models: C.flora.models || {}, terrain: C.terrain, data: { isWater: (x, z) => C.isWater(x, z), zoneAt: C.zoneAt, getTile: game.miamiData?.getTile ? (i, j) => game.miamiData.getTile(i, j) : null }, roadDist, deckAt: C.elevated && C.elevated.footprintAt ? (x, z) => { try { return !!C.elevated.footprintAt(x, z); } catch (e) { return false; } } : null });
          game.vegetation.countryside = cs; C.flora.cs = cs; } catch (e) { csFailed = true; console.warn('[vegetation] countryside unavailable', e); }
      }
      if (cs && game.camera) cs.update(game.camera);
    } catch (e) { /* never take the frame down */ }
  });
  game.emit?.('vegetation:ready', { kinds: KINDS });
}

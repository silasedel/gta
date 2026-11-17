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
import { VEG_LIB, GROUPS, groupOf } from './species.js';
import { loadVegModels } from './models.js';
const PROXY = { palm: 'coconut', tree: 'liveoak', shrub: 'hibiscus' }; // LOD distance class of a library model in createVegField
// older kind names used by set pieces / dressing -> species group
const ALIAS_G = { coconut: 'coconut', royal: 'royal', sabal: 'sabal', date: 'date', queen: 'queen', seagrape: 'seagrape', liveoak: 'liveoak', slashpine: 'pine', gumbo: 'gumbo', cypress: null, hedge: 'hedge', croton: 'hibiscus', ixora: 'flowers', grass: 'grass_tuft', sawpalmetto: null, sawgrass: null };

export const order = 60;
const ALIAS = { coconut_palm: 'coconut', royal_palm: 'royal', sabal_palm: 'sabal', cabbage_palm: 'sabal', date_palm: 'date', queen_palm: 'queen', sea_grape: 'seagrape', saw_palmetto: 'sawpalmetto', live_oak: 'liveoak', slash_pine: 'slashpine', gumbo_limbo: 'gumbo', bald_cypress: 'cypress' };
const SHRUB_H = { seagrape: 2.2, hibiscus: 1.75, croton: 1.1, bougainvillea: 2.05, ixora: 1.05, hedge: 1.25, sawpalmetto: 1.4, grass: 1.0, sawgrass: 1.9 };
export async function initV2(game) {
  // clearance: no plant inside a road (edge width + margin), on / under / over a bridge, deck or ramp footprint, on a sidewalk,
  // pier or building footprint. Used by every field() (dressing, set pieces) and the countryside streamer.
  const clearStats = { checked: 0, fieldDropped: 0, road: 0, deck: 0, surface: 0 }, _ne = {};
  const BAD_SURF = /^(asphalt|sidewalk|building|pier|wood|tile|pavers)$/;
  function clearAt(x, z, r = 1.2, wetOk = false) {
    const C = game.city; if (!C) return true; clearStats.checked++;
    if (blockedAt(x, z, r)) { clearStats.blocked = (clearStats.blocked || 0) + 1; return false; }
    if (solidAt(x, z)) { clearStats.solid = (clearStats.solid || 0) + 1; return false; }
    const G = C.roadGraph; if (G && G.nearestEdge) { const e = G.nearestEdge(x, z, _ne, 40); if (e && e.dist - e.edge.width / 2 < r + 1.5) { clearStats.road++; return false; } }
    const E = C.elevated; if (E && E.footprintAt) for (const [dx, dz] of [[0, 0], [r + 2, 0], [-r - 2, 0], [0, r + 2], [0, -r - 2]]) { let f = null; try { f = E.footprintAt(x + dx, z + dz); } catch (e) { /* */ } if (f) { clearStats.deck++; return false; } }
    if (C.surfaceAt) { let s = ''; try { s = C.surfaceAt(x, z); } catch (e) { /* */ } if (BAD_SURF.test(String(s))) { clearStats.surface++; return false; } }
    if (r >= 1 && !/[?&]clipfix=0/.test(location.search) && inMapBuilding(game, x, z, 0.7)) { clearStats.building = (clearStats.building || 0) + 1; return false; } // clipping sweep: no trunk through a building wall
    return true;
  }
  const fields = [], blocks = [], placed = new Map(), placedDirty = new Set();
  // a static collider standing above the ground here (dock, deck, pier, boardwalk, building)? Trunk colliders (cylinders) do not count.
  let _ray = null;
  function solidAt(x, z, gy = null) {
    const W = game.world, R = game.RAPIER, C = game.city; if (!W || !R) return false;
    const g = gy ?? (C?.terrain?.heightAt ? C.terrain.heightAt(x, z) : C?.groundHeightAt ? C.groundHeightAt(x, z) : 0);
    _ray ||= new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }); _ray.origin = { x, y: g + 6, z };
    let hit = null; try { hit = W.castRay(_ray, 6.0, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC | R.QueryFilterFlags.EXCLUDE_SENSORS); } catch (e) { return false; }
    if (!hit) return false; const col = hit.collider, sh = col?.shape?.type; if (sh === R.ShapeType.Cylinder || sh === R.ShapeType.Capsule || sh === R.ShapeType.Ball) return false;
    const base = C?.isWater?.(x, z) ? Math.max(g, C.seaLevel ?? -0.12) : g; // a water plane collider (if any) is not a dock
    const hy = g + 6 - (hit.timeOfImpact ?? hit.toi ?? 6);
    return hy > base + 0.3 && hy < base + 2.6; // docks, decks, piers, boardwalks; not the tall prisms the tiles build around tree / palm trunks (a tree must not block itself)
  }
  const nearCam = (x, z, d) => { const c = game.camera?.position; return !c || (c.x - x) ** 2 + (c.z - z) ** 2 < d * d; };
  function blockedAt(x, z, r = 0) { for (const b of blocks) { if (!b) continue; if (b.r !== undefined ? (b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + r) ** 2 : x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true; } return false; }
  // ground under a plant: lowest of 5 samples over the footprint (no base hanging over a slope or bank); the base sinks a little
  // (root flare / mud); mangroves on a water cell stand on the shallow seabed with their roots in the water
  function grounded(it, md, grp) {
    const C = game.city, T = C?.terrain, gh = (x, z) => { let h = T?.heightAt ? T.heightAt(x, z) : C?.groundHeightAt ? C.groundHeightAt(x, z) : 0; return Number.isFinite(h) ? h : 0; };
    const s = it.s ?? 1, r = Math.min(1.2, (md.def.r || (md.cls === 'shrub' ? 0.25 : 0.4)) * s + 0.15);
    let g = gh(it.x, it.z); for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) g = Math.min(g, gh(it.x + dx, it.z + dz));
    if (it.y !== undefined && it.y !== null && Math.abs(it.y - g) > 0.6 && grp !== 'mangrove') return it; // deliberate height (planter, deck, roof garden)
    const sink = (grp === 'mangrove' ? 0.3 : md.cls === 'palm' ? 0.1 : md.cls === 'tree' ? 0.16 : 0.05) * s;
    let y = g - sink; if (grp === 'mangrove' && C?.isWater?.(it.x, it.z)) y = Math.min(y, (C.seaLevel ?? -0.12) - 0.3);
    return { ...it, y };
  }
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
      // vegetation track: every kind with a library-model group (species.js GROUPS) draws the user's models, split per item over
      // the group's models; items are grounded (lowest ground under the footprint, base sunk a little, mangroves into the mud)
      const grp = !opts.model && !opts.noModel && groupOf(ALIAS_G[kind] || kind), lib = game.city?.flora?.models || {};
      const keys = grp ? GROUPS[grp].filter((k) => lib[k]) : [];
      if (keys.length) {
        if (!opts.noClear) { const n0 = items.length, r = lib[keys[0]].cls === 'shrub' ? 0.6 : 1.2; items = items.filter((it) => clearAt(it.x, it.z, r, grp === 'mangrove')); clearStats.fieldDropped += n0 - items.length; }
        const per = keys.map(() => []);
        for (const it of items) { const h = Math.abs(Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5453) % 1, k = it.model && keys.includes(it.model) ? keys.indexOf(it.model) : Math.floor(h * keys.length) % keys.length;
          const it2 = opts.keepScale ? it : { ...it, s: (it.s ?? 1) * (0.88 + ((h * 7.31) % 1) * 0.24) }; per[k].push(opts.keepY ? it2 : grounded(it2, lib[keys[k]], grp)); }
        const subs = []; per.forEach((sub, k) => { if (sub.length) subs.push(game.vegetation.field(PROXY[lib[keys[k]].cls] || kind, sub, { ...opts, model: lib[keys[k]], noClear: true })); });
        return { group: subs[0]?.group || new THREE.Group(), subs, update(c, f) { for (const x of subs) x.update(c, f); }, stats() { return subs.map((x) => x.stats()); }, remove() { for (const x of subs) x.remove(); }, dispose() { for (const x of subs) x.remove(); } };
      }
      if (!opts.noClear) { const n0 = items.length; items = items.filter((it) => clearAt(it.x, it.z, KIND_TYPE[ALIAS[kind] || kind] === 'shrub' ? 0.6 : 1.2)); clearStats.fieldDropped += n0 - items.length; }
      if (!opts.model && !KIND_TYPE[ALIAS[kind] || kind]) { console.warn('[vegetation] unknown kind', kind); return { group: new THREE.Group(), update() {}, stats() { return {}; }, remove() {}, dispose() {} }; }
      const f = createVegField(game.renderer, opts.model ? kind : (ALIAS[kind] || kind), items, opts); (opts.parent || game.scene).add(f.group); fields.push(f);
      f.remove = () => { const i = fields.indexOf(f); if (i >= 0) fields.splice(i, 1); f.group.removeFromParent(); f.dispose(); };
      if (game.camera) f.update(game.camera, true);
      return f;
    },
    // hand placement (set pieces, Nico's lot): place(kind, x, z, { ry, s, y, model, keepY }) -> { remove() }. kind: a species group
    // (royal, coconut, coconut_bent, sabal, queen, banyan, liveoak, shade, poinciana, mangrove, pine, hedge, bougainvillea, hibiscus,
    // oleander, flowers, fern, agave, red_grass, tropical_bed, potted, grass_tuft ...) or a model key (species.js VEG_LIB).
    // Placements are batched: one instanced field per model, rebuilt on the next frame after a change.
    place(kind, x, z, o = {}) {
      const lib = game.city?.flora?.models || {}, direct = VEG_LIB[kind] ? kind : null, grp = direct ? null : groupOf(ALIAS_G[kind] || kind);
      const keys = direct ? [direct] : grp ? GROUPS[grp] : []; if (!keys.length) throw new Error('unknown vegetation kind ' + kind);
      const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1, key = o.model || keys[Math.floor(h * keys.length) % keys.length];
      if (!o.keepY && !o.onRoad) { const e = game.city?.roadGraph?.nearestEdge?.(x, z, {}, 20); if (e && e.dist < e.edge.width / 2 + 0.2) { (game.vegetation.placeSkipped ||= []).push([kind, +x.toFixed(1), +z.toFixed(1)]); return { key, item: null, skipped: 'road', remove() {} }; } } // never in a road lane (onRoad: true to force)
      const it = { x, z, y: o.y, ry: o.ry ?? h * 6.2832, s: o.s ?? 0.88 + ((h * 7.31) % 1) * 0.24, keepY: o.keepY };
      (placed.get(key) || placed.set(key, { items: [], field: null, grp: grp || direct }).get(key)).items.push(it); placedDirty.add(key);
      if (!lib[key]) loadVegModels(game.renderer, [key]).then((m) => { if (game.city?.flora?.models && m[key]) game.city.flora.models[key] = m[key]; placedDirty.add(key); });
      return { key, item: it, remove() { const P = placed.get(key); if (!P) return; const i = P.items.indexOf(it); if (i >= 0) { P.items.splice(i, 1); placedDirty.add(key); } } };
    },
    // no plant may grow here (docks, piers, decks, set-piece pads): block(x, z, r) or block({ x0, z0, x1, z1 }); returns an id for unblock(id)
    block(x, z, r = 2) { const b = typeof x === 'object' ? { ...x } : { x, z, r }; blocks.push(b); cs?.rejectArea?.(b); return blocks.length - 1; },
    unblock(id) { blocks[id] = null; },
    blockedAt, solidAt,
    // placement audit around (x, z): countryside trees whose base floats above the ground under their footprint, stand on a road,
    // in a building / on a dock (static collider above the ground), or crowd another trunk (< 1.2 m). -> counts + examples
    audit(x, z, r = 200) {
      const C = game.city, cs = this.countryside, T = C?.terrain, out = { trees: 0, floating: 0, onRoad: 0, solid: 0, crowded: 0, ex: [] }; if (!cs || !T) return out;
      const list = cs.treesNear(x, z, r), G = C.roadGraph, ne = {};
      for (const t of list) { out.trees++; const g = Math.min(T.heightAt(t.x, t.z), T.heightAt(t.x + 0.5, t.z), T.heightAt(t.x - 0.5, t.z), T.heightAt(t.x, t.z + 0.5), T.heightAt(t.x, t.z - 0.5));
        if (t.y > g + 0.03) { out.floating++; if (out.ex.length < 12) out.ex.push(['float', t.kind, +t.x.toFixed(1), +t.z.toFixed(1), +(t.y - g).toFixed(2)]); }
        const e = G?.nearestEdge?.(t.x, t.z, ne, 20); if (e && e.dist < e.edge.width / 2 + 0.3) { out.onRoad++; if (out.ex.length < 12) out.ex.push(['road', t.kind, +t.x.toFixed(1), +t.z.toFixed(1)]); }
        if (solidAt(t.x, t.z)) { out.solid++; if (out.ex.length < 12) out.ex.push(['solid', t.kind, +t.x.toFixed(1), +t.z.toFixed(1)]); } }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if ((list[i].x - list[j].x) ** 2 + (list[i].z - list[j].z) ** 2 < 1.44) out.crowded++;
      return out;
    },
    groups: GROUPS, library: VEG_LIB,
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
      if (placedDirty.size && game.city?.flora?.models) for (const key of [...placedDirty]) { // hand-placed plants: rebuild that model's field
        const P = placed.get(key), md = game.city.flora.models[key]; if (!P || !md) continue; placedDirty.delete(key);
        if (P.field) P.field.remove(); P.field = P.items.length ? game.vegetation.field(PROXY[md.cls] || 'liveoak', P.items.map((it) => it.keepY && it.y !== undefined ? it : grounded(it, md, P.grp)), { model: md, noClear: true }) : null; }
      if (game.camera) { setVegCamera(game.camera); for (const f of fields) f.update(game.camera); }
      // countryside streamer (synthetic land): created once the city terrain exists; ?veg2=0 keeps the old per-tile flora
      const C = game.city;
      if (CS_ON && !cs && !csFailed && C && C.terrain && C.flora && C.flora.countryside && game.camera) {
        try { const D = C.roadGraph, nd = {}; const MD = game.miamiData, TS = C.streamer?.tileSize || 200; // junction mouths (curb returns reach past the leg edges) count as road too
          const roadDist = D && D.nearestEdge ? (x, z) => { const r = D.nearestEdge(x, z, nd, 40); let g = r ? r.dist - r.edge.width / 2 : 99; if (g < 14 && MD?.getTile) { const t = MD.getTile(Math.floor(x / TS), Math.floor(z / TS)); for (const n of t?.nodes || []) if (n.degree >= 3 && n.width) g = Math.min(g, Math.hypot(n.x - x, n.z - z) - n.width / 2 - 2); } return g; } : null;
          cs = createCountryside({ renderer: game.renderer, scene: game.scene, models: C.flora.models || {}, blocked: (x, z, r) => blockedAt(x, z, r) || (nearCam(x, z, 260) && solidAt(x, z)), areas: (x, z, r) => blocks.length > 0 && blockedAt(x, z, r), solidRev: () => game.world?.colliders?.len?.() ?? 0, terrain: C.terrain, data: { isWater: (x, z) => C.isWater(x, z), zoneAt: C.zoneAt, getTile: game.miamiData?.getTile ? (i, j) => game.miamiData.getTile(i, j) : null }, roadDist, deckAt: C.elevated && C.elevated.footprintAt ? (x, z) => { try { return !!C.elevated.footprintAt(x, z); } catch (e) { return false; } } : null });
          game.vegetation.countryside = cs; C.flora.cs = cs; } catch (e) { csFailed = true; console.warn('[vegetation] countryside unavailable', e); }
      }
      if (cs && game.camera) cs.update(game.camera);
    } catch (e) { /* never take the frame down */ }
  });
  game.emit?.('vegetation:ready', { kinds: KINDS });
}

// game.interiors: the V2 interiors engine for every lot whose kind has a registered store type, plus the v1 system (./legacy) for
// the kinds that have none yet. Store types self-register on import (types/*.js). See README.md.
import { createEngine } from './engine.js';
import { createInteraction } from './interact.js';
import { createLotFitter } from './legacy/fitlots.js';
import { createVenuePeople } from './venuePeople.js';
import { updateShopRoomHide } from '../shops/roomGlass.js';
export { registerStoreType, getStoreType, storeTypes } from './registry.js';

const typeMods = import.meta.glob('./types/*.js', { eager: true }); void typeMods;

export async function createInteriors(game, opts = {}) {
  let v2 = null, legacy = null;
  try { game.__lotFitter = game.__lotFitter || createLotFitter(game.city?.mapLayers?.buildingPolys); v2 = createEngine(game, { fitter: game.__lotFitter, ...opts }); game.interiorsV2 = v2; v2.hooks.interact = createInteraction(game, v2); v2.hooks.people = v2.hooks.people || createVenuePeople(game); } catch (e) { console.error('[interiors] V2 engine failed to start', e); v2 = null; game.interiorsV2 = null; }
  if (!opts.noLegacy) { try { const m = await import('./legacy/manager.js'); legacy = await m.createInteriors(game); } catch (e) { console.error('[interiors] legacy interiors failed', e); } }
  const api = {
    v2, legacy, get list() { return [...(v2?.list || []), ...(legacy?.list || [])]; }, get current() { return v2?.current || legacy?.current || null; }, legacyCurrent: () => legacy?.current || null,
    update(dt) { if (v2) v2.update(dt); if (legacy) legacy.update(dt); try { updateShopRoomHide([v2?.list, legacy?.list]); } catch (e) { /* */ } }, // shops pass: painted shop rooms step aside for shown interiors
    stats(reset) { return { ...(legacy?.stats?.(reset) || {}), v2: v2?.stats(reset) || null }; }, get fitStats() { return legacy?.fitStats || null; },
    // dev check: clerk-vs-furniture overlaps and narrow clerk lanes, over every v1 shop type x layout x room size and every built interior (0 / 0 expected)
    auditClerks() { const a = v2?.auditClerks?.() || { built: [], overlaps: 0, narrow: 0 }, l = legacy?.auditClerks?.() || { built: [], overlaps: 0, narrow: 0, layouts: null }; return { overlaps: a.overlaps + l.overlaps, narrow: a.narrow + l.narrow, layouts: l.layouts, v2: a.built, v1: l.built }; },
    registerStoreType: (d) => v2?.registerStoreType(d), saveState: () => v2?.saveState(), loadState: (o) => v2?.loadState(o),
  };
  return api;
}

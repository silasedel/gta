// V2 module: exposes the hero cars on `game` and registers them with vehicles-core if vehicles.js has not already done so
// (vehicles.js imports ./hero/index.js itself and registers `models`; this is the fallback and the public handle).
export const order = 120;
export async function initV2(game) {
  try {
    const m = await import('./index.js');
    game.heroCars = { catalog: m.heroCatalog, keys: m.models.map((x) => x.entry.key), build: m.buildHeroCar };
    const v = game.vehicles;
    if (v?.registerModel) for (const it of m.models) if (!v.models?.[it.entry.key]?.hero) v.registerModel(it.entry, it.builder);
  } catch (e) { console.error('[hero-cars] init failed', e); }
}

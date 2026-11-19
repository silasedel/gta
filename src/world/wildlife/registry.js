// Loads every species / prop module under species/ and reef/ (files starting with "_" are helpers).
// A module that fails to load is reported and skipped; it never takes the others down.
const mods = import.meta.glob(['./species/**/*.js', './reef/**/*.js', '!./**/_*.js']);
export const registry = { defs: new Map(), failed: [], loaded: false };
export async function loadSpecies() {
  if (registry.loaded) return registry;
  await Promise.all(
    Object.keys(mods).map(async (k) => {
      try {
        const m = await mods[k]();
        const list = Array.isArray(m.default) ? m.default : m.default ? [m.default] : [];
        for (const d of list)
          if (d && d.id) {
            d.file = k;
            registry.defs.set(d.id, d);
          }
      } catch (e) {
        registry.failed.push(k + ': ' + (e?.message || e));
        console.warn('[wildlife] species module failed', k, e);
      }
    }),
  );
  registry.loaded = true;
  return registry;
}

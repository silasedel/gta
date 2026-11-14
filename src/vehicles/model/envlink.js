// Car materials keep their own reflection strength.
// three.js (r163+) replaces material.envMapIntensity with scene.environmentIntensity whenever a material
// has no envMap of its own and falls back to scene.environment. The day look lowers that scene value for
// neutral shade, which flattened car paint and glass (authored 1.2-2.6, rendered ~0.4). Linked materials
// get scene.environment as their own envMap, so their envMapIntensity is used again.
export const ENV_MATS = new Set();
let _env = null;
export function linkEnv(m) {
  if (!m || ENV_MATS.has(m)) return m;
  ENV_MATS.add(m);
  m.addEventListener?.('dispose', () => ENV_MATS.delete(m));
  if (_env) m.envMap = _env;
  return m;
}
export function syncEnv(tex) {
  if (tex === _env) return;
  _env = tex || null;
  for (const m of ENV_MATS) { m.envMap = _env; m.needsUpdate = true; }
}

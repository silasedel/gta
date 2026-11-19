// r7 hitch profiler: time the interior work that can land inside one frame (texture draws, atlas cells, build steps, uploads,
// bake apply, probe faces, people spawns). Off unless globalThis.__intProf.on = true; entries over 2 ms are kept (label, ms).
export const PROF = (globalThis.__intProf ||= { on: false, list: [] });
export function prof(label, fn) { if (!PROF.on) return fn(); const t = performance.now(); try { return fn(); } finally { const d = performance.now() - t; if (d > 2) PROF.list.push([label, Math.round(d * 10) / 10, Math.round(t)]); } }
export function note(label, d) { if (PROF.on && d > 2) PROF.list.push([label, Math.round(d * 10) / 10, Math.round(performance.now())]); }

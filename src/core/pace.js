// Boot pacing (stage 1 perf): keep every main-thread task short while the game loads, so Chrome never shows
// "Page unresponsive" and the loading bar keeps moving. Long synchronous steps call `await breathe()` between units of
// work: it yields to the browser (a frame can paint) only once ~budget ms have passed since the last yield, so fast
// loops pay nothing. Same work, same results, just split into tasks.
//   breathe(budgetMs = 12)            yield if the current task has run longer than budgetMs
//   yieldTask()                       always yield (scheduler.yield when available: the continuation runs first)
//   initTexturesSliced(renderer, tex) decode images off-thread (img.decode) and upload one texture per slice
//   compileSliced(renderer, THREE, objs, camera, scene)  compile the shaders of each object in its own slice, then wait (polling,
//                                     never blocking) until the GPU finished them (KHR_parallel_shader_compile)
let last = performance.now();
// heartbeat: a cheap timer that only runs between tasks, so `beat` is about when the current task started (other code's
// own awaits count as yields too). Runs until the game is ready.
let beat = performance.now();
(function hb() { beat = performance.now(); if (typeof window === 'undefined' || !(window.game && window.game.ready)) setTimeout(hb, 4); })();
const since = () => performance.now() - Math.max(last, beat);

export async function yieldTask() {
  if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
  else await new Promise((r) => setTimeout(r, 0));
  last = performance.now();
}

// slices that ran much longer than the budget are recorded (where they ended) for tools/v2/s1-boot.mjs
function noteLong() {
  const ms = since();
  if (ms < 150 || typeof window === 'undefined') return;
  const B = (window.__boot ||= { stages: [] }); const L = (B.slices ||= []);
  if (L.length < 60) L.push([Math.round(ms), (new Error().stack || '').split('\n').slice(3, 6).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?[^:)]*/, '')).join(' < ')]);
}
export async function breathe(budgetMs = 12) {
  if (since() < budgetMs) return;
  noteLong();
  await yieldTask();
}

export function markTask() { last = performance.now(); }

const decoded = new WeakSet();
export async function initTexturesSliced(renderer, textures, budgetMs = 12) {
  for (const t of textures) {
    if (!t || !t.isTexture) continue;
    const img = t.image;
    // decode the image off the main thread first; the upload then does not decode synchronously
    if (img && typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement && img.decode && !decoded.has(img)) {
      decoded.add(img);
      try { await img.decode(); } catch (e) { /* not decodable: upload decodes it as before */ }
    }
    try { renderer.initTexture(t); } catch (e) { /* older three */ }
    await breathe(budgetMs);
  }
}

// wait until every program the renderer has created is linked, polling a few per slice (never a blocking query on a
// program that is still compiling). Gives up after maxMs (the first draw then waits as it did before).
// r2-web: counters for the loading bar (src/core/loadProgress.js): compile units submitted / done, programs linked / created
export const compileProgress = { units: 0, unitsDone: 0, programs: 0, linked: 0 };
export async function programsReady(renderer, maxMs = 20000) {
  const t0 = performance.now();
  const gl = renderer.getContext();
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  if (!ext) return;
  let i = 0;
  while (performance.now() - t0 < maxMs) {
    const progs = renderer.info.programs || [];
    const ts = performance.now();
    while (i < progs.length && performance.now() - ts < 6) {
      if (!progs[i].isReady || progs[i].isReady()) i++; else break;
    }
    compileProgress.programs = progs.length; compileProgress.linked = i;
    if (i >= progs.length) return;
    await new Promise((r) => setTimeout(r, 16));
    last = performance.now();
  }
}

// The game draws the scene into the post composer's HDR target, and three.js bakes the output color space and tone
// mapping of the current target into every program: compiling with no target set (the canvas) built a second, unused
// variant of every shader. Compile against a small HDR target instead (the variant the game actually draws with).
let compileRT = null;
export function compileTarget(THREE) {
  if (!compileRT) compileRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  return compileRT;
}
// The scene's onBeforeRender hooks fix the light set before every render (src/render/perfGuards.v2.js keeps exactly
// 16 point + 4 spot lights, baked into every program): run them around the compile too, or the compile builds programs
// for a different light count than the frame will use.
export function compileForGame(renderer, THREE, obj, camera, scene) {
  const prev = renderer.getRenderTarget(), rt = compileTarget(THREE);
  renderer.setRenderTarget(rt);
  const hooks = scene && scene.isScene;
  try {
    if (hooks) scene.onBeforeRender(renderer, scene, camera, rt);
    return renderer.compile(obj, camera, scene);
  } finally {
    if (hooks) scene.onAfterRender(renderer, scene, camera, rt);
    renderer.setRenderTarget(prev);
  }
}
// split big subtrees (the city root holds hundreds of meshes) into compile units of at most ~UNIT material users
const UNIT = 40;
function countMats(o) { let n = 0; o.traverse((c) => { if (c.material) n++; }); return n; }
function units(o, out) {
  if (!o.children.length || countMats(o) <= UNIT) { out.push(o); return; }
  if (o.material) out.push({ __self: o });
  for (const c of o.children) units(c, out);
}
export async function compileSliced(renderer, THREE, objects, camera, scene, budgetMs = 12) {
  const list = [];
  for (const o of objects) if (o) units(o, list);
  compileProgress.units = list.length; compileProgress.unitsDone = 0;
  for (const u of list) {
    try {
      if (u.__self) { // a node with its own material and many children: compile just that node
        const o = u.__self, kids = o.children; o.children = [];
        try { compileForGame(renderer, THREE, o, camera, scene); } finally { o.children = kids; }
      } else compileForGame(renderer, THREE, u, camera, scene);
    } catch (e) { console.warn('[pace] compile', e); }
    compileProgress.unitsDone++;
    await breathe(budgetMs);
  }
  await programsReady(renderer);
}

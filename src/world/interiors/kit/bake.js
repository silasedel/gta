// Bake scheduler: one shared module Worker (falls back to main-thread slices if workers are unavailable).
import { bakeGen } from './bakeCore.js';

let worker = null,
  workerDead = false,
  nextId = 1;
const waiting = new Map();
function getWorker() {
  if (worker || workerDead) return worker;
  try {
    worker = new Worker(new URL('./bakeWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error) w.reject(new Error(e.data.error));
      else w.resolve([e.data.bk0, e.data.bk1, e.data.bk2]);
    };
    worker.onerror = (e) => {
      console.warn('[interiors] bake worker failed, baking on the main thread', e.message || e);
      workerDead = true;
      worker = null;
      for (const w of waiting.values()) w.reject(new Error('worker'));
      waiting.clear();
    };
  } catch (e) {
    workerDead = true;
    worker = null;
  }
  return worker;
}
const slices = []; // main-thread fallback jobs, advanced by pumpBakes()
// -> Promise<[bk0, bk1, bk2]>
export function bake(input, { forceMain = false } = {}) {
  const w = forceMain ? null : getWorker();
  if (w)
    return new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      w.postMessage({ id, input });
    }).catch(() => bake(input, { forceMain: true }));
  return new Promise((resolve) => {
    slices.push({ it: bakeGen(input, 1500), resolve });
  });
}
// call once per frame: gives main-thread bakes up to `ms` milliseconds
export function pumpBakes(ms = 3) {
  if (!slices.length) return;
  const t = performance.now();
  while (slices.length && performance.now() - t < ms) {
    const j = slices[0],
      r = j.it.next();
    if (r.done) {
      slices.shift();
      j.resolve(r.value);
    }
  }
}
export const bakesPending = () => waiting.size + slices.length;

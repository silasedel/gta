// Bake worker: runs bakeCore off the main thread. Message in: { id, input }. Message out: { id, bk0, bk1, bk2 } (transferred).
import { bakeSync } from './bakeCore.js';
self.onmessage = (e) => {
  const { id, input } = e.data;
  try { const out = bakeSync(input); self.postMessage({ id, bk0: out[0], bk1: out[1], bk2: out[2] }, [out[0].buffer, out[1].buffer, out[2].buffer]); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};

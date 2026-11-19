// r7: draws interior surface textures off the main thread (see surfaceTextures in surfaces.js). Same drawing code, OffscreenCanvas.
import { drawSurface } from './surfaces.js';
import './venueSurfaces.js';
self.onmessage = async (e) => {
  const { id, name, o } = e.data;
  try {
    const d = drawSurface(name, o);
    const bm = await Promise.all(
      [d.A, d.N, d.G].map((c) => createImageBitmap(c, { imageOrientation: 'flipY' })),
    );
    self.postMessage({ id, bm }, bm);
  } catch (err) {
    self.postMessage({ id, err: String(err?.message || err) });
  }
};

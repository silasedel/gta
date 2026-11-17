// r2-look: render the current view as albedo (LOOK_V.w = 1 debug branch in look3.js) into a float target and read it
// back: screen-coverage histogram of base-color luminance (linear) + mean. window.__albedoView(scale) -> stats;
// window.__albedoShot(): draws the albedo view to the canvas for one frame (for screenshots).
window.__LOOK_V = game.lookV;
window.__albedoView = async (scale = 0.25) => {
  const T = game.THREE, r = game.renderer, cam = game.camera, LV = window.__LOOK_V;
  const w = Math.floor(r.domElement.width * scale), h = Math.floor(r.domElement.height * scale);
  const rt = new T.WebGLRenderTarget(w, h, { type: T.UnsignedByteType }); rt.texture.colorSpace = T.NoColorSpace;
  LV[3] = 1; // render targets get no tone mapping; fog stays (short range: negligible)
  try { r.setRenderTarget(rt); r.render(game.scene, cam); } finally { r.setRenderTarget(null); LV[3] = 0; }
  const px8 = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px8); rt.dispose(); const px = Float32Array.from(px8, (v) => v / 255);
  const bins = new Array(12).fill(0); let n = 0, sum = 0, over80 = 0, over90 = 0; const sky = 0;
  for (let i = 0; i < w * h; i++) {
    const R = px[i * 4], G = px[i * 4 + 1], B = px[i * 4 + 2];
    const L = 0.2126 * R + 0.7152 * G + 0.0722 * B; if (!(L >= 0)) continue;
    n++; sum += L; bins[Math.min(11, Math.floor(L * 10))]++; if (L > 0.8) over80++; if (L > 0.9) over90++;
  }
  return { mean: +(sum / n).toFixed(3), pctOver80: +(100 * over80 / n).toFixed(1), pctOver90: +(100 * over90 / n).toFixed(1), hist: bins.map((b) => +(100 * b / n).toFixed(1)), sky };
};

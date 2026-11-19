// Ground texture arrays for the terrain shader (built offline by tools/v2/ground/prep_ground.py from the user's ground scans,
// see public/assets/textures/ground/SOURCES.txt). Two sampler2DArray textures, one layer per surface:
//   col  2048 RGBA8 sRGB   rgb = de-lit, luminance-normalized albedo, a = height (height-based blending)
//   nrm  1024 RGBA8 linear rg = OpenGL normal xy, b = ambient occlusion, a = roughness
// Full mip chains, max anisotropy. ~250 MB of GPU memory for the 9 layers at 2K / 1K (ground pass, looks first; was ~60 MB at 1K / 512).
import * as THREE from 'three';

export const GROUND_TEX = [
  'grass',
  'lawn',
  'sand',
  'sandgrass',
  'gravel',
  'soil',
  'mud',
  'leaves',
  'stony',
];
export const GT = Object.fromEntries(GROUND_TEX.map((k, i) => [k, i]));
const BASE = (import.meta.env?.BASE_URL ?? '/') + 'assets/textures/ground/';

async function bitmap(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('ground texture ' + url + ' ' + r.status);
  return createImageBitmap(await r.blob(), { colorSpaceConversion: 'none' });
}

let cached = null;
export function loadGroundArrays(renderer) {
  if (cached) return cached;
  cached = (async () => {
    const N = GROUND_TEX.length,
      SC = 2048,
      SA = 1024; // ground pass: 2K albedo / height, 1K normal + arm
    const col = new Uint8Array(SC * SC * 4 * N),
      aux = new Uint8Array(SA * SA * 4 * N);
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const px = (bm, S) => {
      cv.width = cv.height = S;
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(bm, 0, 0, S, S);
      return ctx.getImageData(0, 0, S, S).data;
    };
    let next = Promise.all(
      ['col', 'h', 'nrm', 'arm'].map((s) => bitmap(`${BASE}${GROUND_TEX[0]}_${s}.jpg`)),
    );
    for (let L = 0; L < N; L++) {
      // one layer at a time (decoded 2K bitmaps are big), the next layer decodes while this one is copied
      const set = await next;
      if (L + 1 < N)
        next = Promise.all(
          ['col', 'h', 'nrm', 'arm'].map((s) => bitmap(`${BASE}${GROUND_TEX[L + 1]}_${s}.jpg`)),
        );
      const [bc, bh, bn, ba] = set;
      const c = px(bc, SC).slice(),
        h = px(bh, SC),
        o = L * SC * SC * 4;
      for (let i = 0; i < SC * SC * 4; i += 4) {
        col[o + i] = c[i];
        col[o + i + 1] = c[i + 1];
        col[o + i + 2] = c[i + 2];
        col[o + i + 3] = h[i];
      }
      const n = px(bn, SA).slice(),
        a = px(ba, SA),
        oa = L * SA * SA * 4;
      for (let i = 0; i < SA * SA * 4; i += 4) {
        aux[oa + i] = n[i];
        aux[oa + i + 1] = n[i + 1];
        aux[oa + i + 2] = a[i];
        aux[oa + i + 3] = a[i + 1];
      }
      for (const b of set) b.close?.();
      await new Promise((r) => setTimeout(r, 0)); // keep the loading screen alive
    }
    const mk = (data, S, srgb) => {
      const t = new THREE.DataArrayTexture(data, S, S, N);
      t.format = THREE.RGBAFormat;
      t.type = THREE.UnsignedByteType;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = renderer ? Math.min(16, renderer.capabilities.getMaxAnisotropy()) : 8;
      t.needsUpdate = true;
      return t;
    };
    return {
      col: mk(col, SC, true),
      aux: mk(aux, SA, false),
      count: N,
      bytes: Math.round(((col.length + aux.length) * 4) / 3),
    };
  })();
  return cached;
}

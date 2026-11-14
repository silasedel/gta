// city-look: CC0 PBR texture library (Poly Haven sets repacked by tools/fetch_pbr.py into public/assets/city/pbr/).
// - loadSet(name): classic per-material textures { map, normalMap, arm } (arm: R = AO, G = roughness, B = metalness).
// - loadArray(names): two sampler2DArray textures for shaders that pick the surface per vertex:
//     colR  RGBA8 sRGB   rgb = albedo, a = roughness
//     nrmAO RGBA8 linear rg = normal xy (OpenGL), b = AO, a = metalness
// Everything is cached, so near/mid/far materials share one GPU copy.
import * as THREE from 'three';

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'assets/city/pbr/';
const imgCache = new Map(), setCache = new Map();

function loadImage(url) {
  let p = imgCache.get(url);
  if (!p) {
    p = (async () => {
      const r = await fetch(url); if (!r.ok) throw new Error('pbr: ' + url + ' ' + r.status);
      return createImageBitmap(await r.blob(), { colorSpaceConversion: 'none' });
    })();
    imgCache.set(url, p);
  }
  return p;
}

function texFrom(bitmap, renderer, srgb) {
  const t = new THREE.Texture(bitmap);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
  return t;
}

// One PBR set as ordinary textures. The same `arm` texture serves as aoMap, roughnessMap and metalnessMap.
export function loadSet(renderer, name) {
  let p = setCache.get(name);
  if (!p) {
    p = (async () => {
      const [c, n, a] = await Promise.all(['col', 'nrm', 'arm'].map((k) => loadImage(`${BASE}${name}_${k}.jpg`)));
      return { name, map: texFrom(c, renderer, true), normalMap: texFrom(n, renderer, false), arm: texFrom(a, renderer, false) };
    })();
    setCache.set(name, p);
  }
  return p;
}

// MeshStandardMaterial parameters for a loaded set (all four PBR channels wired).
export function setParams(set, o = {}) {
  return { map: set.map, normalMap: set.normalMap, roughnessMap: set.arm, aoMap: set.arm, roughness: 1, metalness: 0, ...o };
}

function pixels(bitmap, S, ctx) {
  ctx.clearRect(0, 0, S, S); ctx.drawImage(bitmap, 0, 0, S, S);
  return ctx.getImageData(0, 0, S, S).data;
}

// layers: [{ name, neutral?: 0..1 (desaturate toward grey so the vertex tint sets the colour), level?: target mean luma (sRGB 0..1),
//            rough?: multiplier, metal?: constant metalness override, synth?: (S) => { col, nrm, arm } Uint8ClampedArray RGBA }]
export async function loadArray(renderer, layers, { size = 768 } = {}) {
  const S = size, N = layers.length;
  const colR = new Uint8Array(S * S * 4 * N), nrmAO = new Uint8Array(S * S * 4 * N);
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d', { willReadFrequently: true });
  const meta = [];
  for (let L = 0; L < N; L++) {
    const ly = layers[L]; let c, n, a;
    if (ly.synth) ({ col: c, nrm: n, arm: a } = ly.synth(S));
    else {
      const [bc, bn, ba] = await Promise.all(['col', 'nrm', 'arm'].map((k) => loadImage(`${BASE}${ly.name}_${k}.jpg`)));
      c = pixels(bc, S, ctx).slice(); n = pixels(bn, S, ctx).slice(); a = pixels(ba, S, ctx).slice();
    }
    // mean luma for normalization
    let sum = 0; for (let i = 0; i < c.length; i += 64) sum += 0.299 * c[i] + 0.587 * c[i + 1] + 0.114 * c[i + 2];
    const mean = sum / (c.length / 64) / 255, gain = ly.level ? ly.level / Math.max(0.05, mean) : 1, ds = ly.neutral ?? 0, rk = ly.rough ?? 1;
    const o = L * S * S * 4;
    for (let i = 0; i < S * S * 4; i += 4) {
      let r = c[i], g = c[i + 1], b = c[i + 2];
      if (ds > 0) { const y = 0.299 * r + 0.587 * g + 0.114 * b; r += (y - r) * ds; g += (y - g) * ds; b += (y - b) * ds; }
      colR[o + i] = Math.min(255, r * gain); colR[o + i + 1] = Math.min(255, g * gain); colR[o + i + 2] = Math.min(255, b * gain);
      colR[o + i + 3] = Math.min(255, a[i + 1] * rk);
      nrmAO[o + i] = n[i]; nrmAO[o + i + 1] = n[i + 1]; nrmAO[o + i + 2] = a[i]; nrmAO[o + i + 3] = ly.metal !== undefined ? ly.metal * 255 : a[i + 2];
    }
    meta.push({ name: ly.name, mean, gain });
    if (L % 4 === 3) await new Promise((r) => setTimeout(r, 0)); // keep the loading screen alive
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, S, S, N);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8; t.needsUpdate = true;
    return t;
  };
  return { colR: mk(colR, true), nrmAO: mk(nrmAO, false), layers: meta, size: S, count: N, index: Object.fromEntries(layers.map((l, i) => [l.key || l.name, i])) };
}

// Slice a packed atlas (cols x rows cells) into layer pixel triplets for loadArray's `synth` hook.
export async function atlasCells(urls, cols, rows) {
  const [bc, bn, br] = await Promise.all(urls.map((u) => loadImage(u)));
  return (cell, { armFromRough = true } = {}) => (S) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d', { willReadFrequently: true });
    const cw = bc.width / cols, ch = bc.height / rows, sx = (cell % cols) * cw, sy = Math.floor(cell / cols) * ch;
    const grab = (bm) => { x.clearRect(0, 0, S, S); x.drawImage(bm, sx + 2, sy + 2, cw - 4, ch - 4, 0, 0, S, S); return x.getImageData(0, 0, S, S).data.slice(); };
    const col = grab(bc), nrm = grab(bn), rg = grab(br), arm = new Uint8ClampedArray(S * S * 4);
    for (let i = 0; i < arm.length; i += 4) { arm[i] = 255; arm[i + 1] = armFromRough ? rg[i] : 200; arm[i + 2] = 0; arm[i + 3] = 255; }
    return { col, nrm, arm };
  };
}

// A flat synthetic layer (plastic, rubber, enamel): fine grain only.
export function flatLayer({ luma = 150, grain = 10, rough = 150, bump = 6, seed = 1 } = {}) {
  return (S) => {
    const col = new Uint8ClampedArray(S * S * 4), nrm = new Uint8ClampedArray(S * S * 4), arm = new Uint8ClampedArray(S * S * 4);
    let a = seed >>> 0; const r = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < S * S * 4; i += 4) {
      const v = luma + (r() - 0.5) * grain; col[i] = col[i + 1] = col[i + 2] = v; col[i + 3] = 255;
      nrm[i] = 128 + (r() - 0.5) * bump; nrm[i + 1] = 128 + (r() - 0.5) * bump; nrm[i + 2] = 255; nrm[i + 3] = 255;
      arm[i] = 255; arm[i + 1] = rough + (r() - 0.5) * 20; arm[i + 2] = 0; arm[i + 3] = 255;
    }
    return { col, nrm, arm };
  };
}

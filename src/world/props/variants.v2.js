// Per-instance texture variants for the instanced street props (overnight props pass, Nov 17).
// tools/v2/street-models/variants.py writes public/assets/models/street/var/<set>.jpg: N edited copies of one prop
// material's color texture stacked vertically (recolors, graffiti removed / moved / new tags, stickers, house numbers,
// grime, rust, sun fade). Here each strip becomes a texture ARRAY and the prop material samples the layer picked per
// instance, so one draw call per part material stays one draw call.
//   await loadVariants(kit.parts)      -> { [partName]: { n, set, layers } } and patches those materials in place
//   variantColor(layer, bright, fade)  -> THREE.Color carrying the per-instance data (instanceColor: r = layer,
//                                         g = brightness multiplier, b = sun fade 0..1), linear, never color managed
//   isVariantMaterial(m)               -> true when instanceColor of this material is variant data, not a tint
// Instances of a patched material MUST be drawn with instance colors (tilebuild inst(..., { colors: true })).
import * as THREE from 'three';

const BASE = '/assets/models/street/var/';
const OFF = typeof location !== 'undefined' && /[?&]propvar=0/.test(location.search);

export function isVariantMaterial(m) {
  return !!(m && m.userData && m.userData.varN);
}
export function variantColor(layer, bright = 1, fade = 0, out = new THREE.Color()) {
  return out.setRGB(layer, bright, fade, THREE.LinearSRGBColorSpace);
}

async function loadArray(url, size, n) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const H = size * n;
  const cv =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, H)
      : Object.assign(document.createElement('canvas'), { width: size, height: H });
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0, size, H);
  bmp.close?.();
  const data = new Uint8Array(cx.getImageData(0, 0, size, H).data.buffer);
  const t = new THREE.DataArrayTexture(data, size, size, n);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function patch(m, tex, n) {
  const prev = m.onBeforeCompile;
  m.userData.varN = n;
  m.userData.varTex = tex;
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uVarMap = { value: tex };
    sh.uniforms.uVarN = { value: n };
    sh.vertexShader =
      'varying vec3 vVar;\n' +
      sh.vertexShader.replace(
        '#include <color_vertex>',
        `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  vVar = instanceColor;
  #if defined( USE_COLOR_ALPHA )
    vColor = vec4( 1.0 );
  #elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
    vColor = vec3( 1.0 );
  #endif
#else
  vVar = vec3( 0.0, 1.0, 0.0 );
#endif`,
      );
    sh.fragmentShader =
      'precision highp sampler2DArray;\nuniform sampler2DArray uVarMap;\nuniform float uVarN;\nvarying vec3 vVar;\n' +
      sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture( uVarMap, vec3( vMapUv, clamp( floor( vVar.x + 0.5 ), 0.0, uVarN - 1.0 ) ) );
  diffuseColor *= sampledDiffuseColor;
#endif
  diffuseColor.rgb *= vVar.y;
  { float l = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) ); diffuseColor.rgb = mix( diffuseColor.rgb, vec3( l ) * vec3( 1.05, 1.0, 0.9 ) * 1.12 + 0.015, clamp( vVar.z, 0.0, 1.0 ) ); }`,
      );
  };
  const prevKey = m.customProgramCacheKey;
  m.customProgramCacheKey = function () {
    return (prevKey ? prevKey.call(this) : '') + '|propvar';
  };
  m.needsUpdate = true;
}

export async function loadVariants(parts) {
  if (OFF || typeof fetch === 'undefined' || typeof createImageBitmap === 'undefined') return {};
  let man = null;
  try {
    man = await (await fetch(BASE + 'variants.json')).json();
  } catch (e) {
    console.warn('[variants] no manifest', e?.message);
    return {};
  }
  const out = {};
  await Promise.all(
    Object.entries(man).map(async ([set, v]) => {
      const part = v.glb.replace(/\.glb$/, ''),
        P = parts[part];
      if (!P) return;
      const q = P.find((p) => p.material && p.material.name === v.mat && p.material.map);
      if (!q) return;
      try {
        const tex = await loadArray(BASE + set + '.jpg', v.size, v.n);
        patch(q.material, tex, v.n);
        out[part] = { n: v.n, set, layers: v.layers, material: q.material };
      } catch (e) {
        console.warn('[variants] set failed', set, e?.message);
      }
    }),
  );
  return out;
}

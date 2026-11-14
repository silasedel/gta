// Interiors engine kit: baked-light materials.
// Interior surfaces are lit by three per-vertex baked channels instead of the scene's ambient and sun:
//   bk0 = main lights (ceiling rig), bk1 = accent lights (neon, cooler glow, screens; stay on after hours), bk2 = daylight through glazing.
// A MatSet belongs to one interior: its materials share one uBk uniform, so a light switch or closing time dims that store only.
// Real point lights from the pooled rig (lighting.js) still add specular highlights; the sun is removed (the shell would block it).
import * as THREE from 'three';
import { surfaceTextures } from './surfaces.js';
import { hexNum, rgbOf } from './util.js';

// global daylight color * strength, driven by the time of day (lighting.js updates it)
export const SKY = { value: new THREE.Color(1, 1, 1) };

const LFB = THREE.ShaderChunk.lights_fragment_begin;
const NO_DIR = LFB.replace(/#if \( NUM_DIR_LIGHTS > 0 \) && defined\( RE_Direct \)[\s\S]*?#pragma unroll_loop_end\s*#endif/, '');
if (NO_DIR === LFB) console.warn('[interiors] could not strip the sun from baked materials (three.js chunk changed)');
const VERT_HEAD = 'attribute vec3 bk0;\nattribute vec3 bk1;\nattribute vec3 bk2;\nuniform vec3 uBk;\nuniform vec3 uSky;\nvarying vec3 vBk;\n';

function bakeable(mat, set, o = {}) {
  mat.userData.baked = true;
  const spec = o.spec ?? 1, direct = o.direct ?? 0.22;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBk = set.uBk; sh.uniforms.uSky = SKY;
    sh.vertexShader = VERT_HEAD + (o.instUv ? 'attribute vec4 iUv;\n' : '') + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBk = bk0 * uBk.x + bk1 * uBk.y + bk2 * uSky * uBk.z;');
    if (o.instUv) sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\t#ifdef USE_MAP\n\tvMapUv = uv * iUv.zw + iUv.xy;\n\t#endif');
    sh.fragmentShader = 'varying vec3 vBk;\n' + sh.fragmentShader
      .replace('#include <lights_fragment_begin>', NO_DIR + `\n\tfloat bkL = max( dot( vBk, vec3( 0.3333 ) ), 0.001 );\n\tirradiance = vBk * clamp( pow( bkL / 1.3, 0.5 ), 0.42, 1.7 );\n\treflectedLight.directDiffuse *= ${direct.toFixed(3)};\n\treflectedLight.directSpecular *= ${spec.toFixed(3)};`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n\t#if defined( RE_IndirectSpecular )\n\tiblIrradiance = vec3( 0.0 );\n\tradiance *= clamp( dot( vBk, vec3( 0.22 ) ), 0.02, 1.0 ) * ${spec.toFixed(3)};\n\t#endif`);
  };
  mat.customProgramCacheKey = () => `ibk4:${direct.toFixed(3)}:${spec.toFixed(3)}:${o.instUv ? 1 : 0}`;
  return mat;
}

let designMats = null; // optional shared library from the design system: (name, opts) => { map, normalMap, roughnessMap, m, rough, metal } | null
export function setDesignMaterials(fn) { designMats = fn; }

export class MatSet {
  constructor() { this.uBk = { value: new THREE.Vector3(1, 1, 1) }; this.cache = new Map(); this.glows = []; this.owned = []; }
  _keep(key, make) { let m = this.cache.get(key); if (!m) { m = make(); this.cache.set(key, m); this.owned.push(m); } return m; }
  // textured surface. o: { c, c2, c3 (baked into the texture), tint (multiplies), wear, rough (multiplier), metal, uvw, side, spec }
  surf(name, o = {}) {
    const key = `s:${name}:${JSON.stringify(o)}`;
    return this._keep(key, () => {
      let t = null; try { t = designMats?.(name, o) || null; } catch (e) { t = null; }
      t = t || surfaceTextures(name, o);
      const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: Math.min(1, t.rough * (o.rough ?? 1)), metalness: o.metal ?? t.metal, color: o.tint != null ? hexNum(o.tint) : 0xffffff, side: o.side || THREE.FrontSide });
      m.normalScale.set(o.bump ?? 1, o.bump ?? 1); m.userData.uvw = o.uvw ?? t.m; return bakeable(m, this, o);
    });
  }
  // flat color finish with a fine shared grain (small objects: brackets, trims, plastic housings). o: { rough, metal, kind }
  flat(color, o = {}) {
    const hex = hexNum(color), key = `f:${hex}:${JSON.stringify(o)}`;
    return this._keep(key, () => { const t = surfaceTextures(o.kind || (o.metal > 0.4 ? 'steel' : 'plastic'), { wear: o.wear ?? 0.2 });
      const m = new THREE.MeshStandardMaterial({ color: hex, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, side: o.side || THREE.FrontSide }); m.normalScale.set(0.5, 0.5); m.userData.uvw = o.uvw ?? 0.5; return bakeable(m, this, o); });
  }
  // light-emitting surface (troffer lens, neon tube, LED strip, bulb). ch: 0 main circuit, 1 accent circuit, 2 always on.
  glow(color, k = 2, ch = 0, flicker = false) {
    const c = new THREE.Color(hexNum(color)), key = `g:${c.getHex()}:${k}:${ch}:${flicker ? 1 : 0}`;
    return this._keep(key, () => { const m = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(k), toneMapped: false }); this.glows.push({ m, base: c.clone().multiplyScalar(k), ch, flicker }); return m; });
  }
  glass(o = {}) {
    const key = `gl:${JSON.stringify(o)}`;
    return this._keep(key, () => { const m = new THREE.MeshStandardMaterial({ color: hexNum(o.tint ?? '#cfe3e6'), transparent: true, opacity: o.opacity ?? 0.16, roughness: o.rough ?? 0.04, metalness: 0, envMapIntensity: o.env ?? 1.4, side: THREE.DoubleSide, depthWrite: false }); m.userData.order = 5; return m; });
  }
  // printed / drawn canvas page (atlas.js). lit > 0 makes it self-illuminated (backlit sign, screen) on circuit ch.
  page(tex, o = {}) {
    const key = `p:${tex.id}:${JSON.stringify(o)}`;
    return this._keep(key, () => {
      if (o.lit) { const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: !!o.alpha, alphaTest: o.alpha ? 0.4 : 0, side: o.side || THREE.FrontSide }); const base = new THREE.Color(o.lit, o.lit, o.lit); m.color.copy(base); this.glows.push({ m, base, ch: o.ch ?? 1 }); return m; }
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough ?? 0.75, metalness: 0, transparent: !!o.alpha, alphaTest: o.alpha ? 0.4 : 0, side: o.side || THREE.FrontSide }); if (o.decal) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; m.transparent = true; m.alphaTest = 0; m.depthWrite = false; m.userData.order = 2; } return bakeable(m, this, o);
    });
  }
  // instanced products: one atlas page, per-instance uv rect (iUv) and per-instance baked light
  items(tex) { return this._keep('it:' + tex.id, () => bakeable(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.0 }), this, { instUv: true, direct: 0.3 })); }
  // adopt a foreign material (design-system product part) so it is lit by this interior's bake
  adopt(src) { return this._keep('ad:' + src.uuid, () => { const m = src.clone(); return bakeable(m, this, {}); }); }
  // dirt / stain / smudge decal (alpha blotch in the left half of the texture, rising-damp band in the right half)
  grime(color, opacity = 0.5) { return this._keep('gr:' + color + opacity, () => { const m = new THREE.MeshBasicMaterial({ map: grimeTex(), transparent: true, depthWrite: false, color: hexNum(color), opacity, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }); m.userData.order = 2; return m; }); }
  // soft dark blob under fixtures and furniture (contact shadow)
  shadow() { return this._keep('shadow', () => { const m = new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); m.userData.order = 1; return m; }); }
  // circuit levels 0..1: main lights, accent lights, daylight factor
  setLevels(main, accent, sky = 1) { this.uBk.value.set(main, accent, sky); const ft = performance.now() * 0.001, fl = Math.sin(ft * 41) + Math.sin(ft * 13.7) + Math.sin(ft * 5.3) > 0.9 ? 0.12 : 1; for (const g of this.glows) g.m.color.copy(g.base).multiplyScalar((g.flicker ? fl : 1) * (g.ch === 0 ? Math.max(0.02, main) : g.ch === 1 ? Math.max(0.02, accent) : 1)); }
  dispose() { for (const m of this.owned) m.dispose(); this.owned.length = 0; this.cache.clear(); this.glows.length = 0; }
}

let GRIME = null;
function grimeTex() { if (GRIME) return GRIME; const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); let s = 99; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 70; i++) { const a = rnd() * 6.3, d = rnd() * rnd() * 46, x = 64 + Math.cos(a) * d, y = 128 + Math.sin(a) * d * 1.9, r = 8 + rnd() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.1 + rnd() * 0.22})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (let x = 130; x < 254; x++) { const h = 60 + rnd() * 120 + Math.sin(x * 0.13) * 40, gr = g.createLinearGradient(0, 256, 0, 256 - h); gr.addColorStop(0, `rgba(255,255,255,${0.55 + rnd() * 0.3})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, 256 - h, 1, h); }
  GRIME = new THREE.CanvasTexture(c); return GRIME; }
let SHADOW = null;
function shadowTex() { if (SHADOW) return SHADOW; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); SHADOW = new THREE.CanvasTexture(c); return SHADOW; }
export { rgbOf };

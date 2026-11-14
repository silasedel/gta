// House generator: shared materials on top of the Nico house kit (track: houses).
// One kit (and one texture cache) for every generated house, so all lots share materials and textures.
// Every house material carries the lot-hide hook: geometry merged across lots (mid / far LOD) has a per-vertex lot id
// (aLot); a lot whose full-detail build is showing is hidden in the merged mesh by one texel in a shared 64 x 64 mask.
import { createKit } from '../nicoHouse/kit.js';

export function createHouseKit(THREE, opts = {}) {
  const kit = createKit(THREE, { anisotropy: 4, seaY: -50, ...opts });
  if (opts.shareTex) kit.tex = opts.shareTex;     // reuse the Nico house's texture cache (same files): no duplicate GPU textures
  const mat = kit.mat;

  // ---------- lot-hide mask ----------
  const N = 64, maskData = new Uint8Array(N * N);
  const mask = new THREE.DataTexture(maskData, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  mask.minFilter = mask.magFilter = THREE.NearestFilter; mask.needsUpdate = true;
  const uMask = { value: mask };
  kit.lotMask = {
    size: N * N,
    set(id, hidden) { if (id > 0 && id < N * N && maskData[id] !== (hidden ? 255 : 0)) { maskData[id] = hidden ? 255 : 0; mask.needsUpdate = true; } },
  };
  const HIDE_PARS = 'attribute float aLot;\nuniform sampler2D uLotMask;\n';
  const HIDE_MAIN = '{ int hl = int( aLot + 0.5 ); if ( hl > 0 && texelFetch( uLotMask, ivec2( hl % 64, hl / 64 ), 0 ).r > 0.5 ) transformed = vec3( 0.0 ); }\n';
  const wrapped = new WeakSet();
  kit.hideHook = (m) => {
    if (wrapped.has(m)) return m; wrapped.add(m);
    const prev = m.onBeforeCompile, pk = m.customProgramCacheKey;
    m.onBeforeCompile = function (sh, r) {
      prev.call(this, sh, r);
      sh.uniforms.uLotMask = uMask;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + HIDE_PARS).replace('#include <project_vertex>', HIDE_MAIN + '#include <project_vertex>');
    };
    m.customProgramCacheKey = function () { return (pk ? pk.call(this) : '') + '|lotHide'; };
    m.needsUpdate = true;
    return m;
  };
  // depth material for merged meshes (shadows follow the mask)
  kit.hideDepth = kit.hideHook(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));

  // ---------- night windows ----------
  // Opaque glass: dark, glossy (sky reflections by day), tinted by the curtain / blind behind it (vertex color).
  // aWear = how lit the room behind is (0 dark .. 1 bright); uNight fades the light in at dusk.
  kit.uNight = { value: 0 };
  const win = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.07, metalness: 0.0, envMapIntensity: 1.25, color: 0xffffff });
  win.name = 'house:window'; win.userData.uvScale = 0;
  win.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = kit.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWear;\nvarying float vLit;\n').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aWear;\n');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLit;\nuniform float uNight;\n')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  vec3 hwTint = diffuseColor.rgb;\n  diffuseColor.rgb = hwTint * 0.09 + vec3( 0.012, 0.016, 0.02 );\n')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += mix( vec3( 1.0, 0.62, 0.3 ), hwTint * vec3( 1.25, 1.0, 0.75 ), 0.45 ) * vLit * uNight * 2.2;\n');
  };
  win.customProgramCacheKey = () => 'house:window';
  mat.houseWindow = () => win;

  // porch / wall lamp glass: warm emissive when the night uniform is up
  const bulb = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, color: 0xffffff });
  bulb.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = kit.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWear;\nvarying float vLit;\n').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aWear;\n');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLit;\nuniform float uNight;\n')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3( 1.0, 0.72, 0.42 ) * vLit * uNight * 9.0;\n');
  };
  bulb.customProgramCacheKey = () => 'house:bulb'; bulb.name = 'house:bulb'; bulb.userData.uvScale = 0;
  mat.houseBulb = () => bulb;

  // ---------- canvas textures ----------
  const shingleTex = kit.canvasTex(512, 512, (g, w, h) => {      // 3-tab asphalt shingles: tabs, slots, granule speckle, streaks
    const r = kit.rng(77); g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
    const rows = 8, rh = h / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * (w / 6);
      for (let x = -1; x < 4; x++) {
        const v = 120 + r() * 50 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x * w / 3 + off + 2, y * rh, w / 3 - 4, rh);
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x * w / 3 + off - 2, y * rh + rh * 0.35, 4, rh * 0.65);
      }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y * rh + rh - 3, w, 3);
    }
    for (let i = 0; i < 9000; i++) { const v = r() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.3})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    for (let i = 0; i < 40; i++) { const x = r() * w; const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, 'rgba(30,30,25,0)'); lg.addColorStop(1, 'rgba(30,30,25,0.18)'); g.fillStyle = lg; g.fillRect(x, 0, 4 + r() * 18, h); }
  });
  mat.shingle = () => kit.materials.get('house:shingle') || (() => { const m = new THREE.MeshStandardMaterial({ map: shingleTex, vertexColors: true, roughness: 0.92, bumpMap: shingleTex, bumpScale: 1.4 }); m.name = 'house:shingle'; m.userData.uvScale = 1.8; kit.materials.set(m.name, m); return m; })();

  // chain-link mesh (alpha-tested diamonds)
  const chainTex = kit.canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(200,205,205,1)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke(); });
  mat.chainlink = () => kit.materials.get('house:chain') || (() => { const m = new THREE.MeshStandardMaterial({ map: chainTex, alphaTest: 0.4, transparent: false, metalness: 0.8, roughness: 0.45, side: THREE.DoubleSide, vertexColors: true }); m.name = 'house:chain'; m.userData.uvScale = 0.06; kit.materials.set(m.name, m); return m; })();

  // insect screen (pool cages, porches)
  const screenTex = kit.canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(30,34,36,0.9)'; g.lineWidth = 1.2; for (let i = 0; i <= w; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } });
  mat.screen = () => kit.materials.get('house:screen') || (() => { const m = new THREE.MeshStandardMaterial({ map: screenTex, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.8, side: THREE.DoubleSide }); m.name = 'house:screen'; m.userData.uvScale = 0.03; kit.materials.set(m.name, m); return m; })();

  // breeze block (mid-century screen walls): four-petal openings
  const breezeTex = kit.canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-out';
    for (const [cx, cy] of [[32, 32], [96, 32], [32, 96], [96, 96]]) { g.beginPath(); g.ellipse(cx, cy, 22, 22, 0, 0, 6.3); g.fill(); }
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff'; g.fillRect(62, 0, 4, h); g.fillRect(0, 62, w, 4);
    for (const [cx, cy] of [[32, 32], [96, 32], [32, 96], [96, 96]]) { g.beginPath(); g.arc(cx, cy, 6, 0, 6.3); g.fill(); }
  });
  mat.breeze = () => kit.materials.get('house:breeze') || (() => { const m = new THREE.MeshStandardMaterial({ map: breezeTex, alphaTest: 0.5, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, bumpMap: kit.microTex(), bumpScale: 1 }); m.name = 'house:breeze'; m.userData.uvScale = 0.4; kit.materials.set(m.name, m); return m; })();

  // house-number digits (atlas 0-9, uv x = digit / 10)
  const digitTex = kit.canvasTex(640, 96, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = kit.font(84, 700, 'Georgia, serif'); for (let i = 0; i < 10; i++) g.fillText(String(i), i * 64 + 32, 50); }, { repeat: false });
  mat.digits = () => kit.materials.get('house:digits') || (() => { const m = new THREE.MeshStandardMaterial({ map: digitTex, alphaTest: 0.5, vertexColors: true, roughness: 0.4, metalness: 0.6 }); m.name = 'house:digits'; m.userData.uvScale = 0; kit.materials.set(m.name, m); return m; })();

  // pool water: bright, glossy, tile line under the surface by vertex shading
  const wn = new THREE.TextureLoader().load((import.meta.env?.BASE_URL ?? '/') + 'assets/env/waternormals.jpg'); wn.wrapS = wn.wrapT = THREE.RepeatWrapping;
  mat.poolWater = () => kit.materials.get('house:pool') || (() => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.0, normalMap: wn, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.4 }); m.name = 'house:pool'; m.userData.uvScale = 3; kit.materials.set(m.name, m); return m; })();

  // stucco: concrete scan with grunge, tinted by vertex color (painted CBS block)
  mat.stucco = () => mat.pbr('concrete_wall_008', { rep: 1.4, grunge: true, gain: 2.25 });
  mat.stoneVeneer = () => mat.pbr('coral_stone_wall', { rep: 1.2, grunge: true, gain: 1.6 });
  mat.pavers = () => mat.pbr('scuffed_cement', { rep: 1.6, grunge: true, gain: 1.9 });
  return kit;
}

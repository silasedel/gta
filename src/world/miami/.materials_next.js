// Miami city — shared materials (one set for all tiles so merged tile meshes batch well).
import * as THREE from 'three';
import { facadeVariants, VARIANTS } from './facades.js';
import { officeFacade, decoFacade, glassFacade, bandFacade, shopFacade, trunkTexture, frondTexture, radialTexture, loadPBR, rng } from '../city/tex.js';

function warehouseFacade(renderer) {
  // corrugated metal with a high window band and roller doors; tile = 24m x 12m
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = e.height = S; const ex = e.getContext('2d');
  const r = rng(77);
  x.fillStyle = '#c9ccc8'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 8) { x.fillStyle = i % 16 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.18)'; x.fillRect(i, 0, 4, S); }
  for (let i = 0; i < 2000; i++) { x.fillStyle = `rgba(90,70,50,${r() * 0.08})`; x.fillRect(r() * S, r() * S, 2 + r() * 6, 2 + r() * 12); }
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  for (let k = 0; k < 6; k++) { const X = 10 + k * 84; x.fillStyle = '#2b3a44'; x.fillRect(X, 60, 64, 40); if (r() < 0.4) { ex.fillStyle = '#ffe6b0'; ex.fillRect(X + 2, 62, 60, 36); } }
  for (let k = 0; k < 2; k++) { const X = 60 + k * 256; x.fillStyle = '#8f9496'; x.fillRect(X, 300, 140, 212); x.fillStyle = 'rgba(0,0,0,0.18)'; for (let j = 300; j < 512; j += 10) x.fillRect(X, j, 140, 3); }
  x.fillStyle = '#e8b400'; x.fillRect(0, 488, S, 24);
  const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  return { map: mk(c, true), emissive: mk(e, true), rm: null, tileW: 24, tileH: 12 };
}

export async function createMaterials(renderer) {
  const [asph, conc, tiles, sand, grass, wood, plaster] = await Promise.all([
    loadPBR(renderer, 'asphalt_02'), loadPBR(renderer, 'concrete_floor_worn_001'), loadPBR(renderer, 'concrete_tiles_02'),
    loadPBR(renderer, 'coast_sand_01'), loadPBR(renderer, 'aerial_grass_rock'), loadPBR(renderer, 'brown_planks_03'), loadPBR(renderer, 'white_plaster_02'),
  ]);
  const pbr = (set, o = {}) => new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0, ...o });
  const F = {
    office: officeFacade(renderer, 5), deco: decoFacade(renderer, 7), glass: glassFacade(renderer, 9, { variance: 0.3 }),
    band: bandFacade(renderer, 31), shop: shopFacade(renderer, 21), warehouse: warehouseFacade(renderer),
  };
  const facade = (f, o = {}) => new THREE.MeshStandardMaterial({
    map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0.05,
    roughnessMap: f.rm || null, metalnessMap: f.rm || null, roughness: f.rm ? 1 : 0.7, metalness: f.rm ? 1 : 0.2, vertexColors: true, ...o,
  });
  const M = {
    asphalt: pbr(asph, { color: 0x8e8e8e, vertexColors: true }),
    sidewalk: pbr(tiles, { vertexColors: true }),
    roof: pbr(conc, { vertexColors: true }),
    sand: pbr(sand, { color: 0xfff0d8, vertexColors: true }),
    grass: pbr(grass, { color: 0xb8d890, vertexColors: true }),
    land: pbr(conc, { vertexColors: true }),
    wood: pbr(wood, { color: 0xd8b898, vertexColors: true }),
    office: facade(F.office), deco: facade(F.deco), glass: facade(F.glass, { envMapIntensity: 1.6 }),
    band: facade(F.band), shop: facade(F.shop), warehouse: facade(F.warehouse),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, normalMap: plaster.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.45, metalness: 0.8 }),
    markings: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    far: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1, emissive: 0xffd9a0, emissiveIntensity: 0 }),
    // colour 0x232323 (not 0x222222) opts the pooled heads out of env/lamps.js signature scanning; tiles publish userData.psLamps instead
    lampHead: new THREE.MeshStandardMaterial({ color: 0x232323, emissive: 0xffd7a0, emissiveIntensity: 0, roughness: 0.4 }),
    pool: new THREE.MeshBasicMaterial({ map: radialTexture(renderer), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc890 }),
    beacon: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }),
  };
  // facade / atlas textures: full mip chains + max anisotropy (no moire on window grids at grazing angles)
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  for (const f of Object.values(F)) for (const tx of [f.map, f.emissive, f.rm]) if (tx) { tx.anisotropy = maxAniso; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.needsUpdate = true; }
  M.far.emissiveMap = F.office.emissive; M.far.map = F.office.map;
  // distant glass towers: same curtain-wall look as near glass (reflective, tinted, lit at night) on the mid/far chunk meshes
  M.farGlass = new THREE.MeshStandardMaterial({ map: F.glass.map, emissiveMap: F.glass.emissive, emissive: 0xfff0d8, emissiveIntensity: 0, roughnessMap: F.glass.rm, metalnessMap: F.glass.rm, roughness: 1, metalness: 1, vertexColors: true, envMapIntensity: 1.6 }); // mid/far facades show window grids by day too (vertex colour tints) // mid/far LOD: windows glow at night; ground/roofs use uv (0,0) = black texel
  M.sand.color.setRGB(1.55, 1.42, 1.22); M.sidewalk.color.setScalar(2.4); M.roof.color.setScalar(2.4); M.land.color.setScalar(1.6);
  for (const [m, b] of [[M.office, 2.0], [M.deco, 1.6], [M.band, 1.6], [M.shop, 1.2]]) { m.bumpMap = m.map; m.bumpScale = b; }

  // lit windows: warm tint + per-window on/off switching over time (a few flicker)
  const winU = { uWinTime: { value: 0 }, uWinDensity: { value: 0.8 } };
  const winPatch = (mat, cells, warm) => {
    mat.emissive.set(warm);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWinTime = winU.uWinTime; sh.uniforms.uWinDensity = winU.uWinDensity; sh.uniforms.uWinCells = { value: new THREE.Vector2(cells[0], cells[1]) };
      sh.fragmentShader = 'uniform float uWinTime;\nuniform float uWinDensity;\nuniform vec2 uWinCells;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef USE_EMISSIVEMAP
          vec2 wCell = floor(vEmissiveMapUv * uWinCells);
          float wH = fract(sin(dot(wCell, vec2(127.1, 311.7))) * 43758.5453);
          float wSlot = floor((uWinTime + wH * 100.0) / (25.0 + wH * 70.0));
          float wS = fract(sin(dot(wCell + wSlot * 1.37, vec2(269.5, 183.3))) * 43758.5453);
          float wOn = step(wS, uWinDensity);
          float wFl = 0.55 + 0.45 * step(0.5, fract(sin(floor(uWinTime * 9.0) + wH * 91.0) * 43758.5));
          totalEmissiveRadiance *= mix(wOn, wFl, step(0.993, wH));
        #endif`);
    };
  };
  { const FV = facadeVariants(renderer); for (const [n, f] of Object.entries(FV)) { F[n] = f; M[n] = facade(f, n === 'curtain' ? { envMapIntensity: 1.5 } : {}); M[n].bumpMap = f.map; M[n].bumpScale = n === 'curtain' ? 0.6 : 1.4; winPatch(M[n], f.cells, n === 'curtain' ? 0xfff0d8 : 0xffdcb0); } }
  winPatch(M.office, [8, 8], 0xffdca8); winPatch(M.deco, [4, 4], 0xffd8a0); winPatch(M.band, [16, 8], 0xffe2b8); winPatch(M.glass, [16, 16], 0xfff0d8); winPatch(M.warehouse, [6, 1], 0xffe6b0);

  // palms: wind sway in the vertex shader (per-instance phase from the instance position, global gust)
  const windU = { uWindTime: { value: 0 }, uGust: { value: 0.4 } };
  M.timeU = windU.uWindTime; // shared clock uniform (boats bob, palms sway)
  const windPatch = (frond) => (sh) => {
    sh.uniforms.uWindTime = windU.uWindTime; sh.uniforms.uGust = windU.uGust;
    sh.vertexShader = 'uniform float uWindTime;\nuniform float uGust;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 ipw = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 ipw = vec2(0.0);
      #endif
      float ph = fract(sin(dot(ipw, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
      float amp = 0.55 + 0.9 * fract(ph * 7.13);
      float hN = clamp(transformed.y / 11.0, 0.0, 1.6); float bend = hN * hN;
      float sway = (sin(uWindTime * 1.3 + ph) * 0.6 + sin(uWindTime * 2.7 + ph * 1.7) * 0.25) * (0.3 + uGust) * amp;
      transformed.x += bend * sway * 0.45;
      transformed.z += bend * (sway * 0.2 + cos(uWindTime * 1.1 + ph) * 0.1 * amp);
      ${frond ? 'transformed.y += sin(uWindTime * 4.5 + ph + transformed.x * 1.3 + transformed.z) * 0.12 * uv.y * (0.4 + uGust) * amp;' : ''}`);
  };
  const frondMap = frondTexture(renderer);
  M.trunk = new THREE.MeshStandardMaterial({ map: trunkTexture(renderer), roughness: 0.9, side: THREE.DoubleSide });
  M.royalTrunk = new THREE.MeshStandardMaterial({ map: M.trunk.map, color: 0xc8c4bc, roughness: 0.8, side: THREE.DoubleSide });
  M.frond = new THREE.MeshStandardMaterial({ map: frondMap, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color: 0xb8d498 });
  M.shaft = new THREE.MeshStandardMaterial({ color: 0x5f8f3a, roughness: 0.6 });
  for (const m of [M.trunk, M.royalTrunk, M.shaft]) m.onBeforeCompile = windPatch(false);
  M.frond.onBeforeCompile = windPatch(true);
  M.frondDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: frondMap, alphaTest: 0.45, side: THREE.DoubleSide });
  M.frondDepth.onBeforeCompile = windPatch(true);
  M.trunkDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); M.trunkDepth.onBeforeCompile = windPatch(false);

  { // graffiti atlas: original procedural tags (4x2 cells)
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d'); const gr = rng(4242);
    ['ZEPH', 'K-ROW', 'SOLO', 'MANGO', 'VYBE', 'NOVA', 'RAZ', 'OKE'].forEach((t2, i) => {
      const X = (i % 4) * 256 + 128, Y = Math.floor(i / 4) * 256 + 128, c1 = `hsl(${(gr() * 360) | 0},90%,60%)`, c2 = `hsl(${(gr() * 360) | 0},90%,55%)`;
      x.save(); x.translate(X, Y); x.rotate((gr() - 0.5) * 0.35); x.font = `bold ${t2.length > 4 ? 58 : 72}px "Arial Black", Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineJoin = 'round'; x.lineWidth = 16; x.strokeStyle = '#111'; x.strokeText(t2, 0, 0); const g = x.createLinearGradient(0, -36, 0, 36); g.addColorStop(0, c1); g.addColorStop(1, c2);
      x.fillStyle = g; x.fillText(t2, 0, 0); x.lineWidth = 3; x.strokeStyle = '#fff'; x.strokeText(t2, -2, -2); x.fillStyle = c2; for (let k = 0; k < 5; k++) x.fillRect(-90 + gr() * 180, 26, 3, 10 + gr() * 34); x.restore();
    });
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    M.graffiti = new THREE.MeshStandardMaterial({ map: tx, transparent: true, alphaTest: 0.05, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  // ground stack depth separation (pairs with the fixed y stack in tilebuild): more negative = drawn over
  M.junction = M.asphalt.clone(); M.parking = M.asphalt.clone();
  const zOff = (mat, u) => { mat.polygonOffset = true; mat.polygonOffsetFactor = Math.max(-2, u / 2); mat.polygonOffsetUnits = u; };
  { // ground variety: promenade terrazzo (beach/nightlife), concrete panels (downtown/business); world-UV tiles: 8 m and 6 m
    const mk = (c, rep = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t; };
    const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), r = rng(808);
    x.fillStyle = '#e6ddd0'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? 'rgba(255,250,240,0.35)' : 'rgba(205,190,170,0.25)'; x.fillRect(i * 256, j * 256, 256, 256); }
    const chips = ['#b9a58e', '#8d8478', '#f4efe6', '#d9a08a', '#7fb6b0', '#c9c1b4', '#a3593f', '#5f6f73'];
    for (let i = 0; i < 26000; i++) { x.fillStyle = chips[(r() * chips.length) | 0]; const w = 1 + r() * 4; x.globalAlpha = 0.35 + r() * 0.5; x.fillRect(r() * S, r() * S, w, w * (0.5 + r())); }
    x.globalAlpha = 1;
    const band = (pos, col, w, horiz) => { x.fillStyle = col; if (horiz) x.fillRect(0, pos - w / 2, S, w); else x.fillRect(pos - w / 2, 0, w, S); };
    for (let k = 0; k <= 4; k++) { const P = k * 256 % S, col = k % 2 ? '#2a9d8f' : '#e07a5f'; band(P, col, 10, true); band(P, col, 10, false); band(P, '#f7f3ea', 3, true); band(P, '#f7f3ea', 3, false); }
    x.save(); x.translate(512, 512); x.rotate(Math.PI / 4); x.strokeStyle = '#e07a5f'; x.lineWidth = 9; x.strokeRect(-110, -110, 220, 220); x.fillStyle = 'rgba(42,157,143,0.55)'; x.fillRect(-60, -60, 120, 120); x.restore();
    x.fillStyle = '#e07a5f'; x.beginPath(); x.arc(0, 0, 40, 0, 7); x.arc(S, 0, 40, 0, 7); x.arc(0, S, 40, 0, 7); x.arc(S, S, 40, 0, 7); x.fill();
    for (let i = 0; i < 14; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); x.save(); x.translate(r() * S, r() * S); x.scale(20 + r() * 70, 14 + r() * 40); g.addColorStop(0, 'rgba(90,75,60,0.16)'); g.addColorStop(1, 'rgba(90,75,60,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore(); }
    M.promenade = new THREE.MeshStandardMaterial({ map: mk(c), roughness: 0.55, metalness: 0, vertexColors: true, normalMap: tiles.normalMap, normalScale: new THREE.Vector2(0.15, 0.15) });
    const c2 = document.createElement('canvas'); c2.width = c2.height = S; const y = c2.getContext('2d'), r2 = rng(909), N = 4, cs = S / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const v = 196 + ((r2() * 26) | 0); y.fillStyle = `rgb(${v},${v - 3},${v - 8})`; y.fillRect(i * cs, j * cs, cs, cs);
      for (let k = 0; k < 900; k++) { const q = (r2() * 40) | 0; y.fillStyle = `rgba(${q + 80},${q + 78},${q + 72},${0.05 + r2() * 0.1})`; y.fillRect(i * cs + r2() * cs, j * cs + r2() * cs, 2, 2); }
      y.strokeStyle = 'rgba(0,0,0,0.05)'; y.lineWidth = 1; for (let k = 0; k < cs; k += 3) { y.beginPath(); y.moveTo(i * cs + k, j * cs); y.lineTo(i * cs + k, j * cs + cs); y.stroke(); } // broom finish
      if (r2() < 0.18) { y.strokeStyle = 'rgba(60,55,50,0.35)'; y.lineWidth = 1.5; y.beginPath(); let px = i * cs + r2() * cs, py = j * cs; y.moveTo(px, py); for (let k = 0; k < 8; k++) { px += (r2() - 0.5) * 30; py += cs / 8; y.lineTo(px, py); } y.stroke(); } // crack
    }
    y.fillStyle = 'rgba(70,66,60,0.85)'; for (let k = 0; k <= N; k++) { y.fillRect(k * cs - 3, 0, 6, S); y.fillRect(0, k * cs - 3, S, 6); }
    for (let i = 0; i < 10; i++) { const g = y.createRadialGradient(0, 0, 0, 0, 0, 1); y.save(); y.translate(r2() * S, r2() * S); y.scale(25 + r2() * 90, 18 + r2() * 50); y.rotate(r2() * 3); const wet = r2() < 0.4; g.addColorStop(0, wet ? 'rgba(40,45,50,0.38)' : 'rgba(70,60,45,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)'); y.fillStyle = g; y.beginPath(); y.arc(0, 0, 1, 0, 7); y.fill(); y.restore(); } // stains / damp patches
    const rc = document.createElement('canvas'); rc.width = rc.height = 256; const rx = rc.getContext('2d'); rx.drawImage(c2, 0, 0, 256, 256); const id = rx.getImageData(0, 0, 256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const l = id.data[i]; const rough = l < 120 ? 120 : 235; id.data[i] = id.data[i + 2] = 0; id.data[i + 1] = rough; } rx.putImageData(id, 0, 0); // damp = glossier
    const rTex = new THREE.CanvasTexture(rc); rTex.wrapS = rTex.wrapT = THREE.RepeatWrapping;
    M.panels = new THREE.MeshStandardMaterial({ map: mk(c2), roughnessMap: rTex, roughness: 1, metalness: 0, vertexColors: true, normalMap: conc.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) });
    M.panels.color.setScalar(1.15);
  }
  { // leaf-card foliage atlas: left half leaves, right half leaves + small bougainvillea/hibiscus flower clusters
    const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), r = rng(515);
    const leaf = (cx, cy, len, ang, col) => { x.save(); x.translate(cx, cy); x.rotate(ang); x.fillStyle = col; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0); x.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0); x.fill(); x.strokeStyle = 'rgba(20,40,10,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, 0); x.lineTo(len * 0.9, 0); x.stroke(); x.restore(); };
    for (const ox of [0, 512]) {
      for (let i = 0; i < 520; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.92, cx = ox + 256 + Math.cos(a) * d * 240, cy = 280 + Math.sin(a) * d * 220 * (Math.sin(a) < 0 ? 1 : 0.9);
        const l = 40 + r() * 26 + (1 - d) * 18, t = 0.35 + 0.65 * (1 - d) * r();
        leaf(cx, cy, l, r() * 6.28, `hsl(${95 + r() * 30},${45 + r() * 25}%,${16 + t * 26 + (cy < 200 ? 8 : 0)}%)`);
      }
      // a few twigs at the base so the card bottoms are not hard-edged
      x.strokeStyle = '#4a3a28'; x.lineWidth = 4; for (let k = 0; k < 7; k++) { x.beginPath(); x.moveTo(ox + 230 + k * 8, 512); x.lineTo(ox + 200 + r() * 112, 420 - r() * 80); x.stroke(); }
    }
    for (let i = 0; i < 230; i++) { // flower clusters (3–7 florets, papery bracts)
      const a = r() * 6.28, d = Math.pow(r(), 0.6) * 0.85, cx = 512 + 256 + Math.cos(a) * d * 230, cy = 270 + Math.sin(a) * d * 200;
      const hue = r() < 0.7 ? 318 + r() * 20 : r() < 0.6 ? 8 + r() * 14 : 40; const n = 3 + ((r() * 5) | 0);
      for (let k = 0; k < n; k++) { const fx = cx + (r() - 0.5) * 22, fy = cy + (r() - 0.5) * 18, rr = 5 + r() * 4; x.fillStyle = `hsl(${hue},${75 + r() * 20}%,${48 + r() * 18}%)`; for (let pp = 0; pp < 3; pp++) { x.beginPath(); x.ellipse(fx + Math.cos(pp * 2.1) * rr * 0.6, fy + Math.sin(pp * 2.1) * rr * 0.6, rr, rr * 0.7, pp * 2.1, 0, 7); x.fill(); } x.fillStyle = '#f6efd0'; x.fillRect(fx - 1, fy - 1, 2, 2); }
    }
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = maxAniso;
    M.leaf = new THREE.MeshStandardMaterial({ map: tx, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
    M.leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tx, alphaTest: 0.5, side: THREE.DoubleSide });
    // gentle rustle (shares the palm wind clock)
    const rustle = (sh) => { sh.uniforms.uWindTime = windU.uWindTime; sh.uniforms.uGust = windU.uGust; sh.vertexShader = 'uniform float uWindTime;\nuniform float uGust;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float lph = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.61;
      #else
        float lph = 0.0;
      #endif
      float lw = clamp(transformed.y, 0.0, 1.4) * (0.25 + uGust) * 0.05;
      transformed.x += sin(uWindTime * 2.3 + lph + transformed.z * 2.0) * lw; transformed.z += cos(uWindTime * 1.9 + lph * 1.3 + transformed.x * 2.0) * lw;`); };
    M.leaf.onBeforeCompile = rustle; M.leafDepth.onBeforeCompile = rustle;
    // sea oats: thin arching blades + drooping seed panicles
    const oc = document.createElement('canvas'); oc.width = 512; oc.height = 512; const o = oc.getContext('2d'), r3 = rng(626);
    for (let i = 0; i < 60; i++) { const bx = 256 + (r3() - 0.5) * 200, lean = (r3() - 0.5) * 260, top = 40 + r3() * 220; o.strokeStyle = `hsl(${60 + r3() * 30},${30 + r3() * 25}%,${38 + r3() * 25}%)`; o.lineWidth = 2 + r3() * 3; o.beginPath(); o.moveTo(bx, 512); o.quadraticCurveTo(bx + lean * 0.3, (512 + top) / 2, bx + lean, top); o.stroke(); }
    for (let i = 0; i < 9; i++) { const bx = 200 + r3() * 112, top = 20 + r3() * 60, lean = (r3() - 0.5) * 120; o.strokeStyle = '#b8a070'; o.lineWidth = 2; o.beginPath(); o.moveTo(bx, 512); o.quadraticCurveTo(bx, 250, bx + lean, top); o.stroke(); for (let k = 0; k < 9; k++) { o.fillStyle = `hsl(40,${40 + r3() * 20}%,${62 + r3() * 15}%)`; o.beginPath(); o.ellipse(bx + lean + (r3() - 0.5) * 30 + k * lean * 0.02, top + k * 9, 4, 8, 0.3, 0, 7); o.fill(); } }
    const otx = new THREE.CanvasTexture(oc); otx.colorSpace = THREE.SRGBColorSpace; otx.anisotropy = maxAniso;
    M.oats = new THREE.MeshStandardMaterial({ map: otx, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }); M.oats.onBeforeCompile = rustle;
    M.dune = new THREE.MeshStandardMaterial({ map: sand.map, normalMap: sand.normalMap, roughness: 1, metalness: 0, color: 0xfff0d8 }); M.dune.color.setRGB(1.5, 1.38, 1.18);
  }
  for (const [mat, u] of [[M.land, -1], [M.sand, -2], [M.grass, -3], [M.wood, -4], [M.parking, -4], [M.sidewalk, -4], [M.promenade, -4], [M.panels, -4], [M.asphalt, -6], [M.junction, -7], [M.markings, -9]]) if (mat) zOff(mat, u);
  { // world-space (triplanar) surface detail for street props: galvanized / painted metal, wood grain, concrete, corrugated steel
    const mkTex = (draw, n = 256) => { const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'); draw(x, n, rng(n + draw.length)); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
    const noise = (x, n, r, k, a) => { for (let i = 0; i < k; i++) { const v = (r() * 255) | 0; x.fillStyle = `rgba(${v},${v},${v},${a})`; x.fillRect(r() * n, r() * n, 1 + r() * 3, 1 + r() * 3); } };
    const TEX = {
      metal: mkTex((x, n, r) => { x.fillStyle = '#808080'; x.fillRect(0, 0, n, n); noise(x, n, r, 6000, 0.25); for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '40,35,30' : '200,200,200'},${0.08 + r() * 0.1})`; x.fillRect(r() * n, r() * n, 1 + r() * 2, 20 + r() * 80); } for (let i = 0; i < 18; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); x.save(); x.translate(r() * n, r() * n); x.scale(6 + r() * 14, 3 + r() * 8); g.addColorStop(0, 'rgba(110,70,40,0.35)'); g.addColorStop(1, 'rgba(110,70,40,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore(); } }),
      paint: mkTex((x, n, r) => { x.fillStyle = '#868686'; x.fillRect(0, 0, n, n); noise(x, n, r, 3000, 0.12); for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(${r() < 0.6 ? '230,230,230' : '50,45,40'},${0.25 + r() * 0.3})`; x.lineWidth = 0.6 + r(); x.beginPath(); const px = r() * n, py = r() * n; x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 30, py + (r() - 0.5) * 12); x.stroke(); } }),
      wood: mkTex((x, n, r) => { x.fillStyle = '#7d7d7d'; x.fillRect(0, 0, n, n); for (let i = 0; i < 90; i++) { const yy = r() * n, v = 90 + r() * 90; x.strokeStyle = `rgba(${v},${v},${v},0.35)`; x.lineWidth = 1 + r() * 2; x.beginPath(); x.moveTo(0, yy); for (let k = 0; k <= 8; k++) x.lineTo(k * n / 8, yy + Math.sin(k * 0.9 + i) * 3); x.stroke(); } for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(40,30,20,0.35)'; x.beginPath(); x.ellipse(r() * n, r() * n, 3 + r() * 4, 2 + r() * 2, 0, 0, 7); x.fill(); } }),
      concrete: mkTex((x, n, r) => { x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, n, n); noise(x, n, r, 9000, 0.18); for (let i = 0; i < 8; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); x.save(); x.translate(r() * n, r() * n); x.scale(20 + r() * 40, 15 + r() * 30); g.addColorStop(0, 'rgba(40,40,40,0.18)'); g.addColorStop(1, 'rgba(40,40,40,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore(); } }),
      ribs: mkTex((x, n, r) => { for (let i = 0; i < n; i++) { const v = 128 + Math.sin(i / n * Math.PI * 2 * 12) * 50; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, 0, 1, n); } noise(x, n, r, 2500, 0.15); for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(120,60,30,0.25)'; x.fillRect(r() * n, r() * n, 2 + r() * 6, 10 + r() * 40); } }),
    };
    // detail(mat, kind, scale): multiplies albedo by the world-space detail texture and varies roughness with it
    // real CC0 PBR atlas (ambientCG: PaintedMetal004, Metal032, Rust004, Wood066, Concrete034, Plaster001 at 1K, 3x2 cells) - see CREDITS.md
    const tl = new THREE.TextureLoader(), base = (import.meta.env?.BASE_URL ?? '/') + 'assets/city/tex/';
    const ATL = { color: tl.load(base + 'props_color.jpg', undefined, undefined, () => {}), rough: tl.load(base + 'props_rough.jpg', undefined, undefined, () => {}), normal: tl.load(base + 'props_normal.jpg', undefined, undefined, () => {}) };
    ATL.color.colorSpace = THREE.SRGBColorSpace; for (const t of Object.values(ATL)) { t.anisotropy = maxAniso; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
    const CELL = { paint: 0, metal: 1, rust: 2, wood: 3, concrete: 4, plaster: 5, ribs: 2 };
    M.detail = (mat, kind = 'metal', scale = 0.8, strength = 0.9, normalK = 1.4) => {
      const tex = TEX[kind] || TEX.metal, prev = mat.onBeforeCompile, cell = CELL[kind] ?? 1;
      mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r);
        sh.uniforms.uDet = { value: tex }; sh.uniforms.uDetS = { value: scale }; sh.uniforms.uDetK = { value: strength }; sh.uniforms.uAtl = { value: ATL.color }; sh.uniforms.uAtlR = { value: ATL.rough }; sh.uniforms.uAtlN = { value: ATL.normal }; sh.uniforms.uDetN = { value: normalK }; sh.uniforms.uCell = { value: new THREE.Vector2(cell % 3, Math.floor(cell / 3)) };
        sh.vertexShader = 'varying vec3 vDetP;\nvarying vec3 vDetN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 dwp = vec4(transformed, 1.0); vec3 dwn = objectNormal;
          #ifdef USE_INSTANCING
            dwp = instanceMatrix * dwp; dwn = mat3(instanceMatrix) * dwn;
          #endif
          dwp = modelMatrix * dwp; vDetP = dwp.xyz; vDetN = normalize(mat3(modelMatrix) * dwn);`);
        sh.fragmentShader = 'uniform sampler2D uDet;\nuniform sampler2D uAtl;\nuniform sampler2D uAtlR;\nuniform sampler2D uAtlN;\nuniform float uDetN;\nuniform vec2 uCell;\nuniform float uDetS;\nuniform float uDetK;\nvarying vec3 vDetP;\nvarying vec3 vDetN;\nvec4 atl(sampler2D t, vec2 p) { vec2 f = fract(p) * 0.98 + 0.01; vec2 uv = (uCell + f) / vec2(3.0, 2.0); return textureGrad(t, uv, dFdx(p) / vec2(3.0, 2.0), dFdy(p) / vec2(3.0, 2.0)); }\nvec4 tri(sampler2D t, vec3 bw) { return atl(t, vDetP.zy * uDetS * 0.35) * bw.x + atl(t, vDetP.xz * uDetS * 0.35) * bw.y + atl(t, vDetP.xy * uDetS * 0.35) * bw.z; }\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          vec3 bw = pow(abs(vDetN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-4);
          float det = texture2D(uDet, vDetP.zy * uDetS).r * bw.x + texture2D(uDet, vDetP.xz * uDetS).r * bw.y + texture2D(uDet, vDetP.xy * uDetS).r * bw.z;
          vec3 pbr = tri(uAtl, bw).rgb; float lum = dot(pbr, vec3(0.299, 0.587, 0.114)) + 1e-3;
          diffuseColor.rgb *= mix(vec3(1.0), mix(pbr / lum * 0.5 + 0.5, vec3(1.0), 0.35) * (lum * 1.6 + 0.2) * mix(1.0, det * 1.4, 0.3), uDetK);`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { // triplanar atlas normal map (whiteout blend in world space), then back to view space
            vec3 wn = normalize(vDetN); vec3 bwn = pow(abs(wn), vec3(4.0)); bwn /= (bwn.x + bwn.y + bwn.z + 1e-4); float s3 = uDetS * 0.35;
            vec3 tX = atl(uAtlN, vDetP.zy * s3).xyz * 2.0 - 1.0, tY = atl(uAtlN, vDetP.xz * s3).xyz * 2.0 - 1.0, tZ = atl(uAtlN, vDetP.xy * s3).xyz * 2.0 - 1.0;
            tX.xy *= uDetN; tY.xy *= uDetN; tZ.xy *= uDetN;
            tX = vec3(tX.xy + wn.zy, abs(tX.z) * wn.x); tY = vec3(tY.xy + wn.xz, abs(tY.z) * wn.y); tZ = vec3(tZ.xy + wn.xy, abs(tZ.z) * wn.z);
            vec3 nW = normalize(tX.zyx * bwn.x + tY.xzy * bwn.y + tZ.xyz * bwn.z);
            vec3 nV = normalize((viewMatrix * vec4(nW, 0.0)).xyz); normal = normalize(mix(normal, nV * faceDirection, uDetK));
          }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(mix(roughnessFactor, tri(uAtlR, bw).r * 1.1, uDetK), 0.04, 1.0);`);
      };
      mat.needsUpdate = true; return mat;
    };
    M.detail(M.metal, 'metal', 1.2);
  }
  { // grass: world-space colour variation (sun-bleached / lush / dry patches) breaks up the tiling
    const prevG = M.grass.onBeforeCompile;
    M.grass.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec2 vGW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'varying vec2 vGW;\nfloat gN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); float a = fract(sin(dot(i, vec2(127.1,311.7)))*43758.5), b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7)))*43758.5), c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7)))*43758.5), d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7)))*43758.5); return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float gn = gN(vGW * 0.035) * 0.6 + gN(vGW * 0.13) * 0.3 + gN(vGW * 0.6) * 0.1;
        diffuseColor.rgb *= mix(vec3(0.78, 0.92, 0.62), vec3(1.12, 1.06, 0.82), smoothstep(0.25, 0.8, gn));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.25, 1.1, 0.75), smoothstep(0.72, 0.9, gN(vGW * 0.09 + 17.0)) * 0.6);`);
      if (prevG) prevG(sh);
    };
  }
  M.guardrail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
  // storefront glass: see the INTERIORS agent's shops from the street (reflections come from scene.environment)
  M.shopGlass = new THREE.MeshPhysicalMaterial({ color: 0xd6eaee, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.3, clearcoat: 0.6, clearcoatRoughness: 0.05 });
  M.poolWater = new THREE.MeshStandardMaterial({ color: 0x2aa6b8, roughness: 0.05, metalness: 0.3, vertexColors: true });
  let t = 0;
  const night = (h) => (h >= 19.5 || h < 6 ? 1 : h > 18.6 ? (h - 18.6) / 0.9 : h < 7 ? 1 - (h - 6) : 0);
  const duskF = (h) => (h >= 18.0 ? Math.min(1, (h - 18.0) / 0.5) : h < 6.2 ? 1 : h < 6.7 ? (6.7 - h) / 0.5 : 0);
  function update(dt, hour) {
    t += dt;
    const n = night(hour), dusk = duskF(hour);
    winU.uWinTime.value = t; winU.uWinDensity.value = hour >= 17 || hour < 0.5 ? 0.85 : hour < 5 ? 0.45 : 0.6;
    windU.uWindTime.value = t; windU.uGust.value = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.13)) + 0.35 * Math.max(0, Math.sin(t * 0.41) * Math.sin(t * 0.067 + 1.3));
    for (const m of [M.office, M.deco, M.band, M.warehouse, ...Object.keys(VARIANTS).map((k) => M[k])]) m.emissiveIntensity = 0.04 + 1.0 * n;
    M.glass.emissiveIntensity = 0.03 + 0.9 * n; M.farGlass.emissiveIntensity = 0.03 + 0.9 * n; M.shop.emissiveIntensity = 0.35 + 1.1 * n; M.far.emissiveIntensity = 0.9 * n;
    M.lampHead.emissiveIntensity = 6 * n; M.pool.opacity = 0.5 * n;
    M.neon.color.setScalar(1 + 2.4 * dusk);
    M.bulb.color.setRGB(1, 0.85, 0.63).multiplyScalar(0.3 + 3.2 * dusk);
    const blink = t % 1.6 < 0.25; M.beacon.color.setRGB(blink ? 4 : 0.25, blink ? 0.2 : 0.02, blink ? 0.2 : 0.02);
    return { n, dusk };
  }
  return { M, F, update };
}

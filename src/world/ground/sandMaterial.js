// SAND-WEAR track: fine-detail sand for the whole game (bar lot, beaches, dunes, sandbars).
// makeSandMaterial(THREE, opts) -> MeshStandardMaterial patched in world space, so any ground mesh can use it without UVs:
//   - real sand albedo + normal (Poly Haven coast_sand_01) sampled twice at different scale and rotation and mixed by noise: no visible tiling
//   - grain-scale sparkle and micro normal (fades with distance), wind ripples in patches, darker damp patches (smoother, lower roughness)
//   - scattered detail stamped per world cell from a code-drawn atlas: shells, shell hash, pebbles, coral bits, seaweed, twigs,
//     bottle caps, plus large faint marks (old footprints, drag marks, bird tracks, scuffs)
// opts: { base = '/', tint = 0xe6d9bc, tile = 1.15, shells = 0.6, litter = 0.2, damp = 0.35, ripples = 0.5, marks = 0.3, bump = 1,
//         vertexColors = false, anisotropy = 8, loader (THREE.TextureLoader) }
// Live values: material.userData.sand = { shells, litter, damp, ripples, marks, bump } (uniform objects, set .value).
// Fresh footprints are separate decals (src/fx/footprints.v2.js) and work on top of this or any other sand.
const cache = new WeakMap();
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// 4 x 4 atlas, 256 px cells. Canvas rows from the top: shells | shell bits and pebbles | litter | large marks.
export function sandAtlas(seed = 77) {
  const S = 1024, C = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), r = rng(seed);
  const cell = (i, j, fn) => { g.save(); g.translate(i * C + C / 2, j * C + C / 2); fn(); g.restore(); };
  const shadow = (rx, ry) => { const gr = g.createRadialGradient(4, 6, 2, 4, 6, Math.max(rx, ry) * 1.25); gr.addColorStop(0, 'rgba(60,45,25,.5)'); gr.addColorStop(1, 'rgba(60,45,25,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(4, 6, rx * 1.25, ry * 1.25, 0, 0, 6.283); g.fill(); };
  // scallop fan
  cell(0, 0, () => { shadow(74, 66); g.fillStyle = '#efe4d2'; g.beginPath(); g.moveTo(0, 62); for (let a = -2.5; a <= -0.64; a += 0.1) g.lineTo(Math.cos(a) * (76 + Math.sin(a * 22) * 4), 62 + Math.sin(a) * (118 + Math.sin(a * 22) * 4)); g.closePath(); g.fill(); g.strokeStyle = 'rgba(176,120,92,.75)'; g.lineWidth = 3; for (let a = -2.4; a <= -0.7; a += 0.17) { g.beginPath(); g.moveTo(0, 60); g.lineTo(Math.cos(a) * 72, 62 + Math.sin(a) * 112); g.stroke(); } g.strokeStyle = 'rgba(214,150,120,.5)'; g.lineWidth = 7; for (const k of [0.45, 0.7, 0.9]) { g.beginPath(); for (let a = -2.4; a <= -0.7; a += 0.1) g.lineTo(Math.cos(a) * 74 * k, 62 + Math.sin(a) * 116 * k); g.stroke(); } g.fillStyle = '#e2d2bb'; g.fillRect(-20, 54, 40, 12); });
  // cockle, half buried
  cell(1, 0, () => { shadow(62, 54); const gr = g.createRadialGradient(-14, -16, 6, 0, 0, 64); gr.addColorStop(0, '#fbf6ec'); gr.addColorStop(1, '#d9c8ae'); g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 62, 52, 0.2, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(150,120,90,.45)'; g.lineWidth = 2.5; for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(-4, 44); g.quadraticCurveTo(i * 9, 0, i * 8.5, -46 + Math.abs(i) * 3); g.stroke(); } g.fillStyle = 'rgba(214,196,160,.85)'; g.beginPath(); g.ellipse(18, 44, 60, 18, 0.1, 0, 6.283); g.fill(); });
  // coquina pair (butterfly), purple and yellow
  cell(2, 0, () => { shadow(60, 30); for (const [s, col] of [[-1, '#b9a0c8'], [1, '#e8cf8a']]) { g.save(); g.rotate(s * 0.5); g.fillStyle = col; g.beginPath(); g.ellipse(s * 30, 0, 34, 19, 0, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; for (let k = 8; k < 34; k += 7) { g.beginPath(); g.ellipse(s * 30, 0, k, k * 0.55, 0, 0, 6.283); g.stroke(); } g.restore(); } });
  // broken whelk spiral
  cell(3, 0, () => { shadow(52, 62); g.fillStyle = '#e6d3b6'; g.beginPath(); g.moveTo(-30, -64); g.bezierCurveTo(46, -60, 56, 10, 14, 66); g.bezierCurveTo(-10, 40, -44, 20, -30, -64); g.fill(); g.strokeStyle = 'rgba(160,110,70,.7)'; g.lineWidth = 4; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-28 + k * 3, -50 + k * 22); g.quadraticCurveTo(14, -52 + k * 24, 34 - k * 4, -30 + k * 20); g.stroke(); } g.fillStyle = 'rgba(120,80,60,.55)'; g.beginPath(); g.ellipse(-4, 26, 12, 22, 0.5, 0, 6.283); g.fill(); });
  // mussel
  cell(0, 1, () => { shadow(40, 66); const gr = g.createLinearGradient(-30, 0, 30, 0); gr.addColorStop(0, '#2c3140'); gr.addColorStop(0.6, '#4a5470'); gr.addColorStop(1, '#232733'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -70); g.bezierCurveTo(48, -30, 40, 50, 0, 70); g.bezierCurveTo(-28, 40, -30, -30, 0, -70); g.fill(); g.strokeStyle = 'rgba(160,180,220,.35)'; g.lineWidth = 2; for (let k = 1; k < 5; k++) { g.beginPath(); g.ellipse(4, 10, k * 7, k * 14, 0, 0, 6.283); g.stroke(); } });
  // shell hash: a drift of small white chips
  cell(1, 1, () => { for (let i = 0; i < 46; i++) { const a = r() * 6.283, d = Math.pow(r(), 0.7) * 96, x = Math.cos(a) * d, y = Math.sin(a) * d * 0.7; g.fillStyle = `rgba(40,30,15,.25)`; g.beginPath(); g.ellipse(x + 2, y + 3, 6 + r() * 7, 4 + r() * 4, r() * 3, 0, 6.283); g.fill(); g.fillStyle = ['#fbf7ee', '#eadbc2', '#d8bfa6', '#f3e2cf', '#c9b7d0'][Math.floor(r() * 5)]; g.beginPath(); const n = 3 + Math.floor(r() * 3), s = 4 + r() * 9; for (let k = 0; k < n; k++) g.lineTo(x + Math.cos(k / n * 6.283 + a) * s * (0.6 + r() * 0.6), y + Math.sin(k / n * 6.283 + a) * s * (0.5 + r() * 0.5)); g.fill(); } });
  // gray limestone pebble
  cell(2, 1, () => { shadow(58, 44); const gr = g.createRadialGradient(-18, -16, 4, 0, 0, 64); gr.addColorStop(0, '#c9c6bd'); gr.addColorStop(1, '#84807a'); g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 58, 42, 0.3, 0, 6.283); g.fill(); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '40,40,40'},${r() * 0.25})`; g.fillRect((r() - 0.5) * 90, (r() - 0.5) * 60, 3, 3); } });
  // coral rock chunk with pores
  cell(3, 1, () => { shadow(60, 50); g.fillStyle = '#e4dccb'; g.beginPath(); for (let k = 0; k < 11; k++) { const a = k / 11 * 6.283; g.lineTo(Math.cos(a) * (48 + r() * 18), Math.sin(a) * (38 + r() * 16)); } g.fill(); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(110,96,74,${0.3 + r() * 0.4})`; g.beginPath(); g.arc((r() - 0.5) * 84, (r() - 0.5) * 62, 1.5 + r() * 4, 0, 6.283); g.fill(); } });
  // seaweed (sargassum sprig with float bladders)
  cell(0, 2, () => { g.lineCap = 'round'; for (let b = 0; b < 5; b++) { g.strokeStyle = ['#5a4a1c', '#6e5a22', '#463a16'][b % 3]; g.lineWidth = 5; g.beginPath(); let x = -70 + r() * 20, y = (r() - 0.5) * 60; g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += 20; y += (r() - 0.5) * 34; g.lineTo(x, y); g.save(); g.fillStyle = '#7a6a2a'; g.beginPath(); g.ellipse(x, y - 9, 9, 3.5, r() * 3, 0, 6.283); g.fill(); if (r() < 0.5) { g.fillStyle = '#9a8a3a'; g.beginPath(); g.arc(x + 4, y + 7, 4.5, 0, 6.283); g.fill(); } g.restore(); } g.stroke(); } });
  // bottle cap, crown side up (coral red)
  cell(1, 2, () => { shadow(50, 50); g.fillStyle = '#b9442f'; g.beginPath(); for (let k = 0; k < 42; k++) { const a = k / 42 * 6.283; g.lineTo(Math.cos(a) * (54 + (k % 2) * 6), Math.sin(a) * (54 + (k % 2) * 6)); } g.fill(); const gr = g.createRadialGradient(-16, -18, 4, 0, 0, 50); gr.addColorStop(0, '#f08a70'); gr.addColorStop(1, '#c9482f'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 47, 0, 6.283); g.fill(); g.strokeStyle = '#f6e7c8'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 30, 0, 6.283); g.stroke(); g.fillStyle = '#f6e7c8'; g.font = 'bold 34px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TK', 0, 2); g.fillStyle = 'rgba(120,60,20,.45)'; for (let i = 0; i < 9; i++) g.fillRect((r() - 0.5) * 80, (r() - 0.5) * 80, 5 + r() * 9, 3 + r() * 5); });
  // bottle cap, upside down, rusting
  cell(2, 2, () => { shadow(50, 50); g.fillStyle = '#8f8a7e'; g.beginPath(); for (let k = 0; k < 42; k++) { const a = k / 42 * 6.283; g.lineTo(Math.cos(a) * (54 + (k % 2) * 6), Math.sin(a) * (54 + (k % 2) * 6)); } g.fill(); g.fillStyle = '#5f5a50'; g.beginPath(); g.arc(0, 0, 45, 0, 6.283); g.fill(); g.fillStyle = '#c9c2b0'; g.beginPath(); g.arc(0, 0, 36, 0, 6.283); g.fill(); for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(140,66,24,${0.3 + r() * 0.5})`; g.beginPath(); g.arc((r() - 0.5) * 84, (r() - 0.5) * 84, 3 + r() * 9, 0, 6.283); g.fill(); } g.fillStyle = 'rgba(214,196,160,.9)'; g.beginPath(); g.ellipse(22, 34, 36, 16, 0.5, 0, 6.283); g.fill(); });
  // twig and a cigarette butt
  cell(3, 2, () => { g.lineCap = 'round'; g.strokeStyle = 'rgba(50,35,20,.35)'; g.lineWidth = 9; g.beginPath(); g.moveTo(-84, 34); g.lineTo(-10, -10); g.lineTo(70, -30); g.stroke(); g.strokeStyle = '#7a6248'; g.lineWidth = 6; g.beginPath(); g.moveTo(-86, 30); g.lineTo(-12, -14); g.lineTo(68, -34); g.moveTo(-12, -14); g.lineTo(6, -52); g.stroke(); g.save(); g.translate(30, 52); g.rotate(-0.3); g.fillStyle = 'rgba(40,30,15,.3)'; g.fillRect(-26, -3, 56, 14); g.fillStyle = '#f2efe6'; g.fillRect(-28, -7, 34, 13); g.fillStyle = '#d99a4a'; g.fillRect(6, -7, 20, 13); g.fillStyle = '#4a4a46'; g.fillRect(-32, -7, 5, 13); g.restore(); });
  // ---- large faint marks (drawn as soft dark shapes; the shader uses them to darken and dent) ----
  const sole = (x, y, a, s, al) => { g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s); g.fillStyle = `rgba(70,52,30,${al})`; g.filter = 'blur(3px)'; g.beginPath(); g.ellipse(0, -16, 13, 22, 0, 0, 6.283); g.fill(); g.beginPath(); g.ellipse(1, 24, 10, 13, 0, 0, 6.283); g.fill(); g.filter = 'none'; g.restore(); };
  cell(0, 3, () => { for (let k = 0; k < 4; k++) sole(-70 + k * 46, (k % 2 ? 16 : -16) + (r() - 0.5) * 8, 1.5708 + (r() - 0.5) * 0.3, 1.15, 0.36 - k * 0.03); });
  cell(1, 3, () => { g.filter = 'blur(4px)'; g.lineCap = 'round'; for (let k = 0; k < 5; k++) { g.strokeStyle = `rgba(70,52,30,${0.2 + r() * 0.2})`; g.lineWidth = 6 + r() * 12; g.beginPath(); g.moveTo(-104, -30 + k * 14 + r() * 6); g.bezierCurveTo(-30, -36 + k * 15, 30, -20 + k * 13, 104, -30 + k * 15 + r() * 8); g.stroke(); } g.filter = 'none'; });
  cell(2, 3, () => { g.strokeStyle = 'rgba(70,52,30,.5)'; g.lineWidth = 3; g.lineCap = 'round'; for (let k = 0; k < 7; k++) { const x = -92 + k * 30, y = (k % 2 ? 10 : -10) + Math.sin(k) * 8; for (const a of [-0.55, 0, 0.55]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15); g.stroke(); } g.beginPath(); g.moveTo(x, y); g.lineTo(x - 7, y); g.stroke(); } });
  cell(3, 3, () => { g.filter = 'blur(5px)'; for (let k = 0; k < 9; k++) { g.fillStyle = `rgba(70,52,30,${0.14 + r() * 0.2})`; g.beginPath(); g.ellipse((r() - 0.5) * 170, (r() - 0.5) * 150, 14 + r() * 30, 8 + r() * 16, r() * 3, 0, 6.283); g.fill(); } g.filter = 'none'; });
  return c;
}

const GLSL = /* glsl */`
uniform sampler2D sandCol, sandNrm, sandAtl, sandShore; uniform float sandTile, sandBump; uniform vec4 sandP; uniform float sandMarks; uniform vec4 sandShoreRect; uniform float sandShoreOn, sandTime;
varying vec3 vSandW;
float sH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 sH2(vec2 p){ float n = sH(p); return vec2(n, sH(p + n + 17.1)); }
float sN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(sH(i), sH(i + vec2(1, 0)), f.x), mix(sH(i + vec2(0, 1)), sH(i + vec2(1, 1)), f.x), f.y); }
float sF(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * sN(p); p = p * 2.03 + vec2(17.3, 9.1); a *= .5; } return s; }
mat2 sR(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec4 sandStamp(vec2 w, float cell, float density, float sMin, float sMax, float row0, float rows, vec2 dx, vec2 dy){
  vec2 id = floor(w / cell), f = w / cell - id;
  if (sH(id + cell * 7.7) > density) return vec4(0.);
  vec2 r2 = sH2(id + 3.3); float size = mix(sMin, sMax, r2.x * r2.x) / cell;
  vec2 c = vec2(.5) + (sH2(id + 9.9) - .5) * max(0., 1. - size * 1.42);
  float ang = r2.y * 6.2832; vec2 q = sR(ang) * (f - c) / size + .5;
  if (q.x < 0. || q.x > 1. || q.y < 0. || q.y > 1.) return vec4(0.);
  float k = floor(sH(id + 5.5) * 4.), row = row0 + floor(sH(id + 1.7) * rows);
  mat2 Rm = sR(ang) / (size * cell * 4.);
  return textureGrad(sandAtl, (vec2(k, row) + q) / 4., Rm * dx, Rm * dy);
}`;

export function makeSandMaterial(THREE, opts = {}) {
  const o = { base: '/', tint: 0xe6d9bc, tile: 1.15, shells: 0.6, litter: 0.2, damp: 0.35, ripples: 0.5, marks: 0.3, bump: 1, vertexColors: false, anisotropy: 8, ...opts };
  const loader = o.loader || new THREE.TextureLoader();
  let shared = cache.get(loader); if (!shared) {
    const T = (n, srgb) => { const t = loader.load(`${o.base}assets/city/pbr/${n}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = o.anisotropy; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    const atl = new THREE.CanvasTexture(sandAtlas()); atl.colorSpace = THREE.SRGBColorSpace; atl.anisotropy = o.anisotropy; atl.wrapS = atl.wrapT = THREE.ClampToEdgeWrapping;
    shared = { col: T('coast_sand_01_col', true), nrm: T('coast_sand_01_nrm', false), atl }; cache.set(loader, shared);
  }
  const U = { sandCol: { value: shared.col }, sandNrm: { value: shared.nrm }, sandAtl: { value: shared.atl }, sandTile: { value: o.tile }, sandBump: { value: o.bump }, sandP: { value: new THREE.Vector4(o.shells, o.damp, o.ripples, o.litter) }, sandMarks: { value: o.marks } , sandShore: { value: null }, sandShoreRect: { value: new THREE.Vector4(0, 0, 1, 1) }, sandShoreOn: { value: 0 }, sandTime: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ color: o.tint, roughness: 0.96, metalness: 0, vertexColors: o.vertexColors });
  mat.name = 'sand:fine'; mat.userData.sand = U; mat.userData.isSand = true;
  mat.customProgramCacheKey = () => 'sand-fine-v2';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSandW;').replace('#include <project_vertex>', '#include <project_vertex>\n  vSandW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <map_fragment>', /* glsl */`
  vec2 sw = vSandW.xz, sdx = dFdx(sw), sdy = dFdy(sw); float spx = length(sdx) + length(sdy);
  float sm1 = sF(sw * .07), sm2 = sF(sw * .9 + 31.7), sbl = smoothstep(.38, .62, sF(sw * .23 + 5.1));
  vec2 suA = sw / sandTile, suB = sR(.6435) * sw / (sandTile * 1.73) + vec2(.37, .11);
  vec3 savg = max(textureLod(sandCol, vec2(.5), 10.).rgb, vec3(.04));
  vec3 sc = pow(mix(texture2D(sandCol, suA).rgb, texture2D(sandCol, suB).rgb, sbl) / savg, vec3(1.2));
  float sdamp = sandP.y * smoothstep(.5, .7, sF(sw * .045 + vec2(11., 3.)) + .12 * sm2);
  sc *= mix(.84, 1.1, sm1) * mix(1., .6, sdamp); sc *= mix(vec3(1.), vec3(1.04, 1., .93), sm2);
  // ground-continuity: a third, coarse rotated sample and large-scale colour drift (no repeat visible from any height)
  vec3 sc3 = texture2D(sandCol, sR(2.21) * sw / (sandTile * 4.7) + vec2(.71, .29)).rgb / savg; sc = mix(sc, sc * sc3, .35);
  sc *= mix(.9, 1.08, sF(sw * .011 + 4.2)) * mix(vec3(1.), vec3(1.05, 1.01, .94), sF(sw * .004 + 9.));
  // moisture from the distance to the waterline (field built by beach.v2.js): dry pale sand up top, damp band, wet swash sheen
  float sShD = 99.; if (sandShoreOn > .5) { vec2 su = (sw - sandShoreRect.xy) * sandShoreRect.zw; if (su.x > 0. && su.y > 0. && su.x < 1. && su.y < 1.) sShD = texture2D(sandShore, su).r * 40.; }
  float sJit = (sF(sw * .15 + 3.) - .5) * 5.;
  float sDampB = 1. - smoothstep(3., 15., sShD + sJit), sWet = 1. - smoothstep(.3, 3. + 1.4 * sin(sandTime * .45 + sw.x * .031 + sw.y * .017), sShD + sJit * .3), sDry = smoothstep(16., 32., sShD + sJit);
  sc *= mix(vec3(1.), vec3(.68, .65, .62), sDampB * .85); sc *= mix(1., .8, sWet); sc *= mix(1., 1.07, sDry);
  sdamp = max(sdamp, sDampB * .6);
  float sgf = 1. - smoothstep(.0015, .01, spx), sgr = sH(floor(sR(.52) * sw * 430.)), sgr2 = sH(floor(sR(1.93) * sw * 287.) + 7.3);
  sc *= 1. + sgf * (sgr - .5) * .22 + sgf * (sgr2 - .5) * .14; sc += sgf * step(.99, sgr) * .2; sc *= 1. - sgf * step(sgr2, .02) * .3;
  vec2 sandG = mix(texture2D(sandNrm, suA).xy * 2. - 1., sR(-.6435) * (texture2D(sandNrm, suB).xy * 2. - 1.), sbl) * 1.25;
  sandG += (sH2(floor(sR(1.1) * sw * 310.)) - .5) * .6 * sgf;
  float srp = sandP.z * mix(smoothstep(.45, .68, sF(sw * .06 + vec2(40., 2.))), 1., sDry * .8) * (1. - sDampB) * (1. - smoothstep(.008, .04, spx));
  vec2 srd = normalize(vec2(.8, .6) + .3 * (vec2(sN(sw * .11), sN(sw * .11 + 9.)) - .5)); float sph = dot(sw, srd) * 27. + sF(sw * .8) * 5.;
  sandG += srd * cos(sph) * .34 * srp; sc *= 1. + sin(sph) * .05 * srp;
  vec4 sbig = sandStamp(sw + 13.7, 2.9, sandMarks, .9, 1.7, 0., 1., sdx, sdy);
  sc *= 1. - sbig.a * .42; sandG += vec2(dFdx(sbig.a), dFdy(sbig.a)) * 2.5 * (1. - smoothstep(.004, .02, spx));
  diffuseColor.rgb *= sc;
  vec4 ss1 = sandStamp(sw, .37, sandP.x * .55, .03, .085, 2., 2., sdx, sdy); diffuseColor.rgb = mix(diffuseColor.rgb, ss1.rgb, ss1.a);
  vec4 ss2 = sandStamp(sw + 5.3, .61, sandP.x * .35, .04, .12, 2., 2., sdx, sdy); diffuseColor.rgb = mix(diffuseColor.rgb, ss2.rgb, ss2.a);
  vec4 ss3 = sandStamp(sw + 21.1, .93, sandP.w, .03, .14, 1., 1., sdx, sdy); diffuseColor.rgb = mix(diffuseColor.rgb, ss3.rgb, ss3.a);
  float sStampA = max(ss1.a, max(ss2.a, ss3.a));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(mix(mix(roughnessFactor, .5, sdamp * .7), .55, sStampA * .6), .1, sWet * .9);')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
  { vec3 swn = inverseTransformDirection(normal, viewMatrix); swn = normalize(swn + vec3(sandG.x, 0., -sandG.y) * sandBump * .55 * (1. - sStampA * .7)); normal = normalize((viewMatrix * vec4(swn, 0.)).xyz); }`);
  };
  return mat;
}
export default makeSandMaterial;

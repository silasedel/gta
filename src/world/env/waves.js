// r2-water: ONE wave function for the whole game. The ocean shader (displacement + analytic normal, both ocean passes),
// boat buoyancy, the swimmer and floating cars all read the same Gerstner sum, so a hull rides exactly the swell you see.
//
//   const W = createWaves(game)          (game.waves; created by the boat system)
//   W.time                               the one wave clock (seconds), ticked once per frame by W.tick(dt)
//   W.heightAt(x, z)                     water surface height above sea level (m) at world (x, z), shore calm included
//   W.normalAt(x, z, out)                the matching surface normal (THREE.Vector3)
//   W.atten(x, z)                        0..1 calm factor: exactly 0 within 12 m of the shore, full from 60 m (r2-ground's
//                                        shore distance field tShore / uShoreRect, SHORE_MAX 140, read on the CPU)
//   W.phaseAt(x, z)                      phase of the dominant swell (radians), for swash / lap timing on the beach
//   W.uniforms / W.glsl                  for the ocean shader hook (one `// r2-water` block in ocean.js)
//   W.shaderOn                           true once the ocean draws the displaced surface; until then the physics uses a
//                                        small chop only (a hull must never bob against a flat drawn plane)
// ?waves=0 turns the swell off everywhere (flat calm, physics and shader).
import * as THREE from 'three';
import { FRESH_U, R4WATER } from './freshMask.js';

const OFF = typeof location !== 'undefined' && /[?&]waves=0\b/.test(location.search);
const G = 9.81, SHORE_MAX = 140, CALM0 = 12, CALM1 = 60;
// [wavelength m, amplitude m, heading offset deg, steepness 0..1]  (open bay swell; the total peak is ~0.36 m at sea 1)
const SET = [[41, 0.15, 0, 0.55], [24, 0.09, 27, 0.5], [14.5, 0.055, -33, 0.45], [8.6, 0.032, 61, 0.4], [5.3, 0.018, -72, 0.35], [3.2, 0.009, 14, 0.3]];
const N = SET.length;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createWaves(game, opts = {}) {
  const comps = SET.map(([L, A, off, Q], i) => ({ L, A, off: off * Math.PI / 180, Q, k: (2 * Math.PI) / L, w: Math.sqrt(G * (2 * Math.PI) / L), ph: i * 1.7, dx: 1, dz: 0 }));
  const uA = Array.from({ length: N }, () => new THREE.Vector4()), uB = Array.from({ length: N }, () => new THREE.Vector4());
  const uniforms = { uWaveA: { value: uA }, uWaveB: { value: uB }, uWaveTime: { value: 0 }, uWaveOn: { value: OFF ? 0 : 1 } };
  const W = {
    time: 0, sea: 1, heading: Math.PI, shaderOn: false, off: OFF, uniforms, chop: 0.16,
    // mean swell heading: the prevailing easterly trade swell, nudged by the wind (game.wind.dir points downwind)
    tick(dt) {
      if (!(dt > 0 && dt < 1)) return;
      W.time += dt; uniforms.uWaveTime.value = W.time;
      const wnd = game.wind;
      const tgtSea = OFF ? 0 : wnd ? Math.min(1.5, Math.max(0.55, 0.62 + 0.06 * (wnd.speed || 0) + 0.15 * (wnd.gust || 0))) : 1;
      W.sea += (tgtSea - W.sea) * Math.min(1, dt * 0.05);
      let hd = Math.PI; // traveling west (from the Atlantic toward the coast), swung up to ~17 deg toward the wind
      if (wnd?.dir && Number.isFinite(wnd.dir.x)) { const wa = Math.atan2(wnd.dir.y ?? wnd.dir.z ?? 0, wnd.dir.x); let df = wa - Math.PI; df = Math.atan2(Math.sin(df), Math.cos(df)); hd = Math.PI + Math.max(-0.6, Math.min(0.6, df)) * 0.5; }
      if (!W._hd) { W._hd = true; W.heading = hd; } else W.heading += (hd - W.heading) * Math.min(1, dt * 0.01);
      sync();
    },
    heightAt, normalAt, atten, phaseAt, sample,
  };
  function sync() {
    for (let i = 0; i < N; i++) {
      const c = comps[i], a = W.heading + c.off; c.dx = Math.cos(a); c.dz = Math.sin(a);
      uA[i].set(c.dx, c.dz, c.k, c.w); uB[i].set(c.A * W.sea, c.Q, c.ph, 0);
    }
  }
  sync();
  // ---- shore calm from the ocean's shore distance field (Uint8 0..255 = 0..140 m), bilinear like the GPU sampler
  function shoreM(x, z) {
    const o = game.env?.ocean, u = o?.uniforms; const tex = u?.tShore?.value, R = u?.uShoreRect?.value;
    if (!tex || !u.uHasShore?.value || !tex.image?.data) return 0; // field not built yet: calm
    const Wd = tex.image.width, Hd = tex.image.height, d = tex.image.data;
    const su = (x - R.x) * R.z, sv = (z - R.y) * R.w;
    if (!(su > 0 && sv > 0 && su < 1 && sv < 1)) return SHORE_MAX;
    const fx = su * Wd - 0.5, fy = sv * Hd - 0.5; let i = Math.floor(fx), j = Math.floor(fy); const tx = fx - i, ty = fy - j;
    const i0 = Math.max(0, Math.min(Wd - 1, i)), i1 = Math.max(0, Math.min(Wd - 1, i + 1)), j0 = Math.max(0, Math.min(Hd - 1, j)), j1 = Math.max(0, Math.min(Hd - 1, j + 1));
    const v = (d[j0 * Wd + i0] * (1 - tx) + d[j0 * Wd + i1] * tx) * (1 - ty) + (d[j1 * Wd + i0] * (1 - tx) + d[j1 * Wd + i1] * tx) * ty;
    return (v / 255) * SHORE_MAX;
  }
  function atten(x, z) { return OFF ? 0 : ss(CALM0, CALM1, shoreM(x, z)); }
  // physics amplitude: the full swell once the ocean draws it, a small chop on the flat plane before that
  const ampScale = () => (W.shaderOn ? 1 : W.chop);
  // Gerstner: P = (x + sum Q A dx cos, sum A sin, z + sum Q A dz cos) with theta = k (d . p) - w t + ph.
  // heightAt inverts the horizontal shift with two fixed-point steps, so it answers "the surface height above (x, z)".
  function disp(x, z, s, out) {
    let ox = 0, oy = 0, oz = 0; const t = W.time;
    for (let i = 0; i < N; i++) { const c = comps[i], A = c.A * W.sea * s, th = c.k * (c.dx * x + c.dz * z) - c.w * t + c.ph, cs = Math.cos(th), q = c.Q / (c.k * A * N + 1e-6) * A;
      ox += Math.min(q, c.Q * A) * c.dx * cs; oz += Math.min(q, c.Q * A) * c.dz * cs; oy += A * Math.sin(th); }
    out.x = ox; out.y = oy; out.z = oz; return out;
  }
  const _d = { x: 0, y: 0, z: 0 };
  function sample(x, z, out = { h: 0, nx: 0, ny: 1, nz: 0, a: 0 }) {
    const a = atten(x, z); out.a = a; if (a <= 0) { out.h = 0; out.nx = 0; out.ny = 1; out.nz = 0; return out; }
    const s = a * ampScale(); let px = x, pz = z;
    for (let it = 0; it < 2; it++) { disp(px, pz, s, _d); px = x - _d.x; pz = z - _d.z; }
    disp(px, pz, s, _d); out.h = _d.y;
    // analytic normal of the height field (slopes of the sines; the horizontal pinch sharpens crests only on the GPU)
    let gx = 0, gz = 0; const t = W.time;
    for (let i = 0; i < N; i++) { const c = comps[i], A = c.A * W.sea * s, th = c.k * (c.dx * px + c.dz * pz) - c.w * t + c.ph, kc = A * c.k * Math.cos(th); gx += kc * c.dx; gz += kc * c.dz; }
    const l = Math.hypot(gx, 1, gz); out.nx = -gx / l; out.ny = 1 / l; out.nz = -gz / l;
    return out;
  }
  const _s = { h: 0, nx: 0, ny: 1, nz: 0, a: 0 };
  function heightAt(x, z) { return sample(x, z, _s).h; }
  function normalAt(x, z, out = new THREE.Vector3()) { sample(x, z, _s); return out.set(_s.nx, _s.ny, _s.nz); }
  function phaseAt(x, z) { const c = comps[0]; return c.k * (c.dx * x + c.dz * z) - c.w * W.time + c.ph; }
  // ---- GLSL for the ocean hook: displacement + analytic normal (crests pinch with the Gerstner Q), same calm ramp
  W.glsl = /* glsl */`
    uniform vec4 uWaveA[${N}]; uniform vec4 uWaveB[${N}]; uniform float uWaveTime; uniform float uWaveOn;
    float waveAtten( float shoreM ) { return uWaveOn * smoothstep( ${CALM0.toFixed(1)}, ${CALM1.toFixed(1)}, shoreM ); }
    vec3 waveDisp( vec2 p, float shoreM, out vec3 wn ) {
      float s = waveAtten( shoreM ); vec3 o = vec3( 0.0 ); vec3 n = vec3( 0.0, 1.0, 0.0 );
      if ( s <= 0.0 ) { wn = n; return o; }
      for ( int i = 0; i < ${N}; i++ ) {
        vec4 a = uWaveA[ i ]; vec4 b = uWaveB[ i ]; float A = b.x * s;
        float th = a.z * dot( a.xy, p ) - a.w * uWaveTime + b.z; float sn = sin( th ), cs = cos( th );
        float q = min( b.y / ( a.z * A * ${N}.0 + 1e-6 ) * A, b.y * A );
        o.x += q * a.x * cs; o.z += q * a.y * cs; o.y += A * sn;
        float wa = a.z * A; n.x -= a.x * wa * cs; n.z -= a.y * wa * cs; n.y -= q * a.z * sn;
      }
      wn = normalize( n ); return o;
    }`;
  // ---- the ocean grid: camera-centered, ~1.5 m cells within +-60 m, growing 10 % per ring out to the 60 km edge.
  // Vertices are placed relative to the camera snapped to the inner cell (position.xz + uWaveCam in the shader).
  W.makeGrid = function makeGrid(inner = 1.5, innerHalf = 60, grow = 1.1, edge = 30000) {
    const xs = [0]; let x = 0, step = inner;
    while (x < edge) { x += step; xs.push(Math.min(x, edge)); if (x >= innerHalf) step *= grow; }
    const line = [...xs.slice(1).reverse().map((v) => -v), ...xs];
    const n = line.length, pos = new Float32Array(n * n * 3), idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = (j * n + i) * 3; pos[k] = line[i]; pos[k + 1] = 0; pos[k + 2] = line[j]; }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(n * n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), edge * 1.5);
    g.userData.waveGrid = { inner, n };
    return g;
  };
  // ---- ocean shader hook: patch an ocean ShaderMaterial (vertex: camera-snapped grid + displacement, faded out by 600 m;
  // fragment: ripple normals ride on the swell normal). Returns true when both anchors were found. Call once per pass.
  uniforms.uWaveGrid = { value: 1 };
  W.patchOceanMaterial = function patchOceanMaterial(mat) {
    let vs = mat.vertexShader, fs = mat.fragmentShader;
    const A = 'vec4 wp = modelMatrix * vec4( position, 1.0 );';
    const F = /vec3 N = normalize\( vec3\( n\.x \* chop, 1\.0, n\.y \* chop \) \);/;
    if (!vs.includes(A) || !F.test(fs)) return false;
    const decl = `${W.glsl}
      uniform float uWaveGrid; varying vec3 vWaveN;
      #ifndef R2W_SHORE
      uniform sampler2D tShore; uniform vec4 uShoreRect; uniform float uHasShore;
      #endif
    `;
    vs = vs.replace('void main() {', decl + '\n      void main() {');
    vs = vs.replace(A, `${A}
        if ( uWaveGrid > 0.5 ) wp.xz = position.xz + floor( cameraPosition.xz / ${1.5.toFixed(1)} ) * ${1.5.toFixed(1)};
        float wShoreM = ${SHORE_MAX.toFixed(1)};
        if ( uHasShore > 0.5 ) { vec2 suv = ( wp.xz - uShoreRect.xy ) * uShoreRect.zw; if ( suv.x > 0.0 && suv.y > 0.0 && suv.x < 1.0 && suv.y < 1.0 ) wShoreM = textureLod( tShore, suv, 0.0 ).r * ${SHORE_MAX.toFixed(1)}; }
        vec3 wN; vec3 wD = waveDisp( wp.xz, wShoreM, wN );
        float wFar = 1.0 - smoothstep( 250.0, 600.0, length( wp.xz - cameraPosition.xz ) );
        wp.xyz += wD * wFar; vWaveN = normalize( mix( vec3( 0.0, 1.0, 0.0 ), wN, wFar ) );`);
    fs = fs.replace('void main() {', 'varying vec3 vWaveN;\n      void main() {');
    fs = fs.replace(F, 'vec3 N = normalize( vec3( n.x * chop, 0.0, n.y * chop ) + vWaveN / max( vWaveN.y, 0.2 ) );');
    mat.vertexShader = vs; mat.fragmentShader = fs;
    for (const k in uniforms) if (!mat.uniforms[k]) mat.uniforms[k] = uniforms[k];
    mat.needsUpdate = true;
    return true;
  };
  // ---- freshwater (r2-water, user: "make it real"): canals, glades lakes and sloughs are tea-colored tannin water over dark
  // peat, not clear tropical sea over white sand. A camera-centered mask (2 km, 8 m cells) says how "fresh" each water cell
  // is: the glades districts, plus water with little open water around it (inland lakes / canals: < 25 % water within
  // ~450 m). patchFreshMaterial() swaps r2-ground's seawater absorption / in-scatter / stand-in bed for tannin water there.
  const FN = 256, FC = 8, GL = /^(Everglades|Everglades City|Big Cypress)$/;
  // render track (Nov 18): G = "calm bay" (sheltered Keys / bay sea: calm, darker clear teal, mirror-like; mock-ups r4/17, 18)
  const fData = new Uint8Array(FN * FN * 2), fTex = new THREE.DataTexture(fData, FN, FN, THREE.RGFormat, THREE.UnsignedByteType);
  fTex.magFilter = fTex.minFilter = THREE.LinearFilter; fTex.generateMipmaps = false; fTex.needsUpdate = true;
  FRESH_U.tFresh.value = fTex; uniforms.tFresh = FRESH_U.tFresh; uniforms.uFreshRect = FRESH_U.uFreshRect; uniforms.uR4 = FRESH_U.uR4; // r4-water: shared with the ground shader
  const F = { job: null, cx: 1e9, cz: 1e9, builds: 0 };
  function* buildFresh(cx, cz) {
    const c = game.city; if (!c?.isWater) return;
    const x0 = cx - FN * FC / 2, z0 = cz - FN * FC / 2, buf = new Uint8Array(FN * FN), coarse = new Map();
    const inland = (x, z) => { const k = Math.round(x / 64) * 100003 + Math.round(z / 64); let v = coarse.get(k);
      if (v === undefined) { let w = 0; for (let a = 0; a < 12; a++) { const an = a / 12 * Math.PI * 2; for (const r of [220, 450]) if (c.isWater(x + Math.cos(an) * r, z + Math.sin(an) * r)) w++; }
        const lo = GL.test(c.districtAt?.(x, z) || '') ? 0.34 : 0.18; v = 1 - Math.min(1, Math.max(0, (w / 24 - lo) / 0.2)); coarse.set(k, v); } return v; }; // open coast (lots of water around) stays sea, even in the glades districts
    let t0 = performance.now();
    if (R4WATER) { const bay = new Uint8Array(FN * FN); yield* buildFresh4(x0, z0, buf, inland, bay); for (let k = 0; k < FN * FN; k++) { fData[k * 2] = buf[k]; fData[k * 2 + 1] = bay[k]; } fTex.needsUpdate = true; uniforms.uFreshRect.value.set(x0, z0, 1 / (FN * FC), 1); F.cx = cx; F.cz = cz; F.builds++; F.r4 = true; return; }
    for (let j = 0; j < FN; j++) {
      for (let i = 0; i < FN; i++) { const x = x0 + (i + 0.5) * FC, z = z0 + (j + 0.5) * FC; buf[j * FN + i] = c.isWater(x, z) ? Math.round(inland(x, z) * 255) : 255; }
      if (performance.now() - t0 > 1.5) { yield; t0 = performance.now(); }
    }
    for (let k = 0; k < FN * FN; k++) { fData[k * 2] = buf[k]; fData[k * 2 + 1] = 0; } fTex.needsUpdate = true; uniforms.uFreshRect.value.set(x0, z0, 1 / (FN * FC), 1); F.cx = cx; F.cz = cz; F.builds++;
  }
  // r4-water (user: "inconsistent water color across one body"): the old mask mixed sea and fresh inside one pond (Brickell Ave:
  // a 'sea' fringe of raster cells around a 'pond', the open-water test in 64 m steps), and land cells were 255, so the
  // bilinear fetch blended "fresh" into the sea at every beach. Now: the data's water kind decides (pond / canal / lake / river /
  // marsh = fresh), only 'sea' cells use the open-water test (bilinear between 64 m nodes, no steps), fresh spreads 16 m into
  // a body's sea fringe, values are smoothed inside the water, and land takes its nearest water's value (24 m).
  // calm bay: sea in the Keys / bay districts (not the open Atlantic or Gulf), ?baywater=0 = off
  const BAY_RE = /Key Largo|Marathon|Key West|Florida Bay|Keys|Biscayne Bay|Key Biscayne|Charlotte Harbor|Sanibel/;
  const BAY_ON = !(typeof location !== 'undefined' && /[?&]baywater=0\b/.test(location.search));
  function* buildFresh4(x0, z0, buf, inland, bayOut) {
    const c = game.city, d = game.miamiData || c, wkAt = d.waterKindAt || c.waterKindAt || null, N2 = FN * FN;
    const isW = new Uint8Array(N2), v = new Float32Array(N2), bv = new Float32Array(N2); let t0 = performance.now();
    const dAt = d.districtAt || c.districtAt || null, bayMemo = new Map();
    const bayOf = (x, z) => { if (!BAY_ON || !dAt) return 0; const nm = dAt.call(d, x, z) || ''; let r = bayMemo.get(nm); if (r === undefined) { r = BAY_RE.test(nm) ? 1 : 0; bayMemo.set(nm, r); } return r; };
    const node = new Map(), nodeV = (a, b) => { const k = a * 100003 + b; let r = node.get(k); if (r === undefined) { r = inland(a * 64, b * 64); node.set(k, r); } return r; };
    const inl = (x, z) => { const fx = x / 64, fz = z / 64, a = Math.floor(fx), b = Math.floor(fz), u = fx - a, w = fz - b;
      return (nodeV(a, b) * (1 - u) + nodeV(a + 1, b) * u) * (1 - w) + (nodeV(a, b + 1) * (1 - u) + nodeV(a + 1, b + 1) * u) * w; };
    for (let j = 0; j < FN; j++) {
      for (let i = 0; i < FN; i++) { const x = x0 + (i + 0.5) * FC, z = z0 + (j + 0.5) * FC, k = j * FN + i;
        if (!c.isWater(x, z)) { v[k] = -1; continue; } isW[k] = 1; const wk = wkAt ? wkAt.call(d, x, z) : 'sea';
        v[k] = wk && wk !== 'sea' ? 1 : inl(x, z); bv[k] = bayOf(x, z); }
      if (performance.now() - t0 > 1.5) { yield; t0 = performance.now(); }
    }
    const tmp = new Float32Array(N2);
    const pass = (fn) => { tmp.set(v); for (let j = 1; j < FN - 1; j++) for (let i = 1; i < FN - 1; i++) fn(j * FN + i); };
    for (let n = 0; n < 2; n++) { pass((k) => { if (!isW[k]) return; let m = tmp[k]; for (const o of [1, -1, FN, -FN]) if (isW[k + o] && tmp[k + o] > m) m = tmp[k + o]; v[k] = m; }); yield; } // fresh into the sea fringe
    for (let n = 0; n < 2; n++) { pass((k) => { if (!isW[k]) return; let s = tmp[k] * 2, w = 2; for (const o of [1, -1, FN, -FN, FN + 1, FN - 1, -FN + 1, -FN - 1]) if (isW[k + o]) { s += tmp[k + o]; w++; } v[k] = s / w; }); yield; } // smooth inside the water
    for (let n = 0; n < 3; n++) { pass((k) => { if (tmp[k] >= 0) return; let s = 0, w = 0; for (const o of [1, -1, FN, -FN]) if (tmp[k + o] >= 0) { s += tmp[k + o]; w++; } if (w) v[k] = s / w; }); yield; } // land carries its water's value
    for (let k = 0; k < N2; k++) buf[k] = v[k] < 0 ? 255 : Math.round(Math.min(1, Math.max(0, v[k])) * 255);
    if (bayOut) { // bay: soft 40 m blend at district borders inside the water, land carries its water's value
      for (let k = 0; k < N2; k++) if (!isW[k]) bv[k] = -1;
      const pb = (fn) => { tmp.set(bv); for (let j = 1; j < FN - 1; j++) for (let i = 1; i < FN - 1; i++) fn(j * FN + i); };
      for (let n = 0; n < 4; n++) { pb((k) => { if (!isW[k]) return; let sm = tmp[k] * 2, w = 2; for (const o of [1, -1, FN, -FN]) if (isW[k + o]) { sm += tmp[k + o]; w++; } bv[k] = sm / w; }); yield; }
      for (let n = 0; n < 3; n++) { pb((k) => { if (tmp[k] >= 0) return; let sm = 0, w = 0; for (const o of [1, -1, FN, -FN]) if (tmp[k + o] >= 0) { sm += tmp[k + o]; w++; } if (w) bv[k] = sm / w; }); yield; }
      for (let k = 0; k < N2; k++) bayOut[k] = bv[k] < 0 ? 0 : Math.round(Math.min(1, bv[k]) * 255);
    }
  }
  W.fresh = F;
  W.updateFresh = function updateFresh(cam) {
    if (!cam) return;
    if (F.job) { const t = performance.now(); try { while (performance.now() - t < 2) if (F.job.next().done) { F.job = null; break; } } catch (e) { F.job = null; } return; }
    if (Math.hypot(cam.x - F.cx, cam.z - F.cz) > 450) F.job = buildFresh(Math.round(cam.x / FC) * FC, Math.round(cam.z / FC) * FC);
  };
  W.patchFreshMaterial = function patchFreshMaterial(mat) {
    let fs = mat.fragmentShader;
    const A = ['vec2 p = vWorld.xz;', 'float chop = ( 0.55 + 0.35 * lowSun ) * lod * uWindChop;', 'vec3 Tr = exp( -vec3( 0.42, 0.072, 0.034 ) * Lp );', 'vec3 bedFake = mix( vec3( 0.46, 0.43, 0.37 ), vec3( 0.05, 0.08, 0.045 ), grassB )'];
    if (!A.every((a) => fs.includes(a)) || !/vec3 inS = [^;]*;/.test(fs)) return false;
    fs = fs.replace('void main() {', 'uniform sampler2D tFresh; uniform vec4 uFreshRect; uniform float uR4;\n      void main() {');
    fs = fs.replace(A[0], `${A[0]}
        float fresh = 0.0, bay = 0.0; { vec2 fu = ( p - uFreshRect.xy ) * uFreshRect.z; if ( uFreshRect.w > 0.5 && fu.x > 0.0 && fu.y > 0.0 && fu.x < 1.0 && fu.y < 1.0 ) { vec2 fg = texture2D( tFresh, fu ).rg; fresh = fg.r; bay = fg.g * ( 1.0 - fg.r ); } }
        vec3 seaSig = mix( vec3( 0.42, 0.072, 0.034 ), vec3( 0.95, 0.58, 0.52 ), bay ); // calm bay (render track): clear but dark teal, the bed fades within a couple of meters`);
    fs = fs.replace(A[1], `${A[1]} chop *= ( 1.0 - 0.6 * fresh ) * ( 1.0 - 0.55 * bay ); // still inland water: fine ripples, no sea chop; calm bay: glassy`);
    const R4A = ['float dE = wD + wob,', 'float Fn = F * smoothstep( 0.0, 0.05, dE );', 'addC += vec3( 0.02 ) * crest * Ein;', 'vec3 foamC =', 'vec3 mulC = vec3( 1.0 - Fn ) * Tr * dataK;'];
    const r4 = R4A.every((a) => fs.includes(a)) && fs.includes('float r4Land');
    if (r4) { // r4-water: inland banks (Brickell Ave swamp): soft, even, murky; the sea keeps r2-ground's look
      fs = fs.replace(R4A[0], 'float r4F = fresh * uR4; float dE = wD + wob * ( 1.0 - r4F ),'); // no breathing edge inland (it crawled over the flats)
      fs = fs.replace(R4A[1], `${R4A[1]} Fn *= r4E;`);
      fs = fs.replace(R4A[2], 'addC += vec3( 0.02 ) * crest * Ein * ( 1.0 - r4F );'); // no surf wavelet rings on a pond
      fs = fs.replace(R4A[3], 'fA *= 1.0 - r4F; vec3 foamC ='); // no foam lace / white blotches on a pond's edge
      fs = fs.replace(R4A[4], `${R4A[4]} { float bk = r4E * ( 1.0 - r4E ) * 4.0 * r4F; mulC *= 1.0 - 0.38 * bk; addC *= 1.0 - 0.3 * bk; } // the last meter: dark wet mud under a film of water`);
    }
    // r4: one even, murky body: past the bank the look no longer depends on the (noisy) bed depth; at the bank the water thins
    // out over ~2 m of the blurred land cover (r4Land, ocean.js height cascade), so the line is soft and follows the bank
    const r4Tr = r4 ? `float r4E = mix( 1.0, 1.0 - smoothstep( 0.1, 0.46, r4Land ), r4F * hK ); float LpF = mix( Lp, max( Lp, 2.4 * r4E ), r4F );
        vec3 Tr = mix( vec3( 1.0 ), exp( -mix( vec3( 0.42, 0.072, 0.034 ), mix( vec3( 0.75, 1.45, 3.1 ), vec3( 2.1, 2.5, 3.6 ), uR4 ), fresh ) * LpF ), mix( 1.0, r4E, r4F ) );` : '';
    // tannin: blue and green absorbed within a meter (amber-brown), red carries -> shallows show the dark bed through tea
    fs = fs.replace(A[2], r4Tr || 'vec3 Tr = exp( -mix( vec3( 0.42, 0.072, 0.034 ), vec3( 0.75, 1.45, 3.1 ), fresh ) * Lp );');
    fs = fs.replace(/vec3 inS = ([^;]*);/, (m0, ex) => `vec3 inS = mix( ${ex}, mix( vec3( 0.022, 0.016, 0.006 ), vec3( 0.019, 0.021, 0.012 ), uR4 ) * Ein * ( 1.0 - Tr ) * facet, fresh );`); // r4: murky olive-brown body (was near-black tea)
    // stand-in bed: peat / mud with drowned leaf litter instead of white sand (the milky gray look in canals)
    const B0 = A[3].replace('vec3 bedFake = ', '');
    fs = fs.replace(A[3], `vec3 bedFake = mix( ${B0}, mix( vec3( 0.075, 0.058, 0.036 ), vec3( 0.035, 0.03, 0.018 ), grassB ), fresh )`);
    // calm bay (render track, Nov 18; user mock-ups r4/17, r4/18): darker teal body, dark seagrass / mud bed instead of white
    // sand, full Fresnel (a calm surface mirrors the sky and shore), sea absorption through seaSig
    {
      const BF = ['vec3( 0.012, 0.075, 0.075 )', 'vec3( 0.004, 0.03, 0.065 )', 'vec3( 0.46, 0.43, 0.37 )', 'float F = ( 0.02 + 0.98 * pow( 1.0 - NdV, 5.0 ) ) * mix( 0.55, 1.0, lowSun );'];
      if (BF.every((b) => fs.includes(b))) {
        fs = fs.replace(BF[0], 'mix( vec3( 0.012, 0.075, 0.075 ), vec3( 0.004, 0.036, 0.034 ), bay )').replace(BF[1], 'mix( vec3( 0.004, 0.03, 0.065 ), vec3( 0.002, 0.022, 0.03 ), bay )');
        fs = fs.replace(BF[2], 'mix( vec3( 0.46, 0.43, 0.37 ), vec3( 0.13, 0.14, 0.1 ), bay )');
        fs = fs.replace(BF[3], `${BF[3]} F = mix( F, 0.02 + 0.98 * pow( 1.0 - NdV, 5.0 ), bay );`);
        fs = fs.split('-vec3( 0.42, 0.072, 0.034 )').join('-seaSig').split('-mix( vec3( 0.42, 0.072, 0.034 ),').join('-mix( seaSig,');
        const LP = 'float Lp = dP / max( cv, 0.25 ) + dP / max( cs, 0.35 );';
        if (fs.includes(LP)) fs = fs.replace(LP, 'float dPb = max( dP, bay * 1.4 * smoothstep( 0.04, 0.45, dP ) ); float Lp = dPb / max( cv, 0.25 ) + dPb / max( cs, 0.35 ); // bay: the dock / seawall water reads deep and dark (mock-up 17), beaches still thin out');
        if (fs.includes('vec3 mulC = vec3( 1.0 - Fn ) * Tr * dataK;')) fs = fs.replace('vec3 mulC = vec3( 1.0 - Fn ) * Tr * dataK;', 'vec3 mulC = vec3( 1.0 - Fn ) * Tr * dataK * mix( vec3( 1.0 ), vec3( 0.55, 0.62, 0.6 ), bay ); // bay bed: seagrass and silt over the sand');
        W.bayPatched = true;
      }
    }
    mat.fragmentShader = fs; mat.uniforms.tFresh = uniforms.tFresh; mat.uniforms.uFreshRect = uniforms.uFreshRect; mat.uniforms.uR4 = uniforms.uR4; mat.needsUpdate = true; W.r4Patched = r4;
    return true;
  };
  return W;
}

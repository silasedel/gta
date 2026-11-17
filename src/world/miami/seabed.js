import * as THREE from 'three';
import { vegUniforms } from '../vegetation/materials.js';
import { CAUSTIC_GLSL } from '../ground/caustics.js';
const U_T = vegUniforms.uVegTime; // shared world clock (same as the terrain caustics)

// Visible sea floor around the player: a 2 m grid (240 m square) that follows the player and takes its heights from
// city.seabedDepthAt (the same seabed the swim code uses; ignores bridge decks overhead). Land vertices are tucked just under the land surface, so the
// shoreline becomes a natural underwater slope. Rebuilt a few rows per frame when the player moves, so there is no hitch.
export function createSeabed(game, city) {
  const SIZE = 240, STEP = 2, N = SIZE / STEP + 1, SEA = city.seaLevel ?? -0.12;
  const geoms = [0, 1].map(() => {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, N - 1, N - 1);
    g.rotateX(-Math.PI / 2);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * N * 3), 3));
    return g;
  });
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  // r2-ground: the same soft moving caustics as the terrain under the water (groundShader.js), fading out by 2.5 m depth
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSbT = U_T; sh.uniforms.uSbSea = { value: SEA };
    sh.vertexShader = 'varying vec3 vSbW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vSbW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = CAUSTIC_GLSL + `uniform float uSbT; uniform float uSbSea; varying vec3 vSbW;
float sbH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sbN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sbH(i), sbH(i + vec2(1.0, 0.0)), f.x), mix(sbH(i + vec2(0.0, 1.0)), sbH(i + vec2(1.0, 1.0)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  { vec2 wp = vSbW.xz; float cdp = clamp(uSbSea - vSbW.y, 0.0, 3.0);
    float ca = r2Caustic(wp, uSbT);
    diffuseColor.rgb *= (1.0 + ca * 0.55 * smoothstep(0.02, 0.18, cdp) * (1.0 - smoothstep(1.0, 3.0, cdp))) * mix(0.92, 1.06, sbN(wp * 0.9 + 3.0)); }`);
  };
  mat.customProgramCacheKey = () => 'seabed-caustics';
  const mesh = new THREE.Mesh(geoms[0], mat);
  mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = false; mesh.visible = false;
  mesh.name = 'seabed';
  game.scene.add(mesh);

  // cheap value noise for sand ripples, darker rock and seagrass patches
  const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const SAND = new THREE.Color().setRGB(0.4, 0.37, 0.295), WET = new THREE.Color().setRGB(0.3, 0.28, 0.22) /* linear: the terrain's own wet sand under water */, GRASS = new THREE.Color(0x3f5a2e), ROCK = new THREE.Color(0x6b6558), _c = new THREE.Color();

  let center = null, job = null, cur = 0;
  // r2-ground: the shelf follows the distance to land, measured on the grid itself (one water test per vertex + a chamfer
  // distance pass) instead of 48+ probes per vertex. It runs out ~40 m and deepens smoothly (0.4 m at 1.5 m out, ~1.8 m at
  // 14 m, ~4 m at 28 m), so the depth-colored shallows fade into deep water over tens of meters instead of a step at 14 m.
  const shelfDepth = (r) => 0.08 + r * 0.05 + r * r * 0.0028; // 0.16 m at 1.5 m out (meets the terrain's waterline triangles), 0.33 m at 4 m, 1.3 m at 14 m, 3.6 m at 28 m
  function startBuild(cx, cz) {
    const g = geoms[1 - cur];
    job = { g, cx, cz, row: 0, water: 0, phase: 0, W: new Uint8Array(N * N), D: new Float32Array(N * N) };
  }
  function stepBuild(rows) {
    const j = job, pos = j.g.attributes.position.array, col = j.g.attributes.color.array;
    const x0 = j.cx - SIZE / 2, z0 = j.cz - SIZE / 2;
    if (j.phase === 0) { // water mask, a few rows per frame
      for (let r = 0; r < rows * 2 && j.row < N; r++, j.row++) { const z = z0 + j.row * STEP; for (let i = 0; i < N; i++) j.W[j.row * N + i] = city.isWater && city.isWater(x0 + i * STEP, z) ? 1 : 0; }
      if (j.row < N) return;
      // chamfer distance (m) from every water vertex to the nearest land vertex (grid border counts as far)
      const D = j.D, Wm = j.W, A = STEP, B = STEP * Math.SQRT2; for (let k = 0; k < N * N; k++) D[k] = Wm[k] ? 1e6 : 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const k = y * N + x; let v = D[k]; if (!v) continue;
        if (x > 0) v = Math.min(v, D[k - 1] + A); if (y > 0) { v = Math.min(v, D[k - N] + A); if (x > 0) v = Math.min(v, D[k - N - 1] + B); if (x < N - 1) v = Math.min(v, D[k - N + 1] + B); } D[k] = v; }
      for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) { const k = y * N + x; let v = D[k]; if (!v) continue;
        if (x < N - 1) v = Math.min(v, D[k + 1] + A); if (y < N - 1) { v = Math.min(v, D[k + N] + A); if (x < N - 1) v = Math.min(v, D[k + N + 1] + B); if (x > 0) v = Math.min(v, D[k + N - 1] + B); } D[k] = v; }
      j.phase = 1; j.row = 0; return;
    }
    for (let r = 0; r < rows && j.row < N; r++, j.row++) {
      const z = z0 + j.row * STEP;
      for (let i = 0; i < N; i++) {
        const x = x0 + i * STEP, k = j.row * N + i;
        const water = !!j.W[k];
        let y = water ? SEA - Math.max(0.2, Math.min(city.seabedDepthAt(x, z), j.D[k] < 1e5 ? shelfDepth(Math.max(0, j.D[k] - 0.5)) : 99)) : -0.35; // under land: hidden by the land surface, forms the shore slope
        if (!Number.isFinite(y)) y = SEA - 3;
        if (water) { j.water++; y += (noise(x * 0.35, z * 0.35) - 0.5) * 0.35 * Math.min(1, j.D[k] / 12); }
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        const n1 = noise(x * 0.08, z * 0.08), n2 = noise(x * 0.6 + 17, z * 0.6 - 9);
        _c.copy(SAND).lerp(WET, 0.2 + 0.3 * n2); // pale coral sand like the beach above (r2-ground)
        const far = water ? Math.min(1, Math.max(0, (j.D[k] - 8) / 10)) : 0; // seagrass / rock only away from the beach
        if (n1 > 0.62 && far > 0) _c.lerp(GRASS, Math.min(1, (n1 - 0.62) * 4) * far); // seagrass meadows
        else if (n1 < 0.18 && far > 0) _c.lerp(ROCK, Math.min(1, (0.18 - n1) * 5) * far); // rocky patches
        col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
      }
    }
    if (j.row >= N) {
      j.g.attributes.position.needsUpdate = true; j.g.attributes.color.needsUpdate = true;
      j.g.computeVertexNormals(); j.g.computeBoundingSphere();
      cur = 1 - cur; mesh.geometry = j.g; mesh.visible = j.water > 0;
      center = { x: j.cx, z: j.cz }; job = null;
    }
  }
  function update() {
    const p = game.player?.position; if (!p || !city.seabedDepthAt) return;
    const cx = Math.round(p.x / 20) * 20, cz = Math.round(p.z / 20) * 20;
    // only rebuild when the player is within ~100 m of water (swimming, boating, on a pier, a beach or a coast road): the floor is
    // only visible from (or through) nearby water; the shallows' depth color (ocean.js) reads it too
    const W = city.isWater, nearWater = !!W && (W(p.x, p.z) || [[60, 0], [-60, 0], [0, 60], [0, -60], [100, 0], [-100, 0], [0, 100], [0, -100], [70, 70], [-70, 70], [70, -70], [-70, -70]].some(([a, b]) => W(p.x + a, p.z + b)));
    if (!job && nearWater && (!center || Math.hypot(cx - center.x, cz - center.z) > 40)) startBuild(cx, cz);
    if (job) { if (!center) { while (job) stepBuild(N); } else stepBuild(6); } // first build at once (loading), later builds spread over ~30 frames
  }
  game.updaters.push(update);
  return { mesh, update };
}

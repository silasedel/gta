// r2-perf: hardware tiers. On the first launch (or when the GPU changes) a short GPU benchmark runs behind the loading
// screen, the WebGL renderer string is classified, and both together pick a preset and a frame-rate target:
//   good machines -> High (Ultra on the fastest), target 60 fps;  mid machines -> Medium, target 30;  weak -> Low, 30.
// The pick feeds game.quality (src/render/quality.v2.js) and the dynamic resolution controller (src/render/dynres.v2.js):
// each preset carries its render-scale bounds and target, so the controller holds the target inside them.
// A manual preset in the settings always wins (quality.v2.js keeps it); ?tier=good|mid|low forces a tier for testing.
// OFF by default until verified (shared tree rule): ?tiers=1 or localStorage 'southline.r2.tiers' = '1' turns it on.
// When off, the benchmark still runs on request: game.tiers.bench() -> { ms, score } (used by tools/v2/perf).
// API: game.tiers = { on, tier, gpu, gpuClass, bench(), result, PRESET_TARGETS }
export const order = 7; // right after quality.v2.js (order 6)

const KEY = 'southline.r2.tier';

// render-scale bounds and frame target per preset. High / Ultra never drop below 0.85 (and only while the frame would
// otherwise miss the target); with the output-resolution TAAU the picture at 0.85 reads the same at 1080p.
export const PRESET_TARGETS = {
  ultra: { fps: 60, min: 0.85, max: 1.0 },
  high: { fps: 60, min: 0.85, max: 1.0 },
  medium: { fps: 30, min: 0.7, max: 1.0 },
  low: { fps: 30, min: 0.6, max: 0.9 },
};

// renderer-string classes (ANGLE strings: "ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, ...)",
// "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 ...)", "ANGLE (Intel, Intel(R) UHD Graphics 620 ...)")
export function classifyGpu(s) {
  s = String(s || '');
  if (/SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(s)) return 'low';
  if (/Apple M\d+ (Max|Ultra)/i.test(s)) return 'good';
  if (/Apple M\d+ Pro/i.test(s)) return 'good';
  if (/Apple M[3-9]\b/i.test(s)) return 'mid';
  if (/Apple M[12]\b|Apple GPU|Apple A\d+/i.test(s)) return 'mid';
  if (/RTX\s*[2-5]0[5-9]0|RTX\s*[2-5]0[6-9]0|RX\s*[67][6-9]\d\d|RX\s*[789]\d{3}|Radeon Pro W[67]|Arc A7/i.test(s)) return 'good';
  if (/RTX|GTX\s*16|GTX\s*10[6-8]0|RX\s*[45][6-9]0|RX\s*5[5-7]00|RX\s*6[45]00|Arc/i.test(s)) return 'mid';
  if (/Iris Xe|Radeon(\(TM\))? Graphics|Vega \d|680M|780M|890M/i.test(s)) return 'mid-low';
  if (/Intel|UHD|HD Graphics|Mali|Adreno|GTX\s*(9|7)\d0|MX\d/i.test(s)) return 'low';
  return 'unknown';
}

function gpuString(renderer) {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
  } catch (e) { return ''; }
}

// GPU benchmark: a fixed fragment workload (16 dependent texture taps + ALU, the shape of the game's post and lit passes)
// drawn into a 1920x1080 half-float target, several passes per round, a 1-pixel readPixels after each round to wait for
// the GPU (gl.finish() does not wait under ANGLE-Metal). Returns the median ms per full-screen pass.
export async function runBench(renderer, THREE, { rounds = 9, passes = 6, budgetMs = 3500 } = {}) {
  const W = 1920, H = 1080;
  const rtA = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
  const rtB = rtA.clone();
  const noise = new THREE.DataTexture(new Uint8Array(256 * 256 * 4).map((_, i) => (i * 2654435761) >>> 24), 256, 256);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping; noise.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tPrev: { value: null }, tNoise: { value: noise }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tPrev; uniform sampler2D tNoise; uniform float uT; varying vec2 vUv;
      void main() {
        vec3 acc = vec3(0.0); vec2 uv = vUv;
        for (int i = 0; i < 16; i++) {
          vec4 n = texture2D(tNoise, uv * 3.7 + float(i) * 0.137 + uT);
          uv += (n.xy - 0.5) * 0.004;
          vec3 p = texture2D(tPrev, uv).rgb;
          acc += p * 0.06 + n.rgb * 0.01 + sin(acc.zxy * 3.1 + n.w) * 0.02;
        }
        gl_FragColor = vec4(acc, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const sync = () => { renderer.readRenderTargetPixels(rtSmall, 0, 0, 1, 1, px); };
  const rtSmall = new THREE.WebGLRenderTarget(1, 1);
  const prev = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate;
  const res = [];
  const t0 = performance.now();
  try {
    renderer.shadowMap.autoUpdate = false;
    // warm-up (compile, allocate)
    renderer.setRenderTarget(rtA); renderer.render(sc, cam); renderer.setRenderTarget(rtSmall); renderer.render(sc, cam); sync();
    for (let r = 0; r < rounds && performance.now() - t0 < budgetMs; r++) {
      sync();
      const a = performance.now();
      for (let i = 0; i < passes; i++) {
        mat.uniforms.tPrev.value = (i & 1 ? rtA : rtB).texture; mat.uniforms.uT.value = r * 0.1 + i * 0.01;
        renderer.setRenderTarget(i & 1 ? rtB : rtA); renderer.render(sc, cam);
      }
      renderer.setRenderTarget(rtSmall); renderer.render(sc, cam);
      sync();
      res.push((performance.now() - a) / passes);
      await new Promise((ok) => setTimeout(ok, 0)); // keep the loading screen alive
    }
  } finally {
    renderer.setRenderTarget(prev); renderer.shadowMap.autoUpdate = prevAuto;
    rtA.dispose(); rtB.dispose(); rtSmall.dispose(); noise.dispose(); mat.dispose(); quad.geometry.dispose();
    void gl;
  }
  res.sort((x, y) => x - y);
  const ms = res.length ? res[res.length >> 1] : null;
  return { ms: ms && +ms.toFixed(3), rounds: res.length, spentMs: Math.round(performance.now() - t0) };
}

// reference: the M3 Max (40-core GPU) measured REF_MS per pass. Ratio <= GOOD -> good, <= MID -> mid, else low.
const REF_MS = 0.45, GOOD = 2.6, ULTRA = 1.25, MID = 9;

export function pickTier(gpuClass, benchMs) {
  let byBench = null;
  if (Number.isFinite(benchMs) && benchMs > 0) {
    const k = benchMs / REF_MS;
    byBench = k <= ULTRA ? 'top' : k <= GOOD ? 'good' : k <= MID ? 'mid' : 'low';
  }
  // the benchmark decides; the renderer string only breaks ties / covers a failed benchmark, and never lifts a slow
  // benchmark above 'mid' (shared GPUs, thermal throttling)
  let tier = byBench || ({ good: 'good', mid: 'mid', 'mid-low': 'mid', low: 'low', unknown: 'mid' }[gpuClass] || 'mid');
  if (byBench === 'top' && gpuClass !== 'good' && gpuClass !== 'unknown') tier = 'good';
  if (gpuClass === 'low' && (tier === 'top' || tier === 'good')) tier = 'mid';
  const preset = { top: 'ultra', good: 'high', mid: 'medium', low: 'low' }[tier];
  return { tier, preset, ...PRESET_TARGETS[preset] };
}

export async function initV2(game) {
  const qs = new URLSearchParams(location.search);
  let on = qs.get('tiers') === '1';
  try { on = on || localStorage.getItem('southline.r2.tiers') === '1'; } catch (e) { /* */ }
  const gpu = gpuString(game.renderer);
  const T = game.tiers = { on, gpu, gpuClass: classifyGpu(gpu), tier: null, result: null, PRESET_TARGETS,
    bench: () => runBench(game.renderer, game.THREE),
    // apply a preset's frame target + scale bounds to the dynamic resolution controller
    applyTargets(name) {
      const t = PRESET_TARGETS[name]; if (!t || !game.dynres) return;
      game.dynres.set({ min: t.min, max: t.max, targetMs: 1000 / t.fps });
    },
  };
  if (!on) return;
  try {
    game.on?.('quality:changed', (d) => { try { T.applyTargets(d?.name); } catch (e) { /* */ } });
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { stored = null; }
    let manual = false;
    try { manual = !!JSON.parse(localStorage.getItem('portsolana.v2.quality') || 'null')?.manual; } catch (e) { /* */ }
    const force = qs.get('tier');
    let r = null;
    if (force) r = pickTier(force === 'low' ? 'low' : force === 'mid' ? 'mid' : 'good', force === 'top' ? REF_MS : force === 'good' ? REF_MS * 2 : force === 'mid' ? REF_MS * 5 : REF_MS * 20);
    else if (stored && stored.gpu === gpu && stored.r) r = stored.r;
    else {
      const b = await runBench(game.renderer, game.THREE);
      r = { ...pickTier(T.gpuClass, b.ms), bench: b };
      try { localStorage.setItem(KEY, JSON.stringify({ gpu, r, when: Date.now() })); } catch (e) { /* */ }
    }
    T.result = r; T.tier = r.tier;
    if (game.dynres) game.dynres.on = true;
    if (!manual && game.quality?.set) {
      game.quality.set(r.preset); // not manual: a later manual choice still wins
      game.quality.stats.reason = `tier ${r.tier} (${T.gpuClass}, bench ${r.bench?.ms ?? '-'} ms)`;
      game.quality.tierLocked = true; // quality.v2.js: skip its 60 fps step-down auto-pick (the dynres holds the target)
    }
    T.applyTargets(game.quality?.name || r.preset);
  } catch (e) { console.warn('[tiers] off', e); }
}

// Southline V2: graphics quality presets with a measured auto-pick (playtest-fixes track).
// Presets scale shadows, draw distance, crowd size and character LOD. The resolution is never touched:
// it stays native (see src/render/post.js).
// Auto-pick: on the first load (or when the GPU changes) the game starts on 'ultra'. After loading, it
// measures real frame times for a few windows. While the slowest 2% of frames are over the 60 fps budget, it
// steps down one preset, never below 'low'. The result is stored in localStorage. A manual choice always
// wins and is kept.
// API: game.quality = { presets, current, name, set(name, { manual }), auto(), stats }
// Also listens to 'settings:changed' { key: 'gfxPreset' } from the settings menu (src/ui/settings).
import { LOD_CFG } from '../player/characterModel.js';

export const order = 6;

const KEY = 'portsolana.v2.quality';

const PX_2K = 2560 * 1440; // r6: High / Extra High render at 2K or better (drawing buffer and internal picture)

export const PRESETS = {
  ultra: {
    // look track: sharpen (grade pass), TAA (one pass + copy), internal render scale range for the frame-time governor
    // (post.js; canvas size never changes). Haze, grade and ground wear cost about 0 and are on in every preset.
    look: { sharpen: 0.3, taa: 'always', taaSharpen: 0.3, scaleMin: 1.0, scaleMax: 1.0, msaa: 4, minPx: PX_2K },
    // r2-render (user: "turn anti-aliasing on heavy and up the resolution"; the M3 Max class is CPU-bound with GPU headroom)
    label: 'Ultra',
    // render resolution: native (Retina up to 2x), mid (between), min (just enough for 1920x1080 internal)
    dpr: 'native', // r2-render: the display's own ratio (Retina 2x); was 'min' (1080p-class, upscaled by the browser: soft and jagged)
    shadow: { size: 4096, radius: 150, dynSize: 2048, dynRadius: 42 },
    far: 8000,
    crowd: 240,
    pedScale: 1,
    lod: { maxFull: 6, budget: 380000 },
    ao: true,
    gtao: false, // GTAO re-renders the whole scene (measured 21 ms on M3 Max): off in every preset
  },
  high: {
    // look track: sharpen (grade pass), TAA (one pass + copy), internal render scale range for the frame-time governor
    // (post.js; canvas size never changes). Haze, grade and ground wear cost about 0 and are on in every preset.
    look: { sharpen: 0.3, taa: 'always', taaSharpen: 0.3, scaleMin: 0.8, scaleMax: 1.0, msaa: 2, minPx: PX_2K }, // r6 (user: "make the res 2k"): the governor never goes under 0.8 of native and never under 2560x1440 internal (minPx, post.js scaleFloor); it only steps down at all on GPU-bound slow frames. Was 0.65 with a 1920x1080 floor. // // user (Nov 18): the app was 'super laggy' at Retina 2x + MSAA 4x with no headroom: the frame-time governor may now drop the internal scale to 0.65 when frames are slow (full res when light), MSAA 2x (TAA resolves the rest)
    label: 'High',
    // render resolution: native (Retina up to 2x), mid (between), min (just enough for 1920x1080 internal)
    // look track: native on High so Retina is crisp by default; the render-scale governor (post.js) pays for it when GPU-bound
    dpr: 2, // user (Nov 17): full Retina resolution on High too (was 1.5); the GPU has headroom (CPU-bound), dynres still guards heavy frames
    shadow: { size: 4096, radius: 150, dynSize: 2048, dynRadius: 42 },
    far: 8000,
    crowd: 180,
    pedScale: 1,
    lod: { maxFull: 6, budget: 380000 },
    ao: true,
    gtao: false,
  },
  medium: {
    // look track: sharpen (grade pass), TAA (one pass + copy), internal render scale range for the frame-time governor
    // (post.js; canvas size never changes). Haze, grade and ground wear cost about 0 and are on in every preset.
    look: { sharpen: 0.5, taa: 'always', taaSharpen: 0.35, scaleMin: 0.75, scaleMax: 0.9, msaa: 2 },
    label: 'Medium',
    // render resolution: native (Retina up to 2x), mid (between), min (just enough for 1920x1080 internal)
    dpr: 'min',
    shadow: { size: 3072, radius: 120, dynSize: 1536, dynRadius: 36 },
    far: 5000,
    crowd: 170,
    pedScale: 0.8,
    lod: { maxFull: 4, budget: 260000 },
    ao: true,
    gtao: false,
  },
  low: {
    // look track: sharpen (grade pass), TAA (one pass + copy), internal render scale range for the frame-time governor
    // (post.js; canvas size never changes). Haze, grade and ground wear cost about 0 and are on in every preset.
    look: { sharpen: 0.3, taa: 'always', taaSharpen: 0.35, scaleMin: 0.75, scaleMax: 0.85 },
    label: 'Low',
    // render resolution: native (Retina up to 2x), mid (between), min (just enough for 1920x1080 internal)
    dpr: 'min',
    shadow: { size: 2048, radius: 100, dynSize: 1024, dynRadius: 30 },
    far: 3500,
    crowd: 110,
    pedScale: 0.6,
    lod: { maxFull: 3, budget: 160000 },
    ao: false,
    gtao: false,
  },
};
const ORDER = ['ultra', 'high', 'medium', 'low'];

function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
  } catch (e) {
    return '';
  }
}

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    // r2-render: auto results from before Nov 17 15:30 are dropped (they stepped down on CPU-bound frames, which a lower
    // preset cannot speed up: the M3 Max landed on Medium / Low, soft and jagged); manual choices are kept
    if (v && !v.manual && v.rev !== 2) return null;
    // perf track (Nov 19): presets chosen before the frame-time work (the user dropped to Low to fight the lag) are reset
    // once; the game starts on High again (src/ui/settings/store.js resets its copy the same way)
    if (v && v.manual && !v.rev3) return null;
    return v;
  } catch (e) {
    return null;
  }
}

function save(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch (e) {
    // private mode: not persisted
  }
}

export async function initV2(game) {
  const gpu = gpuName(game.renderer);
  const stored = load();
  const stats = {
    gpu,
    windows: [],
    auto: false,
    reason: '',
  };
  const q = {
    presets: PRESETS,
    name: 'ultra',
    current: PRESETS.ultra,
    stats,
    set,
    auto: startAuto,
    dpr: () => dprFor(q.current),
  };
  // device pixel ratio for a preset: never below what gives a 1920x1080-class internal picture (by pixel count)
  // and never above the display's own ratio (capped at 2)
  const RES_OLD = /[?&]res2k=0/.test(location.search); // before/after switch
  function dprFor(p) {
    const native = Math.min(window.devicePixelRatio || 1, 2);
    const css = Math.max(1, window.innerWidth * window.innerHeight);
    const min = Math.min(native, Math.max(1, Math.sqrt((1920 * 1080) / css)));
    // r6 2K presets (look.minPx): never fewer drawing-buffer pixels than 2560x1440, also on a 1x display or in a small
    // window (rendered above the display's ratio and scaled down by the browser: supersampled, still crisp). Cap 2.
    const need = !RES_OLD && p.look?.minPx ? Math.min(2, Math.sqrt(p.look.minPx / css)) : 0;
    if (p.dpr === 'native') {
      return Math.round(Math.max(native, need) * 100) / 100;
    }
    if (typeof p.dpr === 'number') {
      return Math.round(Math.max(need, Math.min(native, Math.max(min, p.dpr))) * 100) / 100;
    }
    if (p.dpr === 'mid') {
      return Math.round((min + (native - min) * 0.5) * 100) / 100;
    }
    return Math.round(min * 100) / 100;
  }
  game.quality = q;

  function apply(name) {
    const p = PRESETS[name];
    if (!p) {
      return false;
    }
    q.name = name;
    q.current = p;
    game.settings = game.settings || {};
    // post.js reads settings.quality for GTAO ('ultra') and contact AO (off on 'low')
    game.settings.quality = name;
    game.settings.ao = p.ao;
    try {
      game.env?.setShadowQuality?.(p.shadow);
    } catch (e) {
      console.warn('[quality] shadows', e);
    }
    try {
      game.post?.fitWindow?.();
    } catch (e) {
      // post not ready yet: it reads game.quality.dpr() itself
    }
    if (game.camera) {
      game.camera.far = p.far;
      game.camera.updateProjectionMatrix();
    }
    try {
      if (game.people?.crowd?.cfg) {
        game.people.crowd.cfg.target = p.crowd;
      }
    } catch (e) {
      // people module missing
    }
    try {
      if (LOD_CFG) {
        LOD_CFG.maxFull = p.lod.maxFull;
        LOD_CFG.budget = p.lod.budget;
      }
    } catch (e) {
      // character module missing
    }
    try {
      game.emit?.('quality:changed', { name, preset: p });
    } catch (e) {
      // listeners must not break this
    }
    return true;
  }

  function set(name, opts = {}) {
    if (!apply(name)) {
      return false;
    }
    if (opts.manual) {
      autoRun = false;
      save({ name, gpu, manual: true, rev3: true });
    }
    return true;
  }

  // ---- measured auto-pick
  let autoRun = false;
  let frames = [];
  let settleT = 0;
  let lastNow = 0;
  const WINDOW_FRAMES = 600; // about 10 s at 60 fps
  function startAuto(from = 'high') {
    apply(from);
    autoRun = true;
    frames = [];
    settleT = 4;
    stats.auto = true;
    stats.windows = [];
  }
  function judge() {
    const f = frames.slice().sort((a, b) => a - b);
    frames = [];
    const n = f.length;
    const avg = f.reduce((a, c) => a + c, 0) / n;
    const p98 = f[Math.floor(n * 0.98)];
    const w = {
      preset: q.name,
      avgMs: +avg.toFixed(2),
      p98Ms: +p98.toFixed(2),
      worstMs: +f[n - 1].toFixed(1),
    };
    stats.windows.push(w);
    // 60 fps budget: the slowest 2% must stay under 18 ms (a 16.7 ms frame plus a little scheduling slack)
    // r2-render: only GPU-bound windows step down. A CPU-bound frame (render submit, game logic) is not faster on a lower
    // preset, it only looks worse (game.perf.cpuMs: rAF start to the end of the render, post.js)
    const cpu = game.perf?.cpuMs ?? 0;
    const gpuBound = !(cpu > 0) || cpu < avg - 3;
    const tooSlow = (p98 > 18.5 || avg > 16.9) && gpuBound;
    const i = ORDER.indexOf(q.name);
    if (tooSlow && i < ORDER.length - 1) {
      apply(ORDER[i + 1]);
      settleT = 4;
      stats.reason = `stepped down: p98 ${w.p98Ms} ms, avg ${w.avgMs} ms on ${w.preset}`;
      return;
    }
    autoRun = false;
    stats.auto = false;
    stats.reason = stats.reason || `kept ${q.name}: p98 ${w.p98Ms} ms, avg ${w.avgMs} ms`;
    save({ name: q.name, gpu, manual: false, measured: w, rev: 2 });
  }
  function tick() {
    const now = performance.now();
    const ms = now - lastNow;
    lastNow = now;
    // r2-perf tiers (src/render/tiers.v2.js, off by default): a tier pick owns the preset; the dynamic resolution holds its target
    if (q.tierLocked) {
      autoRun = false;
      stats.auto = false;
      return;
    }
    if (!autoRun || !game.ready || game.ui?.paused || document.hidden) {
      return;
    }
    if (settleT > 0) {
      settleT -= ms / 1000;
      return;
    }
    // ignore huge gaps (tab switches, debugger) so they do not decide the preset
    if (ms > 0 && ms < 250) {
      frames.push(ms);
    }
    if (frames.length >= WINDOW_FRAMES) {
      judge();
    }
  }
  game.updaters.push(tick);

  game.on?.('settings:changed', (d) => {
    if (d?.key === 'gfxPreset' && PRESETS[d.value]) {
      set(d.value, { manual: true });
    }
  });

  // start: a stored manual choice wins; a stored auto result is reused on the same GPU; otherwise measure
  if (stored && PRESETS[stored.name] && (stored.manual || stored.gpu === gpu)) {
    apply(stored.name);
    stats.reason = stored.manual ? 'manual choice' : 'stored auto result';
    // re-apply once everything (people, characters) exists
    const again = () => {
      if (game.ready) {
        apply(q.name);
      } else {
        setTimeout(again, 500);
      }
    };
    again();
  } else {
    // wait until the game is running before measuring
    const wait = () => {
      if (game.ready) {
        if (!q.tierLocked) startAuto('high'); // r2-perf tiers: the tier pick already chose the preset
        apply(q.name);
      } else {
        setTimeout(wait, 500);
      }
    };
    apply('high');
    wait();
  }
}

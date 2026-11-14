// Port Solana V2: graphics quality presets with a measured auto-pick (playtest-fixes track).
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

export const PRESETS = {
  ultra: {
    // look track: sharpen (grade pass), TAA (one pass + copy), internal render scale range for the frame-time governor
    // (post.js; canvas size never changes). Haze, grade and ground wear cost about 0 and are on in every preset.
    look: { sharpen: 0.3, taa: 'always', taaSharpen: 0.55, scaleMin: 0.85, scaleMax: 1.0, msaa: 4 },
    label: 'Ultra',
    // render resolution: native (Retina up to 2x), mid (between), min (just enough for 1920x1080 internal)
    dpr: 'native',
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
    look: { sharpen: 0.3, taa: 'always', taaSharpen: 0.6, scaleMin: 0.75, scaleMax: 1.0, msaa: 2 }, // 4x measured +2.35 ms at 1600x900; 2x on high
    label: 'High',
    // render resolution: native (Retina up to 2x), mid (between), min (just enough for 1920x1080 internal)
    // look track: native on High so Retina is crisp by default; the render-scale governor (post.js) pays for it when GPU-bound
    dpr: 'native',
    shadow: { size: 4096, radius: 150, dynSize: 2048, dynRadius: 42 },
    far: 8000,
    crowd: 240,
    pedScale: 1,
    lod: { maxFull: 6, budget: 380000 },
    ao: true,
    gtao: false,
  },
  medium: {
    // look track: sharpen (grade pass), TAA (one pass + copy), internal render scale range for the frame-time governor
    // (post.js; canvas size never changes). Haze, grade and ground wear cost about 0 and are on in every preset.
    look: { sharpen: 0.5, taa: 'auto', taaSharpen: 1.1, scaleMin: 0.75, scaleMax: 0.9, msaa: 2 },
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
    look: { sharpen: 0.35, taa: 'auto', taaSharpen: 1.1, scaleMin: 0.75, scaleMax: 0.85 },
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
    return JSON.parse(localStorage.getItem(KEY) || 'null');
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
  function dprFor(p) {
    const native = Math.min(window.devicePixelRatio || 1, 2);
    const css = Math.max(1, window.innerWidth * window.innerHeight);
    const min = Math.min(native, Math.max(1, Math.sqrt((1920 * 1080) / css)));
    if (p.dpr === 'native') {
      return native;
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
      save({ name, gpu, manual: true });
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
    const tooSlow = p98 > 18.5 || avg > 16.9;
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
    save({ name: q.name, gpu, manual: false, measured: w });
  }
  function tick() {
    const now = performance.now();
    const ms = now - lastNow;
    lastNow = now;
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
        startAuto('high');
        apply(q.name);
      } else {
        setTimeout(wait, 500);
      }
    };
    apply('high');
    wait();
  }
}

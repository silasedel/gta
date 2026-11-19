// r2-perf: dynamic resolution. Holds the preset's target frame time (33.3 ms on mid machines, 16.7 ms on good ones) by
// scaling the INTERNAL render resolution inside the preset's bounds; the canvas never changes size and TAA reconstructs
// the picture (r2-render owns the TAA; an output-resolution TAAU is drafted in src/render/taau.v2.js).
// Hook: post.js governor() hands the scale decision to game.dynres.pick() while game.dynres.active, and uses
// game.dynres.floor instead of the fixed 1920x1080 floor. OFF by default until verified: ?dynres=1 or game.dynres.on = true
// (or the tier picker in src/render/tiers.v2.js turns it on for a preset that allows it).
// Signals, in order of trust:
//   1. frame interval (rAF), always; vsync-capped frames read as "at target" (no headroom information)
//   2. CPU work of the frame (game.perf.workAvg): a frame that is CPU-bound gains nothing from fewer pixels, so the
//      controller never scales down when CPU work alone fills the budget
//   3. whole-frame GPU timer (game.gpuFrameMs, src/render/perfHud.v2.js) only when it passes a sanity check against the
//      frame interval (under ANGLE-Metal the timer misreports by 5-10x; measured Nov 17)
// Control: every 0.5 s window, p90 frame time vs target. Down when two windows in a row are over (1.03 x target) and the
// frame is not CPU-bound; step size from the area law (pixels ~ GPU ms), 0.05 to 0.15. Up by 0.05 after 3 s of clear
// headroom (or after 4 s at the vsync cap with GPU headroom); a raise that is undone within 6 s blocks raises for 30 s,
// so the scale never pumps. Quantized to 0.05 (each step resets TAA history in the current TAA; fine at this rate).
// API: game.dynres = { on, active, scale, floor, min, max, targetMs, stats, pick(ms, perf), set({ min, max, targetMs }) }
export const order = 3; // before tiers.v2.js (7) and quality.v2.js (6) so both can set targets

export async function initV2(game) {
  const qs = new URLSearchParams(location.search);
  const D = (game.dynres = {
    on: qs.get('dynres') === '1',
    get active() {
      return D.on && !game.ui?.paused && !document.hidden;
    },
    scale: 1,
    min: 0.85,
    max: 1,
    floor: 0.5,
    targetMs: 1000 / 60,
    stats: {
      downs: 0,
      ups: 0,
      blocked: 0,
      cpuBound: false,
      gpuTrusted: false,
      p90: 0,
      lastChange: 0,
    },
    set(cfg = {}) {
      if (Number.isFinite(cfg.min)) D.min = Math.max(0.5, Math.min(1, cfg.min));
      if (Number.isFinite(cfg.max)) D.max = Math.max(D.min, Math.min(1, cfg.max));
      if (Number.isFinite(cfg.targetMs)) D.targetMs = cfg.targetMs;
      D.floor = D.min;
      D.scale = Math.min(D.max, Math.max(D.min, D.scale));
    },
    pick,
  });
  if (qs.get('dynresTarget')) D.targetMs = 1000 / Math.max(10, +qs.get('dynresTarget'));
  if (qs.get('dynresMin')) D.set({ min: +qs.get('dynresMin') });

  let timerOk = true;
  try {
    const gl = game.renderer.getContext(),
      dbg = gl.getExtension('WEBGL_debug_renderer_info');
    timerOk = !/Metal/i.test(
      String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    );
  } catch (e) {
    timerOk = false;
  }
  D.timerOk = timerOk;
  const win = [];
  let winT = 0,
    over = 0,
    under = 0,
    atCap = 0,
    sinceUp = 99,
    block = 0,
    t = 0;
  const q05 = (x) => Math.round(x * 20) / 20;
  function p90(a) {
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.floor(s.length * 0.9)] || 0;
  }

  // called by post.js governor() once per rendered frame with the frame interval (ms); returns the scale to use
  function pick(ms) {
    if (!(ms > 0 && ms < 120)) return D.scale;
    game.gpuTimerWanted = timerOk; // never on ANGLE-Metal: its timer misreports and splits command buffers
    t += ms / 1000;
    winT += ms;
    sinceUp += ms / 1000;
    block -= ms / 1000;
    win.push(ms);
    if (winT < 500) return D.scale;
    const T = D.targetMs,
      f = p90(win),
      n = win.length;
    win.length = 0;
    winT = 0;
    const work = game.perf?.workAvg || 0;
    const g = game.gpuFrameMs;
    // the GPU timer is trusted only while it is plausible: never above the frame interval by more than 20 %
    const gpuTrusted = timerOk && Number.isFinite(g) && g > 0.3 && g < f * 1.2;
    const cpuBound = work > T * 0.95;
    D.stats.p90 = +f.toFixed(1);
    D.stats.cpuBound = cpuBound;
    D.stats.gpuTrusted = gpuTrusted;
    D.stats.gpuMs = gpuTrusted ? +g.toFixed(2) : null;
    void n;
    // vsync cap: frames land on the refresh interval (16.7 / 8.3 ms) even with headroom
    const capped = f <= T * 1.03;
    if (f > T * 1.03 && !cpuBound) {
      over++;
      under = 0;
      atCap = 0;
    } else if (capped) {
      over = 0;
      const head = gpuTrusted ? g < T * 0.7 : f < T * 0.8 || work < T * 0.6;
      if (head) under++;
      else under = 0;
      atCap++;
    } else {
      over = 0;
      under = 0;
    }
    let s = D.scale;
    if (over >= 2 && s > D.min) {
      // pixels ~ GPU time: scale area by target / measured, never more than 0.15 in one step
      const gpu = gpuTrusted ? g : f;
      const want = s * Math.sqrt((T * 0.92) / Math.max(T, gpu));
      s = Math.max(D.min, q05(Math.max(s - 0.15, Math.min(s - 0.05, want))));
      over = 0;
      if (sinceUp < 6) {
        block = 30;
        D.stats.blocked++;
      }
      D.stats.downs++;
    } else if (under >= 6 && s < D.max && block <= 0) {
      s = Math.min(D.max, q05(s + 0.05));
      under = 0;
      sinceUp = 0;
      D.stats.ups++;
    }
    if (s !== D.scale) {
      D.scale = s;
      D.stats.lastChange = +t.toFixed(1);
    }
    void atCap;
    return D.scale;
  }
}

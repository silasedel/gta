// r2-perf: debug performance overlay (?perf=1, or game.perfHud.show(true) / Shift+F3 at run time). Inert otherwise:
// with the overlay closed it costs one boolean check per frame.
// Shows: fps and frame ms, a frame-time graph (last 240 frames, 16.7 / 33.3 ms guide lines, CPU work as a second line),
// GPU ms of the whole frame (one EXT_disjoint_timer_query_webgl2 query around post.render, when available), render
// scale (dynamic resolution), preset and target, draw calls, triangles, shader programs, textures, geometries, physics
// bodies (active / total), and the five most expensive systems (game.perf.sysAvg, main.js).
// API: game.perfHud = { shown, show(bool), gpuMs, frames }  game.gpuFrameMs (EMA, null when no timer)
export const order = 950;

const N = 240;

export async function initV2(game) {
  const qs = new URLSearchParams(location.search);
  const hud = (game.perfHud = {
    shown: false,
    gpuMs: null,
    frames: new Float32Array(N),
    work: new Float32Array(N),
    gpu: new Float32Array(N),
    i: 0,
    show,
  });
  let el = null,
    cv = null,
    ctx = null,
    txt = null;
  let lastNow = performance.now(),
    acc = 0;

  // ---- whole-frame GPU timer (only while the HUD is shown or dynres asks for it via game.gpuTimerWanted)
  const r = game.renderer,
    gl = r.getContext();
  let ext = null;
  try {
    ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  } catch (e) {
    ext = null;
  }
  const pend = [];
  let qActive = null;
  function pollQueries() {
    for (let i = 0; i < pend.length; i++) {
      const q = pend[i];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break; // results arrive in order
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
      pend.splice(i, 1);
      i--;
      if (!disjoint && ms > 0 && ms < 500) {
        hud.gpuMs = hud.gpuMs == null ? ms : hud.gpuMs + (ms - hud.gpuMs) * 0.1;
        game.gpuFrameMs = hud.gpuMs;
        hud.lastGpu = ms;
      }
    }
  }
  try {
    const post = game.post,
      pr = post?.render;
    if (ext && pr) {
      post.render = function (dt) {
        const want = hud.shown || game.gpuTimerWanted;
        if (want && !qActive && pend.length < 6) {
          try {
            pollQueries();
            qActive = gl.createQuery();
            gl.beginQuery(ext.TIME_ELAPSED_EXT, qActive);
          } catch (e) {
            qActive = null;
          }
        }
        try {
          return pr.apply(this, arguments);
        } finally {
          if (qActive) {
            try {
              gl.endQuery(ext.TIME_ELAPSED_EXT);
              pend.push(qActive);
            } catch (e) {
              /* */
            }
            qActive = null;
          }
        }
      };
    }
  } catch (e) {
    console.warn('[perfHud] gpu timer', e);
  }

  function build() {
    el = document.createElement('div');
    el.style.cssText =
      'position:fixed;right:8px;top:8px;z-index:10000;font:11px/1.35 ui-monospace,Menlo,monospace;color:#e6f2ea;background:rgba(6,10,14,.72);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre;min-width:250px';
    cv = document.createElement('canvas');
    cv.width = N;
    cv.height = 70;
    cv.style.cssText = 'display:block;width:240px;height:70px;margin-bottom:4px';
    txt = document.createElement('div');
    el.append(cv, txt);
    document.body.appendChild(el);
    ctx = cv.getContext('2d');
  }
  function show(on) {
    hud.shown = !!on;
    if (hud.shown && !el) build();
    if (el) el.style.display = hud.shown ? 'block' : 'none';
  }
  if (qs.get('perf') === '1' || qs.has('perfhud')) show(true);
  addEventListener('keydown', (e) => {
    if (e.code === 'F3' && e.shiftKey) {
      e.preventDefault();
      show(!hud.shown);
    }
  });

  function draw() {
    const W = N,
      H = 70,
      maxMs = 50;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, W, H);
    const y = (ms) => H - Math.min(1, ms / maxMs) * H;
    ctx.strokeStyle = 'rgba(120,220,140,.55)';
    ctx.beginPath();
    ctx.moveTo(0, y(16.7));
    ctx.lineTo(W, y(16.7));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,200,90,.55)';
    ctx.beginPath();
    ctx.moveTo(0, y(33.3));
    ctx.lineTo(W, y(33.3));
    ctx.stroke();
    const line = (arr, col) => {
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let k = 0; k < N; k++) {
        const v = arr[(hud.i + k) % N];
        const yy = y(v);
        if (k === 0) ctx.moveTo(k, yy);
        else ctx.lineTo(k, yy);
      }
      ctx.stroke();
    };
    // frame bars
    for (let k = 0; k < N; k++) {
      const v = hud.frames[(hud.i + k) % N];
      ctx.fillStyle = v > 33.4 ? '#ff6b5a' : v > 17.5 ? '#f2c14e' : '#5fd38a';
      ctx.fillRect(k, y(v), 1, H - y(v));
    }
    line(hud.work, 'rgba(120,180,255,.95)');
    if (hud.gpuMs != null) line(hud.gpu, 'rgba(255,120,230,.95)');
  }
  game.updaters.push(function perfHudTick() {
    const now = performance.now();
    const ms = now - lastNow;
    lastNow = now;
    if (!hud.shown) return;
    if (ext && pend.length) {
      try {
        pollQueries();
      } catch (e) {
        /* */
      }
    }
    hud.frames[hud.i] = ms;
    hud.work[hud.i] = game.perf?.workAvg || 0;
    hud.gpu[hud.i] = hud.lastGpu || 0;
    hud.i = (hud.i + 1) % N;
    acc += ms;
    if (acc < 250) return;
    acc = 0;
    draw();
    const P = game.perf || {},
      ri = r.info,
      s = P.sysAvg || {};
    let n = 0,
      sum = 0;
    const fr = [];
    for (let k = 0; k < 60; k++) {
      const v = hud.frames[(hud.i - 1 - k + N) % N];
      if (v > 0) {
        fr.push(v);
        sum += v;
        n++;
      }
    }
    fr.sort((x, y) => x - y);
    const avg = n ? sum / n : 0,
      p95 = fr[Math.floor(fr.length * 0.95)] || 0;
    const top = Object.entries(s)
      .filter(([k]) => k !== 'render')
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .map(
        ([k, v]) =>
          `  ${k
            .replace(/^upd:|^fixed:/, '')
            .slice(0, 22)
            .padEnd(22)} ${v.toFixed(2)}`,
      )
      .join('\n');
    let bodies = '';
    try {
      const W = game.world;
      let act = 0;
      W.bodies.forEach((b) => {
        if (b.isDynamic() && !b.isSleeping()) act++;
      });
      bodies = `${act}/${W.bodies.len()}`;
    } catch (e) {
      /* */
    }
    const dr = game.dynres;
    txt.textContent =
      `${(1000 / Math.max(1, avg)).toFixed(0)} fps  ${avg.toFixed(1)} ms  p95 ${p95.toFixed(1)}\n` +
      `cpu ${(P.workAvg || 0).toFixed(1)} ms  render ${(s.render || 0).toFixed(1)}  gpu ${hud.gpuMs == null ? (ext ? '...' : 'n/a') : hud.gpuMs.toFixed(1)} ms\n` +
      `preset ${game.quality?.name || '?'}  scale ${(game.post?.renderScale ?? 1).toFixed(2)}${dr ? `  dynres ${dr.active ? 'on' : 'off'} ${dr.targetMs?.toFixed?.(1) ?? ''}` : ''}  cap ${game.settings?.fpsLimit || 'off'}\n` +
      `draws ${ri.render.calls}  tris ${(ri.render.triangles / 1e6).toFixed(2)}M  progs ${ri.programs?.length || 0}\n` +
      `tex ${ri.memory.textures}  geo ${ri.memory.geometries}  bodies ${bodies}\n` +
      `cpu by system (ms):\n${top}`;
  });
}

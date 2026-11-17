// In-page performance instrumentation for tools/v2/s1-perf.mjs (installed once with eval; idempotent).
// window.__pf.measure(ms) -> frame intervals, per-frame CPU (rAF work), render CPU, GPU time (timer query if available),
// draw calls and per-group draw-submission cost (main view vs shadow pass), grouped by top-level scene child.
(() => {
  if (window.__pf) return 'already';
  const r = game.renderer, scene = game.scene, gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const top = new WeakMap();
  const cityRoot = () => game.city?.root || null;
  function label(o) {
    let c = o, prev = o;
    while (c.parent && c.parent !== scene) { prev = c; c = c.parent; }
    if (c.parent !== scene) return 'detached';
    if (c === cityRoot()) {
      // city: name the part (tile child) and the mesh, e.g. city/near:furniture/lamp
      const chain = []; for (let x = o; x && x !== c; x = x.parent) chain.push(x);
      const part = chain[chain.length - 2], nm = (x) => (x && (x.name || x.userData?.kind)) || '';
      return 'city/' + (nm(part) || '?') + '/' + (nm(o) || nm(o.parent) || o.type).replace(/[0-9]+/g, '#').slice(0, 40);
    }
    return c.name || c.userData?.name || (c.type + ':' + (c.children[0]?.name || ''));
  }
  function groupOf(o) {
    let g = top.get(o);
    if (!g) { g = label(o) + (o.isSkinnedMesh ? ' [skin]' : o.isInstancedMesh ? ' [inst]' : ''); top.set(o, g); }
    return g;
  }
  const st = { on: false, inShadow: false, frames: 0, groups: {}, renderCalls: 0 };
  const rbd = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
    if (!st.on) return rbd.apply(this, arguments);
    const t = performance.now();
    rbd.apply(this, arguments);
    const d = performance.now() - t;
    const k = groupOf(object);
    const G = st.groups[k] || (st.groups[k] = { n: 0, ms: 0, sn: 0, sms: 0 });
    if (st.inShadow) { G.sn++; G.sms += d; } else { G.n++; G.ms += d; }
  };
  const up = gl.useProgram.bind(gl); let useN = 0;
  gl.useProgram = (p) => { if (st.on) useN++; return up(p); };
  const sm = r.shadowMap, smr = sm.render;
  sm.render = function () { const w = st.inShadow; st.inShadow = true; const t = performance.now(); try { return smr.apply(this, arguments); } finally { st.inShadow = w; st.shadowMs = (st.shadowMs || 0) + performance.now() - t; } };
  // per-frame timing: wrap post.render (CPU of the whole render) and measure GPU with a timer query around it
  const post = game.post, pr = post.render;
  const pendingQ = [];
  const gpu = [];
  post.render = function (dt) {
    let q = null;
    if (st.on && ext && !pendingQ.some((p) => p.active)) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    const t = performance.now();
    try { return pr.apply(this, arguments); } finally {
      const d = performance.now() - t;
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pendingQ.push({ q }); }
      if (st.on) { st.render.push(d); st.calls.push(r.info.render.calls); }
      for (let i = pendingQ.length - 1; i >= 0; i--) {
        const p = pendingQ[i];
        if (gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) {
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(p.q); pendingQ.splice(i, 1);
        }
      }
    }
  };
  const med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  async function measure(ms = 3000, groups = false) {
    st.groups = {}; st.render = []; st.calls = []; st.shadowMs = 0; gpu.length = 0; useN = 0;
    const sys0 = {};
    const ts = [];
    st.on = true;
    await new Promise((res) => { let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    st.on = false;
    ts.shift();
    const n = st.render.length || 1;
    const out = {
      med: +med(ts).toFixed(2), p95: +pct(ts, 0.95).toFixed(2), avg: +(ts.reduce((a, c) => a + c, 0) / ts.length).toFixed(2), frames: ts.length,
      renderMs: +med(st.render).toFixed(2), shadowMs: +(st.shadowMs / n).toFixed(2), gpuMs: gpu.length ? +med(gpu).toFixed(2) : null,
      work: +(game.perf.workAvg || 0).toFixed(2), progSw: Math.round(useN / n), calls: Math.round(med(st.calls)), tris: r.info.render.triangles,
      sys: Object.fromEntries(Object.entries(game.perf.sysAvg || {}).filter(([, v]) => v > 0.2).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => [k, +v.toFixed(2)])),
      q: game.quality?.name, pending: game.city?.streamer?.pending?.() ?? null,
    };
    if (groups) {
      out.groups = Object.entries(st.groups).map(([k, G]) => [k, +(G.n / n).toFixed(1), +(G.ms / n).toFixed(2), +(G.sn / n).toFixed(1), +(G.sms / n).toFixed(2)])
        .sort((x, y) => (y[2] + y[4]) - (x[2] + x[4])).slice(0, 24);
    }
    void sys0;
    return out;
  }
  // ---- GPU time per pass: back-to-back timer queries (one active at a time), segmented at every composer pass and
  // around the shadow-map render. gpuPasses(ms) -> { label: median ms }
  const segQ = []; let segActive = null, segOn = false; const segRes = {};
  function seg(label) {
    if (!ext) return;
    if (segActive) { gl.endQuery(ext.TIME_ELAPSED_EXT); segQ.push(segActive); segActive = null; }
    if (label && segOn) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); segActive = { q, label, f: st.fno }; }
  }
  function segPoll() {
    for (let i = segQ.length - 1; i >= 0; i--) {
      const p = segQ[i];
      if (gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { const fr = (segRes[p.f] ||= {}); fr[p.label] = (fr[p.label] || 0) + gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6; }
        gl.deleteQuery(p.q); segQ.splice(i, 1);
      }
    }
  }
  st.fno = 0;
  for (const [i, p] of game.post.composer.passes.entries()) {
    const pr0 = p.render, name = i + ':' + (p.material?.name || p.name || p.constructor.name || 'pass') + (p === game.post.taa ? 'TAA' : '');
    p.render = function () { if (segOn) seg(name); return pr0.apply(this, arguments); };
  }
  {
    const smr2 = sm.render;
    sm.render = function () { if (!segOn) return smr2.apply(this, arguments); const cur = segActive?.label; seg('shadow'); try { return smr2.apply(this, arguments); } finally { seg(cur || 'scene'); } };
  }
  // programs created inside a frame's render (= synchronous compiles the player waits for), vs. outside (precompiled)
  // (counted inside renderer.render only: a precompile right before the frame uses renderer.compile and is not counted)
  st.renderProgs = []; const rr0 = r.render;
  r.render = function () { const n0 = r.info.programs.length; try { return rr0.apply(this, arguments); } finally { const d = r.info.programs.length - n0; if (d > 0 && st.renderProgs.length < 200) for (const p of r.info.programs.slice(n0)) st.renderProgs.push(p.name || '?'); } };
  const pr2 = post.render;
  post.render = function () { if (segOn) { st.fno++; segPoll(); } try { return pr2.apply(this, arguments); } finally { if (segOn) seg(null); } };
  async function gpuPasses(ms = 3000) {
    for (const k in segRes) delete segRes[k];
    segOn = true;
    await new Promise((res) => setTimeout(res, ms));
    segOn = false; seg(null);
    await new Promise((res) => setTimeout(res, 300)); segPoll();
    const per = {};
    for (const fr of Object.values(segRes)) for (const [k, v] of Object.entries(fr)) (per[k] ||= []).push(v);
    const out = {}; let tot = [];
    for (const [k, v] of Object.entries(per)) out[k] = +med(v).toFixed(2);
    for (const fr of Object.values(segRes)) tot.push(Object.values(fr).reduce((a, c) => a + c, 0));
    out.TOTAL = +med(tot).toFixed(2); out.frames = tot.length;
    return out;
  }
  window.__pf = { st, measure, gpuPasses, ext: !!ext };
  return 'installed gpuTimer=' + !!ext;
})()

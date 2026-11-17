// r2-perf in-page profiler (installed once with eval by tools/v2/perf/r2-prof.mjs; idempotent).
// window.__r2p:
//   frames(ms)        -> frame intervals (med / p95 / p99), CPU per system (game.perf.sysAvg), draw calls, triangles
//   gpuQuery(ms)      -> GPU ms per pass from EXT_disjoint_timer_query_webgl2 (back-to-back segments, one active at a time)
//   gpuSync(ms)       -> GPU ms per pass from a serialized frame: gl.finish() before and after every pass, wall time
//                        minus the pass's own CPU issue time (robust where timer queries are not; costs a stall)
//   cpuSplit(ms)      -> CPU of the render call split: matrix update, shadow-map render, main-view submit, post passes
//   counts()          -> programs, textures (+ estimated GPU MB), geometries (+ MB), render targets, scene census,
//                        physics bodies (active / sleeping), peds, vehicles, skinned meshes
//   groups(ms)        -> per top-level group: draws and CPU submit ms in the main view and the shadow pass
(() => {
  if (window.__r2p) return 'already';
  const r = game.renderer, scene = game.scene, gl = r.getContext(), post = game.post;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const R2 = (x) => +(+x).toFixed(2);
  const waitFrames = (ms) => new Promise((res) => setTimeout(res, ms));

  // ---------- pass wrappers (one wrapper per composer pass + the shadow map; modes switch what they do)
  const st = { mode: 'off', fno: 0, segQ: [], segActive: null, q: {}, sync: {}, cpu: {}, inShadow: false };
  const passes = post.composer.passes;
  const passName = (p, i) => i + ':' + (p === post.taa ? 'TAA' : p === post.bloom ? 'Bloom' : p === post.smaa ? 'SMAA' : p === post.grade ? 'Grade' : p === post.ao ? 'ContactAO' : p === post.gtao ? 'GTAO' : p === post.ssr ? 'SSR' : p === post.shafts ? 'Shafts' : (p.material?.name || p.name || p.constructor.name || 'pass'));
  function seg(label) {
    if (!ext) return;
    if (st.segActive) { gl.endQuery(ext.TIME_ELAPSED_EXT); st.segQ.push(st.segActive); st.segActive = null; }
    if (label) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); st.segActive = { q, label, f: st.fno }; }
  }
  function segPoll() {
    for (let i = st.segQ.length - 1; i >= 0; i--) {
      const p = st.segQ[i];
      if (gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { const fr = (st.q[p.f] ||= {}); fr[p.label] = (fr[p.label] || 0) + gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6; }
        gl.deleteQuery(p.q); st.segQ.splice(i, 1);
      }
    }
  }
  // a real GPU sync: gl.finish() returns early under ANGLE-Metal (measured), a 1-pixel readPixels waits for the queue
  const syncFbo = gl.createFramebuffer(), syncTex = gl.createTexture(), syncPx = new Uint8Array(4);
  { const pt = gl.getParameter(gl.TEXTURE_BINDING_2D), pf = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindTexture(gl.TEXTURE_2D, syncTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, syncFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, syncTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pf); gl.bindTexture(gl.TEXTURE_2D, pt); }
  function gsync() {
    const pd = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING), pr = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), pb = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    if (pb) gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, syncFbo); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, pr); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, pd);
    if (pb) gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pb);
  }
  const add = (m, f, k, v) => { const fr = (m[f] ||= {}); fr[k] = (fr[k] || 0) + v; };
  let curPass = null;
  passes.forEach((p, i) => {
    const name = passName(p, i), pr0 = p.render;
    p.render = function () {
      if (!p.enabled) return pr0.apply(this, arguments);
      curPass = name;
      if (st.mode === 'query') seg(name);
      if (st.mode === 'sync') { gsync(); const t = performance.now(); const sh0 = st.shadowWall || 0; try { return pr0.apply(this, arguments); } finally { const c = performance.now() - t; gsync(); const w = performance.now() - t; add(st.sync, st.fno, name, w - ((st.shadowWall || 0) - sh0)); add(st.cpu, st.fno, name, c); } }
      if (st.mode === 'cpu') { const t = performance.now(); try { return pr0.apply(this, arguments); } finally { add(st.cpu, st.fno, name, performance.now() - t); } }
      return pr0.apply(this, arguments);
    };
  });
  const sm = r.shadowMap, smr = sm.render;
  sm.render = function () {
    if (st.mode === 'query') { const cur = st.segActive?.label; seg('shadow'); try { return smr.apply(this, arguments); } finally { seg(cur || 'scene'); } }
    if (st.mode === 'sync') { gsync(); const t = performance.now(); try { return smr.apply(this, arguments); } finally { const c = performance.now() - t; gsync(); const w = performance.now() - t; st.shadowWall = (st.shadowWall || 0) + w; add(st.sync, st.fno, 'shadow', w); add(st.cpu, st.fno, 'shadow', c); } }
    if (st.mode === 'cpu') { const t = performance.now(); try { return smr.apply(this, arguments); } finally { add(st.cpu, st.fno, 'shadow', performance.now() - t); } }
    return smr.apply(this, arguments);
  };
  // CPU split of the main render: scene.updateMatrixWorld (three.js calls it inside every render)
  const umw = scene.updateMatrixWorld;
  scene.updateMatrixWorld = function () { if (st.mode !== 'cpu') return umw.apply(this, arguments); const t = performance.now(); try { return umw.apply(this, arguments); } finally { add(st.cpu, st.fno, 'matrixWorld', performance.now() - t); } };
  const pr = post.render;
  post.render = function () {
    if (st.mode !== 'off') { st.fno++; if (st.mode === 'query') segPoll(); }
    const t = performance.now();
    try { return pr.apply(this, arguments); } finally {
      if (st.mode === 'query') seg(null);
      if (st.mode !== 'off') { add(st.cpu, st.fno, 'TOTALcpu', performance.now() - t); st.shadowWall = 0; }
      if (st.mode === 'sync') { gsync(); }
    }
  };
  function summarize(m) {
    const per = {}; const tot = [];
    for (const fr of Object.values(m)) { let s = 0; for (const [k, v] of Object.entries(fr)) { (per[k] ||= []).push(v); if (k !== 'TOTALcpu' && k !== 'matrixWorld') s += v; } tot.push(s); }
    const out = {}; for (const [k, v] of Object.entries(per)) out[k] = R2(med(v));
    out.TOTAL = R2(med(tot)); out.frames = tot.length; return out;
  }
  async function run(mode, ms) {
    st.q = {}; st.sync = {}; st.cpu = {}; st.mode = mode;
    await waitFrames(ms);
    st.mode = 'off'; if (st.segActive) seg(null);
    if (mode === 'query') { await waitFrames(400); segPoll(); }
  }
  async function gpuQuery(ms = 3000) { if (!ext) return null; await run('query', ms); return summarize(st.q); }
  async function gpuSync(ms = 3000) {
    await run('sync', ms);
    const w = summarize(st.sync), c = summarize(st.cpu), g = {};
    // GPU estimate per pass: serialized wall time minus the pass's CPU issue time (the scene pass issues for ~CPU ms)
    for (const k of Object.keys(w)) if (k !== 'TOTAL' && k !== 'frames') g[k] = R2(Math.max(0, w[k] - (c[k] || 0) * (k.includes('RenderPass') || k === 'shadow' ? 1 : 0)));
    g.TOTAL = R2(Object.entries(g).reduce((a, [, v]) => a + v, 0));
    return { wall: w, cpu: c, gpu: g };
  }
  async function cpuSplit(ms = 3000) { await run('cpu', ms); return summarize(st.cpu); }

  // ---------- frame timing
  async function frames(ms = 3000) {
    const ts = [], calls = [], tris = [];
    await new Promise((res) => { let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; calls.push(r.info.render.calls); tris.push(r.info.render.triangles); if (n - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    ts.shift();
    return {
      med: R2(med(ts)), p95: R2(pct(ts, 0.95)), p99: R2(pct(ts, 0.99)), max: R2(Math.max(...ts)), n: ts.length,
      work: R2(game.perf.workAvg || 0), calls: Math.round(med(calls)), tris: Math.round(med(tris)),
      sys: Object.fromEntries(Object.entries(game.perf.sysAvg || {}).filter(([, v]) => v > 0.12).sort((x, y) => y[1] - x[1]).slice(0, 22).map(([k, v]) => [k, R2(v)])),
      resScale: post.renderScale, internal: post.internalSize, pr: r.getPixelRatio(), q: game.quality?.name,
    };
  }

  // ---------- resource census
  const BPP = { [THREE_U8()]: 1 };
  function THREE_U8() { return 1009; }
  function texBytes(t) {
    try {
      if (t.isRenderTargetTexture) return 0;
      const img = t.image; if (!img) return 0;
      if (t.isCompressedTexture || t.isCompressedArrayTexture) { let s = 0; for (const m of t.mipmaps || []) s += m.data?.byteLength || 0; return s; }
      const w = img.width || img.videoWidth || 0, h = img.height || img.videoHeight || 0, d = img.depth || 1;
      const T = game.THREE;
      const ch = t.format === T.RGBAFormat ? 4 : t.format === T.RGFormat ? 2 : t.format === T.RedFormat ? 1 : t.format === T.RGBFormat ? 4 : 4;
      const bpc = t.type === T.FloatType ? 4 : t.type === T.HalfFloatType ? 2 : 1;
      const mip = t.generateMipmaps !== false && t.minFilter !== T.NearestFilter && t.minFilter !== T.LinearFilter ? 4 / 3 : 1;
      return w * h * d * ch * bpc * mip;
    } catch (e) { return 0; }
  }
  void BPP;
  function counts() {
    const T = game.THREE;
    const tex = new Map(), geo = new Map();
    const c = { meshes: 0, visibleMeshes: 0, instanced: 0, instances: 0, skinned: 0, skinnedVisible: 0, castShadow: 0, transparent: 0, points: 0, lines: 0, lights: 0, objects: 0, materials: new Set() };
    const vis = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
    scene.traverse((o) => {
      c.objects++;
      if (o.isLight) c.lights++;
      if (o.isPoints) c.points++;
      if (o.isLine) c.lines++;
      if (!o.isMesh) return;
      c.meshes++;
      const v = vis(o); if (v) c.visibleMeshes++;
      if (o.isInstancedMesh) { c.instanced++; c.instances += o.count; }
      if (o.isSkinnedMesh) { c.skinned++; if (v) c.skinnedVisible++; }
      if (o.castShadow && v) c.castShadow++;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m) continue; c.materials.add(m); if (m.transparent && v) c.transparent++;
        for (const k in m) { const t = m[k]; if (t && t.isTexture && !tex.has(t.source || t)) tex.set(t.source || t, texBytes(t)); }
        if (m.uniforms) for (const k in m.uniforms) { const t = m.uniforms[k]?.value; if (t && t.isTexture && !tex.has(t.source || t)) tex.set(t.source || t, texBytes(t)); }
      }
      // geometry bytes, each underlying array counted once (interleaved / shared attributes)
      const g = o.geometry; if (g) { const arrs = []; for (const k in g.attributes) { const at = g.attributes[k]; arrs.push(at.data ? at.data.array : at.array); } if (g.index) arrs.push(g.index.array); if (o.isInstancedMesh) arrs.push(o.instanceMatrix.array); for (const ar of arrs) if (ar && !geo.has(ar)) geo.set(ar, ar.byteLength); }
    });
    if (scene.environment) tex.set(scene.environment, 0);
    let tb = 0; for (const v of tex.values()) tb += v;
    const big = [...tex.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([t, b]) => { const im = t.data || t.image || t; return [(t.name || im?.src || im?.currentSrc || '').toString().split('/').slice(-2).join('/').slice(0, 60), (im?.width || 0) + 'x' + (im?.height || 0), Math.round(b / 1048576)]; });
    const hist = {}; for (const [t, b] of tex.entries()) { const im = t.data || t.image || t; const w = Math.max(im?.width || 0, im?.height || 0); const k = w >= 4096 ? '4k+' : w >= 2048 ? '2k' : w >= 1024 ? '1k' : w >= 512 ? '512' : 'small'; (hist[k] ||= [0, 0]); hist[k][0]++; hist[k][1] += Math.round(b / 1048576); }
    let gb = 0; for (const v of geo.values()) gb += v;
    // render targets of the post chain (approximate: 8 bytes per pixel for half-float RGBA + 4 for depth)
    const [iw, ih] = post.internalSize || [0, 0];
    const W = game.world;
    let active = 0, sleeping = 0, dynamic = 0, kinematic = 0, fixed = 0;
    try { W.bodies.forEach((b) => { if (b.isDynamic()) { dynamic++; if (b.isSleeping()) sleeping++; else active++; } else if (b.isKinematic()) kinematic++; else fixed++; }); } catch (e) { /* */ }
    return {
      gpu: gpuName, timerExt: !!ext,
      programs: r.info.programs?.length || 0, texturesLive: r.info.memory.textures, geometriesLive: r.info.memory.geometries,
      sceneTextures: tex.size, texMB: Math.round(tb / 1048576), texBySize: hist, texBiggest: big, sceneGeometries: geo.size, geoMB: Math.round(gb / 1048576),
      postRTsMB: Math.round(iw * ih * (8 * 3 + 4 * 2 + 8 * 4) / 1048576), shadowMaps: (() => { let n = 0, px = 0; scene.traverse((o) => { if (o.isLight && o.castShadow && o.shadow?.map) { n++; px += o.shadow.mapSize.x * o.shadow.mapSize.y; } }); return { n, MB: Math.round(px * 4 / 1048576) }; })(),
      ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v instanceof Set ? v.size : v])),
      bodies: { total: W?.bodies?.len?.() ?? 0, colliders: W?.colliders?.len?.() ?? 0, dynamic, active, sleeping, kinematic, fixed },
      peds: game.peds?.list?.length ?? null, crowd: game.people?.crowd?.list?.length ?? game.people?.crowd?.count ?? null, vehicles: game.vehicles?.list?.length ?? null,
      tiles: game.city?.streamer?.tiles?.size ?? null, pending: game.city?.streamer?.pending?.() ?? null,
      jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  }

  // ---------- per-group CPU submit (main view vs shadow) and draw counts
  const top = new WeakMap();
  function label(o) {
    let c = o, prev = o;
    while (c.parent && c.parent !== scene) { prev = c; c = c.parent; }
    void prev;
    if (c.parent !== scene) return 'detached';
    if (c === game.city?.root) {
      const chain = []; for (let x = o; x && x !== c; x = x.parent) chain.push(x);
      const part = chain[chain.length - 2], nm = (x) => (x && (x.name || x.userData?.kind)) || '';
      const mn = (x) => (x?.material && !Array.isArray(x.material) ? x.material.name : '') || '';
      return 'city/' + (nm(part) || nm(o) || nm(o.parent) || ('mat:' + mn(o)) || '?').replace(/[0-9_-]+/g, '#').slice(0, 34);
    }
    return (c.name || c.userData?.name || (c.type + ':' + (c.children[0]?.name || ''))).replace(/[0-9]+/g, '#').slice(0, 40);
  }
  const gst = { on: false, g: {}, n: 0 };
  const rbd = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, sc, geometry, material, object) {
    if (!gst.on) return rbd.apply(this, arguments);
    const t = performance.now();
    rbd.apply(this, arguments);
    const d = performance.now() - t;
    let k = top.get(object); if (!k) { k = label(object) + (object.isSkinnedMesh ? ' [skin]' : object.isInstancedMesh ? ' [inst]' : ''); top.set(object, k); }
    const G = gst.g[k] || (gst.g[k] = { n: 0, ms: 0, sn: 0, sms: 0, tri: 0 });
    const ic = object.isInstancedMesh ? object.count : 1;
    const tri = ((geometry.index ? geometry.index.count : geometry.attributes.position?.count || 0) / 3) * ic;
    if (st.inShadowG) { G.sn++; G.sms += d; } else { G.n++; G.ms += d; G.tri += tri; }
  };
  const smr2 = sm.render;
  sm.render = function () { const w = st.inShadowG; st.inShadowG = true; try { return smr2.apply(this, arguments); } finally { st.inShadowG = w; } };
  const pr3 = post.render;
  post.render = function () { if (gst.on) gst.n++; return pr3.apply(this, arguments); };
  async function groups(ms = 2500) {
    gst.g = {}; gst.n = 0; gst.on = true; await waitFrames(ms); gst.on = false;
    const n = gst.n || 1;
    return Object.entries(gst.g).map(([k, G]) => ({ k, draws: R2(G.n / n), ms: R2(G.ms / n), sdraws: R2(G.sn / n), sms: R2(G.sms / n), ktri: Math.round(G.tri / n / 1000) }))
      .sort((x, y) => (y.ms + y.sms) - (x.ms + x.sms)).slice(0, 30);
  }

  window.__r2p = { frames, gpuQuery, gpuSync, cpuSplit, counts, groups, ext: !!ext, gpu: gpuName };
  return 'installed timer=' + !!ext + ' gpu=' + gpuName;
})()

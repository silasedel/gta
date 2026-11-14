// PORT SOLANA: applies the graphics / display settings the settings store marks owner 'ui' and that need the engine
// (main-menu track). Uses the look track's presets (game.quality) and never edits src/render:
//   gfxPreset         -> game.quality.set(name, { manual })   (quality.v2.js also listens; 'custom' keeps the last preset)
//   resolutionScale   -> multiplies game.quality.dpr() (the renderer pixel ratio post.js fits to)
//   fpsLimit          -> game.frameGate (main.js skips frames that come too early)
//   shadows           -> game.env.setShadowQuality + sun.castShadow
//   renderDistance    -> camera.far scale (re-applied after every preset change)
//   bloom, ambientOcclusion -> post bloom pass / game.settings.ao
//   showFps           -> small frame-rate counter
//   uiScale           -> also scales the legacy HUD (#ps-hud) corner groups
const SHADOW = { low: { size: 1024, radius: 90, dynSize: 1024, dynRadius: 26 }, medium: { size: 2048, radius: 120, dynSize: 1536, dynRadius: 34 }, high: { size: 4096, radius: 150, dynSize: 2048, dynRadius: 42 }, ultra: { size: 4096, radius: 190, dynSize: 2048, dynRadius: 52 } };
const DIST = { near: 0.45, medium: 0.7, far: 1, ultra: 1.25 };

export function createGraphics(game, settings) {
  const S = (k) => settings.get(k);
  // ---- render scale on top of the preset's pixel ratio
  const q = game.quality;
  if (q && !q.__pmScaled) {
    const base = q.dpr;
    q.dpr = () => Math.max(0.5, Math.min(2, base() * (S('resolutionScale') || 1)));
    q.__pmScaled = true;
  }
  const refit = () => { try { game.post?.fitWindow?.(); } catch (e) { /* */ } };
  // ---- frame cap: main.js asks game.frameGate(now) before each frame
  let nextAt = 0;
  game.frameGate = (now) => {
    const cap = +S('fpsLimit') || 0;
    if (!cap) return true;
    const step = 1000 / cap;
    if (now + 1.5 < nextAt) return false;
    nextAt = Math.max(nextAt + step, now - step);
    return true;
  };
  // ---- shadows / draw distance (after any preset change too)
  function applyShadows() {
    const v = S('shadows'), env = game.env;
    try {
      if (env?.sun) env.sun.castShadow = v !== 'off';
      if (v !== 'off' && SHADOW[v]) env?.setShadowQuality?.(SHADOW[v]);
    } catch (e) { console.warn('[graphics] shadows', e); }
  }
  function applyDistance() {
    const cam = game.camera; if (!cam) return;
    const far = (game.quality?.current?.far || 8000) * (DIST[S('renderDistance')] ?? 1);
    if (Math.abs(cam.far - far) > 1) { cam.far = far; cam.updateProjectionMatrix(); }
    game.settings.renderDistanceScale = DIST[S('renderDistance')] ?? 1;
  }
  function applyEffects() {
    if (game.post?.bloom) game.post.bloom.enabled = S('bloom') !== false;
    if (S('ambientOcclusion') === false) game.settings.ao = false; else if (game.quality?.current) game.settings.ao = game.quality.current.ao;
  }
  // ---- FPS counter
  const fpsEl = document.createElement('div');
  fpsEl.className = 'pm-fps';
  fpsEl.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9998;font:700 13px/1 var(--ps-cond);letter-spacing:.12em;color:#f3ede2;background:rgba(5,8,14,.55);padding:6px 9px;border-radius:4px;pointer-events:none;display:none;font-variant-numeric:tabular-nums';
  document.body.appendChild(fpsEl);
  let fAcc = 0, fN = 0, fLast = performance.now();
  (function fpsLoop(now) {
    requestAnimationFrame(fpsLoop);
    if (!S('showFps')) { if (fpsEl.style.display !== 'none') fpsEl.style.display = 'none'; return; }
    fN++; fAcc += now - fLast; fLast = now;
    if (fAcc > 500) { const fps = (fN * 1000) / fAcc; const r = game.perf?.fps; fpsEl.textContent = Math.round(r || fps) + ' FPS'; fpsEl.style.display = 'block'; fAcc = 0; fN = 0; }
  })(performance.now());
  // ---- legacy HUD scale: each corner group scales toward its own screen corner
  function applyHudScale() {
    const hud = document.getElementById('ps-hud'); if (!hud) return;
    const s = S('uiScale') || 1;
    for (const c of hud.children) {
      if (/ps-pause|ps-title|ps-phone|ps-death/.test(c.className)) continue;
      if (s === 1) { c.style.removeProperty('scale'); continue; }
      const r = c.getBoundingClientRect(); if (!r.width) continue;
      const cx = (r.left + r.right) / 2 / innerWidth, cy = (r.top + r.bottom) / 2 / innerHeight;
      c.style.transformOrigin = `${cx < 0.4 ? 'left' : cx > 0.6 ? 'right' : 'center'} ${cy < 0.4 ? 'top' : cy > 0.6 ? 'bottom' : 'center'}`;
      c.style.scale = String(s);
    }
  }
  settings.on('*', ({ key }) => {
    if (key === 'resolutionScale') refit();
    else if (key === 'shadows') applyShadows();
    else if (key === 'renderDistance') applyDistance();
    else if (key === 'bloom' || key === 'ambientOcclusion') applyEffects();
    else if (key === 'uiScale') applyHudScale();
    else if (key === 'gfxPreset') { const v = S('gfxPreset'); if (v !== 'custom' && game.quality?.presets?.[v]) game.quality.set(v, { manual: true }); }
  });
  game.on?.('quality:changed', () => { applyShadows(); applyDistance(); applyEffects(); });
  addEventListener('resize', () => setTimeout(applyHudScale, 50));
  const all = () => { refit(); applyShadows(); applyDistance(); applyEffects(); applyHudScale(); };
  all();
  return { applyAll: all, applyHudScale };
}

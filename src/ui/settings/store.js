// PORT SOLANA UI: settings store. Persists every setting, applies it live, and publishes 'settings:changed'.
//   const s = createSettings(game, { bindings });  s.get('fov');  s.set('fov', 70);  s.on('fov' | '*', fn);
// Values are mirrored into game.settings[key]. Other tracks either read game.settings[key] each frame or listen:
//   game.on('settings:changed', ({ key, value, previous, all }) => …)
// When core-systems' game.settingsStore exists (adopt()), keys it defines are read from and written to it, so there
// is one value per key; everything else is stored on this device in localStorage.
import { SCHEMA, PRESETS, PRESET_KEYS, DEFAULTS, RENDER_DISTANCE, allItems } from './schema.js';
import { emitter, store as ls, clamp } from '../core/dom.js';

const KEY = 'portsolana.v2.settings';

export function createSettings(game, opts = {}) {
  const ev = emitter();
  const items = new Map(allItems().map((i) => [i.key, i]));
  const bindings = opts.bindings || null;
  let roots = [];
  let ext = null;                        // game.settingsStore (core-systems), once adopted
  const extKeys = new Set();
  const saved = ls.get(KEY, null) || {};
  if (!ls.get(KEY, null)) { // one-time migration from v1
    const old = ls.get('portsolana.settings', null);
    if (old) { if (isFinite(old.mouseSens)) saved.mouseSens = old.mouseSens; if (isFinite(old.fov)) saved.fov = old.fov; if (old.northUp) saved.minimapMode = 'north'; }
  }
  const values = { ...DEFAULTS };
  for (const [k, v] of Object.entries(saved)) if (items.has(k)) values[k] = coerce(items.get(k), v);
  values.fullscreen = false;
  game.settings = game.settings || {};
  let firstRun = !ls.get(KEY, null);

  function coerce(it, v) {
    if (it.type === 'range') { v = +v; if (!isFinite(v)) return it.default; return clamp(Math.round(v / it.step) * it.step, it.min, it.max); }
    if (it.type === 'toggle') return !!v;
    if (it.type === 'choice') return it.options.some((o) => o.value === v) ? v : (it.options.find((o) => String(o.value) === String(v))?.value ?? it.default);
    return v;
  }
  function persist() { const out = {}; for (const [k, it] of items) if (!it.volatile && !extKeys.has(k)) out[k] = values[k]; ls.set(KEY, out); }
  function mirror(k) {
    const S = game.settings, v = values[k];
    S[k] = v;
    if (k === 'minimapMode') S.northUp = v === 'north';
    if (k === 'gfxPreset') S.quality = v === 'low' || v === 'medium' ? 'medium' : 'high';
    if (k === 'renderDistance') S.renderDistanceScale = RENDER_DISTANCE[v] ?? 1;
    if (k.startsWith('vol')) { S.audio = S.audio || {}; S.audio[items.get(k).bus] = v; }
  }

  // ---------------------------------------------------------------- live application of the settings src/ui owns
  let basePR = null;
  function applyResolution() {
    const r = game.renderer; if (!r?.setPixelRatio) return;
    if (game.quality?.dpr && game.post?.fitWindow) { game.post.fitWindow(); return; } // the look track's DPR (scaled by ui/menu/graphics.js)
    if (basePR == null) basePR = Math.min(window.devicePixelRatio || 1, 1.5);
    const pr = clamp(basePR * values.resolutionScale, 0.35, 3);
    if (Math.abs(r.getPixelRatio() - pr) < 1e-3) return;
    r.setPixelRatio(pr);
    try { r.setSize(innerWidth, innerHeight); game.post?.setSize?.(innerWidth, innerHeight); } catch (e) { /* */ }
  }
  let focusMuted = false;
  function applyVolume() {
    const A = game.audio; if (!A) return;
    const master = focusMuted ? 0 : values.volMaster;
    try { A.setVolume?.(master); } catch (e) { /* */ }
    for (const [k, it] of items) if (it.bus && it.bus !== 'master') { try { (A.setBusVolume || A.setBus)?.call(A, it.bus, values[k]); } catch (e) { /* */ } }
  }
  function applyRoot() {
    for (const root of roots) {
      root.style.setProperty('--ui-scale', String(values.uiScale));
      root.style.setProperty('--safe-x', `calc(${(values.safeZone * 100).toFixed(2)}vw + 36 * var(--u))`);
      root.style.setProperty('--safe-y', `calc(${(values.safeZone * 100).toFixed(2)}vh + 28 * var(--u))`);
      root.classList.toggle('ps-cb-deuter', values.colorblind === 'deuter');
      root.classList.toggle('ps-cb-protan', values.colorblind === 'protan');
      root.classList.toggle('ps-cb-tritan', values.colorblind === 'tritan');
      root.classList.toggle('ps-cb-high', !!values.highContrast);
      root.classList.toggle('ps-reduced', !!values.reducedMotion);
      root.classList.toggle('ps-noflash', !!values.reduceFlashes);
      root.classList.toggle('ps-hud-centered', !!values.hudCentered);
      root.dataset.hud = values.hudMode; root.dataset.subs = values.subtitleSize; root.dataset.mmsize = values.minimapSize; root.dataset.lang = values.language;
    }
  }
  function applyBindings() {
    bindings?.configure?.({ toggle: { sprint: values.sprintMode === 'toggle', aim: values.aimMode === 'toggle', crouch: values.crouchMode === 'toggle' }, invertY: !!values.invertY, padSens: values.padSens, padDeadzone: values.padDeadzone, padInvertY: !!values.padInvertY, vibration: !!values.vibration });
    if (bindings && bindings.layout !== values.padLayout) bindings.setLayout?.(values.padLayout);
  }
  function apply(k) {
    switch (k) {
      case 'resolutionScale': applyResolution(); break;
      case 'fov': if (game.camera && !game.cameraOverride) { /* main.js eases the camera to game.settings.fov every frame */ } break;
      case 'fullscreen': {
        const on = !!document.fullscreenElement;
        if (values.fullscreen && !on) document.documentElement.requestFullscreen?.().catch(() => { values.fullscreen = false; mirror('fullscreen'); ev.emit('fullscreen', false); ev.emit('*', { key: 'fullscreen', value: false }); });
        else if (!values.fullscreen && on) document.exitFullscreen?.();
        break;
      }
      case 'volMaster': case 'volMusic': case 'volRadio': case 'volSfx': case 'volVehicles': case 'volAmbience': case 'volVoice': case 'volUi': case 'volVoiceChat': applyVolume(); break;
      case 'sprintMode': case 'aimMode': case 'crouchMode': case 'invertY': case 'padSens': case 'padDeadzone': case 'padInvertY': case 'vibration': case 'padLayout': applyBindings(); break;
      case 'uiScale': case 'safeZone': case 'hudCentered': case 'colorblind': case 'highContrast': case 'reducedMotion': case 'reduceFlashes': case 'hudMode': case 'subtitleSize': case 'minimapSize': case 'language': applyRoot(); break;
      case 'dayMinutes': try { if (game.time && 'dayMinutes' in game.time && game.time.dayMinutes !== values.dayMinutes) game.time.dayMinutes = values.dayMinutes; } catch (e) { /* */ } break;
      default: break;
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', () => { const on = !!document.fullscreenElement; if (values.fullscreen !== on) { values.fullscreen = on; mirror('fullscreen'); ev.emit('fullscreen', on); ev.emit('*', { key: 'fullscreen', value: on }); } });
    const focus = () => { const m = values.muteOnFocusLoss && (document.hidden || !document.hasFocus()); if (m !== focusMuted) { focusMuted = m; applyVolume(); } };
    document.addEventListener('visibilitychange', focus); window.addEventListener('blur', focus); window.addEventListener('focus', focus);
    window.addEventListener('resize', () => { if (basePR != null) requestAnimationFrame(applyResolution); });
  }

  // ---------------------------------------------------------------- set / get
  function setRaw(k, v, how) {
    const it = items.get(k); if (!it) return false;
    v = coerce(it, v);
    const prev = values[k];
    if (prev === v) return false;
    values[k] = v; mirror(k);
    try { apply(k); } catch (e) { console.error('[settings apply ' + k + ']', e); }
    if (how !== 'ext' && extKeys.has(k)) { try { ext.set(k, v); } catch (e) { /* */ } }
    const d = { key: k, value: v, previous: prev, all: values };
    ev.emit(k, d); ev.emit('*', d);
    try { game.emit?.('settings:changed', d); } catch (e) { /* */ }
    return true;
  }
  function set(k, v) {
    if (k === 'gfxPreset') return applyPreset(v);
    const ch = setRaw(k, v);
    if (ch && PRESET_KEYS.includes(k) && values.gfxPreset !== 'custom' && PRESETS[values.gfxPreset]?.[k] !== values[k]) setRaw('gfxPreset', 'custom');
    if (ch) persist();
    return ch;
  }
  function applyPreset(name) {
    const p = PRESETS[name];
    if (p) for (const [k, v] of Object.entries(p)) setRaw(k, v);
    const ch = setRaw('gfxPreset', p ? name : 'custom');
    persist(); return ch;
  }
  /** Looks at the GPU and the measured frame rate and returns { preset, gpu, reason }. */
  function detect() {
    let gpu = '', tier = 2;
    try {
      const gl = game.renderer?.getContext?.() || document.createElement('canvas').getContext('webgl2');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) || '');
    } catch (e) { /* */ }
    const g = gpu.toLowerCase(), cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
    if (/swiftshader|llvmpipe|software|basic render/.test(g)) tier = 0;
    else if (/apple m\d+ (max|ultra)|rtx (30[789]|40[6789]|50)|rx (69|79)|radeon pro w/.test(g)) tier = 3;
    else if (/apple m\d+ pro|apple m[2-9]|rtx|rx (6[6-8]|7[6-8])|gtx 1(07|08)|arc a7/.test(g)) tier = 2.5;
    else if (/apple m1|apple gpu|gtx|rx 5|iris xe|radeon/.test(g)) tier = 2;
    else if (/intel|uhd|hd graphics|mali|adreno/.test(g)) tier = 1;
    if (cores <= 4 || mem <= 4) tier = Math.min(tier, 1.5);
    const fps = game.perf?.fps;
    let reason = gpu ? gpu.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 80) : 'Unknown graphics chip';
    if (fps && game.clock?.elapsed > 8) { if (fps < 35) { tier = Math.min(tier, tier >= 3 ? 2 : tier - 1); reason += ` · ${Math.round(fps)} fps measured`; } else if (fps > 58 && tier < 3 && tier >= 2) { tier += 0.5; reason += ` · ${Math.round(fps)} fps measured`; } }
    const preset = tier >= 3 ? 'ultra' : tier >= 2 ? 'high' : tier >= 1 ? 'medium' : 'low';
    return { preset, gpu, reason };
  }
  function reset(tabId) {
    for (const [k, it] of items) { if (tabId && it.tab !== tabId) continue; if (k === 'fullscreen') continue; setRaw(k, it.default); }
    if (!tabId || tabId === 'controls') bindings?.resetAll?.();
    persist();
  }
  /** Connect core-systems' store: its keys become the source of truth for the keys both sides know. */
  function adopt(store2) {
    if (!store2 || ext === store2 || typeof store2.get !== 'function') return;
    ext = store2;
    let sch = []; try { sch = store2.schema?.() || []; } catch (e) { /* */ }
    for (const d of sch) {
      const it = items.get(d.key); if (!it) continue;
      extKeys.add(d.key);
      if (it.type === 'choice' && Array.isArray(d.options) && d.options.length) { const known = new Map(it.options.map((o) => [String(o.value), o])); it.options = d.options.map((o) => known.get(String(o)) || { value: o, label: String(o).replace(/^./, (c) => c.toUpperCase()) }); }
      if (it.type === 'range') { if (isFinite(d.min)) it.min = d.min; if (isFinite(d.max)) it.max = d.max; }
      try { const v = store2.get(d.key); if (v !== undefined) setRaw(d.key, v, 'ext'); } catch (e) { /* */ }
    }
    try { store2.onChange?.('*', (value, key) => { if (items.has(key)) setRaw(key, value, 'ext'); ev.emit('external', { key, value }); }); } catch (e) { /* */ }
    persist(); ev.emit('adopted', store2);
  }
  /** Settings defined by other tracks in game.settingsStore that this schema does not show: [{ key, label, group, type, value, … }]. */
  function external() { if (!ext?.schema) return []; try { return ext.schema().filter((d) => !items.has(d.key)); } catch (e) { return []; } }

  for (const k of items.keys()) mirror(k);
  const api = {
    schema: SCHEMA, presets: PRESETS,
    item: (k) => items.get(k),
    get: (k) => values[k],
    set, all: () => ({ ...values }), values,
    on: ev.on, applyPreset, detect, reset, adopt, external,
    get externalStore() { return ext; },
    /** Root elements that receive the scale / colorblind / reduced-motion classes. */
    attach(root) { if (root && !roots.includes(root)) { roots.push(root); applyRoot(); } },
    /** Apply everything (call once the renderer and audio exist). */
    applyAll() { applyRoot(); applyBindings(); applyResolution(); applyVolume(); for (const k of items.keys()) mirror(k); },
    get firstRun() { return firstRun; },
    /** First launch: choose a preset from the hardware. */
    firstRunDetect() { if (!firstRun) return null; firstRun = false; const d = detect(); applyPreset(d.preset); return d; },
    formatValue(k, v = values[k]) { const it = items.get(k); if (!it) return String(v); if (it.type === 'range') return it.fmt ? it.fmt(v) : String(v); if (it.type === 'toggle') return v ? 'On' : 'Off'; return it.options?.find((o) => o.value === v)?.label ?? String(v); },
  };
  return api;
}

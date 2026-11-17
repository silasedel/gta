// Southline boot progress (r2-web). The loading bar is weighted by how long each boot phase really takes, not by step
// count (the old fixed milestones jumped to 30 % in a second, then sat at 95 % through a minute of shaders and warm-up).
//   - Phase weights: src/core/loadWeights.json (medians of measured boots), then a running average of this browser's own
//     boots in localStorage ('sl.loadWeights.v1'), so the bar learns the player's machine and connection.
//   - Inside a phase the fraction comes from the phase's expected duration (an easing curve that never reaches the end
//     of the phase early), moved further by counters with a known total: shader programs linked / created, warm-up
//     frames, tiles built around the spawn. Files downloaded / requested in the phase are shown in the label.
//   - The label under the bar names the phase and its counter ("Loading textures 41/96", "Compiling shaders 140/212",
//     "Building Key Largo 5/7"). The value never goes backward.
// main.js: LP.begin(name) / LP.end(name) around every boot stage (stage() / safe()), LP.sub(fraction, label) inside long
// steps, LP.finish() at READY. Nothing here changes what loads or in which order.
import DEFAULTS from './loadWeights.json';

const KEY = 'sl.loadWeights.v1';
const UNKNOWN_MS = 25;
const now = () => performance.now();

// ---------------------------------------------------------------- network counters (what is in flight, by kind)
const kindOf = (u) => {
  const p = String(u || '').split('?')[0].toLowerCase();
  if (/\.(glb|gltf|bin|drc|fbx)$/.test(p)) return 'models';
  if (/\.(jpe?g|png|webp|ktx2|hdr|exr|avif)$/.test(p)) return 'textures';
  if (/\.(ogg|wav|mp3|aac|m4a)$/.test(p)) return 'sounds';
  if (/\.json$/.test(p) || /\/miami\//.test(p)) return 'data';
  return null;
};
const NET = { started: { models: 0, textures: 0, sounds: 0, data: 0 }, done: { models: 0, textures: 0, sounds: 0, data: 0 }, bytes: 0 };
function track(kind, promise) {
  if (!kind) return;
  NET.started[kind]++;
  const fin = () => { NET.done[kind]++; };
  promise.then(fin, fin);
}
let netInstalled = false;
function installNet() {
  if (netInstalled || typeof window === 'undefined') return;
  netInstalled = true;
  try {
    const of = window.fetch;
    window.fetch = function (input, init) {
      const p = of.call(this, input, init);
      try { track(kindOf(typeof input === 'string' ? input : input?.url || String(input)), p); } catch (e) { /* counting only */ }
      return p;
    };
  } catch (e) { /* no fetch counting */ }
  try {
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (d?.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true, get: d.get,
        set(v) {
          try {
            const k = typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') ? kindOf(v) : null;
            if (k) track(k, new Promise((res) => { this.addEventListener('load', res, { once: true }); this.addEventListener('error', res, { once: true }); }));
          } catch (e) { /* counting only */ }
          d.set.call(this, v);
        },
      });
    }
  } catch (e) { /* no image counting */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) NET.bytes += e.transferSize || 0; }).observe({ type: 'resource', buffered: true }); } catch (e) { /* */ }
}

// ---------------------------------------------------------------- weights
function loadWeights() {
  const w = Object.assign({}, DEFAULTS.ms || {});
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') for (const [k, v] of Object.entries(s)) if (Number.isFinite(v) && v >= 0) w[k] = v; } catch (e) { /* defaults */ }
  return w;
}

// ---------------------------------------------------------------- labels
const NAMES = {
  rapier: 'Starting physics', env: 'Building the sky', miami: 'Loading the map', city: 'Loading the map', chars: 'Loading characters',
  playerModel: 'Loading Nico', vehicles: 'Loading cars', npcAtlas: 'Preparing people', peds: 'Populating the streets',
  interiors: 'Opening stores', gameplay: 'Setting up missions', hud: 'Final touches', post: 'Final touches',
  shaders: 'Compiling shaders', warmup: 'Warming up',
};
const INIT_NAMES = [
  [/nicoHouse/, "Building Nico's house"], [/keysSign/, 'Building the Keys sign'], [/keysBar/, 'Building the Keys bar'],
  [/dressing/, 'Dressing the streets'], [/towns/, 'Building the towns'], [/houses/, 'Building houses'], [/vegetation|grass/, 'Planting trees'],
  [/signs/, 'Putting up signs'], [/people|arch|npc/, 'Preparing people'], [/vehicles|hero|physics/, 'Tuning the cars'], [/ground|sand|beach/, 'Shaping the ground'],
];
function labelOf(name) {
  if (NAMES[name]) return NAMES[name];
  if (name.startsWith('v2:')) return 'Loading game systems';
  if (name.startsWith('init:')) { for (const [re, l] of INIT_NAMES) if (re.test(name)) return l; return 'Setting up game systems'; }
  return 'Loading';
}

// ---------------------------------------------------------------- progress
export function createLoadProgress() {
  installNet();
  const W = loadWeights();
  const t0 = now();
  const st = {
    order: [], cur: null, curT: 0, curW: 0, curNet: null, doneW: 0, durations: {}, sub: null, subLabel: '', shown: 0,
    msg: '', samples: [], finished: false, error: '',
  };
  // the expected total: every phase this browser has seen (weights), at least the sum of what has run so far
  const totalW = () => { let s = 0; for (const v of Object.values(W)) s += v; return Math.max(s, st.doneW + st.curW + 1); };
  const wOf = (name) => (Number.isFinite(W[name]) ? W[name] : UNKNOWN_MS);

  function begin(name) {
    if (st.cur) end(st.cur.name);
    st.cur = { name }; st.curT = now(); st.curW = wOf(name); st.sub = null; st.subLabel = ''; st.probe = null;
    st.curNet = { started: { ...NET.started }, done: { ...NET.done } };
  }
  function end(name) {
    if (!st.cur || (name && st.cur.name !== name)) return;
    const d = now() - st.curT;
    st.durations[st.cur.name] = (st.durations[st.cur.name] || 0) + d;
    st.doneW += st.curW; st.cur = null; st.curW = 0; st.sub = null; st.subLabel = ''; st.probe = null;
  }
  // a counter read on every bar update while the current phase runs: fn() -> { f: 0..1, label }
  function probe(fn) { st.probe = fn; }
  // explicit sub-progress inside the current phase (0..1) and its label (e.g. "Compiling shaders 140/212")
  function sub(f, label) { if (Number.isFinite(f)) st.sub = Math.max(st.sub || 0, Math.min(1, f)); if (label != null) st.subLabel = label; }

  // network share of the current phase: files finished / requested since the phase began, and the busiest kind
  function netInPhase() {
    if (!st.curNet) return null;
    let s = 0, d = 0, best = null, bestPend = 0;
    for (const k of Object.keys(NET.started)) {
      const ks = NET.started[k] - st.curNet.started[k], kd = Math.min(ks, NET.done[k] - st.curNet.done[k]);
      s += ks; d += kd;
      if (ks - kd > bestPend || (!best && ks > 0)) { bestPend = ks - kd; best = { kind: k, s: ks, d: kd }; }
    }
    return s ? { f: d / s, s, d, best, pending: s - d } : null;
  }

  function value() {
    if (st.finished) return 100;
    let f = 0, label = st.cur ? labelOf(st.cur.name) : st.msg;
    if (st.cur) {
      const el = now() - st.curT, exp = Math.max(30, st.curW);
      // time share: 74 % of the phase at its expected duration, still moving (slower) when it runs long, never past 95 %
      const fTime = 0.95 * (1 - Math.exp(-1.5 * el / exp));
      const net = netInPhase();
      if (st.probe) { try { const r = st.probe(); if (r) sub(r.f, r.label); } catch (e) { st.probe = null; } }
      // counters with a known total (shaders linked / created, warm-up frames, spawn tiles) move it further when ahead of
      // the time share. Files done / requested is shown in the label only: its total grows as the phase requests more,
      // so as a fraction it read 15/16 = 94 % at the start of a 6 s phase and parked the bar.
      if (st.sub != null) f = Math.max(st.sub * 0.98, fTime);
      else f = fTime;
      if (st.subLabel) label = st.subLabel;
      else if (net && net.pending > 0 && net.best) label = `${label} · ${net.best.kind} ${net.best.d}/${net.best.s}`;
    }
    const v = Math.min(99.5, 100 * (st.doneW + st.curW * f) / totalW());
    st.shown = Math.max(st.shown, v);
    st.label = label;
    return st.shown;
  }
  function finish() {
    if (st.cur) end(st.cur.name);
    st.finished = true; st.shown = 100;
    // running average of this browser's real phase times (the next boot's weights)
    try {
      const prev = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      const next = {};
      for (const [k, d] of Object.entries(st.durations)) { const p = Number.isFinite(prev[k]) ? prev[k] : wOf(k); next[k] = Math.round(p + 0.35 * (d - p)); }
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) { /* private mode: defaults next time */ }
  }
  // keep a progress-vs-time trace for tools (window.__loadProgress.samples: [ms since navigation, value, label])
  const api = {
    begin, end, sub, probe, finish, value,
    get label() { return st.label || ''; },
    msg(t) { st.msg = t; if (/^ERROR/.test(t)) st.error = t; },
    get error() { return st.error; },
    get durations() { return st.durations; },
    get samples() { return st.samples; },
    weights: W,
    net: NET,
    sample() { const v = value(); const last = st.samples[st.samples.length - 1]; const lab = st.label || ''; if (!last || v - last[1] >= 0.2 || lab !== last[2] || now() - last[0] > 1000) st.samples.push([Math.round(now()), +v.toFixed(2), lab]); return v; },
  };
  try { window.__loadProgress = api; } catch (e) { /* */ }
  return api;
}

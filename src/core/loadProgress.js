// Southline boot progress (r2-web). The loading bar is weighted by how long each boot phase really takes on this machine
// and this line, not by step count (the old fixed milestones jumped to 30 % in a second, then sat at 95 %).
//   - A phase's expected duration = its download (bytes / the measured download speed) + its CPU time.
//     CPU times: src/core/loadWeights.json (dev boots), then this browser's running average (localStorage).
//     Bytes per phase: boot-bytes.json next to index.html (web build: tools/v2/web/build-pages.mjs, from a throttled
//     profile of the built site), then this browser's own boots. Speed: measured live (bytes / time since the first
//     request), starting from this browser's last speed or ~25 Mbps on a first visit. On a slow line the download
//     phases dominate the bar; on dev (instant downloads) the CPU times do.
//   - Inside a phase: max(time share, bytes received in the phase / its bytes, counters with a known total: shader
//     programs linked / created, warm-up frames, tiles built around the spawn). Never goes backward.
//   - The label under the bar: "Downloading 214 / 509 MB" while a phase is downloading, else the phase and its counter
//     ("Compiling shaders 140/212", "Building Key Largo 5/7 tiles").
// main.js: LP.begin(name) / LP.end(name) around every boot stage (stage() / safe()), LP.sub(fraction, label) inside long
// steps, LP.finish() at READY. Nothing here changes what loads or in which order. ?lpnet=0: time weights only.
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
const NET = { started: { models: 0, textures: 0, sounds: 0, data: 0 }, done: { models: 0, textures: 0, sounds: 0, data: 0 }, bytes: 0, wire: 0, t0: 0, tLast: 0 };
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
  // bytes received: every finished resource (compressed size on the wire; cache hits count as instantly received)
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (/^(blob|data):/.test(e.name)) continue;
        const b = e.encodedBodySize || e.transferSize || 0;
        if (!b) continue;
        NET.bytes += b; NET.wire += e.transferSize || 0;
        if (!NET.t0 || e.startTime < NET.t0) NET.t0 = Math.max(1, e.startTime);
        NET.tLast = Math.max(NET.tLast, e.responseEnd || e.startTime + e.duration);
      }
    }).observe({ type: 'resource', buffered: true });
  } catch (e) { /* */ }
}

// ---------------------------------------------------------------- bytes per phase (web build)
// boot-bytes.json (written next to index.html by tools/v2/web/build-pages.mjs from a throttled profile of the built site):
// { total, phases: { name: bytes received while that phase ran } }. Absent on dev: phases then count by time only.
// This browser's own boots refine it (localStorage 'sl.loadBytes.v1'), and its measured download speed ('sl.loadBw.v1').
const KEY_BYTES = 'sl.loadBytes.v1', KEY_BW = 'sl.loadBw.v1';
const DEFAULT_BW = 3.2e6; // bytes/s before anything is measured (~25 Mbps: a modest home line; downloads dominate the first visit)
const BYTES = { phases: {}, total: 0, from: 'none' };
function loadBytes() {
  try { const s = JSON.parse(localStorage.getItem(KEY_BYTES) || 'null'); if (s?.phases) { Object.assign(BYTES.phases, s.phases); BYTES.total = s.total || 0; BYTES.from = 'local'; } } catch (e) { /* */ }
  try {
    if (typeof fetch === 'undefined' || /[?&]lpnet=0\b/.test(location.search)) return;
    fetch(new URL('boot-bytes.json', document.baseURI).href, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.phases) return;
      if (BYTES.from !== 'local') { Object.assign(BYTES.phases, j.phases); BYTES.total = j.total || 0; BYTES.from = 'manifest'; }
      else for (const [k, v] of Object.entries(j.phases)) if (!(k in BYTES.phases)) BYTES.phases[k] = v;
    }).catch(() => {});
  } catch (e) { /* */ }
}
function storedBw() { try { const v = +localStorage.getItem(KEY_BW); return v > 0 ? v : 0; } catch (e) { return 0; } }

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
  loadBytes();
  const W = loadWeights();
  const NETON = !/[?&]lpnet=0\b/.test(location.search); // ?lpnet=0: time weights only (the 14:20 bar), for A/B
  const t0 = now();
  const bw0 = storedBw() || DEFAULT_BW;
  const st = {
    cur: null, curT: 0, curW: 0, curB0: 0, curNet: null, doneW: 0, durations: {}, phaseBytes: {}, sub: null, subLabel: '', shown: 0,
    msg: '', samples: [], finished: false, error: '', probe: null, label: '',
  };
  // download speed: bytes received / time since the first request, blended with the prior until ~3 MB have arrived
  function bw() {
    const span = Math.max(0.25, ((NET.tLast || now()) - (NET.t0 || t0)) / 1000);
    const live = NET.bytes / span, k = Math.min(1, NET.bytes / 3e6);
    return Math.max(2e5, (1 - k) * bw0 + k * live);
  }
  const bytesOf = (name) => (NETON ? BYTES.phases[name] || 0 : 0);
  // a phase's expected duration on this machine and line: its download (bytes at the measured speed) plus its CPU work
  // (a phase downloads, then builds: the map phase spent ~25 s building after its 230 MB had arrived)
  const cpuOf = (name) => (Number.isFinite(W[name]) ? W[name] : UNKNOWN_MS);
  const dlOf = (name) => { const b = bytesOf(name); return b > 65536 ? (1000 * b) / bw() : 0; };
  const wOf = (name) => cpuOf(name) + dlOf(name);
  // the expected total: every phase this browser knows (time weights + byte manifest), at least what has run so far
  const totalW = () => {
    let s2 = 0; const seen = new Set();
    for (const k of Object.keys(W)) { s2 += wOf(k); seen.add(k); }
    if (NETON) for (const k of Object.keys(BYTES.phases)) if (!seen.has(k)) s2 += wOf(k);
    return Math.max(s2, st.doneW + (st.cur ? wOf(st.cur.name) : 0) + 1);
  };

  function begin(name) {
    if (st.cur) end(st.cur.name);
    st.cur = { name }; st.curT = now(); st.sub = null; st.subLabel = ''; st.probe = null; st.curB0 = NET.bytes;
    st.curNet = { started: { ...NET.started }, done: { ...NET.done } };
  }
  function end(name) {
    if (!st.cur || (name && st.cur.name !== name)) return;
    const n = st.cur.name, d = now() - st.curT;
    st.durations[n] = (st.durations[n] || 0) + d;
    st.phaseBytes[n] = (st.phaseBytes[n] || 0) + (NET.bytes - st.curB0);
    st.doneW += wOf(n); st.cur = null; st.sub = null; st.subLabel = ''; st.probe = null;
  }
  // a counter read on every bar update while the current phase runs: fn() -> { f: 0..1, label }
  function probe(fn) { st.probe = fn; }
  // explicit sub-progress inside the current phase (0..1) and its label (e.g. "Compiling shaders 140/212")
  function sub(f, label) { if (Number.isFinite(f)) st.sub = Math.max(st.sub || 0, Math.min(1, f)); if (label != null) st.subLabel = label; }

  // network share of the current phase: files finished / requested since the phase began, and the busiest kind
  function netInPhase() {
    if (!st.curNet) return null;
    let s2 = 0, d = 0, best = null, bestPend = 0;
    for (const k of Object.keys(NET.started)) {
      const ks = NET.started[k] - st.curNet.started[k], kd = Math.min(ks, NET.done[k] - st.curNet.done[k]);
      s2 += ks; d += kd;
      if (ks - kd > bestPend || (!best && ks > 0)) { bestPend = ks - kd; best = { kind: k, s: ks, d: kd }; }
    }
    return s2 ? { f: d / s2, s: s2, d, best, pending: s2 - d } : null;
  }
  const MB = (b) => Math.round(b / 1048576);

  function value() {
    if (st.finished) return 100;
    let f = 0, label = st.cur ? labelOf(st.cur.name) : st.msg, curW = 0;
    if (st.cur) {
      curW = wOf(st.cur.name);
      const el = now() - st.curT, exp = Math.max(30, curW);
      // time share: 74 % of the phase at its expected duration, still moving (slower) when it runs long, never past 95 %
      const fTime = 0.95 * (1 - Math.exp(-1.5 * el / exp));
      // byte share: bytes received in this phase / the bytes this phase downloads (boot manifest), up to 97 %
      const pb = bytesOf(st.cur.name), got = NET.bytes - st.curB0;
      // the download is the first part of the phase: bytes fill the phase up to its download share, time does the rest
      const fBytes = pb > 65536 ? Math.min(0.97, got / pb) * (dlOf(st.cur.name) / Math.max(1, curW)) : 0;
      const net = netInPhase();
      if (st.probe) { try { const r = st.probe(); if (r) sub(r.f, r.label); } catch (e) { st.probe = null; } }
      // counters with a known total (shaders linked / created, warm-up frames, spawn tiles) or bytes move it further when
      // they are ahead of the time share. Files done / requested is label only (its total grows as the phase asks for more).
      f = Math.max(fTime, fBytes, st.sub != null ? st.sub * 0.98 : 0);
      if (st.subLabel) label = st.subLabel;
      else if (pb > 65536 && got < pb * 0.97 && BYTES.total) label = `Downloading ${MB(NET.bytes)} / ${Math.max(MB(BYTES.total), MB(NET.bytes))} MB`;
      else if (net && net.pending > 0 && net.best) label = `${label} · ${net.best.kind} ${net.best.d}/${net.best.s}`;
    }
    const v = Math.min(99.5, 100 * (st.doneW + curW * f) / totalW());
    st.shown = Math.max(st.shown, v);
    st.label = label;
    return st.shown;
  }
  function finish() {
    if (st.cur) end(st.cur.name);
    st.finished = true; st.shown = 100;
    // running averages of this browser's real phase times, phase bytes and download speed (the next boot's weights)
    try {
      const prev = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      const next = {};
      for (const [k, d] of Object.entries(st.durations)) { const p = Number.isFinite(prev[k]) ? prev[k] : (Number.isFinite(W[k]) ? W[k] : UNKNOWN_MS); next[k] = Math.round(p + 0.35 * (d - p)); }
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) { /* private mode: defaults next time */ }
    try {
      if (NET.wire > 2e6) localStorage.setItem(KEY_BW, String(Math.round(bw()))); // only a real download says anything about the line
      const tot = Object.values(st.phaseBytes).reduce((a, b) => a + b, 0);
      if (tot > 1e6) localStorage.setItem(KEY_BYTES, JSON.stringify({ total: tot, phases: st.phaseBytes }));
    } catch (e) { /* */ }
  }
  // keep a progress-vs-time trace for tools (window.__loadProgress.samples: [ms since navigation, value, label])
  const api = {
    begin, end, sub, probe, finish, value,
    get label() { return st.label || ''; },
    msg(t) { st.msg = t; if (/^ERROR/.test(t)) st.error = t; },
    get error() { return st.error; },
    get durations() { return st.durations; },
    get phaseBytes() { return st.phaseBytes; },
    get bw() { return bw(); },
    get samples() { return st.samples; },
    weights: W, bytes: BYTES,
    net: NET,
    sample() { const v = value(); const last = st.samples[st.samples.length - 1]; const lab = st.label || ''; if (!last || v - last[1] >= 0.2 || lab !== last[2] || now() - last[0] > 1000) st.samples.push([Math.round(now()), +v.toFixed(2), lab]); return v; },
  };
  try { window.__loadProgress = api; } catch (e) { /* */ }
  return api;
}

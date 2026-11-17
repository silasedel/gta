// Southline audio: sample-based RPM engines (real recordings, see CREDITS.md) for the player car and the
// nearest AI cars, tire squeal / wind / turbo / overrun crackle, recorded gunshots layered with synth body,
// positional one-shot SFX library, footsteps by surface, indoor reverb / outdoor echo, sirens, ambience.
// Samples live in /assets/audio/{engines,guns}/*.wav; everything falls back to synthesis until loaded.
// API (game.audio):
//   play(name, { position?: {x,y,z}, volume?: 0..1, surface?, impulse?, indoor? }) -> void
//     names: punch_hit, punch_swing, bullet_hit_flesh, bullet_hit_world, car_crash, glass, door, cash, scream,
//            splash, swim, horn, backfire, death_hit, siren, whistle,
//            guns: pistol, revolver, microsmg, smg, rifle, carbine, shotgun, sawnoff, sniper, grenade, explosion,
//                  reload, empty, ricochet,
//            step (with surface) / step_<surface> / footstep_<surface>,
//            concrete|asphalt|sand|grass|wood|tile|metal|water (footstep shorthands)
//   siren(on, position?, id='player', mode='wail'|'yelp')  -> start/stop/move a looping police siren
//   horn(position?)  update(dt)  setVolume(0..1)  ctx (AudioContext|null)
// Listens to game events: 'footstep','punch','hit','shot','crash'.
// Engines read vehicle.model.{engine,maxRpm,idleRpm}, vehicle.rpm/gear/throttle/load/slip (CONTRACT3) with fallbacks.
import { createRadioStreams } from '../audio/radio.js';
import { createClubDJ } from '../audio/clubdj.js';
const NANLOG = { n: 0, first: null };
(function guardAudioParams() {
  if (typeof AudioParam === 'undefined' || AudioParam.prototype.__psGuard) return;
  const P = AudioParam.prototype; P.__psGuard = true;
  const note = (v) => { NANLOG.n++; if (!NANLOG.first) { NANLOG.first = String(v) + ' @ ' + (new Error().stack || '').split('\n').slice(2, 5).join(' | '); console.warn('[audio] non-finite AudioParam write ignored:', NANLOG.first); } };
  const d = Object.getOwnPropertyDescriptor(P, 'value');
  if (d?.set) Object.defineProperty(P, 'value', { ...d, set(v) { if (Number.isFinite(v)) d.set.call(this, v); else note(v); } });
  for (const m of ['setValueAtTime', 'setTargetAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) {
    const f = P[m]; P[m] = function (v, t, k) { if (!Number.isFinite(v) || !Number.isFinite(t) || (k !== undefined && !Number.isFinite(k))) { note(v); return this; } return f.call(this, v, t, k); };
  }
})();
// Scene mix constants (linear). Tuned with offline renders (src/audio/mixtest.html), see the audio-clean report.
const MIXK = {
  engine: 0.115, // player engine voice into the car bus
  aiEngine: 0.2, // traffic engine voices (positional, full level inside 3.5 m)
  aiLoud: 2.2, // traffic supercars, sports and muscle cars
  ambInCar: 0.5, // ambience duck while the player drives
  vehOut: 0.9, // vehicle bus make-up after its compressor / limiter
  bed: 0.6, // ambience bed send (beds are normalized to -23 LUFS)
  amb: 1, // ambience bus base
  music: 1, // music and radio bus base
  crash: 1.8, // vehicle impact one-shots
  radio: 0.8, // car radio (real songs are normalized to -16 LUFS)
};
export function createAudio(game) {
  let ctx = null, eng = null, master = null, sfx = null, ambBus = null, reverb = null, reverbSend = null, echo = null;
  let carBus = null, vehBus = null, outGain = null, worldLP = null, worldG = null, uiBus = null, musicBus = null;
  let menuBus = null; const menuDuck = { on: false }; // [main-menu hook] title-screen radio skips the world duck
  let radioBus = null, voiceBus = null, vehOut = null, masterComp = null, masterMakeup = null, ambDuck = null;
  // ---- loudness plan (audio-clean pass). Every bank file is normalized by index.json "norm" to its category
  // target (engine loops -20 LUFS integrated, ambience beds -23 LUFS, one-shots by their loudest 100 ms:
  // guns -10, impacts -16, vocals -14 / -16, footsteps -23; see docs/v2/reports/audio-clean.md).
  // The mixer below then places whole scenes (at the default 90% master): driving the supercar about
  // -16 LUFS, standing in the city about -21, walking or on the beach about -22, crashes and shots above that.
  // ---- vehicle mix (linear gains). Engine loops are the bed; pops, turbo, shift and blow-off sit under them,
  // tire squeal about 6 dB under the engine; wind subtle.
  const VMIX = {
    engine: MIXK.engine,
    aiEngine: MIXK.aiEngine,
    pops: 0.085,
    backfire: 0.1,
    turbo: 0.42,
    shift: 0.105,
    blowoff: 0.16,
    squeal: 0.87,
    wind: 0.075, // playtest: wind at speed was far too intense (-8.5 dB, and a softer curve below)
    oneShot: 0.5,
  };
  // per-bus user volumes (settings sliders: game.settings.audio or setBusVolume)
  const busVol = {
    sfx: 1,
    vehicles: 1,
    ambience: 0.9,
    music: 0.8,
    radio: 0.8,
    voice: 1,
    ui: 0.8,
  };
  const outMode = { output: 'headphones', range: 'full' };
  const meters = {}; // name -> AnalyserNode (pre-master taps for verification)
  // test/automation mute: ?mute in the URL or localStorage 'ps-mute' = '1' keeps master gain at 0
  let MUTED = false;
  try { MUTED = /[?&]mute\b/.test(location.search) || localStorage.getItem('ps-mute') === '1'; } catch (e) { /* */ }
  const BUF = {}; // decoded legacy samples by name
  // ---- real-recording banks (public/assets/audio/<cat>/index.json), lazy-loaded per category / per key ----
  const BANK = {};
  function bank(cat) {
    let b = BANK[cat];
    if (!b) {
      b = BANK[cat] = { idx: null, buf: new Map() };
      b.p = fetch(`/assets/audio/${cat}/index.json`).then((r) => (r.ok ? r.json() : {})).then((j) => { b.idx = j || {}; }).catch(() => { b.idx = {}; });
    }
    return b;
  }
  function loadFile(cat, file) {
    const b = bank(cat);
    if (b.buf.has(file)) return b.buf.get(file);
    b.buf.set(file, null);
    fetch(`/assets/audio/${cat}/${file}`).then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((ab) => ab && new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((x) => { if (x) b.buf.set(file, x); }).catch(() => { /* synth fallback */ });
    return null;
  }
  const hasKey = (cat, key) => !!BANK[cat]?.idx?.[key];
  // random decoded variant of a key -> { buf, e (index entry), i (file index) } or null (and starts loading it)
  function getVar(cat, key) {
    if (!ctx) return null;
    const b = bank(cat), e = b.idx?.[key];
    if (!e) return null;
    let n = 0;
    for (const f of e.files) if (!b.buf.has(f)) loadFile(cat, f);
    const ok = [];
    for (let i = 0; i < e.files.length; i++) { const x = b.buf.get(e.files[i]); if (x) { ok.push([x, i]); n++; } }
    if (!n) return null;
    const [buf, i] = ok[Math.floor(Math.random() * ok.length)];
    return { buf, e, i };
  }
  function preload(cat, filter) {
    const b = bank(cat);
    b.p.then(() => { for (const k of Object.keys(b.idx)) if (!filter || filter(k)) getVar(cat, k); });
  }
  // play a real recording into dst; false if not (yet) available
  function real(dst, t, cat, key, { rate = 1, gain = 1, lp = 0, hp = 0 } = {}) {
    const v = getVar(cat, key); if (!v) return false;
    const s = ctx.createBufferSource(); s.buffer = v.buf; s.playbackRate.value = rate;
    let n = s;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; }
    if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; n.connect(f); n = f; }
    const g = ctx.createGain(); g.gain.value = gain * (v.e.gain ?? 1) * (v.e.norm?.[v.i] ?? 1); n.connect(g).connect(dst);
    s.start(t); return true;
  }
  const SAMPLE_FILES = {
    i4_idle: 'engines/i4_idle', i4_mid: 'engines/i4_mid', i4_high: 'engines/i4_high',
    v6_idle: 'engines/v6_idle', v6_mid: 'engines/v6_mid', v6_high: 'engines/v6_high',
    v8_idle: 'engines/v8_idle', v8_mid: 'engines/v8_mid', v8_high: 'engines/v8_high',
    v10_idle: 'engines/v10_idle', v10_mid: 'engines/v10_mid', v10_high: 'engines/v10_high',
    diesel_idle: 'engines/diesel_idle', diesel_mid: 'engines/diesel_mid',
    pistol_a: 'guns/pistol_a', pistol_b: 'guns/pistol_b', heavy_a: 'guns/heavy_a', auto_a: 'guns/auto_a', auto_b: 'guns/auto_b',
    rifle_a: 'guns/rifle_a', mech_a: 'guns/mech_a', explosion_a: 'guns/explosion_a', explosion_b: 'guns/explosion_b',
  };
  function loadSamples() {
    for (const [k, f] of Object.entries(SAMPLE_FILES)) {
      fetch(`/assets/audio/${f}.wav`).then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => ab && new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
        .then((b) => { if (b) BUF[k] = b; }).catch(() => { /* synth fallback */ });
    }
  }
  let noiseW = null, noiseB = null, impulseIn = null;
  const sirens = new Map();
  const lastPlay = new Map();
  let volume = 0.5;

  function makeNoise(seconds, brown) {
    const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = n.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { b = 0.98 * b + 0.02 * w; d[i] = b * 4; } else d[i] = w;
    }
    return n;
  }
  function makeImpulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // master: sum -> gentle glue compression -> brick-wall limiter at -1 dBFS -> (metered) -> volume/mute -> out
    const tap = (name, node) => { const a = ctx.createAnalyser(); a.fftSize = 4096; node.connect(a); meters[name] = a; return node; };
    master = ctx.createGain(); master.gain.value = 1;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 2.5; comp.attack.value = 0.01; comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.0005; lim.release.value = 0.06;
    outGain = ctx.createGain(); outGain.gain.value = MUTED ? 0 : volume;
    worldLP = ctx.createBiquadFilter(); worldLP.type = 'lowpass'; worldLP.frequency.value = 20000; worldLP.Q.value = 0.5;
    worldG = ctx.createGain(); worldG.gain.value = 1;
    masterComp = comp;
    masterMakeup = ctx.createGain();
    masterMakeup.gain.value = 1;
    master.connect(worldLP).connect(worldG).connect(comp).connect(masterMakeup).connect(lim).connect(outGain).connect(ctx.destination);
    uiBus = ctx.createGain(); uiBus.gain.value = busVol.ui; uiBus.connect(comp); tap('ui', uiBus);
    menuBus = ctx.createGain(); menuBus.gain.value = busVol.music * MIXK.music; menuBus.connect(comp); // [main-menu hook]
    musicBus = ctx.createGain(); musicBus.gain.value = busVol.music * MIXK.music; musicBus.connect(master); tap('music', musicBus);
    radioBus = ctx.createGain();
    radioBus.gain.value = busVol.radio * MIXK.music;
    radioBus.connect(master);
    tap('radio', radioBus);
    voiceBus = ctx.createGain();
    voiceBus.gain.value = busVol.voice;
    voiceBus.connect(master);
    tap('voice', voiceBus);
    tap('mix', lim);
    sfx = ctx.createGain(); sfx.gain.value = busVol.sfx; sfx.connect(master); tap('sfx', sfx);
    ambBus = ctx.createGain(); ambBus.gain.value = busVol.ambience * MIXK.amb; tap('amb', ambBus);
    ambDuck = ctx.createGain();
    ambDuck.gain.value = 1;
    ambBus.connect(ambDuck).connect(master); // ducked while the player drives
    readSettings();
    applyOutputMode();
    noiseW = makeNoise(2, false); noiseB = makeNoise(2, true);
    // reverb (indoor rooms) — send bus
    reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(1.1, 3.2);
    reverbSend = ctx.createGain(); reverbSend.gain.value = 0; reverbSend.connect(reverb); reverb.connect(master);
    impulseIn = makeImpulse(0.45, 4);
    // outdoor slapback echo (gunshots between buildings)
    const d1 = ctx.createDelay(1.5); d1.delayTime.value = 0.23;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    echo = ctx.createGain(); echo.gain.value = 1;
    echo.connect(d1); d1.connect(lp); lp.connect(fb); fb.connect(d1); lp.connect(master);
    // ambient bed (city rumble)
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    const amb = loop(noiseB); const ambF = ctx.createBiquadFilter(); ambF.type = 'lowpass'; ambF.frequency.value = 380;
    const ambG = ctx.createGain(); ambG.gain.value = 0.08; amb.connect(ambF).connect(ambG).connect(ambBus);
    // waves (positional on the shoreline)
    const wv = loop(noiseW); const wvF = ctx.createBiquadFilter(); wvF.type = 'lowpass'; wvF.frequency.value = 900;
    const wvG = ctx.createGain(); wvG.gain.value = 0;
    const wvP = panner(1, 6, 400); wv.connect(wvF).connect(wvG).connect(wvP).connect(ambBus);
    // player-car bus: interior muffling (lowpass when the camera sits inside / very close to the car)
    const cabin = ctx.createBiquadFilter(); cabin.type = 'lowpass'; cabin.frequency.value = 20000; cabin.Q.value = 0.5;
    // vehicle bus: soft compressor + limiter so nothing jumps out; analyser taps before master (works with ?mute)
    const meter = (name, node) => { const a = ctx.createAnalyser(); a.fftSize = 4096; node.connect(a); meters[name] = a; return node; };
    const vComp = ctx.createDynamicsCompressor(); vComp.threshold.value = -20; vComp.knee.value = 12; vComp.ratio.value = 3; vComp.attack.value = 0.006; vComp.release.value = 0.2;
    const vLim = ctx.createDynamicsCompressor(); vLim.threshold.value = -6; vLim.knee.value = 0; vLim.ratio.value = 20; vLim.attack.value = 0.001; vLim.release.value = 0.08;
    vehBus = ctx.createGain(); vehBus.gain.value = 1;
    vehOut = ctx.createGain();
    vehOut.gain.value = MIXK.vehOut * busVol.vehicles; // make-up gain after compression x user volume
    vehBus.connect(vComp).connect(vLim).connect(vehOut).connect(master);
    meter('vehicle', vehOut);
    carBus = ctx.createGain(); carBus.gain.value = 1; carBus.connect(cabin).connect(vehBus);
    // per-layer player-car sub-buses (metered)
    for (const k of ['engine', 'fx', 'squeal', 'wind']) { const g = ctx.createGain(); g.connect(carBus); meter('p_' + k, g); carBus['_' + k] = g; }
    // wind (player car) — two bands: low buffet + high hiss
    const w = loop(noiseB); const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0; w.connect(wf).connect(wg).connect(carBus._wind);
    const w2 = loop(noiseW); const wf2 = ctx.createBiquadFilter(); wf2.type = 'bandpass'; wf2.frequency.value = 2600; wf2.Q.value = 0.7;
    const wg2 = ctx.createGain(); wg2.gain.value = 0; w2.connect(wf2).connect(wg2).connect(carBus._wind);
    eng = { cabin, wg, wf, wg2, ambG, ambF, wvG, wvF, wvP };
    loadSamples();
    // real banks: footsteps + combat fully preloaded (small); vehicles one-shots; ambience lazily per zone
    preload('footsteps');
    preload('voices');
    bank('venues');
    preload('combat');
    preload('vehicles', (k) => !/_(idle|low|mid|high|off_low|off_high)$/.test(k));
    bank('ambience').p.then(() => {
      getVar('ambience', 'ir_medium_room'); getVar('ambience', 'ir_small_room'); getVar('ambience', 'ir_large_hall'); getVar('ambience', 'ir_underpass');
    });
  }
  addEventListener('mousedown', start);
  addEventListener('keydown', start);
  addEventListener('pointerdown', start);
  addEventListener('touchstart', start);
  // background tab: suspend the context (no CPU, no stray sound) unless the player turned off
  // "mute when the window is in the background"; resume when the tab is visible again
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
      if (!ctx || offline) return;
      if (document.hidden) {
        const keepPlaying = game.settings?.muteOnFocusLoss === false;
        if (ctx.state === 'running' && !keepPlaying) ctx.suspend().catch(() => { /* */ });
      } else if (ctx.state !== 'running' && ctx.state !== 'closed') {
        ctx.resume().catch(() => { /* resumes on the next input event instead */ });
      }
    });
  }

  // ---------- bus volumes, output mode, dynamic range (settings) ----------
  const BUS_ALIAS = { vehicle: 'vehicles', amb: 'ambience', ambient: 'ambience', dialogue: 'voice', voices: 'voice', effects: 'sfx' };
  function busNode(key) {
    if (key === 'sfx') return sfx;
    if (key === 'ambience') return ambBus;
    if (key === 'music') return musicBus;
    if (key === 'radio') return radioBus;
    if (key === 'voice') return voiceBus;
    if (key === 'ui') return uiBus;
    return null;
  }
  function busBase(key) {
    if (key === 'ambience') return MIXK.amb;
    if (key === 'music' || key === 'radio') return MIXK.music;
    if (key === 'vehicles') return MIXK.vehOut;
    return 1;
  }
  function setBusVolume(bus, v) {
    const key = BUS_ALIAS[bus] || bus;
    const x = Math.max(0, Math.min(1, +v));
    if (!(key in busVol) || !Number.isFinite(x)) return false;
    busVol[key] = x;
    if (!ctx) return true;
    const node = key === 'vehicles' ? vehOut : busNode(key);
    node?.gain.setTargetAtTime(x * busBase(key), ctx.currentTime, 0.05);
    if (key === 'music' && menuBus) menuBus.gain.setTargetAtTime(x * busBase(key), ctx.currentTime, 0.05); // [main-menu hook]
    return true;
  }
  // effects that also feed the shared reverb / echo: scale the sends by the source bus volume
  function busLevel(node) {
    if (!node || node === sfx) return busVol.sfx;
    if (node === vehBus) return busVol.vehicles;
    if (node === ambBus) return busVol.ambience;
    if (node === voiceBus) return busVol.voice;
    if (node === uiBus) return busVol.ui;
    return 1;
  }
  // dynamic range: full = gentle glue; medium / night squeeze loud and quiet together (with make-up gain)
  const RANGE = {
    full: { threshold: -18, ratio: 2.5, makeup: 1 },
    medium: { threshold: -26, ratio: 4, makeup: 1.5 },
    night: { threshold: -34, ratio: 8, makeup: 2.2 },
  };
  function applyOutputMode() {
    if (!ctx) return;
    const r = RANGE[outMode.range] || RANGE.full;
    const t = ctx.currentTime;
    masterComp?.threshold.setTargetAtTime(r.threshold, t, 0.1);
    masterComp?.ratio.setTargetAtTime(r.ratio, t, 0.1);
    masterMakeup?.gain.setTargetAtTime(r.makeup, t, 0.1);
    // mono: fold the master down to one channel; other modes keep stereo
    try {
      const d = ctx.destination;
      const want = outMode.output === 'mono' ? 1 : Math.min(2, d.maxChannelCount || 2);
      if (d.channelCount !== want) d.channelCount = want;
      d.channelInterpretation = 'speakers';
    } catch (e) { /* fixed channel count on this browser */ }
  }
  // settings store mirrors sliders into game.settings.audio[bus]; also read Output choices
  function readSettings() {
    const S = game.settings;
    if (!S) return;
    const A = S.audio;
    if (A) {
      for (const k of Object.keys(busVol)) {
        if (typeof A[k] === 'number' && Math.abs(A[k] - busVol[k]) > 1e-4) setBusVolume(k, A[k]);
      }
    }
    const output = S.audioOutput || 'headphones';
    const range = S.dynamicRange || 'full';
    if (output !== outMode.output || range !== outMode.range) {
      outMode.output = output;
      outMode.range = range;
      applyOutputMode();
    }
  }

  // ---------- helpers ----------
  function panner(ref = 3, rolloff = 1.2, max = 250) {
    const p = ctx.createPanner();
    // HRTF suits headphones; speakers, TV and mono get plain equal-power panning (cheaper too)
    p.panningModel = outMode.output === 'headphones' ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = max;
    return p;
  }
  function setPos(p, pos) {
    if (!pos || !Number.isFinite(pos.x + (pos.y ?? 1) + pos.z)) return;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y ?? 1, pos.z);
  }
  const isIndoor = () => {
    if ((game.env?.indoor || 0) > 0.5) return true;
    const pp = game.player?.position; if (!pp) return false;
    try { return (game.interiors?.list || []).some((s) => s.isInside?.(pp)); } catch (e) { return false; }
  };
  // output chain for one sound: gain -> (panner) -> sfx (+ optional reverb/echo sends)
  function out(o = {}) {
    const g = ctx.createGain(); g.gain.value = o.volume ?? 1;
    let tail = g;
    // distance air absorption: far shots/explosions lose their crack (lowpass falls with distance)
    if (o.far && o.position && game.camera) {
      const c = game.camera.position, d = Math.hypot(o.position.x - c.x, (o.position.y ?? 1) - c.y, o.position.z - c.z);
      if (d > 15) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
        lp.frequency.value = Math.max(700, 16000 * Math.exp(-(d - 15) / 55));
        g.connect(lp); tail = lp;
      }
    }
    if (o.position) { const p = panner(o.ref || 3, o.rolloff || 1.2); setPos(p, o.position); tail.connect(p); tail = p; }
    tail.connect(o.bus || sfx);
    const indoor = o.indoor ?? (o.room ? isIndoor() : false);
    const sendK = busLevel(o.bus);
    if (o.room && indoor) { const s = ctx.createGain(); s.gain.value = o.room * sendK; tail.connect(s).connect(reverb); }
    if (o.echo && !indoor) { const s = ctx.createGain(); s.gain.value = o.echo * sendK; tail.connect(s).connect(echo); }
    return g;
  }
  // filtered noise burst
  function burst(dst, t, { type = 'bandpass', freq = 1000, q = 1, attack = 0.002, decay = 0.08, gain = 1, brown = false, freqEnd = null, rate = 1 }) {
    const s = ctx.createBufferSource(); s.buffer = brown ? noiseB : noiseW; s.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t); fl.Q.value = q;
    if (freqEnd) fl.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + attack + decay);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    s.connect(fl).connect(g).connect(dst);
    s.start(t, Math.random() * 1.5); s.stop(t + attack + decay + 0.05);
  }
  // pitched tone with exponential pitch/amp envelope
  function tone(dst, t, { type = 'sine', f0 = 200, f1 = null, attack = 0.002, decay = 0.2, gain = 1, detune = 0 }) {
    const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + attack + decay);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(dst); o.start(t); o.stop(t + attack + decay + 0.05);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  // one-shot recorded sample; returns false if not loaded (caller falls back to synth)
  function samp(dst, t, name, { rate = 1, gain = 1, lp = 0, hp = 0 } = {}) {
    const b = BUF[name]; if (!b) return false;
    const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    let n = s;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; }
    if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; n.connect(f); n = f; }
    const g = ctx.createGain(); g.gain.value = gain; n.connect(g).connect(dst);
    s.start(t); return true;
  }
  const pick = (...names) => { const ok = names.filter((n) => BUF[n]); return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null; };

  // ---------- footsteps ----------
  const STEP = {
    concrete(d, t, run) { // sharp heel tap + scuff
      burst(d, t, { type: 'bandpass', freq: rnd(2600, 3400), q: 1.4, decay: 0.035, gain: 0.9 });
      tone(d, t, { f0: rnd(150, 180), f1: 70, decay: 0.05, gain: 0.5 });
      burst(d, t + 0.035, { type: 'highpass', freq: 3500, decay: run ? 0.06 : 0.04, gain: 0.18 });
    },
    asphalt(d, t, run) { // duller, grittier
      burst(d, t, { type: 'bandpass', freq: rnd(1100, 1500), q: 0.9, decay: 0.05, gain: 0.8 });
      tone(d, t, { f0: rnd(120, 140), f1: 60, decay: 0.06, gain: 0.45 });
      burst(d, t + 0.02, { type: 'highpass', freq: 5000, decay: 0.05, gain: 0.25 });
    },
    sand(d, t, run) { // soft crunchy shh: granular high bursts, slow attack
      burst(d, t, { type: 'bandpass', freq: rnd(3500, 5000), q: 0.7, attack: 0.025, decay: run ? 0.16 : 0.2, gain: 0.45 });
      for (let i = 0; i < 6; i++) burst(d, t + 0.01 + Math.random() * 0.12, { type: 'highpass', freq: rnd(4000, 7000), decay: 0.012, gain: rnd(0.15, 0.35) });
      tone(d, t, { f0: 90, f1: 50, attack: 0.01, decay: 0.07, gain: 0.18 });
    },
    grass(d, t, run) { // soft rustle
      burst(d, t, { type: 'highpass', freq: rnd(2200, 3000), attack: 0.03, decay: 0.18, gain: 0.3 });
      burst(d, t + 0.05, { type: 'bandpass', freq: rnd(5000, 7000), q: 0.6, attack: 0.02, decay: 0.12, gain: 0.18 });
      tone(d, t, { f0: 80, f1: 50, attack: 0.01, decay: 0.06, gain: 0.15 });
    },
    wood(d, t, run) { // hollow knock: resonant body
      burst(d, t, { type: 'bandpass', freq: rnd(190, 230), q: 9, attack: 0.001, decay: 0.16, gain: 2.2 });
      burst(d, t, { type: 'bandpass', freq: rnd(480, 560), q: 7, attack: 0.001, decay: 0.09, gain: 1.0 });
      burst(d, t, { type: 'highpass', freq: 3000, decay: 0.02, gain: 0.3 });
      tone(d, t, { f0: 140, f1: 90, decay: 0.12, gain: 0.35 });
    },
    tile(d, t, run) { // clicky, bright
      burst(d, t, { type: 'bandpass', freq: rnd(4200, 5200), q: 4, attack: 0.001, decay: 0.03, gain: 1.4 });
      tone(d, t, { f0: rnd(1800, 2100), f1: 1500, decay: 0.03, gain: 0.12 });
      tone(d, t, { f0: 160, f1: 80, decay: 0.04, gain: 0.35 });
    },
    metal(d, t, run) { // clang ring
      for (const fq of [820, 1310, 2140, 3170]) tone(d, t, { f0: fq * rnd(0.97, 1.03), decay: rnd(0.15, 0.3), gain: 0.12 });
      burst(d, t, { type: 'bandpass', freq: 2500, q: 2, decay: 0.03, gain: 0.6 });
    },
    water(d, t, run) { // slosh
      burst(d, t, { type: 'lowpass', freq: 1800, freqEnd: 300, q: 2, attack: 0.02, decay: 0.25, gain: 0.8, brown: false });
      burst(d, t + 0.05, { type: 'bandpass', freq: rnd(600, 900), q: 3, attack: 0.02, decay: 0.18, gain: 0.5 });
      for (let i = 0; i < 3; i++) tone(d, t + Math.random() * 0.15, { f0: rnd(500, 900), f1: rnd(1200, 1800), decay: 0.04, gain: 0.05 });
    },
  };
  STEP.dirt = STEP.sand; STEP.carpet = STEP.grass; STEP.marble = STEP.tile;

  // ---------- one-shot library ----------
  const SFX = {
    punch_hit(d, t) { // meaty thud
      tone(d, t, { f0: 110, f1: 40, decay: 0.18, gain: 1.4 });
      burst(d, t, { type: 'lowpass', freq: 900, decay: 0.09, gain: 1.2, brown: true });
      burst(d, t, { type: 'bandpass', freq: 2500, q: 1, decay: 0.025, gain: 0.6 });
    },
    punch_swing(d, t) { burst(d, t, { type: 'bandpass', freq: 600, freqEnd: 1800, q: 1.5, attack: 0.06, decay: 0.1, gain: 0.35 }); },
    bullet_hit_flesh(d, t) {
      burst(d, t, { type: 'bandpass', freq: 700, q: 1.2, decay: 0.07, gain: 1.4 });
      tone(d, t, { f0: 90, f1: 45, decay: 0.12, gain: 0.9 });
      burst(d, t + 0.01, { type: 'lowpass', freq: 1500, freqEnd: 300, decay: 0.12, gain: 0.5 });
    },
    bullet_hit_world(d, t) {
      burst(d, t, { type: 'highpass', freq: 2500, decay: 0.05, gain: 0.9 });
      if (Math.random() < 0.4) tone(d, t + 0.01, { type: 'sine', f0: rnd(2500, 4000), f1: rnd(900, 1400), decay: 0.25, gain: 0.08 });
    },
    // ---- guns: recorded shot (CC0/PD/CC-BY-SA, see CREDITS) + synthesized low-end body; synth-only fallback ----
    pistol(d, t) {
      const s = pick('pistol_a', 'pistol_b');
      if (s && samp(d, t, s, { rate: rnd(0.93, 1.05), gain: 1.1 })) { tone(d, t, { f0: 130, f1: 45, decay: 0.14, gain: 0.9 }); return; }
      burst(d, t, { type: 'highpass', freq: 200, attack: 0.0005, decay: 0.012, gain: 2.5 });
      burst(d, t, { type: 'bandpass', freq: 1400, q: 0.8, attack: 0.001, decay: 0.12, gain: 1.6 });
      tone(d, t, { f0: 140, f1: 45, decay: 0.16, gain: 1.4 });
      burst(d, t + 0.02, { type: 'lowpass', freq: 700, freqEnd: 120, decay: 0.35, gain: 0.5, brown: true });
    },
    revolver(d, t) { // heavier, longer crack
      if (samp(d, t, 'heavy_a', { rate: rnd(0.84, 0.9), gain: 1.2 })) { tone(d, t, { f0: 100, f1: 35, decay: 0.25, gain: 1.3 }); return; }
      SFX.pistol(d, t); tone(d, t, { f0: 90, f1: 30, decay: 0.3, gain: 1.2 });
    },
    smg(d, t) {
      const s = pick('auto_a', 'auto_b');
      if (s && samp(d, t, s, { rate: rnd(0.97, 1.06), gain: 1.0 })) { tone(d, t, { f0: 170, f1: 70, decay: 0.07, gain: 0.6 }); return; }
      burst(d, t, { type: 'highpass', freq: 400, attack: 0.0005, decay: 0.008, gain: 2.0 });
      burst(d, t, { type: 'bandpass', freq: 2100, q: 1, attack: 0.001, decay: 0.06, gain: 1.3 });
      tone(d, t, { f0: 180, f1: 70, decay: 0.08, gain: 0.9 });
    },
    microsmg(d, t) { // snappier, thinner
      const s = pick('auto_b', 'pistol_b');
      if (s && samp(d, t, s, { rate: rnd(1.12, 1.22), gain: 0.85, hp: 180 })) return;
      SFX.smg(d, t);
    },
    rifle(d, t) {
      if (samp(d, t, 'rifle_a', { rate: rnd(0.96, 1.04), gain: 1.15 })) { tone(d, t, { f0: 120, f1: 40, decay: 0.18, gain: 1.0 }); return; }
      SFX.smg(d, t); tone(d, t, { f0: 110, f1: 40, decay: 0.25, gain: 1.2 });
      burst(d, t + 0.02, { type: 'lowpass', freq: 900, freqEnd: 150, decay: 0.4, gain: 0.5, brown: true });
    },
    carbine(d, t) {
      if (samp(d, t, 'rifle_a', { rate: rnd(1.06, 1.12), gain: 1.0 })) { tone(d, t, { f0: 140, f1: 50, decay: 0.12, gain: 0.8 }); return; }
      SFX.rifle(d, t);
    },
    sniper(d, t) { // big supersonic crack + long rolling tail
      const a = samp(d, t, 'heavy_a', { rate: 0.74, gain: 1.3 });
      const b = samp(d, t, 'rifle_a', { rate: 0.82, gain: 0.8 });
      tone(d, t, { f0: 80, f1: 28, decay: 0.5, gain: 1.6 });
      burst(d, t + 0.03, { type: 'lowpass', freq: 600, freqEnd: 60, decay: 1.4, gain: 0.7, brown: true });
      if (!a && !b) { burst(d, t, { type: 'highpass', freq: 300, attack: 0.0005, decay: 0.02, gain: 3 }); burst(d, t, { type: 'bandpass', freq: 1100, q: 0.6, decay: 0.3, gain: 2 }); }
    },
    shotgun(d, t, o) {
      const a = samp(d, t, 'rifle_a', { rate: rnd(0.68, 0.74), gain: 1.2 });
      if (a) samp(d, t, 'heavy_a', { rate: 0.62, gain: 0.7, lp: 2500 });
      else {
        burst(d, t, { type: 'highpass', freq: 120, attack: 0.0005, decay: 0.02, gain: 3 });
        burst(d, t, { type: 'bandpass', freq: 900, q: 0.6, attack: 0.002, decay: 0.25, gain: 2 });
      }
      tone(d, t, { f0: 85, f1: 30, decay: 0.35, gain: 2 });
      burst(d, t + 0.03, { type: 'lowpass', freq: 500, freqEnd: 80, decay: 0.7, gain: 0.9, brown: true });
      if (o?.noPump) return;
      burst(d, t + 0.45, { type: 'bandpass', freq: 1800, q: 4, decay: 0.03, gain: 0.25 }); // pump
      burst(d, t + 0.58, { type: 'bandpass', freq: 1400, q: 4, decay: 0.04, gain: 0.3 });
    },
    sawnoff(d, t) { SFX.shotgun(d, t, { noPump: true }); tone(d, t, { f0: 70, f1: 25, decay: 0.4, gain: 1.5 }); },
    explosion(d, t, o) {
      const s = pick('explosion_a', 'explosion_b');
      if (s) samp(d, t, s, { rate: rnd(0.85, 1.0), gain: 1.4 });
      tone(d, t, { f0: 60, f1: 22, attack: 0.005, decay: 1.2, gain: 2.0 }); // sub punch
      burst(d, t, { type: 'lowpass', freq: 1400, freqEnd: 80, attack: 0.003, decay: s ? 0.6 : 1.6, gain: s ? 1.0 : 2.4, brown: true });
      if (!s) for (let i = 0; i < 12; i++) burst(d, t + 0.05 + Math.random() * 0.9, { type: 'bandpass', freq: rnd(800, 3000), q: 2, decay: rnd(0.03, 0.12), gain: rnd(0.2, 0.5) });
      if ((o?.volume ?? 1) > 0.6) SFX.glass(d, t + 0.12);
    },
    reload(d, t) { // mag out, mag in, slide
      burst(d, t, { type: 'bandpass', freq: 2400, q: 5, decay: 0.03, gain: 0.5 });
      if (!samp(d, t + 0.28, 'mech_a', { rate: 1.6, gain: 0.5, hp: 600 })) burst(d, t + 0.28, { type: 'bandpass', freq: 1200, q: 3, decay: 0.06, gain: 0.6 });
      burst(d, t + 0.55, { type: 'bandpass', freq: 3200, q: 6, decay: 0.025, gain: 0.6 });
      burst(d, t + 0.62, { type: 'bandpass', freq: 1800, q: 4, decay: 0.04, gain: 0.5 });
    },
    empty(d, t) { burst(d, t, { type: 'bandpass', freq: 3800, q: 8, decay: 0.02, gain: 0.7 }); tone(d, t, { f0: 2400, f1: 1800, decay: 0.03, gain: 0.08 }); },
    ricochet(d, t) {
      burst(d, t, { type: 'highpass', freq: 2500, decay: 0.04, gain: 0.7 });
      tone(d, t + 0.01, { type: 'sine', f0: rnd(3200, 4500), f1: rnd(700, 1100), decay: rnd(0.25, 0.4), gain: 0.12 });
    },
    car_crash(d, t, o) {
      const k = Math.min(1, Math.max(0.15, o.impulse ? o.impulse / 15000 : o.strength ?? 0.6));
      tone(d, t, { f0: 70, f1: 30, decay: 0.3 + k * 0.3, gain: 1.5 * k + 0.3 });
      burst(d, t, { type: 'lowpass', freq: 1200, freqEnd: 150, decay: 0.3 + k * 0.4, gain: 1.6 * k + 0.3, brown: true });
      const n = 4 + Math.floor(k * 8);
      for (let i = 0; i < n; i++) burst(d, t + Math.random() * 0.25 * k, { type: 'bandpass', freq: rnd(600, 3800), q: rnd(6, 14), decay: rnd(0.05, 0.25), gain: rnd(0.4, 1.0) * k });
      for (const fq of [430, 690, 1150]) tone(d, t, { type: 'triangle', f0: fq * rnd(0.9, 1.1), f1: fq * 0.85, decay: 0.4 * k + 0.1, gain: 0.08 * k });
      if (k > 0.55) SFX.glass(d, t + 0.03, { volume: k });
    },
    glass(d, t) {
      burst(d, t, { type: 'highpass', freq: 3000, decay: 0.12, gain: 0.8 });
      for (let i = 0; i < 14; i++) tone(d, t + Math.random() * 0.35, { type: 'sine', f0: rnd(2800, 8000), decay: rnd(0.04, 0.18), gain: rnd(0.04, 0.12) });
      for (let i = 0; i < 5; i++) burst(d, t + 0.05 + Math.random() * 0.4, { type: 'bandpass', freq: rnd(4000, 7000), q: 5, decay: 0.03, gain: 0.25 });
    },
    door(d, t) {
      burst(d, t, { type: 'bandpass', freq: 2200, q: 6, decay: 0.03, gain: 0.6 }); // latch
      burst(d, t + 0.06, { type: 'bandpass', freq: rnd(400, 600), q: 2, attack: 0.05, decay: 0.25, gain: 0.25 }); // swing
      tone(d, t + 0.32, { f0: 120, f1: 60, decay: 0.12, gain: 0.7 }); // close thump
      burst(d, t + 0.32, { type: 'bandpass', freq: 250, q: 5, decay: 0.12, gain: 1.2 });
    },
    cash(d, t) { // register: drawer + bell
      burst(d, t, { type: 'bandpass', freq: 1500, q: 3, decay: 0.04, gain: 0.6 });
      burst(d, t + 0.05, { type: 'bandpass', freq: 400, q: 1, attack: 0.02, decay: 0.15, gain: 0.5, brown: true });
      for (const [fq, g] of [[2093, 0.25], [2637, 0.18], [4186, 0.06]]) tone(d, t + 0.12, { f0: fq, decay: 0.9, gain: g });
    },
    scream(d, t) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const base = rnd(480, 650);
      o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.6, t + 0.25); o.frequency.linearRampToValueAtTime(base * 1.3, t + 1.0);
      const vib = ctx.createOscillator(); vib.frequency.value = 6.5; const vg = ctx.createGain(); vg.gain.value = 18; vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.08); g.gain.setValueAtTime(0.5, t + 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      const mix = ctx.createGain(); mix.gain.value = 0.6;
      for (const [fq, q] of [[900, 8], [1400, 9], [2800, 10]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq * rnd(0.9, 1.1); bp.Q.value = q; o.connect(bp).connect(mix); }
      mix.connect(g).connect(d); o.start(t); vib.start(t); o.stop(t + 1.2); vib.stop(t + 1.2);
      burst(d, t, { type: 'bandpass', freq: 3000, q: 1, attack: 0.05, decay: 0.9, gain: 0.08 });
    },
    splash(d, t, o) {
      const k = o.volume ?? 1;
      burst(d, t, { type: 'lowpass', freq: 3500, freqEnd: 400, attack: 0.01, decay: 0.55, gain: 1.2 });
      burst(d, t, { type: 'highpass', freq: 2500, attack: 0.005, decay: 0.3, gain: 0.5 });
      tone(d, t, { f0: 120, f1: 50, decay: 0.2, gain: 0.6 * k });
      for (let i = 0; i < 10; i++) tone(d, t + 0.1 + Math.random() * 0.6, { f0: rnd(400, 900), f1: rnd(1200, 2400), decay: rnd(0.03, 0.07), gain: rnd(0.04, 0.1) });
    },
    swim(d, t) { // stroke
      burst(d, t, { type: 'lowpass', freq: 1400, freqEnd: 350, attack: 0.08, decay: 0.35, gain: 0.5 });
      burst(d, t + 0.12, { type: 'bandpass', freq: 700, q: 2, attack: 0.05, decay: 0.2, gain: 0.25 });
      for (let i = 0; i < 4; i++) tone(d, t + Math.random() * 0.3, { f0: rnd(500, 800), f1: rnd(1100, 1600), decay: 0.05, gain: 0.04 });
    },
    horn(d, t) {
      for (const fq of [415, 520]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fq; const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.setValueAtTime(0.08, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 0.45); o.connect(g).connect(d); o.start(t); o.stop(t + 0.46); }
    },
    backfire(d, t) { // exhaust bang + a couple of trailing crackles
      if (!samp(d, t, 'pistol_b', { rate: 0.55, gain: 0.7, lp: 1400 })) burst(d, t, { type: 'lowpass', freq: 900, attack: 0.001, decay: 0.09, gain: 2.2, brown: true });
      tone(d, t, { f0: 90, f1: 40, decay: 0.12, gain: 1.2 });
      for (let i = 0; i < 3; i++) crackle(d, t + 0.06 + i * rnd(0.04, 0.09), rnd(0.3, 0.7));
    },
    crackle(d, t) { crackle(d, t, 1); },
    siren(d, t) { // one-shot 'whoop' (looping siren: use audio.siren(on, pos))
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(600, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.5); o.frequency.exponentialRampToValueAtTime(700, t + 1.0);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.05); g.gain.setValueAtTime(0.2, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
      o.connect(f).connect(g).connect(d); o.start(t); o.stop(t + 1.1);
    },
    heartbeat(d, t) { tone(d, t, { f0: 62, f1: 40, attack: 0.01, decay: 0.16, gain: 0.9 }); tone(d, t + 0.22, { f0: 55, f1: 38, attack: 0.01, decay: 0.2, gain: 0.6 }); },
    whistle(d, t) { tone(d, t, { f0: 2400, f1: 2600, attack: 0.02, decay: 0.3, gain: 0.15 }); },
    death_hit(d, t) { // cinematic impact: sub drop + low thud + slow-mo ring tail
      tone(d, t, { f0: 70, f1: 28, attack: 0.005, decay: 1.6, gain: 1.4 });
      burst(d, t, { type: 'lowpass', freq: 600, freqEnd: 60, attack: 0.002, decay: 0.9, gain: 1.6, brown: true });
      burst(d, t, { type: 'bandpass', freq: 2200, q: 0.7, freqEnd: 300, attack: 0.002, decay: 0.5, gain: 0.35 });
      for (const [fq, g] of [[196, 0.09], [233, 0.06], [294, 0.05]]) tone(d, t + 0.05, { type: 'triangle', f0: fq, f1: fq * 0.94, attack: 0.3, decay: 3.2, gain: g });
      burst(d, t + 0.2, { type: 'lowpass', freq: 400, attack: 1.2, decay: 2.0, gain: 0.25, brown: true });
    },
  };
  // overrun pop: short low bang with a bright tick
  function crackle(d, t, k = 1) {
    k *= 0.3;
    burst(d, t, { type: 'lowpass', freq: rnd(700, 1300), attack: 0.001, decay: rnd(0.03, 0.06), gain: 1.6 * k, brown: true });
    burst(d, t, { type: 'bandpass', freq: rnd(1800, 3200), q: 1.5, attack: 0.0005, decay: 0.012, gain: 0.7 * k });
  }
  SFX.grenade = SFX.explosion; SFX.rocket = SFX.explosion;
  SFX.assault = SFX.rifle; SFX.ar = SFX.rifle; SFX.uzi = SFX.microsmg; SFX.deagle = SFX.revolver; SFX.magnum = SFX.revolver;
  SFX.dryfire = SFX.empty; SFX.click = SFX.empty;
  const GUNS = ['pistol', 'revolver', 'microsmg', 'smg', 'rifle', 'carbine', 'sniper', 'shotgun', 'sawnoff', 'explosion', 'grenade', 'rocket', 'assault', 'ar', 'uzi', 'deagle', 'magnum'];
  const ROOM = { pistol: 0.7, revolver: 0.8, microsmg: 0.55, smg: 0.6, rifle: 0.75, carbine: 0.7, sniper: 0.9, shotgun: 0.8, sawnoff: 0.85, explosion: 0.9,
    glass: 0.4, door: 0.3, cash: 0.25, scream: 0.4, punch_hit: 0.3, step: 0.18, reload: 0.2 };
  const ECHO = { pistol: 0.45, revolver: 0.55, microsmg: 0.28, smg: 0.3, rifle: 0.5, carbine: 0.45, sniper: 0.8, shotgun: 0.6, sawnoff: 0.6, explosion: 0.7, car_crash: 0.25, backfire: 0.25 };
  const REF = { pistol: 12, revolver: 14, microsmg: 10, smg: 10, rifle: 15, carbine: 14, sniper: 22, shotgun: 15, sawnoff: 15, explosion: 30, car_crash: 8, siren: 15, scream: 6, horn: 8, backfire: 8 };
  for (const k of ['grenade', 'rocket']) { ROOM[k] = ROOM.explosion; ECHO[k] = ECHO.explosion; REF[k] = REF.explosion; }
  for (const [k, b] of [['assault', 'rifle'], ['ar', 'rifle'], ['uzi', 'microsmg'], ['deagle', 'revolver'], ['magnum', 'revolver']]) { ROOM[k] = ROOM[b]; ECHO[k] = ECHO[b]; REF[k] = REF[b]; }
  const FAR = new Set([...GUNS, 'car_crash', 'backfire', 'crackle']);

  // ---- real-recording routing ----
  const CATS = ['combat', 'vehicles', 'footsteps', 'ambience', 'voices', 'venues'];
  const REAL = {
    pistol: ['combat', 'gun_pistol'], revolver: ['combat', 'gun_revolver'], smg: ['combat', 'gun_smg'], microsmg: ['combat', 'gun_smg', { rate: 1.12, gain: 0.85 }],
    uzi: ['combat', 'gun_smg', { rate: 1.12, gain: 0.85 }], rifle: ['combat', 'gun_rifle'], assault: ['combat', 'gun_rifle'], ar: ['combat', 'gun_rifle'],
    carbine: ['combat', 'gun_rifle', { rate: 1.06, gain: 0.9 }], shotgun: ['combat', 'gun_shotgun'], sawnoff: ['combat', 'gun_shotgun', { rate: 0.93, gain: 1.1 }],
    sniper: ['combat', 'gun_sniper'], deagle: ['combat', 'gun_revolver'], magnum: ['combat', 'gun_revolver'],
    explosion: ['combat', 'explosion'], rocket: ['combat', 'explosion'], grenade: ['combat', 'explosion_small'],
    reload: ['combat', 'reload_pistol'], empty: ['combat', 'dryfire'], dryfire: ['combat', 'dryfire'], click: ['combat', 'dryfire'], ricochet: ['combat', 'ricochet'],
    punch_hit: ['combat', 'punch_body'], punch_swing: ['combat', 'swing_fist'], swing: ['combat', 'bat_swing'], bat_hit: ['combat', 'bat_hit_body'],
    bullet_hit_flesh: ['combat', 'bullet_impact_flesh'], bullet_hit_world: ['combat', 'bullet_impact_concrete'],
    glass: ['vehicles', 'glass_shatter'], door: ['vehicles', 'door_close'], backfire: ['vehicles', 'backfire', { gain: VMIX.backfire }], crackle: ['vehicles', 'crackle', { gain: VMIX.pops }],
    espresso: ['venues', 'espresso', { gain: 3 }], door_bell: ['venues', 'door_bell', { gain: 0.6 }], glass_clink: ['venues', 'glass_clink', { gain: 0.7 }],
    horn: ['vehicles', 'horn_sedan'], blowoff: ['vehicles', 'blowoff', { gain: VMIX.blowoff }], shift: ['vehicles', 'shift', { gain: VMIX.shift }],
    scream: (dst, t, o) => real(dst, t, 'combat', o.female ?? Math.random() < 0.5 ? 'scream_female' : 'scream_male'),
    car_crash(dst, t, o) {
      const k = Math.min(1, Math.max(0.1, o.impulse ? o.impulse / 15000 : o.strength ?? 0.6));
      // layered by impulse: body thump (low end) + metal crunch + glass + falling debris
      const ok = real(dst, t, 'vehicles', k > 0.7 ? 'crash_heavy' : k > 0.35 ? 'crash_medium' : 'crash_light', { rate: rnd(0.92, 1.06), gain: (0.5 + 0.6 * k) * MIXK.crash });
      if (!ok) return false;
      tone(dst, t, { f0: 95, f1: 32, attack: 0.004, decay: 0.28 + 0.25 * k, gain: 0.55 * k * k });
      burst(dst, t, { type: 'lowpass', freq: 260, freqEnd: 80, attack: 0.003, decay: 0.18 + 0.2 * k, gain: 0.5 * k, brown: true });
      if (k > 0.5) real(dst, t + 0.03, 'vehicles', 'crash_light', { rate: rnd(0.8, 0.95), gain: 0.35 * k * MIXK.crash });
      if (k > 0.45) real(dst, t + 0.02, 'vehicles', 'glass_shatter', { gain: 0.6 * k * MIXK.crash });
      if (k > 0.3) real(dst, t + rnd(0.18, 0.32), 'vehicles', 'clunk', { rate: rnd(1.1, 1.4), gain: 0.3 * k });
      return true;
    },
  };
  const SURF_ALIAS = { sand: 'sand_dry', grass: 'grass_short', marble: 'tile', carpet: 'tile', snow: 'sand_dry', rock: 'concrete', stone: 'concrete', road: 'asphalt', boardwalk: 'wood', pier: 'wood', grate: 'metal', mud: 'dirt' };
  const HARD = new Set(['asphalt', 'concrete', 'pavers', 'tile', 'wood', 'metal']);
  function surfName(surface, pos) {
    let s = surface;
    if (!s && pos) { try { s = game.city?.surfaceAt?.(pos.x, pos.z); } catch (e) { /* */ } }
    s = SURF_ALIAS[s] || s || 'concrete';
    if (s === 'sand_dry' && pos) { try { const c = game.city; if (c?.isWater && (c.isWater(pos.x + 4, pos.z) || c.isWater(pos.x - 4, pos.z) || c.isWater(pos.x, pos.z + 4) || c.isWater(pos.x, pos.z - 4))) s = 'sand_wet'; } catch (e) { /* */ } }
    return s;
  }
  // kind: 'step' | 'land' | 'bodyfall'
  function stepReal(dst, t, kind, surface, o) {
    const fb = (k) => (hasKey('footsteps', k) ? k : null);
    let key;
    if (kind === 'step') {
      const gait = o.run || o.sprint ? 'run' : 'walk';
      if (o.shoe && o.shoe !== 'sneaker' && HARD.has(surface)) key = fb(`step_${o.shoe}_hard`) || (o.shoe === 'flipflop' ? fb('step_flipflop') : null);
      key = key || fb(`step_${surface}_${gait}`) || fb(`step_${surface}_walk`) || fb(`step_concrete_${gait}`);
    } else if (kind === 'land') key = fb(`land_${surface}`) || fb('land_concrete');
    else {
      const s2 = surface === 'grass_short' || surface === 'grass_long' || surface === 'dirt' || surface === 'gravel' ? 'grass' : surface.startsWith('sand') ? 'sand' : surface === 'pavers' ? 'concrete' : surface;
      key = fb(`bodyfall_${s2}`) || fb('bodyfall_concrete');
    }
    if (!key) return false;
    return real(dst, t, 'footsteps', key, { rate: rnd(0.94, 1.06), gain: o.sprint ? 1.25 : 1 });
  }

  function play(name, o = {}) {
    if (!ctx || !name) return;
    if ((name === 'backfire' || name === 'crackle') && ctx.currentTime - (lastPlay.get('_pop')?.t ?? -99) < 2.5) return; // keep pops rare
    if (name === 'backfire' || name === 'crackle') lastPlay.set('_pop', { t: ctx.currentTime });
    if (game.ui?.paused) return;
    let fn = SFX[name], surface = o.surface, stepKind = null;
    let rk = REAL[name];
    if (!rk && !fn) for (const c of CATS) if (hasKey(c, name)) { rk = [c, name]; break; }
    if (!rk && typeof name === 'string' && name.includes(':')) { const [c, k] = name.split(':'); if (hasKey(c, k)) rk = [c, k]; }
    if (!fn && !rk) {
      const m = /^(?:step|footstep|land|bodyfall)_?(\w*)$/.exec(name);
      if (m) { surface = m[1] || surface || ''; stepKind = /^land/.test(name) ? 'land' : /^bodyfall/.test(name) ? 'bodyfall' : 'step'; }
      else if (STEP[name] || SURF_ALIAS[name] || HARD.has(name) || /^(sand_|grass_|gravel|dirt|water)/.test(name)) { surface = name; stepKind = 'step'; }
      if (stepKind) fn = 'step';
    }
    if (!fn && !rk) return;
    // dedupe: same sound at the same spot within 50ms (e.g. both 'hit' event and a module calling play)
    const now = ctx.currentTime, key = fn === 'step' ? 'step' + (stepKind || '') : name, lp = lastPlay.get(key);
    const pos = o.position;
    if (!o.nodedupe && lp && now - lp.t < 0.05 && (!pos || !lp.p || Math.hypot(pos.x - lp.p.x, pos.z - lp.p.z) < 1.5)) return;
    lastPlay.set(key, { t: now, p: pos ? { x: pos.x, z: pos.z } : null });
    // distance cull
    let dist = 0;
    if (pos) { const c = game.camera.position; dist = Math.hypot(pos.x - c.x, pos.z - c.z); if (dist > (GUNS.includes(name) ? 600 : 260)) return; }
    // far gunfire: real distant-shot recordings instead of the close crack
    if (GUNS.includes(name) && dist > 160 && hasKey('combat', 'distant_gunfire') && !/explo|gren|rocket/.test(name)) rk = ['combat', 'distant_gunfire', { gain: Math.min(1, 220 / dist) }];
    if (fn === 'step') surface = surfName(surface, pos);
    const sk = fn === 'step' ? 'step' : name;
    const room = fn === 'step' ? (surface === 'tile' ? 0.35 : ROOM.step) * (stepKind === 'bodyfall' ? 2 : 1) : ROOM[name] ?? (rk && /^(gun_|explosion)/.test(rk[1]) ? 0.7 : rk && /^(punch|kick|slap|bat_|knife|bullet_)/.test(rk[1]) ? 0.3 : 0);
    const echoK = ECHO[sk] ?? (rk && /^(gun_|explosion)/.test(rk[1]) ? 0.45 : 0);
    const ref = fn === 'step' ? (stepKind === 'bodyfall' ? 3 : 2) : REF[name] || (rk && /^(gun_|explosion)/.test(rk[1]) ? 14 : 3);
    const vBus = rk && rk[0] === 'vehicles' ? vehBus : null;
    const dst = out({ bus: name === 'death_hit' || name === 'heartbeat' ? uiBus : vBus, rolloff: o.rolloff, position: pos, volume: o.volume ?? 1, room, echo: echoK, ref: o.ref || ref, indoor: o.indoor, far: FAR.has(name) || !!(rk && /^(gun_|explosion|distant)/.test(rk[1])) });
    const t = now + 0.005;
    if (fn === 'step') { if (!stepReal(dst, t, stepKind || 'step', surface, o) && (stepKind || 'step') === 'step') (STEP[surface] || STEP[surface.split('_')[0]] || STEP.concrete)(dst, t, !!o.run); return; }
    if (rk) {
      const ok = typeof rk === 'function' ? rk(dst, t, o) : real(dst, t, rk[0], rk[1], { rate: (rk[2]?.rate || 1) * rnd(0.97, 1.03), gain: rk[2]?.gain || 1 });
      if (ok) return;
    }
    if (typeof fn === 'function') fn(dst, t, o);
  }

  // ---------- sirens ----------
  function siren(on, position, id = 'player', mode = 'wail') {
    if (!ctx) return;
    let s = sirens.get(id);
    const stopSrc = (x) => { try { x.src?.stop(); x.o?.stop(); x.lfo?.stop(); } catch (e) { /* */ } };
    if (!on) { if (s) { s.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); const ss = s; setTimeout(() => stopSrc(ss), 600); sirens.delete(id); } return; }
    if (!s) {
      const g = ctx.createGain(); g.gain.value = 0;
      const p = panner(REF.siren, 1, 600);
      g.connect(p).connect(sfx);
      s = { g, p, mode: null, real: false };
      sirens.set(id, s);
      g.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
    }
    const key = mode === 'yelp' ? 'siren_yelp' : mode === 'hilo' ? 'siren_hilo' : 'siren_wail';
    const rv = (s.mode !== mode || !s.real) ? getVar('vehicles', key) : null;
    if (s.mode !== mode || (!s.real && rv)) {
      const old = { src: s.src, o: s.o, lfo: s.lfo };
      const og = s.sg; if (og) { og.gain.setTargetAtTime(0, ctx.currentTime, 0.04); setTimeout(() => stopSrc(old), 300); }
      const sg = ctx.createGain(); sg.connect(s.g);
      s.src = s.o = s.lfo = null;
      if (rv) { // real recorded siren loop
        const src = ctx.createBufferSource(); src.buffer = rv.buf; src.loop = true;
        sg.gain.value = 0.45 * (rv.e.gain ?? 1) * (rv.e.norm?.[rv.i] ?? 1); src.connect(sg); src.start(ctx.currentTime, Math.random() * rv.buf.duration);
        s.src = src; s.real = true;
      } else { // synth fallback
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        const lfo = ctx.createOscillator(); lfo.type = mode === 'hilo' ? 'square' : 'triangle';
        const lg = ctx.createGain(); lfo.connect(lg).connect(o.frequency);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 1;
        const sh = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 2); } sh.curve = c;
        const yelp = mode === 'yelp';
        o.frequency.value = yelp ? 1050 : 1000; lg.gain.value = yelp ? 380 : mode === 'hilo' ? 180 : 420; lfo.frequency.value = yelp ? 3.6 : mode === 'hilo' ? 0.9 : 0.24;
        sg.gain.value = 0.18; o.connect(sh).connect(f).connect(sg); o.start(); lfo.start();
        s.o = o; s.lfo = lfo; s.real = false;
      }
      s.sg = sg; s.mode = mode;
    }
    setPos(s.p, position || game.player.position);
  }

  // ---------- event wiring (single source per sound) ----------
  game.on?.('footstep', (e) => {
    if (!e || game.player?.swimming) return;
    const pp = e.position || game.player.position;
    let surface = e.surface || null;
    if ((game.player?.waterDepth || 0) > 0.06 && pp && pp.distanceTo?.(game.player.position) < 2) surface = 'water';
    play('step', { surface, position: { x: pp.x, y: (pp.y || 0) + 0.05, z: pp.z }, volume: e.sprint ? 0.65 : e.run ? 0.55 : 0.4, run: !!(e.run || e.sprint), sprint: !!e.sprint, shoe: e.shoe });
  });
  game.on?.('punch', (e) => { if (e?.position) play('punch_swing', { position: { x: e.position.x, y: e.position.y + 1.3, z: e.position.z }, volume: 0.5 }); });
  game.on?.('hit', (e) => {
    if (!e) return;
    const p = e.point || e.object?.pos || e.object?.position || game.player.position;
    const position = { x: p.x, y: p.y ?? 1, z: p.z };
    const zone = String(e.zone || e.part || e.limb || e.bodyPart || '');
    const head = /head|neck|face/.test(zone), dmg = e.damage || 20, ped = e.target === 'ped';
    const realOK = (k) => hasKey('combat', k);
    if (e.kind === 'punch') play(realOK('punch_head') ? (head ? 'punch_head' : dmg > 35 ? 'punch_heavy' : e.kick ? 'kick' : 'punch_body') : 'punch_hit', { position, volume: Math.min(1, 0.6 + dmg / 80) });
    else if (e.kind === 'melee') {
      const w = String(e.weapon || 'bat');
      const k = /knife|blade|machete/.test(w) ? (ped ? (Math.random() < 0.5 ? 'knife_slash' : 'knife_stab') : 'bat_hit_world') : ped ? (head ? 'bat_hit_head' : 'bat_hit_body') : 'bat_hit_world';
      play(realOK(k) ? k : 'punch_hit', { position, volume: 0.95 });
    } else if (e.kind === 'bullet') {
      let k;
      if (ped) k = 'bullet_impact_flesh';
      else if (e.target === 'vehicle') k = e.glass ? 'bullet_impact_glass' : 'bullet_impact_car';
      else {
        let s = String(e.surface || e.material || '');
        if (!s) { try { s = game.city?.surfaceAt?.(p.x, p.z) || ''; } catch (er) { /* */ } if ((p.y ?? 0) > 1.2 && !/metal|wood|glass/.test(s)) s = 'concrete'; }
        k = /metal|grate/.test(s) ? 'bullet_impact_metal' : /wood/.test(s) ? 'bullet_impact_wood' : /glass|window/.test(s) ? 'bullet_impact_glass' : /water/.test(s) ? 'bullet_impact_water'
          : /sand|grass|dirt|gravel|mud/.test(s) ? 'bullet_impact_dirt' : 'bullet_impact_concrete';
        if ((k === 'bullet_impact_concrete' || k === 'bullet_impact_metal') && Math.random() < 0.18) play('ricochet', { position, volume: 0.6 });
      }
      play(realOK(k) ? k : ped ? 'bullet_hit_flesh' : e.target === 'vehicle' ? 'car_crash' : 'bullet_hit_world', { position, volume: ped ? 0.55 : 0.6, strength: 0.2 });
      if (ped && realOK('punch_head')) {
        const heavy = /shot|saw|snip|rifle|carb|magnum|revol/.test(String(e.weapon || ''));
        play(head ? 'punch_head' : heavy ? 'punch_heavy' : 'punch_body', { position, volume: heavy ? 0.45 : 0.32 });
      }
    } else if (e.kind === 'car') play(ped ? (realOK('punch_heavy') ? 'punch_heavy' : 'punch_hit') : 'car_crash', { position, volume: 1, strength: Math.min(1, dmg / 80) });
    // pain vocals for people (not every hit)
    if (ped && realOK('pain_male') && e.object !== game.player) {
      const o = e.object || {};
      const fem = o.female ?? (o.gender ? /^f/i.test(o.gender) : o.sex ? /^f/i.test(o.sex) : null) ?? (o._vf ??= Math.random() < 0.5);
      const dead = e.killed || e.fatal || (o.health !== undefined && o.health <= 0) || o.dead;
      const k = (dead ? 'death_' : dmg > 30 ? 'pain_' : 'grunt_') + (fem ? 'female' : 'male');
      if (dead || Math.random() < 0.65) play(k, { position: { x: position.x, y: position.y + 0.3, z: position.z }, volume: e.kind === 'bullet' ? 0.5 : 0.7 });
    }
  });
  // ---- pedestrian vocalisations (non-verbal / generic), rate-limited, 3D, quieter than guns & engines ----
  const pedVoiceT = [];
  const PV = {
    greet: { friendly: ['hum', 'laugh', 'hey'], default: ['hum', 'hum', 'hey'] },
    apologise: { default: ['hum', 'gasp', 'oof'] },
    insult: { default: ['grunt_annoyed', 'hey', 'shout'] },
    argue: { default: ['shout', 'shout', 'grunt_annoyed', 'hey'] },
    scream: { default: ['scream'] },
    drunk: { default: ['drunk', 'drunk', 'laugh', 'mumble'] },
    mumble: { default: ['mumble'] }, laugh: { default: ['laugh'] }, gasp: { default: ['gasp'] }, shove: { default: ['oof', 'grunt_annoyed'] },
  };
  const LOUD = { shout: 0.62, scream: 0.7, hey: 0.5, laugh: 0.45, gasp: 0.42, oof: 0.45, grunt_annoyed: 0.42, drunk: 0.45, hum: 0.32, mumble: 0.32 };
  function pedVoice(e) {
    if (!ctx || !e) return;
    const p = e.position || e.ped?.position || e.ped?.pos; if (!p || !Number.isFinite(p.x + p.z)) return;
    const c = game.camera?.position; const d = c ? Math.hypot(p.x - c.x, p.z - c.z) : 0;
    if (d > 45) return;
    const now = ctx.currentTime;
    while (pedVoiceT.length && now - pedVoiceT[0] > 1) pedVoiceT.shift();
    if (pedVoiceT.length >= 2 && e.kind !== 'scream') return; // max ~2 voices per second nearby
    const fem = /^f/i.test(String(e.gender || '')) || e.female === true;
    const pers = String(e.personality || '');
    const tbl = PV[e.kind] || PV.mumble;
    let list = tbl[/friend|cheer|happy|kind/.test(pers) ? 'friendly' : 'default'] || tbl.default;
    if (/rude|aggress|angry|grump|tough/.test(pers) && e.kind === 'greet') list = ['grunt_annoyed', 'hum'];
    const base = list[Math.floor(Math.random() * list.length)];
    const key = base === 'scream' ? (fem ? 'scream_female' : 'scream_male') : `${base}_${fem ? 'female' : 'male'}`;
    const cat = base === 'scream' ? 'combat' : 'voices';
    if (!hasKey(cat, key)) { bank(cat); return; }
    pedVoiceT.push(now);
    // stable per-voice pitch so the same ped sounds consistent
    const vid = String(e.voice ?? e.ped?.id ?? ''); let h = 0; for (let i = 0; i < vid.length; i++) h = (h * 31 + vid.charCodeAt(i)) | 0;
    const rate = vid ? 0.93 + ((Math.abs(h) % 1000) / 1000) * 0.14 : rnd(0.95, 1.05);
    const dst = out({ bus: voiceBus, position: { x: p.x, y: (p.y || 0) + 1.6, z: p.z }, volume: (LOUD[base] || 0.4) * (e.volume ?? 1), ref: 2.5, rolloff: 1.4, room: 0.25 });
    real(dst, now + 0.01, cat, key, { rate });
  }
  game.on?.('pedVoice', pedVoice);
  game.on?.('pedShove', (e) => {
    const p = e?.position || e?.victim?.position || e?.target?.position; if (!p) return;
    play('punch_body', { position: { x: p.x, y: (p.y || 0) + 1.1, z: p.z }, volume: 0.22 });
    play('cloth_move', { position: { x: p.x, y: (p.y || 0) + 1.1, z: p.z }, volume: 0.4 });
    pedVoice({ kind: 'shove', position: p, gender: e?.gender ?? e?.victimGender, voice: e?.voice });
  });
  // ---- venue ambience requests (INTERIORS): audio.venue(id, kind, position|null, on) or game event 'venueAmbience' ----
  const VENUE_BED = { kitchen: 'bed_kitchen', restaurant: 'bed_kitchen', cafe: 'bed_cafe', coffee: 'bed_cafe', espresso: 'bed_cafe', bar: 'bed_bar_chatter', club: 'bed_bar_chatter', store: 'bed_store', shop: 'bed_store', market: 'bed_store', fridge: 'fridge_hum' };
  const venueSrc = new Map();
  function venue(id, kind, position, on = true, gain = 1) {
    if (!ctx) return;
    const cur = venueSrc.get(id);
    if (!on) { if (cur) { venueSrc.delete(id); cur.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { cur.src.stop(); cur.g.disconnect(); } catch (e) { /* */ } }, 2000); } return; }
    const key = VENUE_BED[String(kind).toLowerCase()] || String(kind);
    if (cur && cur.key === key) { if (position && cur.pan) setPos(cur.pan, position); cur.g.gain.setTargetAtTime(0.4 * gain * cur.k, ctx.currentTime, 0.4); return; }
    if (cur) venue(id, null, null, false);
    if (BANK.venues?.idx && !hasKey('venues', key)) return;
    const v = getVar('venues', key);
    if (!v) { bank('venues').p.then(() => getVar('venues', key)); setTimeout(() => venue(id, kind, position, on, gain), 800); return; }
    const src = ctx.createBufferSource(); src.buffer = v.buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0; src.connect(g);
    let pan = null;
    if (position) { pan = panner(4, 1.3, 120); setPos(pan, position); g.connect(pan).connect(ambBus); } else g.connect(ambBus);
    src.start(ctx.currentTime, Math.random() * v.buf.duration);
    const k = (v.e.gain ?? 1) * (v.e.norm?.[v.i] ?? 1);
    g.gain.setTargetAtTime(0.4 * gain * k, ctx.currentTime, 0.4);
    venueSrc.set(id, { src, g, pan, key, k });
  }
  game.on?.('venueAmbience', (e) => e && venue(e.id ?? e.kind, e.kind, e.position || null, e.on !== false, e.gain ?? 1));
  game.on?.('land', (e) => { const p = e?.position || game.player?.position; if (p) play('land', { position: { x: p.x, y: (p.y || 0) + 0.05, z: p.z }, surface: e?.surface, volume: Math.min(1, 0.5 + (e?.speed || 4) / 12) }); });
  game.on?.('bodyfall', (e) => { const p = e?.position; if (p) play('bodyfall', { position: { x: p.x, y: (p.y || 0) + 0.1, z: p.z }, surface: e?.surface, volume: 0.9 }); });
  game.on?.('engineStart', (e) => engineOneShot(e?.vehicle || e, 'start'));
  game.on?.('engineStop', (e) => engineOneShot(e?.vehicle || e, 'stop'));
  const npcShots = [];
  game.on?.('shot', (e) => {
    if (!e) return;
    const wk = String(e.weapon || 'pistol').toLowerCase();
    if (wk === 'fist' || wk === 'bat' || wk === 'knife' || wk === 'melee') return;
    const w = SFX[wk] && GUNS.includes(wk) ? wk : /saw/.test(wk) ? 'sawnoff' : /shot/.test(wk) ? 'shotgun' : /snip/.test(wk) ? 'sniper'
      : /micro|uzi/.test(wk) ? 'microsmg' : /smg|sub/.test(wk) ? 'smg' : /carb/.test(wk) ? 'carbine' : /rifle|ak|assault/.test(wk) ? 'rifle'
      : /revol|magnum/.test(wk) ? 'revolver' : /gren|rocket|rpg|launch/.test(wk) ? 'explosion' : 'pistol';
    const p = e.origin || game.player.position;
    const npc = !(e.byPlayer || e.source === 'player' || e.shooter === game.player);
    if (npc) {
      const now = ctx ? ctx.currentTime : 0;
      while (npcShots.length && now - npcShots[0] > 0.7) npcShots.shift();
      if (npcShots.length >= 3) return; // cap overlapping NPC gunfire voices
      npcShots.push(now);
      play(w, { position: { x: p.x, y: p.y ?? 1.4, z: p.z }, volume: 0.5 * rnd(0.85, 1), rolloff: 1.9, ref: 8, nodedupe: true });
    } else play(w, { position: { x: p.x, y: p.y ?? 1.4, z: p.z }, volume: 1, nodedupe: true });
    // ejected casing tinkle (nearby shooters only)
    if (w !== 'shotgun' && w !== 'sawnoff' && w !== 'explosion' && game.camera && Math.hypot(p.x - game.camera.position.x, p.z - game.camera.position.z) < 25 && Math.random() < 0.7) {
      let s = ''; try { s = game.city?.surfaceAt?.(p.x, p.z) || ''; } catch (er) { /* */ }
      const k = /grass|dirt|sand|gravel/.test(s) ? 'casing_grass' : /wood/.test(s) ? 'casing_wood' : 'casing_concrete';
      const t0 = ctx ? ctx.currentTime : 0;
      if (ctx && hasKey('combat', k)) { const d = out({ position: { x: p.x + rnd(-0.6, 0.6), y: 0.05, z: p.z + rnd(-0.6, 0.6) }, volume: 0.35, ref: 1.5 }); real(d, t0 + rnd(0.35, 0.6), 'combat', k); }
    }
  });
  game.on?.('crash', (e) => {
    if (!e) return;
    const p = e.point || e.vehicle?.mesh?.position || game.player.position;
    play('car_crash', { position: { x: p.x, y: p.y ?? 0.8, z: p.z }, impulse: e.impulse, volume: 1 });
  });

  // ---------- ambience ----------
  const amb = { birdT: 1, cricketT: 0.5, music: null, musicBeat: 0, musicNext: 0 };
  function chirp(t, pos) {
    const d = out({ position: pos, volume: rnd(0.12, 0.25), ref: 6, rolloff: 1 });
    const base = rnd(2800, 4800), n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone(d, t + i * rnd(0.07, 0.12), { f0: base * rnd(0.9, 1.1), f1: base * rnd(1.2, 1.5), attack: 0.005, decay: 0.05, gain: 0.5 });
  }
  function cricket(t, pos) {
    const d = out({ position: pos, volume: rnd(0.05, 0.1), ref: 5, rolloff: 1 });
    const fq = rnd(4300, 4900);
    for (let i = 0; i < 3; i++) { const tt = t + i * 0.06; for (let j = 0; j < 4; j++) tone(d, tt + j * 0.012, { f0: fq, attack: 0.002, decay: 0.008, gain: 0.5 }); }
  }
  // tiny procedural club loop played from the nearest shop at night (muffled through walls)
  function musicTick(src, now) {
    const beat = 60 / 112;
    while (amb.musicNext < now + 0.2) {
      const t = amb.musicNext, i = amb.musicBeat++;
      tone(src.in, t, { f0: 110, f1: 45, decay: 0.18, gain: 1.0 }); // kick
      if (i % 2 === 1) burst(src.in, t, { type: 'bandpass', freq: 1800, q: 0.8, decay: 0.12, gain: 0.35 }); // clap
      burst(src.in, t + beat / 2, { type: 'highpass', freq: 7000, decay: 0.03, gain: 0.25 }); // hat
      const roots = [55, 55, 49, 41.2][Math.floor(i / 4) % 4];
      tone(src.in, t + beat / 2, { type: 'sawtooth', f0: roots * 2, decay: 0.2, gain: 0.35 }); // bass
      amb.musicNext += beat;
    }
  }

  // ---------- engines (sample-based, RPM-crossfaded) ----------
  // Each layer: recorded loop + the approx engine rpm it was recorded at. Playback rate = rpm / recRpm * pitch.
  const ENGINE = {
    i4: { layers: [['i4_idle', 850], ['i4_mid', 2900], ['i4_high', 5200]], pitch: 1.0, bright: 1.0, turbo: false, pops: 0.15, gain: 0.9 },
    v6: { layers: [['v6_idle', 800], ['v6_mid', 2600], ['v6_high', 5600]], pitch: 1.0, bright: 0.9, turbo: false, pops: 0.25, gain: 1.0 },
    v8: { layers: [['v8_idle', 750], ['v8_mid', 2400], ['v8_high', 4600]], pitch: 1.0, bright: 0.75, turbo: false, pops: 0.6, gain: 1.15 },
    v10: { layers: [['v10_idle', 900], ['v10_mid', 3200], ['v10_high', 7200]], pitch: 1.0, bright: 1.15, turbo: false, pops: 0.7, gain: 1.05 },
    v12: { layers: [['v10_idle', 900], ['v10_mid', 3000], ['v10_high', 6600]], pitch: 1.12, bright: 1.3, turbo: true, pops: 0.8, gain: 1.05 },
    diesel: { layers: [['diesel_idle', 650], ['diesel_mid', 1700]], pitch: 1.0, bright: 0.6, turbo: true, pops: 0, gain: 1.2 },
    electric: { layers: [], electric: true, gain: 1 },
  };
  // extra characters (real recordings in /assets/audio/vehicles); legacy WAV layers used until those load
  ENGINE.i3 = { ...ENGINE.i4, pitch: 1.1, pops: 0.05, gain: 0.8 };
  ENGINE.i4turbo = { ...ENGINE.i4, turbo: true, pops: 0.5, bright: 1.15 };
  ENGINE.flat6 = { ...ENGINE.v6, pitch: 1.1, pops: 0.5, bright: 1.2 };
  ENGINE.bus = { ...ENGINE.diesel, pitch: 0.85, turbo: false, gain: 1.25 };
  ENGINE.moto = { ...ENGINE.i4, pitch: 1.35, pops: 0.4, bright: 1.3, gain: 0.9 };
  const CLASS_ENGINE = { compact: 'i3', hatch: 'i3', taxi: 'i4', sedan: 'v6', suv: 'v6', police: 'v8', muscle: 'v8', pickup: 'v8', sports: 'i4turbo', super: 'v12', van: 'diesel', truck: 'diesel', bus: 'bus', moto: 'moto', motorcycle: 'moto', bike: 'moto', electric: 'electric' };
  const DEF_RPM = { i3: [900, 6200], i4: [850, 6500], i4turbo: [850, 7000], v6: [800, 6500], flat6: [900, 8500], v8: [700, 6000], v10: [950, 8500], v12: [950, 8800], diesel: [650, 4200], bus: [600, 2800], moto: [1200, 10000], electric: [0, 12000] };
  // real engine layers for a character: [{ buf, rpm, gain }] sorted by rpm, or null while loading / unavailable
  const REAL_ENGINE_ALIAS = { flat6: 'i4turbo' };
  function realEngineLayers(kind) {
    const b = BANK.vehicles; if (!b?.idx) return null;
    const k = b.idx[`${kind}_idle`] ? kind : REAL_ENGINE_ALIAS[kind];
    if (!k || !b.idx[`${k}_idle`]) return null;
    const out = [];
    let pending = false;
    for (const suf of ['idle', 'low', 'mid', 'high']) {
      const e = b.idx[`${k}_${suf}`]; if (!e) continue;
      const v = getVar('vehicles', `${k}_${suf}`);
      if (!v) { pending = true; continue; }
      out.push({ buf: v.buf, rpm: e.rpm || 1000, gain: (e.gain ?? 1) * (e.norm?.[v.i] ?? 1) });
    }
    if (pending || !out.length) return null;
    return out.sort((a, c) => a.rpm - c.rpm);
  }
  function engineOneShot(car, which) {
    if (!ctx || !car?.mesh) return;
    const now = ctx.currentTime;
    if (car._sndOneShot && car._sndOneShot.w === which && now - car._sndOneShot.t < 1.5) return;
    car._sndOneShot = { w: which, t: now };
    const kind = engineKind(car);
    const key = hasKey('vehicles', `${kind}_${which}`) ? `${kind}_${which}` : kind === 'bus' && hasKey('vehicles', `diesel_${which}`) ? `diesel_${which}` : `car_${which}`;
    const p = car.mesh.position;
    const isP = car === game.player?.state?.vehicle;
    const dst = isP ? (() => { const g = ctx.createGain(); g.gain.value = VMIX.oneShot; g.connect(carBus._fx); return g; })() : out({ position: { x: p.x, y: p.y + 0.5, z: p.z }, volume: 0.8, ref: 5, bus: vehBus });
    real(dst, now + 0.01, 'vehicles', key);
  }
  const voices = new Map(); // car -> voice
  const MAX_AI_VOICES = 4;
  const carClass = (car) => car.model?.class || car.typeKey || car.type || 'sedan';
  function engineKind(car) {
    const m = car.model || {}, cls = carClass(car);
    let k = m.engine;
    if (cls === 'bus' || cls === 'moto' || cls === 'motorcycle') return CLASS_ENGINE[cls];
    if (k === 'i4' && (m.turbo || cls === 'sports')) k = 'i4turbo';
    if (k === 'diesel' && cls === 'bus') k = 'bus';
    if (k && ENGINE[k]) return k;
    return CLASS_ENGINE[cls] || 'v6';
  }
  let satCurve = null;
  function SAT() { // soft tanh saturation (shared curve, cheap)
    if (!satCurve) { satCurve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; satCurve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); } }
    const w = ctx.createWaveShaper(); w.curve = satCurve; w.oversample = 'none'; return w;
  }
  function makeVoice(car, isPlayer) {
    getVar('vehicles', 'squeal_asphalt'); getVar('vehicles', 'skid_concrete');
    const kind = engineKind(car), E = ENGINE[kind];
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 0.7;
    const sum = ctx.createGain(); sum.gain.value = 1;
    // tone: +5 dB low shelf under 150 Hz, mild saturation for harmonics
    const shelf = ctx.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 150; shelf.gain.value = 5;
    sum.connect(lp).connect(shelf).connect(SAT()).connect(out);
    // engine-synced sub (firing frequency + octave below for V8 and up), rises with load
    const CYL = { i3: 3, i4: 4, i4turbo: 4, v6: 6, flat6: 6, v8: 8, v10: 10, v12: 12, diesel: 6, bus: 6, moto: 2, electric: 0 }[kind] || 4;
    let sub = null;
    if (!E.electric) {
      const s1 = ctx.createOscillator(); s1.type = 'sine';
      const s2 = ctx.createOscillator(); s2.type = 'triangle';
      const g1 = ctx.createGain(), g2 = ctx.createGain(); g1.gain.value = 0; g2.gain.value = 0;
      const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 180;
      s1.connect(g1).connect(sl); s2.connect(g2).connect(sl); sl.connect(out); s1.start(); s2.start();
      sub = { s1, s2, g1, g2, cyl: CYL, oct: CYL >= 8 };
    }
    // intake/induction layer for sports / super / muscle: bright band of the engine itself, opens with throttle
    let intake = null;
    if (/sports|super|muscle/.test(carClass(car))) {
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1400; hp.Q.value = 0.7;
      const ig = ctx.createGain(); ig.gain.value = 0; sum.connect(hp).connect(ig).connect(out); intake = { ig };
    }
    let pan = null;
    if (isPlayer) out.connect(carBus._engine);
    else { pan = panner(3.5, 1.3, 200); out.connect(pan).connect(vehBus); }
    const v = { sub, intake, car, kind, E, isPlayer, out, lp, sum, pan, layers: [], rpm: DEF_RPM[kind][0], gear: 1, prevThr: 0, shiftT: 0, popT: 0, popN: 0, dead: false, prevGear: 1, squeal: null, turbo: null, el: null };
    if (E.electric) {
      const o1 = ctx.createOscillator(); o1.type = 'sine';
      const o2 = ctx.createOscillator(); o2.type = 'triangle';
      const g1 = ctx.createGain(), g2 = ctx.createGain(); g1.gain.value = 0; g2.gain.value = 0;
      const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 50;
      const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 220; const hg = ctx.createGain(); hg.gain.value = 0;
      o1.connect(g1).connect(sum); o2.connect(g2).connect(sum); hum.connect(hf).connect(hg).connect(sum);
      o1.start(); o2.start(); hum.start();
      v.el = { o1, o2, g1, g2, hum, hg };
    } else {
      const rl = realEngineLayers(kind);
      const src = rl ? rl.map((x) => [x.buf, x.rpm, x.gain]) : E.layers.map(([name, rpm]) => [BUF[name], rpm, 1]).filter((x) => x[0]);
      v.src = rl ? 'real' : src.length ? 'legacy' : 'synth';
      for (const [b, recRpm, lg] of src) {
        const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
        const g = ctx.createGain(); g.gain.value = 0;
        s.connect(g).connect(sum); s.start(ctx.currentTime, Math.random() * b.duration);
        v.layers.push({ s, g, recRpm, lg: Math.min(1.5, lg) });
      }
      if (!v.layers.length) { // samples not loaded yet: simple synth engine
        const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
        const o2 = ctx.createOscillator(); o2.type = 'square';
        const g = ctx.createGain(); g.gain.value = 0;
        o1.connect(g); o2.connect(g); g.connect(sum); o1.start(); o2.start();
        v.synth = { o1, o2, g };
      }
    }
    if (E.turbo || carClass(car) === 'sports' || carClass(car) === 'super') {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2000;
      const g = ctx.createGain(); g.gain.value = 0; o.connect(g).connect(out); o.start();
      v.turbo = { o, g };
    }
    // tire squeal: noise through two resonant bands that wander a little
    const n = ctx.createBufferSource(); n.buffer = noiseW; n.loop = true;
    const b1 = ctx.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = 1900; b1.Q.value = 14;
    const b2 = ctx.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = 2900; b2.Q.value = 18;
    const sg = ctx.createGain(); sg.gain.value = 0;
    n.connect(b1).connect(sg); n.connect(b2).connect(sg);
    sg.connect(isPlayer ? carBus._squeal : pan); n.start(ctx.currentTime, Math.random());
    v.squeal = { n, b1, b2, g: sg, amt: 0, surfT: 0, hard: 'asphalt', real: null };
    const ra = getVar('vehicles', 'squeal_asphalt'), rc = getVar('vehicles', 'skid_concrete'), rg = getVar('vehicles', 'skid_gravel');
    if (ra) {
      const mk = (x) => { if (!x) return null; const s2 = ctx.createBufferSource(); s2.buffer = x.buf; s2.loop = true; const g2 = ctx.createGain(); g2.gain.value = 0; s2.connect(g2).connect(isPlayer ? carBus._squeal : pan); s2.start(ctx.currentTime, Math.random() * x.buf.duration); return { s: s2, g: g2, k: (x.e.gain ?? 1) * (x.e.norm?.[x.i] ?? 1) }; };
      v.squeal.real = { asphalt: mk(ra), concrete: mk(rc), gravel: mk(rg) };
    }
    return v;
  }
  function killVoice(v) {
    if (v.dead) return; v.dead = true;
    const t = ctx.currentTime;
    v.out.gain.setTargetAtTime(0, t, 0.12); v.squeal.g.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => {
      try {
        for (const l of v.layers) l.s.stop();
        if (v.synth) { v.synth.o1.stop(); v.synth.o2.stop(); }
        if (v.el) { v.el.o1.stop(); v.el.o2.stop(); v.el.hum.stop(); }
        if (v.turbo) v.turbo.o.stop();
        if (v.sub) { v.sub.s1.stop(); v.sub.s2.stop(); }
        v.squeal.n.stop(); v.out.disconnect(); v.squeal.g.disconnect();
        for (const x of Object.values(v.squeal.real || {})) if (x) { x.s.stop(); x.g.disconnect(); }
      } catch (e) { /* */ }
    }, 900);
  }
  // rpm/throttle/load/gear: read CONTRACT3 fields, else simulate a gearbox from speed
  function engineState(v, dt) {
    const car = v.car, m = car.model || {};
    const [defIdle, defMax] = DEF_RPM[v.kind];
    const idle = m.idleRpm || defIdle, max = m.maxRpm || defMax;
    let thr = car.throttle;
    if (typeof thr !== 'number') thr = car.ctrl?.throttle ?? (v.isPlayer && game.input?.down?.('KeyW') ? 1 : 0);
    thr = Math.min(1, Math.abs(thr || 0));
    const kmh = Math.abs(car.speedKmh ?? (car.speed || 0) * 3.6);
    let rpm, gear, load;
    if (typeof car.rpm === 'number' && car.rpm > 0) {
      rpm = car.rpm; gear = car.gear ?? 1;
      load = typeof car.load === 'number' ? car.load : thr;
      v.rpm += (rpm - v.rpm) * Math.min(1, dt * 20);
    } else {
      const vmax = (car.spec?.vmax ? car.spec.vmax * 3.6 : m.vmax) || 180;
      const nG = m.gears || (v.kind === 'v10' || v.kind === 'v12' ? 6 : 5);
      const reverse = (car.speed ?? 0) < -0.5 || car.gear === -1;
      gear = 1;
      const top = (g) => vmax * Math.pow(g / nG, 0.85) * 1.02;
      while (gear < nG && kmh > top(gear) - (gear === v.gear ? -4 : 2)) gear++; // small hysteresis
      if (reverse) gear = -1;
      const lo = gear > 1 ? top(gear - 1) * 0.92 : 0, hi = top(Math.max(1, gear));
      const frac = Math.max(0, Math.min(1, (kmh - lo) / Math.max(1, hi - lo)));
      let target = gear === 1 || gear === -1 ? idle + (max * 0.85 - idle) * frac : max * (0.5 + 0.42 * frac);
      if (kmh < 12) target = Math.max(target, idle + thr * (max - idle) * 0.55); // revving / launching
      if (thr < 0.05 && kmh < 3) target = idle;
      const k = target > v.rpm ? (5 + thr * 6) : 3.5;
      v.rpm += (target - v.rpm) * Math.min(1, dt * k);
      load = thr;
    }
    if (gear !== v.gear) {
      if (gear > v.gear && v.gear >= 1 && thr > 0.3) { v.shiftT = 0.16; if (ctx) real(fxDst(v, VMIX.shift), ctx.currentTime + 0.01, 'vehicles', 'shift'); } // upshift: torque cut + clunk
      v.prevGear = v.gear; v.gear = gear;
    }
    v.rpm = Math.max(idle * 0.9, Math.min(max * 1.02, v.rpm));
    return { rpm: v.rpm, idle, max, thr, load: Math.max(0, Math.min(1, load)), kmh, gear };
  }
  function lateralSlip(car) {
    if (typeof car.slip === 'number') return car.slip;
    try {
      const lv = car.body?.linvel?.(), q = car.mesh?.quaternion; if (!lv || !q) return 0;
      const rx = 1 - 2 * (q.y * q.y + q.z * q.z), ry = 2 * (q.x * q.y + q.w * q.z), rz = 2 * (q.x * q.z - q.w * q.y);
      const lat = Math.abs(lv.x * rx + lv.y * ry + lv.z * rz);
      return Math.max(0, Math.min(1, (lat - 2.0) / 5.5));
    } catch (e) { return 0; }
  }
  function updateVoice(v, dt, t) {
    const car = v.car, E = v.E;
    const st = engineState(v, dt);
    v.dop = 1;
    if (!v.isPlayer && car.mesh && game.camera) { // Doppler: f' = f (c + v_listener·n) / (c + v_source·n), n = listener->source
      try {
        const c = game.camera.position, p = car.mesh.position, lv = car.body?.linvel?.();
        const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d = Math.hypot(dx, dy, dz) || 1;
        const vs = lv ? (lv.x * dx + lv.y * dy + lv.z * dz) / d : 0;
        const vl = (camVel.x * dx + camVel.y * dy + camVel.z * dz) / d;
        v.dop = Math.max(0.8, Math.min(1.25, (343 + vl) / (343 + vs)));
      } catch (e) { /* */ }
    }
    const r = (st.rpm - st.idle) / Math.max(1, st.max - st.idle); // 0..1
    const disabled = car.disabled || car.destroyed || (car.health !== undefined && car.health <= 0);
    v.shiftT = Math.max(0, v.shiftT - dt);
    const shiftDip = v.shiftT > 0 ? 0.45 : 1;
    const load = st.load * (v.shiftT > 0 ? 0.2 : 1);
    // overrun crackle: big throttle lift at high rpm
    if (E.pops && v.prevThr > 0.6 && st.thr < 0.15 && r > 0.55 && t - (v.popLast || -99) > 3 && Math.random() < E.pops * 0.45) { v.popN = 1 + Math.floor(Math.random() * 3); v.popT = 0.06; v.popLast = t; }
    if (E.turbo && v.turbo && v.prevThr > 0.6 && st.thr < 0.15 && r > 0.35) blowOff(v, t);
    v.prevThr = st.thr;
    if (v.popN > 0) {
      v.popT -= dt;
      if (v.popT <= 0) {
        v.popN--; v.popT = rnd(0.05, 0.16);
        const dst = fxDst(v, VMIX.pops * rnd(0.6, 1));
        if (!real(dst, t + 0.01, 'vehicles', 'crackle', { rate: rnd(0.9, 1.1) })) crackle(dst, t + 0.01, 1);
      }
    }
    const vol = (v.isPlayer ? VMIX.engine : VMIX.aiEngine * (/super|sports|muscle/.test(carClass(car)) ? MIXK.aiLoud : 1)) * (v.src === 'real' ? 1 : 0.35) * (disabled ? 0 : 1);
    if (v.el) { // electric: rising inverter whine + motor hum
      const sp = Math.min(1, st.kmh / 180);
      v.el.o1.frequency.setTargetAtTime(180 + sp * 2600, t, 0.05);
      v.el.o2.frequency.setTargetAtTime(90 + sp * 1300, t, 0.05);
      v.el.g1.gain.setTargetAtTime(0.06 + 0.12 * st.thr * (0.3 + sp), t, 0.08);
      v.el.g2.gain.setTargetAtTime(0.08 * (0.3 + sp), t, 0.08);
      v.el.hg.gain.setTargetAtTime(0.15 + 0.2 * st.thr, t, 0.08);
      v.lp.frequency.setTargetAtTime(4000, t, 0.1);
    } else if (v.synth) {
      const hz = st.rpm / 60 * (v.kind === 'v8' ? 4 : v.kind === 'i4' ? 2 : 3);
      v.synth.o1.frequency.setTargetAtTime(hz, t, 0.03); v.synth.o2.frequency.setTargetAtTime(hz / 2, t, 0.03);
      v.synth.g.gain.setTargetAtTime(0.12 + 0.12 * load, t, 0.05);
      v.lp.frequency.setTargetAtTime(400 + r * 2500 + load * 800, t, 0.05);
    } else {
      // equal-power crossfade between the two layers bracketing the current rpm
      const L = v.layers, rpmP = st.rpm * (E.pitch || 1);
      for (let i = 0; i < L.length; i++) {
        let w;
        const a = L[i - 1]?.recRpm, b = L[i].recRpm, c = L[i + 1]?.recRpm;
        if (rpmP <= b) w = a === undefined ? 1 : Math.max(0, (rpmP - a) / (b - a));
        else w = c === undefined ? 1 : Math.max(0, (c - rpmP) / (c - b));
        w = Math.sin(Math.min(1, w) * Math.PI / 2);
        // on-load layers louder; idle layer fades when the car is pulling hard
        const isIdle = i === 0;
        const lw = isIdle ? (0.85 + 0.15 * load) : (0.55 + 0.45 * load);
        L[i].g.gain.setTargetAtTime(w * lw * (L[i].lg || 1), t, 0.04);
        const rate = Math.max(0.5, Math.min(2.3, rpmP / L[i].recRpm)) * v.dop;
        L[i].s.playbackRate.setTargetAtTime(rate, t, 0.03);
      }
      const bright = E.bright || 1;
      v.lp.frequency.setTargetAtTime(Math.min(16000, (900 + 5200 * (0.25 + 0.75 * load) * (0.4 + 0.6 * r)) * bright), t, 0.05);
    }
    const lift = 0.6 + 0.4 * load; // off-load / idle sit ~3 dB under on-load
    v.out.gain.setTargetAtTime(vol * lift * shiftDip * (v.isPlayer ? 1 : Math.min(1, 0.35 + st.kmh / 40)), t, v.shiftT > 0 ? 0.02 : 0.06);
    if (v.sub) { // firing frequency = rpm/60 * cylinders/2 (4-stroke)
      const ff = Math.max(18, Math.min(400, st.rpm / 60 * v.sub.cyl / 2));
      v.sub.s1.frequency.setTargetAtTime(ff, t, 0.03); v.sub.s2.frequency.setTargetAtTime(ff / 2, t, 0.03);
      const sg = 0.035 * (0.35 + 0.65 * load) * (ff < 160 ? 1 : 160 / ff);
      v.sub.g1.gain.setTargetAtTime(sg, t, 0.05); v.sub.g2.gain.setTargetAtTime(v.sub.oct ? sg * 0.8 : 0, t, 0.05);
    }
    if (v.intake) v.intake.ig.gain.setTargetAtTime(0.35 * load * (0.3 + 0.7 * r), t, 0.06);
    if (v.turbo) {
      const spool = load * Math.max(0, r - 0.2);
      v.turbo.o.frequency.setTargetAtTime(1800 + r * 4200, t, 0.1);
      v.turbo.g.gain.setTargetAtTime(spool * 0.012 * VMIX.turbo * VMIX.engine, t, 0.15);
    }
    if (!v.isPlayer) setPos(v.pan, { x: car.mesh.position.x, y: car.mesh.position.y + 0.5, z: car.mesh.position.z });
    // tires
    let sq = lateralSlip(car);
    if (car.ctrl?.handbrake && st.kmh > 15) sq = Math.max(sq, 0.55);
    if (car.braking && st.kmh > 45 && (car.ctrl?.brake ?? 0) > 0.8) sq = Math.max(sq, 0.3);
    if (v.rpm > st.max * 0.6 && st.kmh < 20 && st.thr > 0.9 && st.gear === 1) sq = Math.max(sq, 0.5); // burnout / launch
    if (st.kmh < 6) sq *= st.kmh / 6;
    if (car.airborne || car.inWater) sq = 0;
    v.squeal.amt += (sq - v.squeal.amt) * Math.min(1, dt * 10);
    const sa = v.squeal.amt;
    const R = v.squeal.real;
    if (R) {
      v.squeal.surfT -= dt;
      if (v.squeal.surfT <= 0) {
        v.squeal.surfT = 0.3;
        let su = 'asphalt'; try { su = game.city?.surfaceAt?.(car.mesh.position.x, car.mesh.position.z) || 'asphalt'; } catch (e) { /* */ }
        v.squeal.hard = /gravel|dirt|sand|grass/.test(su) ? 'gravel' : /concrete|pavers|tile|metal/.test(su) ? 'concrete' : 'asphalt';
      }
      const sel = R[v.squeal.hard] ? v.squeal.hard : 'asphalt';
      for (const [k, x] of Object.entries(R)) if (x) {
        x.g.gain.setTargetAtTime(k === sel ? sa * x.k * VMIX.squeal * VMIX.engine : 0, t, 0.06);
        x.s.playbackRate.setTargetAtTime(0.9 + 0.2 * sa + Math.min(0.15, st.kmh / 800), t, 0.1);
      }
      v.squeal.g.gain.setTargetAtTime(0, t, 0.05);
    } else v.squeal.g.gain.setTargetAtTime(sa * (v.isPlayer ? 0.22 : 0.3), t, 0.05);
    const wob = Math.sin(t * 7.3 + v.rpm * 0.001) * 120;
    v.squeal.b1.frequency.setTargetAtTime(1700 + sa * 500 + wob, t, 0.05);
    v.squeal.b2.frequency.setTargetAtTime(2700 + sa * 600 - wob, t, 0.05);
    return st;
  }
  function fxDst(v, level) {
    const g = ctx.createGain(); g.gain.value = level * (v.isPlayer ? 1 : 0.8);
    g.connect(v.isPlayer ? carBus._fx : v.pan); return g;
  }
  function blowOff(v, t) {
    if (t - (v.boT || -9) < 1.5) return; v.boT = t;
    const dst = fxDst(v, VMIX.blowoff);
    if (real(dst, t + 0.02, 'vehicles', 'blowoff', { rate: rnd(0.95, 1.05) })) return;
    burst(dst, t + 0.02, { type: 'highpass', freq: 2500, attack: 0.01, decay: 0.35, gain: 0.12 });
    burst(dst, t + 0.02, { type: 'bandpass', freq: 5000, freqEnd: 2200, q: 2, attack: 0.01, decay: 0.3, gain: 0.08 });
  }
  const camVel = { x: 0, y: 0, z: 0 }, camPrev = { x: 0, y: 0, z: 0, ok: false };
  let lastPc = null;
  function updateEngines(dt, t, muted) {
    const st = game.player?.state;
    const pc = st?.inVehicle && st.vehicle && !muted ? st.vehicle : null;
    const cam = game.camera?.position;
    if (cam && dt > 0) {
      if (camPrev.ok) { const k = Math.min(1, dt * 8); camVel.x += ((cam.x - camPrev.x) / dt - camVel.x) * k; camVel.y += ((cam.y - camPrev.y) / dt - camVel.y) * k; camVel.z += ((cam.z - camPrev.z) / dt - camVel.z) * k; }
      if (Math.hypot(cam.x - camPrev.x, cam.z - camPrev.z) > 50) camVel.x = camVel.y = camVel.z = 0; // teleport
      camPrev.x = cam.x; camPrev.y = cam.y; camPrev.z = cam.z; camPrev.ok = true;
    }
    // enter/exit: startup / shutdown (also triggered by 'engineStart'/'engineStop' events). Track the REAL car the player is in,
    // not the muted one: pausing (muted) used to read as "left the car", so unpausing replayed the startup crank (user report)
    const inCar = st?.inVehicle && st.vehicle ? st.vehicle : null;
    if (!muted && inCar !== lastPc) {
      if (inCar && inCar.engineOn !== false) engineOneShot(inCar, 'start');
      if (lastPc && !inCar && lastPc.engineOn !== true) engineOneShot(lastPc, 'stop');
      lastPc = inCar;
    }
    const want = new Set();
    if (pc) want.add(pc);
    if (cam && !muted) {
      const near = [];
      for (const c of game.vehicles?.list || []) {
        if (c === pc || !c.mesh || c.disabled || c.destroyed) continue;
        if (!c.ai && !c.playerDriven && !(c.driver || c.npcDriver)) continue; // parked = engine off
        const p = c.mesh.position, d = Math.hypot(p.x - cam.x, p.z - cam.z);
        if (d < 70) near.push([d, c]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < Math.min(MAX_AI_VOICES, near.length); i++) want.add(near[i][1]);
      for (const c of want) if (c.engineOn === false) want.delete(c);
    }
    for (const [car, v] of voices) {
      const upgrade = v.src !== 'real' && !v.E.electric && realEngineLayers(v.kind);
      if (!want.has(car) || v.isPlayer !== (car === pc) || v.kind !== engineKind(car) || upgrade || (v.synth && v.E.layers.every(([n]) => BUF[n]))) { killVoice(v); voices.delete(car); }
    }
    let pst = null;
    for (const car of want) {
      let v = voices.get(car);
      if (!v) { v = makeVoice(car, car === pc); voices.set(car, v); }
      const s = updateVoice(v, dt, t);
      if (car === pc) pst = s;
    }
    // wind + cabin muffling for the player car
    if (pc && pst) {
      const sp = Math.pow(Math.min(1, pst.kmh / 220), 1.25); // gentle under ~100 km/h, a soft rush only at real speed
      const inside = cam && pc.mesh ? cam.distanceTo?.(pc.mesh.position) < 2.6 : false;
      eng.wg.gain.setTargetAtTime(sp * sp * (inside ? 0.4 : 1) * VMIX.wind, t, 0.2);
      eng.wf.frequency.setTargetAtTime(500 + sp * 900, t, 0.3);
      eng.wg2.gain.setTargetAtTime(sp * sp * (inside ? 0.05 : 0.16) * VMIX.wind, t, 0.2);
      eng.cabin.frequency.setTargetAtTime(inside ? 1400 : 20000, t, 0.15);
    } else {
      eng.wg.gain.setTargetAtTime(0, t, 0.2); eng.wg2.gain.setTargetAtTime(0, t, 0.2);
      eng.cabin.frequency.setTargetAtTime(20000, t, 0.2);
    }
  }

  // ---------- ambience beds by zone / time of day (real recordings) ----------
  const ZONE_BEDS = {
    beach: { bed_beach: 0.5, bed_wind_coast: 0.22 }, // playtest: surf was too loud (-6 dB)
    nightlife: { bed_downtown: 0.55, bed_crowd: 0.8 },
    downtown: { bed_downtown: 1, bed_crowd: 0.3 },
    business: { bed_downtown: 0.9, bed_crowd: 0.2 },
    commercial: { bed_downtown: 0.7, bed_crowd: 0.35 },
    residential: { bed_residential: 1 },
    park: { bed_park_day: 1 },
    port: { bed_port: 1, bed_wind_coast: 0.2 },
    industrial: { bed_port: 0.6, bed_downtown: 0.4 },
    causeway: { bed_wind_coast: 1, bed_downtown: 0.3 },
    water: { bed_wind_coast: 0.6, bed_beach: 0.15, bed_port: 0.3 },
  };
  const NIGHT_BEDS = { residential: { bed_night_crickets: 0.9, bed_residential: 0.3 }, park: { bed_night_crickets: 1, bed_frogs: 0.7 }, beach: { bed_beach: 0.5, bed_wind_coast: 0.2, bed_night_crickets: 0.15 } };
  const ZONE_SHOTS = {
    beach: [['gull', 1]], port: [['gull', 1], ['ship_horn', 0.15], ['crane_clank', 0.6], ['reverse_beep', 0.3]], water: [['gull', 1], ['ship_horn', 0.1]],
    residential: [['songbird', 1], ['dog_bark', 0.5], ['parrot', 0.35], ['distant_horn', 0.2]], park: [['songbird', 1], ['parrot', 0.5], ['dog_bark', 0.2]],
    downtown: [['distant_horn', 1], ['distant_siren', 0.25], ['helicopter', 0.05]], business: [['distant_horn', 1], ['distant_siren', 0.2]],
    commercial: [['distant_horn', 0.8], ['songbird', 0.3]], nightlife: [['distant_horn', 0.7], ['distant_siren', 0.3]], causeway: [['gull', 0.6], ['distant_horn', 0.3]],
    industrial: [['reverse_beep', 0.6], ['crane_clank', 0.4], ['distant_horn', 0.4]],
  };
  const NIGHT_OK = new Set(['dog_bark', 'distant_horn', 'distant_siren', 'ship_horn', 'crane_clank', 'helicopter']);
  const beds = new Map(); // key -> { src, g }
  const bedState = { t: 0, mix: {}, shotT: 3, zone: null, airT: 60 };
  function zoneAt(x, z) {
    try { const zz = game.city?.zoneAt?.(x, z); if (zz) return zz; } catch (e) { /* */ }
    return x > 505 ? 'water' : x > 440 ? 'beach' : Math.abs(x) < 150 ? 'downtown' : 'residential';
  }
  function updateBeds(dt, t, pp, indoor, night, day, muted) {
    if (!pp || !Number.isFinite(pp.x + pp.z)) return beds.size > 0;
    if (!BANK.ambience?.idx || !Object.keys(BANK.ambience.idx).length) return false;
    bedState.t -= dt;
    if (bedState.t <= 0) { // sample zones around the listener -> smooth blended mix
      bedState.t = 0.5;
      const mix = {}; let wsum = 0;
      const pts = [[0, 0, 2], [70, 0, 1], [-70, 0, 1], [0, 70, 1], [0, -70, 1]];
      for (const [dx, dz, w] of pts) {
        const zn = zoneAt(pp.x + dx, pp.z + dz);
        if (dx === 0 && dz === 0) bedState.zone = zn;
        const set = (night && NIGHT_BEDS[zn]) || ZONE_BEDS[zn] || ZONE_BEDS.residential;
        for (const [k, g] of Object.entries(set)) mix[k] = (mix[k] || 0) + g * w;
        wsum += w;
      }
      for (const k in mix) mix[k] /= wsum;
      if (night) { if (mix.bed_downtown) mix.bed_downtown *= bedState.zone === 'nightlife' ? 0.9 : 0.6; if (mix.bed_crowd && bedState.zone !== 'nightlife') mix.bed_crowd *= 0.3; }
      let sea = -0.12; try { sea = game.city?.seaLevel ?? sea; } catch (e) { /* */ }
      if (game.camera && game.camera.position.y < sea - 0.2) { for (const k in mix) mix[k] *= 0.06; mix.bed_underwater = 1; }
      if (indoor) {
        for (const k in mix) mix[k] *= 0.12;
        let ty = ''; try { const sh = (game.interiors?.list || []).find((x) => x.isInside?.(game.player?.position)); ty = String(sh?.type || sh?.kind || sh?.name || ''); } catch (e) { /* */ }
        const vb = /cafe|coffee|bakery/i.test(ty) ? 'venues:bed_cafe' : /restaurant|diner|kitchen|food|pizza|taco|burger|grill/i.test(ty) ? 'venues:bed_kitchen'
          : /bar|club|lounge|pub|cantina/i.test(ty) ? 'venues:bed_bar_chatter' : /store|market|grocery|convenience|liquor|gas|pharm|shop/i.test(ty) ? 'venues:bed_store' : null;
        mix.bed_interior_shop = vb ? 0.35 : 0.9;
        if (vb) mix[vb] = vb.endsWith('kitchen') ? 0.55 : 0.9;
      }
      bedState.mix = mix;
    }
    const idx = BANK.ambience.idx;
    for (const k of new Set([...Object.keys(bedState.mix), ...beds.keys()])) {
      const want = muted ? 0 : (bedState.mix[k] || 0);
      let b = beds.get(k);
      const [bc, bk] = k.includes(':') ? k.split(':') : ['ambience', k];
      if (!b && want > 0.02 && (bc === 'ambience' ? idx[k] : (bank(bc), hasKey(bc, bk)))) {
        const v = getVar(bc, bk);
        if (v) {
          const src = ctx.createBufferSource(); src.buffer = v.buf; src.loop = true;
          const g = ctx.createGain(); g.gain.value = 0;
          src.connect(g).connect(ambBus); src.start(ctx.currentTime, Math.random() * v.buf.duration);
          b = { src, g, k: (v.e.gain ?? 1) * (v.e.norm?.[v.i] ?? 1), idle: 0 }; beds.set(k, b);
        }
      }
      if (!b) continue;
      b.g.gain.setTargetAtTime(want * MIXK.bed * b.k, t, 1.2);
      b.idle = want < 0.01 ? b.idle + dt : 0;
      if (b.idle > 6) { try { b.src.stop(); b.g.disconnect(); } catch (e) { /* */ } beds.delete(k); }
    }
    // positional one-shots for the current zone
    if (!muted && !indoor) {
      bedState.shotT -= dt;
      if (bedState.shotT <= 0) {
        bedState.shotT = rnd(3, 9);
        const list = (ZONE_SHOTS[bedState.zone] || []).filter(([k]) => idx[k] && (day || NIGHT_OK.has(k)));
        const tot = list.reduce((a, [, w]) => a + w, 0);
        let r = Math.random() * tot;
        for (const [k, w] of list) {
          if ((r -= w) > 0) continue;
          const a = Math.random() * Math.PI * 2, far = /ship|siren|helicopter|horn/.test(k), rr = far ? rnd(80, 220) : rnd(15, 60);
          const bird = /gull|songbird|parrot/.test(k);
          const d = out({ position: { x: pp.x + Math.cos(a) * rr, y: (bird ? rnd(4, 18) : 1.5), z: pp.z + Math.sin(a) * rr }, volume: far ? rnd(0.5, 0.8) : rnd(0.25, 0.55), ref: far ? 30 : 8, rolloff: 1, far: true });
          real(d, t + 0.02, 'ambience', k, { rate: rnd(0.95, 1.05) });
          break;
        }
      }
      // occasional aircraft overhead
      bedState.airT -= dt;
      if (bedState.airT <= 0) { bedState.airT = rnd(70, 160); if (idx.airplane) { const d = out({ position: { x: pp.x + rnd(-300, 300), y: 300, z: pp.z + rnd(-300, 300) }, volume: 0.6, ref: 120, rolloff: 1 }); real(d, t + 0.05, 'ambience', 'airplane'); } }
    }
    return beds.size > 0;
  }
  // indoor reverb: real impulse response chosen by room size
  const roomState = { ir: null };
  function updateRoom(indoor) {
    let key = null;
    if (indoor) {
      const pp = game.player?.position; let area = 150;
      try { const s = (game.interiors?.list || []).find((x) => x.isInside?.(pp)); if (s) area = s.area || (s.w && s.d ? s.w * s.d : s.size ? s.size.x * s.size.z : 150); } catch (e) { /* */ }
      key = area < 90 ? 'ir_small_room' : area < 500 ? 'ir_medium_room' : 'ir_large_hall';
    } else {
      // under a bridge / overpass: concrete underpass reflections
      try { const pp = game.player?.position; const e = game.city?.roadGraph?.nearestEdge?.(pp.x, pp.z); if (e?.edge?.bridge && e.dist < 12) { const yy = e.edge.y?.[0] ?? 0; if (yy - pp.y > 3) key = 'ir_underpass'; } } catch (e) { /* */ }
    }
    if (!key) key = 'ir_medium_room';
    if (roomState.ir === key) return;
    const v = getVar('ambience', key);
    if (v) { reverb.buffer = v.buf; roomState.ir = key; }
  }

  // ---------- MUSIC: original generative stations (procedural, no samples), rendered offline once, then looped ----------
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function kit(c, noise) {
    const env = (d, t, a, dec, peak) => { const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); g.connect(d); return g; };
    const osc = (type, f, t, dur, d) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(d); o.start(t); o.stop(t + dur + 0.05); return o; };
    const nz = (t, dur, d, type, f, q = 0.8) => { const s = c.createBufferSource(); s.buffer = noise; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl).connect(d); s.start(t, Math.random()); s.stop(t + dur + 0.05); };
    return {
      kick(d, t, g = 1) { const e = env(d, t, 0.002, 0.32, g); const o = osc('sine', 150, t, 0.35, e); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); },
      snare(d, t, g = 0.5, dec = 0.16) { nz(t, dec, env(d, t, 0.001, dec, g), 'bandpass', 1900, 0.7); osc('triangle', 190, t, 0.08, env(d, t, 0.001, 0.07, g * 0.6)); },
      clap(d, t, g = 0.45) { for (let i = 0; i < 3; i++) nz(t + i * 0.011, 0.12, env(d, t + i * 0.011, 0.001, i === 2 ? 0.14 : 0.02, g), 'bandpass', 1400, 1.2); },
      hat(d, t, g = 0.18, open = false) { nz(t, open ? 0.2 : 0.05, env(d, t, 0.001, open ? 0.18 : 0.035, g), 'highpass', 7500); },
      bass(d, t, m, dur, g = 0.5, type = 'sawtooth', cut = 380) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cut * 2.2, t); f.frequency.exponentialRampToValueAtTime(cut, t + 0.08); f.Q.value = 3; f.connect(env(d, t, 0.005, dur, g)); osc(type, midi(m), t, dur, f); osc('sine', midi(m), t, dur, f); },
      sub(d, t, m, dur, g = 0.55) { osc('sine', midi(m), t, dur, env(d, t, 0.01, dur, g)); },
      pluck(d, t, m, g = 0.22, dec = 0.28) { const e = env(d, t, 0.002, dec, g); osc('triangle', midi(m), t, dec, e); osc('sine', midi(m) * 2, t, dec * 0.6, env(d, t, 0.002, dec * 0.5, g * 0.5)); },
      keys(d, t, ms, dur, g = 0.09) { for (const m of ms) { osc('sine', midi(m), t, dur, env(d, t, 0.01, dur, g)); osc('sine', midi(m) * 2.002, t, dur * 0.4, env(d, t, 0.005, dur * 0.35, g * 0.35)); } },
      pad(d, t, ms, dur, g = 0.05, cut = 1400) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; const e = c.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + Math.min(0.6, dur * 0.3)); e.gain.setValueAtTime(g, t + dur * 0.8); e.gain.exponentialRampToValueAtTime(0.0001, t + dur); f.connect(e).connect(d); for (const m of ms) { const o1 = osc('sawtooth', midi(m), t, dur, f); o1.detune.value = -7; const o2 = osc('sawtooth', midi(m), t, dur, f); o2.detune.value = 7; } },
      lead(d, t, m, dur, g = 0.08) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; f.connect(env(d, t, 0.005, dur, g)); osc('square', midi(m), t, dur, f); },
      stab(d, t, ms, g = 0.07) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.25); f.connect(env(d, t, 0.003, 0.3, g)); for (const m of ms) osc('sawtooth', midi(m), t, 0.3, f); },
    };
  }
  const PROG = {
    tropical: [[54, 57, 61], [50, 54, 57], [57, 61, 64], [52, 56, 59]],
    minor: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    hiphop: [[62, 65, 69, 72], [55, 58, 62, 65], [58, 62, 65, 69], [57, 61, 64, 67]],
    house: [[60, 63, 67, 70], [53, 56, 60, 63], [56, 60, 63, 67], [55, 58, 62, 65]],
  };
  const STATIONS = [
    { id: 'tropical', name: 'Southline FM 98.1 · Tropical House', bpm: 118, bars: 16, gen(k, d, spb, bars, R) {
      for (let b = 0; b < bars; b++) { const ch = PROG.tropical[Math.floor(b / 2) % 4], t0 = b * 4 * spb;
        for (let i = 0; i < 4; i++) { const t = t0 + i * spb; k.kick(d, t, 0.9); k.hat(d, t + spb / 2, 0.16); if (b >= 2 && i % 2) k.clap(d, t, 0.32); }
        [0, 0.75, 1.5, 2, 2.75, 3.5].forEach((x, j) => k.bass(d, t0 + x * spb, ch[0] - 24 + (j === 3 ? 12 : 0), spb * 0.45, 0.32, 'triangle', 300));
        for (let s = 0; s < 16; s++) if (b >= 4 && R() > 0.35) k.pluck(d, t0 + s * spb / 4, ch[s % 3] + 12 + (R() > 0.8 ? 12 : 0), 0.13, 0.22);
        if (b % 2 === 0) k.pad(d, t0, ch, 8 * spb, 0.035, 1600); } } },
    { id: 'reggaeton', name: 'Ritmo 104.5 · Reggaetón Beats', bpm: 96, bars: 16, gen(k, d, spb, bars, R) {
      const mot = [0, 2, 3, 2, 0, -2, 0, 3].map((x) => x);
      for (let b = 0; b < bars; b++) { const ch = PROG.minor[b % 4], t0 = b * 4 * spb;
        for (let i = 0; i < 4; i++) { const t = t0 + i * spb; k.kick(d, t, 0.95); k.hat(d, t + spb / 2, 0.12); }
        for (const x of [0.75, 1.5, 2.75, 3.5]) k.snare(d, t0 + x * spb, 0.38, 0.12);
        for (const x of [0, 0.75, 1.5, 2, 2.75, 3.5]) k.sub(d, t0 + x * spb, ch[0] - 24, spb * 0.5, 0.42);
        if (b >= 4) for (let s = 0; s < 8; s++) if (R() > 0.3) k.pluck(d, t0 + s * spb / 2, ch[0] + 12 + (mot[s] || 0), 0.12, 0.2);
        if (b % 4 === 0) k.pad(d, t0, ch, 16 * spb, 0.025, 1100); } } },
    { id: 'synthwave', name: 'Neon 88.7 · Synthwave', bpm: 100, bars: 16, gen(k, d, spb, bars, R) {
      for (let b = 0; b < bars; b++) { const ch = PROG.minor[b % 4], t0 = b * 4 * spb;
        for (let i = 0; i < 4; i++) { const t = t0 + i * spb; k.kick(d, t, 0.85); if (i % 2) k.snare(d, t, 0.42, 0.32); for (let h = 0; h < 4; h++) k.hat(d, t + h * spb / 4, 0.06); }
        for (let e = 0; e < 8; e++) k.bass(d, t0 + e * spb / 2, ch[0] - 24 + (e % 2 ? 12 : 0), spb * 0.4, 0.3, 'sawtooth', 420);
        for (let s = 0; s < 16; s++) k.lead(d, t0 + s * spb / 4, ch[[0, 1, 2, 1][s % 4]] + 12, spb / 4 * 0.8, 0.035);
        k.pad(d, t0, ch.map((m) => m - 12).concat(ch), 4 * spb, 0.03, 1800);
        if (b >= 8 && b % 2 === 0) k.lead(d, t0, ch[2] + 24, 2 * spb, 0.05); } } },
    { id: 'hiphop', name: 'Biscayne 101.3 · Hip-Hop Instrumentals', bpm: 88, bars: 16, gen(k, d, spb, bars, R) {
      const sw = (x) => x + (Math.round(x * 2) % 2 ? 0.08 : 0);
      for (let b = 0; b < bars; b++) { const ch = PROG.hiphop[b % 4], t0 = b * 4 * spb;
        for (const x of [0, 1.75, 2.5]) k.kick(d, t0 + x * spb, 0.95);
        for (const x of [1, 3]) k.snare(d, t0 + x * spb, 0.5, 0.18);
        for (let h = 0; h < 8; h++) k.hat(d, t0 + sw(h / 2) * spb, h % 2 ? 0.07 : 0.11);
        k.keys(d, t0, ch, 2.2 * spb, 0.06); k.keys(d, t0 + 2.5 * spb, ch, 1.4 * spb, 0.05);
        for (const x of [0, 1.75, 2.5]) k.sub(d, t0 + x * spb, ch[0] - 24, spb * 0.8, 0.45);
        if (b >= 8 && R() > 0.4) k.pluck(d, t0 + 3.5 * spb, ch[3] + 12, 0.08, 0.5); } } },
    { id: 'ambient', name: 'Bay Chill 1270 AM · Ambient', bpm: 70, bars: 8, gen(k, d, spb, bars, R) {
      const pent = [57, 60, 62, 64, 67, 69, 72, 74];
      for (let b = 0; b < bars; b++) { const ch = PROG.tropical[b % 4], t0 = b * 4 * spb;
        k.pad(d, t0, ch.concat([ch[0] - 12]), 4.2 * spb, 0.04, 900);
        for (let s = 0; s < 4; s++) if (R() > 0.4) k.pluck(d, t0 + (s + R() * 0.5) * spb, pent[Math.floor(R() * pent.length)] + 12, 0.07, 1.2); } } },
    { id: 'house', name: 'Club 124 · Deep House', bpm: 124, bars: 16, gen(k, d, spb, bars, R) {
      for (let b = 0; b < bars; b++) { const ch = PROG.house[Math.floor(b / 2) % 4], t0 = b * 4 * spb;
        for (let i = 0; i < 4; i++) { const t = t0 + i * spb; k.kick(d, t, 1); k.hat(d, t + spb / 2, 0.14, true); if (i % 2) k.clap(d, t, 0.3); }
        for (let i = 0; i < 4; i++) k.bass(d, t0 + (i + 0.5) * spb, ch[0] - 24, spb * 0.35, 0.38, 'sawtooth', 260);
        for (const x of [0.5, 1.75, 3.25]) k.stab(d, t0 + x * spb, ch, 0.05); } } },
  ];
  const stationBuf = {};
  function renderStation(st) {
    if (stationBuf[st.id]) return stationBuf[st.id].buf || null;
    const spb = 60 / st.bpm, dur = st.bars * 4 * spb, sr = 32000;
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OC) return null;
    const oc = new OC(1, Math.ceil(sr * dur), sr);
    const rec = stationBuf[st.id] = { buf: null };
    const noise = oc.createBuffer(1, sr * 2, sr); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const bus = oc.createGain(); const sh = oc.createWaveShaper(); const cv = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 255.5 - 1; cv[i] = Math.tanh(x * 1.3); } sh.curve = cv;
    bus.connect(sh).connect(oc.destination);
    // lay out notes slightly past the loop end too (tails wrap naturally into the next loop pass)
    try { st.gen(kit(oc, noise), bus, spb, st.bars, mulberry(st.id.length * 977)); } catch (e) { console.warn('[audio] station', st.id, e); return null; }
    oc.startRendering().then((b) => { const d = b.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); const k = pk > 0 ? 0.7 / pk : 1; for (let i = 0; i < d.length; i++) d[i] *= k; rec.buf = b; }).catch(() => { /* */ });
    return null;
  }
  const stationById = (id) => STATIONS.find((s) => s.id === id) || STATIONS[0];
  const musicSrc = new Map(); // id -> { src, g, lp, hs, pan, station }
  // real songs (src/audio/radio.js); the procedural stations remain the fallback (and the offline renders)
  const realRadio = createRadioStreams();
  // club DJ (owner-licensed tracks, local builds only): one shared beatmatched mix for clubs and bars
  let djInst = null;
  function clubDJ() {
    if (djInst || !ctx) return djInst;
    if (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext) return null;
    djInst = createClubDJ(ctx, {
      hour: () => game.timeOfDay ?? 23,
      crowd: () => (game.club?.open ? 0.8 : 0.55),
    });
    return djInst;
  }
  // beat clock for cutscenes and anything cut to the club music (null until the DJ runs)
  game.clubdj = {
    beatAt: (t) => clubDJ()?.beatAt(t) ?? null,
    nextDownbeat: (t) => clubDJ()?.nextDownbeat(t) ?? null,
    get bpm() { return djInst?.bpm ?? null; },
    get current() { return djInst?.current ?? null; },
    get available() { return !!djInst?.available; },
    get running() { return !!djInst?.running; },
    start() { const d = clubDJ(); d?.ready.then((ok) => ok && d.ensureRunning()); return d?.ready ?? Promise.resolve(false); },
    get debug() { return djInst?.debug ?? null; },
  };
  const radioList = () => (realRadio.list.length ? realRadio.list : STATIONS);
  function musicSource(id, stationId, positional, ref = 6, rolloff = 1.3) {
    let m = musicSrc.get(id);
    // a venue that started on a radio station switches to the club DJ once its library has loaded
    const djLate = m && !m.dj && String(id).startsWith('venue') && clubDJ()?.available;
    if (m && m.station === stationId && !djLate) return m;
    const realId = realRadio.alias(stationId);
    let stream = null;
    let buf = null;
    let isDJ = false;
    if (String(id).startsWith('venue')) {
      const d = clubDJ();
      if (d?.available) {
        d.ensureRunning();
        stream = d.tap();
        isDJ = true;
      }
    }
    if (!stream && String(stationId).startsWith('url:')) { // [main-menu hook] a looping file (the title theme) instead of a station
      const el = new Audio(); el.crossOrigin = 'anonymous'; el.preload = 'auto'; el.src = String(stationId).slice(4);
      const node = ctx.createGain(); let msrc = null; try { msrc = ctx.createMediaElementSource(el); msrc.connect(node); } catch (e) { msrc = null; }
      if (msrc) {
        const loopAt = game.menuMusic?.loopAt ?? 0, startAt = game.menuMusic?.startAt ?? 0;
        if (startAt > 0) { try { el.currentTime = startAt; } catch (e) { /* set once metadata is in */ } el.addEventListener('loadedmetadata', () => { if (el.currentTime < startAt - 0.5) el.currentTime = startAt; }, { once: true }); }
        // loop forever: jump back just before the end, and if timeupdate missed it, restart on 'ended'
        el.addEventListener('timeupdate', () => { if (el.duration && el.currentTime > el.duration - 0.35) el.currentTime = loopAt; });
        el.addEventListener('ended', () => { el.currentTime = loopAt; el.play().catch(() => { /* */ }); });
        el.play().catch(() => { /* resumes after a gesture */ });
        stream = { node, el, stop() { try { el.pause(); el.removeAttribute('src'); el.load(); msrc.disconnect(); } catch (e) { /* */ } } };
      }
    }
    if (!stream && realId) {
      const onTrack = id === 'radio' ? (tr, s) => notify(`♪ ${s.name} · ${tr.title} (${tr.artist})`) : null;
      stream = realRadio.source(ctx, realId, onTrack);
    }
    if (!stream) {
      // no procedural (chiptune-like) fallback anywhere: wait for the real stations instead
      if (!realRadio.list.length) return null;
      return null;
    }
    if (m) dropMusic(id);
    let src;
    if (stream) {
      src = stream;
    } else {
      src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    }
    const hs = ctx.createBiquadFilter(); hs.type = 'lowshelf'; hs.frequency.value = 120; hs.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 12000;
    const g = ctx.createGain(); g.gain.value = 0;
    (stream ? stream.node : src).connect(hs).connect(lp).connect(g);
    let pan = null;
    const mbus = id === 'menu' ? menuBus : id === 'radio' || String(id).startsWith('car:') ? radioBus : musicBus; // [main-menu hook] 'menu'
    if (positional) { pan = panner(ref, rolloff, 400); g.connect(pan).connect(mbus); } else g.connect(mbus);
    if (!stream) src.start(ctx.currentTime, ctx.currentTime % buf.duration); // stations feel "live": shared clock
    m = { src, g, lp, hs, pan, station: stationId, real: !!stream && !isDJ, dj: isDJ, seen: 0 }; musicSrc.set(id, m); return m;
  }
  function dropMusic(id) { const m = musicSrc.get(id); if (!m) return; musicSrc.delete(id); const t = ctx.currentTime; m.g.gain.setTargetAtTime(0, t, 0.3); setTimeout(() => { try { m.src.stop(); m.g.disconnect(); } catch (e) { /* */ } }, 1500); }
  const radio = { idx: -1, lastCar: null };
  function notify(text) { try { (game.hud?.notify || game.ui?.notify)?.call(game.hud || game.ui, text, 2200); } catch (e) { /* */ } }
  addEventListener('keydown', (e) => {
    if (e.code !== 'Period' && e.code !== 'Comma') return;
    const st = game.player?.state; if (!st?.inVehicle || !ctx) return;
    const L = radioList();
    const n = L.length + 1; // + off
    radio.idx = ((radio.idx + 1 + (e.code === 'Period' ? 1 : -1) + n) % n) - 1;
    if (radio.idx < 0) { notify('Radio off'); return; }
    const sel = L[radio.idx];
    const np = realRadio.nowPlaying(sel.id);
    notify(np ? `♪ ${sel.name} · ${np.track.title} (${np.track.artist})` : '♪ ' + sel.name);
    if (!realRadio.has(sel.id)) renderStation(stationById(sel.id));
  });
  const VENUE_RE = /club|bar|lounge|disco|night|pub|cantina/i;
  const party = { pos: null, station: 'house', beach: null, beachStation: 'reggaeton' };
  function updateMusic(dt, t, pp, indoor, night, zone, quiet) {
    if (!pp || !Number.isFinite(pp.x + pp.z)) return;
    const want = new Map(); // id -> fn(m) param update
    const st = game.player?.state, pc = st?.inVehicle ? st.vehicle : null;
    // player car radio (in-cabin, non-positional)
    if (pc && radio.idx >= 0 && radioList()[radio.idx] && !quiet) {
      // a damaged car's speakers lose their top end
      const hp = typeof pc.health === 'number' && typeof pc.maxHealth === 'number' && pc.maxHealth > 0 ? pc.health / pc.maxHealth : 1;
      want.set('radio', { station: radioList()[radio.idx].id, pos: null, gain: realRadio.has(radioList()[radio.idx].id) ? MIXK.radio : 0.5, lp: hp < 0.35 ? 2200 : 9000 });
    }
    // clubs / bars: bass-heavy from the street, full inside; louder at night
    const venues = [];
    for (const s of game.interiors?.list || []) {
      const c = s.center; if (!c) continue;
      const d = Math.hypot(c.x - pp.x, c.z - pp.z); if (d > 160) continue;
      const kind = String(s.type || s.kind || s.name || '');
      let isClub = VENUE_RE.test(kind);
      if (!isClub && night) { try { isClub = zoneAt(c.x, c.z) === 'nightlife'; } catch (e) { /* */ } }
      // the player's club (business track) only plays while it is open, once owned
      const ownClub = game.club?.pos && Math.hypot(game.club.pos.x - c.x, game.club.pos.z - c.z) < 30;
      if (ownClub) isClub = !game.club.owned || !!game.club.open;
      if (isClub) venues.push([d, s]);
    }
    venues.sort((a, b) => a[0] - b[0]);
    const inShop = indoor ? (game.interiors?.list || []).find((s) => s.isInside?.(game.player?.position)) : null;
    venues.slice(0, 2).forEach(([d, s], i) => {
      const inside = inShop === s;
      const stn = ['house', 'reggaeton', 'tropical', 'hiphop'][(Math.abs(Math.floor((s.center.x * 7 + s.center.z * 13))) % 4)];
      want.set('venue' + i + ':' + Math.round(s.center.x) + ',' + Math.round(s.center.z), { station: stn, pos: { x: s.center.x, y: 2, z: s.center.z }, gain: inside ? 0.5 : (night ? 0.9 : 0.35), lp: inside ? 14000 : Math.max(180, 700 * Math.exp(-d / 60)), bass: inside ? 3 : 9, ref: inside ? 30 : 8, rolloff: 1.1 });
    });
    // store background music (inside a non-club shop)
    if (inShop && !VENUE_RE.test(String(inShop.type || inShop.kind || ''))) want.set('store', { station: /surf|beach|cloth|fashion/i.test(String(inShop.type || '')) ? 'tropical' : 'ambient', pos: null, gain: 0.12, lp: 7000 });
    // car radios in nearby AI cars (windows down), positional + Doppler
    let nr = 0;
    for (const [car, v] of voices) {
      if (v.isPlayer || nr >= 2 || !car.mesh) continue;
      if (car._radio === undefined) car._radio = Math.random() < 0.28 ? radioList()[Math.floor(Math.random() * radioList().length)].id : null;
      if (!car._radio) continue;
      const p = car.mesh.position; const d = Math.hypot(p.x - pp.x, p.z - pp.z); if (d > 40) continue;
      want.set('car:' + (car.id ?? car.uuid ?? (car._rid ??= Math.random())), { station: car._radio, pos: { x: p.x, y: p.y + 0.9, z: p.z }, gain: 0.55, lp: 2600, bass: 4, ref: 4, rolloff: 1.6, rate: v.dop || 1 });
      nr++;
    }
    // beach boombox (daytime)
    if (zone === 'beach' && !night && !indoor) {
      if (!party.beach || Math.hypot(party.beach.x - pp.x, party.beach.z - pp.z) > 140) { const a = Math.random() * 6.283; party.beach = { x: pp.x + Math.cos(a) * 30, y: 0.6, z: pp.z + Math.sin(a) * 30 }; party.beachStation = Math.random() < 0.5 ? 'reggaeton' : 'tropical'; }
      want.set('boombox', { station: party.beachStation, pos: party.beach, gain: 0.35, lp: 3800, hp: true, ref: 4, rolloff: 1.5 });
    }
    // distant party at night
    if (night && !indoor && /residential|beach|park|nightlife/.test(zone || '')) {
      if (!party.pos || Math.hypot(party.pos.x - pp.x, party.pos.z - pp.z) > 320) { const a = Math.random() * 6.283; party.pos = { x: pp.x + Math.cos(a) * 160, y: 3, z: pp.z + Math.sin(a) * 160 }; party.station = Math.random() < 0.5 ? 'house' : 'reggaeton'; }
      want.set('party', { station: party.station, pos: party.pos, gain: 0.8, lp: 320, bass: 8, ref: 25, rolloff: 1 });
    }
    // [main-menu hook] title screen / arrival intros: game.menuMusic = { station, gain?, lp? } plays a radio station on its own bus
    { const mm = game.menuMusic; if (mm?.station && !quiet) want.set('menu', { station: mm.station, pos: null, gain: mm.gain ?? 0.8, lp: mm.lp ?? 16000 }); }
    for (const id of [...musicSrc.keys()]) if (!want.has(id) || quiet) dropMusic(id);
    if (quiet) return;
    for (const [id, w] of want) {
      const m = musicSource(id, w.station, !!w.pos, w.ref, w.rolloff); if (!m) continue;
      if (w.pos) setPos(m.pan, w.pos);
      m.g.gain.setTargetAtTime(w.gain, t, 0.5);
      m.lp.frequency.setTargetAtTime(w.lp, t, 0.3);
      m.hs.gain.setTargetAtTime(w.bass || 0, t, 0.3);
      if (w.rate && m.src?.playbackRate) m.src.playbackRate.setTargetAtTime(w.rate, t, 0.1); // media-element music has no AudioParam rate
    }
  }

  const deathFx = { state: 0, hbT: 0 };
  const fwd = { x: 0, y: 0, z: -1 };
  return {
    get ctx() { return ctx; },
    meter() { // dBFS RMS of each pre-master tap
      const o = {};
      for (const [k, a] of Object.entries(meters)) { const b = new Float32Array(a.fftSize); a.getFloatTimeDomainData(b); let s2 = 0, pk = 0; for (const x of b) { s2 += x * x; const ax = Math.abs(x); if (ax > pk) pk = ax; } o[k] = +(10 * Math.log10(s2 / b.length + 1e-12)).toFixed(1); o[k + '_pk'] = +(20 * Math.log10(pk + 1e-9)).toFixed(1); }
      return o;
    },
    get stations() { return radioList().map((s) => ({ id: s.id, name: s.name, genre: s.genre })); },
    nowPlaying(id) { const np = realRadio.nowPlaying(id ?? radioList()[radio.idx]?.id); return np ? { station: np.station.name, title: np.track.title, artist: np.track.artist, offset: +np.offset.toFixed(1) } : null; },
    venue, pedVoice,
    setStation(i) { radio.idx = i; const s = radioList()[i]; if (s && !realRadio.has(s.id)) renderStation(stationById(s.id)); },
    get debug() { return { nan: { ...NANLOG }, music: [...musicSrc].map(([k, m]) => ({ id: k, station: m.station, real: !!m.real, dj: !!m.dj, t: m.real ? +m.src.el.currentTime.toFixed(1) : null, gain: +m.g.gain.value.toFixed(3) })), radio: radio.idx, deathFx: deathFx.state, muted: MUTED, banks: Object.fromEntries(Object.entries(BANK).map(([c, b]) => [c, { keys: b.idx ? Object.keys(b.idx).length : 0, decoded: [...b.buf.values()].filter(Boolean).length }])), beds: Object.fromEntries([...beds].map(([k, b]) => [k, +b.g.gain.value.toFixed(3)])), zone: bedState.zone, ir: roomState.ir, sirens: [...sirens.values()].map((x) => ({ mode: x.mode, real: x.real })), samples: Object.keys(BUF), engines: [...voices.values()].map((v) => ({ kind: v.kind, src: v.src, dop: +(v.dop || 1).toFixed(3) })), voices: [...voices.values()].map((v) => ({ kind: v.kind, player: v.isPlayer, rpm: Math.round(v.rpm), gear: v.gear, layers: v.layers.length, squeal: +v.squeal.amt.toFixed(2) })) }; },
    play,
    // [main-menu hook] UI cues on the UI bus: move, tick, select, confirm, back, tab, deny, open, close, notify, start, whoosh
    ui(name, o = {}) {
      if (!ctx || !uiBus || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.004, d = out({ bus: uiBus, volume: 0.55 * (o.volume ?? 1) });
      switch (name) {
        case 'move': tone(d, t, { f0: 1760, f1: 1480, decay: 0.05, gain: 0.13 }); burst(d, t, { type: 'highpass', freq: 7000, decay: 0.018, gain: 0.05 }); break;
        case 'tick': tone(d, t, { type: 'triangle', f0: 2300, decay: 0.022, gain: 0.07 }); break;
        case 'select': case 'confirm': tone(d, t, { f0: 660, f1: 990, attack: 0.004, decay: 0.11, gain: 0.2 }); tone(d, t + 0.055, { f0: 990, f1: 1320, decay: 0.18, gain: 0.13 }); burst(d, t, { type: 'bandpass', freq: 3200, q: 1.2, decay: 0.05, gain: 0.05 }); break;
        case 'back': tone(d, t, { f0: 880, f1: 520, decay: 0.12, gain: 0.16 }); break;
        case 'tab': burst(d, t, { type: 'bandpass', freq: 1800, freqEnd: 4200, q: 1, attack: 0.01, decay: 0.07, gain: 0.12 }); tone(d, t, { f0: 1240, decay: 0.05, gain: 0.07 }); break;
        case 'deny': tone(d, t, { type: 'square', f0: 196, decay: 0.09, gain: 0.05 }); tone(d, t + 0.1, { type: 'square', f0: 165, decay: 0.12, gain: 0.05 }); break;
        case 'open': case 'whoosh': burst(d, t, { type: 'bandpass', freq: 380, freqEnd: 3400, q: 0.8, attack: 0.09, decay: 0.28, gain: 0.22 }); break;
        case 'close': burst(d, t, { type: 'bandpass', freq: 3000, freqEnd: 360, q: 0.8, attack: 0.04, decay: 0.24, gain: 0.18 }); break;
        case 'notify': tone(d, t, { f0: 1320, decay: 0.09, gain: 0.12 }); tone(d, t + 0.09, { f0: 1760, decay: 0.16, gain: 0.1 }); break;
        case 'start': burst(d, t, { type: 'bandpass', freq: 240, freqEnd: 5200, q: 0.7, attack: 0.55, decay: 0.35, gain: 0.26 }); tone(d, t + 0.55, { f0: 72, f1: 38, attack: 0.005, decay: 1.4, gain: 0.55 }); tone(d, t + 0.55, { f0: 660, f1: 640, attack: 0.01, decay: 1.1, gain: 0.08 }); break;
        default: tone(d, t, { f0: 1200, decay: 0.05, gain: 0.08 });
      }
    },
    siren,
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (outGain) outGain.gain.value = MUTED ? 0 : volume; },
    // settings sliders: bus = sfx | vehicles | ambience | music | radio | voice | ui, v = 0..1
    setBusVolume,
    setBus: setBusVolume,
    get busVolumes() { return { master: volume, ...busVol }; },
    setOutput(mode) { outMode.output = mode || 'headphones'; applyOutputMode(); },
    setDynamicRange(mode) { outMode.range = mode || 'full'; applyOutputMode(); },
    setMuted(m) { MUTED = !!m; if (outGain) outGain.gain.value = MUTED ? 0 : volume; },
    get muted() { return MUTED; },
    // stage 1: weather and other procedural ambience beds connect here (follows the ambience volume, mute and master)
    get ambienceBus() { return ambBus; },
    horn(position, vehicle) {
      if (!ctx) return;
      const car = vehicle || (position ? null : game.player?.state?.vehicle);
      const cls = car ? carClass(car) : 'sedan';
      const hk = /bus/.test(cls) ? 'horn_bus' : /truck|van|pickup/.test(cls) ? 'horn_truck' : /suv/.test(cls) ? 'horn_suv' : /moto|bike/.test(cls) ? 'horn_moto' : /compact|hatch|i3/.test(cls) ? 'horn_compact' : 'horn_sedan';
      if (hasKey('vehicles', hk)) {
        const cp = car?.mesh?.position;
        if (!position && car === game.player?.state?.vehicle) { const g = ctx.createGain(); g.gain.value = VMIX.oneShot; g.connect(carBus._fx); if (real(g, ctx.currentTime + 0.005, 'vehicles', hk)) return; }
        play(hk, { position: position || (cp && { x: cp.x, y: cp.y + 0.8, z: cp.z }), volume: 1 });
        return;
      }
      if (position) { play('horn', { position, volume: 1 }); return; }
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.type = o2.type = 'square'; o.frequency.value = 415; o2.frequency.value = 520; g.gain.value = 0.08;
      o.connect(g); o2.connect(g); g.connect(vehBus); o.start(); o2.start();
      o.stop(ctx.currentTime + 0.45); o2.stop(ctx.currentTime + 0.45);
    },
    update(dt) {
      if (!ctx || !eng) return;
      const st = game.player.state, t = ctx.currentTime;
      const dead = !!game.ui?.dead, busted = !!(game.ui?.arrested || game.ui?.busted);
      const muted = game.ui?.paused || dead;
      { // death / arrest: muffle + duck world, keep ui bus (death_hit, heartbeat)
        const lvl = dead ? 2 : busted ? 1 : 0;
        if (lvl !== deathFx.state) {
          const tt = ctx.currentTime, down = lvl > deathFx.state;
          worldLP.frequency.cancelScheduledValues(tt); worldG.gain.cancelScheduledValues(tt);
          worldLP.frequency.setTargetAtTime(lvl === 2 ? 400 : lvl === 1 ? 1500 : 20000, tt, down ? 0.2 : 0.33);
          worldG.gain.setTargetAtTime(lvl === 2 ? 0.25 : lvl === 1 ? 0.55 : 1, tt, down ? 0.2 : 0.33);
          if (lvl === 2) { const d0 = out({ bus: uiBus, volume: 0.05 }); tone(d0, tt + 0.05, { f0: 3900, f1: 3700, attack: 0.05, decay: 3.5, gain: 1 }); }
          deathFx.state = lvl; deathFx.hbT = 0.3;
        }
        if (dead) { deathFx.hbT -= dt; if (deathFx.hbT <= 0) { deathFx.hbT = 1.0; const d0 = out({ bus: uiBus, volume: 0.45 }); SFX.heartbeat(d0, ctx.currentTime + 0.01); } }
      }
      // listener = camera
      const cam = game.camera, L = ctx.listener;
      if (cam && Number.isFinite(cam.position.x + cam.position.y + cam.position.z)) {
        const e = cam.matrixWorld.elements;
        const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
        if (L.positionX) {
          L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z;
          L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
        } else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(fx, fy, fz, ux, uy, uz); }
      }
      readSettings();
      ambDuck.gain.setTargetAtTime(st?.inVehicle && !muted ? MIXK.ambInCar : 1, t, 0.6);
      outGain.gain.setTargetAtTime(MUTED ? 0 : game.ui?.paused ? volume * 0.25 : volume, t, 0.1);
      { // [main-menu hook] menus duck and muffle the world (menu music and UI cues bypass it)
        const dk = game.menuMusic?.duck;
        if (dk != null && deathFx.state === 0) { worldG.gain.setTargetAtTime(dk, t, 0.5); worldLP.frequency.setTargetAtTime(game.menuMusic.duckLP ?? 20000, t, 0.5); menuDuck.on = true; }
        else if (menuDuck.on && deathFx.state === 0) { worldG.gain.setTargetAtTime(1, t, 0.6); worldLP.frequency.setTargetAtTime(20000, t, 0.6); menuDuck.on = false; }
      }
      const indoor = isIndoor();
      reverbSend.gain.setTargetAtTime(0, t, 0.1); // sends are per-sound; keep bus idle
      try { updateEngines(dt, t, muted); } catch (e) { if (!eng.errLogged) { eng.errLogged = true; console.warn('[audio] engines', e); } }
      // ambience
      const pp = cam ? cam.position : game.player.position;
      const tod = game.timeOfDay ?? 12;
      const night = tod < 5.5 || tod > 20;
      const day = tod > 6 && tod < 19;
      let realAmb = false;
      try { realAmb = updateBeds(dt, t, pp, indoor, night, day, muted); } catch (e) { if (!eng.ambErr) { eng.ambErr = true; console.warn('[audio] ambience', e); } }
      try { updateRoom(indoor); } catch (e) { /* */ }
      const shoreD = realAmb ? 1e9 : Math.abs(pp.x - 505);
      // waves: swash cycle ~7s
      const swash = 0.55 + 0.45 * Math.sin(game.clock.elapsed * 0.9) * Math.sin(game.clock.elapsed * 0.37 + 1);
      const waveG = Math.pow(Math.max(0, 1 - shoreD / 170), 2) * 0.17 * swash * (indoor ? 0.2 : 1) * (st?.inVehicle ? 0.4 : 1);
      eng.wvG.gain.setTargetAtTime(waveG, t, 0.3);
      eng.wvF.frequency.setTargetAtTime(500 + swash * 900, t, 0.3);
      setPos(eng.wvP, { x: 508, y: 0, z: pp.z });
      // city traffic hum: stronger inland, lower at night
      const cityK = Math.max(0, Math.min(1, (470 - pp.x) / 120));
      eng.ambG.gain.setTargetAtTime(realAmb ? 0 : (muted ? 0.01 : (0.03 + 0.08 * cityK) * (night ? 0.55 : 1)) * (indoor ? 0.35 : 1), t, 0.4);
      if (!muted && !indoor && !realAmb) {
        amb.birdT -= dt; amb.cricketT -= dt;
        if (day && amb.birdT <= 0) {
          amb.birdT = rnd(0.6, 3.5);
          const a = Math.random() * Math.PI * 2, r = rnd(8, 30);
          chirp(t + 0.01, { x: pp.x + Math.cos(a) * r, y: pp.y + rnd(3, 10), z: pp.z + Math.sin(a) * r });
        }
        if (night && amb.cricketT <= 0) {
          amb.cricketT = rnd(0.25, 1.2);
          const a = Math.random() * Math.PI * 2, r = rnd(5, 20);
          cricket(t + 0.01, { x: pp.x + Math.cos(a) * r, y: 0.2, z: pp.z + Math.sin(a) * r });
        }
      }
      try { clubDJ()?.tick(dt); } catch (e) { if (!eng.djErr) { eng.djErr = true; console.warn('[audio] club dj', e); } }
      try { updateMusic(dt, t, pp, indoor, night, bedState.zone, muted); } catch (e) { if (!eng.musErr) { eng.musErr = true; console.warn('[audio] music', e); } }
      // (legacy synth club loop disabled: real/generative venue music above)
      let shop = null, sd = 70;
      if (false)
      if (night && !muted) for (const s of game.interiors?.list || []) { if (!s.center) continue; const d = Math.hypot(s.center.x - pp.x, s.center.z - pp.z); if (d < sd) { sd = d; shop = s; } }
      if (shop) {
        if (!amb.music) {
          const inG = ctx.createGain(); inG.gain.value = 0.6;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
          const g = ctx.createGain(); g.gain.value = 0;
          const p = panner(6, 1.4, 120);
          inG.connect(lp).connect(g).connect(p).connect(ambBus);
          amb.music = { in: inG, lp, g, p }; amb.musicNext = t + 0.1;
        }
        setPos(amb.music.p, { x: shop.center.x, y: 2, z: shop.center.z });
        const inside = shop.isInside?.(game.player.position);
        amb.music.lp.frequency.setTargetAtTime(inside ? 4000 : 600, t, 0.3);
        amb.music.g.gain.setTargetAtTime(inside ? 0.12 : 0.22, t, 0.5);
        musicTick(amb.music, t);
      } else if (amb.music) {
        amb.music.g.gain.setTargetAtTime(0, t, 0.5);
        if (amb.music.g.gain.value < 0.005) { try { amb.music.in.disconnect(); } catch (e) { /* */ } amb.music = null; }
        else musicTick(amb.music, t);
      }
    },
  };
}

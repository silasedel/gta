// Port Solana club DJ: a continuous, beatmatched DJ mix of the owner's licensed club tracks.
// Tracks and their offline analysis (BPM, beat grid, downbeats, 8-bar phrases, energy, cue points, key)
// live in the git-ignored /assets/audio/music/club_licensed/ (tools/v2/sync-club-songs.mjs). When that
// folder is missing (fresh clone) `available` stays false and venues fall back to the CC BY radio stations.
//
// Mixing: every transition starts on a phrase boundary of the outgoing track (its analyzed transition
// window, before the outro), the incoming track enters on its cue-in downbeat (beatless intro skipped),
// tempo-matched with playbackRate (within +-8%), phase-locked to the outgoing beat grid. Over 32 beats:
// incoming fades up with its bass cut; on the middle downbeat the basses swap; the outgoing track then
// fades with a rising high-pass sweep and a dotted-eighth echo-out on its last bar.
// Selection: mood tags, energy and tempo by time of day (warm early evening, dark and fast 00:00-03:00),
// crowd level, harmonic (Camelot) neighbors, no recent repeats.
//
// One shared mix: venues tap the same output, so every listener (and any cutscene) hears the same set.
//   const dj = createClubDJ(ctx, { hour: () => 23.5, crowd: () => 0.7 });
//   await dj.ready;  dj.available;  const n = dj.tap(); n.connect(dest); dj.ensureRunning(); dj.tick() per frame
//   dj.beatAt(t) -> { beat, beatInBar, bar, phase, isDownbeat, time, bpm }   dj.nextDownbeat(t) -> ctx time
//   dj.bpm   dj.current -> { title, tags, bpm }
const BASE = '/assets/audio/music/club_licensed/';
const XFADE_BEATS = 32;
const MAX_STRETCH = 0.08;
const KILL_DB = -26;

const MOODS = [
  // [fromHour, toHour, tags, energy, bpm]
  [6, 18, ['Groovy', 'Funky', 'Fun', 'Simple', 'Disco', 'Happy'], 0.62, 124],
  [18, 22, ['Groovy', 'Funky', 'Fun', 'Disco', 'Simple', 'Happy', 'Euphoric', 'Deep'], 0.66, 126],
  [22, 24, ['Deep', 'Modern', 'Euphoric', 'Groovy', 'Electric'], 0.74, 128],
  [0, 3, ['Dark', 'Fast', 'Grimey', 'Intense', 'Edm', 'Hard', 'Dubstep', 'Electric'], 0.82, 130],
  [3, 6, ['Deep', 'Simple', 'Modern', 'Euphoric'], 0.68, 126],
];

function camelotNear(a, b) {
  if (!a || !b) return false;
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const la = a.slice(-1);
  const lb = b.slice(-1);
  if (na === nb) return true;
  return la === lb && (Math.abs(na - nb) === 1 || Math.abs(na - nb) === 11);
}

export function createClubDJ(ctx, opts = {}) {
  const hour = opts.hour || (() => 23);
  const crowd = opts.crowd || (() => 0.6);
  const out = ctx.createGain();
  out.gain.value = 1;
  // mix bus: -6 dB headroom for two decks plus echo, then a fast safety limiter
  const sum = ctx.createGain();
  sum.gain.value = 0.5;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -4;
  lim.knee.value = 2;
  lim.ratio.value = 16;
  lim.attack.value = 0.002;
  lim.release.value = 0.12;
  sum.connect(lim).connect(out);
  // echo-out send (dotted eighth, set per transition)
  const echo = ctx.createDelay(2);
  const echoFb = ctx.createGain();
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 3500;
  echoFb.gain.value = 0.42;
  echo.connect(echoLp).connect(echoFb).connect(echo);
  echoLp.connect(sum);

  const lib = { tracks: [], byId: new Map() };
  const bufs = new Map(); // id -> Promise<AudioBuffer>
  const recent = [];
  let cur = null; // master deck
  let next = null; // { track, deck, tx, tEnd }
  let running = false;
  let taps = 0;
  let idleT = 0;
  let pickT = 0;

  const api = {
    available: false,
    out,
    ready: fetch(BASE + 'index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const ok = (j?.tracks || []).filter((t) => t.period > 0 && t.duration > 60);
        lib.tracks = ok;
        for (const t of ok) lib.byId.set(t.id, t);
        api.available = ok.length >= 2;
        return api.available;
      })
      .catch(() => false),
    get bpm() {
      return cur ? cur.track.bpm * cur.rate : null;
    },
    get current() {
      return cur ? { id: cur.track.id, title: cur.track.title, tags: cur.track.tags, bpm: +(cur.track.bpm * cur.rate).toFixed(2), rate: +cur.rate.toFixed(4) } : null;
    },
    get running() {
      return running;
    },
    tap,
    ensureRunning,
    stop,
    tick,
    beatAt,
    nextDownbeat,
    // test hooks (offline render of a transition)
    _load: load,
    _play: (track, buf, t, offset, rate = 1) => {
      cur = makeDeck(track, buf, t, offset, rate, 1);
      running = true;
      return cur;
    },
    _transition: (track, buf, opts2) => scheduleTransition(track, buf, opts2),
    get debug() {
      return {
        running,
        taps,
        current: api.current,
        next: next ? { title: next.track.title, startsIn: +(next.tx - ctx.currentTime).toFixed(1), rate: +next.deck.rate.toFixed(4) } : null,
        recent: recent.slice(-5),
      };
    },
  };

  function load(track) {
    if (!bufs.has(track.id)) {
      bufs.set(track.id, fetch(BASE + track.file)
        .then((r) => r.arrayBuffer())
        .then((ab) => ctx.decodeAudioData(ab))
        .catch((e) => {
          bufs.delete(track.id);
          throw e;
        }));
    }
    return bufs.get(track.id);
  }

  function makeDeck(track, buf, t, offset, rate, startGain) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const trim = ctx.createGain();
    trim.gain.value = Math.pow(10, (track.gainDb || 0) / 20);
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 180;
    low.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 18;
    hp.Q.value = 0.9;
    const fader = ctx.createGain();
    fader.gain.value = startGain;
    const send = ctx.createGain();
    send.gain.value = 0;
    src.connect(trim).connect(low).connect(hp).connect(fader).connect(sum);
    fader.connect(send).connect(echo);
    src.start(t, Math.max(0, offset));
    const deck = { track, buf, src, rate, T: t, O: offset, trim, low, hp, fader, send };
    src.onended = () => {
      if (cur === deck && running) {
        // ran out without a planned transition (should not happen): restart the set
        cur = null;
        next = null;
      }
    };
    return deck;
  }

  const tau = (d, t) => d.O + (t - d.T) * d.rate;
  // local beat correction (analysis: per 8-bar phrase, kick onsets vs the global grid)
  function fixAt(tr, x) {
    const f = tr.phaseFix;
    if (!f || !f.length) return 0;
    const i = Math.max(0, Math.min(f.length - 1, Math.floor((x - tr.phrase0) / (32 * tr.period))));
    return f[i] || 0;
  }
  const ctxAt = (d, x) => d.T + (x - d.O) / d.rate;

  function beatAt(t = ctx.currentTime) {
    if (!cur) return null;
    const tr = cur.track;
    const x = tau(cur, t);
    const k = (x - tr.beat0) / tr.period;
    const beat = Math.floor(k);
    const bib = ((Math.round((tr.beat0 + beat * tr.period - tr.downbeat0) / tr.period) % 4) + 4) % 4;
    return {
      beat,
      beatInBar: bib,
      bar: Math.floor((beat - bib) / 4),
      phase: k - beat,
      isDownbeat: bib === 0,
      time: ctxAt(cur, tr.beat0 + beat * tr.period),
      bpm: tr.bpm * cur.rate,
    };
  }

  function nextDownbeat(t = ctx.currentTime) {
    const b = beatAt(t);
    if (!b) return null;
    const tr = cur.track;
    const ahead = b.beatInBar === 0 && b.phase < 1e-6 ? 0 : 4 - b.beatInBar;
    return ctxAt(cur, tr.beat0 + (b.beat + ahead) * tr.period);
  }

  function mood() {
    let h = hour();
    h = ((h % 24) + 24) % 24;
    for (const m of MOODS) if (h >= m[0] && h < m[1]) return { tags: m[2], energy: m[3] + 0.08 * (crowd() - 0.5), bpm: m[4] };
    return { tags: MOODS[2][2], energy: 0.74, bpm: 128 };
  }

  function pick(prev) {
    const m = mood();
    const masterBpm = prev ? prev.track.bpm * prev.rate : m.bpm;
    let best = null;
    for (const t of lib.tracks) {
      if (prev && t.id === prev.track.id) continue;
      const ratio = masterBpm / t.bpm;
      if (prev && Math.abs(ratio - 1) > MAX_STRETCH) continue;
      let s = 0;
      for (const tag of t.tags || []) if (m.tags.includes(tag)) s += 1;
      s -= 2.2 * Math.abs((t.meanEnergy ?? 0.7) - m.energy);
      s -= 8 * Math.abs(ratio - 1);
      if (!prev) s -= Math.abs(t.bpm - m.bpm) / 6;
      if (prev && camelotNear(prev.track.camelot, t.camelot)) s += 0.35;
      const ri = recent.lastIndexOf(t.id);
      if (ri >= 0) s -= 3 * (1 - (recent.length - 1 - ri) / 8);
      s += Math.random() * 0.4;
      if (!best || s > best.s) best = { t, s };
    }
    if (!best && prev) { // nothing within the stretch range: take the closest tempo
      best = { t: lib.tracks.filter((t) => t.id !== prev.track.id).sort((a, b) => Math.abs(masterBpm / a.bpm - 1) - Math.abs(masterBpm / b.bpm - 1))[0] };
    }
    return best?.t || null;
  }

  // plan the next transition on the master deck: returns the schedule
  function scheduleTransition(track, buf, o = {}) {
    const A = cur;
    const ta = A.track;
    const P = ta.period;
    const phraseLen = 8 * 4 * P;
    const now = o.now ?? ctx.currentTime;
    let xA = o.at ?? ta.transStart;
    const minX = tau(A, now) + 3 * A.rate;
    if (xA < minX) xA = ta.phrase0 + Math.ceil((minX - ta.phrase0) / phraseLen) * phraseLen;
    let L = XFADE_BEATS;
    if (xA + L * P > A.buf.duration - 0.3) L = 16;
    if (xA + L * P > A.buf.duration - 0.3) xA = Math.max(ta.phrase0, A.buf.duration - 0.3 - L * P);
    const tx = ctxAt(A, xA);
    const masterBpm = ta.bpm * A.rate;
    const rate = Math.max(1 - MAX_STRETCH, Math.min(1 + MAX_STRETCH, masterBpm / track.bpm));
    const beat = 60 / masterBpm;
    const mid = tx + (L / 2) * beat;
    const end = tx + L * beat;
    // phase-lock real kicks, not just the grids: shift the incoming start by both local corrections
    const xB = (o.offset ?? track.cueIn) + fixAt(track, o.offset ?? track.cueIn) - fixAt(ta, xA) * rate;
    const B = makeDeck(track, buf, tx, xB, rate, 0);
    const curveUp = new Float32Array(64).map((_, i) => Math.sin((i / 63) * Math.PI / 2));
    const curveDown = new Float32Array(64).map((_, i) => Math.cos((i / 63) * Math.PI / 2));
    // incoming: fade up over the first half with its bass killed; bass in on the middle downbeat
    B.fader.gain.setValueAtTime(0, tx);
    B.fader.gain.setValueCurveAtTime(curveUp, tx, mid - tx);
    B.low.gain.setValueAtTime(KILL_DB, tx);
    B.low.gain.setValueAtTime(KILL_DB, mid - 0.02);
    B.low.gain.linearRampToValueAtTime(0, mid);
    // outgoing: bass out on the same downbeat, then fade with a rising high-pass, echo-out on the last bar
    A.low.gain.setValueAtTime(0, mid - 0.02);
    A.low.gain.linearRampToValueAtTime(KILL_DB, mid);
    A.fader.gain.setValueAtTime(1, mid);
    A.fader.gain.setValueCurveAtTime(curveDown, mid, end - mid);
    A.hp.frequency.setValueAtTime(18, mid);
    A.hp.frequency.exponentialRampToValueAtTime(900, end);
    echo.delayTime.setValueAtTime(0.75 * beat, tx);
    A.send.gain.setValueAtTime(0, end - 4 * beat);
    A.send.gain.linearRampToValueAtTime(0.55, end - 0.5 * beat);
    A.send.gain.linearRampToValueAtTime(0, end);
    A.src.stop(end + 0.05);
    next = { track, deck: B, tx, mid, end, L };
    return { tx, mid, end, L, rate, beat, xA, xB: B.O, deckA: A, deckB: B };
  }

  function tap() {
    const g = ctx.createGain();
    out.connect(g);
    taps++;
    let gone = false;
    return {
      node: g,
      stop() {
        if (gone) return;
        gone = true;
        taps--;
        try {
          out.disconnect(g);
        } catch (e) { /* */ }
      },
    };
  }

  async function startSet() {
    const first = pick(null);
    if (!first) return;
    const buf = await load(first);
    if (!running || cur) return;
    // join the set mid-flow: a random phrase between the cue-in and the transition window
    const P = first.period;
    const phrase = 32 * P;
    const span = Math.max(0, first.transStart - 2 * phrase - first.cueIn);
    const off = first.cueIn + Math.floor((Math.random() * span) / phrase) * phrase;
    const t = ctx.currentTime + 0.1;
    cur = makeDeck(first, buf, t, off, 1, 0);
    cur.fader.gain.setValueAtTime(0, t);
    cur.fader.gain.linearRampToValueAtTime(1, t + 1.5);
    recent.push(first.id);
    opts.onTrack?.(first);
  }

  function ensureRunning() {
    idleT = 0;
    if (!api.available || running) return;
    running = true;
    startSet();
  }

  function stop() {
    running = false;
    try {
      cur?.src.stop();
      next?.deck.src.stop();
    } catch (e) { /* */ }
    cur = null;
    next = null;
    bufs.clear(); // free the decoded audio
  }

  function tick(dt = 0.016) {
    if (!running) return;
    if (taps <= 0) {
      idleT += dt;
      if (idleT > 30) stop();
      return;
    }
    idleT = 0;
    const now = ctx.currentTime;
    if (!cur) {
      if ((pickT -= dt) <= 0) {
        pickT = 5;
        startSet();
      }
      return;
    }
    if (next && now >= next.tx) { // the incoming deck becomes the master grid
      const old = cur;
      cur = next.deck;
      recent.push(cur.track.id);
      opts.onTrack?.(cur.track);
      next = null;
      setTimeout(() => {
        if (old.track.id !== cur.track.id) bufs.delete(old.track.id);
      }, 30000);
      return;
    }
    if (!next && !cur.pending) {
      const xA = cur.track.transStart;
      const tx = ctxAt(cur, xA);
      if (tx - now < 25) { // choose and decode the next track ahead of its entry
        const tr = pick(cur);
        if (!tr) return;
        const deck = cur;
        deck.pending = true;
        load(tr).then((buf) => {
          if (cur !== deck || !running) return;
          scheduleTransition(tr, buf);
        }).catch(() => {
          deck.pending = false;
        });
      }
    }
  }

  return api;
}

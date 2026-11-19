// Southline radio: real songs (CC BY 4.0, see CREDITS.md) streamed per station from /assets/audio/music.
// Each station is a "live broadcast": its playlist runs on a shared wall clock, so every listener
// (car radio, club, passing car) hears the same song at the same moment, and switching away and back
// lands where the station is now. Songs stream through <audio> elements into the Web Audio graph.
//   const radio = createRadioStreams();  await radio.ready;
//   radio.has(id) / radio.list / radio.alias(id) / radio.nowPlaying(id)
//   const s = radio.source(ctx, id, onTrack);  s.node -> connect it;  s.stop()
const BASE = '/assets/audio/music/';
// the procedural stations in core/audio.js map onto the real ones
const ALIAS = {
  tropical: 'latin',
  reggaeton: 'latin',
  house: 'neon',
  synthwave: 'neon',
  hiphop: 'lowtide',
  ambient: 'lowtide',
  lofi: 'lowtide',
};
// stations start at different points in their playlists
const EPOCH = Date.UTC(2026, 0, 1) / 1000;

export function createRadioStreams() {
  const st = new Map();
  const api = {
    list: [],
    ready: null,
    has(id) {
      return st.has(id);
    },
    alias(id) {
      if (st.has(id)) return id;
      const a = ALIAS[id];
      return a && st.has(a) ? a : null;
    },
    // which song is on air right now, and how far into it
    nowPlaying(id) {
      const s = st.get(id);
      if (!s) return null;
      const now = Date.now() / 1000 - EPOCH + s.phase;
      let t = ((now % s.total) + s.total) % s.total;
      for (let i = 0; i < s.tracks.length; i++) {
        const tr = s.tracks[i];
        if (t < tr.dur) return { station: s, index: i, track: tr, offset: t, left: tr.dur - t };
        t -= tr.dur;
      }
      return { station: s, index: 0, track: s.tracks[0], offset: 0, left: s.tracks[0].dur };
    },
    source(ctx, id, onTrack) {
      const sid = api.alias(id);
      if (!sid || typeof ctx.createMediaElementSource !== 'function') return null;
      if (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext)
        return null;
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      const node = ctx.createGain();
      let src = null;
      try {
        src = ctx.createMediaElementSource(el);
      } catch (e) {
        return null;
      }
      src.connect(node);
      let dead = false;
      let cur = -1;
      let timer = 0;
      const tune = () => {
        if (dead) return;
        const np = api.nowPlaying(sid);
        if (!np) return;
        if (np.index !== cur || Math.abs(el.currentTime - np.offset) > 2.5) {
          cur = np.index;
          const url = BASE + np.track.file;
          if (!el.src.endsWith(url)) el.src = url;
          const seek = () => {
            try {
              el.currentTime = api.nowPlaying(sid)?.offset ?? 0;
            } catch (e) {
              /* not seekable yet */
            }
          };
          if (el.readyState >= 1) seek();
          else el.addEventListener('loadedmetadata', seek, { once: true });
          el.play().catch(() => {
            /* resumes on the next tune once the page has had a gesture */
          });
          try {
            onTrack?.(np.track, np.station);
          } catch (e) {
            /* */
          }
        } else if (el.paused) {
          el.play().catch(() => {
            /* */
          });
        }
        clearTimeout(timer);
        timer = setTimeout(tune, Math.min(4000, Math.max(250, np.left * 1000 + 30)));
      };
      el.addEventListener('ended', () => setTimeout(tune, 30));
      tune();
      return {
        node,
        el,
        station: sid,
        stop() {
          dead = true;
          clearTimeout(timer);
          try {
            el.pause();
            el.removeAttribute('src');
            el.load();
            src.disconnect();
          } catch (e) {
            /* */
          }
        },
      };
    },
  };
  api.ready = fetch(BASE + 'index.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return;
      let k = 0;
      for (const s of j.stations || []) {
        const tracks = (s.tracks || []).filter((t) => t.dur > 5);
        if (!tracks.length) continue;
        const total = tracks.reduce((a, t) => a + t.dur, 0);
        const rec = { ...s, tracks, total, phase: (k++ * 997) % total };
        st.set(s.id, rec);
        api.list.push({ id: s.id, name: s.name, genre: s.genre, color: s.color });
      }
    })
    .catch(() => {
      /* procedural stations stay */
    });
  return api;
}

// SOUTHLINE: arrival intros (main-menu track). The first time the player reaches a special place, a short
// cutscene plays on the cinematic director (ui/menu/cinema.js): about six quick shots with depth of field and the
// letterbox, cut on the bar lines of the radio song that plays under it (src/audio/radio.js wall clock +
// ui/menu/beats.json tempo map), and a title card. Once per save (save slice 'intros'), skippable, smooth handoff.
//
// Add a place: push to PLACES. Each place resolves a frame { x, y, z, fx, fz } at run time (fx/fz = the way the
// place faces: its front, toward the street or the water) and lists shots in that frame's local space:
//   pos / look: [right, up, forward] metres from the frame origin (forward = fx/fz); to: end of the move.
import { esc } from '../core/dom.js';
import { getCinema, EASE, mmToFov } from './cinema.js';
import BEATS from './beats.json';

export const order = 960;

// title card look for the arrival intros (scoped class; menu.css owns the base card): the name tracks in from wide
// letter-spacing and blur, the rule draws, the tagline follows a beat later; out is a quick soft fade
const CARD_CSS = `
.pm-icard-v3 .pm-icard-in { left: 8vw; }
.pm-icard-v3.show b { animation: pm-icard3-name 1.6s cubic-bezier(.16,1,.3,1) both; }
.pm-icard-v3.show p { animation: pm-icard3-up 1s .55s cubic-bezier(.16,1,.3,1) both; }
.pm-icard-v3.show .pm-icard-k { animation: pm-icard3-up .9s .1s cubic-bezier(.16,1,.3,1) both; }
.pm-icard-v3.out .pm-icard-in { transition: opacity .7s ease, transform .9s ease, filter .7s ease; filter: blur(4px); }
.pm-icard-v3 .pm-iskip { opacity: .55; }
@keyframes pm-icard3-name { from { opacity: 0; letter-spacing: .22em; filter: blur(8px); } to { opacity: 1; letter-spacing: .01em; filter: none; } }
@keyframes pm-icard3-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
`;

const nearestStorefront = (game, re, near) => {
  const sf = game.city?.storefronts || [];
  let best = null,
    bd = Infinity;
  for (const f of sf) {
    if (!re.test(String(f.kind || '') + ' ' + String(f.name || ''))) continue;
    const d = near ? Math.hypot(f.x - near.x, f.z - near.z) : 0;
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  if (!best) return null;
  let fx = (best.fx ?? best.x) - best.x,
    fz = (best.fz ?? best.z) - best.z;
  const l = Math.hypot(fx, fz) || 1;
  return { x: best.fx ?? best.x, z: best.fz ?? best.z, fx: fx / l, fz: fz / l, name: best.name };
};

// standard grammar for a storefront arrival, shot like a film crew would: a crane down from above the roofline, a
// low-angle push-in that puts the place on a third, a long-lens detail on the facade, an over-the-shoulder of the
// player looking at the door, a reverse out of the doorway onto the street, and a slow lateral dolly-out to close.
// pos / to / look / lookTo: [right, up, forward] in the place's frame. mm = focal length (full frame), aperture = DoF
// strength (bigger = shallower), ease = move curve, len = rough seconds (rounded to the music's bar lines),
// cut: 'dissolve' crossfades into the shot instead of a hard cut on the bar.
const FRONT_SHOTS = [
  {
    pos: [-24, 30, 38],
    to: [-15, 11, 27],
    look: [0, 9, 0],
    lookTo: [1, 5, 0],
    mm: 24,
    aperture: 0.35,
    ease: 'slider',
    len: 5.2,
  },
  {
    pos: [8.5, 0.55, 12],
    to: [6.2, 0.6, 8.6],
    look: [-2.2, 5.5, 0],
    lookTo: [-2.0, 5.0, 0],
    mm: 32,
    aperture: 0.9,
    ease: 'slider',
    len: 4,
  },
  {
    pos: [-7, 4.6, 6],
    to: [-4.2, 4.6, 6],
    look: [-1, 5.2, 0],
    lookTo: [1.8, 5.2, 0],
    mm: 85,
    aperture: 2.6,
    maxCoc: 14,
    ease: 'inOut',
    len: 3.6,
  },
  { ots: true, mm: 50, aperture: 2.0, ease: 'slider', len: 4 },
  {
    pos: [0.6, 1.4, 1.2],
    to: [0.4, 1.45, 3.6],
    look: [-0.6, 1.7, 16],
    mm: 28,
    aperture: 0.8,
    ease: 'out',
    len: 3.6,
  },
  {
    pos: [15, 3.2, 19],
    to: [-11, 7.5, 23],
    look: [2, 4, 0],
    lookTo: [-1, 4.5, 0],
    mm: 35,
    aperture: 0.5,
    ease: 'slider',
    len: 5.2,
    cut: 'dissolve',
  },
];

// rural places score their intro with the user's track (Epidemic Sound, licensed by the project owner for the web build):
// a warm, wholesome adventure feel. Tempo measured from the file (onset autocorrelation): 167 BPM, first beat 0.21 s
const RURAL = {
  music: 'url:/assets/audio/music/cutscene/rural_frigga_do_you_really_wanna_be_in_love.mp3',
  beats: { bpm: 167, beat0: 0.209 },
};

export const PLACES = [
  {
    id: 'club',
    name: 'Velvet Undertow',
    tagline: "South Beach's after-hours.",
    station: 'neon',
    hour: [21, 4],
    frame: (game) => {
      const s = game.bizSites?.sites?.find((x) => x.id === 'biz_club');
      if (s?.front) return { x: s.x, z: s.z, fx: s.front.dx, fz: s.front.dz };
      const p = game.club?.pos;
      return p ? { x: p.x, z: p.z, fx: 0, fz: 1 } : null;
    },
    radius: 28,
    shots: FRONT_SHOTS,
  },
  {
    id: 'hotel',
    name: 'The Coralline',
    tagline: 'Deco lobby, ocean views, no questions.',
    station: 'lowtide',
    frame: (game) => nearestStorefront(game, /hotel|resort|lodging/i, { x: 2400, z: -500 }),
    radius: 22,
    shots: FRONT_SHOTS,
  },
  {
    id: 'marina',
    name: 'Bayside Marina',
    tagline: 'Where money ties up for the night.',
    station: 'latin',
    frame: (game) => nearestStorefront(game, /marina|boat|yacht|ferry/i, { x: 1100, z: -300 }),
    radius: 30,
    shots: [
      {
        pos: [-40, 30, 50],
        to: [-22, 12, 38],
        look: [0, 4, -10],
        lookTo: [0, 1, -12],
        mm: 24,
        aperture: 0.35,
        ease: 'slider',
        len: 5.2,
      },
      {
        pos: [8, 0.9, -6],
        to: [4.5, 0.8, -10],
        look: [-6, 2, -24],
        mm: 32,
        aperture: 1.2,
        ease: 'slider',
        len: 4,
      },
      {
        pos: [-3, 0.7, -14],
        to: [-1, 0.7, -16],
        look: [2, 1.2, -30],
        mm: 85,
        aperture: 2.4,
        maxCoc: 14,
        ease: 'inOut',
        len: 3.6,
      },
      { ots: true, otsLook: [0, 1.5, -18], mm: 45, aperture: 1.8, ease: 'slider', len: 4 },
      {
        pos: [12, 5, 4],
        to: [10, 4, 0],
        look: [0, 2, -16],
        mm: 35,
        aperture: 0.8,
        ease: 'out',
        len: 3.6,
      },
      {
        pos: [30, 8, -10],
        to: [24, 13, -30],
        look: [0, 1, -12],
        mm: 32,
        aperture: 0.5,
        ease: 'slider',
        len: 5.2,
        cut: 'dissolve',
      },
    ],
  },
  {
    id: 'keys_bar',
    name: 'Low Tide Lola’s',
    tagline: 'Last stop before the bridge.',
    station: 'latin',
    ...RURAL,
    frame: (game) => {
      const b = game.keysBar;
      if (!b?.position) return null;
      const h = b.heading || 0;
      return {
        x: b.position.x,
        z: b.position.z,
        y: b.position.y,
        fx: Math.sin(h),
        fz: Math.cos(h),
      };
    },
    radius: 26,
    shots: FRONT_SHOTS,
  },
  {
    id: 'downtown',
    name: 'Downtown',
    tagline: 'Glass, cranes and borrowed money.',
    station: 'neon',
    trigger: (game, p) => /downtown/i.test(game.city?.districtAt?.(p.x, p.z) || ''),
    frame: (game) => ({ x: 407, z: -110, fx: 1, fz: 0 }), // stage 1 map v3: Downtown
    shots: [
      {
        pos: [-160, 190, 420],
        to: [-70, 140, 330],
        look: [0, 70, 0],
        lookTo: [0, 55, 0],
        mm: 28,
        aperture: 0.2,
        ease: 'slider',
        len: 5.6,
      },
      {
        pos: [40, 1.2, 120],
        to: [32, 1.4, 100],
        look: [0, 90, -20],
        lookTo: [0, 110, -20],
        mm: 24,
        aperture: 0.3,
        ease: 'slider',
        len: 4.4,
      },
      {
        pos: [-120, 70, 60],
        to: [-108, 74, 22],
        look: [0, 80, -40],
        mm: 70,
        aperture: 0.3,
        ease: 'inOut',
        len: 4,
      },
      { ots: true, otsLook: [0, 40, -60], mm: 35, aperture: 1.2, ease: 'slider', len: 4 },
      {
        pos: [200, 40, 0],
        to: [200, 48, -80],
        look: [0, 70, 0],
        mm: 50,
        aperture: 0.2,
        ease: 'slider',
        len: 4.4,
      },
      {
        pos: [60, 260, 260],
        to: [20, 230, 200],
        look: [0, 40, 0],
        mm: 28,
        aperture: 0.2,
        ease: 'slider',
        len: 5.6,
        cut: 'dissolve',
      },
    ],
  },
];

export async function initV2(game) {
  if (!document.getElementById('pm-icard3-css')) {
    const st = document.createElement('style');
    st.id = 'pm-icard3-css';
    st.textContent = CARD_CSS;
    document.head.appendChild(st);
  }
  const cin = getCinema(game),
    P = game.player;
  let seen = new Set();
  try {
    const s = JSON.parse(localStorage.getItem('portsolana.v2.intros') || '[]');
    seen = new Set(s);
  } catch (e) {
    /* */
  }
  game.save?.register?.('intros', {
    version: 1,
    order: 70,
    save: () => ({ seen: [...seen] }),
    load: (d) => {
      seen = new Set(d?.seen || []);
    },
  });
  const frames = new Map();
  const frameOf = (pl) => {
    if (!frames.has(pl.id)) {
      let f = null;
      try {
        f = pl.frame(game);
      } catch (e) {
        /* */
      }
      if (f) {
        f.y = f.y ?? game.city?.groundHeightAt?.(f.x, f.z, 30) ?? 0;
        frames.set(pl.id, f);
      } else return null;
    }
    return frames.get(pl.id);
  };
  let playing = null,
    check = 0;
  game.updaters.push(function arrivalIntros(dt) {
    if (
      playing ||
      game.ui?.title ||
      game.ui?.paused ||
      game.ui?.dead ||
      game.frontEnd?.active ||
      (game.wanted?.level || 0) > 0
    )
      return;
    if ((check -= dt) > 0) return;
    check = 0.5;
    const st = P.state;
    if (st?.inVehicle && Math.abs(st.vehicle?.speedKmh || 0) > 25) return;
    for (const pl of PLACES) {
      if (seen.has(pl.id)) continue;
      const hit = pl.trigger
        ? pl.trigger(game, P.position)
        : (() => {
            const f = frameOf(pl);
            return f && Math.hypot(P.position.x - f.x, P.position.z - f.z) < (pl.radius || 25);
          })();
      if (hit) {
        play(pl);
        break;
      }
    }
  });
  game.intros = {
    places: PLACES,
    play: (id) => {
      const pl = PLACES.find((x) => x.id === id);
      if (pl) return play(pl, true);
    },
    seen: () => [...seen],
    reset() {
      seen.clear();
      persist();
    },
  };
  const persist = () => {
    try {
      localStorage.setItem('portsolana.v2.intros', JSON.stringify([...seen]));
    } catch (e) {
      /* */
    }
  };

  // ---- beat clock: when the next bar line of the station's current song lands (seconds from now)
  let musicT0 = 0; // when a file-scored intro (pl.music) started its track
  function barClock(station, beats) {
    if (beats) {
      const beat = 60 / beats.bpm,
        bar = beat * 4,
        t1 = performance.now();
      const nextBarIn = (minGap) => {
        const pos = (performance.now() - musicT0) / 1000;
        const k = Math.ceil((pos + minGap - beats.beat0) / bar);
        return beats.beat0 + k * bar - pos;
      };
      void t1;
      return { bar, beat, nextBarIn, bpm: beats.bpm };
    }
    const np = game.audio?.nowPlaying?.(station);
    const file =
      np &&
      Object.keys(BEATS).find(
        (f) =>
          f.startsWith(station + '/') &&
          np.title &&
          f.includes(np.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')),
      );
    const b = file ? BEATS[file] : { bpm: 120, beat0: 0 };
    const beat = 60 / b.bpm,
      bar = beat * 4;
    const off = np ? np.offset : performance.now() / 1000;
    const nextBarIn = (minGap) => {
      const pos = off + (performance.now() - t0) / 1000;
      let k = Math.ceil((pos + minGap - b.beat0) / bar);
      return b.beat0 + k * bar - pos;
    };
    const t0 = performance.now();
    return { bar, beat, nextBarIn, bpm: b.bpm };
  }

  // ---- clip safety: a camera keyframe never sits inside or behind a wall, under the ground, or inside the player.
  // Static colliders (buildings, walls, terrain) exist around the player, which is where an arrival intro plays.
  const STATIC = () => {
    const QF = game.RAPIER?.QueryFilterFlags;
    return QF ? QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS : undefined;
  };
  function solid(x, y, z) {
    const R = game.RAPIER,
      Wd = game.world;
    if (!R || !Wd) return false;
    try {
      const h = Wd.castRay(
        new R.Ray({ x, y: y + 40, z }, { x: 0, y: -1, z: 0 }),
        40,
        true,
        STATIC(),
      );
      if (!h) return false;
      const t = h.timeOfImpact ?? h.toi;
      if (t >= 39.95) return false;
      const up = Wd.castRay(new R.Ray({ x, y, z }, { x: 0, y: 1, z: 0 }), 0.01, true, STATIC());
      return !!up && (up.timeOfImpact ?? up.toi) <= 0.001;
    } catch (e) {
      return false;
    }
  }
  function safe(pos, look, avoidPlayer = true) {
    const R = game.RAPIER,
      Wd = game.world;
    const p = pos.slice();
    const g = game.city?.groundHeightAt?.(p[0], p[2], p[1]);
    if (Number.isFinite(g) && p[1] < g + 0.4) p[1] = g + 0.4;
    if (avoidPlayer) {
      const pp = P.position,
        dx = p[0] - pp.x,
        dz = p[2] - pp.z,
        d = Math.hypot(dx, dz);
      if (d < 1.1 && p[1] < pp.y + 1.6) {
        const k = 1.1 / (d || 1);
        p[0] = pp.x + (d ? dx : 1) * k;
        p[2] = pp.z + (d ? dz : 0) * k;
      }
    }
    if (!R || !Wd) return p;
    try {
      // camera inside a building: lift it out (2 m steps) rather than pushing sideways through more geometry
      for (let i = 0; i < 12 && solid(p[0], p[1], p[2]); i++) p[1] += 2;
      // something between the subject and the lens: bring the camera in front of it, toward the subject
      const dx = p[0] - look[0],
        dy = p[1] - look[1],
        dz = p[2] - look[2],
        L = Math.hypot(dx, dy, dz);
      if (L > 1.5 && !solid(look[0], look[1], look[2])) {
        const h = Wd.castRay(
          new R.Ray({ x: look[0], y: look[1], z: look[2] }, { x: dx / L, y: dy / L, z: dz / L }),
          L,
          true,
          STATIC(),
        );
        const t = h && (h.timeOfImpact ?? h.toi);
        if (h && t < L - 0.05) {
          const d = Math.max(1.2, t - 0.5);
          p[0] = look[0] + (dx / L) * d;
          p[1] = look[1] + (dy / L) * d;
          p[2] = look[2] + (dz / L) * d;
        }
      }
    } catch (e) {
      /* best effort */
    }
    return p;
  }

  // shot -> world-space camera move (frame-local shots, or an over-the-shoulder built on the player)
  function resolveShot(s, f, W) {
    const fov = s.mm ? mmToFov(s.mm) : (s.fov ?? 40);
    if (s.ots) {
      const pp = P.position,
        gy = game.city?.groundHeightAt?.(pp.x, pp.z, pp.y);
      const foot = Number.isFinite(gy) && Math.abs(gy - pp.y) < 2.5 ? gy : pp.y - 0.9;
      const tgt = W(s.otsLook || [0, 1.8, 0]);
      let dx = tgt[0] - pp.x,
        dz = tgt[2] - pp.z;
      const l = Math.hypot(dx, dz);
      if (l < 2 || l > 260) return null; // player is not somewhere this shot reads; skip it
      dx /= l;
      dz /= l;
      const rx = dz,
        rz = -dx; // camera-right of the line player -> subject
      const at = (back, side, up) => [
        pp.x - dx * back + rx * side,
        foot + up,
        pp.z - dz * back + rz * side,
      ];
      const from = at(1.45, 0.55, 1.78),
        to = at(1.05, 0.5, 1.74);
      return {
        fov,
        from: { pos: from, look: tgt },
        to: { pos: to, look: tgt },
        focus: tgt,
        ots: true,
      };
    }
    const look = W(s.look),
      lookTo = W(s.lookTo || s.look);
    return {
      fov,
      from: { pos: safe(W(s.pos), look), look },
      to: { pos: safe(W(s.to || s.pos), lookTo), look: lookTo },
    };
  }

  // the music: soft under the establishing shot, swells with the title card, settles out under the handoff
  let swell = null;
  function gainTo(v, sec) {
    const mm = game.menuMusic;
    if (!mm) return;
    const g0 = mm.gain ?? v,
      t0 = performance.now();
    swell = { g0, v, t0, sec };
  }
  function swellTick() {
    const mm = game.menuMusic;
    if (!mm || !swell) return;
    const k = Math.min(1, (performance.now() - swell.t0) / 1000 / Math.max(0.01, swell.sec));
    mm.gain = swell.g0 + (swell.v - swell.g0) * EASE.inOut(k);
    if (k >= 1) swell = null;
  }

  async function play(pl, force) {
    const f = frameOf(pl);
    if (!f || playing) return;
    playing = pl.id;
    seen.add(pl.id);
    persist();
    const wasScript = P.script;
    P.script = { lock: true, fixed() {}, anim: { speed: 0, grounded: true } };
    const leaveUI = game.bindings?.pushMode?.('ui');
    let skipped = false;
    const offNav = game.bindings?.on?.('nav', (d) => {
      if (d.dir === 'back' || d.dir === 'accept' || d.dir === 'start') {
        skipped = true;
        d.handled = true;
      }
    });
    const sleep = (sec) =>
      new Promise((r) => {
        const t0 = performance.now();
        const tick = () => {
          swellTick();
          if (skipped || (performance.now() - t0) / 1000 >= sec) r();
          else setTimeout(tick, 30);
        };
        tick();
      });
    const prevMusic = game.menuMusic;
    game.menuMusic = { station: pl.music || pl.station, gain: 0.5, duck: 0.4, duckLP: 5200 };
    musicT0 = performance.now();
    document.body.classList.add('pm-intro');
    // title card
    const card = document.createElement('div');
    card.className = 'pm-icard pm-icard-v3';
    card.innerHTML = `<div class="pm-icard-in"><span class="pm-icard-k">${esc(game.city?.districtAt?.(f.x, f.z) || 'Southline')}</span><b>${esc(pl.name.toUpperCase())}</b><i></i><p>${esc(pl.tagline)}</p></div><div class="pm-iskip">${game.bindings?.codeGlyph?.('Enter') || ''} Skip</div>`;
    document.body.appendChild(card);
    const W = (v) => [
      f.x + v[0] * f.fz + v[2] * f.fx,
      (f.y || 0) + v[1],
      f.z - v[0] * f.fx + v[2] * f.fz,
    ];
    cin.begin({
      letterbox: false,
      dof: true,
      flare: true,
      grain: 1.5,
      vignette: 0.16,
      owner: 'intro',
    });
    await cin.black(true, 420);
    // pre-roll under black: visit every shot's camera pose so the streamer (it follows the camera) builds that view,
    // shaders compile and LODs settle; nothing pops in once a shot is on screen. Capped so it never stalls long.
    const plan = [];
    try {
      await cin.waitStream(f.x, f.z, 3000, 200);
      const tEnd = performance.now() + 5200;
      for (const s of pl.shots) {
        const r = resolveShot(s, f, W);
        if (!r) continue;
        plan.push({ s, r });
        for (const end of [r.from, r.to]) {
          if (skipped || performance.now() > tEnd) break;
          cin.shot({ dur: 1, fov: r.fov, handheld: 0, from: end });
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
          await cin.waitStream(
            end.pos[0],
            end.pos[2],
            Math.max(0, Math.min(900, tEnd - performance.now())),
            90,
          );
        }
      }
    } catch (e) {
      console.error('[intros] pre-roll', e);
    }
    const clock = barClock(pl.music || pl.station, pl.music ? pl.beats : null);
    const shotSpec = (i) => {
      const { s, r } = plan[i];
      return {
        fov: r.fov,
        aperture: s.aperture,
        maxCoc: s.maxCoc ?? 12,
        handheld: r.ots ? 0.9 : 0.55,
        focus: r.focus,
        from: r.from,
        to: r.to,
        ease: EASE[s.ease] || EASE.slider,
      };
    };
    try {
      if (plan.length && !skipped) {
        cin.shot({ ...shotSpec(0), dur: 30 });
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      }
      cin.letterbox(true);
      for (let i = 0; i < plan.length && !skipped; i++) {
        const { s } = plan[i];
        const bars = Math.max(1, Math.round((s.len || 4) / clock.bar));
        const wait = clock.nextBarIn(clock.bar * bars * 0.8);
        if (i > 0 && s.cut === 'dissolve') await cin.crossfade(Math.min(1400, wait * 450));
        // the move runs a little past the cut so the camera is still travelling when the next shot lands (cut on motion)
        cin.shot({ ...shotSpec(i), dur: wait + 0.6 });
        if (i === 0) {
          cin.black(false, 900);
          gainTo(0.78, 2.5);
        }
        if (i === 1) {
          card.classList.add('show');
          gainTo(1.0, 1.6);
        }
        if (i === plan.length - 2) card.classList.add('out');
        if (i === plan.length - 1) gainTo(0.7, wait);
        await sleep(wait);
      }
    } catch (e) {
      console.error('[intros]', e);
    }
    // hand back: settle the gameplay camera behind the player and blend into it
    card.classList.add('out');
    if (skipped) {
      cin.cancelFade();
      await cin.black(true, 220);
    }
    game.cameraYaw = P.heading + Math.PI;
    cin.handoff(skipped ? 10 : 1300);
    cin.end();
    if (skipped) cin.black(false, 380);
    else cin.black(false, 10);
    swell = null;
    game.menuMusic = prevMusic || null;
    offNav?.();
    leaveUI?.();
    P.script = wasScript && !wasScript.title && !wasScript.devTeleport ? wasScript : null; // never restore a dev-teleport hold (it was already released; restoring it pinned the player for good, QA)
    document.body.classList.remove('pm-intro');
    setTimeout(() => card.remove(), 1200);
    playing = null;
    try {
      game.save?.requestAutosave?.(3);
    } catch (e) {
      /* */
    }
    game.emit?.('intro:done', { id: pl.id, skipped });
  }
}

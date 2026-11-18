// SOUTHLINE: arrival intros (main-menu track). The first time the player reaches a special place, a short
// cutscene plays on the cinematic director (ui/menu/cinema.js): about six quick shots with depth of field and the
// letterbox, cut on the bar lines of the radio song that plays under it (src/audio/radio.js wall clock +
// ui/menu/beats.json tempo map), and a title card. Once per save (save slice 'intros'), skippable, smooth handoff.
//
// Add a place: push to PLACES. Each place resolves a frame { x, y, z, fx, fz } at run time (fx/fz = the way the
// place faces: its front, toward the street or the water) and lists shots in that frame's local space:
//   pos / look: [right, up, forward] metres from the frame origin (forward = fx/fz); to: end of the move.
import { esc } from '../core/dom.js';
import { getCinema } from './cinema.js';
import BEATS from './beats.json';

export const order = 960;

const nearestStorefront = (game, re, near) => {
  const sf = game.city?.storefronts || []; let best = null, bd = Infinity;
  for (const f of sf) { if (!re.test(String(f.kind || '') + ' ' + String(f.name || ''))) continue; const d = near ? Math.hypot(f.x - near.x, f.z - near.z) : 0; if (d < bd) { bd = d; best = f; } }
  if (!best) return null;
  let fx = (best.fx ?? best.x) - best.x, fz = (best.fz ?? best.z) - best.z; const l = Math.hypot(fx, fz) || 1;
  return { x: best.fx ?? best.x, z: best.fz ?? best.z, fx: fx / l, fz: fz / l, name: best.name };
};

// standard grammar for a storefront arrival: establishing crane, low dolly, details, the door, a reverse on the street
const FRONT_SHOTS = [
  { pos: [-26, 22, 34], to: [-14, 12, 26], look: [0, 4, 0], fov: 46, aperture: 0.4 },
  { pos: [9, 0.6, 9], to: [5, 0.8, 7], look: [-4, 4.5, -1], fov: 34, aperture: 1.2 },
  { pos: [-5, 4.5, 4], to: [-3, 4.2, 3.4], look: [1.5, 5.2, 0], fov: 28, aperture: 2.2 },
  { pos: [3, 1.6, 6], to: [1.4, 1.6, 4], look: [0, 1.7, 0], fov: 36, aperture: 1.6 },
  { pos: [0, 1.2, 1.4], to: [0, 1.3, 4.2], look: [0, 1.8, 14], fov: 40, aperture: 1.0 },
  { pos: [14, 7, 18], to: [-14, 7, 18], look: [0, 3.5, 0], fov: 40, aperture: 0.6 },
];

export const PLACES = [
  {
    id: 'club', name: 'Velvet Undertow', tagline: "South Beach's after-hours.", station: 'neon', hour: [21, 4],
    frame: (game) => { const s = game.bizSites?.sites?.find((x) => x.id === 'biz_club'); if (s?.front) return { x: s.x, z: s.z, fx: s.front.dx, fz: s.front.dz }; const p = game.club?.pos; return p ? { x: p.x, z: p.z, fx: 0, fz: 1 } : null; },
    radius: 28, shots: FRONT_SHOTS,
  },
  {
    id: 'hotel', name: 'The Coralline', tagline: 'Deco lobby, ocean views, no questions.', station: 'lowtide',
    frame: (game) => nearestStorefront(game, /hotel|resort|lodging/i, { x: 2400, z: -500 }),
    radius: 22, shots: FRONT_SHOTS,
  },
  {
    id: 'marina', name: 'Bayside Marina', tagline: 'Where money ties up for the night.', station: 'latin',
    frame: (game) => nearestStorefront(game, /marina|boat|yacht|ferry/i, { x: 1100, z: -300 }),
    radius: 30,
    shots: [
      { pos: [-40, 26, 50], to: [-22, 14, 38], look: [0, 1, -10], fov: 44, aperture: 0.4 },
      { pos: [8, 1.2, -6], to: [4, 1.0, -10], look: [-6, 1.5, -24], fov: 34, aperture: 1.4 },
      { pos: [-3, 0.5, -14], to: [-1, 0.6, -16], look: [2, 1.2, -30], fov: 30, aperture: 2 },
      { pos: [12, 5, 4], to: [10, 4, 0], look: [0, 2, -16], fov: 38, aperture: 0.8 },
      { pos: [0, 1.4, 3], to: [0, 1.5, 0], look: [0, 1.6, -20], fov: 42, aperture: 0.9 },
      { pos: [30, 10, -10], to: [24, 9, -30], look: [0, 1, -12], fov: 40, aperture: 0.6 },
    ],
  },
  {
    id: 'keys_bar', name: 'Low Tide Lola’s', tagline: 'Last stop before the bridge.', station: 'latin',
    frame: (game) => { const b = game.keysBar; if (!b?.position) return null; const h = b.heading || 0; return { x: b.position.x, z: b.position.z, y: b.position.y, fx: Math.sin(h), fz: Math.cos(h) }; },
    radius: 26, shots: FRONT_SHOTS,
  },
  {
    id: 'downtown', name: 'Downtown', tagline: 'Glass, cranes and borrowed money.', station: 'neon',
    trigger: (game, p) => /downtown/i.test(game.city?.districtAt?.(p.x, p.z) || ''),
    frame: (game) => ({ x: 407, z: -110, fx: 1, fz: 0 }), // stage 1 map v3: Downtown
    shots: [
      { pos: [-160, 180, 420], to: [-60, 150, 330], look: [0, 60, 0], fov: 40, aperture: 0.2 },
      { pos: [40, 2, 120], to: [30, 2, 100], look: [0, 90, -20], fov: 30, aperture: 0.3 },
      { pos: [-120, 70, 60], to: [-110, 72, 20], look: [0, 80, -40], fov: 34, aperture: 0.3 },
      { pos: [0, 1.6, 30], to: [0, 1.6, 20], look: [0, 30, -60], fov: 46, aperture: 0.4 },
      { pos: [200, 40, 0], to: [200, 46, -80], look: [0, 70, 0], fov: 32, aperture: 0.2 },
      { pos: [60, 260, 260], to: [20, 240, 200], look: [0, 40, 0], fov: 44, aperture: 0.2 },
    ],
  },
];

export async function initV2(game) {
  const cin = getCinema(game), P = game.player;
  let seen = new Set();
  try { const s = JSON.parse(localStorage.getItem('portsolana.v2.intros') || '[]'); seen = new Set(s); } catch (e) { /* */ }
  game.save?.register?.('intros', { version: 1, order: 70, save: () => ({ seen: [...seen] }), load: (d) => { seen = new Set(d?.seen || []); } });
  const frames = new Map();
  const frameOf = (pl) => { if (!frames.has(pl.id)) { let f = null; try { f = pl.frame(game); } catch (e) { /* */ } if (f) { f.y = f.y ?? (game.city?.groundHeightAt?.(f.x, f.z, 30) ?? 0); frames.set(pl.id, f); } else return null; } return frames.get(pl.id); };
  let playing = null, check = 0;
  game.updaters.push(function arrivalIntros(dt) {
    if (playing || game.ui?.title || game.ui?.paused || game.ui?.dead || game.frontEnd?.active || (game.wanted?.level || 0) > 0) return;
    if ((check -= dt) > 0) return; check = 0.5;
    const st = P.state; if (st?.inVehicle && Math.abs(st.vehicle?.speedKmh || 0) > 25) return;
    for (const pl of PLACES) {
      if (seen.has(pl.id)) continue;
      const hit = pl.trigger ? pl.trigger(game, P.position) : (() => { const f = frameOf(pl); return f && Math.hypot(P.position.x - f.x, P.position.z - f.z) < (pl.radius || 25); })();
      if (hit) { play(pl); break; }
    }
  });
  game.intros = { places: PLACES, play: (id) => { const pl = PLACES.find((x) => x.id === id); if (pl) return play(pl, true); }, seen: () => [...seen], reset() { seen.clear(); persist(); } };
  const persist = () => { try { localStorage.setItem('portsolana.v2.intros', JSON.stringify([...seen])); } catch (e) { /* */ } };

  // ---- beat clock: when the next bar line of the station's current song lands (seconds from now)
  function barClock(station) {
    const np = game.audio?.nowPlaying?.(station);
    const file = np && Object.keys(BEATS).find((f) => f.startsWith(station + '/') && np.title && f.includes(np.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')));
    const b = file ? BEATS[file] : { bpm: 120, beat0: 0 };
    const beat = 60 / b.bpm, bar = beat * 4;
    const off = np ? np.offset : (performance.now() / 1000);
    const nextBarIn = (minGap) => { const pos = off + (performance.now() - t0) / 1000; let k = Math.ceil((pos + minGap - b.beat0) / bar); return b.beat0 + k * bar - pos; };
    const t0 = performance.now();
    return { bar, beat, nextBarIn, bpm: b.bpm };
  }

  async function play(pl, force) {
    const f = frameOf(pl); if (!f || playing) return;
    playing = pl.id; seen.add(pl.id); persist();
    const wasScript = P.script;
    P.script = { lock: true, fixed() {}, anim: { speed: 0, grounded: true } };
    const leaveUI = game.bindings?.pushMode?.('ui');
    let skipped = false;
    const offNav = game.bindings?.on?.('nav', (d) => { if (d.dir === 'back' || d.dir === 'accept' || d.dir === 'start') { skipped = true; d.handled = true; } });
    const prevMusic = game.menuMusic;
    game.menuMusic = { station: pl.station, gain: 0.95, duck: 0.45, duckLP: 6000 };
    document.body.classList.add('pm-intro');
    // title card
    const card = document.createElement('div'); card.className = 'pm-icard';
    card.innerHTML = `<div class="pm-icard-in"><span class="pm-icard-k">${esc(game.city?.districtAt?.(f.x, f.z) || 'Southline')}</span><b>${esc(pl.name.toUpperCase())}</b><i></i><p>${esc(pl.tagline)}</p></div><div class="pm-iskip">${game.bindings?.codeGlyph?.('Enter') || ''} Skip</div>`;
    document.body.appendChild(card);
    const W = (v) => [f.x + v[0] * f.fz + v[2] * f.fx, (f.y || 0) + v[1], f.z - v[0] * f.fx + v[2] * f.fz];
    cin.begin({ letterbox: true, dof: true, flare: true, grain: 1.5, vignette: 0.14, owner: 'intro' });
    await cin.black(true, 350);
    { const s0 = pl.shots[0]; cin.shot({ dur: 9, fov: s0.fov, from: { pos: W(s0.pos), look: W(s0.look) } }); await cin.waitStream(f.x, f.z, 3500, 200); }
    const clock = barClock(pl.station);
    const barsPerShot = clock.bar < 1.7 ? 2 : 1;
    try {
      for (let i = 0; i < pl.shots.length && !skipped; i++) {
        const s = pl.shots[i];
        const wait = clock.nextBarIn(clock.bar * barsPerShot * 0.85);
        cin.shot({ dur: wait + 0.4, fov: s.fov, aperture: s.aperture, maxCoc: 12, handheld: 0.5, from: { pos: W(s.pos), look: W(s.look) }, to: { pos: W(s.to || s.pos), look: W(s.lookTo || s.look) }, ease: (t) => t });
        if (i === 0) { cin.black(false, 280); }
        if (i === 1) card.classList.add('show');
        if (i === pl.shots.length - 2) card.classList.add('out');
        const t0 = performance.now();
        while (!skipped && (performance.now() - t0) / 1000 < wait) await new Promise((r) => setTimeout(r, 30));
      }
    } catch (e) { console.error('[intros]', e); }
    // hand back: settle the gameplay camera behind the player and blend into it
    card.classList.add('out');
    if (skipped) await cin.black(true, 220);
    game.cameraYaw = P.heading + Math.PI;
    cin.handoff(skipped ? 10 : 900);
    cin.end();
    if (skipped) cin.black(false, 380);
    game.menuMusic = prevMusic || null;
    offNav?.(); leaveUI?.();
    P.script = wasScript && !wasScript.title && !wasScript.devTeleport ? wasScript : null; // never restore a dev-teleport hold (it was already released; restoring it pinned the player for good, QA)
    document.body.classList.remove('pm-intro');
    setTimeout(() => card.remove(), 1200);
    playing = null;
    try { game.save?.requestAutosave?.(3); } catch (e) { /* */ }
    game.emit?.('intro:done', { id: pl.id, skipped });
  }
}

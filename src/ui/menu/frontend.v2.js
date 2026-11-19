// SOUTHLINE: the front end (main-menu track). Title screen over a live in-engine scene, the story main menu (Play, Free
// Roam, Restart Story, Multiplayer placeholder, Settings, Credits, Quit; Play / Free Roam / Restart run through
// game.story, src/story), credits, loading screen into the game, and the doorway to Settings and the Wardrobe.
//   game.frontEnd = { open(), openSettings(o), openWardrobe(o), active }
// The title is skipped under automation (navigator.webdriver) so other tracks' test scripts keep their old flow;
// ?menu=1 forces it on, ?menu=0 turns it off.
import './menu.css';
import './storyMenu.css';
import { createUIContext } from '../core/context.js';
import { el, esc, fmtClock } from '../core/dom.js';
import { logoSVG } from '../core/logo.js';
import { icon } from '../core/icons.js';
import { BRAND } from '../brand.js';
import { VERSION } from '../../version.js';
import { getCinema } from './cinema.js';
import { createGraphics } from './graphics.js';
import { buildTitleScenes } from './titleShots.js';
import { openSettingsScreen } from './settingsScreen.js';
import { openWardrobeStage } from './wardrobeStage.js';
import { createLoadScreen } from './loadScreen.js';
import * as loadingMusic from '../../audio/loadingMusic.js';
import { mountMusicMute } from './musicMute.js';
import creditsText from '../../../CREDITS.md?raw';

export const order = 950;

const TIPS = [
  'Press {enterVehicle} near any car to get in. Faster cars attract more attention.',
  'The police remember what they saw: your outfit, your face and your car. Change one and they lose the trail.',
  'Your phone ({phone}) has the map, jobs, your bank and the camera.',
  'Cash on you can be lost. Put it in the bank before you go looking for trouble.',
  'Businesses earn while you are away. Collect the safe before someone else does.',
  'Hold a corner long enough and it is yours: turf pays out every day.',
  'Change stations with {radioPrev} and {radioNext} while you drive.',
  'Nico keeps his clothes at home. The wardrobe is also in the pause menu.',
  'Night changes the city: clubs open, streets empty, and the neon comes up.',
  'Swim too long underwater and you will run out of breath.',
  'Every save keeps the last good copy. If one breaks, the backup loads.',
  'Golden hour in the Keys lasts longer than you think. Stop and look around.',
];
// menu music (user, Nov 18): the loading loop (src/audio/loadingMusic.js) plays through the title, the menus and both
// loading screens. The old title theme (port_solana_theme.aac) is now the Mission Passed sting (src/audio/passed.v2.js).
const NOW_PLAYING = {
  station: 'Main menu',
  title: 'Sleepwalking (Instrumental)',
  artist: 'Mindme',
};
const TITLE_HOURS_FALLBACK = 18.4;

export async function initV2(game) {
  const params = new URLSearchParams(location.search);
  const forced = params.get('menu');
  const enabled =
    forced === '1' || (forced !== '0' && !params.has('nomenu') && !navigator.webdriver);
  const ctx = createUIContext(game);
  try {
    if (game.quality?.name && ctx.settings.get('gfxPreset') !== 'custom')
      ctx.settings.values.gfxPreset = game.quality.name;
  } catch (e) {
    /* */
  }
  const gfx = createGraphics(game, ctx.settings);
  const cin = getCinema(game);
  registerWardrobeSlice(game);
  const fe = { active: false, ctx, gfx, cin };
  game.frontEnd = fe;
  const overPause = (o, open) => {
    if (o.from !== 'pause') return open(o);
    document.body.classList.add('pm-over-pause');
    return open({
      ...o,
      onClose() {
        document.body.classList.remove('pm-over-pause');
        o.onClose?.();
      },
    });
  };
  fe.openSettings = (o = {}) => overPause(o, (x) => openSettingsScreen(game, ctx, x));
  fe.openWardrobe = (o = {}) => overPause(o, (x) => openWardrobeStage(game, ctx, cin, x));
  if (enabled) startTitle(game, ctx, cin, fe, params);
}

// ---- the outfit rides in the save game too (the wardrobe also keeps it on this device)
function registerWardrobeSlice(game) {
  const S = game.save;
  if (!S?.register || !game.wardrobe) return;
  try {
    S.register('wardrobe', {
      version: 1,
      order: 60,
      save: () => {
        const c = game.wardrobe.current?.() || {};
        return { ids: Object.values(c).filter(Boolean) };
      },
      load: (d) => {
        if (!d?.ids?.length) return;
        for (const id of d.ids) {
          try {
            game.wardrobe.wear(id);
          } catch (e) {
            /* piece missing */
          }
        }
      },
    });
  } catch (e) {
    console.warn('[frontend] wardrobe save slice', e);
  }
}

// ---- pause menu: Wardrobe and Settings are tabs of the pause menu itself (src/ui/hud.js, user Nov 19); the extra
// WARDROBE / ALL SETTINGS buttons that used to sit next to Resume are gone. The Wardrobe tab calls
// fe.openWardrobe({ from: 'pause' }); fe.openSettings stays for the title menu.

function startTitle(game, ctx, cin, fe, params) {
  const P = game.player,
    layer = ctx.layer('screen');
  fe.active = true;
  document.body.classList.add('pm-front');
  game.ui.title = true;
  game.save?.inhibit?.('title');
  if (game.save) game.save.manualBoot = true;
  const leaveUI = ctx.bindings.pushMode('ui');
  // the player waits, still, wherever the scene needs him
  const heroAnim = {
    speed: 0,
    grounded: true,
    sprint: false,
    jumping: false,
    driving: false,
    punch: false,
    dead: false,
    swimming: false,
    wading: false,
  };
  P.script = { lock: true, title: true, fixed() {}, anim: heroAnim };

  // ---------------------------------------------------------------- DOM
  const root = el('div', 'pm ps-interactive');
  const sunId = 'pm-glow';
  root.innerHTML = `
    <div class="pm-grad"></div>
    <div class="pm-brand">
      <div class="pm-logo">${logoSVG()}</div>
      <div class="pm-tagline"><i></i><span>${esc(BRAND.tagline)}</span></div>
    </div>
    <nav class="pm-menu" hidden></nav>
    <div class="pm-press"><span>${esc(ctx.t('Press any key'))}</span></div>
    <div class="pm-place"><b class="pm-place-name"></b><span class="pm-place-sub"></span></div>
    <div class="pm-np" hidden><span class="pm-np-ico">${icon('radio')}</span><div><b class="pm-np-st"></b><span class="pm-np-tr"></span></div></div>
    <div class="pm-foot"><span class="pm-ver">v${esc(VERSION)} · ${esc(BRAND.coords)}</span><div class="pm-hints ps-hints"></div></div>
    <div class="pm-sub" hidden></div>`;
  layer.appendChild(root);
  if (false)
    try {
      root
        .querySelector('.pm-logo')
        .style.setProperty(
          '--pm-logo-mask',
          `url("data:image/svg+xml;utf8,${encodeURIComponent(logoSVG({ caption: false, color: '#fff', accent: '#fff' }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}")`,
        );
    } catch (e) {
      /* no shimmer */
    }
  const $ = (s) => root.querySelector(s);
  const menu = $('.pm-menu'),
    press = $('.pm-press'),
    hints = $('.pm-hints'),
    sub = $('.pm-sub');
  const placeName = $('.pm-place-name'),
    placeSub = $('.pm-place-sub'),
    np = $('.pm-np');
  requestAnimationFrame(() => root.classList.add('in'));

  // ---------------------------------------------------------------- scenes
  let scenes = [];
  try {
    scenes = buildTitleScenes(game);
  } catch (e) {
    console.error('[frontend] scenes', e);
  }
  const only = params.get('menushot');
  // wide establishing shots only on the title (no close-up of Nico until the character model is final)
  if (!only) scenes = scenes.filter((s) => s.id !== 'keys_hero');
  if (only)
    scenes = scenes.filter((s) => s.id === only).concat(scenes.filter((s) => s.id !== only));
  let si = -1,
    sceneTimer = 0,
    switching = false,
    live = true;
  const character = () => game.playerCharacter;
  function placePlayer(sc) {
    const p = sc.player;
    if (!p) return;
    try {
      game.teleport(p.x, null, p.z, p.heading);
    } catch (e) {
      /* */
    }
    try {
      character()?.setVisible?.(p.visible !== false);
    } catch (e) {
      /* */
    }
    heroAnim.lookAt = null;
  }
  async function nextScene(first) {
    if (!scenes.length || switching || !live) return;
    switching = true;
    const sc = scenes[(si + 1) % scenes.length];
    if (!first)
      await cin.crossfade(
        1700,
        (async () => {
          if (fe.screen === 'wardrobe') return;
          placePlayer(sc);
          game.timeOfDay = sc.hour ?? TITLE_HOURS_FALLBACK;
          cin.shot(sc.shot);
          const s = sc.stream || sc.player || {};
          await cin.waitStream(s.x ?? 0, s.z ?? 0, 4500);
        })(),
      );
    else {
      placePlayer(sc);
      game.timeOfDay = sc.hour ?? TITLE_HOURS_FALLBACK;
      cin.shot(sc.shot);
    }
    cin.setLook({ letterbox: true, dof: true, flare: true, flareGain: sc.flareGain ?? 1 });
    if (fe.screen === 'wardrobe') {
      switching = false;
      sceneTimer = 0;
      return;
    }
    si = (si + 1) % scenes.length;
    sceneTimer = 0;
    placeName.textContent = sc.place;
    placeSub.textContent = `${sc.sub || ''}  ·  ${fmtClock(sc.hour ?? 18)}`;
    root.querySelector('.pm-place').classList.remove('show');
    void root.offsetWidth;
    root.querySelector('.pm-place').classList.add('show');
    switching = false;
  }
  // default: the stylized key art with a slow Ken Burns move and light rays (always premium, cheap on laptops).
  // ?titlebg=live runs the in-engine cinematic scenes instead (camera paths depend on the world, which is still changing).
  const artBg =
    params.get('titlebg') !== 'live' &&
    params.get('titlebg') !== 'scene' &&
    !params.has('menushot');
  if (artBg) {
    live = false;
    root.insertAdjacentHTML(
      'afterbegin',
      `<div class="pm-titleart" style="background-image:url('/assets/ui/keyart_loading.webp')"><div class="pm-titlerays"></div></div>`,
    );
    placeName.textContent = 'Biscayne Bay';
    placeSub.textContent = 'Southline';
    root.querySelector('.pm-place').classList.add('show');
  } else {
    cin.begin({
      letterbox: true,
      dof: true,
      flare: true,
      grain: 1.5,
      vignette: 0.12,
      exposure: 0.86,
      bloom: 0.6,
      owner: 'title',
    });
    nextScene(true);
  }
  const SHOT_SECONDS = 13.5;
  const lockShot = params.has('menushot');
  game.updaters.push(function titleDirector(dt) {
    if (!live || fe.screen === 'wardrobe') return;
    sceneTimer += dt;
    const sc = scenes[si];
    if (sc && cin.active && fe.screen !== 'wardrobe') {
      // the hero looks past the lens, toward the light
      if (sc.player?.pose === 'hero') {
        const c = character();
        if (c?.lookAt) c.lookAt(game.camera.position);
      }
    }
    if (
      !lockShot &&
      sceneTimer > (sc?.shot?.dur ? Math.min(sc.shot.dur - 0.3, SHOT_SECONDS) : SHOT_SECONDS)
    ) {
      sceneTimer = -999;
      nextScene(false);
    }
  });

  // ---------------------------------------------------------------- music
  const startAudio = () => {
    try {
      window.dispatchEvent(new Event('pointerdown'));
    } catch (e) {
      /* */
    }
  };
  // the world under the title stays ducked; the loop carries on from the boot screen (start() only takes it over)
  const music = () => {
    game.menuMusic = { station: null, duck: 0.3, duckLP: 1600 };
    if (ctx.settings.get('menuMusic') === false) loadingMusic.stop(game, 0.8);
    else loadingMusic.start(game, { settings: ctx.settings });
  };
  music();
  try {
    mountMusicMute();
  } catch (e) {
    /* */
  }
  ctx.settings.on('menuMusic', () => {
    if (fe.screen !== 'loading' && game.ui?.title !== false) music();
  });
  for (const k of ['volMaster', 'volMusic'])
    ctx.settings.on(k, () => loadingMusic.setVolume(game, ctx.settings));
  let npLast = '';
  const npTimer = setInterval(() => {
    const n = NOW_PLAYING;
    if (!loadingMusic.playing() || ctx.settings.get('menuMusic') === false) {
      np.hidden = true;
      return;
    }
    const k = n.title + n.artist;
    np.hidden = false;
    if (k !== npLast) {
      npLast = k;
      np.querySelector('.pm-np-st').textContent = n.station;
      np.querySelector('.pm-np-tr').textContent = `${n.title} · ${n.artist}`;
      np.classList.remove('show');
      void np.offsetWidth;
      np.classList.add('show');
    }
  }, 1000);

  // ---------------------------------------------------------------- menu
  let hasSave = false;
  const isDesktop = !!window.portSolanaDesktop?.isDesktop;
  // Story menu (Phase A, Nov 19): one big Play; a first-time player sees Play and a short row of small options.
  // Play starts the intro or continues the story at the saved stage (src/story, game.story.beginPlay).
  const ITEMS = () =>
    [
      {
        id: 'play',
        label: 'Play',
        hero: true,
        sub: hasSave ? 'Continue the story' : 'Start the story in the Keys',
      },
      { id: 'freeroam', label: 'Free Roam', sub: 'Spawn at Nico’s house with the whole map open' },
      hasSave && {
        id: 'restart',
        label: 'Restart Story',
        sub: 'Erase your progress and begin again',
      },
      { id: 'multiplayer', label: 'Multiplayer', sub: 'Play with friends' },
      { id: 'settings', label: 'Settings', sub: 'Graphics, audio, controls, display' },
      { id: 'credits', label: 'Credits', sub: 'Who made this, and what with' },
      isDesktop && { id: 'quit', label: 'Quit', sub: 'Close the game' },
    ].filter(Boolean);
  async function refreshSave() {
    try {
      hasSave = !params.has('newgame') && !!(await game.save?.hasContinue?.());
    } catch (e) {
      hasSave = false;
    }
    if (hasSave) {
      try {
        const l = await game.save.list();
        const best = l
          .map((x) => x.latest)
          .filter(Boolean)
          .sort((a, b) => b.savedAt - a.savedAt)[0];
        fe.saveMeta = best || null;
      } catch (e) {
        /* */
      }
    }
  }
  function renderMenu() {
    const items = ITEMS();
    menu.classList.add('pm-story');
    menu.innerHTML = items.map((it, i) => menuItemHTML(it, i)).join('');
  }
  function menuItemHTML(it, i) {
    const desc = it.id === 'play' && hasSave && fe.saveMeta ? saveLine(fe.saveMeta) : it.sub;
    const cls = it.hero ? 'pm-item pm-hero' : 'pm-item pm-minor';
    return `<button class="${cls}" data-nav data-id="${it.id}" style="--i:${i}">
        <span class="pm-idx">${it.hero ? '' : String(i).padStart(2, '0')}</span>
        <span class="pm-lab">${esc(ctx.t(it.label))}</span>
        <span class="pm-desc">${esc(desc)}</span></button>`;
  }
  function saveLine(m) {
    const bits = [];
    if (m.day) bits.push('Day ' + m.day);
    if (m.district || m.place) bits.push(m.district || m.place);
    if (Number.isFinite(m.money ?? m.cash))
      bits.push('$' + Math.round(m.money ?? m.cash).toLocaleString('en-US'));
    if (m.savedAt) {
      const d = new Date(m.savedAt);
      if (!isNaN(d))
        bits.push(
          d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
            ' ' +
            d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
        );
    }
    return bits.join(' · ') || 'Pick up where you left off';
  }
  const glyph = (code) => ctx.bindings.codeGlyph(code);
  function setHints(list) {
    hints.innerHTML = list.map(([k, l]) => `<span>${k}${esc(l)}</span>`).join('');
  }
  const hintsMenu = () => setHints([]); // no control legend in the menus (user: minimal, GTA-like)

  let scope = null;
  fe.screen = 'attract';
  // the theme cues in as soon as the title screen is up (the Mac app allows audio without a click; a browser
  // starts it suspended and resumes on the first input)
  startAudio();
  // any key / click / pad button leaves the attract state
  const offNav = ctx.bindings.on('nav', (d) => {
    if (fe.screen === 'attract') {
      d.handled = true;
      openMenu();
    }
  });
  const offUiKey = ctx.bindings.on('uikey', (d) => {
    if (fe.screen === 'attract' && d.down && !/^F\d+$/.test(d.code)) openMenu();
  });
  root.addEventListener('pointerdown', () => {
    if (fe.screen === 'attract') openMenu();
  });
  setHints([[glyph('Enter'), 'Start']]);

  async function openMenu() {
    if (fe.screen !== 'attract') return;
    fe.screen = 'menu';
    startAudio();
    setTimeout(() => ctx.sfx('open'), 60);
    press.classList.add('out');
    await refreshSave();
    renderMenu();
    menu.hidden = false;
    root.classList.add('menu-on');
    hintsMenu();
    scope = ctx.nav.push({
      root: menu,
      wrap: true,
      onBack() {
        /* title has nowhere to go back to */
      },
    });
  }
  menu.addEventListener('nav:focus', (e) => {
    const b = e.target.closest('.pm-item');
    if (b) {
      menu.querySelectorAll('.pm-item').forEach((x) => x.classList.toggle('cur', x === b));
    }
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('.pm-item');
    if (b) choose(b.dataset.id);
  });

  function choose(id, o = {}) {
    switch (id) {
      case 'play':
      case 'continue': // quick title (quickTitle.js) still hands over its old ids
      case 'new':
        ctx.sfx('start');
        play('play', o);
        break;
      case 'freeroam':
        ctx.sfx('start');
        play('freeroam', o);
        break;
      case 'restart':
        ctx.sfx('open');
        openRestartConfirm();
        break;
      case 'multiplayer':
      case 'online':
        ctx.sfx('open');
        openMultiplayer();
        break;
      case 'wardrobe':
        ctx.sfx('open');
        openWardrobe();
        break;
      case 'settings':
        ctx.sfx('open');
        openSettings();
        break;
      case 'credits':
        ctx.sfx('open');
        openCredits();
        break;
      case 'quit':
        ctx.sfx('back');
        try {
          game.save?.release?.('title');
        } catch (e) {
          /* */
        }
        setTimeout(() => window.close(), 250);
        break;
      default:
        break;
    }
  }
  function hideMain(h) {
    root.classList.toggle('sub-on', h);
  }

  // ---------------------------------------------------------------- sub screens
  function openSub(html, cls, onClose) {
    hideMain(true);
    sub.className = 'pm-sub ' + cls;
    sub.innerHTML = html;
    sub.hidden = false;
    requestAnimationFrame(() => sub.classList.add('in'));
    const s = ctx.nav.push({ root: sub, onBack: close });
    function close() {
      ctx.sfx('close');
      s.pop();
      sub.classList.remove('in');
      setTimeout(() => {
        sub.hidden = true;
        sub.innerHTML = '';
      }, 260);
      hideMain(false);
      hintsMenu();
      onClose?.();
    }
    return { root: sub, close, scope: s };
  }
  // Multiplayer is built on its own branch (Phase D); until it lands this screen says so.
  function openMultiplayer() {
    const h = openSub(
      `
      <div class="pm-card pm-mp">
        <div class="pm-card-h"><span class="pm-kicker">${icon('globe')} Multiplayer</span><h2>Coming soon</h2>
        <p>Play Southline with your friends over the internet: host a session or join one with a room code, and talk
        with proximity voice chat.</p></div>
        <div class="pm-card-act"><button class="ps-btn ghost" data-nav data-act="back">Back</button></div>
      </div>`,
      'pm-sub-mp',
    );
    h.root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act=back]')) h.close();
    });
  }
  // Restart Story: a confirm card; Restart wipes every save and starts the intro from the beginning.
  function openRestartConfirm() {
    const h = openSub(
      `
      <div class="pm-card pm-confirm">
        <div class="pm-card-h"><span class="pm-kicker">${icon('star')} Restart Story</span>
        <h2>Start over?</h2>
        <p>This erases your story progress, money and items, and starts the story from the beginning.
        It cannot be undone.</p></div>
        <div class="pm-card-act">
          <button class="ps-btn ghost" data-nav data-act="back">Cancel</button>
          <button class="ps-btn primary pm-danger" data-nav data-act="restart">Restart</button>
        </div>
      </div>`,
      'pm-sub-confirm',
    );
    h.root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'back') h.close();
      else if (a === 'restart') {
        h.close();
        ctx.sfx('start');
        play('restart');
      }
    });
  }
  function openCredits() {
    const html = mdLite(creditsText);
    const h = openSub(
      `<div class="pm-card pm-credits"><div class="pm-card-h"><span class="pm-kicker">${icon('star')} Credits</span><h2>${esc(BRAND.name)}</h2><p>${esc(BRAND.studio)} · v${esc(VERSION)}. An original game: every name, brand and logo in it is made up.</p></div>
      <div class="pm-credits-body ps-scroll">${html}</div><div class="pm-card-act"><button class="ps-btn ghost" data-nav data-act="back">Back</button></div></div>`,
      'pm-sub-credits',
    );
    h.root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act=back]')) h.close();
    });
    // slow auto-scroll until the player touches it
    const body = h.root.querySelector('.pm-credits-body');
    let auto = true;
    body.addEventListener(
      'wheel',
      () => {
        auto = false;
      },
      { passive: true },
    );
    (function roll() {
      if (!body.isConnected) return;
      if (auto) body.scrollTop += 0.6;
      requestAnimationFrame(roll);
    })();
  }
  function openSettings() {
    hideMain(true);
    fe.screen = 'settings';
    root.classList.add('pane-on');
    fe.openSettings({
      from: 'title',
      onClose() {
        root.classList.remove('pane-on');
        hideMain(false);
        fe.screen = 'menu';
        hintsMenu();
      },
    });
  }
  function openWardrobe() {
    hideMain(true);
    fe.screen = 'wardrobe';
    root.classList.add('pane-on', 'ward-on');
    fe.openWardrobe({
      from: 'title',
      onClose() {
        root.classList.remove('pane-on', 'ward-on');
        hideMain(false);
        fe.screen = 'menu';
        hintsMenu();
        cin.begin({
          letterbox: true,
          dof: true,
          flare: true,
          grain: 1.7,
          vignette: 0.14,
          owner: 'title',
        });
        const sc = scenes[si];
        if (sc) {
          placePlayer(sc);
          game.timeOfDay = sc.hour;
          cin.shot(sc.shot);
        }
      },
    });
  }

  // ---------------------------------------------------------------- into the game
  let playing = false;
  async function play(kind, o = {}) {
    if (playing) return;
    playing = true;
    fe.screen = 'loading';
    scope?.pop();
    root.classList.add('leaving');
    const load = createLoading(game, ctx, kind, o.from);
    await cin.crossfade(900);
    live = false;
    await new Promise((r) => setTimeout(r, 380));
    // the menu loop carries on under the loading screen (start() is a no-op while it plays) until the reveal
    game.menuMusic = { station: null, duck: 0.3, duckLP: 1200 };
    loadingMusic.start(game, { settings: ctx.settings });
    try {
      game.save?.release?.('title');
      await startStory(kind);
    } catch (e) {
      console.error('[frontend] start', e);
    }
    try {
      character()?.setVisible?.(true);
      character()?.lookAt?.(null);
    } catch (e) {
      /* */
    }
    game.cameraYaw = P.heading + Math.PI;
    game.cameraPitch = 0.22;
    // camera waits above the player while the ground streams in
    const px = P.position.x,
      pz = P.position.z,
      py = P.position.y;
    const back = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
    cin.begin({
      letterbox: false,
      dof: true,
      flare: true,
      grain: 1.2,
      vignette: 0.08,
      owner: 'intro',
    });
    cin.shot({
      dur: 1e6,
      fov: 42,
      aperture: 0.4,
      from: { pos: [px - back.x * 26, py + 16, pz - back.z * 26], look: [px, py + 1, pz] },
    });
    try {
      await load.waitWorld(px, pz);
    } catch (e) {
      console.warn('[frontend] waitWorld', e);
    } // never leave the loading screen up
    // reveal: crane down from behind to the gameplay camera, then hand it over
    game.menuMusic = null;
    loadingMusic.stop(game, 1.6);
    root.remove();
    load.close();
    cin.shot({
      dur: 2.6,
      fov: 42,
      aperture: 0.5,
      ease: (t) => 1 - Math.pow(1 - t, 3),
      from: { pos: [px - back.x * 26, py + 16, pz - back.z * 26], look: [px, py + 1, pz] },
      to: { pos: [px - back.x * 5.2, py + 2.6, pz - back.z * 5.2], look: [px, py + 1.5, pz] },
    });
    await new Promise((r) => setTimeout(r, 2300));
    cin.handoff?.(1100);
    cin.end();
    finish();
    afterReveal(kind);
  }

  // Before the world loads: load or create the game and put the player where this choice starts.
  //   play      continue the newest save (or a new game at the house); a mission in progress resumes at its checkpoint
  //   freeroam  same save (or a new one), every intro mission skipped, at the house
  //   restart   every save erased, a new game at the house
  async function startStory(kind) {
    const story = game.story;
    if (kind === 'restart' && story) {
      await story.restartStory({ save: false });
      return;
    }
    let ok = false;
    if (hasSave) {
      const r = await game.save.continue();
      ok = !!r?.ok;
      if (!ok) console.warn('[frontend] continue failed', r);
    }
    if (!ok) {
      await game.save?.newGame?.();
      if (story) story.toHouse();
      else toHouseFallback();
    }
    if (kind === 'freeroam' && story) await story.skipIntro({ save: false });
    else if (kind === 'play' && story) story.preparePlay();
  }
  function toHouseFallback() {
    const sp = game.nicoHouse?.anchors?.spawnYard || game.nicoHouse?.anchors?.spawn;
    if (sp?.pos) game.teleport(sp.pos.x, sp.pos.y, sp.pos.z, sp.heading);
    else if (game.city?.playerSpawn)
      game.teleport(
        game.city.playerSpawn.x,
        null,
        game.city.playerSpawn.z,
        game.city.playerSpawnHeading,
      );
  }
  // Once the player has control: save the fresh state (so Continue finds it), then the story takes over.
  async function afterReveal(kind) {
    const story = game.story;
    if (!story) return;
    if (kind !== 'play' || !hasSave) await story.runner.autosave('menu:' + kind);
    if (kind === 'freeroam')
      game.hud?.notify?.(
        'Free roam: the whole map is open. Mission markers show on the map.',
        5000,
      );
    else await story.beginPlay();
  }
  function finish() {
    fe.active = false;
    fe.screen = null;
    clearInterval(npTimer);
    offNav();
    offUiKey();
    leaveUI();
    P.script = null;
    document.body.classList.remove('pm-front');
    game.ui.title = false;
    document.getElementById('ps-hud')?.classList.add('live');
    const clearLaw = () => {
      try {
        game.wanted?.clear?.('fresh start');
      } catch (e) {
        /* */
      }
    };
    clearLaw();
    setTimeout(clearLaw, 3000);
    const t = document.getElementById('title');
    if (t) t.style.display = 'none';
    try {
      game.renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
    } catch (e) {
      /* needs a click: the canvas asks on the next one */
    }
    game.emit?.('frontend:play', {});
  }
  fe.open = () => {
    /* the title only opens at boot */
  };
  // r2-web quick title (quickTitle.js): it was on screen while the engine loaded and hands over in the same state
  fe.quick = {
    openMenu,
    choose,
    focus(id) {
      const b = id && menu.querySelector(`.pm-item[data-id="${id}"]`);
      if (b && scope?.focus) scope.focus(b);
      else if (b) {
        menu.querySelectorAll('.pm-item').forEach((x) => x.classList.toggle('is-focus', x === b));
      }
    },
  };
  // dev: ?menushot=<id>&menustate=menu|settings|wardrobe|loading for shots
  const st = params.get('menustate');
  if (st)
    setTimeout(async () => {
      await openMenu();
      if (st === 'settings') openSettings();
      else if (st === 'wardrobe') openWardrobe();
      else if (st === 'online' || st === 'multiplayer') openMultiplayer();
      else if (st === 'restart') openRestartConfirm();
      else if (st === 'credits') openCredits();
    }, 600);
}

// ---------------------------------------------------------------- loading screen
function createLoading(game, ctx, kind, from = 2) {
  const fill = (t) =>
    esc(t).replace(
      / , and \. /,
      ` ${ctx.bindings.glyph('radioPrev')} and ${ctx.bindings.glyph('radioNext')} `,
    );
  const ls = createLoadScreen({ mount: ctx.layer('top'), fillTip: fill });
  const label = {
    play: 'Loading the story',
    freeroam: 'Heading to Nico’s house',
    restart: 'Starting the story over',
  };
  ls.set(from, label[kind] || 'Loading');
  return {
    // real readiness: streamed tiles (colliders + full-detail meshes) within 220 m of the player
    async waitWorld(x, z) {
      const t0 = performance.now(),
        st = game.city?.streamer;
      try {
        ls.place(game.city?.districtAt?.(x, z) || '');
      } catch (e) {
        /* */
      }
      const R = 320,
        ts = st?.tileSize || 200,
        expected = Math.max(4, Math.ceil((Math.PI * R * R) / (ts * ts)));
      for (;;) {
        const el2 = performance.now() - t0;
        let ready = 0,
          seen = 0;
        if (st)
          for (const t of st.tiles.values()) {
            const d = Math.hypot(t.cx - x, t.cz - z);
            if (d < R) {
              seen++;
              if (t.col && t.near) ready++;
            }
          }
        const around = st?.readyAround ? st.readyAround(x, z, 320) : true;
        const frac = around ? 1 : ready / Math.max(expected, seen);
        const pend = st?.pending?.() ?? 0;
        ls.set(
          Math.min(around ? 100 : 92, 8 + frac * 80 + (pend < 3 ? 8 : 0) + Math.min(4, el2 / 500)),
          around
            ? 'Ready'
            : pend > 0
              ? `Streaming the streets (${pend} left)`
              : 'Building colliders',
        );
        if ((around && el2 > 2200) || el2 > 25000) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      game.renderer.shadowMap.needsUpdate = true;
      await new Promise((r) => setTimeout(r, 350));
      ls.set(100, 'Ready');
      await new Promise((r) => setTimeout(r, 300));
    },
    close() {
      ls.close();
    },
  };
}

// minimal markdown for CREDITS.md: headings, bullets, links, code, bold
function mdLite(src) {
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
      .replace(/(https?:\/\/[^\s)<,]+)/g, '<span class="pm-url">$1</span>');
  let out = '',
    inList = false;
  for (const line of String(src).split('\n')) {
    const h = /^(#{1,4})\s+(.*)/.exec(line),
      li = /^\s*[-*]\s+(.*)/.exec(line);
    if (!li && inList) {
      out += '</ul>';
      inList = false;
    }
    if (h)
      out += `<h${Math.min(4, h[1].length + 2)}>${inline(h[2])}</h${Math.min(4, h[1].length + 2)}>`;
    else if (li) {
      if (!inList) {
        out += '<ul>';
        inList = true;
      }
      out += `<li>${inline(li[1])}</li>`;
    } else if (line.trim()) out += `<p>${inline(line)}</p>`;
  }
  if (inList) out += '</ul>';
  return out;
}

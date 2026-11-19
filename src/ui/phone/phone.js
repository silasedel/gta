// SOUTHLINE phone: "Kestrel OS", an original smartphone in a modern rounded style. Owns the device frame, status bar
// with the activity island, the home screen (widgets, app grid, dock, page dots), app launching with zoom-from-icon
// transitions, page stacks, sheets, banners, light/dark appearance, keyboard / controller / mouse input and the
// phone's own save slice (data.js). Apps live in ./apps/*.js and receive the `os` object built here.
//
// Input: the HUD calls api.toggle() (P, Arrow Up, pad Up) and api.nav(dir) / api.digit(n). With game.bindings the
// phone runs in the bindings layer's 'phone' mode: arrows, Enter, Backspace, Esc and digits drive the phone, every
// other key (WASD...) still reaches the game, so Nico can walk while the phone is up. The mouse cursor is freed while
// the phone is up (setting) so apps can be clicked and scrolled.
import './phone.css';
import { APP_ICONS, GLYPH, signalBars, batteryIcon, wifiIcon } from './icons.js';
import { createPhoneData } from './data.js';
import { createWire, fmt$ } from './wire.js';
import bankApp from './apps/bank.js';
import messagesApp from './apps/messages.js';
import phoneApp from './apps/phoneapp.js';
import mapsApp from './apps/maps.js';
import cameraApp from './apps/camera.js';
import weatherApp from './apps/weather.js';
import workApp from './apps/work.js';
import wavvyApp from './apps/wavvy.js';
import settingsApp from './apps/settings.js';
import switchApp from './apps/switchapp.js';

export const OS_NAME = 'Kestrel OS';
export const OS_VERSION = '6.2';
const W = 393,
  H = 852,
  BEZEL = 11;
const PREFS_KEY = 'southline.phone.prefs';
const DEFAULT_PREFS = {
  appearance: 'auto',
  wallpaper: 'dusk',
  volume: 0.7,
  silent: false,
  freeCursor: true,
  ringtone: 'Lagoon',
  peek: true,
  h24: false,
};

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let gameRef = null;
const reduced = () => {
  try {
    return (
      !!gameRef?.uiSettings?.get?.('reducedMotion') ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch (e) {
    return false;
  }
};

export function createPhone(game, hooks = {}) {
  gameRef = game;
  // ---------------------------------------------------------------- prefs (per device, not per save)
  let prefs = { ...DEFAULT_PREFS };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
  } catch (e) {
    /* private mode */
  }
  const savePrefs = () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* */
    }
  };

  const data = createPhoneData(game);
  const wire = createWire(game, data);

  // ---------------------------------------------------------------- DOM
  const h = (html) => {
    const t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  };
  const wrap = h(`<div class="kp-wrap" aria-hidden="true"><div class="kp-device">
      <i class="kp-btn-hw kp-hw-a"></i><i class="kp-btn-hw kp-hw-b"></i><i class="kp-btn-hw kp-hw-c"></i><i class="kp-btn-hw kp-hw-d"></i>
      <div class="kp-screen" data-theme="dark" data-input="mouse">
        <div class="kp-wall"></div>
        <div class="kp-home">
          <div class="kp-hpages"><div class="kp-htrack"></div></div>
          <div class="kp-dots"></div>
          <div class="kp-dock glass"></div>
        </div>
        <div class="kp-apps"></div>
        <div class="kp-status"><span class="kp-time">9:41</span><span class="kp-sicons"></span></div>
        <div class="kp-island"><div class="kp-isl-l"></div><div class="kp-isl-r"></div></div>
        <div class="kp-banners"></div>
        <div class="kp-homebar" data-act="__home"><i></i></div>
        <div class="kp-flash"></div>
      </div></div></div>`);
  (hooks.root || document.body).appendChild(wrap);
  const device = wrap.querySelector('.kp-device'),
    screen = wrap.querySelector('.kp-screen');
  const homeEl = screen.querySelector('.kp-home'),
    track = screen.querySelector('.kp-htrack'),
    dotsEl = screen.querySelector('.kp-dots'),
    dock = screen.querySelector('.kp-dock');
  const appsEl = screen.querySelector('.kp-apps'),
    timeEl = screen.querySelector('.kp-time'),
    sIcons = screen.querySelector('.kp-sicons');
  const island = screen.querySelector('.kp-island'),
    islL = island.querySelector('.kp-isl-l'),
    islR = island.querySelector('.kp-isl-r');
  const banners = screen.querySelector('.kp-banners'),
    homebar = screen.querySelector('.kp-homebar'),
    flashEl = screen.querySelector('.kp-flash');

  // scale: the device is authored at 393 x 852 points and zoomed to ~70% of the window height
  let K = 0.7;
  function layout() {
    const vh = innerHeight || 900,
      vw = innerWidth || 1600;
    K = clamp(Math.min((vh * 0.68) / (H + BEZEL * 2), (vw * 0.32) / (W + BEZEL * 2)), 0.42, 1);
    device.style.zoom = K.toFixed(4);
    wrap.style.setProperty('--kp-k', K.toFixed(4));
  }
  layout();
  addEventListener('resize', layout);

  // ---------------------------------------------------------------- state
  const st = {
    open: false,
    app: null,
    apps: new Map(),
    page: 0,
    theme: 'dark',
    input: 'mouse',
    focus: null,
    lastStatus: '',
    island: null,
    peekT: 0,
  };
  const APPS = {};
  const os = {
    game,
    data,
    wire,
    prefs,
    esc,
    h,
    fmt$,
    GLYPH,
    APP_ICONS,
    OS_NAME,
    OS_VERSION,
    hooks,
    get theme() {
      return st.theme;
    },
    get isOpen() {
      return st.open;
    },
    get app() {
      return st.app;
    },
    money: (v, o = {}) => (o.sign && v > 0 ? '+' : '') + fmt$(v, o.cents !== false),
    savePrefs: () => {
      savePrefs();
      applyTheme();
      paintWallpaper();
    },
    sound,
    toast,
    notify,
    openApp,
    closeApp,
    close: () => setOpen(false),
    page,
    push,
    pop,
    popToRoot,
    replaceTop,
    sheet,
    closeSheet,
    setFocus,
    refocus,
    back,
    statusRefresh: () => updateStatusColor(),
    overlay: (app, el, onBack) => {
      app.overlay = el;
      el._back = onBack;
      refocus();
    },
    isHeld,
    island: setIsland,
    when,
    dayLabel,
    clock,
    flash,
    brand: bankBrand,
    contactAvatar,
    rowsHTML,
    keypadHTML,
    amountText,
    onTick,
    homeRefresh: () => renderHome(),
  };

  // ---------------------------------------------------------------- time helpers
  function clock(hours, o = {}) {
    const t = (((Number(hours) || 0) % 24) + 24) % 24,
      hh = Math.floor(t),
      mm = Math.floor((t - hh) * 60 + 1e-6);
    if (prefs.h24 || game.settings?.clock24h)
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')}${o.ampm === false ? '' : hh < 12 ? ' AM' : ' PM'}`;
  }
  const nowMin = () => data.now();
  const today = () => game.time?.day || Math.floor(nowMin() / 1440) + 1;
  function dayLabel(d, o = {}) {
    const t = today();
    if (d === t) return 'Today';
    if (d === t - 1) return 'Yesterday';
    try {
      const x = game.time?.dateOfDay?.(d);
      if (x)
        return o.short
          ? `${x.weekdayName.slice(0, 3)}, ${x.monthName.slice(0, 3)} ${x.day}`
          : `${x.weekdayName}, ${x.monthName} ${x.day}`;
    } catch (e) {
      /* */
    }
    return `Day ${d}`;
  }
  /** Short time stamp for lists: '6:42 PM', 'Yesterday', 'Tue', '6/12'. */
  function when(tMin) {
    const d = Math.floor(tMin / 1440) + 1,
      t = today();
    if (d === t) return clock((tMin % 1440) / 60);
    if (d === t - 1) return 'Yesterday';
    if (t - d < 7) {
      try {
        return game.time.dateOfDay(d).weekdayName;
      } catch (e) {
        return `Day ${d}`;
      }
    }
    try {
      const x = game.time.dateOfDay(d);
      return `${x.month}/${x.day}`;
    } catch (e) {
      return `Day ${d}`;
    }
  }

  // ---------------------------------------------------------------- theme + wallpaper
  function isNight() {
    const hr = Number(game.time?.hour ?? game.timeOfDay ?? 12);
    const sun = game.time?.sun;
    const rise = Number.isFinite(sun?.rise) ? sun.rise : 6.6,
      set = Number.isFinite(sun?.set) ? sun.set : 19.9;
    return hr < rise - 0.25 || hr > set + 0.35;
  }
  function applyTheme() {
    const t =
      prefs.appearance === 'light'
        ? 'light'
        : prefs.appearance === 'dark'
          ? 'dark'
          : isNight()
            ? 'dark'
            : 'light';
    if (t !== st.theme) {
      st.theme = t;
      screen.dataset.theme = t;
      for (const a of st.apps.values()) a.def.onTheme?.(t);
    }
  }
  function paintWallpaper() {
    screen.dataset.wall = prefs.wallpaper || 'dusk';
  }

  // ---------------------------------------------------------------- sounds (game UI bus; muted with ?mute)
  function sound(name, v = 1) {
    if (prefs.silent && name !== 'confirm') return;
    try {
      game.audio?.ui?.(name, { volume: prefs.volume * v });
    } catch (e) {
      /* */
    }
  }

  // ---------------------------------------------------------------- bank brand (the core money system picks the player's bank)
  let brandCache = null;
  function bankBrand() {
    if (brandCache) return brandCache;
    let b = null;
    try {
      const id = game.bank?.brandId;
      b = id ? game.design?.getBrand?.(id) : null;
    } catch (e) {
      b = null;
    }
    const THEMES = {
      'Unison Bank': {
        a: '#0a3d91',
        b: '#00a3e0',
        c: '#06275f',
        short: 'Unison',
        tag: 'Banking, together.',
      },
      'Banco Almendares': {
        a: '#0f5c4d',
        b: '#d9b44a',
        c: '#0b2f28',
        short: 'Almendares',
        tag: 'Su banco, en su idioma.',
      },
      'Cormorant Trust': {
        a: '#1d2a3a',
        b: '#b89b5e',
        c: '#0f1722',
        short: 'Cormorant',
        tag: 'Private banking.',
      },
    };
    const name = b?.name || 'Coral Federal';
    const th =
      THEMES[name] ||
      (b?.palette
        ? {
            a: b.palette.primary,
            b: b.palette.accent || b.palette.secondary,
            c: b.palette.ink || '#0b1020',
            short: name.split(' ')[0],
            tag: b.tagline || '',
          }
        : {
            a: '#e2574c',
            b: '#22b5a5',
            c: '#3a1414',
            short: 'Coral',
            tag: 'Your money, on island time.',
          });
    let logo = null;
    try {
      if (b && game.design?.logoCanvas) {
        const c = game.design.logoCanvas(b, 160, {
          variant: 'mark',
          mono: '#ffffff',
          pad: 0.12,
          square: true,
        });
        logo = c?.toDataURL?.('image/png') || null;
      }
    } catch (e) {
      logo = null;
    }
    const out = { name, ...th, logo, brand: b };
    if (game.bank && game.design) brandCache = out; // systems not up yet: do not freeze the fallback
    return out;
  }

  // ---------------------------------------------------------------- avatars and shared HTML parts
  function contactAvatar(c, size = 40) {
    if (!c) return `<span class="kp-av" style="--s:${size}px;--h:220">?</span>`;
    if (c.id === 'bank') {
      const B = bankBrand();
      return `<span class="kp-av logo" style="--s:${size}px;background:linear-gradient(150deg,${B.a},${B.c})">${B.logo ? `<img src="${B.logo}" alt="">` : GLYPH.dollar}</span>`;
    }
    if (c.kind === 'hush')
      return `<span class="kp-av hush" style="--s:${size}px">${GLYPH.lock}</span>`;
    return `<span class="kp-av" style="--s:${size}px;--h:${c.hue ?? 210}">${esc(c.initials || '?')}</span>`;
  }
  /** Inset grouped list. rows: { icon: html, tile: color, title, sub, value, valueCls, act, data, chevron, cls, f } */
  function rowsHTML(rows, o = {}) {
    return `<div class="kp-group ${o.cls || ''}">${rows
      .map(
        (r) => `<div class="kp-row ${r.cls || ''}" ${r.act ? `data-act="${r.act}" data-f` : ''} ${
          r.data
            ? Object.entries(r.data)
                .map(([k, v]) => `data-${k}="${esc(v)}"`)
                .join(' ')
            : ''
        }>
      ${r.icon ? `<span class="kp-tile" style="--tile:${r.tile || 'var(--tint)'}">${r.icon}</span>` : ''}${r.avatar || ''}
      <span class="kp-row-t"><b>${r.title}</b>${r.sub ? `<small>${r.sub}</small>` : ''}</span>
      ${r.value != null ? `<span class="kp-row-v ${r.valueCls || ''}">${r.value}</span>` : ''}${r.right || ''}${r.act && r.chevron !== false ? `<span class="kp-chev">${GLYPH.chevron}</span>` : ''}
    </div>`,
      )
      .join('')}</div>`;
  }
  function keypadHTML(o = {}) {
    const keys = [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      o.decimal === false ? '' : '.',
      '0',
      'del',
    ];
    const sub = {
      2: 'ABC',
      3: 'DEF',
      4: 'GHI',
      5: 'JKL',
      6: 'MNO',
      7: 'PQRS',
      8: 'TUV',
      9: 'WXYZ',
    };
    return `<div class="kp-keypad ${o.cls || ''}">${keys.map((k) => (k ? `<button class="kp-key" data-act="key" data-k="${k}" data-f>${k === 'del' ? GLYPH.backspace : `<b>${k}</b>${o.letters && sub[k] ? `<small>${sub[k]}</small>` : ''}`}</button>` : '<span></span>')).join('')}</div>`;
  }
  /** Amount entry model: '1234.5' -> '$1,234.5' with live grouping. */
  function amountText(s) {
    if (!s) return '$0';
    const [i, d] = String(s).split('.');
    return '$' + Number(i || 0).toLocaleString('en-US') + (d !== undefined ? '.' + d : '');
  }

  // ---------------------------------------------------------------- home screen
  const APP_LIST = [
    bankApp,
    messagesApp,
    phoneApp,
    mapsApp,
    cameraApp,
    weatherApp,
    workApp,
    wavvyApp,
    settingsApp,
    switchApp,
  ];
  for (const mk of APP_LIST) {
    try {
      const def = mk(os);
      if (def?.id) APPS[def.id] = def;
    } catch (e) {
      console.error('[phone] app failed to build', e);
    }
  }
  const DOCK = ['phone', 'messages', 'maps', 'bank'];
  const GRID1 = ['camera', 'weather', 'work', 'settings'],
    GRID2 = ['wavvy', 'switch'];
  function iconHTML(id, o = {}) {
    const def = APPS[id];
    if (!def) return '';
    const look = def.icon?.() || APP_ICONS[id] || APP_ICONS.settings;
    const badge = def.badge?.() || 0;
    return `<button class="kp-icon" data-act="__open" data-app="${id}" data-f><span class="kp-ico" style="background:${look.bg}">${look.img ? `<img src="${look.img}" alt="">` : look.svg}${badge ? `<em class="kp-badge">${badge > 99 ? '99+' : badge}</em>` : ''}</span>${o.label === false ? '' : `<span class="kp-ilabel">${esc(def.short || def.name)}</span>`}</button>`;
  }
  function renderHome() {
    const keepFocus = st.focus?.dataset?.app;
    track.innerHTML = `<div class="kp-hpage" data-p="0"><div class="kp-grid">
        ${APPS.weather?.widget ? `<div class="kp-widget w2" data-act="__open" data-app="weather" data-f>${APPS.weather.widget()}</div>` : ''}
        ${APPS.bank?.widget ? `<div class="kp-widget w2" data-act="__open" data-app="bank" data-f>${APPS.bank.widget()}</div>` : ''}
        ${GRID1.map((id) => iconHTML(id)).join('')}
        ${APPS.maps?.widget ? `<div class="kp-widget w4" data-act="__open" data-app="maps" data-f>${APPS.maps.widget()}</div>` : ''}
      </div></div>
      <div class="kp-hpage" data-p="1"><div class="kp-grid">
        ${APPS.work?.widget ? `<div class="kp-widget w4" data-act="__open" data-app="work" data-f>${APPS.work.widget()}</div>` : ''}
        ${GRID2.map((id) => iconHTML(id)).join('')}
      </div></div>`;
    dock.innerHTML = DOCK.map((id) => iconHTML(id, { label: false })).join('');
    dotsEl.innerHTML = [0, 1]
      .map((i) => `<i class="${i === st.page ? 'on' : ''}" data-act="__page" data-p="${i}"></i>`)
      .join('');
    track.style.transform = `translateX(${-st.page * W}px)`;
    for (const w of track.querySelectorAll('canvas[data-draw]')) {
      try {
        APPS[w.dataset.draw]?.drawWidget?.(w);
      } catch (e) {
        /* */
      }
    }
    if (!st.app && keepFocus) {
      const f = screen.querySelector(`.kp-home [data-app="${keepFocus}"]`);
      if (f) setFocus(f, { silent: true });
    }
  }
  function setPage(p, o = {}) {
    p = clamp(p, 0, 1);
    if (p === st.page && !o.force) return;
    st.page = p;
    track.style.transform = `translateX(${-p * W}px)`;
    dotsEl.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === p));
    if (!o.silent) sound('tick', 0.6);
  }
  homeEl._acts = { __page: (el) => setPage(Number(el.dataset.p)) };

  // ---------------------------------------------------------------- apps: open / close with zoom from the icon
  function localRect(el) {
    const s = screen.getBoundingClientRect(),
      r = el.getBoundingClientRect(),
      k = s.width / W || 1;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }
  function openApp(id, opts = {}) {
    const def = APPS[id];
    if (!def) return false;
    if (!st.open) setOpen(true, { silent: true });
    if (st.app?.id === id) {
      if (opts && Object.keys(opts).length) def.deepLink?.(st.app, opts);
      return true;
    }
    if (st.app) closeApp({ instant: true });
    closeSheet(true);
    const el = h(`<div class="kp-app" data-app="${id}"><div class="kp-stack"></div></div>`);
    appsEl.appendChild(el);
    const app = {
      id,
      def,
      el,
      stackEl: el.querySelector('.kp-stack'),
      stack: [],
      ticks: [],
      opts,
      sheet: null,
    };
    st.app = app;
    st.apps.set(id, app);
    screen.classList.add('in-app');
    try {
      def.launch(app, opts);
    } catch (e) {
      console.error('[phone] app launch', id, e);
      toast('This app could not open.');
    }
    // zoom from the icon
    const icon = screen.querySelector(
      `.kp-home [data-app="${id}"] .kp-ico, .kp-home [data-app="${id}"].kp-widget`,
    );
    if (icon && !opts.instant && !reduced() && homeVisible()) {
      const r = localRect(icon),
        sx = r.w / W,
        sy = r.h / H;
      app.from = r;
      el.animate(
        [
          {
            transform: `translate(${r.x}px,${r.y}px) scale(${sx},${sy})`,
            borderRadius: `${16 / sx}px / ${16 / sy}px`,
            opacity: 0.35,
          },
          { opacity: 1, offset: 0.25 },
          { transform: 'translate(0,0) scale(1,1)', borderRadius: '55px', opacity: 1 },
        ],
        { duration: 460, easing: 'cubic-bezier(.2,.92,.24,1)' },
      );
      app.stackEl.animate([{ opacity: 0 }, { opacity: 0, offset: 0.18 }, { opacity: 1 }], {
        duration: 400,
        easing: 'ease-out',
      });
      homeEl.animate(
        [
          { transform: 'scale(1)', filter: 'blur(0px)' },
          { transform: 'scale(.9)', filter: 'blur(6px)' },
        ],
        { duration: 460, easing: 'cubic-bezier(.2,.92,.24,1)', fill: 'forwards' },
      ).onfinish = function () {
        this.cancel();
      };
    } else if (!opts.instant)
      el.animate(
        [
          { transform: 'scale(.92)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 300, easing: 'cubic-bezier(.2,.9,.25,1)' },
      );
    sound('open', 0.5);
    refocus();
    updateStatusColor();
    return true;
  }
  const homeVisible = () => st.open;
  function closeApp(o = {}) {
    const app = st.app;
    if (!app) return;
    try {
      app.def.onClose?.(app);
    } catch (e) {
      console.error(e);
    }
    for (const p of app.stack) {
      try {
        p._spec?.onHide?.(p);
      } catch (e) {
        /* */
      }
    }
    st.app = null;
    st.apps.delete(app.id);
    screen.classList.remove('in-app');
    closeSheet(true);
    const el = app.el;
    renderHome();
    const icon = screen.querySelector(
      `.kp-home [data-app="${app.id}"] .kp-ico, .kp-home [data-app="${app.id}"].kp-widget`,
    );
    if (o.instant || reduced()) el.remove();
    else {
      const r = icon ? localRect(icon) : { x: W / 2 - 30, y: H / 2 - 30, w: 60, h: 60 },
        sx = r.w / W,
        sy = r.h / H;
      el.style.pointerEvents = 'none';
      const a = el.animate(
        [
          { transform: 'translate(0,0) scale(1,1)', borderRadius: '55px', opacity: 1 },
          { opacity: 1, offset: 0.7 },
          {
            transform: `translate(${r.x}px,${r.y}px) scale(${sx},${sy})`,
            borderRadius: `${16 / sx}px / ${16 / sy}px`,
            opacity: 0,
          },
        ],
        { duration: 380, easing: 'cubic-bezier(.3,.8,.25,1)', fill: 'forwards' },
      );
      a.onfinish = () => el.remove();
      homeEl.animate(
        [
          { transform: 'scale(.92)', filter: 'blur(5px)' },
          { transform: 'scale(1)', filter: 'blur(0px)' },
        ],
        { duration: 380, easing: 'cubic-bezier(.3,.8,.25,1)' },
      );
      sound('close', 0.45);
    }
    if (icon) setFocus(icon.closest('[data-f]'), { silent: true });
    else refocus();
    updateStatusColor();
  }

  // ---------------------------------------------------------------- pages
  /** Build a page element. spec: { title, large, back (true | label), right (html), body (html), nav (false = none),
   *  cls, status ('dark' | 'light' text), acts: { name: (el, ev) => }, mount(el), onShow(el), onHide(el), onDigit(n),
   *  onBack(): true when handled, tick(dt) } */
  function page(spec) {
    const back = spec.back === false ? null : spec.back;
    const el =
      h(`<section class="kp-page ${spec.cls || ''}" ${spec.status ? `data-status="${spec.status}"` : ''}>
      ${
        spec.nav === false
          ? ''
          : `<header class="kp-nav ${spec.large ? 'has-large' : ''}">
        ${back ? `<button class="kp-nav-back" data-act="__back" data-f>${GLYPH.back}<span>${esc(typeof back === 'string' ? back : 'Back')}</span></button>` : '<span class="kp-nav-sp"></span>'}
        <div class="kp-nav-title">${spec.titleHTML || esc(spec.title || '')}</div>
        <div class="kp-nav-right">${spec.right || ''}</div></header>`
      }
      <div class="kp-scroll">${spec.large ? `<h1 class="kp-large">${spec.titleHTML || esc(spec.title || '')}</h1>` : ''}${spec.body || ''}</div>
      ${spec.footer || ''}
    </section>`);
    el._spec = spec;
    el._acts = spec.acts || {};
    const sc = el.querySelector('.kp-scroll');
    if (sc)
      sc.addEventListener(
        'scroll',
        () => el.classList.toggle('scrolled', sc.scrollTop > (spec.large ? 34 : 4)),
        { passive: true },
      );
    try {
      spec.mount?.(el);
    } catch (e) {
      console.error('[phone] page mount', e);
    }
    return el;
  }
  function push(spec, o = {}) {
    const app = st.app;
    if (!app) return null;
    const el = spec instanceof HTMLElement ? spec : page(spec);
    const prev = app.stack[app.stack.length - 1];
    app.stack.push(el);
    app.stackEl.appendChild(el);
    if (prev && !o.instant && !reduced()) {
      el.animate(
        [
          { transform: 'translateX(100%)', boxShadow: '0 0 0 rgba(0,0,0,0)' },
          { transform: 'translateX(0)', boxShadow: '-10px 0 30px rgba(0,0,0,.18)' },
        ],
        { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1)' },
      );
      prev.animate(
        [
          { transform: 'translateX(0)', filter: 'brightness(1)' },
          { transform: 'translateX(-28%)', filter: 'brightness(.82)' },
        ],
        { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'forwards' },
      );
      prev.classList.add('under');
    } else if (prev) prev.classList.add('under');
    try {
      el._spec?.onShow?.(el);
    } catch (e) {
      console.error(e);
    }
    if (o.sound !== false && prev) sound('move', 0.4);
    refocus();
    updateStatusColor();
    return el;
  }
  function pop(o = {}) {
    const app = st.app;
    if (!app || app.stack.length < 2) return false;
    const el = app.stack.pop(),
      prev = app.stack[app.stack.length - 1];
    try {
      el._spec?.onHide?.(el);
    } catch (e) {
      /* */
    }
    prev.classList.remove('under');
    prev.getAnimations().forEach((a) => a.cancel());
    if (!o.instant && !reduced()) {
      el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], {
        duration: 320,
        easing: 'cubic-bezier(.3,.8,.25,1)',
        fill: 'forwards',
      }).onfinish = () => el.remove();
      prev.animate(
        [
          { transform: 'translateX(-28%)', filter: 'brightness(.82)' },
          { transform: 'translateX(0)', filter: 'brightness(1)' },
        ],
        { duration: 320, easing: 'cubic-bezier(.3,.8,.25,1)' },
      );
    } else el.remove();
    try {
      prev._spec?.onShow?.(prev, { back: true });
    } catch (e) {
      console.error(e);
    }
    sound('back', 0.35);
    refocus();
    updateStatusColor();
    return true;
  }
  function popToRoot() {
    const app = st.app;
    if (!app) return;
    while (app.stack.length > 1) pop({ instant: app.stack.length > 2 });
  }
  function replaceTop(spec) {
    const app = st.app;
    if (!app) return null;
    const old = app.stack.pop();
    const el = page(spec);
    app.stack.push(el);
    app.stackEl.appendChild(el);
    if (old) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
      setTimeout(() => old.remove(), 220);
    }
    try {
      el._spec?.onShow?.(el);
    } catch (e) {
      console.error(e);
    }
    refocus();
    updateStatusColor();
    return el;
  }

  // ---------------------------------------------------------------- sheets (cards over the current app)
  function sheet(spec) {
    const app = st.app;
    if (!app) return null;
    closeSheet(true);
    const el =
      h(`<div class="kp-sheet-wrap"><div class="kp-sheet-dim" data-act="__closeSheet"></div><div class="kp-sheet ${spec.cls || ''}">
        <div class="kp-grabber"></div>${spec.title ? `<div class="kp-sheet-h"><b>${esc(spec.title)}</b><button class="kp-sheet-x" data-act="__closeSheet" data-f>${GLYPH.close}</button></div>` : ''}
        <div class="kp-sheet-body">${spec.body || ''}</div></div></div>`);
    el._acts = spec.acts || {};
    el._spec = spec;
    app.el.appendChild(el);
    app.sheet = el;
    try {
      spec.mount?.(el);
    } catch (e) {
      console.error(e);
    }
    if (!reduced()) {
      el.querySelector('.kp-sheet').animate(
        [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
        { duration: 420, easing: 'cubic-bezier(.2,.95,.25,1)' },
      );
      el.querySelector('.kp-sheet-dim').animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 300,
      });
    }
    sound('whoosh', 0.3);
    refocus();
    return el;
  }
  function closeSheet(instant) {
    const app = st.app,
      el = app?.sheet;
    if (!el) return false;
    app.sheet = null;
    try {
      el._spec?.onClose?.();
    } catch (e) {
      /* */
    }
    if (instant === true || reduced()) el.remove();
    else {
      el.style.pointerEvents = 'none';
      el.querySelector('.kp-sheet').animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }],
        { duration: 300, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' },
      );
      el
        .querySelector('.kp-sheet-dim')
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish =
        () => el.remove();
    }
    refocus();
    return true;
  }

  // ---------------------------------------------------------------- toasts, banners, flash
  function toast(text, kind = '') {
    const t = h(`<div class="kp-toast ${kind}">${esc(text)}</div>`);
    screen.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, 2200);
  }
  function flash() {
    flashEl.classList.remove('on');
    void flashEl.offsetWidth;
    flashEl.classList.add('on');
  }
  /** iOS-style banner. n: { app, title, body, icon (html), onOpen }. Closed phone: peeks up from the bottom. */
  function notify(n) {
    const def = APPS[n.app],
      look = def?.icon?.() || APP_ICONS[n.app] || APP_ICONS.messages;
    const b =
      h(`<div class="kp-banner glass" data-f><span class="kp-ico sm" style="background:${look.bg}">${look.img ? `<img src="${look.img}" alt="">` : look.svg}</span>
      <span class="kp-bn-t"><b>${esc(n.title || def?.name || '')}</b><span>${esc(n.body || '')}</span></span><small>now</small></div>`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      b.remove();
      if (n.onOpen) n.onOpen();
      else openApp(n.app, n.open || {});
    });
    banners.prepend(b);
    while (banners.children.length > 2) banners.lastElementChild.remove();
    if (!reduced())
      b.animate(
        [
          { transform: 'translateY(-130%) scale(.9)', opacity: 0 },
          { transform: 'translateY(0) scale(1)', opacity: 1 },
        ],
        { duration: 520, easing: 'cubic-bezier(.2,1.25,.35,1)' },
      );
    sound('notify', 0.8);
    setTimeout(() => {
      if (!b.isConnected) return;
      b.animate([{ opacity: 1 }, { transform: 'translateY(-120%)', opacity: 0 }], {
        duration: 320,
        easing: 'ease-in',
        fill: 'forwards',
      }).onfinish = () => b.remove();
    }, n.ms || 4600);
    if (
      !st.open &&
      prefs.peek &&
      !prefs.silent &&
      !game.ui?.paused &&
      !game.ui?.photo &&
      !game.ui?.title &&
      !game.ui?.dead
    )
      peek(n.ms || 4600);
  }
  function peek(ms) {
    st.peekT = performance.now() + ms;
    wrap.classList.add('peek');
    clearTimeout(peek._t);
    peek._t = setTimeout(() => {
      if (performance.now() >= st.peekT - 20) wrap.classList.remove('peek');
    }, ms);
  }

  // ---------------------------------------------------------------- status bar and activity island
  function batteryLevel() {
    const m = ((nowMin() % 1440) + 1440) % 1440;
    const since = (m - 7 * 60 + 1440) % 1440; // charged overnight, full at 7 AM
    return Math.round(clamp(100 - (since / 1440) * 86, 9, 100));
  }
  function signal() {
    const p = game.player?.position;
    if (!p) return 4;
    if (game.player?.state?.vehicle?.isBoat || game.player?.swimming) return 2;
    const cx = Math.floor(p.x / 600),
      cz = Math.floor(p.z / 600),
      hsh = ((cx * 73856093) ^ (cz * 19349663)) >>> 0;
    return 2 + (hsh % 3 === 0 ? 1 : 2);
  }
  let lastIcons = '';
  function paintStatus() {
    const hr = Number(game.time?.hour ?? game.timeOfDay ?? 12);
    const t = clock(hr, { ampm: false });
    if (timeEl.textContent !== t) timeEl.textContent = t;
    const lvl = batteryLevel(),
      sig = signal();
    const key = `${sig}|${lvl}`;
    if (key !== lastIcons) {
      lastIcons = key;
      sIcons.innerHTML = `${signalBars(sig)}<span class="kp-5g">5G</span>${batteryIcon(lvl)}`;
    }
    // activity island: an explicit activity, else the active side job, else the wanted level
    let isl = st.island;
    if (!isl) {
      const job = game.jobs?.active;
      const W = game.wanted?.level || 0;
      if (W > 0)
        isl = {
          l: `<span class="kp-isl-star">${'★'.repeat(Math.min(6, W))}</span>`,
          r: game.wanted?.evading
            ? '<span class="kp-isl-dim">Evading</span>'
            : '<span class="kp-isl-red">Seen</span>',
          cls: 'wanted',
        };
      else if (job?.def)
        isl = {
          l: `<span class="kp-isl-dot"></span>${esc(job.def.name)}`,
          r: '<span class="kp-isl-dim">Job</span>',
          cls: 'job',
        };
    }
    const k = isl ? isl.l + isl.r + (isl.cls || '') : '';
    if (k !== st.lastIsl) {
      st.lastIsl = k;
      island.className = 'kp-island' + (isl ? ' wide ' + (isl.cls || '') : '');
      islL.innerHTML = isl?.l || '';
      islR.innerHTML = isl?.r || '';
    }
  }
  function setIsland(v) {
    st.island = v || null;
    st.lastIsl = null;
    paintStatus();
  }
  function updateStatusColor() {
    const top = st.app?.sheet ? null : st.app?.stack?.[st.app.stack.length - 1];
    const s = !st.app ? 'light' : top?.dataset?.status || (st.theme === 'dark' ? 'light' : 'dark');
    screen.dataset.status = s;
  }

  // ---------------------------------------------------------------- focus (keyboard / controller)
  function activeLayer() {
    if (st.app?.overlay?.isConnected) return st.app.overlay;
    if (st.app?.sheet) return st.app.sheet;
    if (st.app) return st.app.stack[st.app.stack.length - 1] || st.app.el;
    return homeEl;
  }
  const visible = (el) => {
    if (!el.isConnected || el.closest('.under')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  function focusables(layer = activeLayer()) {
    let list = [...layer.querySelectorAll('[data-f]')].filter(
      (e) => !e.disabled && !e.classList.contains('disabled') && visible(e),
    );
    if (layer === homeEl) {
      const pg = track.querySelector(`[data-p="${st.page}"]`);
      list = list.filter((e) => !e.closest('.kp-hpage') || e.closest('.kp-hpage') === pg);
    }
    // persistent app chrome (a tab bar) is reachable from an app's root page
    if (st.app && !st.app.sheet && st.app.stack.length === 1 && layer === st.app.stack[0])
      for (const p of st.app.el.querySelectorAll(':scope > .kp-persist [data-f]'))
        if (visible(p)) list.push(p);
    return list;
  }
  function setFocus(el, o = {}) {
    if (st.focus === el) return;
    st.focus?.classList.remove('kp-focus');
    st.focus = el || null;
    if (!el) return;
    el.classList.add('kp-focus');
    if (st.input === 'key') {
      try {
        el.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: o.instant ? 'auto' : 'smooth',
        });
      } catch (e) {
        /* */
      }
    }
    if (!o.silent && st.input === 'key') sound('move', 0.35);
  }
  function refocus() {
    requestAnimationFrame(() => {
      const L = activeLayer(),
        list = focusables(L);
      if (st.focus && list.includes(st.focus)) return;
      const pref = L.querySelector('[data-autofocus]');
      setFocus(
        pref && list.includes(pref)
          ? pref
          : list.find((e) => !e.classList.contains('kp-nav-back')) || list[0] || null,
        { silent: true, instant: true },
      );
    });
  }
  function moveFocus(dir) {
    const list = focusables();
    if (!list.length) return;
    const cur = list.includes(st.focus) ? st.focus : null;
    if (!cur) {
      setFocus(list[0]);
      return;
    }
    const a = cur.getBoundingClientRect(),
      ax = a.left + a.width / 2,
      ay = a.top + a.height / 2;
    let best = null,
      bs = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const b = e.getBoundingClientRect(),
        bx = b.left + b.width / 2,
        by = b.top + b.height / 2;
      const dx = bx - ax,
        dy = by - ay;
      let main, side;
      if (dir === 'up') {
        if (b.bottom > a.top + 4 && dy > -4) continue;
        main = -dy;
        side = Math.abs(dx);
      } else if (dir === 'down') {
        if (b.top < a.bottom - 4 && dy < 4) continue;
        main = dy;
        side = Math.abs(dx);
      } else if (dir === 'left') {
        if (dx > -4 || Math.abs(dy) > Math.max(a.height, b.height) * 0.75) continue;
        main = -dx;
        side = Math.abs(dy);
      } else {
        if (dx < 4 || Math.abs(dy) > Math.max(a.height, b.height) * 0.75) continue;
        main = dx;
        side = Math.abs(dy);
      }
      const s = main + side * 2.2;
      if (s < bs) {
        bs = s;
        best = e;
      }
    }
    if (best) setFocus(best);
    else if (!st.app && (dir === 'left' || dir === 'right')) {
      setPage(st.page + (dir === 'right' ? 1 : -1));
      refocusHome(dir);
    } else if (dir === 'up') {
      const sc = activeLayer().querySelector('.kp-scroll');
      if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  function refocusHome(dir) {
    requestAnimationFrame(() => {
      const l = focusables(homeEl).filter((e) => e.closest('.kp-hpage'));
      setFocus(dir === 'left' ? l[l.length - 1] : l[0]);
    });
  }

  // ---------------------------------------------------------------- input
  const localHeld = new Set();
  function isHeld() {
    const B = game.bindings;
    if (
      B &&
      (B.held?.('Enter') || B.held?.('NumpadEnter') || B.held?.('Space') || B.padHeld?.('A'))
    )
      return true;
    return localHeld.has('Enter') || localHeld.has('NumpadEnter') || localHeld.has('Space');
  }
  addEventListener('keydown', (e) => localHeld.add(e.code), true);
  addEventListener('keyup', (e) => localHeld.delete(e.code), true);
  addEventListener('blur', () => localHeld.clear());

  function setInput(m) {
    if (st.input === m) return;
    st.input = m;
    screen.dataset.input = m;
  }
  function back() {
    if (!st.open) return;
    if (st.app?.overlay?.isConnected) {
      st.app.overlay._back?.();
      return;
    }
    if (st.app?.sheet) {
      closeSheet();
      sound('back', 0.3);
      return;
    }
    const top = st.app?.stack?.[st.app.stack.length - 1];
    if (top?._spec?.onBack) {
      try {
        if (top._spec.onBack(top)) return;
      } catch (e) {
        console.error(e);
      }
    }
    if (st.app && st.app.stack.length > 1) {
      pop();
      return;
    }
    if (st.app) {
      closeApp();
      return;
    }
    setOpen(false);
  }
  /** Navigation from the HUD / bindings: 'up' | 'down' | 'left' | 'right' | 'accept' | 'back'. */
  function nav(dir, d = {}) {
    if (!st.open) return false;
    setInput('key');
    const raw = d.raw?.code || d.code;
    if (dir === 'back') {
      // Backspace edits a focused keypad page before it navigates back
      const top = st.app?.sheet || st.app?.stack?.[st.app.stack.length - 1];
      if (raw === 'Backspace' && top?._spec?.onDigit) {
        try {
          if (top._spec.onDigit('del') !== false) return true;
        } catch (e) {
          /* */
        }
      }
      back();
      return true;
    }
    if (dir === 'accept') {
      const f = st.focus;
      if (!f || !f.isConnected) {
        refocus();
        return true;
      }
      if (f.matches('input, textarea')) {
        f.focus();
        return true;
      }
      if (f.dataset.hold != null) {
        f._hold?.();
        return true;
      }
      if (f.dataset.act || f.tagName === 'BUTTON') {
        f.classList.add('kp-press');
        setTimeout(() => f.classList.remove('kp-press'), 140);
        f.click();
      }
      return true;
    }
    if (st.focus?._nav && st.focus.isConnected) {
      try {
        if (st.focus._nav(dir)) return true;
      } catch (e) {
        /* */
      }
    }
    moveFocus(dir);
    return true;
  }
  function digit(n) {
    if (!st.open) return false;
    const top = st.app?.sheet || st.app?.stack?.[st.app.stack.length - 1];
    if (top?._spec?.onDigit) {
      try {
        top._spec.onDigit(String(n));
      } catch (e) {
        console.error(e);
      }
      return true;
    }
    return false;
  }

  // clicks (delegated)
  screen.addEventListener('pointerdown', () => setInput('mouse'), true);
  screen.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a || !screen.contains(a) || a.disabled || a.classList.contains('disabled')) return;
    const act = a.dataset.act;
    if (act === '__back') {
      back();
      return;
    }
    if (act === '__home') {
      if (st.app) closeApp();
      return;
    }
    if (act === '__closeSheet') {
      closeSheet();
      return;
    }
    if (act === '__open') {
      if (homeDrag.moved) return;
      openApp(a.dataset.app);
      return;
    }
    let holder = a.closest('.kp-sheet-wrap, .kp-page, .kp-home');
    while (holder && !holder._acts?.[act])
      holder = holder.parentElement?.closest('.kp-sheet-wrap, .kp-page, .kp-home');
    const fn = holder?._acts?.[act];
    if (fn) {
      if (a.hasAttribute('data-f')) setFocus(a, { silent: true });
      try {
        fn(a, e);
      } catch (err) {
        console.error('[phone] action', act, err);
      }
    }
  });
  // swipe up on the home bar closes the app; drag sideways on the home screen pages; drag from the left edge goes back
  const homeDrag = { on: false, moved: false };
  screen.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = localRect(screen),
      s = screen.getBoundingClientRect(),
      k = s.width / W;
    const x = (e.clientX - s.left) / k,
      y = (e.clientY - s.top) / k;
    const g = { x0: e.clientX, y0: e.clientY, k, kind: null, id: e.pointerId };
    if (st.app && y > H - 34) g.kind = 'home';
    else if (st.app && x < 22 && st.app.stack.length > 1 && !st.app.sheet) g.kind = 'edge';
    else if (!st.app && e.target.closest('.kp-hpages')) g.kind = 'pages';
    if (!g.kind) return;
    homeDrag.on = true;
    homeDrag.moved = false;
    const mv = (ev) => {
      const dx = (ev.clientX - g.x0) / g.k,
        dy = (ev.clientY - g.y0) / g.k;
      if (Math.abs(dx) + Math.abs(dy) > 6) homeDrag.moved = true;
      if (g.kind === 'pages')
        ((track.style.transform = `translateX(${-st.page * W + dx}px)`),
          (track.style.transition = 'none'));
      if (g.kind === 'home' && st.app)
        st.app.el.style.transform = `translateY(${Math.min(0, dy) * 0.6}px) scale(${1 + Math.min(0, dy) / 1400})`;
      if (g.kind === 'edge' && st.app) {
        const top = st.app.stack[st.app.stack.length - 1];
        top.style.transform = `translateX(${Math.max(0, dx)}px)`;
      }
    };
    const up = (ev) => {
      removeEventListener('pointermove', mv);
      removeEventListener('pointerup', up);
      const dx = (ev.clientX - g.x0) / g.k,
        dy = (ev.clientY - g.y0) / g.k;
      if (g.kind === 'pages') {
        track.style.transition = '';
        if (Math.abs(dx) > 60) setPage(st.page + (dx < 0 ? 1 : -1));
        else setPage(st.page, { force: true, silent: true });
      }
      if (g.kind === 'home' && st.app) {
        st.app.el.style.transform = '';
        if (dy < -60 || !homeDrag.moved) closeApp();
      }
      if (g.kind === 'edge' && st.app) {
        const top = st.app.stack[st.app.stack.length - 1];
        top.style.transform = '';
        if (dx > 90) pop();
      }
      setTimeout(() => {
        homeDrag.on = false;
        homeDrag.moved = false;
      }, 0);
    };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', up);
  });
  // wheel while the pointer is locked (no cursor): scroll the active page
  addEventListener(
    'wheel',
    (e) => {
      if (!st.open || !document.pointerLockElement) return;
      const sc = activeLayer().querySelector('.kp-scroll');
      if (sc) sc.scrollBy({ top: e.deltaY, behavior: 'smooth' });
    },
    { passive: true },
  );

  // ---------------------------------------------------------------- open / close
  function setOpen(o, opt = {}) {
    o = !!o;
    if (st.open === o) return;
    st.open = o;
    wrap.classList.toggle('on', o);
    wrap.classList.remove('peek');
    wrap.setAttribute('aria-hidden', o ? 'false' : 'true');
    if (o) {
      applyTheme();
      paintWallpaper();
      paintStatus();
      renderHome();
      if (!opt.silent) sound('open', 0.55);
      if (!st.app) {
        setPage(0, { silent: true, force: true });
      }
      refocus();
      startLoop();
    } else {
      if (st.app) closeApp({ instant: true });
      if (!opt.silent) sound('close', 0.45);
      document.activeElement?.blur?.();
    }
    try {
      hooks.onOpenChange?.(o);
    } catch (e) {
      console.error(e);
    }
  }

  // ---------------------------------------------------------------- loop (only while open or peeking)
  const ticks = new Set();
  function onTick(fn) {
    ticks.add(fn);
    return () => ticks.delete(fn);
  }
  let raf = 0,
    last = 0,
    slow = 0;
  function startLoop() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }
  function loop(t) {
    raf = 0;
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    slow += dt;
    if (slow > 0.5) {
      slow = 0;
      paintStatus();
      applyTheme();
    }
    for (const f of ticks) {
      try {
        f(dt);
      } catch (e) {
        console.error('[phone] tick', e);
        ticks.delete(f);
      }
    }
    const top = st.app?.stack?.[st.app.stack.length - 1];
    if (top?._spec?.tick) {
      try {
        top._spec.tick(dt, top);
      } catch (e) {
        console.error('[phone] page tick', e);
      }
    }
    if (st.open || wrap.classList.contains('peek')) raf = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- game events -> messages and banners
  const on = (n, f) => {
    try {
      game.on?.(n, (d) => {
        try {
          f(d || {});
        } catch (e) {
          console.error('[phone] event ' + n, e);
        }
      });
    } catch (e) {
      /* */
    }
  };
  data.on((ev) => {
    if (ev.kind !== 'message') return;
    if (ev.message.from !== 'me' && !ev.message.silent) {
      const c = data.contact(ev.id);
      const inThread =
        st.app?.id === 'messages' &&
        st.app.stack[st.app.stack.length - 1]?.dataset.thread === ev.id;
      if (!inThread)
        notify({
          app: 'messages',
          title: c?.name || 'Message',
          body: ev.message.text,
          open: { thread: ev.id },
        });
    }
    for (const a of st.apps.values()) {
      try {
        a.def.onData?.(a, ev);
      } catch (e) {
        console.error('[phone] onData', e);
      }
    }
    if (!st.app && st.open) renderHomeSoon();
  });
  on('fineIssued', (d) => {
    const f = d.fine;
    if (f)
      data.addMessage(
        'city',
        `${f.label} citation ${fmt$(f.amount, false)}${f.place ? ' at ' + f.place : ''}. Pay it in your bank app within ${f.dueInDays ?? 3} days to avoid a late fee.`,
        { kind: 'fine', data: { fineId: f.id } },
      );
  });
  on('jobStart', (d) => {
    const j = (game.jobs?.list || []).find((x) => x.id === d.id);
    if (j?.client && !/worried/i.test(j.client))
      data.addMessage('job:' + j.id, j.blurb || `Job's yours: ${j.name}.`);
  });
  on('wage', (d) => {
    if (d.method === 'deposit' && d.gross > 0)
      data.addMessage('bank', `Direct deposit ${fmt$(d.gross)} received.`, { kind: 'alert' });
  });
  on('money', (d) => {
    const e = d.entry;
    if (!e) return;
    if (e.account === 'checking' && e.balance < 50 && e.amount < 0 && !e._phoneLow) {
      e._phoneLow = true;
      data.addMessage('bank', `Low balance: Everyday Checking is at ${fmt$(e.balance)}.`, {
        kind: 'alert',
      });
    }
    if (e.account === 'checking' && e.category === 'business' && e.amount > 0)
      data.addMessage('bank', `Deposit ${fmt$(e.amount)} from ${e.party || 'your business'}.`, {
        kind: 'alert',
      });
    for (const a of st.apps.values()) a.def.onMoney?.(a, d);
    if (!st.app && st.open) renderHomeSoon();
  });
  on('cardFrozen', (d) =>
    data.addMessage(
      'bank',
      d.frozen
        ? 'Your debit card is frozen. Card payments will be declined.'
        : 'Your debit card is active again.',
      { kind: 'alert' },
    ),
  );
  on('newDay', () => data.snapshot());
  on('atm', (d) => {
    st.atmEvent = {
      t: performance.now(),
      x: game.player?.position?.x,
      z: game.player?.position?.z,
      place: d?.store?.name || d?.store?.brand?.name || null,
    };
    openApp('bank', { atm: true });
  });
  let homeSoon = 0;
  function renderHomeSoon() {
    clearTimeout(homeSoon);
    homeSoon = setTimeout(() => {
      if (!st.app && st.open) renderHome();
    }, 120);
  }

  /** ATM within reach: street ATM props, an interior ATM just used, or a bank branch door. */
  os.atmNearby = () => {
    const p = game.player?.position;
    if (!p) return null;
    try {
      for (const pr of game.gameplay?.G?.props?.props || [])
        if (pr.type === 'atm' && pr.pos && Math.hypot(pr.pos.x - p.x, pr.pos.z - p.z) < 4.5)
          return { kind: 'street', place: game.city?.streetNameAt?.(p.x, p.z) || 'Street ATM' };
    } catch (e) {
      /* */
    }
    const a = st.atmEvent;
    if (
      a &&
      performance.now() - a.t < 90000 &&
      Math.hypot((a.x ?? 1e9) - p.x, (a.z ?? 1e9) - p.z) < 8
    )
      return { kind: 'store', place: a.place || 'Store ATM' };
    try {
      const n = game.nav?.places?.nearest?.('atm', { x: p.x, z: p.z }, { limit: 1 })?.[0];
      if (n && Math.hypot(n.x - p.x, n.z - p.z) < 16) return { kind: 'branch', place: n.name };
    } catch (e) {
      /* */
    }
    return null;
  };
  os.nearestAtm = () => {
    const p = game.player?.position;
    if (!p) return null;
    let best = null;
    try {
      for (const pr of game.gameplay?.G?.props?.props || [])
        if (pr.type === 'atm' && pr.pos) {
          const d = Math.hypot(pr.pos.x - p.x, pr.pos.z - p.z);
          if (!best || d < best.d) best = { x: pr.pos.x, z: pr.pos.z, d, name: 'Street ATM' };
        }
    } catch (e) {
      /* */
    }
    try {
      const n = game.nav?.places?.nearest?.('atm', { x: p.x, z: p.z }, { limit: 1 })?.[0];
      if (n) {
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (!best || d < best.d) best = { x: n.x, z: n.z, d, name: n.name };
      }
    } catch (e) {
      /* */
    }
    return best;
  };
  os.setWaypoint = (x, z, label) => {
    game.waypoint = { x, z };
    try {
      game.nav?.setDestination?.({ x, z }, { label });
    } catch (e) {
      /* hud plans its own route */
    }
    toast(label ? `Route to ${label}` : 'Waypoint set');
  };
  os.distText = (m) => {
    const mi = m / 1609.34;
    return mi < 0.1
      ? `${Math.round((m * 3.28084) / 10) * 10} ft`
      : `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
  };

  // first boot without a save system: seed the threads
  setTimeout(() => {
    if (!data.S.seeded) data.seed();
  }, 1500);
  applyTheme();
  paintWallpaper();
  paintStatus();
  renderHome();

  const api = {
    get open() {
      return st.open;
    },
    get appId() {
      return st.app?.id || null;
    },
    setOpen,
    toggle: () => setOpen(!st.open),
    nav,
    digit,
    back,
    openApp,
    closeApp,
    notify,
    os,
    data,
    wire,
    el: wrap,
    /** HUD frame hook: cheap, runs every frame; the phone's own loop handles animation while it is up. */
    update() {
      if (!st.open && wrap.classList.contains('peek')) startLoop();
    },
    setInputMode: setInput,
    get prefs() {
      return prefs;
    },
    get focus() {
      return st.focus;
    },
  };
  game.phone = api;
  return api;
}

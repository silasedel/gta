// SOUTHLINE quick title (r2-web): the title screen and main menu are up within about a second of opening the page,
// while the engine and the world load behind them. It is the real title's look (same .pm markup and menu.css), drawn
// before the engine exists; when the game is ready it hands over to the real front end (frontend.v2.js, fe.quick) in
// the same state: still on "Press any key", on the menu with the same item focused, or already loading into the game.
// Choosing New Game / Continue before the world is ready shows the loading screen with the real boot progress, so the
// player never waits on the title for the engine.
//   ?quick=0 turns it off, ?quick=1 on (QUICK_DEFAULT below) (old flow: loading bar, then the title). Off whenever the real title is off (automation
//   without ?menu=1, ?nomenu, ?menu=0).
import './menu.css';
import '../styles/fonts.css';
import '../styles/tokens.css';
import { logoSVG } from '../core/logo.js';
import { BRAND } from '../brand.js';
import { VERSION } from '../../version.js';
import { createLoadScreen } from './loadScreen.js';

const CSS = `
.wl-early { z-index: 1002 !important; pointer-events: auto !important; transition: opacity .6s ease; }
.wl-early.out { opacity: 0; pointer-events: none !important; }
.wl-early .pm { pointer-events: auto; }
.wl-early .pm-menu { pointer-events: auto; }
.wl-early .pm-item { cursor: pointer; }
.wl-early .wl-wait { position: absolute; left: 0; right: 0; bottom: calc(21vh - 4.2 * var(--fs-md)); text-align: center; font: 700 var(--fs-cap)/1 var(--ps-cond); letter-spacing: .32em; text-transform: uppercase; color: var(--ps-faint); opacity: 0; transition: opacity .6s; }
.wl-early .pm.menu-on .wl-wait { left: calc(var(--safe-x) + 3.2vw + 14 * var(--u)); right: auto; bottom: auto; top: calc(41vh - 3.2 * var(--fs-md)); text-align: left; }
.wl-early .wl-wait.show { opacity: 1; }
.wl-early .pm-item.wl-busy .pm-lab::after { content: ' …'; }
`;

const QUICK_DEFAULT = false; // flipped on once booted with it (r2-web); ?quick=1 forces it on, ?quick=0 off
export function quickTitleEnabled() {
  try {
    const p = new URLSearchParams(location.search);
    if (p.get('quick') === '0' || (!QUICK_DEFAULT && p.get('quick') !== '1')) return false;
    const forced = p.get('menu');
    return forced === '1' || (forced !== '0' && !p.has('nomenu') && !navigator.webdriver);
  } catch (e) { return false; }
}

// Continue is offered when a save exists (same keys the save system writes: save.<slot>.manual|auto)
async function hasSave() {
  try {
    if (new URLSearchParams(location.search).has('newgame')) return false;
    if (typeof indexedDB !== 'undefined') {
      const keys = await new Promise((res) => {
        const rq = indexedDB.open('port-solana-v2', 1);
        rq.onupgradeneeded = () => { try { rq.result.createObjectStore('kv'); } catch (e) { /* */ } };
        rq.onerror = () => res([]);
        rq.onsuccess = () => {
          const db = rq.result;
          try { const t = db.transaction('kv', 'readonly').objectStore('kv').getAllKeys(); t.onsuccess = () => { res(t.result || []); db.close(); }; t.onerror = () => { res([]); db.close(); }; } catch (e) { res([]); db.close(); }
        };
      });
      if (keys.some((k) => /^save\.[^.]+\.(manual|auto)(\.bak)?$/.test(k))) return true;
    }
    for (let i = 0; i < localStorage.length; i++) if (/^ps2:save\.[^.]+\.(manual|auto)/.test(localStorage.key(i) || '')) return true;
  } catch (e) { /* */ }
  return false;
}

export function installQuickTitle() {
  if (document.querySelector('.wl-early')) return null;
  if (!document.getElementById('wl-css')) { const st = document.createElement('style'); st.id = 'wl-css'; st.textContent = CSS; document.head.appendChild(st); }
  const art = new URL('assets/ui/keyart_loading.webp', document.baseURI).href;
  const wrap = document.createElement('div');
  wrap.className = 'ps-ui wl-early';
  wrap.innerHTML = `<div class="pm wl-title">
      <div class="pm-titleart"><div class="pm-titlerays"></div></div>
      <div class="pm-grad"></div>
      <div class="pm-brand"><div class="pm-logo">${logoSVG()}</div><div class="pm-tagline"><i></i><span>${BRAND.tagline}</span></div></div>
      <nav class="pm-menu" hidden></nav>
      <div class="pm-press"><span>Press any key</span></div>
      <div class="wl-wait"></div>
      <div class="pm-place show"><b class="pm-place-name">Biscayne Bay</b><span class="pm-place-sub">Southline</span></div>
      <div class="pm-foot"><span class="pm-ver">v${VERSION} · ${BRAND.coords}</span><div class="pm-hints ps-hints"><span>Enter Start</span></div></div>
    </div>`;
  document.body.appendChild(wrap);
  const root = wrap.querySelector('.pm'), $ = (s) => root.querySelector(s);
  const menu = $('.pm-menu'), press = $('.pm-press'), wait = $('.wl-wait'), hints = $('.pm-hints');
  const L = document.getElementById('loading');
  // the key art is painted before anything else: preloaded by index.html, so this is usually instant
  const img = new Image();
  img.onload = img.onerror = () => { $('.pm-titleart').style.backgroundImage = `url('${art}')`; requestAnimationFrame(() => { root.classList.add('in', 'ready'); if (L) L.style.visibility = 'hidden'; }); };
  img.src = art;

  const st = { screen: 'attract', items: [], focus: 0, chosen: null, load: null, done: false };
  window.__quickTitle = st;
  const pct = () => parseFloat(document.getElementById('loadpct')?.textContent || '0') || 0;
  const msg = () => document.getElementById('loadmsg')?.textContent || '';

  function render() {
    menu.innerHTML = st.items.map((it, i) => `<button class="pm-item${i === st.focus ? ' is-focus' : ''}" data-i="${i}" style="--i:${i}">
      <span class="pm-idx">${String(i + 1).padStart(2, '0')}</span><span class="pm-lab">${it.label}</span><span class="pm-desc">${it.sub}</span></button>`).join('');
  }
  function setFocus(i) { st.focus = (i + st.items.length) % st.items.length; menu.querySelectorAll('.pm-item').forEach((b, k) => b.classList.toggle('is-focus', k === st.focus)); }
  async function openMenu() {
    if (st.screen !== 'attract') return;
    st.screen = 'menu';
    press.classList.add('out');
    const save = await hasSave();
    st.items = [
      save && { id: 'continue', label: 'Continue', sub: 'Pick up where you left off' },
      { id: 'new', label: 'New Game', sub: save ? 'Start over in a fresh slot. Your other saves stay.' : 'Wake up in the Keys' },
      { id: 'online', label: 'Online', sub: 'Join a friend’s session' },
      { id: 'wardrobe', label: 'Wardrobe', sub: 'Dress Nico' },
      { id: 'settings', label: 'Settings', sub: 'Graphics, audio, controls, display' },
      { id: 'credits', label: 'Credits', sub: 'Who made this, and what with' },
    ].filter(Boolean);
    st.focus = 0; render();
    menu.hidden = false; root.classList.add('menu-on');
    hints.innerHTML = '';
  }
  function choose(i) {
    const it = st.items[i]; if (!it || st.chosen) return;
    st.chosen = it.id;
    if (it.id === 'new' || it.id === 'continue') {
      // into the game: the loading screen right away, fed with the real boot progress
      root.classList.add('leaving');
      st.load = createLoadScreen({ mount: wrap });
      st.load.el.style.position = 'absolute';
      st.load.set(Math.min(60, pct() * 0.6), it.id === 'continue' ? 'Loading your save' : 'Starting a new game');
    } else {
      // the other screens need the engine: mark the item, it opens the moment the game is ready
      menu.querySelectorAll('.pm-item')[i]?.classList.add('wl-busy');
    }
  }
  // input: everything stops here while the quick title is up (the engine's own bindings must not act on it)
  const onKey = (e) => {
    if (st.done) return;
    e.stopImmediatePropagation();
    if (e.type !== 'keydown' || e.repeat) return;
    if (/^F\d+$/.test(e.code)) return;
    e.preventDefault();
    if (st.screen === 'attract') { openMenu(); return; }
    if (st.chosen) return;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') setFocus(st.focus + 1);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') setFocus(st.focus - 1);
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') choose(st.focus);
  };
  addEventListener('keydown', onKey, true); addEventListener('keyup', onKey, true);
  wrap.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (st.screen === 'attract') openMenu(); });
  menu.addEventListener('pointermove', (e) => { const b = e.target.closest('.pm-item'); if (b && !st.chosen) setFocus(+b.dataset.i); });
  menu.addEventListener('click', (e) => { const b = e.target.closest('.pm-item'); if (b) choose(+b.dataset.i); });

  // progress + hand-over
  const tick = setInterval(() => {
    const m = msg();
    if (/^ERROR/.test(m)) { finish(true); return; } // the boot failed: show its error screen
    const p = pct();
    if (st.load) st.load.set(Math.min(60, p * 0.6), p < 100 ? (m ? (m === m.toUpperCase() ? m.charAt(0) + m.slice(1).toLowerCase() : m) : 'Loading') : 'Starting');
    else { wait.textContent = p < 100 ? `Loading the world  ${Math.floor(p)}%` : ''; wait.classList.toggle('show', st.screen !== 'attract' || p > 3); }
    const g = window.game, q = g?.frontEnd?.quick;
    if (g?.ready && (q || !g.frontEnd?.active)) handOver(g, q);
  }, 120);

  let handing = false;
  async function handOver(g, q) {
    if (handing) return; handing = true;
    try {
      if (q) {
        if (st.chosen && (st.chosen === 'new' || st.chosen === 'continue')) { q.choose(st.chosen, { from: 60 }); await new Promise((r) => setTimeout(r, 900)); }
        else if (st.screen === 'menu') { await q.openMenu(); q.focus(st.items[st.focus]?.id); if (st.chosen) q.choose(st.chosen); }
      }
    } catch (e) { console.warn('[quickTitle] hand-over', e); }
    finish(false);
  }
  function finish(error) {
    if (st.done) return;
    st.done = true; clearInterval(tick);
    removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKey, true);
    if (L) L.style.visibility = '';
    if (error) { wrap.remove(); return; }
    wrap.classList.add('out'); wrap.style.transition = 'opacity .4s ease'; wrap.style.opacity = '0'; wrap.style.pointerEvents = 'none';
    setTimeout(() => { try { st.load?.close(); } catch (e) { /* */ } wrap.style.display = 'none'; wrap.remove(); }, 450);
  }
  return st;
}

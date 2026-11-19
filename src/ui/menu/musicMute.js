// SOUTHLINE: a small mute button (top right) for the menu / loading-screen music (user, Nov 19). Shown only while that
// loop plays (boot loading screen, title, menus, the load into the game); not muted by default; the choice is remembered
// (src/audio/loadingMusic.js keeps it in localStorage). Mounted once by splash.js and frontend.v2.js.
import * as loadingMusic from '../../audio/loadingMusic.js';

const CSS = `
.sl-mute { position: fixed; top: max(14px, 1.8vh); right: max(14px, 1.2vw); z-index: 2147482500; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%;
  display: grid; place-items: center; cursor: pointer; color: #fff4e3; background: rgba(22, 6, 34, .55); backdrop-filter: blur(6px);
  box-shadow: inset 0 0 0 1px rgba(255, 244, 227, .18); opacity: 0; pointer-events: none; transition: opacity .3s ease, background .15s ease, box-shadow .15s ease; }
.sl-mute.show { opacity: .78; pointer-events: auto; }
.sl-mute.show:hover, .sl-mute.show:focus-visible { opacity: 1; background: rgba(255, 46, 138, .5); box-shadow: inset 0 0 0 1px rgba(255, 179, 212, .7), 0 0 14px rgba(255, 46, 138, .45); outline: none; }
.sl-mute svg { width: 18px; height: 18px; display: block; }
.sl-mute .w { transition: opacity .15s; } .sl-mute .x { opacity: 0; }
.sl-mute.muted .w { opacity: 0; } .sl-mute.muted .x { opacity: 1; }
`;
const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke-width="1.6"/>
  <path class="w" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>
  <path class="x" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`;

let btn = null;
export function mountMusicMute() {
  if (btn || typeof document === 'undefined' || !document.body) return btn;
  const st = document.createElement('style'); st.id = 'sl-mute-css'; st.textContent = CSS; document.head.appendChild(st);
  btn = document.createElement('button');
  btn.className = 'sl-mute'; btn.type = 'button'; btn.tabIndex = -1; btn.innerHTML = ICON;
  const paint = () => {
    const m = loadingMusic.isMuted();
    btn.classList.toggle('muted', m);
    btn.title = m ? 'Unmute music' : 'Mute music'; btn.setAttribute('aria-label', btn.title);
  };
  // the click must not reach the menus / the title underneath
  for (const ev of ['pointerdown', 'mousedown']) btn.addEventListener(ev, (e) => e.stopPropagation());
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); loadingMusic.setMuted(!loadingMusic.isMuted()); paint(); btn.blur(); });
  document.body.appendChild(btn);
  paint();
  // visible only while the menu / loading loop is playing (it stops when gameplay starts)
  setInterval(() => { const on = loadingMusic.playing(); if (on !== btn.classList.contains('show')) btn.classList.toggle('show', on); }, 300);
  return btn;
}

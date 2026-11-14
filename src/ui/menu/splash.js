// PORT SOLANA: the boot screen (main-menu track). Imported first by main.js: while the engine loads, it shows the
// graded key-art stills (public/assets/ui/keyart_*.webp, rendered from the game itself) with the logo lockup and the
// loading bar. main.js keeps writing #loadmsg / #loadbar / #loadpct; when it removes #loading, the live title is under it.
import '../styles/fonts.css';
import { logoSVG } from '../core/logo.js';
import { BRAND } from '../brand.js';

const ARTS = ['keyart_keys', 'keyart_bay', 'keyart_ocean'];
const CSS = `
#loading.pm-boot { background: #05080e !important; font-family: 'Archivo Black', 'Arial Narrow', sans-serif; letter-spacing: 0; display: block; }
#loading.pm-boot .pmb-art { position: absolute; inset: -3%; background: center / cover no-repeat; opacity: 0; transition: opacity 2.2s ease; animation: pmb-kb 24s linear infinite alternate; }
#loading.pm-boot .pmb-art.on { opacity: 1; }
@keyframes pmb-kb { from { transform: scale(1.02); } to { transform: scale(1.1) translateX(-1.2%); } }
#loading.pm-boot .pmb-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(5,8,14,.75), rgba(5,8,14,.25) 45%, rgba(5,8,14,0) 70%), linear-gradient(0deg, rgba(5,8,14,.85), transparent 35%); }
#loading.pm-boot .pmb-bars::before, #loading.pm-boot .pmb-bars::after { content: ''; position: absolute; left: 0; right: 0; height: max(0px, calc((100vh - 100vw / 2.39) / 2)); background: #000; }
#loading.pm-boot .pmb-bars::before { top: 0; } #loading.pm-boot .pmb-bars::after { bottom: 0; }
#loading.pm-boot .pmb-logo { position: absolute; left: 6vw; top: 18vh; width: min(38vw, 640px); color: #f3ede2; filter: drop-shadow(0 6px 18px rgba(0,0,0,.55)); animation: pmb-in 1.4s cubic-bezier(.2,.9,.25,1) both; }
#loading.pm-boot .pmb-logo svg { width: 100%; height: auto; display: block; margin: 0 !important; animation: none !important; }
@keyframes pmb-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
#loading.pm-boot h1 { display: none; }
#loading.pm-boot #loadmsg { position: absolute; left: 6vw; bottom: calc(max(0px, (100vh - 100vw / 2.39) / 2) + 7vh); margin: 0; font: 700 13px/1 'Archivo Black', sans-serif; letter-spacing: .32em; color: #9aa6ba; opacity: 1; }
#loading.pm-boot .bar { position: absolute; left: 6vw; right: 6vw; bottom: calc(max(0px, (100vh - 100vw / 2.39) / 2) + 4.6vh); width: auto; height: 2px; background: rgba(243,237,226,.14); border-radius: 0; }
#loading.pm-boot .bar i { background: linear-gradient(90deg, #ff6a4d, #ff5c9d); box-shadow: 0 0 12px #ff6a4d; }
#loading.pm-boot .pct { position: absolute; right: 6vw; bottom: calc(max(0px, (100vh - 100vw / 2.39) / 2) + 7vh); margin: 0; font: 700 13px/1 'Archivo Black', sans-serif; letter-spacing: .24em; color: #f3ede2; }
#loading.pm-boot .pmb-tag { position: absolute; left: 6vw; top: calc(18vh + min(38vw, 640px) * .36); font: 700 14px/1 'Archivo Black', sans-serif; letter-spacing: .46em; color: #cfd6e2; display: flex; gap: 14px; align-items: center; }
#loading.pm-boot .pmb-tag i { width: 34px; height: 2px; background: #ff6a4d; box-shadow: 0 0 10px #ff6a4d; }
`;
function install() {
  const L = document.getElementById('loading'); if (!L || L.classList.contains('pm-boot')) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  L.classList.add('pm-boot');
  const first = Math.floor(Math.random() * ARTS.length);
  const arts = ARTS.map((n, i) => { const d = document.createElement('div'); d.className = 'pmb-art'; d.dataset.i = i; return d; });
  // only show stills that exist (the build ships them; a missing one just stays dark)
  arts.forEach((d, i) => { const img = new Image(); img.onload = () => { d.style.backgroundImage = `url('${img.src}')`; if (i === first) d.classList.add('on'); }; img.src = `/assets/ui/${ARTS[i]}.webp`; });
  const shade = document.createElement('div'); shade.className = 'pmb-shade';
  const bars = document.createElement('div'); bars.className = 'pmb-bars';
  const logo = document.createElement('div'); logo.className = 'pmb-logo'; logo.innerHTML = logoSVG({ caption: false });
  const tag = document.createElement('div'); tag.className = 'pmb-tag'; tag.innerHTML = `<i></i>${BRAND.tagline}`;
  L.prepend(...arts, shade, bars, logo, tag);
  let k = first;
  const t = setInterval(() => { if (!L.isConnected) { clearInterval(t); return; } arts[k].classList.remove('on'); k = (k + 1) % arts.length; if (arts[k].style.backgroundImage) arts[k].classList.add('on'); }, 7000);
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install(); }

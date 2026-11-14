// SOUTHLINE: the loading screen (main-menu track), shared by the boot load (splash.js) and the load into the game
// (frontend.v2.js). Full-screen stylized key art (public/assets/ui/keyart_loading.webp, baked from an in-engine render)
// with a slow Ken Burns move and light rays, the logo top-left, LOADING… with a thick hot-pink bar bottom-left and a
// rotating tip bottom-right. Sizes use clamp() so it holds from 1280x800 laptops to 4K.
import '../styles/fonts.css';
import '../styles/tokens.css';
import { logoSVG } from '../core/logo.js';

export const TIPS = [
  'Explore the city, take on jobs, and build your reputation across Southline.',
  'The police remember what they saw: your outfit, your face and your car. Change one and they lose the trail.',
  'Cash on you can be lost. Put it in the bank before you go looking for trouble.',
  'Businesses earn while you are away. Collect the safe before someone else does.',
  'Hold a corner long enough and it is yours: turf pays out every day.',
  'Your phone has the map, jobs, your bank and the camera.',
  'Night changes the city: clubs open, streets empty, and the neon comes up.',
  'Nico keeps his clothes at home. The wardrobe is also in the pause menu.',
  'Change radio stations with , and . while you drive.',
  'Golden hour in the Keys lasts longer than you think. Stop and look around.',
];
const CSS = `
.sl-load { position: fixed; inset: 0; z-index: 1001; overflow: hidden; background: #12061c; color: #fff4e3; font-family: var(--ps-cond); letter-spacing: 0; text-transform: none; opacity: 0; transition: opacity .7s ease; pointer-events: auto; }
.sl-load.in { opacity: 1; } .sl-load.out { opacity: 0; transition-duration: .9s; }
.sl-art { position: absolute; inset: -5%; background: #2a0f3a center / cover no-repeat; animation: sl-kb 34s ease-in-out infinite alternate; }
@keyframes sl-kb { from { transform: scale(1.03) translate(0, 0); } to { transform: scale(1.12) translate(-1.6%, -1%); } }
.sl-rays { position: absolute; inset: -30%; pointer-events: none; mix-blend-mode: screen; opacity: .32;
  background: repeating-conic-gradient(from 0deg at 62% 38%, rgba(255, 214, 140, .55) 0deg 3deg, transparent 3deg 11deg, rgba(255, 140, 190, .35) 11deg 13deg, transparent 13deg 22deg);
  -webkit-mask: radial-gradient(circle at 62% 38%, #000 0%, rgba(0,0,0,.5) 22%, transparent 48%); mask: radial-gradient(circle at 62% 38%, #000 0%, rgba(0,0,0,.5) 22%, transparent 48%); animation: sl-rays 60s linear infinite; }
@keyframes sl-rays { to { transform: rotate(18deg); } }
.sl-shade { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(18, 6, 28, .88) 0%, rgba(18, 6, 28, .25) 30%, transparent 55%), linear-gradient(180deg, rgba(18, 6, 28, .45), transparent 28%); }
.sl-logo { position: absolute; left: clamp(20px, 4vw, 80px); top: clamp(16px, 3.4vh, 56px); width: clamp(300px, 33.6vw, 700px); filter: drop-shadow(0 6px 22px rgba(20, 0, 30, .6)); }
.sl-logo svg { display: block; width: 100%; height: auto; margin: 0 !important; animation: none !important; }
.sl-left { position: absolute; left: clamp(20px, 4vw, 80px); bottom: clamp(22px, 5.2vh, 72px); width: min(46vw, 760px); }
.sl-word { font: 400 clamp(26px, 3.2vw, 56px)/1 var(--ps-cond); letter-spacing: .02em; transform: skewX(-11deg); transform-origin: 0 100%; color: #fff4e3; text-shadow: 3px 4px 0 #3b0f46, 0 0 24px rgba(255, 46, 138, .55); }
.sl-word i { font-style: normal; display: inline-block; animation: sl-dot 1.4s infinite; } .sl-word i:nth-child(2) { animation-delay: .2s; } .sl-word i:nth-child(3) { animation-delay: .4s; }
@keyframes sl-dot { 0%, 60%, 100% { opacity: 1; } 30% { opacity: .2; } }
.sl-bar { position: relative; margin-top: clamp(10px, 1.6vh, 18px); height: clamp(10px, 1.45vh, 16px); border-radius: 99px; background: rgba(22, 6, 34, .82); box-shadow: inset 0 0 0 2px rgba(255, 244, 227, .14), 0 4px 16px rgba(0, 0, 0, .4); overflow: hidden; }
.sl-bar b { position: absolute; left: 3px; top: 3px; bottom: 3px; width: calc((100% - 6px) * var(--p, 0)); min-width: 8px; border-radius: 99px; background: linear-gradient(90deg, #ff2e8a, #ff5fa8 60%, #ffb3d4); box-shadow: 0 0 14px rgba(255, 46, 138, .8); transition: width .35s cubic-bezier(.2,.9,.25,1); }
.sl-bar b::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent); background-size: 40% 100%; background-repeat: no-repeat; animation: sl-shine 1.6s linear infinite; }
@keyframes sl-shine { from { background-position: -40% 0; } to { background-position: 140% 0; } }
.sl-stat { display: flex; justify-content: space-between; margin-top: clamp(6px, 1vh, 12px); font: 400 clamp(10px, .82vw, 13px)/1 var(--ps-cond); letter-spacing: .22em; text-transform: uppercase; color: rgba(255, 244, 227, .72); }
.sl-tip { position: absolute; right: clamp(20px, 4vw, 80px); bottom: clamp(22px, 5.2vh, 72px); display: flex; gap: 14px; align-items: center; max-width: min(34vw, 520px); padding: clamp(10px, 1.4vh, 16px) clamp(12px, 1.2vw, 20px); background: rgba(22, 6, 34, .62); backdrop-filter: blur(8px); border-radius: 14px; box-shadow: inset 0 0 0 1px rgba(255, 244, 227, .14); }
.sl-tip-i { flex: none; width: clamp(28px, 2.2vw, 36px); height: clamp(28px, 2.2vw, 36px); border-radius: 50%; display: grid; place-items: center; background: #ffd23f; color: #3b0f46; font: 400 clamp(15px, 1.2vw, 20px)/1 var(--ps-cond); box-shadow: 0 0 14px rgba(255, 210, 63, .55); }
.sl-tip p { margin: 0; font: 400 clamp(12px, .95vw, 16px)/1.4 var(--ps-sans); color: #fff4e3; transition: opacity .35s, transform .4s; }
.sl-tip p.swap { opacity: 0; transform: translateY(6px); }
.sl-place { position: absolute; left: clamp(20px, 4vw, 80px); bottom: calc(clamp(22px, 5.2vh, 72px) + clamp(110px, 14vh, 170px)); font: 400 clamp(11px, .9vw, 14px)/1 var(--ps-cond); letter-spacing: .3em; text-transform: uppercase; color: #ffd23f; text-shadow: 0 2px 8px rgba(0,0,0,.6); }
@media (max-aspect-ratio: 4/3) { .sl-tip { max-width: 60vw; bottom: auto; top: 40vh; } }
.ps-reduced .sl-art, .ps-reduced .sl-rays { animation: none !important; }
`;
export function createLoadScreen(o = {}) {
  if (!document.getElementById('sl-load-css')) { const st = document.createElement('style'); st.id = 'sl-load-css'; st.textContent = CSS; document.head.appendChild(st); }
  const tips = (o.tips || TIPS).slice().sort(() => Math.random() - 0.5);
  if (o.firstTip) tips.unshift(o.firstTip);
  const L = document.createElement('div'); L.className = 'sl-load';
  L.innerHTML = `<div class="sl-art"></div><div class="sl-rays"></div><div class="sl-shade"></div>
    <div class="sl-logo">${logoSVG()}</div>
    <div class="sl-place"></div>
    <div class="sl-left"><div class="sl-word">LOADING<i>.</i><i>.</i><i>.</i></div><div class="sl-bar"><b></b></div><div class="sl-stat"><span class="sl-msg"></span><span class="sl-pct">0%</span></div></div>
    <div class="sl-tip"><span class="sl-tip-i">i</span><p></p></div>`;
  const art = L.querySelector('.sl-art');
  const img = new Image(); img.onload = () => { art.style.backgroundImage = `url('${img.src}')`; }; img.src = o.art || '/assets/ui/keyart_loading.webp';
  (o.mount || document.body).appendChild(L);
  requestAnimationFrame(() => L.classList.add('in'));
  const bar = L.querySelector('.sl-bar'), pct = L.querySelector('.sl-pct'), msg = L.querySelector('.sl-msg'), tipP = L.querySelector('.sl-tip p'), place = L.querySelector('.sl-place');
  let ti = 0, shown = 0;
  const fill = o.fillTip || ((s) => s);
  const nextTip = () => { tipP.classList.add('swap'); setTimeout(() => { tipP.innerHTML = fill(tips[ti++ % tips.length]); tipP.classList.remove('swap'); }, 300); };
  tipP.innerHTML = fill(tips[ti++ % tips.length]);
  const tipT = setInterval(nextTip, 6500);
  return {
    el: L,
    set(p, m) { shown = Math.max(shown, Math.min(100, p)); bar.style.setProperty('--p', (shown / 100).toFixed(3)); pct.textContent = Math.floor(shown) + '%'; if (m != null) msg.textContent = m; },
    place(t) { place.textContent = t || ''; },
    close() { clearInterval(tipT); L.classList.add('out'); setTimeout(() => L.remove(), 950); },
  };
}

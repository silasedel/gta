// Story overlays: the mission title banner, the Mission Failed screen (Retry / Quit), cutscene subtitles, the hold-to-skip
// prompt and the phone-call card. Plain DOM with one style sheet; the Mission Passed card itself is game.passed
// (src/audio/passed.v2.js, CONVENTIONS 4d). Every overlay works with mouse, keyboard and controller.

const CSS = `
.st-banner{position:fixed;left:0;right:0;bottom:22vh;display:flex;flex-direction:column;align-items:center;
  pointer-events:none;z-index:58;opacity:0;transition:opacity .5s}
.st-banner.on{opacity:1}
.st-banner small{font:700 13px/1 var(--ps-sans,Inter,sans-serif);letter-spacing:.34em;text-transform:uppercase;
  color:#ff9bd0;text-shadow:0 2px 6px rgba(0,0,0,.7)}
.st-banner b{margin-top:8px;font:900 italic 58px/1 var(--ps-cond,'Archivo Black',sans-serif);letter-spacing:.04em;
  text-transform:uppercase;color:#fff;text-shadow:3px 3px 0 #3b0f46,0 0 22px rgba(255,46,138,.55)}
.st-banner i{display:block;width:0;height:3px;margin-top:12px;background:linear-gradient(90deg,#8a4dff,#ff2e8a);
  transition:width .9s .2s cubic-bezier(.16,1,.3,1)}
.st-banner.on i{width:220px}

.st-fail{position:fixed;inset:0;z-index:62;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at center,rgba(30,6,30,.55),rgba(8,4,14,.88));opacity:0;transition:opacity .35s}
.st-fail.on{opacity:1}
.st-fail h1{margin:0;font:900 italic 76px/1 var(--ps-cond,'Archivo Black',sans-serif);letter-spacing:.04em;
  color:#ff3d6e;text-transform:uppercase;text-shadow:0 4px 0 #4a0a22,0 0 24px rgba(255,61,110,.45)}
.st-fail p{margin:14px 0 30px;font:600 22px/1.3 var(--ps-sans,Inter,sans-serif);color:#f3ede2}
.st-fail .st-acts{display:flex;gap:16px}
.st-fail button{min-width:190px;padding:12px 22px;border-radius:10px;border:1px solid rgba(255,255,255,.18);
  background:rgba(20,12,34,.8);color:#fff;font:800 18px/1 var(--ps-sans,Inter,sans-serif);letter-spacing:.12em;
  text-transform:uppercase;cursor:pointer;transition:background .15s,transform .15s,box-shadow .15s}
.st-fail button.cur,.st-fail button:hover{background:linear-gradient(90deg,#ff2e8a,#8a4dff);transform:scale(1.04);
  box-shadow:0 0 22px rgba(255,46,138,.45)}

.st-sub{position:fixed;left:50%;bottom:13vh;transform:translateX(-50%);max-width:64vw;text-align:center;z-index:61;
  pointer-events:none;font:600 22px/1.4 var(--ps-sans,Inter,sans-serif);color:#fff;opacity:0;transition:opacity .2s;
  text-shadow:0 2px 3px #000,0 0 10px rgba(0,0,0,.85)}
.st-sub.on{opacity:1}
.st-sub b{color:#ff9bd0;margin-right:8px}

.st-skip{position:fixed;right:4vw;bottom:5vh;z-index:63;display:flex;align-items:center;gap:10px;pointer-events:none;
  font:700 14px/1 var(--ps-sans,Inter,sans-serif);letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.75);
  opacity:0;transition:opacity .4s}
.st-skip.on{opacity:1}
.st-skip svg{width:26px;height:26px;transform:rotate(-90deg)}
.st-skip circle{fill:none;stroke-width:3}
.st-skip .bg{stroke:rgba(255,255,255,.22)}
.st-skip .fg{stroke:#ff2e8a;stroke-dasharray:63;stroke-dashoffset:63}
.st-skip kbd{padding:3px 7px;border-radius:5px;background:rgba(255,255,255,.14);font:inherit;color:#fff}

.st-call{position:fixed;right:4vw;top:16vh;z-index:61;display:flex;align-items:center;gap:14px;padding:14px 22px 14px 14px;
  border-radius:20px;background:rgba(16,12,26,.86);border:1px solid rgba(255,255,255,.12);
  box-shadow:0 16px 40px rgba(0,0,0,.45);color:#fff;opacity:0;transform:translateY(-10px);transition:opacity .3s,transform .3s}
.st-call.on{opacity:1;transform:none}
.st-call .av{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#8a4dff,#ff2e8a);font:800 22px/1 var(--ps-sans,Inter,sans-serif)}
.st-call b{display:block;font:700 18px/1.2 var(--ps-sans,Inter,sans-serif)}
.st-call small{font:500 14px/1.2 var(--ps-sans,Inter,sans-serif);color:#9fd8a8}
`;

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.id = 'story-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

function makeEl(cls, html = '') {
  ensureStyle();
  const e = document.createElement('div');
  e.className = cls;
  e.innerHTML = html;
  document.body.appendChild(e);
  return e;
}

export const esc = (t) =>
  String(t ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- mission title banner
let bannerEl = null;
export async function showBanner(title, kicker = '', ms = 3200) {
  if (!bannerEl) bannerEl = makeEl('st-banner', '<small></small><b></b><i></i>');
  bannerEl.querySelector('small').textContent = kicker;
  bannerEl.querySelector('b').textContent = title;
  bannerEl.classList.remove('on');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('on');
  await wait(ms);
  bannerEl.classList.remove('on');
}

// ---------------------------------------------------------------- Mission Failed: Retry / Quit
// Resolves to 'retry' or 'quit'. Arrows / D-pad move, Enter / A choose, Esc / B = Quit.
export function showFailScreen(game, { reason, canRetry = true }) {
  const el = makeEl(
    'st-fail ps-interactive',
    `<h1>Mission Failed</h1><p>${esc(reason || '')}</p><div class="st-acts">
      ${canRetry ? '<button data-act="retry">Retry</button>' : ''}<button data-act="quit">Quit</button></div>`,
  );
  const buttons = [...el.querySelectorAll('button')];
  let cur = 0;
  const leaveUI = game.bindings?.pushMode?.('ui');
  try {
    document.exitPointerLock?.();
  } catch (e) {
    /* */
  }
  function focus(i) {
    cur = (i + buttons.length) % buttons.length;
    buttons.forEach((b, k) => b.classList.toggle('cur', k === cur));
  }
  focus(0);
  requestAnimationFrame(() => el.classList.add('on'));
  return new Promise((resolve) => {
    let off = null;
    function done(act) {
      off?.();
      removeEventListener('keydown', onKey, true);
      leaveUI?.();
      el.classList.remove('on');
      setTimeout(() => el.remove(), 400);
      resolve(act);
    }
    function onKey(e) {
      // without the bindings layer (tests, mock game) the keyboard still works
      if (game.bindings) return;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') focus(cur - 1);
      else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') focus(cur + 1);
      else if (e.code === 'Enter') done(buttons[cur].dataset.act);
      else if (e.code === 'Escape') done('quit');
    }
    addEventListener('keydown', onKey, true);
    off = game.bindings?.on?.('nav', (d) => {
      d.handled = true;
      if (d.dir === 'left' || d.dir === 'up' || d.dir === 'prev') focus(cur - 1);
      else if (d.dir === 'right' || d.dir === 'down' || d.dir === 'next') focus(cur + 1);
      else if (d.dir === 'accept') done(buttons[cur].dataset.act);
      else if (d.dir === 'back') done('quit');
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) done(b.dataset.act);
    });
    el.addEventListener('mousemove', (e) => {
      const b = e.target.closest('button');
      if (b) focus(buttons.indexOf(b));
    });
  });
}

// ---------------------------------------------------------------- subtitles ("Speaker  line")
let subEl = null;
let subTimer = 0;
export function subtitle(who, text, ms = 3200) {
  if (!subEl) subEl = makeEl('st-sub');
  clearTimeout(subTimer);
  if (!text) {
    subEl.classList.remove('on');
    return;
  }
  subEl.innerHTML = (who ? `<b>${esc(who)}</b>` : '') + esc(text);
  subEl.classList.add('on');
  subTimer = setTimeout(() => subEl.classList.remove('on'), ms);
}

// ---------------------------------------------------------------- hold-to-skip prompt
let skipEl = null;
export function skipPrompt(on, progress = 0, glyph = 'Enter') {
  if (!skipEl) {
    skipEl = makeEl(
      'st-skip',
      `<svg viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="10"/><circle class="fg" cx="12" cy="12" r="10"/></svg>
       <span>Hold <kbd></kbd> to skip</span>`,
    );
  }
  skipEl.querySelector('kbd').innerHTML = glyph;
  skipEl.classList.toggle('on', !!on);
  skipEl.querySelector('.fg').style.strokeDashoffset = String(63 * (1 - progress));
}

// ---------------------------------------------------------------- phone call card
let callEl = null;
let callTimer = 0;
export function phoneCall(who) {
  if (!callEl)
    callEl = makeEl('st-call', '<div class="av"></div><div><b></b><small></small></div>');
  clearInterval(callTimer);
  if (!who) {
    callEl.classList.remove('on');
    return;
  }
  const t0 = performance.now();
  callEl.querySelector('.av').textContent = String(who).trim().charAt(0).toUpperCase();
  callEl.querySelector('b').textContent = who;
  const small = callEl.querySelector('small');
  const tick = () => {
    const s = Math.floor((performance.now() - t0) / 1000);
    small.textContent = `on call · ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  tick();
  callTimer = setInterval(tick, 500);
  callEl.classList.add('on');
}

// Hotwire minigame (W2, Nov 19 playtest): after breaking the window of a locked car that isn't yours, the engine has to be
// wired before it runs.  Two quick stages: a spark sweeps along the steering-column panel, press E (or click) while it is
// over the bright contact.  A dead-center hit wires the car at once; a miss costs a moment, never fails the theft.
// Skill: every successful hotwire widens the contact, and from SKILL_AUTO thefts on Nico wires a car on his own in ~0.8 s.
// No per-frame cost when idle: the loop runs only while a hotwire is active.  ?hotwire=0 = old (engine starts at once).
//   const hw = createHotwire(game); hw.start(vehicle, onDone) -> true if a minigame started; hw.cancel(); hw.active
const CSS = `
.sl-hw{position:fixed;left:50%;bottom:16%;transform:translateX(-50%) translateY(12px);width:min(440px,78vw);padding:14px 18px 16px;
 border-radius:14px;background:linear-gradient(180deg,rgba(14,16,20,.86),rgba(8,9,12,.92));box-shadow:0 12px 40px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.07);
 color:#f2efe8;font:600 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.06em;opacity:0;transition:opacity .18s,transform .18s;z-index:60;pointer-events:none;user-select:none}
.sl-hw.on{opacity:1;transform:translateX(-50%) translateY(0)}
.sl-hw .hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;text-transform:uppercase;font-size:12px;color:#cfc8ba}
.sl-hw .hd b{color:#ffd166;font-weight:800;letter-spacing:.14em}
.sl-hw .wires{display:flex;gap:6px}
.sl-hw .wire{width:26px;height:6px;border-radius:3px;background:#3a3d44;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);transition:background .2s,box-shadow .2s}
.sl-hw .wire.done{box-shadow:0 0 10px currentColor}
.sl-hw .track{position:relative;height:30px;border-radius:8px;overflow:hidden;
 background:repeating-linear-gradient(90deg,#1b1e24 0 9px,#20242b 9px 18px);box-shadow:inset 0 2px 6px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.06)}
.sl-hw .zone{position:absolute;top:0;bottom:0;border-radius:6px;background:linear-gradient(90deg,rgba(255,209,102,.0),rgba(255,209,102,.38) 30%,rgba(255,236,170,.6) 50%,rgba(255,209,102,.38) 70%,rgba(255,209,102,0));
 box-shadow:0 0 18px rgba(255,200,90,.35)}
.sl-hw .core{position:absolute;top:4px;bottom:4px;width:3px;margin-left:-1.5px;border-radius:2px;background:#fff6d8;box-shadow:0 0 8px #ffe08a}
.sl-hw .spark{position:absolute;top:-4px;bottom:-4px;width:4px;margin-left:-2px;border-radius:2px;background:#9ee7ff;box-shadow:0 0 10px #6fd3ff,0 0 22px #3ab0ff}
.sl-hw .ft{display:flex;justify-content:space-between;margin-top:9px;font-size:12px;color:#a9a397;font-weight:600;letter-spacing:.04em}
.sl-hw kbd{display:inline-block;min-width:18px;padding:1px 6px;margin-right:6px;border-radius:5px;background:#f2efe8;color:#111;font:800 12px system-ui;text-align:center}
.sl-hw.hit .track{box-shadow:inset 0 0 0 2px #ffd166,0 0 24px rgba(255,209,102,.5)}
.sl-hw.miss{animation:sl-hw-shake .28s}
.sl-hw.miss .track{box-shadow:inset 0 0 0 2px #ff5a4a}
.sl-hw.ok .hd b{color:#7dff9a}
@keyframes sl-hw-shake{0%,100%{transform:translateX(-50%)}25%{transform:translateX(calc(-50% - 7px))}75%{transform:translateX(calc(-50% + 7px))}}
`;
const WIRE_COLORS = ['#e2483d', '#f2c230', '#8a5a2b'];
const SKILL_KEY = 'southline.hotwireSkill', SKILL_AUTO = 8, STAGES = 2;
const OFF = typeof location !== 'undefined' && /[?&]hotwire=0\b/.test(location.search);

export function createHotwire(game) {
  let el = null, st = null, raf = 0, last = 0;
  const skill = () => { try { return Math.max(0, +(localStorage.getItem(SKILL_KEY) || 0)); } catch (e) { return 0; } };
  const addSkill = () => { try { localStorage.setItem(SKILL_KEY, String(skill() + 1)); } catch (e) { /* private mode */ } };
  function mount() {
    if (el) return el;
    if (!document.getElementById('sl-hw-css')) { const s = document.createElement('style'); s.id = 'sl-hw-css'; s.textContent = CSS; document.head.appendChild(s); }
    el = document.createElement('div'); el.className = 'sl-hw';
    el.innerHTML = `<div class="hd"><b>Hotwire</b><span class="wires">${WIRE_COLORS.slice(0, STAGES + 1).map((c) => `<i class="wire" style="color:${c}"></i>`).join('')}</span></div>
      <div class="track"><div class="zone"></div><div class="core"></div><div class="spark"></div></div>
      <div class="ft"><span><kbd>E</kbd>touch the wires</span><span class="hint"></span></div>`;
    document.body.appendChild(el);
    return el;
  }
  function placeZone() {
    const w = Math.min(0.3, 0.13 + skill() * 0.012); // skill widens the contact
    st.zw = w; st.zc = w / 2 + 0.08 + Math.random() * (0.84 - w);
    const z = el.querySelector('.zone'), c = el.querySelector('.core');
    z.style.left = ((st.zc - w / 2) * 100) + '%'; z.style.width = (w * 100) + '%'; c.style.left = (st.zc * 100) + '%';
  }
  function wireLit(n) { el.querySelectorAll('.wire').forEach((w, i) => { const on = i < n; w.classList.toggle('done', on); w.style.background = on ? w.style.color : ''; }); }
  function flash(cls) { el.classList.remove('hit', 'miss'); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el && el.classList.remove(cls), 300); }
  function sfx(name, vol = 0.5) { try { game.audio?.play?.(name, { position: st?.v?.mesh?.position?.clone?.(), volume: vol }); } catch (e) { /* optional */ } }
  function finish(ok) {
    const s = st; st = null; cancelAnimationFrame(raf); raf = 0;
    removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onMouse, true);
    if (el) { if (ok) { el.classList.add('ok'); wireLit(STAGES + 1); } setTimeout(() => el && el.classList.remove('on', 'ok'), ok ? 380 : 0); }
    if (ok) addSkill();
    s?.done?.(ok);
  }
  function press() {
    if (!st || st.auto || st.cool > 0) return;
    const d = Math.abs(st.x - st.zc);
    if (d <= st.zw / 2) {
      const perfect = d < st.zw * 0.12;
      st.stage = perfect ? STAGES : st.stage + 1; flash('hit'); sfx('spark', 0.45); wireLit(st.stage);
      if (st.stage >= STAGES) { st.cool = 0.25; st.ending = true; return; }
      st.speed *= 1.15; placeZone(); st.cool = 0.15;
    } else { flash('miss'); sfx('spark', 0.2); st.cool = 0.45; st.speed *= 0.92; }
  }
  function onKey(e) {
    if (!st) return;
    if (e.code === 'KeyE' && !e.repeat) press();
  }
  function onMouse(e) { if (st && e.button === 0) press(); }
  function loop(t) {
    if (!st) return;
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    const P = game.player?.state;
    if (!P?.inVehicle || P.vehicle !== st.v || st.v.disabled) { finish(false); return; }
    if (!game.ui?.paused) {
      st.t += dt;
      if (st.cool > 0) st.cool -= dt;
      if (st.auto) { const k = Math.min(1, st.t / 0.8); wireLit(Math.floor(k * (STAGES + 1))); st.x = k; if (k >= 1) { finish(true); return; } }
      else if (st.ending) { if (st.cool <= 0) { finish(true); return; } }
      else { st.ph += dt * st.speed; st.x = 0.5 - 0.5 * Math.cos(st.ph); }   // eased sweep: slows at the ends, quick through the middle
      el.querySelector('.spark').style.left = (st.x * 100) + '%';
    }
    raf = requestAnimationFrame(loop);
  }
  const api = {
    get active() { return !!st; },
    start(v, done) {
      if (OFF || st || typeof document === 'undefined') return false;
      mount(); el.classList.remove('ok', 'hit', 'miss');
      const auto = skill() >= SKILL_AUTO;
      st = { v, done, t: 0, ph: Math.random() * 3, x: 0, speed: 3.4 + Math.random() * 0.6, stage: 0, cool: 0.35, auto, ending: false };
      placeZone(); wireLit(0);
      el.querySelector('.hint').textContent = auto ? 'you know this one' : skill() ? `${Math.min(skill(), SKILL_AUTO)}/${SKILL_AUTO} practice` : 'center = instant';
      el.classList.add('on');
      addEventListener('keydown', onKey, true); addEventListener('mousedown', onMouse, true);
      last = 0; raf = requestAnimationFrame(loop);
      return true;
    },
    cancel() { if (st) finish(false); },
  };
  return api;
}

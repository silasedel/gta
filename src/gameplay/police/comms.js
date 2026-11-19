// POLICE track: what the player hears from the police. Officer shouts (subtitles at the bottom, like spoken lines),
// the dispatch radio (a small ticker on the left while wanted) and the sirens of the pursuing cars (game.audio.siren).
// No voice files exist yet: the AUDIO track can voice both through game.on('police:shout' | 'police:radio').
import { tryCall } from '../util.js';

const css = `
.pl-subs{position:fixed;left:50%;bottom:13.5vh;transform:translateX(-50%);z-index:44;pointer-events:none;text-align:center;max-width:70vw;
  font:600 clamp(15px,1.45vw,24px)/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f4f2;text-shadow:0 2px 3px rgba(0,0,0,.95),0 0 12px rgba(0,0,0,.7)}
.pl-subs .pl-line{opacity:0;transition:opacity .22s ease;display:block}
.pl-subs .pl-line.on{opacity:1}
.pl-subs b{color:#8fb8ff;font-weight:700;margin-right:.35em}
.pl-radio{position:fixed;left:1.6vw;top:34vh;z-index:43;pointer-events:none;width:min(29vw,430px);
  font:500 clamp(11px,.82vw,14px)/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#dfe6ee}
.pl-radio .pl-r{background:linear-gradient(90deg,rgba(8,14,26,.78),rgba(8,14,26,.0));border-left:3px solid #3d7bff;padding:5px 10px 6px;margin-bottom:5px;
  opacity:0;transform:translateX(-10px);transition:opacity .3s ease,transform .3s ease}
.pl-radio .pl-r.on{opacity:1;transform:none}
.pl-radio .pl-r.hi{border-left-color:#ff4a4a}
.pl-radio .pl-r i{display:block;font-style:normal;font-size:.78em;letter-spacing:.12em;text-transform:uppercase;color:#8ea4c4;margin-bottom:1px}
html[data-subs="small"] .pl-subs{font-size:clamp(13px,1.15vw,19px)} html[data-subs="large"] .pl-subs{font-size:clamp(18px,1.8vw,30px)}
`;

export function createComms(game, G, law) {
  const S = law.S;
  let root = null, subs = null, radio = null;
  try {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    subs = document.createElement('div'); subs.className = 'pl-subs';
    radio = document.createElement('div'); radio.className = 'pl-radio';
    document.body.append(subs, radio); root = true;
  } catch (e) { root = null; }
  const subsOn = () => game.settings?.subtitles !== false;

  // ---- shouts: one line at a time, newest wins when more urgent
  let line = null, lineT = 0, linePri = 0;
  const lastBy = new WeakMap();
  function shout(unit, text, o = {}) {
    if (!text) return false;
    const t = game.clock.elapsed, pri = o.priority ?? 1;
    if (unit && t - (lastBy.get(unit) ?? -99) < (o.gap ?? 3.5)) return false;
    if (line && lineT > 0.6 && pri < linePri) return false;
    if (unit) lastBy.set(unit, t);
    const who = o.who || (unit?.name ? `${unit.rank || 'Ofc.'} ${unit.name}` : 'Officer');
    game.emit?.('police:shout', { text, who, unit, priority: pri });
    if (!root || !subsOn()) return true;
    if (line) { const old = line; old.classList.remove('on'); setTimeout(() => old.remove(), 260); }
    line = document.createElement('span'); line.className = 'pl-line';
    line.innerHTML = `<b>${who}:</b>${text.replace(/</g, '&lt;')}`;
    subs.appendChild(line); void line.offsetWidth; line.classList.add('on');
    lineT = o.dur ?? Math.min(4.2, 1.6 + text.length * 0.045); linePri = pri;
    return true;
  }
  // ---- radio ticker: the last three messages while wanted, each fades after its time
  const rows = [];
  game.on?.('police:radio', (m) => {
    if (!root || !m?.text) return;
    if (S.level === 0 && m.kind !== 'lost' && m.kind !== 'dispatch') return;
    const el = document.createElement('div'); el.className = 'pl-r' + ((m.priority ?? 1) >= 3 ? ' hi' : '');
    el.innerHTML = `<i>${(m.speaker || 'Dispatch').replace(/</g, '&lt;')}${m.code ? ' &middot; ' + m.code : ''}</i>${m.text.replace(/</g, '&lt;')}`;
    radio.appendChild(el); void el.offsetWidth; el.classList.add('on');
    rows.push({ el, t: Math.max(4, m.dur || 5) });
    while (rows.length > 3) { const r = rows.shift(); r.el.remove(); }
  });

  // ---- sirens: the two closest pursuing cars sound (wail far, yelp close), parked / deployed cars stay silent
  const sirenIds = ['cop0', 'cop1'], sirenOn = [false, false], best = [null, null], bestD = [1e9, 1e9];
  function sirens(cars) {
    const A = game.audio; if (!A?.siren) return;
    const pp = game.player.position;
    best[0] = best[1] = null; bestD[0] = bestD[1] = 1e9;
    for (const c of cars) {
      const v = c.v; if (c.deployed || !v.sirenActive || v.disabled) continue;
      let t; try { t = v.body.translation(); } catch (e) { continue; }
      const d = Math.hypot(t.x - pp.x, t.z - pp.z); if (d > 260) continue;
      if (d < bestD[0]) { best[1] = best[0]; bestD[1] = bestD[0]; best[0] = v; bestD[0] = d; } else if (d < bestD[1]) { best[1] = v; bestD[1] = d; }
    }
    for (let i = 0; i < 2; i++) {
      const v = best[i];
      if (v) { const t = v.body.translation(); tryCall('siren', () => A.siren(true, { x: t.x, y: t.y + 1.2, z: t.z }, sirenIds[i], bestD[i] < 38 ? 'yelp' : 'wail')); sirenOn[i] = true; }
      else if (sirenOn[i]) { tryCall('siren off', () => A.siren(false, null, sirenIds[i])); sirenOn[i] = false; }
    }
  }
  function silence() { for (let i = 0; i < 2; i++) if (sirenOn[i]) { tryCall('siren off', () => game.audio?.siren?.(false, null, sirenIds[i])); sirenOn[i] = false; } }

  function tick(dt) {
    if (line && (lineT -= dt) <= 0) { const old = line; line = null; old.classList.remove('on'); setTimeout(() => old.remove(), 260); }
    for (let i = rows.length - 1; i >= 0; i--) { const r = rows[i]; r.t -= dt; if (r.t <= 0) { r.el.classList.remove('on'); const el = r.el; setTimeout(() => el.remove(), 320); rows.splice(i, 1); } }
  }
  return { shout, sirens, silence, tick, get line() { return line?.textContent || null; } };
}

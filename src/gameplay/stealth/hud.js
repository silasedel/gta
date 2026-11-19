// W6 stealth: the suspicion meter (top centre, under the compass area). One shared element; each zone reports its level
// (0..1, >1 = detected) and the highest one shows. Injected CSS, no dependency on src/ui.
let el = null, fill = null, lab = null, zone = null;
const levels = new Map();
function ensure() {
  if (el) return;
  const st = document.createElement('style');
  st.textContent = `.ps-sus{position:fixed;left:50%;top:86px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:7px 14px 7px 10px;border-radius:999px;background:rgba(8,12,20,.62);box-shadow:inset 0 0 0 1px rgba(243,237,226,.18);color:#f3ede2;font:700 11px/1 var(--ps-cond, system-ui, sans-serif);letter-spacing:.16em;z-index:31;pointer-events:none;opacity:0;transition:opacity .25s}
.ps-sus.on{opacity:1}.ps-sus svg{width:22px;height:22px;flex:none}.ps-sus .bar{width:150px;height:6px;border-radius:4px;background:rgba(243,237,226,.16);overflow:hidden}
.ps-sus .bar i{display:block;height:100%;width:0;background:#ffb020;border-radius:4px;transition:width .1s linear}
.ps-sus.hot .bar i{background:#ff6a20}.ps-sus.det{box-shadow:inset 0 0 0 1px rgba(255,59,48,.7)}.ps-sus.det .bar i{background:#ff3b30;width:100%}
.ps-sus.det svg{animation:psSusP .5s ease-in-out infinite alternate}@keyframes psSusP{to{opacity:.35}}
.ps-sus .z{opacity:.6;font-weight:600}`;
  document.head.appendChild(st);
  el = document.createElement('div'); el.className = 'ps-sus';
  el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.4" fill="currentColor"/></svg><div><div class="lab" style="margin-bottom:5px">NOTICED <span class="z"></span></div><div class="bar"><i></i></div></div>';
  document.body.appendChild(el); fill = el.querySelector('.bar i'); lab = el.querySelector('.lab'); zone = el.querySelector('.z');
}
export function meter() {
  return {
    set(id, v, text = '', zoneName = '') {
      if (typeof document === 'undefined') return;
      if (v > 0.015) levels.set(id, { v, text, zoneName }); else levels.delete(id);
      let top = null; for (const l of levels.values()) if (!top || l.v > top.v) top = l;
      ensure();
      el.classList.toggle('on', !!top);
      if (!top) return;
      el.classList.toggle('det', top.v > 1); el.classList.toggle('hot', top.v > 0.6 && top.v <= 1);
      el.style.color = top.v > 1 ? '#ff6a60' : top.v > 0.6 ? '#ffb070' : '#f3ede2';
      const w = Math.round(Math.min(1, top.v) * 100) + '%'; if (fill.style.width !== w) fill.style.width = w;
      const t = (top.text || 'NOTICED') + ' '; if (lab.firstChild.nodeValue !== t) lab.firstChild.nodeValue = t;
      if (zone.textContent !== top.zoneName) zone.textContent = top.zoneName || '';
    },
  };
}

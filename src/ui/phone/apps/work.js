// Work: side jobs from the jobs system (game.jobs: start, quit, stats) and the businesses you own (game.business).
import './apps.css';

export default function workApp(os) {
  const { esc, GLYPH: G, game } = os;
  const jobs = () => (Array.isArray(game.jobs?.list) ? game.jobs.list : []);
  const owned = () => { try { return game.business?.owned?.() || []; } catch (e) { return []; } };
  function page(app) {
    const J = game.jobs, act = J?.active, st = J?.stats || { done: {}, earned: 0 }, biz = owned();
    const doneN = Object.values(st.done || {}).reduce((s, n) => s + n, 0);
    return {
      title: 'Work', large: true, back: false,
      body: `<div class="wk-stats"><div><small>Earned from side jobs</small><b>${os.money(st.earned || 0, { cents: false })}</b></div><div><small>Jobs done</small><b>${doneN}</b></div></div>
        ${act?.def ? `<div class="wk-active"><span class="kp-isl-dot"></span><span class="kp-row-t"><small>Working now</small><b>${esc(act.def.name)}</b><small>${esc(act.def.client || '')}</small></span><button class="kp-chip" data-act="quit" data-f>Quit</button></div>` : ''}
        <div class="kp-sec">Side jobs</div>
        ${jobs().length ? os.rowsHTML(jobs().map((d) => ({ icon: G.briefcase, tile: '#f28a1b', title: esc(d.name), sub: esc(`${d.client || ''}${d.pay ? ' · ' + d.pay : ''}`), right: act ? '' : '<span class="bk-pill wk-pill">Start</span>', act: act ? null : 'start', data: { id: d.id }, chevron: false, value: st.done?.[d.id] ? `${st.done[d.id]}×` : null })))
          + `<div class="kp-foot">${act ? 'Finish or quit your current job to take another.' : 'Starting a job closes the phone and marks the first stop on your map.'}</div>`
          : `<div class="kp-group"><div class="kp-empty" style="padding:24px">No work around here right now. Side jobs are posted in the city.</div></div>`}
        <div class="kp-sec">Your businesses</div>
        ${biz.length ? os.rowsHTML(biz.map((b) => { const t = b.today || {}, m = b.staff?.length ? Math.round(b.staff.reduce((s, p) => s + (p.morale || 0), 0) / b.staff.length * 100) : null; return { icon: G.store, tile: '#d9822b', title: esc(b.name), sub: esc(`${b.typeName}${b.open ? ' · Open' : ' · Closed'}${b.staff?.length ? ` · ${b.staff.length} staff, ${m}% morale` : ''}`), value: `<span class="wk-biz"><b>${os.money(Number(b.safe) || 0, { cents: false })}</b><small>in the safe</small></span>`, act: 'biz', data: { id: b.id }, chevron: true }; }))
          : `<div class="kp-group"><div class="kp-empty" style="padding:24px">You don't own a business yet. Buy one and its takings, staff and safe show up here.</div></div>`}`,
      acts: {
        start: (el) => { os.close(); setTimeout(() => { try { game.jobs?.start?.(el.dataset.id); } catch (e) { console.error(e); } }, 250); },
        quit: () => { try { game.jobs?.cancel?.(); } catch (e) { /* */ } os.replaceTop(page(app)); },
        biz: (el) => os.push(bizPage(app, el.dataset.id)),
      },
      tick: (dt, el) => { el._t = (el._t || 0) + dt; if (el._t > 3) { el._t = 0; const sc = el.querySelector('.kp-scroll').scrollTop; const n = os.replaceTop(page(app)); n.querySelector('.kp-scroll').scrollTop = sc; } },
    };
  }
  function bizPage(app, id) {
    const b = owned().find((x) => x.id === id); if (!b) return { title: 'Business', back: 'Work', body: '' };
    const hist = (game.business?.report?.(id, 7) || []).map((r) => Number(r.revenue || 0)), mx = Math.max(1, ...hist);
    return {
      title: b.name, back: 'Work', large: true,
      body: `<div class="bk-card wk-chart"><small>Revenue, last ${hist.length} days</small><div class="wk-bars">${hist.map((v) => `<i style="--h:${(v / mx * 100).toFixed(1)}%"></i>`).join('')}</div></div>
        ${os.rowsHTML([{ title: 'In the safe', value: os.money(Number(b.safe) || 0) }, { title: 'Value', value: os.money(Number(b.value) || 0, { cents: false }) }, { title: 'Reputation', value: `${Math.round((b.reputation || 0) * 100)}%` }])}
        <div class="kp-sec">Staff</div>
        ${b.staff?.length ? os.rowsHTML(b.staff.map((s) => ({ avatar: os.contactAvatar(os.data.contact(`staff:${b.id}:${s.id}`), 36), title: esc(s.name), sub: esc(`${s.role} · $${s.wage}/h · ${Math.round((s.morale || 0) * 100)}% morale`), right: '<span class="bk-pill wk-pill">Bonus</span>', act: 'bonus', data: { id: `staff:${b.id}:${s.id}` }, chevron: false }))) : '<div class="kp-group"><div class="kp-empty" style="padding:22px">No staff hired.</div></div>'}
        <div class="kp-foot">Collect the safe in person. A bonus sent from your bank lifts morale.</div>`,
      acts: { bonus: (el) => { os.closeApp(); setTimeout(() => os.openApp('bank', { send: true, to: el.dataset.id }), 80); } },
    };
  }
  return {
    id: 'work', name: 'Work',
    launch(app) { os.push(page(app), { instant: true, sound: false }); },
    widget: () => {
      const act = game.jobs?.active, st = game.jobs?.stats || { earned: 0 }, js = jobs().slice(0, 3);
      return `<div class="wk-wg"><div class="wk-wg-h"><span class="kp-ico sm" style="background:${os.APP_ICONS.work.bg}">${os.APP_ICONS.work.svg}</span><b>Work</b><small>${os.money(st.earned || 0, { cents: false })} earned</small></div>
        ${act?.def ? `<div class="wk-wg-act"><span class="kp-isl-dot"></span><b>${esc(act.def.name)}</b><small>${esc(act.def.client || '')}</small></div>` : js.length ? js.map((d) => `<div class="wk-wg-row"><b>${esc(d.name)}</b><small>${esc(d.pay || d.client || '')}</small></div>`).join('') : '<div class="wk-wg-row"><small>No side jobs posted nearby.</small></div>'}</div>`;
    },
  };
}

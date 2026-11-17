// Phone: contacts (the in-world cast, side-job clients, business staff, saved payees), recent calls, a keypad and a
// call screen. Calls are short: family and friends pick up with a line, others go to voicemail. The Hush Line makes the
// same offer as a street payphone while you are wanted: pay from the bank and one star goes away.
import './apps.css';

const LINES = {
  rafa: ['Mijo! I am on the boat, call you back.', 'The skiff better be where I left it.'],
  lucia: ['Ay, finally he calls. Come eat on Sunday.', 'Are you wearing sunscreen? Your skin, mijo.'],
  mom: ['Did you eat? You sound tired.', 'Call your tío. He worries.'],
  marisol: ['Not on this line. Text me.', 'Busy. If it is about the pier, after sunset.'],
  tiny: ['Garage. Talk fast.', 'If this is about the coupe, wire the money.'],
  mirta: ['Window is open till ten, cariño.', 'Two cafecitos waiting for you.'],
  dre: ['Yo. Not now, I will hit you back.'],
  inez: ['Captain Inez. Make it quick, I am docking.'],
  anand: ['Southline General, Dr. Anand. If this is an emergency, hang up and dial 911.'],
};
const ANSWERS = new Set(['rafa', 'lucia', 'mom', 'marisol', 'tiny', 'mirta', 'dre', 'inez', 'anand', 'hush']);

export default function phoneApp(os) {
  const { esc, GLYPH: G, data, game } = os;
  let seg = 'contacts', dial = '';

  function root(app) {
    return {
      title: seg === 'recents' ? 'Recents' : seg === 'keypad' ? '' : 'Contacts', large: seg !== 'keypad', back: false, cls: 'ph-root ph-' + seg,
      body: `<div class="kp-seg ph-seg">${[['contacts', 'Contacts'], ['recents', 'Recents'], ['keypad', 'Keypad']].map(([k, n]) => `<button class="${k === seg ? 'on' : ''}" data-act="seg" data-k="${k}" data-f>${n}</button>`).join('')}</div>
        ${seg === 'contacts' ? contactsHTML() : seg === 'recents' ? recentsHTML() : keypadPage()}`,
      acts: {
        seg: (el) => { seg = el.dataset.k; os.replaceTop(root(app)); os.sound('tick', 0.4); },
        c: (el) => os.push(detailPage(app, el.dataset.id)),
        call: (el) => call(app, el.dataset.id),
        key: (el) => { const k = el.dataset.k; if (k === 'del') dial = dial.slice(0, -1); else if (k !== '.' && dial.length < 14) dial += k; paintDial(); os.sound('tick', 0.3); },
        dial: () => dialNumber(app),
      },
      onDigit: seg === 'keypad' ? (k) => { if (k === 'del') { if (!dial) return false; dial = dial.slice(0, -1); } else if (dial.length < 14) dial += k; paintDial(); return true; } : null,
    };
  }
  function paintDial() { const el = os.app?.stack?.[0]?.querySelector('.ph-num'); if (el) { el.textContent = fmtDial(dial); el.classList.toggle('empty', !dial); } }
  const fmtDial = (d) => (d.length > 6 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d) || 'Enter a number';
  function contactsHTML() {
    const cs = data.contacts().filter((c) => c.kind !== 'payee');
    const fav = cs.filter((c) => c.fav);
    const groups = {};
    for (const c of cs) { const L = (c.name.replace(/^[^\p{L}]+/u, '')[0] || '#').toUpperCase(); (groups[L] ||= []).push(c); }
    return `<div class="ph-me"><span class="kp-av" style="--s:58px;--h:28">N</span><span><b>Nico</b><small>My card · (305) 555-0100</small></span></div>
      ${fav.length ? `<div class="ph-favs">${fav.map((c) => `<button class="bk-rec" data-act="c" data-id="${esc(c.id)}" data-f>${os.contactAvatar(c, 56)}<span>${esc(c.name.split(' ')[c.name.split(' ').length > 1 && /^(Tío|Abuela|Dr\.)$/.test(c.name.split(' ')[0]) ? 1 : 0])}</span></button>`).join('')}</div>` : ''}
      ${Object.keys(groups).sort((a, b) => a.localeCompare(b)).map((L) => `<div class="kp-sec">${esc(L)}</div>${os.rowsHTML(groups[L].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ avatar: os.contactAvatar(c, 36), title: esc(c.name), sub: esc(c.role || ''), act: 'c', data: { id: c.id }, chevron: false })))}`).join('')}`;
  }
  function recentsHTML() {
    const calls = data.S.calls.slice().reverse();
    if (!calls.length) return `<div class="kp-empty">${G.clock}<b>No recent calls</b>Calls you make show up here.</div>`;
    return os.rowsHTML(calls.map((r) => { const c = data.contact(r.id) || { name: r.number || 'Unknown', initials: '#', hue: 0 }; return { avatar: os.contactAvatar(c, 36), title: `<span class="${r.missed ? 'ph-missed' : ''}">${esc(c.name)}</span>`, sub: r.answered ? 'Outgoing' : 'No answer', value: esc(os.when(r.t)), act: 'call', data: { id: r.id || '' }, chevron: false }; }));
  }
  function keypadPage() {
    return `<div class="ph-num ${dial ? '' : 'empty'}">${esc(fmtDial(dial))}</div>${os.keypadHTML({ letters: true, decimal: false })}
      <div class="ph-callrow"><button class="ph-callbtn" data-act="dial" data-f>${G.phone}</button></div>`;
  }
  function dialNumber(app) {
    const d = dial.replace(/\D/g, '');
    if (!d) return;
    if (d === '911') { os.toast('Emergency services: help is on the way'); try { game.emit?.('call911', { position: game.player?.position }); } catch (e) { /* */ } dial = ''; paintDial(); return; }
    const c = data.contacts().find((x) => String(x.number || '').replace(/\D/g, '').endsWith(d.slice(-7)) && d.length >= 7);
    if (c) { call(app, c.id); dial = ''; return; }
    callScreen(app, { name: fmtDial(dial), initials: '#', hue: 0 }, null, 'The number you dialed is not in service.');
    dial = '';
  }

  function detailPage(app, id) {
    const c = data.contact(id); if (!c) return { title: '', body: '' };
    const extra = [];
    if (c.kind === 'garage' && data.S.tinyTab > 0) extra.push({ icon: G.dollar, tile: '#f28a1b', title: 'Garage tab', sub: 'Wire it from your bank', value: os.money(data.S.tinyTab, { cents: false }) });
    if (c.kind === 'hush') {
      extra.push({ icon: G.lock, tile: '#3a3a44', title: 'Credit', sub: 'Money already with them', value: os.money(data.S.hushCredit) });
      const W = game.wanted;
      if (W?.level > 0) extra.push({ icon: G.star, tile: '#e5484d', title: W.evading ? 'They can help now' : 'Lose the police first', sub: W.evading ? `${os.money(os.wire.hushPrice(), { cents: false })} lowers your wanted level by one star` : 'Nobody touches it while the cops can see you' });
    }
    if (c.kind === 'staff') { try { const b = (game.business?.owned?.() || []).find((x) => x.id === c.bizId), s = b?.staff?.find((x) => x.id === c.staffId); if (s) extra.push({ icon: G.store, tile: '#d9822b', title: b.name, sub: `${s.role} · $${s.wage}/h`, value: `${Math.round((s.morale || 0) * 100)}% morale` }); } catch (e) { /* */ } }
    return {
      title: '', back: 'Contacts', cls: 'ph-detail',
      body: `<div class="ph-hero">${os.contactAvatar(c, 96)}<b>${esc(c.name)}</b><small>${esc([c.role, c.place].filter(Boolean).join(' · '))}</small></div>
        <div class="ph-acts">
          <button data-act="msg" data-f>${G.message}<span>message</span></button>
          <button data-act="call" data-f>${G.phone}<span>call</span></button>
          <button data-act="pay" data-f ${c.kind === 'service' ? 'disabled' : ''}>${G.dollar}<span>pay</span></button>
        </div>
        ${os.rowsHTML([{ title: '<small class="ph-lbl">mobile</small>', sub: `<span class="ph-tel">${esc(c.number || 'Unknown')}</span>` }, ...(c.place ? [{ title: '<small class="ph-lbl">location</small>', sub: `<span class="ph-tel">${esc(c.place)}</span>` }] : [])])}
        ${extra.length ? os.rowsHTML(extra) : ''}`,
      acts: {
        msg: () => { os.closeApp(); setTimeout(() => os.openApp('messages', { thread: id }), 80); },
        call: () => call(app, id),
        pay: () => { os.closeApp(); setTimeout(() => os.openApp('bank', { send: true, to: id }), 80); },
      },
    };
  }

  function call(app, id) {
    const c = data.contact(id); if (!c) return;
    const answers = ANSWERS.has(id) || c.kind === 'staff' || c.kind === 'client';
    let line = null, offer = null;
    if (id === 'hush') {
      const W = game.wanted;
      if (W?.level > 0 && W.evading) { const p = os.wire.hushPrice(); line = data.S.hushCredit >= p ? 'You have credit with us. Consider it handled.' : `You've got heat. ${os.money(Math.max(0, p - data.S.hushCredit), { cents: false })} and it gets smaller.`; offer = data.S.hushCredit >= p ? 'credit' : 'pay'; }
      else if (W?.level > 0) line = 'Not while they can see you. Lose them, then call.';
      else line = 'Nothing to clean up. Call when you need us.';
    } else if (answers) { const pool = LINES[id] || (c.kind === 'staff' ? ['Hey boss, all good at the shop.'] : ['Who is this? Oh. Call you back.']); line = pool[(data.S.calls.length + id.length) % pool.length]; }
    data.S.calls.push({ id, t: data.now(), answered: !!answers }); if (data.S.calls.length > 30) data.S.calls.shift();
    callScreen(app, c, answers ? line : null, answers ? null : `${c.name.split(' ')[0]} can't come to the phone. Leave a message after the tone.`, offer);
  }
  function callScreen(app, c, line, voicemail, offer) {
    const el = os.h(`<div class="ph-call"><div class="ph-call-bg"></div>
      <div class="ph-call-h">${os.contactAvatar(c, 104)}<b>${esc(c.name)}</b><small class="ph-call-st">calling…</small></div>
      <div class="ph-line"></div>
      <div class="ph-call-grid">${[['speaker', 'speaker'], ['keypad', 'keypad'], ['face', 'video'], ['person', 'add'], ['dots', 'more'], ['lock', 'mute']].map(([g, n]) => `<button class="ph-cb" data-f>${G[g]}<span>${n}</span></button>`).join('')}</div>
      <div class="ph-call-end"><button class="ph-end" data-f data-autofocus>${G.phone}</button></div></div>`);
    app.el.appendChild(el);
    os.overlay(app, el, () => end());
    el.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
    os.sound('select', 0.4);
    const st = el.querySelector('.ph-call-st'), ln = el.querySelector('.ph-line');
    let t0 = 0, timer = 0, ended = false;
    const end = () => { if (ended) return; ended = true; clearInterval(timer); st.textContent = 'call ended'; os.sound('back', 0.4); el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 350, fill: 'forwards' }).onfinish = () => { el.remove(); if (app.overlay === el) { app.overlay = null; os.refocus(); } if (app.stack.length === 1 && seg === 'recents') os.replaceTop(root(app)); }; };
    el.querySelector('.ph-end').addEventListener('click', end);
    el._acts = {};
    setTimeout(() => {
      if (ended) return;
      if (!line && !voicemail) { end(); return; }
      t0 = performance.now();
      timer = setInterval(() => { const s = Math.floor((performance.now() - t0) / 1000); st.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 250);
      ln.innerHTML = `<span>${esc(line || voicemail)}</span>`;
      ln.classList.add('on');
      if (offer === 'pay') {
        const p = Math.max(1, os.wire.hushPrice() - data.S.hushCredit);
        ln.insertAdjacentHTML('beforeend', `<button class="kp-btn ph-offer" data-f>${G.dollar}Wire ${esc(os.money(p, { cents: false }))} now</button>`);
        ln.querySelector('.ph-offer').addEventListener('click', () => {
          const r = os.wire.send(data.contact('hush'), p, 'Services');
          ln.innerHTML = `<span>${esc(r.ok ? (r.effect ? 'Consider it handled.' : r.reply || 'Received.') : r.reasonText)}</span>`;
          if (r.ok && r.effect) os.toast(r.effect, 'good');
          setTimeout(end, 2200);
        });
        requestAnimationFrame(() => { const b = ln.querySelector('.ph-offer'); if (b) os.setFocus(b, { silent: true }); });
      } else if (offer === 'credit') { os.wire.hushLower(); os.toast('Wanted level lowered', 'good'); setTimeout(end, 3000); }
      else setTimeout(end, Math.max(3200, (line || voicemail).length * 70));
    }, 1700);
  }

  return {
    id: 'phone', name: 'Phone',
    badge: () => 0,
    launch(app) { seg = 'contacts'; os.push(root(app), { instant: true, sound: false }); },
    deepLink(app, opts = {}) { if (opts.call) call(app, opts.call); },
  };
}

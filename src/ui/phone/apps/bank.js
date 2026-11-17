// Bank app: the player's own bank (the brand the core money system picked, e.g. Unison Bank). Real data only:
// game.bank (checking, savings, card, ledger, loans), game.wallet (cash, hot cash), game.fines, the phone's wire rail.
// Screens: face unlock, Home (balance, chart, accounts, recent activity), Activity, Pay hub, Card, account details,
// transaction detail, Send money (recipient, account, amount, memo, review + slide to send, success, receipt),
// Transfer between accounts, ATM (deposit / withdraw; only at an ATM, mobile cash deposit with a fee elsewhere), Tickets.
import './bank.css';
import { GLYPH, categoryLook } from '../icons.js';

const ACC = { checking: 'Everyday Checking', savings: 'High-Yield Savings', cash: 'Cash' };
const MOBILE_FEE = (a) => Math.max(3, Math.round(a * 0.02 * 100) / 100);
const r2 = (v) => Math.round(v * 100) / 100;

export default function bankApp(os) {
  const { game, esc, GLYPH: G } = os;
  const B = () => game.bank, Wl = () => game.wallet;
  const $ = (v, o) => os.money(v, o);
  let unlockedUntil = 0, shownTotal = null, chartDays = 14;

  const brand = () => os.brand();
  const hasBank = () => !!(B() && Wl());
  const checking = () => Number(B()?.balance) || 0, savings = () => Number(B()?.savings) || 0, cash = () => Number(Wl()?.cash ?? game.player?.money) || 0;
  const last4 = () => B()?.card?.last4 || '0000';
  const acctNo = (k) => (k === 'savings' ? String((Number(last4()) * 7 + 4410) % 10000).padStart(4, '0') : last4());

  // ---------------------------------------------------------------- ledger views
  function ledger() { return Array.isArray(B()?.ledger) ? B().ledger : []; }
  /** Rows for lists: merges the cash<->checking halves of a deposit / withdrawal into one row. */
  function activity(o = {}) {
    const L = ledger(), out = [];
    for (let i = L.length - 1; i >= 0 && out.length < (o.limit || 400); i--) {
      const e = L[i];
      if (o.filter === 'cash' && e.account !== 'cash') continue;
      if (o.filter && o.filter !== 'cash' && e.account === 'cash' && e.category !== 'transfer') continue;
      if (e.category === 'transfer') {
        const pair = L[i - 1];
        if (pair && pair.category === 'transfer' && Math.abs(pair.amount + e.amount) < 0.005 && pair.t === e.t) {
          i--;
          const intoBank = e.account !== 'cash' ? e : pair, fromAcc = (intoBank === e ? pair : e).account;
          const row = { ...intoBank, merged: true, from: fromAcc, to: intoBank.account, amount: Math.abs(e.amount), display: Math.abs(e.amount) };
          if (o.filter === 'in' || o.filter === 'out') continue;
          out.push(row); continue;
        }
      }
      if (o.filter === 'in' && !(e.amount > 0)) continue;
      if (o.filter === 'out' && !(e.amount < 0)) continue;
      out.push(e);
    }
    return out;
  }
  function title(e) {
    if (e.merged) return /withdraw/i.test(e.memo) ? 'ATM withdrawal' : /deposit/i.test(e.memo) ? 'Cash deposit' : `Transfer to ${ACC[e.to] || e.to}`;
    if (e.category === 'wire') return e.party || 'Sent money';
    if (e.category === 'transfer') return e.memo || 'Transfer';
    return e.party || e.memo || (e.amount > 0 ? 'Deposit' : 'Purchase');
  }
  function subtitle(e) {
    const tm = os.clock(((e.t % 1440) + 1440) % 1440 / 60);
    if (e.merged) return `${ACC[e.from] || e.from} → ${ACC[e.to] || e.to} · ${tm}`;
    const what = e.category === 'wire' ? (e.memo && !/^Sent with|^Wire transfer$/.test(e.memo) ? e.memo : 'Sent') : e.party && e.memo && e.memo !== e.party ? e.memo : cap(e.category);
    return `${what} · ${tm}${e.account === 'cash' ? ' · Cash' : ''}`;
  }
  const cap = (s) => String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  function txRow(e, idx) {
    const [g, col] = e.merged ? [/withdraw/i.test(e.memo) ? 'withdraw' : 'deposit', '#7c8494'] : categoryLook(e);
    const amt = e.merged ? e.display : e.amount;
    return { icon: G[g] || G.bag, tile: col, title: esc(title(e)), sub: esc(subtitle(e)), value: e.merged ? $(amt) : $(amt, { sign: true }), valueCls: e.merged ? 'neg' : amt > 0 ? 'pos' : 'neg', act: 'tx', data: { i: e.id }, chevron: false, cls: e.account === 'cash' && !e.merged ? 'bk-cashrow' : '' };
  }
  function groupedActivity(list) {
    let html = '', day = null, rows = [];
    const flush = () => { if (rows.length) html += `<div class="kp-sec">${esc(os.dayLabel(day))}</div>` + os.rowsHTML(rows); rows = []; };
    for (const e of list) { if (e.day !== day) { flush(); day = e.day; } rows.push(txRow(e)); }
    flush();
    return html || `<div class="kp-empty">${G.list}<b>No activity yet</b>Money you earn, spend and send shows up here.</div>`;
  }
  function weekTotals() {
    const today = game.time?.day || 1; let inn = 0, out = 0;
    for (const e of ledger()) { if (e.day <= today - 7 || e.category === 'transfer') continue; if (e.amount > 0) inn += e.amount; else out -= e.amount; }
    return { in: r2(inn), out: r2(out) };
  }

  // ---------------------------------------------------------------- chart
  function chartSVG(days) {
    const s = os.data.balanceSeries(days), Wd = 345, Hd = 128, pad = 6;
    const vals = s.map((p) => p.v), lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(1, hi - lo);
    const x = (i) => pad + (i / Math.max(1, s.length - 1)) * (Wd - pad * 2), y = (v) => pad + 8 + (1 - (v - lo) / span) * (Hd - pad * 2 - 22);
    const P = s.map((p, i) => [x(i), y(p.v)]);
    // monotone cubic
    let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
    for (let i = 0; i < P.length - 1; i++) { const [x0, y0] = P[i], [x1, y1] = P[i + 1], cx = (x1 - x0) * 0.42; d += ` C${(x0 + cx).toFixed(1)} ${y0.toFixed(1)} ${(x1 - cx).toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`; }
    const area = `${d} L${P[P.length - 1][0].toFixed(1)} ${Hd} L${P[0][0].toFixed(1)} ${Hd} Z`;
    const L = P[P.length - 1], Bc = brand();
    const lbl = (i) => { const dd = s[i].day; try { const x2 = game.time.dateOfDay(dd); return days > 10 ? `${x2.monthName.slice(0, 3)} ${x2.day}` : x2.weekdayName.slice(0, 3); } catch (e) { return 'D' + dd; } };
    const ticks = days > 10 ? [0, Math.floor((s.length - 1) / 2), s.length - 1] : s.map((_, i) => i);
    return `<svg class="bk-chart" viewBox="0 0 ${Wd} ${Hd + 18}" data-series='${JSON.stringify(s.map((p) => p.v))}' data-days='${JSON.stringify(s.map((p) => p.day))}'>
      <defs><linearGradient id="bkg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${Bc.b}" stop-opacity=".38"/><stop offset="1" stop-color="${Bc.b}" stop-opacity="0"/></linearGradient></defs>
      ${[0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${Wd}" y1="${(pad + 8 + f * (Hd - pad * 2 - 22)).toFixed(1)}" y2="${(pad + 8 + f * (Hd - pad * 2 - 22)).toFixed(1)}" class="bk-grid"/>`).join('')}
      <path d="${area}" fill="url(#bkg)"/><path d="${d}" fill="none" stroke="${Bc.b}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="bk-line"/>
      <circle cx="${L[0].toFixed(1)}" cy="${L[1].toFixed(1)}" r="9" fill="${Bc.b}" opacity=".22"/><circle cx="${L[0].toFixed(1)}" cy="${L[1].toFixed(1)}" r="4.6" fill="${Bc.b}" stroke="var(--card)" stroke-width="2"/>
      <g class="bk-hover" style="display:none"><line y1="0" y2="${Hd}" class="bk-hl"/><circle r="5" fill="${Bc.b}" stroke="var(--card)" stroke-width="2"/></g>
      ${ticks.map((i) => `<text x="${x(i).toFixed(1)}" y="${Hd + 14}" text-anchor="${i === 0 ? 'start' : i === s.length - 1 ? 'end' : 'middle'}" class="bk-tick">${esc(lbl(i))}</text>`).join('')}
    </svg>`;
  }
  function mountChart(el) {
    const svg = el.querySelector('.bk-chart'); if (!svg) return;
    const vals = JSON.parse(svg.dataset.series || '[]'), days = JSON.parse(svg.dataset.days || '[]'), tip = el.querySelector('.bk-tip');
    const hov = svg.querySelector('.bk-hover'), line = hov.querySelector('line'), dot = hov.querySelector('circle');
    const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(1, hi - lo);
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, i = Math.round(Math.max(0, Math.min(1, (fx * 345 - 6) / 333)) * (vals.length - 1));
      const x = 6 + (i / Math.max(1, vals.length - 1)) * 333, y = 14 + (1 - (vals[i] - lo) / span) * 94;
      hov.style.display = ''; line.setAttribute('x1', x); line.setAttribute('x2', x); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      if (tip) { tip.textContent = `${os.dayLabel(days[i], { short: true })} · ${$(vals[i])}`; tip.style.opacity = 1; }
    });
    svg.addEventListener('pointerleave', () => { hov.style.display = 'none'; if (tip) tip.style.opacity = 0; });
  }

  // ---------------------------------------------------------------- unlock (look only: no biometrics)
  function lockOverlay(app, then) {
    const Bc = brand();
    const el = os.h(`<div class="bk-lock" style="--a:${Bc.a};--b:${Bc.b};--c:${Bc.c}">
      <div class="bk-lock-brand">${Bc.logo ? `<img src="${Bc.logo}" alt="">` : G.dollar}<b>${esc(Bc.short)}</b></div>
      <div class="bk-face"><svg viewBox="0 0 100 100">
        <path class="bk-fc" d="M30 8H18A10 10 0 008 18v12M70 8h12a10 10 0 0110 10v12M30 92H18A10 10 0 018 82V70M70 92h12a10 10 0 0010-10V70"/>
        <g class="bk-ff"><path d="M36 38v6M64 38v6"/><path d="M50 38v16h-4"/><path d="M38 66c7 6 17 6 24 0"/></g>
        <path class="bk-fk" d="M30 52l13 13 27-29"/></svg><i class="bk-scan"></i></div>
      <div class="bk-lock-t">Face Unlock</div></div>`);
    app.el.appendChild(el);
    const done = () => { if (!el.isConnected || el.classList.contains('out')) return; el.classList.add('out'); unlockedUntil = performance.now() + 180000; if (app.overlay === el) app.overlay = null; setTimeout(() => el.remove(), 420); os.refocus(); then?.(); };
    setTimeout(() => el.classList.add('scan'), 60);
    setTimeout(() => { el.classList.add('ok'); os.sound('confirm', 0.5); }, 760);
    setTimeout(done, 1180);
    el.addEventListener('click', done);
    el._skip = done;
    app.lock = el;
    os.overlay(app, el, done);
  }

  // ---------------------------------------------------------------- tab bar
  const TABS = [['home', 'Home', G.home], ['activity', 'Activity', G.list], ['pay', 'Pay', G.send], ['card', 'Card', G.card]];
  function tabbar(app) {
    const el = os.h(`<nav class="bk-tabs kp-persist">${TABS.map(([id, n, g]) => `<button class="bk-tab ${id === 'home' ? 'on' : ''}" data-tab="${id}" data-f>${g}<span>${n}</span></button>`).join('')}</nav>`);
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) switchTab(app, b.dataset.tab); });
    return el;
  }
  function switchTab(app, t) {
    if (app.tab === t && app.stack.length === 1) { app.stack[0]?.querySelector('.kp-scroll')?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    app.tab = t;
    app.el.querySelectorAll('.bk-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    while (app.stack.length > 1) os.pop({ instant: true });
    os.replaceTop(root(t, app));
    os.sound('tick', 0.5);
  }
  function syncDepth(app) { app.el.classList.toggle('deep', app.stack.length > 1); }

  // ---------------------------------------------------------------- roots
  function root(t, app) { return t === 'activity' ? activityPage(app) : t === 'pay' ? payPage(app) : t === 'card' ? cardPage(app) : homePage(app); }
  function greeting() { const h = Number(game.time?.hour ?? game.timeOfDay ?? 12); return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  const tabAct = () => ({});

  function homePage(app) {
    const Bc = brand(), tot = checking() + savings(), wk = weekTotals(), fines = (() => { try { return game.fines?.list?.({ unpaid: true }) || []; } catch (e) { return []; } })();
    const owed = fines.reduce((s, f) => s + (Number(f.amount) || 0), 0);
    const recent = activity({ limit: 5 });
    const [whole, cents] = $(tot).split('.');
    const unread = os.data.unread('bank');
    return {
      nav: false, cls: 'bk-home', status: 'light',
      body: `<div class="bk-hero" style="--a:${Bc.a};--b:${Bc.b};--c:${Bc.c}">
          <div class="bk-top"><div class="bk-brand">${Bc.logo ? `<img src="${Bc.logo}" alt="">` : G.dollar}<b>${esc(Bc.short)}</b></div>
            <button class="bk-ic" data-act="alerts" data-f>${G.bell}${unread ? '<em></em>' : ''}</button><span class="bk-me">N</span></div>
          <div class="bk-greet">${greeting()}, Nico</div>
          <div class="bk-total-l">Total balance</div>
          <div class="bk-total" data-total="${tot}">${esc(whole)}<span>.${esc(cents || '00')}</span></div>
          <div class="bk-deltas"><span class="up">${G.deposit}${$(wk.in)} in</span><span class="down">${G.withdraw}${$(wk.out)} out</span><small>last 7 days</small></div>
        </div>
        <div class="bk-card bk-chartcard">
          <div class="bk-chart-h"><b>Balance</b><span class="bk-tip"></span><div class="kp-seg bk-range">${[7, 14, 30].map((d) => `<button data-act="range" data-d="${d}" data-f class="${d === chartDays ? 'on' : ''}">${d}D</button>`).join('')}</div></div>
          <div class="bk-chart-w">${chartSVG(chartDays)}</div>
        </div>
        <div class="bk-actions">
          ${[['send', 'Send', G.send], ['transfer', 'Transfer', G.transfer], ['atm', 'Deposit', G.deposit], ['atmw', 'Withdraw', G.withdraw]].map(([a, n, g]) => `<button class="bk-act" data-act="${a}" data-f><i>${g}</i><span>${n}</span></button>`).join('')}
        </div>
        ${fines.length ? `<div class="bk-alertcard" data-act="fines" data-f><span class="kp-tile" style="--tile:var(--red)">${G.ticket}</span><span class="kp-row-t"><b>${fines.length} ticket${fines.length > 1 ? 's' : ''} to pay</b><small>${$(owed)} due${fines.some((f) => f.overdue) ? ' · overdue' : ''}</small></span><span class="bk-pill">Pay</span></div>` : ''}
        <div class="kp-sec-h"><b>Accounts</b></div>
        ${os.rowsHTML([
          { icon: G.card, tile: Bc.a, title: ACC.checking, sub: `•••• ${acctNo('checking')} · Available`, value: $(checking()), valueCls: 'strong', act: 'acct', data: { k: 'checking' } },
          { icon: G.sparkle, tile: '#18a971', title: ACC.savings, sub: `•••• ${acctNo('savings')} · ${((B()?.savingsApy || 0.042) * 100).toFixed(2)}% APY`, value: $(savings()), valueCls: 'strong', act: 'acct', data: { k: 'savings' } },
          { icon: G.bills, tile: '#2fa36b', title: 'Cash on hand', sub: 'In your pocket · not insured', value: $(cash()), valueCls: 'strong', act: 'acct', data: { k: 'cash' } },
        ])}
        <div class="kp-sec-h"><b>Recent activity</b><button data-act="seeall" data-f>See all</button></div>
        ${recent.length ? os.rowsHTML(recent.map(txRow)) : `<div class="kp-group"><div class="kp-empty" style="padding:26px">No activity yet.</div></div>`}
        <div class="bk-legal">${esc(Bc.name)} · Deposits held in Southline, FL · Rates may change</div>`,
      acts: {
        ...tabAct(app),
        send: () => sendFlow(app), transfer: () => os.push(transferPage(app)), atm: () => os.push(atmPage(app, 'deposit')), atmw: () => os.push(atmPage(app, 'withdraw')),
        fines: () => os.push(finesPage(app)), acct: (el) => os.push(accountPage(app, el.dataset.k)), seeall: () => switchTab(app, 'activity'),
        tx: (el) => txSheet(Number(el.dataset.i)), alerts: () => { os.closeApp(); setTimeout(() => os.openApp('messages', { thread: 'bank' }), 60); },
        range: (el) => { chartDays = Number(el.dataset.d); const top = app.stack[0]; top.querySelector('.bk-chart-w').innerHTML = chartSVG(chartDays); top.querySelectorAll('.bk-range button').forEach((b) => b.classList.toggle('on', Number(b.dataset.d) === chartDays)); mountChart(top); },
      },
      mount: (el) => {
        mountChart(el); countUp(el);
        // compact glass header once the hero scrolls away (status bar text turns dark on a light page)
        el.insertAdjacentHTML('beforeend', `<div class="bk-sticky"><b>${esc(Bc.short)}</b><span>${$(tot)}</span></div>`);
        const sc = el.querySelector('.kp-scroll');
        sc.addEventListener('scroll', () => { const on = sc.scrollTop > 210; if (on !== el.classList.contains('stuck')) { el.classList.toggle('stuck', on); el.dataset.status = on && os.theme === 'light' ? 'dark' : 'light'; os.statusRefresh(); } }, { passive: true });
      },
      onShow: (el, o) => { syncDepth(app); if (o?.back) refreshRoot(app); },
    };
  }
  function countUp(el) {
    const t = el.querySelector('.bk-total'); if (!t) return;
    const to = Number(t.dataset.total) || 0, from = shownTotal ?? to * 0.92; shownTotal = to;
    if (Math.abs(to - from) < 0.005) return;
    const t0 = performance.now(), D = 900;
    const step = (now) => { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e; const [w, c] = $(v).split('.'); t.innerHTML = `${esc(w)}<span>.${esc(c || '00')}</span>`; if (k < 1 && t.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function refreshRoot(app) { if (app.stack.length !== 1 || !app.tab) return; const sc = app.stack[0].querySelector('.kp-scroll')?.scrollTop || 0; const el = os.replaceTop(root(app.tab, app)); const s2 = el?.querySelector('.kp-scroll'); if (s2) s2.scrollTop = sc; }

  function activityPage(app, filter = 'all') {
    const wk = weekTotals(), list = activity({ filter: filter === 'all' ? null : filter, limit: 120 });
    const mx = Math.max(1, wk.in, wk.out);
    return {
      title: 'Activity', large: true, back: false,
      body: `<div class="bk-card bk-week"><div><small>Money in · 7 days</small><b class="pos">${$(wk.in)}</b><i style="--w:${(wk.in / mx * 100).toFixed(1)}%" class="in"></i></div><div><small>Money out · 7 days</small><b>${$(wk.out)}</b><i style="--w:${(wk.out / mx * 100).toFixed(1)}%" class="out"></i></div></div>
        <div class="kp-chips">${[['all', 'All'], ['in', 'Money in'], ['out', 'Money out'], ['cash', 'Cash']].map(([k, n]) => `<button class="kp-chip ${k === filter ? 'on' : ''}" data-act="filter" data-k="${k}" data-f>${n}</button>`).join('')}</div>
        ${groupedActivity(list)}`,
      acts: { ...tabAct(app), filter: (el) => { os.replaceTop(activityPage(app, el.dataset.k)); }, tx: (el) => txSheet(Number(el.dataset.i)) },
      onShow: () => syncDepth(app),
    };
  }

  function payPage(app) {
    const u = os.wire.usage(), L = os.wire.LIMITS, rec = os.data.S.recents.map((id) => os.data.contact(id)).filter(Boolean).slice(0, 6);
    const fines = (() => { try { return game.fines?.list?.({ unpaid: true }) || []; } catch (e) { return []; } })();
    return {
      title: 'Pay & transfer', large: true, back: false,
      body: `${rec.length ? `<div class="bk-recents">${rec.map((c) => `<button class="bk-rec" data-act="to" data-id="${esc(c.id)}" data-f>${os.contactAvatar(c, 56)}<span>${esc(c.name.replace(/^"[^"]*"\s*/, '').split(' ')[0])}</span></button>`).join('')}</div>` : ''}
        ${os.rowsHTML([
          { icon: G.send, tile: '#5b6cff', title: 'Send to a contact', sub: 'Instant and free', act: 'send' },
          { icon: G.bills, tile: '#0e8f7e', title: 'Wire to an account', sub: `Routing and account number · ${$(L.wire.fee)} fee`, act: 'wire' },
          { icon: G.transfer, tile: '#7c8494', title: 'Transfer between accounts', sub: 'Checking and savings', act: 'transfer' },
          { icon: G.ticket, tile: '#e5484d', title: 'Pay tickets', sub: fines.length ? `${fines.length} due` : 'Nothing due', act: 'fines' },
          { icon: G.deposit, tile: '#2fa36b', title: 'Deposit or withdraw cash', sub: os.atmNearby() ? 'ATM connected' : 'ATM, or mobile deposit', act: 'atm' },
        ])}
        <div class="kp-sec">Today's limits</div>
        <div class="kp-group bk-limits">
          ${limitRow('Instant to contacts', u.instant, L.instant.daily)}
          ${limitRow('Wire transfers', u.wire, L.wire.daily)}
          ${(() => { const a = B()?.atm?.({}) || {}; return limitRow('ATM withdrawals', 1000 - (Number(a.withdrawLimitLeft) || 0), 1000); })()}
        </div>
        <div class="kp-foot">Limits reset at midnight, game time. Instant payments arrive right away; wires within minutes.</div>`,
      acts: { ...tabAct(app), send: () => sendFlow(app), wire: () => os.push(accountEntryPage(app)), transfer: () => os.push(transferPage(app)), fines: () => os.push(finesPage(app)), atm: () => os.push(atmPage(app)), to: (el) => { const c = os.data.contact(el.dataset.id); if (c) os.push(amountPage(app, c)); } },
      onShow: () => syncDepth(app),
    };
  }
  function limitRow(label, used, max) {
    const f = Math.max(0, Math.min(1, used / max));
    return `<div class="kp-row bk-limit"><span class="kp-row-t"><b>${label}</b><small>${$(Math.max(0, max - used), { cents: false })} of ${$(max, { cents: false })} left</small><i style="--w:${(f * 100).toFixed(1)}%"></i></span></div>`;
  }

  function cardPage(app) {
    const Bc = brand(), c = B()?.card || { last4: '0000', frozen: false, dailyLimit: 5000, spentToday: 0 };
    const f = Math.min(1, (c.spentToday || 0) / (c.dailyLimit || 5000)), atm = B()?.atm?.({}) || { withdrawLimitLeft: 1000 };
    return {
      title: 'Card', large: true, back: false,
      body: `<div class="bk-cardart ${c.frozen ? 'frozen' : ''}" style="--a:${Bc.a};--b:${Bc.b};--c:${Bc.c}">
          <div class="bk-ca-top">${Bc.logo ? `<img src="${Bc.logo}" alt="">` : ''}<b>${esc(Bc.short)}</b><span>DEBIT</span></div>
          <i class="bk-chip"></i><svg class="bk-tap" viewBox="0 0 24 24">${'<path d="M8 6a9 9 0 010 12M12 4a12 12 0 010 16M16 2a15 15 0 010 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'}</svg>
          <div class="bk-ca-num">•••• •••• •••• ${esc(c.last4)}</div>
          <div class="bk-ca-bot"><span>NICO</span><span>12/29</span></div>
          ${c.frozen ? `<div class="bk-ca-frost">${G.snow}<b>Frozen</b></div>` : ''}
        </div>
        ${os.rowsHTML([
          { icon: G.snow, tile: '#4aa3ff', title: 'Freeze card', sub: c.frozen ? 'Card payments are declined' : 'Stop card payments right away', right: `<span class="kp-switch ${c.frozen ? 'on' : ''}"></span>`, act: 'freeze', chevron: false },
        ])}
        <div class="kp-sec">Today</div>
        <div class="kp-group">${limitRow('Card spending', c.spentToday || 0, c.dailyLimit || 5000)}${limitRow('ATM withdrawals', 1000 - (Number(atm.withdrawLimitLeft) || 0), 1000)}</div>
        <div class="kp-foot">Card payments leave a trail. While you are wanted, the police can follow where your card was used. Cash leaves none.</div>`,
      acts: { ...tabAct(app), freeze: () => { try { B()?.freezeCard?.(!c.frozen, c.frozen ? null : 'player'); } catch (e) { /* */ } os.sound(c.frozen ? 'select' : 'confirm', 0.5); os.replaceTop(cardPage(app)); } },
      onShow: () => syncDepth(app),
    };
  }

  // ---------------------------------------------------------------- account details
  function accountPage(app, k) {
    const Bc = brand(), bal = k === 'checking' ? checking() : k === 'savings' ? savings() : cash();
    const list = k === 'cash' ? activity({ filter: 'cash', limit: 60 }) : activity({ limit: 200 }).filter((e) => (e.merged ? e.to === k || e.from === k : e.account === k)).slice(0, 60);
    let extra = '';
    if (k === 'checking') extra = os.rowsHTML([{ title: 'Routing number', value: `<span class="bk-mono">${esc(routing())}</span>` }, { title: 'Account number', value: `<span class="bk-mono bk-reveal" data-act="reveal" data-f>•••• ${acctNo('checking')}</span>` }]);
    if (k === 'savings') { const acc = Number(game.systems?.money?.raw?.interestAccrued || 0) / 100; extra = os.rowsHTML([{ title: 'Interest rate', value: `${((B()?.savingsApy || 0.042) * 100).toFixed(2)}% APY` }, { title: 'Interest accrued', value: $(acc), sub: 'Paid on Mondays' }]); }
    if (k === 'cash') {
      const hot = Number(Wl()?.hot) || 0, lossK = Number(game.difficulty?.cashLossOnDeath ?? 0.5);
      extra = os.rowsHTML([{ icon: G.alert, tile: '#e5484d', title: 'If you go down', sub: `You lose about ${Math.round(lossK * 100)}% of the cash you carry`, value: $(cash() * lossK) }, ...(hot > 0 ? [{ icon: G.shield, tile: '#3e7bd6', title: 'Hot cash', sub: 'From crime. Seized if you are arrested', value: $(hot) }] : [])]);
    }
    return {
      title: k === 'cash' ? 'Cash on hand' : ACC[k], back: 'Home', cls: 'bk-acct',
      body: `<div class="bk-acct-h"><small>${k === 'cash' ? 'In your pocket' : 'Available balance'}</small><b>${$(bal)}</b>${k !== 'cash' ? `<span>${esc(Bc.name)} · •••• ${acctNo(k)}</span>` : ''}</div>
        <div class="bk-acct-btns">${k === 'cash' ? `<button class="kp-btn" data-act="dep" data-f>${G.deposit}Deposit cash</button>` : `<button class="kp-btn" data-act="xfer" data-f>${G.transfer}Transfer</button>${k === 'checking' ? `<button class="kp-btn sec" data-act="send" data-f>${G.send}Send</button>` : ''}`}</div>
        ${extra}<div class="kp-sec-h"><b>Activity</b></div>${groupedActivity(list)}`,
      acts: { xfer: () => os.push(transferPage(app, k === 'savings' ? 'savings' : 'checking')), send: () => sendFlow(app), dep: () => os.push(atmPage(app, 'deposit')), tx: (el) => txSheet(Number(el.dataset.i)), reveal: (el) => { el.textContent = fullAcct(); el.classList.add('shown'); } },
      onShow: () => syncDepth(app),
    };
  }
  const routing = () => { const map = { 'Unison Bank': '063107513', 'Banco Almendares': '066011392', 'Cormorant Trust': '067014822' }; return map[brand().name] || '063100277'; };
  const fullAcct = () => `${String(Number(last4()) * 7919 % 1e6).padStart(6, '0')}${last4()}`;

  // ---------------------------------------------------------------- transaction detail
  function txSheet(id) {
    const e = activity({ limit: 400 }).find((x) => x.id === id) || ledger().find((x) => x.id === id); if (!e) return;
    const [g, col] = e.merged ? [/withdraw/i.test(e.memo) ? 'withdraw' : 'deposit', '#7c8494'] : categoryLook(e);
    const amt = e.merged ? e.display : e.amount;
    const c = e.category === 'wire' ? os.data.contacts().find((x) => x.name === e.party) : null;
    os.sheet({
      title: '', cls: 'bk-txsheet',
      body: `<div class="bk-tx-h"><span class="kp-tile big" style="--tile:${col}">${G[g] || G.bag}</span><b class="${amt > 0 && !e.merged ? 'pos' : ''}">${e.merged ? $(amt) : $(amt, { sign: true })}</b><span>${esc(title(e))}</span><small>${esc(os.dayLabel(e.day))}, ${esc(os.clock(((e.t % 1440) + 1440) % 1440 / 60))}</small></div>
        ${os.rowsHTML([
          { title: 'Status', value: '<span class="bk-ok">Posted</span>' },
          { title: 'Account', value: esc(e.merged ? `${ACC[e.from] || e.from} → ${ACC[e.to] || e.to}` : ACC[e.account] || e.account) },
          { title: 'Category', value: esc(cap(e.category)) },
          ...(e.memo && e.memo !== title(e) ? [{ title: 'Memo', value: esc(e.memo) }] : []),
          ...(e.place ? [{ title: 'Where', value: esc(e.place) }] : []),
          { title: 'Method', value: esc(cap(e.method || 'bank')) },
          ...(e.account !== 'cash' || e.merged ? [{ title: 'Balance after', value: $(e.balance) }] : []),
          { title: 'Reference', value: `<span class="bk-mono">${String(e.id).padStart(8, '0')}</span>` },
        ])}
        ${c ? `<div class="kp-btns"><button class="kp-btn" data-act="again" data-f>${G.send}Send ${esc(c.name.split(' ')[0])} money again</button></div>` : ''}`,
      acts: { again: () => { os.closeSheet(true); if (c) os.push(amountPage(os.app, c)); } },
    });
  }

  // ---------------------------------------------------------------- send money
  function sendFlow(app) { os.push(recipientPage(app)); }
  function recipientPage(app, q = '') {
    const all = os.data.contacts().filter((c) => c.kind !== 'payee');
    const payees = os.data.contacts().filter((c) => c.kind === 'payee');
    const rec = os.data.S.recents.map((id) => os.data.contact(id)).filter(Boolean).slice(0, 5);
    const match = (c) => !q || (c.name + ' ' + (c.role || '')).toLowerCase().includes(q.toLowerCase());
    const people = all.filter((c) => c.kind !== 'staff' && match(c)).sort((a, b) => a.name.replace(/^\W+/, '').localeCompare(b.name.replace(/^\W+/, ''))), staff = all.filter((c) => c.kind === 'staff' && match(c));
    const row = (c) => ({ avatar: os.contactAvatar(c, 40), title: esc(c.name), sub: esc(c.kind === 'payee' ? `Wire · ${c.account}` : c.role || c.number), act: 'pick', data: { id: c.id }, chevron: false });
    return {
      title: 'Send money', back: 'Cancel', cls: 'bk-pick',
      body: `<div class="kp-search">${G.search}<input class="kp-input" placeholder="Name or role" value="${esc(q)}" data-f data-autofocus></div>
        ${!q && rec.length ? `<div class="bk-recents">${rec.map((c) => `<button class="bk-rec" data-act="pick" data-id="${esc(c.id)}" data-f>${os.contactAvatar(c, 56)}<span>${esc(c.name.replace(/^"[^"]*"\s*/, '').split(' ')[0])}</span></button>`).join('')}</div>` : ''}
        ${os.rowsHTML([{ icon: G.bills, tile: '#0e8f7e', title: 'Wire to an account number', sub: `Any bank · ${$(os.wire.LIMITS.wire.fee)} fee`, act: 'acct' }])}
        ${people.length ? `<div class="kp-sec">Contacts</div>${os.rowsHTML(people.map(row))}` : ''}
        ${staff.length ? `<div class="kp-sec">Your staff</div>${os.rowsHTML(staff.map(row))}` : ''}
        ${payees.filter(match).length ? `<div class="kp-sec">Saved accounts</div>${os.rowsHTML(payees.filter(match).map(row))}` : ''}
        ${!people.length && !staff.length && q ? `<div class="kp-empty"><b>No matches</b>Try a different name.</div>` : ''}`,
      acts: { pick: (el) => { const c = os.data.contact(el.dataset.id); if (c) os.push(amountPage(app, c)); }, acct: () => os.push(accountEntryPage(app)) },
      mount: (el) => {
        const inp = el.querySelector('input');
        inp.addEventListener('input', () => { const v = inp.value; clearTimeout(inp._t); inp._t = setTimeout(() => { const n = os.replaceTop(recipientPage(app, v)); const i2 = n.querySelector('input'); i2.focus(); i2.setSelectionRange(v.length, v.length); }, 160); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
      },
      onShow: () => syncDepth(app),
    };
  }
  function accountEntryPage(app) {
    let nameV = '', rtV = '', acV = '', save = true;
    const valid = () => nameV.trim().length >= 2 && /^\d{9}$/.test(rtV) && os.wire && abaOk(rtV) && /^\d{4,17}$/.test(acV);
    return {
      title: 'Wire to an account', back: 'Back', cls: 'bk-acctentry',
      body: `<div class="bk-form">
          <label>Recipient name<input class="kp-input" data-k="name" placeholder="Full name or business" data-f data-autofocus></label>
          <label>Routing number<input class="kp-input bk-mono" data-k="rt" inputmode="numeric" maxlength="9" placeholder="9 digits" data-f><em class="bk-hint" data-for="rt"></em></label>
          <label>Account number<input class="kp-input bk-mono" data-k="ac" inputmode="numeric" maxlength="17" placeholder="4 to 17 digits" data-f></label>
        </div>
        ${os.rowsHTML([{ title: 'Save this account', sub: 'Shows up in Send money next time', right: '<span class="kp-switch on"></span>', act: 'save', chevron: false }])}
        <div class="kp-foot">Wires cost ${$(os.wire.LIMITS.wire.fee)} and allow up to ${$(os.wire.LIMITS.wire.perTransfer, { cents: false })} per transfer. Check the numbers: sent wires cannot be recalled.</div>
        <div class="kp-btns"><button class="kp-btn" data-act="next" data-f disabled>Continue</button></div>`,
      acts: {
        save: (el) => { save = !save; el.querySelector('.kp-switch').classList.toggle('on', save); },
        next: () => {
          if (!valid()) return;
          const id = os.data.addPayee({ name: nameV.trim(), routing: rtV, accountNo: acV });
          const c = os.data.contact(id);
          if (!save) { os.data.S.payees = os.data.S.payees.filter((p) => p.id !== id); c.temp = true; }
          os.push(amountPage(app, { ...c, payee: true, kind: 'payee' }));
        },
      },
      mount: (el) => {
        const btn = el.querySelector('[data-act="next"]'), hint = el.querySelector('.bk-hint');
        el.querySelectorAll('input').forEach((inp) => {
          inp.addEventListener('input', () => {
            if (inp.dataset.k !== 'name') inp.value = inp.value.replace(/\D/g, '');
            if (inp.dataset.k === 'name') nameV = inp.value; if (inp.dataset.k === 'rt') rtV = inp.value; if (inp.dataset.k === 'ac') acV = inp.value;
            hint.textContent = rtV.length === 9 ? (abaOk(rtV) ? 'Valid routing number' : 'That routing number is not valid') : '';
            hint.className = 'bk-hint ' + (rtV.length === 9 ? (abaOk(rtV) ? 'ok' : 'bad') : '');
            btn.disabled = !valid();
          });
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
        });
      },
      onShow: () => syncDepth(app),
    };
  }
  const abaOk = (r) => { const d = [...String(r)].map(Number); return d.length === 9 && (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0; };

  /** Amount entry with a keypad. kind: 'send' (contact c) | 'transfer' | 'atm' */
  function amountModel(onChange) {
    let s = '';
    return {
      get s() { return s; }, get v() { return Number(s || 0); },
      key(k) {
        const before = s;
        if (k === 'del') s = s.slice(0, -1);
        else if (k === '.') { if (!s.includes('.')) s = (s || '0') + '.'; }
        else if (/^\d$/.test(k)) { if (s.includes('.') && s.split('.')[1].length >= 2) return false; if (s === '0') s = k; else if (s.replace('.', '').length < 9) s += k; }
        if (s !== before) { onChange(); return true; }
        return false;
      },
      set(v) { s = String(v); onChange(); },
    };
  }
  function amountPage(app, c) {
    let m, el0;
    const paint = () => {
      const q = os.wire.quote(c, m.v), big = el0.querySelector('.bk-amt'), msg = el0.querySelector('.bk-amt-msg'), btn = el0.querySelector('[data-act="next"]');
      big.textContent = os.amountText(m.s);
      big.classList.toggle('long', m.s.length > 6);
      const bad = m.v > 0 && !q.ok;
      big.classList.toggle('bad', bad);
      msg.textContent = !m.v ? `${$(q.available)} available` : bad ? os.wire.reasonText(q.reason) + (q.reason === 'per_transfer' || q.reason === 'daily' ? ` Max ${$(q.max)}.` : '') : q.fee ? `+ ${$(q.fee)} wire fee · ${$(q.available - q.total)} left after` : `${$(q.available - q.total)} left after`;
      msg.classList.toggle('bad', bad);
      btn.disabled = !q.ok;
    };
    const shake = () => { const b = el0.querySelector('.bk-amt'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); os.sound('deny', 0.4); };
    return {
      title: c.kind === 'payee' ? 'Wire transfer' : 'Send', back: 'Back', cls: 'bk-amount',
      body: `<div class="bk-to">${os.contactAvatar(c, 64)}<b>${esc(c.name)}</b><small>${esc(c.kind === 'payee' ? `Routing ${c.routing} · ${c.account}` : `${c.role || ''}${c.number ? ' · ' + c.number : ''}`)}</small></div>
        <div class="bk-amt">$0</div><div class="bk-amt-msg"></div>
        <div class="kp-chips bk-quick">${[20, 50, 100, 500].map((v) => `<button class="kp-chip" data-act="quick" data-v="${v}" data-f>$${v}</button>`).join('')}</div>
        ${os.keypadHTML()}
        <div class="kp-btns bk-next"><button class="kp-btn" data-act="next" data-f disabled>Next</button></div>`,
      acts: {
        key: (el) => { if (!m.key(el.dataset.k)) shake(); else os.sound('tick', 0.35); },
        quick: (el) => { m.set(el.dataset.v); os.sound('tick', 0.4); },
        next: () => { const q = os.wire.quote(c, m.v); if (!q.ok) { shake(); return; } os.push(memoPage(app, c, q.amount)); },
      },
      onDigit: (k) => { if (k === 'del' && !m.s) return false; if (!m.key(k)) shake(); else os.sound('tick', 0.3); return true; },
      mount: (el) => { el0 = el; m = amountModel(paint); paint(); el.querySelector('[data-k="1"]')?.setAttribute('data-autofocus', ''); },
      onShow: () => syncDepth(app),
    };
  }
  function memoPage(app, c, amount) {
    let memo = '';
    const SUG = c.kind === 'staff' ? ['Bonus', 'Great week', 'Thanks for covering'] : c.kind === 'garage' ? ['Coupe repairs', 'Tab', 'Parts'] : c.kind === 'hush' ? ['Consulting', 'Services', 'Misc.'] : c.kind === 'payee' ? ['Invoice', 'Parts', 'Deposit'] : ['Dinner', 'Rent', 'Gas money', 'Gift', 'Thanks'];
    return {
      title: "What's it for?", back: 'Back', cls: 'bk-memo',
      body: `<div class="bk-memo-amt">${$(amount)} <small>to ${esc(c.name)}</small></div>
        <div class="bk-form"><label>Memo<input class="kp-input" maxlength="60" placeholder="Add a note (optional)" data-f data-autofocus></label></div>
        <div class="kp-chips bk-sug">${SUG.map((s) => `<button class="kp-chip" data-act="sug" data-v="${esc(s)}" data-f>${esc(s)}</button>`).join('')}</div>
        <div class="kp-btns"><button class="kp-btn" data-act="next" data-f>Review</button></div>`,
      acts: { sug: (el) => { const i = os.app.stack[os.app.stack.length - 1].querySelector('input'); i.value = el.dataset.v; memo = i.value; os.sound('tick', 0.4); }, next: () => os.push(reviewPage(app, c, amount, memo)) },
      mount: (el) => { const i = el.querySelector('input'); i.addEventListener('input', () => { memo = i.value; }); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { i.blur(); os.push(reviewPage(app, c, amount, memo)); } }); },
      onShow: () => syncDepth(app),
    };
  }
  function reviewPage(app, c, amount, memo) {
    const q = os.wire.quote(c, amount), Bc = brand();
    return {
      title: 'Review', back: 'Back', cls: 'bk-review',
      body: `<div class="bk-rev-amt"><small>You're sending</small><b>${$(q.amount)}</b></div>
        <div class="kp-group bk-rev">
          <div class="kp-row">${os.contactAvatar(c, 40)}<span class="kp-row-t"><small>To</small><b>${esc(c.name)}</b></span><span class="kp-row-v">${esc(c.kind === 'payee' ? c.account : 'Contact')}</span></div>
          <div class="kp-row"><span class="kp-tile" style="--tile:${Bc.a}">${G.card}</span><span class="kp-row-t"><small>From</small><b>${ACC.checking}</b></span><span class="kp-row-v">•••• ${acctNo('checking')}</span></div>
        </div>
        ${os.rowsHTML([
          { title: 'Amount', value: $(q.amount) },
          { title: q.kind === 'wire' ? 'Wire fee' : 'Fee', value: q.fee ? $(q.fee) : 'Free' },
          { title: 'Total', value: `<b>${$(q.total)}</b>`, valueCls: 'strong' },
          { title: 'Arrives', value: esc(q.arrives) },
          ...(memo ? [{ title: 'Memo', value: esc(memo) }] : []),
        ])}
        ${q.hook ? `<div class="bk-hookline">${G.sparkle}<span>${esc(q.hook)}</span></div>` : ''}
        ${!q.ok ? `<div class="bk-hookline bad">${G.alert}<span>${esc(os.wire.reasonText(q.reason))}</span></div>` : ''}
        <div class="bk-slide ${q.ok ? '' : 'disabled'}" data-hold data-f data-autofocus><i class="bk-slide-fill"></i><span class="bk-slide-t">Slide to send</span><b class="bk-knob">${G.send}</b></div>
        <div class="bk-slide-hint">Drag, or hold Enter / A</div>`,
      mount: (el) => mountSlider(el.querySelector('.bk-slide'), () => doSend(app, c, amount, memo)),
      onShow: () => syncDepth(app),
    };
  }
  function mountSlider(sl, onDone) {
    if (!sl || sl.classList.contains('disabled')) return;
    const knob = sl.querySelector('.bk-knob'), fill = sl.querySelector('.bk-slide-fill'), txt = sl.querySelector('.bk-slide-t');
    let p = 0, holding = false, dragging = false, done = false, raf = 0;
    const span = () => sl.clientWidth - knob.offsetWidth - 8;
    const paint = () => { knob.style.transform = `translateX(${(p * span()).toFixed(1)}px)`; fill.style.width = `${(p * span() + knob.offsetWidth + 4).toFixed(1)}px`; txt.style.opacity = String(Math.max(0, 1 - p * 1.8)); };
    const finish = () => { if (done) return; done = true; p = 1; paint(); sl.classList.add('done'); os.sound('confirm', 0.6); cancelAnimationFrame(raf); setTimeout(onDone, 160); };
    const loop = () => {
      raf = 0; if (done || !sl.isConnected) return;
      if (holding) { if (os.isHeld()) p = Math.min(1, p + 0.024); else holding = false; }
      if (!holding && !dragging) p = Math.max(0, p - 0.06);
      paint();
      if (p >= 1) { finish(); return; }
      if (holding || dragging || p > 0) raf = requestAnimationFrame(loop);
    };
    sl._hold = () => { if (done) return; holding = true; if (!raf) raf = requestAnimationFrame(loop); };
    knob.addEventListener('pointerdown', (e) => {
      if (done) return; e.preventDefault(); dragging = true; const x0 = e.clientX, p0 = p, k = sl.getBoundingClientRect().width / sl.clientWidth;
      const mv = (ev) => { p = Math.max(0, Math.min(1, p0 + (ev.clientX - x0) / k / span())); paint(); if (p >= 0.97) { up(); finish(); } };
      const up = () => { dragging = false; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (!done && !raf) raf = requestAnimationFrame(loop); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    requestAnimationFrame(paint);
  }
  function doSend(app, c, amount, memo) {
    os.island({ l: '<span class="kp-isl-spin"></span>Sending', r: `<span class="kp-isl-dim">${esc($(amount))}</span>`, cls: 'job' });
    const wait = os.h(`<div class="bk-sending"><span class="bk-ring"></span><b>Sending ${esc($(amount))}</b><small>to ${esc(c.name)}</small></div>`);
    app.el.appendChild(wait);
    setTimeout(() => {
      const r = os.wire.send(c, amount, memo);
      wait.classList.add('out'); setTimeout(() => wait.remove(), 300);
      os.island(r.ok ? { l: `<span class="bk-isl-ok">${G.check}</span>Sent`, r: `<span class="kp-isl-dim">${esc($(amount))}</span>`, cls: 'job' } : null);
      setTimeout(() => os.island(null), 2600);
      while (app.stack.length > 1) os.pop({ instant: true });
      if (r.ok) {
        os.push(successPage(app, c, r), { sound: false });
        if (r.reply && c.kind !== 'payee') setTimeout(() => os.data.addMessage(c.id, r.reply), 5200 + Math.random() * 3000);
        if (r.effect) setTimeout(() => os.toast(r.effect, 'good'), 900);
      } else os.push(failPage(app, c, amount, r), { sound: false });
      if (app.tab && app.stack[0]) { const n = os.page(root(app.tab, app)); app.stack[0].replaceWith(n); app.stack[0] = n; n.classList.add('under'); }
    }, 900);
  }
  function successPage(app, c, r) {
    return {
      nav: false, cls: 'bk-done', status: os.theme === 'dark' ? 'light' : 'dark',
      body: `<div class="bk-ok-wrap"><svg class="bk-okmark" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50"/><path d="M38 62l15 15 30-34"/></svg>
          <div class="bk-burst">${Array.from({ length: 14 }, (_, i) => `<i style="--a:${i * 25.7}deg;--d:${(i % 3) * 0.05}s"></i>`).join('')}</div></div>
        <div class="bk-ok-t"><small>Sent</small><b>${$(r.quote.amount)}</b><span>to ${esc(c.name)}</span></div>
        <div class="bk-ok-meta">${esc(r.quote.label)} · ${esc(r.quote.arrives)}<br>Confirmation <span class="bk-mono">${esc(r.confirmation)}</span></div>
        <div class="kp-btns bk-ok-btns"><button class="kp-btn sec" data-act="receipt" data-f>View receipt</button><button class="kp-btn" data-act="done" data-f data-autofocus>Done</button></div>`,
      acts: { receipt: () => os.push(receiptPage(app, c, r)), done: () => { while (app.stack.length > 1) os.pop({ instant: app.stack.length > 2 }); } },
      onBack: () => { while (app.stack.length > 1) os.pop({ instant: app.stack.length > 2 }); return true; },
      onShow: () => syncDepth(app),
    };
  }
  function receiptPage(app, c, r) {
    const Bc = brand(), q = r.quote, day = Math.floor(r.at / 1440) + 1;
    return {
      title: 'Receipt', back: 'Back', cls: 'bk-receipt',
      body: `<div class="bk-paper"><div class="bk-p-h" style="--a:${Bc.a};--c:${Bc.c}">${Bc.logo ? `<img src="${Bc.logo}" alt="">` : ''}<b>${esc(Bc.name)}</b></div>
          <div class="bk-p-amt">${$(q.amount)}</div><div class="bk-p-st"><span class="bk-ok">${G.check}Completed</span></div>
          <dl>
            <dt>To</dt><dd>${esc(c.name)}${c.kind === 'payee' ? `<br><span class="bk-mono">${esc(c.routing)} · ${esc(c.account)}</span>` : ''}</dd>
            <dt>From</dt><dd>${ACC.checking}<br><span class="bk-mono">•••• ${acctNo('checking')}</span></dd>
            <dt>Date</dt><dd>${esc(os.dayLabel(day))}, ${esc(os.clock(((r.at % 1440) + 1440) % 1440 / 60))}</dd>
            <dt>Type</dt><dd>${esc(q.label)}</dd>
            <dt>Fee</dt><dd>${q.fee ? $(q.fee) : 'Free'}</dd>
            ${r.memo ? `<dt>Memo</dt><dd>${esc(r.memo)}</dd>` : ''}
            <dt>Balance after</dt><dd>${$(r.after)}</dd>
            <dt>Confirmation</dt><dd class="bk-mono">${esc(r.confirmation)}</dd>
          </dl>
          <div class="bk-p-bar">${Array.from({ length: 46 }, (_, i) => `<i style="width:${1 + ((i * 7 + r.confirmation.charCodeAt(i % r.confirmation.length)) % 3)}px"></i>`).join('')}</div>
          <div class="bk-p-f">Keep this receipt for your records.</div></div>
        <div class="kp-btns"><button class="kp-btn" data-act="done" data-f data-autofocus>Done</button></div>`,
      acts: { done: () => { while (app.stack.length > 1) os.pop({ instant: app.stack.length > 2 }); } },
      onShow: () => syncDepth(app),
    };
  }
  function failPage(app, c, amount, r) {
    return {
      nav: false, cls: 'bk-done bk-fail', status: os.theme === 'dark' ? 'light' : 'dark',
      body: `<div class="bk-ok-wrap"><svg class="bk-okmark bad" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50"/><path d="M42 42l36 36M78 42L42 78"/></svg></div>
        <div class="bk-ok-t"><small>Not sent</small><b>${$(amount)}</b><span>to ${esc(c.name)}</span></div>
        <div class="bk-ok-meta">${esc(r.reasonText)}<br>No money left your account.</div>
        <div class="kp-btns bk-ok-btns"><button class="kp-btn sec" data-act="retry" data-f>Change amount</button><button class="kp-btn" data-act="done" data-f data-autofocus>Done</button></div>`,
      acts: { retry: () => { os.pop({ instant: true }); os.push(amountPage(app, c)); }, done: () => { while (app.stack.length > 1) os.pop({ instant: app.stack.length > 2 }); } },
      onShow: () => syncDepth(app),
    };
  }

  // ---------------------------------------------------------------- transfer between accounts
  function transferPage(app, from = 'checking') {
    let m, el0, dir = from === 'savings' ? ['savings', 'checking'] : ['checking', 'savings'];
    const bal = (k) => (k === 'checking' ? checking() : savings());
    const paint = () => {
      el0.querySelector('.bk-x-from b').textContent = ACC[dir[0]]; el0.querySelector('.bk-x-from small').textContent = `${$(bal(dir[0]))} available`;
      el0.querySelector('.bk-x-to b').textContent = ACC[dir[1]]; el0.querySelector('.bk-x-to small').textContent = `${$(bal(dir[1]))} balance`;
      const a = el0.querySelector('.bk-amt'), bad = m.v > bal(dir[0]);
      a.textContent = os.amountText(m.s); a.classList.toggle('bad', bad);
      el0.querySelector('.bk-amt-msg').textContent = bad ? `Only ${$(bal(dir[0]))} in ${ACC[dir[0]].toLowerCase()}.` : dir[1] === 'savings' ? `Earns ${((B()?.savingsApy || 0.042) * 100).toFixed(2)}% APY in savings` : 'Moves instantly';
      el0.querySelector('.bk-amt-msg').classList.toggle('bad', bad);
      el0.querySelector('[data-act="go"]').disabled = !(m.v > 0) || bad;
    };
    return {
      title: 'Transfer', back: 'Back', cls: 'bk-amount bk-xfer',
      body: `<div class="bk-x"><div class="bk-x-from"><small></small><b></b></div><button class="bk-x-swap" data-act="swap" data-f>${G.transfer}</button><div class="bk-x-to"><small></small><b></b></div></div>
        <div class="bk-amt">$0</div><div class="bk-amt-msg"></div>
        <div class="kp-chips bk-quick"><button class="kp-chip" data-act="all" data-f>Move all</button><button class="kp-chip" data-act="half" data-f>Half</button></div>
        ${os.keypadHTML()}
        <div class="kp-btns bk-next"><button class="kp-btn" data-act="go" data-f disabled>Transfer</button></div>`,
      acts: {
        swap: () => { dir = [dir[1], dir[0]]; paint(); os.sound('tick', 0.4); },
        key: (el) => { if (m.key(el.dataset.k)) os.sound('tick', 0.3); },
        all: () => m.set(Math.floor(bal(dir[0]) * 100) / 100), half: () => m.set(Math.floor(bal(dir[0]) * 50) / 100),
        go: () => { const r = B()?.transfer?.(m.v, dir[0], dir[1]); if (r?.ok) { os.sound('confirm', 0.6); os.toast(`${$(m.v)} moved to ${ACC[dir[1]].toLowerCase()}`, 'good'); os.pop(); refreshUnder(app); } else os.toast(r?.reason === 'insufficient' ? 'Not enough money' : 'Transfer failed', 'bad'); },
      },
      onDigit: (k) => { if (k === 'del' && !m.s) return false; m.key(k); return true; },
      mount: (el) => { el0 = el; m = amountModel(paint); paint(); el.querySelector('[data-k="1"]')?.setAttribute('data-autofocus', ''); },
      onShow: () => syncDepth(app),
    };
  }
  function refreshUnder(app) { if (app.stack.length === 1) refreshRoot(app); else { const top = app.stack[app.stack.length - 1]; if (top?._spec?.refresh) top._spec.refresh(top); } }

  // ---------------------------------------------------------------- ATM: deposit / withdraw
  function atmPage(app, mode = 'withdraw') {
    let m, el0;
    const near = os.atmNearby();
    if (!near && mode === 'withdraw') mode = 'withdraw';
    const paint = () => {
      const v = m.v, a = el0.querySelector('.bk-amt'), msg = el0.querySelector('.bk-amt-msg'), go = el0.querySelector('[data-act="go"]');
      a.textContent = os.amountText(m.s);
      let bad = null, info = '';
      if (mode === 'withdraw') {
        const lim = Number(B()?.atm?.({})?.withdrawLimitLeft ?? 1000);
        if (!near) bad = 'Find an ATM to withdraw cash.';
        else if (v > checking()) bad = 'Not enough money in checking.';
        else if (v > lim) bad = `ATM limit: ${$(lim)} left today.`;
        info = `${$(checking())} in checking · ${$(lim, { cents: false })} ATM limit left`;
      } else {
        const fee = near ? 0 : MOBILE_FEE(v);
        if (v > cash()) bad = `You only have ${$(cash())} in cash.`;
        else if (!near && v > 0 && v <= fee) bad = 'Amount is below the deposit fee.';
        info = near ? `${$(cash())} cash on hand · free at this ATM` : `${$(cash())} cash on hand · ${v > 0 ? $(fee) : '2% (min $3)'} mobile deposit fee`;
      }
      a.classList.toggle('bad', !!bad && v > 0);
      msg.textContent = bad && (v > 0 || (!near && mode === 'withdraw')) ? bad : info; msg.classList.toggle('bad', !!bad && (v > 0 || (!near && mode === 'withdraw')));
      go.disabled = !(v > 0) || !!bad;
      go.textContent = mode === 'withdraw' ? `Withdraw${v > 0 ? ' ' + $(v, { cents: v % 1 !== 0 }) : ''}` : `Deposit${v > 0 ? ' ' + $(v, { cents: v % 1 !== 0 }) : ''}`;
      el0.querySelectorAll('.bk-seg2 button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    };
    const quick = () => (mode === 'withdraw' ? [20, 40, 60, 100, 200, 500] : [Math.floor(cash()), 50, 100, 500].filter((v, i, a) => v > 0 && a.indexOf(v) === i));
    const N = near ? null : os.nearestAtm();
    return {
      title: 'Cash', back: 'Back', cls: 'bk-amount bk-atm',
      body: `<div class="bk-atm-st ${near ? 'on' : ''}">${near ? `<i></i><span><b>ATM connected</b><small>${esc(near.place || 'ATM')} · cardless</small></span>` : `${G.pin}<span><b>No ATM nearby</b><small>${N ? `Nearest ${esc(N.name)} · ${os.distText(N.d)}` : 'Withdrawals need an ATM'}</small></span>${N ? '<button class="kp-chip" data-act="route" data-f>Directions</button>' : ''}`}</div>
        <div class="kp-seg bk-seg2"><button data-act="mode" data-m="withdraw" data-f>Withdraw</button><button data-act="mode" data-m="deposit" data-f>Deposit</button></div>
        <div class="bk-amt">$0</div><div class="bk-amt-msg"></div>
        <div class="kp-chips bk-quick">${quick().map((v) => `<button class="kp-chip" data-act="q" data-v="${v}" data-f>${v === Math.floor(cash()) && mode === 'deposit' ? 'All cash' : '$' + v}</button>`).join('')}</div>
        ${os.keypadHTML()}
        <div class="kp-btns bk-next"><button class="kp-btn" data-act="go" data-f disabled>Withdraw</button></div>`,
      acts: {
        mode: (el) => { const n = os.replaceTop(atmPage(app, el.dataset.m)); },
        q: (el) => { m.set(el.dataset.v); os.sound('tick', 0.4); },
        key: (el) => { if (m.key(el.dataset.k)) os.sound('tick', 0.3); },
        route: () => { if (N) { os.setWaypoint(N.x, N.z, N.name); } },
        go: () => {
          const v = m.v; let r;
          if (mode === 'withdraw') r = B()?.withdraw?.(v, { atm: { place: near?.place || null } });
          else {
            r = B()?.deposit?.(v, near ? { atm: { place: near.place } } : { teller: true, place: 'Mobile cash deposit' });
            if (r?.ok && !near) { const fee = MOBILE_FEE(v); Wl()?.pay?.(fee, { method: 'bank', accepts: ['bank'], to: brand().name, category: 'fees', memo: 'Mobile cash deposit fee' }); }
          }
          if (r?.ok) { os.sound('confirm', 0.6); os.toast(mode === 'withdraw' ? `${$(v)} withdrawn` : `${$(v)} deposited`, 'good'); os.pop(); refreshUnder(app); }
          else os.toast({ insufficient: 'Not enough money', atm_limit: 'Over the ATM daily limit', card_frozen: 'Your card is frozen', other_bank: 'Deposits only at your bank' }[r?.reason] || 'The ATM could not do that', 'bad');
        },
      },
      onDigit: (k) => { if (k === 'del' && !m.s) return false; m.key(k); return true; },
      mount: (el) => { el0 = el; m = amountModel(paint); paint(); },
      onShow: () => syncDepth(app),
    };
  }

  // ---------------------------------------------------------------- tickets (fines)
  function finesPage(app) {
    let list = []; try { list = game.fines?.list?.({ unpaid: true }) || []; } catch (e) { list = []; }
    const warrant = !!game.fines?.warrant, owed = list.reduce((s, f) => s + (Number(f.amount) || 0), 0);
    return {
      title: 'Tickets', back: 'Back', large: true,
      body: `${warrant ? `<div class="bk-hookline bad">${G.alert}<span>There is a warrant out for unpaid tickets. Paying them clears it.</span></div>` : ''}
        ${list.length ? os.rowsHTML(list.map((f) => ({ icon: G.ticket, tile: f.overdue ? '#e5484d' : '#f28a1b', title: esc(f.label), sub: esc(`${f.place ? f.place + ' · ' : ''}${f.overdue ? 'Overdue, late fee added' : `Due in ${Math.max(0, f.dueInDays)} day${f.dueInDays === 1 ? '' : 's'}`}`), value: $(f.amount), valueCls: 'strong', act: 'pay', data: { id: f.id }, right: '<span class="bk-pill">Pay</span>', chevron: false })))
          + `<div class="kp-btns"><button class="kp-btn" data-act="all" data-f>Pay all · ${$(owed)}</button></div><div class="kp-foot" style="margin-top:12px">Paid from ${ACC.checking}, or cash if checking is short.</div>`
          : `<div class="kp-empty">${G.ticket}<b>No tickets</b>Speeding, parking and red-light tickets show up here. Pay them before the due date to avoid late fees.</div>`}`,
      acts: {
        pay: (el) => { const r = game.fines?.pay?.(el.dataset.id, { method: 'auto' }); if (r?.ok) { os.sound('confirm', 0.6); os.toast('Ticket paid', 'good'); os.replaceTop(finesPage(app)); } else os.toast('Not enough money to pay it', 'bad'); },
        all: () => { const n = game.fines?.payAll?.({ method: 'auto' }) || 0; os.toast(n ? `${n} ticket${n > 1 ? 's' : ''} paid` : 'Not enough money', n ? 'good' : 'bad'); os.replaceTop(finesPage(app)); },
      },
      onShow: () => syncDepth(app),
    };
  }

  // ---------------------------------------------------------------- app definition
  return {
    id: 'bank', get name() { return brand().short; }, get short() { return brand().short; },
    icon: () => { const Bc = brand(); return Bc.logo ? { bg: `linear-gradient(150deg, ${Bc.a} 0%, ${Bc.c} 100%)`, img: Bc.logo } : { bg: `linear-gradient(150deg, ${Bc.a} 0%, ${Bc.c} 100%)`, svg: os.APP_ICONS.bank.svg }; },
    badge: () => { try { return (game.fines?.list?.({ unpaid: true }) || []).length; } catch (e) { return 0; } },
    widget: () => {
      const Bc = brand(), tot = checking() + savings(), s = os.data.balanceSeries(7), vals = s.map((p) => p.v), lo = Math.min(...vals), hi = Math.max(...vals), sp = Math.max(1, hi - lo);
      const pts = vals.map((v, i) => `${(8 + i / (vals.length - 1 || 1) * 128).toFixed(1)},${(40 - (v - lo) / sp * 30).toFixed(1)}`).join(' ');
      return `<div class="bk-wg" style="--a:${Bc.a};--b:${Bc.b};--c:${Bc.c}"><div class="bk-wg-h">${Bc.logo ? `<img src="${Bc.logo}" alt="">` : ''}<span>${esc(Bc.short)}</span></div>
        <small>Total balance</small><b>${$(tot, { cents: false })}</b><svg viewBox="0 0 144 46"><polyline points="${pts}" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg><em>Cash ${$(cash(), { cents: false })}</em></div>`;
    },
    launch(app, opts = {}) {
      app.tab = 'home';
      app.el.classList.add('bk-app');
      const Bc = brand(); app.el.style.setProperty('--a', Bc.a); app.el.style.setProperty('--b', Bc.b); app.el.style.setProperty('--c', Bc.c);
      app.el.appendChild(tabbar(app));
      os.push(homePage(app), { instant: true, sound: false });
      const go = () => this.deepLink(app, opts);
      if (!hasBank()) { os.replaceTop({ title: 'Bank', large: true, back: false, body: `<div class="kp-empty">${G.alert}<b>Banking is offline</b>The bank could not be reached. Try again later.</div>` }); return; }
      if (performance.now() > unlockedUntil) lockOverlay(app, go); else go();
    },
    deepLink(app, opts = {}) {
      if (opts.atm) os.push(atmPage(app, os.atmNearby() ? 'withdraw' : 'deposit'));
      else if (opts.fines) os.push(finesPage(app));
      else if (opts.send) { const c = opts.to && os.data.contact(opts.to); os.push(c ? amountPage(app, c) : recipientPage(app)); }
    },
    onMoney(app) { clearTimeout(app._mt); app._mt = setTimeout(() => { if (app.stack.length === 1) refreshRoot(app); }, 150); },
    onTheme(app) { /* colors follow CSS variables */ },
    onClose(app) { if (app.lock?._skip) app.lock.remove(); },
  };
}

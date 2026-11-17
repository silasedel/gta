// SOUTHLINE phone: sending money from the bank app. DOM-free (tools/v2/phone/wire-test.mjs runs it in Node).
// Money moves only through the core money system (game.wallet.pay from checking), so the ledger, the HUD's bank row,
// stats and saves all see it. Two rails, like a real bank:
//   instant  to a contact (people in the phone): free, $5,000 per transfer, $10,000 per game day
//   wire     to an account number (saved payee): $15 fee, $50,000 per transfer, $100,000 per game day
// Contacts can react (the Hush Line lowers heat, Tiny's garage tab, staff morale, family replies).

export const LIMITS = {
  instant: { perTransfer: 5000, daily: 10000, fee: 0, label: 'Instant', arrives: 'Instantly' },
  wire: { perTransfer: 50000, daily: 100000, fee: 15, label: 'Wire transfer', arrives: 'Today, within minutes' },
  min: 1,
};
const r2 = (v) => Math.round(v * 100) / 100;
export const fmt$ = (v, cents = true) => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

export function createWire(game, data) {
  const day = () => game.time?.day || 1;
  function usage() { const w = data.S.wires; if (w.day !== day()) { w.day = day(); w.instant = 0; w.wire = 0; } return w; }
  const kindOf = (c) => (c?.payee || c?.kind === 'payee' ? 'wire' : 'instant');
  const bankName = () => (game.bank?.name && game.bank.name !== 'your bank' ? game.bank.name : 'Bank');

  /** What sending `amount` to contact `c` would do. Never moves money. */
  function quote(c, amount) {
    const kind = kindOf(c), L = LIMITS[kind], u = usage();
    const a = r2(Number(amount) || 0), fee = L.fee, total = r2(a + fee);
    const available = r2(Number(game.bank?.balance) || 0);
    const dailyLeft = r2(Math.max(0, L.daily - u[kind]));
    let reason = null;
    if (!game.bank || !game.wallet) reason = 'no_bank';
    else if (!(a > 0)) reason = 'bad_amount';
    else if (a < LIMITS.min) reason = 'min';
    else if (total > available + 1e-9) reason = 'insufficient';
    else if (a > L.perTransfer) reason = 'per_transfer';
    else if (a > dailyLeft + 1e-9) reason = 'daily';
    return { kind, label: L.label, arrives: L.arrives, amount: a, fee, total, available, dailyLeft, perTransfer: L.perTransfer, max: r2(Math.max(0, Math.min(L.perTransfer, dailyLeft, available - fee))), ok: !reason, reason, hook: hookPreview(c, a) };
  }
  const REASON = {
    no_bank: 'Banking is not available right now.',
    bad_amount: 'Enter an amount.',
    min: `The smallest transfer is ${fmt$(LIMITS.min)}.`,
    insufficient: 'Not enough money in checking.',
    per_transfer: 'That is over the limit for one transfer.',
    daily: "That is over today's sending limit.",
    failed: 'The bank declined this transfer.',
  };
  const reasonText = (r) => REASON[r] || REASON.failed;

  // ---------------------------------------------------------------- contact hooks
  function wanted() { const W = game.wanted; return W && W.level > 0 ? W : null; }
  function hushPrice() { const W = wanted(); return W ? 400 * W.level : 0; }
  function hookPreview(c, a) {
    if (!c) return null;
    if (c.kind === 'hush') { const W = wanted(); if (!W) return 'No heat on you right now. It will sit as credit.'; if (!W.evading) return 'They will not touch it while the police can see you.'; const p = hushPrice(); return a + data.S.hushCredit >= p ? 'Lowers your wanted level by one star.' : `${fmt$(p - data.S.hushCredit, false)} lowers your wanted level by one star.`; }
    if (c.kind === 'garage' && data.S.tinyTab > 0) return a >= data.S.tinyTab ? `Clears your ${fmt$(data.S.tinyTab, false)} garage tab.` : `Pays toward your ${fmt$(data.S.tinyTab, false)} garage tab.`;
    if (c.kind === 'staff') return 'A bonus lifts their morale at work.';
    return null;
  }
  /** Lower heat with the Hush Line (wire credit). Returns true when a star was removed. */
  function hushLower() {
    const W = wanted(); if (!W || !W.evading) return false;
    const p = hushPrice(); if (data.S.hushCredit < p) return false;
    data.S.hushCredit = r2(data.S.hushCredit - p);
    W.heat = 0; W.level = Math.max(0, W.level - 1);
    if (W.level === 0) W.clear?.(); else W.clearT = 0;
    return true;
  }
  function applyHook(c, a) {
    const S = data.S;
    switch (c.kind) {
      case 'hush': {
        S.hushCredit = r2(S.hushCredit + a);
        const W = wanted();
        if (W && W.evading && hushLower()) return { reply: 'Consider it handled.', effect: 'Wanted level lowered' };
        if (W && !W.evading) return { reply: `Lose them first. ${fmt$(S.hushCredit, false)} sits with us until then.` };
        return { reply: `Noted. You have ${fmt$(S.hushCredit, false)} of credit with us.` };
      }
      case 'garage': {
        if (S.tinyTab > 0) { S.tinyTab = r2(Math.max(0, S.tinyTab - a)); return S.tinyTab === 0 ? { reply: "We're square. Bring the next one back in one piece.", effect: 'Garage tab cleared' } : { reply: `Got it. You still owe me ${fmt$(S.tinyTab, false)}.` }; }
        return { reply: 'Appreciate it. Swing by and I will look at your ride.' };
      }
      case 'family': return { reply: { rafa: '¡Gracias, mijo! I still want my cooler back.', lucia: 'Ay, you did not have to. Come eat on Sunday.', mom: 'Thank you, baby. Now call your mother.' }[c.id] || 'Thank you, this helps a lot.' };
      case 'fixer': return { reply: a >= 1000 ? 'Smart. Favors are cheaper when you pay up front.' : 'What am I supposed to do with that, sunshine?' };
      case 'staff': {
        try {
          const b = (game.business?.owned?.() || []).find((x) => x.id === c.bizId), s = b?.staff?.find((x) => x.id === c.staffId);
          if (s) { const wk = Math.max(1, (Number(s.wage) || 12) * 40); s.morale = Math.min(1, (Number(s.morale) || 0.6) + Math.min(0.3, (a / wk) * 0.3)); }
        } catch (e) { /* business gone */ }
        return { reply: 'Thanks, boss. Means a lot.', effect: 'Morale up' };
      }
      case 'client': return { reply: 'Received, thanks.' };
      case 'payee': return null;
      default: return { reply: 'Got it, thanks!' };
    }
  }

  /** Send money. Returns { ok, reason, reasonText, entry, fee, confirmation, reply, effect, at }. */
  function send(c, amount, memo = '') {
    const q = quote(c, amount);
    if (!q.ok) return { ok: false, reason: q.reason, reasonText: reasonText(q.reason), quote: q };
    const before = r2(Number(game.bank.balance) || 0);
    memo = String(memo || '').trim().slice(0, 60);
    const r = game.wallet.pay(q.amount, { method: 'bank', accepts: ['bank'], to: c.name, category: 'wire', memo: memo || (q.kind === 'wire' ? 'Wire transfer' : 'Sent with Instant Pay') });
    if (!r?.ok) return { ok: false, reason: r?.reason === 'insufficient' ? 'insufficient' : 'failed', reasonText: reasonText(r?.reason === 'insufficient' ? 'insufficient' : 'failed'), quote: q };
    let feeEntry = null;
    if (q.fee > 0) { const f = game.wallet.pay(q.fee, { method: 'bank', accepts: ['bank'], to: bankName(), category: 'fees', memo: 'Wire transfer fee' }); feeEntry = f?.entry || null; }
    usage()[q.kind] = r2(usage()[q.kind] + q.amount);
    data.pushRecent(c.id);
    const id = r.entry?.id ?? Math.floor(Math.random() * 1e5);
    const pfx = (bankName().replace(/[^A-Za-z ]/g, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || 'TX').toUpperCase();
    const confirmation = `${pfx}${String(id).padStart(6, '0')}${String(day() % 1000).padStart(3, '0')}`;
    let hook = null;
    try { hook = applyHook(c, q.amount); } catch (e) { console.warn('[phone] wire hook', e); }
    if (c.kind !== 'payee') data.addMessage(c.id, fmt$(q.amount), { from: 'me', kind: 'money', data: { amount: q.amount, memo } });
    try { game.stats?.add?.('wiresSent', 1); game.stats?.add?.('wiredTotal', q.amount); } catch (e) { /* */ }
    try { game.emit?.('wireSent', { to: c.id, name: c.name, amount: q.amount, fee: q.fee, kind: q.kind, entry: r.entry }); } catch (e) { /* */ }
    return { ok: true, quote: q, entry: r.entry || null, feeEntry, fee: q.fee, before, after: r2(Number(game.bank.balance) || 0), confirmation, reply: hook?.reply || null, effect: hook?.effect || null, at: data.now(), memo };
  }

  return { LIMITS, quote, send, usage, reasonText, hushPrice, hushLower, kindOf };
}

// Core systems: money that matters. Carried cash (can be lost) vs. the bank (safe), card payments, ATMs, a ledger for the
// phone banking app, wages, loans, fines mailed to the safehouse, insurance, and the rules for death and arrest.
// Amounts are integer cents inside and dollars at the API.
import { clamp, num, toCents, toDollars, fmtMoney, hash32, cap } from './util.js';
import { ANCHORS, JOBS } from './economy.js';
import { DAY } from './time.js';

export const START_MONEY = { cash: 120, checking: 680, savings: 0 };
const LEDGER_KEEP = 400;
const ATM_DAILY_LIMIT = 1000,
  ATM_FEE = 3.5,
  CARD_DAILY_LIMIT = 5000,
  CASH_REPORT_THRESHOLD = 10000;
const SAVINGS_APY = 0.042;
const FINE_DUE_DAYS = 3;
const LOAN_TERMS = {
  mortgage: { apr: 0.069, days: 120, down: 0.2 },
  auto: { apr: 0.089, days: 60, down: 0.1 },
  boat: { apr: 0.095, days: 60, down: 0.15 },
  business: { apr: 0.105, days: 90, down: 0.25 },
  personal: { apr: 0.179, days: 30, down: 0 },
};
const FINE_LABEL = {
  speeding: 'Speeding',
  red_light: 'Red-light camera',
  parking: 'Parking',
  littering: 'Littering',
  traffic_stop: 'Traffic',
  court: 'Court',
  medical: 'Hospital bill',
  reckless: 'Reckless driving',
  dui: 'DUI',
  no_insurance: 'No proof of insurance',
  impound: 'Impound',
};

export function createMoney(sys) {
  const { host } = sys;
  const emit = (n, d) => {
    try {
      return host.emit?.(n, d);
    } catch (e) {
      return true;
    }
  };
  const now = () => sys.time?.now ?? 0;
  const today = () => sys.time?.day ?? 1;
  const diff = () =>
    sys.settingsStore?.difficulty || {
      cashLossOnDeath: 0.5,
      hospitalBill: 1,
      fineMul: 1,
      payMul: 1,
    };
  const S = {};
  function defaults() {
    Object.assign(S, {
      cash: toCents(START_MONEY.cash),
      hot: 0,
      checking: toCents(START_MONEY.checking),
      savings: toCents(START_MONEY.savings),
      interestAccrued: 0,
      ledger: [],
      seq: 0,
      totals: {},
      incomeByDay: {},
      bankBrand: null,
      insurerBrand: null,
      card: { last4: '0000', frozen: false, frozenReason: null, spentToday: 0, spentDay: 0 },
      atm: { withdrawn: 0, day: 0 },
      cashDeposited: { amount: 0, day: 0 },
      loans: [],
      fines: [],
      policies: [],
      warrant: false,
      lifetime: { earned: 0, spent: 0, lost: 0 },
    });
    S.card.last4 = String(1000 + (hash32('card', sys.time?.weatherSeed ?? 1) % 9000));
  }

  // ---------------------------------------------------------------- ledger
  function post(account, cents, info = {}) {
    if (!cents) return null;
    S[account === 'cash' ? 'cash' : account] += cents;
    const t = now(),
      day = Math.floor(t / DAY) + 1;
    const e = {
      id: ++S.seq,
      t: Math.round(t * 100) / 100,
      day,
      account,
      amount: toDollars(cents),
      balance: toDollars(S[account]),
      category: info.category || 'misc',
      memo: info.memo || '',
      party: info.party || null,
      place: info.place || null,
      method: info.method || (account === 'cash' ? 'cash' : 'bank'),
    };
    S.ledger.push(e);
    if (S.ledger.length > LEDGER_KEEP) S.ledger.splice(0, S.ledger.length - LEDGER_KEEP);
    const tot = (S.totals[e.category] ||= { in: 0, out: 0 });
    if (cents > 0) tot.in += cents;
    else tot.out -= cents;
    if (cents > 0 && !info.internal) {
      S.lifetime.earned += cents;
      S.incomeByDay[day] = (S.incomeByDay[day] || 0) + cents;
      for (const k of Object.keys(S.incomeByDay)) if (Number(k) < day - 14) delete S.incomeByDay[k];
    }
    if (cents < 0 && !info.internal && info.category !== 'lost') S.lifetime.spent -= cents;
    emit('money', { account, amount: e.amount, balance: e.balance, entry: e });
    return e;
  }
  const clockOf = (e) => (sys.time ? sys.time.clockTextOf((((e.t % DAY) + DAY) % DAY) / 60) : '');

  // ---------------------------------------------------------------- wallet
  const wallet = {
    get cash() {
      return toDollars(S.cash);
    },
    get hot() {
      return toDollars(Math.min(S.hot, S.cash));
    },
    get clean() {
      return toDollars(Math.max(0, S.cash - S.hot));
    },
  };
  // v1 code writes game.player.money directly: route the difference through the ledger.
  wallet.setCashDirect = (dollars, memo = 'Cash') => {
    const target = Math.max(0, toCents(dollars)),
      d = target - S.cash;
    if (!d) return;
    if (d < 0) S.hot = Math.max(0, S.hot + d);
    post('cash', d, { category: d > 0 ? 'cash_in' : 'cash_out', memo });
  };
  wallet.earn = (amount, opts = {}) => {
    const c = toCents(amount);
    if (!(c > 0)) return null;
    const deposit = opts.method === 'deposit' || opts.method === 'bank';
    if (!deposit && opts.hot) S.hot += c;
    const e = post(deposit ? 'checking' : 'cash', c, {
      category: opts.category || 'income',
      memo: opts.memo || '',
      party: opts.from || null,
      place: opts.place || null,
      method: deposit ? 'deposit' : 'cash',
    });
    sys.stats?.add('moneyEarned', toDollars(c));
    return e;
  };
  function cardOk(c) {
    if (S.card.frozen) return 'card_frozen';
    if (S.card.spentDay !== today()) {
      S.card.spentDay = today();
      S.card.spentToday = 0;
    }
    if (S.checking < c) return 'card_declined';
    if (S.card.spentToday + c > toCents(CARD_DAILY_LIMIT)) return 'card_limit';
    return null;
  }
  wallet.canPay = (amount, opts = {}) => {
    const c = toCents(amount);
    if (!(c >= 0)) return { ok: false, reason: 'bad_amount' };
    const accepts = opts.accepts || ['cash', 'card'];
    const want = opts.method || 'auto';
    const prefer =
      host.settings?.payPreference === 'card' ? ['card', 'cash', 'bank'] : ['cash', 'card', 'bank'];
    const order = want === 'auto' ? prefer.filter((m) => accepts.includes(m)) : [want];
    let reason = 'insufficient';
    for (const m of order) {
      if (!accepts.includes(m)) {
        reason = m === 'card' ? 'cash_only' : 'not_accepted';
        continue;
      }
      if (m === 'cash') {
        if (S.cash >= c) return { ok: true, method: 'cash' };
        reason = 'insufficient';
      } else if (m === 'card') {
        const r = cardOk(c);
        if (!r) return { ok: true, method: 'card' };
        reason = r;
      } else if (m === 'bank') {
        if (S.checking >= c) return { ok: true, method: 'bank' };
        reason = 'insufficient';
      }
    }
    if (want === 'auto' && accepts.length === 1 && accepts[0] === 'cash' && S.cash < c)
      reason = S.checking >= c ? 'cash_only' : 'insufficient';
    return { ok: false, reason };
  };
  wallet.pay = (amount, opts = {}) => {
    const c = toCents(amount);
    const can = wallet.canPay(amount, opts);
    if (!can.ok) {
      emit('payFailed', { amount: toDollars(c), reason: can.reason, to: opts.to || null });
      return { ok: false, reason: can.reason };
    }
    if (c === 0) return { ok: true, method: can.method, entry: null };
    const info = {
      category: opts.category || 'purchase',
      memo: opts.memo || '',
      party: opts.to || null,
      place: opts.place || null,
      method: can.method,
    };
    let entry;
    if (can.method === 'cash') {
      S.hot = Math.max(0, S.hot - c);
      entry = post('cash', -c, info);
    } else {
      if (can.method === 'card') {
        S.card.spentToday += c;
        emit('cardUsed', {
          place: opts.place || null,
          amount: toDollars(c),
          brand: opts.brand || null,
          to: opts.to || null,
          t: now(),
        });
      }
      entry = post('checking', -c, info);
    }
    sys.stats?.add('moneySpent', toDollars(c));
    if (opts.brand)
      emit('brandEvent', {
        brandId: opts.brand,
        kind: 'purchase',
        magnitude: clamp(toDollars(c) / 50000),
        amount: toDollars(c),
        place: opts.place || null,
      });
    emit('paid', {
      amount: toDollars(c),
      method: can.method,
      to: opts.to || null,
      category: info.category,
      entry,
    });
    return { ok: true, method: can.method, entry };
  };
  wallet.lose = (amountOrFraction, opts = {}) => {
    const x = num(amountOrFraction);
    let c = x > 0 && x <= 1 ? Math.round(S.cash * x) : toCents(x);
    c = clamp(c, 0, S.cash);
    if (!c) return 0;
    // crime money goes first when the police take it, proportionally otherwise
    if (opts.reason === 'arrest') S.hot = Math.max(0, S.hot - c);
    else S.hot = Math.round(S.hot * (1 - c / S.cash));
    post('cash', -c, {
      category: 'lost',
      memo:
        cap(String(opts.reason || 'lost').replace(/_/g, ' ')) + (opts.by ? ` (${opts.by})` : ''),
      method: 'cash',
    });
    S.lifetime.lost += c;
    sys.stats?.add('cashLost', toDollars(c));
    emit('cashLost', { amount: toDollars(c), reason: opts.reason || 'lost', by: opts.by || null });
    return toDollars(c);
  };
  wallet.wage = (w = {}) => {
    const job = JOBS[w.job],
      gross = Math.max(0, num(w.gross)),
      tips = Math.max(0, num(w.tips));
    const method = w.method || (job?.payroll ? 'deposit' : 'cash');
    const name = job?.name || cap(String(w.job || 'work').replace(/_/g, ' '));
    let entry = null;
    if (gross > 0)
      entry = wallet.earn(gross, {
        category: 'wages',
        memo: w.memo || name,
        from: w.employer || name,
        method,
      });
    if (tips > 0) wallet.earn(tips, { category: 'tips', memo: `Tips: ${name}`, method: 'cash' });
    sys.stats?.add('jobEarnings', gross + tips);
    sys.stats?.add(`earned:${w.job || 'work'}`, gross + tips);
    emit('wage', { job: w.job, gross, tips, net: gross + tips, method });
    return { net: gross + tips, entry };
  };

  // ---------------------------------------------------------------- bank
  const brandName = (id) => {
    try {
      return host.design?.getBrand?.(id)?.name || null;
    } catch (e) {
      return null;
    }
  };
  function pickBrand(category, seed) {
    try {
      const b =
        host.design?.pickBrand?.(seed, { category }) || host.design?.brandsFor?.({ category })?.[0];
      return b?.id || null;
    } catch (e) {
      return null;
    }
  }
  const bank = {
    get balance() {
      return toDollars(S.checking);
    },
    get savings() {
      return toDollars(S.savings);
    },
    get brandId() {
      if (!S.bankBrand) S.bankBrand = pickBrand('bank', 'nico-bank');
      return S.bankBrand;
    },
    get name() {
      return brandName(bank.brandId) || 'your bank';
    },
    get card() {
      if (S.card.spentDay !== today()) {
        S.card.spentDay = today();
        S.card.spentToday = 0;
      }
      return {
        last4: S.card.last4,
        frozen: S.card.frozen,
        frozenReason: S.card.frozenReason,
        dailyLimit: CARD_DAILY_LIMIT,
        spentToday: toDollars(S.card.spentToday),
      };
    },
    get ledger() {
      return S.ledger;
    },
    get savingsApy() {
      return SAVINGS_APY;
    },
  };
  bank.freezeCard = (frozen, reason = null) => {
    S.card.frozen = !!frozen;
    S.card.frozenReason = frozen ? reason : null;
    emit('cardFrozen', { frozen: !!frozen, reason });
  };
  bank.atm = (info = {}) => {
    if (S.atm.day !== today()) {
      S.atm.day = today();
      S.atm.withdrawn = 0;
    }
    const network = !info.brand || !bank.brandId || info.brand === bank.brandId;
    return {
      network,
      fee: network ? 0 : ATM_FEE,
      withdrawLimitLeft: toDollars(Math.max(0, toCents(ATM_DAILY_LIMIT) - S.atm.withdrawn)),
      bank: bank.name,
    };
  };
  bank.withdraw = (amount, opts = {}) => {
    const c = toCents(amount);
    if (!(c > 0)) return { ok: false, reason: 'bad_amount' };
    const teller = !!opts.teller,
      a = bank.atm(opts.atm || {}),
      fee = teller ? 0 : toCents(a.fee);
    if (S.card.frozen && !teller) return { ok: false, reason: 'card_frozen' };
    if (!teller && c > toCents(a.withdrawLimitLeft))
      return { ok: false, reason: 'atm_limit', limitLeft: a.withdrawLimitLeft };
    if (S.checking < c + fee) return { ok: false, reason: 'insufficient' };
    const place = opts.atm?.place || opts.place || null;
    post('checking', -c, {
      category: 'transfer',
      memo: teller ? 'Teller withdrawal' : 'ATM withdrawal',
      place,
      internal: true,
      method: 'atm',
    });
    if (fee)
      post('checking', -fee, {
        category: 'fees',
        memo: 'ATM fee (out of network)',
        place,
        method: 'atm',
      });
    post('cash', c, {
      category: 'transfer',
      memo: teller ? 'Teller withdrawal' : 'ATM withdrawal',
      place,
      internal: true,
      method: 'atm',
    });
    if (!teller) S.atm.withdrawn += c;
    emit('atmUsed', { kind: 'withdraw', amount: toDollars(c), fee: toDollars(fee), place });
    return { ok: true, fee: toDollars(fee) };
  };
  bank.deposit = (amount, opts = {}) => {
    const c = toCents(amount);
    if (!(c > 0)) return { ok: false, reason: 'bad_amount' };
    if (S.cash < c) return { ok: false, reason: 'insufficient' };
    const a = bank.atm(opts.atm || {});
    if (!a.network && !opts.teller) return { ok: false, reason: 'other_bank' }; // you can only pay in at your own bank
    const place = opts.atm?.place || opts.place || null;
    const hotPart = Math.min(S.hot, Math.max(0, c - (S.cash - S.hot))); // clean bills go in first
    S.hot -= hotPart;
    post('cash', -c, {
      category: 'transfer',
      memo: 'Cash deposit',
      place,
      internal: true,
      method: 'atm',
    });
    post('checking', c, {
      category: 'transfer',
      memo: 'Cash deposit',
      place,
      internal: true,
      method: 'atm',
    });
    if (S.cashDeposited.day !== today()) {
      S.cashDeposited.day = today();
      S.cashDeposited.amount = 0;
    }
    const before = S.cashDeposited.amount;
    S.cashDeposited.amount += c;
    if (
      before <= toCents(CASH_REPORT_THRESHOLD) &&
      S.cashDeposited.amount > toCents(CASH_REPORT_THRESHOLD)
    )
      emit('suspiciousDeposit', {
        amount: toDollars(S.cashDeposited.amount),
        hot: toDollars(hotPart),
        place,
      });
    emit('atmUsed', { kind: 'deposit', amount: toDollars(c), fee: 0, place });
    return { ok: true, fee: 0 };
  };
  bank.transfer = (amount, from, to) => {
    const c = toCents(amount),
      ok = ['checking', 'savings'];
    if (!(c > 0) || !ok.includes(from) || !ok.includes(to) || from === to)
      return { ok: false, reason: 'bad_request' };
    if (S[from] < c) return { ok: false, reason: 'insufficient' };
    post(from, -c, { category: 'transfer', memo: `Transfer to ${to}`, internal: true });
    post(to, c, { category: 'transfer', memo: `Transfer from ${from}`, internal: true });
    return { ok: true };
  };
  bank.statement = (opts = {}) => {
    let rows = S.ledger;
    if (opts.account) rows = rows.filter((e) => e.account === opts.account);
    if (opts.category) rows = rows.filter((e) => e.category === opts.category);
    if (opts.sinceDay) rows = rows.filter((e) => e.day >= opts.sinceDay);
    if (opts.hideInternal) rows = rows.filter((e) => e.category !== 'transfer');
    return rows
      .slice(-(opts.limit || 50))
      .reverse()
      .map((e) => ({ ...e, clock: clockOf(e), text: fmtMoney(e.amount, { cents: true }) }));
  };
  bank.totals = () => {
    const o = {};
    for (const [k, v] of Object.entries(S.totals))
      o[k] = { in: toDollars(v.in), out: toDollars(v.out) };
    return o;
  };
  bank.recentIncome = (days = 7) => {
    let s = 0;
    const d = today();
    for (const [k, v] of Object.entries(S.incomeByDay)) if (Number(k) > d - days) s += v;
    return toDollars(s);
  };
  bank.netWorth = () => {
    const r = {
      cash: toDollars(S.cash),
      checking: toDollars(S.checking),
      savings: toDollars(S.savings),
      stocks: 0,
      property: 0,
      vehicles: 0,
      businesses: 0,
      debts: 0,
    };
    try {
      r.stocks = sys.stocks?.portfolio().value || 0;
    } catch (e) {
      /* */
    }
    try {
      r.property = sys.property?.equityValue?.() || 0;
    } catch (e) {
      /* */
    }
    try {
      r.vehicles = sys.garage?.totalValue?.() || 0;
    } catch (e) {
      /* */
    }
    try {
      r.businesses = sys.business?.totalValue?.() || 0;
    } catch (e) {
      /* */
    }
    r.debts = toDollars(
      S.loans.reduce((s, l) => s + l.balance, 0) +
        S.fines.filter((f) => f.status !== 'paid').reduce((s, f) => s + f.amount, 0),
    );
    r.total =
      Math.round(
        (r.cash +
          r.checking +
          r.savings +
          r.stocks +
          r.property +
          r.vehicles +
          r.businesses -
          r.debts) *
          100,
      ) / 100;
    return r;
  };

  // ---------------------------------------------------------------- loans (daily payments, terms in game days)
  const loans = {};
  loans.limit = (kind, collateralValue = 0) =>
    Math.round(
      Math.max(1500, bank.recentIncome(7) * 3) +
        (kind === 'personal' ? 0 : num(collateralValue) * 0.8),
    );
  loans.offer = ({ kind = 'personal', principal, price, collateral } = {}) => {
    const T = LOAN_TERMS[kind] || LOAN_TERMS.personal;
    const value = num(price ?? collateral?.value ?? principal);
    const down = Math.round(value * T.down * 100) / 100;
    const want = num(principal ?? value - down);
    const max = loans.limit(kind, value);
    const amount = Math.max(0, Math.min(want, max));
    const r = T.apr / 365,
      n = T.days;
    const daily =
      amount > 0 ? Math.ceil(((amount * r) / (1 - Math.pow(1 + r, -n))) * 100) / 100 : 0;
    return {
      kind,
      principal: amount,
      requested: want,
      approved: amount >= want - 0.005,
      apr: T.apr,
      days: n,
      daily,
      weekly: Math.round(daily * 7 * 100) / 100,
      down,
      total: Math.round(daily * n * 100) / 100,
      collateral: collateral || null,
    };
  };
  loans.take = (offer) => {
    if (!offer || !(offer.principal > 0)) return null;
    const loan = {
      id: 'L' + ++S.seq,
      kind: offer.kind,
      principal: toCents(offer.principal),
      balance: toCents(offer.principal),
      apr: offer.apr,
      daily: toCents(offer.daily),
      daysLeft: offer.days,
      missed: 0,
      collateral: offer.collateral || null,
      takenAt: now(),
    };
    S.loans.push(loan);
    post('checking', loan.principal, {
      category: 'loan',
      memo: `${cap(offer.kind)} loan`,
      party: bank.name,
      internal: true,
    });
    emit('loanTaken', { loan: loans.view(loan) });
    return loans.view(loan);
  };
  loans.view = (l) => ({
    id: l.id,
    kind: l.kind,
    principal: toDollars(l.principal),
    balance: toDollars(l.balance),
    apr: l.apr,
    daily: toDollars(l.daily),
    daysLeft: l.daysLeft,
    missed: l.missed,
    collateral: l.collateral,
  });
  loans.list = () => S.loans.map(loans.view);
  loans.payOff = (id) => {
    const l = S.loans.find((x) => x.id === id);
    if (!l) return { ok: false, reason: 'no_loan' };
    if (S.checking < l.balance) return { ok: false, reason: 'insufficient' };
    post('checking', -l.balance, {
      category: 'loan',
      memo: `${cap(l.kind)} loan paid off`,
      party: bank.name,
    });
    S.loans.splice(S.loans.indexOf(l), 1);
    emit('loanPaid', { loan: loans.view({ ...l, balance: 0 }) });
    return { ok: true };
  };
  function loanDay() {
    for (const l of [...S.loans]) {
      const interest = Math.round((l.balance * l.apr) / 365);
      const due = Math.min(l.daily, l.balance + interest);
      if (S.checking >= due) {
        post('checking', -due, {
          category: 'loan',
          memo: `${cap(l.kind)} loan payment`,
          party: bank.name,
        });
        l.balance = l.balance + interest - due;
        l.daysLeft = Math.max(0, l.daysLeft - 1);
        l.missed = 0;
        if (l.balance <= 0) {
          S.loans.splice(S.loans.indexOf(l), 1);
          emit('loanPaid', { loan: loans.view({ ...l, balance: 0 }) });
        }
      } else {
        l.missed += 1;
        l.balance += interest + Math.round(l.daily * 0.05);
        emit('loanMissed', { loan: loans.view(l) });
        sys.property?.sendMail?.({
          kind: 'bank',
          title: 'Missed loan payment',
          from: bank.name,
          body: `We could not collect your ${l.kind} loan payment of ${fmtMoney(toDollars(l.daily), { cents: true })}. A late fee was added. After three missed payments in a row the collateral is repossessed.`,
        });
        if (l.missed >= 3) {
          S.loans.splice(S.loans.indexOf(l), 1);
          emit('repossessed', { loan: loans.view(l), collateral: l.collateral });
          sys.news?.post?.({
            kind: 'local',
            headline: 'Repo trucks busy across the county as lenders call in bad loans',
            priority: 0,
          });
        }
      }
    }
  }
  bank.loans = loans;

  // ---------------------------------------------------------------- fines and tickets
  const fines = {};
  fines.view = (f) => ({
    ...f,
    amount: toDollars(f.amount),
    base: toDollars(f.base),
    label: FINE_LABEL[f.kind] || cap(f.kind),
    overdue: f.status === 'overdue',
    dueInDays: Math.ceil((f.dueAt - now()) / DAY),
  });
  fines.amountFor = (kind, opts = {}) => {
    const F = ANCHORS.fines;
    let base =
      kind === 'speeding'
        ? F.speeding_base + F.speeding_per_mph * Math.max(0, num(opts.speedOver))
        : kind === 'red_light'
          ? F.red_light
          : kind === 'parking'
            ? F.parking
            : kind === 'littering'
              ? F.littering
              : kind === 'reckless'
                ? F.reckless
                : kind === 'dui'
                  ? F.dui
                  : kind === 'no_insurance'
                    ? F.no_insurance
                    : 120;
    if (kind === 'speeding' && num(opts.speedOver) >= 30) base += 250; // 30 over: mandatory surcharge
    return Math.round(base * diff().fineMul);
  };
  fines.issue = (f = {}) => {
    const kind = f.kind || 'traffic_stop';
    const amount = toCents(f.amount ?? fines.amountFor(kind, f));
    const fine = {
      id: 'F' + ++S.seq,
      kind,
      amount,
      base: amount,
      issuedAt: now(),
      dueAt: now() + FINE_DUE_DAYS * DAY,
      status: 'unpaid',
      plate: f.plate || null,
      place: f.place || null,
      camera: !!f.camera,
      speedOver: f.speedOver ?? null,
      notices: 0,
      note: f.note || null,
    };
    S.fines.push(fine);
    const v = fines.view(fine);
    const where = fine.place ? ` at ${fine.place}` : '';
    sys.property?.sendMail?.({
      kind: 'fine',
      title: `${v.label} citation: ${fmtMoney(v.amount)}`,
      from: 'Southline Traffic and Parking Division',
      data: { fineId: fine.id },
      body: `${fine.camera ? 'A traffic camera recorded' : 'An officer cited'} ${fine.plate ? 'the vehicle with plate ' + fine.plate : 'you'}${where}${fine.speedOver ? `, ${Math.round(fine.speedOver)} mph over the limit` : ''}. Amount due: ${fmtMoney(v.amount)} within ${FINE_DUE_DAYS} days. Pay with the banking app or at the courthouse. Unpaid citations gain a ${Math.round(ANCHORS.fines.late_fee * 100)}% late fee and can lead to a warrant.`,
    });
    sys.stats?.add('finesIssued', 1);
    emit('fineIssued', { fine: v });
    return v;
  };
  fines.list = (opts = {}) =>
    S.fines.filter((f) => (opts.unpaid ? f.status !== 'paid' : true)).map(fines.view);
  fines.overdue = () => S.fines.filter((f) => f.status === 'overdue').map(fines.view);
  fines.owed = () =>
    toDollars(S.fines.filter((f) => f.status !== 'paid').reduce((s, f) => s + f.amount, 0));
  fines.pay = (id, opts = {}) => {
    const f = S.fines.find((x) => x.id === id);
    if (!f || f.status === 'paid') return { ok: false, reason: 'no_fine' };
    const r = wallet.pay(toDollars(f.amount), {
      to: 'Southline Clerk of Courts',
      category: 'fines',
      memo: `${FINE_LABEL[f.kind] || f.kind} citation`,
      method: opts.method || 'auto',
      accepts: ['cash', 'card', 'bank'],
    });
    if (!r.ok) return r;
    f.status = 'paid';
    f.paidAt = now();
    sys.stats?.add('finesPaid', toDollars(f.amount));
    emit('finePaid', { fine: fines.view(f) });
    if (S.warrant && !S.fines.some((x) => x.status === 'overdue')) {
      S.warrant = false;
      emit('warrantCleared', { reason: 'fines_paid' });
    }
    return { ok: true };
  };
  fines.payAll = (opts = {}) => {
    let paid = 0;
    for (const f of S.fines.filter((x) => x.status !== 'paid'))
      if (fines.pay(f.id, opts).ok) paid++;
    return paid;
  };
  Object.defineProperty(fines, 'warrant', { get: () => S.warrant });
  function finesTick() {
    const t = now();
    for (const f of S.fines) {
      if (f.status === 'paid') continue;
      if (f.status === 'unpaid' && t >= f.dueAt) {
        f.status = 'overdue';
        f.amount = Math.round(f.base * (1 + ANCHORS.fines.late_fee));
        f.notices = 1;
        emit('fineOverdue', { fine: fines.view(f) });
        sys.property?.sendMail?.({
          kind: 'fine',
          title: `SECOND NOTICE: ${FINE_LABEL[f.kind] || f.kind} citation`,
          from: 'Southline Clerk of Courts',
          data: { fineId: f.id },
          body: `Your citation is past due. A late fee was added. Amount now due: ${fmtMoney(toDollars(f.amount))}. Continued non-payment may result in a bench warrant.`,
        });
      } else if (f.status === 'overdue' && f.notices === 1 && t >= f.dueAt + FINE_DUE_DAYS * DAY) {
        f.notices = 2;
        f.amount = Math.round(f.base * (1 + 2 * ANCHORS.fines.late_fee));
      }
    }
    const over = S.fines.filter((f) => f.status === 'overdue');
    const owed = over.reduce((s, f) => s + f.amount, 0);
    if (
      !S.warrant &&
      (over.some((f) => f.notices >= 2) || over.length >= 3 || owed >= toCents(1500))
    ) {
      S.warrant = true;
      emit('warrant', {
        reason: 'unpaid_fines',
        fines: over.map(fines.view),
        owed: toDollars(owed),
      });
    }
    // paid fines older than two weeks drop off the record
    for (let i = S.fines.length - 1; i >= 0; i--)
      if (S.fines[i].status === 'paid' && t - S.fines[i].paidAt > 14 * DAY) S.fines.splice(i, 1);
  }

  // ---------------------------------------------------------------- insurance
  const insurance = {
    get brandId() {
      if (!S.insurerBrand) S.insurerBrand = pickBrand('insurance', 'nico-insurer');
      return S.insurerBrand;
    },
    get name() {
      return brandName(insurance.brandId) || 'your insurer';
    },
  };
  insurance.quote = ({ kind = 'vehicle', vehicleId } = {}) => {
    if (kind === 'health')
      return {
        kind,
        weekly: 58,
        daily: Math.round((58 / 7) * 100) / 100,
        deductible: 0,
        coverage: 'Hospital bills reduced by 80%',
      };
    const rec = sys.garage?.get?.(vehicleId);
    if (!rec) return null;
    const claims =
      S.policies.filter((p) => p.vehicleId === vehicleId).reduce((s, p) => s + p.claims, 0) +
      num(rec.stats?.claims);
    const classMul = { boat: 0.8, aircraft: 1.6, bike: 1.2 }[rec.kind] || 1;
    const weekly = Math.max(
      9,
      Math.round(num(rec.value) * 0.0045 * classMul * Math.pow(1.25, claims) * 100) / 100,
    );
    return {
      kind,
      vehicleId,
      weekly,
      daily: Math.round((weekly / 7) * 100) / 100,
      deductible: clamp(Math.round(num(rec.value) * 0.05), 250, 10000),
      coverage: 'Replacement if destroyed or stolen',
      value: num(rec.value),
      hot: !!rec.hot,
    };
  };
  insurance.buy = (q) => {
    if (!q) return null;
    if (q.kind === 'vehicle') {
      if (q.hot) return null;
      const ex = S.policies.find((p) => p.active && p.vehicleId === q.vehicleId);
      if (ex) return insurance.view(ex);
    }
    if (q.kind === 'health') {
      const ex = S.policies.find((p) => p.active && p.kind === 'health');
      if (ex) return insurance.view(ex);
    }
    const first = wallet.pay(q.daily, {
      to: insurance.name,
      category: 'insurance',
      memo: `${cap(q.kind)} insurance: first day`,
      accepts: ['card', 'bank', 'cash'],
      method: 'auto',
    });
    if (!first.ok) return null;
    const p = {
      id: 'P' + ++S.seq,
      kind: q.kind,
      vehicleId: q.vehicleId || null,
      daily: toCents(q.daily),
      deductible: toCents(q.deductible),
      startedAt: now(),
      claims: 0,
      missed: 0,
      active: true,
    };
    S.policies.push(p);
    if (p.vehicleId) {
      const rec = sys.garage?.get?.(p.vehicleId);
      if (rec) rec.policyId = p.id;
    }
    emit('insuranceBought', { policy: insurance.view(p) });
    return insurance.view(p);
  };
  insurance.view = (p) => ({
    id: p.id,
    kind: p.kind,
    vehicleId: p.vehicleId,
    daily: toDollars(p.daily),
    weekly: Math.round(toDollars(p.daily) * 7 * 100) / 100,
    deductible: toDollars(p.deductible),
    claims: p.claims,
    active: p.active,
  });
  insurance.policies = () => S.policies.filter((p) => p.active).map(insurance.view);
  insurance.has = (kind, vehicleId) =>
    S.policies.some(
      (p) => p.active && p.kind === kind && (kind !== 'vehicle' || p.vehicleId === vehicleId),
    );
  insurance.cancel = (policyId) => {
    const p = S.policies.find((x) => x.id === policyId);
    if (!p) return false;
    p.active = false;
    if (p.vehicleId) {
      const rec = sys.garage?.get?.(p.vehicleId);
      if (rec && rec.policyId === p.id) rec.policyId = null;
    }
    emit('insuranceCancelled', { policy: insurance.view(p) });
    return true;
  };
  insurance.claim = (vehicleId) => {
    const p = S.policies.find((x) => x.active && x.kind === 'vehicle' && x.vehicleId === vehicleId);
    if (!p) return { ok: false, reason: 'not_insured' };
    const rec = sys.garage?.get?.(vehicleId);
    if (!rec) return { ok: false, reason: 'no_vehicle' };
    if (rec.location?.kind !== 'destroyed' && rec.location?.kind !== 'lost')
      return { ok: false, reason: 'not_destroyed' };
    const pay = wallet.pay(toDollars(p.deductible), {
      to: insurance.name,
      category: 'insurance',
      memo: `Deductible: ${rec.name}`,
      accepts: ['card', 'bank', 'cash'],
    });
    if (!pay.ok) return { ok: false, reason: pay.reason };
    p.claims += 1;
    p.daily = Math.round(p.daily * 1.25);
    const readyAt = now() + 6 * 60;
    sys.garage?.beginDelivery?.(vehicleId, readyAt);
    sys.stats?.add('insuranceClaims', 1);
    emit('insuranceClaim', {
      policy: insurance.view(p),
      vehicleId,
      readyAt,
      deductible: toDollars(p.deductible),
    });
    return { ok: true, deductible: toDollars(p.deductible), readyAt };
  };
  function insuranceDay() {
    for (const p of S.policies) {
      if (!p.active) continue;
      const r = wallet.pay(toDollars(p.daily), {
        to: insurance.name,
        category: 'insurance',
        memo: `${cap(p.kind)} insurance`,
        accepts: ['bank', 'cash'],
        method: 'auto',
      });
      if (r.ok) {
        p.missed = 0;
        continue;
      }
      p.missed += 1;
      if (p.missed >= 2) {
        insurance.cancel(p.id);
        emit('insuranceLapsed', { policy: insurance.view(p) });
        sys.property?.sendMail?.({
          kind: 'insurance',
          title: 'Your policy has lapsed',
          from: insurance.name,
          body: 'We could not collect your premium two days in a row, so your coverage has ended. You can take out a new policy at any time.',
        });
      }
    }
    for (let i = S.policies.length - 1; i >= 0; i--)
      if (!S.policies[i].active && now() - S.policies[i].startedAt > 30 * DAY)
        S.policies.splice(i, 1);
  }

  // ---------------------------------------------------------------- daily and hourly upkeep
  const M = { wallet, bank, fines, insurance, START_MONEY, LOAN_TERMS };
  M.dayTick = (dayNumber, weekday) => {
    // savings interest accrues daily and posts on Mondays
    S.interestAccrued += S.savings * (Math.pow(1 + SAVINGS_APY, 1 / 365) - 1);
    if (weekday === 1 && S.interestAccrued >= 1) {
      const c = Math.floor(S.interestAccrued);
      S.interestAccrued -= c;
      post('savings', c, { category: 'interest', memo: 'Savings interest', party: bank.name });
    }
    loanDay();
    insuranceDay();
  };
  M.hourTick = () => finesTick();

  // ---------------------------------------------------------------- death and arrest
  M.onDeath = () => {
    const d = diff();
    const lost = wallet.lose(clamp(d.cashLossOnDeath) || 0, { reason: 'death' });
    let bill = Math.round(ANCHORS.services.hospital_bill * d.hospitalBill);
    const insured = insurance.has('health');
    if (insured) bill = Math.round(bill * 0.2);
    let billed = 0,
      mailed = 0;
    if (bill > 0) {
      const r = wallet.pay(bill, {
        to: 'Southline General Hospital',
        category: 'medical',
        memo: insured ? 'Emergency care (insured)' : 'Emergency care',
        accepts: ['bank', 'cash'],
        method: 'auto',
      });
      if (r.ok) billed = bill;
      else {
        fines.issue({ kind: 'medical', amount: bill, note: 'Emergency care' });
        mailed = bill;
      }
    }
    sys.stats?.add('deaths', 1);
    const res = { lost, bill: billed, mailed, insured };
    emit('deathCosts', res);
    return res;
  };
  M.onArrest = (info = {}) => {
    const stars = clamp(
      Math.round(num(info.stars ?? host.wanted?.level ?? host.player?.wanted, 1)),
      1,
      6,
    );
    const hot = wallet.hot;
    const seized = hot > 0 ? wallet.lose(hot, { reason: 'arrest', by: 'seized as evidence' }) : 0;
    let items = [];
    try {
      items = sys.inventory?.confiscate?.((it) => it.stolen) || [];
    } catch (e) {
      items = [];
    }
    const bail = Math.round(ANCHORS.services.bail_per_star * stars * diff().fineMul);
    let paid = 0,
      mailed = 0;
    const r = wallet.pay(bail, {
      to: 'Southline Police Department',
      category: 'fines',
      memo: `Bail and court costs (${stars}-star arrest)`,
      accepts: ['cash', 'bank'],
      method: 'auto',
    });
    if (r.ok) paid = bail;
    else {
      fines.issue({ kind: 'court', amount: bail, note: 'Bail and court costs' });
      mailed = bail;
    }
    // overdue citations are settled at the station if the money is there
    let settled = 0;
    for (const f of S.fines.filter((x) => x.status === 'overdue')) {
      const amt = toDollars(f.amount);
      if (fines.pay(f.id, { method: 'auto' }).ok) settled += amt;
    }
    sys.stats?.add('arrests', 1);
    const res = { stars, seized, bail: paid, mailed, settled, itemsTaken: items.length };
    emit('arrestCosts', res);
    return res;
  };

  // ---------------------------------------------------------------- save slice
  M.reset = () => defaults();
  M.toSave = () => JSON.parse(JSON.stringify(S));
  M.fromSave = (d) => {
    defaults();
    if (d)
      for (const k of Object.keys(S))
        if (d[k] !== undefined) S[k] = JSON.parse(JSON.stringify(d[k]));
  };
  M.raw = S;
  defaults();
  return M;
}

// Core systems: businesses you own and run (data and simulation; the UI and the raid fights belong to other tracks).
// Nightclub, car wash, marina, restaurant, garage. Staff with skills, wages and morale; prices; upgrades; raids;
// income simulated hour by hour, so a week of skipped time earns exactly what a week of played time earns.
import { clamp, num, hash01, fmtMoney, clone } from './util.js';
import { ANCHORS } from './economy.js';
import { DAY } from './time.js';

const bump = (h, c, w) => Math.exp(-((h - c) * (h - c)) / (2 * w * w));
export const BUSINESS_TYPES = {
  car_wash: {
    name: 'Car wash',
    hours: 'car-wash',
    customers: 9,
    ticket: 16,
    cogs: 0.12,
    fixedDaily: 150,
    capPerStaff: 5,
    serving: ['attendant'],
    roles: { attendant: 13, cashier: 14, manager: 24 },
    cashShare: 0.7,
    curve: (h) => 0.35 + bump(h, 12.5, 2.6) + 0.5 * bump(h, 17, 1.5),
    weekend: 1.45,
    pull: (d) => 0.6 + 0.5 * d.income + 0.2 * d.tourist,
    upgrades: {
      tunnel: { name: 'Automatic wash tunnel', cost: 48000, capacity: 0.7 },
      detailing: { name: 'Detailing bay', cost: 28000, ticket: 0.35 },
      cameras: { name: 'Camera system', cost: 9000, security: 0.25 },
      office: { name: 'Back office (daily bank deposits)', cost: 15000, autoDeposit: true },
      signage: { name: 'Roadside pylon sign', cost: 12000, demand: 0.15 },
    },
  },
  garage: {
    name: 'Auto garage',
    hours: 'garage',
    customers: 1.5,
    ticket: 360,
    cogs: 0.38,
    fixedDaily: 310,
    capPerStaff: 0.55,
    serving: ['mechanic'],
    roles: { mechanic: 27, service_writer: 19, manager: 30 },
    cashShare: 0.25,
    curve: (h) => 0.6 + 0.6 * bump(h, 9, 1.5) + 0.5 * bump(h, 15, 2),
    weekend: 0.6,
    pull: (d) => 0.7 + 0.4 * d.income,
    upgrades: {
      lift: { name: 'Two more lifts', cost: 52000, capacity: 0.6 },
      paint: { name: 'Paint booth', cost: 78000, ticket: 0.4 },
      diagnostics: { name: 'Diagnostic rig', cost: 21000, ticket: 0.12, demand: 0.1 },
      cameras: { name: 'Camera system', cost: 9000, security: 0.25 },
      office: { name: 'Back office (daily bank deposits)', cost: 15000, autoDeposit: true },
    },
  },
  restaurant: {
    name: 'Restaurant',
    hours: 'restaurant',
    customers: 16,
    ticket: 34,
    cogs: 0.32,
    fixedDaily: 520,
    capPerStaff: 6,
    serving: ['server', 'cook'],
    roles: { cook: 19, server: 9, bartender: 12, host: 14, manager: 27 },
    cashShare: 0.3,
    curve: (h) => 0.15 + bump(h, 12.6, 1.1) + 1.25 * bump(h, 19.6, 1.5),
    weekend: 1.3,
    pull: (d) => 0.55 + 0.45 * d.income + 0.4 * d.tourist,
    upgrades: {
      patio: { name: 'Patio seating', cost: 46000, capacity: 0.4, demand: 0.1 },
      kitchen: { name: 'Kitchen refit', cost: 88000, capacity: 0.35, ticket: 0.1 },
      bar: { name: 'Full bar', cost: 54000, ticket: 0.28 },
      cameras: { name: 'Camera system', cost: 9000, security: 0.2 },
      office: { name: 'Back office (daily bank deposits)', cost: 15000, autoDeposit: true },
    },
  },
  marina: {
    name: 'Marina',
    hours: 'marina',
    customers: 5,
    ticket: 96,
    cogs: 0.36,
    fixedDaily: 1250,
    capPerStaff: 2.2,
    serving: ['dockhand'],
    roles: { dockhand: 15, fuel_attendant: 15, mechanic: 28, harbormaster: 33 },
    cashShare: 0.2,
    curve: (h) => 0.4 + bump(h, 9, 1.8) + 0.9 * bump(h, 16.5, 1.8),
    weekend: 1.9,
    pull: (d) => 0.5 + 0.7 * d.income + 0.3 * d.tourist,
    upgrades: {
      fuel_dock: { name: 'Second fuel dock', cost: 120000, capacity: 0.4, ticket: 0.1 },
      dry_stack: { name: 'Dry-stack storage', cost: 310000, demand: 0.35, ticket: 0.15 },
      rentals: { name: 'Boat and jet ski rentals', cost: 165000, ticket: 0.3, demand: 0.2 },
      security: { name: 'Gate, cameras and night watch', cost: 42000, security: 0.35 },
      office: { name: 'Harbor office (daily bank deposits)', cost: 20000, autoDeposit: true },
    },
  },
  convenience: {
    name: 'Convenience store',
    hours: 'convenience',
    customers: 22,
    ticket: 11,
    cogs: 0.55,
    fixedDaily: 210,
    capPerStaff: 14,
    serving: ['cashier'],
    roles: { cashier: 13, stocker: 12, manager: 22 },
    cashShare: 0.6,
    curve: (h) => 0.3 + 0.7 * bump(h, 8, 1.5) + bump(h, 18, 2.5) + 0.4 * bump(h, 23, 1.5),
    weekend: 1.1,
    pull: (d) => 0.7 + 0.2 * d.tourist + 0.3 * d.nightlife,
    upgrades: {},
  },
  nightclub: {
    name: 'Nightclub',
    hours: 'nightclub',
    customers: 62,
    ticket: 58,
    cogs: 0.22,
    fixedDaily: 2300,
    capPerStaff: 11,
    serving: ['bartender'],
    roles: { bartender: 12, bouncer: 22, dj: 60, server: 10, manager: 36 },
    cashShare: 0.55,
    curve: (h) => {
      const x = h < 8 ? h + 24 : h;
      return 0.2 + 1.2 * bump(x, 25, 1.7);
    },
    weekend: 1.7,
    pull: (d) => 0.35 + 0.3 * d.income + 0.5 * d.nightlife + 0.3 * d.tourist,
    upgrades: {
      sound: { name: 'Sound and lighting rig', cost: 190000, demand: 0.3 },
      vip: { name: 'VIP tables and bottle service', cost: 240000, ticket: 0.45 },
      second_bar: { name: 'Second bar', cost: 95000, capacity: 0.5 },
      security: { name: 'Door scanners and cameras', cost: 60000, security: 0.3 },
      office: { name: 'Back office (daily bank deposits)', cost: 25000, autoDeposit: true },
    },
  },
};

// v2.1: every business also has three upgrade lines in two tiers (tier 2 needs tier 1): staff, security, decor.
const TIERS = {
  staff_1: { line: 'staff', tier: 1, name: 'Extra shift crew', costK: 0.06, capacity: 0.35 },
  staff_2: {
    line: 'staff',
    tier: 2,
    name: 'Trained full-time team',
    costK: 0.12,
    capacity: 0.4,
    ticket: 0.08,
  },
  security_1: { line: 'security', tier: 1, name: 'Cameras and alarm', costK: 0.04, security: 0.25 },
  security_2: {
    line: 'security',
    tier: 2,
    name: 'Armed guard on nights',
    costK: 0.09,
    security: 0.3,
  },
  decor_1: { line: 'decor', tier: 1, name: 'Fresh paint and signage', costK: 0.05, demand: 0.15 },
  decor_2: { line: 'decor', tier: 2, name: 'Full remodel', costK: 0.11, demand: 0.2, ticket: 0.12 },
};
for (const [typeKey, T] of Object.entries(BUSINESS_TYPES)) {
  for (const [k, u] of Object.entries(TIERS)) {
    const base = ANCHORS.businesses[typeKey] || 200000;
    T.upgrades[k] = { ...u, cost: Math.round((base * u.costK) / 500) * 500 };
  }
}
const FIRST = [
  'Alma',
  'Benny',
  'Carmen',
  'Dario',
  'Estela',
  'Felix',
  'Gloria',
  'Hector',
  'Ines',
  'Joaquin',
  'Keisha',
  'Lazaro',
  'Marisol',
  'Nestor',
  'Odalys',
  'Pavel',
  'Quinn',
  'Rosa',
  'Sandro',
  'Tamika',
  'Ulises',
  'Vivian',
  'Wendell',
  'Ximena',
  'Yusuf',
  'Zoila',
  'Andre',
  'Bianca',
  'Cedric',
  'Dalia',
  'Emilio',
  'Farah',
  'Gus',
  'Hattie',
  'Ivan',
  'Jolene',
];
const LAST = [
  'Abreu',
  'Baptiste',
  'Calloway',
  'Delgado',
  'Estrada',
  'Fontaine',
  'Gallo',
  'Herrera',
  'Ibarra',
  'Joseph',
  'Kowalski',
  'Lima',
  'Montoya',
  'Nunez',
  'Okafor',
  'Pruitt',
  'Quintana',
  'Rivas',
  'Simmons',
  'Toussaint',
  'Urbina',
  'Valdes',
  'Whitaker',
  'Xu',
  'Ybarra',
  'Zamora',
  'Acosta',
  'Brennan',
  'Cruz',
  'Dupree',
];
const TRAITS = [
  'punctual',
  'charming',
  'hard_worker',
  'lazy',
  'sticky_fingers',
  'hothead',
  'loyal',
  'ambitious',
];

export function createBusiness(sys) {
  const { host } = sys;
  const emit = (n, d) => {
    try {
      return host.emit?.(n, d);
    } catch (e) {
      return true;
    }
  };
  const now = () => sys.time?.now ?? 0;
  const listings = new Map();
  let S = { owned: [], seq: 0 };
  const B = { types: BUSINESS_TYPES };
  const biz = (id) => S.owned.find((b) => b.id === id) || null;
  const district = (b) => sys.economy.district(b.district);

  B.addListing = (l) => {
    if (!l?.id || !BUSINESS_TYPES[l.type]) return null;
    const d = { price: ANCHORS.businesses[l.type], ...l };
    listings.set(d.id, d);
    return d;
  };
  B.listings = () => [...listings.values()].filter((l) => !biz(l.id));
  B.owned = () => S.owned.map(B.view);
  B.get = (id) => {
    const b = biz(id);
    return b ? B.view(b) : null;
  };
  B.view = (b) => ({
    ...b,
    typeName: BUSINESS_TYPES[b.type].name,
    open: isOpen(b),
    capacity: capacity(b),
    marketWages: BUSINESS_TYPES[b.type].roles,
    value: value(b),
  });
  const value = (b) =>
    Math.round(
      b.price * (0.75 + 0.5 * b.reputation) +
        Object.keys(b.upgrades).reduce(
          (s, k) => s + (BUSINESS_TYPES[b.type].upgrades[k]?.cost || 0) * 0.6,
          0,
        ),
    );
  B.totalValue = () => S.owned.reduce((s, b) => s + value(b), 0);

  B.buy = (listingId, opts = {}) => {
    const l = listings.get(listingId);
    if (!l) return { ok: false, reason: 'no_listing' };
    if (biz(listingId)) return { ok: false, reason: 'already_owned' };
    let loan = null;
    if (opts.loan) {
      const offer = sys.bank.loans.offer({
        kind: 'business',
        price: l.price,
        collateral: { type: 'business', id: l.id, value: l.price },
      });
      if (!offer.approved) return { ok: false, reason: 'loan_declined', offer };
      if (sys.bank.balance + sys.wallet.cash < offer.down)
        return { ok: false, reason: 'insufficient', needed: offer.down };
      loan = sys.bank.loans.take(offer);
    }
    const pay = sys.wallet.pay(l.price, {
      to: l.seller || 'Business broker',
      category: 'business',
      memo: `Bought ${l.name}`,
      accepts: ['bank', 'cash'],
      place: l.name,
    });
    if (!pay.ok) {
      if (loan) sys.bank.loans.payOff(loan.id);
      return { ok: false, reason: pay.reason, needed: l.price };
    }
    const T = BUSINESS_TYPES[l.type];
    const b = {
      id: l.id,
      type: l.type,
      name: l.name,
      district: l.district || null,
      propertyId: l.propertyId || null,
      price: l.price,
      boughtAt: now(),
      loanId: loan?.id || null,
      staff: [],
      priceLevel: 1,
      reputation: 0.45,
      safe: 0,
      bankToday: 0,
      upgrades: {},
      closedUntil: 0,
      hoursOverride: null,
      launderQueue: 0,
      raid: null,
      lastRaidDay: 0,
      today: newRow(Math.floor(now() / DAY) + 1),
      history: [],
      lifetime: { revenue: 0, profit: 0, customers: 0 },
      sseq: 0,
    };
    // the previous owner's crew stays on: a thin, average team
    const keep = Object.keys(T.roles)
      .filter((r) => T.serving.includes(r) || r === 'cashier')
      .slice(0, 2);
    for (const role of [...keep, T.serving[0]])
      b.staff.push(makePerson(b, role, 'inherit' + b.staff.length, 0.45));
    S.owned.push(b);
    if (b.propertyId && sys.property.get(b.propertyId)) sys.property.grant(b.propertyId, 'owned');
    sys.stats?.add('businessesBought', 1);
    sys.stats?.log(`Bought ${b.name} for ${fmtMoney(l.price)}`, { kind: 'business' });
    sys.news?.post({
      kind: 'business',
      headline: `${b.name} changes hands`,
      body: `The ${T.name.toLowerCase()} has a new owner.`,
      priority: 0,
      district: district(b).name,
    });
    sys.save?.requestAutosave?.();
    emit('businessBought', { id: b.id, price: l.price });
    return { ok: true, business: B.view(b) };
  };
  B.sell = (id) => {
    const b = biz(id);
    if (!b) return { ok: false, reason: 'not_owned' };
    const proceeds = Math.round(value(b) * 0.9) + Math.round(b.safe);
    sys.wallet.earn(proceeds, { category: 'business', memo: `Sold ${b.name}`, method: 'deposit' });
    if (b.loanId) sys.bank.loans.payOff(b.loanId);
    S.owned.splice(S.owned.indexOf(b), 1);
    emit('businessSold', { id, proceeds });
    return { ok: true, proceeds };
  };

  // ---------------------------------------------------------------- staff
  function makePerson(b, role, salt, skillBias) {
    const T = BUSINESS_TYPES[b.type],
      k = `${b.id}:${salt}`;
    const skill = clamp(
      skillBias !== undefined
        ? skillBias + (hash01('sk', k) - 0.5) * 0.2
        : 0.2 + 0.75 * hash01('sk', k),
    );
    const market = T.roles[role];
    return {
      id: 'S' + ++b.sseq,
      name: `${FIRST[Math.floor(hash01('fn', k) * FIRST.length)]} ${LAST[Math.floor(hash01('ln', k) * LAST.length)]}`,
      role,
      skill: Math.round(skill * 100) / 100,
      wage: Math.round(market * (0.8 + 0.6 * skill) * 4) / 4,
      morale: 0.65,
      trait: TRAITS[Math.floor(hash01('tr', k) * TRAITS.length)],
      hiredDay: Math.floor(now() / DAY) + 1,
    };
  }
  B.marketWage = (type, role, skill = 0.5) =>
    Math.round(BUSINESS_TYPES[type].roles[role] * (0.8 + 0.6 * skill) * 4) / 4;
  // Four new applicants a day per business; the same people all day.
  B.applicants = (id) => {
    const b = biz(id);
    if (!b) return [];
    const T = BUSINESS_TYPES[b.type],
      roles = Object.keys(T.roles),
      day = Math.floor(now() / DAY) + 1;
    const out = [];
    for (let i = 0; i < 4; i++) {
      const role = roles[Math.floor(hash01('ar', b.id, day, i) * roles.length)];
      const p = makePerson({ ...b, sseq: 0 }, role, `app:${day}:${i}`);
      p.id = `A${day}_${i}`;
      if (!b.staff.some((s) => s.name === p.name) && !(b.hiredApps || []).includes(p.id))
        out.push(p);
    }
    return out;
  };
  B.hire = (id, applicantId) => {
    const b = biz(id);
    if (!b) return { ok: false, reason: 'not_owned' };
    const a = B.applicants(id).find((x) => x.id === applicantId);
    if (!a) return { ok: false, reason: 'no_applicant' };
    if (b.staff.length >= 24) return { ok: false, reason: 'full' };
    const p = { ...a, id: 'S' + ++b.sseq, morale: 0.7, hiredDay: Math.floor(now() / DAY) + 1 };
    b.staff.push(p);
    (b.hiredApps ||= []).push(applicantId);
    if (b.hiredApps.length > 12) b.hiredApps.shift();
    emit('staffHired', { id, staff: p });
    return { ok: true, staff: p };
  };
  B.fire = (id, staffId) => {
    const b = biz(id);
    const i = b ? b.staff.findIndex((s) => s.id === staffId) : -1;
    if (i < 0) return { ok: false, reason: 'no_staff' };
    const [p] = b.staff.splice(i, 1);
    for (const s of b.staff)
      s.morale = clamp(s.morale - (p.trait === 'lazy' || p.trait === 'sticky_fingers' ? 0 : 0.04)); // firing a good worker rattles the rest
    emit('staffFired', { id, staff: p });
    return { ok: true };
  };
  B.setWage = (id, staffId, hourly) => {
    const s = biz(id)?.staff.find((x) => x.id === staffId);
    if (!s) return false;
    s.wage = clamp(Math.round(num(hourly) * 4) / 4, 7.25, 400);
    return true;
  };
  B.setPrice = (id, level) => {
    const b = biz(id);
    if (!b) return false;
    b.priceLevel = clamp(num(level, 1), 0.6, 1.6);
    return true;
  };
  B.setHours = (id, schedule) => {
    const b = biz(id);
    if (!b) return false;
    b.hoursOverride = schedule || null;
    return true;
  };
  // tiered upgrades scale with what you paid for the place; the older fixed upgrades keep their own cost
  B.upgradeCost = (id, key) => {
    const b = biz(id);
    const u = b && BUSINESS_TYPES[b.type].upgrades[key];
    if (!u) return 0;
    return u.costK ? Math.round((b.price * u.costK) / 250) * 250 : u.cost;
  };
  B.upgrade = (id, key) => {
    const b = biz(id);
    const u = b && BUSINESS_TYPES[b.type].upgrades[key];
    if (!u) return { ok: false, reason: 'no_upgrade' };
    if (b.upgrades[key]) return { ok: false, reason: 'already_built' };
    if (u.tier === 2 && !b.upgrades[u.line + '_1']) return { ok: false, reason: 'needs_tier_1' };
    const cost = B.upgradeCost(id, key);
    const pay = sys.wallet.pay(cost, {
      to: 'Contractor',
      category: 'business',
      memo: `${b.name}: ${u.name}`,
      accepts: ['bank', 'cash'],
    });
    if (!pay.ok) return { ok: false, reason: pay.reason, cost };
    b.upgrades[key] = Math.floor(now() / DAY) + 1;
    emit('businessUpgraded', { id, key, cost });
    return { ok: true, cost };
  };
  const up = (b, field) =>
    Object.keys(b.upgrades).reduce(
      (s, k) => s + (BUSINESS_TYPES[b.type].upgrades[k]?.[field] || 0),
      0,
    );
  const hasUp = (b, field) =>
    Object.keys(b.upgrades).some((k) => BUSINESS_TYPES[b.type].upgrades[k]?.[field]);
  function capacity(b) {
    const T = BUSINESS_TYPES[b.type];
    let c = 0;
    for (const s of b.staff)
      if (T.serving.includes(s.role))
        c +=
          T.capPerStaff *
          (0.55 + 0.9 * s.skill) *
          (0.6 + 0.5 * s.morale) *
          (s.trait === 'hard_worker' ? 1.15 : s.trait === 'lazy' ? 0.8 : 1);
    return c * (1 + up(b, 'capacity'));
  }
  const security = (b) =>
    clamp(
      0.1 +
        up(b, 'security') +
        b.staff
          .filter((s) => s.role === 'bouncer' || s.role === 'harbormaster')
          .reduce((a, s) => a + 0.08 + 0.12 * s.skill, 0),
      0,
      0.9,
    );
  const schedule = (b) =>
    b.hoursOverride ||
    sys.economy.hours.forShop({ type: BUSINESS_TYPES[b.type].hours, id: b.id, always: false });
  const isOpen = (b, t = now()) =>
    t >= b.closedUntil &&
    b.staff.some((s) => BUSINESS_TYPES[b.type].serving.includes(s.role)) &&
    sys.economy.hours.isOpen({ schedule: schedule(b) }, t);
  const newRow = (day) => ({
    day,
    customers: 0,
    turnedAway: 0,
    revenue: 0,
    wages: 0,
    cogs: 0,
    fixed: 0,
    stolen: 0,
    laundered: 0,
    profit: 0,
  });

  // ---------------------------------------------------------------- one simulated hour (the hour that just ended)
  function hour(b, ev) {
    const T = BUSINESS_TYPES[b.type],
      t = ev.now - 30,
      hourIdx = Math.round(ev.now / 60);
    b.stock = clamp((b.stock ?? 1) - 0.012);
    const row = b.today;
    row.fixed += T.fixedDaily / 24;
    let cost = T.fixedDaily / 24,
      revenue = 0;
    if (isOpen(b, t)) {
      const d = district(b),
        h = (((t % DAY) + DAY) % DAY) / 60,
        wd = (ev.weekday + (ev.hour < 0.5 ? 6 : 0)) % 7,
        weekend = wd === 0 || wd === 6 || (wd === 5 && h >= 17);
      const charm = b.staff.filter((s) => s.trait === 'charming').length * 0.02;
      const demand =
        T.customers *
        T.curve(h) *
        (weekend ? T.weekend : 1) *
        T.pull(d) *
        (0.4 + 1.2 * b.reputation) *
        Math.pow(b.priceLevel, -1.6) *
        (1 + up(b, 'demand') + charm) *
        (0.55 + 0.45 * (b.stock ?? 1)) *
        (0.85 + 0.3 * hash01('bz', b.id, hourIdx));
      const cap = capacity(b),
        served = Math.min(demand, cap);
      revenue = served * T.ticket * b.priceLevel * (1 + up(b, 'ticket'));
      const wages = b.staff.reduce((s, p) => s + p.wage, 0),
        cogs = revenue * T.cogs;
      row.customers += served;
      row.turnedAway += Math.max(0, demand - cap);
      row.revenue += revenue;
      row.wages += wages;
      row.cogs += cogs;
      cost += wages + cogs;
      // reputation drifts toward how well people are served for the price
      const avgSkill = b.staff.reduce((s, p) => s + p.skill, 0) / b.staff.length,
        avgMorale = b.staff.reduce((s, p) => s + p.morale, 0) / b.staff.length;
      const target = clamp(
        0.25 +
          0.5 * avgSkill +
          0.2 * avgMorale +
          0.15 * (demand > 0 ? served / demand - 0.5 : 0) -
          0.35 * (b.priceLevel - 1),
      );
      b.reputation = clamp(b.reputation + (target - b.reputation) * 0.012);
      // skimming: unhappy or light-fingered staff without a manager watching
      const managed = b.staff.some((s) => s.role === 'manager' || s.role === 'harbormaster');
      for (const p of b.staff) {
        const risk =
          (p.trait === 'sticky_fingers' ? 0.012 : p.morale < 0.3 ? 0.005 : 0) *
          (managed ? 0.3 : 1) *
          (hasUp(b, 'security') ? 0.5 : 1);
        if (risk > 0) {
          const take = revenue * T.cashShare * risk;
          row.stolen += take;
          cost += take;
        }
      }
      // overworked crews lose heart
      if (demand > cap * 1.2) for (const p of b.staff) p.morale = clamp(p.morale - 0.002);
    }
    b.safe += revenue - cost;
  }
  function day(b, ev) {
    const T = BUSINESS_TYPES[b.type],
      row = b.today,
      dayNum = ev.day - 1;
    // laundering: cash businesses can pass a limited amount of dirty money through the till each day
    if (b.launderQueue > 0) {
      const capDay = Math.max(300, row.revenue * T.cashShare * 0.6),
        take = Math.min(b.launderQueue, capDay);
      b.launderQueue -= take;
      b.safe += take * 0.85;
      row.laundered = take;
      if (b.launderQueue > capDay * 8) {
        emit('businessAudit', { id: b.id, queue: b.launderQueue });
        sys.news?.post({
          kind: 'business',
          headline: `State auditors visit ${b.name}`,
          priority: 1,
        });
        b.reputation = clamp(b.reputation - 0.05);
      }
    }
    row.profit = row.revenue + row.laundered * 0.85 - row.wages - row.cogs - row.fixed - row.stolen;
    for (const k of Object.keys(row)) if (k !== 'day') row[k] = Math.round(row[k] * 100) / 100;
    b.history.push(row);
    if (b.history.length > 30) b.history.shift();
    b.lifetime.revenue += row.revenue;
    b.lifetime.profit += row.profit;
    b.lifetime.customers += row.customers;
    // morale: pay against the market rate for that skill
    for (const p of [...b.staff]) {
      const fair = B.marketWage(b.type, p.role, p.skill),
        target = clamp(
          0.55 +
            (p.wage / fair - 1) * 1.6 +
            (p.trait === 'loyal' ? 0.12 : 0) -
            (p.trait === 'hothead' ? 0.08 : 0),
        );
      p.morale = clamp(p.morale + (target - p.morale) * 0.25);
      p.skill = clamp(p.skill + 0.002 * (p.trait === 'ambitious' ? 2 : 1)); // people get better at the job
      if (p.morale < 0.22 && hash01('quit', b.id, p.id, dayNum) < 0.35) {
        b.staff.splice(b.staff.indexOf(p), 1);
        emit('staffQuit', { id: b.id, staff: p, reason: 'pay' });
      }
    }
    // a business that owes money pays from the owner's bank before it bounces wages
    if (b.safe < 0) {
      const need = -b.safe;
      const r = sys.wallet.pay(Math.round(need * 100) / 100, {
        to: b.name,
        category: 'business',
        memo: `${b.name}: covering losses`,
        accepts: ['bank', 'cash'],
      });
      if (r.ok) b.safe = 0;
      else {
        for (const p of b.staff) p.morale = clamp(p.morale - 0.15);
        b.reputation = clamp(b.reputation - 0.03);
      }
    }
    if (hasUp(b, 'autoDeposit') && b.safe > 0) {
      const amt = Math.floor(b.safe * 100) / 100;
      b.safe -= amt;
      sys.wallet.earn(amt, {
        category: 'business',
        memo: `${b.name}: daily deposit`,
        method: 'deposit',
        from: b.name,
      });
    }
    // raids: more likely in rough districts, with a full safe and thin security
    const d = district(b),
      sec = security(b),
      rate = sys.settingsStore?.difficulty.raidRate ?? 1;
    const chance =
      (0.015 + 0.09 * d.crime) * clamp(0.3 + b.safe / 20000, 0.3, 1.6) * (1 - sec) * rate;
    if (
      !b.raid &&
      dayNum - b.lastRaidDay >= 3 &&
      dayNum - Math.floor(b.boughtAt / DAY) >= 2 &&
      hash01('raid', b.id, dayNum) < chance
    ) {
      const hourOfDay = 20 + Math.floor(hash01('raidh', b.id, dayNum) * 6); // tomorrow night
      b.raid = {
        at: ev.now + hourOfDay * 60,
        deadline: ev.now + hourOfDay * 60 + 90,
        attackers: 3 + Math.floor(hash01('raidn', b.id, dayNum) * 5),
        strength: clamp(0.3 + 0.6 * d.crime),
        warned: false,
        started: false,
      };
    }
    emit('businessDay', { id: b.id, row });
    b.today = newRow(ev.day);
  }
  B.hourTick = (ev) => {
    for (const b of S.owned) {
      hour(b, ev);
      const r = b.raid;
      if (r) {
        if (!r.started && ev.now >= r.at) {
          r.started = true;
          emit('businessRaid', {
            id: b.id,
            deadline: r.deadline,
            attackers: r.attackers,
            strength: r.strength,
            name: b.name,
          });
          sys.news?.post({
            kind: 'crime',
            headline: `Trouble reported at ${b.name}`,
            priority: 2,
            channels: ['phone', 'radio'],
            ttlHours: 3,
          });
        }
        if (r.started && ev.now >= r.deadline) B.raid.resolve(b.id, {}); // nobody came: the crew on shift deals with it
      }
    }
  };
  B.dayTick = (ev) => {
    for (const b of [...S.owned]) day(b, ev);
  };
  B.security = (id) => {
    const b = biz(id);
    return b ? security(b) : 0;
  };
  B.restock = (id) => {
    const b = biz(id);
    if (!b) return false;
    b.stock = 1;
    return true;
  };
  B.raid = {
    pending: (id) => biz(id)?.raid || null,
    // start a raid now (gameplay events): the player has `windowMinutes` game minutes to get there
    start(id, opts = {}) {
      const b = biz(id);
      if (!b || b.raid) return null;
      const t = now();
      b.raid = {
        at: t,
        deadline: t + (opts.windowMinutes ?? 90),
        attackers: opts.attackers ?? 4,
        strength: opts.strength ?? 0.5,
        warned: true,
        started: true,
      };
      emit('businessRaid', {
        id: b.id,
        deadline: b.raid.deadline,
        attackers: b.raid.attackers,
        strength: b.raid.strength,
        name: b.name,
      });
      return b.raid;
    },
    resolve(id, res = {}) {
      const b = biz(id);
      if (!b || !b.raid) return null;
      const r = b.raid;
      b.raid = null;
      b.lastRaidDay = Math.floor(now() / DAY) + 1;
      const defended =
        res.defended !== undefined
          ? !!res.defended
          : hash01('def', b.id, b.lastRaidDay) < security(b) * (1.2 - r.strength);
      let lost = 0;
      if (!defended) {
        lost = Math.round(Math.max(0, b.safe) * (0.4 + 0.4 * r.strength) * 100) / 100;
        b.safe -= lost;
        b.reputation = clamp(b.reputation - 0.08);
        b.closedUntil = now() + (res.damage !== undefined ? num(res.damage) : 0.5) * 24 * 60;
        for (const p of b.staff) p.morale = clamp(p.morale - 0.12);
        sys.news?.post({
          kind: 'crime',
          headline: `${b.name} robbed overnight`,
          body: 'The owner could not be reached for comment.',
          priority: 1,
          district: district(b).name,
        });
      } else {
        b.reputation = clamp(b.reputation + 0.02);
        for (const p of b.staff) p.morale = clamp(p.morale + 0.05);
      }
      sys.stats?.add(defended ? 'raidsDefended' : 'raidsLost', 1);
      emit('businessRaidResult', { id, lost, defended });
      return { defended, lost };
    },
  };
  B.collect = (id) => {
    const b = biz(id);
    if (!b || b.safe <= 0) return 0;
    const amt = Math.floor(b.safe * 100) / 100;
    b.safe -= amt;
    sys.wallet.earn(amt, {
      category: 'business',
      memo: `${b.name}: cash from the safe`,
      from: b.name,
    });
    return amt;
  };
  B.launder = (id, amount) => {
    const b = biz(id);
    if (!b) return { ok: false, reason: 'not_owned' };
    const a = Math.min(num(amount), sys.wallet.hot);
    if (!(a > 0)) return { ok: false, reason: 'no_hot_cash' };
    sys.wallet.lose(a, { reason: 'arrest', by: 'into the till' }); // removes hot cash first
    sys.stats?.add('cashLost', -a); // it was not lost: undo the stat
    b.launderQueue += a;
    return { ok: true, accepted: a, queue: b.launderQueue };
  };
  B.report = (id, days = 7) => {
    const b = biz(id);
    return b ? [...b.history.slice(-days), b.today] : [];
  };

  B.reset = () => {
    S = { owned: [], seq: 0 };
  };
  B.toSave = () => clone(S);
  B.fromSave = (d) => {
    S = d ? clone(d) : { owned: [], seq: 0 };
    S.owned ||= [];
  };
  return B;
}

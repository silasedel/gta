// Core systems: property and ownership. Homes, apartments, hotel rooms, garages and marina slips you can buy, rent or
// book; safehouse features (bed, wardrobe, stash, fridge, mail); and the owned-vehicle registry (keys, storage,
// impound, insurance recovery). Definitions come from the world tracks through property.define(); this module owns
// the rules and the state.
import { clamp, num, vec3arr, dist2, fmtMoney, hash01, hash32, clone, cap } from './util.js';
import { ANCHORS } from './economy.js';
import { SIZE } from './items.js';
import { DAY } from './time.js';

const MAIL_KEEP = 60;
const KIND_SLOT = { car: 'garageSlots', bike: 'garageSlots', truck: 'garageSlots', boat: 'boatSlips', jetski: 'boatSlips', yacht: 'boatSlips', aircraft: 'airSlots', helicopter: 'airSlots' };

export function createProperty(sys) {
  const { host } = sys;
  const emit = (n, d) => { try { return host.emit?.(n, d); } catch (e) { return true; } };
  const now = () => sys.time?.now ?? 0;
  const defs = new Map();     // id -> definition (not saved: world tracks define them every boot)
  let S = {};                 // saved state

  function defaults() {
    S = { home: null, states: {}, mailQueue: [], mailSeq: 0, heldMail: [], vehicles: [], vseq: 0, impoundLot: S.impoundLot || null };
  }
  const st = (id) => (S.states[id] ||= { access: null, since: null, until: null, missedRent: 0, loanId: null, paid: 0, cash: 0, hot: 0, mail: [] });

  // ================================================================ property
  const Pr = {};
  Pr.define = (def) => {
    if (!def || !def.id) throw new Error('property.define: id is required');
    const prev = defs.get(def.id) || {};
    const d = { kind: 'apartment', name: def.id, district: null, pos: null, price: null, rentPerWeek: null, nightly: null, features: {}, garageSlots: 0, boatSlips: 0, airSlots: 0, ...prev, ...def };
    d.features = { ...(prev.features || {}), ...(def.features || {}) };
    if (d.pos) d.pos = vec3arr(d.pos);
    if (d.helipad && !d.airSlots) d.airSlots = 1;
    defs.set(d.id, d);
    if (d.starter && !S.states[d.id]?.access && S.fresh) grant(d.id, 'owned');
    return d;
  };
  Pr.undefine = (id) => defs.delete(id);
  const view = (d) => { const s = S.states[d.id]; return { ...d, access: Pr.access(d.id), since: s?.since ?? null, until: s?.until ?? null, isHome: S.home === d.id, value: Pr.value(d.id) }; };
  Pr.get = (id) => (defs.has(id) ? view(defs.get(id)) : null);
  Pr.all = (filter) => { const a = [...defs.values()].map(view); return typeof filter === 'function' ? a.filter(filter) : filter ? a.filter((p) => Object.entries(filter).every(([k, v]) => p[k] === v)) : a; };
  Pr.owned = () => Pr.all((p) => p.access === 'owned');
  Pr.accessible = () => Pr.all((p) => !!p.access);
  Pr.access = (id) => { const s = S.states[id]; if (!s || !s.access) return null; if (s.access === 'booked' && s.until !== null && now() >= s.until) return null; return s.access; };
  Pr.hasFeature = (id, feature) => !!Pr.access(id) && !!defs.get(id)?.features?.[feature];
  Object.defineProperty(Pr, 'home', { get: () => (S.home && defs.has(S.home) ? Pr.get(S.home) : null) });
  Object.defineProperty(Pr, 'homeId', { get: () => S.home });
  Pr.setHome = (id) => { if (!Pr.access(id) || !defs.get(id)?.features?.bed) return false; S.home = id; emit('homeChanged', { id }); return true; };

  // slow market drift: property values move a few percent over weeks, the same for everyone in a district
  Pr.marketIndex = (district, day = sys.time?.day ?? 1) => 1 + 0.06 * Math.sin((day + (hash32('pm', district || 'x') % 90)) / 23) + 0.02 * (hash01('pmn', district || 'x', Math.floor(day / 7)) - 0.5);
  Pr.value = (id) => { const d = defs.get(id); if (!d || !d.price) return 0; return Math.round(d.price * Pr.marketIndex(d.district) / 100) * 100; };
  // A fair price for a new listing: anchor x district rent index (areas use this so the map stays consistent).
  Pr.suggestPrice = ({ anchor, district, quality = 0.5 } = {}) => {
    const a = ANCHORS.property[anchor]; if (!a) return null;
    const d = sys.economy?.district(district) || { rentIndex: 1 };
    const k = (0.75 + 0.5 * clamp(quality)) * (0.55 + 0.45 * d.rentIndex);
    return { price: Math.round(a.price * k / 1000) * 1000, rentPerWeek: a.rentPerWeek ? Math.round(a.rentPerWeek * k / 5) * 5 : null };
  };

  function grant(id, access, extra = {}) {
    const s = st(id);
    Object.assign(s, { access, since: now(), until: null, missedRent: 0, ...extra });
    if (!S.home && defs.get(id)?.features?.bed && access !== 'booked') S.home = id;
    return s;
  }
  Pr.grant = (id, access = 'owned') => { if (!defs.has(id)) return false; grant(id, access); emit(access === 'owned' ? 'propertyBought' : 'propertyRented', { id, free: true }); return true; };

  Pr.buy = (id, opts = {}) => {
    const d = defs.get(id);
    if (!d || !d.price) return { ok: false, reason: 'not_for_sale' };
    if (Pr.access(id) === 'owned') return { ok: false, reason: 'already_owned' };
    const price = Pr.value(id);
    let loan = null, due = price;
    if (opts.loan) {
      const offer = sys.bank.loans.offer({ kind: d.kind === 'business' ? 'business' : 'mortgage', price, collateral: { type: 'property', id, value: price } });
      if (!offer.approved) return { ok: false, reason: 'loan_declined', offer };
      if (!sys.wallet.canPay(offer.down, { accepts: ['bank', 'cash'] }).ok) return { ok: false, reason: 'insufficient', needed: offer.down };
      loan = sys.bank.loans.take(offer);     // funds land in checking, then the full price is wired to the seller
      due = price;
    }
    const pay = sys.wallet.pay(due, { to: d.seller || 'Property seller', category: 'property', memo: `Bought ${d.name}`, accepts: ['bank', 'cash'], method: opts.method || 'auto', place: d.name });
    if (!pay.ok) { if (loan) sys.bank.loans.payOff(loan.id); return { ok: false, reason: pay.reason, needed: due }; }
    grant(id, 'owned', { loanId: loan?.id || null, paid: price });
    sys.stats?.add('propertiesBought', 1);
    sys.stats?.log(`Bought ${d.name} for ${fmtMoney(price)}`, { kind: 'property' });
    sys.save?.requestAutosave?.();
    emit('propertyBought', { id, price, loan });
    return { ok: true, price, loan };
  };
  Pr.sell = (id) => {
    const d = defs.get(id), s = S.states[id];
    if (!d || s?.access !== 'owned') return { ok: false, reason: 'not_owned' };
    if (d.starter || d.noSale) return { ok: false, reason: 'not_sellable' };
    if (S.vehicles.some((v) => v.location?.propertyId === id)) return { ok: false, reason: 'vehicles_inside' };
    const gross = Math.round(Pr.value(id) * 0.94);            // agent fees and closing costs
    sys.wallet.earn(gross, { category: 'property', memo: `Sold ${d.name}`, method: 'deposit' });
    if (s.loanId) { const r = sys.bank.loans.payOff(s.loanId); if (!r.ok) { /* the loan stays on the books as unsecured debt */ } }
    moveOut(id, 'sold');
    emit('propertySold', { id, proceeds: gross });
    return { ok: true, proceeds: gross };
  };
  Pr.rent = (id) => {
    const d = defs.get(id);
    if (!d || !d.rentPerWeek) return { ok: false, reason: 'not_for_rent' };
    if (Pr.access(id)) return { ok: false, reason: 'already_have' };
    // first day and a one-week deposit up front
    const daily = Pr.rentDaily(id), upfront = Math.round((daily + d.rentPerWeek) * 100) / 100;
    const pay = sys.wallet.pay(upfront, { to: d.landlord || 'Landlord', category: 'rent', memo: `Lease start: ${d.name} (first day and deposit)`, accepts: ['bank', 'cash', 'card'], place: d.name });
    if (!pay.ok) return { ok: false, reason: pay.reason, needed: upfront };
    grant(id, 'rented', { paid: d.rentPerWeek });
    sys.save?.requestAutosave?.();
    emit('propertyRented', { id, daily, deposit: d.rentPerWeek });
    return { ok: true, daily, deposit: d.rentPerWeek };
  };
  Pr.rentDaily = (id) => { const d = defs.get(id); return d?.rentPerWeek ? Math.round(d.rentPerWeek / 7 * 100) / 100 : 0; };
  Pr.endLease = (id) => {
    const d = defs.get(id), s = S.states[id];
    if (!d || s?.access !== 'rented') return { ok: false, reason: 'not_rented' };
    if (S.vehicles.some((v) => v.location?.propertyId === id)) return { ok: false, reason: 'vehicles_inside' };
    const refund = s.missedRent ? 0 : num(s.paid);
    if (refund > 0) sys.wallet.earn(refund, { category: 'rent', memo: `Deposit returned: ${d.name}`, method: 'deposit' });
    moveOut(id, 'ended');
    emit('leaseEnded', { id, reason: 'ended', refund });
    return { ok: true, refund };
  };
  Pr.bookRoom = (id, nights = 1) => {
    const d = defs.get(id);
    if (!d || !d.nightly) return { ok: false, reason: 'not_a_room' };
    nights = clamp(Math.floor(nights), 1, 14);
    const s = st(id);
    const extending = Pr.access(id) === 'booked';
    const cost = Math.round(d.nightly * nights * 100) / 100;
    const pay = sys.wallet.pay(cost, { to: d.hotel || d.name, category: 'lodging', memo: `${nights} night${nights > 1 ? 's' : ''}: ${d.name}`, accepts: d.cashOnly ? ['cash'] : ['card', 'cash', 'bank'], place: d.name, brand: d.brand });
    if (!pay.ok) return { ok: false, reason: pay.reason, needed: cost };
    // check-out is 11 AM: tonight counts as night one even when you check in after midnight
    let until;
    if (extending) until = s.until + nights * DAY;
    else { const t = now(), dayStart = Math.floor(t / DAY) * DAY, hour = (t - dayStart) / 60; until = dayStart + (hour < 6 ? 0 : DAY) + 11 * 60 + (nights - 1) * DAY; }
    Object.assign(s, { access: 'booked', since: extending ? s.since : now(), until });
    sys.stats?.add('hotelNights', nights);
    emit('roomBooked', { id, until, nights, cost });
    return { ok: true, until, cost };
  };
  function moveOut(id, reason) {
    const s = st(id);
    // whatever is left behind goes to storage and can be claimed later
    const stash = sys.inventory?.containers.get('stash:' + id), fridge = sys.inventory?.containers.get('fridge:' + id);
    const left = [...(stash ? stash.clear() : []), ...(fridge ? fridge.clear() : [])];
    if (left.length || s.cash > 0) {
      const box = sys.inventory.container('storage:' + id, { units: 9999, maxSize: SIZE.HUGE, label: 'Storage' });
      for (const it of left) box.add(it);
      box.cash = (box.cash || 0) + s.cash; box.hot = (box.hot || 0) + s.hot;
      s.storage = { since: now(), cash: s.cash, hot: s.hot, reason };
    }
    Object.assign(s, { access: null, until: null, loanId: null, missedRent: 0, cash: 0, hot: 0 });
    if (S.home === id) { S.home = null; for (const p of Pr.accessible()) if (p.features?.bed && p.access !== 'booked') { S.home = p.id; break; } }
  }
  // Belongings left in a place you no longer have: pay the storage fee and they go to your home stash.
  Pr.claimStorage = (id) => {
    const s = S.states[id]; const box = sys.inventory?.containers.get('storage:' + id);
    if (!s?.storage || !box) return { ok: false, reason: 'nothing_stored' };
    const fee = 150;
    const pay = sys.wallet.pay(fee, { to: 'Storage', category: 'fees', memo: 'Storage release fee', accepts: ['cash', 'card', 'bank'] });
    if (!pay.ok) return { ok: false, reason: pay.reason, needed: fee };
    const home = S.home ? Pr.stash(S.home) : null;
    let moved = 0;
    for (const it of box.clear()) { if (home && home.add(it) >= it.qty) moved += it.qty; else { const r = sys.inventory.add(it); moved += r.added; if (r.left > 0) sys.inventory.world.place({ ...it, qty: r.left }, host.player?.position || [0, 0, 0]); } }
    if (s.storage.cash > 0) sys.wallet.earn(s.storage.cash, { category: 'transfer', memo: 'Cash from storage', hot: false });
    delete s.storage;
    return { ok: true, moved };
  };

  Pr.stash = (id) => {
    if (!defs.has(id)) return null;
    const d = defs.get(id), s = st(id);
    const c = sys.inventory.container('stash:' + id, { units: d.stashUnits ?? (d.kind === 'hotel_room' ? 24 : 80), maxSize: SIZE.HUGE, label: 'Stash' });
    if (!c._wired) {
      c._wired = true;
      Object.defineProperty(c, 'cash', { get: () => s.cash, configurable: true });
      c.depositCash = (amount) => { const a = Math.min(num(amount), sys.wallet.cash); if (!(a > 0)) return 0; const hotShare = sys.wallet.cash > 0 ? sys.wallet.hot / sys.wallet.cash : 0; sys.wallet.setCashDirect(sys.wallet.cash - a, 'Stashed at ' + d.name); st(id).cash = Math.round((st(id).cash + a) * 100) / 100; st(id).hot = Math.round((st(id).hot + a * hotShare) * 100) / 100; return a; };
      c.withdrawCash = (amount) => { const cur = st(id); const a = Math.min(num(amount), cur.cash); if (!(a > 0)) return 0; const hotPart = cur.cash > 0 ? cur.hot * (a / cur.cash) : 0; cur.cash = Math.round((cur.cash - a) * 100) / 100; cur.hot = Math.max(0, Math.round((cur.hot - hotPart) * 100) / 100); sys.wallet.earn(a, { category: 'transfer', memo: 'From the stash at ' + d.name, hot: false }); if (hotPart > 0) sys.money.raw.hot += Math.round(hotPart * 100); return a; };
    }
    return c;
  };
  Pr.fridge = (id) => (defs.get(id)?.features?.fridge || defs.get(id)?.features?.kitchen ? sys.inventory.container('fridge:' + id, { units: 30, maxSize: SIZE.MEDIUM, cool: true, label: 'Fridge' }) : null);

  Pr.nearest = (x, z, opts = {}) => {
    let best = null, bd = Infinity;
    for (const d of defs.values()) {
      if (!d.pos) continue;
      if (opts.access && !Pr.access(d.id)) continue;
      if (opts.feature && !d.features?.[opts.feature]) continue;
      if (opts.kind && d.kind !== opts.kind) continue;
      const dd = dist2(d.pos[0], d.pos[2], x, z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best ? { ...view(best), distance: Math.sqrt(bd) } : null;
  };
  Pr.isPrivateSpot = (x, z) => { for (const d of defs.values()) if (d.pos && Pr.access(d.id) && dist2(d.pos[0], d.pos[2], x, z) < (d.radius || 25) ** 2) return true; return false; };
  Pr.equityValue = () => { let v = 0; for (const d of defs.values()) if (S.states[d.id]?.access === 'owned') v += Pr.value(d.id); return v; };
  Pr.slots = (id, kind = 'car') => {
    const d = defs.get(id); if (!d) return { total: 0, used: 0, free: 0 };
    const key = KIND_SLOT[kind] || 'garageSlots', total = num(d[key]);
    const used = S.vehicles.filter((v) => v.location?.propertyId === id && (KIND_SLOT[v.kind] || 'garageSlots') === key).length;
    return { total, used, free: Math.max(0, total - used) };
  };

  // ---------------------------------------------------------------- mail
  Pr.sendMail = (mail, opts = {}) => {
    const m = { id: 'M' + (++S.mailSeq), kind: mail.kind || 'letter', title: mail.title || 'Mail', body: mail.body || '', from: mail.from || null, at: now(), data: mail.data || null, to: opts.propertyId || null, readyAt: now() + num(opts.delay, 0) };
    S.mailQueue.push(m);
    if (opts.immediate) deliverMail(true);
    return m.id;
  };
  function deliverMail(force = false) {
    const t = now(); let n = 0;
    for (let i = 0; i < S.mailQueue.length; i++) {
      const m = S.mailQueue[i];
      if (!force && m.readyAt > t) continue;
      const to = m.to && Pr.access(m.to) ? m.to : S.home;
      if (!to) { S.heldMail.push(m); S.mailQueue.splice(i--, 1); continue; }   // no address: held at the post office
      const box = st(to).mail;
      box.push({ id: m.id, kind: m.kind, title: m.title, body: m.body, from: m.from, at: m.at, deliveredAt: t, read: false, data: m.data });
      while (box.length > MAIL_KEEP) { const idx = box.findIndex((x) => x.read); box.splice(idx >= 0 ? idx : 0, 1); }
      S.mailQueue.splice(i--, 1); n++;
      emit('mail', { propertyId: to, mail: box[box.length - 1] });
    }
    if (S.home && S.heldMail.length) { for (const m of S.heldMail.splice(0)) { m.to = S.home; S.mailQueue.push(m); } }
    return n;
  }
  Pr.deliverMail = deliverMail;
  Pr.mailbox = (id = S.home) => {
    const box = id ? st(id).mail : [];
    return {
      items: box.slice().reverse(), get unread() { return box.filter((m) => !m.read).length; },
      read: (mailId) => { const m = box.find((x) => x.id === mailId); if (m) m.read = true; return m || null; },
      take: (mailId) => { const i = box.findIndex((x) => x.id === mailId); return i >= 0 ? box.splice(i, 1)[0] : null; },
      readAll: () => { for (const m of box) m.read = true; },
    };
  };
  Object.defineProperty(Pr, 'unreadMail', { get: () => (S.home ? st(S.home).mail.filter((m) => !m.read).length : 0) });

  // ---------------------------------------------------------------- daily and hourly upkeep
  Pr.dayTick = () => {
    for (const d of defs.values()) {
      const s = S.states[d.id];
      if (s?.access !== 'rented') continue;
      const daily = Pr.rentDaily(d.id);
      const pay = sys.wallet.pay(daily, { to: d.landlord || 'Landlord', category: 'rent', memo: `Rent: ${d.name}`, accepts: ['bank', 'cash'], method: 'auto' });
      if (pay.ok) { s.missedRent = 0; continue; }
      s.missedRent += 1;
      emit('rentDue', { id: d.id, daily, missed: s.missedRent });
      Pr.sendMail({ kind: 'rent', title: `Rent overdue: ${d.name}`, from: d.landlord || 'Landlord', body: `Your rent of ${fmtMoney(daily, { cents: true })} could not be collected (${s.missedRent} day${s.missedRent > 1 ? 's' : ''} behind). After three missed days the lease ends and your belongings go to storage.` });
      if (s.missedRent >= 3) {
        // cars inside are towed to the impound lot
        for (const v of S.vehicles.filter((x) => x.location?.propertyId === d.id)) G.impound(v.id, { reason: 'eviction', fee: ANCHORS.services.impound_fee });
        moveOut(d.id, 'evicted');
        emit('leaseEnded', { id: d.id, reason: 'evicted' });
      }
    }
  };
  Pr.hourTick = (hour, weekday) => {
    if (hour === 11 && weekday !== 0) deliverMail();          // the mail comes at 11 AM, Monday to Saturday
    const t = now();
    for (const d of defs.values()) {
      const s = S.states[d.id];
      if (s?.access === 'booked' && s.until !== null && t >= s.until) { moveOut(d.id, 'checked_out'); emit('roomExpired', { id: d.id }); }
    }
    G.hourTick();
  };

  // ================================================================ owned vehicles
  const live = new Map();     // record id -> live vehicle object (never saved)
  let spawner = null, despawner = null, capture = null, restore = null;
  const G = {};
  const rec = (id) => S.vehicles.find((v) => v.id === id) || null;
  const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  function makePlate(seed) {
    let s = '';
    for (let i = 0; i < 3; i++) s += LETTERS[hash32('pl', seed, i) % LETTERS.length];
    s += ' ' + LETTERS[hash32('pl', seed, 3) % LETTERS.length] + String(10 + (hash32('pl', seed, 4) % 90));
    return s;
  }
  function defaultCapture(v) {
    const c = {};
    for (const k of ['health', 'fuel', 'dirt', 'odometer', 'paint', 'color', 'plate']) if (typeof v[k] === 'number' || typeof v[k] === 'string') c[k] = v[k];
    try { if (typeof v.serialize === 'function') c.blob = v.serialize(); else if (v.damage && typeof v.damage.serialize === 'function') c.damage = v.damage.serialize(); } catch (e) { /* */ }
    return c;
  }
  function posOf(v) {
    try { const t = v.body?.translation?.() || v.position || v.mesh?.position; if (!t) return null; let heading = 0; const r = v.body?.rotation?.(); if (r) heading = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x)); else if (typeof v.heading === 'number') heading = v.heading; return { pos: [t.x, t.y, t.z], heading }; } catch (e) { return null; }
  }
  const kindOf = (v) => (v.kind && KIND_SLOT[v.kind] ? v.kind : v.isBoat || v.boat || /boat|yacht|skiff|jet.?ski/i.test(String(v.typeKey || v.model?.class || '')) ? 'boat' : v.isAircraft || /heli|plane|aircraft/i.test(String(v.typeKey || v.model?.class || '')) ? 'aircraft' : /bike|scooter|motorcycle/i.test(String(v.model?.class || v.typeKey || '')) ? 'bike' : 'car');
  function anchorValue(v, kind) {
    const cls = v.model?.class || v.cls || v.spec?.cls || null;
    const A = kind === 'boat' ? ANCHORS.boats : kind === 'aircraft' ? ANCHORS.aircraft : ANCHORS.cars;
    const map = { super: 'hero_v10', sports: 'sports', muscle: 'muscle', suv: 'suv', sedan: 'sedan', compact: 'compact', van: 'van', pickup: 'pickup', taxi: 'taxi' };
    return A[map[cls] || cls]?.price ?? Object.values(A)[1].price;
  }

  Object.defineProperty(G, 'records', { get: () => S.vehicles });
  G.get = rec;
  G.of = (vehicle) => (vehicle && vehicle.ownedId ? rec(vehicle.ownedId) : null);
  G.owns = (vehicle) => !!G.of(vehicle);
  G.liveOf = (id) => live.get(id) || null;
  G.setSpawner = (fn) => { spawner = fn; };
  G.setDespawner = (fn) => { despawner = fn; };
  G.setCapture = (fn) => { capture = fn; };
  G.setRestore = (fn) => { restore = fn; };
  G.setImpoundLot = (lot) => { S.impoundLot = lot ? { pos: vec3arr(lot.pos), heading: num(lot.heading), name: lot.name || 'Impound lot' } : null; };
  G.capture = (v) => { try { return (capture || defaultCapture)(v) || {}; } catch (e) { return {}; } };

  G.register = (vehicleOrSpec, opts = {}) => {
    const v = vehicleOrSpec || {};
    const isLive = !!(v.body || v.mesh || v.setControls);
    if (isLive && v.ownedId && rec(v.ownedId)) return rec(v.ownedId);
    const id = 'V' + (++S.vseq);
    const kind = opts.kind || (isLive ? kindOf(v) : v.kind || 'car');
    const r = {
      id, modelKey: v.modelKey || v.model?.key || v.typeKey || v.key || 'unknown', kind, name: opts.name || v.name || v.model?.name || 'Vehicle',
      plate: v.plate || opts.plate || makePlate(id + ':' + (sys.time?.weatherSeed ?? 1)), value: num(opts.price ?? v.value ?? v.model?.price ?? v.price, 0) || anchorValue(v, kind),
      custom: clone(opts.custom || v.custom || {}), condition: isLive ? G.capture(v) : clone(v.condition || {}), location: { kind: 'world', pos: null, heading: 0 },
      keys: true, hot: opts.how === 'stolen', policyId: null, how: opts.how || 'bought', registeredAt: now(), stats: { claims: 0, impounds: 0 },
    };
    if (isLive) { v.ownedId = id; v.owned = true; if (!v.plate) v.plate = r.plate; live.set(id, v); const p = posOf(v); if (p) Object.assign(r.location, p); }
    else if (v.location) r.location = clone(v.location);
    S.vehicles.push(r);
    sys.stats?.add('vehiclesOwned', 1);
    emit('vehicleRegistered', { record: r, vehicle: isLive ? v : null });
    sys.save?.requestAutosave?.();
    return r;
  };
  G.unregister = (id, reason = 'removed') => { const r = rec(id); if (!r) return false; const v = live.get(id); if (v) { delete v.ownedId; v.owned = false; live.delete(id); } if (r.policyId) sys.insurance?.cancel(r.policyId); S.vehicles.splice(S.vehicles.indexOf(r), 1); emit('vehicleLost', { record: r, reason }); return true; };
  G.hasKeys = (vehicle) => !!G.of(vehicle)?.keys;
  G.clean = (id) => { const r = rec(id); if (!r) return false; r.hot = false; return true; };       // respray and new plates at a shady garage
  G.totalValue = () => S.vehicles.filter((v) => !['destroyed', 'lost'].includes(v.location?.kind) && !v.hot).reduce((s, v) => s + num(v.value), 0);
  G.at = (propertyId) => S.vehicles.filter((v) => v.location?.propertyId === propertyId);

  function removeLive(id) {
    const v = live.get(id); if (!v) return;
    live.delete(id);
    try { if (despawner) despawner(v); else if (host.vehicles?.remove) host.vehicles.remove(v); else if (host.vehicles?.despawn) host.vehicles.despawn(v); } catch (e) { console.error('[garage] despawn failed', e); }
  }
  function spawn(r, pos, heading) {
    let v = null;
    try {
      if (spawner) v = spawner(r, pos, heading);
      else if (host.vehicles?.spawn) v = host.vehicles.spawn(r.modelKey, { x: pos[0], y: pos[1], z: pos[2] }, heading, { ai: false, owned: true });
    } catch (e) { console.error('[garage] spawn failed', e); v = null; }
    if (!v) return null;
    v.ownedId = r.id; v.owned = true; if (r.plate) v.plate = r.plate;
    try { if (restore) restore(v, r.condition, r); else { for (const k of ['health', 'fuel', 'dirt', 'odometer']) if (typeof r.condition?.[k] === 'number') v[k] = r.condition[k]; if (r.condition?.blob && typeof v.deserialize === 'function') v.deserialize(r.condition.blob); } } catch (e) { console.error('[garage] restore failed', e); }
    live.set(r.id, v);
    return v;
  }
  G.store = (id, propertyId) => {
    const r = rec(id), d = defs.get(propertyId);
    if (!r) return { ok: false, reason: 'no_vehicle' };
    if (!d || !Pr.access(propertyId)) return { ok: false, reason: 'no_access' };
    if (['impound', 'destroyed', 'lost', 'delivery'].includes(r.location.kind)) return { ok: false, reason: r.location.kind };
    const sl = Pr.slots(propertyId, r.kind);
    if (r.location.propertyId === propertyId) return { ok: true, slot: r.location.slot };
    if (sl.free <= 0) return { ok: false, reason: sl.total ? 'full' : 'no_slots' };
    const taken = new Set(G.at(propertyId).filter((v) => (KIND_SLOT[v.kind] || 'garageSlots') === (KIND_SLOT[r.kind] || 'garageSlots')).map((v) => v.location.slot));
    let slot = 0; while (taken.has(slot)) slot++;
    const v = live.get(id);
    if (v) { r.condition = G.capture(v); if (host.player?.state?.vehicle === v) { try { host.exitVehicle?.(); } catch (e) { /* */ } } removeLive(id); }
    r.location = { kind: KIND_SLOT[r.kind] === 'boatSlips' ? 'slip' : 'garage', propertyId, slot };
    emit('vehicleStored', { record: r, propertyId, slot });
    return { ok: true, slot };
  };
  G.retrieve = (id, opts = {}) => {
    const r = rec(id); if (!r) return { ok: false, reason: 'no_vehicle' };
    if (!['garage', 'slip', 'world'].includes(r.location.kind)) return { ok: false, reason: r.location.kind };
    if (live.get(id)) return { ok: true, vehicle: live.get(id) };
    const d = r.location.propertyId ? defs.get(r.location.propertyId) : null;
    const pos = opts.pos ? vec3arr(opts.pos) : r.location.pos || d?.spawn?.pos && vec3arr(d.spawn.pos) || d?.pos || vec3arr(host.player?.position);
    const heading = opts.heading ?? r.location.heading ?? d?.spawn?.heading ?? 0;
    const v = spawn(r, pos, heading);
    if (!v) return { ok: false, reason: 'no_spawner' };
    r.location = { kind: 'world', pos, heading };
    emit('vehicleRetrieved', { record: r, vehicle: v });
    return { ok: true, vehicle: v };
  };
  G.impound = (id, opts = {}) => {
    const r = rec(id); if (!r) return null;
    const v = live.get(id);
    if (v) { r.condition = G.capture(v); removeLive(id); }
    r.location = { kind: 'impound', since: now(), reason: opts.reason || 'parking', fee: num(opts.fee, ANCHORS.services.impound_fee) };
    r.stats.impounds = (r.stats.impounds || 0) + 1;
    sys.property && Pr.sendMail({ kind: 'impound', title: `Your vehicle was impounded: ${r.name}`, from: 'Port Solana Vehicle Impound', data: { vehicleId: id }, body: `${r.name} (plate ${r.plate}) was towed${opts.reason ? ' for ' + String(opts.reason).replace(/_/g, ' ') : ''}. Release fee: ${fmtMoney(r.location.fee)} plus ${fmtMoney(ANCHORS.services.impound_per_day)} per day of storage. Vehicles not claimed within 10 days are auctioned.` });
    emit('vehicleImpounded', { record: r, fee: r.location.fee });
    return r;
  };
  G.impoundFee = (id) => { const r = rec(id); if (!r || r.location.kind !== 'impound') return 0; return Math.round(r.location.fee + ANCHORS.services.impound_per_day * Math.floor((now() - r.location.since) / DAY)); };
  G.release = (id, opts = {}) => {
    const r = rec(id); if (!r || r.location.kind !== 'impound') return { ok: false, reason: 'not_impounded' };
    const fee = G.impoundFee(id);
    const pay = sys.wallet.pay(fee, { to: 'Port Solana Vehicle Impound', category: 'fees', memo: `Impound release: ${r.name}`, accepts: ['cash', 'card', 'bank'], method: opts.method || 'auto' });
    if (!pay.ok) return { ok: false, reason: pay.reason, fee };
    const lot = S.impoundLot;
    r.location = { kind: 'world', pos: opts.pos ? vec3arr(opts.pos) : lot?.pos || null, heading: opts.heading ?? lot?.heading ?? 0 };
    emit('vehicleReleased', { record: r, fee });
    let vehicle = null;
    if (r.location.pos && opts.spawn !== false) vehicle = spawn(r, r.location.pos, r.location.heading);
    return { ok: true, fee, vehicle };
  };
  G.destroyed = (id) => {
    const r = rec(id); if (!r) return null;
    live.delete(id);
    r.location = { kind: 'destroyed', since: now() };
    const insured = sys.insurance?.has('vehicle', id);
    emit('vehicleLost', { record: r, reason: 'destroyed', insured: !!insured });
    Pr.sendMail({ kind: 'insurance', title: insured ? `Claim ready to file: ${r.name}` : `Total loss: ${r.name}`, from: insured ? sys.insurance.name : 'Port Solana DMV', data: { vehicleId: id },
      body: insured ? `Your ${r.name} was reported destroyed. File the claim with the insurance app and pay the deductible; a replacement is delivered to your home about six hours later.` : `Your ${r.name} (plate ${r.plate}) was reported destroyed. It was not insured, so it has been written off.` });
    return r;
  };
  G.beginDelivery = (id, readyAt) => { const r = rec(id); if (!r) return false; r.location = { kind: 'delivery', readyAt }; r.condition = {}; r.stats.claims = (r.stats.claims || 0) + 1; return true; };
  G.sell = (id, opts = {}) => {
    const r = rec(id); if (!r) return { ok: false, reason: 'no_vehicle' };
    if (['destroyed', 'lost', 'impound', 'delivery'].includes(r.location.kind)) return { ok: false, reason: r.location.kind };
    if (r.hot && !opts.fence) return { ok: false, reason: 'hot' };
    const health = clamp(num(r.condition?.health, 100) / 100, 0.2, 1);
    const proceeds = Math.round(r.value * (r.hot ? 0.22 : 0.62) * (0.5 + 0.5 * health));
    sys.wallet.earn(proceeds, { category: 'vehicles', memo: `Sold ${r.name}`, method: r.hot ? 'cash' : 'deposit', hot: !!r.hot });
    removeLive(id);
    if (r.policyId) sys.insurance?.cancel(r.policyId);
    S.vehicles.splice(S.vehicles.indexOf(r), 1);
    emit('vehicleSold', { record: r, proceeds });
    return { ok: true, proceeds };
  };
  // Note where every live owned vehicle is (called before saving and once a second).
  G.syncWorld = () => {
    for (const [id, v] of live) {
      const r = rec(id); if (!r) { live.delete(id); continue; }
      if (v.disposed || v.alive === false) { live.delete(id); continue; }
      const p = posOf(v);
      if (p && r.location.kind === 'world') { r.location.pos = p.pos; r.location.heading = p.heading; }
    }
  };
  // Bring parked owned vehicles back into the world when the player is near, and put far ones to sleep.
  let streamT = 0;
  G.update = (realDt) => {
    streamT -= realDt; if (streamT > 0) return; streamT = 1;
    G.syncWorld();
    const p = host.player?.position; if (!p) return;
    const cur = host.player?.state?.vehicle || null;
    for (const r of S.vehicles) {
      if (r.location.kind !== 'world' || !r.location.pos) continue;
      const d2 = dist2(r.location.pos[0], r.location.pos[2], p.x, p.z), v = live.get(r.id);
      if (!v && d2 < 140 * 140 && (spawner || host.vehicles?.spawn) && sys.streamOwnedVehicles !== false) spawn(r, r.location.pos, r.location.heading);
      else if (v && v !== cur && d2 > 420 * 420) { r.condition = G.capture(v); removeLive(r.id); }
    }
  };
  G.hourTick = () => {
    const t = now();
    for (const r of [...S.vehicles]) {
      if (r.location.kind === 'delivery' && t >= r.location.readyAt) {
        const home = S.home && defs.get(S.home);
        r.condition = { health: 100, fuel: 1 };
        if (home && Pr.slots(S.home, r.kind).free > 0) { const taken = new Set(G.at(S.home).map((v) => v.location.slot)); let slot = 0; while (taken.has(slot)) slot++; r.location = { kind: KIND_SLOT[r.kind] === 'boatSlips' ? 'slip' : 'garage', propertyId: S.home, slot }; }
        else r.location = { kind: 'world', pos: home?.spawn?.pos ? vec3arr(home.spawn.pos) : home?.pos || null, heading: num(home?.spawn?.heading) };
        emit('vehicleDelivered', { record: r });
        Pr.sendMail({ kind: 'insurance', title: `Delivered: ${r.name}`, from: sys.insurance?.name || 'Insurer', body: `Your replacement ${r.name} has been delivered${home ? ' to ' + home.name : ''}.`, data: { vehicleId: r.id } }, { immediate: true });
      } else if (r.location.kind === 'impound' && t - r.location.since > 10 * DAY) {
        if (r.policyId) sys.insurance?.cancel(r.policyId);
        S.vehicles.splice(S.vehicles.indexOf(r), 1);
        emit('vehicleLost', { record: r, reason: 'auctioned' });
      } else if (r.location.kind === 'destroyed' && !sys.insurance?.has('vehicle', r.id) && t - r.location.since > 2 * DAY) {
        S.vehicles.splice(S.vehicles.indexOf(r), 1);    // an uninsured wreck is written off
      }
    }
  };
  // events from the vehicle tracks
  G.onVehicleDestroyed = (vehicle) => { const r = G.of(vehicle); if (r) G.destroyed(r.id); };
  G.onVehicleTowed = (vehicle, reason) => { const r = G.of(vehicle); if (r) G.impound(r.id, { reason }); };
  Pr.onRepossessed = (collateral) => {
    if (!collateral) return;
    if (collateral.type === 'property' && S.states[collateral.id]?.access === 'owned') { for (const v of G.at(collateral.id)) G.impound(v.id, { reason: 'repossession' }); moveOut(collateral.id, 'repossessed'); emit('propertySold', { id: collateral.id, proceeds: 0, repossessed: true }); }
    if (collateral.type === 'vehicle') G.unregister(collateral.id, 'repossessed');
  };

  // ---------------------------------------------------------------- save slice
  Pr.reset = () => {
    live.clear(); defaults(); S.fresh = true;
    for (const d of defs.values()) if (d.starter) grant(d.id, 'owned');
  };
  Pr.toSave = () => { G.syncWorld(); const o = clone(S); delete o.fresh; return o; };
  Pr.fromSave = (d) => {
    live.clear(); defaults();
    if (!d) { Pr.reset(); return; }
    Object.assign(S, clone(d)); S.fresh = false;
    S.states ||= {}; S.mailQueue ||= []; S.heldMail ||= []; S.vehicles ||= [];
  };
  Pr.garage = G;
  Pr.raw = () => S;
  defaults(); S.fresh = true;
  return Pr;
}

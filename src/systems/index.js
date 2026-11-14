// Core systems: createSystems(host) builds the whole simulation backbone on a host object (the game, or a bare stub in
// Node tests) and wires the pieces together: save slices, scheduled ticks, catch-up after time skips, and the events
// core-systems listens to. Engine-free. The game-specific glue (player position, camera wobble, dropped-item models)
// lives in systems.v2.js.
import { makeBus, makeRng, num, hash32 } from './util.js';
import { openStorage, syncLocal, createMemoryStorage } from './storage.js';
import { createSave } from './save.js';
import { createTime, DAY } from './time.js';
import { createSettingsStore } from './settings.js';
import { createEconomy } from './economy.js';
import { createItems } from './items.js';
import { createInventory } from './inventory.js';
import { createNeeds } from './needs.js';
import { createMoney } from './money.js';
import { createProperty } from './property.js';
import { createStats, createNews, createDeltas, createMemory } from './worldstate.js';
import { createBusiness } from './business.js';

export const HOME_ID = 'nico_house';

export function createSystems(host, opts = {}) {
  if (!host.on || !host.emit) { const bus = makeBus(); host.on = bus.on; host.emit = bus.emit; }
  host.player = host.player || {};
  host.settings = host.settings || {};
  let uidSeq = 0;
  const sys = {
    host, appVersion: opts.appVersion || '',
    realNow: opts.realNow || (() => Date.now()),
    openStorage: () => (opts.storage ? Promise.resolve(opts.storage) : opts.memory ? Promise.resolve(createMemoryStorage()) : openStorage({ env: opts.env || globalThis })),
    storage: opts.storage || null,
    syncLocal: opts.syncLocal !== undefined ? opts.syncLocal : (opts.storage || opts.memory ? null : syncLocal(opts.env || globalThis)),
    catalog: opts.catalog || null,          // tests pass a product catalog; the game uses game.design
    physics: opts.physics || { ground: () => 0, ray: () => null },
    uid: (prefix = 'u') => prefix + (++uidSeq).toString(36),
    rng: makeRng(opts.seed || 12345),
  };

  sys.settingsStore = createSettingsStore(sys);
  sys.time = createTime(sys);
  sys.economy = createEconomy(sys);
  sys.stats = createStats(sys);
  sys.news = createNews(sys);
  sys.deltas = createDeltas(sys);
  sys.memory = createMemory(sys);
  sys.items = createItems(sys);
  sys.inventory = createInventory(sys);
  sys.needs = createNeeds(sys);
  sys.money = createMoney(sys);
  sys.wallet = sys.money.wallet; sys.bank = sys.money.bank; sys.fines = sys.money.fines; sys.insurance = sys.money.insurance;
  sys.property = createProperty(sys);
  sys.garage = sys.property.garage;
  sys.business = createBusiness(sys);
  sys.stocks = null; // HANDOFF: stocks.js is not written yet (see docs/v2/reports/core-systems.md)
  sys.betting = null; // HANDOFF: betting.js is not written yet (see docs/v2/reports/core-systems.md)
  sys.lottery = null; // HANDOFF: lottery.js is not written yet (see docs/v2/reports/core-systems.md)
  sys.save = createSave(sys);

  // Nico's stilt house on Key Paloma: the first safehouse. The nico-house track re-defines it with exact positions.
  sys.property.define({
    id: HOME_ID, kind: 'house', name: "Nico's house", district: 'key-paloma', pos: opts.homePos || null, price: 890000, starter: true, provisional: true,
    features: { bed: true, wardrobe: true, stash: true, mail: true, shower: true, kitchen: true, fridge: true }, garageSlots: 2, boatSlips: 1,
  });

  // medicine: one use per item
  sys.items.registerUse('medicine', (item, def) => { const r = sys.needs.medicine(def); sys.inventory.remove(item.uid, 1); return r; });

  // ---------------------------------------------------------------- scheduled ticks
  const T = sys.time;
  T.every(60, (ev) => {
    const hour = Math.round(ev.hour) % 24;
    sys.money.hourTick();
    sys.property.hourTick(hour, ev.weekday);
    sys.deltas.tick();
    sys.business.hourTick(ev);
    sys.betting?.tick(ev.now);
    sys.stats.max('netWorthPeak', hour % 6 === 0 ? sys.bank.netWorth().total : 0);
  }, { id: 'core:hour', phase: 0, catchUp: 'all' });
  T.every(5, (ev) => { sys.news.tick(); sys.stocks?.tick(ev.now); }, { id: 'core:5min', phase: 0, catchUp: 'all' });
  T.onHour(0, (ev) => {
    sys.needs.settleDay(ev.day - 1);
    sys.stats.set('day', ev.day);
    sys.business.dayTick(ev);
    sys.stocks?.dayTick(ev);
    sys.betting?.dayTick(ev);
  }, { id: 'core:midnight' });
  T.onHour(9, (ev) => { sys.money.dayTick(ev.day, ev.weekday); sys.property.dayTick(); }, { id: 'core:bills' });
  sys.catchUp = (minutes, info) => { sys.needs.catchUp(minutes, info); };

  // ---------------------------------------------------------------- events core-systems listens to
  host.on('crime', (c = {}) => {
    sys.stats.add('crimes', 1); sys.stats.add('crime:' + (c.type || 'other'), 1);
    sys.news.noteCrime(c);
    const brandId = c.brandId || c.shop?.brand || c.shop?.brandId || null;
    if (brandId && (c.type === 'robbery' || c.type === 'shoplift' || c.type === 'heist')) host.emit('brandEvent', { brandId, kind: c.type === 'shoplift' ? 'theft' : 'robbery', magnitude: c.type === 'heist' ? 1 : c.type === 'robbery' ? 0.5 : 0.08, place: c.shop?.name || null, amount: c.amount || 0 });
  });
  host.on('playerDied', () => { try { sys.money.onDeath(); sys.inventory.consume.cancel(); } catch (e) { console.error('[systems] death handling failed', e); } });
  host.on('arrest', (a) => { try { sys.money.onArrest(a || {}); sys.inventory.consume.cancel(); } catch (e) { console.error('[systems] arrest handling failed', e); } });
  host.on('pickup', (p) => sys.stats.add('pickups', 1));
  host.on('activityEnd', (a) => { if (a?.success) sys.stats.add('activitiesDone', 1); });
  host.on('jobPaid', (j = {}) => sys.wallet.wage(j));
  host.on('missionComplete', (m) => { sys.stats.add('missionsDone', 1); sys.stats.log(`Finished: ${m?.name || m?.id || 'a mission'}`, { kind: 'mission' }); sys.save.requestAutosave(4); });
  host.on('vehicleDestroyed', (e) => sys.garage.onVehicleDestroyed(e?.vehicle || e));
  host.on('vehicleTowed', (e) => sys.garage.onVehicleTowed(e?.vehicle || e, e?.reason));
  host.on('repossessed', (e) => sys.property.onRepossessed(e?.collateral));
  host.on('suspiciousDeposit', (e) => sys.news.post({ kind: 'local', headline: 'Banks told to watch for large cash deposits after string of robberies', priority: 0, channels: ['radio', 'phone'] }));
  host.on('lotteryWon', (e) => { if (e?.prize >= 5000) sys.news.post({ kind: 'local', headline: `Local player scratches a ${'$' + Math.round(e.prize).toLocaleString('en-US')} winner`, body: e.place ? `The ticket was sold at ${e.place}.` : '', priority: 1 }); });

  // ---------------------------------------------------------------- save slices
  const slice = (key, order, mod, extra = {}) => sys.save.register(key, { version: 1, order, save: () => mod.toSave(), load: (d) => (d ? mod.fromSave(d) : mod.reset()), ...extra });
  sys.save.register('core', { version: 1, order: 0,
    save: () => ({ uidSeq, rng: sys.rng.state, clock: T.toSave(), settings: sys.settingsStore.toSave() }),
    load: (d) => {
      if (!d) { uidSeq = 0; sys.rng.state = (hash32('seed', sys.realNow(), Math.floor(Math.random() * 1e9)) >>> 0) || 1; T.newGame(opts.weatherSeed); sys.settingsStore.fromSave(null); return; }
      uidSeq = num(d.uidSeq); sys.rng.state = (num(d.rng, 1) >>> 0) || 1; T.fromSave(d.clock || {}); sys.settingsStore.fromSave(d.settings || null);
    } });
  slice('money', 5, sys.money);
  slice('inventory', 10, sys.inventory);
  slice('needs', 12, sys.needs);
  slice('property', 14, sys.property);
  slice('stats', 20, sys.stats);
  slice('news', 21, sys.news);
  slice('deltas', 22, sys.deltas);
  slice('memory', 23, sys.memory);
  slice('business', 30, sys.business);
  if (sys.stocks) slice('stocks', 31, sys.stocks);
  if (sys.betting) slice('betting', 32, sys.betting);
  if (sys.lottery) slice('lottery', 33, sys.lottery);

  sys.metaProvider = () => {
    const p = host.player?.position;
    let place = null; try { place = p ? sys.economy.district(p.x, p.z).name : null; } catch (e) { place = null; }
    return { day: T.day, clock: T.clockText({ h24: false }), dateText: T.date.text, weekday: T.weekdayName, place, cash: sys.wallet.cash, bank: sys.bank.balance, health: Math.round(num(host.player?.health, 100)) };
  };
  sys.unsafeToSave = () => !!(host.ui?.dead || host.ui?.arrested || host.ui?.busted || sys.needs.sleeping || sys.needs.blackingOut);

  // ---------------------------------------------------------------- per-frame update (real seconds; skipped while paused)
  let lastPos = null;
  sys.update = (realDt) => {
    T.update(realDt);
    sys.needs.update(realDt);
    sys.inventory.update(realDt);
    sys.garage.update(realDt);
    sys.stats.update(realDt);
    // distance stats
    const P = host.player, p = P?.position;
    if (p) {
      if (lastPos) {
        const d = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
        if (d > 0.001 && d < 80) {
          const v = P.state?.vehicle;
          if (P.state?.inVehicle) sys.stats.add(v?.isBoat || v?.boat ? 'distanceByBoat' : v?.isAircraft ? 'distanceFlown' : 'distanceDriven', d);
          else if (P.swimming) sys.stats.add('distanceSwum', d);
          else sys.stats.add('distanceOnFoot', d);
        }
        lastPos.x = p.x; lastPos.z = p.z;
      } else lastPos = { x: p.x, z: p.z };
    }
  };
  // runs even while the game is paused (autosave timer, settings persistence)
  sys.updateAlways = (realDt) => { sys.settingsStore.update(realDt); sys.save.update(host.ui?.paused ? 0 : realDt); };

  // Attach the public API to the host (game.save, game.time, ...).
  sys.attach = () => {
    Object.assign(host, {
      save: sys.save, time: sys.time, settingsStore: sys.settingsStore, difficulty: sys.settingsStore.difficulty, items: sys.items, inventory: sys.inventory,
      needs: sys.needs, wallet: sys.wallet, bank: sys.bank, fines: sys.fines, insurance: sys.insurance, economy: sys.economy, hours: sys.economy.hours,
      property: sys.property, garage: sys.garage, business: sys.business, stocks: sys.stocks, betting: sys.betting, lottery: sys.lottery,
      news: sys.news, stats: sys.stats, memory: sys.memory, systems: sys,
    });
    host.worldState = { deltas: sys.deltas };   // game.world is the Rapier world, so deltas live on game.worldState
    return sys;
  };
  sys.DAY = DAY;
  return sys;
}

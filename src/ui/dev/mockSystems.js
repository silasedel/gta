// DEV ONLY (never imported by the game): stand-ins for other tracks' systems so UI screens can be built and
// screenshotted before those tracks land. Shapes follow src/systems/README.md (core-systems) where it exists;
// for story / jobs / net / wardrobe they are the shapes src/ui expects (listed in docs/v2/reports/ui-frontend.md).
// The real game never uses this file: with a system missing, every screen shows its honest "not available" state.
import { rng } from '../core/dom.js';

export function installMockSystems(game, opts = {}) {
  const R = rng(opts.seed || 7);
  const emit = (n, d) => game.emit?.(n, d);
  // ---------------- time (core-systems shape) ----------------
  const T = game.time = {
    day: opts.day || 12, get hour() { return game.timeOfDay; }, get now() { return (this.day - 1) * 1440 + game.timeOfDay * 60; },
    get minuteOfDay() { return game.timeOfDay * 60; }, get weekday() { return (this.day + 4) % 7; },
    get weekdayName() { return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][this.weekday]; },
    get isWeekend() { return this.weekday === 0 || this.weekday === 6; },
    get date() { const d = new Date(2026, 5, 4 + this.day); const wd = this.weekdayName, mo = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]; return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), text: `${wd.slice(0, 3)}, ${mo.slice(0, 3)} ${d.getDate()}`, long: `${wd}, ${mo} ${d.getDate()}, ${d.getFullYear()}`, iso: d.toISOString().slice(0, 10) }; },
    clockText(o) { const t = game.timeOfDay, h = Math.floor(t), m = Math.floor((t - h) * 60); return o?.h24 ? String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') : (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM'); },
    dayMinutes: 144, moon: { phase: 0.42, illumination: 0.86, name: 'Waxing Gibbous', ageDays: 11 }, tide: { height: 0.4, meters: 0.22, rising: true, nextHighIn: 95, nextLowIn: 460, rangeMeters: 0.7 }, sun: { rise: 6.6, set: 20.1, daylight: true },
    skip(min) { game.timeOfDay = (game.timeOfDay + min / 60) % 24; emit('timeSkip', { minutes: min }); },
  };
  // ---------------- wallet and bank ----------------
  let cash = opts.cash ?? 1840, hot = 320, checking = opts.bank ?? 12480.55, savings = 30200;
  const ledger = [];
  const entry = (account, amount, memo, party, category) => { const e = { id: ledger.length + 1, t: T.now, day: T.day, clock: T.clockText(), account, amount, balance: account === 'cash' ? cash : account === 'checking' ? checking : savings, category, memo, party, place: null, method: account === 'cash' ? 'cash' : 'card' }; ledger.push(e); emit('money', { account, amount, balance: e.balance, entry: e }); return e; };
  for (const [acc, amt, memo, party, cat] of [['checking', 1500, 'Direct deposit', 'Paloma Charters LLC', 'wage'], ['checking', -64.2, 'Fuel', 'Sunward Fuel', 'fuel'], ['checking', -18.75, 'Lunch', 'La Ventanita', 'food'], ['cash', 220, 'Tips', 'Taxi shift', 'wage'], ['checking', -129, 'Sneakers', 'Kickline', 'clothing'], ['savings', 12.4, 'Interest', 'Bank', 'interest'], ['checking', -45, 'Parking ticket', 'City of Miami', 'fine'], ['checking', -900, 'Rent', 'Key Paloma stilt house', 'rent'], ['cash', -6, 'Cafecito x2', 'Walk-up window', 'food'], ['checking', 480, 'Boat tour payout', 'Paloma Charters LLC', 'wage']]) entry(acc, amt, memo, party, cat);
  Object.defineProperty(game.player, 'money', { get: () => cash, set: (v) => { cash = v; }, configurable: true });
  game.wallet = {
    get cash() { return cash; }, get hot() { return hot; },
    earn(a, o = {}) { cash += a; return entry('cash', a, o.memo || 'Cash', o.from, o.category); },
    pay(a, o = {}) { if (o.method === 'card' || (o.method !== 'cash' && cash < a)) { if (checking < a) return { ok: false, reason: 'card_declined' }; checking -= a; return { ok: true, method: 'card', entry: entry('checking', -a, o.memo || 'Purchase', o.to, o.category) }; } if (cash < a) return { ok: false, reason: 'insufficient' }; cash -= a; return { ok: true, method: 'cash', entry: entry('cash', -a, o.memo || 'Purchase', o.to, o.category) }; },
    canPay(a) { return { ok: cash + checking >= a, method: cash >= a ? 'cash' : 'card' }; },
  };
  game.bank = {
    get balance() { return checking; }, get savings() { return savings; }, card: { last4: '4417', frozen: false, dailyLimit: 5000, spentToday: 212.95 }, ledger,
    deposit(a) { if (a > cash) return { ok: false, reason: 'insufficient' }; cash -= a; checking += a; entry('checking', a, 'Cash deposit', 'ATM', 'transfer'); return { ok: true, fee: 0 }; },
    withdraw(a) { if (a > checking) return { ok: false, reason: 'insufficient' }; checking -= a; cash += a; entry('checking', -a, 'Cash withdrawal', 'ATM', 'transfer'); return { ok: true, fee: 0 }; },
    transfer(a, from, to) { if (from === 'checking' && a <= checking) { checking -= a; savings += a; } else if (from === 'savings' && a <= savings) { savings -= a; checking += a; } else return { ok: false, reason: 'insufficient' }; entry(to, a, 'Transfer from ' + from, 'You', 'transfer'); return { ok: true }; },
    statement({ limit = 50, account } = {}) { return ledger.filter((e) => !account || e.account === account).slice(-limit).reverse(); },
    netWorth() { return { cash, checking, savings, stocks: 8420, property: 0, vehicles: 31500, businesses: 0, debts: 0, total: cash + checking + savings + 8420 + 31500 }; },
    loans: { list: () => [] },
  };
  game.fines = { list: () => [{ id: 'f1', kind: 'speeding', amount: 180, place: 'MacArthur Causeway', dueDay: T.day + 5, paid: false }], pay(id) { return { ok: true }; } };
  // ---------------- stocks ----------------
  const mk = (symbol, name, sector, price) => { const history = []; let p = price * (0.82 + R() * 0.2); for (let i = 0; i < 60; i++) { p *= 1 + (R() - 0.48) * 0.04; history.push(+p.toFixed(2)); } history.push(price); const open = history[history.length - 8]; return { symbol, brandId: symbol.toLowerCase(), name, sector, price, open, change: +(price - open).toFixed(2), changePct: +((price - open) / open * 100).toFixed(2), high52: +(Math.max(...history) * 1.08).toFixed(2), low52: +(Math.min(...history) * 0.9).toFixed(2), history }; };
  const stocks = [mk('SNWD', 'Sunward Fuel', 'Energy', 48.2), mk('KCKL', 'Kickline Athletics', 'Retail', 112.75), mk('VNTA', 'La Ventanita Foods', 'Food', 23.1), mk('MRZL', 'Marazul Hotels', 'Travel', 76.4), mk('PLMA', 'Paloma Marine', 'Boats', 15.85), mk('ORLO', 'Orlo Mobile', 'Tech', 231.6), mk('CAYO', 'Cayo Cola', 'Drinks', 58.05), mk('BRKB', 'Brickell Bancorp', 'Finance', 97.3)];
  const pos = new Map([['SNWD', { shares: 40, avgCost: 41.1 }], ['ORLO', { shares: 12, avgCost: 250.4 }], ['CAYO', { shares: 60, avgCost: 52.0 }]]);
  game.stocks = {
    list: () => stocks, get: (s) => stocks.find((x) => x.symbol === s), marketOpen: true, index: { value: 4821.6, changePct: 0.74 },
    buy(sym, n) { const s = this.get(sym), cost = s.price * n; if (cost > checking) return { ok: false, reason: 'insufficient' }; checking -= cost; const p = pos.get(sym) || { shares: 0, avgCost: 0 }; p.avgCost = (p.avgCost * p.shares + cost) / (p.shares + n); p.shares += n; pos.set(sym, p); entry('checking', -cost, `Bought ${n} ${sym}`, 'Tide Invest', 'stocks'); return { ok: true, cost }; },
    sell(sym, n) { const s = this.get(sym), p = pos.get(sym); if (!p || p.shares < n) return { ok: false, reason: 'no_shares' }; p.shares -= n; if (!p.shares) pos.delete(sym); const pr = s.price * n; checking += pr; entry('checking', pr, `Sold ${n} ${sym}`, 'Tide Invest', 'stocks'); return { ok: true, proceeds: pr }; },
    portfolio() { const positions = [...pos].map(([symbol, p]) => { const s = stocks.find((x) => x.symbol === symbol); return { symbol, shares: p.shares, avgCost: p.avgCost, value: s.price * p.shares, pnl: (s.price - p.avgCost) * p.shares }; }); return { positions, value: positions.reduce((a, b) => a + b.value, 0), pnl: positions.reduce((a, b) => a + b.pnl, 0) }; },
  };
  // ---------------- news and stats ----------------
  const stories = [
    { id: 'n1', headline: 'Gray sedan sought after corner-store robbery on SW 8th Street', body: 'Witnesses describe a man in a teal shirt. Police ask drivers on Calle Ocho to check dash cameras.', kind: 'crime', about: 'player', district: 'Little Havana', priority: 2, at: T.now - 25 },
    { id: 'n2', headline: 'Sunward Fuel shares dip after tanker fire near the port', kind: 'market', about: 'snwd', priority: 1, at: T.now - 90, body: 'The stock fell 4% in early trading.' },
    { id: 'n3', headline: 'Afternoon thunderstorms expected across the bay', kind: 'weather', priority: 1, at: T.now - 140, body: 'Lightning and brief flooding on low streets are possible between 3 and 6 PM.' },
    { id: 'n4', headline: 'Boat parade this Saturday closes the Venetian Causeway drawbridge', kind: 'event', priority: 0, at: T.now - 300, body: 'Expect delays from noon. Fireworks follow at 9 PM.' },
    { id: 'n5', headline: 'Ninth-inning comeback: the Southline Herons walk it off', kind: 'sports', priority: 0, at: T.now - 500, body: 'A walk-off double sends the home crowd into Friday night.' },
    { id: 'n6', headline: 'I-95 northbound: two lanes blocked at NW 20th Street', kind: 'traffic', priority: 1, at: T.now - 12, body: 'A stalled delivery truck. Use Biscayne Boulevard.' },
  ];
  const subs = new Set();
  game.news = { feed: ({ kind, limit = 20 } = {}) => stories.filter((s) => !kind || s.kind === kind).sort((a, b) => b.at - a.at).slice(0, limit), latest: () => stories[0], breaking: null, subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }, post(s) { const st = { id: 'n' + (stories.length + 1), at: T.now, priority: 1, ...s }; stories.unshift(st); for (const f of subs) f(st); emit('news', { story: st }); return st; } };
  game.stats = { all: () => ({ playtime: 5 * 3600 + 1200, distanceDriven: 184300, distanceWalked: 22100, distanceSwum: 1400, distanceBoat: 30100, vehiclesStolen: 14, missionsDone: 6, jobsDone: 19, moneyEarned: 48210, moneySpent: 21870, timesWasted: 3, timesBusted: 2, topSpeedKmh: 241, starsEvaded: 27, itemsStolen: 31, mealsEaten: 44, fishCaught: 8, daysSurvived: 12 }), get(k) { return this.all()[k]; }, achievements: [{ id: 'a1', name: 'Keys to the Keys', description: 'Reach Tern Key by road.', unlocked: true }, { id: 'a2', name: 'Clean Hands', description: 'Lose three stars without changing cars.', unlocked: false }], journal: [] };
  // ---------------- save ----------------
  const meta = { day: T.day, clock: '6:42 PM', dateText: 'Tue, Jun 16', place: 'Key Paloma', cash, bank: checking, playtime: 5 * 3600 + 1200, version: '2.0.0-dev' };
  game.save = {
    slot: 'slot1', meta, playtime: meta.playtime, busy: false, autosaveMinutes: 3,
    hasContinue: async () => opts.hasSave !== false, list: async () => [{ slot: 'slot1', latest: { ...meta, kind: 'auto', savedAt: Date.now() - 3600e3 }, records: {}, corrupt: false }, { slot: 'slot2', latest: { ...meta, day: 3, place: 'Little Havana', clock: '9:10 AM', dateText: 'Sun, Jun 7', playtime: 3100, cash: 240, bank: 800, kind: 'manual', savedAt: Date.now() - 86400e3 * 3 }, records: {}, corrupt: false }, { slot: 'slot3', latest: null, records: {}, corrupt: false }],
    continue: async () => ({ ok: true, slot: 'slot1', meta }), load: async (slot) => ({ ok: true, slot, meta }), newGame: async ({ slot } = {}) => ({ ok: true, slot: slot || 'slot1' }),
    save: async (o) => { emit('saved', { slot: 'slot1', kind: o?.kind || 'manual', meta }); return { ok: true, slot: 'slot1', kind: o?.kind || 'manual', bytes: 18200, meta }; }, delete: async () => true,
    exportFile: async () => ({ filename: 'port-solana-slot1.pssave', text: '{}' }), importText: async () => ({ ok: true, slot: 'slot3', meta }),
  };
  // ---------------- garage and property ----------------
  game.garage = { records: [
    { id: 'v1', modelKey: 'pickup_muscle', kind: 'car', name: 'Brava Ranchero 427', plate: 'KPL 2291', value: 14500, condition: { health: 0.71, fuel: 0.4, dirt: 0.8 }, location: { kind: 'world', pos: [320, 0, 6480] }, keys: true, stats: { class: 'Muscle pickup', topSpeedKmh: 178, accel: 0.62, handling: 0.48 } },
    { id: 'v2', modelKey: 'dirtbike', kind: 'bike', name: 'Tern 250 Scrambler', plate: 'M 4410', value: 3200, condition: { health: 0.9, fuel: 0.75 }, location: { kind: 'garage', propertyId: 'home' }, keys: true, stats: { class: 'Dirt bike', topSpeedKmh: 132, accel: 0.7, handling: 0.74 } },
    { id: 'v3', modelKey: 'skiff', kind: 'boat', name: 'Paloma 17 Skiff', plate: 'FL 8842 KP', value: 9800, condition: { health: 0.95, fuel: 0.6 }, location: { kind: 'slip', propertyId: 'home' }, keys: true, stats: { class: 'Flats skiff', topSpeedKmh: 64, accel: 0.55, handling: 0.8 } },
    { id: 'v4', modelKey: 'sedan_old', kind: 'car', name: 'Corsa Meridian LX', plate: 'DRM 0073', value: 4000, condition: { health: 0.3, fuel: 0.1 }, location: { kind: 'impound', fee: 350 }, keys: true, stats: { class: 'Sedan', topSpeedKmh: 165, accel: 0.4, handling: 0.5 } },
  ], retrieve: (id) => ({ ok: true }), release: (id) => ({ ok: true, fee: 350 }), owns: () => false };
  game.property = { home: { id: 'home', kind: 'house', name: "Nico's stilt house", district: 'Key Paloma', pos: [300, 3, 6500], features: { bed: true, wardrobe: true, stash: true, mail: true, shower: true, kitchen: true }, garageSlots: 2, boatSlips: 1 }, owned() { return [this.home]; }, mailbox: () => ({ items: [{ id: 'm1', kind: 'fine', title: 'Notice of violation', body: 'Speeding, 58 in a 40. $180 due in 5 days.', from: 'Miami-Dade Clerk', at: T.now - 300 }], unread: 1 }) };
  // ---------------- story and jobs (shapes src/ui expects) ----------------
  const M = (id, chapter, title, giver, state, description, reward, best) => ({ id, chapter, title, giver, state, description, reward, best: best || null, replayable: state === 'done' });
  const missions = [
    M('m01', 1, 'Low Tide', 'Abuela Lucía', 'done', 'Fix the skiff and run the morning charter before the tide drops.', 400, { time: 412, medal: 'gold' }),
    M('m02', 1, 'Dead Reckoning', 'Tío Rafa', 'done', 'Follow Rafa across the flats without touching bottom.', 650, { time: 530, medal: 'silver' }),
    M('m03', 1, 'First Light on Eighth', 'Mirta', 'done', 'Deliver the cooler to a walk-up window on Calle Ocho. Do not open it.', 900, { time: 688, medal: 'bronze' }),
    M('m04', 2, 'Causeway Money', 'Dre Castillo', 'active', 'Tail the armored truck along the MacArthur and note every stop.', 1500),
    M('m05', 2, 'A Friendly Valet', 'Dre Castillo', 'available', 'Borrow a uniform. Park exactly one car.', 2200),
    M('m06', 2, 'Open Water', 'Captain Inez', 'locked', 'Meet a yacht three miles out, at night, with no lights.', 3000),
    M('m07', 3, 'Paper Trail', 'Mirta', 'locked', 'Every receipt leads somewhere. Follow this one to Brickell.', 4000),
    M('m08', 3, 'The Quiet Vault', 'Dre Castillo', 'locked', 'Scout, crew, gear, getaway. Then choose: loud or quiet.', 25000),
  ];
  const chapters = [{ id: 1, title: 'Salt and Rust', subtitle: 'Key Paloma', missions: ['m01', 'm02', 'm03'] }, { id: 2, title: 'The Mainland', subtitle: 'Miami', missions: ['m04', 'm05', 'm06'] }, { id: 3, title: 'High Water', subtitle: 'Brickell and the bay', missions: ['m07', 'm08'] }];
  game.story = { chapters, missions, get active() { return missions.find((m) => m.state === 'active'); }, objective: { title: 'Causeway Money', text: 'Follow the armored truck. Stay two cars back.', steps: [{ text: 'Pick up a car that blends in', done: true }, { text: 'Follow the truck to its second stop', done: false }, { text: 'Photograph the guard change', done: false }], distance: 640, target: { x: 1200, z: 400 } }, start(id) { emit('mission:start', { id }); return { ok: true }; }, replay(id) { emit('mission:start', { id, replay: true }); return { ok: true }; }, progress: { done: 3, total: 21 } };
  const J = (id, name, kind, employer, description, pay, x, z, place, state = 'available') => ({ id, name, kind, employer, description, pay, location: { x, z, name: place }, state });
  const jobs = [J('taxi', 'Taxi shift', 'taxi', 'Coral Cab Co.', 'Pick up fares across the city. Tips follow smooth driving.', '$18/h + tips', -2600, 300, 'Downtown depot'), J('delivery', 'Parcel route', 'delivery', 'Dartway Parcel', 'Twelve stops before the truck is due back.', '$22/h', -3000, -1500, 'Wynwood hub'), J('tours', 'Boat tours', 'boat', 'Paloma Charters', 'Take visitors around the bay islands. Keep it smooth.', '$120/tour', 300, 6400, 'Key Paloma dock'), J('valet', 'Valet stand', 'valet', 'Marazul Hotels', 'Park them fast. Do not scratch them.', '$15/h + tips', 3300, -900, 'Collins Ave'), J('lifeguard', 'Lifeguard shift', 'lifeguard', 'Miami Beach Ocean Rescue', 'Watch the water from tower 12.', '$20/h', 3900, -200, 'South Beach', 'locked'), J('tow', 'Tow truck', 'tow', 'Gator Tow & Recovery', 'Clear wrecks and haul illegally parked cars to the lot.', '$90/tow', -4100, 900, 'Little Havana yard')];
  game.jobs = { list: () => jobs, active: null, start(id) { this.active = jobs.find((j) => j.id === id); emit('job:start', { id }); return { ok: true }; }, quit() { this.active = null; } };
  // ---------------- contacts / messages / social (story-jobs and npc-ai feed the phone through game.phone.* hooks) ----------------
  game.contactsSeed = [{ id: 'lucia', name: 'Abuela Lucía', role: 'Family', place: 'Key Paloma' }, { id: 'rafa', name: 'Tío Rafa', role: 'Charter captain', place: 'Key Paloma dock' }, { id: 'mirta', name: 'Mirta', role: 'Walk-up window, Calle Ocho', place: 'Little Havana' }, { id: 'dre', name: 'Dre Castillo', role: 'Knows a guy', place: 'Overtown' }, { id: 'inez', name: 'Captain Inez', role: 'Yacht captain', place: 'Miami Beach Marina' }, { id: 'jeff', name: 'Jeff', role: 'Hot dog stand, best prices on the beach', place: 'South Pointe' }];
  // ---------------- wardrobe (character track) ----------------
  game.wardrobe = { currentOutfit: { id: 'signature', name: 'Signature tropical shirt' }, outfits: [{ id: 'signature', name: 'Signature tropical shirt' }, { id: 'dock', name: 'Dock work' }, { id: 'night', name: 'Night out' }], openUI(o) { game.hud?.notify?.('Wardrobe opened (mock)', 2000); emit('wardrobe:open', o); }, wear(id) { this.currentOutfit = this.outfits.find((o) => o.id === id) || this.currentOutfit; emit('outfitChanged', { id }); } };
  // ---------------- multiplayer (shape src/ui expects from game.net) ----------------
  const chat = [{ from: 'marisol_k', text: 'anyone near the port?', t: Date.now() - 60000 }, { from: 'bigtuna', text: 'boat race at 8, buy-in 500', t: Date.now() - 20000 }];
  game.net = {
    status: opts.online ? 'online' : 'offline', serverUrl: 'ws://127.0.0.1:5210', connected: !!opts.online, me: { id: 'me', name: 'Nico' },
    session: opts.online ? { code: 'KP-7Q4X', name: "Nico's session", mode: 'free roam', max: 16, host: 'me', private: true } : null,
    players: opts.online ? [{ id: 'me', name: 'Nico', x: 0, z: 0, ping: 0, host: true }, { id: 'p2', name: 'marisol_k', x: 400, z: -300, ping: 48, talking: true }, { id: 'p3', name: 'bigtuna', x: -900, z: 700, ping: 91 }] : [],
    friends: [{ id: 'f1', name: 'marisol_k', online: true, sessionCode: 'KP-7Q4X' }, { id: 'f2', name: 'bigtuna', online: true }, { id: 'f3', name: 'deco_dan', online: false, lastSeen: '2 days ago' }],
    chat: { history: chat, send(text) { chat.push({ from: 'Nico', text, t: Date.now(), me: true }); emit('net:chat', chat[chat.length - 1]); } },
    async createSession(o) { this.status = 'online'; this.connected = true; this.session = { code: 'KP-' + Math.floor(R() * 9000 + 1000), name: o?.name || "Nico's session", mode: o?.mode || 'free roam', max: o?.max || 16, host: 'me', private: !!o?.private }; this.players = [{ id: 'me', name: this.me.name, ping: 0, host: true }]; emit('net:state', this); return { ok: true, code: this.session.code }; },
    async joinSession(code) { if (!/^[A-Z]{2}-[A-Z0-9]{4}$/i.test(code)) return { ok: false, reason: 'No session with that code' }; this.status = 'online'; this.connected = true; this.session = { code: code.toUpperCase(), name: 'Friend session', mode: 'free roam', max: 16, host: 'p2' }; emit('net:state', this); return { ok: true }; },
    leave() { this.status = 'offline'; this.connected = false; this.session = null; this.players = []; emit('net:state', this); }, setNickname(n) { this.me.name = n; }, invite() { return { ok: true }; }, addFriend(code) { return { ok: true }; },
  };
  game.weather = { kind: opts.weather || 'partly', tempF: 86, humidity: 0.72, wind: { mph: 11, dir: 'ESE' }, forecast: [{ hour: 15, kind: 'storm', tempF: 82 }, { hour: 18, kind: 'rain', tempF: 80 }, { hour: 21, kind: 'clear', tempF: 78 }, { hour: 0, kind: 'clear', tempF: 76 }, { hour: 6, kind: 'fog', tempF: 74 }, { hour: 9, kind: 'sunny', tempF: 81 }] };
  game.player.stamina = 82;
  return game;
}

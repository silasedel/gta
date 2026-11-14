// Core systems: the player's inventory (hand, pockets, bag), generic containers (stashes, fridges, trunks), eat/drink
// sessions with bites and sips, giving / dropping / throwing, and the persistent list of items lying in the world.
import { clamp, num, vec3arr, dist2, clone } from './util.js';
import { SIZE, SIZE_UNITS } from './items.js';

const EAT_SECONDS = 2.4, SIP_SECONDS = 1.9, FIRST_DELAY = 0.7;
const PUBLIC_LIFETIME = 3 * 1440;      // game minutes an item stays on a public street
const SPOILED_LIFETIME = 1440;         // spoiled food left outside is cleared a day later
const WORLD_CAP = 600;

export function createContainer(sys, opts = {}) {
  const I = sys.items;
  const C = { id: opts.id || sys.uid('c'), units: num(opts.units, 8), maxSize: opts.maxSize ?? SIZE.MEDIUM, cool: !!opts.cool, label: opts.label || '', items: [] };
  // huge things (a TV, a crate) only fit in big containers, where they take 8 units each
  const unitOf = (def) => (def.size >= SIZE.HUGE ? 8 : SIZE_UNITS[def.size]);
  C.used = () => C.items.reduce((s, it) => { const d = I.def(it.id); return s + (d ? unitOf(d) * (it.qty || 1) : 0); }, 0);
  C.weight = () => C.items.reduce((s, it) => s + I.weight(it), 0);
  C.free = () => Math.max(0, C.units - C.used());
  // how many of this item fit
  C.room = (item) => {
    const def = I.def(item.id); if (!def) return 0;
    if (def.size > C.maxSize) return 0;
    const u = unitOf(def);
    return u <= 0 ? item.qty : Math.floor((C.free() + 1e-9) / u);
  };
  C.add = (item, qty = item.qty) => { // -> number actually added (merges into stacks)
    const def = I.def(item.id); if (!def) return 0;
    const n = Math.min(qty, C.room(item)); if (n <= 0) return 0;
    let left = n;
    const probe = { ...item, qty: 1 };
    if (C.cool) I.setCooled(probe, true);
    for (const s of C.items) {
      if (left <= 0) break;
      if (s.qty < def.stack && I.canStack(s, probe)) { const k = Math.min(left, def.stack - s.qty); s.qty += k; left -= k; }
    }
    let first = true;
    while (left > 0) {
      const k = Math.min(left, def.stack);
      // the first new stack keeps the incoming uid when the whole item moves, so callers can keep tracking it
      const st = { ...item, uid: first && n === item.qty && !C.items.some((x) => x.uid === item.uid) ? item.uid : sys.uid('i'), qty: k, state: { ...(item.state || {}) } };
      if (item.meta) st.meta = clone(item.meta);
      I.setCooled(st, C.cool);
      C.items.push(st); left -= k; first = false;
    }
    return n;
  };
  C.find = (uidOrId) => C.items.find((it) => it.uid === uidOrId) || C.items.find((it) => it.id === uidOrId) || null;
  C.count = (id) => C.items.reduce((s, it) => s + (it.id === id ? it.qty : 0), 0);
  // remove qty from a stack (by uid) or across stacks (by id); returns removed item instances
  C.take = (uidOrId, qty = 1) => {
    const out = [];
    let need = qty;
    const byUid = C.items.find((it) => it.uid === uidOrId);
    const pool = byUid ? [byUid] : C.items.filter((it) => it.id === uidOrId);
    for (const s of pool) {
      if (need <= 0) break;
      const k = Math.min(need, s.qty);
      const piece = { ...s, qty: k, state: { ...(s.state || {}) } };
      if (k === s.qty) C.items.splice(C.items.indexOf(s), 1); else { s.qty -= k; piece.uid = sys.uid('i'); }
      I.setCooled(piece, false);
      out.push(piece); need -= k;
    }
    return out;
  };
  C.list = () => C.items.slice();
  C.clear = () => { const all = C.items.splice(0); for (const it of all) I.setCooled(it, false); return all; };
  C.transferTo = (other, uidOrId, qty = 1) => {
    let moved = 0;
    for (const piece of C.take(uidOrId, qty)) { const n = other.add(piece, piece.qty); moved += n; if (n < piece.qty) C.add({ ...piece, qty: piece.qty - n }); }
    return moved;
  };
  C.toSave = () => ({ id: C.id, units: C.units, maxSize: C.maxSize, cool: C.cool, label: C.label, items: clone(C.items) });
  C.fromSave = (d) => { if (!d) { C.items = []; return C; } C.units = num(d.units, C.units); C.maxSize = d.maxSize ?? C.maxSize; C.cool = !!d.cool; C.label = d.label || C.label; C.items = clone(d.items || []); return C; };
  return C;
}

export function createInventory(sys) {
  const { host } = sys;
  const I = sys.items;
  const emit = (n, d) => { try { return host.emit?.(n, d); } catch (e) { return true; } };
  const DEFAULT_POCKETS = 8, MAX_WEIGHT = 30, COMFORT_WEIGHT = 12;

  const pockets = createContainer(sys, { id: 'pockets', units: DEFAULT_POCKETS, maxSize: SIZE.MEDIUM, label: 'Pockets' });
  let bag = null;          // container | null
  let bagInfo = null;      // { id, units, maxSize }
  let hand = null;         // one item instance (qty 1) or null
  const containers = new Map();   // persistent containers by id (stashes, fridges, trunks)
  const world = new Map();        // uid -> world item

  const V = { pockets, containers };
  Object.defineProperty(V, 'held', { get: () => hand });
  Object.defineProperty(V, 'bag', { get: () => bag });
  Object.defineProperty(V, 'handsBusy', { get: () => !!hand && I.def(hand.id)?.hand === 'two' });
  Object.defineProperty(V, 'weight', { get: () => pockets.weight() + (bag ? bag.weight() : 0) + (hand ? I.weight(hand) : 0) });
  Object.defineProperty(V, 'capacity', {
    get: () => {
      const w = V.weight;
      return { pockets: { used: pockets.used(), max: pockets.units }, bag: bag ? { used: bag.used(), max: bag.units } : null, weight: w, maxWeight: MAX_WEIGHT, encumbrance: clamp((w - COMFORT_WEIGHT) / (MAX_WEIGHT - COMFORT_WEIGHT)) };
    },
  });
  const asItem = (x, opts) => (typeof x === 'string' ? I.create(x, opts) : x);

  // ---------------------------------------------------------------- capacity
  V.setPockets = (units) => { pockets.units = Math.max(0, num(units, DEFAULT_POCKETS)); spill(pockets); };
  V.setBag = (info) => {
    if (!info) { if (bag) { const items = bag.clear(); bag = null; bagInfo = null; for (const it of items) if (!placeAuto(it, false)) dropItem(it); } return null; }
    const keep = bag ? bag.clear() : [];
    bagInfo = { id: info.id || 'bag', units: num(info.units, 20), maxSize: info.maxSize ?? SIZE.LARGE };
    bag = createContainer(sys, { ...bagInfo, label: info.label || 'Bag' });
    for (const it of keep) if (bag.add(it) < it.qty) dropItem(it);
    return bag;
  };
  function spill(c) { // capacity shrank: whatever no longer fits falls out
    while (c.used() > c.units + 1e-9 && c.items.length) { const it = c.items[c.items.length - 1]; const [piece] = c.take(it.uid, 1); if (!(bag && c !== bag && bag.add(piece))) dropItem(piece); }
  }

  V.canAdd = (x, qty) => {
    const item = asItem(x, { qty: qty || 1 }); if (!item) return { ok: false, room: 0, reason: 'unknown_item' };
    const def = I.def(item.id), n = qty || item.qty;
    if (V.weight + def.weight * n > MAX_WEIGHT + 1e-9) return { ok: false, room: Math.max(0, Math.floor((MAX_WEIGHT - V.weight) / Math.max(def.weight, 1e-6))), reason: 'too_heavy' };
    if (def.size >= SIZE.HUGE) return { ok: !hand && n === 1, room: hand ? 0 : 1, reason: hand ? 'hands_full' : n > 1 ? 'too_big' : null };
    let room = pockets.room({ ...item, qty: n }) + (bag ? bag.room({ ...item, qty: n }) : 0);
    if (!hand && def.size <= SIZE.LARGE) room += 1;
    if (room >= n) return { ok: true, room, reason: null };
    const fitsSomewhere = def.size <= pockets.maxSize || (bag && def.size <= bag.maxSize);
    return { ok: false, room, reason: fitsSomewhere || !hand ? 'full' : 'too_big' };
  };

  function placeAuto(item, allowHand = true) { // -> qty placed
    let left = item.qty;
    left -= pockets.add(item, left);
    if (left > 0 && bag) left -= bag.add({ ...item, qty: left }, left);
    if (left > 0 && allowHand && !hand) { hand = { ...item, uid: left === item.qty ? item.uid : sys.uid('i'), qty: 1, state: { ...(item.state || {}) } }; left -= 1; emit('itemHeld', { item: hand, previous: null }); }
    return item.qty - left;
  }

  V.add = (x, opts = {}) => {
    const item = asItem(x, opts);
    if (!item) return { ok: false, added: 0, left: opts.qty || 1, reason: 'unknown_item' };
    if (typeof x !== 'string') { if (opts.qty) item.qty = opts.qty; if (opts.stolen !== undefined) item.stolen = !!opts.stolen; }
    const def = I.def(item.id);
    if (!def) return { ok: false, added: 0, left: item.qty, reason: 'unknown_item' };
    const want = item.qty, to = opts.to || 'auto';
    const maxByWeight = def.weight > 0 ? Math.floor((MAX_WEIGHT - V.weight + 1e-9) / def.weight) : want;
    let added = 0, reason = null, where = null;
    if (maxByWeight <= 0) reason = 'too_heavy';
    else {
      const piece = { ...item, qty: Math.min(want, maxByWeight) };
      if (to === 'hand') {
        if (!hand) { hand = { ...piece, qty: 1, state: { ...(piece.state || {}) } }; added = 1; where = 'hand'; emit('itemHeld', { item: hand, previous: null }); if (piece.qty > 1) added += placeAuto({ ...piece, uid: sys.uid('i'), qty: piece.qty - 1 }, false); }
        else reason = 'hands_full';
      } else if (to === 'pockets') { added = pockets.add(piece); where = 'pockets'; }
      else if (to === 'bag') { added = bag ? bag.add(piece) : 0; where = 'bag'; }
      else if (def.size >= SIZE.HUGE) { if (!hand) { hand = { ...piece, qty: 1 }; added = 1; where = 'hand'; emit('itemHeld', { item: hand, previous: null }); } else reason = 'hands_full'; }
      else { const before = hand; added = placeAuto(piece); where = hand !== before && added === 1 ? 'hand' : 'pockets'; }
      if (added < want && !reason) reason = maxByWeight < want ? 'too_heavy' : (def.size > (bag ? bag.maxSize : pockets.maxSize) ? 'too_big' : 'full');
    }
    if (added > 0) { emit('itemAdded', { item: { ...item, qty: added }, where, def }); sys.stats?.add('itemsCollected', added); }
    if (added < want) emit('inventoryFull', { item, reason });
    return { ok: added === want, added, left: want - added, where, item, reason: added === want ? null : reason };
  };

  V.find = (uidOrId) => {
    if (!uidOrId) return hand ? { item: hand, where: 'hand' } : null;
    if (hand && (hand.uid === uidOrId)) return { item: hand, where: 'hand' };
    let it = pockets.items.find((i) => i.uid === uidOrId); if (it) return { item: it, where: 'pockets' };
    it = bag?.items.find((i) => i.uid === uidOrId); if (it) return { item: it, where: 'bag' };
    if (hand && hand.id === uidOrId) return { item: hand, where: 'hand' };
    it = pockets.items.find((i) => i.id === uidOrId); if (it) return { item: it, where: 'pockets' };
    it = bag?.items.find((i) => i.id === uidOrId); if (it) return { item: it, where: 'bag' };
    return null;
  };
  V.count = (id) => pockets.count(id) + (bag ? bag.count(id) : 0) + (hand && hand.id === id ? 1 : 0);
  V.has = (id, n = 1) => V.count(id) >= n;
  V.list = (where = 'all') => (where === 'pockets' ? pockets.list() : where === 'bag' ? (bag ? bag.list() : []) : where === 'hand' ? (hand ? [hand] : []) : [...(hand ? [hand] : []), ...pockets.list(), ...(bag ? bag.list() : [])]);

  // take pieces out of the inventory (hand first when it matches) without emitting drop events
  function takeOut(uidOrId, qty = 1) {
    const out = [];
    let need = qty;
    if (hand && (hand.uid === uidOrId || hand.id === uidOrId || !uidOrId)) { out.push(hand); const prev = hand; hand = null; need -= 1; emit('itemHeld', { item: null, previous: prev }); if (!uidOrId) return out; }
    if (need > 0) { const p = pockets.take(uidOrId, need); for (const x of p) need -= x.qty; out.push(...p); }
    if (need > 0 && bag) { const p = bag.take(uidOrId, need); for (const x of p) need -= x.qty; out.push(...p); }
    return out;
  }
  V.remove = (uidOrId, qty = 1) => {
    const pieces = takeOut(uidOrId, qty); let n = 0;
    for (const p of pieces) { n += p.qty; emit('itemRemoved', { item: p, qty: p.qty }); }
    return n;
  };

  // ---------------------------------------------------------------- hand
  V.stow = () => {
    if (!hand) return true;
    const def = I.def(hand.id);
    if (def && def.size >= SIZE.HUGE) return false;
    const it = hand;
    if (pockets.add(it) >= 1 || (bag && bag.add(it) >= 1)) { hand = null; emit('itemHeld', { item: null, previous: it }); return true; }
    return false;
  };
  V.hold = (uidOrId) => {
    const f = V.find(uidOrId);
    if (!f) return false;
    if (f.where === 'hand') return true;
    if (V.consume.active) V.consume.cancel();
    const src = f.where === 'pockets' ? pockets : bag;
    const [piece] = src.take(f.item.uid, 1);
    if (hand && !V.stow()) { src.add(piece); return false; }
    hand = piece;
    emit('itemHeld', { item: hand, previous: null });
    return true;
  };

  // ---------------------------------------------------------------- use / consume
  const consume = { active: null, auto: true, t: 0 };
  V.consume = consume;
  function endConsume(finished) {
    const a = consume.active; if (!a) return;
    consume.active = null;
    let leftover = null;
    if (finished) {
      if (hand === a.item) { const prev = hand; hand = null; emit('itemHeld', { item: null, previous: prev }); }
      if (a.def.leftover && I.has(a.def.leftover)) { leftover = I.create(a.def.leftover); if (leftover) { hand = leftover; emit('itemHeld', { item: hand, previous: null }); } }
      emit(a.kind === 'eat' ? 'ate' : 'drank', { item: a.item, def: a.def, kcal: a.def.nutrition.kcal });
      sys.stats?.add(a.kind === 'eat' ? 'foodsEaten' : 'drinksDrunk', 1);
      sys.stats?.log(`${a.kind === 'eat' ? 'Ate' : 'Drank'} ${a.def.name}`, { kind: 'food', quiet: true });
    }
    emit('consumeEnd', { item: a.item, def: a.def, finished, leftover, kind: a.kind });
  }
  consume.next = () => {
    const a = consume.active; if (!a) return null;
    if (hand !== a.item) { endConsume(false); return null; }
    const def = a.def, item = a.item;
    const spoiled = I.isSpoiled(item);
    const share = {}; for (const k of Object.keys(def.nutrition)) share[k] = def.nutrition[k] / def.portions;
    const res = sys.needs ? sys.needs.ingest(share, { quality: def.quality, spoiled, def, item, kind: a.kind, portionOf: def.portions }) : { ok: true };
    if (res && res.ok === false) { emit('consumeRefused', { item, def, reason: res.reason }); endConsume(false); return res; }
    item.state.used = (item.state.used || 0) + 1; item.state.open = true;
    a.portion = item.state.used;
    const duration = a.kind === 'eat' ? EAT_SECONDS : SIP_SECONDS;
    emit(a.kind === 'eat' ? 'bite' : 'sip', { item, def, portion: a.portion, portions: def.portions, stage: a.portion / def.portions, kcal: share.kcal, duration, spoiled });
    consume.t = duration;
    if (item.state.used >= def.portions) endConsume(true);
    return { ok: true, portion: a.portion, portions: def.portions };
  };
  consume.cancel = () => endConsume(false);

  I.registerUse('eat', (item, def) => startConsume(item, def, 'eat'));
  I.registerUse('drink', (item, def) => startConsume(item, def, 'drink'));
  function startConsume(item, def, kind) {
    if (!def.portions) return { ok: false, reason: 'not_consumable' };
    if (consume.active) { if (consume.active.item === item) return { ok: true, already: true }; endConsume(false); }
    if (hand !== item && !V.hold(item.uid)) return { ok: false, reason: 'hands_full' };
    const it = hand;
    if (sys.needs?.canIngest) { const c = sys.needs.canIngest(def, kind); if (!c.ok) { emit('consumeRefused', { item: it, def, reason: c.reason }); return c; } }
    consume.active = { item: it, def, kind, portion: it.state.used || 0, portions: def.portions };
    consume.t = FIRST_DELAY;
    emit('consumeStart', { item: it, def, kind, portions: def.portions, portion: it.state.used || 0 });
    return { ok: true, session: consume.active };
  }
  V.use = (uidOrId, opts = {}) => {
    const f = V.find(uidOrId);
    if (!f) return { ok: false, reason: 'no_item' };
    const def = I.def(f.item.id);
    if (!def || !def.use) return { ok: false, reason: 'no_use' };
    const h = I.useHandler(def.use);
    if (!h) return { ok: false, reason: 'no_handler' };
    let res;
    try { res = h(f.item, def, { where: f.where, ...opts }); } catch (e) { console.error(`[inventory] use '${def.use}' failed`, e); return { ok: false, reason: 'error' }; }
    if (res && res.ok !== false) emit('itemUsed', { item: f.item, def, kind: def.use });
    return res || { ok: true };
  };

  // ---------------------------------------------------------------- world items
  const playerPos = () => { const p = host.player?.position; return p ? [num(p.x), num(p.y), num(p.z)] : [0, 0, 0]; };
  function addWorld(item, pos, extra = {}) {
    const w = { uid: sys.uid('w'), item, pos: vec3arr(pos), rotY: num(extra.rotY, (sys.rng ? sys.rng.next() : 0.5) * Math.PI * 2), droppedAt: sys.time?.now ?? 0, interior: extra.interior ?? host.currentInterior?.id ?? null,
      keep: !!extra.keep, resting: extra.resting !== false, vel: extra.vel ? vec3arr(extra.vel) : null };
    world.set(w.uid, w);
    if (world.size > WORLD_CAP) { // drop the oldest thing nobody asked to keep
      let oldest = null; for (const x of world.values()) if (!x.keep && x.resting && (!oldest || x.droppedAt < oldest.droppedAt)) oldest = x;
      if (oldest && oldest !== w) { world.delete(oldest.uid); emit('worldItemRemoved', { worldItem: oldest, reason: 'cap' }); }
    }
    return w;
  }
  function dropItem(item, position) {
    const p = position ? vec3arr(position) : playerPos();
    if (!position) { const h = num(host.player?.heading); p[0] += Math.sin(h) * 0.45; p[2] += Math.cos(h) * 0.45; const g = sys.physics?.ground?.(p[0], p[2], p[1] + 1); if (Number.isFinite(g)) p[1] = g; }
    const w = addWorld(item, p);
    emit('itemDropped', { worldItem: w });
    return w;
  }
  V.drop = (uidOrId, opts = {}) => {
    if (consume.active && (!uidOrId || consume.active.item.uid === uidOrId)) endConsume(false);
    const pieces = takeOut(uidOrId, opts.qty || 1);
    if (!pieces.length) return null;
    let last = null;
    for (const p of pieces) last = dropItem(p, opts.position);
    return last;
  };
  V.throw = (uidOrId, opts = {}) => {
    if (consume.active && (!uidOrId || consume.active.item.uid === uidOrId)) endConsume(false);
    const f = V.find(uidOrId); if (!f) return null;
    const def = I.def(f.item.id);
    if (def && def.throwable === false) return null;
    const [piece] = takeOut(f.item.uid, 1); if (!piece) return null;
    const power = clamp(opts.power ?? 0.7), h = num(host.player?.heading);
    let d = opts.dir ? vec3arr(opts.dir) : [Math.sin(h), 0.35, Math.cos(h)];
    const len = Math.hypot(d[0], d[1], d[2]) || 1; d = d.map((v) => v / len);
    // heavier things do not fly as fast: a can leaves the hand at up to ~17 m/s, a 5 kg bag at ~7 m/s
    const speed = (6 + 12 * power) / Math.sqrt(Math.max(0.35, (def?.weight || 0.3) / 0.35));
    const p = playerPos(); p[1] += 1.45; p[0] += d[0] * 0.4; p[2] += d[2] * 0.4;
    const pv = host.player?.velocity;
    const w = addWorld(piece, p, { resting: false, vel: [d[0] * speed + num(pv?.x) * 0.5, d[1] * speed + 1.2, d[2] * speed + num(pv?.z) * 0.5] });
    w.spin = 4 + 8 * power;
    emit('itemThrown', { worldItem: w, dir: { x: d[0], y: d[1], z: d[2] }, power });
    sys.stats?.add('itemsThrown', 1);
    return w;
  };
  V.give = (target, uidOrId, opts = {}) => {
    const f = V.find(uidOrId); if (!f) return false;
    const qty = Math.min(opts.qty || 1, f.item.qty);
    const offer = { ...f.item, qty };
    if (emit('itemGiven', { item: offer, to: target, def: I.def(offer.id) }) === false) return false;
    if (consume.active && consume.active.item === f.item) endConsume(false);
    const pieces = takeOut(f.item.uid, qty);
    try { for (const p of pieces) target?.receiveItem?.(p); } catch (e) { console.error('[inventory] receiveItem threw', e); }
    sys.stats?.add('itemsGiven', qty);
    return true;
  };
  V.nearby = (radius = 2) => { const p = playerPos(); return V.world.near(p[0], p[2], radius).filter((w) => Math.abs(w.pos[1] - p[1]) < 2.5); };
  V.pickUp = (worldUid) => {
    const w = world.get(worldUid); if (!w) return { ok: false, reason: 'gone' };
    const r = V.add(w.item, { silent: true });
    if (r.added <= 0) return { ok: false, reason: r.reason || 'full' };
    if (r.added >= w.item.qty) world.delete(w.uid); else w.item.qty -= r.added;
    emit('itemPickedUp', { item: { ...w.item, qty: r.added }, worldItem: w });
    return { ok: true, added: r.added };
  };
  V.world = {
    get items() { return [...world.values()]; },
    get size() { return world.size; },
    get: (uid) => world.get(uid) || null,
    near: (x, z, r) => { const out = [], r2 = r * r; for (const w of world.values()) if (dist2(w.pos[0], w.pos[2], x, z) <= r2) out.push(w); return out.sort((a, b) => dist2(a.pos[0], a.pos[2], x, z) - dist2(b.pos[0], b.pos[2], x, z)); },
    place: (item, pos, extra = {}) => { const it = asItem(item, extra); if (!it) return null; const w = addWorld(it, pos, { keep: extra.keep !== false, ...extra }); emit('itemDropped', { worldItem: w, placed: true }); return w; },
    remove: (uid) => { const w = world.get(uid); if (!w) return false; world.delete(uid); emit('worldItemRemoved', { worldItem: w, reason: 'removed' }); return true; },
  };

  // ---------------------------------------------------------------- stolen goods
  V.markStolen = (uidOrId, v = true) => { const f = V.find(uidOrId); if (!f) return false; f.item.stolen = !!v; return true; };
  V.stolenItems = () => V.list('all').filter((it) => it.stolen);
  V.confiscate = (filter = (it) => it.stolen) => {
    const taken = [];
    for (const it of V.list('all')) if (filter(it, I.def(it.id))) taken.push(...takeOut(it.uid, it.qty));
    if (taken.length) emit('itemsConfiscated', { items: taken });
    return taken;
  };

  // ---------------------------------------------------------------- persistent containers
  V.container = (id, opts = {}) => {
    let c = containers.get(id);
    if (!c) { c = createContainer(sys, { id, units: opts.units ?? 40, maxSize: opts.maxSize ?? SIZE.LARGE, cool: opts.cool, label: opts.label }); containers.set(id, c); }
    else { if (opts.units !== undefined) c.units = opts.units; if (opts.maxSize !== undefined) c.maxSize = opts.maxSize; if (opts.cool !== undefined) c.cool = !!opts.cool; }
    return c;
  };
  // Move between the player and a container (or 'pockets' / 'bag' / 'hand').
  V.transfer = (uidOrId, to, qty = 1) => {
    if (to && typeof to === 'object') { // player -> container
      const f = V.find(uidOrId); if (!f) return 0;
      const n = Math.min(qty, f.item.qty, to.room({ ...f.item, qty })); if (n <= 0) return 0;
      let moved = 0; for (const p of takeOut(f.item.uid, n)) moved += to.add(p);
      return moved;
    }
    const f = V.find(uidOrId); if (!f) return 0;
    if (to === 'hand') return V.hold(f.item.uid) ? 1 : 0;
    const dst = to === 'bag' ? bag : pockets, src = f.where === 'hand' ? null : f.where === 'pockets' ? pockets : bag;
    if (!dst || dst === src) return 0;
    if (!src) { const n = dst.add(hand); if (n) { const prev = hand; hand = null; emit('itemHeld', { item: null, previous: prev }); } return n; }
    return src.transferTo(dst, f.item.uid, qty);
  };
  // container -> player
  V.takeFrom = (container, uidOrId, qty = 1) => {
    let moved = 0;
    for (const p of container.take(uidOrId, qty)) { const r = V.add(p); moved += r.added; if (r.left > 0) container.add({ ...p, qty: r.left }); }
    return moved;
  };

  // ---------------------------------------------------------------- update (real seconds)
  let sweepT = 0;
  V.update = (dt) => {
    const a = consume.active;
    if (a) {
      if (hand !== a.item) endConsume(false);
      else if (consume.auto) { consume.t -= dt; if (consume.t <= 0) consume.next(); }
    }
    // thrown items in flight
    for (const w of world.values()) {
      if (w.resting || !w.vel) continue;
      const v = w.vel, p = w.pos;
      let h = Math.min(dt, 0.05), left = dt, guard = 0;
      while (left > 1e-5 && !w.resting && guard++ < 8) {
        h = Math.min(left, 0.033); left -= h;
        v[1] -= 9.81 * h;
        const nx = p[0] + v[0] * h, ny = p[1] + v[1] * h, nz = p[2] + v[2] * h;
        const hit = sys.physics?.ray?.(p, [nx, ny, nz]);
        if (hit) { // bounce off a wall or a car
          const n = hit.normal || [0, 1, 0], dot = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
          v[0] = (v[0] - 1.35 * dot * n[0]) * 0.55; v[1] = (v[1] - 1.35 * dot * n[1]) * 0.55; v[2] = (v[2] - 1.35 * dot * n[2]) * 0.55;
          p[0] = hit.point[0] + n[0] * 0.03; p[1] = hit.point[1] + n[1] * 0.03; p[2] = hit.point[2] + n[2] * 0.03;
          w.bounces = (w.bounces || 0) + 1;
        } else { p[0] = nx; p[1] = ny; p[2] = nz; }
        const g = sys.physics?.ground ? sys.physics.ground(p[0], p[2], p[1] + 0.5) : 0;
        if (Number.isFinite(g) && p[1] <= g + 0.02) {
          p[1] = g + 0.02;
          if (Math.abs(v[1]) > 1.6 && (w.bounces || 0) < 4) { v[1] = -v[1] * 0.3; v[0] *= 0.6; v[2] *= 0.6; w.bounces = (w.bounces || 0) + 1; }
          else { w.resting = true; w.vel = null; }
        }
        if (Math.hypot(v?.[0] || 0, v?.[1] || 0, v?.[2] || 0) < 0.25 && Number.isFinite(g) && p[1] <= g + 0.05) { w.resting = true; w.vel = null; }
        if (p[1] < -60) { w.resting = true; w.vel = null; }
      }
      if (w.spin) w.rotY += w.spin * dt;
      if (w.resting) {
        delete w.spin; delete w.bounces;
        const def = I.def(w.item.id);
        emit('itemLanded', { worldItem: w, position: { x: p[0], y: p[1], z: p[2] }, noise: clamp(0.25 + (def?.weight || 0.3) * 0.5 + (def?.tags?.includes('glass') ? 0.4 : 0)) });
      }
    }
    sweepT -= dt;
    if (sweepT <= 0) { sweepT = 5; V.sweep(); }
  };
  // Clear public litter that has been lying around too long, and tell anyone watching when carried food spoils.
  const spoiledSeen = new Set();
  V.sweep = () => {
    const now = sys.time?.now ?? 0;
    for (const w of [...world.values()]) {
      if (w.keep || w.interior) continue;
      if (sys.property?.isPrivateSpot?.(w.pos[0], w.pos[2])) continue;
      const spoiled = I.isSpoiled(w.item, now);
      if (now - w.droppedAt > PUBLIC_LIFETIME || (spoiled && now - I.spoilAt(w.item, now) > SPOILED_LIFETIME)) { world.delete(w.uid); emit('worldItemRemoved', { worldItem: w, reason: 'expired' }); }
    }
    for (const it of V.list('all')) if (!spoiledSeen.has(it.uid) && I.isSpoiled(it, now)) { spoiledSeen.add(it.uid); emit('itemSpoiled', { item: it, def: I.def(it.id) }); }
  };

  // ---------------------------------------------------------------- save slice
  V.reset = () => {
    if (consume.active) consume.active = null;
    pockets.items = []; pockets.units = DEFAULT_POCKETS; bag = null; bagInfo = null; hand = null; world.clear(); spoiledSeen.clear();
    for (const c of containers.values()) c.items = [];
  };
  V.toSave = () => ({
    pockets: pockets.toSave(), bag: bag ? { info: bagInfo, c: bag.toSave() } : null, hand: clone(hand),
    containers: [...containers.values()].filter((c) => c.items.length).map((c) => c.toSave()),
    world: [...world.values()].map((w) => ({ ...clone(w), resting: true, vel: null })),
  });
  V.fromSave = (d) => {
    V.reset();
    if (!d) return;
    pockets.fromSave(d.pockets); pockets.id = 'pockets';
    if (d.bag) { bagInfo = d.bag.info; bag = createContainer(sys, { ...bagInfo, label: 'Bag' }); bag.fromSave(d.bag.c); }
    hand = d.hand ? clone(d.hand) : null;
    for (const c of d.containers || []) V.container(c.id, { units: c.units, maxSize: c.maxSize, cool: c.cool, label: c.label }).fromSave(c);
    for (const w of d.world || []) { delete w.spin; delete w.bounces; world.set(w.uid, w); }
  };
  return V;
}

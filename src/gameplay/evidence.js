// POLICE track: the knowledge model ("Tier C: full knowledge", BIG_UPDATE 0a1b / 0a2 / 0b-9).
// The police know only what was actually observed. Every fact is tracked on its own, with the sources that reported it,
// a confidence, the time it was last corroborated and its own staleness timer.
//
// Pure logic: no THREE, no DOM, no game object. Unit-tested in Node (src/gameplay/police/tests/evidence.test.mjs).
//
// Vocabulary
//   source   who or what observed the player: a store camera, a witness, an officer, a plate reader, a helicopter, a tip.
//            A source can be PENDING (a witness still dialing, footage not pulled yet). A pending source that is stopped in
//            time (witness intimidated, recorder destroyed) never delivers. A live source can be RETRACTED (witness bribed).
//   fact     one thing the police believe: 'face', 'outfit.top', 'vehicle', 'plate', 'weapon', 'direction', ...
//            A fact stays BELIEVED until it goes stale or loses every source. It is VALID only while it still matches
//            reality: change the shirt and 'outfit.top' stops being valid (the icon clears) although the radio keeps
//            repeating the old description until it goes stale.
//   reality  the player's current appearance, passed in by the game each tick (see wantedSense.js).

export const DAY = 'day'; // ttl marker: lasts until the end of the game day

// ttl in real seconds (tuning table lives in docs/gameplay/police_tuning.md)
export const FACTS = {
  face:             { group: 'you',   ttl: DAY,  weight: 0.46, name: 'Face identified' },
  'outfit.top':     { group: 'you',   ttl: 480,  weight: 0.17, name: 'Top described' },
  'outfit.bottom':  { group: 'you',   ttl: 480,  weight: 0.10, name: 'Legwear described' },
  'outfit.shoes':   { group: 'you',   ttl: 420,  weight: 0.05, name: 'Shoes described' },
  'outfit.head':    { group: 'you',   ttl: 360,  weight: 0.07, name: 'Headwear described' },
  'outfit.extra':   { group: 'you',   ttl: 360,  weight: 0.04, name: 'Accessory described' },
  weapon:           { group: 'you',   ttl: 300,  weight: 0.15, name: 'Weapon described' },
  traces:           { group: 'you',   ttl: 900,  weight: 0.13, name: 'Seen at the crime' },
  companions:       { group: 'you',   ttl: 300,  weight: 0.05, name: 'Companions described' },
  vehicle:          { group: 'ride',  ttl: 420,  weight: 0.30, name: 'Vehicle described' },
  plate:            { group: 'ride',  ttl: 1200, weight: 0.58, name: 'Plate read' },
  direction:        { group: 'ride',  ttl: 28,   weight: 0.0,  name: 'Direction of travel' },
  home:             { group: 'place', ttl: DAY,  weight: 0.0,  name: 'Safehouse known' },
};
export const FACT_ORDER = ['face', 'outfit.top', 'outfit.bottom', 'outfit.shoes', 'outfit.head', 'outfit.extra', 'weapon', 'traces', 'companions', 'vehicle', 'plate', 'direction', 'home'];
export const SOURCE_TTL = { camera: 900, witness: 600, officer: 240, alpr: 900, heli: 180, drone: 120, tip: 300, alarm: 240 };
// what a source of each type can contribute at most (confidence ceiling per fact family)
export const SOURCE_CONF = {
  officer: { face: 0.95, outfit: 0.95, weapon: 0.95, vehicle: 0.97, plate: 0.97, direction: 1, traces: 0.9, companions: 0.9, home: 1 },
  camera:  { face: 0.92, outfit: 0.9, weapon: 0.8, vehicle: 0.9, plate: 0.85, direction: 0.7, traces: 0.7, companions: 0.8, home: 0 },
  alpr:    { face: 0.0, outfit: 0.0, weapon: 0, vehicle: 0.85, plate: 0.99, direction: 0.9, traces: 0, companions: 0, home: 0 },
  witness: { face: 0.7, outfit: 0.8, weapon: 0.75, vehicle: 0.8, plate: 0.8, direction: 0.8, traces: 0.7, companions: 0.7, home: 0.8 },
  heli:    { face: 0.0, outfit: 0.55, weapon: 0.3, vehicle: 0.9, plate: 0.0, direction: 1, traces: 0, companions: 0.6, home: 1 },
  drone:   { face: 0.5, outfit: 0.75, weapon: 0.5, vehicle: 0.9, plate: 0.6, direction: 1, traces: 0.3, companions: 0.7, home: 1 },
  tip:     { face: 0.35, outfit: 0.5, weapon: 0.3, vehicle: 0.5, plate: 0.3, direction: 0.6, traces: 0.3, companions: 0.4, home: 0.5 },
  alarm:   { face: 0, outfit: 0, weapon: 0, vehicle: 0, plate: 0, direction: 0, traces: 0, companions: 0, home: 0 },
};
const family = (key) => (key.startsWith('outfit.') ? 'outfit' : key);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---- value comparison (does a believed value still describe reality?)
function sameGarment(a, b) {
  if (!a || !b) return false;
  if (a.id != null && b.id != null) return a.id === b.id;
  return String(a.label || '').toLowerCase() === String(b.label || '').toLowerCase();
}
export function plateKnownCount(v) { return v?.mask ? v.mask.reduce((n, k) => n + (k ? 1 : 0), 0) : (v?.text || '').replace(/\s/g, '').length; }
export function plateShown(v, unknown = '·') {
  if (!v?.text) return '';
  const chars = v.text.split(''); let i = 0;
  return chars.map((c) => { if (c === ' ') return ' '; const known = !v.mask || v.mask[i]; i++; return known ? c : unknown; }).join('');
}
function plateMaskLen(text) { return text.replace(/\s/g, '').length; }

export function createEvidence(opts = {}) {
  const now = opts.now || (() => Date.now() / 1000);
  // seconds of real time until the current game day ends (police shift change, 05:00); the face fact lasts that long
  const dayLeft = opts.dayLeft || (() => 3600);
  const facts = new Map();      // key -> fact
  const sources = new Map();    // id -> source
  const changes = [];           // recent change log (newest last)
  const listeners = [];
  let seq = 0, changeSeq = 0;
  const stats = { camerasLive: 0, witnessesLive: 0, pending: 0 };

  function emit(ch) {
    ch.t = now(); ch.n = ++changeSeq;
    changes.push(ch); if (changes.length > 60) changes.shift();
    for (const f of listeners) { try { f(ch); } catch (e) { /* listener errors never break the model */ } }
    return ch;
  }
  const ttlOf = (key, custom) => { if (custom > 0) return custom; const t = (FACTS[key] || {}).ttl; return t === DAY ? Math.max(60, dayLeft()) : (t || 300); };

  // ------------------------------------------------------------------ sources
  // addSource({ type, label, reliability 0..1, pending: seconds before it delivers (0 = live now), where: {x,z}, who, meta })
  function addSource(s) {
    const id = s.id || `${s.type}:${++seq}`;
    let src = sources.get(id);
    if (src && src.state !== 'pending' && src.state !== 'live') { sources.delete(id); src = null; }
    if (src) { // same source seen again: refresh
      src.t = now(); if (s.label) src.label = s.label; if (s.reliability != null) src.reliability = s.reliability;
      if (s.where) src.where = s.where;
      return src;
    }
    src = {
      id, type: s.type || 'witness', label: s.label || s.type || 'source', reliability: s.reliability ?? 0.8,
      state: s.pending > 0 ? 'pending' : 'live', eta: s.pending > 0 ? s.pending : 0, total: s.pending > 0 ? s.pending : 0,
      t: now(), ttl: s.ttl || SOURCE_TTL[s.type] || 300, where: s.where || null, who: s.who || null, meta: s.meta || {},
      queue: [], keys: new Set(), pendingKind: s.pendingKind || (s.type === 'camera' ? 'footage' : 'call'), onDeliver: s.onDeliver || null,
    };
    sources.set(id, src);
    if (src.state === 'pending') emit({ kind: 'incoming', key: src.type === 'camera' ? 'cameras' : 'witnesses', source: id, label: src.label });
    else emit({ kind: 'source', key: src.type === 'camera' || src.type === 'alpr' ? 'cameras' : src.type === 'witness' || src.type === 'tip' ? 'witnesses' : 'units', source: id, label: src.label });
    return src;
  }
  // observe(sourceId, key, value, confidence 0..1): queued while the source is pending
  function observe(sourceId, key, value, conf = 1, o = {}) {
    const src = typeof sourceId === 'object' ? sourceId : sources.get(sourceId);
    if (!src || !FACTS[key] || value == null) return null;
    if (src.state === 'pending') { src.queue.push({ key, value, conf, o }); return null; }
    if (src.state !== 'live') return null;
    return upsert(src, key, value, conf, o);
  }
  function upsert(src, key, value, conf, o = {}) {
    const ceil = (SOURCE_CONF[src.type] || SOURCE_CONF.witness)[family(key)] ?? 0.5;
    const c = clamp01(conf) * ceil * (src.type === 'witness' || src.type === 'tip' ? clamp01(0.35 + src.reliability * 0.65) : 1);
    if (c <= 0.01) return null;
    const t = now();
    let f = facts.get(key);
    const fresh = !f;
    let changed = false, wasInvalid = false;
    if (!f) { f = { key, value, sources: new Map(), firstT: t, lastT: t, ttl: ttlOf(key, o.ttl), valid: true, concealed: false, conf: 0, changedAt: t, change: 'gained' }; facts.set(key, f); }
    else {
      wasInvalid = !f.valid;
      if (key === 'plate') { // partial reads merge: the same plate text gains known characters
        const merged = mergePlate(f.value, value);
        changed = merged.changed; f.value = merged.value; if (merged.replaced) f.sources.clear();
      } else if (!sameValue(key, f.value, value)) {
        // a different value from a better or equally good source replaces the belief; a weak source cannot overwrite a strong fresh one
        if (c + 0.15 >= f.conf || !f.valid) { f.value = value; f.sources.clear(); changed = true; } else return f;
      } else if (value && typeof value === 'object') f.value = { ...f.value, ...value };
      f.ttl = Math.max(f.ttl, ttlOf(key, o.ttl));
    }
    const prev = f.sources.get(src.id);
    f.sources.set(src.id, { c: Math.max(c, prev?.c || 0), t });
    f.lastT = t; src.keys.add(key); src.t = t;
    const before = f.conf; f.conf = confOf(f, t);
    if (fresh) { f.valid = true; emit({ kind: 'gained', key, label: src.label, source: src.id, value: f.value }); }
    else if (changed) { f.valid = true; f.changedAt = t; f.change = 'updated'; emit({ kind: 'updated', key, label: src.label, source: src.id, value: f.value }); }
    else if (wasInvalid && o.revalidate) { f.valid = true; f.changedAt = t; f.change = 'restored'; emit({ kind: 'restored', key, label: src.label, source: src.id, value: f.value }); }
    else if (!prev || f.conf > before + 0.08) { f.changedAt = t; f.change = 'corroborated'; emit({ kind: 'corroborated', key, label: src.label, source: src.id, value: f.value }); }
    return f;
  }
  function sameValue(key, a, b) {
    if (key.startsWith('outfit.')) return sameGarment(a, b);
    if (key === 'vehicle') return a.uid === b.uid && (a.color || '') === (b.color || '');
    if (key === 'plate') return a.text === b.text;
    if (key === 'weapon') return a.cls === b.cls;
    if (key === 'face' || key === 'home') return true;
    if (key === 'traces') return a.id === b.id;
    if (key === 'companions') return (a.n || 1) === (b.n || 1);
    return false; // direction: always replaced
  }
  function mergePlate(a, b) {
    if (a.text !== b.text) return { value: b, changed: true, replaced: true };
    const n = plateMaskLen(a.text), ma = a.mask || new Array(n).fill(true), mb = b.mask || new Array(n).fill(true);
    const m = ma.map((k, i) => k || mb[i]);
    const changed = m.some((k, i) => k !== ma[i]);
    return { value: { ...a, ...b, mask: m }, changed };
  }
  function confOf(f, t) {
    let miss = 1;
    for (const [, s] of f.sources) {
      const age = (t - s.t) / f.ttl;
      const freshness = age < 0.5 ? 1 : Math.max(0.4, 1 - (age - 0.5) * 1.2);
      miss *= 1 - s.c * freshness;
    }
    let c = 1 - miss;
    if (f.key === 'plate') c *= 0.35 + 0.65 * (plateKnownCount(f.value) / Math.max(1, plateMaskLen(f.value.text)));
    return clamp01(c);
  }

  // stop a pending source before it delivers (witness intimidated or silenced, recorder destroyed), or retract a live one (bribe)
  function cancelSource(id, reason = 'stopped') {
    const src = sources.get(id); if (!src) return false;
    if (src.state === 'pending') {
      src.state = reason === 'destroyed' ? 'destroyed' : 'averted'; src.queue.length = 0;
      emit({ kind: 'averted', key: src.type === 'camera' ? 'cameras' : 'witnesses', source: id, label: src.label, reason });
      return true;
    }
    if (src.state !== 'live') return false;
    src.state = 'retracted';
    emit({ kind: 'retracted', key: src.type === 'camera' || src.type === 'alpr' ? 'cameras' : 'witnesses', source: id, label: src.label, reason });
    for (const key of src.keys) {
      const f = facts.get(key); if (!f) continue;
      f.sources.delete(id);
      if (!f.sources.size) removeFact(key, 'retracted', reason);
      else f.conf = confOf(f, now());
    }
    return true;
  }
  function deliver(src) {
    src.state = 'live'; src.t = now(); src.eta = 0;
    emit({ kind: 'source', key: src.type === 'camera' || src.type === 'alpr' ? 'cameras' : 'witnesses', source: src.id, label: src.label, delivered: true });
    const q = src.queue; src.queue = [];
    for (const it of q) upsert(src, it.key, it.value, it.conf, it.o);
    if (src.onDeliver) { try { src.onDeliver(src); } catch (e) { /* */ } }
  }
  function removeFact(key, kind, reason) {
    const f = facts.get(key); if (!f) return;
    facts.delete(key);
    if (f.valid || kind === 'retracted') emit({ kind, key, value: f.value, reason });
  }

  // ------------------------------------------------------------------ reality
  // reality = { garments: { top, bottom, shoes, head, extra }, masked, faceCover 0..1 (hat + glasses), weapons: [cls...], weaponVisible: cls|null,
  //             vehicle: { uid, color, plate, label, cls } | null, lastVehicle: same | null, lastVehicleDist, companions: n, traces: [id...] }
  function validNow(f, R) {
    if (!R) return true;
    const k = f.key;
    if (k.startsWith('outfit.')) return sameGarment(f.value, (R.garments || {})[k.slice(7)]);
    if (k === 'vehicle') { const v = R.vehicle || (R.lastVehicleDist < 60 ? R.lastVehicle : null); return !!v && v.uid === f.value.uid && (v.color || '') === (f.value.color || ''); }
    if (k === 'plate') { const v = R.vehicle || (R.lastVehicleDist < 60 ? R.lastVehicle : null); return !!v && v.plate === f.value.text; }
    if (k === 'weapon') return (R.weapons || []).includes(f.value.cls);
    if (k === 'traces') return (R.traces || []).includes(f.value.id);
    if (k === 'companions') return (R.companions || 0) > 0;
    return true;
  }
  function clearReason(f, R) {
    const k = f.key;
    if (k.startsWith('outfit.')) return (R.garments || {})[k.slice(7)] ? 'changed clothes' : 'taken off';
    if (k === 'vehicle') { const v = R.vehicle || R.lastVehicle; return v && v.uid === f.value.uid ? 'repainted' : 'vehicle swapped'; }
    if (k === 'plate') { const v = R.vehicle || R.lastVehicle; return v && v.uid === f.value.uid ? 'plates changed' : 'vehicle swapped'; }
    if (k === 'weapon') return 'weapon ditched';
    if (k === 'traces') return 'washed off';
    if (k === 'companions') return 'alone now';
    return 'no longer matches';
  }

  function tick(dt, R) {
    const t = now();
    let cams = 0, wits = 0, pend = 0;
    for (const [id, src] of sources) {
      if (src.state === 'pending') {
        if (!src.hold) src.eta -= dt;
        pend++;
        if (src.eta <= 0) deliver(src);
      } else if (src.state === 'live') {
        // a stale source stops counting in the badges; the facts it reported keep their own staleness timers
        if (t - src.t > src.ttl) { src.state = 'stale'; src.staleT = t; }
        else if (src.type === 'camera' || src.type === 'alpr') cams++;
        else if (src.type === 'witness' || src.type === 'tip') wits++;
      } else if (src.state === 'stale') {
        let used = false; for (const key of src.keys) if (facts.get(key)?.sources.has(id)) { used = true; break; }
        if (!used && t - (src.staleT || src.t) > 30) sources.delete(id);
      } else if (t - src.t > 30) sources.delete(id); // averted / retracted / destroyed: forget after the HUD showed it
    }
    stats.camerasLive = cams; stats.witnessesLive = wits; stats.pending = pend;
    for (const [key, f] of facts) {
      if (t - f.lastT > f.ttl || !f.sources.size) { removeFact(key, 'stale', 'went stale'); continue; }
      f.conf = confOf(f, t);
      if (R) {
        const v = validNow(f, R);
        if (f.valid && !v) { f.valid = false; f.changedAt = t; f.change = 'cleared'; emit({ kind: 'cleared', key, value: f.value, reason: clearReason(f, R) }); }
        else if (!f.valid && v) { f.valid = true; f.changedAt = t; f.change = 'restored'; emit({ kind: 'restored', key, value: f.value, reason: 'matches again' }); }
        const conc = key === 'face' ? !!R.masked : false;
        if (conc !== f.concealed) { f.concealed = conc; f.changedAt = t; f.change = conc ? 'concealed' : 'revealed'; emit({ kind: conc ? 'concealed' : 'revealed', key, value: f.value, reason: conc ? 'face covered' : 'face uncovered' }); }
      }
    }
  }

  // ------------------------------------------------------------------ matching
  // How strongly does the player, as seen right now by an observer, match what the police believe?
  // ctx = { kind: 'foot'|'car'|'heli'|'drone'|'civilian'|'camera'|'alpr', dist (m), inVehicle: bool, night: bool }
  // returns { score 0..1, parts: [{ key, w }], best: key|null, mismatch 0..1 }
  function match(R, ctx = {}) {
    const dist = ctx.dist ?? 20, kind = ctx.kind || 'foot', inVeh = !!ctx.inVehicle;
    const sees = (key) => {
      const fam = family(key);
      if (fam === 'face') { if (kind === 'heli' || kind === 'alpr') return 0; const r = inVeh ? 9 : kind === 'car' ? 14 : 22; return dist < r ? (ctx.night ? 0.7 : 1) * (1 - (R?.faceCover || 0) * 0.55) : 0; }
      if (fam === 'outfit') { if (kind === 'alpr') return 0; const r = key === 'outfit.shoes' || key === 'outfit.extra' ? 14 : 60; const k = inVeh ? 0.25 : 1; return dist < r ? k * (kind === 'heli' ? 0.6 : 1) : 0; }
      if (fam === 'weapon') return R?.weaponVisible && !inVeh && dist < 45 ? 1 : 0;
      if (fam === 'traces') return !inVeh && dist < 18 && kind !== 'heli' && kind !== 'alpr' ? 1 : 0;
      if (fam === 'companions') return dist < 40 ? 0.8 : 0;
      if (fam === 'vehicle') return inVeh && dist < 110 ? 1 : 0;
      if (fam === 'plate') return inVeh && (kind === 'alpr' ? dist < 45 : kind === 'heli' ? 0 : dist < 30) ? 1 : 0;
      return 0;
    };
    let miss = 1, mismatch = 0, best = null, bw = 0;
    const parts = [];
    for (const [key, f] of facts) {
      const w0 = (FACTS[key] || {}).weight || 0; if (!w0) continue;
      const vis = sees(key); if (vis <= 0) continue;
      if (f.valid && !f.concealed) {
        if (key === 'weapon' && R && R.weaponVisible !== f.value.cls) continue;
        const w = w0 * f.conf * vis;
        miss *= 1 - w; parts.push({ key, w });
        if (w > bw) { bw = w; best = key; }
      } else if (!f.valid) mismatch = Math.max(mismatch, w0 * f.conf * vis); // they are looking for something you no longer show
    }
    let score = 1 - miss;
    score *= 1 - Math.min(0.6, mismatch * 1.6);
    return { score: clamp01(score), parts, best, mismatch };
  }

  // ------------------------------------------------------------------ views
  function factView(f, t) {
    const remain = Math.max(0, f.ttl - (t - f.lastT));
    const srcs = [];
    for (const [id, s] of f.sources) { const src = sources.get(id); srcs.push({ id, type: src?.type || 'witness', label: src?.label || id, c: s.c, age: t - s.t }); }
    return { key: f.key, group: FACTS[f.key].group, name: FACTS[f.key].name, value: f.value, conf: f.conf, ttl: f.ttl, remain, frac: f.ttl > 0 ? remain / f.ttl : 0,
      valid: f.valid, concealed: f.concealed, changedAt: f.changedAt, change: f.change, sources: srcs, firstT: f.firstT };
  }
  // everything the HUD needs, in display order
  function snapshot() {
    const t = now();
    const live = [], outdated = [];
    for (const key of FACT_ORDER) { const f = facts.get(key); if (!f) continue; (f.valid ? live : outdated).push(factView(f, t)); }
    const src = { cameras: [], witnesses: [], officers: [], pending: [], recent: [] };
    for (const [, s] of sources) {
      const v = { id: s.id, type: s.type, label: s.label, state: s.state, eta: s.eta, total: s.total, age: t - s.t, ttl: s.ttl, frac: s.state === 'live' ? Math.max(0, 1 - (t - s.t) / s.ttl) : 0, reliability: s.reliability, keys: [...s.keys], pendingKind: s.pendingKind, hold: !!s.hold, where: s.where };
      if (s.state === 'pending') src.pending.push(v);
      else if (s.state === 'live') (s.type === 'camera' || s.type === 'alpr' ? src.cameras : s.type === 'witness' || s.type === 'tip' ? src.witnesses : src.officers).push(v);
      else src.recent.push(v);
    }
    return { t, facts: live, outdated, sources: src, changes: changes.slice(-12), anything: live.length + outdated.length + src.pending.length + src.cameras.length + src.witnesses.length > 0 };
  }
  // what the police believe (valid or not): the radio and the "what they know" card use this
  function believed() {
    const t = now(), out = {};
    for (const [key, f] of facts) out[key] = { value: f.value, conf: f.conf, valid: f.valid, concealed: f.concealed, age: t - f.lastT };
    return out;
  }
  function get(key) { const f = facts.get(key); return f ? factView(f, now()) : null; }
  function has(key, validOnly = true) { const f = facts.get(key); return !!f && (!validOnly || f.valid); }
  // forget facts by hand (shower clears 'traces'; a closed case clears everything except the long-lived ones)
  function forget(key, reason = 'cleared') { if (facts.has(key)) { const f = facts.get(key); facts.delete(key); emit({ kind: 'cleared', key, value: f.value, reason }); return true; } return false; }
  function closeCase(keep = ['face', 'home', 'plate']) {
    for (const key of [...facts.keys()]) if (!keep.includes(key)) { const f = facts.get(key); facts.delete(key); if (f.valid) emit({ kind: 'cleared', key, value: f.value, reason: 'case closed' }); }
    for (const [id, s] of sources) if (s.state === 'pending') { s.state = 'averted'; s.queue.length = 0; } else if (s.state === 'live' && ![...s.keys].some((k) => facts.has(k))) sources.delete(id);
  }
  function reset() { facts.clear(); sources.clear(); changes.length = 0; }
  function setHold(id, hold) { const s = sources.get(id); if (s) s.hold = !!hold; }
  function serialize() {
    const t = now();
    return { facts: [...facts.values()].map((f) => ({ key: f.key, value: f.value, age: t - f.lastT, ttl: f.ttl, valid: f.valid, sources: [...f.sources].map(([id, s]) => [id, s.c, t - s.t]) })),
      sources: [...sources.values()].filter((s) => s.state === 'live').map((s) => ({ id: s.id, type: s.type, label: s.label, reliability: s.reliability, age: t - s.t, ttl: s.ttl, keys: [...s.keys], where: s.where })) };
  }
  function restore(data) {
    reset(); if (!data) return;
    const t = now();
    for (const s of data.sources || []) sources.set(s.id, { id: s.id, type: s.type, label: s.label, reliability: s.reliability, state: 'live', eta: 0, total: 0, t: t - (s.age || 0), ttl: s.ttl, where: s.where || null, who: null, meta: {}, queue: [], keys: new Set(s.keys || []) });
    for (const f of data.facts || []) { if (!FACTS[f.key]) continue; const m = new Map(); for (const [id, c, age] of f.sources || []) m.set(id, { c, t: t - age }); const lastT = t - (f.age || 0); const o = { key: f.key, value: f.value, sources: m, firstT: lastT, lastT, ttl: f.ttl, valid: f.valid !== false, concealed: false, conf: 0, changedAt: -99, change: 'gained' }; o.conf = confOf(o, t); facts.set(f.key, o); }
  }

  return { FACTS, addSource, observe, cancelSource, setHold, tick, match, snapshot, believed, get, has, forget, closeCase, reset, serialize, restore,
    onChange: (fn) => { listeners.push(fn); return fn; }, source: (id) => sources.get(id) || null, stats, changes,
    get size() { return facts.size; }, sourcesOf: (type, state = 'live') => [...sources.values()].filter((s) => s.type === type && s.state === state) };
}

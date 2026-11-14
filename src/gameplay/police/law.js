// POLICE track: glue between the game and the knowledge model. Builds the evidence store, the six-star core and the senses,
// takes the wanted level over from the v1 code in gameplay.js (which this track does not own) and exposes game.wanted / game.evidence.
import * as THREE from 'three';
import { tryCall, warnOnce, sfx, distXZ } from '../util.js';
import { createEvidence } from '../evidence.js';
import { createWantedCore, SEV, MAX_STARS, HEAT_STEPS, SEARCH_R, CLEAR_TIME } from '../wantedCore.js';
import { createSense } from '../wantedSense.js';
import { describe, describeParts, factLine, changeLine, crimeName, CONDITION } from '../evidenceWords.js';

export function createLaw(game, G) {
  const P = game.player, now = () => game.clock.elapsed;
  const dayLeft = () => { const h = ((5 - (game.timeOfDay ?? 12)) + 24) % 24 || 24; return h * ((game.settings?.dayMinutes || 144) * 60 / 24); };
  const ev = createEvidence({ now, dayLeft });
  const core = createWantedCore({ now, evidence: ev, emit: (n, d) => game.emit?.(n, d) });
  const S = core.S;
  const notify = (text, ms = 2600, o = {}) => tryCall('notify', () => game.hud?.notify?.(text, ms, o));
  // cash vs. bank (CORE-SYSTEMS): fines and bribes come out of carried cash; fall back to player.money
  const money = {
    cash: () => tryCall('cash', () => game.wallet?.cash ?? game.money?.cash, undefined) ?? P.money ?? 0,
    pay(n, why) { n = Math.round(n); if (n <= 0) return true; const w = game.wallet || game.money; if (w?.pay) return !!tryCall('wallet.pay', () => w.pay(n, why), false); if ((P.money || 0) < n) return false; P.money -= n; game.emit?.('money:spent', { amount: n, why }); return true; },
    take(n, why) { n = Math.round(Math.min(n, money.cash())); if (n <= 0) return 0; const w = game.wallet || game.money; if (w?.loseCash) { tryCall('wallet.lose', () => w.loseCash(n, why)); return n; } P.money = Math.max(0, (P.money || 0) - n); game.emit?.('money:lost', { amount: n, why }); return n; },
  };
  const law = { ev, core, S, SEV, notify, money, radio: null, police: null, sense: null, hooks: [] };
  const sense = createSense(game, G, law); law.sense = sense;

  // ------------------------------------------------------------------ facade: game.wanted (v1 fields kept for the HUD, minimap and boats)
  const lastSeen = new THREE.Vector3(), searchCenter = new THREE.Vector3();
  const W = {
    get level() { return S.level; }, set level(v) { core.setStars(+v || 0, P.position, { visual: false }); },
    get heat() { return S.heat; }, get phase() { return S.phase; }, get seen() { return S.seen; }, get evading() { return S.level > 0 && S.phase === 'search'; },
    get searchCenter() { return S.search ? searchCenter.set(S.search.center.x, S.search.center.y, S.search.center.z) : null; }, get searchRadius() { return S.search ? S.search.radius : 0; },
    get lastSeen() { return lastSeen.set(S.lastKnown.x, S.lastKnown.y, S.lastKnown.z); }, get unseenT() { return S.unseenT; }, get clearProgress() { return S.clearProgress; }, get clearRate() { return S.clearRate; },
    get scrutiny() { return S.scrutiny; }, get bounty() { return S.bounty; }, get hidden() { return S.hidden; }, get match() { return S.matchNow; }, get condition() { return CONDITION[S.level]; },
    maxStars: MAX_STARS, tuning: { SEV, HEAT_STEPS, SEARCH_R, CLEAR_TIME },
    add(stars, position) { core.addStars(stars, position ? { x: position.x, y: position.y || 0, z: position.z } : { ...P.position }, { visual: true }); },
    set(stars, position, o) { core.setStars(stars, position || P.position, o); },
    clear(reason) { core.clear(reason || 'cleared'); },
    // knowledge
    evidence: ev, snapshot: () => ev.snapshot(), believed: () => ev.believed(), description: (o) => describe(ev.believed(), { sex: sense.reality().sex, ...o }),
    descriptionParts: (o) => describeParts(ev.believed(), o), factLine, changeLine,
    reality: () => sense.reality(), matchScore: (ctx) => ev.match(sense.reality(), ctx || { kind: 'foot', dist: 12, inVehicle: !!P.state.inVehicle }),
    // escape tools other tracks call
    shower: () => sense.shower(), ditchWeapon: (k) => sense.ditchWeapon(k), repaint: (v, hex) => sense.repaint(v, hex), changePlates: (v) => sense.changePlates(v), setGarment: (slot, g) => sense.setGarment(slot, g),
    destroyRecorder: (id) => sense.destroyRecorder(id), registerCamera: (c) => sense.registerCamera(c), registerRecorder: (r) => sense.registerRecorder(r),
    vehicleInfo: (v) => sense.vehicleInfo(v), plateOf: (v) => sense.plateOf(v), get tickets() { return sense.tickets; }, payTicket: (id) => sense.payTicket(id),
    get witnesses() { return sense.S.witnesses; }, get incidents() { return sense.S.incidents; }, get stats() { return sense.S.stats; },
    // map API for UI-FRONTEND / NAV-GPS: where the police are looking
    searchArea() { return S.search && S.level > 0 ? { x: S.search.center.x, z: S.search.center.z, radius: S.search.radius, progress: S.clearProgress, outside: S.outside, phase: S.phase, why: S.search.why } : null; },
    lastKnown() { return S.hasLastKnown && S.level > 0 ? { x: S.lastKnown.x, z: S.lastKnown.z, age: S.unseenT } : null; },
    law,
  };

  // ------------------------------------------------------------------ take over from the v1 wanted code (gameplay.js keeps its own `W`; pin it at zero)
  const legacy = G.wanted;
  if (legacy && legacy !== W) {
    for (const k of ['level', 'heat', 'unseenT', 'clearT', 'searchRadius', 'clearProgress']) tryCall('pin ' + k, () => Object.defineProperty(legacy, k, { configurable: true, get: () => 0, set() {} }));
    for (const k of ['evading', 'seen']) tryCall('pin ' + k, () => Object.defineProperty(legacy, k, { configurable: true, get: () => false, set() {} }));
    tryCall('pin sc', () => Object.defineProperty(legacy, 'searchCenter', { configurable: true, get: () => null, set() {} }));
    legacy.add = W.add; legacy.clear = W.clear;
  }
  G.wanted = W; game.wanted = W; game.evidence = ev;
  tryCall('player.wanted', () => Object.defineProperty(P, 'wanted', { configurable: true, enumerable: true, get: () => S.level, set: (v) => { if (+v === 0 && S.level > 0) core.clear('set'); } }));
  // v1 handleCrime must not run (it would start its own witness calls): it bails out while G.dead reads true, so present that
  // only for the duration of the 'crime' dispatch. Our own handler runs first.
  let deadReal = !!G.dead, mute = 0;
  tryCall('G.dead', () => Object.defineProperty(G, 'dead', { configurable: true, enumerable: true, get: () => deadReal || mute > 0, set: (v) => { deadReal = !!v; } }));
  function handleCrime(d) {
    if (!d || d._law) return; d._law = true;
    if (deadReal || G.busted) return;
    d._witnessed = d.witnessed;
    tryCall('law.crime', () => { const r = sense.onCrime(d); d.observed = r?.seenBy || null; });
    d.witnessed = false; // the HUD's "Crime reported" toast belongs to the moment somebody actually reports it
  }
  const emit0 = game.emit;
  game.emit = (n, d) => {
    if (n !== 'crime') return emit0(n, d);
    handleCrime(d);
    mute++; try { return emit0(n, d); } finally { mute--; }
  };
  game.on?.('crime', handleCrime); // callers holding a stale reference to game.emit still reach us

  // ------------------------------------------------------------------ reports, radio hooks, toasts
  law.onReported = (inc, by, src, w) => {
    const who = by === 'officer' ? 'An officer saw it' : by === 'alarm' ? 'An alarm went off' : w ? `${w.name} called it in` : `${src?.label || 'A witness'} called it in`;
    notify(`Reported: ${crimeName(inc.type)}. ${who}.`, 3400, { kind: 'crime', severity: inc.sev });
    if (by !== 'officer') sfx(game, 'ring', null, 0.35);
    tryCall('radio.dispatch', () => law.radio?.say('dispatch', { inc, by }));
    game.emit?.('crime:reported', { type: inc.type, by, position: inc.pos, level: S.level });
    tryCall('gangs', () => game.gangs?.onCrime?.({ type: inc.type, position: inc.pos, level: S.level }));
  };
  game.on?.('wantedChange', (d) => { if (d.level > (d.before ?? 0) && (d.before ?? 0) === 0) sfx(game, 'whistle', null, 0.5); });
  game.on?.('wanted:escaped', (d) => { notify(ev.size ? 'You lost the police. Your description stays on file until it goes stale.' : 'You lost the police.', 3600); tryCall('radio', () => law.radio?.say('lost', {})); });
  game.on?.('playerDied', () => { S.record.deaths++; });
  game.on?.('arrest', () => { S.record.arrests++; });

  // ------------------------------------------------------------------ per-frame
  let obsT = 0, officerT = 0;
  const callers = new Set();
  function tick(dt) {
    const R = sense.reality();
    ev.tick(dt, R);
    sense.tick(dt);
    // who can see the player, and do they realize who it is?
    let seenNow = false;
    const list = law.police?.observers?.() || [];
    const night = (game.timeOfDay ?? 12) < 6.5 || (game.timeOfDay ?? 12) > 19.5;
    const armedVisible = !!R.weaponVisible && R.weaponVisible !== 'bat' && R.weaponVisible !== 'knife' && (P.aiming || now() - (G.lastShotT ?? -99) < 8 || S.level > 0);
    const ctx = { armedVisible, sprinting: !!P.state.sprint, reckless: P.state.inVehicle && (P.state.vehicle?.speedKmh || 0) > 110, masked: R.masked };
    let nearest = 1e9, nearestObs = null;
    for (const ob of list) {
      const o = ob.o; ob.susp = o._susp || 0; ob.inVehicle = !!P.state.inVehicle; ob.night = night;
      const r = core.scrutinize(ob, dt, R, ctx); o._susp = ob.susp;
      if (!r.recognized) { o._callT = 0; continue; }
      // a unit that recognizes the player has to get it on the radio before anybody else knows
      o._callT = (o._callT || 0) + dt;
      if (S.seen || o._callT >= (ob.callTime ?? 1.6)) { seenNow = true; if (ob.dist < nearest) { nearest = ob.dist; nearestObs = ob; } if (!o._called) { o._called = true; callers.add(o); tryCall('radio.spot', () => law.radio?.say('spotted', { unit: ob.name, kind: ob.kind })); } }
    }
    if (!seenNow) for (const o of callers) { o._called = false; callers.delete(o); }
    law.nearestObserver = nearestObs;
    if (seenNow) {
      if (S.level === 0) { // cold recognition: the description on file was enough
        const stars = Math.max(1, Math.min(3, (S.peak || 1) - 1));
        core.reopen({ ...P.position }, stars); notify('An officer recognized you from the description on file.', 3200, { kind: 'crime' });
        tryCall('radio', () => law.radio?.say('recognized', { unit: nearestObs?.name }));
      } else core.sighting({ x: P.position.x, y: P.position.y, z: P.position.z }, { visual: true, by: nearestObs?.kind === 'heli' ? 'heli' : 'officer' });
      officerT -= dt;
      if (officerT <= 0 && nearestObs) { // officers with eyes on keep the description current
        officerT = 0.8;
        const heli = nearestObs.kind === 'heli' || nearestObs.kind === 'drone';
        const src = ev.addSource({ id: heli ? 'air:units' : 'officer:units', type: heli ? nearestObs.kind : 'officer', label: nearestObs.name || (heli ? 'Skywatch' : 'Pursuing officer'), reliability: 1 });
        sense.observe(src, { dist: nearest, kind: heli ? 'heli' : 'officer', k: 1 });
        // followed home: they now know where the safehouse is
        const home = tryCall('home', () => game.property?.home?.() || game.safehouse || null, null);
        if (home && Number.isFinite(home.x) && distXZ(home, P.position) < 25) ev.observe(src, 'home', { label: home.name || 'your safehouse', x: home.x, z: home.z }, 1);
      }
    }
    const m = ev.match(R, { kind: 'foot', dist: 12, inVehicle: !!P.state.inVehicle, night });
    core.tick(dt, { pos: P.position, seenNow, hidden: sense.hiddenNow(), match: m.score });
    // sustained violence in view of the police keeps adding heat
    if (S.seen && S.level >= 2 && now() - Math.max(G.copAggroT ?? -99, G.lastShotT ?? -99, G.lastConfirmedHit ?? -99) < 4) core.escalate(dt * 0.12);
    for (const h of law.hooks) tryCall('law.hook', () => h(dt));
    P._wantedT = 0; P.wantedEvading = W.evading;
    const help = sense.help() || law.help;
    if (help) { G.setHelp?.(help); law._helpOn = true; } else if (law._helpOn) { G.setHelp?.(null); law._helpOn = false; }
    law.help = null;
    void obsT;
  }
  // the case is closed (arrested, or died): everything short-lived is dropped
  function closeCase(why) { core.clear(why); ev.closeCase(['home', 'plate']); S.bounty = 0; for (const w of sense.S.witnesses) w.state = 'done'; }
  Object.assign(law, { W, tick, closeCase });
  W.closeCase = closeCase;
  return law;
}

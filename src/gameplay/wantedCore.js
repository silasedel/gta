// POLICE track: the six-star wanted state machine. Pure logic (no THREE, no DOM); the game feeds it observations.
// Stars only exist once a crime is KNOWN to the police (an officer saw it, a witness finished the call, an alarm tripped).
// Phases:  clean -> search (reported, nobody has eyes on you) <-> pursuit (a unit sees you and knows it is you) -> clean.
// Tuning is documented in docs/gameplay/police_tuning.md.

export const MAX_STARS = 6;
export const SEV = { assault: 1, shoplift: 1, vehicle_theft: 1, carjack: 1, trespass: 1, vandalism: 1, speeding: 0, red_light: 0, reckless: 0, weapon_display: 1, bribery: 1,
  evading: 2, resisting: 2, shooting: 2, robbery: 2, hit_pedestrian: 2, cop_assault: 2, cop_shot: 3, murder: 3, cop_murder: 3 };
export const HEAT_STEPS = [0, 1, 3, 7, 14, 24, 38];           // accumulated heat needed for each star
export const SEARCH_R = [0, 150, 250, 400, 600, 800, 1000];   // search-area radius per star (m)
export const CLEAR_TIME = [0, 14, 22, 34, 46, 60, 80];        // s of escape progress needed to lose the police
export const GRACE = 2.5;        // s after the last sighting before the pursuit becomes a search
export const CONTINUITY = 3.0;   // s a unit keeps "eyes on" without needing the description again
export const COOL_AFTER = 100;   // s of search without a sighting before the response scales back one star
export const COOL_STEP = 70;     // s between further scale-backs
export const BOUNTY_STAR6 = 50000;   // the six-star manhunt puts a public price on your head (added once per case)
export const BOUNTY = { assault: 150, shoplift: 80, vehicle_theft: 300, carjack: 500, trespass: 60, vandalism: 80, weapon_display: 150, bribery: 250, evading: 400, resisting: 400,
  shooting: 600, robbery: 1500, hit_pedestrian: 900, cop_assault: 1200, cop_shot: 2500, murder: 4000, cop_murder: 8000 };

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function createWantedCore(o) {
  const now = o.now, ev = o.evidence, emit = o.emit || (() => {});
  const S = {
    level: 0, heat: 0, phase: 'clean', seen: false, seenBy: null, visualT: -99, lastKnown: { x: 0, y: 0, z: 0 }, hasLastKnown: false,
    search: null, clearT: 0, clearProgress: 0, clearRate: 0, coolT: 0, unseenT: 0, scrutiny: 0, scrutinyBy: null, bounty: 0, peak: 0,
    incidents: [], record: { escapes: 0, arrests: 0, deaths: 0 }, startedT: 0, lastCrimeT: -99, hidden: false, outside: false, matchNow: 0, reportedT: -99,
    history: [], charges: [], star6: false,
  };
  // every star change with its reason (audit trail: stars never appear without a known crime; tests read it)
  const log = (level, before, reason) => { S.history.push({ t: Math.round(now() * 10) / 10, level, before, reason }); if (S.history.length > 40) S.history.shift(); };
  const levelFromHeat = () => { let l = 0; for (let i = 1; i <= MAX_STARS; i++) if (S.heat >= HEAT_STEPS[i]) l = i; return l; };
  function setLevel(l, reason) {
    l = clamp(Math.round(l), 0, MAX_STARS);
    if (l === S.level) return;
    const before = S.level; S.level = l; S.peak = Math.max(S.peak, l);
    if (before === 0 && l > 0) { S.startedT = now(); S.peak = l; }
    if (l >= MAX_STARS && !S.star6) { S.star6 = true; S.bounty += BOUNTY_STAR6; emit('wanted:manhunt', { bounty: S.bounty }); }
    log(l, before, reason);
    emit('wantedChange', { level: l, before, reason });
  }
  function setPhase(p, why) { if (S.phase === p) return; const before = S.phase; S.phase = p; emit('wanted:phase', { phase: p, before, why }); }
  function startSearch(center, radiusK = 1, why = 'lost') {
    const R0 = SEARCH_R[Math.max(1, S.level)] * radiusK;
    S.search = { center: { x: center.x, y: center.y || 0, z: center.z }, radius: R0, base: SEARCH_R[Math.max(1, S.level)], t: now(), why };
    S.clearT = Math.min(S.clearT, CLEAR_TIME[Math.max(1, S.level)] * 0.25);
    setPhase('search', why);
  }

  // A crime became known to the police.
  //   inc = { type, pos:{x,y,z}, severity?, by: 'officer'|'witness'|'alarm'|'camera'|'self', visual: bool (the reporter is an officer with eyes on the player), stars? (floor) }
  function report(inc) {
    const type = inc.type || 'assault';
    let sev = inc.severity ?? SEV[type] ?? 1;
    if (type === 'cop_murder' && S.level >= 3) sev = Math.max(sev, HEAT_STEPS[Math.min(MAX_STARS, S.level + 1)] - S.heat); // killing officers while hot always adds a star
    S.heat += sev;
    S.bounty += BOUNTY[type] || 0;
    S.lastCrimeT = now(); S.reportedT = now();
    S.incidents.push({ type, t: now(), pos: { ...inc.pos }, by: inc.by || 'witness', sev }); if (S.incidents.length > 24) S.incidents.shift();
    if (sev > 0) S.charges.push(type);
    const floor = Math.min(MAX_STARS, inc.stars ?? Math.min(3, sev));
    const before = S.level;
    setLevel(Math.max(S.level, floor, levelFromHeat()), type);
    if (S.level > 0) {
      S.coolT = 0;
      if (inc.visual) sighting(inc.pos, { visual: true, by: inc.by });
      else if (S.phase === 'clean' || before === 0) { S.lastKnown = { ...inc.pos }; S.hasLastKnown = true; startSearch(inc.pos, 0.6, 'reported'); S.clearT = 0; }
      else if (S.phase === 'search') { S.lastKnown = { ...inc.pos }; startSearch(inc.pos, 0.6, 'reported'); } // fresh report: the net moves to it
    }
    emit('wanted:report', { type, by: inc.by, level: S.level, before, pos: inc.pos });
    return S.level;
  }
  // The police learned where the player is. visual = a unit has eyes on (pursuit); otherwise a camera, tip or plate reader (the search area moves).
  function sighting(pos, info = {}) {
    S.lastKnown.x = pos.x; S.lastKnown.y = pos.y || 0; S.lastKnown.z = pos.z; S.hasLastKnown = true;
    if (S.level === 0) return;
    if (info.visual) {
      S.visualT = now(); S.seen = true; S.seenBy = info.by || 'officer'; S.clearT = 0; S.clearProgress = 0; S.coolT = 0; S.search = null;
      setPhase('pursuit', info.by || 'officer');
    } else {
      startSearch(pos, info.radiusK ?? 0.5, info.by || 'tip');
      emit('wanted:sighting', { pos: S.lastKnown, by: info.by });
    }
  }
  // Does this observer recognize the player? Keeps a suspicion value on the observer object (o.susp).
  //   obs = { susp, kind: 'foot'|'car'|'heli'|'drone'|'civilian', dist, perception 0..1, inVehicle, night }
  //   R = reality; ctx = { armedVisible, sprinting, reckless, masked }
  // returns { recognized: bool, score, susp }
  function scrutinize(obs, dt, R, ctx = {}) {
    const t = now();
    if (S.level > 0 && S.phase === 'pursuit' && t - S.visualT < CONTINUITY) { obs.susp = 1; return { recognized: true, score: 1, susp: 1 }; }
    const m = ev.match(R, { kind: obs.kind, dist: obs.dist, inVehicle: obs.inVehicle, night: obs.night });
    let s = m.score;
    const inArea = !!S.search;
    if (S.level > 0) {
      if (ctx.armedVisible && obs.dist < 45) s = Math.max(s, 0.62); // an armed person near a crime scene is always stopped
      if (ctx.sprinting && obs.dist < 40) s += 0.1;
      if (ctx.reckless) s += 0.12;
      if (ctx.masked && obs.dist < 30 && !obs.inVehicle) s += 0.12;  // a mask hides the face but draws attention
      if (inArea) s += 0.04;
    } else {
      if (ctx.armedVisible && obs.dist < 30) s = Math.max(s, 0.5);   // open carry of a drawn gun gets you stopped even when clean
    }
    const per = obs.perception ?? 0.5;
    const thr = (S.level > 0 ? 0.40 - per * 0.14 - S.level * 0.012 : 0.62 - per * 0.1);
    if (s > thr) obs.susp = Math.min(1, (obs.susp || 0) + (s - thr + 0.12) * (1.5 + per * 1.5) / (1 + obs.dist / 35) * dt * (obs.kind === 'heli' ? 0.7 : 1));
    else obs.susp = Math.max(0, (obs.susp || 0) - dt * 0.4);
    if (obs.susp > S.scrutiny) { S.scrutiny = obs.susp; S.scrutinyBy = obs.kind; }
    return { recognized: obs.susp >= 1, score: s, susp: obs.susp, best: m.best };
  }
  // An officer recognized the player while no case was active ("that's the guy from this morning"): reopen it.
  // Warrant style (user, GTA V scale): an old description only ever brings back 1-2 stars; the officer stops and questions.
  function reopen(pos, stars) {
    if (S.level > 0) return;
    stars = clamp(Math.round(stars), 1, 2);
    S.heat = HEAT_STEPS[stars]; S.charges.push('warrant');
    setLevel(stars, 'recognized');
    sighting(pos, { visual: true, by: 'officer' });
  }

  // tick: sense = { pos, seenNow: bool, hidden: bool (out of sight: indoors, parked dark, underwater...), match 0..1 (how well you match right now) }
  function tick(dt, sense) {
    S.scrutiny = Math.max(0, S.scrutiny - dt * 0.8);
    S.hidden = !!sense.hidden; S.matchNow = sense.match ?? 0;
    if (S.level === 0) { S.seen = false; S.phase = 'clean'; S.search = null; S.clearProgress = 0; return; }
    const t = now(), L = S.level;
    if (sense.seenNow) { S.visualT = t; S.lastKnown.x = sense.pos.x; S.lastKnown.y = sense.pos.y || 0; S.lastKnown.z = sense.pos.z; S.hasLastKnown = true; }
    const unseen = t - S.visualT; S.unseenT = unseen;
    S.seen = unseen < 0.75; // short memory: flickering line of sight is not "lost"
    if (S.seen) {
      S.clearT = 0; S.clearProgress = 0; S.clearRate = 0; S.coolT = 0; S.search = null; setPhase('pursuit', 'visual');
      return;
    }
    if (S.phase === 'pursuit') {
      if (unseen > GRACE) startSearch(S.lastKnown, 1, 'lost');
      else { const k = Math.min(1, dt * 2); S.lastKnown.x += (sense.pos.x - S.lastKnown.x) * k; S.lastKnown.z += (sense.pos.z - S.lastKnown.z) * k; return; } // they still know roughly where you went
    }
    if (!S.search) startSearch(S.hasLastKnown ? S.lastKnown : sense.pos, 1, 'lost');
    const A = S.search, outside = dist2(sense.pos, A.center) > A.radius;
    S.outside = outside;
    // every escape method works: leave the area (fastest), lie low out of sight, or stop matching the description
    let rate = outside ? 1 : sense.hidden ? 0.55 : (sense.match ?? 1) < 0.22 ? 0.4 : 0;
    if (outside && sense.hidden) rate = 1.25;
    S.clearRate = rate;
    if (!outside) A.radius = Math.min(A.base * 1.35, A.radius + dt * (1 + L * 0.6)); // the net widens slowly while you are inside it
    if (rate > 0) S.clearT += dt * rate; else S.clearT = Math.max(0, S.clearT - dt * 0.35);
    S.clearProgress = clamp(S.clearT / CLEAR_TIME[L], 0, 1);
    // waiting it out: a long search without a single sighting scales the response back one star at a time
    S.coolT += dt;
    if (S.coolT > COOL_AFTER && L > 1) { S.coolT = COOL_AFTER - COOL_STEP; S.heat = HEAT_STEPS[L - 1]; setLevel(L - 1, 'cooling'); S.clearT = Math.min(S.clearT, CLEAR_TIME[L - 1] * S.clearProgress); if (S.search) S.search.base = SEARCH_R[L - 1]; }
    if (S.clearT >= CLEAR_TIME[S.level]) escaped();
  }
  function escaped() {
    const peak = S.peak;
    S.record.escapes++;
    clear('escaped');
    emit('wanted:escaped', { peak, bounty: S.bounty });
  }
  function clear(reason = 'cleared') {
    const had = S.level > 0;
    S.heat = 0; S.search = null; S.clearT = 0; S.clearProgress = 0; S.seen = false; S.coolT = 0; S.scrutiny = 0;
    if (had) setLevel(0, reason);
    S.lastCharges = S.charges; S.charges = []; S.star6 = false;
    setPhase('clean', reason);
  }
  // sustained violence in view of the police keeps adding heat
  function escalate(amount, reason = 'violence') { if (S.level === 0) return; S.heat += amount; const l = levelFromHeat(); if (l > S.level) setLevel(l, reason); }
  function addStars(n, pos, opts = {}) { return report({ type: opts.type || 'assault', pos: pos || S.lastKnown, severity: n, stars: Math.min(MAX_STARS, Math.round(n)), by: opts.by || 'officer', visual: opts.visual !== false }); }
  function setStars(n, pos, opts = {}) { S.heat = HEAT_STEPS[clamp(n, 0, MAX_STARS)]; if (n <= 0) { clear('set'); return; } setLevel(n, 'set'); if (pos) sighting(pos, { visual: !!opts.visual, by: opts.by || 'officer', radiusK: 1 }); }
  return { S, report, sighting, scrutinize, reopen, tick, clear, escalate, addStars, setStars, levelFromHeat };
}

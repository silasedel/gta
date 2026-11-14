// Core systems: food, drink and the body. Calories and nutrition restore health and stamina; coffee gives a short
// sprint boost; alcohol follows a Widmark blood-alcohol model (wobble, hangover, passing out); spoiled food makes
// Nico sick; overeating slowly adds body fat and exercise takes it off; light needs: tiredness, sleep, showers.
// All rates are per GAME minute unless a comment says otherwise. The numbers are explained in economy.md.
import { clamp, ramp, num, hash01 } from './util.js';
import { QUALITY_HEAL } from './items.js';

export const BODY = {
  startFatKg: 13.6, minFatKg: 9, maxFatKg: 26,        // about 12% .. 28% body fat on this frame
  startLeanKg: 66.4, minLeanKg: 64, maxLeanKg: 72,
  kcalPerKgFat: 7700,
  widmarkR: 0.68,                                      // body-water constant (male)
  eliminationPctPerHour: 0.015,                        // blood alcohol cleared per hour
  activityScale: 0.12,                                 // see economy.md: 10x time compression would turn a jog into a marathon
  healPerKcal: 0.05, healPerProteinG: 0.15,
  stomachGrams: 1100,
};
const MET = { sleep: 0.95, idle: 1.3, drive: 1.5, walk: 3.3, jog: 8, sprint: 11.5, swim: 7, swimFast: 9.5 };
const EXERCISE = { run: 9.8, swim: 8, gym_weights: 5.5, gym_cardio: 8.5, sport: 7, walk: 3.5, yoga: 3 };
const HALF = (minutes) => Math.LN2 / minutes;           // half-life -> rate constant
const BAC_LEVELS = [[0.30, 'blackout'], [0.18, 'wasted'], [0.10, 'drunk'], [0.06, 'tipsy'], [0.03, 'buzzed']];
const TIRED_LEVELS = [[36, 'exhausted'], [26, 'very_tired'], [18, 'tired']];

export function createNeeds(sys) {
  const { host } = sys;
  const emit = (n, d) => { try { return host.emit?.(n, d); } catch (e) { return true; } };
  const P = host.player || (host.player = {});
  const S = {};       // physiological state (saved)
  const fx = { wobble: 0, drunk: 0, blur: 0, roll: 0, sprintMul: 1, staminaDrainMul: 1, staminaRegenMul: 1, healMul: 1, aimSway: 0, steerNoise: 0, drowsy: 0, nausea: 0, jitter: 0, hangover: 0, overLimit: false, exhausted: false };
  const body = P.body && typeof P.body === 'object' ? P.body : (P.body = {});
  let lastBacLevel = null, lastTiredLevel = null;

  function defaults() {
    Object.assign(S, {
      gutFast: 0, gutSlow: 0, gutGrams: 0, healPool: 0, staminaPool: 0, kcalToday: 0, burnedToday: 0, exerciseKcalToday: 0, proteinToday: 0,
      kcalTotal: 0, hydration: 0.8, alcoholGut: 0, alcoholBlood: 0, peakBac: 0, hangover: 0, caffeineGut: 0, caffeine: 0, kick: 0,
      sick: 0, sickPending: 0, sickOnsetAt: null, sickCause: null, awakeMin: 2 * 60, hygiene: 0.9, lastSleepAt: 7 * 60, lastShowerAt: 7.5 * 60,
      fatKg: BODY.startFatKg, leanKg: BODY.startLeanKg, muscleStim: 0, idleDays: 0, lastBodyDay: 1, vomitCd: 0,
    });
    P.stamina = 100;
    lastBacLevel = null; lastTiredLevel = null;
    syncBody();
  }
  function syncBody() {
    body.fatKg = S.fatKg; body.leanKg = S.leanKg; body.weightKg = S.fatKg + S.leanKg;
    body.fat = clamp((S.fatKg - BODY.minFatKg) / (BODY.maxFatKg - BODY.minFatKg));
    body.muscle = clamp((S.leanKg - BODY.minLeanKg) / (BODY.maxLeanKg - BODY.minLeanKg));
    body.bodyFatPct = S.fatKg / (S.fatKg + S.leanKg);
  }
  const weight = () => S.fatKg + S.leanKg;
  const enabled = () => host.settings?.needsEnabled !== false;
  const bacOf = () => S.alcoholBlood / (BODY.widmarkR * weight() * 10);   // percent
  const rate = () => sys.settingsStore?.difficulty.needsRate ?? 1;

  const N = { BODY, MET, EXERCISE, effects: fx };
  Object.defineProperty(N, 'state', {
    get: () => ({
      fullness: S.gutGrams / BODY.stomachGrams, kcalToday: S.kcalToday, kcalBurnedToday: S.burnedToday, hydration: S.hydration, bac: bacOf(), caffeineMg: S.caffeine,
      sick: S.sick, awakeHours: S.awakeMin / 60, tiredness: tiredness(), hygiene: S.hygiene, wellFed: clamp(S.healPool / 30), lastSleepAt: S.lastSleepAt, lastShowerAt: S.lastShowerAt,
      hangover: S.hangover, proteinToday: S.proteinToday, exerciseKcalToday: S.exerciseKcalToday,
    }),
  });
  Object.defineProperty(N, 'bac', { get: bacOf });
  Object.defineProperty(N, 'bacText', { get: () => bacOf().toFixed(2) + '%' });
  Object.defineProperty(N, 'raw', { get: () => S });
  const tiredness = () => (host.settings?.tirednessEnabled === false ? 0 : ramp(S.awakeMin / 60, 16, 40));
  N.bacLevel = () => { const b = bacOf(); for (const [min, name] of BAC_LEVELS) if (b >= min) return name; return null; };
  N.tiredLevel = () => { if (host.settings?.tirednessEnabled === false) return null; const h = S.awakeMin / 60; for (const [min, name] of TIRED_LEVELS) if (h >= min) return name; return null; };

  // ---------------------------------------------------------------- eating and drinking
  N.canIngest = (def, kind) => {
    const full = S.gutGrams / BODY.stomachGrams;
    if (kind === 'eat' && full >= 1.0) return { ok: false, reason: 'too_full' };
    if (kind === 'drink' && full >= 1.2) return { ok: false, reason: 'too_full' };
    if (S.sick > 0.75 && kind === 'eat') return { ok: false, reason: 'too_sick' };
    return { ok: true };
  };
  // One portion (bite or sip) goes down. `n` is the nutrition of THAT portion.
  N.ingest = (n, opts = {}) => {
    const kind = opts.kind || 'eat';
    if (opts.def) { const c = N.canIngest(opts.def, kind); if (!c.ok) return c; }
    const kcal = num(n.kcal), alcoholG = num(n.alcoholG ?? n.alcohol), caffeine = num(n.caffeineMg ?? n.caffeine), water = num(n.waterMl ?? n.water);
    const sugar = num(n.sugar), carbs = num(n.carbs), protein = num(n.protein), fat = num(n.fat);
    const q = QUALITY_HEAL[opts.quality] ?? QUALITY_HEAL.snack;
    // alcohol calories (7 kcal/g) are already in kcal; sugars absorb fast, the rest slowly
    const fast = clamp(sugar * 4 + alcoholG * 7, 0, kcal), slow = Math.max(0, kcal - fast);
    S.gutFast += fast; S.gutSlow += slow;
    const grams = opts.def && opts.portionOf ? (opts.def.weight * 1000) / opts.portionOf : (kind === 'drink' ? water : kcal / 2.2);
    S.gutGrams += Math.max(grams, water * 0.9, 5);
    S.kcalToday += kcal; S.kcalTotal += kcal; S.proteinToday += protein;
    if (!opts.spoiled) {
      S.healPool = Math.min(70, S.healPool + (kcal * BODY.healPerKcal + protein * BODY.healPerProteinG) * q);
      S.staminaPool = Math.min(120, S.staminaPool + carbs * 0.45 + sugar * 0.35 + fat * 0.1);
    }
    S.hydration = clamp(S.hydration + water / 2200 - alcoholG * 10 / 2200 - caffeine * 0.4 / 2200);
    if (alcoholG > 0) S.alcoholGut += alcoholG;
    if (caffeine > 0) { S.caffeineGut += caffeine; S.kick = Math.min(1.6, S.kick + caffeine / 80); emit('caffeine', { mg: caffeine, total: S.caffeine + S.caffeineGut }); }
    const ex = opts.def?.effects || {};
    if (ex.heal?.amount && opts.portionOf) heal(ex.heal.amount / opts.portionOf);
    if (ex.stamina?.amount && opts.portionOf) P.stamina = clamp(num(P.stamina, 100) + ex.stamina.amount / opts.portionOf, 0, 100);
    if (ex.sprint && opts.portionOf && !caffeine) S.kick = Math.min(1.6, S.kick + (ex.sprint.amount || 1) / opts.portionOf);
    if (ex.sick && opts.portionOf) makeSick((ex.sick.amount || 0.5) / opts.portionOf, 'bad_food');
    if (opts.spoiled) makeSick(0.28, 'spoiled');
    else if (kind === 'eat' && S.gutGrams / BODY.stomachGrams > 0.92) makeSick(0.06, 'overeating');
    sys.stats?.add('kcalEaten', kcal);
    if (alcoholG) sys.stats?.add('alcoholGrams', alcoholG);
    return { ok: true };
  };
  function heal(hp) { if (num(P.health, 100) > 0) P.health = Math.min(100, num(P.health, 100) + hp); }
  function makeSick(amount, cause) {
    S.sickPending = clamp(S.sickPending + amount, 0, 1);
    S.sickCause = cause;
    if (S.sickOnsetAt === null) S.sickOnsetAt = (sys.time?.now ?? 0) + (cause === 'overeating' ? 5 : 20);
  }
  N.medicine = (def) => { // antacids, pain relief, first-aid: handled by the 'medicine' use action
    const e = def?.effects || {};
    const hp = def?.heal || e.heal?.amount || 0;
    if (hp) heal(hp);
    if (e.cure || /antacid|stomach|nausea/.test((def?.tags || []).join(' ') + ' ' + (def?.sub || ''))) { S.sick *= 0.3; S.sickPending *= 0.3; }
    if (/pain|aspirin|ibuprofen|hangover|electrolyte/.test((def?.tags || []).join(' ') + ' ' + (def?.sub || ''))) S.hangover *= 0.4;
    return { ok: true, healed: hp };
  };
  N.vomit = () => {
    if (S.vomitCd > 0) return false;
    S.vomitCd = 30;
    S.gutFast *= 0.15; S.gutSlow *= 0.15; S.gutGrams *= 0.1; S.alcoholGut *= 0.1; S.caffeineGut *= 0.2; S.healPool *= 0.3; S.staminaPool *= 0.3;
    S.sick *= 0.7; S.hydration = clamp(S.hydration - 0.12);
    const p = P.position;
    emit('vomit', { position: p ? { x: p.x, y: p.y, z: p.z } : null });
    sys.stats?.add('timesVomited', 1);
    return true;
  };

  // ---------------------------------------------------------------- exercise reported by other systems (gym, sports)
  N.exercise = (kind, gameMinutes, intensity = 1) => {
    const met = (EXERCISE[kind] || 6) * clamp(intensity, 0.3, 1.6), m = Math.max(0, num(gameMinutes));
    const kcal = (met - 1) * weight() * 0.0175 * m;
    S.burnedToday += kcal; S.exerciseKcalToday += kcal;
    if (kind === 'gym_weights') S.muscleStim += m * intensity;
    else if (kind === 'swim' || kind === 'sport') S.muscleStim += m * 0.35 * intensity;
    else if (kind === 'run' || kind === 'gym_cardio') S.muscleStim += m * 0.15 * intensity;
    S.hygiene = clamp(S.hygiene - m * 0.0015 * intensity);
    S.hydration = clamp(S.hydration - m * 0.0012 * intensity);
    sys.stats?.add('exerciseMinutes', m);
    return { kcal };
  };

  // ---------------------------------------------------------------- the simulation step
  // ctx: { met, asleep, sprinting, swimming, moving, vigorous }
  function step(m, ctx) {
    const W = weight();
    // digestion
    const fOut = S.gutFast * (1 - Math.exp(-HALF(12) * m)), sOut = S.gutSlow * (1 - Math.exp(-HALF(75) * m));
    S.gutFast -= fOut; S.gutSlow -= sOut;
    S.gutGrams *= Math.exp(-HALF(80) * m);
    if (S.gutGrams < 1) S.gutGrams = 0;
    // healing and stamina from food, delivered as it digests
    const hOut = S.healPool * (1 - Math.exp(-m / 6));
    if (num(P.health, 100) > 0 && num(P.health, 100) < 100) { const give = Math.min(hOut * fx.healMul, 100 - P.health); P.health += give; S.healPool -= hOut; }
    else S.healPool -= hOut * 0.08;             // nothing to heal: the reserve lasts ("well fed")
    const stOut = S.staminaPool * (1 - Math.exp(-m / 10));
    S.staminaPool -= stOut;
    if (!ctx.sprinting) P.stamina = clamp(num(P.stamina, 100) + stOut * 0.6, 0, 100);
    // energy burn
    const met = ctx.met ?? MET.idle;
    const burn = (1 + (met - 1) * (ctx.unscaled ? 1 : BODY.activityScale)) * W * 0.0175 * m;
    S.burnedToday += burn;
    if (met >= 6) { S.exerciseKcalToday += (met - 1) * BODY.activityScale * W * 0.0175 * m; S.muscleStim += m * BODY.activityScale * (ctx.swimming ? 0.35 : 0.15); }
    // water
    S.hydration = clamp(S.hydration - m * (ctx.asleep ? 0.00025 : 0.00045) * (met >= 6 ? 1.6 : 1));
    // alcohol: first-order absorption (slower on a full stomach), zero-order elimination
    if (S.alcoholGut > 0) { const k = HALF(10 + 18 * clamp(S.gutGrams / 600)); const a = S.alcoholGut * (1 - Math.exp(-k * m)); S.alcoholGut -= a; S.alcoholBlood += a; if (S.alcoholGut < 0.01) S.alcoholGut = 0; }
    if (S.alcoholBlood > 0) S.alcoholBlood = Math.max(0, S.alcoholBlood - BODY.eliminationPctPerHour * BODY.widmarkR * W * 10 * (m / 60));
    const bac = bacOf();
    if (bac > S.peakBac) S.peakBac = bac;
    if (bac <= 0.005 && S.peakBac > 0) { if (S.peakBac >= 0.12) S.hangover = Math.max(S.hangover, clamp((S.peakBac - 0.08) / 0.14)); S.peakBac = 0; }
    if (S.hangover > 0 && bac <= 0.005) S.hangover = Math.max(0, S.hangover - m / (360 * (S.hydration > 0.6 ? 0.7 : 1)));
    // caffeine
    if (S.caffeineGut > 0) { const a = S.caffeineGut * (1 - Math.exp(-HALF(12) * m)); S.caffeineGut -= a; S.caffeine += a; if (S.caffeineGut < 0.05) S.caffeineGut = 0; }
    S.caffeine *= Math.exp(-HALF(300) * m); if (S.caffeine < 0.05) S.caffeine = 0;
    S.kick *= Math.exp(-HALF(15) * m); if (S.kick < 0.01) S.kick = 0;
    // sickness: onset after a delay, then it wears off over a few hours
    const now = sys.time?.now ?? 0;
    if (S.sickOnsetAt !== null && now >= S.sickOnsetAt) {
      S.sick = clamp(S.sick + S.sickPending); S.sickPending = 0; S.sickOnsetAt = null;
      emit('sick', { cause: S.sickCause, level: S.sick });
      sys.stats?.add('timesSick', 1);
      if (S.sick > 0.5 && !ctx.asleep) N.vomit();
    }
    if (S.sick > 0) {
      if (num(P.health, 100) > 15) P.health = Math.max(15, P.health - 2 * S.sick * (m / 60));
      S.sick = Math.max(0, S.sick - m / 180);
    }
    if (S.vomitCd > 0) S.vomitCd = Math.max(0, S.vomitCd - m);
    // alcohol poisoning
    if (bac >= 0.40 && num(P.health, 100) > 5) P.health = Math.max(5, P.health - 12 * (m / 60));
    // awake time and hygiene
    if (ctx.asleep) S.awakeMin = Math.max(0, S.awakeMin - m * 3);
    else S.awakeMin += m * rate();
    S.hygiene = clamp(S.hygiene - m / (3 * 1440) * (met >= 6 ? 3 : 1));
  }
  // Advance the body by game minutes (used every frame and by time skips).
  N.advance = (gameMinutes, ctx = {}) => {
    if (!(gameMinutes > 0)) return;
    if (!enabled()) { S.awakeMin = Math.min(S.awakeMin, 10 * 60); return; }
    let left = gameMinutes;
    while (left > 1e-9) { const m = Math.min(left, 5); step(m, ctx); left -= m; }
  };

  function refreshEffects() {
    const on = enabled();
    const bac = on ? bacOf() : 0, t = on ? tiredness() : 0;
    const cafSat = S.caffeine / (S.caffeine + 120);
    const tired = t * (1 - 0.5 * cafSat);
    fx.drunk = ramp(bac, 0.03, 0.22);
    fx.nausea = on ? clamp(S.sick + 0.35 * S.hangover + ramp(S.gutGrams / BODY.stomachGrams, 1.05, 1.3) * 0.5) : 0;
    fx.wobble = clamp(Math.pow(fx.drunk, 1.2) + 0.5 * (on ? S.sick : 0) + 0.25 * ramp(tired, 0.6, 1));
    fx.blur = clamp(ramp(bac, 0.1, 0.26) + 0.4 * ramp(tired, 0.5, 1));
    fx.steerNoise = clamp(ramp(bac, 0.05, 0.2) + 0.3 * ramp(tired, 0.6, 1));
    fx.jitter = on ? ramp(S.caffeine, 350, 700) : 0;
    fx.aimSway = clamp(ramp(bac, 0.04, 0.2) * 0.8 + fx.jitter * 0.5 + 0.3 * tired + 0.3 * (on ? S.sick : 0));
    fx.drowsy = ramp(tired, 0.35, 1);
    fx.hangover = on ? S.hangover : 0;
    fx.overLimit = bac >= 0.08;
    const kick = on ? Math.min(1, S.kick) : 0;
    const fatPenalty = 1 - 0.06 * clamp((S.fatKg - BODY.startFatKg) / (BODY.maxFatKg - BODY.startFatKg));
    fx.exhausted = num(P.stamina, 100) <= 0.5;
    fx.sprintMul = (1 + 0.12 * kick) * (1 - 0.18 * fx.drunk) * (1 - 0.12 * tired) * (1 - 0.15 * (on ? S.sick : 0)) * fatPenalty * (fx.exhausted ? 0.62 : 1);
    fx.staminaDrainMul = (1 - 0.4 * kick) * (1 + 0.5 * clamp((S.fatKg - BODY.startFatKg) / (BODY.maxFatKg - BODY.startFatKg))) * (1 - 0.25 * clamp((S.leanKg - BODY.startLeanKg) / (BODY.maxLeanKg - BODY.startLeanKg))) * (1 + 0.3 * tired);
    fx.staminaRegenMul = (1 - 0.5 * tired) * (1 - 0.5 * (on ? S.sick : 0)) * (1 - 0.3 * (on ? S.hangover : 0)) * (0.7 + 0.3 * ramp(S.hydration, 0.15, 0.5)) * (1 - 0.3 * fx.jitter);
    fx.healMul = (1 - 0.4 * (on ? S.sick : 0)) * (0.8 + 0.2 * ramp(S.hydration, 0.15, 0.5));
    fx.roll = fx.wobble * 0.06;
  }

  function levelEvents() {
    const lv = N.bacLevel();
    if (lv !== lastBacLevel) {
      const rank = (x) => (x ? BAC_LEVELS.length - BAC_LEVELS.findIndex((b) => b[1] === x) : 0);
      if (rank(lv) > rank(lastBacLevel)) { emit('drunk', { bac: bacOf(), level: lv }); if (lv === 'drunk') sys.stats?.add('timesDrunk', 1); }
      else if (!lv) emit('sober', {});
      lastBacLevel = lv;
    }
    const tl = N.tiredLevel();
    if (tl !== lastTiredLevel) { if (tl && TIRED_LEVELS.findIndex((x) => x[1] === tl) <= (lastTiredLevel ? TIRED_LEVELS.findIndex((x) => x[1] === lastTiredLevel) : 99)) emit('tired', { level: tl, awakeHours: S.awakeMin / 60 }); lastTiredLevel = tl; }
  }

  // real seconds, every frame
  N.update = (realDt) => {
    const st = P.state || {};
    const speed = num(st.speed), swim = !!P.swimming, inVeh = !!st.inVehicle;
    const sprinting = !inVeh && ((!!st.sprint && speed > 4.5) || (swim && speed > 2.4));
    const met = inVeh ? MET.drive : swim ? (speed > 2.4 ? MET.swimFast : speed > 0.3 ? MET.swim : 2.5) : sprinting ? MET.sprint : speed > 3 ? MET.jog : speed > 0.4 ? MET.walk : MET.idle;
    const gm = sys.time ? sys.time.toGameMinutes(realDt) * (sys.time.paused ? 0 : (sys.time.rate || 1)) : realDt / 6;
    if (!(num(P.health, 100) <= 0)) N.advance(gm, { met, sprinting, swimming: swim });
    refreshEffects();
    // stamina (real-time: this is moment-to-moment feel, not physiology)
    let s = num(P.stamina, 100);
    if (sprinting) s -= realDt * (100 / 75) * fx.staminaDrainMul * (swim ? 0.8 : 1);
    else s += realDt * (100 / (speed > 3 ? 45 : 20)) * fx.staminaRegenMul;
    P.stamina = clamp(s, 0, 100);
    if (enabled()) {
      levelEvents();
      // consequences of going far too far
      if (bacOf() >= 0.30 && !N.blackingOut) N.passOut('alcohol');
      else if (host.settings?.tirednessEnabled !== false && S.awakeMin >= 48 * 60 && !N.blackingOut) N.passOut('exhaustion');
    }
    sys.stats?.max('peakBac', bacOf());
  };

  // Catch-up after a time skip that was not sleep (waiting, travel): the body lived through it at rest.
  N.catchUp = (minutes, info = {}) => {
    if (info.reason === 'sleep' || info.reason === 'passout') return;   // sleep() advances the body itself
    N.advance(minutes, { met: MET.idle });
    refreshEffects();
  };

  // ---------------------------------------------------------------- sleep, waiting, passing out, showers
  const QUALITY = { home: 1, hotel: 1.05, yacht: 1.05, car: 0.6, bench: 0.4, floor: 0.35 };
  N.canSleep = (opts = {}) => {
    const place = opts.place || 'home';
    if (num(P.health, 100) <= 0) return { ok: false, reason: 'dead' };
    if (num(host.wanted?.level ?? P.wanted) > 0) return { ok: false, reason: 'wanted' };
    if (P.state?.inVehicle && place !== 'car') return { ok: false, reason: 'in_vehicle' };
    if ((place === 'home' || place === 'hotel') && opts.propertyId && sys.property && !sys.property.hasFeature(opts.propertyId, 'bed')) return { ok: false, reason: 'no_bed' };
    if (S.awakeMin < 60 && !opts.force) return { ok: false, reason: 'not_tired' };
    return { ok: true };
  };
  N.sleep = async (opts = {}) => {
    const place = opts.place || 'home';
    const can = N.canSleep(opts);
    if (!can.ok) return can;
    let hours = num(opts.hours, 0);
    if (!hours && Number.isFinite(opts.until) && sys.time) hours = sys.time.minutesUntil(opts.until) / 60;
    if (!hours) hours = clamp(S.awakeMin / 180 + 1.5, 3, 9);      // sleep in proportion to how long he has been up
    hours = clamp(hours, 0.5, 14);
    const q = QUALITY[place] ?? 0.6, before = num(P.health, 100);
    emit('sleepStart', { place, hours, propertyId: opts.propertyId || null });
    N.sleeping = true;
    try {
      // advance the body asleep, then move the clock (scheduled events and other systems catch up)
      N.advance(hours * 60, { met: MET.sleep, asleep: true, unscaled: true });
      if (q < 1) S.awakeMin += hours * 60 * 3 * (1 - q);             // poor sleep rests less
      S.awakeMin = Math.max(0, S.awakeMin);
      P.health = Math.min(100, num(P.health, 100) + hours * 9 * q);
      P.stamina = 100;
      S.lastSleepAt = (sys.time?.now ?? 0) + hours * 60;
      sys.time?.skip(hours * 60, { reason: 'sleep' });
    } finally { N.sleeping = false; }
    refreshEffects();
    const healed = num(P.health, 100) - before;
    sys.stats?.add('timesSlept', 1); sys.stats?.add('hoursSlept', hours);
    emit('sleepEnd', { place, hours, healed, propertyId: opts.propertyId || null });
    let saved = null;
    if (opts.save !== false && (place === 'home' || place === 'hotel' || place === 'yacht') && sys.save?.loaded) saved = await sys.save.save({ kind: 'manual', reason: 'sleep', thumb: true });
    return { ok: true, hours, healed, saved: saved ? saved.ok : false };
  };
  N.wait = (gameMinutes) => (sys.time ? sys.time.skip(clamp(num(gameMinutes), 0, 24 * 60), { reason: 'wait' }) : null);

  // Drunk or exhausted past the limit: Nico goes down where he stands and wakes hours later. In a rough area
  // someone may have been through his pockets.
  N.passOut = (cause) => {
    if (N.blackingOut) return null;
    N.blackingOut = true;
    try {
      const hours = cause === 'alcohol' ? 5 + 2 * hash01('po', sys.time?.now ?? 0) : 6;
      emit('passedOut', { cause, hours });
      sys.stats?.add('timesPassedOut', 1);
      N.advance(hours * 60, { met: MET.sleep, asleep: true, unscaled: true });
      S.awakeMin += hours * 60 * 3 * 0.5;      // not real rest
      sys.time?.skip(hours * 60, { reason: 'passout' });
      let stolen = 0;
      const d = sys.economy?.here?.();
      const indoors = !!host.currentInterior || !!(sys.property && P.position && sys.property.isPrivateSpot?.(P.position.x, P.position.z));
      if (!indoors && sys.wallet && sys.wallet.cash > 0 && hash01('rob', sys.time?.now ?? 0) < 0.25 + 0.6 * (d?.crime ?? 0.35)) stolen = sys.wallet.lose(0.4 + 0.5 * hash01('amt', sys.time?.now ?? 0), { reason: 'pickpocket', by: 'while passed out' });
      refreshEffects();
      emit('wokeUp', { cause, hours, stolen });
      return { hours, stolen };
    } finally { N.blackingOut = false; }
  };

  N.shower = (opts = {}) => {
    S.hygiene = 1; S.lastShowerAt = sys.time?.now ?? 0;
    S.hangover *= 0.8;
    sys.stats?.add('showers', 1);
    emit('shower', { place: opts.place || null, propertyId: opts.propertyId || null });
    return true;
  };

  // ---------------------------------------------------------------- long-term body change, settled once per game day
  N.settleDay = (dayNumber) => {
    const W = weight();
    const restDay = 1 * W * 0.0175 * 1440;                         // a day at 1 MET
    const tdee = Math.max(S.burnedToday, restDay * 0.6);            // partial days (a new game starts at 9 AM) still count as lived
    const on = enabled() && host.settings?.bodyChangeEnabled !== false;
    const speed = clamp(num(host.settings?.bodyChangeRate, 3), 0.1, 20);
    // Nico eats off screen up to what he burned, minus 60% of deliberate exercise; anything eaten beyond what he burned is surplus.
    const assumed = Math.max(0, tdee - 0.6 * S.exerciseKcalToday);
    const balance = Math.max(S.kcalToday, assumed) - tdee;
    let changed = false;
    if (on) {
      const fat0 = S.fatKg, lean0 = S.leanKg;
      S.fatKg = clamp(S.fatKg + (balance / BODY.kcalPerKgFat) * speed, BODY.minFatKg, BODY.maxFatKg);
      // muscle: weights-equivalent minutes build it (protein helps); a week off lets extra muscle fade back
      if (S.muscleStim >= 10) { S.idleDays = 0; const gain = Math.min(0.06, S.muscleStim / 30 * 0.02) * (S.proteinToday >= 80 ? 1 : 0.7) * speed; S.leanKg = clamp(S.leanKg + gain, BODY.minLeanKg, BODY.maxLeanKg); }
      else { S.idleDays += 1; if (S.idleDays > 3 && S.leanKg > BODY.startLeanKg) S.leanKg = Math.max(BODY.startLeanKg, S.leanKg - 0.008 * speed); }
      changed = Math.abs(S.fatKg - fat0) > 1e-6 || Math.abs(S.leanKg - lean0) > 1e-6;
    }
    const row = { day: dayNumber, eaten: S.kcalToday, burned: S.burnedToday, exercise: S.exerciseKcalToday, balance, fatKg: S.fatKg, leanKg: S.leanKg };
    S.kcalToday = 0; S.burnedToday = 0; S.exerciseKcalToday = 0; S.proteinToday = 0; S.muscleStim = 0; S.lastBodyDay = dayNumber;
    syncBody();
    if (changed) emit('bodyChanged', { fat: body.fat, muscle: body.muscle, weightKg: body.weightKg, row });
    return row;
  };

  // ---------------------------------------------------------------- save slice
  N.reset = () => { defaults(); refreshEffects(); };
  N.toSave = () => ({ ...S, stamina: num(P.stamina, 100) });
  N.fromSave = (d) => {
    defaults();
    if (d) { for (const k of Object.keys(S)) if (d[k] !== undefined) S[k] = d[k]; P.stamina = clamp(num(d.stamina, 100), 0, 100); }
    syncBody(); refreshEffects();
    lastBacLevel = N.bacLevel(); lastTiredLevel = N.tiredLevel();
  };
  defaults(); refreshEffects();
  return N;
}

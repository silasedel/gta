// Core systems: the clock and calendar. Owns game time (game.timeExternal = true), the day counter, weekdays and dates,
// time skips with catch-up, the scheduler (at / in / every / onHour), and the moon, tide and sun values.
// Time unit: game minutes since Day 1, 00:00 ("now"). A new game starts on Day 1 at 9:00 AM: Friday, June 5, 2026.
import { clamp, hash32 } from './util.js';

export const DAY = 1440;
export const START_MINUTE = 9 * 60;                      // new games start at 9:00 AM
export const EPOCH = { year: 2026, month: 6, day: 5 };   // Day 1 (a Friday)
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---- civil calendar (proleptic Gregorian), days since 1970-01-01. No Date objects: no time zones, no DST surprises.
export function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
export function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400, doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153), d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9);
  return { year: y + (m <= 2 ? 1 : 0), month: m, day: d };
}
const EPOCH_DAYS = daysFromCivil(EPOCH.year, EPOCH.month, EPOCH.day);
export const weekdayOfDays = (days) => (((days + 4) % 7) + 7) % 7;   // 1970-01-01 was a Thursday (4)

export function dateOfDay(dayNumber) { // dayNumber is 1-based
  const days = EPOCH_DAYS + dayNumber - 1, c = civilFromDays(days), wd = weekdayOfDays(days);
  const p2 = (n) => String(n).padStart(2, '0');
  return {
    ...c, weekday: wd, weekdayName: WEEKDAYS[wd], monthName: MONTHS[c.month - 1],
    text: `${WEEKDAYS[wd].slice(0, 3)}, ${MONTHS[c.month - 1].slice(0, 3)} ${c.day}`,
    long: `${WEEKDAYS[wd]}, ${MONTHS[c.month - 1]} ${c.day}, ${c.year}`,
    iso: `${c.year}-${p2(c.month)}-${p2(c.day)}`,
    dayOfYear: days - daysFromCivil(c.year, 1, 1) + 1,
  };
}
export function clockText(hour, { h24 = false, seconds = false } = {}) {
  let total = Math.floor((((hour % 24) + 24) % 24) * 3600 + 1e-6);
  const h = Math.floor(total / 3600) % 24, m = Math.floor((total % 3600) / 60), s = total % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  if (h24) return `${p2(h)}:${p2(m)}${seconds ? ':' + p2(s) : ''}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${p2(m)}${seconds ? ':' + p2(s) : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---- moon: mean synodic month from a known new moon (2000-01-06 18:14 UTC). Miami is UTC-4 in summer; the hour offset is
// well below anything visible in a moon phase.
const SYNODIC = 29.530588853;
const NEW_MOON_REF_DAYS = daysFromCivil(2000, 1, 6) + (18 + 14 / 60) / 24;
const PHASE_NAMES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
export function moonAt(now) {
  const days = EPOCH_DAYS + now / DAY + 4 / 24 - NEW_MOON_REF_DAYS;   // local -> UTC (+4 h)
  const phase = (((days / SYNODIC) % 1) + 1) % 1;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const idx = Math.floor(((phase + 1 / 16) % 1) * 8);
  return { phase, illumination, name: PHASE_NAMES[idx], ageDays: phase * SYNODIC, waxing: phase < 0.5 };
}

// ---- tide: sum of the main constituents for a microtidal Atlantic coast like Miami's (mean range about 0.6 m).
// M2 and S2 are phased so that spring tides fall on new and full moons, like the real thing.
const TIDE = [ // [name, period in hours, amplitude in meters, phase offset in cycles]
  ['M2', 12.4206012, 0.300, 0.0], ['S2', 12.0, 0.055, 0.0], ['N2', 12.65834751, 0.070, 0.31],
  ['K1', 23.93447213, 0.032, 0.12], ['O1', 25.81933871, 0.028, 0.57],
];
const TIDE_MAX = TIDE.reduce((s, c) => s + c[2], 0);
export function tideMeters(now) {
  const hours = (EPOCH_DAYS + now / DAY + 4 / 24 - NEW_MOON_REF_DAYS) * 24;
  let h = 0;
  for (const [, period, amp, ph] of TIDE) h += amp * Math.cos(2 * Math.PI * (hours / period - ph));
  return h;
}
export function tideAt(now) {
  const m = tideMeters(now), ahead = tideMeters(now + 1);
  const rising = ahead > m;
  // scan forward for the next turning points (5-minute steps, refined by one parabolic step)
  let nextHighIn = null, nextLowIn = null, prev = m, prevDir = rising ? 1 : -1;
  for (let t = 5; t <= 16 * 60 && (nextHighIn === null || nextLowIn === null); t += 5) {
    const v = tideMeters(now + t), dir = v > prev ? 1 : -1;
    if (dir !== prevDir) { if (prevDir > 0 && nextHighIn === null) nextHighIn = t - 5; else if (prevDir < 0 && nextLowIn === null) nextLowIn = t - 5; }
    prev = v; prevDir = dir;
  }
  return { meters: m, height: clamp(m / TIDE_MAX, -1, 1), rising, nextHighIn, nextLowIn, rangeMeters: TIDE_MAX * 2 };
}

// ---- sun: sunrise equation for Miami (25.78 N, 80.19 W), local clock time including US daylight saving.
function isDst(c, days) {
  // second Sunday of March .. first Sunday of November
  const firstOf = (month) => daysFromCivil(c.year, month, 1);
  const marchFirst = firstOf(3), novFirst = firstOf(11);
  const secondSunMar = marchFirst + ((7 - weekdayOfDays(marchFirst)) % 7) + 7;
  const firstSunNov = novFirst + ((7 - weekdayOfDays(novFirst)) % 7);
  return days >= secondSunMar && days < firstSunNov;
}
export function sunAt(dayNumber) {
  const days = EPOCH_DAYS + dayNumber - 1, c = civilFromDays(days), doy = days - daysFromCivil(c.year, 1, 1) + 1;
  const lat = 25.78 * Math.PI / 180, lon = -80.19;
  const g = 2 * Math.PI / 365 * (doy - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqMin = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const ha = Math.acos(clamp((Math.cos(90.833 * Math.PI / 180) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl)), -1, 1)) * 180 / Math.PI;
  const dst = isDst(c, days) ? 1 : 0, tz = -5 + dst;
  const noon = (720 - 4 * lon - eqMin) / 60 + tz;
  return { rise: noon - ha / 15, set: noon + ha / 15, noon, dst: !!dst, dayLengthHours: ha / 7.5 };
}

// =====================================================================================================================
export function createTime(sys) {
  const { host } = sys;
  const emit = (n, d) => { try { return host.emit?.(n, d); } catch (e) { return true; } };
  const handles = new Map();    // id -> handle
  const persistFns = new Map(); // persistent handler id -> fn
  let hseq = 0, nextDue = Infinity, dirty = true, firing = false;
  let tideCache = null, tideCacheAt = -1;

  const T = {
    now: START_MINUTE, paused: false, rate: 1, weatherSeed: 1,
    get hour() { return (((T.now % DAY) + DAY) % DAY) / 60; },
    get minuteOfDay() { return ((T.now % DAY) + DAY) % DAY; },
    get day() { return Math.floor(T.now / DAY) + 1; },
    get weekday() { return weekdayOfDays(EPOCH_DAYS + Math.floor(T.now / DAY)); },
    get weekdayName() { return WEEKDAYS[T.weekday]; },
    get isWeekend() { const w = T.weekday; return w === 0 || w === 6; },
    get date() { return dateOfDay(T.day); },
    get dayMinutes() { return 48; }, // stage 1: fixed 48-minute day as in GTA V (part of the game, not a player setting)
    set dayMinutes(v) { if (sys.settingsStore) sys.settingsStore.set('dayMinutes', v); else if (host.settings) host.settings.dayMinutes = v; },
    // game minutes per real second
    get scale() { return DAY / (T.dayMinutes * 60); },
    get moon() { return moonAt(T.now); },
    get tide() { const k = Math.floor(T.now); if (k !== tideCacheAt) { tideCache = tideAt(T.now); tideCacheAt = k; } return tideCache; },
    get sun() { const s = sunAt(T.day), h = T.hour; return { ...s, daylight: h >= s.rise && h < s.set }; },
    clockText: (opts = {}) => clockText(T.hour, { h24: opts.h24 ?? !!host.settings?.clock24h, seconds: opts.seconds }),
    WEEKDAYS, MONTHS, DAY,
    dateOfDay, clockTextOf: clockText,
  };
  T.isBetween = (h0, h1, hour = T.hour) => (h0 <= h1 ? hour >= h0 && hour < h1 : hour >= h0 || hour < h1);
  // real seconds -> game minutes at the current day length, and back
  T.toGameMinutes = (realSeconds) => realSeconds * T.scale;
  T.toRealSeconds = (gameMinutes) => gameMinutes / T.scale;

  // ---------------------------------------------------------------- scheduler
  function nextHourOccurrence(hour, days, after) {
    const m = hour * 60;
    let d = Math.floor(after / DAY);
    for (let i = 0; i < 9; i++, d++) {
      const t = d * DAY + m;
      if (t <= after + 1e-9) continue;
      if (days && !days.includes(weekdayOfDays(EPOCH_DAYS + d))) continue;
      return t;
    }
    return Infinity;
  }
  function plan(h, after) {
    if (h.type === 'at') h.next = h.fired ? Infinity : h.due;
    else if (h.type === 'every') {
      if (h.phase === null) h.next = (h.last ?? h.base) + h.interval;
      else h.next = Math.floor((after - h.phase) / h.interval + 1 + 1e-9) * h.interval + h.phase;
      if (h.next <= after + 1e-9) h.next = after + h.interval;
      if (h.days) { let guard = 0; while (!h.days.includes(weekdayOfDays(EPOCH_DAYS + Math.floor(h.next / DAY))) && guard++ < 20000) h.next += h.interval; }
    } else if (h.type === 'hour') h.next = nextHourOccurrence(h.hour, h.days, after);
    dirty = true;
  }
  function add(h) {
    if (h.id && handles.has(h.id)) handles.delete(h.id);
    h.id = h.id || `h${++hseq}`;
    handles.set(h.id, h);
    plan(h, T.now);
    return h;
  }
  const mk = (type, fn, opts = {}, extra = {}) => ({
    type, fn, id: opts.id || null, days: Array.isArray(opts.days) && opts.days.length ? opts.days.slice() : null,
    catchUp: opts.catchUp || (type === 'every' ? 'last' : 'all'), persist: !!opts.persist, handler: opts.handler || null, data: opts.data, next: Infinity, ...extra,
  });
  T.at = (abs, fn, opts) => add(mk('at', fn, opts, { due: Number(abs) }));
  T.in = (minutes, fn, opts) => add(mk('at', fn, opts, { due: T.now + Math.max(0, Number(minutes) || 0) }));
  T.every = (minutes, fn, opts = {}) => add(mk('every', fn, opts, { interval: Math.max(0.01, Number(minutes) || 1), phase: Number.isFinite(opts.phase) ? opts.phase : null, base: T.now, last: null }));
  T.onHour = (hour, fn, opts) => add(mk('hour', fn, opts, { hour: (((Number(hour) || 0) % 24) + 24) % 24 }));
  T.cancel = (h) => { const id = typeof h === 'string' ? h : h?.id; if (id && handles.delete(id)) dirty = true; };
  T.handler = (id, fn) => { persistFns.set(id, fn); };
  T.scheduled = () => [...handles.values()].map((h) => ({ id: h.id, type: h.type, next: h.next }));

  function recomputeDue() {
    nextDue = Infinity;
    for (const h of handles.values()) if (h.next < nextDue) nextDue = h.next;
    dirty = false;
  }
  function fire(h, catchUp, target) {
    const due = h.next;
    let run = true;
    if (h.type === 'at') { h.fired = true; if (catchUp && h.catchUp === 'none') run = false; }
    else {
      if (h.type === 'every') h.last = due;
      const before = h.next;
      plan(h, due);
      if (!(h.next > before)) h.next = before + (h.interval || DAY); // never stall
      if (catchUp && (h.catchUp === 'none' || (h.catchUp === 'last' && h.next <= target + 1e-9))) run = false;
    }
    if (h.type === 'at') handles.delete(h.id);
    dirty = true;
    if (!run) return;
    const fn = h.fn || (h.persist ? persistFns.get(h.handler || h.id) : null);
    if (typeof fn !== 'function') return;
    const dayIdx = Math.floor(due / DAY);
    try { fn({ now: due, day: dayIdx + 1, hour: (due - dayIdx * DAY) / 60, weekday: weekdayOfDays(EPOCH_DAYS + dayIdx), catchUp, due, data: h.data, id: h.id }); }
    catch (e) { console.error(`[time] scheduled handler '${h.id}' threw`, e); }
  }

  // Move the clock to `target`, firing everything that falls due on the way, in time order.
  function advanceTo(target, catchUp) {
    if (!(target > T.now)) return;
    if (firing) { T.now = target; return; }   // a handler asked for a skip: just move (its own events are already handled)
    firing = true;
    try {
      let guard = 0;
      for (;;) {
        if (dirty) recomputeDue();
        // built-in boundaries
        const nextMinute = Math.floor(T.now + 1e-9) + 1;
        const nextHour = (Math.floor(T.now / 60 + 1e-9) + 1) * 60;
        const boundary = catchUp ? nextHour : nextMinute;
        const stop = Math.min(target, nextDue, boundary);
        T.now = stop;
        if (nextDue <= stop + 1e-9) {
          // fire every handle due at this instant, in registration order
          const due = [];
          for (const h of handles.values()) if (h.next <= stop + 1e-9) due.push(h);
          for (const h of due) if (handles.has(h.id) && h.next <= stop + 1e-9) fire(h, catchUp, target);
        }
        if (Math.abs(stop - boundary) < 1e-9) {
          if (!catchUp) emit('minute', { now: stop });
          if (Math.abs(stop - nextHour) < 1e-9) {
            const dayIdx = Math.floor(stop / DAY + 1e-9), hour = Math.round((stop - dayIdx * DAY) / 60) % 24;
            emit('hour', { hour, day: dayIdx + 1, now: stop, catchUp });
            if (hour === 0) { const d = dateOfDay(dayIdx + 1); emit('newDay', { day: dayIdx + 1, weekday: d.weekday, date: d, now: stop, catchUp }); }
          }
        }
        if (stop >= target - 1e-9) break;
        if (++guard > 5e6) { console.error('[time] advance guard tripped'); T.now = target; break; }
      }
      T.now = target;
    } finally { firing = false; }
  }

  // real seconds from the frame loop
  T.update = (realDt) => {
    if (T.paused || !(realDt > 0)) return;
    advanceTo(T.now + realDt * T.scale * (T.rate > 0 ? T.rate : 1), false);
  };

  // ---------------------------------------------------------------- skips
  T.skip = (minutes, opts = {}) => {
    minutes = Number(minutes);
    if (!(minutes > 0)) return { from: T.now, to: T.now, minutes: 0 };
    const from = T.now, to = from + minutes, reason = opts.reason || 'skip';
    emit('timeSkipStart', { from, to, minutes, reason });
    advanceTo(to, true);
    try { sys.catchUp?.(minutes, { from, to, reason }); } catch (e) { console.error('[time] catch-up failed', e); }
    if (!opts.silent) emit('timeSkip', { from, to, minutes, reason });
    return { from, to, minutes };
  };
  T.minutesUntil = (hour, { nextDay = false } = {}) => {
    const m = (((hour % 24) + 24) % 24) * 60, cur = T.minuteOfDay;
    let d = m - cur;
    if (d <= 1e-9 || nextDay && d < DAY && Math.floor((T.now + d) / DAY) === Math.floor(T.now / DAY)) d += DAY;
    return d;
  };
  T.skipTo = (hour, opts = {}) => T.skip(T.minutesUntil(hour, opts), opts);

  // Hard set without catch-up (staging, debug, loading a save). Re-plans every schedule from the new time.
  T.set = ({ day, hour, now } = {}) => {
    let t = T.now;
    if (Number.isFinite(now)) t = now;
    else { const d = Number.isFinite(day) ? Math.max(1, Math.floor(day)) : T.day; const h = Number.isFinite(hour) ? (((hour % 24) + 24) % 24) : T.hour; t = (d - 1) * DAY + h * 60; }
    T.now = t;
    for (const h of handles.values()) { if (h.type === 'every') { h.base = t; h.last = null; } if (h.type !== 'at') plan(h, t); }
    dirty = true;
    return T.now;
  };
  // Writing game.timeOfDay lands here: same day, new clock time.
  T.stageHour = (hour) => { if (Number.isFinite(hour) && Math.abs(hour - T.hour) > 1e-7) T.set({ hour }); };

  // ---------------------------------------------------------------- save slice
  T.newGame = (seed) => {
    for (const h of [...handles.values()]) if (h.type === 'at' && h.persist) handles.delete(h.id);
    T.paused = false; T.rate = 1;
    T.weatherSeed = (seed ?? hash32('weather', sys.realNow(), Math.floor(Math.random() * 1e9))) >>> 0 || 1;
    T.set({ now: START_MINUTE });
  };
  T.toSave = () => ({
    now: T.now, weatherSeed: T.weatherSeed,
    timers: [...handles.values()].filter((h) => h.type === 'at' && h.persist && !h.fired).map((h) => ({ id: h.id, due: h.due, data: h.data ?? null, catchUp: h.catchUp, handler: h.handler })),
  });
  T.fromSave = (d) => {
    for (const h of [...handles.values()]) if (h.type === 'at' && h.persist) handles.delete(h.id);
    T.paused = false; T.rate = 1;
    T.weatherSeed = (Number(d.weatherSeed) >>> 0) || 1;
    T.set({ now: Number.isFinite(d.now) ? d.now : START_MINUTE });
    for (const t of d.timers || []) add(mk('at', null, { id: t.id, persist: true, handler: t.handler || null, data: t.data ?? undefined, catchUp: t.catchUp }, { due: t.due }));
  };
  return T;
}

// PORT SOLANA UI: one guarded doorway to every other track's API. UI code never reaches into game.<system> directly
// for these; it asks here and always gets a plain object back, with `available: false` when the system is missing
// (so screens can show an honest "not available" state instead of a fake).
import { num, clamp, fmtClock, DAY_NAMES } from './dom.js';

export function createServices(game, settings) {
  const S = (k, d) => (settings ? settings.get(k) : d);
  const tryGet = (fn, d = null) => { try { const v = fn(); return v === undefined ? d : v; } catch (e) { return d; } };
  const svc = {
    // ---- player ----
    player() {
      const p = game.player || {}, st = p.state || {};
      const needs = tryGet(() => game.needs?.state), fx = tryGet(() => game.needs?.effects);
      return {
        hp: clamp(num(p.health, 100), 0, 100), armor: clamp(num(p.armor, 0), 0, 100),
        stamina: p.stamina == null ? null : clamp(num(p.stamina, 100), 0, 100),
        breath: p.breath == null ? null : clamp(num(p.breath, 100), 0, 100),
        swimming: !!p.swimming, underwater: !!(p.swimming && num(p.breath, 100) < 100) || !!p.underwater,
        dead: !!game.ui?.dead || num(p.health, 100) <= 0,
        inVehicle: !!(st.inVehicle && st.vehicle), speed: num(st.speed), sprint: !!st.sprint,
        needs: needs || null, effects: fx || null, x: num(p.position?.x), z: num(p.position?.z), heading: num(p.heading),
      };
    },
    // ---- money: cash on Nico vs. safe money in the bank ----
    money() {
      const w = game.wallet, b = game.bank;
      const cash = num(tryGet(() => w?.cash), num(game.player?.money));
      const hasBank = !!b && tryGet(() => typeof b.balance === 'number', false);
      return { cash, hot: num(tryGet(() => w?.hot), 0), bank: hasBank ? num(b.balance) : null, savings: hasBank && typeof b.savings === 'number' ? b.savings : null, hasBank, hasWallet: !!w };
    },
    // ---- clock and calendar ----
    clock() {
      const T = game.time, hour = num(tryGet(() => T?.hour), num(game.timeOfDay, 9));
      const h24 = !!S('clock24h', false);
      const date = tryGet(() => T?.date);
      const weekday = tryGet(() => T?.weekday);
      return {
        hour, text: fmtClock(hour, !h24), h24, day: tryGet(() => T?.day), weekday, weekdayName: tryGet(() => T?.weekdayName) || (weekday != null ? DAY_NAMES[weekday] : null),
        dateText: date?.text || null, dateLong: date?.long || null, hasCalendar: !!date,
        night: hour < 6 || hour >= 19.5, dusk: (hour >= 17.5 && hour < 19.5) || (hour >= 6 && hour < 7.5),
        moon: tryGet(() => T?.moon), tide: tryGet(() => T?.tide), sun: tryGet(() => T?.sun),
      };
    },
    // ---- weather (environment track) ----
    weather() {
      const W = game.weather || game.env?.weather;
      if (!W) return { available: false, kind: 'clear', label: 'Clear', tempF: null };
      const kind = String(tryGet(() => W.kind ?? W.current?.kind ?? W.state?.kind ?? W.current ?? W.state, 'clear') || 'clear');
      const tempC = tryGet(() => W.tempC ?? W.current?.tempC ?? W.state?.tempC), tempF0 = tryGet(() => W.tempF ?? W.current?.tempF ?? W.state?.tempF);
      const tempF = isFinite(tempF0) ? tempF0 : isFinite(tempC) ? tempC * 9 / 5 + 32 : null;
      const LABEL = { clear: 'Clear', sunny: 'Sunny', cloudy: 'Cloudy', partly: 'Partly cloudy', overcast: 'Overcast', rain: 'Rain', drizzle: 'Light rain', storm: 'Thunderstorm', thunderstorm: 'Thunderstorm', fog: 'Fog', haze: 'Haze', windy: 'Windy', hurricane: 'Hurricane' };
      return { available: true, kind, label: tryGet(() => W.label ?? W.current?.label) || LABEL[kind] || kind.replace(/^./, (c) => c.toUpperCase()), tempF, wind: tryGet(() => W.wind ?? W.current?.wind), humidity: tryGet(() => W.humidity ?? W.current?.humidity), forecast: tryGet(() => W.forecast?.() ?? W.forecast, null) };
    },
    weatherIcon(kind, night) { return /storm|thunder|hurricane/.test(kind) ? 'storm' : /rain|drizzle|shower/.test(kind) ? 'rain' : /fog|haze|mist/.test(kind) ? 'fog' : /wind/.test(kind) ? 'wind' : /cloud|overcast|partly/.test(kind) ? 'cloud' : night ? 'moon' : 'sun'; },
    temp(tempF) { if (tempF == null || !isFinite(tempF)) return null; return S('units', 'imperial') === 'metric' ? Math.round((tempF - 32) * 5 / 9) + '°C' : Math.round(tempF) + '°F'; },
    // ---- place names ----
    place(x, z) {
      const c = game.city;
      return { district: tryGet(() => c?.districtAt?.(x, z)) || null, street: tryGet(() => c?.streetNameAt?.(x, z)) || null, water: !!tryGet(() => c?.isWater?.(x, z), false), zone: tryGet(() => c?.zoneAt?.(x, z)) || null };
    },
    // ---- wanted (police track): the UI only reads it ----
    wanted() {
      const W = game.wanted, lvl = clamp(Math.round(num(W?.level, num(game.player?.wanted))), 0, 6);
      const c = W?.searchCenter, r = num(W?.searchRadius, 0);
      return { level: lvl, evading: lvl > 0 && !!W?.evading, search: c && r > 0 && isFinite(c.x) ? { x: c.x, z: isFinite(c.z) ? c.z : num(c.y), r } : null, units: tryGet(() => W?.unitsSearching ?? game.police?.units?.length, null) };
    },
    // ---- the vehicle being driven ----
    vehicle() {
      const st = game.player?.state, v = st?.inVehicle ? st.vehicle : null;
      if (!v) return { active: false };
      const kmh = num(v.speedKmh), d = v.damage || v.dmg || {}, m = v.model || v.spec || {};
      const fuel = tryGet(() => (v.fuel != null ? (v.fuelCapacity ? v.fuel / v.fuelCapacity : v.fuel > 1 ? v.fuel / 100 : v.fuel) : v.upkeep?.fuel));
      const health = v.health != null ? clamp(v.health > 1 ? v.health / (v.maxHealth || 100) : v.health, 0, 1) : null;
      const warn = [];
      const flag = (cond, id, label, level = 'warn') => { if (cond) warn.push({ id, label, level }); };
      flag(fuel != null && fuel < 0.12, 'fuel', 'Low fuel', fuel != null && fuel < 0.04 ? 'crit' : 'warn');
      flag(num(d.engine, 1) < 0.5 || num(v.engineHealth, 1) < 0.5 || (health != null && health < 0.35), 'engine', 'Engine damage', (health != null && health < 0.15) ? 'crit' : 'warn');
      flag(!!(d.overheat || v.overheating || num(v.engineTemp, 0) > 0.85), 'temp', 'Overheating', 'crit');
      flag(!!(d.tireFlat || v.flatTires?.length || (Array.isArray(d.tires) && d.tires.some((t) => t <= 0))), 'tire', 'Flat tire');
      flag(!!(d.steering || num(d.steerPull, 0) !== 0), 'steering', 'Steering damaged');
      flag(!!(d.fuelLeak || v.fuelLeak), 'leak', 'Fuel leak', 'crit');
      flag(!!(v.onFire || d.fire), 'fire', 'Fire', 'crit');
      flag(num(v.submerged, 0) > 0.3, 'water', 'Taking on water', 'crit');
      const kind = v.isBoat || v.kind === 'boat' || m.class === 'boat' ? 'boat' : v.isAircraft || v.kind === 'aircraft' ? 'air' : 'car';
      return { active: true, v, kmh, absKmh: Math.abs(kmh), gear: v.gear, rpm: v.rpm, maxRpm: m.maxRpm || v.maxRpm, fuel: fuel == null ? null : clamp(fuel, 0, 1), health, warnings: warn,
        name: String(v.displayName || m.name || v.name || v.spec?.label || 'Vehicle').replace(/\s*#\d+$/, ''), brand: m.brand || null, kind, electric: m.engine === 'electric', owned: !!tryGet(() => game.garage?.owns?.(v), false),
        lights: tryGet(() => v.headlights ?? v.lightsOn), siren: !!v.sirenOn, radio: tryGet(() => game.audio?.radio?.current ?? game.radio?.station) };
    },
    // ---- GPS (nav-gps track; the legacy A* in gps.js is the fallback inside the map module) ----
    gps() { const N = game.nav || game.gps; return { available: !!N, nav: N || null }; },
    // ---- systems other screens surface ----
    save() { const s = game.save; return { available: !!s && typeof s.save === 'function', api: s || null, meta: tryGet(() => s?.meta), busy: !!tryGet(() => s?.busy, false) }; },
    net() { const n = game.net; return { available: !!n, api: n || null, connected: !!tryGet(() => n?.connected ?? n?.session, false), session: tryGet(() => n?.session), players: tryGet(() => n?.players && [...(n.players.values ? n.players.values() : n.players)], []) || [], friends: tryGet(() => n?.friends?.list?.() ?? n?.friends, []) || [], me: tryGet(() => n?.me) }; },
    story() { const s = game.story; return { available: !!s, api: s || null, chapters: tryGet(() => s?.chapters?.() ?? s?.chapters, []) || [], missions: tryGet(() => s?.missions?.() ?? s?.missions?.list?.() ?? s?.list?.(), []) || [], active: tryGet(() => s?.active ?? s?.current), objective: tryGet(() => s?.objective) }; },
    jobs() { const j = game.jobs; return { available: !!j, api: j || null, list: tryGet(() => j?.list?.() ?? j?.available?.() ?? j?.jobs, []) || [], active: tryGet(() => j?.active ?? j?.current) }; },
    wardrobe() { const w = game.wardrobe; return { available: !!w && typeof w.openUI === 'function', api: w || null, outfitName: tryGet(() => w?.currentOutfit?.name ?? w?.outfitName ?? w?.current?.name), outfits: tryGet(() => w?.outfits?.() ?? w?.saved ?? w?.outfits, []) || [] }; },
    garage() { const g = game.garage; return { available: !!g, api: g || null, records: tryGet(() => g?.records, []) || [] }; },
    property() { const p = game.property; return { available: !!p, api: p || null, owned: tryGet(() => p?.owned?.(), []) || [], home: tryGet(() => p?.home) }; },
    stocks() { const s = game.stocks; return { available: !!s, api: s || null }; },
    news() { const n = game.news; return { available: !!n, api: n || null, feed: (o) => tryGet(() => n?.feed?.(o), []) || [] }; },
    stats() { const s = game.stats; return { available: !!s, api: s || null, all: tryGet(() => s?.all?.(), {}) || {} }; },
    brands() { const d = game.design; return { available: !!d, api: d || null, list: tryGet(() => (Array.isArray(d?.brands) ? d.brands : d?.brands?.list?.() ?? Object.values(d?.brands || {})), []) || [] }; },
    audio(name, opts) { try { const A = game.audio; if (A?.ui) A.ui(name, opts); else A?.play?.('ui_' + name, { volume: 0.5, ...(opts || {}) }); } catch (e) { /* */ } },
    units: () => S('units', 'imperial'),
    tryGet,
  };
  return svc;
}

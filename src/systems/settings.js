// Core systems: the settings store. A schema on top of the v1 `game.settings` object: validation, persistence,
// change events, and the difficulty / assist options. Values always live in `game.settings[key]`, so v1 code that
// reads or writes `game.settings.x` directly keeps working (direct writes are noticed within a second).
import { clamp } from './util.js';

export const DIFFICULTY = {
  relaxed: { id: 'relaxed', label: 'Relaxed', damageTaken: 0.6, policeAggression: 0.7, cashLossOnDeath: 0.1, hospitalBill: 0.5, fineMul: 0.6, priceMul: 0.9, payMul: 1.2, needsRate: 0.6, raidRate: 0.5 },
  standard: { id: 'standard', label: 'Standard', damageTaken: 1, policeAggression: 1, cashLossOnDeath: 0.5, hospitalBill: 1, fineMul: 1, priceMul: 1, payMul: 1, needsRate: 1, raidRate: 1 },
  hard: { id: 'hard', label: 'Hard', damageTaken: 1.5, policeAggression: 1.35, cashLossOnDeath: 1, hospitalBill: 1.5, fineMul: 1.5, priceMul: 1.1, payMul: 0.85, needsRate: 1.3, raidRate: 1.5 },
};

const BUILT_IN = [
  ['dayMinutes', { default: 144, type: 'number', min: 24, max: 1440, step: 1, label: 'Day length (real minutes)', group: 'Gameplay', description: 'How long a full day and night lasts. 144 minutes means one game minute every 6 seconds.' }],
  ['autosaveMinutes', { default: 3, type: 'number', min: 1, max: 30, step: 1, label: 'Autosave every (minutes)', group: 'Gameplay' }],
  ['difficulty', { default: 'standard', type: 'enum', options: ['relaxed', 'standard', 'hard'], label: 'Difficulty', group: 'Gameplay', scope: 'slot', description: 'Damage, police pressure, fines, wages and how much carried cash you lose when you die.' }],
  ['needsEnabled', { default: true, type: 'bool', label: 'Food, drink and body effects', group: 'Gameplay', scope: 'slot' }],
  ['tirednessEnabled', { default: true, type: 'bool', label: 'Tiredness', group: 'Gameplay', scope: 'slot', description: 'Staying up too long makes Nico tired. Sleep at home or in a hotel.' }],
  ['bodyChangeEnabled', { default: true, type: 'bool', label: 'Body changes over time', group: 'Gameplay', scope: 'slot' }],
  ['bodyChangeRate', { default: 3, type: 'number', min: 1, max: 10, step: 0.5, label: 'Body change speed', group: 'Gameplay', scope: 'slot', description: '1 is real-life speed. Higher values make overeating and exercise show sooner.' }],
  ['cashLossOnDeath', { default: -1, type: 'number', min: -1, max: 1, step: 0.05, label: 'Carried cash lost on death', group: 'Gameplay', scope: 'slot', description: '-1 follows the difficulty. 0 keeps everything, 1 loses all carried cash.' }],
  ['aimAssist', { default: 'light', type: 'enum', options: ['off', 'light', 'strong'], label: 'Aim assist', group: 'Assists' }],
  ['driveAssist', { default: 'light', type: 'enum', options: ['off', 'light', 'strong'], label: 'Driving assist (traction and braking help)', group: 'Assists' }],
  ['swimAssist', { default: true, type: 'bool', label: 'Auto-surface when out of breath', group: 'Assists' }],
  ['gpsVoice', { default: true, type: 'bool', label: 'Spoken GPS directions', group: 'Assists' }],
  ['clock24h', { default: false, type: 'bool', label: '24-hour clock', group: 'Interface' }],
  ['units', { default: 'imperial', type: 'enum', options: ['imperial', 'metric'], label: 'Units', group: 'Interface' }],
  ['subtitles', { default: true, type: 'bool', label: 'Subtitles', group: 'Interface' }],
  ['showNeedsHud', { default: true, type: 'bool', label: 'Show body status icons', group: 'Interface' }],
];

export function createSettingsStore(sys) {
  const { host } = sys;
  const defs = new Map();
  const listeners = new Map(); // key | '*' -> [fn]
  const known = {};            // last value we saw per key (to notice direct writes to game.settings)
  let dirtyT = 0, pollT = 0, loadedGlobal = {};
  host.settings = host.settings || {};
  const values = host.settings;

  function coerce(def, v) {
    if (def.type === 'number') { v = Number(v); if (!Number.isFinite(v)) return def.default; if (def.min !== undefined) v = Math.max(def.min, v); if (def.max !== undefined) v = Math.min(def.max, v); return v; }
    if (def.type === 'bool') return v === true || v === 'true' || v === 1;
    if (def.type === 'enum') return def.options.includes(v) ? v : def.default;
    if (def.type === 'string') return String(v ?? def.default);
    return v;
  }
  function notify(key, value, previous) {
    for (const f of [...(listeners.get(key) || []), ...(listeners.get('*') || [])]) { try { f(value, key, previous); } catch (e) { console.error('[settings] listener threw', e); } }
    try { host.emit?.('settingChanged', { key, value, previous }); } catch (e) { /* */ }
    if (key === 'dayMinutes') { try { host.emit?.('dayLengthChanged', { dayMinutes: value }); } catch (e) { /* */ } }
  }

  const S = {
    define(key, def) {
      const d = { type: typeof def.default === 'boolean' ? 'bool' : typeof def.default === 'number' ? 'number' : 'string', scope: 'global', group: 'Other', label: key, ...def };
      defs.set(key, d);
      // precedence: a value saved earlier > a value some module already put in game.settings > the default
      let v = key in loadedGlobal && d.scope === 'global' ? loadedGlobal[key] : (values[key] !== undefined ? values[key] : d.default);
      v = coerce(d, v);
      values[key] = v; known[key] = v;
      try { d.apply?.(v, host); } catch (e) { console.error(`[settings] apply '${key}' failed`, e); }
      return v;
    },
    get(key) { const d = defs.get(key); return d ? (values[key] !== undefined ? values[key] : d.default) : values[key]; },
    set(key, value) {
      const d = defs.get(key);
      const v = d ? coerce(d, value) : value;
      const prev = values[key];
      values[key] = v; known[key] = v;
      if (prev !== v) {
        try { d?.apply?.(v, host); } catch (e) { console.error(`[settings] apply '${key}' failed`, e); }
        notify(key, v, prev);
        dirtyT = 0.4;
      }
      return v;
    },
    reset(key) { if (key) return S.set(key, defs.get(key)?.default); for (const [k, d] of defs) S.set(k, d.default); return undefined; },
    all() { const o = {}; for (const k of defs.keys()) o[k] = S.get(k); return o; },
    schema() { return [...defs.entries()].map(([key, d]) => ({ key, ...d, value: S.get(key) })); },
    onChange(key, fn) { if (!listeners.has(key)) listeners.set(key, []); listeners.get(key).push(fn); return () => { const a = listeners.get(key); const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; },
    has: (key) => defs.has(key),
  };

  // ---- persistence of global-scope keys (slot-scope keys travel inside the save)
  const globalBlob = () => { const o = {}; for (const [k, d] of defs) if (d.scope === 'global') o[k] = values[k]; return o; };
  S.persist = async () => {
    try { const st = sys.storage || (sys.storage = await sys.openStorage()); await st.set('settings', JSON.stringify(globalBlob())); return true; }
    catch (e) { console.warn('[settings] could not persist', e?.message || e); return false; }
  };
  S.loadGlobal = async () => {
    try {
      const st = sys.storage || (sys.storage = await sys.openStorage());
      loadedGlobal = JSON.parse((await st.get('settings')) || '{}') || {};
    } catch (e) { loadedGlobal = {}; }
    for (const [k, d] of defs) if (d.scope === 'global' && k in loadedGlobal) { const v = coerce(d, loadedGlobal[k]); if (values[k] !== v) S.set(k, v); }
    dirtyT = 0;
    return loadedGlobal;
  };
  S.toSave = () => { const o = {}; for (const [k, d] of defs) if (d.scope === 'slot') o[k] = values[k]; return o; };
  S.fromSave = (data) => { for (const [k, d] of defs) if (d.scope === 'slot') S.set(k, data && k in data ? data[k] : d.default); };

  // real seconds
  S.update = (realDt) => {
    pollT -= realDt;
    if (pollT <= 0) {
      pollT = 1;
      for (const [k, d] of defs) {
        if (values[k] !== known[k]) { // someone wrote game.settings[k] directly
          const prev = known[k], v = coerce(d, values[k]);
          values[k] = v; known[k] = v;
          if (v !== prev) { try { d.apply?.(v, host); } catch (e) { /* */ } notify(k, v, prev); dirtyT = 0.4; }
        }
      }
    }
    if (dirtyT > 0) { dirtyT -= realDt; if (dirtyT <= 0) S.persist(); }
  };

  for (const [k, d] of BUILT_IN) S.define(k, d);

  // ---- difficulty: one object of multipliers that other tracks read
  const diff = {
    get id() { return DIFFICULTY[values.difficulty] ? values.difficulty : 'standard'; },
    get preset() { return DIFFICULTY[diff.id]; },
    get label() { return diff.preset.label; },
    get damageTaken() { return diff.preset.damageTaken; },
    get policeAggression() { return diff.preset.policeAggression; },
    get cashLossOnDeath() { const o = Number(values.cashLossOnDeath); return o >= 0 ? clamp(o) : diff.preset.cashLossOnDeath; },
    get hospitalBill() { return diff.preset.hospitalBill; },
    get fineMul() { return diff.preset.fineMul; },
    get priceMul() { return diff.preset.priceMul; },
    get payMul() { return diff.preset.payMul; },
    get needsRate() { return diff.preset.needsRate; },
    get raidRate() { return diff.preset.raidRate; },
    presets: DIFFICULTY,
  };
  S.difficulty = diff;
  return S;
}

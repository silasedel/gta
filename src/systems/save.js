// Core systems: the save system. Versioned, checksummed, migratable slots with a last-good backup per record,
// a registry so every track persists its own slice, autosave, an exit snapshot, export/import, Continue and New Game.
// Engine-free: runs in Node with a memory storage (see tests/save.test.mjs).
import { checksum, stableStringify, clone } from './util.js';

export const SAVE_FORMAT = 'port-solana-save';
export const SAVE_FORMAT_VERSION = 1;
export const MAX_SLOTS = 8;
const KINDS = ['manual', 'auto', 'exit'];

// Envelope-level migrations: FORMAT_MIGRATIONS[n] upgrades an envelope body from format version n to n + 1.
// (Slice-level migrations belong to the slice's owner: register({ version, migrate }).)
const FORMAT_MIGRATIONS = {};

export function encodeRecord(body) {
  const payload = stableStringify(body);
  return JSON.stringify({
    format: SAVE_FORMAT,
    v: SAVE_FORMAT_VERSION,
    checksum: checksum(payload),
    payload,
  });
}
// Returns the body, or throws an Error whose message says why the record cannot be trusted.
export function decodeRecord(text) {
  if (typeof text !== 'string' || !text) throw new Error('empty record');
  let env;
  try {
    env = JSON.parse(text);
  } catch (e) {
    throw new Error('record is not valid JSON');
  }
  if (!env || env.format !== SAVE_FORMAT) throw new Error('not a Southline save');
  if (typeof env.payload !== 'string' || typeof env.checksum !== 'string')
    throw new Error('record is incomplete');
  if (checksum(env.payload) !== env.checksum) throw new Error('checksum mismatch');
  if (!(env.v <= SAVE_FORMAT_VERSION))
    throw new Error(`save format ${env.v} is newer than this build (${SAVE_FORMAT_VERSION})`);
  let body;
  try {
    body = JSON.parse(env.payload);
  } catch (e) {
    throw new Error('payload is not valid JSON');
  }
  for (let v = env.v; v < SAVE_FORMAT_VERSION; v++) {
    const m = FORMAT_MIGRATIONS[v];
    if (!m) throw new Error(`no migration from save format ${v}`);
    body = m(body);
  }
  if (!body || typeof body !== 'object' || typeof body.slices !== 'object' || !body.slices)
    throw new Error('record has no slices');
  return body;
}

export function createSave(sys) {
  const { host } = sys;
  const emit = (n, d) => {
    try {
      return host.emit?.(n, d);
    } catch (e) {
      return true;
    }
  };
  const reg = new Map(); // key -> { key, version, save, load, migrate, order, seq }
  let seq = 0;
  let pending = {}; // slices of the game in memory as they were loaded (also holds slices nobody claimed)
  let chain = Promise.resolve(); // serializes storage work
  const inhibitors = new Set();
  let autoT = 0,
    lastInfo = null;

  const S = {
    slot: null,
    loaded: false,
    isNewGame: false,
    playtime: 0,
    createdAt: 0,
    busy: false,
    manualBoot: false,
    lastSavedAt: 0,
    lastSaveKind: null,
    lastError: null,
    enabled: true,
    get autosaveMinutes() {
      return Math.max(0.5, Number(host.settings?.autosaveMinutes) || 3);
    },
    get storageKind() {
      return sys.storage?.kind || 'unopened';
    },
    get meta() {
      return buildMeta();
    },
    get registered() {
      return [...reg.keys()];
    },
  };

  const keyOf = (slot, kind) => `save.${slot}.${kind}`;
  const sorted = () => [...reg.values()].sort((a, b) => a.order - b.order || a.seq - b.seq);
  const queue = (fn) => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  };
  const storage = async () => sys.storage || (sys.storage = await sys.openStorage());

  function buildMeta() {
    let m = {};
    try {
      m = sys.metaProvider?.() || {};
    } catch (e) {
      console.error('[save] meta provider failed', e);
    }
    return { ...m, playtime: Math.round(S.playtime), version: sys.appVersion || '' };
  }

  // ---------------------------------------------------------------- registry
  S.register = (key, def) => {
    if (typeof key !== 'string' || !key)
      throw new Error('save.register: key must be a non-empty string');
    if (!def || typeof def.save !== 'function' || typeof def.load !== 'function')
      throw new Error(`save.register('${key}'): save() and load() are required`);
    const r = {
      key,
      version: Number.isInteger(def.version) ? def.version : 1,
      save: def.save,
      load: def.load,
      migrate: def.migrate,
      order: def.order ?? 100,
      seq: seq++,
    };
    reg.set(key, r);
    if (S.loaded)
      applySlice(r, pending[key], lastInfo || { slot: S.slot, isNewGame: S.isNewGame, savedAt: 0 });
    return r;
  };
  S.unregister = (key) => reg.delete(key);

  function applySlice(r, slice, info) {
    let data = null,
      fromVersion = r.version;
    if (slice && typeof slice === 'object' && 'data' in slice) {
      data = clone(slice.data);
      fromVersion = Number.isInteger(slice.v) ? slice.v : 1;
      if (fromVersion < r.version) {
        if (typeof r.migrate === 'function') {
          try {
            data = r.migrate(data, fromVersion);
          } catch (e) {
            console.error(
              `[save] migrate '${r.key}' v${fromVersion} -> v${r.version} failed; starting that slice fresh`,
              e,
            );
            data = null;
          }
        }
      }
    }
    try {
      r.load(data ?? null, { ...info, fromVersion, missing: !slice });
      return true;
    } catch (e) {
      console.error(`[save] load '${r.key}' failed; resetting that slice`, e);
      try {
        r.load(null, { ...info, fromVersion, missing: true, failed: true });
      } catch (e2) {
        console.error(`[save] reset '${r.key}' failed`, e2);
      }
      return false;
    }
  }

  function collect(kind) {
    const slices = { ...pending };
    for (const r of sorted()) {
      try {
        const data = r.save();
        if (data === undefined) continue;
        slices[r.key] = { v: r.version, data: JSON.parse(stableStringify(data)) };
      } catch (e) {
        console.error(`[save] save '${r.key}' failed; keeping its previous data`, e);
      }
    }
    pending = slices;
    return {
      slot: S.slot,
      kind,
      createdAt: S.createdAt,
      savedAt: sys.realNow(),
      playtime: Math.round(S.playtime * 1000) / 1000,
      build: sys.appVersion || '',
      meta: buildMeta(),
      slices,
    };
  }

  // ---------------------------------------------------------------- records
  async function readRecord(slot, kind) {
    // -> { body, recovered: bool, reason } | { body: null, corrupt: bool, reason }
    if (kind === 'exit') {
      const text = sys.syncLocal?.get(keyOf(slot, 'exit'));
      if (!text) return { body: null, corrupt: false };
      try {
        return { body: decodeRecord(text), recovered: false };
      } catch (e) {
        return { body: null, corrupt: true, reason: e.message };
      }
    }
    const st = await storage();
    const main = await st.get(keyOf(slot, kind));
    let reason = null;
    if (main) {
      try {
        return { body: decodeRecord(main), recovered: false };
      } catch (e) {
        reason = e.message;
      }
    }
    const bak = await st.get(keyOf(slot, kind) + '.bak');
    if (bak) {
      try {
        return { body: decodeRecord(bak), recovered: true, reason: reason || 'record missing' };
      } catch (e) {
        reason = (reason ? reason + '; ' : '') + 'backup: ' + e.message;
      }
    }
    return { body: null, corrupt: !!(main || bak), reason };
  }

  async function writeRecord(slot, kind, body) {
    const text = encodeRecord(body);
    if (kind === 'exit') {
      if (!sys.syncLocal?.set(keyOf(slot, 'exit'), text))
        throw new Error('exit snapshot did not fit in localStorage');
      return text.length;
    }
    const st = await storage();
    const k = keyOf(slot, kind);
    const prev = await st.get(k);
    const batch = { [k]: text };
    // The previous record becomes the last-good backup only if it is itself valid (never back up garbage).
    if (prev) {
      try {
        decodeRecord(prev);
        batch[k + '.bak'] = prev;
      } catch (e) {
        /* keep the older backup */
      }
    }
    await st.setMany(batch);
    const back = await st.get(k);
    if (back !== text) throw new Error('read-back after write did not match');
    const idxText = await st.get('save.index');
    let idx = {};
    try {
      idx = JSON.parse(idxText || '{}') || {};
    } catch (e) {
      idx = {};
    }
    idx.lastSlot = slot;
    idx.slots = idx.slots || {};
    idx.slots[slot] = { createdAt: body.createdAt, savedAt: body.savedAt };
    await st.set('save.index', JSON.stringify(idx));
    return text.length;
  }

  // newest trustworthy record of a slot
  async function newest(slot, kinds = KINDS) {
    let best = null;
    for (const kind of kinds) {
      const r = await readRecord(slot, kind);
      if (r.body && (!best || (r.body.savedAt || 0) > (best.body.savedAt || 0)))
        best = { ...r, kind };
    }
    return best;
  }

  // ---------------------------------------------------------------- save
  S.save = (opts = {}) =>
    queue(async () => {
      const kind = KINDS.includes(opts.kind) ? opts.kind : 'manual';
      if (!S.enabled) return { ok: false, reason: 'disabled' };
      if (!S.loaded || !S.slot) return { ok: false, reason: 'no_game' };
      S.busy = true;
      try {
        const body = collect(kind);
        if (opts.thumb) {
          try {
            const t = sys.thumbProvider?.();
            if (t) body.meta.thumb = t;
          } catch (e) {
            /* no thumbnail */
          }
        }
        if (opts.reason) body.meta.reason = opts.reason;
        const bytes = await writeRecord(S.slot, kind, body);
        S.lastSavedAt = body.savedAt;
        S.lastSaveKind = kind;
        S.lastError = null;
        autoT = 0;
        emit('saved', { slot: S.slot, kind, meta: body.meta, bytes });
        return { ok: true, slot: S.slot, kind, bytes, meta: body.meta };
      } catch (e) {
        S.lastError = e?.message || String(e);
        console.error('[save] save failed', e);
        emit('saveFailed', { slot: S.slot, reason: S.lastError });
        return { ok: false, reason: S.lastError };
      } finally {
        S.busy = false;
      }
    });

  // Synchronous exit snapshot (pagehide). Returns true if it was written.
  S.saveExitSync = () => {
    if (!S.enabled || !S.loaded || !S.slot || !sys.syncLocal?.ok) return false;
    try {
      const body = collect('exit');
      return !!sys.syncLocal.set(keyOf(S.slot, 'exit'), encodeRecord(body));
    } catch (e) {
      return false;
    }
  };

  // ---------------------------------------------------------------- load
  function applyBody(body, slot, kind, isNewGame) {
    pending = body ? clone(body.slices) : {};
    S.slot = slot;
    S.loaded = true;
    S.isNewGame = isNewGame;
    S.playtime = body ? Number(body.playtime) || 0 : 0;
    S.createdAt = body ? body.createdAt || sys.realNow() : sys.realNow();
    lastInfo = { slot, isNewGame, savedAt: body ? body.savedAt : 0, kind };
    let failed = 0;
    for (const r of sorted()) if (!applySlice(r, pending[r.key], lastInfo)) failed++;
    autoT = 0;
    return failed;
  }

  S.load = (slot, kind) =>
    queue(async () => {
      S.busy = true;
      try {
        const rec = kind ? { ...(await readRecord(slot, kind)), kind } : await newest(slot);
        if (!rec || !rec.body) return { ok: false, reason: rec?.reason || 'no_save' };
        if (rec.recovered) emit('saveRecovered', { slot, kind: rec.kind, reason: rec.reason });
        const failed = applyBody(rec.body, slot, rec.kind, false);
        try {
          const st = await storage();
          const idx = JSON.parse((await st.get('save.index')) || '{}') || {};
          idx.lastSlot = slot;
          await st.set('save.index', JSON.stringify(idx));
        } catch (e) {
          /* index is a hint only */
        }
        emit('loaded', {
          slot,
          kind: rec.kind,
          meta: rec.body.meta,
          isNewGame: false,
          recovered: !!rec.recovered,
          failedSlices: failed,
        });
        return { ok: true, slot, kind: rec.kind, meta: rec.body.meta, recovered: !!rec.recovered };
      } catch (e) {
        console.error('[save] load failed', e);
        return { ok: false, reason: e?.message || String(e) };
      } finally {
        S.busy = false;
      }
    });

  async function slotIds() {
    const st = await storage();
    const ids = new Set();
    for (const k of await st.keys('save.')) {
      const m = /^save\.([^.]+)\.(manual|auto)(\.bak)?$/.exec(k);
      if (m) ids.add(m[1]);
    }
    // exit snapshots live in sync localStorage
    for (let i = 1; i <= MAX_SLOTS; i++)
      if (sys.syncLocal?.get(keyOf('slot' + i, 'exit'))) ids.add('slot' + i);
    return [...ids].sort();
  }
  async function lastSlot() {
    try {
      const st = await storage();
      const idx = JSON.parse((await st.get('save.index')) || '{}') || {};
      if (idx.lastSlot) return idx.lastSlot;
    } catch (e) {
      /* */
    }
    return null;
  }

  S.list = () =>
    queue(async () => {
      const out = [];
      for (const slot of await slotIds()) {
        const records = {};
        let latest = null,
          corrupt = false;
        for (const kind of KINDS) {
          const r = await readRecord(slot, kind);
          if (r.body) {
            records[kind] = { ...r.body.meta, savedAt: r.body.savedAt, recovered: !!r.recovered };
            if (!latest || r.body.savedAt > latest.savedAt)
              latest = { ...r.body.meta, savedAt: r.body.savedAt, kind };
          } else if (r.corrupt) {
            records[kind] = null;
            corrupt = true;
          }
        }
        out.push({ slot, latest, records, corrupt: corrupt && !latest });
      }
      return out;
    });

  S.hasContinue = async () => {
    const ids = await queue(slotIds);
    for (const slot of ids) {
      const n = await queue(() => newest(slot));
      if (n?.body) return true;
    }
    return false;
  };

  // Continue the most recent game (or the given slot). Falls through slots until one loads.
  S.continue = async (opts = {}) => {
    const ids = await queue(slotIds);
    const order = [];
    if (opts.slot) order.push(opts.slot);
    else {
      const last = await queue(lastSlot);
      const stamps = [];
      for (const slot of ids) {
        const n = await queue(() => newest(slot));
        if (n?.body) stamps.push([slot, n.body.savedAt || 0]);
      }
      stamps.sort((a, b) => b[1] - a[1]);
      if (last && stamps.some((s) => s[0] === last)) order.push(last);
      for (const [slot] of stamps) if (!order.includes(slot)) order.push(slot);
    }
    let reason = 'no_save';
    for (const slot of order) {
      const r = await S.load(slot);
      if (r.ok) return r;
      reason = r.reason || reason;
    }
    return { ok: false, reason };
  };

  S.newGame = (opts = {}) =>
    queue(async () => {
      let slot = opts.slot;
      if (!slot) {
        const used = new Set(await slotIds());
        for (let i = 1; i <= MAX_SLOTS && !slot; i++) if (!used.has('slot' + i)) slot = 'slot' + i;
        if (!slot) return { ok: false, reason: 'no_free_slot' };
      }
      applyBody(null, slot, null, true);
      emit('newGame', { slot });
      emit('loaded', { slot, kind: null, meta: buildMeta(), isNewGame: true });
      return { ok: true, slot };
    });

  S.delete = (slot) =>
    queue(async () => {
      const st = await storage();
      const batch = {};
      for (const kind of ['manual', 'auto']) {
        batch[keyOf(slot, kind)] = null;
        batch[keyOf(slot, kind) + '.bak'] = null;
      }
      await st.setMany(batch);
      sys.syncLocal?.del(keyOf(slot, 'exit'));
      try {
        const idx = JSON.parse((await st.get('save.index')) || '{}') || {};
        if (idx.slots) delete idx.slots[slot];
        if (idx.lastSlot === slot) idx.lastSlot = null;
        await st.set('save.index', JSON.stringify(idx));
      } catch (e) {
        /* */
      }
      return { ok: true };
    });

  // ---------------------------------------------------------------- export / import
  S.exportFile = async (slot, opts = {}) => {
    let body;
    if ((!slot || slot === S.slot) && S.loaded) body = await queue(() => collect('manual'));
    else {
      const n = await queue(() => newest(slot));
      body = n?.body;
    }
    if (!body) return { ok: false, reason: 'no_save' };
    const text = encodeRecord(body);
    const day = body.meta?.day ? `_Day${body.meta.day}` : '';
    const filename = `PortSolana_${body.slot || slot || 'save'}${day}.pssave`;
    const out = { ok: true, filename, text };
    if (opts.download && typeof document !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const blob = new Blob([text], { type: 'application/json' });
        out.blob = blob;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 2000);
      } catch (e) {
        out.downloadError = e?.message || String(e);
      }
    }
    return out;
  };

  S.importText = (text, opts = {}) =>
    queue(async () => {
      let body;
      try {
        body = decodeRecord(String(text || '').trim());
      } catch (e) {
        return { ok: false, reason: e.message };
      }
      let slot = opts.slot;
      if (!slot) {
        const used = new Set(await slotIds());
        for (let i = 1; i <= MAX_SLOTS && !slot; i++) if (!used.has('slot' + i)) slot = 'slot' + i;
        if (!slot) return { ok: false, reason: 'no_free_slot' };
      }
      body.slot = slot;
      body.kind = 'manual';
      body.savedAt = sys.realNow();
      body.meta = { ...(body.meta || {}), imported: true };
      try {
        await writeRecord(slot, 'manual', body);
      } catch (e) {
        return { ok: false, reason: e?.message || String(e) };
      }
      return { ok: true, slot, meta: body.meta };
    });

  // ---------------------------------------------------------------- autosave
  S.inhibit = (token = 'default') => {
    inhibitors.add(token);
  };
  S.release = (token = 'default') => {
    inhibitors.delete(token);
  };
  Object.defineProperty(S, 'inhibited', { get: () => inhibitors.size > 0 });
  S.canAutosave = () =>
    S.enabled && S.loaded && !S.busy && inhibitors.size === 0 && !sys.unsafeToSave?.();
  // real seconds; called every frame by the host
  S.update = (realDt) => {
    if (!S.loaded) return;
    S.playtime += realDt;
    autoT += realDt;
    if (autoT >= S.autosaveMinutes * 60) {
      if (S.canAutosave()) {
        autoT = 0;
        S.save({ kind: 'auto' });
      } else autoT = S.autosaveMinutes * 60 - 5; // try again in a few seconds
    }
  };
  // Ask for an autosave soon (after a purchase, a finished mission); coalesces.
  S.requestAutosave = (delaySeconds = 2) => {
    autoT = Math.max(autoT, S.autosaveMinutes * 60 - delaySeconds);
  };

  S._debug = { readRecord, writeRecord, keyOf, collect, pending: () => pending };
  return S;
}

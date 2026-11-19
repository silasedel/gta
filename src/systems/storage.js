// Core systems: key-value storage back ends for saves and settings.
// One async interface, three implementations: IndexedDB (preferred: large, transactional), localStorage (fallback),
// memory (last resort and Node tests). All values are strings.
//
//   const store = await openStorage();           // picks the best working back end
//   await store.get(key) -> string | null
//   await store.set(key, value)
//   await store.setMany({ key: value | null })    // atomic where the back end supports it; null deletes
//   await store.del(key)
//   await store.keys(prefix) -> [key]
//   store.kind -> 'indexeddb' | 'localstorage' | 'memory'

export function createMemoryStorage(initial) {
  const m = new Map(initial ? Object.entries(initial) : []);
  return {
    kind: 'memory',
    map: m,
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
    async set(k, v) {
      m.set(k, String(v));
    },
    async setMany(o) {
      for (const [k, v] of Object.entries(o)) {
        if (v === null || v === undefined) m.delete(k);
        else m.set(k, String(v));
      }
    },
    async del(k) {
      m.delete(k);
    },
    async keys(prefix = '') {
      return [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

export function createLocalStorage(ls, prefix = 'ps2:') {
  // localStorage has no transactions. setMany writes new values first and deletes last, so a crash in the middle
  // can leave an extra key but never loses the previous good record.
  return {
    kind: 'localstorage',
    async get(k) {
      return ls.getItem(prefix + k);
    },
    async set(k, v) {
      ls.setItem(prefix + k, String(v));
    },
    async setMany(o) {
      const dels = [];
      for (const [k, v] of Object.entries(o)) {
        if (v === null || v === undefined) dels.push(k);
        else ls.setItem(prefix + k, String(v));
      }
      for (const k of dels) ls.removeItem(prefix + k);
    },
    async del(k) {
      ls.removeItem(prefix + k);
    },
    async keys(pre = '') {
      const out = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(prefix + pre)) out.push(k.slice(prefix.length));
      }
      return out.sort();
    },
  };
}

export function createIndexedDbStorage(idb, name = 'port-solana-v2') {
  let dbp = null;
  const open = () =>
    dbp ||
    (dbp = new Promise((resolve, reject) => {
      let req;
      try {
        req = idb.open(name, 1);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          try {
            db.close();
          } catch (e) {
            /* */
          }
          dbp = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
      req.onblocked = () => reject(new Error('indexedDB blocked'));
    }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      let t, result;
      try {
        t = db.transaction('kv', mode);
      } catch (e) {
        dbp = null;
        reject(e);
        return;
      }
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error || new Error('indexedDB transaction failed'));
      t.onabort = () => reject(t.error || new Error('indexedDB transaction aborted'));
      try {
        fn(t.objectStore('kv'), (v) => {
          result = v;
        });
      } catch (e) {
        try {
          t.abort();
        } catch (e2) {
          /* */
        }
        reject(e);
      }
    });
  };
  return {
    kind: 'indexeddb',
    async probe() {
      await tx('readwrite', (s) => {
        s.put('1', '__probe');
        s.delete('__probe');
      });
      return true;
    },
    async get(k) {
      return tx('readonly', (s, done) => {
        const r = s.get(k);
        r.onsuccess = () => done(r.result === undefined ? null : r.result);
      });
    },
    async set(k, v) {
      return tx('readwrite', (s) => {
        s.put(String(v), k);
      });
    },
    async setMany(o) {
      return tx('readwrite', (s) => {
        for (const [k, v] of Object.entries(o)) {
          if (v === null || v === undefined) s.delete(k);
          else s.put(String(v), k);
        }
      });
    },
    async del(k) {
      return tx('readwrite', (s) => {
        s.delete(k);
      });
    },
    async keys(prefix = '') {
      return tx('readonly', (s, done) => {
        const r = s.getAllKeys();
        r.onsuccess = () =>
          done(
            (r.result || [])
              .map(String)
              .filter((k) => k.startsWith(prefix))
              .sort(),
          );
      });
    },
  };
}

const withTimeout = (p, ms, what) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms)),
  ]);

// Pick the best back end that actually works here (private windows and some embedded webviews block IndexedDB).
export async function openStorage({ prefer, env = globalThis } = {}) {
  if (prefer && typeof prefer.get === 'function') return prefer;
  if (prefer !== 'localstorage' && prefer !== 'memory') {
    try {
      if (env.indexedDB) {
        const s = createIndexedDbStorage(env.indexedDB);
        await withTimeout(s.probe(), 2500, 'indexedDB probe');
        return s;
      }
    } catch (e) {
      console.warn('[save] IndexedDB unavailable, falling back to localStorage:', e?.message || e);
    }
  }
  if (prefer !== 'memory') {
    try {
      const ls = env.localStorage;
      if (ls) {
        ls.setItem('ps2:__probe', '1');
        ls.removeItem('ps2:__probe');
        return createLocalStorage(ls);
      }
    } catch (e) {
      console.warn(
        '[save] localStorage unavailable, saves will not survive a reload:',
        e?.message || e,
      );
    }
  }
  return createMemoryStorage();
}

// Synchronous localStorage access for the exit snapshot (pagehide cannot wait for async storage).
export function syncLocal(env = globalThis, prefix = 'ps2:') {
  let ls = null;
  try {
    ls = env.localStorage || null;
    if (ls) {
      ls.setItem(prefix + '__p', '1');
      ls.removeItem(prefix + '__p');
    }
  } catch (e) {
    ls = null;
  }
  return {
    ok: !!ls,
    get(k) {
      try {
        return ls ? ls.getItem(prefix + k) : null;
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        if (!ls) return false;
        ls.setItem(prefix + k, v);
        return true;
      } catch (e) {
        return false;
      }
    },
    del(k) {
      try {
        ls?.removeItem(prefix + k);
      } catch (e) {
        /* */
      }
    },
  };
}

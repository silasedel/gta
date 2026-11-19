// Story state: flags, unlocks, finished missions and what each mission granted. Engine-free (no DOM, no three.js),
// persisted as the 'story' save slice (registered in index.js), so it rides in every save, autosave and exit snapshot.
//
//   flags     free-form keys, e.g. 'intro.firstJob.done', 'marcus.trust' -> any JSON value
//   unlocks   ids of things the story opened, e.g. 'freeRoam', 'mission.weaponPurchase'
//   done      mission id -> times passed (or skipped)
//   granted   mission id -> { money, items } paid by that mission (a skipped or replayed mission never pays twice)
//   resume    { id, checkpoint } while a mission is running (exit snapshot mid-mission -> Play resumes it there)

export function createStoryState() {
  const listeners = new Set();
  const S = {
    flags: {},
    unlocks: new Set(),
    done: {},
    granted: {},
    resume: null,
  };

  function changed(what, key) {
    for (const fn of listeners) {
      try {
        fn(what, key);
      } catch (e) {
        console.error('[story] state listener', e);
      }
    }
  }

  // ---------------------------------------------------------------- flags
  S.get = (key, fallback = undefined) => (key in S.flags ? S.flags[key] : fallback);
  S.has = (key) => !!S.flags[key];
  S.set = (key, value = true) => {
    if (S.flags[key] === value) return;
    if (value === undefined || value === null || value === false) delete S.flags[key];
    else S.flags[key] = value;
    changed('flag', key);
  };
  S.setMany = (obj) => {
    for (const key of Object.keys(obj || {})) S.set(key, obj[key]);
  };

  // ---------------------------------------------------------------- unlocks
  S.unlock = (id) => {
    if (S.unlocks.has(id)) return;
    S.unlocks.add(id);
    changed('unlock', id);
  };
  S.isUnlocked = (id) => S.unlocks.has(id);

  // ---------------------------------------------------------------- missions
  S.isDone = (id) => (S.done[id] || 0) > 0;
  S.markDone = (id) => {
    S.done[id] = (S.done[id] || 0) + 1;
    changed('done', id);
  };
  S.recordGrant = (id, grant) => {
    S.granted[id] = grant;
  };

  // A list of flag names all set, or a function of the state (mission `requires`).
  S.meets = (requires) => {
    if (!requires) return true;
    if (typeof requires === 'function') return !!requires(S);
    const list = Array.isArray(requires) ? requires : [requires];
    return list.every((key) => S.has(key) || S.isUnlocked(key) || S.isDone(key));
  };

  // ---------------------------------------------------------------- persistence
  S.reset = () => {
    S.flags = {};
    S.unlocks = new Set();
    S.done = {};
    S.granted = {};
    S.resume = null;
    changed('reset', null);
  };
  S.toJSON = () => ({
    flags: S.flags,
    unlocks: [...S.unlocks],
    done: S.done,
    granted: S.granted,
    resume: S.resume,
  });
  S.fromJSON = (d) => {
    S.flags = { ...(d?.flags || {}) };
    S.unlocks = new Set(d?.unlocks || []);
    S.done = { ...(d?.done || {}) };
    S.granted = { ...(d?.granted || {}) };
    S.resume = d?.resume || null;
    changed('load', null);
  };

  S.onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  return S;
}

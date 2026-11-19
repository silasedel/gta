// Southline V2 perf: world.updateSceneQueries() only when the collider set changed (perf track, Nov 19).
// Several systems (main loop, peds, vehicles, gameplay util) call world.updateSceneQueries() each frame so that rays never
// touch a removed collider. In Rapier 0.14 every call rebuilds the query tree over all ~3500 colliders: several rebuilds a
// frame, and 200+ ms ones while tiles stream colliders in (CPU profile of the in-app benchmark). world.step() refreshes the
// tree itself. Now a call is skipped unless a collider or body was created or removed since the last refresh, or a body was
// teleported (setTranslation / setRotation) since then. ?sqguard=0 = old.
export const order = 2;

export function initV2(game) {
  if (typeof location !== 'undefined' && /[?&]sqguard=0\b/.test(location.search)) return;
  const w = game.world;
  if (!w || typeof w.updateSceneQueries !== 'function') return;
  const st = (game.sceneQueryGuard = { dirty: true, runs: 0, skipped: 0 });
  const mark = (name) => {
    const f = w[name];
    if (typeof f !== 'function') return;
    w[name] = function (...a) {
      st.dirty = true;
      return f.apply(this, a);
    };
  };
  for (const n of ['createCollider', 'removeCollider', 'createRigidBody', 'removeRigidBody'])
    mark(n);
  const step = w.step;
  w.step = function (...a) {
    const r = step.apply(this, a);
    st.dirty = false;
    return r;
  };
  const upd = w.updateSceneQueries;
  w.updateSceneQueries = function (...a) {
    if (!st.dirty) {
      st.skipped++;
      return;
    }
    st.dirty = false;
    st.runs++;
    return upd.apply(this, a);
  };
  // teleported bodies (setTranslation / setRotation outside the step) also need a refresh before the next query
  const R = game.RAPIER;
  const P = R?.RigidBody?.prototype;
  if (P && !P.__psSqGuard) {
    P.__psSqGuard = true;
    for (const n of ['setTranslation', 'setRotation']) {
      const f = P[n];
      if (typeof f === 'function')
        P[n] = function (...a) {
          st.dirty = true;
          return f.apply(this, a);
        };
    }
    const fc = R.Collider?.prototype;
    if (fc)
      for (const n of [
        'setTranslation',
        'setRotation',
        'setTranslationWrtParent',
        'setShape',
        'setEnabled',
      ]) {
        const f = fc[n];
        if (typeof f === 'function')
          fc[n] = function (...a) {
            st.dirty = true;
            return f.apply(this, a);
          };
      }
  }
}

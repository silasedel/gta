// Physics cost probe (Nov 19): stands the player at a spot and reports the Rapier world (bodies, colliders by shape,
// trimesh triangle totals, the biggest colliders) and the time of world.step and of the fixed hooks.
//   node tools/v2/perf/physprobe.mjs [--at -1008,5174]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const args = process.argv.slice(2);
const atIdx = args.indexOf('--at');
const at = (atIdx >= 0 ? args[atIdx + 1] : '-1008,5174').split(',').map(Number);

await withBrowser({ width: 1280, height: 720, maxSeconds: 400 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(`(game.teleport(${at[0]}, undefined, ${at[1]}), 1)`);
  await b.sleep(15000);
  // count and time every Rapier query per frame (by method and by caller file) for 3 s
  await b.eval(`(() => {
    const w = game.world;
    const stats = (window.__qs = {});
    const methods = ['castRay', 'castRayAndGetNormal', 'castShape', 'intersectionWithShape', 'intersectionsWithRay', 'projectPoint', 'intersectionsWithShape', 'castCollider'];
    for (const m of methods) {
      const orig = w[m];
      if (typeof orig !== 'function') continue;
      w[m] = function () {
        const t = performance.now();
        const r = orig.apply(this, arguments);
        const dt = performance.now() - t;
        const st = (new Error().stack || '').split('\\n')[2] || '';
        const who = m + ' @ ' + (st.match(/([\\w.-]+)\\.js/) || [])[1];
        const e = stats[who] || (stats[who] = [0, 0]);
        e[0]++;
        e[1] += dt;
        return r;
      };
    }
    const cc = game.RAPIER.KinematicCharacterController?.prototype;
    if (cc && cc.computeColliderMovement) {
      const o = cc.computeColliderMovement;
      cc.computeColliderMovement = function () {
        const t = performance.now();
        const r = o.apply(this, arguments);
        const e = stats['computeColliderMovement'] || (stats['computeColliderMovement'] = [0, 0]);
        e[0]++;
        e[1] += performance.now() - t;
        return r;
      };
    }
    window.__qT0 = performance.now();
    return 1;
  })()`);
  await b.sleep(3000);
  await b.eval(`(() => { const secs = (performance.now() - window.__qT0) / 1000; window.__q = Object.entries(window.__qs).map(([k, v]) => [k, Math.round(v[0] / secs), +(v[1] / secs).toFixed(1)]).sort((a, b) => b[2] - a[2]).slice(0, 25); return 1; })()`);
  const out = await b.eval(`(() => {
    const w = game.world, R = game.RAPIER;
    const shapes = {};
    const big = [];
    let triTotal = 0;
    w.forEachCollider((c) => {
      const t = c.shapeType();
      const name = Object.keys(R.ShapeType).find((k) => R.ShapeType[k] === t) || t;
      shapes[name] = (shapes[name] || 0) + 1;
      if (name === 'TriMesh') {
        const n = c.indices ? c.indices().length / 3 : 0;
        triTotal += n;
        const p = c.translation();
        const b = c.parent();
        big.push([n, Math.round(p.x), Math.round(p.z), b ? (b.userData && JSON.stringify(b.userData).slice(0, 60)) : '']);
      }
    });
    big.sort((a, b) => b[0] - a[0]);
    let dyn = 0, fixed = 0, kin = 0;
    w.forEachRigidBody((rb) => { if (rb.isDynamic()) dyn++; else if (rb.isFixed()) fixed++; else kin++; });
    // time a step directly
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) w.step();
    const stepMs = (performance.now() - t0) / 10;
    const t1 = performance.now();
    for (let i = 0; i < 10; i++) w.updateSceneQueries?.();
    const sqMs = (performance.now() - t1) / 10;
    return JSON.stringify({ queries: window.__q, colliders: w.colliders.len(), bodies: { dyn, fixed, kin }, shapes, triTotal, stepMs: +stepMs.toFixed(2), sceneQueriesMs: +sqMs.toFixed(2), fixedHooks: game.fixedHooks.map((f) => f.name || 'anon'), bigTriMeshes: big.slice(0, 15) });
  })()`);
  console.log(out);
});

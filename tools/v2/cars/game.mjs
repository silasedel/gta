// In-game check of the library fleet: node tools/v2/cars/game.mjs --set NAME [--spots file.json] [--q '&libcars=0'] [--w 1600 --h 900]
// Per spot: teleport, settle, then report fleet stats, cars near the player (model, class, LOD), wheel-to-ground error per wheel
// (visual tire bottom vs the drawn ground), frame time + draw calls, and save docs/v2/shots/cars/<set>_<id>.png.
// A spot: { player: [x, z, heading], tod, settle, eye?: [x,y,z], look?: [x,y,z], eval?: 'js', car?: 'key' (look at the nearest car of that key) }
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'g';
const DIR = path.resolve('docs/v2/shots/cars');
fs.mkdirSync(DIR, { recursive: true });
const SPOTS = o.spots
  ? JSON.parse(fs.readFileSync(o.spots, 'utf8'))
  : { downtown: { player: [407, -110, 0], tod: 12 } };
const rep = { set: SET, when: new Date().toISOString(), spots: {} };
const PROBE = `(() => {
  const V = game.vehicles, T = window.THREE || game.THREE, pp = game.player.position, cam = game.camera;
  const out = { fleet: V.fleet ? { keys: V.fleet.keys.length, loaded: V.fleet.stats.loaded, failed: V.fleet.stats.failed, ms: Math.round(V.fleet.stats.ms) } : null, cars: [] };
  const v3 = new T.Vector3();
  let worst = 0, n = 0, sum = 0;
  for (const v of V.list) {
    const t = v.body.translation(), d = Math.hypot(t.x - pp.x, t.z - pp.z);
    if (d > 120) continue;
    const errs = [];
    for (const w of v.car.wheels) {
      w.steer.getWorldPosition(v3);
      let g = game.city.groundHeightAt(v3.x, v3.z, v3.y);
      try { const R = game.RAPIER, QF = R.QueryFilterFlags; const hit = game.world.castRay(new R.Ray({ x: v3.x, y: v3.y + 0.4, z: v3.z }, { x: 0, y: -1, z: 0 }), 4, true, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS); if (hit) g = v3.y + 0.4 - (hit.timeOfImpact ?? hit.toi); } catch (e) { /* drawn-ground fallback */ }
      const e = v3.y - v.spec.r - g; errs.push(+e.toFixed(3));
      if (!v.ghost && !v.frozen && Math.abs(e) < 1) { worst = Math.max(worst, Math.abs(e)); sum += Math.abs(e); n++; }
    }
    let lod = -1; v.car.lod?.levels?.forEach((l, i) => { if (l.object.visible) lod = i; });
    const up = new T.Vector3(0, 1, 0).applyQuaternion(v.mesh.quaternion).y;
    out.cars.push({ up: +up.toFixed(2), key: v.typeKey, glb: !!v.car.glb, cls: v.spec.cls, d: Math.round(d), ai: !!v.ai, ghost: !!v.ghost, frozen: !!v.frozen, lod, wheelErr: errs, sleeping: v.body.isSleeping() });
  }
  out.wheel = { worstAbs: +worst.toFixed(3), meanAbs: n ? +(sum / n).toFixed(3) : null, n };
  out.counts = {}; for (const c of out.cars) out.counts[c.key] = (out.counts[c.key] || 0) + 1;
  out.tilted = out.cars.filter((c) => c.up < 0.85).map((c) => c.key + (c.ai ? ':ai' : ':pk') + ':' + c.up);
  out.glbShare = out.cars.length ? +(out.cars.filter((c) => c.glb).length / out.cars.length).toFixed(2) : null;
  return JSON.stringify(out);
})()`;
await withBrowser(
  { width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 1100) },
  async (b) => {
    await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
    if (!(await startGame(b))) console.log('WARN: title did not close');
    await b.eval(
      `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; if (!window.__cbCss) { window.__cbCss = document.createElement('style'); window.__cbCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__cbCss); } return 1; })()`,
    );
    for (const [id, s] of Object.entries(SPOTS)) {
      if (o.only && !String(o.only).split(',').includes(id)) continue;
      await b.eval(
        `(() => { const s = ${JSON.stringify(s)}; game.timeOfDay = s.tod ?? 12; game.cameraOverride = null; if (s.player) game.teleport(s.player[0], undefined, s.player[1], s.player[2] ?? 0); return 1; })()`,
      );
      await b.sleep(+(s.settle || o.settle || 9000));
      for (let i = 0; i < 40; i++) {
        const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
        if (q < 3) break;
        await b.sleep(1000);
      }
      if (s.eval) console.log(id, 'eval', await b.eval(`(() => { ${s.eval} })()`));
      if (s.eye)
        await b.eval(
          `(() => { const s = ${JSON.stringify(s)}; game.cameraOverride = (dt, cam) => { cam.position.fromArray(s.eye); cam.lookAt(s.look[0], s.look[1], s.look[2]); return true; }; return 1; })()`,
        );
      if (s.car)
        await b.eval(`(() => { const s = ${JSON.stringify(s)}; const T = window.THREE || game.THREE, pp = game.player.position;
      const list = game.vehicles.list.filter((v) => (v.typeKey === s.car || s.car === '*') && (!s.ai || (v.ai && Math.abs(v.speed) > 1.5)) && (!s.parked || (!v.ai && !v.pinned)) && v.car?.glb).sort((a, b) => a.mesh.position.distanceTo(pp) - b.mesh.position.distanceTo(pp));
      const v = list[0]; if (!v) return 0; window.__cv = v; const off = new T.Vector3(...(s.off || [3.6, 1.5, 5.2]));
      game.cameraOverride = (dt, cam) => { const m = window.__cv.mesh; const e = off.clone().applyQuaternion(m.quaternion).add(m.position); cam.position.copy(e); cam.lookAt(m.position.x, m.position.y + (s.lookY ?? -0.1), m.position.z); if (cam.fov !== (s.fov || 45)) { cam.fov = s.fov || 45; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
      await b.sleep(1500);
      const perf = await b.eval(
        `new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 2500) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render; res(JSON.stringify({ avgMs: +avg.toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2), calls: ri.calls, tris: ri.triangles })); } }; requestAnimationFrame(f); })`,
      );
      const probe = JSON.parse(await b.eval(PROBE));
      const out = path.join(DIR, `${SET}_${id}.png`);
      await b.screenshot(out);
      rep.spots[id] = { perf: JSON.parse(perf), ...probe };
      console.log(
        id,
        perf,
        JSON.stringify({
          wheel: probe.wheel,
          glbShare: probe.glbShare,
          tilted: probe.tilted,
          n: probe.cars.length,
        }),
      );
    }
    if (b.errors.length) {
      rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 30);
      console.log('ERRORS', rep.errors.join('\n'));
    }
  },
);
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/cars-${SET}.json`, JSON.stringify(rep, null, 1));

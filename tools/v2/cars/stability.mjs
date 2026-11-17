// Traffic stability of the library fleet: node tools/v2/cars/stability.mjs [--at x,z] [--secs 60] [--q '&libcars=0']
// Samples every live car twice a second: tilt (body up vector), wheel-to-collider gap per wheel (physics cars only),
// airborne wheels while driving; reports per model the worst values and every car that ended up on its side or roof.
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const at = String(o.at || '407,-110').split(',').map(Number), secs = +(o.secs || 60);
await withBrowser({ width: 960, height: 540, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 12; game.teleport(${at[0]}, undefined, ${at[1]}, 0); if (game.vehicles.trafficDebug) game.vehicles.trafficDebug.target = 24; return 1; })()`);
  await b.sleep(15000);
  await b.eval(`(() => { const T = window.THREE || game.THREE, R = game.RAPIER, QF = R.QueryFilterFlags, v3 = new T.Vector3(); window.__st = {};
    window.__stTick = () => { for (const v of game.vehicles.list) { if (!v.car?.wheels) continue;
      const k = v.typeKey, s = (window.__st[k] ||= { n: 0, maxTilt: 0, flips: 0, worstGap: 0, worstSink: 0, samples: 0, ai: 0 });
      const up = new T.Vector3(0, 1, 0).applyQuaternion(v.mesh.quaternion).y; s.samples++; if (v.ai) s.ai++;
      s.maxTilt = Math.max(s.maxTilt, Math.acos(Math.max(-1, Math.min(1, up))) * 57.3); if (up < 0.5 && !v.__flip) { v.__flip = 1; s.flips++; }
      if (v.ghost || v.frozen || !v.vc) continue;
      for (const w of v.car.wheels) { w.steer.getWorldPosition(v3); const h = game.world.castRay(new R.Ray({ x: v3.x, y: v3.y + 0.4, z: v3.z }, { x: 0, y: -1, z: 0 }), 3, true, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS);
        if (!h) continue; const g = v3.y + 0.4 - (h.timeOfImpact ?? h.toi), e = v3.y - v.spec.r - g;
        if (Math.abs(v.speed) < 0.5 && v.body.isSleeping()) { s.worstGap = Math.max(s.worstGap, e); s.worstSink = Math.min(s.worstSink, e); }
        else if (Math.abs(e) < 0.6) { s.worstGapMoving = Math.max(s.worstGapMoving || 0, e); s.worstSinkMoving = Math.min(s.worstSinkMoving || 0, e); } } } };
    window.__stI = setInterval(window.__stTick, 500); return 1; })()`);
  for (let t = 0; t < secs; t += 10) { await b.sleep(10000); }
  const r = JSON.parse(await b.eval(`(() => { clearInterval(window.__stI); const out = {}; for (const [k, s] of Object.entries(window.__st)) out[k] = { maxTiltDeg: +s.maxTilt.toFixed(1), flips: s.flips, restGap: +s.worstGap.toFixed(3), restSink: +s.worstSink.toFixed(3), moveGap: +(s.worstGapMoving || 0).toFixed(3), moveSink: +(s.worstSinkMoving || 0).toFixed(3), samples: s.samples, aiShare: +(s.ai / s.samples).toFixed(2) }; return JSON.stringify(out); })()`));
  console.log(JSON.stringify(r, null, 0).replace(/},/g, '},\n'));
  fs.mkdirSync('docs/v2/reports', { recursive: true }); fs.writeFileSync('docs/v2/reports/cars-stability.json', JSON.stringify(r, null, 1));
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 10));
});

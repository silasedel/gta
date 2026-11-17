#!/usr/bin/env node
// Stage 1 look tour: gameplay-camera screenshots + frame timing at fixed places. Always muted.
//   node tools/v2/s1-tour.mjs --set before [--only spawn,night] [--w 1920 --h 1080] [--spots file.json]
// Writes docs/v2/shots/stage1/<set>_<id>.png and docs/v2/reports/stage1-<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after';
const DIR = path.resolve('docs/v2/shots/stage1'); fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync('docs/v2/reports', { recursive: true });
// player: [x, z, heading] (null = where the game spawned us); eye/look = fixed camera instead of the follow camera
const DEFAULT = {
  spawn: { player: null, tod: 11 },
  downtown: { eye: [-2470, 34, 880], look: [-2640, 4, 790], tod: 15 },
  bay: { eye: [-1300, 70, -3200], look: [200, 4, -3500], tod: 17.5 },
  house: { house: true, tod: 12 },
  night: { player: null, tod: 22 },
};
const SPOTS = o.spots ? JSON.parse(fs.readFileSync(o.spots, 'utf8')) : DEFAULT;
const only = o.only ? String(o.only).split(',') : Object.keys(SPOTS);
const rep = { set: SET, when: new Date().toISOString(), shots: {} };

await withBrowser({ width: +(o.w || 1920), height: +(o.h || 1080), maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; window.__spawn = game.player ? [game.player.position.x, game.player.position.z] : null; return 1; })()`);
  for (const id of only) {
    const s = SPOTS[id]; if (!s) continue;
    const setup = `(() => { const s = ${JSON.stringify(s)}; game.timeOfDay = s.tod ?? 12; game.cameraOverride = null;
      if (s.eye) { game.cameraOverride = (dt, cam) => { cam.position.fromArray(s.eye); cam.lookAt(s.look[0], s.look[1], s.look[2]); return true; }; }
      else if (s.house && game.nicoHouse) { const g = game.nicoHouse.group || game.nicoHouse.root; const p = g ? g.position : null; const a = game.nicoHouse.anchors?.front || game.nicoHouse.anchors?.door; const q = a?.pos || (p && { x: p.x, z: p.z + 14 }); if (q) game.teleport(q.x, undefined, q.z, s.heading ?? Math.PI); }
      else if (s.player) game.teleport(s.player[0], undefined, s.player[1], s.player[2]);
      else if (window.__spawn) game.teleport(window.__spawn[0], undefined, window.__spawn[1]);
      { ${s.eval || ''} }
      return 1; })()`;
    await b.eval(setup);
    await b.sleep(+(o.settle || 5000));
    // frame timing over ~3 s of real frames
    const perf = await b.eval(`new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 3000) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render; res(JSON.stringify({ avgMs: +avg.toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2), fps: +(1000 / avg).toFixed(1), calls: ri.calls, tris: ri.triangles, pr: game.renderer.getPixelRatio(), q: game.quality?.current?.name, pos: game.player?.position?.toArray?.().map((v) => +v.toFixed(1)) })); } }; requestAnimationFrame(f); })`);
    const out = path.join(DIR, `${SET}_${id}.png`);
    await b.screenshot(out);
    rep.shots[id] = JSON.parse(perf);
    console.log(id, perf);
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 30); console.log('ERRORS', rep.errors.join('\n')); }
});
fs.writeFileSync(`docs/v2/reports/stage1-${SET}.json`, JSON.stringify(rep, null, 2));

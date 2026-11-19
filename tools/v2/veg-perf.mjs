#!/usr/bin/env node
// Greenery perf check (stage 1): player spots at Clewiston, Key Largo and the Everglades; per spot after streaming settles:
// frame time (avg / p95 over 5 s), renderer draw calls + triangles, vegetation-only draw calls / triangles (scene walk), countryside
// streamer stats. Muted, V2 test browser.
//   node tools/v2/veg-perf.mjs --set before|after [--url http://127.0.0.1:5200/] [--stream 60]
// Writes docs/v2/reports/stage1-green-perf-<set>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'after';
const SPOTS = {
  clewiston: [-1540, -2805, 0],
  keylargo: [-873.6, 4825.2, 0],
  everglades: [-2386, 2660, 0],
};
const VEG = `(() => { // vegetation draw calls / triangles this frame (instanced meshes with a vegetation material or a countryside slot)
  let calls = 0, tris = 0, inst = 0; const cam = game.camera;
  game.scene.traverseVisible((m) => { if (!m.isMesh || !m.material) return; const mats = Array.isArray(m.material) ? m.material : [m.material];
    const veg = mats.some((x) => x.userData?.veg || /flora|veg|leaf|bark|palm|grass|lawn/i.test(x.name || '')) || /countryside|vegField/.test(m.parent?.name || '');
    if (!veg) return; const n = m.isInstancedMesh ? m.count : 1; if (!n) return; const g = m.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    calls++; inst += n; tris += t * n; });
  const cs = game.vegetation?.countryside?.stats?.() || null;
  return { vegCalls: calls, vegInst: inst, vegTris: Math.round(tris), cs: cs && { drawCalls: cs.drawCalls, instances: cs.instances, tris: cs.tris, rebucketAvgMs: cs.rebucketAvgMs, genAvgMs: cs.genAvgMs } };
})()`;
const rep = { set: SET, when: new Date().toISOString(), spots: {} };
await withBrowser({ width: 1920, height: 1080, maxSeconds: 900 }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute&weather=clear');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12; return 1; })()`,
  );
  for (const [id, [x, z, h]] of Object.entries(SPOTS)) {
    await b.eval(
      `(() => { game.cameraOverride = null; game.teleport(${x}, undefined, ${z}, ${h}); return 1; })()`,
    );
    await b.sleep(6000);
    for (let i = 0; i < +(o.stream || 60); i++) {
      const q = await b.eval(
        '(game.city?.streamer?.pending?.() ?? 0) + (game.vegetation?.countryside?.stats?.().pending ?? 0)',
      );
      if (q < 3) break;
      await b.sleep(1000);
    }
    await b.sleep(3000);
    const perf = await b.eval(
      `new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 5000) requestAnimationFrame(f); else { ts.sort((p, q) => p - q); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render; res(JSON.stringify({ avgMs: +avg.toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2), calls: ri.calls, tris: ri.triangles, veg: ${VEG} })); } }; requestAnimationFrame(f); })`,
    );
    rep.spots[id] = JSON.parse(perf);
    console.log(id, perf);
  }
  if (b.errors.length) rep.errors = [...new Set(b.errors)].slice(0, 20);
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/stage1-green-perf-${SET}.json`, JSON.stringify(rep, null, 2));

// Draw-call breakdown while driving downtown (Nov 19 perf push): every renderBufferDirect call over N frames is tagged
// with the object's top-level scene group (and the pass: main view or shadow map), so the biggest draw-call sources
// are obvious.   node tools/v2/perf/drawcalls.mjs [--frames 30] [--at 407,-110] [--q "&foo=1"]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const next = args[i + 1];
    opt[key] = next && !next.startsWith('--') ? args[++i] : true;
  }
}
const FRAMES = +(opt.frames || 30);
const at = String(opt.at || '407,-110')
  .split(',')
  .map(Number);
const query = opt.q || '';

await withBrowser({ width: 1600, height: 900, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + query);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 13; return 1; })()`);
  await b.eval(fs.readFileSync('tools/v2/physics/labPage.js', 'utf8'));
  // the road graph only holds streamed tiles: go there first, then pick the road
  await b.eval(`(game.teleport(${at[0]}, undefined, ${at[1]}), 1)`);
  await b.sleep(15000);
  await b.eval(`JSON.stringify(__lab.findSpot(${at[0]}, ${at[1]}))`);
  await b.eval(
    `(() => { const S = __lab.spot; game.teleport(S.x0 + S.rx * 2.4, undefined, S.z0 + S.rz * 2.4); return 1; })()`,
  );
  await b.sleep(12000);
  await b.eval(`__lab.spawn('sedan3', 0).then(() => { __lab.v.playerDriven = false; return 1; })`);
  await b.sleep(800);
  await b.eval('(game.enterVehicle(__lab.v), 1)');
  await b.sleep(2000);
  const runP = b.eval(`__lab.run({ kmh: 45, sEnd: 200, maxT: 25 }).then(() => 1)`, 200000);
  await b.sleep(5000);
  const result = await b.eval(`(async () => {
    const r = game.renderer;
    const counts = new Map();
    const seen = new Map();
    let frames = 0;
    const topName = (o) => {
      let n = o;
      while (n.parent && n.parent !== game.scene) n = n.parent;
      const label = n.name || n.userData?.kind || n.type;
      return label;
    };
    const orig = r.renderBufferDirect;
    r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const pass = r.shadowMap && camera && camera.isOrthographicCamera && camera !== game.camera ? 'shadow' : 'main';
      const key = pass + ' | ' + topName(object) + ' | ' + (object.isInstancedMesh ? 'inst' : object.isSkinnedMesh ? 'skin' : 'mesh');
      counts.set(key, (counts.get(key) || 0) + 1);
      if (pass === 'main') {
        const gk = (object.isInstancedMesh ? 'I ' : 'M ') + (geometry.name || geometry.uuid.slice(0, 6)) + ' / ' + (material.name || material.type);
        let e = seen.get(gk);
        if (!e) seen.set(gk, (e = new Set()));
        e.add(object.id);
      }
      return orig.apply(this, arguments);
    };
    await new Promise((res) => {
      const tick = () => { frames++; if (frames >= ${FRAMES}) res(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    r.renderBufferDirect = orig;
    const rows = [...counts].map(([k, v]) => [k, +(v / frames).toFixed(1)]).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((s, x) => s + x[1], 0);
    const byPass = {};
    for (const [k, v] of rows) { const p = k.split(' | ')[0]; byPass[p] = +((byPass[p] || 0) + v).toFixed(1); }
    // instanced pools in the city: how many share a geometry + material (one per tile = mergeable)
    const pools = new Map(); let live = 0;
    game.scene.getObjectByName('miami-city')?.traverseVisible((o) => {
      if (!o.isInstancedMesh || !o.count) return; live++;
      const k = (o.geometry.name || o.geometry.uuid.slice(0, 6)) + ' / ' + (Array.isArray(o.material) ? 'multi' : (o.material.name || o.material.type));
      const e = pools.get(k) || [0, 0]; e[0]++; e[1] += o.count; pools.set(k, e);
    });
    const poolRows = [...pools].sort((a, b) => b[1][0] - a[1][0]).slice(0, 30).map(([k, e]) => [k, e[0], e[1]]);
    const meshes = new Map();
    game.scene.getObjectByName('miami-city')?.traverseVisible((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const k = (o.name || o.parent?.name || '?').replace(/[-_]?-?\d+[,_ ]-?\d+.*$/, '') + ' / ' + (Array.isArray(o.material) ? 'multi' : (o.material.name || o.material.type));
      meshes.set(k, (meshes.get(k) || 0) + 1);
    });
    const meshRows = [...meshes].sort((a, b) => b[1] - a[1]).slice(0, 25);
    const drawn = [...seen].map(([k, set]) => [k, set.size]).sort((a, b) => b[1] - a[1]);
    const where = game.player.position;
    return JSON.stringify({ where: [Math.round(where.x), Math.round(where.z)], distinctDrawnKinds: drawn.length, drawnObjects: drawn.reduce((s, x) => s + x[1], 0), drawnTop: drawn.slice(0, 40), livePools: live, distinctPools: pools.size, poolRows, meshRows, frames, perFrameTotal: +total.toFixed(1), byPass, info: game.renderer.info.render, top: rows.slice(0, 40) });
  })()`);
  await runP.catch(() => {});
  fs.writeFileSync('docs/v2/reports/drawcalls.json', result);
  console.log(result);
});

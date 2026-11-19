// r2-metro: site probe for the street entrances. For each candidate: nearest road edge, a sidewalk point beside it,
// and a top-down + street-level shot so the kiosk spot can be judged.
//   node tools/v2/metro/probe.mjs [--q "&metro=1"] [--only 0,2]
import { withBrowser, startGame } from '../browser.mjs';
import fs from 'node:fs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1];
const C = [
  ['airport', -650, 1230],
  ['havana', -655, -55],
  ['downtown', 410, -100],
  ['sobe', 2400, 605],
];
const only = o.only ? o.only.split(',').map(Number) : null;
fs.mkdirSync('docs/v2/shots/metro/probe', { recursive: true });
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await startGame(b);
  const out = [];
  for (let i = 0; i < C.length; i++) {
    if (only && !only.includes(i)) continue;
    const [name, x, z] = C[i];
    const info = JSON.parse(
      await b.eval(`(() => { const r = game.city.roadGraph.nearestEdge(${x}, ${z}, null, 300); if (!r) return 'null';
      return JSON.stringify({ px: r.point.x, pz: r.point.z, dx: r.dir.x, dz: r.dir.z, w: r.edge.width, kind: r.edge.kind, name: r.edge.name }); })()`),
    );
    await b.eval(`game.teleport(${x}, undefined, ${z}, 0)`);
    for (let k = 0; k < 60; k++) {
      if (
        await b.eval(
          `game.city.collidersReadyAt(${x}, ${z}) && game.city.streamer.readyAround(${x}, ${z}, 120)`,
        )
      )
        break;
      await b.sleep(500);
    }
    await b.sleep(2500);
    const gy = await b.eval(`game.city.groundHeightAt(${info.px}, ${info.pz}) || 0`);
    await b.eval(
      `game.cameraOverride = (dt, cam) => { cam.position.set(${info.px}, ${gy} + 55, ${info.pz} + 0.01); cam.lookAt(${info.px}, ${gy}, ${info.pz}); return true; }`,
    );
    await b.sleep(1500);
    await b.screenshot(`docs/v2/shots/metro/probe/${name}_top.png`);
    out.push({ name, ...info, gy });
    await b.eval('game.cameraOverride = null');
  }
  console.log(JSON.stringify(out, null, 1));
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 10));
});

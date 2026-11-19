// r2-physics: what physics is under / around given points. For each "x,z": every collider a vertical ray from +20 m meets on
// the way down (shape type, height, tag when the city audit tags it), the city's ground / water / terrain answers, and whether
// a standing capsule would be supported. Optional --swim: teleports the player there and reports P.swimming after 4 s.
//   node tools/v2/physics/probe.mjs --pts "-895,4806;-903,4828" [--swim] [--q &trunks=0]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const PTS = String(o.pts || '')
  .split(';')
  .filter(Boolean)
  .map((q) => q.split(',').map(Number));
const out = { pts: [] };
await withBrowser({ width: 800, height: 450, maxSeconds: 1500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  for (const [x, z] of PTS) {
    await b.eval(`(() => { game.teleport(${x} + 3, undefined, ${z} + 3); return 1; })()`);
    await b.sleep(+(o.wait || 8) * 1000);
    const r = JSON.parse(
      await b.eval(`JSON.stringify((() => { const R = game.RAPIER, W = game.world, C = game.city, hits = []; let y0 = +(${o.top || 20}), ex = null;
      for (let k = 0; k < 8; k++) { const h = W.castRayAndGetNormal(new R.Ray({ x: ${x}, y: y0, z: ${z} }, { x: 0, y: -1, z: 0 }), 400, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, ex || undefined);
        if (!h) break; const y = y0 - (h.timeOfImpact ?? h.toi), c = h.collider, pb = c.parent();
        hits.push({ y: +y.toFixed(3), shape: c.shapeType(), tag: C.colTags?.get?.(c.handle) || null, body: pb ? (pb.isFixed() ? 'fixed' : pb.isDynamic() ? 'dynamic' : 'kinematic') : 'static', n: +h.normal.y.toFixed(2), handle: c.handle });
        ex = c; y0 = y - 0.01; }
      const sea = C.seaLevel ?? -0.12;
      return { x: ${x}, z: ${z}, hits, ground: C.groundHeightAt?.(${x}, ${z}), water: C.isWater?.(${x}, ${z}), terrain: C.terrain?.heightAt?.(${x}, ${z}) ?? null, seabed: C.seabedDepthAt?.(${x}, ${z}) ?? null, sea, surface: C.surfaceAt?.(${x}, ${z}), src: (() => { try { return (C.colliderSourceAt?.(${x}, ${z}, 3) || []).filter((q) => q.kind === 'building'); } catch (e) { return 'ERR'; } })(), colsReady: C.collidersReadyAt?.(${x}, ${z}) ?? null }; })())`),
    );
    if (o.swim) {
      await b.eval(`(() => { game.teleport(${x}, undefined, ${z}); return 1; })()`);
      await b.sleep(4000);
      r.swim = JSON.parse(
        await b.eval(
          `JSON.stringify({ swimming: !!game.player.swimming, y: +game.player.position.y.toFixed(2), grounded: !!game.player.state?.grounded })`,
        ),
      );
    }
    out.pts.push(r);
    console.log(JSON.stringify(r));
  }
});
fs.writeFileSync(
  `docs/v2/reports/physics-probe${o.tag ? '-' + o.tag : ''}.json`,
  JSON.stringify(out, null, 1),
);

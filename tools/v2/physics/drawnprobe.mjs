// r2-physics: at each "x,z", what is DRAWN there (three.js ray from 300 m down against the rendered meshes) and what physics sits
// at / under that drawn surface (a ball 0.4 m below it, a ray from 1 m above it), plus the city's building at the point.
//   node tools/v2/physics/drawnprobe.mjs --pts "410,-157;499,-156"
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
const out = [];
await withBrowser({ width: 800, height: 450, maxSeconds: 1500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  for (const [x, z] of PTS) {
    await b.eval(`(() => { game.teleport(${x} + 2, undefined, ${z} + 2); return 1; })()`);
    await b.sleep(+(o.wait || 25) * 1000);
    const r = JSON.parse(
      await b.eval(`JSON.stringify((() => { const T = game.THREE, R = game.RAPIER, W = game.world, rc = new T.Raycaster(new T.Vector3(${x}, 300, ${z}), new T.Vector3(0, -1, 0), 0, 400);
      const meshes = []; game.scene.traverseVisible((m) => { if ((m.isMesh || m.isInstancedMesh) && !m.isSkinnedMesh && m.name !== 'sky' && m.geometry) meshes.push(m); });
      const hs = []; for (const m of meshes) { const proto = m.isInstancedMesh ? T.InstancedMesh.prototype : T.Mesh.prototype; try { proto.raycast.call(m, rc, hs); } catch (e) { /* */ } }
      hs.sort((p, q) => p.distance - q.distance);
      const top = hs.slice(0, 4).map((h) => ({ y: +h.point.y.toFixed(2), name: (h.object.name || '?') + '<' + (h.object.parent?.name || '') + '>' }));
      const yd = hs[0] ? hs[0].point.y : 0; const touch = [];
      try { W.intersectionsWithShape({ x: ${x}, y: yd - 0.4, z: ${z} }, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(0.35), (c) => { touch.push(c.shapeType()); return true; }); } catch (e) { /* */ }
      const h2 = W.castRay(new R.Ray({ x: ${x}, y: yd + 1, z: ${z} }, { x: 0, y: -1, z: 0 }), 400, true);
      const C = game.city; let bld = []; try { bld = (C.colliderSourceAt?.(${x}, ${z}, 6) || []).filter((q) => q.kind === 'building'); } catch (e) { /* */ }
      return { x: ${x}, z: ${z}, drawn: top, physUnderDrawn: h2 ? +(yd + 1 - (h2.timeOfImpact ?? h2.toi)).toFixed(2) : null, touchBelowDrawn: touch, buildingsWithin6m: bld }; })())`),
    );
    out.push(r);
    console.log(JSON.stringify(r));
  }
});
fs.writeFileSync('docs/v2/reports/physics-drawnprobe.json', JSON.stringify(out, null, 1));

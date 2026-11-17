#!/usr/bin/env node
// Plants (or anything instanced) standing in road lanes: node tools/v2/vegetation/onroad.mjs [r=60] [x,z ...]
// For each place (default: Pelican Point Ln in front of Nico's house) teleports there, waits for streaming, then lists the
// instanced meshes (parent / name / material, veg family, gm = ground-mask patched) with instances inside a road ribbon
// (road graph distance < half width - 0.3 m) within r m.
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const R = +(process.argv[2] || 60), places = process.argv.slice(3).map((s) => s.split(',').map(Number));
await withBrowser({ width: 960, height: 540, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute'); await b.waitFor(GAME_READY + ' && !!game.nicoHouse', 600); await startGame(b, 60);
  const list = places.length ? places : [null];
  for (const pl of list) {
    const at = pl ? `new game.THREE.Vector3(${pl[0]}, 0, ${pl[1]})` : 'game.nicoHouse.toWorld(new game.THREE.Vector3(0, 0, 20))';
    await b.eval(`(() => { const p = ${at}; window.__orc = p; game.teleport(p.x, undefined, p.z, 0); return 1; })()`); await b.sleep(14000);
    console.log('== ' + (pl ? pl.join(',') : 'pelican point ln'));
    console.log(await b.eval(`(() => { const T = game.THREE, c = window.__orc, G = game.city.roadGraph, M = new T.Matrix4(), P = new T.Vector3(), rows = {};
      game.scene.updateMatrixWorld(); game.scene.traverse((o) => { if (!o.isInstancedMesh || !o.visible) return; const m = Array.isArray(o.material) ? o.material[0] : o.material;
        let n = 0, ex = null; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.premultiply(o.matrixWorld); P.setFromMatrixPosition(M); if (Math.hypot(P.x - c.x, P.z - c.z) > ${R}) continue; const s = M.getMaxScaleOnAxis(); if (s < 1e-3) continue;
          if (P.y - (game.city.groundHeightAt ? game.city.groundHeightAt(P.x, P.z) || 0 : 0) > 1.5) continue; // on a bridge / deck / roof: not in a lane
          const r = G.nearestEdge(P.x, P.z, {}, 20); if (!r) continue; const d = Math.hypot(r.point.x - P.x, r.point.z - P.z); if (d < r.edge.width / 2 - 0.3) { n++; ex ||= [+P.x.toFixed(1), +P.z.toFixed(1), +d.toFixed(2), r.edge.width, r.edge.kind]; } }
        if (n) { const k = (o.parent?.name || '') + ' / ' + (o.name || '') + ' / ' + (m?.name || m?.type) + (m?.userData?.veg ? ' veg-' + m.userData.veg.family : '') + (m?.userData?.gmVeg ? ' gm' : ''); rows[k] = [(rows[k]?.[0] || 0) + n, ex]; } });
      return Object.entries(rows).map(([k, v]) => k + '  x' + v[0] + '  e.g. ' + JSON.stringify(v[1])).join('\\n') || '(none)'; })()`, 180000));
  }
  const errs = b.errors.filter((e) => !/favicon/.test(e)); if (errs.length) console.log('ERRORS', errs.slice(0, 8).join('\n'));
});

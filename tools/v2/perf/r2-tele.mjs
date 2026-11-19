#!/usr/bin/env node
// r2-perf streaming check (QA-045 / QA-009 / QA-010): teleport loop. For each spot: teleport the player, wait until the
// streamer says ready (readyAround(x, z, 120) && collidersReadyAt(x, z), as the dev teleport does), then at that moment
// count what is wrong within 70 m / 120 m of the player:
//   - tiles within 120 m (rect distance) without their near build, within colR without colliders (truth, from the maps)
//   - far chunk meshes still drawn within 70 m of the player
//   - physics vs drawn height on a 10 m grid within 70 m: a down ray against the physics world and against the drawn city
//     (near / mid / far meshes of city.root only) disagreeing by more than 1.5 m where the drawn surface is higher
//   - after 3 s: did the player fall (more than 2 m below the drawn ground)?
//   node tools/v2/perf/r2-tele.mjs [--q "&streamfix=1"] [--set name] [--rounds 2]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'tele';
const SPOTS0 = [
  ['qa045', 470, -157],
  ['qa045b', 499, -156],
  ['beach', 2332, -660],
  ['keys', -836, 5272],
  ['glades', -2386, 2660],
  ['brickell', 0, 1760],
  ['spawn', null, null],
];
const SPOTS = o.spots
  ? String(o.spots)
      .split(';')
      .map((t) => {
        const [id, x, z] = t.split(':');
        return [id, +x, +z];
      })
  : SPOTS0;
const rep = { set: SET, q: o.q || '', when: new Date().toISOString(), spots: [] };
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 800) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12; window.__sp = [game.player.position.x, game.player.position.z]; return 1; })()`,
  );
  await b.eval(`(() => { window.__tele = async (x, z) => {
      const G = game, st = G.city.streamer, T = G.THREE, R = G.RAPIER, W = G.world, P = G.player;
      G.teleport(x, undefined, z);
      const t0 = performance.now(); let ok = false;
      let fellDuring = 0, minDy = 1e9;
      while (performance.now() - t0 < 30000) { await new Promise((r) => setTimeout(r, 100));
        { const gy0 = G.city.groundHeightAt?.(P.position.x, P.position.z) ?? 0, dy = P.position.y - gy0; if (dy < minDy) minDy = dy; if (dy < -2 && !G.city.isWater?.(P.position.x, P.position.z)) fellDuring++; }
        if (st.readyAround(x, z, 120) && G.city.collidersReadyAt(x, z)) { ok = true; break; } }
      const waited = Math.round(performance.now() - t0);
      // truth from the maps
      const TS = st.tileSize; const dR = (t) => Math.hypot(Math.max(t.x0 - x, 0, x - (t.x0 + TS)), Math.max(t.z0 - z, 0, z - (t.z0 + TS)));
      let noNear = 0, noCol = 0; const miss = [];
      const tx0 = Math.floor((x - 120) / TS) - 1, tx1 = Math.floor((x + 120) / TS) + 1, tz0 = Math.floor((z - 120) / TS) - 1, tz1 = Math.floor((z + 120) / TS) + 1;
      for (const t of st.tiles.values()) { const d = dR(t); if (d >= 120) continue; if (!t.near) { noNear++; miss.push('near ' + t.tx + ',' + t.tz + ' d' + Math.round(d)); } if (d < 120 && !t.col) { noCol++; miss.push('col ' + t.tx + ',' + t.tz + ' d' + Math.round(d)); } }
      let tilesMissingFromMap = 0; for (let tx = tx0; tx <= tx1; tx++) for (let tz = tz0; tz <= tz1; tz++) { const x0 = tx * TS, z0 = tz * TS; const d = Math.hypot(Math.max(x0 - x, 0, x - (x0 + TS)), Math.max(z0 - z, 0, z - (z0 + TS))); if (d < 120 && !st.tiles.has(tx * 100003 + tz)) tilesMissingFromMap++; }
      let farNear = 0; const CS = TS * 4; for (const c of st.chunks.values()) { if (!c.far || !c.far.visible) continue; const d = Math.hypot(Math.max(c.x0 - x, 0, x - (c.x0 + CS)), Math.max(c.z0 - z, 0, z - (c.z0 + CS))); if (d < 70) farNear++; }
      // drawn vs physics heights on a 10 m grid within 70 m
      const rc = new T.Raycaster(); rc.far = 400; const root = G.city.root; const dn = new T.Vector3(0, -1, 0); let bad = 0, n = 0; const badPts = [];
      for (let dx = -70; dx <= 70; dx += 10) for (let dz = -70; dz <= 70; dz += 10) { if (dx * dx + dz * dz > 4900) continue; const px = x + dx, pz = z + dz;
        rc.set(new T.Vector3(px, 300, pz), dn); const hits = rc.intersectObject(root, true).filter((h) => h.object.visible && h.object.layers.test(G.camera.layers) && !(h.object.material?.transparent));
        const dh = hits.length ? hits[0].point.y : null;
        const hit = W.castRay(new R.Ray({ x: px, y: 300, z: pz }, { x: 0, y: -1, z: 0 }), 400, true); const ph = hit ? 300 - hit.timeOfImpact : null;
        if (dh === null) continue; n++;
        if (ph === null || dh - ph > 1.5) { bad++; const o = hits[0].object; const nm = []; for (let q = o; q && q !== root && nm.length < 4; q = q.parent) nm.push((q.name || q.type) + (q.isInstancedMesh ? '[i]' : '')); const mt = Array.isArray(o.material) ? 'multi' : (o.material?.name || o.material?.type);
          (window.__badNames ||= {})[nm.join('<') + ' | ' + mt] = ((window.__badNames || {})[nm.join('<') + ' | ' + mt] || 0) + 1;
          if (badPts.length < 6) badPts.push([Math.round(px), Math.round(pz), +dh.toFixed(1), ph === null ? null : +ph.toFixed(1), nm.join('<').slice(0, 60) + ' | ' + mt]); } }
      await new Promise((r) => setTimeout(r, 3000));
      const gy = G.city.groundHeightAt?.(P.position.x, P.position.z) ?? 0; const fell = P.position.y < gy - 2;
      return { hold: G.lastTeleportHold || null, fellDuring, minDy: +minDy.toFixed(2), ready: ok, waited, noNear, noCol, tilesMissingFromMap, farDrawnWithin70: farNear, heightMismatch: bad, gridPts: n, badPts, fell, py: +P.position.y.toFixed(1), gy: +gy.toFixed(1), miss: miss.slice(0, 6), pending: st.pending() };
    }; return 1; })()`);
  for (let r = 0; r < +(o.rounds || 2); r++)
    for (const [id, x, z] of SPOTS) {
      await b.eval('(game.lastTeleportHold = null, 1)');
      const res = JSON.parse(
        await b.eval(
          `window.__tele(${x ?? 'window.__sp[0]'}, ${z ?? 'window.__sp[1]'}).then(JSON.stringify)`,
          60000,
        ),
      );
      rep.spots.push({ id, round: r, ...res });
      console.log(id.padEnd(9), JSON.stringify(res));
    }
  rep.badNames = JSON.parse(
    await b.eval(
      'JSON.stringify(Object.entries(window.__badNames || {}).sort((a, b) => b[1] - a[1]).slice(0, 30))',
    ),
  );
  console.log('drawn-above-physics by object:');
  for (const r of rep.badNames) console.log('   ', JSON.stringify(r));
  rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 10);
  if (rep.errors.length) console.log('ERRORS', rep.errors.map((e) => e.slice(0, 200)).join('\n'));
});
const S = rep.spots,
  sum = (k) =>
    S.reduce((s2, x) => s2 + (typeof x[k] === 'boolean' ? (x[k] ? 1 : 0) : x[k] || 0), 0);
rep.summary = {
  fellDuring: sum('fellDuring'),
  spots: S.length,
  notReady: S.filter((x) => !x.ready).length,
  noNear: sum('noNear'),
  noCol: sum('noCol'),
  missingFromMap: sum('tilesMissingFromMap'),
  farDrawnWithin70: sum('farDrawnWithin70'),
  heightMismatch: sum('heightMismatch'),
  fell: sum('fell'),
  avgWaitMs: Math.round(sum('waited') / Math.max(1, S.length)),
};
console.log('SUMMARY', JSON.stringify(rep.summary));
fs.writeFileSync(`docs/v2/reports/r2-perf-${SET}.json`, JSON.stringify(rep, null, 1));

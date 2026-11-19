// r2-physics collider audit: walks the player to each spot, takes a normal shot and the same shot with the collider overlay
// (src/vehicles/physics/overlay.js), and runs the mesh-vs-collider ray sweep (tools/v2/physics/auditPage.js).
//   node tools/v2/physics/colaudit.mjs [--spots downtown,nico,rural,beach] [--grid 3] [--dirs 24] [--tag x]
// Output: docs/v2/shots/r2-physics/colliders/<spot>_<view>_{scene,overlay}.jpg, docs/v2/reports/physics-colaudit[-tag].json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
// spots: player position + camera views (eye offset from the player, look offset)
const SPOTS = {
  downtown: {
    p: [407, -110],
    sidewalk: true,
    views: [
      { n: 'street', auto: 1 },
      { n: 'walk', auto: 2, dist: 6, h: 1.8 },
    ],
  },
  nico: {
    nico: true,
    views: [
      { n: 'yard', eye: [-14, 3.2, 26], look: [-12, 0.6, 6] },
      { n: 'street', eye: [6, 3.0, 34], look: [-20, 0.5, 22] },
    ],
  },
  rural: {
    p: [-1112, 3540],
    sidewalk: true,
    views: [
      { n: 'road', auto: 1 },
      { n: 'verge', auto: 2, dist: 6, h: 1.8 },
    ],
  },
  beach: {
    p: [2380, 640],
    views: [
      { n: 'beach', auto: 1 },
      { n: 'sand', auto: 2, dist: 6, h: 1.8 },
    ],
  },
};
const want = String(o.spots || 'downtown,nico,rural,beach').split(',');
const OUT = 'docs/v2/shots/r2-physics/colliders';
fs.mkdirSync(OUT, { recursive: true });
const report = { spots: {}, errors: [] };
await withBrowser({ width: 1280, height: 720, maxSeconds: 1700 }, async (b) => {
  await b.goto(`http://127.0.0.1:5200/?mute${o.q || ''}`);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; return 1; })()`);
  await b.eval(fs.readFileSync('tools/v2/physics/auditPage.js', 'utf8'));
  for (const name of want) {
    const S = SPOTS[name];
    if (!S) continue;
    // player position (Nico's: in the house frame, front yard)
    if (S.nico) {
      await b.eval(`(() => { const P = game.player.position; return 1; })()`);
      try {
        await b.waitFor('game.nicoHouse && game.nicoHouse.toWorld', 240);
      } catch (e) {
        console.log('nico house not loaded: skipped');
        continue;
      }
    }
    const pos = JSON.parse(
      await b.eval(
        `(() => { ${S.nico ? `const NH = game.nicoHouse; const w = NH.toWorld(new game.THREE.Vector3(-12, 0, 14)); const h0 = NH.spot?.heading || 0; return JSON.stringify({ x: w.x, z: w.z, h0 });` : `return JSON.stringify({ x: ${S.p[0]}, z: ${S.p[1]}, h0: 0 });`} })()`,
      ),
    );
    if (S.sidewalk)
      Object.assign(
        pos,
        JSON.parse(
          await b.eval(`(() => { const G = game.city.roadGraph, r = G.nearestEdge(${pos.x}, ${pos.z}, {}, 200); if (!r) return JSON.stringify({});
      const nx = -r.dir.z, nz = r.dir.x, o = (r.edge.width || 7) / 2 + 2.2; return JSON.stringify({ x: r.point.x + nx * o, z: r.point.z + nz * o }); })()`),
        ),
      );
    await b.eval(`(() => { game.teleport(${pos.x}, undefined, ${pos.z}); return 1; })()`);
    await b.sleep(9000);
    for (let k = 0; k < 2; k++) {
      await b.key('Enter', true, 'Enter');
      await b.key('Enter', false, 'Enter');
      await b.sleep(800);
    } // skip the district intro card
    await b.sleep(5000);
    const sp = (report.spots[name] = { pos, views: [], sweep: null });
    for (const V of S.views) {
      // eye / look offsets are in the spot frame (Nico's: house frame rotated by its heading); V.auto: the k-th clear direction
      // around the player (a 10 m line of sight from the player's chest to the eye, so the camera never sits inside a building)
      await b.eval(`(() => { const c = Math.cos(${pos.h0}), s = Math.sin(${pos.h0}); const rot = (x, z) => [x * c + z * s, -x * s + z * c];
        const P = game.player.position, R = game.RAPIER, W = game.world, QF = R.QueryFilterFlags;
        const gy = (() => { const h = W.castRay(new R.Ray({ x: P.x, y: P.y + 2, z: P.z }, { x: 0, y: -1, z: 0 }), 6, true, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS); return h ? P.y + 2 - (h.timeOfImpact ?? h.toi) : P.y; })();
        let ex, ey, ez, lx, ly, lz;
        if (${!!V.auto}) { const found = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), D = ${V.dist || 9}, H = ${V.h || 3.6};
            const d = new R.Vector3(dx * D, H - 1.4, dz * D), L = Math.hypot(d.x, d.y, d.z); const h = W.castRay(new R.Ray({ x: P.x, y: gy + 1.4, z: P.z }, { x: d.x / L, y: d.y / L, z: d.z / L }), L + 1.5, true, QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS); if (!h) found.push([dx * D, H, dz * D]); }
          const pick = found[(${V.auto} - 1) * Math.max(1, Math.floor(found.length / 3)) % Math.max(1, found.length)] || [-7, 3.6, -7]; [ex, ey, ez] = [pick[0], pick[1], pick[2]]; [lx, ly, lz] = [-pick[0] * 0.25, 0.7, -pick[2] * 0.25]; }
        else { [ex, ez] = rot(${V.eye ? V.eye[0] : 0}, ${V.eye ? V.eye[2] : 0}); [lx, lz] = rot(${V.look ? V.look[0] : 0}, ${V.look ? V.look[2] : 0}); ey = ${V.eye ? V.eye[1] : 3}; ly = ${V.look ? V.look[1] : 0.6}; }
        game.cameraOverride = (dt, cam) => { cam.position.set(P.x + ex, gy + ey, P.z + ez); cam.lookAt(P.x + lx, gy + ly, P.z + lz); if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
      await b.sleep(2500);
      await b.eval(`(() => { game.physics.colliderOverlay.enable(false); return 1; })()`);
      await b.sleep(600);
      await b.screenshot(`${OUT}/${name}_${V.n}_scene.jpg`, { quality: 90 });
      await b.eval(
        `(() => { game.physics.colliderOverlay.enable(true, { radius: 45 }); return 1; })()`,
      );
      await b.sleep(2500);
      await b.screenshot(`${OUT}/${name}_${V.n}_overlay.jpg`, { quality: 90 });
      sp.views.push({
        n: V.n,
        stats: JSON.parse(await b.eval('JSON.stringify(game.physics.colliderOverlay.stats())')),
      });
      await b.eval(`(() => { game.physics.colliderOverlay.enable(false); return 1; })()`);
    }
    if (!o.noSweep) {
      const t0 = Date.now();
      const r = JSON.parse(
        await b.eval(
          `JSON.stringify((() => { const P = game.player.position; const r = __colAudit.sweep(P.x, P.z, { grid: ${+(o.grid || 3)}, step: 8, dirs: ${+(o.dirs || 24)}, range: 12 }); r.walkThrough = __colAudit.cluster(r.walkThrough); r.invisible = __colAudit.cluster(r.invisible); return r; })())`,
          600000,
        ),
      );
      r.ms = Date.now() - t0;
      sp.sweep = r;
      console.log(
        name,
        'cands',
        r.cands,
        'points',
        r.points,
        'inside',
        r.insideSkipped,
        'meshHits',
        r.meshHits,
        'colHits',
        r.colHits,
        'both',
        r.bothHits,
        'rays',
        r.rays,
        'ok',
        r.ok,
        'walk-through',
        r.walkThrough.length,
        'invisible',
        r.invisible.length,
        r.ms + ' ms',
      );
      for (const f of r.walkThrough.slice(0, 8)) console.log('  WT', JSON.stringify(f));
      for (const f of r.invisible.slice(0, 8)) console.log('  INV', JSON.stringify(f));
    }
    // parked cars around the spot: none may stand on a fence / prop / another car (tilt > 5 deg or lifted > 0.15 m above the ground)
    sp.parked = JSON.parse(
      await b.eval(`JSON.stringify((() => { const out = [], P = game.player.position;
      for (const v of game.vehicles.list) { if (v.ai || v.playerDriven || !v.body) continue; const t = v.body.translation(); if (Math.hypot(t.x - P.x, t.z - P.z) > 250) continue;
        const r = v.body.rotation(), uy = 1 - 2 * (r.x * r.x + r.z * r.z), tilt = Math.acos(Math.max(-1, Math.min(1, uy))) * 57.3; const g = game.physics.groundAt?.(t.x, t.z, t.y - v.groundOff);
        out.push({ key: v.typeKey, x: +t.x.toFixed(1), z: +t.z.toFixed(1), tilt: +tilt.toFixed(1), lifted: g == null ? null : +((t.y - v.groundOff) - g).toFixed(2), frozen: !!v.frozen }); }
      return { cars: out, bad: out.filter((c) => c.tilt > 5 || (c.lifted ?? 0) > 0.15), log: game.physics.parkLog || [] }; })())`),
    );
    console.log(
      name,
      'parked',
      sp.parked.cars.length,
      'bad',
      JSON.stringify(sp.parked.bad),
      'watch-log',
      JSON.stringify(sp.parked.log.slice(0, 6)),
    );
    await b.eval(`(() => { game.cameraOverride = null; return 1; })()`);
    fs.writeFileSync(
      `docs/v2/reports/physics-colaudit${o.tag ? '-' + o.tag : ''}.json`,
      JSON.stringify(report, null, 1),
    ); // partial results survive a crash
  }
  report.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 20);
  if (report.errors.length) console.log('ERRORS', report.errors);
});
fs.writeFileSync(
  `docs/v2/reports/physics-colaudit${o.tag ? '-' + o.tag : ''}.json`,
  JSON.stringify(report, null, 1),
);
console.log('saved');

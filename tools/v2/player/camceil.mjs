#!/usr/bin/env node
// Indoor camera ceiling probe (PLAYER helper): Nico at points inside his house, mouse pitch pushed up (camera high,
// looking down) at 4 yaws; per pose: is the camera behind a surface seen from his head (through the ceiling / a wall),
// and its clearance under the ceiling. Shots of the worst poses.
//   node tools/v2/player/camceil.mjs --set c0 [--q 'x=1'] -> docs/v2/shots/player/camceil/<set>_*.jpg + <set>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'c';
const DIR = path.resolve('docs/v2/shots/player/camceil'); fs.mkdirSync(DIR, { recursive: true });
await withBrowser({ width: 960, height: 540, maxSeconds: 260 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q ? '&' + o.q : ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function' && game.nicoHouse", 200);
  await startGame(b);
  const pts = JSON.parse(await b.eval(`JSON.stringify(Object.entries(game.nicoHouse.anchors).filter(([k, v]) => v?.pos && /spawn|bed|wardrobe|couch|sofa|kitchen|fridge|bath|desk|tv|living|hall|door/i.test(k)).map(([k, v]) => [k, v.pos.x, v.pos.y, v.pos.z]))`));
  console.log('points', pts.map((p) => p[0]).join(' '));
  const rows = [];
  for (const [name, x, y, z] of pts.slice(0, +(o.n || 6))) {
    await b.eval(`(() => { game.teleport(${x}, ${y + 0.1}, ${z}, 0); return 1; })()`);
    await b.sleep(900);
    for (const yaw of [0, 1.57, 3.14, 4.71]) {
      await b.eval(`(() => { game.cameraYaw = ${yaw}; game.cameraPitch = 1.2; return 1; })()`);
      await b.sleep(700);
      const r = JSON.parse(await b.eval(`(() => { game.cameraPitch = 1.2; const T = game.THREE, cam = game.camera, P = game.player, g = game.nicoHouse.group;
        const head = new T.Vector3(P.position.x, P.position.y + 1.55, P.position.z), c = cam.getWorldPosition(new T.Vector3());
        const rc = new T.Raycaster(); const d = c.clone().sub(head); const L = d.length(); rc.set(head, d.normalize()); rc.far = L;
        const vis = (h) => h.object.visible && !h.object.isSprite && !h.object.isPoints && !h.object.isLine && !h.object.isSkinnedMesh;
        rc.set(head, new T.Vector3(0, 1, 0)); rc.far = 5; const ce1 = rc.intersectObject(g, true).filter(vis)[0];
        let sc = null; try { const R = game.RAPIER; const hh = game.world.castRay(new R.Ray(head, { x: 0, y: 1, z: 0 }), 5, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC | R.QueryFilterFlags.EXCLUDE_SENSORS); sc = hh ? +hh.timeOfImpact.toFixed(2) : null; } catch (e) { sc = 'err'; }
        rc.set(head, d); rc.far = L; const blk1 = rc.intersectObject(g, true).filter(vis)[0];
        const mats = []; g.traverse((m) => { if (m.isMesh && m.material && !Array.isArray(m.material)) { mats.push([m.material, m.material.side]); m.material.side = T.DoubleSide; } });
        const blk = rc.intersectObject(g, true).filter(vis)[0];
        rc.set(c, new T.Vector3(0, 1, 0)); rc.far = 5; const up = rc.intersectObject(g, true).filter(vis)[0];
        // where is the ceiling above Nico's head (from his head, straight up)
        rc.set(head, new T.Vector3(0, 1, 0)); rc.far = 5; const ce = rc.intersectObject(g, true).filter(vis)[0];
        for (const [m, s] of mats) m.side = s;
        return JSON.stringify({ blocked: blk ? +blk.distance.toFixed(2) : null, blockObj: blk?.object?.name || null, L: +L.toFixed(2), camUp: up ? +up.distance.toFixed(2) : null, ceilAboveHead: ce ? +ce.distance.toFixed(2) : null, ceObj: ce?.object?.name, ceSingle: ce1 ? +ce1.distance.toFixed(2) : null, ceCollider: sc, blkSingle: blk1 ? blk1.object.name : null,
          camY: +(c.y - P.position.y).toFixed(2), near: cam.near, pitchCap: null }); })()`));
      r.name = name; r.yaw = yaw; rows.push(r);
      const bad = r.blocked !== null || (r.camUp !== null && r.camUp < 0.15) || (r.ceilAboveHead !== null && r.camY > r.ceilAboveHead + 1.55);
      if (bad || o.all) await b.screenshot(path.join(DIR, `${SET}_${name}_${Math.round(yaw * 100)}.jpg`), { format: 'jpeg', quality: 80 });
      console.log(bad ? 'BAD ' : 'ok  ', JSON.stringify(r));
    }
  }
  fs.writeFileSync(path.join(DIR, `${SET}.json`), JSON.stringify(rows, null, 1));
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 6));
});

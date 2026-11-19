#!/usr/bin/env node
// r8 hitbox walk tests for Nico's house (SPEC r8: the stairs must be climbable, the walls solid, every doorway walkable).
//   node tools/v2/keys/r8/walk8.mjs [--q "&nh8=1"]
// Each test: teleport the player to a start point (house frame H, y = yard grade + y), turn the camera so W walks along `dir` (H),
// hold W for `secs`, report where the player ended (H) and whether that meets the expectation.
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const F = 3.6;
const TESTS = [
  { id: 'main_stair_up', from: [1.4, 0.3, -2.8], dir: [-1, 0], secs: 7, expect: 'y > 3.9' },
  { id: 'main_stair_down', from: [-7.1, F + 0.1, -2.8], dir: [1, 0], secs: 7, expect: 'y < 1.6' },
  { id: 'lower_deck_stair_up', from: [6.9, 0.3, -2.0], dir: [1, 0], secs: 6, expect: 'y > 3.0' },
  { id: 'front_door_in', from: [-7.2, F + 0.1, -7.0], dir: [1, 0], secs: 3, open: 'door_front', expect: 'x > -5.5' },
  { id: 'hall_to_living', from: [-6.0, F + 0.1, -7.0], dir: [1, 0], secs: 4, open: 'door_front', expect: 'x > -1.5' },
  { id: 'bath_door', from: [-4.6, F + 0.1, -7.0], dir: [0, -1], secs: 2.5, expect: 'z < -8.3' },
  { id: 'bed_door', from: [-4.05, F + 0.1, -7.0], dir: [0, 1], secs: 2.5, expect: 'z > -5.6' },
  { id: 'wall_nw_living', from: [3.0, F + 0.1, -8.0], dir: [0, -1], secs: 3, expect: 'z > -10.45' },
  { id: 'wall_se_bed', from: [-5.0, F + 0.1, -4.8], dir: [0, 1], secs: 3, expect: 'z < -3.5' },
  { id: 'wall_sw_front_window', from: [-5.8, F + 0.1, -5.0], dir: [-1, 0], secs: 3, expect: 'x > -6.6' },
  { id: 'slider_out', from: [5.5, F + 0.1, -5.75], dir: [1, 0], secs: 3, open: 'door_slider', expect: 'x > 6.9' },
  { id: 'upper_to_lower_steps', from: [8.2, F + 0.1, -9.72], dir: [1, 0], secs: 3, expect: 'y < 4.1' },
];
await withBrowser({ width: 960, height: 540, maxSeconds: +(o.max || 600) }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function' && !!game.nicoHouse", 600);
  await startGame(b);
  const res = [];
  for (const t of TESTS) {
    await b.eval(`(() => { const T = game.THREE, NH = game.nicoHouse, P4 = { th: Math.PI / 4 - NH.spot.streetHeading, oz: NH.r4oz };
      const h = NH.spot.streetHeading, c = Math.cos(h), s = Math.sin(h), c2 = Math.cos(P4.th), s2 = Math.sin(P4.th);
      window.__HtoW = (x, z) => { const dx = x, dz = z + 7, xs = dx * c2 + dz * s2, zs = -7 - dx * s2 + dz * c2; return [NH.spot.x + xs * c + (zs + P4.oz) * s, NH.spot.z - xs * s + (zs + P4.oz) * c]; };
      window.__WtoH = (wx, wz) => { const dx = wx - NH.spot.x, dz = wz - NH.spot.z, xs = dx * c - dz * s, zs = dx * s + dz * c - P4.oz, ddz = zs + 7; return [xs * c2 - ddz * s2, -7 + xs * s2 + ddz * c2]; };
      const t = ${JSON.stringify(t)}, [wx, wz] = __HtoW(t.from[0], t.from[2]);
      if (t.open) { const it = NH.house.interact.find((q) => q.id === t.open); if (it && !/Close/.test(typeof it.label === 'function' ? it.label() : '')) it.use({}); }
      game.teleport(wx, NH.group.position.y + t.from[1] + 0.05, wz, 0); game.cameraOverride = null; return 1; })()`);
    await b.sleep(900);
    // aim the camera so that W walks along dir (two correction steps from the camera's real forward)
    for (let k = 0; k < 3; k++) {
      await b.eval(`(() => { const t = ${JSON.stringify(t)}, [ax, az] = __HtoW(t.dir[0], t.dir[1]), [ox, oz] = __HtoW(0, 0), want = Math.atan2(ax - ox, az - oz);
        const d = new game.THREE.Vector3(); game.camera.getWorldDirection(d); const have = Math.atan2(d.x, d.z); game.cameraYaw += ((want - have + 9 * Math.PI) % (2 * Math.PI)) - Math.PI; game.cameraPitch = 0.1; return 1; })()`);
      await b.sleep(250);
    }
    await b.key('KeyW', true);
    await b.sleep(t.secs * 1000);
    await b.key('KeyW', false);
    await b.sleep(400);
    const r = await b.eval(`(() => { const p = game.player.position, [x, z] = __WtoH(p.x, p.z), y = p.y - game.nicoHouse.group.position.y; return { x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) }; })()`);
    const ok = Function('x', 'y', 'z', 'return ' + t.expect)(r.x, r.y, r.z);
    res.push({ id: t.id, end: r, expect: t.expect, ok }); console.log(ok ? 'PASS' : 'FAIL', t.id, JSON.stringify(r), t.expect);
  }
  fs.writeFileSync('docs/v2/shots/nico_r8/walk8.json', JSON.stringify({ when: new Date().toISOString(), res, errors: [...new Set(b.errors)].slice(0, 20) }, null, 1));
  if (b.errors.length) console.log('ERRORS\n' + [...new Set(b.errors)].slice(0, 20).join('\n'));
});

#!/usr/bin/env node
// r8 bin test (SPEC: bins tip and roll, no block explosion): kick each dynamic bin with an impulse like a car bumper, report tilt/travel/spill.
//   node tools/v2/keys/r8/bins8.mjs
import { withBrowser, GAME_READY, startGame } from '../../browser.mjs';
await withBrowser({ width: 640, height: 360, maxSeconds: 240 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && !!game.nicoHouse && !!game.world", 600);
  await startGame(b);
  await b.eval(`(() => { const p = game.nicoHouse.center || game.nicoHouse.group.position; game.teleport(p.x, p.y + 1, p.z, 0); return 1; })()`);
  await b.sleep(4000);
  const before = await b.eval(`(() => { const out = []; game.scene.traverse((o) => { if (o.name === 'r8bin') out.push([+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)]); }); return out; })()`);
  console.log('bins', before.length, JSON.stringify(before));
  const n = await b.eval(`(() => { let n = 0; const bins = []; game.scene.traverse((o) => { if (o.name === 'r8bin') bins.push(o.position.clone()); });
    game.world.bodies.forEach((bd) => { if (!bd.isDynamic()) return; const t = bd.translation(); if (bins.some((p) => Math.hypot(p.x - t.x, p.z - t.z) < 0.2)) { bd.wakeUp(); const m = bd.mass(); bd.applyImpulseAtPoint({ x: 4 * m, y: 0.5 * m, z: 1.5 * m }, { x: t.x, y: t.y + 0.9, z: t.z }, true); n++; } }); return n; })()`);
  console.log('kicked', n);
  await b.sleep(5000);
  const after = await b.eval(`(() => { const out = []; game.scene.traverse((o) => { if (o.name === 'r8bin') { const up = new game.THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion); out.push({ p: [+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)], upY: +up.y.toFixed(2) }); } });
    let spills = 0; game.scene.traverse((o) => { if (o.name === 'r8binSpill') spills++; }); return { out, spills }; })()`);
  for (let i = 0; i < after.out.length; i++) { const a = after.out[i], p = before[i]; console.log('bin', i, 'moved', Math.hypot(a.p[0] - p[0], a.p[2] - p[2]).toFixed(2), 'm, up.y', a.upY); }
  console.log('spills', after.spills, 'errors', JSON.stringify([...new Set(b.errors)].slice(0, 10)));
});

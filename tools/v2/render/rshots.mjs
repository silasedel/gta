#!/usr/bin/env node
// Render-track screenshots (Nov 18): fixed views around the spawn / Nico's house at a given hour, HUD hidden.
//   node tools/v2/render/rshots.mjs --tag after [--hour 21] [--views a,b] [--q "&lightfade=0"] [--eval "js"]
// Views: [eye offset from the player (x, y, z) in the player's heading frame (right, up, forward), look offset]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const TAG = o.tag || 'run', D = 'docs/v2/shots/render';
fs.mkdirSync(D, { recursive: true });
const VIEWS = {
  back: [[0, 2.2, -4.5], [0, 1.2, 8]],
  down: [[0, 9, -6], [0, 0, 6]],
  left: [[-3, 1.8, 0], [-14, 0.8, 6]],
  right: [[3, 1.8, 0], [14, 0.8, 6]],
  rear: [[0, 2, 4], [0, 1, -10]],
  sea: [[0, 3, 0], [0, 0, -30]],
  shoreA: [[0, 2.5, 0], [-12, -0.5, -14]],
  shoreB: [[0, 2.5, 0], [12, -0.5, -14]],
  shoreC: [[0, 6, 0], [0, -1, -22]],
  edge: [[0, 1.6, -5], [0, -0.3, -14]],
  edgeL: [[-3, 1.4, -6], [-8, -0.3, -13]],
};
const views = (o.views || 'back,down,left,right,rear').split(',');
await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 700) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${+(o.hour || 11)}; game.lookAEInstant = true;
    const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st);
    ${o.tp ? `game.teleport(${o.tp});` : ''} return 1; })()`);
  await b.sleep(+(o.warm || 14) * 1000);
  if (o.eval) console.log('EVAL', await b.eval(o.eval));
  // --pole: views around the nearest street-lamp pole (instanced mesh with the city's metal material) to the player
  if (o.pole) {
    const pole = await b.eval(`(() => { const M = game.city?.materials?.metal; const P = game.player.position; let best = null, bd = 1e9; const m4 = new game.THREE.Matrix4(), v = new game.THREE.Vector3();
      game.scene.traverse((o) => { if (!o.isInstancedMesh || o.material !== M) return; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); const d = v.distanceTo(P); if (d < bd) { bd = d; best = v.toArray(); } } });
      return JSON.stringify(best); })()`);
    console.log('pole', pole);
    const q = JSON.parse(pole || 'null');
    if (q) { VIEWS.pole1 = { abs: [[q[0] + 3.5, q[1] + 1.7, q[2] + 2], [q[0], q[1] + 2.5, q[2]]] }; VIEWS.pole2 = { abs: [[q[0] - 4, q[1] + 2.5, q[2] - 3], [q[0], q[1] + 2, q[2]]] }; VIEWS.pole3 = { abs: [[q[0] + 1, q[1] + 6, q[2] - 5], [q[0], q[1] + 0.5, q[2]]] }; views.push('pole1', 'pole2', 'pole3'); }
  }
  // --shore: views of the nearest shoreline (march out from the player until city.isWater; camera inland looking at it)
  if (o.shore) {
    const sh = await b.eval(`(() => { const P = game.player.position, W = game.city.isWater; let best = null;
      for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); for (let d = 2; d < 120; d += 1) { if (W(P.x + dx * d, P.z + dz * d)) { if (!best || d < best.d) best = { d, x: P.x + dx * d, z: P.z + dz * d, dx, dz }; break; } } }
      if (!best) return 'null'; const gy = game.city.groundHeightAt?.(best.x - best.dx * 8, best.z - best.dz * 8) ?? 0;
      return JSON.stringify({ e: [best.x - best.dx * 7, gy + 2.2, best.z - best.dz * 7], l: [best.x + best.dx * 4, -0.3, best.z + best.dz * 4], e2: [best.x - best.dx * 3 - best.dz * 5, gy + 1.5, best.z - best.dz * 3 + best.dx * 5], l2: [best.x + best.dz * 3, -0.2, best.z - best.dx * 3], e3: [best.x - best.dx * 14, gy + 7, best.z - best.dz * 14] }); })()`);
    console.log('shore', sh); const S = JSON.parse(sh);
    if (S) { VIEWS.sh1 = { abs: [S.e, S.l] }; VIEWS.sh2 = { abs: [S.e2, S.l2] }; VIEWS.sh3 = { abs: [S.e3, S.l] }; views.push('sh1', 'sh2', 'sh3'); }
  }
  for (const v of views) {
    const V = VIEWS[v]; if (!V) continue;
    if (V.abs) { await b.eval(`(() => { const E = ${JSON.stringify(V.abs[0])}, L = ${JSON.stringify(V.abs[1])}; game.cameraOverride = (dt, c) => { c.position.fromArray(E); c.lookAt(L[0], L[1], L[2]); return true; }; return 1; })()`); await b.sleep(3500); console.log('SHOT', await b.screenshot(`${D}/rs_${TAG}_${v}.jpg`, { format: 'jpeg', quality: 85 })); continue; }
    await b.eval(`(() => { const P = game.player.position.clone(), h = game.player.heading || 0, f = [Math.sin(h), Math.cos(h)], r = [-Math.cos(h), Math.sin(h)];
      const at = (q) => [P.x + r[0] * q[0] + f[0] * q[2], P.y + q[1], P.z + r[1] * q[0] + f[1] * q[2]];
      const E = at(${JSON.stringify(V[0])}), L = at(${JSON.stringify(V[1])});
      game.cameraOverride = (dt, c) => { c.position.fromArray(E); c.lookAt(L[0], L[1], L[2]); return true; }; return 1; })()`);
    await b.sleep(3500);
    console.log('SHOT', await b.screenshot(`${D}/rs_${TAG}_${v}.jpg`, { format: 'jpeg', quality: 85 }));
  }
  if (o.after) console.log('AFTER', await b.eval(o.after));
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 10).join('\n'));
});

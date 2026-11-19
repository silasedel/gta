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

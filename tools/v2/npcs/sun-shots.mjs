#!/usr/bin/env node
// Sunbathers on towels, close-ups. node tools/v2/npcs/sun-shots.mjs --set t1 [--at 2332,-660]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 't'; const AT = String(o.at || '2332,-660').split(',').map(Number);
const D = 'docs/v2/shots/people/r2sun'; fs.mkdirSync(D, { recursive: true });
await withBrowser({ width: 1280, height: 800, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${Number(o.tod || 13)}; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`);
  await b.sleep(8000);
  console.log('sand', await b.eval(`(() => { const pp = game.player.position; const q = game.peds._nav.sandPoint?.(pp, 400, true) || game.peds._nav.sandPoint?.(pp, 400); if (!q) return 'none'; game.teleport(q.x, undefined, q.z, 0); return [q.x | 0, q.z | 0, game.city.zoneAt(q.x, q.z)].join(','); })()`));
  await b.sleep(50000);
  const r = await b.eval(`JSON.stringify((() => { const pp = game.player.position; const L = game.peds.list.filter((p) => p.active && p.state === 'sunbathe' && p.towel); L.sort((x, y) => x.pos.distanceTo(pp) - y.pos.distanceTo(pp)); window.__sun = L.slice(0, 3); return window.__sun.map((p) => [p.char?.npcArch, p.idleStyle, p._rest, p.pos.distanceTo(pp) | 0]); })())`);
  console.log('sun', r);
  const n = JSON.parse(r).length;
  for (let i = 0; i < n; i++) {
    await b.eval(`(() => { const p = window.__sun[${i}]; const T = game.player.position.constructor; game.cameraOverride = (dt, cam) => { const t = p.towel.position, h = p.heading;
      cam.position.set(t.x + Math.sin(h + 1.2) * 2.4, t.y + 1.1, t.z + Math.cos(h + 1.2) * 2.4); cam.lookAt(t.x, t.y + 0.1, t.z); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
    await b.sleep(900); await b.screenshot(`${D}/${SET}_${i}.png`);
  }
  const errs = [...new Set(b.errors)].filter((e) => !/favicon|PortSolanaOcean/.test(e));
  console.log('errors', JSON.stringify(errs.slice(0, 8)));
});

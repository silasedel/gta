#!/usr/bin/env node
// r3-people beach check: sunny beach -> repeated people within 40 m among the beach crowd, loungers, lifeguard post
// position vs the hut rule; then instant rain -> loungers / sunbathers after 25 s. node tools/v2/npcs/r3-beach.mjs [--at 2332,-660]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const AT = String(o.at || '2332,-660').split(',').map(Number); const D = 'docs/v2/shots/people/r3';
await withBrowser({ width: 1280, height: 800, maxSeconds: 700 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 13; game.weather?.set?.('clear', { instant: true }); game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`);
  await b.sleep(8000);
  console.log('sand', await b.eval(`(() => { const pp = game.player.position; let q = game.peds._nav.sandPoint?.(pp, 400, true) || game.peds._nav.sandPoint?.(pp, 400);
    if (!q) { const C = game.city; outer: for (let r = 100; r < 3000; r += 100) for (let k = 0; k < 48; k++) { const a = k / 48 * 6.283, x = pp.x + Math.sin(a) * r, z = pp.z + Math.cos(a) * r; if (C.zoneAt(x, z) === 'beach' && !C.isWater(x, z) && C.surfaceAt(x, z) === 'sand') { q = { x, z }; break outer; } } }
    if (!q) return 'none'; game.teleport(q.x, undefined, q.z, 0); return [q.x | 0, q.z | 0, game.city.districtAt(q.x, q.z)].join(','); })()`));
  await b.sleep(35000);
  const M = `JSON.stringify((() => { const C = game.people.crowd.impl; const W = game.people._walkers || null;
    const ids = []; const near = (game.peds.list || []).filter((p) => p.active && p.char?.npcArch).map((p) => [p.char.npcArch, p.pos.x, p.pos.z, p.state]);
    let dupNear = 0; for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) if (near[i][0] === near[j][0] && Math.hypot(near[i][1] - near[j][1], near[i][2] - near[j][2]) < 40) dupNear++;
    const sun = near.filter((p) => p[3] === 'sunbathe').length, swim = near.filter((p) => p[3] === 'swim').length;
    const posts = (game.npc?.cast?.posts || []).map((p) => [p.kind, p.x | 0, p.z | 0]);
    const cp = game.people.crowd.persons?.() || []; let dupCrowd = 0; for (let i = 0; i < cp.length; i++) for (let j = i + 1; j < cp.length; j++) if (cp[i][0] && cp[i][0] === cp[j][0] && Math.hypot(cp[i][1] - cp[j][1], cp[i][2] - cp[j][2]) < 40) dupCrowd++;
    const lounge = cp.filter((x) => x[3] && !x[4]).length;
    return { dupCrowd, lounge, near: near.length, dupNear, sun, swim, crowd: game.people.crowd.count, rain: game.weather?.rain, posts }; })())`;
  console.log('sunny', await b.eval(M));
  await b.screenshot(`${D}/beach_sunny.jpg`);
  await b.eval(`(() => { game.weather?.set?.('rain', { instant: true }); return game.weather?.rain; })()`);
  await b.sleep(25000);
  console.log('rain', await b.eval(M));
  await b.screenshot(`${D}/beach_rain.jpg`);
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 10).join('\n'));
});

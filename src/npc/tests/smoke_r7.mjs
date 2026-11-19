// r7: a person smoking (arch clip 'smoke' + cigarette prop), close shot.  node src/npc/tests/smoke_r7.mjs
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
  const E = async (js) => { const s = await b.eval(`(async()=>{ try { return JSON.stringify(await (async()=>{ ${js} })()); } catch (e) { return JSON.stringify({ err: String(e && e.stack || e) }); } })()`); try { return JSON.parse(s); } catch (e) { return s; } };
  await b.goto('http://127.0.0.1:5200/?mute'); await b.waitFor(GAME_READY, 200);
  await b.eval(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); 1`); await b.waitFor(GAME_READY, 200); await wait(2);
  await E(`game.timeExternal = true; game.timeOfDay = 13; game.teleport(407, undefined, -110, 0.4); return 1;`); await wait(25);
  console.log('pick', JSON.stringify(await E(`const N = game.peds._nav, pp = game.player.position; let ps = [];
    for (let i = 0; i < 14 && !ps.length; i++) { const q = N.sidewalkNear(pp, 12 + i * 2); if (!q) continue; ps = game.peds._crowd({ x: q.x, y: q.y, z: q.z }, N.zoneAt(q.x, q.z), 2); }
    await new Promise((r) => setTimeout(r, 4000)); const g = [...game.peds.groups].find((g) => g.talk && g.members.length); const best = g?.members[0]; if (!best) return null;
    window.__sp = best; best.group = null; best.state = 'talk'; best.stateT = 90; best.idleStyle = 'smoke'; best.styleT = 999; return [best.char?.personMeta?.name];`)));
  for (const t of [1.2, 2.2]) {
    await wait(t);
    await E(`const p = window.__sp; p.idleStyle = 'smoke'; p.styleT = 999; const h = p.heading; game.cameraOverride = (dt, cam) => { cam.position.set(p.pos.x + Math.sin(h) * 1.6 + Math.cos(h) * 0.4, p.pos.y + 1.55, p.pos.z + Math.cos(h) * 1.6 - Math.sin(h) * 0.4); cam.lookAt(p.pos.x, p.pos.y + 1.3, p.pos.z); cam.fov = 45; cam.updateProjectionMatrix(); return true; }; game.player.position.x += 0; return 1;`);
    await wait(1); await b.screenshot(`docs/v2/shots/people-groups/smoke_${t}.png`);
  }
  if (b.errors.length) console.log('ERR', JSON.stringify(b.errors.slice(0, 3)).slice(0, 800));
});

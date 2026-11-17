#!/usr/bin/env node
// Crowd uniqueness debug: who spawned whom, twins, shared character objects.
//   node tools/v2/npcs/crowd-debug.mjs [--at 407,-110] [--wait 30]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const AT = String(o.at || '407,-110').split(',').map(Number);
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { window.__log = []; const cp = game.npc.createPed; game.npc.createPed = (op) => { const c = cp(op); window.__log.push([performance.now() | 0, op.zone, op.act, op.pos ? [op.pos.x | 0, op.pos.z | 0] : null, c ? (c.npcArch || '?') : null, c?.human?.person ? 1 : 0]); return c; }; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`);
  await b.sleep(+(o.wait || 30) * 1000);
  const r = await b.eval(`JSON.stringify((() => {
    const L = game.peds.list.filter((p) => p.active && p.char);
    const objs = new Map(); for (const p of L) objs.set(p.char, (objs.get(p.char) || 0) + 1);
    const shared = [...objs.values()].filter((n) => n > 1).length;
    const ids = {}; for (const p of L) { const k = p.char.npcArch || 'legacy'; (ids[k] ||= []).push([p.pos.x | 0, p.pos.z | 0, p.char.root.visible ? 'v' : 'h', p.char.root.parent ? 's' : '-']); }
    const twins = Object.fromEntries(Object.entries(ids).filter(([k, v]) => v.length > 1));
    const live = [...game.npc.cast.live].map((c) => [c.npcArch, c.root.position.x | 0, c.root.position.z | 0, c.root.visible ? 'v' : 'h', c.root.parent ? 's' : '-']);
    return { active: L.length, sharedCharObjects: shared, twins, live, log: window.__log.slice(-60), stats: game.npc.peopleStats() };
  })())`);
  console.log(JSON.stringify(JSON.parse(r), null, 0).replace(/\],\[/g, '],\n['));
});

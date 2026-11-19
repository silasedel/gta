#!/usr/bin/env node
// Seated people check (furniture): a hotel lobby, a bar and street benches; close-ups of seated people with their pose
// variant and probe. node tools/v2/npcs/sit-shots.mjs --set s1 [--kinds lobby,bar] [--at 2398,660]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 's';
const AT = String(o.at || '2398,660')
  .split(',')
  .map(Number);
const D = 'docs/v2/shots/people/r2sit';
fs.mkdirSync(D, { recursive: true });
const SHOOT = (
  tag,
  n,
) => `(() => { const B = game.peds.list.filter((p) => p.active && p.state === 'bench'); console.log('[sit] bench', B.length, 'furn', B.filter((p) => p._furn).length, 'ok', B.filter((p) => p._furn?.ok).length); const L = game.peds.list.filter((p) => p.active && p.state === 'bench' && p._furn?.ok && p.char?.root?.visible !== false);
  const pp = game.player.position; L.sort((x, y) => ((y._furn.pr?.armL || y._furn.pr?.armR) ? 1 : 0) - ((x._furn.pr?.armL || x._furn.pr?.armR) ? 1 : 0) || x.pos.distanceTo(pp) - y.pos.distanceTo(pp)); const seen = new Set(); const pick = [];
  for (const p of L) { if (seen.has(p._furn.v) && pick.length < 2) continue; seen.add(p._furn.v); pick.push(p); if (pick.length >= ${n}) break; }
  window.__sit = pick; return JSON.stringify(pick.map((p) => [p.char.npcArch, p._furn.v, p.char._seat?.anchor?.hip?.y?.toFixed(2), p.pos.distanceTo(pp) | 0, p._furn.floor, ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'Neck'].map((n) => { const v = p.char.getBone(n).getWorldPosition(new (pp.constructor)()); const h = p.char.root.rotation.y; const dx = v.x - p.pos.x, dz = v.z - p.pos.z; return [n, +(v.y - p._furn.floor).toFixed(2), +(dx * Math.sin(h) + dz * Math.cos(h)).toFixed(2)]; }), p.char._seat?.anchor?.heel && +(p.char._seat.anchor.heel.y).toFixed(2), p.state, p.char._seat?.manual, p._furn.pr?.flip])); })()`;
await withBrowser({ width: 1280, height: 800, maxSeconds: 1300 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 13; return 1; })()`,
  );
  const shots = [];
  const shoot = async (tag, n) => {
    const dbg = await b.eval(
      `(async () => { const m = await import('/src/npc/furnitureSeat.js'); const B = game.peds.list.filter((p) => p.active && p.state === 'bench'); return JSON.stringify({ n: B.length, furn: B.filter((p) => p._furn).length, ok: B.filter((p) => p._furn?.ok).length, last: m.DEBUG.last && { meshes: m.DEBUG.last.meshes, res: m.DEBUG.last.res, prof: (m.DEBUG.last.prof || []).map(([t, h]) => [+t.toFixed(2), h === null ? null : +h.toFixed(2)]) } }); })()`,
    );
    console.log(tag, 'dbg', dbg);
    const r = await b.eval(SHOOT(tag, n));
    console.log(tag, r);
    const k = JSON.parse(r).length;
    for (let i = 0; i < k; i++) {
      await b.eval(`(() => { const p = window.__sit[${i}]; const T = game.player.position.constructor; game.cameraOverride = (dt, cam) => { const h = p.char.root.rotation.y, c = p.char.root.position, hip = p.char.getBone('Hips').getWorldPosition(new T());
        cam.position.set(hip.x + Math.sin(h + 0.3) * 2.0, hip.y + 0.5, hip.z + Math.cos(h + 0.3) * 2.0); cam.lookAt(hip.x, hip.y + 0.15, hip.z); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
      await b.eval(`(() => { const r = game.renderer; return 1; })()`);
      await b.sleep(700);
      const f = `${D}/${SET}_${tag}_${i}.png`;
      await b.screenshot(f);
      shots.push(f);
    }
    await b.eval('(game.cameraOverride = null, 1)');
  };
  for (const kind of String(o.kinds || 'lobby,bar').split(',')) {
    const r =
      await b.eval(`(() => { const L = game.interiorsV2?.list || []; const pp = game.player.position;
      const c = L.filter((s) => JSON.stringify([s.type, s.kind, s.typeName, s.profile?.type, s.profile?.kind, s.name] ).toLowerCase().includes('${kind}'));
      if (!c.length) return 'none of ' + L.length; const s = c[(c.length / 2) | 0]; const w = s.toWorld(0, 0, new (pp.constructor)()); window.__store = s; game.teleport(w.x, undefined, w.z, s.facing || 0); return s.name + ' ' + (w.x | 0) + ',' + (w.z | 0); })()`);
    console.log(kind, r);
    if (/^none/.test(r)) continue;
    await b.sleep(20000);
    await shoot(kind, 3);
  }
  await b.eval(`(() => { game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`);
  await b.sleep(30000);
  await shoot('street', 4);
  const errs = [...new Set(b.errors)].filter((e) => !/favicon|PortSolanaOcean/.test(e));
  console.log('errors', JSON.stringify(errs.slice(0, 8)));
  fs.writeFileSync(`${D}/${SET}_list.json`, JSON.stringify(shots));
});

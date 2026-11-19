// r2-physics: walk the player's capsule into every kind of object near a spot (default Nico's yard) from 4 directions and
// report the ones it passes through. Objects: tile props (game.city.colliderSourceAt: palms, trees, lamps, poles, hydrants,
// bins, mailboxes, sign posts, benches...), vegetation trees and palms (game.vegetation.treesNear), lot props (game.lotProps:
// carts, mailboxes, roll-off). A walk: 2.4 m away, facing the object's base, W held for 2.2 s; "through" = the capsule's center
// came closer to the object's base than 40 % of its radius, or ended up on the far side.
//   node tools/v2/physics/walkaudit.mjs [--at x,z | --nico] [--per 2] [--r 45]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const PER = +(o.per || 2),
  RAD = +(o.r || 45);
const out = { at: o.at || 'nico', results: [], summary: {} };
await withBrowser({ width: 960, height: 540, maxSeconds: 2400 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; return 1; })()`);
  if (o.at) {
    const [x, z] = String(o.at).split(',').map(Number);
    await b.eval(`(() => { game.teleport(${x}, undefined, ${z}); return 1; })()`);
  } else {
    await b.waitFor('game.nicoHouse && game.nicoHouse.toWorld', 300);
    await b.eval(
      `(() => { const w = game.nicoHouse.toWorld(new game.THREE.Vector3(-12, 0, 14)); game.teleport(w.x, undefined, w.z); return 1; })()`,
    );
  }
  await b.sleep(9000);
  for (let k = 0; k < 2; k++) {
    await b.key('Enter', true, 'Enter');
    await b.key('Enter', false, 'Enter');
    await b.sleep(700);
  }
  await b.sleep(6000);
  const targets = JSON.parse(
    await b.eval(`JSON.stringify((() => { const P = game.player.position, out = [], per = {};
    const push = (kind, x, y, z, r) => { if (!Number.isFinite(x) || Math.hypot(x - P.x, z - P.z) > ${RAD}) return; per[kind] = (per[kind] || 0) + 1; if (per[kind] > ${PER}) return; out.push({ kind, x, y, z, r }); };
    const RR = { palm: 0.28, tree: 0.3, lamp: 0.14, upole: 0.15, sigPole: 0.17, hydrant: 0.15, bin: 0.3, mailbox: 0.12, signPost: 0.06, bench: 0.4, meter: 0.07, mast: 0.16, pedPost: 0.08, cabinet: 0.3, cafe: 0.5, kiosk: 0.8, bike: 0.4 };
    try { for (const s of game.city.colliderSourceAt?.(P.x, P.z, ${RAD}) || []) if (s.kind !== 'building' && RR[s.kind] != null) push('tile:' + s.kind, s.x, s.y, s.z, RR[s.kind]); } catch (e) { /* */ }
    try { for (const t of game.vegetation?.treesNear?.(P.x, P.z, ${RAD}) || []) push((t.palm ? 'palm:' : 'tree:') + t.kind, t.x, t.y, t.z, 0.25 * (t.s || 1)); } catch (e) { /* */ }
    try { for (const its of game.lotProps?.owners?.values?.() || []) for (const it of its) push('lot:' + it.name, it.x, it.y, it.z, it.name.startsWith('mailbox') ? 0.12 : it.name === 'rolloff' ? 1.2 : 0.32); } catch (e) { /* */ }
    for (const [x, z] of ${JSON.stringify(
      String(o.targets || '')
        .split(';')
        .filter(Boolean)
        .map((q) => q.split(',').map(Number)),
    )}) { let y = 0; try { y = game.city.groundHeightAt(x, z); } catch (e) { /* */ } out.push({ kind: 'qa:tree', x, y, z, r: 0.3 }); }
    return { out, per }; })())`),
  );
  out.inventory = targets.per;
  console.log('inventory', JSON.stringify(targets.per));
  for (const T of targets.out) {
    let through = 0;
    const dirs = [];
    for (let d = 0; d < 4; d++) {
      const r = JSON.parse(
        await b.eval(`(async () => { const T = ${JSON.stringify(T)}, a = ${d} * Math.PI / 2 + 0.3, D = 2.4 + T.r;
        const px = T.x - Math.sin(a) * D, pz = T.z - Math.cos(a) * D; game.teleport(px, undefined, pz, a); await new Promise((r) => setTimeout(r, 500));
        const P = game.player.position; const s0 = { x: P.x, z: P.z }; window.__walkMin = 1e9; const iv = setInterval(() => { const q = game.player.position; window.__walkMin = Math.min(window.__walkMin, Math.hypot(q.x - T.x, q.z - T.z)); }, 30);
        window.__walk = { iv }; return JSON.stringify({ sx: s0.x, sz: s0.z }); })()`),
      );
      await b.key('KeyW', true, 'w');
      await b.sleep(2200);
      await b.key('KeyW', false, 'w');
      await b.sleep(250);
      const e = JSON.parse(
        await b.eval(`(() => { clearInterval(window.__walk.iv); const T = ${JSON.stringify(T)}, P = game.player.position, a = ${d} * Math.PI / 2 + 0.3;
        const along = (P.x - T.x) * Math.sin(a) + (P.z - T.z) * Math.cos(a); // > 0: past the object's base
        return JSON.stringify({ endDist: +Math.hypot(P.x - T.x, P.z - T.z).toFixed(2), along: +along.toFixed(2), moved: +Math.hypot(P.x - ${r.sx}, P.z - ${r.sz}).toFixed(2) }); })()`),
      );
      e.minD = JSON.parse(await b.eval('JSON.stringify(window.__walkMin ?? null)'));
      const thr = (e.minD ?? e.endDist) < (0.28 + T.r) * 0.55;
      if (thr) through++;
      dirs.push(e);
    }
    const row = { ...T, through, dirs };
    out.results.push(row);
    console.log(
      through ? 'THROUGH' : 'solid  ',
      T.kind,
      `(${T.x.toFixed(1)}, ${T.z.toFixed(1)})`,
      through + '/4',
      JSON.stringify(dirs.map((q) => [q.endDist, +(q.minD ?? 0).toFixed(2)])),
    );
  }
  for (const r of out.results) {
    const s = (out.summary[r.kind] ||= { n: 0, through: 0 });
    s.n++;
    if (r.through) s.through++;
  }
  out.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 8);
});
fs.writeFileSync(
  `docs/v2/reports/physics-walkaudit${o.tag ? '-' + o.tag : ''}.json`,
  JSON.stringify(out, null, 1),
);
console.log('summary', JSON.stringify(out.summary));

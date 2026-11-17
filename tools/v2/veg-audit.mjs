#!/usr/bin/env node
// Greenery placement audit (stage 1): at each spot, after streaming settles, every palm / tree within R m from every source (city tile
// props, countryside streamer, world-dressing fields) is checked against the road graph (trunk inside the carriageway footprint,
// broadleaf crown over the lanes), the sidewalk slab, and map building footprints. Muted, V2 test browser.
//   node tools/v2/veg-audit.mjs --set before|after [--url http://127.0.0.1:5200/] [--r 260]
// Writes docs/v2/reports/stage1-green-audit-<set>.json (counts + up to 40 example positions per violation kind)
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after', R = +(o.r || 260);
const SPOTS = { clewiston: [-1540, -2805], keylargo: [-873.6, 4825.2], downtown: [407, -110], beach: [2332, -660], everglades: [-2386, 2660], homestead: [-1320, 3190], brickell: [0, 1760] };
const AUDIT = (cx, cz) => `(() => {
  const C = game.city, G = C.roadGraph, out = { n: 0, bySrc: {}, road: [], crown: [], sidewalk: [], building: [], counts: { road: 0, crown: 0, sidewalk: 0, building: 0 } };
  const D = game.miamiData, TS = C.streamer?.tileSize || 200, CURB = 0.15;
  const inB = (x, z) => { const t = D?.getTile?.(Math.floor(x / TS), Math.floor(z / TS)); if (!t?.buildings) return false; for (const b of t.buildings) { const r = b.rings?.[0]; if (!r) continue; let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } if (c) return true; } return false; };
  const items = []; const seen = new Set();
  const add = (src, kind, x, z, s, crownR) => { if ((x - ${cx}) ** 2 + (z - ${cz}) ** 2 > ${R * R}) return; const k = Math.round(x * 2) + ',' + Math.round(z * 2) + src; if (seen.has(k)) return; seen.add(k); items.push({ src, kind, x, z, s, crownR }); };
  game.scene.traverse((g) => { const t = g.userData?.tile; if (!t?.props || g.userData._aud) return; g.userData._aud = 1;
    for (const p of t.props.palm || []) if (!p.cs) add('tile', 'palm', p.x, p.z, p.s || 1, 0);
    for (const p of t.props.tree || []) if (!p.cs) add('tile', 'tree:' + p.sp, p.x, p.z, p.s || 1, 3.2 * (p.s || 1)); });
  game.scene.traverse((g) => { if (g.userData) delete g.userData._aud; });
  const cs = game.vegetation?.countryside; if (cs?.treesNear) for (const t of cs.treesNear(${cx}, ${cz}, ${R})) add('countryside', (t.palm ? 'palm:' : 'tree:') + t.kind, t.x, t.z, t.s, t.palm ? 0 : 3.5 * t.s);
  for (const f of (game.vegetation?.stats?.() || [])) void f;
  const nd = {};
  for (const it of items) { out.n++; out.bySrc[it.src] = (out.bySrc[it.src] || 0) + 1;
    const e = G?.nearestEdge?.(it.x, it.z, nd, 40); let gap = e ? e.dist - e.edge.width / 2 : 99; const tn = D?.getTile?.(Math.floor(it.x / TS), Math.floor(it.z / TS))?.nodes || []; for (const n of tn) if (n.degree >= 3 && n.width) gap = Math.min(gap, Math.hypot(n.x - it.x, n.z - it.z) - n.width / 2 - 1.5); /* junction mouth: node disc + curb returns */ const rec = [it.src, it.kind, +it.x.toFixed(1), +it.z.toFixed(1), +gap.toFixed(2)];
    if (gap < 0.3) { out.counts.road++; if (out.road.length < 40) out.road.push(rec); }
    else if (it.crownR && gap < it.crownR - 1.0) { out.counts.crown++; if (out.crown.length < 40) out.crown.push(rec.concat(+it.crownR.toFixed(1))); }
    const gh = D?.groundHeightAt ? D.groundHeightAt(it.x, it.z) : 0; if (Math.abs(gh - CURB) < 0.02 && !/tile/.test(it.src)) { out.counts.sidewalk++; if (out.sidewalk.length < 40) out.sidewalk.push(rec); }
    if (inB(it.x, it.z)) { out.counts.building++; if (out.building.length < 40) out.building.push(rec); } }
  return out; })()`;
const rep = { set: SET, when: new Date().toISOString(), R, spots: {} };
await withBrowser({ width: 1280, height: 720, maxSeconds: 1200 }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  for (const [id, [x, z]] of Object.entries(SPOTS)) {
    await b.eval(`(() => { game.cameraOverride = null; game.teleport(${x}, undefined, ${z}, 0); return 1; })()`);
    await b.sleep(6000);
    for (let i = 0; i < +(o.stream || 60); i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    await b.sleep(2000);
    const r = await b.eval(AUDIT(x, z)); rep.spots[id] = r;
    console.log(id, JSON.stringify({ n: r.n, bySrc: r.bySrc, counts: r.counts }));
  }
  if (b.errors.length) rep.errors = [...new Set(b.errors)].slice(0, 20);
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/stage1-green-audit-${SET}.json`, JSON.stringify(rep, null, 2));

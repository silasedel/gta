#!/usr/bin/env node
// Road-layer z-fight check (W4, Nov 19). Boots the game, picks junctions (spawn area + Brickell / downtown), and at each one
// runs the in-game z-fight scanner (src/render/zfightScan.js via game.zfight) from three cameras:
//   near  : driver eye (1.3 m) 25 m back along a leg, looking at the junction
//   graze : driver eye, 140 m back (grazing angle: where coplanar layers flicker by angle)
//   high  : 45 m up, 220 m back (rooftop / heli view, depth precision at range)
// Only pairs that involve a road / ground layer are kept. Writes docs/v2/reports/road-zfight-<tag>.json.
//   node tools/v2/map3/road_zfight.mjs [--tag before] [--q "&foo=1"] [--n 4] [--at "x,z;x,z" (nearest junction to each)]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const TAG = o.tag || 'run', N = +(o.n || 4), D = 'docs/v2/shots/render';
fs.mkdirSync(D, { recursive: true });
const GROUND = /asphalt|junction|parking|sidewalk|panels|promenade|M\.lines|roadLines|markings|shoulder|dirtRoad|roadDecals|decal|land|grass|sand|terrain|tree-grate|curb|crosswalk|M\.wood/i;
const rep = { tag: TAG, sites: [] };
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 290) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 200);
  await startGame(b, 60);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(st); return 1; })()`);
  await b.eval(fs.readFileSync('tools/v2/render/zfight.page.js', 'utf8'));
  // junction picks: degree >= 3, not elevated, spread out; first near the player, then toward Brickell (~(-300,-900) if present)
  const sites = JSON.parse(await b.eval(`(() => { const G = game.city.roadGraph, P = game.player.position; const deg = new Map();
    for (const e of G.edges) { if (e.elevated) continue; for (const k of [e.a ?? e.from, e.b ?? e.to]) deg.set(k, (deg.get(k) || 0) + 1); }
    const nodes = (G.nodes || []).map((n, i) => ({ id: n.id ?? i, x: n.x ?? n.pos?.x ?? n[0], z: n.z ?? n.pos?.z ?? n[1] })).filter((n) => (deg.get(n.id) || 0) >= 3 && Number.isFinite(n.x));
    const out = []; const far = (n) => out.every((m) => Math.hypot(m.x - n.x, m.z - n.z) > 250);
    nodes.sort((p, q) => Math.hypot(p.x - P.x, p.z - P.z) - Math.hypot(q.x - P.x, q.z - P.z));
    const AT = ${JSON.stringify(o.at ? String(o.at).split(';').map((t) => t.split(',').map(Number)) : null)};
    if (AT) for (const [ax, az] of AT) { let bn = null, bd = 1e9; for (const n of nodes) { const d = Math.hypot(n.x - ax, n.z - az); if (d < bd) { bd = d; bn = n; } } if (bn) out.push(bn); }
    else for (const n of nodes) { if (out.length >= ${N}) break; if (far(n) && Math.hypot(n.x - P.x, n.z - P.z) > 40) out.push(n); }
    for (const e of G.edges) { if (out.length >= ${N}) break; } return JSON.stringify(out.map((n) => { const ed = G.edges.find((e) => !e.elevated && (e.a === n.id || e.b === n.id || e.from === n.id || e.to === n.id));
      let dx = 1, dz = 0; if (ed && ed.pts && ed.pts.length > 1) { const p0 = ed.pts[0], p1 = ed.pts[ed.pts.length - 1]; const s = Math.hypot(p0[0] - n.x, p0[1] - n.z) < Math.hypot(p1[0] - n.x, p1[1] - n.z) ? 1 : -1; const q = s > 0 ? ed.pts[1] : ed.pts[ed.pts.length - 2], r = s > 0 ? ed.pts[0] : ed.pts[ed.pts.length - 1]; const L = Math.hypot(q[0] - r[0], q[1] - r[1]) || 1; dx = (q[0] - r[0]) / L; dz = (q[1] - r[1]) / L; }
      return { ...n, dx, dz }; })); })()`));
  console.log('sites', sites.map((s) => [s.x | 0, s.z | 0]));
  let tot = 0, totG = 0;
  for (const s of sites) {
    await b.eval(`game.teleport(${s.x + s.dx * 30}, null, ${s.z + s.dz * 30}, 0), 1`);
    for (let i = 0; i < 25; i++) { if ((await b.eval('(game.city?.streamer?.pending?.() ?? 0)')) < 2) break; await b.sleep(1000); }
    const site = { at: [s.x | 0, s.z | 0], views: {} };
    for (const [v, dist, h] of [['near', 25, 1.3], ['graze', 140, 1.3], ['high', 220, 45]]) {
      await b.eval(`(() => { const gy = game.city.groundHeightAt?.(${s.x}, ${s.z}) || 0; window.__zfE = [${s.x + s.dx * dist}, gy + ${h}, ${s.z + s.dz * dist}]; window.__zfL = [${s.x}, gy + 0.5, ${s.z}];
        game.cameraOverride = (dt, c) => { c.position.fromArray(window.__zfE); c.lookAt(...window.__zfL); return true; }; return 1; })()`);
      await b.sleep(2500);
      const r = JSON.parse(await b.eval(`window.__zf({ scale: 0.5 }).then((x) => { delete x.overlay; return JSON.stringify(x); })`));
      const pairs = (r.pairs || []).filter((p) => GROUND.test(p.a) || GROUND.test(p.b));
      const g = pairs.reduce((k, p) => k + p.px, 0); tot += r.flagged || 0; totG += g;
      site.views[v] = { flagged: r.flagged, ground: g, pairs: pairs.slice(0, 8).map((p) => `${p.px} ${p.a} <-> ${p.b}`) };
      if (v === 'graze') await b.screenshot(`${D}/rzf_${TAG}_${s.x | 0}_${s.z | 0}.jpg`, { format: 'jpeg', quality: 70 });
      console.log(`[${s.x | 0},${s.z | 0}] ${v}: flagged ${r.flagged}, ground ${g}`); for (const p of pairs.slice(0, 5)) console.log('    ', p.px, p.a, '<->', p.b);
    }
    rep.sites.push(site);
  }
  rep.total = tot; rep.totalGround = totG;
  console.log('TOTAL flagged', tot, 'ground-layer', totG);
  if (b.errors.length) rep.errors = [...new Set(b.errors)].slice(0, 10);
});
fs.writeFileSync(`docs/v2/reports/road-zfight-${TAG}.json`, JSON.stringify(rep, null, 1));

// Probe: what the city API exposes (used to design station placement). Prints JSON.
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';
await withBrowser({ maxSeconds: 230 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 200);
  const out = await b.eval(`(() => { const c = game.city; const o = { keys: Object.keys(c), bounds: c.bounds, spawn: c.playerSpawn, v2: game.v2, gameKeys: Object.keys(game) };
    const cnt = (a, k) => { const m = {}; for (const s of a || []) m[s[k] ?? '?'] = (m[s[k] ?? '?'] || 0) + 1; return m; };
    o.storefronts = (c.storefronts || []).length; o.sfKinds = cnt(c.storefronts, 'kind'); o.sf0 = (c.storefronts || [])[0];
    o.shopLots = (c.shopLots || []).length; o.benches = (c.benches || []).length; o.bench0 = (c.benches || [])[0]; o.lean = (c.leanSpots || []).length;
    o.rg = c.roadGraph ? { nodes: c.roadGraph.nodes.length, edges: c.roadGraph.edges.length, kinds: cnt(c.roadGraph.edges, 'kind') } : null;
    o.zones = {}; for (let i = 0; i < 4000; i++) { const x = c.bounds.minX + Math.random() * (c.bounds.maxX - c.bounds.minX), z = c.bounds.minZ + Math.random() * (c.bounds.maxZ - c.bounds.minZ); const zn = c.zoneAt(x, z); o.zones[zn] = (o.zones[zn] || 0) + 1; }
    o.dist = {}; for (let i = 0; i < 3000; i++) { const x = c.bounds.minX + Math.random() * (c.bounds.maxX - c.bounds.minX), z = c.bounds.minZ + Math.random() * (c.bounds.maxZ - c.bounds.minZ); if (c.isWater(x, z)) continue; const d = c.districtAt(x, z); o.dist[d] = (o.dist[d] || 0) + 1; }
    o.peds = game.peds.list.filter(p => p.active).length; o.perf = game.perf; o.interiors = (game.interiors.list || []).length; o.int0 = game.interiors.list?.[0] && Object.keys(game.interiors.list[0]);
    o.hud = Object.keys(game.hud); o.audio = Object.keys(game.audio).slice(0, 60); o.veh = Object.keys(game.vehicles); o.env = Object.keys(game.env || {}); o.weather = game.weather || game.env?.weather;
    o.chars = window.__chars ? { humans: __chars.humans.size, entries: __chars.humanEntries.length, keys: Object.keys(__chars) } : null;
    return JSON.stringify(o); })()`);
  console.log(out);
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 10).join('\n'));
});

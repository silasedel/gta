#!/usr/bin/env node
// Bridge / overpass clearance check over the WHOLE map (user, Nov 19: "a bridge goes over the road a few feet above, blocking it").
//   node tools/v2/map3/bridge_clearance.mjs [--tag before] [--base http://127.0.0.1:5200/assets/miami/] [--mapbuild b2026...] [--q "wclear=0"]
// Runs headless in Node (no browser): loads the published map exactly as the game does (src/world/miami/data.js) and builds the
// runtime elevated network (src/world/miami/elevated/network.js), then:
//   ground   every ground road the city draws (edges the elevated network does not own) is walked every 1.5 m along its centre
//            line and its two lane edges; where a deck / ramp / embankment covers the point, the clearance between the road and
//            the deck's underside is measured (viaduct: deck top - 1.25 m structure depth; embankment: 0, it is a solid fill).
//   deck     every elevated deck sample is checked for another deck above it the same way.
// A spot is a finding when the deck is clearly above the road (> 0.5 m: not an at-grade junction / ramp foot) and the clearance
// is under 4.8 m. Findings within 40 m of each other on the same pair are one spot.
// Also runs the whole-map audit's global deck checks (map-audit.page.js) on the same network for before / after comparison.
// Output: docs/v2/reports/bridge-clearance-<tag>.json (spots sorted worst first) + a summary line.
import fs from 'node:fs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const TAG = o.tag || 'now', NEED = +(o.need || 4.8), AT_GRADE = 0.5;
if (o.mapbuild || o.q) globalThis.location = { search: '?' + [o.mapbuild ? 'mapbuild=' + o.mapbuild : '', o.q || ''].filter(Boolean).join('&') };
const { loadMiamiData } = await import('../../../src/world/miami/data.js');
const { buildNetwork } = await import('../../../src/world/miami/elevated/network.js');
const { P } = await import('../../../src/world/miami/elevated/params.js');
const D = await loadMiamiData({}, { base: o.base || 'http://127.0.0.1:5200/assets/miami/' });
const net = buildNetwork(D);
const E = D.roadGraph.edges, chains = net.chains;
const terr = D.hasRelief && D.terrainHeightAt ? (x, z) => Math.max(0, D.terrainHeightAt(x, z) || 0) : () => 0;
const r1 = (v) => Math.round(v * 10) / 10;
// deck covering (x, z): lowest deck top above yMin, with its chain / sample / structure type
const segAt = (x, z, yMin) => {
  // footprintAt gives the lowest deck; for stacked decks walk upward with heightAt (nearest deck at / below y + 0.5)
  let best = null;
  for (const yq of [yMin + 2, yMin + 4, yMin + 6.5]) {
    const h = net.heightAt(x, z, yq, 0);
    if (h !== null && h !== undefined && h > yMin && (best === null || h < best)) best = h;
  }
  return best;
};
const typeAt = (x, z, y) => { // structure type of the deck at (x, z) (0 at grade, 1 embankment, 2 viaduct); stacked decks: viaduct
  const f = net.footprintAt(x, z); return f && Math.abs(f.y - y) < 0.3 ? f.type : 2;
};
const raw = [];
// 1. ground roads under decks
for (const e of E) {
  if (net.own[e.id] || !e.pts || e.pts.length < 2) continue;
  const hw = Math.max(1, e.width / 2 - 1.0);
  for (let k = 1; k < e.pts.length; k++) {
    const [ax, az] = e.pts[k - 1], [bx, bz] = e.pts[k], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
    const tx = (bx - ax) / L, tz = (bz - az) / L, n = Math.max(1, Math.ceil(L / 1.5));
    for (let q = 0; q <= n; q++) for (const off of [0, -hw, hw]) {
      const x = ax + (bx - ax) * q / n - tz * off, z = az + (bz - az) * q / n + tx * off;
      if (D.isWater(x, z)) continue; // a street over water is the roadOnWater audit's business
      const gy = terr(x, z), h = segAt(x, z, gy + AT_GRADE);
      if (h === null) continue;
      const t = typeAt(x, z, h), above = h - gy, clear = t === 2 ? above - P.DECK_D : t === 1 ? 0 : above;
      if (clear < NEED) raw.push({ under: 'road', edge: e.id, name: e.name || null, kind: e.kind, x, z, roadY: gy, deckY: h, type: t, clear });
    }
  }
}
// 2. decks under decks
for (const c of chains) for (let i = 0; i < c.n; i++) {
  if (c.vis && !c.vis[i]) continue;
  const h = segAt(c.x[i], c.z[i], c.y[i] + AT_GRADE); if (h === null) continue;
  const clear = h - c.y[i] - P.DECK_D;
  if (clear < NEED && h - c.y[i] > 1.3) raw.push({ under: 'deck', chain: c.id, name: c.name || null, kind: c.kind, x: c.x[i], z: c.z[i], roadY: c.y[i], deckY: h, type: 2, clear });
}
// which chain is the deck above? nearest chain sample at about that height
const chainAbove = (x, z, y) => { let best = null, bd = 1e9; for (const c of chains) for (let i = 0; i < c.n; i += 1) { const dx = c.x[i] - x, dz = c.z[i] - z; if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue; const d = dx * dx + dz * dz + 25 * (c.y[i] - y) ** 2; if (d < bd) { bd = d; best = { chain: c.id, name: c.name || null, kind: c.kind, i, endA: c.endA, endB: c.endB, s: r1(c.s[i]), len: r1(c.length), yT: r1(c.yT[i]), water: c.water[i] } } } return best; };
// cluster into spots
const spots = [];
for (const f of raw.sort((p, q) => p.clear - q.clear)) {
  const key = f.under === 'road' ? 'e' + f.edge : 'c' + f.chain;
  let s = spots.find((s) => s.key === key && Math.hypot(s.x - f.x, s.z - f.z) < 40);
  if (!s) { s = { key, under: f.under, name: f.name, kind: f.kind, x: r1(f.x), z: r1(f.z), roadY: r1(f.roadY), deckY: r1(f.deckY), minClear: r1(f.clear), type: f.type, n: 0 }; spots.push(s); }
  s.n++;
}
const Nn = D.roadGraph.nodes;
for (const s of spots) { s.deck = chainAbove(s.x, s.z, s.deckY);
  // do the two meet at a junction node (a deck T / X junction at two heights = a step) or cross without one (grade separation)?
  const lowNodes = s.under === 'deck' ? chains[+s.key.slice(1)].nodeSet : new Set([E[+s.key.slice(1)].a, E[+s.key.slice(1)].b]);
  const up = s.deck ? chains[s.deck.chain] : null; let dn = null;
  if (up) for (const nd of up.nodeSet) if (lowNodes.has(nd)) { const d = Math.hypot(Nn[nd].x - s.x, Nn[nd].z - s.z); if (dn === null || d < dn) dn = d; }
  s.sharedNodeDist = dn === null ? null : r1(dn); s.dy = r1(s.deckY - s.roadY); }
// barrier glitches (user: "not a single time ... a hitbox barrier glitch"): a deck barrier (visual + collider) standing on a ground
// road's carriageway at about road level (a deck foot beside / over a street at grade), or on another deck's lanes at its level
const gGrid = new Map(), GC = 20, gk = (i, j) => i * 100003 + j;
for (const e of E) { if (net.own[e.id] || !e.pts) continue; for (let k = 1; k < e.pts.length; k++) { const [ax, az] = e.pts[k - 1], [bx, bz] = e.pts[k], p = e.width / 2;
  for (let i = Math.floor((Math.min(ax, bx) - p) / GC); i <= Math.floor((Math.max(ax, bx) + p) / GC); i++) for (let j = Math.floor((Math.min(az, bz) - p) / GC); j <= Math.floor((Math.max(az, bz) + p) / GC); j++) { const kk = gk(i, j); let l = gGrid.get(kk); if (!l) gGrid.set(kk, (l = [])); l.push([e, k]); } } }
const onGroundRoad = (x, z) => { const l = gGrid.get(gk(Math.floor(x / GC), Math.floor(z / GC))); if (!l) return null; for (const [e, k] of l) { const [ax, az] = e.pts[k - 1], [bx, bz] = e.pts[k], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; let u = ((x - ax) * dx + (z - az) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u; if (Math.hypot(ax + dx * u - x, az + dz * u - z) < e.width / 2 - 0.3) return e; } return null; };
const bars = [];
for (const c of chains) for (let i = 0; i < c.n; i++) for (const side of [-1, 1]) {
  if (!(side < 0 ? c.barL[i] : c.barR[i])) continue;
  const o = side < 0 ? c.vL[i] + 0.3 : c.vR[i] - 0.3, x = c.x[i] - c.tz[i] * o, z = c.z[i] + c.tx[i] * o, yb = c.y[i] + c.bank[i] * o;
  const g = onGroundRoad(x, z); if (g && yb - terr(x, z) < 1.2) { bars.push({ cls: 'barRoad', x, z, y: yb, chain: c.id, name: c.name, on: g.name || g.kind }); continue; }
  const h = net.heightAt(x, z, yb + 1.0, 0); // another deck's surface right where the barrier stands, at its level
  if (h !== null && h !== undefined && Math.abs(h - yb) < 0.9 && net.footprintAt(x, z) && !(Math.abs(h - yb) < 0.02)) {
    // only when the deck there is not this chain's own slab (heightAt returns the nearest deck: compare with our own surface)
    const own = c.y[i] + c.bank[i] * o; if (Math.abs(h - own) > 0.15) bars.push({ cls: 'barDeck', x, z, y: yb, deckY: h, chain: c.id, name: c.name }); }
}
const barSpots = []; for (const f of bars) { if (barSpots.some((s) => s.cls === f.cls && s.chain === f.chain && Math.hypot(s.x - f.x, s.z - f.z) < 30)) continue; barSpots.push({ ...f, x: r1(f.x), z: r1(f.z), y: r1(f.y) }); }
// the whole-map audit's deck checks on the same network (tools/v2/map-audit.page.js globalChecks: deckLow / deckStep / deckDangling /
// twinGap / roadOnWater / bldWater), so a clearance fix can be compared against them without a browser
const { globalChecks } = await import('../map-audit.page.js');
const fakeGame = { miamiData: D, city: { isWater: D.isWater, roadGraph: D.roadGraph, seaLevel: D.seaLevel, elevated: { network: net, footprintAt: net.footprintAt, heightAt: (x, z, y) => net.heightAt(x, z, y === undefined ? null : y, 0) } } };
const AU = globalChecks(fakeGame), audit = AU.counts;
const rep = { tag: TAG, audit, auditDeck: AU.findings.filter((f) => /^deck|twin/.test(f.cls)), when: new Date().toISOString(), build: D.build, need: NEED, spots: spots.length, roadSpots: spots.filter((s) => s.under === 'road').length, deckSpots: spots.filter((s) => s.under === 'deck').length, samples: raw.length, barRoad: barSpots.filter((s) => s.cls === 'barRoad').length, barDeck: barSpots.filter((s) => s.cls === 'barDeck').length, barSpots, netStats: net.stats, list: spots };
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/bridge-clearance-${TAG}.json`, JSON.stringify(rep, null, 1));
console.log(`bridge clearance ${TAG} (${D.build}): ${rep.spots} spots (${rep.roadSpots} over ground roads, ${rep.deckSpots} deck over deck), ${raw.length} samples < ${NEED} m; deck audit ${JSON.stringify(audit)}; barriers on a ground road ${rep.barRoad}, on another deck ${rep.barDeck}; net ${JSON.stringify(net.stats)}`);
for (const s of spots.slice(0, +(o.top || 40))) console.log(`  ${s.under} ${s.kind} "${s.name}" at (${s.x}, ${s.z}) clear ${s.minClear} m (deck ${s.deckY}, road ${s.roadY}, type ${s.type}, n ${s.n}) under chain ${s.deck?.chain} "${s.deck?.name}" ${s.deck?.kind} s ${s.deck?.s}/${s.deck?.len} yT ${s.deck?.yT} ends ${s.deck?.endA}/${s.deck?.endB} water ${s.deck?.water} node ${s.sharedNodeDist}`);
process.exit(0);

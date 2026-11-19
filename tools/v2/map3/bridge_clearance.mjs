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
// the whole-map audit's deck checks on the same network (tools/v2/map-audit.page.js globalChecks: deckLow / deckStep / deckDangling /
// twinGap / roadOnWater / bldWater), so a clearance fix can be compared against them without a browser
const { globalChecks } = await import('../map-audit.page.js');
const fakeGame = { miamiData: D, city: { isWater: D.isWater, roadGraph: D.roadGraph, seaLevel: D.seaLevel, elevated: { network: net, footprintAt: net.footprintAt, heightAt: (x, z, y) => net.heightAt(x, z, y === undefined ? null : y, 0) } } };
const AU = globalChecks(fakeGame), audit = AU.counts;
const rep = { tag: TAG, audit, auditDeck: AU.findings.filter((f) => /^deck|twin/.test(f.cls)), when: new Date().toISOString(), build: D.build, need: NEED, spots: spots.length, roadSpots: spots.filter((s) => s.under === 'road').length, deckSpots: spots.filter((s) => s.under === 'deck').length, samples: raw.length, netStats: net.stats, list: spots };
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/bridge-clearance-${TAG}.json`, JSON.stringify(rep, null, 1));
console.log(`bridge clearance ${TAG} (${D.build}): ${rep.spots} spots (${rep.roadSpots} over ground roads, ${rep.deckSpots} deck over deck), ${raw.length} samples < ${NEED} m; deck audit ${JSON.stringify(audit)}; net ${JSON.stringify(net.stats)}`);
for (const s of spots.slice(0, +(o.top || 40))) console.log(`  ${s.under} ${s.kind} "${s.name}" at (${s.x}, ${s.z}) clear ${s.minClear} m (deck ${s.deckY}, road ${s.roadY}, type ${s.type}, n ${s.n}) under chain ${s.deck?.chain} "${s.deck?.name}" ${s.deck?.kind} s ${s.deck?.s}/${s.deck?.len} yT ${s.deck?.yT} ends ${s.deck?.endA}/${s.deck?.endB} water ${s.deck?.water} node ${s.sharedNodeDist}`);
process.exit(0);

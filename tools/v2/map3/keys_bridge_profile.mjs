#!/usr/bin/env node
// Keys bridge profiles (W4, Nov 19: "the Keys-to-mainland overpass and bridges are too low and plain; arc to ~6 m above the water").
// Headless (no browser): builds the runtime elevated network from the published map and prints every Keys-look chain (c.kst):
// length, water samples, longest water run, deck top over the sea (min / max), max grade.   node tools/v2/map3/keys_bridge_profile.mjs [--q "karc=0"]
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
if (o.q) globalThis.location = { search: '?' + o.q };
const { loadMiamiData } = await import('../../../src/world/miami/data.js');
const { buildNetwork } = await import('../../../src/world/miami/elevated/network.js');
const D = await loadMiamiData({}, { base: o.base || 'http://127.0.0.1:5200/assets/miami/' });
const net = buildNetwork(D);
const SEA = -0.12,
  out = [];
for (const c of net.chains) {
  if (!c.kst) continue;
  let run = 0,
    best = 0,
    wMin = Infinity,
    wMax = -Infinity,
    g = 0;
  for (let i = 0; i < c.n; i++) {
    if (c.water[i]) {
      run++;
      best = Math.max(best, run);
      wMin = Math.min(wMin, c.y[i] - SEA);
      wMax = Math.max(wMax, c.y[i] - SEA);
    } else run = 0;
    if (i) g = Math.max(g, Math.abs(c.y[i] - c.y[i - 1]) / Math.max(0.1, c.s[i] - c.s[i - 1]));
  }
  out.push({
    id: c.id,
    at: [Math.round(c.x[c.n >> 1]), Math.round(c.z[c.n >> 1])],
    L: Math.round(c.s[c.n - 1]),
    water: c.water.reduce((p, q) => p + q, 0),
    run: best,
    overSea: [+wMin.toFixed(2), +wMax.toFixed(2)],
    grade: +(g * 100).toFixed(1),
  });
}
out.sort((p, q) => q.L - p.L);
console.table(out);
if (o.prof)
  for (const c of net.chains)
    if (c.kst) {
      let l = '';
      for (let i = 0; i < c.n; i += 20) l += (c.water[i] ? '~' : '_') + c.y[i].toFixed(1) + ' ';
      console.log(c.id, l);
    }
process.exit(0);

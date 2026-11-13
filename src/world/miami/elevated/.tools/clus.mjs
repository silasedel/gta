// ELEVATED-2: audit failures per cluster from last_audit.json. usage: node clus.mjs [file]
import fs from 'node:fs';
const f = process.argv[2] || new URL('./last_audit.json', import.meta.url);
const { ex, out } = JSON.parse(fs.readFileSync(f));
export const CL = { A: [-3700, 300, -3250, 1000], B: [1350, 650, 1750, 950], C: [-3350, 700, -2450, 1400] };
const res = {};
for (const [k, l] of Object.entries(ex)) for (const [x, z, info] of l) {
  for (const [n, [x0, z0, x1, z1]] of Object.entries(CL)) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) { const r = (res[n] ||= {}); const key = k + ':' + (info ? info[0] : '?'); r[key] = (r[key] || 0) + 1; }
}
console.log('global', JSON.stringify(out.counts));
for (const [n, r] of Object.entries(res)) console.log(n, JSON.stringify(Object.fromEntries(Object.entries(r).sort())));

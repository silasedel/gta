#!/usr/bin/env node
// r2-render: inventory json (stab.mjs --only inv) -> markdown table, grouped by technique.
//   node tools/v2/render/invtable.mjs docs/v2/reports/render-ab1-inventory.json > out.md
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rows = j.inventory;
const cls = (t) =>
  t.find((x) => /dither|bayer|alphaHash/.test(x))
    ? 'stochastic'
    : t.includes('A2C')
      ? 'A2C'
      : t.find((x) => /alphaTest/.test(x))
        ? 'alpha test'
        : t.find((x) => /blend/.test(x))
          ? 'blended'
          : 'other';
const by = {};
for (const r of rows) (by[cls(r.tech)] ||= []).push(r);
const out = [
  '| class | material | techniques | meshes (instances) | nearest m | where |',
  '|---|---|---|---|---|---|',
];
for (const k of ['stochastic', 'alpha test', 'A2C', 'blended', 'other']) {
  for (const r of (by[k] || []).sort((a, b) => a.minD - b.minD).slice(0, 40))
    out.push(
      `| ${k} | ${r.mat} | ${r.tech.join(', ')} | ${r.n}${r.inst ? ` (${r.inst})` : ''} | ${r.minD} | ${r.where || ''}${r.skinned ? ' [skinned]' : ''} |`,
    );
}
console.log(out.join('\n'));
console.log(
  '\nanisotropy (max ' +
    j.aniso.max +
    '): ' +
    Object.entries(j.aniso.out)
      .map(([k, v]) => `${k}: ${v.n}`)
      .join(', '),
);
console.log('coplanar pairs within 30 m of the deck camera: ' + (j.coplanarDeck || []).length);
for (const h of (j.coplanarDeck || []).slice(0, 25))
  console.log(
    `- ${h.a}  x  ${h.b}  (${h.axis} plane, gap ${h.gap} mm, offset ${h.po.join(' / ') || 'none'}) at ${h.at.join(', ')}`,
  );

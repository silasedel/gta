#!/usr/bin/env node
// r2-qa: before -> after table between two tour runs (bugs from tools/v2/qa/report.mjs --tag X).
//   node tools/v2/qa/compare.mjs --a r1 --b r2   -> docs/v2/reports/qa-r2-final.md
import fs from 'node:fs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const A = JSON.parse(fs.readFileSync(`docs/v2/reports/qa-r2-${o.a || 'r1'}-bugs.json`, 'utf8'));
const B = JSON.parse(fs.readFileSync(`docs/v2/reports/qa-r2-${o.b || 'r2'}-bugs.json`, 'utf8'));
const RB = JSON.parse(fs.readFileSync(`docs/v2/reports/qa-r2-${o.b || 'r2'}.json`, 'utf8'));
const k = (b) => b.key.slice(0, 58);
// owner triage after run 1 (messages from the owners)
const TRIAGE = {
  'QA-012':
    'closed by r2-keys: AC unit on a slatted stand and a towel on the shower lattice (QA false positive)',
  'QA-033': 'by design (r2-veg): shrubs are soft, bushAt zones slow the player',
  'QA-038': 'by design (r2-veg): shrubs are soft',
  'QA-045': "roof vents won't-fix (r2-art); far chunk near the player routed to streaming",
};
const covered = new Set(
  Object.keys(RB.areas || {}).filter((n) => RB.areas[n].ground || RB.areas[n].hitbox),
);
if ((RB.vehicles || []).length) covered.add('vehicles');
if (RB.water && Object.keys(RB.water).length) covered.add('water');
if (RB.ui && RB.ui.spawn) {
  covered.add('ui');
  covered.add('boot');
}
covered.add('console');
for (const n of [...covered]) covered.add('area:' + n);
const used = new Set();
const rows = [];
for (const x of A) {
  const m = B.find((y) => !used.has(y) && k(y) === k(x));
  if (m) used.add(m);
  let st;
  if (m) st = 'still open';
  else if (!covered.has(x.area)) st = 'not re-tested';
  else st = 'fixed';
  if (x.area === 'beach') st = 'not re-tested';
  rows.push({
    id: x.id,
    sev: x.sev,
    owner: x.owner,
    area: x.area,
    before: x.what,
    after: m ? `${m.id}: ${m.what}` : st === 'fixed' ? 'not found in run 2' : '',
    st,
    triage: TRIAGE[x.id] || '',
    at: m ? m.at : x.at,
    shot: m?.shot || '',
  });
}
const confirm = B.filter(
  (y) => !used.has(y) && y.cat === 'hitbox (walk)' && /countryside|shrub/.test(y.what),
);
const fresh = B.filter((y) => !used.has(y) && !confirm.includes(y));
const esc = (s) =>
  String(s ?? '')
    .replace(/\|/g, '/')
    .replace(/\n/g, ' ')
    .slice(0, 330);
const cnt = (s) => rows.filter((r) => r.st === s).length;
let md = `# r2-qa final re-test (${RB.when})\n\nRun 1: docs/v2/reports/qa-r2.md (raw qa-r2-r1.json). Run 2: \`node tools/v2/qa/tour.mjs --tag r2\` (raw qa-r2-r2.json, table qa-r2-r2.md). Same script and thresholds; run 2 also tests South Beach (found by district) and counts a real sprint as walk-through only without sliding.\n\n`;
md += `Run-1 bugs: ${rows.length} -> fixed ${cnt('fixed')}, still open ${cnt('still open')}, not re-tested ${cnt('not re-tested')}. New in run 2: ${fresh.length} (${fresh.filter((b) => b.sev === 'high').length} high).\n\n`;
md += `## Before -> after (run-1 ids)\n\n| id | sev | owner | area | before (run 1) | after (run 2) | status | owner triage |\n|---|---|---|---|---|---|---|---|\n`;
for (const r of rows)
  md += `| ${r.id} | ${r.sev} | ${r.owner} | ${r.area} | ${esc(r.before)} | ${esc(r.after)} | **${r.st}** | ${esc(r.triage)} |\n`;
md += `\nReal sprints (counted only without sliding) confirm the open countryside / shrub walk-throughs: ${confirm.map((b) => b.area + ' ' + b.at + ' pen ' + (/ends ([0-9.]+) m/.exec(b.what) || [])[1]).join('; ')}.\n`;
md += `\n## New in run 2\n\n| id (run 2) | sev | owner | area | bug | repro | screenshot |\n|---|---|---|---|---|---|---|\n`;
for (const b of fresh)
  md += `| ${b.id} | ${b.sev} | ${b.owner} | ${b.area} | ${esc(b.what)}${b.ex ? '<br><sub>' + esc(b.ex.slice(0, 3).join('; ')) + '</sub>' : ''} | ${esc(b.at)} | ${b.shot || ''} |\n`;
fs.writeFileSync('docs/v2/reports/qa-r2-final.md', md);
console.log(
  `fixed ${cnt('fixed')} open ${cnt('still open')} notTested ${cnt('not re-tested')} new ${fresh.length}`,
);

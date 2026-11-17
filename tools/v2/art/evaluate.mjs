#!/usr/bin/env node
// r2-art: classify audited materials, score them against src/world/art/ranges.json, rank by visibility x severity, write
// docs/v2/reports/art-audit[-set].json + .md. Re-run on saved raw data: node tools/v2/art/evaluate.mjs --set base
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const RANGES = JSON.parse(fs.readFileSync(new URL('../../../src/world/art/ranges.json', import.meta.url), 'utf8'));
const CLS = RANGES.classify.map(([c, re]) => [c, new RegExp(re, 'i')]);
const CHAIN = [['foliage', /veg_\w+.*frond|M\.frond|plants:leaves|plants:card/i], ['bark', /M\.trunk|plants:limbs/i], ['carPaint', /\bvehicle|glbCar/i], ['skin', /npcSkin/i]];
const l2s = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const satOf = (c) => { const s = c.map((v) => l2s(Math.max(0, v))); const mx = Math.max(...s), mn = Math.min(...s); return mx > 1e-4 ? (mx - mn) / mx : 0; };
// owner of a material by its source (object chain / names); 'r2-art' = mine to fix
const OWNERS = [
  ['r2-art', /streetKit|^buildings\/|^street\/|lib-|library-buildings/],
  ['r2-cars', /police|_hood|taxi|sedan|coupe|hatch\d|conv\d|truck|minivan|vehicle|glbcar|car:|car-|\bcar\b|traffic|parked|hero-car|wheel|tire|tyre|carpaint|body_?paint|chassis|h\d+_service|livery|headl|taill/i],
  ['r2-people', /mixamo|\bcc\d+\b|npc|people|ped\b|peds|character|nico(?!House|_house)|player|avatar|skin|hair|outfit|wardrobe|LOD\d_|body_?mesh|cp_cloth/i],
  ['r2-keys', /nicoHouse|nico_house|nh_|keys[A-Z]|keysRiprap|keysBar|keysSign|dockDetail|\bdock\b|yard|bay-dock|setpiece/i],
  ['r2-veg', /vegField|\bveg\b|veg_|vegetation|plants:|palm|frond|tree(?!-grate)|trunk|foliage|leaves|bush|shrub|flower|bloom|countryside|M\.trunk|M\.frond|grass-blade|tuft/i],
  ['r2-roads', /elevated|guardrail|road|sidewalk|curb|kerb|marking|lane|crosswalk|manhole|asphalt|intersection|junction|pavement|surface-|surfaces|decal|pothole|tree-grate/i],
  ['r2-ground', /terrain|ground|land-base|land|sand|beach|water|ocean|seabed|shore|grass(?!-blade)|soil|mud|puddle|lawn/i],
  ['r2-look', /sky|cloud|sun-|moon|env-/i],
  ['r2-art', /town:|towns|streetKit|lib-|library-buildings|facade|building|bld|roof|shop|storefront|frontage|interior|room|lot-props|street|prop|bench|bin|lamp|pole|sign|reg-|speed-limit|pickup|crate|weapon|gun|houses:|house|fence|hydrant|mailbox|dumpster|shelter|meter|cone|barrier|jersey|signal|plinth|awning|umbrella/i],
];
export function classify(s) {
  const own = `${s.name} ${s.mapName}`, all = `${own} ${s.obj} ${s.objNames.join(' ')}`;
  if (s.emissive > 0.4 && !s.map) return 'emissive';
  if (s.noColor) return 'emissive'; // occluders / depth-only
  if (!s.lit) return 'emissive'; // unlit (MeshBasic / custom shaders): fx, decals, contact-shadow blobs, sky: not a surface material
  for (const [c, re] of CLS) if (re.test(own)) return c;
  // the object chain only for unambiguous library groups (a material name saying nothing stays 'generic': sanity checks only)
  for (const [c, re] of CHAIN) if (re.test(all)) return c;
  if (s.metal > 0.85) return 'galvanized';
  return 'generic';
}
export function ownerOf(s) {
  if (!s.obj && (s.type === 'MeshPhysical' && (s.cc || 0) > 0)) return 'r2-cars'; // clear-coated physical materials with no named parent: car paint / glass
  const all = `${s.src || ''} ${s.ud || ''} ${s.obj} ${s.objNames.join(' ')} ${s.name} ${s.mapName}`;
  for (const [ow, re] of OWNERS) if (re.test(all)) return ow;
  if (!s.obj) return 'r2-cars?'; // vehicles are the scene's unnamed glTF roots (wiper / body / underbody maps)
  return 'unknown';
}
function score(s, cls) {
  const R = RANGES.classes[cls] || RANGES.classes.generic;
  if (R.skip) return { sev: 0, issues: [] };
  const issues = []; let sev = 0;
  const alb = s.lit && s.scr ? s.scr : s.est; const L = lum(alb), sat = satOf(alb);
  const add = (k, d, msg) => { if (d > 0.04) { sev += d; issues.push({ k, d: +d.toFixed(2), msg }); } };
  const seeThrough = s.transparent && (s.opacity ?? 1) < 0.6; // see-through glass / films: their color is not an albedo
  if (!seeThrough && L < R.lum[0]) add('albedo', 1.4 * Math.log2(R.lum[0] / Math.max(L, 0.002)), `albedo ${L.toFixed(3)} < ${R.lum[0]}`);
  if (!seeThrough && L > R.lum[1]) add('albedo', 1.8 * Math.log2(L / R.lum[1]), `albedo ${L.toFixed(3)} > ${R.lum[1]}`);
  if (sat > R.sat) add('sat', (sat - R.sat) / 0.15, `saturation ${sat.toFixed(2)} > ${R.sat}`);
  const std = (s.type === 'MeshStandard' || s.type === 'MeshPhysical') && !s.shaderPBR; // shader-driven roughness / metalness: albedo only
  if (std && s.rough != null) {
    if (s.rough < R.rough[0]) add('rough', (R.rough[0] - s.rough) / 0.15, `roughness ${s.rough} < ${R.rough[0]}`);
    if (s.rough > R.rough[1]) add('rough', (s.rough - R.rough[1]) / 0.15, `roughness ${s.rough} > ${R.rough[1]}`);
  }
  if (std && s.metal != null) {
    if (s.metal < R.metal[0]) add('metal', (R.metal[0] - s.metal) / 0.3, `metalness ${s.metal} < ${R.metal[0]}`);
    if (s.metal > R.metal[1]) add('metal', (s.metal - R.metal[1]) / 0.3, `metalness ${s.metal} > ${R.metal[1]}`);
  }
  if (s.normal && s.normal.scale != null) {
    const n = s.normal.scale;
    if (n > R.normal[1] * 1.15) add('normal', (n - R.normal[1]) / 0.6, `normalScale ${n} > ${R.normal[1]}`);
  }
  if (s.texel && R.tex && s.mapRes && Math.max(...s.mapRes) > 8) {
    if (s.texel < R.tex[1]) add('texel', 0.8 * Math.log2(R.tex[1] / s.texel), `texel ${Math.round(s.texel)} px/m < ${R.tex[1]} (map ${s.mapRes.join('x')})`);
  }
  if (std && s.env != null && R.env) {
    if (s.env > R.env[1] * 1.1) add('env', (s.env - R.env[1]) / 0.6, `envMapIntensity ${s.env} > ${R.env[1]}`);
  }
  return { sev: +sev.toFixed(2), issues, L: +L.toFixed(3), sat: +sat.toFixed(2) };
}
export function evaluate(stats, views, meta = {}) {
  const rows = [];
  for (const s of stats || []) {
    let cls = s.calCls || classify(s); const owner = ownerOf(s); // calibrate()'s own class when the material went through it
    if ((cls === 'galvanized' || cls === 'chrome') && s.metal != null && s.metal < 0.5) cls = 'metalPainted'; // named metal, authored dielectric: painted
    if (cls === 'generic' && /lib-|^buildings\//.test(`${s.obj} ${s.src || ''}`)) cls = 'building'; // same fallback as calibrate() for library buildings
    if ((cls === 'generic' || cls === 'building') && s.metal != null && s.metal >= 0.5 && !s.shaderPBR) cls = 'galvanized';
    if (s.scrRM) { s.roughStatic = s.rough; s.metalStatic = s.metal; s.rough = s.scrRM[0]; s.metal = s.scrRM[1]; s.shaderPBR = false; } // measured on screen (r2-look debug mode)
    const sc = score(s, cls);
    const cov = Object.values(s.cover); const vis = Math.max(...cov, 0), tot = cov.reduce((p, c) => p + c, 0);
    const where = Object.entries(s.cover).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`);
    rows.push({ cls, owner, sev: sc.sev, vis: +(vis * 100).toFixed(2), visTot: +(tot * 100).toFixed(2), rank: +(Math.sqrt(vis * 100) * sc.sev).toFixed(2), L: sc.L, sat: sc.sat, issues: sc.issues, where, ...s });
  }
  rows.sort((a, b) => b.rank - a.rank);
  const flagged = rows.filter((r) => r.sev >= 0.35);
  const high = flagged.filter((r) => r.vis >= 1.0);
  const byOwner = {}; for (const r of flagged) { const k = r.owner; byOwner[k] = byOwner[k] || { n: 0, high: 0 }; byOwner[k].n++; if (r.vis >= 1) byOwner[k].high++; }
  const byClass = {}; for (const r of rows) { const k = r.cls; (byClass[k] = byClass[k] || { n: 0, cover: 0, flagged: 0 }); byClass[k].n++; byClass[k].cover += r.visTot; if (r.sev >= 0.35) byClass[k].flagged++; }
  // library vs code-built, per class (coverage-weighted): the "can you tell which is which" check
  const mix = {}; for (const r of rows) { if (r.cls === 'emissive' || r.L === undefined) continue; const g = r.gltf ? 'lib' : 'code', k = r.cls, wgt = r.visTot || 0; if (!wgt) continue;
    const m = (mix[k] = mix[k] || { lib: [0, 0, 0, 0], code: [0, 0, 0, 0] })[g]; m[0] += r.L * wgt; m[1] += (r.sat || 0) * wgt; m[2] += (r.rough ?? 0.8) * wgt; m[3] += wgt; }
  const libVsCode = Object.entries(mix).filter(([, v]) => v.lib[3] > 0.5 && v.code[3] > 0.5).map(([k, v]) => { const f = (a) => [a[0] / a[3], a[1] / a[3], a[2] / a[3]].map((x) => +x.toFixed(3)); const a = f(v.lib), c = f(v.code);
    return { cls: k, lib: { L: a[0], sat: a[1], rough: a[2], cover: +v.lib[3].toFixed(1) }, code: { L: c[0], sat: c[1], rough: c[2], cover: +v.code[3].toFixed(1) }, dStops: +Math.log2(a[0] / Math.max(c[0], 1e-3)).toFixed(2), dRough: +(a[2] - c[2]).toFixed(2) }; });
  return { ...meta, when: new Date().toISOString(), views, libVsCode, counts: { materials: rows.length, flagged: flagged.length, highVisibility: high.length }, byOwner, byClass, rows };
}
const fmtC = (c) => (c ? c.map((v) => v.toFixed(2)).join(',') : '-');
export function writeReport(rep, set) {
  fs.mkdirSync('docs/v2/reports', { recursive: true });
  const suf = set && set !== 'base' ? '-' + set : '';
  fs.writeFileSync(`docs/v2/reports/art-audit${suf}.json`, JSON.stringify(rep, null, 1));
  const L = [];
  L.push(`# Art audit${suf ? ' (' + set + ')' : ''}: ${rep.when}`, '');
  L.push(`Tool: \`node tools/v2/art/audit.mjs\` (ranges: \`src/world/art/ranges.json\`, guide: \`docs/v2/briefs/ART_STYLE.md\`).`);
  L.push(`Materials on screen: ${rep.counts.materials}. Outliers (severity >= 0.35): ${rep.counts.flagged}. High-visibility outliers (>= 1% of the screen in some view): **${rep.counts.highVisibility}**.`, '');
  L.push('Rank = sqrt(max screen % in any view) x severity. Severity sums the distance outside each class range (albedo in stops x1.4-1.8, roughness per 0.15, metalness per 0.3, saturation per 0.15, texel density in stops x0.8).', '');
  L.push('## Outliers by owner', '', '| owner | outliers | high visibility |', '|---|---|---|');
  for (const [k, v] of Object.entries(rep.byOwner).sort((a, b) => b[1].high - a[1].high)) L.push(`| ${k} | ${v.n} | ${v.high} |`);
  if (rep.libVsCode && rep.libVsCode.length) { L.push('', '## Library vs code-built, same class (coverage-weighted)', '', 'A style is unified when the two columns agree: |albedo delta| < 0.5 stop, |roughness delta| < 0.12.', '', '| class | library L / sat / rough | code-built L / sat / rough | albedo delta (stops) | roughness delta |', '|---|---|---|---|---|');
    for (const x of rep.libVsCode) L.push(`| ${x.cls} | ${x.lib.L} / ${x.lib.sat} / ${x.lib.rough} (${x.lib.cover}%) | ${x.code.L} / ${x.code.sat} / ${x.code.rough} (${x.code.cover}%) | ${x.dStops}${Math.abs(x.dStops) > 0.5 ? ' **!**' : ''} | ${x.dRough}${Math.abs(x.dRough) > 0.12 ? ' **!**' : ''} |`); }
  L.push('', '## By material class', '', '| class | materials | outliers | summed screen % |', '|---|---|---|---|');
  for (const [k, v] of Object.entries(rep.byClass).sort((a, b) => b[1].cover - a[1].cover)) L.push(`| ${k} | ${v.n} | ${v.flagged} | ${v.cover.toFixed(1)} |`);
  L.push('', '## Ranked outliers (top 80)', '', '| # | rank | owner | class | material | source (object chain) | albedo L / sat | rough / metal | texel px/m (map) | issues | where |', '|---|---|---|---|---|---|---|---|---|---|---|');
  let i = 0;
  for (const r of rep.rows.filter((x) => x.sev >= 0.35).slice(0, 80)) {
    i++;
    L.push(`| ${i} | ${r.rank} | ${r.owner} | ${r.cls} | ${(r.name || '(unnamed)').slice(0, 40).replace(/\|/g, '/')} | ${r.obj.slice(0, 60).replace(/\|/g, '/')}${r.gltf ? ' [glTF]' : ''} | ${r.L} / ${r.sat} | ${r.rough ?? '-'} / ${r.metal ?? '-'} | ${r.texel ?? '-'} (${r.mapRes ? r.mapRes.join('x') : '-'}) | ${r.issues.map((q) => q.msg).join('; ')} | ${r.where.join(', ')} |`);
  }
  L.push('', '## Views', '');
  for (const v of rep.views) L.push(`- ${v.place}:${v.cam}: ${v.mats} materials, sky ${(v.sky * 100).toFixed(0)}%, \`${v.shot}\``);
  if (rep.errors && rep.errors.length) L.push('', '## Console errors', '', ...rep.errors.map((e) => '- ' + e.replace(/\n/g, ' ').slice(0, 300)));
  fs.writeFileSync(`docs/v2/reports/art-audit${suf}.md`, L.join('\n') + '\n');
  fs.writeFileSync(`docs/v2/reports/art-audit-raw${suf}.json`, JSON.stringify({ stats: rep.rows.map(({ cls, owner, sev, vis, visTot, rank, L, sat, issues, where, ...s }) => s), views: rep.views, errors: rep.errors, set }));
  console.log(`art audit: ${rep.counts.materials} materials, ${rep.counts.flagged} outliers, ${rep.counts.highVisibility} high-visibility -> docs/v2/reports/art-audit${suf}.md`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2); const set = a[a.indexOf('--set') + 1] && a.includes('--set') ? a[a.indexOf('--set') + 1] : 'base';
  const suf = set !== 'base' ? '-' + set : '';
  const raw = JSON.parse(fs.readFileSync(`docs/v2/reports/art-audit-raw${suf}.json`, 'utf8'));
  writeReport(evaluate(raw.stats, raw.views, { set, errors: raw.errors }), set);
}

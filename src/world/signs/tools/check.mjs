#!/usr/bin/env node
// KEYS-SIGN track: plans every guide sign and street blade from public/assets/miami/roadgraph.json and checks that each
// guide-sign destination is reachable down the signed branch. Writes docs/v2/shots/keys-sign/guide_check.json.
import fs from 'node:fs';
import { planSigns, verifyGuides } from '../plan.js';
const rg = JSON.parse(fs.readFileSync('public/assets/miami/roadgraph.json', 'utf8')), Q = 1 / (rg.q || 10);
const nodes = []; for (let k = 0; k < rg.nodes.length / 2; k++) nodes.push({ id: k, x: rg.nodes[2 * k] * Q, z: rg.nodes[2 * k + 1] * Q, edges: [] });
const edges = rg.edges.map((r, id) => { const n = r.p.length / 2, pts = [], cum = new Float32Array(n); for (let i = 0; i < n; i++) { pts.push([r.p[2 * i] * Q, r.p[2 * i + 1] * Q]); if (i) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); }
  const e = { id, a: r.a, b: r.b, pts, cum, length: cum[n - 1], y: r.y ? r.y.map((v) => v / (rg.yq || 100)) : null, elevated: !!r.y, width: r.w, oneway: !!r.o, name: r.n >= 0 ? rg.names[r.n] : null, kind: rg.kinds[r.k] }; nodes[e.a].edges.push(id); if (e.b !== e.a) nodes[e.b].edges.push(id); return e; });
const G = { nodes, edges }, plan = planSigns(G, {}), v = verifyGuides(G, plan);
const sample = plan.guides.slice(0, 400).map((g) => ({ id: g.id, route: g.route, at: [Math.round(g.x), Math.round(g.z)], type: g.type, panels: g.panels.map((p) => (p.exit ? 'EXIT ' + p.exit + ': ' : '') + p.routes.map((r) => r.type + '-' + r.num).join(' ') + ' ' + (p.cardinal || '') + ' ' + p.lines.join(' / ') + ' [' + p.arrow + (p.exitOnly ? ', EXIT ONLY' : '') + ']') }));
fs.mkdirSync('docs/v2/shots/keys-sign', { recursive: true });
fs.writeFileSync('docs/v2/shots/keys-sign/guide_check.json', JSON.stringify({ gantries: plan.guides.length, panels: v.total, reachable: v.ok, unreachable: v.bad, blades: plan.blades.length, signs: sample }, null, 1));
console.log('gantries', plan.guides.length, 'panels', v.total, 'reachable', v.ok, 'bad', v.bad.length, 'blade posts', plan.blades.length);
for (const s of sample.slice(0, 14)) console.log(s.route, s.at.join(','), '|', s.panels.join('  ||  '));
for (const n of [0, 500, 1500, 2500, 3200]) { const b = plan.blades[n]; if (b) console.log('blade', b.node, Math.round(b.x), Math.round(b.z), b.signs.map((s) => [s.label.pre, s.label.main, s.label.suf, s.block].join(' ') + ' <' + s.name + '>').join('  x  ')); }
process.exit(v.bad.length ? 1 : 0);

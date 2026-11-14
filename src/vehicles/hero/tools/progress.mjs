// Writes docs/v2/progress/hero-cars.json.  Usage: node src/vehicles/hero/tools/progress.mjs [agentState] [name=state[@evidence] ...]
// State is kept in tools/progress.state.json so updates are incremental.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const stateFile = path.join(root, 'src/vehicles/hero/tools/progress.state.json');
const out = path.join(root, 'docs/v2/progress/hero-cars.json');
const CARS = ['Green super-SUV (Vireo Colosso)', 'Red V10 supercar (Vireo Fulmine V10)', 'Graphite V12 flagship (Vireo Saetta V12 Ombra)', 'Purple two-tone hypercar (Vauclair Minuit)', 'Orange mid-engine supercar (Merrow Peregrine)'];
const PER = ['body surfacing, proportions, panel gaps', 'paint, carbon, glass, badges, plates', 'wheels, tires, brakes', 'light clusters and working lights', 'cockpit interior, live cluster', 'working doors, hood, engine cover', 'engine bay', 'damage-ready parts, collider hull, LODs'];
const SHARED = ['Surfacing kit (B-spline skins, trimming, shut lines)', 'Material library (paint, carbon, glass, leather, metals)', 'Studio preview page (turntable, doors, lights, interior camera)',
  'Catalog: handling and engine data per model', 'Registration with vehicles-core (index.js + hero.v2.js)', 'Engine character notes for the audio track',
  'Screenshot set per car (front 3/4, side, rear 3/4, top, interior, doors open, night)', 'Class-comparison notes (proportions vs class figures)', 'Triangles and draw calls per car and LOD'];
let st = {};
try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) { /* first run */ }
st.items ||= {};
const names = [...SHARED, ...CARS.flatMap((c) => PER.map((p) => `${c}: ${p}`))];
for (const n of names) st.items[n] ||= { state: 'todo', evidence: '' };
const args = process.argv.slice(2);
if (args[0] && !args[0].includes('=')) st.agent = args.shift();
for (const a of args) {
  const [k, v] = a.split('='); const [state, ev] = v.split('@');
  const hits = names.filter((n) => n.toLowerCase().includes(k.toLowerCase()));
  if (!hits.length) { console.error('no item matches', k); continue; }
  for (const h of hits) { st.items[h].state = state; if (ev != null) st.items[h].evidence = ev; }
}
fs.writeFileSync(stateFile, JSON.stringify(st, null, 1));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ track: 'hero-cars', title: 'Hero cars', section: 'Vehicles', agent: st.agent || 'running',
  items: names.map((n) => ({ name: n, state: st.items[n].state, evidence: st.items[n].evidence })) }, null, 1));
const c = names.filter((n) => st.items[n].state === 'verified').length;
console.log(`progress: ${c}/${names.length} verified`);

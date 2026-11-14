// Unit tests for the knowledge model and the six-star core (pure logic): node src/gameplay/police/tests/evidence.test.mjs
import { createEvidence } from '../../evidence.js';
import { createWantedCore } from '../../wantedCore.js';
import { describe } from '../../evidenceWords.js';
let T = 0, fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const ev = createEvidence({ now: () => T, dayLeft: () => 3000 });
const R = { garments: { top: { id: 'teal', label: 'teal shirt' }, bottom: { id: 'khaki', label: 'khaki shorts' }, shoes: { id: 'ws', label: 'white sneakers' } }, masked: false, faceCover: 0, weapons: ['handgun'], weaponVisible: 'handgun',
  vehicle: null, lastVehicle: { uid: 'car1', color: 'gray', plate: 'KLM 204' }, lastVehicleDist: 5, companions: 0, traces: [] };
const step = (s) => { for (let i = 0; i < s * 10; i++) { T += 0.1; ev.tick(0.1, R); } };
// camera footage held on the recorder, clerk calling, bystander reading the plate
const cam = ev.addSource({ id: 'camera:store', type: 'camera', label: 'Store camera', pending: 25 }); ev.setHold(cam.id, true);
ev.observe(cam, 'face', { label: 'face' }, 1); ev.observe(cam, 'outfit.top', R.garments.top, 1); ev.observe(cam, 'outfit.bottom', R.garments.bottom, 1);
const clerk = ev.addSource({ id: 'witness:clerk', type: 'witness', label: 'Clerk', reliability: 0.85, pending: 6 }); ev.observe(clerk, 'weapon', { cls: 'handgun' }, 1); ev.observe(clerk, 'outfit.top', R.garments.top, 1);
const by = ev.addSource({ id: 'witness:by', type: 'witness', label: 'Bystander', reliability: 0.7, pending: 7 }); ev.observe(by, 'plate', { text: 'KLM 204', mask: [true, true, false, true, false, true] }, 1); ev.observe(by, 'vehicle', { uid: 'car1', color: 'gray', cls: 'sedan', label: 'gray sedan' }, 1);
ok(ev.size === 0 && ev.snapshot().sources.pending.length === 3, 'nothing known while calls and footage are pending');
step(6.5); ok(ev.has('weapon') && ev.has('outfit.top') && !ev.has('face'), 'clerk call delivers weapon + top; footage still held');
step(1); ok(ev.has('plate') && ev.has('vehicle'), 'bystander delivers vehicle + partial plate');
ok(/partial plate KL- 2-4/.test(describe(ev.believed())), 'description uses the partial plate: ' + describe(ev.believed()));
ev.setHold(cam.id, false); step(26); ok(ev.has('face') && ev.get('outfit.top').sources.length === 2, 'footage pulled: face known, top corroborated by two sources');
const m1 = ev.match(R, { kind: 'foot', dist: 10 }).score;
// invalidation
R.garments = { ...R.garments, top: { id: 'white', label: 'white tee' } }; step(0.2);
ok(!ev.has('outfit.top') && ev.believed()['outfit.top'], 'new shirt: top fact no longer valid, still believed (radio keeps saying it)');
ok(ev.changes.some((c) => c.kind === 'cleared' && c.key === 'outfit.top' && c.reason === 'changed clothes'), 'change log says why');
R.lastVehicle = { uid: 'car2', color: 'red', plate: 'ABC 111' }; R.vehicle = R.lastVehicle; step(0.2);
ok(!ev.has('vehicle') && !ev.has('plate'), 'swapped car: vehicle and plate cleared'); ok(ev.has('face'), 'face stays');
R.weapons = []; R.weaponVisible = null; step(0.2); ok(!ev.has('weapon'), 'ditched weapon: weapon cleared');
const m2 = ev.match(R, { kind: 'foot', dist: 10 }).score; ok(m2 < m1, `match drops after changes (${m1.toFixed(2)} -> ${m2.toFixed(2)})`);
R.masked = true; step(0.2); const m3 = ev.match(R, { kind: 'foot', dist: 10 }).score; ok(ev.get('face').concealed && m3 < 0.2, `mask conceals the face (match ${m3.toFixed(2)})`);
R.masked = false; R.garments.top = { id: 'teal', label: 'teal shirt' }; step(0.2); ok(ev.has('outfit.top'), 'putting the teal shirt back on matches again');
// recorder destroyed before the footage is pulled; bribed witness retracts
const ev2 = createEvidence({ now: () => T });
const c2 = ev2.addSource({ id: 'camera:x', type: 'camera', label: 'cam', pending: 20 }); ev2.observe(c2, 'face', {}, 1); ev2.cancelSource('camera:x', 'destroyed'); for (let i = 0; i < 300; i++) { T += 0.1; ev2.tick(0.1, R); }
ok(!ev2.has('face') && ev2.size === 0, 'recorder destroyed first: no camera evidence');
const w2 = ev2.addSource({ id: 'witness:w', type: 'witness', label: 'w' }); ev2.observe(w2, 'outfit.bottom', R.garments.bottom, 1); ok(ev2.has('outfit.bottom'), 'live witness fact'); ev2.cancelSource('witness:w', 'bribed'); ok(!ev2.has('outfit.bottom'), 'bribed witness retracts: fact gone');
// staleness: direction 28 s
const w3 = ev2.addSource({ id: 'officer:u', type: 'officer', label: 'ofc' }); ev2.observe(w3, 'direction', { compass: 'north' }, 1); for (let i = 0; i < 300; i++) { T += 0.1; ev2.tick(0.1, R); } ok(!ev2.has('direction'), 'direction goes stale on its own timer');
// core
const emits = []; const core = createWantedCore({ now: () => T, evidence: ev, emit: (n, d) => emits.push([n, d]) });
core.report({ type: 'robbery', pos: { x: 0, y: 0, z: 0 }, by: 'witness' }); ok(core.S.level === 2 && core.S.phase === 'search' && core.S.search, 'witness report: 2 stars, search area at the scene, no visual');
core.report({ type: 'cop_shot', pos: { x: 0, y: 0, z: 0 }, by: 'officer', visual: true }); ok(core.S.level === 3 && core.S.phase === 'pursuit', 'officer under fire: 3 stars, pursuit');
for (let i = 0; i < 40; i++) { T += 0.1; core.tick(0.1, { pos: { x: 0, y: 0, z: 0 }, seenNow: false, hidden: false, match: 0.8 }); } ok(core.S.phase === 'search', 'lost visual -> search');
let t0 = T; for (let i = 0; i < 2000 && core.S.level > 0; i++) { T += 0.1; core.tick(0.1, { pos: { x: 900, y: 0, z: 0 }, seenNow: false, hidden: false, match: 0.8 }); } ok(core.S.level === 0, `left the area: escaped after ${(T - t0).toFixed(0)} s`);
core.setStars(2, { x: 0, y: 0, z: 0 }); t0 = T; for (let i = 0; i < 3000 && core.S.level > 0; i++) { T += 0.1; core.tick(0.1, { pos: { x: 10, y: 0, z: 0 }, seenNow: false, hidden: false, match: 0.1 }); } ok(core.S.level === 0, `inside the area but no longer matching: escaped after ${(T - t0).toFixed(0)} s`);
core.setStars(2, { x: 0, y: 0, z: 0 }); t0 = T; for (let i = 0; i < 600; i++) { T += 0.1; core.tick(0.1, { pos: { x: 10, y: 0, z: 0 }, seenNow: false, hidden: false, match: 0.9 }); } ok(core.S.level > 0, 'inside the area and matching: not escaping');
for (let i = 0; i < 6000 && core.S.level > 0; i++) { T += 0.1; core.tick(0.1, { pos: { x: 10, y: 0, z: 0 }, seenNow: false, hidden: true, match: 0.9 }); } ok(core.S.level === 0, 'lying low out of sight works too');
const obs = { susp: 0, kind: 'foot', dist: 10, perception: 0.6 }; core.setStars(1, { x: 0, y: 0, z: 0 }); let rec = false; for (let i = 0; i < 100 && !rec; i++) { T += 0.1; rec = core.scrutinize(obs, 0.1, R, {}).recognized; } ok(rec, 'officer at 10 m recognizes a full match');
R.masked = true; R.garments = { top: { id: 'x', label: 'black hoodie' } }; obs.susp = 0; rec = false; for (let i = 0; i < 100 && !rec; i++) { T += 0.1; ev.tick(0.1, R); rec = core.scrutinize(obs, 0.1, R, {}).recognized; } ok(!rec, 'changed clothes + mask: walks past the same officer');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);

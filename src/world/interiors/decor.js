// Themed signature stations + decor for venues (INTERIORS agent).
// Stations wrap the layout's counter fixture (keeping its clerk spot, pay point and colliders) and add the
// recognisable kit: sushi conveyor, espresso bar, pizza oven, burger grill, taco station, oyster bar, wok line,
// poke/juice bars, cocktail/beer/wine bars. Decor adds lanterns, neon, TVs, chandeliers, tiki torches…
import * as THREE from 'three';
import { mats, frame, fbox, col, FIXTURES } from './fixtures.js';
import { stdMat, glowMat, textMesh } from './shared.js';

const flick = (ctx, mesh, base = 1, amp = 0.15, speed = 9) => { const ph = Math.random() * 6; ctx.anim.push(() => { const t = performance.now() / 1000; const k = base + Math.sin(t * speed + ph) * amp * 0.6 + Math.sin(t * speed * 2.3 + ph) * amp * 0.4; mesh.scale.set(1, k, 1); }); };
const fire = (ctx, x, y, z, s = 1) => { const m = new THREE.Mesh(FIRE_G, glowMat(new THREE.Color(3.2, 1.3, 0.3))); m.position.set(x, y + ctx.FY, z); m.scale.setScalar(s); ctx.grp.add(m); flick(ctx, m, 1, 0.25, 11); return m; };
const FIRE_G = new THREE.ConeGeometry(0.09, 0.28, 6).translate(0, 0.14, 0); FIRE_G.userData.shared = true;
const accent = (ctx) => stdMat(ctx.pal.accent, 0.5);
const neonText = (ctx, text, x, y, z, ry, size, color) => { const m = textMesh(text, { size, color: new THREE.Color(color).multiplyScalar(2.4), maxWidth: 3.2 }); m.position.set(x, y + ctx.FY, z); m.rotation.y = ry; ctx.grp.add(m); ctx.disposables.push(m.geometry); return m; };

// --------------------------------------------------------------------------- stations
export const STATIONS = {
  sushiConveyor(ctx, f) {
    FIXTURES.dinercounter(ctx, f); const M = mats(); const fr = frame(f); const len = fr.len;
    // belt along the counter top + moving plates (instanced, one draw call)
    fbox(ctx, fr, M.black, 0, 0.05, 1.16, len - 0.3, 0.02, 0.28); fbox(ctx, fr, M.chrome, 0, 0.21, 1.17, len - 0.3, 0.03, 0.02); fbox(ctx, fr, M.chrome, 0, -0.11, 1.17, len - 0.3, 0.03, 0.02);
    const n = Math.max(6, Math.floor(len / 0.32)); const geo = ctx.productGeo('conveyorPlate', 0), geo2 = ctx.productGeo('conveyorPlate', 1);
    const ims = [new THREE.InstancedMesh(geo, mats().atlas, Math.ceil(n / 2)), new THREE.InstancedMesh(geo2, mats().atlas, Math.floor(n / 2))]; ims.forEach((im) => { im.frustumCulled = false; ctx.grp.add(im); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(); let off = 0;
    const upd = () => { for (let i = 0; i < n; i++) { const t = ((i / n + off) % 1) * (len - 0.5) - (len - 0.5) / 2; const p = fr.pt(t, 0.05); m4.compose(new THREE.Vector3(p.x, 1.18 + ctx.FY, p.z), q, new THREE.Vector3(1, 1, 1)); ims[i % 2].setMatrixAt(i >> 1, m4); } ims.forEach((im) => { im.instanceMatrix.needsUpdate = true; }); };
    upd(); ctx.anim.push((dt) => { off = (off + dt * 0.035) % 1; upd(); });
    // chef station: fish display case, cutting board, knife
    const c = fr.pt(-len * 0.2, -fr.dep / 2 - 0.55); ctx.glassB.box(M.glass, c.x, 1.32 + ctx.FY, c.z, fr.along === 'x' ? 1.2 : 0.4, 0.25, fr.along === 'x' ? 0.4 : 1.2);
    for (let k = 0; k < 5; k++) { const p = fr.pt(-len * 0.2 - 0.48 + k * 0.24, -fr.dep / 2 - 0.55); ctx.B.box(stdMat([0xff8c69, 0xc1121f, 0xffd6a5, 0xff8c69, 0xc1121f][k], 0.4), p.x, 1.25, p.z, 0.18, 0.06, 0.1); }
    const cb = fr.pt(len * 0.15, -fr.dep / 2 - 0.55); ctx.B.box(stdMat(0xd9c4a0, 0.7), cb.x, 1.2, cb.z, 0.45, 0.03, 0.3); ctx.B.box(M.chrome, cb.x + 0.05, 1.22, cb.z, 0.25, 0.006, 0.03);
  },
  espressoBar(ctx, f) {
    FIXTURES.cafecounter(ctx, f); const M = mats(); const fr = frame(f); const len = fr.len;
    const em = fr.pt(-len / 2 + 0.75, -0.12); const bx = fr.along === 'x';
    ctx.B.box(M.chrome, em.x, 1.32, em.z, bx ? 0.75 : 0.5, 0.42, bx ? 0.5 : 0.75); ctx.B.box(accent(ctx), em.x, 1.55, em.z, bx ? 0.77 : 0.52, 0.05, bx ? 0.52 : 0.77);
    for (const k of [-0.18, 0.18]) { const p = fr.pt(-len / 2 + 0.75 + k, 0.1); ctx.B.add(M.black, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), p.x, 1.19, p.z); ctx.B.box(M.black, p.x, 1.17, p.z, 0.04, 0.02, 0.12); ctx.batch.add('coffeeCup', 0, p.x, 1.05 + ctx.FY, p.z, 0, 0.7); }
    for (let k = 0; k < 6; k++) { const p = fr.pt(-len / 2 + 0.5 + k * 0.1, -0.2); ctx.batch.add('coffeeCup', 0, p.x, 1.56 + ctx.FY, p.z, 0, 0.6); }
    const gr = fr.pt(-len / 2 + 0.18, -0.15); ctx.B.box(M.black, gr.x, 1.2, gr.z, 0.18, 0.3, 0.18); ctx.B.add(M.glass, new THREE.ConeGeometry(0.08, 0.16, 8).rotateX(Math.PI), gr.x, 1.43, gr.z);
    for (let k = 0; k < 6; k++) { const p = fr.pt(len / 2 - 0.25 - (k % 3) * 0.28, 0.05 + Math.floor(k / 3) * 0.2 - 0.1); ctx.batch.add(k % 2 ? 'pastelitos' : 'croissant', 0, p.x, 1.08 + ctx.FY, p.z, 0, 0.8); }
  },
  pizzaOven(ctx, f) {
    FIXTURES.kitchenpass(ctx, f); const M = mats(); const fr = frame(f); const len = fr.len;
    const o = fr.pt(-len * 0.25, -fr.dep / 2 - 1.0); const brick = stdMat(0x9c4a2f, 0.9);
    ctx.B.box(brick, o.x, 0.55, o.z, 1.5, 1.1, 1.3); ctx.B.add(brick, new THREE.SphereGeometry(0.75, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 0.85), o.x, 1.1, o.z);
    const mouth = fr.pt(-len * 0.25, -fr.dep / 2 - 0.4); ctx.B.box(M.black, mouth.x, 1.25, mouth.z, fr.along === 'x' ? 0.55 : 0.05, 0.32, fr.along === 'x' ? 0.05 : 0.55);
    fire(ctx, mouth.x, 1.1, mouth.z, 1.1); const fl = fr.pt(-len * 0.25 + 0.15, -fr.dep / 2 - 0.4); fire(ctx, fl.x, 1.1, fl.z, 0.8);
    ctx.B.add(stdMat(0x6d4c41, 0.8), new THREE.CylinderGeometry(0.15, 0.15, 0.6, 10), o.x, 1.75, o.z); col(ctx, o.x, 0.9, o.z, 1.5, 1.8, 1.3);
    for (let k = 0; k < 3; k++) { const p = fr.pt(-len / 2 + 0.35 + k * 0.45, 0); ctx.batch.add('pizza', k, p.x, 1.1 + ctx.FY, p.z, k); }
    for (let k = 0; k < 6; k++) { const p = fr.pt(len * 0.25 - 0.3 + (k % 3) * 0.16, -fr.dep / 2 - 0.85 + Math.floor(k / 3) * 0.16); ctx.batch.add('doughBall', 0, p.x, 1.0 + ctx.FY, p.z); }
    const pe = fr.pt(-len * 0.25 + 0.95, -fr.dep / 2 - 0.4); ctx.B.box(stdMat(0xc8a97e, 0.7), pe.x, 1.4, pe.z, 0.04, 1.4, 0.3);
  },
  burgerGrill(ctx, f) {
    FIXTURES.cafecounter(ctx, f); const M = mats(); const fr = frame(f); const len = fr.len;
    const g = fr.pt(0, -fr.dep / 2 - 1.05); const bx = fr.along === 'x'; ctx.B.box(M.steel, g.x, 0.5, g.z, bx ? 1.8 : 0.8, 1.0, bx ? 0.8 : 1.8); ctx.B.box(M.black, g.x, 1.02, g.z, bx ? 1.7 : 0.7, 0.02, bx ? 0.7 : 1.7);
    for (let k = 0; k < 6; k++) { const p = fr.pt(-0.6 + k * 0.24, -fr.dep / 2 - 1.05 + (k % 2) * 0.18); ctx.batch.add('patty', k, p.x, 1.03 + ctx.FY, p.z); }
    const hl = fr.pt(0, -fr.dep / 2 - 1.05); ctx.B.box(glowMat(new THREE.Color(2.5, 1.0, 0.3)), hl.x, 1.75, hl.z, bx ? 1.6 : 0.1, 0.03, bx ? 0.1 : 1.6); col(ctx, g.x, 0.5, g.z, bx ? 1.8 : 0.8, 1.0, bx ? 0.8 : 1.8);
    const fy = fr.pt(1.3, -fr.dep / 2 - 1.05); ctx.B.box(M.steel, fy.x, 0.5, fy.z, 0.6, 1.0, 0.7); for (const k of [-0.13, 0.13]) { const p = fr.pt(1.3 + k, -fr.dep / 2 - 1.05); ctx.B.box(stdMat(0xd4a017, 0.3), p.x, 1.02, p.z, 0.22, 0.02, 0.3); }
    for (let k = 0; k < 3; k++) { const p = fr.pt(len / 2 - 0.3 - k * 0.3, 0); ctx.batch.add('burgerPlate', 0, p.x, 1.06 + ctx.FY, p.z, 0); }
  },
  tacoStation(ctx, f) {
    FIXTURES.cafecounter(ctx, f); const M = mats(); const fr = frame(f); const len = fr.len;
    for (let k = 0; k < 6; k++) { const p = fr.pt(-len / 2 + 0.4 + k * 0.22, 0.05); ctx.batch.add('salsaBowl', k, p.x, 1.06 + ctx.FY, p.z); }
    const sg = fr.pt(-len / 2 + 0.95, 0.05); ctx.glassB.box(M.glass, sg.x, 1.32 + ctx.FY, sg.z, fr.along === 'x' ? 1.4 : 0.3, 0.02, fr.along === 'x' ? 0.3 : 1.4);
    const co = fr.pt(0.4, -fr.dep / 2 - 0.9); ctx.B.add(M.black, new THREE.CylinderGeometry(0.35, 0.35, 0.03, 16), co.x, 1.02, co.z); ctx.B.box(M.steel, co.x, 0.5, co.z, 1, 1, 0.8); col(ctx, co.x, 0.5, co.z, 1, 1, 0.8);
    for (let k = 0; k < 2; k++) { const p = fr.pt(0.2 + k * 0.4, -fr.dep / 2 - 0.9); ctx.batch.add('tortillas', 0, p.x, 1.04 + ctx.FY, p.z); }
    for (let k = 0; k < 2; k++) { const p = fr.pt(len / 2 - 0.4 - k * 0.35, 0); ctx.batch.add('tacoPlate', 0, p.x, 1.06 + ctx.FY, p.z, 0.3); }
  },
  openGrill(ctx, f) {
    FIXTURES.kitchenpass(ctx, f); const fr = frame(f); const len = fr.len;
    for (let k = 0; k < 4; k++) { const p = fr.pt(-len / 2 + 0.6 + k * (len - 1.2) / 3, -fr.dep / 2 - 1.0); fire(ctx, p.x, 1.05, p.z, 0.9); }
    for (let k = 0; k < 3; k++) { const p = fr.pt(-0.6 + k * 0.6, 0); ctx.batch.add('steakPlate', 0, p.x, 1.1 + ctx.FY, p.z, 0); }
  },
  oysterBar(ctx, f) {
    FIXTURES.dinercounter(ctx, f); const M = mats(); const fr = frame(f); const len = fr.len;
    const ice = fr.pt(-len * 0.15, -0.05); ctx.B.box(stdMat(0xe5f4ff, 0.2), ice.x, 1.18, ice.z, fr.along === 'x' ? len * 0.5 : 0.4, 0.05, fr.along === 'x' ? 0.4 : len * 0.5);
    for (let k = 0; k < 16; k++) { const p = fr.pt(-len * 0.15 - len * 0.22 + (k % 8) * len * 0.06, -0.12 + Math.floor(k / 8) * 0.15); ctx.batch.add(k % 4 === 3 ? 'lemon' : k % 3 ? 'shrimp' : 'oysterPlate', 0, p.x, 1.21 + ctx.FY, p.z, k, k % 3 && k % 4 !== 3 ? 1 : 0.45); }
    void M;
  },
  wokLine(ctx, f) {
    FIXTURES.kitchenpass(ctx, f); const M = mats(); const fr = frame(f); const len = fr.len;
    for (let k = 0; k < 3; k++) { const p = fr.pt(-len / 2 + 0.6 + k * 0.7, -fr.dep / 2 - 1.0); ctx.B.add(M.black, new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), p.x, 1.25, p.z); fire(ctx, p.x, 1.0, p.z, 0.8); }
    for (let k = 0; k < 3; k++) { const p = fr.pt(-0.5 + k * 0.5, 0); ctx.batch.add(k % 2 ? 'dumplingPlate' : 'noodleBowl', 0, p.x, 1.1 + ctx.FY, p.z, 0); }
  },
  pokeBar(ctx, f) {
    FIXTURES.cafecounter(ctx, f); const fr = frame(f); const len = fr.len;
    for (let k = 0; k < 10; k++) { const p = fr.pt(-len / 2 + 0.3 + (k % 5) * 0.2, -0.05 + Math.floor(k / 5) * 0.2); ctx.batch.add('salsaBowl', k + 2, p.x, 1.06 + ctx.FY, p.z); }
    for (let k = 0; k < 2; k++) { const p = fr.pt(len / 2 - 0.35 - k * 0.3, 0.05); ctx.batch.add('pokeBowl', 0, p.x, 1.06 + ctx.FY, p.z); }
  },
  juiceBar(ctx, f) {
    FIXTURES.cafecounter(ctx, f); const fr = frame(f); const len = fr.len;
    for (let k = 0; k < 3; k++) { const p = fr.pt(-len / 2 + 0.4 + k * 0.32, -0.15); ctx.batch.add('blender', k, p.x, 1.06 + ctx.FY, p.z); }
    for (let k = 0; k < 12; k++) { const p = fr.pt(len / 2 - 0.3 - (k % 6) * 0.12, -0.05 + Math.floor(k / 6) * 0.13); ctx.batch.add(k % 5 === 4 ? 'pineapple' : 'fruit', k, p.x, 1.06 + ctx.FY, p.z, 0, k % 5 === 4 ? 0.7 : 0.9); }
    for (let k = 0; k < 3; k++) { const p = fr.pt(0.1 + k * 0.15, 0.2); ctx.batch.add('juiceCup', k, p.x, 1.06 + ctx.FY, p.z); }
  },
  cocktailBar(ctx, f) {
    FIXTURES.barcounter(ctx, f); const M = mats(); const fr = frame(f); const len = fr.len;
    for (let k = 0; k < 4; k++) { const p = fr.pt(-len / 2 + 0.5 + k * 0.5, 0.05); ctx.batch.add(k % 2 ? 'coupe' : 'cocktailGlass', k, p.x, 1.15 + ctx.FY, p.z); }
    const gt = fr.pt(len / 2 - 0.5, -0.05); ctx.B.box(M.steel, gt.x, 1.17, gt.z, 0.3, 0.04, 0.15); for (let k = 0; k < 3; k++) { const p = fr.pt(len / 2 - 0.6 + k * 0.1, -0.05); ctx.batch.add(k === 1 ? 'lemon' : 'fruit', 2, p.x, 1.19 + ctx.FY, p.z, 0, 0.5); }
    const sh = fr.pt(len / 2 - 0.2, -0.1); ctx.B.add(M.chrome, new THREE.CylinderGeometry(0.04, 0.035, 0.22, 10), sh.x, 1.26, sh.z);
    // back-lit shelves in the venue accent colour
    const bb = fr.pt(0, -fr.dep / 2 - 1.2); ctx.B.box(glowMat(new THREE.Color(ctx.pal.accent).multiplyScalar(1.4)), bb.x, 1.7, bb.z, fr.along === 'x' ? len : 0.02, 1.1, fr.along === 'x' ? 0.02 : len);
  },
  clubBar(ctx, f) { STATIONS.cocktailBar(ctx, f); },
  beerTaps(ctx, f) {
    FIXTURES.barcounter(ctx, f); const M = mats(); const fr = frame(f);
    const t = fr.pt(0, -0.05); ctx.B.box(M.chrome, t.x, 1.4, t.z, fr.along === 'x' ? 0.9 : 0.12, 0.08, fr.along === 'x' ? 0.12 : 0.9);
    for (let k = 0; k < 6; k++) { const p = fr.pt(-0.38 + k * 0.15, -0.05); ctx.B.add(M.chrome, new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), p.x, 1.25, p.z); ctx.B.box(stdMat([0xe63946, 0x1d3557, 0xffb703, 0x2a9d8f, 0x6a040f, 0xf1faee][k], 0.4), p.x, 1.55, p.z, 0.03, 0.18, 0.03); }
    for (let k = 0; k < 4; k++) { const p = fr.pt(0.6 + k * 0.18, 0.1); ctx.batch.add('beerPint', k, p.x, 1.15 + ctx.FY, p.z); }
  },
  wineBar(ctx, f) { FIXTURES.barcounter(ctx, f); const fr = frame(f); for (let k = 0; k < 4; k++) { const p = fr.pt(-0.8 + k * 0.5, 0.05); ctx.batch.add(k % 2 ? 'cheeseBoard' : 'wineGlass', k, p.x, 1.15 + ctx.FY, p.z, 0, k % 2 ? 0.8 : 1); } },
  dinerCounter(ctx, f) { FIXTURES.dinercounter(ctx, f); },
  iceCase(ctx, f) { FIXTURES.icecase(ctx, f); },
};
// which layout counters a station may replace
export const STATION_ON = new Set(['counter', 'cafecounter', 'dinercounter', 'kitchenpass', 'barcounter', 'icecase']);

// --------------------------------------------------------------------------- decor
export const DECOR = {
  lanterns(ctx) { const n = Math.min(10, Math.floor(ctx.W * ctx.D / 10)); for (let i = 0; i < n; i++) { const x = (ctx.R() - 0.5) * (ctx.W - 2), z = (ctx.R() - 0.5) * (ctx.D - 3); const y = ctx.H - 1.25; ctx.B.add(glowMat(new THREE.Color([2.2, 2.0, 2.0][i % 3], [0.5, 1.6, 1.0][i % 3], [0.4, 1.2, 0.3][i % 3])), new THREE.SphereGeometry(0.17, 10, 8).scale(1, 1.25, 1), x, y, z); ctx.B.box(mats().black, x, y + 0.24, z, 0.18, 0.03, 0.18); ctx.B.box(mats().black, x, (y + ctx.H) / 2 + 0.1, z, 0.01, ctx.H - y - 0.5, 0.01); } },
  noren(ctx) { const z = -ctx.D / 2 + 0.06; for (let k = 0; k < 3; k++) { const g = new THREE.PlaneGeometry(0.38, 0.75); ctx.B.add(accent(ctx), g, -0.4 + k * 0.4, 2.0, z + 0.02); } ctx.B.box(mats().darkwood, 0, 2.4, z + 0.03, 1.3, 0.04, 0.04); const m = textMesh('WELCOME', { size: 0.07, color: new THREE.Color(1.2, 1.2, 1.2), maxWidth: 1.1 }); m.position.set(0, 2.05 + ctx.FY, z + 0.03); ctx.grp.add(m); ctx.disposables.push(m.geometry); },
  bonsai(ctx) { DECOR.plants(ctx, 1); },
  plants(ctx, n = 3) { for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1; ctx.prop('plant', '', side * (ctx.W / 2 - 0.45), ctx.D / 2 - 1.2 - i * 2.2, ctx.R() * 6, { pot: ['#bc6c25', '#f1faee', '#264653'][i % 3], leaf: ['#2d6a4f', '#40916c'][i % 2] }); } },
  ceilingFans(ctx) { const M = mats(); const g = new THREE.BoxGeometry(0.75, 0.015, 0.13).translate(0.42, 0, 0); for (const x of [-ctx.W / 4, ctx.W / 4]) { const fan = new THREE.Group(); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(g, M.wood); b.rotation.y = k * Math.PI / 2; fan.add(b); } fan.position.set(x, ctx.H - 0.95 + ctx.FY, 0); ctx.grp.add(fan); ctx.B.box(M.dark, x, ctx.H - 0.78, 0, 0.03, 0.3, 0.03); ctx.anim.push((dt) => { fan.rotation.y += dt * 3.5; }); } },
  photoWall(ctx) { for (let k = 0; k < 6; k++) { const x = -ctx.W / 2 + 0.03, z = -ctx.D / 2 + 1.5 + (k % 3) * 0.7, y = 1.7 + Math.floor(k / 3) * 0.6; ctx.B.box(mats().black, x, y, z, 0.03, 0.48, 0.58); ctx.B.add(mats().atlas, ctx.labelPlane('mag', k, { art: 'face' }, 0.4, 0.5), x + 0.02, y, z, Math.PI / 2); } },
  chalkboard(ctx) { const z = -ctx.D / 2 + 0.05; const x = ctx.W / 4; ctx.B.box(stdMat(0x25332c, 0.9), x, 2.1, z, 1.6, 1.0, 0.03); ctx.B.box(mats().darkwood, x, 2.1, z - 0.01, 1.7, 1.1, 0.02); const items = (ctx.theme?.menu || []).slice(0, 4); items.forEach(([n, p], i) => { const m = textMesh(`${n}  $${p}`, { size: 0.07, color: new THREE.Color(1.1, 1.1, 1.05), maxWidth: 1.4 }); m.position.set(x, 2.45 - i * 0.2 + ctx.FY, z + 0.02); ctx.grp.add(m); ctx.disposables.push(m.geometry); }); },
  flourSacks(ctx) { for (let k = 0; k < 4; k++) ctx.B.box(stdMat(0xe9e1cf, 0.9), ctx.W / 2 - 0.4, 0.2 + Math.floor(k / 2) * 0.32, -ctx.D / 2 + 0.6 + (k % 2) * 0.45, 0.4, 0.3, 0.42); },
  stringLights(ctx) { const g = new THREE.SphereGeometry(0.035, 6, 4); const warm = glowMat(new THREE.Color(2.6, 1.8, 0.9)); for (let r = 0; r < 3; r++) { const z = -ctx.D / 2 + (r + 1) * ctx.D / 4; for (let i = 0; i <= 14; i++) { const t = i / 14; const x = -ctx.W / 2 + 0.3 + t * (ctx.W - 0.6); ctx.B.add(warm, g, x, ctx.H - 0.75 - Math.sin(t * Math.PI) * 0.35, z); } } },
  neonSigns(ctx) { const words = { burger: ['BURGERS', 'OPEN LATE'], diner: ['EAT', 'PIE & COFFEE'], sports: ['LOBO LAGER', 'GAME DAY'], dive: ['COLD BEER', 'NO CREDIT'], tiki: ['MAI TAI'], club: ['DANCE'] }[ctx.theme?.key] || ['OPEN', 'GOOD VIBES']; words.forEach((w, i) => { const side = i % 2 ? 1 : -1; neonText(ctx, w, side * (ctx.W / 2 - 0.04), 2.6, -ctx.D / 4, -side * Math.PI / 2, 0.28, i % 2 ? ctx.theme?.neon || '#ff3fa4' : '#4cc9f0'); }); },
  menuLightbox(ctx) { const z = -ctx.D / 2 + 0.06; const b = ctx.menuBoard(Math.min(3.2, ctx.W - 1.5), 1.0); b.position.set(0, ctx.H - 1.25 + ctx.FY, z); ctx.grp.add(b); ctx.B.box(glowMat(new THREE.Color(1.6, 1.6, 1.5)), 0, ctx.H - 1.25, z - 0.02, Math.min(3.3, ctx.W - 1.4), 1.1, 0.01); },
  papelPicado(ctx) { const cols = [0xff5d8f, 0x2ec4b6, 0xffb703, 0x7b2cbf, 0xe63946]; for (let r = 0; r < 3; r++) { const z = -ctx.D / 2 + (r + 1) * ctx.D / 4; for (let i = 0; i < 12; i++) { const x = -ctx.W / 2 + 0.4 + i * (ctx.W - 0.8) / 11; ctx.B.add(stdMat(cols[(i + r) % 5], 0.8), new THREE.PlaneGeometry(0.28, 0.32), x, ctx.H - 0.95 - Math.sin(i / 11 * Math.PI) * 0.25, z); } } },
  pinata(ctx) { const c = new THREE.Vector3((ctx.R() - 0.5) * ctx.W * 0.5, ctx.H - 1.4, (ctx.R() - 0.5) * ctx.D * 0.4); const cols = [0xff5d8f, 0xffb703, 0x2ec4b6, 0x7b2cbf, 0xe63946, 0x06d6a0]; ctx.B.add(stdMat(0xffb703, 0.7), new THREE.SphereGeometry(0.2, 8, 6), c.x, c.y, c.z); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.B.add(stdMat(cols[k], 0.7), new THREE.ConeGeometry(0.08, 0.3, 6), c.x + Math.cos(a) * 0.25, c.y + Math.sin(a) * 0.25, c.z, 0, 0, a - Math.PI / 2); } },
  chandeliers(ctx) { const brass = mats().brass; const bulb = glowMat(new THREE.Color(2.6, 2.0, 1.2)); for (const z of [-ctx.D / 5, ctx.D / 5]) { const y = ctx.H - 1.3; ctx.B.add(brass, new THREE.TorusGeometry(0.42, 0.02, 5, 20).rotateX(Math.PI / 2), 0, y, z); ctx.B.box(brass, 0, (y + ctx.H) / 2, z, 0.02, ctx.H - y - 0.5, 0.02); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.B.add(bulb, new THREE.SphereGeometry(0.04, 6, 4), Math.cos(a) * 0.42, y + 0.07, z + Math.sin(a) * 0.42); } } },
  wineWall(ctx) { FIXTURES.winerack(ctx, { k: 'winerack', x: ctx.W / 2 - 0.25, z: -ctx.D / 4, sx: 0.45, sz: Math.min(3, ctx.D / 2), face: '-x' }); },
  paintings(ctx) { for (let k = 0; k < 3; k++) { const side = k % 2 ? 1 : -1; const x = side * (ctx.W / 2 - 0.03), z = -ctx.D / 3 + k * ctx.D / 4; ctx.B.box(mats().brass, x, 2.2, z, 0.04, 0.85, 1.15); ctx.B.add(mats().atlas, ctx.labelPlane('mag', k + 2, { art: 'wave' }, 1.0, 0.7), x - side * 0.025, 2.2, z, -side * Math.PI / 2); } },
  nets(ctx) { const rope = stdMat(0x5a4a3a, 1); const x = -ctx.W / 2 + 0.05; for (let i = 0; i <= 12; i++) ctx.B.box(rope, x, 2.6, -1.2 + i * 0.2, 0.01, 1.2, 0.012); for (let j = 0; j <= 6; j++) ctx.B.box(rope, x, 2.0 + j * 0.2, 0, 0.01, 0.012, 2.4); },
  buoys(ctx) { for (let k = 0; k < 4; k++) ctx.B.add(stdMat([0xe63946, 0xffffff, 0xffb703, 0x1d6fa3][k], 0.5), new THREE.SphereGeometry(0.13, 8, 6).scale(1, 1.3, 1), -ctx.W / 2 + 0.2, 2.2 + (k % 2) * 0.3, -1 + k * 0.6); },
  surfboards(ctx) { const M = mats(); for (let k = 0; k < 3; k++) ctx.B.add(M.board[k % 6], new THREE.SphereGeometry(0.5, 10, 6).scale(0.07, 2.0, 0.5), ctx.W / 2 - 0.06, 2.0, -ctx.D / 4 + k * 0.7, 0, 0, 0.12); },
  jukebox(ctx) { const x = -ctx.W / 2 + 0.5, z = 0; ctx.B.box(stdMat(0x7f1d1d, 0.4), x, 0.75, z, 0.6, 1.5, 0.55); ctx.B.add(glowMat(new THREE.Color(2.4, 1.4, 0.4)), new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), x + 0.3, 1.45, z); ctx.B.box(mats().chrome, x + 0.29, 0.9, z, 0.02, 0.5, 0.4); col(ctx, x, 0.75, z, 0.6, 1.5, 0.55); },
  luckyCat(ctx) { const x = ctx.W / 2 - 0.6, z = ctx.D / 2 - 1.6; ctx.B.add(stdMat(0xf4f1ea, 0.4), new THREE.SphereGeometry(0.12, 8, 6), x, 1.22, z); ctx.B.add(stdMat(0xf4f1ea, 0.4), new THREE.SphereGeometry(0.09, 8, 6), x, 1.38, z); ctx.B.box(stdMat(0xc9a227, 0.3), x + 0.1, 1.42, z, 0.04, 0.12, 0.04); ctx.B.box(mats().darkwood, x, 0.55, z, 0.4, 1.1, 0.4); col(ctx, x, 0.55, z, 0.4, 1.1, 0.4); },
  fruitWall(ctx) { const z = -ctx.D / 2 + 0.25; for (let r = 0; r < 3; r++) { ctx.B.box(mats().wood, -ctx.W / 4, 1.2 + r * 0.45, z, 2.4, 0.03, 0.3); for (let k = 0; k < 14; k++) ctx.batch.add('fruit', k + r, -ctx.W / 4 - 1.1 + k * 0.165, 1.22 + r * 0.45 + ctx.FY, z, 0, 0.9); } },
  bagShelf(ctx) { const z = -ctx.D / 2 + 0.2; for (let r = 0; r < 2; r++) { ctx.B.box(mats().wood, ctx.W / 4, 1.5 + r * 0.45, z, 2.0, 0.03, 0.28); for (let k = 0; k < 10; k++) ctx.batch.add('coffeebag', k % 3, ctx.W / 4 - 0.9 + k * 0.2, 1.52 + r * 0.45 + ctx.FY, z, 0); } },
  pendants(ctx) { const bulb = glowMat(new THREE.Color(2.6, 2.1, 1.4)); for (let i = 0; i < 6; i++) { const x = -ctx.W / 2 + 1 + (i % 3) * (ctx.W - 2) / 2, z = -ctx.D / 4 + Math.floor(i / 3) * ctx.D / 3; const y = ctx.H - 1.4; ctx.B.add(mats().black, new THREE.ConeGeometry(0.16, 0.2, 10, 1, true), x, y + 0.1, z); ctx.B.add(bulb, new THREE.SphereGeometry(0.05, 6, 4), x, y + 0.02, z); ctx.B.box(mats().black, x, (y + ctx.H) / 2 + 0.05, z, 0.01, ctx.H - y - 0.6, 0.01); } },
  thatch(ctx) { const straw = stdMat(0xc8a96e, 1); const bar = ctx.L.fixtures.find((f) => /barcounter|cocktail/.test(f.k)); if (!bar) return; const fr = frame(bar); for (let t = -fr.len / 2; t <= fr.len / 2 + 1e-3; t += fr.len / 2) { const p = fr.pt(t, fr.dep / 2 + 0.05); ctx.B.add(mats().darkwood, new THREE.CylinderGeometry(0.06, 0.07, ctx.H - 0.9, 6), p.x, (ctx.H - 0.9) / 2, p.z); } const c = fr.pt(0, -0.3); ctx.B.add(straw, new THREE.BoxGeometry(fr.along === 'x' ? fr.len + 0.6 : 2.0, 0.1, fr.along === 'x' ? 2.0 : fr.len + 0.6), c.x, ctx.H - 0.95, c.z, 0, fr.along === 'x' ? 0.18 : 0, fr.along === 'x' ? 0 : 0.18); },
  tikiTorches(ctx) { for (const [x, z] of [[-ctx.W / 2 + 0.4, ctx.D / 2 - 0.8], [ctx.W / 2 - 0.4, ctx.D / 2 - 0.8]]) { ctx.B.add(mats().darkwood, new THREE.CylinderGeometry(0.03, 0.04, 1.6, 6), x, 0.8, z); ctx.B.add(mats().black, new THREE.CylinderGeometry(0.06, 0.05, 0.12, 6), x, 1.64, z); fire(ctx, x, 1.68, z, 0.7); col(ctx, x, 0.8, z, 0.12, 1.6, 0.12); } },
  tvs(ctx) { for (const side of [-1, 1]) { const x = side * (ctx.W / 2 - 0.08); ctx.B.box(mats().black, x, ctx.H - 1.55, -ctx.D / 6, 0.06, 0.75, 1.3); ctx.B.add(mats().tv, new THREE.PlaneGeometry(1.22, 0.68), x - side * 0.035, ctx.H - 1.55, -ctx.D / 6, -side * Math.PI / 2); } },
  pennants(ctx) { const cols = [0x1d3557, 0xe63946, 0xf1faee]; for (let i = 0; i < 16; i++) { const x = -ctx.W / 2 + 0.4 + i * (ctx.W - 0.8) / 15; ctx.B.add(stdMat(cols[i % 3], 0.8), new THREE.ConeGeometry(0.1, 0.25, 3).rotateX(Math.PI), x, ctx.H - 0.95, -ctx.D / 2 + 0.6); } },
  pool(ctx) { /* pool table comes from the bar layout */ },
  lasers(ctx) { const beams = []; for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(LASER_G, glowMat(new THREE.Color(...[[0, 3, 0.6], [3, 0, 2.4], [0.4, 1.6, 3]][k % 3]))); m.position.set(0, ctx.H - 0.8 + ctx.FY, -ctx.D / 2 + 1.2); ctx.grp.add(m); beams.push(m); } ctx.anim.push((dt, night) => { const t = performance.now() / 1000; beams.forEach((b, i) => { b.visible = night; b.rotation.set(0.9 + Math.sin(t * 0.7 + i) * 0.4, t * 0.5 + i, 0); }); }); },
  speakers(ctx) { /* club layout adds speaker stacks */ },
};
const LASER_G = new THREE.CylinderGeometry(0.006, 0.006, 9, 4).translate(0, -4.5, 0); LASER_G.userData.shared = true;

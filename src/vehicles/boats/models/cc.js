// Center consoles, 21 to 42 ft: single to quad outboards. Original designs (Tidewright / Marazul), true to the category:
// deep-V hull with flared bow, self-bailing cockpit, console amidships, leaning post or helm chairs, T-top or hardtop,
// raised forward seating, engines on a notched transom (small) or an integral bracket with swim platforms (large).
import { S, lerp } from '../kit.js';
import { makeHull } from '../hull.js';
import * as P from '../parts.js';

const PI = Math.PI;
const SIZES = {
  cc21: { name: 'Baywright 21', builder: 'tidewright', L: 6.45, B: 2.44, draft: 0.38, fb: [0.6, 0.66, 0.98], dead: 18, mass: 1650, vmax: 74, engines: [1], hp: [115, 150, 200], bracket: false, top: ['ttop', 'ttop', 'bimini', 'none'], helm: 'post', consoleW: 0.8, tris: 0 },
  cc26: { name: 'Bluewright 26', builder: 'tidewright', L: 7.9, B: 2.64, draft: 0.46, fb: [0.66, 0.74, 1.14], dead: 21, mass: 2900, vmax: 84, engines: [2, 2, 1], hp: [200, 250, 300], bracket: true, top: ['ttop', 'hard', 'hard'], helm: 'post', consoleW: 0.92 },
  cc34: { name: 'Corsario 34', builder: 'marazul', L: 10.4, B: 3.1, draft: 0.56, fb: [0.78, 0.86, 1.34], dead: 23, mass: 5600, vmax: 96, engines: [3, 3, 2], hp: [300, 350, 400], bracket: true, top: ['hard'], helm: 'chairs', consoleW: 1.3, rows: 2 },
  cc42: { name: 'Corsario 42', builder: 'marazul', L: 12.8, B: 3.72, draft: 0.66, fb: [0.9, 1.0, 1.52], dead: 24, mass: 9800, vmax: 104, engines: [4, 4, 3], hp: [350, 400, 425], bracket: true, top: ['hard'], helm: 'chairs', consoleW: 1.7, rows: 2, enclosure: true },
};

function build(cfg, { K, id, opt, r, decals }) {
  const { L, B } = cfg, big = L > 9;
  const H = makeHull({ L, B, draft: cfg.draft, fbAft: cfg.fb[0], fbMid: cfg.fb[1], fbBow: cfg.fb[2], deadrise: cfg.dead, transomW: 0.9, maxU: 0.4, foreU: 0.5, bowPow: 2.15, bowQ: 1.18,
    chineW: 0.925, chineWFwd: 0.42, chineBow: 0.5, flarePow: 1.55, tumble: big ? 0.05 : 0.02, stemU: 0.84, stemPow: 1.35, strakes: 2, transomRake: 0.0 });
  const notchY = -cfg.draft + (opt.hp >= 200 ? 0.635 : 0.508) + 0.03, zT = H.zOf(0), ys0 = H.sheerY(0);
  H.skin(K, cfg.bracket ? {} : { notch: { w: 0.36 + opt.engines * 0.62, y: notchY } });
  H.rubRail(K, { insert: true, r: 0.02 }); H.sprayRail(K, 0.1, { u0: 0.3, u1: 0.95, r: 0.014 });
  const sole = 0.12, uA = 0.075, uF = big ? 0.63 : 0.6, capW = big ? 0.24 : 0.2, yFwd = sole + (big ? 0.5 : 0.44);
  // cockpit: sole, liner walls, gunwale caps, coaming bolsters
  H.deck(K, 'nonskid', S.nonskid, uA - 0.01, uF + 0.005, sole, capW * 0.55);
  H.liner(K, 'gel', S.liner, uA - 0.01, uF + 0.01, sole, { inset: capW * 0.55 });
  H.cap(K, 'gel', S.deck, 0, 1, (u) => (u > 0.93 ? capW * 3 : capW));
  H.liner(K, 'vinyl', S.upA, uA + 0.02, uF - 0.02, (u) => H.sheerY(u) - 0.17, { inset: capW * 0.55 - 0.02, yTop: (u) => H.sheerY(u) - 0.035 });
  // aft bulkhead: livewell / bench module across the transom
  const zA = H.zOf(uA), wA = H.halfBeam(uA) * 2 - capW * 1.1, bh = ys0 - sole;
  K.rbox('gel', S.liner, wA, bh, zA - zT - 0.02, 0.03, 0, sole + bh / 2, (zA + zT) / 2 + 0.01);
  P.hatch(K, -wA * 0.27, ys0 + 0.0, (zA + zT) / 2, wA * 0.3, (zA - zT) * 0.62); P.hatch(K, wA * 0.27, ys0, (zA + zT) / 2, wA * 0.3, (zA - zT) * 0.62);
  if (opt.aftBench) { K.at(0, sole + 0.34, zA + 0.2, () => P.cushion(K, wA * 0.72, 0.09, 0.36, { pleats: 5, stripe: true })); K.at(0, sole + 0.42, zA + 0.035, () => P.cushion(K, wA * 0.72, 0.07, 0.3, { pleats: 5 }), -PI / 2 + 0.1);
    K.rbox('gel', S.liner, wA * 0.72, 0.34, 0.38, 0.02, 0, sole + 0.17, zA + 0.2); K.anchor('seat', wA * 0.2, sole + 0.43, zA + 0.22, { pose: 'sit' }); K.anchor('seat', -wA * 0.2, sole + 0.43, zA + 0.22, { pose: 'sit' }); }
  // engines: integral bracket with swim platforms, or a notched transom with a splash well
  const gap = big ? 0.7 : 0.66, xs = P.engineXs(opt.engines, gap);
  let zEng = zT, yEng = notchY;
  if (cfg.bracket) {
    const bw = Math.max(0.9, opt.engines * gap + 0.25), bl = big ? 0.85 : 0.7, yTop = notchY - 0.02, yBot = -cfg.draft * 0.55;
    P.profileX(K, 'gel', S.hull, [[zT - bl, yTop], [zT + 0.02, yTop], [zT + 0.02, -cfg.draft * 0.95], [zT - bl * 0.55, yBot], [zT - bl, yBot + 0.12]].reverse(), bw, { bevel: 0.025 });
    zEng = zT - bl - 0.03; yEng = yTop + 0.03;
    // swim platforms either side of the engines + ladder on port
    K.mirror((sx) => { const pw = H.halfBeam(0) - bw / 2 - 0.02, x = bw / 2 + pw / 2 + 0.01; K.rbox('gel', S.deck, pw, 0.07, bl * 0.82, 0.03, x, yTop + 0.06, zT - bl * 0.41 - 0.01); K.rbox('nonskid', S.nonskid, pw * 0.8, 0.008, bl * 0.62, 0.003, x, yTop + 0.098, zT - bl * 0.41 - 0.01);
      K.rod('metal', S.steel, [x, yTop + 0.03, zT - bl * 0.7], [x * 0.9, -0.02, zT - 0.02], 0.014); });
    K.at(H.halfBeam(0) * 0.62, notchY + 0.08, zT - bl * 0.82, () => P.swimLadder(K, { w: 0.28 }));
    K.anchor('board', H.halfBeam(0) * 0.62, notchY + 0.08, zT - bl * 0.5, { kind: 'platform' });
    // transom door (starboard) outline + walk-through step
    K.rbox('gel', S.liner, 0.5, bh * 0.9, 0.03, 0.01, -wA * 0.34, sole + bh * 0.47, zT + 0.022);
    K.rbox('metal', S.steel, 0.03, 0.12, 0.012, 0.004, -wA * 0.34 + 0.2, sole + bh * 0.7, zT + 0.04);
  } else {
    const nw = 0.36 + opt.engines * 0.62 - 0.08; // splash well
    K.rbox('gel', S.liner, nw, 0.03, zA - zT - 0.05, 0.01, 0, notchY - 0.02, (zA + zT) / 2); K.mirror((sx) => K.rbox('gel', S.liner, 0.03, ys0 - notchY + 0.02, zA - zT - 0.05, 0.01, sx * nw / 2, (ys0 + notchY) / 2, (zA + zT) / 2));
    K.rbox('gel', S.liner, nw, ys0 - notchY + 0.02, 0.03, 0.01, 0, (ys0 + notchY) / 2, zA - 0.04);
    K.mirror((sx) => K.anchor('board', sx * (H.halfBeam(0) * 0.6), ys0, zT + 0.15, { kind: 'transom' }));
  }
  xs.forEach((x, i) => P.outboard(K, 'ob' + i, x, yEng, zEng, { hp: opt.hp, id, decals }));
  P.trimTabs(K, H); P.underwaterLights(K, big ? [-0.7, -0.25, 0.25, 0.7] : [-0.45, 0.45], -0.16, cfg.bracket ? zT : zT, r.chance(0.5) ? S.blue : S.white);
  // forward: raised seating deck with a step, U-shaped cushions, anchor locker
  H.deck(K, 'gel', S.deck, uF, 0.975, yFwd, capW * 0.55, { edge: yFwd - sole, edgeFwd: false });
  H.liner(K, 'gel', S.liner, uF, 0.985, yFwd, { inset: capW * 0.55 });                         // inner topsides around the forward seating
  H.deck(K, 'nonskid', S.nonskid, uF + 0.02, 0.93, yFwd + 0.006, capW * 0.55 + 0.3, {});
  const zF = H.zOf(uF);
  K.rbox('gel', S.deck, 0.6, 0.2, 0.26, 0.03, 0, sole + 0.1, zF - 0.13); K.rbox('nonskid', S.nonskid, 0.5, 0.006, 0.2, 0.002, 0, sole + 0.203, zF - 0.13); // step
  if (opt.bowCushions) K.mirror((sx) => { const n = 5; for (let i = 0; i < n; i++) { const ua = lerp(uF + 0.015, 0.9, i / n), ub = lerp(uF + 0.015, 0.9, (i + 1) / n), um = (ua + ub) / 2, wHalf = H.half(um, yFwd) - capW * 0.55, cw = Math.min(0.56, wHalf * 0.8); if (wHalf < 0.3) continue;
      K.at(wHalf - cw / 2 - 0.01, yFwd + 0.004, H.zOf(um), () => P.cushion(K, cw, 0.085, (ub - ua) * L - 0.015, { pleats: 2, piping: i === 0 || i === n - 1 })); }
    K.anchor('seat', H.half(uF + 0.12, yFwd) - 0.5, yFwd + 0.09, H.zOf(uF + 0.12), { pose: 'sit', face: sx > 0 ? -PI / 2 : PI / 2 }); });
  P.hatch(K, 0, yFwd + 0.004, H.zOf(0.93), 0.36, 0.3, { nonskid: false });
  if (opt.bowRail) P.bowRail(K, H, big ? 0.6 : 0.64, 1, { h: big ? 0.3 : 0.26, inset: 0.09, posts: big ? 5 : 4 });
  if (opt.anchor) K.at(0, H.sheerY(1) + 0.015, H.zOf(0.985), () => P.bowAnchor(K));
  P.sideLights(K, H, 0.93, { inset: 0.07 });
  // console, helm seating, top
  const uC = big ? 0.43 : 0.44, zC = H.zOf(uC), cw = cfg.consoleW;
  let con;
  K.at(0, sole, zC, () => { con = P.centerConsole(K, { w: cw, l: big ? 1.15 : 0.9, h: big ? 1.2 : 1.1, screens: big || opt.screens === 2 ? 2 : 1, throttles: Math.min(2, opt.engines), windshield: opt.top === 'none' ? 'low' : (cfg.enclosure ? 'none' : 'tall'), seat: true, wheelX: cfg.helm === 'chairs' ? cw * 0.2 : 0.06 }); });
  const zHelm = zC - (big ? 1.15 : 0.9) / 2 - (cfg.helm === 'chairs' ? 0.78 : 0.62);
  if (cfg.helm === 'post') K.at(0, sole, zHelm, () => P.leaningPost(K, { w: Math.min(1.05, cw + 0.08), rods: 4, coolerSlot: S.gear }));
  else { const n = big && L > 12 ? 3 : 3, sp = (cw + 0.2) / n; for (let i = 0; i < n; i++) K.at((i - (n - 1) / 2) * sp, sole, zHelm, () => P.helmChair(K, { w: Math.min(0.52, sp - 0.06) }));
    K.rbox('gel', S.liner, cw + 0.3, 0.2, 0.5, 0.03, 0, sole + 0.1, zHelm); // seat base plinth
    if (cfg.rows === 2) { const z2 = zHelm - 1.0; K.at(0, sole, z2, () => P.bench(K, cw + 0.3, 0.5, { baseH: 0.42, backH: 0.45, pleats: 6, stripe: true }), 0, 0, 0); K.rbox('gel', S.liner, cw + 0.34, 0.9, 0.5, 0.04, 0, sole + 0.45, z2 - 0.5); P.hatch(K, 0, sole + 0.9, z2 - 0.5, cw * 0.7, 0.36); // tackle / grill station
      K.rbox('metal', S.steel, 0.3, 0.02, 0.24, 0.005, cw * 0.3, sole + 0.915, z2 - 0.5); } }
  if (opt.top === 'ttop' || opt.top === 'hard') {
    const tw = Math.min(B - 0.5, cw + (big ? 1.1 : 0.72)), tl = big ? (cfg.rows === 2 ? 3.6 : 2.6) : 2.0, th = big ? 2.12 : 2.02, tz = zC - (big ? 0.55 : 0.32) - (cfg.rows === 2 ? 0.45 : 0);
    K.at(0, sole, tz, () => P.tTop(K, { w: tw, l: tl, h: th, legW: cw + 0.02, legZ0: zC - tz - (big ? 0.5 : 0.36), legZ1: zC - tz + (big ? 0.42 : 0.34), cz: 0, hard: opt.top === 'hard', rods: big ? 6 : 5, radar: opt.radar, outriggers: opt.outriggers, antenna: big ? 2 : 1 }));
    if (cfg.enclosure) { // glass enclosure from console top to hardtop
      const h0 = sole + 1.2, h1 = sole + th - 0.06, z0 = zC + 0.3; const rings = []; for (const [yy, k] of [[h0, 0], [h1, 1]]) { const row = []; for (let i = 0; i <= 10; i++) { const t = i / 10 * 2 - 1; row.push([t * (cw / 2 + 0.02 + k * 0.12), yy, z0 - Math.pow(Math.abs(t), 2.6) * 0.3 - k * 0.42]); } rings.push(row); } K.loft('glass', S.white, rings);
      K.mirror((sx) => K.rod('gel', S.top, [sx * (cw / 2 + 0.02), h0, z0 - 0.3], [sx * (cw / 2 + 0.14), h1, z0 - 0.72], 0.025)); }
  } else if (opt.top === 'bimini') K.at(0, H.sheerY(uC - 0.06), zC - 0.5, () => P.bimini(K, { w: B - 0.34, l: 1.9, h: 1.55 }));
  if (opt.top === 'none' || opt.top === 'bimini') P.sternLight(K, -H.halfBeam(0.04) + 0.16, ys0 + 0.01, H.zOf(0.035), 1.25);
  // hardware: cleats, rod holders, cup holders, fuel fill, scuppers, speakers, sole hatches
  for (const u of [0.035, 0.5, 0.9]) K.mirror((sx) => P.cleat(K, H.halfBeam(u) - capW * (u > 0.85 ? 0.9 : 0.42), H.sheerY(u) + 0.014, H.zOf(u), 0, 0.2));
  for (const u of big ? [0.12, 0.2, 0.28, 0.36] : [0.13, 0.22, 0.31]) K.mirror((sx) => P.rodHolder(K, H.halfBeam(u) - capW * 0.45, H.sheerY(u) + 0.014, H.zOf(u), -0.5, -0.25));
  K.mirror((sx) => { K.cyl('metal', S.steel, 0.028, 0.028, 0.006, H.halfBeam(0.42) - capW * 0.45, H.sheerY(0.42) + 0.016, H.zOf(0.42), 0, 0, 0, 12);   // fuel / water fills
    for (const u of [0.09, 0.2]) { K.rbox('matte', S.black, 0.012, 0.035, 0.12, 0.004, H.half(u, sole + 0.05) - capW * 0.55 - 0.004, sole + 0.035, H.zOf(u)); }   // scuppers
    for (const u of [0.26, 0.56]) K.cyl('matte', S.black, 0.075, 0.075, 0.016, H.half(u, sole + 0.25) - capW * 0.55 - 0.006, sole + 0.26, H.zOf(u), 0, 0, PI / 2, 16); });
  P.hatch(K, 0, sole, H.zOf(0.2), 0.5, 0.8); K.mirror((sx) => P.hatch(K, B * 0.24, sole, H.zOf(0.31), 0.34, 0.9));
  // under-gunwale rod racks
  K.mirror((sx) => { if (!r.chance(0.7)) return; const x = H.half(0.3, sole + 0.3) - capW * 0.55 - 0.05; for (let k = 0; k < 2; k++) K.at(x, sole + 0.28 + k * 0.1, H.zOf(0.16), () => P.rod(K, { len: 2.0 + k * 0.15, slot: r.pick([S.black, S.navy, S.red]) }), PI / 2, 0, 0); });
  // seeded gear
  P.fillRodTubes(K, r, opt.rodChance);
  for (const g of opt.gear) {
    if (g === 'cooler') K.at(r.range(-0.3, 0.3), sole, H.zOf(0.17) + r.range(-0.1, 0.2), () => P.cooler(K, { w: r.range(0.6, 0.85), h: 0.4, d: 0.42, slot: S.gear, lidSlot: r.chance(0.5) ? S.white : S.gear }), 0, r.range(-0.2, 0.2), 0);
    if (g === 'coil') K.at(H.half(0.14, sole) - capW - 0.25, sole, H.zOf(0.13), () => P.coil(K, 0.17, 4, r.pick([S.rope, S.white, S.navy])));
    if (g === 'bucket') { const x = -(H.half(0.25, sole) - capW - 0.2), z = H.zOf(0.24); K.cyl('matte', r.pick([S.white, S.orange, S.blue]), 0.15, 0.125, 0.34, x, sole + 0.17, z, 0, 0, 0, 16, true); K.torus('metal', S.steel, 0.15, 0.004, x, sole + 0.36, z, 0.5, 0, 0, 14, 4, PI); }
    if (g === 'ring') K.at(-0.0, sole + (big ? 1.2 : 1.1) * 0.5, zC + (big ? 0.6 : 0.47) + 0.44, () => P.lifeRing(K, 0.26), 0.1);
    if (g === 'tanks') for (let i = 0; i < 3; i++) K.at(H.half(0.34, sole) - capW - 0.2, sole, H.zOf(0.3) + i * 0.22, () => P.diveTank(K, r.pick([S.yellow, S.alu, S.blue])), 0, 0, 0.0);
    if (g === 'towel') K.rbox('matte', r.pick([S.orange, S.blue, S.yellow, S.red]), 0.5, 0.012, 0.3, 0.005, -B * 0.2, yFwd + 0.1, H.zOf(0.72), 0, r.range(-0.4, 0.4), 0);
    if (g === 'extinguisher') K.at(cw / 2 + 0.06, sole + 0.2, zC - 0.2, () => P.extinguisher(K));
  }
  // fenders (a part: hidden when underway) hung from the midship + stern cleats on one or both sides
  const F = K.part('fenders', 0, 0, 0); for (const sx of opt.fenderSides) for (const u of [0.1, 0.5]) F.at(sx * (H.halfBeam(u) + 0.1), H.sheerY(u) - 0.03, H.zOf(u), () => P.fender(F, { len: big ? 0.7 : 0.55, r: big ? 0.11 : 0.085, drop: 0.12, slot: r.pick([S.white, S.white, S.navy, S.black]) }));
  P.hullLettering(K, H, decals, { nameH: big ? 0.26 : 0.2, builderU: 0.2, regU: 0.76 });
  // ---- small real-boat details: plates and labels, drain plugs, bilge outlet, rub-rail end caps, battery switch, courtesy
  // lights, transducer, anodes, transom tie-downs, livewell lid, drink holders, grab handles, vents
  const D = decals || {}, cH = big ? 1.2 : 1.1, cL = big ? 1.15 : 0.9, xS = -(cw / 2 + 0.025);
  const dq = (r, w, c0, rt, up) => { if (!r) return; const h = w / r.aspect, p = (a, b2) => [c0[0] + rt[0] * a + up[0] * b2, c0[1] + rt[1] * a + up[1] * b2, c0[2] + rt[2] * a + up[2] * b2]; K.quad('decal', S.white, p(-w / 2, -h / 2), p(w / 2, -h / 2), p(w / 2, h / 2), p(-w / 2, h / 2), r.uv); };
  dq(D.plate, 0.2, [xS, sole + cH * 0.5, zC - 0.05], [0, 0, 1], [0, 1, 0]);                                   // capacity plate on the console, starboard side
  dq(D.battery, 0.14, [wA * 0.36, sole + bh * 0.55, zA + 0.012], [-1, 0, 0], [0, 1, 0]);                       // battery switch label on the aft bulkhead
  K.cyl('gel', S.red, 0.035, 0.04, 0.03, wA * 0.36 - 0.03, sole + bh * 0.5, zA + 0.03, PI / 2, 0, 0, 12); K.rbox('gel', S.red, 0.014, 0.05, 0.02, 0.004, wA * 0.36 - 0.03, sole + bh * 0.5, zA + 0.05);
  dq(D.warn, 0.17, [-wA * 0.05, ys0 - 0.12, zT - 0.008], [-1, 0, 0], [0, 1, 0]);                                // propeller warning on the transom
  dq(D.tag, 0.3, [0, sole + cH * 0.62, zC + cL / 2 + 0.004], [1, 0, 0], [0, 1, 0]);
  K.mirror((sx) => { const hb0 = H.halfBeam(0), uf = 0.42;
    K.rbox('metal', S.steel, 0.06, 0.05, 0.07, 0.012, hb0 + 0.012, ys0 - 0.02, zT + 0.02);                       // rub rail end caps
    K.cyl('metal', S.steel, 0.022, 0.022, 0.014, hb0 * 0.5, -cfg.draft * 0.55, zT - 0.006, PI / 2, 0, 0, 10); K.torus('metal', S.steel, 0.03, 0.006, hb0 * 0.5, -cfg.draft * 0.55 + 0.05, zT - 0.02, 0, 0, 0, 10, 5);   // transom tie-down eyes
    K.cyl('metal', S.steel, 0.024, 0.024, 0.012, H.half(0.12, 0.2) + 0.004, 0.2, H.zOf(0.12), 0, 0, PI / 2, 10); K.cyl('matte', S.black, 0.014, 0.014, 0.014, H.half(0.12, 0.2) + 0.005, 0.2, H.zOf(0.12), 0, 0, PI / 2, 8);   // bilge / livewell outlets
    K.anchor('bilge', H.half(0.12, 0.2) + 0.02, 0.2, H.zOf(0.12), { side: sx });
    for (const u of [0.15, 0.36, 0.56]) { const x = H.half(u, sole + 0.12) - capW * 0.55 - 0.006; K.rbox('lamp', S.white, 0.008, 0.02, 0.05, 0.003, x, sole + 0.12, H.zOf(u)); K.rbox('metal', S.steel, 0.006, 0.03, 0.065, 0.003, x + 0.003, sole + 0.12, H.zOf(u)); }   // courtesy lights
    K.cyl('metal', S.steel, 0.036, 0.034, 0.01, H.halfBeam(0.3) - capW * 0.72, H.sheerY(0.3) + 0.016, H.zOf(0.3) + 0.3, 0, 0, 0, 12); K.cyl('matte', S.black, 0.03, 0.03, 0.011, H.halfBeam(0.3) - capW * 0.72, H.sheerY(0.3) + 0.017, H.zOf(0.3) + 0.3, 0, 0, 0, 12);   // gunwale drink holders
    K.tube('metal', S.steel, [[H.half(0.08, sole + 0.3) - capW * 0.55 - 0.01, sole + bh * 0.72, H.zOf(0.085)], [H.half(0.08, sole + 0.3) - capW * 0.55 - 0.06, sole + bh * 0.76, H.zOf(0.1)], [H.half(0.08, sole + 0.3) - capW * 0.55 - 0.01, sole + bh * 0.72, H.zOf(0.125)]], 0.011, { seg: 6 });   // stern grab handles
    K.rbox('matte', S.black, 0.004, 0.05, 0.16, 0.002, H.half(uf, H.sheerY(uf) - 0.12) + 0.004, H.sheerY(uf) - 0.12, H.zOf(uf) - 0.4);   // fuel tank vent
    if (sx > 0) dq(D.fuel, 0.05, [H.halfBeam(0.42) - capW * 0.45, H.sheerY(0.42) + 0.021, H.zOf(0.42) + 0.07], [1, 0, 0], [0, 0, -1]); else dq(D.water, 0.05, [-(H.halfBeam(0.42) - capW * 0.45), H.sheerY(0.42) + 0.021, H.zOf(0.42) + 0.07], [1, 0, 0], [0, 0, -1]); });
  K.cyl('metal', S.amber, 0.016, 0.016, 0.02, 0, -cfg.draft * 0.9, zT - 0.008, PI / 2, 0, 0, 8); K.rbox('metal', S.amber, 0.01, 0.01, 0.03, 0.002, 0, -cfg.draft * 0.9, zT - 0.02);   // brass garboard drain plug
  K.rbox('matte', S.black, 0.07, 0.05, 0.1, 0.012, -H.halfBeam(0) * 0.3, -cfg.draft * 0.62, zT - 0.04, 0.2);                                                              // transducer
  K.rbox('matte', S.rubber, 0.11, 0.07, 0.008, 0.003, H.halfBeam(0) * 0.72, 0.1, zT - 0.006); K.rbox('matte', S.rubber, 0.11, 0.07, 0.008, 0.003, -H.halfBeam(0) * 0.72, 0.1, zT - 0.006);   // scupper flaps
  K.rbox('glass', S.white, wA * 0.2, 0.008, (zA - zT) * 0.5, 0.003, 0, ys0 + 0.012, (zA + zT) / 2); K.rbox('metal', S.steel, 0.05, 0.012, 0.02, 0.004, 0, ys0 + 0.02, (zA + zT) / 2 + (zA - zT) * 0.22);   // livewell lid
  K.tube('metal', S.steel, [[-0.2, sole + cH + 0.02, zC - cL / 2 + 0.22], [-0.2, sole + cH + 0.09, zC - cL / 2 + 0.2], [0.22, sole + cH + 0.09, zC - cL / 2 + 0.2], [0.22, sole + cH + 0.02, zC - cL / 2 + 0.22]], 0.011, { fillet: 0.03, seg: 6 });   // dash grab bar
  K.rbox('matte', S.black, 0.09, 0.016, 0.16, 0.006, cw * 0.28, sole + cH + 0.01, zC - cL / 2 + 0.3, 0, 0.2, 0);   // phone on the dash
  return { H, sole };
}

function make(key) {
  const c = SIZES[key];
  return {
    key, name: c.name, builder: c.builder, category: 'center_console', dims: { L: c.L, B: c.B, draft: c.draft, height: 2.9 }, berth: 'slip',
    phys: { type: 'planing', mass: c.mass, vmaxKmh: c.vmax, drive: 'outboard', leanDeg: 13, trimDeg: 5.5 - (c.L - 6) * 0.25, slide: 0.45 },
    sound: { engine: 'outboard4s', cylinders: c.L > 9 ? 8 : 6, hull: 'fiberglass' },
    look: { graphics: ['plain', 'plain', 'sheer', 'sheer', 'band', 'swoosh', 'twotone', 'fade'], wear: [0.02, c.L > 9 ? 0.25 : 0.5], bottomPaint: c.L > 7 ? 0.8 : 0.4, engineBrands: c.L > 9 ? ['tormenta', 'kestrel'] : undefined },
    roll(r) {
      const engines = r.pick(c.engines), hp = r.pick(c.hp), top = r.pick(c.top);
      const gear = []; if (r.chance(0.7)) gear.push('cooler'); if (r.chance(0.6)) gear.push('coil'); if (r.chance(0.45)) gear.push('bucket'); if (r.chance(0.3)) gear.push('ring'); if (r.chance(0.18)) gear.push('tanks'); if (r.chance(0.4)) gear.push('towel'); if (r.chance(0.5)) gear.push('extinguisher');
      return { engines, hp, top, screens: r.chance(0.4) ? 2 : 1, radar: c.L > 9 ? r.chance(0.8) : r.chance(0.15), outriggers: top !== 'none' && top !== 'bimini' && r.chance(c.L > 7.5 ? 0.45 : 0.1), aftBench: r.chance(0.7), bowCushions: r.chance(0.75), bowRail: r.chance(c.L > 9 ? 0.3 : 0.55), anchor: r.chance(0.5),
        rodChance: r.range(0.2, 0.9), gear, fenderSides: r.pick([[1], [-1], [1, -1], [1, -1]]) };
    },
    build: (ctx) => build(c, ctx),
  };
}
export const MODELS = Object.keys(SIZES).map(make);

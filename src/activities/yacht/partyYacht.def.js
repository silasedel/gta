// "Midnight Tide": the party yacht of the yacht party activity. Built with the yacht kit (src/vehicles/yachts/kit, used
// read-only) on the proven kit-check layout (70 ft flybridge motor yacht), changed for a party: a low open stern with a
// swim platform and steps (the gangway lands there, stern-to), a bar and lounge sofas on the aft deck, a DJ table against
// the saloon, a hot tub and sun pads on the flybridge, sun pads on the foredeck, speakers, name on the transom.
// Frame: +z bow, +x port, y = 0 at the waterline. Main deck y = MD.
import { makeHull } from '../../vehicles/yachts/kit/hull.js';
import { deck, house, planHalf, fullPoly, rectPoly, stairs, rail, hardtop, sidePlates, coaming } from '../../vehicles/yachts/kit/structure.js';
import { sofa, sunpad, bar, hotTub, stereo, nameplate, swimPlatform, table, deckCleats } from '../../vehicles/yachts/kit/furnish.js';

export const MD = 1.55, FD = 2.35, FLY = 3.8;
export const PARTY_YACHT = {
  id: 'midnight_tide', name: 'Midnight Tide', builder: 'Southline Marine', lengthFt: 70,
  palette: { hull: 0x101a2c, boot: 0xf2f2f2, antifoul: 0x5e1a1a },
  build(ctx) {
    const hull = makeHull({
      L: 21.3, B: 5.5, draft: 1.45, forefoot: 0.93,
      sheer: [[0, 1.62], [0.3, 1.66], [0.42, 2.25], [0.7, 2.65], [1, 3.2]],
      plan: [[0, 0.9], [0.25, 0.985], [0.45, 1], [0.62, 0.95], [0.78, 0.76], [0.9, 0.46], [0.97, 0.2], [1, 0.03]],
      keel: [[0, 0.5], [0.3, 0.92], [0.5, 1], [0.75, 0.8], [0.93, 0]],
      chine: { y: [[0, -0.12], [0.5, 0.0], [0.8, 0.55], [1, 1.7]], w: [[0, 0.93], [0.5, 0.9], [0.8, 0.68], [1, 0.4]], flare: [[0, 0.85], [0.6, 0.9], [1, 1.35]] },
      stem: { rake: 0.42 }, transom: { rake: 0.12 },
      windows: [{ z0: -2.6, z1: 1.4, y0: 0.85, y1: 1.3 }, { z0: 3.4, z1: 5.8, y0: 1.2, y1: 1.55 }],
    });
    ctx.meta.hull = hull;
    hull.build(ctx);
    ctx.lod(1, () => { hull.rail(ctx, 'ss', (z) => hull.sheerAt(z) - 0.12, 0.03); });
    const housePlan = planHalf({ zAft: -3.6, zFore: 4.4, w: (z) => 2.12 - Math.max(0, z - 1.5) * 0.12, aftR: 0.15, foreLen: 1.6 });
    deck(ctx, { id: 'main', name: 'Main deck', y: MD, poly: hull.deckPoly(MD, { inset: 0.08, z1: 2.6 }), margin: { w: 0.14 } });
    deck(ctx, { id: 'fore', name: 'Foredeck', y: FD, poly: hull.deckPoly(FD, { inset: 0.08, z0: 2.6 }), top: 'teak', margin: { w: 0.14 } });
    ctx.lod(1, () => hull.bulwark(ctx, { deckY: (z) => (z < 2.6 ? MD : FD), capMat: 'teakCap', z0: -9.2 })); hull.bowCap(ctx, { deckY: FD });
    house(ctx, {
      plan: housePlan, y0: MD, y1: FLY - 0.09, tumble: 0.07, rakeF: 0.75,
      windows: [{ face: 'side', a: -3.0, b: 3.2, y0: 0.95, y1: 1.85, panes: 5 }, { face: 'front', a: 0, b: 1.9, y0: 0.9, y1: 1.9, panes: 2 }, { face: 'side', a: 3.2, b: 4.4, y0: 0.95, y1: 1.85 }],
      doors: [{ face: 'aft', a: 0, b: 1.0, h: 2.0 }],
    });
    // flybridge over the saloon and most of the aft deck
    const flyPoly = fullPoly(planHalf({ zAft: -7.4, zFore: 3.3, w: 2.5, aftR: 0.5, foreLen: 1.8 }));
    deck(ctx, { id: 'fly', name: 'Flybridge', y: FLY, poly: flyPoly, holes: [rectPoly(1.15, -7.0, 2.05, -4.5)], margin: { w: 0.12 }, bottom: 'gel' });
    stairs(ctx, { from: [1.6, MD, -6.95], to: [1.6, FLY, -4.6], w: 0.8, rail: 'left' });
    ctx.lod(1, () => {
      const pts = []; for (const [x, z] of planHalf({ zAft: -7.3, zFore: -1, w: 2.42, aftR: 0.45, fore: 'flat' }).slice(1, -2)) pts.push([x, FLY, z]);
      rail(ctx, pts, { h: 0.95 }); rail(ctx, pts.map(([x, y, z]) => [-x, y, z]), { h: 0.95 });
      coaming(ctx, planHalf({ zAft: -1, zFore: 3.1, w: 2.4, aftR: 0.01, foreLen: 1.7 }).slice(1, -1), { y0: FLY, h: 0.75, cap: 'gel' });
      coaming(ctx, planHalf({ zAft: -1, zFore: 3.1, w: 2.4, aftR: 0.01, foreLen: 1.7 }).slice(1, -1).map(([x, z]) => [-x, z]).reverse(), { y0: FLY, h: 0.75, cap: 'gel' });
      sidePlates(ctx, 'gel', [[-4.2, FLY], [-3.2, FLY], [-2.4, 5.95], [-3.0, 5.95]], 2.45, 0.1);
      sidePlates(ctx, 'gel', [[1.2, FLY + 0.75], [1.9, FLY + 0.75], [0.9, 5.95], [0.5, 5.95]], 2.3, 0.08);
      hardtop(ctx, { poly: fullPoly(planHalf({ zAft: -4.4, zFore: 1.8, w: 2.5, aftR: 0.5, foreLen: 1.2 })), y: 6.1 });
    });
    // stern: swim platform with steps up to the aft deck (the gangway lands on it)
    const sp = swimPlatform(ctx, hull, { y: 0.45, len: 1.4, deckY: MD });
    ctx.meta.swimTop = sp;
    deckCleats(ctx, hull, MD, [-8.6, -4.0], {});
    // aft deck party: bar to starboard, lounge to port aft of the flybridge stairs, DJ table against the saloon, cocktail tables
    bar(ctx, [-1.72, MD, -6.0], Math.PI / 2, { w: 2.0, foods: ['champagne', 'champagne', 'champagne'] });
    sofa(ctx, [1.82, MD, -8.7], -Math.PI / 2, { w: 1.6, arms: true });
    table(ctx, [1.05, MD, -8.7], 0, { w: 0.5, l: 1.0, h: 0.45, set: 2 });
    ctx.at([0, MD, -3.95], 0, (c) => {   // DJ table: decks and a mixer on a black counter
      c.box('blackGloss', [1.7, 0.95, 0.55], [0, 0.475, 0], { solid: true, tag: 'furniture' });
      for (const x of [-0.5, 0.5]) { c.cyl('black', 0.17, 0.17, 0.03, [x, 0.97, -0.02], { seg: 24 }); c.cyl('ss', 0.04, 0.04, 0.035, [x, 0.98, -0.02], { seg: 10 }); }
      c.box('black', [0.32, 0.05, 0.36], [0, 0.97, 0]);
      c.box('vcEmit', [0.26, 0.004, 0.06], [0, 0.997, 0.08], { color: 0x30c0ff });
    });
    ctx.spot('dj', [0, MD, -3.45], { heading: Math.PI, tags: ['party', 'dj'] });
    stereo(ctx, [0, MD + 1.1, -3.62], Math.PI, [[1.95, MD + 2.0, -3.6], [-1.95, MD + 2.0, -3.6], [2.0, FLY + 0.9, -6.9], [-2.0, FLY + 0.9, -6.9]]);
    // flybridge: hot tub aft, sun pads forward of it
    hotTub(ctx, [-0.95, FLY, -5.9], { r: 0.95, h: 0.75 });
    sunpad(ctx, [0, FLY, -1.4], 0, { w: 2.4, l: 1.8 });
    // foredeck sun pads
    sunpad(ctx, [0, FD, 6.6], Math.PI, { w: 2.4, l: 2.0 });
    nameplate(ctx, hull, 'Midnight Tide', 'Miami', { y: 1.0 });
    ctx.node('cockpit', [0, MD, -7.5]); ctx.node('fly', [0, FLY, -3]);
  },
};

// Kit self-test yacht (not part of the fleet): exercises hull, decks, bulwarks, house, stairs, rails and hardtop.
import { makeHull } from '../kit/hull.js';
import { deck, house, planHalf, fullPoly, rectPoly, stairs, rail, hardtop, sidePlates, coaming, windscreen } from '../kit/structure.js';

export default {
  id: '_kitcheck', name: 'Kit Check', builder: 'Test', lengthFt: 70,
  palette: { hull: 0x1c2f4a, boot: 0xf2f2f2, antifoul: 0x7a1f1c },
  build(ctx) {
    const hull = makeHull({
      L: 21.3, B: 5.5, draft: 1.45, forefoot: 0.93,
      sheer: [[0, 2.25], [0.35, 2.3], [0.7, 2.65], [1, 3.2]],
      plan: [[0, 0.9], [0.25, 0.985], [0.45, 1], [0.62, 0.95], [0.78, 0.76], [0.9, 0.46], [0.97, 0.2], [1, 0.03]],
      keel: [[0, 0.5], [0.3, 0.92], [0.5, 1], [0.75, 0.8], [0.93, 0]],
      chine: { y: [[0, -0.12], [0.5, 0.0], [0.8, 0.55], [1, 1.7]], w: [[0, 0.93], [0.5, 0.9], [0.8, 0.68], [1, 0.4]], flare: [[0, 0.85], [0.6, 0.9], [1, 1.35]] },
      stem: { rake: 0.42 }, transom: { rake: 0.12 },
      windows: [{ z0: -2.6, z1: 1.4, y0: 0.85, y1: 1.3 }, { z0: 3.4, z1: 5.8, y0: 1.2, y1: 1.55 }],
    });
    ctx.meta.hull = hull;
    const MD = 1.55, FD = 2.35, FLY = 3.8;
    hull.build(ctx);
    ctx.lod(1, () => { hull.rail(ctx, 'ss', (z) => hull.sheerAt(z) - 0.12, 0.03); });
    const housePlan = planHalf({ zAft: -5, zFore: 4.4, w: (z) => 2.12 - Math.max(0, z - 1.5) * 0.12, aftR: 0.15, foreLen: 1.6 });
    // main deck (cockpit + side decks) and raised foredeck
    deck(ctx, { id: 'main', name: 'Main deck', y: MD, poly: hull.deckPoly(MD, { inset: 0.08, z1: 2.6 }), margin: { w: 0.14 } });
    const fore = hull.deckPoly(FD, { inset: 0.08, z0: 2.6 });
    const hole = fullPoly(housePlan.filter((p) => p[1] >= 2.6).map((p) => [p[0] + 0.01, p[1]])); hole.unshift([0, 2.61]);
    deck(ctx, { id: 'fore', name: 'Foredeck', y: FD, poly: fore, top: 'teak', margin: { w: 0.14 } });
    ctx.lod(1, () => hull.bulwark(ctx, { deckY: (z) => (z < 2.6 ? MD : FD), capMat: 'teakCap' })); hull.bowCap(ctx, { deckY: FD });
    const h = house(ctx, {
      plan: housePlan, y0: MD, y1: FLY - 0.09, tumble: 0.07, rakeF: 0.75,
      windows: [{ face: 'side', a: -4.4, b: 3.2, y0: 0.95, y1: 1.85, panes: 5 }, { face: 'front', a: 0, b: 1.9, y0: 0.9, y1: 1.9, panes: 2 }, { face: 'side', a: 3.2, b: 4.4, y0: 0.95, y1: 1.85 }],
      doors: [{ face: 'aft', a: 0, b: 1.0, h: 2.0 }],
    });
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
    ctx.node('cockpit', [0, MD, -8]); ctx.node('fly', [0, FLY, -3]);
    void h; void windscreen; void hole;
  },
};

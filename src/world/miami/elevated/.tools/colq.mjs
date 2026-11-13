// what colliders does the GAME world have around a point? usage: node colq.mjs x y z [half]
import fs from 'node:fs'; import { createRequire } from 'node:module';
const SP = '/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/';
const require = createRequire(SP + 'hl/node_modules/'); const puppeteer = require('puppeteer-core');
const [x, y, z, hh = 2] = process.argv.slice(2).map(Number);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', pipe: true, protocolTimeout: 0, userDataDir: fs.mkdtempSync(SP + 'chrome-colq-'), args: ['--mute-audio', '--window-size=640,360', '--use-angle=metal'] });
try {
  const page = await browser.newPage(); await page.goto(process.env.URL || 'http://127.0.0.1:5195/?map=miami', { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.game && game.city && game.city.collidersReadyAt', { timeout: 300000, polling: 1000 });
  const r = await page.evaluate(async (x, y, z, hh) => {
    const g = window.game, R = g.RAPIER, frame = () => new Promise((res) => requestAnimationFrame(() => res()));
    const a = { x, z }; g.city.registerAnchor(a, 150); for (let i = 0; i < 900 && !g.city.collidersReadyAt(x, z); i++) await frame(); for (let i = 0; i < 60; i++) await frame();
    const out = []; const shape = new R.Cuboid(hh, 0.6, hh); const out2 = [];
    g.world.intersectionsWithShape({ x, y, z }, { x: 0, y: 0, z: 0, w: 1 }, shape, (c) => { const p = c.parent(); const t = c.translation(); out.push({ type: c.shapeType(), fixed: !p || p.isFixed(), t: [+t.x.toFixed(1), +t.y.toFixed(1), +t.z.toFixed(1)], he: c.halfExtents ? c.halfExtents() : null, r: c.radius ? c.radius() : null }); return true; });
    const hits = []; const ray = new R.Ray({ x, y: y + 20, z }, { x: 0, y: -1, z: 0 });
    g.world.intersectionsWithRay(ray, 60, false, (h) => { const c = h.collider; const v = c.vertices ? c.vertices() : null; hits.push({ y: +(y + 20 - h.timeOfImpact).toFixed(3), type: c.shapeType(), nv: v ? v.length / 3 : 0, handle: c.handle }); return true; });
    const horiz = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, d = { x: Math.sin(a), y: 0, z: Math.cos(a) }; for (const yy of [y - 0.4, y, y + 0.4]) { const rr = new R.Ray({ x, y: yy, z }, d); const h2 = g.world.castRay(rr, 6, true); if (h2) horiz.push([k, +yy.toFixed(2), +h2.timeOfImpact.toFixed(2), h2.collider.shapeType(), h2.collider.vertices ? h2.collider.vertices().length / 3 : -1]); } }
    // the offending trimesh: vertices near the first horizontal hit, grouped into small clusters (each prop prism)
    let near = null; { let best = null; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, d = { x: Math.sin(a), y: 0, z: Math.cos(a) }; const rr = new R.Ray({ x, y, z }, d); const h2 = g.world.castRay(rr, 6, true); if (h2 && h2.collider.shapeType() === 6 && (!best || h2.timeOfImpact < best.t)) best = { t: h2.timeOfImpact, c: h2.collider, px: x + d.x * h2.timeOfImpact, pz: z + d.z * h2.timeOfImpact }; }
      if (best) { const v = best.c.vertices(); const pts = []; for (let i = 0; i < v.length; i += 3) if (Math.hypot(v[i] - best.px, v[i + 2] - best.pz) < 1.5) pts.push([+v[i].toFixed(2), +v[i + 1].toFixed(2), +v[i + 2].toFixed(2)]); near = { hit: [best.px, best.pz], n: v.length / 3, pts: pts.slice(0, 40) }; } }
    return { out, hits, horiz, near };
  }, x, y, z, hh);
  console.log(JSON.stringify(r));
} finally { await browser.close(); }

// ELEVATED-2: list every non-elevated static collider near (x, y, z) in the production game (isolated muted headless Chrome)
// usage: node probe_game.mjs url x y z [r]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const SP =
  '/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/';
const require = createRequire(SP + 'hl/node_modules/');
const puppeteer = require('puppeteer-core');
const [URL0, X, Y, Z, R = '3'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  pipe: true,
  protocolTimeout: 0,
  userDataDir: fs.mkdtempSync(SP + 'chrome-probe-'),
  args: [
    '--mute-audio',
    '--no-first-run',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
});
try {
  const page = await browser.newPage();
  await page.goto(URL0, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(
    'window.game && game.city && game.city.collidersReadyAt && window.__elevated',
    { timeout: 300000, polling: 1000 },
  );
  const out = await page.evaluate(
    async (x, y, z, r) => {
      const g = window.game,
        frame = () => new Promise((res) => requestAnimationFrame(() => res()));
      const anchor = { x, z };
      g.city.registerAnchor(anchor, 160);
      for (let i = 0; i < 900 && !g.city.collidersReadyAt(x, z); i++) await frame();
      for (let i = 0; i < 60; i++) await frame();
      const R = g.RAPIER || window.RAPIER;
      const world = g.world;
      const res = [];
      const shape = new R.Cuboid(r, 0.7, r);
      world.intersectionsWithShape({ x, y, z }, { x: 0, y: 0, z: 0, w: 1 }, shape, (c) => {
        let aabb = null;
        try {
          const t = c.translation();
          aabb = [t.x, t.y, t.z].map((v) => +v.toFixed(2));
        } catch (e) {}
        let fixed = null;
        try {
          fixed = c.parent() ? c.parent().isFixed() : 'noparent';
        } catch (e) {}
        let nv = null;
        try {
          nv = c.shape.vertices ? c.shape.vertices.length / 3 : null;
        } catch (e) {}
        let ex = null;
        try {
          const sh = c.shape;
          ex = sh.halfExtents
            ? [sh.halfExtents.x, sh.halfExtents.y, sh.halfExtents.z].map((u) => +u.toFixed(2))
            : sh.radius !== undefined
              ? [sh.radius, sh.halfHeight]
              : null;
        } catch (e) {}
        let vb = null;
        try {
          if (c.shape.vertices && c.shapeType() === 9) {
            const v = c.shape.vertices;
            const t = c.translation();
            let mn = [1e9, 1e9, 1e9],
              mx = [-1e9, -1e9, -1e9];
            for (let k = 0; k < v.length; k += 3)
              for (let m = 0; m < 3; m++) {
                mn[m] = Math.min(mn[m], v[k + m] + [t.x, t.y, t.z][m]);
                mx[m] = Math.max(mx[m], v[k + m] + [t.x, t.y, t.z][m]);
              }
            vb = [mn.map((u) => +u.toFixed(2)), mx.map((u) => +u.toFixed(2))];
          }
        } catch (e) {}
        res.push({ h: c.handle, type: c.shapeType(), fixed, t: aabb, nv, ex, vb });
        return true;
      });
      const rays = [];
      const ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
      for (let dx = -3; dx <= 3; dx += 1.5)
        for (let dz = -6; dz <= 6; dz += 0.5) {
          const px = x + dx,
            pz = z + dz;
          const hits = [];
          let top = y + 8;
          for (let k = 0; k < 4; k++) {
            ray.origin = { x: px, y: top, z: pz };
            const h = world.castRay(ray, 30, true);
            if (!h) break;
            const hy = top - h.timeOfImpact;
            hits.push([+hy.toFixed(3), h.collider.shapeType()]);
            top = hy - 0.02;
          }
          const e = window.__elevated.heightAt(px, pz, y + 2);
          rays.push([+dx.toFixed(1), +dz.toFixed(1), e === null ? null : +e.toFixed(3), hits]);
        }
      // triangles of every trimesh near the point (within 3 m in plan, 1.5 m in height)
      const tris = [];
      world.intersectionsWithShape(
        { x, y, z },
        { x: 0, y: 0, z: 0, w: 1 },
        new R.Cuboid(1.2, 0.4, 2.4),
        (c) => {
          if (c.shapeType() !== 6) return true;
          const v = c.shape.vertices,
            ix = c.shape.indices,
            t = c.translation();
          for (let k = 0; k < ix.length; k += 3) {
            const P = [0, 1, 2].map((m) => [
              v[ix[k + m] * 3] + t.x,
              v[ix[k + m] * 3 + 1] + t.y,
              v[ix[k + m] * 3 + 2] + t.z,
            ]);
            const cx = (P[0][0] + P[1][0] + P[2][0]) / 3,
              cy = (P[0][1] + P[1][1] + P[2][1]) / 3,
              cz = (P[0][2] + P[1][2] + P[2][2]) / 3;
            if (Math.hypot(cx - x, cz - z) < 4 && Math.abs(cy - y) < 1.5)
              tris.push(P.map((q) => q.map((u) => +u.toFixed(2))));
          }
          return true;
        },
      );
      return {
        src: (() => {
          try {
            return JSON.parse(JSON.stringify(g.city.colliderSourceAt(x, z, 6)));
          } catch (e) {
            return String(e);
          }
        })(),
        el: window.__elevated.heightAt(x, z, y),
        res,
        rays,
        ntris: tris.length,
        tris: tris.slice(0, 40),
      };
    },
    +X,
    +Y,
    +Z,
    +R,
  );
  console.log(JSON.stringify(out, null, 0));
} catch (e) {
  console.error('FAILED', e);
} finally {
  await browser.close();
}

// r2-physics: which building drew the facade at (x, z)? Groups the near tile's 'facades' vertices by building seed (aFa.w), takes
// the group touching (x, z), reports its bounding box / height and the city building(s) under its center, and whether physics has
// anything along its walls (ball sweep at mid-height around the box).   node tools/v2/physics/facprobe.mjs --pts "410,-157"
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const PTS = String(o.pts || '').split(';').filter(Boolean).map((q) => q.split(',').map(Number));
await withBrowser({ width: 800, height: 450, maxSeconds: 1200 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  for (const [x, z] of PTS) {
    await b.eval(`(() => { game.teleport(${x} + 2, undefined, ${z} + 2); return 1; })()`); await b.sleep(25000);
    console.log(await b.eval(`JSON.stringify((() => { const R = game.RAPIER, W = game.world; let best = null;
      game.scene.traverseVisible((m) => { if (!m.isMesh || m.name !== 'facades') return; const P = m.geometry.attributes.position, A = m.geometry.attributes.aFa; if (!A) return; m.updateWorldMatrix(true, false); const e = m.matrixWorld.elements;
        const groups = new Map(); for (let i = 0; i < P.count; i++) { const wx = P.getX(i) + e[12], wz = P.getZ(i) + e[14], wy = P.getY(i) + e[13], sd = A.getW(i); let g = groups.get(sd); if (!g) groups.set(sd, (g = { sd, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, y1: -1e9, n: 0, near: 0 })); g.x0 = Math.min(g.x0, wx); g.x1 = Math.max(g.x1, wx); g.z0 = Math.min(g.z0, wz); g.z1 = Math.max(g.z1, wz); g.y1 = Math.max(g.y1, wy); g.n++; if (Math.hypot(wx - ${x}, wz - ${z}) < 4) g.near++; }
        for (const g of groups.values()) if (g.near && (!best || g.near > best.near)) best = { ...g, mesh: m.parent?.name }; });
      if (!best) return { at: [${x}, ${z}], none: true };
      const cx = (best.x0 + best.x1) / 2, cz = (best.z0 + best.z1) / 2, C = game.city; let src = []; try { src = C.colliderSourceAt(cx, cz, 3).filter((q) => q.kind === 'building'); } catch (e) { /* */ }
      const hitsAt = (px, pz) => { let n = 0; try { W.intersectionsWithShape({ x: px, y: Math.min(8, best.y1 / 2), z: pz }, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(0.6), () => { n++; return true; }); } catch (e) { /* */ } return n; };
      const ring = [[best.x0, cz], [best.x1, cz], [cx, best.z0], [cx, best.z1]].map(([px, pz]) => hitsAt(px, pz));
      return { at: [${x}, ${z}], seed: best.sd, box: [best.x0, best.x1, best.z0, best.z1].map((v) => +v.toFixed(1)), top: +best.y1.toFixed(1), verts: best.n, buildingsAtCenter: src, wallTouches: ring }; })())`));
  }
});

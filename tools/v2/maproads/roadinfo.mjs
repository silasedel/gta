// maproads: data-level look at the road pieces near points (tile relief, deck heights, terrain heights, deck footprint)
//   node tools/v2/maproads/roadinfo.mjs "x,z;x,z"
import { withBrowser, GAME_READY } from '../browser.mjs';
const pts = String(process.argv[2]).split(';').map((s) => s.split(',').map(Number));
await withBrowser({ width: 640, height: 360, maxSeconds: 400 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 480);
  for (const [x, z] of pts) {
    await b.eval(`game.teleport(${x + 20}, null, ${z + 20}, 0) || true`); await b.sleep(4000);
    console.log('INFO', x, z, await b.eval(`(() => { const D = game.miamiData, C = game.city, TS = C.streamer.tileSize, tx = Math.floor(${x} / TS), tz = Math.floor(${z} / TS), t = D.getTile(tx, tz);
      const segD = (px, pz, a, b2) => { const dx = b2[0] - a[0], dz = b2[1] - a[1], L2 = dx * dx + dz * dz; let u = L2 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / L2 : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(px - a[0] - dx * u, pz - a[1] - dz * u); };
      const out = { tile: [tx, tz], relief: !!(t && t.relief), g: C.groundHeightAt(${x}, ${z}), th: D.terrainHeightAt ? D.terrainHeightAt(${x}, ${z}) : null, fp: (() => { try { return C.elevated && C.elevated.footprintAt(${x}, ${z}); } catch (e) { return String(e); } })(), roads: [] };
      for (const r of (t && t.roads) || []) { let dm = 1e9; for (let i = 0; i < r.pts.length - 1; i++) dm = Math.min(dm, segD(${x}, ${z}, r.pts[i], r.pts[i + 1])); if (dm > 25) continue;
        out.roads.push({ id: r.id, kind: r.kind, name: r.name, w: r.width, d: +dm.toFixed(1), n: r.pts.length, y: r.y && r.y.map((v) => +v.toFixed(2)), ty: r.terrainY && r.terrainY.map((v) => +v.toFixed(2)), bridge: r.bridge, p0: r.pts[0].map((v) => +v.toFixed(1)), p1: r.pts[r.pts.length - 1].map((v) => +v.toFixed(1)) }); }
      return JSON.stringify(out); })()`));
  }
});

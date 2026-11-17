// r2-mapui: tile render cost, old (HEAD copy in _old_mapRender.js, if present) vs current src/ui/mapRender.js, same page.
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';
await withBrowser({ width: 800, height: 600, maxSeconds: 300 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/tools/v2/mapui/mapshot.html?wanted=0');
  await b.waitFor('window.mapReady === true', 120);
  const mods = fs.existsSync('tools/v2/mapui/_old_mapRender.js') ? ['/tools/v2/mapui/_old_mapRender.js', '/src/ui/mapRender.js'] : ['/src/ui/mapRender.js'];
  for (const url of mods) {
    const r = await b.eval(`(async () => {
      const m = await import('${url}?t=' + Date.now());
      m.setMapPalette({ sand: [226, 205, 160], shallow: [64, 196, 196] });
      const out = {};
      for (const [name, cx, cz, ppm] of [['mini', 2668, 660, 1.05], ['coast0.55', 1500, 900, 0.55], ['keys0.17', -3150, 3900, 0.17], ['fit0.05', -1900, -600, 0.05]]) {
        const R = m.createMapRenderer(game); const c = document.createElement('canvas'); c.width = 1600; c.height = 1000; const g = c.getContext('2d');
        const hw = 800 / ppm, hh = 500 / ppm; g.setTransform(ppm, 0, 0, ppm, -(cx - hw) * ppm, -(cz - hh) * ppm);
        const t0 = performance.now(); let n = 0;
        for (let i = 0; i < 400; i++) { R.draw(g, cx - hw, cz - hh, cx + hw, cz + hh, ppm, { budget: 1e9, id: 'p' }); n++; if (R.pending === 0) break; }
        out[name] = Math.round(performance.now() - t0) + ' ms' + (R.stats ? ' (' + R.stats.tiles + ' tiles, ' + Math.round(R.stats.ms) + ' ms tiles, ' + Math.round(R.stats.shoreMs) + ' ms shore, field ' + R.stats.fieldMs + ' ms)' : '');
      }
      return JSON.stringify(out);
    })()`);
    console.log(url, r);
  }
});

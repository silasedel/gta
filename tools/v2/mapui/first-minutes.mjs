// r2-mapui: QA first-minutes checks: opening HUD sequence (area card, then messages, then the help prompt), steady
// empty stars, minimap N badge inset, and GPS routes from Nico's to the Overseas Hwy.
// node tools/v2/mapui/first-minutes.mjs -> docs/v2/shots/r2-mapui/first/*.jpg
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';
const OUT = 'docs/v2/shots/r2-mapui/first';
fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1280, height: 720, maxSeconds: 1500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  if (!(await startGame(b, 300))) throw new Error('game did not start');
  const t0 = Date.now();
  for (const [ms, n] of [[300, 'a_0s'], [3600, 'b_3s'], [7200, 'c_7s'], [10500, 'd_10s']]) {
    const wait = ms - (Date.now() - t0); if (wait > 0) await b.sleep(wait);
    await b.screenshot(`${OUT}/${n}.jpg`);
    console.log(n, await b.eval(`JSON.stringify({ notifs: [...document.querySelectorAll('.ps-notif')].map((n) => n.textContent.slice(0, 40)), help: document.querySelector('.ps-help.on')?.textContent?.slice(0, 40) || null, area: document.querySelector('.ps-area.on') ? document.querySelector('.ps-area span')?.textContent : null, stars: [...document.querySelectorAll('.ps-corner .hc-star')].map((s) => getComputedStyle(s).fill).join('|').slice(0, 80) })`));
  }
  // stars steady across frames: sample 20 frames
  console.log('stars over 20 frames', await b.eval(`(async () => { const out = new Set(); for (let i = 0; i < 20; i++) { await new Promise((r) => requestAnimationFrame(r)); const s = [...document.querySelectorAll('.ps-corner .hc-star')]; out.add(s.length + ':' + s.map((e) => getComputedStyle(e).fill + getComputedStyle(e.closest('svg')).opacity + getComputedStyle(document.querySelector('.ps-corner')).opacity).join(',')); } return out.size; })()`));
  await b.screenshot(`${OUT}/e_minimap_n.jpg`, { clip: { x: 0, y: 470, width: 340, height: 250 } });
  // GPS: Nico's to the Overseas Hwy
  const A = { x: -865.7, z: 4836.5 }, B = { x: -772.5, z: 4801.7 };
  console.log('routes', await b.eval(`(async () => { const n = game.nav; if (!n) return 'no nav';
    const a = n.nearestRoad?.(${A.x}, ${A.z}), bb = n.nearestRoad?.(${B.x}, ${B.z});
    let rs = null, ra = null; try { rs = n.routeSync?.(${JSON.stringify(A)}, ${JSON.stringify(B)}); } catch (e) { rs = 'ERR ' + e.message; }
    try { ra = await n.route(${JSON.stringify(A)}, ${JSON.stringify(B)}); } catch (e) { ra = 'ERR ' + e.message; }
    const sum = (r) => r && typeof r === 'object' ? { len: Math.round(r.length), time: Math.round(r.time), man: r.maneuvers?.length } : r;
    return JSON.stringify({ a: a && { name: a.name, kind: a.kind, dist: Math.round(a.dist), edge: a.edgeId }, b: bb && { name: bb.name, kind: bb.kind, dist: Math.round(bb.dist), edge: bb.edgeId }, sync: sum(rs), async: sum(ra) }); })()`));
  console.log('errors', b.errors.filter((e) => !/favicon/.test(e)).map((e) => e.slice(0, 200)).slice(0, 8));
});

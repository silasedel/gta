#!/usr/bin/env node
// Water-walk probe (user, Nov 19: "you're literally walking on top of the water"). V2 test browser only.
//   node tools/v2/map3/water_walk.mjs --tag before [--at 2332,-660] [--yaw 0] [--secs 15] [--q "&foo=1"]
// Replays the benchmark's beach walk (src/perf/bench.v2.js segment 'beach': teleport, W + Shift held, A pressed every other 3 s)
// and logs twice a second: position, the player's feet, city.isWater, city.groundHeightAt, the static collider hit under the
// feet (Rapier ray, with the collider's name / owner if known), the player's water depth and swim state. A sample is a
// "water walk" when the map says water (or the drawn sea is above the hit) but the player stands dry on a collider.
// Shots every 3 s: docs/v2/shots/water-walk/<tag>_<n>.jpg. Report: docs/v2/reports/water-walk-<tag>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const TAG = o.tag || 'now', OUT = 'docs/v2/shots/water-walk', [AX, AZ] = String(o.at || '2332,-660').split(',').map(Number), SECS = +(o.secs || 15);
fs.mkdirSync(OUT, { recursive: true });
const rep = { tag: TAG, at: [AX, AZ], samples: [], shots: [] };
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 13; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(true); } catch (e) {} game.wanted?.clear?.(); if (game.police) game.police.enabled = false; return 1; })()`);
  await b.eval(`(() => { game.teleport(${AX}, undefined, ${AZ}, 0); if (${o.yaw !== undefined ? 1 : 0}) game.cameraYaw = ${+(o.yaw || 0)}; return 1; })()`);
  await b.waitFor(`(() => { const st = game.city.streamer; return !st || !st.readyAround || st.readyAround(${AX}, ${AZ}, 250); })()`, 60).catch(() => {});
  await b.sleep(4000);
  await b.eval(`(() => { window.__ww = { keys: new Set() }; window.__wwKey = (code, down) => { const K = window.__ww.keys; if (down === K.has(code)) return; if (down) K.add(code); else K.delete(code); dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true })); }; __wwKey('KeyW', true); __wwKey('ShiftLeft', true); return 1; })()`);
  const t0 = Date.now(); let lastShot = -1;
  while (Date.now() - t0 < SECS * 1000) {
    const t = (Date.now() - t0) / 1000;
    await b.eval(`__wwKey('KeyA', ${Math.floor(t / 3) % 2 === 1})`);
    const s = JSON.parse(await b.eval(`(() => { const p = game.player.position, c = game.city, R = game.RAPIER || window.RAPIER, w = game.world || game.physics?.world;
      let hit = null; try { if (R && w) { const h = w.castRay(new R.Ray({ x: p.x, y: p.y + 0.5, z: p.z }, { x: 0, y: -1, z: 0 }), 20, true, (R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC | R.QueryFilterFlags.EXCLUDE_SENSORS), undefined, game.player.collider); if (h) { const col = h.collider; hit = { y: +(p.y + 0.5 - (h.timeOfImpact ?? h.toi)).toFixed(2), handle: col.handle, name: col.__name || col.userData?.name || null, kind: game.colliderKind?.(col) || null }; } } } catch (e) { hit = { err: String(e) }; }
      const sea = game.miamiData?.seaLevel ?? -0.12;
      return JSON.stringify({ t: ${t.toFixed(1)}, x: +p.x.toFixed(1), y: +p.y.toFixed(2), z: +p.z.toFixed(1), water: !!c.isWater?.(p.x, p.z), ground: +(c.groundHeightAt?.(p.x, p.z) ?? NaN).toFixed(2), seabed: c.seabedDepthAt ? +(c.seabedDepthAt(p.x, p.z) ?? NaN).toFixed(2) : null, surf: c.surfaceAt?.(p.x, p.z) || null, swim: !!game.player.swimming, depth: +(game.player.waterDepth || 0).toFixed(2), sea, hit }); })()`));
    rep.samples.push(s);
    if (Math.floor(t / 3) !== lastShot) { lastShot = Math.floor(t / 3); const f = `${OUT}/${TAG}_${lastShot}.jpg`; await b.screenshot(f); rep.shots.push(f); }
    await b.sleep(400);
  }
  await b.eval(`(__wwKey('KeyW', false), __wwKey('ShiftLeft', false), __wwKey('KeyA', false), 1)`);
  rep.errors = [...new Set(b.errors)].slice(0, 10);
});
const bad = rep.samples.filter((s) => (s.water && !s.swim && s.depth < 0.1) || (s.hit && s.hit.y > s.sea - 0.3 && s.water));
rep.waterWalk = bad.length;
fs.writeFileSync(`docs/v2/reports/water-walk-${TAG}.json`, JSON.stringify(rep, null, 1));
for (const s of rep.samples) console.log(JSON.stringify(s));
console.log(`water walk ${TAG}: ${bad.length} of ${rep.samples.length} samples dry on water; shots ${rep.shots.join(' ')}`);
process.exit(0);

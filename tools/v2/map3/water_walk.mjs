#!/usr/bin/env node
// Water-walk probe (user, Nov 19: "you're literally walking on top of the water"). V2 test browser only.
//   node tools/v2/map3/water_walk.mjs --tag before [--at 2332,-660] [--dir 90] [--secs 14] [--q "&foo=1"] [--inland 14]
// From --at it marches along compass --dir (deg, 0 = +z, 90 = +x; default: the nearest map water found on a 64-ray fan) to the
// first map-water cell, prints a profile of that line (isWater, ground, drawn seabed, static ray hit + shape, surface), teleports
// --inland m before the waterline facing the sea and holds W + Shift for --secs. Twice a second: position, feet, isWater, ground,
// static hit under the feet (y, shape), water depth, swim state. A sample is a "water walk" when the map (or the drawn sea, sea
// level above the solid under him) says water but the player's feet stand at / above the sea surface, dry.
// Shots: docs/v2/shots/water-walk/<tag>_<n>.jpg. Report: docs/v2/reports/water-walk-<tag>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const TAG = o.tag || 'now',
  OUT = 'docs/v2/shots/water-walk',
  [AX, AZ] = String(o.at || '2332,-660')
    .split(',')
    .map(Number),
  SECS = +(o.secs || 14),
  INL = +(o.inland || 14);
fs.mkdirSync(OUT, { recursive: true });
const rep = { tag: TAG, at: [AX, AZ], samples: [], shots: [] };
const RAYJS = `const R = window.RAPIER || game.RAPIER, w = game.world || game.physics?.world, FL = R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC | R.QueryFilterFlags.EXCLUDE_SENSORS;
  const hitAt = (x, y, z, len, ex) => { try { const h = w.castRay(new R.Ray({ x, y, z }, { x: 0, y: -1, z: 0 }), len, true, FL, undefined, ex); if (!h) return null; const col = h.collider, b = col.parent?.(); return { y: +(y - (h.timeOfImpact ?? h.toi)).toFixed(2), shape: col.shape?.type ?? col.shapeType?.(), tag: b?.userData?.tag || null }; } catch (e) { return { err: String(e) }; } };`;
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 280) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 200);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { game.timeExternal = true; game.timeOfDay = 13; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(true); } catch (e) {} game.wanted?.clear?.(); if (game.police) game.police.enabled = false; return 1; })()`,
  );
  const line = JSON.parse(
    await b.eval(`(() => { const c = game.city; const dirs = ${o.dir !== undefined ? `[${+o.dir} * Math.PI / 180]` : '[...Array(64).keys()].map((k) => k / 64 * Math.PI * 2)'};
    let best = null; for (let r = 2; r < 1400 && !best; r += 2) for (const an of dirs) { const x = ${AX} + Math.sin(an) * r, z = ${AZ} + Math.cos(an) * r; if (c.isWater(x, z)) { best = { r, an, x, z }; break; } } return JSON.stringify(best); })()`),
  );
  console.log('waterline', line);
  if (!line) return;
  rep.line = line;
  const sx = line.x - Math.sin(line.an) * INL,
    sz = line.z - Math.cos(line.an) * INL;
  rep.start = [sx, sz];
  await b.eval(`(game.teleport(${sx}, undefined, ${sz}, ${line.an}), 1)`);
  await b
    .waitFor(
      `(() => { const st = game.city.streamer; return !game.teleportHolding && (!st || !st.readyAround || st.readyAround(${sx}, ${sz}, 200)); })()`,
      60,
    )
    .catch(() => {});
  await b.sleep(4000);
  rep.profile = JSON.parse(
    await b.eval(`(() => { ${RAYJS} const c = game.city, out = [];
    for (let s = -4; s <= 60; s += 2) { const x = ${line.x} + Math.sin(${line.an}) * s, z = ${line.z} + Math.cos(${line.an}) * s;
      out.push({ s, water: c.isWater(x, z), ground: +(c.groundHeightAt(x, z) ?? NaN).toFixed(2), seabed: +(c.seabed?.heightAt?.(x, z) ?? NaN).toFixed(2), terr: +(c.terrain?.heightAt?.(x, z) ?? NaN).toFixed(2), surf: c.surfaceAt?.(x, z) || null, hit: hitAt(x, 20, z, 40) }); }
    return JSON.stringify(out); })()`),
  );
  for (const p of rep.profile) console.log('P', JSON.stringify(p));
  await b.eval(
    `(() => { game.cameraYaw = ${line.an} + Math.PI; window.__ww = { keys: new Set() }; window.__wwKey = (code, down) => { const K = window.__ww.keys; if (down === K.has(code)) return; if (down) K.add(code); else K.delete(code); dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true })); }; __wwKey('KeyW', true); __wwKey('ShiftLeft', true); return 1; })()`,
  );
  const t0 = Date.now();
  let lastShot = -1;
  while (Date.now() - t0 < SECS * 1000) {
    const t = (Date.now() - t0) / 1000;
    const s = JSON.parse(
      await b.eval(`(() => { ${RAYJS} const P = game.player, p = P.position, c = game.city, sea = game.miamiData?.seaLevel ?? -0.12;
      const along = (p.x - ${line.x}) * Math.sin(${line.an}) + (p.z - ${line.z}) * Math.cos(${line.an});
      return JSON.stringify({ t: ${t.toFixed(1)}, along: +along.toFixed(1), x: +p.x.toFixed(1), z: +p.z.toFixed(1), feet: +p.y.toFixed(2), water: !!c.isWater?.(p.x, p.z), ground: +(c.groundHeightAt?.(p.x, p.z) ?? NaN).toFixed(2), seabed: +(c.seabed?.heightAt?.(p.x, p.z) ?? NaN).toFixed(2), swim: !!P.swimming, depth: +(P.waterDepth || 0).toFixed(2), sea, hit: hitAt(p.x, p.y + 0.5, p.z, 20, game.player.collider) }); })()`),
    );
    rep.samples.push(s);
    if (Math.floor(t / 3) !== lastShot) {
      lastShot = Math.floor(t / 3);
      const f = `${OUT}/${TAG}_${lastShot}.jpg`;
      await b.screenshot(f);
      rep.shots.push(f);
    }
    await b.sleep(400);
  }
  await b.eval(`(__wwKey('KeyW', false), __wwKey('ShiftLeft', false), 1)`);
  rep.errors = [...new Set(b.errors)].slice(0, 10);
});
// dry on water: the map says water (or the sea is over the solid under him) and his feet are at / above the sea surface, not swimming
const bad = rep.samples.filter(
  (s) => !s.swim && s.feet > s.sea - 0.05 && (s.water || (s.hit && s.hit.y < s.sea - 0.05)),
);
rep.waterWalk = bad.length;
rep.maxAlong = Math.max(-99, ...rep.samples.map((s) => s.along));
rep.swam = rep.samples.some((s) => s.swim);
fs.writeFileSync(`docs/v2/reports/water-walk-${TAG}.json`, JSON.stringify(rep, null, 1));
for (const s of rep.samples) console.log(JSON.stringify(s));
console.log(
  `water walk ${TAG}: ${bad.length} of ${rep.samples.length} samples dry on water; reached ${rep.maxAlong} m past the waterline, swam ${rep.swam}; shots ${rep.shots.join(' ')}`,
);
process.exit(0);

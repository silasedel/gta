// npc-life evidence: crowd shots by district and hour, behavior counters, gunfire panic, frame times.
import fs from 'node:fs';
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';
const OUT = 'docs/v2/shots/npc-life';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const res = {};
const log = (k, v) => {
  res[k] = v;
  console.log(k, String(JSON.stringify(v)).slice(0, 500));
};
const PLACES = [
  ['ocean_drive_day', 3430, -110, 13.5, 0.3],
  ['brickell_day', -2808, 1553, 12.5, 1.2],
  ['wynwood_night', -3410, -2441, 23, 2.0],
  ['south_beach_night', 3400, 300, 22.5, 3.0],
  ['beach_noon', 3520, -110, 13, -1.57],
];
await withBrowser({ width: 1280, height: 720, maxSeconds: 238 }, async (b) => {
  const E = async (js) => {
    const s = await b.eval(
      `(async()=>{ try { return JSON.stringify(await (async()=>{ ${js} })()); } catch (e) { return JSON.stringify({ err: String(e && e.stack || e) }); } })()`,
    );
    try {
      return JSON.parse(s);
    } catch (e) {
      return s;
    }
  };
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 170);
  await b.eval(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); 1`);
  await wait(2);
  log('boot', await E(`return { life: !!game.people?.life, failed: game.v2?.failed };`));
  const frames = `const ts = []; let last = performance.now(); await new Promise((res) => { const f = () => { const t = performance.now(); ts.push(t - last); last = t; if (ts.length < 300) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const s = ts.slice(5).sort((a, b) => a - b); const avg = s.reduce((a, b) => a + b, 0) / s.length; const p99 = s[Math.floor(s.length * 0.99)];
    return { fps: +(1000 / avg).toFixed(1), low1: +(1000 / p99).toFixed(1), worstMs: +s[s.length - 1].toFixed(1), over33: s.filter((x) => x > 33).length };`;
  const ready = async () => {
    for (let k = 0; k < 3; k++) {
      try {
        await b.waitFor(
          GAME_READY + ' && window.game && game.people && game.people.life && game.peds',
          90,
        );
        return;
      } catch (e) {
        /* */
      }
    }
  };
  for (const [name, x, z, hr, hd] of PLACES) {
    await ready();
    log(
      name + '_go',
      await E(
        `game.timeOfDay = ${hr}; const q = game.peds._nav.sidewalkNear({ x: ${x}, z: ${z} }, 60) || { x: ${x}, z: ${z} }; game.teleport(q.x, null, q.z, ${hd}); return { x: q.x, z: q.z, district: game.city.districtAt(q.x, q.z) };`,
      ),
    );
    await wait(name === 'ocean_drive_day' ? 22 : 16);
    await b.screenshot(`${OUT}/${name}.png`);
    log(
      name,
      await E(
        `return { inView: game.people.inView(), crowd: game.people.crowd.count, near: game.peds.count, gov: game.people.life.governor(), life: game.people.life.stats(), ${''}perf: await (async () => { ${frames} })() };`,
      ),
    );
  }
  // gunfire panic on Ocean Drive, two frames of the sequence
  await ready();
  await E(
    `game.timeOfDay = 13.5; const q = game.peds._nav.sidewalkNear({ x: 3430, z: -110 }, 60); game.teleport(q.x, null, q.z, 0.3); return 1;`,
  );
  await wait(14);
  await b.screenshot(`${OUT}/panic_0_before.png`);
  log(
    'panic',
    await E(
      `const p = game.player.position; game.emit('shot', { origin: { x: p.x, y: p.y, z: p.z } }); return game.people.life.stats().panics;`,
    ),
  );
  await wait(1.2);
  await b.screenshot(`${OUT}/panic_1.png`);
  await wait(2.5);
  await b.screenshot(`${OUT}/panic_2.png`);
  log(
    'end',
    await E(
      `return { life: game.people.life.stats(), failed: game.v2?.failed, perfWorst: game.perf?.worstMs };`,
    ),
  );
  if (b.errors.length) log('errors', b.errors.slice(0, 8));
});
fs.writeFileSync(`${OUT}/life_results.json`, JSON.stringify(res, null, 1));

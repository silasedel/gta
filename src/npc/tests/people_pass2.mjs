// Pass 2 evidence: conversations with the wheel open (two personalities), beach at noon, Low Tide Lola's with people.
import fs from 'node:fs';
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';
const OUT = 'docs/v2/shots/npc-ai';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const res = {};
const log = (k, v) => {
  res[k] = v;
  console.log(k, JSON.stringify(v).slice(0, 700));
};
await withBrowser({ width: 1280, height: 720, maxSeconds: 235 }, async (b) => {
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
  const enter = async () => {
    await b.eval(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); 1`);
    await b.waitFor(GAME_READY, 120);
  };
  const shot = async (f) => {
    try {
      await b.screenshot(f);
    } catch (e) {
      console.log('shot failed', f);
    }
  };
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 120);
  await enter();
  await wait(2);
  log('boot', await E(`return { talk: !!game.people?.talk, failed: game.v2?.failed };`));
  if (!process.env.ONLY_PLACES) {
    // ---- two conversations with different voice groups
    await E(`game.timeOfDay = 10; game.teleport(-2505, null, 555, 0.4); return 1;`);
    await wait(20);
    const used = [];
    for (const name of ['talk_a', 'talk_b']) {
      const r = await E(`
      const pp = game.player.position;
      const grp = (p) => p.identity.voice;
      const c = game.peds.list.filter((p) => p.active && !p.dead && p.identity && ['walk','talk','lean','bench'].includes(p.state) && !${JSON.stringify(used)}.includes(grp(p)))
        .sort((a, b) => a.pos.distanceTo(pp) - b.pos.distanceTo(pp))[0];
      if (!c) return { err: 'nobody' };
      const h = c.heading;
      game.teleport(c.pos.x + Math.sin(h) * 1.7, null, c.pos.z + Math.cos(h) * 1.7, h + Math.PI);
      window.__p = c;
      return { name: c.identity.name, voice: c.identity.voice, mood: c.mood, traits: c.identity.traits };`);
      log(name + '_who', r);
      if (r.voice) used.push(r.voice);
      await wait(1.5);
      log(name + '_start', await E(`return game.people.talk.start(window.__p);`));
      await wait(2.5);
      await E(`game.people.talk.choose(${name === 'talk_a' ? 1 : 4}); return 1;`);
      await wait(2.4);
      await shot(`${OUT}/${name}_wheel.png`);
      await E(`game.people.talk.choose(${name === 'talk_a' ? 3 : 2}); return 1;`);
      await wait(3.5);
      await E(`game.people.talk.end?.(); return 1;`);
      await wait(1.5);
    }
    // ---- 20 conversations in a row: count repeats
    log(
      'repeat20',
      await E(`
    const T = game.people.talk; const before = T.log().length;
    const ps = game.peds.list.filter((p) => p.active && !p.dead && p.identity);
    for (let i = 0; i < 20; i++) {
      const p = ps[i % ps.length]; p.state = 'walk';
      T.start(p);
      for (const c of [0, 1, 3, 4]) T.choose(c);
      T.end('leave');
      await new Promise((r) => setTimeout(r, 2600));
    }
    const lines = T.log().slice(before).filter((l) => l.who !== 'Nico').map((l) => l.text);
    return { replies: lines.length, distinct: new Set(lines).size, sample: lines.slice(0, 6), talkLines: T.lineCount() };`),
    );
  }
  // ---- beach at noon
  for (let tries = 0; tries < 3; tries++) {
    // the shared dev server may hot reload the page; retry
    await b.waitFor(GAME_READY + ' && window.game.people', 120);
    await enter();
    await E(`game.timeOfDay = 12.5; game.teleport(3575, null, -60, 3.14); return 1;`);
    await wait(18);
    const t1 = await E(
      `return game.people && game.people.crowd.count > 20 ? performance.now() : 0;`,
    );
    if (!t1) continue;
    await shot(`${OUT}/beach_noon.png`);
    const t2 = await E(`return game.people ? performance.now() : 0;`);
    if (t2 > t1) break; // no reload between the check and the screenshot
  }
  log(
    'beach',
    await E(
      `return { inView: game.people.inView(), crowd: game.people.crowd.count, peds: game.peds.count };`,
    ),
  );
  // ---- Low Tide Lola's
  const bar = await E(
    `const k = game.keysBar; return k ? { x: k.position.x, z: k.position.z, h: k.heading } : null;`,
  );
  log(
    'bar',
    bar ||
      (await E(
        `return { spot: game.keysBarLayoutSpot || null, loaded: (game.v2?.loaded || []).filter((n) => /keys/i.test(String(n))) };`,
      )),
  );
  if (bar && bar.x !== undefined) {
    await E(
      `game.timeOfDay = 18.5; game.teleport(${bar.x} + Math.sin(${bar.h}) * 13, null, ${bar.z} + Math.cos(${bar.h}) * 13, ${bar.h} + Math.PI); return 1;`,
    );
    await wait(14);
    log('barPeople', await E(`return game.people.barPeople();`));
    await shot(`${OUT}/keys_bar_people.png`);
  }
  log('errors', b.errors.filter((e) => /npc|people|talk|peds/i.test(e)).slice(0, 8));
});
fs.writeFileSync(`${OUT}/pass2_results.json`, JSON.stringify(res, null, 1));

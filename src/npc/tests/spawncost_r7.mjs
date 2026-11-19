// r7: what a peds.spawnAt costs (clerk / shopper / gang), split into body creation and dressing.  node src/npc/tests/spawncost_r7.mjs
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
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
  await b.waitFor(GAME_READY, 200);
  await b.eval(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); 1`);
  await b.waitFor(GAME_READY, 200);
  await wait(2);
  await E(
    `game.timeExternal = true; game.timeOfDay = 13; game.teleport(407, undefined, -110, 0.4); return 1;`,
  );
  await wait(25);
  if (0)
    console.log(
      'cost',
      JSON.stringify(
        await E(`const T = { create: 0, dress: 0, n: 0 }; const cp = game.npc.createPed, dr = game.people.dress;
    game.npc.createPed = (o) => { const t = performance.now(); try { return cp(o); } finally { T.create += performance.now() - t; } };
    game.people.dress = (...a) => { const t = performance.now(); try { return dr(...a); } finally { T.dress += performance.now() - t; } };
    const out = []; const pp = game.player.position;
    for (const outfit of ['clerk', 'casual', 'gang', 'rough', 'security', 'clerk', 'casual']) {
      T.create = 0; T.dress = 0; const t0 = performance.now();
      const p = game.peds.spawnAt({ x: pp.x + 6, y: undefined, z: pp.z + 3 }, { outfit });
      out.push([outfit, +(performance.now() - t0).toFixed(1), +T.create.toFixed(1), +T.dress.toFixed(1), p?.char?.personMeta?.look || null, p?.char?.personMeta?.role || null]);
      await new Promise((r) => setTimeout(r, 400));
    }
    game.npc.createPed = cp; game.people.dress = dr; return out;`),
      ),
    );
  console.log(
    'fresh',
    JSON.stringify(
      await E(`const pp = game.player.position, out = [];
    await new Promise((res) => { let w = 0, l = performance.now(); const s0 = l; const tk = () => { const n = performance.now(); w = Math.max(w, n - l); l = n; if (n - s0 < 2500) requestAnimationFrame(tk); else { out.push(['baseline worst frame', +w.toFixed(1)]); res(); } }; requestAnimationFrame(tk); });
    for (const zone of ['shop_staff', 'casual', 'business', 'street', 'gang', 'rough']) {
      const t0 = performance.now(); const c = game.npc.createPed({ seed: (Math.random() * 1e6) | 0, zone, pos: { x: pp.x + 5, y: pp.y, z: pp.z + 5 }, force: true }); const t1 = performance.now();
      if (c) { game.scene.add(c.root); c.root.position.set(pp.x + 4, pp.y, pp.z + 4); }
      const R = game.renderer, pr0 = R.info.programs?.length || 0, tx0 = R.info.memory.textures, gm0 = R.info.memory.geometries;
      let worst = 0, last = performance.now(); const f0 = last; await new Promise((res) => { const tick = () => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; if (n - f0 < 2500) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); }); const f1 = f0 + worst;
      const mats = new Set(); c?.root.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.type + ':' + (m.customProgramCacheKey?.() || '') + ':' + m.name)); });
      out.push([zone, +(t1 - t0).toFixed(1), +(f1 - f0).toFixed(1), c?.personMeta?.role || null, 'prog+' + ((R.info.programs?.length || 0) - pr0), 'tex+' + (R.info.memory.textures - tx0), 'geo+' + (R.info.memory.geometries - gm0), [...mats].slice(0, 6)]);
      if (c) { game.scene.remove(c.root); c.dispose?.(); }
    }
    return out;`),
    ),
  );
  if (b.errors.length) console.log('ERR', JSON.stringify(b.errors.slice(0, 4)).slice(0, 1200));
});

#!/usr/bin/env node
// Weapon hold review: boots the game once, gives Nico each weapon and takes close-ups (hands, side view) and gameplay
// third-person shots, idle and aiming.   node tools/v2/weapons/hold-shots.mjs --set h1 [--keys pistol,rifle] [--views close,tp,idle]
//   [--at x,z,heading] [--tod 12] [--cop 1] (a police officer with a pistol) [--w 1280 --h 720]
// -> docs/v2/shots/weapons/<set>_<key>_<view>.png
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'hold';
const DIR = path.resolve('docs/v2/shots/weapons'); fs.mkdirSync(DIR, { recursive: true });
const KEYS = (o.keys === 'none' ? '' : o.keys || 'pistol,compactpistol,slimpistol,chromepistol,snspistol,tacpistol,heavypistol,microsmg,smg,rifle,carbine,assaultrifle,specialrifle,tacrifle,battlerifle,sniper,lmg,bat,nailbat,crowbar,machete').split(',');
const VIEWS = (o.views || 'close,tp').split(',');
const AT = o.at ? o.at.split(',').map(Number) : null;
const log = [];
await withBrowser({ width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 1200) }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${+(o.tod || 12)};
    ${AT ? `game.teleport(${AT[0]}, undefined, ${AT[1]}, ${AT[2] || 0});` : ''}
    window.__P0 = [game.player.position.x, game.player.position.z, game.player.heading || 0];
    ${o.street ? `try { const rg = game.city.roadGraph, [x0, z0] = window.__P0; const r = rg.nearestEdge(x0 + ${+(o.dx || 0)}, z0 + ${+(o.dz || 0)}, {}, 120);
      if (r) { const P = r.edge.pts, g = (q) => (Array.isArray(q) ? { x: q[0], z: q[1] } : q); let bi = 0, bd = 1e9;
        for (let i = 0; i < P.length - 1; i++) { const a = g(P[i]); const dd = (a.x - r.point.x) ** 2 + (a.z - r.point.z) ** 2; if (dd < bd) { bd = dd; bi = i; } }
        const a = g(P[bi]), b2 = g(P[bi + 1]); const hh = Math.atan2(b2.x - a.x, b2.z - a.z);
        window.__P0 = [r.point.x, r.point.z, hh]; game.teleport(r.point.x, undefined, r.point.z, hh); } } catch (e) { window.__streetErr = String(e); }` : ''}
    return 1; })()`);
  await b.sleep(4000);
  await b.eval(`game.weapons && game.weapons.preload !== undefined; 1`);
  for (const k of KEYS.filter(Boolean)) {
    for (const v of VIEWS) {
      const r = await b.eval(`(async () => {
        const P = game.player, W = game.weapons, C = game.combat;
        const [x, z, h] = window.__P0; game.teleport(x, undefined, z, h);
        try { game.wanted?.clear?.('test'); } catch (e) { /* */ } try { game.police?.clearAll?.(); } catch (e) { /* */ } P.health = 100;
        W.give('${k}', 200, { select: true }); W.select('${k}');
        ${o.attach ? `{ const ok = W.attachSlots['${k}']; if (ok) {
          const mz = ok.muzzle.includes('suppressor') ? 'suppressor' : ok.muzzle.includes('comp') ? 'comp' : null; if (mz) W.setAttachment('${k}', 'muzzle', mz, { free: true });
          const sg = ok.sight.length > 1 ? (ok.sight.includes('holo') && '${k}'.includes('rifle') ? 'holo' : ok.sight.includes('reddot') ? 'reddot' : null) : null; if (sg) W.setAttachment('${k}', 'sight', sg, { free: true });
          if (ok.laser) W.setAttachment('${k}', 'laser', true, { free: true }); if (ok.light) W.setAttachment('${k}', 'light', true, { free: true }); } }` : ''}
        const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
        const aim = ${v === 'idle' || v === 'idleclose' ? 'false' : 'true'};
        const tgt = new (game.player.position.constructor)(x + fx * 25, P.position.y + 1.45, z + fz * 25);
        game.combatInput.aim = aim ? true : null;
        game.cameraOverride = null; C.aimTarget = aim ? tgt : null;
        if ('${v}' === 'close' || '${v}' === 'idleclose' || '${v}' === 'front') {
          game.cameraOverride = (dt, cam) => {
            const pp = game.player.position, hh = game.player.heading || h, f2x = Math.sin(hh), f2z = Math.cos(hh), r2x = -Math.cos(hh), r2z = Math.sin(hh);
            const hand = game.weapons.heldModel()?.getWorldPosition(new (game.player.position.constructor)()) || new (game.player.position.constructor)(pp.x, pp.y + 1.3, pp.z);
            if ('${v}' === 'front') cam.position.set(hand.x + f2x * 1.1 + r2x * 0.35, hand.y + 0.12, hand.z + f2z * 1.1 + r2z * 0.35);
            else cam.position.set(hand.x + r2x * 0.95 + f2x * 0.35, hand.y + 0.18, hand.z + r2z * 0.95 + f2z * 0.35);
            cam.lookAt(hand.x + f2x * 0.12, hand.y - 0.02, hand.z + f2z * 0.12); cam.fov = 40; cam.updateProjectionMatrix();
            if (aim) C.aimTarget = tgt;
            return true; };
        } else if (aim) { game.cameraYaw = h + Math.PI; }
        await new Promise((res) => setTimeout(res, ${+(o.wait || 1400)}));
        const m = W.heldModel();
        let dbg = null;
        try { const H = await import('/src/gameplay/gunHold.js'); const root = game.playerCharacter?.root; const r = H.rigOf(root);
          dbg = { ok: r?.ok, fing: r?.fingersR };
          try { dbg.hold = H.holdDebug(root, m); } catch (e) { dbg.err = String(e && e.stack || e).slice(0, 300); } } catch (e) { dbg = 'import ' + e; }
        return JSON.stringify({ k: '${k}', v: '${v}', lib: m?.userData.lib, ready: !!m?.userData.libReady, tris: m?.userData.tris, vis: !!m?.visible, dbg });
      })()`);
      const out = path.join(DIR, `${SET}_${k}_${v}.png`);
      await b.screenshot(out);
      console.log(r, out); log.push(JSON.parse(r));
    }
  }
  if (o.pickups) {
    // GTA-style pickups on the ground: a row of weapons a few meters ahead, day and night
    const types = String(o.pickups === true || o.pickups === '1' ? 'pistol,rifle,bat,heavypistol,smg,crowbar' : o.pickups).split(',');
    await b.eval(`(() => { const [x, z, h] = window.__P0; game.teleport(x, undefined, z, h); game.weapons.select('fist'); game.combatInput.aim = null; game.combat.aimTarget = null;
      try { game.wanted?.clear?.('test'); game.police?.clearAll?.(); } catch (e) { /* */ }
      const V = game.player.position.constructor, fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      const T = ${JSON.stringify(types)}; window.__pk = T.map((t, i) => game.pickups.spawn(t, new V(x + fx * 4.2 + rx * (i - (T.length - 1) / 2) * 1.25, game.player.position.y, z + fz * 4.2 + rz * (i - (T.length - 1) / 2) * 1.25), {}));
      game.cameraOverride = (dt, cam) => { const y = game.player.position.y; cam.position.set(x + fx * 1.2, y + 1.25, z + fz * 1.2); cam.lookAt(x + fx * 4.2, y + 0.25, z + fz * 4.2); cam.fov = 50; cam.updateProjectionMatrix(); return true; };
      return 1; })()`);
    await b.sleep(2500);
    console.log('PK', await b.eval(`JSON.stringify((window.__pk || []).map((p) => p && { t: p.type, pos: p.pos.toArray().map((v) => +v.toFixed(2)), vis: p.root.visible, inScene: !!p.root.parent, settled: p.settled, kids: p.model.children.length, wvis: p.model.userData.weapon?.visible, ready: p.model.userData.weapon?.userData.libReady, wpos: p.model.userData.weapon?.position.toArray().map((v) => +v.toFixed(2)) }))`));
    console.log('PL', await b.eval(`JSON.stringify(game.player.position.toArray().map((v) => +v.toFixed(2)))`));
    for (const [tod, tag] of [[11.5, 'day'], [21.5, 'night']]) {
      await b.eval(`game.timeOfDay = ${tod}; 1`); await b.sleep(3500);
      await b.screenshot(path.join(DIR, `${SET}_pickups_${tag}.png`)); console.log('pickups', tag);
    }
    await b.eval(`(() => { const [x, z, h] = window.__P0; const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      game.cameraOverride = (dt, cam) => { const y = game.player.position.y; cam.position.set(x + fx * 3.0 + rx * 0.9, y + 0.7, z + fz * 3.0 + rz * 0.9); cam.lookAt(x + fx * 4.2, y + 0.3, z + fz * 4.2); cam.fov = 40; cam.updateProjectionMatrix(); return true; }; game.timeOfDay = 11.5; return 1; })()`);
    await b.sleep(2500); await b.screenshot(path.join(DIR, `${SET}_pickups_close.png`));
    await b.eval(`(() => { const [x, z, h] = window.__P0; const fx = Math.sin(h), fz = Math.cos(h);
      game.cameraOverride = (dt, cam) => { const y = game.player.position.y; cam.position.set(x + fx * 16.2, y + 1.7, z + fz * 16.2); cam.lookAt(x + fx * 4.2, y + 0.3, z + fz * 4.2); cam.fov = 55; cam.updateProjectionMatrix(); return true; }; return 1; })()`);
    for (const [i, ms] of [[1, 400], [2, 1100], [3, 900]]) { await b.sleep(ms); await b.screenshot(path.join(DIR, `${SET}_pickups_12m_${i}.png`)); }
  }
  if (o.cop) {
    const r = await b.eval(`(async () => {
      const P = game.player; const pol = game.police; if (!pol) return 'no police';
      const [x, z, h] = window.__P0; game.teleport(x, undefined, z, h); game.weapons.select('fist'); game.combatInput.aim = null; game.combat.aimTarget = null;
      try { game.wanted?.clear?.('test'); } catch (e) { /* */ }
      const fx = Math.sin(h), fz = Math.cos(h);
      const rx = -Math.cos(h), rz = Math.sin(h); const u = pol.spawnCop(new (game.player.position.constructor)(x + fx * 7, P.position.y, z + fz * 7), h + Math.PI); if (!u) return 'no cop';
      window.__cop = u; u.mode = 'idle';
      game.cameraOverride = (dt, cam) => { const hp = u.gun.getWorldPosition(new (game.player.position.constructor)()); cam.position.set(hp.x - Math.cos(h) * 1.4 + fx * 0.6, hp.y + 0.25, hp.z + Math.sin(h) * 1.4 + fz * 0.6); cam.lookAt(hp.x, hp.y - 0.05, hp.z); cam.fov = 45; cam.updateProjectionMatrix(); return true; };
      await new Promise((res) => setTimeout(res, 2500));
      let hd = null; try { const H = await import('/src/gameplay/gunHold.js'); hd = H.holdDebug(u.char.root, u.gun); } catch (e) { hd = String(e); }
      const gp = u.gun.getWorldPosition(new (game.player.position.constructor)());
      return 'cop ' + u.gunKey + ' lib=' + u.gun.userData.lib + ' ready=' + !!u.gun.userData.libReady + ' vis=' + u.gun.visible + ' pos=' + gp.toArray().map((v) => v.toFixed(2)) + ' cop=' + u.pos.toArray().map((v) => v.toFixed(2)) + ' hd=' + JSON.stringify(hd);
    })()`);
    console.log(r); await b.screenshot(path.join(DIR, `${SET}_cop_idle.png`));
    const r2 = await b.eval(`(async () => { const u = window.__cop; try { game.wanted.setStars ? game.wanted.setStars(3, 'test') : (game.wanted.level = 3); } catch (e) { /* */ } u.mode = 'chase'; u.sees = true;
      const H = await import('/src/gameplay/gunHold.js');
      const aimCop = () => { try { const t = game.player.position.clone(); t.y += 1.3; H.holdWeapon(u.gun, u.char.root, { aim: t, dt: 0.016, time: game.clock.elapsed }); } catch (e) { window.__copErr = String(e); } };
      game.combat.late = game.combat.late || []; game.combat.late.push(aimCop);
      const keep = () => { aimCop(); u.mode = 'chase'; u.sees = true; u.fireCd = Math.max(u.fireCd || 0, 0.5); if (game.wanted.level < 3) { try { game.wanted.setStars(3, 'test'); } catch (e) { /* */ } } game.player.health = 100; };
      const hh = u.heading; game.cameraOverride = (dt, cam) => { const hp = u.gun.getWorldPosition(new (game.player.position.constructor)()); cam.position.set(hp.x - Math.cos(hh) * 1.7 + Math.sin(hh) * 0.5, hp.y + 0.2, hp.z + Math.sin(hh) * 1.7 + Math.cos(hh) * 0.5); cam.lookAt(hp.x, hp.y, hp.z); cam.fov = 45; cam.updateProjectionMatrix(); keep(); return true; };
      await new Promise((res) => setTimeout(res, 600)); return 'cop aim ' + u.mode + ' sees=' + u.sees + ' stars=' + game.wanted.level; })()`);
    console.log(r2); await b.screenshot(path.join(DIR, `${SET}_cop_aim.png`));
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 20).join('\n'));
});
fs.writeFileSync(path.join(DIR, `${SET}.json`), JSON.stringify(log, null, 1));

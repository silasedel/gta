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
const KEYS = (o.keys || 'pistol,compactpistol,slimpistol,chromepistol,snspistol,tacpistol,heavypistol,microsmg,smg,rifle,carbine,assaultrifle,specialrifle,tacrifle,battlerifle,sniper,lmg,bat,nailbat,crowbar,machete').split(',');
const VIEWS = (o.views || 'close,tp').split(',');
const AT = o.at ? o.at.split(',').map(Number) : null;
const log = [];
await withBrowser({ width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 1200) }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${+(o.tod || 12)};
    ${AT ? `game.teleport(${AT[0]}, undefined, ${AT[1]}, ${AT[2] || 0});` : ''}
    window.__P0 = [game.player.position.x, game.player.position.z, game.player.heading || 0]; return 1; })()`);
  await b.sleep(4000);
  await b.eval(`game.weapons && game.weapons.preload !== undefined; 1`);
  for (const k of KEYS) {
    for (const v of VIEWS) {
      const r = await b.eval(`(async () => {
        const P = game.player, W = game.weapons, C = game.combat;
        const [x, z, h] = window.__P0; game.teleport(x, undefined, z, h);
        W.give('${k}', 200, { select: true }); W.select('${k}');
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
        return JSON.stringify({ k: '${k}', v: '${v}', lib: m?.userData.lib, ready: !!m?.userData.libReady, tris: m?.userData.tris, vis: !!m?.visible });
      })()`);
      const out = path.join(DIR, `${SET}_${k}_${v}.png`);
      await b.screenshot(out);
      console.log(r, out); log.push(JSON.parse(r));
    }
  }
  if (o.cop) {
    const r = await b.eval(`(async () => {
      const P = game.player; const pol = game.police; if (!pol) return 'no police';
      const [x, z, h] = window.__P0; game.weapons.select('fist'); game.combatInput.aim = null; game.combat.aimTarget = null;
      const fx = Math.sin(h), fz = Math.cos(h);
      const u = pol.spawnCop(new (game.player.position.constructor)(x + fx * 3, P.position.y, z + fz * 3), h + Math.PI); if (!u) return 'no cop';
      window.__cop = u; u.mode = 'idle';
      game.cameraOverride = (dt, cam) => { const hp = u.gun.getWorldPosition(new (game.player.position.constructor)()); cam.position.set(hp.x - Math.cos(h) * 1.4 + fx * 0.6, hp.y + 0.25, hp.z + Math.sin(h) * 1.4 + fz * 0.6); cam.lookAt(hp.x, hp.y - 0.05, hp.z); cam.fov = 45; cam.updateProjectionMatrix(); return true; };
      await new Promise((res) => setTimeout(res, 2500));
      return 'cop ' + u.gunKey + ' lib=' + u.gun.userData.lib + ' ready=' + !!u.gun.userData.libReady;
    })()`);
    console.log(r); await b.screenshot(path.join(DIR, `${SET}_cop_idle.png`));
    const r2 = await b.eval(`(async () => { const u = window.__cop; (game.wanted || {}).level = 2; u.mode = 'chase'; u.sees = true;
      await new Promise((res) => setTimeout(res, 1800)); return 'cop aim ' + u.mode; })()`);
    console.log(r2); await b.screenshot(path.join(DIR, `${SET}_cop_aim.png`));
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 20).join('\n'));
});
fs.writeFileSync(path.join(DIR, `${SET}.json`), JSON.stringify(log, null, 1));

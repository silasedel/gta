#!/usr/bin/env node
// Weapon hold review: boots the game once, gives Nico each weapon and takes close-ups (hands, side view) and gameplay
// third-person shots, idle and aiming.   node tools/v2/weapons/hold-shots.mjs --set h1 [--keys pistol,rifle] [--views close,tp,idle]
//   [--at x,z,heading] [--tod 12] [--cop 1] (a police officer with a pistol) [--w 1280 --h 720]
// -> docs/v2/shots/weapons/<set>_<key>_<view>.png
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'hold';
const DIR = path.resolve('docs/v2/shots/weapons');
fs.mkdirSync(DIR, { recursive: true });
const KEYS = (
  o.keys === 'none'
    ? ''
    : o.keys ||
      'pistol,compactpistol,slimpistol,chromepistol,snspistol,tacpistol,heavypistol,microsmg,smg,rifle,carbine,assaultrifle,specialrifle,tacrifle,battlerifle,sniper,lmg,bat,nailbat,crowbar,machete'
).split(',');
const VIEWS = (o.views || 'close,tp').split(',');
const AT = o.at ? o.at.split(',').map(Number) : null;
const log = [];
await withBrowser(
  { width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 1200) },
  async (b) => {
    await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
    if (!(await startGame(b))) console.log('WARN: title did not close');
    await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${+(o.tod || 12)};
    ${AT ? `game.teleport(${AT[0]}, undefined, ${AT[1]}, ${AT[2] || 0});` : ''}
    window.__P0 = [game.player.position.x, game.player.position.z, game.player.heading || 0];
    ${
      o.street
        ? `try { const rg = game.city.roadGraph, [x0, z0] = window.__P0; const r = rg.nearestEdge(x0 + ${+(o.dx || 0)}, z0 + ${+(o.dz || 0)}, {}, 120);
      if (r) { const P = r.edge.pts, g = (q) => (Array.isArray(q) ? { x: q[0], z: q[1] } : q); let bi = 0, bd = 1e9;
        for (let i = 0; i < P.length - 1; i++) { const a = g(P[i]); const dd = (a.x - r.point.x) ** 2 + (a.z - r.point.z) ** 2; if (dd < bd) { bd = dd; bi = i; } }
        const a = g(P[bi]), b2 = g(P[bi + 1]); const hh = Math.atan2(b2.x - a.x, b2.z - a.z);
        const off = (r.edge.width || 7) / 2 + 1.6, px = r.point.x - Math.cos(hh) * off, pz = r.point.z + Math.sin(hh) * off;   // road shoulder, out of traffic
        window.__P0 = [px, pz, hh]; game.teleport(px, undefined, pz, hh); } } catch (e) { window.__streetErr = String(e); }`
        : ''
    }
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
        ${
          o.attach
            ? `{ const ok = W.attachSlots['${k}']; if (ok) {
          const mz = ok.muzzle.includes('suppressor') ? 'suppressor' : ok.muzzle.includes('comp') ? 'comp' : null; if (mz) W.setAttachment('${k}', 'muzzle', mz, { free: true });
          const sg = ok.sight.length > 1 ? (ok.sight.includes('holo') && '${k}'.includes('rifle') ? 'holo' : ok.sight.includes('reddot') ? 'reddot' : null) : null; if (sg) W.setAttachment('${k}', 'sight', sg, { free: true });
          if (ok.laser) W.setAttachment('${k}', 'laser', true, { free: true }); if (ok.light) W.setAttachment('${k}', 'light', true, { free: true }); } }`
            : ''
        }
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
        console.log(r, out);
        log.push(JSON.parse(r));
      }
    }
    if (o.pickups) {
      // GTA-style pickups on the ground: a row of weapons a few meters ahead, day and night
      const types = String(
        o.pickups === true || o.pickups === '1'
          ? 'pistol,rifle,bat,heavypistol,smg,crowbar'
          : o.pickups,
      ).split(',');
      await b.eval(`(() => { const [x, z, h] = window.__P0; game.teleport(x, undefined, z, h); game.weapons.select('fist'); game.combatInput.aim = null; game.combat.aimTarget = null;
      try { game.wanted?.clear?.('test'); game.police?.clearAll?.(); } catch (e) { /* */ }
      const V = game.player.position.constructor, fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      const T = ${JSON.stringify(types)}; window.__pk = T.map((t, i) => game.pickups.spawn(t, new V(x + fx * 4.2 + rx * (i - (T.length - 1) / 2) * 1.25, game.player.position.y, z + fz * 4.2 + rz * (i - (T.length - 1) / 2) * 1.25), {}));
      game.cameraOverride = (dt, cam) => { const y = game.player.position.y; cam.position.set(x + fx * 1.2, y + 1.25, z + fz * 1.2); cam.lookAt(x + fx * 4.2, y + 0.25, z + fz * 4.2); cam.fov = 50; cam.updateProjectionMatrix(); return true; };
      return 1; })()`);
      await b.sleep(2500);
      console.log(
        'PK',
        await b.eval(
          `JSON.stringify((window.__pk || []).map((p) => p && { t: p.type, pos: p.pos.toArray().map((v) => +v.toFixed(2)), vis: p.root.visible, inScene: !!p.root.parent, settled: p.settled, kids: p.model.children.length, wvis: p.model.userData.weapon?.visible, ready: p.model.userData.weapon?.userData.libReady, wpos: p.model.userData.weapon?.position.toArray().map((v) => +v.toFixed(2)) }))`,
        ),
      );
      console.log(
        'PL',
        await b.eval(`JSON.stringify(game.player.position.toArray().map((v) => +v.toFixed(2)))`),
      );
      for (const [tod, tag] of [
        [11.5, 'day'],
        [21.5, 'night'],
      ]) {
        await b.eval(`game.timeOfDay = ${tod}; 1`);
        await b.sleep(3500);
        await b.screenshot(path.join(DIR, `${SET}_pickups_${tag}.png`));
        console.log('pickups', tag);
      }
      await b.eval(`(() => { const [x, z, h] = window.__P0; const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      game.cameraOverride = (dt, cam) => { const y = game.player.position.y; cam.position.set(x + fx * 3.0 + rx * 0.9, y + 0.7, z + fz * 3.0 + rz * 0.9); cam.lookAt(x + fx * 4.2, y + 0.3, z + fz * 4.2); cam.fov = 40; cam.updateProjectionMatrix(); return true; }; game.timeOfDay = 11.5; return 1; })()`);
      await b.sleep(2500);
      await b.screenshot(path.join(DIR, `${SET}_pickups_close.png`));
      await b.eval(`(() => { const [x, z, h] = window.__P0; const fx = Math.sin(h), fz = Math.cos(h);
      game.cameraOverride = (dt, cam) => { const y = game.player.position.y; cam.position.set(x + fx * 16.2, y + 1.7, z + fz * 16.2); cam.lookAt(x + fx * 4.2, y + 0.3, z + fz * 4.2); cam.fov = 55; cam.updateProjectionMatrix(); return true; }; return 1; })()`);
      for (const [i, ms] of [
        [1, 400],
        [2, 1100],
        [3, 900],
      ]) {
        await b.sleep(ms);
        await b.screenshot(path.join(DIR, `${SET}_pickups_12m_${i}.png`));
      }
    }
    if (o.crate) {
      // the starter stash: the user's crate beside the pistol + ammo pickups
      const r =
        await b.eval(`(() => { const st = game.pickups.list.find((p) => p.starter && p.type === 'pistol'); if (!st) return 'no stash'; const c = st.pos.clone(); c.x -= 1.0; c.z -= 0.6;
      game.teleport(c.x + 4, undefined, c.z + 4, 0); try { game.wanted?.clear?.('test'); game.police?.clearAll?.(); } catch (e) { /* */ } game.weapons.select('fist'); game.combatInput.aim = null;
      game.cameraOverride = (dt, cam) => { cam.position.set(c.x + 2.1, c.y + 1.3, c.z + 1.9); cam.lookAt(c.x + 0.6, c.y + 0.3, c.z + 0.4); cam.fov = 50; cam.updateProjectionMatrix(); return true; };
      const crate = game.scene.getObjectByName('prop-crate'); return 'crate ' + (crate ? crate.position.toArray().map((v) => v.toFixed(2)) + ' kids=' + crate.children.length : 'missing') + ' stash ' + st.pos.toArray().map((v) => v.toFixed(2)); })()`);
      console.log(r);
      await b.sleep(2500);
      await b.screenshot(path.join(DIR, `${SET}_stash_crate.png`));
    }
    if (o.cop2) {
      // a standalone officer (same people model + same holdWeapon path the police use), posed every frame after the mixer
      const r = await b.eval(`(async () => {
      const [x, z, h] = window.__P0; game.teleport(x, undefined, z, h); game.weapons.select('fist'); game.combatInput.aim = null; game.combat.aimTarget = null;
      try { game.wanted?.clear?.('test'); game.police?.clearAll?.(); } catch (e) { /* */ }
      const V = game.player.position.constructor, fx = Math.sin(h), fz = Math.cos(h);
      const c = game.npc?.createCop?.({ seed: 7703, pos: new V(x + fx * 5, game.player.position.y, z + fz * 5) }); if (!c?.root) return 'no createCop';
      try { c.setCopGear?.(true); } catch (e) { /* */ }
      const GM = await import('/src/gameplay/gunModels.js'), H = await import('/src/gameplay/gunHold.js');
      const gun = GM.buildWeaponModel('pistol'); game.scene.add(gun); game.scene.add(c.root); c.root.visible = true;
      const cp = new V(x + fx * 5, game.player.position.y, z + fz * 5); c.root.position.copy(cp); c.root.rotation.y = h + Math.PI;
      window.__cop2 = { c, gun, cp, mode: 'idle' };
      const pose = (dt) => { const S = window.__cop2; S.c.root.position.copy(S.cp); try { S.c.update(dt || 0.016, { speed: 0, grounded: true, jumping: false, sprint: false, driving: false, punch: false, dead: false, guard: false }); } catch (e) { /* */ }
        S.c.root.position.copy(S.cp); S.c.root.updateMatrixWorld(true);
        const t = game.player.position.clone(); t.y += 1.35; H.holdWeapon(S.gun, S.c.root, { aim: S.mode === 'aim' ? t : null, dt: dt || 0.016, time: game.clock.elapsed }); };
      game.combat.late = game.combat.late || []; game.combat.late.push(pose); window.__cop2pose = pose;
      await new Promise((res) => setTimeout(res, 300)); window.__cop2.mode = 'aim'; await new Promise((res) => setTimeout(res, 300));
      const r = H.rigOf(c.root), fr = H.handFrame(c.root, 'R'), V3 = game.player.position.constructor;
      const la = r.larm.getWorldPosition(new V3()), ra = r.arm.getWorldPosition(new V3()), pp = game.player.position;
      const hd = H.holdDebug(c.root, gun); window.__cop2.mode = 'idle';
      return 'cop2 ok ' + gun.userData.lib + ' mirror=' + r.mirror + ' fingers=' + r.fingersR + ' hipsFwd=' + !!r.hipsFwd + ' L-R=' + la.clone().sub(ra).toArray().map((v) => v.toFixed(2)) + ' toPlayer=' + pp.clone().sub(ra).toArray().map((v) => v.toFixed(2)) + ' F=' + fr.F.map((v) => v.toFixed(2)) + ' S=' + fr.S.map((v) => v.toFixed(2)) + ' N=' + fr.N.map((v) => v.toFixed(2)) + ' hd=' + JSON.stringify(hd);
    })()`);
      console.log(r);
      const cam = (
        side,
      ) => `(() => { const S = window.__cop2; let hb = null; S.c.root.traverse((o) => { if (!hb && o.isBone && /Head$/.test(o.name)) hb = o; });
      game.cameraOverride = (dt, cam) => { try { window.__cop2pose(dt); } catch (e) { /* */ } const V = game.player.position.constructor, hp = hb.getWorldPosition(new V()), pp = game.player.position, dx = pp.x - hp.x, dz = pp.z - hp.z, L = Math.hypot(dx, dz) || 1, fx = dx / L, fz = dz / L, rx = -fz, rz = fx;
        if (${side === 'side'}) cam.position.set(hp.x - rx * 1.6 + fx * 0.55, hp.y - 0.15, hp.z - rz * 1.6 + fz * 0.55); else cam.position.set(hp.x + fx * 1.5 - rx * 0.9, hp.y - 0.1, hp.z + fz * 1.5 - rz * 0.9);
        cam.lookAt(hp.x + fx * 0.3, hp.y - 0.3, hp.z + fz * 0.3); cam.fov = 45; cam.updateProjectionMatrix(); return true; }; return 1; })()`;
      for (const [mode, side] of [
        ['idle', 'side'],
        ['aim', 'side'],
        ['aim', 'front'],
      ]) {
        await b.eval(`window.__cop2.mode = '${mode}'; 1`);
        await b.eval(cam(side));
        await b.sleep(1200);
        await b.screenshot(path.join(DIR, `${SET}_cop2_${mode}_${side}.png`));
        console.log('cop2', mode, side);
      }
    }
    if (o.cop) {
      const r = await b.eval(`(async () => {
      const P = game.player; const pol = game.police; if (!pol) return 'no police';
      const [x, z, h] = window.__P0; game.teleport(x, undefined, z, h); game.weapons.select('fist'); game.combatInput.aim = null; game.combat.aimTarget = null;
      try { game.wanted?.clear?.('test'); } catch (e) { /* */ }
      const fx = Math.sin(h), fz = Math.cos(h);
      const rx = -Math.cos(h), rz = Math.sin(h); const u = pol.spawnCop(new (game.player.position.constructor)(x + fx * 7, P.position.y, z + fz * 7), h + Math.PI); if (!u) return 'no cop';
      window.__cop = u; u.mode = 'idle';
      game.cameraOverride = (dt, cam) => { const hb = u.__hb || (u.__hb = (() => { let f = null; u.char.root.traverse((o) => { if (!f && o.isBone && /Head$/.test(o.name)) f = o; }); return f; })()); const c = hb ? hb.getWorldPosition(new (game.player.position.constructor)()).add({ x: 0, y: -1.45, z: 0 }) : u.pos, pp = game.player.position, dx = pp.x - c.x, dz = pp.z - c.z, L = Math.hypot(dx, dz) || 1, fx2 = dx / L, fz2 = dz / L, rx2 = -fz2, rz2 = fx2; cam.position.set(c.x + rx2 * -1.9 + fx2 * 0.5, c.y + 1.5, c.z + rz2 * -1.9 + fz2 * 0.5); cam.lookAt(c.x + fx2 * 0.4, c.y + 1.35, c.z + fz2 * 0.4); cam.fov = 45; cam.updateProjectionMatrix(); try { window.__copKeep && window.__copKeep(); } catch (e) { /* */ } return true; };
      await new Promise((res) => setTimeout(res, 2500));
      let hd = null; try { const H = await import('/src/gameplay/gunHold.js'); hd = H.holdDebug(u.char.root, u.gun); } catch (e) { hd = String(e); }
      const gp = u.gun.getWorldPosition(new (game.player.position.constructor)());
      return 'cop ' + u.gunKey + ' lib=' + u.gun.userData.lib + ' ready=' + !!u.gun.userData.libReady + ' vis=' + u.gun.visible + ' pos=' + gp.toArray().map((v) => v.toFixed(2)) + ' cop=' + u.pos.toArray().map((v) => v.toFixed(2)) + ' hd=' + JSON.stringify(hd);
    })()`);
      console.log(r);
      await b.screenshot(path.join(DIR, `${SET}_cop_idle.png`));
      const r2 =
        await b.eval(`(async () => { const u = window.__cop; try { game.wanted?.clear?.('test'); } catch (e) { /* */ }   // the aim pose is driven directly (no stars, so nobody arrests the player mid-shot)
      const H = await import('/src/gameplay/gunHold.js');
      const pin = u.pos.clone(), pinH = u.heading;
      const aimCop = () => { try { u.pos.copy(pin); u.heading = pinH; u.speed = 0; u.char.root.position.copy(pin); u.char.root.rotation.y = pinH; u.char.root.updateMatrixWorld(true); const t = game.player.position.clone(); t.y += 1.3; H.holdWeapon(u.gun, u.char.root, { aim: t, dt: 0.016, time: game.clock.elapsed }); } catch (e) { window.__copErr = String(e); } };
      game.combat.late = game.combat.late || []; game.combat.late.push(aimCop);
      const keep = window.__copKeep = () => { aimCop(); u.fireCd = Math.max(u.fireCd || 0, 0.5); game.player.health = 100; };
      const hh = u.heading; game.cameraOverride = (dt, cam) => { const hb = u.__hb || (u.__hb = (() => { let f = null; u.char.root.traverse((o) => { if (!f && o.isBone && /Head$/.test(o.name)) f = o; }); return f; })()); const c = hb ? hb.getWorldPosition(new (game.player.position.constructor)()).add({ x: 0, y: -1.45, z: 0 }) : u.pos, pp = game.player.position, dx = pp.x - c.x, dz = pp.z - c.z, L = Math.hypot(dx, dz) || 1, fx2 = dx / L, fz2 = dz / L, rx2 = -fz2, rz2 = fx2; cam.position.set(c.x + rx2 * -1.9 + fx2 * 0.5, c.y + 1.5, c.z + rz2 * -1.9 + fz2 * 0.5); cam.lookAt(c.x + fx2 * 0.4, c.y + 1.35, c.z + fz2 * 0.4); cam.fov = 45; cam.updateProjectionMatrix(); try { window.__copKeep && window.__copKeep(); } catch (e) { /* */ } return true; };
      await new Promise((res) => setTimeout(res, 600));
      window.__copFrame = JSON.stringify({ R: H.handFrame(u.char.root, 'R'), L: H.handFrame(u.char.root, 'L'), dbg: H.holdDebug(u.char.root, u.gun), bones: (() => { const n = []; u.char.root.traverse((b) => { if (b.isBone && /Hand|Arm|Head|Neck/.test(b.name)) n.push(b.name.replace('mixamorig', '')); }); return n.join(','); })() });
      return 'cop aim ' + u.mode + ' sees=' + u.sees + ' stars=' + game.wanted.level; })()`);
      console.log(r2);
      await b.screenshot(path.join(DIR, `${SET}_cop_aim.png`));
      console.log('COPFRAME', await b.eval('window.__copFrame'));
      // front view of the aiming cop
      await b.eval(
        `(() => { const u = window.__cop; game.cameraOverride = (dt, cam) => { const hb = u.__hb || (u.__hb = (() => { let f = null; u.char.root.traverse((o) => { if (!f && o.isBone && /Head$/.test(o.name)) f = o; }); return f; })()); const c = hb ? hb.getWorldPosition(new (game.player.position.constructor)()).add({ x: 0, y: -1.45, z: 0 }) : u.pos, pp = game.player.position, dx = pp.x - c.x, dz = pp.z - c.z, L = Math.hypot(dx, dz) || 1, fx2 = dx / L, fz2 = dz / L, rx2 = -fz2, rz2 = fx2; cam.position.set(c.x + fx2 * 1.7 + rx2 * -1.3, c.y + 1.5, c.z + fz2 * 1.7 + rz2 * -1.3); cam.lookAt(c.x, c.y + 1.3, c.z); cam.fov = 45; cam.updateProjectionMatrix(); try { window.__copKeep && window.__copKeep(); } catch (e) { /* */ } return true; }; return 1; })()`,
      );
      await b.sleep(500);
      await b.screenshot(path.join(DIR, `${SET}_cop_aim_front.png`));
    }
    if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 20).join('\n'));
  },
);
fs.writeFileSync(path.join(DIR, `${SET}.json`), JSON.stringify(log, null, 1));

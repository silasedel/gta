#!/usr/bin/env node
// W7 check (airports agent, Nov 19): the air station's dressing, the naval pier and a stolen-jet takeoff.
//   node tools/v2/airport/w7.mjs [--only all|recon|jet|shots] [--max 280]
//   recon: layout facts (placed statics, jets, a water map around the base) for planning
//   jet:   board the F-22, taxi straight out of its stand onto the runway, line up and take off
//   shots: screenshots of the dressed base and the naval pier
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) continue;
  const k = args[i].slice(2);
  opt[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
}
const OUT = 'docs/v2/shots/w7';
fs.mkdirSync(OUT, { recursive: true });
const only = opt.only || 'all';

await withBrowser({ width: 1280, height: 720, maxSeconds: +(opt.max || 280) }, async (b) => {
  const t0 = Date.now();
  const log = (...x) => console.log(Math.round((Date.now() - t0) / 1000) + 's', ...x);
  const ev = async (x) =>
    b.eval(
      `(async () => { try { return JSON.stringify(await (${x})); } catch (e) { return 'ERR ' + e + ' ' + (e.stack || '').slice(0, 300); } })()`,
    );
  await b.goto('http://127.0.0.1:5200/?mute=1' + (opt.q || ''));
  await b.waitFor(GAME_READY, 200).catch(() => log('NOT READY'));
  await startGame(b);
  await ev(`game.teleport(-4440, undefined, 6040, -1.4)`);
  await b
    .waitFor(`game.base && game.base.state === 'live' && game.base.zone`, 120)
    .catch(() => log('base not live'));
  log('base live');

  if (only === 'recon') {
    log(
      'built',
      await ev(`(() => {
        const B = game.base.built;
        const r = (p) => p && [Math.round(p.x), Math.round(p.z)];
        return {
          jets: B.jets.map((A) => [A.T.model, Math.round(A.S.pos.x), Math.round(A.S.pos.z), +A.heading?.toFixed?.(2)]),
          c130: B.c130, cargo: B.cargo, hangars: B.hangars, gate: B.gate, towers: B.towers,
          pad: r(B.pad), dressing: B.dressing, pier: B.pier,
        };
      })()`),
    );
    // water map: '~' water, '#' airside, '.' land, 25 m cells
    log(
      'water',
      await ev(`(() => {
        const rows = [];
        for (let z = 5400; z <= 6600; z += 25) {
          let s = '';
          for (let x = -5300; x <= -4250; x += 25) s += game.city.isWater(x, z) ? '~' : '.';
          rows.push(z + ' ' + s);
        }
        return rows;
      })()`),
    );
  }

  if (only === 'shots' || only === 'all') {
    log(
      'placed',
      await ev(`(() => {
        const B = game.base.built;
        return { dressing: B.dressing, pier: B.pier && { ...B.pier, end: B.pier.end }, towers: B.towers,
          jets: B.jets.map((A) => [A.T.model, Math.round(A.S.pos.x), Math.round(A.S.pos.z)]) };
      })()`),
    );
    // camera views computed from what was placed: [id, camera xyz, target xyz]
    const views = JSON.parse(
      await ev(`(() => {
        const B = game.base.built;
        const D = B.dressing || {};
        const v = [['overview', [-4330, 260, 6420], [-4640, 0, 6080]]];
        const near = (p, dx, dy, dz) => [[p.x + dx, dy, p.z + dz], [p.x, 2, p.z]];
        if (D.camp) v.push(['camp', ...near(D.camp, 45, 28, 35)]);
        if (D.huts?.[0]) v.push(['huts', ...near(D.huts[0], -40, 16, 25)]);
        if (D.mast) v.push(['mast', ...near(D.mast, -35, 14, 30)]);
        if (B.pier) {
          const P = B.pier;
          const mx = (P.x + P.end.x) / 2, mz = (P.z + P.end.z) / 2;
          v.push(['pier', [P.x - Math.cos(P.heading) * 90 - Math.sin(P.heading) * 40, 45, P.z + Math.sin(P.heading) * 90 - Math.cos(P.heading) * 40], [mx, 2, mz]]);
          v.push(['pier_root', [P.x - Math.sin(P.heading) * 40 + Math.cos(P.heading) * 12, 6, P.z - Math.cos(P.heading) * 40 - Math.sin(P.heading) * 12], [P.x, 3, P.z]]);
        }
        const j = B.jets[0];
        if (j) {
          const h = Math.atan2(new j.mesh.position.constructor(0, 0, 1).applyQuaternion(j.S.q).x, new j.mesh.position.constructor(0, 0, 1).applyQuaternion(j.S.q).z);
          v.push(['f22', [j.S.pos.x - Math.sin(h) * 40, 14, j.S.pos.z - Math.cos(h) * 40], [j.S.pos.x + Math.sin(h) * 60, 0, j.S.pos.z + Math.cos(h) * 60]]);
        }
        return v;
      })()`),
    );
    for (const [id, c, t] of views) {
      await ev(`game.teleport(${t[0]}, undefined, ${t[2]}, 0)`);
      await ev(
        `(() => { game.cameraOverride = (dt, cam) => { cam.position.set(${c}); cam.up.set(0, 1, 0); cam.lookAt(${t}); return true; }; return 1; })()`,
      );
      await b.sleep(id === 'overview' ? 4000 : 2500);
      await b.screenshot(`${OUT}/${id}.jpg`);
      log('shot', id);
    }
    await ev(`(() => { game.cameraOverride = null; return 1; })()`);
  }
  if (only === 'jet' || only === 'all') {
    // board the F-22 the way the player does (aircraft vehicle kind), then hold W
    const info = await ev(`(() => {
      const A = game.base.built.jets.find((j) => /22/.test(j.T.model)) || game.base.built.jets[0];
      window.__jet = A;
      game.teleport(A.S.pos.x + 6, undefined, A.S.pos.z, 0);
      return { model: A.T.model, x: A.S.pos.x, z: A.S.pos.z };
    })()`);
    log('jet', info);
    await b.sleep(2500);
    log(
      'enter',
      await ev(
        `(() => { game.enterVehicle(window.__jet); return !!window.__jet.playerDriven; })()`,
      ),
    );
    // A tiny pilot: full throttle, steer with Q/E toward the runway centerline, then rotate
    await ev(`(() => {
      const A = window.__jet;
      const rw = { a: [-4818, 5522], b: [-4587, 6468] }; // eyw 17/35
      const dir = Math.atan2(rw.b[0] - rw.a[0], rw.b[1] - rw.a[1]);
      const i = game.input;
      window.__k = new Set(['KeyW']);
      if (!i.__down) {
        i.__down = i.down;
        i.down = (c) => window.__k.has(c) || i.__down(c);
      }
      const head = () => {
        const f = new A.mesh.position.constructor(0, 0, 1).applyQuaternion(A.S.q);
        return Math.atan2(f.x, f.z);
      };
      const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      // distance to the runway centerline (signed) and along it
      const off = () => {
        const dx = rw.b[0] - rw.a[0], dz = rw.b[1] - rw.a[1], L = Math.hypot(dx, dz);
        const px = A.S.pos.x - rw.a[0], pz = A.S.pos.z - rw.a[1];
        return { side: (px * dz - pz * dx) / L, along: (px * dx + pz * dz) / L, L };
      };
      window.__log = [];
      let phase = 'taxi', sign = 1, t = 0;
      window.__pilot = setInterval(() => {
        t += 0.1;
        const o = off();
        const h = head();
        const v = A.S.vel.length();
        let want = h;
        if (phase === 'taxi' && Math.abs(o.side) < 30) phase = 'turn';
        if (phase !== 'taxi') want = dir - Math.max(-0.5, Math.min(0.5, o.side * 0 * sign));
        const err = wrap(want - h);
        // taxi at walking-pace jet speeds: the throttle lever stays where W / S leave it
        window.__k = new Set();
        if (phase === 'roll') window.__k.add('KeyW');
        else {
          const limit = phase === 'taxi' ? 9 : 6;
          if (v < limit && A.S.ctl.throttle < 0.3) window.__k.add('KeyW');
          if (v > limit) window.__k.add('KeyS');
          if (v > limit + 2) window.__k.add('Space');
        }
        // Q turns the nose right of the heading sign used here (E lowers the heading)
        if (Math.abs(err) > 0.03) window.__k.add(err > 0 ? 'KeyQ' : 'KeyE');
        if (phase === 'turn' && Math.abs(wrap(dir - h)) < 0.08) phase = 'roll';
        if (phase === 'roll' && v * 3.6 > 260) window.__k.add('KeyK');
        if ((t * 10) % 10 < 1)
          window.__log.push([phase, Math.round(t), Math.round(A.S.pos.x), Math.round(A.S.pos.z),
            Math.round(A.S.pos.y), Math.round(v * 3.6), +h.toFixed(2), Math.round(o.side), A.S.onGround]);
      }, 100);
      return dir;
    })()`);
    for (let k = 0; k < 9; k++) {
      await b.sleep(6000);
      const s = JSON.parse(await ev(`window.__log.slice(-1)[0]`));
      log('pilot', s);
      if (k === 2) await b.screenshot(OUT + '/jet_taxi.jpg');
      if (s && s[4] > 30) break;
    }
    await b.screenshot(OUT + '/jet_air.jpg');
    log('trace', await ev(`window.__log.filter((_, i) => i % 3 === 0)`));
    await ev(`(() => { clearInterval(window.__pilot); window.__k = new Set(); })()`);
  }

  if (b.errors.length) log('console errors', b.errors.slice(0, 6));
});

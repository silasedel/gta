// r5-bridge: in-game check of the Keys highway end decks (V2 test browser only).
//   node tools/v2/map3/r5_bridge_check.mjs [--tag r5b1] [--q "&keysbridge=1"] [--only n_air,s_air] [--nodrive]
// Shots at every land / bridge join (docs/v2/shots/keys/r5bridge/<tag>_<id>.jpg), a collider ray probe every 6 m along both
// end decks + ramps (hole: no fixed collider within 1.5 m of the game's own road height; step: > 0.6 m between samples), a
// player drive over each deck (W held, car height logged), traffic on the decks, console + [rapierguard] errors.
// Report: docs/v2/reports/keys-r5-bridge.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const TAG = o.tag || 'r5b1',
  OUT = 'docs/v2/shots/keys/r5bridge';
const K = JSON.parse(fs.readFileSync('tools/v2/map3/out/keys_detail.json', 'utf8'));
const AX = K.grid.axis,
  S = [0];
for (let i = 1; i < AX.length; i++)
  S.push(S[i - 1] + Math.hypot(AX[i][0] - AX[i - 1][0], AX[i][1] - AX[i - 1][1]));
const L = S[S.length - 1];
const at = (s) => {
  let i = 1;
  while (i < S.length - 1 && S[i] < s) i++;
  const t = (s - S[i - 1]) / (S[i] - S[i - 1] || 1);
  return [
    AX[i - 1][0] + (AX[i][0] - AX[i - 1][0]) * t,
    AX[i - 1][1] + (AX[i][1] - AX[i - 1][1]) * t,
  ];
};
const dir = (s) => {
  const p = at(Math.max(0, s - 3)),
    q = at(Math.min(L, s + 3)),
    l = Math.hypot(q[0] - p[0], q[1] - p[1]);
  return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
};
const ends = { N: [0, 600], SW: [L - 430, L] };
// camera spots: [eye x, y, z] / [look x, y, z]; y < 0 = that far above the game's road / ground height there
const spot = (s, side, back, h, lookAhead, lookH) => {
  const p = at(s),
    d = dir(s),
    r = [-d[1], d[0]];
  return {
    eye: [p[0] + r[0] * side - d[0] * back, h, p[1] + r[1] * side - d[1] * back],
    look: [at(s + lookAhead)[0], lookH, at(s + lookAhead)[1]],
  };
};
const SP = {
  n_air: { ...spot(170, 160, 0, 75, 0, 2), tod: 15 },
  n_water: { ...spot(150, -70, -10, 1.6, 40, 5), tod: 15 },
  n_mainjoin: { ...spot(5, 0, 80, -1.6, 60, -1.2), tod: 15 },
  n_drive: { ...spot(200, 3, 0, -1.4, 120, -1.2), tod: 15 },
  n_islandjoin: { ...spot(470, -2, -60, -1.6, -110, -0.2), tod: 15 },
  s_air: { ...spot(L - 160, -150, 0, 70, 0, 2), tod: 15 },
  s_water: { ...spot(L - 120, 70, 0, 1.6, -10, 5), tod: 15 },
  s_islandjoin: { ...spot(L - 290, 2, 0, -1.6, 110, -0.2), tod: 15 },
  s_mainjoin: { ...spot(L - 40, 3, -10, -1.4, 160, -1.2), tod: 15 },
};
const only = o.only ? String(o.only).split(',') : Object.keys(SP);
const rep = {
  tag: TAG,
  when: new Date().toISOString(),
  L: Math.round(L),
  probe: {},
  drive: {},
  traffic: {},
  shots: [],
  errors: [],
  rapierguard: [],
};
const waitStream = async (b, x, z, sec = 25) => {
  await b
    .waitFor(
      `(() => { const s = game.city.streamer; return !s || !s.readyAround || s.readyAround(${x}, ${z}, 300); })()`,
      sec,
    )
    .catch(() => {});
  await b.sleep(600);
};
const tp = (b, x, z, h = 0) =>
  b.eval(
    `(async () => { for (let t = 0; t < 12; t++) { try { if (game.player?.vehicle || game.playerVehicle) game.exitVehicle(); game.teleport(${x}, undefined, ${z}, ${h}); return 1; } catch (e) { await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 40))); } } return 0; })()`,
  );

await withBrowser({ width: 1600, height: 900, maxSeconds: +(o.max || 1500) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1&rapierguard=1' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { game.timeExternal = true; game.timeOfDay = 15; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(true); } catch (e) {} const st = document.createElement('style'); st.textContent = 'body * { visibility: hidden !important; } canvas.r5shot { visibility: visible !important; }'; document.head.appendChild(st); game.renderer.domElement.classList.add('r5shot'); return 1; })()`,
  );
  // ---- collider probe along both end decks
  if (!o.noprobe)
    for (const [nm, [s0, s1]] of Object.entries(ends)) {
      const pts = [];
      for (let s = s0; s <= s1; s += 6) pts.push(at(s));
      const res = { n: 0, holes: [], steps: [], yMax: 0 };
      let prev = null;
      for (let c = 0; c < pts.length; c += 30) {
        const ch = pts.slice(c, c + 30),
          m = ch[Math.floor(ch.length / 2)];
        await tp(b, m[0], m[1]);
        await waitStream(b, m[0], m[1]);
        const hs =
          await b.eval(`(() => { const R = game.RAPIER, W = game.world, QF = R.QueryFilterFlags, FIX = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS, c = game.city;
        return ${JSON.stringify(ch)}.map(([x, z]) => { const g = c.groundHeightAt ? c.groundHeightAt(x, z, 30) : 0; const ref = Number.isFinite(g) ? g : 0, top = ref + 1.8;
          const h = W.castRay(new R.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), 40, true, FIX); return [+ref.toFixed(2), h ? +(top - h.timeOfImpact).toFixed(2) : null]; }); })()`);
        hs.forEach(([ref, y], k) => {
          const p = ch[k];
          res.n++;
          res.yMax = Math.max(res.yMax, y ?? 0);
          if (y == null || Math.abs(y - ref) > 1.5)
            res.holes.push({ x: +p[0].toFixed(1), z: +p[1].toFixed(1), ref, y });
          if (prev != null && y != null && Math.abs(y - prev) > 0.6)
            res.steps.push({ x: +p[0].toFixed(1), z: +p[1].toFixed(1), from: prev, to: y });
          if (y != null) prev = y;
        });
      }
      rep.probe[nm] = res;
      console.log(
        'probe',
        nm,
        res.n,
        'holes',
        res.holes.length,
        'steps',
        res.steps.length,
        'yMax',
        res.yMax,
      );
    }
  // ---- shots
  for (const id of only) {
    const s = SP[id];
    await tp(b, s.eye[0], s.eye[2]);
    await waitStream(b, s.eye[0], s.eye[2]);
    await b.eval(`(() => { const s = ${JSON.stringify(s)}, c = game.city, T = game.THREE; game.timeOfDay = s.tod;
      const gh = (x, z) => { const g = c.groundHeightAt ? c.groundHeightAt(x, z, 30) : 0; return Number.isFinite(g) ? Math.max(g, 0) : 0; };
      const e = new T.Vector3(s.eye[0], s.eye[1] < 0 ? gh(s.eye[0], s.eye[2]) - s.eye[1] : s.eye[1], s.eye[2]), l = new T.Vector3(s.look[0], s.look[1] < 0 ? gh(s.look[0], s.look[2]) - s.look[1] : s.look[1], s.look[2]);
      if (game.player?.mesh) game.player.mesh.visible = false; game.cameraOverride = (dt, cam) => { cam.position.copy(e); cam.lookAt(l); cam.fov = 60; cam.updateProjectionMatrix(); return true; }; return 1; })()`);
    await b.sleep(2500);
    for (let i = 0; i < 12; i++) {
      const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
      if (q < 3) break;
      await b.sleep(1000);
    }
    await b.sleep(800);
    const f = `${OUT}/${TAG}_${id}.jpg`;
    await b.screenshot(f, { format: 'jpeg', quality: 90 });
    rep.shots.push(f);
    console.log('shot', f);
    console.log('  errors so far', b.errors.length);
  }
  await b.eval(
    '(() => { game.cameraOverride = null; if (game.player?.mesh) game.player.mesh.visible = true; return 1; })()',
  );
  // ---- drive over each deck (player car, W held) + traffic on the decks
  if (!o.nodrive)
    for (const [nm, s0, sg] of [
      ['N', 25, 1],
      ['SW', L - 25, -1],
    ]) {
      const p = at(s0),
        d = dir(s0).map((v) => v * sg),
        hd = Math.atan2(d[0], d[1]);
      await tp(b, p[0] - d[1] * 4, p[1] + d[0] * 4);
      await waitStream(b, p[0], p[1]);
      const ok =
        await b.eval(`(async () => { const v = await game.vehicles.spawnParked('sedan', { x: ${p[0] - d[1] * 2.5}, z: ${p[1] + d[0] * 2.5}, heading: ${hd}, keepSpot: true, locked: false }); if (!v) return 'no car'; window.__r5v = v;
      await new Promise((r) => setTimeout(r, 800)); try { game.enterVehicle(v); } catch (e) { return 'enter ' + e.message; } return 'ok'; })()`);
      await b.sleep(1800);
      const log = [];
      await b.key('KeyW', true, 'w');
      for (let t = 0; t < 26; t++) {
        await b.sleep(500);
        log.push(
          await b.eval(
            `(() => { const v = window.__r5v, q = v.mesh.position; return [+q.x.toFixed(1), +q.y.toFixed(2), +q.z.toFixed(1), +((v.speed ?? v.body?.linvel?.()?.x ?? 0)).toFixed?.(1) ?? 0]; })()`,
          ),
        );
        if (t === 12) {
          const f = `${OUT}/${TAG}_drive_${nm}.jpg`;
          await b.screenshot(f, { format: 'jpeg', quality: 90 });
          rep.shots.push(f);
        }
      }
      await b.key('KeyW', false, 'w');
      const dist = Math.hypot(
        log[log.length - 1][0] - log[0][0],
        log[log.length - 1][2] - log[0][2],
      );
      const traffic = await b.eval(
        `(() => { const out = []; for (const v of game.vehicles.list || []) { const q = v.mesh?.position; if (!q || v === window.__r5v) continue; if (Math.hypot(q.x - ${p[0]}, q.z - ${p[1]}) < 400) out.push([+q.x.toFixed(0), +q.y.toFixed(1), +q.z.toFixed(0)]); } return out; })()`,
      );
      rep.drive[nm] = {
        spawn: ok,
        dist: +dist.toFixed(1),
        yMin: Math.min(...log.map((r) => r[1])),
        yMax: Math.max(...log.map((r) => r[1])),
        log,
      };
      rep.traffic[nm] = traffic;
      console.log(
        'drive',
        nm,
        ok,
        'dist',
        dist.toFixed(0),
        'y',
        rep.drive[nm].yMin,
        rep.drive[nm].yMax,
        'traffic near',
        traffic.length,
        'on deck (y>4)',
        traffic.filter((t) => t[1] > 4).length,
      );
      await b.eval(
        `(() => { try { game.exitVehicle(); } catch (e) {} try { game.vehicles.remove(window.__r5v); } catch (e) {} return 1; })()`,
      );
      await b.sleep(800);
    }
  rep.errors = b.errors.slice(0, 40);
  rep.rapierguard = [...b.errors, ...b.logs].filter((t) => /rapierguard/.test(t)).slice(0, 10);
  console.log('console errors', b.errors.length, 'rapierguard', rep.rapierguard.length);
  for (const e of b.errors.slice(0, 8)) console.log('  ', e.slice(0, 300));
});
fs.writeFileSync('docs/v2/reports/keys-r5-bridge.json', JSON.stringify(rep, null, 1));

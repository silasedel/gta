#!/usr/bin/env node
// r2-qa: the player's first 2-3 minutes, scripted on a fresh default boot (5200): yard 360 look, walk to the truck, enter,
// drive Pelican Point Ln -> the Overseas Hwy (~60 s, route from game.nav, keys only), stop, exit, a neighbor's coupe4.
// Chase-cam frame every 1.5 s (HUD on, default camera) + close-ups at each stop. Frames: docs/v2/shots/qa/first/,
// contact sheets first_sheet_<n>.jpg, log docs/v2/reports/qa-first-minutes.json.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const DIR = 'docs/v2/shots/qa/first';
fs.mkdirSync(DIR, { recursive: true });
const rep = { when: new Date().toISOString(), frames: [], events: [], console: [] };
const save = () =>
  fs.writeFileSync('docs/v2/reports/qa-first-minutes.json', JSON.stringify(rep, null, 1));
let n = 0;
await withBrowser({ width: 1280, height: 720, maxSeconds: 1500 }, async (b) => {
  const con = new Map();
  b.on((m, p) => {
    let lvl, text, url;
    if (m === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(p.type)) {
      lvl = p.type;
      text = (p.args || []).map((x) => x.value ?? x.description ?? '').join(' ');
      const f = p.stackTrace?.callFrames?.[0];
      url = f
        ? `${f.url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]}:${f.lineNumber + 1}`
        : '';
    } else if (m === 'Runtime.exceptionThrown') {
      lvl = 'exception';
      const d = p.exceptionDetails;
      text = d.exception?.description || d.text;
      const f = d.stackTrace?.callFrames?.[0];
      url = f
        ? `${f.url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]}:${f.lineNumber + 1}`
        : '';
    } else if (m === 'Log.entryAdded' && ['error', 'warning'].includes(p.entry.level)) {
      lvl = 'log-' + p.entry.level;
      text = p.entry.text;
      url = (p.entry.url || '').replace(/^https?:\/\/[^/]+\//, '');
    } else return;
    const k = lvl + '|' + String(text).slice(0, 140);
    const e = con.get(k);
    if (e) e.n++;
    else
      con.set(k, {
        lvl,
        text: String(text).slice(0, 300),
        url,
        n: 1,
        at: rep.phase || 'boot',
        t: n,
      });
  });
  const ev = async (e, ms) => {
    try {
      return await b.eval(e, ms);
    } catch (err) {
      rep.events.push(['EVAL FAIL', err.message.slice(0, 200)]);
      console.log('EVAL FAIL', err.message.slice(0, 200));
      return null;
    }
  };
  const state = async () =>
    JSON.parse(
      (await ev(`(() => { const P = game.player, v = P.state.vehicle; const o = { p: [P.position.x, P.position.y, P.position.z].map((x) => +x.toFixed(2)), inV: !!P.state.inVehicle };
    if (v) { const t = v.body.translation(), lv = v.body.linvel(), q = v.body.rotation(); const up = new game.THREE.Vector3(0, 1, 0).applyQuaternion(new game.THREE.Quaternion(q.x, q.y, q.z, q.w)).y; Object.assign(o, { car: v.typeKey, cp: [t.x, t.y, t.z].map((x) => +x.toFixed(2)), kmh: +(Math.hypot(lv.x, lv.z) * 3.6).toFixed(1), vy: +lv.y.toFixed(2), up: +up.toFixed(3) }); }
    try { o.zone = document.querySelector('.ps-mm-zone')?.textContent || ''; } catch (e) {} return JSON.stringify(o); })()`)) ||
        '{}',
    );
  const shot = async (tag) => {
    const f = `${DIR}/${String(++n).padStart(3, '0')}_${tag}.jpg`;
    await b.screenshot(f, { quality: 82 });
    const s = await state();
    rep.frames.push({ f, tag, phase: rep.phase, ...s });
    return f;
  };

  rep.phase = 'boot';
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await shot('title');
  await startGame(b);
  await b.sleep(1500);
  // 1. the yard: look around (the gameplay camera, 8 x 45 deg)
  rep.phase = 'yard360';
  const yaw0 = await ev('game.cameraYaw');
  for (let k = 0; k < 8; k++) {
    await ev(`(() => { game.cameraYaw = ${yaw0} + ${k} * Math.PI / 4; return 1; })()`);
    await b.sleep(900);
    await shot(`yard_look${k * 45}`);
  }
  await ev(`(() => { game.cameraYaw = ${yaw0}; return 1; })()`);
  // 2. walk to the truck (Nico's first car)
  rep.phase = 'walk_truck';
  const truck = JSON.parse(
    (await ev(
      `(() => { const L = (game.vehicles.nicoCars || []).filter(Boolean); const P = game.player.position; let v = L.find((q) => /truck|pickup/.test(q.typeKey)) || L[0]; if (!v) { let bd = 1e9; for (const q of game.vehicles.list) { const t = q.body.translation(); const d = Math.hypot(t.x - P.x, t.z - P.z); if (!q.ai && d < bd) { bd = d; v = q; } } } window.__truck = v; const t = v.body.translation(); return JSON.stringify({ key: v.typeKey, x: t.x, z: t.z, d: Math.hypot(t.x - P.x, t.z - P.z) }); })()`,
    )) || 'null',
  );
  rep.events.push(['truck', truck]);
  await ev(
    `(() => { window.__walkTo = (x, z) => { const P = game.player.position; const h = Math.atan2(x - P.x, z - P.z); game.cameraYaw = h + Math.PI; }; return 1; })()`,
  );
  const kd = (c) => b.key(c, true, c.replace('Key', '').toLowerCase()),
    ku = (c) => b.key(c, false, c.replace('Key', '').toLowerCase());
  await kd('KeyW');
  for (let i = 0; i < 8; i++) {
    const d = await ev(
      `(() => { const v = window.__truck, t = v.body.translation(); const P = game.player.position; window.__walkTo(t.x, t.z); return Math.hypot(t.x - P.x, t.z - P.z); })()`,
    );
    if (d != null && d < 3.2) break;
    await b.sleep(1500);
    await shot('walk_truck');
  }
  await ku('KeyW');
  // close-up: the truck from outside, then enter it like the F key does (game.enterVehicle) and look at the driver through the window
  await ev(`(() => { const v = window.__truck, t = v.body.translation(), q = v.body.rotation(); const T = game.THREE, Q = new T.Quaternion(q.x, q.y, q.z, q.w); const side = new T.Vector3(1, 0, 0).applyQuaternion(Q), fw = new T.Vector3(0, 0, 1).applyQuaternion(Q);
    window.__aimCar = (s, f, h, dist) => { const e = new T.Vector3(t.x, t.y, t.z).addScaledVector(side, s * dist).addScaledVector(fw, f); e.y += h; game.cameraOverride = (dt, c) => { const tt = v.body.translation(); c.position.copy(e); c.lookAt(tt.x, tt.y + 0.5, tt.z); return true; }; }; window.__aimCar(1, 1.5, 0.9, 5); return 1; })()`);
  await b.sleep(900);
  await shot('close_truck_outside');
  await ev(
    '(() => { game.cameraOverride = null; game.enterVehicle(window.__truck); return 1; })()',
  );
  await b.sleep(1800);
  await ev('(() => { window.__aimCar(1, 0.3, 0.75, 2.2); return 1; })()');
  await b.sleep(900);
  await shot('close_truck_driver_window');
  await ev('(() => { window.__aimCar(-1, 0.3, 0.75, 2.2); return 1; })()');
  await b.sleep(900);
  await shot('close_truck_passenger_window');
  await ev('(() => { game.cameraOverride = null; return 1; })()');
  await b.sleep(1200);
  await shot('in_truck_chase');
  // 3. drive to the Overseas Hwy along a nav route (pure pursuit with W / A / D / S)
  rep.phase = 'drive';
  const route = JSON.parse(
    (await ev(
      `(async () => { const G = game.city.roadGraph, P = game.player.position; let best = null, bd = 1e12;
    for (const e of G.edges) { if (!/overseas|^us[ -]?1\\b|us highway 1|^us-1/i.test(e.name || '')) continue; for (const p of e.pts) { const d = Math.hypot(p[0] - P.x, p[1] - P.z); if (d < bd) { bd = d; best = p; } } }
    if (!best) { for (const e of G.edges) { if (!/trunk|primary/.test(e.kind || '')) continue; for (const p of e.pts) { const d = Math.hypot(p[0] - P.x, p[1] - P.z); if (d < bd) { bd = d; best = p; } } } }
    let r = null; try { r = await game.nav.route({ x: P.x, z: P.z }, { x: best[0], z: best[1] }); } catch (e) {}
    const pts = r ? r.pts : [[P.x, P.z], best]; window.__route = pts; return JSON.stringify({ dest: best, d: Math.round(bd), n: pts.length, len: r ? Math.round(r.length) : null, first: r?.maneuvers?.slice(0, 4).map((m) => m.text) }); })()`,
      30000,
    )) || 'null',
  );
  rep.events.push(['route', route]);
  console.log('route', JSON.stringify(route));
  await ev(`(() => { const T = game.THREE; window.__drv = { i: 0, held: new Set(), sD: null, t0: performance.now(), hist: [] };
    const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c, key: c, bubbles: true }));
    const set = (codes) => { const D = window.__drv; for (const c of D.held) if (!codes.includes(c)) key(c, false); for (const c of codes) if (!D.held.has(c)) key(c, true); D.held = new Set(codes); };
    window.__drvStep = (maxKmh) => { const D = window.__drv, v = game.player.state.vehicle; if (!v) { set([]); return 'no car'; } const R = window.__route; const t = v.body.translation(), q = v.body.rotation(), lv = v.body.linvel();
      const fw = new T.Vector3(0, 0, 1).applyQuaternion(new T.Quaternion(q.x, q.y, q.z, q.w)); const hd = Math.atan2(fw.x, fw.z), kmh = Math.hypot(lv.x, lv.z) * 3.6;
      while (D.i < R.length - 1 && Math.hypot(R[D.i][0] - t.x, R[D.i][1] - t.z) < 9) D.i++;
      const g = R[Math.min(R.length - 1, D.i)]; let err = Math.atan2(g[0] - t.x, g[1] - t.z) - hd; err = Math.atan2(Math.sin(err), Math.cos(err));
      D.hist.push([hd, D.lastSteer || 0]); if (D.hist.length > 6) D.hist.shift();
      if (D.sD === null && D.hist.length >= 6 && kmh > 8) { const dh = Math.atan2(Math.sin(D.hist[5][0] - D.hist[0][0]), Math.cos(D.hist[5][0] - D.hist[0][0])); const s = D.hist.reduce((a, h) => a + h[1], 0); if (Math.abs(dh) > 0.02 && s !== 0) D.sD = Math.sign(dh) * Math.sign(s); }
      const sD = D.sD ?? -1; const codes = []; const slow = Math.abs(err) > 0.5 ? 22 : maxKmh;
      if (kmh < slow - 3) codes.push('KeyW'); else if (kmh > slow + 8) codes.push('KeyS');
      let st = 0; if (Math.abs(err) > 0.06) { st = Math.sign(err) * sD; codes.push(st > 0 ? 'KeyD' : 'KeyA'); } D.lastSteer = st > 0 ? 1 : st < 0 ? -1 : 0;
      set(codes); return D.i >= R.length - 2 && Math.hypot(R[R.length - 1][0] - t.x, R[R.length - 1][1] - t.z) < 15 ? 'arrived' : 'go'; };
    window.__drvStop = () => set(['Space']); window.__drvRelease = () => set([]); return 1; })()`);
  const tD = Date.now();
  let lastShot = 0,
    arrived = false,
    streetShot = false;
  while (Date.now() - tD < 62000) {
    const r = await ev(`window.__drvStep(${'45'})`);
    if (r === 'arrived') {
      arrived = true;
      break;
    }
    if (Date.now() - lastShot > 1500) {
      lastShot = Date.now();
      await shot('drive');
      const f = rep.frames[rep.frames.length - 1];
      if (!streetShot && f.cp && Math.hypot(f.cp[0] - truck.x, f.cp[2] - truck.z) > 60) {
        streetShot = true;
        rep.events.push(['street', f.cp]);
      }
    }
    await b.sleep(120);
  }
  rep.events.push(['arrived', arrived, (Date.now() - tD) / 1000]);
  rep.phase = 'stop_highway';
  await ev('window.__drvStop()');
  await b.sleep(2500);
  await ev('window.__drvRelease()');
  await shot('stopped_highway_chase');
  await ev(
    `(() => { const v = game.player.state.vehicle; if (!v) return 0; window.__truck = v; const t = v.body.translation(), q = v.body.rotation(); const T = game.THREE, Q = new T.Quaternion(q.x, q.y, q.z, q.w); const side = new T.Vector3(1, 0, 0).applyQuaternion(Q); const e = new T.Vector3(t.x, t.y + 0.75, t.z).addScaledVector(side, 2.2); game.cameraOverride = (dt, c) => { c.position.copy(e); c.lookAt(t.x, t.y + 0.6, t.z); return true; }; return 1; })()`,
  );
  await b.sleep(900);
  await shot('close_highway_driver_window');
  await ev('(() => { game.cameraOverride = null; game.exitVehicle(); return 1; })()');
  await b.sleep(1800);
  await shot('exited_highway');
  await ev(
    `(() => { const P = game.player.position; game.cameraOverride = (dt, c) => { c.position.set(P.x + 6, P.y + 1.8, P.z + 6); c.lookAt(P.x - 10, P.y + 0.5, P.z - 10); return true; }; return 1; })()`,
  );
  await b.sleep(900);
  await shot('close_highway_street');
  await ev('(() => { game.cameraOverride = null; return 1; })()');
  // 4. a neighbor's yard: the coupe4 parked nearest Nico's house (the player walks the last stretch)
  rep.phase = 'neighbor';
  const cp = JSON.parse(
    (await ev(
      `(() => { const NH = game.nicoHouse, h = NH ? NH.toWorld(new game.THREE.Vector3(0, 0, 10)) : game.player.position; let v = null, bd = 1e9; for (const q of game.vehicles.list) { if (q.ai || q.playerDriven) continue; const t = q.body.translation(); const d = Math.hypot(t.x - h.x, t.z - h.z) + (q.typeKey === 'coupe4' ? 0 : 400); if (d < bd) { bd = d; v = q; } } if (!v) return 'null'; window.__coupe = v; const t = v.body.translation(); return JSON.stringify({ key: v.typeKey, x: t.x, z: t.z }); })()`,
    )) || 'null',
  );
  rep.events.push(['coupe', cp]);
  if (cp) {
    await ev(
      `(() => { const t = window.__coupe.body.translation(); const G = game.city.roadGraph, r = G.nearestEdge(t.x, t.z, {}, 80); let x = t.x + 12, z = t.z; if (r) { const p = r.edge.pts[0]; const dx = t.x - p[0], dz = t.z - p[1], L = Math.hypot(dx, dz) || 1; x = t.x - dx / L * 14; z = t.z - dz / L * 14; } game.teleport(x, undefined, z, Math.atan2(t.x - x, t.z - z)); return 1; })()`,
    );
    await b.sleep(6000);
    await shot('neighbor_arrive');
    await kd('KeyW');
    for (let i = 0; i < 6; i++) {
      const d = await ev(
        `(() => { const t = window.__coupe.body.translation(); const P = game.player.position; window.__walkTo(t.x, t.z); return Math.hypot(t.x - P.x, t.z - P.z); })()`,
      );
      if (d != null && d < 3.2) break;
      await b.sleep(1500);
      await shot('walk_neighbor');
    }
    await ku('KeyW');
    await ev(
      `(() => { const P = game.player.position, t = window.__coupe.body.translation(); game.cameraOverride = (dt, c) => { c.position.set(P.x + (P.x - t.x) * 0.6 + 2, P.y + 2.2, P.z + (P.z - t.z) * 0.6 + 2); c.lookAt(t.x, t.y, t.z); return true; }; return 1; })()`,
    );
    await b.sleep(900);
    await shot('close_neighbor_yard');
    await ev(
      '(() => { game.cameraOverride = null; game.enterVehicle(window.__coupe); return 1; })()',
    );
    await b.sleep(1800);
    await ev(
      `(() => { const v = window.__coupe, t = v.body.translation(), q = v.body.rotation(); const T = game.THREE, Q = new T.Quaternion(q.x, q.y, q.z, q.w); const side = new T.Vector3(1, 0, 0).applyQuaternion(Q); const e = new T.Vector3(t.x, t.y + 0.7, t.z).addScaledVector(side, 2.1); game.cameraOverride = (dt, c) => { c.position.copy(e); c.lookAt(t.x, t.y + 0.55, t.z); return true; }; return 1; })()`,
    );
    await b.sleep(900);
    await shot('close_coupe_driver_window');
    await ev('(() => { game.cameraOverride = null; return 1; })()');
    await b.sleep(1000);
    await shot('in_coupe_chase');
    // a short pull-away
    await kd('KeyW');
    for (let i = 0; i < 4; i++) {
      await b.sleep(1500);
      await shot('coupe_drive');
    }
    await ku('KeyW');
  }
  rep.phase = 'end';
  rep.console = [...con.values()];
  save();
});
save();
// contact sheets of 12 frames each
try {
  execFileSync(
    'python3',
    [
      '-c',
      `
import json
from PIL import Image, ImageDraw, ImageFont
R = json.load(open('docs/v2/reports/qa-first-minutes.json')); F = R['frames']
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 20)
except Exception: font = ImageFont.load_default()
for s in range(0, len(F), 12):
    sh = Image.new('RGB', (640 * 3, 360 * 4), (20, 20, 20))
    for i, fr in enumerate(F[s:s + 12]):
        im = Image.open(fr['f']).convert('RGB').resize((640, 360)); d = ImageDraw.Draw(im); d.rectangle((0, 0, 640, 26), fill=(0, 0, 0)); d.text((6, 3), fr['f'].split('/')[-1] + ' ' + str(fr.get('kmh', '')), fill=(255, 255, 0), font=font)
        sh.paste(im, ((i % 3) * 640, (i // 3) * 360))
    sh.save('docs/v2/shots/qa/first/first_sheet_%d.jpg' % (s // 12 + 1), quality=80)
print(len(F), 'frames')
`,
    ],
    { encoding: 'utf8', stdio: 'inherit' },
  );
} catch (e) {
  console.log('sheet failed', e.message.slice(0, 200));
}

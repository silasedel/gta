#!/usr/bin/env node
// r2-qa scripted playtest: one boot of the test server (5200), then hitboxes, ground, floating/sinking, vehicles, water,
// UI/state and the console, all checked automatically. Every failure group gets a screenshot.
//   node tools/v2/qa/tour.mjs [--areas spawn,keys,downtown,beach,glades] [--skip vehicles,water,ui] [--tag r1]
// Output: docs/v2/reports/qa-r2[-tag].json (raw), docs/v2/shots/qa/*.jpg. The markdown report is written by tools/v2/qa/report.mjs.
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const TAG = o.tag ? '-' + o.tag : '';
const SKIP = new Set(String(o.skip || '').split(','));
const SHOTS = 'docs/v2/shots/qa';
fs.mkdirSync(SHOTS, { recursive: true });
const OUT = `docs/v2/reports/qa-r2${TAG}.json`;
const AREAS = {
  spawn: null,
  keys: [-790, 4878],
  downtown: [407, -110],
  beach: [3478, -77],
  glades: [-2386, 2660],
};
const want = String(o.areas || 'spawn,keys,downtown,beach,glades').split(',');
const CARS = String(o.cars || 'sedan3,suv12,truck9,super4,hatch2,van3').split(',');
const rep = {
  when: new Date().toISOString(),
  areas: {},
  vehicles: [],
  water: {},
  ui: {},
  console: [],
  shots: [],
  log: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(rep, null, 1));
const log = (...m) => {
  const s = m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  console.log(s);
  rep.log.push(s.slice(0, 400));
};
let nShots = 0;

await withBrowser({ width: 1280, height: 720, maxSeconds: 3000 }, async (b) => {
  // console errors / warnings with their source file
  const con = new Map();
  b.on((m, p) => {
    let lvl, text, url;
    if (m === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) {
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
        : d.url || '';
    } else if (
      m === 'Log.entryAdded' &&
      (p.entry.level === 'error' || p.entry.level === 'warning')
    ) {
      lvl = 'log-' + p.entry.level;
      text = p.entry.text;
      url = (p.entry.url || '').replace(/^https?:\/\/[^/]+\//, '');
    } else return;
    const k = lvl + '|' + String(text).slice(0, 160) + '|' + url;
    const e = con.get(k);
    if (e) e.n++;
    else
      con.set(k, { lvl, text: String(text).slice(0, 400), url, n: 1, phase: rep.phase || 'boot' });
  });
  const shot = async (name, aimExpr) => {
    if (nShots >= 70) return null;
    nShots++;
    const f = `${SHOTS}/${name}.jpg`;
    try {
      if (aimExpr) await b.eval(`(() => { ${aimExpr}; return 1; })()`);
      await b.sleep(900);
      await b.screenshot(f, { quality: 78 });
    } catch (e) {
      log('shot failed', name, e.message);
      return null;
    } finally {
      try {
        await b.eval('(() => { __qa.unaim(); return 1; })()');
      } catch (e) {
        /* */
      }
    }
    rep.shots.push(f);
    return f;
  };
  const ev = async (expr, ms) => {
    try {
      return await b.eval(expr, ms);
    } catch (e) {
      log('EVAL FAIL', e.message.slice(0, 300));
      return null;
    }
  };
  const J = async (expr, ms) => {
    const r = await ev(expr, ms);
    try {
      return r == null ? null : JSON.parse(r);
    } catch (e) {
      return null;
    }
  };

  rep.phase = 'boot';
  const tBoot = Date.now();
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  rep.bootS = Math.round((Date.now() - tBoot) / 1000);
  // loading bar must never go backwards
  rep.ui.loading = await J(
    `(() => { const s = (window.__loadProgress && window.__loadProgress.samples) || []; let back = [], prev = -1; for (const x of s) { const v = Array.isArray(x) ? x[1] : x.v ?? x.value; if (typeof v !== 'number') continue; if (v < prev - 1e-4) back.push([Array.isArray(x) ? x[0] : x.t, +prev.toFixed(3), +v.toFixed(3), Array.isArray(x) ? x[2] : x.label]); prev = Math.max(prev, v); } return JSON.stringify({ samples: s.length, backwards: back.slice(0, 10), nBack: back.length }); })()`,
  );
  await startGame(b);
  await ev(
    `(() => { game.timeExternal = true; game.timeOfDay = 12; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(true); } catch (e) {} if (game.vehicles.trafficDebug) game.vehicles.trafficDebug.target = 0; return 1; })()`,
  );
  await ev(
    `(() => { try { game.dev?.setOn?.(true); game.dev?.setPoliceLock?.(true); game.dev?.setOn?.(false); } catch (e) {} return 1; })()`,
  );
  await b.eval(fs.readFileSync('tools/v2/qa/tourPage.js', 'utf8'));
  log('boot', rep.bootS, 's; loading', rep.ui.loading);

  // ---------------------------------------------------------------- UI at the spawn (before anything moved the player)
  if (!SKIP.has('ui')) {
    rep.phase = 'ui';
    await b.sleep(2500);
    rep.ui.spawn =
      await J(`(() => { const P = game.player.position; const c = document.querySelector('.ps-mm-canvas'); let mm = { found: !!c };
      if (c) { mm.w = c.width; mm.h = c.height; const r = c.getBoundingClientRect(); mm.rect = [r.x, r.y, r.width, r.height].map(Math.round); mm.visible = r.width > 20 && getComputedStyle(c).visibility !== 'hidden';
        try { const x = c.getContext('2d'); if (x) { const d = x.getImageData(0, 0, c.width, c.height).data; const cols = new Map(); let lum = 0, lum2 = 0, n = 0, opaque = 0; for (let i = 0; i < d.length; i += 4 * 7) { const k = (d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4); cols.set(k, (cols.get(k) || 0) + 1); const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; lum += l; lum2 += l * l; n++; if (d[i + 3] > 200) opaque++; } const m = lum / n; mm.colors = cols.size; mm.lumStd = +Math.sqrt(Math.max(0, lum2 / n - m * m)).toFixed(1); mm.opaque = +(opaque / n).toFixed(2); mm.top = [...cols.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => k + ':' + (v / n).toFixed(2)); } else mm.ctx = 'not 2d'; } catch (e) { mm.err = String(e).slice(0, 120); } }
      const zone = document.querySelector('.ps-mm-zone')?.textContent || ''; const area = document.querySelector('.ps-area span, [class*=area] span')?.textContent || '';
      const dist = (() => { try { return game.city.districtAt?.(P.x, P.z) || ''; } catch (e) { return 'ERR'; } })(); const zn = (() => { try { return game.miamiData?.zoneAt?.(P.x, P.z) || ''; } catch (e) { return ''; } })();
      const mapErr = !!(game.miamiData?.failed || game.mapDataFailed);
      return JSON.stringify({ pos: [+P.x.toFixed(1), +P.y.toFixed(2), +P.z.toFixed(1)], minimap: mm, zoneLabel: zone, areaLabel: area, district: dist, zone: zn, mapErr }); })()`);
    const mm = rep.ui.spawn?.minimap;
    log('ui spawn', rep.ui.spawn);
    if (mm?.rect) await shot('ui_minimap_spawn', null);
    // phone (P) and pause (Esc)
    await b.key('KeyP', true, 'p');
    await b.key('KeyP', false, 'p');
    await b.sleep(1600);
    rep.ui.phoneOpen = await ev('!!game.ui.phoneOpen');
    if (rep.ui.phoneOpen) await shot('ui_phone_open', null);
    await b.key('KeyP', true, 'p');
    await b.key('KeyP', false, 'p');
    await b.sleep(1000);
    if (await ev('!!game.ui.phoneOpen')) {
      await b.key('Escape', true, 'Escape');
      await b.key('Escape', false, 'Escape');
      await b.sleep(800);
      rep.ui.phoneCloseNeededEsc = true;
    }
    rep.ui.phoneClosed = !(await ev('!!game.ui.phoneOpen'));
    await b.key('Escape', true, 'Escape');
    await b.key('Escape', false, 'Escape');
    await b.sleep(1200);
    rep.ui.pauseOpen = await ev('!!game.ui.paused');
    // dev code 6969 from the pause menu
    if (rep.ui.pauseOpen) {
      await ev('(() => { game.dev?.openCodes?.(); return 1; })()');
      await b.sleep(600);
      for (const d of '6969') {
        await b.key('Digit' + d, true, d);
        await b.key('Digit' + d, false, d);
        await b.sleep(120);
      }
      await b.key('Enter', true, 'Enter');
      await b.key('Enter', false, 'Enter');
      await b.sleep(900);
      rep.ui.devOn = await ev('!!game.dev?.on');
      await ev('(() => { game.dev?.closeCodes?.(); return 1; })()');
      await b.sleep(300);
      await b.key('Escape', true, 'Escape');
      await b.key('Escape', false, 'Escape');
      await b.sleep(1000);
      if (await ev('!!game.ui.paused')) {
        await b.key('Escape', true, 'Escape');
        await b.key('Escape', false, 'Escape');
        await b.sleep(1000);
      }
    }
    rep.ui.unpaused = !(await ev('!!game.ui.paused'));
    if (!rep.ui.unpaused) {
      await ev('(() => { game.hud?.setPaused?.(false, true); return 1; })()');
      await b.sleep(500);
    }
    // dev teleport to downtown
    if (rep.ui.devOn) {
      await ev('(() => { game.dev.teleportTo(407, -110); return 1; })()');
      await b.sleep(12000);
      rep.ui.devTeleport = await J(
        `(() => { const P = game.player.position; const gy = __qa.physY(P.x, P.z, P.y + 3); return JSON.stringify({ pos: [+P.x.toFixed(1), +P.y.toFixed(2), +P.z.toFixed(1)], dist: +Math.hypot(P.x - 407, P.z + 110).toFixed(1), feetAboveGround: gy === null ? null : +(P.y - gy).toFixed(2), busyVeil: !!document.querySelector('.on[class*=veil]') }); })()`,
      );
    }
    log('ui', {
      phone: rep.ui.phoneOpen,
      phoneClosed: rep.ui.phoneClosed,
      pause: rep.ui.pauseOpen,
      dev: rep.ui.devOn,
      devTp: rep.ui.devTeleport,
    });
    save();
  }

  // ---------------------------------------------------------------- per area: hitboxes, ground, floating
  for (const name of want) {
    rep.phase = 'area:' + name;
    let c = AREAS[name];
    if (!c)
      c = await J(
        `(() => { const s = game.city.playerSpawn; return JSON.stringify([s.x, s.z]); })()`,
      );
    if (name === 'beach')
      c =
        (await J(
          `(() => { const C = game.city; for (let r = 0; r < 9000; r += 150) for (let k = 0; k < 32; k++) { const x = 2380 + Math.cos(k / 32 * 6.283) * r, z = 640 + Math.sin(k / 32 * 6.283) * r; let d = ''; try { d = C.districtAt?.(x, z) || ''; } catch (e) {} if (/south beach/i.test(d) && !(C.isWater && C.isWater(x, z))) return JSON.stringify([x, z, d]); } return 'null'; })()`,
        )) || c;
    if (name === 'glades')
      c =
        (await J(
          `(() => { const C = game.city, D = game.miamiData; for (let r = 0; r < 9000; r += 150) for (let k = 0; k < 32; k++) { const x = -2386 + Math.cos(k / 32 * 6.283) * r, z = 2660 + Math.sin(k / 32 * 6.283) * r; let d = ''; try { d = (C.districtAt?.(x, z) || '') + ' ' + (D?.zoneAt?.(x, z) || ''); } catch (e) {} if (/glades|wilderness|swamp/i.test(d) && !(C.isWater && C.isWater(x, z)) && C.roadGraph?.nearestEdge?.(x, z, {}, 60)) return JSON.stringify([x, z, d]); } return 'null'; })()`,
        )) || c;
    const sp = await J(`JSON.stringify(__qa.sidewalkNear(${c[0]}, ${c[1]}))`);
    const ready = await J(
      `(async () => JSON.stringify(await __qa.goArea(${sp.x}, ${sp.z}, ${sp.h || 0})))()`,
      90000,
    );
    const A = (rep.areas[name] = {
      center: [Math.round(sp.x), Math.round(sp.z)],
      road: sp.road,
      ready,
    });
    A.labels = await J(
      `(() => { const P = game.player.position; return JSON.stringify({ zoneLabel: document.querySelector('.ps-mm-zone')?.textContent || '', district: (() => { try { return game.city.districtAt?.(P.x, P.z) || ''; } catch (e) { return 'ERR'; } })(), zone: (() => { try { return game.miamiData?.zoneAt?.(P.x, P.z) || ''; } catch (e) { return ''; } })() }); })()`,
    );
    log('area', name, A.center, ready, A.labels);
    await shot(`area_${name}`, null);
    const scan = await J(`JSON.stringify(__qa.scanArea(${sp.x}, ${sp.z}, 55, 30))`, 240000);
    if (!scan) {
      log('scan failed', name);
      continue;
    }
    Object.assign(A, scan);
    log(
      name,
      'counts',
      scan.counts,
      'tested',
      scan.tested,
      'hitboxFails',
      scan.hitbox.length,
      'carHitbox',
      scan.carHitbox.length,
      'float',
      scan.float.length,
      'sink',
      scan.sink.length,
      'plantsInCars',
      scan.plantsInCars.length,
      scan.ms,
      'ms',
    );
    // real walks: 2 per kind (+ flagged ones), then 4 parked cars (push test)
    A.walks = [];
    for (const k in scan.walkPicks)
      for (const w of scan.walkPicks[k]) {
        if (!w.start || !w.dir) continue;
        const r = await J(
          `(async () => JSON.stringify(await __qa.realWalk(${JSON.stringify(w.start)}, ${JSON.stringify(w.dir)}, ${w.dm ?? 'null'}, null)))()`,
          30000,
        );
        if (r)
          A.walks.push({
            kind: k,
            label: w.label,
            x: w.x,
            z: w.z,
            flaggedByCast: !!w.flagged,
            dm: w.dm,
            ...r,
          });
      }
    A.carWalks = [];
    for (const cw of scan.carWalk || []) {
      const r = await J(
        `(async () => { const v = game.vehicles.list.find((q) => q.id === ${cw.id}); if (!v) return 'null'; return JSON.stringify(await __qa.realWalk(${JSON.stringify(cw.start)}, ${JSON.stringify(cw.dir)}, ${cw.dm ?? 'null'}, v)); })()`,
        30000,
      );
      if (r) A.carWalks.push({ key: cw.key, x: cw.x, z: cw.z, dm: cw.dm, ...r });
    }
    const badWalks = A.walks.filter((w) => w.pen > 0.15),
      pushed = A.carWalks.filter((w) => w.carMovedMm > 1);
    log(
      name,
      'walks',
      A.walks.length,
      'bad',
      badWalks.map((w) => [w.kind, w.label, w.pen]),
      'cars pushed',
      A.carWalks.map((w) => [w.key, w.carMovedMm, w.driftMm, w.pen]),
    );
    // ground
    A.ground = await J(`JSON.stringify(__qa.groundScan(${sp.x}, ${sp.z}, 220, 70))`, 240000);
    if (A.ground)
      log(
        name,
        'ground n',
        A.ground.n,
        'mismatch',
        A.ground.mismatch.length,
        'missing',
        A.ground.missing.length,
        'waterMissing',
        A.ground.waterMissing.length,
        'top',
        A.ground.mismatch.slice(0, 3),
      );
    save();
    // screenshots: the worst few of each failure group
    const camFrom = (f) => (f.dir ? `${f.dir[0]}, ${f.dir[1]}` : 'null, null');
    const groups = {};
    for (const f of scan.hitbox) (groups['hit_' + f.kind] ||= []).push(f);
    for (const f of scan.carHitbox) (groups.hit_car ||= []).push({ ...f, y: null });
    for (const f of scan.float) (groups['float_' + f.kind] ||= []).push({ ...f, y: f.ground });
    for (const f of scan.sink) (groups['sink_' + f.kind] ||= []).push({ ...f, y: f.ground });
    for (const f of scan.plantsInCars) (groups.plantInCar ||= []).push(f);
    for (const f of badWalks) (groups['walk_' + f.kind] ||= []).push(f);
    for (const f of pushed) (groups.pushedCar ||= []).push(f);
    for (const f of (A.ground?.missing || []).concat(A.ground?.waterMissing || []))
      (groups.noCollider ||= []).push({ ...f, y: f.render });
    for (const f of (A.ground?.mismatch || []).filter((m) => Math.abs(m.diff) > 0.15))
      (groups.groundMismatch ||= []).push({ ...f, y: f.render });
    A.shots = {};
    for (const g in groups) {
      groups[g].sort(
        (p, q) =>
          (q.pen ?? Math.abs(q.gap ?? q.sunk ?? q.diff ?? 0)) -
          (p.pen ?? Math.abs(p.gap ?? p.sunk ?? p.diff ?? 0)),
      );
      const f = groups[g][0];
      const y = f.y ?? f.base ?? (await ev(`__qa.physY(${f.x}, ${f.z}, 80)`)) ?? 0;
      const file = await shot(
        `${name}_${g}`,
        `__qa.aim(${f.x}, ${y}, ${f.z}, ${camFrom(f)}, ${/float|sink|ground|noCol/.test(g) ? 3.5 : 4.5}, 1.4)`,
      );
      A.shots[g] = file;
    }
    save();
  }

  // ---------------------------------------------------------------- vehicles
  if (!SKIP.has('vehicles')) {
    rep.phase = 'vehicles';
    await ev(fs.readFileSync('tools/v2/physics/labPage.js', 'utf8'));
    const spot = await J('JSON.stringify(__lab.findSpot(407, -110))');
    log('vehicle spot', spot);
    if (spot) {
      await J(
        `(async () => JSON.stringify(await __qa.goArea(${spot.x + Math.sin(spot.h) * 20}, ${spot.z + Math.cos(spot.h) * 20}, ${spot.h})))()`,
        90000,
      );
      // nearest pole / sign to the stretch, for the sign hit
      const pole = await J(
        `(() => { const o = __qa.objects(${spot.x + Math.sin(spot.h) * 40}, ${spot.z + Math.cos(spot.h) * 40}, 70).filter((q) => q.kind === 'sign' || q.kind === 'pole'); o.sort((a, b) => a.d - b.d); const p = o[0]; return JSON.stringify(p ? { x: p.x, z: p.z, kind: p.kind, label: p.label } : null); })()`,
      );
      for (const key of CARS) {
        const R = { key, fails: [] };
        const st = await J(
          `(async () => { const S = ${JSON.stringify(spot)}; for (const v of [...game.vehicles.list]) { const t = v.body.translation(); if (!v.playerDriven && Math.hypot(t.x - S.x, t.z - S.z) < 60) game.vehicles.remove(v); }
          if (game.player.state.inVehicle) game.exitVehicle();
          const x = S.x + Math.sin(S.h) * 15, z = S.z + Math.cos(S.h) * 15; const v = await game.vehicles.spawnParked('${key}', { x, z, heading: S.h, keepSpot: true });
          if (!v) return JSON.stringify({ err: 'spawn failed' }); window.__qv = v; await __qa.sleep(1500); const s0 = __qa.carState(v);
          game.teleport(x + Math.cos(S.h) * 3, undefined, z - Math.sin(S.h) * 3); await __qa.sleep(400); game.enterVehicle(v); await __qa.sleep(1500);
          return JSON.stringify({ name: v.name, type: v.typeKey, rest: { up: +s0.up.toFixed(3), wheelSink: +s0.wheelSink.toFixed(3), nW: s0.nW, y: +(s0.y - (s0.gy ?? 0)).toFixed(2) }, head: __qa.headClip(v), inVehicle: game.player.state.inVehicle }); })()`,
          60000,
        );
        Object.assign(R, st || { err: 'eval' });
        if (!st || st.err) {
          rep.vehicles.push(R);
          log('car', key, R);
          continue;
        }
        if (st.head?.clip) {
          R.fails.push({ what: 'head above the roof line', at: null, ...st.head });
          R.headShot = await shot(
            `car_${key}_head`,
            `const v = window.__qv, t = v.body.translation(); __qa.aim(t.x, t.y + 0.8, t.z, Math.cos(v.heading ?? 0), -Math.sin(v.heading ?? 0), 4, 0.9)`,
          );
        }
        if (st.rest.wheelSink < -0.1)
          R.fails.push({ what: 'wheel in ground at rest', wheelSink: st.rest.wheelSink });
        // 20 s drive: throttle to ~45 km/h with a slalom, brake, reverse
        const rec = await J(
          `(async () => { const rec = []; await __qa.driveScript(window.__qv, 20, (t, s) => { const k = []; if (t < 11) { if (s.kmh < 45) k.push('KeyW'); const ph = Math.floor((t - 3) / 0.8); if (t > 3 && t < 10) k.push(ph % 2 ? 'KeyA' : 'KeyD'); } else if (t < 13) k.push('KeyS', 'Space'); else if (t < 18) k.push('KeyS'); return k; }, rec); return JSON.stringify(rec); })()`,
          60000,
        );
        R.drive = {
          samples: rec?.length || 0,
          maxKmh: rec ? Math.max(...rec.map((s) => s.kmh)) : 0,
          minUp: rec ? Math.min(...rec.map((s) => s.up)) : null,
        };
        R.fails.push(
          ...((await J(
            `JSON.stringify(__qa.judge(${JSON.stringify(rec || [])}, 'drive', { stuck: (t) => t < 11 }))`,
          )) || []),
        );
        const headDrive = await J('JSON.stringify(__qa.headClip(window.__qv))');
        if (headDrive?.clip && !st.head?.clip)
          R.fails.push({ what: 'head above the roof line while driving', ...headDrive });
        if (R.drive.maxKmh < 15)
          R.fails.push({ what: 'car did not accelerate (max ' + R.drive.maxKmh + ' km/h)' });
        // curb: back on the stretch, 30 deg toward the road edge at ~30 km/h
        const curbRec = await J(
          `(async () => { const S = ${JSON.stringify(spot)}, v = window.__qv; const x = S.x + Math.sin(S.h) * 20, z = S.z + Math.cos(S.h) * 20; game.vehicles.placeVehicle(v, { x, y: S.y, z }, S.h + 0.5); await __qa.sleep(800); const rec = []; await __qa.driveScript(v, 6, (t, s) => (s.kmh < 30 && t < 3.5 ? ['KeyW'] : t >= 3.5 ? ['KeyS'] : []), rec); return JSON.stringify(rec); })()`,
          30000,
        );
        R.fails.push(
          ...((await J(
            `JSON.stringify(__qa.judge(${JSON.stringify(curbRec || [])}, 'curb', { allowAir: true }))`,
          )) || []),
        );
        R.curb = curbRec
          ? {
              maxKmh: Math.max(...curbRec.map((s) => s.kmh)),
              minUp: Math.min(...curbRec.map((s) => s.up)),
              maxVy: Math.max(...curbRec.map((s) => s.vy)),
            }
          : null;
        if (R.curb && R.curb.maxVy > 3.5)
          R.fails.push({ what: `curb launched the car (vy ${R.curb.maxVy} m/s)` });
        // sign / pole: 14 m away, aimed at it, ~40 km/h
        if (pole) {
          const signRec = await J(
            `(async () => { const p = ${JSON.stringify(pole)}, v = window.__qv; const S = ${JSON.stringify(spot)}; let dx = p.x - S.x, dz = p.z - S.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L; const x = p.x - dx * 16, z = p.z - dz * 16; const gy = __qa.physY(x, z, 60) ?? S.y; game.vehicles.placeVehicle(v, { x, y: gy, z }, Math.atan2(dx, dz)); await __qa.sleep(800); const rec = []; await __qa.driveScript(v, 5, (t, s) => (t < 2.6 ? ['KeyW'] : ['KeyS']), rec); return JSON.stringify(rec); })()`,
            30000,
          );
          R.fails.push(
            ...((await J(
              `JSON.stringify(__qa.judge(${JSON.stringify(signRec || [])}, 'sign hit', { allowAir: true }))`,
            )) || []),
          );
          R.sign = {
            pole,
            maxKmh: signRec ? Math.max(...signRec.map((s) => s.kmh)) : null,
            minUp: signRec ? Math.min(...signRec.map((s) => s.up)) : null,
            maxVy: signRec ? Math.max(...signRec.map((s) => s.vy)) : null,
          };
          if (R.sign.maxVy > 4)
            R.fails.push({ what: `sign hit launched the car (vy ${R.sign.maxVy} m/s)` });
        }
        // exit: player beside the car, not inside it, on the ground
        R.exit = await J(
          `(async () => { const v = window.__qv; game.exitVehicle(); await __qa.sleep(1200); const P = game.player.position, t = v.body.translation(), q = v.body.rotation(); const T = game.THREE; const l = new T.Vector3(P.x - t.x, 0, P.z - t.z).applyQuaternion(new T.Quaternion(q.x, q.y, q.z, q.w).invert()); const gy = __qa.physY(P.x, P.z, P.y + 2); return JSON.stringify({ inVehicle: game.player.state.inVehicle, insideCar: Math.abs(l.x) < (v.spec?.W || 1.9) / 2 - 0.1 && Math.abs(l.z) < (v.spec?.L || 4.6) / 2 - 0.1, feet: gy === null ? null : +(P.y - gy).toFixed(2), dist: +Math.hypot(P.x - t.x, P.z - t.z).toFixed(2) }); })()`,
          20000,
        );
        if (R.exit?.inVehicle) R.fails.push({ what: 'exit failed' });
        if (R.exit?.insideCar)
          R.fails.push({ what: 'player exits inside the car body', ...R.exit });
        if (R.exit && R.exit.feet !== null && (R.exit.feet > 0.3 || R.exit.feet < -0.2))
          R.fails.push({ what: 'player not on the ground after exit', ...R.exit });
        if (R.fails.length)
          R.shot = await shot(
            `car_${key}_fail`,
            `const v = window.__qv, t = v.body.translation(); __qa.aim(t.x, t.y, t.z, 0.6, 0.8, 7, 2.2)`,
          );
        rep.vehicles.push(R);
        log('car', key, {
          drive: R.drive,
          curb: R.curb,
          sign: R.sign,
          exit: R.exit,
          fails: R.fails.map((f) => f.what),
        });
        save();
      }
      await ev(
        `(() => { if (game.player.state.inVehicle) game.exitVehicle(); const v = window.__qv; if (v) game.vehicles.remove(v); return 1; })()`,
      );
    }
  }

  // ---------------------------------------------------------------- water: shallow drive, wade, swim
  if (!SKIP.has('water')) {
    rep.phase = 'water';
    await J(`(async () => JSON.stringify(await __qa.goArea(-895, 4830, 0)))()`, 90000);
    const ws = await J(
      `(() => { const sea = game.city.seaLevel ?? 0, isW = (x, z) => game.city.isWater ? game.city.isWater(x, z) : false; const out = {};
      for (let r = 0; r < 400 && !(out.shallow && out.deep); r += 4) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = -895 + Math.cos(a) * r, z = 4830 + Math.sin(a) * r; if (!isW(x, z)) continue; const gy = __qa.physY(x, z, 20); const sb = game.city.seabed?.heightAt?.(x, z); const bed = gy ?? sb; if (bed == null) continue; const d = sea - bed;
        if (!out.shallow && d > 0.2 && d < 0.5) { // land 18 m back (toward the search center)
          const L = Math.hypot(x + 895, z - 4830) || 1, lx = x - (x + 895) / L * 18, lz = z - (z - 4830) / L * 18; if (!isW(lx, lz)) out.shallow = { x, z, depth: +d.toFixed(2), phys: gy, seabed: sb, land: [lx, lz], h: Math.atan2((x - lx), (z - lz)) }; }
        if (!out.deep && d > 3) out.deep = { x, z, depth: +d.toFixed(2) }; }
      out.sea = sea; return JSON.stringify(out); })()`,
      60000,
    );
    rep.water.spots = ws;
    log('water spots', ws);
    if (ws?.shallow) {
      const S = ws.shallow;
      // the truck (and a sedan) driven into 20-50 cm of water
      for (const key of ['truck9', 'sedan3']) {
        const r = await J(
          `(async () => { const S = ${JSON.stringify(S)}; await __qa.goArea(S.land[0], S.land[1], S.h, 30); const v = await game.vehicles.spawnParked('${key}', { x: S.land[0], z: S.land[1], heading: S.h, keepSpot: true }); if (!v) return JSON.stringify({ err: 'spawn failed' }); window.__qv = v; await __qa.sleep(1500); game.enterVehicle(v); await __qa.sleep(800);
          const rec = []; await __qa.driveScript(v, 9, (t, s) => (t < 5 && s.kmh < 25 ? ['KeyW'] : t >= 5 ? ['Space'] : []), rec); await __qa.sleep(3000);
          const t = v.body.translation(); const bed = __qa.physY(t.x, t.z, t.y + 2); const sb = game.city.seabed?.heightAt?.(t.x, t.z);
          const minY = Math.min(...rec.map((s) => s.y)); game.exitVehicle(); await __qa.sleep(1500); const P = game.player.position; const pb = __qa.physY(P.x, P.z, P.y + 2);
          const out = { key: '${key}', end: [+t.x.toFixed(1), +t.y.toFixed(2), +t.z.toFixed(1)], bedPhys: bed, bedDrawn: sb, carAboveBed: bed == null ? null : +(t.y - bed).toFixed(2), groundOff: v.groundOff, minY: +minY.toFixed(2), inWater: v.inWater, submerged: v.submerged, flooded: v.flooded, reached: Math.hypot(t.x - S.x, t.z - S.z) < 14 || game.city.isWater?.(t.x, t.z), playerFeet: [+P.x.toFixed(1), +P.y.toFixed(2), +P.z.toFixed(1)], playerAboveBed: pb == null ? null : +(P.y - pb).toFixed(2), swimming: game.player.swimming, judge: __qa.judge(rec, 'water drive', { allowAir: true }) };
          game.vehicles.remove(v); return JSON.stringify(out); })()`,
          90000,
        );
        rep.water['drive_' + key] = r;
        log('water drive', key, r);
        if (
          r &&
          (r.carAboveBed === null || r.carAboveBed < 0 || r.minY < (S.phys ?? S.seabed ?? -1) - 0.5)
        )
          rep.water['drive_' + key].fellThrough = true;
        if (r && (r.fellThrough || r.carAboveBed === null || r.carAboveBed < 0.1))
          await shot(
            `water_drive_${key}`,
            `__qa.aim(${r.end[0]}, ${r.end[1]}, ${r.end[2]}, 0.6, 0.8, 7, 2.5)`,
          );
      }
      // wade: walk from the land spot into the water for 8 s
      rep.water.wade = await J(
        `(async () => { const S = ${JSON.stringify(S)}; game.teleport(S.land[0], undefined, S.land[1], S.h); await __qa.sleep(1200); __qa.key('KeyW', true); const rec = []; const t0 = performance.now(); while (performance.now() - t0 < 9000) { game.cameraYaw = S.h + Math.PI; const P = game.player.position; const bed = __qa.physY(P.x, P.z, P.y + 2); const sb = game.city.seabed?.heightAt?.(P.x, P.z); rec.push([+P.x.toFixed(1), +P.y.toFixed(2), +P.z.toFixed(1), bed == null ? null : +bed.toFixed(2), sb == null ? null : +sb.toFixed(2), game.player.swimming ? 1 : 0, +(game.player.waterDepth || 0).toFixed(2)]); await __qa.sleep(250); } __qa.key('KeyW', false);
        const below = rec.filter((r) => (r[3] != null && r[1] < r[3] - 0.25) || (r[4] != null && r[1] < r[4] - 0.4)); return JSON.stringify({ samples: rec.length, below: below.slice(0, 5), nBelow: below.length, end: rec[rec.length - 1], maxDepth: Math.max(...rec.map((r) => r[6])) }); })()`,
        30000,
      );
      log('wade', rep.water.wade);
      if (rep.water.wade?.nBelow)
        await shot(
          'water_wade_below_bed',
          `const e = ${JSON.stringify(rep.water.wade.end)}; __qa.aim(e[0], e[1], e[2], 0.6, 0.8, 5, 1.5)`,
        );
    }
    if (ws?.deep) {
      const D = ws.deep;
      rep.water.swim = await J(
        `(async () => { const D = ${JSON.stringify(D)}; game.teleport(D.x, (game.city.seaLevel ?? 0) - 0.6, D.z, 0); await __qa.sleep(4000); const P = game.player; const s1 = { swimming: P.swimming, breath: +(P.breath ?? -1).toFixed(1), y: +P.position.y.toFixed(2), headUnder: !!P.headUnderwater };
        __qa.key('KeyW', true); await __qa.sleep(5000); __qa.key('KeyW', false); await __qa.sleep(1500);
        const s2 = { swimming: P.swimming, breath: +(P.breath ?? -1).toFixed(1), y: +P.position.y.toFixed(2), headUnder: !!P.headUnderwater, barOpacity: (() => { const el = [...document.querySelectorAll('div')].find((d) => d.textContent === 'BREATH'); return el ? getComputedStyle(el.parentElement).opacity : null; })() };
        return JSON.stringify({ s1, s2, sea: game.city.seaLevel ?? 0 }); })()`,
        40000,
      );
      log('swim', rep.water.swim);
      const sw = rep.water.swim;
      if (
        sw &&
        (!sw.s1.swimming ||
          sw.s2.breath < 95 ||
          (sw.s2.barOpacity && +sw.s2.barOpacity > 0.5 && !sw.s2.headUnder))
      )
        await shot('water_swim', null);
    }
    save();
  }

  // ---------------------------------------------------------------- console
  rep.phase = 'end';
  rep.console = [...con.values()].sort((x, y) => (x.lvl < y.lvl ? -1 : 1) || y.n - x.n);
  log(
    'console entries',
    rep.console.length,
    'errors',
    rep.console.filter((c) => c.lvl !== 'warning' && c.lvl !== 'log-warning').length,
  );
  save();
});
save();
console.log('wrote', OUT);

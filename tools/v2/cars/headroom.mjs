#!/usr/bin/env node
// Fleet headroom / intersection check (r2-cars): every library car is parked next to the player, a tall NPC is seated in
// every seat (r2-people's src/npc/seat.js on our seat anchors), and Nico (1.83 m, game.enterVehicle) takes the driver's
// seat.  Per seated person: crown clearance straight up to the car's own meshes (headliner / roof, glass roofs count) and
// whether the knees or elbows sit inside the body (segment hip -> knee and shoulder -> elbow -> hand cut by a car mesh).
// Target: >= 6 cm crown clearance, upright (no reclining past the anchor's own recline), no limb through a panel.
//   node tools/v2/cars/headroom.mjs [--cars a,b] [--nico 0] [--shots key,key] [--at 407,-110]
// Report: docs/v2/reports/cars-r2-headroom.json ; shots (side view through the window): docs/v2/shots/cars/r2/hr_<key>.png
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const IDX = JSON.parse(fs.readFileSync('public/assets/vehicles/cars/index.json', 'utf8'));
const CARS = o.cars ? String(o.cars).split(',') : Object.keys(IDX).filter((k) => !IDX[k].static && (IDX[k].seats || []).length);
const SHOTS = new Set(String(o.shots || '').split(',').filter(Boolean));
const AT = String(o.at || '407,-110').split(',').map(Number);
const NICO = o.nico !== '0';
const MIN = 0.06;
const rep = { when: new Date().toISOString(), min: MIN, cars: {}, fails: [] };
const MEASURE = `((chars) => { const v = window.__cv, sh = v.car.shell, T = sh.position.constructor; sh.updateWorldMatrix(true, true);
  const meshes = []; sh.traverse((m) => { if (!m.isMesh || m.isSkinnedMesh || m.visible === false) return; for (let p = m; p; p = p.parent) if (p.name && /^(npc-|character-)/.test(p.name)) return;
    for (const c of chars) { let q = m; while (q) { if (q === c.root) return; q = q.parent; } } meshes.push(m); });
  const glass = (m) => { const mt = Array.isArray(m.material) ? m.material[0] : m.material; return !!(mt && (mt.transparent || /glass/i.test(mt.name || ''))); };
  const sides = []; for (const m of meshes) for (const mt of (Array.isArray(m.material) ? m.material : [m.material])) if (mt && mt.side !== 2) { sides.push([mt, mt.side]); mt.side = 2; }
  const rc = new (window.THREE || game.THREE).Raycaster(); const out = [];
  const cut = (p0, p1, skipGlass) => { const d = p1.clone().sub(p0), L = d.length(); if (L < 1e-3) return null; rc.set(p0, d.normalize()); rc.near = 0.02; rc.far = L;
    for (const h of rc.intersectObjects(meshes, false)) { if (skipGlass && glass(h.object)) continue; return +(L - h.distance).toFixed(3); } return null; };
  try {
    for (const c of chars) { const s = c._seat; if (!s) continue; const g = (n) => { const b = c.getBone?.(n); return b ? b.getWorldPosition(new T()) : null; };
      const hd = g('Head'), nk = g('Neck'); if (!hd || !nk) continue;
      const crown = hd.clone().add(hd.clone().sub(nk).normalize().multiplyScalar(0.2));
      const up = sh.localToWorld(new T(0, 1, 0)).sub(sh.localToWorld(new T())).normalize();
      rc.set(hd, up); rc.near = 0; rc.far = 1.2; const hit = rc.intersectObjects(meshes, false)[0];
      const crownY = sh.worldToLocal(crown.clone()).y, roofHit = hit ? sh.worldToLocal(hit.point.clone()).y : null;
      const r = { seat: s.anchor?.id, who: c.isNico ? 'nico' : (c.personMeta?.name || c.npcArch || 'npc'), h: c.archetype?.height || c.personMeta?.height || null,
        clear: roofHit === null ? null : +(roofHit - crownY).toFixed(3), recline: +(s.extraRecline || 0).toFixed(1), sink: +(s.sink || 0).toFixed(3), chin: +(s.chin || 0).toFixed(2), open: !!s.open };
      const lim = {};
      for (const S of ['Left', 'Right']) {
        const hip = g(S + 'UpLeg'), knee = g(S + 'Leg'), foot = g(S + 'Foot'), sho = g(S + 'Arm'), elb = g(S + 'ForeArm'), hand = g(S + 'Hand');
        if (hip && knee) lim[S[0] + 'thigh'] = cut(hip, knee, true);
        if (knee && foot) lim[S[0] + 'shin'] = cut(knee, foot, true);
        if (sho && elb) lim[S[0] + 'upper'] = cut(sho, elb, false);
        if (elb && hand) lim[S[0] + 'fore'] = cut(elb, hand, false);
      }
      r.limbs = Object.fromEntries(Object.entries(lim).filter(([, x]) => x !== null));
      out.push(r); }
  } finally { for (const [mt, sd] of sides) mt.side = sd; }
  return JSON.stringify(out); })`;
await withBrowser({ width: 1280, height: 800, maxSeconds: +(o.max || 2400) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`);
  await b.sleep(9000);
  for (let i = 0; i < 30; i++) { const n = await b.eval('(game.npc?.peopleStats?.()?.loaded || 0)'); if (n >= 6) break; await b.sleep(1000); }
  await b.eval(`(async () => { window.__seat = await import('/src/npc/seat.js'); window.__seated = []; game.updaters.push((dt) => { for (const c of window.__seated) { try { c.update(dt, { driving: true, speed: 0, grounded: true }); } catch (e) {} } }); return 1; })()`);
  for (const key of CARS) {
    const r = await b.eval(`(async () => { const pp = game.player.position;
      for (const v of window.__cars || []) { try { game.vehicles.remove(v); } catch (e) {} } window.__cars = [];
      for (const c of window.__seated) { try { c.root.parent?.remove(c.root); c.dispose?.(); } catch (e) {} } window.__seated = [];
      const v = await game.vehicles.spawnParked('${key}', { x: pp.x + 9, z: pp.z + 4, heading: 0 }); if (!v) return 'no car';
      window.__cars.push(v); window.__cv = v; const n = v.seatCount || 2;
      // the tallest loaded NPC in every passenger seat (and the driver's seat when Nico is not tested)
      for (let i = ${NICO ? 1 : 0}; i < n; i++) { const an = v.seatAnchor(i); if (!an) continue; let ch = null;
        for (let t = 0; t < 12 && !ch; t++) { ch = window.__seat.createSeatedPerson(game, v.car.shell, an, { role: i ? 'passenger' : 'driver', pos: v.mesh.position, vehicle: v, seed: 7 + i }); if (!ch) await new Promise((r) => setTimeout(r, 250)); }
        if (ch) window.__seated.push(ch); }
      return n; })()`);
    if (r === 'no car') { rep.cars[key] = { err: r }; console.log(key, r); continue; }
    if (NICO) {
      await b.eval(`(() => { const t = window.__cv.mesh.position; game.teleport(t.x + 2.2, undefined, t.z, 0); return 1; })()`); await b.sleep(700);
      await b.eval(`(() => { game.enterVehicle(window.__cv); return 1; })()`); await b.sleep(1300);
    } else await b.sleep(900);
    const res = JSON.parse(await b.eval(`${MEASURE}([${NICO ? 'game.playerCharacter, ' : ''}...window.__seated].filter(Boolean))`));
    rep.cars[key] = res;
    for (const s of res) {
      const why = [];
      if (!s.open && s.clear !== null && s.clear < MIN) why.push('crown ' + Math.round(s.clear * 100) + ' cm');
      if (s.recline > 6) why.push('reclined +' + s.recline);
      for (const [k, d] of Object.entries(s.limbs || {})) if (d > 0.03) why.push(k + ' ' + Math.round(d * 100) + ' cm in body');
      if (why.length) rep.fails.push({ key, seat: s.seat, who: s.who, why });
    }
    console.log(key, JSON.stringify(res.map((s) => [s.seat, s.who, s.clear, s.recline, s.sink, Object.keys(s.limbs || {}).length])));
    if (SHOTS.has(key)) {
      await b.eval(`(() => { const T = game.player.position.constructor; const v = window.__cv; const a = v.seatAnchor(0);
        game.cameraOverride = (dt, cam) => { const sh = v.car.shell; sh.updateWorldMatrix(true, false);
          cam.position.copy(sh.localToWorld(new T(a.hip.x + 2.3, a.hip.y + 0.35, a.hip.z + 0.1))); cam.lookAt(sh.localToWorld(new T(a.hip.x, a.hip.y + 0.35, a.hip.z)));
          if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
      await b.sleep(800); fs.mkdirSync('docs/v2/shots/cars/r2', { recursive: true }); await b.screenshot(`docs/v2/shots/cars/r2/hr_${key}.png`);
      await b.eval(`(() => { game.cameraOverride = null; return 1; })()`);
    }
    if (NICO) { await b.eval(`(() => { game.exitVehicle(); return 1; })()`); await b.sleep(500); }
  }
});
fs.writeFileSync('docs/v2/reports/cars-r2-headroom.json', JSON.stringify(rep, null, 1));
console.log('HEADROOM fails', rep.fails.length, 'of', Object.keys(rep.cars).length, 'cars');
for (const f of rep.fails) console.log('FAIL', f.key, f.seat, f.who, f.why.join(', '));

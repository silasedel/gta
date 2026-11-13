// in-page drive harness: real player car + real vehicle physics, autopilot over elevated routes
(() => {
  const g = window.game, city = g.city, V = g.vehicles;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const E = city.roadGraph.edges;
  // chains of elevated edges (bridge decks / overpasses), joined node to node along the straightest continuation
  function chains(minLen = 150, minY = 2.5) {
    const byNode = new Map(); const add = (n, e) => { if (!byNode.has(n)) byNode.set(n, []); byNode.get(n).push(e); };
    const el = E.filter((e) => e.elevated && e.y && Math.max(...e.y) > 0.4);
    for (const e of el) { add(e.a, e); add(e.b, e); }
    const used = new Set(), out = [];
    const dirAt = (pts, end) => { const n = pts.length, a = end ? pts[n - 2] : pts[1], b = end ? pts[n - 1] : pts[0]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    for (const e0 of el.sort((a, b) => b.length - a.length)) {
      if (used.has(e0)) continue; used.add(e0);
      let pts = e0.pts.map((p, i) => [p[0], p[1], e0.y[i]]);
      for (const fwd of [true, false]) {
        for (let guard = 0; guard < 60; guard++) {
          const endP = fwd ? pts[pts.length - 1] : pts[0], d = dirAt(pts, fwd);
          const node = [...byNode.keys()].length && (fwd ? null : null);
          let best = null, bs = 0.5;
          for (const c of el) { if (used.has(c)) continue; const s0 = Math.hypot(c.pts[0][0] - endP[0], c.pts[0][1] - endP[1]) < 1, s1 = Math.hypot(c.pts[c.pts.length - 1][0] - endP[0], c.pts[c.pts.length - 1][1] - endP[1]) < 1; if (!s0 && !s1) continue;
            const cp = (s0 ? c.pts : c.pts.slice().reverse()), cy = s0 ? Array.from(c.y) : Array.from(c.y).reverse(); const l = Math.hypot(cp[1][0] - cp[0][0], cp[1][1] - cp[0][1]) || 1; const dd = [(cp[1][0] - cp[0][0]) / l, (cp[1][1] - cp[0][1]) / l];
            const dot = fwd ? d[0] * dd[0] + d[1] * dd[1] : -(d[0] * dd[0] + d[1] * dd[1]); if (dot > bs) { bs = dot; best = { c, cp, cy }; } }
          if (!best) break; used.add(best.c);
          const seg = best.cp.map((p, i) => [p[0], p[1], best.cy[i]]);
          pts = fwd ? pts.concat(seg.slice(1)) : seg.reverse().slice(0, -1).concat(pts);
        }
      }
      let L = 0, ym = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); for (const p of pts) ym = Math.max(ym, p[2]);
      if (L >= minLen && ym >= minY) out.push({ name: e0.name || e0.kind, len: Math.round(L), ymax: +ym.toFixed(1), pts, width: e0.width });
    }
    return out;
  }
  // sample polyline at arc length s
  function at(pts, cum, s) { let i = 1; while (i < pts.length - 1 && cum[i] < s) i++; const a = pts[i - 1], b = pts[i], L = cum[i] - cum[i - 1] || 1, t = Math.max(0, Math.min(1, (s - cum[i - 1]) / L)); return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / L, dz: (b[1] - a[1]) / L, y: a[2] + (b[2] - a[2]) * t }; }
  let car = null, auto = { steer: 0, throttle: 0, brake: 0 };
  async function ensureCar() {
    if (car && !car.disabled && car.body.isValid?.() !== false) return car;
    const p = g.player.position;
    car = V.spawn('super', new g.THREE.Vector3(p.x, p.y, p.z), 0, { snap: true });
    g.enterVehicle(car);
    const orig = car.setControls.bind(car);
    car.setControls = () => orig({ throttle: auto.throttle, steer: auto.steer, brake: auto.brake, handbrake: false });
    for (let i = 0; i < 30; i++) await frame();
    return car;
  }
  function place(x, y, z, hd, speed) {
    const b = car.body, q = new g.THREE.Quaternion().setFromAxisAngle(new g.THREE.Vector3(0, 1, 0), hd);
    b.setTranslation({ x, y: y + car.groundOff + 0.15, z }, true); b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    b.setLinvel({ x: Math.sin(hd) * speed, y: 0, z: Math.cos(hd) * speed }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  let steerSign = 1;
  async function drive(route, kmh, reverse = false) {
    await ensureCar();
    const pts = reverse ? route.pts.slice().reverse() : route.pts, cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1], vT = kmh / 3.6, lane = route.width >= 7 ? Math.min(1.7, route.width / 2 - 1.6) : 0;
    const P = (s) => { const q = at(pts, cum, s); return { ...q, x: q.x - q.dz * lane, z: q.z + q.dx * lane }; }; // right-hand lane
    // run-up: start 0 m on the route, wait for colliders where we start, then launch at speed
    const s0 = P(0), hd = Math.atan2(s0.dx, s0.dz);
    const deck0 = city.deckSurfaceAt(s0.x, s0.z, s0.y) ?? Math.max(0, city.groundHeightAt(s0.x, s0.z, s0.y + 2));
    auto = { steer: 0, throttle: 0, brake: 1 };
    place(s0.x, deck0, s0.z, hd, 0);
    for (let i = 0; i < 1200 && !(city.collidersReadyAt(s0.x, s0.z) && city.streamer.pending() < 3); i++) { place(s0.x, deck0, s0.z, hd, 0); await frame(); }
    for (let i = 0; i < 20; i++) { place(s0.x, deck0, s0.z, hd, 0); await frame(); }
    place(s0.x, deck0, s0.z, hd, vT);
    const log = { route: route.name, len: route.len, kmh, reverse, drops: [], airborne: [], maxDrop: 0, frames: 0, done: false };
    let sProg = 0, yRef = deck0, airT = 0, lastProg = 0, lastProgT = performance.now(), tEnd = performance.now() + 300000, simT = 0;
    while (performance.now() < tEnd) {
      await frame(); log.frames++;
      if (car.health < 1e5) { log.damage = (log.damage || 0) + (1e6 - car.health > 0 && car.health < 1e6 ? 1 : 0); car.health = 1e6; } if (car.disabled) { log.disabledAt = log.disabledAt || Math.round(sProg); car.disabled = false; }
      if ((log.frames % 30) === 1) for (const o of V.list.slice()) if (o !== car && !o.playerDriven) { try { V.remove(o); } catch (e) { /* */ } } // empty roads: test the decks, not traffic
      if (!car.body || car.body.isValid?.() === false) { log.error = 'car body lost'; break; }
      const t = car.body.translation(), lv = car.body.linvel(), sp = Math.hypot(lv.x, lv.z);
      // progress along path
      let best = sProg, bd = 1e9; for (let s = Math.max(0, sProg - 10); s < Math.min(total, sProg + 60); s += 1) { const q = P(s), d = (q.x - t.x) ** 2 + (q.z - t.z) ** 2; if (d < bd) { bd = d; best = s; } } sProg = best;
      if (sProg > total - 3) { log.done = true; break; }
      if (sProg > lastProg + 2) { lastProg = sProg; lastProgT = performance.now(); } else if (performance.now() - lastProgT > 8000) { const tt = car.body.translation(), vv = car.body.linvel(); log.stalled = { s: Math.round(sProg), x: +tt.x.toFixed(1), y: +tt.y.toFixed(2), z: +tt.z.toFixed(1), sp: +Math.hypot(vv.x, vv.z).toFixed(1), deck: city.deckSurfaceAt(tt.x, tt.z, tt.y), pd: car.playerDriven, frozen: car.frozen, ghost: car.ghost, eng: car.engineOn, dis: car.disabled, fl: car.flooded, vc: !!car.vc, inV: g.player.state.inVehicle, same: g.player.state.vehicle === car, ctrl: JSON.stringify(car.ctrl), gear: car.gear, rpm: car.rpm, spd: car.speed, ui: JSON.stringify(g.ui) }; break; }
      // autopilot (pure pursuit + speed hold)
      const look = P(Math.min(total, sProg + 6 + sp * 0.45)), rot = car.body.rotation(), fwd = new g.THREE.Vector3(0, 0, 1).applyQuaternion(new g.THREE.Quaternion(rot.x, rot.y, rot.z, rot.w));
      const err = wrap(Math.atan2(look.x - t.x, look.z - t.z) - Math.atan2(fwd.x, fwd.z));
      auto.steer = 0;
      // lane-keeping assist (yaw + lateral only; vertical dynamics, wheels and suspension are untouched)
      { const q2 = P(Math.min(total, sProg + 1)), hdPath = Math.atan2(q2.dx, q2.dz), hdCar = Math.atan2(fwd.x, fwd.z), lat = (t.x - q2.x) * (-q2.dz) + (t.z - q2.z) * q2.dx;
        const yawErr = wrap(Math.atan2(look.x - t.x, look.z - t.z) - hdCar), av = car.body.angvel();
        car.body.setAngvel({ x: av.x, y: yawErr * 4, z: av.z }, true);
        const lvv = car.body.linvel(), rx = -q2.dz, rz = q2.dx, vl = lvv.x * rx + lvv.z * rz;
        car.body.setLinvel({ x: lvv.x - rx * vl * 0.5, y: lvv.y, z: lvv.z - rz * vl * 0.5 }, true); void hdPath; void lat; }
      auto.throttle = sp < vT - 0.5 ? 1 : 0; auto.brake = sp > vT + 4 ? 0.6 : 0;
      // ground truth: deck height under the car (render == collider surface) vs chassis
      const surf = t.y - car.groundOff, ref = city.deckSurfaceAt(t.x, t.z, yRef) ?? city.deckSurfaceAt(t.x, t.z, surf);
      if (ref !== null) yRef = ref;
      const deckHere = ref ?? Math.max(0, city.groundHeightAt(t.x, t.z, surf + 1)), drop = deckHere - surf;
      if (drop > log.maxDrop) log.maxDrop = drop;
      if (drop > 0.5) log.drops.push({ s: Math.round(sProg), x: +t.x.toFixed(1), z: +t.z.toFixed(1), y: +surf.toFixed(2), deck: +deckHere.toFixed(2), col: city.collidersReadyAt(t.x, t.z), pend: city.streamer.pending(), sp: +sp.toFixed(1) });
      let contact = 0; try { for (let w = 0; w < 4; w++) if (car.vc && car.vc.wheelIsInContact(w)) contact++; } catch (e) { /* */ }
      const fdt = g.clock?.dt || 1 / 60; simT += fdt; airT = contact ? 0 : airT + fdt;
      if (airT > 0.3 && (!log.airborne.length || log.airborne[log.airborne.length - 1].s < sProg - 5)) log.airborne.push({ s: Math.round(sProg), x: +t.x.toFixed(1), z: +t.z.toFixed(1), y: +surf.toFixed(2), deck: +deckHere.toFixed(2), col: city.collidersReadyAt(t.x, t.z), sp: +sp.toFixed(1) });
      if (log.drops.length > 40) break;
    }
    log.progress = Math.round(sProg); log.total = Math.round(total);
    log.drops = log.drops.slice(0, 12); log.airborne = log.airborne.slice(0, 8);
    return log;
  }
  async function calibrate() {
    await ensureCar(); const t = car.body.translation(); auto = { steer: 0, throttle: 0, brake: 0 };
    place(t.x, Math.max(0, t.y - car.groundOff), t.z, 0, 10);
    for (let i = 0; i < 10; i++) await frame();
    const r0 = car.body.rotation(), f0 = new g.THREE.Vector3(0, 0, 1).applyQuaternion(new g.THREE.Quaternion(r0.x, r0.y, r0.z, r0.w)), h0 = Math.atan2(f0.x, f0.z);
    auto.steer = 1; auto.throttle = 0.5; for (let i = 0; i < 40; i++) await frame();
    const r1 = car.body.rotation(), f1 = new g.THREE.Vector3(0, 0, 1).applyQuaternion(new g.THREE.Quaternion(r1.x, r1.y, r1.z, r1.w)), h1 = Math.atan2(f1.x, f1.z);
    steerSign = wrap(h1 - h0) > 0 ? 1 : -1; auto = { steer: 0, throttle: 0, brake: 1 }; return { steerSign, dh: wrap(h1 - h0) };
  }
  window.__drive = { chains, drive, calibrate, ensureCar };
})();

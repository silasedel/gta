// ELEVATED in-page drive harness: the real player car (game.vehicles.spawn + game.enterVehicle, real vehicle physics)
// follows a lane centre-line of the processed elevated network with a pure-pursuit autopilot.
// Measures: drops (car below the deck / airborne), bumps (> 5 cm chassis-vs-deck jumps), barrier/pier contacts, stalls.
(() => {
  const g = window.game,
    el = window.__elevated,
    net = el.network,
    P = el.params;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // route = lane polyline [x, y(deck top), z] for a chain, direction dir (+1 chain order, -1 reverse); lane: 'right' | index
  function route(cid, dir = 1, laneSel = 'right') {
    const c = net.chains[cid],
      F = {},
      pts = [];
    const mid = net.laneOffsets(c, c.n >> 1).filter((l) => (dir > 0 ? l.fwd : !l.fwd));
    if (!mid.length) return null;
    const ln =
      laneSel === 'right'
        ? dir > 0
          ? mid[mid.length - 1]
          : mid[0]
        : mid[Math.min(laneSel, mid.length - 1)];
    // keep the same fraction of the carriageway along the chain (lane counts change at OSM edge joints)
    const frac = ln.o / net.framesAt(c, c.length / 2).hw;
    const extA = c.endA === 'dead' || c.endA === 'deck' ? 0 : 25,
      extB = c.endB === 'dead' || c.endB === 'deck' ? 0 : 25;
    // optional sub-range (cluster drives on long chains): window.__edriveRange = { [cid]: [s0, s1] }
    const rg = (window.__edriveRange || {})[cid],
      sA = rg ? Math.max(c.s0 - extA, rg[0]) : c.s0 - extA,
      sB = rg ? Math.min(c.s1 + extB, rg[1]) : c.s1 + extB;
    for (let s = sA; s <= sB; s += 2) {
      const sc = Math.max(0, Math.min(c.length, s));
      net.framesAt(c, sc, F);
      const o = Math.max(-F.hw + 1.4, Math.min(F.hw - 1.4, frac * F.hw)),
        beyond = s - sc;
      pts.push([
        F.x - F.tz * o + F.tx * beyond,
        F.y + P.ROAD_Y + F.bank * o,
        F.z + F.tx * o + F.tz * beyond,
        s >= c.s0 && s <= c.s1 ? 1 : 0,
      ]);
    }
    if (dir < 0) pts.reverse();
    return { cid, name: c.name || c.kind, dir, pts, len: c.s1 - c.s0 };
  }
  function curvAhead(pts, i, dist) {
    // max curvature in the next `dist` metres
    let k = 0;
    for (let j = i + 1; j < Math.min(pts.length - 1, i + dist / 2); j++) {
      const a = pts[j - 1],
        b = pts[j],
        c = pts[j + 1];
      const h1 = Math.atan2(b[0] - a[0], b[2] - a[2]),
        h2 = Math.atan2(c[0] - b[0], c[2] - b[2]);
      let d = h2 - h1;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      k = Math.max(k, Math.abs(d) / (Math.hypot(c[0] - b[0], c[2] - b[2]) || 1));
    }
    return k;
  }
  let car = null,
    ctl = { throttle: 0, steer: 0, brake: 0 },
    hookOn = false,
    run = null;
  // autopilot: evaluated every fixed physics step (before the vehicle hook) from the current body state, so steering does
  // not depend on the render frame rate (heavily loaded machines run several physics sub-steps per frame)
  let ap = null; // { pts, idx, kmh, wb, spec }
  function steerStep() {
    if (!ap || !car) return;
    const pts = ap.pts,
      body = car.body,
      t = body.translation(),
      lv = body.linvel(),
      sp = Math.hypot(lv.x, lv.z);
    let best = ap.idx,
      bd = 1e9;
    for (let j = ap.idx; j < Math.min(pts.length, ap.idx + 20); j++) {
      const d = Math.hypot(pts[j][0] - t.x, pts[j][2] - t.z);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    ap.idx = best;
    const Ld = Math.max(6, sp * 0.6);
    let k = best;
    while (k < pts.length - 1 && Math.hypot(pts[k][0] - t.x, pts[k][2] - t.z) < Ld) k++;
    const tgt = pts[k],
      hd = car.heading,
      ax = tgt[0] - t.x,
      az = tgt[2] - t.z;
    let alpha = Math.atan2(ax, az) - hd;
    alpha = Math.atan2(Math.sin(alpha), Math.cos(alpha));
    const delta = Math.atan2(2 * ap.wb * Math.sin(alpha), Math.hypot(ax, az));
    const maxSteer = ap.spec.steer * (1 + (0.24 - 1) * Math.min(1, sp / 42));
    ctl.steer = Math.max(-1, Math.min(1, delta / maxSteer));
    const kap = curvAhead(pts, best, Math.max(30, sp * 3)),
      vCurve = kap > 1e-4 ? Math.sqrt(6.5 / kap) : 1e9,
      vT = Math.min(ap.kmh / 3.6, vCurve);
    ctl.throttle = sp < vT - 0.5 ? 1 : 0;
    ctl.brake = sp > vT + 1.5 ? Math.min(1, (sp - vT) / 6) : 0;
    ap.alpha = alpha;
    // bump metric per fixed physics step (frame-rate independent): chassis height above the deck surface vs its smoothed value
    const hq = el.heightAt(t.x, t.z, t.y - car.groundOff + 0.3);
    if (hq !== null) {
      const off = t.y - hq - car.groundOff;
      ap.ema = ap.ema === undefined ? off : ap.ema + (off - ap.ema) * 0.15;
      if (ap.onDeck && sp > 3 && Math.abs(off - ap.ema) > 0.05)
        ap.bumps.push([+t.x.toFixed(1), +t.z.toFixed(1), +(off - ap.ema).toFixed(3)]);
    }
  }
  function hook(dt) {
    // runs every physics step before the vehicle controller
    if (!run || !car) return;
    steerStep();
    car.setControls({
      throttle: ctl.throttle,
      steer: ctl.steer,
      brake: ctl.brake,
      handbrake: false,
    });
  }
  async function place(x, y, z, heading) {
    window.__dprog = { stage: 'place' };
    const anchor = { x, z };
    g.city.registerAnchor(anchor, 160);
    for (let i = 0; i < 600 && !g.city.collidersReadyAt(x, z); i++) await frame();
    for (let i = 0; i < 30; i++) await frame();
    const pos = g.player.position.clone();
    pos.set(x, y + 0.1, z);
    if (false) {
      // (teleporting a used car proved unreliable: a fresh car per run)
      const b = car.body,
        q = { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
      b.setTranslation({ x, y: y + car.groundOff + 0.08, z }, true);
      b.setRotation(q, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    } else {
      if (car) {
        car.setControls = car.__origSet || car.setControls;
        car.playerDriven = false;
      }
      car = g.vehicles.spawn('super', pos, heading, { snap: false });
      car.__origSet = car.setControls;
      {
        const orig = car.setControls.bind(car);
        car.setControls = (c) =>
          orig(
            run
              ? { throttle: ctl.throttle, steer: ctl.steer, brake: ctl.brake, handbrake: false }
              : c,
          );
      }
      g.enterVehicle(car);
    }
    // the test car only collides with static geometry: AI traffic is ghosted (groups), so a run measures the roads, not traffic
    try {
      for (let k = 0; k < car.body.numColliders(); k++)
        car.body.collider(k).setCollisionGroups((0x0002 << 16) | 0x0001);
    } catch (e) {}
    g.city.unregisterAnchor(anchor);
    if (!hookOn) {
      g.fixedHooks.unshift(hook);
      hookOn = true;
    }
    for (let i = 0; i < 20; i++) await frame();
  }
  async function drive(cid, dir, kmh, laneSel = 'right') {
    const R = route(cid, dir, laneSel);
    if (!R) return { cid, dir, skipped: 'no lane' };
    const pts = R.pts,
      p0 = pts[3] || pts[0],
      p1 = pts[6] || pts[1];
    await place(p0[0], p0[1], p0[2], Math.atan2(p1[0] - p0[0], p1[2] - p0[2]));
    const res = {
      cid,
      name: R.name,
      dir,
      kmh,
      len: Math.round(R.len),
      drops: [],
      bumps: [],
      hits: [],
      stalls: 0,
      maxDev: 0,
      maxSpeed: 0,
      done: false,
      progress: 0,
    };
    const body = car.body,
      spec = car.spec;
    const wb = spec.wb || 2.7;
    let nfr = 0,
      ema = null,
      idx = 3,
      tEnd = performance.now() + Math.max(60000, (R.len / (kmh / 3.6)) * 1000 * 4 + 30000),
      lastProg = performance.now(),
      prevOff = null,
      prevSpeed = 0;
    const world = g.world,
      chassis = [];
    for (let k = 0; k < body.numColliders(); k++) chassis.push(body.collider(k));
    run = R;
    ap = { pts, idx: 3, kmh, wb, spec, bumps: res.bumps, onDeck: 0 };
    window.__dprog = { cid, kmh, t0: performance.now(), stage: 'run' };
    while (performance.now() < tEnd) {
      await frame();
      const t = body.translation(),
        lv = body.linvel(),
        sp = Math.hypot(lv.x, lv.z);
      // geometry test, not a traffic test: AI cars near the test car are dropped out of the world (the game removes them)
      if ((++nfr & 3) === 0)
        for (const v of g.vehicles.list) {
          if (v === car || v.playerDriven || !v.body || v.__ghost) continue;
          try {
            for (let k = 0; k < v.body.numColliders(); k++)
              v.body.collider(k).setCollisionGroups((0x0004 << 16) | 0xfffd);
            v.__ghost = true;
          } catch (e) {}
        }
      // advance along the route
      let best = idx,
        bd = 1e9;
      for (let j = idx; j < Math.min(pts.length, idx + 40); j++) {
        const d = Math.hypot(pts[j][0] - t.x, pts[j][2] - t.z);
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      if (best > idx) {
        idx = best;
        lastProg = performance.now();
      }
      window.__dprog.idx = idx;
      window.__dprog.sp = sp;
      res.progress = idx;
      res.maxSpeed = Math.max(res.maxSpeed, sp * 3.6);
      if (idx >= pts.length - 4) {
        res.done = true;
        break;
      }
      const onDeck = pts[idx][3];
      if (onDeck) res.maxDev = Math.max(res.maxDev, bd);
      // drops / bumps: chassis height above the expected lane surface
      const hq = el.heightAt(t.x, t.z, t.y - car.groundOff + 0.3),
        ys = hq !== null ? hq : pts[idx][1];
      const off = t.y - ys - car.groundOff;
      const offR = t.y - car.groundOff - pts[idx][1];
      if (onDeck && (off < -0.35 || offR < -0.6)) {
        res.drops.push([+t.x.toFixed(1), +t.z.toFixed(1), +off.toFixed(2)]);
        if (off < -2) break;
      }
      ap.onDeck = onDeck; // bumps are measured in the fixed-step hook (steerStep)
      prevOff = off;
      // contacts with static convex hulls (barriers) / static cylinders (piers)
      const others = [];
      for (const cc of chassis)
        world.contactPairsWith(cc, (o) => {
          others.push([cc, o]);
        });
      for (const [cc, o] of others) {
        if (!o) continue;
        let par = null;
        try {
          par = o.parent();
        } catch (e) {
          continue;
        }
        if (par && !par.isFixed()) {
          let tch = false;
          world.contactPair(cc, o, (m) => {
            if (m.numContacts() > 0) tch = true;
          });
          if (tch) res.traffic = (res.traffic || 0) + 1;
          continue;
        }
        const ty = o.shapeType?.() ?? o.shape?.type;
        if (!(ty === 9 || ty === 10 || ty === 1)) continue;
        let touching = false;
        world.contactPair(cc, o, (m) => {
          if (m.numContacts() > 0) touching = true;
        });
        if (touching) res.hits.push([+t.x.toFixed(1), +t.z.toFixed(1), ty]);
      }
      if (performance.now() - lastProg > 6000) {
        res.stalls++;
        break;
      }
      const alpha = ap.alpha || 0; // steering / speed control run in the fixed-step hook (steerStep)
      if (prevSpeed - sp > 4 && !res.decelDiag) {
        // what is around the chassis when it stops dead (diagnostics, first event only)
        const R = g.RAPIER,
          near = [];
        try {
          const q = body.rotation();
          world.intersectionsWithShape(t, q, new R.Cuboid(1.6, 1.0, 3.2), (o) => {
            let par = null,
              ty = null,
              grp = null,
              tr = null;
            try {
              par = o.parent();
              ty = par ? par.bodyType() : 'none';
            } catch (e) {}
            try {
              grp = o.collisionGroups();
            } catch (e) {}
            try {
              const u = o.translation();
              tr = [+u.x.toFixed(1), +u.y.toFixed(1), +u.z.toFixed(1)];
            } catch (e) {}
            if (par === body) return true;
            let nv = null,
              bb = null;
            try {
              if (o.shapeType() === 6) {
                const v = o.shape.vertices,
                  ix = o.shape.indices;
                nv = v.length / 3;
                let mn = [1e9, 1e9, 1e9],
                  mx = [-1e9, -1e9, -1e9],
                  nt = 0;
                for (let k = 0; k < ix.length; k += 3) {
                  let cx = 0,
                    cy = 0,
                    cz = 0;
                  for (let m = 0; m < 3; m++) {
                    cx += v[ix[k + m] * 3] / 3;
                    cy += v[ix[k + m] * 3 + 1] / 3;
                    cz += v[ix[k + m] * 3 + 2] / 3;
                  }
                  if (
                    Math.abs(cx - t.x) < 3.5 &&
                    Math.abs(cz - t.z) < 3.5 &&
                    Math.abs(cy - t.y) < 1.5
                  ) {
                    nt++;
                    for (let m = 0; m < 3; m++)
                      for (let d = 0; d < 3; d++) {
                        const u = v[ix[k + m] * 3 + d];
                        mn[d] = Math.min(mn[d], u);
                        mx[d] = Math.max(mx[d], u);
                      }
                  }
                }
                bb = [nt, mn.map((u) => +u.toFixed(2)), mx.map((u) => +u.toFixed(2))];
              }
            } catch (e) {}
            near.push([o.shapeType(), ty, grp, tr, nv, bb, o.handle]);
            return true;
          });
        } catch (e) {
          near.push(String(e).slice(0, 100));
        }
        const lv2 = body.linvel(),
          av = body.angvel();
        res.decelDiag = {
          at: [+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2)],
          from: +(prevSpeed * 3.6).toFixed(1),
          to: +(sp * 3.6).toFixed(1),
          lv: [lv2.x, lv2.y, lv2.z].map((u) => +u.toFixed(2)),
          av: [av.x, av.y, av.z].map((u) => +u.toFixed(2)),
          ctl: { ...ctl },
          wheels: car.vc ? [0, 1, 2, 3].map((w) => car.vc.wheelIsInContact(w)) : null,
          near,
          src: (() => {
            try {
              return JSON.parse(JSON.stringify(g.city.colliderSourceAt(t.x, t.z, 4))).slice(0, 8);
            } catch (e) {
              return String(e).slice(0, 80);
            }
          })(),
          dead: g.physicsDead || null,
        };
      }
      if (prevSpeed - sp > 4 && ctl.brake === 0) {
        const cs = [];
        for (const [cc, o] of others) {
          if (!o) continue;
          let tch = false;
          try {
            world.contactPair(cc, o, (m) => {
              if (m.numContacts() > 0) tch = true;
            });
          } catch (e) {}
          if (tch) {
            let fx = null;
            try {
              fx = o.parent() ? o.parent().isFixed() : true;
            } catch (e) {}
            cs.push([o.shapeType?.(), fx]);
          }
        }
        res.hits.push(['decel', +t.x.toFixed(1), +t.z.toFixed(1), +t.y.toFixed(2), cs]);
      }
      prevSpeed = sp;
      {
        res.trace ||= [];
        if (res.trace.length > 300) res.trace.shift();
      }
      if (true)
        res.trace.push([
          idx,
          +bd.toFixed(2),
          +alpha.toFixed(3),
          +ctl.steer.toFixed(2),
          +(sp * 3.6).toFixed(0),
          +t.x.toFixed(1),
          +t.z.toFixed(1),
          +off.toFixed(2),
        ]);
    }
    if (g.physicsDead) res.physicsDead = String(g.physicsDead).slice(0, 400);
    run = null;
    ap = null;
    ctl = { throttle: 0, steer: 0, brake: 1 };
    res.total = pts.length;
    res.drops = res.drops.slice(0, 6);
    res.bumps = res.bumps.slice(0, 6);
    res.nHits = res.hits.length;
    res.hits = res.hits.slice(0, 6);
    return res;
  }
  // routes worth driving: every chain long enough with a raised part
  function routes(minLen = 60, minY = 1.5) {
    const out = [];
    for (const c of net.chains) {
      if (c.s1 - c.s0 < minLen) continue;
      let ym = 0;
      for (let i = 0; i < c.n; i++) ym = Math.max(ym, c.y[i]);
      if (ym < minY) continue;
      const two = net.laneOffsets(c, c.n >> 1).some((l) => !l.fwd);
      out.push({
        cid: c.id,
        name: c.name || c.kind,
        len: Math.round(c.s1 - c.s0),
        ymax: +ym.toFixed(1),
        dirs: two ? [1, -1] : [1],
        x: Math.round(c.x[c.n >> 1]),
        z: Math.round(c.z[c.n >> 1]),
      });
    }
    return out.sort((a, b) => b.len - a.len);
  }
  window.__edrive = { route, drive, routes };
})();

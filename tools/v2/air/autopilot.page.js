// r4-air test autopilot (evaluated in the game page by tools/v2/air/air-shots.mjs). Flies a pattern on a runway:
// takeoff -> climb -> loop -> downwind -> base -> final (glideslope + centerline) -> flare -> touchdown -> brake.
// window.__ap = { phase, log }. Usage: __airAP(A, { a: [x, z], b: [x, z] /* runway start -> end */, loop: true })
window.__airAP = function (A, rw, opts = {}) {
  const THREE = A.mesh.position.constructor;
  const [ax, az] = rw.a,
    [bx, bz] = rw.b,
    L = Math.hypot(bx - ax, bz - az),
    ux = (bx - ax) / L,
    uz = (bz - az) / L;
  const hdgRW = Math.atan2(ux, uz);
  const st = { phase: 'roll', t: 0, tp: 0, log: [], loopUp: false, td: null };
  window.__ap = st;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const V = new THREE(),
    F = new THREE(),
    U = new THREE(),
    Lf = new THREE();
  const go = (p) => {
    st.phase = p;
    st.tp = 0;
    st.log.push([+st.t.toFixed(1), p]);
  };
  A.ap = (A, S, h) => {
    st.t += h;
    st.tp += h;
    const c = S.ctl,
      T = A.T;
    F.set(0, 0, 1).applyQuaternion(S.q);
    U.set(0, 1, 0).applyQuaternion(S.q);
    Lf.set(1, 0, 0).applyQuaternion(S.q);
    const hdg = Math.atan2(F.x, F.z),
      bank = Math.asin(clamp(Lf.y, -1, 1)),
      pitch = Math.asin(clamp(F.y, -1, 1)),
      sp = S.vel.length();
    const alt = S.agl;
    const along = (S.pos.x - ax) * ux + (S.pos.z - az) * uz,
      cross = (S.pos.x - ax) * uz - (S.pos.z - az) * ux; // cross > 0: right of the centerline (looking along a->b)? (sign handled below)
    const holdHdg = (want, maxBank = 0.55) => {
      const e = wrap(want - hdg);
      const bd = clamp(-e * 1.6, -maxBank, maxBank);
      c.roll = clamp((bd - bank) * 2.2, -1, 1);
      c.yaw = 0;
    };
    const holdVs = (vs) => {
      c.pitch =
        clamp((vs - S.vel.y) * 0.1 + S.w.x * 0.4, -1, 1) *
        (Math.abs(bank) > 0.2 ? 1 / Math.cos(bank) : 1);
    };
    const holdAlt = (want) => holdVs(clamp((want - alt) * 0.25, -6, 6));
    c.brake = 0;
    c.gearDown = true;
    switch (st.phase) {
      case 'roll':
        c.throttle = 1;
        c.flaps = 0.5;
        c.roll = 0;
        c.yaw = clamp(-wrap(hdgRW - hdg) * 3, -1, 1);
        c.pitch = sp > T.vRot ? 0.55 : 0;
        if (alt > 6) go('climb');
        break;
      case 'climb':
        c.throttle = 1;
        c.flaps = alt > 40 ? 0 : 0.5;
        c.yaw = 0;
        holdHdg(hdgRW);
        holdVs(7);
        if (T.retract && alt > 30) c.gearDown = false;
        if (alt > (opts.loopAlt || 220)) go(opts.loop ? 'accel' : 'downwind');
        break;
      case 'accel':
        c.throttle = 1;
        holdHdg(hdgRW);
        holdVs(-2);
        if (st.tp > 9) go('loop');
        break;
      case 'loop': {
        c.throttle = 1;
        c.roll = 0;
        c.yaw = 0;
        c.pitch = 0.85;
        if (U.y < -0.3) st.loopUp = true;
        if (st.loopUp && U.y > 0.85 && pitch > -0.35) go('downwind');
        if (st.tp > 30) go('downwind');
        break;
      }
      case 'downwind': {
        c.throttle = 0.45;
        c.flaps = 0.5;
        holdHdg(hdgRW + Math.PI, 0.6);
        holdAlt(200); // fly back past the start of the runway, offset 900 m
        if (Math.abs(wrap(hdgRW + Math.PI - hdg)) < 0.15 && along < -1400) go('base');
        break;
      }
      case 'base': {
        c.throttle = 0.35;
        c.flaps = 1;
        holdAlt(170);
        const carrot = along + 900;
        holdHdg(Math.atan2(ax + ux * carrot - S.pos.x, az + uz * carrot - S.pos.z), 0.55);
        if (Math.abs(cross) < 80 && Math.abs(wrap(hdgRW - hdg)) < 0.3) go('final');
        break;
      }
      case 'final': {
        // touchdown aim: 250 m past the runway start; 4.5 degree glide; centerline via a carrot 400 m ahead
        const tdAlong = 150,
          dist = tdAlong - along,
          gsAlt = Math.max(0, dist * Math.tan((4.5 * Math.PI) / 180));
        const carrot = along + 450,
          cxp = ax + ux * carrot,
          czp = az + uz * carrot;
        const want = Math.atan2(cxp - S.pos.x, czp - S.pos.z);
        holdHdg(want, 0.35);
        const vApp = T.vRot * 1.25;
        c.flaps = 1;
        if (T.retract) c.gearDown = true;
        c.throttle = clamp(0.35 + (vApp - sp) * 0.08, 0, 1);
        holdVs(clamp((gsAlt - alt) * 0.3 - sp * Math.tan((4.5 * Math.PI) / 180), -7, 2));
        if (alt < 6 && dist < 400) go('flare');
        break;
      }
      case 'flare':
        c.throttle = 0;
        c.flaps = 1;
        holdHdg(hdgRW, 0.1);
        holdVs(-1.7);
        if (S.onGround) {
          st.td = { t: st.t, vs: S.vel.y, along };
          go('rollout');
        }
        break;
      case 'rollout':
        c.throttle = 0;
        c.pitch = 0;
        c.roll = 0;
        c.yaw = clamp(-wrap(hdgRW - hdg) * 3, -1, 1);
        c.brake = sp < 40 ? 1 : 0.3;
        if (sp < 0.5) go('stopped');
        break;
      case 'stopped':
        c.throttle = 0;
        c.brake = 1;
        break;
      // water takeoff: throttle up, light back pressure once on the step, climb out
      case 'water':
        c.throttle = 1;
        c.flaps = 0.5;
        c.roll = -bank * 2;
        c.yaw = 0;
        c.pitch = sp > T.vRot * 0.95 ? 0.6 : sp > 9 ? 0.15 : 0;
        if (alt > 8) go('waterclimb');
        break;
      case 'waterclimb':
        c.throttle = 1;
        c.flaps = 0.3;
        c.roll = -bank * 2;
        holdVs(5);
        break;
    }
  };
  if (opts.water) st.phase = 'water';
  return st;
};

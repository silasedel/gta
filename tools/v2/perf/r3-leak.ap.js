// r3-leak autopilot (page side): window.__route -> window.__apNewCar() spawns a sedan on the route and drives it; window.__apKeep() replaces a wrecked car.
(() => { const R = window.__route, cum = [0]; for (let i = 1; i < R.length; i++) cum.push(cum[i - 1] + Math.hypot(R[i][0] - R[i - 1][0], R[i][2] - R[i - 1][2]));
  const LEN = cum[cum.length - 1];
  const at = (s0) => { const s = ((s0 % LEN) + LEN) % LEN; let lo = 0, hi = cum.length - 1; while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; } const u = Math.min(1, Math.max(0, (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1))); const p = R[lo], q = R[hi]; return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]; };
  const ap = window.__ap = window.__ap || { s: 0, resets: 0 }; ap.cars = ap.cars || 0;
  const install = (v) => {
    const own = (c) => { const k = v.ctrl; k.throttle = Math.max(-1, Math.min(1, c.throttle || 0)); k.steer = Math.max(-1, Math.min(1, c.steer || 0)); k.brake = Math.max(0, Math.min(1, c.brake || 0)); k.handbrake = !!c.handbrake; };
    const place = (s) => { const p = at(s), q = at(s + 6); const h = Math.atan2(q[0] - p[0], q[2] - p[2]); const gy = game.city.groundHeightAt?.(p[0], p[2]) ?? p[1];
      v.body.setTranslation({ x: p[0], y: gy + 1.2, z: p[2] }, true); v.body.setRotation({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) }, true);
      v.body.setLinvel({ x: Math.sin(h) * 8, y: 0, z: Math.cos(h) * 8 }, true); v.body.setAngvel({ x: 0, y: 0, z: 0 }, true); };
    ap.v = v; ap.place = place; ap.progT = 0; ap.progS = ap.s; ap.revT = 0; ap.last = performance.now();
    v.setControls = function (c) {
      if (!game.player.state.inVehicle || game.player.state.vehicle !== v) return own(c);
      const now = performance.now(), dt = Math.min(0.25, (now - ap.last) / 1000); ap.last = now;
      const t = v.body.translation(), lv = v.body.linvel(), sp = Math.hypot(lv.x, lv.z);
      let bs = ap.s, bd = 1e9; for (let s = ap.s; s < ap.s + 60; s += 2) { const p = at(s); const d = Math.hypot(p[0] - t.x, p[2] - t.z); if (d < bd) { bd = d; bs = s; } }
      ap.s = bs; if (bd > 25) { ap.resets++; ap.s += 10; place(ap.s); ap.progS = ap.s; ap.progT = 0; return own({}); }
      ap.progT += dt; if (ap.s - ap.progS > 6) { ap.progS = ap.s; ap.progT = 0; }
      if (ap.progT > 7) { ap.resets++; ap.s += 20; place(ap.s); ap.progS = ap.s; ap.progT = 0; ap.revT = 0; return own({}); }
      const look = at(ap.s + 7 + sp * 0.6); const r = v.body.rotation(); const fwd = new game.THREE.Vector3(0, 0, 1).applyQuaternion(new game.THREE.Quaternion(r.x, r.y, r.z, r.w));
      const hx = look[0] - t.x, hz = look[2] - t.z; const ang = Math.atan2(fwd.x * hz - fwd.z * hx, fwd.x * hx + fwd.z * hz);
      const a1 = at(ap.s + 20), a2 = at(ap.s + 40); const turn = Math.abs(Math.atan2((a1[0] - t.x) * (a2[2] - a1[2]) - (a1[2] - t.z) * (a2[0] - a1[0]), (a1[0] - t.x) * (a2[0] - a1[0]) + (a1[2] - t.z) * (a2[2] - a1[2])));
      const target = turn > 0.6 ? 8 : turn > 0.3 ? 13 : 19;
      if (ap.revT <= 0 && sp < 1 && ap.progT > 3) ap.revT = 1.3;
      if (ap.revT > 0) { ap.revT -= dt; return own({ throttle: -1, steer: ang > 0 ? -1 : 1 }); }
      return own({ throttle: sp < target ? 1 : 0, steer: Math.max(-1, Math.min(1, ang * 2.2)), brake: sp > target + 3 ? 1 : 0 });
    };
  };
  // a fresh car on the route (the old one wrecked / disabled / gone)
  window.__apNewCar = () => {
    try { if (game.player.state.inVehicle) game.exitVehicle(); } catch (e) { /* */ }
    const p0 = at(ap.s + 10), p1 = at(ap.s + 18);
    const v = game.vehicles.spawn('sedan', new game.THREE.Vector3(p0[0], p0[1] + 0.5, p0[2]), Math.atan2(p1[0] - p0[0], p1[2] - p0[2]), { snap: false });
    if (!v) return 0; ap.s += 10; ap.cars++; game.enterVehicle(v); install(v); ap.place(ap.s); return 1;
  };
  window.__apKeep = () => { const v = ap.v; if (!v || v.disabled || !v.alive || v.disposed || (v.health ?? 100) <= 5) return window.__apNewCar(); if (!game.player.state.inVehicle) { try { game.enterVehicle(v); } catch (e) { /* */ } } return 2; };
  if (ap.v) install(ap.v);
  return 'ok ' + Math.round(LEN);
})()

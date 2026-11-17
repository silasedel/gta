(() => { const v = window.__car; if (!v || !v.body) return 'no car'; const r = window.__rec; const p0 = v.body.translation(); const dx = r.px - p0.x, dz = r.pz - p0.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L; const sp = window.__speed || 9;
  let t = 0; const f = (dt) => { t += dt; if (t > 2.2 || !v.body) return; const lv = v.body.linvel(); v.body.wakeUp(); v.body.setLinvel({ x: ux * sp, y: lv.y, z: uz * sp }, true); };
  game.updaters.push(f); return JSON.stringify({ car: [+p0.x.toFixed(1), +p0.z.toFixed(1)], dist: +L.toFixed(1) }); })()

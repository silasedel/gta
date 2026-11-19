// Back-of-house and restroom fixtures shared by store types: stock racks with cartons, office desk with PC, safe, DVR recorder,
// restroom set, lockers, wall clock, light switch, electrical panel. Same conventions as fixtures/retail.js.
import { libModel, hasModel } from '../kit/models.js';
import * as THREE from 'three';
import { clockText } from '../kit/util.js';
import { text } from '../kit/atlas.js';

// steel wire rack with cartons (frame: back at z = 0). o: { l, h, d, labels: [brandNames] }
export function stockRack(ctx, x, z, ry, o = {}) {
  const { G, M, R } = ctx,
    l = o.l || 1.5,
    h = o.h || 1.95,
    d = o.d || 0.5,
    st = M.flat('#b9bcc0', { metal: 0.8, rough: 0.35 }),
    cb = M.surf('cardboard', { wear: 0.5 }),
    cb2 = M.surf('cardboard', { c: [150, 112, 74] });
  G.at(x, z, ry, () => {
    for (const [a, b] of [
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1],
    ])
      G.cylB(st, a * (l / 2 - 0.02), 0, 0.03 + b * (d - 0.04), 0.014, h, { seg: 6 });
    for (let k = 0; k < 4; k++) {
      const y = 0.14 + (k * (h - 0.3)) / 3.4;
      G.box(st, 0, y, d / 2 + 0.01, l, 0.018, d);
      let u = -l / 2 + 0.04;
      while (u < l / 2 - 0.2 && k < 4) {
        const w = R.range(0.28, 0.46),
          hh = Math.min(R.range(0.2, 0.38), (h - 0.3) / 3.4 - 0.06),
          dd = R.range(0.3, d - 0.06);
        if (u + w > l / 2 - 0.02) break;
        if (R.chance(0.86)) {
          G.boxB(R.chance(0.6) ? cb : cb2, u + w / 2, y + 0.01, d / 2 + R.jit(0.03), w, hh, dd, {
            ry: R.jit(0.05),
          });
          G.box(
            M.flat('#d8c49a', { rough: 0.8 }),
            u + w / 2,
            y + 0.01 + hh,
            d / 2,
            0.05,
            0.003,
            dd + 0.004,
          );
          if (R.chance(0.5) && hh < 0.25)
            G.boxB(
              cb,
              u + w / 2 + R.jit(0.02),
              y + 0.012 + hh,
              d / 2,
              w * 0.8,
              hh * 0.7,
              dd * 0.9,
              { ry: R.jit(0.2) },
            );
        }
        u += w + 0.02;
      }
    }
    ctx.solid(-l / 2, 0, 0, l / 2, h, d + 0.02);
    ctx.shadow(0, d / 2, l + 0.2, d + 0.3);
    ctx.poi('stockpull', 0, d + 0.55, Math.PI);
  });
}
export function handTruck(ctx, x, z, ry) {
  const { G, M } = ctx,
    r = M.flat('#b01e1e', { rough: 0.5, metal: 0.4 });
  G.at(x, z, ry, () => {
    for (const s of [-1, 1]) {
      G.cyl(r, s * 0.17, 0.62, -0.1, 0.014, 1.2, { rx: -0.14, seg: 6 });
      G.cyl(M.flat('#1a1a1c', {}), s * 0.2, 0.1, -0.02, 0.1, 0.05, { rz: Math.PI / 2, seg: 12 });
    }
    G.box(r, 0, 0.02, 0.1, 0.36, 0.01, 0.22);
    G.box(r, 0, 1.18, -0.19, 0.36, 0.028, 0.028);
    G.box(r, 0, 0.6, -0.1, 0.34, 0.02, 0.02);
    ctx.solid(-0.2, 0, -0.22, 0.2, 1.2, 0.2, { occ: false });
  });
}
// office desk + chair + PC (frame: user sits at z > 0 facing -z, desk back against z = 0)
export function officeDesk(ctx, x, z, ry, o = {}) {
  const { G, M, R } = ctx,
    w = o.w || 1.3,
    top = M.surf('laminate', { c: [110, 84, 58], wear: ctx.profile.wear }),
    st = M.flat('#3a3d42', { rough: 0.5, metal: 0.4 }),
    pl = M.flat('#17181b', { rough: 0.5 }),
    out = {};
  G.at(x, z, ry, () => {
    G.boxB(top, 0, 0.72, 0.33, w, 0.03, 0.64);
    G.boxB(st, -w / 2 + 0.2, 0, 0.33, 0.38, 0.72, 0.6);
    G.boxB(st, w / 2 - 0.02, 0, 0.33, 0.03, 0.72, 0.6);
    for (let k = 0; k < 3; k++)
      G.box(
        M.flat('#b9bcc0', { metal: 0.8 }),
        -w / 2 + 0.2,
        0.14 + k * 0.22,
        0.635,
        0.12,
        0.014,
        0.012,
      );
    G.boxB(pl, 0.1, 0.75, 0.16, 0.2, 0.012, 0.16);
    G.cylB(pl, 0.1, 0.75, 0.14, 0.02, 0.1, { seg: 6 });
    G.box(pl, 0.1, 1.02, 0.15, 0.52, 0.32, 0.025);
    const scr = ctx.prints.screen('office', 200, 120, (g, sw, sh) => {
      g.fillStyle = '#f2f4f6';
      g.fillRect(0, 0, sw, sh);
      g.fillStyle = '#1b6e3c';
      g.fillRect(0, 0, sw, 14);
      g.fillStyle = '#fff';
      g.font = '700 9px Arial';
      g.fillText('Daily Sales - ' + (ctx.store.name || ''), 4, 10);
      g.strokeStyle = '#c8ccd0';
      for (let i = 0; i < 9; i++) {
        g.strokeRect(0, 14 + i * 12, sw, 12);
      }
      for (let i = 1; i < 5; i++) g.strokeRect((i * sw) / 5, 14, 0.5, sh);
      g.fillStyle = '#222';
      g.font = '8px Menlo';
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 5; j++)
          g.fillText(
            j
              ? (R() * 900).toFixed(2)
              : ['Fuel', 'Tobacco', 'Lotto', 'Beer', 'Soda', 'Snacks', 'Hot food', 'Coffee'][i],
            (j * sw) / 5 + 3,
            23 + i * 12,
          );
    });
    G.plane(scr.mat, 0.1, 1.02, 0.164, 0.49, 0.29, { uvRect: scr.rect });
    ctx.light.glowPanel(ctx, 0.1, 1.02, 0.18, { w: 0.5, h: 0.3, color: '#dfe9ff', k: 2.2 });
    G.box(pl, 0.1, 0.762, 0.42, 0.42, 0.014, 0.13);
    G.box(pl, 0.42, 0.765, 0.44, 0.06, 0.02, 0.1);
    G.cylB(M.flat('#f2f2ee', { rough: 0.4 }), -0.4, 0.75, 0.2, 0.04, 0.09, { seg: 10 });
    G.boxB(M.flat('#fbfaf5', { rough: 0.9 }), -0.3, 0.75, 0.42, 0.22, 0.02 + R() * 0.03, 0.3, {
      ry: R.jit(0.3),
    });
    // task chair
    G.at(R.jit(0.15), 0.95, R.jit(0.6), () => {
      const fb = M.surf('fabric', { c: [40, 44, 52] });
      G.cylB(pl, 0, 0.04, 0, 0.3, 0.03, { seg: 5 });
      G.cylB(st, 0, 0.06, 0, 0.025, 0.36, { seg: 8 });
      G.boxB(fb, 0, 0.42, 0, 0.46, 0.08, 0.44);
      G.boxB(fb, 0, 0.56, 0.2, 0.42, 0.46, 0.06, { rx: 0.1 });
      ctx.solid(-0.24, 0, -0.24, 0.24, 0.5, 0.24, { occ: false });
    });
    ctx.solid(-w / 2, 0, 0, w / 2, 0.76, 0.66, { occ: false });
    ctx.shadow(0, 0.4, w + 0.2, 1.2);
    out.seat = ctx.poi('desk', 0, 0.95, Math.PI);
  });
  return out;
}
// floor safe (frame: door faces +z). Interactable kind 'safe' (heist and robbery systems hook it).
export function safe(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx,
    body = M.flat('#2f343a', { rough: 0.45, metal: 0.6 }),
    w = o.w || 0.55,
    h = o.h || 0.75;
  let u = null;
  G.at(x, z, ry, () => {
    G.boxB(body, 0, 0, 0, w, h, 0.55);
    G.boxB(M.flat('#3a4047', { rough: 0.4, metal: 0.6 }), 0, 0.03, 0.28, w - 0.06, h - 0.06, 0.02);
    G.cyl(M.flat('#c9ccd0', { metal: 0.9, rough: 0.25 }), -0.08, h * 0.55, 0.3, 0.05, 0.03, {
      rx: Math.PI / 2,
      seg: 14,
    });
    G.box(M.flat('#c9ccd0', { metal: 0.9, rough: 0.25 }), 0.12, h * 0.55, 0.31, 0.14, 0.02, 0.02);
    G.box(M.flat('#0c0d0f', {}), -0.08, h * 0.78, 0.292, 0.1, 0.07, 0.006);
    G.box(M.glow('#ff3b30', 1.4, 2), -0.05, h * 0.78, 0.296, 0.008, 0.008, 0.002);
    ctx.solid(-w / 2, 0, -0.28, w / 2, h, 0.3, { occ: false });
    u = ctx.use(0, h * 0.6, 0.45, {
      kind: 'safe',
      r: 1.2,
      cash: Math.round(ctx.R.range(800, 4200)),
      locked: true,
      timeLock: true,
    });
  });
  return u;
}
// CCTV recorder + monitor on a shelf (frame: faces +z). Destroying it (shoot, smash, or use) stops camera evidence for this store.
export function dvr(ctx, x, y, z, ry) {
  const { G, M } = ctx,
    pl = M.flat('#141518', { rough: 0.5 });
  let u = null;
  G.at(
    x,
    z,
    ry,
    () => {
      G.box(M.surf('laminate', { c: [90, 90, 94] }), 0, -0.012, 0.16, 0.74, 0.024, 0.34);
      G.boxB(pl, -0.14, 0, 0.16, 0.38, 0.065, 0.26);
      for (let i = 0; i < 4; i++)
        G.box(
          M.glow(i ? '#2aff6a' : '#ff3b30', 1.5, 2),
          -0.28 + i * 0.03,
          0.03,
          0.292,
          0.008,
          0.008,
          0.002,
        );
      const scr = ctx.prints.screen('cctv', 200, 150, (g, w, h) => cctvScreen(g, w, h, 12, true));
      G.box(pl, 0.2, 0.2, 0.12, 0.3, 0.24, 0.03);
      G.cylB(pl, 0.2, 0, 0.1, 0.025, 0.09, { seg: 6 });
      G.plane(scr.mat, 0.2, 0.2, 0.137, 0.27, 0.21, { uvRect: scr.rect });
      ctx.light.glowPanel(ctx, 0.2, 0.2, 0.16, { w: 0.3, h: 0.22, color: '#bcd0ff', k: 1.5 });
      u = ctx.use(-0.14, 0.05, 0.3, { kind: 'dvr', r: 1.3, screen: scr });
      ctx.anim.push((dt, t, s, hour) => {
        u.t = (u.t || 0) + dt;
        if (u.t < 1.5) return;
        u.t = 0;
        scr.redraw((g, w, h) => cctvScreen(g, w, h, hour, s.state.dvr !== false));
      });
    },
    y,
  );
  return u;
}
export function cctvScreen(g, w, h, hour, on) {
  g.fillStyle = '#050608';
  g.fillRect(0, 0, w, h);
  if (!on) {
    g.fillStyle = '#1b3a8a';
    g.fillRect(0, 0, w, h);
    text(g, 'NO SIGNAL', 0, h * 0.38, w, h * 0.22, { role: 'mono', color: '#fff' });
    return;
  }
  for (let i = 0; i < 4; i++) {
    const x = ((i % 2) * w) / 2 + 1,
      y = (Math.floor(i / 2) * h) / 2 + 1,
      cw = w / 2 - 2,
      ch = h / 2 - 2,
      gr = g.createLinearGradient(x, y, x + cw, y + ch);
    gr.addColorStop(0, ['#2a3138', '#39403a', '#2d2f3c', '#3a3530'][i]);
    gr.addColorStop(1, '#101214');
    g.fillStyle = gr;
    g.fillRect(x, y, cw, ch);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x + cw * 0.15, y + ch * 0.5, cw * 0.7, ch * 0.12);
    g.fillRect(x + cw * (0.2 + i * 0.12), y + ch * 0.25, cw * 0.12, ch * 0.5);
    g.fillStyle = '#fff';
    g.font = '8px Menlo, monospace';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText('CAM ' + (i + 1), x + 3, y + 10);
    g.fillText(clockText(hour), x + cw - 46, y + ch - 3);
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc(x + cw - 6, y + 7, 2.5, 0, 7);
    g.fill();
  }
}
// restroom set along one wall (frame: fixtures back against z = 0, room extends to +z). o: { w (room width) }
export function restroom(ctx, x, z, ry, o = {}) {
  const { G, M, R } = ctx,
    pc = M.flat('#f1f1ee', { rough: 0.25 }),
    st = M.flat('#c9ccd0', { metal: 0.9, rough: 0.25 }),
    w = o.w || 1.6;
  G.at(x, z, ry, () => {
    const tx = -w / 2 + 0.45; // toilet
    G.lathe(
      pc,
      [
        [0.12, 0],
        [0.15, 0.05],
        [0.13, 0.2],
        [0.19, 0.36],
        [0.2, 0.4],
      ],
      tx,
      0,
      0.42,
      { seg: 12 },
    );
    G.box(pc, tx, 0.41, 0.42, 0.38, 0.03, 0.44);
    G.boxB(pc, tx, 0.38, 0.12, 0.42, 0.36, 0.18);
    G.box(st, tx + 0.15, 0.7, 0.2, 0.06, 0.02, 0.02);
    ctx.solid(tx - 0.2, 0, 0, tx + 0.2, 0.75, 0.65, { occ: false });
    G.cyl(st, tx - 0.36, 0.7, 0.08, 0.06, 0.12, { rz: Math.PI / 2, seg: 10 });
    G.cyl(M.flat('#f8f8f4', { rough: 0.9 }), tx - 0.36, 0.7, 0.08, 0.05, 0.1, {
      rz: Math.PI / 2,
      seg: 10,
    });
    G.cyl(st, tx + 0.5, 0.85, 0.05, 0.016, 0.7, { rz: Math.PI / 2, seg: 6 });
    const sx = w / 2 - 0.42;
    G.boxB(pc, sx, 0.72, 0.24, 0.5, 0.14, 0.42);
    G.box(M.flat('#d8d8d4', { rough: 0.2 }), sx, 0.858, 0.26, 0.36, 0.01, 0.26);
    G.cylB(pc, sx, 0, 0.16, 0.07, 0.72, { seg: 8 });
    G.cylB(st, sx, 0.86, 0.1, 0.012, 0.12, { seg: 6 });
    G.box(st, sx, 0.98, 0.16, 0.02, 0.02, 0.12);
    ctx.solid(sx - 0.25, 0, 0, sx + 0.25, 0.86, 0.45, { occ: false });
    G.box(M.flat('#aeb6ba', { metal: 1, rough: 0.06 }), sx, 1.45, 0.012, 0.45, 0.6, 0.012);
    G.box(st, sx, 1.45, 0.008, 0.48, 0.63, 0.008);
    ctx.light.sconce(ctx, sx, 1.86, 0.01, { w: 0.4, lamp: 'coolwhite', k: 1.6, c: '#c9ccd0' });
    G.boxB(
      M.flat('#e9e9e4', { rough: 0.5 }),
      sx + 0.36 > w / 2 - 0.1 ? sx - 0.42 : sx + 0.36,
      1.2,
      0.06,
      0.26,
      0.34,
      0.12,
    );
    G.boxB(
      M.flat('#f6f6f0', { rough: 0.9 }),
      sx + 0.36 > w / 2 - 0.1 ? sx - 0.42 : sx + 0.36,
      1.14,
      0.07,
      0.2,
      0.07,
      0.02,
    );
    G.lathe(
      M.flat('#4a4d52', { rough: 0.6 }),
      [
        [0.11, 0],
        [0.13, 0.3],
      ],
      sx - 0.1,
      0,
      0.75,
      { seg: 10 },
    );
    if (ctx.profile.wear > 0.45) {
      const p = ctx.prints.notice('employees', { hand: false });
      G.plane(p.mat, tx, 1.5, 0.006, 0.26, 0.2, { uvRect: p.rect, rz: R.jit(0.05) });
    }
    ctx.poi('restroom', 0, 0.9, 0);
  });
}
export function lockers(ctx, x, z, ry, n = 3) {
  const { G, M } = ctx,
    c = M.flat(ctx.R.pick(['#6b7f8f', '#8a8f72', '#7a5a52', '#55607a']), {
      rough: 0.5,
      metal: 0.4,
    });
  G.at(x, z, ry, () => {
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * 0.31;
      G.boxB(c, u, 0.1, 0.23, 0.3, 1.72, 0.45);
      G.box(M.flat('#1a1a1c', {}), u, 1.6, 0.458, 0.2, 0.06, 0.004);
      G.box(M.flat('#c9ccd0', { metal: 0.9 }), u + 0.1, 1.0, 0.46, 0.02, 0.07, 0.012);
    }
    ctx.solid(-n * 0.155, 0, 0, n * 0.155, 1.82, 0.46);
  });
}
// wall clock showing game time (frame: on a wall face, facing +z). The hands are real moving parts.
export function wallClock(ctx, x, y, z, ry, o = {}) {
  const { G, M } = ctx,
    lib =
      !o.code &&
      G.at(x, z, ry, () => libModel(ctx, 'wall_clock', 0, 0.0235, 0, 0), y - 0.16) !== false &&
      hasModel('wall_clock'),
    r = lib ? 0.16 : o.r || 0.15,
    face = ctx.prints.make(
      'clock:' + (o.style || 0),
      160,
      160,
      (g, w) => {
        g.fillStyle = o.face || '#f6f3ea';
        g.beginPath();
        g.arc(w / 2, w / 2, w / 2, 0, 7);
        g.fill();
        g.fillStyle = '#16181c';
        for (let i = 0; i < 60; i++) {
          const a = (i * Math.PI) / 30,
            r0 = i % 5 ? 0.9 : 0.8;
          g.save();
          g.translate(w / 2, w / 2);
          g.rotate(a);
          g.fillRect(
            -(i % 5 ? 0.6 : 1.8),
            (-w / 2) * 0.96,
            i % 5 ? 1.2 : 3.6,
            (w / 2) * (0.96 - r0),
          );
          g.restore();
        }
        g.font = '700 17px Arial';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let i = 1; i <= 12; i++)
          g.fillText(
            String(i),
            w / 2 + Math.sin((i * Math.PI) / 6) * w * 0.34,
            w / 2 - Math.cos((i * Math.PI) / 6) * w * 0.34,
          );
      },
      { global: true },
    );
  if (!lib)
    G.at(
      x,
      z,
      ry,
      () => {
        G.cyl(M.flat(o.rim || '#16181c', { rough: 0.4 }), 0, 0, 0.018, r + 0.012, 0.036, {
          rx: Math.PI / 2,
          seg: 24,
        });
        G.add(
          face.mat,
          new THREE.CircleGeometry(r, 24),
          new THREE.Matrix4().makeTranslation(0, 0, 0.037),
          { uvRect: face.rect },
        );
      },
      y,
    );
  const p = G.local(x, y, z, new THREE.Vector3()),
    yaw = G.yaw() + ry,
    mk = (len, wd, zo0, col) => {
      const zo = lib ? zo0 - 0.012 : zo0;
      const g = ctx.dyn(p.x + Math.sin(yaw) * zo, p.y, p.z + Math.cos(yaw) * zo, yaw, (LG) =>
        LG.box(M.flat(col, { rough: 0.5 }), 0, len * 0.4, 0, wd, len, 0.003),
      );
      g.rotation.order = 'YXZ';
      return g;
    };
  const hh = mk(r * 0.5, 0.012, 0.04, '#16181c'),
    mh = mk(r * 0.78, 0.008, 0.043, '#16181c'),
    sh = mk(r * 0.82, 0.003, 0.046, '#c8102e');
  let last = -1;
  ctx.anim.push((dt, t, s, hour) => {
    const sec = Math.floor(hour * 3600);
    if (sec === last) return;
    last = sec;
    hh.rotation.z = (-(hour % 12) / 12) * Math.PI * 2;
    mh.rotation.z = -(hour % 1) * Math.PI * 2;
    sh.rotation.z = -((hour * 60) % 1) * Math.PI * 2;
    hh.updateMatrix();
    mh.updateMatrix();
    sh.updateMatrix();
  });
}
// light switch (toggles the store's main circuit) and breaker panel
export function lightSwitch(ctx, x, y, z, ry) {
  const { G, M } = ctx;
  let u;
  G.at(
    x,
    z,
    ry,
    () => {
      G.box(M.flat('#eeeeea', { rough: 0.4 }), 0, 0, 0.004, 0.075, 0.12, 0.008);
      G.box(M.flat('#fbfbf8', { rough: 0.3 }), 0, 0.006, 0.012, 0.022, 0.04, 0.012, { rx: -0.3 });
      u = ctx.use(0, 0, 0.1, { kind: 'switch', r: 1.1 });
    },
    y,
  );
  return u;
}
export function breakerPanel(ctx, x, y, z, ry) {
  const { G, M } = ctx;
  G.at(
    x,
    z,
    ry,
    () => {
      G.box(M.flat('#8d9196', { rough: 0.5, metal: 0.6 }), 0, 0, 0.04, 0.4, 0.62, 0.08);
      G.box(M.flat('#9da1a6', { rough: 0.5, metal: 0.6 }), 0, 0, 0.082, 0.34, 0.54, 0.006);
      G.box(M.flat('#1a1a1c', {}), 0.13, 0, 0.088, 0.02, 0.06, 0.008);
      for (const s of [-0.1, 0.05, 0.14])
        G.cyl(M.flat('#9aa0a6', { metal: 0.8 }), s, 0.75, 0.03, 0.011, 0.9, { seg: 5 });
    },
    y,
  );
}

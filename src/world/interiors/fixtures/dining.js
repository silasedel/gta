// Interior art kit: dining and cafe fixtures (restaurants, bars, cafes). Same conventions as venue.js: G.at(x, z, ry) frames with
// local +z toward the guest, colliders, contact shadows, baked lights, people spots.
//   diningTable diningChair tableSetting boothPair espressoMachine pastryCase menuBoard beerTaps tvScreen ceilingFan
//   wallShelf hangingBulbs plantPot kitchenPass woodBeams
import * as THREE from 'three';
import { FIXTURES, addLight } from '../lighting.js';
import { lin } from '../kit/util.js';
import { venuePalette, venueMats, glassware, candleLantern, banquette } from './venue.js';
import '../kit/venueSurfaces.js';
import { libModel } from '../kit/models.js';

// ---------------------------------------------------------------- tables and chairs
// o: { shape: 'round'|'square'|'rect', w, d, h, top: 'wood'|'marble'|'cloth'|'zinc', set (place settings), lantern, seats (chairs: 2|4|6) }
export function diningTable(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx,
    pal = o.pal || venuePalette(),
    V = venueMats(ctx, pal),
    shape = o.shape || 'square',
    w = o.w || (shape === 'rect' ? 1.2 : 0.75),
    d = o.d || 0.75,
    h = o.h || 0.75;
  const topM =
    o.top === 'marble'
      ? V.marble
      : o.top === 'cloth'
        ? M.surf('fabric', { c: o.clothC || [214, 208, 196] })
        : o.top === 'zinc'
          ? M.flat('#b9bcc0', { metal: 0.8, rough: 0.35, probe: 0.6 })
          : V.walnut;
  G.at(x, z, ry, () => {
    if (shape === 'round') {
      G.cylB(topM, 0, h - 0.035, 0, w / 2, 0.035, { seg: 28 });
      if (o.top === 'cloth')
        G.cylB(topM, 0, h - 0.3, 0, w / 2 + 0.02, 0.28, { seg: 28, open: true });
      G.cylB(V.black, 0, 0, 0, 0.24, 0.03, { seg: 16 });
      G.cylB(V.black, 0, 0.03, 0, 0.035, h - 0.07, { seg: 10 });
    } else {
      G.boxB(topM, 0, h - 0.035, 0, w, 0.035, d);
      if (o.top === 'cloth')
        for (const [sx, sz, a, b] of [
          [0, 1, w + 0.04, 0.005],
          [0, -1, w + 0.04, 0.005],
          [1, 0, 0.005, d],
          [-1, 0, 0.005, d],
        ])
          G.boxB(topM, sx * (w / 2 + 0.01), h - 0.3, sz * (d / 2 + 0.01), a, 0.27, b || 0.005);
      else
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            G.boxB(
              o.top === 'wood' || !o.top ? V.walnut : V.black,
              sx * (w / 2 - 0.05),
              0,
              sz * (d / 2 - 0.05),
              0.045,
              h - 0.035,
              0.045,
            );
    }
    ctx.solid(-w / 2, 0, -d / 2, w / 2, h, d / 2, { occ: false });
    ctx.shadow(0, 0, w, d);
    const seats = o.seats ?? (shape === 'rect' ? 4 : 2),
      spots =
        seats === 1
          ? [[0, 1]]
          : seats === 2
            ? [
                [0, 1],
                [0, -1],
              ]
            : seats === 4 && shape !== 'rect'
              ? [
                  [0, 1],
                  [0, -1],
                  [1, 0],
                  [-1, 0],
                ]
              : seats === 4
                ? [
                    [-0.5, 1],
                    [0.5, 1],
                    [-0.5, -1],
                    [0.5, -1],
                  ]
                : [
                    [-0.6, 1],
                    [0, 1],
                    [0.6, 1],
                    [-0.6, -1],
                    [0, -1],
                    [0.6, -1],
                  ];
    for (const [u, s] of spots) {
      const isSide = shape !== 'rect' && seats === 4 && Math.abs(u) > 0.5,
        cx = isSide ? u * (w / 2 + 0.3) : u * (w / 2) * (shape === 'rect' ? 1 : 0),
        cz = isSide ? 0 : s * (d / 2 + 0.3),
        cry = isSide ? (u > 0 ? -Math.PI / 2 : Math.PI / 2) : s > 0 ? Math.PI : 0;
      if (o.chairs !== false) diningChair(ctx, cx, cz, cry, { pal, kind: o.chair || 'bistro' });
      if (o.set !== false)
        tableSetting(ctx, cx * 0.55, h, cz * 0.45 * (isSide ? 1 : 1), cry, {
          pal,
          kind: o.setting || 'dinner',
        });
      ctx.poi('sit', cx, cz, cry, { seatY: 0.46, chair: true });
    }
    if (o.lantern) candleLantern(ctx, 0.04, h, -0.03, { pal });
    else if (o.vase) {
      G.cylB(M.glass({ tint: '#d8eef0', opacity: 0.3 }), 0.05, h, 0, 0.03, 0.14, { seg: 12 });
      for (let k = 0; k < 3; k++)
        G.sphere(
          M.flat(ctx.R.pick(['#e8403a', '#f2c040', '#f4f0e8', '#e86aa0']), { rough: 0.8 }),
          0.05 + ctx.R.jit(0.03),
          h + 0.2 + ctx.R.jit(0.03),
          ctx.R.jit(0.03),
          0.028,
          { seg: 8 },
        );
    }
  });
}
// chair facing local +z (back at -z). kind: 'bistro' (bentwood cane), 'upholstered', 'metal' (cafe), 'stool'
export function diningChair(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx,
    pal = o.pal || venuePalette(),
    V = venueMats(ctx, pal),
    kind = o.kind || 'bistro',
    sh = 0.46;
  const frame =
      kind === 'metal' ? M.flat(o.frameC || '#1b1c1f', { rough: 0.4, metal: 0.6 }) : V.walnut,
    seatM =
      kind === 'upholstered'
        ? V.velvet
        : kind === 'bistro'
          ? M.surf('fabric', { c: [196, 168, 120] })
          : frame;
  G.at(x, z, ry, () => {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        G.cylB(frame, sx * 0.18, 0, sz * 0.18, 0.014, sh, { seg: 6, r2: 0.017 });
    G.boxB(seatM, 0, sh - 0.04, 0, 0.42, 0.04, 0.42);
    if (kind === 'upholstered') G.boxB(V.velvet, 0, sh, 0.01, 0.4, 0.04, 0.4);
    if (kind === 'bistro') {
      G.add(
        frame,
        new THREE.TorusGeometry(0.19, 0.012, 6, 18, Math.PI),
        new THREE.Matrix4().makeTranslation(0, sh + 0.24, -0.19),
      );
      for (const sx of [-1, 1]) G.cylB(frame, sx * 0.19, sh, -0.19, 0.012, 0.24, { seg: 6 });
      G.box(frame, 0, sh + 0.22, -0.2, 0.34, 0.03, 0.015);
    } else if (kind === 'upholstered') {
      G.box(V.velvet, 0, sh + 0.3, -0.19, 0.42, 0.5, 0.06, { rx: -0.08 });
    } else {
      for (let i = -2; i <= 2; i++) G.cylB(frame, i * 0.08, sh, -0.19, 0.008, 0.36, { seg: 5 });
      G.box(frame, 0, sh + 0.36, -0.19, 0.42, 0.03, 0.02);
    }
    ctx.solid(-0.21, 0, -0.21, 0.21, sh, 0.21, { occ: false });
    ctx.shadow(0, 0, 0.45, 0.45);
  });
}
// a place setting in front of a seat: plate, cutlery, napkin, glass. kind: 'dinner' | 'cafe' | 'bar'
export function tableSetting(ctx, x, y, z, ry, o = {}) {
  const { G, M } = ctx,
    plate = M.flat('#f4f2ec', { rough: 0.25, probe: 0.4 }),
    steel = M.flat('#c8cbd0', { metal: 1, rough: 0.25, probe: 0.8 });
  G.at(
    x,
    z,
    ry + Math.PI,
    () => {
      if (o.kind === 'cafe') {
        G.cylB(plate, 0, 0, 0.02, 0.07, 0.008, { seg: 16 });
        G.cylB(plate, 0, 0.008, 0.02, 0.04, 0.07, { seg: 12, r2: 0.035 });
        G.cylB(M.flat('#3a2014', { rough: 0.3 }), 0, 0.07, 0.02, 0.036, 0.004, { seg: 12 });
        return;
      }
      G.cylB(plate, 0, 0, 0.06, 0.13, 0.012, { seg: 20 });
      G.box(steel, -0.16, 0.004, 0.06, 0.012, 0.004, 0.19);
      G.box(steel, 0.16, 0.004, 0.06, 0.014, 0.004, 0.2);
      G.box(
        M.surf('fabric', { c: o.napkin || [226, 222, 214] }),
        -0.16,
        0.008,
        0.06,
        0.06,
        0.012,
        0.13,
      );
      glassware(ctx, 0.13, 0, -0.08, o.kind === 'bar' ? 'rocks' : 'wine', {
        full: ctx.R.chance(0.5),
      });
    },
    y,
  );
}
// two facing banquettes with a table (diner / restaurant booth) against a wall at local z = 0, table axis along +z
export function boothPair(ctx, x, z, ry, o = {}) {
  const { G } = ctx,
    pal = o.pal || venuePalette(),
    L = o.l || 1.6;
  G.at(x, z, ry, () => {
    for (const s of [-1, 1]) {
      G.at(s * 0.95, L / 2, s > 0 ? -Math.PI / 2 : Math.PI / 2, () =>
        banquette(ctx, 0, 0, 0, { pal, l: L, back: 1.25, led: false, ends: true }),
      );
    }
    diningTable(ctx, 0, L / 2, 0, {
      pal,
      shape: 'rect',
      w: 0.75,
      d: L - 0.2,
      top: o.top || 'wood',
      chairs: false,
      seats: 4,
      setting: o.setting,
      lantern: o.lantern,
    });
  });
}

// ---------------------------------------------------------------- cafe / bar equipment
export function espressoMachine(ctx, x, y, z, ry, o = {}) {
  const { G, M } = ctx,
    body = M.flat(o.c || '#b8bcc2', { metal: 1, rough: 0.18, probe: 1.2 }),
    black = M.flat('#141416', { rough: 0.4 }),
    groups = o.groups || 2,
    w = 0.32 + groups * 0.2;
  G.at(
    x,
    z,
    ry,
    () => {
      G.boxB(body, 0, 0, 0, w, 0.42, 0.5);
      G.box(
        M.flat(o.accent || '#a8332a', { rough: 0.3, probe: 0.6 }),
        0,
        0.3,
        0.252,
        w - 0.04,
        0.14,
        0.006,
      );
      G.boxB(black, 0, 0.42, -0.02, w, 0.04, 0.46);
      for (let i = 0; i < groups; i++) {
        const gx = (i - (groups - 1) / 2) * 0.22;
        G.cyl(body, gx, 0.24, 0.27, 0.035, 0.06, { seg: 12 });
        G.box(black, gx, 0.2, 0.33, 0.03, 0.025, 0.14);
        G.cylB(M.flat('#e8e4dc', { rough: 0.3 }), gx, 0.03, 0.29, 0.03, 0.06, { seg: 10 });
        G.cylB(M.flat('#3a2014', { rough: 0.3 }), gx, 0.085, 0.29, 0.026, 0.004, { seg: 10 });
      }
      G.box(M.flat('#2a2b2e', { rough: 0.5, metal: 0.5 }), 0, 0.012, 0.32, w, 0.024, 0.14);
      for (const s of [-1, 1])
        G.cyl(body, s * (w / 2 - 0.04), 0.18, 0.3, 0.006, 0.2, { seg: 6, rx: 0.3 });
      for (let i = 0; i < 6; i++)
        G.cylB(
          M.flat('#f4f2ec', { rough: 0.25 }),
          -w / 2 + 0.06 + (i % 3) * 0.08,
          0.46 + Math.floor(i / 3) * 0.075,
          -0.06 + (i % 2) * 0.06,
          0.035,
          0.07,
          { seg: 10, r2: 0.03 },
        );
      addLight(ctx, {
        p: [0, 0.35, 0.3],
        c: [0.08, 0.06, 0.05],
        ch: 1,
        type: 'omni',
        soft: 0.2,
        noPool: true,
      });
    },
    y,
  );
}
// glass pastry case on a counter (front +z). Lit shelves with pastries.
export function pastryCase(ctx, x, y, z, ry, o = {}) {
  const { G, M } = ctx,
    w = o.w || 1.1,
    h = 0.42,
    d = 0.45,
    gl = M.glass({ tint: '#e8f6fa', opacity: 0.16 }),
    base = M.flat('#2a2522', { rough: 0.4 }),
    R = ctx.R;
  G.at(
    x,
    z,
    ry,
    () => {
      G.boxB(base, 0, 0, 0, w, 0.04, d);
      G.boxB(gl, 0, 0.04, d / 2 - 0.01, w, h - 0.04, 0.01);
      G.boxB(gl, 0, h, 0, w, 0.01, d);
      for (const s of [-1, 1]) G.boxB(gl, (s * w) / 2, 0.04, 0, 0.01, h - 0.04, d);
      const shelfY = [0.05, 0.24];
      for (const sy of shelfY) {
        G.box(M.flat('#e8e6e0', { rough: 0.3 }), 0, sy, 0, w - 0.04, 0.008, d - 0.06);
        for (let u = -w / 2 + 0.1; u < w / 2 - 0.08; u += R.range(0.1, 0.14)) {
          const k = R(),
            px = u,
            pz = R.jit(0.1),
            py = sy + 0.008;
          if (k < 0.35)
            G.add(
              M.flat('#d89a48', { rough: 0.7 }),
              new THREE.TorusGeometry(0.03, 0.017, 6, 10, Math.PI * 1.3),
              new THREE.Matrix4()
                .makeTranslation(px, py + 0.015, pz)
                .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)),
            );
          else if (k < 0.6) {
            G.cylB(M.flat('#f2e6d0', { rough: 0.6 }), px, py, pz, 0.045, 0.05, { seg: 14 });
            G.cylB(
              M.flat(R.pick(['#c03a4a', '#5a2a18', '#f0c040']), { rough: 0.4 }),
              px,
              py + 0.05,
              pz,
              0.045,
              0.012,
              { seg: 14 },
            );
          } else if (k < 0.8)
            for (let j = 0; j < 3; j++)
              G.cylB(M.flat('#c8904e', { rough: 0.8 }), px, py + j * 0.012, pz, 0.035, 0.011, {
                seg: 12,
              });
          else G.box(M.flat('#e8c070', { rough: 0.7 }), px, py + 0.02, pz, 0.08, 0.04, 0.06);
        }
      }
      FIXTURES.led(ctx, [-w / 2 + 0.03, h - 0.02, 0.05], [w / 2 - 0.03, h - 0.02, 0.05], {
        color: '#fff1d8',
        k: 0.5,
        glow: 2.4,
        w: 0.01,
        d: [0, -1, 0.2],
        every: 0.5,
      });
      ctx.solid(-w / 2, 0, -d / 2, w / 2, h, d / 2, { occ: false });
    },
    y,
  );
}
// chalk / letter menu board on a wall (x, z on the wall, ry into the room). lines: [[heading, [items...]], ...]
export function menuBoard(ctx, x, y, z, ry, w, h, o = {}) {
  const { G, M } = ctx,
    lines = o.lines || [
      ['Coffee', ['Cafecito 1.75', 'Colada 2.50', 'Cortadito 2.75', 'Café con leche 3.25']],
      ['Pastries', ['Pastelito 1.50', 'Croqueta 1.25', 'Empanada 2.95']],
    ];
  const p = ctx.prints.make(
    'menu:' + JSON.stringify(lines).length + ':' + (o.style || 'chalk'),
    512,
    Math.round((512 * h) / w),
    (g, W, H) => {
      const chalk = (o.style || 'chalk') === 'chalk';
      g.fillStyle = chalk ? '#1d2420' : '#111';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = chalk ? '#c9a46a' : '#888';
      g.lineWidth = 8;
      g.strokeRect(4, 4, W - 8, H - 8);
      for (let i = 0; i < 400 && chalk; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
        g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
      }
      const cols = lines.length,
        cw = (W - 40) / cols;
      lines.forEach(([head, items], c) => {
        const x0 = 20 + c * cw;
        g.fillStyle = chalk ? '#f4e2a0' : '#fff';
        g.font = `700 ${Math.round(H * 0.08)}px ${chalk ? '"Chalkboard SE", "Marker Felt", cursive' : 'Helvetica, Arial'}`;
        g.fillText(head, x0 + 10, H * 0.14);
        g.font = `${Math.round(H * 0.055)}px ${chalk ? '"Chalkboard SE", "Marker Felt", cursive' : 'Helvetica, Arial'}`;
        g.fillStyle = chalk ? '#f2f2ea' : '#ddd';
        items.forEach((it, i) => g.fillText(it, x0 + 14, H * 0.26 + i * H * 0.1));
      });
    },
  );
  G.at(
    x,
    z,
    ry,
    () => {
      G.box(M.flat('#3a2a1c', { rough: 0.6 }), 0, 0, 0.012, w + 0.06, h + 0.06, 0.024);
      G.plane(p.mat, 0, 0, 0.026, w, h, { uvRect: p.rect });
    },
    y,
  );
  if (o.light !== false)
    FIXTURES.track(ctx, x, y + h / 2 + 0.35, z, {
      ry,
      l: w * 0.8,
      heads: [
        { u: -w * 0.25, aim: [0.6, -0.3, -w * 0.25] },
        { u: w * 0.25, aim: [0.6, -0.3, w * 0.25] },
      ],
      k: 2.2,
      lamp: 'warm',
    });
}
// beer tap tower on a bar top (front +z). n taps with invented handles
export function beerTaps(ctx, x, y, z, ry, o = {}) {
  const { G, M } = ctx,
    n = o.n || 6,
    chrome = M.flat('#c9ccd1', { metal: 1, rough: 0.15, probe: 1.2 }),
    w = n * 0.09 + 0.1,
    R = ctx.R;
  G.at(
    x,
    z,
    ry,
    () => {
      G.box(chrome, 0, 0.32, 0, w, 0.07, 0.07);
      for (const s of [-1, 1]) G.cylB(chrome, s * (w / 2 - 0.04), 0, 0, 0.025, 0.3, { seg: 10 });
      G.box(M.flat('#1a1b1e', { rough: 0.4, metal: 0.5 }), 0, 0.01, 0.08, w, 0.02, 0.16);
      for (let i = 0; i < n; i++) {
        const tx = -w / 2 + 0.09 + i * 0.09;
        G.cyl(chrome, tx, 0.3, 0.06, 0.012, 0.06, { rx: Math.PI / 2, seg: 8 });
        G.box(
          M.flat(
            R.pick(['#c0392b', '#f1c40f', '#1a1a1a', '#2e86c1', '#27ae60', '#e67e22', '#ecf0f1']),
            { rough: 0.4 },
          ),
          tx,
          0.43,
          0.07,
          0.03,
          0.17,
          0.03,
        );
      }
    },
    y,
  );
}
// wall TV with a lit screen (sports / music video art from prints.screen)
export function tvScreen(ctx, x, y, z, ry, w = 1.2, o = {}) {
  const { G, M } = ctx,
    h = w * 0.5625,
    R = ctx.R,
    sc = ctx.prints.screen(
      'tv:' + (o.kind || 'game') + ':' + Math.round(x * 10),
      256,
      144,
      (g, W, H) => {
        if ((o.kind || 'game') === 'game') {
          g.fillStyle = '#1e7a34';
          g.fillRect(0, 0, W, H);
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          g.lineWidth = 2;
          g.strokeRect(14, 14, W - 28, H - 28);
          g.beginPath();
          g.moveTo(W / 2, 14);
          g.lineTo(W / 2, H - 14);
          g.stroke();
          g.beginPath();
          g.arc(W / 2, H / 2, 18, 0, 7);
          g.stroke();
          for (let i = 0; i < 10; i++) {
            g.fillStyle = i < 5 ? '#e8e8e8' : '#d63031';
            g.beginPath();
            g.arc(30 + R() * (W - 60), 24 + R() * (H - 48), 3, 0, 7);
            g.fill();
          }
          g.fillStyle = 'rgba(0,0,0,0.7)';
          g.fillRect(8, 6, 110, 16);
          g.fillStyle = '#fff';
          g.font = '700 11px Arial';
          g.fillText(`SOL ${R.int(0, 3)} - ${R.int(0, 3)} MAR  ${R.int(10, 89)}'`, 12, 18);
        } else {
          const gr = g.createLinearGradient(0, 0, W, H);
          gr.addColorStop(0, '#ff3fd2');
          gr.addColorStop(1, '#2a1cff');
          g.fillStyle = gr;
          g.fillRect(0, 0, W, H);
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.beginPath();
          g.arc(W * 0.6, H * 0.6, 40, 0, 7);
          g.fill();
        }
      },
    );
  G.at(
    x,
    z,
    ry,
    () => {
      G.box(M.flat('#0b0b0c', { rough: 0.3 }), 0, 0, 0.03, w + 0.03, h + 0.03, 0.05);
      G.plane(sc.mat, 0, 0, 0.056, w, h, { uvRect: sc.rect });
      addLight(ctx, {
        p: [0, 0, 0.3],
        c: [0.25, 0.4, 0.3],
        ch: 1,
        type: 'area',
        d: [0, -0.2, 1],
        soft: 0.4,
        wrap: 0.3,
        noPool: true,
      });
    },
    y,
  );
}
// ceiling fan (blades turn: dynamic part)
export function ceilingFan(ctx, x, yCeil, z, o = {}) {
  const { G, M } = ctx,
    wood = M.surf('walnut', { c: o.c || [90, 60, 36] }),
    metal = M.flat(o.metalC || '#a8884e', { metal: 0.8, rough: 0.35 }),
    drop = o.drop || 0.45;
  G.cyl(metal, x, yCeil - drop / 2, z, 0.012, drop, { seg: 6 });
  G.cyl(metal, x, yCeil - 0.03, z, 0.06, 0.05, { seg: 12 });
  G.cyl(metal, x, yCeil - drop - 0.06, z, 0.09, 0.12, { seg: 14 });
  const fan = ctx.dyn(x, yCeil - drop - 0.08, z, 0, (LG) => {
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      LG.box(wood, Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, 0.62, 0.012, 0.13, { ry: -a });
    }
  });
  const sp = o.speed ?? 2.4;
  ctx.anim.push((dt) => {
    fan.rotation.y += dt * sp;
    fan.updateMatrix();
  });
  if (o.light !== false)
    FIXTURES.pendant(ctx, x, yCeil - drop - 0.06, z, {
      drop: 0.12,
      shade: 'globe',
      r: 0.08,
      lamp: 'warm',
      k: 2,
    });
}
// open shelf on a wall with decor (books, jars, plants, bottles)
export function wallShelf(ctx, x, y, z, ry, w, o = {}) {
  const { G, M } = ctx,
    R = ctx.R,
    wood = M.surf('walnut', { c: o.c || [70, 46, 30] });
  G.at(
    x,
    z,
    ry,
    () => {
      G.box(wood, 0, 0, 0.13, w, 0.03, 0.26);
      for (const s of [-1, 1])
        G.box(
          M.flat('#1a1a1c', { metal: 0.6, rough: 0.4 }),
          s * (w / 2 - 0.1),
          -0.06,
          0.08,
          0.02,
          0.1,
          0.16,
        );
      if (o.bare) return;
      for (let u = -w / 2 + 0.08; u < w / 2 - 0.08; u += R.range(0.08, 0.2)) {
        const k = R();
        if (k < 0.35) {
          const n = R.int(3, 7);
          for (let i = 0; i < n; i++)
            G.boxB(
              M.flat(R.pick(['#7a2a20', '#1f3a5a', '#d8c8a0', '#2a4a2a', '#5a3a6a', '#c88a3a']), {
                rough: 0.7,
              }),
              u + i * 0.035,
              0.015,
              0.12,
              0.03,
              R.range(0.16, 0.24),
              R.range(0.14, 0.18),
            );
          u += n * 0.035;
        } else if (k < 0.55)
          G.cylB(M.glass({ tint: '#e0f0e8', opacity: 0.3 }), u, 0.015, 0.12, 0.05, 0.16, {
            seg: 12,
          });
        else if (k < 0.75) plantPot(ctx, u, 0.015, 0.12, { s: 0.5 });
        else
          G.cylB(
            M.flat(R.pick(['#e8e2d4', '#2a2a2c', '#b8604a']), { rough: 0.3 }),
            u,
            0.015,
            0.12,
            0.05,
            R.range(0.12, 0.22),
            { seg: 12, r2: 0.03 },
          );
      }
    },
    y,
  );
}
// small potted plant (bushy: clustered leaf cards). y = base height
export function plantPot(ctx, x, y, z, o = {}) {
  if (
    !o.code &&
    libModel(ctx, 'plant_ficus', x, z, ctx.R() * 6.28, y, Math.min(0.75, 0.2 + 0.25 * (o.s || 1)))
  )
    return; // the user's rubber plant (1.5 m at scale 1)
  const { G, M } = ctx,
    s = o.s || 1,
    R = ctx.R,
    pot = M.flat(o.potC || R.pick(['#e8e2d4', '#b8604a', '#2a2a2c']), { rough: 0.5 }),
    leaf = M.flat(o.leafC || '#3e6a2c', { rough: 0.6, side: THREE.DoubleSide });
  G.lathe(
    pot,
    [
      [0.06 * s, 0],
      [0.08 * s, 0.12 * s],
      [0.085 * s, 0.13 * s],
    ],
    x,
    y,
    z,
    { seg: 14 },
  );
  for (let i = 0; i < 12; i++) {
    const a = R() * 6.28,
      r = R() * 0.07 * s,
      hh = 0.13 * s + R() * 0.16 * s;
    G.sphere(leaf, x + Math.cos(a) * r, y + hh, z + Math.sin(a) * r, 0.04 * s, {
      seg: 6,
      sy: 0.35,
      sx: 1.6,
    });
  }
}
// kitchen pass-through dressing (heat lamps, order rail with tickets) at a pass opening (x, y = sill, z, ry facing the dining room)
export function kitchenPass(ctx, x, y, z, ry, w, o = {}) {
  const { G, M } = ctx,
    steel = M.surf('steel', { wear: 0.3 });
  G.at(
    x,
    z,
    ry,
    () => {
      G.box(steel, 0, 0, 0, w, 0.04, 0.5);
      G.box(steel, 0, 0.62, 0, w, 0.03, 0.3);
      for (let u = -w / 2 + 0.25; u < w / 2; u += 0.5) {
        G.box(M.glow('#ff8a40', 1.6, 0), u, 0.6, 0, 0.3, 0.01, 0.08);
        addLight(ctx, {
          p: [u, 0.55, 0],
          c: [0.9, 0.4, 0.15],
          ch: 0,
          type: 'spot',
          d: [0, -1, 0],
          cone: 0.6,
          soft: 0.1,
          noPool: true,
        });
      }
      const tk = ctx.prints.make('ticket', 64, 96, (g, W, H) => {
        g.fillStyle = '#fafaf2';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#333';
        for (let i = 0; i < 9; i++) g.fillRect(6, 10 + i * 9, 20 + Math.random() * 30, 3);
      });
      for (let i = 0; i < 5; i++)
        G.plane(tk.mat, -w / 2 + 0.2 + i * 0.13, 0.48, 0.16, 0.07, 0.1, {
          uvRect: tk.rect,
          rz: ctx.R.jit(0.08),
        });
      for (let i = 0; i < 3; i++)
        G.cylB(M.flat('#f4f2ec', { rough: 0.25 }), -w / 4 + i * 0.3, 0.02, 0, 0.12, 0.015, {
          seg: 16,
        });
    },
    y,
  );
}
// exposed timber ceiling beams across a room (rustic / tiki / trattoria)
export function woodBeams(ctx, room, o = {}) {
  const { G, M } = ctx,
    wood = M.surf('walnut', { c: o.c || [74, 50, 32] }),
    sp = o.every || 1.2,
    y = room.ceilY;
  for (let z = room.z0 + sp / 2; z < room.z1; z += sp) {
    G.box(wood, room.cx, y - 0.1, z, room.w, 0.2, 0.16);
    ctx.solid(room.x0, y - 0.2, z - 0.08, room.x1, y, z + 0.08, { soft: true, occ: true });
  }
}
// row of hanging Edison bulbs / globes along a line (current frame)
export function hangingBulbs(ctx, a, b, yCeil, o = {}) {
  const n = o.n || Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.6));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    FIXTURES.pendant(ctx, a[0] + (b[0] - a[0]) * t, yCeil, a[1] + (b[1] - a[1]) * t, {
      drop: (o.drop || 1.0) + ctx.R.jit(0.15),
      shade: o.shade || 'globe',
      r: o.r || 0.07,
      lamp: o.lamp || 'amber',
      k: o.k ?? 1.4,
      c: o.c,
    });
  }
}
export { lin };
// pool table (felt, rails, pockets, a rack of balls and two cues), long axis along local z
export function poolTable(ctx, x, z, ry, o = {}) {
  const { G, M } = ctx,
    pal = o.pal || venuePalette(),
    V = venueMats(ctx, pal),
    L = 2.24,
    Wd = 1.24,
    h = 0.8,
    felt = M.surf('fabric', { c: o.felt || [24, 96, 60] }),
    rail = V.walnut,
    R = ctx.R;
  G.at(x, z, ry, () => {
    G.boxB(rail, 0, 0.12, 0, Wd - 0.1, h - 0.2, L - 0.1);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        G.boxB(rail, sx * (Wd / 2 - 0.12), 0, sz * (L / 2 - 0.15), 0.16, 0.14, 0.16);
    G.box(felt, 0, h - 0.04, 0, Wd - 0.16, 0.04, L - 0.16);
    for (const sx of [-1, 1]) G.box(rail, sx * (Wd / 2 - 0.04), h - 0.01, 0, 0.08, 0.1, L);
    for (const sz of [-1, 1]) G.box(rail, 0, h - 0.01, sz * (L / 2 - 0.04), Wd, 0.1, 0.08);
    for (const sx of [-1, 1])
      for (const sz of [-1, 0, 1])
        G.cyl(
          M.flat('#0a0a0a', { rough: 0.8 }),
          sx * (Wd / 2 - 0.09),
          h - 0.015,
          sz * (L / 2 - 0.09),
          0.045,
          0.01,
          { seg: 10 },
        );
    const cols = [
      '#f2d01e',
      '#1d3fbf',
      '#d61f1f',
      '#5a1d8c',
      '#f07a1e',
      '#1d8c3a',
      '#7a1a1a',
      '#111111',
    ];
    for (let i = 0; i < 9; i++)
      G.sphere(
        M.flat(cols[i % 8], { rough: 0.15, probe: 0.6 }),
        R.jit(Wd / 2 - 0.2),
        h + 0.0285,
        R.jit(L / 2 - 0.25),
        0.0285,
        { seg: 10 },
      );
    G.sphere(M.flat('#f4f2ea', { rough: 0.15 }), 0.1, h + 0.0285, L / 4, 0.0285, { seg: 10 });
    G.cyl(V.walnut, 0.3, h + 0.02, -0.2, 0.012, 1.45, { rx: Math.PI / 2, rz: 0.1, seg: 6 });
    FIXTURES.pendant(ctx, 0, o.ceil || 3.2, 0, {
      drop: (o.ceil || 3.2) - h - 0.9,
      shade: 'cone',
      r: 0.22,
      c: '#1d4a2a',
      lamp: 'warm',
      k: 4,
    });
    ctx.solid(-Wd / 2, 0, -L / 2, Wd / 2, h + 0.05, L / 2, { occ: false });
    ctx.shadow(0, 0, Wd + 0.2, L + 0.2);
  });
}

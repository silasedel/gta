// KEYS-SIGN track: the "Welcome to the Keys" sign painting. Original artwork and layout, painted in code:
// a half sun on the horizon with a fan of carved rays, "Welcome to" lettered over the sun, "The Keys" in gold leaf on
// the sea, a leaping tarpon breaking the left edge, a roseate spoonbill wading among red-mangrove roots on the right,
// a queen conch and hibiscus low on the board, and a coral ribbon naming Key Paloma.
// paintKeysWelcome({ width }) -> { color, normal, orm (canvases), outline (UV polygon the board is cut to), aspect }
import { createPainter } from '../../signs/paint.js';
import {
  spoonbill,
  tarpon,
  conch,
  hibiscus,
  leaf,
  carvedText,
  ribbon,
  screw,
  dropping,
} from '../../signs/motifs.js';
import { lerp, rgba, mixHex } from '../../signs/util.js';

export const KEYS_SIGN_DESIGN = { w: 1600, h: 900, metersWide: 6.4 };
const DW = 1600,
  DH = 900,
  SUN = [760, 366],
  HORIZON = 366;

// board outline: arched top, coved (scooped) top corners, rounded bottom corners; d = inset
function boardPath(d = 0) {
  const x0 = 44 + d,
    x1 = 1556 - d,
    ys = 104 + d,
    yc = 2 * (58 + d) - ys,
    y1 = 856 - d,
    r = Math.max(6, 40 - d * 0.6),
    rb = Math.max(6, 34 - d);
  const p = new Path2D();
  p.moveTo(x0, ys + r);
  p.arc(x0, ys, r, Math.PI / 2, 0, true);
  p.quadraticCurveTo(800, yc, x1 - r, ys);
  p.arc(x1, ys, r, Math.PI, Math.PI / 2, true);
  p.lineTo(x1, y1 - rb);
  p.arcTo(x1, y1, x1 - rb, y1, rb);
  p.lineTo(x0 + rb, y1);
  p.arcTo(x0, y1, x0, y1 - rb, rb);
  p.closePath();
  return p;
}

export function paintKeysWelcome({ width = 4096, seed = 113, weather = 1 } = {}) {
  const P = createPainter({ width, designW: DW, designH: DH, seed });
  const c = P.c,
    R = P.R;
  const board = boardPath(0),
    inner = boardPath(34);
  P.sil.fillStyle = '#fff';
  P.sil.fill(board);

  // ------------------------------------------------ background: sky rays and sea, on sandblasted grain
  c.fillStyle = '#17808c';
  c.fill(board);
  c.save();
  c.clip(inner);
  // sky: a fan of rays from the sun, warm at the sun and cooling to turquoise at the corners
  const NR = 30;
  for (let i = 0; i < NR; i++) {
    const a0 = Math.PI + (i * Math.PI) / NR,
      a1 = a0 + Math.PI / NR + 0.004,
      odd = i % 2;
    const g = c.createRadialGradient(SUN[0], SUN[1], 60, SUN[0], SUN[1], 900);
    if (odd) {
      g.addColorStop(0, '#ffd978');
      g.addColorStop(0.2, '#ffbb62');
      g.addColorStop(0.42, '#f6906c');
      g.addColorStop(0.66, '#c98c8c');
      g.addColorStop(0.86, '#4fb3ad');
      g.addColorStop(1, '#2f9ea3');
    } else {
      g.addColorStop(0, '#fff0a3');
      g.addColorStop(0.2, '#ffd27a');
      g.addColorStop(0.42, '#fbb07c');
      g.addColorStop(0.66, '#e3a79a');
      g.addColorStop(0.86, '#74c7bd');
      g.addColorStop(1, '#49b1b0');
    }
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(SUN[0], SUN[1]);
    c.arc(SUN[0], SUN[1], 1300, a0, a1);
    c.closePath();
    c.fill();
  }
  c.restore();
  const skyClip = new Path2D();
  skyClip.rect(0, 0, DW, HORIZON);
  c.save();
  c.clip(inner);
  P.d.save();
  P.d.clip(inner);
  P.bristles(skyClip, {
    box: [60, 60, 1540, HORIZON],
    n: 900,
    len: [26, 90],
    w: [3, 9],
    colors: ['#ffd27a', '#fbb07c', '#f6906c', '#74c7bd', '#fff0a3', '#e9a493'],
    alpha: [0.05, 0.16],
    dir: (x, y) => Math.atan2(y - SUN[1], x - SUN[0]),
    jit: 0.05,
    curl: 0.05,
    ridge: 0.04,
  });
  // carved ray edges
  for (let i = 1; i < NR; i++) {
    const a = Math.PI + (i * Math.PI) / NR,
      p = new Path2D();
    p.moveTo(SUN[0] + Math.cos(a) * 128, SUN[1] + Math.sin(a) * 128);
    p.lineTo(SUN[0] + Math.cos(a) * 1300, SUN[1] + Math.sin(a) * 1300);
    P.carve(p, 2.2, -0.42);
    P.stroke(p, '#b5604a', 1.1, 0.28);
  }
  // sea
  const sea = new Path2D();
  sea.rect(0, HORIZON, DW, DH - HORIZON);
  c.fillStyle = P.grad(0, HORIZON, 0, 850, [
    [0, '#3fb9b2'],
    [0.1, '#23a0a6'],
    [0.4, '#157f90'],
    [0.75, '#0e6078'],
    [1, '#0a4a62'],
  ]);
  c.fill(sea);
  // sunset glow on the water near the horizon
  P.within(sea, () => {
    P.blob(SUN[0], HORIZON + 6, 560, 46, '#ffc978', 0.5);
    P.blob(SUN[0], HORIZON + 2, 250, 30, '#fff0a8', 0.55);
    P.blob(250, 800, 380, 140, '#0b5068', 0.5);
    P.blob(1380, 760, 320, 150, '#0d5a6a', 0.4);
  });
  P.bristles(sea, {
    box: [60, HORIZON, 1540, 850],
    n: 1100,
    len: [30, 110],
    w: [3, 9],
    colors: ['#23a0a6', '#157f90', '#0e6078', '#3fb9b2', '#0a4a62', '#1d8f9c'],
    alpha: [0.06, 0.18],
    dir: 0,
    jit: 0.035,
    curl: 0.04,
    ridge: 0.04,
  });
  // sandblasted grain across the whole background (carved only; paint sits in it)
  for (let y = 60; y < 860; y += 2.9) {
    const p = new Path2D();
    let ph = R() * 9;
    p.moveTo(40, y);
    for (let x = 40; x <= 1560; x += 36) {
      ph += R.gauss() * 0.5;
      p.lineTo(x, y + Math.sin(ph) * 1.5 + R.gauss() * 0.5);
    }
    P.carve(p, 1.25, -(0.1 + R() * 0.22));
    if (R() < 0.3) P.stroke(p, '#06323f', 0.8, 0.07);
  }
  // board seams (the panel is a glue-up of wide planks)
  for (let y = 86; y < 856; y += 86) {
    const p = new Path2D();
    p.moveTo(40, y);
    for (let x = 40; x <= 1560; x += 60) p.lineTo(x, y + R.gauss() * 0.4);
    P.carve(p, 1.8, -0.6);
    P.stroke(p, '#052a36', 1.1, 0.3);
  }
  // distant mangrove islands and a sail on the horizon
  for (const [x0, x1, hh] of [
    [330, 500, 11],
    [520, 600, 6],
    [960, 1150, 12],
    [1160, 1215, 5],
  ]) {
    const pts = [[x0, HORIZON + 1]];
    for (let x = x0; x <= x1; x += 9)
      pts.push([x, HORIZON - hh * Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * (0.75 + R() * 0.4)]);
    pts.push([x1, HORIZON + 1]);
    const isl = P.poly(pts);
    P.fill(isl, '#2d6b5a');
    P.within(isl, () => {
      P.blob((x0 + x1) / 2, HORIZON - hh, (x1 - x0) / 2, hh * 0.7, '#6fa56b', 0.55);
    });
    P.carveFill(isl, 0.25);
    c.fillStyle = 'rgba(20,70,70,0.35)';
    c.fillRect(x0 + 4, HORIZON + 1, x1 - x0 - 8, 3.5);
  }
  {
    const sx = 1075,
      sy = HORIZON - 12;
    const sail = P.poly([
      [sx, sy - 30],
      [sx + 15, sy],
      [sx - 2, sy],
    ]);
    P.fill(sail, '#fff6e4');
    const jib = P.poly([
      [sx - 4, sy - 24],
      [sx - 4, sy],
      [sx - 15, sy],
    ]);
    P.fill(jib, '#ffe2c0');
    c.fillStyle = '#5c2f24';
    c.fillRect(sx - 17, sy + 1, 36, 4);
    P.carveFill(sail, 0.3);
  }
  // hand-painted wave scallops, bigger toward the viewer; each scallop is one brush stroke
  for (let k = 0; k < 24; k++) {
    const y = HORIZON + 7 + 5 * k + 0.76 * k * k,
      amp = 1.6 + 0.55 * k,
      lam = 34 + 7.5 * k,
      ph = R() * lam;
    for (let x = 50 - ph; x < 1560; x += lam) {
      if (R() < 0.22) continue;
      const pts = [];
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        pts.push([x + lam * t, y + amp * Math.sin(Math.PI * t) + R.gauss() * 0.3]);
      }
      const w = 1.3 + 0.14 * k;
      P.liner(
        pts.map(([px, py]) => [px, py + w * 1.2]),
        w * 1.5,
        w * 1.1,
        '#083f55',
        { alpha: 0.32, taper: 0.3, groove: -0.16 },
      );
      P.liner(pts, w * 1.4, w, k < 5 ? '#ffe9b0' : R() < 0.5 ? '#9be5d8' : '#c7f3ea', {
        alpha: 0.4 + 0.012 * k,
        taper: 0.35,
        groove: 0.2,
      });
    }
  }
  // glitter path under the sun
  for (let i = 0; i < 120; i++) {
    const y = HORIZON + 3 + Math.pow(R(), 1.6) * 62,
      sp = 46 + (y - HORIZON) * 2.2,
      x = SUN[0] + R.gauss() * sp,
      L = 6 + R() * 26;
    P.liner(
      [
        [x - L / 2, y],
        [x + L / 2, y + R.gauss() * 0.6],
      ],
      2.6,
      1.6,
      R() < 0.6 ? '#fff0a3' : '#ffb85e',
      { alpha: 0.75, taper: 0.4, groove: 0.2 },
    );
  }
  c.restore();
  P.d.restore();

  // ------------------------------------------------ sun (half disc on the horizon)
  {
    const sun = new Path2D();
    sun.arc(SUN[0], SUN[1], 122, Math.PI, 0);
    sun.closePath();
    P.raise(sun, { level: 0.5, cls: 'back', margin: 4, edge: '#a8431f' });
    P.fill(
      sun,
      P.rgrad(SUN[0], SUN[1] - 10, 10, 126, [
        [0, '#fffbd0'],
        [0.45, '#ffe57a'],
        [0.8, '#ffc34a'],
        [1, '#ff9a3a'],
      ]),
    );
    P.bristles(sun, {
      box: [SUN[0] - 124, SUN[1] - 124, SUN[0] + 124, SUN[1]],
      n: 120,
      len: [14, 40],
      w: [3, 7],
      colors: ['#fff3a6', '#ffd24d', '#ffb347', '#fffbe0'],
      alpha: [0.1, 0.25],
      dir: (x, y) => Math.atan2(y - SUN[1], x - SUN[0]) + Math.PI / 2,
      ridge: 0.05,
    });
    const rim = new Path2D();
    rim.arc(SUN[0], SUN[1], 112, Math.PI + 0.05, -0.05);
    P.stroke(rim, '#fff7c9', 2.2, 0.7);
  }

  // ------------------------------------------------ routed border
  {
    const ring = new Path2D();
    ring.addPath(board);
    ring.addPath(inner);
    P.back.fillStyle = 'rgb(168,168,168)';
    P.back.fill(ring, 'evenodd');
    P.d.fillStyle = '#808080';
    P.d.fill(ring, 'evenodd');
    c.fillStyle = '#efe4c6';
    c.fill(ring, 'evenodd');
    c.save();
    c.clip(ring, 'evenodd');
    P.d.save();
    P.d.clip(ring, 'evenodd');
    P.bristles(null, {
      box: [40, 50, 1560, 860],
      n: 900,
      len: [30, 80],
      w: [3, 7],
      colors: ['#f6eed6', '#e2d3ab', '#fffaf0', '#d6c49a'],
      alpha: [0.1, 0.25],
      dir: (x, y) => (x < 90 || x > 1510 ? Math.PI / 2 : 0),
      jit: 0.05,
      ridge: 0.05,
    });
    c.restore();
    P.d.restore();
    P.stroke(boardPath(17), '#d6a43c', 4.2);
    P.stroke(boardPath(17), '#fff0b0', 1.2, 0.8);
    P.carve(boardPath(17), 5, -0.4);
    P.material(
      P.linerPath(
        [
          [0, 0],
          [1, 1],
        ],
        0.1,
      ),
      'paint',
    );
    P.stroke(inner, '#0d2c3c', 5);
    P.carve(inner, 6, -0.6);
    P.stroke(boardPath(2), '#0d2c3c', 4);
    P.stroke(boardPath(8.5), '#c75a3c', 2.2, 0.9);
  }

  // ------------------------------------------------ red mangrove (right): branch, leaves, prop roots
  {
    const br = [
      [1568, 300],
      [1520, 330],
      [1486, 392],
      [1470, 470],
      [1462, 560],
      [1452, 640],
    ];
    const trunk = P.linerPath(br, 15, 26, { taper: 0 });
    P.raise(trunk, { level: 0.55, cls: 'back', margin: 3, edge: '#1d130d' });
    P.fill(
      trunk,
      P.grad(1440, 0, 1500, 0, [
        [0, '#8a6244'],
        [0.5, '#6b4630'],
        [1, '#3d281c'],
      ]),
    );
    P.bristles(trunk, {
      box: [1430, 290, 1575, 650],
      n: 70,
      len: [14, 36],
      w: [2, 5],
      colors: ['#a67a55', '#4a3122', '#7d573b'],
      alpha: [0.2, 0.4],
      dir: 1.5,
      ridge: 0.07,
    });
    const roots = [
      [
        [1458, 590],
        [1420, 640],
        [1372, 730],
        [1352, 842],
      ],
      [
        [1462, 610],
        [1452, 700],
        [1436, 780],
        [1428, 850],
      ],
      [
        [1466, 600],
        [1510, 660],
        [1528, 760],
        [1534, 850],
      ],
      [
        [1452, 560],
        [1392, 600],
        [1316, 668],
        [1278, 760],
        [1266, 846],
      ],
      [
        [1470, 630],
        [1486, 720],
        [1482, 800],
        [1486, 852],
      ],
      [
        [1392, 640],
        [1374, 690],
        [1392, 770],
        [1400, 850],
      ],
    ];
    for (const r of roots) {
      const rp = P.linerPath(r, 15, 8.5, { taper: 0 });
      P.raise(rp, { level: 0.52, cls: 'back', margin: 2.8, edge: '#1d130d' });
      P.fill(
        rp,
        P.grad(0, 560, 0, 850, [
          [0, '#7a5238'],
          [0.6, '#5e3d2a'],
          [1, '#33221a'],
        ]),
      );
      P.liner(
        r.map(([x, y]) => [x - 3, y]),
        3.4,
        2,
        '#b98d66',
        { alpha: 0.7, taper: 0.1 },
      );
      P.liner(
        r.map(([x, y]) => [x + 3.6, y]),
        2.6,
        1.6,
        '#24160f',
        { alpha: 0.55, taper: 0.1 },
      );
    }
    const sprays = [
      [1520, 330, -2.5],
      [1486, 392, -2.9],
      [1500, 356, -1.9],
      [1470, 470, 3.2],
      [1474, 430, -2.6],
      [1540, 318, -1.6],
      [1462, 540, 2.9],
      [1478, 500, -0.3],
      [1500, 420, -0.5],
      [1530, 372, -0.2],
    ];
    for (const [x, y, a] of sprays)
      for (let i = 0; i < 5; i++) {
        P.save();
        P.translate(x + R.gauss() * 6, y + R.gauss() * 6);
        P.rotate(a + (i - 2) * 0.42 + R.gauss() * 0.1);
        const yel = R() < 0.13;
        leaf(P, {
          len: 50 + R() * 16,
          w: 13 + R() * 3,
          serrate: false,
          color: yel ? '#d9bd3c' : R.pick(['#2f8048', '#3b8e4c', '#27713f']),
          light: yel ? '#f3e58f' : '#8fd07c',
          dark: yel ? '#8f6f1c' : '#174a30',
          level: 0.5 + R() * 0.12,
        });
        P.restore();
      }
  }

  // ------------------------------------------------ spoonbill (right), wading
  {
    const s = 1.2,
      ox = 1168,
      oy = 62;
    // ripples where the legs enter the water
    for (const [lx, ly] of [
      [172, 566],
      [219, 566],
    ])
      for (let i = 0; i < 3; i++) {
        const e = P.ellipse(ox + lx * s, oy + ly * s + 2, 22 + i * 15, 5 + i * 3.4);
        P.stroke(e, i ? '#bfeee4' : '#f4fffb', 2.6 - i * 0.6, 0.75 - i * 0.2);
        P.carve(e, 2, 0.25);
      }
    P.save();
    P.translate(ox, oy);
    P.scale(s);
    spoonbill(P);
    P.restore();
    for (const [lx, ly] of [
      [172, 566],
      [219, 566],
    ]) {
      const e = new Path2D();
      e.ellipse(ox + lx * s, oy + ly * s + 3, 17, 4.5, 0, 0, Math.PI);
      P.stroke(e, '#f4fffb', 2.4, 0.9);
    }
  }

  // ------------------------------------------------ tarpon (left), leaping out of a splash
  {
    const cx = 208,
      cy = 452;
    // splash crown behind the tail
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i - 7.5) * 0.17 + R.gauss() * 0.05,
        L = 56 + R() * 74,
        bx = 150 + (i - 7.5) * 9,
        by = 716;
      const pts = [
        [bx, by],
        [bx + Math.cos(a) * L * 0.6, by + Math.sin(a) * L * 0.6],
        [bx + Math.cos(a) * L + (i - 7.5) * 3, by + Math.sin(a) * L + 9],
      ];
      const sp = P.linerPath(pts, 15, 2.5, { taper: 0.05 });
      P.raise(sp, { level: 0.5, margin: 2.4, edge: '#0c3a4c' });
      P.fill(
        sp,
        P.grad(0, by - L, 0, by, [
          [0, '#ffffff'],
          [1, '#a7e4dc'],
        ]),
      );
      const d = P.ellipse(
        pts[2][0] + R.gauss() * 8,
        pts[2][1] - 12 - R() * 22,
        3 + R() * 3.4,
        4 + R() * 4,
      );
      P.raise(d, { level: 0.5, margin: 1.8, edge: '#0c3a4c' });
      P.fill(d, '#f2fffb');
    }
    P.save();
    P.translate(cx, cy);
    P.rotate(-1.19);
    P.translate(-256, -140);
    tarpon(P);
    P.restore();
    // foam in front of the tail base
    for (let i = 0; i < 9; i++) {
      const e = P.ellipse(
        96 + i * 17 + R.gauss() * 4,
        724 + R.gauss() * 5,
        15 + R() * 10,
        8 + R() * 5,
      );
      P.raise(e, { level: 0.42, margin: 2.2, edge: '#0c3a4c' });
      P.fill(
        e,
        P.rgrad(e ? 96 + i * 17 : 0, 720, 2, 26, [
          [0, '#ffffff'],
          [1, '#c6f0e8'],
        ]),
      );
    }
    for (let i = 0; i < 3; i++) {
      const e = P.ellipse(162, 734, 96 + i * 34, 10 + i * 5);
      P.stroke(e, '#d9fbf4', 3 - i * 0.7, 0.7 - i * 0.18);
      P.carve(e, 2.4, 0.25);
    }
  }

  // ------------------------------------------------ conch, hibiscus and leaves (bottom left); second bloom at the roots
  {
    for (const [x, y, a, L] of [
      [466, 786, -2.5, 96],
      [484, 798, -0.5, 104],
      [490, 776, -1.25, 86],
      [454, 812, 2.6, 84],
    ]) {
      P.save();
      P.translate(x, y);
      P.rotate(a);
      leaf(P, { len: L, w: 30, level: 0.5 });
      P.restore();
    }
    P.save();
    P.translate(236, 742);
    P.rotate(-0.06);
    P.scale(0.86);
    conch(P);
    P.restore();
    P.save();
    P.translate(490, 778);
    hibiscus(P, { r: 60, column: 0.75 });
    P.restore();
    for (const [x, y, a, L] of [
      [1306, 806, -2.7, 80],
      [1330, 820, -0.35, 86],
      [1320, 792, -1.6, 70],
    ]) {
      P.save();
      P.translate(x, y);
      P.rotate(a);
      leaf(P, { len: L, w: 26, level: 0.5 });
      P.restore();
    }
    P.save();
    P.translate(1318, 800);
    hibiscus(P, { r: 50, column: 2.4, mid: '#e2432f', outer: '#ffa06a' });
    P.restore();
  }

  // ------------------------------------------------ lettering
  // "Welcome to" in one-stroke casual over the sun
  carvedText(P, 'Welcome to', SUN[0], SUN[1] - 170, 62, {
    style: 'casual',
    arc: { cx: SUN[0], cy: SUN[1], r: 170, dir: 1 },
    fill: [
      [0, '#fffdf2'],
      [1, '#f6e3bb'],
    ],
    outline: '#0d2c3c',
    outlineW: 0.085,
    shadow: 0.42,
    level: 0.72,
    ridge: 4,
    tracking: 1.15,
  });
  // "The Keys" in gold leaf
  carvedText(P, 'The Keys', 760, 596, 166, {
    style: {
      xs: 0.93,
      gap: 27,
      slant: 0,
      pen: { a: 0.225, b: 0.078, theta: 0.2 },
      serif: { len: 0.085, thick: 0.07 },
      ball: 0.072,
      bounce: 0,
      tilt: 0,
      swell: 0,
    },
    fill: 'gold',
    outline: '#0b2636',
    outline2: '#7a2d1b',
    outlineW: 0.062,
    shadow: 0.55,
    level: 1.0,
    ridge: 14,
    island: 0.5,
  });
  // ribbon with the name of the first key
  {
    const rb = ribbon(P, 760, 668, 300, 70, { arch: 9 });
    carvedText(P, 'KEY PALOMA', 760, 668 - 9 + 51, 38, {
      style: 'romanCond',
      arc: { ...rb.arc, cy: rb.arc.cy + 60 - 9 },
      fill: [
        [0, '#fffaf0'],
        [1, '#f3ddb0'],
      ],
      outline: '#5a1a12',
      outlineW: 0.07,
      shadow: 0.4,
      level: 0.9,
      ridge: 3,
      tracking: 1.5,
    });
    for (const sx of [-1, 1]) {
      P.save();
      P.translate(760 + sx * 262, 700);
      const st = new Path2D();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
          r = i % 2 ? 5 : 12;
        st[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      st.closePath();
      P.fill(st, '#ffe9b8');
      P.stroke(st, '#5a1a12', 1.2, 0.8);
      P.carveFill(st, 0.4);
      P.restore();
    }
  }
  carvedText(P, 'where the mainland lets go', 760, 798, 27, {
    style: 'liner',
    fill: '#dff6ee',
    outline: '#083042',
    outlineW: 0.11,
    shadow: 0.35,
    level: 0.6,
    ridge: 2,
    tracking: 1.25,
  });
  // frigatebirds high in the rays
  for (const [x, y, s] of [
    [420, 190, 1],
    [470, 160, 0.7],
    [1010, 150, 0.85],
  ]) {
    P.liner(
      [
        [x - 22 * s, y - 3 * s],
        [x - 10 * s, y - 9 * s],
        [x, y],
        [x + 10 * s, y - 9 * s],
        [x + 24 * s, y - 2 * s],
      ],
      3.4 * s,
      1.2 * s,
      '#1a2b3a',
      { alpha: 0.9, taper: 0.4, groove: 0.3 },
    );
    P.liner(
      [
        [x, y],
        [x - 2 * s, y + 9 * s],
      ],
      2 * s,
      0.6 * s,
      '#1a2b3a',
      { taper: 0.1 },
    );
  }
  // painter's mark, low on the border
  carvedText(P, 'hand lettered on Key Paloma', 1330, 848, 9, {
    style: 'liner',
    align: 'center',
    fill: '#8a6a3a',
    outline: null,
    shadow: 0,
    level: 0.02,
    ridge: 1,
  });

  // ------------------------------------------------ fixings and years outdoors
  for (const [x, y] of [
    [70, 170],
    [1530, 170],
    [70, 800],
    [1530, 800],
    [520, 74],
    [1080, 74],
    [420, 840],
    [1180, 840],
  ])
    screw(P, x, y, 4.6, 50 + R() * 60);
  if (weather > 0)
    for (const [x, y, s] of [
      [640, 66, 1],
      [905, 60, 0.8],
      [1236, 90, 1.1],
      [330, 96, 0.7],
      [1452, 228, 0.75],
      [214, 214, 0.6],
    ])
      dropping(P, x, y, s);

  const out = P.finish({
    relief: 2.3,
    fade: 0.3 * weather,
    chips: 0.55 * weather,
    grime: 0.34 * weather,
    salt: 0.35 * weather,
    planks: 86,
    bevelArt: 12,
    bevelBack: 5.5,
  });
  return { ...out, aspect: DW / DH, design: KEYS_SIGN_DESIGN };
}

// The back of the board, seen when leaving the Keys: painted marine plywood, weathered harder than the face.
export function paintKeysBack({ width = 2048, seed = 77 } = {}) {
  const P = createPainter({ width, designW: DW, designH: DH, seed }),
    c = P.c,
    R = P.R;
  const all = new Path2D();
  all.rect(0, 0, DW, DH);
  P.sil.fillStyle = '#fff';
  P.sil.fill(all);
  c.fillStyle = P.grad(0, 0, 0, DH, [
    [0, '#9fc9bb'],
    [1, '#7fb0a4'],
  ]);
  c.fill(all);
  P.bristles(all, {
    box: [0, 0, DW, DH],
    n: 1500,
    len: [40, 130],
    w: [4, 11],
    colors: ['#9fc9bb', '#86b8ab', '#b5d8cb', '#74a79b'],
    alpha: [0.08, 0.2],
    dir: 0,
    jit: 0.04,
    ridge: 0.05,
  });
  for (let x = 400; x < DW; x += 400) {
    const p = new Path2D();
    p.moveTo(x, 0);
    p.lineTo(x + R.gauss() * 2, DH);
    P.carve(p, 2.4, -0.7);
    P.stroke(p, '#27413b', 1.4, 0.5);
    for (let y = 30; y < DH; y += 75) screw(P, x - 14, y, 3.4, 40 + R() * 50);
  }
  for (let y = 4; y < DH; y += 3.4) {
    const p = new Path2D();
    p.moveTo(0, y);
    for (let x = 0; x <= DW; x += 50) p.lineTo(x, y + R.gauss() * 0.7);
    P.carve(p, 1.1, -(0.06 + R() * 0.12));
  }
  carvedText(P, 'Come Back Soon', 800, 430, 120, {
    style: 'casual',
    fill: [
      [0, '#fff8e6'],
      [1, '#f1dcae'],
    ],
    outline: '#0d2c3c',
    outlineW: 0.07,
    shadow: 0.4,
    level: 0.5,
    ridge: 5,
    tracking: 1.1,
  });
  carvedText(P, 'KEY PALOMA THANKS YOU', 800, 540, 44, {
    style: 'romanCond',
    fill: '#e2553c',
    outline: '#fff3d8',
    outlineW: 0.07,
    shadow: 0.3,
    level: 0.4,
    ridge: 3,
    tracking: 1.4,
  });
  carvedText(P, 'drive easy on the bridges', 800, 620, 34, {
    style: 'liner',
    fill: '#0d3a48',
    outline: null,
    shadow: 0,
    level: 0.2,
    ridge: 2,
    tracking: 1.2,
  });
  P.save();
  P.translate(800, 250);
  hibiscus(P, { r: 56, column: 0.9 });
  P.restore();
  for (const [x, y, s] of [
    [300, 40, 1],
    [990, 30, 0.8],
    [1300, 60, 1.1],
  ])
    dropping(P, x, y, s);
  const out = P.finish({
    relief: 1.6,
    fade: 0.5,
    chips: 0.9,
    grime: 0.7,
    salt: 0.5,
    planks: 0,
    bevelArt: 8,
    bevelBack: 4,
  });
  return { ...out, aspect: DW / DH, design: KEYS_SIGN_DESIGN };
}
void lerp;
void rgba;
void mixHex;

// KEYS-SIGN track: hand-painted Keys wildlife and flora for carved roadside signs. Original artwork drawn in code.
// Every motif paints at the origin in its own local units (documented per function); the caller positions it with
// P.save() / P.translate() / P.rotate() / P.scale() / P.restore(). Each one paints color and carves relief together.
import { penPath } from './lettering.js';
import { rgba, lerp, jitter, mixHex } from './util.js';

const P2 = (d) => new Path2D(d);
const EDGE = '#0d2a3a';

// ---------------------------------------------------------------- roseate spoonbill, standing, facing left
// local box: x -30..352, y 70..570 (feet at y 566)
export function spoonbill(P, { level = 0.86 } = {}) {
  const R = P.R,
    DK = '#4a1c30';
  // legs
  const legB = [
      [180, 330],
      [188, 384],
      [197, 436],
      [183, 496],
      [172, 566],
    ],
    legA = [
      [224, 338],
      [231, 396],
      [227, 452],
      [222, 510],
      [219, 566],
    ];
  for (const [leg, lv, col] of [
    [legB, 0.5, '#bf4764'],
    [legA, 0.58, '#dc5d78'],
  ]) {
    const p = P.linerPath(leg, 13, 9, { taper: 0 });
    P.raise(p, { level: lv, margin: 2.5, edge: DK });
    P.fill(p, col);
    P.liner(
      leg.map(([x, y]) => [x - 2.6, y]),
      3.2,
      2.2,
      '#f39aae',
      { alpha: 0.85, taper: 0.1 },
    );
    P.liner(
      leg.map(([x, y]) => [x + 3.4, y]),
      2.6,
      2,
      '#8e2f4a',
      { alpha: 0.6, taper: 0.1 },
    );
    const knee = P.ellipse(leg[2][0], leg[2][1], 8.5, 10.5);
    P.raise(knee, { level: lv + 0.06, margin: 0, flatDetail: false });
    P.fill(knee, mixHex(col, '#f6a8b8', 0.25));
    P.stroke(knee, DK, 1.3, 0.5);
    for (let i = 0; i < 9; i++) {
      const t = 0.55 + i * 0.05,
        y = lerp(leg[2][1], leg[4][1], (t - 0.5) * 2),
        x = lerp(leg[2][0], leg[4][0], (t - 0.5) * 2);
      P.liner(
        [
          [x - 4, y],
          [x + 4, y + 1],
        ],
        1.1,
        1.1,
        '#8e2f4a',
        { alpha: 0.4, groove: -0.25 },
      );
    }
  }
  // tail
  const tail = P2('M284 280 L354 294 L350 309 L332 313 L343 326 L314 331 L302 340 L268 322 Z');
  P.raise(tail, { level: level * 0.8, margin: 3, edge: DK });
  P.fill(
    tail,
    P.grad(280, 285, 350, 330, [
      [0, '#f6b47a'],
      [1, '#e98a4c'],
    ]),
  );
  for (const [a, b] of [
    [
      [290, 292],
      [350, 303],
    ],
    [
      [288, 304],
      [338, 320],
    ],
    [
      [284, 314],
      [310, 334],
    ],
  ])
    P.liner([a, b], 1.8, 1.2, '#b85a2c', { alpha: 0.7, groove: -0.35 });
  // body
  const body = P2(
    'M110 270 C98 222 150 204 200 208 C252 213 304 248 334 300 C322 332 290 346 250 349 C200 353 150 342 124 316 C112 302 108 286 110 270 Z',
  );
  P.raise(body, { level, margin: 3.5, edge: DK });
  P.fill(
    body,
    P.grad(150, 208, 235, 352, [
      [0, '#f9c3cf'],
      [0.45, '#f29db4'],
      [1, '#d67697'],
    ]),
  );
  P.within(body, () => {
    P.blob(176, 232, 86, 34, '#fee6ea', 0.75, 0.2);
    P.blob(232, 348, 120, 30, '#a94f80', 0.6);
    P.blob(128, 300, 30, 42, '#fde4e8', 0.55);
    P.blob(300, 300, 40, 30, '#f7b59a', 0.35);
  });
  P.bristles(body, {
    box: [100, 200, 340, 356],
    n: 300,
    len: [12, 36],
    w: [2.2, 6],
    colors: ['#f29db4', '#f9cdd6', '#f4a9bd', '#cf6d90', '#fbdfe4'],
    alpha: [0.12, 0.32],
    dir: 0.3,
    ridge: 0.06,
  });
  // wing
  const wing = P2(
    'M148 236 C196 214 268 232 328 298 C294 315 250 323 206 313 C172 302 152 272 148 236 Z',
  );
  P.fill(
    wing,
    P.grad(150, 226, 320, 316, [
      [0, '#f4a2ba'],
      [0.6, '#ee8dab'],
      [1, '#e2799c'],
    ]),
  );
  P.within(wing, () => {
    P.blob(210, 244, 70, 22, '#fbd0da', 0.6, 0.3);
    P.blob(250, 318, 80, 16, '#a7487a', 0.5, 0.1);
  });
  P.carve(wing, 2.6, -0.5);
  P.stroke(wing, '#a8436f', 1.8, 0.75);
  const cov = P2(
    'M160 241 C198 224 248 236 274 263 C242 281 200 277 170 263 C163 256 160 248 160 241 Z',
  );
  P.fill(
    cov,
    P.grad(162, 236, 272, 278, [
      [0, '#e2446c'],
      [0.6, '#c92c57'],
      [1, '#a81f4a'],
    ]),
  );
  P.within(cov, () => {
    P.blob(200, 244, 40, 10, '#f58ba3', 0.65, 0.2);
  });
  P.bristles(cov, {
    box: [158, 232, 276, 282],
    n: 60,
    len: [10, 24],
    w: [2, 4.5],
    colors: ['#d93a63', '#b3214c', '#ef6f8c'],
    alpha: [0.2, 0.4],
    dir: 0.35,
    ridge: 0.06,
  });
  P.carve(cov, 1.8, -0.35);
  // scalloped coverts and long flight feathers
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 7 - r; i++) {
      const x = 186 + i * 19 + r * 10,
        y = 276 + r * 11 + i * (3.2 - r * 0.6) - Math.max(0, i - 4) * 1.5;
      const p = new Path2D();
      p.arc(x, y, 10.5, 0.15, Math.PI - 0.5);
      P.stroke(p, '#b0466f', 1.6, 0.8);
      P.carve(p, 1.6, -0.4);
      const hl = new Path2D();
      hl.arc(x, y - 2.2, 9, 0.5, Math.PI - 0.9);
      P.stroke(hl, '#fbd3dc', 1.4, 0.6);
    }
  for (let i = 0; i < 6; i++) {
    const a = [214 + i * 16, 310 - i * 2.2],
      b = [306 + i * 4.4, 304 - i * 1.4];
    P.liner([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 3], b], 1.9, 1, '#a8436f', {
      alpha: 0.75,
      groove: -0.4,
    });
  }
  // neck
  const neck = P2(
    'M112 278 C80 240 82 196 108 166 C126 146 120 120 100 106 L124 84 C152 102 156 142 138 172 C120 202 126 236 158 252 C150 268 130 280 112 278 Z',
  );
  P.raise(neck, { level: level * 0.94, margin: 3.2, edge: DK });
  P.fill(
    neck,
    P.grad(110, 90, 130, 278, [
      [0, '#fffaf6'],
      [0.55, '#fdeaea'],
      [0.85, '#f8c3cf'],
      [1, '#f3a5ba'],
    ]),
  );
  P.within(neck, () => {
    P.blob(146, 140, 16, 50, '#c5a2b6', 0.6, 0);
    P.blob(134, 214, 14, 44, '#c9a3b8', 0.55, -0.3);
    P.blob(96, 200, 12, 50, '#ffffff', 0.7);
  });
  P.bristles(neck, {
    box: [80, 86, 160, 280],
    n: 110,
    len: [9, 22],
    w: [1.8, 4],
    colors: ['#ffffff', '#f6dfe2', '#e9c2cd', '#fbeff0'],
    alpha: [0.15, 0.35],
    dir: (x, y) => (y < 130 ? 2.2 : y < 190 ? 1.25 : 1.9),
    ridge: 0.05,
  });
  // head
  const head = P.ellipse(106, 93, 26, 20.5, -0.22);
  P.raise(head, { level: level * 0.98, margin: 3, edge: DK });
  P.fill(
    head,
    P.grad(90, 76, 124, 112, [
      [0, '#e3e6c4'],
      [0.6, '#c9cfa6'],
      [1, '#a9b08a'],
    ]),
  );
  P.within(head, () => {
    P.blob(100, 82, 16, 8, '#f3f4dc', 0.7);
    P.blob(126, 100, 12, 12, '#2c2c2a', 0.75);
  });
  const eye = P.ellipse(99, 90, 5.6, 5.6);
  P.fill(eye, '#c3242b');
  P.stroke(eye, '#2a1512', 1.3);
  P.fill(P.ellipse(99, 90, 2.5, 2.5), '#120a09');
  P.fill(P.ellipse(97.6, 88.4, 1.15, 1.15), '#fff');
  P.carve(eye, 1.4, -0.5);
  // bill: long, flat, spoon-tipped
  const bill = P2(
    'M90 79 C56 91 24 115 0 133 C-24 143 -33 162 -17 173 C0 180 17 169 25 153 C47 129 73 111 93 103 Z',
  );
  P.raise(bill, { level: level * 0.86, margin: 3, edge: DK });
  P.fill(
    bill,
    P.grad(90, 85, -20, 170, [
      [0, '#b3b59e'],
      [0.55, '#9d9f8a'],
      [1, '#85887a'],
    ]),
  );
  P.within(bill, () => {
    P.blob(-6, 152, 18, 12, '#d6d8c4', 0.75, -0.5);
    P.blob(50, 104, 40, 6, '#d2d4be', 0.6, -0.55);
    P.blob(30, 142, 40, 7, '#5f6256', 0.5, -0.6);
  });
  P.liner(
    [
      [92, 94],
      [52, 116],
      [18, 142],
      [-8, 160],
    ],
    2,
    1.3,
    '#4c4e43',
    { alpha: 0.85, groove: -0.45 },
  );
  for (let i = 0; i < 7; i++) {
    const t = i / 7,
      x = lerp(84, 44, t),
      y = lerp(86, 108, t);
    P.liner(
      [
        [x, y],
        [x + 4.5, y + 8],
      ],
      1.3,
      1,
      '#6c6e60',
      { alpha: 0.6, groove: -0.3 },
    );
  }
  P.fill(P.ellipse(72, 96, 2.6, 1.3, -0.5), '#3b3d33');
  P.material(head, 'paint');
  void R;
}

// ---------------------------------------------------------------- tarpon ("silver king"), facing right, back up
// local box: x 0..512, y 20..256
export function tarpon(P, { level = 0.9 } = {}) {
  const R = P.R,
    DK = '#0c2a36';
  const fin = (d, rays, base) => {
    const p = P2(d);
    P.raise(p, { level: level * 0.62, margin: 3, edge: DK });
    P.fill(
      p,
      P.grad(base[0], base[1], base[2], base[3], [
        [0, '#8fa9ae'],
        [0.5, '#4f7079'],
        [1, '#2f4f59'],
      ]),
    );
    for (const [a, b] of rays) {
      P.liner([a, b], 2, 1, '#1f3a43', { alpha: 0.7, groove: -0.4 });
      P.liner(
        [
          [a[0] + 2, a[1] + 1],
          [b[0] + 2, b[1] + 1],
        ],
        1.1,
        0.7,
        '#b9cdd0',
        { alpha: 0.5 },
      );
    }
    return p;
  };
  const fan = (ox, oy, pts) => pts.map((q) => [[ox, oy], q]);
  // fins behind the body
  fin(
    'M266 76 L246 22 C241 44 233 58 223 64 C200 61 170 57 136 62 C170 69 197 73 217 76 Z',
    [
      [
        [258, 74],
        [246, 30],
      ],
      [
        [248, 74],
        [240, 44],
      ],
      [
        [238, 74],
        [232, 58],
      ],
      [
        [226, 74],
        [180, 62],
      ],
      [
        [222, 72],
        [146, 62],
      ],
    ],
    [240, 76, 220, 24],
  );
  fin(
    'M224 204 L186 254 C190 230 176 215 150 198 Z',
    fan(206, 204, [
      [188, 248],
      [186, 232],
      [176, 218],
      [162, 206],
    ]),
    [200, 200, 180, 250],
  );
  fin(
    'M304 204 L272 244 C274 228 270 215 266 205 Z',
    fan(290, 204, [
      [273, 240],
      [272, 224],
      [268, 210],
    ]),
    [290, 204, 272, 240],
  );
  // tail: deeply forked
  const tail = P2(
    'M72 122 C52 110 24 88 2 56 C22 98 34 126 36 143 C36 162 26 192 0 228 C28 202 54 180 74 166 Z',
  );
  P.raise(tail, { level: level * 0.7, margin: 3.2, edge: DK });
  P.fill(
    tail,
    P.grad(72, 144, 4, 144, [
      [0, '#7f9aa1'],
      [0.4, '#4a6c76'],
      [1, '#27444d'],
    ]),
  );
  for (const q of [
    [6, 62],
    [16, 84],
    [26, 106],
    [33, 128],
    [35, 144],
    [33, 160],
    [24, 186],
    [12, 208],
    [4, 222],
  ]) {
    P.liner(
      [[70, 144], [(70 + q[0]) / 2, (144 + q[1]) / 2 + (q[1] < 144 ? 3 : -3)], q],
      2.4,
      0.9,
      '#1c3740',
      { alpha: 0.7, groove: -0.4 },
    );
  }
  P.within(tail, () => {
    P.blob(60, 144, 26, 30, '#c7d6d8', 0.6);
  });
  // body
  const body = P2(
    'M502 150 C486 122 446 100 400 92 C320 72 220 70 150 92 C112 104 86 116 62 126 L62 162 C110 180 200 207 300 205 C380 203 442 191 480 173 C494 167 502 159 502 150 Z',
  );
  P.raise(body, { level, margin: 3.6, edge: DK });
  P.fill(
    body,
    P.grad(0, 70, 0, 207, [
      [0, '#1f4349'],
      [0.14, '#35666c'],
      [0.3, '#8fb0b4'],
      [0.5, '#d5e1e2'],
      [0.8, '#f8f9f4'],
      [1, '#c9d2d0'],
    ]),
  );
  P.within(body, () => {
    P.blob(280, 138, 190, 22, '#ffffff', 0.7);
    P.blob(200, 108, 130, 16, '#9fb6dc', 0.4);
    P.blob(330, 186, 150, 14, '#f8c9ad', 0.45);
    P.blob(455, 118, 40, 22, '#6f7f5a', 0.45);
    P.blob(120, 150, 60, 20, '#eef3f1', 0.5);
  });
  P.bristles(body, {
    box: [60, 72, 500, 208],
    n: 340,
    len: [16, 46],
    w: [2, 5.5],
    colors: ['#dfe9ea', '#b7cbd0', '#f6f8f4', '#86a6ad', '#c9d4e6'],
    alpha: [0.1, 0.26],
    dir: (x) => -0.12 + (x - 280) * 0.0007,
    ridge: 0.04,
  });
  // big armored scales, overlapping toward the tail
  const colTop = [],
    colBot = [];
  for (let x = 84; x <= 412; x += 4) {
    let t = 60,
      b = 215;
    while (t < 150 && !P.inside(body, x, t)) t += 2;
    while (b > 150 && !P.inside(body, x, b)) b -= 2;
    colTop[x] = t;
    colBot[x] = b;
  }
  for (let j = 0; j < 7; j++)
    for (let x = 92 + (j % 2) * 10; x <= 408; x += 20) {
      const xi = Math.round(x / 4) * 4,
        t = colTop[xi],
        b = colBot[xi];
      if (t === undefined) continue;
      const hgt = b - t,
        y = t + ((j + 0.62) * hgt) / 7.25,
        r = Math.max(7, hgt / 9.2);
      const sc = new Path2D();
      sc.arc(x + r * 0.5, y, r, 1.72, 4.56);
      const dark = j === 0 ? '#12303a' : j < 2 ? '#3d646d' : '#6f919a';
      P.stroke(sc, dark, 1.7, j < 2 ? 0.8 : 0.7);
      P.carve(sc, 1.9, -0.42);
      const hl = new Path2D();
      hl.arc(x + r * 0.5 + 2.8, y, r - 0.6, 2.2, 4.1);
      P.stroke(hl, '#ffffff', 2.1, j === 0 ? 0.22 : 0.62);
      if (R() < 0.3) {
        const g = new Path2D();
        g.arc(x + r * 0.5 + 6, y, r * 0.55, 2.4, 3.9);
        P.stroke(g, R.pick(['#a9c0ee', '#f7c6a4', '#bfe8dd']), 2.4, 0.4);
      }
    }
  // head: gill plates, eye, upturned bony jaw
  P.liner(
    [
      [430, 100],
      [410, 128],
      [408, 156],
      [430, 192],
    ],
    3,
    2,
    '#2a4a54',
    { alpha: 0.85, taper: 0.15, groove: -0.5 },
  );
  P.liner(
    [
      [434, 102],
      [415, 128],
      [413, 156],
      [434, 190],
    ],
    1.6,
    1.2,
    '#ffffff',
    { alpha: 0.6, taper: 0.2 },
  );
  P.liner(
    [
      [452, 112],
      [440, 138],
      [444, 166],
      [456, 182],
    ],
    2,
    1.4,
    '#55757d',
    { alpha: 0.7, groove: -0.3 },
  );
  const jaw = P2(
    'M504 148 C498 158 484 168 466 174 C474 162 480 150 486 138 C494 138 500 142 504 148 Z',
  );
  P.fill(
    jaw,
    P.grad(470, 140, 500, 172, [
      [0, '#f2f5f1'],
      [1, '#aebfc1'],
    ]),
  );
  P.stroke(jaw, '#27434c', 1.6, 0.8);
  P.carve(jaw, 1.8, -0.4);
  P.liner(
    [
      [503, 146],
      [490, 140],
      [478, 142],
      [470, 150],
    ],
    2.6,
    1.4,
    '#142c35',
    { alpha: 0.9, groove: -0.5 },
  );
  const eye = P.ellipse(462, 126, 14.5, 14.5);
  P.fill(
    eye,
    P.rgrad(459, 123, 2, 15, [
      [0, '#f7e39a'],
      [0.6, '#dcae43'],
      [1, '#8a6a22'],
    ]),
  );
  P.stroke(eye, '#13262c', 2);
  P.carve(eye, 2, -0.5);
  P.fill(P.ellipse(463, 127, 8.4, 8.4), '#0d1b1f');
  P.fill(P.ellipse(459.4, 123, 2.8, 2.8), '#ffffff');
  P.fill(P.ellipse(466, 131, 1.3, 1.3), 'rgba(255,255,255,0.6)');
  // pectoral fin on top of the body
  fin(
    'M410 182 L368 230 C372 210 370 197 377 186 Z',
    fan(398, 184, [
      [370, 226],
      [371, 210],
      [376, 194],
    ]),
    [400, 184, 370, 228],
  );
  // dark back line and belly edge
  P.liner(
    [
      [150, 93],
      [220, 76],
      [320, 76],
      [400, 94],
      [450, 106],
    ],
    3,
    2,
    '#102a31',
    { alpha: 0.55, taper: 0.2 },
  );
}

// ---------------------------------------------------------------- queen conch shell
// local box: x 0..250, y 10..146; spire tip at the left, flared pink lip at the right
export function conch(P, { level = 0.8 } = {}) {
  const DK = '#3c2416';
  const shell = P2(
    'M6 76 C22 58 44 46 62 39 C68 24 84 21 93 32 C104 17 123 13 133 26 C150 11 175 15 181 32 C206 30 227 50 231 78 C241 84 247 97 241 109 C222 133 180 147 138 143 C92 139 46 113 6 76 Z',
  );
  P.raise(shell, { level, margin: 3.2, edge: DK });
  P.fill(
    shell,
    P.grad(60, 20, 150, 146, [
      [0, '#f6e0bb'],
      [0.45, '#ebbf8c'],
      [1, '#c48a5a'],
    ]),
  );
  P.within(shell, () => {
    P.blob(110, 44, 70, 18, '#fff3da', 0.75, -0.1);
    P.blob(60, 100, 60, 22, '#a86a3f', 0.45, 0.5);
    P.blob(160, 36, 40, 14, '#f8d2a8', 0.5);
  });
  P.bristles(shell, {
    box: [0, 12, 250, 148],
    n: 150,
    len: [12, 30],
    w: [2, 5],
    colors: ['#f1d2a4', '#d9a56f', '#fbe9cc', '#c08453'],
    alpha: [0.12, 0.3],
    dir: (x) => 1.0 + x * 0.004,
    ridge: 0.06,
  });
  // growth ridges sweeping round the body whorl, and the whorls of the spire
  for (let i = 0; i < 9; i++) {
    const x = 70 + i * 17;
    P.liner(
      [
        [x, 34 - (i % 2) * 3],
        [x - 12 + i * 1.4, 74],
        [x - 2 + i * 2, 118 + Math.min(18, i * 3)],
      ],
      2.2,
      1.2,
      '#b0703e',
      { alpha: 0.55, groove: -0.35 },
    );
    P.liner(
      [
        [x + 4, 36],
        [x - 7 + i * 1.4, 74],
        [x + 3 + i * 2, 114 + Math.min(18, i * 3)],
      ],
      1.4,
      0.9,
      '#fff0d6',
      { alpha: 0.5 },
    );
  }
  for (const [a, b, c] of [
    [
      [30, 60],
      [24, 74],
      [32, 90],
    ],
    [
      [48, 46],
      [40, 72],
      [52, 100],
    ],
  ])
    P.liner([a, b, c], 2.2, 1.4, '#9a5c33', { alpha: 0.7, groove: -0.45 });
  // knobs on the shoulder
  for (const [x, y, r] of [
    [74, 30, 9],
    [113, 21, 11],
    [157, 20, 12],
    [198, 36, 10],
  ]) {
    const k = P.ellipse(x, y + 4, r, r * 0.8);
    P.within(k, () => {
      P.blob(x - 2, y + 1, r, r * 0.7, '#fff6e2', 0.8);
    });
    P.carveFill(k, 0.22);
  }
  // glossy pink aperture
  const ap = P2(
    'M84 88 C116 63 176 59 217 82 C227 98 214 118 186 126 C150 134 112 124 96 110 C88 104 84 96 84 88 Z',
  );
  P.fill(
    ap,
    P.rgrad(142, 102, 6, 82, [
      [0, '#cf4f78'],
      [0.4, '#ee829d'],
      [0.8, '#f9bfc0'],
      [1, '#fde2cf'],
    ]),
  );
  P.within(ap, () => {
    P.blob(126, 84, 40, 9, '#ffe9ea', 0.8, -0.25);
    P.blob(170, 118, 44, 8, '#b93e6a', 0.45, -0.1);
  });
  P.stroke(ap, '#8a3a52', 1.6, 0.7);
  P.carveFill(ap, -0.3);
  P.carve(ap, 3, 0.3);
  P.material(ap, 'gloss');
  P.liner(
    [
      [92, 112],
      [138, 134],
      [190, 130],
      [232, 104],
    ],
    3.4,
    2,
    '#fff4e6',
    { alpha: 0.8, taper: 0.3 },
  );
}

// ---------------------------------------------------------------- leaves
// local: stem at the origin, tip along +x
export function leaf(
  P,
  {
    len = 90,
    w = 30,
    color = '#2f7d4f',
    light = '#79bd6f',
    dark = '#184a34',
    level = 0.5,
    serrate = true,
    cls = 'back',
    margin = 2.2,
    edge = '#0f2b22',
  } = {},
) {
  const n = 16,
    up = [],
    dn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      x = len * t,
      wv = w * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.9) * (1 - 0.2 * t),
      s = serrate && i > 1 && i < n - 1 ? (i % 2 ? 1.9 : -1.2) : 0;
    up.push([x, -(wv + s)]);
    dn.push([x, wv * 0.92 + s]);
  }
  const p = P.poly([...up, ...dn.slice().reverse()]);
  P.raise(p, { level, cls, margin, edge });
  P.fill(
    p,
    P.grad(0, 0, len, 0, [
      [0, dark],
      [0.35, color],
      [1, mixHex(color, light, 0.45)],
    ]),
  );
  const lower = P.poly([[0, 0], ...dn, [len, 0]]);
  P.within(lower, () => {
    P.c.fillStyle = rgba(dark, 0.45);
    P.c.fillRect(-5, -w * 2, len + 10, w * 4);
  });
  P.within(p, () => {
    P.blob(len * 0.5, -w * 0.5, len * 0.4, w * 0.36, light, 0.65);
  });
  P.liner(
    [
      [0, 0],
      [len * 0.5, -0.8],
      [len, 0],
    ],
    2.2,
    0.8,
    light,
    { alpha: 0.9, taper: 0.1, groove: -0.3 },
  );
  for (let i = 1; i <= 5; i++) {
    const x = len * (0.1 + i * 0.14),
      wv = w * Math.sin(Math.PI * Math.pow(x / len, 0.72)) * 0.8;
    P.liner(
      [
        [x, 0],
        [x + len * 0.1, -wv],
      ],
      1.1,
      0.5,
      light,
      { alpha: 0.6 },
    );
    P.liner(
      [
        [x, 0],
        [x + len * 0.1, wv],
      ],
      1.1,
      0.5,
      mixHex(light, color, 0.5),
      { alpha: 0.55 },
    );
  }
}

// ---------------------------------------------------------------- hibiscus bloom, centered at the origin; r = petal reach
export function hibiscus(
  P,
  { r = 62, inner = '#7c0f22', mid = '#d8322c', outer = '#ff8559', level = 0.8, column = 0.5 } = {},
) {
  const k = r / 86,
    R = P.R,
    DK = '#4a0d14';
  const petal = P2(
    'M0 0 C12 -26 44 -46 68 -34 C76 -30 80 -22 82 -15 C88 -9 90 2 86 9 C86 18 80 28 70 31 C46 42 14 24 0 0 Z',
  );
  P.save();
  P.scale(k);
  for (let i = 0; i < 5; i++) {
    P.save();
    P.rotate(-Math.PI / 2 + i * ((Math.PI * 2) / 5) + R.gauss() * 0.05);
    P.raise(petal, { level: level * (0.9 + i * 0.02), margin: (2.6 / k) * 0.8, edge: DK });
    P.fill(
      petal,
      P.rgrad(0, 0, 4, 92, [
        [0, inner],
        [0.2, mixHex(inner, mid, 0.6)],
        [0.55, mid],
        [1, outer],
      ]),
    );
    P.within(petal, () => {
      P.blob(52, 24, 30, 12, '#7e1420', 0.5, 0.4);
      P.blob(62, -20, 26, 10, '#ffc7a6', 0.55, -0.4);
    });
    for (let v = -3; v <= 3; v++) {
      const a = v * 0.2;
      P.liner(
        [
          [8, 0],
          [40, Math.sin(a) * 34],
          [78 - Math.abs(v) * 5, Math.sin(a) * 68 * 0.6 + v * 2],
        ],
        1.4,
        0.5,
        '#8f1820',
        { alpha: 0.5, groove: -0.22 },
      );
    }
    P.liner(
      [
        [30, -30],
        [58, -38],
        [80, -22],
        [88, 0],
      ],
      2,
      0.8,
      '#ffd9c2',
      { alpha: 0.7 },
    );
    P.carve(petal, 2.2, -0.4);
    P.restore();
  }
  // staminal column with anthers and five-lobed stigma
  P.save();
  P.rotate(column);
  const col = P.liner(
    [
      [0, 0],
      [22, 5],
      [46, 6],
      [66, 0],
    ],
    6,
    3.6,
    '#fac3ab',
    { taper: 0 },
  );
  P.stroke(col, DK, 1, 0.6);
  P.carveFill(col, 0.5);
  for (let i = 0; i < 12; i++) {
    const t = 0.5 + R() * 0.42,
      x = 66 * t,
      y = (R() - 0.5) * 15 + 4 * (1 - t);
    const d = P.ellipse(x, y, 2.6, 2.6);
    P.fill(d, '#ffd84a');
    P.stroke(d, '#9a6a12', 0.8, 0.7);
    P.carveFill(d, 0.4);
  }
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45,
      x = 68 + Math.cos(a) * 7,
      y = Math.sin(a) * 7;
    const d = P.ellipse(x, y, 2.9, 2.9);
    P.fill(d, '#b3121d');
    P.carveFill(d, 0.4);
  }
  P.restore();
  P.restore();
}

// ---------------------------------------------------------------- brown pelican perched on a piling, facing right
// local box: x 0..240, y 0..330 (piling top at y 250)
export function pelican(P, { level = 0.84 } = {}) {
  const DK = '#2a1a12';
  const pile = P2('M92 248 L170 248 L174 336 L88 336 Z');
  P.raise(pile, { level: level * 0.6, margin: 3, edge: DK });
  P.fill(
    pile,
    P.grad(88, 0, 176, 0, [
      [0, '#5a4636'],
      [0.4, '#8a715a'],
      [1, '#4a382b'],
    ]),
  );
  for (let i = 0; i < 9; i++)
    P.liner(
      [
        [96 + i * 9, 250],
        [95 + i * 9 + (i % 3), 334],
      ],
      1.6,
      1.2,
      '#3a2a20',
      { alpha: 0.5, groove: -0.3 },
    );
  const rope = P2('M88 268 L174 266 L175 282 L88 284 Z');
  P.fill(rope, '#d9c79a');
  for (let i = 0; i < 12; i++)
    P.liner(
      [
        [90 + i * 7, 268],
        [95 + i * 7, 283],
      ],
      1.2,
      1.2,
      '#8a744a',
      { alpha: 0.7, groove: -0.3 },
    );
  const body = P2(
    'M70 210 C52 170 76 128 118 122 C160 118 196 146 204 196 C208 226 190 250 150 254 C112 256 82 240 70 210 Z',
  );
  P.raise(body, { level, margin: 3.4, edge: DK });
  P.fill(
    body,
    P.grad(80, 125, 190, 255, [
      [0, '#9c8f86'],
      [0.5, '#786b63'],
      [1, '#4e433d'],
    ]),
  );
  P.within(body, () => {
    P.blob(120, 150, 50, 20, '#c9bdb2', 0.6, 0.3);
    P.blob(160, 244, 60, 16, '#2f2622', 0.55);
  });
  P.bristles(body, {
    box: [60, 118, 210, 258],
    n: 150,
    len: [10, 26],
    w: [2, 5],
    colors: ['#8d8078', '#b5a89e', '#5e524b', '#a2948b'],
    alpha: [0.15, 0.32],
    dir: 0.9,
    ridge: 0.06,
  });
  for (let r = 0; r < 4; r++)
    for (let i = 0; i < 6; i++) {
      const p = new Path2D();
      p.arc(96 + i * 17 + r * 6, 168 + r * 19, 10, 0.2, 2.7);
      P.stroke(p, '#3c322d', 1.5, 0.7);
      P.carve(p, 1.5, -0.35);
    }
  const neck = P2(
    'M150 132 C140 96 150 62 176 44 C196 32 216 44 214 66 C212 84 196 92 188 110 C182 124 184 140 190 152 C176 150 160 144 150 132 Z',
  );
  P.raise(neck, { level: level * 0.96, margin: 3, edge: DK });
  P.fill(
    neck,
    P.grad(150, 40, 200, 150, [
      [0, '#f6e7b8'],
      [0.3, '#fbf6ea'],
      [0.62, '#f4efe6'],
      [1, '#6b4a34'],
    ]),
  );
  P.within(neck, () => {
    P.blob(160, 110, 12, 36, '#5a3b28', 0.75, 0.15);
    P.blob(190, 54, 16, 10, '#fff3c4', 0.8);
  });
  const eye = P.ellipse(196, 58, 4.2, 4.2);
  P.fill(eye, '#e9e2c8');
  P.fill(P.ellipse(196.6, 58, 2.2, 2.2), '#161210');
  P.stroke(eye, DK, 1);
  const bill = P2(
    'M206 54 C232 58 262 78 286 110 C290 118 286 124 278 122 C262 132 236 130 214 108 C204 96 202 76 206 54 Z',
  );
  P.raise(bill, { level: level * 0.88, margin: 3, edge: DK });
  P.fill(
    bill,
    P.grad(206, 56, 280, 124, [
      [0, '#d9c8a4'],
      [0.5, '#bfae8e'],
      [1, '#8f8068'],
    ]),
  );
  const pouch = P2(
    'M212 84 C226 98 252 112 278 120 C262 131 236 129 215 108 C210 100 210 92 212 84 Z',
  );
  P.fill(
    pouch,
    P.grad(212, 86, 270, 128, [
      [0, '#7a5a44'],
      [1, '#4c382c'],
    ]),
  );
  P.carve(pouch, 1.6, -0.35);
  P.liner(
    [
      [207, 62],
      [240, 76],
      [284, 112],
    ],
    2,
    1.2,
    '#4b3f30',
    { alpha: 0.8, groove: -0.4 },
  );
  P.fill(P.ellipse(284, 116, 4, 5, 0.4), '#d98a3a');
  for (const x of [118, 146]) {
    const f = P.linerPath(
      [
        [x, 250],
        [x + 3, 262],
      ],
      9,
      12,
      { taper: 0 },
    );
    P.fill(f, '#3a3a3c');
  }
}

// ---------------------------------------------------------------- green sea turtle swimming, facing left; box x 0..300, y 0..200
export function seaTurtle(P, { level = 0.84 } = {}) {
  const DK = '#10281f';
  const flip = (d, g) => {
    const p = P2(d);
    P.raise(p, { level: level * 0.7, margin: 3, edge: DK });
    P.fill(
      p,
      P.grad(...g, [
        [0, '#6f8f5e'],
        [1, '#34583f'],
      ]),
    );
    P.within(p, () => {
      for (let i = 0; i < 26; i++) {
        const x = g[0] + (g[2] - g[0]) * P.R() * 1.1,
          y = g[1] + (g[3] - g[1]) * P.R() * 1.1;
        const s = P.ellipse(x, y, 5 + P.R() * 4, 4 + P.R() * 3, P.R() * 3);
        P.fill(s, 'rgba(20,48,34,0.55)');
        P.stroke(s, '#cfe0b4', 0.9, 0.6);
      }
    });
    return p;
  };
  flip('M110 70 C84 40 50 16 14 8 C8 22 20 44 50 62 C70 74 92 82 110 84 Z', [100, 80, 20, 14]);
  flip(
    'M118 136 C100 160 80 178 58 190 C54 178 62 160 80 142 C92 132 106 128 118 128 Z',
    [112, 132, 62, 186],
  );
  flip('M232 132 C250 150 268 160 288 164 C290 152 280 138 262 126 Z', [236, 130, 284, 160]);
  flip('M236 78 C256 66 276 62 292 64 C290 76 276 88 256 94 Z', [238, 80, 288, 68]);
  const head = P2('M96 92 C78 80 54 82 40 98 C36 110 44 122 60 126 C76 128 90 122 98 112 Z');
  P.raise(head, { level: level * 0.9, margin: 3, edge: DK });
  P.fill(
    head,
    P.grad(40, 90, 96, 124, [
      [0, '#8aa870'],
      [1, '#4a6f4c'],
    ]),
  );
  P.within(head, () => {
    for (let i = 0; i < 12; i++) {
      const s = P.ellipse(48 + P.R() * 44, 90 + P.R() * 32, 6, 5, P.R() * 3);
      P.fill(s, 'rgba(26,56,38,0.6)');
      P.stroke(s, '#d6e6ba', 0.9, 0.6);
    }
  });
  const eye = P.ellipse(56, 100, 4.4, 4.4);
  P.fill(eye, '#0f1512');
  P.fill(P.ellipse(54.8, 98.8, 1.2, 1.2), '#fff');
  const shell = P2(
    'M92 104 C96 62 140 40 186 44 C226 48 250 76 248 106 C246 136 214 160 170 160 C128 160 94 140 92 104 Z',
  );
  P.raise(shell, { level, margin: 3.6, edge: DK });
  P.fill(
    shell,
    P.rgrad(160, 84, 10, 110, [
      [0, '#b9955a'],
      [0.5, '#7d6a3e'],
      [1, '#3f4a2c'],
    ]),
  );
  P.within(shell, () => {
    P.blob(150, 70, 60, 20, '#e4cf92', 0.6, -0.15);
  });
  const sc = [
    [
      [128, 62],
      [156, 52],
      [184, 60],
      [180, 92],
      [150, 98],
      [124, 88],
    ],
    [
      [184, 60],
      [214, 62],
      [236, 84],
      [222, 108],
      [190, 112],
      [180, 92],
    ],
    [
      [124, 88],
      [150, 98],
      [180, 92],
      [190, 112],
      [176, 140],
      [142, 142],
      [116, 124],
    ],
    [
      [190, 112],
      [222, 108],
      [236, 122],
      [214, 146],
      [176, 140],
    ],
  ];
  for (const s of sc) {
    const p = P.poly(s);
    P.stroke(p, '#2c3320', 2.2, 0.85);
    P.carve(p, 2.4, -0.5);
    const cx = s.reduce((a, q) => a + q[0], 0) / s.length,
      cy = s.reduce((a, q) => a + q[1], 0) / s.length;
    for (const q of s) P.liner([[cx, cy], q], 1.6, 0.6, '#d9c283', { alpha: 0.4 });
  }
  P.stroke(shell, '#d7c48c', 1.6, 0.5);
}

// ---------------------------------------------------------------- spiny lobster, facing up; box x 0..160, y 0..260
export function lobster(P, { level = 0.82 } = {}) {
  const DK = '#3a130c',
    A = '#c8502c',
    B = '#8a2c18',
    C = '#f0a35c';
  for (const s of [-1, 1]) {
    P.liner(
      [
        [80 + s * 10, 70],
        [80 + s * 40, 20],
        [80 + s * 62, -40],
        [80 + s * 70, -110],
      ],
      7,
      1.5,
      B,
      { taper: 0, groove: 0.4 },
    );
    P.liner(
      [
        [80 + s * 10, 70],
        [80 + s * 40, 20],
        [80 + s * 62, -40],
        [80 + s * 70, -110],
      ],
      2.4,
      0.8,
      C,
      { alpha: 0.7 },
    );
    for (let i = 0; i < 5; i++) {
      const y = 96 + i * 17;
      const leg = P.linerPath(
        [
          [80 + s * 20, y],
          [80 + s * 56, y - 8 + i * 5],
          [80 + s * 72, y + 14 + i * 6],
        ],
        6,
        2.5,
        { taper: 0 },
      );
      P.raise(leg, { level: level * 0.55, margin: 2, edge: DK });
      P.fill(leg, i % 2 ? A : B);
    }
  }
  const body = P2(
    'M52 80 C52 54 66 44 80 44 C94 44 108 54 108 80 L106 132 C104 140 56 140 54 132 Z',
  );
  P.raise(body, { level, margin: 3.2, edge: DK });
  P.fill(
    body,
    P.grad(52, 0, 108, 0, [
      [0, B],
      [0.45, A],
      [0.6, C],
      [1, B],
    ]),
  );
  P.within(body, () => {
    for (let i = 0; i < 40; i++) {
      const d = P.ellipse(56 + P.R() * 48, 50 + P.R() * 84, 2.2, 2.2);
      P.fill(d, P.R() < 0.5 ? '#f6d08a' : '#5e1a10');
      P.carveFill(d, 0.35);
    }
  });
  for (let i = 0; i < 6; i++) {
    const y = 134 + i * 15,
      w = 26 - i * 2;
    const seg = P2(
      `M${80 - w} ${y} C${80 - w} ${y - 8} ${80 + w} ${y - 8} ${80 + w} ${y} L${80 + w - 2} ${y + 15} C${80 + w - 2} ${y + 9} ${80 - w + 2} ${y + 9} ${80 - w + 2} ${y + 15} Z`,
    );
    P.raise(seg, { level: level * (0.95 - i * 0.03), margin: 2.6, edge: DK });
    P.fill(
      seg,
      P.grad(80 - w, 0, 80 + w, 0, [
        [0, B],
        [0.5, i % 2 ? C : A],
        [1, B],
      ]),
    );
    P.carve(seg, 1.6, -0.4);
  }
  for (let i = -2; i <= 2; i++) {
    P.save();
    P.translate(80, 226);
    P.rotate(i * 0.42);
    const fanp = P2('M-9 0 C-12 16 -10 30 0 36 C10 30 12 16 9 0 Z');
    P.raise(fanp, { level: level * 0.7, margin: 2, edge: DK });
    P.fill(
      fanp,
      P.grad(0, 0, 0, 36, [
        [0, A],
        [1, C],
      ]),
    );
    P.liner(
      [
        [0, 2],
        [0, 32],
      ],
      1.2,
      0.6,
      B,
      { alpha: 0.7, groove: -0.3 },
    );
    P.restore();
  }
  for (const s of [-1, 1]) {
    const e = P.ellipse(80 + s * 12, 50, 4.5, 4.5);
    P.fill(e, '#151010');
    P.fill(P.ellipse(80 + s * 12 - 1, 49, 1.2, 1.2), '#fff');
  }
}

// ---------------------------------------------------------------- coconut palm silhouette painting; trunk base at the origin, height h
export function palmTree(P, { h = 240, lean = 0.18, level = 0.6, cls = 'back' } = {}) {
  const DK = '#1c1a12',
    top = [h * lean, -h];
  const trunk = P.linerPath(
    [[0, 0], [h * lean * 0.2, -h * 0.35], [h * lean * 0.6, -h * 0.7], top],
    h * 0.085,
    h * 0.05,
    { taper: 0 },
  );
  P.raise(trunk, { level, cls, margin: 2.4, edge: DK });
  P.fill(
    trunk,
    P.grad(-10, 0, 14, 0, [
      [0, '#8f7350'],
      [0.5, '#b89a6c'],
      [1, '#6a5238'],
    ]),
  );
  for (let i = 1; i < 22; i++) {
    const t = i / 22,
      x = h * lean * t * t * 0.9 + h * lean * 0.1 * t,
      y = -h * t;
    P.liner(
      [
        [x - h * 0.04, y + 2],
        [x + h * 0.04, y - 1],
      ],
      1.4,
      1.2,
      '#4c3a26',
      { alpha: 0.6, groove: -0.3 },
    );
  }
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + (i - 5) * 0.52 + P.R.gauss() * 0.06,
      L = h * (0.44 + 0.1 * P.R()),
      droop = 0.55 + Math.abs(i - 5) * 0.09;
    const pts = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      pts.push([
        top[0] + Math.cos(a) * L * t,
        top[1] + Math.sin(a) * L * t + droop * L * t * t * 0.62,
      ]);
    }
    const fr = P.linerPath(pts, h * 0.11, h * 0.012, { taper: 0.12 });
    P.raise(fr, { level: level * 0.95, cls, margin: 2, edge: '#0f2417' });
    P.fill(fr, i % 2 ? '#2f7a45' : '#3f9552');
    for (let s = 1; s < 8; s++) {
      const [x, y] = pts[s],
        [x2, y2] = pts[s + 1] || pts[s],
        dx = x2 - x,
        dy = y2 - y,
        l = Math.hypot(dx, dy) || 1,
        w = h * 0.05 * (1 - s / 9);
      P.liner(
        [
          [x - (dy / l) * w, y + (dx / l) * w],
          [x + dx * 0.5, y + dy * 0.5],
        ],
        1.2,
        0.5,
        '#123a22',
        { alpha: 0.6, groove: -0.25 },
      );
      P.liner(
        [
          [x + (dy / l) * w, y - (dx / l) * w],
          [x + dx * 0.5, y + dy * 0.5],
        ],
        1.2,
        0.5,
        '#8ed07c',
        { alpha: 0.55 },
      );
    }
    P.liner(pts, 1.6, 0.6, '#b9e09a', { alpha: 0.6 });
  }
  for (const [dx, dy] of [
    [-6, 8],
    [5, 10],
    [0, 16],
  ]) {
    const n = P.ellipse(top[0] + dx, top[1] + dy, h * 0.034, h * 0.04);
    P.raise(n, { level: level * 1.05, cls, margin: 1.5, edge: DK });
    P.fill(
      n,
      P.rgrad(top[0] + dx - 2, top[1] + dy - 2, 1, h * 0.04, [
        [0, '#c9a25c'],
        [1, '#6e5127'],
      ]),
    );
  }
}

// ---------------------------------------------------------------- sailfish leaping, facing right; box x 0..420, y -70..150
export function sailfish(P, { level = 0.86 } = {}) {
  const DK = '#081c2e';
  const sail = P2(
    'M300 44 C290 -10 262 -58 214 -68 C222 -40 206 -30 194 -50 C192 -26 176 -22 166 -40 C164 -14 148 -8 138 -24 C136 0 118 8 108 -4 C110 18 100 30 92 36 Z',
  );
  P.raise(sail, { level: level * 0.7, margin: 3, edge: DK });
  P.fill(
    sail,
    P.grad(200, -60, 200, 44, [
      [0, '#1b3f8f'],
      [0.6, '#2d5fb8'],
      [1, '#17346f'],
    ]),
  );
  P.within(sail, () => {
    for (let i = 0; i < 30; i++) {
      const d = P.ellipse(110 + P.R() * 180, -50 + P.R() * 86, 3 + P.R() * 3, 3 + P.R() * 3);
      P.fill(d, 'rgba(8,20,54,0.6)');
    }
  });
  for (let i = 0; i < 12; i++) {
    const x = 104 + i * 17;
    P.liner(
      [
        [x, 40],
        [x + 14 - i * 1.8, -8 - Math.sin((i / 11) * Math.PI) * 44],
      ],
      1.8,
      0.8,
      '#8fb4f0',
      { alpha: 0.6, groove: -0.3 },
    );
  }
  const tail = P2(
    'M54 60 C30 40 14 12 6 -22 C30 4 44 30 60 44 C48 64 30 96 4 130 C32 110 50 92 62 76 Z',
  );
  P.raise(tail, { level: level * 0.7, margin: 3, edge: DK });
  P.fill(
    tail,
    P.grad(60, 60, 6, 60, [
      [0, '#3a5f9a'],
      [1, '#132a55'],
    ]),
  );
  const body = P2(
    'M420 34 L340 52 C300 34 220 34 150 44 C110 50 80 54 56 58 L58 72 C100 84 180 104 260 100 C310 96 334 80 346 64 Z',
  );
  P.raise(body, { level, margin: 3.4, edge: DK });
  P.fill(
    body,
    P.grad(0, 36, 0, 104, [
      [0, '#152f6b'],
      [0.3, '#2b57a8'],
      [0.52, '#b7c8de'],
      [0.8, '#f3f5f2'],
      [1, '#c4ccd2'],
    ]),
  );
  P.within(body, () => {
    P.blob(220, 70, 120, 9, '#ffffff', 0.75);
    for (let i = 0; i < 9; i++) {
      P.c.fillStyle = 'rgba(126,170,236,0.4)';
      P.c.fillRect(110 + i * 24, 40, 5, 60);
    }
  });
  P.bristles(body, {
    box: [56, 34, 420, 104],
    n: 160,
    len: [14, 40],
    w: [2, 4.5],
    colors: ['#dfe7ef', '#8fb0e0', '#f7f8f4', '#3d68b4'],
    alpha: [0.1, 0.24],
    dir: 0.02,
    ridge: 0.04,
  });
  const eye = P.ellipse(322, 54, 6, 6);
  P.fill(eye, '#e8c868');
  P.fill(P.ellipse(322.6, 54.4, 3.4, 3.4), '#0b1320');
  P.stroke(eye, DK, 1.2);
  P.fill(P.ellipse(321, 52.6, 1.1, 1.1), '#fff');
  P.liner(
    [
      [344, 60],
      [330, 66],
      [312, 66],
    ],
    1.8,
    1,
    DK,
    { alpha: 0.8, groove: -0.4 },
  );
  P.liner(
    [
      [300, 78],
      [262, 124],
      [250, 150],
    ],
    6,
    1.2,
    '#1c3c7a',
    { taper: 0, groove: 0.3 },
  );
  P.liner(
    [
      [196, 100],
      [176, 122],
    ],
    7,
    1.5,
    '#1c3c7a',
    { taper: 0, groove: 0.3 },
  );
}

// ---------------------------------------------------------------- compass rose / anchor / key-lime slice: small emblems centered at origin, radius r
export function anchor(P, { r = 60, color = '#e9d9a8', level = 0.78 } = {}) {
  const DK = '#10222c',
    k = r / 60;
  P.save();
  P.scale(k);
  const parts = [
    P.linerPath(
      [
        [0, -44],
        [0, 46],
      ],
      9,
      9,
      { taper: 0 },
    ),
    P.linerPath(
      [
        [-24, -26],
        [24, -26],
      ],
      8,
      8,
      { taper: 0 },
    ),
    P.linerPath(
      [
        [-44, 14],
        [-36, 36],
        [-16, 50],
        [0, 52],
        [16, 50],
        [36, 36],
        [44, 14],
      ],
      9,
      9,
      { taper: 0, seg: 8 },
    ),
  ];
  const ring = new Path2D();
  ring.arc(0, -54, 9, 0, 6.3);
  const ringP = new Path2D();
  ringP.arc(0, -54, 12.5, 0, 6.3);
  ringP.arc(0, -54, 5.5, 0, 6.3, true);
  for (const p of [...parts, ringP]) {
    P.raise(p, { level, margin: 2.6, edge: DK });
  }
  for (const p of [...parts, ringP]) {
    P.fill(
      p,
      P.grad(-40, -60, 40, 56, [
        [0, mixHex(color, '#ffffff', 0.4)],
        [1, mixHex(color, '#5a4a20', 0.35)],
      ]),
      'evenodd',
    );
  }
  for (const s of [-1, 1]) {
    const fl = P2(`M${s * 44} 14 L${s * 56} 22 L${s * 40} 30 Z`);
    P.raise(fl, { level, margin: 2.4, edge: DK });
    P.fill(fl, color);
  }
  P.restore();
  void ring;
}
export function limeSlice(P, { r = 50, level = 0.74 } = {}) {
  const DK = '#1f3a12';
  const o = P.ellipse(0, 0, r, r);
  P.raise(o, { level, margin: 2.6, edge: DK });
  P.fill(
    o,
    P.rgrad(0, 0, r * 0.2, r, [
      [0, '#f3f7c4'],
      [0.8, '#dfee9a'],
      [0.9, '#f7f9e6'],
      [1, '#6fae3a'],
    ]),
  );
  for (let i = 0; i < 8; i++) {
    const a0 = (i * Math.PI) / 4 + 0.07,
      a1 = ((i + 1) * Math.PI) / 4 - 0.07;
    const seg = new Path2D();
    seg.moveTo(Math.cos((a0 + a1) / 2) * r * 0.1, Math.sin((a0 + a1) / 2) * r * 0.1);
    seg.arc(0, 0, r * 0.8, a0, a1);
    seg.closePath();
    P.fill(
      seg,
      P.rgrad(0, 0, r * 0.1, r * 0.8, [
        [0, '#d4e87a'],
        [1, '#a9cf52'],
      ]),
    );
    P.carveFill(seg, -0.2);
    P.within(seg, () => {
      for (let j = 0; j < 6; j++)
        P.blob(
          Math.cos((a0 + a1) / 2) * r * (0.3 + 0.08 * j),
          Math.sin((a0 + a1) / 2) * r * (0.3 + 0.08 * j),
          r * 0.07,
          r * 0.03,
          '#f4fbd0',
          0.6,
          (a0 + a1) / 2,
        );
    });
  }
  P.stroke(o, '#4f8a26', r * 0.07, 0.9);
  P.material(o, 'paint');
}

// ---------------------------------------------------------------- gold / painted lettering with shadow, outline and carved face
// opts: { style, align, arc, fill: 'gold' | color | gradient stops [[o, c]...], outline, outline2, shadow, level, ridge, tracking }
export function carvedText(
  P,
  text,
  x,
  y,
  cap,
  {
    style = 'roman',
    align = 'center',
    arc = null,
    fill = 'gold',
    outline = EDGE,
    outline2 = null,
    shadow = 0.5,
    level = 0.92,
    ridge = null,
    tracking = 1,
    outlineW = 0.05,
    island = 0,
  } = {},
) {
  const o = { style, align, arc, tracking };
  const base = penPath(text, x, y, cap, o);
  if (shadow) {
    const sh = penPath(text, x + cap * 0.05, y + cap * 0.065, cap, {
      ...o,
      grow: cap * outlineW * 0.8,
    });
    P.fill(sh.path, `rgba(5,22,32,${shadow})`);
  }
  if (outline) {
    const ol = penPath(text, x, y, cap, { ...o, grow: cap * outlineW });
    P.fill(ol.path, outline);
    if (island) {
      P.back.fillStyle = `rgb(${(island * 255) | 0},${(island * 255) | 0},${(island * 255) | 0})`;
      P.back.fill(ol.path, 'nonzero');
      P.d.fillStyle = '#808080';
      P.d.fill(ol.path, 'nonzero');
    }
  }
  if (outline2) {
    const ol2 = penPath(text, x, y, cap, { ...o, grow: cap * outlineW * 0.4 });
    P.fill(ol2.path, outline2);
  }
  const top = y - cap * 1.05,
    bot = y + cap * 0.3;
  if (fill === 'gold') {
    P.fill(
      base.path,
      P.grad(0, top, 0, bot, [
        [0, '#fbe38a'],
        [0.3, '#f0c04a'],
        [0.62, '#dba330'],
        [1, '#b87a1c'],
      ]),
    );
    P.within(base.path, (c) => {
      // squares of leaf laid slightly unevenly, with burnish strokes
      const s = Math.max(14, cap * 0.16),
        bx0 = base.x0 - cap,
        bx1 = base.x0 + base.width + cap;
      if (!arc)
        for (let yy = top - s; yy < bot + s; yy += s)
          for (let xx = bx0; xx < bx1; xx += s) {
            const v = P.R();
            c.fillStyle =
              v < 0.5
                ? `rgba(255,246,190,${0.05 + v * 0.16})`
                : `rgba(120,70,10,${(v - 0.5) * 0.2})`;
            c.fillRect(xx + P.R() * 3, yy + P.R() * 3, s, s);
            c.fillStyle = 'rgba(110,62,10,0.16)';
            c.fillRect(xx, yy, s, 0.6);
            c.fillRect(xx, yy, 0.6, s);
          }
    });
    if (!arc)
      P.bristles(base.path, {
        box: [base.x0 - 10, top, base.x0 + base.width + 10, bot],
        n: Math.round((base.width * cap) / 260),
        len: [cap * 0.1, cap * 0.4],
        w: [1.5, 4.5],
        colors: ['#fff0a8', '#d39a26', '#f7d463', '#c58a1e'],
        alpha: [0.08, 0.2],
        dir: 0,
        jit: 0.08,
        ridge: 0.02,
      });
    P.material(base.path, 'gold');
  } else {
    P.fill(base.path, Array.isArray(fill) ? P.grad(0, top, 0, bot, fill) : fill);
  }
  P.raiseLetters(base.path, { level, ridge: ridge ?? cap * 0.075 });
  return base;
}

// ---------------------------------------------------------------- swallow-tailed ribbon banner centered at (cx, y) (top of the band)
export function ribbon(
  P,
  cx,
  y,
  halfW,
  h,
  {
    arch = 14,
    color = '#e2553c',
    dark = '#a23526',
    darker = '#6e2018',
    level = 0.62,
    tail = 78,
  } = {},
) {
  const x0 = cx - halfW,
    x1 = cx + halfW,
    DK = '#3a120c';
  for (const s of [-1, 1]) {
    const xe = s < 0 ? x0 : x1,
      t = P.poly([
        [xe - s * 20, y + 16],
        [xe + s * tail, y + 20],
        [xe + s * (tail - 24), y + 16 + h / 2],
        [xe + s * tail, y + 14 + h],
        [xe - s * 20, y + 16 + h],
      ]);
    P.raise(t, { level: level * 0.62, cls: 'back', margin: 3, edge: DK });
    P.fill(
      t,
      P.grad(xe, 0, xe + s * tail, 0, [
        [0, dark],
        [1, mixHex(color, dark, 0.35)],
      ]),
    );
    P.bristles(t, {
      box: [Math.min(xe - 20, xe + s * tail), y + 10, Math.max(xe + 20, xe + s * tail), y + 20 + h],
      n: 30,
      len: [12, 30],
      w: [2, 5],
      colors: [dark, color, darker],
      alpha: [0.15, 0.3],
      dir: 0.03,
      ridge: 0.05,
    });
    const fold = P.poly([
      [xe, y + h],
      [xe - s * 20, y + 16 + h],
      [xe - s * 20, y + 16],
    ]);
    P.raise(fold, { level: level * 0.45, cls: 'back', margin: 2, edge: DK });
    P.fill(fold, darker);
  }
  const band = new Path2D();
  band.moveTo(x0, y);
  band.quadraticCurveTo(cx, y - arch * 2, x1, y);
  band.lineTo(x1, y + h);
  band.quadraticCurveTo(cx, y + h - arch * 2, x0, y + h);
  band.closePath();
  P.raise(band, { level, cls: 'back', margin: 3.2, edge: DK });
  P.fill(
    band,
    P.grad(0, y - arch, 0, y + h, [
      [0, mixHex(color, '#ffffff', 0.18)],
      [0.5, color],
      [1, mixHex(color, dark, 0.6)],
    ]),
  );
  P.within(band, () => {
    P.blob(cx - halfW * 0.55, y + h * 0.2, halfW * 0.3, h * 0.25, '#ffb7a0', 0.5);
    P.blob(cx + halfW * 0.5, y + h * 0.75, halfW * 0.4, h * 0.2, darker, 0.4);
  });
  P.bristles(band, {
    box: [x0, y - arch, x1, y + h],
    n: Math.round(halfW * 0.5),
    len: [20, 60],
    w: [2.5, 6],
    colors: [color, dark, mixHex(color, '#ffffff', 0.25)],
    alpha: [0.1, 0.26],
    dir: 0,
    jit: 0.06,
    ridge: 0.05,
  });
  const pin = new Path2D();
  pin.moveTo(x0 + 8, y + 7);
  pin.quadraticCurveTo(cx, y + 7 - arch * 2, x1 - 8, y + 7);
  P.stroke(pin, '#ffd9a8', 1.6, 0.75);
  const pin2 = new Path2D();
  pin2.moveTo(x0 + 8, y + h - 7);
  pin2.quadraticCurveTo(cx, y + h - 7 - arch * 2, x1 - 8, y + h - 7);
  P.stroke(pin2, '#ffd9a8', 1.6, 0.75);
  // baseline arc for text on the band
  const r = (halfW * halfW + arch * arch) / (2 * arch);
  return { arc: { cx, cy: y - arch + r, r, dir: 1 }, band };
}

// brass screw with a weather streak below it
export function screw(P, x, y, r = 4.5, streak = 70) {
  const g = P.c.createLinearGradient(0, y, 0, y + streak);
  g.addColorStop(0, 'rgba(92,52,24,0.42)');
  g.addColorStop(1, 'rgba(92,52,24,0)');
  P.c.fillStyle = g;
  P.c.beginPath();
  P.c.moveTo(x - r * 0.8, y);
  P.c.lineTo(x + r * 0.8, y);
  P.c.lineTo(x + r * 0.35 + P.R.gauss() * 2, y + streak);
  P.c.lineTo(x - r * 0.3, y + streak * 0.9);
  P.c.fill();
  const h = P.ellipse(x, y, r, r);
  P.fill(
    h,
    P.rgrad(x - 1, y - 1, 0.5, r, [
      [0, '#d7c08a'],
      [0.6, '#8e7740'],
      [1, '#4a3a1e'],
    ]),
  );
  P.stroke(h, '#2a1e10', 0.9, 0.8);
  P.carveFill(h, 0.45);
  P.material(h, 'bare');
  P.liner(
    [
      [x - r * 0.6, y - r * 0.5],
      [x + r * 0.6, y + r * 0.5],
    ],
    1.1,
    1.1,
    '#2e2414',
    { groove: -0.5, taper: 0 },
  );
}

// bird dropping with drips
export function dropping(P, x, y, s = 1) {
  const R = P.R,
    pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283,
      r = (7 + R() * 7) * s;
    pts.push([x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 0.8]);
  }
  const sp = P.smoothPath(pts, true, 5);
  P.fill(sp, 'rgba(238,236,226,0.95)');
  P.carveFill(sp, 0.22);
  P.within(sp, () => {
    P.blob(x + 1, y + 1, 5 * s, 3.4 * s, '#6f745e', 0.7);
  });
  const n = 1 + ((R() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const dx = (R() - 0.5) * 12 * s,
      L = (26 + R() * 110) * s;
    P.liner(
      [
        [x + dx, y + 2],
        [x + dx + R.gauss() * 2, y + L * 0.5],
        [x + dx + R.gauss() * 3, y + L],
      ],
      5.5 * s,
      1.2 * s,
      '#e9e7dd',
      { alpha: 0.82, taper: 0.1, groove: 0.12 },
    );
  }
  for (let i = 0; i < 5; i++)
    P.fill(
      P.ellipse(x + R.gauss() * 16 * s, y + R.gauss() * 9 * s, 1.6 * s, 1.3 * s),
      'rgba(236,234,224,0.85)',
    );
}
export { jitter };

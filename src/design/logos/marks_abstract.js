// Mark library, part 4: abstract and geometric symbols (deco, tech, corporate). 100 x 100 unit box. See marks.js.
import { def, F, FE, S, O, OS, EL, RR, rep, clipTo, TAU } from './marks.js';

def('pinwheel', (g, c, o) => {
  rep(g, o.n || 6, 50, 50, (i) => F(g, i % 2 ? c.b : c.a, 'M50 50 V5 A45 45 0 0 1 82 18 Z'));
});
def('petals', (g, c, o) => {
  rep(g, o.n || 6, 50, 50, (i) => EL(g, i % 2 ? c.b : c.a, 50, 26, 11, 24));
});
def('rings', (g, c) => {
  OS(g, c.a, 7, 34, 50, 24);
  OS(g, c.b, 7, 66, 50, 24);
});
def('rings3', (g, c) => {
  OS(g, c.a, 6, 50, 34, 22);
  OS(g, c.b, 6, 34, 62, 22);
  OS(g, c.c, 6, 66, 62, 22);
});
def('hexes', (g, c) => {
  const h = (x, y, col) => {
    let d = '';
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      d +=
        (i ? 'L' : 'M') +
        (x + Math.cos(a) * 21).toFixed(1) +
        ' ' +
        (y + Math.sin(a) * 21).toFixed(1);
    }
    F(g, col, d + 'Z');
  };
  h(50, 27, c.a);
  h(30, 62, c.b);
  h(70, 62, c.c);
});
def('hex', (g, c) => {
  FE(g, c.a, 'M50 4 L90 27 V73 L50 96 L10 73 V27 Z M50 26 L29 38 V62 L50 74 L71 62 V38 Z');
});
def('tri', (g, c) => {
  F(g, c.a, 'M50 6 L96 90 H4 Z');
  F(g, c.paper, 'M50 36 L74 80 H26 Z');
  F(g, c.b, 'M50 54 L62 76 H38 Z');
});
def('delta', (g, c) => {
  FE(g, c.a, 'M50 4 L98 92 H2 Z M50 34 L28 76 H72 Z');
});
def('quad', (g, c) => {
  RR(g, c.a, 8, 8, 38, 38, 8);
  RR(g, c.a, 54, 54, 38, 38, 8);
  RR(g, c.b, 54, 8, 38, 38, 8);
  RR(g, c.c, 8, 54, 38, 38, 8);
});
def('quarters', (g, c) => {
  F(g, c.a, 'M8 48 A40 40 0 0 1 48 8 V48 Z');
  F(g, c.b, 'M52 8 H92 V48 A40 40 0 0 1 52 8 Z');
  F(g, c.c, 'M8 52 H48 V92 A40 40 0 0 1 8 52 Z');
  F(g, c.a, 'M52 52 H92 A40 40 0 0 1 52 92 Z');
});
def('halfdisc', (g, c) => {
  F(g, c.a, 'M10 46 A40 40 0 0 1 90 46 Z');
  F(g, c.b, 'M10 54 H90 A40 40 0 0 1 10 54 Z');
});
def('arcs', (g, c) => {
  for (let i = 0; i < 4; i++) OS(g, i % 2 ? c.b : c.a, 8, 10, 90, 20 + i * 20, -Math.PI / 2, 0);
});
def('rainbow', (g, c) => {
  [c.a, c.b, c.c].forEach((col, i) => OS(g, col, 10, 50, 78, 42 - i * 13, Math.PI, TAU));
});
def('spiral', (g, c) => {
  let d = 'M50 50';
  for (let i = 1; i <= 90; i++) {
    const a = i * 0.21,
      r = i * 0.5;
    d += ` L${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`;
  }
  S(g, c.a, 6, d);
});
def('loop', (g, c) => {
  S(
    g,
    c.a,
    10,
    'M50 50 C38 28 10 30 10 50 C10 70 38 72 50 50 C62 28 90 30 90 50 C90 70 62 72 50 50 Z',
  );
});
def('orbitring', (g, c) => {
  O(g, c.a, 50, 50, 26);
  g.save();
  g.translate(50, 50);
  g.rotate(-0.45);
  g.strokeStyle = c.b;
  g.lineWidth = 6;
  g.beginPath();
  g.ellipse(0, 0, 47, 15, 0, 0.35, Math.PI - 0.35, true);
  g.stroke();
  g.restore();
});
def('zig', (g, c) => {
  S(g, c.a, 10, 'M6 66 L28 34 L50 66 L72 34 L94 66', 'butt');
});
def('peaks', (g, c) => {
  F(g, c.a, 'M4 60 L50 14 L96 60 H78 L50 34 L22 60 Z');
  F(g, c.b, 'M4 90 L50 44 L96 90 H78 L50 64 L22 90 Z');
});
def('checker', (g, c) => {
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++)
      if ((x + y) % 2 === 0)
        RR(g, x === 1 && y === 1 ? c.b : c.a, 8 + x * 29, 8 + y * 29, 26, 26, 3);
});
def('dots', (g, c) => {
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++)
      O(g, (x + y) % 2 ? c.b : c.a, 20 + x * 30, 20 + y * 30, 6 + ((x * 2 + y) % 3) * 3);
});
def('target', (g, c) => {
  OS(g, c.a, 9, 50, 50, 40);
  OS(g, c.b, 9, 50, 50, 22);
  O(g, c.a, 50, 50, 8);
});
def('slash', (g, c) => {
  F(g, c.a, 'M30 8 H58 L34 92 H6 Z');
  F(g, c.b, 'M66 8 H94 L70 92 H42 Z');
});
def('cube', (g, c) => {
  F(g, c.a, 'M50 6 L90 28 L50 50 L10 28 Z');
  F(g, c.b, 'M10 34 L46 54 V96 L10 76 Z');
  F(g, c.c, 'M90 34 L54 54 V96 L90 76 Z');
});
def('stripesdisc', (g, c) => {
  clipTo(g, 'M50 5 A45 45 0 1 0 50 95 A45 45 0 1 0 50 5 Z', () => {
    for (let i = 0; i < 7; i++)
      F(
        g,
        i % 2 ? c.b : c.a,
        `M${-40 + i * 22} 100 L${10 + i * 22} 0 H${32 + i * 22} L${-18 + i * 22} 100 Z`,
      );
  });
});
def('bloom', (g, c) => {
  g.globalAlpha = 0.85;
  O(g, c.a, 50, 34, 26);
  O(g, c.b, 34, 62, 26);
  O(g, c.c, 66, 62, 26);
  g.globalAlpha = 1;
});
def('tile', (g, c) => {
  rep(g, 4, 50, 50, () => {
    F(g, c.a, 'M50 50 C36 40 36 20 50 6 C64 20 64 40 50 50 Z');
    F(g, c.b, 'M6 6 H30 L6 30 Z');
  });
  O(g, c.c, 50, 50, 7);
});
def('fan', (g, c) => {
  for (let i = 0; i < 7; i++) {
    const a0 = Math.PI + (i / 7) * Math.PI,
      a1 = Math.PI + ((i + 1) / 7) * Math.PI;
    F(
      g,
      i % 2 ? c.b : c.a,
      `M50 88 L${50 + Math.cos(a0) * 46} ${88 + Math.sin(a0) * 76} A46 76 0 0 1 ${50 + Math.cos(a1) * 46} ${88 + Math.sin(a1) * 76} Z`,
    );
  }
  O(g, c.c, 50, 88, 8);
});
def('ziggurat', (g, c) => {
  F(g, c.a, 'M42 6 H58 V22 H70 V40 H82 V60 H94 V94 H6 V60 H18 V40 H30 V22 H42 Z');
  S(g, c.paper, 2.4, 'M50 10 V94 M38 28 V94 M62 28 V94 M26 46 V94 M74 46 V94', 'butt');
});
def('decosun', (g, c) => {
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + ((i + 0.5) / 9) * Math.PI,
      w = 0.1;
    F(
      g,
      i % 2 ? c.b : c.a,
      `M50 92 L${50 + Math.cos(a - w) * 80} ${92 + Math.sin(a - w) * 80} L${50 + Math.cos(a + w) * 80} ${92 + Math.sin(a + w) * 80} Z`,
    );
  }
  F(g, c.a, 'M26 92 A24 24 0 0 1 74 92 Z');
});
def('keystone', (g, c) => {
  F(g, c.a, 'M24 10 H76 L66 90 H34 Z');
  F(g, c.b, 'M2 22 H18 L28 90 H12 Z M98 22 H82 L72 90 H88 Z');
});
def('swoop', (g, c) => {
  F(g, c.a, 'M6 70 C30 20 70 10 94 30 C70 24 44 40 30 78 Z');
  F(g, c.b, 'M40 86 C54 58 76 46 94 48 C78 56 66 70 60 90 Z');
});
def('knot', (g, c) => {
  rep(g, 3, 50, 54, () => OS(g, c.a, 7, 50, 34, 22, Math.PI * 0.75, Math.PI * 2.25));
});
def('infinitybar', (g, c) => {
  RR(g, c.a, 8, 20, 84, 16, 8);
  RR(g, c.b, 8, 42, 60, 16, 8);
  RR(g, c.c, 8, 64, 36, 16, 8);
});
def('pulseline', (g, c) => {
  S(g, c.a, 7, 'M4 54 H28 L38 24 L52 82 L62 42 L68 54 H96');
});
def('leafdrop', (g, c) => {
  F(g, c.a, 'M50 4 C54 26 82 44 82 66 A32 32 0 0 1 18 66 C18 44 46 26 50 4 Z');
  F(g, c.b, 'M50 90 C36 78 36 60 50 44 C64 60 64 78 50 90 Z');
});
def('yinwave', (g, c) => {
  O(g, c.a, 50, 50, 45);
  F(g, c.b, 'M5 50 A45 45 0 0 0 95 50 C80 34 64 34 50 50 C36 66 20 66 5 50 Z');
});
def('window4', (g, c) => {
  RR(g, c.a, 10, 10, 37, 37, 3);
  RR(g, c.b, 53, 10, 37, 37, 3);
  RR(g, c.b, 10, 53, 37, 37, 3);
  RR(g, c.a, 53, 53, 37, 37, 3);
});
def('plusdots', (g, c) => {
  F(g, c.a, 'M40 22 H60 V40 H78 V60 H60 V78 H40 V60 H22 V40 H40 Z');
  for (const [x, y] of [
    [14, 14],
    [86, 14],
    [14, 86],
    [86, 86],
  ])
    O(g, c.b, x, y, 8);
});
def('rays', (g, c) => {
  rep(g, 16, 50, 50, (i) => S(g, i % 2 ? c.b : c.a, 5, i % 2 ? 'M50 22 V10' : 'M50 28 V4', 'butt'));
  O(g, c.a, 50, 50, 12);
});

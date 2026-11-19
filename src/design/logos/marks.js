// Mark library: every symbol is drawn in code in a 100 x 100 unit box (SVG path strings and arcs), so it scales to any
// size. Brands reference a mark by name with options; label art, menus and signs reuse the same symbols as icons.
//
//   drawMark(g, size, P, 'marlin')                                   // palette defaults: a = primary, b = secondary, c = accent
//   drawMark(g, size, P, ['palm', { on: 'disc', onc: 'primary' }])   // on a backing shape (the mark then defaults to paper)
//   drawMark(g, size, P, ['mono', { t: 'VC', f: 'didone', style: 'overlap' }])
// Options common to every mark: a, b, c (palette keys or hex), on ('disc' | 'round' | 'square' | 'hex' | 'shield' | 'diamond' |
// 'oct' | 'arch' | 'oval' | 'burst' | 'scallop' | 'tile'), onc (backing color), ring (outline color), k (inner scale), rot, flip, dx, dy.
import { font } from '../fonts.js';
import { containerPath, col } from './engine.js';

export const MARKS = {};
export const TAU = Math.PI * 2;
export const def = (name, fn) => {
  MARKS[name] = fn;
};
// ---- tiny drawing vocabulary (100-unit space)
export const F = (g, c, d) => {
  g.fillStyle = c;
  g.fill(new Path2D(d));
};
export const FE = (g, c, d) => {
  g.fillStyle = c;
  g.fill(new Path2D(d), 'evenodd');
};
export const S = (g, c, w, d, cap = 'round') => {
  g.strokeStyle = c;
  g.lineWidth = w;
  g.lineCap = cap;
  g.lineJoin = cap === 'butt' ? 'miter' : 'round';
  g.stroke(new Path2D(d));
};
export const O = (g, c, x, y, r) => {
  g.fillStyle = c;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
};
export const OS = (g, c, w, x, y, r, a0 = 0, a1 = TAU) => {
  g.strokeStyle = c;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y, r, a0, a1);
  g.stroke();
};
export const EL = (g, c, x, y, rx, ry, rot = 0) => {
  g.fillStyle = c;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.fill();
};
export const RR = (g, c, x, y, w, h, r = 0) => {
  g.fillStyle = c;
  g.beginPath();
  if (r) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
  g.fill();
};
export const rep = (g, n, cx, cy, fn) => {
  for (let i = 0; i < n; i++) {
    g.save();
    g.translate(cx, cy);
    g.rotate((i / n) * TAU);
    g.translate(-cx, -cy);
    fn(i);
    g.restore();
  }
};
export const clipTo = (g, d, fn) => {
  g.save();
  g.clip(new Path2D(d));
  fn();
  g.restore();
};
export const TX = (g, c, t, x, y, px, role = 'grotesk', over = {}) => {
  g.fillStyle = c;
  g.font = font(role, px, over);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t, x, y);
};

const BACKINGS = {
  disc: 'circle',
  round: 'round',
  square: 'rect',
  hex: 'hex',
  shield: 'shield',
  diamond: 'diamond',
  oct: 'octagon',
  arch: 'arch',
  oval: 'oval',
  burst: 'burst',
  scallop: 'scallop',
  crest: 'crest',
  deco: 'deco',
};

export function drawMark(g, s, P, spec) {
  if (typeof spec === 'function') return spec(g, s, P);
  const [name, o0] = Array.isArray(spec) ? spec : [spec, {}];
  const o = o0 || {};
  const fn = MARKS[name];
  if (!fn) throw new Error('design: unknown mark "' + name + '"');
  const on = o.on && o.on !== 'none' ? o.on : null;
  const c = {
    a: col(P, o.a || (on ? 'paper' : 'primary')),
    b: col(P, o.b || (on ? 'secondary' : 'secondary')),
    c: col(P, o.c || 'accent'),
    ink: P.ink,
    paper: P.paper,
    P,
  };
  g.save();
  g.scale(s / 100, s / 100);
  if (on) {
    const onc = col(P, o.onc || 'primary');
    if (on === 'tile') {
      RR(g, onc, 2, 2, 96, 96, 18);
    } else {
      containerPath(
        g,
        BACKINGS[on] || 'circle',
        on === 'oval' ? 0 : 2,
        on === 'oval' ? 14 : 2,
        on === 'oval' ? 100 : 96,
        on === 'oval' ? 72 : 96,
        0.2,
      );
      g.fillStyle = onc;
      g.fill();
    }
    if (o.ring) {
      g.strokeStyle = col(P, o.ring);
      g.lineWidth = o.ringW || 3;
      if (on === 'tile') {
        g.beginPath();
        g.roundRect(6.5, 6.5, 87, 87, 14);
      } else
        containerPath(
          g,
          BACKINGS[on] || 'circle',
          on === 'oval' ? 5 : 7,
          on === 'oval' ? 18 : 7,
          on === 'oval' ? 90 : 86,
          on === 'oval' ? 64 : 86,
          0.2,
        );
      g.stroke();
    }
    const k =
      o.k ||
      (on === 'diamond'
        ? 0.46
        : on === 'shield' || on === 'crest'
          ? 0.56
          : on === 'hex'
            ? 0.6
            : on === 'oval'
              ? 0.56
              : 0.64);
    g.translate(
      50 + (o.dx || 0),
      50 + (o.dy || (on === 'shield' || on === 'crest' ? -5 : on === 'arch' ? 4 : 0)),
    );
    g.scale(k, k);
    g.translate(-50, -50);
  } else if (o.k || o.dx || o.dy) {
    g.translate(50 + (o.dx || 0), 50 + (o.dy || 0));
    g.scale(o.k || 1, o.k || 1);
    g.translate(-50, -50);
  }
  if (o.rot) {
    g.translate(50, 50);
    g.rotate(o.rot);
    g.translate(-50, -50);
  }
  if (o.flip) {
    g.translate(100, 0);
    g.scale(-1, 1);
  }
  fn(g, c, o);
  g.restore();
}
export const markNames = () => Object.keys(MARKS);

// ---------------------------------------------------------------- lettermarks
// mono: 1 to 3 letters. style: overlap | stack | side | mirror | slash | split | cut | hollow
def('mono', (g, c, o) => {
  const t = [...String(o.t || 'PS')],
    f = o.f || 'didone',
    px = o.px || (t.length === 1 ? 92 : t.length === 2 ? 70 : 52),
    st = o.style || 'side';
  const base = (ch, x, y, p = px, colr = c.a, over = {}) => {
    g.fillStyle = colr;
    g.font = font(f, p, over);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const m = g.measureText(ch);
    const h = m.actualBoundingBoxAscent;
    g.fillText(ch, x, y + h / 2);
    return m.width;
  };
  if (t.length === 1 || st === 'one') {
    base(t[0], 50, 50);
    return;
  }
  if (st === 'overlap') {
    base(t[0], 38, 44);
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 5;
    g.strokeStyle = '#000';
    g.font = font(f, px);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const h = g.measureText(t[1]).actualBoundingBoxAscent;
    g.strokeText(t[1], 62, 58 + h / 2);
    g.globalCompositeOperation = 'source-over';
    base(t[1], 62, 58, px, c.b === c.a ? c.a : c.b);
  } else if (st === 'stack') {
    base(t[0], 50, 28, px * 0.72);
    base(t[1], 50, 72, px * 0.72, c.b);
    if (t[2]) base(t[2], 50, 50, px * 0.3, c.c);
  } else if (st === 'mirror') {
    g.save();
    g.translate(100, 0);
    g.scale(-1, 1);
    base(t[0], 66, 50);
    g.restore();
    base(t[1] || t[0], 66, 50, px, c.a);
  } else if (st === 'slash') {
    base(t[0], 28, 36, px * 0.78);
    S(g, c.b, 3, 'M68 10 L32 90', 'butt');
    base(t[1], 72, 64, px * 0.78);
  } else if (st === 'split') {
    g.font = font(f, px);
    const w0 = g.measureText(t[0]).width,
      w1 = g.measureText(t[1]).width,
      x0 = 50 - (w0 + w1) / 2;
    base(t[0], x0 + w0 / 2, 50, px, c.a);
    base(t[1], x0 + w0 + w1 / 2, 50, px, c.b);
  } else if (st === 'cut') {
    base(t.join(''), 50, 50, px * (t.length === 2 ? 1 : 0.9));
    g.globalCompositeOperation = 'destination-out';
    S(g, '#000', 3.2, 'M0 58 L100 44', 'butt');
    g.globalCompositeOperation = 'source-over';
  } else if (st === 'hollow') {
    g.font = font(f, px);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.strokeStyle = c.a;
    g.lineWidth = 2.6;
    g.lineJoin = 'round';
    const h = g.measureText('H').actualBoundingBoxAscent;
    g.strokeText(t.join(''), 50, 50 + h / 2);
  } else {
    g.font = font(f, px);
    const ws = t.map((ch) => g.measureText(ch).width);
    let x = 50 - ws.reduce((a, b) => a + b, 0) / 2;
    t.forEach((ch, i) => {
      base(ch, x + ws[i] / 2, 50, px, i % 2 ? (o.two ? c.b : c.a) : c.a);
      x += ws[i];
    });
  }
});
// a word or number set inside the mark box (for "24", "99", "1st" ...)
def('glyph', (g, c, o) => {
  TX(g, c.a, String(o.t || '1'), 50, 52, o.px || 70, o.f || 'groteskBlack');
});

// ---------------------------------------------------------------- sky, water, weather
def('sun', (g, c, o) => {
  O(g, c.a, 50, 50, o.r || 21);
  rep(g, o.n || 12, 50, 50, () => S(g, c.a, o.w || 5, 'M50 6 L50 19'));
});
def('sunface', (g, c) => {
  O(g, c.a, 50, 50, 24);
  rep(g, 12, 50, 50, (i) =>
    F(g, c.a, i % 2 ? 'M45 22 L50 4 L55 22 Z' : 'M46 22 Q54 13 50 2 Q44 12 46 22 Z'),
  );
  O(g, c.b, 41, 46, 3);
  O(g, c.b, 59, 46, 3);
  S(g, c.b, 3, 'M40 57 Q50 66 60 57');
});
def('sunrise', (g, c) => {
  clipTo(g, 'M0 0 H100 V60 H0 Z', () => {
    O(g, c.b, 50, 60, 24);
    rep(g, 16, 50, 60, () => S(g, c.b, 4, 'M50 14 L50 29', 'butt'));
  });
  for (let i = 0; i < 3; i++)
    S(g, c.a, 5, `M${10 + i * 11} ${69 + i * 11} L${90 - i * 11} ${69 + i * 11}`);
});
def('sunset', (g, c) => {
  g.save();
  g.beginPath();
  for (let i = 0; i < 7; i++) g.rect(0, 6 + i * 15 - i * i * 0.6, 100, 13 - i * 1.9);
  g.clip();
  O(g, c.a, 50, 50, 44);
  g.restore();
});
def('horizon', (g, c) => {
  clipTo(g, 'M0 0 H100 V56 H0 Z', () => O(g, c.b, 50, 56, 30));
  F(g, c.a, 'M4 60 H96 V66 H4 Z M12 72 H88 V77 H12 Z M22 83 H78 V87 H22 Z M34 92 H66 V95 H34 Z');
});
def('moon', (g, c) => {
  FE(g, c.a, 'M50 6 A44 44 0 1 0 94 50 A34 34 0 1 1 50 6 Z');
  F(g, c.b, 'M70 18 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z');
});
def('star', (g, c, o) => {
  const n = o.n || 5,
    r = 46,
    q = o.q || 0.42;
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i / (n * 2)) * TAU,
      rr = i % 2 ? r * q : r;
    d +=
      (i ? 'L' : 'M') +
      (50 + Math.cos(a) * rr).toFixed(1) +
      ' ' +
      (52 + Math.sin(a) * rr).toFixed(1);
  }
  F(g, c.a, d + 'Z');
});
def('spark', (g, c) => {
  F(g, c.a, 'M50 2 Q54 42 98 50 Q54 58 50 98 Q46 58 2 50 Q46 42 50 2 Z');
  F(g, c.b, 'M80 8 Q81.5 18 92 20 Q81.5 22 80 32 Q78.5 22 68 20 Q78.5 18 80 8 Z');
});
def('burst', (g, c, o) => {
  const n = o.n || 14;
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU,
      rr = i % 2 ? 36 : 48;
    d +=
      (i ? 'L' : 'M') +
      (50 + Math.cos(a) * rr).toFixed(1) +
      ' ' +
      (50 + Math.sin(a) * rr).toFixed(1);
  }
  F(g, c.a, d + 'Z');
});
def('cloud', (g, c) => {
  F(g, c.a, 'M24 74 A17 17 0 0 1 22 40 A22 22 0 0 1 62 30 A18 18 0 0 1 82 46 A14 14 0 0 1 80 74 Z');
});
def('bolt', (g, c) => {
  F(g, c.a, 'M60 2 L18 56 H44 L34 98 L82 40 H55 Z');
});
def('drop', (g, c) => {
  F(g, c.a, 'M50 4 C54 26 82 44 82 66 A32 32 0 0 1 18 66 C18 44 46 26 50 4 Z');
  S(g, c.b, 5, 'M32 68 A18 18 0 0 0 46 84');
});
def('flame', (g, c) => {
  F(
    g,
    c.a,
    'M50 2 C76 26 88 46 84 66 C80 86 64 96 50 96 C36 96 20 86 16 66 C13 50 26 42 30 24 C38 32 40 38 40 46 C48 36 52 20 50 2 Z',
  );
  F(g, c.b, 'M50 50 C62 62 66 72 62 82 C59 90 54 93 50 93 C44 93 38 88 38 78 C38 68 46 62 50 50 Z');
});
def('waves', (g, c, o) => {
  const n = o.n || 3;
  for (let i = 0; i < n; i++) {
    const y = 50 - (n - 1) * 10 + i * 20;
    S(g, i % 2 ? c.b : c.a, 8, `M6 ${y} Q18 ${y - 13} 30 ${y} T54 ${y} T78 ${y} T94 ${y - 6}`);
  }
});
def('wave', (g, c) => {
  F(
    g,
    c.a,
    'M2 80 C22 80 26 38 54 28 C74 21 92 34 90 52 C89 63 76 67 69 60 C76 58 79 49 72 44 C58 37 44 58 60 80 Z',
  );
  S(g, c.b, 6, 'M4 92 Q20 84 36 92 T68 92 T98 90');
});
def('ripple', (g, c) => {
  for (let i = 0; i < 4; i++)
    OS(g, i % 2 ? c.b : c.a, 5, 50, 96, 16 + i * 17, Math.PI * 1.08, Math.PI * 1.92);
});
def('ridge', (g, c) => {
  F(g, c.b, 'M40 86 L70 30 L98 86 Z');
  F(g, c.a, 'M2 86 L36 18 L52 48 L60 38 L84 86 Z');
  F(g, c.paper, 'M36 18 L46 38 L39 34 L34 42 L28 34 Z');
});
// ---------------------------------------------------------------- plants and fruit
def('palm', (g, c) => {
  F(g, c.a, 'M43 98 C45 72 49 58 57 42 L63 44 C57 60 54 74 54 98 Z');
  for (const [x, y, q, r] of [
    [8, 46, 30, 18],
    [18, 70, 34, 38],
    [36, 8, 44, 18],
    [82, 4, 70, 14],
    [99, 40, 86, 20],
    [94, 70, 86, 42],
  ])
    F(
      g,
      c.b === c.paper ? c.a : c.a,
      `M60 42 Q${q} ${r} ${x} ${y} Q${q * 0.55 + 27} ${r * 0.55 + 27} 60 46 Z`,
    );
  O(g, c.a, 60, 43, 4.5);
});
def('palms', (g, c) => {
  for (const [dx, k] of [
    [-16, 1],
    [22, 0.78],
  ]) {
    g.save();
    g.translate(50 + dx, 98);
    g.scale(k * (dx > 0 ? -1 : 1), k);
    g.translate(-50, -98);
    MARKS.palm(g, c);
    g.restore();
  }
});
def('island', (g, c) => {
  O(g, c.b, 66, 40, 17);
  g.save();
  g.translate(40, 78);
  g.scale(0.72, 0.72);
  g.translate(-50, -98);
  MARKS.palm(g, c);
  g.restore();
  F(g, c.a, 'M8 82 Q40 62 78 80 Q88 84 92 82 L92 86 H8 Z');
  S(g, c.a, 4, 'M14 94 Q26 88 38 94 T62 94 T86 94');
});
def('leaf', (g, c) => {
  F(g, c.a, 'M14 86 C10 44 42 12 90 12 C90 58 58 92 14 86 Z');
  S(g, c.b, 3.5, 'M12 90 Q40 62 74 28');
});
def('monstera', (g, c) => {
  FE(
    g,
    c.a,
    'M50 96 C18 84 4 54 14 28 C22 10 42 4 50 14 C58 4 78 10 86 28 C96 54 82 84 50 96 Z M22 40 L40 46 L24 50 Z M20 62 L42 60 L30 72 Z M78 40 L60 46 L76 50 Z M80 62 L58 60 L70 72 Z',
  );
  S(g, c.b, 3, 'M50 94 L50 22');
});
def('hibiscus', (g, c) => {
  rep(g, 5, 50, 52, () => F(g, c.a, 'M50 52 C30 40 30 12 50 6 C70 12 70 40 50 52 Z'));
  O(g, c.b, 50, 52, 7);
  S(g, c.b, 3.5, 'M50 52 L66 30');
  O(g, c.b, 67, 28, 4);
});
def('flower', (g, c, o) => {
  rep(g, o.n || 8, 50, 50, () => EL(g, c.a, 50, 24, 9, 20));
  O(g, c.b, 50, 50, 11);
});
def('tulip', (g, c) => {
  F(g, c.a, 'M28 14 L40 28 L50 10 L60 28 L72 14 C76 36 68 52 50 54 C32 52 24 36 28 14 Z');
  S(g, c.b, 5, 'M50 54 L50 96 M50 80 Q30 78 26 62 M50 72 Q68 70 72 56');
});
def('orange', (g, c) => {
  O(g, c.a, 50, 58, 36);
  F(g, c.b, 'M50 24 C52 8 68 2 82 6 C78 22 66 28 50 24 Z');
  S(g, c.b, 4, 'M50 26 L48 16');
  OS(g, c.paper, 4, 50, 58, 26, Math.PI * 1.1, Math.PI * 1.45);
});
def('citrus', (g, c) => {
  O(g, c.a, 50, 50, 46);
  O(g, c.paper, 50, 50, 39);
  rep(g, o8(c), 50, 50, () => F(g, c.b, 'M50 46 L40 16 Q50 11 60 16 Z'));
  O(g, c.paper, 50, 50, 4);
});
function o8() {
  return 8;
}
def('wedge', (g, c) => {
  F(g, c.a, 'M4 40 A46 46 0 0 0 96 40 Z');
  F(g, c.paper, 'M12 44 A38 38 0 0 0 88 44 Z');
  for (const [x0, x1] of [
    [16, 30],
    [33, 48],
    [52, 67],
    [70, 84],
  ])
    F(g, c.b, `M${x0} 47 L${x1} 47 L50 78 Z`);
});
def('mango', (g, c) => {
  F(g, c.a, 'M26 74 C4 50 22 12 58 14 C88 16 96 56 70 78 C54 92 38 88 26 74 Z');
  F(g, c.b, 'M60 16 C62 4 76 0 88 4 C86 16 74 22 60 16 Z');
  OS(g, c.paper, 4, 52, 50, 26, Math.PI * 1.05, Math.PI * 1.4);
});
def('pineapple', (g, c) => {
  for (const d of [
    'M50 40 L50 2 L58 30 Z',
    'M50 40 L50 2 L42 30 Z',
    'M48 40 L30 8 L50 30 Z',
    'M52 40 L70 8 L50 30 Z',
    'M46 42 L18 22 L46 34 Z',
    'M54 42 L82 22 L54 34 Z',
  ])
    F(g, c.b, d);
  const body =
    'M50 36 C74 36 80 56 78 72 C76 90 62 98 50 98 C38 98 24 90 22 72 C20 56 26 36 50 36 Z';
  F(g, c.a, body);
  clipTo(g, body, () => {
    for (let i = -6; i < 8; i++) {
      S(g, c.paper, 2.2, `M${i * 14} 30 L${i * 14 + 70} 100`, 'butt');
      S(g, c.paper, 2.2, `M${i * 14 + 70} 30 L${i * 14} 100`, 'butt');
    }
  });
});
def('coconut', (g, c) => {
  F(g, c.a, 'M8 46 A42 42 0 0 0 92 46 Z');
  F(g, c.paper, 'M16 46 A34 30 0 0 0 84 46 Z');
  EL(g, c.a, 50, 46, 42, 9);
  EL(g, c.paper, 50, 46, 34, 6);
  S(g, c.b, 5, 'M56 46 L74 8');
  F(g, c.c, 'M30 44 L46 14 L16 24 Z');
  S(g, c.c, 2.5, 'M31 24 L36 46');
});
def('cherry', (g, c) => {
  S(g, c.b, 4, 'M32 62 C34 34 50 18 72 12 M68 64 C66 40 68 24 72 12');
  O(g, c.a, 30, 72, 20);
  O(g, c.a, 70, 74, 20);
  F(g, c.b, 'M72 12 C56 4 44 10 40 22 C54 26 66 22 72 12 Z');
  O(g, c.paper, 24, 66, 4);
  O(g, c.paper, 64, 68, 4);
});
def('grapes', (g, c) => {
  for (const [x, y] of [
    [32, 40],
    [50, 40],
    [68, 40],
    [41, 55],
    [59, 55],
    [50, 70],
    [32, 26],
    [68, 26],
    [50, 86],
  ])
    O(g, c.a, x, y + 2, 10.5);
  F(g, c.b, 'M50 22 C52 6 68 2 82 8 C76 20 64 26 50 22 Z');
  S(g, c.b, 4, 'M50 24 L46 8');
});
def('strawberry', (g, c) => {
  F(g, c.a, 'M18 34 C18 22 34 20 50 26 C66 20 82 22 82 34 C84 62 64 88 50 96 C36 88 16 62 18 34 Z');
  F(g, c.b, 'M50 26 L30 12 L42 14 L44 4 L50 14 L56 4 L58 14 L70 12 Z');
  for (const [x, y] of [
    [36, 42],
    [50, 40],
    [64, 42],
    [42, 56],
    [58, 56],
    [50, 70],
  ])
    EL(g, c.paper, x, y, 2, 3.2);
});
def('chili', (g, c) => {
  F(g, c.a, 'M70 26 C90 30 92 58 70 76 C54 90 28 92 8 84 C36 82 50 68 54 50 C56 38 60 28 70 26 Z');
  F(g, c.b, 'M62 30 C62 22 72 18 80 24 C76 28 70 30 62 30 Z');
  S(g, c.b, 5, 'M72 22 C72 14 78 8 86 8');
});
def('avocado', (g, c) => {
  F(g, c.a, 'M50 4 C66 4 70 28 76 48 C84 74 70 96 50 96 C30 96 16 74 24 48 C30 28 34 4 50 4 Z');
  F(
    g,
    c.paper,
    'M50 14 C60 14 62 32 68 50 C74 70 64 88 50 88 C36 88 26 70 32 50 C38 32 40 14 50 14 Z',
  );
  O(g, c.b, 50, 64, 14);
});
def('cane', (g, c) => {
  for (const [x, r] of [
    [34, -0.12],
    [50, 0],
    [66, 0.12],
  ]) {
    g.save();
    g.translate(x, 96);
    g.rotate(r);
    S(g, c.a, 8, 'M0 0 L0 -70', 'butt');
    for (let i = 1; i < 5; i++) S(g, c.paper, 2, `M-5 ${-i * 15} L5 ${-i * 15}`, 'butt');
    F(g, c.b, 'M0 -68 Q-18 -84 -26 -96 Q-6 -90 0 -74 Q6 -90 26 -96 Q18 -84 0 -68 Z');
    g.restore();
  }
});
def('agave', (g, c) => {
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.94 + (i / 8) * Math.PI * 0.88,
      L = 62 - Math.abs(i - 4) * 4;
    g.save();
    g.translate(50, 88);
    g.rotate(a + Math.PI / 2);
    F(g, i % 2 ? c.b : c.a, `M-7 0 Q-9 ${-L * 0.5} 0 ${-L} Q9 ${-L * 0.5} 7 0 Z`);
    g.restore();
  }
  F(g, c.a, 'M26 88 A24 12 0 0 0 74 88 Z');
});
def('hop', (g, c) => {
  F(g, c.a, 'M50 98 C24 84 18 56 30 36 C38 24 46 22 50 14 C54 22 62 24 70 36 C82 56 76 84 50 98 Z');
  for (const y of [40, 56, 72])
    S(g, c.paper, 2.4, `M30 ${y} Q40 ${y + 12} 50 ${y} Q60 ${y + 12} 70 ${y}`);
  F(g, c.b, 'M50 16 C44 6 32 4 24 8 C28 18 40 20 50 16 Z');
});
def('wheat', (g, c) => {
  S(g, c.a, 3.5, 'M50 98 L50 20');
  for (let i = 0; i < 5; i++)
    for (const sx of [-1, 1]) {
      g.save();
      g.translate(50, 30 + i * 13);
      g.rotate(sx * 0.7);
      EL(g, c.a, sx * 9, -4, 5, 10);
      g.restore();
    }
  EL(g, c.a, 50, 12, 5, 10);
});
def('bean', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(-0.6);
  EL(g, c.a, 0, 0, 30, 42);
  S(g, c.paper, 5, 'M2 -40 C-14 -16 16 12 -2 40');
  g.restore();
});
def('corn', (g, c) => {
  F(g, c.a, 'M50 4 C64 14 68 44 62 74 L38 74 C32 44 36 14 50 4 Z');
  for (let i = 0; i < 6; i++) S(g, c.paper, 1.6, `M36 ${16 + i * 10} H64`, 'butt');
  S(g, c.paper, 1.6, 'M44 8 V74 M50 4 V74 M56 8 V74', 'butt');
  F(g, c.b, 'M50 98 C30 90 22 66 28 44 C36 56 44 70 50 78 C56 70 64 56 72 44 C78 66 70 90 50 98 Z');
});
def('tree', (g, c) => {
  F(g, c.a, 'M50 4 L74 36 H62 L82 62 H66 L88 86 H12 L34 62 H18 L38 36 H26 Z');
  RR(g, c.b, 44, 86, 12, 12);
});
def('cypress', (g, c) => {
  F(g, c.a, 'M50 2 C62 22 70 54 62 86 H38 C30 54 38 22 50 2 Z');
  RR(g, c.b, 46, 86, 8, 12);
  S(g, c.b, 4, 'M14 96 H86');
});
def('mangrove', (g, c) => {
  F(
    g,
    c.a,
    'M14 44 A20 16 0 0 1 36 26 A22 18 0 0 1 72 26 A18 16 0 0 1 86 48 A14 10 0 0 1 70 58 H26 A14 10 0 0 1 14 44 Z',
  );
  S(
    g,
    c.b,
    4.5,
    'M50 56 V76 M50 62 Q34 68 30 92 M50 62 Q66 68 70 92 M50 70 Q42 78 42 94 M50 70 Q58 78 58 94',
  );
  S(g, c.a, 3.5, 'M12 96 Q24 90 36 96 T60 96 T88 96');
});
def('clover', (g, c) => {
  rep(g, 4, 50, 46, () =>
    F(
      g,
      c.a,
      'M50 46 C36 40 30 22 40 14 C46 10 50 14 50 18 C50 14 54 10 60 14 C70 22 64 40 50 46 Z',
    ),
  );
  S(g, c.a, 5, 'M50 50 Q52 78 62 94');
});

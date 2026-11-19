// Interiors engine kit: procedural PBR surface textures (albedo + normal + roughness), drawn once and shared by every interior.
// Each surface draws into three canvases: A = albedo (sRGB), H = height (gray, becomes the normal map), G = roughness (gray).
// When the design system publishes a shared material library the same names are looked up there first (see materials.js).
import * as THREE from 'three';
import { note } from './prof.js';
import { rng, css, shade, mixc, clamp } from './util.js';

const cv = (w, h = w) => {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}; // r7: OffscreenCanvas in the surface worker
// tiling helpers: everything that touches an edge is drawn again on the opposite side
function wrap(S, x, y, r, fn) {
  for (const ox of [0, x < r ? S : x > S - r ? -S : null]) {
    if (ox === null) continue;
    for (const oy of [0, y < r ? S : y > S - r ? -S : null]) {
      if (oy === null) continue;
      fn(x + ox, y + oy);
    }
  }
}
function blotch(c, S, R, n, r0, r1, col, a0, a1) {
  for (let i = 0; i < n; i++) {
    const x = R() * S,
      y = R() * S,
      r = R.range(r0, r1),
      a = R.range(a0, a1);
    wrap(S, x, y, r, (X, Y) => {
      const g = c.createRadialGradient(X, Y, 0, X, Y, r);
      g.addColorStop(0, css(typeof col === 'function' ? col() : col, a));
      g.addColorStop(1, css(typeof col === 'function' ? col() : col, 0));
      c.fillStyle = g;
      c.fillRect(X - r, Y - r, 2 * r, 2 * r);
    });
  }
}
function speck(c, S, R, n, r0, r1, col, a = 1) {
  for (let i = 0; i < n; i++) {
    const x = R() * S,
      y = R() * S,
      r = R.range(r0, r1);
    c.fillStyle = css(typeof col === 'function' ? col() : col, a);
    wrap(S, x, y, r, (X, Y) => {
      c.beginPath();
      c.ellipse(X, Y, r, r * R.range(0.5, 1), R() * 3, 0, 7);
      c.fill();
    });
  }
}
function streaks(c, S, R, n, len, w, col, a, vert) {
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = R() * S,
      y = R() * S,
      l = len * R.range(0.4, 1);
    c.strokeStyle = css(typeof col === 'function' ? col() : col, a * R.range(0.4, 1));
    c.lineWidth = w * R.range(0.5, 1.5);
    for (const o of [0, S, -S]) {
      c.beginPath();
      if (vert) {
        c.moveTo(x + R.jit(1.5), y + o);
        c.lineTo(x + R.jit(1.5), y + l + o);
      } else {
        c.moveTo(x + o, y + R.jit(1.5));
        c.lineTo(x + l + o, y + R.jit(1.5));
      }
      c.stroke();
    }
  }
}
function grid(c, S, nx, ny, lw, col, a = 1, offRow = 0) {
  c.fillStyle = css(col, a);
  for (let j = 0; j <= ny; j++) c.fillRect(0, Math.round((j * S) / ny - lw / 2), S, lw);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i <= nx; i++) {
      const x = (((i + (j % 2 ? offRow : 0)) * S) / nx) % S;
      c.fillRect(Math.round(x - lw / 2), Math.round((j * S) / ny), lw, Math.ceil(S / ny));
    }
}
function cells(S, nx, ny, fn, offRow = 0) {
  const w = S / nx,
    h = S / ny;
  for (let j = 0; j < ny; j++)
    for (let i = -1; i < nx; i++) fn((i + (j % 2 ? offRow : 0)) * w, j * h, w, h, i, j);
}
function scuffs(c, S, R, n, a) {
  for (let i = 0; i < n; i++) {
    const x = R() * S,
      y = R() * S,
      l = R.range(8, 60),
      an = R() * 7;
    c.strokeStyle = css(R.chance(0.7) ? [20, 18, 16] : [240, 240, 235], a * R());
    c.lineWidth = R.range(0.6, 2.2);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(
      x + Math.cos(an) * l * 0.5 + R.jit(6),
      y + Math.sin(an) * l * 0.5 + R.jit(6),
      x + Math.cos(an) * l,
      y + Math.sin(an) * l,
    );
    c.stroke();
  }
}
function crack(c, S, R, col, a) {
  let x = R() * S,
    y = R() * S,
    an = R() * 7;
  c.strokeStyle = css(col, a);
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(x, y);
  for (let k = 0; k < 40; k++) {
    an += R.jit(0.5);
    x += Math.cos(an) * 7;
    y += Math.sin(an) * 7;
    c.lineTo(x, y);
  }
  c.stroke();
}

// name -> { m: meters per tile, S: size, rough, metal, draw(A, H, G, S, R, o) }.  o = { c, c2, c3 (colors), wear 0..1 }
export const SURFACES = {
  // ---------------- floors
  vct: {
    m: 1.2192,
    rough: 1,
    draw(A, H, G, S, R, o) {
      // 12 in vinyl composition tile, 4 x 4 per repeat, optional two-tone checker
      const c1 = o.c || [226, 222, 212],
        c2 = o.c2 || c1;
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#5c5c5c';
      G.fillRect(0, 0, S, S);
      cells(S, 4, 4, (x, y, w, h, i, j) => {
        const b = (i + j) & 1 ? c2 : c1;
        A.fillStyle = css(shade(b, R.jit(0.05)));
        A.fillRect(x, y, w + 1, h + 1);
      });
      speck(A, S, R, 2600, 0.5, 1.8, () => (R.chance(0.5) ? [255, 255, 255] : [60, 56, 50]), 0.16);
      blotch(A, S, R, 30 + o.wear * 70, 20, 90, [70, 60, 48], 0.02, 0.05 + o.wear * 0.12);
      grid(A, S, 4, 4, 2, [40, 36, 32], 0.55);
      grid(H, S, 4, 4, 3, [70, 70, 70]);
      scuffs(A, S, R, 20 + o.wear * 120, 0.25);
      blotch(G, S, R, 50, 20, 80, [200, 200, 200], 0.05, 0.25 + o.wear * 0.3);
      scuffs(G, S, R, 60, 0.5);
    },
  },
  terrazzo: {
    m: 1.6,
    rough: 0.8,
    draw(A, H, G, S, R, o) {
      const base = o.c || [214, 205, 190];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#4a4a4a';
      G.fillRect(0, 0, S, S);
      const chips = o.chips || [
        [120, 96, 80],
        [236, 232, 220],
        [70, 74, 78],
        [176, 120, 96],
        [150, 160, 150],
      ];
      speck(A, S, R, 2400, 1.2, 5.5, () => shade(R.pick(chips), R.jit(0.15)), 0.95);
      speck(A, S, R, 3000, 0.4, 1.2, () => R.pick(chips), 0.8);
      blotch(A, S, R, 20 + o.wear * 40, 30, 110, [60, 50, 40], 0.02, 0.05 + o.wear * 0.1);
      A.fillStyle = css([150, 130, 70], 0.9);
      A.fillRect(0, 0, S, 2);
      A.fillRect(0, 0, 2, S);
      H.fillStyle = '#909090';
      H.fillRect(0, 0, S, 2);
      H.fillRect(0, 0, 2, S);
      blotch(G, S, R, 40, 20, 90, [190, 190, 190], 0.05, 0.2 + o.wear * 0.3);
    },
  },
  concrete: {
    m: 3,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [128, 126, 122];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#707070';
      G.fillRect(0, 0, S, S);
      blotch(A, S, R, 90, 20, 120, () => shade(base, R.jit(0.22)), 0.1, 0.4);
      speck(A, S, R, 2500, 0.4, 1.4, () => shade(base, R.jit(0.3)), 0.35);
      blotch(H, S, R, 60, 10, 60, [110, 110, 110], 0.1, 0.4);
      speck(H, S, R, 900, 0.5, 1.6, [90, 90, 90], 0.5);
      for (let i = 0; i < 3 + o.wear * 6; i++) {
        crack(A, S, R, [40, 38, 36], 0.6);
      }
      for (let i = 0; i < 3; i++) crack(H, S, R, [40, 40, 40], 0.9);
      blotch(A, S, R, 6 + o.wear * 16, 20, 70, [50, 42, 34], 0.08, 0.3);
      blotch(G, S, R, 50, 20, 100, [40, 40, 40], 0.1, 0.4);
    },
  },
  wood: {
    m: 1.8,
    rough: 0.9,
    draw(A, H, G, S, R, o) {
      const base = o.c || [150, 104, 66];
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#666';
      G.fillRect(0, 0, S, S);
      const rows = 12,
        h = S / rows;
      for (let j = 0; j < rows; j++) {
        let x = -R() * S * 0.5;
        while (x < S) {
          const w = S * R.range(0.3, 0.7),
            c = shade(base, R.jit(0.16));
          A.fillStyle = css(c);
          A.fillRect(x, j * h, w, h);
          for (let k = 0; k < 26; k++) {
            A.fillStyle = css(shade(c, R.jit(0.2)), 0.35);
            A.fillRect(x + R() * w * 0.2, j * h + R() * h, w * R.range(0.4, 1), R.range(0.5, 1.6));
          }
          if (R.chance(0.25)) {
            const kx = x + R() * w,
              ky = j * h + h * R.range(0.3, 0.7);
            A.fillStyle = css(shade(c, -0.45), 0.7);
            A.beginPath();
            A.ellipse(kx, ky, R.range(3, 6), R.range(1.5, 3), 0, 0, 7);
            A.fill();
          }
          A.fillStyle = 'rgba(25,16,10,0.75)';
          A.fillRect(x + w - 1, j * h, 1.6, h);
          H.fillStyle = '#565656';
          H.fillRect(x + w - 1.5, j * h, 2.5, h);
          x += w;
        }
        A.fillStyle = 'rgba(25,16,10,0.7)';
        A.fillRect(0, j * h, S, 1.4);
        H.fillStyle = '#565656';
        H.fillRect(0, j * h - 1, S, 2.5);
      }
      scuffs(A, S, R, 10 + o.wear * 80, 0.2);
      blotch(G, S, R, 40, 20, 90, [210, 210, 210], 0.05, 0.2 + o.wear * 0.3);
    },
  },
  ceramic: {
    m: 0.9,
    rough: 0.7,
    draw(A, H, G, S, R, o) {
      const base = o.c || [222, 214, 198];
      H.fillStyle = '#909090';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#404040';
      G.fillRect(0, 0, S, S);
      cells(S, 2, 2, (x, y, w, h) => {
        A.fillStyle = css(shade(base, R.jit(0.04)));
        A.fillRect(x, y, w + 1, h + 1);
      });
      blotch(A, S, R, 60, 20, 80, () => shade(base, R.jit(0.1)), 0.1, 0.3);
      grid(A, S, 2, 2, 5, o.c2 || [96, 90, 84]);
      grid(H, S, 2, 2, 7, [60, 60, 60]);
      grid(G, S, 2, 2, 5, [200, 200, 200]);
      blotch(A, S, R, 10 + o.wear * 40, 15, 60, [50, 42, 34], 0.03, 0.08 + o.wear * 0.15);
    },
  },
  cubanTile: {
    m: 0.8,
    rough: 0.75,
    draw(A, H, G, S, R, o) {
      // encaustic cement tile, 4 x 4 per repeat, eight-point star pattern in three colors
      const a = o.c || [238, 228, 204],
        b = o.c2 || [38, 92, 110],
        d = o.c3 || [196, 92, 54],
        n = 4,
        w = S / n;
      H.fillStyle = '#868686';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#727272';
      G.fillRect(0, 0, S, S);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = i * w,
            y = j * w,
            cx = x + w / 2,
            cy = y + w / 2;
          A.fillStyle = css(shade(a, R.jit(0.03)));
          A.fillRect(x, y, w, w);
          A.fillStyle = css(b);
          for (const [qx, qy] of [
            [x, y],
            [x + w, y],
            [x, y + w],
            [x + w, y + w],
          ]) {
            A.beginPath();
            A.arc(qx, qy, w * 0.36, 0, 7);
            A.fill();
          }
          A.fillStyle = css(d);
          A.beginPath();
          for (let k = 0; k < 16; k++) {
            const r = k % 2 ? w * 0.16 : w * 0.36,
              an = (k * Math.PI) / 8;
            A.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r);
          }
          A.closePath();
          A.fill();
          A.fillStyle = css(a);
          A.beginPath();
          A.arc(cx, cy, w * 0.1, 0, 7);
          A.fill();
          A.fillStyle = css(b);
          A.beginPath();
          A.arc(cx, cy, w * 0.045, 0, 7);
          A.fill();
          A.strokeStyle = css(b);
          A.lineWidth = w * 0.03;
          A.strokeRect(x + w * 0.06, y + w * 0.06, w * 0.88, w * 0.88);
        }
      blotch(A, S, R, 80, 15, 70, [120, 105, 85], 0.03, 0.1 + o.wear * 0.2);
      speck(A, S, R, 1500, 0.4, 1.2, [250, 245, 235], 0.12);
      grid(A, S, n, n, 2, [70, 64, 58], 0.8);
      grid(H, S, n, n, 3, [80, 80, 80]);
      blotch(G, S, R, 40, 20, 80, [50, 50, 50], 0.05, 0.3);
    },
  },
  quarry: {
    m: 0.6,
    rough: 0.9,
    draw(A, H, G, S, R, o) {
      const base = o.c || [140, 62, 44];
      H.fillStyle = '#909090';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#6a6a6a';
      G.fillRect(0, 0, S, S);
      cells(S, 4, 4, (x, y, w, h) => {
        A.fillStyle = css(shade(base, R.jit(0.12)));
        A.fillRect(x, y, w + 1, h + 1);
      });
      blotch(A, S, R, 60, 10, 60, [60, 30, 22], 0.05, 0.25 + o.wear * 0.2);
      grid(A, S, 4, 4, 5, [60, 56, 52]);
      grid(H, S, 4, 4, 7, [50, 50, 50]);
      blotch(G, S, R, 30, 20, 80, [40, 40, 40], 0.1, 0.5);
    },
  },
  carpet: {
    m: 1,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [70, 74, 86];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#f0f0f0';
      G.fillRect(0, 0, S, S);
      speck(A, S, R, 9000, 0.6, 1.4, () => shade(base, R.jit(0.3)), 0.6);
      speck(H, S, R, 7000, 0.6, 1.4, () => (R.chance(0.5) ? [170, 170, 170] : [80, 80, 80]), 0.6);
      blotch(A, S, R, 10 + o.wear * 30, 20, 80, [30, 26, 22], 0.03, 0.1 + o.wear * 0.15);
    },
  },
  rubber: {
    m: 0.5,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [34, 34, 36];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#707070';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#d0d0d0';
      G.fillRect(0, 0, S, S);
      for (let j = 0; j < 16; j++)
        for (let i = 0; i < 16; i++) {
          H.fillStyle = '#b0b0b0';
          H.beginPath();
          H.arc(((i + 0.5) * S) / 16, ((j + 0.5) * S) / 16, S / 50, 0, 7);
          H.fill();
        }
      blotch(A, S, R, 30, 10, 60, [120, 110, 95], 0.03, 0.12);
    },
  },
  // ---------------- walls
  paint: {
    m: 2.4,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [236, 232, 222];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#b8b8b8';
      G.fillRect(0, 0, S, S);
      blotch(A, S, R, 60, 30, 140, () => shade(base, R.jit(0.06)), 0.1, 0.3);
      speck(
        H,
        S,
        R,
        5000,
        0.6,
        1.6,
        () => (R.chance(0.5) ? [150, 150, 150] : [108, 108, 108]),
        0.5,
      );
      blotch(A, S, R, 6 + o.wear * 40, 20, 90, [90, 76, 58], 0.02, 0.05 + o.wear * 0.12);
      scuffs(A, S, R, o.wear * 50, 0.12);
      streaks(A, S, R, o.wear * 14, 150, 3, [80, 66, 50], 0.06, true);
    },
  },
  subway: {
    m: 0.6,
    rough: 0.5,
    draw(A, H, G, S, R, o) {
      const base = o.c || [238, 238, 232];
      H.fillStyle = '#a0a0a0';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#2c2c2c';
      G.fillRect(0, 0, S, S);
      cells(
        S,
        4,
        8,
        (x, y, w, h) => {
          A.fillStyle = css(shade(base, R.jit(0.05)));
          A.fillRect(x, y, w + 1, h + 1);
          const g = A.createLinearGradient(0, y, 0, y + h);
          g.addColorStop(0, 'rgba(255,255,255,0.22)');
          g.addColorStop(1, 'rgba(0,0,0,0.1)');
          A.fillStyle = g;
          A.fillRect(x, y, w + 1, h);
        },
        0.5,
      );
      grid(A, S, 4, 8, 4, o.c2 || [150, 146, 140], 1, 0.5);
      grid(H, S, 4, 8, 6, [50, 50, 50], 1, 0.5);
      grid(G, S, 4, 8, 4, [215, 215, 215], 1, 0.5);
      blotch(A, S, R, 10 + o.wear * 40, 20, 70, [70, 60, 44], 0.03, 0.08 + o.wear * 0.14);
    },
  },
  brick: {
    m: 1.2,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [150, 78, 58];
      H.fillStyle = '#909090';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#d8d8d8';
      G.fillRect(0, 0, S, S);
      cells(
        S,
        5,
        16,
        (x, y, w, h) => {
          const c = shade(base, R.jit(0.2));
          A.fillStyle = css(c);
          A.fillRect(x, y, w + 1, h + 1);
          for (let k = 0; k < 10; k++) {
            A.fillStyle = css(shade(c, R.jit(0.25)), 0.5);
            A.fillRect(x + R() * w, y + R() * h, R.range(2, 9), R.range(1, 3));
          }
          H.fillStyle = css([R.range(120, 170) | 0, 0, 0].map((v, i, a) => a[0]));
          H.fillRect(x, y, w, h);
        },
        0.5,
      );
      grid(A, S, 5, 16, 4, o.c2 || [196, 188, 174], 1, 0.5);
      grid(H, S, 5, 16, 5, [48, 48, 48], 1, 0.5);
      blotch(A, S, R, 40, 20, 90, [40, 32, 28], 0.04, 0.15 + o.wear * 0.2);
    },
  },
  slatwall: {
    m: 0.6,
    rough: 0.8,
    draw(A, H, G, S, R, o) {
      const base = o.c || [226, 222, 214];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#a0a0a0';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#787878';
      G.fillRect(0, 0, S, S);
      streaks(A, S, R, 200, 200, 1, () => shade(base, R.jit(0.08)), 0.5);
      for (let j = 0; j < 8; j++) {
        const y = ((j + 0.5) * S) / 8;
        A.fillStyle = 'rgba(20,18,16,0.85)';
        A.fillRect(0, y - 4, S, 8);
        A.fillStyle = 'rgba(255,255,255,0.25)';
        A.fillRect(0, y + 4, S, 1.5);
        H.fillStyle = '#303030';
        H.fillRect(0, y - 5, S, 10);
      }
    },
  },
  pegboard: {
    m: 0.4064,
    rough: 0.9,
    draw(A, H, G, S, R, o) {
      const base = o.c || [222, 214, 196];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#a0a0a0';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#9a9a9a';
      G.fillRect(0, 0, S, S);
      blotch(A, S, R, 30, 20, 90, () => shade(base, R.jit(0.08)), 0.1, 0.3);
      for (let j = 0; j < 16; j++)
        for (let i = 0; i < 16; i++) {
          const x = ((i + 0.5) * S) / 16,
            y = ((j + 0.5) * S) / 16;
          A.fillStyle = '#17140f';
          A.beginPath();
          A.arc(x, y, S / 105, 0, 7);
          A.fill();
          H.fillStyle = '#202020';
          H.beginPath();
          H.arc(x, y, S / 95, 0, 7);
          H.fill();
        }
    },
  },
  woodPanel: {
    m: 1.2,
    rough: 0.8,
    draw(A, H, G, S, R, o) {
      const base = o.c || [124, 84, 54];
      H.fillStyle = '#909090';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#707070';
      G.fillRect(0, 0, S, S);
      const n = 8,
        w = S / n;
      for (let i = 0; i < n; i++) {
        const c = shade(base, R.jit(0.12));
        A.fillStyle = css(c);
        A.fillRect(i * w, 0, w, S);
        for (let k = 0; k < 40; k++) {
          A.fillStyle = css(shade(c, R.jit(0.22)), 0.3);
          A.fillRect(i * w + R() * w, R() * S, R.range(0.6, 2), S * R.range(0.2, 0.8));
        }
        A.fillStyle = 'rgba(15,9,5,0.8)';
        A.fillRect(i * w, 0, 2.2, S);
        H.fillStyle = '#404040';
        H.fillRect(i * w - 1, 0, 4, S);
      }
    },
  },
  cmu: {
    m: 0.8128,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [214, 210, 200];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#909090';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#c0c0c0';
      G.fillRect(0, 0, S, S);
      speck(A, S, R, 6000, 0.5, 1.5, () => shade(base, R.jit(0.2)), 0.4);
      speck(H, S, R, 6000, 0.6, 1.8, () => (R.chance(0.6) ? [70, 70, 70] : [170, 170, 170]), 0.6);
      grid(A, S, 2, 4, 3, shade(base, -0.3), 0.7, 0.5);
      grid(H, S, 2, 4, 6, [50, 50, 50], 1, 0.5);
      blotch(A, S, R, 10 + o.wear * 30, 20, 100, [80, 66, 50], 0.03, 0.07 + o.wear * 0.12);
    },
  },
  frp: {
    m: 1.2,
    rough: 0.6,
    draw(A, H, G, S, R, o) {
      const base = o.c || [232, 232, 226];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#585858';
      G.fillRect(0, 0, S, S);
      speck(H, S, R, 9000, 0.8, 1.8, () => (R.chance(0.5) ? [165, 165, 165] : [95, 95, 95]), 0.7);
      A.fillStyle = 'rgba(120,120,116,0.9)';
      A.fillRect(0, 0, 3, S);
      H.fillStyle = '#c0c0c0';
      H.fillRect(0, 0, 5, S);
      blotch(A, S, R, 8 + o.wear * 30, 15, 70, [96, 84, 60], 0.03, 0.06 + o.wear * 0.12);
    },
  },
  // ---------------- ceilings
  dropTile: {
    m: 1.2192,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [226, 224, 216];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#e8e8e8';
      G.fillRect(0, 0, S, S);
      speck(A, S, R, 5000, 0.4, 1.3, [120, 116, 108], 0.4);
      streaks(A, S, R, 500, 7, 1, [110, 106, 98], 0.5);
      speck(H, S, R, 4000, 0.5, 1.5, [40, 40, 40], 0.6);
      cells(S, 2, 2, (x, y, w, h) => {
        A.fillStyle = css(shade(base, R.jit(0.04)), 0.5);
        A.fillRect(x, y, w, h);
        if (R.chance(0.1 + o.wear * 0.4)) {
          const sx = x + R() * w,
            sy = y + R() * h;
          blotch(A, S, R, 1, 30, 70, [150, 116, 60], 0.3, 0.5);
          A.strokeStyle = 'rgba(120,88,40,0.35)';
          A.lineWidth = 2;
          A.beginPath();
          A.ellipse(sx, sy, R.range(18, 40), R.range(14, 30), R() * 3, 0, 7);
          A.stroke();
        }
      });
      grid(A, S, 2, 2, 7, o.c2 || [238, 238, 234]);
      grid(H, S, 2, 2, 9, [200, 200, 200]);
      A.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 0; k < 2; k++) {
        A.fillRect(0, (k * S) / 2 + 3.5, S, 1.5);
        A.fillRect((k * S) / 2 + 3.5, 0, 1.5, S);
      }
    },
  },
  tin: {
    m: 0.6096,
    rough: 0.6,
    metal: 0.5,
    draw(A, H, G, S, R, o) {
      const base = o.c || [222, 218, 206];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#707070';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#707070';
      G.fillRect(0, 0, S, S);
      const n = 2,
        w = S / n;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const cx = (i + 0.5) * w,
            cy = (j + 0.5) * w;
          for (let k = 5; k > 0; k--) {
            const g = k * 30 + 60;
            H.fillStyle = `rgb(${g},${g},${g})`;
            H.beginPath();
            for (let q = 0; q < 16; q++) {
              const r = ((q % 2 ? 0.26 : 0.44) * w * k) / 5,
                an = (q * Math.PI) / 8;
              H.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r);
            }
            H.fill();
          }
          H.strokeStyle = '#d0d0d0';
          H.lineWidth = 6;
          H.strokeRect(i * w + 8, j * w + 8, w - 16, w - 16);
          A.strokeStyle = css(shade(base, -0.25), 0.6);
          A.lineWidth = 2;
          A.strokeRect(i * w + 1, j * w + 1, w - 2, w - 2);
        }
      blotch(A, S, R, 20 + o.wear * 40, 10, 60, [110, 90, 60], 0.03, 0.08 + o.wear * 0.15);
    },
  },
  deck: {
    m: 1.5,
    rough: 0.9,
    draw(A, H, G, S, R, o) {
      const base = o.c || [26, 26, 28];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#c8c8c8';
      G.fillRect(0, 0, S, S);
      for (let i = 0; i < 10; i++) {
        const x = (i * S) / 10;
        const g = H.createLinearGradient(x, 0, x + S / 10, 0);
        g.addColorStop(0, '#404040');
        g.addColorStop(0.3, '#c0c0c0');
        g.addColorStop(0.7, '#c0c0c0');
        g.addColorStop(1, '#404040');
        H.fillStyle = g;
        H.fillRect(x, 0, S / 10 + 1, S);
      }
      blotch(A, S, R, 30, 20, 90, () => shade(base, R.jit(0.2)), 0.1, 0.4);
    },
  },
  // ---------------- object finishes
  steel: {
    m: 0.8,
    rough: 0.55,
    metal: 0.85,
    draw(A, H, G, S, R, o) {
      const base = o.c || [176, 180, 184];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#585858';
      G.fillRect(0, 0, S, S);
      streaks(A, S, R, 900, 120, 1, () => shade(base, R.jit(0.2)), 0.35);
      streaks(G, S, R, 500, 120, 1, () => [R.range(40, 150) | 0, 0, 0].map((v, i, a) => a[0]), 0.5);
      blotch(A, S, R, 10 + o.wear * 30, 15, 60, [70, 60, 50], 0.03, 0.06 + o.wear * 0.1);
      scuffs(A, S, R, o.wear * 60, 0.2);
    },
  },
  laminate: {
    m: 1,
    rough: 0.7,
    draw(A, H, G, S, R, o) {
      const base = o.c || [226, 222, 214];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#6a6a6a';
      G.fillRect(0, 0, S, S);
      speck(A, S, R, 3000, 0.4, 1.2, () => shade(base, R.jit(0.12)), 0.5);
      blotch(A, S, R, 8 + o.wear * 30, 15, 60, [70, 60, 50], 0.03, 0.05 + o.wear * 0.1);
      scuffs(A, S, R, 6 + o.wear * 60, 0.18);
      scuffs(G, S, R, 40, 0.5);
    },
  },
  plastic: {
    m: 1,
    rough: 0.6,
    draw(A, H, G, S, R, o) {
      const base = o.c || [220, 220, 220];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#707070';
      G.fillRect(0, 0, S, S);
      speck(
        H,
        S,
        R,
        5000,
        0.5,
        1.2,
        () => (R.chance(0.5) ? [140, 140, 140] : [116, 116, 116]),
        0.5,
      );
      blotch(A, S, R, 10 + o.wear * 20, 15, 60, [60, 50, 40], 0.02, 0.05 + o.wear * 0.1);
      scuffs(A, S, R, o.wear * 40, 0.15);
    },
  },
  cardboard: {
    m: 0.6,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [176, 138, 96];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#e0e0e0';
      G.fillRect(0, 0, S, S);
      streaks(A, S, R, 500, 200, 1.2, () => shade(base, R.jit(0.1)), 0.4, true);
      for (let i = 0; i < 64; i++) {
        H.fillStyle = i % 2 ? '#8a8a8a' : '#767676';
        H.fillRect((i * S) / 64, 0, S / 64 + 1, S);
      }
      blotch(A, S, R, 14, 20, 70, [90, 64, 40], 0.04, 0.14);
      scuffs(A, S, R, 20, 0.15);
    },
  },
  fabric: {
    m: 0.5,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [90, 96, 110];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#f0f0f0';
      G.fillRect(0, 0, S, S);
      for (let i = 0; i < 128; i++) {
        const v = i % 2 ? 150 : 100;
        H.fillStyle = `rgb(${v},${v},${v})`;
        H.fillRect(0, (i * S) / 128, S, S / 256);
        H.fillRect((i * S) / 128, 0, S / 256, S);
        A.fillStyle = css(shade(base, i % 2 ? 0.06 : -0.06), 0.4);
        A.fillRect(0, (i * S) / 128, S, S / 256);
      }
    },
  },
  leather: {
    m: 0.6,
    rough: 0.6,
    draw(A, H, G, S, R, o) {
      const base = o.c || [64, 36, 26];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#606060';
      G.fillRect(0, 0, S, S);
      speck(H, S, R, 5000, 1, 3, () => (R.chance(0.5) ? [160, 160, 160] : [96, 96, 96]), 0.5);
      blotch(A, S, R, 60, 10, 50, () => shade(base, R.jit(0.2)), 0.1, 0.35);
      scuffs(A, S, R, 10 + o.wear * 40, 0.2);
    },
  },
  stucco: {
    m: 2,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [232, 220, 196];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#e0e0e0';
      G.fillRect(0, 0, S, S);
      blotch(H, S, R, 900, 3, 12, () => (R.chance(0.5) ? [190, 190, 190] : [70, 70, 70]), 0.3, 0.7);
      blotch(A, S, R, 60, 30, 120, () => shade(base, R.jit(0.08)), 0.1, 0.3);
      streaks(A, S, R, 10 + o.wear * 30, 180, 4, [90, 78, 60], 0.07, true);
    },
  },
  asphalt: {
    m: 3,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [58, 58, 60];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#e0e0e0';
      G.fillRect(0, 0, S, S);
      speck(A, S, R, 9000, 0.5, 1.6, () => shade(base, R.jit(0.35)), 0.6);
      speck(H, S, R, 6000, 0.6, 1.8, () => (R.chance(0.5) ? [180, 180, 180] : [60, 60, 60]), 0.6);
      blotch(A, S, R, 20, 30, 120, [20, 20, 22], 0.05, 0.3);
      for (let i = 0; i < 4; i++) crack(A, S, R, [20, 20, 20], 0.7);
    },
  },
  sidewalk: {
    m: 3,
    rough: 1,
    draw(A, H, G, S, R, o) {
      const base = o.c || [176, 172, 164];
      A.fillStyle = css(base);
      A.fillRect(0, 0, S, S);
      H.fillStyle = '#808080';
      H.fillRect(0, 0, S, S);
      G.fillStyle = '#e0e0e0';
      G.fillRect(0, 0, S, S);
      speck(A, S, R, 7000, 0.5, 1.4, () => shade(base, R.jit(0.2)), 0.5);
      blotch(A, S, R, 50, 20, 100, () => shade(base, R.jit(0.12)), 0.1, 0.3);
      grid(A, S, 2, 2, 3, [90, 86, 80], 0.9);
      grid(H, S, 2, 2, 5, [40, 40, 40]);
      speck(A, S, R, 40, 3, 7, [50, 48, 46], 0.5);
      for (let i = 0; i < 3; i++) crack(A, S, R, [60, 58, 54], 0.6);
      blotch(A, S, R, 12, 20, 70, [70, 60, 50], 0.05, 0.2);
    },
  },
};

function normalMap(hc, S, k) {
  // Sobel on the height canvas (wrapping) -> tangent-space normal map
  const src = hc.getContext('2d').getImageData(0, 0, S, S).data,
    out = cv(S),
    o = out.getContext('2d'),
    img = o.createImageData(S, S),
    d = img.data;
  const h = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = ((h(x + 1, y) - h(x - 1, y)) * k) / 255,
        dy = ((h(x, y + 1) - h(x, y - 1)) * k) / 255,
        l = 1 / Math.sqrt(dx * dx + dy * dy + 1),
        i = (y * S + x) * 4;
      d[i] = (-dx * l * 0.5 + 0.5) * 255;
      d[i + 1] = (dy * l * 0.5 + 0.5) * 255;
      d[i + 2] = (l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  o.putImageData(img, 0, 0);
  return out;
}
const TEX = new Map();
const col3 = (c) => (c ? (Array.isArray(c) ? c.map((v) => v | 0).join(',') : String(c)) : '');
// -> { map, normalMap, roughnessMap, m, rough, metal } (cached; never disposed: shared across all interiors)
// r2-art interior pass (?intart=0 = before): sealed / polished hard floors reflect (terrazzo, tile, VCT, wood), painted walls get
// roller lanes and stipple in albedo and roughness. Roughness multipliers apply on top of each surface's own roughness map.
const INT_ART_OFF = typeof location !== 'undefined' && /[?&]intart=0\b/.test(location.search);
const POLISH = {
  terrazzo: 0.42,
  ceramic: 0.55,
  vct: 0.7,
  wood: 0.72,
  quarry: 0.85,
  cubanTile: 0.7,
  subway: 0.8,
};
const ROLLED = new Set(['paint', 'frp', 'cmu', 'slatwall']);
function rollerFinish(A, G, S, R) {
  const lanes = 6 + Math.floor(R() * 3),
    w = S / lanes;
  for (let i = 0; i < lanes; i++) {
    const k = (R() - 0.5) * 0.05,
      x = i * w + (R() - 0.5) * w * 0.15; // each roller pass a hair lighter / darker, soft edges
    const g = A.createLinearGradient(x, 0, x + w, 0);
    const c = k > 0 ? '255,255,255' : '0,0,0',
      a = Math.abs(k);
    g.addColorStop(0, `rgba(${c},0)`);
    g.addColorStop(0.15, `rgba(${c},${a})`);
    g.addColorStop(0.85, `rgba(${c},${a})`);
    g.addColorStop(1, `rgba(${c},0)`);
    A.fillStyle = g;
    A.fillRect(x, 0, w, S);
    const gg = G.createLinearGradient(x, 0, x + w, 0);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(0.5, `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + R() * 0.06})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    G.fillStyle = gg;
    G.fillRect(x, 0, w, S);
  }
  for (let i = 0; i < (S * S) / 60; i++) {
    const x = R() * S,
      y = R() * S;
    A.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},0.035)`;
    A.fillRect(x, y, 1.5, 1.5);
    G.fillStyle = `rgba(0,0,0,0.08)`;
    G.fillRect(x, y, 1, 1);
  } // stipple (orange peel)
}
export function surfaceTextures(name, o = {}) {
  const t0 = performance.now(),
    r = surfaceTextures0(name, o);
  note('surf:' + name, performance.now() - t0);
  return r;
}
// r7: the drawing itself (also runs in kit/surfWorker.js): -> { A (albedo), N (normal), G (roughness) } canvases, S, def
export function drawSurface(name, o = {}) {
  const def = SURFACES[name];
  if (!def) throw new Error('unknown surface ' + name);
  const wear = Math.round(clamp(o.wear ?? 0.3) * 2) / 2,
    key = surfKey(name, o);
  const S = o.size || def.size || 256,
    A = cv(S),
    H = cv(S),
    G = cv(S),
    R = rng(key);
  H.getContext('2d', { willReadFrequently: true }); // perf: CPU-backed, so normalMap()'s getImageData is not a GPU readback (86 ms a second downtown)
  def.draw(A.getContext('2d'), H.getContext('2d'), G.getContext('2d'), S, R, { ...o, wear });
  if (!INT_ART_OFF && ROLLED.has(name)) rollerFinish(A.getContext('2d'), G.getContext('2d'), S, R); // r2-art: paint-roller lanes + stipple, so walls are not one flat layer
  return { A, N: normalMap(H, S, def.bump || 2.2), G, S, def };
}
const surfKey = (name, o) =>
  `${name}|${col3(o.c)}|${col3(o.c2)}|${col3(o.c3)}|${Math.round(clamp(o.wear ?? 0.3) * 2) / 2}`;
// r7 (zero-hitch shop entry): surfaces are drawn in a Worker (OffscreenCanvas; one 256 px surface was 30-2000 ms on the main
// thread). The textures exist at once with a 4 px placeholder of the base color and get the worker's bitmaps when they arrive;
// engine.show() waits for surfacesPending() === 0. ?surfsync=1 = old main-thread drawing.
const SYNC =
  typeof location === 'undefined' ||
  /[?&]surfsync=1\b/.test(location.search) ||
  typeof Worker === 'undefined' ||
  typeof OffscreenCanvas === 'undefined';
let worker = null,
  workerDead = false,
  jobN = 0,
  pending = 0;
const jobs = new Map();
export const surfacesPending = () => pending;
// the worker died: its outstanding jobs never answer. Draw them on the main thread one per idle slot (no frame spike), so
// pending drains to 0 (engine.show() stops waiting) and no texture stays the 4 px placeholder for good
function drainDead() {
  const idle = globalThis.requestIdleCallback || ((f) => setTimeout(f, 30));
  const step = () => {
    const it = jobs.entries().next();
    if (it.done) return;
    const [id, j] = it.value;
    jobs.delete(id);
    pending = Math.max(0, pending - 1);
    try {
      const d = drawSurface(j.name, j.o);
      fill(j.t, [d.A, d.N, d.G], true);
    } catch (x) {
      j.t.pending = false; /* keep the placeholder */
    }
    if (jobs.size) idle(step, { timeout: 300 });
  };
  idle(step, { timeout: 300 });
}
function getWorker() {
  if (worker || SYNC || workerDead) return worker;
  try {
    worker = new Worker(new URL('./surfWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const j = jobs.get(e.data.id);
      jobs.delete(e.data.id);
      pending--;
      if (!j) return;
      if (e.data.err) {
        console.warn('[interiors] surface worker', j.name, e.data.err);
        try {
          const d = drawSurface(j.name, j.o);
          fill(j.t, [d.A, d.N, d.G], true);
        } catch (x) {
          /* keep the placeholder */
        }
        return;
      }
      fill(j.t, e.data.bm, false);
    };
    worker.onerror = (e) => {
      console.warn('[interiors] surface worker failed, drawing on the main thread', e.message);
      try {
        worker?.terminate();
      } catch (x) {
        /* */
      }
      worker = null;
      workerDead = true;
      drainDead();
    };
  } catch (e) {
    worker = null;
    workerDead = true;
  }
  return worker;
}
function fill(t, imgs, canvas) {
  [t.map, t.normalMap, t.roughnessMap].forEach((x, i) => {
    x.dispose();
    x.image = imgs[i];
    x.flipY = canvas;
    x.needsUpdate = true;
  });
  t.pending = false;
}
const ph = (rgb) => {
  const c = cv(4);
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  g.fillRect(0, 0, 4, 4);
  return c;
};
function surfaceTextures0(name, o = {}) {
  const def = SURFACES[name];
  if (!def) throw new Error('unknown surface ' + name);
  const key = surfKey(name, o);
  let t = TEX.get(key);
  if (t) return t;
  const mk = (c, srgb) => {
    const x = new THREE.CanvasTexture(c);
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.anisotropy = 8;
    if (srgb) x.colorSpace = THREE.SRGBColorSpace;
    return x;
  };
  const base = {
    m: def.m,
    rough: (def.rough ?? 1) * (INT_ART_OFF ? 1 : (POLISH[name] ?? 1)),
    metal: def.metal || 0,
  };
  const w = !o.sync && getWorker();
  if (w) {
    const c = Array.isArray(o.c) ? o.c : [150, 150, 150];
    t = {
      map: mk(ph(c), true),
      normalMap: mk(ph([128, 128, 255]), false),
      roughnessMap: mk(ph([200, 200, 200]), false),
      ...base,
      pending: true,
    };
    const id = ++jobN;
    jobs.set(id, { t, name, o });
    pending++;
    const oo = {};
    for (const k in o)
      if ((typeof o[k] !== 'function' && typeof o[k] !== 'object') || Array.isArray(o[k]))
        oo[k] = o[k];
    w.postMessage({ id, name, o: oo });
    TEX.set(key, t);
    return t;
  }
  const d = drawSurface(name, o);
  t = { map: mk(d.A, true), normalMap: mk(d.N, false), roughnessMap: mk(d.G, false), ...base };
  TEX.set(key, t);
  return t;
}
export const surfaceCount = () => TEX.size;
export { cv, mixc };

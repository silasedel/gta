// KEYS-BAR track: every painted surface of "Low Tide Lola's" is drawn here in code on canvases (original designs).
// Palette: cream siding, coral trim, deep sea-blue shutters and board, galvanized tin.
export const PAL = {
  cream: '#f1e6cc',
  coral: '#e2664c',
  coralDark: '#b9452f',
  sea: '#1d5873',
  navy: '#143a52',
  mint: '#9fd4c0',
  sun: '#f2b441',
  wood: '#8a7660',
  ink: '#1b1b1b',
};
export const BAR = {
  name: "Low Tide Lola's",
  tagline: "The tide's out. So are we.",
  since: 1968,
  place: 'Key Paloma',
  festival: 'Key Paloma Coconut Regatta',
  band: 'The Mangrove Snappers',
};

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
const F = {
  slab: '"Rockwell","Georgia",serif',
  hand: '"Marker Felt","Comic Sans MS",cursive',
  script: '"Snell Roundhand","Brush Script MT",cursive',
  chalk: '"Chalkduster","Marker Felt",cursive',
  block: '"Impact","Arial Black",sans-serif',
};

function grain(g, w, h, r, n, col, a, horiz = true) {
  g.save();
  g.strokeStyle = col;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = a * (0.3 + r());
    g.lineWidth = 0.5 + r() * 1.5;
    const y = r() * (horiz ? h : w),
      l = (0.2 + r() * 0.8) * (horiz ? w : h),
      x = r() * (horiz ? w : h);
    g.beginPath();
    if (horiz) {
      g.moveTo(x, y);
      g.lineTo(x + l, y + (r() - 0.5) * 3);
    } else {
      g.moveTo(y, x);
      g.lineTo(y + (r() - 0.5) * 3, x + l);
    }
    g.stroke();
  }
  g.restore();
}
function chips(g, w, h, r, n, col, size = 6) {
  g.save();
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const x = r() * w,
      y = r() * h,
      k = 1 + r() * size;
    g.globalAlpha = 0.5 + r() * 0.5;
    g.beginPath();
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * 6.283,
        d = k * (0.5 + r() * 0.7);
      g.lineTo(x + Math.cos(a) * d * (1 + r()), y + Math.sin(a) * d * 0.6);
    }
    g.fill();
  }
  g.restore();
}
function speck(g, w, h, r, n, a = 0.08) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a * r()})` : `rgba(0,0,0,${a * r()})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

// tileable painted wood: white paint with grain along U, hairline cracks and chips down to gray wood (tinted by vertex color)
export function paintWear(seed = 1, size = 512, heavy = 1) {
  const [c, g] = cv(size, size),
    r = rng(seed);
  g.fillStyle = '#efefec';
  g.fillRect(0, 0, size, size);
  grain(g, size, size, r, 420, '#b9b5ab', 0.35);
  grain(g, size, size, r, 60, '#ffffff', 0.6);
  chips(g, size, size, r, 90 * heavy, '#8d8473', 5 + heavy);
  chips(g, size, size, r, 40 * heavy, '#6f675a', 2.5);
  if (heavy > 1) {
    for (let i = 0; i < 16 * heavy; i++) {
      const x = r() * size,
        y = r() * size,
        l = 30 + r() * 150,
        w = 4 + r() * 16;
      g.fillStyle = r() > 0.4 ? '#9a8f7c' : '#7d7364';
      g.globalAlpha = 0.85;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k <= 8; k++) g.lineTo(x + (l * k) / 8, y - w * (0.4 + r() * 0.6));
      for (let k = 8; k >= 0; k--) g.lineTo(x + (l * k) / 8, y + w * (0.3 + r() * 0.7));
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,.55)';
      g.lineWidth = 1;
      g.stroke();
    }
    for (let i = 0; i < 10 * heavy; i++) {
      g.strokeStyle = 'rgba(50,42,34,.75)';
      g.lineWidth = 1 + r() * 1.5;
      g.beginPath();
      let x = r() * size,
        y = r() * size;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += 20 + r() * 40;
        y += (r() - 0.5) * 7;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    grain(g, size, size, r, 300, '#5e5548', 0.3);
  }
  speck(g, size, size, r, 2500, 0.1);
  for (let i = 0; i < 14; i++) {
    const x = r() * size;
    const gr = g.createLinearGradient(x, 0, x + 40, 0);
    gr.addColorStop(0, 'rgba(120,110,80,0)');
    gr.addColorStop(0.5, `rgba(120,110,80,${0.05 + r() * 0.07})`);
    gr.addColorStop(1, 'rgba(120,110,80,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 40, size);
  }
  return c;
}
export function bareWood(seed = 2, size = 512) {
  const [c, g] = cv(size, size),
    r = rng(seed);
  g.fillStyle = '#a89a86';
  g.fillRect(0, 0, size, size);
  grain(g, size, size, r, 900, '#6d6152', 0.5);
  grain(g, size, size, r, 200, '#d8ccb8', 0.4);
  for (let i = 0; i < 9; i++) {
    const x = r() * size,
      y = r() * size;
    g.strokeStyle = 'rgba(70,58,44,.55)';
    for (let k = 1; k < 5; k++) {
      g.beginPath();
      g.ellipse(x, y, k * 5, k * 1.8, 0, 0, 6.283);
      g.stroke();
    }
  }
  speck(g, size, size, r, 3000, 0.12);
  return c;
}
export function noise(base = '#888', seed = 3, size = 128, amt = 0.1) {
  const [c, g] = cv(size, size),
    r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  speck(g, size, size, r, (size * size) / 5, amt);
  grain(g, size, size, r, 40, '#000', 0.08);
  return c;
}

// galvanized standing-seam tin with rust streaks: U along the eave (8 panels per tile), V down the slope
export function tinRoof(seed = 5, size = 1024) {
  const [c, g] = cv(size, size),
    r = rng(seed),
    pw = size / 8;
  for (let i = 0; i < 8; i++) {
    const v = 150 + r() * 28;
    g.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
    g.fillRect(i * pw, 0, pw, size);
    const gr = g.createLinearGradient(i * pw, 0, (i + 1) * pw, 0);
    gr.addColorStop(0, 'rgba(255,255,255,.28)');
    gr.addColorStop(0.08, 'rgba(0,0,0,.25)');
    gr.addColorStop(0.16, 'rgba(0,0,0,0)');
    gr.addColorStop(0.94, 'rgba(0,0,0,.12)');
    gr.addColorStop(1, 'rgba(255,255,255,.2)');
    g.fillStyle = gr;
    g.fillRect(i * pw, 0, pw, size);
  }
  for (let i = 0; i < 1400; i++) {
    const v = r() > 0.5 ? 255 : 60;
    g.fillStyle = `rgba(${v},${v},${v},${r() * 0.07})`;
    const s = 4 + r() * 22;
    g.beginPath();
    g.ellipse(r() * size, r() * size, s, s * 0.7, r() * 3, 0, 6.283);
    g.fill();
  } // spangle
  g.fillStyle = 'rgba(120,70,40,.2)';
  g.fillRect(2 * pw, 0, pw, size);
  g.fillStyle = 'rgba(236,242,246,.26)';
  g.fillRect(5 * pw, 0, pw, size);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '250,250,250' : '50,50,50'},${0.12 + r() * 0.2})`;
    g.lineWidth = 1 + r() * 2;
    const x = r() * size,
      y = r() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 70, y + (r() - 0.5) * 30);
    g.stroke();
  }
  for (let i = 0; i < 125; i++) {
    const x = (Math.floor(r() * 8) + (r() > 0.5 ? 0.04 : 0.5)) * pw + r() * 8,
      y = r() * size * 0.8,
      l = 80 + r() * 380,
      w = 3 + r() * 12;
    const gr = g.createLinearGradient(0, y, 0, y + l);
    const a = 0.25 + r() * 0.5;
    gr.addColorStop(0, `rgba(140,62,22,${a})`);
    gr.addColorStop(0.3, `rgba(160,84,36,${a * 0.6})`);
    gr.addColorStop(1, 'rgba(160,90,40,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, w, l);
    g.fillStyle = `rgba(96,40,14,${a})`;
    g.beginPath();
    g.arc(x + w / 2, y, w * 0.7, 0, 6.283);
    g.fill();
  }
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(125,58,24,${0.2 + r() * 0.25})`;
    const x = r() * size,
      y = r() * size;
    for (let k = 0; k < 30; k++) {
      g.beginPath();
      g.arc(x + (r() - 0.5) * 90, y + (r() - 0.5) * 60, 3 + r() * 14, 0, 6.283);
      g.fill();
    }
  }
  for (let i = 0; i < 8; i++)
    for (let y = 30; y < size; y += 128) {
      g.fillStyle = 'rgba(40,40,40,.55)';
      g.fillRect(i * pw + pw * 0.5 - 2, y, 4, 4);
      g.fillStyle = 'rgba(255,255,255,.4)';
      g.fillRect(i * pw + pw * 0.5 - 2, y, 2, 2);
    }
  return c;
}

function rope(g, x, y, w, h, rad, th, r) {
  const per = 2 * (w + h - 4 * rad) + 6.283 * rad,
    n = Math.floor(per / (th * 0.9));
  const pt = (t) => {
    let d = t * per;
    const segs = [
      [w - 2 * rad, 0],
      [1.5708 * rad, 1],
      [h - 2 * rad, 2],
      [1.5708 * rad, 3],
      [w - 2 * rad, 4],
      [1.5708 * rad, 5],
      [h - 2 * rad, 6],
      [1.5708 * rad, 7],
    ];
    for (const [l, k] of segs) {
      if (d <= l) {
        const f = d / l;
        switch (k) {
          case 0:
            return [x + rad + d, y, 0];
          case 1: {
            const a = -1.5708 + f * 1.5708;
            return [x + w - rad + Math.cos(a) * rad, y + rad + Math.sin(a) * rad, a + 1.5708];
          }
          case 2:
            return [x + w, y + rad + d, 1.5708];
          case 3: {
            const a = f * 1.5708;
            return [x + w - rad + Math.cos(a) * rad, y + h - rad + Math.sin(a) * rad, a + 1.5708];
          }
          case 4:
            return [x + w - rad - d, y + h, 3.1416];
          case 5: {
            const a = 1.5708 + f * 1.5708;
            return [x + rad + Math.cos(a) * rad, y + h - rad + Math.sin(a) * rad, a + 1.5708];
          }
          case 6:
            return [x, y + h - rad - d, 4.712];
          default: {
            const a = 3.1416 + f * 1.5708;
            return [x + rad + Math.cos(a) * rad, y + rad + Math.sin(a) * rad, a + 1.5708];
          }
        }
      }
      d -= l;
    }
    return [x, y, 0];
  };
  for (let i = 0; i < n; i++) {
    const [px, py, a] = pt(i / n);
    g.save();
    g.translate(px, py);
    g.rotate(a + 0.9);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath();
    g.ellipse(2, 3, th * 0.75, th * 0.36, 0, 0, 6.283);
    g.fill();
    const v = 170 + r() * 40;
    g.fillStyle = `rgb(${v + 30},${v + 8},${v - 50})`;
    g.beginPath();
    g.ellipse(0, 0, th * 0.75, th * 0.36, 0, 0, 6.283);
    g.fill();
    g.strokeStyle = 'rgba(90,60,20,.6)';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = 'rgba(255,245,210,.35)';
    g.beginPath();
    g.ellipse(-2, -2, th * 0.4, th * 0.1, 0, 0, 6.283);
    g.fill();
    g.restore();
  }
}
function heron(g, x, y, s, col) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = col;
  g.strokeStyle = col;
  g.lineCap = 'round';
  g.beginPath();
  g.ellipse(0, 0, 34, 17, -0.25, 0, 6.283);
  g.fill();
  g.beginPath();
  g.moveTo(-30, 4);
  g.lineTo(-58, 22);
  g.lineTo(-20, 12);
  g.fill();
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(24, -8);
  g.bezierCurveTo(52, -20, 10, -44, 34, -66);
  g.stroke();
  g.beginPath();
  g.ellipse(38, -70, 10, 7, 0.2, 0, 6.283);
  g.fill();
  g.beginPath();
  g.moveTo(44, -74);
  g.lineTo(82, -66);
  g.lineTo(44, -66);
  g.fill();
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(30, -76);
  g.lineTo(8, -84);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-4, 14);
  g.lineTo(-8, 78);
  g.moveTo(8, 14);
  g.lineTo(14, 44);
  g.lineTo(4, 78);
  g.stroke();
  g.restore();
}

// the roof name board (our own design): navy plank board, cream slab letters with a coral drop, heron-at-low-tide emblem, rope border
export function nameBoard(seed = 11) {
  const W = 2048,
    H = 448,
    [c, g] = cv(W, H),
    r = rng(seed);
  g.fillStyle = PAL.navy;
  g.fillRect(0, 0, W, H);
  const fade = g.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(190,215,220,.34)');
  fade.addColorStop(0.5, 'rgba(190,215,220,.1)');
  fade.addColorStop(1, 'rgba(0,0,0,.2)');
  g.fillStyle = fade;
  g.fillRect(0, 0, W, H);
  grain(g, W, H, r, 900, '#0a2233', 0.5);
  grain(g, W, H, r, 300, '#6f9bb0', 0.25);
  for (let i = 1; i < 4; i++) {
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(0, (i * H) / 4 - 2, W, 3);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(0, (i * H) / 4 + 1, W, 2);
  }
  // emblem
  const ex = 240,
    ey = H / 2,
    er = 150;
  g.save();
  g.beginPath();
  g.arc(ex, ey, er, 0, 6.283);
  g.fillStyle = PAL.cream;
  g.fill();
  g.clip();
  const sk = g.createLinearGradient(0, ey - er, 0, ey + 30);
  sk.addColorStop(0, '#f6d48a');
  sk.addColorStop(1, '#ee8e63');
  g.fillStyle = sk;
  g.fillRect(ex - er, ey - er, 2 * er, er + 40);
  g.fillStyle = PAL.sun;
  g.beginPath();
  g.arc(ex - 30, ey + 40, 74, 0, 6.283);
  g.fill();
  g.strokeStyle = 'rgba(255,240,200,.7)';
  g.lineWidth = 5;
  for (let i = 0; i < 9; i++) {
    const a = 3.1416 + ((i + 0.5) / 9) * 3.1416;
    g.beginPath();
    g.moveTo(ex - 30 + Math.cos(a) * 86, ey + 40 + Math.sin(a) * 86);
    g.lineTo(ex - 30 + Math.cos(a) * 118, ey + 40 + Math.sin(a) * 118);
    g.stroke();
  }
  g.fillStyle = '#2f7f8f';
  g.fillRect(ex - er, ey + 40, 2 * er, er);
  g.strokeStyle = 'rgba(241,230,204,.8)';
  g.lineWidth = 4;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    const y = ey + 58 + i * 20;
    for (let x = ex - er; x < ex + er; x += 8) g.lineTo(x, y + Math.sin(x * 0.07 + i) * 3);
    g.stroke();
  }
  g.fillStyle = '#d8c79a';
  g.beginPath();
  g.ellipse(ex + 50, ey + 118, 120, 30, 0, 0, 6.283);
  g.fill();
  heron(g, ex + 22, ey + 22, 1.15, PAL.navy);
  g.restore();
  g.lineWidth = 12;
  g.strokeStyle = PAL.coral;
  g.beginPath();
  g.arc(ex, ey, er, 0, 6.283);
  g.stroke();
  g.lineWidth = 4;
  g.strokeStyle = PAL.cream;
  g.beginPath();
  g.arc(ex, ey, er + 10, 0, 6.283);
  g.stroke();
  // lettering
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const tx = 1150;
  g.font = `bold 218px ${F.slab}`;
  const t = "LOW TIDE LOLA'S";
  let fs = 218;
  while (g.measureText(t).width > 1440 && fs > 80) {
    fs -= 4;
    g.font = `bold ${fs}px ${F.slab}`;
  }
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillText(t, tx + 12, 258);
  g.fillStyle = PAL.coralDark;
  g.fillText(t, tx + 7, 252);
  g.fillStyle = PAL.coral;
  g.fillText(t, tx + 4, 249);
  g.fillStyle = PAL.cream;
  g.fillText(t, tx, 244);
  g.strokeStyle = 'rgba(255,255,255,.5)';
  g.lineWidth = 2;
  g.strokeText(t, tx - 1, 243);
  g.font = `italic 62px ${F.script}`;
  g.fillStyle = PAL.sun;
  g.fillText(BAR.tagline, tx, 340);
  g.font = `bold 34px ${F.slab}`;
  g.fillStyle = PAL.mint;
  g.fillText('COLD  BEER   •   CONCH  FRITTERS   •   LIVE  MUSIC', tx, 398);
  g.fillStyle = PAL.cream;
  g.font = `bold 30px ${F.slab}`;
  g.fillText('★  KEY PALOMA  ★  EST. 1968  ★', tx, 62);
  g.strokeStyle = PAL.sun;
  g.lineWidth = 4;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(tx + s * 330, 52);
    g.lineTo(tx + s * 700, 52);
    g.stroke();
  }
  chips(g, W, H, r, 260, '#8d8473', 7);
  chips(g, W, H, r, 120, '#5d564b', 3);
  for (let i = 0; i < 26; i++) {
    const x = r() * W,
      l = 60 + r() * 200;
    const gr = g.createLinearGradient(0, 0, 0, l);
    gr.addColorStop(0, 'rgba(230,235,230,.2)');
    gr.addColorStop(1, 'rgba(230,235,230,0)');
    g.fillStyle = gr;
    g.save();
    g.translate(x, 20);
    g.fillRect(0, 0, 4 + r() * 10, l);
    g.restore();
  }
  rope(g, 26, 26, W - 52, H - 52, 40, 22, r);
  for (const [x, y] of [
    [60, 60],
    [W - 60, 60],
    [60, H - 60],
    [W - 60, H - 60],
    [W / 2, 20],
    [W / 2, H - 20],
  ]) {
    g.fillStyle = '#3a3a38';
    g.beginPath();
    g.arc(x, y, 9, 0, 6.283);
    g.fill();
    g.fillStyle = '#9a9a94';
    g.beginPath();
    g.arc(x - 2, y - 2, 4, 0, 6.283);
    g.fill();
    g.fillStyle = 'rgba(140,62,22,.5)';
    g.fillRect(x - 3, y + 6, 6, 40);
  }
  return c;
}

export function chalkboard(beers = ['Tern Key Lager', 'Marinero & Zafra'], seed = 12) {
  const W = 768,
    H = 1088,
    [c, g] = cv(W, H),
    r = rng(seed);
  g.fillStyle = '#23292a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.035})`;
    g.save();
    g.translate(r() * W, r() * H);
    g.rotate(r() * 3);
    g.fillRect(0, 0, 60 + r() * 220, 8 + r() * 30);
    g.restore();
  }
  const T = (s, x, y, px, col = '#f4f1e6', al = 'left', f = F.chalk) => {
    g.font = `${px}px ${f}`;
    g.textAlign = al;
    g.fillStyle = col;
    g.globalAlpha = 0.92;
    g.fillText(s, x, y);
    g.globalAlpha = 1;
  };
  T("TODAY AT LOLA'S", W / 2, 84, 56, '#ffd66b', 'center');
  g.strokeStyle = '#ff9c8a';
  g.lineWidth = 4;
  g.beginPath();
  for (let x = 70; x < W - 70; x += 10) g.lineTo(x, 106 + Math.sin(x * 0.09) * 5);
  g.stroke();
  const food = [
    ['Conch fritters (6)', '8.50'],
    ['Smoked fish dip + saltines', '9'],
    ['Peel-n-eat shrimp  1/2 lb', '13'],
    ['Grouper sandwich, slaw', '16.50'],
    ['Cuban mix, pressed', '11'],
    ['Lobster roll (in season!)', '19'],
    ['Key lime pie, slice', '6'],
  ];
  let y = 168;
  T('EATS', 48, y, 34, '#9fe0c8');
  y += 46;
  for (const [n, p] of food) {
    T(n, 48, y, 30);
    T('$' + p, W - 48, y, 30, '#ffd66b', 'right');
    g.fillStyle = 'rgba(244,241,230,.35)';
    const w0 = g.measureText('$' + p).width;
    g.font = `30px ${F.chalk}`;
    const w1 = g.measureText(n).width;
    for (let x = 60 + w1; x < W - 60 - w0; x += 14) g.fillRect(x, y - 6, 3, 3);
    y += 44;
  }
  y += 22;
  T('COLD ONES', 48, y, 34, '#9fe0c8');
  y += 46;
  const drinks = [
    [beers[0] + ' draft', '5'],
    ['Low Tide Light, can', '3.50'],
    ["Lola's rum runner", '9'],
    [beers[1], '7'],
    ['Bucket of 5 (ice cold)', '20'],
    ['Fresh limeade', '4'],
  ];
  for (const [n, p] of drinks) {
    T(n, 48, y, 30);
    T('$' + p, W - 48, y, 30, '#ffd66b', 'right');
    y += 44;
  }
  y += 30;
  g.save();
  g.translate(W / 2, y + 10);
  g.rotate(-0.04);
  T('HAPPY HOUR 4-6', 0, 0, 46, '#ff9c8a', 'center');
  T('$1 off drafts  •  fritters half price', 0, 46, 26, '#f4f1e6', 'center');
  g.restore();
  g.strokeStyle = '#9fe0c8';
  g.lineWidth = 4;
  g.beginPath();
  const fx = 120,
    fy = H - 92;
  g.ellipse(fx, fy, 60, 26, 0, 0, 6.283);
  g.moveTo(fx + 58, fy);
  g.lineTo(fx + 100, fy - 28);
  g.lineTo(fx + 100, fy + 28);
  g.closePath();
  g.stroke();
  g.beginPath();
  g.arc(fx - 34, fy - 6, 4, 0, 6.283);
  g.stroke();
  T('cash is king. cards OK.', W - 48, H - 78, 24, '#f4f1e6', 'right');
  T('no shirt, no shoes: no problem', W - 48, H - 44, 22, '#ffd66b', 'right');
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(35,41,42,${r() * 0.5})`;
    g.fillRect(r() * W, r() * H, 2, 2);
  }
  return c;
}

export function banner(seed = 13) {
  const W = 1536,
    H = 512,
    [c, g] = cv(W, H),
    r = rng(seed);
  g.fillStyle = '#f6efdc';
  g.fillRect(0, 0, W, H);
  g.fillStyle = PAL.sea;
  g.fillRect(0, 0, W, 34);
  g.fillRect(0, H - 34, W, 34);
  g.fillStyle = PAL.sun;
  for (let x = 0; x < W; x += 64) {
    g.beginPath();
    g.moveTo(x, 34);
    g.lineTo(x + 32, 62);
    g.lineTo(x + 64, 34);
    g.fill();
  }
  g.textAlign = 'center';
  g.font = `bold 44px ${F.hand}`;
  g.fillStyle = PAL.sea;
  g.fillText('42nd  ANNUAL', W / 2, 122);
  g.font = `130px ${F.block}`;
  g.save();
  g.translate(W / 2, 250);
  g.rotate(-0.015);
  g.fillStyle = PAL.coralDark;
  g.fillText('COCONUT REGATTA', 6, 6);
  g.fillStyle = PAL.coral;
  g.fillText('COCONUT REGATTA', 0, 0);
  g.restore();
  g.font = `bold 52px ${F.hand}`;
  g.fillStyle = PAL.sea;
  g.fillText('KEY PALOMA  •  SAT. JUNE 14', W / 2, 330);
  g.font = `40px ${F.hand}`;
  g.fillStyle = '#3b3b3b';
  g.fillText('homemade boats • rum punch • steel drums • fish fry', W / 2, 392);
  g.font = `bold 34px ${F.hand}`;
  g.fillStyle = PAL.coralDark;
  g.fillText("sign up at the bar  —  LOW TIDE LOLA'S", W / 2, 446);
  for (const [x, s] of [
    [150, 1],
    [W - 150, -1],
  ]) {
    g.save();
    g.translate(x, 250);
    g.scale(s, 1);
    g.fillStyle = '#6b4526';
    g.beginPath();
    g.ellipse(0, 40, 80, 40, 0, 0, 3.1416);
    g.fill();
    g.strokeStyle = '#3d2614';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, 40);
    g.lineTo(0, -110);
    g.stroke();
    g.fillStyle = PAL.coral;
    g.beginPath();
    g.moveTo(6, -106);
    g.lineTo(86, 20);
    g.lineTo(6, 20);
    g.fill();
    g.fillStyle = PAL.sun;
    g.beginPath();
    g.moveTo(-6, -80);
    g.lineTo(-60, 20);
    g.lineTo(-6, 20);
    g.fill();
    g.strokeStyle = PAL.sea;
    g.lineWidth = 5;
    g.beginPath();
    for (let i = -110; i < 110; i += 6) g.lineTo(i, 84 + Math.sin(i * 0.12) * 5);
    g.stroke();
    g.restore();
  }
  for (let i = 0; i < 16; i++) {
    const x = r() * W,
      gr = g.createLinearGradient(x, 0, x + 60, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, `rgba(60,50,30,${0.05 + r() * 0.09})`);
    gr.addColorStop(1, 'rgba(255,255,255,.1)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 60, H);
  }
  speck(g, W, H, r, 5000, 0.08);
  for (const x of [26, W / 3, (2 * W) / 3, W - 26])
    for (const y of [17, H - 17]) {
      g.fillStyle = '#b9b9b0';
      g.beginPath();
      g.arc(x, y, 11, 0, 6.283);
      g.fill();
      g.fillStyle = '#2a2a2a';
      g.beginPath();
      g.arc(x, y, 5, 0, 6.283);
      g.fill();
    }
  return c;
}

export function sandwich(seed = 14) {
  const W = 512,
    H = 768,
    [c, g] = cv(W, H),
    r = rng(seed);
  g.fillStyle = '#16323f';
  g.fillRect(0, 0, W, H);
  grain(g, W, H, r, 300, '#0a1a22', 0.5, false);
  g.strokeStyle = PAL.sun;
  g.lineWidth = 10;
  g.strokeRect(22, 22, W - 44, H - 44);
  g.textAlign = 'center';
  g.font = `150px ${F.block}`;
  g.fillStyle = PAL.sun;
  g.fillText('LIVE', W / 2, 200);
  g.fillStyle = PAL.coral;
  g.font = `128px ${F.block}`;
  g.fillText('MUSIC', W / 2, 330);
  g.font = `bold 58px ${F.hand}`;
  g.fillStyle = PAL.cream;
  g.fillText('TONIGHT 8 PM', W / 2, 420);
  g.font = `italic 52px ${F.script}`;
  g.fillStyle = PAL.mint;
  g.fillText(BAR.band, W / 2, 500);
  g.font = `bold 40px ${F.hand}`;
  g.fillStyle = PAL.cream;
  g.fillText('no cover • cold beer', W / 2, 580);
  g.fillText('dogs welcome', W / 2, 632);
  g.fillStyle = PAL.sun;
  g.font = '90px serif';
  g.fillText('♫', 90, 700);
  g.fillText('♪', W - 90, 700);
  chips(g, W, H, r, 110, '#8d8473', 5);
  speck(g, W, H, r, 3000, 0.1);
  return c;
}

export function flag() {
  const W = 512,
    H = 320,
    [c, g] = cv(W, H),
    r = rng(4);
  g.fillStyle = PAL.sea;
  g.fillRect(0, 0, W, H);
  g.fillStyle = PAL.cream;
  g.fillRect(0, H * 0.36, W, H * 0.28);
  g.fillStyle = PAL.coral;
  g.fillRect(0, H * 0.64, W, H * 0.36);
  g.fillStyle = PAL.sun;
  g.beginPath();
  g.arc(W * 0.42, H * 0.5, 84, 0, 6.283);
  g.fill();
  g.fillStyle = '#fff';
  g.save();
  g.translate(W * 0.42, H * 0.52);
  g.beginPath();
  g.ellipse(0, 0, 50, 20, -0.2, 0, 6.283);
  g.fill();
  g.beginPath();
  g.moveTo(-10, -8);
  g.lineTo(-50, -66);
  g.lineTo(26, -16);
  g.fill();
  g.beginPath();
  g.moveTo(-40, 6);
  g.lineTo(-86, 24);
  g.lineTo(-44, -10);
  g.fill();
  g.beginPath();
  g.arc(50, -16, 13, 0, 6.283);
  g.fill();
  g.fillStyle = PAL.sun;
  g.beginPath();
  g.moveTo(60, -18);
  g.lineTo(80, -12);
  g.lineTo(60, -8);
  g.fill();
  g.restore();
  // weave, sun fade (stronger toward the fly end, which is the canvas left edge), wrinkles, stains, stitched hems
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`;
    g.fillRect(0, y, W, 1);
  }
  for (let x = 0; x < W; x += 3) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
    g.fillRect(x, 0, 1, H);
  }
  const fd = g.createLinearGradient(0, 0, W, 0);
  fd.addColorStop(0, 'rgba(232,226,210,.5)');
  fd.addColorStop(0.5, 'rgba(232,226,210,.26)');
  fd.addColorStop(1, 'rgba(232,226,210,.1)');
  g.fillStyle = fd;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 22; i++) {
    const x = r() * W,
      a = (r() - 0.5) * 0.9,
      w = 10 + r() * 26;
    g.save();
    g.translate(x, H / 2);
    g.rotate(a);
    const gr = g.createLinearGradient(-w, 0, w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.45, `rgba(20,20,30,${0.1 + r() * 0.14})`);
    gr.addColorStop(0.55, `rgba(255,255,255,${0.1 + r() * 0.12})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(-w, -H, 2 * w, 2 * H);
    g.restore();
  }
  for (const [x, y, rr, col] of [
    [150, 230, 46, '90,60,25'],
    [330, 70, 30, '70,70,50'],
    [70, 110, 22, '110,80,40'],
  ]) {
    const gr = g.createRadialGradient(x, y, 2, x, y, rr);
    gr.addColorStop(0, `rgba(${col},.4)`);
    gr.addColorStop(0.7, `rgba(${col},.22)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, rr, rr * 0.7, 0.4, 0, 6.283);
    g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,.45)';
  g.setLineDash([5, 4]);
  g.lineWidth = 1.5;
  g.strokeRect(5, 5, W - 10, H - 10);
  g.setLineDash([]);
  g.fillStyle = 'rgba(240,238,228,.9)';
  g.fillRect(W - 22, 0, 22, H);
  for (const y of [20, H - 20]) {
    g.fillStyle = '#b08d3a';
    g.beginPath();
    g.arc(W - 11, y, 7, 0, 6.283);
    g.fill();
    g.fillStyle = '#2a2a2a';
    g.beginPath();
    g.arc(W - 11, y, 3, 0, 6.283);
    g.fill();
  }
  speck(g, W, H, r, 5000, 0.1);
  // frayed, torn fly end: bite ragged notches out of the left edge and leave loose threads
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(0, 0);
  let y = 0;
  while (y < H) {
    const d = 4 + r() * 16 + (y > H * 0.62 && y < H * 0.8 ? 46 : 0) + (y < 30 ? 22 : 0);
    g.lineTo(d, y);
    y += 3 + r() * 9;
    g.lineTo(d * (0.3 + r() * 0.5), y);
    y += 2 + r() * 5;
  }
  g.lineTo(0, H);
  g.closePath();
  g.fill();
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(60 + r() * 380, r() * H, 2 + r() * 3, 1.5 + r() * 2, 0, 0, 6.283);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    const yy = r() * H;
    g.strokeStyle = [PAL.sea, PAL.cream, PAL.coral][yy < H * 0.36 ? 0 : yy < H * 0.64 ? 1 : 2];
    g.beginPath();
    g.moveTo(26, yy);
    g.quadraticCurveTo(12, yy + (r() - 0.5) * 14, r() * 8, yy + (r() - 0.5) * 22);
    g.stroke();
  }
  return c;
}

// neon tube art on black: a design-system brand logo when one is passed, otherwise plain tube lettering
export function neon(text, color, brand = null, sub = '') {
  const W = 768,
    H = 384,
    [c, g] = cv(W, H);
  g.fillStyle = '#0a0a0c';
  g.fillRect(0, 0, W, H);
  g.shadowColor = color;
  g.lineJoin = 'round';
  let ok = false;
  if (brand?.drawLogo) {
    try {
      for (const b of [40, 16, 4]) {
        g.shadowBlur = b;
        brand.drawLogo(g, 70, 50, W - 140, H - (sub ? 150 : 100), {
          mono: b === 4 ? '#ffffff' : color,
        });
      }
      ok = true;
    } catch (e) {
      ok = false;
    }
  }
  if (!ok) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let fs = 170;
    g.font = `${fs}px ${F.script}`;
    while (g.measureText(text).width > W - 120 && fs > 40) {
      fs -= 6;
      g.font = `${fs}px ${F.script}`;
    }
    for (const [b, w, col] of [
      [44, 14, color],
      [18, 9, color],
      [3, 3, '#ffffff'],
    ]) {
      g.shadowBlur = b;
      g.strokeStyle = col;
      g.lineWidth = w;
      g.strokeText(text, W / 2, sub ? 150 : H / 2);
    }
  }
  if (sub) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 64px ${F.hand}`;
    for (const [b, w, col] of [
      [30, 7, '#ffd66b'],
      [3, 2, '#fff'],
    ]) {
      g.shadowBlur = b;
      g.strokeStyle = col;
      g.lineWidth = w;
      g.strokeText(sub, W / 2, H - 70);
    }
  }
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255,255,255,.08)';
  g.lineWidth = 6;
  g.strokeRect(14, 14, W - 28, H - 28);
  return c;
}

// alpha art ---------------------------------------------------------------
export function lattice(size = 256) {
  const [c, g] = cv(size, size);
  g.clearRect(0, 0, size, size);
  g.lineWidth = size / 11;
  for (const s of [1, -1])
    for (let i = -4; i < 8; i++) {
      g.strokeStyle = s > 0 ? '#e9e2d2' : '#d6cebb';
      g.beginPath();
      g.moveTo((i * size) / 4, s > 0 ? 0 : size);
      g.lineTo((i * size) / 4 + size, s > 0 ? size : 0);
      g.stroke();
    }
  return c;
}
// flat sawn "gingerbread" balusters with a pineapple cut-out (classic conch-house rail); tiles along U (4 balusters)
export function balusters(size = 512) {
  const [c, g] = cv(size, size),
    r = rng(8),
    n = 4,
    w = size / n;
  g.clearRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    const x = i * w + w / 2;
    g.fillStyle = '#f2f0ea';
    g.beginPath();
    g.moveTo(x - w * 0.2, 0);
    g.bezierCurveTo(x - w * 0.52, size * 0.25, x - w * 0.52, size * 0.42, x - w * 0.2, size * 0.5);
    g.bezierCurveTo(x - w * 0.5, size * 0.62, x - w * 0.5, size * 0.85, x - w * 0.24, size);
    g.lineTo(x + w * 0.24, size);
    g.bezierCurveTo(x + w * 0.5, size * 0.85, x + w * 0.5, size * 0.62, x + w * 0.2, size * 0.5);
    g.bezierCurveTo(x + w * 0.52, size * 0.42, x + w * 0.52, size * 0.25, x + w * 0.2, 0);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.ellipse(x, size * 0.72, w * 0.13, size * 0.1, 0, 0, 6.283);
    g.fill();
    g.beginPath();
    g.moveTo(x, size * 0.56);
    g.lineTo(x - w * 0.1, size * 0.47);
    g.lineTo(x, size * 0.5);
    g.lineTo(x + w * 0.1, size * 0.47);
    g.fill();
    g.beginPath();
    g.arc(x, size * 0.24, w * 0.1, 0, 6.283);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  g.globalCompositeOperation = 'source-atop';
  grain(g, size, size, r, 200, '#a8a294', 0.4, false);
  chips(g, size, size, r, 50, '#8d8473', 4);
  g.globalCompositeOperation = 'source-over';
  return c;
}
function leaf(g, x, y, l, w, a, col, vein) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(l * 0.3, -w, l * 0.8, -w * 0.7, l, 0);
  g.bezierCurveTo(l * 0.8, w * 0.7, l * 0.3, w, 0, 0);
  g.fill();
  if (vein) {
    g.strokeStyle = vein;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(l * 0.95, 0);
    g.stroke();
  }
  g.restore();
}
export function foliage(kind, seed = 20, size = 512) {
  const [c, g] = cv(size, size),
    r = rng(seed);
  g.clearRect(0, 0, size, size);
  const cx = size / 2,
    by = size * 0.98;
  if (kind === 'frond') {
    g.strokeStyle = '#5d7a2c';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0, size / 2);
    g.lineTo(size, size / 2);
    g.stroke();
    for (let i = 0; i < 64; i++) {
      const x = 16 + (i * (size - 30)) / 64,
        l =
          size * 0.47 * Math.sin(Math.min(1, (i + 6) / 30) * 1.57) * (1 - Math.max(0, i - 44) / 26);
      for (const s of [-1, 1]) {
        const v = 70 + r() * 60;
        leaf(
          g,
          x,
          size / 2,
          l * (0.85 + r() * 0.2),
          5 + r() * 3,
          s * (1.15 + r() * 0.15),
          `rgb(${v * 0.42 + 18},${v * 0.72 + 34},${v * 0.22 + 10})`,
        );
      }
    }
    return c;
  }
  const N = kind === 'grape' ? 70 : 150;
  for (let i = 0; i < N; i++) {
    const a = -1.5708 + (r() - 0.5) * 2.6,
      d = Math.pow(r(), 0.6) * size * 0.46,
      x = cx + Math.cos(a) * d * 1.05,
      y = by + Math.sin(a) * d * 1.9,
      la = a + (r() - 0.5) * 1.4;
    if (kind === 'croton') {
      const cs = ['#c8371d', '#e9a21b', '#3f7a2a', '#7a1f2a', '#d7c02a', '#2e5f24', '#e8612a'],
        col = cs[Math.floor(r() * cs.length)];
      leaf(g, x, y, 46 + r() * 34, 11 + r() * 6, la, col, r() > 0.4 ? '#f3d23a' : '#e9532a');
    } else if (kind === 'hibiscus') {
      const v = 40 + r() * 50;
      leaf(
        g,
        x,
        y,
        34 + r() * 22,
        12 + r() * 6,
        la,
        `rgb(${v * 0.38 + 8},${v * 0.8 + 30},${v * 0.36 + 6})`,
        'rgba(170,200,130,.45)',
      );
    } else if (kind === 'grape') {
      const v = 45 + r() * 50;
      g.fillStyle = `rgb(${v * 0.5 + 10},${v * 0.8 + 34},${v * 0.42 + 8})`;
      g.beginPath();
      g.ellipse(x, y, 26 + r() * 12, 24 + r() * 10, r() * 3, 0, 6.283);
      g.fill();
      g.strokeStyle = 'rgba(190,60,50,.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 18, y);
      g.lineTo(x + 18, y);
      g.stroke();
    } else {
      const v = 60 + r() * 60;
      leaf(
        g,
        x,
        y,
        70 + r() * 60,
        6 + r() * 4,
        la,
        `rgb(${v * 0.7 + 30},${v * 0.8 + 40},${v * 0.35 + 10})`,
      );
    }
  }
  if (kind === 'hibiscus')
    for (let i = 0; i < 6; i++) {
      const x = size * (0.15 + r() * 0.7),
        y = size * (0.12 + r() * 0.6);
      for (let p = 0; p < 5; p++)
        leaf(g, x, y, 20, 10, (p / 5) * 6.283, p % 2 ? '#e3223a' : '#f0384c');
      g.fillStyle = '#ffd23a';
      g.beginPath();
      g.arc(x, y, 5, 0, 6.283);
      g.fill();
    }
  return c;
}
export function tracks(seed = 30, size = 1024) {
  const [c, g] = cv(size, size),
    r = rng(seed);
  g.clearRect(0, 0, size, size);
  g.lineCap = 'round';
  const path = (off, w, a) => {
    g.strokeStyle = `rgba(104,90,66,${a})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(size * 0.62 + off, size);
    g.bezierCurveTo(
      size * 0.62 + off,
      size * 0.6,
      size * 0.86 + off * 0.6,
      size * 0.6,
      size * 0.86 + off * 0.5,
      size * 0.2,
    );
    g.stroke();
  };
  for (const o of [-24, 24]) {
    path(o, 11, 0.2);
    path(o, 6, 0.2);
    path(o + 3, 2, 0.25);
  }
  for (const o of [-20, 30]) {
    g.save();
    g.translate(-size * 0.3, 0);
    path(o, 10, 0.13);
    path(o, 5, 0.14);
    g.restore();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(96,84,62,${r() * 0.1})`;
    g.beginPath();
    g.ellipse(r() * size, r() * size, 20 + r() * 90, 14 + r() * 50, r() * 3, 0, 6.283);
    g.fill();
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(40,36,30,${0.1 + r() * 0.12})`;
    g.beginPath();
    g.ellipse(
      size * (0.78 + r() * 0.12),
      size * (0.2 + r() * 0.2),
      5 + r() * 9,
      4 + r() * 6,
      0,
      0,
      6.283,
    );
    g.fill();
  }
  return c;
}
export function label(brand, text, a = PAL.sea, b = PAL.cream) {
  const [c, g] = cv(256, 128);
  g.fillStyle = a;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = b;
  g.fillRect(0, 12, 256, 6);
  g.fillRect(0, 110, 256, 6);
  let ok = false;
  if (brand?.drawLogoOn) {
    try {
      brand.drawLogoOn(g, a, 20, 26, 216, 76, {});
      ok = true;
    } catch (e) {
      ok = false;
    }
  }
  if (!ok) {
    g.fillStyle = b;
    g.textAlign = 'center';
    g.font = `bold 44px ${F.slab}`;
    g.fillText(text, 128, 80, 220);
  }
  return c;
}
export function rug() {
  const [c, g] = cv(256, 256);
  const cs = [PAL.coral, PAL.cream, PAL.sea, PAL.sun, PAL.navy];
  for (let i = 0; i < 16; i++) {
    g.fillStyle = cs[i % cs.length];
    g.fillRect(0, i * 16, 256, 16);
  }
  const r = rng(6);
  speck(g, 256, 256, r, 5000, 0.2);
  return c;
}
export function mailboxArt() {
  const [c, g] = cv(256, 128);
  g.fillStyle = PAL.coral;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = PAL.cream;
  g.textAlign = 'center';
  g.font = `bold 54px ${F.hand}`;
  g.fillText("LOLA'S", 128, 60);
  g.font = `bold 40px ${F.slab}`;
  g.fillText('1968 US-1', 128, 108);
  const r = rng(9);
  chips(g, 256, 128, r, 40, '#8a8a84', 4);
  return c;
}
// crushed shell and coral gravel, pale and sun-bleached (tileable enough at 2.6 m; bumps come from a real gravel normal map)
export function shellGravel(seed = 40, size = 1024) {
  const [c, g] = cv(size, size),
    r = rng(seed);
  g.fillStyle = '#ddd5c0';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '120,105,80' : '255,250,235'},${0.04 + r() * 0.07})`;
    g.beginPath();
    g.ellipse(r() * size, r() * size, 40 + r() * 140, 30 + r() * 90, r() * 3, 0, 6.283);
    g.fill();
  }
  const cs = [
    '#f6f1e4',
    '#fffdf6',
    '#c9bfa6',
    '#b3a78c',
    '#e9dcc0',
    '#9c917c',
    '#f0e4d0',
    '#d6b9a0',
    '#8a8272',
  ];
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = cs[Math.floor(r() * cs.length)];
    g.globalAlpha = 0.55 + r() * 0.45;
    const s = 1.5 + r() * 4.5;
    g.beginPath();
    g.ellipse(r() * size, r() * size, s, s * (0.5 + r() * 0.5), r() * 3, 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(60,50,38,${r() * 0.35})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r());
  }
  return c;
}

// what years of customers leave on one picnic table top (transparent overlay, 1.85 x 0.75 m): glass rings, spills, carved
// initials, cigarette burns, gull droppings, sun-bleached lanes, grime in the gaps. missing = index of a missing board (-1 none)
export function tableMarks(seed = 50, missing = -1) {
  const W = 1024,
    H = 416,
    [c, g] = cv(W, H),
    r = rng(seed);
  g.clearRect(0, 0, W, H);
  for (let i = 1; i < 5; i++) {
    g.fillStyle = 'rgba(30,24,16,.55)';
    g.fillRect(0, (i * H) / 5 - 2, W, 4);
    for (let k = 0; k < 30; k++) {
      g.fillStyle = `rgba(60,48,30,${r() * 0.25})`;
      g.fillRect(r() * W, (i * H) / 5 - 6 + r() * 12, 10 + r() * 50, 2 + r() * 4);
    }
  }
  for (let i = 0; i < 4; i++) {
    const y = r() * H,
      gr = g.createLinearGradient(0, y, 0, y + 50);
    gr.addColorStop(0, 'rgba(240,236,224,0)');
    gr.addColorStop(0.5, `rgba(240,236,224,${0.12 + r() * 0.16})`);
    gr.addColorStop(1, 'rgba(240,236,224,0)');
    g.fillStyle = gr;
    g.fillRect(0, y, W, 50);
  }
  for (let i = 0; i < 7 + r() * 8; i++) {
    const x = 40 + r() * (W - 80),
      y = 30 + r() * (H - 60),
      rr = 15 + r() * 6,
      dark = r() > 0.35;
    g.strokeStyle = dark
      ? `rgba(70,48,22,${0.3 + r() * 0.3})`
      : `rgba(250,246,236,${0.3 + r() * 0.25})`;
    g.lineWidth = 2 + r() * 2.5;
    g.beginPath();
    g.arc(x, y, rr, r() * 6.283, r() * 6.283 + 4 + r() * 2.3);
    g.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const x = r() * W,
      y = r() * H,
      gr = g.createRadialGradient(x, y, 3, x, y, 40 + r() * 60);
    gr.addColorStop(0, `rgba(80,56,28,${0.22 + r() * 0.18})`);
    gr.addColorStop(0.75, 'rgba(80,56,28,.12)');
    gr.addColorStop(1, 'rgba(80,56,28,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, 60 + r() * 60, 30 + r() * 40, r() * 3, 0, 6.283);
    g.fill();
  }
  const carve = (t, x, y, px, a) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.font = `${px}px "Marker Felt","Comic Sans MS",cursive`;
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(245,238,220,.55)';
    g.lineWidth = 5;
    g.strokeText(t, 1.5, 1.5);
    g.strokeStyle = 'rgba(58,44,30,.9)';
    g.lineWidth = 2.6;
    g.strokeText(t, 0, 0);
    g.restore();
  };
  const names = [
    ['J + M', "KP '09", 'LOLA 4EVR'],
    ['RIP TIDE', 'D.R. \u2665 S.K.', 'GO SNAPPERS'],
    ['TERN KEY OR BUST', 'B + L', "'98"],
    ['SAL WUZ HERE', 'M \u2665 T', 'NO BAIT'],
    ['CONCH LIFE', 'A.J.', 'REGATTA 22'],
  ][seed % 5];
  names.forEach((t, i) =>
    carve(
      t.replace('\\u2665', '\u2665'),
      60 + r() * (W - 420),
      60 + (i * (H - 90)) / 3 + r() * 40,
      30 + r() * 16,
      (r() - 0.5) * 0.5,
    ),
  );
  g.strokeStyle = 'rgba(58,44,30,.85)';
  g.lineWidth = 2.4;
  for (let i = 0; i < 2; i++) {
    const x = 100 + r() * (W - 200),
      y = 60 + r() * (H - 120),
      k = 14 + r() * 8;
    g.beginPath();
    g.moveTo(x, y + k);
    g.bezierCurveTo(x - k * 1.6, y - k * 0.4, x - k * 0.4, y - k * 1.2, x, y - k * 0.3);
    g.bezierCurveTo(x + k * 0.4, y - k * 1.2, x + k * 1.6, y - k * 0.4, x, y + k);
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const x = r() * W,
      y = r() * H;
    g.fillStyle = 'rgba(20,16,12,.8)';
    g.beginPath();
    g.ellipse(x, y, 5 + r() * 4, 3 + r() * 2, r() * 3, 0, 6.283);
    g.fill();
    g.strokeStyle = 'rgba(120,90,50,.5)';
    g.lineWidth = 2;
    g.stroke();
  }
  for (let i = 0; i < 2 + r() * 2; i++) {
    const x = r() * W,
      y = r() * H;
    g.fillStyle = 'rgba(244,244,236,.9)';
    g.beginPath();
    g.ellipse(x, y, 9 + r() * 8, 6 + r() * 5, r() * 3, 0, 6.283);
    g.fill();
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc(x + (r() - 0.5) * 44, y + (r() - 0.5) * 34, 1.5 + r() * 3, 0, 6.283);
      g.fill();
    }
    g.fillStyle = 'rgba(70,74,60,.7)';
    g.beginPath();
    g.ellipse(x + 2, y + 1, 3, 2, 0, 0, 6.283);
    g.fill();
  }
  for (const x of [26, W - 26, W * 0.13, W * 0.87])
    for (let i = 0; i < 5; i++) {
      const y = ((i + 0.5) * H) / 5;
      g.fillStyle = 'rgba(96,52,24,.5)';
      g.fillRect(x - 2, y, 4, 18 + r() * 14);
      g.fillStyle = '#5a5650';
      g.beginPath();
      g.arc(x, y, 4, 0, 6.283);
      g.fill();
    }
  if (missing >= 0) g.clearRect(0, (missing * H) / 5 - 3, W, H / 5 + 6);
  return c;
}
// traffic on the porch deck (12 x 3 m overlay): paint worn through on the walking lines, stool scrapes, spills, tracked-in sand, grime at the edges
export function porchWear(seed = 60) {
  const W = 2048,
    H = 512,
    [c, g] = cv(W, H),
    r = rng(seed);
  g.clearRect(0, 0, W, H);
  const X = (m) => ((m + 4.5) / 12) * W,
    Y = (m) => ((m + 0.75) / 3) * H;
  const lane = (pts, w, col, a) => {
    g.strokeStyle = `rgba(${col},${a})`;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.filter = 'blur(14px)';
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    g.stroke();
    g.filter = 'none';
  };
  lane(
    [
      [1.5, 2.2],
      [1.6, 0.6],
      [1.7, -0.7],
    ],
    110,
    '70,58,44',
    0.3,
  );
  lane(
    [
      [1.5, 1.6],
      [0, 0.9],
      [-3.6, 0.8],
    ],
    90,
    '70,58,44',
    0.24,
  );
  lane(
    [
      [1.6, 1.0],
      [4.5, 0.8],
      [6.2, 0.4],
    ],
    80,
    '70,58,44',
    0.2,
  );
  lane(
    [
      [1.5, 2.2],
      [1.6, 0.8],
    ],
    50,
    '226,214,186',
    0.34,
  );
  for (const sx of [-3.4, -2.55, -1.7, -0.85])
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = `rgba(40,32,24,${0.18 + r() * 0.25})`;
      g.lineWidth = 1.5 + r() * 2;
      g.beginPath();
      g.arc(
        X(sx) + (r() - 0.5) * 30,
        Y(-0.03) + (r() - 0.5) * 30,
        20 + r() * 26,
        r() * 6.283,
        r() * 6.283 + 0.6 + r(),
      );
      g.stroke();
    }
  for (let i = 0; i < 16; i++) {
    const x = r() * W,
      y = r() * H,
      gr = g.createRadialGradient(x, y, 2, x, y, 26 + r() * 50);
    gr.addColorStop(0, `rgba(48,36,22,${0.2 + r() * 0.22})`);
    gr.addColorStop(0.8, 'rgba(48,36,22,.1)');
    gr.addColorStop(1, 'rgba(48,36,22,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, 40 + r() * 50, 22 + r() * 30, r() * 3, 0, 6.283);
    g.fill();
  }
  for (let i = 0; i < 26; i++) {
    const x = X(0.6 + r() * 2),
      y = Y(0.2 + r() * 2),
      a = -1.5708 + (r() - 0.5) * 0.7;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = `rgba(226,214,186,${0.2 + r() * 0.25})`;
    g.filter = 'blur(2px)';
    g.beginPath();
    g.ellipse(0, 0, 22, 9, 0, 0, 6.283);
    g.fill();
    g.filter = 'none';
    g.restore();
  }
  for (const [y0, y1] of [
    [0, 46],
    [H - 40, H],
  ]) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(y0 ? 1 : 0, 'rgba(34,28,20,.42)');
    gr.addColorStop(y0 ? 0 : 1, 'rgba(34,28,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, y0, W, y1 - y0);
  }
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = 'rgba(110,58,24,.5)';
    g.lineWidth = 5;
    g.strokeRect(X(-4.33) + i * 3, Y(1.32) + i * 2, 118, 66);
  }
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(226,214,186,${r() * 0.5})`;
    g.fillRect(X(-0.5 + r() * 4.2), Y(0.6 + r() * 1.65), 2, 2);
  }
  return c;
}

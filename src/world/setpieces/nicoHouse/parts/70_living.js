// Nico's house, part 70: the living room. A sun-faded sofa with a serape thrown over one arm, a cable-spool coffee table
// covered in the evening's leftovers (a reel half taken apart, cans, ashtray, controller), a chipped dresser carrying an old
// flat screen that really plays the local news, a corner desk with a laptop you can read, a leather armchair, crate shelves
// with records and paperbacks, a rod rack, cast net, mounted snook, surfboard, ceiling fan with a light kit, wall clock on
// game time, window AC, original posters and snapshots. Everything is built piece by piece in house-local meters.
export const order = 70;

export function build(ctx) {
  const { THREE, kit, plan: P, imat, col } = ctx,
    I = ctx.int,
    M = kit.M,
    F = P.F,
    R = P.rooms.living,
    CEIL = F + P.ceilH;
  const r = kit.rng(7070),
    PI = Math.PI,
    v = (c, a = 0.05) => kit.vary(c, r, a),
    j = (a) => (r() - 0.5) * 2 * a;
  // ---------- materials ----------
  const IP = imat.paint({ peel: 'a', fade: 0.1 }),
    WD = imat.wood(),
    WT = imat.pbr('wood_table_worn', { rep: 0.9, gain: 1.7 });
  const FAB = imat.pbr('wool_boucle', { rep: 0.45, gain: 2.1 }),
    JER = imat.fabric('cotton_jersey', { rep: 0.3, side: THREE.DoubleSide }),
    RUG = imat.pbr('tatami_mat', { rep: 0.5, gain: 1.7 }),
    LEA = imat.pbr('fabric_leather_01', { rep: 0.55, gain: 1.45 });
  const PL = imat.plastic(),
    PG = imat.plasticGloss(),
    RB = imat.rubber(),
    MP = imat.metalPaint(),
    ST = imat.steel(),
    CH = imat.chrome(),
    CE = imat.ceramic(),
    MT = imat.matte();
  const own = (p) => {
    const m = new THREE.MeshStandardMaterial(p);
    m.userData.uvScale = 0;
    return kit.setIndirect(m);
  };
  const night = (h) => h >= 18.4 || h < 6.4;

  // ---------- helpers ----------
  const place = (x, y, z, ry = 0) => {
    const b = M(x, y, z, 0, ry, 0);
    return (lx = 0, ly = 0, lz = 0, rx = 0, r2 = 0, rz = 0) =>
      b.clone().multiply(M(lx, ly, lz, rx, r2, rz));
  };
  const lathe = (pts, seg = 16) =>
    new THREE.LatheGeometry(
      pts.map((p) => new THREE.Vector2(p[0], p[1])),
      seg,
    );
  // rounded, slightly puffed box (cushions, pillows, upholstery): thin axis = Y for the puff
  const soft = (sx, sy, sz, o = {}) => {
    const n = o.seg ?? 8,
      g = new THREE.BoxGeometry(2, 2, 2, n, Math.max(2, n >> 1), n),
      p = g.attributes.position,
      nr = g.attributes.normal;
    const hx = sx / 2,
      hy = sy / 2,
      hz = sz / 2,
      rr = Math.min(o.r ?? 0.05, hx, hy, hz),
      puff = o.puff ?? 0,
      w = (t) => Math.sign(t) * Math.pow(Math.abs(t), 0.5),
      cl = (a, b) => Math.max(-b, Math.min(b, a));
    for (let i = 0; i < p.count; i++) {
      let x = w(p.getX(i)) * hx,
        y = w(p.getY(i)) * hy,
        z = w(p.getZ(i)) * hz;
      const ix = cl(x, hx - rr),
        iy = cl(y, hy - rr),
        iz = cl(z, hz - rr);
      let dx = x - ix,
        dy = y - iy,
        dz = z - iz;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      x = ix + dx * rr;
      y = iy + dy * rr;
      z = iz + dz * rr;
      if (puff) {
        const u = x / hx,
          t = z / hz,
          k = (1 - u * u) * (1 - t * t);
        y += Math.sign(y) * k * puff * (y > 0 ? 1 : (o.puffB ?? 0.3));
        if (o.dent)
          y -=
            Math.exp(-((u - o.dent[0]) ** 2 + (t - o.dent[1]) ** 2) * 5) *
            o.dent[2] *
            (y > 0 ? 1 : 0);
      }
      p.setXYZ(i, x, y, z);
      nr.setXYZ(i, dx, dy, dz);
    }
    return g;
  };
  const ringPts = (m4, hx, hz, y, rc = 0.05, n = 4) => {
    const pts = [];
    for (const [cx, cz, a0] of [
      [hx - rc, hz - rc, 0],
      [-(hx - rc), hz - rc, 1],
      [-(hx - rc), -(hz - rc), 2],
      [hx - rc, -(hz - rc), 3],
    ])
      for (let i = 0; i <= n; i++) {
        const a = ((a0 + i / n) * PI) / 2,
          q = new THREE.Vector3(cx + Math.cos(a) * rc, y, cz + Math.sin(a) * rc).applyMatrix4(m4);
        pts.push([q.x, q.y, q.z]);
      }
    return pts;
  };
  const wpt = (m4, x, y, z) => {
    const q = new THREE.Vector3(x, y, z).applyMatrix4(m4);
    return [q.x, q.y, q.z];
  };
  // art atlas: many drawings on one canvas, one draw call
  const makeAtlas = (key, W, H, items, o) => {
    const rects = {};
    let x = 4,
      y = 4,
      rowH = 0;
    for (const [n, [w, h]] of Object.entries(items)) {
      if (x + w + 4 > W) {
        x = 4;
        y += rowH + 8;
        rowH = 0;
      }
      rects[n] = [x, y, w, h];
      x += w + 8;
      rowH = Math.max(rowH, h);
    }
    if (y + rowH > H) console.warn('[nicoHouse] atlas overflow', key, y + rowH);
    const m = imat.art(
      key,
      W,
      H,
      (g) => {
        g.fillStyle = '#8a8478';
        g.fillRect(0, 0, W, H);
        for (const [n, [w, h, draw]] of Object.entries(items)) {
          const q = rects[n];
          g.save();
          g.translate(q[0], q[1]);
          g.beginPath();
          g.rect(0, 0, w, h);
          g.clip();
          draw(g, w, h);
          g.restore();
        }
      },
      o,
    );
    const uv = (n) => {
      const q = rects[n];
      return { uvMul: [q[2] / W, q[3] / H], uvOff: [q[0] / W, 1 - (q[1] + q[3]) / H] };
    };
    return {
      m,
      uv,
      plane: (bt, n, m4, w, h) => bt.geo(m, new THREE.PlaneGeometry(w, h), m4, uv(n)),
      wrap: (bt, n, m4, rad, h, seg = 14) =>
        bt.geo(m, new THREE.CylinderGeometry(rad, rad, h, seg, 1, true), m4, uv(n)),
    };
  };
  const T = (g, s, x, y, px, c = '#111', o = {}) => {
    g.font = kit.font(px, o.w ?? 700, o.f);
    g.fillStyle = c;
    g.textAlign = o.a || 'left';
    g.textBaseline = o.b || 'alphabetic';
    g.fillText(s, x, y, o.max);
  };
  const IMPACT = 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
    SERIF = 'Georgia, "Times New Roman", serif',
    MONO = 'Menlo, Courier, monospace';
  const age = (g, w, h, seed, k = 1) => {
    const q = kit.rng(seed);
    for (let i = 0; i < 30 * k; i++) {
      g.fillStyle = `rgba(${(110 + q() * 60) | 0},${(85 + q() * 50) | 0},${(45 + q() * 40) | 0},${q() * 0.07})`;
      const s = 8 + q() * w * 0.3;
      g.beginPath();
      g.ellipse(q() * w, q() * h, s, s * (0.3 + q()), q() * 3, 0, 6.3);
      g.fill();
    }
    const lg = g.createLinearGradient(0, 0, w, h);
    lg.addColorStop(0, 'rgba(255,248,225,0.14)');
    lg.addColorStop(1, 'rgba(70,50,25,0.14)');
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);
  };
  const strokes = (g, w, h, seed, n, pal, y0 = 0, y1 = 1, len = 0.18) => {
    const q = kit.rng(seed);
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      g.strokeStyle = pal[(q() * pal.length) | 0];
      g.globalAlpha = 0.25 + q() * 0.4;
      g.lineWidth = 2 + q() * 7;
      const x = q() * w,
        y = (y0 + q() * (y1 - y0)) * h,
        l = (0.3 + q()) * len * w;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + l / 2, y + (q() - 0.5) * 8, x + l, y + (q() - 0.5) * 6);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  const palm = (g, x, y, s, c = '#1b2a22') => {
    g.strokeStyle = c;
    g.fillStyle = c;
    g.lineWidth = s * 0.07;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + s * 0.12, y - s * 0.5, x + s * 0.02, y - s);
    g.stroke();
    for (let i = 0; i < 7; i++) {
      const a = -2.9 + i * 0.45;
      g.beginPath();
      g.moveTo(x + s * 0.02, y - s);
      g.quadraticCurveTo(
        x + Math.cos(a) * s * 0.35,
        y - s - s * 0.28 + Math.abs(Math.cos(a)) * s * 0.05,
        x + Math.cos(a) * s * 0.6,
        y - s + Math.sin(a) * s * 0.1 + s * 0.22,
      );
      g.quadraticCurveTo(x + Math.cos(a) * s * 0.3, y - s - s * 0.1, x + s * 0.02, y - s);
      g.fill();
    }
  };

  // ---------- original art ----------
  const A = makeAtlas('nh70_atlas', 2048, 2048, {
    flyer: [
      400,
      600,
      (g, w, h) => {
        const lg = g.createLinearGradient(0, 0, 0, h);
        lg.addColorStop(0, '#e9a15c');
        lg.addColorStop(0.55, '#e3806a');
        lg.addColorStop(1, '#5a3a5c');
        g.fillStyle = lg;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#f6dc9a';
        g.beginPath();
        g.arc(w / 2, 300, 120, 0, 6.3);
        g.fill();
        g.fillStyle = '#e3806a';
        for (let i = 0; i < 6; i++) g.fillRect(0, 318 + i * 22, w, 5 + i * 2.2);
        palm(g, 70, 470, 190, '#2a1f33');
        palm(g, 335, 480, 150, '#2a1f33');
        g.fillStyle = '#2a1f33';
        g.fillRect(0, 462, w, 140);
        g.save();
        g.translate(w / 2, 108);
        g.rotate(-0.045);
        T(g, 'THE SALT DOGS', 0, 0, 82, '#2a1f33', { f: IMPACT, a: 'center', max: 370 });
        T(g, 'THE SALT DOGS', -3, -4, 82, '#fbf1d3', { f: IMPACT, a: 'center', max: 370 });
        g.restore();
        T(g, 'swamp-surf  ·  dock rock  ·  loud', w / 2, 150, 19, '#2a1f33', {
          a: 'center',
          w: 600,
        });
        T(g, 'with LOW TIDE LOVERS', w / 2, 505, 30, '#f6dc9a', { f: IMPACT, a: 'center' });
        T(g, '+ DJ MANGO SPINNING 45s', w / 2, 533, 19, '#e9a15c', { a: 'center' });
        T(g, 'SAT JULY 19 · DOORS 9', w / 2, 566, 24, '#fbf1d3', { a: 'center' });
        T(g, 'THE RUSTY PELICAN · KEY PALOMA · $5', w / 2, 590, 16, '#fbf1d3', {
          a: 'center',
          w: 600,
        });
        age(g, w, h, 11, 2);
        g.fillStyle = 'rgba(245,238,215,0.2)';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(60,40,30,0.25)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(0, h / 2 + 4);
        g.lineTo(w, h / 2 - 3);
        g.stroke();
      },
    ],
    chart: [
      640,
      800,
      (g, w, h) => {
        g.fillStyle = '#e9e2c6';
        g.fillRect(0, 0, w, h);
        const q = kit.rng(5);
        const keys = [
          [150, 210, 95, 34, 0.5, 'HERON CAY'],
          [330, 330, 120, 40, 0.35, 'KEY PALOMA'],
          [505, 470, 80, 30, 0.6, 'LITTLE PELICAN KEY'],
          [210, 520, 60, 22, -0.3, 'SAW PALM KEY'],
          [470, 170, 50, 20, 0.2, 'TERN ROCKS'],
          [120, 660, 85, 26, 0.45, 'CONCH BIGHT'],
        ];
        const blob = (x, y, a, b, rot, grow) => {
          g.beginPath();
          for (let i = 0; i <= 40; i++) {
            const t = (i / 40) * 6.283,
              k = 1 + Math.sin(t * 3 + x) * 0.12 + Math.sin(t * 5 + y) * 0.08,
              px = Math.cos(t) * (a + grow) * k,
              py = Math.sin(t) * (b + grow) * k;
            g.lineTo(
              x + px * Math.cos(rot) - py * Math.sin(rot),
              y + px * Math.sin(rot) + py * Math.cos(rot),
            );
          }
          g.closePath();
        };
        for (const [grow, c] of [
          [70, '#d5e3dc'],
          [40, '#bfd9d8'],
          [18, '#a7cdd3'],
        ]) {
          g.fillStyle = c;
          for (const k of keys) {
            blob(k[0], k[1], k[2], k[3], k[4], grow);
            g.fill();
          }
        }
        g.strokeStyle = 'rgba(70,110,130,0.5)';
        g.lineWidth = 1;
        for (const k of keys) {
          blob(k[0], k[1], k[2], k[3], k[4], 40);
          g.stroke();
        }
        for (const k of keys) {
          blob(k[0], k[1], k[2], k[3], k[4], 0);
          g.fillStyle = '#d9c98f';
          g.fill();
          g.strokeStyle = '#4c4a3a';
          g.lineWidth = 1.6;
          g.stroke();
          blob(k[0], k[1], k[2] * 0.7, k[3] * 0.6, k[4], 0);
          g.fillStyle = '#b7c08a';
          g.fill();
        }
        for (let i = 0; i < 150; i++)
          T(
            g,
            String(1 + ((q() * q() * 24) | 0)),
            30 + q() * (w - 60),
            60 + q() * (h - 110),
            11,
            'rgba(40,50,70,0.75)',
            { w: 500, a: 'center' },
          );
        for (const k of keys) {
          g.save();
          g.translate(k[0], k[1] + k[3] + 26);
          g.rotate(k[4] * 0.3);
          T(g, k[5], 0, 0, 15, '#2b2a25', { f: SERIF, a: 'center', w: 700 });
          g.restore();
        }
        g.save();
        g.translate(300, 610);
        g.rotate(-0.5);
        T(g, 'S A W G R A S S   C H A N N E L', 0, 0, 14, '#3d6a82', {
          f: SERIF,
          a: 'center',
          w: 400,
        });
        g.restore();
        g.strokeStyle = '#a03a5a';
        g.lineWidth = 1.2;
        g.setLineDash([9, 6]);
        g.beginPath();
        g.moveTo(40, 760);
        g.bezierCurveTo(240, 600, 300, 480, 620, 300);
        g.stroke();
        g.setLineDash([]);
        g.save();
        g.translate(530, 665);
        g.strokeStyle = '#6a4a6a';
        g.lineWidth = 1;
        for (const rr of [62, 46]) {
          g.beginPath();
          g.arc(0, 0, rr, 0, 6.3);
          g.stroke();
        }
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * 6.283,
            l = i % 9 === 0 ? 14 : 5;
          g.beginPath();
          g.moveTo(Math.cos(a) * 62, Math.sin(a) * 62);
          g.lineTo(Math.cos(a) * (62 - l), Math.sin(a) * (62 - l));
          g.stroke();
        }
        g.fillStyle = '#6a4a6a';
        for (let i = 0; i < 4; i++) {
          g.rotate(PI / 2);
          g.beginPath();
          g.moveTo(0, -44);
          g.lineTo(6, 0);
          g.lineTo(-6, 0);
          g.fill();
        }
        T(g, 'N', 0, -66, 14, '#6a4a6a', { f: SERIF, a: 'center' });
        g.restore();
        g.fillStyle = '#e9e2c6';
        g.fillRect(26, 26, 250, 82);
        g.strokeStyle = '#2b2a25';
        g.lineWidth = 1.5;
        g.strokeRect(26, 26, 250, 82);
        T(g, 'PALOMA KEYS', 151, 58, 26, '#2b2a25', { f: SERIF, a: 'center' });
        T(g, 'Heron Cay to Conch Bight', 151, 78, 14, '#2b2a25', { f: SERIF, a: 'center', w: 400 });
        T(g, 'SOUNDINGS IN FEET AT MEAN LOW WATER', 151, 97, 9.5, '#2b2a25', {
          a: 'center',
          w: 500,
        });
        g.strokeStyle = '#2b2a25';
        g.lineWidth = 2;
        g.strokeRect(12, 12, w - 24, h - 24);
        g.lineWidth = 1;
        g.strokeRect(18, 18, w - 36, h - 36);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = i % 2 ? '#2b2a25' : '#e9e2c6';
          g.fillRect(18 + (i * (w - 36)) / 40, 12, (w - 36) / 40, 6);
          g.fillRect(12, 18 + (i * (h - 36)) / 40, 6, (h - 36) / 40);
        }
        g.strokeStyle = 'rgba(200,40,40,0.8)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(238, 500, 16, 0, 6.3);
        g.stroke();
        g.save();
        g.translate(262, 492);
        g.rotate(-0.12);
        T(g, 'snook!!', 0, 0, 20, 'rgba(200,40,40,0.85)', {
          f: '"Marker Felt", "Comic Sans MS", cursive',
        });
        g.restore();
        age(g, w, h, 21, 2);
        g.strokeStyle = 'rgba(80,60,30,0.18)';
        g.lineWidth = 2;
        for (const x of [w / 3, (2 * w) / 3]) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, h);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
        g.stroke();
      },
    ],
    surf: [
      512,
      768,
      (g, w, h) => {
        g.fillStyle = '#1f6f78';
        g.fillRect(0, 0, w, h);
        g.save();
        g.translate(w / 2, 400);
        for (let i = 0; i < 18; i++) {
          g.fillStyle = i % 2 ? '#f0b24a' : '#e8793f';
          g.beginPath();
          g.moveTo(0, 0);
          g.arc(0, 0, 520, -PI + (i * PI) / 18, -PI + ((i + 1) * PI) / 18);
          g.fill();
        }
        g.fillStyle = '#f8e3a8';
        g.beginPath();
        g.arc(0, 0, 130, PI, 0);
        g.fill();
        g.restore();
        g.fillStyle = '#17525c';
        g.beginPath();
        g.moveTo(0, 400);
        g.bezierCurveTo(120, 250, 330, 230, 380, 330);
        g.bezierCurveTo(395, 370, 350, 390, 320, 365);
        g.bezierCurveTo(345, 430, 240, 470, 512, 440);
        g.lineTo(512, 768);
        g.lineTo(0, 768);
        g.fill();
        g.strokeStyle = '#f3ead2';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(0, 400);
        g.bezierCurveTo(120, 250, 330, 230, 380, 330);
        g.bezierCurveTo(395, 370, 350, 390, 320, 365);
        g.stroke();
        g.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.moveTo(0, 470 + i * 26);
          g.bezierCurveTo(150, 450 + i * 26, 350, 500 + i * 26, 512, 470 + i * 26);
          g.stroke();
        }
        T(g, 'SANDBAR', w / 2, 600, 104, '#f3ead2', { f: IMPACT, a: 'center', max: 470 });
        T(g, 'SURF CO.', w / 2, 668, 60, '#f0b24a', { f: IMPACT, a: 'center' });
        T(g, 'KEY PALOMA, FLA.  ·  BOARDS · WAX · DINGS FIXED', w / 2, 712, 17, '#f3ead2', {
          a: 'center',
          w: 600,
        });
        T(g, 'est. on a sandbar', w / 2, 740, 16, '#f3ead2', { f: SERIF, a: 'center', w: 400 });
        g.fillStyle = 'rgba(240,235,215,0.22)';
        g.fillRect(0, 0, w, h);
        age(g, w, h, 31, 1.5);
      },
    ],
    snap1: [
      360,
      270,
      (g, w, h) => {
        // Nico on the skiff holding up a snook
        const lg = g.createLinearGradient(0, 0, 0, h * 0.55);
        lg.addColorStop(0, '#6fb3d6');
        lg.addColorStop(1, '#d9ecd9');
        g.fillStyle = lg;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#2f8f8a';
        g.fillRect(0, h * 0.5, w, h);
        strokes(g, w, h, 3, 60, ['#49a9a0', '#256f77', '#8fd0c4'], 0.5, 1);
        strokes(g, w, h, 4, 14, ['#ffffff'], 0.05, 0.3, 0.3);
        g.fillStyle = '#37513c';
        g.fillRect(0, h * 0.47, w, 9);
        g.fillStyle = '#e8e3d2';
        g.beginPath();
        g.moveTo(20, 215);
        g.lineTo(350, 200);
        g.lineTo(330, 250);
        g.lineTo(40, 255);
        g.fill();
        g.fillStyle = '#c9c2ad';
        g.fillRect(40, 240, 292, 12);
        g.fillStyle = '#3a5f8a';
        g.fillRect(160, 150, 46, 70);
        g.fillStyle = '#d98e52';
        g.fillRect(156, 92, 54, 62);
        g.fillStyle = '#b97448';
        g.beginPath();
        g.arc(183, 72, 20, 0, 6.3);
        g.fill();
        g.fillStyle = '#c23b33';
        g.fillRect(162, 52, 44, 13);
        g.fillRect(196, 60, 22, 6);
        g.strokeStyle = '#b97448';
        g.lineWidth = 11;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(160, 105);
        g.lineTo(120, 135);
        g.moveTo(208, 105);
        g.lineTo(255, 130);
        g.stroke();
        g.fillStyle = '#b9bfae';
        g.beginPath();
        g.ellipse(188, 138, 86, 17, -0.03, 0, 6.3);
        g.fill();
        g.strokeStyle = '#22241f';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(108, 137);
        g.lineTo(270, 133);
        g.stroke();
        g.fillStyle = '#c9b458';
        g.beginPath();
        g.moveTo(270, 134);
        g.lineTo(296, 116);
        g.lineTo(290, 136);
        g.lineTo(297, 154);
        g.fill();
        strokes(g, w, h, 5, 30, ['#ffffff', '#f3d9a0'], 0.3, 0.9, 0.06);
        g.fillStyle = 'rgba(255,214,140,0.16)';
        g.fillRect(0, 0, w, h);
      },
    ],
    snap2: [
      360,
      270,
      (g, w, h) => {
        // sunset from the dock, pelican on a piling
        const lg = g.createLinearGradient(0, 0, 0, h * 0.6);
        lg.addColorStop(0, '#5a4a86');
        lg.addColorStop(0.5, '#e07a5a');
        lg.addColorStop(1, '#f6cf7a');
        g.fillStyle = lg;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#f9e9b0';
        g.beginPath();
        g.arc(230, 150, 30, 0, 6.3);
        g.fill();
        g.fillStyle = '#7a4a6a';
        g.fillRect(0, 160, w, h);
        strokes(g, w, h, 8, 70, ['#f6cf7a', '#e07a5a', '#5a4a86', '#3a2f55'], 0.6, 1, 0.22);
        strokes(g, w, h, 9, 12, ['#f9b0a0', '#fbe0b0'], 0.05, 0.4, 0.4);
        g.fillStyle = '#231a2a';
        g.beginPath();
        g.moveTo(0, 215);
        g.lineTo(190, 178);
        g.lineTo(190, 190);
        g.lineTo(0, 245);
        g.fill();
        for (const x of [30, 95, 160, 300]) g.fillRect(x, 150 + (x === 300 ? -22 : 20), 12, 130);
        g.beginPath();
        g.ellipse(306, 112, 17, 12, 0.2, 0, 6.3);
        g.fill();
        g.beginPath();
        g.arc(318, 96, 7, 0, 6.3);
        g.fill();
        g.beginPath();
        g.moveTo(322, 95);
        g.lineTo(346, 108);
        g.lineTo(322, 102);
        g.fill();
        palm(g, 20, 160, 60, '#231a2a');
      },
    ],
    snap3: [
      360,
      270,
      (g, w, h) => {
        // tarpon clearing the water
        g.fillStyle = '#9fd3e0';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#1f7f86';
        g.fillRect(0, 150, w, h);
        strokes(g, w, h, 12, 80, ['#2f9aa0', '#17606a', '#7fd0c8'], 0.56, 1);
        strokes(g, w, h, 13, 10, ['#ffffff'], 0.05, 0.4, 0.35);
        g.save();
        g.translate(180, 120);
        g.rotate(-0.75);
        g.fillStyle = '#c9d2d6';
        g.beginPath();
        g.ellipse(0, 0, 105, 26, 0, 0, 6.3);
        g.fill();
        g.fillStyle = '#5d7f8a';
        g.beginPath();
        g.ellipse(0, -9, 100, 13, 0, PI, 0);
        g.fill();
        g.fillStyle = '#7f9aa3';
        g.beginPath();
        g.moveTo(-100, 0);
        g.lineTo(-140, -30);
        g.lineTo(-125, 0);
        g.lineTo(-142, 28);
        g.fill();
        g.beginPath();
        g.moveTo(-10, -22);
        g.lineTo(-30, -48);
        g.lineTo(-45, -20);
        g.fill();
        g.fillStyle = '#16232a';
        g.beginPath();
        g.arc(82, -6, 5, 0, 6.3);
        g.fill();
        g.restore();
        const q = kit.rng(14);
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 90; i++) {
          g.globalAlpha = 0.4 + q() * 0.6;
          g.beginPath();
          g.arc(110 + (q() - 0.5) * 150, 170 - q() * q() * 110, 1.5 + q() * 5, 0, 6.3);
          g.fill();
        }
        g.globalAlpha = 1;
        g.fillStyle = '#e8e3d2';
        g.fillRect(250, 165, 110, 12);
        g.fillStyle = 'rgba(255,230,170,0.15)';
        g.fillRect(0, 0, w, h);
      },
    ],
    clock: [
      256,
      256,
      (g, w) => {
        g.fillStyle = '#efe8d2';
        g.fillRect(0, 0, w, w);
        g.fillStyle = '#f4eeda';
        g.beginPath();
        g.arc(128, 128, 124, 0, 6.3);
        g.fill();
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * 6.283;
          g.strokeStyle = '#22262b';
          g.lineWidth = i % 5 ? 1.5 : 4;
          g.beginPath();
          g.moveTo(128 + Math.sin(a) * 118, 128 - Math.cos(a) * 118);
          g.lineTo(
            128 + Math.sin(a) * (i % 5 ? 111 : 104),
            128 - Math.cos(a) * (i % 5 ? 111 : 104),
          );
          g.stroke();
        }
        for (let i = 1; i <= 12; i++) {
          const a = (i / 12) * 6.283;
          T(g, String(i), 128 + Math.sin(a) * 86, 128 - Math.cos(a) * 86, 26, '#22262b', {
            a: 'center',
            b: 'middle',
            f: SERIF,
          });
        }
        T(g, 'BAIT & TACKLE', 128, 84, 10, '#a3402f', { a: 'center' });
        T(g, 'quartz', 128, 178, 9, '#555', { a: 'center', w: 400 });
        age(g, w, w, 41, 0.6);
      },
    ],
    tide: [
      256,
      360,
      (g, w, h) => {
        g.fillStyle = '#f1ecd8';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#1f5f78';
        g.fillRect(0, 0, w, 44);
        T(g, 'TIDES · KEY PALOMA HARBOR', w / 2, 20, 14, '#fff', { a: 'center' });
        T(g, 'NOVEMBER   times EST · heights ft', w / 2, 37, 10, '#cfe6ee', {
          a: 'center',
          w: 500,
        });
        const q = kit.rng(77);
        for (let i = 0; i < 14; i++) {
          const y = 62 + i * 15;
          if (i % 2) {
            g.fillStyle = '#e3ddc6';
            g.fillRect(6, y - 11, w - 12, 15);
          }
          T(
            g,
            `${['FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU'][i % 7]} ${13 + i}`,
            10,
            y,
            10.5,
            '#222',
            { f: MONO },
          );
          T(
            g,
            `H ${1 + ((i * 49) % 11)}:${10 + ((q() * 49) | 0)}a ${(2.1 + q()).toFixed(1)}   L ${1 + ((i * 31) % 11)}:${10 + ((q() * 49) | 0)}p ${(0.2 + q() * 0.6).toFixed(1)}`,
            66,
            y,
            10.5,
            '#222',
            { f: MONO, w: 500 },
          );
        }
        g.strokeStyle = '#1f5f78';
        g.lineWidth = 2;
        g.beginPath();
        for (let x = 8; x < w - 8; x++)
          g.lineTo(x, 310 + Math.sin(x * 0.085) * 22 * (0.7 + 0.3 * Math.sin(x * 0.012)));
        g.stroke();
        g.strokeStyle = '#999';
        g.lineWidth = 1;
        g.strokeRect(8, 280, w - 16, 62);
        T(g, 'Heron Cay Marina · bait · ice · fuel', w / 2, 354, 9.5, '#444', {
          a: 'center',
          w: 500,
        });
        g.strokeStyle = 'rgba(190,40,40,0.8)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.ellipse(128, 73, 118, 9, 0, 0, 6.3);
        g.stroke();
        age(g, w, h, 51, 1.2);
      },
    ],
    can: [
      256,
      128,
      (g, w, h) => {
        // Tern Key Brewing Co. (design-system brand)
        g.fillStyle = '#e8e4d6';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#1f6f78';
        g.fillRect(0, 22, w, 84);
        g.fillStyle = '#e8a23a';
        g.fillRect(0, 22, w, 5);
        g.fillRect(0, 101, w, 5);
        for (const x of [64, 192]) {
          g.fillStyle = '#f3efe2';
          g.beginPath();
          g.moveTo(x - 36, 52);
          g.quadraticCurveTo(x - 12, 34, x, 50);
          g.quadraticCurveTo(x + 12, 34, x + 36, 52);
          g.quadraticCurveTo(x + 10, 46, x, 60);
          g.quadraticCurveTo(x - 10, 46, x - 36, 52);
          g.fill();
          T(g, 'TERN KEY', x, 82, 20, '#f3efe2', { f: IMPACT, a: 'center' });
          T(g, 'BREWING CO. · LAGER', x, 96, 8.5, '#e8a23a', { a: 'center' });
        }
        T(g, '12 FL OZ', 128, 120, 8, '#555', { a: 'center' });
      },
    ],
    rec1: [
      256,
      256,
      (g, w) => {
        g.fillStyle = '#1d2a3a';
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 7; i++) {
          g.strokeStyle = ['#e8793f', '#f0b24a', '#f3ead2'][i % 3];
          g.lineWidth = 9;
          g.beginPath();
          g.arc(128, 250, 40 + i * 26, PI, 0);
          g.stroke();
        }
        T(g, 'LOW TIDE LOVERS', 128, 38, 25, '#f3ead2', { f: IMPACT, a: 'center' });
        T(g, 'Night Swimming at the Seven Mile', 128, 58, 11, '#f0b24a', { a: 'center', w: 500 });
        age(g, w, w, 61, 1.5);
        g.strokeStyle = 'rgba(240,235,220,0.35)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(128, 128, 100, 0, 6.3);
        g.stroke();
      },
    ],
    rec2: [
      256,
      256,
      (g, w) => {
        g.fillStyle = '#d9c9a0';
        g.fillRect(0, 0, w, w);
        g.fillStyle = '#b5482f';
        g.beginPath();
        g.arc(128, 140, 78, 0, 6.3);
        g.fill();
        palm(g, 120, 230, 150, '#2b2a25');
        T(g, 'Conjunto Paloma', 128, 36, 24, '#2b2a25', { f: SERIF, a: 'center' });
        T(g, 'SON DE LOS CAYOS · VOL. 2', 128, 248, 11, '#2b2a25', { a: 'center' });
        age(g, w, w, 71, 2);
      },
    ],
    mag: [
      256,
      340,
      (g, w, h) => {
        const lg = g.createLinearGradient(0, 0, 0, h);
        lg.addColorStop(0, '#2f8fb0');
        lg.addColorStop(1, '#0f3f55');
        g.fillStyle = lg;
        g.fillRect(0, 0, w, h);
        strokes(g, w, h, 81, 40, ['#4fb0c8', '#0f3f55'], 0.4, 1);
        g.fillStyle = '#c9d2d6';
        g.beginPath();
        g.ellipse(128, 200, 92, 30, -0.3, 0, 6.3);
        g.fill();
        g.fillStyle = '#f3c93a';
        g.fillRect(0, 0, w, 62);
        T(g, 'KEYS ANGLER', 128, 46, 44, '#102a36', { f: IMPACT, a: 'center', max: 240 });
        T(g, 'SNOOK AFTER DARK', 12, 290, 20, '#fff');
        T(g, '9 bridges that still produce', 12, 310, 12, '#f3c93a', { w: 500 });
        T(g, 'FIX YOUR OWN LOWER UNIT', 12, 328, 11, '#fff');
      },
    ],
    cover: [
      160,
      240,
      (g, w, h) => {
        g.fillStyle = '#7a2f2a';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#e9d9a8';
        g.fillRect(10, 10, w - 20, 70);
        T(g, 'THE LONG', 80, 40, 22, '#2b2a25', { f: SERIF, a: 'center' });
        T(g, 'SLACK TIDE', 80, 66, 22, '#2b2a25', { f: SERIF, a: 'center' });
        g.fillStyle = '#e9d9a8';
        g.beginPath();
        g.arc(80, 150, 40, 0, 6.3);
        g.fill();
        palm(g, 76, 200, 80, '#2b2a25');
        T(g, 'a novel', 80, 228, 11, '#e9d9a8', { f: SERIF, a: 'center', w: 400 });
        age(g, w, h, 91, 2);
      },
    ],
    acpanel: [
      128,
      256,
      (g, w, h) => {
        g.fillStyle = '#cfc8b2';
        g.fillRect(0, 0, w, h);
        for (const [y, s, a, b] of [
          [70, 'TEMP', 'WARMER', 'COOLER'],
          [180, 'MODE', 'FAN', 'HI COOL'],
        ]) {
          g.strokeStyle = '#555';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(64, y, 40, 2.4, 0.75);
          g.stroke();
          T(g, s, 64, y - 48, 12, '#333', { a: 'center' });
          T(g, a, 8, y + 44, 8.5, '#333');
          T(g, b, 120, y + 44, 8.5, '#333', { a: 'right' });
          for (let i = 0; i < 7; i++) {
            const t = 2.4 + i * 0.77;
            g.fillStyle = '#333';
            g.fillRect(64 + Math.cos(t) * 46 - 1.5, y + Math.sin(t) * 46 - 1.5, 3, 3);
          }
        }
        T(g, 'COLDSNAP 8000', 64, 248, 9, '#666', { a: 'center' });
      },
    ],
    sticker: [
      128,
      128,
      (g, w) => {
        g.fillStyle = '#8a8478';
        g.fillRect(0, 0, w, w);
        g.fillStyle = '#f0b24a';
        g.beginPath();
        g.arc(64, 64, 62, 0, 6.3);
        g.fill();
        g.fillStyle = '#1f6f78';
        g.beginPath();
        g.arc(64, 64, 52, 0, 6.3);
        g.fill();
        T(g, 'SANDBAR', 64, 62, 24, '#f3ead2', { f: IMPACT, a: 'center' });
        T(g, 'SURF CO.', 64, 84, 15, '#f0b24a', { f: IMPACT, a: 'center' });
      },
    ],
  });
  const SAND = imat.art(
    'nh70_sand',
    256,
    256,
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const q = kit.rng(9);
      for (let i = 0; i < 9; i++) {
        const x = 70 + q() * 116,
          y = 70 + q() * 116,
          rr = 30 + q() * 50,
          rg = g.createRadialGradient(x, y, 0, x, y, rr);
        rg.addColorStop(0, 'rgba(214,200,165,0.34)');
        rg.addColorStop(1, 'rgba(214,200,165,0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, w, h);
      }
      for (let i = 0; i < 1500; i++) {
        const a = q() * 6.283,
          d = q() * q() * 120;
        g.fillStyle = `rgba(${(200 + q() * 40) | 0},${(185 + q() * 40) | 0},${(150 + q() * 40) | 0},${0.3 + q() * 0.5})`;
        g.fillRect(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + q() * 1.6, 1 + q() * 1.6);
      }
    },
    { transparent: true, rough: 1 },
  );
  SAND.depthWrite = false;
  SAND.polygonOffset = true;
  SAND.polygonOffsetFactor = -2;
  SAND.polygonOffsetUnits = -2;
  const sand = (x, z, s, ry = 0) =>
    I.geo(SAND, new THREE.PlaneGeometry(s, s), M(x, F + 0.004, z, -PI / 2, ry, 0), {});
  sand(-4.3, -2.55, 1.5, 0.4);
  sand(-3.6, -2.1, 0.9, 2);
  sand(-1.5, 2.1, 1.3, 1);
  sand(-2.6, 1.5, 0.8, 3);
  sand(-5.6, 2.1, 0.7, 5);
  const frame = (name, x, y, z, ry, w, h, c = 0x4a3524, t = 0.02) => {
    // framed picture flat on a wall (faces local +Z)
    const L = place(x, y, z, ry);
    A.plane(I, name, L(0, 0, 0.012), w, h);
    for (const s of [-1, 1]) {
      I.box(WT, t, h + 2 * t, 0.022, L(s * (w / 2 + t / 2), 0, 0.006), {
        color: v(c),
        bevel: 0.003,
        grain: 1,
      });
      I.box(WT, w, t, 0.022, L(0, s * (h / 2 + t / 2), 0.006), {
        color: v(c),
        bevel: 0.003,
        grain: 0,
      });
    }
  };
  const pinned = (name, x, y, z, ry, w, h, rz = 0) => {
    const L = place(x, y, z, ry);
    A.plane(I, name, L(0, 0, 0.004, 0, 0, rz), w, h);
    for (const [sx, sy] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ])
      I.cyl(
        PG,
        0.005,
        0.005,
        0.008,
        L(sx * (w / 2 - 0.015), sy * (h / 2 - 0.015), 0.007, PI / 2, 0, 0),
        { seg: 6, color: [0xc23b33, 0xe8c23a, 0x2f6fb0, 0xf3efe2][(r() * 4) | 0] },
      );
  };

  // ---------- rug (rag-woven strips with fringe) ----------
  {
    const L = place(-4.64, F, 0.45, 0.035),
      cols = [0xb9a27a, 0x8f6a4a, 0xc9b78f, 0x5f7f7a, 0xb9a27a, 0xa3523a, 0xc9b78f, 0x8f6a4a];
    for (let i = 0; i < 22; i++)
      I.box(
        RUG,
        1.9 + j(0.012),
        0.011 + r() * 0.003,
        0.102,
        L(j(0.006), 0.006, -1.07 + i * 0.102),
        { color: v(cols[i % cols.length], 0.07), bevel: 0.004, grain: 0, rand: r },
      );
    for (const s of [-1, 1])
      for (let i = 0; i < 44; i++)
        I.box(
          RUG,
          0.05 + r() * 0.025,
          0.004,
          0.012,
          L(s * (0.975 + r() * 0.012), 0.003, -1.1 + i * 0.051 + j(0.008), 0, j(0.5), 0),
          { color: v(0xd9cba6, 0.08) },
        );
  }

  // ---------- sofa (faces west toward the TV) ----------
  {
    const L = place(-3.4, F, 0.45, -PI / 2),
      sc = 0x7fa39b,
      fd = 0xb7c4b3,
      fab = (g, m4, c, um = [2, 1.6]) => I.geo(FAB, g, m4, { color: c, uvMul: um });
    const pipe = (m4, hx, hz, y, rc, c) =>
      I.tube(FAB, ringPts(m4, hx, hz, y, rc), 0.0055, {
        closed: true,
        seg: 5,
        color: c,
        stepLen: 0.04,
      });
    for (const [x, z] of [
      [-0.9, -0.36],
      [0.9, -0.36],
      [-0.9, 0.36],
      [0.9, 0.36],
    ])
      I.cyl(WT, 0.024, 0.017, 0.1, L(x, 0.05, z), { seg: 8, color: 0x6a4a30 });
    I.box(MT, 1.9, 0.02, 0.8, L(0, 0.105, 0), { color: 0x1c1a17 }); // dust cover under the frame
    fab(soft(2.0, 0.25, 0.88, { r: 0.045 }), L(0, 0.235, 0), kit.mix(sc, fd, 0.35), [4, 1]); // base rail
    fab(
      soft(1.68, 0.56, 0.2, { r: 0.085 }),
      L(0, 0.6, -0.355, -0.13),
      kit.mix(sc, fd, 0.5),
      [3.4, 1.3],
    ); // back
    for (const s of [-1, 1]) {
      const c = kit.mix(sc, fd, s > 0 ? 0.75 : 0.2);
      fab(soft(0.2, 0.44, 0.88, { r: 0.06 }), L(s * 0.9, 0.42, 0), c, [1.6, 1.2]);
      const g = new THREE.CylinderGeometry(0.115, 0.115, 0.86, 14, 1);
      I.geo(FAB, g, L(s * 0.905, 0.63, 0.005, PI / 2, 0, 0), { color: c, uvMul: [1.6, 1.9] }); // rolled arm
      I.geo(FAB, soft(0.225, 0.225, 0.03, { r: 0.012, seg: 6 }), L(s * 0.905, 0.63, 0.44), {
        color: kit.mul(c, 0.94),
        uvMul: [0.5, 0.5],
      });
      I.tube(
        FAB,
        Array.from({ length: 17 }, (_, i) =>
          wpt(
            L(),
            s * 0.905 + Math.cos((i / 16) * 6.283) * 0.113,
            0.63 + Math.sin((i / 16) * 6.283) * 0.113,
            0.43,
          ),
        ),
        0.005,
        { seg: 5, color: kit.mul(c, 0.85) },
      );
    }
    for (let i = 0; i < 3; i++) {
      const f = i / 2,
        c = v(kit.mix(sc, fd, 0.15 + f * 0.7), 0.03);
      const ms = L((i - 1) * 0.55, 0.435, 0.085 + j(0.008), j(0.012), j(0.02), j(0.012));
      fab(
        soft(0.545, 0.17, 0.66, {
          r: 0.065,
          puff: 0.022,
          dent: [j(0.3), 0.1, i === 1 ? 0.03 : 0.018],
        }),
        ms,
        c,
        [1.2, 1.4],
      );
      for (const y of [0.05, -0.05]) pipe(ms, 0.255, 0.312, y, 0.06, kit.mul(c, 0.82));
      const mb = L(
        (i - 1) * 0.55 + j(0.01),
        0.72 + j(0.01),
        -0.19,
        PI / 2 - 0.27 + j(0.04),
        0,
        j(0.03),
      );
      fab(
        soft(0.535, 0.2, 0.42, { r: 0.085, puff: 0.03, puffB: 0.6, dent: [j(0.3), -0.1, 0.02] }),
        mb,
        kit.mul(c, 1.04),
        [1.2, 1],
      );
      pipe(mb, 0.25, 0.192, 0.055, 0.075, kit.mul(c, 0.84));
    }
    I.geo(
      JER,
      soft(0.42, 0.13, 0.42, { r: 0.05, puff: 0.06, puffB: 1 }),
      L(-0.6, 0.66, 0.02, 1.0, 0.5, 0.25),
      { color: 0xc98a4a, uvMul: [1.4, 1.4] },
    ); // throw pillow
    I.geo(
      JER,
      soft(0.38, 0.11, 0.38, { r: 0.045, puff: 0.05, puffB: 1 }),
      L(-0.14, 0.56, 0.18, 0.12, 0.3, 0),
      { color: 0x4f6f86, uvMul: [1.3, 1.3] },
    );
    I.box(MT, 0.11, 0.002, 0.07, L(0.3, 0.522, 0.3, 0, 0.3, 0), { color: 0x9c9c98 }); // duct-tape patch on the middle cushion
    // serape thrown over the south arm: striped, hanging down both sides with folds
    {
      const W = 0.95,
        Lz = 0.62,
        g = new THREE.PlaneGeometry(W, Lz, 40, 14),
        p = g.attributes.position,
        cA = new Float32Array(p.count * 3),
        stripes = [
          0xd9d0b8, 0xb5482f, 0xd9d0b8, 0x2f6f7a, 0xe8b54a, 0x2f6f7a, 0xd9d0b8, 0x3a3a52, 0xb5482f,
          0xd9d0b8,
        ];
      for (let i = 0; i < p.count; i++) {
        const s = p.getX(i) + 0.25,
          t = p.getY(i),
          a = Math.abs(s),
          sg = Math.sign(s),
          top = 0.118,
          rc = 0.11;
        let px, py;
        const d = a / rc,
          ang = Math.min(d, PI / 2);
        px = sg * Math.sin(ang) * rc;
        py = Math.cos(ang) * rc - rc;
        if (d > PI / 2) py -= a - (rc * PI) / 2;
        const hang = Math.max(0, -py - 0.08),
          fold =
            Math.sin(t * 17 + sg * 2) * 0.028 * Math.min(1, hang * 6) +
            Math.sin(t * 41 + s * 7) * 0.006;
        p.setXYZ(
          i,
          px + sg * (0.012 + Math.abs(fold) + hang * 0.05),
          py + top * 0 + Math.sin(t * 9 + s * 13) * 0.004,
          t + fold * 0.6 + hang * sg * 0.05,
        );
        const c = kit.rgb(stripes[Math.floor((t / Lz + 0.5) * 19.99) % stripes.length]);
        cA[i * 3] = c[0];
        cA[i * 3 + 1] = c[1];
        cA[i * 3 + 2] = c[2];
      }
      g.setAttribute('color', new THREE.BufferAttribute(cA, 3));
      g.computeVertexNormals();
      I.geo(JER, g, L(0.905, 0.755, 0.06), { keepColor: true, color: 0xffffff, uvMul: [4, 2] });
      for (let i = 0; i < 16; i++) {
        I.box(
          MT,
          0.004,
          0.04,
          0.004,
          L(0.905 + 0.137 + j(0.008), 0.08, 0.06 - 0.3 + i * 0.04 + j(0.01)),
          { color: 0xd9d0b8 },
        );
        I.box(
          MT,
          0.004,
          0.03,
          0.004,
          L(0.905 - 0.125 + j(0.006), 0.582, 0.06 - 0.3 + i * 0.04 + j(0.01)),
          { color: 0xd9d0b8 },
        );
      }
    }
    col.box(-3.405, F + 0.42, 0.45, 0.95, 0.84, 2.04, { tag: 'furniture' });
  }

  // ---------- cable-spool coffee table and what is on it ----------
  {
    const cx = -4.52,
      cz = 0.45,
      L = place(cx, F, cz, 0.4),
      top = 0.462;
    for (const y of [0.022, 0.44]) {
      I.cyl(WD, 0.39, 0.39, 0.044, L(0, y, 0), { seg: 28, color: v(0xb39a78, 0.04), wear: 0.5 });
      for (let i = 0; i < 6; i++)
        I.cyl(
          ST,
          0.011,
          0.011,
          0.006,
          L(Math.cos(i * 1.047) * 0.17, y + 0.024, Math.sin(i * 1.047) * 0.17),
          { seg: 6, color: 0x6a655c },
        );
    }
    for (let i = -3; i <= 3; i++)
      I.box(
        MT,
        0.003,
        0.002,
        Math.sqrt(0.39 * 0.39 - (i * 0.105) ** 2) * 2 - 0.01,
        L(i * 0.105 + 0.05, 0.4625, 0),
        { color: 0x3a3026 },
      ); // board joints of the flange
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.283;
      I.box(
        WD,
        0.078,
        0.376,
        0.02,
        L(Math.cos(a) * 0.19, 0.232, Math.sin(a) * 0.19, 0, -a + PI / 2, 0),
        { color: v(0xa8906e, 0.08), bevel: 0.003, grain: 1, wear: 0.4, rand: r },
      );
    }
    I.cyl(ST, 0.045, 0.045, 0.004, L(0, 0.464, 0), { seg: 14, color: 0x77726a });
    I.cyl(MT, 0.026, 0.026, 0.005, L(0, 0.4645, 0), { seg: 12, color: 0x0c0b0a });
    A.plane(I, 'sticker', L(-0.2, 0.4632, 0.24, -PI / 2, 0.6, 0), 0.085, 0.085);
    for (const [x, z, s] of [
      [0.2, -0.2, 0.05],
      [-0.26, 0.1, 0.045],
      [0.1, 0.27, 0.04],
    ]) {
      const g = new THREE.TorusGeometry(s, 0.003, 4, 20);
      I.geo(MT, g, L(x, 0.463, z, PI / 2, 0, 0), { color: 0x6a5a48 });
    } // can rings
    const T0 = (x, y, z, rx = 0, ry = 0, rz = 0) => L(x, top + y, z, rx, ry, rz);
    // ashtray with butts
    I.geo(
      CE,
      lathe(
        [
          [0, 0],
          [0.058, 0],
          [0.066, 0.006],
          [0.068, 0.03],
          [0.058, 0.03],
          [0.052, 0.01],
          [0, 0.009],
        ],
        18,
      ),
      T0(0.17, 0, -0.14),
      { color: 0xb5822f },
    );
    I.cyl(MT, 0.05, 0.05, 0.004, T0(0.17, 0.012, -0.14), { seg: 12, color: 0x6f6b66 });
    for (let i = 0; i < 6; i++)
      I.cyl(
        MT,
        0.004,
        0.004,
        0.028 + r() * 0.02,
        T0(0.17 + j(0.03), 0.018 + r() * 0.006, -0.14 + j(0.03), PI / 2 + j(0.3), r() * 6, 0),
        { seg: 6, color: i % 2 ? 0xd9a05a : 0xe9e4d6 },
      );
    I.box(PG, 0.025, 0.012, 0.08, T0(0.27, 0.006, -0.02, 0, 0.8, 0), {
      color: 0x2f9a6a,
      bevel: 0.004,
    });
    I.box(CH, 0.025, 0.012, 0.012, T0(0.245, 0.006, -0.045, 0, 0.8, 0), {
      color: 0xcccccc,
      bevel: 0.002,
    }); // lighter
    // remote
    {
      const m = T0(-0.03, 0.011, 0.22, 0, -0.5, 0),
        K = (x, y, z) => m.clone().multiply(M(x, y, z));
      I.box(PL, 0.048, 0.02, 0.19, m, { color: 0x1c1d20, bevel: 0.007 });
      I.cyl(PG, 0.007, 0.007, 0.003, K(0, 0.011, -0.075), { seg: 8, color: 0xb5322a });
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 6; b++)
          I.box(RB, 0.009, 0.003, 0.007, K((a - 1) * 0.013, 0.011, -0.05 + b * 0.02), {
            color: b === 2 ? 0x8a8f96 : 0x4a4d52,
          });
    }
    // game controller
    {
      const m = T0(-0.21, 0.022, -0.06, 0, 0.9, 0),
        K = (x, y, z, rx = 0, ry = 0, rz = 0) => m.clone().multiply(M(x, y, z, rx, ry, rz)),
        cc = 0x2a2e3a;
      I.geo(PL, soft(0.15, 0.04, 0.075, { r: 0.018, seg: 6 }), m, { color: cc });
      for (const s of [-1, 1]) {
        I.geo(
          PL,
          soft(0.05, 0.045, 0.1, { r: 0.02, seg: 6 }),
          K(s * 0.062, -0.003, 0.035, 0, -s * 0.3, 0),
          { color: cc },
        );
        I.cyl(RB, 0.011, 0.012, 0.012, K(s * 0.03, 0.024, 0.014), { seg: 10, color: 0x111214 });
      }
      I.box(PL, 0.022, 0.004, 0.008, K(-0.05, 0.021, -0.012), { color: 0x16171a });
      I.box(PL, 0.008, 0.004, 0.022, K(-0.05, 0.021, -0.012), { color: 0x16171a });
      for (const [x, z, c] of [
        [0.05, -0.022, 0xd9b23a],
        [0.062, -0.012, 0xb5322a],
        [0.038, -0.012, 0x2f6fb0],
        [0.05, -0.002, 0x3a9a5a],
      ])
        I.cyl(PG, 0.0055, 0.0055, 0.005, K(x, 0.021, z), { seg: 8, color: c });
      I.tube(
        RB,
        [
          wpt(m, 0, 0, -0.04),
          wpt(m, 0.02, -0.018, -0.12),
          wpt(m, 0.12, -0.02, -0.16),
          wpt(m, 0.2, -0.02, -0.08),
        ],
        0.0025,
        { seg: 5, color: 0x111214 },
      );
    }
    // cans: two upright, one tipped over
    const can = (m4, dent = 0) => {
      A.wrap(I, 'can', m4, 0.033, 0.1);
      const K = (y, rt, rb, hh, c) =>
        I.cyl(ST, rt, rb, hh, m4.clone().multiply(M(0, y, 0)), { seg: 14, color: c });
      K(0.055, 0.027, 0.033, 0.012, 0xd8d8d4);
      K(-0.054, 0.033, 0.027, 0.01, 0xd8d8d4);
      K(0.0615, 0.025, 0.025, 0.002, 0xb9b9b4);
      I.box(ST, 0.012, 0.0015, 0.02, m4.clone().multiply(M(0.004, 0.063, 0, 0, dent, 0)), {
        color: 0xc9c9c4,
      });
    };
    can(T0(0.04, 0.059, -0.27, 0, 1.1, 0));
    can(T0(0.13, 0.059, 0.19, 0, 2.6, 0), 1);
    can(T0(-0.1, 0.033, -0.26, 0, 0.7, PI / 2), 2);
    // spinning reel taken apart on a shop rag, with oil and a screwdriver
    {
      const m = T0(0.0, 0, 0.02, 0, 0.25, 0),
        K = (x, y, z, rx = 0, ry = 0, rz = 0) => m.clone().multiply(M(x, y, z, rx, ry, rz));
      I.geo(JER, soft(0.26, 0.012, 0.2, { r: 0.005, puff: 0.004, seg: 6 }), K(0, 0.006, 0), {
        color: 0xb5483a,
        uvMul: [1, 1],
      });
      I.geo(
        JER,
        soft(0.1, 0.02, 0.09, { r: 0.008, puff: 0.006, seg: 6 }),
        K(0.1, 0.014, 0.07, 0, 0.5, 0),
        { color: 0xa84236 },
      );
      I.geo(PG, soft(0.06, 0.045, 0.04, { r: 0.016, seg: 6 }), K(-0.05, 0.034, -0.02), {
        color: 0x1d2228,
      });
      I.box(PG, 0.012, 0.05, 0.012, K(-0.05, 0.06, -0.02, 0, 0, 0.3), {
        color: 0x1d2228,
        bevel: 0.003,
      });
      I.box(PG, 0.07, 0.008, 0.014, K(-0.045, 0.085, -0.02), { color: 0x1d2228, bevel: 0.003 });
      I.cyl(ST, 0.026, 0.026, 0.03, K(-0.005, 0.034, -0.02, 0, 0, PI / 2), {
        seg: 14,
        color: 0x9a9a9a,
      });
      I.cyl(PG, 0.03, 0.03, 0.006, K(0.012, 0.034, -0.02, 0, 0, PI / 2), {
        seg: 14,
        color: 0x1d2228,
      });
      I.cyl(ST, 0.021, 0.021, 0.022, K(0.06, 0.023, 0.03), { seg: 14, color: 0xc9a23a });
      I.cyl(ST, 0.027, 0.027, 0.003, K(0.06, 0.035, 0.03), { seg: 14, color: 0xc9a23a });
      I.cyl(ST, 0.027, 0.027, 0.003, K(0.06, 0.0125, 0.03), { seg: 14, color: 0xc9a23a });
      I.cyl(MT, 0.019, 0.019, 0.016, K(0.06, 0.024, 0.03), { seg: 12, color: 0x9fd0c0 });
      I.rod(ST, wpt(m, -0.09, 0.016, 0.05), wpt(m, -0.02, 0.016, 0.075), 0.003, {
        color: 0xb5b5b0,
      });
      I.geo(
        PG,
        soft(0.022, 0.014, 0.03, { r: 0.006, seg: 4 }),
        K(-0.015, 0.018, 0.078, 0, 0.3, 0),
        { color: 0x1d2228 },
      );
      for (let i = 0; i < 5; i++)
        I.cyl(
          ST,
          0.0025,
          0.0025,
          0.006,
          K(-0.06 + i * 0.022 + j(0.006), 0.015, 0.06 + j(0.02), j(1.5), 0, j(1.5)),
          { seg: 5, color: 0xb5b5b0 },
        );
      I.cyl(PG, 0.009, 0.009, 0.085, K(0.02, 0.021, -0.075, 0, 0, PI / 2 + 0.05), {
        seg: 8,
        color: 0xd9a52a,
      });
      I.cyl(ST, 0.0025, 0.0025, 0.09, K(0.105, 0.019, -0.079, 0, 0, PI / 2 + 0.05), {
        seg: 5,
        color: 0xb5b5b0,
      });
      I.cyl(PL, 0.014, 0.016, 0.06, K(-0.11, 0.042, -0.07), { seg: 10, color: 0xe9e4d6 });
      I.cyl(PL, 0.004, 0.009, 0.03, K(-0.11, 0.086, -0.07), { seg: 8, color: 0xb5322a });
    }
    A.plane(I, 'tide', T0(-0.2, 0.0015, 0.13, -PI / 2, 2.2, 0), 0.14, 0.197);
    A.plane(I, 'mag', T0(0.2, 0.002, 0.06, -PI / 2, -1.0, 0), 0.2, 0.265);
    I.box(MT, 0.2, 0.004, 0.265, T0(0.2, -0.0005, 0.06, 0, -1.0, 0), { color: 0xe9e4d6 });
    for (let i = 0; i < 4; i++)
      I.cyl(ST, 0.013, 0.0125, 0.006, T0(0.02 + j(0.12), 0.003, -0.16 + j(0.05)), {
        seg: 10,
        color: [0xc9a23a, 0x1f6f78][i % 2],
      });
    col.cyl(cx, F + 0.24, cz, 0.42, 0.48, { tag: 'furniture' });
  }

  // ---------- TV dresser with working drawers ----------
  const movers = [];
  const mover = (d) => {
    // d: { id, label, pos, ry, kind: 'slide'|'hinge', max, sign, ipos, radius, draw(bt) }
    const g = new THREE.Group();
    g.name = d.id;
    g.position.set(...d.pos);
    g.rotation.order = 'YXZ';
    g.rotation.y = d.ry || 0;
    const bt = kit.batch(d.id);
    d.draw(bt);
    bt.build(g);
    ctx.groups.dyn.add(g);
    const s = { d, g, open: false, a: 0 };
    ctx.addInteract({
      id: d.id,
      kind: d.ikind || 'drawer',
      label: () => (s.open ? 'Close ' : 'Open ') + d.label,
      pos: d.ipos,
      radius: d.radius ?? 1.15,
      use: (env) => {
        s.open = !s.open;
        env?.game?.audio?.play?.('drawer', { volume: 0.4 });
        return s.open;
      },
    });
    movers.push(s);
    return s;
  };
  ctx.updaters.push((dt) => {
    for (const s of movers) {
      const t = s.open ? 1 : 0;
      if (s.a === t) continue;
      s.a += (t - s.a) * Math.min(1, dt * 6);
      if (Math.abs(s.a - t) < 0.003) s.a = t;
      const d = s.d,
        k = s.a * d.max;
      if (d.kind === 'hinge') s.g.rotation.y = (d.ry || 0) + d.sign * k;
      else
        s.g.position.set(
          d.pos[0] + Math.sin(d.ry || 0) * k,
          d.pos[1],
          d.pos[2] + Math.cos(d.ry || 0) * k,
        );
    }
  });
  {
    const zc = -0.27,
      W = 1.5,
      D = 0.46,
      H = 0.74,
      xf = -5.77,
      L = place(xf - D / 2, F, zc, PI / 2),
      dc = 0x86b5a6,
      pw = (o = {}) => ({ color: v(dc, 0.04), wear: 0.3 + r() * 0.3, bevel: 0.004, rand: r, ...o });
    I.box(WT, W + 0.04, 0.028, D + 0.03, L(0, H - 0.014, 0.005), {
      color: v(0xa8875f),
      bevel: 0.006,
      grain: 0,
      rand: r,
    });
    for (const s of [-1, 1])
      I.box(
        IP,
        0.02,
        H - 0.13,
        D,
        L(s * (W / 2 - 0.01), 0.1 + (H - 0.13) / 2, 0),
        pw({ grain: 1 }),
      );
    I.box(IP, W - 0.04, 0.018, D - 0.02, L(0, 0.11, -0.01), pw());
    I.box(
      IP,
      W - 0.04,
      H - 0.14,
      0.008,
      L(0, 0.42, -D / 2 + 0.006),
      pw({ color: 0x8a7a62, wear: 0.9 }),
    );
    I.box(IP, W - 0.04, 0.02, D - 0.02, L(0, 0.415, -0.01), pw());
    I.box(IP, 0.02, 0.29, D - 0.02, L(0, 0.26, -0.01), pw()); // rail between rows, divider between the lower drawers
    I.box(IP, W - 0.04, 0.03, 0.02, L(0, 0.712 - 0.014, D / 2 - 0.01), pw());
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      I.cyl(IP, 0.026, 0.016, 0.1, L(x * (W / 2 - 0.05), 0.05, z * (D / 2 - 0.05)), {
        seg: 8,
        color: v(dc),
        wear: 0.6,
      });
    // drawers: wide top drawer, two below
    const drawer = (id, label, lx, y0, w, h, fill) => {
      const wp = wpt(L(), lx, y0, D / 2 - 0.012);
      mover({
        id,
        label,
        pos: wp,
        ry: PI / 2,
        kind: 'slide',
        max: 0.3,
        ipos: [wp[0] + 0.12, wp[1] + h / 2, wp[2]],
        draw: (bt) => {
          bt.box(IP, w, h, 0.02, M(0, h / 2, 0.002), pw({ wear: 0.25 + r() * 0.35 }));
          for (const s of [-1, 1]) {
            bt.box(IP, 0.012, h - 0.05, 0.4, M(s * (w / 2 - 0.02), h / 2 - 0.005, -0.2), {
              color: 0xb9a583,
              wear: 0.9,
              bevel: 0.002,
            });
          }
          bt.box(IP, w - 0.04, 0.008, 0.4, M(0, 0.024, -0.2), { color: 0xb9a583, wear: 0.9 });
          bt.box(IP, w - 0.04, h - 0.05, 0.012, M(0, h / 2 - 0.005, -0.4), {
            color: 0xb9a583,
            wear: 0.9,
          });
          for (const s of w > 1 ? [-0.4, 0.4] : [0]) {
            bt.cyl(IP, 0.016, 0.011, 0.022, M(s, h / 2, 0.022, PI / 2, 0, 0), {
              seg: 10,
              color: 0x3a2f25,
              wear: 0,
            });
          }
          fill(bt, w - 0.07, h - 0.06);
        },
      });
    };
    drawer('drawer_tv_top', 'top drawer', 0, 0.44, W - 0.05, 0.255, (bt, w) => {
      bt.tube(
        PL,
        [
          [-0.5, 0.045, -0.1],
          [-0.42, 0.06, -0.25],
          [-0.3, 0.045, -0.12],
          [-0.36, 0.06, -0.3],
          [-0.2, 0.045, -0.22],
          [-0.3, 0.05, -0.08],
        ],
        0.004,
        { seg: 5, color: 0x18181a },
      );
      for (let i = 0; i < 5; i++)
        bt.box(
          PL,
          0.135,
          0.014,
          0.19,
          M(-0.02 + j(0.01), 0.04 + i * 0.0145, -0.2 + j(0.012), 0, j(0.08), 0),
          { color: v([0x1f4f8a, 0x2a2a2e, 0x8a2f2a, 0x2f6f4a, 0xd9d4c6][i], 0.05), bevel: 0.002 },
        ); // game cases
      for (let i = 0; i < 4; i++)
        bt.cyl(PL, 0.007, 0.007, 0.05, M(0.17 + i * 0.016, 0.036, -0.09, PI / 2, 0, j(0.2)), {
          seg: 8,
          color: i % 2 ? 0xc9a23a : 0x2a2a2e,
        }); // loose batteries
      bt.box(PL, 0.07, 0.012, 0.145, M(0.22, 0.036, -0.28, 0, 0.3, 0), {
        color: 0x16171a,
        bevel: 0.006,
      });
      bt.box(PL, 0.062, 0.002, 0.13, M(0.22, 0.043, -0.28, 0, 0.3, 0), { color: 0x2a3440 }); // old phone, cracked
      bt.cyl(PL, 0.02, 0.02, 0.07, M(0.36, 0.05, -0.14, PI / 2, 0.5, 0), {
        seg: 10,
        color: 0x7f9a6a,
      });
      bt.cyl(PL, 0.0215, 0.0215, 0.012, M(0.36, 0.05, -0.14, PI / 2, 0.5, 0), {
        seg: 10,
        color: 0xb5482f,
      }); // roll of cash in a rubber band
      for (let i = 0; i < 4; i++)
        bt.box(
          PL,
          0.2,
          0.002,
          0.11,
          M(0.5 + j(0.02), 0.033 + i * 0.0022, -0.2 + j(0.02), 0, j(0.25), 0),
          { color: v(0xe9e4d6, 0.04) },
        ); // fishing license, receipts
      bt.box(PL, 0.1, 0.03, 0.06, M(0.5, 0.05, -0.33), { color: 0xd9d4c6, bevel: 0.004 });
      bt.box(PL, 0.04, 0.035, 0.075, M(-0.55, 0.05, -0.31), { color: 0x2a2a2e, bevel: 0.006 }); // charger brick
      bt.geo(PL, soft(0.16, 0.04, 0.07, { r: 0.016, seg: 5 }), M(-0.32, 0.055, -0.33, 0, 0.2, 0), {
        color: 0x1a1b1e,
      }); // sunglasses case
    });
    drawer('drawer_tv_left', 'left drawer', -(W / 4 - 0.007), 0.125, W / 2 - 0.04, 0.28, (bt) => {
      // folded shirts
      for (let c = 0; c < 2; c++)
        for (let i = 0; i < 4; i++)
          bt.geo(
            PL,
            soft(0.27, 0.042, 0.33, { r: 0.016, puff: 0.006, seg: 5 }),
            M(-0.16 + c * 0.32 + j(0.01), 0.05 + i * 0.043, -0.2 + j(0.012), 0, j(0.05), 0),
            {
              color: v(
                [0x2f5f7a, 0xd9d4c6, 0x3a3a3e, 0xb5622f, 0x6a8a5a, 0xc9c2ad, 0x1f2a3a, 0x9a3a3a][
                  c * 4 + i
                ],
                0.06,
              ),
            },
          );
    });
    drawer('drawer_tv_right', 'right drawer', W / 4 - 0.007, 0.125, W / 2 - 0.04, 0.28, (bt) => {
      // tools, reel parts, discs
      for (let i = 0; i < 9; i++)
        bt.box(
          PL,
          0.125,
          0.011,
          0.14,
          M(-0.2 + j(0.006), 0.036 + i * 0.0115, -0.12 + j(0.008), 0, j(0.06), 0),
          { color: v([0x16171a, 0xe9e4d6, 0x2f4f8a][i % 3], 0.05), bevel: 0.002 },
        );
      bt.cyl(PL, 0.012, 0.012, 0.11, M(0.02, 0.045, -0.1, PI / 2, 0.4, 0), {
        seg: 8,
        color: 0xb5322a,
      });
      bt.cyl(PL, 0.003, 0.003, 0.1, M(0.06, 0.045, -0.19, PI / 2, 0.4, 0), {
        seg: 5,
        color: 0xa0a0a0,
      });
      bt.box(PL, 0.02, 0.012, 0.16, M(0.14, 0.04, -0.14, 0, -0.2, 0), {
        color: 0x2a5a8a,
        bevel: 0.004,
      });
      bt.box(PL, 0.02, 0.012, 0.16, M(0.17, 0.04, -0.16, 0, 0.1, 0), {
        color: 0x2a5a8a,
        bevel: 0.004,
      }); // pliers
      for (let i = 0; i < 3; i++) {
        bt.cyl(PL, 0.03, 0.03, 0.024, M(0.02 + i * 0.075, 0.046, -0.31), {
          seg: 12,
          color: v(0x8fbfd0, 0.1),
        });
        bt.cyl(PL, 0.034, 0.034, 0.003, M(0.02 + i * 0.075, 0.06, -0.31), {
          seg: 12,
          color: 0x2a2a2e,
        });
      } // line spools
      bt.box(PL, 0.19, 0.035, 0.11, M(0.19, 0.052, -0.3 + 0.0, 0, 0.05, 0), {
        color: 0xc9b23a,
        bevel: 0.004,
      });
      bt.tube(
        PL,
        [
          [-0.05, 0.04, -0.34],
          [0.0, 0.07, -0.25],
          [-0.12, 0.05, -0.27],
          [-0.06, 0.04, -0.36],
        ],
        0.005,
        { seg: 5, color: 0xd96a2a },
      );
    });
    col.box(xf - D / 2 - 0.01, F + H / 2, zc, D + 0.04, H, W + 0.06, { tag: 'furniture' });
    // on top: console, cable box, discs, a jar of shells, cap
    const top = H;
    I.box(PG, 0.27, 0.05, 0.2, L(-0.52, top + 0.027, 0.02, 0, 0.12, 0), {
      color: 0x101114,
      bevel: 0.008,
    });
    I.box(PG, 0.14, 0.004, 0.003, L(-0.52, top + 0.03, 0.122, 0, 0.12, 0), { color: 0x2a2c30 });
    I.box(
      imat.emissive(0x3fd97a, 2.5, 'led'),
      0.006,
      0.003,
      0.002,
      L(-0.62, top + 0.02, 0.118, 0, 0.12, 0),
      {},
    );
    I.box(PL, 0.2, 0.035, 0.14, L(0.5, top + 0.018, -0.05), { color: 0x2a2c30, bevel: 0.005 });
    I.box(imat.emissive(0xd94a2a, 2, 'clk'), 0.05, 0.012, 0.002, L(0.5, top + 0.02, 0.021), {});
    for (let i = 0; i < 6; i++)
      I.box(
        PL,
        0.135,
        0.014,
        0.19,
        L(0.52 + j(0.012), top + 0.043 + i * 0.0145, -0.04 + j(0.012), 0, j(0.12), 0),
        {
          color: v([0x8a2f2a, 0x2a2a2e, 0x1f4f8a, 0xd9d4c6, 0x2f6f4a, 0xc9a23a][i], 0.05),
          bevel: 0.002,
        },
      );
    I.geo(
      CE,
      lathe(
        [
          [0, 0],
          [0.04, 0],
          [0.047, 0.02],
          [0.047, 0.1],
          [0.036, 0.12],
          [0.036, 0.13],
          [0.031, 0.13],
          [0.031, 0.118],
          [0.042, 0.1],
          [0.042, 0.004],
          [0, 0.004],
        ],
        14,
      ),
      L(-0.68, top, -0.13),
      { color: 0xcfe6e0 },
    );
    for (let i = 0; i < 14; i++)
      I.geo(
        CE,
        new THREE.SphereGeometry(0.011 + r() * 0.006, 6, 4),
        L(-0.68 + j(0.022), top + 0.014 + r() * 0.05, -0.13 + j(0.022), r(), r(), r(), 1, 0.6, 1),
        { color: v(0xe9d2bf, 0.12) },
      );
    I.tube(
      RB,
      [
        wpt(L(), -0.5, top + 0.02, -0.1),
        wpt(L(), -0.3, top + 0.006, -0.17),
        wpt(L(), -0.1, top + 0.006, -0.15),
        wpt(L(), 0.0, top + 0.1, -0.12),
      ],
      0.004,
      { seg: 5, color: 0x111214 },
    );
    // ----- the TV: 40 in. flat screen with a thick bezel, facing east -----
    const tvy = top + 0.385;
    I.box(PG, 0.955, 0.575, 0.045, L(0, tvy, -0.03), { color: 0x0b0b0d, bevel: 0.008 });
    I.box(PL, 0.6, 0.36, 0.05, L(0, tvy, -0.07), { color: 0x101012, bevel: 0.02 });
    I.box(PG, 0.12, 0.1, 0.03, L(0, top + 0.06, -0.06), { color: 0x0b0b0d, bevel: 0.006 });
    I.box(PG, 0.46, 0.016, 0.24, L(0, top + 0.009, -0.03), { color: 0x0b0b0d, bevel: 0.006 });
    I.box(PG, 0.895, 0.508, 0.003, L(0, tvy + 0.005, -0.0065), { color: 0x020203 });
    const tvC = kit.canvas(1024, 576, () => {}),
      tvG = tvC.getContext('2d'),
      tvT = new THREE.CanvasTexture(tvC);
    tvT.colorSpace = THREE.SRGBColorSpace;
    tvT.anisotropy = 8;
    const tvM = own({
      map: tvT,
      emissiveMap: tvT,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughness: 0.22,
      metalness: 0,
    });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.885, 0.498), tvM);
    scr.applyMatrix4(L(0, tvy + 0.005, -0.0045));
    scr.name = 'tv_screen';
    ctx.groups.dyn.add(scr);
    const tvL = ctx.addLight({
      id: 'living_tv',
      pos: [xf + 0.7, F + 1.1, zc],
      color: 0x9fc0ff,
      intensity: 9,
      range: 4.5,
      on: false,
    });
    const news = {
      headline: 'KING TIDE PUTS HERON CAY ROAD UNDER WATER AGAIN',
      sub: 'County says new pumps are "on order" for a third straight season',
    };
    let tvMin = -1,
      tvTime = ctx.time ?? 9;
    const drawTV = () => {
      const g = tvG,
        w = 1024,
        h = 576;
      tvT.needsUpdate = true;
      if (!tv.on) {
        g.fillStyle = '#050608';
        g.fillRect(0, 0, w, h);
        const lg = g.createLinearGradient(0, 0, w, h);
        lg.addColorStop(0, 'rgba(120,140,160,0.10)');
        lg.addColorStop(0.5, 'rgba(0,0,0,0)');
        g.fillStyle = lg;
        g.fillRect(0, 0, w, h);
        return;
      }
      const sk = g.createLinearGradient(0, 0, 0, 400);
      sk.addColorStop(0, '#27496b');
      sk.addColorStop(0.7, '#d98a5a');
      sk.addColorStop(1, '#f1c27a');
      g.fillStyle = sk;
      g.fillRect(0, 0, w, 400);
      g.fillStyle = '#f7e2a8';
      g.beginPath();
      g.arc(700, 300, 46, 0, 6.3);
      g.fill();
      g.fillStyle = '#35607a';
      g.fillRect(0, 300, w, 120);
      strokes(g, w, h, 40 + (tvMin % 5), 60, ['#4f86a0', '#e0a070', '#27496b'], 0.53, 0.72, 0.2);
      g.fillStyle = '#14202a';
      for (const [x, s] of [
        [90, 1],
        [330, 0.8],
        [860, 1.1],
      ]) {
        g.fillRect(x, 300 - 90 * s, 150 * s, 60 * s);
        g.beginPath();
        g.moveTo(x - 14 * s, 300 - 90 * s);
        g.lineTo(x + 75 * s, 300 - 135 * s);
        g.lineTo(x + 164 * s, 300 - 90 * s);
        g.fill();
        for (let i = 0; i < 4; i++) g.fillRect(x + 8 * s + i * 44 * s, 300 - 32 * s, 7 * s, 70 * s);
      }
      palm(g, 560, 330, 190, '#14202a');
      palm(g, 250, 325, 130, '#14202a');
      g.fillStyle = '#14202a';
      g.fillRect(470, 250, 8, 90);
      g.save();
      g.translate(474, 240);
      g.rotate(PI / 4);
      g.fillStyle = '#e8c23a';
      g.fillRect(-26, -26, 52, 52);
      g.restore();
      T(g, 'ROAD', 474, 238, 13, '#14202a', { a: 'center' });
      T(g, 'FLOODED', 474, 252, 10, '#14202a', { a: 'center' });
      g.fillStyle = 'rgba(8,20,34,0.82)';
      g.beginPath();
      g.roundRect(30, 26, 222, 76, 10);
      g.fill();
      g.fillStyle = '#19a6a0';
      g.beginPath();
      g.arc(210, 64, 30, 0, 6.3);
      g.fill();
      T(g, '6', 210, 66, 46, '#fff', { a: 'center', b: 'middle', f: IMPACT });
      T(g, 'KPAL', 44, 70, 44, '#fff', { f: IMPACT });
      T(g, 'KEYS NEWS NOW', 46, 92, 15, '#f3b23a');
      g.fillStyle = '#c8322a';
      g.beginPath();
      g.roundRect(820, 34, 170, 40, 6);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(842, 54, 7, 0, 6.3);
      g.fill();
      T(g, 'LIVE · HERON CAY', 858, 61, 17, '#fff');
      g.fillStyle = '#f3b23a';
      g.fillRect(0, 392, 190, 34);
      T(g, 'BREAKING NEWS', 14, 416, 21, '#14202a');
      g.fillStyle = '#f4f2ea';
      g.fillRect(0, 426, w, 78);
      g.fillStyle = '#19a6a0';
      g.fillRect(0, 426, 12, 78);
      let px = 46;
      g.font = kit.font(px, 800);
      const hl = String(news.headline || '').toUpperCase();
      while (g.measureText(hl).width > 790 && px > 22) {
        px -= 2;
        g.font = kit.font(px, 800);
      }
      T(g, hl, 30, 465, px, '#10202c', { w: 800, b: 'middle' });
      g.fillStyle = '#10202c';
      g.fillRect(0, 504, w, 36);
      T(g, String(news.sub || ''), 30, 529, 22, '#e9eef0', { w: 500, max: 780 });
      g.fillStyle = '#19a6a0';
      g.fillRect(836, 426, 188, 114);
      const hh = Math.floor(tvTime) % 24,
        mm = Math.floor((tvTime % 1) * 60);
      T(g, `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`, 930, 478, 44, '#fff', {
        a: 'center',
        f: IMPACT,
      });
      T(g, (hh < 12 ? 'AM' : 'PM') + ' · 84°F', 930, 520, 20, '#e9fbf8', { a: 'center' });
      g.fillStyle = '#0a1620';
      g.fillRect(0, 540, w, 36);
      T(
        g,
        'TIDES  high 9:42p 2.9 ft  ·  MARINE  SE 10-15 kt, bay light chop  ·  FERRY to Key Paloma on time  ·  SNOOK season closes Dec 1',
        20 - ((tvMin * 37) % 300),
        565,
        19,
        '#f3d98a',
        { w: 500 },
      );
    };
    const tv = (ctx.tv = {
      on: false,
      setOn(b) {
        tv.on = !!b;
        tvM.emissiveIntensity = tv.on ? 1.15 : 0;
        tvM.color.set(tv.on ? 0x202020 : 0xffffff);
        tvL.on = tv.on;
        drawTV();
        return tv.on;
      },
      setNews(n = {}) {
        if (n.headline != null) news.headline = n.headline;
        if (n.sub != null) news.sub = n.sub;
        drawTV();
      },
    });
    drawTV();
    ctx.addInteract({
      id: 'tv',
      kind: 'tv',
      label: () => (tv.on ? 'Turn off TV' : 'Watch TV'),
      pos: [xf + 0.25, F + 1.1, zc],
      radius: 1.7,
      use: (env) => {
        tv.setOn(!tv.on);
        env?.emit?.('tv:toggle', { on: tv.on });
        return tv.on;
      },
    });
    let fl = 0;
    ctx.updaters.push((dt, env) => {
      tvTime = env?.timeOfDay ?? tvTime;
      if (!tv.on) return;
      const m = Math.floor(tvTime * 60);
      if (m !== tvMin) {
        tvMin = m;
        drawTV();
      }
      fl += dt;
      tvL.intensity = 8 + Math.sin(fl * 7.3) * 1.2 + Math.sin(fl * 2.1) * 1.5;
    });
    // mounted snook on a plaque above the TV, two framed snapshots beside it
    {
      const Lf = place(-6.245, F + 1.98, zc, PI / 2),
        len = 0.86,
        N = 22,
        Rn = 10,
        pos = [],
        cl = [],
        ix = [];
      I.geo(
        WT,
        new THREE.CylinderGeometry(0.5, 0.5, 0.022, 28),
        Lf(0, 0, 0.011, PI / 2, 0, 0, 1, 1, 1).multiply(M(0, 0, 0, 0, 0, 0, 1, 1, 0.32)),
        { color: 0x7a5234, uvMul: [1.4, 0.4] },
      );
      for (let i = 0; i <= N; i++) {
        const t = i / N,
          hh = 0.008 + 0.1 * Math.pow(Math.sin(PI * Math.pow(t, 0.62)), 0.85) * (1 - 0.35 * t),
          bend = Math.sin(t * 3.4 - 0.4) * 0.03;
        for (let k = 0; k < Rn; k++) {
          const a = (k / Rn) * 6.283,
            y = Math.cos(a) * hh - 0.02 * Math.sin(PI * t),
            z = Math.sin(a) * hh * 0.42 + bend;
          pos.push((0.5 - t) * len, y, z);
          const up = Math.cos(a),
            back = kit.rgb(0x4a5a3a),
            belly = kit.rgb(0xd9d6c6),
            mid = kit.rgb(0xa9aa8c),
            line = Math.abs(up - 0.12) < 0.14 && t > 0.14 ? 0.2 : 1;
          const c =
            up > 0.3
              ? kit.mix(mid, back, Math.min(1, (up - 0.3) * 2))
              : kit.mix(belly, mid, Math.max(0, (up + 0.5) / 0.8));
          cl.push(c[0] * line, c[1] * line, c[2] * line);
        }
      }
      for (let i = 0; i < N; i++)
        for (let k = 0; k < Rn; k++) {
          const a = i * Rn + k,
            b = i * Rn + ((k + 1) % Rn),
            c = a + Rn,
            d = b + Rn;
          ix.push(a, c, b, b, c, d);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      g.setIndex(ix);
      g.computeVertexNormals();
      const fm = Lf(0, 0.02, 0.075);
      I.geo(PG, g, fm, { keepColor: true, color: 0xffffff });
      const K = (x, y, z, rx = 0, ry = 0, rz = 0) => fm.clone().multiply(M(x, y, z, rx, ry, rz)),
        fin = 0xb9a84a;
      for (const s of [-1, 1])
        I.box(PG, 0.15, 0.05, 0.004, K(-0.47, s * 0.045 - 0.0, 0.012, 0, 0, s * -0.55), {
          color: fin,
          bevel: 0.0015,
        });
      I.box(PG, 0.1, 0.07, 0.004, K(0.1, 0.105, 0.0, 0, 0, -0.35), { color: fin, bevel: 0.0015 });
      I.box(PG, 0.1, 0.055, 0.004, K(-0.15, 0.075, 0.0, 0, 0, -0.3), { color: fin, bevel: 0.0015 });
      I.box(PG, 0.07, 0.04, 0.004, K(-0.2, -0.085, 0.01, 0, 0, 0.5), { color: fin, bevel: 0.0015 });
      I.box(PG, 0.07, 0.035, 0.004, K(0.2, -0.07, 0.03, 0.5, 0, 0.6), {
        color: fin,
        bevel: 0.0015,
      });
      I.geo(PG, new THREE.SphereGeometry(0.011, 8, 6), K(0.365, 0.012, 0.022), { color: 0x0a0a0a });
      I.geo(PG, new THREE.SphereGeometry(0.014, 8, 6), K(0.365, 0.012, 0.016), { color: 0xc9a23a });
      I.box(CH, 0.09, 0.022, 0.002, Lf(0, -0.125, 0.024), { color: 0xc9a23a });
      frame('snap1', -6.245, F + 1.6, zc - 0.64, PI / 2, 0.27, 0.2);
      frame('snap3', -6.245, F + 1.64, zc + 0.62, PI / 2, 0.27, 0.2, 0xd9d4c6);
    }
  }

  // ---------- armchair (worn leather club chair in the south-west corner), floor lamp, surfboard ----------
  {
    const L = place(-5.42, F, 1.82, (3 * PI) / 4),
      lc = 0x9a6a46,
      lea = (g, m4, c = lc, um = [1.5, 1.2]) => I.geo(LEA, g, m4, { color: v(c, 0.05), uvMul: um });
    for (const [x, z] of [
      [-0.36, -0.34],
      [0.36, -0.34],
      [-0.36, 0.34],
      [0.36, 0.34],
    ])
      I.box(WT, 0.05, 0.09, 0.05, L(x, 0.045, z), { color: 0x4a3524, bevel: 0.006 });
    lea(soft(0.86, 0.26, 0.82, { r: 0.05 }), L(0, 0.22, 0));
    lea(soft(0.56, 0.6, 0.2, { r: 0.09, puff: 0 }), L(0, 0.62, -0.33, -0.2), 0x8f6040);
    for (const s of [-1, 1]) {
      lea(soft(0.17, 0.36, 0.8, { r: 0.07 }), L(s * 0.345, 0.45, 0.0));
      I.geo(
        LEA,
        new THREE.CylinderGeometry(0.1, 0.1, 0.8, 12),
        L(s * 0.35, 0.62, 0, PI / 2, 0, 0),
        { color: v(0xa87650, 0.04), uvMul: [1.2, 1.5] },
      );
      I.geo(LEA, soft(0.2, 0.2, 0.03, { r: 0.012, seg: 5 }), L(s * 0.35, 0.62, 0.405), {
        color: 0x8a5c3c,
      });
    }
    lea(
      soft(0.52, 0.17, 0.6, { r: 0.07, puff: 0.03, dent: [0, 0.1, 0.035] }),
      L(0, 0.43, 0.08),
      0xa87650,
    );
    lea(
      soft(0.5, 0.17, 0.44, { r: 0.07, puff: 0.035, puffB: 0.5 }),
      L(0, 0.72, -0.2, PI / 2 - 0.24),
      0xa3704a,
    );
    I.geo(
      JER,
      soft(0.3, 0.035, 0.5, { r: 0.012, puff: 0.006, seg: 6 }),
      L(0.35, 0.74, -0.02, 0, 0.1, 0),
      { color: 0xd9d0b8 },
    ); // towel over the arm
    I.box(MT, 0.21, 0.006, 0.28, L(-0.02, 0.523, 0.14, 0.05, 0.3, 0), { color: 0xe9e4d6 });
    A.plane(I, 'cover', L(-0.02, 0.5265, 0.14, -PI / 2 + 0.05, 0.3, 0), 0.105, 0.16); // paperback left on the seat (on a newspaper)
    // milk-crate side table with a can and the lamp behind
    const Lc = place(-4.66, F, 1.55, 0.3),
      cc = 0x2f5f8a;
    for (const y of [0.012, 0.3])
      for (const s of [-1, 1]) {
        I.box(PL, 0.33, 0.024, 0.024, Lc(0, y, s * 0.153), { color: cc, bevel: 0.004 });
        I.box(PL, 0.024, 0.024, 0.33, Lc(s * 0.153, y, 0), { color: cc, bevel: 0.004 });
      }
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      I.box(PL, 0.026, 0.3, 0.026, Lc(x * 0.153, 0.156, z * 0.153), { color: cc, bevel: 0.004 });
    for (let i = -2; i <= 2; i++)
      for (const s of [-1, 1]) {
        I.box(PL, 0.012, 0.28, 0.008, Lc(i * 0.055, 0.156, s * 0.158), { color: cc });
        I.box(PL, 0.008, 0.28, 0.012, Lc(s * 0.158, 0.156, i * 0.055), { color: cc });
      }
    I.box(WD, 0.36, 0.014, 0.36, Lc(0, 0.319, 0, 0, 0.1, 0), { color: 0xa8906e, bevel: 0.003 });
    A.wrap(I, 'can', Lc(0.08, 0.376, -0.06), 0.033, 0.1);
    I.cyl(ST, 0.027, 0.033, 0.012, Lc(0.08, 0.431, -0.06), { seg: 14, color: 0xd8d8d4 });
    I.geo(
      CE,
      lathe(
        [
          [0, 0],
          [0.05, 0],
          [0.058, 0.008],
          [0.06, 0.028],
          [0.052, 0.028],
          [0.046, 0.009],
          [0, 0.008],
        ],
        14,
      ),
      Lc(-0.07, 0.326, 0.06),
      { color: 0x5f8a8a },
    );
    for (let i = 0; i < 7; i++)
      I.box(
        MT,
        0.2 + j(0.02),
        0.004 + r() * 0.008,
        0.27,
        Lc(j(0.02), 0.03 + i * 0.012, j(0.02), 0, j(0.3), 0),
        { color: v(0xd9d4c6, 0.08) },
      ); // magazines inside the crate
    // floor lamp
    const lx = -4.52,
      lz = 2.3,
      Ll = place(lx, F, lz);
    I.geo(
      MP,
      lathe(
        [
          [0, 0],
          [0.14, 0],
          [0.14, 0.012],
          [0.05, 0.03],
          [0.016, 0.045],
          [0.012, 0.05],
          [0, 0.05],
        ],
        20,
      ),
      Ll(),
      { color: 0x4a3a2a },
    );
    I.cyl(MP, 0.011, 0.011, 1.38, Ll(0, 0.74, 0), { seg: 8, color: 0x5a4632 });
    I.cyl(MP, 0.02, 0.016, 0.06, Ll(0, 1.43, 0), { seg: 8, color: 0x3a2f25 });
    for (let i = 0; i < 3; i++)
      I.rod(
        ST,
        wpt(Ll(), 0, 1.4, 0),
        wpt(Ll(), Math.cos(i * 2.094) * 0.15, 1.38, Math.sin(i * 2.094) * 0.15),
        0.002,
        { color: 0x77726a },
      );
    I.tube(
      MT,
      [wpt(Ll(), 0.02, 1.4, 0.01), wpt(Ll(), 0.035, 1.3, 0.02), wpt(Ll(), 0.03, 1.2, 0.02)],
      0.0015,
      { seg: 4, color: 0xc9a23a },
    );
    I.tube(
      RB,
      [
        wpt(Ll(), 0, 0.02, 0.1),
        wpt(Ll(), 0.05, 0.006, 0.2),
        wpt(Ll(), 0.0, 0.006, 0.3),
        wpt(Ll(), 0.02, 0.1, 0.345),
      ],
      0.0035,
      { seg: 5, color: 0x3a2f25 },
    );
    const shM = own({
      color: 0xe6d6b0,
      emissive: 0xffc98a,
      emissiveIntensity: 0,
      roughness: 0.9,
      side: THREE.DoubleSide,
      map: kit.canvasTex(64, 64, (g) => {
        g.fillStyle = '#e9dcba';
        g.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 64; i += 2) {
          g.fillStyle = `rgba(120,95,60,${0.05 + ((i * 7) % 5) * 0.03})`;
          g.fillRect(i, 0, 1, 64);
          g.fillRect(0, i, 64, 1);
        }
        g.fillStyle = 'rgba(150,110,60,0.25)';
        g.fillRect(0, 48, 64, 16);
      }),
    });
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.26, 24, 1, true), shM);
    sh.position.set(lx, F + 1.38, lz);
    sh.rotation.z = 0.05;
    ctx.groups.dyn.add(sh);
    const bulbM = imat.emissive(0xffd9a0, 0, 'nh70lamp');
    I.geo(bulbM, new THREE.SphereGeometry(0.03, 10, 8), Ll(0, 1.36, 0), {});
    const lampL = ctx.addLight({
      id: 'living_lamp',
      pos: [lx + 0.05, F + 1.35, lz - 0.15],
      color: 0xffc98a,
      intensity: 15,
      range: 6,
      on: false,
    });
    let lampMan = null;
    ctx.addInteract({
      id: 'lamp_living',
      kind: 'switch',
      label: () => (lampL.on ? 'Turn off lamp' : 'Turn on lamp'),
      pos: [lx, F + 1.25, lz - 0.1],
      radius: 1.4,
      use: () => {
        lampMan = !lampL.on;
        return lampMan;
      },
    });
    ctx.updaters.push((dt, env) => {
      const on = lampMan ?? night(env?.timeOfDay ?? 12);
      lampL.on = on;
      shM.emissiveIntensity = on ? 0.85 : 0;
      bulbM.emissiveIntensity = on ? 4 : 0;
    });
    // surfboard leaning in the corner (yellowed, a faded red tail dip, three fins), leash on the floor
    {
      const N = 26,
        Rn = 12,
        len = 1.88,
        pos = [],
        cl = [],
        ix = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N,
          w = 0.012 + 0.245 * Math.pow(Math.sin(PI * Math.pow(t, 0.8)), 0.62) * (1 - 0.18 * t * t),
          th = 0.004 + 0.03 * Math.pow(Math.sin(PI * Math.pow(t, 0.9)), 0.5),
          rock = 0.09 * Math.pow(t, 3) + 0.02 * Math.pow(1 - t, 2);
        for (let k = 0; k < Rn; k++) {
          const a = (k / Rn) * 6.283,
            ca = Math.cos(a),
            sa = Math.sin(a),
            x = Math.sign(ca) * Math.pow(Math.abs(ca), 0.7) * w,
            z = sa * th + rock;
          pos.push(x, (t - 0.5) * len, z);
          const base = kit.rgb(0xe6dcba),
            dip = kit.rgb(0xc9644a),
            str = kit.rgb(0x7a6a4a),
            c =
              Math.abs(x) < 0.006
                ? str
                : t < 0.2
                  ? dip
                  : Math.abs(t - 0.24) < 0.012
                    ? kit.rgb(0x2f5f7a)
                    : base;
          cl.push(c[0], c[1], c[2]);
        }
      }
      for (let i = 0; i < N; i++)
        for (let k = 0; k < Rn; k++) {
          const a = i * Rn + k,
            b = i * Rn + ((k + 1) % Rn),
            c = a + Rn,
            d = b + Rn;
          ix.push(a, c, b, b, c, d);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      g.setIndex(ix);
      g.computeVertexNormals();
      const bm = M(-6.03, F + 0.955, 2.44, 0, PI / 4, 0).multiply(M(0, 0, 0, -0.13, 0, 0.05));
      I.geo(PG, g, bm, { keepColor: true, color: 0xffffff });
      for (const [x, y, rz] of [
        [0, -0.8, 0],
        [-0.13, -0.68, 0.1],
        [0.13, -0.68, -0.1],
      ])
        I.box(PG, 0.006, 0.13, 0.1, bm.clone().multiply(M(x, y, -0.07, -0.5, 0, rz)), {
          color: 0x2a2f33,
          bevel: 0.002,
        });
      const q = wpt(bm, 0, -0.85, 0.035);
      I.tube(
        RB,
        [
          q,
          [q[0] + 0.1, F + 0.02, q[2] - 0.12],
          [-5.72, F + 0.012, 2.2],
          [-5.6, F + 0.012, 2.32],
          [-5.72, F + 0.012, 2.42],
          [-5.82, F + 0.012, 2.3],
          [-5.7, F + 0.014, 2.22],
          [-5.55, F + 0.012, 2.4],
        ],
        0.004,
        { seg: 5, color: 0x2f9a8a },
      );
    }
    // red outboard fuel tank and a bait bucket parked under the west window
    {
      const m = M(-5.98, F, 0.98, 0, 0.12, 0),
        K = (x, y, z, rx = 0, ry = 0, rz = 0) => m.clone().multiply(M(x, y, z, rx, ry, rz));
      I.geo(PL, soft(0.3, 0.24, 0.46, { r: 0.05, puff: 0.006, seg: 6 }), K(0, 0.13, 0), {
        color: 0xb5322a,
      });
      I.box(PL, 0.31, 0.02, 0.47, K(0, 0.13, 0), { color: 0xa32c25, bevel: 0.008 });
      I.cyl(PL, 0.035, 0.035, 0.03, K(0, 0.262, 0.1), { seg: 12, color: 0x16171a });
      I.cyl(ST, 0.012, 0.012, 0.03, K(0.06, 0.262, -0.12), { seg: 8, color: 0xb9b9b4 });
      I.tube(
        PL,
        [
          wpt(m, -0.11, 0.25, -0.1),
          wpt(m, -0.1, 0.31, -0.08),
          wpt(m, 0.1, 0.31, -0.08),
          wpt(m, 0.11, 0.25, -0.1),
        ],
        0.011,
        { seg: 6, color: 0xa32c25, tension: 0.1 },
      );
      I.tube(
        RB,
        [
          wpt(m, 0.06, 0.28, -0.12),
          wpt(m, 0.16, 0.3, -0.2),
          wpt(m, 0.26, 0.1, -0.3),
          wpt(m, 0.2, 0.02, -0.42),
          wpt(m, 0.05, 0.02, -0.4),
        ],
        0.008,
        { seg: 6, color: 0x1c1d20 },
      );
      I.geo(RB, soft(0.05, 0.05, 0.1, { r: 0.022, seg: 5 }), K(0.25, 0.08, -0.33, 0.5, 0.4, 0), {
        color: 0x1c1d20,
      });
      const bm = M(-6.0, F, 0.62, 0, 0.5, 0);
      I.geo(
        PL,
        lathe(
          [
            [0, 0],
            [0.125, 0],
            [0.13, 0.008],
            [0.15, 0.36],
            [0.156, 0.36],
            [0.156, 0.37],
            [0.143, 0.37],
            [0.124, 0.014],
            [0, 0.012],
          ],
          20,
        ),
        bm,
        { color: 0xe6e1d2 },
      );
      I.geo(
        ST,
        new THREE.TorusGeometry(0.158, 0.0025, 4, 24, PI),
        bm.clone().multiply(M(0, 0.33, 0, PI / 2 + 1.3, 0, 0)),
        { color: 0x9a9a94 },
      );
      I.cyl(MT, 0.128, 0.128, 0.003, bm.clone().multiply(M(0, 0.05, 0)), {
        seg: 16,
        color: 0x6a6a5a,
      });
    }
    col.box(-6.0, F + 0.3, 0.87, 0.5, 0.6, 0.72, { tag: 'furniture' });
    col.box(-5.365, F + 0.45, 1.925, 1.77, 0.9, 1.45, { tag: 'furniture' });
  }

  // ---------- crate shelves on the south wall: records, paperbacks, boat odds and ends, boombox and conch on top ----------
  {
    const L = place(-3.55, F, 2.475, PI),
      cw = 0.52,
      ch = 0.36,
      cd = 0.34;
    for (let cxi = 0; cxi < 2; cxi++)
      for (let row = 0; row < 3; row++) {
        const x0 = (cxi - 0.5) * cw + j(0.006),
          y0 = row * ch,
          wc = v([0xb39a78, 0xa08a6a, 0xc2ab86][(cxi + row) % 3], 0.06),
          K = (x, y, z, rx = 0, ry = 0, rz = 0) => L(x0 + x, y0 + y, z, rx, ry, rz),
          o = () => ({ color: v(wc, 0.05), bevel: 0.003, wear: 0.4, rand: r });
        for (const s of [-1, 1])
          I.box(WD, 0.016, ch - 0.004, cd, K(s * (cw / 2 - 0.008), ch / 2, 0), {
            ...o(),
            grain: 2,
          });
        for (let i = 0; i < 3; i++) {
          I.box(WD, cw - 0.034, 0.01, 0.1, K(0, 0.007, -0.115 + i * 0.115), o());
          I.box(WD, cw - 0.034, 0.01, 0.1, K(0, ch - 0.009, -0.115 + i * 0.115), o());
          I.box(WD, cw - 0.034, 0.1, 0.01, K(0, 0.065 + i * 0.115, -cd / 2 + 0.006), o());
        }
        const fy = 0.013,
          iw = cw - 0.05;
        if (row === 0 && cxi === 1) {
          for (let i = 0, x = -iw / 2 + 0.01; x < iw / 2 - 0.02; i++) {
            const t = 0.004 + r() * 0.004;
            I.box(MT, t, 0.312, 0.312, K(x, fy + 0.156, 0.0, 0, 0, -0.06 + j(0.02)), {
              color: v(
                [0x1d2a3a, 0xd9c9a0, 0x8a2f2a, 0x2f6f5a, 0xe9e4d6, 0x3a3a3e, 0xc9822f][i % 7],
                0.1,
              ),
            });
            x += t + 0.0015 + r() * 0.002;
          }
        }
        if (row === 0 && cxi === 0) {
          for (let i = 0; i < 5; i++)
            I.geo(
              RB,
              new THREE.TorusGeometry(0.1 - i * 0.004, 0.011, 6, 22),
              K(-0.08, fy + 0.012 + i * 0.02, 0.02, PI / 2, 0, i),
              { color: v(0xd9d0b8, 0.06) },
            );
          I.cyl(PL, 0.045, 0.045, 0.2, K(0.14, fy + 0.1, -0.05), { seg: 12, color: 0x2f5f8a });
          I.cyl(PL, 0.018, 0.03, 0.04, K(0.14, fy + 0.22, -0.05), { seg: 10, color: 0x16171a });
          I.cyl(MP, 0.032, 0.032, 0.19, K(0.16, fy + 0.095, 0.08), { seg: 12, color: 0xc23b33 });
          I.cyl(PL, 0.012, 0.016, 0.03, K(0.16, fy + 0.205, 0.08), { seg: 8, color: 0xe9e4d6 });
        }
        if (row === 1) {
          let x = -iw / 2 + 0.008;
          for (let i = 0; x < iw / 2 - 0.16 * (1 - cxi) - 0.03; i++) {
            const t = 0.018 + r() * 0.02,
              bh = 0.165 + r() * 0.04,
              c = v(
                [0x8a2f2a, 0x2f5f7a, 0xd9c9a0, 0x3a3a3e, 0x6a8a5a, 0xc9822f, 0xe9e4d6, 0x5a3a6a][
                  (i * 3 + cxi) % 8
                ],
                0.1,
              ),
              lean = i > 8 ? 0.16 : j(0.02);
            I.box(
              MT,
              t,
              bh,
              0.115 + r() * 0.02,
              K(x + t / 2 + (lean > 0.1 ? 0.012 : 0), fy + bh / 2, -0.03, 0, 0, -lean),
              { color: c, bevel: 0.002 },
            );
            I.box(
              MT,
              t + 0.001,
              0.02,
              0.004,
              K(x + t / 2 + (lean > 0.1 ? 0.012 : 0), fy + bh * 0.72, 0.03, 0, 0, -lean),
              { color: v(0xe9dfc0, 0.1) },
            );
            x += t + 0.001;
          }
          if (cxi === 0) {
            for (let i = 0; i < 5; i++)
              I.box(
                MT,
                0.115,
                0.022 + r() * 0.01,
                0.17,
                K(0.15 + j(0.006), fy + 0.014 + i * 0.03, 0, 0, PI / 2 + j(0.1), 0),
                {
                  color: v([0x2f6f5a, 0xd9c9a0, 0x8a2f2a, 0x1d2a3a, 0xc9a23a][i], 0.08),
                  bevel: 0.002,
                },
              );
          }
        }
        if (row === 2 && cxi === 0) {
          for (let i = 0; i < 4; i++)
            I.geo(
              JER,
              soft(0.3, 0.05, 0.26, { r: 0.02, puff: 0.006, seg: 5 }),
              K(-0.06 + j(0.01), fy + 0.028 + i * 0.052, 0, 0, j(0.05), 0),
              { color: v([0x2f6f7a, 0xd9d0b8, 0xc9822f, 0xd9d0b8][i], 0.05), uvMul: [1, 1] },
            );
          I.cyl(MP, 0.022, 0.022, 0.16, K(0.17, fy + 0.03, 0.02, PI / 2, 0.2, 0), {
            seg: 10,
            color: 0xd9b23a,
          });
          I.cyl(MP, 0.03, 0.022, 0.04, K(0.185, fy + 0.03, 0.115, PI / 2, 0.2, 0), {
            seg: 10,
            color: 0x16171a,
          });
        }
        if (row === 2 && cxi === 1) {
          I.geo(
            CE,
            lathe(
              [
                [0, 0],
                [0.055, 0],
                [0.07, 0.02],
                [0.075, 0.16],
                [0.06, 0.19],
                [0.06, 0.2],
                [0.052, 0.2],
                [0.052, 0.186],
                [0.068, 0.16],
                [0.064, 0.006],
                [0, 0.006],
              ],
              16,
            ),
            K(-0.12, fy, 0.0),
            { color: 0xbfe0d6 },
          );
          for (let i = 0; i < 26; i++)
            I.geo(
              CE,
              new THREE.SphereGeometry(0.012 + r() * 0.01, 6, 4),
              K(-0.12 + j(0.04), fy + 0.015 + r() * 0.09, j(0.04), r(), r(), r(), 1, 0.55, 1),
              { color: v(0xe9d2bf, 0.14) },
            );
          I.box(PL, 0.13, 0.06, 0.1, K(0.1, fy + 0.03, 0.02, 0, 0.2, 0), {
            color: 0x2a2e3a,
            bevel: 0.01,
          });
          for (const s of [-1, 1])
            I.cyl(PL, 0.026, 0.03, 0.05, K(0.1 + s * 0.032, fy + 0.035, 0.085, PI / 2, 0, 0), {
              seg: 12,
              color: 0x16171a,
            });
          I.tube(
            RB,
            [
              wpt(K(0, 0, 0), 0.04, fy + 0.06, 0.02),
              wpt(K(0, 0, 0), 0.1, fy + 0.14, -0.04),
              wpt(K(0, 0, 0), 0.16, fy + 0.06, 0.02),
            ],
            0.006,
            { seg: 5, color: 0x16171a },
          );
        }
      }
    const top = 3 * ch; // boombox
    {
      const m = L(-0.2, top, 0.0, 0, 0.12, 0),
        K = (x, y, z, rx = 0, ry = 0, rz = 0) => m.clone().multiply(M(x, y, z, rx, ry, rz)),
        bc = 0x2a2c30;
      I.box(PL, 0.52, 0.25, 0.125, K(0, 0.125, 0), { color: bc, bevel: 0.014 });
      I.box(PL, 0.5, 0.012, 0.11, K(0, 0.255, 0), { color: 0x1d1e21, bevel: 0.004 });
      for (const s of [-1, 1]) {
        I.cyl(CH, 0.088, 0.088, 0.012, K(s * 0.165, 0.105, 0.062, PI / 2, 0, 0), {
          seg: 22,
          color: 0xb9b9b4,
        });
        I.geo(
          RB,
          lathe(
            [
              [0.08, 0.012],
              [0.075, 0.01],
              [0.035, -0.004],
              [0.02, 0.006],
              [0, 0.008],
            ],
            20,
          ),
          K(s * 0.165, 0.105, 0.058, PI / 2, 0, 0),
          { color: 0x16171a },
        );
        I.cyl(CH, 0.02, 0.02, 0.01, K(s * 0.165, 0.2, 0.063, PI / 2, 0, 0), {
          seg: 12,
          color: 0x9a9a96,
        });
      }
      I.box(PG, 0.14, 0.085, 0.006, K(0, 0.095, 0.064), { color: 0x0c0d0f, bevel: 0.003 });
      I.box(MT, 0.09, 0.03, 0.002, K(0, 0.1, 0.0675), { color: 0xe9e4d6 });
      for (const s of [-1, 1])
        I.cyl(MT, 0.011, 0.011, 0.002, K(s * 0.025, 0.1, 0.069, PI / 2, 0, 0), {
          seg: 10,
          color: 0x2a2a2e,
        });
      I.box(MT, 0.2, 0.026, 0.003, K(0, 0.2, 0.0635), { color: 0xd9d4c6 });
      I.box(PG, 0.003, 0.03, 0.004, K(0.03, 0.2, 0.0645), { color: 0xc23b33 });
      for (let i = 0; i < 6; i++)
        I.box(PL, 0.026, 0.012, 0.03, K(-0.08 + i * 0.032, 0.262, 0.03), {
          color: i === 5 ? 0xc23b33 : 0x8a8f96,
          bevel: 0.003,
        });
      for (const s of [-1, 1])
        I.cyl(CH, 0.014, 0.014, 0.016, K(s * 0.2, 0.262, -0.02), { seg: 10, color: 0x9a9a96 });
      I.tube(
        PL,
        [
          wpt(m, -0.24, 0.24, 0),
          wpt(m, -0.23, 0.33, 0.0),
          wpt(m, 0, 0.345, 0),
          wpt(m, 0.23, 0.33, 0),
          wpt(m, 0.24, 0.24, 0),
        ],
        0.009,
        { seg: 6, color: bc, tension: 0.2 },
      );
      I.rod(CH, wpt(m, 0.22, 0.25, -0.05), wpt(m, 0.05, 0.62, -0.09), 0.0025, { color: 0xc9c9c4 });
    }
    // queen conch
    {
      const m = L(0.27, top + 0.05, 0.02, 0.2, 0.7, PI / 2 - 0.2),
        sc = 0xe9cdb5;
      I.geo(
        CE,
        lathe(
          [
            [0, 0],
            [0.018, 0.012],
            [0.05, 0.06],
            [0.064, 0.1],
            [0.052, 0.14],
            [0.03, 0.17],
            [0.014, 0.195],
            [0, 0.215],
          ],
          16,
        ),
        m,
        { color: sc },
      );
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * 6.283;
        I.geo(
          CE,
          new THREE.ConeGeometry(0.012, 0.03, 6),
          m
            .clone()
            .multiply(M(Math.cos(a) * 0.06, 0.112, Math.sin(a) * 0.06, 0, -a, -PI / 2 + 0.5)),
          { color: v(sc, 0.05) },
        );
      }
      I.geo(
        CE,
        soft(0.12, 0.018, 0.17, { r: 0.008, puff: -0.012, seg: 6 }),
        m.clone().multiply(M(0.055, 0.075, 0.03, 0, 0.3, 1.1)),
        { color: 0xe89a8a },
      );
    }
    A.plane(I, 'snap2', L(0.33, top + 0.085, -0.1, -0.2, -0.3, 0), 0.2, 0.15);
    I.box(WT, 0.22, 0.17, 0.012, L(0.33, top + 0.085, -0.108, -0.2, -0.3, 0), {
      color: 0x2a2520,
      bevel: 0.003,
    });
    I.geo(MT, new THREE.CylinderGeometry(0.2, 0.2, 0.004, 24), L(0.02, top + 0.002, 0.05), {
      color: 0x8f8778,
    }); // dust ring where something used to sit
    pinned('flyer', -3.72, F + 1.78, 2.647, PI, 0.3, 0.45, 0.03);
    pinned('rec1', -3.3, F + 1.9, 2.647, PI, 0.31, 0.31, -0.04);
    frame('rec2', -3.27, F + 1.52, 2.647, PI, 0.31, 0.31, 0x1c1a17, 0.012);
    col.box(-3.9, F + 0.6, 2.47, 1.76, 1.2, 0.38, { tag: 'furniture' });
  }

  // ---------- corner desk with the laptop ----------
  {
    const L = place(-5.8, F, -2.76, 0),
      H = 0.74,
      wc = 0xd9d4c6;
    I.box(WT, 0.88, 0.028, 0.54, L(0, H - 0.014, 0), {
      color: v(0xb08a5f),
      bevel: 0.006,
      grain: 0,
      rand: r,
    });
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      I.box(IP, 0.045, H - 0.028, 0.045, L(x * 0.4, (H - 0.028) / 2, z * 0.23), {
        color: v(wc, 0.03),
        wear: 0.45,
        bevel: 0.004,
        grain: 1,
        rand: r,
      });
    for (const s of [-1, 1]) {
      I.box(IP, 0.76, 0.09, 0.018, L(0, H - 0.075, s * 0.23), {
        color: v(wc, 0.03),
        wear: 0.35,
        bevel: 0.003,
      });
      I.box(IP, 0.018, 0.09, 0.42, L(s * 0.4, H - 0.075, 0), {
        color: v(wc, 0.03),
        wear: 0.35,
        bevel: 0.003,
      });
    }
    I.box(IP, 0.4, 0.07, 0.012, L(0, H - 0.075, 0.243), {
      color: v(wc, 0.03),
      wear: 0.5,
      bevel: 0.003,
    });
    I.cyl(IP, 0.012, 0.009, 0.02, L(0, H - 0.075, 0.26, PI / 2, 0, 0), {
      seg: 8,
      color: 0x3a2f25,
      wear: 0,
    });
    // laptop
    const lm = L(0.04, H, 0.02, 0, 0.06, 0),
      K = (x, y, z, rx = 0, ry = 0, rz = 0) => lm.clone().multiply(M(x, y, z, rx, ry, rz));
    I.box(PL, 0.335, 0.016, 0.235, K(0, 0.008, 0), { color: 0x9a9da0, bevel: 0.005 });
    I.box(PL, 0.29, 0.002, 0.11, K(0, 0.0165, -0.035), { color: 0x1c1d20 });
    I.box(PL, 0.1, 0.001, 0.06, K(0, 0.0165, 0.075), { color: 0x85888b });
    for (let a = 0; a < 13; a++)
      for (let b = 0; b < 5; b++)
        I.box(PL, 0.018, 0.002, 0.017, K(-0.132 + a * 0.022, 0.018, -0.077 + b * 0.021), {
          color: v(0x2a2c30, 0.08),
        });
    const tilt = -0.33,
      lid = K(0, 0.016, -0.115, tilt, 0, 0),
      LK = (x, y, z) => lid.clone().multiply(M(x, y, z));
    I.box(PL, 0.335, 0.222, 0.008, LK(0, 0.111, -0.004), { color: 0x8f9295, bevel: 0.003 });
    I.box(PG, 0.325, 0.212, 0.002, LK(0, 0.111, 0.0005), { color: 0x08090a });
    A.plane(I, 'sticker', LK(0.07, 0.12, -0.0085).multiply(M(0, 0, 0, 0, PI, 0.2)), 0.07, 0.07);
    const lapC = kit.canvas(1024, 640, () => {}),
      lapG = lapC.getContext('2d'),
      lapT = new THREE.CanvasTexture(lapC);
    lapT.colorSpace = THREE.SRGBColorSpace;
    lapT.anisotropy = 8;
    const lapM = own({
      map: lapT,
      emissiveMap: lapT,
      emissive: 0xffffff,
      emissiveIntensity: 0.85,
      color: 0x181818,
      roughness: 0.3,
    });
    const ls = new THREE.Mesh(new THREE.PlaneGeometry(0.305, 0.1906), lapM);
    ls.applyMatrix4(LK(0, 0.113, 0.002));
    ls.name = 'laptop_screen';
    ctx.groups.dyn.add(ls);
    let page = 0;
    const who = String(ctx.opts?.residentName ?? 'NICO'),
      nice = who.charAt(0) + who.slice(1).toLowerCase();
    const drawLap = () => {
      const g = lapG,
        w = 1024,
        h = 640;
      lapT.needsUpdate = true;
      g.fillStyle = '#dfe3e6';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2b3138';
      g.fillRect(0, 0, w, 44);
      const tabs = ['DriftList · boat parts', 'Paloma Keys CU · Accounts', 'Mail (4)'];
      tabs.forEach((s, i) => {
        g.fillStyle = i === page ? '#f4f5f6' : '#3d454e';
        g.beginPath();
        g.roundRect(12 + i * 262, 8, 252, 40, 8);
        g.fill();
        T(g, s, 26 + i * 262, 34, 19, i === page ? '#1c2228' : '#c5ccd3', { w: 600 });
      });
      g.fillStyle = '#f4f5f6';
      g.fillRect(0, 44, w, 46);
      g.fillStyle = '#fff';
      g.beginPath();
      g.roundRect(110, 52, 800, 30, 15);
      g.fill();
      T(g, '‹   ›   ⟳', 18, 75, 22, '#59626b', { w: 500 });
      T(
        g,
        [
          'driftlist.keys/paloma/boat-parts/40hp-lower-unit',
          'online.palomakeyscu.org/accounts',
          'mail.keysmail.net/inbox',
        ][page],
        130,
        74,
        18,
        '#3a424a',
        { w: 500 },
      );
      if (page === 0) {
        g.fillStyle = '#fff';
        g.fillRect(0, 90, w, h);
        g.fillStyle = '#126a70';
        g.fillRect(0, 90, w, 50);
        T(g, 'DriftList', 24, 126, 32, '#fff', { f: SERIF });
        T(g, 'Key Paloma  ›  for sale  ›  boat parts', 190, 124, 20, '#cfeeee', { w: 500 });
        T(g, '40 HP outboard lower unit, 1998, fresh seals', 24, 186, 34, '#14202a');
        T(g, '$380 OBO', 24, 232, 38, '#1c8a3a');
        T(g, 'Heron Cay  ·  posted 3 days ago  ·  114 views', 220, 228, 21, '#59626b', { w: 500 });
        g.fillStyle = '#9fc9d6';
        g.fillRect(24, 252, 400, 290);
        g.fillStyle = '#b08a5f';
        g.fillRect(24, 452, 400, 90);
        g.save();
        g.translate(224, 395);
        g.rotate(-0.25);
        g.fillStyle = '#3d4850';
        g.beginPath();
        g.roundRect(-40, -150, 80, 200, 16);
        g.fill();
        g.beginPath();
        g.ellipse(10, 70, 110, 40, 0, 0, 6.3);
        g.fill();
        g.fillStyle = '#59626b';
        g.beginPath();
        g.moveTo(-10, 40);
        g.lineTo(-90, 120);
        g.lineTo(-30, 80);
        g.fill();
        g.fillStyle = '#c9ccd0';
        for (let i = 0; i < 3; i++) {
          g.save();
          g.translate(125, 70);
          g.rotate(i * 2.094);
          g.beginPath();
          g.ellipse(0, -34, 16, 34, 0.3, 0, 6.3);
          g.fill();
          g.restore();
        }
        g.restore();
        T(g, '1 / 4', 360, 530, 18, '#fff');
        const lines = [
          'Pulled it off my skiff when I repowered.',
          'Shifts clean, no water in the oil.',
          'Skeg has a chip (see photo 3).',
          'Cash only. I am on Heron Cay Rd most',
          'evenings. Text first. No trades unless',
          'it is a good bait well pump.',
        ];
        lines.forEach((s, i) => T(g, s, 452, 286 + i * 32, 24, '#232b33', { w: 500 }));
        g.fillStyle = '#126a70';
        g.beginPath();
        g.roundRect(452, 480, 250, 54, 8);
        g.fill();
        T(g, 'Message seller', 577, 516, 24, '#fff', { a: 'center' });
        T(g, `seller: ${nice}_HC  ★★★★☆`, 724, 514, 20, '#59626b', { w: 500 });
        g.fillStyle = '#eef1f3';
        g.fillRect(0, 560, w, 80);
        T(
          g,
          'More near you:   bait well pump $25   ·   15 lb anchor + chain $40   ·   trolling motor, needs love $60',
          24,
          606,
          20,
          '#3a424a',
          { w: 500 },
        );
      } else if (page === 1) {
        g.fillStyle = '#f4f6f4';
        g.fillRect(0, 90, w, h);
        g.fillStyle = '#1d4f3a';
        g.fillRect(0, 90, w, 56);
        T(g, 'Paloma Keys Credit Union', 24, 128, 30, '#fff', { f: SERIF });
        T(g, `Welcome back, ${nice}`, 1000, 127, 20, '#cfe6d9', { a: 'right', w: 500 });
        g.fillStyle = '#fff';
        g.beginPath();
        g.roundRect(24, 164, 976, 130, 10);
        g.fill();
        T(g, 'EVERYDAY CHECKING  ····4471', 46, 200, 20, '#59626b');
        T(g, '$212.38', 46, 268, 62, '#14202a');
        T(g, 'available balance', 300, 264, 22, '#59626b', { w: 500 });
        g.fillStyle = '#fbe9e6';
        g.beginPath();
        g.roundRect(600, 184, 380, 90, 8);
        g.fill();
        T(g, '! Low balance alert', 620, 220, 24, '#b5322a');
        T(g, '2 scheduled payments may not clear', 620, 252, 19, '#7a3a34', { w: 500 });
        const tx = [
          ['Nov 12', 'HERON CAY MARINA  FUEL DOCK', '-$46.10'],
          ['Nov 11', 'CASH DEPOSIT  BRANCH 03', '+$180.00'],
          ['Nov 10', 'GULFSIDE POWER & LIGHT  RETURNED', '-$184.20'],
          ['Nov 09', 'PELICAN BAIT & TACKLE', '-$23.75'],
          ['Nov 08', 'RETURNED ITEM FEE', '-$32.00'],
          ['Nov 07', 'MOBILE DEPOSIT  "boat wash x2"', '+$120.00'],
          ['Nov 05', 'CAYO MARKET  #12', '-$31.44'],
        ];
        T(g, 'Recent activity', 46, 334, 24, '#14202a');
        tx.forEach((t, i) => {
          const y = 372 + i * 36;
          if (i % 2 === 0) {
            g.fillStyle = '#eaf0ec';
            g.fillRect(24, y - 25, 976, 36);
          }
          T(g, t[0], 46, y, 21, '#59626b', { w: 500 });
          T(g, t[1], 150, y, 21, '#232b33', { w: 600 });
          T(g, t[2], 980, y, 22, t[2][0] === '+' ? '#1c8a3a' : '#b5322a', { a: 'right' });
        });
      } else {
        g.fillStyle = '#fff';
        g.fillRect(0, 90, w, h);
        g.fillStyle = '#eef1f3';
        g.fillRect(0, 90, 190, h);
        T(g, 'Compose', 30, 136, 24, '#126a70');
        ['Inbox  4', 'Starred', 'Sent', 'Drafts  2', 'Spam  31'].forEach((s, i) =>
          T(g, s, 30, 190 + i * 40, 22, i ? '#59626b' : '#14202a', { w: i ? 500 : 800 }),
        );
        const ms = [
          [
            1,
            'Gulfside Power & Light',
            'FINAL NOTICE: $184.20 past due, service may be interrupted',
            '8:02 AM',
          ],
          [1, 'Heron Cay Marina', 'Slip C-14 invoice #2291 is 30 days overdue', 'Yesterday'],
          [
            1,
            'DriftList',
            'New reply on your listing "40 HP lower unit": is it still avail?',
            'Yesterday',
          ],
          [1, 'Mami', 'llamame mijo. Are you eating? Tia says hi', 'Nov 11'],
          [0, 'Paloma Keys CU', 'Your returned item notice is ready to view', 'Nov 10'],
          [0, 'Capt. Reyes', 'Need a deckhand Sat 5am, cash. You in or not', 'Nov 9'],
          [0, 'Sandbar Surf Co.', 'Your ding repair is ready for pickup ($35)', 'Nov 7'],
          [0, 'KPAL 6 Weather', 'King tide advisory for the lower keys through Sunday', 'Nov 6'],
        ];
        ms.forEach((m, i) => {
          const y = 134 + i * 62;
          g.fillStyle = m[0] ? '#fff' : '#f4f5f6';
          g.fillRect(190, y - 36, 834, 62);
          g.fillStyle = '#dfe3e6';
          g.fillRect(190, y + 25, 834, 1);
          if (m[0]) {
            g.fillStyle = '#126a70';
            g.beginPath();
            g.arc(210, y - 6, 6, 0, 6.3);
            g.fill();
          }
          T(g, m[1], 228, y - 8, 22, '#14202a', { w: m[0] ? 800 : 500 });
          T(g, m[3], 1006, y - 8, 18, '#59626b', { a: 'right', w: 500 });
          T(g, m[2], 228, y + 17, 19, m[0] ? '#232b33' : '#6a737c', {
            w: m[0] ? 600 : 400,
            max: 770,
          });
        });
      }
    };
    drawLap();
    ctx.laptop = {
      get page() {
        return page;
      },
      setPage(p) {
        page = ((p % 3) + 3) % 3;
        drawLap();
      },
    };
    ctx.addInteract({
      id: 'laptop',
      kind: 'laptop',
      label: () => 'Use laptop: ' + ['listing', 'bank', 'mail'][(page + 1) % 3],
      pos: wpt(lm, 0, 0.12, 0.05),
      radius: 1.6,
      use: (env) => {
        page = (page + 1) % 3;
        drawLap();
        env?.emit?.('laptop:page', { page: ['listing', 'bank', 'mail'][page] });
        return page;
      },
    });
    // desk clutter: mug, bills under a shell, pens, mouse, carb part on newspaper, charger
    I.geo(
      CE,
      lathe(
        [
          [0, 0],
          [0.034, 0],
          [0.04, 0.008],
          [0.04, 0.092],
          [0.035, 0.092],
          [0.034, 0.012],
          [0, 0.01],
        ],
        16,
      ),
      L(-0.29, H, 0.1),
      { color: 0xd9d4c6 },
    );
    I.geo(
      CE,
      new THREE.TorusGeometry(0.026, 0.006, 6, 12, PI),
      L(-0.33, H + 0.048, 0.1, 0, 0, PI / 2),
      { color: 0xd9d4c6 },
    );
    I.cyl(MT, 0.033, 0.033, 0.002, L(-0.29, H + 0.07, 0.1), { seg: 12, color: 0x2a1a10 });
    for (let i = 0; i < 6; i++)
      I.box(
        MT,
        0.215,
        0.0015,
        0.11,
        L(0.3 + j(0.012), H + 0.001 + i * 0.0016, 0.14 + j(0.012), 0, j(0.25), 0),
        { color: v(0xece8da, 0.04) },
      );
    I.geo(
      CE,
      lathe(
        [
          [0, 0],
          [0.03, 0.004],
          [0.04, 0.02],
          [0.02, 0.034],
          [0, 0.038],
        ],
        10,
      ),
      L(0.3, H + 0.011, 0.14, 0, 0, 0, 1, 1, 0.75),
      { color: 0xe9cdb5 },
    );
    I.geo(
      CE,
      lathe(
        [
          [0, 0],
          [0.035, 0],
          [0.037, 0.1],
          [0.032, 0.1],
          [0.031, 0.006],
          [0, 0.006],
        ],
        12,
      ),
      L(-0.36, H, -0.17),
      { color: 0x2f5f7a },
    );
    for (let i = 0; i < 5; i++)
      I.cyl(
        PL,
        0.004,
        0.004,
        0.15,
        L(-0.36 + j(0.015), H + 0.085, -0.17 + j(0.015), j(0.18), 0, j(0.18)),
        { seg: 6, color: [0x2f4f8a, 0xc23b33, 0x16171a, 0xd9b23a, 0x2f8a5a][i] },
      );
    I.geo(
      PL,
      soft(0.06, 0.032, 0.1, { r: 0.014, puff: 0.004, seg: 5 }),
      L(0.3, H + 0.017, -0.05, 0, -0.2, 0),
      { color: 0x2a2c30 },
    );
    I.box(RB, 0.2, 0.003, 0.17, L(0.3, H + 0.0015, -0.05, 0, -0.1, 0), { color: 0x1c1d20 });
    I.box(MT, 0.3, 0.003, 0.2, L(-0.25, H + 0.0015, -0.1, 0, 0.3, 0), { color: 0xd4cfbf });
    I.box(ST, 0.07, 0.05, 0.06, L(-0.25, H + 0.028, -0.1, 0, 0.3, 0), {
      color: 0x9a9a94,
      bevel: 0.006,
    });
    I.cyl(ST, 0.022, 0.022, 0.06, L(-0.25, H + 0.07, -0.1), { seg: 10, color: 0xa8a8a2 });
    I.cyl(ST, 0.012, 0.012, 0.07, L(-0.2, H + 0.03, -0.085, 0, 0.3, PI / 2), {
      seg: 8,
      color: 0xb9a23a,
    });
    for (let i = 0; i < 4; i++)
      I.cyl(
        ST,
        0.004,
        0.004,
        0.012,
        L(-0.33 + i * 0.03, H + 0.008, -0.03 + j(0.02), j(1), 0, PI / 2),
        { seg: 6, color: 0xb9b9b4 },
      );
    I.tube(
      RB,
      [
        wpt(lm, -0.168, 0.008, -0.06),
        wpt(lm, -0.25, 0.004, -0.14),
        wpt(lm, -0.3, 0.004, -0.22),
        wpt(L(), -0.4, H - 0.2, -0.265),
        wpt(L(), -0.42, 0.32, -0.275),
      ],
      0.003,
      { seg: 5, color: 0xe9e4d6 },
    );
    I.box(PL, 0.07, 0.115, 0.012, L(-0.42, 0.3, -0.283), { color: 0xe6e1d2, bevel: 0.003 });
    I.box(PL, 0.045, 0.05, 0.03, L(-0.42, 0.315, -0.262), { color: 0xe9e4d6, bevel: 0.004 });
    // desk chair (painted wood, slat back)
    {
      const Lc = place(-5.75, F, -2.2, PI + 0.25),
        cc = 0x3f8f96,
        o = () => ({ color: v(cc, 0.05), wear: 0.4 + r() * 0.3, bevel: 0.004, grain: 1, rand: r });
      for (const [x, z] of [
        [-1, 1],
        [1, 1],
      ])
        I.box(IP, 0.035, 0.44, 0.035, Lc(x * 0.18, 0.22, z * 0.17), o());
      for (const s of [-1, 1]) I.box(IP, 0.035, 0.88, 0.035, Lc(s * 0.18, 0.44, -0.18, -0.06), o());
      I.box(IP, 0.42, 0.025, 0.4, Lc(0, 0.45, 0), { ...o(), grain: 2 });
      for (const y of [0.62, 0.74, 0.845])
        I.box(IP, 0.36, 0.05, 0.016, Lc(0, y, -0.185 - (y - 0.44) * 0.06, -0.06), {
          ...o(),
          grain: 0,
        });
      for (const s of [-1, 1])
        I.box(IP, 0.02, 0.025, 0.32, Lc(s * 0.18, 0.2, 0), { ...o(), grain: 2 });
      I.box(IP, 0.34, 0.025, 0.02, Lc(0, 0.26, 0.17), { ...o(), grain: 0 });
      I.geo(JER, soft(0.36, 0.045, 0.34, { r: 0.02, puff: 0.012, seg: 6 }), Lc(0, 0.485, 0.0), {
        color: 0xc98a4a,
        uvMul: [1.2, 1.2],
      });
    }
    col.box(-5.8, F + 0.45, -2.5, 0.9, 0.9, 1.1, { tag: 'furniture' });
    pinned('chart', -5.8, F + 1.6, -3.047, 0, 0.6, 0.75, -0.015);
    pinned('surf', -6.247, F + 1.62, 2.17, PI / 2, 0.5, 0.75, 0.02);
  }

  // ---------- rod rack, cast net and tackle box on the north wall ----------
  {
    const L = place(-2.94, F, -3.05, 0);
    I.box(WD, 0.62, 0.07, 0.04, L(0, 1.28, 0.02), { color: v(0xa8906e), bevel: 0.004, grain: 0 });
    I.box(WD, 0.62, 0.045, 0.1, L(0, 0.13, 0.05), { color: v(0xa8906e), bevel: 0.004, grain: 0 });
    for (const s of [-1, 1])
      I.cyl(ST, 0.006, 0.006, 0.004, L(s * 0.27, 1.28, 0.042, PI / 2, 0, 0), {
        seg: 6,
        color: 0x77726a,
      });
    const rods = [
      [-0.21, 0x16171a, true, 1.55],
      [-0.07, 0x1f3a5a, false, 1.42],
      [0.07, 0xd9d4c6, true, 1.6],
      [0.21, 0x3a2a22, true, 1.3],
    ];
    for (const [x, bc, reel, bl] of rods) {
      const lean = j(0.012),
        m = L(x, 0.14, 0.055, 0.012, 0, lean),
        K = (xx, y, z, rx = 0, ry = 0, rz = 0) => m.clone().multiply(M(xx, y, z, rx, ry, rz));
      I.cyl(MT, 0.02, 0.02, 0.012, L(x, 0.157, 0.055), { seg: 10, color: 0x0c0b0a });
      I.box(PL, 0.035, 0.03, 0.016, L(x, 1.28, 0.05), { color: 0x16171a, bevel: 0.004 });
      I.cyl(MT, 0.0125, 0.014, 0.26, K(0, 0.13, 0), { seg: 8, color: v(0xc9a573, 0.06) });
      I.cyl(RB, 0.015, 0.015, 0.02, K(0, 0.005, 0), { seg: 8, color: 0x16171a });
      I.cyl(MP, 0.011, 0.011, 0.1, K(0, 0.31, 0), { seg: 8, color: 0x2a2c30 });
      I.cyl(MT, 0.011, 0.0125, 0.11, K(0, 0.415, 0), { seg: 8, color: v(0xc9a573, 0.06) });
      I.cyl(PG, 0.0016, 0.006, bl, K(0, 0.47 + bl / 2, 0), { seg: 6, color: bc });
      for (let i = 0; i < 6; i++) {
        const t = (i + 1) / 6.2,
          y = 0.47 + bl * Math.pow(t, 0.8),
          rr = 0.014 - t * 0.0105;
        I.geo(ST, new THREE.TorusGeometry(rr, 0.0011, 4, 10), K(0, y, rr + 0.004, PI / 2, 0, 0), {
          color: 0xb9b9b4,
        });
        I.box(ST, 0.002, 0.02, 0.002, K(0, y - 0.006, 0.004, 0.5, 0, 0), { color: 0x16171a });
      }
      I.box(MT, 0.002, bl * 0.2, 0.002, K(0, 0.5 + bl * 0.15, 0.001), { color: 0xc9a23a });
      if (reel) {
        I.box(PG, 0.012, 0.05, 0.012, K(0, 0.31, 0.03), { color: 0x1d2228, bevel: 0.003 });
        I.geo(PG, soft(0.045, 0.06, 0.04, { r: 0.015, seg: 5 }), K(0, 0.31, 0.068), {
          color: v(0x1d2228, 0.1),
        });
        I.cyl(PG, 0.027, 0.03, 0.03, K(0, 0.355, 0.068), { seg: 12, color: 0x2a2f36 });
        I.cyl(ST, 0.022, 0.022, 0.03, K(0, 0.385, 0.068), { seg: 12, color: 0xc9a23a });
        I.cyl(ST, 0.027, 0.027, 0.003, K(0, 0.401, 0.068), { seg: 12, color: 0xc9a23a });
        I.cyl(MT, 0.02, 0.02, 0.022, K(0, 0.383, 0.068), { seg: 10, color: 0x9fd0c0 });
        I.geo(
          ST,
          new THREE.TorusGeometry(0.031, 0.0013, 4, 12, PI),
          K(0, 0.372, 0.068, 0.5, 0, 0),
          { color: 0xb9b9b4 },
        );
        I.rod(ST, wpt(m, 0.024, 0.31, 0.068), wpt(m, 0.06, 0.3, 0.068), 0.003, { color: 0xb9b9b4 });
        I.rod(ST, wpt(m, 0.06, 0.3, 0.068), wpt(m, 0.062, 0.26, 0.075), 0.003, { color: 0xb9b9b4 });
        I.geo(RB, soft(0.018, 0.03, 0.022, { r: 0.008, seg: 4 }), K(0.062, 0.25, 0.076), {
          color: 0x16171a,
        });
      }
    }
    // tackle box on the floor, a lure card and bobbers on its lid
    {
      const m = M(-2.52, F, -2.8, 0, 0.15, 0),
        K = (x, y, z, rx = 0, ry = 0, rz = 0) => m.clone().multiply(M(x, y, z, rx, ry, rz));
      I.box(PL, 0.44, 0.15, 0.23, K(0, 0.075, 0), { color: 0x5a6a4a, bevel: 0.012 });
      I.box(PL, 0.45, 0.07, 0.24, K(0, 0.185, 0), { color: 0xc9b98f, bevel: 0.014 });
      for (const s of [-1, 1])
        I.box(ST, 0.035, 0.05, 0.008, K(s * 0.13, 0.14, 0.121), { color: 0xb9b9b4, bevel: 0.002 });
      I.tube(
        PL,
        [
          wpt(m, -0.09, 0.22, 0),
          wpt(m, -0.08, 0.26, 0.01),
          wpt(m, 0.08, 0.26, 0.01),
          wpt(m, 0.09, 0.22, 0),
        ],
        0.008,
        { seg: 6, color: 0x3a3a3e, tension: 0.1 },
      );
      for (let i = 0; i < 3; i++) {
        I.geo(
          PG,
          new THREE.SphereGeometry(0.018, 10, 8),
          K(0.14 + i * 0.03, 0.238, -0.06 + j(0.03)),
          { color: i % 2 ? 0xc23b33 : 0xe9e4d6 },
        );
      }
      I.box(MT, 0.09, 0.002, 0.14, K(-0.13, 0.222, 0.02, 0, 0.3, 0), { color: 0xd9b23a });
      I.geo(PG, soft(0.018, 0.012, 0.07, { r: 0.006, seg: 4 }), K(-0.13, 0.23, 0.02, 0, 0.3, 0), {
        color: 0x7fd0c0,
      });
    }
    // cast net hanging from a nail, lead line bunched at the bottom
    {
      const NET = own({
        map: kit.canvasTex(64, 64, (g) => {
          g.clearRect(0, 0, 64, 64);
          g.strokeStyle = 'rgba(214,220,205,1)';
          g.lineWidth = 2.2;
          for (let i = -64; i <= 128; i += 16) {
            g.beginPath();
            g.moveTo(i, 0);
            g.lineTo(i + 64, 64);
            g.stroke();
            g.beginPath();
            g.moveTo(i + 64, 0);
            g.lineTo(i, 64);
            g.stroke();
          }
        }),
        transparent: false,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.9,
        color: 0xdfe6d6,
      });
      const nx = -2.44,
        ny = F + 1.86,
        nz = -3.0,
        N = 14,
        Rn = 22,
        pos = [],
        uv = [],
        ix = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N,
          rad = 0.012 + 0.13 * Math.pow(t, 0.7);
        for (let k = 0; k <= Rn; k++) {
          const a = (k / Rn) * 6.283,
            f = 1 + 0.35 * Math.sin(a * 7 + t * 2) * t;
          pos.push(
            Math.cos(a) * rad * f,
            -t * 1.02 - (i === N ? Math.sin(a * 7) * 0.02 : 0),
            Math.max(-0.035, Math.sin(a) * rad * f * 0.6) + 0.035 * t + 0.03,
          );
          uv.push((k / Rn) * 10, t * 22);
        }
      }
      for (let i = 0; i < N; i++)
        for (let k = 0; k < Rn; k++) {
          const a = i * (Rn + 1) + k,
            b = a + 1,
            c = a + Rn + 1,
            d = c + 1;
          ix.push(a, c, b, b, c, d);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(ix);
      g.computeVertexNormals();
      const net = new THREE.Mesh(g, NET);
      net.position.set(nx, ny, nz);
      net.castShadow = true;
      ctx.groups.int.add(net);
      I.cyl(ST, 0.003, 0.003, 0.05, M(nx, ny + 0.01, nz - 0.02, PI / 2 - 0.3, 0, 0), {
        seg: 5,
        color: 0x77726a,
      });
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * 6.283,
          f = 1 + 0.35 * Math.sin(a * 7 + 2);
        I.cyl(
          MP,
          0.008,
          0.008,
          0.02,
          M(
            nx + Math.cos(a) * 0.142 * f,
            ny - 1.03 - Math.sin(a * 7) * 0.02,
            nz + Math.max(-0.035, Math.sin(a) * 0.142 * f * 0.6) + 0.065,
            PI / 2,
            a,
            0,
          ),
          { seg: 6, color: 0x5a5a58 },
        );
      }
      I.tube(
        MT,
        [
          [nx, ny, nz + 0.03],
          [nx + 0.06, ny - 0.1, nz + 0.05],
          [nx + 0.09, ny - 0.3, nz + 0.05],
          [nx + 0.03, ny - 0.42, nz + 0.06],
          [nx + 0.1, ny - 0.3, nz + 0.07],
          [nx + 0.07, ny - 0.12, nz + 0.06],
        ],
        0.004,
        { seg: 5, color: 0xe9e4d6 },
      );
    }
    col.box(-2.82, F + 1.05, -2.86, 1.0, 2.1, 0.38, { tag: 'furniture' });
  }

  // ---------- window AC, inside face (W3) ----------
  {
    const o = ctx.acWindow || ctx.openings?.W3,
      zc = o ? o.wall.pt(o.u, 0, 0).z : -1.65,
      y0 = (o ? o.y0 : F + 0.8) + 0.03,
      L = place(R.x0 - 0.02, y0, zc, PI / 2),
      ac = 0xd4cdb8;
    I.box(PL, 0.62, 0.4, 0.22, L(0, 0.2, 0.06), { color: v(ac, 0.02), bevel: 0.012 });
    I.box(PL, 0.6, 0.38, 0.02, L(0, 0.2, 0.178), { color: v(0xddd6c2, 0.02), bevel: 0.008 });
    for (let i = 0; i < 13; i++)
      I.box(PL, 0.42, 0.004, 0.016, L(-0.08, 0.05 + i * 0.019, 0.19, 0.6, 0, 0), {
        color: v(0xc9c2ad, 0.03),
      });
    I.box(MT, 0.42, 0.25, 0.002, L(-0.08, 0.165, 0.184), { color: 0x4a4a46 });
    for (let i = 0; i < 5; i++)
      I.box(
        PL,
        0.076,
        0.05,
        0.004,
        L(-0.25 + i * 0.085, 0.345, 0.186, 0, 0.5 * (i % 2 ? 1 : 0.6), 0),
        { color: v(0xc9c2ad, 0.03) },
      );
    I.box(MT, 0.44, 0.06, 0.002, L(-0.08, 0.345, 0.183), { color: 0x1c1b19 });
    A.plane(I, 'acpanel', L(0.225, 0.2, 0.1885), 0.13, 0.26);
    for (const y of [0.275, 0.165]) {
      I.cyl(PL, 0.022, 0.025, 0.02, L(0.225, y, 0.198, PI / 2, 0, 0), { seg: 12, color: 0x6a655c });
      I.box(PL, 0.005, 0.03, 0.006, L(0.225, y, 0.21, 0, 0, 0.7), { color: 0xe9e4d6 });
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 9; i++)
        I.box(
          PL,
          0.018,
          0.4,
          0.004,
          L(s * (0.325 + i * 0.019), 0.2, 0.012 + (i % 2) * 0.012, 0, (i % 2 ? 1 : -1) * 0.5, 0),
          { color: v(0xe6e1d2, 0.03) },
        );
      I.box(PL, 0.012, 0.41, 0.03, L(s * 0.488, 0.2, 0.02), { color: 0xddd6c2 });
    }
    I.box(MT, 0.98, 0.03, 0.002, L(0, 0.41, 0.03, -0.4, 0, 0), { color: 0x9c9c98 }); // duct tape sealing the top
    I.tube(
      RB,
      [
        wpt(L(), 0.28, 0.02, 0.1),
        wpt(L(), 0.4, -0.2, 0.06),
        wpt(L(), 0.5, -0.42, 0.03),
        wpt(L(), 0.55, -0.5, 0.025),
      ],
      0.005,
      { seg: 5, color: 0x8a8578 },
    );
    I.box(PL, 0.07, 0.115, 0.01, L(0.55, -0.5, 0.025), { color: 0xe6e1d2, bevel: 0.003 });
    I.box(PL, 0.035, 0.045, 0.035, L(0.55, -0.48, 0.045), { color: 0x8a8578, bevel: 0.006 });
    I.geo(MT, new THREE.PlaneGeometry(0.2, 0.42), L(-0.15, -0.26, 0.022), { color: 0xb9ae8f }); // condensate stain down the paneling
  }

  // ---------- ceiling fan with a three-shade light kit ----------
  {
    const fx = -4.3,
      fz = 0.4,
      hub = CEIL - 0.33,
      L = place(fx, 0, fz),
      bc = 0x8a6a48;
    I.geo(
      MP,
      lathe(
        [
          [0.012, CEIL - 0.07],
          [0.07, CEIL - 0.05],
          [0.075, CEIL - 0.001],
        ],
        18,
      ),
      L(),
      { color: 0xd9d2bf },
    );
    I.cyl(MP, 0.011, 0.011, 0.2, L(0, CEIL - 0.16, 0), { seg: 8, color: 0xd9d2bf });
    I.geo(
      MP,
      lathe(
        [
          [0.02, hub - 0.085],
          [0.085, hub - 0.08],
          [0.11, hub - 0.04],
          [0.11, hub + 0.03],
          [0.07, hub + 0.07],
          [0.02, hub + 0.08],
        ],
        22,
      ),
      L(),
      { color: 0xd9d2bf },
    );
    I.cyl(MP, 0.045, 0.05, 0.07, L(0, hub - 0.12, 0), { seg: 14, color: 0xcfc8b4 });
    I.cyl(MP, 0.02, 0.045, 0.03, L(0, hub - 0.165, 0), { seg: 12, color: 0xcfc8b4 });
    const glow = own({
        color: 0xf4ecd8,
        emissive: 0xffd9a0,
        emissiveIntensity: 0,
        roughness: 0.35,
        side: THREE.DoubleSide,
      }),
      gb = kit.batch('fan_shades');
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094 + 0.4,
        ax = Math.cos(a),
        az = Math.sin(a);
      I.rod(
        MP,
        wpt(L(), ax * 0.03, hub - 0.15, az * 0.03),
        wpt(L(), ax * 0.13, hub - 0.2, az * 0.13),
        0.007,
        { color: 0xcfc8b4 },
      );
      gb.geo(
        glow,
        lathe(
          [
            [0.022, 0],
            [0.04, -0.02],
            [0.062, -0.07],
            [0.07, -0.105],
            [0.066, -0.105],
            [0.058, -0.07],
            [0.037, -0.022],
            [0.02, -0.004],
          ],
          14,
        ),
        M(fx + ax * 0.15, hub - 0.2, fz + az * 0.15, 0, -a, -0.5),
        {},
      );
    }
    gb.build(ctx.groups.int, { cast: false });
    for (const [dx, len, c] of [
      [0.03, 0.22, 0xc9a23a],
      [-0.03, 0.14, 0xc9a23a],
    ]) {
      I.cyl(CH, 0.0012, 0.0012, len, L(dx, hub - 0.18 - len / 2, 0.035), { seg: 4, color: c });
      I.geo(CE, new THREE.SphereGeometry(0.008, 8, 6), L(dx, hub - 0.18 - len, 0.035), {
        color: 0xe9e4d6,
      });
    }
    const rot = new THREE.Group();
    rot.position.set(fx, hub, fz);
    ctx.groups.dyn.add(rot);
    const fb = kit.batch('fan_blades');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.283,
        m = M(0, 0, 0, 0, a, 0),
        K = (x, y, z, rx = 0, ry = 0, rz = 0) => m.clone().multiply(M(x, y, z, rx, ry, rz));
      fb.box(MP, 0.14, 0.006, 0.05, K(0.16, -0.012, 0), { color: 0xb9a23a, bevel: 0.002 });
      fb.box(MP, 0.45, 0.007, 0.125, K(0.445, -0.012, 0, 0.21, 0, 0), {
        color: v(bc, 0.05),
        bevel: 0.003,
      });
      fb.cyl(MP, 0.0625, 0.0625, 0.007, K(0.67, -0.012, 0, 0.21, 0, 0), {
        seg: 12,
        color: v(bc, 0.05),
      });
      fb.box(MP, 0.3, 0.0015, 0.05, K(0.45, -0.0075, -0.015, 0.21, 0, 0), { color: 0x6a5a48 });
    }
    fb.cyl(MP, 0.112, 0.112, 0.02, M(0, 0, 0), { seg: 22, color: 0xcfc8b4 });
    fb.build(rot, { cast: true });
    const fanL = ctx.addLight({
      id: 'living_fan',
      pos: [fx, hub - 0.35, fz],
      color: 0xffd9a8,
      intensity: 30,
      range: 9,
      on: false,
    });
    let man = null,
      fanOn = true,
      spd = 2.2;
    // wall switch by the front door (latch side), a second plate for looks
    const sx = -0.72,
      sy = F + 1.22,
      sz = 2.645,
      Ls = place(sx, sy, sz, PI);
    I.box(PL, 0.075, 0.118, 0.006, Ls(0, 0, 0.003), { color: 0xe6e1d2, bevel: 0.002 });
    I.box(PL, 0.012, 0.026, 0.01, Ls(0, 0.004, 0.008, 0.35, 0, 0), {
      color: 0xf1eee4,
      bevel: 0.002,
    });
    for (const s of [-1, 1])
      I.cyl(ST, 0.003, 0.003, 0.002, Ls(0, s * 0.03, 0.0065, PI / 2, 0, 0), {
        seg: 6,
        color: 0x9a9a94,
      });
    I.geo(MT, new THREE.PlaneGeometry(0.16, 0.2), Ls(0, -0.01, 0.0015), { color: 0xcfc6ac }); // grubby hand marks around the plate
    ctx.addInteract({
      id: 'switch_living',
      kind: 'switch',
      label: () => (fanL.on ? 'Fan and light off' : 'Fan and light on'),
      pos: [sx, sy, sz - 0.1],
      radius: 1.3,
      use: () => {
        man = !fanL.on;
        fanOn = man;
        return man;
      },
    });
    ctx.fan = {
      get on() {
        return fanOn;
      },
      light: fanL,
    };
    ctx.updaters.push((dt, env) => {
      const on = man ?? night(env?.timeOfDay ?? 12);
      fanL.on = on;
      glow.emissiveIntensity = on ? 2.6 : 0;
      spd += ((fanOn ? 2.4 : 0) - spd) * Math.min(1, dt * 0.6);
      if (spd > 0.01) rot.rotation.y -= spd * dt;
      rot.rotation.z = Math.sin(rot.rotation.y) * 0.004 * spd;
    });
  }

  // ---------- wall clock above the sliding door (hands follow game time) ----------
  {
    const cx = -4.3,
      cy = F + 2.39,
      cz = R.z0 + 0.004,
      L = place(cx, cy, cz, 0);
    I.geo(PL, new THREE.TorusGeometry(0.15, 0.014, 8, 32), L(0, 0, 0.016), { color: 0x2f6f78 });
    I.cyl(PL, 0.15, 0.15, 0.02, L(0, 0, 0.008, PI / 2, 0, 0), { seg: 28, color: 0x2a2c30 });
    I.geo(
      A.m,
      new THREE.CircleGeometry(0.142, 32),
      L(0, 0, 0.0185),
      (() => {
        const u = A.uv('clock');
        return { uvMul: u.uvMul, uvOff: u.uvOff };
      })(),
    );
    const hm = imat.plastic(),
      mk = (len, w, c, z) => {
        const g = new THREE.Group();
        g.position.set(cx, cy, cz + z);
        const b = kit.batch('hand');
        b.box(hm, w, len, 0.002, M(0, len / 2 - 0.018, 0), { color: c, bevel: 0.0008 });
        b.cyl(hm, w * 0.9, w * 0.9, 0.003, M(0, 0, 0, PI / 2, 0, 0), { seg: 8, color: c });
        b.build(g, { cast: false });
        ctx.groups.dyn.add(g);
        return g;
      };
    const hh = mk(0.085, 0.011, 0x16171a, 0.021),
      mh = mk(0.125, 0.007, 0x16171a, 0.0235);
    const setT = (t) => {
      hh.rotation.z = -((t % 12) / 12) * 6.283185;
      mh.rotation.z = -(t % 1) * 6.283185;
    };
    setT(ctx.time ?? 9);
    ctx.updaters.push((dt, env) => {
      if (env?.timeOfDay != null) setT(env.timeOfDay);
    });
  }

  // ---------- by the front door: boot tray, flip-flops, rubber boots, sneakers ----------
  {
    const L = place(-0.5, F, 2.47, 0);
    I.box(RB, 0.66, 0.012, 0.32, L(0, 0.006, 0), { color: 0x2a2c2e, bevel: 0.005 });
    for (const s of [-1, 1]) {
      I.box(RB, 0.66, 0.02, 0.012, L(0, 0.012, s * 0.158), { color: 0x2a2c2e, bevel: 0.004 });
      I.box(RB, 0.012, 0.02, 0.32, L(s * 0.328, 0.012, 0), { color: 0x2a2c2e, bevel: 0.004 });
    }
    const flop = (m, c, sc) => {
      I.geo(RB, soft(0.1, 0.016, 0.27, { r: 0.008, seg: 6 }), m, { color: c });
      const p = (x, y, z) => wpt(m, x, y, z);
      I.tube(RB, [p(-0.04, 0.006, -0.02), p(-0.025, 0.035, -0.06), p(0.005, 0.012, -0.1)], 0.004, {
        seg: 5,
        color: sc,
      });
      I.tube(RB, [p(0.045, 0.006, -0.02), p(0.03, 0.035, -0.06), p(0.005, 0.012, -0.1)], 0.004, {
        seg: 5,
        color: sc,
      });
    };
    flop(L(-0.24, 0.02, 0.0, 0, 0.1, 0), 0x2f6f7a, 0x16171a);
    flop(L(-0.12, 0.02, 0.02, 0, -0.15, 0), 0x2f6f7a, 0x16171a);
    flop(L(-0.55, 0.008, -0.2, 0, 0.9, 0), 0xc9822f, 0xe9e4d6);
    flop(L(-0.47, 0.014, -0.34, 0.08, 2.4, 0), 0xc9822f, 0xe9e4d6);
    for (const [x, lean] of [
      [0.06, 0],
      [0.19, 0.25],
    ]) {
      const m = L(x, 0.012, 0.03, 0, 0.1, lean),
        K = (xx, y, z, rx = 0) => m.clone().multiply(M(xx, y, z, rx, 0, 0));
      I.geo(
        RB,
        lathe(
          [
            [0.05, 0],
            [0.048, 0.12],
            [0.056, 0.3],
            [0.058, 0.36],
            [0.052, 0.36],
            [0.05, 0.3],
            [0.042, 0.12],
            [0.044, 0.01],
          ],
          12,
        ),
        K(0, 0.02, 0.05),
        { color: 0xe6e1d2 },
      );
      I.geo(RB, soft(0.105, 0.085, 0.27, { r: 0.04, seg: 6 }), K(0, 0.045, -0.03), {
        color: 0xe6e1d2,
      });
      I.box(RB, 0.108, 0.016, 0.28, K(0, 0.008, -0.03), { color: 0xb5a98a, bevel: 0.006 });
    }
    for (const [x, z, ry] of [
      [-0.02, -0.33, 0.5],
      [0.13, -0.27, 0.8],
    ]) {
      const m = L(x, 0, z, 0, ry, 0),
        K = (xx, y, zz, rx = 0) => m.clone().multiply(M(xx, y, zz, rx, 0, 0));
      I.box(RB, 0.1, 0.026, 0.28, K(0, 0.013, 0), { color: 0xd9d4c6, bevel: 0.01 });
      I.geo(JER, soft(0.094, 0.075, 0.26, { r: 0.035, seg: 6 }), K(0, 0.058, 0.0), {
        color: 0x4a5a6a,
        uvMul: [0.6, 0.6],
      });
      I.geo(JER, soft(0.085, 0.06, 0.1, { r: 0.028, seg: 5 }), K(0, 0.095, 0.075), {
        color: 0x4a5a6a,
        uvMul: [0.4, 0.4],
      });
      I.cyl(MT, 0.03, 0.03, 0.004, K(0, 0.126, 0.075), { seg: 10, color: 0x1c1d20 });
      for (let i = 0; i < 4; i++)
        I.box(MT, 0.05, 0.004, 0.006, K(0, 0.094 - i * 0.004, -0.02 - i * 0.025, 0.3), {
          color: 0xe9e4d6,
        });
    }
  }
}

// Parametric bird: builder, procedural animation and flock behavior shared by every bird species.
//   makeBird(spec) -> { paint(T, v), build(THREE, tex, v) }   spec fields are documented at SPEC below
//   flockActor(THREE, world, site, make, cfg) -> actor        loafing / perching / wire / circling / line-gliding / plunge-diving
// Rest pose = flight: body horizontal along Z, wings spread along X, legs hanging. Standing pitches the body up about the hips.
import { T, L, R, M } from '../../kit/index.js';

export const REG = {
  BODY: [0, 0, 1, 0.44],
  WING: [0, 0.46, 1, 0.8],
  TAIL: [0, 0.82, 0.3, 1],
  BILL: [0.32, 0.82, 0.62, 0.91],
  LEG: [0.32, 0.93, 0.62, 1],
  EYE: [0.64, 0.82, 0.74, 0.92],
  WEB: [0.76, 0.82, 1, 1],
};
// SPEC: { body: [length, halfWidth, halfHeight], neck: [length, radius], head: radius, bill: [length, depth, width, pouch 0..1, hook 0..1],
//         leg: [thigh, tarsus, radius], toe: length, webbed: bool, wing: [halfSpan, chord, pointed 0..1], tail: [length, halfWidth],
//         stand: body pitch when standing (rad), neckS: neck fold when resting (rad), flapHz, cruise (m/s),
//         cols: { head, neck, back, belly, covert, flight, tip, tail, bill, billTip, leg, iris, eyeRing }, extra(s, T, REG, v, cols) optional paint hook }
export function makeBird(spec) {
  const [bl, bw, bh] = spec.body,
    [nl, nr] = spec.neck,
    hr = spec.head,
    [bil, bid, biw, pouch = 0, hook = 0] = spec.bill;
  const [thigh, tars, lr] = spec.leg,
    [hs, chord, pointed] = spec.wing,
    [tl, tw] = spec.tail;
  const zc = bl * 0.5,
    zHead = zc + nl + hr * 0.6,
    yN = bh * 0.25,
    hipY = -bh * 0.55,
    hipZ = -bl * 0.12,
    footY = hipY - thigh - tars;
  const oy = -footY + 0.004; // lift so the feet stand on y = 0

  function paint(Tx, v) {
    const c = { ...spec.cols, ...(v.cols || {}) },
      s = new Tx.Skin(512, { base: c.back, rough: 0.82, seed: 2 + (v.skin || 0) });
    const B = REG.BODY,
      hu = (hr * 2) / (bl + nl + hr * 2 + tl * 0.3); // rough share of the head along the loft
    s.gradient(B, 'v', [
      [0, c.back],
      [0.45, c.back],
      [0.62, c.belly],
      [1, c.belly],
    ]);
    s.gradient([B[0], B[1], 0.34, B[3]], 'h', [
      [0, c.head],
      [(hu / 0.34) * 0.9, c.head],
      [Math.min(0.99, (hu / 0.34) * 1.25), c.neck],
      [0.8, c.neck],
      [1, c.neck, 0],
    ]);
    s.noise(B, { cells: 9, amount: 0.22 });
    spec.extra?.(s, Tx, REG, v, c, 'body');
    s.feathers([0.3, 0, 1, 0.44], { cols: 34, rows: 15, bump: 0.5, tint: 0.14, shaft: 0.18 });
    s.feathers([0, 0, 0.3, 0.44], {
      cols: 30,
      rows: 16,
      bump: 0.3,
      tint: 0.08,
      shaft: 0.05,
      lengthK: 1.3,
    });
    // wing: three rows of coverts at the leading edge, then long flight feathers to a cut-out trailing edge
    const W = REG.WING;
    s.clear([0, W[1] - 0.01, 1, W[3] + 0.01]);
    s.paint(
      W,
      (x, X, Y, Wd, H, k) => {
        const N = 30,
          R2 = Tx.rng(9);
        for (let i = N - 1; i >= 0; i--) {
          // flight feathers, tip to root so inner ones overlap
          const u = (i + 0.5) / N,
            fw = (Wd / N) * 1.25,
            prim = u > 0.55,
            len = H * (0.62 + (prim ? 0.08 : 0)),
            x0 = X + u * Wd,
            y0 = Y + H * 0.36,
            slant = prim ? fw * (u - 0.55) * 5 : 0;
          x.beginPath();
          x.moveTo(x0 - fw / 2, y0);
          x.lineTo(x0 - fw * 0.45 + slant, y0 + len * 0.86);
          x.quadraticCurveTo(x0 + slant, y0 + len * 1.03, x0 + fw * 0.45 + slant, y0 + len * 0.86);
          x.lineTo(x0 + fw / 2, y0);
          x.closePath();
          if (k === 'a') {
            const g = x.createLinearGradient(0, y0, 0, y0 + len);
            const fc = prim && c.primary ? c.primary : c.flight;
            g.addColorStop(0, Tx.css(Tx.shade(fc, 0.95 + R2() * 0.1)));
            g.addColorStop(0.75, Tx.css(fc));
            g.addColorStop(1, Tx.css(c.tip || Tx.shade(fc, 0.7)));
            x.fillStyle = g;
            x.fill();
            x.strokeStyle = 'rgba(0,0,0,0.3)';
            x.lineWidth = 1;
            x.stroke();
            x.strokeStyle = 'rgba(255,255,255,0.22)';
            x.beginPath();
            x.moveTo(x0, y0);
            x.lineTo(x0 + slant, y0 + len * 0.95);
            x.stroke();
          } else {
            x.fillStyle = k === 'h' ? (i & 1 ? '#8a8a8a' : '#767676') : '#c8c8c8';
            x.fill();
          }
        }
      },
      'ahr',
    );
    s.fill([W[0], W[1], W[2], W[1] + (W[3] - W[1]) * 0.4], c.covert, { rough: 0.85 });
    s.gradient([W[0], W[1] + (W[3] - W[1]) * 0.3, W[2], W[1] + (W[3] - W[1]) * 0.42], 'v', [
      [0, c.covert, 1],
      [1, c.covert, 0],
    ]);
    spec.extra?.(s, Tx, REG, v, c, 'wing');
    s.feathers([W[0], W[1], W[2], W[1] + (W[3] - W[1]) * 0.42], {
      cols: 44,
      rows: 5,
      bump: 0.5,
      tint: 0.16,
      shaft: 0.2,
    });
    // tail fan
    const TL = REG.TAIL;
    s.clear([TL[0], TL[1] - 0.005, TL[2] + 0.01, TL[3]]);
    s.paint(
      TL,
      (x, X, Y, Wd, H, k) => {
        for (let i = 0; i < 9; i++) {
          const u = (i + 0.5) / 9,
            fw = (Wd / 9) * 1.2,
            x0 = X + u * Wd;
          x.beginPath();
          x.moveTo(x0 - fw / 2, Y);
          x.lineTo(x0 - fw * 0.45, Y + H * 0.9);
          x.quadraticCurveTo(x0, Y + H * 1.02, x0 + fw * 0.45, Y + H * 0.9);
          x.lineTo(x0 + fw / 2, Y);
          x.closePath();
          x.fillStyle =
            k === 'a'
              ? Tx.css(Tx.shade(c.tail || c.flight, 0.9 + (i & 1) * 0.12))
              : k === 'h'
                ? i & 1
                  ? '#8a8a8a'
                  : '#777'
                : '#c8c8c8';
          x.fill();
          if (k === 'a') {
            x.strokeStyle = 'rgba(0,0,0,0.28)';
            x.stroke();
          }
        }
      },
      'ahr',
    );
    // bill, legs, eye, webs
    s.gradient(REG.BILL, 'h', [
      [0, c.bill],
      [0.8, c.bill],
      [1, c.billTip || c.bill],
    ]).gradient(REG.BILL, 'v', [
      [0, '#fff', 0.12],
      [0.5, '#000', 0],
      [0.56, '#000', 0.5],
      [0.62, '#000', 0],
      [1, '#000', 0.18],
    ]);
    s.fill(REG.BILL, c.bill, { rough: 0.42, alpha: 0 }).noise(REG.BILL, {
      cells: 14,
      amount: 0.25,
    });
    spec.extra?.(s, Tx, REG, v, c, 'bill');
    s.fill(REG.LEG, c.leg, { rough: 0.6 }).scales(REG.LEG, {
      cols: 26,
      rows: 5,
      shape: 'plate',
      edge: 0.4,
      bump: 0.5,
    });
    s.fill(REG.WEB, Tx.shade(c.leg, 0.9), { rough: 0.6 }).wrinkles(REG.WEB, {
      n: 30,
      dir: 'v',
      depth: 0.2,
      alpha: 0.25,
    });
    s.eye(REG.EYE, {
      iris: c.iris || '#3a2a18',
      pupilSize: c.pupil || 0.45,
      sclera: c.eyeRing || '#111',
    });
    return s;
  }

  function build(THREE, tex, v) {
    const zs = bl * 0.28,
      sx = bw * 0.82,
      sy = bh * 0.45;
    const bones = [
      ['hip', null, [0, hipY, hipZ]],
      ['body', 'hip', [0, hipY, hipZ]],
      ['neck1', 'body', [0, yN, zc * 0.9]],
      ['neck2', 'neck1', [0, yN, zc + nl * 0.5]],
      ['head', 'neck2', [0, yN, zc + nl]],
      ['jaw', 'head', [0, yN - bid * 0.2, zHead + hr * 0.5]],
      ['tail', 'body', [0, bh * 0.1, -zc * 0.95]],
    ];
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      bones.push(
        ['w' + n + '1', 'body', [sx * s, sy, zs]],
        ['w' + n + '2', 'w' + n + '1', [(sx + hs * 0.24) * s, sy, zs]],
        ['w' + n + '3', 'w' + n + '2', [(sx + hs * 0.54) * s, sy, zs]],
        ['l' + n + '1', 'hip', [bw * 0.5 * s, hipY, hipZ]],
        ['l' + n + '2', 'l' + n + '1', [bw * 0.5 * s, hipY - thigh, hipZ]],
        ['l' + n + '3', 'l' + n + '2', [bw * 0.5 * s, footY, hipZ]],
      );
    }
    const rig = R.makeRig(THREE, bones),
      parts = [];
    const ztail = -zc - tl * 0.25;
    const body = L.loft(
      THREE,
      [
        { p: [0, yN, zHead + hr * 0.95], w: biw * 0.5, h: bid * 0.5, u: 0 },
        { p: [0, yN + hr * 0.12, zHead + hr * 0.3], w: hr * 0.92, h: hr, u: 0.07 },
        { p: [0, yN + hr * 0.1, zHead - hr * 0.5], w: hr, h: hr, u: 0.14 },
        { p: [0, yN, zc + nl * 0.75], w: nr, h: nr, u: 0.2 },
        { p: [0, yN, zc + nl * 0.3], w: nr * 1.15, h: nr * 1.2, u: 0.27 },
        { p: [0, yN * 0.5, zc * 0.85], w: bw * 0.66, h: [bh * 0.72, bh * 0.8], u: 0.34 },
        { p: [0, 0, zc * 0.3], w: bw, h: [bh, bh], n: 2.2, u: 0.5 },
        { p: [0, 0, -zc * 0.35], w: bw * 0.92, h: [bh * 0.92, bh * 0.85], u: 0.68 },
        { p: [0, bh * 0.08, -zc * 0.9], w: bw * 0.5, h: [bh * 0.5, bh * 0.45], u: 0.86 },
        { p: [0, bh * 0.1, ztail], w: bw * 0.16, h: bh * 0.12, u: 1 },
      ],
      { around: 14, subdiv: 3, uv: REG.BODY, capEnd: true },
    );
    R.bindSpine(THREE, body, rig, ['head', 'neck2', 'neck1', 'body', 'tail'], { blend: 0.6 });
    parts.push(body);
    // bill: upper mandible rigid to the head, lower mandible (with the pouch) on the jaw
    const zb = zHead + hr * 0.75,
      up = L.loft(
        THREE,
        [
          {
            p: [0, yN + bid * 0.1, zb - hr * 0.3],
            w: biw * 0.55,
            h: [bid * 0.5, bid * 0.12],
            u: 0,
          },
          {
            p: [0, yN + bid * 0.05, zb + bil * 0.5],
            w: biw * 0.42,
            h: [bid * 0.3, bid * 0.08],
            u: 0.5,
          },
          {
            p: [0, yN - bid * 0.05, zb + bil * 0.93],
            w: biw * 0.3,
            h: [bid * 0.18, bid * 0.1 + hook * bid * 0.5],
            u: 0.93,
          },
          { p: [0, yN - bid * 0.2 - hook * bid * 0.6, zb + bil], w: 0, h: 0, u: 1 },
        ],
        {
          around: 8,
          subdiv: 2,
          uv: [REG.BILL[0], REG.BILL[1], REG.BILL[2], (REG.BILL[1] + REG.BILL[3]) / 2],
        },
      );
    const lo = L.loft(
      THREE,
      [
        {
          p: [0, yN - bid * 0.12, zb - hr * 0.3],
          w: biw * 0.5,
          h: [bid * 0.1, bid * 0.3 + pouch * bid * 0.9],
          u: 0,
        },
        {
          p: [0, yN - bid * 0.12, zb + bil * 0.4],
          w: biw * (0.4 + pouch * 0.25),
          h: [bid * 0.06, bid * 0.22 + pouch * bid * 1.5],
          u: 0.45,
        },
        {
          p: [0, yN - bid * 0.12, zb + bil * 0.85],
          w: biw * 0.28,
          h: [bid * 0.05, bid * 0.14 + pouch * bid * 0.3],
          u: 0.88,
        },
        { p: [0, yN - bid * 0.14, zb + bil * 0.97], w: 0, h: 0, u: 1 },
      ],
      {
        around: 8,
        subdiv: 2,
        uv: [REG.BILL[0], (REG.BILL[1] + REG.BILL[3]) / 2, REG.BILL[2], REG.BILL[3]],
      },
    );
    parts.push(R.bindRigid(THREE, up, rig, 'head'), R.bindRigid(THREE, lo, rig, 'jaw'));
    for (const s of [1, -1]) {
      const e = L.surfacePoint(body, 0.085, 1.15, s),
        r = hr * 0.2;
      parts.push(
        R.bindRigid(
          THREE,
          L.ball(
            THREE,
            r,
            [e.p[0] - e.n[0] * r * 0.5, e.p[1] - e.n[1] * r * 0.5, e.p[2] - e.n[2] * r * 0.5],
            REG.EYE,
            { seg: 8, face: s > 0 ? 'x+' : 'x-' },
          ),
          rig,
          'head',
        ),
      );
    }
    // wings
    const wing = L.sheet(
      THREE,
      (u, vv) => {
        const k = Math.max(0, (u - 0.58) / 0.42),
          le =
            zs +
            chord * 0.32 +
            chord * 0.16 * Math.sin((Math.min(1, u / 0.55) * Math.PI) / 2) -
            pointed * chord * 0.75 * Math.pow(k, 1.4) -
            (1 - pointed) * chord * 0.25 * k * k;
        const c =
          chord *
          (1 - 0.18 * u) *
          (1 - pointed * 0.72 * Math.pow(k, 1.2)) *
          (u < 0.06 ? 0.75 + u * 4.2 : 1);
        return [
          sx * 0.7 + u * hs,
          sy + Math.sin(vv * Math.PI) * chord * 0.05 - vv * chord * 0.03,
          le - vv * c,
        ];
      },
      14,
      4,
      REG.WING,
    );
    const tail = L.sheet(
      THREE,
      (u, vv) => {
        const a = (u - 0.5) * 0.9;
        return [
          Math.sin(a) * (tw * 0.35 + vv * tw * 0.75),
          bh * 0.12 - vv * tl * 0.06 - Math.abs(u - 0.5) * tl * 0.06,
          -zc * 0.82 - vv * tl * Math.cos(a) * (spec.fork ? 0.75 + Math.abs(u - 0.5) * 0.9 : 1),
        ];
      },
      8,
      2,
      REG.TAIL,
    );
    parts.push(R.bindRigid(THREE, tail, rig, 'tail'));
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R',
        wg = s > 0 ? wing : L.mirrorX(THREE, wing);
      parts.push(
        R.bindChain(THREE, wg, rig, ['w' + n + '1', 'w' + n + '2', 'w' + n + '3'], {
          by: 'pos',
          blend: 0.18,
          parent: 'body',
          parentBlend: 0.06,
          tail: [(sx + hs) * s, sy, zs],
        }),
      );
      // legs + feet
      const hx = bw * 0.5 * s,
        leg = L.tube(
          THREE,
          [
            [hx, hipY + bh * 0.3, hipZ],
            [hx, hipY - thigh * 0.5, hipZ],
            [hx, hipY - thigh, hipZ],
            [hx, footY + tars * 0.5, hipZ],
            [hx, footY, hipZ],
          ],
          [lr * 2.4, lr * 1.8, lr * 1.05, lr * 0.9, lr],
          { around: 6, subdiv: 1, uv: REG.LEG },
        );
      parts.push(
        R.bindChain(THREE, leg, rig, ['l' + n + '1', 'l' + n + '2', 'l' + n + '3'], {
          by: 'pos',
          blend: 0.2,
          tail: [hx, footY - 0.02, hipZ],
        }),
      );
      const tips = [];
      for (const a of [-0.5, 0, 0.5]) {
        const tx = hx + Math.sin(a) * spec.toe,
          tz = hipZ + Math.cos(a) * spec.toe;
        tips.push([tx, tz]);
        parts.push(
          R.bindRigid(
            THREE,
            L.tube(
              THREE,
              [
                [hx, footY, hipZ],
                [
                  hx + Math.sin(a) * spec.toe * 0.5,
                  footY + lr * 0.5,
                  hipZ + Math.cos(a) * spec.toe * 0.5,
                ],
                [tx, footY - 0.002, tz],
              ],
              [lr * 0.9, lr * 0.7, lr * 0.35],
              { around: 4, subdiv: 1, uv: REG.LEG },
            ),
            rig,
            'l' + n + '3',
          ),
        );
      }
      parts.push(
        R.bindRigid(
          THREE,
          L.tube(
            THREE,
            [
              [hx, footY, hipZ],
              [hx, footY, hipZ - spec.toe * 0.35],
            ],
            [lr * 0.8, lr * 0.3],
            { around: 4, subdiv: 1, uv: REG.LEG },
          ),
          rig,
          'l' + n + '3',
        ),
      );
      if (spec.webbed)
        parts.push(
          R.bindRigid(
            THREE,
            L.flat(
              THREE,
              [
                [hx, hipZ],
                [tips[0][0], tips[0][1]],
                [tips[1][0], tips[1][1] - spec.toe * 0.08],
                [tips[2][0], tips[2][1]],
              ].map((p) => [p[0], p[1]]),
              REG.WEB,
              { plane: 'xz', offset: footY + 0.001 },
            ),
            rig,
            'l' + n + '3',
          ),
        );
    }
    const geo = L.merge(THREE, parts);
    geo.translate(0, oy, 0);
    const mat = M.skinMaterial(THREE, tex, { alphaTest: 0.5, doubleSide: true, normalScale: 0.8 });
    if (v.tint) mat.color.setRGB(...v.tint);
    for (const b of rig.root.children) b.position.y += oy;
    const rest = rig.root.children.map((b) => b.position.clone());
    const mesh = R.skinMesh(THREE, geo, mat, rig, { cullPad: 2.2 }),
      group = new THREE.Group();
    group.add(mesh);
    group.scale.setScalar(v.scale ?? 1);
    // ---- animation: params blend between ground (g = 1) and air (g = 0), wings fold with `fold`
    const A = {
      g: 1,
      fold: 1,
      phase: (v.seed || 0) * 7,
      walk: 0,
      t: (v.seed || 0) * 13,
      look: 0,
      lookT: 0,
      peck: 0,
      dive: 0,
      float: 0,
      glide: 0,
      bank: 0,
      call: 0,
    };
    const S = spec.stand ?? 0.6,
      NS = spec.neckS ?? 0.5,
      hz = spec.flapHz || 3;
    const c = {
      group,
      rig,
      mesh,
      radius: hs,
      states: ['stand', 'walk', 'peck', 'fly', 'glide', 'dive', 'float', 'call'],
      wingspan: hs * 2,
      update(dt, a = {}) {
        const st = a.state || 'stand',
          air = st === 'fly' || st === 'glide' || st === 'dive';
        A.t += dt;
        A.g = R.damp(A.g, air ? 0 : 1, 6, dt);
        A.fold = R.damp(A.fold, air ? 0 : 1, air ? 9 : 5, dt);
        A.glide = R.damp(A.glide, st === 'glide' ? 1 : 0, 4, dt);
        A.dive = R.damp(A.dive, st === 'dive' ? 1 : 0, 7, dt);
        A.float = R.damp(A.float, st === 'float' ? 1 : 0, 5, dt);
        A.walk = R.damp(A.walk, st === 'walk' ? 1 : 0, 8, dt);
        A.peck = R.damp(A.peck, st === 'peck' ? 0.5 + 0.5 * Math.sin(A.t * 7) : 0, 10, dt);
        A.bank = R.damp(A.bank, a.bank || 0, 5, dt);
        A.call = R.damp(A.call, st === 'call' ? 1 : 0, 8, dt);
        A.lookT -= dt;
        if (A.lookT < 0) {
          A.lookT = 0.6 + ((A.t * 7.3) % 1) * 2.2;
          A.lookTarget = (((A.t * 3.7) % 1) - 0.5) * 1.6;
        }
        A.look = R.damp(A.look, (A.lookTarget || 0) * A.g, 14, dt); // saccades
        const sp = a.speed ?? 0.5;
        if (st === 'walk') A.phase += ((dt * sp) / (thigh + tars)) * 1.1;
        A.wing = (A.wing || 0) + dt * hz * 6.2832 * (a.flapRate || 1);
        rig.reset();
        const rc = rig.root.children;
        for (let i = 0; i < rc.length; i++) rc[i].position.copy(rest[i]);
        const g = A.g,
          w = A.phase * 6.2832,
          flo = A.float;
        // sit down onto the water when floating; bob when walking
        rig.move(
          'hip',
          0,
          oy - flo * (thigh + tars) * 0.92 + Math.abs(Math.sin(w)) * 0.006 * A.walk,
          0,
        );
        rig.move('body', 0, oy - flo * (thigh + tars) * 0.92, 0);
        const pitch = -S * g * (1 - flo * 0.75) + A.peck * 0.9 * g;
        rig.set('body', pitch, 0, 0);
        const fl = 1 - g,
          ns = NS * (g + fl * (spec.neckFly ?? 0.2));
        rig
          .set('neck1', -ns * 1.1 - pitch * 0.3 + A.peck * 0.5, A.look * 0.3, 0)
          .set('neck2', ns * 0.5 + A.peck * 0.4, A.look * 0.3, 0)
          .set(
            'head',
            ns * 0.6 -
              pitch * 0.7 +
              (spec.billDown || 0) * g -
              A.call * 0.5 +
              Math.sin(w * 2) * 0.05 * A.walk,
            A.look * 0.4,
            0,
          );
        rig.set('jaw', A.call * 0.45 * (0.6 + 0.4 * Math.sin(A.t * 30)), 0, 0);
        rig.set('tail', 0.15 * g - A.dive * 0.1, 0, 0);
        const beat = Math.sin(A.wing),
          flap = (1 - A.glide) * (1 - A.dive) * fl;
        for (const s of [1, -1]) {
          const n = s > 0 ? 'L' : 'R',
            F = A.fold,
            dv = A.dive * (1 - F),
            up = Math.max(0, -Math.cos(A.wing)) * flap;
          rig.set(
            'w' + n + '1',
            -1.15 * F - 0.1 * dv,
            s * (1.3 * F + 0.75 * dv),
            s *
              ((beat * 0.75 + 0.1) * flap +
                (spec.dihedral || 0.06) * (1 - F) * (1 - flap) -
                0.25 * F),
          );
          rig.set(
            'w' + n + '2',
            0,
            s * (-2.55 * F - 1.2 * dv - up * 0.45),
            s * (Math.sin(A.wing - 0.5) * 0.25 * flap),
          );
          rig.set(
            'w' + n + '3',
            0,
            s * (2.6 * F + 1.5 * dv + up * 0.6),
            s * (Math.sin(A.wing - 1.0) * 0.3 * flap),
          );
          const sw = Math.sin(w + (s > 0 ? 0 : Math.PI)) * A.walk,
            tuck = fl * (spec.legTrail ? 1.35 : 0.9) + flo * 0.9;
          rig
            .set('l' + n + '1', sw * 0.5 + tuck, 0, 0)
            .set(
              'l' + n + '2',
              Math.max(0, -sw) * 0.5 * A.walk - (spec.legTrail ? 0 : tuck * 0.9) * (1 - flo),
              0,
              0,
            )
            .set('l' + n + '3', -sw * 0.3 + fl * 0.6 - flo * 0.3, 0, 0);
        }
        mesh.rotation.z = -A.bank;
      },
      dispose() {},
    };
    c.update(0, { state: 'stand' });
    return c;
  }
  return { paint, build };
}

// ---- flock behavior ---------------------------------------------------------------------------------------------------
// cfg: { n: [min, max], mode: 'loaf' | 'wire' | 'patrol' | 'soar', speed, alt: [min, max], circle: radius, flush: distance,
//        carFlush, dives: bool, calm: seconds aloft before resettling, callName, wingName, walkSpeed }
const _v = { x: 0, z: 0 };
export function flockActor(THREE, world, site, make, cfg) {
  const root = new THREE.Group(),
    birds = [],
    n = site.count || cfg.n[0] + ((world.rand() * (cfg.n[1] - cfg.n[0] + 1)) | 0);
  const center = new THREE.Vector3(site.x, site.y ?? world.groundY(site.x, site.z), site.z),
    wire = site.wire,
    wantAir =
      cfg.mode === 'patrol' ||
      cfg.mode === 'soar' ||
      site.habitat === 'sky' ||
      (cfg.mode === 'loaf' && world.isWater(site.x, site.z) && !cfg.floats);
  const perchFor = (i) => {
    if (wire) {
      const t = (i + 0.5 + (world.rand() - 0.5) * 0.5) / n;
      return new THREE.Vector3(
        wire.a.x + (wire.b.x - wire.a.x) * t,
        wire.a.y + (wire.b.y - wire.a.y) * t - Math.sin(t * Math.PI) * (wire.sag || 0),
        wire.a.z + (wire.b.z - wire.a.z) * t,
      );
    }
    return null;
  };
  const wireHead = wire ? Math.atan2(wire.b.z - wire.a.z, -(wire.b.x - wire.a.x)) : 0;
  for (let i = 0; i < n; i++) {
    const c = make();
    root.add(c.group);
    const b = {
      c,
      pos: new THREE.Vector3(),
      home: new THREE.Vector3(),
      h: world.rand() * 6.28,
      st: 'ground',
      anim: 'stand',
      t: world.rand() * 6,
      alt: cfg.alt[0] + world.rand() * (cfg.alt[1] - cfg.alt[0]),
      ang: world.rand() * 6.28,
      r: (cfg.circle || 30) * (0.6 + world.rand() * 0.8),
      spd: cfg.speed * (0.9 + world.rand() * 0.2),
      bank: 0,
      vy: 0,
      acc: 0,
      dir: world.rand() < 0.5 ? 1 : -1,
      lag: i * 0.9,
    };
    const p = perchFor(i);
    if (p) {
      b.home.copy(p);
      b.h = wireHead + (world.rand() < 0.5 ? 0 : Math.PI) + (world.rand() - 0.5) * 0.3;
      b.perch = true;
    } else {
      const a = world.rand() * 6.28,
        r = Math.sqrt(world.rand()) * (site.radius || 5);
      b.home.set(site.x + Math.cos(a) * r, 0, site.z + Math.sin(a) * r);
      b.home.y = world.isWater(b.home.x, b.home.z)
        ? world.seaLevel
        : world.groundY(b.home.x, b.home.z);
    }
    b.pos.copy(b.home);
    if (wantAir) {
      b.st = 'air';
      b.pos.y = center.y + b.alt;
      b.pos.x += Math.cos(b.ang) * b.r;
      b.pos.z += Math.sin(b.ang) * b.r;
    } else if (world.isWater(b.home.x, b.home.z) && !b.perch) b.st = 'float';
    birds.push(b);
  }
  let aloft = wantAir ? 1e9 : 0,
    flushed = false;
  const lead = { ang: world.rand() * 6.28 };
  const actor = {
    root,
    pos: center.clone(),
    radius: 20,
    birds,
    flush(from) {
      if (flushed) return;
      flushed = true;
      aloft = cfg.calm || 25;
      let i = 0;
      for (const b of birds)
        if (b.st !== 'air' && b.st !== 'dive') {
          b.st = 'air';
          b.t = -i++ * 0.07;
          b.launch = 1;
        }
      world.sound(cfg.wingName || 'wings_flush', center, {
        volume: Math.min(1, 0.3 + birds.length * 0.08),
      });
      if (cfg.callName) world.sound(cfg.callName, center, { volume: 0.8 });
      world.signal('alarm', center, 3);
    },
    update(dt, world) {
      // threats: flush the whole flock together
      if (!flushed && !wantAir) {
        const pl = world.player,
          dp = Math.hypot(pl.pos.x - center.x, pl.pos.z - center.z) - (site.radius || 4) * 0.5,
          dy = Math.abs(pl.pos.y - center.y);
        if (!pl.inVehicle && dp < cfg.flush * (pl.speed > 4 ? 1.6 : 1) && dy < cfg.flush + 6)
          actor.flush(pl.pos);
        else
          for (const t of world.threats) {
            if (t.kind === 'player') continue;
            const d = Math.hypot(t.pos.x - center.x, t.pos.z - center.z);
            if (
              (t.kind === 'gunshot' && d < 90) ||
              (t.kind === 'dog' && d < cfg.flush * 2) ||
              ((t.kind === 'car' || t.kind === 'boat') &&
                d < (cfg.carFlush || 7) + (site.radius || 0) &&
                Math.hypot(t.vel.x, t.vel.z) > 3 &&
                Math.abs(t.pos.y - center.y) < 5)
            ) {
              actor.flush(t.pos);
              break;
            }
          }
        if (!flushed && world.signalsNear('alarm', center, 25).length && world.rand() < dt * 2)
          actor.flush(center);
      } else if (flushed) {
        aloft -= dt;
        if (aloft < 0) {
          const th = world.threatNear(center, cfg.flush * 1.5);
          if (!th || th.t.kind === 'car') {
            flushed = false;
            for (const b of birds)
              if (b.st === 'air') {
                b.st = 'land';
              }
          } else aloft = 8;
        }
      }
      if (cfg.mode === 'patrol') {
        lead.ang += (dt * cfg.speed) / (cfg.circle || 80);
      }
      const night = world.hour < 5.5 || world.hour > 20.2;
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i],
          p = b.pos;
        b.t += dt;
        let anim = b.anim,
          bank = 0,
          pitch = 0;
        if (b.st === 'ground' || b.st === 'float') {
          anim =
            b.st === 'float'
              ? 'float'
              : b.anim === 'walk' || b.anim === 'peck' || b.anim === 'call'
                ? b.anim
                : 'stand';
          if (b.st === 'float') p.y = world.seaLevel + Math.sin(world.time * 1.3 + i) * 0.03;
          if (b.t > 0 && !b.perch && b.st === 'ground') {
            // loaf: stand, wander a little, peck, call
            const k = world.rand();
            b.t = -(1.5 + world.rand() * 5);
            if (k < 0.3 && !night) {
              b.anim = 'walk';
              const a = world.rand() * 6.28,
                r = 0.5 + world.rand() * 2;
              b.goal = [b.home.x + Math.cos(a) * r, b.home.z + Math.sin(a) * r];
              if (world.isWater(b.goal[0], b.goal[1]) || world.onRoad(b.goal[0], b.goal[1]))
                b.goal = null;
            } else if (k < 0.5 && !night) b.anim = 'peck';
            else if (k < 0.56 && !night) {
              b.anim = 'call';
              if (cfg.callName) world.sound(cfg.callName, p, { volume: 0.5 });
            } else b.anim = 'stand';
            anim = b.anim;
          } else if (b.t > 0) {
            b.t = -(2 + world.rand() * 6);
            b.anim = world.rand() < 0.12 && !night ? 'call' : 'stand';
            if (b.perch && world.rand() < 0.3) b.h += Math.PI;
          }
          if (b.anim === 'walk' && b.goal) {
            const dx = b.goal[0] - p.x,
              dz = b.goal[1] - p.z,
              d = Math.hypot(dx, dz);
            if (d < 0.08) {
              b.anim = 'stand';
              b.goal = null;
            } else {
              const want = Math.atan2(dx, dz);
              let dh = want - b.h;
              dh = Math.atan2(Math.sin(dh), Math.cos(dh));
              b.h += dh * Math.min(1, dt * 6);
              const s = (cfg.walkSpeed || 0.35) * dt;
              p.x += Math.sin(b.h) * s;
              p.z += Math.cos(b.h) * s;
              p.y = world.groundY(p.x, p.z);
            }
          }
          // feeding flights: plunge-divers leave now and then to fish
          if (cfg.dives && !night && !flushed && world.rand() < dt * 0.01) {
            b.st = 'air';
            b.t = 0;
            b.fish = true;
          }
        } else if (b.st === 'air') {
          anim = 'fly';
          if (b.t < 0) {
            anim = 'stand';
          } else {
            let tx,
              tz,
              ty = center.y + b.alt;
            if (cfg.mode === 'patrol' && !flushed) {
              const a = lead.ang - (b.lag * (cfg.gap || 3.5)) / (cfg.circle || 80);
              tx = center.x + Math.cos(a) * (cfg.circle || 80);
              tz = center.z + Math.sin(a) * (cfg.circle || 80) * 0.6;
              ty = center.y + cfg.alt[0] + Math.sin(a * 2 + 1) * (cfg.alt[1] - cfg.alt[0]) * 0.5;
            } else {
              b.ang += ((dt * b.spd) / b.r) * b.dir;
              tx = center.x + Math.cos(b.ang) * b.r;
              tz = center.z + Math.sin(b.ang) * b.r;
            }
            const dx = tx - p.x,
              dz = tz - p.z,
              want = Math.atan2(dx, dz);
            let dh = want - b.h;
            dh = Math.atan2(Math.sin(dh), Math.cos(dh));
            const turn = Math.max(-1.6, Math.min(1.6, dh * 2));
            b.h += turn * dt;
            bank = turn * 0.45;
            const climb = Math.max(-3, Math.min(b.launch ? 5 : 2.5, (ty - p.y) * 0.9));
            p.x += Math.sin(b.h) * b.spd * dt;
            p.z += Math.cos(b.h) * b.spd * dt;
            p.y += climb * dt;
            pitch = -climb * 0.07;
            if (b.launch && p.y > ty - 1) b.launch = 0;
            // glide when level or sinking (pelicans and gulls sail a lot), flap when climbing
            const gl = cfg.glide ?? 0.5;
            anim =
              climb > 0.6 || b.launch
                ? 'fly'
                : Math.sin(world.time * 0.5 + i * 2.1) > 1 - gl * 2
                  ? 'glide'
                  : 'fly';
            if (
              cfg.dives &&
              (b.fish || cfg.mode === 'patrol') &&
              !flushed &&
              !night &&
              world.rand() < dt * (b.fish ? 0.25 : 0.035) &&
              world.waterDepth(p.x, p.z) > 1.2 &&
              p.y - world.seaLevel > 4
            ) {
              b.st = 'dive';
              b.vy = -2;
            }
          }
        } else if (b.st === 'dive') {
          // plunge: fold, drop, splash, sit and swallow, then take off again
          anim = 'dive';
          b.vy -= 14 * dt;
          p.y += b.vy * dt;
          p.x += Math.sin(b.h) * 3 * dt;
          p.z += Math.cos(b.h) * 3 * dt;
          pitch = Math.min(1.25, -b.vy * 0.12);
          if (p.y <= world.seaLevel) {
            p.y = world.seaLevel;
            world.fx.splash(p, 1.4);
            world.sound('splash_plunge', p, { volume: 0.9 });
            world.signal('baitball', p, 6);
            b.st = 'sit';
            b.t = 0;
          }
        } else if (b.st === 'sit') {
          anim = b.t < 1.2 ? 'float' : b.t < 2.4 ? 'call' : 'float';
          p.y = world.seaLevel + Math.sin(world.time * 1.3 + i) * 0.03;
          if (b.t > 5 + (i % 4)) {
            b.st = b.fish ? 'land' : 'air';
            b.t = 0;
            b.launch = 1;
            b.fish = false;
          }
        } else if (b.st === 'land') {
          // glide back to the home spot and settle
          const dx = b.home.x - p.x,
            dz = b.home.z - p.z,
            d = Math.hypot(dx, dz),
            want = Math.atan2(dx, dz);
          let dh = want - b.h;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          const turn = Math.max(-2.2, Math.min(2.2, dh * 3));
          b.h += turn * dt;
          bank = turn * 0.4;
          const s = Math.min(b.spd, 2 + d * 0.9);
          p.x += Math.sin(b.h) * s * dt;
          p.z += Math.cos(b.h) * s * dt;
          const ty = b.home.y + Math.min(b.alt, d * 0.35);
          p.y += (ty - p.y) * Math.min(1, dt * 2.5);
          anim = d < 6 ? 'fly' : 'glide';
          pitch = d < 4 ? -0.35 : 0;
          if (d < 0.35) {
            p.copy(b.home);
            b.st = world.isWater(p.x, p.z) && !b.perch ? 'float' : 'ground';
            b.anim = 'stand';
            b.t = -2;
            if (b.perch) b.h = wireHead + (world.rand() < 0.5 ? 0 : Math.PI);
          }
        }
        b.bank += (bank - b.bank) * Math.min(1, dt * 4);
        b.anim = anim;
        const g = b.c.group;
        g.position.copy(p);
        g.rotation.set(pitch, b.h, 0, 'YXZ');
        const dc = world.cam.distanceTo(p),
          every = dc < 40 ? 1 : dc < 110 ? 2 : 4;
        b.acc += dt;
        if ((world.frame + i) % every === 0) {
          b.c.update(b.acc, { state: anim, bank: b.bank, speed: cfg.walkSpeed || 0.35 });
          b.acc = 0;
        }
      }
      if (birds[0]) actor.pos.set(center.x, center.y, center.z);
    },
    dispose() {
      for (const b of birds) b.c.dispose();
    },
  };
  return actor;
}

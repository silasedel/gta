// Exterior details placed on the finished skin (via its height maps): lamp internals, DRL signatures, badges and wordmarks,
// license plate, wipers, mirrors, exhaust tips, diffuser fins, lip spoiler, door handles, side markers; plus the cabin seen through the glass.
import * as THREE from 'three';
import {
  Bucket,
  sweep,
  sect,
  lathe,
  cyl,
  rbox,
  tube,
  flip,
  mirrorX,
  plate,
  poly,
  uvBox,
} from './kit/geo.js';
import { emblemTex, wordTex, decalMat, plateTex } from './kit/emblems.js';

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function makeLights(M) {
  return {
    head: M.glow(0xfff3dc, 0.5, 0xd8dde2),
    drl: M.glow(0xeaf3ff, 3, 0xffffff),
    lens: M.glow(0xfff6e8, 0, 0xcfd8e0),
    fog: M.glow(0xfff3d6, 0, 0xcccccc),
    tail: M.glow(0xff1206, 1.2, 0x2a0000),
    brake: M.glow(0xff0600, 0.3, 0x400404),
    reverse: M.glow(0xffffff, 0, 0xbbbbbb),
    blinkL: M.glow(0xff9000, 0, 0x6a3c00),
    blinkR: M.glow(0xff9000, 0, 0x6a3c00),
    amber: M.glow(0xff8a00, 0.4, 0x7a4200),
    interior: M.glow(0xff3020, 0.6, 0x101010),
  };
}

/** Returns a Group with every exterior detail of the car (both sides).  d = def.p.det, hm = height maps of the lod-0 skin. */
export function buildDetails(def, pk, hm, M, mats, lights, seed = 1) {
  const d = def.p.det,
    g = new THREE.Group();
  g.name = 'details';
  const b = new Bucket(); // static trim by material key (already both sides)
  const L = {}; // light geometry buckets by light key
  const lit = (k, geo, t, both = true) => {
    const bk = (L[k] ||= new Bucket());
    bk.add('g', geo, t, both);
  };
  const add = (k, geo, t, both = true) => b.add(k, geo, t, both);
  // ---- headlamps: projector modules + a blade DRL under the clear lens
  if (d.head) {
    const { a, b: e, n } = d.head;
    for (let i = 0; i < n; i++) {
      const [x, z] = lerp2(a, e, (i + 0.5) / n),
        y = hm.top(x, z) - 0.034;
      add('housing2', cyl(0.031, 0.036, 0.06, 20, 'z'), { p: [x, y, z - 0.012], r: [-0.3, 0, 0] });
      add(
        'chrome',
        lathe(
          [
            [0.022, 0],
            [0.03, 0.006],
            [0.033, 0.0],
            [0.031, -0.01],
          ],
          20,
          'z',
          30,
        ),
        { p: [x, y + 0.006, z + 0.018], r: [-0.3, 0, 0] },
      );
      lit(
        'lens',
        new THREE.SphereGeometry(0.0225, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(
          Math.PI / 2,
        ),
        { p: [x, y + 0.005, z + 0.012], r: [-0.3, 0, 0] },
      );
      lit('head', new THREE.CircleGeometry(0.012, 12), {
        p: [x, y + 0.006, z + 0.0355],
        r: [-0.3, 0, 0],
      });
    }
    for (const line of d.head.drl || []) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10,
          k = Math.min(line.length - 2, Math.floor(t * (line.length - 1))),
          f = t * (line.length - 1) - k;
        const [x, z] = lerp2(line[k], line[k + 1], f);
        const y = hm.top(x, z);
        if (y === y) pts.push({ p: [x, y - 0.016, z] });
      }
      if (pts.length < 2) continue;
      lit('drl', sweep(pts, sect.rrect(0.012, 0.007, 0.003, 2), { up: [0, 1, 0], caps: true }));
    }
    if (d.head.blink) {
      const [x, z] = d.head.blink;
      for (const [k, sgn] of [
        ['blinkL', 1],
        ['blinkR', -1],
      ])
        lit(
          k,
          rbox(0.07, 0.008, 0.014, 0.003),
          { p: [sgn * x, hm.top(x, z) - 0.02, z], r: [0, sgn * -0.6, 0] },
          false,
        );
    }
  }
  // ---- tail lamps: light bar + LED cells + brake strip + indicators + reverse lamp behind the red lens
  if (d.tail) {
    const { x0, x1, y0, y1 } = d.tail,
      ym = (y0 + y1) / 2,
      zAt = (x, y) => hm.rear(x, y) + 0.024;
    const bar = [];
    for (let i = 0; i <= 12; i++) {
      const x = x0 + (x1 - x0) * (i / 12),
        y = ym + (i / 12) * (d.tail.rise || 0.012);
      bar.push({ p: [x, y + 0.006, zAt(x, y)] });
    }
    lit('tail', sweep(bar, sect.rrect(0.006, 0.008, 0.002, 2), { up: [0, 1, 0], caps: true }));
    const nCell = d.tail.cells || 9;
    for (let i = 0; i < nCell; i++) {
      const x = x0 + 0.03 + (x1 - x0 - 0.13) * (i / (nCell - 1)),
        y = ym - 0.008 + (i / nCell) * (d.tail.rise || 0.012);
      lit('brake', plate(poly(6, 0.011, 0), 0.006, 0), {
        p: [x, y, zAt(x, y) + 0.008],
        r: [0, Math.PI, 0],
      });
    }
    for (const [k, sgn] of [
      ['blinkL', 1],
      ['blinkR', -1],
    ])
      lit(
        k,
        rbox(0.05, 0.016, 0.01, 0.003),
        { p: [sgn * (x1 - 0.03), ym - 0.006 + (d.tail.rise || 0.012), zAt(x1 - 0.03, ym) + 0.004] },
        false,
      );
    lit('reverse', rbox(0.05, 0.012, 0.008, 0.003), {
      p: [x0 + 0.005, ym - 0.008, zAt(x0, ym) + 0.004],
    });
  }
  // ---- side markers
  if (d.marker) {
    const [z, y] = d.marker;
    lit('amber', rbox(0.006, 0.014, 0.09, 0.003), { p: [hm.side(z, y) + 0.0015, y, z] });
  }
  // ---- exhaust tips: double-wall, burnt titanium, dark bore
  for (const e of d.exhaust || []) {
    const z = hm.rear(e.x, e.y) + (e.in ?? 0.02),
      r = e.r || 0.045;
    add(
      'exhaust',
      lathe(
        [
          [r * 0.86, 0.11],
          [r * 0.86, 0],
          [r, -0.012],
          [r, 0.11],
        ],
        28,
        'z',
        40,
      ),
      { p: [e.x, e.y, z] },
    );
    add(
      'shadowD',
      flip(
        lathe(
          [
            [r * 0.8, 0.11],
            [r * 0.8, -0.004],
          ],
          20,
          'z',
          0,
        ),
      ),
      { p: [e.x, e.y, z] },
    );
    add('shadowD', new THREE.CircleGeometry(r * 0.8, 20).rotateY(Math.PI), {
      p: [e.x, e.y, z + 0.1],
    });
  }
  // ---- diffuser fins + lip spoiler + splitter blade
  for (const f of d.fins || [])
    add('carbon', rbox(0.012, f.h || 0.13, f.l || 0.42, 0.004), {
      p: [f.x, f.y, f.z],
      r: [f.tilt ?? -0.28, 0, 0],
    });
  if (d.lip) {
    const pts = d.lip.x.map((x, i) => ({
      p: [x, hm.top(Math.abs(x), d.lip.z[i]) + (d.lip.up ?? 0.012), d.lip.z[i]],
      s: i === 0 || i === d.lip.x.length - 1 ? 0.55 : 1,
    }));
    b.add(
      d.lip.mat || 'carbon',
      sweep(pts, sect.airfoil(d.lip.chord || 0.14, 0.02, 14), {
        up: [0, 1, 0],
        smoothPath: 24,
        caps: true,
      }).rotateX(0),
    );
  }
  // ---- mirrors: teardrop housing on a blade stalk, mirror glass
  if (d.mirror) {
    const { z, y } = d.mirror,
      x0 = hm.side(z, y - 0.03) - 0.01,
      x1 = x0 + (d.mirror.out || 0.17);
    add(
      'carbon',
      sweep(
        [
          { p: [x0, y - 0.035, z], s: 1.3 },
          { p: [x0 + 0.07, y - 0.012, z + 0.005], s: 0.8 },
          { p: [x1 - 0.06, y, z], s: 0.9 },
        ],
        sect.airfoil(0.07, 0.018, 12),
        { up: [0, 1, 0], smoothPath: 8, caps: true },
      ),
    );
    const hs = [
      { p: [x1, y + 0.02, z + 0.085], s: 0.12 },
      { p: [x1, y + 0.02, z + 0.05], s: 0.7 },
      { p: [x1, y + 0.02, z], s: 1 },
      { p: [x1, y + 0.02, z - 0.05], s: 0.96 },
      { p: [x1, y + 0.02, z - 0.062], s: 0.9 },
    ];
    add(
      'paintD',
      sweep(hs, sect.superellipse(0.105, 0.06, 2.8, 20), {
        up: [0, 1, 0],
        smoothPath: 12,
        caps: 'start',
      }),
    );
    add(
      'mirror',
      uvBox(
        new THREE.ShapeGeometry(
          new THREE.Shape(
            sect.superellipse(0.09, 0.05, 2.8, 20).map((p) => new THREE.Vector2(p[0], p[1])),
          ),
        ).rotateY(Math.PI),
      ),
      { p: [x1, y + 0.02, z - 0.058] },
    );
  }
  // ---- wipers (parked on the cowl)
  if (d.wiper)
    for (const w of d.wiper) {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const [x, z] = lerp2(w[0], w[1], i / 6);
        pts.push([x, hm.top(Math.abs(x), z) + 0.016, z]);
      }
      b.add('rubberD', tube(pts, 0.005, 6));
      b.add(
        'rubberD',
        tube(
          pts.map((p) => [p[0], p[1] - 0.008, p[2] - 0.004]),
          0.0035,
          5,
        ),
      );
      b.add('rubberD', cyl(0.014, 0.014, 0.02, 10, 'y'), { p: pts[0] });
    }
  // ---- door handles (flush pull with a dark recess) and fuel flap seam
  if (d.handle) {
    const [z, y] = d.handle,
      x = hm.side(z, y);
    add('shadowD', rbox(0.004, 0.022, 0.13, 0.002), { p: [x + 0.0005, y, z] });
    add('paintD', rbox(0.007, 0.012, 0.11, 0.003), { p: [x + 0.002, y + 0.004, z] });
  }
  const out = b.merged();
  const mm = {
    housing2: M.metal('gun'),
    chrome: M.metal('chrome'),
    exhaust: M.metal('burnt'),
    shadowD: M.shadow(),
    carbon: M.carbon(),
    paintD: mats.paint,
    mirror: M.mirror(),
    rubberD: M.rubber(),
  };
  for (const k in out) {
    const m = new THREE.Mesh(out[k], mm[k] || mats.trim);
    m.castShadow = true;
    m.name = 'detail:' + k;
    g.add(m);
  }
  for (const k in L) {
    const m = new THREE.Mesh(L[k].merged().g, lights[k]);
    m.name = 'light:' + k;
    g.add(m);
  }
  // ---- badges, wordmarks, plate (decals just above the skin)
  const decal = (tex, w, h, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMat(tex));
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.renderOrder = 3;
    g.add(m);
    return m;
  };
  if (d.badgeF) {
    const [z, s] = d.badgeF,
      y = hm.top(0, z),
      n = hm.top.n(0, z);
    decal(
      emblemTex(pk.brand),
      s,
      s,
      [0, y + 0.002, z],
      [-Math.PI / 2 + Math.atan2(n[2], n[1]), 0, 0],
    );
  }
  if (d.badgeR) {
    const [y, s] = d.badgeR;
    decal(emblemTex(pk.brand), s, s, [0, y, hm.rear(0, y) - 0.003], [0, Math.PI, 0]);
  }
  if (d.wordR) {
    const [y, h, x = 0] = d.wordR,
      wt = wordTex(pk.badge);
    decal(wt.tex, h * wt.aspect, h, [x, y, hm.rear(Math.abs(x), y) - 0.003], [0, Math.PI, 0]);
  }
  if (d.wordSide) {
    const [z, y, h] = d.wordSide,
      wt = wordTex(pk.brand.toUpperCase(), null, '700 80px Arial, sans-serif', 16);
    for (const s of [1, -1])
      decal(
        wt.tex,
        h * wt.aspect,
        h,
        [s * (hm.side(z, y) + 0.002), y, z],
        [0, (s * Math.PI) / 2, 0],
      );
  }
  if (d.plateR) {
    const [y, zOff = 0] = d.plateR,
      pt = plateTex(seed),
      z = hm.rear(0, y) - 0.012 + zOff;
    const pm = new THREE.Mesh(
      rbox(0.31, 0.16, 0.006, 0.002),
      new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.6 }),
    );
    pm.position.set(0, y, z + 0.004);
    g.add(pm);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.15),
      new THREE.MeshStandardMaterial({ map: pt.tex, roughness: 0.4, metalness: 0.2 }),
    );
    face.position.set(0, y, z);
    face.rotation.y = Math.PI;
    g.add(face);
    g.userData.plate = pt.code;
  }
  return g;
}

/** The cabin as seen through the glass: sculpted seats, dash with binnacle and screen, steering wheel, console, sills, bulkhead. */
export function buildCabin(pk, M) {
  const c = pk.cabin,
    b = new Bucket(),
    g = new THREE.Group();
  g.name = 'cabin';
  const lea = 'lea',
    alc = 'alc';
  // floor tub, sills, tunnel, bulkhead, dash
  b.add('carpet', rbox(c.sillX * 2, 0.02, 1.7, 0.005), { p: [0, c.floorY - 0.01, 0.2] });
  b.add(
    'carbonI',
    rbox(c.doorInnerX - c.sillX + 0.06, c.sillTopY - c.floorY, 1.3, 0.03),
    { p: [(c.doorInnerX + c.sillX) / 2, (c.sillTopY + c.floorY) / 2, 0.1] },
    true,
  );
  b.add(alc, rbox(c.tunnelHalfW * 2, c.tunnelTopY - c.floorY, 1.25, 0.04), {
    p: [0, (c.tunnelTopY + c.floorY) / 2, 0.05],
  });
  b.add('piano', rbox(c.tunnelHalfW * 1.5, 0.012, 0.42, 0.005), {
    p: [0, c.tunnelTopY + 0.004, 0.16],
  });
  b.add('aluI', cyl(0.028, 0.03, 0.018, 20, 'y'), { p: [0, c.tunnelTopY + 0.018, 0.02] });
  const bz = c.bulkheadZ || [c.rearSeatBackZ, c.rearSeatBackZ - 0.1],
    by = c.bulkheadY || [c.floorY, c.roofInnerY - 0.1];
  b.add(alc, rbox(c.doorInnerX * 2, by[1] - c.floorY, 0.06, 0.02), {
    p: [0, (by[1] + c.floorY) / 2, (bz[0] + bz[1]) / 2 - 0.12],
    r: [-0.12, 0, 0],
  });
  const dz = (c.cowlZ + c.dashFaceZ) / 2 + 0.06;
  b.add(
    alc,
    sweep(
      [
        [-c.doorInnerX, c.dashTopY - 0.07, dz],
        [0, c.dashTopY - 0.06, dz + 0.03],
        [c.doorInnerX, c.dashTopY - 0.07, dz],
      ].map((p) => ({ p })),
      sect.superellipse(0.2, 0.085, 3, 16).map(([a, e]) => [e, a]),
      { up: [0, 0, 1], smoothPath: 9, caps: true },
    ),
  );
  b.add(lea, rbox(c.doorInnerX * 1.9, 0.16, 0.12, 0.04), {
    p: [0, c.dashTopY - 0.2, c.dashFaceZ + 0.07],
  });
  const s = pk.steering;
  b.add(alc, rbox(0.34, 0.09, 0.2, 0.035), { p: [s.x, c.dashTopY + 0.005, c.dashFaceZ + 0.12] }); // binnacle hood
  b.add('screenI', rbox(0.26, 0.085, 0.008, 0.003), {
    p: [s.x, c.dashTopY - 0.045, c.dashFaceZ + 0.045],
    r: [-0.25, 0, 0],
  });
  b.add('screenI', rbox(0.2, 0.12, 0.008, 0.004), {
    p: [0, c.dashTopY - 0.13, c.dashFaceZ + 0.01],
    r: [-0.5, 0, 0],
  });
  for (const x of [-c.doorInnerX + 0.12, c.doorInnerX - 0.12, -0.16, 0.16])
    b.add('piano', plate(poly(6, 0.038, 0), 0.012, 0.003), {
      p: [x, c.dashTopY - 0.085, c.dashFaceZ + 0.012],
    });
  // door trims (static; follow the closed doors)
  b.add(
    lea,
    rbox(0.05, (c.beltY[0] + c.beltY[1]) / 2 - c.sillTopY - 0.02, 1.15, 0.02),
    { p: [c.doorInnerX + 0.03, ((c.beltY[0] + c.beltY[1]) / 2 + c.sillTopY) / 2, 0.12] },
    true,
  );
  // seats: cushion with bolsters, wrap-around back with shoulder wings and integrated headrest, carbon shell
  const seat = new Bucket();
  seat.add(
    lea,
    sweep(
      [
        [0, 0, 0.27],
        [0, 0.012, 0.1],
        [0, 0, -0.22],
      ].map((p) => ({ p })),
      sect.superellipse(0.2, 0.05, 3, 14),
      { up: [0, 1, 0], smoothPath: 7, caps: true },
    ),
    { p: [0, -0.1, 0] },
  );
  for (const sx of [1, -1])
    seat.add(
      alc,
      sweep(
        [
          [sx * 0.2, 0.0, 0.26],
          [sx * 0.215, 0.03, 0],
          [sx * 0.2, 0.02, -0.2],
        ].map((p) => ({ p })),
        sect.ellipse(0.045, 0.05, 10),
        { up: [0, 1, 0], smoothPath: 7, caps: true },
      ),
      { p: [0, -0.09, 0] },
    );
  const back = [
    { p: [0, -0.08, -0.2], s: [0.92, 1] },
    { p: [0, 0.2, -0.2], s: [1, 1] },
    { p: [0, 0.46, -0.2], s: [1.12, 1] },
    { p: [0, 0.6, -0.2], s: [0.7, 0.9] },
    { p: [0, 0.78, -0.2], s: [0.56, 0.9] },
    { p: [0, 0.84, -0.2], s: [0.3, 0.6] },
  ];
  seat.add(
    lea,
    sweep(back, sect.superellipse(0.235, 0.07, 3, 18), {
      up: [0, 0, 1],
      smoothPath: 14,
      caps: true,
    }),
  );
  seat.add(
    'carbonI',
    sweep(
      back.map((q) => ({ p: [0, q.p[1], q.p[2] - 0.035], s: q.s })),
      sect.superellipse(0.245, 0.05, 3, 18),
      { up: [0, 0, 1], smoothPath: 14, caps: true },
    ),
  );
  for (const sx of [1, -1])
    seat.add(
      alc,
      sweep(
        [
          [sx * 0.215, -0.05, -0.15],
          [sx * 0.24, 0.25, -0.13],
          [sx * 0.25, 0.47, -0.15],
        ].map((p) => ({ p })),
        sect.ellipse(0.04, 0.06, 10),
        { up: [0, 0, 1], smoothPath: 7, caps: true },
      ),
    );
  seat.add('stitchI', rbox(0.006, 0.5, 0.004, 0.001), { p: [0.07, 0.25, -0.128] }, true);
  for (const st of pk.seats)
    b.addBucket(seat, { p: [st.x, st.y, st.z], r: [-(st.recline - 0.2) * 0.9, 0, 0] });
  const out = b.merged(),
    t = c.trim;
  const mm = {
    carpet: M.carpet(),
    carbonI: M.carbon(),
    lea: M.leather(t.main),
    alc: M.alcantara(t.main),
    piano: M.plastic(0x050505, 'piano'),
    aluI: M.metal('alu'),
    stitchI: M.stitch(t.stitch),
    screenI: M.plastic(0x020203, 'piano'),
  };
  for (const k in out) {
    const m = new THREE.Mesh(out[k], mm[k]);
    m.name = 'cabin:' + k;
    g.add(m);
  }
  // steering wheel (own object; rotates about local Z)
  const sw = new THREE.Group(),
    R = s.dia / 2,
    wb = new Bucket();
  const rim = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    let y = Math.sin(a) * R;
    if (s.flatBottom) y = Math.max(y, -R * 0.78);
    rim.push({ p: [Math.cos(a) * R, y, 0] });
  }
  wb.add('alc', sweep(rim, sect.ellipse(0.016, 0.019, 10), { up: [0, 0, 1], caps: false }));
  wb.add('piano', rbox(0.15, 0.1, 0.05, 0.03), { p: [0, -0.01, -0.03] });
  for (const a of [0.12, Math.PI - 0.12, -Math.PI / 2])
    wb.add('aluI', rbox(R * 0.72, 0.026, 0.012, 0.005), {
      p: [Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, -0.015],
      r: [0, 0, a],
    });
  wb.add('accent', rbox(0.012, 0.03, 0.036, 0.004), { p: [0, R, 0] });
  const wo = wb.merged();
  mm.accent = M.coated(t.accent, 'satin');
  for (const k in wo) sw.add(new THREE.Mesh(wo[k], mm[k]));
  const em = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), decalMat(emblemTex(pk.brand)));
  em.position.set(0, -0.01, -0.004);
  sw.add(em);
  sw.position.set(s.x, s.y, s.z);
  sw.rotation.set(-s.tilt, Math.PI, 0, 'YXZ');
  const inner = new THREE.Group();
  while (sw.children.length) inner.add(sw.children[0]);
  sw.add(inner);
  g.add(sw);
  return { group: g, steeringWheel: inner };
}

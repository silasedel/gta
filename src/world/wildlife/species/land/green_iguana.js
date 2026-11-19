// Green iguana (Iguana iguana): the reference species for the wildlife kit. Read this file before writing another.
// Real animal: adults 1.2-1.7 m including a tail about twice the body length; sprawled legs, long toes, a row of
// spines from nape to tail, a big round subtympanic shield on each jowl and a hanging dewlap. Feral all over South
// Florida: basks on seawalls, lawns and canal banks, bobs its head at rivals, sprints for water when approached,
// and goes rigid and drops out of trees on rare mornings below about 10 C.
import { T, L, R, M, B } from '../../kit/index.js';

// atlas regions (0..1, y down)
const BODY = [0, 0, 1, 0.6],
  LEG = [0, 0.62, 0.48, 0.8],
  TOE = [0.5, 0.62, 0.74, 0.7],
  EYE = [0.5, 0.71, 0.58, 0.79],
  DEW = [0.76, 0.62, 1, 0.8],
  CREST = [0, 0.84, 1, 0.93];
const PAL = {
  green: {
    top: '#3f6a2a',
    mid: '#64913c',
    belly: '#b3c38c',
    band: '#1c2a18',
    head: '#6f9f58',
    dew: '#8fb060',
    crest: '#93a868',
    shield: '#d9e0c6',
  },
  gray: {
    top: '#5c6a4e',
    mid: '#76846a',
    belly: '#b8bca2',
    band: '#262a22',
    head: '#88917a',
    dew: '#a6ad92',
    crest: '#9aa08a',
    shield: '#dcdccf',
  },
  orange: {
    top: '#8a6a2a',
    mid: '#c98a34',
    belly: '#d9b986',
    band: '#33240f',
    head: '#d98f3c',
    dew: '#e09a48',
    crest: '#d9a25c',
    shield: '#ecd9c4',
  },
};

// nose -> tail. u = texture position along the body (head 0-0.2, trunk 0.2-0.55, tail 0.55-1)
const ST = [
  { p: [0, 0.125, 0.33], w: 0, h: 0, u: 0 },
  { p: [0, 0.125, 0.323], w: 0.013, h: [0.009, 0.009], n: 2.4, u: 0.015 },
  { p: [0, 0.126, 0.302], w: 0.021, h: [0.017, 0.013], n: 2.6, u: 0.05 },
  { p: [0, 0.128, 0.274], w: 0.028, h: [0.027, 0.018], n: 2.7, u: 0.1 },
  { p: [0, 0.127, 0.246], w: 0.034, h: [0.029, 0.027], n: 2.4, u: 0.15 },
  { p: [0, 0.122, 0.215], w: 0.027, h: [0.027, 0.027], n: 2.1, u: 0.2 },
  { p: [0, 0.112, 0.17], w: 0.044, h: [0.041, 0.038], n: 2.2, u: 0.26 },
  { p: [0, 0.108, 0.11], w: 0.057, h: [0.05, 0.046], n: 2.3, u: 0.34 },
  { p: [0, 0.105, 0.03], w: 0.063, h: [0.052, 0.05], n: 2.3, u: 0.43 },
  { p: [0, 0.105, -0.05], w: 0.054, h: [0.047, 0.044], n: 2.2, u: 0.5 },
  { p: [0, 0.105, -0.105], w: 0.045, h: [0.043, 0.036], n: 2.1, u: 0.55 },
  { p: [0, 0.1, -0.16], w: 0.033, h: [0.039, 0.03], n: 2.0, u: 0.6 },
  { p: [0, 0.086, -0.3], w: 0.021, h: [0.03, 0.021], n: 1.9, u: 0.7 },
  { p: [0, 0.062, -0.5], w: 0.012, h: [0.019, 0.013], n: 1.9, u: 0.8 },
  { p: [0, 0.036, -0.75], w: 0.0065, h: [0.01, 0.007], n: 2.0, u: 0.9 },
  { p: [0, 0.023, -0.95], w: 0.0032, h: [0.005, 0.004], n: 2.0, u: 0.96 },
  { p: [0, 0.018, -1.08], w: 0, h: 0, u: 1 },
];
const BONES = [
  ['hips', null, [0, 0.105, -0.105]],
  ['spine1', 'hips', [0, 0.105, -0.03]],
  ['spine2', 'spine1', [0, 0.107, 0.06]],
  ['chest', 'spine2', [0, 0.11, 0.14]],
  ['neck', 'chest', [0, 0.12, 0.205]],
  ['head', 'neck', [0, 0.126, 0.245]],
  ['dewlap', 'head', [0, 0.103, 0.25]],
  ['tail1', 'hips', [0, 0.1, -0.16]],
  ['tail2', 'tail1', [0, 0.088, -0.3]],
  ['tail3', 'tail2', [0, 0.072, -0.45]],
  ['tail4', 'tail3', [0, 0.052, -0.62]],
  ['tail5', 'tail4', [0, 0.033, -0.8]],
  ['tail6', 'tail5', [0, 0.022, -0.95]],
];
// left limb joints (mirrored for the right): shoulder/hip, elbow/knee, wrist/ankle
const FL = [
  [0.04, 0.1, 0.165],
  [0.098, 0.08, 0.148],
  [0.112, 0.014, 0.186],
];
const HL = [
  [0.038, 0.098, -0.105],
  [0.116, 0.09, -0.06],
  [0.128, 0.014, -0.114],
];
for (const [pre, J, par] of [
  ['fl', FL, 'chest'],
  ['hl', HL, 'hips'],
])
  for (const s of [1, -1]) {
    const n = pre + (s > 0 ? 'L' : 'R');
    BONES.push(
      [n + '_up', par, [J[0][0] * s, J[0][1], J[0][2]]],
      [n + '_lo', n + '_up', [J[1][0] * s, J[1][1], J[1][2]]],
      [n + '_foot', n + '_lo', [J[2][0] * s, J[2][1], J[2][2]]],
    );
  }

function paint(Tx, v) {
  const pal = PAL[v.morph] || PAL.green,
    s = new Tx.Skin(1024, { base: pal.mid, rough: 0.6, seed: 3 });
  const by = (vv) => vv * BODY[3]; // body v (0 dorsal .. 1 ventral) -> canvas y
  // countershaded base, mottling, then pattern, then scale structure on top
  s.gradient(BODY, 'v', [
    [0, pal.top],
    [0.4, pal.mid],
    [0.72, Tx.mix(pal.mid, pal.belly, 0.6)],
    [1, pal.belly],
  ]);
  s.gradient([0, 0, 0.2, 0.6], 'v', [
    [0, pal.head, 0.7],
    [0.6, pal.head, 0.5],
    [1, pal.belly, 0.4],
  ]);
  s.noise(BODY, { cells: 6, amount: 0.38 }).noise(BODY, { cells: 20, amount: 0.22, seed: 2 });
  s.bands([0.6, 0, 1, 0.6], {
    at: [0.04, 0.15, 0.27, 0.39, 0.51, 0.63, 0.75, 0.87, 0.97],
    width: 0.045,
    color: pal.band,
    alpha: 0.72,
    wobble: 0.5,
  });
  s.bands([0.265, 0.02, 0.36, 0.3], {
    at: [0.2, 0.55, 0.9],
    width: 0.09,
    color: pal.band,
    alpha: 0.5,
    wobble: 1.4,
  }); // shoulder bars
  s.spots([0.2, 0.05, 0.58, 0.5], {
    n: 40,
    r: [0.008, 0.02],
    color: (u, vv, R2) => (R2() < 0.5 ? Tx.shade(pal.top, 0.6) : Tx.mix(pal.mid, '#cfc890', 0.5)),
    alpha: 0.3,
    soft: 0.9,
    squash: 2,
  }); // flank flecks
  // head details: lips and mouth line (at the widest point of the head), nostril, eye ring, ear drum, subtympanic shield
  s.gradient([0, by(0.41), 0.14, by(0.63)], 'v', [
    [0, pal.shield, 0],
    [0.38, pal.shield, 0.45],
    [0.5, '#1a1810', 0.0],
    [0.62, pal.shield, 0.4],
    [1, pal.shield, 0],
  ]);
  s.line(
    [
      [0.001, by(0.5)],
      [0.03, by(0.505)],
      [0.075, by(0.52)],
      [0.115, by(0.545)],
      [0.14, by(0.585)],
    ],
    { color: '#14120c', alpha: 0.9, width: 0.006, height: 0.12 },
  );
  s.spots(BODY, {
    n: 1,
    at: () => [0.021, 0.3],
    r: [0.004, 0.004],
    squash: 2.4,
    color: '#0c0a08',
    alpha: 0.95,
    soft: 0.3,
    height: 0.2,
  }); // nostril
  s.spots(BODY, {
    n: 1,
    at: () => [0.1, 0.33],
    r: [0.018, 0.018],
    squash: 2.6,
    color: Tx.shade(pal.head, 0.45),
    alpha: 0.85,
    soft: 0.5,
  }); // eye socket shading
  s.spots(BODY, {
    n: 1,
    at: () => [0.147, 0.36],
    r: [0.008, 0.008],
    squash: 3.4,
    color: Tx.shade(pal.head, 0.55),
    alpha: 0.9,
    soft: 0.25,
    height: 0.36,
    rough: 0.35,
  }); // tympanum
  s.spots(BODY, {
    n: 1,
    at: () => [0.15, 0.625],
    r: [0.02, 0.02],
    squash: 3.2,
    color: pal.shield,
    ring: Tx.shade(pal.head, 0.5),
    alpha: 1,
    soft: 0.14,
    height: 0.9,
    rough: 0.3,
  }); // subtympanic shield
  s.spots([0.1, by(0.56), 0.2, by(0.9)], {
    n: 10,
    r: [0.005, 0.009],
    squash: 3,
    color: pal.shield,
    alpha: 0.7,
    soft: 0.25,
    height: 0.75,
    rough: 0.4,
  }); // jowl tubercles
  s.gradient([0, 0, 0.16, by(0.3)], 'h', [
    [0, '#4f8f8a', 0.28],
    [1, '#4f8f8a', 0],
  ]); // bluish cast on the crown
  // scale structure: plates on the head, fine beads on the trunk, keeled rings on the tail, wide plates on the belly
  s.scales([0, 0, 0.2, 0.6], {
    cols: 21,
    rows: 15,
    shape: 'bead',
    edge: 0.4,
    bump: 0.75,
    jitter: 0.5,
    tint: 0.2,
  });
  s.scales([0.2, 0, 0.56, 0.47], {
    cols: 124,
    rows: 34,
    shape: 'bead',
    edge: 0.26,
    bump: 0.5,
    jitter: 0.3,
    tint: 0.2,
  });
  s.scales([0.2, 0.47, 0.56, 0.6], {
    cols: 60,
    rows: 7,
    shape: 'plate',
    edge: 0.3,
    bump: 0.45,
    jitter: 0.1,
    tint: 0.08,
  });
  s.scales([0.56, 0, 1, 0.6], {
    cols: 120,
    rows: 26,
    shape: 'keel',
    edge: 0.36,
    bump: 0.6,
    jitter: 0.15,
    tint: 0.14,
  });
  // legs + toes
  s.gradient(LEG, 'h', [
    [0, pal.mid],
    [0.6, Tx.shade(pal.mid, 0.85)],
    [1, Tx.shade(pal.top, 0.7)],
  ]);
  s.noise(LEG, { cells: 10, amount: 0.3 }).bands(LEG, {
    at: [0.3, 0.5, 0.72, 0.9],
    width: 0.03,
    color: pal.band,
    alpha: 0.4,
    wobble: 0.8,
  });
  s.scales(LEG, { cols: 46, rows: 16, shape: 'bead', edge: 0.36, bump: 0.6, jitter: 0.3 });
  s.gradient(TOE, 'h', [
    [0, Tx.shade(pal.mid, 0.8)],
    [0.78, Tx.shade(pal.top, 0.6)],
    [0.8, '#2a2118'],
    [1, '#0e0b08'],
  ]);
  s.scales([TOE[0], TOE[1], TOE[0] + (TOE[2] - TOE[0]) * 0.8, TOE[3]], {
    cols: 22,
    rows: 5,
    shape: 'plate',
    edge: 0.4,
    bump: 0.5,
  });
  s.fill([TOE[0] + (TOE[2] - TOE[0]) * 0.8, TOE[1], TOE[2], TOE[3]], '#15110c', { rough: 0.25 });
  // eye
  s.eye(EYE, {
    iris: v.morph === 'orange' ? '#c8741c' : '#a8791f',
    iris2: '#e0b040',
    pupil: 'round',
    pupilSize: 0.36,
    sclera: '#3a2c14',
  });
  // dewlap: thin skin with rows of scales and a spiny front edge
  s.gradient(DEW, 'v', [
    [0, pal.dew],
    [1, Tx.mix(pal.dew, pal.shield, 0.5)],
  ]).noise(DEW, { cells: 8, amount: 0.3 });
  s.scales(DEW, { cols: 26, rows: 18, shape: 'bead', edge: 0.3, bump: 0.5, tint: 0.2 }).wrinkles(
    DEW,
    { n: 26, dir: 'v', len: [0.3, 0.8], depth: 0.2, alpha: 0.2 },
  );
  // crest: a strip of spines on a transparent background (cut out by alphaTest)
  s.clear([0, 0.805, 1, 0.94]);
  s.paint(
    CREST,
    (c, x, y, w, h, k) => {
      const N = 74,
        R2 = Tx.rng(5);
      for (let i = 0; i < N; i++) {
        const cx = x + ((i + 0.5) / N) * w,
          bw = (w / N) * (0.62 + R2() * 0.2),
          tall = h * (0.7 + R2() * 0.2),
          lean = bw * (0.5 + R2() * 0.5);
        c.beginPath();
        c.moveTo(cx - bw / 2, y + h);
        c.quadraticCurveTo(cx - bw * 0.2 + lean * 0.5, y + h - tall * 0.6, cx + lean, y + h - tall);
        c.quadraticCurveTo(cx + bw * 0.35 + lean * 0.3, y + h - tall * 0.5, cx + bw / 2, y + h);
        c.closePath();
        if (k === 'a') {
          const g = c.createLinearGradient(0, y + h, 0, y);
          g.addColorStop(0, Tx.css(Tx.shade(pal.crest, 0.75)));
          g.addColorStop(0.5, Tx.css(pal.crest));
          g.addColorStop(1, Tx.css(Tx.mix(pal.crest, '#f0e6c8', 0.5)));
          c.fillStyle = g;
        } else c.fillStyle = k === 'h' ? '#b0b0b0' : '#808080';
        c.fill();
      }
    },
    'ahr',
  );
  return s;
}

function build(THREE, tex, v) {
  const rig = R.makeRig(THREE, BONES),
    parts = [];
  const body = L.loft(THREE, ST, { around: 20, subdiv: 4, uv: BODY });
  const SPINE = [
    'head',
    'neck',
    'chest',
    'spine2',
    'spine1',
    'hips',
    'tail1',
    'tail2',
    'tail3',
    'tail4',
    'tail5',
    'tail6',
  ];
  // crest first (it reads the body's path), then bind both to the spine
  const cm = v.crest ?? 1;
  const crest = L.crest(THREE, body, {
    from: 0.185,
    to: 0.86,
    uv: CREST,
    sink: 0.002,
    lean: (k) => 0.012 * (1 - k),
    height: (k) =>
      cm *
      (k < 0.06
        ? 0.01 + (k / 0.06) * 0.026
        : k < 0.5
          ? 0.036 - (k - 0.06) * 0.028
          : Math.max(0.004, 0.024 - (k - 0.5) * 0.045)),
  });
  R.bindSpine(THREE, body, rig, SPINE);
  R.bindSpine(THREE, crest, rig, SPINE);
  parts.push(body, crest);
  // eyes on the skin surface
  for (const s of [1, -1]) {
    const e = L.surfacePoint(body, 0.1, 1.02, s),
      r = 0.0078,
      c = [e.p[0] - e.n[0] * r * 0.45, e.p[1] - e.n[1] * r * 0.45, e.p[2] - e.n[2] * r * 0.45];
    parts.push(
      R.bindRigid(
        THREE,
        L.ball(THREE, r, c, EYE, { seg: 10, face: s > 0 ? 'x+' : 'x-' }),
        rig,
        'head',
      ),
    );
  }
  // dewlap: a thin flap under the throat in the mid plane
  const dew = L.flat(
    THREE,
    [
      [0.308, 0.115],
      [0.3, 0.1],
      [0.29, 0.086],
      [0.277, 0.073],
      [0.262, 0.064],
      [0.246, 0.059],
      [0.232, 0.06],
      [0.219, 0.067],
      [0.209, 0.079],
      [0.203, 0.092],
      [0.2, 0.104],
      [0.24, 0.11],
      [0.28, 0.115],
    ],
    DEW,
    { plane: 'yz' },
  );
  parts.push(R.bindRigid(THREE, dew, rig, 'dewlap'));
  // limbs: lofted with muscle bulges, then five long clawed toes
  const limb = (J, radii, fat) => {
    const [a, b, c] = J,
      mid = (p, q, t, o = [0, 0, 0]) => [
        p[0] + (q[0] - p[0]) * t + o[0],
        p[1] + (q[1] - p[1]) * t + o[1],
        p[2] + (q[2] - p[2]) * t + o[2],
      ];
    return L.loft(
      THREE,
      [
        { p: mid(a, b, -0.25), w: radii[0] * 0.9, h: radii[0] * 0.9 },
        { p: mid(a, b, 0.3, [0, 0.004, 0]), w: radii[0] * fat, h: radii[0] * fat },
        { p: mid(a, b, 0.75), w: radii[1] * 1.05, h: radii[1] * 1.05 },
        { p: b, w: radii[1], h: radii[1] },
        { p: mid(b, c, 0.35, [0.004, 0, 0]), w: radii[1] * 1.12, h: radii[1] * 1.12 },
        { p: mid(b, c, 0.8), w: radii[2] * 1.15, h: radii[2] * 1.15 },
        { p: c, w: radii[2], h: radii[2] },
        { p: [c[0], c[1] - 0.008, c[2] + 0.004], w: radii[2] * 0.9, h: radii[2] * 0.7 },
      ],
      { around: 10, subdiv: 2, uv: LEG },
    );
  };
  const toes = (wrist, lens, spread, base) =>
    lens.map((len, i) => {
      const a = base + (i - (lens.length - 1) / 2) * spread,
        dx = Math.sin(a),
        dz = Math.cos(a),
        w = wrist;
      return L.tube(
        THREE,
        [
          [w[0], w[1] - 0.004, w[2]],
          [w[0] + dx * len * 0.45, 0.012, w[2] + dz * len * 0.45],
          [w[0] + dx * len * 0.85, 0.006, w[2] + dz * len * 0.85],
          [w[0] + dx * len, 0.0025, w[2] + dz * len],
          [w[0] + dx * (len + 0.008), 0.0005, w[2] + dz * (len + 0.008)],
        ],
        [0.0048, 0.0036, 0.0028, 0.0022, 0.0003],
        { around: 5, subdiv: 2, uv: TOE },
      );
    });
  const mkLimb = (pre, J, radii, fat, toeLens, spread, baseAng, parent) => {
    const leg = limb(J, radii, fat),
      ts = toes(J[2], toeLens, spread, baseAng);
    for (const s of [1, -1]) {
      const n = pre + (s > 0 ? 'L' : 'R'),
        lg = s > 0 ? leg : L.mirrorX(THREE, leg);
      const tail = [J[2][0] * s, J[2][1] - 0.02, J[2][2] + 0.01];
      parts.push(
        R.bindChain(THREE, lg, rig, [n + '_up', n + '_lo', n + '_foot'], {
          parent,
          parentBlend: 0.22,
          blend: 0.3,
          by: 'pos',
          tail,
        }),
      );
      for (const t of ts)
        parts.push(R.bindRigid(THREE, s > 0 ? t : L.mirrorX(THREE, t), rig, n + '_foot'));
    }
  };
  mkLimb(
    'fl',
    FL,
    [0.017, 0.013, 0.0085],
    1.15,
    [0.022, 0.032, 0.04, 0.044, 0.028],
    0.42,
    0.35,
    'chest',
  );
  mkLimb(
    'hl',
    HL,
    [0.022, 0.016, 0.0095],
    1.25,
    [0.024, 0.04, 0.054, 0.072, 0.034],
    0.4,
    0.5,
    'hips',
  );

  const geo = L.merge(THREE, parts),
    mat = M.skinMaterial(THREE, tex, { alphaTest: 0.5, doubleSide: true, normalScale: 0.85 });
  if (v.tint) mat.color.setRGB(v.tint[0], v.tint[1], v.tint[2]);
  const mesh = R.skinMesh(THREE, geo, mat, rig),
    group = new THREE.Group();
  group.add(mesh);
  const sc = v.scale ?? 1;
  group.scale.setScalar(sc);

  // ---- procedural animation ------------------------------------------------------------------------------------
  const G = R.GAITS.sprawl,
    LEGS = [
      ['hlL', HL, 1, 0],
      ['flL', FL, 1, 1],
      ['hlR', HL, -1, 2],
      ['flR', FL, -1, 3],
    ];
  const P = {
    phase: (v.seed || 0) % 1,
    move: 0,
    flat: 0,
    up: 0.3,
    swim: 0,
    stun: 0,
    dew: 0,
    bobT: 0,
    t: (v.seed || 0) * 10,
    lookY: 0,
    lookX: 0,
  };
  const tgt = new THREE.Vector3(),
    pole = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler();
  const c = {
    group,
    rig,
    mesh,
    radius: 0.5 * sc,
    states: ['idle', 'bask', 'walk', 'run', 'bob', 'swim', 'stunned'],
    update(dt, a = {}) {
      const st = a.state || 'idle',
        moving = st === 'walk' || st === 'run',
        speed = (moving ? (a.speed ?? (st === 'run' ? 3.6 : 0.45)) : st === 'swim' ? 0.8 : 0) / sc;
      P.t += dt;
      P.move = R.damp(P.move, moving ? 1 : 0, 9, dt);
      P.flat = R.damp(P.flat, st === 'bask' ? 1 : 0, 3, dt);
      P.up = R.damp(
        P.up,
        st === 'run' ? 1 : st === 'idle' || st === 'bob' ? 0.45 : st === 'walk' ? 0.25 : 0,
        5,
        dt,
      );
      P.swim = R.damp(P.swim, st === 'swim' ? 1 : 0, 5, dt);
      P.stun = R.damp(P.stun, st === 'stunned' ? 1 : 0, st === 'stunned' ? 30 : 1.2, dt);
      P.dew = R.damp(P.dew, st === 'bob' ? 1 : 0.15, 5, dt);
      P.bobT = st === 'bob' ? P.bobT + dt : 0;
      P.lookY = R.damp(P.lookY, a.lookYaw ?? Math.sin(P.t * 0.37) * 0.3 * (1 - P.move), 4, dt);
      const stride = Math.min(0.3, 0.1 + speed * 0.055);
      if (speed > 0.01) P.phase += (dt * speed * G.duty) / stride;
      const run = Math.min(1, speed / 3),
        w = P.phase * Math.PI * 2,
        cw = Math.cos(w);
      const und = (0.13 + 0.12 * run) * Math.max(P.move, P.swim * 0.7);
      rig.reset();
      // trunk: lateral standing wave between the girdles, height, alert pitch
      const hipsY = -0.05 * P.flat + 0.022 * P.up * (1 - P.flat) + Math.sin(w * 2) * 0.003 * P.move,
        pitch = -0.1 * P.up * (1 - P.flat) * (1 - P.swim);
      const breathe = Math.sin(P.t * 1.6) * 0.012;
      rig.set('hips', pitch, -und * cw, 0).move('hips', 0, hipsY, 0);
      const bend = (und * cw * 2) / 3;
      rig
        .set('spine1', 0, bend, 0)
        .set('spine2', 0, bend, 0)
        .set('chest', pitch * 0.4, bend, 0);
      rig.bones.spine2.scale.set(1 + breathe, 1 + breathe, 1);
      // head: counter the trunk yaw, look around, head-bob display (fast bobs, then two slow ones)
      let bob = 0;
      if (st === 'bob') {
        const bt = P.bobT % 3.4;
        bob =
          bt < 1.5
            ? Math.max(0, Math.sin(bt * Math.PI * 2 * 3.3)) * (1 - bt / 2.2)
            : bt < 2.9
              ? Math.max(0, Math.sin((bt - 1.5) * Math.PI * 2 * 1.45)) * 0.9
              : 0;
      }
      const headUp = -0.22 * P.up - 0.3 * P.flat - bob * 0.42 + (a.lookPitch || 0);
      rig
        .set('neck', headUp * 0.55 - pitch * 0.6, -und * cw * 0.5 + P.lookY * 0.4, 0)
        .set('head', headUp * 0.45 + 0.08, -und * cw * 0.5 + P.lookY * 0.6, 0);
      rig.bones.dewlap.scale.set(1, 0.55 + 0.6 * P.dew + bob * 0.1, 0.8 + 0.25 * P.dew);
      // tail: traveling wave when moving, a lazy resting curve otherwise, lifted off the ground at a run
      const curl = (v.tailCurl ?? 0.5) * (1 - P.move) * (1 - P.swim),
        tw = 0.2 + 0.25 * run + 0.35 * P.swim;
      for (let i = 1; i <= 6; i++) {
        const wave =
          Math.sin(w - i * 0.85 + 0.6) * tw * Math.max(P.move, P.swim) * (0.5 + i * 0.12);
        rig.set(
          'tail' + i,
          (i === 1 ? 0.1 * run + 0.06 * P.up - pitch : 0.03 * run) + (i < 3 ? 0.07 * P.flat : 0),
          wave + curl * 0.16 * (i > 1 ? 1 : 0.3) + Math.sin(P.t * 0.5 + i) * 0.015,
          0,
        );
      }
      if (P.stun > 0.01) {
        rig.add('hips', 0, 0, P.stun * 2.85).move('hips', 0.02 * P.stun, hipsY - 0.045 * P.stun, 0);
      }
      // legs: IK to planted feet (sprawl gait); tucked along the body when swimming; rigid when stunned
      rig.fk();
      const loose = Math.max(P.swim, P.stun);
      for (const [n, J, s, gi] of LEGS) {
        const hind = J === HL;
        if (loose < 0.98) {
          const f = R.gaitFoot(P.phase + G.off[gi], G.duty);
          tgt.set(
            J[2][0] * s * (1 + 0.22 * P.flat),
            J[2][1] + f.lift * (0.022 + 0.02 * run) * P.move,
            J[2][2] + f.x * stride * 0.5 * P.move + (hind ? 0.02 : -0.01) * P.flat,
          );
          pole.set(s * 0.8, 0.6, hind ? 0.5 : -0.45);
          rig.ikLeg(n + '_up', n + '_lo', n + '_foot', tgt, pole);
          rig.setArmQ(
            n + '_foot',
            q.setFromEuler(e.set(f.lift * 0.7 * P.move, s * (hind ? 0.25 : 0.1), 0, 'YXZ')),
          );
        }
        if (loose > 0.02) {
          // blend toward the tucked / stiff pose
          const U = rig.bones[n + '_up'],
            Lo = rig.bones[n + '_lo'],
            F = rig.bones[n + '_foot'];
          const sw = P.swim >= P.stun ? 1 : 0,
            uq = q.setFromEuler(
              e.set(
                sw ? 0.25 : -0.5,
                s * (sw ? (hind ? 1.15 : 1.25) : 0.2),
                s * (sw ? 0.1 : 0.5),
                'YXZ',
              ),
            );
          U.quaternion.slerp(uq, loose);
          Lo.quaternion.slerp(q.setFromEuler(e.set(0, s * (sw ? 0.5 : -0.3), 0, 'YXZ')), loose);
          F.quaternion.slerp(q.identity(), loose);
        }
      }
    },
    dispose() {},
  };
  c.update(0, { state: 'idle' });
  return c;
}

// ---- behavior -----------------------------------------------------------------------------------------------------
function spawn(THREE, world, site, make) {
  const root = new THREE.Group(),
    list = [],
    n = site.count || 1 + ((world.rand() * 3) | 0);
  const cold = world.weather.tempC < 10 && world.hour > 4 && world.hour < 10.5;
  for (let i = 0; i < n; i++) {
    const c = make();
    root.add(c.group);
    const a = world.rand() * 6.28,
      r = Math.sqrt(world.rand()) * (site.radius || 6),
      x = site.x + Math.cos(a) * r,
      z = site.z + Math.sin(a) * r;
    const it = {
      c,
      m: new B.Mover(THREE, x, world.groundY(x, z), z, world.rand() * 6.28),
      state: 'bask',
      t: 2 + world.rand() * 10,
      anim: 'bask',
      home: [x, z],
      goal: null,
      calm: 0,
      vy: 0,
      spin: 0,
    };
    if (cold && site.habitat === 'palm') {
      it.state = 'frozen';
      it.m.pos.set(
        site.x + (world.rand() - 0.5) * 1.6,
        (site.y ?? world.groundY(site.x, site.z)) + (site.height || 6) - world.rand(),
        site.z + (world.rand() - 0.5) * 1.6,
      );
      it.anim = 'stunned';
      it.t = 4 + world.rand() * 60;
    } else if (cold) {
      it.state = 'stunned';
      it.anim = 'stunned';
    } else if (world.isWater(x, z)) {
      it.state = 'swim';
      it.anim = 'swim';
      it.t = 6;
    }
    list.push(it);
  }
  const actor = {
    root,
    pos: new THREE.Vector3(site.x, site.y ?? 0, site.z),
    radius: 14,
    list,
    update(dt, world) {
      const pl = world.player.pos;
      for (const it of list) {
        const m = it.m,
          p = m.pos,
          c = it.c;
        it.t -= dt;
        const dCam = world.cam.distanceTo(p);
        if (it.state === 'frozen') {
          // rigid in a palm crown on a cold morning: lets go when someone walks under, or at random
          if ((Math.hypot(pl.x - p.x, pl.z - p.z) < 5 && world.rand() < dt * 0.6) || it.t < 0) {
            it.state = 'fall';
            it.vy = 0;
            it.spin = (world.rand() - 0.5) * 6;
            world.sound('palm_rustle', p, { volume: 0.5 });
          }
        } else if (it.state === 'fall') {
          it.vy -= 9.81 * dt;
          p.y += it.vy * dt;
          c.group.rotation.z += it.spin * dt;
          c.group.rotation.x += it.spin * 0.6 * dt;
          const g = world.groundY(p.x, p.z);
          if (world.isWater(p.x, p.z) && p.y < world.seaLevel) {
            world.fx.splash(p, 0.8);
            world.sound('splash_small', p, { volume: 0.7 });
            it.state = 'stunned';
            p.y = world.seaLevel - 0.04;
            c.group.rotation.set(0, m.heading, 0);
          } else if (p.y <= g) {
            p.y = g;
            it.state = 'stunned';
            c.group.rotation.set(0, m.heading, 0);
            world.sound('iguana_thud', p, { volume: 0.8 });
            world.fx.dust(p);
          }
        } else if (it.state === 'stunned') {
          // warms up once the morning does
          it.anim = 'stunned';
          if (world.weather.tempC > 11.5 || world.hour > 10.5) {
            it.warm = (it.warm || 0) + dt;
            if (it.warm > 6 + (it.c.variant.seed % 1) * 20) {
              it.state = 'bask';
              it.anim = 'idle';
              it.t = 20;
            }
          }
          if (world.isWater(p.x, p.z)) p.y = world.seaLevel - 0.04;
        } else {
          const th = B.threatCheck(world, p, { player: 3.2, run: 7, car: 5, dog: 10, ped: 2 });
          const car =
            it.state === 'cross' || world.onRoad(p.x, p.z)
              ? B.carDanger(world, p, { horizon: 2.2 })
              : null;
          if (car && it.state !== 'dodge') {
            // get out of the way: sprint to the nearer side of the car's path
            it.state = 'dodge';
            it.t = 1.6;
            it.goal = [
              p.x + car.dir[1] * car.side * 5 + car.dir[0] * 1.5,
              p.z - car.dir[0] * car.side * 5 + car.dir[1] * 1.5,
            ];
          } else if (th && it.state !== 'flee' && it.state !== 'dodge' && it.state !== 'swim') {
            it.state = 'flee';
            it.t = 2.5 + world.rand() * 2;
            it.from = th.from;
            // head for water if it is close, otherwise straight away from the threat
            let gx = p.x + ((p.x - th.from.x) / (th.dist + 0.5)) * 14,
              gz = p.z + ((p.z - th.from.z) / (th.dist + 0.5)) * 14;
            const wpt = B.pickPoint(world, p.x, p.z, 16, { water: true, tries: 8 });
            if (
              wpt &&
              (wpt[0] - p.x) * (p.x - th.from.x) + (wpt[1] - p.z) * (p.z - th.from.z) > 0
            ) {
              gx = wpt[0];
              gz = wpt[1];
            }
            it.goal = [gx, gz];
            world.sound('iguana_scurry', p, { volume: 0.4 });
          }
          if (it.state === 'flee' || it.state === 'dodge') {
            const left = m.seek(
              dt,
              world,
              it.goal[0],
              it.goal[1],
              it.state === 'dodge' ? 5.2 : 4.4,
              { turn: 9, accel: 30, swim: true },
            );
            it.anim = m.inWater ? 'swim' : 'run';
            if (m.inWater && !it.wet) {
              it.wet = true;
              world.fx.splash(p, 0.5);
              world.sound('splash_small', p, { volume: 0.5 });
            }
            if (!m.inWater) it.wet = false;
            if (it.t < 0 || left < 0.4 || m.blocked > 0.4) {
              it.state = m.inWater ? 'swim' : 'bask';
              it.anim = m.inWater ? 'swim' : 'idle';
              it.t = m.inWater ? 5 + world.rand() * 6 : 4 + world.rand() * 5;
              it.home = [p.x, p.z];
              m.blocked = 0;
            }
          } else if (it.state === 'swim') {
            // paddle about, then climb out somewhere dry
            if (!it.goal || it.t < 0) {
              it.goal = B.pickPoint(world, p.x, p.z, 18, { water: false, tries: 10 }) || it.home;
              it.t = 30;
            }
            const left = m.seek(dt, world, it.goal[0], it.goal[1], m.inWater ? 0.9 : 0.5, {
              turn: 2.5,
              swim: true,
            });
            it.anim = m.inWater ? 'swim' : 'walk';
            if (!m.inWater && (left < 0.5 || m.blocked > 1)) {
              it.state = 'bask';
              it.anim = 'bask';
              it.t = 10 + world.rand() * 20;
              it.home = [p.x, p.z];
              it.goal = null;
            }
          } else if (it.state === 'walk' || it.state === 'cross') {
            if (it.state === 'cross' && !it.go) {
              // wait at the edge until the road is clear
              it.anim = 'idle';
              m.settle(dt, world);
              const busy = world.threats.some(
                (t) =>
                  t.kind === 'car' &&
                  Math.hypot(t.vel?.x || 0, t.vel?.z || 0) > 2 &&
                  t.pos.distanceTo(p) < 38,
              );
              if (!busy && it.t < 0) it.go = true;
              if (it.t < -25) {
                it.state = 'bask';
                it.t = 8;
              }
            } else {
              const sp = it.state === 'cross' ? 3.4 : 0.42,
                left = m.seek(dt, world, it.goal[0], it.goal[1], sp, {
                  turn: it.state === 'cross' ? 7 : 2.2,
                  accel: it.state === 'cross' ? 20 : 3,
                });
              it.anim = it.state === 'cross' ? 'run' : 'walk';
              if (left < 0.25 || m.blocked > 0.6 || it.t < -40) {
                it.state = 'bask';
                it.anim = world.rand() < 0.6 ? 'bask' : 'idle';
                it.t = 6 + world.rand() * 18;
                it.home = [p.x, p.z];
                it.go = false;
                m.blocked = 0;
                m.speed = 0;
              }
            }
          } else {
            // basking / idling: bob at company, shift position now and then, sometimes cross the road
            m.settle(dt, world);
            m.speed = 0;
            if (it.anim === 'bob' && it.t < 0) {
              it.anim = 'idle';
              it.t = 5 + world.rand() * 12;
            } else if (it.t < 0) {
              const k = world.rand(),
                near = Math.hypot(pl.x - p.x, pl.z - p.z) < 14 || list.length > 1;
              if (k < (near ? 0.45 : 0.2)) {
                it.anim = 'bob';
                it.t = 3.3;
                world.sound('iguana_hiss', p, { volume: 0.15 });
              } else if (k < 0.62) {
                const g = B.pickPoint(world, it.home[0], it.home[1], 7, { minR: 1.5 });
                if (g) {
                  it.state = 'walk';
                  it.goal = g;
                  it.t = 0;
                } else it.t = 5;
              } else if (k < 0.74) {
                const far = B.farSideOfRoad(world, p.x, p.z, world.rand() * 6.28, 36);
                if (far) {
                  it.state = 'cross';
                  it.goal = far;
                  it.go = false;
                  it.t = 1 + world.rand() * 3;
                } else it.t = 6;
              } else {
                it.anim = world.rand() < 0.7 ? 'bask' : 'idle';
                it.t = 8 + world.rand() * 20;
              }
            }
          }
          c.group.rotation.set(0, m.heading, 0);
        }
        c.group.position.copy(p);
        const n = dCam < 30 ? 1 : dCam < 80 ? 3 : 6;
        it.acc = (it.acc || 0) + dt;
        if ((world.frame + list.indexOf(it)) % n === 0) {
          c.update(it.acc, { state: it.anim, speed: m.speed });
          it.acc = 0;
        }
      }
      actor.pos.copy(list[0].m.pos);
    },
    dispose() {
      for (const it of list) it.c.dispose();
    },
  };
  return actor;
}

export default {
  id: 'green_iguana',
  name: 'Green iguana',
  kind: 'reptile',
  length: 1.4,
  habitats: {
    park: 2,
    lawn: 2,
    canal: 3,
    dock: 1.5,
    street: 0.6,
    palm: 2,
    marina: 1,
    keys_scrub: 2,
    beach: 0.3,
  },
  when: (w) => (w.hour > 7.5 && w.hour < 19 ? (w.weather.rain > 0.5 ? 0.3 : 1) : 0.08), // diurnal baskers
  group: [1, 3],
  variant(rand) {
    const k = rand(),
      morph = k < 0.6 ? 'green' : k < 0.85 ? 'gray' : 'orange';
    return {
      morph,
      scale: morph === 'green' ? 0.55 + rand() * 0.35 : 0.85 + rand() * 0.3,
      crest: morph === 'orange' ? 1.45 : 0.8 + rand() * 0.35,
      tailCurl: (rand() - 0.5) * 2,
      tint: [0.92 + rand() * 0.12, 0.92 + rand() * 0.12, 0.9 + rand() * 0.12],
      seed: rand() * 100,
    };
  },
  skinKey: (v) => v.morph,
  paint,
  build,
  spawn,
  sounds: {
    iguana_scurry: 'claws scrabbling on concrete/grass, 0.5 s',
    iguana_thud: 'soft heavy thump of a 3 kg lizard landing on turf',
    iguana_hiss: 'quiet breathy hiss',
    palm_rustle: 'dry palm fronds shaken once',
    splash_small: 'small animal entering water',
  },
};

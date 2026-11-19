// Hero-car wheels: multi-piece forged-style rims (five original designs), low-profile tires with grooves and raised
// sidewall lettering (our tire brand GARRANO), carbon-ceramic discs with bells, multi-piston calipers with marque lettering.
// buildWheel(carKey, 'front' | 'rear', { side }) -> { node (spins about local X, outer face toward +X for side 1), caliper (fixed), radius, width, tris }
import * as THREE from 'three';
import { PACK, TIRE_BRAND } from './packages.js';
import { getMats } from './kit/mats.js';
import {
  Bucket,
  lathe,
  sweep,
  sect,
  cyl,
  flip,
  canvasTex,
  uvBox,
  mergeGeometries,
} from './kit/geo.js';
import { emblemTex, wordTex, decalMat } from './kit/emblems.js';

const DESIGN = {
  // n = spoke groups, pair = half-angle between the two blades of a group (0 = single), w/th = blade width/thickness at the rim, dish = how far the hub sits inboard of the lip
  colosso: {
    n: 5,
    pair: 0.2,
    w: 0.052,
    th: 0.034,
    hubW: 1.5,
    dish: 0.045,
    twist: 0,
    lug: 5,
    spoke: ['metal', 'alu'],
    barrel: 0x060607,
    lip: ['metal', 'alu'],
    pocket: true,
  },
  fulmine: {
    n: 5,
    pair: 0.3,
    split: true,
    w: 0.026,
    th: 0.03,
    hubW: 1.7,
    dish: 0.07,
    twist: 0.06,
    lug: 5,
    spoke: ['metal', 'titanium'],
    barrel: 0x1b1c1f,
    lip: ['metal', 'titanium'],
  },
  saetta: {
    n: 7,
    pair: 0.115,
    w: 0.022,
    th: 0.036,
    hubW: 1.5,
    dish: 0.085,
    twist: 0,
    lug: 0,
    spoke: ['coated', 0x8f7238, 'satin'],
    barrel: 0x111112,
    lip: ['coated', 0x8f7238, 'satin'],
    aero: true,
  },
  minuit: {
    n: 9,
    pair: 0,
    w: 0.05,
    th: 0.022,
    hubW: 1.25,
    dish: 0.06,
    twist: 0.36,
    lug: 5,
    spoke: ['metal', 'alu'],
    barrel: 0x050506,
    lip: ['metal', 'chrome'],
    deepLip: true,
  },
  peregrine: {
    n: 5,
    pair: 0.17,
    w: 0.019,
    th: 0.027,
    hubW: 1.6,
    dish: 0.065,
    twist: 0,
    lug: 5,
    spoke: ['metal', 'gun'],
    barrel: 0x0c0c0d,
    lip: ['metal', 'gun'],
  },
};
const geoCache = new Map(),
  texCache = new Map();
const matOf = (M, s) => (s[0] === 'metal' ? M.metal(s[1]) : M.coated(s[1], s[2]));

function sidewallMat(M, text) {
  if (!texCache.has(text)) {
    const draw = (bump) => (c, w, h) => {
      c.fillStyle = bump ? '#000' : '#141414';
      c.fillRect(0, 0, w, h);
      if (!bump) {
        c.strokeStyle = '#1c1c1c';
        c.lineWidth = 3;
        for (const y of [10, h - 12]) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(w, y);
          c.stroke();
        }
      }
      c.fillStyle = bump ? '#fff' : '#3d3d3d';
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      const [brand, line, size] = text.split('|');
      c.font = '900 76px "Arial Black", Arial, sans-serif';
      c.fillText(brand, 40, h / 2 + 2);
      const x1 = 40 + c.measureText(brand).width + 60;
      c.font = 'italic 700 52px Arial, sans-serif';
      c.fillText(line, x1, h / 2 + 4);
      c.font = '700 40px Arial, sans-serif';
      c.fillText(size, x1 + c.measureText('M'.repeat(line.length + 1)).width * 1.25, h / 2 + 4);
    };
    const map = canvasTex(1024, 128, draw(false), { aniso: 16 }),
      bump = canvasTex(1024, 128, draw(true), { linear: true, aniso: 16 });
    for (const t of [map, bump]) {
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(-2, 1);
      t.offset.set(0.02, 0);
    }
    texCache.set(
      text,
      new THREE.MeshStandardMaterial({
        map,
        bumpMap: bump,
        bumpScale: 1.2,
        roughness: 0.86,
        metalness: 0,
      }),
    );
  }
  return texCache.get(text);
}
function treadMat() {
  if (!texCache.has('tread')) {
    const bump = canvasTex(
      128,
      256,
      (c, w, h) => {
        c.fillStyle = '#fff';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = '#000';
        c.lineWidth = 7;
        for (let i = -1; i < 3; i++) {
          c.beginPath();
          c.moveTo(i * 64 + 6, 0);
          c.lineTo(i * 64 + 40, 128);
          c.lineTo(i * 64 + 6, 256);
          c.stroke();
        }
      },
      { linear: true, aniso: 16 },
    );
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(44, 1);
    texCache.set(
      'tread',
      new THREE.MeshStandardMaterial({
        color: 0x101010,
        bumpMap: bump,
        bumpScale: 2.5,
        roughness: 0.9,
        metalness: 0,
      }),
    );
  }
  return texCache.get('tread');
}
function discMat() {
  if (!texCache.has('disc')) {
    const draw = (bump) => (c, w, h) => {
      c.fillStyle = bump ? '#fff' : '#5e6166';
      c.fillRect(0, 0, w, h);
      if (!bump) {
        for (let i = 0; i < 900; i++) {
          const v = 70 + Math.random() * 60;
          c.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
          c.fillRect(Math.random() * w, Math.random() * h, 2, 1);
        }
      }
      c.fillStyle = bump ? '#000' : '#0c0c0d';
      for (let k = 0; k < 4; k++) {
        c.beginPath();
        c.arc(8 + k * 14, 12 + k * 26, 4.2, 0, 7);
        c.fill();
      }
    };
    const map = canvasTex(64, 128, draw(false), { aniso: 16 }),
      bump = canvasTex(64, 128, draw(true), { linear: true });
    for (const t of [map, bump]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(28, 1);
    }
    texCache.set(
      'disc',
      new THREE.MeshStandardMaterial({
        map,
        bumpMap: bump,
        bumpScale: 1.5,
        roughness: 0.5,
        metalness: 0.55,
      }),
    );
  }
  return texCache.get('disc');
}
const smoothPts = (pts, n) =>
  new THREE.SplineCurve(pts.map((p) => new THREE.Vector2(p[0], p[1])))
    .getPoints(n)
    .map((v) => [v.x, v.y]);

function wheelGeo(carKey, axle, lod) {
  const ck = carKey + axle + lod;
  if (geoCache.has(ck)) return geoCache.get(ck);
  const W = PACK[carKey].wheels,
    a = W[axle],
    D = DESIGN[W.design],
    R = a.r,
    rr = a.rimR,
    s = a.tw / 2;
  const seg = lod === 0 ? 72 : lod === 1 ? 28 : 14;
  const b = new Bucket();
  // ---- tire: outer sidewall (lettered), tread with grooves, inner sidewall
  const sideProf = (sgn) =>
    smoothPts(
      [
        [rr - 0.006, s * 0.78],
        [rr + 0.01, s * 0.94],
        [rr + (R - rr) * 0.42, s * 1.0],
        [R - 0.04, s * 0.985],
        [R - 0.014, s * 0.88],
      ],
      lod === 0 ? 12 : 5,
    ).map(([r, h]) => [r, h * sgn]);
  const tread = [
    [R - 0.014, s * 0.88],
    [R - 0.004, s * 0.78],
    [R, s * 0.64],
  ];
  if (lod < 2)
    for (const gh of a.tw > 0.3 ? [0.42, 0.14, -0.14, -0.42] : [0.36, 0, -0.36]) {
      const h = gh * s;
      tread.push([R, h + 0.008], [R - 0.008, h + 0.005], [R - 0.008, h - 0.005], [R, h - 0.008]);
    }
  tread.push([R, -s * 0.64], [R - 0.004, -s * 0.78], [R - 0.014, -s * 0.88]);
  if (lod === 2) {
    b.add(
      'tire',
      lathe(
        [
          [rr * 0.7, s * 0.8],
          ...sideProf(1).filter((_, i) => i % 2 === 0),
          [R, s * 0.6],
          [R, -s * 0.6],
          [R - 0.03, -s],
          [rr, -s * 0.9],
        ],
        seg,
        'x',
        40,
      ),
    );
  } else {
    b.add('sidewall', lathe(sideProf(1), seg, 'x', 0));
    b.add('tread', lathe(tread, seg, 'x', 50));
    b.add('tire', lathe(sideProf(-1).reverse(), seg, 'x', 0));
  }
  if (lod === 2) {
    b.add(
      'rim',
      lathe(
        [
          [0, s * 0.5],
          [rr * 0.5, s * 0.45],
          [rr - 0.005, s * 0.8],
        ],
        seg,
        'x',
        30,
      ),
    );
    const r2 = { geo: b.merged(), cal: null };
    geoCache.set(ck, r2);
    return r2;
  }
  // ---- rim: barrel (seen from inside), outer lip, spokes, hub
  const xLip = s * 0.78,
    xHub = xLip - D.dish,
    rIn = rr - 0.03;
  b.add(
    'barrel',
    flip(
      lathe(
        [
          [rr - 0.014, -s * 0.82],
          [rr - 0.03, -s * 0.4],
          [rr - 0.036, s * 0.3],
          [rIn + 0.012, xLip - 0.02],
        ],
        seg,
        'x',
        0,
      ),
    ),
  );
  const lipD = D.deepLip ? 0.03 : 0.012;
  b.add(
    'lip',
    lathe(
      [
        [rIn + 0.006, xLip - 0.03 - lipD],
        [rIn + 0.012, xLip - lipD * 0.4],
        [rr - 0.004, xLip + 0.004],
        [rr + 0.004, xLip + 0.012],
        [rr + 0.004, xLip + 0.002],
        [rr - 0.008, xLip - 0.012],
      ],
      seg,
      'x',
      40,
    ),
  );
  const rh = 0.078,
    nPts = lod === 0 ? 9 : 4,
    secN = lod === 0 ? 3 : 1;
  const blade = (ang, off) => {
    const path = [];
    for (let i = 0; i < nPts; i++) {
      const t = i / (nPts - 1),
        rad = rh * 0.75 + (rIn + 0.012 - rh * 0.75) * t;
      const x =
        xHub + (xLip - 0.022 - lipD - xHub) * Math.pow(t, 1.6) - 0.008 * Math.sin(Math.PI * t);
      const th =
        ang +
        (D.split
          ? off * Math.pow(t, 0.8)
          : off
            ? Math.sign(off) * Math.asin(Math.min(0.95, (Math.abs(off) * rr * 0.6) / rad))
            : 0) +
        D.twist * t * t;
      const wS = D.w * (D.hubW + (1 - D.hubW) * Math.min(1, t * 1.6));
      path.push({
        p: [x, Math.cos(th) * rad, Math.sin(th) * rad],
        s: [wS / D.w, 1 + 0.5 * (1 - t)],
      });
    }
    return sweep(path, sect.rrect(D.w, D.th, Math.min(D.w, D.th) * 0.32, secN), {
      up: [1, 0, 0],
      caps: false,
      crease: 50,
    });
  };
  for (let i = 0; i < D.n; i++) {
    const ang = (i / D.n) * Math.PI * 2;
    if (D.pair) {
      b.add('spoke', blade(ang, D.pair));
      b.add('spoke', blade(ang, -D.pair));
    } else b.add('spoke', blade(ang, 0));
    if (D.pocket && lod === 0) b.add('barrel', blade(ang, 0), { s: [0.96, 0.8, 0.8] });
  }
  b.add(
    'spoke',
    lathe(
      [
        [0.0, xHub + 0.016],
        [0.058, xHub + 0.016],
        [rh, xHub + 0.006],
        [rh + 0.018, xHub - 0.012],
        [rh + 0.02, xHub - 0.05],
        [0.06, xHub - 0.07],
      ],
      lod === 0 ? 36 : 14,
      'x',
      35,
    ),
  );
  if (D.aero && lod === 0)
    b.add(
      'carbon',
      lathe(
        [
          [rIn - 0.03, xLip - 0.05],
          [rIn + 0.008, xLip - 0.032],
          [rIn + 0.008, xLip - 0.04],
          [rIn - 0.03, xLip - 0.058],
        ],
        seg,
        'x',
        40,
      ),
    );
  const capG = new THREE.CircleGeometry(0.05, 28);
  capG.rotateY(Math.PI / 2);
  capG.translate(xHub + 0.0175, 0, 0);
  b.add('cap', capG);
  if (lod === 0) {
    if (D.lug)
      for (let i = 0; i < D.lug; i++) {
        const an = (i / D.lug) * Math.PI * 2 + 0.3;
        b.add('lug', cyl(0.0105, 0.0105, 0.022, 6, 'x'), {
          p: [xHub + 0.012, Math.cos(an) * 0.066, Math.sin(an) * 0.066],
        });
      }
    else {
      b.add('lug', cyl(0.036, 0.03, 0.03, 12, 'x'), { p: [xHub + 0.028, 0, 0] });
      b.add('lugRing', cyl(0.05, 0.05, 0.012, 24, 'x'), { p: [xHub + 0.02, 0, 0] });
    }
    b.add('tire', cyl(0.004, 0.003, 0.03, 6, 'y'), { p: [xLip - 0.03, rIn - 0.004, 0] }); // valve stem
  }
  // ---- brake disc + bell (spin with the wheel)
  const rd = rr * (axle === 'front' ? 0.82 : 0.78),
    ri = rd * 0.6,
    xd = xHub - 0.062,
    dseg = lod === 0 ? 56 : 20;
  b.add(
    'disc',
    lathe(
      [
        [ri, xd + 0.017],
        [rd, xd + 0.017],
      ],
      dseg,
      'x',
      0,
    ),
  );
  b.add(
    'disc',
    flip(
      lathe(
        [
          [ri, xd - 0.017],
          [rd, xd - 0.017],
        ],
        dseg,
        'x',
        0,
      ),
    ),
  );
  b.add(
    'discEdge',
    lathe(
      [
        [rd, xd + 0.017],
        [rd, xd + 0.006],
        [rd - 0.012, xd + 0.005],
        [rd - 0.012, xd - 0.005],
        [rd, xd - 0.006],
        [rd, xd - 0.017],
      ],
      dseg,
      'x',
      30,
    ),
  );
  b.add(
    'bell',
    lathe(
      [
        [0.075, xHub - 0.04],
        [ri * 0.7, xd + 0.03],
        [ri + 0.004, xd + 0.02],
        [ri + 0.004, xd + 0.017],
      ],
      dseg,
      'x',
      30,
    ),
  );
  // ---- caliper (fixed): arc block straddling the disc; built for the FRONT-LEFT position, callers mirror the angle
  const c = new Bucket();
  const half = ((axle === 'front' ? 50 : 37) * Math.PI) / 180,
    ca = lod === 0 ? 14 : 6,
    rc = rd - 0.028;
  const cpath = [];
  for (let i = 0; i <= ca; i++) {
    const t = i / ca,
      th = -half + 2 * half * t,
      e = 0.82 + 0.18 * Math.sin(Math.PI * t);
    cpath.push({ p: [xd + 0.006, Math.cos(th) * rc, Math.sin(th) * rc], s: [1, e] });
  }
  c.add(
    'caliper',
    sweep(cpath, sect.rrect(0.108, 0.082, 0.018, lod === 0 ? 3 : 1), {
      up: [1, 0, 0],
      caps: true,
      crease: 45,
    }),
  );
  if (lod === 0) {
    c.add(
      'pad',
      lathe(
        [
          [rd - 0.06, xd + 0.028],
          [rd - 0.003, xd + 0.028],
          [rd - 0.003, xd + 0.018],
          [rd - 0.06, xd + 0.018],
        ],
        12,
        'x',
        30,
        half * 1.5,
        Math.PI * 1.5 - half * 0.75,
      ),
    );
    c.add(
      'upright',
      lathe(
        [
          [0.03, xd - 0.02],
          [0.085, xd - 0.03],
          [0.1, xd - 0.07],
          [0.06, xd - 0.16],
          [0.03, xd - 0.16],
        ],
        16,
        'x',
        40,
      ),
    );
    c.add(
      'shield',
      flip(
        lathe(
          [
            [ri * 0.5, xd - 0.05],
            [rd * 1.02, xd - 0.045],
          ],
          28,
          'x',
          0,
        ),
      ),
    );
  }
  const res = { geo: b.merged(), cal: c.merged(), rd, xd, rc, xHub, half };
  geoCache.set(ck, res);
  return res;
}

export function buildWheel(carKey, axle, opts = {}) {
  const side = opts.side ?? 1,
    M = getMats(),
    pk = PACK[carKey],
    W = pk.wheels,
    a = W[axle],
    D = DESIGN[W.design];
  const node = new THREE.Group(),
    caliper = new THREE.Group(),
    lodN = new THREE.LOD(),
    lodC = new THREE.LOD();
  const spoke = matOf(M, D.spoke),
    lip = matOf(M, D.lip);
  const mats = {
    tire: M.rubber(0x0d0d0d),
    tread: treadMat(),
    sidewall: sidewallMat(M, `${TIRE_BRAND.name}|${TIRE_BRAND.lines[W.tireLine]}|${a.size}`),
    spoke,
    lip,
    barrel: M.plastic(D.barrel, 'piano'),
    carbon: M.carbon(),
    cap: decalCap(pk.brand),
    lug: M.metal('dark'),
    lugRing: M.coated(0xb0141a, 'satin'),
    disc: discMat(),
    discEdge: M.metal('steel'),
    bell: M.metal('gun'),
    rim: M.metal('dark'),
    caliper: M.coated(W.caliper, 'gloss'),
    pad: M.plastic(0x1a1a1a),
    upright: M.metal('cast'),
    shield: M.plastic(0x050505),
  };
  const tris = [];
  const dist = [0, 12, 40];
  for (const L of [0, 1, 2]) {
    const g = wheelGeo(carKey, axle, L),
      grp = new THREE.Group();
    let n = 0;
    for (const k in g.geo) {
      const m = new THREE.Mesh(g.geo[k], mats[k] || spoke);
      m.castShadow = L < 2 && (k === 'tread' || k === 'sidewall' || k === 'tire' || k === 'spoke');
      grp.add(m);
      n += g.geo[k].attributes.position.count / 3;
    }
    lodN.addLevel(grp, dist[L]);
    const cg = new THREE.Group();
    if (g.cal)
      for (const k in g.cal) {
        cg.add(new THREE.Mesh(g.cal[k], mats[k]));
        n += g.cal[k].attributes.position.count / 3;
      }
    if (L === 0 && g.cal) {
      // caliper lettering
      const wt = wordTex(
        W.caliperText,
        W.caliper === 0x111214 || W.caliper === 0x101113
          ? '#e8e8e8'
          : W.caliper === 0xe8c21a || W.caliper === 0xc9a227
            ? '#111'
            : '#f2f2f2',
        '900 92px Arial, sans-serif',
        6,
      );
      const h = 0.03,
        pl = new THREE.Mesh(
          new THREE.PlaneGeometry(h * wt.aspect, h),
          decalMat(wt.tex, { matte: true }),
        );
      pl.rotation.set(0, Math.PI / 2, 0);
      pl.position.set(g.xd + 0.006 + 0.0548, g.rc + 0.004, 0);
      cg.add(pl);
    }
    lodC.addLevel(cg, dist[L]);
    tris.push(Math.round(n));
  }
  node.add(lodN);
  caliper.add(lodC);
  // caliper angle: front axle -> behind the hub (toward -Z), rear axle -> ahead of it (+Z); arc center was built at +Y
  const ang = (axle === 'front' ? -1 : 1) * 1.75;
  lodC.rotation.x = ang * (side > 0 ? 1 : -1);
  if (side < 0) {
    lodN.rotation.y = Math.PI;
    caliper.rotation.y = Math.PI;
  }
  return {
    node,
    caliper,
    radius: a.r,
    width: a.tw,
    tris,
    x: a.x * side,
    z: a.z,
    side,
    front: axle === 'front',
  };
}
const capMats = new Map();
function decalCap(brand) {
  if (!capMats.has(brand))
    capMats.set(
      brand,
      new THREE.MeshStandardMaterial({
        map: emblemTex(brand, true),
        metalness: 0.8,
        roughness: 0.25,
      }),
    );
  return capMats.get(brand);
}
/** Dark wheel-well liner (half cylinder tub) for one wheel, in car coordinates. */
export function wellLiner(z, y, R, xIn, xOut, seg = 24) {
  const b = new Bucket();
  b.add(
    'liner',
    flip(
      lathe(
        [
          [R, xIn],
          [R, xOut],
        ],
        seg,
        'x',
        0,
        Math.PI * 1.24,
        Math.PI * 0.88,
      ),
    ),
    { p: [0, y, z] },
  );
  const disc = new THREE.CircleGeometry(R, seg, -Math.PI * 0.12, Math.PI * 1.24);
  disc.rotateY(Math.PI / 2);
  disc.translate(xIn, y, z);
  b.add('liner', uvBox(disc));
  return b.merged().liner;
}
export { mergeGeometries };

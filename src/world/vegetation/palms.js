// Palms: coconut, royal, sabal (cabbage), date, queen, palmetto. Pure geometry builders.
// buildPalm({ species, seed, height, lod }) -> { trunk, fronds, height, top, tris }  (two geometries: bark material, leaf material)
// lod 0 = full detail, 1 = mid (about a quarter of the triangles). Every seed gives a different plant: height, lean, bow, frond count,
// frond length and droop, dead fronds, fruit, wear.
import * as THREE from 'three';
import { GB, tube, blob, rng, UP } from './geom.js';
import { BARK, CELL, SWATCH, leafUV, barkU } from './textures.js';

const V3 = THREE.Vector3;
export const PALM_SPECIES = ['coconut', 'royal', 'sabal', 'date', 'queen', 'palmetto'];

const SP = {
  coconut: {
    H: [8, 15],
    r0: 0.2,
    rTop: 0.14,
    flare: 1.15,
    lean: [0.12, 0.38],
    bow: 0.6,
    bark: BARK.coconut,
    rep: 1.2,
    nF: [27, 35],
    L: [4.4, 5.8],
    elev: [-0.35, 1.38],
    droop: [1.3, 2.4],
    fold: 0.42,
    foldOut: 0.6,
    w: 0.78,
    mesh: true,
    roots: 16,
    infl: true,
    cell: CELL.coconut,
    dead: [3, 7],
    stubs: 10,
  },
  royal: {
    H: [13, 19],
    r0: 0.27,
    rTop: 0.2,
    flare: 0.9,
    lean: [0.0, 0.04],
    bow: 0.1,
    bark: BARK.royal,
    rep: 2.0,
    nF: [23, 30],
    L: [5.0, 6.4],
    elev: [-0.15, 1.35],
    droop: [1.0, 1.9],
    fold: -0.15,
    foldOut: 0.9,
    w: 0.86,
    roots: 14,
    infl: true,
    cell: CELL.plume,
    plume: true,
    dead: [0, 1],
    shaft: 0.18,
  },
  sabal: {
    H: [6, 12],
    r0: 0.22,
    rTop: 0.2,
    flare: 0.45,
    roots: 12,
    lean: [0.0, 0.1],
    bow: 0.25,
    bark: BARK.sabal,
    rep: 1.6,
    nF: [26, 36],
    fan: true,
    fanR: [1.0, 1.3],
    pet: [1.5, 2.3],
    dead: [3, 9],
    boots: true,
  },
  date: {
    H: [6, 11],
    r0: 0.34,
    rTop: 0.3,
    flare: 0.5,
    roots: 14,
    lean: [0.0, 0.08],
    bow: 0.15,
    bark: BARK.date,
    rep: 1.4,
    nF: [48, 64],
    L: [3.6, 4.8],
    elev: [-0.25, 1.2],
    droop: [0.6, 1.3],
    fold: 0.55,
    foldOut: 0.35,
    w: 0.6,
    cell: CELL.date,
    dead: [0, 3],
    stubs: 22,
    dates: true,
  },
  queen: {
    H: [9, 13],
    r0: 0.18,
    rTop: 0.15,
    flare: 0.6,
    lean: [0.0, 0.12],
    bow: 0.35,
    bark: BARK.queen,
    rep: 1.0,
    nF: [17, 24],
    L: [3.6, 4.8],
    elev: [-0.2, 1.3],
    droop: [1.8, 2.8],
    fold: -0.35,
    foldOut: 1.25,
    w: 0.8,
    mesh: true,
    roots: 10,
    cell: CELL.plume,
    plume: true,
    dead: [2, 5],
    stubs: 6,
    fruit: true,
  },
  palmetto: {
    H: [0.1, 0.7],
    r0: 0.14,
    rTop: 0.13,
    flare: 0.2,
    lean: [0.0, 0.25],
    bow: 0,
    bark: BARK.sabal,
    rep: 0.8,
    nF: [11, 18],
    fan: true,
    fanR: [0.6, 0.85],
    pet: [0.9, 1.6],
    dead: [1, 4],
    low: true,
  },
};

const lerp = (a, b, t) => a + (b - a) * t;
const rr = (R, [a, b]) => lerp(a, b, R());

// pinnate frond: leaflet strips on both sides of a drooping, twisting rachis; plumose species get a second leaflet plane
function pinnateFrond(gb, R, base, az, elev, L, o, crownH, lod) {
  const segs = lod ? 5 : (o.segs ?? 10),
    across = lod ? 1 : 2,
    droop = o.droop,
    ph = R() * 6.28;
  const pts = [],
    Ts = [];
  let d = new V3(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)),
    p = base.clone();
  const side0 = new V3(-Math.sin(az), 0, Math.cos(az));
  for (let s = 0; s <= segs; s++) {
    pts.push(p.clone());
    Ts.push(d.clone());
    const t = s / segs,
      k = (droop * (0.35 + 1.4 * t)) / segs;
    d.applyAxisAngle(side0, -k).normalize(); // bend down toward the ground (rotate about the side axis)
    p.addScaledVector(d, L / segs);
  }
  const twist = (R() - 0.5) * 0.7 + (o.twist ?? 0),
    col = o.col || [1, 1, 1];
  const planes =
    o.plume && !lod
      ? [
          [o.fold, o.foldOut],
          [o.fold + 0.75, o.foldOut * 0.6],
        ]
      : [[o.fold, o.foldOut]];
  for (let pl = 0; pl < planes.length; pl++) {
    const [fold, foldOut] = planes[pl];
    for (const sg of [-1, 1]) {
      const base0 = gb.count;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs,
          T = Ts[s],
          tw = twist * t * sg * 0.5;
        let S = new V3().crossVectors(T, UP);
        if (S.lengthSq() < 1e-4) S.copy(side0);
        S.normalize();
        const U = new V3().crossVectors(S, T).normalize();
        S.applyAxisAngle(T, tw);
        U.applyAxisAngle(T, tw);
        const w =
          ((o.w * L) / 4.5) *
          Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.9)), 0.7) *
          (1 - 0.25 * t) *
          (pl ? 0.85 : 1);
        let q = pts[s].clone();
        for (let k = 0; k <= across; k++) {
          const f =
            fold + foldOut * (k / Math.max(1, across)) * (0.6 + 0.6 * t) + (o.dead ? 0.15 : 0);
          const dir = S.clone()
            .multiplyScalar(sg * Math.cos(f))
            .addScaledVector(U, -Math.sin(f));
          if (k > 0) q = q.clone().addScaledVector(dir, w / across);
          const n = new V3()
            .crossVectors(dir, T)
            .multiplyScalar(sg)
            .normalize()
            .lerp(UP, 0.35)
            .normalize();
          const [u, v] = leafUV(
            o.cell,
            Math.min(0.995, 0.01 + k / across),
            Math.min(0.995, 0.005 + t * 0.99),
          );
          const shade = (0.5 + 0.5 * Math.min(1, t * 1.5)) * (1 - 0.12 * (k / Math.max(1, across))); // crown self-shadow: frond bases inside the crown and the folded inner leaflets are darker
          gb.vert(
            q,
            n,
            u,
            v,
            [col[0] * shade, col[1] * shade, col[2] * shade],
            [crownH, t * (0.4 + (0.6 * k) / across), ph],
          );
        }
      }
      for (let s = 0; s < segs; s++)
        for (let k = 0; k < across; k++) {
          const W = across + 1,
            a = base0 + s * W + k;
          if (sg > 0) gb.quad(a, a + 1, a + W + 1, a + W);
          else gb.quad(a, a + W, a + W + 1, a + 1);
        }
    }
  }
  if (!lod) {
    // rachis: two crossed tapering ribbons (visible edge-on and from below)
    const [u0, v0] = leafUV(CELL.fan, SWATCH.petiole[0] + 0.01, SWATCH.petiole[1] + 0.01),
      [u1, v1] = leafUV(CELL.fan, SWATCH.petiole[2] - 0.01, SWATCH.petiole[3] - 0.01);
    for (const ax of [0, 1]) {
      const b0 = gb.count;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs,
          T = Ts[s];
        let S = new V3().crossVectors(T, UP);
        if (S.lengthSq() < 1e-4) S.copy(side0);
        S.normalize();
        const U = new V3().crossVectors(S, T).normalize();
        const off = (ax ? S : U).clone().multiplyScalar(((0.03 * L) / 4.5) * (1 - 0.8 * t));
        const n = ax ? U : S;
        gb.vert(pts[s].clone().add(off), n, u0, lerp(v0, v1, t), col, [crownH, t * 0.4, ph]);
        gb.vert(pts[s].clone().sub(off), n, u1, lerp(v0, v1, t), col, [crownH, t * 0.4, ph]);
      }
      gb.grid(b0, segs, 1);
    }
  }
  return pts[segs];
}

// costapalmate fan leaf: pleated disc on a petiole, halves drooping from the costa
export function fanLeaf(gb, R, base, az, elev, petL, rad, o, crownH, lod) {
  const ph = R() * 6.28,
    col = o.col || [1, 1, 1],
    cell = o.dead ? CELL.deadfan : CELL.fan;
  // petiole
  const d = new V3(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)),
    C = base.clone().addScaledVector(d, petL);
  C.y -= petL * 0.08 * (o.dead ? 0 : 1);
  if (!lod) {
    const [u0, v0] = leafUV(CELL.fan, SWATCH.petiole[0] + 0.01, SWATCH.petiole[1] + 0.01),
      [u1, v1] = leafUV(CELL.fan, SWATCH.petiole[2] - 0.01, SWATCH.petiole[3] - 0.01);
    const S = new V3().crossVectors(d, UP).normalize();
    if (!isFinite(S.x) || S.lengthSq() < 0.1) S.set(1, 0, 0);
    for (const off of [
      S.clone().multiplyScalar(0.03),
      new V3().crossVectors(S, d).normalize().multiplyScalar(0.03),
    ]) {
      const b = gb.count;
      gb.vert(base.clone().add(off), UP, u0, v0, col, [crownH, 0, ph]);
      gb.vert(base.clone().sub(off), UP, u1, v0, col, [crownH, 0, ph]);
      gb.vert(C.clone().add(off.clone().multiplyScalar(0.5)), UP, u0, v1, col, [crownH, 0.3, ph]);
      gb.vert(C.clone().sub(off.clone().multiplyScalar(0.5)), UP, u1, v1, col, [crownH, 0.3, ph]);
      gb.quad(b, b + 1, b + 3, b + 2);
    }
  }
  // fan frame: A = costa direction (continues the petiole, flattened), F = fan normal (tilted up), B = across
  const A = new V3(d.x, d.y * 0.3 + (o.dead ? -0.9 : 0.15), d.z).normalize(),
    Bv = new V3().crossVectors(A, UP).normalize(),
    F = new V3().crossVectors(Bv, A).normalize();
  const tilt = o.dead ? 0 : (R() - 0.3) * 0.5;
  F.applyAxisAngle(Bv, tilt);
  A.applyAxisAngle(Bv, tilt);
  const rings = lod ? 2 : 3,
    J = lod ? 12 : 22,
    base0 = gb.count,
    pleat = o.dead ? 0.02 : 0.07,
    foldK = o.dead ? 0.9 : 0.35 + R() * 0.3,
    droopK = o.dead ? 0.1 : 0.25 + R() * 0.2;
  const center = C.clone().addScaledVector(A, rad * 0.15);
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j <= J; j++) {
      const r = i / rings,
        th = (j / J) * Math.PI * 2,
        ca = Math.cos(th),
        sa = Math.sin(th);
      const a = ca * r * rad,
        b = sa * r * rad;
      // costapalmate: along-costa bias, both halves fold down, outer edge droops, pleats alternate
      let h =
        -foldK * Math.abs(b) * 0.8 - droopK * r * r * rad + (j % 2 ? pleat : -pleat) * r * rad;
      if (a < 0) h -= Math.abs(a) * 0.25;
      const pos = center.clone().addScaledVector(A, a).addScaledVector(Bv, b).addScaledVector(F, h);
      const n = F.clone()
        .addScaledVector(Bv, sa * 0.4 * Math.sign(b))
        .normalize()
        .lerp(UP, 0.3)
        .normalize();
      const [u, v] = leafUV(cell, 0.5 + ca * r * 0.47, 0.5 + sa * r * 0.47);
      gb.vert(pos, n, u, v, col, [crownH, r * 0.9, ph]);
    }
  gb.grid(base0, rings, J);
}

export function buildPalm(opts = {}) {
  const species = SP[opts.species] ? opts.species : 'coconut',
    P = SP[species],
    R = rng((opts.seed ?? 1) * 7.31 + PALM_SPECIES.indexOf(species) * 101 + 3),
    lod = opts.lod | 0;
  const H = opts.height ? Math.max(P.H[0] * 0.8, Math.min(P.H[1] * 1.15, opts.height)) : rr(R, P.H),
    az0 = R() * Math.PI * 2;
  const lean = opts.lean ?? rr(R, P.lean),
    bow = (R() - 0.5) * 2 * P.bow;
  const trunk = new GB(),
    fr = new GB();
  // spine: leans from the base, coconut palms curve back up toward the light near the top
  const nT = lod ? Math.max(4, Math.round(H / 1.2)) : Math.max(6, Math.round(H / 0.32)),
    pts = [];
  const ld = new V3(Math.cos(az0), 0, Math.sin(az0)),
    bd = new V3(-ld.z, 0, ld.x);
  {
    let p = new V3(),
      ang = Math.atan(lean * 2.2);
    const step = H / nT;
    for (let i = 0; i <= nT; i++) {
      pts.push(p.clone());
      const t = i / nT,
        a =
          ang * (species === 'coconut' ? 1 - 0.75 * t : 1 - 0.3 * t) +
          bow * 0.12 * Math.sin(t * 6.283);
      const dir = new V3(0, Math.cos(a), 0)
        .addScaledVector(ld, Math.sin(a))
        .addScaledVector(bd, bow * 0.06 * Math.cos(t * 4.0))
        .normalize();
      p.addScaledVector(dir, step);
    }
  }
  const top = pts[pts.length - 1].clone(),
    radial = lod ? 6 : 11;
  const shaftStart = P.shaft ? Math.floor(nT * (1 - 3.0 / H)) : 1e9;
  let arc = 0;
  const arcs = pts.map((q, i) => (arc += i ? q.distanceTo(pts[i - 1]) : 0));
  const rootSeed = R() * 10,
    stain = 0.75 + R() * 0.2;
  const radius = (i, a) => {
    const t = i / nT,
      y = arcs[i];
    let r = lerp(P.r0, P.rTop, Math.pow(t, 0.8));
    if (species === 'royal') r *= 1 + 0.22 * Math.exp(-Math.pow((t - 0.55) / 0.22, 2)); // spindle bulge
    if (species === 'date' && P.stubs) r *= 1 + 0.06 * Math.sin(y * 4.5); // knobbly
    if (i >= shaftStart) {
      const ts = (arcs[i] - arcs[shaftStart]) / Math.max(0.1, arcs[nT] - arcs[shaftStart]);
      r = P.rTop * (1.42 - 0.22 * ts + 0.1 * Math.sin(ts * 3.14));
    }
    r *=
      1 +
      P.flare * Math.exp(-y / 0.45) * (1 + 0.35 * Math.sin(a * 5 + rootSeed) * Math.exp(-y / 0.25)); // flared base with root bumps
    if (species === 'coconut' || species === 'queen') {
      const ph = (y * (species === 'queen' ? 18 : 13)) / P.rep + 0.3 * Math.sin(a * 2 + y);
      r *=
        1 +
        (species === 'queen' ? 0.03 : 0.055) *
          (Math.pow(Math.abs(Math.sin(ph * Math.PI)), 0.35) - 0.6);
    } // ring scar relief
    return r;
  };
  const lichSeed = R() * 9,
    lichAmt = R();
  const trunkCol = (i, j) => {
    const y = arcs[i],
      soil = Math.exp(-y / 0.6),
      a = (j / radial) * 6.283;
    const band =
      1 +
      0.1 * Math.sin(y * 0.8 + lichSeed) +
      0.05 * Math.sin(y * 2.9 + lichSeed * 2) -
      0.08 * Math.max(0, y / H - 0.75); // weathering along the height
    const lich =
      lichAmt *
      Math.max(
        0,
        Math.sin(a * 1.3 + lichSeed) * Math.sin(y * 1.7 + lichSeed) * Math.sin(a * 0.7 + y * 0.9) -
          0.15,
      ) *
      2.2;
    const k = stain * band * (1 - 0.35 * soil);
    return [
      k * (1 + 0.05 * soil) * (1 + 0.12 * lich),
      k * (1 - 0.04 * soil) * (1 + 0.2 * lich),
      k * (1 - 0.1 * soil) * (1 + 0.02 * lich),
    ];
  };
  const wind = (i) => [arcs[i] * 0.98, 0, 0];
  const main = pts.slice(0, Math.min(pts.length, shaftStart + 1));
  tube(
    trunk,
    main,
    radial,
    radius,
    (i, j) => [barkU(P.bark, j / radial), arcs[i] / P.rep],
    trunkCol,
    wind,
  );
  if (P.shaft) {
    const sp = pts.slice(shaftStart);
    tube(
      trunk,
      sp,
      radial,
      (i, a) => radius(i + shaftStart, a),
      (i, j) => [barkU(BARK.shaft, j / radial), arcs[i + shaftStart] / 1.5],
      () => [1, 1, 1],
      (i) => wind(i + shaftStart),
      true,
    );
  } else {
    // closing cap of fiber at the crown
    const c = trunk.vert(
        top.clone().add(new V3(0, 0.1, 0)),
        UP,
        barkU(BARK.fiber, 0.5),
        0.5,
        [0.9, 0.9, 0.9],
        [H, 0, 0],
      ),
      b = trunk.count - 1 - (radial + 1);
    for (let j = 0; j < radial; j++) trunk.tri(b + j, b + j + 1, c);
  }
  const crownH = arcs[arcs.length - 1];
  // frond stubs (old cut petiole bases) under the crown; sabal "boot-jacks" on the upper trunk
  const stub = (pos, dir, len, w, col) => {
    const q = [
      pos,
      pos.clone().addScaledVector(dir, len * 0.5),
      pos.clone().addScaledVector(dir, len),
    ];
    tube(
      trunk,
      q,
      4,
      (i) => w * (1 - 0.45 * i),
      (i, j) => [barkU(BARK.fiber, j / 4), i * 0.15],
      () => col,
      () => [pos.y, 0, 0],
    );
  };
  const trunkAt = (y) => {
    let i = 0;
    while (i < arcs.length - 1 && arcs[i] < y) i++;
    return i;
  };
  if (!lod && P.stubs)
    for (let k = 0; k < P.stubs; k++) {
      const y = crownH - 0.15 - R() * (species === 'date' ? 1.6 : 0.8),
        i = trunkAt(y),
        a = k * 2.4 + R(),
        out = new V3(Math.cos(a), 0, Math.sin(a));
      stub(
        pts[i].clone().addScaledVector(out, radius(i, a) * 0.8),
        out
          .clone()
          .multiplyScalar(0.55)
          .add(new V3(0, 0.83, 0))
          .normalize(),
        0.25 + R() * 0.25,
        0.07 + R() * 0.04,
        [0.85 + R() * 0.2, 0.8 + R() * 0.15, 0.7],
      );
    }
  if (!lod && P.boots) {
    const y0 = crownH * (0.25 + R() * 0.3);
    for (let y = y0; y < crownH - 0.2; y += 0.17) {
      const i = trunkAt(y),
        a = y * 9.3 + R() * 0.6,
        out = new V3(Math.cos(a), 0, Math.sin(a));
      stub(
        pts[i].clone().addScaledVector(out, radius(i, a) * 0.85),
        out
          .clone()
          .multiplyScalar(0.7)
          .add(new V3(0, 0.7, 0))
          .normalize(),
        0.22 + R() * 0.2,
        0.06 + R() * 0.03,
        [0.9 + R() * 0.15, 0.85, 0.75],
      );
    }
  }

  if (!lod && P.roots)
    for (let k = 0; k < P.roots; k++) {
      // exposed root mass at ground level
      const a = (k * 6.283) / P.roots + R() * 0.4,
        out = new V3(Math.cos(a), 0, Math.sin(a)),
        r0 = radius(0, a) * 0.9,
        L = 0.25 + R() * 0.45;
      const q = [
        new V3(out.x * r0 * 0.8, 0.12 + R() * 0.1, out.z * r0 * 0.8),
        new V3(out.x * (r0 + L * 0.5), 0.05, out.z * (r0 + L * 0.5)),
        new V3(out.x * (r0 + L), -0.04, out.z * (r0 + L)),
      ];
      tube(
        trunk,
        q,
        4,
        (i) => (0.05 + R() * 0.02) * (1 - i * 0.35),
        (i, j) => [barkU(P.bark, j / 4), i * 0.2],
        () => [0.8, 0.74, 0.66],
        () => [0, 0, 0],
      );
    }
  if (!lod && P.mesh) {
    // fibrous leaf-sheath mesh wrapped around the top of the trunk under the crown
    const i0 = trunkAt(arcs[nT] - 1.0);
    const mp = pts.slice(i0);
    tube(
      trunk,
      mp,
      radial,
      (i, a) => radius(i + i0, a) * (1.22 + 0.12 * Math.sin(a * 3 + i)),
      (i, j) => [barkU(BARK.fiber, j / radial), i * 0.4],
      () => [0.95, 0.85, 0.72],
      (i) => wind(i + i0),
    );
  }
  if (!lod && P.infl)
    for (let k = 0; k < 2 + ((R() * 3) | 0); k++) {
      // flower stalks (spadices) hanging below the crown
      const a = R() * 6.28,
        d = new V3(Math.cos(a) * 0.8, -0.35, Math.sin(a) * 0.8).normalize(),
        b0 = top.clone().add(new V3(Math.cos(a) * 0.2, -0.35, Math.sin(a) * 0.2)),
        e = b0.clone().addScaledVector(d, 0.7);
      stub(b0, d, 0.7, 0.035, [1.3, 1.15, 0.65]);
      for (let m = 0; m < 7; m++) {
        const dd = d
          .clone()
          .add(new V3((R() - 0.5) * 0.9, -0.6 - R() * 0.5, (R() - 0.5) * 0.9))
          .normalize();
        stub(
          e.clone().addScaledVector(d, -m * 0.06),
          dd,
          0.35 + R() * 0.25,
          0.012,
          [1.4, 1.25, 0.7],
        );
      }
    }

  // crown: its own random stream and the same frond count at every LOD, so a far palm has exactly the near palm's crown (no shape pop)
  const RC = rng((opts.seed ?? 1) * 5.77 + PALM_SPECIES.indexOf(species) * 37 + 11);
  // crown
  const nF = Math.round(rr(RC, P.nF)),
    fl = opts.frondLen ?? 1,
    dm = opts.droop ?? 1;
  const crownC = top.clone().add(new V3(0, P.low ? 0.05 : 0.15, 0));
  for (let f = 0; f < nF; f++) {
    const golden = f * 2.39996 + RC() * 0.35,
      t = f / nF; // phyllotaxis; t=0 youngest (upright) .. 1 oldest (lowest)
    const age = Math.pow(RC(), 0.8) * 0.5 + t * 0.5;
    const ao = 1 - age * 0.3,
      col = [
        (1 - age * 0.02 + (RC() - 0.5) * 0.08) * ao,
        (1 - age * 0.04 + (RC() - 0.5) * 0.06) * ao,
        (1 - age * 0.3) * ao,
      ]; // lower, older fronds sit in the crown's shade
    if (P.fan) {
      const elev = P.low ? lerp(1.25, 0.25, age) : lerp(1.15, -0.35, age);
      const base = crownC
        .clone()
        .add(new V3((RC() - 0.5) * 0.15, -age * (P.low ? 0 : 0.4), (RC() - 0.5) * 0.15));
      fanLeaf(
        fr,
        RC,
        base,
        golden,
        elev,
        rr(RC, P.pet) * (P.low ? 1 : 0.9 + 0.2 * (1 - age)),
        rr(RC, P.fanR),
        { col },
        crownH,
        lod,
      );
    } else {
      const elev = lerp(P.elev[1], P.elev[0], age) + (RC() - 0.5) * 0.2,
        L = rr(RC, P.L) * fl * (1 - (t < 0.12 ? 0.3 * (1 - t / 0.12) : 0));
      const base = crownC
        .clone()
        .add(new V3(Math.cos(golden) * 0.12, -age * 0.35, Math.sin(golden) * 0.12));
      pinnateFrond(
        fr,
        RC,
        base,
        golden,
        elev,
        L,
        {
          droop: rr(RC, P.droop) * dm * (0.7 + age * 0.6),
          fold: P.fold,
          foldOut: P.foldOut,
          w: P.w,
          cell: P.cell,
          plume: P.plume,
          col,
          segs: species === 'date' ? 7 : 10,
        },
        crownH,
        lod,
      );
    }
  }
  // dead fronds hanging against the trunk (wear varies a lot per palm)
  const nDead = Math.round(rr(RC, P.dead) * (opts.wear ?? 1));
  for (let k = 0; k < nDead; k++) {
    const a = RC() * 6.28,
      base = crownC.clone().add(new V3(Math.cos(a) * 0.15, -0.3 - RC() * 0.4, Math.sin(a) * 0.15)),
      col = [0.95 + RC() * 0.15, 0.9 + RC() * 0.1, 0.8 + RC() * 0.15];
    if (P.fan)
      fanLeaf(
        fr,
        RC,
        base,
        a,
        P.low ? 0.05 + RC() * 0.2 : -1.2 - RC() * 0.3,
        rr(RC, P.pet) * 0.6,
        rr(RC, P.fanR) * 0.85,
        { dead: true, col },
        crownH,
        lod,
      );
    else
      pinnateFrond(
        fr,
        RC,
        base,
        a,
        -1.15 - RC() * 0.3,
        rr(RC, P.L) * 0.85,
        { droop: 0.25, fold: 0.5, foldOut: 0.6, w: P.w * 0.75, cell: CELL.dead, col, dead: true },
        crownH,
        lod,
      );
  }
  // fruit: coconuts in bunches under the crown, date strands, queen palm drupes
  const fruit = (c, n, sz, sw, spread, colr) => {
    for (let i = 0; i < n; i++) {
      const p = c
        .clone()
        .add(new V3((RC() - 0.5) * spread, -RC() * spread * 0.8, (RC() - 0.5) * spread));
      blob(
        fr,
        p,
        sz * (0.9 + RC() * 0.2),
        sz * (1.05 + RC() * 0.2),
        sz * (0.9 + RC() * 0.2),
        [...leafUV(CELL.fan, sw[0], sw[3]), ...leafUV(CELL.fan, sw[2], sw[1])],
        colr(),
        [crownH, 0.05, 0],
      );
    }
  };
  if (species === 'coconut' && RC() < 0.92) {
    const nb = 2 + ((RC() * 3) | 0);
    for (let b = 0; b < nb; b++) {
      const a = RC() * 6.28;
      fruit(
        crownC.clone().add(new V3(Math.cos(a) * 0.38, -0.5, Math.sin(a) * 0.38)),
        lod ? 3 : 6 + ((RC() * 8) | 0),
        0.125,
        SWATCH.husk,
        0.5,
        () => {
          const ripe = RC();
          return [0.85 + ripe * 0.3, 0.9 - ripe * 0.15, 0.7 - ripe * 0.2];
        },
      );
    }
  }
  if ((species === 'date' && RC() < 0.8) || (species === 'queen' && RC() < 0.7)) {
    const nb = 2 + ((RC() * 3) | 0);
    for (let b = 0; b < nb; b++) {
      const a = RC() * 6.28,
        c0 = crownC.clone().add(new V3(Math.cos(a) * 0.45, -0.6, Math.sin(a) * 0.45));
      fruit(
        c0,
        lod ? 6 : 26,
        species === 'date' ? 0.03 : 0.022,
        species === 'date' ? SWATCH.dates : SWATCH.fruit,
        0.55,
        () => [0.9 + RC() * 0.2, 0.85 + RC() * 0.2, 0.8],
      );
    }
  }
  const tg = trunk.build(),
    fg = fr.build();
  return { trunk: tg, fronds: fg, height: crownH, top, tris: trunk.tris + fr.tris, species };
}

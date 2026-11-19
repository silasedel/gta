// Wild trees for the swamp, hammocks, pine flats and coast: live oak (with Spanish moss), slash pine, bald cypress (buttress + knees),
// red mangrove (arching prop roots). buildTree({ kind, seed, lod, size }) -> { bark, leaf, height, tris }
import * as THREE from 'three';
import { GB, rng, UP, tube } from './geom.js';
import { CELL, BARK, barkU } from './textures.js';
import { branch, cluster, groundCard, cellRect } from './plantkit.js';

const V3 = THREE.Vector3;
export const TREE_KINDS = ['liveoak', 'gumbo', 'slashpine', 'cypress', 'mangrove', 'poinciana'];

// hanging Spanish moss: vertical strips under a limb point
function moss(gb, R, p, len) {
  const uvr = cellRect(CELL.moss, 0.1 + R() * 0.3, 0.6 + R() * 0.3, 0, 0.95),
    w = 0.35 + R() * 0.3,
    a = R() * 3.14;
  for (const da of [0, 1.57]) {
    const ax = new V3(Math.cos(a + da), 0, Math.sin(a + da)),
      b = gb.leaf.count,
      n = new V3(-ax.z, 0.3, ax.x).normalize();
    gb.leaf.vert(
      p.clone().addScaledVector(ax, -w / 2),
      n,
      uvr[0],
      uvr[3],
      [1, 1, 1],
      [p.y, 0.1, a],
    );
    gb.leaf.vert(p.clone().addScaledVector(ax, w / 2), n, uvr[2], uvr[3], [1, 1, 1], [p.y, 0.1, a]);
    gb.leaf.vert(
      p
        .clone()
        .addScaledVector(ax, w / 2)
        .add(new V3(0, -len, 0)),
      n,
      uvr[2],
      uvr[1],
      [1, 1, 1],
      [p.y, 1, a],
    );
    gb.leaf.vert(
      p
        .clone()
        .addScaledVector(ax, -w / 2)
        .add(new V3(0, -len, 0)),
      n,
      uvr[0],
      uvr[1],
      [1, 1, 1],
      [p.y, 1, a],
    );
    gb.leaf.quad(b, b + 1, b + 2, b + 3);
  }
}

export function buildTree(opts = {}) {
  const kind = TREE_KINDS.includes(opts.kind) ? opts.kind : 'liveoak',
    R = rng((opts.seed ?? 1) * 3.91 + TREE_KINDS.indexOf(kind) * 53 + 5),
    lod = opts.lod | 0,
    sz = opts.size ?? 1;
  const gb = { bark: new GB(), leaf: new GB() },
    ctr = new V3();
  let H = 0;
  const leafCol = (base) => {
    const g = 0.85 + R() * 0.3;
    return [base[0] * g, base[1] * g, base[2] * g];
  };
  if (kind === 'gumbo') {
    // gumbo limbo: copper-red peeling trunk forking low into a few upright sinuous limbs, open rounded crown
    const trunkH = (1.8 + R() * 1.2) * sz,
      Hc = (6 + R() * 3) * sz;
    H = trunkH + Hc * 0.7;
    ctr.set(0, trunkH + Hc * 0.45, 0);
    const P = {
      radial: 9,
      segLen: 0.6,
      children: [3, 3, 2],
      spread: 0.8,
      lenK: 0.55,
      rK: 0.62,
      up: 0.03,
      sag: 0.05,
      wobble: 0.4,
      childStart: 0.3,
      barkCol: [1.3, 0.82, 0.66],
      barkRep: 1.4,
      flare: 0.35,
      leafFrom: 2,
      leafPerSeg: 1.1,
      leafSpan: 0.8,
      onLeaf: (p) =>
        cluster(
          gb,
          R,
          p.clone().add(new V3(0, 0.2, 0)),
          (lod ? 2.0 : 1.35) * (0.8 + R() * 0.4),
          CELL.mangrove,
          ctr,
          leafCol([1.05, 1.1, 0.85]),
          lod ? 2 : 3,
          0.1,
          0.6,
        ),
    };
    const top = branch(
      gb,
      R,
      new V3(),
      new V3((R() - 0.5) * 0.25, 1, (R() - 0.5) * 0.25),
      trunkH,
      0.3 * sz,
      0,
      { ...P, children: [0], onLeaf: null },
      lod,
    );
    const nL = 3 + ((R() * 2) | 0);
    for (let k = 0; k < nL; k++) {
      const a = (k * 6.28) / nL + R() * 0.7;
      branch(
        gb,
        R,
        top.clone().add(new V3(0, -0.15, 0)),
        new V3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6),
        Hc * (0.55 + R() * 0.3),
        (0.16 + R() * 0.05) * sz,
        0,
        { ...P, children: [3, 2] },
        lod,
      );
    }
  } else if (kind === 'poinciana') {
    // royal poinciana: short pale trunk, low wide limbs, flat umbrella crown, flame-red bloom over fine leaves
    const trunkH = (2.0 + R() * 0.9) * sz,
      spread = (6 + R() * 2.5) * sz;
    H = trunkH + 3.4 * sz;
    ctr.set(0, trunkH + 2.2 * sz, 0);
    const bloom = 0.45 + R() * 0.25;
    const P = {
      radial: 8,
      segLen: 0.7,
      children: [4, 3, 2],
      spread: 1.0,
      lenK: 0.55,
      rK: 0.6,
      up: 0.04,
      sag: 0,
      wobble: 0.3,
      childStart: 0.3,
      barkCol: [0.86, 0.82, 0.76],
      barkRep: 1.4,
      flare: 0.45,
      leafFrom: 2,
      leafPerSeg: 1.3,
      leafSpan: 0.9,
      onLeaf: (p) => {
        const fl = R() < bloom;
        cluster(
          gb,
          R,
          p.clone().add(new V3(0, 0.35, 0)),
          (lod ? 2.1 : 1.45) * (0.8 + R() * 0.4),
          fl ? CELL.poinciana : CELL.mangrove,
          ctr,
          fl ? [1.05, 1, 1] : leafCol([0.9, 1.08, 0.8]),
          lod ? 2 : 3,
          0.12,
          0.6,
        );
      },
    };
    const top = branch(
      gb,
      R,
      new V3(),
      new V3((R() - 0.5) * 0.25, 1, (R() - 0.5) * 0.25),
      trunkH,
      0.3 * sz,
      0,
      { ...P, children: [0], onLeaf: null },
      lod,
    );
    const nL = 5 + ((R() * 3) | 0);
    for (let k = 0; k < nL; k++) {
      const a = (k * 6.28) / nL + R() * 0.5,
        el = 0.3 + R() * 0.25;
      branch(
        gb,
        R,
        top.clone().add(new V3(0, -0.15, 0)),
        new V3(Math.cos(a), el, Math.sin(a)),
        spread * (0.5 + R() * 0.3),
        (0.16 + R() * 0.05) * sz,
        0,
        { ...P, children: [4, 3, 2] },
        lod,
      );
    }
    if (!lod)
      for (let i = 0; i < 4; i++) {
        const a = R() * 6.28,
          d = R() * spread * 0.5;
        groundCard(
          gb,
          R,
          new V3(Math.cos(a) * d, 0, Math.sin(a) * d),
          0.5 + R() * 0.4,
          CELL.poinciana,
          [0.75, 0.6, 0.58],
        );
      } // fallen petals
  } else if (kind === 'liveoak') {
    const trunkH = (2.2 + R() * 1.4) * sz,
      spread = (7 + R() * 4) * sz;
    H = trunkH + spread * 0.5;
    ctr.set(0, trunkH + 1.5, 0);
    const mossy = 0.3 + R() * 0.6;
    const P = {
      radial: 9,
      segLen: 0.7,
      children: [5, 3, 3],
      spread: 0.95,
      lenK: 0.55,
      rK: 0.62,
      up: 0.01,
      sag: 0.18,
      wobble: 0.35,
      childStart: 0.25,
      barkCol: [0.75, 0.72, 0.68],
      barkRep: 1.6,
      flare: 0.5,
      leafFrom: 2,
      leafPerSeg: 1.2,
      leafSpan: 0.9,
      onLeaf: (p, d, depth) => {
        cluster(
          gb,
          R,
          p.clone().add(new V3(0, 0.25, 0)),
          (lod ? 2.2 : 1.5) * (0.8 + R() * 0.4),
          CELL.oak,
          ctr,
          leafCol([0.95, 1, 0.9]),
          lod ? 2 : 3,
          0.1,
          0.6,
        );
        if (!lod && R() < mossy * 0.35) moss(gb, R, p, 0.6 + R() * 1.4);
      },
    };
    // short massive trunk splitting into wide low limbs
    const top = branch(
      gb,
      R,
      new V3(),
      new V3((R() - 0.5) * 0.2, 1, (R() - 0.5) * 0.2),
      trunkH,
      0.42 * sz,
      0,
      { ...P, children: [0], onLeaf: null },
      lod,
    );
    const nL = 4 + ((R() * 3) | 0);
    for (let k = 0; k < nL; k++) {
      const a = (k * 6.28) / nL + R() * 0.6,
        el = 0.25 + R() * 0.45;
      branch(
        gb,
        R,
        top.clone().add(new V3(0, -0.2 - R() * 0.4, 0)),
        new V3(Math.cos(a), el, Math.sin(a)),
        spread * (0.55 + R() * 0.35),
        (0.22 + R() * 0.08) * sz,
        0,
        { ...P, children: [4, 3, 2] },
        lod,
      );
    }
  } else if (kind === 'slashpine') {
    H = (15 + R() * 8) * sz;
    const lean = (R() - 0.5) * 0.12;
    ctr.set(0, H * 0.85, 0);
    const P = {
      radial: 10,
      segLen: 0.9,
      children: [0],
      spread: 0,
      lenK: 0,
      rK: 0,
      up: 0,
      wobble: 0.04,
      barkCol: [1.0, 0.78, 0.62],
      barkRep: 1.4,
      flare: 0.25,
    };
    const top = branch(gb, R, new V3(), new V3(lean, 1, lean * 0.5), H, 0.3 * sz, 0, P, lod);
    // branches only in the upper third, short, upturned, with needle tufts at the tips
    const nb = lod ? 8 : 14 + ((R() * 6) | 0);
    for (let k = 0; k < nb; k++) {
      const t = 0.62 + 0.36 * (k / nb),
        a = k * 2.4 + R(),
        p = new V3(lean * H * t, H * t, lean * 0.5 * H * t);
      branch(
        gb,
        R,
        p,
        new V3(Math.cos(a), 0.15 + R() * 0.5, Math.sin(a)),
        (3.0 - (1.8 * (t - 0.6)) / 0.4) * (0.7 + R() * 0.5) * sz,
        0.07 * sz,
        0,
        {
          radial: 5,
          segLen: 0.6,
          children: [2, 2],
          spread: 0.6,
          lenK: 0.5,
          rK: 0.6,
          up: 0.08,
          wobble: 0.25,
          childStart: 0.4,
          barkCol: [0.95, 0.75, 0.6],
          leafFrom: 1,
          leafPerSeg: 0.7,
          leafSpan: 0.35,
          onLeaf: (q) =>
            cluster(
              gb,
              R,
              q,
              (lod ? 1.6 : 1.05) * (0.8 + R() * 0.4),
              CELL.pine,
              ctr,
              leafCol([1, 1, 0.95]),
              lod ? 2 : 3,
              0,
              0.5,
            ),
        },
        lod,
      );
    }
    cluster(gb, R, top, 1.4, CELL.pine, ctr, [1, 1, 1], 3, 0, 0.5);
    if (!lod)
      for (let i = 0; i < 6; i++)
        groundCard(
          gb,
          R,
          new V3((R() - 0.5) * 6, 0, (R() - 0.5) * 6),
          1 + R(),
          CELL.litter,
          [0.95, 0.8, 0.6],
        ); // fallen needles and cones
  } else if (kind === 'cypress') {
    H = (13 + R() * 8) * sz;
    ctr.set(0, H * 0.7, 0);
    const P = {
      radial: 10,
      segLen: 0.9,
      children: [0],
      spread: 0,
      lenK: 0,
      rK: 0,
      up: 0,
      wobble: 0.05,
      barkCol: [0.95, 0.82, 0.72],
      barkRep: 1.0,
      flare: 1.6,
      tipK: 0.3,
    };
    const ctop = branch(
      gb,
      R,
      new V3(),
      new V3((R() - 0.5) * 0.06, 1, (R() - 0.5) * 0.06),
      H,
      0.38 * sz,
      0,
      P,
      lod,
    );
    for (let k = 0; k < 3; k++)
      cluster(
        gb,
        R,
        ctop.clone().add(new V3((R() - 0.5) * 0.8, -k * 0.7, (R() - 0.5) * 0.8)),
        1.4,
        CELL.cypress,
        ctr,
        [1, 1, 0.92],
        3,
        0,
        0.7,
      );
    const nb = lod ? 9 : 16 + ((R() * 8) | 0),
      flatTop = R() < 0.5;
    for (let k = 0; k < nb; k++) {
      const t = 0.4 + 0.58 * (k / nb),
        a = k * 2.4 + R(),
        len = (flatTop ? 3.2 - t * 1.2 : 3.4 * (1 - t) + 0.8) * (0.7 + R() * 0.5) * sz;
      branch(
        gb,
        R,
        new V3(0, H * t, 0),
        new V3(Math.cos(a), 0.05 + R() * 0.25, Math.sin(a)),
        len,
        0.08 * sz,
        0,
        {
          radial: 5,
          segLen: 0.6,
          children: [3, 2],
          spread: 0.7,
          lenK: 0.5,
          rK: 0.6,
          up: 0.0,
          sag: 0.1,
          wobble: 0.25,
          childStart: 0.3,
          barkCol: [0.9, 0.8, 0.7],
          leafFrom: 1,
          leafPerSeg: 1.4,
          leafSpan: 0.8,
          onLeaf: (q) => {
            cluster(
              gb,
              R,
              q,
              (lod ? 1.7 : 1.15) * (0.8 + R() * 0.4),
              CELL.cypress,
              ctr,
              leafCol([1, 1, 0.92]),
              lod ? 2 : 3,
              0,
              0.7,
            );
            if (!lod && R() < 0.12) moss(gb, R, q, 0.5 + R());
          },
        },
        lod,
      );
    }
    if (!lod)
      for (let i = 0; i < 6 + R() * 6; i++) {
        const a = R() * 6.28,
          d = 1.2 + R() * 2.5,
          b = new V3(Math.cos(a) * d, -0.05, Math.sin(a) * d),
          h = 0.2 + R() * 0.45; // cypress knees
        tube(
          gb.bark,
          [
            b,
            b.clone().add(new V3((R() - 0.5) * 0.05, h * 0.6, 0)),
            b.clone().add(new V3(0, h, 0)),
          ],
          6,
          (i) => [0.12, 0.08, 0.035][i] * (0.8 + R() * 0.4),
          (i, j) => [barkU(BARK.tree, j / 6), i * 0.2],
          () => [0.9, 0.8, 0.7],
          () => [0, 0, 0],
          true,
        );
      }
  } else {
    // red mangrove: short trunk on arching prop roots, dense rounded canopy, drop roots from limbs
    const tH = (2.0 + R() * 1.5) * sz,
      cw = (3.0 + R() * 1.8) * sz;
    H = tH + cw;
    ctr.set(0, tH + cw * 0.5, 0);
    const P = {
      radial: 7,
      segLen: 0.5,
      children: [4, 3, 2],
      spread: 0.85,
      lenK: 0.6,
      rK: 0.62,
      up: 0.03,
      wobble: 0.35,
      childStart: 0.3,
      barkCol: [0.85, 0.72, 0.65],
      barkRep: 0.9,
      leafFrom: 2,
      leafPerSeg: 1.4,
      leafSpan: 0.9,
      onLeaf: (q) =>
        cluster(
          gb,
          R,
          q.clone().add(new V3(0, 0.2, 0)),
          (lod ? 1.6 : 1.05) * (0.8 + R() * 0.4),
          CELL.mangrove,
          ctr,
          leafCol([1, 1, 0.95]),
          lod ? 2 : 3,
          0.1,
          0.6,
        ),
    };
    const base = new V3(0, 0.9 * sz, 0),
      top = branch(
        gb,
        R,
        base,
        new V3((R() - 0.5) * 0.3, 1, (R() - 0.5) * 0.3),
        tH,
        0.16 * sz,
        0,
        { ...P, children: [0], onLeaf: null },
        lod,
      );
    for (let k = 0; k < 4; k++) {
      const a = k * 1.57 + R();
      branch(
        gb,
        R,
        top,
        new V3(Math.cos(a), 0.6 + R() * 0.5, Math.sin(a)),
        cw * (0.6 + R() * 0.3),
        0.09 * sz,
        0,
        { ...P, children: [3, 2] },
        lod,
      );
    }
    // prop roots: arch out and down from the lower trunk into the mud/water
    const nR = lod ? 7 : 12 + ((R() * 8) | 0);
    for (let k = 0; k < nR; k++) {
      const a = (k * 6.28) / nR + R() * 0.4,
        y0 = base.y + R() * tH * 0.5,
        reach = (0.9 + R() * 1.2) * sz,
        pts = [];
      for (let i = 0; i <= (lod ? 4 : 8); i++) {
        const t = i / (lod ? 4 : 8),
          arch = Math.sin(t * Math.PI * 0.85) * 0.5 * reach;
        pts.push(
          new V3(
            Math.cos(a) * reach * t,
            y0 * (1 - t * t) + arch * (1 - t) * 0.6 - 0.15 * t,
            Math.sin(a) * reach * t,
          ),
        );
      }
      tube(
        gb.bark,
        pts,
        lod ? 3 : 5,
        (i) => 0.045 * sz * (1 - i * 0.04),
        (i, j) => [barkU(BARK.tree, j / 5), i * 0.25],
        () => [0.8, 0.68, 0.6],
        () => [0, 0, 0],
      );
    }
    if (false)
      for (let k = 0; k < 3; k++) {
        const a = R() * 6.28,
          r = cw * (0.3 + R() * 0.3),
          p = new V3(Math.cos(a) * r, tH + base.y - 0.3, Math.sin(a) * r); // drop roots
        tube(
          gb.bark,
          [p, p.clone().add(new V3(0.05, -p.y * 0.5, 0.03)), new V3(p.x + 0.1, -0.1, p.z)],
          4,
          () => 0.028 * sz,
          (i, j) => [barkU(BARK.tree, j / 4), i * 0.5],
          () => [0.75, 0.65, 0.58],
          () => [0, 0, 0],
        );
      }
  }
  const bark = gb.bark.build(),
    leaf = gb.leaf.build();
  return { bark, leaf, height: H, tris: gb.bark.tris + gb.leaf.tris };
}

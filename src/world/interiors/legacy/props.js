// Movable interior props (INTERIORS agent): chairs, stools, small tables, plant pots, sign stands, bins.
// Each prop kind+style has ONE shared vertex-coloured geometry (cached forever) drawn with ONE shared instanced
// material, and a Rapier dynamic body whose compound collider matches the real shape and mass.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GEO = new Map();
let MAT = null;
export function propMat() {
  return (
    MAT ||
    (MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.08 }))
  );
}

function part(g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes))
    if (!['position', 'normal'].includes(k)) n.deleteAttribute(k);
  n.applyMatrix4(
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z),
  );
  const c = new THREE.Color(color);
  const a = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) {
    a[i] = c.r;
    a[i + 1] = c.g;
    a[i + 2] = c.b;
  }
  n.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return n;
}
const box = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const legs4 = (ps, c, hx, hz, h, r = 0.018, round = true) => {
  for (const [u, v] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    ps.push(part(round ? cyl(r, r, h, 6) : box(r * 2, h, r * 2), c, u * hx, h / 2, v * hz));
};

// ---- geometry builders: origin on the floor, seated person faces +Z (chair back toward -Z) ----
const BUILD = {
  chair(style, c) {
    const ps = [];
    const { seat = '#8a5a3a', frame = '#4a2e1e', back = seat } = c;
    if (style === 'bentwood') {
      legs4(ps, frame, 0.17, 0.17, 0.45, 0.014);
      ps.push(part(cyl(0.21, 0.21, 0.03, 16), seat, 0, 0.46, 0));
      ps.push(
        part(new THREE.TorusGeometry(0.17, 0.014, 5, 14, Math.PI), frame, 0, 0.62, -0.19, 0, 0, 0),
      );
      ps.push(part(cyl(0.012, 0.012, 0.42, 5), frame, -0.17, 0.66, -0.19));
      ps.push(part(cyl(0.012, 0.012, 0.42, 5), frame, 0.17, 0.66, -0.19));
    } else if (style === 'vinyl') {
      ps.push(part(cyl(0.02, 0.02, 0.42, 6), frame, 0, 0.21, 0));
      ps.push(part(cyl(0.22, 0.24, 0.02, 12), frame, 0, 0.01, 0));
      ps.push(part(box(0.44, 0.08, 0.42), seat, 0, 0.46, 0));
      ps.push(part(box(0.44, 0.4, 0.07), back, 0, 0.72, -0.19));
    } else if (style === 'rattan') {
      legs4(ps, frame, 0.18, 0.18, 0.44, 0.02);
      ps.push(part(box(0.46, 0.06, 0.44), seat, 0, 0.46, 0));
      ps.push(part(box(0.46, 0.45, 0.05), back, 0, 0.72, -0.2, -0.12));
      ps.push(part(box(0.04, 0.2, 0.4), frame, -0.22, 0.58, 0));
      ps.push(part(box(0.04, 0.2, 0.4), frame, 0.22, 0.58, 0));
    } else if (style === 'metal') {
      legs4(ps, frame, 0.18, 0.18, 0.45, 0.012, false);
      ps.push(part(box(0.42, 0.03, 0.42), seat, 0, 0.46, 0));
      ps.push(part(box(0.42, 0.3, 0.02), back, 0, 0.66, -0.2));
    } else if (style === 'velvet') {
      ps.push(part(box(0.72, 0.36, 0.66), seat, 0, 0.22, 0));
      ps.push(part(box(0.72, 0.5, 0.14), back, 0, 0.55, -0.28));
      ps.push(part(box(0.12, 0.22, 0.62), back, -0.32, 0.48, 0));
      ps.push(part(box(0.12, 0.22, 0.62), back, 0.32, 0.48, 0));
      legs4(ps, frame, 0.3, 0.28, 0.06, 0.02);
    } else if (style === 'plastic') {
      legs4(ps, frame, 0.18, 0.18, 0.44, 0.012);
      ps.push(part(box(0.44, 0.04, 0.42), seat, 0, 0.46, 0));
      ps.push(part(box(0.44, 0.36, 0.03), seat, 0, 0.68, -0.2, -0.1));
    } else {
      legs4(ps, frame, 0.18, 0.18, 0.45, 0.02, false);
      ps.push(part(box(0.44, 0.04, 0.42), seat, 0, 0.47, 0));
      for (const x of [-0.17, 0, 0.17]) ps.push(part(box(0.05, 0.4, 0.03), back, x, 0.7, -0.2));
      ps.push(part(box(0.44, 0.06, 0.03), back, 0, 0.88, -0.2));
    }
    return ps;
  },
  stool(style, c) {
    const ps = [];
    const { seat = '#d8344a', frame = '#c8ccd0' } = c;
    const h = c.h || 0.76;
    if (style === 'wood') {
      legs4(ps, frame, 0.14, 0.14, h, 0.018);
      ps.push(part(cyl(0.19, 0.19, 0.05, 14), seat, 0, h, 0));
      ps.push(part(new THREE.TorusGeometry(0.15, 0.01, 4, 12), frame, 0, h * 0.35, 0, Math.PI / 2));
    } else if (style === 'metal') {
      legs4(ps, frame, 0.13, 0.13, h, 0.012, false);
      ps.push(part(cyl(0.18, 0.18, 0.03, 14), seat, 0, h, 0));
      ps.push(part(box(0.3, 0.012, 0.012), frame, 0, h * 0.35, 0.13));
    } else {
      ps.push(part(cyl(0.035, 0.035, h - 0.05, 6), frame, 0, (h - 0.05) / 2, 0));
      ps.push(part(cyl(0.2, 0.22, 0.03, 12), frame, 0, 0.015, 0));
      ps.push(part(cyl(0.2, 0.19, 0.09, 14), seat, 0, h, 0));
      ps.push(part(new THREE.TorusGeometry(0.15, 0.012, 4, 12), frame, 0, h * 0.4, 0, Math.PI / 2));
    }
    return ps;
  },
  table(style, c) {
    const ps = [];
    const { top = '#8a5a3a', frame = '#1c1c22', cloth = '#f4f1ea' } = c;
    const w = c.w || 0.8,
      d = c.d || w,
      h = c.h || 0.75;
    if (style === 'round') {
      ps.push(part(cyl(w / 2, w / 2, 0.04, 20), top, 0, h, 0));
      ps.push(part(cyl(0.04, 0.04, h, 6), frame, 0, h / 2, 0));
      ps.push(part(cyl(0.24, 0.26, 0.03, 12), frame, 0, 0.015, 0));
    } else if (style === 'cloth') {
      ps.push(part(box(w, 0.04, d), cloth, 0, h, 0));
      ps.push(part(box(w + 0.02, h - 0.1, d + 0.02), cloth, 0, (h - 0.1) / 2 + 0.08, 0));
    } else if (style === 'picnic') {
      ps.push(part(box(w, 0.05, d), top, 0, h, 0));
      for (const s of [-1, 1]) {
        ps.push(part(box(w, 0.04, 0.26), top, 0, 0.45, s * (d / 2 + 0.32)));
        ps.push(part(box(0.05, 0.45, d + 0.9), frame, s * (w / 2 - 0.15), 0.225, 0));
      }
    } else {
      ps.push(part(box(w, 0.04, d), top, 0, h, 0));
      legs4(ps, frame, w / 2 - 0.05, d / 2 - 0.05, h - 0.02, 0.022, false);
    }
    return ps;
  },
  plant(style, c) {
    const ps = [part(cyl(0.22, 0.17, 0.45, 10), c.pot || '#bc6c25', 0, 0.225, 0)];
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      ps.push(
        part(
          new THREE.ConeGeometry(0.09, 0.95, 4),
          c.leaf || '#2d6a4f',
          Math.sin(a) * 0.12,
          0.9,
          Math.cos(a) * 0.12,
          Math.sin(a) * 0.45,
          a,
          Math.cos(a) * 0.45,
        ),
      );
    }
    return ps;
  },
  sign(style, c) {
    const ps = [];
    for (const s of [-1, 1])
      ps.push(part(box(0.6, 0.95, 0.03), c.board || '#1f2a24', 0, 0.48, s * 0.16, s * 0.17));
    ps.push(part(box(0.62, 0.04, 0.05), c.frame || '#8a5a3a', 0, 0.97, 0));
    return ps;
  },
  bin(style, c) {
    return [
      part(cyl(0.2, 0.18, 0.7, 12), c.body || '#2a2d31', 0, 0.35, 0),
      part(cyl(0.21, 0.21, 0.04, 12), c.lid || '#c8ccd0', 0, 0.72, 0),
    ];
  },
};
// colliders per kind: [shape, args, x, y, z, mass]  (y up from floor, chair back toward -Z)
export function propColliders(kind, style, c = {}) {
  const h = c.h || (kind === 'stool' ? 0.76 : 0.75),
    w = c.w || 0.8,
    d = c.d || w;
  switch (kind) {
    case 'chair':
      return style === 'velvet'
        ? [
            ['cuboid', [0.36, 0.2, 0.33], 0, 0.22, 0, 12],
            ['cuboid', [0.36, 0.25, 0.07], 0, 0.55, -0.28, 5],
          ]
        : [
            ['cuboid', [0.19, 0.22, 0.19], 0, 0.22, 0, 4],
            ['cuboid', [0.22, 0.03, 0.21], 0, 0.46, 0, 1.4],
            ['cuboid', [0.22, 0.2, 0.03], 0, 0.69, -0.19, 0.8],
          ]; // low centre of mass: slides when bumped, tips when rammed
    case 'stool':
      return [['cylinder', [h / 2, 0.19], 0, h / 2, 0, 4]];
    case 'table':
      return style === 'round'
        ? [
            ['cylinder', [0.02, w / 2], 0, h, 0, 5],
            ['cylinder', [h / 2, 0.06], 0, h / 2, 0, 3],
            ['cylinder', [0.03, 0.27], 0, 0.03, 0, 14],
          ] // heavy cast-iron base keeps it upright
        : style === 'cloth'
          ? [['cuboid', [w / 2, h / 2, d / 2], 0, h / 2, 0, 22]]
          : style === 'picnic'
            ? [
                ['cuboid', [w / 2, 0.025, d / 2], 0, h, 0, 20],
                ['cuboid', [w / 2, 0.02, 0.13], 0, 0.45, d / 2 + 0.32, 10],
                ['cuboid', [w / 2, 0.02, 0.13], 0, 0.45, -d / 2 - 0.32, 10],
                ['cuboid', [w / 2 - 0.1, 0.2, 0.04], 0, 0.22, 0, 8],
              ]
            : [
                ['cuboid', [w / 2, 0.02, d / 2], 0, h, 0, 10],
                ...[
                  [-1, -1],
                  [1, -1],
                  [-1, 1],
                  [1, 1],
                ].map(([u, v]) => [
                  'cuboid',
                  [0.025, (h - 0.02) / 2, 0.025],
                  u * (w / 2 - 0.05),
                  (h - 0.02) / 2,
                  v * (d / 2 - 0.05),
                  2,
                ]),
              ];
    case 'plant':
      return [
        ['cylinder', [0.225, 0.2], 0, 0.225, 0, 14],
        ['cylinder', [0.4, 0.25], 0, 0.85, 0, 1],
      ];
    case 'sign':
      return [['cuboid', [0.3, 0.48, 0.2], 0, 0.48, 0, 6]];
    case 'bin':
      return [['cylinder', [0.36, 0.2], 0, 0.36, 0, 6]];
  }
  return [['cuboid', [0.2, 0.2, 0.2], 0, 0.2, 0, 5]];
}
export function propGeo(kind, style, colors = {}) {
  const key = kind + ':' + style + ':' + JSON.stringify(colors);
  if (!GEO.has(key)) {
    const g = mergeGeometries((BUILD[kind] || BUILD.bin)(style, colors), false);
    g.computeBoundingSphere();
    g.userData.shared = true;
    GEO.set(key, g);
  }
  return GEO.get(key);
}

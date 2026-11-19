// W4 (Nov 19 playtest: "a luxury street in Brickell modeled on a well-known rich street"): Brickell Avenue's tower row.
// The real avenue runs between glass towers with a planted median of tall royal palms, wide pale stone sidewalks, valet stands
// at the lobbies and warm uplights on the palms at night. This dresses the Brickell Ave edges of the road graph around
// (110, 1640) (Brickell district), with the city kit only, no logos:
//   - a raised 1.1 m median of curbstone and mondo grass down the double-yellow line (stops 14 m short of junctions), a royal
//     palm every ~9.5 m in it (vegetation library 'royal_palm': same LOD chain, trunk colliders and ground pass as every palm),
//     two in-ground uplights per palm;
//   - pale large-format travertine paving over both sidewalks (one mesh, ground ladder rung 'paving2': over the sidewalk slab,
//     under grates / pools / covers);
//   - glass lobby fronts on the ground floor of every Brickell Ave storefront here: tinted glazing (warm interior at night),
//     bronze mullions, a thin canopy with downlights; two valet stands (podium, umbrella, A-board) at the curb;
//   - at night: warm uplight wash up each median trunk, light pools under the canopies and at the uplights (additive, no lights).
// ~7 draw calls inside ~700 m of the street, nothing beyond (group hidden). Colliders: median curbs (low boxes), valet podiums,
// A-boards, umbrella poles. ?brickellrow=0 = off.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { inMapBuilding } from '../../ground/occupancy.js';
import { ladder } from '../../ground/depthLadder.js';

export const order = 72;
const OFF = typeof location !== 'undefined' && /[?&]brickellrow=0\b/.test(location.search);
const CENTER = { x: 110, z: 1640 },
  REACH = 260,
  NAME = /^Brickell Ave/;
const MED_HW = 0.55,
  MED_H = 0.16,
  PALM_SP = 9.5,
  JUNC_GAP = 14;
const hash = (a, b) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function canvasTex(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// travertine: 1.2 x 0.6 m slabs in running bond, 4.8 m tile = 1024 px
function pavingTex() {
  return canvasTex(1024, 1024, (g, W) => {
    const px = W / 4.8;
    g.fillStyle = '#cfc6b4';
    g.fillRect(0, 0, W, W);
    for (let r = 0; r < 8; r++)
      for (let c = -1; c < 4; c++) {
        const x0 = (c * 1.2 + (r % 2) * 0.6) * px,
          y0 = r * 0.6 * px,
          k = hash(r * 7 + 3, c * 13 + 1);
        const L = (205 + k * 22) | 0;
        g.fillStyle = `rgb(${L},${L - 7},${L - 20})`;
        g.fillRect(x0 + 1.5, y0 + 1.5, 1.2 * px - 3, 0.6 * px - 3);
        g.globalAlpha = 0.07;
        for (let v = 0; v < 6; v++) {
          g.strokeStyle = v % 2 ? '#8f8270' : '#f4eee2';
          g.lineWidth = 1 + hash(v, k * 50) * 2;
          g.beginPath();
          const yy = y0 + hash(v, r + c) * 0.6 * px;
          g.moveTo(x0, yy);
          g.bezierCurveTo(
            x0 + 0.4 * px,
            yy + 6,
            x0 + 0.8 * px,
            yy - 6,
            x0 + 1.2 * px,
            yy + hash(c, v) * 8,
          );
          g.stroke();
        }
        for (let p = 0; p < 30; p++) {
          g.fillStyle = hash(p, k * 9) > 0.5 ? '#9c8f7b' : '#efe8da';
          g.fillRect(x0 + hash(p, k) * 1.2 * px, y0 + hash(k, p) * 0.6 * px, 2, 1.5);
        }
        g.globalAlpha = 1;
      }
  });
}
function groundCoverTex() {
  return canvasTex(256, 256, (g, W) => {
    g.fillStyle = '#2c3d1f';
    g.fillRect(0, 0, W, W);
    for (let i = 0; i < 2600; i++) {
      const x = hash(i, 1) * W,
        y = hash(i, 2) * W,
        l = (30 + hash(i, 3) * 60) | 0;
      g.strokeStyle = `rgb(${(l * 0.55) | 0},${l},${(l * 0.4) | 0})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (hash(i, 4) - 0.5) * 6, y - 4 - hash(i, 5) * 7);
      g.stroke();
    }
  });
}
function lobbyTex() {
  // emissive / interior hint: ceiling light rows, a bright lobby band, dark floor
  return canvasTex(
    512,
    256,
    (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#2a2118');
      gr.addColorStop(0.18, '#7a5d3e');
      gr.addColorStop(0.55, '#3d2f22');
      gr.addColorStop(1, '#120e0a');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        const x = ((i + 0.5) / 8) * W,
          rg = g.createRadialGradient(x, H * 0.12, 2, x, H * 0.12, 40);
        rg.addColorStop(0, 'rgba(255,224,170,1)');
        rg.addColorStop(1, 'rgba(255,200,140,0)');
        g.fillStyle = rg;
        g.fillRect(x - 40, 0, 80, H * 0.5);
      }
      g.fillStyle = 'rgba(20,14,10,0.7)';
      for (let i = 0; i < 5; i++) g.fillRect((0.08 + i * 0.2) * W, H * 0.45, W * 0.05, H * 0.55);
    },
    { repeat: false },
  );
}
function valetTex() {
  return canvasTex(
    256,
    384,
    (g, W, H) => {
      g.fillStyle = '#14191d';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#b8955a';
      g.lineWidth = 6;
      g.strokeRect(12, 12, W - 24, H - 24);
      g.fillStyle = '#e9dcc0';
      g.textAlign = 'center';
      g.font = '700 64px Georgia, serif';
      g.fillText('VALET', W / 2, H * 0.42);
      g.font = '400 30px Georgia, serif';
      g.fillText('PARKING', W / 2, H * 0.56);
      g.fillStyle = '#b8955a';
      g.fillRect(W * 0.3, H * 0.66, W * 0.4, 3);
      g.font = 'italic 26px Georgia, serif';
      g.fillStyle = '#cbbd9f';
      g.fillText('guests only', W / 2, H * 0.76);
    },
    { repeat: false },
  );
}

export async function initV2(game) {
  if (OFF || typeof document === 'undefined') return;
  const city = game.city,
    G = city?.roadGraph;
  if (!G?.edges || !G.pointAt) return;
  const W = game.world,
    RP = game.RAPIER;
  const edges = G.edges.filter(
    (e) =>
      NAME.test(e.name || '') &&
      !e.elevated &&
      !e.bridge &&
      e.length > 30 &&
      (() => {
        const m = G.pointAt(e, e.length / 2, {});
        return Math.hypot(m.x - CENTER.x, m.z - CENTER.z) < REACH;
      })(),
  );
  if (!edges.length) {
    game.brickellRow = { off: 'no edges' };
    return;
  }
  const deg = (n) => G.nodes?.[n]?.edges?.length ?? 2;
  const gy = (x, z) => {
    const v = city.groundHeightAt?.(x, z);
    return Number.isFinite(v) ? v : 0;
  };

  const props = [],
    glass = [],
    cover = [],
    glowV = [],
    glowP = [],
    boards = [],
    cols = [],
    palms = [];
  const C = (hex) => new THREE.Color(hex);
  const add = (list, g, color) => {
    if (color) {
      if (g.attributes.uv) g.deleteAttribute('uv');
      const n = g.attributes.position.count,
        a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        a[i * 3] = color.r;
        a[i * 3 + 1] = color.g;
        a[i * 3 + 2] = color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    list.push(g.index ? g.toNonIndexed() : g);
  };
  const M4 = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    V = new THREE.Vector3(),
    S = new THREE.Vector3(1, 1, 1),
    YA = new THREE.Vector3(0, 1, 0);
  const box = (list, x, y, z, w, h, d, ry, color) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(M4.compose(V.set(x, y + h / 2, z), Q.setFromAxisAngle(YA, ry), S));
    add(list, g, color);
  };
  const cyl = (list, x, y, z, r0, r1, h, color, seg = 10) => {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg);
    g.translate(x, y + h / 2, z);
    add(list, g, color);
  };
  const colBox = (x, y, z, hx, hy, hz, ry) =>
    cols.push({ t: 'b', x, y: y + hy, z, hx, hy, hz, ry });
  const CURB = C(0xbdb8ad),
    BRONZE = C(0x6b5233),
    DARK = C(0x2a2622),
    WALNUT = C(0x4a2f1d),
    BRASS = C(0xb08a4e),
    CREAM = C(0xe7dcc6);

  // ---------------- median + palms + uplights, sidewalk paving ----------------
  let medianLen = 0;
  for (const e of edges) {
    const s0 = deg(e.a) >= 3 ? JUNC_GAP : 4,
      s1 = e.length - (deg(e.b) >= 3 ? JUNC_GAP : 4),
      hw = (e.width || 15) / 2;
    if (s1 - s0 > 12) {
      // median: a strip of quads along the centerline, curbs at the sides
      const step = 2,
        pts = [];
      for (let s = s0; s <= s1 + 1e-3; s += Math.min(step, s1 - s + 1e-3 || step)) {
        const q = G.pointAt(e, Math.min(s, s1), {});
        pts.push({ x: q.x, z: q.z, dx: q.dx, dz: q.dz, y: gy(q.x, q.z), s });
        if (s >= s1) break;
      }
      const top = [],
        side = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i],
          b = pts[i + 1];
        const corner = (p, o, y) => [p.x + -p.dz * o, y, p.z + p.dx * o];
        const aL = corner(a, -MED_HW, a.y + MED_H),
          aR = corner(a, MED_HW, a.y + MED_H),
          bL = corner(b, -MED_HW, b.y + MED_H),
          bR = corner(b, MED_HW, b.y + MED_H);
        const iL = corner(a, -MED_HW + 0.14, a.y + MED_H + 0.01),
          iR = corner(a, MED_HW - 0.14, a.y + MED_H + 0.01),
          jL = corner(b, -MED_HW + 0.14, b.y + MED_H + 0.01),
          jR = corner(b, MED_HW - 0.14, b.y + MED_H + 0.01);
        top.push([iL, iR, jR, jL, a.s, b.s]);
        side.push([aL, aR, bR, bL, a, b]);
        // curb faces + caps (props mesh)
        const quad = (p0, p1, p2, p3) => {
          const g = new THREE.BufferGeometry();
          g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p0, ...p2, ...p3], 3),
          );
          g.computeVertexNormals();
          add(props, g, CURB);
        };
        const lo = (p, o) => [p.x + -p.dz * o, p.y + 0.005, p.z + p.dx * o];
        quad(lo(a, -MED_HW), lo(b, -MED_HW), bL, aL);
        quad(lo(b, MED_HW), lo(a, MED_HW), aR, bR);
        quad(aL, bL, jL, iL);
        quad(iR, jR, bR, aR);
        const mx = (a.x + b.x) / 2,
          mz = (a.z + b.z) / 2,
          L = Math.hypot(b.x - a.x, b.z - a.z);
        colBox(mx, (a.y + b.y) / 2, mz, MED_HW, MED_H / 2, L / 2, Math.atan2(a.dx, a.dz));
      }
      // nose caps at both ends
      for (const [p, sg] of [
        [pts[0], -1],
        [pts[pts.length - 1], 1],
      ]) {
        const g = new THREE.CylinderGeometry(MED_HW, MED_HW, MED_H, 12, 1, false, 0, Math.PI);
        g.rotateY(Math.atan2(p.dx, p.dz) + (sg > 0 ? -Math.PI / 2 : Math.PI / 2));
        g.translate(p.x, p.y + MED_H / 2, p.z);
        add(props, g, CURB);
      }
      for (const [iL, iR, jR, jL, sa, sb] of top) {
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([...iL, ...iR, ...jR, ...iL, ...jR, ...jL], 3),
        );
        g.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(
            [0, sa / 2, 0.4, sa / 2, 0.4, sb / 2, 0, sa / 2, 0.4, sb / 2, 0, sb / 2],
            2,
          ),
        );
        g.computeVertexNormals();
        cover.push(g);
      }
      medianLen += s1 - s0;
      // palms + uplights
      const n = Math.max(1, Math.floor((s1 - s0 - 4) / PALM_SP)),
        sp = (s1 - s0 - 4) / n;
      for (let k = 0; k <= n; k++) {
        const s = s0 + 2 + k * sp,
          q = G.pointAt(e, s, {}),
          y = gy(q.x, q.z) + MED_H,
          h = hash(q.x, q.z);
        palms.push({ x: q.x, y, z: q.z, s: 0.86 + h * 0.12, ry: h * 6.28 });
        for (const sg of [-1, 1]) {
          const ux = q.x + q.dx * sg * 0.9,
            uz = q.z + q.dz * sg * 0.9;
          cyl(props, ux, y, uz, 0.11, 0.11, 0.03, DARK, 12);
          cyl(props, ux, y + 0.03, uz, 0.075, 0.075, 0.004, BRASS, 12);
          glowP.push([ux, y + 0.02, uz, 0.42]);
        }
        glowV.push([q.x, y, q.z, Math.atan2(q.dx, q.dz)]);
      }
    }
  }

  // ---------------- glass lobby fronts on the storefronts of this stretch ----------------
  const SF = (game.miamiData?.storefronts || []).filter(
    (s) => NAME.test(s.street || '') && Math.hypot(s.x - CENTER.x, s.z - CENTER.z) < REACH + 40,
  );
  const fronts = [];
  for (const s of SF) {
    const nx = Math.sin(s.facing),
      nz = Math.cos(s.facing),
      tx = nz,
      tz = -nx,
      w = Math.max(5, Math.min(14, s.w)),
      y0 = gy(s.fx + nx * 0.6, s.fz + nz * 0.6),
      H = 4.3;
    const fx = s.fx + nx * 0.07,
      fz = s.fz + nz * 0.07;
    fronts.push({ x: fx, z: fz, nx, nz, w, y0, kind: s.kind });
    const g = new THREE.PlaneGeometry(w, H);
    g.rotateY(s.facing);
    g.translate(fx, y0 + H / 2, fz);
    glass.push(g);
    const np = Math.max(2, Math.round(w / 1.5)); // bronze mullions, sill, head, a canopy blade with downlights
    for (let k = 0; k <= np; k++) {
      const o = -w / 2 + (k * w) / np;
      box(
        props,
        fx + tx * o + nx * 0.03,
        y0,
        fz + tz * o + nz * 0.03,
        0.07,
        H,
        0.09,
        s.facing,
        BRONZE,
      );
    }
    box(props, fx + nx * 0.04, y0, fz + nz * 0.04, w + 0.1, 0.12, 0.12, s.facing, BRONZE);
    box(
      props,
      fx + nx * 0.04,
      y0 + H - 0.16,
      fz + nz * 0.04,
      w + 0.1,
      0.16,
      0.12,
      s.facing,
      BRONZE,
    );
    box(props, fx + nx * 0.85, y0 + H + 0.02, fz + nz * 0.85, w + 0.6, 0.14, 1.7, s.facing, DARK);
    box(props, fx + nx * 1.7, y0 + H, fz + nz * 1.7, w + 0.6, 0.2, 0.05, s.facing, BRONZE);
    for (let k = 0; k < Math.max(2, Math.round(w / 3)); k++) {
      const o = -w / 2 + ((k + 0.5) * w) / Math.max(2, Math.round(w / 3));
      glowP.push([fx + tx * o + nx * 1.1, y0 + 0.012, fz + tz * o + nz * 1.1, 1.6]);
    }
  }
  // two valet stands at the lobbies nearest the middle of the stretch, at the curb in front
  const vf = fronts
    .slice()
    .sort(
      (a, b) =>
        Math.hypot(a.x - CENTER.x, a.z - CENTER.z) - Math.hypot(b.x - CENTER.x, b.z - CENTER.z),
    )
    .filter((f, i, A) => A.slice(0, i).every((g) => Math.hypot(g.x - f.x, g.z - f.z) > 40))
    .slice(0, 2);
  const valets = [];
  for (const f of vf) {
    let cx = f.x + f.nx * 2.6,
      cz = f.z + f.nz * 2.6;
    const ne = G.nearestEdge?.(cx, cz, {}, 30); // toward the curb
    if (ne?.point) {
      const dx = ne.point.x - f.x,
        dz = ne.point.z - f.z,
        L = Math.hypot(dx, dz) || 1,
        curbD = L - (ne.edge.width || 15) / 2;
      const d = Math.max(1.8, curbD - 1.1);
      cx = f.x + (dx / L) * d;
      cz = f.z + (dz / L) * d;
    }
    const ry = Math.atan2(f.nx, f.nz),
      y = gy(cx, cz),
      tx = Math.cos(ry),
      tz = -Math.sin(ry);
    box(props, cx, y, cz, 0.62, 1.05, 0.46, ry, WALNUT);
    box(props, cx, y + 1.05, cz, 0.7, 0.05, 0.54, ry, BRASS);
    colBox(cx, y, cz, 0.31, 0.55, 0.23, ry);
    const ux = cx + tx * 1.1,
      uz = cz + tz * 1.1;
    cyl(props, ux, y, uz, 0.2, 0.2, 0.06, DARK);
    cyl(props, ux, y, uz, 0.025, 0.025, 2.5, BRONZE, 8);
    {
      const g = new THREE.ConeGeometry(1.35, 0.42, 16, 1, true);
      g.translate(ux, y + 2.55, uz);
      add(props, g, CREAM);
      const g2 = new THREE.ConeGeometry(1.35, 0.42, 16, 1, true);
      g2.rotateX(Math.PI);
      g2.translate(ux, y + 2.55, uz);
      add(props, g2, CREAM);
    }
    cols.push({ t: 'c', x: ux, y: y + 1.25, z: uz, hh: 1.25, r: 0.05 });
    const bx = cx - tx * 1.2 + f.nx * 0.3,
      bz = cz - tz * 1.2 + f.nz * 0.3; // A-board
    for (const sg of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.62, 0.95);
      g.rotateX(sg * 0.16);
      g.translate(0, 0.5, sg * 0.08);
      g.rotateY(ry + (sg < 0 ? Math.PI : 0));
      g.translate(bx, y, bz);
      boards.push(g);
    }
    colBox(bx, y, bz, 0.31, 0.5, 0.12, ry);
    box(props, cx + tx * 0.42, y, cz + tz * 0.42, 0.34, 1.35, 0.12, ry, DARK); // key cabinet on its post
    valets.push({ x: +cx.toFixed(1), z: +cz.toFixed(1) });
  }

  // ---------------- sidewalk paving ----------------
  // Built once the sidewalk colliders around the street exist: the slab height comes from the physics ground (the drawn
  // slabs), not the data height grid, which reads 0 over many Brickell sidewalks. A 0.5 m lateral grid from the curb out to
  // 8.5 m; a cell is paved only when all four corners are on a raised slab (tree pits, planters, lots, the road stay).
  const LAT = [];
  for (let o = 0.3; o <= 8.5; o += 0.5) LAT.push(o);

  let downRay = null;
  function slabHeight(x, z) {
    if (!W || !RP) return null;
    downRay ||= new RP.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    downRay.origin = { x, y: 1.5, z };
    const flags = RP.QueryFilterFlags.EXCLUDE_DYNAMIC | RP.QueryFilterFlags.EXCLUDE_SENSORS;
    const solid = (c) =>
      c.shape?.type !== RP.ShapeType.Capsule && c.shape?.type !== RP.ShapeType.Cylinder;
    let hit = null;
    try {
      hit = W.castRay(downRay, 2, true, flags, undefined, undefined, undefined, solid);
    } catch (e) {
      return null;
    }
    if (!hit) return null;
    const y = 1.5 - hit.timeOfImpact;
    if (y < 0.1 || y > 0.3) return null;
    if (inMapBuilding(game, x, z, 0) || city.isWater?.(x, z)) return null;
    return y;
  }

  function sampleSide(e, sd) {
    const hw = (e.width || 15) / 2;
    const rows = [];
    for (let s = 1; s <= e.length - 1; s += 1.5) {
      const q = G.pointAt(e, s, {});
      const nx = -q.dz * sd;
      const nz = q.dx * sd;
      const ok = LAT.map((o) => slabHeight(q.x + nx * (hw + o), q.z + nz * (hw + o)));
      rows.push({ q, nx, nz, s, ok, hw });
    }
    return rows;
  }

  function pavingCell(a, b, k, sd) {
    const corner = (r, kk) => [
      r.q.x + r.nx * (r.hw + LAT[kk]),
      r.ok[kk] + 0.012,
      r.q.z + r.nz * (r.hw + LAT[kk]),
    ];
    const uv = (r, kk) => [(LAT[kk] * sd) / 4.8, r.s / 4.8];
    const A0 = corner(a, k);
    const A1 = corner(a, k + 1);
    const B0 = corner(b, k);
    const B1 = corner(b, k + 1);
    const pos = sd < 0 ? [A0, B0, B1, A0, B1, A1] : [A0, A1, B1, A0, B1, B0];
    const uvs =
      sd < 0
        ? [uv(a, k), uv(b, k), uv(b, k + 1), uv(a, k), uv(b, k + 1), uv(a, k + 1)]
        : [uv(a, k), uv(a, k + 1), uv(b, k + 1), uv(a, k), uv(b, k + 1), uv(b, k)];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos.flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
    g.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(new Array(6).fill([0, 1, 0]).flat(), 3),
    );
    return g;
  }

  function buildPaving() {
    const cells = [];
    for (const e of edges) {
      for (const sd of [-1, 1]) {
        const rows = sampleSide(e, sd);
        for (let i = 0; i + 1 < rows.length; i++) {
          const a = rows[i];
          const b = rows[i + 1];
          for (let k = 0; k + 1 < LAT.length; k++) {
            const all = [a.ok[k], a.ok[k + 1], b.ok[k], b.ok[k + 1]];
            if (all.some((v) => v === null)) continue;
            cells.push(pavingCell(a, b, k, sd));
          }
        }
      }
    }
    return cells;
  }

  // ---------------- meshes ----------------
  const root = new THREE.Group();
  root.name = 'brickellRow';
  const mk = (geos, mat, name, o = {}) => {
    if (!geos.length) return null;
    const g = mergeGeometries(geos, false);
    if (!g) return null;
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.castShadow = !!o.cast;
    m.receiveShadow = o.recv !== false;
    if (o.order !== undefined) m.renderOrder = o.order;
    root.add(m);
    return m;
  };
  const propMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.35,
  });
  propMat.name = 'brickell-props';
  const pavMat = ladder(
    new THREE.MeshStandardMaterial({ map: pavingTex(), color: 0xd6d0c6, roughness: 0.42 }),
    'paving2',
  );
  pavMat.name = 'brickell-paving';
  const covMat = new THREE.MeshStandardMaterial({ map: groundCoverTex(), roughness: 0.95 });
  covMat.name = 'brickell-median';
  const lob = lobbyTex();
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x24343a,
    roughness: 0.06,
    metalness: 0.85,
    emissive: 0xffffff,
    emissiveMap: lob,
    emissiveIntensity: 0.05,
    envMapIntensity: 1.4,
  });
  glassMat.name = 'brickell-glass';
  const boardMat = new THREE.MeshStandardMaterial({
    map: valetTex(),
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  boardMat.name = 'brickell-valet';
  mk(props, propMat, 'brickell-props', { cast: true });
  mk(cover, covMat, 'brickell-median');
  mk(glass, glassMat, 'brickell-glass');
  mk(boards, boardMat, 'brickell-boards', { cast: true });
  // (glass: PlaneGeometry carries 0..1 UVs per panel -> the lobby texture once per front)
  // night glow: vertical wash up each trunk (crossed quads) and ground pools (one additive material, vertex attribute aK: 0 wash / 1 pool)
  const uNight = { value: 0 };
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uNight },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader:
      'attribute vec3 aG; varying vec3 vG; void main() { vG = aG; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uNight; varying vec3 vG; void main() {
      float a; if (vG.z < 0.5) { a = pow(1.0 - vG.y, 1.7) * pow(max(1.0 - abs(vG.x), 0.0), 2.2) * 0.34; } else { float r = length(vG.xy); a = pow(max(1.0 - r, 0.0), 2.0) * 0.42; }
      gl_FragColor = vec4(vec3(1.0, 0.7, 0.42) * a * uNight, 1.0); }`,
  });
  glowMat.name = 'brickell-glow';
  {
    const pos = [],
      ag = [];
    for (const [x, y, z, ry] of glowV)
      for (const a of [ry + Math.PI / 4, ry - Math.PI / 4]) {
        const c = Math.cos(a) * 0.75,
          s = -Math.sin(a) * 0.75,
          H = 9.5,
          y0 = y + 0.05;
        pos.push(
          x - c,
          y0,
          z - s,
          x + c,
          y0,
          z + s,
          x + c,
          y0 + H,
          z + s,
          x - c,
          y0,
          z - s,
          x + c,
          y0 + H,
          z + s,
          x - c,
          y0 + H,
          z - s,
        );
        ag.push(-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 0, 0, 1, 1, 0, -1, 1, 0);
      }
    for (const [x, y, z, r] of glowP) {
      pos.push(
        x - r,
        y,
        z - r,
        x - r,
        y,
        z + r,
        x + r,
        y,
        z + r,
        x - r,
        y,
        z - r,
        x + r,
        y,
        z + r,
        x + r,
        y,
        z - r,
      );
      ag.push(-1, -1, 1, -1, 1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, 1, -1, 1);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aG', new THREE.Float32BufferAttribute(ag, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, glowMat);
      m.name = 'brickell-glow';
      m.renderOrder = 5;
      m.visible = false;
      root.add(m);
    }
  }
  game.scene.add(root);

  // ---------------- colliders ----------------
  if (W && RP)
    for (const c of cols) {
      try {
        const d =
          c.t === 'b'
            ? RP.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setRotation({
                x: 0,
                y: Math.sin(c.ry / 2),
                z: 0,
                w: Math.cos(c.ry / 2),
              })
            : RP.ColliderDesc.cylinder(c.hh, c.r);
        W.createCollider(d.setTranslation(c.x, c.y, c.z));
      } catch (e) {
        /* */
      }
    }

  // ---------------- palms (vegetation library: LODs, trunk colliders, ground pass) ----------------
  let planted = false;
  const plant = () => {
    if (planted || !game.vegetation?.place) return;
    planted = true;
    for (const p of palms) {
      try {
        const r = game.vegetation.place('royal_palm', p.x, p.z, {
          y: p.y,
          keepY: true,
          onRoad: true,
          s: p.s,
          ry: p.ry,
        });
        if (!r?.item) (game.brickellRow.palmSkips ||= []).push(r?.skipped || '?');
      } catch (e) {
        game.brickellRow.palmErr = String(e);
      }
    }
  };

  // ---------------- per frame: night factor, near-only visibility ----------------
  let paved = false;
  function pavingReady() {
    const p = game.player?.position;
    if (!p || Math.hypot(p.x - CENTER.x, p.z - CENTER.z) > 320) return false;
    const ready = city.collidersReadyAt;
    if (!ready) return true;
    return edges.every((e) => {
      const q = G.pointAt(e, e.length / 2, {});
      return ready(q.x, q.z);
    });
  }
  const glow = root.getObjectByName('brickell-glow');
  game.updaters.push(() => {
    if (!planted) plant();
    if (!paved && pavingReady()) {
      paved = true;
      const cells = buildPaving();
      const m = mk(cells, pavMat, 'brickell-paving');
      game.brickellRow.pavingCells = cells.length;
      if (m) m.visible = true;
    }
    const cam = game.camera?.position;
    if (cam) root.visible = Math.hypot(cam.x - CENTER.x, cam.z - CENTER.z) < 700 + REACH;
    if (!root.visible) return;
    const h = game.timeOfDay ?? 12,
      n = h > 19.6 || h < 5.8 ? 1 : h > 18.4 ? (h - 18.4) / 1.2 : h < 7 ? (7 - h) / 1.2 : 0;
    uNight.value = n;
    if (glow) glow.visible = n > 0.01;
    glassMat.emissiveIntensity = 0.05 + 0.85 * n;
  });
  game.brickellRow = {
    root,
    edges: edges.map((e) => e.id),
    palms: palms.length,
    fronts: fronts.length,
    valets,
    medianLen: Math.round(medianLen),
    colliders: cols.length,
  };
}

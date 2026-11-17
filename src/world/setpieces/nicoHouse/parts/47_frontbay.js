// Nico's house, part 47: the street front under the house (the user's design, ref 43). An open carport bay under the
// raised living floor on a cracked, oil-stained slab; heavy peeling piers with vines; PVC drains, conduit and loose
// wiring under the joists; the weathered backboard with a bent orange rim and a frayed net on the front beam; the old box
// AC on a timber bracket and the electrical panel on the corner pier; the enclosed ground-level storage room on the right
// (worn white panel door, a window with one sash hanging open, ivy), a green wheelie bin and a rusty drum by the door,
// potted plants on the deck rail above, and the old dark-teal pickup parked in the left bay.
// Vines and pot plants are grown by part 50 from ctx.frontBay (it shares the plant atlas and sway shader there).
export const order = 47;

export async function build(ctx) {
  const { THREE, kit, plan: P, mat, col } = ctx;
  const B = ctx.ext;
  const D = ctx.detail;
  const M = kit.M;
  const PI = Math.PI;
  const r = kit.rng(4747);
  const rs = (a = 1) => (r() - 0.5) * 2 * a;
  const V = (c, a = 0.06) => kit.vary(c, r, a);
  const girBot = ctx.levels?.girBot ?? 2.44;
  const girTop = ctx.levels?.girTop ?? 2.73;
  const PAINT = mat.paint({ peel: 'a', fade: 0.22 });
  const PEEL = mat.paint({ peel: 'b', fade: 0.4, scale: 0.8 });
  const W = mat.wood();
  const CONC = mat.concrete();
  const SLAB = mat.concrete({ rep: 2.4 });
  const ST = mat.steel();
  const MP = mat.metalPaint();
  const PL = mat.plastic();
  const RUB = mat.rubber();
  const RUST = mat.rust();
  const GLASS = mat.glass();
  const TEAL = 0x3c9b9b;
  const frontZ = 2.8;
  const fb = ctx.frontBay = { vines: [], pots: [], net: null };

  // ---------- slab: three broom-finished panels with saw cuts, a long crack, oil and rust stains ----------
  const panels = [
    [-5.95, 0.9, 2.1, 8.2],
    [-3.7, 0.9, 2.3, 8.2],
    [-1.55, 1.3, 1.9, 7.4],
  ];
  for (const [cx, cz, sx, sz] of panels) {
    B.box(SLAB, sx - 0.02, 0.1, sz - 0.02, M(cx, 0.003 + rs(0.004), cz, rs(0.002), 0, rs(0.002)), {
      color: V(0xe2e0da, 0.04),
      wear: 0.95,
      bevel: 0.012,
      rand: r,
    });
  }
  // stains: soft dark decals (oil under the truck, rust rings from the drum, tire scuffs into the bay)
  const STAIN = mat.art('fb_stain', 256, 256, (g, w, h) => {
    const q = kit.rng(91);
    const grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(20,18,15,0.75)');
    grd.addColorStop(0.55, 'rgba(25,22,18,0.35)');
    grd.addColorStop(1, 'rgba(30,26,20,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(15,12,10,${q() * 0.3})`;
      g.beginPath();
      g.arc(w / 2 + (q() - 0.5) * w * 0.6, h / 2 + (q() - 0.5) * h * 0.6, 3 + q() * 14, 0, 7);
      g.fill();
    }
  }, { transparent: true });
  STAIN.transparent = true;
  STAIN.depthWrite = false;
  STAIN.polygonOffset = true;
  STAIN.polygonOffsetFactor = -2;
  const stain = (x, z, sx, sz, rot, c = 0xffffff) => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-PI / 2);
    B.geo(STAIN, g, M(x, 0.056, z, 0, rot, 0, sx, 1, sz), { color: c });
    g.dispose();
  };
  stain(-5.3, 1.6, 1.3, 0.9, 0.3);
  stain(-5.0, 0.2, 0.8, 0.6, 1.2);
  stain(-3.3, 3.6, 0.9, 2.6, 0.05, 0x8a8478);
  stain(-4.4, 4.2, 0.6, 2.2, -0.04, 0x8a8478);
  stain(-1.2, 3.4, 0.5, 0.5, 0, 0xa86a40);
  stain(-2.4, -1.2, 1.1, 0.8, 2.0);
  // cracks: thin dark wandering lines, a little sunk
  const crack = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      B.box(CONC, len + 0.01, 0.012, 0.008 + r() * 0.006, M((ax + bx) / 2, 0.05, (az + bz) / 2, 0, Math.atan2(-(bz - az), bx - ax), 0), {
        color: 0x2c2a26,
      });
    }
  };
  crack([[-6.9, 2.3], [-6.2, 2.1], [-5.6, 2.4], [-4.9, 2.2], [-4.6, 2.6]]);
  crack([[-3.4, 4.9], [-3.6, 3.9], [-3.3, 2.8], [-3.5, 1.6], [-3.2, 0.4]]);
  crack([[-2.4, 3.2], [-1.9, 3.4], [-1.3, 3.0]]);
  crack([[-4.7, -1.5], [-4.2, -1.0], [-3.9, -1.3]]);
  // weeds in the saw cuts and along the slab edge
  fb.weeds = [[-4.82, 4.9], [-2.6, 4.95], [-6.95, 3.4], [-6.9, -0.6], [-0.5, 4.95], [-4.82, 2.9]];
  col.box(-3.8, -0.02, 0.9, 6.4, 0.1, 8.2, { tag: 'ground', surface: 'concrete' });

  // ---------- heavy piers: concrete-sleeved piles, peeling white paint, grime at the foot ----------
  const pier = (x, z, s, h = girBot) => {
    const ry = rs(0.015);
    B.box(CONC, s, h - 0.25, s, M(x, 0.25 + (h - 0.25) / 2, z, rs(0.004), ry, rs(0.004)), {
      color: V(0xf0ede4, 0.03),
      wear: 0.9,
      bevel: 0.02,
      rand: r,
      shade: [0.78, 1.05],
    });
    // whitewash skin flaking off in sheets (thin peeling paint boxes on each face)
    for (const [fx, fz, ry2] of [[0, 1, 0], [1, 0, PI / 2], [0, -1, PI], [-1, 0, -PI / 2]]) {
      B.box(PEEL, s * 0.98, h - 0.5, 0.006, M(x + fx * (s / 2 + 0.003), 0.45 + (h - 0.5) / 2, z + fz * (s / 2 + 0.003), 0, ry + ry2, 0), {
        grain: 1,
        color: V(0xe9e6dc, 0.03),
        wear: [0.6, 0.3 + r() * 0.2],
        rand: r,
      });
    }
    B.box(CONC, s + 0.03, 0.32, s + 0.03, M(x, 0.16, z, 0, ry, 0), {
      color: V(0x8f8a7c, 0.06),
      wear: 0.9,
      bevel: 0.02,
      shade: [0.6, 0.95],
    });
    // chipped corners: small missing chunks shown as darker concrete
    for (let k = 0; k < 5; k++) {
      const y = 0.4 + r() * (h - 0.8);
      const sx = r() > 0.5 ? 1 : -1;
      const sz = r() > 0.5 ? 1 : -1;
      B.box(CONC, 0.05 + r() * 0.05, 0.06 + r() * 0.12, 0.05 + r() * 0.04, M(x + sx * s / 2, y, z + sz * s / 2, 0, PI / 4, 0), {
        color: 0x9a9384,
      });
    }
    col.box(x, h / 2, z, s + 0.02, h, s + 0.02, { tag: 'pile' });
  };
  pier(-6.4, frontZ, 0.5);
  pier(2.0, frontZ, 0.5);
  pier(-0.8, frontZ, 0.34);

  // ---------- heavy front beam face (the hoop hangs off it) ----------
  for (let x = -6.65, k = 0; x < 2.2; k++) {
    const len = Math.min(2.25 + r() * 1.2, 2.25 - x);
    B.box(W, len - 0.006, girTop - girBot + 0.02, 0.05, M(x + len / 2, (girTop + girBot) / 2, frontZ + 0.2, 0, 0, rs(0.002)), {
      grain: 0,
      color: V(0x8a8174, 0.1),
      wear: 0.75,
      bevel: 0.006,
      rand: r,
    });
    x += len;
  }

  // ---------- under-joist services: white PVC drains, gray conduit, loose wiring ----------
  const PVC = 0xe2e0d6;
  const pipe = (pts, rad, c = PVC) => B.tube(PL, pts, rad, { seg: 10, color: V(c, 0.03) });
  const yJ = girTop - 0.07;
  pipe([[-1.4, yJ - 0.02, 1.7], [-3.5, yJ - 0.02, 1.7], [-5.95, yJ - 0.04, 1.7], [-6.12, yJ - 0.06, 1.95], [-6.12, yJ - 0.2, 2.45]], 0.048);
  pipe([[-6.12, yJ - 0.2, 2.45], [-6.12, yJ - 0.24, 2.62], [-6.1, 2.0, 3.12], [-6.1, 0.42, 3.12]], 0.048);
  B.cyl(PL, 0.06, 0.06, 0.1, M(-6.1, 0.4, 3.12), { color: PVC, seg: 12 });
  B.cyl(PL, 0.057, 0.06, 0.06, M(-6.1, 0.06, 3.12), { color: PVC, seg: 12 });
  pipe([[-4.9, yJ, -3.0], [-4.9, yJ, 1.6]], 0.03);
  pipe([[-2.3, yJ + 0.01, -3.0], [-2.3, yJ + 0.01, 2.5], [-2.3, girBot - 0.05, 2.62]], 0.024);
  // pipe hangers: galvanized straps
  for (const [x, z] of [[-1.9, 1.7], [-3.1, 1.7], [-4.3, 1.7], [-5.5, 1.7], [-4.9, -2.0], [-4.9, -0.6], [-4.9, 0.8], [-2.3, -1.8], [-2.3, 0.4]]) {
    B.box(ST, 0.02, 0.1, 0.02, M(x, yJ + 0.06, z), { color: 0x9da09c });
  }
  // conduit along the beam from the pier panel, with offset bends at every joist
  B.tube(ST, [[1.6, 1.0, frontZ + 0.29], [1.6, girBot - 0.05, frontZ + 0.29], [1.4, girBot + 0.05, frontZ + 0.25], [-0.5, girBot + 0.08, frontZ + 0.25], [-1.1, girBot + 0.2, frontZ + 0.1], [-1.1, yJ, 1.0], [-1.1, yJ, -2.5]], 0.012, {
    seg: 6,
    color: 0x8f938f,
  });
  // loose wiring: catenaries between the joists, some drooping down; they move in the wind
  const wires = new THREE.Group();
  const wb = kit.batch('fb_wires');
  const sag = (a, b, s, rad = 0.005, c = 0x1b1b1a) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * PI) * s, a[2] + (b[2] - a[2]) * t]);
    }
    wb.tube(RUB, pts, rad, { seg: 4, color: c });
  };
  sag([-0.9, yJ, 2.2], [-3.4, yJ, 2.25], 0.22);
  sag([-3.4, yJ, 2.25], [-5.2, yJ, 2.0], 0.3, 0.004, 0x3a3a38);
  sag([-1.8, yJ, -0.5], [-1.8, yJ, 1.9], 0.18, 0.004, 0xd8d4c8);
  sag([-5.4, yJ, 0.2], [-6.2, yJ, 2.4], 0.4);
  sag([-2.9, yJ, 2.5], [-2.95, girBot - 0.75, 2.6], 0.02, 0.004, 0x3a3a38);
  wb.build(wires);
  ctx.groups.dyn.add(wires);
  // a bare bulb socket on the joists
  B.cyl(PL, 0.04, 0.05, 0.08, M(-3.0, yJ - 0.02, 0.4), { color: 0xd8d0b8, seg: 10 });
  B.geo(mat.emissive(0xffd9a0, 0.3, 'fb_bulb'), new THREE.SphereGeometry(0.035, 10, 8), M(-3.0, yJ - 0.1, 0.4), {});

  // ---------- backboard, rim and net on the beam ----------
  const bbx = -3.3;
  const bbz = frontZ + 0.32;
  const bby = 2.72;
  const BOARD = mat.art('fb_board', 512, 384, (g, w, h) => {
    const q = kit.rng(43);
    g.fillStyle = '#e4e0d4';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${q() > 0.5 ? '120,110,90' : '160,150,130'},${q() * 0.08})`;
      g.fillRect(q() * w, q() * h, 1 + q() * 6, 1 + q() * 3);
    }
    // grime runs from the top edge and around the bolts
    for (let i = 0; i < 70; i++) {
      const x = q() * w;
      const len = 20 + q() * 150;
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, `rgba(90,80,62,${0.12 + q() * 0.2})`);
      grd.addColorStop(1, 'rgba(90,80,62,0)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 2 + q() * 6, len);
    }
    g.strokeStyle = 'rgba(55,58,60,0.85)';
    g.lineWidth = 12;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.lineWidth = 10;
    g.strokeRect(w / 2 - 82, h - 168, 164, 124);
    // faded and flaked paint on the box and border
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${0.3 + q() * 0.6})`;
      g.fillRect(q() * w, q() * h, 1 + q() * 5, 1 + q() * 3);
    }
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#d6d1c2';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    // ball marks
    for (let i = 0; i < 22; i++) {
      g.fillStyle = `rgba(80,70,55,${0.06 + q() * 0.1})`;
      g.beginPath();
      g.arc(w / 2 + (q() - 0.5) * 240, h * 0.55 + (q() - 0.5) * 180, 18 + q() * 10, 0, 7);
      g.fill();
    }
  });
  for (const sx of [-0.4, 0.4]) {
    B.box(W, 0.089, 0.95, 0.038, M(bbx + sx, bby, bbz - 0.08), { grain: 1, color: V(0x8d857a), wear: 0.7, rand: r });
  }
  for (const y of [bby - 0.3, bby + 0.3]) {
    B.box(W, 1.02, 0.089, 0.038, M(bbx, y, bbz - 0.04), { grain: 0, color: V(0x8d857a), wear: 0.7, rand: r });
  }
  B.box(mat.pbr('plywood', { rep: 1.2 }), 1.22, 0.86, 0.02, M(bbx, bby, bbz, 0, 0, 0.012), { color: V(0xd9d2c0), wear: 0.85, bevel: 0.003 });
  {
    const g = new THREE.PlaneGeometry(1.22, 0.86);
    B.geo(BOARD, g, M(bbx, bby, bbz + 0.0105, 0, 0, 0.012), {});
    g.dispose();
  }
  for (const [dx, dy] of [[-0.4, 0.3], [0.4, 0.3], [-0.4, -0.3], [0.4, -0.3]]) {
    B.cyl(RUST, 0.012, 0.012, 0.012, M(bbx + dx, bby + dy, bbz + 0.015, PI / 2), { color: 0x8a7a6a, seg: 8 });
  }
  col.box(bbx, bby, bbz, 1.22, 0.86, 0.06, { tag: 'backboard', surface: 'wood' });
  // rim: bent, on a rusty bracket
  const OR = 0xc4531c;
  const rimY = bby - 0.36;
  const rimZ = bbz + 0.05 + 0.24;
  B.geo(MP, new THREE.TorusGeometry(0.2335, 0.009, 6, 32), M(bbx, rimY, rimZ, PI / 2 + 0.06, 0, 0.03), { color: OR });
  B.box(MP, 0.15, 0.13, 0.008, M(bbx, rimY - 0.04, bbz + 0.02), { color: kit.mul(OR, 0.8) });
  B.box(MP, 0.12, 0.008, 0.06, M(bbx, rimY, bbz + 0.05), { color: OR });
  for (const s of [-1, 1]) {
    B.rod(MP, [bbx + s * 0.05, rimY - 0.09, bbz + 0.03], [bbx + s * 0.16, rimY - 0.005, rimZ - 0.17], 0.005, { color: kit.mul(OR, 0.75) });
  }
  // rust runs under the bracket
  B.box(RUST, 0.03, 0.12, 0.002, M(bbx + 0.03, rimY - 0.15, bbz + 0.012), { color: 0x9a6a48 });
  // net: its own swaying group, frayed and torn on one side
  {
    const net = new THREE.Group();
    net.position.set(bbx, rimY, rimZ);
    const nb = kit.batch('fb_net');
    const NC = 0xd9d4c6;
    const rings = [[0.232, -0.01], [0.205, -0.09], [0.178, -0.17], [0.158, -0.25], [0.146, -0.33], [0.142, -0.4]];
    const pt = (k, i) => {
      const [rad, y] = rings[k];
      const a = (i + (k % 2) * 0.5) / 12 * PI * 2;
      const j = k ? 0.008 : 0;
      return [Math.cos(a) * rad + rs(j), y + rs(j), Math.sin(a) * rad + rs(j)];
    };
    const N = rings.map((_, k) => Array.from({ length: 12 }, (_, i) => pt(k, i)));
    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < 12; i++) {
        if ((k >= 2 && i >= 7 && i <= 9) || (k >= 3 && r() < 0.25)) continue;
        nb.rod(MP, N[k][i], N[k + 1][i], 0.003, { seg: 4, color: kit.vary(NC, r, 0.05) });
        nb.rod(MP, N[k][i], N[k + 1][(i + 11) % 12], 0.003, { seg: 4, color: kit.vary(NC, r, 0.05) });
      }
    }
    // frayed strands hanging loose
    for (const i of [7, 8, 9, 3]) {
      const a = N[2][i];
      nb.tube(MP, [a, [a[0] * 1.05, -0.36, a[2] * 1.05], [a[0] * 0.95, -0.5 - r() * 0.08, a[2] * 1.1]], 0.0028, { seg: 4, color: NC });
    }
    nb.build(net);
    ctx.groups.dyn.add(net);
    fb.net = net;
  }
  // the ball lying by the room pier, and the hoop interaction
  const BALL = mat.art('fb_ball', 512, 256, (g, w, h) => {
    const q = kit.rng(12);
    g.fillStyle = '#b8551f';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${q() > 0.5 ? '90,35,10' : '220,120,60'},${q() * 0.25})`;
      g.fillRect(q() * w, q() * h, 1.5, 1.5);
    }
    g.strokeStyle = '#1d1712';
    g.lineWidth = 5;
    for (const x of [0, w / 4, w / 2, (3 * w) / 4]) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
    g.fillStyle = 'rgba(70,60,45,0.35)';
    g.fillRect(0, h * 0.62, w, h * 0.38);
  });
  D.geo(BALL, new THREE.SphereGeometry(0.12, 28, 18), M(-2.7, 0.17, 4.1, 0.4, 2.2, 0.3), {});
  ctx.addInteract({
    id: 'hoop',
    kind: 'activity',
    label: 'Shoot hoops',
    pos: [bbx, 1.2, 4.6],
    radius: 2.4,
    use(env) {
      env.emit('activity:hoops', { rim: [bbx, rimY, rimZ] });
    },
  });
  ctx.anchors.hoop = { pos: new THREE.Vector3(bbx, 0, 6.2), heading: PI };
  // player spawn outside: on the drive in front of the carport bay, facing the house
  ctx.anchors.spawnYard = { pos: new THREE.Vector3(-2.2, 0, 9.5), heading: PI };
  // test tools (s1-tour `house` spot) look for anchors.front: the same yard spot, so shots land in the yard, never in the bay
  ctx.anchors.front = { pos: new THREE.Vector3(-2.2, 0, 11.5), heading: PI };
  ctx.anchors.hoopRim = { pos: new THREE.Vector3(bbx, rimY, rimZ), heading: 0 };

  // ---------- the storage room: turquoise board walls, white panel door, window with a sash hanging open ----------
  // wall from a to b (plan points), boards vertical, openings [u0, u1, y0, y1] cut out
  const wall = (ax, az, bx, bz, y0, y1, holes = [], o = {}) => {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const ry = Math.atan2(-uz, ux);
    const bw = 0.17;
    for (let u = 0, i = 0; u < len - 0.02; u += bw, i++) {
      const u1 = Math.min(len, u + bw - 0.008);
      const uc = (u + u1) / 2;
      let free = [[y0, y1]];
      for (const [h0, h1, hy0, hy1] of holes) {
        if (u1 > h0 && u < h1) {
          free = free.flatMap(([a, b]) => (hy1 <= a || hy0 >= b) ? [[a, b]] : [[a, Math.min(b, hy0)], [Math.max(a, hy1), b]].filter(([p, q]) => q - p > 0.03));
        }
      }
      const tone = kit.mix(V(TEAL, 0.12), 0x9fbcb6, r() * 0.25);
      const wr = 0.35 + r() * 0.35;
      for (const [a, b] of free) {
        B.box(PAINT, u1 - u, b - a, 0.022, M(ax + ux * uc, (a + b) / 2, az + uz * uc, 0, ry, rs(0.004)), {
          grain: 1,
          color: tone,
          wear: [Math.min(1, wr + 0.45), wr],
          bevel: 0.003,
          rand: r,
        });
      }
    }
    // rails behind the boards, seen through the gaps
    for (const y of [0.35, (y0 + y1) / 2, y1 - 0.2]) {
      B.box(W, len, 0.09, 0.04, M((ax + bx) / 2 - Math.sin(ry) * 0, y, (az + bz) / 2, 0, ry, 0).multiply(M(0, 0, -0.035)), {
        grain: 0,
        color: 0x4a4238,
        wear: 0.5,
      });
    }
    if (o.collide !== false) {
      col.box((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, len, y1 - y0, 0.1, { ry, tag: 'wall' });
    }
  };
  const roomTop = girBot;
  const fz = frontZ + 0.08;
  wall(-1.0, -0.2, -1.0, frontZ - 0.15, 0.06, roomTop);
  wall(-0.97, fz, 1.75, fz, 0.06, roomTop, [[1.36, 2.26, 0.06, 2.12]]);
  wall(2.22, frontZ + 0.25, 2.22, 4.32, 0.06, roomTop);
  wall(2.2, 4.4, 6.5, 4.4, 0.06, roomTop, [[0.9, 2.1, 0.92, 2.08]]);
  wall(6.5, 4.4, 6.5, -0.2, 0.06, roomTop);
  wall(6.5, -0.2, -1.0, -0.2, 0.06, roomTop);
  // dark inside: a plywood ceiling under the joists so no daylight leaks in from above
  B.box(mat.pbr('plywood', { rep: 1.2 }), 7.5, 0.02, 4.6, M(2.75, roomTop - 0.01, 2.1), { color: 0x6a6258, wear: 0.4 });
  // door: six-panel white door, grimy at the latch and the bottom, in a weathered casing
  {
    const dx = -0.97 + 1.81;
    const dz = fz + 0.02;
    const DOOR = 0xe6e2d6;
    B.box(PEEL, 0.82, 2.03, 0.04, M(dx, 0.08 + 1.015, dz), { grain: 2, color: DOOR, wear: [0.42, 0.18], bevel: 0.004, rand: r });
    for (const [px, py, pw, ph] of [[-0.19, 1.7, 0.28, 0.48], [0.19, 1.7, 0.28, 0.48], [-0.19, 1.05, 0.28, 0.6], [0.19, 1.05, 0.28, 0.6], [-0.19, 0.38, 0.28, 0.5], [0.19, 0.38, 0.28, 0.5]]) {
      B.box(PEEL, pw, ph, 0.012, M(dx + px, 0.08 + py, dz + 0.024), { grain: 2, color: kit.mul(DOOR, 0.96), wear: 0.25 + r() * 0.2, bevel: 0.01, rand: r });
    }
    for (const s of [-1, 1]) {
      B.box(PAINT, 0.08, 2.15, 0.03, M(dx + s * 0.45, 1.13, dz + 0.012), { grain: 1, color: V(0xdcd8cb), wear: 0.8, bevel: 0.004, rand: r });
    }
    B.box(PAINT, 1.0, 0.09, 0.03, M(dx, 2.2, dz + 0.012), { grain: 0, color: V(0xdcd8cb), wear: 0.8, bevel: 0.004 });
    B.cyl(mat.chrome(), 0.028, 0.028, 0.05, M(dx + 0.33, 1.0, dz + 0.04, PI / 2), { color: 0x8a8070, seg: 12 });
    B.box(MP, 0.06, 0.14, 0.006, M(dx + 0.33, 1.0, dz + 0.023), { color: 0x7a7266 });
    B.box(STAIN, 0.3, 0.4, 0.002, M(dx + 0.3, 1.05, dz + 0.031), { color: 0xffffff });
    B.box(CONC, 1.0, 0.06, 0.28, M(dx, 0.03, dz + 0.16), { color: 0xa8a294, bevel: 0.01 });
  }
  // window in the forward wall: white frame, fixed left sash, right sash hanging open off one hinge
  {
    const wx = 2.2 + 1.5;
    const wz = 4.42;
    const y0 = 0.92;
    const y1 = 2.08;
    const FR = 0xe1ddd1;
    for (const s of [-1, 1]) {
      B.box(PAINT, 0.07, y1 - y0 + 0.1, 0.06, M(wx + s * 0.63, (y0 + y1) / 2, wz + 0.02), { grain: 1, color: V(FR), wear: 0.75, rand: r });
    }
    B.box(PAINT, 1.36, 0.07, 0.06, M(wx, y1 + 0.03, wz + 0.02), { grain: 0, color: V(FR), wear: 0.75, rand: r });
    B.box(PAINT, 1.44, 0.05, 0.1, M(wx, y0 - 0.02, wz + 0.05), { grain: 0, color: V(FR), wear: 0.85, rand: r });
    B.box(PAINT, 0.05, y1 - y0, 0.05, M(wx, (y0 + y1) / 2, wz + 0.02), { grain: 1, color: V(FR), wear: 0.7, rand: r });
    const sash = (cx, cz, ry, rz) => {
      const m0 = M(cx, (y0 + y1) / 2, cz, 0, ry, rz);
      const L = (x, y, z) => m0.clone().multiply(M(x, y, z));
      const sw = 0.56;
      const sh = y1 - y0 - 0.04;
      for (const s of [-1, 1]) B.box(PAINT, 0.045, sh, 0.035, L(s * (sw / 2 - 0.022), 0, 0), { grain: 1, color: V(FR), wear: 0.7, rand: r });
      for (const s of [-1, 1]) B.box(PAINT, sw, 0.045, 0.035, L(0, s * (sh / 2 - 0.022), 0), { grain: 0, color: V(FR), wear: 0.7, rand: r });
      B.box(PAINT, sw, 0.025, 0.02, L(0, 0, 0), { grain: 0, color: V(FR), wear: 0.6, rand: r });
      B.box(GLASS, sw - 0.08, sh - 0.08, 0.004, L(0, 0, 0), {});
    };
    sash(wx - 0.3, wz + 0.01, 0, 0);
    // open sash: top hinge torn, swung out about 40 degrees and dropped at the free corner
    {
      const hx = wx + 0.6;
      const a = 0.72;
      sash(hx - Math.cos(a) * 0.28, wz + 0.03 + Math.sin(a) * 0.28, a, -0.06);
    }
    // what is inside: a dark room with shelves (only shapes show)
    B.box(W, 1.2, 0.03, 0.4, M(wx, 1.6, wz - 0.4), { grain: 0, color: 0x3a3228 });
    B.box(PL, 0.35, 0.25, 0.3, M(wx - 0.3, 1.75, wz - 0.42), { color: 0x2f4f6a, bevel: 0.01 });
    B.box(PL, 0.3, 0.2, 0.3, M(wx + 0.25, 1.72, wz - 0.42), { color: 0x7a5a2a, bevel: 0.01 });
  }
  // lattice infill in the triangles between the room, the pier and the deck above
  {
    const L = 0xe3ddcc;
    const lat = (ax, az, bx, bz, y0, y1) => {
      const len = Math.hypot(bx - ax, bz - az);
      const ry = Math.atan2(-(bz - az), bx - ax);
      const base = M(ax, y0, az, 0, ry, 0);
      const h = y1 - y0;
      const sp = 0.11 * Math.SQRT2;
      for (const s of [-1, 1]) {
        for (let c = -h; c < len; c += sp) {
          let xa = s > 0 ? c : c + h;
          let ya = 0;
          let xb = s > 0 ? c + h : c;
          let yb = h;
          if (xa < 0) { ya += -xa; xa = 0; }
          if (xa > len) { ya += xa - len; xa = len; }
          if (xb > len) { yb -= xb - len; xb = len; }
          if (xb < 0) { yb -= -xb; xb = 0; }
          const l = Math.hypot(xb - xa, yb - ya);
          if (l < 0.06 || r() < 0.03) continue;
          B.box(PEEL, l, 0.036, 0.007, base.clone().multiply(M((xa + xb) / 2, (ya + yb) / 2, s * 0.004, 0, 0, Math.atan2(yb - ya, xb - xa))), {
            color: V(L, 0.04),
            wear: 0.55 + r() * 0.3,
          });
        }
      }
      for (const y of [0.02, h - 0.02]) B.box(PEEL, len, 0.045, 0.03, base.clone().multiply(M(len / 2, y, 0)), { grain: 0, color: V(L), wear: 0.6 });
    };
    lat(2.3, 4.47, 6.45, 4.47, roomTop, F_DECK(P) - 0.05);
    lat(-0.95, fz + 0.03, 1.75, fz + 0.03, roomTop, girTop);
  }

  // ---------- electrical panel on the corner pier, old box AC on a timber bracket above it ----------
  {
    const px = 2.0;
    const pz = frontZ + 0.26;
    B.box(MP, 0.4, 0.56, 0.12, M(px, 1.42, pz + 0.06), { color: 0xc9c7bc, bevel: 0.01, wear: 0.6 });
    B.box(MP, 0.34, 0.48, 0.012, M(px, 1.42, pz + 0.125), { color: 0xd2d0c4, bevel: 0.004 });
    B.box(RUST, 0.38, 0.06, 0.01, M(px, 1.16, pz + 0.123), { color: 0x9a7050 });
    B.box(MP, 0.04, 0.06, 0.02, M(px + 0.14, 1.42, pz + 0.135), { color: 0x2a2a28 });
    B.cyl(ST, 0.016, 0.016, 1.0, M(px - 0.12, 0.65, pz + 0.04), { color: 0x8f938f, seg: 8 });
    B.cyl(ST, 0.016, 0.016, 0.9, M(px + 0.12, 2.1, pz + 0.04), { color: 0x8f938f, seg: 8 });
    // AC: cream steel case, louvered sides, rust at the drip edge, on two 2x6 brackets with knee struts
    const ax = 2.15;
    const ay = girBot - 0.3;
    const az = frontZ + 0.62;
    for (const s of [-0.24, 0.24]) {
      B.box(W, 0.045, 0.14, 0.62, M(ax + s, ay - 0.31, az - 0.06), { grain: 2, color: V(0x8a8072), wear: 0.7, rand: r });
      B.strut(W, [ax + s, ay - 0.36, az + 0.2], [ax + s, ay - 0.95, pz + 0.04], 0.045, 0.09, { color: V(0x8a8072), wear: 0.7, rand: r });
    }
    B.box(MP, 0.66, 0.46, 0.6, M(ax, ay, az), { color: 0xd3d0c3, bevel: 0.02, wear: 0.7 });
    const LOUV = mat.art('fb_acl', 128, 128, (g, w, h) => {
      g.fillStyle = '#b9b6aa';
      g.fillRect(0, 0, w, h);
      for (let y = 6; y < h; y += 8) {
        g.fillStyle = '#4a4a46';
        g.fillRect(6, y, w - 12, 4);
      }
      g.fillStyle = 'rgba(130,70,30,0.4)';
      g.fillRect(0, h - 14, w, 14);
    });
    for (const s of [-1, 1]) B.box(LOUV, 0.004, 0.36, 0.5, M(ax + s * 0.332, ay, az), {});
    B.box(LOUV, 0.6, 0.38, 0.004, M(ax, ay, az + 0.302), {});
    B.box(RUST, 0.62, 0.03, 0.02, M(ax, ay - 0.22, az + 0.3), { color: 0x9a6a44 });
    B.tube(RUB, [[ax - 0.2, ay - 0.23, az + 0.1], [ax - 0.22, ay - 0.6, az + 0.12], [ax - 0.3, 0.5, az + 0.1]], 0.008, { seg: 5, color: 0x2a2a28 });
    col.box(ax, ay, az, 0.7, 0.5, 0.62, { tag: 'prop' });
  }

  // ---------- by the door: green wheelie bin and a rusty steel drum ----------
  {
    const bx = -0.32;
    const bz = fz + 0.5;
    const G = 0x2c5a3c;
    const body = new THREE.CylinderGeometry(0.33, 0.27, 1.0, 4, 1, true);
    body.rotateY(PI / 4);
    body.scale(1, 1, 1.25);
    const bm = M(bx, 0.62, bz, 0, 0.12, 0);
    B.geo(PL, body, bm, { color: V(G, 0.05) });
    body.dispose();
    B.box(PL, 0.5, 0.012, 0.6, M(bx, 0.13, bz, 0, 0.12, 0), { color: kit.mul(G, 0.8) });
    B.box(PL, 0.5, 0.05, 0.62, M(bx, 1.14, bz, 0.05, 0.12, 0), { color: V(G, 0.05), bevel: 0.015 });
    for (const s of [-1, 1]) B.cyl(RUB, 0.1, 0.1, 0.05, M(bx + s * 0.22, 0.1, bz - 0.32, 0, 0, PI / 2), { color: 0x1c1c1c, seg: 14 });
    B.box(STAIN, 0.4, 0.5, 0.002, M(bx, 0.55, bz + 0.37, 0, 0.12, 0), {});
    col.box(bx, 0.6, bz, 0.6, 1.2, 0.7, { tag: 'prop' });
    // drum
    const dx = 0.3;
    const dz = fz + 0.4;
    B.cyl(RUST, 0.29, 0.29, 0.88, M(dx, 0.5, dz), { color: 0xa07a5c, seg: 22 });
    for (const y of [0.3, 0.7]) B.geo(RUST, new THREE.TorusGeometry(0.292, 0.012, 5, 22), M(dx, y, dz, PI / 2, 0, 0), { color: 0x7a5a40 });
    B.cyl(RUST, 0.28, 0.28, 0.01, M(dx, 0.945, dz), { color: 0x6a4a34, seg: 22 });
    col.cyl(dx, 0.5, dz, 0.3, 0.95, { tag: 'prop' });
  }

  // ---------- potted plants on the front deck rail (plants grown by part 50) ----------
  const TERRA = mat.pbr('plywood', { rep: 0.4 });
  const railY = P.F + (P.rail?.h ?? 1.07) + 0.02;
  for (const [x, z, s] of [[0.67, 5.9, 1.0], [0.67, 7.2, 0.85]]) {   // (the corner pot at (1.4, 7.88) sat in the mock-up camera's face: removed)
    B.cyl(mat.ceramic(), 0.11 * s, 0.08 * s, 0.17 * s, M(x, railY + 0.085 * s, z), { color: V(0xb05f3a, 0.06), seg: 16 });
    B.cyl(mat.ceramic(), 0.118 * s, 0.118 * s, 0.03 * s, M(x, railY + 0.16 * s, z), { color: V(0xa0583a, 0.06), seg: 16 });
    B.cyl(TERRA, 0.1 * s, 0.1 * s, 0.01, M(x, railY + 0.15 * s, z), { color: 0x3a2c20, seg: 14 });
    fb.pots.push([x, railY + 0.155 * s, z, s]);
  }

  // ---------- vines: up the two heavy piers and the room wall beside the open window ----------
  const climb = (x, z, nx, nz, h, wander, n = 1) => {
    for (let k = 0; k < n; k++) {
      const pts = [];
      let px = x + rs(0.06);
      for (let y = 0.05; y < h; y += 0.15) {
        px += rs(wander);
        pts.push([px + nx * 0.02, y, z + nz * 0.02]);
      }
      fb.vines.push({ pts, n: [nx, nz] });
    }
  };
  climb(-6.4 + 0.18, frontZ + 0.26, 0, 1, 2.3, 0.05, 2);
  climb(-6.66, frontZ + 0.1, -1, 0, 1.9, 0.04, 1);
  climb(2.0 - 0.16, frontZ + 0.26, 0, 1, 1.4, 0.04, 1);
  for (let k = 0; k < 5; k++) climb(2.35 + k * 0.14, 4.43, 0, 1, 1.4 + r() * 1.0, 0.05, 1);

  // ---------- the old pickup in the left bay (shared car bodies; static, parked) ----------
  ctx.async.push((async () => {
    try {
      const cm = await import('../../../../vehicles/carModel2.js');
      const key = cm.CAR_TYPES.ridgeback_mid ? 'ridgeback_mid' : 'pickup';
      const look = cm.rollLook(key, 4318);
      look.color = 0x23494a;
      look.wear = { ...(look.wear || {}), dirt: 0.4, rust: 0.45, fade: 0.3, seed: 7 };
      look.twoTone = null;
      const car = cm.buildCar(key, look, {});
      car.root.position.set(-5.2, 0.055, -0.1);
      car.shell.position.y = 0;
      for (const w of car.wheels) {
        w.steer.position.set(w.x, w.r, w.z);
        if (w.front) w.steer.rotation.y = -0.18;
      }
      car.root.rotation.y = 0.04;
      car.root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      ctx.groups.detail.add(car.root);
      fb.truck = car;
    } catch (e) {
      console.warn('[nicoHouse] pickup model unavailable', e);
    }
  })());
  col.box(-5.2, 0.95, -0.1, 1.95, 1.9, 5.1, { tag: 'vehicle', ry: 0.04 });
  ctx.anchors.truck = { pos: new THREE.Vector3(-5.2, 0, -0.1), heading: 0.04 };

  // ---------- wind: net, wires ----------
  const t0 = performance.now();
  ctx.updaters.push((dt, env) => {
    const t = (performance.now() - t0) / 1000;
    const w = env.game?.wind;
    const sp = w ? (w.speed ?? 3) * (0.6 + (w.gust ?? 0.4)) : 3 + Math.sin(t * 0.3) * 1.5;
    const dx = w?.dir?.x ?? 0.7;
    const dz = w?.dir?.y ?? 0.7;
    const k = Math.min(1, sp / 8);
    const f = Math.sin(t * 2.3) * 0.5 + Math.sin(t * 5.1 + 1) * 0.25;
    if (fb.net) {
      fb.net.rotation.x = dz * k * (0.12 + 0.06 * f);
      fb.net.rotation.z = -dx * k * (0.12 + 0.06 * f);
    }
    wires.rotation.x = k * 0.004 * f;
    wires.position.z = k * 0.01 * f;
  });
}

function F_DECK(P) {
  return P.F - (P.deckBoard?.t ?? 0.038) - 0.24;
}

// Nico's house, part 45: the lived-in clutter under and around the house. Basketball hoop on the porch rim, the workbench
// in the middle carport bay, fishing and boat gear (rod rack, lobster and crab traps, coolers, outboard on a stand, the
// longboard slung under the joists, the beach cruiser), utility things (hose reel, trash cans, grill, lumber, wheelbarrow,
// clothesline) and the yard (rope hammock, spool table and fire pit, mailbox, conch shell rows, buoy cluster).
// Own procedural models plus CC0 Poly Haven props (see credits_45_carport.txt). House-local meters.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAILBOX } from '../yard.data.js';
export const order = 45;

export async function build(ctx) {
  const { THREE, kit, mat, col } = ctx, D = ctx.detail, M = kit.M, PI = Math.PI, SZ = ctx.plan.stairW.dz || 0;   // SZ: the west stair's move (plan.js)
  const r = kit.rng(4501), V = (c, a = 0.06) => kit.vary(c, r, a), rs = (a = 1) => (r() - 0.5) * 2 * a;
  const W = mat.wood(), PLY = mat.pbr('plywood', { rep: 1.2 }), CONC = mat.concrete(), RUST = mat.rust(), RUSTL = mat.rustLight(), STEEL = mat.steel(), CHROME = mat.chrome(),
    PL = mat.plastic(), PLG = mat.plasticGloss(), RUB = mat.rubber(), MP = mat.metalPaint(), MATTE = mat.matte(), ROCK = mat.pbr('coral_stone_wall', { rep: 0.9 });
  const ROPE = 0xb9a882, GALV = 0xaeb3b2;

  // ---------- helpers ----------
  // an object frame: every call takes coordinates local to the frame
  const obj = (x, y, z, ry = 0, rx = 0, rz = 0) => {
    const base = M(x, y, z, rx, ry, rz);
    const o = {
      base,
      m: (lx = 0, ly = 0, lz = 0, a = 0, b = 0, c = 0, sx = 1, sy = sx, sz = sx) => kit.mulM(base, M(lx, ly, lz, a, b, c, sx, sy, sz)),
      p: (q) => { const v = new THREE.Vector3(q[0], q[1], q[2]).applyMatrix4(base); return [v.x, v.y, v.z]; },
      box: (mt, sx, sy, sz, lx, ly, lz, opt = {}, a = 0, b = 0, c = 0) => { D.box(mt, sx, sy, sz, o.m(lx, ly, lz, a, b, c), { bevel: 0.004, rand: r, ...opt }); return o; },
      cyl: (mt, rt, rb, h, lx, ly, lz, opt = {}, a = 0, b = 0, c = 0) => { D.cyl(mt, rt, rb, h, o.m(lx, ly, lz, a, b, c), { seg: 12, ...opt }); return o; },
      rod: (mt, a, b, rad, opt = {}) => { D.rod(mt, o.p(a), o.p(b), rad, { seg: 6, ...opt }); return o; },
      strut: (mt, a, b, w, t, opt = {}) => { D.strut(mt, o.p(a), o.p(b), w, t, { bevel: 0.003, rand: r, ...opt }); return o; },
      tube: (mt, pts, rad, opt = {}) => { D.tube(mt, pts, rad, { seg: 5, ...opt, m4: base }); return o; },
      geo: (mt, g, lm, opt = {}) => { D.geo(mt, g, lm ? kit.mulM(base, lm) : base, opt); return o; },
      sph: (mt, rad, lx, ly, lz, opt = {}, sx = 1, sy = 1, sz = 1, a = 0, b = 0, c = 0) => { D.geo(mt, new THREE.SphereGeometry(rad, opt.ws ?? 10, opt.hs ?? 7), o.m(lx, ly, lz, a, b, c, sx, sy, sz), opt); return o; },
      tor: (mt, R, t, lx, ly, lz, a = 0, b = 0, c = 0, opt = {}) => { D.geo(mt, new THREE.TorusGeometry(R, t, opt.rs ?? 5, opt.ts ?? 18, opt.arc ?? PI * 2), o.m(lx, ly, lz, a, b, c, 1, 1, opt.flat ?? 1), opt); return o; },
      sub: (lx, ly, lz, ry2 = 0, rx2 = 0, rz2 = 0) => { const s = obj(0, 0, 0); s.base.copy(o.m(lx, ly, lz, rx2, ry2, rz2)); return s; },
    };
    return o;
  };
  // inside-facing copy of an open shell (buckets, cans, bins)
  const flip = (g) => { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } const n = g.attributes.normal.array; for (let i = 0; i < n.length; i++) n[i] = -n[i]; return g; };
  const openCyl = (o, mt, rt, rb, h, lx, ly, lz, opt = {}, inner = opt.color) => {
    o.geo(mt, new THREE.CylinderGeometry(rt, rb, h, opt.seg ?? 16, 1, true), M(lx, ly + h / 2, lz), opt);
    o.geo(mt, flip(new THREE.CylinderGeometry(rt * 0.97, rb * 0.97, h, opt.seg ?? 16, 1, true)), M(lx, ly + h / 2, lz), { ...opt, color: inner });
    o.cyl(mt, rb, rb, 0.004, lx, ly + 0.004, lz, { ...opt, color: inner });
  };
  // CC0 props: all placements of one model material end up in one mesh
  const jobs = [], prop = (id, m4, o = {}) => jobs.push({ id, m4, ...o });

  // ---------- art ----------
  const AT = (px, py, pw, ph) => ({ uvMul: [pw / 1024, ph / 1024], uvOff: [px / 1024, 1 - (py + ph) / 1024] });
  const REG = { mail: AT(0, 0, 512, 128), stencil: AT(512, 0, 256, 128), doormat: AT(0, 128, 512, 320), sprayA: AT(0, 448, 256, 128), sprayB: AT(256, 448, 256, 128), coffee: AT(0, 576, 256, 128), oil: AT(256, 576, 128, 128), dive: AT(384, 576, 128, 96), tape: AT(512, 576, 256, 64) };
  const HAND = '"Marker Felt", "Chalkboard SE", "Bradley Hand", "Comic Sans MS", cursive';
  const ATLAS = mat.art('cp_atlas', 1024, 1024, (g) => {
    const q = kit.rng(77);
    const hand = (txt, x, y, px, colr) => { let cx = x; g.font = `700 ${px}px ${HAND}`; g.textBaseline = 'alphabetic'; for (const ch of txt) { g.save(); g.translate(cx, y + (q() - 0.5) * px * 0.1); g.rotate((q() - 0.5) * 0.14); g.fillStyle = colr; g.fillText(ch, 0, 0); g.restore(); cx += g.measureText(ch).width * (0.98 + q() * 0.1); } };
    // mailbox: hand-painted house number and name, brush drips, flaked
    hand('118', 10, 104, 104, '#ebe6d6'); hand('NICO', 262, 98, 80, '#ebe6d6');
    g.fillStyle = '#ebe6d6'; for (const [x, y, l] of [[58, 104, 18], [150, 100, 24], [300, 96, 14], [420, 98, 22]]) g.fillRect(x, y, 4, l);
    g.font = '700 104px "Stencil", "Arial Black", Impact, sans-serif'; g.fillStyle = '#e6e2d6'; g.fillText('118', 536, 106);
    g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${0.4 + q() * 0.6})`; g.fillRect(q() * 768, q() * 128, 1 + q() * 2.5, 1 + q() * 2); } g.globalCompositeOperation = 'source-over';
    // door mat: coir with a faded border and a fish
    g.fillStyle = '#8b6c46'; g.fillRect(0, 128, 512, 320);
    for (let i = 0; i < 9000; i++) { g.strokeStyle = `rgba(${q() > 0.5 ? '205,170,120' : '60,42,26'},${0.15 + q() * 0.3})`; g.lineWidth = 1; const x = q() * 512, y = 128 + q() * 320; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (q() - 0.5) * 6, y + (q() - 0.5) * 6); g.stroke(); }
    g.strokeStyle = 'rgba(48,34,24,0.7)'; g.lineWidth = 14; g.strokeRect(26, 154, 460, 268); g.lineWidth = 4; g.strokeRect(46, 174, 420, 228);
    g.fillStyle = 'rgba(48,34,24,0.62)'; g.beginPath(); g.ellipse(240, 288, 120, 46, 0, 0, 6.3); g.fill(); g.beginPath(); g.moveTo(345, 288); g.lineTo(420, 240); g.lineTo(404, 288); g.lineTo(420, 336); g.closePath(); g.fill();
    g.fillStyle = '#8b6c46'; g.beginPath(); g.arc(160, 276, 7, 0, 6.3); g.fill();
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(150,135,110,${0.1 + q() * 0.2})`; g.beginPath(); g.ellipse(120 + q() * 280, 230 + q() * 130, 10 + q() * 40, 6 + q() * 20, q() * 3, 0, 6.3); g.fill(); }
    // spray can wraps (generic, unbranded)
    const wrap = (x, y, bg, band, t1, t2) => { g.fillStyle = bg; g.fillRect(x, y, 256, 128); g.fillStyle = band; g.fillRect(x, y + 34, 256, 44); g.fillStyle = '#f2efe6'; g.font = kit.font(22, 800); g.fillText(t1, x + 12, y + 64); g.font = kit.font(11, 600); g.fillText(t2, x + 12, y + 100); g.fillText(t1, x + 140, y + 100);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${q() > 0.6 ? '110,70,40' : '235,235,225'},${q() * 0.35})`; g.fillRect(x + q() * 256, y + q() * 128, 2 + q() * 14, 1 + q() * 3); } };
    wrap(0, 448, '#b5352c', '#1c1c1c', 'PENETRATING OIL', 'loosens rusted parts  12 oz'); wrap(256, 448, '#2c5f8f', '#e7a821', 'MARINE PRIMER', 'gray  fast dry  12 oz');
    // coffee can
    g.fillStyle = '#7a221c'; g.fillRect(0, 576, 256, 128); g.fillStyle = '#d9b25a'; g.fillRect(0, 590, 256, 8); g.fillRect(0, 684, 256, 8); g.fillStyle = '#e9dcc0'; g.font = `700 30px Georgia, serif`; g.fillText('COFFEE', 128, 640); g.font = kit.font(11, 600); g.fillText('dark roast  2 lb', 138, 664);
    g.fillStyle = '#e6dcc0'; g.fillRect(14, 618, 100, 40); g.fillStyle = '#23201c'; g.font = `700 26px ${HAND}`; g.fillText('BOLTS', 22, 648);
    for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(90,50,25,${q() * 0.4})`; g.fillRect(q() * 256, 576 + q() * 128, 2 + q() * 10, 2 + q() * 8); }
    // 2-cycle oil bottle label
    g.fillStyle = '#e3c22f'; g.fillRect(256, 576, 128, 128); g.fillStyle = '#1b1b1b'; g.fillRect(256, 612, 128, 34); g.fillStyle = '#f0ede2'; g.font = kit.font(19, 800); g.fillText('2-CYCLE', 268, 637); g.fillStyle = '#1b1b1b'; g.font = kit.font(12, 700); g.fillText('OUTBOARD OIL', 268, 668);
    // diver-down flag sticker
    g.fillStyle = '#c4282a'; g.fillRect(384, 576, 128, 96); g.strokeStyle = '#f2f0ea'; g.lineWidth = 22; g.beginPath(); g.moveTo(384, 576); g.lineTo(512, 672); g.stroke(); g.fillStyle = 'rgba(240,235,225,0.25)'; for (let i = 0; i < 30; i++) g.fillRect(384 + q() * 128, 576 + q() * 96, 1 + q() * 8, 1);
    // strip of masking tape with marker writing
    g.fillStyle = '#e4d9b8'; g.fillRect(512, 576, 256, 64); g.fillStyle = '#26221d'; g.font = `700 34px ${HAND}`; g.fillText('2 STROKE 50:1', 524, 622);
  }, { alphaTest: 0.5 });
  const label = (o, reg, w, h, lx, ly, lz, a = 0, b = 0, c = 0) => o.geo(ATLAS, new THREE.PlaneGeometry(w, h), M(lx, ly, lz, a, b, c), reg);
  const wrapLabel = (o, reg, rad, h, lx, ly, lz, a = 0, b = 0, c = 0) => o.geo(ATLAS, new THREE.CylinderGeometry(rad, rad, h, 14, 1, true), M(lx, ly, lz, a, b, c), reg);

  const BOARD = mat.art('cp_backboard', 512, 384, (g, w, h) => {
    const q = kit.rng(12);
    g.fillStyle = '#a89878'; g.fillRect(0, 0, w, h);                                   // bare weathered plywood underneath
    for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${q() > 0.5 ? '70,58,44' : '190,176,150'},${0.1 + q() * 0.25})`; g.lineWidth = 1 + q() * 2; const y = q() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (q() - 0.5) * 16, w * 0.7, y + (q() - 0.5) * 16, w, y + (q() - 0.5) * 10); g.stroke(); }
    // white paint that has flaked: painted as many overlapping blobs so the edges are ragged
    const paint = document.createElement('canvas'); paint.width = w; paint.height = h; const p = paint.getContext('2d');
    p.fillStyle = '#e4e0d2'; p.fillRect(0, 0, w, h);
    p.strokeStyle = 'rgba(214,104,44,0.9)'; p.lineWidth = 22; p.strokeRect(256 - 137, 109, 274, 206); p.lineWidth = 12; p.strokeRect(8, 8, w - 16, h - 16);   // shooter's square and border, faded orange
    for (let i = 0; i < 3000; i++) { p.fillStyle = `rgba(228,224,210,${q() * 0.5})`; p.fillRect(q() * w, q() * h, 1 + q() * 4, 1 + q() * 3); }                    // chalking over the orange
    p.globalCompositeOperation = 'destination-out';
    const flake = (x, y, n, sp, sz) => { for (let i = 0; i < n; i++) { p.beginPath(); p.ellipse(x + (q() - 0.5) * sp, y + (q() - 0.5) * sp * 0.7, 2 + q() * sz, 2 + q() * sz * 0.6, q() * 3, 0, 6.3); p.fill(); } };
    for (let x = 0; x < w; x += 26) flake(x, h - 6, 14, 40, 16);                                         // bottom edge rots first
    flake(40, 40, 60, 110, 14); flake(470, 330, 80, 120, 16); flake(300, 200, 40, 90, 10); flake(150, 300, 50, 80, 12); flake(256, 330, 70, 140, 12);   // around the rim mount where the ball hits
    for (let i = 0; i < 500; i++) { p.fillRect(q() * w, q() * h, 1 + q() * 3, 1 + q() * 6); }
    g.drawImage(paint, 0, 0);
    for (let i = 0; i < 46; i++) { const x = q() * w, y0 = q() * h * 0.5, l = 60 + q() * 260, sg = g.createLinearGradient(0, y0, 0, y0 + l); sg.addColorStop(0, 'rgba(70,60,44,0)'); sg.addColorStop(0.2, `rgba(70,60,44,${0.12 + q() * 0.25})`); sg.addColorStop(1, 'rgba(70,60,44,0)'); g.fillStyle = sg; g.fillRect(x, y0, 3 + q() * 12, l); }   // water stains
    const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, 'rgba(40,46,30,0.05)'); lg.addColorStop(0.8, 'rgba(40,46,30,0.1)'); lg.addColorStop(1, 'rgba(40,46,30,0.42)'); g.fillStyle = lg; g.fillRect(0, 0, w, h);                            // mildew toward the bottom
    for (const [x, y] of [[92, 80], [420, 80], [92, 330], [420, 330]]) { g.fillStyle = '#4a3a2c'; g.beginPath(); g.arc(x, y, 6, 0, 6.3); g.fill(); g.fillStyle = 'rgba(110,60,30,0.35)'; g.fillRect(x - 3, y, 6, 50); }                                         // bolt heads with rust tears
  });
  const BALL = mat.art('cp_ball', 512, 256, (g, w, h) => {
    const q = kit.rng(5); g.fillStyle = '#a9562a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${q() > 0.5 ? '150,120,100' : '120,60,30'},${0.12 + q() * 0.2})`; g.beginPath(); g.ellipse(q() * w, q() * h, 20 + q() * 60, 10 + q() * 30, q() * 3, 0, 6.3); g.fill(); }   // faded and scuffed patches
    for (let i = 0; i < 16000; i++) { g.fillStyle = `rgba(60,26,10,${0.25 + q() * 0.3})`; g.fillRect(q() * w, q() * h, 1.6, 1.6); }                                                                                           // pebbling
    g.strokeStyle = '#1d1512'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (const x of [0, w / 2, w]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (const x of [w / 4, w * 3 / 4]) { g.beginPath(); g.ellipse(x, h / 2, w * 0.13, h * 0.36, 0, 0, 6.3); g.stroke(); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(200,190,170,${0.1 + q() * 0.15})`; g.fillRect(q() * w, q() * h, 4 + q() * 30, 1 + q() * 2); }
  }, { rough: 0.9 });
  // pegboard: tempered hardboard with holes on a 1 in. grid and marker outlines of the tools that live there
  const PEGW = 1.9, PEGH = 1.0, pegPx = (x, y) => [(x / PEGW + 0.5) * 1024, (0.5 - y / PEGH) * 512];
  const PEG = mat.art('cp_pegboard', 1024, 512, (g, w, h) => {
    const q = kit.rng(8); g.fillStyle = '#806246'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${q() > 0.5 ? '50,36,24' : '170,140,105'},${0.05 + q() * 0.1})`; g.beginPath(); g.ellipse(q() * w, q() * h, 30 + q() * 120, 20 + q() * 60, q() * 3, 0, 6.3); g.fill(); }
    g.fillStyle = 'rgba(205,205,195,0.5)'; for (let i = 0; i < 500; i++) g.fillRect(130 + q() * 150 + q() * 60, 330 + q() * 110, 1 + q() * 3, 1 + q() * 3);                 // primer overspray
    g.fillStyle = '#1c140e'; for (let y = 7; y < h; y += 13.7) for (let x = 7; x < w; x += 13.7) { g.beginPath(); g.arc(x, y, 2.1, 0, 6.3); g.fill(); }
    g.strokeStyle = 'rgba(18,16,14,0.85)'; g.lineWidth = 3.2; g.lineJoin = 'round';
    const outline = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => { const [px, py] = pegPx(x, y); if (i) g.lineTo(px + (q() - 0.5) * 2, py + (q() - 0.5) * 2); else g.moveTo(px, py); }); g.closePath(); g.stroke(); };
    outline([[-0.93, 0.26], [-0.74, 0.27], [-0.72, 0.21], [-0.2, 0.17], [-0.2, 0.1], [-0.74, 0.08], [-0.93, 0.07]]);          // handsaw
    outline([[-0.09, 0.26], [0.07, 0.26], [0.07, 0.19], [0.015, 0.19], [0.015, -0.1], [-0.035, -0.1], [-0.035, 0.19], [-0.09, 0.19]]);   // hammer
    outline([[0.17, 0.22], [0.25, 0.22], [0.235, 0.12], [0.225, -0.06], [0.185, -0.06], [0.18, 0.12]]);                         // adjustable wrench
    outline([[0.35, 0.2], [0.41, 0.2], [0.42, -0.02], [0.4, -0.02], [0.38, 0.1], [0.36, -0.02], [0.34, -0.02]]);                // pliers
    for (const x of [0.52, 0.595]) outline([[x - 0.018, 0.18], [x + 0.018, 0.18], [x + 0.018, 0.07], [x + 0.006, 0.05], [x + 0.006, -0.1], [x - 0.006, -0.1], [x - 0.006, 0.05], [x - 0.018, 0.07]]);
    for (let i = 0; i < 4; i++) { const x = 0.7 + i * 0.062, l = 0.2 - i * 0.03; outline([[x - 0.016, 0.24], [x + 0.016, 0.24], [x + 0.008, 0.2], [x + 0.008, 0.24 - l], [x + 0.016, 0.2 - l], [x - 0.016, 0.2 - l], [x - 0.008, 0.24 - l], [x - 0.008, 0.2]]); }   // wrench set, mostly missing
    outline([[-0.5, -0.1], [-0.3, -0.1], [-0.3, -0.34], [-0.5, -0.34]]); outline([[-0.46, -0.14], [-0.34, -0.14], [-0.34, -0.3], [-0.46, -0.3]]);                // framing square
    g.fillStyle = '#e9e2c6'; g.fillRect(820, 330, 120, 86); g.fillStyle = '#2a2622'; g.font = `700 17px ${HAND}`; g.fillText('tides', 832, 352); g.font = `400 14px ${HAND}`; for (let i = 0; i < 3; i++) g.fillText(['hi 6:10a', 'lo 12:40p', 'hi 6:55p'][i], 832, 372 + i * 16);
  }, { rough: 0.85 });
  const NET = mat.art('cp_castnet', 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(226,232,214,0.95)'; g.lineWidth = 2.2;
    for (let i = -8; i < 16; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i * 32 + 256, 0); g.lineTo(i * 32, 256); g.stroke(); }
  }, { transparent: true, side: THREE.DoubleSide, rough: 0.6, flat: true });
  NET.map.wrapS = NET.map.wrapT = THREE.RepeatWrapping; NET.depthWrite = false;
  const BULB = mat.emissive(0xffd39a, 0.9, 'cp_bulb');

  // ---------- shared small things ----------
  const bottle = (o, x, y, z, c = 0x4a2c12, lying = 0, ry = 0) => { const s = o.sub(x, y + (lying ? 0.031 : 0), z, ry, lying ? PI / 2 : 0);
    s.cyl(PLG, 0.03, 0.031, 0.13, 0, 0.065, 0, { color: c, seg: 10 }).cyl(PLG, 0.013, 0.03, 0.045, 0, 0.152, 0, { color: c, seg: 10 }).cyl(PLG, 0.013, 0.013, 0.05, 0, 0.2, 0, { color: c, seg: 8 }); };
  const canAl = (o, x, y, z, c, lying = 0, ry = 0) => { const s = o.sub(x, y + (lying ? 0.033 : 0), z, ry, lying ? PI / 2 : 0); s.cyl(MP, 0.033, 0.033, 0.118, 0, 0.06, 0, { color: c, seg: 10 }).cyl(STEEL, 0.029, 0.033, 0.006, 0, 0.121, 0, { color: 0xc9cccc, seg: 10 }); };
  // foam fishing buoy: bullet shape, painted bands (the made-up color code of this house: teal over yellow with a red ring)
  const CODE = [0x1f8a8a, 0xd9b526, 0xb5332a], buoyG = new Map();
  const buoy = (o, x, y, z, a = 0, b = 0, c = 0, bands = CODE, s = 1, kind = 0) => {
    const key = kind + ':' + bands.join(','); let g = buoyG.get(key);
    if (!g) {
      const prof = kind === 1 ? [[0, -0.14], [0.05, -0.13], [0.1, -0.08], [0.125, 0], [0.1, 0.08], [0.05, 0.13], [0, 0.14]] : [[0, -0.19], [0.05, -0.18], [0.075, -0.12], [0.078, 0.02], [0.07, 0.1], [0.05, 0.16], [0.02, 0.19], [0, 0.19]];
      g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 12); const pa = g.attributes.position, cols = new Float32Array(pa.count * 3), q = kit.rng(bands[0]);
      for (let i = 0; i < pa.count; i++) { const t = (pa.getY(i) - prof[0][1]) / (prof[prof.length - 1][1] - prof[0][1]); const cc = kit.rgb(t > 0.52 ? bands[0] : t > 0.44 ? bands[2] : bands[1]), k = 0.82 + q() * 0.25; cols[i * 3] = cc[0] * k; cols[i * 3 + 1] = cc[1] * k; cols[i * 3 + 2] = cc[2] * k; }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); buoyG.set(key, g);
    }
    D.geo(PL, g, o.m(x, y, z, a, b, c, s), { keepColor: true });
  };
  const coil = (o, x, y, z, R, n, rad, c = ROPE, a = 0) => { const pts = []; for (let i = 0; i <= n * 14; i++) { const t = i / 14 * PI * 2; pts.push([x + Math.cos(t) * (R + Math.sin(i * 0.9) * rad), y + rad + i / (n * 14) * rad * 2.2 * Math.min(n, 3) + Math.sin(i * 1.7) * rad * 0.4, z + Math.sin(t) * (R + Math.cos(i * 1.3) * rad)]); } o.tube(MATTE, pts, rad, { color: c, seg: 5, steps: n * 28 }); };
  const bucket = (o, x, y, z, c, fill) => { const s = o.sub(x, y, z, r() * 6);
    openCyl(s, PL, 0.148, 0.128, 0.37, 0, 0, 0, { color: c, seg: 16 }, kit.mul(c, 0.8)); s.tor(PL, 0.15, 0.008, 0, 0.365, 0, PI / 2, 0, 0, { color: c, rs: 4, ts: 16 }); s.tor(PL, 0.146, 0.006, 0, 0.3, 0, PI / 2, 0, 0, { color: c, rs: 4, ts: 16 });
    if (fill != null) s.cyl(MATTE, 0.14, 0.14, 0.004, 0, 0.3, 0, { color: fill, seg: 14 });
    return s; };

  // 1. The basketball hoop moved to the front beam over the carport bay (part 47)

  // =====================================================================================================================
  // 2. Workbench against the back X-brace of the middle bay
  // =====================================================================================================================
  let lamp, propeller;
  {
    const o = obj(-2.2, 0, -2.62), TOP = 0.9, wc = () => V(0x93846e, 0.1);
    // oil-stained concrete pavers
    for (let i = 0; i < 6; i++) for (let k = 0; k < 5; k++) { const oily = (i === 2 || i === 3) && k >= 1 && k <= 2; D.box(CONC, 0.4, 0.05, 0.4, M(-3.25 + i * 0.42 + rs(0.006), 0.012 + rs(0.002), -2.74 + k * 0.42 + rs(0.006), rs(0.006), rs(0.02), rs(0.006)), { bevel: 0.006, color: V(oily ? 0x7d7564 : 0xbdb6a6, 0.1), wear: oily ? 1 : 0.6, rand: r }); }
    for (const [x, z, s] of [[-2.35, -1.75, 0.2], [-2.05, -1.95, 0.13], [-2.55, -2.02, 0.09], [-1.7, -1.6, 0.06]]) D.cyl(PLG, s, s, 0.002, M(x, 0.041, z, 0, r() * 3, 0, 1, 1, 0.7), { seg: 9, color: 0x15120f });
    // 2x4 frame
    for (const sx of [-0.9, 0, 0.9]) o.box(W, 0.089, TOP - 0.038, 0.038, sx, (TOP - 0.038) / 2, 0.28, { grain: 1, color: wc(), wear: 0.5 });
    for (const sx of [-0.9, 0.9]) { o.box(W, 0.089, 2.02, 0.038, sx, 1.01, -0.3, { grain: 1, color: wc(), wear: 0.5 }); for (const y of [TOP - 0.083, 0.24]) o.box(W, 0.038, 0.089, 0.54, sx, y, -0.01, { grain: 2, color: wc(), wear: 0.5 }); }
    for (const z of [0.318, -0.262]) o.box(W, 1.89, 0.089, 0.038, 0, TOP - 0.083, z, { grain: 0, color: wc(), wear: 0.5 });
    o.box(W, 1.89, 0.089, 0.038, 0, 0.24, -0.262, { grain: 0, color: wc(), wear: 0.5 });
    for (const z of [-0.19, -0.01, 0.17]) o.box(W, 1.78, 0.019, 0.17, 0, 0.294, z, { grain: 0, color: wc(), wear: 0.7 });
    o.box(PLY, 1.96, 0.019, 0.68, 0, TOP - 0.0285, 0.02, { color: V(0xdcccaa), wear: 0.6, bevel: 0.002 }).box(PLY, 1.96, 0.019, 0.68, 0, TOP - 0.0095, 0.02, { color: V(0xc9b48c), wear: 1, bevel: 0.003 });
    for (const [x, z, s, c] of [[0.3, 0.12, 0.07, 0x1c1814], [-0.3, 0.05, 0.11, 0x2a221a], [0.75, 0.22, 0.05, 0x1c1814], [-0.6, -0.12, 0.05, 0x3a3020]]) o.cyl(PLG, s, s, 0.0012, x, TOP + 0.0005, z, { seg: 10, color: c });
    o.box(MATTE, PEGW, PEGH, 0.006, 0, 1.47, -0.278, { color: 0x705640, bevel: 0.001 }); o.geo(PEG, new THREE.PlaneGeometry(PEGW, PEGH), M(0, 1.47, -0.2745));
    o.box(W, 1.9, 0.019, 0.17, 0, 2.0, -0.215, { grain: 0, color: wc(), wear: 0.6 }); for (const sx of [-0.6, 0.6]) o.strut(W, [sx, 1.99, -0.14], [sx, 1.86, -0.27], 0.03, 0.019, { color: wc() });
    col.box(-2.2, 0.5, -2.62, 2.0, 1.0, 0.72, { tag: 'furniture' });
    // tools on the pegboard (hooks are short wire pegs)
    prop('handsaw_wood', o.m(-0.82, 1.64, -0.262, 0, PI / 2, 0)); prop('cross_pein_hammer', o.m(-0.01, 1.53, -0.26)); prop('adjustable_wrench', o.m(0.225, 1.47, -0.252)); prop('pliers', o.m(0.38, 1.61, -0.26)); prop('screwdrivers_02', o.m(0.595, 1.5, -0.258, PI / 2, 0, 0));
    for (const [x, y] of [[-0.86, 1.71], [-0.3, 1.63], [-0.05, 1.67], [0.04, 1.67], [0.19, 1.66], [0.24, 1.66], [0.36, 1.66], [0.4, 1.66], [0.5, 1.64], [0.545, 1.64], [0.575, 1.64], [0.62, 1.64], [0.7, 1.68], [0.76, 1.68], [0.82, 1.68]]) o.rod(STEEL, [x, y, -0.275], [x, y + 0.008, -0.235], 0.0022, { seg: 4, color: 0x9a9c9a });
    // bench top
    prop('bench_vice_01', o.m(-0.72, TOP + 0.09, 0.19, 0, 0, 0)); prop('metal_toolbox', o.m(-0.12, TOP, -0.07, 0, 0.14, 0)); prop('boombox', o.m(0.58, TOP, -0.17, 0, -0.22, 0)); prop('lambis_shell', o.m(-0.72, 2.01, -0.2, 0, 0.6, 0, 1.5));
    { const c = o.sub(-0.4, TOP, 0.2, 0.5); openCyl(c, STEEL, 0.052, 0.052, 0.14, 0, 0, 0, { color: 0xa9aaa6, seg: 14 }, 0x6f6a60); wrapLabel(c, REG.coffee, 0.0527, 0.12, 0, 0.07, 0, 0, 2.2, 0); c.cyl(RUSTL, 0.049, 0.049, 0.004, 0, 0.1, 0, { color: 0x6b5a48 });
      for (let i = 0; i < 9; i++) c.cyl(RUSTL, 0.007, 0.007, 0.035 + r() * 0.03, rs(0.03), 0.105 + r() * 0.01, rs(0.03), { seg: 6, color: V(0x8a8076, 0.2) }, rs(1.2), 0, rs(1.2)); }
    const spray = (s, reg, cap, lying) => { const b = lying ? s.sub(0, 0.033, 0, 0, PI / 2) : s; b.cyl(STEEL, 0.033, 0.033, 0.17, 0, 0.085, 0, { color: 0xb9bcba, seg: 14 }); wrapLabel(b, reg, 0.0335, 0.125, 0, 0.082, 0); b.sph(STEEL, 0.033, 0, 0.17, 0, { color: 0xc4c6c4 }, 1, 0.45, 1); b.cyl(PL, 0.016, 0.018, 0.035, 0, 0.196, 0, { color: cap, seg: 10 }); };
    spray(o.sub(0.25, 2.01, -0.2, 0.4), REG.sprayA, 0xb5352c); spray(o.sub(0.36, 2.01, -0.22, 2.2), REG.sprayB, 0x8d9296); spray(o.sub(0.9, TOP, 0.2, 0.7), REG.sprayA, 0xb5352c, true);
    { const b = o.sub(0.52, 2.01, -0.2, -0.3); b.box(PL, 0.075, 0.17, 0.045, 0, 0.085, 0, { color: 0x23262a, bevel: 0.012 }).cyl(PL, 0.014, 0.014, 0.035, -0.015, 0.185, 0, { color: 0xc4282a, seg: 8 }); label(b, REG.oil, 0.062, 0.085, 0, 0.085, 0.0232); }
    for (const [x, c] of [[0.72, 0xd8d4c8], [0.86, 0x3f8f96]]) { const p = o.sub(x, 2.01, -0.2, r() * 3); p.cyl(STEEL, 0.054, 0.054, 0.12, 0, 0.06, 0, { color: 0xa6a8a6, seg: 14 }).cyl(STEEL, 0.056, 0.056, 0.006, 0, 0.121, 0, { color: 0x8e9090, seg: 14 }); for (let i = 0; i < 5; i++) p.box(MP, 0.012 + r() * 0.02, 0.03 + r() * 0.06, 0.002, Math.cos(i * 1.3) * 0.0545, 0.1 - r() * 0.03, Math.sin(i * 1.3) * 0.0545, { color: c, bevel: 0.001 }, 0, -i * 1.3 + PI / 2, 0); p.tube(STEEL, [[-0.054, 0.08, 0], [0, 0.17, 0.01], [0.054, 0.08, 0]], 0.002, { color: 0x8a8c8a, seg: 4 }); }
    o.box(STEEL, 0.22, 0.008, 0.024, 0.2, TOP + 0.004, 0.28, { color: 0x5a5c5e, bevel: 0.002 }, 0, 0.08, 0); for (let i = 0; i < 8; i++) { if (i === 5) continue; o.cyl(CHROME, 0.007 + i * 0.0011, 0.007 + i * 0.0011, 0.026, 0.105 + i * 0.027, TOP + 0.021, 0.28 - (i - 3.5) * 0.0022, { seg: 8, color: 0xd0d2d2 }); }
    o.cyl(CHROME, 0.0125, 0.0125, 0.026, 0.42, TOP + 0.0125, 0.2, { seg: 8, color: 0xd0d2d2 }, 0, 0.6, PI / 2);
    const wrench = (x, z, ry, len) => { const w = o.sub(x, TOP + 0.003, z, ry); w.box(CHROME, len, 0.004, 0.011, 0, 0, 0, { color: 0xc6c8c8, bevel: 0.0015 }); w.tor(CHROME, 0.009, 0.0038, len / 2 + 0.007, 0, 0, PI / 2, 0, 0, { color: 0xc6c8c8, rs: 4, ts: 10 }); for (const s of [-1, 1]) w.box(CHROME, 0.02, 0.004, 0.006, -len / 2 - 0.007, 0, s * 0.008, { color: 0xc6c8c8, bevel: 0.001 }, 0, s * 0.25, 0); };
    wrench(-0.25, 0.26, 0.5, 0.15); wrench(-0.12, 0.21, -0.35, 0.12); wrench(0.64, 0.27, 2.9, 0.18);
    o.cyl(MATTE, 0.055, 0.055, 0.048, 0.33, TOP + 0.024, 0.02, { color: 0x8b8e90, seg: 16 }).cyl(MATTE, 0.038, 0.038, 0.049, 0.33, TOP + 0.0245, 0.02, { color: 0x6f5a42, seg: 12 });                          // duct tape
    bottle(o, -0.9, TOP, -0.1); o.box(MATTE, 0.1, 0.012, 0.07, 0.72, TOP + 0.006, 0.24, { color: 0xc9b07c, bevel: 0.002 }, 0, 0.3, 0);                                                                     // beer bottle, sanding block
    // an aluminum prop off an outboard
    propeller = (s, sc = 1) => { s.cyl(STEEL, 0.034 * sc, 0.04 * sc, 0.1 * sc, 0, 0, 0, { color: 0x4d4f52, seg: 12 }).cyl(STEEL, 0.02 * sc, 0.034 * sc, 0.04 * sc, 0, 0.07 * sc, 0, { color: 0x4d4f52, seg: 12 }).cyl(RUB, 0.022 * sc, 0.022 * sc, 0.102 * sc, 0, 0, 0, { color: 0x1a1a1a, seg: 8 });
      for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; D.geo(STEEL, new THREE.SphereGeometry(1, 10, 6), kit.mulM(s.base, M(0, 0, 0, 0, a, 0), M(0.095 * sc, 0, 0, 0.62, 0, 0, 0.075 * sc, 0.006 * sc, 0.062 * sc)), { color: V(0x5b5d60, 0.1) }); } };
    propeller(o.sub(-0.42, TOP + 0.05, -0.12, 0.3));
    // carburetor on a shop rag
    { const c = o.sub(0.12, TOP, 0.17, 0.5); const rg = new THREE.PlaneGeometry(0.3, 0.27, 8, 8); rg.rotateX(-PI / 2); const pa = rg.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, 0.003 + 0.004 * Math.sin(pa.getX(i) * 40) * Math.cos(pa.getZ(i) * 33) + 0.003 * Math.sin(pa.getZ(i) * 71)); rg.computeVertexNormals();
      c.geo(mat.fabric('cotton_jersey'), rg, M(0, 0, 0, 0, 0.3, 0), { color: 0x9b3a34, uvMul: [1.2, 1.2] });
      c.box(STEEL, 0.07, 0.055, 0.075, 0, 0.065, 0, { color: 0xa9aba8, bevel: 0.006 }).cyl(STEEL, 0.034, 0.03, 0.035, 0, 0.022, 0, { color: 0x9c9e9b }).cyl(STEEL, 0.026, 0.026, 0.1, 0, 0.068, 0, { color: 0x8f918e }, PI / 2).cyl(RUB, 0.021, 0.021, 0.101, 0, 0.068, 0, { color: 0x161616 }, PI / 2)
        .box(STEEL, 0.085, 0.07, 0.008, 0, 0.068, -0.05, { color: 0x9a9c99, bevel: 0.002 }).cyl(STEEL, 0.004, 0.004, 0.02, 0.03, 0.1, 0.02, { color: 0xc8b25a, seg: 6 }).cyl(STEEL, 0.004, 0.004, 0.02, -0.03, 0.1, -0.02, { color: 0xc8b25a, seg: 6 }).box(STEEL, 0.006, 0.05, 0.012, 0.04, 0.085, 0.01, { color: 0x6d6f6c, bevel: 0.001 }, 0, 0, 0.5);
      c.cyl(STEEL, 0.006, 0.006, 0.012, 0.11, 0.009, 0.06, { color: 0xc8b25a, seg: 6 }, PI / 2, 0.4).cyl(STEEL, 0.005, 0.005, 0.02, 0.09, 0.008, -0.07, { color: 0x8f918e, seg: 6 }, PI / 2, 1.4); }
    // lower shelf: battery, paint cans, extension cord
    { const b = o.sub(0.5, 0.304, 0.0, 0.1); b.box(PL, 0.24, 0.18, 0.17, 0, 0.09, 0, { color: 0x1d1f22, bevel: 0.008 }).box(PL, 0.24, 0.02, 0.17, 0, 0.19, 0, { color: 0x2c4f8a, bevel: 0.006 }); for (const s of [-1, 1]) b.cyl(STEEL, 0.009, 0.011, 0.022, s * 0.085, 0.21, 0.05, { color: 0x8f9296, seg: 8 }); b.tube(RUB, [[-0.085, 0.2, 0.1], [0, 0.26, 0.06], [0.085, 0.2, 0.1]], 0.006, { color: 0x1a1a1a }); }
    for (const [x, z, c] of [[-0.62, -0.05, 0xd9a63c], [-0.42, 0.05, 0xdfd9c8], [-0.56, -0.02, 0x3f8f96]]) { const up = c === 0x3f8f96 ? 0.19 : 0; const p = o.sub(x, 0.304 + up, z, r() * 3); p.cyl(STEEL, 0.085, 0.085, 0.185, 0, 0.0925, 0, { color: 0xa6a8a6, seg: 16 }).cyl(STEEL, 0.088, 0.088, 0.008, 0, 0.187, 0, { color: 0x8e9090, seg: 16 }); for (let i = 0; i < 6; i++) p.box(MP, 0.015 + r() * 0.03, 0.04 + r() * 0.1, 0.002, Math.cos(i * 1.1) * 0.0856, 0.17 - r() * 0.05, Math.sin(i * 1.1) * 0.0856, { color: c, bevel: 0.001 }, 0, -i * 1.1 + PI / 2, 0); }
    for (let i = 0; i < 3; i++) o.tor(PL, 0.13 + rs(0.008), 0.011, 0.02 + rs(0.01), 0.318 + i * 0.021, 0.0 + rs(0.01), PI / 2, 0, 0, { color: V(0xcf6a1c), rs: 5, ts: 20 });
    // trouble light hanging from a joist, cord run back to the bench post
    { const l = obj(-1.95, 1.72, -2.28, 0, 0.05, 0.07); l.cyl(PL, 0.021, 0.019, 0.13, 0, 0, 0, { color: 0xd3a215 }).cyl(PL, 0.03, 0.023, 0.03, 0, 0.078, 0, { color: 0xd3a215 });
      l.geo(BULB, new THREE.SphereGeometry(0.03, 10, 8), M(0, 0.135, 0, 0, 0, 0, 1, 1.25, 1));
      const sh = () => new THREE.CylinderGeometry(0.05, 0.05, 0.13, 10, 1, true, 0, PI); l.geo(STEEL, sh(), M(0, 0.15, 0, 0, PI / 2, 0), { color: 0xb9bcba }); l.geo(STEEL, flip(sh()), M(0, 0.15, 0, 0, PI / 2, 0), { color: 0xd9dcda });
      for (let i = 0; i < 5; i++) { const a = -PI / 2 + (i + 0.5) / 5 * PI; l.rod(STEEL, [Math.sin(a) * 0.05, 0.085, Math.cos(a) * 0.05], [Math.sin(a) * 0.05, 0.215, Math.cos(a) * 0.05], 0.0016, { seg: 4, color: 0xa6a8a6 }); }
      for (const y of [0.09, 0.215]) l.tor(STEEL, 0.05, 0.002, 0, y, 0, PI / 2, 0, 0, { color: 0xa6a8a6, rs: 4, ts: 14 });
      l.tor(STEEL, 0.014, 0.002, 0, 0.236, 0, 0, 0, 0, { color: 0xa6a8a6, rs: 4, ts: 10 }); l.rod(STEEL, [0, 0.25, 0], [0.02, 1.0, 0.0], 0.0012, { seg: 4, color: 0x8a8c8a });
      D.tube(RUB, [[-1.955, 1.655, -2.28], [-1.93, 1.4, -2.3], [-1.72, 1.42, -2.42], [-1.52, 2.25, -2.62], [-1.36, 2.7, -2.86], [-1.3, 2.3, -2.94], [-1.3, 1.36, -2.94]], 0.0045, { color: 0xc8641c, seg: 5 });
      D.box(PL, 0.075, 0.115, 0.045, M(-1.3, 1.3, -2.955), { color: 0x8f9496, bevel: 0.004 });
      lamp = ctx.addLight({ id: 'carport_trouble_light', pos: [-1.95, 1.84, -2.2], color: 0xffcf96, intensity: 46, range: 9, on: false });
    }
    // shop stool
    { const s = obj(-2.5, 0, -1.78, 0.4); for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) s.rod(MP, [sx * 0.175, 0, sz * 0.175], [sx * 0.105, 0.6, sz * 0.105], 0.011, { color: 0x4a4c4e }); s.tor(MP, 0.205, 0.008, 0, 0.2, 0, PI / 2, PI / 4, 0, { color: 0x4a4c4e, rs: 5, ts: 4 });
      s.cyl(PLY, 0.165, 0.165, 0.02, 0, 0.61, 0, { color: 0xdcccaa, seg: 18 }).cyl(RUB, 0.17, 0.165, 0.04, 0, 0.64, 0, { color: 0x1f1d1c, seg: 18 }).box(MATTE, 0.14, 0.002, 0.05, 0.03, 0.661, 0.04, { color: 0x8b8e90, bevel: 0 }, 0, 0.5, 0); col.cyl(-2.5, 0.33, -1.78, 0.2, 0.66, { tag: 'furniture' }); }
    // shop fan on a tube stand
    { const f = obj(-3.32, 0, -2.2, -0.75), FC = 0xb7ab8c;
      f.tube(MP, [[-0.28, 0.4, 0], [-0.28, 0.03, 0.02], [-0.28, 0.015, 0.2], [-0.28, 0.015, -0.2], [0.28, 0.015, -0.2], [0.28, 0.015, 0.2], [0.28, 0.03, 0.02], [0.28, 0.4, 0]], 0.011, { color: 0x3c3e40, seg: 6, tension: 0.1 });
      const h = f.sub(0, 0.4, 0, 0, -0.22);
      for (const z of [-0.07, 0.07]) h.tor(MP, 0.26, 0.007, 0, 0, z, 0, 0, 0, { color: FC, rs: 5, ts: 24 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; h.rod(MP, [Math.cos(a) * 0.26, Math.sin(a) * 0.26, -0.07], [Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0.07], 0.004, { color: FC, seg: 4 }); }
      for (let i = 0; i < 22; i++) { const a = i / 22 * PI * 2, cx = Math.cos(a), sy = Math.sin(a); h.rod(STEEL, [cx * 0.045, sy * 0.045, 0.085], [cx * 0.26, sy * 0.26, 0.07], 0.0015, { seg: 3, color: 0x9a9c9a }); h.rod(STEEL, [cx * 0.06, sy * 0.06, -0.1], [cx * 0.26, sy * 0.26, -0.07], 0.0015, { seg: 3, color: 0x9a9c9a }); }
      h.tor(STEEL, 0.15, 0.0018, 0, 0, 0.078, 0, 0, 0, { color: 0x9a9c9a, rs: 3, ts: 18 }).cyl(MP, 0.045, 0.045, 0.012, 0, 0, 0.085, { color: FC }, PI / 2).cyl(MP, 0.062, 0.055, 0.12, 0, 0, -0.1, { color: 0x4a4c4e }, PI / 2).cyl(STEEL, 0.03, 0.03, 0.05, 0, 0, 0.0, { color: 0x6a6c6e }, PI / 2);
      for (let i = 0; i < 3; i++) D.box(STEEL, 0.19, 0.075, 0.003, kit.mulM(h.base, M(0, 0, 0.01, 0, 0, i / 3 * PI * 2 + 0.4), M(0.125, 0, 0, 0.45, 0, 0)), { color: 0x55585a, bevel: 0.001 });
      for (const s of [-1, 1]) h.cyl(RUB, 0.014, 0.014, 0.02, s * 0.275, 0, 0, { color: 0x1a1a1a, seg: 8 }, 0, 0, PI / 2);
      col.cyl(-3.32, 0.35, -2.2, 0.27, 0.7, { tag: 'furniture' }); }
    ctx.anchors.carport = { pos: new THREE.Vector3(-2.2, 0, 1.0), heading: PI };
  }

  // =====================================================================================================================
  // 3. Fishing and boat gear
  // =====================================================================================================================
  // a rod built along local +Z from the butt; guides hang below for spinning rods, sit on top for conventional ones
  const fishingRod = (o, { len = 2.1, kind = 'spin', c = 0x1d2f4a, grip = 0xb89a6c } = {}) => {
    const s = kind === 'spin' ? -1 : 1, RX = PI / 2;
    o.cyl(RUB, 0.015, 0.016, 0.02, 0, 0, 0.01, { color: 0x1a1a1a, seg: 8 }, RX).cyl(MATTE, 0.0135, 0.0145, 0.24, 0, 0, 0.14, { color: V(grip), seg: 8 }, RX).cyl(STEEL, 0.012, 0.012, 0.11, 0, 0, 0.315, { color: 0x3a3a3c, seg: 8 }, RX)
      .cyl(MATTE, 0.011, 0.013, 0.1, 0, 0, 0.42, { color: V(grip), seg: 8 }, RX).cyl(PLG, 0.0016, 0.0062, len - 0.47, 0, 0, 0.47 + (len - 0.47) / 2, { color: c, seg: 6 }, RX);
    for (let i = 0; i < 6; i++) { const t = i / 5, z = 0.78 + (len - 0.79) * Math.pow(t, 0.75), R = 0.019 - 0.015 * t, rr = 0.0058 - 0.004 * (z - 0.47) / (len - 0.47); o.tor(STEEL, R, 0.0013, 0, s * (R + rr + 0.002), z, 0, 0, 0, { color: 0x9c9e9c, rs: 3, ts: 8 }).cyl(PLG, rr + 0.0012, rr + 0.0012, 0.02, 0, 0, z, { color: 0x8a1f1c, seg: 5 }, RX); }
    if (kind === 'spin') {
      o.box(STEEL, 0.012, 0.05, 0.02, 0, -0.037, 0.315, { color: 0x2c2d30, bevel: 0.003 }).cyl(STEEL, 0.03, 0.03, 0.034, 0, -0.078, 0.305, { color: 0x34363a }, 0, 0, PI / 2).cyl(STEEL, 0.031, 0.031, 0.016, 0, -0.078, 0.342, { color: 0x8f9296 }, RX)
        .cyl(MATTE, 0.024, 0.024, 0.03, 0, -0.078, 0.366, { color: 0xdde6d2 }, RX).cyl(STEEL, 0.029, 0.027, 0.005, 0, -0.078, 0.384, { color: 0xb9983a }, RX).tor(STEEL, 0.037, 0.0014, 0, -0.078, 0.362, 0, 0, 0.4, { color: 0xb9bcbc, rs: 3, ts: 10, arc: PI })
        .rod(STEEL, [0.018, -0.078, 0.305], [0.055, -0.1, 0.305], 0.003, { color: 0x8f9296, seg: 4 }).cyl(RUB, 0.008, 0.008, 0.026, 0.06, -0.103, 0.305, { color: 0x1a1a1a, seg: 6 }, RX);
    } else {
      o.box(STEEL, 0.014, 0.014, 0.07, 0, 0.016, 0.315, { color: 0x2c2d30, bevel: 0.003 }); for (const sx of [-1, 1]) o.cyl(STEEL, 0.033, 0.033, 0.007, sx * 0.028, 0.052, 0.315, { color: sx > 0 ? 0x8f1f1c : 0x9a9c9e }, 0, 0, PI / 2);
      o.cyl(MATTE, 0.025, 0.025, 0.05, 0, 0.052, 0.315, { color: 0xdde6d2 }, 0, 0, PI / 2).rod(STEEL, [-0.02, 0.078, 0.33], [0.02, 0.078, 0.33], 0.0025, { color: 0x9a9c9e, seg: 4 }).rod(STEEL, [0.032, 0.052, 0.315], [0.05, 0.052, 0.315], 0.004, { color: 0x9a9c9e, seg: 4 })
        .box(STEEL, 0.004, 0.075, 0.012, 0.05, 0.052, 0.315, { color: 0x9a9c9e, bevel: 0.001 }, 0.5).cyl(RUB, 0.008, 0.008, 0.024, 0.064, 0.082, 0.332, { color: 0x1a1a1a, seg: 6 }, 0, 0, PI / 2);
    }
    o.rod(MATTE, [0, s * 0.03, 0.385], [0, s * 0.006, len], 0.0007, { seg: 3, color: 0xe6ecdf });
    o.sph(CHROME, 0.011, 0, s * 0.036, 0.8, { color: 0xd8d2b0 }, 0.5, 0.22, 1.7);
  };
  { // rack of six rods hung under the joists of the middle bay
    for (const z of [0.72, 1.95]) { D.box(W, 2.1, 0.089, 0.019, M(-2.25, 2.535, z), { grain: 0, color: V(0x93846e, 0.1), wear: 0.5, bevel: 0.003, rand: r }); for (const x of [-3.21, -2.0, -1.27]) D.box(W, 0.038, 0.42, 0.019, M(x, 2.7, z - 0.019), { grain: 1, color: V(0x93846e, 0.1), wear: 0.5, bevel: 0.003, rand: r }); }
    const RC = [0x1d2f4a, 0x1b1b1d, 0xd9d5c8, 0x6b2420, 0x1f4a3a, 0x1b1b1d];
    for (let i = 0; i < 6; i++) { const x = -3.05 + i * 0.32, len = 1.95 + (i * 37 % 5) * 0.06, z0 = 0.14 + (i % 2) * 0.07; fishingRod(obj(x, 2.588, z0, 0, rs(0.004), rs(0.3)), { len, kind: i % 3 === 1 ? 'conv' : 'spin', c: RC[i], grip: i % 2 ? 0x2a2a2c : 0xb89a6c });
      for (const z of [0.72, 1.95]) for (const s of [-1, 1]) D.cyl(W, 0.005, 0.005, 0.03, M(x + s * 0.022, 2.593, z), { seg: 5, color: 0x93846e }); }
    // one more rod leaning on the pile
    fishingRod(obj(-0.44, 0.012, 3.14, Math.atan2(-0.26, -0.2), -(PI / 2 - 0.15), 0), { len: 2.15, kind: 'spin', c: 0x23405e });
  }
  // Keys wood-slat lobster trap with concrete ballast
  const lobsterTrap = (o, tone) => {
    const L = 0.8, Wd = 0.6, H = 0.4, la = 0.034, tc = () => V(tone, 0.16), NB = { bevel: 0, wear: 0.9 };
    for (const z of [-L / 2 + 0.02, 0, L / 2 - 0.02]) { o.box(W, Wd, 0.034, 0.034, 0, 0.017, z, { color: tc(), wear: 0.8 }).box(W, Wd, 0.034, 0.034, 0, H - 0.017, z, { color: tc(), wear: 0.8 }); for (const sx of [-1, 1]) o.box(W, 0.034, H - 0.068, 0.034, sx * (Wd / 2 - 0.017), H / 2, z, { grain: 1, color: tc(), wear: 0.8 }); }
    for (let i = 0; i < 9; i++) { const x = -Wd / 2 + 0.03 + i * (Wd - 0.06) / 8 + rs(0.004);
      o.box(W, la, 0.008, L + 0.02, x, -0.004, 0, { grain: 2, color: tc(), ...NB });
      if (i < 3 || i > 5) o.box(W, la, 0.008, L + 0.02, x, H + 0.004, 0, { grain: 2, color: tc(), ...NB }); else for (const sz of [-1, 1]) o.box(W, la, 0.008, L / 2 - 0.1, x, H + 0.004, sz * (L / 4 + 0.06), { grain: 2, color: tc(), ...NB }); }
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) o.box(W, 0.008, la, L + 0.02, sx * (Wd / 2 + 0.004), 0.04 + i * (H - 0.08) / 4 + rs(0.004), 0, { grain: 2, color: tc(), ...NB });
    for (const sz of [-1, 1]) for (let i = 0; i < 7; i++) o.box(W, la, H - 0.01, 0.008, -Wd / 2 + 0.03 + i * (Wd - 0.06) / 6, H / 2, sz * (L / 2 + 0.004), { grain: 1, color: tc(), ...NB });
    for (const [sx, sz, w, d] of [[0, -1, 0.2, 0.012], [0, 1, 0.2, 0.012], [-1, 0, 0.012, 0.2], [1, 0, 0.012, 0.2]]) o.box(PL, w, 0.13, d, sx * 0.1, H - 0.06, sz * 0.1, { color: 0x1d1d1f, bevel: 0.002 }, sz * 0.25, 0, -sx * 0.25);   // top throat
    o.box(CONC, Wd - 0.1, 0.045, 0.28, 0, 0.03, 0.22, { color: V(0xa9a493), wear: 1, bevel: 0.008 });
  };
  // wire crab trap: every wire is real
  const crabTrap = (o, c) => {
    const S = 0.6, H = 0.42, t = 0.0028, n = 14, m = 10, wb = (sx, sy, sz, x, y, z) => o.box(MP, sx, sy, sz, x, y, z, { bevel: 0, color: V(c, 0.12), rand: null });
    for (let i = 0; i <= n; i++) { const u = -S / 2 + i * S / n; for (const y of [0, H]) { wb(t, t, S, u, y, 0); wb(S, t, t, 0, y, u); } for (const s of [-1, 1]) { wb(t, H, t, u, H / 2, s * S / 2); wb(t, H, t, s * S / 2, H / 2, u); } }
    for (let k = 1; k < m; k++) { const y = k * H / m; for (const s of [-1, 1]) { wb(S, t, t, 0, y, s * S / 2); wb(t, t, S, s * S / 2, y, 0); } }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.rod(MP, [sx * S / 2, 0, sz * S / 2], [sx * S / 2, H, sz * S / 2], 0.0045, { color: c, seg: 5 });
    for (const y of [0, H]) for (const s of [-1, 1]) { o.rod(MP, [-S / 2, y, s * S / 2], [S / 2, y, s * S / 2], 0.0045, { color: c, seg: 5 }); o.rod(MP, [s * S / 2, y, -S / 2], [s * S / 2, y, S / 2], 0.0045, { color: c, seg: 5 }); }
    o.cyl(PL, 0.045, 0.045, 0.16, 0, 0.21, 0, { color: 0xb5332a, seg: 10 }).box(RUSTL, 0.1, 0.012, 0.03, 0.14, 0.012, 0.2, { color: 0x8a8076, bevel: 0.002 });   // bait jar, zinc
  };
  {
    const t1 = obj(-0.8, 0.012, -0.99, 0.03), t2 = obj(-0.82, 0.012, -1.84, -0.04), t3 = obj(-0.79, 0.43, -1.42, 0.13, 0, 0.012);
    lobsterTrap(t1, 0x8f8778); lobsterTrap(t2, 0x7b7a68); lobsterTrap(t3, 0x9a9282);
    const c1 = obj(-0.8, 0.01, -2.57, 0.05), c2 = obj(-0.78, 0.435, -2.56, 0.3); crabTrap(c1, 0x2c4a3c); crabTrap(c2, 0x4c5054);
    col.box(-0.8, 0.45, -1.73, 0.76, 0.9, 2.36, { tag: 'clutter' });
    buoy(t3, 0.05, 0.49, -0.12, 0, 0.5, PI / 2); buoy(t3, -0.12, 0.485, 0.2, 0, 2.3, PI / 2, [0x1f8a8a, 0xd9b526, 0xb5332a], 0.95); coil(t3, 0.12, 0.41, 0.2, 0.11, 4, 0.006);
    t3.tube(MATTE, [[0.05, 0.47, -0.3], [0.2, 0.44, -0.2], [0.24, 0.43, 0.05], [0.16, 0.42, 0.18]], 0.006, { color: ROPE });
    buoy(c2, 0.0, 0.5, 0.05, 0, 1.2, PI / 2, [0xd9d5c8, 0xc2521d, 0x1b1b1d], 0.9, 1); c2.tube(MATTE, [[0, 0.44, 0.19], [0.2, 0.44, 0.22], [0.31, 0.3, 0.1], [0.31, 0.05, 0.12]], 0.005, { color: 0xd9c44a });
    // rope bridle and a tag hanging off the bottom trap
    t1.tube(MATTE, [[-0.2, 0.41, 0.42], [0, 0.3, 0.52], [0.2, 0.41, 0.42]], 0.006, { color: ROPE }); t1.box(PL, 0.07, 0.03, 0.002, 0.2, 0.3, 0.409, { color: 0xd9b526, bevel: 0 });
  }
  { // coolers on the pile line
    const o = obj(-0.78, 0.01, 0.8, 0.03), WH = 0xdcd9cf;
    o.box(PL, 0.42, 0.36, 1.0, 0, 0.19, 0, { color: WH, bevel: 0.03 }).box(PL, 0.44, 0.07, 1.02, 0, 0.405, 0, { color: 0xcfc8ae, bevel: 0.022 }).box(PL, 0.3, 0.006, 0.84, 0, 0.441, 0, { color: 0xc4bca0, bevel: 0.002 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { o.box(PL, 0.06, 0.07, 0.07, sx * 0.185, 0.045, sz * 0.47, { color: 0x9c998f, bevel: 0.02 }); o.box(PL, 0.05, 0.05, 0.05, sx * 0.2, 0.39, sz * 0.49, { color: 0xa9a59a, bevel: 0.02 }); }
    for (const sz of [-0.28, 0.28]) o.box(RUB, 0.012, 0.09, 0.05, 0.215, 0.35, sz, { color: 0x1f1f21, bevel: 0.004 }).box(STEEL, 0.008, 0.02, 0.07, -0.222, 0.37, sz, { color: 0xb4b7b7, bevel: 0.002 });
    for (const sz of [-1, 1]) { o.tube(MATTE, [[-0.11, 0.3, sz * 0.5], [-0.1, 0.2, sz * 0.56], [0.1, 0.2, sz * 0.56], [0.11, 0.3, sz * 0.5]], 0.006, { color: 0x2c4f8a, tension: 0.2 }); o.cyl(RUB, 0.015, 0.015, 0.13, 0, 0.195, sz * 0.562, { color: 0x1f1f21, seg: 8 }, 0, 0, PI / 2); }
    o.cyl(PL, 0.018, 0.018, 0.02, 0.1, 0.06, 0.505, { color: 0xa9a59a, seg: 8 }, PI / 2); label(o, REG.dive, 0.11, 0.082, 0.2125, 0.2, -0.12, 0, PI / 2, 0.06);
    for (let i = 0; i < 14; i++) o.box(MATTE, 0.03 + r() * 0.1, 0.004 + r() * 0.012, 0.0015, 0.2112, 0.05 + r() * 0.26, rs(0.45), { color: V(0x8d8a80, 0.2), bevel: 0 }, r() * 0.6, PI / 2, 0);   // scuffs
    prop('lambis_shell', o.m(0.02, 0.444, 0.3, 0, 2.1, 0, 1.4));
    const s = obj(-0.75, 0.01, 1.74, 1.45); s.box(PL, 0.3, 0.26, 0.42, 0, 0.13, 0, { color: 0xb5332a, bevel: 0.025 }).box(PL, 0.31, 0.05, 0.43, 0, 0.285, 0, { color: 0xe3e0d6, bevel: 0.018 }).box(PL, 0.302, 0.03, 0.422, 0, 0.2, 0, { color: 0xe3e0d6, bevel: 0.004 });
    s.tube(PL, [[0, 0.2, -0.215], [0.07, 0.26, -0.24], [0.1, 0.34, -0.1], [0.1, 0.34, 0.1], [0.07, 0.26, 0.24], [0, 0.2, 0.215]], 0.009, { color: 0xe3e0d6, tension: 0.2 });
    col.box(-0.78, 0.23, 1.1, 0.5, 0.46, 1.72, { tag: 'clutter' });
    // bucket set: three nested, one on its own with a rag over the rim
    for (let i = 0; i < 3; i++) bucket(obj(-0.86 + i * 0.004, 0.01 + i * 0.095, 2.24), 0, 0, 0, [0xd9d6cc, 0xc2622a, 0x6f8494][i], i === 2 ? 0x2a2c28 : null);
    const b = bucket(obj(-1.3, 0.01, 2.18), 0, 0, 0, 0xc2622a, 0x3a4438); b.tube(STEEL, [[-0.148, 0.34, 0], [-0.1, 0.2, 0.13], [0.1, 0.2, 0.13], [0.148, 0.34, 0]], 0.0025, { color: 0x9a9c9a, seg: 4 }); b.cyl(PL, 0.012, 0.012, 0.1, 0, 0.185, 0.14, { color: 0xe3e0d6, seg: 8 }, 0, 0, PI / 2);
    // long crate with the dive gear on it
    prop('wooden_crate_02', M(-0.78, 0.01, 3.76, 0, 0.03, 0)); col.box(-0.78, 0.24, 3.76, 0.56, 0.48, 1.2, { tag: 'clutter' });
    const fin = (x, z, ry, c) => { const f = obj(x, 0.475, z, ry); f.box(RUB, 0.1, 0.055, 0.2, 0, 0.03, -0.2, { color: 0x1c1c1e, bevel: 0.02 }).box(PL, 0.19, 0.008, 0.36, 0, 0.012, 0.07, { color: c, bevel: 0.003 }, -0.05).box(PL, 0.012, 0.02, 0.4, -0.092, 0.016, 0.05, { color: 0x1c1c1e, bevel: 0.004 }, -0.05, 0.06).box(PL, 0.012, 0.02, 0.4, 0.092, 0.016, 0.05, { color: 0x1c1c1e, bevel: 0.004 }, -0.05, -0.06).box(PL, 0.06, 0.009, 0.3, 0, 0.013, 0.06, { color: kit.mul(c, 0.7), bevel: 0.002 }, -0.05); };
    fin(-0.86, 3.5, 0.25, 0xd9b526); fin(-0.72, 3.56, -0.2, 0xd9b526);
    const mk = obj(-0.8, 0.475, 4.05, 0.5); mk.box(RUB, 0.17, 0.085, 0.035, 0, 0.045, 0, { color: 0x1c1c1e, bevel: 0.015 }).box(RUB, 0.06, 0.05, 0.05, 0, 0.03, -0.03, { color: 0x1c1c1e, bevel: 0.015 }); for (const sx of [-1, 1]) mk.box(PLG, 0.065, 0.055, 0.004, sx * 0.04, 0.052, 0.018, { color: 0x3a5560, bevel: 0.002 });
    mk.tube(RUB, [[-0.085, 0.05, 0], [-0.11, 0.045, -0.08], [0, 0.03, -0.16], [0.11, 0.045, -0.08], [0.085, 0.05, 0]], 0.006, { color: 0x1c1c1e }); mk.tube(PL, [[0.13, 0.012, 0.1], [0.13, 0.012, -0.2], [0.14, 0.02, -0.27], [0.19, 0.03, -0.3]], 0.011, { color: 0x1c1c1e }); mk.cyl(PL, 0.012, 0.012, 0.07, 0.13, 0.012, 0.12, { color: 0xc2521d, seg: 8 }, PI / 2);
  }
  { // against the storage-room side wall in the carport bay (moved from the old west strip): trailer tire, bucket, outboard on its stand, gas cans
    prop('old_tyre', M(-1.5, 0.09, 3.62, PI / 2, 0.4, 0)); coil(obj(-1.5, 0.02, 3.62), 0, 0, 0, 0.1, 3, 0.007);
    const b = bucket(obj(-1.46, 0.01, 4.3), 0, 0, 0, 0xd9d6cc, 0x4a4a40); b.rod(W, [0.02, 0.05, 0.03], [0.1, 0.62, -0.06], 0.012, { color: 0x93846e }); b.box(PL, 0.12, 0.05, 0.05, 0.11, 0.65, -0.065, { color: 0x2c4f8a, bevel: 0.01 }, 0, 0, -0.15);
    const o = obj(-1.55, 0.01, 1.72, 0), wc = () => V(0x93846e, 0.1);
    for (const sx of [-0.22, 0.22]) o.box(W, 0.038, 0.089, 0.72, sx, 0.045, 0.05, { grain: 2, color: wc() }).box(W, 0.038, 1.02, 0.089, sx, 0.51, 0, { grain: 1, color: wc() }).strut(W, [sx, 0.08, -0.28], [sx, 0.72, -0.03], 0.038, 0.089, { color: wc() });
    o.box(W, 0.52, 0.19, 0.038, 0, 0.93, 0.063, { grain: 0, color: wc(), wear: 0.7 }).box(W, 0.48, 0.089, 0.038, 0, 0.3, -0.063, { grain: 0, color: wc() });
    const m = o.sub(0, 1.025, 0.085), CW = 0xcfc9b6, LG = 0x4d5a63;
    m.box(STEEL, 0.17, 0.2, 0.06, 0, -0.07, -0.015, { color: 0x6d7276, bevel: 0.008 }).box(STEEL, 0.17, 0.03, 0.08, 0, 0.022, -0.05, { color: 0x6d7276, bevel: 0.006 }).box(STEEL, 0.17, 0.16, 0.014, 0, -0.07, -0.085, { color: 0x6d7276, bevel: 0.004 });
    for (const sx of [-1, 1]) m.rod(STEEL, [sx * 0.05, -0.1, -0.09], [sx * 0.05, -0.1, -0.16], 0.006, { color: 0x8f9296 }).rod(STEEL, [sx * 0.05, -0.13, -0.16], [sx * 0.05, -0.07, -0.16], 0.004, { color: 0x8f9296 });
    m.box(MP, 0.085, 0.6, 0.13, 0, -0.27, 0.1, { color: V(LG), bevel: 0.02 }).box(MP, 0.2, 0.01, 0.3, 0, -0.5, 0.17, { color: V(LG), bevel: 0.004 }).cyl(MP, 0.043, 0.043, 0.24, 0, -0.62, 0.15, { color: V(LG) }, PI / 2).sph(MP, 0.043, 0, -0.62, 0.03, { color: V(LG) }, 1, 1, 1.6)
      .box(MP, 0.07, 0.08, 0.14, 0, -0.56, 0.12, { color: V(LG), bevel: 0.015 }).box(MP, 0.008, 0.13, 0.13, 0, -0.71, 0.14, { color: V(LG), bevel: 0.003 }, 0.5);
    propeller(m.sub(0, -0.62, 0.32, 0, PI / 2), 0.9);
    m.box(MP, 0.25, 0.08, 0.4, 0, 0.07, 0.08, { color: 0x2f3438, bevel: 0.02 }).box(MP, 0.27, 0.26, 0.42, 0, 0.24, 0.08, { color: V(CW, 0.03), bevel: 0.06 }).box(MP, 0.274, 0.035, 0.424, 0, 0.17, 0.08, { color: 0x2f7f86, bevel: 0.004 }).box(MP, 0.272, 0.008, 0.422, 0, 0.2, 0.08, { color: 0xb5332a, bevel: 0.002 });
    m.cyl(RUB, 0.012, 0.012, 0.07, 0, 0.26, -0.135, { color: 0x1a1a1a, seg: 8 }, 0, 0, PI / 2).box(MP, 0.035, 0.035, 0.4, 0.075, 0.07, -0.3, { color: 0x2f3438, bevel: 0.008 }, 0.12).cyl(RUB, 0.022, 0.022, 0.13, 0.075, 0.105, -0.55, { color: 0x1a1a1a, seg: 10 }, PI / 2 + 0.12);
    m.tube(RUB, [[-0.08, 0.06, -0.1], [-0.2, -0.3, -0.2], [-0.25, -0.9, -0.1], [-0.2, -1.01, 0.2], [-0.05, -1.01, 0.45]], 0.007, { color: 0x1a1a1a }); m.sph(RUB, 0.03, -0.1, -1.0, 0.36, { color: 0x1a1a1a }, 1, 1, 1.7);
    col.box(-1.55, 0.7, 1.82, 0.56, 1.4, 0.8, { tag: 'clutter' });
    prop('metal_jerrycan', M(-1.5, 0.01, 0.98, 0, 1.45, 0)); prop('plastic_jerrycan', M(-1.44, 0.01, 0.56, 0, 0.2, 0)); label(obj(-1.44, 0, 0.56, 0.2), REG.tape, 0.16, 0.04, 0, 0.2, 0.172);
  }
  { // longboard slung flat under the joists of the east bay, deck down
    const L = 2.78, Wd = 0.57, T = 0.07, nu = 44, nv = 12, pos = [], cl = [], uv = [], idx = [], cA = kit.rgb(0xe4dcc2), cB = kit.rgb(0x2f7f86), cC = kit.rgb(0xb5332a);
    for (let i = 0; i <= nu; i++) { const u = i / nu, z = (u - 0.5) * L, wN = Math.pow(Math.sin(Math.min(1, u / 0.42) * PI / 2), 0.62), wT = Math.max(0.4, Math.pow(Math.sin(Math.min(1, (1 - u) / 0.6) * PI / 2), 0.5)), hw = Wd / 2 * Math.min(wN, wT) + 0.004;
      const th = T / 2 * (0.3 + 0.7 * Math.sin(Math.min(1, Math.min(u, 1 - u) / 0.18) * PI / 2)), rock = 0.1 * Math.pow(Math.abs(u - 0.56) / 0.56, 2.4), c = u < 0.13 ? cB : (u > 0.7 && u < 0.725) || (u > 0.75 && u < 0.76) ? cC : cA, k = 0.92 + kit.hash(i, 3) * 0.1;
      for (let j = 0; j <= nv; j++) { const a = j / nv * PI * 2, cx = Math.cos(a), sy = Math.sin(a); pos.push(hw * Math.sign(cx) * Math.pow(Math.abs(cx), 0.55), th * Math.sign(sy) * Math.pow(Math.abs(sy), 0.8) + rock, z); cl.push(c[0] * k, c[1] * k, c[2] * k); uv.push(u * 6, j / nv * 2); } }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const o = obj(0.6, 2.21, 1.32, 0.02, 0, PI);
    o.geo(PLG, g, null, { keepColor: true }); o.box(PLG, Wd * 0.4 * 2 - 0.02, T * 0.28, 0.01, 0, 0.1 * Math.pow(0.44 / 0.56, 2.4), L / 2, { color: 0xe4dcc2, bevel: 0.004 });
    const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(0.2, 0); fs.quadraticCurveTo(0.26, 0.1, 0.3, 0.23); fs.quadraticCurveTo(0.2, 0.21, 0.1, 0.1); fs.lineTo(0, 0);
    const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.008, bevelEnabled: false }); fg.translate(0, 0, -0.004); fg.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0)));
    o.geo(PLG, fg, M(0, -0.012, L / 2 - 0.52), { color: 0x1f3f52 });
    for (const z of [0.45, 2.2]) { D.tube(MATTE, [[0.22, 2.74, z], [0.25, 2.35, z], [0.31, 2.17, z], [0.6, 2.145, z], [0.89, 2.17, z], [0.95, 2.35, z], [0.98, 2.74, z]], 0.006, { color: ROPE, tension: 0.3 }); for (const x of [0.22, 0.98]) D.geo(STEEL, new THREE.TorusGeometry(0.014, 0.003, 4, 8), M(x, 2.735, z, 0, PI / 2, 0), { color: 0x8f9296 }); }
  }
  { // beach cruiser leaning on the pile between the west and middle bays
    const o = obj(-3.2, 0.005, -0.62, PI / 2, -0.2, 0), FR = 0x6fa59a, tube = (a, b, rad = 0.014, c = FR) => o.rod(MP, a, b, rad, { color: V(c, 0.05), seg: 7 });
    const wheel = (cx) => { const s = o.sub(cx, 0.335, 0); s.tor(RUB, 0.31, 0.026, 0, 0, 0, 0, 0, 0, { color: 0xb9b09a, rs: 6, ts: 26 }).tor(RUB, 0.318, 0.02, 0, 0, 0, 0, 0, 0, { color: 0x2a2826, rs: 5, ts: 26 }).tor(RUSTL, 0.278, 0.01, 0, 0, 0, 0, 0, 0, { color: 0x9c948a, rs: 4, ts: 26, flat: 1.4 }).cyl(STEEL, 0.018, 0.018, 0.1, 0, 0, 0, { color: 0x8a8c8c, seg: 8 }, PI / 2);
      for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; s.rod(STEEL, [Math.cos(a) * 0.018, Math.sin(a) * 0.018, (i % 2 ? 1 : -1) * 0.03], [Math.cos(a + 0.35) * 0.272, Math.sin(a + 0.35) * 0.272, 0], 0.001, { seg: 3, color: 0x9a9c9a }); }
      s.tor(MP, 0.345, 0.006, 0, 0, 0, 0, 0, cx < 0 ? 0.2 : 0.9, { color: FR, rs: 4, ts: 16, arc: PI * 0.75, flat: 5 }); };
    wheel(-0.53); wheel(0.55);
    const BB = [-0.06, 0.29, 0], ST = [-0.2, 0.76, 0], HT = [0.37, 0.88, 0], HB = [0.4, 0.72, 0], RA = [-0.53, 0.335, 0], FA = [0.55, 0.335, 0];
    tube(BB, ST, 0.015); tube(HT, HB, 0.018); tube(HB, BB, 0.016); o.tube(MP, [[ST[0], ST[1] - 0.04, 0], [0.05, 0.78, 0], [HT[0], HT[1] - 0.03, 0]], 0.014, { color: FR, seg: 7 }); o.tube(MP, [[HB[0], HB[1] + 0.02, 0], [0.1, 0.62, 0], [-0.14, 0.56, 0]], 0.012, { color: FR, seg: 7 });
    for (const s of [-1, 1]) { tube([BB[0], BB[1], s * 0.03], [RA[0], RA[1], s * 0.055], 0.009); tube([ST[0], ST[1] - 0.06, s * 0.02], [RA[0], RA[1], s * 0.055], 0.008); o.tube(MP, [[HB[0], HB[1], s * 0.03], [0.47, 0.55, s * 0.05], [FA[0], FA[1], s * 0.05]], 0.009, { color: FR, seg: 6 }); }
    tube([ST[0], ST[1], 0], [-0.225, 0.86, 0], 0.011, 0x9a9c9c); o.box(RUB, 0.26, 0.05, 0.2, -0.25, 0.89, 0, { color: 0x5a3a24, bevel: 0.022 }).box(RUB, 0.1, 0.04, 0.09, -0.1, 0.885, 0, { color: 0x5a3a24, bevel: 0.018 }); for (const s of [-1, 1]) o.cyl(STEEL, 0.02, 0.02, 0.05, -0.3, 0.84, s * 0.06, { color: 0x6f6a62, seg: 6 });
    tube(HT, [0.35, 1.0, 0], 0.011, 0x9a9c9c); for (const s of [-1, 1]) { o.tube(STEEL, [[0.35, 1.0, 0], [0.36, 1.03, s * 0.12], [0.26, 1.05, s * 0.27], [0.1, 1.03, s * 0.31]], 0.011, { color: 0x9a9c9c, seg: 6 }); o.cyl(RUB, 0.015, 0.015, 0.12, 0.05, 1.025, s * 0.315, { color: 0xd9d5c8, seg: 8 }, 0, 0.12 * s, PI / 2); }
    o.cyl(RUSTL, 0.09, 0.09, 0.004, BB[0], BB[1], 0.045, { color: 0x8a7a6a, seg: 18 }, PI / 2).cyl(RUSTL, 0.035, 0.035, 0.004, RA[0], RA[1], 0.045, { color: 0x8a7a6a, seg: 10 }, PI / 2).cyl(STEEL, 0.02, 0.02, 0.11, BB[0], BB[1], 0, { color: 0x6f6a62, seg: 8 }, PI / 2);
    o.rod(RUSTL, [BB[0], BB[1] + 0.09, 0.045], [RA[0], RA[1] + 0.035, 0.045], 0.004, { color: 0x7a5a40, seg: 4 }).rod(RUSTL, [BB[0], BB[1] - 0.09, 0.045], [RA[0], RA[1] - 0.035, 0.045], 0.004, { color: 0x7a5a40, seg: 4 });
    for (const s of [-1, 1]) { o.rod(STEEL, [BB[0], BB[1], s * 0.055], [BB[0] + s * 0.12, BB[1] - s * 0.11, s * 0.06], 0.007, { color: 0x8a8c8c }); o.box(RUB, 0.09, 0.02, 0.07, BB[0] + s * 0.12, BB[1] - s * 0.11, s * 0.105, { color: 0x1c1c1e, bevel: 0.005 }); }
    col.box(-3.36, 0.5, -0.62, 0.5, 1.0, 1.85, { tag: 'clutter' });
  }
  { // cast net draped over the crossing of the east X-brace, with the pile of buoys and rope below it
    const o = obj(2.0, 1.5, 1.3, PI / 2), sheet = (side) => { const g = new THREE.PlaneGeometry(1, 1, 14, 10), pa = g.attributes.position, ua = g.attributes.uv;
      for (let i = 0; i < pa.count; i++) { const u = pa.getX(i), v = 0.5 - pa.getY(i), wd = 0.32 + 0.75 * Math.pow(v, 0.8); pa.setXYZ(i, u * wd + 0.05 * Math.sin(v * 5 + side), -v * 1.02 - 0.03 * Math.sin(u * 9) * v, side * (0.2 + 0.05 * v + 0.05 * Math.sin(u * 19 + v * 3) * v)); ua.setXY(i, u * wd * 9, v * 9); }
      g.computeVertexNormals(); o.geo(NET, g, null);
      for (let i = 0; i <= 12; i++) { const u = i / 12 - 0.5; o.cyl(RUSTL, 0.007, 0.007, 0.022, u * 1.07 + 0.05 * Math.sin(5 + side), -1.03 - 0.03 * Math.sin(u * 9), side * (0.25 + 0.05 * Math.sin(u * 19 + 3)), { color: 0x74777a, seg: 5 }, 0, 0, PI / 2); } };
    sheet(1); sheet(-1);
    const top = new THREE.PlaneGeometry(0.32, 0.4, 4, 4); top.rotateX(-PI / 2); for (let i = 0; i < top.attributes.position.count; i++) { top.attributes.uv.setXY(i, top.attributes.position.getX(i) * 9, top.attributes.position.getZ(i) * 9); top.attributes.position.setY(i, 0.02 * Math.cos(top.attributes.position.getZ(i) * 7.8)); } o.geo(NET, top, null);
    coil(o, 0.0, 0.0, 0, 0.07, 3, 0.004, 0xd9d5c8); o.tube(MATTE, [[0.06, 0.02, 0], [0.12, -0.1, 0.22], [0.1, -0.5, 0.23]], 0.004, { color: 0xd9d5c8 });
    const p = obj(1.52, 0.01, 0.75);
    buoy(p, 0, 0.08, 0, 0, 0.3, PI / 2); buoy(p, 0.08, 0.08, 0.26, 0, 1.9, PI / 2 + 0.1); buoy(p, -0.02, 0.2, 0.12, 0.2, 1.0, 1.2, [0xc2521d, 0xd9d5c8, 0x1b1b1d]); buoy(p, 0.1, 0.125, -0.3, 0, 0, 0, [0xd9d5c8, 0x2c4f8a, 0x2c4f8a], 0.95, 1); buoy(p, -0.05, 0.08, 0.55, 0, 2.6, PI / 2, CODE, 0.9);
    coil(p, 0.05, 0, 0.9, 0.16, 5, 0.007); coil(p, 0.02, 0.0, -0.62, 0.13, 3, 0.006, 0x2c4f8a);
    p.tube(MATTE, [[0.05, 0.03, 0.74], [-0.1, 0.02, 0.5], [0.15, 0.1, 0.3], [0.0, 0.26, 0.12], [-0.12, 0.1, -0.05], [0.0, 0.02, -0.45]], 0.007, { color: ROPE });
  }
  // life jacket on a nail, ring buoy on the front pile
  prop('life_jacket', M(-0.8, 1.42, 2.8 + 0.24, 0.06, 0, 0, 0.9)); prop('lifebuoy', M(-1.1, 1.55, 2.45, 0.04, -Math.PI / 2, 0, 0.92));   // on the storage-room side wall (part 47)

  // =====================================================================================================================
  // 4. Utility
  // =====================================================================================================================
  { // hose reel and spigot at the front pile
    prop('garden_hose_wall_mounted_01', M(-0.8, 1.12, 5.02 + 0.155)); prop('watering_can_metal_01', M(-0.2, 0.01, 5.62, 0, 0.9, 0));
    D.rod(STEEL, [-0.69, 0.1, 5.15], [-0.69, 0.66, 5.15], 0.012, { color: GALV, seg: 8 }); D.cyl(STEEL, 0.016, 0.016, 0.05, M(-0.69, 0.67, 5.165, PI / 2, 0, 0), { color: 0xb49a52, seg: 8 }); D.cyl(STEEL, 0.011, 0.014, 0.04, M(-0.69, 0.645, 5.2, 0.5, 0, 0), { color: 0xb49a52, seg: 8 });
    D.geo(MP, new THREE.TorusGeometry(0.024, 0.005, 4, 10), M(-0.69, 0.705, 5.165, PI / 2, 0, 0), { color: 0xb5332a }); D.box(STEEL, 0.05, 0.02, 0.004, M(-0.72, 0.45, 5.168), { color: GALV, bevel: 0 });
    D.tube(PL, [[-0.69, 0.63, 5.215], [-0.68, 0.5, 5.27], [-0.74, 0.62, 5.3], [-0.8, 0.86, 5.27]], 0.011, { color: 0x3e6b3a, seg: 6 });
    D.tube(PL, [[-0.9, 0.86, 5.27], [-1.0, 0.55, 5.36], [-1.03, 0.3, 5.44], [-0.98, 0.03, 5.62], [-0.5, 0.022, 5.95], [0.1, 0.022, 6.1], [0.5, 0.022, 5.85], [0.42, 0.022, 5.55]], 0.011, { color: 0x3e6b3a, seg: 6 });
    D.cyl(STEEL, 0.012, 0.016, 0.12, M(0.4, 0.025, 5.49, PI / 2, 0.15, 0), { color: 0xb49a52, seg: 8 });
  }
  { // trash cans by the front-east pile, recycling crate
    prop('metal_trash_can', M(1.48, 0.01, 4.28, 0, PI / 2, 0), { only: /rust/, pre: M(0.5, 0, 0) }); col.cyl(1.48, 0.45, 4.28, 0.33, 0.9, { tag: 'clutter' });
    const o = obj(1.5, 0.01, 3.5, -PI / 2), G = 0x2f5a3c;
    o.box(PL, 0.46, 0.8, 0.5, 0, 0.5, 0, { color: V(G, 0.04), bevel: 0.035, shade: [0.8, 1] }).box(PL, 0.5, 0.05, 0.58, 0, 0.925, 0.0, { color: V(G, 0.04), bevel: 0.018 }, -0.05).box(PL, 0.5, 0.05, 0.03, 0, 0.9, 0.29, { color: G, bevel: 0.01 }).box(PL, 0.3, 0.03, 0.06, 0, 0.86, 0.26, { color: kit.mul(G, 0.8), bevel: 0.01 });
    for (const sx of [-1, 1]) { o.cyl(RUB, 0.1, 0.1, 0.045, sx * 0.22, 0.1, -0.22, { color: 0x1c1c1e, seg: 16 }, 0, 0, PI / 2).cyl(PL, 0.045, 0.045, 0.05, sx * 0.22, 0.1, -0.22, { color: 0x3a3c3e, seg: 10 }, 0, 0, PI / 2); o.rod(PL, [sx * 0.19, 0.9, -0.25], [sx * 0.19, 0.95, -0.33], 0.012, { color: G }); }
    o.rod(STEEL, [-0.24, 0.1, -0.22], [0.24, 0.1, -0.22], 0.01, { color: 0x6a6c6e }).rod(PL, [-0.2, 0.95, -0.33], [0.2, 0.95, -0.33], 0.014, { color: G }); label(o, REG.stencil, 0.24, 0.12, 0, 0.56, 0.2515);
    col.box(1.5, 0.48, 3.5, 0.55, 0.96, 0.5, { tag: 'clutter' });
    prop('plastic_crate_01', M(1.12, 0.01, 4.15, 0, 0.1, 0)); const c = obj(1.12, 0.03, 4.15, 0.1);
    for (const [x, z, k] of [[-0.08, -0.12, 0x4a2c12], [0.07, -0.13, 0x2f5a2a], [-0.07, 0.0, 0x4a2c12], [0.08, 0.13, 0x4a2c12]]) bottle(c, x, 0.01, z, k);
    for (const [x, z, k] of [[0.07, 0.0, 0xb5332a], [-0.08, 0.12, 0xc9cccc], [0.0, 0.07, 0x2c5f8f]]) canAl(c, x, 0.01, z, k); canAl(c, 0.0, 0.15, -0.04, 0xb5332a, 1, 0.5); canAl(c, 0.05, 0.215, 0.06, 0xc9cccc, 1, 2.0); canAl(obj(1.2, 0.012, 2.72), 0, 0, 0, 0x2c5f8f, 1, 1.1);
  }
  { // propane grill just outside the carport
    const o = obj(-7.6, 0.01, 6.3, 0.12), BK = 0x1d1d1f;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.rod(MP, [sx * 0.3, sx < 0 ? 0.07 : 0, sz * 0.2], [sx * 0.3, 0.74, sz * 0.2], 0.014, { color: BK });
    for (const sz of [-1, 1]) o.cyl(RUB, 0.08, 0.08, 0.035, -0.335, 0.08, sz * 0.2, { color: 0x1c1c1e, seg: 14 }, 0, 0, PI / 2).rod(MP, [-0.3, 0.2, sz * 0.2], [0.3, 0.2, sz * 0.2], 0.008, { color: BK });
    for (let i = 0; i < 9; i++) o.rod(MP, [-0.3, 0.2, -0.2 + i * 0.05], [0.3, 0.2, -0.2 + i * 0.05], 0.003, { color: BK, seg: 4 });
    o.box(MP, 0.64, 0.2, 0.44, 0, 0.82, 0, { color: BK, bevel: 0.03 }).geo(MP, new THREE.CylinderGeometry(0.22, 0.22, 0.62, 18), M(0, 0.915, 0, 0, 0, PI / 2, 0.78, 1, 1), { color: 0x232325 });
    o.rod(STEEL, [-0.2, 0.99, 0.235], [0.2, 0.99, 0.235], 0.011, { color: 0xb9bcbc }); for (const sx of [-1, 1]) o.rod(STEEL, [sx * 0.2, 0.99, 0.235], [sx * 0.2, 0.97, 0.19], 0.006, { color: 0x8f9296 });
    o.cyl(CHROME, 0.028, 0.028, 0.012, 0, 1.03, 0.14, { color: 0xd0d2d2 }, PI / 2 - 0.9).box(MP, 0.64, 0.085, 0.02, 0, 0.77, 0.225, { color: 0x2c2c2e, bevel: 0.006 });
    for (const x of [-0.2, 0, 0.2]) o.cyl(PL, 0.022, 0.024, 0.03, x, 0.77, 0.25, { color: 0x151516 }, PI / 2).cyl(CHROME, 0.027, 0.027, 0.004, x, 0.77, 0.237, { color: 0xb9bcbc }, PI / 2);
    for (const sx of [-1, 1]) { for (let i = 0; i < 4; i++) o.box(W, 0.24, 0.016, 0.075, sx * 0.46, 0.89, -0.135 + i * 0.09, { grain: 0, color: V(0x93846e, 0.1), wear: 0.8 }); o.rod(MP, [sx * 0.33, 0.87, -0.16], [sx * 0.58, 0.87, -0.16], 0.008, { color: BK }).rod(MP, [sx * 0.33, 0.87, 0.16], [sx * 0.58, 0.87, 0.16], 0.008, { color: BK }); }
    o.cyl(MP, 0.15, 0.15, 0.24, 0.06, 0.34, 0, { color: 0xc6c3b6, seg: 18 }).sph(MP, 0.15, 0.06, 0.46, 0, { color: 0xc6c3b6, ws: 18 }, 1, 0.5, 1).cyl(RUSTL, 0.11, 0.11, 0.03, 0.06, 0.215, 0, { color: 0x9a7a5a, seg: 16 });
    o.geo(MP, new THREE.CylinderGeometry(0.1, 0.1, 0.09, 14, 1, true, 0.6, PI * 1.6), M(0.06, 0.575, 0), { color: 0xc6c3b6 }).geo(MP, flip(new THREE.CylinderGeometry(0.097, 0.097, 0.09, 14, 1, true, 0.6, PI * 1.6)), M(0.06, 0.575, 0), { color: 0xa9a69a });
    o.cyl(STEEL, 0.016, 0.02, 0.05, 0.06, 0.555, 0, { color: 0xb49a52, seg: 8 }).cyl(PL, 0.03, 0.03, 0.015, 0.06, 0.59, 0, { color: 0x1f6a3a, seg: 8 }).tube(RUB, [[0.08, 0.565, 0], [0.2, 0.6, 0.05], [0.24, 0.7, 0.12], [0.15, 0.74, 0.18]], 0.006, { color: 0x1a1a1a });
    o.cyl(STEEL, 0.035, 0.03, 0.06, 0, 0.69, -0.02, { color: 0x8a8c8a, seg: 10 }).rod(STEEL, [0, 0.72, -0.02], [0, 0.69, -0.02], 0.002, { color: 0x8a8c8a, seg: 4 });
    col.box(-7.6, 0.52, 6.3, 1.25, 1.04, 0.56, { ry: 0.12, tag: 'clutter' });
  }
  const cinder = (o, c = 0xa9a69c) => { const k = () => ({ color: V(c, 0.08), wear: 0.9, bevel: 0.005 }); for (const sz of [-1, 1]) o.box(CONC, 0.39, 0.19, 0.032, 0, 0.095, sz * 0.079, k()); for (const x of [-0.179, 0, 0.179]) o.box(CONC, 0.032, 0.19, 0.126, x, 0.095, 0, k()); };
  { // lumber on cinder blocks under the west deck, folded tarp, loose blocks
    for (const z of [0.55, 2.05]) for (const x of [-7.66, -7.24]) cinder(obj(x, 0.005, z, rs(0.06)));
    const lc = () => V(0xa39378, 0.14); let y = 0.2;
    for (let i = 0; i < 6; i++) D.box(W, 0.14, 0.038, 2.44, M(-7.83 + i * 0.146 + rs(0.004), y + 0.019, 1.3 + rs(0.06), 0, rs(0.008), 0), { grain: 2, color: lc(), wear: 0.5, bevel: 0.004, rand: r }); y += 0.038;
    for (let i = 0; i < 8; i++) D.box(W, 0.089, 0.038, 2.44, M(-7.82 + i * 0.094 + rs(0.003), y + 0.019, 1.32 + rs(0.09), 0, rs(0.01), 0), { grain: 2, color: lc(), wear: 0.4, bevel: 0.004, rand: r }); y += 0.038;
    for (let i = 0; i < 6; i++) D.box(W, 0.089, 0.038, 2.44 - (i === 4 ? 0.7 : 0), M(-7.78 + i * 0.1 + rs(0.004), y + 0.019, 1.28 + rs(0.1), 0, rs(0.014), 0), { grain: 2, color: lc(), wear: 0.4, bevel: 0.004, rand: r }); y += 0.038;
    D.box(W, 0.089, 0.089, 1.8, M(-7.2, y + 0.045, 1.5, 0, 0.05, 0), { grain: 2, color: V(0x8d857a), wear: 0.7, bevel: 0.006, rand: r }); D.box(PLY, 0.6, 0.012, 1.2, M(-7.62, y + 0.008, 1.85, 0, -0.04, 0.01), { color: V(0xd9ccb0), wear: 0.7, bevel: 0.002 });
    const t = obj(-7.6, y + 0.014, 0.75, 0.1), TB = 0x2f5f9a; for (let i = 0; i < 4; i++) t.box(PL, 0.56 - i * 0.012, 0.016, 0.44 - i * 0.01, rs(0.006), 0.008 + i * 0.017, rs(0.006), { color: V(TB, 0.07), bevel: 0.007 }, rs(0.01), rs(0.03), rs(0.01));
    for (const [x, z] of [[0.26, 0.2], [0.26, -0.2], [-0.26, 0.2]]) t.tor(STEEL, 0.008, 0.003, x, 0.072, z, PI / 2, 0, 0, { color: 0xb9bcbc, rs: 3, ts: 8 }); coil(t, 0.02, 0.07, 0.0, 0.1, 3, 0.005, 0xd9d5c8);
    col.box(-7.45, 0.19, 1.3, 0.95, 0.38, 2.5, { tag: 'clutter' });
    cinder(obj(-7.2, 0.005, -0.75, 0.3)); cinder(obj(-7.18, 0.196, -0.73, 0.42)); cinder(obj(-7.68, 0.1, -0.6, 1.3, PI / 2)); cinder(obj(-6.9, 0.005, -0.42, -0.5), 0x9c998e);
  }
  { // wheelbarrow
    const o = obj(-7.55, 0.005, -2.0, 0.25), GR = 0x3f6b4c;
    o.tor(RUB, 0.165, 0.045, 0, 0.21, 0.56, 0, PI / 2, 0, { color: 0x1f1e1d, rs: 7, ts: 20 }).cyl(MP, 0.11, 0.11, 0.05, 0, 0.21, 0.56, { color: 0xb5332a, seg: 14 }, 0, 0, PI / 2).rod(STEEL, [-0.1, 0.21, 0.56], [0.1, 0.21, 0.56], 0.01, { color: 0x6a6c6e });
    for (const sx of [-1, 1]) { o.strut(W, [sx * 0.1, 0.22, 0.6], [sx * 0.3, 0.56, -0.9], 0.04, 0.045, { color: V(0x9a8b74, 0.1), wear: 0.6 }); o.rod(MP, [sx * 0.24, 0.42, -0.35], [sx * 0.26, 0.0, -0.42], 0.011, { color: 0x2c2c2e }).rod(MP, [sx * 0.2, 0.36, -0.1], [sx * 0.26, 0.0, -0.42], 0.009, { color: 0x2c2c2e }).rod(MP, [sx * 0.1, 0.22, 0.56], [sx * 0.16, 0.5, 0.32], 0.008, { color: 0x2c2c2e }); }
    o.rod(MP, [-0.26, 0.012, -0.42], [0.26, 0.012, -0.42], 0.011, { color: 0x2c2c2e });
    o.box(MP, 0.44, 0.008, 0.6, 0, 0.385, 0.0, { color: 0x6a5a48, bevel: 0.002 }, 0.06).box(MP, 0.6, 0.3, 0.008, 0, 0.53, 0.39, { color: V(GR), bevel: 0.002 }, 0.62).box(MP, 0.62, 0.27, 0.008, 0, 0.5, -0.36, { color: V(GR), bevel: 0.002 }, -0.4);
    for (const sx of [-1, 1]) o.box(MP, 0.008, 0.3, 0.86, sx * 0.275, 0.5, 0.02, { color: V(GR), bevel: 0.002 }, 0.06, 0, -sx * 0.42);
    o.tube(MP, [[-0.33, 0.615, -0.4], [-0.335, 0.635, 0.3], [-0.3, 0.655, 0.47], [0, 0.66, 0.5], [0.3, 0.655, 0.47], [0.335, 0.635, 0.3], [0.33, 0.615, -0.4], [0, 0.61, -0.43]], 0.009, { color: GR, closed: true, tension: 0.2 });
    for (let i = 0; i < 9; i++) o.box(MATTE, 0.03 + r() * 0.08, 0.0015, 0.03 + r() * 0.1, rs(0.17), 0.392 + r() * 0.002, rs(0.22), { color: V(0x8a5a38, 0.2), bevel: 0 }, 0.06);
    for (const sx of [-1, 1]) o.cyl(RUB, 0.022, 0.022, 0.13, sx * 0.3, 0.56, -0.9, { color: 0x1c1c1e, seg: 8 }, PI / 2 - 0.23);
    col.box(-7.55, 0.33, -2.05, 0.7, 0.66, 1.5, { ry: 0.25, tag: 'clutter' });
  }
  { // push broom, rake and a spade leaning on the west face of the carport brace
    const x0 = -6.6;
    D.rod(W, [x0 - 0.03, 1.5, -0.95], [x0 - 0.42, 0.06, -1.0], 0.013, { color: 0xb09a72, seg: 7 }); const bh = obj(x0 - 0.44, 0.035, -1.0, 0.03, 0, -0.26); bh.box(W, 0.07, 0.05, 0.6, 0, 0.03, 0, { grain: 2, color: 0x9c3a2c, wear: 0.4 }); for (let i = 0; i < 12; i++) bh.box(MATTE, 0.06, 0.07, 0.045, rs(0.004), -0.03, -0.275 + i * 0.05, { color: V(0x2a2622, 0.2), bevel: 0.006 }, 0, 0, rs(0.08));
    D.rod(W, [x0 - 0.03, 1.56, -1.5], [x0 - 0.36, 0.05, -1.42], 0.012, { color: 0xa39378, seg: 7 }); const rk = obj(x0 - 0.37, 0.045, -1.42, -0.05, 0, -0.22); rk.box(MP, 0.02, 0.012, 0.4, 0, 0, 0, { color: 0x3a3c3e, bevel: 0.002 }); for (let i = 0; i < 14; i++) rk.box(MP, 0.006, 0.07, 0.004, 0.012, -0.03, -0.19 + i * 0.0292, { color: 0x3a3c3e, bevel: 0 }, 0, 0, -0.25);
    rk.rod(MP, [0, 0, -0.1], [0.03, 0.14, 0], 0.004, { color: 0x3a3c3e, seg: 4 }).rod(MP, [0, 0, 0.1], [0.03, 0.14, 0], 0.004, { color: 0x3a3c3e, seg: 4 });
    prop('rusted_spade_01', M(x0 - 0.2, 0.56, -2.05, 0, PI / 2, 0.22));
  }
  // clothesline from a house pile out to an old pile post in the north yard; the cloth sways
  const cloths = [];
  {
    const A = [-6.4, 2.05, -6.385], Bq = [-6.72, 2.1, -11.2], lp = (t) => [A[0] + (Bq[0] - A[0]) * t, A[1] + (Bq[1] - A[1]) * t - 0.14 * 4 * t * (1 - t), A[2] + (Bq[2] - A[2]) * t];
    D.cyl(W, 0.085, 0.1, 2.75, M(Bq[0], 0.95, Bq[2] - 0.1, 0.03, 0, -0.02), { seg: 12, color: V(0x7d7467), wear: 0.9 }); D.box(W, 0.089, 0.038, 0.7, M(Bq[0], 2.12, Bq[2] - 0.02, 0, PI / 2, 0), { grain: 2, color: V(0x8d857a), wear: 0.8, bevel: 0.004 }); col.cyl(Bq[0], 1.1, Bq[2] - 0.1, 0.12, 2.2, { tag: 'post' });
    const pts = []; for (let i = 0; i <= 12; i++) pts.push(lp(i / 12)); D.tube(MATTE, pts, 0.0035, { color: 0xd9d5c8, seg: 4, steps: 24 });
    D.geo(STEEL, new THREE.TorusGeometry(0.012, 0.003, 4, 8), M(A[0], A[1], A[2] + 0.012, 0, PI / 2, 0), { color: 0x8f9296 });
    const ry = Math.atan2(-(Bq[2] - A[2]), Bq[0] - A[0]), cloth = (id) => { const m = new THREE.MeshStandardMaterial({ normalMap: kit.tex(id + '_nor_gl.jpg'), roughnessMap: kit.tex(id + '_rough.jpg'), vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }); m.normalScale.set(1.4, 1.4); m.userData.uvScale = 0.35; m.name = 'cp_cloth_' + id; return m; }, TERRY = cloth('terry_cloth'), JERSEY = cloth('cotton_jersey');
    const sheet = (w, l1, l2, nu, nv, fn) => { const g = new THREE.PlaneGeometry(1, 1, nu, nv), pa = g.attributes.position, ua = g.attributes.uv; for (let i = 0; i < pa.count; i++) { const u = pa.getX(i), v = -l1 + (0.5 - pa.getY(i)) * (l1 + l2), p = fn(u, v); pa.setXYZ(i, p[0], p[1], p[2]); ua.setXY(i, u * w / 0.35, v / 0.35); } g.computeVertexNormals(); return g; };
    const towel = (w, l1, l2, ph) => sheet(w, l1, l2, 12, 16, (u, v) => { const d = Math.abs(v), s = v < 0 ? -1 : 1, k = Math.min(1, d / 0.05); return [u * w * (1 - 0.05 * d) + 0.012 * Math.sin(d * 9 + ph), -d * 0.995 + 0.004 * (1 - k), s * (0.005 * k + 0.012 * d) + 0.02 * d * Math.sin(u * 11 + ph + d * 2)]; });
    const shirt = (ph) => { const body = sheet(0.5, 0, 0.68, 10, 12, (u, v) => [u * 0.5 * (1 - 0.06 * v), -v, 0.018 * v * Math.sin(u * 13 + ph) + 0.012 * Math.sin(v * 8 + ph)]); const parts = [body];
      for (const s of [-1, 1]) { const sl = sheet(0.2, 0, 0.2, 3, 4, (u, v) => [u * 0.17, -v, 0.01 * Math.sin(u * 9 + v * 6 + ph)]); sl.applyMatrix4(M(s * 0.3, -0.5, 0.004, 0, 0, s * 2.35)); parts.push(sl); } return mergeGeometries(parts); };
    const items = [[0.16, 'towel', 0xd9c9a8, 0.62, 0.55, 0.72], [0.31, 'shirt', 0xd8d5cc], [0.45, 'towel', 0x3f8f96, 0.7, 0.42, 0.86], [0.61, 'shirt', 0x8a2f2a], [0.77, 'towel', 0xc7663c, 0.55, 0.5, 0.55]];
    items.forEach(([t, kind, c, w, l1, l2], i) => { const p = lp(t), g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.order = 'YXZ'; g.rotation.y = ry; const b = kit.batch('cp_cloth' + i);
      b.geo(kind === 'towel' ? TERRY : JERSEY, kind === 'towel' ? towel(w, l1, l2, i * 1.7) : shirt(i * 2.1), null, { color: V(c, 0.03) }); b.build(g); ctx.groups.dyn.add(g); cloths.push({ g, ph: i * 1.9, k: kind === 'towel' ? 1 : 1.5 });
      const hw = kind === 'towel' ? w / 2 - 0.05 : 0.2; for (const s of [-1, 1]) { const q = lp(t + s * hw / 4.83); D.box(W, 0.01, 0.07, 0.012, M(q[0], q[1] - 0.012, q[2], 0, ry, 0), { grain: 1, color: V(0xc9b07c, 0.1), wear: 0.3, bevel: 0.002 }); } });
  }

  // =====================================================================================================================
  // 5. Yard
  // =====================================================================================================================
  { // rope hammock between the two palms
    const A = new THREE.Vector3(-9.5, 1.55, -9), Bp = new THREE.Vector3(-12.6, 1.55, -11.2), dir = Bp.clone().sub(A), len = dir.length(); dir.normalize(); const lat = new THREE.Vector3(-dir.z, 0, dir.x);
    const s0 = 0.98, s1 = len - 0.98, yBar = 1.22, RC = 0xcdbf9c;
    const yAt = (s) => s < s0 ? 1.55 - (1.55 - yBar) * (s / s0) : s > s1 ? 1.55 - (1.55 - yBar) * ((len - s) / s0) : yBar - 0.4 * Math.pow(Math.sin((s - s0) / (s1 - s0) * PI), 0.85);
    const pt = (s, t) => { const f = s > s0 && s < s1 ? Math.sin((s - s0) / (s1 - s0) * PI) : 0; return [A.x + dir.x * s + lat.x * t * (1 - 0.1 * f), yAt(s) - 0.07 * f * (1 - 4 * t * t), A.z + dir.z * s + lat.z * t * (1 - 0.1 * f)]; };
    const N = 30, Mw = 12, node = (i, j) => pt(s0 + (s1 - s0) * i / N, (j / Mw - 0.5) * 1.0), kg = new THREE.OctahedronGeometry(0.0085, 0);
    for (let i = 0; i < N; i++) for (let j = 0; j <= Mw; j++) { if ((i + j) % 2) continue; const a = node(i, j); if (i > 0) D.geo(MATTE, kg, M(a[0], a[1], a[2]), { color: RC });
      if (j < Mw) D.rod(MATTE, a, node(i + 1, j + 1), 0.0034, { seg: 4, color: V(RC, 0.05), caps: false }); if (j > 0) D.rod(MATTE, a, node(i + 1, j - 1), 0.0034, { seg: 4, color: V(RC, 0.05), caps: false }); }
    for (const t of [-0.5, 0.5]) { const e = []; for (let i = 0; i <= N; i++) e.push(pt(s0 + (s1 - s0) * i / N, t)); D.tube(MATTE, e, 0.006, { color: RC, seg: 5, steps: 30 }); }
    for (const [sb, sr, P0] of [[s0, 0.46, A], [s1, len - 0.46, Bp]]) {
      D.strut(W, pt(sb, -0.54), pt(sb, 0.54), 0.036, 0.024, { color: 0xa9824e, wear: 0.3, bevel: 0.006 }); const ring = pt(sr, 0);
      for (let j = 0; j <= Mw; j++) D.rod(MATTE, ring, pt(sb, (j / Mw - 0.5) * 1.0), 0.0028, { seg: 4, color: RC, caps: false });
      D.geo(STEEL, new THREE.TorusGeometry(0.028, 0.005, 5, 12), M(ring[0], ring[1], ring[2], 0, Math.atan2(dir.x, dir.z), 0), { color: 0x8f9296 });
      D.tube(MATTE, [ring, [(ring[0] + P0.x) / 2, (ring[1] + 1.56) / 2 - 0.01, (ring[2] + P0.z) / 2], [P0.x + dir.x * (P0 === A ? 0.16 : -0.16), 1.56, P0.z + dir.z * (P0 === A ? 0.16 : -0.16)]], 0.008, { color: ROPE });
      for (const dy of [0, 0.018, 0.036]) D.geo(MATTE, new THREE.TorusGeometry(0.175, 0.008, 5, 18), M(P0.x, 1.55 + dy, P0.z, PI / 2 + 0.06, dy * 30, 0), { color: ROPE });
    }
    const mid = A.clone().lerp(Bp, 0.5); col.box(mid.x, 0.62, mid.z, 1.9, 0.5, 0.9, { ry: Math.atan2(-dir.z, dir.x), tag: 'clutter' });
    ctx.anchors.hammock = { pos: new THREE.Vector3(mid.x - lat.x * 1.0, 0, mid.z - lat.z * 1.0), heading: Math.atan2(lat.x, lat.z) };
  }
  { // two faded plastic chairs, an upturned cable spool for a table, and the fire pit
    prop('plastic_monobloc_chair_01', M(-5.05, 0.0, -10.75, 0, PI - 0.45, 0)); prop('plastic_monobloc_chair_01', M(-3.2, 0.0, -10.5, -0.04, PI + 0.5, 0.02)); col.box(-5.05, 0.4, -10.75, 0.6, 0.8, 0.6, { ry: -0.45, tag: 'furniture' }); col.box(-3.2, 0.4, -10.5, 0.6, 0.8, 0.6, { ry: 0.5, tag: 'furniture' });
    const o = obj(-4.1, 0, -10.55, 0.4), sc = () => V(0x9a8f7c, 0.1);
    for (const y of [0.03, 0.59]) { o.cyl(W, 0.46, 0.46, 0.045, 0, y, 0, { seg: 26, color: sc(), wear: 0.8 }); }
    for (let i = -3; i <= 3; i++) o.box(MATTE, 0.004, 0.002, 2 * Math.sqrt(0.46 * 0.46 - (i * 0.125) ** 2) - 0.01, i * 0.125 + 0.06, 0.6125, 0, { color: 0x2a2520, bevel: 0 });
    for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; o.box(W, 0.088, 0.52, 0.02, Math.cos(a) * 0.215, 0.31, Math.sin(a) * 0.215, { grain: 1, color: sc(), wear: 0.7 }, 0, -a + PI / 2, 0); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + 0.4; o.cyl(RUSTL, 0.014, 0.014, 0.012, Math.cos(a) * 0.3, 0.618, Math.sin(a) * 0.3, { seg: 6, color: 0x6b5a48 }).cyl(RUSTL, 0.024, 0.024, 0.003, Math.cos(a) * 0.3, 0.614, Math.sin(a) * 0.3, { seg: 8, color: 0x6b5a48 }); }
    o.cyl(MATTE, 0.045, 0.045, 0.003, 0, 0.6135, 0, { color: 0x14110f });
    bottle(o, 0.2, 0.6125, 0.12); bottle(o, 0.27, 0.6125, 0.02, 0x4a2c12); bottle(o, -0.1, 0.6125, -0.26, 0x2f5a2a); bottle(o, -0.24, 0.6125, 0.14, 0x4a2c12, 1, 0.7); bottle(obj(-3.7, 0.005, -10.2), 0, 0, 0, 0x4a2c12, 1, 2.2);
    for (const [x, z] of [[0.1, 0.2], [0.16, -0.12], [-0.02, -0.14]]) o.cyl(STEEL, 0.013, 0.013, 0.005, x, 0.615, z, { color: 0xb9983a, seg: 8 });
    prop('lambis_shell', o.m(-0.12, 0.6125, 0.02, 0, 1.0, 0, 1.6)); col.cyl(-4.1, 0.3, -10.55, 0.47, 0.62, { tag: 'furniture' });
    const f = obj(-4.25, 0, -12.45), rk = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 13; i++) { const a = i / 13 * PI * 2 + rs(0.08), R = 0.58 + rs(0.04); f.geo(ROCK, rk, M(Math.cos(a) * R, 0.06 + r() * 0.03, Math.sin(a) * R, rs(0.5), r() * 6, rs(0.5), 0.13 + r() * 0.06, 0.09 + r() * 0.05, 0.1 + r() * 0.05), { color: V(0xd9d2c0, 0.12), uvMul: [0.5, 0.4] }); }
    for (let i = 0; i < 5; i++) f.geo(ROCK, rk, M(rs(0.5) + (i < 2 ? 0.9 : 0), 0.03, rs(0.5) + (i < 2 ? 0.3 : 0), rs(0.5), r() * 6, 0, 0.05 + r() * 0.04, 0.04, 0.05 + r() * 0.03), { color: V(0xd9d2c0, 0.12), uvMul: [0.3, 0.3] });
    f.cyl(MATTE, 0.5, 0.52, 0.03, 0, 0.012, 0, { color: 0x3b3936, seg: 18 }).cyl(MATTE, 0.3, 0.34, 0.02, 0.05, 0.03, -0.04, { color: 0x8d8a84, seg: 12 });
    for (const [x, z, a, l, c] of [[0, 0, 0.3, 0.6, 0x1c1815], [0.05, 0.05, 1.5, 0.5, 0x241c16], [-0.1, 0.02, 2.5, 0.42, 0x15120f], [0.2, -0.15, 0.9, 0.3, 0x4a3a2c]]) f.cyl(W, 0.045, 0.05, l, x, 0.08, z, { color: c, seg: 8, wear: 1 }, PI / 2 - 0.12, a, 0);
    col.cyl(-4.25, 0.1, -12.45, 0.7, 0.24, { tag: 'clutter' });
  }
  { // mailbox at the street end of the driveway on a leaning 4x4
    const MB = MAILBOX, mby = Math.max(ctx.yardY ? ctx.yardY(MB.x, MB.z) : 0, ctx.opts.groundAt ? ctx.opts.groundAt(MB.x, MB.z) : 0) - 0.03, o = obj(MB.x, mby, MB.z, MB.h + 0.06, 0.035, 0.07), pc = () => V(0x8d857a, 0.1);   // r2-keys: at the drive mouth (yard.data.js)
    o.box(W, 0.089, 1.3, 0.089, 0, 0.5, 0, { grain: 1, color: pc(), wear: 0.9 }).box(W, 0.14, 0.038, 0.6, 0, 1.15, 0.12, { grain: 2, color: pc(), wear: 0.8 }).strut(W, [0, 0.7, 0.05], [0, 1.12, 0.36], 0.038, 0.089, { color: pc(), wear: 0.8 });
    const arch = () => { const sh = new THREE.Shape(); sh.moveTo(-0.085, 0); sh.lineTo(0.085, 0); sh.lineTo(0.085, 0.12); sh.absarc(0, 0.12, 0.085, 0, PI, false); sh.lineTo(-0.085, 0); return sh; };
    const b = o.sub(0, 1.171, 0.13, 0, 0, 0.025), bg = new THREE.ExtrudeGeometry(arch(), { depth: 0.48, bevelEnabled: false, curveSegments: 12 }); bg.translate(0, 0, -0.24); b.geo(STEEL, bg, null, { color: 0x9da2a2, uvMul: [5, 5] });
    const dg = new THREE.ExtrudeGeometry(arch(), { depth: 0.01, bevelEnabled: false, curveSegments: 12 }); dg.scale(1.04, 1.03, 1); b.geo(STEEL, dg, M(0, -0.003, 0.238, 0.16, 0, 0), { color: 0x92979a, uvMul: [5, 5] });
    b.box(STEEL, 0.03, 0.035, 0.012, 0, 0.215, 0.262, { color: 0x8a8f92, bevel: 0.003 }, 0.16).box(STEEL, 0.03, 0.012, 0.03, 0, 0.212, 0.225, { color: 0x8a8f92, bevel: 0.003 });
    b.cyl(STEEL, 0.008, 0.008, 0.012, 0.09, 0.07, 0.12, { color: 0x6a6c6e, seg: 6 }, 0, 0, PI / 2).box(MP, 0.004, 0.03, 0.2, 0.094, 0.07, 0.03, { color: 0xb5332a, bevel: 0.001 }, 0.08).box(MP, 0.004, 0.075, 0.09, 0.094, 0.1, -0.1, { color: 0xb5332a, bevel: 0.001 }, 0.08);
    label(b, REG.mail, 0.43, 0.108, -0.0858, 0.062, 0, 0, -PI / 2, 0); label(b, REG.mail, 0.43, 0.108, 0.0858, 0.062, -0.02, 0, PI / 2, 0); label(b, REG.dive, 0.06, 0.045, -0.0858, 0.14, -0.17, 0, -PI / 2, 0.1);
    for (let i = 0; i < 8; i++) { const s = r() > 0.5 ? 1 : -1; b.box(MATTE, 0.0012, 0.004 + r() * 0.012, 0.01 + r() * 0.03, s * 0.0855, 0.002 + r() * 0.012, rs(0.22), { color: V(0x5a4636, 0.15), bevel: 0 }); }
    b.sph(MATTE, 0.03, 0.03, 0.2, -0.1, { color: 0x7a7d7e }, 1.4, 0.3, 1.8).sph(MATTE, 0.03, -0.04, 0.198, 0.08, { color: 0x5a4636 }, 1, 0.3, 1.5);
    for (let i = 0; i < 9; i++) D.box(CONC, 0.06 + r() * 0.05, 0.04, 0.06 + r() * 0.05, M(MB.x + rs(0.16), mby + 0.04, MB.z + rs(0.16), rs(0.4), r() * 3, rs(0.4)), { color: V(0xcfc8b8, 0.1), bevel: 0.012, wear: 0.8 });
    col.cyl(MB.x, mby + 0.6, MB.z, 0.1, 1.2, { tag: 'post' }); col.box(MB.x + Math.sin(MB.h) * 0.13, mby + 1.28, MB.z + Math.cos(MB.h) * 0.13, 0.2, 0.26, 0.52, { ry: MB.h, tag: 'clutter' });
    ctx.anchors.mailbox = { pos: new THREE.Vector3(MB.x + Math.sin(MB.h) * 0.85, 0, MB.z + Math.cos(MB.h) * 0.85), heading: MB.h + PI };
  }
  { // conch shells lining the foot of the west stair and the driveway edge
    const conch = (seed, broken) => { const nT = 44, nP = 9, turns = 4.1, pos = [], cl = [], idx = [], q = kit.rng(seed), cO = kit.rgb(0xcbbfa8), cT = kit.rgb(0xa98f76), cI = kit.rgb(0xd3a596), t0 = broken === 1 ? 0.42 : 0.04, t1 = broken === 2 ? 0.88 : 1;
      for (let i = 0; i <= nT; i++) { const t = t0 + (t1 - t0) * i / nT, th = t * turns * PI * 2, g = Math.pow(t, 2.3) + 0.015, lip = Math.max(0, (t - 0.9) / 0.1), a = 0.052 * g * (1 + lip * 0.55), R = 0.05 * g, y0 = 0.115 * (1 - Math.pow(t, 1.25)), tone = q();
        for (let j = 0; j <= nP; j++) { const ph = j / nP * PI * 2, kn = 1 + 0.3 * Math.max(0, Math.sin(ph + 0.5)) * Math.pow(Math.abs(Math.sin(th * 3.5)), 6), rad = R + a * Math.cos(ph) * kn * (1 + lip * 0.5 * Math.max(0, Math.cos(ph)));
          pos.push(rad * Math.cos(th), y0 + a * 1.45 * Math.sin(ph) * kn - a * 0.9, rad * Math.sin(th)); const inner = t > 0.9 && Math.cos(ph) < -0.25, c = inner ? cI : kit.mix(cO, cT, tone * 0.7), k = 0.85 + q() * 0.22; cl.push(c[0] * k, c[1] * k, c[2] * k); } }
      for (let i = 0; i < nT; i++) for (let j = 0; j < nP; j++) { const a = i * (nP + 1) + j, b = a + nP + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      const n0 = pos.length / 3, e = nT * (nP + 1); let cx = 0, cy = 0, cz = 0; for (let j = 0; j < nP; j++) { cx += pos[(e + j) * 3]; cy += pos[(e + j) * 3 + 1]; cz += pos[(e + j) * 3 + 2]; } pos.push(cx / nP, cy / nP, cz / nP); cl.push(cI[0] * 0.5, cI[1] * 0.42, cI[2] * 0.4);
      for (let j = 0; j < nP; j++) idx.push(e + j, n0, e + j + 1);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    const geos = [conch(1, 0), conch(2, 0), conch(3, 1), conch(4, 2), conch(5, 0)], spots = [];
    for (let i = 0; i < 5; i++) { spots.push([-12.12 + rs(0.05), 6.35 + SZ + i * 0.42 + rs(0.06)]); spots.push([-10.28 + rs(0.05), 6.4 + SZ + i * 0.42 + rs(0.06)]); }
    spots.forEach(([x, z], i) => { const s = 0.78 + r() * 0.3; D.geo(MATTE, geos[i % 5], M(x, 0.055 * s, z, PI / 2 + rs(0.35), r() * 6.28, rs(0.3), s), { keepColor: true }); });
  }
  { // painted buoys hanging off the stair landing post
    const o = obj(-10.5, 2.42, 4.31 + SZ); o.rod(RUSTL, [-0.08, 0.0, -0.08], [0.0, 0.01, 0.0], 0.006, { color: 0x6b5a48 });
    const hang = [[0.0, -0.55, 0.02, CODE, 0], [0.13, -0.8, -0.03, [0xc2521d, 0xd9d5c8, 0x1b1b1d], 0], [-0.04, -1.02, 0.14, [0xd9d5c8, 0x2c4f8a, 0xb5332a], 1], [0.1, -0.42, 0.14, [0xd9b526, 0xd9b526, 0x1b1b1d], 1], [0.02, -1.28, 0.0, [0x2c4f8a, 0xd9d5c8, 0xd9d5c8], 0], [0.17, -1.15, 0.12, CODE, 0]];
    hang.forEach(([x, y, z, bands, kind], i) => { buoy(o, x, y, z, rs(0.15), r() * 6, rs(0.15), bands, 0.95, kind); o.tube(MATTE, [[0, 0, 0], [x * 0.5, y * 0.4, z * 0.5], [x, y + (kind ? 0.13 : 0.18), z]], 0.004, { color: i % 2 ? 0xd9d5c8 : ROPE, seg: 4 }); });
  }
  { // boat anchor leaning by the south-west pile, door mat and flip-flops at the west stair
    const o = obj(-6.86, 0.02, 5.42, 0.7, -0.3, 0), RC = 0x9a8878;
    o.rod(RUST, [0, 0.06, 0], [0, 0.9, 0], 0.017, { color: RC, seg: 8 }).tube(RUST, [[-0.27, 0.32, 0], [-0.2, 0.13, 0], [0, 0.04, 0], [0.2, 0.13, 0], [0.27, 0.32, 0]], 0.017, { color: RC, seg: 7 }).rod(RUST, [0, 0.8, -0.27], [0, 0.8, 0.27], 0.012, { color: RC, seg: 7 });
    for (const s of [-1, 1]) { o.box(RUST, 0.11, 0.14, 0.012, s * 0.25, 0.3, 0, { color: RC, bevel: 0.004 }, 0, 0, s * 0.5).sph(RUST, 0.022, 0, 0.8, s * 0.27, { color: RC }); }
    o.tor(RUST, 0.04, 0.008, 0, 0.94, 0, 0, PI / 2, 0, { color: RC, rs: 5, ts: 12 }); for (let i = 0; i < 7; i++) o.tor(RUST, 0.022, 0.006, 0.03 + i * 0.012, 0.9 - i * 0.035 - (i > 3 ? 0.02 : 0), 0.04 + i * 0.03, i % 2 ? 0.4 : 1.2, i % 2 ? 0 : PI / 2, 0, { color: RC, rs: 4, ts: 8, flat: 1 });
    D.box(RUB, 0.76, 0.014, 0.46, M(-11.2, 0.067, 6.72 + SZ, 0, 0.05, 0), { color: 0x3a2c20, bevel: 0.004 }); D.geo(ATLAS, new THREE.PlaneGeometry(0.74, 0.44), M(-11.2, 0.0746, 6.72 + SZ, -PI / 2, 0.05, 0), REG.doormat);
    const sole = new THREE.Shape(); sole.absellipse(0, 0, 0.048, 0.13, 0, PI * 2); const sg = new THREE.ExtrudeGeometry(sole, { depth: 0.013, bevelEnabled: false, curveSegments: 10 }); sg.rotateX(-PI / 2);
    for (const [x, z, a] of [[-11.02, 6.02 + SZ, 0.25], [-10.87, 5.99 + SZ, -0.12]]) { const f = obj(x, 0.189, z, a); f.geo(RUB, sg, null, { color: V(0x3f7fa6, 0.06) }); f.tube(RUB, [[-0.04, 0.013, 0.01], [-0.03, 0.035, -0.04], [0, 0.016, -0.08], [0.03, 0.035, -0.04], [0.04, 0.013, 0.01]], 0.005, { color: 0xe3e0d6, seg: 5 }); }
  }

  // ---------- CC0 props: load, bake the placements, one mesh per model material ----------
  const ids = [...new Set(jobs.map((j) => j.id))], loaded = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await kit.model(id)]))), byMat = new Map();
  for (const j of jobs) { const g = loaded[j.id]; if (!g) continue; g.updateMatrixWorld(true);
    g.traverse((n) => { if (!n.isMesh || (j.only && !j.only.test(n.name) && !j.only.test(n.parent?.name || ''))) return; const geo = n.geometry.clone(); for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
      geo.applyMatrix4(n.matrixWorld); if (j.pre) geo.applyMatrix4(j.pre); geo.applyMatrix4(j.m4); if (!byMat.has(n.material)) byMat.set(n.material, []); byMat.get(n.material).push(geo); }); }
  let propTris = 0;
  for (const [m, gs] of byMat) { const g = gs.length > 1 ? mergeGeometries(gs) : gs[0]; if (!g) continue; propTris += g.index.count / 3; const mesh = new THREE.Mesh(g, m); mesh.name = 'carport:' + (m.name || 'prop'); mesh.castShadow = mesh.receiveShadow = true; ctx.groups.detail.add(mesh); }
  ctx.stats.carport = { propTris, propMeshes: byMat.size, models: ids.length };

  // ---------- updater: trouble light at night, laundry in the breeze ----------
  let tm = 0;
  ctx.updaters.push((dt, env) => { tm += dt; const h = env?.timeOfDay ?? ctx.time ?? 12, on = h < 6.3 || h > 18.6; if (lamp) lamp.on = on; BULB.emissiveIntensity = on ? 4.5 : 0.9;
    for (const c of cloths) c.g.rotation.x = (0.05 + 0.03 * Math.sin(tm * 0.31 + c.ph)) * Math.sin(tm * 1.3 * c.k + c.ph) + 0.03 * Math.sin(tm * 2.9 + c.ph * 2); });
}

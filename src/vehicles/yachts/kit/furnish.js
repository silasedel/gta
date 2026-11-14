// Port Solana V2 yachts: furniture, deck gear, helm, galley, cabins, machinery, toys.
// Every function: name(ctx, pos, heading, opts). Draws at pos (floor point) facing heading, registers colliders, spots, interacts.
import * as THREE from 'three';
import { lerp } from './builder.js';

const PI = Math.PI;
let uid = 0; const nid = (p) => p + (uid++);

// ---------------------------------------------------------------- seating
/** Sofa run. o: { w, d (0.85), base ('gel' | 'teakCap' | 'woodA'), cush ('cushion'), back (true), arms, pillows (true), tags, node, interior } */
export function sofa(ctx, pos, heading, o = {}) {
  const w = o.w ?? 2.4, d = o.d ?? 0.85, cm = o.cush ?? 'cushion', n = Math.max(1, Math.round(w / 0.7)), sw = w / n, pal = ctx.mats.palette.pillows;
  ctx.at(pos, heading, (c) => {
    c.box(o.base ?? 'gel', [w, 0.3, d], [0, 0.17, 0], { solid: true, tag: 'furniture' });
    c.box('black', [w - 0.06, 0.04, d - 0.06], [0, 0.02, 0]);
    if (o.back !== false) c.rbox(o.base ?? 'gel', [w, 0.5, 0.12], [0, 0.57, -d / 2 + 0.06], { r: 0.04, solid: true, tag: 'furniture' });
    c.lod(2, () => {
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + sw * (i + 0.5);
        c.rbox(cm, [sw - 0.02, 0.14, d - 0.2], [x, 0.39, 0.07], { r: 0.05 });
        if (o.back !== false) c.rbox(cm, [sw - 0.03, 0.4, 0.14], [x, 0.63, -d / 2 + 0.19], { r: 0.06, rot: [-0.12, 0, 0] });
        c.box('cushion2', [sw - 0.03, 0.012, 0.012], [x, 0.462, d / 2 - 0.035]);
      }
      if (o.pillows !== false) for (const sx of [-1, 1]) c.rbox('vcSoft', [0.4, 0.4, 0.13], [sx * (w / 2 - 0.26), 0.66, -d / 2 + 0.33], { r: 0.06, rot: [-0.3, sx * 0.3, 0], color: pal[Math.floor(ctx.rand() * pal.length)] });
      if (o.arms) for (const sx of [-1, 1]) c.rbox(o.base ?? 'gel', [0.14, 0.42, d], [sx * (w / 2 + 0.07), 0.38, 0], { r: 0.05 });
    });
    for (let i = 0; i < n; i++) { const x = -w / 2 + sw * (i + 0.5); const s = c.spot('seat', [x, 0.02, 0.08], { heading: 0, tags: o.tags ?? ['guest'], node: o.node, seatH: 0.46 }); c.interact('sit', [x, 0.5, 0.2], { r: 1.0, label: 'Sit', data: { spot: s.id } }); }
  });
}
/** Sunpad. o: { w, l, h (0.35), base } */
export function sunpad(ctx, pos, heading, o = {}) {
  const w = o.w ?? 2, l = o.l ?? 2, h = o.h ?? 0.35, n = Math.max(1, Math.round(w / 0.75));
  ctx.at(pos, heading, (c) => {
    c.box(o.base ?? 'gel', [w, h, l], [0, h / 2, 0], { solid: true, tag: 'furniture' });
    c.lod(2, () => { for (let i = 0; i < n; i++) { const x = -w / 2 + (w / n) * (i + 0.5); c.rbox('cushion', [w / n - 0.03, 0.1, l - 0.06], [x, h + 0.05, 0], { r: 0.04 }); c.rbox('cushion2', [w / n - 0.12, 0.09, 0.3], [x, h + 0.13, l / 2 - 0.22], { r: 0.04 }); } });
    for (let i = 0; i < n; i++) { const x = -w / 2 + (w / n) * (i + 0.5); const s = c.spot('lounge', [x, h + 0.1, -0.1], { heading: PI, tags: ['guest', 'sun'], node: o.node }); c.interact('lounge', [x, h + 0.2, 0], { r: 1.1, label: 'Lie down', data: { spot: s.id } }); }
  });
}
/** Chaise lounger with frame and rolled towel. o: { frame: 'teakCap' | 'alu' | 'ss' } */
export function lounger(ctx, pos, heading, o = {}) {
  const fm = o.frame ?? 'teakCap';
  ctx.at(pos, heading, (c) => {
    c.box(fm, [0.66, 0.05, 1.95], [0, 0.3, 0], { solid: true, tag: 'furniture' });
    for (const sx of [-1, 1]) for (const z of [-0.8, 0.75]) c.box(fm, [0.05, 0.28, 0.05], [sx * 0.29, 0.14, z]);
    c.lod(2, () => { c.rbox('cushion', [0.62, 0.08, 1.25], [0, 0.37, -0.32], { r: 0.03 }); c.rbox('cushion', [0.62, 0.08, 0.68], [0, 0.55, 0.6], { r: 0.03, rot: [-0.6, 0, 0] }); c.cyl('terry', 0.07, 0.07, 0.5, [0, 0.47, -0.85], { rot: [0, 0, PI / 2], seg: 12 }); });
    const s = c.spot('lounge', [0, 0.4, -0.15], { heading: PI, tags: ['guest', 'sun'], node: o.node }); c.interact('lounge', [0, 0.5, 0], { r: 1.0, label: 'Lie down', data: { spot: s.id } });
  });
}
/** Table. o: { w, l, h (0.72), top ('teakCap'), leg ('ss'), round, set (place settings count) } */
export function table(ctx, pos, heading, o = {}) {
  const w = o.w ?? 0.9, l = o.l ?? 1.4, h = o.h ?? 0.72, tm = o.top ?? 'teakCap';
  ctx.at(pos, heading, (c) => {
    if (o.round) c.cyl(tm, w / 2, w / 2, 0.04, [0, h - 0.02, 0], { seg: 28 }); else c.rbox(tm, [w, 0.04, l], [0, h - 0.02, 0], { r: 0.015, seg: 1 });
    const legs = o.round || l < 1.2 ? [0] : [-l / 2 + 0.35, l / 2 - 0.35];
    for (const z of legs) { c.cyl(o.leg ?? 'ss', 0.045, 0.045, h - 0.05, [0, (h - 0.05) / 2, z], { seg: 12 }); c.cyl(o.leg ?? 'ss', 0.2, 0.22, 0.02, [0, 0.01, z], { seg: 16 }); }
    c.solidBox([w * 0.9, h, (o.round ? w : l) * 0.9], [0, h / 2, 0], { tag: 'furniture' });
    c.lod(2, () => { const n = o.set ?? 0; for (let i = 0; i < n; i++) { const sx = i % 2 ? 1 : -1, z = lerp(-l / 2 + 0.3, l / 2 - 0.3, n <= 2 ? 0.5 : Math.floor(i / 2) / Math.max(1, Math.ceil(n / 2) - 1)); c.cyl('vcGloss', 0.13, 0.09, 0.015, [sx * (w / 2 - 0.2), h + 0.008, z], { seg: 16, color: 0xf6f4ee }); c.cyl('vcGlass', 0.03, 0.022, 0.11, [sx * (w / 2 - 0.36), h + 0.055, z + 0.14], { seg: 8, color: 0xdfeef0 }); } });
  });
}
/** Chair. o: { style: 'deck' | 'dining' | 'stool', mat } */
export function chair(ctx, pos, heading, o = {}) {
  const st = o.style ?? 'dining', sh = st === 'stool' ? 0.74 : 0.46, fm = o.frame ?? (st === 'deck' ? 'teakCap' : 'woodB');
  ctx.at(pos, heading, (c) => {
    if (st === 'stool') { c.cyl('ss', 0.03, 0.03, sh, [0, sh / 2, 0], { seg: 10 }); c.cyl('ss', 0.18, 0.2, 0.02, [0, 0.01, 0], { seg: 14 }); c.cyl(o.mat ?? 'leather', 0.19, 0.17, 0.07, [0, sh + 0.03, 0], { seg: 18 }); }
    else { for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(fm, [0.04, sh, 0.04], [sx * 0.2, sh / 2, sz * 0.2]); c.rbox(o.mat ?? 'leather', [0.46, 0.07, 0.46], [0, sh + 0.02, 0], { r: 0.025 }); c.rbox(o.mat ?? 'leather', [0.44, 0.44, 0.06], [0, sh + 0.3, -0.22], { r: 0.025, rot: [-0.1, 0, 0] }); }
    c.solidBox([0.42, sh, 0.42], [0, sh / 2, 0], { tag: 'furniture' });
    const s = c.spot(st === 'stool' ? 'bar' : 'dine', [0, 0.02, 0.02], { heading: 0, tags: o.tags ?? ['guest'], node: o.node, seatH: sh }); c.interact('sit', [0, sh, 0.1], { r: 0.9, label: 'Sit', data: { spot: s.id } });
  });
}
/** Dining set: table with n chairs. o: { n (6), w, l, top } */
export function diningSet(ctx, pos, heading, o = {}) {
  const n = o.n ?? 6, l = o.l ?? Math.max(1.4, n * 0.33), w = o.w ?? 1.0;
  table(ctx, pos, heading, { w, l, top: o.top ?? 'woodGloss', leg: o.leg ?? 'metal', set: n });
  ctx.at(pos, heading, (c) => { const per = n / 2; for (let i = 0; i < per; i++) { const z = lerp(-l / 2 + 0.35, l / 2 - 0.35, per === 1 ? 0.5 : i / (per - 1)); chair(c, [w / 2 + 0.32, 0, z], -PI / 2, { mat: o.chair ?? 'leather', node: o.node }); chair(c, [-w / 2 - 0.32, 0, z], PI / 2, { mat: o.chair ?? 'leather', node: o.node }); } });
}

// ---------------------------------------------------------------- food and drink (edible parts)
const FOODS = {
  fruit: { name: 'Tropical fruit platter', kcal: 180, heal: 10, bites: 4, kind: 'food' }, sushi: { name: 'Shrimp nigiri tray', kcal: 360, heal: 16, bites: 6, kind: 'food' },
  crab: { name: 'Stone crab claws on ice', kcal: 240, heal: 14, bites: 4, kind: 'food' }, pie: { name: 'Key lime pie', kcal: 420, heal: 12, bites: 4, kind: 'food' },
  champagne: { name: 'Glass of champagne', kcal: 90, heal: 2, bites: 3, kind: 'alcohol' }, cafecito: { name: 'Cafecito', kcal: 40, heal: 3, bites: 2, kind: 'coffee' },
  croqueta: { name: 'Ham croquetas', kcal: 310, heal: 12, bites: 5, kind: 'food' }, water: { name: 'Bottle of spring water', kcal: 0, heal: 4, bites: 3, kind: 'drink' },
};
/** One edible item on a surface. kind: fruit | sushi | crab | pie | champagne | cafecito | croqueta | water */
export function food(ctx, pos, kind = 'fruit') {
  const id = nid('food:' + kind + ':'), item = FOODS[kind];
  ctx.part(id, pos, ctx.rand() * 6, (p) => {
    if (kind === 'fruit') { p.cyl('vcGloss', 0.2, 0.14, 0.03, [0, 0.015, 0], { seg: 18, color: 0xf4f2ea }); const cols = [0xf2b233, 0xd9342b, 0x7fb23a, 0xf28c28, 0x8a2be2, 0xf7d94c]; for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 0.04 + (i % 3) * 0.045; p.sphere('vcGloss', 0.035 + (i % 2) * 0.012, [Math.cos(a) * r, 0.06, Math.sin(a) * r], { seg: 8, color: cols[i % 6] }); } p.cone('vc', 0.03, 0.09, [0, 0.12, 0], { seg: 6, color: 0x3d7a2a }); }
    else if (kind === 'sushi') { p.box('vcGloss', [0.34, 0.015, 0.2], [0, 0.008, 0], { color: 0x1c1c1e }); for (let i = 0; i < 6; i++) { const x = -0.12 + (i % 3) * 0.12, z = i < 3 ? -0.045 : 0.045; p.rbox('vc', [0.07, 0.028, 0.032], [x, 0.03, z], { r: 0.012, seg: 1, color: 0xf7f4ec }); p.rbox('vcGloss', [0.08, 0.014, 0.034], [x, 0.05, z], { r: 0.006, seg: 1, color: 0xf08a6a }); } }
    else if (kind === 'crab') { p.cyl('vcMetal', 0.19, 0.15, 0.07, [0, 0.035, 0], { seg: 18, color: 0xd8dde0 }); p.cyl('vcGlass', 0.17, 0.17, 0.02, [0, 0.07, 0], { seg: 16, color: 0xeaf6fa }); for (let i = 0; i < 6; i++) { const a = i * 1.05; p.sphere('vcGloss', 0.035, [Math.cos(a) * 0.1, 0.1, Math.sin(a) * 0.1], { seg: 8, scale: [1.5, 0.8, 0.9], color: i % 2 ? 0xe8623a : 0xf2c9a0, rot: [0, -a, 0] }); } p.sphere('vcGloss', 0.03, [0, 0.1, 0], { seg: 8, color: 0xf1d24a, scale: [1, 0.6, 1] }); }
    else if (kind === 'pie') { p.cyl('vcGloss', 0.15, 0.12, 0.015, [0, 0.008, 0], { seg: 18, color: 0xf6f4ee }); p.cyl('vc', 0.12, 0.11, 0.035, [0, 0.033, 0], { seg: 18, color: 0xd9b36a, arc: [0, PI * 1.5] }); p.cyl('vc', 0.108, 0.108, 0.012, [0, 0.055, 0], { seg: 18, color: 0xe9f0b0, arc: [0, PI * 1.5] }); for (let i = 0; i < 5; i++) p.sphere('vc', 0.014, [Math.cos(i * 0.9 + 0.4) * 0.08, 0.068, Math.sin(i * 0.9 + 0.4) * 0.08], { seg: 6, color: 0xffffff }); }
    else if (kind === 'champagne') { p.cyl('vcGlass', 0.006, 0.03, 0.006, [0, 0.003, 0], { seg: 10, color: 0xf0f6f8 }); p.cyl('vcGlass', 0.004, 0.004, 0.09, [0, 0.05, 0], { seg: 6, color: 0xf0f6f8 }); p.cyl('vcGlass', 0.03, 0.012, 0.1, [0, 0.145, 0], { seg: 10, color: 0xf3dc8a }); }
    else if (kind === 'cafecito') { p.cyl('vcGloss', 0.05, 0.04, 0.008, [0, 0.004, 0], { seg: 12, color: 0xffffff }); p.cyl('vcGloss', 0.028, 0.022, 0.045, [0, 0.03, 0], { seg: 12, color: 0xffffff }); p.cyl('vc', 0.024, 0.024, 0.004, [0, 0.052, 0], { seg: 10, color: 0x3a2112 }); }
    else if (kind === 'croqueta') { p.cyl('vcGloss', 0.13, 0.1, 0.015, [0, 0.008, 0], { seg: 16, color: 0xf6f4ee }); for (let i = 0; i < 5; i++) p.sphere('vc', 0.03, [Math.cos(i * 1.26) * 0.06, 0.04, Math.sin(i * 1.26) * 0.06], { seg: 8, scale: [1.7, 0.9, 0.9], rot: [0, i, 0], color: 0xc98a3a }); p.sphere('vcGloss', 0.018, [0, 0.03, 0], { seg: 6, color: 0x8fbf3a }); }
    else { p.cyl('vcGlass', 0.032, 0.032, 0.17, [0, 0.085, 0], { seg: 10, color: 0xbfe6f2 }); p.cyl('vc', 0.014, 0.014, 0.03, [0, 0.185, 0], { seg: 8, color: 0x1f6fb2 }); p.cyl('vc', 0.0325, 0.0325, 0.05, [0, 0.09, 0], { seg: 10, color: 0x1f6fb2 }); }
  }, { data: { item } });
  ctx.interact(item.kind === 'food' ? 'eat' : 'drink', [pos[0], pos[1] + 0.05, pos[2]], { r: 1.2, label: (item.kind === 'food' ? 'Eat: ' : 'Drink: ') + item.name, data: { part: id, item } });
}

// ---------------------------------------------------------------- helm
/** Helm station: console, live instrument screen, wheel, throttles, helm seat. o: { id, w (1.3), deck, wheel: 'ss' | 'wood' | 'carbon', dash ('black'), base ('gel'), seat: 'pedestal' | 'bench' } */
export function helm(ctx, pos, heading, o = {}) {
  const id = o.id ?? nid('helm'), w = o.w ?? 1.3, S = ctx.mats.screen;
  const rect = S.add(256, 128, (g, x, y, W, H) => { g.fillStyle = '#04121c'; g.fillRect(x, y, W, H); });
  ctx.at(pos, heading, (c) => {
    c.rbox(o.base ?? 'gel', [w, 0.9, 0.5], [0, 0.45, 0.45], { r: 0.05, solid: true, tag: 'furniture' });
    c.box(o.dash ?? 'black', [w - 0.06, 0.42, 0.05], [0, 1.05, 0.52], { rot: [-0.9, 0, 0] });
    const u = rect, sw = Math.min(0.62, w * 0.5);
    c.frame([0, 1.06, 0.49], [-0.9, PI, 0], (f) => f.quad('screen', [-sw / 2, -0.13, 0.03], [sw / 2, -0.13, 0.03], [sw / 2, 0.13, 0.03], [-sw / 2, 0.13, 0.03], { uvs: [[u[0], u[1]], [u[2], u[1]], [u[2], u[3]], [u[0], u[3]]] }));
    c.lod(2, () => { for (let i = 0; i < 8; i++) c.box('vcEmit', [0.018, 0.01, 0.012], [-w / 2 + 0.12 + i * 0.045, 0.93, 0.33], { color: i % 3 ? 0x2bd4ff : 0xffb020 }); c.sphere('blackGloss', 0.05, [w / 2 - 0.2, 1.2, 0.6], { seg: 12 }); c.box('black', [0.1, 0.05, 0.14], [-w / 2 + 0.16, 1.02, 0.36]); });
    const wk = o.wheel ?? 'ss';
    c.part('wheel:' + id, [-0.02, 0.98, 0.2], 0, (p) => { p.frame([0, 0, 0], [0.9 + PI / 2, 0, 0], (q) => { q.torus(wk === 'wood' ? 'teakCap' : wk === 'carbon' ? 'carbon' : 'ss', 0.19, 0.017, [0, 0, 0], { seg: 28 }); for (let i = 0; i < (wk === 'wood' ? 6 : 3); i++) { const a = i * PI * 2 / (wk === 'wood' ? 6 : 3); q.rod('ss', [0, 0, 0], [Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0], 0.009, { seg: 6 }); } q.cyl('ss', 0.035, 0.035, 0.05, [0, 0, 0], { rot: [PI / 2, 0, 0], seg: 12 }); }); }, { data: { axis: [0, Math.cos(0.9 + PI / 2 - PI / 2), Math.sin(0.9)], kind: 'wheel' } });
    c.part('thr:' + id, [0.38, 0.92, 0.3], 0, (p) => { for (const sx of [-0.035, 0.035]) { p.rod('ss', [sx, 0, 0], [sx, 0.13, 0], 0.008, { seg: 6 }); p.sphere('blackGloss', 0.02, [sx, 0.14, 0], { seg: 8 }); } }, { data: { kind: 'throttle' } });
    c.box('ss', [0.12, 0.03, 0.1], [0.38, 0.91, 0.3]);
    if (o.seat === 'bench') { c.rbox(o.base ?? 'gel', [w, 0.5, 0.5], [0, 0.25, -0.62], { r: 0.04, solid: true, tag: 'furniture' }); c.rbox('cushion', [w - 0.05, 0.12, 0.46], [0, 0.56, -0.62], { r: 0.04 }); c.rbox('cushion', [w - 0.05, 0.5, 0.12], [0, 0.85, -0.84], { r: 0.05 }); }
    else { c.cyl('ss', 0.05, 0.06, 0.55, [0, 0.28, -0.55], { seg: 12, solid: true, tag: 'furniture' }); c.rbox(o.seatMat ?? 'leather', [0.52, 0.12, 0.5], [0, 0.62, -0.55], { r: 0.05 }); c.rbox(o.seatMat ?? 'leather', [0.5, 0.62, 0.12], [0, 0.98, -0.8], { r: 0.05, rot: [-0.08, 0, 0] }); for (const sx of [-1, 1]) c.rbox('black', [0.06, 0.04, 0.34], [sx * 0.29, 0.82, -0.58], { r: 0.015, seg: 1 }); }
    c.spot('helm', [0, 0.02, -0.12], { heading: 0, tags: ['crew', 'bridge'], id: 'helm:' + id, node: o.node });
    c.interact('helm', [0, 1.0, 0.05], { r: 1.3, label: 'Helm', id: 'helm:' + id, data: { helm: id } });
    (ctx.root.meta.helms ||= []).push({ id, pos: c.P([0, 0.02, -0.12]).toArray(), heading: c.H(0), deck: o.deck ?? null, wheel: 'wheel:' + id, throttles: ['thr:' + id], seat: 'helm:' + id });
  });
  let t = 0;
  ctx.onUpdate((dt, rt) => {
    const st = rt.state, wp = rt.parts['wheel:' + id], tp = rt.parts['thr:' + id];
    if (wp) wp.group.rotation.set(0, 0, 0), wp.group.rotateOnAxis(_ax.set(0, Math.sin(0.9 + PI / 2), -Math.cos(0.9 + PI / 2)).normalize(), -(st.rudder || 0) * 2.2);
    if (tp) tp.group.rotation.x = (st.throttle || 0) * 0.7;
    t -= dt; if (t > 0 || rt.lod < 2) return; t = 0.5;
    S.redraw(rect, (g, x, y, W, H) => {
      g.fillStyle = '#04121c'; g.fillRect(x, y, W, H); g.strokeStyle = '#1c6f8f'; g.lineWidth = 1;
      for (let i = 1; i < 5; i++) { g.beginPath(); g.arc(x + 62, y + 64, i * 12, 0, 6.3); g.stroke(); }
      const a = rt.time * 1.6; g.strokeStyle = '#3df2a0'; g.beginPath(); g.moveTo(x + 62, y + 64); g.lineTo(x + 62 + Math.cos(a) * 50, y + 64 + Math.sin(a) * 50); g.stroke();
      g.fillStyle = '#9fe8ff'; g.font = 'bold 22px monospace'; g.fillText(((st.speedKn ?? 0)).toFixed(1) + ' kn', x + 130, y + 34); g.font = '15px monospace';
      g.fillText('HDG ' + String(Math.round((((st.heading || 0) * 180 / PI) % 360 + 360) % 360)).padStart(3, '0'), x + 130, y + 60); g.fillText('RPM ' + Math.round(st.rpm || 0), x + 130, y + 82);
      g.fillStyle = '#ffb020'; g.fillText(st.anchored ? 'ANCHORED' : st.moored ? 'MOORED' : st.engineOn ? 'UNDER WAY' : 'ADRIFT', x + 130, y + 108);
    });
  });
}
const _ax = new THREE.Vector3();

// ---------------------------------------------------------------- galley, bar
/** Galley run along local x. o: { w (2.4), top ('stone'), front ('woodA'), upper (true), foods: ['fruit', ...] } */
export function galley(ctx, pos, heading, o = {}) {
  const w = o.w ?? 2.4, fm = o.front ?? 'woodA', tm = o.top ?? 'stone';
  ctx.at(pos, heading, (c) => {
    c.box(fm, [w, 0.86, 0.6], [0, 0.45, 0], { solid: true, tag: 'furniture' }); c.box('black', [w, 0.08, 0.54], [0, 0.04, 0.02]);
    c.rbox(tm, [w + 0.03, 0.04, 0.64], [0, 0.9, 0.01], { r: 0.01, seg: 1 });
    const n = Math.max(2, Math.round(w / 0.6));
    for (let i = 0; i < n; i++) { const x = -w / 2 + (w / n) * (i + 0.5); c.box('ss', [0.16, 0.012, 0.012], [x, 0.78, 0.31]); c.box('black', [0.004, 0.76, 0.004], [x + w / n / 2, 0.47, 0.301]); }
    c.box('blackGloss', [0.56, 0.006, 0.5], [-w / 2 + 0.45, 0.923, 0]); // induction hob
    c.box('ssBrushed', [0.46, 0.01, 0.38], [w / 2 - 0.45, 0.922, 0]); c.box('black', [0.4, 0.004, 0.32], [w / 2 - 0.45, 0.925, 0]);
    c.tube('ss', [[w / 2 - 0.45, 0.92, -0.2], [w / 2 - 0.45, 1.2, -0.2], [w / 2 - 0.45, 1.24, -0.1], [w / 2 - 0.45, 1.16, -0.04]], 0.012, { seg: 6 });
    c.box('ssBrushed', [0.58, 0.56, 0.02], [-w / 2 + 0.45, 0.5, 0.305]); c.box('blackGloss', [0.46, 0.3, 0.004], [-w / 2 + 0.45, 0.5, 0.317]);
    if (o.upper !== false) { c.box(fm, [w, 0.5, 0.32], [0, 1.72, -0.14]); c.light('int', [0, 1.46, -0.05], { shape: 'bar', len: w * 0.8, size: 0.015, color: 0xfff0d8, intensity: 0.8, range: 2.5 }); }
    c.cyl('vcMetal', 0.07, 0.06, 0.2, [0.1, 1.02, -0.15], { seg: 12, color: 0xd8dde0 }); c.box('vcGloss', [0.2, 0.28, 0.24], [0.42, 1.06, -0.14], { color: 0x202326 }); // kettle, espresso machine
    c.interact('sink', [w / 2 - 0.45, 1.0, 0.3], { r: 1.0, label: 'Sink' });
    const fs = o.foods ?? ['fruit', 'cafecito']; fs.forEach((k, i) => food(c, [lerp(-w / 2 + 0.95, w / 2 - 0.9, fs.length === 1 ? 0.5 : i / (fs.length - 1)), 0.922, 0.08], k));
    c.spot('work', [0, 0.02, 0.75], { heading: PI, tags: ['crew', 'galley'], node: o.node });
  });
}
/** Refrigerator column. */
export function fridge(ctx, pos, heading, o = {}) {
  ctx.at(pos, heading, (c) => { c.rbox('ssBrushed', [o.w ?? 0.7, 1.9, 0.62], [0, 0.97, 0], { r: 0.012, seg: 1, solid: true, tag: 'furniture' }); c.box('black', [0.006, 1.86, 0.004], [0, 0.97, 0.312]); for (const sx of [-1, 1]) c.box('ss', [0.02, 0.7, 0.03], [sx * 0.05, 1.1, 0.33]); c.interact('fridge', [0, 1.1, 0.35], { r: 1.0, label: 'Refrigerator' }); });
}
/** Bar counter with stools and a bottle shelf. o: { w (2), foods } */
export function bar(ctx, pos, heading, o = {}) {
  const w = o.w ?? 2;
  ctx.at(pos, heading, (c) => {
    c.box(o.front ?? 'woodA', [w, 1.02, 0.5], [0, 0.51, 0], { solid: true, tag: 'furniture' }); c.rbox(o.top ?? 'stone', [w + 0.08, 0.045, 0.62], [0, 1.06, 0.03], { r: 0.012, seg: 1 }); c.box('ss', [w - 0.1, 0.03, 0.03], [0, 0.2, 0.3]);
    c.lod(2, () => { const cols = [0x2e5d34, 0x7a3b12, 0xd9d2c0, 0x1b2a44, 0xb5651d, 0x8a1c1c]; for (let i = 0; i < 7; i++) { const x = -w / 2 + 0.2 + i * 0.12; c.cyl('vcGlass', 0.035, 0.035, 0.2, [x, 1.18, -0.16], { seg: 8, color: cols[i % 6] }); c.cyl('vcGlass', 0.012, 0.03, 0.08, [x, 1.32, -0.16], { seg: 8, color: cols[i % 6] }); } });
    const fs = o.foods ?? ['champagne', 'champagne']; fs.forEach((k, i) => food(c, [w / 2 - 0.25 - i * 0.22, 1.083, 0.12], k));
    const ns = Math.max(1, Math.floor(w / 0.65)); for (let i = 0; i < ns; i++) chair(c, [-w / 2 + (w / ns) * (i + 0.5), 0, 0.72], PI, { style: 'stool', tags: ['guest', 'party'], node: o.node });
    c.spot('bar', [0, 0.02, -0.55], { heading: 0, tags: ['crew', 'bartender'], node: o.node, seatH: 0 });
  });
}

// ---------------------------------------------------------------- cabins and heads
/** Bed. o: { w (1.8), l (2.0), head ('leatherQuilt'), base ('woodA') } */
export function bed(ctx, pos, heading, o = {}) {
  const w = o.w ?? 1.8, l = o.l ?? 2.0, pal = ctx.mats.palette.pillows;
  ctx.at(pos, heading, (c) => {
    c.box(o.base ?? 'woodA', [w + 0.06, 0.34, l + 0.04], [0, 0.17, 0], { solid: true, tag: 'furniture' });
    c.rbox('linen', [w, 0.2, l], [0, 0.44, 0], { r: 0.06 }); c.rbox('linen2', [w + 0.02, 0.06, l * 0.62], [0, 0.545, l * 0.17], { r: 0.03 });
    c.rbox(o.head ?? 'leatherQuilt', [w + 0.3, 1.0, 0.08], [0, 0.75, -l / 2 - 0.04], { r: 0.03, seg: 1 });
    const np = w > 1.3 ? 2 : 1; for (let i = 0; i < np; i++) { const x = np === 1 ? 0 : (i ? 1 : -1) * w * 0.25; c.rbox('linen', [w / np - 0.16, 0.14, 0.42], [x, 0.6, -l / 2 + 0.28], { r: 0.06, rot: [0.25, 0, 0] }); c.rbox('vcSoft', [0.36, 0.34, 0.12], [x, 0.66, -l / 2 + 0.52], { r: 0.05, rot: [0.5, 0, 0], color: pal[Math.floor(ctx.rand() * pal.length)] }); }
    const s = c.spot('bed', [0, 0.56, 0.1], { heading: PI, tags: ['owner', 'guest'], node: o.node }); c.interact('bed', [0, 0.6, l / 2], { r: 1.2, label: 'Lie on the bed', data: { spot: s.id } });
  });
}
export function nightstand(ctx, pos, heading, o = {}) {
  ctx.at(pos, heading, (c) => { c.box(o.mat ?? 'woodA', [0.45, 0.5, 0.4], [0, 0.25, 0], { solid: true, tag: 'furniture' }); c.box('ss', [0.12, 0.01, 0.01], [0, 0.36, 0.205]); c.cyl('accent', 0.05, 0.06, 0.02, [0, 0.51, 0], { seg: 12 }); c.cyl('accent', 0.01, 0.01, 0.22, [0, 0.62, 0], { seg: 6 }); c.cyl('vcSoft', 0.09, 0.12, 0.16, [0, 0.8, 0], { seg: 14, color: 0xf3ead6, open: true }); c.light('int', [0, 0.78, 0], { size: 0.03, color: 0xffd9a0, intensity: 0.7, range: 3 }); });
}
/** Wardrobe / locker wall. o: { w, h (1.95), d (0.55) } */
export function wardrobe(ctx, pos, heading, o = {}) {
  const w = o.w ?? 1.2, h = o.h ?? 1.95, d = o.d ?? 0.55, n = Math.max(1, Math.round(w / 0.5));
  ctx.at(pos, heading, (c) => { c.box(o.mat ?? 'woodA', [w, h, d], [0, h / 2, 0], { solid: true, tag: 'furniture' }); for (let i = 0; i < n; i++) { const x = -w / 2 + (w / n) * (i + 0.5); c.box(o.inlay ?? 'woodB', [w / n - 0.08, h - 0.2, 0.01], [x, h / 2, d / 2 + 0.004]); c.box('ss', [0.012, 0.18, 0.02], [x + w / n / 2 - 0.07, 1.0, d / 2 + 0.02]); } });
}
/** Compact head fittings in a w x l footprint: toilet, vanity with mirror, glass shower. Local +z = toward the door. */
export function head(ctx, pos, heading, o = {}) {
  const w = o.w ?? 1.6, l = o.l ?? 1.9;
  ctx.at(pos, heading, (c) => {
    // vanity on the -x wall
    c.box(o.mat ?? 'woodA', [0.5, 0.8, 0.8], [-w / 2 + 0.25, 0.4, l / 2 - 0.55], { solid: true, tag: 'furniture' }); c.rbox('stone', [0.52, 0.04, 0.84], [-w / 2 + 0.26, 0.83, l / 2 - 0.55], { r: 0.01, seg: 1 });
    c.cyl('vcGloss', 0.17, 0.12, 0.1, [-w / 2 + 0.27, 0.9, l / 2 - 0.55], { seg: 18, color: 0xffffff }); c.tube('ss', [[-w / 2 + 0.08, 0.85, l / 2 - 0.55], [-w / 2 + 0.08, 1.08, l / 2 - 0.55], [-w / 2 + 0.2, 1.08, l / 2 - 0.55]], 0.011, { seg: 6 });
    c.box('mirror', [0.012, 0.7, 0.7], [-w / 2 + 0.012, 1.45, l / 2 - 0.55]); c.light('int', [-w / 2 + 0.03, 1.85, l / 2 - 0.55], { shape: 'bar', len: 0.02, size: 0.02, color: 0xffffff, intensity: 0.8, range: 2.5, rot: [0, 0, 0] });
    c.interact('sink', [-w / 2 + 0.4, 1.0, l / 2 - 0.55], { r: 0.9, label: 'Wash hands' });
    // toilet on the +x wall
    c.rbox('vcGloss', [0.38, 0.4, 0.52], [w / 2 - 0.3, 0.2, l / 2 - 0.5], { r: 0.08, color: 0xffffff, solid: true, tag: 'furniture' }); c.rbox('vcGloss', [0.4, 0.035, 0.46], [w / 2 - 0.3, 0.42, l / 2 - 0.5], { r: 0.015, seg: 1, color: 0xfafafa }); c.box('ssBrushed', [0.02, 0.16, 0.24], [w / 2 - 0.012, 0.95, l / 2 - 0.5]);
    c.interact('toilet', [w / 2 - 0.4, 0.5, l / 2 - 0.5], { r: 0.8, label: 'Toilet' });
    // shower at the far end
    c.box('mosaic', [w, 0.04, 0.85], [0, 0.03, -l / 2 + 0.43]); c.box('glassClear', [w - 0.7, 1.9, 0.012], [-0.35, 0.98, -l / 2 + 0.86], { solid: true, tag: 'glass' });
    c.rod('ss', [0, 2.0, -l / 2 + 0.06], [0, 2.0, -l / 2 + 0.36], 0.01); c.cyl('ss', 0.11, 0.11, 0.015, [0, 1.99, -l / 2 + 0.4], { seg: 16 });
    c.interact('shower', [0, 1.0, -l / 2 + 0.6], { r: 0.8, label: 'Shower' });
    c.box('ss', [0.5, 0.015, 0.015], [w / 2 - 0.02, 1.1, -l / 2 + 1.1], { rot: [0, PI / 2, 0] }); c.rbox('terry', [0.03, 0.4, 0.42], [w / 2 - 0.04, 0.92, -l / 2 + 1.1], { r: 0.012, seg: 1 });
  });
}

// ---------------------------------------------------------------- machinery
/** Marine diesel on mounts. o: { l (2.0), color mat ('enginePaint') } */
export function engine(ctx, pos, heading, o = {}) {
  const l = o.l ?? 2.0, m = o.mat ?? 'enginePaint', s = l / 2;
  ctx.at(pos, heading, (c) => {
    c.rbox(m, [0.7 * s, 0.6 * s, l * 0.62], [0, 0.55 * s, 0.1 * l], { r: 0.03, solid: true, tag: 'furniture' }); c.rbox(m, [0.5 * s, 0.22 * s, l * 0.6], [0, 0.95 * s, 0.1 * l], { r: 0.04 });
    c.rbox('engineGray', [0.5 * s, 0.5 * s, l * 0.28], [0, 0.42 * s, -0.36 * l], { r: 0.03 }); c.cyl('ss', 0.06 * s, 0.06 * s, l * 0.3, [0, 0.3 * s, -0.6 * l], { rot: [PI / 2, 0, 0], seg: 10 });
    for (let i = 0; i < 6; i++) c.box('black', [0.52 * s, 0.03, 0.06], [0, 1.07 * s, lerp(-0.16, 0.36, i / 5) * l]);
    c.cyl('engineGray', 0.13 * s, 0.13 * s, 0.3 * s, [0.3 * s, 1.0 * s, 0.38 * l], { rot: [0, 0, PI / 2], seg: 14 }); c.tube('hose', [[0.3 * s, 1.0 * s, 0.38 * l], [0.42 * s, 1.25 * s, 0.2 * l], [0.42 * s, 1.3 * s, -0.3 * l]], 0.06 * s, { seg: 8 });
    c.cyl('vcGloss', 0.07 * s, 0.07 * s, 0.25 * s, [-0.42 * s, 0.7 * s, 0.25 * l], { seg: 10, color: 0xd8a020 }); c.cyl('vcGloss', 0.07 * s, 0.07 * s, 0.25 * s, [-0.42 * s, 0.7 * s, 0.05 * l], { seg: 10, color: 0xf0f0f0 });
    for (const sx of [-1, 1]) for (const z of [-0.1, 0.32]) c.box('galv', [0.14 * s, 0.22 * s, 0.14 * s], [sx * 0.33 * s, 0.13 * s, z * l]);
  });
}
/** Generator in a sound shield + switchboard. */
export function genset(ctx, pos, heading) {
  ctx.at(pos, heading, (c) => { c.rbox('plasticW', [0.7, 0.75, 1.1], [0, 0.42, 0], { r: 0.04, solid: true, tag: 'furniture' }); c.box('black', [0.4, 0.2, 0.004], [0, 0.55, 0.552]); c.box('vcEmit', [0.03, 0.03, 0.004], [0.25, 0.7, 0.553], { color: 0x30ff60 }); c.tube('hose', [[0.2, 0.8, -0.3], [0.2, 1.2, -0.3], [0.2, 1.3, -0.8]], 0.04, { seg: 6 }); });
}
export function switchboard(ctx, pos, heading, o = {}) {
  ctx.at(pos, heading, (c) => { const w = o.w ?? 1.0; c.box('engineGray', [w, 1.3, 0.16], [0, 1.2, 0], { solid: true, tag: 'furniture' }); for (let r = 0; r < 4; r++) for (let i = 0; i < Math.floor(w / 0.09); i++) c.box('vc', [0.03, 0.05, 0.012], [-w / 2 + 0.08 + i * 0.085, 0.78 + r * 0.2, 0.085], { color: r === 3 && i % 4 === 0 ? 0xd03020 : 0x1a1a1c }); for (let i = 0; i < 3; i++) c.cyl('vcGloss', 0.05, 0.05, 0.012, [-w / 2 + 0.16 + i * 0.16, 1.68, 0.085], { rot: [PI / 2, 0, 0], seg: 14, color: 0xf2f2f2 }); c.interact('lights', [0, 1.3, 0.2], { r: 1.2, label: 'Light switches' }); });
}

// ---------------------------------------------------------------- hot tub, toys
/** Round hot tub with bench seats, steps, live water. o: { r (1.05), shell ('gel'), h (0.9) } */
export function hotTub(ctx, pos, o = {}) {
  const r = o.r ?? 1.05, h = o.h ?? 0.9, id = nid('tub');
  ctx.at(pos, 0, (c) => {
    c.lathe(o.shell ?? 'gel', [[r + 0.22, 0], [r + 0.22, h], [r, h], [r, h - 0.02]], [0, 0, 0], { seg: 32 });
    c.lathe('mosaic', [[r, h], [r - 0.02, 0.5], [r - 0.42, 0.48], [r - 0.44, 0.12], [0, 0.1]], [0, 0, 0], { seg: 32 });
    for (let i = 0; i < 16; i++) { const a = i * PI / 8; c.solidBox([0.24, h, 0.5], [Math.cos(a) * (r + 0.1), h / 2, Math.sin(a) * (r + 0.1)], { rot: [0, -a + PI / 2, 0].map((v, k) => (k === 1 ? PI / 2 - a : 0)), tag: 'furniture' }); }
    c.solidBox([r * 1.6, 0.5, r * 1.6], [0, 0.25, 0], { tag: 'floor' });
    c.box('teakCap', [0.9, 0.3, 0.35], [0, 0.15, r + 0.42], { solid: true, tag: 'stair' }); c.box('teakCap', [0.9, 0.6, 0.3], [0, 0.3, r + 0.36 - 0.3], { solid: true, tag: 'stair' });
    for (let i = 0; i < 6; i++) { const a = i * PI / 3 + 0.5; c.sphere('ss', 0.025, [Math.cos(a) * (r - 0.03), 0.62, Math.sin(a) * (r - 0.03)], { seg: 8 }); }
    for (let i = 0; i < 4; i++) { const a = i * PI / 2; c.light('uw', [Math.cos(a) * (r - 0.44), 0.3, Math.sin(a) * (r - 0.44)], { size: 0.03, color: 0x40d8ff, intensity: 1, range: 2.5 }); }
    c.part(id, [0, h - 0.14, 0], 0, (p) => p.cyl('water', r - 0.01, r - 0.01, 0.02, [0, 0, 0], { seg: 32 }), { data: { kind: 'water' } });
    const seats = [];
    for (let i = 0; i < 5; i++) { const a = i * PI * 2 / 5 - PI / 2 + PI / 5 + PI / 2; const s = c.spot('tub', [Math.cos(a) * (r - 0.26), 0.3, Math.sin(a) * (r - 0.26)], { heading: Math.atan2(-Math.cos(a), -Math.sin(a)), tags: ['guest', 'party'], node: o.node, seatH: 0.2 }); seats.push(s.id); }
    c.interact('tub', [0, h, r + 0.3], { r: 1.5, label: 'Get in the hot tub', data: { spot: seats[0], seats } });
    ctx.root.meta.tub = { pos: c.P([0, h, 0]).toArray(), r, seats, part: id };
  });
  ctx.onUpdate((dt, rt) => { const p = rt.parts[id]; if (p) { p.group.position.y = p.home.p.y + Math.sin(rt.time * 3.1) * 0.006; p.group.rotation.y = rt.time * 0.4; } });
}
/** RIB tender (static model on chocks or afloat). o: { l (3.6), tube ('#8f969c'), console (true) } */
export function tender(ctx, pos, heading, o = {}) {
  const l = o.l ?? 3.6, w = l * 0.46, tm = o.tube ?? 'fender';
  ctx.at(pos, heading, (c) => {
    const P = []; for (let i = 0; i <= 14; i++) { const t = i / 14; P.push([w / 2 * (t < 0.6 ? 1 : Math.cos((t - 0.6) / 0.4 * PI / 2) ** 0.7), 0.42 + 0.1 * t * t, lerp(-l / 2, l / 2, t)]); }
    c.tube(tm, P, 0.2, { seg: 10, div: 40 }); c.tube(tm, P.map(([x, y, z]) => [-x, y, z]), 0.2, { seg: 10, div: 40 });
    c.grid('gel', 10, 4, (i, j) => { const t = i / 10, hw = (w / 2 - 0.12) * (t < 0.6 ? 1 : Math.cos((t - 0.6) / 0.4 * PI / 2)); const u = j / 4 * 2 - 1; return [u * hw, 0.3 - 0.22 * (1 - Math.abs(u)) + 0.12 * t * t, lerp(-l / 2, l / 2 - 0.05, t)]; }, { double: true });
    c.box('eva', [w - 0.5, 0.03, l * 0.7], [0, 0.3, -l * 0.1]);
    if (o.console !== false) { c.rbox('gel', [0.5, 0.6, 0.4], [0, 0.6, l * 0.08], { r: 0.04 }); c.torus('black', 0.13, 0.014, [0, 0.95, -0.02], { rot: [0.5, 0, 0], seg: 18 }); c.rbox('cushion', [0.6, 0.12, 0.4], [0, 0.5, -l * 0.18], { r: 0.04 }); }
    c.rbox('blackGloss', [0.32, 0.5, 0.42], [0, 0.85, -l / 2 - 0.12], { r: 0.06 }); c.box('black', [0.1, 0.5, 0.14], [0, 0.35, -l / 2 - 0.12]);
    c.solidBox([w, 0.7, l], [0, 0.4, 0], { tag: 'furniture' });
  });
}
/** Jet ski (static). o: { color } */
export function jetski(ctx, pos, heading, o = {}) {
  const col = o.color ?? 0xff5a1f;
  ctx.at(pos, heading, (c) => {
    c.grid('vcGloss', 12, 6, (i, j) => { const t = i / 12, a = j / 6 * PI, hw = 0.55 * Math.sin(Math.min(1, t * 1.6) * PI / 2) * (t > 0.75 ? Math.cos((t - 0.75) / 0.25 * PI / 2) ** 0.6 : 1); return [Math.cos(a) * hw, 0.3 - Math.sin(a) * 0.28 + 0.1 * t, lerp(-1.5, 1.5, t)]; }, { color: 0x15171a, double: true });
    c.rbox('vcGloss', [0.9, 0.3, 2.6], [0, 0.45, -0.05], { r: 0.14, color: col }); c.rbox('vcGloss', [0.6, 0.35, 0.9], [0, 0.72, 0.6], { r: 0.12, color: col });
    c.rbox('vc', [0.42, 0.16, 1.2], [0, 0.72, -0.5], { r: 0.07, color: 0x1a1a1c }); c.rod('black', [-0.36, 1.0, 0.45], [0.36, 1.0, 0.45], 0.018); c.rod('black', [0, 0.85, 0.5], [0, 1.0, 0.45], 0.03);
    c.solidBox([1.0, 0.9, 2.9], [0, 0.45, 0], { tag: 'furniture' });
  });
}
/** White cooler box with latches (and rope handles). */
export function cooler(ctx, pos, heading) {
  ctx.at(pos, heading, (c) => { c.rbox('plasticW', [0.9, 0.42, 0.45], [0, 0.22, 0], { r: 0.03, solid: true, tag: 'furniture' }); c.rbox('plasticW', [0.92, 0.07, 0.47], [0, 0.465, 0], { r: 0.025 }); for (const sx of [-1, 1]) { c.box('black', [0.05, 0.1, 0.02], [sx * 0.25, 0.4, 0.235]); c.tube('rope', [[sx * 0.46, 0.34, -0.12], [sx * 0.54, 0.24, 0], [sx * 0.46, 0.34, 0.12]], 0.012, { seg: 5 }); } });
}

// ---------------------------------------------------------------- deck hardware, mast gear, lights, lettering
export function cleat(ctx, pos, heading, o = {}) {
  const s = o.s ?? 1; ctx.at(pos, heading, (c) => { c.box('ss', [0.05 * s, 0.012, 0.16 * s], [0, 0.006, 0]); for (const z of [-0.04, 0.04]) c.cyl('ss', 0.012 * s, 0.014 * s, 0.05 * s, [0, 0.03 * s, z * s], { seg: 8 }); c.rbox('ss', [0.03 * s, 0.022 * s, 0.3 * s], [0, 0.062 * s, 0], { r: 0.01 * s, seg: 2 }); });
}
/** Bow ground tackle: windlass, chain, anchor in the roller; sets meta.anchor. Call with the foredeck height and hull. */
export function groundTackle(ctx, hull, deckY, o = {}) {
  const zt = hull.zBow(hull.sheerAt(hull.L / 2 - 0.3)) - 0.1, zw = hull.bowEnd(deckY) - (o.back ?? 1.0), sh = hull.sheerAt(zt - 0.3);
  ctx.lod(1, () => {
    ctx.cyl('ss', 0.11, 0.13, 0.2, [0, deckY + 0.1, zw], { seg: 16, solid: true, tag: 'furniture' }); ctx.cyl('ss', 0.14, 0.14, 0.05, [0, deckY + 0.23, zw], { seg: 16 }); ctx.cyl('bronze', 0.08, 0.08, 0.08, [0, deckY + 0.29, zw], { seg: 12 });
    ctx.tube('chain', [[0, deckY + 0.14, zw + 0.1], [0, deckY + 0.06, zw + 0.5], [0, sh + 0.07, zt - 0.5], [0, sh + 0.05, zt + 0.05]], 0.022, { seg: 6 });
    ctx.box('ss', [0.2, 0.05, 0.6], [0, sh + 0.04, zt - 0.1]);
    // plow anchor hanging at the stem
    ctx.frame([0, sh - 0.12, zt + 0.22], [0.5, 0, 0], (c) => { c.box('galv', [0.05, 0.07, 0.9], [0, 0, -0.2]); c.prism('galv', [[-0.28, 0], [0.28, 0], [0, 0.55]], 'y', -0.5, -0.46, {}); c.box('galv', [0.04, 0.4, 0.06], [0, -0.28, 0.2]); });
    for (const sd of [1, -1]) { const zc = zw - 0.6, x = hull.halfBeam(zc, deckY) - 0.3; cleat(ctx, [sd * x, deckY, zc], 0, { s: 1.3 }); }
  });
  ctx.meta.anchor = { hawse: [0, sh, zt], windlass: [0, deckY, zw] };
  ctx.interact('anchor', [0, deckY + 0.4, zw - 0.3], { r: 1.3, label: 'Windlass' });
}
/** Mooring cleats along both deck edges. */
export function deckCleats(ctx, hull, deckY, zs, o = {}) { ctx.lod(1, () => { for (const z of zs) for (const sd of [1, -1]) cleat(ctx, [sd * (hull.halfBeam(z, deckY) - (o.inset ?? 0.28)), deckY, z], 0, { s: o.s ?? 1.2 }); }); }
/** Navigation lights. o: { side: [x, y, z] (port; starboard mirrored), stern: [x, y, z], mast: [x, y, z] (steaming), anchor: [x, y, z] } */
export function navLights(ctx, o) {
  ctx.lod(1, () => {
    ctx.light('nav', o.side, { color: 0xff2020, size: 0.05, intensity: 1.2, range: 8 }); ctx.light('nav', [-o.side[0], o.side[1], o.side[2]], { color: 0x20ff50, size: 0.05, intensity: 1.2, range: 8 });
    ctx.light('nav', o.stern, { color: 0xffffff, size: 0.045, intensity: 1, range: 8 }); if (o.mast) ctx.light('nav', o.mast, { color: 0xffffff, size: 0.05, intensity: 1.2, range: 10 });
    ctx.light('anchor', o.anchor ?? [o.mast[0], o.mast[1] + 0.5, o.mast[2]], { color: 0xfff6e0, size: 0.05, intensity: 1.2, range: 10 });
  });
  ctx.meta.navLights = true;
}
/** Mast-top gear cluster at pos: open-array radar (rotating), satellite domes, antennas, horn. o: { domes (1), radar: 'open' | 'dome', whips (2) } */
export function mastGear(ctx, pos, o = {}) {
  const id = nid('radar');
  ctx.lod(1, () => ctx.at(pos, 0, (c) => {
    if (o.radar === 'dome') c.cyl('gel', 0.3, 0.32, 0.2, [0, 0.1, 0], { seg: 20 });
    else { c.cyl('gel', 0.12, 0.16, 0.18, [0, 0.09, 0], { seg: 14 }); c.part(id, [0, 0.2, 0], 0, (p) => p.rbox('gel', [1.3, 0.09, 0.14], [0, 0.03, 0], { r: 0.03 }), { data: { kind: 'radar' } }); }
    const nd = o.domes ?? 1; for (let i = 0; i < nd; i++) { const x = (i - (nd - 1) / 2) * 1.1 + (nd === 1 ? 0.9 : 0), r = o.domeR ?? 0.3; c.cyl('gel', r * 0.5, r * 0.6, 0.15, [x, 0.07, -0.5], { seg: 12 }); c.sphere('gel', r, [x, 0.15 + r * 0.85, -0.5], { seg: 16 }); }
    for (let i = 0; i < (o.whips ?? 2); i++) { const sx = i % 2 ? 1 : -1; c.rod('gel', [sx * (0.7 + (i >> 1) * 0.3), 0, -0.2], [sx * (0.75 + (i >> 1) * 0.3), 2.2 + (i >> 1) * 0.8, -0.3], 0.012, { r2: 0.004, seg: 5 }); }
    for (const sx of [-0.12, 0.12]) c.cyl('chrome', 0.06, 0.02, 0.4, [sx, 0.1, 0.4], { rot: [PI / 2, 0, 0], seg: 10 });
  }));
  ctx.onUpdate((dt, rt) => { const p = rt.parts[id]; if (p) p.group.rotation.y = rt.time * 2.6; });
}
/** Yacht name and hailing port lettered on the transom (and the name on both bows). o: { color ('#c8a35a'), font, y, zT (transom z), xw (half width), bow: { z, y } } */
export function nameplate(ctx, hull, name, port, o = {}) {
  const A = ctx.mats.atlas, col = o.color ?? '#c8a35a';
  const r = A.add(768, 192, (g, x, y, W, H) => { g.clearRect(x, y, W, H); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = (o.font ?? 'italic 700 96px Georgia, serif'); g.fillText(name.toUpperCase(), x + W / 2, y + 72, W - 20); g.font = '500 44px Helvetica, Arial, sans-serif'; g.fillText(port.toUpperCase(), x + W / 2, y + 156, W - 40); });
  const y = o.y ?? 1.2, z = (o.zT ?? hull.zStern(y)) - 0.012, hw = o.xw ?? Math.min(1.5, hull.halfBeam(hull.zStern(y) + 0.3, y) * 0.6), hh = hw / 4;
  ctx.lod(1, () => {
    ctx.quad('atlas', [hw, y - hh, z], [-hw, y - hh, z], [-hw, y + hh, z], [hw, y + hh, z], { uvs: [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]] });
    if (o.bow) for (const sd of [1, -1]) { const s = hull.surface(o.bow.z, o.bow.y), L2 = o.bow.l ?? 2.2, h2 = L2 / 8, x = sd * (s.x + 0.02), dx = (hull.halfBeam(o.bow.z + L2 / 2, o.bow.y) - hull.halfBeam(o.bow.z - L2 / 2, o.bow.y)); const za = o.bow.z - L2 / 2 * sd, zb = o.bow.z + L2 / 2 * sd; const xa = sd * (hull.halfBeam(za, o.bow.y) + 0.015), xb = sd * (hull.halfBeam(zb, o.bow.y) + 0.015); void x; void dx; const vm = (r[1] + r[3]) / 2 + (r[3] - r[1]) * 0.02; ctx.quad('atlas', [xa, o.bow.y - h2, za], [xb, o.bow.y - h2, zb], [xb, o.bow.y + h2, zb], [xa, o.bow.y + h2, za], { uvs: [[r[0], vm], [r[2], vm], [r[2], r[3]], [r[0], r[3]]], double: true }); }
  });
  ctx.meta.nameplates = true;
}
/** Ensign on a staff at pos (animated cloth). o: { h (1.6), colors: [a, b] } */
export function flag(ctx, pos, o = {}) {
  const id = nid('flag'), h = o.h ?? 1.6, cols = o.colors ?? [0x1b3a6b, 0xf2c230];
  ctx.lod(1, () => { ctx.rod('teakCap', pos, [pos[0], pos[1] + h, pos[2] - h * 0.25], 0.018, { seg: 6 }); ctx.sphere('accent', 0.03, [pos[0], pos[1] + h + 0.02, pos[2] - h * 0.25 - 0.005], { seg: 8 });
    ctx.part(id, [pos[0], pos[1] + h * 0.62, pos[2] - h * 0.16], 0, (p) => { p.grid('vcSoft', 8, 4, (i, j) => [0, -j / 4 * 0.5 + 0.25, -i / 8 * 0.85], { double: true, color: cols[0] }); p.grid('vcSoft', 8, 1, (i, j) => [0.002, -0.06 + j * 0.12 - 0.0, -i / 8 * 0.85], { double: true, color: cols[1] }); }, { data: { kind: 'flag' } }); });
  ctx.onUpdate((dt, rt) => { const p = rt.parts[id]; if (!p || rt.lod < 1) return; p.group.rotation.y = Math.sin(rt.time * 1.7) * 0.25 + Math.sin(rt.time * 4.3) * 0.08; p.group.rotation.z = Math.sin(rt.time * 2.9) * 0.06; });
}
/** Stereo head unit + speakers. Registers meta.speakers. */
export function stereo(ctx, pos, heading, speakers = []) {
  ctx.at(pos, heading, (c) => { c.box('blackGloss', [0.2, 0.07, 0.03], [0, 0, 0]); c.box('vcEmit', [0.12, 0.03, 0.002], [0, 0, 0.017], { color: 0x30c0ff }); c.interact('stereo', [0, 0, 0.1], { r: 1.3, label: 'Stereo' }); });
  ctx.lod(2, () => { for (const s of speakers) { ctx.cyl('black', 0.09, 0.09, 0.03, s, { rot: [PI / 2, 0, 0], seg: 14 }); ctx.cyl('ss', 0.1, 0.1, 0.01, s, { rot: [PI / 2, 0, 0], seg: 14 }); } });
  (ctx.meta.speakers ||= []).push(...speakers);
}
/** Swim platform with teak, transom steps on both sides, swim ladder, underwater lights. Sets meta.swim. o: { y (0.4), len (1.3), w (half width), deckY, stepsX, zT (transom z) } */
export function swimPlatform(ctx, hull, o = {}) {
  const y = o.y ?? 0.4, len = o.len ?? 1.3, zT = o.zT ?? hull.zStern(y), hw = o.w ?? hull.halfBeam(zT + 0.4, y + 0.3) * 0.94, dY = o.deckY, r = 0.25;
  const poly = [[hw, zT + 0.05], [hw, zT - len + r], [hw - r, zT - len], [-hw + r, zT - len], [-hw, zT - len + r], [-hw, zT + 0.05]];
  ctx.plate('teak', poly, y, 0.14, { bottomMat: 'gel', edgeMat: 'gel', solid: true, tag: 'floor', uvJitter: false });
  ctx.box('gel', [hw * 1.7, y + 0.1, 0.5], [0, (y - 0.1) / 2 - 0.05, zT - 0.2]);
  ctx.lod(1, () => {
    // steps up to the aft deck on both sides
    const n = Math.max(2, Math.round((dY - y) / 0.2)), rh = (dY - y) / n, sx = o.stepsX ?? hw - 0.5, sw = o.stepW ?? 0.8;
    for (const sd of o.stepSides ?? [1, -1]) {
      for (let i = 1; i <= n; i++) ctx.box(i === n ? 'teak' : 'teak', [sw, rh, 0.3], [sd * sx, y + (i - 0.5) * rh, zT - 0.02 + (i - 1) * 0.28 + 0.15]);
      ctx.ramp([sd * sx, y + rh * 0.4, zT - 0.02], [sd * sx, dY, zT + (n - 1) * 0.28 + 0.1], sw);
      ctx.rod('ss', [sd * (sx + sw / 2 - 0.03), y + 0.95, zT + 0.05], [sd * (sx + sw / 2 - 0.03), dY + 0.9, zT + n * 0.28], 0.018); ctx.rod('ss', [sd * (sx + sw / 2 - 0.03), y, zT + 0.05], [sd * (sx + sw / 2 - 0.03), y + 0.95, zT + 0.05], 0.015);
    }
    // folding ladder into the water
    ctx.both((sd) => ctx.rod('ss', [-hw * 0.5 + sd * 0.2, y + 0.02, zT - len - 0.03], [-hw * 0.5 + sd * 0.2, -0.9, zT - len - 0.1], 0.015));
    for (let i = 0; i < 4; i++) ctx.box('teakCap', [0.4, 0.025, 0.07], [-hw * 0.5, y - 0.25 - i * 0.26, zT - len - 0.06]);
    for (const x of [-hw * 0.6, 0, hw * 0.6]) ctx.light('uw', [x, -0.35, zT - 0.47], { color: 0x30b8ff, size: 0.05, intensity: 1.5, range: 6, rot: [PI / 2, 0, 0] });
    for (const sd of [1, -1]) cleat(ctx, [sd * (hw - 0.15), y, zT - len + 0.3], 0, { s: 1.2 });
  });
  ctx.ladder([-hw * 0.5, -1.0, zT - len - 0.2], [-hw * 0.5, y, zT - len + 0.3], { facing: 0, id: 'swimladder' });
  ctx.node('swim', [0, y, zT - len / 2], { deck: 'swim' });
  ctx.area('swim', 'Swim platform', [-hw, zT - len, hw, zT], y, y + 2, { privacy: 'public', deck: 'swim' });
  ctx.meta.swim = { pos: [0, y, zT - len / 2], heading: 0, w: hw * 2, d: len, zAft: zT - len };
  ctx.meta.gates = [{ pos: [0, y, zT - len / 2], heading: 0, side: 'stern' }];
  return { y, zT, hw, len, stepTopZ: zT + (Math.max(2, Math.round((dY - y) / 0.2)) - 1) * 0.28 + 0.25 };
}
export { FOODS };

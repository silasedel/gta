// Doors: frames, leaves and their behavior. Hinged (single / double), automatic sliding, double-acting swing, strip curtain, cased opening.
// A door never pushes or traps anyone: leaves are visual while moving, and a blocking collider exists only while the door is shut AND locked.
// ctx.dyn(x, y, z, ry, (G) => {...}) builds a separately animated part and returns its Group.
import { clamp } from './kit/util.js';

export const DOOR_SIGNS = { restroom: 'RESTROOM', office: 'OFFICE', stock: 'EMPLOYEES ONLY', kitchen: 'STAFF ONLY', cooler: 'COOLER', service: 'ELECTRICAL', breakroom: 'BREAK ROOM', fitting: 'FITTING ROOM', vault: 'AUTHORIZED PERSONNEL' };

// leaf builders: local frame has the hinge (or slide origin) at x = 0, leaf extends to +x by w, y from 0, thickness along z
function leafGlass(G, M, w, h, o) { const fr = M.flat(o.frame || '#b9bcc0', { rough: 0.35, metal: 0.8 }), st = 0.075, t = 0.045;
  G.boxB(fr, st / 2, 0, 0, st, h, t); G.boxB(fr, w - st / 2, 0, 0, st, h, t); G.boxB(fr, w / 2, h - st, 0, w, st, t); G.boxB(fr, w / 2, 0, 0, w, 0.2, t); if (o.midRail) G.boxB(fr, w / 2, 1.0, 0, w, 0.06, t);
  G.box(M.glass({ opacity: 0.14 }), w / 2, (h + 0.2 - st) / 2, 0, w - 2 * st, h - st - 0.2, 0.012);
  const bar = M.flat('#d4d6d8', { rough: 0.25, metal: 0.9 }); if (o.slide) return; for (const s of [-1, 1]) { G.cyl(bar, w - 0.16, 1.05, s * 0.06, 0.014, 0.55, { seg: 8 }); G.box(bar, w - 0.16, 1.3, s * 0.035, 0.025, 0.025, 0.05); G.box(bar, w - 0.16, 0.8, s * 0.035, 0.025, 0.025, 0.05); }
  for (const y of [0.25, h - 0.3]) G.box(fr, 0.01, y, 0, 0.03, 0.12, t + 0.03); }
function leafSlab(G, M, w, h, o) { const face = o.surf ? M.surf(o.surf[0], o.surf[1]) : M.flat(o.c || '#d9d4c8', { rough: 0.55 }), t = 0.045, mt = M.flat('#b8babc', { rough: 0.3, metal: 0.85 });
  G.boxB(face, w / 2, 0.01, 0, w, h - 0.01, t); G.boxB(mt, w / 2, 0.01, 0, w - 0.04, o.kick ?? 0.22, t + 0.004);
  if (o.vision) { G.box(M.flat('#2a2c2e', { rough: 0.4, metal: 0.5 }), w * (o.vision === 'round' ? 0.5 : 0.72), 1.5, 0, o.vision === 'round' ? 0.34 : 0.16, o.vision === 'round' ? 0.34 : 0.62, t + 0.008); G.box(M.glass({ opacity: 0.25 }), w * (o.vision === 'round' ? 0.5 : 0.72), 1.5, 0, o.vision === 'round' ? 0.28 : 0.11, o.vision === 'round' ? 0.28 : 0.56, t + 0.012); }
  if (o.push) { for (const s of [-1, 1]) G.box(mt, w - 0.14, 1.12, s * (t / 2 + 0.002), 0.1, 0.38, 0.004); }
  else for (const s of [-1, 1]) { G.cyl(mt, w - 0.07, 1.0, s * (t / 2 + 0.012), 0.028, 0.02, { rx: Math.PI / 2, seg: 10 }); G.box(mt, w - 0.12, 1.0, s * (t / 2 + 0.04), 0.12, 0.018, 0.018); }
  for (const y of [0.22, h / 2, h - 0.24]) G.box(mt, 0.0, y, 0, 0.02, 0.1, t + 0.02);
  if (o.sign && o.signCell) for (const s of [-1, 1]) G.plane(o.signMat, w / 2, 1.62, s * (t / 2 + 0.003), 0.3, 0.085, { ry: s > 0 ? 0 : Math.PI, uvRect: o.signCell.rect }); }
function leafCooler(G, M, w, h) { const st = M.surf('steel', { wear: 0.4 }), dk = M.flat('#2b2d30', { rough: 0.5 }); G.boxB(st, w / 2, 0.02, 0, w, h - 0.02, 0.1); G.boxB(dk, w / 2, 0.02, 0, w + 0.02, 0.02, 0.12); G.box(dk, w - 0.1, 1.05, 0.08, 0.05, 0.36, 0.06); G.box(st, w - 0.1, 1.05, 0.12, 0.03, 0.3, 0.03); for (const y of [0.35, h - 0.35]) G.box(dk, 0.03, y, 0.06, 0.1, 0.16, 0.04); }

// Build every door of the plan. Returns the door objects (kept in built.doors).
export function buildDoors(ctx) {
  const { G, M, plan, profile } = ctx, out = [];
  for (const d of plan.doors) {
    if (!d.seg) continue; const s = d.seg, y0 = s.y0 + 0.02, w = d.op.b - d.op.a, h = d.h, t = s.t;
    const ry = s.axis === 'x' ? Math.PI / 2 : 0, x = d.x, z = d.z; // door frame's local +z = wall normal toward the positive side
    const frameC = d.frame || (d.kind === 'cooler' ? '#b9bcc0' : profile.doorFrame || profile.trim), fm = M.flat(frameC, { rough: 0.5, metal: d.kind === 'cooler' ? 0.7 : 0.1 });
    const obj = { def: d, kind: d.kind, x, z, y: y0, ry, w, h, level: d.level || 0, open: 0, want: 0, locked: !!d.locked, staff: !!d.staff, exterior: !!d.exterior, leaves: [], col: null, auto: d.kind !== 'pass', sense: d.kind === 'auto' ? 2.2 : 1.25, dir: 1, held: 0 };
    if (d.kind === 'pass') { // pass-through window: sill shelf + frame, no leaf
      G.at(x, z, ry, () => { const sy = d.op.y0, top = d.op.y1; G.box(M.surf('steel', { wear: profile.wear }), 0, sy + 0.015, 0, w + 0.06, 0.03, t + 0.34); G.box(fm, -w / 2 - 0.02, (sy + top) / 2, 0, 0.04, top - sy, t + 0.04); G.box(fm, w / 2 + 0.02, (sy + top) / 2, 0, 0.04, top - sy, t + 0.04); G.box(fm, 0, top + 0.02, 0, w + 0.08, 0.04, t + 0.04); }, s.y0 + 0.02);
      ctx.colliders.push(s.axis === 'x' ? [x, s.y0 + d.op.y0 + 0.03, z, t / 2 + 0.17, 0.02, w / 2] : [x, s.y0 + d.op.y0 + 0.03, z, w / 2, 0.02, t / 2 + 0.17]); obj.auto = false; out.push(obj); continue; }
    // frame / casing on both faces
    G.at(x, z, ry, () => { const cw = d.kind === 'open' ? 0.09 : 0.07, dp = t + 0.05; G.boxB(fm, -w / 2 - cw / 2 + 0.012, 0, 0, cw, h + cw, dp); G.boxB(fm, w / 2 + cw / 2 - 0.012, 0, 0, cw, h + cw, dp); G.boxB(fm, 0, h, 0, w + 2 * cw - 0.024, cw, dp); if (d.kind !== 'open' && d.kind !== 'curtain') G.boxB(M.surf('steel', { wear: 0.5 }), 0, 0, 0, w, 0.012, t + 0.06); }, y0);
    const signKind = d.sign === false ? null : d.sign || DOOR_SIGNS[plan.get(d.b)?.kind] || DOOR_SIGNS[plan.get(d.a)?.kind];
    const lo = { c: d.c || profile.doorC, surf: d.surf, vision: d.vision, push: d.kind === 'swing', kick: d.kind === 'swing' ? 0.9 : 0.22 };
    if (signKind && ctx.prints) { lo.sign = signKind; lo.signCell = ctx.prints.plaque(typeof signKind === 'string' ? signKind : 'PRIVATE'); lo.signMat = ctx.prints.mat; }
    const mk = (hx, sign, lw, build) => { const g = ctx.dyn(x + (s.axis === 'x' ? 0 : hx), y0, z + (s.axis === 'x' ? -hx : 0), ry + (sign < 0 ? Math.PI : 0), (LG) => build(LG, lw)); g.userData.sign = sign; g.userData.ry0 = g.rotation.y; g.userData.p0 = g.position.clone(); obj.leaves.push(g); return g; };
    if (d.kind === 'hinged' || d.kind === 'cooler') mk(-w / 2, 1, w, (LG, lw) => (d.kind === 'cooler' ? leafCooler(LG, M, lw, h) : d.glass ? leafGlass(LG, M, lw, h, { frame: frameC }) : leafSlab(LG, M, lw, h, lo)));
    else if (d.kind === 'double' || d.kind === 'swing') { mk(-w / 2, 1, w / 2, (LG, lw) => (d.kind === 'swing' ? leafSlab(LG, M, lw, h, { ...lo, vision: 'round' }) : leafGlass(LG, M, lw, h, { frame: frameC }))); mk(w / 2, -1, w / 2, (LG, lw) => (d.kind === 'swing' ? leafSlab(LG, M, lw, h, { ...lo, vision: 'round' }) : leafGlass(LG, M, lw, h, { frame: frameC }))); obj.mirror = true; }
    else if (d.kind === 'auto') { mk(-w / 2, 1, w / 2, (LG, lw) => leafGlass(LG, M, lw, h, { frame: frameC, slide: true })); mk(w / 2, -1, w / 2, (LG, lw) => leafGlass(LG, M, lw, h, { frame: frameC, slide: true })); obj.slide = true;
      G.at(x, z, ry, () => { G.boxB(fm, 0, h + 0.07, 0, w * 2 + 0.2, 0.16, t + 0.1); G.box(M.flat('#101114', { rough: 0.3 }), 0, h + 0.03, t / 2 + 0.07, 0.12, 0.04, 0.05); G.box(M.flat('#101114', { rough: 0.3 }), 0, h + 0.03, -t / 2 - 0.07, 0.12, 0.04, 0.05); }, y0); }
    else if (d.kind === 'curtain') { obj.auto = false; const pvc = M.glass({ opacity: 0.32, tint: d.tint || '#d8e6d0', rough: 0.3 }); G.at(x, z, ry, () => { for (let i = 0; i < Math.ceil(w / 0.16); i++) G.box(pvc, -w / 2 + 0.08 + i * (w - 0.16) / Math.max(1, Math.ceil(w / 0.16) - 1), h / 2, (i & 1) * 0.012, 0.19, h - 0.04, 0.004); G.boxB(M.surf('steel', {}), 0, h - 0.03, 0, w, 0.04, 0.03); }, y0); }
    else obj.auto = false;
    if (obj.leaves.length && !(d.glass || d.kind === 'double' || d.kind === 'auto')) { obj.occ = ctx.occ.length; if (s.axis === 'x') ctx.occ.push(x - 0.03, y0, z - w / 2, x + 0.03, y0 + h, z + w / 2); else ctx.occ.push(x - w / 2, y0, z - 0.03, x + w / 2, y0 + h, z + 0.03); }
    obj.half = s.axis === 'x' ? [0.07, h / 2, w / 2] : [w / 2, h / 2, 0.07];
    out.push(obj);
  }
  return out;
}

// actors: [{ x, z, level }] in store-local coordinates (player and NPCs near the store). canPass(door, actor) decides locks.
export function updateDoors(doors, dt, actors, store) {
  for (const d of doors) {
    if (!d.auto || !d.leaves.length) continue;
    let want = d.held > 0 ? 1 : 0, side = 0; if (d.held > 0) d.held -= dt;
    if (!d.locked) for (const a of actors) { if ((a.level || 0) !== d.level) continue; const dx = a.x - d.x, dz = a.z - d.z, r = Math.hypot(dx, dz); if (r < d.sense) { want = 1; if (!side) side = (Math.abs(d.ry) > 0.1 ? dx : dz) >= 0 ? 1 : -1; } }
    if (want && d.open < 0.02 && side) d.dir = -side; // swing away from whoever arrives
    const sp = d.slide ? 2.4 : want ? 3.2 : 1.6; d.open += clamp(want - d.open, -dt * sp, dt * sp);
    if (d.open !== d.shown) { d.shown = d.open; const e = d.open * d.open * (3 - 2 * d.open);
      for (const g of d.leaves) { if (d.slide) { const k = g.userData.sign * e * (d.w / 2 - 0.04); g.position.x = g.userData.p0.x - (Math.abs(d.ry) > 0.1 ? 0 : k); g.position.z = g.userData.p0.z + (Math.abs(d.ry) > 0.1 ? k : 0); } else g.rotation.y = g.userData.ry0 + g.userData.sign * d.dir * e * 1.5; g.updateMatrix(); } }
    const block = d.locked && d.open < 0.01; if (d.col && d.blocking !== block) { d.blocking = block; try { d.col.setEnabled(block); } catch (e) { /* */ } }
  }
}

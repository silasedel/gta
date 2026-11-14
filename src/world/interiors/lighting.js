// Lighting: fixture models that register baked lights, rig layouts per room, the pooled real-time lights (for characters and
// floor highlights), daylight by time of day, and night spill onto the street.
// A fixture adds geometry to ctx.G, an emissive lens/tube (MatSet.glow) and one or more entries in ctx.lights (see kit/bakeCore.js).
import * as THREE from 'three';
import { kelvin, lin, clamp, lerp } from './kit/util.js';
import { SKY } from './kit/materials.js';

export const LAMPS = { // name -> [kelvin, lens color]
  coolwhite: [4100, '#f4f8ff'], daylight: [5600, '#eaf2ff'], neutral: [3500, '#fff6e6'], warm: [2900, '#ffe9c4'], amber: [2200, '#ffcf8a'], greenish: [4300, '#eefbe6'], sodium: [2000, '#ffb45a'],
};
const lampC = (lamp, k) => { const c = kelvin((LAMPS[lamp] || LAMPS.neutral)[0]); return [c[0] * k, c[1] * k, c[2] * k]; };
const lens = (lamp) => (LAMPS[lamp] || LAMPS.neutral)[1];

function reg(ctx, L) { const p = ctx.G.local(L.p[0], L.p[1], L.p[2]); const e = ctx.G.cur.elements; let d = L.d; if (d) { d = [e[0] * d[0] + e[4] * d[1] + e[8] * d[2], e[1] * d[0] + e[5] * d[1] + e[9] * d[2], e[2] * d[0] + e[6] * d[1] + e[10] * d[2]]; }
  const out = { ...L, p: [p.x, p.y, p.z], d }; ctx.lights.push(out); if (!L.noPool) ctx.fixtureLights.push({ x: p.x, y: p.y, z: p.z, c: L.c, ch: L.ch || 0, w: Math.max(L.c[0], L.c[1], L.c[2]) * (L.type === 'omni' ? 2 : 1) }); return out; }

export const FIXTURES = {
  // 2 x 4 ft lay-in troffer for drop ceilings. o: { lamp, k, dead (0 | 1 = one tube out | 2 = dark), w, l, ry }
  troffer(ctx, x, y, z, o = {}) { const { G, M } = ctx, w = o.w || 0.6, l = o.l || 1.21, k = (o.k ?? 9) * (o.dead === 1 ? 0.55 : o.dead === 2 ? 0 : o.dead === 3 ? 0.4 : 1);
    G.at(x, z, o.ry || 0, () => { G.box(M.flat('#e9e9e6', { rough: 0.5 }), 0, -0.012, 0, w, 0.02, l); G.box(o.dead === 2 ? M.flat('#b9b9b2', { rough: 0.4 }) : M.glow(lens(o.lamp), o.dead === 1 ? 1.3 : 2.2, 0, o.dead === 3), 0, -0.024, 0, w - 0.07, 0.006, l - 0.07);
      for (const s of [-1, 1]) G.box(M.flat('#f4f4f1', { rough: 0.5 }), s * 0.0, -0.027, 0, 0.012, 0.004, l - 0.07);
      if (k > 0) for (const s of [-0.3, 0.3]) reg(ctx, { p: [0, -0.05, s * l], c: lampC(o.lamp, k / 2), ch: 0, type: 'area', d: [0, -1, 0], soft: 0.45, wrap: 0.12 }); }, y); },
  // surface / chain-hung fluorescent strip. o: { lamp, k, l, hang (m below y), dead, bare }
  strip(ctx, x, y, z, o = {}) { const { G, M } = ctx, l = o.l || 1.22, hang = o.hang || 0, k = (o.k ?? 6) * (o.dead ? 0.1 : 1), yy = -hang;
    G.at(x, z, o.ry || 0, () => { G.box(M.flat('#e4e4e0', { rough: 0.5 }), 0, yy - 0.03, 0, 0.11, 0.05, l); if (!o.bare) for (const s of [-1, 1]) G.box(M.flat('#f2f2ee', { rough: 0.4 }), s * 0.085, yy - 0.06, 0, 0.06, 0.012, l, { rz: s * 0.5 });
      for (const s of [-0.03, 0.03]) G.cyl(o.dead && s > 0 ? M.flat('#c9c9c0', { rough: 0.3 }) : M.glow(lens(o.lamp), 2.4, 0), s, yy - 0.068, 0, 0.013, l - 0.06, { rx: Math.PI / 2, seg: 8 });
      if (hang) for (const s of [-1, 1]) G.cyl(M.flat('#8a8d90', { metal: 0.6, rough: 0.5 }), 0, yy / 2, s * (l / 2 - 0.1), 0.004, hang, { seg: 4 });
      for (const s of [-0.3, 0.3]) reg(ctx, { p: [0, yy - 0.1, s * l], c: lampC(o.lamp, k / 2), ch: 0, type: 'area', d: [0, -1, 0], soft: 0.3, wrap: 0.3, amb: 1.3 }); }, y); },
  // recessed can downlight
  can(ctx, x, y, z, o = {}) { const { G, M } = ctx; G.cyl(M.flat('#f0f0ee', { rough: 0.4 }), x, y - 0.006, z, 0.085, 0.012, { seg: 14 }); G.cyl(M.glow(lens(o.lamp || 'warm'), 2.6, 0), x, y - 0.012, z, 0.06, 0.006, { seg: 12 }); G.push(new THREE.Matrix4()); reg(ctx, { p: [x, y - 0.05, z], c: lampC(o.lamp || 'warm', o.k ?? 7), ch: 0, type: 'spot', d: [0, -1, 0], cone: o.cone ?? 0.55, soft: 0.2 }); G.pop(); },
  // track rail with aimed spot heads. o: { l, ry, heads: [{ u (along rail), aim: [x, y, z] in the rail frame }], lamp, k, c (housing color) }
  track(ctx, x, y, z, o = {}) { const { G, M } = ctx, l = o.l || 2.4, hm = M.flat(o.c || '#16171a', { rough: 0.45, metal: 0.4 });
    G.at(x, z, o.ry || 0, () => { G.box(hm, 0, -0.018, 0, 0.035, 0.03, l);
      for (const h of o.heads || []) { const a = h.aim || [0.8, -y + 1.2, 0], dx = a[0], dy = a[1], dz = a[2] - h.u, n = Math.hypot(dx, dy, dz) || 1, d = [dx / n, dy / n, dz / n], yaw = Math.atan2(d[0], d[2]), pitch = Math.acos(clamp(-d[1], -1, 1));
        G.cyl(hm, 0, -0.06, h.u, 0.012, 0.06, { seg: 6 }); G.push(new THREE.Matrix4().makeTranslation(0, -0.1, h.u).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationX(-pitch)));
        G.cyl(hm, 0, -0.06, 0, 0.045, 0.13, { seg: 10, r2: 0.035 }); G.cyl(M.glow(lens(o.lamp || 'warm'), 3, 0), 0, -0.127, 0, 0.038, 0.004, { seg: 10 }); G.pop();
        reg(ctx, { p: [d[0] * 0.14, -0.1 + d[1] * 0.14, h.u + d[2] * 0.14], c: lampC(o.lamp || 'warm', o.k ?? 9), ch: 0, type: 'spot', d, cone: o.cone ?? 0.72, soft: 0.15, amb: 0.8 }); } }, y); },
  // pendant on a cord. o: { drop, shade: 'dome'|'cone'|'globe'|'cage'|'schoolhouse'|'drum', c (shade color), lamp, k, r }
  pendant(ctx, x, y, z, o = {}) { const { G, M } = ctx, drop = o.drop ?? 0.9, r = o.r || 0.18, sh = o.shade || 'dome', sm = M.flat(o.c || '#1d1e22', { rough: 0.4, metal: sh === 'cage' ? 0.7 : 0.3, side: THREE.DoubleSide }), by = y - drop;
    G.cyl(M.flat('#1a1a1c', { rough: 0.6 }), x, y - drop / 2, z, 0.006, drop, { seg: 5 }); G.cyl(sm, x, y - 0.012, z, 0.05, 0.024, { seg: 10 });
    if (sh === 'dome') G.lathe(sm, [[r, 0], [r * 0.96, r * 0.2], [r * 0.75, r * 0.5], [r * 0.4, r * 0.72], [0.03, r * 0.8]], x, by, z, { seg: 16 });
    else if (sh === 'cone') G.lathe(sm, [[r, 0], [r * 0.6, r * 0.6], [0.035, r * 1.1]], x, by, z, { seg: 14 });
    else if (sh === 'drum') { G.cyl(M.surf('fabric', { c: o.c || [226, 214, 190], side: THREE.DoubleSide, uvw: 0.3 }), x, by + r * 0.5, z, r, r, { seg: 18, open: true }); }
    else if (sh === 'cage') { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; G.cyl(sm, x + Math.cos(a) * r * 0.55, by + r * 0.5, z + Math.sin(a) * r * 0.55, 0.004, r * 1.1, { seg: 4 }); } G.cyl(sm, x, by, z, r * 0.56, 0.008, { seg: 12, open: true }); G.cyl(sm, x, by + r * 1.05, z, r * 0.56, 0.008, { seg: 12 }); }
    const glowing = sh === 'globe' || sh === 'schoolhouse'; if (glowing) { G.sphere(M.glow(lens(o.lamp || 'warm'), 1.7, 0), x, by + r * 0.6, z, r * 0.78, { seg: 12, sy: sh === 'schoolhouse' ? 0.85 : 1 }); G.cyl(sm, x, by + r * 1.25, z, r * 0.3, r * 0.2, { seg: 10 }); }
    else G.sphere(M.glow(lens(o.lamp || 'warm'), 3, 0), x, by + r * 0.32, z, 0.032, { seg: 8 });
    G.push(new THREE.Matrix4()); if (glowing || sh === 'cage') reg(ctx, { p: [x, by + r * 0.5, z], c: lampC(o.lamp || 'warm', (o.k ?? 5) * 0.7), ch: 0, type: 'omni', soft: 0.25 }); else reg(ctx, { p: [x, by + 0.02, z], c: lampC(o.lamp || 'warm', o.k ?? 5), ch: 0, type: 'spot', d: [0, -1, 0], cone: sh === 'cone' ? 0.3 : 0.12, soft: 0.25, amb: 1.2 }); G.pop(); },
  // bare bulb on a cord or porcelain socket (stock rooms, closets)
  bulb(ctx, x, y, z, o = {}) { const { G, M } = ctx, drop = o.drop ?? 0.25; G.cyl(M.flat('#e8e4d8', { rough: 0.5 }), x, y - 0.02, z, 0.05, 0.04, { seg: 10 }); if (drop > 0.08) G.cyl(M.flat('#1a1a1c', {}), x, y - drop / 2, z, 0.005, drop, { seg: 4 }); G.sphere(M.glow(lens(o.lamp || 'warm'), 3.2, 0), x, y - drop - 0.04, z, 0.034, { seg: 8, sy: 1.25 }); G.push(new THREE.Matrix4()); reg(ctx, { p: [x, y - drop - 0.05, z], c: lampC(o.lamp || 'warm', o.k ?? 3.2), ch: 0, type: 'omni', soft: 0.2 }); G.pop(); },
  // wall sconce / vanity bar. (x, z) on the wall face, ry = facing into the room
  sconce(ctx, x, y, z, o = {}) { const { G, M } = ctx, w = o.w || 0.14; G.at(x, z, o.ry || 0, () => { G.box(M.flat(o.c || '#c9a86a', { rough: 0.35, metal: 0.8 }), 0, 0, 0.02, w + 0.04, 0.09, 0.04); G.box(M.glow(lens(o.lamp || 'warm'), 2.0, 0), 0, 0, 0.075, w, 0.1, 0.07); reg(ctx, { p: [0, 0, 0.16], c: lampC(o.lamp || 'warm', o.k ?? 2.2), ch: 0, type: 'omni', soft: 0.2 }); }, y); },
  // linear LED accent (cooler door frames, shelf edges, coves). from/to in the current frame. Circuit 1 (stays on after hours).
  led(ctx, a, b, o = {}) { const { G, M } = ctx, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz), col = o.color || '#dff1ff', c = lin(col), k = o.k ?? 1.2, n = Math.max(1, Math.round(len / (o.every || 0.7)));
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), Math.abs(dy) > 0.9 * len ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)); m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.scale(new THREE.Vector3(o.w || 0.012, o.w || 0.012, len));
    G.add(M.glow(col, o.glow ?? 2.2, o.ch ?? 1), new THREE.BoxGeometry(1, 1, 1), m);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; reg(ctx, { p: [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t], c: [c[0] * k * len / n, c[1] * k * len / n, c[2] * k * len / n], ch: o.ch ?? 1, type: o.d ? 'area' : 'omni', d: o.d, soft: 0.12, wrap: 0.4, amb: o.amb ?? 0.7, noPool: i > 0 || len < 0.5 }); } },
  // glowing sign / screen face that also throws light. o: { w, h, color, k, ch }
  glowPanel(ctx, x, y, z, o = {}) { const c = lin(o.color || '#ffffff'), k = (o.k ?? 1) * (o.w || 1) * (o.h || 0.5); ctx.G.at(x, z, o.ry || 0, () => reg(ctx, { p: [0, 0, 0.06], c: [c[0] * k, c[1] * k, c[2] * k], ch: o.ch ?? 1, type: 'area', d: [0, 0, 1], soft: 0.3, wrap: 0.3, amb: 0.8 }), y); },
};

// ---------------------------------------------------------------- rig layouts
// grid of ceiling fixtures over a room. o: { type, sx, sz (spacing), margin, wear (0..1: chance of dead tubes), ...fixture options, skip(x, z) }
export function gridRig(ctx, room, o = {}) {
  const sx = o.sx || 3.05, sz = o.sz || 3.05, y = room.ceilY, R = ctx.R, nx = Math.max(1, Math.round((room.w - (o.margin ?? 1.2)) / sx)), nz = Math.max(1, Math.round((room.d - (o.margin ?? 1.2)) / sz)), fx = FIXTURES[o.type || 'troffer'];
  const snapG = o.type === 'troffer' || !o.type ? 0.6096 : 0; const out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { let x = room.cx + (i - (nx - 1) / 2) * (room.w / nx), z = room.cz + (j - (nz - 1) / 2) * (room.d / nz); if (snapG) { x = Math.round((x - room.x0) / snapG) * snapG + room.x0 + (o.type ? 0 : 0.3048); z = Math.round((z - room.z0) / snapG) * snapG + room.z0; }
    if (o.skip && o.skip(x, z)) continue; const wr = o.wear ?? ctx.profile.wear, dead = R.chance(0.05 + wr * 0.3) ? R.pick([1, 1, 2, 3]) : 0, lamp = R.chance(0.12 + wr * 0.2) ? R.pick(['warm', 'daylight', 'greenish', 'neutral']) : o.lamp; fx(ctx, x, y - (o.hang || 0) * 0, z, { ...o, lamp, dead, k: (o.k ?? 9) * R.range(0.8, 1.15) }); out.push({ x, z }); }
  return out;
}
// default rig for a room by kind, used when a store type does not light a room itself
export function defaultRig(ctx, room) {
  const p = ctx.profile, lamp = p.lamp, open = room.ceilType === 'open';
  if (room.kind === 'restroom') { FIXTURES.strip(ctx, room.cx, room.ceilY, room.cz, { lamp: 'coolwhite', k: 3.2, l: 0.62, bare: false, dead: 0 }); return; }
  if (room.kind === 'office') { if (open) FIXTURES.strip(ctx, room.cx, room.ceilY, room.cz, { lamp, k: 5, hang: 0.5 }); else FIXTURES.troffer(ctx, room.x0 + Math.round((room.w / 2) / 0.6096) * 0.6096, room.ceilY, room.cz, { lamp, k: 6 }); return; }
  if (room.kind === 'cooler') { gridRig(ctx, room, { type: 'strip', lamp: 'daylight', k: 4, sx: 2.2, sz: 2.4, margin: 0.6, wear: 0 }); return; }
  if (room.staffOnly || room.kind === 'hall') { if (room.w * room.d < 5) FIXTURES.bulb(ctx, room.cx, room.ceilY, room.cz, { lamp: 'warm', k: 2.6, drop: open ? 0.5 : 0.12 }); else gridRig(ctx, room, { type: 'strip', lamp: 'coolwhite', k: 4.6, sx: 2.6, sz: 3.0, hang: open ? 0.6 : 0, margin: 0.8, bare: true }); return; }
  gridRig(ctx, room, open ? { type: 'strip', lamp, k: 6.5, hang: Math.max(0.3, ctx.plan.H - 3.2), sx: 2.4, sz: 2.6, l: 2.4 } : { type: 'troffer', lamp, k: 8.5 });
}

// ---------------------------------------------------------------- daylight
// windows: [{ x, y, z, w, h }] on the storefront plane, emitting toward -z. Registers circuit-2 emitters.
export function registerDaylight(ctx, k = 1) {
  for (const w of ctx.windows) { const n = Math.max(1, Math.round(w.h / 1.1)), a = w.w * w.h * 0.34 * k / n; for (let i = 0; i < n; i++) ctx.lights.push({ p: [w.x, w.y - w.h / 2 + (i + 0.5) * w.h / n, w.z - 0.08], c: [a, a, a], ch: 2, type: 'area', d: [0, -0.18, -0.98], soft: 0.9, wrap: 0.25, amb: 1.6 }); }
}
const SKY_KEYS = [[0, 0.035, 0.45, 0.6, 1.0], [5.2, 0.04, 0.5, 0.62, 1.0], [6.3, 0.45, 1.0, 0.62, 0.42], [7.5, 1.1, 1.0, 0.86, 0.7], [10, 1.9, 1.0, 0.98, 0.95], [15, 1.9, 1.0, 0.97, 0.92], [17.6, 1.3, 1.0, 0.82, 0.62], [18.8, 0.6, 1.0, 0.56, 0.36], [19.6, 0.12, 0.7, 0.6, 0.9], [20.4, 0.04, 0.5, 0.62, 1.0], [24, 0.035, 0.45, 0.6, 1.0]];
// hour 0..24 -> updates the shared SKY uniform; returns { day: 0..1 daylight factor, night: 0..1 }
export function updateSky(hour) {
  let i = 0; while (i < SKY_KEYS.length - 2 && hour >= SKY_KEYS[i + 1][0]) i++; const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], t = clamp((hour - a[0]) / (b[0] - a[0]));
  const k = lerp(a[1], b[1], t); SKY.value.setRGB(lerp(a[2], b[2], t) * k, lerp(a[3], b[3], t) * k, lerp(a[4], b[4], t) * k); const day = clamp(k / 1.9); return { day, night: 1 - clamp(k / 0.6) };
}

// ---------------------------------------------------------------- pooled real-time lights
// A fixed number of PointLights lives in the scene for the whole session (changing the light count would recompile every shader).
// Each frame they move to the brightest fixtures near the camera inside the active interior, with soft fades.
export function createLightPool(scene, n = 4) {
  const lights = []; for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 9, 2); l.castShadow = false; l.userData.slot = null; scene.add(l); lights.push(l); }
  const tmp = new THREE.Vector3();
  function update(dt, store, camLocal, levelMain, levelAccent) {
    const fl = store?.built?.fixtureLights; let want = [];
    if (fl && fl.length) { for (const f of fl) { const lv = f.ch === 0 ? levelMain : f.ch === 1 ? levelAccent : 1; f.s = f.w * lv / (1.5 + (f.x - camLocal.x) ** 2 + (f.y - camLocal.y) ** 2 * 0.3 + (f.z - camLocal.z) ** 2); } want = fl.filter((f) => f.s > 0.02).sort((a, b) => b.s - a.s).slice(0, n); }
    for (const l of lights) { const f = l.userData.slot; if (f && want.includes(f) && l.userData.store === store) { l.userData.target = 1; want.splice(want.indexOf(f), 1); } else l.userData.target = 0; }
    for (const l of lights) { if (l.userData.target === 0 && l.intensity <= 0.001 && want.length) { const f = want.shift(); l.userData.slot = f; l.userData.store = store; l.userData.target = 1; store.toWorld(f.x, f.z, tmp); l.position.set(tmp.x, store.baseY + f.y - 0.15, tmp.z); const m = Math.max(f.c[0], f.c[1], f.c[2]) || 1; l.color.setRGB(f.c[0] / m, f.c[1] / m, f.c[2] / m); l.userData.power = Math.min(14, m * 1.6 + 2); l.distance = 10; }
      const f = l.userData.slot, lv = !f ? 0 : f.ch === 0 ? levelMain : f.ch === 1 ? levelAccent : 1, goal = l.userData.target ? (l.userData.power || 0) * lv : 0; l.intensity += clamp(goal - l.intensity, -dt * 40, dt * 40); if (l.intensity < 0.001) l.intensity = 0; }
  }
  return { lights, update, dispose() { for (const l of lights) scene.remove(l); } };
}

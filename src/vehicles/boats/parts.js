// Shared boat parts. Each function draws into a Kit (see kit.js) in the CURRENT transform, so wrap calls in K.at(...) to
// place and rotate them. Sizes are real-world meters. Parts that move (outboards, wheel, throttle, props) are Kit parts and
// show up in root.userData.parts under the names documented on each function.
import * as THREE from 'three';
import { S, mat4, clamp, lerp, ringPlan, ringRect } from './kit.js';
import { SCREEN, screenRect } from './livery.js';

const PI = Math.PI;
// extrude a side profile [[z, y], ...] (counter-clockwise seen from port, +z forward) across the beam: width w centered on x
export function profileX(K, bucket, slot, ptsZY, w, o = {}) {
  const m = new THREE.Matrix4().makeTranslation((o.x || 0) + w / 2, 0, 0).multiply(new THREE.Matrix4().makeRotationY(-PI / 2));
  return K.extrude(bucket, slot, ptsZY, w, m, { bevel: o.bevel || 0, bevelSeg: o.bevelSeg || 2, holes: o.holes });
}

// ---------------------------------------------------------------- outboard engine
// Parts: `${name}` (transom bracket, fixed) > `steer` (rotation.y = steering) > `tilt` (rotation.x = trim / tilt, + lifts the
// leg) > `prop` (rotation.z = spin). Pivot of `name` = top center of the transom where the engine clamps on.
// o: { hp, id (identity: brand shape + decals), decals (rects from paintDecals), shaft (m, default by hp), tiller: bool,
//      slot (cowl palette slot), slot2 }
export function outboard(K, name, x, y, z, o = {}) {
  const hp = o.hp || 150, s = clamp(0.47 + 0.53 * Math.pow(hp / 300, 0.42), 0.42, 1.12), shape = o.id?.outboard?.shape || 'round';
  const slot = o.slot ?? S.cowl, slot2 = o.slot2 ?? S.cowl2;
  const rig = K.part(name, x, y, z);
  // clamp bracket + swivel + trim rams (fixed to the transom)
  rig.mirror((sx) => { rig.rbox('alu', S.gray, 0.035 * s, 0.34 * s, 0.16 * s, 0.006, sx * 0.105 * s, -0.12 * s, -0.07 * s); rig.cyl('metal', S.steel, 0.014 * s, 0.014 * s, 0.26 * s, sx * 0.06 * s, -0.2 * s, -0.12 * s, 0.5, 0, 0, 8); });
  rig.rbox('alu', S.gray, 0.25 * s, 0.05 * s, 0.07 * s, 0.01, 0, 0.02 * s, 0.01 * s);            // transom clamp top
  rig.cyl('alu', S.gray, 0.035 * s, 0.035 * s, 0.4 * s, 0, -0.12 * s, -0.15 * s, 0, 0, 0, 10);     // swivel tube
  rig.cyl('metal', S.steel, 0.012 * s, 0.012 * s, 0.34 * s, 0, 0.0, -0.06 * s, 0, 0, PI / 2, 8);   // steering cylinder rod
  const steer = rig.part('steer', 0, 0, -0.15 * s);
  const tilt = steer.part('tilt', 0, 0.02 * s, 0);
  const T = tilt, cz = -0.2 * s, Hc = 0.62 * s, Wc = 0.5 * s, Lc = 0.74 * s, yb = 0.08 * s; // cowl box: bottom at yb
  // lower cowl (pan) + top cowl as plan rings stacked upward
  const prof = shape === 'tall'
    ? [[0, 0.8, 0.82, 0], [0.1, 0.92, 0.94, 0], [0.3, 1, 1, 0], [0.32, 0.97, 0.98, 0], [0.36, 1, 1, 0], [0.7, 1, 0.99, -0.01], [0.9, 0.93, 0.93, -0.02], [0.98, 0.74, 0.76, -0.03], [1, 0.4, 0.45, -0.03]]
    : shape === 'wedge'
      ? [[0, 0.78, 0.8, 0], [0.12, 0.93, 0.95, 0], [0.3, 1, 1, 0], [0.32, 0.97, 0.98, 0], [0.36, 1, 1, 0], [0.62, 0.98, 0.95, 0.02], [0.84, 0.9, 0.82, 0.06], [0.96, 0.7, 0.62, 0.09], [1, 0.36, 0.34, 0.1]]
      : [[0, 0.76, 0.8, 0], [0.12, 0.92, 0.94, 0], [0.3, 1, 1, 0], [0.32, 0.975, 0.985, 0], [0.36, 1, 1, 0], [0.6, 0.99, 0.98, 0], [0.8, 0.9, 0.9, -0.01], [0.93, 0.7, 0.72, -0.02], [1, 0.3, 0.34, -0.02]];
  const exp = shape === 'tall' ? 4.2 : shape === 'wedge' ? 3.4 : 2.9;
  const ring = (p) => ringPlan((Wc / 2) * p[1], (Lc / 2) * p[2], yb + Hc * p[0], exp, 22, 0, cz + p[3] * Lc);
  T.loft('gel', S.gray, prof.slice(0, 4).map(ring), { closed: true, flip: true, capA: true });
  T.loft('gel', slot, prof.slice(3).map(ring), { closed: true, flip: true, capB: true, creaseRings: [1] });
  // accent band at the belt line + rear air intake + top handle recess
  T.loft('gel', slot2, [ringPlan(Wc / 2 * 1.004, Lc / 2 * 1.004, yb + Hc * 0.385, exp, 22, 0, cz), ringPlan(Wc / 2 * 1.004, Lc / 2 * 1.004, yb + Hc * 0.41, exp, 22, 0, cz)], { closed: true, flip: true });
  T.rbox('matte', S.black, Wc * 0.5, Hc * 0.07, 0.012 * s, 0.004, 0, yb + Hc * 0.84, cz - Lc * 0.468, -0.28);
  T.rbox('matte', S.black, Wc * 0.2, 0.012, Lc * 0.2, 0.004, 0, yb + Hc * 0.995, cz - Lc * 0.1);
  // brand + horsepower decals on both cowl sides and the back
  const dr = o.decals;
  if (dr?.cowl) { const r = dr.cowl, h = Hc * 0.17, w = Math.min(Lc * 0.74, h * r.aspect), yy = yb + Hc * 0.52, xs = Wc / 2 + 0.004;
    T.quad('decal', S.white, [xs, yy - h / 2, cz + w / 2], [xs, yy - h / 2, cz - w / 2], [xs, yy + h / 2, cz - w / 2], [xs, yy + h / 2, cz + w / 2], r.uv);
    T.quad('decal', S.white, [-xs, yy - h / 2, cz - w / 2], [-xs, yy - h / 2, cz + w / 2], [-xs, yy + h / 2, cz + w / 2], [-xs, yy + h / 2, cz - w / 2], r.uv); }
  if (dr?.cowlfx) { const r = dr.cowlfx, h = Hc * 0.24, w = Lc * 0.92, yy = yb + Hc * 0.765, xs = Wc / 2 * 0.985 + 0.004;
    T.quad('decal', S.white, [xs, yy - h / 2, cz + w / 2], [xs, yy - h / 2, cz - w / 2], [xs * 0.93, yy + h / 2, cz - w / 2], [xs * 0.93, yy + h / 2, cz + w / 2], r.uv);
    T.quad('decal', S.white, [-xs, yy - h / 2, cz - w / 2], [-xs, yy - h / 2, cz + w / 2], [-xs * 0.93, yy + h / 2, cz + w / 2], [-xs * 0.93, yy + h / 2, cz - w / 2], [r.uv[2], r.uv[1], r.uv[0], r.uv[3]]); }
  if (dr?.warn) { const r = dr.warn, w = 0.13 * s, h = w / r.aspect, zz = cz - 0.075 * s - 0.004; T.quad('decal', S.white, [w / 2, yb - 0.2 * s - h / 2, zz - 0.07 * s], [-w / 2, yb - 0.2 * s - h / 2, zz - 0.07 * s], [-w / 2, yb - 0.2 * s + h / 2, zz - 0.07 * s], [w / 2, yb - 0.2 * s + h / 2, zz - 0.07 * s], r.uv); }
  // cowl latch, flush plug, telltale outlet, lifting eye cover, hose clamps, hydraulic steering hoses
  T.rbox('metal', S.steel, 0.05 * s, 0.03 * s, 0.012, 0.004, 0, yb + Hc * 0.34, cz - Lc / 2 - 0.004); T.cyl('matte', S.black, 0.012 * s, 0.012 * s, 0.01, Wc * 0.36, yb + Hc * 0.2, cz - Lc * 0.42, 0, 0, PI / 2, 8);
  T.cyl('metal', S.steel, 0.008 * s, 0.008 * s, 0.03 * s, -Wc * 0.3, yb + Hc * 0.1, cz - Lc * 0.36, 0.9, 0, 0.5, 6); K.anchor('telltale', x - Wc * 0.3, y + yb + Hc * 0.1, z - 0.15 * s + cz - Lc * 0.4, { name });
  for (const k of [0.5, 0.82]) T.torus('metal', S.steel, 0.024 * s, 0.004, lerp(0.06, 0.1, k) * s, lerp(yb + Hc * 0.2, yb - 0.08 * s, k * k), cz + Lc * lerp(0.46, 0.86, k), 0.9, 0, 0, 10, 4);
  rig.mirror((sx) => rig.tube('matte', S.rubber, [[sx * 0.16 * s, 0.0, -0.06 * s], [sx * 0.2 * s, 0.03 * s, 0.02 * s], [sx * 0.16 * s, 0.05 * s, 0.1 * s], [sx * 0.1 * s, -0.02 * s, 0.16 * s]], 0.008 * s, { seg: 5 }));
  rig.mirror((sx) => { rig.cyl('metal', S.steel, 0.012 * s, 0.012 * s, 0.012, sx * 0.105 * s, -0.02 * s, -0.07 * s, 0, 0, PI / 2, 6); rig.cyl('metal', S.steel, 0.012 * s, 0.012 * s, 0.012, sx * 0.105 * s, -0.22 * s, -0.05 * s, 0, 0, PI / 2, 6); });
  if (dr?.hp) { const r = dr.hp, h = Hc * 0.2, w = Math.min(Wc * 0.6, h * r.aspect), yy = yb + Hc * 0.6, zz = cz - Lc / 2 - 0.004;
    T.quad('decal', S.white, [w / 2, yy - h / 2, zz], [-w / 2, yy - h / 2, zz], [-w / 2, yy + h / 2, zz], [w / 2, yy + h / 2, zz], r.uv); }
  // midsection (exhaust housing) down to the anti-ventilation plate
  const shaft = (o.shaft ?? (hp >= 200 ? 0.635 : hp >= 40 ? 0.508 : 0.381)) + 0.06 * s, yP = yb - shaft;
  T.loft('gel', slot, [ringRect(0.13 * s, 0.001, 0.03 * s, 0, 0, 5), ringRect(0.15 * s, 0.001, 0.035 * s, 0, 0, 5)].map((r, i) => ringPlan(i ? 0.105 * s : 0.075 * s, i ? 0.2 * s : 0.15 * s, i ? yb + 0.01 : yP + 0.03 * s, 2.6, 16, 0, cz + (i ? 0.02 * s : 0.04 * s))), { closed: true, flip: true });
  T.rbox('gel', slot, 0.34 * s, 0.018 * s, 0.5 * s, 0.006, 0, yP + 0.03 * s, cz - 0.04 * s);          // anti-ventilation plate
  T.rbox('gel', slot, 0.2 * s, 0.014 * s, 0.34 * s, 0.005, 0, yP + 0.16 * s, cz + 0.02 * s);          // splash plate
  // gearcase: strut + torpedo + skeg
  const yG = yP - 0.16 * s;
  T.loft('gel', slot, [ringPlan(0.035 * s, 0.14 * s, yG, 2.4, 12, 0, cz + 0.03 * s), ringPlan(0.05 * s, 0.16 * s, yP + 0.03 * s, 2.4, 12, 0, cz + 0.04 * s)], { closed: true, flip: true });
  T.lathe('gel', slot, [[0.001, -0.3 * s], [0.03 * s, -0.27 * s], [0.058 * s, -0.18 * s], [0.07 * s, -0.04 * s], [0.07 * s, 0.1 * s], [0.06 * s, 0.2 * s], [0.052 * s, 0.22 * s]], 0, yG, cz + 0.02 * s, -PI / 2, 0, 0, 14);
  T.extrude('gel', slot, [[-0.16 * s, 0], [0.2 * s, 0], [0.05 * s, -0.19 * s], [-0.07 * s, -0.19 * s]], 0.016 * s, mat4(0.008 * s, yG - 0.05 * s, cz + 0.03 * s, 0, -PI / 2, 0), { bevel: 0.003 });
  T.rbox('metal', S.steel, 0.012 * s, 0.05 * s, 0.06 * s, 0.003, 0, yP + 0.0, cz - 0.24 * s);          // trim tab anode
  // propeller
  const prop = T.part('prop', 0, yG, cz - 0.215 * s);
  const blades = hp >= 250 ? 4 : 3, pr = (hp < 20 ? 0.105 : 0.19) * Math.min(1, s + 0.05);
  prop.cyl('metal', S.steel, 0.048 * s, 0.04 * s, 0.14 * s, 0, 0, -0.05 * s, PI / 2, 0, 0, 12);
  prop.lathe('metal', S.steel, [[0.001, -0.06 * s], [0.03 * s, -0.03 * s], [0.04 * s, 0]], 0, 0, -0.12 * s, -PI / 2, 0, 0, 10);
  for (let b = 0; b < blades; b++) prop.with(mat4(0, 0, -0.05 * s, 0, 0, (b / blades) * PI * 2), () => prop.with(mat4(0, pr * 0.58, 0, 0, 0.62, 0), () => prop.sphere('metal', S.steel, 1, 0, 0, 0, pr * 0.34, pr * 0.5, 0.006, 10)));
  // rigging hose from the cowl front down over the transom
  T.tube('matte', S.rubber, [[0.06 * s, yb + Hc * 0.2, cz + Lc * 0.46], [0.07 * s, yb + Hc * 0.16, cz + Lc * 0.62], [0.09 * s, yb + 0.02, cz + Lc * 0.74], [0.1 * s, yb - 0.08 * s, cz + Lc * 0.86]], 0.022 * s, { seg: 7 });
  if (o.tiller) { // tiller arm with twist grip + kill switch
    T.tube('gel', slot, [[0, yb + Hc * 0.3, cz + Lc * 0.42], [0.02, yb + Hc * 0.34, cz + Lc * 0.7], [0.03, yb + Hc * 0.42, cz + Lc * 1.25]], 0.022, { seg: 8 });
    T.cyl('matte', S.rubber, 0.026, 0.026, 0.13, 0.03, yb + Hc * 0.435, cz + Lc * 1.34, PI / 2 - 0.12, 0, 0, 10);
    T.cyl('matte', S.red, 0.012, 0.012, 0.02, 0.03, yb + Hc * 0.45, cz + Lc * 1.18, 0, 0, 0, 8);
  }
  K.anchor('engine', x, y, z, { name, hp, scale: s, propY: y + 0.02 * s + yG, propZ: z - 0.15 * s + cz - 0.215 * s });
  return { scale: s, cowlTop: yb + Hc, shaft };
}
// outboard x positions for n engines with the given spacing (center to center)
export const engineXs = (n, gap = 0.66) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * gap);

// ---------------------------------------------------------------- cushions and seats
// upholstered cushion: pleated top (pleats run fore-aft), piping around the edge. Origin = center of the bottom face.
export function cushion(K, w, h, d, o = {}) {
  const A = o.slot ?? S.upA, B = o.slot2 ?? S.upB, n = o.pleats ?? Math.max(1, Math.round(w / 0.16)), r = Math.min(o.r ?? 0.035, h * 0.45);
  if (n <= 1) K.rbox('vinyl', A, w, h, d, r, 0, h / 2, 0, 0, 0, 0, 2);
  else { const pw = w / n; K.rbox('vinyl', A, w, h * 0.7, d, r * 0.6, 0, h * 0.35, 0); for (let i = 0; i < n; i++) K.rbox('vinyl', (o.stripe && (i === 1 || i === n - 2)) ? B : A, pw * 0.985, h * 0.62, d * 0.985, Math.min(r, pw * 0.3), -w / 2 + pw * (i + 0.5), h * 0.69, 0); }
  if (o.piping !== false) { const y = h * 0.42, x = w / 2 + 0.002, z = d / 2 + 0.002; K.tube('vinyl', B, [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]], 0.007, { closed: true, fillet: 0.03, seg: 5 }); }
  return K;
}
// bench: molded base + seat cushion + optional backrest. Origin: bottom center of the base; faces +Z unless rotated.
export function bench(K, w, d, o = {}) {
  const baseH = o.baseH ?? 0.36, cush = o.cush ?? 0.1, backH = o.backH ?? 0.42;
  if (baseH > 0) K.rbox('gel', o.baseSlot ?? S.liner, w, baseH, d, 0.025, 0, baseH / 2, 0);
  K.at(0, baseH, 0.01, () => cushion(K, w - 0.04, cush, d - 0.05, o));
  if (backH > 0) K.at(0, baseH + cush * 0.6, -d / 2 + 0.05, () => cushion(K, w - 0.04, 0.09, backH, { ...o, pleats: o.pleats ?? Math.max(1, Math.round(w / 0.16)) }), -PI / 2 + (o.rake ?? 0.2));
  K.anchor('seat', 0, baseH + cush, 0.02, { pose: 'sit', back: backH > 0 });
  return K;
}
// pedestal helm chair with flip-up bolster and arm rests. Origin: deck under the pedestal; faces +Z.
export function helmChair(K, o = {}) {
  const h = o.h ?? 0.62, w = o.w ?? 0.5;
  K.cyl('alu', S.alu, 0.035, 0.045, h - 0.06, 0, (h - 0.06) / 2, 0, 0, 0, 0, 12); K.cyl('alu', S.alu, 0.11, 0.13, 0.025, 0, 0.012, 0, 0, 0, 0, 14); K.cyl('alu', S.gray, 0.06, 0.06, 0.05, 0, h - 0.06, 0, 0, 0, 0, 12);
  K.rbox('gel', S.liner, w, 0.05, 0.46, 0.02, 0, h - 0.02, 0);
  K.at(0, h, 0.02, () => cushion(K, w - 0.03, 0.1, 0.42, { ...o, pleats: 3 }));
  K.at(0, h + 0.06, -0.21, () => cushion(K, w - 0.03, 0.1, 0.5, { ...o, pleats: 3 }), -PI / 2 + 0.16);
  K.at(0, h + 0.1, 0.19, () => K.rbox('vinyl', o.slot2 ?? S.upB, w - 0.04, 0.09, 0.12, 0.04, 0, 0.045, 0));       // bolster
  K.mirror((sx) => { K.rbox('vinyl', o.slot ?? S.upA, 0.06, 0.05, 0.3, 0.02, sx * (w / 2 + 0.01), h + 0.26, -0.02); K.rod('alu', S.alu, [sx * (w / 2 + 0.01), h + 0.02, -0.12], [sx * (w / 2 + 0.01), h + 0.24, -0.1], 0.012); });
  K.anchor('seat', 0, h + 0.1, 0.02, { pose: 'sit', back: true });
  return K;
}
// leaning post: pipe frame, bolster cushion, backrest bar, rocket-launcher rod holders, cooler slot. Origin: deck center; faces +Z.
export function leaningPost(K, o = {}) {
  const w = o.w ?? 0.95, h = o.h ?? 0.86, d = 0.36, t = 0.019, m = o.metal ?? 'metal', ms = o.metalSlot ?? S.steel;
  K.mirror((sx) => { const x = sx * (w / 2 - 0.02);
    K.tube(m, ms, [[x, 0, d / 2], [x, h - 0.08, d / 2 - 0.03], [x, h - 0.02, 0], [x, h - 0.08, -d / 2 + 0.03], [x, 0, -d / 2]], t, { fillet: 0.07, seg: 8 });
    K.cyl(m, ms, 0.04, 0.045, 0.012, x, 0.006, d / 2, 0, 0, 0, 10); K.cyl(m, ms, 0.04, 0.045, 0.012, x, 0.006, -d / 2, 0, 0, 0, 10);
    K.rod(m, ms, [x, h + 0.02, -d / 2 + 0.03], [x, h + 0.34, -d / 2 - 0.02], t * 0.9); });
  K.rod(m, ms, [-(w / 2 - 0.02), 0.3, d / 2 - 0.01], [w / 2 - 0.02, 0.3, d / 2 - 0.01], t * 0.85); K.rod(m, ms, [-(w / 2 - 0.02), 0.3, -d / 2 + 0.01], [w / 2 - 0.02, 0.3, -d / 2 + 0.01], t * 0.85);
  K.at(0, h - 0.04, 0, () => cushion(K, w - 0.02, 0.12, d + 0.06, { ...o, pleats: 4 }));
  K.at(0, h + 0.22, -d / 2 - 0.035, () => cushion(K, w - 0.02, 0.07, 0.2, { ...o, pleats: 4 }), -PI / 2 + 0.08);
  const nr = o.rods ?? 4; for (let i = 0; i < nr; i++) { const x = -w / 2 + 0.1 + (i * (w - 0.2)) / Math.max(1, nr - 1); K.cyl(m, ms, 0.026, 0.026, 0.26, x, h - 0.02, -d / 2 - 0.09, -0.1, 0, 0, 10, true); K.anchor('rodTube', x, h + 0.1, -d / 2 - 0.1, { rx: -0.1 }); }
  K.rod(m, ms, [-(w / 2 - 0.04), h - 0.06, -d / 2 - 0.085], [w / 2 - 0.04, h - 0.06, -d / 2 - 0.085], 0.012);
  if (o.cooler !== false) K.at(0, 0.02, 0, () => cooler(K, { w: w - 0.2, h: 0.3, d: 0.3, slot: o.coolerSlot ?? S.white }));
  K.anchor('helm', 0, 0, d / 2 + 0.22, { pose: 'lean', seatY: h });
  return K;
}

// ---------------------------------------------------------------- helm: console, wheel, throttle, electronics
// Steering wheel. Part name `wheel` (rotation.z = spin). Call inside K.at(...) at the hub position; `rake` tilts the column.
export function steeringWheel(K, o = {}) {
  const R = o.R ?? 0.19, rake = o.rake ?? 0.42, m = o.black ? 'matte' : 'metal', sl = o.black ? S.rubber : S.steel;
  K.cyl('metal', S.steel, 0.03, 0.04, 0.08, 0, 0, 0, PI / 2 - rake, 0, 0, 12);
  const Wp = K.part(o.name || 'wheel', 0, Math.sin(rake) * 0.06, -Math.cos(rake) * 0.06, -rake, 0, 0);
  Wp.torus(m, sl, R, 0.014, 0, 0, 0, 0, 0, 0, 28, 8);
  const sp = o.spokes ?? 5; for (let i = 0; i < sp; i++) { const a = (i / sp) * PI * 2 + PI / 2; Wp.rod('metal', S.steel, [0, 0, 0.012], [Math.cos(a) * R, Math.sin(a) * R, 0], 0.008, 6); }
  Wp.cyl('metal', S.steel, 0.04, 0.045, 0.03, 0, 0, 0.012, PI / 2, 0, 0, 14);
  if (o.knob !== false) { Wp.cyl('matte', S.black, 0.017, 0.02, 0.05, R * Math.cos(PI / 2 + 0.6), R * Math.sin(PI / 2 + 0.6), -0.03, PI / 2, 0, 0, 10); }
  K.anchor('wheel', 0, Math.sin(rake) * 0.06, -Math.cos(rake) * 0.06, { R, rake });
  return K;
}
// binnacle throttle. Part names `throttle0` .. (rotation.x = lever angle). n levers.
export function throttle(K, n = 1, o = {}) {
  K.rbox('metal', S.steel, 0.07 + 0.045 * n, 0.07, 0.13, 0.02, 0, 0.035, 0);
  for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.055; const Lv = K.part(`${o.name || 'throttle'}${i}`, x, 0.06, 0);
    Lv.rbox('metal', S.steel, 0.018, 0.17, 0.03, 0.006, 0, 0.085, 0); Lv.rbox('matte', S.black, 0.03, 0.045, 0.05, 0.012, 0, 0.19, 0); Lv.rbox('matte', i ? S.gray : S.red, 0.012, 0.012, 0.02, 0.003, 0.012, 0.2, 0.02); }
  K.anchor('throttle', 0, 0.2, 0, {});
  return K;
}
// electronics on a flat panel. Draws screens/gauges as quads on the plane through `c` with right vector `rt` and up vector `up`.
// items: [{ s: SCREEN.x, w, h, x, y, bezel }]  (x, y offsets on the panel, meters)
export function panel(K, c, rt, up, items) {
  const C = new THREE.Vector3(...c), R = new THREE.Vector3(...rt).normalize(), U = new THREE.Vector3(...up).normalize(), Nn = new THREE.Vector3().crossVectors(R, U).normalize();
  for (const it of items) {
    const o = C.clone().addScaledVector(R, it.x || 0).addScaledVector(U, it.y || 0), hw = it.w / 2, hh = it.h / 2, bz = it.bezel ?? 0.012;
    const P = (dx, dy, dn) => { const p = o.clone().addScaledVector(R, dx).addScaledVector(U, dy).addScaledVector(Nn, dn); return [p.x, p.y, p.z]; };
    if (bz > 0) { const m = new THREE.Matrix4().makeBasis(R, U, Nn).setPosition(o.clone().addScaledVector(Nn, 0.006));
      if (it.round) K.add('matte', S.black, new THREE.CylinderGeometry(hw + bz, hw + bz, 0.014, 20), m.clone().multiply(new THREE.Matrix4().makeRotationX(PI / 2)));
      else K.add('matte', S.black, new THREE.BoxGeometry(it.w + bz * 2, it.h + bz * 2, 0.014), m); }
    K.quad('screen', S.white, P(-hw, -hh, 0.0145), P(hw, -hh, 0.0145), P(hw, hh, 0.0145), P(-hw, hh, 0.0145), screenRect(it.s));
  }
  return K;
}
// Center console. Origin: deck at the console center; helm faces aft (the driver stands behind it looking +Z).
// o: { w, l, h, screens (1|2), gauges, windshield: 'low'|'tall'|'none', throttles, seat: bool (front cooler seat), wheel: {...} }
export function centerConsole(K, o = {}) {
  const w = o.w ?? 0.86, l = o.l ?? 0.86, h = o.h ?? 1.08, sl = o.slot ?? S.console, a = -l / 2, f = l / 2;
  // side profile (z fwd, y up), counter-clockwise seen from port
  const dashTopZ = a + 0.2, dashLowY = h - 0.3, prof = [[a + 0.07, 0], [f - 0.02, 0], [f, 0.06], [f - 0.05, h * 0.74], [f - 0.17, h], [dashTopZ, h], [a + 0.03, dashLowY], [a, dashLowY - 0.05], [a, 0.34], [a + 0.07, 0.3]];
  profileX(K, 'gel', sl, prof, w, { bevel: 0.022, bevelSeg: 3 });
  // dash plane basis: right = -x for a viewer standing aft? The viewer looks +Z, so screen-right = -X (starboard).
  const dz = dashTopZ - (a + 0.03), dy = h - dashLowY, dl = Math.hypot(dz, dy), up = [0, dy / dl, dz / dl], cz = (dashTopZ + a + 0.03) / 2, cy = (h + dashLowY) / 2;
  const nrm = [0, dz / dl, -dy / dl], off = 0.024, cc = [0, cy + nrm[1] * off, cz + nrm[2] * off];
  const sw = (o.screens ?? 1) === 2 ? 0.25 : Math.min(0.34, w * 0.42), items = [];
  if ((o.screens ?? 1) === 2) items.push({ s: SCREEN.chartA, w: sw, h: 0.16, x: 0.15, y: 0.02 }, { s: SCREEN.sonar, w: sw, h: 0.16, x: -0.15, y: 0.02 });
  else items.push({ s: o.screen ?? SCREEN.split, w: sw, h: 0.2, x: 0.04, y: 0.01 });
  if (o.gauges !== false) { const gx = (o.screens ?? 1) === 2 ? 0 : -sw / 2 - 0.1; items.push({ s: SCREEN.tach, w: 0.085, h: 0.085, x: gx, y: (o.screens ?? 1) === 2 ? -0.11 : 0.05, round: true, bezel: 0.008 }, { s: SCREEN.speedo, w: 0.085, h: 0.085, x: gx - ((o.screens ?? 1) === 2 ? 0.11 : 0), y: (o.screens ?? 1) === 2 ? -0.11 : -0.06, round: true, bezel: 0.008 }); }
  panel(K, cc, [-1, 0, 0], up, items);
  // helm face: switch panel, VHF, wheel, throttle
  const fz = a - 0.003;
  panel(K, [0, dashLowY - 0.14, fz - 0.02], [-1, 0, 0], [0, 1, 0], [{ s: SCREEN.switches, w: 0.16, h: 0.07, x: -w * 0.27, y: 0.0, bezel: 0.006 }, { s: SCREEN.vhf, w: 0.13, h: 0.06, x: w * 0.3, y: -0.14, bezel: 0.006 }]);
  K.at(o.wheelX ?? 0.06, dashLowY - 0.2, a - 0.02, () => steeringWheel(K, { rake: 0.5, ...(o.wheel || {}) }));
  K.at(-w * 0.3, h - 0.03, dashTopZ - 0.02, () => throttle(K, o.throttles ?? 1), up[2] > 0 ? -0.5 : 0);
  // compass + grab rail + cup holders on top
  K.sphere('matte', S.black, 0.05, 0.1, h + 0.025, (dashTopZ + f - 0.17) / 2, 1, 0.8, 1, 12); K.cyl('matte', S.black, 0.058, 0.062, 0.03, 0.1, h + 0.012, (dashTopZ + f - 0.17) / 2, 0, 0, 0, 14);
  K.mirror((sx) => K.cyl('metal', S.steel, 0.043, 0.04, 0.012, sx * (w / 2 - 0.09), h + 0.004, dashTopZ + 0.07, 0, 0, 0, 14));
  // windshield + grab rail around it
  const ws = o.windshield ?? 'low';
  if (ws !== 'none') { const wh = ws === 'tall' ? 0.62 : 0.3, z0 = f - 0.2, rings = [], n = 9;
    for (const [yy, k] of [[h - 0.01, 0], [h + wh, 1]]) { const row = []; for (let i = 0; i <= n; i++) { const t = i / n * 2 - 1, x = t * (w / 2 - 0.02 - k * 0.03), zz = z0 - Math.pow(Math.abs(t), 2.4) * 0.22 - k * wh * 0.42; row.push([x, yy, zz]); } rings.push(row); }
    K.loft('glass', S.white, rings);
    const top = rings[1], rail = [[top[0][0] - 0.0, h + 0.0, top[0][2] - 0.1], ...top.map((p) => [p[0], p[1] + 0.012, p[2]]), [top[n][0], h + 0.0, top[n][2] - 0.1]];
    K.tube('metal', S.steel, rail, 0.013, { seg: 7, tension: 0.4 }); }
  else K.tube('metal', S.steel, [[-w / 2 + 0.04, h, f - 0.3], [-w / 2 + 0.05, h + 0.12, f - 0.28], [w / 2 - 0.05, h + 0.12, f - 0.28], [w / 2 - 0.04, h, f - 0.3]], 0.013, { fillet: 0.04, seg: 7 });
  // access door on the port side + footrest
  K.rbox('gel', sl, 0.012, h * 0.5, l * 0.42, 0.004, w / 2 + 0.024, h * 0.36, 0.02); K.cyl('metal', S.steel, 0.012, 0.012, 0.008, w / 2 + 0.032, h * 0.36, -l * 0.14, 0, 0, PI / 2, 8);
  K.rbox('nonskid', S.nonskid, w * 0.8, 0.02, 0.16, 0.006, 0, 0.3, a + 0.01, -0.5);
  if (o.seat !== false) { // cooler seat molded on the front
    K.rbox('gel', sl, w * 0.82, 0.4, 0.42, 0.03, 0, 0.2, f + 0.2); K.at(0, 0.4, f + 0.2, () => cushion(K, w * 0.8, 0.09, 0.4, { pleats: 3 }));
    K.at(0, 0.5, f - 0.01, () => cushion(K, w * 0.7, 0.06, 0.34, { pleats: 3 }), -PI / 2 - 0.12, PI);
    K.anchor('seat', 0, 0.49, f + 0.22, { pose: 'sit', face: 0 }); }
  K.anchor('helm', 0, 0, a - 0.42, { pose: 'stand', consoleH: h });
  return { w, l, h, a, f, dashTopZ, dashLowY };
}

// ---------------------------------------------------------------- tops
// T-top / hardtop on four legs. Origin: deck at the console center. o: { w, l, h, legW, legZ0, legZ1, hard, rods, lights,
// antenna, radar, outriggers, box }
export function tTop(K, o = {}) {
  const w = o.w ?? 1.5, l = o.l ?? 1.9, h = o.h ?? 2.02, lw = o.legW ?? 0.86, z0 = o.legZ0 ?? -0.38, z1 = o.legZ1 ?? 0.36, cz = o.cz ?? -0.1, r = 0.022, hard = !!o.hard;
  const m = o.metal ?? 'metal', ms = o.metalSlot ?? S.steel;
  K.mirror((sx) => { const x = sx * (lw / 2 + 0.03);
    for (const [zz, top] of [[z0, cz - l * 0.3], [z1, cz + l * 0.3]]) { K.tube(m, ms, [[x, 0, zz], [x, h * 0.55, zz], [sx * (w / 2 - 0.08), h - 0.1, top], [sx * (w / 2 - 0.06), h - 0.03, top]], r, { fillet: 0.12, seg: 8 }); K.cyl(m, ms, 0.045, 0.05, 0.012, x, 0.006, zz, 0, 0, 0, 10); }
    K.rod(m, ms, [x, h * 0.42, z0], [x, h * 0.42, z1], r * 0.8); K.rod(m, ms, [x, h * 0.42, z0], [sx * (w / 2 - 0.1), h - 0.12, cz - l * 0.1], r * 0.7);
    K.rod(m, ms, [sx * (w / 2 - 0.06), h - 0.04, cz - l / 2 + 0.05], [sx * (w / 2 - 0.06), h - 0.04, cz + l / 2 - 0.05], r); });
  K.rod(m, ms, [-(w / 2 - 0.06), h - 0.04, cz - l / 2 + 0.05], [w / 2 - 0.06, h - 0.04, cz - l / 2 + 0.05], r); K.rod(m, ms, [-(w / 2 - 0.06), h - 0.04, cz + l / 2 - 0.05], [w / 2 - 0.06, h - 0.04, cz + l / 2 - 0.05], r);
  // top skin: crowned loft (canvas laced to the frame, or a molded hardtop with an underside color)
  const rings = [], nz = 7, nx = 7, th = hard ? 0.06 : 0.012;
  for (let i = 0; i <= nz; i++) { const t = i / nz, zz = cz - l / 2 + t * l, row = []; const taper = hard ? 1 - 0.1 * Math.pow(t, 3) : 1; for (let j = 0; j <= nx; j++) { const s2 = j / nx * 2 - 1; row.push([s2 * (w / 2) * taper, h + (1 - s2 * s2) * 0.045 + (hard ? 0 : -0.01 * Math.sin(t * PI * 3) ** 2), zz]); } rings.push(row.reverse()); }
  K.loft(hard ? 'gel' : 'matte', hard ? S.top : S.canvas, rings);
  K.loft(hard ? 'gel' : 'matte', hard ? S.deck : S.canvas, rings.map((row) => row.map((p) => [p[0], p[1] - th, p[2]]).reverse()));
  if (hard) { const edge = (zz, taper) => K.tube('gel', S.top, [[-w / 2 * taper, h - th / 2, zz], [w / 2 * taper, h - th / 2, zz]], th / 2 + 0.004, { seg: 6 }); edge(cz - l / 2, 1); edge(cz + l / 2, 0.9); K.mirror((sx) => K.tube('gel', S.top, [[sx * w / 2, h - th / 2, cz - l / 2], [sx * w / 2 * 0.99, h - th / 2, cz], [sx * w / 2 * 0.9, h - th / 2, cz + l / 2]], th / 2 + 0.004, { seg: 6 })); }
  if (o.box !== false) { K.rbox('gel', S.deck, lw * 0.9, 0.16, 0.3, 0.03, 0, h - 0.14, cz + 0.12); panel(K, [0, h - 0.14, cz + 0.12 - 0.151], [-1, 0, 0], [0, 1, 0], [{ s: SCREEN.vhf, w: 0.15, h: 0.07, x: 0.14, bezel: 0.005 }, { s: SCREEN.stereo, w: 0.15, h: 0.07, x: -0.14, bezel: 0.005 }]); }
  const nr = o.rods ?? 5; for (let i = 0; i < nr; i++) { const x = -w / 2 + 0.16 + (i * (w - 0.32)) / Math.max(1, nr - 1); K.cyl(m, ms, 0.026, 0.026, 0.3, x, h - 0.12, cz - l / 2 + 0.02, -0.32, 0, 0, 10, true); K.anchor('rodTube', x, h + 0.02, cz - l / 2 - 0.03, { rx: -0.32 }); }
  if (o.lights !== false) { K.mirror((sx) => { K.rbox('matte', S.black, 0.12, 0.06, 0.05, 0.012, sx * (w / 2 - 0.22), h - 0.07, cz - l / 2 + 0.07); K.rbox('lamp', S.white, 0.1, 0.045, 0.01, 0.003, sx * (w / 2 - 0.22), h - 0.07, cz - l / 2 + 0.042); });
    K.rbox('matte', S.black, 0.16, 0.05, 0.05, 0.012, 0, h - 0.07, cz + l / 2 - 0.08); K.rbox('lamp', S.white, 0.14, 0.035, 0.01, 0.003, 0, h - 0.07, cz + l / 2 - 0.052); }
  // all-round white light on a stub mast + antennas
  K.cyl('metal', S.steel, 0.012, 0.014, 0.3, 0.2, h + 0.19, cz - l * 0.2, 0, 0, 0, 8); K.cyl('lamp', S.white, 0.022, 0.022, 0.05, 0.2, h + 0.36, cz - l * 0.2, 0, 0, 0, 10); K.anchor('lightAllRound', 0.2, h + 0.36, cz - l * 0.2);
  if (o.antenna !== false) K.mirror((sx) => { if (sx < 0 && o.antenna !== 2) return; K.cyl('gel', S.white, 0.006, 0.012, 2.3, sx * (w / 2 - 0.12), h + 1.1, cz - l * 0.34, -0.22, 0, sx * 0.05, 6); K.cyl('metal', S.steel, 0.02, 0.025, 0.06, sx * (w / 2 - 0.12), h - 0.0, cz - l * 0.34 + 0.25, 0, 0, 0, 8); });
  if (o.radar) { K.lathe('gel', S.white, [[0.001, 0], [0.26, 0.01], [0.3, 0.07], [0.27, 0.14], [0.12, 0.19], [0.001, 0.2]], 0, h + 0.07, cz + l * 0.12, 0, 0, 0, 20); K.cyl('gel', S.white, 0.09, 0.11, 0.07, 0, h + 0.04, cz + l * 0.12, 0, 0, 0, 12); }
  if (o.outriggers) K.mirror((sx) => { K.cyl('metal', S.steel, 0.035, 0.04, 0.1, sx * (w / 2 - 0.02), h - 0.02, cz + 0.1, 0, 0, sx * -0.4, 10); K.cyl('alu', S.alu, 0.008, 0.02, 4.6, sx * (w / 2 + 0.55), h + 2.1, cz - 0.75, -0.36, 0, sx * -0.25, 6); });
  K.anchor('topCenter', 0, h, cz, { w, l });
  return { w, l, h, cz };
}
// folding bimini. Origin: deck center between the mounts. o: { w, l, h, bows }
export function bimini(K, o = {}) {
  const w = o.w ?? 1.8, l = o.l ?? 1.8, h = o.h ?? 1.7, nb = o.bows ?? 3, r = 0.014, m = o.metal ?? 'alu', ms = o.metalSlot ?? S.alu, rows = [];
  for (let b = 0; b < nb; b++) { const t = nb === 1 ? 0.5 : b / (nb - 1), zt = -l / 2 + t * l, pts = [[w / 2, 0, 0], [w / 2, h * 0.6, zt * 0.6], [w / 2 - 0.02, h - 0.1, zt], [w / 2 - 0.2, h, zt], [0, h + 0.04, zt], [-w / 2 + 0.2, h, zt], [-w / 2 + 0.02, h - 0.1, zt], [-w / 2, h * 0.6, zt * 0.6], [-w / 2, 0, 0]];
    K.tube(m, ms, pts, r, { seg: 7, tension: 0.4 }); rows.push([[w / 2 - 0.02, h - 0.1, zt], [w / 2 - 0.2, h + 0.012, zt], [w / 4, h + 0.04, zt], [0, h + 0.052, zt], [-w / 4, h + 0.04, zt], [-w / 2 + 0.2, h + 0.012, zt], [-w / 2 + 0.02, h - 0.1, zt]].reverse()); }
  // canvas with a little sag between bows
  const fine = []; for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < 4; k++) { const t = k / 4; fine.push(rows[i].map((p, j) => [lerp(p[0], rows[i + 1][j][0], t), lerp(p[1], rows[i + 1][j][1], t) - Math.sin(t * PI) * 0.025, lerp(p[2], rows[i + 1][j][2], t)])); } fine.push(rows[rows.length - 1]);
  K.loft('matte', o.slot ?? S.canvas, fine); K.loft('matte', o.slot ?? S.canvas, fine.map((rw) => rw.map((p) => [p[0], p[1] - 0.008, p[2]]).reverse()));
  K.mirror((sx) => { K.cyl(m, ms, 0.03, 0.03, 0.02, sx * w / 2, 0.01, 0, 0, 0, 0, 8); K.rod('matte', S.black, [sx * (w / 2 - 0.02), h - 0.1, l / 2], [sx * w / 2, 0.02, l / 2 + 0.7], 0.006, 5); K.rod('matte', S.black, [sx * (w / 2 - 0.02), h - 0.1, -l / 2], [sx * w / 2, 0.02, -l / 2 - 0.6], 0.006, 5); });
  return K;
}

// ---------------------------------------------------------------- rails, cleats, deck hardware
// bow rail following the sheer between u0..u1 on both sides, joined around the stem when u1 >= 0.98
export function bowRail(K, H, u0, u1, o = {}) {
  const hgt = o.h ?? 0.42, inset = o.inset ?? 0.07, n = o.posts ?? Math.max(3, Math.round((u1 - u0) * H.L / 0.9)), r = o.r ?? 0.0125, m = o.metal ?? 'metal', ms = o.slot ?? S.steel;
  const P = (u, sx, hh) => { const hb = Math.max(0, H.halfBeam(u) - inset); return [sx * hb, H.sheerY(u) + hh, H.zOf(u) - (hb < inset ? inset : 0)]; };
  const side = (sx) => { const top = [P(u0, sx, 0.02)]; const steps = 16; for (let i = 0; i <= steps; i++) { const u = lerp(u0 + 0.015, u1, i / steps); top.push(P(u, sx, hgt * (0.82 + 0.18 * i / steps))); } return top; };
  const L = side(1), Rr = side(-1), join = u1 >= 0.98;
  const path = join ? [...L, ...Rr.slice(0, -1).reverse()] : null;
  if (join) K.tube(m, ms, path, r, { seg: 7, tension: 0.45, steps: path.length * 3 }); else { K.tube(m, ms, L, r, { seg: 7, tension: 0.45 }); K.tube(m, ms, Rr, r, { seg: 7, tension: 0.45 }); }
  for (let i = 1; i <= n; i++) { const u = lerp(u0, u1, i / (n + (join ? 0.4 : 0))); for (const sx of [1, -1]) { const a = P(u, sx, 0), b = P(u, sx, hgt * (0.82 + 0.18 * (u - u0) / (u1 - u0))); K.rod(m, ms, a, b, r * 0.9, 6); K.cyl(m, ms, 0.026, 0.03, 0.01, a[0], a[1] + 0.005, a[2], 0, 0, 0, 8);
      if (o.mid) { /* mid rail segment handled below */ } } }
  if (o.mid) for (const sx of [1, -1]) { const pts = []; for (let i = 0; i <= 12; i++) { const u = lerp(u0 + 0.05, u1 - (join ? 0.02 : 0), i / 12); pts.push(P(u, sx, hgt * 0.45)); } K.tube(m, ms, pts, r * 0.8, { seg: 6, tension: 0.45 }); }
  return K;
}
// horn cleat. Origin: base center; horns along local Z. Registers a 'cleat' anchor (used for dock lines).
export function cleat(K, x, y, z, ry = 0, size = 0.2, o = {}) {
  K.at(x, y, z, () => { const m = o.metal ?? 'metal', ms = o.slot ?? S.steel;
    K.rbox(m, ms, size * 0.22, size * 0.07, size * 0.5, size * 0.03, 0, size * 0.035, 0);
    for (const sz of [1, -1]) K.cyl(m, ms, size * 0.045, size * 0.06, size * 0.16, 0, size * 0.14, sz * size * 0.12, 0, 0, 0, 8);
    K.add(m, ms, new THREE.CapsuleGeometry(size * 0.055, size * 0.9, 4, 8), mat4(0, size * 0.24, 0, PI / 2, 0, 0));
    K.anchor('cleat', 0, size * 0.2, 0, {}); }, 0, ry, 0);
  return K;
}
// fishing rod with reel. Origin: butt of the rod; points along local +Y. o: { len, slot (blank color), spin }
export function rod(K, o = {}) {
  const len = o.len ?? 2.1, sl = o.slot ?? S.black;
  K.cyl('matte', S.rope, 0.014, 0.016, 0.34, 0, 0.17, 0, 0, 0, 0, 8); K.cyl('matte', sl, 0.004, 0.011, len - 0.34, 0, 0.34 + (len - 0.34) / 2, 0, 0, 0, 0, 6);
  K.cyl('metal', S.steel, 0.03, 0.03, 0.045, 0.035, 0.4, 0, 0, 0, PI / 2, 12); K.cyl('matte', S.black, 0.012, 0.012, 0.05, 0.02, 0.4, 0, 0, 0, PI / 2, 6); K.sphere('matte', S.black, 0.012, 0.06, 0.4, 0.03);
  for (const t of [0.5, 0.68, 0.84, 0.97]) K.torus('metal', S.steel, 0.012 * (1.2 - t), 0.0018, 0.012, len * t, 0, PI / 2, 0, 0, 8, 4);
  return K;
}
// place rods in every 'rodTube' anchor collected so far (rocket launchers), with a seeded chance
export function fillRodTubes(K, r, chance = 0.6) {
  const cols = [S.black, S.navy, S.red, S.gray, S.white, S.blue];
  for (const a of K.anchors.rodTube || []) { if (!r.chance(chance)) continue; K.with(new THREE.Matrix4().copy(K.M).invert(), () => K.at(a.x, a.y - 0.22, a.z, () => rod(K, { len: r.range(1.9, 2.5), slot: r.pick(cols) }), a.rx || 0, 0, r.range(-0.03, 0.03))); }
  return K;
}
// flush gunwale rod holder
export function rodHolder(K, x, y, z, rx = -0.5, rz = 0) { K.cyl('metal', S.steel, 0.03, 0.03, 0.008, x, y + 0.004, z, rx, 0, rz, 12); K.cyl('matte', S.black, 0.022, 0.022, 0.01, x, y + 0.005, z, rx, 0, rz, 10); K.anchor('rodHolder', x, y, z, { rx, rz }); return K; }
// rotomolded cooler. Origin: bottom center. o: { w, h, d, slot, lidSlot }
export function cooler(K, o = {}) {
  const w = o.w ?? 0.7, h = o.h ?? 0.4, d = o.d ?? 0.4, sl = o.slot ?? S.white;
  K.rbox('matte', sl, w, h * 0.74, d, 0.03, 0, h * 0.37, 0); K.rbox('matte', o.lidSlot ?? sl, w + 0.012, h * 0.24, d + 0.012, 0.03, 0, h * 0.87, 0); K.rbox('matte', S.rubber, w + 0.004, 0.012, d + 0.004, 0.004, 0, h * 0.745, 0);
  K.mirror((sx) => { K.rbox('matte', S.rubber, 0.035, 0.09, 0.016, 0.006, sx * w * 0.28, h * 0.72, d / 2 + 0.008); K.tube('matte', S.rope, [[sx * (w / 2 + 0.004), h * 0.62, -d * 0.22], [sx * (w / 2 + 0.06), h * 0.46, 0], [sx * (w / 2 + 0.004), h * 0.62, d * 0.22]], 0.008, { seg: 5 }); K.cyl('matte', S.black, 0.022, 0.022, 0.1, sx * (w / 2 + 0.058), h * 0.46, 0, PI / 2, 0, 0, 8); });
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.rbox('matte', S.rubber, 0.05, 0.015, 0.05, 0.005, x * (w / 2 - 0.05), 0.006, z * (d / 2 - 0.05));
  return K;
}
// boat fender hanging on a line. Origin: where the line is tied (rail / cleat); hangs down. o: { len, r, drop, slot }
export function fender(K, o = {}) {
  const len = o.len ?? 0.55, r = o.r ?? 0.085, drop = o.drop ?? 0.25, sl = o.slot ?? S.white;
  K.rod('matte', S.rope, [0, 0, 0], [0, -drop, 0], 0.006, 5);
  K.lathe('matte', sl, [[0.001, -len], [r * 0.55, -len + 0.01], [r, -len + r * 0.8], [r, -r * 0.8], [r * 0.55, -0.02], [r * 0.3, 0], [r * 0.25, 0.04], [0.001, 0.045]], 0, -drop - 0.045, 0, 0, 0, 0, 14);
  K.torus('matte', S.blue, r * 0.56, 0.012, 0, -drop - 0.06, 0, PI / 2, 0, 0, 14, 5); K.torus('matte', S.blue, r * 0.56, 0.012, 0, -drop - len - 0.035, 0, PI / 2, 0, 0, 14, 5);
  return K;
}
// coiled dock line lying on deck. Origin: center of the coil.
export function coil(K, R = 0.16, turns = 4, slot = S.rope) { const pts = []; const n = turns * 14; for (let i = 0; i <= n; i++) { const a = (i / 14) * PI * 2, rr = R * (0.45 + 0.55 * (i / n)); pts.push([Math.cos(a) * rr, 0.012 + (i % 28 < 14 ? 0.006 : 0.014), Math.sin(a) * rr]); } pts.push([R * 1.5, 0.012, R * 0.3], [R * 2.1, 0.012, R * 0.1]); K.tube('matte', slot, pts, 0.008, { seg: 5, tension: 0.5, steps: pts.length * 2 }); return K; }
// flush deck hatch with a lift latch. Origin: center, top at y.
export function hatch(K, x, y, z, w, d, o = {}) { K.rbox('matte', S.rubber, w + 0.016, 0.006, d + 0.016, 0.003, x, y + 0.002, z); K.rbox(o.bucket ?? 'gel', o.slot ?? S.deck, w, 0.014, d, 0.006, x, y + 0.008, z); if (o.nonskid !== false) K.rbox('nonskid', S.nonskid, w * 0.8, 0.004, d * 0.78, 0.002, x, y + 0.0165, z); K.cyl('metal', S.steel, 0.022, 0.022, 0.006, x, y + 0.017, z + d * 0.42, 0, 0, 0, 10); K.rbox('matte', S.black, 0.03, 0.004, 0.012, 0.001, x, y + 0.021, z + d * 0.42); for (const sx of [1, -1]) { K.rbox('metal', S.steel, 0.07, 0.008, 0.035, 0.002, x + sx * w * 0.3, y + 0.016, z - d / 2 + 0.004); K.cyl('metal', S.steel, 0.005, 0.005, 0.075, x + sx * w * 0.3, y + 0.021, z - d / 2, 0, 0, PI / 2, 6); } return K; }
// anchor on a bow roller. Origin: bow, top of the deck at the stem; +Z forward.
export function bowAnchor(K, o = {}) {
  K.rbox('metal', S.steel, 0.09, 0.03, 0.34, 0.008, 0, 0.02, 0.04); K.cyl('matte', S.black, 0.03, 0.03, 0.07, 0, 0.045, 0.2, 0, 0, PI / 2, 10);
  K.rod('metal', S.steel, [0, 0.05, 0.22], [0, 0.07, -0.32], 0.012, 6);
  K.extrude('metal', S.steel, [[0, 0], [0.2, -0.14], [0.06, -0.02], [0, -0.2], [-0.06, -0.02], [-0.2, -0.14]], 0.012, mat4(0, 0.04, 0.3, PI / 2 + 0.5, 0, 0));
  K.tube('metal', S.steel, [[0, 0.07, -0.32], [0, 0.06, -0.5], [0, 0.03, -0.62]], 0.008, { seg: 5 });
  return K;
}
// navigation lights on the bow (red port, green starboard). Registers 'lightSide' anchors.
export function sideLights(K, H, u = 0.9, o = {}) {
  K.mirror((sx) => { const hb = Math.max(0.04, H.halfBeam(u) - (o.inset ?? 0.05)), y = H.sheerY(u) + (o.dy ?? 0.02), z = H.zOf(u);
    K.rbox('metal', S.steel, 0.05, 0.03, 0.08, 0.008, hb, y + 0.015, z); K.at(hb, y + 0.03, z, () => K.sphere('lamp', sx > 0 ? S.red : S.green, 0.022, 0, 0.004, 0.01, 1, 0.8, 1.3, 10));
    K.anchor('lightSide', hb, y + 0.04, z, { color: sx > 0 ? 'red' : 'green' }); });
  return K;
}
// white stern / all-round light on a folding pole
export function sternLight(K, x, y, z, h = 1.1) { K.cyl('metal', S.steel, 0.011, 0.013, h, x, y + h / 2, z, 0, 0, 0, 8); K.cyl('metal', S.steel, 0.022, 0.026, 0.03, x, y + 0.015, z, 0, 0, 0, 10); K.cyl('lamp', S.white, 0.02, 0.02, 0.045, x, y + h + 0.02, z, 0, 0, 0, 10); K.anchor('lightAllRound', x, y + h + 0.02, z); return K; }
// underwater LED lights on the transom (lit at night). zT = transom z, y below the waterline
export function underwaterLights(K, xs, y, zT, slot = S.blue) { for (const x of xs) { K.cyl('metal', S.steel, 0.04, 0.04, 0.012, x, y, zT - 0.006, PI / 2, 0, 0, 12); K.cyl('lamp', slot, 0.03, 0.03, 0.006, x, y, zT - 0.014, PI / 2, 0, 0, 12); K.anchor('lightUnderwater', x, y, zT - 0.05, {}); } return K; }
// trim tabs at the bottom of the transom
export function trimTabs(K, H, o = {}) { const s0 = H.st[0], w = o.w ?? 0.3; K.mirror((sx) => { const x = s0.hb * 0.62, y = (H.chineY(0) ?? s0.yk) - 0.02 + 0.0; K.rbox('metal', S.steel, w, 0.006, 0.22, 0.002, x, lerp(s0.yk, y, 0.62), s0.z - 0.11, 0.03, 0, -Math.atan2(y - s0.yk, s0.hb * 0.93)); K.rod('metal', S.steel, [x, lerp(s0.yk, y, 0.62) + 0.01, s0.z - 0.14], [x, lerp(s0.yk, y, 0.62) + 0.2, s0.z - 0.01], 0.012, 6); }); return K; }
// folding swim ladder on the transom / platform. Origin: hinge at deck level; hangs down aft (-Z).
export function swimLadder(K, o = {}) { const w = o.w ?? 0.3, n = o.steps ?? 3, m = 'metal'; K.mirror((sx) => K.tube(m, S.steel, [[sx * w / 2, 0.02, 0.1], [sx * w / 2, 0.03, -0.04], [sx * w / 2, -0.1, -0.09], [sx * w / 2, -0.28 * n, -0.1]], 0.012, { fillet: 0.04, seg: 6 })); for (let i = 1; i <= n; i++) { K.rod(m, S.steel, [-w / 2, -0.27 * i, -0.1], [w / 2, -0.27 * i, -0.1], 0.011, 6); K.rbox('matte', S.black, w - 0.04, 0.012, 0.04, 0.004, 0, -0.27 * i + 0.012, -0.1); } K.anchor('ladder', 0, 0, -0.1, {}); return K; }
// life ring with reflective bands. Origin: center; ring lies in local XY.
export function lifeRing(K, R = 0.3, slot = S.orange) { K.torus('matte', slot, R, R * 0.2, 0, 0, 0, 0, 0, 0, 24, 10); for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2 + PI / 4; K.with(mat4(Math.cos(a) * R, Math.sin(a) * R, 0, 0, 0, a + PI / 2), () => K.torus('matte', S.white, R * 0.215, R * 0.045, 0, 0, 0, 0, PI / 2, 0, 12, 5)); } K.tube('matte', S.white, [[R * 1.2, 0, 0], [0, R * 1.2, 0], [-R * 1.2, 0, 0], [0, -R * 1.2, 0]], 0.006, { closed: true, tension: 0.5, seg: 4 }); return K; }
// small fire extinguisher. Origin: bottom center.
export function extinguisher(K) { K.cyl('gel', S.red, 0.04, 0.04, 0.26, 0, 0.13, 0, 0, 0, 0, 12); K.sphere('gel', S.red, 0.04, 0, 0.26, 0, 1, 0.6, 1, 10); K.cyl('metal', S.steel, 0.014, 0.014, 0.05, 0, 0.3, 0, 0, 0, 0, 8); K.rbox('matte', S.black, 0.02, 0.02, 0.09, 0.005, 0, 0.33, 0.03); return K; }
// scuba tank with boot and valve. Origin: bottom center.
export function diveTank(K, slot = S.yellow) { K.cyl('gel', slot, 0.09, 0.09, 0.58, 0, 0.33, 0, 0, 0, 0, 14); K.sphere('gel', slot, 0.09, 0, 0.62, 0, 1, 0.7, 1, 12); K.cyl('matte', S.black, 0.095, 0.095, 0.09, 0, 0.045, 0, 0, 0, 0, 14); K.cyl('metal', S.steel, 0.02, 0.025, 0.06, 0, 0.7, 0, 0, 0, 0, 8); K.rbox('metal', S.steel, 0.09, 0.03, 0.035, 0.008, 0, 0.74, 0); K.cyl('matte', S.black, 0.018, 0.018, 0.03, 0.055, 0.74, 0, 0, 0, PI / 2, 8); return K; }
// VHF whip antenna on a ratchet mount. Origin: mount.
export function antenna(K, len = 2.4, rx = -0.15, rz = 0) { K.cyl('metal', S.steel, 0.018, 0.022, 0.05, 0, 0.025, 0, 0, 0, 0, 8); K.at(0, 0.05, 0, () => K.cyl('gel', S.white, 0.004, 0.011, len, 0, len / 2, 0, 0, 0, 0, 6), rx, 0, rz); return K; }
// closed-dome radar. Origin: base center.
export function radarDome(K, r = 0.3) { K.lathe('gel', S.white, [[0.001, 0], [r * 0.87, 0.01], [r, r * 0.23], [r * 0.9, r * 0.47], [r * 0.4, r * 0.63], [0.001, r * 0.66]], 0, 0, 0, 0, 0, 0, 20); return K; }
// trumpet horns. Origin: mount; point +Z.
export function horns(K) { for (const [x, l] of [[0.035, 0.34], [-0.035, 0.27]]) { K.lathe('metal', S.steel, [[0.012, 0], [0.014, l * 0.6], [0.03, l * 0.9], [0.05, l]], x, 0.03, 0, PI / 2, 0, 0, 12); } K.rbox('metal', S.steel, 0.12, 0.03, 0.06, 0.008, 0, 0.012, 0.02); return K; }
// spotlight on a yoke. Origin: base.
export function spotlight(K, o = {}) { K.cyl('metal', S.steel, 0.03, 0.04, 0.05, 0, 0.025, 0, 0, 0, 0, 10); K.at(0, 0.12, 0, () => { K.cyl('gel', o.slot ?? S.white, 0.075, 0.06, 0.13, 0, 0, 0, PI / 2, 0, 0, 14); K.cyl('lamp', S.white, 0.068, 0.068, 0.01, 0, 0, 0.066, PI / 2, 0, 0, 14); }, o.rx ?? -0.1, o.ry ?? 0, 0); return K; }
// emergency light bar (alternating segments flash through beaconA / beaconB). Origin: mount center.
export function lightBar(K, w = 1.1, o = {}) { K.rbox('matte', S.black, w, 0.03, 0.2, 0.01, 0, 0.015, 0); const n = 6, sw = (w - 0.06) / n; for (let i = 0; i < n; i++) K.rbox(i % 2 ? 'beaconB' : 'beaconA', (o.colors || [S.blue, S.blue, S.white, S.white, S.red, S.red])[i] ?? S.blue, sw - 0.012, 0.075, 0.17, 0.02, -w / 2 + 0.03 + sw * (i + 0.5), 0.07, 0); K.anchor('beacon', 0, 0.1, 0, { w }); return K; }
// small flag on a staff. kind: 'dive' | 'solid'. Origin: staff base.
export function flagStaff(K, h = 0.9, kind = 'solid', slot = S.red) { K.cyl('metal', S.steel, 0.008, 0.01, h, 0, h / 2, 0, 0, 0, 0, 6); const fw = 0.42, fh = 0.3, y = h - fh / 2 - 0.02; K.box('matte', slot, 0.004, fh, fw, 0, y, -fw / 2 - 0.01); if (kind === 'dive') { for (const sx of [1, -1]) K.box('matte', S.white, 0.002, 0.07, Math.hypot(fw, fh), sx * 0.004, y, -fw / 2 - 0.01, Math.atan2(fh, fw)); } return K; }
// transom name + hailing port, registration numbers on both bows, builder badge aft. id.decalRects comes from paintDecals.
export function hullLettering(K, H, rects, o = {}) {
  if (!rects) return K; const s0 = H.st[0], zT = s0.z - 0.006;
  // decal strip conforming to the topsides between stations (reads left to right from outside)
  const strip = (r, side, uc, yc, h) => { const wM = Math.min(o.maxLen ?? H.L * 0.3, h * r.aspect), du = wM / H.L, n = 6, [u0, v0, u1, v1] = r.uv;
    for (let i = 0; i < n; i++) { const ta = i / n, tb = (i + 1) / n; const ua = side > 0 ? uc + du / 2 - ta * du : uc - du / 2 + ta * du, ub = side > 0 ? uc + du / 2 - tb * du : uc - du / 2 + tb * du;
      const P = (u, y) => [side * (H.half(u, y) + 0.005), y, H.zOf(u)];
      K.quad('decal', S.white, P(ua, yc - h / 2), P(ub, yc - h / 2), P(ub, yc + h / 2), P(ua, yc + h / 2), [lerp(u0, u1, ta), v0, lerp(u0, u1, tb), v1]); } };
  if (rects.name && o.name !== false) { const r = rects.name, yT = s0.ys - (o.nameDrop ?? 0.16), h = Math.min(o.nameH ?? 0.2, (s0.ys - 0.12) * 0.42), w = Math.min(s0.hb * 1.7, h * r.aspect), hh = w / r.aspect, yc = yT - hh / 2;
    if (o.nameOn === 'sides') { for (const sd of [1, -1]) strip(r, sd, o.nameU ?? 0.22, o.nameY ?? (H.sheerY(0.22) * 0.6), o.nameH ?? 0.2); }
    else { K.quad('decal', S.white, [w / 2, yc - hh / 2, zT], [-w / 2, yc - hh / 2, zT], [-w / 2, yc + hh / 2, zT], [w / 2, yc + hh / 2, zT], r.uv);
      if (rects.port) { const p = rects.port, ph = hh * 0.36, pw = Math.min(w * 0.8, ph * p.aspect), py = yc - hh / 2 - ph * 0.75; K.quad('decal', S.white, [pw / 2, py - ph / 2, zT], [-pw / 2, py - ph / 2, zT], [-pw / 2, py + ph / 2, zT], [pw / 2, py + ph / 2, zT], p.uv); } } }
  if (rects.reg && o.reg !== false) for (const sd of [1, -1]) strip(rects.reg, sd, o.regU ?? 0.74, o.regY ?? lerp(0.16, H.sheerY(0.74), 0.55), o.regH ?? 0.085);
  if (rects.builder && o.builder !== false) for (const sd of [1, -1]) strip(rects.builder, sd, o.builderU ?? 0.16, o.builderY ?? lerp(0.16, H.sheerY(0.16), 0.5), o.builderH ?? 0.1);
  if (rects.logo && o.builder !== false) for (const sd of [1, -1]) { const hB = o.builderH ?? 0.1, uB = o.builderU ?? 0.16, yB = o.builderY ?? lerp(0.16, H.sheerY(uB), 0.5), wB = hB * (rects.builder?.aspect || 4); strip(rects.logo, sd, uB + sd * (Math.min(o.maxLen ?? H.L * 0.3, wB) / 2 + hB * 1.1) / H.L, yB, hB * 1.7); }
  if (rects.model && o.model !== false) for (const sd of [1, -1]) strip(rects.model, sd, o.modelU ?? (o.builderU ?? 0.16), (o.builderY ?? lerp(0.16, H.sheerY(o.builderU ?? 0.16), 0.5)) - (o.builderH ?? 0.1) * 0.95, (o.builderH ?? 0.1) * 0.55);
  if (rects.dealer && o.dealer !== false) { const r = rects.dealer, h = 0.05, w = h * r.aspect, x = -s0.hb * 0.55, y = 0.16; K.quad('decal', S.white, [x + w / 2, y - h / 2, zT], [x - w / 2, y - h / 2, zT], [x - w / 2, y + h / 2, zT], [x + w / 2, y + h / 2, zT], r.uv); }
  if (rects.big && o.big) for (const sd of [1, -1]) strip(rects.big, sd, o.big.u ?? 0.45, o.big.y ?? H.sheerY(0.45) * 0.55, o.big.h ?? 0.3);
  return K;
}

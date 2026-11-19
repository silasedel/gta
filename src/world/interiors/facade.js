// Storefront: the lot's street wall. Piers, bulkhead, mullioned glazing you can see through both ways, transoms, the entrance,
// an optional walk-up service window (ventanita), sign band, awning and night light spill.
// Built from plan.front (see Plan.storefront). Registers glazing as daylight emitters for the bake (ctx.windows).
import * as THREE from 'three';
import { scallopAwning } from './frontDress.js';
const FLAT_AWNING = /[?&]shops=0\b/.test(globalThis.location?.search || ''); // shops pass A/B: ?shops=0 = the old flat awning, no front dressing

export const FACADE_STYLES = {
  aluminum: {
    frame: '#b9bcc0',
    metal: 0.8,
    bulk: ['ceramic', { c: [196, 200, 204] }],
    pier: ['stucco', {}],
    bay: 1.5,
    transom: true,
  },
  bronze: {
    frame: '#3a2f26',
    metal: 0.7,
    bulk: ['brick', { c: [120, 66, 50] }],
    pier: ['brick', { c: [120, 66, 50] }],
    bay: 1.3,
    transom: true,
  },
  black: {
    frame: '#16171a',
    metal: 0.6,
    bulk: ['steel', { c: [40, 42, 46] }],
    pier: ['stucco', { c: [226, 224, 220] }],
    bay: 0.95,
    transom: true,
    grid: true,
  },
  wood: {
    frame: '#f0ead8',
    metal: 0,
    bulk: ['woodPanel', { c: [64, 96, 88] }],
    pier: ['stucco', {}],
    bay: 1.2,
    transom: false,
    wood: true,
  },
  tile: {
    frame: '#c9ccd0',
    metal: 0.8,
    bulk: ['subway', { c: [70, 130, 140] }],
    pier: ['subway', { c: [236, 232, 220] }],
    bay: 1.6,
    transom: true,
  },
  block: {
    frame: '#8d9196',
    metal: 0.7,
    bulk: ['cmu', { c: [208, 204, 194] }],
    pier: ['cmu', { c: [208, 204, 194] }],
    bay: 1.7,
    transom: false,
    bars: true,
  },
};

export function prepareFront(plan) {
  // called before plan.finalize(): turns the storefront door into a plan door on the front wall
  const F = plan.front || plan.storefront();
  const room =
    plan.rooms.filter(
      (r) =>
        r.level === 0 &&
        Math.abs(r.z1 - plan.lot.z1) < 0.03 &&
        F.door.x >= r.x0 &&
        F.door.x <= r.x1,
    )[0] || plan.rooms.find((r) => r.level === 0 && Math.abs(r.z1 - plan.lot.z1) < 0.03);
  F.room = room;
  if (F.door.kind === 'none' || !room) return;
  const pier = F.pier ?? 0.3,
    dw = (F.door.w = Math.min(F.door.w, plan.W - 2 * pier - 0.3));
  F.door.x = Math.max(
    -plan.W / 2 + pier + dw / 2 + 0.05,
    Math.min(plan.W / 2 - pier - dw / 2 - 0.05, F.door.x),
  );
  F.doorDef = {
    a: room.id,
    b: 'outside:front',
    kind: F.door.kind,
    w: dw,
    h: F.door.h,
    atX: F.door.x,
    glass: true,
    frontDoor: true,
    sign: false,
    frame: F.frameC || (FACADE_STYLES[F.style] || FACADE_STYLES.aluminum).frame,
  };
  plan.doors.push(F.doorDef);
}

export function buildFacade(ctx) {
  const { G, M, plan, profile, R } = ctx,
    F = plan.front,
    st = { ...(FACADE_STYLES[F.style] || FACADE_STYLES.aluminum), ...(F.over || {}) };
  const W = plan.W,
    H = plan.H,
    zl = plan.lot.z1,
    zf = zl - 0.06,
    y0 = 0.02,
    wear = profile.wear;
  const fr = M.flat(F.frameC || st.frame, { rough: st.wood ? 0.6 : 0.35, metal: st.metal }),
    glass = M.glass({ opacity: F.tintGlass ? 0.3 : 0.13, tint: F.tintGlass || '#cfe3e6' });
  const extM = (spec) =>
    M.surf(spec[0], {
      ...(spec[1] || {}),
      wear,
      ...(F.extC && spec[0] === 'stucco' ? { c: F.extC } : {}),
    });
  const pierM = extM(F.pierSurf || st.pier),
    bulkM = extM(F.bulkSurf || st.bulk),
    room = F.room || plan.rooms[0];
  const inW = room.wall || profile.wall,
    inM = M.surf(inW.surf[0], { ...(inW.surf[1] || {}), wear });
  const fascia = F.fascia ?? Math.max(0.5, Math.min(1.1, H - 2.75)),
    gh = H - fascia,
    bulk = F.bulkhead,
    pier = F.pier ?? 0.3,
    dh = Math.min(F.door.h, gh - 0.12);
  const col = (x0, x1, ya, yb, t = 0.12, zc = zl - 0.11) =>
    ctx.colliders.push([(x0 + x1) / 2, (ya + yb) / 2, zc, (x1 - x0) / 2, (yb - ya) / 2, t]);
  const occ = (x0, x1, ya, yb) => ctx.occ.push(x0, ya, zl - 0.22, x1, yb, zl + 0.05);
  const solid = (x0, x1, ya, yb, mat) => {
    if (x1 - x0 < 0.01) return;
    G.box(mat, (x0 + x1) / 2, (ya + yb) / 2, zl - 0.095, x1 - x0, yb - ya, 0.25);
    G.plane(inM, (x0 + x1) / 2, (ya + yb) / 2, zl - 0.222, x1 - x0, yb - ya, {
      ry: Math.PI,
      step: 0.45,
    });
    col(x0, x1, ya, yb);
    occ(x0, x1, ya, yb);
  };
  // ---- segments along the frontage
  const segs = [
    { x0: -W / 2, x1: -W / 2 + pier, t: 'pier' },
    { x0: W / 2 - pier, x1: W / 2, t: 'pier' },
  ];
  if (F.doorDef) {
    const dw = F.door.w,
      dx = F.door.x;
    segs.push({ x0: dx - dw / 2 - 0.05, x1: dx + dw / 2 + 0.05, t: 'door' });
  }
  if (F.walkup) {
    const w = F.walkup;
    segs.push({ x0: w.x - w.w / 2, x1: w.x + w.w / 2, t: 'walkup', o: w });
  }
  for (const [a, b] of F.solid || [])
    segs.push({ x0: Math.max(-W / 2 + pier, a), x1: Math.min(W / 2 - pier, b), t: 'solid' });
  segs.sort((p, q) => p.x0 - q.x0);
  const all = [];
  let cx = -W / 2;
  for (const s of segs) {
    if (s.x0 - cx > 0.25) all.push({ x0: cx, x1: s.x0, t: 'glass' });
    else if (s.x0 > cx) s.x0 = cx;
    all.push(s);
    cx = Math.max(cx, s.x1);
  }
  if (W / 2 - cx > 0.25) all.push({ x0: cx, x1: W / 2, t: 'glass' });
  const windows = ctx.windows,
    glazed = [];
  for (const s of all) {
    const w = s.x1 - s.x0,
      mx = (s.x0 + s.x1) / 2;
    if (s.t === 'pier' || s.t === 'solid') {
      solid(s.x0, s.x1, y0, gh, pierM);
      continue;
    }
    if (s.t === 'door') {
      // frame posts + transom over the leaves; the leaves come from doors.js
      G.boxB(fr, s.x0 + 0.025, y0, zf, 0.05, gh - y0, 0.11);
      G.boxB(fr, s.x1 - 0.025, y0, zf, 0.05, gh - y0, 0.11);
      G.box(fr, mx, dh + 0.06, zf, w, 0.08, 0.11);
      if (gh - dh > 0.3) {
        G.box(glass, mx, (dh + 0.1 + gh) / 2, zf, w - 0.1, gh - dh - 0.14, 0.012);
        col(s.x0, s.x1, dh + 0.1, gh, 0.03, zf);
        windows.push({ x: mx, y: (dh + gh) / 2, z: zf - 0.05, w: w - 0.1, h: gh - dh - 0.14 });
      }
      windows.push({
        x: mx,
        y: (y0 + dh) / 2 + 0.1,
        z: zf - 0.05,
        w: w - 0.2,
        h: dh - 0.3,
        door: true,
      });
      col(s.x0, s.x0 + 0.05, y0, gh, 0.055, zf);
      col(s.x1 - 0.05, s.x1, y0, gh, 0.055, zf);
      continue;
    }
    if (s.t === 'walkup') {
      const o = s.o,
        sill = o.sill ?? 1.05,
        top = Math.min(gh, sill + (o.h ?? 1.15)),
        cm = M.surf(o.counter?.[0] || 'terrazzo', { ...(o.counter?.[1] || {}), wear });
      G.box(bulkM, mx, (y0 + sill) / 2, zl - 0.095, w, sill - y0, 0.25);
      G.plane(inM, mx, (y0 + sill) / 2, zl - 0.222, w, sill - y0, { ry: Math.PI, step: 0.45 });
      col(s.x0, s.x1, y0, sill);
      occ(s.x0, s.x1, y0, sill);
      G.box(cm, mx, sill + 0.02, zl + 0.03, w + 0.1, 0.045, 0.62);
      ctx.colliders.push([mx, sill + 0.02, zl + 0.03, w / 2 + 0.05, 0.03, 0.31]);
      G.boxB(fr, s.x0 + 0.025, sill, zf, 0.05, top - sill, 0.1);
      G.boxB(fr, s.x1 - 0.025, sill, zf, 0.05, top - sill, 0.1);
      G.box(fr, mx, top + 0.02, zf, w, 0.05, 0.1);
      G.box(
        glass,
        s.x0 + w * 0.27,
        (sill + top) / 2 + 0.02,
        zf - 0.02,
        w * 0.5 - 0.06,
        top - sill - 0.08,
        0.01,
      );
      G.box(fr, s.x0 + w * 0.52, (sill + top) / 2, zf - 0.02, 0.035, top - sill, 0.03); // sash slid half open
      if (gh - top > 0.2) solid(s.x0, s.x1, top + 0.045, gh, pierM);
      col(s.x0, s.x1, sill + 0.05, top, 0.02, zf);
      windows.push({
        x: mx,
        y: (sill + top) / 2,
        z: zf - 0.05,
        w: w - 0.1,
        h: top - sill,
        open: true,
      });
      F.walkup.built = { x: mx, w, sill, top, zIn: zl - 0.35, zOut: zl + 0.75 };
      continue;
    }
    // glazing bays
    const n = Math.max(1, Math.round(w / st.bay)),
      bw = w / n,
      tr = (F.transom ?? st.transom) && gh - dh > 0.35 ? dh + 0.06 : 0;
    G.box(bulkM, mx, (y0 + bulk) / 2, zl - 0.095, w, bulk - y0, 0.25);
    G.plane(inM, mx, (y0 + bulk) / 2, zl - 0.222, w, bulk - y0, { ry: Math.PI, step: 0.45 });
    G.box(fr, mx, bulk + 0.02, zf, w, 0.045, 0.2);
    col(s.x0, s.x1, y0, bulk);
    occ(s.x0, s.x1, y0, bulk);
    G.box(fr, mx, gh - 0.03, zf, w, 0.06, 0.11);
    if (tr) G.box(fr, mx, tr, zf, w, 0.05, 0.11);
    for (let i = 0; i <= n; i++)
      G.boxB(fr, s.x0 + i * bw, bulk, zf, i === 0 || i === n ? 0.06 : 0.05, gh - bulk, 0.11);
    for (let i = 0; i < n; i++) {
      const bx = s.x0 + (i + 0.5) * bw;
      G.box(glass, bx, (bulk + 0.04 + gh - 0.06) / 2, zf, bw - 0.05, gh - bulk - 0.1, 0.012);
      windows.push({ x: bx, y: (bulk + gh) / 2, z: zf - 0.05, w: bw - 0.06, h: gh - bulk - 0.1 });
      glazed.push({ x: bx, w: bw - 0.06, y0: bulk + 0.05, y1: tr ? tr - 0.03 : gh - 0.06 });
      if (st.grid) {
        G.box(fr, bx, bulk + (gh - bulk) * 0.36, zf, bw, 0.035, 0.07);
      }
      if (st.bars || F.bars)
        for (let k = 1; k < 5; k++)
          G.cylB(
            M.flat('#22242a', { rough: 0.5, metal: 0.6 }),
            bx - bw / 2 + (k * bw) / 5,
            bulk + 0.04,
            zf + 0.07,
            0.009,
            gh - bulk - 0.1,
            { seg: 6 },
          );
    }
    col(s.x0, s.x1, bulk, gh, 0.03, zf);
  }
  // fascia / sign band above the glazing (exterior face carries the sign)
  const fasM = extM(F.fasciaSurf || st.pier);
  G.box(fasM, 0, (gh + H) / 2, zl - 0.095, W, H - gh, 0.25);
  G.plane(inM, 0, (gh + H) / 2, zl - 0.222, W, H - gh, { ry: Math.PI, step: 0.45 });
  col(-W / 2, W / 2, gh, H);
  occ(-W / 2, W / 2, gh, H);
  // awning
  if (F.awning && ctx.store?.sf?.shellAwning && !FLAT_AWNING) F.awning = null; // shops pass: the city shell already hangs an awning on this lot
  if (F.awning) {
    const a = F.awning,
      aw = a.w || W - 0.4,
      ax = a.x || 0,
      drop = a.drop ?? 0.7,
      out = a.out ?? 1.1,
      ay = a.y ?? gh + 0.1;
    if (a.type === 'canopy') {
      const cm = M.flat(a.c || '#2c2f33', { rough: 0.5, metal: 0.6 });
      G.box(cm, ax, ay, zl + out / 2 + 0.03, aw, 0.12, out);
      G.box(M.glow('#fff1d0', 1.6, 0), ax, ay - 0.065, zl + out / 2, aw - 0.4, 0.01, 0.08);
      for (const sx of [-1, 1])
        G.cyl(
          cm,
          ax + sx * (aw / 2 - 0.2),
          ay + 0.3,
          zl + out * 0.5,
          0.012,
          Math.hypot(out * 0.9, 0.6),
          { rx: -Math.atan2(out * 0.9, 0.6), seg: 6 },
        );
    } else if (!FLAT_AWNING) {
      const fab = ctx.prints
        ? ctx.prints.stripes(
            a.c || profile.accent,
            a.c2 || '#f4efe2',
            a.stripes ?? Math.max(6, Math.round(aw / 0.32)),
          )
        : null; // shops pass: 3D canvas (sag, scalloped valance, cheeks, frame)
      scallopAwning(ctx, {
        x: ax,
        w: aw,
        y: a.y ?? gh + 0.1,
        out: a.out ?? 1.25,
        drop: a.drop ?? 0.75,
        z: zl,
        fab,
        mat: M.surf('fabric', { c: a.c || [160, 40, 40] }),
      });
    } else {
      const fab = ctx.prints
          ? ctx.prints.stripes(a.c || profile.accent, a.c2 || '#f4efe2', a.stripes ?? 8)
          : null,
        fm2 = fab ? fab.mat : M.surf('fabric', { c: a.c || [160, 40, 40] }),
        len = Math.hypot(out, drop),
        ang = Math.atan2(drop, out);
      G.plane(fm2, ax, ay - drop / 2, zl + out / 2 + 0.03, aw, len, {
        rx: -Math.PI / 2 + ang,
        uvRect: fab?.rect,
      });
      G.plane(fm2, ax, ay - drop / 2, zl + out / 2 + 0.03, aw, len, {
        rx: Math.PI / 2 + ang,
        ry: 0,
        uvRect: fab?.rect,
      });
      G.plane(fm2, ax, ay - drop - 0.1, zl + out + 0.03, aw, 0.2, { uvRect: fab?.rect });
      G.plane(fm2, ax, ay - drop - 0.1, zl + out + 0.028, aw, 0.2, {
        ry: Math.PI,
        uvRect: fab?.rect,
      });
      const pm = M.flat('#d8dadc', { rough: 0.4, metal: 0.7 });
      for (const sx of [-1, 1]) {
        G.cyl(pm, ax + (sx * aw) / 2, ay - drop / 2, zl + out / 2 + 0.03, 0.012, len, {
          rx: Math.PI / 2 - ang,
          seg: 6,
        });
        G.cyl(pm, ax + (sx * aw) / 2, ay - drop, zl + out / 2 + 0.03, 0.012, out, {
          rx: Math.PI / 2,
          seg: 6,
        });
      }
    }
  }
  // threshold + entry mat
  if (F.doorDef) {
    G.box(M.surf('steel', { wear: 0.6 }), F.door.x, y0 + 0.004, zl - 0.1, F.door.w, 0.012, 0.3);
    G.box(
      M.surf('rubber', { c: F.matC || [30, 30, 34] }),
      F.door.x,
      y0 + 0.008,
      zl - 1.0,
      Math.min(F.door.w + 0.4, 2.4),
      0.014,
      1.3,
    );
  }
  // night light spill onto the sidewalk (additive gradient, driven by lighting.js through ctx.spill)
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 3, 5.5),
    new THREE.MeshBasicMaterial({
      map: spillTex(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0x000000,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.035, zl + 2.75);
  spill.renderOrder = 3;
  spill.matrixAutoUpdate = false;
  spill.updateMatrix();
  ctx.group.add(spill);
  ctx.spill = spill;
  ctx.disposables.push(spill.geometry, spill.material);
  return { gh, fascia, glazed, zl, bulk, dh, st, pierM, fasM, frM: fr };
}
let SPILL = null;
function spillTex() {
  if (SPILL) return SPILL;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const u = Math.abs(x / 127 - 0.5) * 2,
        v = y / 127,
        a = Math.max(0, 1 - u * u * u) * Math.pow(1 - v, 1.6) * (0.9 + 0.1 * Math.sin(x * 0.8));
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * a;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  SPILL = new THREE.CanvasTexture(c);
  return SPILL;
}

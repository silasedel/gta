// Service truck liveries (made-up companies only): canvas-painted lettering, logos, reflective chevrons and grime, drawn as
// decal planes on the measured flat panels of the converted models (truck12 rollback tow truck, truck13 front-load packer).
// Textures and materials are shared per (company, panel); a truck adds 5-8 small meshes to its LOD0 / LOD1 groups.
import * as THREE from 'three';

// ---------------------------------------------------------------- companies (chosen from the rolled paint color)
const lum = (hex) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const hueOf = (hex) => {
  const c = new THREE.Color(hex),
    h = {};
  c.getHSL(h);
  return h;
};
export function companyFor(key, color) {
  const L = lum(color),
    h = hueOf(color);
  if (key === 'truck13') {
    if (h.s > 0.2 && h.h > 0.2 && h.h < 0.5) return GARBAGE.coral; // green trucks
    return GARBAGE.city;
  }
  if (L > 0.6) return TOW.gator; // white
  if (h.s > 0.4 && (h.h < 0.05 || h.h > 0.93)) return TOW.bayside; // red
  if (h.s > 0.4 && h.h > 0.08 && h.h < 0.2) return TOW.sunshine; // yellow
  return TOW.midnight; // black / dark
}
const GARBAGE = {
  coral: {
    id: 'coral',
    name: ['CORAL COAST', 'WASTE'],
    tag: 'RESIDENTIAL · COMMERCIAL · RECYCLING',
    phone: '(305) 555-0144',
    ink: '#f4f1e6',
    accent: '#8fd14f',
    accent2: '#2f8fb0',
    logo: 'wave',
    grime: 0.75,
  },
  city: {
    id: 'city',
    name: ['CITY OF SOUTHLINE', 'SOLID WASTE'],
    tag: 'KEEP SOUTHLINE CLEAN',
    phone: 'CALL 311',
    ink: '#163e73',
    accent: '#2a8a3e',
    accent2: '#163e73',
    logo: 'palm',
    grime: 0.85,
  },
};
const TOW = {
  gator: {
    id: 'gator',
    name: ['GATOR LINE', 'TOWING & RECOVERY'],
    tag: '24 HR · LIGHT & MEDIUM DUTY · LOCKOUTS',
    phone: '(305) 555-0188',
    ink: '#161616',
    accent: '#c8141c',
    accent2: '#161616',
    logo: 'hook',
    grime: 0.45,
  },
  bayside: {
    id: 'bayside',
    name: ['BAYSIDE', 'RECOVERY'],
    tag: 'TOWING · ROADSIDE · FLATBED',
    phone: '(786) 555-0121',
    ink: '#f6f3ea',
    accent: '#151515',
    accent2: '#f6f3ea',
    logo: 'hook',
    grime: 0.45,
  },
  sunshine: {
    id: 'sunshine',
    name: ['SUNSHINE', 'TOW & TRANSPORT'],
    tag: 'SERVING DADE & MONROE · 24/7',
    phone: '(305) 555-0163',
    ink: '#141414',
    accent: '#141414',
    accent2: '#c8141c',
    logo: 'sun',
    grime: 0.5,
  },
  midnight: {
    id: 'midnight',
    name: ['MIDNIGHT', 'WRECKER CO.'],
    tag: 'ACCIDENT RECOVERY · 24 HR DISPATCH',
    phone: '(305) 555-0107',
    ink: '#e8c25a',
    accent: '#e8c25a',
    accent2: '#f2f2f2',
    logo: 'hook',
    grime: 0.4,
  },
};

// ---------------------------------------------------------------- canvas helpers
function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}
function fitText(
  g,
  s,
  maxW,
  px,
  weight = 'bold',
  fam = '"Arial Black", "Helvetica Neue", Arial, sans-serif',
) {
  let p = px;
  g.font = `${weight} ${p}px ${fam}`;
  while (g.measureText(s).width > maxW && p > 8) {
    p -= 2;
    g.font = `${weight} ${p}px ${fam}`;
  }
  return p;
}
function logo(g, kind, cx, cy, r, C) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = C.accent;
  g.beginPath();
  g.arc(0, 0, r, 0, 7);
  g.fill();
  g.lineWidth = r * 0.09;
  g.strokeStyle = C.ink;
  g.beginPath();
  g.arc(0, 0, r * 0.9, 0, 7);
  g.stroke();
  g.fillStyle = C.ink;
  g.strokeStyle = C.ink;
  if (kind === 'hook') {
    // a tow hook on a chain
    g.lineWidth = r * 0.16;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -r * 0.62);
    g.lineTo(0, r * 0.05);
    g.stroke();
    g.beginPath();
    g.arc(-r * 0.22, r * 0.12, r * 0.24, 0, Math.PI * 0.95);
    g.stroke();
    g.beginPath();
    g.arc(0, -r * 0.62, r * 0.1, 0, 7);
    g.fill();
  } else if (kind === 'wave') {
    // a curling wave over a sun
    g.beginPath();
    g.arc(r * 0.18, -r * 0.18, r * 0.3, 0, 7);
    g.fillStyle = C.accent2;
    g.fill();
    g.fillStyle = C.ink;
    g.lineWidth = r * 0.14;
    g.beginPath();
    g.moveTo(-r * 0.7, r * 0.3);
    g.bezierCurveTo(-r * 0.3, r * 0.6, r * 0.1, -r * 0.1, r * 0.7, r * 0.25);
    g.stroke();
    g.beginPath();
    g.moveTo(-r * 0.7, r * 0.6);
    g.bezierCurveTo(-r * 0.2, r * 0.8, r * 0.2, r * 0.3, r * 0.7, r * 0.55);
    g.stroke();
  } else if (kind === 'palm') {
    // a palm on a little island
    g.lineWidth = r * 0.1;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-r * 0.05, r * 0.55);
    g.quadraticCurveTo(r * 0.05, 0, r * 0.12, -r * 0.35);
    g.stroke();
    for (const a of [-2.6, -2.0, -1.2, -0.5, 0.15]) {
      g.beginPath();
      g.moveTo(r * 0.12, -r * 0.35);
      g.quadraticCurveTo(
        r * 0.12 + Math.cos(a) * r * 0.35,
        -r * 0.35 + Math.sin(a) * r * 0.45,
        r * 0.12 + Math.cos(a) * r * 0.62,
        -r * 0.35 + Math.sin(a) * r * 0.25 + r * 0.18,
      );
      g.stroke();
    }
    g.beginPath();
    g.ellipse(0, r * 0.6, r * 0.55, r * 0.12, 0, 0, 7);
    g.fill();
  } else {
    // sun
    g.beginPath();
    g.arc(0, 0, r * 0.36, 0, 7);
    g.fill();
    g.lineWidth = r * 0.09;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48);
      g.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
      g.stroke();
    }
  }
  g.restore();
}
// grime over a panel (alpha): soft dust bands at the bottom, rain streaks running down from the top edge and seams,
// a few rust weeps, scuffs and scratches.  amount 0..1
function grime(g, w, h, seed, amount, opt = {}) {
  const r = rnd(seed);
  // road grime rising from the bottom edge
  const gr = g.createLinearGradient(0, h, 0, h * (1 - (opt.bottom ?? 0.45)));
  gr.addColorStop(0, `rgba(58,48,36,${0.55 * amount})`);
  gr.addColorStop(0.45, `rgba(70,60,46,${0.22 * amount})`);
  gr.addColorStop(1, 'rgba(70,60,46,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  // mottled blotches (soft, large: no fine noise that aliases at distance)
  for (let i = 0; i < 70 * amount; i++) {
    const x = r() * w,
      y = h * (0.35 + 0.65 * Math.pow(r(), 0.6)),
      rr = (0.02 + r() * 0.06) * w;
    const rg = g.createRadialGradient(x, y, 0, x, y, rr);
    const a = (0.05 + r() * 0.09) * amount;
    rg.addColorStop(0, `rgba(52,44,34,${a})`);
    rg.addColorStop(1, 'rgba(52,44,34,0)');
    g.fillStyle = rg;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // streaks from the top edge / panel seams
  const seams = opt.seams || [];
  for (let i = 0; i < 46 * amount; i++) {
    const x =
      r() < 0.4 && seams.length ? seams[(r() * seams.length) | 0] * w + (r() - 0.5) * 10 : r() * w;
    const y0 = r() < 0.7 ? 0 : r() * h * 0.5,
      len = h * (0.15 + r() * 0.6),
      wd = 2 + r() * 7;
    const lg = g.createLinearGradient(0, y0, 0, y0 + len);
    const a = (0.08 + r() * 0.16) * amount;
    lg.addColorStop(0, `rgba(40,34,26,${a})`);
    lg.addColorStop(1, 'rgba(40,34,26,0)');
    g.fillStyle = lg;
    g.fillRect(x, y0, wd, len);
  }
  // rust weeps at bolts / the lower edge
  for (let i = 0; i < 10 * amount * (opt.rust ?? 1); i++) {
    const x = r() * w,
      y0 = r() < 0.5 ? h * (0.82 + r() * 0.15) : r() * h * 0.3,
      len = 20 + r() * 80;
    const lg = g.createLinearGradient(0, y0, 0, y0 + len);
    lg.addColorStop(0, `rgba(122,62,26,${0.4 * amount})`);
    lg.addColorStop(1, 'rgba(122,62,26,0)');
    g.fillStyle = lg;
    g.fillRect(x, y0, 2 + r() * 4, len);
    g.fillStyle = `rgba(96,48,22,${0.45 * amount})`;
    g.beginPath();
    g.arc(x + 2, y0, 2 + r() * 4, 0, 7);
    g.fill();
  }
  // scuffs and scratches (bare primer gray)
  g.lineCap = 'round';
  for (let i = 0; i < 26 * amount; i++) {
    const x = r() * w,
      y = h * (0.25 + r() * 0.75),
      L = 15 + r() * 90,
      a = (r() - 0.5) * 0.6;
    g.strokeStyle = `rgba(200,198,190,${0.18 + r() * 0.2})`;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
}

// ---------------------------------------------------------------- panel textures (cached)
const cache = new Map();
function cached(k, f) {
  if (!cache.has(k)) cache.set(k, f());
  return cache.get(k);
}
const decalMat = (map, o = {}) =>
  new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    roughness: o.rough ?? 0.42,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: o.off ?? -4,
    polygonOffsetUnits: o.off ?? -4,
    envMapIntensity: o.env ?? 0.9,
    name: o.name || 'svc-decal',
  });

// big side panel: lettering + logo + stripes (aspect = panel w / h)
function sidePanel(C, aspect, kind) {
  return cached(`side:${C.id}:${aspect.toFixed(2)}`, () => {
    const H = 512,
      W = Math.min(4096, Math.round(H * aspect));
    const [c, g] = canvas(W, H);
    if (kind === 'garbage') {
      // a two-color band along the bottom, logo left, name centered, tag + phone under it
      g.fillStyle = C.accent;
      g.fillRect(0, H * 0.8, W, H * 0.07);
      g.fillStyle = C.accent2;
      g.fillRect(0, H * 0.89, W, H * 0.035);
      const lr = H * 0.25;
      logo(g, C.logo, W * 0.06 + lr, H * 0.42, lr, C);
      const x0 = W * 0.06 + lr * 2 + W * 0.04,
        tw = W - x0 - W * 0.05;
      g.fillStyle = C.ink;
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      fitText(g, C.name[0], tw, 150);
      g.fillText(C.name[0], x0, H * 0.38);
      fitText(g, C.name[1], tw * 0.7, 120);
      g.fillStyle = C.accent;
      g.fillText(C.name[1], x0, H * 0.6);
      g.fillStyle = C.ink;
      fitText(g, C.tag, tw, 40, 'bold', 'Arial, sans-serif');
      g.fillText(C.tag, x0, H * 0.72);
      g.textAlign = 'right';
      fitText(g, C.phone, tw * 0.35, 52, 'bold', 'Arial, sans-serif');
      g.fillText(C.phone, W - W * 0.04, H * 0.6);
    } else {
      // tow: toolbox side panel under the deck (wide, short)
      g.fillStyle = C.accent;
      g.fillRect(0, H * 0.86, W, H * 0.06);
      const lr = H * 0.32;
      logo(g, C.logo, H * 0.08 + lr, H * 0.45, lr, C);
      const x0 = H * 0.16 + lr * 2,
        tw = W - x0 - H * 0.12;
      g.fillStyle = C.ink;
      g.textAlign = 'left';
      fitText(g, `${C.name[0]} ${C.name[1]}`, tw, 170);
      g.fillText(`${C.name[0]} ${C.name[1]}`, x0, H * 0.5);
      fitText(g, `${C.tag}   ${C.phone}`, tw, 70, 'bold', 'Arial, sans-serif');
      g.fillStyle = C.accent2 === C.ink ? C.accent : C.ink;
      g.fillText(`${C.tag}   ${C.phone}`, x0, H * 0.76);
    }
    return decalMat(tex(c), { name: 'svc-side' });
  });
}
function doorPanel(C, unit) {
  return cached(`door:${C.id}:${unit}`, () => {
    const W = 768,
      H = 384,
      [c, g] = canvas(W, H);
    const lr = H * 0.3;
    logo(g, C.logo, W / 2, H * 0.34, lr, C);
    g.fillStyle = C.ink;
    g.textAlign = 'center';
    fitText(g, C.name[0], W * 0.94, 92);
    g.fillText(C.name[0], W / 2, H * 0.8);
    fitText(g, C.name[1], W * 0.94, 46, 'bold', 'Arial, sans-serif');
    g.fillStyle = C.accent;
    g.fillText(C.name[1], W / 2, H * 0.93);
    g.fillStyle = C.ink;
    g.font = 'bold 30px Arial, sans-serif';
    g.textAlign = 'right';
    g.fillText(`UNIT ${unit}`, W * 0.97, H * 0.1);
    return decalMat(tex(c), { name: 'svc-door' });
  });
}
function unitPlate(C, unit) {
  return cached(`unit:${C.id}:${unit}`, () => {
    const W = 1024,
      H = 256,
      [c, g] = canvas(W, H);
    g.fillStyle = C.id === 'city' ? '#163e73' : '#1d3b22';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#d9d6cc';
    g.lineWidth = 8;
    g.strokeRect(10, 10, W - 20, H - 20);
    g.fillStyle = '#f2efe6';
    g.textAlign = 'center';
    fitText(g, `ATLAS PACKER FL  ·  UNIT ${unit}`, W * 0.9, 110);
    g.fillText(`ATLAS PACKER FL  ·  UNIT ${unit}`, W / 2, H * 0.66);
    return decalMat(tex(c), { rough: 0.35, name: 'svc-unit' });
  });
}
function grimePanel(seed, aspect, amount, seams) {
  const k = `grime:${seed % 4}:${aspect.toFixed(1)}:${amount.toFixed(2)}`;
  return cached(k, () => {
    const H = 512,
      W = Math.min(2048, Math.round(H * aspect)),
      [c, g] = canvas(W, H);
    grime(g, W, H, 1000 + (seed % 4) * 77, amount, { seams });
    return decalMat(tex(c), { rough: 0.85, off: -6, env: 0.5, name: 'svc-grime' });
  });
}
// rear: red / white reflective chevrons with a warning line (tailgate / under-ride bar)
function rearPanel(kind) {
  return cached(`rear:${kind}`, () => {
    const W = 1024,
      H = 384,
      [c, g] = canvas(W, H);
    g.save();
    g.beginPath();
    g.rect(0, H * 0.45, W, H * 0.55);
    g.clip();
    for (let i = -8; i < 20; i++) {
      g.fillStyle = i % 2 ? '#c8141c' : '#f4f2ea';
      g.beginPath();
      const x = i * 70;
      g.moveTo(x, H);
      g.lineTo(x + 70, H);
      g.lineTo(x + 70 + 120, H * 0.45);
      g.lineTo(x + 120, H * 0.45);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.fillStyle = '#f4f2ea';
    g.fillRect(W * 0.18, H * 0.04, W * 0.64, H * 0.34);
    g.strokeStyle = '#161616';
    g.lineWidth = 6;
    g.strokeRect(W * 0.18, H * 0.04, W * 0.64, H * 0.34);
    g.fillStyle = '#161616';
    g.textAlign = 'center';
    const s =
      kind === 'garbage' ? 'FREQUENT STOPS · STAY BACK 50 FT' : 'CAUTION · WIDE TURNS · STAY BACK';
    fitText(g, s, W * 0.6, 58);
    g.fillText(s, W / 2, H * 0.26);
    return decalMat(tex(c), { rough: 0.3, name: 'svc-rear' });
  });
}

// ---------------------------------------------------------------- model measurement (once per model)
const shapes = new Map();
// grid of the outer skin from the LOD1 geometry (shell space): per 0.2 m slice along z the top height; per (z, y) cell the
// outermost |x| on each side; per (x, y) cell the rearmost z
function measure(car, key) {
  if (shapes.has(key)) return shapes.get(key);
  const lv = car.lod.levels[1]?.object || car.lod.levels[0]?.object;
  if (!lv) return null;
  const pts = [];
  lv.traverse((o) => {
    if (
      !o.isMesh ||
      o.isInstancedMesh ||
      !o.geometry?.getAttribute('position') ||
      o.material?.transparent
    )
      return;
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) pts.push(p.getX(i), p.getY(i), p.getZ(i));
  });
  if (pts.length < 300) return null;
  let z0 = Infinity,
    z1 = -Infinity,
    y1 = 0;
  for (let i = 0; i < pts.length; i += 3) {
    z0 = Math.min(z0, pts[i + 2]);
    z1 = Math.max(z1, pts[i + 2]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  const D = 0.2,
    nz = Math.ceil((z1 - z0) / D) + 1,
    ny = Math.ceil(y1 / D) + 1,
    nx = 30;
  const top = new Float32Array(nz),
    side = new Float32Array(nz * ny),
    back = new Float32Array(nx * ny).fill(99);
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i],
      y = pts[i + 1],
      z = pts[i + 2],
      iz = Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / D))),
      iy = Math.min(ny - 1, Math.max(0, Math.floor(y / D)));
    if (Math.abs(x) < 1.3) top[iz] = Math.max(top[iz], y);
    side[iz * ny + iy] = Math.max(side[iz * ny + iy], Math.abs(x));
    const ix = Math.min(nx - 1, Math.floor(Math.abs(x) / 0.1));
    back[ix * ny + iy] = Math.min(back[ix * ny + iy], z);
  }
  const S = {
    z0,
    z1,
    y1,
    D,
    nz,
    ny,
    top,
    side,
    back,
    // outermost |x| over a z / y box (the panel surface the decal sits on)
    sideX(za, zb, ya, yb) {
      let m = 0;
      for (
        let iz = Math.max(0, Math.floor((za - z0) / D));
        iz <= Math.min(nz - 1, Math.floor((zb - z0) / D));
        iz++
      )
        for (
          let iy = Math.max(0, Math.floor(ya / D));
          iy <= Math.min(ny - 1, Math.floor(yb / D));
          iy++
        )
          m = Math.max(m, side[iz * ny + iy]);
      return m;
    },
    rearZ(xa, ya, yb) {
      let m = 99;
      for (let ix = 0; ix <= Math.min(nx - 1, Math.floor(xa / 0.1)); ix++)
        for (
          let iy = Math.max(0, Math.floor(ya / D));
          iy <= Math.min(ny - 1, Math.floor(yb / D));
          iy++
        )
          m = Math.min(m, back[ix * ny + iy]);
      return m;
    },
    topAt(z) {
      return top[Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / D)))];
    },
  };
  shapes.set(key, S);
  return S;
}
export const shapeOf = measure;

// ---------------------------------------------------------------- apply a livery to a built car
const _geo = new THREE.PlaneGeometry(1, 1);
function plane(mat, w, h, x, y, z, ry, order = 3) {
  const m = new THREE.Mesh(_geo, mat);
  m.scale.set(w, h, 1);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.renderOrder = order;
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.svcDecal = true;
  return m;
}
/**
 * dressService(v) -> { company } : lettering, grime and chevrons on truck12 / truck13 (idempotent per car)
 */
export function dressService(v) {
  const car = v.car,
    key = v.typeKey;
  if (!car?.lod || car._svc) return car?._svc || null;
  const S = measure(car, key);
  if (!S) return null;
  const t = v.spec,
    color = v.look?.color ?? car.paint?.color?.getHex?.() ?? 0xffffff;
  const C = companyFor(key, color),
    seed = (v.seed ?? v.id ?? 1) >>> 0,
    unit = 100 + (seed % 89);
  const L0 = car.lod.levels[0].object,
    L1 = car.lod.levels[1]?.object;
  const add = (m, far = true) => {
    L0.add(m);
    if (far && L1) L1.add(m.clone());
  };
  const seatZ = car.seats?.[0]?.z ?? t.zA - 1.2,
    seatY = car.seats?.[0]?.y ?? t.belt - 0.3;
  if (key === 'truck13') {
    // refuse body: the tall run behind the cab (top > 80 % of the roof)
    const hi = S.y1 * 0.8;
    let zb1 = -Infinity,
      zb0 = Infinity;
    for (let iz = 0; iz < S.nz; iz++)
      if (S.top[iz] > hi) {
        const z = S.z0 + (iz + 0.5) * S.D;
        if (z < seatZ - 0.4) {
          zb0 = Math.min(zb0, z);
          zb1 = Math.max(zb1, z);
        }
      }
    if (zb1 > zb0 + 2) {
      const za = zb0 + 0.55,
        zc = zb1 - 0.35,
        ya = Math.max(1.35, t.r * 2 + 0.35),
        yc = S.y1 - 0.42,
        w = zc - za,
        h = yc - ya;
      for (const sd of [1, -1]) {
        const x = S.sideX(za + 0.3, zc - 0.3, ya + 0.3, yc - 0.3) + 0.014;
        add(
          plane(
            sidePanel(C, w / (h * 0.62), 'garbage'),
            w * 0.92,
            h * 0.62,
            sd * x,
            ya + h * 0.42,
            (za + zc) / 2,
            (sd * Math.PI) / 2,
          ),
        );
        add(
          plane(
            grimePanel(seed, w / h, C.grime, [0.18, 0.5, 0.82]),
            w + 0.4,
            h + 0.25,
            sd * (x + 0.004),
            ya + h / 2 - 0.05,
            (za + zc) / 2,
            (sd * Math.PI) / 2,
            4,
          ),
        );
      }
      // tailgate: chevrons low, grime over the whole face
      const rz = S.rearZ(0.8, 0.9, 2.2) - 0.014;
      if (rz < 90) {
        add(plane(rearPanel('garbage'), 1.7, 0.64, 0, 1.25, rz, Math.PI));
        add(
          plane(grimePanel(seed + 1, 1, C.grime, [0.5]), 2.0, 2.2, 0, 2.0, rz - 0.004, Math.PI, 4),
          false,
        );
      }
    }
    // body maker's plate on the hopper wing over the source model's maker lettering (no real brands): our own unit plate
    for (const sd of [1, -1]) {
      const x = S.sideX(2.2, 2.95, 2.78, 2.98) + 0.016;
      if (x > 0.6)
        add(plane(unitPlate(C, unit), 1.02, 0.25, sd * x, 2.88, 2.58, (sd * Math.PI) / 2));
    }
    // cab doors (driver side = +X)
    for (const sd of [1, -1]) {
      const zc = seatZ + 0.05,
        yc = Math.min(seatY + 0.05, t.belt - 0.35),
        x = S.sideX(zc - 0.3, zc + 0.3, yc - 0.15, yc + 0.15) + 0.012;
      add(plane(doorPanel(C, unit), 0.86, 0.43, sd * x, yc, zc, (sd * Math.PI) / 2), true);
    }
  } else if (key === 'truck12') {
    // doors on the cab
    for (const sd of [1, -1]) {
      const zc = seatZ + 0.12,
        yc = seatY + 0.12,
        x = S.sideX(zc - 0.25, zc + 0.25, yc - 0.12, yc + 0.12) + 0.012;
      add(plane(doorPanel(C, unit), 0.9, 0.45, sd * x, yc, zc, (sd * Math.PI) / 2));
    }
    // toolbox panel under the deck between the cab and the rear tandem
    const zr = (car.wheels?.[2]?.z ?? -t.wb / 2) + 1.05,
      zf = seatZ - 1.1; // tandem front tire edge .. behind the cab
    if (zf > zr + 1) {
      const ya = 0.62,
        yc = 1.08,
        w = zf - zr,
        h = yc - ya;
      for (const sd of [1, -1]) {
        const x = S.sideX(zr + 0.2, zf - 0.2, ya + 0.08, yc - 0.08) + 0.012;
        add(
          plane(
            sidePanel(C, w / h, 'tow'),
            w,
            h,
            sd * x,
            (ya + yc) / 2,
            (zr + zf) / 2,
            (sd * Math.PI) / 2,
          ),
        );
        add(
          plane(
            grimePanel(seed, w / h, C.grime, []),
            w,
            h,
            sd * (x + 0.003),
            (ya + yc) / 2,
            (zr + zf) / 2,
            (sd * Math.PI) / 2,
            4,
          ),
          false,
        );
      }
    }
    // rear chevrons across the under-ride bar / deck end
    const rz = S.rearZ(1.0, 0.35, 0.9) - 0.014;
    if (rz < 90) add(plane(rearPanel('tow'), 1.9, 0.5, 0, 0.62, rz, Math.PI));
  }
  // painted steel that works for a living: more road dirt and some rust on the paint shader (bottoms, arches)
  const wu = car.paint?.userData?.wearUniforms?.uWear?.value;
  if (wu) {
    wu.x = Math.max(wu.x, key === 'truck13' ? 0.42 : 0.22);
    wu.y = Math.max(wu.y, key === 'truck13' ? 0.16 : 0.05);
  }
  car._svc = { company: C.id };
  return car._svc;
}

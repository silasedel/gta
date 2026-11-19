// Southline V2 yachts: procedural PBR texture lab (albedo detail + normal + roughness), generated once and shared by
// every yacht. Albedo maps are neutral "detail" maps that the material color tints, so one teak texture serves
// golden, honey and silvered decks, one weave serves every upholstery color, and so on. All tile seamlessly.
import * as THREE from 'three';

const cache = new Map();
const hash = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// tileable value noise: lattice of period (px, py)
function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    fx = x - xi,
    fy = y - yi;
  const w = (a, p) => ((a % p) + p) % p;
  const a = hash(w(xi, px), w(yi, py), s),
    b = hash(w(xi + 1, px), w(yi, py), s),
    c = hash(w(xi, px), w(yi + 1, py), s),
    d = hash(w(xi + 1, px), w(yi + 1, py), s);
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
/** fbm in 0..1 tile space; fx, fy = base lattice frequency per axis (anisotropic grain = different fx, fy). */
export function fbm(u, v, fx, fy, oct = 4, s = 1) {
  let a = 0,
    amp = 0.5,
    tot = 0;
  for (let o = 0; o < oct; o++) {
    a += amp * vnoise(u * fx, v * fy, fx, fy, s + o * 17);
    tot += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return a / tot;
}
// cellular (Worley) distance, tileable
function worley(u, v, n, s) {
  const x = u * n,
    y = v * n,
    xi = Math.floor(x),
    yi = Math.floor(y);
  let d1 = 9,
    d2 = 9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i,
        cy = yi + j,
        wx = ((cx % n) + n) % n,
        wy = ((cy % n) + n) % n;
      const px = cx + hash(wx, wy, s),
        py = cy + hash(wx, wy, s + 7),
        d = Math.hypot(px - x, py - y);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) d2 = d;
    }
  return [d1, d2];
}

/**
 * Bake a tileable PBR set. fn(u, v) -> { h (height 0..1), c (albedo detail 0..1 gray or [r,g,b]), r (roughness 0..1) }
 * Returns { map, normalMap, roughnessMap } (CanvasTextures, RepeatWrapping).
 */
export function bake(name, size, fn, o = {}) {
  if (cache.has(name)) return cache.get(name);
  const N = size,
    H = new Float32Array(N * N);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    return c;
  };
  const cA = mk(),
    cN = mk(),
    cR = mk(),
    xA = cA.getContext('2d'),
    xN = cN.getContext('2d'),
    xR = cR.getContext('2d');
  const iA = xA.createImageData(N, N),
    iN = xN.createImageData(N, N),
    iR = xR.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const p = fn((x + 0.5) / N, (y + 0.5) / N),
        k = (y * N + x) * 4;
      H[y * N + x] = p.h ?? 0.5;
      const c = p.c ?? 1,
        r = Array.isArray(c) ? c : [c, c, c];
      iA.data[k] = Math.max(0, Math.min(255, r[0] * 255));
      iA.data[k + 1] = Math.max(0, Math.min(255, r[1] * 255));
      iA.data[k + 2] = Math.max(0, Math.min(255, r[2] * 255));
      iA.data[k + 3] = 255;
      const rr = Math.max(0, Math.min(255, (p.r ?? 0.5) * 255));
      iR.data[k] = rr;
      iR.data[k + 1] = rr;
      iR.data[k + 2] = rr;
      iR.data[k + 3] = 255;
    }
  const st = ((o.normal ?? 1) * N) / 256;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const xl = H[y * N + ((x + N - 1) % N)],
        xr = H[y * N + ((x + 1) % N)],
        yu = H[((y + N - 1) % N) * N + x],
        yd = H[((y + 1) % N) * N + x];
      let nx = (xl - xr) * st,
        ny = (yd - yu) * st;
      const l = Math.hypot(nx, ny, 1);
      const k = (y * N + x) * 4;
      iN.data[k] = ((nx / l) * 0.5 + 0.5) * 255;
      iN.data[k + 1] = ((-ny / l) * 0.5 + 0.5) * 255;
      iN.data[k + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      iN.data[k + 3] = 255;
    }
  xA.putImageData(iA, 0, 0);
  xN.putImageData(iN, 0, 0);
  xR.putImageData(iR, 0, 0);
  const T = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const set = { map: T(cA, true), normalMap: T(cN, false), roughnessMap: T(cR, false) };
  cache.set(name, set);
  return set;
}

const sat = (x) => Math.max(0, Math.min(1, x));
// ---------------------------------------------------------------- the library (name -> set). `tile` = meters covered by one repeat.
export const TEX = {
  // laid teak deck: 16 planks across, black caulk seams, butt joints, fine grain along the plank
  teak: {
    tile: 0.96,
    size: 1024,
    fn: (u, v) => {
      const P = 16,
        x = u * P,
        pi = Math.floor(x),
        f = x - pi,
        seam = Math.min(f, 1 - f);
      const off = hash(pi, 3, 5),
        butt = hash(pi, 8, 2) < 0.3 && Math.abs(v - off) < 0.0035 ? 1 : 0;
      const caulk = seam < 0.045 || butt ? 1 : 0;
      const g = fbm(u, v, 96, 3, 4, 11 + pi),
        g2 = fbm(u, v, 220, 6, 2, 31),
        tone = 0.9 + 0.1 * hash(pi, 1, 9);
      const lum = sat(tone * (0.82 + 0.26 * g) - 0.08 * (g2 > 0.62 ? 1 : 0));
      return caulk
        ? { h: 0.2, c: 0.06, r: 0.62 }
        : {
            h: 0.62 + 0.14 * g + 0.05 * g2 - (seam < 0.07 ? (0.07 - seam) * 3 : 0),
            c: [lum, lum * 0.97, lum * 0.94],
            r: 0.62 + 0.25 * g2,
          };
    },
    normal: 1.6,
  },
  // margin boards / cap rails: clean straight-grain solid teak
  teakSolid: {
    tile: 0.6,
    size: 512,
    fn: (u, v) => {
      const g = fbm(u, v, 80, 2, 4, 3),
        g2 = fbm(u, v, 200, 4, 2, 8);
      const l = sat(0.78 + 0.3 * g - 0.08 * (g2 > 0.6 ? 1 : 0));
      return { h: 0.5 + 0.2 * g, c: [l, l * 0.97, l * 0.93], r: 0.5 + 0.3 * g2 };
    },
    normal: 0.8,
  },
  // straight-grain veneer (interior joinery), satin
  veneer: {
    tile: 0.9,
    size: 512,
    fn: (u, v) => {
      const w = fbm(u, v, 6, 1, 3, 2) * 0.08,
        g = fbm(u + w, v, 120, 2, 4, 5),
        ray = fbm(u, v, 40, 1, 2, 21);
      const l = sat(0.74 + 0.34 * g + 0.1 * (ray - 0.5));
      return { h: 0.5 + 0.1 * g, c: [l, l * 0.96, l * 0.92], r: 0.28 + 0.15 * g };
    },
    normal: 0.35,
  },
  // figured / burl veneer for accent panels
  burl: {
    tile: 0.7,
    size: 512,
    fn: (u, v) => {
      const a = fbm(u, v, 5, 5, 4, 3),
        b = fbm(u + a * 0.5, v + a * 0.3, 14, 14, 4, 9);
      const ring = Math.sin((b * 9 + a * 6) * Math.PI) * 0.5 + 0.5;
      const l = sat(0.62 + 0.4 * ring * b + 0.1 * a);
      return { h: 0.5, c: [l, l * 0.93, l * 0.86], r: 0.2 };
    },
    normal: 0.1,
  },
  // interior plank floor (wide boards, tight seams)
  planks: {
    tile: 1.2,
    size: 512,
    fn: (u, v) => {
      const P = 8,
        x = u * P,
        pi = Math.floor(x),
        f = x - pi,
        seam = Math.min(f, 1 - f) < 0.012;
      const g = fbm(u, v, 64, 2, 4, 3 + pi);
      const l = sat((0.8 + 0.2 * hash(pi, 1, 2)) * (0.8 + 0.3 * g));
      return seam
        ? { h: 0.3, c: 0.25, r: 0.5 }
        : { h: 0.55 + 0.05 * g, c: [l, l * 0.97, l * 0.94], r: 0.3 + 0.12 * g };
    },
    normal: 0.6,
  },
  // pebbled leather
  leather: {
    tile: 0.22,
    size: 512,
    fn: (u, v) => {
      const [d1, d2] = worley(u, v, 26, 4),
        e = sat((d2 - d1) * 3.2),
        n = fbm(u, v, 40, 40, 3, 6);
      return { h: 0.35 + 0.5 * e + 0.1 * n, c: 0.9 + 0.1 * e, r: 0.42 + 0.2 * (1 - e) };
    },
    normal: 1.2,
  },
  // marine vinyl / soft upholstery: very fine grain
  vinyl: {
    tile: 0.18,
    size: 256,
    fn: (u, v) => {
      const [d1, d2] = worley(u, v, 34, 2),
        e = sat((d2 - d1) * 2.4);
      return { h: 0.4 + 0.4 * e, c: 0.95 + 0.05 * e, r: 0.5 + 0.12 * (1 - e) };
    },
    normal: 0.55,
  },
  // woven fabric (basket weave)
  weave: {
    tile: 0.12,
    size: 512,
    fn: (u, v) => {
      const n = 24,
        x = u * n,
        y = v * n,
        xi = Math.floor(x),
        yi = Math.floor(y),
        fx = x - xi,
        fy = y - yi,
        over = (xi + yi) % 2 === 0;
      const a = Math.sin(fx * Math.PI),
        b = Math.sin(fy * Math.PI);
      const h = over ? 0.55 + 0.4 * a * (0.6 + 0.4 * b) : 0.45 + 0.4 * b * (0.6 + 0.4 * a);
      const f = fbm(u, v, 90, 90, 2, 3);
      return { h, c: 0.82 + 0.18 * h + 0.06 * (f - 0.5), r: 0.86 };
    },
    normal: 1.4,
  },
  // outdoor acrylic canvas (tight plain weave)
  canvas: {
    tile: 0.08,
    size: 256,
    fn: (u, v) => {
      const n = 40,
        a = Math.sin(u * n * Math.PI * 2) * 0.5 + 0.5,
        b = Math.sin(v * n * Math.PI * 2) * 0.5 + 0.5;
      const h = 0.5 + 0.25 * (a * b);
      return { h, c: 0.9 + 0.1 * h, r: 0.9 };
    },
    normal: 0.9,
  },
  // linen / bedding
  linen: {
    tile: 0.3,
    size: 512,
    fn: (u, v) => {
      const a = fbm(u, v, 180, 12, 2, 4),
        b = fbm(u, v, 12, 180, 2, 5),
        w = fbm(u, v, 5, 5, 3, 9);
      const h = 0.5 + 0.25 * (a - 0.5) + 0.25 * (b - 0.5) + 0.25 * (w - 0.5);
      return { h, c: 0.9 + 0.1 * (a * b), r: 0.92 };
    },
    normal: 1.0,
  },
  // towel / terry
  terry: {
    tile: 0.1,
    size: 256,
    fn: (u, v) => {
      const n = fbm(u, v, 60, 60, 3, 2);
      return { h: n, c: 0.86 + 0.14 * n, r: 0.97 };
    },
    normal: 2.2,
  },
  // cut-pile carpet
  carpet: {
    tile: 0.35,
    size: 512,
    fn: (u, v) => {
      const n = fbm(u, v, 150, 150, 2, 3),
        m = fbm(u, v, 6, 6, 3, 8);
      return { h: 0.3 + 0.7 * n, c: 0.8 + 0.2 * n + 0.08 * (m - 0.5), r: 0.97 };
    },
    normal: 1.8,
  },
  // sisal / woven rug
  sisal: {
    tile: 0.2,
    size: 512,
    fn: (u, v) => {
      const n = 30,
        y = v * n,
        yi = Math.floor(y),
        fy = y - yi,
        x = u * n * 0.5 + (yi % 2) * 0.5,
        fx = x - Math.floor(x);
      const h = Math.sin(fy * Math.PI) * (0.6 + 0.4 * Math.sin(fx * Math.PI));
      return { h, c: 0.75 + 0.25 * h, r: 0.9 };
    },
    normal: 1.6,
  },
  // veined marble / quartzite
  marble: {
    tile: 1.6,
    size: 1024,
    fn: (u, v) => {
      const w = fbm(u, v, 3, 3, 5, 4),
        w2 = fbm(u + 0.3, v + 0.7, 5, 5, 4, 12);
      const vein = Math.pow(1 - Math.abs(Math.sin((u * 3 + v * 2 + w * 3.2) * Math.PI)), 14),
        vein2 = Math.pow(1 - Math.abs(Math.sin((u * 5 - v * 4 + w2 * 4) * Math.PI)), 22);
      const cloud = fbm(u, v, 8, 8, 4, 2);
      const l = sat(0.95 - 0.55 * vein - 0.3 * vein2 + 0.08 * (cloud - 0.5));
      return { h: 0.5, c: [l, l, sat(l * 1.01)], r: 0.08 + 0.1 * vein };
    },
    normal: 0.05,
  },
  // terrazzo / speckled composite stone
  terrazzo: {
    tile: 0.8,
    size: 512,
    fn: (u, v) => {
      const [d1] = worley(u, v, 22, 3),
        [e1] = worley(u, v, 9, 14),
        chip = d1 < 0.28 ? 0.65 + 0.3 * hash(Math.floor(u * 22), Math.floor(v * 22), 2) : 1,
        big = e1 < 0.2 ? 0.55 : 1;
      return { h: 0.5, c: sat(chip * big), r: 0.16 };
    },
    normal: 0.05,
  },
  // molded diamond non-skid
  nonskid: {
    tile: 0.16,
    size: 256,
    fn: (u, v) => {
      const n = 12,
        x = (u + v) * n,
        y = (u - v) * n,
        fx = x - Math.floor(x) - 0.5,
        fy = y - Math.floor(y) - 0.5,
        d = Math.max(Math.abs(fx), Math.abs(fy));
      const h = d < 0.3 ? 0.9 - d : 0.2;
      return { h, c: 0.94 + 0.06 * h, r: 0.72 };
    },
    normal: 1.5,
  },
  // gelcoat orange peel (barely there, breaks up perfect reflections)
  peel: {
    tile: 0.5,
    size: 256,
    fn: (u, v) => ({ h: fbm(u, v, 24, 24, 2, 5), c: 1, r: 0.5 }),
    normal: 0.12,
  },
  // brushed stainless (roughness streaks)
  brushed: {
    tile: 0.3,
    size: 512,
    fn: (u, v) => {
      const g = fbm(u, v, 3, 260, 3, 2);
      return { h: 0.5 + 0.2 * (g - 0.5), c: 0.92 + 0.08 * g, r: 0.25 + 0.3 * g };
    },
    normal: 0.35,
  },
  // carbon fiber 2x2 twill
  carbon: {
    tile: 0.05,
    size: 256,
    fn: (u, v) => {
      const n = 8,
        x = Math.floor(u * n),
        y = Math.floor(v * n),
        fx = u * n - x,
        fy = v * n - y,
        k = (((x + y) % 4) + 4) % 4,
        warp = k < 2;
      const t = warp ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
      return {
        h: 0.4 + 0.4 * t,
        c: warp ? 0.55 + 0.45 * t : 0.25 + 0.3 * t,
        r: 0.2 + 0.2 * (1 - t),
      };
    },
    normal: 0.8,
  },
  // diamond-quilted upholstery
  quilt: {
    tile: 0.28,
    size: 512,
    fn: (u, v) => {
      const n = 4,
        x = (u + v) * n,
        y = (u - v) * n,
        fx = Math.abs(x - Math.floor(x) - 0.5),
        fy = Math.abs(y - Math.floor(y) - 0.5),
        d = Math.max(fx, fy),
        puff = Math.cos(fx * Math.PI) * Math.cos(fy * Math.PI);
      const [d1, d2] = worley(u, v, 30, 5),
        gr = sat((d2 - d1) * 2.5);
      return {
        h: d > 0.47 ? 0.05 : 0.3 + 0.6 * puff + 0.05 * gr,
        c: d > 0.47 ? 0.7 : 0.95 + 0.05 * gr,
        r: 0.5,
      };
    },
    normal: 2.2,
  },
  // small mosaic tile (hot tub, showers)
  mosaic: {
    tile: 0.24,
    size: 512,
    fn: (u, v) => {
      const n = 10,
        x = u * n,
        y = v * n,
        xi = Math.floor(x),
        yi = Math.floor(y),
        fx = Math.abs(x - xi - 0.5),
        fy = Math.abs(y - yi - 0.5),
        grout = Math.max(fx, fy) > 0.455;
      const t = 0.78 + 0.22 * hash(xi, yi, 4);
      return grout ? { h: 0.2, c: 0.82, r: 0.8 } : { h: 0.7, c: t, r: 0.1 };
    },
    normal: 1.0,
  },
  // rubber / EVA foam deck with grooves
  eva: {
    tile: 0.5,
    size: 256,
    fn: (u, v) => {
      const P = 8,
        f = u * P - Math.floor(u * P),
        groove = Math.min(f, 1 - f) < 0.06;
      const n = fbm(u, v, 60, 60, 2, 3);
      return groove
        ? { h: 0.15, c: 0.35, r: 0.9 }
        : { h: 0.6 + 0.1 * n, c: 0.92 + 0.08 * n, r: 0.85 };
    },
    normal: 1.4,
  },
  // painted steel / engine enamel with slight unevenness
  enamel: {
    tile: 0.6,
    size: 256,
    fn: (u, v) => {
      const n = fbm(u, v, 14, 14, 3, 7);
      return { h: n, c: 0.95 + 0.05 * n, r: 0.3 + 0.15 * n };
    },
    normal: 0.2,
  },
  // sailcloth with seams (panels)
  sail: {
    tile: 1.0,
    size: 512,
    fn: (u, v) => {
      const P = 5,
        f = v * P - Math.floor(v * P),
        seam = Math.min(f, 1 - f) < 0.012;
      const n = fbm(u, v, 120, 120, 2, 3);
      return seam ? { h: 0.7, c: 0.8, r: 0.6 } : { h: 0.5 + 0.06 * n, c: 0.95 + 0.05 * n, r: 0.55 };
    },
    normal: 0.7,
  },
  // three-strand rope lay
  rope: {
    tile: 0.06,
    size: 256,
    fn: (u, v) => {
      const t = Math.sin((u * 3 + v * 6) * Math.PI * 2) * 0.5 + 0.5;
      return { h: t, c: 0.75 + 0.25 * t, r: 0.9 };
    },
    normal: 2.0,
  },
};

/** Get (and bake on first use) a texture set by library name. */
export function tex(name) {
  const d = TEX[name];
  if (!d) return null;
  return bake(name, d.size, d.fn, { normal: d.normal });
}
/** Bake every set up front (call during loading to avoid a hitch on first sight). */
export function bakeAll() {
  for (const k of Object.keys(TEX)) tex(k);
}

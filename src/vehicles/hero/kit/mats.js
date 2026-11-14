// Hero-car material library: automotive paint (clearcoat + flake), carbon weave, glass, leather, alcantara, metals, rubber.
// All textures are generated in code (canvas), so there is nothing to license or download.
// UV convention: geometry UVs are in METERS; each texture sets its own repeat (tiles per meter).
import * as THREE from 'three';

let LIB = null;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- texture generators
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function dataTex(w, h, fill, opts = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'), img = c.createImageData(w, h);
  fill(img.data, w, h);
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.aniso ?? 8;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1] ?? opts.repeat[0]);
  return t;
}
/** Tileable normal map from a height field h(x, y) -> 0..1 sampled on a w x h grid. */
function normalFromHeight(w, h, hf, strength, opts) {
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = hf(x, y, w, h);
  return dataTex(w, h, (d) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xl = H[y * w + ((x + w - 1) % w)], xr = H[y * w + ((x + 1) % w)];
      const yu = H[((y + h - 1) % h) * w + x], yd = H[((y + 1) % h) * w + x];
      let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }, opts);
}
/** Tileable Worley noise on a jittered grid: returns fn(x, y) -> [F1, F2] in cell units. */
function worley(cells, seed) {
  const r = rng(seed), px = new Float32Array(cells * cells), py = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) { px[i] = r(); py[i] = r(); }
  return (u, v) => { // u, v in 0..1
    const x = u * cells, y = v * cells, cx = Math.floor(x), cy = Math.floor(y);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = (cx + i + cells) % cells, gy = (cy + j + cells) % cells, k = gy * cells + gx;
      const dx = cx + i + px[k] - x, dy = cy + j + py[k] - y, d = Math.hypot(dx, dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [f1, f2];
  };
}
/** Tileable value noise (bilinear, smoothed), n lattice cells. */
function valueNoise(n, seed) {
  const r = rng(seed), g = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = r();
  return (u, v) => {
    const x = u * n, y = v * n, x0 = Math.floor(x), y0 = Math.floor(y);
    let fx = x - x0, fy = y - y0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = g[(y0 % n) * n + (x0 % n)], b = g[(y0 % n) * n + ((x0 + 1) % n)], c = g[((y0 + 1) % n) * n + (x0 % n)], d = g[((y0 + 1) % n) * n + ((x0 + 1) % n)];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function makeTextures() {
  const T = {};
  // metallic flake: sparse tilted micro-facets under the clearcoat
  T.flake = (() => {
    const r = rng(7);
    return dataTex(256, 256, (d) => {
      for (let i = 0; i < 256 * 256; i++) {
        let nx = 0, ny = 0;
        if (r() < 0.42) { const a = r() * TAU, m = 0.25 + r() * 0.75; nx = Math.cos(a) * m; ny = Math.sin(a) * m; }
        const l = Math.hypot(nx, ny, 1.6);
        d[i * 4] = (nx / l * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255; d[i * 4 + 2] = (1.6 / l * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255;
      }
    }, { repeat: [34, 34], aniso: 4 });
  })();
  // 2x2 twill carbon weave: one period = 4 tows of 32 px
  const TOW = 32, CW = TOW * 4;
  const weave = (x, y) => {
    const i = Math.floor(x / TOW), j = Math.floor(y / TOW), fx = (x % TOW) / TOW, fy = (y % TOW) / TOW;
    const warp = ((i + j) & 3) < 2; // vertical tow on top
    const across = warp ? fx : fy, along = warp ? fy : fx;
    const prof = Math.sqrt(Math.max(0, 1 - (2 * across - 1) ** 2));
    return { warp, across, along, prof };
  };
  T.carbonColor = dataTex(CW, CW, (d) => {
    const r = rng(11);
    for (let y = 0; y < CW; y++) for (let x = 0; x < CW; x++) {
      const w = weave(x, y);
      const streak = 0.85 + 0.3 * Math.sin((w.across * 9 + (w.warp ? 0.3 : 0)) * TAU) * 0.5 + (r() - 0.5) * 0.12;
      let v = (w.warp ? 0.105 : 0.06) * (0.35 + 0.65 * w.prof) * streak;
      v = Math.max(0.012, v);
      const i = (y * CW + x) * 4, s = Math.pow(v, 1 / 2.2) * 255;
      d[i] = s; d[i + 1] = s * 1.01; d[i + 2] = s * 1.04; d[i + 3] = 255;
    }
  }, { srgb: true, repeat: [72, 72], aniso: 16 });
  T.carbonNormal = normalFromHeight(CW, CW, (x, y) => weave(x, y).prof * 0.5, 2.2, { repeat: [72, 72], aniso: 16 });
  T.carbonRough = dataTex(CW, CW, (d) => {
    for (let y = 0; y < CW; y++) for (let x = 0; x < CW; x++) { const w = weave(x, y), i = (y * CW + x) * 4; const v = (w.warp ? 0.3 : 0.5) * 255; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
  }, { repeat: [72, 72] });
  // leather grain: pebbles with creases between them (one tile = 6 cm)
  const wl = worley(22, 21), wl2 = worley(9, 22);
  T.leatherNormal = normalFromHeight(256, 256, (x, y, w, h) => {
    const [f1, f2] = wl(x / w, y / h), [g1, g2] = wl2(x / w, y / h);
    return Math.min(1, (f2 - f1) * 3.2) * 0.75 + Math.min(1, (g2 - g1) * 2.5) * 0.25;
  }, 3.0, { repeat: [16, 16] });
  // alcantara / suede: short directional fibers
  const vn1 = valueNoise(128, 31), vn2 = valueNoise(48, 32);
  T.suedeNormal = normalFromHeight(256, 256, (x, y, w, h) => vn1(x / w, y / h) * 0.7 + vn2(x / w, (y / h) * 0.5) * 0.3, 2.4, { repeat: [40, 40] });
  // fine plastic grain
  const vn3 = valueNoise(96, 41);
  T.grainNormal = normalFromHeight(128, 128, (x, y, w, h) => vn3(x / w, y / h), 1.6, { repeat: [60, 60] });
  // perforated leather: holes on a staggered grid (tile = 1 cm, two rows)
  T.perfColor = dataTex(64, 64, (d) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const hx = ((x + (y >= 32 ? 16 : 0)) % 32) - 16, hy = (y % 32) - 16, hole = Math.hypot(hx, hy) < 5.2;
      const i = (y * 64 + x) * 4, v = hole ? 18 : 255; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
  }, { srgb: true, repeat: [100, 100], aniso: 16 });
  T.perfNormal = normalFromHeight(64, 64, (x, y) => { const hx = ((x + (y >= 32 ? 16 : 0)) % 32) - 16, hy = (y % 32) - 16; return Math.min(1, Math.max(0, (Math.hypot(hx, hy) - 4) / 4)); }, 2.0, { repeat: [100, 100] });
  // cast / crackle surface
  const wc = worley(40, 51), vn4 = valueNoise(64, 52);
  T.castNormal = normalFromHeight(256, 256, (x, y, w, h) => vn4(x / w, y / h) * 0.6 + wc(x / w, y / h)[0] * 0.5, 2.2, { repeat: [14, 14] });
  T.crackleNormal = normalFromHeight(256, 256, (x, y, w, h) => { const [f1, f2] = wc(x / w, y / h); return Math.min(1, (f2 - f1) * 2.2); }, 4.5, { repeat: [22, 22] });
  // crinkled foil (heat shield)
  const wf = worley(14, 61);
  T.foilNormal = normalFromHeight(256, 256, (x, y, w, h) => { const [f1, f2] = wf(x / w, y / h); return f1 * 0.8 + (f2 - f1) * 0.4; }, 5.0, { repeat: [9, 9] });
  // brushed metal roughness streaks
  T.brushedRough = dataTex(256, 64, (d) => {
    const r = rng(71); const row = new Float32Array(256);
    for (let y = 0; y < 64; y++) { for (let x = 0; x < 256; x++) { if (x % 3 === 0 || y === 0) row[x] = 0.28 + r() * 0.3; const i = (y * 256 + x) * 4, v = row[x] * 255; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; } }
  }, { repeat: [3, 30] });
  // honeycomb mesh (alpha): flat-top hexagons, tile = 3a x sqrt(3)a
  T.hexAlpha = (() => {
    const W = 384, H = 222, a = W / 3, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#fff'; c.lineWidth = a * 0.2; c.lineJoin = 'round';
    const hex = (cx, cy) => { c.beginPath(); for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; const x = cx + Math.cos(an) * a, y = cy + Math.sin(an) * a; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.stroke(); };
    const s3 = Math.sqrt(3) * a;
    for (let i = -1; i <= 3; i++) for (let j = -1; j <= 2; j++) hex(i * 1.5 * a, j * s3 + (i & 1 ? s3 / 2 : 0));
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; t.repeat.set(1 / 0.036, 1 / (0.012 * Math.sqrt(3)));
    return t;
  })();
  // woven seat-belt / carpet
  T.weaveNormal = normalFromHeight(64, 64, (x, y) => (Math.sin(x / 64 * TAU * 4) * 0.5 + 0.5) * (Math.sin(y / 64 * TAU * 8) * 0.5 + 0.5), 2.5, { repeat: [50, 50] });
  const vn5 = valueNoise(128, 81);
  T.carpetNormal = normalFromHeight(128, 128, (x, y, w, h) => vn5(x / w, y / h), 5, { repeat: [45, 45] });
  // tire rubber micro texture
  T.rubberNormal = normalFromHeight(128, 128, (x, y, w, h) => vn3((x / w) * 0.5, y / h), 1.0, { repeat: [30, 30] });
  return T;
}

// ---------------------------------------------------------------- material factories
function build() {
  const T = makeTextures();
  const cache = new Map();
  const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const V2 = (a, b = a) => new THREE.Vector2(a, b);

  const L = {
    tex: T,
    /**
     * Automotive paint. type: 'metallic' (default) | 'candy' | 'pearl' | 'solid' | 'matte' | 'satin'
     * opts: { type, flake: 0..1, key: cache key suffix, fresh: true = do not cache (per-car repaint) }
     */
    paint(hex, opts = {}) {
      const type = opts.type || 'metallic';
      const make = () => {
        const base = { color: hex, envMapIntensity: 1.0, clearcoat: 1, clearcoatRoughness: 0.035, normalMap: T.flake, normalScale: V2(0.22) };
        if (type === 'metallic') Object.assign(base, { metalness: 0.72, roughness: 0.42 });
        else if (type === 'candy') Object.assign(base, { metalness: 0.55, roughness: 0.32, normalScale: V2(0.14) });
        else if (type === 'pearl') Object.assign(base, { metalness: 0.5, roughness: 0.38, iridescence: 0.35, iridescenceIOR: 1.6, sheen: 0.4, sheenColor: new THREE.Color(hex).offsetHSL(0.06, 0, 0.15), sheenRoughness: 0.4 });
        else if (type === 'solid') Object.assign(base, { metalness: 0.0, roughness: 0.45, normalMap: null });
        else if (type === 'matte') Object.assign(base, { metalness: 0.6, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.55, normalScale: V2(0.1) });
        else if (type === 'satin') Object.assign(base, { metalness: 0.7, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, normalScale: V2(0.12) });
        if (opts.flake != null && base.normalMap) base.normalScale = V2(opts.flake);
        const m = phys(base); m.name = 'paint_' + type; m.userData.paint = true;
        return m;
      };
      return opts.fresh ? make() : memo(`paint|${hex}|${type}|${opts.flake ?? ''}|${opts.key ?? ''}`, make);
    },
    /** Gloss carbon fiber (clearcoated 2x2 twill). tint multiplies the weave color (e.g. a colored carbon). */
    carbon(opts = {}) {
      return memo(`carbon|${opts.matte ? 1 : 0}|${opts.tint ?? ''}`, () => {
        const m = phys({ color: opts.tint ?? 0xffffff, map: T.carbonColor, normalMap: T.carbonNormal, normalScale: V2(0.55), roughnessMap: T.carbonRough, roughness: 1, metalness: 0.35,
          clearcoat: opts.matte ? 0.15 : 1, clearcoatRoughness: opts.matte ? 0.5 : 0.04, envMapIntensity: 1.0 });
        m.name = 'carbon'; return m;
      });
    },
    /** Tinted automotive glass. opacity = how much it hides what is behind it. */
    glass(opts = {}) {
      const tint = opts.tint ?? 0x070a0c, opacity = opts.opacity ?? 0.42;
      return memo(`glass|${tint}|${opacity}|${opts.side ?? ''}`, () => {
        const m = phys({ color: tint, metalness: 0, roughness: 0.03, transparent: true, opacity, envMapIntensity: opts.env ?? 2.4, clearcoat: 1, clearcoatRoughness: 0.02,
          side: opts.side ?? THREE.FrontSide, depthWrite: false });
        m.name = 'glass'; return m;
      });
    },
    /** Clear lamp lens (polycarbonate cover over a light unit). */
    lens(opts = {}) {
      return memo(`lens|${opts.tint ?? ''}|${opts.opacity ?? ''}`, () => {
        const m = phys({ color: opts.tint ?? 0xe8eef2, metalness: 0, roughness: 0.02, transparent: true, opacity: opts.opacity ?? 0.16, envMapIntensity: 3.2, clearcoat: 1, clearcoatRoughness: 0.01, depthWrite: false });
        m.name = 'lens'; return m;
      });
    },
    leather(hex = 0x141312, opts = {}) {
      return memo(`leather|${hex}|${opts.perf ? 1 : 0}|${opts.gloss ?? ''}`, () => {
        const m = std({ color: hex, roughness: opts.gloss ?? 0.52, metalness: 0, normalMap: opts.perf ? T.perfNormal : T.leatherNormal, normalScale: V2(opts.perf ? 0.8 : 0.55), map: opts.perf ? T.perfColor : null, envMapIntensity: 0.9 });
        m.name = opts.perf ? 'leatherPerf' : 'leather'; return m;
      });
    },
    alcantara(hex = 0x17181a) {
      return memo(`alc|${hex}`, () => {
        const m = phys({ color: hex, roughness: 0.95, metalness: 0, normalMap: T.suedeNormal, normalScale: V2(0.5), sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.28), envMapIntensity: 0.6 });
        m.name = 'alcantara'; return m;
      });
    },
    /** Stitch thread (contrast stitching beads). */
    stitch(hex = 0xd8d2c4) { return memo(`stitch|${hex}`, () => { const m = std({ color: hex, roughness: 0.75, metalness: 0 }); m.name = 'stitch'; return m; }); },
    carpet(hex = 0x101012) { return memo(`carpet|${hex}`, () => { const m = std({ color: hex, roughness: 1, metalness: 0, normalMap: T.carpetNormal, normalScale: V2(1.2), envMapIntensity: 0.3 }); m.name = 'carpet'; return m; }); },
    belt(hex = 0x0d0d0e) { return memo(`belt|${hex}`, () => { const m = std({ color: hex, roughness: 0.7, metalness: 0, normalMap: T.weaveNormal, normalScale: V2(0.7), side: THREE.DoubleSide }); m.name = 'belt'; return m; }); },
    /** Molded interior / exterior plastic. gloss: 'grain' (default) | 'piano' | 'satin' */
    plastic(hex = 0x0e0f10, gloss = 'grain') {
      return memo(`plastic|${hex}|${gloss}`, () => {
        const m = gloss === 'piano' ? phys({ color: hex, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.1 })
          : gloss === 'satin' ? std({ color: hex, roughness: 0.42, metalness: 0.1 })
          : std({ color: hex, roughness: 0.74, metalness: 0, normalMap: T.grainNormal, normalScale: V2(0.5), envMapIntensity: 0.7 });
        m.name = 'plastic_' + gloss; return m;
      });
    },
    rubber(hex = 0x0b0b0c) { return memo(`rubber|${hex}`, () => { const m = std({ color: hex, roughness: 0.88, metalness: 0, normalMap: T.rubberNormal, normalScale: V2(0.35), envMapIntensity: 0.6 }); m.name = 'rubber'; return m; }); },
    /** Metals. finish: 'chrome' | 'dark' (shadow chrome) | 'alu' (machined) | 'brushed' | 'cast' | 'titanium' | 'bronze' | 'gold' | 'steel' | 'gun' */
    metal(finish = 'alu', hex) {
      return memo(`metal|${finish}|${hex ?? ''}`, () => {
        const P = {
          chrome: { color: 0xf2f4f6, roughness: 0.05 }, dark: { color: 0x33363b, roughness: 0.16 }, alu: { color: 0xc9cdd2, roughness: 0.3 },
          brushed: { color: 0xbfc3c8, roughness: 1, roughnessMap: T.brushedRough }, cast: { color: 0x8f9296, roughness: 0.62, normalMap: T.castNormal, normalScale: V2(0.6), metalness: 0.85 },
          titanium: { color: 0x8d919c, roughness: 0.28 }, bronze: { color: 0x9a7240, roughness: 0.3 }, gold: { color: 0xd6a94b, roughness: 0.22 },
          steel: { color: 0x7d8186, roughness: 0.38 }, gun: { color: 0x1c1e21, roughness: 0.3 }, burnt: { color: 0x5a6c9a, roughness: 0.25 },
        }[finish] || {};
        const m = std({ metalness: 1, ...P }); if (hex != null) m.color.setHex(hex); m.name = 'metal_' + finish; return m;
      });
    },
    /** Anodized / painted metal part (calipers, engine covers, wheel finishes). finish: 'gloss' | 'satin' | 'crackle' */
    coated(hex, finish = 'gloss') {
      return memo(`coated|${hex}|${finish}`, () => {
        const m = finish === 'crackle' ? std({ color: hex, roughness: 0.68, metalness: 0.15, normalMap: T.crackleNormal, normalScale: V2(0.9) })
          : finish === 'satin' ? std({ color: hex, roughness: 0.4, metalness: 0.75 })
          : phys({ color: hex, roughness: 0.35, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.06 });
        m.name = 'coated_' + finish; return m;
      });
    },
    /** Honeycomb grille mesh (alpha-tested), meant to sit in front of a dark backing. */
    hexMesh(hex = 0x0a0a0b, scale = 1) {
      return memo(`hexmesh|${hex}|${scale}`, () => {
        const a = T.hexAlpha.clone(); a.repeat.multiplyScalar(scale); a.needsUpdate = true;
        const m = std({ color: hex, roughness: 0.45, metalness: 0.6, alphaMap: a, alphaTest: 0.5, side: THREE.DoubleSide }); m.name = 'hexMesh'; return m;
      });
    },
    foil() { return memo('foil', () => { const m = std({ color: 0xd9ad52, roughness: 0.32, metalness: 1, normalMap: T.foilNormal, normalScale: V2(1.1) }); m.name = 'foil'; return m; }); },
    /** Flat dark backing for intakes, wheel wells and anything that must read as "deep shadow". */
    shadow() { return memo('shadow', () => { const m = std({ color: 0x030304, roughness: 1, metalness: 0, envMapIntensity: 0.15 }); m.name = 'shadow'; return m; }); },
    /** Emissive light element. Each call returns a NEW material (lights are driven per car). */
    glow(hex, intensity = 0, base = 0x202020) {
      const m = std({ color: base, emissive: hex, emissiveIntensity: intensity, roughness: 0.3, metalness: 0 }); m.name = 'glow'; m.toneMapped = true; return m;
    },
    /** Unlit screen with a texture (cluster, infotainment). Each call returns a new material. */
    screen(tex, intensity = 1) {
      const m = std({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.15, metalness: 0 }); m.name = 'screen'; return m;
    },
    mirror() { return memo('mirror', () => { const m = std({ color: 0xffffff, roughness: 0.02, metalness: 1, envMapIntensity: 1.3 }); m.name = 'mirror'; return m; }); },
  };
  return L;
}

/** Shared material library (created on first use; needs a DOM for canvas textures). */
export function getMats() { return (LIB ||= build()); }

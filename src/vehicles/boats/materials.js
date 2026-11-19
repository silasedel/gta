// Shared boat materials and procedural textures. Nothing here is flat: gelcoat has a faint orange-peel and chalk map,
// walking surfaces have a molded non-skid pattern, upholstery has vinyl grain, canvas has a weave, teak has planks and
// caulk seams, aluminum is brushed. Colors come from each boat's 32-slot palette texture (uv1), so the prototypes below are
// cloned per boat with only the palette swapped: same shader programs, different boats.
import * as THREE from 'three';
import { PALETTE_N, FIXED_COLORS, rng } from './kit.js';

const TEX = {};
const isDom = typeof document !== 'undefined';
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function finish(cv, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
// tiling value noise
function noiseFn(seed, cells) {
  const r = rng(seed),
    g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    x = (((x % 1) + 1) % 1) * cells;
    y = (((y % 1) + 1) % 1) * cells;
    const xi = Math.floor(x),
      yi = Math.floor(y),
      fx = x - xi,
      fy = y - yi,
      sx = fx * fx * (3 - 2 * fx),
      sy = fy * fy * (3 - 2 * fy);
    const a = g[(yi % cells) * cells + (xi % cells)],
      b = g[(yi % cells) * cells + ((xi + 1) % cells)],
      c = g[((yi + 1) % cells) * cells + (xi % cells)],
      d = g[((yi + 1) % cells) * cells + ((xi + 1) % cells)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
// height function (tiling, 0..1 domain) -> normal map
function normalFromHeight(size, hf, strength, opts) {
  const cv = canvas(size, size),
    ctx = cv.getContext('2d'),
    img = ctx.createImageData(size, size),
    d = img.data,
    e = 1 / size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        hx = hf(u + e, v) - hf(u - e, v),
        hy = hf(u, v + e) - hf(u, v - e);
      let nx = -hx * strength,
        ny = hy * strength,
        nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return finish(cv, opts);
}
function grayTex(size, f, opts) {
  const cv = canvas(size, size),
    ctx = cv.getContext('2d'),
    img = ctx.createImageData(size, size),
    d = img.data;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = Math.max(0, Math.min(1, f(x / size, y / size))) * 255,
        i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return finish(cv, opts);
}
export function textures() {
  if (TEX.ready) return TEX;
  const n1 = noiseFn(11, 64),
    n2 = noiseFn(23, 16),
    n3 = noiseFn(37, 128);
  // molded non-skid: offset rows of small pyramids
  TEX.nonskidN = normalFromHeight(
    256,
    (u, v) => {
      const c = 16,
        x = u * c,
        y = v * c,
        row = Math.floor(y),
        fx = ((((x + (row % 2) * 0.5) % 1) + 1) % 1) - 0.5,
        fy = (((y % 1) + 1) % 1) - 0.5;
      return Math.max(0, 0.42 - Math.max(Math.abs(fx), Math.abs(fy))) * 2.2 + n1(u, v) * 0.05;
    },
    2.6,
    { repeat: 7 },
  );
  // vinyl grain (leather-like pebble) for upholstery
  TEX.vinylN = normalFromHeight(
    256,
    (u, v) => n3(u, v) * 0.5 + n1(u * 2, v * 2) * 0.35 + n2(u, v) * 0.3,
    2.0,
    { repeat: 9 },
  );
  // canvas weave / plastic texture for matte parts
  TEX.weaveN = normalFromHeight(
    128,
    (u, v) =>
      (Math.sin(u * Math.PI * 2 * 32) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 2 * 32) * 0.5 + 0.5) +
      n1(u, v) * 0.25,
    1.2,
    { repeat: 12 },
  );
  // gelcoat: faint orange peel + chalking, drives roughness
  TEX.gelR = grayTex(256, (u, v) => 0.62 + n2(u, v) * 0.22 + n1(u, v) * 0.1 + n3(u, v) * 0.06, {
    repeat: 1.3,
  });
  TEX.gelN = normalFromHeight(256, (u, v) => n1(u, v) * 0.4 + n2(u, v) * 0.6, 0.35, { repeat: 3 });
  // brushed aluminum
  TEX.brushN = normalFromHeight(
    256,
    (u, v) => n3(u * 0.06, v) * 0.7 + n1(u * 0.1, v * 2) * 0.3,
    1.1,
    { repeat: 4 },
  );
  TEX.brushR = grayTex(128, (u, v) => 0.55 + n3(u * 0.06, v) * 0.3 + n2(u, v) * 0.15, {
    repeat: 3,
  });
  // polished metal micro-scratches (roughness)
  TEX.steelR = grayTex(128, (u, v) => 0.45 + n3(u, v * 0.08) * 0.35 + n2(u, v) * 0.2, {
    repeat: 6,
  });
  // teak deck: 8 planks across the tile with black caulk seams and grain
  {
    const size = 512,
      cv = canvas(size, size),
      c = cv.getContext('2d'),
      r = rng(77),
      planks = 8,
      pw = size / planks;
    for (let p = 0; p < planks; p++) {
      const base = [172 + r() * 26, 118 + r() * 20, 66 + r() * 16];
      c.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
      c.fillRect(p * pw, 0, pw, size);
      for (let k = 0; k < 90; k++) {
        const x = p * pw + r() * pw,
          y = r() * size,
          len = 30 + r() * 160;
        c.strokeStyle = `rgba(${r() < 0.5 ? '90,56,26' : '214,170,112'},${0.08 + r() * 0.14})`;
        c.lineWidth = 0.6 + r() * 1.2;
        c.beginPath();
        c.moveTo(x, y);
        c.bezierCurveTo(
          x + r() * 3 - 1.5,
          y + len * 0.3,
          x + r() * 3 - 1.5,
          y + len * 0.7,
          x + r() * 2 - 1,
          y + len,
        );
        c.stroke();
      }
      // butt joint
      const jy = r() * size;
      c.fillStyle = 'rgba(20,16,12,0.85)';
      c.fillRect(p * pw, jy, pw, 2.5);
    }
    c.fillStyle = '#17130f';
    for (let p = 0; p <= planks; p++) c.fillRect((p * pw - 2.5 + size) % size, 0, 5, size);
    TEX.teak = finish(cv, { srgb: true, repeat: 2.4 });
    TEX.teakN = normalFromHeight(
      256,
      (u, v) => {
        const x = (u * planks) % 1;
        return (x < 0.04 || x > 0.96 ? 0 : 1) * 0.6 + n3(u, v * 0.12) * 0.25;
      },
      2.2,
      { repeat: 2.4 },
    );
    TEX.teakR = grayTex(
      128,
      (u, v) => {
        const x = (u * planks) % 1;
        return (x < 0.04 || x > 0.96 ? 0.9 : 0.58) + n1(u, v) * 0.12;
      },
      { repeat: 2.4 },
    );
  }
  // sailcloth: panel seams + fine weave
  {
    const size = 512,
      cv = canvas(size, size),
      c = cv.getContext('2d');
    c.fillStyle = '#f3f1e8';
    c.fillRect(0, 0, size, size);
    const r = rng(5);
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '190,186,170'},0.05)`;
      c.fillRect(r() * size, r() * size, 2 + r() * 14, 1);
    }
    c.strokeStyle = 'rgba(120,118,108,0.55)';
    c.lineWidth = 2;
    for (let y = 32; y < size; y += 64) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(size, y);
      c.stroke();
      c.setLineDash([3, 5]);
      c.strokeStyle = 'rgba(90,90,84,0.35)';
      c.beginPath();
      c.moveTo(0, y + 4);
      c.lineTo(size, y + 4);
      c.stroke();
      c.setLineDash([]);
      c.strokeStyle = 'rgba(120,118,108,0.55)';
    }
    TEX.sail = finish(cv, { srgb: true, repeat: 1 });
  }
  // fixed palette (slots 16..31 only): used by lamps
  TEX.fixedPalette = paletteTexture({});
  TEX.ready = true;
  return TEX;
}

// 32x1 palette texture read through uv1. colors: { slotIndex: hex }
export function paletteTexture(colors) {
  const data = new Uint8Array(PALETTE_N * 4),
    c = new THREE.Color();
  for (let i = 0; i < PALETTE_N; i++) {
    const hex = colors[i] ?? FIXED_COLORS[i] ?? 0x808080;
    c.setHex(hex);
    data[i * 4] = Math.round(c.r * 255);
    data[i * 4 + 1] = Math.round(c.g * 255);
    data[i * 4 + 2] = Math.round(c.b * 255);
    data[i * 4 + 3] = 255;
  }
  // THREE.Color.setHex converts sRGB -> linear working space; write sRGB bytes back so the texture can be tagged sRGB
  for (let i = 0; i < PALETTE_N; i++) {
    const hex = colors[i] ?? FIXED_COLORS[i] ?? 0x808080;
    data[i * 4] = (hex >> 16) & 255;
    data[i * 4 + 1] = (hex >> 8) & 255;
    data[i * 4 + 2] = hex & 255;
  }
  const t = new THREE.DataTexture(data, PALETTE_N, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.channel = 1;
  t.needsUpdate = true;
  return t;
}

let PROTO = null;
function protos() {
  if (PROTO) return PROTO;
  const T = textures();
  const ph = (o) => new THREE.MeshPhysicalMaterial(o),
    st = (o) => new THREE.MeshStandardMaterial(o);
  PROTO = {
    hull: ph({
      roughness: 0.3,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      roughnessMap: T.gelR,
      normalMap: T.gelN,
      normalScale: new THREE.Vector2(0.18, 0.18),
    }),
    gel: ph({
      roughness: 0.34,
      metalness: 0,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      roughnessMap: T.gelR,
      normalMap: T.gelN,
      normalScale: new THREE.Vector2(0.2, 0.2),
    }),
    nonskid: st({
      roughness: 0.92,
      metalness: 0,
      normalMap: T.nonskidN,
      normalScale: new THREE.Vector2(0.9, 0.9),
    }),
    vinyl: ph({
      roughness: 0.52,
      metalness: 0,
      normalMap: T.vinylN,
      normalScale: new THREE.Vector2(0.45, 0.45),
      sheen: 0.35,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(0xffffff),
    }),
    matte: st({
      roughness: 0.82,
      metalness: 0,
      normalMap: T.weaveN,
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
    metal: st({ roughness: 0.3, metalness: 1, roughnessMap: T.steelR }),
    alu: st({
      roughness: 0.7,
      metalness: 0.85,
      roughnessMap: T.brushR,
      normalMap: T.brushN,
      normalScale: new THREE.Vector2(0.4, 0.4),
    }),
    teak: st({
      map: T.teak,
      normalMap: T.teakN,
      roughnessMap: T.teakR,
      roughness: 1,
      metalness: 0,
    }),
    teakGray: st({
      map: T.teak,
      color: 0x9a9690,
      normalMap: T.teakN,
      roughnessMap: T.teakR,
      roughness: 1,
      metalness: 0,
    }),
    glass: ph({
      color: 0x1a2630,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.42,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    glassClear: ph({
      color: 0xbfd6dc,
      roughness: 0.03,
      metalness: 0,
      transparent: true,
      opacity: 0.2,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    sail: st({ map: T.sail, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
    lampOff: st({
      map: T.fixedPalette,
      roughness: 0.25,
      metalness: 0,
      emissiveMap: T.fixedPalette,
      emissive: 0xffffff,
      emissiveIntensity: 0.06,
    }),
    lampOn: st({
      map: T.fixedPalette,
      roughness: 0.25,
      metalness: 0,
      emissiveMap: T.fixedPalette,
      emissive: 0xffffff,
      emissiveIntensity: 5,
    }),
  };
  return PROTO;
}

// Per-boat material set. `palette` = { slot: hex }, `liveryTex` / `decalTex` / `screenTex` are that boat's textures.
// wear 0..1 dulls the gelcoat (oxidized, chalky) and roughens vinyl and metal.
export function makeBoatMaterials({
  palette,
  liveryTex = null,
  decalTex = null,
  screenTex = null,
  wear = 0,
  teakGray = false,
  clearGlass = false,
  hullMetal = false,
}) {
  const P = protos(),
    pal = paletteTexture(palette),
    own = [];
  const cl = (m, o = {}) => {
    const c = m.clone();
    c.map = pal;
    Object.assign(c, o);
    own.push(c);
    return c;
  };
  const dull = Math.max(0, Math.min(1, wear));
  const hull = P.hull.clone();
  own.push(hull);
  if (hullMetal) {
    hull.metalness = 0.8;
    hull.roughness = 0.62;
    hull.clearcoat = 0;
    hull.normalMap = textures().brushN;
    hull.roughnessMap = textures().brushR;
  } else {
    hull.roughness = 0.26 + dull * 0.45;
    hull.clearcoat = 1 - dull * 0.75;
  }
  if (liveryTex) hull.map = liveryTex;
  else hull.map = pal;
  const set = {
    hull,
    gel: cl(P.gel, { roughness: 0.3 + dull * 0.4, clearcoat: 0.9 - dull * 0.7 }),
    nonskid: cl(P.nonskid),
    vinyl: cl(P.vinyl, { roughness: 0.5 + dull * 0.3 }),
    matte: cl(P.matte),
    metal: cl(P.metal, { roughness: 0.26 + dull * 0.3 }),
    alu: cl(P.alu),
    teak: teakGray ? P.teakGray : P.teak,
    glass: clearGlass ? P.glassClear : P.glass,
    sail: cl(P.sail, { map: textures().sail }),
    lamp: P.lampOff,
    lampOn: P.lampOn,
    lampOff: P.lampOff,
    beaconA: null,
    beaconB: null,
    screen: null,
    decal: null,
    paletteTex: pal,
  };
  // sails take their tint from the palette too (sail bucket uv1) by multiplying a color; keep the cloth texture as the map
  set.sail.color = new THREE.Color(0xffffff);
  if (decalTex) {
    set.decal = new THREE.MeshStandardMaterial({
      map: decalTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      roughness: 0.35,
      metalness: 0,
      alphaTest: 0.02,
    });
    own.push(set.decal);
  }
  if (screenTex) {
    set.screen = new THREE.MeshStandardMaterial({
      map: screenTex,
      emissiveMap: screenTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.0,
      roughness: 0.12,
      metalness: 0,
    });
    own.push(set.screen);
  }
  set.beaconA = new THREE.MeshStandardMaterial({
    map: textures().fixedPalette,
    emissiveMap: textures().fixedPalette,
    emissive: 0xffffff,
    emissiveIntensity: 0.08,
    roughness: 0.2,
  });
  set.beaconB = set.beaconA.clone();
  own.push(set.beaconA, set.beaconB);
  set.dispose = () => {
    for (const m of own) m.dispose();
    pal.dispose();
    liveryTex?.dispose?.();
    decalTex?.dispose?.();
  };
  return set;
}
export const canvasEl = canvas;
export { finish as canvasTexture, isDom };

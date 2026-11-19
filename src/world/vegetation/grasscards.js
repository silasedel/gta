// Grass cards from the user's photographed grass (Models/Textures/Grass Cards 1-4, atlas built by tools/v2/ground/prep_grass.py):
// close-up ground-cover prototypes for the countryside streamer (same aWind / vertex-color layout as the procedural tufts, so
// they bend in the shared wind and fade with the same dithered LOD bands).
//   grassCardMap()            the atlas texture (sRGB, mipmapped, max anisotropy), shared
//   clumpCard(seed, o)        one photographed wild-grass clump on 2 crossed cards (Grass Cards 4)
//   stripCard(seed, o)        dense dry-grass strip cards (Grass Cards 3 plates), 3 cards in a star
//   bladeCards(seed, o)       a tuft of single photographed blades (Grass Cards 1 + 2), each blade a bent 3-row strip
//   weedCard(seed, o)         a low weed sprig (Grass Cards 4, Rostlinka 12) on 2 crossed cards
import * as THREE from 'three';
import { GB, rng } from './geom.js';

// atlas rectangles [u0, y0, u1, y1], y measured from the image top (prep_grass.py output)
const R = {
  plate: [
    [0, 0.0, 0.5, 0.1665],
    [0, 0.1665, 0.5, 0.333],
    [0, 0.333, 0.5, 0.4995],
  ],
  clump: [
    [0.5635, 0.0122, 0.7114, 0.2056],
    [0.792, 0.0137, 0.9668, 0.2056],
    [0.8442, 0.2651, 0.9883, 0.4902],
    [0.5186, 0.2661, 0.6426, 0.4893],
    [0.6875, 0.272, 0.8159, 0.4902],
  ],
  weed: [
    [0.1729, 0.604, 0.3325, 0.7773],
    [0.3608, 0.6138, 0.4961, 0.7773],
    [0.0073, 0.6284, 0.1597, 0.7773],
    [0.3374, 0.813, 0.4902, 0.9849],
    [0.1621, 0.8428, 0.2754, 0.9849],
  ],
  blade: [
    [0.5317, 0.5059, 0.5654, 0.9941],
    [0.6294, 0.5059, 0.6636, 0.9941],
    [0.7275, 0.5059, 0.7607, 0.9941],
    [0.8301, 0.5059, 0.8535, 0.9941],
    [0.8931, 0.5059, 0.9858, 0.9941],
  ],
};
const V3 = THREE.Vector3;
let _map = null;
export function grassCardMap(renderer) {
  if (_map) return _map;
  const t = new THREE.TextureLoader().load(
    (import.meta.env?.BASE_URL ?? '/') + 'assets/textures/ground/grass_cards.png',
  );
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = renderer ? Math.min(16, renderer.capabilities.getMaxAnisotropy()) : 8;
  _map = t;
  return t;
}

// one vertical card: base center p0, facing azimuth az, width w, height h, atlas rect r; rows bend toward `lean` (m at the top)
function card(gb, p0, az, w, h, r, lean, phase, tint, rows = 3, flutter = 0.6) {
  const ca = Math.cos(az),
    sa = Math.sin(az),
    side = new V3(-sa, 0, ca),
    fwd = new V3(ca, 0, sa),
    b = gb.count;
  const nn = new V3(ca * 0.25, 1, sa * 0.25).normalize();
  for (let k = 0; k <= rows; k++) {
    const t = k / rows,
      y = h * t * (1 - (0.18 * lean * t * t) / Math.max(0.2, h)),
      out = lean * t * t;
    const c = [
      tint[0] * (0.62 + 0.38 * t),
      tint[1] * (0.66 + 0.34 * t),
      tint[2] * (0.62 + 0.38 * t),
    ]; // darker at the root (self-shadowed base)
    const v = 1 - (r[3] + (r[1] - r[3]) * t);
    for (const sg of [-1, 1])
      gb.vert(
        new V3(
          p0.x + (side.x * sg * w) / 2 + fwd.x * out,
          p0.y + y,
          p0.z + (side.z * sg * w) / 2 + fwd.z * out,
        ),
        nn,
        sg < 0 ? r[0] : r[2],
        v,
        c,
        [Math.max(0, y) * 2.0, t * flutter, phase],
      );
  }
  for (let k = 0; k < rows; k++) gb.quad(b + k * 2, b + k * 2 + 1, b + k * 2 + 3, b + k * 2 + 2);
}
const tintOf = (R2, warm) => {
  const g = 0.9 + R2() * 0.2;
  return [g * (1 + warm * 0.08), g, g * (1 - warm * 0.12)];
};

export function clumpCard(seed, o = {}) {
  const Rn = rng(seed),
    gb = new GB(),
    r = R.clump[(seed * 7) % R.clump.length],
    asp = (r[2] - r[0]) / (r[3] - r[1]);
  const h = (o.h ?? 0.6) * (0.85 + Rn() * 0.3),
    w = h * asp,
    az = Rn() * 3.14,
    tint = tintOf(Rn, Rn());
  for (let k = 0; k < 2; k++)
    card(
      gb,
      new V3((Rn() - 0.5) * 0.04, -0.03, (Rn() - 0.5) * 0.04),
      az + k * 1.5708 + (Rn() - 0.5) * 0.3,
      w,
      h,
      r,
      (Rn() - 0.5) * 0.12,
      Rn() * 6,
      tint,
    );
  return { leaf: gb.build(), tris: gb.tris, card: true };
}
export function weedCard(seed, o = {}) {
  const Rn = rng(seed),
    gb = new GB(),
    r = R.weed[(seed * 3) % R.weed.length],
    asp = (r[2] - r[0]) / (r[3] - r[1]);
  const h = (o.h ?? 0.18) * (0.8 + Rn() * 0.4),
    w = h * asp,
    az = Rn() * 3.14,
    tint = tintOf(Rn, 0);
  for (let k = 0; k < 2; k++)
    card(gb, new V3(0, -0.02, 0), az + k * 1.5708, w, h, r, 0.02, Rn() * 6, tint, 2, 0.3);
  return { leaf: gb.build(), tris: gb.tris, card: true };
}
export function stripCard(seed, o = {}) {
  const Rn = rng(seed),
    gb = new GB(),
    n = o.n ?? 3,
    az0 = Rn() * 3.14,
    tint = tintOf(Rn, Rn() * 0.5);
  for (let k = 0; k < n; k++) {
    const r0 = R.plate[(seed + k) % 3],
      f = 0.5 + Rn() * 0.5,
      u0 = r0[0] + (r0[2] - r0[0]) * Rn() * (1 - f),
      r = [u0, r0[1] + 0.012, u0 + (r0[2] - r0[0]) * f, r0[3]]; // a random part of a plate
    const h = (o.h ?? 0.34) * (0.8 + Rn() * 0.4),
      w = (o.w ?? 0.9) * f * (0.8 + Rn() * 0.4);
    card(
      gb,
      new V3((Rn() - 0.5) * 0.12, -0.03, (Rn() - 0.5) * 0.12),
      az0 + k * (3.1416 / n) + (Rn() - 0.5) * 0.25,
      w,
      h,
      r,
      (Rn() - 0.5) * 0.1,
      Rn() * 6,
      tint,
    );
  }
  return { leaf: gb.build(), tris: gb.tris, card: true };
}
export function bladeCards(seed, o = {}) {
  const Rn = rng(seed),
    gb = new GB(),
    n = o.n ?? 12;
  for (let k = 0; k < n; k++) {
    const r = R.blade[Math.floor(Rn() * R.blade.length)],
      az = Rn() * 6.283,
      d = Math.sqrt(Rn()) * (o.r ?? 0.2);
    const h = (o.h ?? 0.9) * (0.6 + Rn() * 0.55),
      w = (o.w ?? 0.03) * (0.75 + Rn() * 0.5),
      lean = (o.lean ?? 0.35) * h * (0.3 + Rn());
    card(
      gb,
      new V3(Math.cos(az) * d, -0.03, Math.sin(az) * d),
      az + (Rn() - 0.5) * 0.8,
      w,
      h,
      r,
      lean,
      Rn() * 6,
      tintOf(Rn, Rn()),
      3,
      0.8,
    );
  }
  return { leaf: gb.build(), tris: gb.tris, card: true };
}

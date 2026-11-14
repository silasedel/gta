// Port Solana V2 — Nico's hair cards (CHARACTER track). Built at load time on the scalp of the head mesh (bind pose):
// tapered, curved strips rooted where the hair mask says the hair is long (top and crown), combed along the hair
// direction with a little lift and gravity sag. A painted strand-alpha atlas gives each card 20-30 separate strands;
// alpha-test + alpha-to-coverage, matte (low gloss), darker at the roots. The shells underneath stay as the short
// undercoat and the barber fade, so the cards only add the volume and broken silhouette on top.
import * as THREE from 'three';

let ATLAS = null;
function strandAtlas() {
  if (ATLAS) return ATLAS;
  const W = 256, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let col = 0; col < 4; col++) {                     // four card variants side by side
    const x0 = col * 64;
    const n = 22 + Math.floor(rnd() * 10);
    for (let i = 0; i < n; i++) {
      const sx = x0 + 4 + rnd() * 56, len = H * (0.55 + 0.45 * rnd()), wdt = 1.2 + rnd() * 1.6, bend = (rnd() - 0.5) * 10;
      const g = x.createLinearGradient(0, H, 0, H - len);
      const tone = 0.75 + 0.25 * rnd();
      g.addColorStop(0, `rgba(${Math.round(255 * tone)},${Math.round(255 * tone)},${Math.round(255 * tone)},1)`);
      g.addColorStop(0.85, `rgba(${Math.round(255 * tone)},${Math.round(255 * tone)},${Math.round(255 * tone)},0.9)`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.strokeStyle = g;
      x.lineCap = 'round';
      x.beginPath();
      x.lineWidth = wdt;
      x.moveTo(sx, H);
      x.quadraticCurveTo(sx + bend * 0.5, H - len * 0.5, sx + bend, H - len);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.flipY = false;
  ATLAS = t;
  return t;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3();
const _t = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

// scalpGeo: head-mesh triangles inside the hair mask (positions, normals, uv, skinIndex, skinWeight in bind space);
// mask: 512x512 RGBA pixels of head_hair.webp (r = hair, g = length); state: { uHairLen, uHairC, uComb }
export function buildHairCards(scalpGeo, mask, state, { count = 2200, seed = 3 } = {}) {
  const pos = scalpGeo.attributes.position, nrm = scalpGeo.attributes.normal, uv = scalpGeo.attributes.uv;
  const si = scalpGeo.attributes.skinIndex, sw = scalpGeo.attributes.skinWeight, idx = scalpGeo.index.array;
  const lenAt = (u, v) => {
    const px = Math.min(511, Math.max(0, Math.floor(u * 512))), py = Math.min(511, Math.max(0, Math.floor(v * 512)));
    const k = (py * 512 + px) * 4;
    return mask[k] > 127 ? mask[k + 1] / 255 : 0;
  };
  // area x length weighted sampling over the scalp triangles
  const tri = [], cum = [];
  let tot = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
    _a.fromBufferAttribute(pos, i0); _b.fromBufferAttribute(pos, i1); _c.fromBufferAttribute(pos, i2);
    const area = _b.sub(_a).cross(_c.sub(_a)).length() * 0.5;
    const L = lenAt((uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3, (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3);
    if (L < 0.3) continue;
    tot += area * L * L;
    tri.push(t); cum.push(tot);
  }
  if (!tri.length) return null;
  let s = seed * 9973 + 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const SEG = 4;
  const P = [], N = [], UV = [], SI = [], SW = [], C = [], I = [];
  const comb = new THREE.Vector3().copy(state.uComb.value).normalize();
  const baseLen = state.uHairLen.value;
  for (let k = 0; k < count; k++) {
    // pick a triangle, then a point in it
    const r = rnd() * tot;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
    const t = tri[lo], i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
    let u1 = rnd(), u2 = rnd();
    if (u1 + u2 > 1) { u1 = 1 - u1; u2 = 1 - u2; }
    const w0 = 1 - u1 - u2;
    _p.set(0, 0, 0).addScaledVector(_a.fromBufferAttribute(pos, i0), w0).addScaledVector(_b.fromBufferAttribute(pos, i1), u1).addScaledVector(_c.fromBufferAttribute(pos, i2), u2);
    _n.set(0, 0, 0).addScaledVector(_a.fromBufferAttribute(nrm, i0), w0).addScaledVector(_b.fromBufferAttribute(nrm, i1), u1).addScaledVector(_c.fromBufferAttribute(nrm, i2), u2).normalize();
    const L = lenAt(uv.getX(i0) * w0 + uv.getX(i1) * u1 + uv.getX(i2) * u2, uv.getY(i0) * w0 + uv.getY(i1) * u1 + uv.getY(i2) * u2);
    const len = baseLen * (0.55 + 0.75 * L) * (0.75 + 0.5 * rnd());
    // comb direction in the scalp tangent plane, a little random swirl
    _t.copy(comb).addScaledVector(_n, -comb.dot(_n));
    _t.x += (rnd() - 0.5) * 0.5; _t.z += (rnd() - 0.5) * 0.5;
    _t.addScaledVector(_n, -_t.dot(_n)).normalize();
    _w.crossVectors(_n, _t).normalize();
    const lift = 0.45 + 0.35 * rnd();
    const width = 0.011 + 0.007 * rnd();
    const variant = Math.floor(rnd() * 4);
    const base = P.length / 3;
    for (let j = 0; j <= SEG; j++) {
      const f = j / SEG;
      // root rises off the scalp, then lies over along the comb and sags
      _d.copy(_p).addScaledVector(_n, len * lift * Math.sin(f * 1.3) * 0.55 + 0.0015).addScaledVector(_t, len * f).add(_c.set(0, -len * 0.18 * f * f, 0));
      const wd = width * (1 - 0.6 * f);
      for (const sgn of [-1, 1]) {
        P.push(_d.x + _w.x * wd * 0.5 * sgn, _d.y + _w.y * wd * 0.5 * sgn, _d.z + _w.z * wd * 0.5 * sgn);
        // card normals bend toward the scalp normal: shading reads as a volume, not as flat ribbons
        _c.copy(_n).multiplyScalar(0.8).addScaledVector(_w, 0.35 * sgn).normalize();
        N.push(_c.x, _c.y, _c.z);
        UV.push(variant * 0.25 + (sgn < 0 ? 0.01 : 0.24), 1 - f);
        SI.push(si.getX(i0), si.getY(i0), si.getZ(i0), si.getW(i0));
        SW.push(sw.getX(i0), sw.getY(i0), sw.getZ(i0), sw.getW(i0));
        const tone = 0.8 + 0.4 * ((k * 0.6180339) % 1);
        const root = (0.38 + 0.62 * f) * tone;
        C.push(root, root * 0.97, root * 0.93);
      }
    }
    for (let j = 0; j < SEG; j++) {
      const a = base + j * 2;
      I.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  g.setIndex(I);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.7, 0), 0.4);
  const m = new THREE.MeshStandardMaterial({
    name: 'hairCards', map: strandAtlas(), color: state.uHairC.value.clone().multiplyScalar(1.6), vertexColors: true,
    alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.74, metalness: 0, envMapIntensity: 0.3,
  });
  return { geometry: g, material: m };
}

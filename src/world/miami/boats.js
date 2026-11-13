// Miami city — marina boat models (original, procedural): lofted V-hulls with sheer + flare, decks, cabins,
// windshields, railings. 4 variants: center-console (T-top + outboards), express cruiser, sloop, motor yacht.
// Bow points +Z, waterline at local y = 0.35 (instances sit at y = -0.35). Vertex colours; instance colour = mild tint.
import * as THREE from 'three';
import { Batch } from '../city/geo.js';

const UP = new THREE.Vector3(0, 1, 0);
const m4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 6);

// hull: stations along z; cross-section keel -> chine -> gunwale; returns { geo, deckAt(z) -> [halfBeam, y] }
function hull(L, B, D, sheer, colTop, colBottom, stripe) {
  const N = 16, P = [], C = [], I = [], cTop = new THREE.Color(colTop), cBot = new THREE.Color(colBottom), cStr = new THREE.Color(stripe ?? colTop);
  const st = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -L / 2 + t * L;
    const taper = t < 0.55 ? 1 - 0.08 * (1 - t / 0.55) : Math.sqrt(Math.max(0, 1 - ((t - 0.55) / 0.45) ** 2.2));
    const w = (B / 2) * Math.max(taper, 0.02), keel = -D * (t < 0.7 ? 1 : 1 - (t - 0.7) * 1.6), gun = 0.35 + sheer + (t > 0.6 ? (t - 0.6) * 0.9 : 0);
    st.push({ z, w, keel, gun });
    // points: 0 keel, 1 chine L, 2 waterline L, 3 gunwale L, 4 chine R, 5 waterline R, 6 gunwale R
    const pts = [[0, keel + 0.35], [-w * 0.82, 0.35 - D * 0.25], [-w * 0.97, 0.45], [-w * 1.04, gun], [w * 0.82, 0.35 - D * 0.25], [w * 0.97, 0.45], [w * 1.04, gun]];
    for (const [x, y] of pts) { P.push(x, y, z); const c = y < 0.4 ? cBot : y > gun - 0.18 ? cStr : cTop; C.push(c.r, c.g, c.b); }
  }
  const quad = (a, b, c, d) => I.push(a, b, c, a, c, d);
  for (let i = 0; i < N; i++) {
    const a = i * 7, b = (i + 1) * 7;
    quad(a + 0, b + 0, b + 1, a + 1); quad(a + 1, b + 1, b + 2, a + 2); quad(a + 2, b + 2, b + 3, a + 3); // left (outward winding)
    quad(a + 0, a + 4, b + 4, b + 0); quad(a + 4, a + 5, b + 5, b + 4); quad(a + 5, a + 6, b + 6, b + 5); // right
  }
  // transom (stern cap)
  I.push(0, 1, 4, 1, 2, 5, 1, 5, 4, 2, 3, 6, 2, 6, 5);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
  g.computeVertexNormals(); const ng = g.toNonIndexed(); ng.computeVertexNormals(); g.dispose();
  ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  const deckAt = (z) => { const t = Math.min(1, Math.max(0, (z + L / 2) / L)), i = Math.min(N - 1, (t * N) | 0), f = t * N - i, a = st[i], b = st[i + 1]; return [a.w + (b.w - a.w) * f, a.gun + (b.gun - a.gun) * f]; };
  return { geo: ng, deckAt, st };
}

function addHull(b, h) { // vertex-coloured hull goes in as-is (colour attribute per vertex)
  const P = h.geo.attributes.position.array, N = h.geo.attributes.normal.array, C = h.geo.attributes.color.array, col = new THREE.Color();
  for (let i = 0; i < P.length; i += 3) b.vert(P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], 0, 0, col.setRGB(C[i], C[i + 1], C[i + 2]));
}
function deck(b, h, z0, z1, col, inset = 0.12) { // flat deck strips between gunwales
  for (let z = z0; z < z1 - 0.01; z += 0.5) { const z2 = Math.min(z1, z + 0.5), [w1, y1] = h.deckAt(z), [w2, y2] = h.deckAt(z2), y = Math.min(y1, y2) - 0.12; const w = Math.min(w1, w2) - inset; if (w > 0.05) b.addGeometry(BOX, m4(0, y, (z + z2) / 2, 0, w * 2, 0.06, z2 - z), col); }
}
function seg(b, a, c, r, col) { // thin tube between two points
  const d = new THREE.Vector3().subVectors(c, a), L = d.length(); if (L < 1e-3) return;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  b.addGeometry(CYL, new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(r, L, r)), col);
}
function rail(b, h, z0, z1, hgt, col) { // bow rail: posts + top tube on both sides, joined at the bow
  const steps = 7, V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const s of [-1, 1]) {
    let prev = null;
    for (let k = 0; k <= steps; k++) {
      const z = z0 + (z1 - z0) * (k / steps), [w, y] = h.deckAt(z), p = V(s * (w - 0.1), y, z), top = V(s * (w - 0.12), y + hgt, z);
      seg(b, p, top, 0.025, col); if (prev) seg(b, prev, top, 0.022, col); prev = top;
    }
    const [wb, yb] = h.deckAt(z1 + 0.35); seg(b, prev, V(0, yb + hgt, z1 + 0.35), 0.022, col);
  }
}
const finish = (b) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3)); g.computeBoundingSphere(); return g; };

export function boatVariants() {
  const white = 0xf6f6f2, teak = 0xb98a5a, glass = 0x1d2a33, steel = 0xd8dde0, black = 0x1b1d20, out = [];
  { // 0: center console (7.6 m) — T-top, twin outboards, leaning post
    const b = new Batch(), h = hull(7.6, 2.6, 0.75, 0.55, white, 0xe9ecef, 0x1f6f9f); addHull(b, h); deck(b, h, -3.6, 3.2, 0xe8e4dc);
    const [, yd] = h.deckAt(0); b.addGeometry(BOX, m4(0, yd + 0.45, 0.3, 0, 0.9, 0.9, 1.1), white); b.addGeometry(BOX, m4(0, yd + 1.05, 0.75, 0, 0.85, 0.35, 0.05), glass);
    for (const [x, z] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 1.0], [0.55, 1.0]]) seg(b, new THREE.Vector3(x, yd, z), new THREE.Vector3(x * 0.95, yd + 2.0, z), 0.035, steel);
    b.addGeometry(BOX, m4(0, yd + 2.05, 0.35, 0, 1.4, 0.07, 1.8), 0x24476b);
    for (const x of [-0.45, 0.45]) { b.addGeometry(BOX, m4(x, 0.75, -3.95, 0, 0.42, 0.75, 0.5), black); b.addGeometry(BOX, m4(x, 0.15, -4.0, 0, 0.12, 0.6, 0.18), 0x2b2b2b); }
    rail(b, h, 1.4, 3.3, 0.45, steel); out.push(finish(b));
  }
  { // 1: express cruiser (10 m) — wraparound windshield, hardtop, sun pad, bow rail
    const b = new Batch(), h = hull(10, 3.2, 0.9, 0.75, white, 0xeef0f2, 0x2f2f33); addHull(b, h); deck(b, h, -4.8, 4.6, 0xf2efe8); deck(b, h, -4.8, -2.0, teak, 0.2);
    const [, yd] = h.deckAt(0);
    b.addGeometry(BOX, m4(0, yd + 0.35, 1.2, 0, 2.7, 0.7, 3.4), white); // cabin trunk
    b.addGeometry(BOX, new THREE.Matrix4().compose(new THREE.Vector3(0, yd + 1.05, -0.35), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0, 0)), new THREE.Vector3(2.6, 0.06, 1.3)), glass);
    for (const x of [-1.25, 1.25]) b.addGeometry(BOX, m4(x, yd + 1.15, -1.0, 0, 0.06, 0.8, 1.6), glass);
    b.addGeometry(BOX, m4(0, yd + 1.9, -1.4, 0, 2.6, 0.12, 2.4), white); for (const x of [-1.2, 1.2]) b.addGeometry(BOX, m4(x, yd + 1.5, -2.5, 0, 0.1, 0.8, 0.1), white);
    b.addGeometry(BOX, m4(0, yd + 0.78, 2.4, 0, 2.0, 0.12, 1.6), 0xe6dccb); // sun pad
    for (const z of [0.4, 1.4]) b.addGeometry(BOX, m4(0, yd + 0.72, z, 0, 2.2, 0.05, 0.25), glass); // cabin ports
    rail(b, h, 0.2, 4.4, 0.55, steel); out.push(finish(b));
  }
  { // 2: sloop (9 m) — low coachroof, mast + boom with furled main, lifelines, dark green hull
    const b = new Batch(), h = hull(9, 2.9, 1.0, 0.45, 0x1f4a3a, 0x7a2a22, 0xf2efe8); addHull(b, h); deck(b, h, -4.3, 4.2, 0xefe9dc);
    const [, yd] = h.deckAt(0);
    b.addGeometry(BOX, m4(0, yd + 0.3, 0.3, 0, 1.9, 0.5, 3.2), 0xf2efe8); for (const z of [-0.4, 0.6, 1.5]) for (const x of [-0.96, 0.96]) b.addGeometry(BOX, m4(x, yd + 0.36, z, 0, 0.03, 0.16, 0.5), glass);
    seg(b, new THREE.Vector3(0, yd, 1.4), new THREE.Vector3(0, yd + 11.5, 1.4), 0.08, 0xc8ccd0);
    seg(b, new THREE.Vector3(0, yd + 1.2, 1.3), new THREE.Vector3(0, yd + 1.3, -2.6), 0.07, 0xc8ccd0);
    seg(b, new THREE.Vector3(0, yd + 1.45, 1.2), new THREE.Vector3(0, yd + 1.45, -2.4), 0.2, 0x1d4e89); // sail cover
    seg(b, new THREE.Vector3(0, yd + 11.4, 1.4), new THREE.Vector3(0, yd + 0.1, 4.4), 0.012, 0x9aa0a6); seg(b, new THREE.Vector3(0, yd + 11.4, 1.4), new THREE.Vector3(0, yd + 0.1, -4.2), 0.012, 0x9aa0a6);
    for (const s of [-1, 1]) { const [w] = h.deckAt(1.4); seg(b, new THREE.Vector3(0, yd + 11, 1.4), new THREE.Vector3(s * w, yd, 1.4), 0.01, 0x9aa0a6); }
    rail(b, h, -3.8, 3.9, 0.6, steel); out.push(finish(b));
  }
  { // 3: motor yacht (14 m) — two-tier superstructure, dark window bands, flybridge with rails
    const b = new Batch(), h = hull(14, 4.2, 1.2, 1.1, white, 0xdfe3e6, 0x14233a); addHull(b, h); deck(b, h, -6.7, 6.4, 0xf2efe8); deck(b, h, -6.7, -4.6, teak, 0.25);
    const [, yd] = h.deckAt(0);
    b.addGeometry(BOX, m4(0, yd + 0.95, -0.4, 0, 3.4, 1.9, 7.2), white); b.addGeometry(BOX, m4(0, yd + 1.15, -0.4, 0, 3.44, 0.8, 6.6), glass);
    b.addGeometry(BOX, m4(0, yd + 1.2, 3.35, 0, 3.1, 1.2, 0.5), glass);
    b.addGeometry(BOX, m4(0, yd + 2.05, -0.9, 0, 3.6, 0.14, 7.8), white); // flybridge deck / overhang
    b.addGeometry(BOX, m4(0, yd + 2.6, 0.8, 0, 2.6, 0.9, 1.8), white); b.addGeometry(BOX, m4(0, yd + 2.75, 1.65, 0, 2.5, 0.5, 0.06), glass);
    b.addGeometry(BOX, m4(0, yd + 3.6, -0.6, 0, 0.2, 1.1, 0.2), 0xe8e8e8); b.addGeometry(BOX, m4(0, yd + 4.1, -0.6, 0, 1.6, 0.08, 0.3), 0xe8e8e8); // radar arch
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const s of [-1, 1]) { for (let z = -4.5; z <= 2.5; z += 1) seg(b, V(s * 1.75, yd + 2.12, z), V(s * 1.75, yd + 2.75, z), 0.025, steel); seg(b, V(s * 1.75, yd + 2.75, -4.5), V(s * 1.75, yd + 2.75, 2.5), 0.025, steel); }
    rail(b, h, 3.4, 6.2, 0.7, steel); out.push(finish(b));
  }
  return out;
}
// length (m) of each variant before instance scale — used for spacing / colliders
export const BOAT_LEN = [7.6, 10, 9, 14];

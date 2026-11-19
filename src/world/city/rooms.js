// city-look: interior-mapping room atlas. 128 small furnished 3D rooms are modeled procedurally and rendered in ONE draw call
// into a 16 x 8 atlas; the facade shader (facade.js) looks into a different one behind every window.
// Each cell is a room seen through its open front face with the standard pre-projected layout: the front opening fills the
// cell and the back wall appears at half size, centered (camera 2 half-widths in front of the opening, farFrac = 0.5).
// Rooms are lit as they look at night with their lights on; the facade shader dims them by day.
import * as THREE from 'three';
import { rng } from './tex.js';

export const ROOM_KINDS = [
  'office',
  'residential',
  'hotel',
  'retail',
  'industrial',
  'garage',
  'lobby',
  'restaurant',
];
const COUNTS = {
  residential: 44,
  office: 28,
  hotel: 14,
  retail: 12,
  restaurant: 8,
  lobby: 8,
  industrial: 8,
  garage: 6,
};

const VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal; in vec3 color; in vec2 uv; in vec3 pm; in vec3 misc; in vec4 cellRect;
out vec3 vP; out vec3 vN; out vec3 vC; out vec2 vUv; flat out vec3 vMisc;
void main() {
  vP = pm; vN = normal; vC = color; vUv = uv; vMisc = misc;
  float dz = 3.0 - position.z;                       // camera at z = +3 looking down -z, tan(fov / 2) = 0.5
  vec2 ndc = position.xy * 2.0 / dz;
  float nz = (dz - 2.0) - 1.0;                       // front opening -> -1, back wall -> +1
  gl_Position = vec4((ndc * cellRect.zw + cellRect.xy) * dz, nz * dz, dz);
}`;
const FRAG = /* glsl */ `
precision highp float; precision highp sampler2D;
uniform sampler2D uLights;
in vec3 vP; in vec3 vN; in vec3 vC; in vec2 vUv; flat in vec3 vMisc;
out vec4 outColor;
float h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 pal(float t) { return 0.55 + 0.4 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
void main() {
  int pat = int(vMisc.x + 0.5); float emis = vMisc.y; int room = int(vMisc.z + 0.5);
  vec2 u = vUv; vec3 base = vC; float e = emis;
  if (pat == 1) { float pl = floor(u.x / 0.14); base *= 0.78 + 0.3 * h2(vec2(pl, floor((u.y + h2(vec2(pl, 3.0)) * 2.0) / 1.2))); base *= 0.85 + 0.15 * smoothstep(0.0, 0.012, abs(fract(u.x / 0.14) - 0.5) * 0.28); }
  else if (pat == 2) { vec2 c = floor(u / 0.45); base *= mod(c.x + c.y, 2.0) < 0.5 ? 1.0 : 0.72; base *= 0.9 + 0.1 * smoothstep(0.0, 0.03, min(fract(u.x / 0.45), fract(u.y / 0.45))); }
  else if (pat == 3) { base *= 0.82 + 0.3 * vn(u * 26.0) * vn(u * 7.0 + 3.0); }
  else if (pat == 4) { base *= 0.86 + 0.14 * step(0.5, fract(u.x / 0.22)); base *= 0.94 + 0.06 * vn(u * 9.0); }
  else if (pat == 5) { vec2 b = vec2(u.x / 0.24 + 0.5 * mod(floor(u.y / 0.08), 2.0), u.y / 0.08); base *= (0.75 + 0.35 * h2(floor(b))) * smoothstep(0.0, 0.08, min(fract(b.x), fract(b.y))); }
  else if (pat == 6) { float k = h2(vec2(float(room), floor(vC.r * 31.0))); vec2 q = u; float band = floor(q.y * 3.0 + q.x * (k - 0.5) * 2.0); base = mix(pal(k + band * 0.19), pal(k * 3.1 + 0.4), step(0.6, vn(q * 4.0 + k * 9.0))); base *= 0.75 + 0.25 * smoothstep(0.0, 0.05, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y))); }
  else if (pat == 7) { float bk = floor(u.x / 0.045); float hh = 0.7 + 0.3 * h2(vec2(bk, floor(u.y / 0.34) + float(room))); base = pal(h2(vec2(bk, floor(u.y / 0.34) * 7.0 + float(room)))) * (fract(u.y / 0.34) < hh * 0.86 ? 1.0 : 0.12); base *= fract(u.y / 0.34) < 0.06 ? 0.3 : 1.0; }
  else if (pat == 8) { vec2 g = floor(u * vec2(6.0, 4.0)); float on = step(0.45, h2(g + float(room))); base = mix(vC * 0.35, mix(vC, pal(h2(g * 1.7 + float(room))), 0.5), on); e = max(e, 0.9); }
  else if (pat == 9) { base *= 0.7 + 0.3 * step(0.5, fract(u.y / 0.05)); }
  else if (pat == 10) { vec2 c = fract(u / 0.6); base *= 0.9 + 0.1 * smoothstep(0.0, 0.04, min(c.x, c.y)); }
  else if (pat == 11) { base *= 0.8 + 0.2 * step(0.5, fract((u.x + u.y) / 0.12)); }
  else if (pat == 12) { vec2 c = fract(u / vec2(0.5, 0.72)); float edge = smoothstep(0.0, 0.06, min(min(c.x, 1.0 - c.x), min(c.y, 1.0 - c.y))); base *= 0.72 + 0.28 * edge; base *= 0.92 + 0.08 * vn(u * vec2(3.0, 40.0)); }
  else if (pat == 13) { base *= 0.8 + 0.25 * vn(u * 1.3) * vn(u * 5.0 + 2.0); }
  else if (pat == 14) { base *= 0.86 + 0.2 * step(0.7, h2(floor(u * 60.0))) - 0.12 * step(0.86, h2(floor(u * 47.0) + 9.0)); }
  vec4 l1 = texelFetch(uLights, ivec2(room, 0), 0), c1 = texelFetch(uLights, ivec2(room, 1), 0);
  vec4 l2 = texelFetch(uLights, ivec2(room, 2), 0), c2 = texelFetch(uLights, ivec2(room, 3), 0);
  vec3 n = normalize(vN);
  vec3 d1 = l1.xyz - vP, d2 = l2.xyz - vP;
  vec3 light = vec3(c1.a);
  light += c1.rgb * l1.w * (max(dot(n, normalize(d1)), 0.0) * 0.85 + 0.15) / (1.0 + dot(d1, d1) * 0.22);
  light += c2.rgb * l2.w * (max(dot(n, normalize(d2)), 0.0) * 0.8 + 0.2) / (1.0 + dot(d2, d2) * 0.5);
  // corners and wall/floor junctions fall off (cheap ambient occlusion from the room box)
  vec3 col = mix(base * light, base * 1.5, clamp(e, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`;

// ---- room modeling helpers (meters: x in [-W/2, W/2], y in [0, H], z in [-D, 0], opening at z = 0) ----
class Builder {
  constructor() {
    this.P = [];
    this.N = [];
    this.C = [];
    this.U = [];
    this.M = [];
    this.G = [];
    this.R = [];
    this.room = 0;
    this.W = 4;
    this.H = 2.8;
    this.D = 5;
    this.rect = [0, 0, 1, 1];
  }
  begin(room, W, H, D, rect) {
    this.room = room;
    this.W = W;
    this.H = H;
    this.D = D;
    this.rect = rect;
  }
  v(x, y, z, nx, ny, nz, c, u, v, pat, em) {
    this.P.push(x / (this.W / 2), (y - this.H / 2) / (this.H / 2), 1 + (2 * z) / this.D);
    this.G.push(x, y, z);
    this.N.push(nx, ny, nz);
    this.C.push(c[0], c[1], c[2]);
    this.U.push(u, v);
    this.M.push(pat, em, this.room);
    this.R.push(this.rect[0], this.rect[1], this.rect[2], this.rect[3]);
  }
  quad(a, b, c, d, n, col, uv, pat = 0, em = 0) {
    // a,b,c,d counter-clockwise seen from the normal side; uv = [[u,v] x4]
    const q = [a, b, c, a, c, d],
      t = [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]];
    for (let i = 0; i < 6; i++)
      this.v(q[i][0], q[i][1], q[i][2], n[0], n[1], n[2], col, t[i][0], t[i][1], pat, em);
  }
  // axis-aligned box from min corner; side: per-face pattern override { top, front }
  box(x, y, z, w, h, d, col, pat = 0, em = 0, o = {}) {
    const x1 = x + w,
      y1 = y + h,
      z1 = z + d,
      pf = o.front ?? pat,
      pt = o.top ?? pat,
      cf = o.frontCol || col,
      ef = o.frontEm ?? em;
    const un = o.unit; // unit uv (0..1 across the face) instead of meters
    const uvq = (a, b) =>
      un
        ? [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ]
        : [
            [0, 0],
            [a, 0],
            [a, b],
            [0, b],
          ];
    this.quad([x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1], [0, 0, 1], cf, uvq(w, h), pf, ef); // front (+z, faces the window)
    this.quad([x1, y, z], [x, y, z], [x, y1, z], [x1, y1, z], [0, 0, -1], col, uvq(w, h), pat, em);
    this.quad([x, y, z], [x, y, z1], [x, y1, z1], [x, y1, z], [-1, 0, 0], col, uvq(d, h), pat, em);
    this.quad(
      [x1, y, z1],
      [x1, y, z],
      [x1, y1, z],
      [x1, y1, z1],
      [1, 0, 0],
      col,
      uvq(d, h),
      pat,
      em,
    );
    this.quad(
      [x, y1, z1],
      [x1, y1, z1],
      [x1, y1, z],
      [x, y1, z],
      [0, 1, 0],
      o.topCol || col,
      uvq(w, d),
      pt,
      em,
    );
    this.quad([x, y, z], [x1, y, z], [x1, y, z1], [x, y, z1], [0, -1, 0], col, uvq(w, d), pat, em);
  }
  cyl(cx, y, cz, r, h, col, pat = 0, em = 0, seg = 8) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2,
        a1 = ((i + 1) / seg) * Math.PI * 2,
        x0 = cx + Math.cos(a0) * r,
        z0 = cz + Math.sin(a0) * r,
        x1 = cx + Math.cos(a1) * r,
        z1 = cz + Math.sin(a1) * r,
        am = (a0 + a1) / 2;
      this.quad(
        [x1, y, z1],
        [x0, y, z0],
        [x0, y + h, z0],
        [x1, y + h, z1],
        [Math.cos(am), 0, Math.sin(am)],
        col,
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        pat,
        em,
      );
      this.quad(
        [cx, y + h, cz],
        [x1, y + h, z1],
        [x0, y + h, z0],
        [cx, y + h, cz],
        [0, 1, 0],
        col,
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        pat,
        em,
      );
    }
  }
  shell(wall, floor, ceil, wp = 0, fp = 1, cp = 0, side = null) {
    const W = this.W / 2,
      H = this.H,
      D = this.D,
      sw = side || wall;
    this.quad(
      [-W, 0, 0],
      [W, 0, 0],
      [W, 0, -D],
      [-W, 0, -D],
      [0, 1, 0],
      floor,
      [
        [0, 0],
        [2 * W, 0],
        [2 * W, D],
        [0, D],
      ],
      fp,
    );
    this.quad(
      [-W, H, -D],
      [W, H, -D],
      [W, H, 0],
      [-W, H, 0],
      [0, -1, 0],
      ceil,
      [
        [0, 0],
        [2 * W, 0],
        [2 * W, D],
        [0, D],
      ],
      cp,
    );
    this.quad(
      [-W, 0, -D],
      [W, 0, -D],
      [W, H, -D],
      [-W, H, -D],
      [0, 0, 1],
      wall,
      [
        [0, 0],
        [2 * W, 0],
        [2 * W, H],
        [0, H],
      ],
      wp,
    );
    this.quad(
      [-W, 0, 0],
      [-W, 0, -D],
      [-W, H, -D],
      [-W, H, 0],
      [1, 0, 0],
      sw,
      [
        [0, 0],
        [D, 0],
        [D, H],
        [0, H],
      ],
      wp,
    );
    this.quad(
      [W, 0, -D],
      [W, 0, 0],
      [W, H, 0],
      [W, H, -D],
      [-1, 0, 0],
      sw,
      [
        [0, 0],
        [D, 0],
        [D, H],
        [0, H],
      ],
      wp,
    );
    const bb = [wall[0] * 0.55, wall[1] * 0.55, wall[2] * 0.55]; // baseboard
    this.box(-W, 0, -D, 2 * W, 0.1, 0.02, bb);
    this.box(-W, 0, -D, 0.02, 0.1, D, bb);
    this.box(W - 0.02, 0, -D, 0.02, 0.1, D, bb);
  }
}
const hsl = (h, s, l) => {
  const c = new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l);
  return [c.r, c.g, c.b];
};
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const WOODS = [
  [0.42, 0.27, 0.15],
  [0.55, 0.38, 0.22],
  [0.3, 0.19, 0.11],
  [0.66, 0.52, 0.36],
  [0.24, 0.16, 0.12],
];
const WHITE = [0.9, 0.89, 0.86];

// ---- furniture (r = seeded rng). All sit against walls or on the floor at real sizes. ----
function picture(B, r, x, y, w, h, onBack = true, sideX = 0) {
  const fr = WOODS[(r() * WOODS.length) | 0],
    art = [r(), r(), r()];
  if (onBack) {
    B.box(x, y, -B.D + 0.02, w, h, 0.03, fr);
    B.box(x + 0.04, y + 0.04, -B.D + 0.05, w - 0.08, h - 0.08, 0.01, art, 6, 0, { unit: true });
  } else {
    const X = sideX < 0 ? -B.W / 2 + 0.02 : B.W / 2 - 0.05;
    B.box(X, y, x, 0.03, h, w, fr);
  }
}
function door(B, r, x, open) {
  const c = r() < 0.5 ? WHITE : WOODS[(r() * 5) | 0];
  B.box(x - 0.05, 0, -B.D + 0.01, 1.0, 2.12, 0.04, mul(c, 0.7));
  if (open) B.box(x, 0, -B.D + 0.02, 0.9, 2.05, 0.04, [1.0, 0.9, 0.7], 0, 0.7);
  else {
    B.box(x, 0, -B.D + 0.03, 0.9, 2.05, 0.04, c, 12, 0, { unit: false });
    B.box(x + 0.78, 1.0, -B.D + 0.07, 0.06, 0.03, 0.05, [0.7, 0.65, 0.4]);
  }
}
function bookcase(B, r, x, z, w, h) {
  const c = WOODS[(r() * 5) | 0];
  B.box(x, 0, z, w, h, 0.32, c, 0, 0, { front: 7, frontCol: [1, 1, 1] });
}
function wardrobe(B, r, x, z, w) {
  const c = r() < 0.5 ? WHITE : WOODS[(r() * 5) | 0];
  B.box(x, 0, z, w, 2.2, 0.6, c, 12);
}
function plant(B, r, x, z, tall) {
  const pot = r() < 0.5 ? [0.75, 0.4, 0.28] : [0.85, 0.85, 0.82],
    g = hsl(0.28 + r() * 0.1, 0.5, 0.2 + r() * 0.12),
    h = tall ? 1.3 + r() * 0.7 : 0.5 + r() * 0.4;
  B.cyl(x, 0, z, 0.17, 0.34, pot);
  B.box(x - 0.02, 0.34, z - 0.02, 0.04, h * 0.5, 0.04, [0.3, 0.22, 0.12]);
  for (let k = 0; k < 6; k++) {
    const a = r() * 6.28,
      rr = 0.1 + r() * 0.25,
      s = 0.2 + r() * 0.22;
    B.box(
      x + Math.cos(a) * rr - s / 2,
      0.34 + h * (0.35 + r() * 0.65),
      z + Math.sin(a) * rr - s / 2,
      s,
      s * 0.8,
      s,
      mul(g, 0.8 + r() * 0.5),
    );
  }
}
function floorLamp(B, r, x, z) {
  B.cyl(x, 0, z, 0.13, 0.03, [0.2, 0.2, 0.2]);
  B.box(x - 0.012, 0, z - 0.012, 0.024, 1.5, 0.024, [0.25, 0.25, 0.25]);
  B.cyl(x, 1.45, z, 0.2, 0.3, [1.0, 0.82, 0.55], 0, 1);
  return [x, 1.55, z];
}
function tableLamp(B, r, x, y, z) {
  B.cyl(x, y, z, 0.06, 0.25, hsl(r(), 0.3, 0.4));
  B.cyl(x, y + 0.25, z, 0.14, 0.2, [1.0, 0.84, 0.6], 0, 1);
  return [x, y + 0.35, z];
}
function sofa(B, r, x, z, w, faceFront = true) {
  const c = hsl(r(), 0.15 + r() * 0.4, 0.25 + r() * 0.35),
    d = 0.9;
  B.box(x, 0.1, z, w, 0.34, d, c, 3);
  B.box(x, 0.44, faceFront ? z : z + d - 0.22, w, 0.42, 0.22, mul(c, 0.92), 3);
  B.box(x, 0.1, z, 0.18, 0.55, d, mul(c, 0.85), 3);
  B.box(x + w - 0.18, 0.1, z, 0.18, 0.55, d, mul(c, 0.85), 3);
  for (let k = 0; k < 2; k++)
    B.box(x + 0.25 + k * (w - 0.9), 0.44, z + 0.25, 0.4, 0.34, 0.14, hsl(r(), 0.5, 0.5), 11);
}
function bed(B, r, x, z, w, headAtBack = true) {
  const sheet = r() < 0.6 ? WHITE : hsl(r(), 0.3, 0.6),
    cover = hsl(r(), 0.35, 0.3 + r() * 0.35),
    hb = r() < 0.5 ? WOODS[(r() * 5) | 0] : hsl(r(), 0.2, 0.4),
    L = 2.05;
  B.box(x, 0.12, z, w, 0.4, L, sheet, 3);
  B.box(x - 0.03, 0.12, z + L * 0.38, w + 0.06, 0.44, L * 0.62, cover, r() < 0.4 ? 11 : 3);
  B.box(x - 0.05, 0, headAtBack ? z - 0.08 : z + L, w + 0.1, 1.15 + r() * 0.35, 0.08, hb, 12);
  for (let k = 0; k < (w > 1.3 ? 2 : 1); k++)
    B.box(
      x + 0.1 + k * (w / 2),
      0.52,
      z + 0.08,
      w / 2 - 0.2 > 0.3 ? w / 2 - 0.2 : w - 0.2,
      0.14,
      0.4,
      WHITE,
    );
}
function nightstand(B, r, x, z) {
  const c = WOODS[(r() * 5) | 0];
  B.box(x, 0, z, 0.45, 0.55, 0.4, c, 12);
  return tableLamp(B, r, x + 0.22, 0.55, z + 0.2);
}
function tv(B, r, x, y, z, w, onBack = true) {
  B.box(x, y, z, w, w * 0.57, 0.05, [0.04, 0.04, 0.05], 0, 0, {
    front: 8,
    frontCol: hsl(0.55 + r() * 0.2, 0.5, 0.6),
    frontEm: 1,
    unit: true,
  });
  return [x + w / 2, y + w * 0.3, z + 0.4];
}
function tvStand(B, r, x, z, w) {
  B.box(x, 0, z, w, 0.45, 0.4, WOODS[(r() * 5) | 0], 12);
}
function diningSet(B, r, x, z, n) {
  const c = WOODS[(r() * 5) | 0],
    w = n > 4 ? 1.8 : 1.2;
  B.box(x, 0.72, z, w, 0.05, 0.85, c, 1);
  for (const [dx, dz] of [
    [0.05, 0.05],
    [w - 0.11, 0.05],
    [0.05, 0.74],
    [w - 0.11, 0.74],
  ])
    B.box(x + dx, 0, z + dz, 0.06, 0.72, 0.06, mul(c, 0.8));
  const cc = r() < 0.5 ? mul(c, 0.8) : hsl(r(), 0.3, 0.4);
  for (let k = 0; k < n / 2; k++)
    for (const s of [-1, 1]) {
      const cx = x + 0.2 + (k * (w - 0.4)) / Math.max(1, n / 2 - 1 || 1),
        cz = s < 0 ? z - 0.45 : z + 0.9;
      B.box(cx - 0.2, 0.42, cz, 0.4, 0.05, 0.4, cc);
      B.box(cx - 0.2, 0.42, s < 0 ? cz : cz + 0.36, 0.4, 0.5, 0.04, cc);
    }
  if (r() < 0.6) B.cyl(x + w / 2, 0.77, z + 0.42, 0.12, 0.16, hsl(r(), 0.6, 0.5));
}
function kitchenWall(B, r, x0, x1, z) {
  const cab = r() < 0.55 ? WHITE : r() < 0.5 ? WOODS[(r() * 5) | 0] : hsl(r(), 0.3, 0.35),
    top = r() < 0.5 ? [0.2, 0.2, 0.22] : [0.85, 0.83, 0.8],
    w = x1 - x0;
  B.box(x0, 0, z, w, 0.88, 0.6, cab, 12);
  B.box(x0, 0.88, z, w, 0.04, 0.62, top, 14);
  B.box(x0, 1.45, z, w, 0.75, 0.34, cab, 12);
  B.box(x0, 0.92, z - 0.0, w, 0.53, 0.02, hsl(r(), 0.25, 0.7), 2);
  const fx = r() < 0.5 ? x0 : x1 - 0.8;
  B.box(fx, 0, z, 0.8, 1.8, 0.7, r() < 0.6 ? [0.75, 0.76, 0.78] : WHITE);
  B.box(fx + 0.36, 0.3, z + 0.7, 0.03, 1.2, 0.03, [0.3, 0.3, 0.3]);
  B.box(x0 + w * 0.5 - 0.3, 0.92, z + 0.1, 0.6, 0.02, 0.5, [0.1, 0.1, 0.1]); // cooktop
  for (let k = 0; k < 3; k++)
    B.cyl(
      x0 + 0.2 + r() * (w - 0.4),
      0.92,
      z + 0.2 + r() * 0.2,
      0.05 + r() * 0.05,
      0.1 + r() * 0.2,
      hsl(r(), 0.6, 0.5),
    );
  B.box(x0 + w * 0.5 - 0.3, 1.75, z + 0.05, 0.6, 0.12, 0.4, [0.7, 0.7, 0.72]); // hood
}
function desk(B, r, x, z, w, monitors = 1, faceBack = true) {
  const c = r() < 0.5 ? WHITE : WOODS[(r() * 5) | 0];
  B.box(x, 0.7, z, w, 0.04, 0.7, c, 1);
  B.box(x, 0, z, 0.04, 0.7, 0.7, mul(c, 0.7));
  B.box(x + w - 0.04, 0, z, 0.04, 0.7, 0.7, mul(c, 0.7));
  for (let k = 0; k < monitors; k++) {
    const mx = x + w / 2 - monitors * 0.3 + k * 0.6 + 0.04;
    B.box(mx, 0.86, z + (faceBack ? 0.12 : 0.5), 0.52, 0.32, 0.03, [0.05, 0.05, 0.06], 0, 0, {
      front: faceBack ? 8 : 0,
      frontCol: hsl(0.5 + r() * 0.25, 0.4, 0.65),
      frontEm: faceBack ? 1 : 0,
      unit: true,
    });
    B.box(mx + 0.23, 0.74, z + (faceBack ? 0.13 : 0.51), 0.06, 0.12, 0.03, [0.1, 0.1, 0.1]);
  }
  const cz = faceBack ? z + 0.85 : z - 0.55,
    cc = r() < 0.6 ? [0.08, 0.08, 0.09] : hsl(r(), 0.5, 0.35);
  B.box(x + w / 2 - 0.24, 0.42, cz, 0.48, 0.08, 0.46, cc);
  B.box(x + w / 2 - 0.22, 0.5, faceBack ? cz + 0.4 : cz, 0.44, 0.55, 0.06, cc);
  B.cyl(x + w / 2, 0, cz + 0.23, 0.04, 0.42, [0.2, 0.2, 0.2]);
  if (r() < 0.5) B.box(x + 0.1, 0.74, z + 0.15, 0.3, 0.03 + r() * 0.2, 0.22, hsl(r(), 0.3, 0.6));
}
function person(B, r, x, z, sitting = false) {
  const skin = hsl(0.07, 0.35, 0.3 + r() * 0.35),
    top = hsl(r(), 0.5, 0.3 + r() * 0.4),
    bot = hsl(0.6 + r() * 0.1, 0.2, 0.15 + r() * 0.2),
    y = sitting ? 0.45 : 0.85;
  if (!sitting) {
    B.box(x - 0.15, 0, z - 0.09, 0.13, 0.85, 0.18, bot);
    B.box(x + 0.02, 0, z - 0.09, 0.13, 0.85, 0.18, bot);
  }
  B.box(x - 0.19, y, z - 0.11, 0.38, 0.6, 0.22, top);
  B.box(x - 0.1, y + 0.62, z - 0.1, 0.2, 0.24, 0.2, skin);
  B.box(x - 0.11, y + 0.78, z - 0.11, 0.22, 0.1, 0.22, hsl(0.08, 0.3, 0.05 + r() * 0.3));
}
function ceilingFan(B, r, x, z) {
  const H = B.H;
  B.box(x - 0.02, H - 0.3, z - 0.02, 0.04, 0.3, 0.04, [0.3, 0.3, 0.3]);
  for (let k = 0; k < 4; k++) {
    const a = k * 1.5708 + 0.4;
    B.box(
      x + Math.cos(a) * 0.35 - 0.3,
      H - 0.33,
      z + Math.sin(a) * 0.35 - 0.07,
      0.6,
      0.02,
      0.14,
      WOODS[1],
    );
  }
  B.cyl(x, H - 0.42, z, 0.12, 0.1, [1, 0.9, 0.7], 0, 1);
  return [x, H - 0.5, z];
}
function pendant(B, r, x, z, drop) {
  const H = B.H,
    c = hsl(r(), 0.4, 0.4);
  B.box(x - 0.008, H - drop, z - 0.008, 0.016, drop, 0.016, [0.1, 0.1, 0.1]);
  B.cyl(x, H - drop - 0.2, z, 0.2, 0.2, c);
  B.cyl(x, H - drop - 0.22, z, 0.12, 0.04, [1, 0.88, 0.62], 0, 1);
  return [x, H - drop - 0.3, z];
}
function troffers(B, n, m) {
  const W = B.W,
    D = B.D;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++)
      B.box(
        -W / 2 + ((i + 0.5) * W) / n - 0.3,
        B.H - 0.03,
        -D + ((j + 0.5) * D) / m - 0.6,
        0.6,
        0.03,
        1.2,
        [0.95, 0.98, 1.0],
        0,
        1,
      );
}
function rug(B, r, x, z, w, d) {
  B.box(x, 0.005, z, w, 0.012, d, hsl(r(), 0.4, 0.35 + r() * 0.3), 11);
}
function shelfWall(B, r, x, y, w) {
  B.box(x, y, -B.D + 0.02, w, 0.03, 0.24, WOODS[(r() * 5) | 0]);
  for (let k = 0; k < 5; k++) {
    const s = 0.06 + r() * 0.12;
    B.box(
      x + 0.04 + r() * (w - 0.2),
      y + 0.03,
      -B.D + 0.05,
      s,
      0.08 + r() * 0.2,
      0.12,
      hsl(r(), 0.5, 0.5),
    );
  }
}
function windowBack(B, r, x, y, w, h) {
  B.box(x, y, -B.D + 0.01, w, h, 0.03, [0.06, 0.08, 0.14]);
  B.box(x - 0.04, y - 0.04, -B.D + 0.005, w + 0.08, h + 0.08, 0.02, WHITE);
  if (r() < 0.6) B.box(x, y + h * 0.5, -B.D + 0.04, w, h * 0.5, 0.01, [0.85, 0.84, 0.8], 9);
}

// ---- room templates ----
function residential(B, r, i) {
  const t = i % 6,
    W = 3.4 + r() * 1.4,
    H = 2.6 + r() * 0.4,
    D = 3.6 + r() * 2.2;
  B.begin(B.room, W, H, D, B.rect);
  const pal = r(),
    wall =
      pal < 0.35
        ? [0.88, 0.86, 0.8]
        : pal < 0.5
          ? hsl(r(), 0.35, 0.72)
          : pal < 0.65
            ? hsl(0.08 + r() * 0.08, 0.5, 0.6)
            : pal < 0.8
              ? hsl(0.45 + r() * 0.2, 0.3, 0.6)
              : [0.7, 0.68, 0.65];
  const floor =
      r() < 0.55 ? WOODS[(r() * 5) | 0] : r() < 0.5 ? [0.8, 0.76, 0.7] : hsl(r(), 0.15, 0.4),
    fp = floor === WOODS[0] || r() < 0.55 ? 1 : r() < 0.5 ? 2 : 3;
  B.shell(
    wall,
    floor,
    [0.92, 0.91, 0.88],
    r() < 0.15 ? 4 : 0,
    fp,
    0,
    r() < 0.25 ? hsl(r(), 0.4, 0.5) : null,
  );
  const X = W / 2;
  let L1 = [0, H - 0.2, -D / 2],
    L2 = null,
    warm = 0.6 + r() * 0.4;
  if (t === 0) {
    // living room
    sofa(B, r, -X + 0.3, -D + 0.25, Math.min(2.2, W - 1.2));
    rug(B, r, -X + 0.5, -D + 1.3, 2.0, 1.4);
    B.box(-X + 0.9, 0, -D + 1.6, 1.0, 0.38, 0.55, WOODS[(r() * 5) | 0], 1);
    picture(B, r, -X + 0.6 + r(), 1.4, 0.9 + r() * 0.5, 0.6 + r() * 0.3);
    if (r() < 0.7) picture(B, r, X - 1.5, 1.5, 0.5, 0.7);
    L2 = floorLamp(B, r, X - 0.5, -D + 0.5);
    plant(B, r, X - 0.5, -1.0, true);
    L1 = r() < 0.5 ? ceilingFan(B, r, 0, -D / 2) : pendant(B, r, 0, -D / 2, 0.4);
    if (r() < 0.5) person(B, r, -X + 1.2, -D + 0.75, true);
  } else if (t === 1) {
    // bedroom
    const bw = r() < 0.6 ? 1.6 : 1.0;
    bed(B, r, -bw / 2 + (r() - 0.5), -D + 0.12, bw);
    L2 = nightstand(B, r, bw / 2 + 0.25, -D + 0.1);
    wardrobe(B, r, -X + 0.05, -D + 0.05, 1.0 + r() * 0.5);
    picture(B, r, -0.5, 1.55, 1.0, 0.5);
    if (r() < 0.5) windowBack(B, r, X - 1.4, 1.0, 1.0, 1.2);
    L1 = r() < 0.6 ? ceilingFan(B, r, 0, -D / 2) : [0, H - 0.15, -D / 2];
    if (L1[1] > H - 0.2) B.cyl(0, H - 0.08, -D / 2, 0.25, 0.08, [1, 0.92, 0.75], 0, 1);
  } else if (t === 2) {
    // kitchen / dining
    kitchenWall(B, r, -X + 0.05, X - 0.05 - (r() < 0.5 ? 1.0 : 0), -D + 0.02);
    diningSet(B, r, -0.7, -D + 1.9, r() < 0.5 ? 4 : 6);
    L1 = pendant(B, r, 0, -D + 2.3, 0.5 + r() * 0.3);
    if (r() < 0.5) L2 = pendant(B, r, 0.9, -D + 2.3, 0.6);
    if (r() < 0.5) person(B, r, -X + 1 + r() * 2, -D + 1.0);
  } else if (t === 3) {
    // tv room / den
    tvStand(B, r, -0.8, -D + 0.05, 1.6);
    L2 = tv(B, r, -0.6, 0.6 + r() * 0.4, -D + 0.1, 1.2);
    bookcase(B, r, X - 1.1, -D + 0.02, 1.0, 1.9 + r() * 0.4);
    sofa(B, r, -1.0, -1.6, 2.0, false);
    rug(B, r, -1.1, -D + 0.9, 2.2, 1.5);
    plant(B, r, -X + 0.4, -D + 0.4, true);
    L1 = [0, H - 0.1, -D * 0.6];
    B.cyl(0, H - 0.06, -D * 0.6, 0.2, 0.06, [1, 0.9, 0.7], 0, 0.8);
    B.tvRoom = true;
    warm = 0.2;
  } else if (t === 4) {
    // kid's room / study / hobby
    const v = r();
    if (v < 0.35) {
      bed(B, r, -X + 0.1, -D + 0.12, 0.95);
      B.box(-X + 0.1, 1.45, -D + 0.12, 0.95, 0.3, 2.0, hsl(r(), 0.5, 0.5), 11);
      B.box(-X + 1.05, 0, -D + 0.12, 0.05, 1.75, 0.05, WOODS[1]);
      desk(B, r, X - 1.4, -D + 0.05, 1.2, 1);
      for (let k = 0; k < 4; k++)
        B.box(-X + 1.4 + r() * 1.5, 0, -D + 0.4 + r() * 1.5, 0.2, 0.2, 0.2, hsl(r(), 0.8, 0.5));
      for (let k = 0; k < 3; k++) picture(B, r, -0.4 + k * 0.6, 1.3 + r() * 0.4, 0.45, 0.6);
    } else if (v < 0.7) {
      desk(B, r, -0.8, -D + 0.05, 1.6, 2);
      bookcase(B, r, -X + 0.05, -D + 0.02, 0.9, 2.1);
      bookcase(B, r, X - 0.95, -D + 0.02, 0.9, 2.1);
      shelfWall(B, r, -0.7, 1.5, 1.4);
      if (r() < 0.6) person(B, r, 0, -D + 0.95, true);
    } else {
      B.box(-0.3, 0, -D + 0.6, 0.6, 1.0, 1.2, [0.15, 0.15, 0.17]);
      B.cyl(0, 1.0, -D + 0.9, 0.25, 0.05, [0.3, 0.3, 0.3]);
      B.box(X - 0.8, 0, -D + 0.05, 0.7, 1.7, 0.4, [0.2, 0.2, 0.2]);
      for (let k = 0; k < 3; k++)
        B.cyl(X - 0.45, 0.3 + k * 0.45, -D + 0.25, 0.18, 0.06, [0.1, 0.1, 0.1]);
      B.box(-X + 0.05, 0.4, -D + 0.3, 0.03, 1.6, 1.0, [0.6, 0.75, 0.8], 0, 0.15);
      rug(B, r, -1, -D + 0.3, 2, 2.2);
    }
    L1 = [0, H - 0.1, -D / 2];
    B.cyl(0, H - 0.07, -D / 2, 0.22, 0.07, [1, 0.92, 0.78], 0, 1);
  } else {
    // studio: a bit of everything, cluttered
    bed(B, r, -X + 0.1, -D + 0.12, 1.4);
    kitchenWall(B, r, X - 2.0, X - 0.05, -D + 0.02);
    sofa(B, r, -X + 0.3, -1.3, 1.7, false);
    L2 = floorLamp(B, r, -X + 0.4, -D + 2.6);
    picture(B, r, -X + 0.3, 1.5, 0.8, 0.6);
    for (let k = 0; k < 5; k++)
      B.box(
        -0.5 + r() * 2,
        0,
        -D + 1.5 + r() * 1.5,
        0.3 + r() * 0.3,
        0.25 + r() * 0.3,
        0.3 + r() * 0.2,
        hsl(0.08, 0.35, 0.45),
      ); // moving boxes
    L1 = [0.3, H - 0.1, -D / 2];
    B.cyl(0.3, H - 0.07, -D / 2, 0.2, 0.07, [1, 0.9, 0.72], 0, 1);
    if (r() < 0.5) plant(B, r, 0, -D + 0.4, true);
  }
  if (r() < 0.25) door(B, r, X - 1.2, r() < 0.5);
  return { L1, L2, warm, amb: 0.1 + r() * 0.08, depth: D };
}
function office(B, r, i) {
  const t = i % 5,
    W = 4.5 + r() * 2,
    H = 2.75 + r() * 0.3,
    D = 5 + r() * 4;
  B.begin(B.room, W, H, D, B.rect);
  const wall = r() < 0.6 ? [0.86, 0.87, 0.88] : hsl(0.55 + r() * 0.1, 0.2, 0.6),
    carpet = hsl(0.55 + r() * 0.15, 0.2, 0.25 + r() * 0.15);
  B.shell(wall, carpet, [0.93, 0.93, 0.92], 0, 3, 10, r() < 0.3 ? hsl(r(), 0.5, 0.4) : null);
  troffers(B, 2, Math.max(2, Math.round(D / 2.6)));
  const X = W / 2;
  if (t === 0) {
    // open plan cubicles
    for (let row = 0; row < Math.floor(D / 2.2); row++)
      for (let c = 0; c < 2; c++) {
        const x = -X + 0.3 + c * (W / 2),
          z = -D + 0.3 + row * 2.2;
        B.box(x, 0, z, W / 2 - 0.5, 1.35, 0.05, hsl(0.58, 0.15, 0.55), 3);
        B.box(x, 0, z, 0.05, 1.35, 1.6, hsl(0.58, 0.15, 0.55), 3);
        desk(B, r, x + 0.15, z + 0.1, W / 2 - 0.9, 1 + (r() < 0.4 ? 1 : 0));
        if (r() < 0.45) person(B, r, x + W / 4 - 0.3, z + 1.15, true);
      }
  } else if (t === 1) {
    // conference room
    const c = WOODS[(r() * 5) | 0];
    B.box(-1.4, 0.7, -D + 1.2, 2.8, 0.06, 1.2, c, 1);
    B.box(-0.2, 0, -D + 1.6, 0.4, 0.7, 0.4, mul(c, 0.6));
    for (let k = 0; k < 4; k++)
      for (const s of [0, 1]) {
        const cx = -1.2 + k * 0.8,
          cz = s ? -D + 2.5 : -D + 0.6;
        B.box(cx - 0.22, 0.42, cz, 0.44, 0.08, 0.44, [0.1, 0.1, 0.11]);
        B.box(cx - 0.22, 0.5, s ? cz + 0.38 : cz, 0.44, 0.5, 0.06, [0.1, 0.1, 0.11]);
      }
    B.box(-1.2, 0.9, -D + 0.02, 2.4, 1.3, 0.04, [0.97, 0.97, 0.97], 0, 0.25);
    tv(B, r, X - 1.6, 1.0, -D + 0.06, 1.3);
    if (r() < 0.6) {
      person(B, r, -0.8, -D + 0.8, true);
      person(B, r, 0.5, -D + 2.6, true);
    }
  } else if (t === 2) {
    // private office
    desk(B, r, -0.9, -D + 1.0, 1.8, 2, false);
    bookcase(B, r, -X + 0.05, -D + 0.02, 1.2, 2.0);
    bookcase(B, r, X - 1.25, -D + 0.02, 1.2, 2.0);
    picture(B, r, -0.5, 1.4, 1.0, 0.7);
    plant(B, r, X - 0.5, -1.0, true);
    sofa(B, r, -X + 0.3, -1.4, 1.6, false);
  } else if (t === 3) {
    // rows of desks, file cabinets
    for (let row = 0; row < Math.floor(D / 1.7); row++) {
      desk(B, r, -X + 0.3, -D + 0.3 + row * 1.7, 1.4, 1);
      desk(B, r, X - 1.7, -D + 0.3 + row * 1.7, 1.4, 2);
      if (r() < 0.5) person(B, r, -X + 1.0, -D + 1.35 + row * 1.7, true);
    }
    for (let k = 0; k < 4; k++)
      B.box(-0.9 + k * 0.48, 0, -D + 0.03, 0.46, 1.3, 0.6, [0.6, 0.62, 0.64], 12);
  } else {
    // lounge / break room
    kitchenWall(B, r, -X + 0.05, 0.5, -D + 0.02);
    B.cyl(1.2, 0.72, -D + 1.3, 0.45, 0.04, WHITE);
    B.cyl(1.2, 0, -D + 1.3, 0.05, 0.72, [0.3, 0.3, 0.3]);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1;
      B.box(
        1.2 + Math.cos(a) * 0.7 - 0.2,
        0.44,
        -D + 1.3 + Math.sin(a) * 0.7 - 0.2,
        0.4,
        0.05,
        0.4,
        hsl(r(), 0.6, 0.5),
      );
    }
    B.box(X - 0.9, 0, -D + 0.03, 0.8, 1.9, 0.7, [0.1, 0.1, 0.12], 0, 0, {
      front: 8,
      frontCol: [0.9, 0.3, 0.3],
      frontEm: 0.7,
      unit: true,
    });
    plant(B, r, -X + 0.4, -1.0, true);
    person(B, r, 0.3, -D + 1.8);
  }
  if (r() < 0.3) door(B, r, X - 1.3, r() < 0.4);
  return {
    L1: [0, H - 0.15, -D * 0.45],
    L2: [0, H - 0.15, -D * 0.85],
    warm: 0.05 + r() * 0.2,
    amb: 0.2,
    depth: D,
    l2k: 0.7,
  };
}
function hotel(B, r, i) {
  const W = 3.6 + r() * 0.8,
    H = 2.7 + r() * 0.2,
    D = 5 + r() * 1.5;
  B.begin(B.room, W, H, D, B.rect);
  const scheme = i % 4,
    wall = [
      [0.88, 0.84, 0.76],
      [0.74, 0.8, 0.82],
      [0.84, 0.76, 0.7],
      [0.92, 0.92, 0.9],
    ][scheme],
    accent = [hsl(0.08, 0.5, 0.45), hsl(0.5, 0.5, 0.35), hsl(0.95, 0.4, 0.45), hsl(0.13, 0.7, 0.5)][
      scheme
    ];
  B.shell(
    wall,
    r() < 0.6 ? hsl(0.6 * r(), 0.25, 0.3) : WOODS[3],
    [0.94, 0.93, 0.9],
    0,
    r() < 0.6 ? 3 : 1,
    0,
    r() < 0.4 ? accent : null,
  );
  const X = W / 2,
    twin = r() < 0.4;
  let L2;
  if (twin) {
    bed(B, r, -X + 0.25, -D + 0.12, 1.05);
    bed(B, r, X - 1.3, -D + 0.12, 1.05);
    L2 = nightstand(B, r, -0.22, -D + 0.1);
  } else {
    bed(B, r, -0.9, -D + 0.12, 1.8);
    L2 = nightstand(B, r, -1.45, -D + 0.1);
    nightstand(B, r, 1.0, -D + 0.1);
  }
  B.box(-X + 0.2, 1.25, -D + 0.02, W - 0.4, 0.9, 0.05, accent, r() < 0.5 ? 12 : 11);
  picture(B, r, -0.45, 1.45, 0.9, 0.5);
  B.box(X - 0.55, 0, -2.6, 0.5, 0.72, 1.3, WOODS[(r() * 5) | 0], 1);
  tv(B, r, X - 0.1, 0.95, -2.5, 1.0, false);
  B.box(X - 0.08, 0.95, -2.5, 0.05, 0.6, 1.0, [0.04, 0.04, 0.05]);
  if (r() < 0.6) {
    B.box(-X + 0.1, 0.45, -1.4, 0.5, 0.05, 0.8, [0.25, 0.2, 0.15]);
    B.box(-X + 0.12, 0.5, -1.3, 0.45, 0.25, 0.6, hsl(r(), 0.4, 0.3));
  } // luggage on a rack
  if (r() < 0.5) L2 = floorLamp(B, r, -X + 0.4, -D + 2.6);
  if (r() < 0.4) person(B, r, r() - 0.5, -1.2);
  B.cyl(0, H - 0.06, -D * 0.4, 0.18, 0.06, [1, 0.9, 0.72], 0, 0.8);
  return { L1: [0, H - 0.2, -D * 0.4], L2, warm: 0.8, amb: 0.1, depth: D };
}
function retail(B, r, i) {
  const W = 5 + r() * 2,
    H = 3.4 + r() * 0.8,
    D = 6 + r() * 4;
  B.begin(B.room, W, H, D, B.rect);
  const t = i % 4,
    wall = t === 0 ? [0.95, 0.95, 0.94] : t === 1 ? [0.12, 0.12, 0.13] : hsl(r(), 0.3, 0.7),
    floor = r() < 0.5 ? [0.8, 0.8, 0.78] : WOODS[(r() * 5) | 0];
  B.shell(wall, floor, t === 1 ? [0.1, 0.1, 0.1] : [0.9, 0.9, 0.9], 0, r() < 0.5 ? 14 : 1);
  const X = W / 2;
  for (let k = 0; k < 4; k++)
    B.cyl(-X + ((k + 0.5) * W) / 4, H - 0.12, -D * 0.5, 0.1, 0.12, [1, 0.97, 0.9], 0, 1);
  if (t === 0 || t === 3) {
    // shelves of stock (grocery / convenience / pharmacy)
    for (let k = 0; k < 3; k++) {
      const x = -X + 0.6 + (k * (W - 1.2)) / 3;
      B.box(x, 0, -D + 1.0, 0.5, 1.7, D - 2.4, [0.82, 0.82, 0.8]);
      for (let s = 0; s < 4; s++)
        for (let q = 0; q < 6; q++)
          B.box(
            x - 0.02,
            0.15 + s * 0.4,
            -D + 1.1 + (q * (D - 2.6)) / 6,
            0.54,
            0.28,
            (D - 2.6) / 6 - 0.06,
            hsl(r(), 0.75, 0.5),
          );
    }
    B.box(-X + 0.02, 0, -D + 0.02, W - 0.04, 2.1, 0.5, [0.85, 0.85, 0.84], 0, 0, {
      front: 7,
      frontCol: [1, 1, 1],
    });
    B.box(X - 1.6, 0, -1.6, 1.4, 1.0, 0.6, hsl(r(), 0.5, 0.4));
    person(B, r, X - 0.9, -2.0);
  } else if (t === 1) {
    // boutique: racks, mannequins, spot lights
    for (let k = 0; k < 2; k++) {
      const x = k ? X - 0.4 : -X + 0.1;
      B.box(x, 1.5, -D + 0.5, 0.3, 0.03, D - 1.5, [0.7, 0.7, 0.7]);
      for (let q = 0; q < 9; q++)
        B.box(
          x + 0.02,
          0.6,
          -D + 0.6 + (q * (D - 1.8)) / 9,
          0.26,
          0.9,
          0.06,
          hsl(r(), 0.5, 0.25 + r() * 0.5),
        );
    }
    for (let k = 0; k < 3; k++) {
      const x = -1 + k;
      B.cyl(x, 0, -D + 1.2, 0.2, 0.05, [0.8, 0.8, 0.8]);
      person(B, r, x, -D + 1.2);
    }
    B.box(-0.8, 0, -1.8, 1.6, 0.9, 0.6, [0.95, 0.95, 0.95], 14);
    picture(B, r, -1.0, 1.6, 2.0, 1.0);
  } else {
    // electronics / shoes: wall grid of products with lit shelves
    for (let s = 0; s < 5; s++) {
      B.box(-X + 0.2, 0.5 + s * 0.5, -D + 0.05, W - 0.4, 0.03, 0.3, [0.95, 0.95, 0.95], 0, 0.25);
      for (let q = 0; q < 10; q++)
        B.box(
          -X + 0.3 + (q * (W - 0.6)) / 10,
          0.53 + s * 0.5,
          -D + 0.1,
          0.25,
          0.14 + r() * 0.12,
          0.2,
          hsl(r(), 0.7, 0.5),
        );
    }
    for (let k = 0; k < 2; k++) {
      B.box(-1.6 + k * 2.2, 0, -D + 2.0, 1.2, 0.85, 2.0, WOODS[3], 1);
      for (let q = 0; q < 6; q++)
        B.box(
          -1.5 + k * 2.2 + (q % 2) * 0.55,
          0.85,
          -D + 2.1 + ((q / 2) | 0) * 0.6,
          0.35,
          0.03,
          0.25,
          [0.08, 0.08, 0.09],
          0,
          0,
          { top: 8 },
        );
    }
    person(B, r, 0, -D + 1.3);
    person(B, r, 1.4, -2.2);
  }
  return {
    L1: [0, H - 0.3, -D * 0.5],
    L2: [0, H - 0.3, -D + 1],
    warm: 0.3 + r() * 0.3,
    amb: 0.3,
    depth: D,
    l2k: 0.8,
  };
}
function restaurant(B, r, i) {
  const W = 5.5 + r() * 2,
    H = 3.2 + r() * 0.6,
    D = 6 + r() * 3;
  B.begin(B.room, W, H, D, B.rect);
  const wall =
      i % 3 === 0 ? hsl(0.03, 0.5, 0.3) : i % 3 === 1 ? [0.85, 0.8, 0.7] : hsl(0.45, 0.3, 0.3),
    X = W / 2;
  B.shell(
    wall,
    r() < 0.5 ? WOODS[(r() * 5) | 0] : [0.5, 0.48, 0.45],
    [0.2, 0.18, 0.16],
    i % 3 === 0 ? 5 : 0,
    r() < 0.5 ? 1 : 2,
  );
  let L2 = null;
  for (let k = 0; k < 2; k++)
    for (let j = 0; j < Math.floor((D - 2) / 1.9); j++) {
      const x = k ? 0.5 : -X + 0.5,
        z = -D + 1.9 + j * 1.9;
      B.box(x, 0.72, z, 1.3, 0.04, 0.8, r() < 0.5 ? WHITE : hsl(0.0, 0.6, 0.4), 11);
      B.box(x + 0.6, 0, z + 0.35, 0.1, 0.72, 0.1, [0.2, 0.2, 0.2]);
      L2 = pendant(B, r, x + 0.65, z + 0.4, 0.8 + r() * 0.3);
      for (const s of [-0.5, 0.85]) B.box(x + 0.4, 0.42, z + s, 0.45, 0.5, 0.42, WOODS[2]);
      if (r() < 0.6) person(B, r, x + 0.6, z - 0.3, true);
      if (r() < 0.6) person(B, r, x + 0.6, z + 1.05, true);
    }
  B.box(-X + 0.3, 0, -D + 0.05, W - 0.6, 1.1, 0.6, WOODS[4], 12);
  B.box(-X + 0.3, 1.4, -D + 0.02, W - 0.6, 1.3, 0.25, [0.15, 0.1, 0.08], 0, 0, {
    front: 7,
    frontCol: [1, 1, 1],
  });
  B.box(-X + 0.3, 1.38, -D + 0.02, W - 0.6, 0.03, 0.3, [1, 0.8, 0.5], 0, 0.9);
  person(B, r, 0, -D + 0.9);
  return { L1: [0, H - 0.6, -D * 0.5], L2, warm: 0.95, amb: 0.08, depth: D };
}
function lobby(B, r, i) {
  const W = 6 + r() * 2,
    H = 3.8 + r() * 1.2,
    D = 7 + r() * 3;
  B.begin(B.room, W, H, D, B.rect);
  const stone = i % 2 ? [0.85, 0.8, 0.7] : [0.3, 0.3, 0.32],
    X = W / 2;
  B.shell(
    stone,
    i % 2 ? [0.7, 0.66, 0.6] : [0.82, 0.8, 0.76],
    [0.9, 0.9, 0.88],
    14,
    2,
    0,
    r() < 0.5 ? WOODS[(r() * 5) | 0] : null,
  );
  B.box(-1.6, 0, -D + 1.2, 3.2, 1.1, 0.7, r() < 0.5 ? WOODS[1] : [0.9, 0.9, 0.9], 14);
  B.box(-1.6, 1.08, -D + 1.15, 3.2, 0.04, 0.8, [0.15, 0.15, 0.15]);
  person(B, r, -0.4, -D + 0.8);
  B.box(-1.2, 1.7, -D + 0.03, 2.4, 0.5, 0.05, [1, 0.9, 0.7], 0, 0.6);
  for (const s of [-1, 1]) {
    plant(B, r, s * (X - 0.6), -D + 0.6, true);
    B.box(s * (X - 1.4) - 0.45, 0.1, -2.6, 0.9, 0.4, 0.9, hsl(r(), 0.3, 0.35), 3);
  }
  for (let k = 0; k < 3; k++) pendant(B, r, -1.2 + k * 1.2, -D * 0.5, 0.6 + (k % 2) * 0.4);
  B.box(X - 1.9, 0, -D + 0.02, 1.0, 2.2, 0.05, [0.7, 0.7, 0.72]);
  B.box(X - 1.42, 0, -D + 0.04, 0.02, 2.2, 0.04, [0.2, 0.2, 0.2]); // elevator doors
  return {
    L1: [0, H - 0.5, -D * 0.5],
    L2: [0, 2.0, -D + 0.6],
    warm: 0.6,
    amb: 0.22,
    depth: D,
    l2k: 0.8,
  };
}
function industrial(B, r, i) {
  const W = 7 + r() * 3,
    H = 5 + r() * 2,
    D = 9 + r() * 4;
  B.begin(B.room, W, H, D, B.rect);
  const X = W / 2;
  B.shell([0.6, 0.6, 0.58], [0.45, 0.44, 0.42], [0.35, 0.36, 0.38], i % 2 ? 5 : 13, 13, 9);
  for (let k = 0; k < 2; k++) {
    const x = k ? X - 1.4 : -X + 0.2;
    for (let lv = 0; lv < 3; lv++) {
      B.box(x, 0.1 + lv * 1.5, -D + 0.5, 1.2, 0.08, D - 2, [0.9, 0.45, 0.1]);
      for (let q = 0; q < 4; q++)
        if (r() < 0.8)
          B.box(
            x + 0.1,
            0.18 + lv * 1.5,
            -D + 0.7 + (q * (D - 2.4)) / 4,
            1.0,
            0.7 + r() * 0.5,
            (D - 2.4) / 4 - 0.3,
            r() < 0.6 ? hsl(0.08, 0.4, 0.45) : hsl(r(), 0.5, 0.45),
            3,
          );
    }
    for (const z of [-D + 0.5, -1.6]) {
      B.box(x, 0, z, 0.08, 4.6, 0.08, [0.15, 0.3, 0.6]);
      B.box(x + 1.12, 0, z, 0.08, 4.6, 0.08, [0.15, 0.3, 0.6]);
    }
  }
  for (let k = 0; k < 4; k++)
    B.cyl(
      -0.9 + (k % 2) * 0.65,
      0,
      -D + 1 + ((k / 2) | 0) * 0.65,
      0.29,
      0.88,
      hsl(r() < 0.5 ? 0.6 : 0.02, 0.6, 0.35),
    );
  B.box(0.5, 0, -3.5, 1.1, 0.14, 1.2, WOODS[3], 1);
  B.box(0.55, 0.14, -3.45, 1.0, 0.9, 1.1, hsl(0.08, 0.4, 0.5), 3); // pallet with boxes
  B.box(-0.3, 0.3, -2.4, 0.9, 1.2, 1.9, [0.95, 0.7, 0.1]);
  B.box(-0.2, 1.5, -2.2, 0.7, 0.7, 0.9, [0.2, 0.2, 0.2]); // forklift-ish
  for (let k = 0; k < 2; k++)
    B.box(-0.6, H - 0.5, -D + 2 + k * 4, 1.2, 0.08, 0.25, [0.95, 1, 1], 0, 1);
  return {
    L1: [0, H - 0.8, -D * 0.4],
    L2: [0, H - 0.8, -D * 0.8],
    warm: 0.1,
    amb: 0.14,
    depth: D,
    l2k: 0.9,
  };
}
function garage(B, r, i) {
  const W = 8,
    H = 2.7,
    D = 11;
  B.begin(B.room, W, H, D, B.rect);
  B.shell([0.62, 0.62, 0.6], [0.36, 0.36, 0.35], [0.55, 0.55, 0.53], 13, 13, 13);
  for (const x of [-2.6, 2.6])
    for (const z of [-3, -8]) B.box(x - 0.25, 0, z - 0.25, 0.5, H, 0.5, [0.7, 0.7, 0.68], 13);
  for (let k = 0; k < 3; k++)
    if (r() < 0.8) {
      const x = -3.2 + k * 2.6,
        c = hsl(r(), r() < 0.5 ? 0.6 : 0.05, 0.15 + r() * 0.6),
        z = -D + 0.6 + (k % 2) * 0.3;
      B.box(x, 0.3, z, 1.8, 0.55, 4.3, c);
      B.box(x + 0.12, 0.85, z + 0.9, 1.56, 0.5, 2.3, mul(c, 0.45));
      for (const wz of [0.6, 3.2])
        for (const wx of [-0.05, 1.65])
          B.box(x + wx, 0, z + wz, 0.2, 0.62, 0.62, [0.05, 0.05, 0.05]);
      B.box(x + 0.1, 0.6, z + 4.3, 0.35, 0.14, 0.02, [1, 0.2, 0.15], 0, 0.5);
      B.box(x + 1.35, 0.6, z + 4.3, 0.35, 0.14, 0.02, [1, 0.2, 0.15], 0, 0.5);
    }
  B.box(-W / 2, 0.9, -D + 0.02, W, 0.12, 0.02, [0.95, 0.8, 0.1]);
  for (let k = 0; k < 3; k++)
    B.box(-0.6, H - 0.06, -2 - k * 3.5, 1.2, 0.05, 0.14, [0.9, 1, 0.98], 0, 1);
  B.box(-W / 2 + 0.1, 1.9, -D + 0.03, 0.9, 0.35, 0.03, [0.1, 0.5, 0.2], 0, 0.6);
  return { L1: [0, H - 0.2, -3], L2: [0, H - 0.2, -8], warm: 0.0, amb: 0.12, depth: D, l2k: 1.0 };
}
const GEN = { residential, office, hotel, retail, restaurant, lobby, industrial, garage };

export async function bakeRoomAtlas(renderer, opts = {}) {
  const t0 = performance.now(),
    cell = opts.cell || 256,
    cols = opts.cols || 16,
    rows = opts.rows || 8,
    total = cols * rows;
  const B = new Builder(),
    meta = [],
    kinds = {},
    lights = new Float32Array(total * 4 * 4);
  let idx = 0;
  for (const kind of [
    'residential',
    'office',
    'hotel',
    'retail',
    'restaurant',
    'lobby',
    'industrial',
    'garage',
  ]) {
    const n = Math.max(1, Math.round((COUNTS[kind] / 128) * total));
    kinds[kind] = { first: idx, count: 0 };
    for (let i = 0; i < n && idx < total; i++, idx++) {
      const r = rng(7919 * (idx + 1) + 13),
        cx = idx % cols,
        cy = Math.floor(idx / cols);
      B.room = idx;
      B.rect = [((cx + 0.5) / cols) * 2 - 1, ((cy + 0.5) / rows) * 2 - 1, 1 / cols, 1 / rows];
      B.tvRoom = false;
      const m = GEN[kind](B, r, i);
      const warm = m.warm,
        c1 = [1.0, 0.72 + 0.26 * (1 - warm), 0.45 + 0.55 * (1 - warm)],
        L2 = m.L2 || m.L1;
      lights.set([m.L1[0], m.L1[1], m.L1[2], 2.1], idx * 4);
      lights.set([c1[0], c1[1], c1[2], m.amb], (total + idx) * 4);
      lights.set([L2[0], L2[1], L2[2], m.L2 ? (m.l2k ?? 0.9) * 2.2 : 0], (2 * total + idx) * 4);
      lights.set(B.tvRoom ? [0.5, 0.65, 1.0, 0] : [1.0, 0.78, 0.5, 0], (3 * total + idx) * 4);
      meta.push({ kind, depth: m.depth, warm, tv: !!B.tvRoom });
      kinds[kind].count++;
      if (idx % 24 === 23) await new Promise((res) => setTimeout(res, 0));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(B.N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(B.C, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(B.U, 2));
  g.setAttribute('pm', new THREE.Float32BufferAttribute(B.G, 3));
  g.setAttribute('misc', new THREE.Float32BufferAttribute(B.M, 3));
  g.setAttribute('cellRect', new THREE.Float32BufferAttribute(B.R, 4));
  const lt = new THREE.DataTexture(lights, total, 4, THREE.RGBAFormat, THREE.FloatType);
  lt.minFilter = lt.magFilter = THREE.NearestFilter;
  lt.needsUpdate = true;
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uLights: { value: lt } },
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const cam = new THREE.Camera();
  const rt = new THREE.WebGLRenderTarget(cols * cell, rows * cell, {
    depthBuffer: true,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    colorSpace: THREE.SRGBColorSpace,
  });
  rt.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  // save / restore everything the bake touches (it runs inside the live game during loading)
  const prevRT = renderer.getRenderTarget(),
    prevAuto = renderer.autoClear,
    prevCol = new THREE.Color(),
    prevA = renderer.getClearAlpha(),
    prevSh = renderer.shadowMap.autoUpdate,
    prevTM = renderer.toneMapping,
    prevXr = renderer.xr.enabled;
  renderer.getClearColor(prevCol);
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.xr.enabled = false;
  renderer.autoClear = true;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevCol, prevA);
  renderer.autoClear = prevAuto;
  renderer.shadowMap.autoUpdate = prevSh;
  renderer.toneMapping = prevTM;
  renderer.xr.enabled = prevXr;
  const tris = B.P.length / 9;
  g.dispose();
  mat.dispose();
  lt.dispose();
  return {
    texture: rt.texture,
    target: rt,
    cols,
    rows,
    cell,
    farFrac: 0.5,
    kinds,
    meta,
    ms: performance.now() - t0,
    triangles: tris,
    dispose() {
      rt.dispose();
    },
  };
}

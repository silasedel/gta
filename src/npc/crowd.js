// Instanced crowd renderer (NPC-AI track): hundreds of distinct people in ONE draw call.
// Every person beyond the full-detail range is an articulated low-poly body posed in the vertex shader (walk, run,
// sit, lie, talk, phone, dance, push, swim, ride ...), with per-instance height, build, skin, hair style and color,
// clothing cut (sleeve and leg length) and colors, and hat. Looks are derived from the same `look` record as the
// full-detail character, so a person keeps their appearance when they change detail level.
import * as THREE from 'three';
import { hexToRgb01 } from './rand.js';

export const POSE = { stand: 0, walk: 1, run: 2, sit: 3, sitGround: 4, lie: 5, talk: 6, phone: 7, call: 8, dance: 9, cower: 10, film: 11, kneel: 12, push: 13, swim: 14, lean: 15, wave: 16, dead: 17, ride: 18, volley: 19, work: 20, panic: 21, carry: 22, sitEat: 23, lounge: 24, bike: 25, sip: 26, lieFront: 27, argue: 28, fish: 29 };
const REF_H = 1.75;
// joints of the reference body (meters, T-shirt mannequin 1.75 m tall, facing +Z, left side is +X)
const J = { hipY: 0.93, hipX: 0.092, kneeY: 0.50, ankleY: 0.075, waistY: 1.03, shY: 1.435, shX: 0.19, elY: 1.15, wrY: 0.885, neckY: 1.5, headY: 1.635 };

// ---------------------------------------------------------------- geometry
function buildBody() {
  const pos = [], nor = [], info = [], idx = [];
  const v = (x, y, z, nx, ny, nz, part, region, len, piece) => { pos.push(x, y, z); const l = Math.hypot(nx, ny, nz) || 1; nor.push(nx / l, ny / l, nz / l); info.push(part, region, len, piece); return pos.length / 3 - 1; };
  // tapered tube along Y from y0 (top) to y1 (bottom) centered at (cx, cz), elliptical section rx/rz per ring
  function tube(part, region, rings, radial, lenOf, piece = 0, capTop = true, capBot = true) {
    const base = pos.length / 3;
    for (let i = 0; i < rings.length; i++) {
      const [cx, y, cz, rx, rz] = rings[i];
      const prev = rings[Math.max(0, i - 1)], next = rings[Math.min(rings.length - 1, i + 1)];
      const slope = ((next[3] + next[4]) - (prev[3] + prev[4])) * 0.5 / ((next[1] - prev[1]) || -1e-3);
      for (let k = 0; k < radial; k++) {
        const a = (k / radial) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        v(cx + c * rx, y, cz + s * rz, c * rz, -slope * Math.hypot(rx, rz) * 0.7, s * rx, part, typeof region === 'function' ? region(i) : region, lenOf(y, i), piece);
      }
    }
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < radial; k++) {
      const a = base + i * radial + k, b = base + i * radial + (k + 1) % radial, c = a + radial, d = b + radial;
      idx.push(a, b, c, b, d, c);
    }
    const cap = (ri, ny) => { const [cx, y, cz] = rings[ri]; const c = v(cx, y + ny * 0.012, cz, 0, ny, 0, part, typeof region === 'function' ? region(ri) : region, lenOf(y, ri), piece); for (let k = 0; k < radial; k++) { const a = base + ri * radial + k, b = base + ri * radial + (k + 1) % radial; if (ny > 0) idx.push(c, b, a); else idx.push(c, a, b); } };
    if (capTop) cap(0, 1); if (capBot) cap(rings.length - 1, -1);
  }
  function ellipsoid(part, region, cx, cy, cz, rx, ry, rz, ws, hs, piece = 0, th0 = 0, th1 = Math.PI, lenV = 0) {
    const base = pos.length / 3;
    for (let j = 0; j <= hs; j++) { const th = th0 + (th1 - th0) * (j / hs), st = Math.sin(th), ct = Math.cos(th);
      for (let k = 0; k <= ws; k++) { const ph = (k / ws) * Math.PI * 2, c = Math.cos(ph), s = Math.sin(ph); v(cx + rx * st * c, cy + ry * ct, cz + rz * st * s, st * c / rx, ct / ry, st * s / rz, part, region, lenV, piece); } }
    for (let j = 0; j < hs; j++) for (let k = 0; k < ws; k++) { const a = base + j * (ws + 1) + k, b = a + 1, c = a + ws + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  }
  function box(part, region, cx, cy, cz, sx, sy, sz, piece = 0, lenV = 0) {
    const F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const n of F) {
      const u = [n[1], n[2], n[0]], w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      const q = [];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) q.push(v(cx + (n[0] + u[0] * a + w[0] * b) * sx / 2, cy + (n[1] + u[1] * a + w[1] * b) * sy / 2, cz + (n[2] + u[2] * a + w[2] * b) * sz / 2, n[0], n[1], n[2], part, region, lenV, piece));
      idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
  }
  const R = 8;
  // pelvis (part 0): waistband down to crotch, bottom color
  tube(0, 2, [[0, J.waistY + 0.02, 0, 0.155, 0.105], [0, J.hipY + 0.02, 0, 0.175, 0.118], [0, J.hipY - 0.1, 0, 0.165, 0.112], [0, J.hipY - 0.17, 0, 0.09, 0.08]], 10, () => 0, 0, true, true);
  // torso (part 1): region 1 = top; len = 0 at waist .. 1 at shoulders (crop tops, bikini band)
  const tl = (y) => (y - J.waistY) / (J.shY - J.waistY);
  tube(1, 1, [[0, J.shY + 0.045, 0, 0.075, 0.07], [0, J.shY + 0.01, 0.0, 0.2, 0.1], [0, J.shY - 0.1, 0.012, 0.185, 0.118], [0, J.shY - 0.22, 0.012, 0.162, 0.112], [0, J.waistY + 0.06, 0.006, 0.15, 0.1], [0, J.waistY - 0.02, 0, 0.152, 0.102]], 10, tl, 0, true, false);
  // neck + head (part 2)
  tube(2, 0, [[0, J.neckY + 0.07, 0.005, 0.048, 0.05], [0, J.neckY - 0.03, 0, 0.052, 0.054]], 7, () => 0, 0, false, false);
  ellipsoid(2, 0, 0, J.headY, 0.012, 0.084, 0.115, 0.1, 9, 6, 0);
  box(2, 0, 0, J.headY - 0.012, 0.108, 0.026, 0.04, 0.03, 0); // nose
  // hair pieces (piece = 10 + style): 1 short, 2 bob, 3 long, 4 ponytail / bun, 5 afro, 6 receding
  ellipsoid(2, 4, 0, J.headY + 0.012, -0.004, 0.088, 0.112, 0.105, 10, 5, 11, 0, Math.PI * 0.55);
  ellipsoid(2, 4, 0, J.headY - 0.005, -0.012, 0.1, 0.125, 0.112, 10, 6, 12, 0, Math.PI * 0.74);
  ellipsoid(2, 4, 0, J.headY + 0.01, -0.006, 0.09, 0.114, 0.106, 10, 5, 13, 0, Math.PI * 0.56);
  tube(2, 4, [[0, J.headY + 0.02, -0.07, 0.085, 0.05], [0, J.headY - 0.14, -0.085, 0.092, 0.045], [0, J.headY - 0.32, -0.09, 0.075, 0.03]], 8, () => 0, 13, true, true);
  ellipsoid(2, 4, 0, J.headY + 0.012, -0.004, 0.088, 0.112, 0.104, 10, 5, 14, 0, Math.PI * 0.55);
  ellipsoid(2, 4, 0, J.headY + 0.05, -0.13, 0.045, 0.045, 0.05, 7, 5, 14);
  tube(2, 4, [[0, J.headY + 0.02, -0.15, 0.03, 0.03], [0, J.headY - 0.2, -0.17, 0.022, 0.022]], 6, () => 0, 14, true, true);
  ellipsoid(2, 4, 0, J.headY + 0.035, -0.008, 0.125, 0.13, 0.13, 10, 6, 15, 0, Math.PI * 0.68);
  ellipsoid(2, 4, 0, J.headY + 0.0, -0.03, 0.086, 0.1, 0.09, 10, 4, 16, Math.PI * 0.22, Math.PI * 0.6);
  // hats (piece = 20 + hat): 1 cap, 2 wide brim, 3 hard hat, 4 beanie / wrap
  ellipsoid(2, 5, 0, J.headY + 0.03, 0, 0.094, 0.1, 0.108, 10, 4, 21, 0, Math.PI * 0.5);
  box(2, 5, 0, J.headY + 0.034, 0.14, 0.15, 0.012, 0.1, 21);
  ellipsoid(2, 5, 0, J.headY + 0.04, 0, 0.092, 0.095, 0.104, 10, 4, 22, 0, Math.PI * 0.5);
  tube(2, 5, [[0, J.headY + 0.05, 0, 0.1, 0.11], [0, J.headY + 0.035, 0, 0.21, 0.22]], 12, () => 0, 22, false, true);
  ellipsoid(2, 5, 0, J.headY + 0.035, 0, 0.105, 0.105, 0.118, 10, 4, 23, 0, Math.PI * 0.5);
  tube(2, 5, [[0, J.headY + 0.045, 0.01, 0.105, 0.12], [0, J.headY + 0.035, 0.02, 0.125, 0.15]], 10, () => 0, 23, false, true);
  ellipsoid(2, 5, 0, J.headY + 0.02, -0.004, 0.092, 0.118, 0.108, 10, 5, 24, 0, Math.PI * 0.52);
  // arms: region 6 = sleeve-or-skin by len (0 shoulder .. 1 wrist); hands always skin
  for (const s of [1, -1]) {
    const up = s > 0 ? 3 : 5, lo = s > 0 ? 4 : 6, x = s * J.shX;
    tube(up, 6, [[x, J.shY + 0.01, 0, 0.052, 0.054], [x, J.shY - 0.1, 0, 0.047, 0.05], [x, J.elY, 0, 0.04, 0.042]], R, (y) => 0.5 * (J.shY - y) / (J.shY - J.elY), 0, true, true);
    tube(lo, 6, [[x, J.elY + 0.01, 0, 0.04, 0.041], [x, J.elY - 0.1, 0, 0.038, 0.04], [x, J.wrY, 0, 0.028, 0.03]], R, (y) => 0.5 + 0.5 * (J.elY - y) / (J.elY - J.wrY), 0, true, false);
    ellipsoid(lo, 0, x, J.wrY - 0.052, 0.008, 0.021, 0.062, 0.04, 6, 4, 0);
  }
  // legs: region 7 = pants-or-skin by len (0 hip .. 1 ankle); feet = shoes
  for (const s of [1, -1]) {
    const th = s > 0 ? 7 : 9, sh = s > 0 ? 8 : 10, x = s * J.hipX;
    tube(th, 7, [[x, J.hipY - 0.02, 0, 0.085, 0.09], [x, J.hipY - 0.2, 0, 0.074, 0.08], [x, J.kneeY, 0, 0.055, 0.058]], R, (y) => 0.5 * (J.hipY - y) / (J.hipY - J.kneeY), 0, true, true);
    tube(sh, 7, [[x, J.kneeY + 0.01, 0, 0.055, 0.057], [x, J.kneeY - 0.13, -0.008, 0.052, 0.056], [x, J.ankleY + 0.02, 0, 0.036, 0.04]], R, (y) => 0.5 + 0.5 * (J.kneeY - y) / (J.kneeY - J.ankleY), 0, true, false);
    ellipsoid(sh, 3, x, 0.03, 0.05, 0.05, 0.055, 0.135, 7, 4, 0, 0, Math.PI * 0.62);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
  return g;
}

// ---------------------------------------------------------------- shader
const VERT_PARS = /* glsl */`
attribute vec4 aInfo;      // part, region, len, piece
attribute vec4 iPose;      // pose id, cadence (rad/s), phase offset, amplitude
attribute vec4 iShape;     // girth, shoulder width, hip width, bust (0 = male chest)
attribute vec4 iFlags;     // sleeve (-1 shirtless .. 1 long), leg cover (0.1 .. 1), hair style, hat
attribute vec3 iColA;      // packed skin, top, bottom
attribute vec3 iColB;      // packed hair, shoes, hat
uniform float uNpcTime;
varying vec3 vNpcA; varying vec3 vNpcB; varying vec3 vNpcObj; varying vec3 vNpcCut;
vec3 npcP; vec3 npcN;
vec3 unpackC(float f) { float b = floor(f / 65536.0); float g = floor((f - b * 65536.0) / 256.0); float r = f - b * 65536.0 - g * 256.0; vec3 c = vec3(b, g, r) / 255.0; return pow(c, vec3(2.2)); }
vec3 rX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c + v.z * s, -v.y * s + v.z * c); }   // + = swing forward
vec3 rZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
vec3 rY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
void npcPose() {
  float part = aInfo.x, piece = aInfo.w;
  vec3 p = position, n = normal;
  float girth = iShape.x, shW = iShape.y, hipW = iShape.z, bust = iShape.w;
  float hairS = iFlags.z, hat = iFlags.w;
  // ---- optional pieces: collapse the ones this person does not have
  bool hide = false;
  if (piece > 9.5 && piece < 19.5) { float st = piece - 10.0; hide = abs(st - hairS) > 0.5; if (hat > 0.5 && (st == 5.0 || st == 2.0)) hide = hide || hat > 2.5; }
  if (piece > 19.5) hide = abs((piece - 20.0) - hat) > 0.5;
  // ---- body shape
  float limbG = 0.72 + 0.28 * girth;
  vec3 hipP = vec3(${J.hipX} * hipW, ${J.hipY}, 0.0), shP = vec3(${J.shX} * shW, ${J.shY}, 0.0);
  if (part < 0.5) { p.x *= hipW * (0.8 + 0.2 * girth); p.z *= girth * (1.0 + 0.25 * max(0.0, girth - 1.0)); }
  else if (part < 1.5) {
    float t = clamp(aInfo.z, 0.0, 1.0);
    p.x *= mix(hipW * (0.82 + 0.18 * girth), shW, smoothstep(0.1, 0.9, t));
    float belly = max(0.0, girth - 1.0) * 1.6 * (1.0 - smoothstep(0.0, 0.75, t)) * step(0.0, p.z);
    p.z *= girth * (1.0 + belly);
    p.z += bust * 0.045 * smoothstep(0.35, 0.62, t) * (1.0 - smoothstep(0.66, 0.9, t)) * step(0.0, p.z) * (1.0 - abs(p.x) * 2.0);
  } else if (part < 2.5) { p.xz *= 0.92 + 0.08 * girth; }
  else if (part < 6.5) { float sx = part < 4.5 ? 1.0 : -1.0; float ax = ${J.shX} * sx; p.x = ax * shW + (p.x - ax) * limbG; p.z *= limbG; }
  else { float sx = part < 8.5 ? 1.0 : -1.0; float ax = ${J.hipX} * sx; p.x = ax * hipW + (p.x - ax) * (0.75 + 0.25 * girth) * (1.0 + 0.2 * max(0.0, hipW - 1.0)); p.z *= limbG; }
  // ---- pose angles
  float id = iPose.x, amp = iPose.w;
  float ph = uNpcTime * iPose.y + iPose.z;
  float s1 = sin(ph), c1 = cos(ph);
  float thL = 0.0, thR = 0.0, knL = 0.0, knR = 0.0, shL = 0.0, shR = 0.0, abL = 0.06, abR = 0.06, elL = 0.12, elR = 0.12;
  float thSpL = 0.0, thSpR = 0.0;                 // thigh spread (abduction)
  float toX = 0.0, toY = 0.0, hdX = 0.0, hdY = 0.0, rootY = 0.0, rootX = 0.0, rootZ = 0.0, rootRoll = 0.0;
  if (id < 0.5) { shL = 0.03 * s1; shR = -0.03 * s1; toX = 0.012 * sin(ph * 0.7); hdY = 0.25 * sin(ph * 0.23); rootRoll = 0.02 * sin(ph * 0.31); }
  else if (id < 2.5 || (id > 12.5 && id < 13.5) || (id > 20.5 && id < 22.5)) {
    bool run = (id > 1.5 && id < 2.5) || (id > 20.5 && id < 21.5);
    float A = (run ? 0.85 : 0.42) * amp;
    thL = A * s1 + (run ? 0.25 : 0.03); thR = -A * s1 + (run ? 0.25 : 0.03);
    knL = -(0.06 + (run ? 1.7 : 0.95) * pow(max(0.0, c1), 1.4) * amp);
    knR = -(0.06 + (run ? 1.7 : 0.95) * pow(max(0.0, -c1), 1.4) * amp);
    shL = -A * 0.75 * s1; shR = A * 0.75 * s1;
    elL = run ? 1.45 : 0.18 + 0.22 * max(0.0, -s1); elR = run ? 1.45 : 0.18 + 0.22 * max(0.0, s1);
    toX = run ? 0.2 : 0.035; toY = 0.07 * s1 * amp; rootY = -(run ? 0.04 : 0.012) + (run ? 0.05 : 0.018) * cos(2.0 * ph);
    hdX = run ? -0.12 : 0.0;
    if (id > 12.5 && id < 13.5) { shL = 0.78; shR = 0.78; elL = 0.3; elR = 0.3; toX = 0.1; toY = 0.0; }            // pushing
    if (id > 20.5 && id < 21.5) { shL = 2.6 + 0.3 * s1; shR = 2.6 - 0.3 * s1; elL = 0.9; elR = 0.9; abL = 0.35; abR = 0.35; }  // panic
    if (id > 21.5) { shL = 0.3; shR = 0.3; elL = 1.45; elR = 1.45; toX = -0.03; toY = 0.0; }                       // carrying
  }
  else if (id < 3.5 || (id > 22.5 && id < 23.5)) { thL = 1.48; thR = 1.52; knL = -1.5; knR = -1.42; rootY = -0.45; toX = -0.06 + 0.01 * s1; shL = 0.28; shR = 0.3; elL = 0.95; elR = 0.9; thSpL = 0.1; thSpR = 0.1; hdY = 0.3 * sin(ph * 0.3);
    if (id > 22.5) { float k = smoothstep(0.2, 0.9, sin(ph * 0.8)); shR = 0.3 + 0.5 * k; elR = 0.9 + 1.5 * k; } }
  else if (id < 4.5) { thL = 1.62; thR = 1.5; knL = -0.5; knR = -1.9; rootY = -0.83; toX = 0.12; shL = -0.5; shR = -0.45; abL = 0.3; abR = 0.3; elL = 0.1; elR = 0.1; thSpL = 0.22; thSpR = 0.3; }
  else if (id < 5.5 || (id > 16.5 && id < 17.5)) { rootX = 1.5708; rootY = -0.82; shL = 0.1; shR = 0.1; abL = 0.4; abR = 0.35; thSpL = 0.12; thSpR = 0.1; knR = -0.5 * step(0.5, amp); thR = 0.4 * step(0.5, amp);
    if (id > 16.5) { abL = 0.3 + amp; abR = 1.3 - amp; thSpL = 0.3 * amp; knL = -0.9 * amp; thL = 0.5 * amp; hdY = 0.6; elR = 0.9; } }
  else if (id < 6.5) { float g = sin(ph * 2.3); shR = 0.45 + 0.25 * g; elR = 1.25 + 0.35 * sin(ph * 3.1); abR = 0.2; shL = 0.05; hdY = 0.2 * sin(ph * 0.8); hdX = 0.05 * g; toX = 0.02 * sin(ph); rootRoll = 0.03 * sin(ph * 0.5); }
  else if (id < 7.5) { shR = 0.38; elR = 1.85; abR = -0.12; hdX = 0.42; toX = 0.06; shL = 0.05 + 0.02 * s1; }
  else if (id < 8.5) { shR = 0.25; elR = 2.55; abR = 0.28; hdY = -0.15; shL = 0.25 * max(0.0, sin(ph * 1.7)); elL = 0.5 * max(0.0, sin(ph * 1.7)) + 0.1; }
  else if (id < 9.5) { float b = sin(ph * 2.0); rootY = -0.05 + 0.04 * b; thL = 0.15 + 0.12 * s1; thR = 0.15 - 0.12 * s1; knL = -0.3 - 0.15 * b; knR = -0.3 - 0.15 * b; toY = 0.3 * s1; rootRoll = 0.07 * s1;
    shL = 1.2 + 0.9 * s1; shR = 1.2 - 0.9 * s1; elL = 1.3; elR = 1.3; abL = 0.4; abR = 0.4; hdY = 0.2 * c1; }
  else if (id < 10.5) { thL = 1.95; thR = 1.95; knL = -2.3; knR = -2.3; rootY = -0.52; toX = 0.75; shL = 2.7; shR = 2.7; elL = 1.9; elR = 1.9; hdX = 0.4; rootZ = 0.02 * sin(ph * 14.0); }
  else if (id < 11.5) { shL = 1.25; shR = 1.3; elL = 0.75; elR = 0.7; abL = -0.25; abR = -0.25; toX = 0.02; hdX = -0.05; toY = 0.15 * sin(ph * 0.4); }
  else if (id < 12.5) { thL = 1.7; thR = 0.15; knL = -1.75; knR = -1.7; rootY = -0.42; toX = 0.5; shL = 0.9 + 0.2 * s1; shR = 0.9 - 0.2 * s1; elL = 0.5; elR = 0.5; hdX = 0.2; }
  else if (id < 14.5) { rootX = -1.45; rootY = -1.0; thL = 0.25 * sin(ph * 2.0); thR = -0.25 * sin(ph * 2.0); knL = -0.2; knR = -0.2; shL = 3.14 * fract(ph / 6.2832) * 2.0; shR = shL + 3.14; elL = 0.3; elR = 0.3; hdX = -0.5; }
  else if (id < 15.5) { toX = -0.1; thL = 0.25; knL = -0.55; thR = -0.08; shL = 0.0; shR = 0.0; elL = 1.6; elR = 1.5; abL = -0.35; abR = -0.35; hdY = 0.3 * sin(ph * 0.25); rootZ = -0.05; }
  else if (id < 16.5) { shR = 0.0; abR = 2.5 + 0.25 * sin(ph * 6.0); elR = 0.5 + 0.3 * sin(ph * 6.0); hdY = -0.1; }
  else if (id < 18.5) { thL = 1.35; thR = 1.35; knL = -1.45; knR = -1.45; rootY = -0.36; toX = 0.03; shL = 0.95; shR = 0.95; elL = 0.45; elR = 0.45; thSpL = 0.14; thSpR = 0.14; }
  else if (id < 19.5) { float b = max(0.0, sin(ph)); thL = 0.35 - 0.3 * b; thR = 0.35 - 0.3 * b; knL = -0.7 + 0.6 * b; knR = -0.7 + 0.6 * b; rootY = -0.1 + 0.16 * b; shL = 1.2 + 1.7 * b; shR = 1.2 + 1.7 * b; elL = 1.0 - 0.8 * b; elR = 1.0 - 0.8 * b; hdX = -0.3 * b; }
  else if (id < 20.5) { shL = 0.55 + 0.12 * s1; shR = 0.7 - 0.12 * s1; elL = 0.55; elR = 0.4; toX = 0.12; toY = 0.2 * s1; hdX = 0.18; thL = 0.08; thR = -0.08; }
  else if (id < 24.5) { thL = 1.25; thR = 1.3; knL = -0.5; knR = -0.42; rootY = -0.58; rootX = 0.0; toX = -0.62; hdX = 0.45; shL = 0.5; shR = 0.5; elL = 0.5; elR = 0.4; rootZ = -0.15; }
  else if (id < 25.5) { thL = 0.95 + 0.55 * s1; thR = 0.95 - 0.55 * s1; knL = -1.25 - 0.45 * c1; knR = -1.25 + 0.45 * c1; rootY = -0.05; toX = 0.42; shL = 1.05; shR = 1.05; elL = 0.25; elR = 0.25; hdX = -0.35; }
  else if (id < 26.5) { float k = smoothstep(0.55, 0.95, sin(ph * 0.5)); shR = 0.25 + 0.45 * k; elR = 0.7 + 1.75 * k; abR = 0.05; hdX = -0.1 * k; shL = 0.03; rootRoll = 0.02 * sin(ph * 0.3); }
  else if (id < 27.5) { rootX = -1.5708; rootY = -0.8; shL = 2.9; shR = 2.9; abL = 0.5; abR = 0.5; elL = 1.9; elR = 1.9; hdX = -0.5; hdY = 0.7; }
  else if (id < 28.5) { float g = sin(ph * 3.0); shL = 0.6 + 0.4 * g; shR = 0.6 - 0.4 * g; elL = 1.2 + 0.4 * g; elR = 1.2 - 0.4 * g; abL = 0.3; abR = 0.3; toX = 0.1; hdX = 0.05 * g; toY = 0.12 * sin(ph * 1.3); }
  else { shL = 0.75; shR = 0.95 + 0.04 * s1; elL = 0.7; elR = 0.55; abL = -0.2; abR = -0.15; toX = -0.03; hdX = -0.05; thL = 0.1; thR = -0.1; }
  // ---- apply: legs
  if (part > 6.5) {
    bool left = part < 8.5; float th = left ? thL : thR, kn = left ? knL : knR, sp = left ? thSpL : -thSpR;
    vec3 hp = vec3(left ? hipP.x : -hipP.x, hipP.y, 0.0);
    vec3 kp = vec3(hp.x, ${J.kneeY}, 0.0);
    if (part > 7.5 && part < 8.5 || part > 9.5) { p = kp + rX(p - kp, kn); n = rX(n, kn); }
    p = hp + rZ(rX(p - hp, th), sp); n = rZ(rX(n, th), sp);
  } else if (part > 0.5) {
    // arms and head hang off the torso
    if (part > 2.5) {
      bool left = part < 4.5; float sh = left ? shL : shR, el = left ? elL : elR, ab = left ? abL : -abR;
      vec3 sp = vec3(left ? shP.x : -shP.x, shP.y, 0.0);
      vec3 ep = vec3(sp.x, ${J.elY}, 0.0);
      if (part > 3.5 && part < 4.5 || part > 5.5) { p = ep + rX(p - ep, el); n = rX(n, el); }
      p = sp + rX(rZ(p - sp, ab), sh); n = rX(rZ(n, ab), sh);
    } else if (part > 1.5) {
      vec3 np = vec3(0.0, ${J.neckY}, 0.0);
      p = np + rY(rX(p - np, hdX), hdY); n = rY(rX(n, hdX), hdY);
    }
    vec3 wp = vec3(0.0, ${J.waistY}, 0.0);
    p = wp + rY(rX(p - wp, toX), toY); n = rY(rX(n, toX), toY);
  }
  // ---- root
  vec3 pp = vec3(0.0, ${J.hipY}, 0.0);
  p = pp + rZ(rX(p - pp, rootX), rootRoll); n = rZ(rX(n, rootX), rootRoll);
  p.y += rootY; p.z += rootZ;
  if (hide) p = vec3(0.0, ${J.headY} + rootY, 0.0);
  npcP = p; npcN = normalize(n);
  // ---- color
  float region = aInfo.y, len = aInfo.z;
  vec3 skin = unpackC(iColA.x), top = unpackC(iColA.y), bottom = unpackC(iColA.z), hair = unpackC(iColB.x), shoes = unpackC(iColB.y), hatC = unpackC(iColB.z);
  // fragment picks A when cut.x < cut.y, else B (so sleeve and trouser hems are crisp); cut.z = cloth kind of A (0 skin, 1 top, 2 bottom, 3 hard, 4 hair)
  vec3 A = skin, B = skin; vec3 cut = vec3(0.0, 1.0, 0.0);
  if (region < 0.5) { }
  else if (region < 1.5) { A = top; cut.z = 1.0; if (iFlags.x < -0.5) { cut.x = abs(len - 0.67); cut.y = bust > 0.01 ? 0.17 : -1.0; } else B = top; }
  else if (region < 2.5) { A = bottom; B = bottom; cut.z = 2.0; }
  else if (region < 3.5) { A = shoes; B = shoes; cut.z = 3.0; }
  else if (region < 4.5) { A = hair; B = hair; cut.z = 4.0; }
  else if (region < 5.5) { A = hatC; B = hatC; cut.z = 3.0; }
  else if (region < 6.5) { A = top; cut = vec3(len, iFlags.x, 1.0); }
  else { A = bottom; cut = vec3(len, iFlags.y, 2.0); }
  vNpcA = A; vNpcB = B; vNpcCut = cut; vNpcObj = position;
}
`;
const FRAG_PARS = /* glsl */`
varying vec3 vNpcA; varying vec3 vNpcB; varying vec3 vNpcObj; varying vec3 vNpcCut;
float npcHash(vec3 p) { p = fract(p * vec3(127.1, 311.7, 74.7)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y) * p.z); }
`;
const FRAG_COLOR = /* glsl */`
  {
    bool useA = vNpcCut.x < vNpcCut.y; vec3 c = useA ? vNpcA : vNpcB; float vNpcRegion = useA ? vNpcCut.z : 0.0;
    float fw = max(length(dFdx(vNpcObj)), length(dFdy(vNpcObj)));
    float near = 1.0 - smoothstep(0.004, 0.02, fw);                      // fine detail fades with distance (no shimmer)
    if (vNpcRegion > 0.5 && vNpcRegion < 2.5) {                           // cloth: weave + soft folds
      float weave = sin(vNpcObj.x * 900.0) * sin(vNpcObj.y * 900.0);
      float folds = sin(vNpcObj.y * 38.0 + sin(vNpcObj.x * 21.0) * 2.0);
      c *= 1.0 + 0.05 * weave * near + 0.06 * folds * (0.4 + 0.6 * near);
    } else if (vNpcRegion < 0.5) { c *= 0.96 + 0.08 * npcHash(floor(vNpcObj * 160.0)) * near; c += vec3(0.03, 0.0, -0.01) * near; }
    else if (vNpcRegion > 3.5) { c *= 0.85 + 0.3 * sin(vNpcObj.x * 240.0 + vNpcObj.z * 90.0) * near * 0.5 + 0.15; }
    diffuseColor.rgb = c;
  }
`;

export function createCrowd(game, opts = {}) {
  const MAX = opts.max || 640;
  const geo = buildBody();
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index; ig.attributes.position = geo.attributes.position; ig.attributes.normal = geo.attributes.normal; ig.attributes.aInfo = geo.attributes.aInfo;
  ig.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mk = (n, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const aPose = mk(MAX, 4), aShape = mk(MAX, 4), aFlags = mk(MAX, 4), aColA = mk(MAX, 3), aColB = mk(MAX, 3);
  ig.setAttribute('iPose', aPose); ig.setAttribute('iShape', aShape); ig.setAttribute('iFlags', aFlags); ig.setAttribute('iColA', aColA); ig.setAttribute('iColB', aColB);
  const uTime = { value: 0 };
  const hook = (sh, depthOnly) => {
    sh.uniforms.uNpcTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', 'vec3 transformed = npcP;');
    if (!depthOnly) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', 'npcPose();\nvec3 objectNormal = npcN;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif');
    else sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '').replace('vec3 transformed = npcP;', 'npcPose();\nvec3 transformed = npcP;');
    if (!depthOnly) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS).replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR);
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, name: 'npcCrowd' });
  mat.onBeforeCompile = (sh) => hook(sh, false);
  mat.customProgramCacheKey = () => 'npcCrowd1';
  const mesh = new THREE.InstancedMesh(ig, mat, MAX);
  mesh.name = 'npc-crowd'; mesh.frustumCulled = false; mesh.castShadow = !!opts.castShadow; mesh.receiveShadow = true; mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => hook(sh, true); depth.customProgramCacheKey = () => 'npcCrowdDepth1';
  mesh.customDepthMaterial = depth;
  (opts.scene || game.scene).add(mesh);

  // soft contact shadows (one more draw call)
  const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
  const smat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, opacity: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: 'npcCrowdBlob' });
  smat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec2 vBlobUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBlobUv = uv;');
    sh.fragmentShader = 'varying vec2 vBlobUv;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n float bd = length(vBlobUv - 0.5) * 2.0; diffuseColor.a = 0.34 * (1.0 - smoothstep(0.25, 1.0, bd));');
  };
  const blobs = new THREE.InstancedMesh(sg, smat, MAX); blobs.name = 'npc-crowd-blobs'; blobs.frustumCulled = false; blobs.count = 0; blobs.renderOrder = 1;
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  (opts.scene || game.scene).add(blobs);

  const free = []; let high = 0;
  const used = new Uint8Array(MAX);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const dirty = { pose: false, look: false, mat: false };
  const pack = (rgb) => { // [r,g,b] 0..1 sRGB or hex
    if (typeof rgb === 'number') return rgb & 0xffffff;
    return (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
  };
  const api = {
    mesh, blobs, max: MAX, POSE,
    alloc() { let i = free.length ? free.pop() : (high < MAX ? high++ : -1); if (i < 0) return -1; used[i] = 1; mesh.count = high; blobs.count = high; return i; },
    release(i) { if (i < 0 || !used[i]) return; used[i] = 0; mesh.setMatrixAt(i, ZERO); blobs.setMatrixAt(i, ZERO); dirty.mat = true; free.push(i); },
    // look: { skin, top, bottom, hair, shoes, hat (hex colors), sleeve, leg, hairStyle, hatKind, girth, shoulders, hips, bust }
    setLook(i, L) {
      aColA.setXYZ(i, pack(L.skin), pack(L.top), pack(L.bottom)); aColB.setXYZ(i, pack(L.hair), pack(L.shoes), pack(L.hat ?? 0x222222));
      aShape.setXYZW(i, L.girth ?? 1, L.shoulders ?? 1, L.hips ?? 1, L.bust ?? 0);
      aFlags.setXYZW(i, L.sleeve ?? 0.35, L.leg ?? 1, L.hairStyle ?? 1, L.hatKind ?? 0);
      dirty.look = true;
    },
    // phase(t) = t * cadence + offset. Pass phase = null to keep the running cycle (speed changes, walk <-> run).
    setPose(i, id, cadence = 1, phase = null, amp = 1) {
      const oi = aPose.getX(i), oc = aPose.getY(i), oo = aPose.getZ(i);
      if (oi === id && oc === cadence && aPose.getW(i) === amp && phase === null) return;
      const t = uTime.value;
      const cur = phase === null ? t * oc + oo : phase;
      aPose.setXYZW(i, id, cadence, (cur % 6283.185307) - t * cadence, amp); dirty.pose = true;
    },
    setTransform(i, x, y, z, heading, height, blobScale = 1) {
      const sc = height / REF_H;
      _q.setFromEuler(_e.set(0, heading, 0)); _m.compose(_p.set(x, y, z), _q, _s.set(sc, sc, sc)); mesh.setMatrixAt(i, _m);
      _m.compose(_p.set(x, y + 0.03, z), _q, _s.set(0.95 * blobScale, 1, 0.95 * blobScale * (blobScale > 1.2 ? 1.6 : 1))); blobs.setMatrixAt(i, _m);
      dirty.mat = true;
    },
    update(dt) {
      uTime.value += dt;
      if (dirty.mat) { mesh.instanceMatrix.needsUpdate = true; blobs.instanceMatrix.needsUpdate = true; dirty.mat = false; }
      if (dirty.pose) { aPose.needsUpdate = true; dirty.pose = false; }
      if (dirty.look) { aColA.needsUpdate = true; aColB.needsUpdate = true; aShape.needsUpdate = true; aFlags.needsUpdate = true; dirty.look = false; }
    },
    get time() { return uTime.value; },
    get active() { return high - free.length; },
    tris: geo.index.count / 3,
    dispose() { mesh.parent?.remove(mesh); blobs.parent?.remove(blobs); ig.dispose(); mat.dispose(); depth.dispose(); sg.dispose(); smat.dispose(); },
  };
  return api;
}
export { REF_H, hexToRgb01 };

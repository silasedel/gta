// Airport paint: runway markings to FAA practice (threshold bars, designation numbers, centerline, touchdown zone,
// aiming point, side stripes, blast-pad chevrons), taxiway centerlines with lead-in curves, taxiway edge lines,
// holding-position markings, apron taxilane, stand lead-in lines, stop bars and stand numbers.
// All marks are real geometry (crisp at any distance): one mesh per paint color per airport, glyphs (numbers) from one
// canvas atlas. Worn paint: a world-space noise darkens and roughens patches (rubber over the touchdown-zone paint).
import * as THREE from 'three';
import { frame, along, polyLen, segDist } from './geom.js';
import { PAVE_Y } from './pavement.js';

const GLYPHS = '0123456789GRABCLH-';
let atlas = null;
function glyphAtlas() {
  if (atlas) return atlas;
  const W = 128,
    H = 256,
    c = document.createElement('canvas');
  c.width = W * GLYPHS.length;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 250px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  for (let i = 0; i < GLYPHS.length; i++) {
    g.save();
    g.translate(i * W + W / 2, H / 2 + 8);
    g.scale(0.62, 1.0);
    g.fillText(GLYPHS[i], 0, 0);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  atlas = { tex: t, n: GLYPHS.length };
  return atlas;
}

function paintMat(color, map = null) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0,
    map,
    alphaTest: map ? 0.45 : 0,
    transparent: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -6,
  });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader =
      'varying vec3 vPWP;\n' +
      sh.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vPWP = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    sh.fragmentShader =
      'varying vec3 vPWP;\nfloat pmH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat pmN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(pmH(i), pmH(i + vec2(1, 0)), f.x), mix(pmH(i + vec2(0, 1)), pmH(i + vec2(1, 1)), f.x), f.y); }\n' +
      sh.fragmentShader
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  { float wear = pmN(vPWP.xz * 0.35) * 0.55 + pmN(vPWP.xz * 2.7) * 0.3 + pmN(vPWP.xz * 11.0) * 0.15;
    diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.25, 0.7, wear)); }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.8, 0.5, pmN(vPWP.xz * 1.3));',
        );
  };
  m.customProgramCacheKey = () => 'airport-paint' + (map ? '-glyph' : '');
  return m;
}

export function buildMarkings(ap, { ground, group }) {
  const Y = PAVE_Y + 0.012;
  const B = { white: [], yellow: [], red: [], glyph: [], glyphUV: [] };
  const gy = (x, z) => ground(x, z) + Y;
  // quad in a frame: s0..s1 along, q0..q1 across
  const rect = (F, s0, s1, q0, q1, col) => {
    const L = B[col];
    const p = [F.P(s0, q0), F.P(s1, q0), F.P(s1, q1), F.P(s0, q1)];
    L.push(p);
  };
  const quad = (col, p) => B[col].push(p);
  // a stripe along a polyline (width w, offset off to the left), split into pieces <= 20 m
  const strip = (pts, w, col, off = 0, dash = 0, gap = 0) => {
    const L = polyLen(pts);
    if (L < 0.5) return;
    const step = dash > 0 ? dash + gap : 0;
    const piece = (d0, d1) => {
      for (let a = d0; a < d1 - 1e-3; a += 8) {
        const b = Math.min(d1, a + 8),
          A = along(pts, a),
          C = along(pts, b);
        const nAx = A.tz,
          nAz = -A.tx,
          nCx = C.tz,
          nCz = -C.tx;
        quad(col, [
          [A.x + nAx * (off - w / 2), A.z + nAz * (off - w / 2)],
          [C.x + nCx * (off - w / 2), C.z + nCz * (off - w / 2)],
          [C.x + nCx * (off + w / 2), C.z + nCz * (off + w / 2)],
          [A.x + nAx * (off + w / 2), A.z + nAz * (off + w / 2)],
        ]);
      }
    };
    if (!step) piece(0, L);
    else for (let d = 0; d < L; d += step) piece(d, Math.min(L, d + dash));
  };
  // glyph quad: center (s, q) in frame F, height h along +s (the top of the glyph points to +s), width w
  const glyph = (F, ch, s, q, h, w, flip) => {
    const i = GLYPHS.indexOf(ch);
    if (i < 0) return;
    const n = GLYPHS.length,
      u0 = i / n + 0.004,
      u1 = (i + 1) / n - 0.004,
      sg = flip ? -1 : 1;
    // corners: bottom-left, bottom-right, top-right, top-left as read by a pilot looking along +s*sg
    const bl = F.P(s - (sg * h) / 2, q + (sg * w) / 2),
      br = F.P(s - (sg * h) / 2, q - (sg * w) / 2),
      tr = F.P(s + (sg * h) / 2, q - (sg * w) / 2),
      tl = F.P(s + (sg * h) / 2, q + (sg * w) / 2);
    B.glyph.push([bl, br, tr, tl]);
    B.glyphUV.push([
      [u0, 0],
      [u1, 0],
      [u1, 1],
      [u0, 1],
    ]);
  };
  const text = (F, str, s, q, h, flip) => {
    const w = h * 0.5,
      gap = h * 0.22,
      tot = str.length * w + (str.length - 1) * gap;
    const sg = flip ? -1 : 1;
    [...str].forEach((ch, k) =>
      glyph(F, ch, s, q + sg * (tot / 2 - w / 2 - k * (w + gap)), h, w, flip),
    );
  };

  // ---------------------------------------------------------------- runways
  const RW = ap.runways.map((r) => ({ r, F: frame(r.a, r.b) }));
  for (const { r, F } of RW) {
    const L = F.L,
      w = r.w,
      prec = w >= 40,
      side = prec ? 0.9 : 0.45,
      bp = r.blast || 60;
    rect(F, 0, L, w / 2 - side - 0.15, w / 2 - 0.15, 'white');
    rect(F, 0, L, -w / 2 + 0.15, -w / 2 + side + 0.15, 'white');
    const nb = prec ? 6 : 4,
      barL = prec ? 45 : 30,
      numS = 6 + barL + 12,
      numH = 18;
    const cw = prec ? 0.9 : 0.45,
      c0 = numS + numH + 12;
    for (let s = c0; s + 36 <= L - c0; s += 60) rect(F, s, s + 36, -cw / 2, cw / 2, 'white');
    for (const end of [0, 1]) {
      const d2s = (d) => (end === 0 ? d : L - d),
        qs = end === 0 ? 1 : -1;
      const R = (d0, d1, q0, q1, col = 'white') => rect(F, d2s(d0), d2s(d1), qs * q0, qs * q1, col);
      for (let k = 0; k < nb; k++) {
        const q0 = 1.75 + k * 3.5;
        R(6, 6 + barL, q0, q0 + 1.75);
        R(6, 6 + barL, -q0 - 1.75, -q0);
      } // threshold bars
      R(0.5, 2.3, -w / 2 + 0.2, w / 2 - 0.2); // threshold line
      text(F, r.ends[end], d2s(numS + numH / 2), 0, numH, end === 1); // designation
      if (prec) {
        for (const [d, nbars] of [
          [150, 3],
          [450, 2],
          [600, 2],
        ]) {
          if (d + 23 > L / 2) continue;
          for (let k = 0; k < nbars; k++) {
            const q0 = 11 + k * 3.35;
            R(d, d + 22.5, q0, q0 + 1.83);
            R(d, d + 22.5, -q0 - 1.83, -q0);
          }
        }
        R(300, 345, 11, 20);
        R(300, 345, -20, -11); // aiming point
      } else {
        R(250, 280, 7, 12);
        R(250, 280, -12, -7);
      }
      // blast pad: yellow chevrons pointing at the threshold, 0.9 m stripes at 45 degrees
      for (let d = -12; d > -bp + 4; d -= 22) {
        const tip = d,
          hw = w / 2 - 0.5;
        for (const sg of [1, -1]) {
          const p = (dd, q) => F.P(d2s(dd), qs * q);
          quad('yellow', [
            p(tip, 0),
            p(tip - hw, sg * hw),
            p(tip - hw - 1.3, sg * hw),
            p(tip - 1.3, 0),
          ]);
        }
      }
    }
  }
  const onRunway = (x, z, pad = 1) =>
    RW.some(({ r, F }) => {
      const s = F.s(x, z),
        q = F.q(x, z);
      return s > -(r.blast || 60) && s < F.L + (r.blast || 60) && Math.abs(q) < r.w / 2 + pad;
    });
  const nearRunway = (x, z) => {
    let best = null;
    for (const { r, F } of RW) {
      const s = F.s(x, z),
        q = Math.abs(F.q(x, z));
      if (s > -60 && s < F.L + 60 && (!best || q < best.q)) best = { r, F, q };
    }
    return best;
  };

  // ---------------------------------------------------------------- taxiways: centerline (off the runways), hold-short bars
  const yl = 0.3;
  for (const t of ap.taxiways) {
    const pts = t.pts,
      L = polyLen(pts);
    // centerline in pieces that stay off runway pavement
    let run = null;
    const pieces = [];
    for (let d = 0; d <= L + 0.01; d += 2) {
      const A = along(pts, Math.min(d, L));
      const off = onRunway(A.x, A.z, 0.5);
      if (!off) {
        if (!run) run = [d, d];
        run[1] = Math.min(d, L);
      } else if (run) {
        pieces.push(run);
        run = null;
      }
    }
    if (run) pieces.push(run);
    for (const [d0, d1] of pieces) {
      if (d1 - d0 < 2) continue;
      const sub = [];
      for (let d = d0; d <= d1 + 0.01; d += Math.max(1, Math.min(8, d1 - d0))) {
        const A = along(pts, Math.min(d, d1));
        sub.push([A.x, A.z]);
      }
      if (sub.length > 1) strip(sub, yl, 'yellow');
    }
    // holding position: walking from each end toward a runway, the point where it comes within the hold distance
    for (const end of [0, 1]) {
      const at = (d) => along(pts, end === 0 ? d : L - d);
      const A0 = at(0),
        nr = nearRunway(A0.x, A0.z);
      if (!nr || nr.q > nr.r.w / 2 + 2) continue; // this end touches a runway
      const H = nr.r.w >= 40 ? 60 : 38;
      for (let d = 0; d < L; d += 0.5) {
        const A = at(d),
          q = Math.abs(nr.F.q(A.x, A.z));
        if (q < H) continue;
        const tx = (end === 0 ? 1 : -1) * A.tx,
          tz = (end === 0 ? 1 : -1) * A.tz,
          nx = tz,
          nz = -tx,
          hw = t.w / 2 - 0.6; // t: away from the runway
        const bar = (o, col, dash) => {
          for (let k = -hw; k < hw - 0.01; k += dash ? 1.8 : 2 * hw) {
            const k1 = Math.min(hw, k + (dash ? 0.9 : 2 * hw));
            const p = (oo, kk) => [A.x + tx * oo + nx * kk, A.z + tz * oo + nz * kk];
            quad(col, [p(o, k), p(o, k1), p(o + 0.3, k1), p(o + 0.3, k)]);
          }
        };
        bar(-1.2, 'yellow', true);
        bar(-0.6, 'yellow', true);
        bar(0, 'yellow', false);
        bar(0.6, 'yellow', false); // dashed on the runway side
        t['hold' + end] = { x: A.x, z: A.z, tx, tz, rw: nr.r.id };
        break;
      }
    }
  }
  // taxiway edge lines (double, 15 cm), from the pavement outline segments that border grass (design.py twEdge)
  for (const e of ap.twEdge || []) {
    strip(e, 0.15, 'yellow', 0.0);
    strip(e, 0.15, 'yellow', 0.3);
  }

  // ---------------------------------------------------------------- aprons: stand lead-in lines, stop bars, stand numbers, taxilane
  for (const st of ap.stands || []) {
    const hx = Math.sin(st.heading),
      hz = Math.cos(st.heading),
      len = st.bridge ? 70 : 45;
    if (st.kind === 'gate' && !st.bridge) {
      // parallel stands (stairs): a lead-in along the parking line
      const p0 = [st.x - hx * 40, st.z - hz * 40],
        p1 = [st.x + hx * 4, st.z + hz * 4];
      strip([p0, p1], 0.2, 'yellow');
    } else {
      strip(
        [
          [st.x - hx * len, st.z - hz * len],
          [st.x, st.z],
        ],
        0.2,
        'yellow',
      );
    }
    const nx = hz,
      nz = -hx,
      sb = (o, a, b2, col) =>
        quad(col, [
          [st.x + hx * o + nx * a, st.z + hz * o + nz * a],
          [st.x + hx * o + nx * b2, st.z + hz * o + nz * b2],
          [st.x + hx * (o + 0.5) + nx * b2, st.z + hz * (o + 0.5) + nz * b2],
          [st.x + hx * (o + 0.5) + nx * a, st.z + hz * (o + 0.5) + nz * a],
        ]);
    sb(0, -2.5, 2.5, 'yellow'); // stop bar at the nose wheel
    const F = { P: (s, q) => [st.x + hx * s + nx * q, st.z + hz * s + nz * q] };
    text(F, st.id, -26, 6, 3.2, false); // stand number, read by the pilot taxiing in
    // red safety envelope (equipment stays outside it)
    if (st.bridge) {
      const e = (a0, b0, a1, b1) => {
        const P0 = F.P(a0, b0),
          P1 = F.P(a1, b1);
        strip([P0, P1], 0.2, 'red');
      };
      e(-42, -19, 4, -19);
      e(-42, 19, 4, 19);
      e(-42, -19, -42, 19);
    }
  }
  const tl = ap.taxilane;
  if (tl) strip(tl, yl, 'yellow');
  // landside curb: sidewalk edge, drop-off lane lines, two zebra crossings to the parking side
  if (ap.forecourt) {
    const fc = ap.forecourt,
      F = frame(fc[0], fc[1]),
      dep = Math.hypot(fc[3][0] - fc[0][0], fc[3][1] - fc[0][1]),
      sg = Math.sign(F.q(fc[3][0], fc[3][1])) || 1,
      Lf = F.L;
    rect(F, 0, Lf, sg * 6.0, sg * 6.25, 'white');
    for (const q of [9.6, 13.2, 16.8])
      for (let s = 2; s < Lf - 2; s += 6) rect(F, s, s + 3, sg * q, sg * (q + 0.15), 'white');
    for (const sc of [Lf * 0.3, Lf * 0.7])
      for (let q = 6.5; q < Math.min(dep - 1, 20.5); q += 1.2)
        rect(F, sc - 2, sc + 2, sg * q, sg * (q + 0.6), 'white');
  }

  // ---------------------------------------------------------------- geometry
  const meshes = [];
  const build = (list, col, uvs = null) => {
    if (!list.length) return;
    const pos = new Float32Array(list.length * 12),
      nrm = new Float32Array(list.length * 12),
      uv = new Float32Array(list.length * 8),
      idx = new Uint32Array(list.length * 6);
    list.forEach((p, i) => {
      for (let k = 0; k < 4; k++) {
        pos[i * 12 + k * 3] = p[k][0];
        pos[i * 12 + k * 3 + 1] = gy(p[k][0], p[k][1]);
        pos[i * 12 + k * 3 + 2] = p[k][1];
        nrm[i * 12 + k * 3 + 1] = 1;
        if (uvs) {
          uv[i * 8 + k * 2] = uvs[i][k][0];
          uv[i * 8 + k * 2 + 1] = uvs[i][k][1];
        }
      }
      // keep both windings facing up: test the first triangle's normal
      const ax = p[1][0] - p[0][0],
        az = p[1][1] - p[0][1],
        bx = p[2][0] - p[0][0],
        bz = p[2][1] - p[0][1],
        up = az * bx - ax * bz > 0;
      const b = i * 4;
      if (up) idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
      else idx.set([b, b + 2, b + 1, b, b + 3, b + 2], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const colr =
      col === 'white'
        ? 0xe8e8e2
        : col === 'yellow'
          ? 0xe0a81c
          : col === 'red'
            ? 0xb0201c
            : 0xe8e8e2;
    const m = new THREE.Mesh(g, paintMat(colr, uvs ? glyphAtlas().tex : null));
    m.name = 'airport-paint-' + col;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.userData.noDetailCull = true;
    m.renderOrder = 1;
    group.add(m);
    meshes.push(m);
  };
  build(B.white, 'white');
  build(B.yellow, 'yellow');
  build(B.red, 'red');
  build(B.glyph, 'glyph', B.glyphUV);
  return {
    meshes,
    counts: {
      white: B.white.length,
      yellow: B.yellow.length,
      red: B.red.length,
      glyph: B.glyph.length,
    },
  };
}
export { segDist };

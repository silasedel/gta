// Airport lighting: runway edge lights (white, yellow caution zone), threshold / end bars (green toward the approach,
// red toward the runway), centerline lights (white, alternating red / white, red in the last 300 m), approach light
// systems with sequenced flashers ("the rabbit"), PAPI (four boxes: white above, red below the 3 degree glide path),
// blue taxiway edge lights, the rotating green / white airport beacon on the tower and red obstruction lights.
// Every glow is ONE point-sprite draw per airport (shader: directional colors, PAPI angles, flasher timing, night
// intensity, a minimum pixel size so lines of lights read from kilometers away); the fixtures you see by day are one
// instanced mesh.
import * as THREE from 'three';
import { frame, along, polyLen } from './geom.js';
import { PAVE_Y } from './pavement.js';

const VS = /* glsl */ `
attribute vec3 colA; attribute vec3 colB; attribute vec4 dm; attribute float size;
uniform float uNight; uniform float uTime; uniform float uScale;
varying vec3 vCol; varying float vI;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 toCam = cameraPosition - wp.xyz; float dist = length(toCam); vec2 dir = dm.xy; float mode = dm.z, prm = dm.w;
  vec2 tc = normalize(toCam.xz + vec2(1e-4)); float facing = dot(tc, dir);
  vec3 c = colA; float vis = 1.0;
  if (mode > 0.5 && mode < 1.5) { c = facing >= 0.0 ? colA : colB; }                                  // bidirectional
  else if (mode > 1.5 && mode < 2.5) { vis = smoothstep(-0.05, 0.25, facing); }                     // unidirectional
  else if (mode > 2.5 && mode < 3.5) { float el = degrees(atan(toCam.y, length(toCam.xz))); c = el > prm ? colA : colB; vis = smoothstep(0.1, 0.5, facing); }  // PAPI
  else if (mode > 3.5 && mode < 4.5) { float ph = fract(uTime * 2.0 - prm * 0.033); vis = smoothstep(0.1, 0.4, facing) * (ph < 0.06 ? 3.0 : 0.0); }  // sequenced flasher
  else if (mode > 4.5 && mode < 5.5) { float ph = fract(uTime * 0.4 + prm); c = ph < 0.5 ? colA : colB; vis = smoothstep(0.85, 1.0, 0.5 + 0.5 * cos(6.2832 * fract(uTime * 0.4) - atan(tc.y, tc.x) * 2.0)) * 1.6 + 0.15; }  // rotating beacon
  else if (mode > 5.5) { vis = 0.6 + 0.4 * step(0.5, fract(uTime * 0.75 + prm)); }                  // obstruction (slow pulse)
  float night = uNight;
  vI = vis * mix(0.35, 1.0, night) * exp(-dist / 9000.0);
  vCol = c;
  vec4 mv = viewMatrix * wp; gl_Position = projectionMatrix * mv;
  float px = size * uScale / max(dist, 1.0);
  gl_PointSize = vis > 0.001 ? clamp(px, mix(1.2, 2.4, night), 56.0) : 0.0;
  vI *= clamp(px / 2.0, 0.35, 1.0) * 0.6 + 0.4;
}`;
const FS = /* glsl */ `
varying vec3 vCol; varying float vI;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard;
  float core = exp(-r2 * 9.0), halo = exp(-r2 * 2.6) * 0.35;
  gl_FragColor = vec4(vCol * (core * 7.0 + halo * 2.0) * vI, 1.0);
}`;

const C = {
  white: [1, 0.93, 0.78],
  yellow: [1, 0.72, 0.18],
  green: [0.25, 1, 0.42],
  red: [1, 0.1, 0.06],
  blue: [0.18, 0.35, 1],
  strobe: [0.9, 0.95, 1],
};

export function buildLights(ap, { ground, group, game, isFree }) {
  const P = [],
    A = [],
    Bc = [],
    D = [],
    S = [];
  const fix = []; // fixtures: [x, y, z, kind]  kind 0 edge, 1 blue taxi, 2 approach bar mast (h), 3 PAPI box, 4 flush
  const add = (x, z, h, colA, colB = colA, dx = 0, dz = 0, mode = 0, prm = 0, size = 0.9) => {
    P.push(x, ground(x, z) + h, z);
    A.push(...colA);
    Bc.push(...colB);
    D.push(dx, dz, mode, prm);
    S.push(size);
  };
  const counts = {};
  const cnt = (k, n = 1) => (counts[k] = (counts[k] || 0) + n);
  for (const r of ap.runways) {
    const F = frame(r.a, r.b),
      L = F.L,
      w = r.w,
      prec = w >= 40;
    // edge lights every 60 m, 3 m off the edge; the last 600 m (from each direction) yellow
    for (let s = 0; s <= L + 0.1; s += 60)
      for (const sg of [-1, 1]) {
        const [x, z] = F.P(s, sg * (w / 2 + 3));
        const remA = L - s,
          remB = s;
        add(
          x,
          z,
          0.42,
          remA < 600 ? C.yellow : C.white,
          remB < 600 ? C.yellow : C.white,
          -F.ux,
          -F.uz,
          1,
          0,
          1.0,
        );
        fix.push([x, z, 0]);
        cnt('edge');
      }
    // threshold / end bars: green toward the approach, red toward the runway
    for (const end of [0, 1]) {
      const s = end === 0 ? -2.5 : L + 2.5,
        dir = end === 0 ? -1 : 1;
      for (let q = -w / 2 - 6; q <= w / 2 + 6.1; q += 3) {
        if (Math.abs(q) < w / 2 && Math.abs(q) > 0 && false) continue;
        const [x, z] = F.P(s, q);
        add(x, z, 0.32, C.green, C.red, dir * F.ux, dir * F.uz, 1, 0, 1.1);
        fix.push([x, z, 4]);
        cnt('threshold');
      }
    }
    // centerline lights (precision runways): color as seen by a pilot rolling toward each end
    if (prec)
      for (let s = 15; s < L - 7; s += 15) {
        const [x, z] = F.P(s, 0.8),
          col = (rem, i) => (rem < 300 ? C.red : rem < 900 ? (i % 2 ? C.red : C.white) : C.white),
          i = Math.round(s / 15);
        add(x, z, 0.06, col(s, i), col(L - s, i), -F.ux, -F.uz, 1, 0, 0.55);
        cnt('centerline');
      }
    // approach lights: bars every 30 m (MALSR: every 60 m) to 720 / 420 m, crossbar at 300 m, sequenced flashers
    for (const end of [0, 1]) {
      const sAt = (d) => (end === 0 ? -d : L + d),
        dir = end === 0 ? -1 : 1,
        len = prec ? 720 : 420,
        step = prec ? 30 : 60;
      for (let d = step; d <= len; d += step) {
        const [cx, cz] = F.P(sAt(d), 0);
        if (isFree && !isFree(cx, cz)) continue; // never on a road, a roof or open water
        const h = 0.6 + Math.min(4, d / 160);
        const half = d === 300 ? 15 : 2.1,
          sp = d === 300 ? 1.5 : 1.05;
        for (let q = -half; q <= half + 0.01; q += sp) {
          const [x, z] = F.P(sAt(d), q);
          add(x, z, h, C.white, C.white, dir * F.ux, dir * F.uz, 2, 0, 1.0);
          cnt('approach');
        }
        fix.push([cx, cz, 2, h, half]);
        if (d >= (prec ? 330 : 120)) {
          add(
            cx,
            cz,
            h + 0.35,
            C.strobe,
            C.strobe,
            dir * F.ux,
            dir * F.uz,
            4,
            (len - d) / step,
            2.6,
          );
          cnt('flasher');
        }
      }
    }
    // PAPI: four boxes left of the runway at the aiming point, transition angles 3.5 .. 2.5 deg from the runway outward
    for (const end of [0, 1]) {
      const s = end === 0 ? 300 : L - 300,
        dir = end === 0 ? -1 : 1,
        qs = end === 0 ? 1 : -1;
      [3.5, 3.17, 2.83, 2.5].forEach((ang, k) => {
        const [x, z] = F.P(s, qs * (w / 2 + 15 + k * 9));
        add(x, z, 0.55, C.white, C.red, dir * F.ux, dir * F.uz, 3, ang, 1.4);
        fix.push([x, z, 3, Math.atan2(F.ux * dir, F.uz * dir)]);
        cnt('papi');
      });
    }
  }
  // blue taxiway edge lights every 30 m, 1.5 m outside the edge line (twEdge sits 0.9 m inside the pavement)
  for (const e of ap.twEdge || []) {
    const L = polyLen(e);
    for (let d = 0; d <= L; d += 30) {
      const a = along(e, d);
      const sx = a.tz,
        sz = -a.tx;
      for (const sg of [1]) {
        const x = a.x + sx * sg * -2.4,
          z = a.z + sz * sg * -2.4;
        add(x, z, 0.34, C.blue, C.blue, 0, 0, 0, 0, 0.8);
        fix.push([x, z, 1]);
        cnt('taxi');
      }
    }
  }
  // beacon + obstruction on the tower top
  if (ap.tower) {
    const h = ap.tower.model === 'control_tower' ? 92 : 31.5;
    add(ap.tower.x, ap.tower.z, h, C.green, C.white, 1, 0, 5, 0, 3.5);
    add(ap.tower.x + 2, ap.tower.z, h - 1.2, C.red, C.red, 0, 0, 6, 0.3, 1.6);
    cnt('beacon');
  }
  for (const hg of ap.hangars || []) {
    add(
      hg.x,
      hg.z,
      hg.model === 'hangar_long' ? 15.6 : 11,
      C.red,
      C.red,
      0,
      0,
      6,
      Math.random(),
      1.2,
    );
    cnt('obstruction');
  }

  // apron floodlight masts (22 m) along the outer edge of the terminal apron: lamp heads glow, light pools on the concrete
  const pools = [];
  for (const a of ap.aprons || []) {
    if (a.kind !== 'terminal') continue;
    const [p0, p1, p2] = a.poly,
      F = frame(p0, p1),
      L = F.L,
      dq = F.q(p2[0], p2[1]),
      qe = Math.sign(dq) * 6;
    for (let s = 30; s < L - 20; s += 75) {
      const [x, z] = F.P(s, qe);
      fix.push([x, z, 5]);
      for (const o of [-0.9, 0.9]) {
        const [hx, hz] = F.P(s + o, qe);
        add(hx, hz, 22.3, [1, 0.86, 0.62], [1, 0.86, 0.62], 0, 0, 0, 0, 2.2);
      }
      pools.push([...F.P(s, qe + Math.sign(dq) * 24), 60]);
      cnt('flood');
    }
  }
  // ---- glow points
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('colA', new THREE.Float32BufferAttribute(A, 3));
  g.setAttribute('colB', new THREE.Float32BufferAttribute(Bc, 3));
  g.setAttribute('dm', new THREE.Float32BufferAttribute(D, 4));
  g.setAttribute('size', new THREE.Float32BufferAttribute(S, 1));
  g.computeBoundingSphere();
  const U = { uNight: { value: 0 }, uTime: { value: 0 }, uScale: { value: 600 } };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: U,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.name = 'airport-light-glow';
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  pts.userData.noDetailCull = true;
  group.add(pts);
  // ---- fixtures: edge light stalks, blue taxi lights, flush inset lights, approach masts with crossbars, PAPI boxes
  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    V = new THREE.Vector3(),
    Sc = new THREE.Vector3(1, 1, 1),
    E = new THREE.Euler();
  const stalkG = new THREE.CylinderGeometry(0.06, 0.08, 0.36, 8).translate(0, 0.18, 0),
    capG = new THREE.CylinderGeometry(0.11, 0.09, 0.12, 10).translate(0, 0.42, 0);
  const lists = { stalk: [], capW: [], capB: [], flush: [], mast: [], bar: [], papi: [] };
  for (const f of fix) {
    const [x, z, k] = f,
      y = ground(x, z) + PAVE_Y * (k === 4 ? 1 : 0);
    if (k === 0 || k === 1) {
      M.compose(V.set(x, y, z), Q.identity(), Sc.set(1, 1, 1));
      lists.stalk.push(M.clone());
      (k === 0 ? lists.capW : lists.capB).push(M.clone());
    } else if (k === 4) {
      M.compose(V.set(x, y, z), Q.identity(), Sc.set(1, 1, 1));
      lists.flush.push(M.clone());
    } else if (k === 2) {
      const h = f[3],
        half = f[4];
      M.compose(V.set(x, ground(x, z), z), Q.identity(), Sc.set(1, h, 1));
      lists.mast.push(M.clone());
      const r = ap.runways.find(() => true);
      void r;
      lists.bar.push({ x, z, y: ground(x, z) + h, half });
    } else if (k === 3) {
      E.set(0, f[3], 0);
      Q.setFromEuler(E);
      M.compose(V.set(x, ground(x, z), z), Q, Sc.set(1, 1, 1));
      lists.papi.push(M.clone());
    }
  }
  const metal = new THREE.MeshStandardMaterial({
    color: 0xd9c23a,
    roughness: 0.55,
    metalness: 0.2,
  }); // frangible stalks: yellow
  const glassW = new THREE.MeshStandardMaterial({
    color: 0xfff6dc,
    emissive: 0xffe9b0,
    emissiveIntensity: 0.6,
    roughness: 0.2,
  });
  const glassB = new THREE.MeshStandardMaterial({
    color: 0x3050ff,
    emissive: 0x2040ff,
    emissiveIntensity: 0.6,
    roughness: 0.2,
  });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8c8f92, roughness: 0.6, metalness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 });
  const inst = (geo, mat2, list, name) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat2, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = name;
    im.castShadow = false;
    im.receiveShadow = true;
    group.add(im);
    return im;
  };
  inst(stalkG, metal, lists.stalk, 'airport-light-stalk');
  inst(capG, glassW, lists.capW, 'airport-light-cap');
  inst(capG, glassB, lists.capB, 'airport-light-cap-blue');
  inst(
    new THREE.CylinderGeometry(0.2, 0.22, 0.05, 12).translate(0, 0.02, 0),
    grey,
    lists.flush,
    'airport-light-flush',
  );
  inst(
    new THREE.BoxGeometry(0.12, 1, 0.12).translate(0, 0.5, 0),
    grey,
    lists.mast,
    'airport-approach-mast',
  );
  // approach crossbars: box per bar, oriented across the runway
  const barM = [];
  for (const r of ap.runways) {
    const F = frame(r.a, r.b);
    for (const b of lists.bar) {
      if (Math.abs(F.q(b.x, b.z)) > 1 || (F.s(b.x, b.z) > -5 && F.s(b.x, b.z) < F.L + 5)) continue;
      E.set(0, F.heading, 0);
      Q.setFromEuler(E);
      M.compose(V.set(b.x, b.y - 0.08, b.z), Q, Sc.set(b.half * 2 + 0.4, 0.1, 0.12));
      barM.push(M.clone());
    }
  }
  inst(new THREE.BoxGeometry(1, 1, 1), grey, barM, 'airport-approach-bar');
  inst(
    new THREE.BoxGeometry(1.6, 0.7, 0.9).translate(0, 0.55, 0),
    white,
    lists.papi,
    'airport-papi',
  );
  {
    const ms = fix
      .filter((f) => f[2] === 5)
      .map((f) => {
        M.compose(V.set(f[0], ground(f[0], f[1]), f[1]), Q.identity(), Sc.set(1, 1, 1));
        return M.clone();
      });
    inst(
      new THREE.CylinderGeometry(0.18, 0.32, 22, 10).translate(0, 11, 0),
      grey,
      ms,
      'airport-flood-mast',
    );
    inst(
      new THREE.BoxGeometry(2.6, 0.5, 0.8).translate(0, 22.2, 0),
      grey,
      ms,
      'airport-flood-head',
    );
  }
  // light pools: additive radial quads on the apron, only at night
  const poolU = { uNight: U.uNight };
  if (pools.length) {
    const pp = [],
      uv = [],
      idx = [];
    pools.forEach(([x, z, r], i) => {
      const y = ground(x, z) + PAVE_Y + 0.02;
      pp.push(x - r, y, z - r, x + r, y, z - r, x + r, y, z + r, x - r, y, z + r);
      uv.push(-1, -1, 1, -1, 1, 1, -1, 1);
      const b = i * 4;
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g2.setIndex(idx);
    g2.computeBoundingSphere();
    const pm = new THREE.ShaderMaterial({
      uniforms: poolU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -8,
      vertexShader:
        'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform float uNight; varying vec2 vUv; void main() { float r = length(vUv); float k = 1.0 - smoothstep(0.0, 1.0, r); gl_FragColor = vec4(vec3(1.0, 0.82, 0.6) * k * k * k * 0.07 * uNight, 1.0); }',
    });
    const pm2 = new THREE.Mesh(g2, pm);
    pm2.name = 'airport-light-pools';
    pm2.renderOrder = 2;
    pm2.userData.noDetailCull = true;
    group.add(pm2);
  }
  return {
    points: pts,
    counts,
    update(dt, cam, renderer) {
      U.uTime.value = game.clock?.elapsed ?? performance.now() / 1000;
      U.uNight.value = Math.max(0, Math.min(1, game.env?.nightFactor ?? 0));
      if (cam) {
        const h = renderer?.domElement?.height || 720;
        U.uScale.value = h / (2 * Math.tan((cam.fov * Math.PI) / 360));
      }
    },
  };
}

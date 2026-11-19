// Aircraft kit, parts: wheels, gear legs, propellers, rotors, floats, skids, lights, antennas, small fittings, crew figures.
import {
  THREE,
  loft,
  sec,
  liftSurface,
  MAT,
  tubeBetween,
  DEG,
  clamp,
  lerp,
  rng,
  mergeGeometries,
} from './core.js';

const lathe = (pts, seg = 24) =>
  new THREE.LatheGeometry(
    pts.map((p) => new THREE.Vector2(p[0], p[1])),
    seg,
  );
const M4 = (p = [0, 0, 0], r = [0, 0, 0], s = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'YXZ')),
    Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s),
  );
export { M4 };

// ---------------------------------------------------------------------------------------------- wheels
// Returns a Group whose origin is the wheel center; it spins about local X.
export function wheel(r, w = r * 0.72, { rimColor = 0xc9ccd0, twin = 0 } = {}) {
  const g = new THREE.Group(),
    one = (dx) => {
      const tire = lathe(
        [
          [r * 0.6, -w * 0.4],
          [r * 0.78, -w * 0.5],
          [r * 0.93, -w * 0.47],
          [r, -w * 0.3],
          [r * 1.005, 0],
          [r, w * 0.3],
          [r * 0.93, w * 0.47],
          [r * 0.78, w * 0.5],
          [r * 0.6, w * 0.4],
        ],
        28,
      );
      tire.rotateZ(Math.PI / 2);
      const rim = lathe(
        [
          [0.001, -w * 0.2],
          [r * 0.2, -w * 0.24],
          [r * 0.24, -w * 0.33],
          [r * 0.52, -w * 0.36],
          [r * 0.6, -w * 0.42],
          [r * 0.62, -w * 0.4],
          [r * 0.6, w * 0.4],
          [r * 0.52, w * 0.36],
          [r * 0.24, w * 0.33],
          [r * 0.2, w * 0.24],
          [0.001, w * 0.2],
        ],
        20,
      );
      rim.rotateZ(Math.PI / 2);
      const bolts = [];
      for (let i = 0; i < 6; i++) {
        const b = new THREE.CylinderGeometry(r * 0.03, r * 0.03, w * 0.74, 6);
        b.rotateZ(Math.PI / 2);
        b.translate(
          0,
          Math.cos((i * Math.PI) / 3) * r * 0.36,
          Math.sin((i * Math.PI) / 3) * r * 0.36,
        );
        bolts.push(b);
      }
      const t = new THREE.Mesh(tire, MAT.tire()),
        rm = new THREE.Mesh(mergeGeometries([rim, ...bolts]), MAT.metal(rimColor, 0.4));
      t.position.x = rm.position.x = dx;
      t.castShadow = rm.castShadow = true;
      g.add(t, rm);
    };
  if (twin) {
    one(-twin / 2);
    one(twin / 2);
    const ax = new THREE.CylinderGeometry(r * 0.12, r * 0.12, twin, 10);
    ax.rotateZ(Math.PI / 2);
    g.add(new THREE.Mesh(ax, MAT.metal(0x8a8d91, 0.45)));
  } else one(0);
  return g;
}
// streamlined wheel fairing ("pant") around a wheel of radius r; origin at the wheel center
export function wheelPant(r, w) {
  const L = loft(
    [
      sec(-r * 2.3, 0.001, 0.001),
      sec(-r * 1.7, w * 0.45, r * 0.5, r * 0.25, r * 0.15),
      sec(-r * 0.6, w * 0.78, r * 0.95, r * 0.45, r * 0.1),
      sec(r * 0.3, w * 0.82, r * 1.0, r * 0.5, r * 0.1),
      sec(r * 1.1, w * 0.6, r * 0.75, r * 0.35, r * 0.1),
      sec(r * 1.45, 0.001, 0.001, 0.001, r * 0.2),
    ],
    {
      ring: 16,
      stations: 12,
      regions: [
        { kind: 'hole', z0: -r * 0.85, z1: r * 0.85, a0: 150, a1: 180 },
        { kind: 'hole', z0: -r * 0.85, z1: r * 0.85, a0: -180, a1: -150 },
      ],
    },
  );
  return L.geos.main;
}
// Landing gear leg from an attach point to the axle. kind: 'oleo' (telescopic with torque links) or 'spring' (flat steel leaf).
// Returns { static: [geometry..] in body space } (the wheel is added by the caller at the axle).
export function gearLeg(top, axle, r, kind = 'oleo', side = 0) {
  const out = { paint: [], metal: [], chrome: [] },
    T = new THREE.Vector3(...top),
    A = new THREE.Vector3(...axle);
  if (kind === 'spring') {
    const g = tubeBetween(top, axle, r * 0.16, r * 1.1, 8);
    out.paint.push(g);
    const ax = new THREE.CylinderGeometry(r * 0.1, r * 0.1, r * 0.9, 8);
    ax.rotateZ(Math.PI / 2);
    ax.translate(A.x, A.y, A.z);
    out.metal.push(ax);
  } else {
    const mid = T.clone().lerp(A, 0.55);
    out.paint.push(tubeBetween(top, mid.toArray(), r * 0.2, 0, 12));
    out.chrome.push(tubeBetween(mid.toArray(), [A.x, A.y + r * 0.1, A.z], r * 0.13, 0, 12));
    // torque links (scissors) behind the strut
    const k0 = T.clone().lerp(A, 0.5),
      k1 = T.clone().lerp(A, 0.72),
      k2 = T.clone().lerp(A, 0.92);
    k1.z -= r * 0.75;
    out.metal.push(
      tubeBetween(k0.toArray(), k1.toArray(), r * 0.045, r * 0.2, 6),
      tubeBetween(k1.toArray(), k2.toArray(), r * 0.045, r * 0.2, 6),
    );
    const ax = new THREE.CylinderGeometry(r * 0.12, r * 0.12, r * 1.3, 10);
    ax.rotateZ(Math.PI / 2);
    ax.translate(A.x - side * r * 0.2, A.y, A.z);
    out.metal.push(ax);
    // brake line
    out.metal.push(
      tubeBetween(
        [T.x, T.y - 0.05, T.z - r * 0.25],
        [A.x, A.y + r * 0.3, A.z - r * 0.3],
        0.008,
        0,
        5,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- blur discs
const discTexCache = new Map();
function discTexture(kind, blades, tip) {
  const key = kind + blades + tip;
  if (discTexCache.has(key)) return discTexCache.get(key);
  const N = 512,
    c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(N / 2, N / 2, N * 0.06, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(20,20,22,0.0)');
  g.addColorStop(0.12, 'rgba(22,22,24,0.55)');
  g.addColorStop(0.5, 'rgba(26,26,28,0.3)');
  g.addColorStop(0.9, 'rgba(30,30,32,0.36)');
  g.addColorStop(0.955, tip);
  g.addColorStop(0.985, tip);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, N, N);
  // stroboscopic ghost blades
  x.translate(N / 2, N / 2);
  for (let i = 0; i < blades * 2; i++) {
    x.rotate(Math.PI / blades);
    const gg = x.createLinearGradient(0, -N * 0.06, 0, N * 0.06);
    gg.addColorStop(0, 'rgba(10,10,12,0)');
    gg.addColorStop(0.5, `rgba(10,10,12,${i % 2 ? 0.1 : 0.22})`);
    gg.addColorStop(1, 'rgba(10,10,12,0)');
    x.fillStyle = gg;
    x.fillRect(N * 0.05, -N * 0.06, N * 0.43, N * 0.12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  discTexCache.set(key, t);
  return t;
}
function blurDisc(R, kind, blades, tip = 'rgba(235,200,60,0.5)') {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(R, 40),
    new THREE.MeshBasicMaterial({
      map: discTexture(kind, blades, tip),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  m.renderOrder = 3;
  return m;
}

// ---------------------------------------------------------------------------------------------- propeller
// Returns { node (origin = hub, spins about local +Z), set(frac, dt) }. Blade geometry twisted root-to-tip.
export function propeller({
  D = 1.9,
  blades = 2,
  spinnerR = 0.16,
  spinnerL = 0.42,
  chord = 0.15,
  bladeColor = 0x1c1d1f,
  tipColor = 0xf2c230,
  spinnerMat = null,
  cw = true,
  pitch = 34,
}) {
  const node = new THREE.Group(),
    spin = new THREE.Group();
  node.add(spin);
  const R = D / 2,
    root = spinnerR * 0.7;
  const bl = liftSurface({
    span: R - root,
    c0: chord * 0.75,
    c1: chord * 0.55,
    chordFn: (s) => chord * (0.62 + 0.75 * Math.sin(Math.PI * Math.pow(s, 0.8)) * (1 - s * 0.35)),
    t0: 0.2,
    t1: 0.07,
    camber: 0.03,
    twist: -(pitch - 12),
    nSpan: 8,
    nChord: 6,
    tip: 'round',
  });
  const geo = bl.fixed;
  geo.translate(root, 0, chord * 0.3);
  geo.rotateX((90 - pitch) * DEG * (cw ? 1 : -1));
  // vertex colors are not used: tips get a separate thin band
  const bladeMat = new THREE.MeshStandardMaterial({
    color: bladeColor,
    roughness: 0.42,
    metalness: 0.2,
  });
  const tipG = new THREE.CylinderGeometry(chord * 0.33, chord * 0.26, 0.06, 8);
  tipG.scale(1, 1, 0.22);
  tipG.rotateZ(Math.PI / 2);
  tipG.translate(R * 0.93, 0, 0);
  const tipMat = new THREE.MeshStandardMaterial({ color: tipColor, roughness: 0.5 });
  const bladesG = new THREE.Group();
  for (let i = 0; i < blades; i++) {
    const b = new THREE.Mesh(geo, bladeMat),
      t = new THREE.Mesh(tipG, tipMat);
    b.castShadow = true;
    const h = new THREE.Group();
    h.add(b, t);
    h.rotation.z = (i * 2 * Math.PI) / blades;
    bladesG.add(h);
  }
  spin.add(bladesG);
  const sp = lathe(
    [
      [0.001, spinnerL],
      [spinnerR * 0.3, spinnerL * 0.93],
      [spinnerR * 0.62, spinnerL * 0.7],
      [spinnerR * 0.87, spinnerL * 0.38],
      [spinnerR, 0.06],
      [spinnerR, -0.03],
      [spinnerR * 0.9, -0.05],
    ],
    24,
  );
  sp.rotateX(Math.PI / 2);
  sp.translate(0, 0, -spinnerL * 0.35);
  const spm = new THREE.Mesh(sp, spinnerMat || MAT.chrome());
  spm.castShadow = true;
  spin.add(spm);
  const disc = blurDisc(R, 'prop', blades);
  node.add(disc);
  let ang = 0;
  return {
    node,
    spin,
    disc,
    R,
    set(frac, dt, maxRadS = 240) {
      ang += (cw ? -1 : 1) * frac * maxRadS * dt;
      spin.rotation.z = ang % (Math.PI * 2);
      const k = clamp((frac - 0.12) / 0.3, 0, 1);
      disc.material.opacity = k * 0.85;
      bladesG.visible = k < 0.98;
      if (k > 0) bladeMat.opacity = 1 - k * 0.9;
      bladeMat.transparent = k > 0.02;
      disc.rotation.z = ang * 0.031;
    },
  };
}

// ---------------------------------------------------------------------------------------------- main rotor
// Returns { node (origin = hub center, spins about +Y, clockwise seen from above), set(frac, dt, coning, tiltX, tiltZ) }.
export function mainRotor({
  R = 5,
  blades = 3,
  chord = 0.3,
  hubR = 0.28,
  mastH = 0.5,
  mastR = 0.07,
  bladeColor = 0x2a2c2f,
  tipColor = 0xf2c230,
  teeter = false,
  hubMat = null,
}) {
  const node = new THREE.Group(),
    spin = new THREE.Group(),
    tilt = new THREE.Group();
  node.add(tilt);
  tilt.add(spin);
  const metal = hubMat || MAT.metal(0x9a9da2, 0.38),
    dark = MAT.dark();
  const hubG = [],
    root = hubR * 1.5;
  hubG.push(new THREE.CylinderGeometry(hubR * 0.55, hubR * 0.65, 0.22, 16).translate(0, 0, 0));
  hubG.push(
    new THREE.CylinderGeometry(hubR * 0.9, hubR * 0.9, 0.035, 20).translate(0, 0.1, 0),
    new THREE.CylinderGeometry(hubR * 0.9, hubR * 0.9, 0.035, 20).translate(0, -0.1, 0),
  );
  hubG.push(
    new THREE.SphereGeometry(hubR * 0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(
      0,
      0.11,
      0,
    ),
  );
  const bl = liftSurface({
    span: R - root,
    c0: chord,
    c1: chord,
    t0: 0.12,
    t1: 0.1,
    camber: 0,
    twist: -8,
    nSpan: 10,
    nChord: 6,
    tip: 'round',
  });
  const geo = bl.fixed;
  geo.translate(root, 0, chord * 0.27);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: bladeColor,
    roughness: 0.5,
    metalness: 0.1,
  });
  const tipG = new THREE.BoxGeometry(R * 0.035, 0.012, chord * 0.98).translate(
      R * 0.975,
      0.016,
      -chord * 0.22,
    ),
    tipMat = new THREE.MeshStandardMaterial({ color: tipColor, roughness: 0.55 });
  const leG = new THREE.BoxGeometry((R - root) * 0.96, 0.01, chord * 0.14).translate(
      root + (R - root) * 0.5,
      0.012,
      chord * 0.2,
    ),
    leMat = MAT.metal(0xa9acb0, 0.3);
  const bladeNodes = [],
    bladesG = new THREE.Group();
  for (let i = 0; i < blades; i++) {
    const az = new THREE.Group(),
      flap = new THREE.Group();
    az.rotation.y = (i * 2 * Math.PI) / blades;
    az.add(flap);
    const b = new THREE.Mesh(geo, bladeMat);
    b.castShadow = true;
    flap.add(b, new THREE.Mesh(tipG, tipMat), new THREE.Mesh(leG, leMat));
    bladesG.add(az);
    bladeNodes.push(flap);
    // blade grip, pitch horn and link (rotate with the hub)
    const a = (i * 2 * Math.PI) / blades,
      c = Math.cos(a),
      s = Math.sin(a),
      rot = new THREE.Matrix4().makeRotationY(a);
    hubG.push(
      new THREE.BoxGeometry(root * 0.9, 0.09, chord * 0.55)
        .translate(root * 0.75, 0, 0)
        .applyMatrix4(rot),
    );
    hubG.push(
      new THREE.CylinderGeometry(0.014, 0.014, 0.42, 6)
        .translate(root * 0.62, -0.2, chord * 0.42)
        .applyMatrix4(rot),
    );
    hubG.push(
      new THREE.BoxGeometry(0.05, 0.03, chord * 0.5)
        .translate(root * 0.62, 0, chord * 0.3)
        .applyMatrix4(rot),
    );
    if (!teeter)
      hubG.push(
        new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8)
          .rotateX(Math.PI / 2)
          .translate(root * 0.5, 0.05, -chord * 0.3)
          .applyMatrix4(rot),
      ); // lead-lag damper
  }
  // swashplate + mast (static with the spin group; the mast reaches down to the cowling)
  hubG.push(
    new THREE.CylinderGeometry(hubR * 0.75, hubR * 0.75, 0.05, 18).translate(0, -0.4, 0),
    new THREE.CylinderGeometry(mastR, mastR * 1.15, mastH, 12).translate(0, -mastH / 2, 0),
  );
  const hub = new THREE.Mesh(
    mergeGeometries(
      hubG.map((g) => {
        const q = g.index ? g.toNonIndexed() : g;
        return q;
      }),
    ),
    metal,
  );
  hub.castShadow = true;
  spin.add(hub);
  spin.add(bladesG);
  const boot = new THREE.Mesh(
    new THREE.CylinderGeometry(mastR * 1.6, mastR * 2.2, 0.12, 12).translate(0, -mastH + 0.06, 0),
    dark,
  );
  node.add(boot);
  const disc = blurDisc(R, 'rotor', blades);
  disc.rotation.x = -Math.PI / 2;
  tilt.add(disc);
  let ang = 0;
  return {
    node,
    spin,
    disc,
    bladeNodes,
    R,
    set(frac, dt, coning = null, tiltX = 0, tiltZ = 0, maxRadS = 40) {
      ang -= frac * maxRadS * dt;
      spin.rotation.y = ang % (Math.PI * 2);
      const k = clamp((frac - 0.25) / 0.4, 0, 1);
      disc.material.opacity = k * 0.8;
      bladesG.visible = k < 0.97;
      bladeMat.transparent = k > 0.02;
      bladeMat.opacity = 1 - k * 0.85;
      // droop when stopped, coning under load (blade local Z is the flap axis: + raises the tip)
      const cone = coning != null ? coning : lerp(-0.045, 0.035, clamp(frac * 1.2, 0, 1));
      for (const b of bladeNodes) b.rotation.z = cone;
      tilt.rotation.x = tiltX;
      tilt.rotation.z = tiltZ;
      disc.position.y = Math.sin(Math.max(0, cone)) * R * 0.5;
    },
  };
}
// Tail rotor (open) or ducted fan. Origin = hub; spins about local X (thrust axis sideways).
export function tailRotor({
  R = 0.6,
  blades = 2,
  chord = 0.1,
  ducted = false,
  bladeColor = 0x2a2c2f,
}) {
  const node = new THREE.Group(),
    spin = new THREE.Group();
  node.add(spin);
  const bladeMat = new THREE.MeshStandardMaterial({ color: bladeColor, roughness: 0.5 });
  const bl = liftSurface({
    span: R * 0.86,
    c0: chord,
    c1: chord * 0.85,
    t0: 0.12,
    camber: 0,
    twist: -6,
    nSpan: 4,
    nChord: 5,
    tip: ducted ? 'flat' : 'round',
  });
  const geo = bl.fixed;
  geo.translate(R * 0.14, 0, chord * 0.3);
  geo.rotateX(18 * DEG);
  geo.rotateZ(Math.PI / 2); // blade now along +Y, spinning about X
  const bladesG = new THREE.Group();
  for (let i = 0; i < blades; i++) {
    const b = new THREE.Mesh(geo, bladeMat);
    b.rotation.x = (i * 2 * Math.PI) / blades;
    b.castShadow = !ducted;
    bladesG.add(b);
  }
  spin.add(bladesG);
  const hubG = new THREE.CylinderGeometry(R * 0.16, R * 0.16, R * 0.22, 12);
  hubG.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(hubG, MAT.metal(0x8f9296, 0.4)));
  const disc = blurDisc(R, 'tail', blades, ducted ? 'rgba(40,40,42,0.5)' : 'rgba(220,60,50,0.55)');
  disc.rotation.y = Math.PI / 2;
  node.add(disc);
  let ang = 0;
  return {
    node,
    disc,
    set(frac, dt, maxRadS = 210) {
      ang += frac * maxRadS * dt;
      spin.rotation.x = ang % (Math.PI * 2);
      const k = clamp((frac - 0.2) / 0.35, 0, 1);
      disc.material.opacity = k * 0.8;
      bladesG.visible = k < 0.97;
    },
  };
}

// ---------------------------------------------------------------------------------------------- skids and floats
// Helicopter skid gear from the four fleet contact points. attach = [[x,y,z] x4] belly attach points for the cross tubes (FL, FR, RL, RR).
export function skidGear(points, attach, { tubeR = 0.035, steps = true } = {}) {
  const geos = { metal: [], dark: [] };
  for (const sgn of [1, -1]) {
    const f = points.find((p) => Math.sign(p.p[0]) === sgn && p.p[2] > 0).p,
      r = points.find((p) => Math.sign(p.p[0]) === sgn && p.p[2] < 0).p;
    const y = f[1] + tubeR,
      len = f[2] - r[2];
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(f[0], y + 0.26, f[2] + len * 0.36),
      new THREE.Vector3(f[0], y + 0.07, f[2] + len * 0.27),
      new THREE.Vector3(f[0], y, f[2] + len * 0.14),
      new THREE.Vector3(f[0], y, f[2]),
      new THREE.Vector3(r[0], y, r[2]),
      new THREE.Vector3(r[0], y, r[2] - len * 0.22),
    ]);
    geos.metal.push(new THREE.TubeGeometry(curve, 28, tubeR, 10, false));
    geos.dark.push(
      new THREE.BoxGeometry(tubeR * 2.4, 0.012, len * 0.5).translate(
        f[0],
        f[1] + 0.004,
        (f[2] + r[2]) / 2,
      ),
    ); // wear shoe
    geos.dark.push(
      new THREE.SphereGeometry(tubeR * 1.05, 8, 6).translate(r[0], y, r[2] - len * 0.22),
    );
    if (steps)
      geos.dark.push(
        new THREE.BoxGeometry(0.2, 0.02, 0.55).translate(
          f[0] + sgn * 0.02,
          y + 0.3,
          f[2] - len * 0.25,
        ),
      );
  }
  // bowed cross tubes
  for (const [iL, iR, zi] of [
    [0, 1, 0],
    [2, 3, 2],
  ]) {
    const z = points[zi].p[2],
      yS = points[zi].p[1] + tubeR,
      xS = Math.abs(points[zi].p[0]),
      aL = attach[iL],
      aR = attach[iR];
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(xS, yS, z),
        new THREE.Vector3(xS * 0.93, yS + (aL[1] - yS) * 0.45, z),
        new THREE.Vector3(aL[0], aL[1], aL[2]),
        new THREE.Vector3(0, aL[1] + 0.02, (aL[2] + aR[2]) / 2),
        new THREE.Vector3(aR[0], aR[1], aR[2]),
        new THREE.Vector3(-xS * 0.93, yS + (aR[1] - yS) * 0.45, z),
        new THREE.Vector3(-xS, yS, z),
      ],
      false,
      'catmullrom',
      0.3,
    );
    geos.metal.push(new THREE.TubeGeometry(curve, 36, tubeR * 0.95, 10, false));
    if (steps)
      for (const sgn of [1, -1])
        geos.metal.push(
          tubeBetween(
            [sgn * xS, yS + 0.3, z - 0.3],
            [sgn * xS * 0.93, yS + (aL[1] - yS) * 0.45, z],
            0.012,
            0,
            6,
          ),
        );
  }
  return geos;
}
// Seaplane float: V-bottom planing hull with a step, flat deck, bow bumper, keel strip and a water rudder (returned separately).
// f = fleet gear.floats. The float is built on the centerline x = 0; the caller offsets it to +-f.x.
export function floatHull(f) {
  const { bowZ, sternZ, stepZ, beam, depth, keelY, deckY } = f,
    hb = beam / 2,
    len = bowZ - sternZ;
  const dk = deckY,
    S = [];
  // forebody: keel rises toward the bow, afterbody: keel jumps up at the step and rises to the stern
  const fore = [
    [bowZ, 0.02, 0.05, dk + 0.02],
    [bowZ - len * 0.03, 0.3, 0.3, dk - 0.22],
    [bowZ - len * 0.1, 0.72, 0.62, keelY + 0.42],
    [bowZ - len * 0.22, 0.94, 0.86, keelY + 0.16],
    [lerp(bowZ, stepZ, 0.7), 1, 0.97, keelY + 0.04],
    [stepZ + 0.01, 1, 1, keelY],
  ];
  const aft = [
    [stepZ - 0.01, 1, 0.84, keelY + 0.12],
    [lerp(stepZ, sternZ, 0.5), 0.86, 0.66, keelY + 0.3],
    [sternZ + 0.25, 0.6, 0.42, keelY + 0.5],
    [sternZ, 0.45, 0.3, keelY + 0.58],
  ];
  for (const [z, wk, dkk, ky] of [...fore, ...aft]) {
    const top = 0.1 * dkk + 0.02,
      y = dk - top;
    S.push({ z, w: hb * wk, top, bot: Math.max(0.02, y - ky), y, e: 3.4, et: 5, eb: 1.25 });
  }
  const L = loft(S, { ring: 20, stations: 30, capA: true, zCuts: [stepZ - 0.01, stepZ + 0.01] });
  const extra = { metal: [], dark: [], rudder: null };
  extra.metal.push(
    new THREE.BoxGeometry(0.03, 0.03, (bowZ - stepZ) * 0.8).translate(
      0,
      keelY - 0.005,
      lerp(bowZ, stepZ, 0.55),
    ),
  ); // keel wear strip
  for (const sx of [1, -1])
    extra.metal.push(
      new THREE.BoxGeometry(0.035, 0.02, len * 0.6).translate(
        sx * hb * 0.99,
        dk - 0.14,
        lerp(bowZ, sternZ, 0.45),
      ),
    ); // spray rails
  for (const z of [bowZ - len * 0.16, stepZ + 0.3, sternZ + 0.7]) {
    extra.metal.push(
      new THREE.BoxGeometry(0.16, 0.03, 0.04).translate(0, dk + 0.045, z),
      new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6).translate(0, dk + 0.02, z),
    );
  } // mooring cleats
  for (let i = 0; i < 4; i++)
    extra.dark.push(
      new THREE.CylinderGeometry(0.07, 0.07, 0.012, 14).translate(
        0,
        dk + 0.004,
        lerp(bowZ - len * 0.25, sternZ + 1.2, i / 3),
      ),
    ); // inspection hatches
  extra.dark.push(
    new THREE.SphereGeometry(0.13, 10, 8).scale(1, 0.8, 0.7).translate(0, dk - 0.1, bowZ - 0.03),
  ); // bow bumper
  extra.dark.push(
    new THREE.BoxGeometry(beam * 0.55, 0.006, len * 0.5).translate(
      0,
      dk + 0.002,
      lerp(bowZ, sternZ, 0.42),
    ),
  ); // non-slip walkway
  const rud = new THREE.BoxGeometry(0.02, 0.5, 0.26).translate(0, -0.28, -0.13);
  extra.rudder = { geo: rud, pos: [0, dk - 0.15, sternZ - 0.02] };
  return { geo: L.geos.main, cap: L.geos.capA, extra, L };
}

// ---------------------------------------------------------------------------------------------- lights
let flareTex = null;
function flareTexture() {
  if (flareTex) return flareTex;
  const N = 128,
    c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, N, N);
  x.globalCompositeOperation = 'lighter';
  for (const a of [0, Math.PI / 2]) {
    x.save();
    x.translate(N / 2, N / 2);
    x.rotate(a);
    const gg = x.createLinearGradient(-N / 2, 0, N / 2, 0);
    gg.addColorStop(0, 'rgba(255,255,255,0)');
    gg.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gg;
    x.fillRect(-N / 2, -1.5, N, 3);
    x.restore();
  }
  flareTex = new THREE.CanvasTexture(c);
  flareTex.colorSpace = THREE.SRGBColorSpace;
  return flareTex;
}
// A light fixture: small lens housing + additive flare sprite. kind: nav_l (red), nav_r (green), tail (white), strobe, beacon, landing, taxi.
export function lightFixture(kind, size = 0.035) {
  const col =
    {
      nav_l: 0xff1a1a,
      nav_r: 0x1aff4a,
      tail: 0xffffff,
      strobe: 0xffffff,
      beacon: 0xff2a1a,
      landing: 0xfff4dc,
      taxi: 0xfff4dc,
      logo: 0xfff4dc,
      cabin: 0xffe2b0,
      search: 0xeaf4ff,
    }[kind] || 0xffffff;
  const g = new THREE.Group(),
    mat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      emissive: col,
      emissiveIntensity: 0.02,
      roughness: 0.15,
      transparent: true,
      opacity: 0.9,
    });
  const lens = new THREE.Mesh(
    kind === 'beacon'
      ? new THREE.CylinderGeometry(size * 0.8, size, size * 1.6, 10).translate(0, size * 0.8, 0)
      : new THREE.SphereGeometry(size, 10, 8),
    mat,
  );
  g.add(lens);
  const sm = new THREE.SpriteMaterial({
    map: flareTexture(),
    color: col,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const sp = new THREE.Sprite(sm);
  const big =
    kind === 'landing' || kind === 'search'
      ? 7
      : kind === 'strobe'
        ? 4.5
        : kind === 'beacon'
          ? 2.6
          : kind === 'taxi'
            ? 3
            : 1.3;
  sp.scale.setScalar(big);
  sp.renderOrder = 5;
  g.add(sp);
  g.userData.light = { kind, mat, sprite: sm, color: col, on: 0 };
  return g;
}
// Drive a list of fixtures from STATE (blink patterns keyed on state.t; each airframe gets a phase from its seed).
export function updateLights(fixtures, state, phase = 0) {
  const t = state.t + phase,
    L = state.lights,
    night = state.night ?? 0,
    dayK = 0.25 + 0.75 * night;
  for (const f of fixtures) {
    const u = f.userData.light;
    let on = 0;
    switch (u.kind) {
      case 'nav_l':
      case 'nav_r':
      case 'tail':
        on = L.nav ? 1 : 0;
        break;
      case 'strobe': {
        const p = t % 1.1;
        on = L.strobe && (p < 0.045 || (p > 0.14 && p < 0.185)) ? 1 : 0;
        break;
      }
      case 'beacon': {
        const p = t % 1.0;
        on = L.beacon ? Math.max(0, 1 - Math.abs(p - 0.1) * 9) : 0;
        break;
      }
      case 'landing':
        on = L.landing ? 1 : 0;
        break;
      case 'taxi':
        on = L.taxi || L.landing ? 0.7 : 0;
        break;
      case 'logo':
        on = L.nav && night > 0.4 ? 0.5 : 0;
        break;
      case 'search':
        on = L.search ? 1 : 0;
        break;
      default:
        on = L.cabin ? 1 : 0;
    }
    u.mat.emissiveIntensity = 0.02 + on * 6;
    u.sprite.opacity = on * (u.kind === 'landing' || u.kind === 'search' ? 0.95 : 0.85) * dayK;
  }
}

// ---------------------------------------------------------------------------------------------- small fittings (geometry in body space)
export const fit = {
  bladeAntenna(p, h = 0.22, down = false) {
    const s = liftSurface({
      span: h,
      c0: h * 0.7,
      c1: h * 0.28,
      sweep: h * 0.55,
      t0: 0.1,
      camber: 0,
      vertical: true,
      nSpan: 2,
      nChord: 4,
      tip: 'flat',
    }).fixed;
    if (down) s.rotateZ(Math.PI);
    s.translate(p[0], p[1], p[2] + h * 0.35);
    return s;
  },
  whip(p, len = 0.5, tilt = -0.5) {
    const g = new THREE.CylinderGeometry(0.004, 0.006, len, 5).translate(0, len / 2, 0);
    g.rotateX(tilt);
    g.translate(...p);
    return g;
  },
  pitot(p, side = 1, len = 0.22) {
    return mergeGeometries([
      tubeBetween(p, [p[0], p[1] - 0.09, p[2]], 0.009, 0.03, 6).toNonIndexed(),
      tubeBetween(
        [p[0], p[1] - 0.09, p[2] - 0.02],
        [p[0], p[1] - 0.09, p[2] + len],
        0.009,
        0,
        6,
      ).toNonIndexed(),
    ]);
  },
  handle(p, n, len = 0.11) {
    const g = new THREE.BoxGeometry(0.014, 0.028, len);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(...n).normalize(),
    );
    g.applyQuaternion(q);
    g.translate(p[0] + n[0] * 0.012, p[1] + n[1] * 0.012, p[2] + n[2] * 0.012);
    return g;
  },
  hinge(p, n) {
    const g = new THREE.CylinderGeometry(0.011, 0.011, 0.07, 6);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(...n).normalize(),
    );
    g.applyQuaternion(q);
    g.translate(p[0] + n[0] * 0.006, p[1] + n[1] * 0.006, p[2] + n[2] * 0.006);
    return g;
  },
  step(p, side = 1, w = 0.16) {
    return mergeGeometries([
      new THREE.BoxGeometry(w, 0.018, 0.09)
        .translate(p[0] + (side * w) / 2, p[1], p[2])
        .toNonIndexed(),
      tubeBetween(
        [p[0], p[1] + 0.18, p[2]],
        [p[0] + side * w * 0.5, p[1], p[2]],
        0.012,
        0,
        6,
      ).toNonIndexed(),
    ]);
  },
  exhaust(p, dir = [0, -0.5, -1], len = 0.3, r = 0.03) {
    const d = new THREE.Vector3(...dir).normalize(),
      e = [p[0] + d.x * len, p[1] + d.y * len, p[2] + d.z * len];
    return tubeBetween(p, e, r, 0, 10);
  },
  wick(p, len = 0.14) {
    return tubeBetween(p, [p[0], p[1], p[2] - len], 0.003, 0, 4);
  },
  cap(p, n, r = 0.04) {
    const g = new THREE.CylinderGeometry(r, r, 0.008, 12);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(...n).normalize(),
      ),
    );
    g.translate(...p);
    return g;
  },
  ring(p, r = 0.025) {
    return new THREE.TorusGeometry(r, 0.005, 5, 10).translate(...p);
  },
};

// ---------------------------------------------------------------------------------------------- crew figure
// A seated pilot / passenger: smooth capsule body, flight suit or shirt, headset or helmet. Origin = hip point, facing +Z.
export function crewFigure({ seed = 1, helmet = false, suit = null, reach = 0.42 } = {}) {
  const R = rng(seed),
    g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({
    color: R.pick([0xc98f6b, 0x8d5a3c, 0xe0ac8a, 0x6b4026, 0xb97a55]),
    roughness: 0.65,
  });
  const cloth = MAT.fabric(
      suit ?? R.pick([0xf1f1ee, 0x2b3a55, 0x5b6b3a, 0x8a3b2b, 0x1d1f24, 0xd9c7a0]),
    ),
    dark = MAT.fabric(R.pick([0x23262d, 0x3a3327, 0x2d3540]));
  const cap = (r, l, p, rot, mat) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), mat);
    m.position.set(...p);
    m.rotation.set(...rot);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  cap(0.15, 0.3, [0, 0.3, -0.02], [0.08, 0, 0], cloth); // torso
  cap(0.045, 0.04, [0, 0.56, 0], [0, 0, 0], skin); // neck
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12).scale(0.92, 1.08, 1), skin);
  head.position.set(0, 0.7, 0.01);
  head.castShadow = true;
  g.add(head);
  if (helmet) {
    const h = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
      MAT.paintPlain(R.pick([0xf2f2f2, 0x1b1d22, 0xd8d2c0]), 0.3),
    );
    h.position.set(0, 0.71, 0);
    g.add(h);
    const v = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.125,
        12,
        8,
        -Math.PI * 0.35 + Math.PI / 2,
        Math.PI * 0.7,
        Math.PI * 0.3,
        Math.PI * 0.3,
      ),
      MAT.glass(0x202428, 0.75),
    );
    v.position.set(0, 0.71, 0.02);
    v.rotation.y = -Math.PI / 2 + Math.PI / 2;
    g.add(v);
  } else {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(
        0.94,
        1.05,
        1.02,
      ),
      new THREE.MeshStandardMaterial({
        color: R.pick([0x1a1410, 0x3a2a1c, 0x6b5a48, 0x888888, 0x0d0d0d]),
        roughness: 0.9,
      }),
    );
    hair.position.set(0, 0.715, -0.005);
    hair.rotation.x = -0.25;
    g.add(hair);
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.112, 0.012, 6, 16, Math.PI),
      MAT.plastic(0x18191b),
    );
    band.position.set(0, 0.7, 0);
    g.add(band);
    for (const sx of [1, -1]) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.042, 0.035, 12).rotateZ(Math.PI / 2),
        MAT.plastic(0x202226),
      );
      cup.position.set(sx * 0.108, 0.69, 0);
      g.add(cup);
    }
    const mic = new THREE.Mesh(
      tubeBetween([0.1, 0.66, 0.02], [0.03, 0.635, 0.115], 0.005, 0, 5),
      MAT.plastic(0x18191b),
    );
    g.add(mic);
    const glasses = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.035, 0.02),
      MAT.glass(0x151515, 0.85),
    );
    glasses.position.set(0, 0.715, 0.1);
    g.add(glasses);
  }
  for (const sx of [1, -1]) {
    cap(0.05, 0.24, [sx * 0.2, 0.36, 0.08], [1.0, 0, sx * 0.12], cloth); // upper arm
    cap(0.042, 0.24, [sx * 0.19, 0.25, 0.08 + reach * 0.62], [1.45, 0, sx * -0.1], skin); // forearm to the controls
    cap(0.075, 0.34, [sx * 0.1, 0.03, 0.22], [1.52, 0, sx * 0.08], dark); // thigh
    cap(0.055, 0.36, [sx * 0.11, -0.2, 0.5], [0.45, 0, 0], dark); // shin
    cap(0.05, 0.14, [sx * 0.11, -0.4, 0.62], [1.4, 0, 0], MAT.leather(0x1a1512)); // shoe
  }
  return g;
}

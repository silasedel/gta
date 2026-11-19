import * as THREE from 'three';

// Distant scenery: layered mountain ridges (west/north/south) and a far skyline of
// neighbouring districts along the coast. Cheap: 2 meshes + 1 InstancedMesh.

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ridgeGeometry({ radius, depth, a0, a1, segs, rows, hMin, hMax, seed }) {
  const rnd = mulberry(seed);
  const ph = Array.from({ length: 6 }, () => rnd() * 100);
  const height = (a, r) => {
    let h =
      0.55 * Math.sin(a * 7 + ph[0]) +
      0.3 * Math.sin(a * 17 + ph[1]) +
      0.18 * Math.sin(a * 41 + ph[2]) +
      0.09 * Math.sin(a * 97 + ph[3]) +
      0.05 * Math.sin(a * 211 + ph[4]);
    h = h * 0.5 + 0.5; // 0..1
    h = Math.pow(Math.max(h, 0), 1.6);
    const edge = Math.min(1, (a - a0) / 0.25, (a1 - a) / 0.25); // taper ends
    const rr = Math.sin(Math.PI * r); // ridge profile across depth
    return (hMin + (hMax - hMin) * h) * Math.max(edge, 0.05) * (0.25 + 0.75 * rr) - 30 * (1 - rr);
  };
  const pos = [];
  for (let j = 0; j <= rows; j++) {
    const r = j / rows;
    const R = radius + depth * r;
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (a1 - a0) * (i / segs);
      pos.push(
        Math.cos(a) * R,
        height(a, r) + (r > 0 && r < 1 ? (rnd() - 0.5) * 18 : 0),
        Math.sin(a) * R,
      );
    }
  }
  const idx = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i,
        b = a + 1,
        c = a + segs + 1,
        d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, 64, 128);
  const rnd = mulberry(7);
  for (let j = 0; j < 32; j++)
    for (let i = 0; i < 16; i++) {
      if (rnd() < 0.42) {
        const w = rnd();
        x.fillStyle = w < 0.6 ? '#ffd9a0' : w < 0.85 ? '#fff2dd' : '#a0d8ff';
        x.globalAlpha = 0.5 + rnd() * 0.5;
        x.fillRect(i * 4 + 1, j * 4 + 1, 2, 2);
      }
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function createDistant(scene) {
  const group = new THREE.Group();
  group.name = 'distant-scenery';
  const mtnMat = new THREE.MeshLambertMaterial({ color: 0x3a4a3c, flatShading: true });
  const farMat = new THREE.MeshLambertMaterial({ color: 0x4a5866, flatShading: true });
  // angles: 0 = +X (ocean). Ridges span west half (PI/2 .. 3PI/2) with some wrap toward north/south coast
  const near = new THREE.Mesh(
    ridgeGeometry({
      radius: 1250,
      depth: 260,
      a0: Math.PI * 0.42,
      a1: Math.PI * 1.58,
      segs: 260,
      rows: 4,
      hMin: 25,
      hMax: 140,
      seed: 3,
    }),
    mtnMat,
  );
  const far = new THREE.Mesh(
    ridgeGeometry({
      radius: 1900,
      depth: 500,
      a0: Math.PI * 0.38,
      a1: Math.PI * 1.62,
      segs: 300,
      rows: 4,
      hMin: 80,
      hMax: 420,
      seed: 11,
    }),
    farMat,
  );
  for (const m of [near, far]) {
    m.receiveShadow = false;
    m.castShadow = false;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
  }

  // far skyline: neighbouring districts north & south along the coast, and inland west
  const winTex = windowTexture();
  const bMat = new THREE.MeshStandardMaterial({
    color: 0x8a8f99,
    roughness: 0.6,
    metalness: 0.2,
    emissive: 0xffffff,
    emissiveMap: winTex,
    emissiveIntensity: 0,
  });
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const N = 220;
  const inst = new THREE.InstancedMesh(box, bMat, N);
  const rnd = mulberry(42);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3(),
    p = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let x, z;
    const zone = rnd();
    if (zone < 0.38) {
      x = -300 + rnd() * 780;
      z = 640 + rnd() * 520;
    } // north coast district
    else if (zone < 0.76) {
      x = -300 + rnd() * 780;
      z = -640 - rnd() * 520;
    } // south coast district
    else {
      x = -650 - rnd() * 450;
      z = -600 + rnd() * 1200;
    } // inland west
    const dist = Math.hypot(x, z);
    const tall = rnd() < 0.18;
    const h = tall ? 70 + rnd() * 140 : 15 + rnd() * 45;
    const w = 18 + rnd() * 30,
      d = 18 + rnd() * 30;
    p.set(x, -0.5, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.3);
    s.set(w, h * (dist > 900 ? 1.1 : 1), d);
    m4.compose(p, q, s);
    inst.setMatrixAt(i, m4);
    col.setHSL(0.07 + rnd() * 0.5, 0.08 + rnd() * 0.12, 0.45 + rnd() * 0.3);
    inst.setColorAt(i, col);
  }
  inst.castShadow = false;
  inst.receiveShadow = false;
  group.add(inst);
  scene.add(group);
  return {
    group,
    setNight(n) {
      bMat.emissiveIntensity = n * 2.2;
    },
  };
}

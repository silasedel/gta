// (r2-veg) Trunk collars: every tree and palm near the camera sits in a soft patch of darker soil and leaf litter (drip line moisture,
// shed leaves), so a trunk grows out of the ground instead of standing on it. One instanced ground decal, rebuilt from the near-LOD
// trunks (bark materials of the library plants) within 70 m whenever the camera has moved 8 m. ?vegcollar=0 turns it off.
import * as THREE from 'three';

const ON = typeof location === 'undefined' || !/[?&]vegcollar=0\b/.test(location.search);
const MAX = 700, R = 70;

function collarTexture() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), im = g.createImageData(S, S), D = im.data;
  let st = 1234567; const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1, r = Math.hypot(u, v), a = Math.atan2(v, u);
    const edge = 0.78 + 0.12 * Math.sin(a * 3 + 1.3) + 0.06 * Math.sin(a * 7 + 0.4); // irregular outline, never a perfect disc
    const t = Math.max(0, 1 - r / edge), al = Math.pow(t, 0.8) * 0.85, i = (y * S + x) * 4, n = rnd();
    D[i] = 74 + n * 22; D[i + 1] = 60 + n * 16; D[i + 2] = 44 + n * 10; D[i + 3] = al * 255; // moist dark soil
  }
  g.putImageData(im, 0, 0);
  for (let k = 0; k < 260; k++) { // shed leaves / fronds bits: small tan and dull olive flecks, denser near the trunk
    const r = Math.pow(rnd(), 0.7) * 0.72, a = rnd() * 6.283, x = S / 2 + Math.cos(a) * r * S / 2, y = S / 2 + Math.sin(a) * r * S / 2;
    const c = rnd() < 0.6 ? [150 + rnd() * 40, 118 + rnd() * 30, 70 + rnd() * 20] : [96 + rnd() * 20, 100 + rnd() * 20, 52 + rnd() * 14];
    g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.55 + rnd() * 0.35})`; g.save(); g.translate(x, y); g.rotate(rnd() * 3.14); g.fillRect(-1.5 - rnd() * 2, -0.6, 3 + rnd() * 3, 1.3); g.restore();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}

export function createCollars(game, groundAt) {
  if (!ON || typeof document === 'undefined') return null;
  const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: collarTexture(), transparent: true, depthWrite: false, roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const im = new THREE.InstancedMesh(geo, mat, MAX); im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false; im.name = 'vegCollars'; im.renderOrder = -1;
  game.scene.add(im);
  const last = new THREE.Vector3(1e9, 0, 0), m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), out = new THREE.Matrix4(), e = new THREE.Euler();
  let t = 0;
  function rebuild(cam) {
    const seen = new Set(), list = [];
    game.scene.traverse((o) => { if (!o.isInstancedMesh || !o.visible || !o.count || o === im) return; const vg = o.material?.userData?.veg; if (!vg || vg.family !== 'bark') return;
      const f = vg.u?.uFade?.value; if (f && f.y > 0) return; // near LOD only
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); p.setFromMatrixPosition(m); const d2 = (p.x - cam.position.x) ** 2 + (p.z - cam.position.z) ** 2; if (d2 > R * R) continue;
        const k = Math.round(p.x * 2) + ',' + Math.round(p.z * 2); if (seen.has(k)) continue; seen.add(k); m.decompose(new THREE.Vector3(), q, sc); list.push([p.x, p.z, sc.x, d2]); } });
    list.sort((a, b) => a[3] - b[3]); let n = 0;
    for (const [x, z, s] of list) { if (n >= MAX) break; const g = groundAt(x, z); if (!Number.isFinite(g)) continue; if (game.city?.isWater?.(x, z)) continue;
      const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1, rr = (1.05 + h * 0.6) * Math.min(1.6, Math.max(0.7, s));
      e.set(0, h * 6.283, 0); q.setFromEuler(e); sc.set(rr, 1, rr * (0.85 + h * 0.3)); out.compose(p.set(x, g + 0.025, z), q, sc); im.setMatrixAt(n++, out); }
    im.count = n; im.instanceMatrix.needsUpdate = true;
  }
  return { mesh: im, update(dt, cam) { t += dt || 0; if (!cam || t < 0.5) return; if (cam.position.distanceToSquared(last) < 64 && t < 5) return; t = 0; /* moved 8 m (at most twice a second), or every 5 s while plants stream in */ last.copy(cam.position); try { rebuild(cam); } catch (e2) { /* decals only */ } } };
}

// ELEVATED dev viewer: renders the elevated network (+ flat ground roads for context) around a point; camera from URL.
import * as THREE from 'three';
import { loadMiamiData } from '../../data.js';
import { createElevated } from '../../elevated.js';
const q = new URLSearchParams(location.search), num = (k, d) => (q.has(k) ? +q.get(k) : d);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa8c8e8); scene.fog = new THREE.Fog(0xa8c8e8, 400, 1600);
const cam = new THREE.PerspectiveCamera(num('fov', 55), innerWidth / innerHeight, 0.3, 4000);
scene.add(new THREE.HemisphereLight(0xdfefff, 0x6a6458, 1.1));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2); sun.position.set(200, 300, 120); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
const S = 260; Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 1200 }); scene.add(sun, sun.target);
window.__log = [];
(async () => {
  const data = await loadMiamiData(null);
  const t0 = performance.now(); const el = createElevated({ THREE, RAPIER: null, data }); window.__log.push('create ' + (performance.now() - t0).toFixed(0));
  window.__el = el;
  const cx = num('cx', num('tx', 0)), cz = num('cz', num('tz', 0)), R = num('r', 400);
  sun.position.set(cx + 200, 300, cz + 120); sun.target.position.set(cx, 0, cz);
  // ground + water
  const T = 8, N = Math.ceil(2 * R / T), gp = [], gc = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = cx - R + i * T, z = cz - R + j * T, w = data.isWater(x + T / 2, z + T / 2); const y = w ? -0.12 : 0, col = w ? [0.18, 0.42, 0.52] : [0.55, 0.58, 0.45];
    for (const [a, b] of [[0, 0], [0, T], [T, T], [0, 0], [T, T], [T, 0]]) { gp.push(x + a, y, z + b); gc.push(...col); } }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3)); gg.computeVertexNormals();
  const gm = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); gm.receiveShadow = true; scene.add(gm);
  // ground roads (not owned): flat ribbons
  const rp = []; for (const e of data.roadGraph.edges) { if (el.ownsEdge(e.id)) continue; const P = e.pts; let near = false; for (const p of P) if (Math.abs(p[0] - cx) < R && Math.abs(p[1] - cz) < R) { near = true; break; } if (!near) continue; const hw = e.width / 2;
    for (let i = 0; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * hw, nz = dx / l * hw;
      rp.push(ax - nx, 0.05, az - nz, bx + nx, 0.05, bz + nz, ax + nx, 0.05, az + nz, ax - nx, 0.05, az - nz, bx - nx, 0.05, bz - nz, bx + nx, 0.05, bz + nz); } }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.computeVertexNormals();
  const rm = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 })); rm.receiveShadow = true; scene.add(rm);
  // elevated tiles
  const TS = 200; let worst = 0;
  for (let i = Math.floor((cx - R) / TS); i <= Math.floor((cx + R) / TS); i++) for (let j = Math.floor((cz - R) / TS); j <= Math.floor((cz + R) / TS); j++) {
    const a = performance.now(); const r = el.buildTile(i, j, null, { colliders: false }); worst = Math.max(worst, performance.now() - a);
    scene.add(r.group);
    // lamp posts (the city renders these from r.lamps; simple stand-ins here)
    for (const l of r.lamps) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0x555a60 })); p.position.set(l.x, l.y + 4, l.z); scene.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.3), p.material); arm.position.set(l.x + Math.sin(l.ry) * 1.1, l.y + 7.9, l.z + Math.cos(l.ry) * 1.1); arm.rotation.y = l.ry; scene.add(arm); }
  }
  scene.traverse((o) => { if (o.isMesh && o.parent && o.parent.name.startsWith('elevated')) { o.castShadow = true; o.receiveShadow = true; } });
  window.__log.push('worst tile ' + worst.toFixed(0));
  window.__view = (ex, ey, ez, lx, ly, lz, fov) => { cam.position.set(ex, ey, ez); cam.lookAt(lx, ly, lz); if (fov) { cam.fov = fov; cam.updateProjectionMatrix(); } renderer.render(scene, cam); };
  window.__view(num('ex', cx + 60), num('ey', 40), num('ez', cz + 60), cx, num('ly', 5), cz);
  window.__ready = true;
})().catch((e) => { window.__err = String(e.stack || e); });

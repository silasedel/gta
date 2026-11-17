// Stage 1 job 4: regulatory signs from the road graph. US style (MUTCD look, original art):
//   STOP sign on every approach whose control is 'stop' (game.city.roadGraph edge.controlA / controlB);
//   SPEED LIMIT sign (mph) on the right side after junctions on roads at least 140 m long (both directions on two-way roads).
// Everything is instanced: posts, stop faces, sign backs and one face batch per speed value (about 12 draw calls for the
// whole map). Signs sit on the sidewalk edge, 2.1 m high, facing oncoming traffic. Signals get masts from the city tiles.
// game.regSigns = { stops, limits, list(x, z, r) }
import * as THREE from 'three';
export const order = 61;

const MPH = (kmh) => Math.max(15, Math.min(70, Math.round((kmh || 40) / 1.609 / 5) * 5));

function faceTexture(draw, w = 256, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; return t;
}
function octagon(x, cx, cy, r) { x.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } x.closePath(); }

export async function initV2(game) {
  const G = game.city?.roadGraph; if (!G?.edges?.length) return;
  const scene = game.scene;
  const gh = (x, z) => { const h = game.city.groundHeightAt?.(x, z); return Number.isFinite(h) ? h : 0; };
  const pointAt = (e, s) => {
    s = Math.max(0, Math.min(e.length, s)); const c = e.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++;
    const L = c[i] - c[i - 1] || 1, u = (s - c[i - 1]) / L, a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], dl = Math.hypot(dx, dz) || 1;
    return { x: a[0] + dx * u, z: a[1] + dz * u, dx: dx / dl, dz: dz / dl };
  };
  const stops = [], limits = new Map();
  const occupied = [];
  const free = (x, z) => { for (const o of occupied) if (Math.abs(o[0] - x) < 3 && Math.abs(o[1] - z) < 3) return false; occupied.push([x, z]); return true; };
  // place a sign for traffic travelling (dx, dz) at point p: right-hand curb, facing the driver
  const place = (p, dx, dz, w, list, extra) => {
    const side = w / 2 + 1.4, x = p.x - dz * side, z = p.z + dx * side;   // right of travel (x east, z south): (-dz, dx)
    if (game.city.isWater?.(x, z)) return;
    if (!free(x, z)) return;
    list.push({ x, z, y: gh(x, z), h: Math.atan2(-dx, -dz), ...extra });
  };
  for (const e of G.edges) {
    if (e.elevated || e.bridge || e.length < 8) continue;
    const w = e.width || 8;
    // stop signs: a few meters before the junction, on the approach's right side
    if (e.controlB === 'stop') { const d = Math.min(e.length - 1, (w * 0.5) + 6); const p = pointAt(e, e.length - d); place(p, p.dx, p.dz, w, stops); }
    if (e.controlA === 'stop' && !e.oneway) { const d = Math.min(e.length - 1, (w * 0.5) + 6); const p = pointAt(e, d); place(p, -p.dx, -p.dz, w, stops); }
    // speed limits: after the junction, both directions, on roads long enough to matter
    if (e.length >= 140 && !/track|service/.test(e.kind || '')) {
      const mph = MPH(e.speedKmh); if (!limits.has(mph)) limits.set(mph, []);
      const L = limits.get(mph);
      const p1 = pointAt(e, Math.min(30, e.length * 0.25)); place(p1, p1.dx, p1.dz, w, L, { mph });
      if (!e.oneway) { const p2 = pointAt(e, Math.max(e.length - 30, e.length * 0.75)); place(p2, -p2.dx, -p2.dz, w, L, { mph }); }
    }
  }
  // ---------------- meshes ----------------
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.45, metalness: 0.8 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x8c9297, roughness: 0.5, metalness: 0.6 });
  const stopTex = faceTexture((x, W, H) => {
    x.clearRect(0, 0, W, H); octagon(x, W / 2, H / 2, W * 0.49); x.fillStyle = '#ffffff'; x.fill();
    octagon(x, W / 2, H / 2, W * 0.455); x.fillStyle = '#b8161b'; x.fill();
    x.fillStyle = '#ffffff'; x.font = `bold ${Math.round(W * 0.27)}px Helvetica, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('STOP', W / 2, H / 2 + 4);
  });
  const stopMat = new THREE.MeshStandardMaterial({ map: stopTex, transparent: false, alphaTest: 0.5, roughness: 0.35, metalness: 0.1, side: THREE.FrontSide });
  const speedMat = (mph) => new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05, map: faceTexture((x, W, H) => {
    x.fillStyle = '#111'; x.fillRect(0, 0, W, H); x.fillStyle = '#f7f7f2'; x.fillRect(6, 6, W - 12, H - 12);
    x.strokeStyle = '#111'; x.lineWidth = 6; x.strokeRect(16, 16, W - 32, H - 32);
    x.fillStyle = '#111'; x.textAlign = 'center'; x.font = `bold ${Math.round(W * 0.13)}px Helvetica, Arial, sans-serif`;
    x.fillText('SPEED', W / 2, H * 0.24); x.fillText('LIMIT', W / 2, H * 0.4);
    x.font = `bold ${Math.round(W * 0.42)}px Helvetica, Arial, sans-serif`; x.fillText(String(mph), W / 2, H * 0.86);
  }, 256, 320) });
  const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6); postGeo.translate(0, 1.3, 0);
  const stopGeo = new THREE.PlaneGeometry(0.76, 0.76); stopGeo.translate(0, 2.25, 0.04);
  const stopBackGeo = new THREE.CircleGeometry(0.37, 8, Math.PI / 8); stopBackGeo.rotateY(Math.PI); stopBackGeo.translate(0, 2.25, 0.035);
  const limGeo = new THREE.PlaneGeometry(0.6, 0.75); limGeo.translate(0, 2.15, 0.04);
  const limBackGeo = new THREE.PlaneGeometry(0.6, 0.75); limBackGeo.rotateY(Math.PI); limBackGeo.translate(0, 2.15, 0.035);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  const inst = (geo, mat, arr, name, shadow = false) => {
    if (!arr.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, arr.length); m.name = name; m.castShadow = shadow; m.receiveShadow = true;
    arr.forEach((s, i) => { q.setFromAxisAngle(Y, s.h); m4.compose(pv.set(s.x, s.y, s.z), q, one); m.setMatrixAt(i, m4); });
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); scene.add(m); return m;
  };
  const allLim = [...limits.values()].flat();
  inst(postGeo, metal, [...stops, ...allLim], 'reg-sign-posts', true);
  inst(stopGeo, stopMat, stops, 'reg-stop-faces');
  inst(stopBackGeo, backMat, stops, 'reg-stop-backs');
  inst(limBackGeo, backMat, allLim, 'reg-limit-backs');
  for (const [mph, arr] of limits) inst(limGeo, speedMat(mph), arr, `reg-limit-${mph}`);
  game.regSigns = { stops: stops.length, limits: allLim.length, values: [...limits.keys()].sort((a, b) => a - b),
    list: (x, z, r = 60) => [...stops.map((s) => ({ ...s, kind: 'stop' })), ...allLim.map((s) => ({ ...s, kind: 'limit' }))].filter((s) => Math.hypot(s.x - x, s.z - z) < r) };
}

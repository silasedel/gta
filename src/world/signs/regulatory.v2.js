// Stage 1 job 4: regulatory signs from the road graph. US style (MUTCD look, original art):
//   STOP sign on every approach whose control is 'stop' (game.city.roadGraph edge.controlA / controlB);
//   SPEED LIMIT sign (mph) on the right side after junctions on roads at least 140 m long (both directions on two-way roads).
// Everything is instanced: posts, stop faces, sign backs and one face batch per speed value (about 12 draw calls for the
// whole map). Signs sit on the sidewalk edge, 2.1 m high, facing oncoming traffic. Signals get masts from the city tiles.
// game.regSigns = { stops, limits, list(x, z, r) }
import * as THREE from 'three';
import { sampleFrame, buildJunction } from '../miami/roadgeo.js';
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
  const stops = [], limits = new Map(), jc = new Map();
  const occupied = [];
  const free = (x, z) => { for (const o of occupied) if (Math.abs(o[0] - x) < 3 && Math.abs(o[1] - z) < 3) return false; occupied.push([x, z]); return true; };
  // place a sign for traffic travelling (dx, dz) at point p: right-hand curb, facing the driver
  const place = (p, dx, dz, w, list, extra, setback = 1.4) => {
    const side = w / 2 + setback, x = p.x - dz * side, z = p.z + dx * side;   // right of travel (x east, z south): (-dz, dx)
    if (game.city.isWater?.(x, z)) return;
    if (!free(x, z)) return;
    list.push({ x, z, y: gh(x, z), h: Math.atan2(-dx, -dz), ...extra });
  };
  for (const e of G.edges) {
    if (e.elevated || e.bridge || e.length < 8) continue;
    const w = e.width || 8;
    // stop signs: a few meters before the junction, on the approach's right side
    // (stage 1 job 5) at a job-4 junction: just behind the stop bar / crosswalk and its curb ramp, 0.6 m behind the curb face
    // (1.2 m off the edge of an open road), on the approach's right; elsewhere a few meters before the node
    const curbOff = (e.sidewalk || 0) > 0 ? 0.6 : 1.2;
    const atJunction = (nodeId) => { const n = G.nodes[nodeId]; if (!n || (n.edges || []).length < 3) return false; let J = jc.get(nodeId);
      if (J === undefined) { try { J = buildJunction(G, n, { swOf: (q) => q.sidewalk || 0 }); } catch (er) { J = null; } jc.set(nodeId, J); } // pure geometry (no tile-builder cache side effects)
      const L = J?.legs?.find((l) => l.edge === e); if (!L) return false;
      const s0 = L.D + (L.sw > 0 ? 6.0 : 2.4); if (s0 > L.len * 0.45) return false; // behind crosswalk (0.6 + 3.0) + stop bar (1.2 + 0.5)
      const q2 = sampleFrame(L.fr, s0), nl = Math.hypot(q2.nx, q2.nz) || 1, o = L.hw + curbOff; // inbound right = frame side -1
      const x = q2.x - q2.nx / nl * o, z = q2.z - q2.nz / nl * o; if (game.city.isWater?.(x, z) || !free(x, z)) return true;
      stops.push({ x, z, y: gh(x, z), h: Math.atan2(L.dx, L.dz) }); return true; };
    if (e.controlB === 'stop' && !atJunction(e.b)) { const d = Math.min(e.length - 1, (w * 0.5) + 6); const p = pointAt(e, e.length - d); place(p, p.dx, p.dz, w, stops, undefined, curbOff + 0.2); }
    if (e.controlA === 'stop' && !e.oneway && !atJunction(e.a)) { const d = Math.min(e.length - 1, (w * 0.5) + 6); const p = pointAt(e, d); place(p, -p.dx, -p.dz, w, stops, undefined, curbOff + 0.2); }
    // speed limits: after the junction, both directions, on roads long enough to matter
    if (e.length >= 140 && !/track|service/.test(e.kind || '')) {
      const mph = MPH(e.speedKmh); if (!limits.has(mph)) limits.set(mph, []);
      const L = limits.get(mph);
      const p1 = pointAt(e, Math.min(30, e.length * 0.25)); place(p1, p1.dx, p1.dz, w, L, { mph }, curbOff);
      if (!e.oneway) { const p2 = pointAt(e, Math.max(e.length - 30, e.length * 0.75)); place(p2, -p2.dx, -p2.dz, w, L, { mph }, curbOff); }
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
  const K = game.city.streetKit;
  if (K?.signs?.stop && K.signs.post) { // stage 1 job 5: the user's library sign set (worn US plates on a perforated U-channel post)
    const instS = (part, arr, name, y, fwd, scl) => { if (!arr.length || !part) return; const m = new THREE.InstancedMesh(part.geometry, part.material, arr.length); m.name = name; m.castShadow = true; m.receiveShadow = true;
      arr.forEach((s, i) => { q.setFromAxisAngle(Y, s.h); m4.compose(pv.set(s.x + Math.sin(s.h) * fwd, s.y - 0.12 + y, s.z + Math.cos(s.h) * fwd), q, scl || one); m.setMatrixAt(i, m4); }); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); scene.add(m); return m; };
    instS(K.signs.post, [...stops, ...allLim], 'reg-sign-posts', 0, 0, new THREE.Vector3(2.4, 2.9, 2.4));
    instS(K.signs.stop, stops, 'reg-stop', 2.45, 0.045);
    for (const [mph, arr] of limits) { const pl = K.speedPlate(mph); if (pl) instS(pl, arr, `reg-limit-${mph}`, 2.3, 0.04); }
  } else {
  inst(postGeo, metal, [...stops, ...allLim], 'reg-sign-posts', true);
  inst(stopGeo, stopMat, stops, 'reg-stop-faces');
  inst(stopBackGeo, backMat, stops, 'reg-stop-backs');
  inst(limBackGeo, backMat, allLim, 'reg-limit-backs');
  for (const [mph, arr] of limits) inst(limGeo, speedMat(mph), arr, `reg-limit-${mph}`);
  }
  game.regSigns = { stops: stops.length, limits: allLim.length, values: [...limits.keys()].sort((a, b) => a - b),
    list: (x, z, r = 60) => [...stops.map((s) => ({ ...s, kind: 'stop' })), ...allLim.map((s) => ({ ...s, kind: 'limit' }))].filter((s) => Math.hypot(s.x - x, s.z - z) < r) };
}

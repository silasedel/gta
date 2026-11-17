// SOUTHLINE METRO (r2-metro): one subway line with 4 stations you can ride.
//   Airport (Terminal Dr) - Little Havana - Downtown - South Beach.
// Street: the user's subway stair head (Street Props Pack 2, re-signed SOUTHLINE) on the sidewalk beside the nearest road;
//   the stairwell is shown through a depth portal (no terrain carving). Map blips through game.mapBlips (r2-mapui hook).
// Station: one shared kit (the user's "Subway 3" platform strip) used as a separate interior space high above the
//   entrance (no terrain under it, nothing tall up there), lit by a small vertex-light bake (MeshBasic, so the sun and
//   time of day never reach it), with SOUTHLINE signs, the station name, a line map and a few waiting people.
// Train: the user's "Train 2" car, mirrored into 24 m cars, 3 coupled, Southline livery stripes added here.
// Ride: E at the train -> destination list (1-4) -> fare ($2.75, cash or card) -> inside the car; the train runs the real
//   distance between the stations at 80 km/h with 1.2 m/s^2 accel / brake. The long middle is cut with two short fades,
//   the visible motion is always at the real speed. C toggles inside / outside view, hold E skips to the arrival.
//   The whole space is oriented along the real bearing between the stations, so the map follows the ride.
// Exit: E at the EXIT sign -> fade -> out of the destination's stair head once the streamer has the area.
// Flag: on by default; ?metro=0 disables. Wanted 2+ stars: no boarding.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const order = 175;
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
const URL_OF = (n) => BASE + 'assets/metro/' + n + '.glb';
// line order; x, z = the district spot the entrance is placed near (beside the nearest road)
export const METRO_STATIONS = [
  { id: 'airport', name: 'Airport', sub: 'Terminal Dr', x: -650, z: 1230, flip: true },
  { id: 'havana', name: 'Little Havana', sub: 'NW 10th Ave', x: -655, z: -55 },
  { id: 'downtown', name: 'Downtown', sub: 'NE 1st St', x: 410, z: -100, flip: true },
  { id: 'sobe', name: 'South Beach', sub: '8th St', x: 2400, z: 605, flip: true },
];
const ALT = 1400;               // the station / tunnel space floats this high above the entrance
const FARE = 2.75;
const VMAX = 80 / 3.6, ACC = 1.2;
const PLAT_Y = 0.837, TRACK_Z = -0.25, CAR_L = 24.2, CAR_Y = 0.95, SEG = 12;
const EXIT_LOCAL = new THREE.Vector3(-24, PLAT_Y, 14.6);   // EXIT sign spot on the back wall (station frame)
const SPAWN_LOCAL = new THREE.Vector3(-21.5, PLAT_Y, 11.8);
const COL = { cream: '#fff4e3', coral: '#ff6b5a', pink: '#ff5fa8', gold: '#ffd27a', ink: '#18122a' };

function flagOn() {
  try { const q = new URLSearchParams(location.search); if (q.has('metro')) return q.get('metro') !== '0'; } catch (e) { /* */ }
  return false;   // r2-metro: off until it has booted clean (then true)
}

// ---------------------------------------------------------------- 2D art (canvas): roundel, signs, line map, livery
function roundelCanvas(px = 256) {
  const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'), r = px / 2;
  g.save(); g.beginPath(); g.arc(r, r, r * 0.84, 0, Math.PI * 2); g.clip();
  const gr = g.createLinearGradient(0, 0, 0, px); gr.addColorStop(0, COL.gold); gr.addColorStop(0.5, COL.coral); gr.addColorStop(1, COL.pink);
  g.fillStyle = gr; g.fillRect(0, 0, px, px); g.fillStyle = COL.ink;
  for (const [y0, h] of [[0.6, 0.035], [0.7, 0.05], [0.81, 0.065]]) g.fillRect(0, px * y0, px, px * h);
  g.restore();
  g.lineWidth = px * 0.05; g.strokeStyle = COL.ink; g.beginPath(); g.arc(r, r, r * 0.9, 0, Math.PI * 2); g.stroke();
  g.lineWidth = px * 0.03; g.strokeStyle = COL.cream; g.beginPath(); g.arc(r, r, r * 0.97, 0, Math.PI * 2); g.stroke();
  g.fillStyle = COL.cream; g.font = `900 ${Math.round(px * 0.62)}px "Archivo Black", "DIN Alternate", "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('S', r, r * 1.04);
  return c;
}
let ROUNDEL = null;
const roundel = () => (ROUNDEL ||= roundelCanvas(256));
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

function drawNameSign(g, w, h, name, sub) {
  g.fillStyle = '#16131f'; g.fillRect(0, 0, w, h);
  g.fillStyle = COL.coral; g.fillRect(0, h - h * 0.08, w, h * 0.08);
  g.drawImage(roundel(), h * 0.1, h * 0.1, h * 0.72, h * 0.72);
  g.fillStyle = COL.cream; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = `800 ${Math.round(h * 0.44)}px "Archivo Black", "DIN Alternate", "Helvetica Neue", Arial, sans-serif`;
  g.fillText(name.toUpperCase(), h * 0.95, h * 0.4);
  g.fillStyle = 'rgba(255,244,227,0.6)'; g.font = `600 ${Math.round(h * 0.16)}px "Helvetica Neue", Arial, sans-serif`;
  g.fillText(sub ? `SOUTHLINE  ·  ${sub}` : 'SOUTHLINE', h * 0.97, h * 0.74);
}
function drawLineMap(g, w, h, here) {
  g.fillStyle = '#f1ece2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#16131f'; g.fillRect(0, 0, w, h * 0.2);
  g.drawImage(roundel(), h * 0.03, h * 0.025, h * 0.15, h * 0.15);
  g.fillStyle = COL.cream; g.textBaseline = 'middle'; g.font = `800 ${Math.round(h * 0.09)}px "Archivo Black", "Helvetica Neue", Arial, sans-serif`;
  g.fillText('SOUTHLINE METRO', h * 0.22, h * 0.1);
  const x0 = w * 0.1, x1 = w * 0.9, y = h * 0.55;
  const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, COL.gold); gr.addColorStop(0.5, COL.coral); gr.addColorStop(1, COL.pink);
  g.strokeStyle = gr; g.lineWidth = h * 0.06; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  METRO_STATIONS.forEach((s, i) => {
    const x = x0 + (x1 - x0) * i / (METRO_STATIONS.length - 1), me = i === here;
    g.fillStyle = '#fff'; g.strokeStyle = '#16131f'; g.lineWidth = h * 0.018;
    g.beginPath(); g.arc(x, y, h * (me ? 0.06 : 0.042), 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#16131f'; g.textAlign = 'center'; g.font = `${me ? 800 : 600} ${Math.round(h * 0.075)}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(s.name, x, y + (i % 2 ? -h * 0.15 : h * 0.15));
    if (me) { g.fillStyle = COL.coral; g.font = `700 ${Math.round(h * 0.055)}px "Helvetica Neue", Arial, sans-serif`; g.fillText('YOU ARE HERE', x, y + (i % 2 ? h * 0.15 : -h * 0.15)); }
  });
}
function drawExit(g, w, h) {
  g.fillStyle = '#0f3d2a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e9fff2'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.font = `800 ${Math.round(h * 0.5)}px "Helvetica Neue", Arial, sans-serif`; g.fillText('EXIT  ↑  STREET', w / 2, h * 0.52);
}
function drawLivery(g, w, h) {
  g.clearRect(0, 0, w, h);
  const bands = [[0.0, 0.24, COL.gold], [0.3, 0.26, COL.coral], [0.62, 0.38, COL.pink]];
  for (const [y, hh, c] of bands) { g.fillStyle = c; g.fillRect(0, y * h, w, hh * h); }
  g.fillStyle = 'rgba(24,18,42,0.0)';
}
function drawCarName(g, w, h) {
  g.clearRect(0, 0, w, h); g.drawImage(roundel(), 0, 0, h, h);
  g.fillStyle = COL.cream; g.textBaseline = 'middle'; g.font = `800 ${Math.round(h * 0.62)}px "Archivo Black", "Helvetica Neue", Arial, sans-serif`;
  g.fillText('SOUTHLINE', h * 1.15, h * 0.54);
}
function canvasPlane(w, h, px, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * h / w); const g = c.getContext('2d'); draw(g, c.width, c.height);
  const t = tex(c);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: !!o.transparent, fog: false, toneMapped: o.toneMapped ?? true, color: o.color ?? 0xffffff, side: o.side ?? THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.userData.redraw = (fn) => { fn(g, c.width, c.height); t.needsUpdate = true; };
  return mesh;
}

// ---------------------------------------------------------------- lighting bake (vertex light, unlit materials)
function bakeMesh(mesh, lightAt) {
  const g = mesh.geometry; if (!g?.attributes?.position) return;
  if (!g.attributes.normal) g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal, n = P.count, col = new Float32Array(n * 3);
  const p = new THREE.Vector3(), nn = new THREE.Vector3(), out = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(P, i); if (N) nn.fromBufferAttribute(N, i); else nn.set(0, 1, 0);
    lightAt(p, nn, out); col[i * 3] = out[0]; col[i * 3 + 1] = out[1]; col[i * 3 + 2] = out[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
function unlit(m, o = {}) {
  const b = new THREE.MeshBasicMaterial({ map: m.map || null, color: m.color ? m.color.clone() : 0xffffff, vertexColors: true, fog: false,
    transparent: !!(m.transparent || o.glass), opacity: o.glass ? 0.22 : m.opacity ?? 1, alphaTest: m.alphaTest || 0, side: m.side ?? THREE.FrontSide, depthWrite: !o.glass });
  if (o.tint) b.color.multiply(new THREE.Color(o.tint));
  b.name = m.name; return b;
}
function stationLight(p, n, out) {
  // ceiling panels in rows above the platform and the track; warm-neutral fluorescent
  let L = 0.3 + 0.08 * Math.max(0, n.y);
  const x0 = Math.round(p.x / 7) * 7;
  for (const zl of [-0.5, 4.5, 9.5, 14]) for (let k = -3; k <= 3; k++) {
    const lx = x0 + k * 7; if (Math.abs(lx) > 75) continue;
    const dx = lx - p.x, dy = 5.4 - p.y, dz = zl - p.z, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1;
    const lam = Math.max(0, (dx * n.x + dy * n.y + dz * n.z) / d) * 0.75 + 0.25;
    L += 3.2 * lam / (d2 + 6);
  }
  if (Math.abs(p.x) > 80) L *= Math.max(0.12, 1 - (Math.abs(p.x) - 80) / 40);   // tunnel mouths fall off to dark
  L = Math.min(1.35, L);
  out[0] = L * 1.0; out[1] = L * 0.98; out[2] = L * 0.93;
}
function carLight(p, n, out) {
  // model space: across x (+-2.05), up y (0..2.9), along z (+-12.1). Inside: ceiling strips; outside: soft hall light
  const inside = Math.abs(p.x) < 1.98 && p.y > -0.05 && p.y < 2.85;
  let L = inside ? 0.55 + 0.42 * Math.max(0, n.y) + 0.22 * Math.max(0, -n.y) * 0 + 0.18 * (1 - Math.abs(p.x) / 2) : 0.42 + 0.25 * Math.max(0, n.y) + 0.1 * Math.max(0, p.y / 3);
  L = Math.min(1.2, L); out[0] = L; out[1] = L * 0.99; out[2] = L * 0.96;
}

// ---------------------------------------------------------------- main
export async function initV2(game) {
  if (!flagOn()) return;
  const { scene, world, RAPIER } = game;
  const city = game.city; if (!city || !THREE) return;
  const loader = new GLTFLoader();
  const load = (n) => new Promise((res) => loader.load(URL_OF(n), (g) => res(g.scene), undefined, (e) => { console.warn('[metro] load failed', n, e); res(null); }));
  const S = { stations: [], kit: null, kitP: null, mode: 'street', busy: false, here: -1, dest: -1, view: 'in', menu: false };
  game.metro = S;

  // ---- entrance placement: beside the nearest road, stair head facing along the street
  const rg = city.roadGraph || city.data?.roadGraph;
  for (const st of METRO_STATIONS) {
    let px = st.x, pz = st.z, dx = 1, dz = 0, hw = 6;
    try { const r = rg?.nearestEdge?.(st.x, st.z, null, 300); if (r) { px = r.point.x; pz = r.point.z; dx = r.dir.x; dz = r.dir.z; hw = r.edge.width / 2; } } catch (e) { /* */ }
    // sidewalk side = the side of the district spot (stores), 3.2 m beyond the curb
    // flip: the open side of the street (park / grass / beach) instead of the store side
    let nx = -dz, nz = dx; if (((st.x - px) * nx + (st.z - pz) * nz < 0) !== !!st.flip) { nx = -nx; nz = -nz; }
    const off = hw + (st.off ?? 2.9), x = px + nx * off, z = pz + nz * off;
    const yaw = Math.atan2(dx, dz);   // kiosk local +z (stair head) along the road
    S.stations.push({ ...st, kx: x, kz: z, yaw, nx, nz, root: null, gy: 0 });
  }
  const local2world = (s, lx, lz) => { const c = Math.cos(s.yaw), sn = Math.sin(s.yaw); return { x: s.kx + lx * c + lz * sn, z: s.kz - lx * sn + lz * c }; };
  const landing = (s) => local2world(s, 0, 4.9);

  // ---- map blips (minimap + pause map)
  const blipImg = roundel();
  const blips = S.stations.map((s) => ({ x: s.kx, z: s.kz, kind: 'metro', label: 'Southline: ' + s.name, prio: 84,
    draw(g, x, y, k = 1) { const r = 8 * k; g.drawImage(blipImg, x - r, y - r, r * 2, r * 2); } }));
  game.mapBlips = (game.mapBlips || []).concat(blips);

  // ---- street kiosks (loaded in the background; placed when the ground there is known)
  const holeMat = new THREE.ShaderMaterial({
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); gl_FragDepth = 0.999999; }',
    colorWrite: false, depthWrite: true, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  load('entrance').then((ent) => {
    if (!ent) return;
    ent.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.renderOrder = 11; const m = o.material; if (m && /Glass/i.test(m.name || '')) { m.transparent = true; m.opacity = 0.35; m.depthWrite = false; } } });
    S.kioskProto = ent;
  });
  function placeKiosk(s) {
    if (s.root || !S.kioskProto) return;
    const gy = city.groundHeightAt?.(s.kx, s.kz); if (!Number.isFinite(gy) || !city.collidersReadyAt?.(s.kx, s.kz)) return;
    s.gy = gy;
    const root = new THREE.Group(); root.name = 'metro-kiosk-' + s.id; root.position.set(s.kx, gy + 0.02, s.kz); root.rotation.y = s.yaw;
    root.add(S.kioskProto.clone(true));
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 5.8).rotateX(-Math.PI / 2), holeMat); hole.position.set(0, 0.03, -0.3); hole.renderOrder = 10; hole.frustumCulled = false; root.add(hole);
    // totem: roundel + station name, at the stair head
    const tot = new THREE.Group(); tot.position.set(2.0, 0, 4.6); root.add(tot);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.1, 10), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.45, metalness: 0.8 })); pole.position.y = 1.55; tot.add(pole);
    const disc = canvasPlane(0.9, 0.9, 256, (g, w, h) => g.drawImage(roundel(), 0, 0, w, h), { transparent: true, side: THREE.DoubleSide }); disc.position.y = 3.25; tot.add(disc);
    const nm = canvasPlane(1.9, 0.48, 512, (g, w, h) => drawNameSign(g, w, h, s.name, s.sub), { side: THREE.DoubleSide }); nm.position.set(0, 2.45, 0); tot.add(nm);
    disc.material.toneMapped = false; disc.material.color.setScalar(0.9);
    scene.add(root); s.root = root;
    // colliders: two balustrades, rear parapet, and a bar across the stair top (the stairwell is not walkable)
    try {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.kx, gy, s.kz).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
      for (const [x, y, z, hx, hy, hz] of [[1.95, 0.6, -0.4, 0.32, 0.6, 3.55], [-1.95, 0.6, -0.4, 0.32, 0.6, 3.55], [0, 0.6, -3.6, 2.27, 0.6, 0.35], [0, 0.6, 2.35, 1.7, 0.6, 0.15]]) world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z), body);
      s.body = body;
    } catch (e) { console.warn('[metro] kiosk colliders', e); }
  }

  // ---- veil (fades) and the destination menu
  const css = document.createElement('style');
  css.textContent = `#metro-veil{position:fixed;inset:0;background:#07060b;opacity:0;pointer-events:none;transition:opacity .5s ease;z-index:60;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;font:600 13px/1.2 "Helvetica Neue",Arial,sans-serif;color:#fff4e3;letter-spacing:.18em}
#metro-veil.on{opacity:1}#metro-veil img{width:54px;height:54px}
#metro-menu{position:fixed;left:50%;bottom:16%;transform:translateX(-50%);z-index:59;min-width:300px;max-width:calc(100vw - 32px);background:rgba(16,13,24,.92);border:1px solid rgba(255,244,227,.14);border-radius:10px;padding:14px 16px;color:#fff4e3;font:500 14px/1.35 "Helvetica Neue",Arial,sans-serif;display:none;box-shadow:0 12px 40px rgba(0,0,0,.45)}
#metro-menu.on{display:block}#metro-menu h3{display:flex;align-items:center;gap:10px;margin:0 0 10px;font:800 15px/1 "Archivo Black","Helvetica Neue",Arial,sans-serif;letter-spacing:.06em}#metro-menu h3 img{width:26px;height:26px}
#metro-menu .r{display:flex;justify-content:space-between;gap:18px;padding:7px 8px;border-radius:6px;cursor:pointer}#metro-menu .r:hover{background:rgba(255,107,90,.16)}#metro-menu .r.here{opacity:.4;cursor:default}
#metro-menu kbd{display:inline-block;min-width:18px;text-align:center;margin-right:8px;padding:1px 5px;border-radius:4px;background:rgba(255,244,227,.12);font:700 12px/1.4 "Helvetica Neue",Arial,sans-serif}
#metro-menu .f{margin-top:8px;font-size:12px;color:rgba(255,244,227,.6)}`;
  document.head.appendChild(css);
  const veil = document.createElement('div'); veil.id = 'metro-veil'; const logoURL = roundel().toDataURL();
  veil.innerHTML = `<img src="${logoURL}" alt=""><div>SOUTHLINE</div><div id="metro-veil-sub" style="opacity:.6;letter-spacing:.08em;font-weight:500"></div>`; document.body.appendChild(veil);
  const menu = document.createElement('div'); menu.id = 'metro-menu'; document.body.appendChild(menu);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fade = async (on, sub = '') => { veil.querySelector('#metro-veil-sub').textContent = sub; veil.classList.toggle('on', on); await sleep(520); };
  const notify = (t, ms = 2600) => { try { game.hud?.notify?.(t, ms); } catch (e) { /* */ } };
  const help = (t) => { try { game.hud?.help?.(t); } catch (e) { /* */ } };

  // ---- the metro space (station kit + train + tunnel) under one root, built on first use
  const root = new THREE.Group(); root.name = 'metro-space'; root.visible = false; scene.add(root);
  let kitReady = null;
  function buildKit() {
    if (kitReady) return kitReady;
    kitReady = (async () => {
      const [st, tr] = await Promise.all([load('station'), load('train')]);
      if (!st || !tr) throw new Error('metro models missing');
      // station: unlit + baked light
      let concrete = null;
      st.traverse((o) => { if (!o.isMesh) return; bakeMesh(o, stationLight); const m = o.material; if (/Lambert4|Lambert6/.test(m?.name || '') && m.map && !concrete) concrete = m.map; o.material = unlit(m); o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; });
      const station = new THREE.Group(); station.name = 'metro-station'; station.add(st); root.add(station);
      // the strip's tunnel mouths (|x| 72..106) are open on the platform side: close them with concrete walls
      { const fm = new THREE.MeshBasicMaterial({ map: concrete || null, color: concrete ? 0x4e4e4e : 0x2e2e30 });
        for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(36, 6.4, 0.3), fm); w.position.set(sx * 89.5, 2.6, 2.05); station.add(w);
          const r = new THREE.Mesh(new THREE.BoxGeometry(36, 0.3, 2.4), new THREE.MeshBasicMaterial({ color: 0x1c1c1e })); r.position.set(sx * 89.5, 5.75, 1.0); station.add(r); } }
      // signs: station name on the track wall every 24 m, line map + EXIT on the back wall
      const names = [];
      for (let x = -60; x <= 60; x += 24) { const n = canvasPlane(5.2, 1.3, 1024, (g, w, h) => drawNameSign(g, w, h, 'Station', '')); n.position.set(x, 3.0, -3.6); station.add(n); names.push(n); }
      for (let x = -48; x <= 48; x += 32) { const n = canvasPlane(3.2, 0.8, 768, (g, w, h) => drawNameSign(g, w, h, 'Station', '')); n.position.set(x, 3.1, 16.08); n.rotation.y = Math.PI; station.add(n); names.push(n); }
      const map = canvasPlane(3.6, 1.6, 1024, (g, w, h) => drawLineMap(g, w, h, 0)); map.position.set(-16, 1.9, 16.08); map.rotation.y = Math.PI; station.add(map);
      const exit = canvasPlane(2.4, 0.5, 512, drawExit, { toneMapped: false }); exit.position.set(EXIT_LOCAL.x, 2.9, 16.08); exit.rotation.y = Math.PI; exit.material.color.setScalar(0.85); station.add(exit);
      // benches (simple: steel + wood slats) along the platform
      const benchG = new THREE.Group(); const steel = new THREE.MeshBasicMaterial({ color: 0x3a3c40 }), wood = new THREE.MeshBasicMaterial({ color: 0x8a5a36 });
      for (const x of [-44, -8, 20, 50]) { const b = new THREE.Group(); b.position.set(x, PLAT_Y, 8.5);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.07, 0.5), wood); seat.position.y = 0.46; b.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.42, 0.06), wood); back.position.set(0, 0.75, 0.24); b.add(back);
        for (const lx of [-1.4, 1.4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.46), steel); leg.position.set(lx, 0.23, 0); b.add(leg); }
        benchG.add(b); }
      station.add(benchG);
      S.relabel = (i) => { const s = S.stations[i]; for (const n of names) n.userData.redraw((g, w, h) => drawNameSign(g, w, h, s.name, s.sub)); map.userData.redraw((g, w, h) => drawLineMap(g, w, h, i)); };
      S.benchSpots = [-44, -8, 20, 50].map((x) => new THREE.Vector3(x, PLAT_Y, 8.4));
      // train: 3 cars, unlit + baked, livery stripes, head / tail lights
      const carProto = new THREE.Group(); const doors = [];
      tr.traverse((o) => { if (!o.isMesh) return; bakeMesh(o, carLight); const nm = o.material?.name || '';
        if (/^Lights/.test(nm)) { o.material = new THREE.MeshBasicMaterial({ color: 0xfff6e8, toneMapped: false }); }
        else o.material = unlit(o.material, { glass: /Glass/.test(nm), tint: /^Bars/.test(nm) ? 0x9a9a9a : /^Walls|^Roof/.test(nm) ? 0xd8d8d8 : null });
        if (!o.material.name && o.name === 'm__none') o.material.color.set(0x8d9298);
        o.frustumCulled = false; });
      carProto.add(tr);
      const liv = (side) => { const p = canvasPlane(22.6, 0.34, 1024, drawLivery, { transparent: true }); p.position.set(2.06 * side, 0.78, 0); p.rotation.y = side * Math.PI / 2; return p; };
      carProto.add(liv(1), liv(-1));
      for (const side of [1, -1]) for (const z of [-8.5, 8.5]) { const n = canvasPlane(2.6, 0.3, 512, drawCarName, { transparent: true }); n.position.set(2.065 * side, 2.72, z); n.rotation.y = side * Math.PI / 2; carProto.add(n); }
      const train = new THREE.Group(); train.name = 'metro-train';
      for (let k = 0; k < 3; k++) {
        const car = carProto.clone(true); car.rotation.y = Math.PI / 2; car.position.set((k - 1) * (CAR_L + 0.25), 0, 0); train.add(car);
        car.traverse((o) => { if (o.isMesh && o.name === 'm__none') doors.push(o); });
      }
      // head / tail light glows
      const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return tex(c); })();
      const glow = (color, size, op) => { const m = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }); const sp = new THREE.Sprite(m); sp.scale.setScalar(size); return sp; };
      const front = 1.5 * CAR_L + 0.35;
      for (const z of [-1.1, 1.1]) { const h = glow(0xfff1d6, 1.4, 0.95); h.position.set(front, 0.55, z); train.add(h); const t = glow(0xff2a1e, 0.6, 0.8); t.position.set(-front, 0.55, z); train.add(t); }
      const beam = glow(0xfff1d6, 7, 0.35); beam.position.set(front + 3, 1.0, 0); train.add(beam);
      train.position.set(-9999, CAR_Y, TRACK_Z); root.add(train);
      // tunnel: recycled 12 m segments (concrete box, rails, sleepers, a wall lamp each)
      const tunnel = new THREE.Group(); tunnel.name = 'metro-tunnel'; root.add(tunnel);
      const segG = new THREE.Group();
      const cMat = new THREE.MeshBasicMaterial({ map: concrete || null, color: concrete ? 0x6a6a6a : 0x3d3d3f, side: THREE.DoubleSide });
      if (concrete) { concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping; }
      const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); segG.add(b); return b; };
      box(SEG, 0.1, 8, cMat, 0, -0.3, -0.2);                 // floor
      box(SEG, 6, 0.1, cMat, 0, 2.7, -3.75);                 // walls
      box(SEG, 6, 0.1, cMat, 0, 2.7, 3.35);
      box(SEG, 0.1, 8, new THREE.MeshBasicMaterial({ color: 0x1c1c1e }), 0, 5.6, -0.2);   // roof
      const railM = new THREE.MeshBasicMaterial({ color: 0x8a8580 }), sleeperM = new THREE.MeshBasicMaterial({ color: 0x4a4440 }), cableM = new THREE.MeshBasicMaterial({ color: 0x141414 });
      box(SEG, 0.15, 0.08, railM, 0, 0.15, -0.95); box(SEG, 0.15, 0.08, railM, 0, 0.15, 0.55);
      for (let i = 0; i < 6; i++) box(0.25, 0.14, 2.6, sleeperM, -SEG / 2 + 1 + i * 2, -0.18, -0.2);
      box(SEG, 0.08, 0.08, cableM, 0, 3.6, -3.65); box(SEG, 0.06, 0.06, cableM, 0, 3.45, -3.65); box(SEG, 0.08, 0.08, cableM, 0, 3.6, 3.25);
      const lampM = new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false }); box(0.9, 0.14, 0.12, lampM, 0, 3.2, -3.62); box(0.9, 0.14, 0.12, lampM, 6, 3.2, 3.22);
      const segs = [];
      for (let i = 0; i < 48; i++) { const sgm = segG.clone(true); const g1 = glow(0xffe2b0, 2.2, 0.55); g1.position.set(0, 3.2, -3.45); sgm.add(g1); const g2 = glow(0xffe2b0, 2.2, 0.55); g2.position.set(6, 3.2, 3.05); sgm.add(g2); tunnel.add(sgm); segs.push(sgm); }
      const capM = new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.DoubleSide });
      const caps = [0, 1].map(() => { const c = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), capM); c.rotation.y = Math.PI / 2; c.position.set(0, 2.6, -0.2); tunnel.add(c); return c; });
      S.kit = { station, train, tunnel, segs, doors, caps };
      return S.kit;
    })().catch((e) => { console.warn('[metro] kit failed', e); kitReady = null; return null; });
    return kitReady;
  }

  // ---- placement of the space: origin above station i's entrance, local +x along the bearing to `toward`
  function orient(i, toward) {
    const a = S.stations[i], b = S.stations[toward];
    const dx = b.kx - a.kx, dz = b.kz - a.kz;
    root.position.set(a.kx, (a.gy || 0) + ALT, a.kz);
    root.rotation.set(0, Math.atan2(-dz, dx), 0); root.updateMatrixWorld(true);
  }
  const W = new THREE.Vector3();
  const toWorld = (x, y, z) => W.set(x, y, z).applyMatrix4(root.matrixWorld);
  // platform colliders (fixed body following the space)
  let platBody = null;
  function platformColliders(on, stationX = 0) {
    if (platBody) { try { world.removeRigidBody(platBody); } catch (e) { /* */ } platBody = null; }
    if (!on) return;
    const q = root.quaternion, p = toWorld(stationX, 0, 0);
    platBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    for (const [x, y, z, hx, hy, hz] of [
      [0, PLAT_Y - 0.5, 9.0, 72, 0.5, 7.16],     // platform deck
      [0, PLAT_Y + 1.2, 1.7, 72, 1.2, 0.15],      // platform edge (boarding is by E, never by walking onto the track)
      [0, PLAT_Y + 1.5, 16.4, 72, 1.5, 0.25],     // back wall
      [-72.3, PLAT_Y + 1.5, 9, 0.3, 1.5, 7.5], [72.3, PLAT_Y + 1.5, 9, 0.3, 1.5, 7.5]]) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.8), platBody);
    }
  }

  // ---- waiting people (the user's peds, posed like venue guests)
  let waiting = [];
  function spawnPeople(stationX) {
    releasePeople(); const peds = game.peds; if (!peds?.spawnAt) return;
    const spots = [[S.benchSpots[0], 'bench'], [S.benchSpots[2], 'bench'], [new THREE.Vector3(-30, PLAT_Y, 4.2), 'idle'], [new THREE.Vector3(6, PLAT_Y, 3.8), 'idle'], [new THREE.Vector3(34, PLAT_Y, 5.0), 'idle'], [new THREE.Vector3(-12, PLAT_Y, 6.0), 'idle']];
    for (const [sp, state] of spots) {
      try {
        const w = toWorld(sp.x + stationX + (state === 'bench' ? (Math.random() - 0.5) * 1.6 : 0), sp.y, sp.z).clone();
        const p = peds.spawnAt(w, { outfit: 'casual' }); if (!p) continue;
        const heading = root.rotation.y + Math.PI + (state === 'bench' ? 0 : (Math.random() - 0.5) * 0.8);   // face the track
        p.pinned = 1e9; p.v21 = { venue: 'metro' }; p.nav = null; p.group = null; p.target = null; p.state = state === 'bench' ? 'bench' : 'talk'; p.act = p.state; p.stateT = 1e9;
        p.heading = heading; p.idleStyle = state === 'bench' ? 'sitBench' : (Math.random() < 0.5 ? 'talk' : null); p.pos.copy(w); p.groundY = w.y;
        if (p.root) { p.root.position.copy(p.pos); p.root.rotation.y = heading; }
        waiting.push(p);
      } catch (e) { console.warn('[metro] ped', e); }
    }
  }
  function releasePeople() { for (const p of waiting) { if (!p.active) continue; p.pinned = 0; p.v21 = null; p.despawnNow = true; } waiting = []; }

  // ---- sound (WebAudio, through the ambience bus so master volume / mute apply)
  const snd = { rumble: null };
  function audioOut() { const A = game.audio; const ctx = A?.ctx; if (!ctx || A.muted) return null; return { ctx, out: A.ambienceBus || ctx.destination }; }
  function chime() { const a = audioOut(); if (!a) return; const { ctx, out } = a; const t = ctx.currentTime;
    for (const [f, d] of [[784, 0], [622, 0.38]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.22, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + d + 1.2); o.connect(g).connect(out); o.start(t + d); o.stop(t + d + 1.3); } }
  function rumbleStart() { const a = audioOut(); if (!a || snd.rumble) return; const { ctx, out } = a;
    const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = l * 0.98 + (Math.random() * 2 - 1) * 0.02; d[i] = l * 6; }
    n.buffer = buf; n.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; const g = ctx.createGain(); g.gain.value = 0;
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 40; og.gain.value = 0; const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 900;
    n.connect(f).connect(g).connect(out); o.connect(of).connect(og).connect(out); n.start(); o.start(); snd.rumble = { n, o, g, og, f, ctx }; }
  function rumbleSet(v, near = 1) { const r = snd.rumble; if (!r) return; const k = Math.min(1, v / VMAX); r.g.gain.setTargetAtTime((0.05 + 0.5 * k) * near, r.ctx.currentTime, 0.2); r.f.frequency.setTargetAtTime(160 + 380 * k, r.ctx.currentTime, 0.2); r.o.frequency.setTargetAtTime(30 + 70 * k, r.ctx.currentTime, 0.2); r.og.gain.setTargetAtTime(0.025 * k * near, r.ctx.currentTime, 0.2); }
  function rumbleStop() { const r = snd.rumble; if (!r) return; try { r.g.gain.setTargetAtTime(0, r.ctx.currentTime, 0.3); r.og.gain.setTargetAtTime(0, r.ctx.currentTime, 0.3); setTimeout(() => { try { r.n.stop(); r.o.stop(); } catch (e) { /* */ } }, 1500); } catch (e) { /* */ } snd.rumble = null; }

  // ---- train state (station frame x; the train's center)
  const T = { s: -9999, v: 0, phase: 'away', t: 0, doorK: 0, stopX: 0 };
  function setDoors(k) { for (const d of S.kit?.doors || []) { d.position.z = k * 0.9; d.visible = k < 0.98; } }
  function trainTick(dt) {
    const K = S.kit; if (!K) return;
    T.t += dt;
    if (T.phase === 'away') { if (T.t > T.wait) { T.phase = 'arriving'; T.s = T.stopX - 150; T.v = Math.sqrt(2 * 1.15 * 150); T.t = 0; rumbleStart(); } }
    else if (T.phase === 'arriving') { const rem = T.stopX - T.s; const a = rem > 0.05 ? (T.v * T.v) / (2 * rem) : 9; T.v = Math.max(0, T.v - a * dt); T.s += T.v * dt; if (T.v < 0.05 || rem < 0.02) { T.s = T.stopX; T.v = 0; T.phase = 'stopped'; T.t = 0; chime(); } }
    else if (T.phase === 'stopped') { T.doorK = Math.min(1, T.doorK + dt * 1.4); if (T.t > 30 && S.mode === 'platform') { T.phase = 'closing'; T.t = 0; chime(); } }
    else if (T.phase === 'closing') { T.doorK = Math.max(0, T.doorK - dt * 1.4); if (T.doorK <= 0 && T.t > 1.6) { T.phase = 'leaving'; T.t = 0; } }
    else if (T.phase === 'leaving') { T.v = Math.min(VMAX, T.v + ACC * dt); T.s += T.v * dt; if (T.s - T.stopX > 300) { T.phase = 'away'; T.t = 0; T.wait = 12; T.s = -9999; rumbleStop(); } }
    setDoors(T.doorK);
    K.train.position.x = T.s;
    const pl = game.player?.position;
    if (pl && S.mode === 'platform') { const lp = W.copy(pl); root.worldToLocal(lp); rumbleSet(T.v, Math.max(0.15, 1 - Math.abs(lp.x - T.s) / 160)); }
  }
  function tunnelTick() {
    const K = S.kit; if (!K) return;
    const c = S.mode === 'ride' ? R.s : K.station.position.x;
    const base = Math.floor((c - 240) / SEG) * SEG;
    K.caps[0].position.x = base - 0.1; K.caps[1].position.x = base + K.segs.length * SEG + 0.1;
    for (let i = 0; i < K.segs.length; i++) { const x = base + i * SEG + SEG / 2; const sg = K.segs[i]; sg.position.x = x; sg.visible = Math.abs(x - K.station.position.x) > 100 + SEG / 2; }
  }

  // ---- enter from the street
  async function enter(i) {
    if (S.busy) return; S.busy = true;
    try {
      await fade(true, S.stations[i].name.toUpperCase());
      const kit = await buildKit(); if (!kit) { notify('The Southline is closed right now.'); return; }
      S.here = i; S.relabel(i);
      orient(i, i < S.stations.length - 1 ? i + 1 : i - 1);
      kit.station.position.x = 0; root.visible = true; tunnelTick();
      platformColliders(true, 0);
      const sp = toWorld(SPAWN_LOCAL.x, SPAWN_LOCAL.y, SPAWN_LOCAL.z);
      game.teleport(sp.x, sp.y + 0.05, sp.z, root.rotation.y + Math.PI);   // face the track
      try { game.env?.setIndoor?.(true); if (game.player?.state) game.player.state.indoor = true; } catch (e) { /* */ }
      if (!S.hazeSaved) { S.hazeSaved = game.lookHaze || null; game.lookHaze = { day: 0, golden: 0, night: 0 }; }   // no outdoor aerial haze down here
      S.mode = 'platform';
      T.stopX = 0; T.phase = 'away'; T.t = 0; T.wait = 5; T.s = -9999; T.doorK = 0;
      spawnPeople(0);
      await sleep(400);
    } finally { await fade(false); S.busy = false; }
  }

  // ---- leave to the street at station i
  async function exitTo(i) {
    if (S.busy) return; S.busy = true;
    const s = S.stations[i];
    try {
      await fade(true, s.name.toUpperCase());
      releasePeople(); platformColliders(false); rumbleStop();
      root.visible = false; S.mode = 'street';
      try { game.env?.setIndoor?.(false); if (game.player?.state) game.player.state.indoor = false; } catch (e) { /* */ }
      if (S.hazeSaved !== undefined) { if (S.hazeSaved) game.lookHaze = S.hazeSaved; else delete game.lookHaze; delete S.hazeSaved; }
      const L = landing(s), heading = s.yaw;   // walk out facing away from the stairs
      const place = () => { const gy = city.groundHeightAt?.(L.x, L.z); game.teleport(L.x, Number.isFinite(gy) ? gy : undefined, L.z, heading); };
      place();
      const t0 = performance.now();
      while (performance.now() - t0 < 20000) {
        await sleep(120); place();
        const ok = city.collidersReadyAt?.(L.x, L.z) && (city.streamer?.readyAround ? city.streamer.readyAround(L.x, L.z, 120) : true);
        if (performance.now() - t0 > 600 && ok) break;
      }
      place(); try { if (game.renderer?.shadowMap) game.renderer.shadowMap.needsUpdate = true; } catch (e) { /* */ }
    } finally { await fade(false); S.busy = false; }
  }

  // ---- destination menu
  function rideMinutes(a, b) { const d = Math.hypot(S.stations[b].kx - S.stations[a].kx, S.stations[b].kz - S.stations[a].kz); return Math.max(1, Math.round((d / VMAX + VMAX / ACC + 25) / 60)); }
  function openMenu() {
    S.menu = true;
    menu.innerHTML = `<h3><img src="${logoURL}" alt="">SOUTHLINE  ·  ${S.stations[S.here].name}</h3>` + S.stations.map((s, i) => i === S.here
      ? `<div class="r here"><span><kbd>${i + 1}</kbd>${s.name}</span><span>you are here</span></div>`
      : `<div class="r" data-i="${i}"><span><kbd>${i + 1}</kbd>${s.name}</span><span>${rideMinutes(S.here, i)} min · $${FARE.toFixed(2)}</span></div>`).join('') + '<div class="f">Number key or click to ride · Esc to step back</div>';
    menu.classList.add('on');
    menu.querySelectorAll('.r[data-i]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); choose(+el.dataset.i); }));
    try { document.exitPointerLock?.(); } catch (e) { /* */ }
  }
  function closeMenu() { S.menu = false; menu.classList.remove('on'); }
  function pay() {
    const w = game.wallet;
    if (w?.pay) { const r = w.pay(FARE, { to: 'Southline Metro', category: 'transit', memo: 'Southline fare', accepts: ['cash', 'card'], place: 'Southline Metro' }); return !!r?.ok; }
    const P = game.player; if (P && (P.money ?? 0) >= FARE) { P.money -= FARE; return true; } return P?.money == null;
  }
  function choose(j) {
    if (!S.menu || j === S.here || j < 0 || j >= S.stations.length) return;
    if (!pay()) { notify('Not enough money for the $2.75 fare.'); return; }
    closeMenu(); board(j);
  }

  // ---- the ride
  const R = { on: false };
  function board(j) {
    const K = S.kit; S.dest = j; S.mode = 'ride';
    releasePeople(); platformColliders(false);
    // turn the whole space to the real bearing of this trip (nothing outside is visible, so the turn is invisible)
    const pivot = K.train.position.x;
    orient(S.here, j);
    const D = Math.hypot(S.stations[j].kx - S.stations[S.here].kx, S.stations[j].kz - S.stations[S.here].kz);
    Object.assign(R, { on: true, D, s: pivot, v: 0, phase: 'boarded', t: 0, skip: 0 });
    T.phase = 'ride';
    const P = game.player;
    try { game.playerCharacter?.setVisible?.(false); } catch (e) { /* */ }
    P.script = { lock: true, fixed() { const c = camWorld(); game.movePlayerTo(c.x, c.y - 1.6, c.z); } };
    game.cameraOverride = rideCamera;
    chime(); rumbleStart(); notify('C: inside / outside view · Hold E: skip to arrival', 3600);
  }
  const camL = new THREE.Vector3(), camT = new THREE.Vector3();
  function camWorld() { const x = R.s; return toWorld(x - 3, CAR_Y + 1.62, TRACK_Z + 1.15).clone(); }
  function rideCamera(dt, cam) {
    const x = R.s, t = performance.now() / 1000, sway = Math.sin(t * 1.7) * 0.012 * Math.min(1, R.v / 8) + Math.sin(t * 7.3) * 0.004 * Math.min(1, R.v / 15);
    if (S.view === 'in') { camL.set(x - 3, CAR_Y + 1.62 + sway, TRACK_Z + 1.15); camT.set(x + 7, CAR_Y + 1.25, TRACK_Z - 2.2); }
    else { camL.set(x - 40, CAR_Y + 2.3, TRACK_Z - 3.0); camT.set(x + 30, CAR_Y + 1.2, TRACK_Z - 0.6); }   // between the train and the track wall (inside the corridor everywhere)
    cam.position.copy(toWorld(camL.x, camL.y, camL.z)); cam.lookAt(toWorld(camT.x, camT.y, camT.z));
    if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); }
    return true;
  }
  const brakeDist = (v) => (v * v) / (2 * ACC);
  async function rideSkip(toPhase) {
    R.busyFade = true; await fade(true, toPhase === 'cruise' ? 'NEXT: ' + S.stations[S.dest].name.toUpperCase() : S.stations[S.dest].name.toUpperCase());
    const K = S.kit;
    if (toPhase === 'cruise') { R.v = VMAX; R.s = R.D - brakeDist(VMAX) - VMAX * 7; R.phase = 'cruise'; R.t = 0; K.station.position.x = R.D; S.relabel(S.dest); }
    else { R.v = 14.4; R.s = R.D - brakeDist(14.4) - (VMAX * 0); R.phase = 'brake'; R.t = 0; K.station.position.x = R.D; S.relabel(S.dest); }
    K.train.position.x = R.s; tunnelTick();
    await sleep(150); await fade(false); R.busyFade = false;
  }
  function rideTick(dt) {
    const K = S.kit; if (!R.on || !K) return;
    R.t += dt;
    const holdE = game.input?.down?.('KeyE');
    R.skip = holdE ? R.skip + dt : 0;
    if (game.input?.pressed?.('KeyC')) S.view = S.view === 'in' ? 'out' : 'in';
    if (!R.busyFade) {
      if (R.phase === 'boarded') { T.doorK = Math.max(0, T.doorK - dt * 1.4); if (R.t > 2.2) { R.phase = 'depart'; R.t = 0; } }
      else if (R.phase === 'depart') { R.v = Math.min(VMAX, R.v + ACC * dt); R.s += R.v * dt; if (R.t > 10 || R.skip > 0.6) rideSkip(R.skip > 0.6 ? 'brake' : 'cruise'); }
      else if (R.phase === 'cruise') { R.s += R.v * dt; if (R.D - R.s <= brakeDist(R.v) + 0.5) { R.phase = 'brake'; R.t = 0; } else if (R.t > 7 || R.skip > 0.6) rideSkip('brake'); }
      else if (R.phase === 'brake') { const rem = R.D - R.s; const a = rem > 0.05 ? (R.v * R.v) / (2 * rem) : 9; R.v = Math.max(0, R.v - a * dt); R.s += R.v * dt; if (R.v < 0.04 || rem < 0.02) { R.s = R.D; R.v = 0; R.phase = 'arrived'; R.t = 0; chime(); } }
      else if (R.phase === 'arrived') { T.doorK = Math.min(1, T.doorK + dt * 1.4); if (R.t > 1.2) arrive(); }
    }
    setDoors(T.doorK);
    K.train.position.x = R.s; tunnelTick(); rumbleSet(R.v, 0.8);
  }
  function arrive() {
    const K = S.kit; R.on = false;
    // re-base the space at the destination: station back to local 0, origin above the destination entrance
    const j = S.dest, i = S.here; S.here = j;
    const dj = S.stations[j]; root.position.set(dj.kx, (dj.gy || 0) + ALT, dj.kz); root.updateMatrixWorld(true);   // same bearing, origin above j
    const back = new THREE.Vector3();
    K.station.position.x = 0; K.train.position.x = 0; T.s = 0; T.stopX = 0; T.v = 0; T.phase = 'stopped'; T.t = 0; T.doorK = 1;
    tunnelTick();
    platformColliders(true, 0);
    const out = toWorld(-3, PLAT_Y, 3.2); back.copy(out);
    game.cameraOverride = null; game.player.script = null;
    try { game.playerCharacter?.setVisible?.(true); } catch (e) { /* */ }
    game.teleport(back.x, back.y + 0.05, back.z, root.rotation.y);
    S.mode = 'platform'; spawnPeople(0);
    notify(`${S.stations[j].name}. Follow the EXIT signs to the street.`, 3200);
  }

  // ---- per-frame
  const pl = new THREE.Vector3();
  game.updaters.push(function metroTick(dt) {
    try {
      const P = game.player; if (!P) return;
      const ui = game.ui || {}, blocked = ui.paused || ui.phoneOpen || S.busy;
      if (S.mode === 'street') {
        for (const s of S.stations) if (!s.root && Math.abs(P.position.x - s.kx) < 260 && Math.abs(P.position.z - s.kz) < 260) placeKiosk(s);
        if (P.state?.inVehicle) return;
        let near = -1; for (let i = 0; i < S.stations.length; i++) { const L = landing(S.stations[i]); if (Math.hypot(P.position.x - L.x, P.position.z - L.z) < 2.6) near = i; }
        if (near >= 0) {
          if (Math.hypot(P.position.x - S.stations[near].kx, P.position.z - S.stations[near].kz) < 400) buildKit();   // prefetch while you walk up
          const stars = game.wanted?.level || 0;
          help(stars >= 2 ? 'The Southline is watched by the police. <b>Lose the cops first.</b>' : `Press <b>E</b> to take the <b>Southline</b> (${S.stations[near].name})`);
          if (!blocked && stars < 2 && game.input?.pressed?.('KeyE')) enter(near);
        } else for (const s of S.stations) if (Math.hypot(P.position.x - s.kx, P.position.z - s.kz) < 120) { buildKit(); break; }
        return;
      }
      if (S.mode === 'platform') {
        trainTick(dt); tunnelTick();
        pl.copy(P.position); root.worldToLocal(pl);
        if (S.menu) {
          for (let k = 0; k < S.stations.length; k++) if (game.input?.pressed?.('Digit' + (k + 1)) || game.input?.pressed?.('Numpad' + (k + 1))) choose(k);
          if (game.input?.pressed?.('Escape') || game.input?.pressed?.('Backspace') || pl.z > 5.5) closeMenu();
          help(null); return;
        }
        if (Math.hypot(pl.x - EXIT_LOCAL.x, pl.z - EXIT_LOCAL.z) < 2.4) { help('Press <b>E</b> to exit to the street'); if (!blocked && game.input?.pressed?.('KeyE')) exitTo(S.here); return; }
        const atTrain = T.phase === 'stopped' && T.doorK > 0.8 && pl.z < 3.6 && Math.abs(pl.x - T.s) < 1.5 * CAR_L;
        if (atTrain) {
          const stars = game.wanted?.level || 0;
          help(stars >= 2 ? 'No boarding with the police after you.' : 'Press <b>E</b> to board the <b>Southline</b>');
          if (!blocked && stars < 2 && game.input?.pressed?.('KeyE')) openMenu();
          return;
        }
        if (T.phase !== 'stopped' && pl.z < 3.6) help(T.phase === 'away' || T.phase === 'arriving' ? 'The next Southline train is arriving.' : null);
        return;
      }
      if (S.mode === 'ride') { rideTick(dt); help(null); }
    } catch (e) { console.error('[metro]', e); }
  });
  Object.assign(S, { enter, exitTo, openMenu, choose, T, R, root, landing });   // test hooks (tools/v2/metro/shots.mjs)
  console.info('[metro] Southline ready:', S.stations.map((s) => `${s.name} (${s.kx.toFixed(0)}, ${s.kz.toFixed(0)})`).join(', '));
}

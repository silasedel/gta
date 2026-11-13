// Streamed, enterable store interiors (INTERIORS agent, wave 4).
// Sources: city.storefronts (Miami shells: the CITY draws the walls, we fill the interior box) or city.shopLots
// (old city: empty lots, we also build the shop building). Interiors are generated on demand near the player,
// LOD'd hard (low-LOD stock strips → full labelled products for the 3 nearest), and disposed when far.
import * as THREE from 'three';
import { createCharacter } from '../../player/characterModel.js';
import { rng as pedRng } from '../../player/pedStyle.js';
import { ProductBatch, getAtlas, productGeo, labelPlaneGeo, GARMENT_COLORS } from './products.js';
import { TYPES, chooseType, chooseName, isOpenAt, busyFactor, srng } from './types.js';
import { generateLayout, buildNav } from './layout.js';
import { fitLots } from './fitlots.js';
import { textMesh, setTextBrightness, stdMat, glowMat, panelMats, floorMats, floorGeo, danceMat, warmup, glyphAtlas } from './shared.js';
import { Bucket, mats, buildFixture, signTex, stripeTex, floorTex, menuTex, textTex, MIX } from './fixtures.js';

const ACTIVE_R = 80, DISPOSE_R = 150, DETAIL_R = 45, MAX_DETAIL = 3, MAX_ACTIVE = 6, CACHE = 6, PROD_BUDGET = 150000, MAX_CHARS = 32, CH = 3, PROD_R = 11;
const SHELL_T = 0.25, GF_H = 4.2; // CITY shell wall allowance and ground-floor height

function seedFor(base, female) { for (let s = base; s < base + 400; s++) { const isF = pedRng(s * 7 + 3)() < 0.3; if (isF === female) return s; } return base; }

export async function createInteriors(game) {
  const { scene, world, RAPIER } = game;
  const city = game.city || {};
  const M = mats();
  const VINYL = [0xd8344a, 0x2a9d8f, 0x264653, 0xe9c46a, 0x6d597a], TABLE = [0xf1faee, 0x3d2c2e, 0x8a5a3a, 0x1d1d1f], CHAIR = [0x264653, 0x8a5a3a, 0xe76f51, 0x1d1d1f, 0xf4a261];
  const trimHex = (def) => new THREE.Color(def.trim).lerp(new THREE.Color(0xffffff), 0.15).getHex();
  const wallHex = (def, seed) => new THREE.Color(def.wall).offsetHSL(((seed % 7) - 3) * 0.015, 0.05, -0.04).getHex();
  // a sign/menu board: shared backboard material + glyph text lines (title + optional item/price rows)
  function board(w, h, title, rows, color, bgHex = 0x141414) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), stdMat(bgHex, 0.8)));
    const col = new THREE.Color(color).multiplyScalar(1.6);
    if (!rows) { const t = textMesh(title, { size: h * 0.45, color: col, maxWidth: w * 0.9 }); t.position.z = 0.01; g.add(t); return g; }
    const n = Math.min(6, rows.length), lh = h / (n + 2.2);
    const t = textMesh(title, { size: lh * 0.85, color: col, maxWidth: w * 0.9 }); t.position.set(0, h / 2 - lh * 0.9, 0.01); g.add(t);
    rows.slice(0, n).forEach(([name, price], i) => {
      const y = h / 2 - lh * (2.2 + i);
      const a = textMesh(name, { size: lh * 0.6, color: new THREE.Color(1.3, 1.3, 1.25), maxWidth: w * 0.62, align: 'left' }); a.position.set(-w * 0.44, y, 0.01); g.add(a);
      const b = textMesh('$' + price, { size: lh * 0.6, color: new THREE.Color(1.6, 1.3, 0.5), maxWidth: w * 0.2, align: 'left' }); b.position.set(w * 0.26, y, 0.01); g.add(b);
    });
    return g;
  }
  const list = [];
  const byKey = new Map();
  const tmpV = new THREE.Vector3();
  let current = null;

  // ---------------------------------------------------------------- store records
  const zoneOf = (x, z) => { try { return city.zoneAt?.(x, z) || null; } catch (e) { return null; } };
  function addStorefront(sf, index) {
    const key = sf.id != null ? 'id' + sf.id : `${Math.round(sf.x * 10)},${Math.round(sf.z * 10)}`;
    if (byKey.has(key)) return;
    const shell = sf.shell ?? (sf.buildingId != null);
    const fit = shell ? ingest.fit?.get(sf) : null;
    if (fit && !fit.ok) return; // overlaps another lot or a neighbouring building: no interior here
    const facing = sf.facing || 0; const cos = Math.cos(facing), sin = Math.sin(facing);
    const seed = Math.abs(Math.round(sf.x * 13.7 + sf.z * 7.3)) + index * 31 + 7;
    const zone = (sf.zone || zoneOf(sf.x, sf.z) || 'commercial');
    const type = gunLots.has(sf) ? 'guns' : chooseType(sf, index, zone, seed);
    const def = TYPES[type];
    const oldCity = !shell;
    // interior box
    let W, D, H, cx = sf.x, cz = sf.z, baseY = sf.y ?? 0, FY;
    if (shell) { // interior = (fitted) shell box minus 0.25 m side/back walls; front stays on the facade line
      const lw = fit ? fit.w : sf.w, ld = fit ? fit.d : sf.d, off = (fit ? fit.off : 0) + SHELL_T / 2;
      W = Math.max(3, lw - 2 * SHELL_T); D = Math.max(3, ld - SHELL_T); cx += sin * off; cz += cos * off;
      H = Math.max(3, Math.min(sf.h || GF_H, GF_H)); FY = 0.03; if (!(sf.y > 0) && city.groundHeightAt) { try { const gy = city.groundHeightAt(sf.x + sin * (D / 2 + 1.5), sf.z + cos * (D / 2 + 1.5)); if (Number.isFinite(gy) && gy > -2) baseY = gy; } catch (e) { /* */ } } }
    else { const Wb = Math.min(Math.max(8, (sf.w || 18) - 2), 18), Db = Math.min(Math.max(8, (sf.d || 14) - 3), 14); W = Wb - 2 * SHELL_T; D = Db - 2 * SHELL_T; H = 4.5; FY = 0.08; const off = -((sf.d || 14) - Db) / 2 + 0.5; cx += sin * off; cz += cos * off; }
    const doorW = Math.min(sf.doorW || (shell ? 1.9 : 2.0), W - 1);
    const doorX = THREE.MathUtils.clamp(sf.doorX || 0, -W / 2 + doorW / 2 + 0.3, W / 2 - doorW / 2 - 0.3);
    const s = {
      key, sf, index, type, def, name: chooseName(type, sf, index, seed, oldCity), hours: def.hours.slice(), open: true, robbed: false, robbedUntil: -1,
      shell, W, D, H, FY, baseY, doorX, doorW, facing, cos, sin, seed, zone, items: [], clerk: null, built: null, dist: Infinity, doorOpen: 0, lastSeen: 0,
      center: new THREE.Vector3(cx, baseY, cz), layoutKey: def.layouts[seed % def.layouts.length],
    };
    s.toWorld = (lx, lz, out = new THREE.Vector3()) => out.set(cx + lx * cos + lz * sin, baseY, cz - lx * sin + lz * cos);
    s.toLocal = (wx, wz) => { const dx = wx - cx, dz = wz - cz; return { x: dx * cos - dz * sin, z: dx * sin + dz * cos }; };
    s.isInside = (pos) => { const l = s.toLocal(pos.x, pos.z); return Math.abs(l.x) < W / 2 && l.z < D / 2 && l.z > -D / 2 && pos.y < baseY + H - 0.2 && pos.y > baseY - 1.5; };
    s.counterPos = s.center.clone();
    byKey.set(key, s); list.push(s);
    if (!shell) buildExterior(s);
  }
  let fitStats = null;
  // Miami: OSM has (almost) no gun shops, so promote ~5 untyped commercial/residential lots to gun stores,
  // spread over the map, one within ~300 m of the player spawn. Deterministic (ordered by lot id).
  const gunLots = new Set();
  function pickGunLots(shells) {
    gunLots.clear();
    const ok = (sf) => (!ingest.fit || ingest.fit.get(sf)?.ok) && sf.zone !== 'beach' && !(sf.poi && sf.kind !== 'weapons');
    const byId = shells.filter(ok).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const pref = byId.filter((sf) => sf.zone === 'commercial' || sf.zone === 'residential');
    const pool = pref.length >= 5 ? pref : byId; if (!pool.length) return;
    const sp = city.playerSpawn; const d2 = (a, x, z) => (a.x - x) ** 2 + (a.z - z) ** 2;
    if (sp) { // nearest suitable lot to spawn (prefer commercial/residential if within 300 m)
      const near = (list) => list.reduce((b, sf) => (!b || d2(sf, sp.x, sp.z) < d2(b, sp.x, sp.z) ? sf : b), null);
      let n = near(pool); if (!n || d2(n, sp.x, sp.z) > 300 * 300) { const n2 = near(byId); if (n2 && d2(n2, sp.x, sp.z) <= 300 * 300) n = n2; }
      if (n) gunLots.add(n);
    }
    while (gunLots.size < 5 && gunLots.size < pool.length) { // farthest-point spread, ties broken by id order
      let best = null, bd = -1;
      for (const sf of pool) { if (gunLots.has(sf)) continue; let m = Infinity; for (const g of gunLots) m = Math.min(m, d2(sf, g.x, g.z)); if (!gunLots.size) m = -(sf.id ?? 0); if (m > bd) { bd = m; best = sf; } }
      if (!best) break; gunLots.add(best);
    }
  }
  // Miami: only lots whose CITY shell was actually built get an interior. The CITY stamps h/doorX/doorW on the
  // lot when it cuts the shell (or exposes storefrontHasShell); dropped/overlapping footprints never get one.
  function hasShell(s) {
    if (!s.shell) return true; // old-city lots: we build the whole shop ourselves
    const sf = s.sf;
    if (typeof city.storefrontHasShell === 'function') { try { return !!city.storefrontHasShell(sf); } catch (e) { return false; } }
    return sf.h != null || sf.doorX != null || sf.doorW != null;
  }
  function refreshShellFields(s) { // shell fields may be stamped after ingest (tiles stream in)
    const sf = s.sf; if (!s.shell) return;
    if (sf.h != null) s.H = Math.max(2.6, sf.h); // the shell's own ground-floor clearance
    if (sf.doorW != null) s.doorW = Math.min(sf.doorW, s.W - 1);
    if (sf.doorX != null) s.doorX = THREE.MathUtils.clamp(sf.doorX, -s.W / 2 + s.doorW / 2 + 0.3, s.W / 2 - s.doorW / 2 - 0.3);
  }
  function ingest() {
    const src = (Array.isArray(city.storefronts) && city.storefronts.length ? city.storefronts : city.shopLots) || [];
    if (src === ingest.src && src.length === ingest.n) return;
    ingest.src = src; ingest.n = src.length;
    const shells = src.filter((sf) => sf.shell ?? (sf.buildingId != null));
    if (shells.length) { try { const t = performance.now(); ingest.fit = fitLots(shells, city.mapLayers?.buildingPolys); fitStats = { ...ingest.fit.stats, ms: Math.round(performance.now() - t) }; console.info('[interiors] lot fit', fitStats); } catch (e) { console.warn('[interiors] fitLots failed', e); ingest.fit = null; } }
    if (shells.length) pickGunLots(shells);
    src.forEach((sf, i) => { try { addStorefront(sf, i); } catch (e) { console.warn('[interiors] storefront failed', e); } });
    rebuildGrid();
  }
  // spatial hash (64 m cells)
  const grid = new Map(); const CELL = 64;
  function rebuildGrid() { grid.clear(); for (const s of list) { const k = `${Math.floor(s.center.x / CELL)},${Math.floor(s.center.z / CELL)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); } }
  function near(x, z, r) { const out = []; const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL), d0 = Math.floor((z - r) / CELL), d1 = Math.floor((z + r) / CELL); for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) { const a = grid.get(`${i},${j}`); if (a) for (const s of a) out.push(s); } return out; }

  // ---------------------------------------------------------------- old-city exterior (walls, roof, awning, sign)
  function storeGroup(s) { const g = new THREE.Group(); g.position.set(s.center.x, s.baseY, s.center.z); g.rotation.y = s.facing; g.updateMatrixWorld(true); return g; }
  function fixedBody(s, cols) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.facing);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.center.x, s.baseY, s.center.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    for (const [x, y, z, hx, hy, hz] of cols) if (hx > 0.01 && hy > 0.01 && hz > 0.01) world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.6), body);
    return body;
  }
  function buildExterior(s) {
    const { W, D, H, def, doorX, doorW } = s; const T = SHELL_T; const Wo = W + 2 * T, Do = D + 2 * T; const zf = D / 2 + T / 2, zb = -D / 2 - T / 2;
    const grp = storeGroup(s); scene.add(grp);
    const stucco = new THREE.MeshStandardMaterial({ color: def.wall, roughness: 0.92 }); const trim = new THREE.MeshStandardMaterial({ color: def.trim, roughness: 0.6 });
    const awn = new THREE.MeshStandardMaterial({ map: stripeTex(def.trim === 0x1d1d1d ? '#1d1d1d' : '#' + def.trim.toString(16).padStart(6, '0'), '#fff8ea'), roughness: 0.8, side: THREE.DoubleSide });
    const B = new Bucket(); const cols = []; const C = (x, y, z, sx, sy, sz) => cols.push([x, y, z, sx / 2, sy / 2, sz / 2]);
    B.box(stucco, 0, H / 2, zb, Wo, H, T); B.box(stucco, -W / 2 - T / 2, H / 2, 0, T, H, Do); B.box(stucco, W / 2 + T / 2, H / 2, 0, T, H, Do);
    C(0, H / 2, zb, Wo, H, T); C(-W / 2 - T / 2, H / 2, 0, T, H, Do); C(W / 2 + T / 2, H / 2, 0, T, H, Do);
    const dl = doorX - doorW / 2, dr = doorX + doorW / 2;
    B.box(stucco, 0, H - 0.6, zf, Wo, 1.2, T); C(0, H - 0.6, zf, Wo, 1.2, T + 0.1);
    for (const [a, b] of [[-Wo / 2, dl], [dr, Wo / 2]]) { const w = b - a; if (w < 0.05) continue; const c = (a + b) / 2; B.box(trim, c, 0.25, zf, w, 0.5, T + 0.02); C(c, (H - 1.2) / 2, zf, w, H - 1.2, T + 0.1); s.glassRects = s.glassRects || []; s.glassRects.push([c, w]); }
    for (const x of [-Wo / 2 + 0.5, Wo / 2 - 0.5]) B.box(stucco, x, (H - 1.2) / 2, zf, 1.0, H - 1.2, T);
    for (const x of [dl - 0.06, dr + 0.06]) B.box(M.dark, x, 1.65, zf, 0.12, 3.3, T + 0.04);
    B.box(M.dark, 0, H - 1.2, zf, Wo - 2, 0.12, T + 0.06);
    B.box(trim, 0, H + 0.15, 0, Wo + 0.4, 0.3, Do + 0.4); B.box(M.metal, 0, H + 0.0, 0, Wo - 0.1, 0.1, Do - 0.1); C(0, H - 0.05, 0, Wo, 0.3, Do);
    B.box(M.metal, -Wo * 0.25, H + 0.5, -Do * 0.2, 1.6, 0.9, 1.2);
    B.box(s.floorMatOld = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.8 }), 0, -0.06, 0, W, 0.28, D); C(0, -0.06, 0, Wo - 0.1, 0.28, Do - 0.1);
    B.box(M.dark, doorX, -0.06, zf + 0.6, doorW + 0.6, 0.28, 1.2); C(doorX, -0.06, zf + 0.6, doorW + 0.6, 0.28, 1.2);
    const awnGeo = new THREE.PlaneGeometry(Wo - 1, 1.8); awnGeo.rotateX(-Math.PI / 2 + 0.38); B.add(awn, awnGeo, 0, H - 1.35, zf + T / 2 + 0.85); B.box(trim, 0, H - 1.68, zf + T / 2 + 1.68, Wo - 1, 0.2, 0.05);
    const glassB = new Bucket(); for (const [c, w] of s.glassRects || []) if (w > 1.2) glassB.box(M.glass, c, 0.5 + (H - 1.7) / 2, zf, w - 1.0, H - 1.7, 0.04);
    B.build(grp); glassB.build(grp, { cast: false, receive: false });
    s.ext = { grp, body: fixedBody(s, cols) };
    addFacade(s, s.ext.grp, zf + T / 2);
  }
  // sign, doors, open/closed signs. Attached to an exterior group (old city: persistent; shells: built with the interior)
  function addFacade(s, grp, zFront) {
    const { def, doorX, doorW, H } = s;
    // sign: shared dark backboard + neon glyph text (no per-store textures or materials)
    const signW = Math.min(s.W * 0.6, 8), signH = Math.min(0.75, signW * 0.19);
    const sign = new THREE.Group(); sign.position.set(s.shell ? doorX : 0, s.shell ? Math.min(H - 0.35, 3.3) : H - 0.6, zFront + 0.03); grp.add(sign);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), M.black); sign.add(board);
    const signText = textMesh(s.name, { size: signH * 0.5, color: new THREE.Color(def.neon), maxWidth: signW * 0.92 }); signText.position.z = 0.01; sign.add(signText);
    const ox = doorX - doorW / 2 - 0.9;
    const mkSmall = (txt, col, z) => { const g = new THREE.Group(); g.position.set(ox, 2.3, zFront + z); const b = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), M.black); g.add(b); const t = textMesh(txt, { size: 0.13, color: new THREE.Color(col).multiplyScalar(2), maxWidth: 0.72 }); t.position.z = 0.005; g.add(t); grp.add(g); return g; };
    const openSign = mkSmall('OPEN', '#ff4060', 0.02); const closedSign = mkSmall('CLOSED', '#ff2a2a', 0.025); closedSign.visible = false;
    const doors = [];
    for (const side of [-1, 1]) {
      const door = new THREE.Group(); const half = doorW / 2;
      const pane = new THREE.Mesh(new THREE.BoxGeometry(half, 2.5, 0.04), M.glass); pane.position.y = 1.3; door.add(pane);
      const f1 = new THREE.Mesh(new THREE.BoxGeometry(half, 0.07, 0.06), M.dark); f1.position.y = 0.07; door.add(f1); const f2 = f1.clone(); f2.position.y = 2.55; door.add(f2);
      const f3 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.5, 0.06), M.dark); f3.position.set(-side * half / 2, 1.3, 0); door.add(f3);
      door.position.set(doorX + side * half / 2, 0, zFront - 0.12); door.userData.side = side; grp.add(door); doors.push(door);
    }
    s.facade = { signText, signK: -1, openSign, closedSign, doors, disposables: [] };
    // closed-door collider on its own body so it survives interior disposal
    try {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.facing);
      const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.center.x, s.baseY, s.center.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
      const c = world.createCollider(RAPIER.ColliderDesc.cuboid(doorW / 2, 1.3, 0.06).setTranslation(doorX, 1.3, zFront - 0.12), b); c.setEnabled?.(false);
      s.facade.doorBody = b; s.facade.doorCol = c; s.locked = false; s.facade.doorZ = zFront - 0.12;
    } catch (e) { /* */ }
    applyOpen(s, true);
  }
  // anything dynamic/kinematic (player, peds, cars) inside the doorway box?
  const _doorShape = new RAPIER.Cuboid(1, 1.2, 0.6); const _q = new THREE.Quaternion(); const _up = new THREE.Vector3(0, 1, 0);
  function doorwayOccupied(s, fz, depth = 0.6, skipPlayer = false) {
    _doorShape.halfExtents.x = s.doorW / 2 + 0.1; _doorShape.halfExtents.z = depth;
    const c = s.toWorld(s.doorX, fz); _q.setFromAxisAngle(_up, s.facing);
    let hit = false;
    try {
      world.intersectionsWithShape({ x: c.x, y: s.baseY + 1.25, z: c.z }, { x: _q.x, y: _q.y, z: _q.z, w: _q.w }, _doorShape, (col) => {
        if (skipPlayer && col.handle === game.player.collider?.handle) return true; const b = col.parent(); if (b && !b.isFixed() && !(skipPlayer && b.handle === game.player.body?.handle)) { hit = true; return false; } return true;
      });
    } catch (e) { /* query unavailable: fall back to "occupied" when the player is close */ const l = s.toLocal(game.player.position.x, game.player.position.z); hit = Math.hypot(l.x - s.doorX, l.z - fz) < 1.2; }
    return hit;
  }
  function pushOut(s, loc, fz, dz) {
    const P = game.player; if (!P.body) return;
    const side = dz < 0 ? -1 : 1; // nearest free side along the door axis
    const w = s.toWorld(loc.x, fz + side * 0.75); const t = P.body.translation();
    try { P.body.setTranslation({ x: w.x, y: t.y, z: w.z }, true); } catch (e) { /* */ }
  }
  function setSign(s, k) { const f = s.facade; if (!f || f.signK === k) return; f.signK = k; setTextBrightness(f.signText, k); }
  function applyOpen(s, force) {
    const open = s.open;
    if (s.facade) { s.facade.openSign.visible = open; s.facade.closedSign.visible = !open; }
    if (s.built?.panelMesh) s.built.panelMesh.material = open ? s.built.panel : panelMats().off;
    void force;
  }

  // ---------------------------------------------------------------- interior build / dispose
  const screenMats = [new THREE.Color(0.6, 1.2, 2.0), new THREE.Color(2.0, 0.6, 1.4), new THREE.Color(0.7, 2.0, 1.0), new THREE.Color(2.0, 1.4, 0.5)].map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
  const tvMat = M.tv;
  function* buildInteriorGen(s) {
    const t0 = performance.now(); let ly = t0; let active = 0;
    const Y = () => performance.now() - ly > 3;
    const { W, D, H, FY, def, type } = s;
    const R = srng(s.seed * 5 + 1);
    const L = generateLayout({ type, layout: s.layoutKey, W, D, H, doorX: s.doorX, doorW: s.doorW, seed: s.seed });
    const prof = { layout: performance.now() - t0 };
    const grp = storeGroup(s);
    const disposables = [];
    const trimC = new THREE.Color(def.trim);
    const ctx = {
      B: new Bucket(), glassB: new Bucket(), low: new Bucket(), batch: new ProductBatch(), cols: [], anim: [], R, H, W, D, FY, def, type, L, grp, seats: L.seats, signs: [], aisleSigns: 0, disposables,
      trimMat: stdMat(trimHex(def), 0.55),
      vinylMat: stdMat(VINYL[s.seed % 5], 0.45), tableMat: stdMat(TABLE[s.seed % 4], 0.4), chairMat: stdMat(CHAIR[(s.seed >> 2) % 5], 0.6),
      colorMat: (c) => stdMat(c.getHex(), 0.7), ledMat: glowMat(new THREE.Color(def.neon).multiplyScalar(2.2)),
      screenMats, tvMat,
      // menu / price boards and small signs: shared backboard + glyph text (built from the TYPE, not the store)
      menuBoard: (w, h) => board(w, h, type === 'guns' ? 'PRICE LIST' : (def.label || '').toUpperCase() + ' MENU', def.items.map((i) => [i[0], i[1]]), def.neon),
      textBoard: (txt, w, h) => board(w, h, txt, null, '#ffffff', 0x1d3557),
    };
    ctx.B.yOff = FY;
    const chunkOf = (x, z) => Math.max(0, Math.floor((x + W / 2) / CH)) + Math.max(0, Math.floor((z + D / 2) / CH)) * 64;
    ctx.batch.chunkOf = chunkOf; const lowChunks = new Map();
    ctx.lowFor = (x, z) => { const k = chunkOf(x, z); if (!lowChunks.has(k)) lowChunks.set(k, new Bucket()); return lowChunks.get(k); };
    // items + points of interest
    const items = []; let itemI = 0;
    const smashDefs = def.items.filter((i) => i[3]?.smash); const plainDefs = def.items.filter((i) => !i[3]?.smash);
    ctx.addItem = (x, z, tag) => {
      const pool = tag === 'smash' && smashDefs.length ? smashDefs : plainDefs.length ? plainDefs : def.items;
      const d = pool[itemI++ % pool.length];
      items.push({ name: d[0], price: d[1], heal: d[2] || 0, action: d[3] || null, local: { x, z }, pos: s.toWorld(x, z).setY(s.baseY + 1.0) });
    };
    const pois = []; ctx.poi = (x, z, ry, tag) => pois.push({ x, z, ry, tag });
    // shell finish: floor, ceiling + light panels, wall paint, mat, posters, speakers, camera
    const fstyle = def.floor[s.seed % def.floor.length];
    const floorMat = floorMats(floorTex)[fstyle] || floorMats(floorTex).tile;
    const pm = panelMats(); const panel = type === 'club' ? pm.club : type === 'bar' ? pm.bar : pm.std;
    const wallMat = stdMat(wallHex(def, s.seed), 0.9);
    const B = ctx.B;
    B.yOff = 0; B.add(floorMat, floorGeo(W - 0.02, D - 0.02, fstyle), 0, FY, 0); B.yOff = FY;
    const ceilMat = def.ceil === 'dark' ? M.dark : M.ceil; const ch = H - 0.6;
    if (!game.debugInteriors?.noCeil) B.box(ceilMat, 0, ch, 0, W, 0.05, D);
    if (def.ceil === 'dark') for (let z = -D / 2 + 2; z < D / 2 - 1; z += 3) B.box(M.metal, 0, ch - 0.2, z, W - 1, 0.14, 0.14);
    for (let x = -W / 2 + 2; x < W / 2 - 1; x += 3.5) for (let z = -D / 2 + 1.8; z < D / 2 - 1; z += 3.2) B.box(panel, x, ch - 0.03, z, 1.2, 0.03, 0.6);
    for (const [x, z, sx, sz] of [[0, -D / 2 + 0.01, W, 0.02], [-W / 2 + 0.01, 0, 0.02, D], [W / 2 - 0.01, 0, 0.02, D]]) B.box(wallMat, x, ch / 2, z, sx, ch, sz);
    B.box(M.mat, s.doorX, 0.005, D / 2 - 0.8, s.doorW + 0.4, 0.01, 1.2);
    if (s.shell) { // the CITY shell is the whole ground floor; wall off this shop's box (sides + back) inside it
      const T = SHELL_T, hh = H; // walls occupy the lot's outer 0.25 m — never outside the shell box
      B.box(wallMat, -W / 2 - T / 2, hh / 2 - FY, 0, T, hh, D); B.box(wallMat, W / 2 + T / 2, hh / 2 - FY, 0, T, hh, D); B.box(wallMat, 0, hh / 2 - FY, -D / 2 - T / 2, W + 2 * T, hh, T);
      ctx.cols.push([0, (FY - 0.25) / 2, 0, W / 2, (FY + 0.25) / 2, D / 2], [-W / 2 - T / 2, hh / 2, 0, T / 2, hh / 2, D / 2], [W / 2 + T / 2, hh / 2, 0, T / 2, hh / 2, D / 2], [0, hh / 2, -D / 2 - T / 2, W / 2 + T, hh / 2, T / 2]);
    }
    for (const [sx, sz] of [[-W / 2 + 0.3, -D / 2 + 0.3], [W / 2 - 0.3, -D / 2 + 0.3]]) B.box(M.black, sx, ch - 0.35, sz, 0.32, 0.42, 0.26);
    B.box(M.dark, W / 2 - 0.3, ch - 0.3, D / 2 - 0.3, 0.25, 0.18, 0.35); B.box(M.led, W / 2 - 0.3, ch - 0.32, D / 2 - 0.49, 0.03, 0.03, 0.02);
    // wall posters / promo art high on the side walls (atlas labels, no per-store textures)
    { const cats = { grocery: 'cereal', convenience: 'soda', bodega: 'soda', liquor: 'liquor', pharmacy: 'pharm', electronics: 'tech', clothing: 'mag', beauty: 'beauty', surf: 'souvenir', souvenir: 'souvenir', cafe: 'coffee', restaurant: 'sauce', bar: 'liquor', club: 'energy', salon: 'beauty', barber: 'mag', fastfood: 'soda', icecream: 'icecream' };
      const cat = cats[type] || 'mag'; let k = 0;
      for (const side of [-1, 1]) for (let z = -D / 2 + 1.6; z < D / 2 - 2.5; z += 3.2) { if (R() < 0.35) continue; B.add(M.atlas, labelPlaneGeo(cat, (s.seed + k++) % 5, { art: ['face', 'circle', 'wave'][k % 3], sub: ['NEW', 'SALE', '2 FOR 1', 'FRESH'][k % 4] }, 0.8, 1.1), side * (W / 2 - 0.03), Math.min(ch - 0.75, 2.75), z, -side * Math.PI / 2); } }
    // fixtures
    for (const f of L.fixtures) { buildFixture(ctx, f); if (Y()) { active += performance.now() - ly; yield; ly = performance.now(); } }
    active += performance.now() - ly; yield; ly = performance.now();
    // hanging aisle signs
    const aisleNames = { grocery: ['CEREAL & BREAKFAST', 'PASTA & SAUCES', 'CANNED GOODS', 'SNACKS', 'COFFEE & TEA'], convenience: ['SNACKS', 'GROCERY', 'CANDY'], bodega: ['CHIPS', 'GROCERY', 'CAFÉ'], pharmacy: ['PAIN RELIEF', 'COLD & FLU', 'VITAMINS', 'FIRST AID'], liquor: ['RUM', 'TEQUILA', 'WHISKEY', 'WINE'], auto: ['OIL', 'ELECTRICAL', 'CAR CARE'], souvenir: ['GIFTS', 'MIAMI'] }[type];
    if (aisleNames) ctx.signs.forEach((sg, i) => { for (const flip of [0, Math.PI]) { const g = board(1.3, 0.32, aisleNames[i % aisleNames.length], null, '#ffffff', trimHex(def)); g.position.set(sg.x, Math.min(ch - 0.5, 3.0) + FY, sg.z); g.rotation.y = (sg.along === 'z' ? Math.PI / 2 : 0) + flip; grp.add(g); } });
    // meshes
    const meshes = [...B.build(grp), ...ctx.glassB.build(grp, { cast: false, receive: false })];
    const panelMesh = meshes.find((m) => m.material === panel) || null;
    active += performance.now() - ly; yield; ly = performance.now();
    const lowGroup = new THREE.Group(); grp.add(lowGroup);
    const chunks = new Map(); const cv = ctx.batch.chunkVerts();
    for (const [k, bk] of lowChunks) { const g = new THREE.Group(); bk.build(g, { cast: false }); lowGroup.add(g); chunks.set(k, { key: k, x: -W / 2 + ((k % 64) + 0.5) * CH, z: -D / 2 + (Math.floor(k / 64) + 0.5) * CH, low: g, verts: cv.get(k) || 0, mesh: null }); }
    for (const [k, v] of cv) if (!chunks.has(k)) chunks.set(k, { key: k, x: -W / 2 + ((k % 64) + 0.5) * CH, z: -D / 2 + (Math.floor(k / 64) + 0.5) * CH, low: null, verts: v, mesh: null });
    // colliders
    let body = null; try { body = fixedBody(s, ctx.cols); } catch (e) { console.warn('[interiors] colliders', e); }
    // nav + points
    active += performance.now() - ly; yield; ly = performance.now();
    const nav = buildNav(L);
    const pts = [];
    for (const p of pois) { const q = nav.freeReachable(p.x, p.z); if (q) pts.push({ ...q, ry: p.ry, tag: p.tag }); }
    const seats = []; for (const st of L.seats) { if (st.dance) { const q = nav.freeReachable(st.x, st.z); if (q) seats.push({ ...st, x: q.x, z: q.z }); } else seats.push(st); }
    if (!pts.length) for (let i = 0; i < 6; i++) { const q = nav.freeReachable((R() - 0.5) * W * 0.7, (R() - 0.5) * D * 0.7); if (q) pts.push({ ...q, ry: 0 }); }
    const pay = pts.filter((p) => p.tag === 'pay');
    s.items = items;
    s.counterPos = s.toWorld(L.counterPos.x, L.counterPos.z);
    if (s.shell && !s.facade) addFacade(s, grp, D / 2 + (s.sf.wallT ?? 0.03));
    s.built = { grp, meshes, lowGroup, chunks, body, ctx, L, nav, pts, pay, seats, panel, panelMesh, disposables, batch: ctx.batch, stepper: null, stepKey: null, people: [], staff: [], anim: ctx.anim, visible: true, ms: 0 };
    active += performance.now() - ly; s.built.ms = active; s.built.wall = performance.now() - t0; s.built.prof = prof;
    scene.add(grp);
    applyOpen(s, true);
    return s.built;
  }
  // Rapier bodies are only ever removed from update() (render frame, outside world.step / fixedHooks),
  // and via a small queue so a burst of disposals never removes many bodies in one frame.
  const deadBodies = [];
  const killBody = (b) => { if (b) deadBodies.push(b); };
  function flushBodies(max = 4) { for (let i = 0; i < max && deadBodies.length; i++) { const b = deadBodies.shift(); try { if (!world.bodies?.contains || world.bodies.contains(b.handle)) world.removeRigidBody(b); } catch (e) { console.warn('[interiors] removeRigidBody', e); } } }
  function hideInterior(s) { const b = s.built; if (!b || !b.visible) return; b.visible = false; b.grp.visible = false; if (b.body) { killBody(b.body); b.body = null; } releasePeople(s); dropProducts(s); }
  function showInterior(s) { const b = s.built; if (!b || b.visible) return; b.visible = true; b.grp.visible = true; try { b.body = fixedBody(s, b.ctx.cols); } catch (e) { /* */ } }
  function disposeInterior(s) {
    const b = s.built; if (!b) return;
    hideInterior(s);
    b.grp.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.geometry?.dispose?.(); });
    for (const d of b.disposables) if (d.isBufferGeometry) d.dispose();
    scene.remove(b.grp);
    if (s.shell && s.facade) { // facade lives in the interior group for shells
      s.facade.signText?.geometry?.dispose?.();
      if (s.facade.doorBody) killBody(s.facade.doorBody);
      s.facade = null;
    }
    s.built = null; s.items = [];
  }
  function dropChunk(b, c) { if (c.mesh) { b.grp.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; } if (c.low) c.low.visible = true; }
  function dropProducts(s) { const b = s.built; if (!b) return; for (const c of b.chunks.values()) dropChunk(b, c); b.stepper = null; b.stepKey = null; }
  let stepped = false;
  function updateProducts(s, pp) {
    const b = s.built; const lp = s.toLocal(pp.x, pp.z);
    const cand = [...b.chunks.values()]; for (const c of cand) c.d = Math.hypot(lp.x - c.x, lp.z - c.z); cand.sort((a, c) => a.d - c.d);
    let sum = 0; for (const c of cand) { c.want = c.verts > 0 && c.d < PROD_R && (sum === 0 || sum + c.verts <= PROD_BUDGET); if (c.want) sum += c.verts; }
    for (const c of cand) if (c.mesh && !c.want && (c.d > PROD_R + 2.5 || sum > PROD_BUDGET)) dropChunk(b, c);
    if (b.stepper && !b.chunks.get(b.stepKey)?.want) { b.stepper = null; b.stepKey = null; }
    if (!stepped) {
      if (!b.stepper) { const c = cand.find((x) => x.want && !x.mesh); if (c) { b.stepper = b.batch.stepper(M.atlas, 40000, c.key); b.stepKey = c.key; } }
      if (b.stepper) { stepped = true; const m = b.stepper(); if (m) { const c = b.chunks.get(b.stepKey); c.mesh = m; b.grp.add(m); if (c.low) c.low.visible = false; atlasSync(); b.stepper = null; } else if (m === false) b.stepper = null; }
    }
  }

  // ---------------------------------------------------------------- people
  const freeChars = {}; let charCount = 0, charThrottle = 0; // class key `${gender}:${outfit}` -> pooled characters
  function acquire(cls, seedBase) {
    const fl = (freeChars[cls] ||= []); if (fl.length) return fl.pop();
    if (charThrottle > 0) return null;
    if (charCount >= MAX_CHARS) { for (const k of Object.keys(freeChars)) if (freeChars[k].length) return freeChars[k].pop(); return null; }
    const [gender, outfit] = cls.split(':'); const seed = seedFor(seedBase, gender === 'f');
    const char = createCharacter(game, { variant: 'ped', seed, outfit, zone: outfit, gender, beach: outfit === 'beach' });
    scene.add(char.root); charCount++; charThrottle = 4;
    const p = { char, cls, x: 0, z: 0, heading: 0, speed: 0, route: [], wait: 0, body: null, head: char.getBone?.('Head') || null, armL: char.getBone?.('LeftArm') || null, armR: char.getBone?.('RightArm') || null };
    try { p.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -80, 0)); world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.28).setFriction(0.5), p.body); } catch (e) { /* */ }
    return p;
  }
  function park(p) { p.char.setVisible(false); p.char.root.visible = false; if (p.body) p.body.setNextKinematicTranslation({ x: 0, y: -80, z: 0 }); }
  function release(p) { park(p); p.store = null; p.route = []; p.flee = false; freeChars[p.cls].push(p); }
  function releasePeople(s) { const b = s.built; if (!b) return; for (const p of b.people) release(p); for (const p of b.staff) release(p); b.people = []; b.staff = []; if (s.clerk) s.clerk = null; }
  function patronClass(s, R) {
    const d = s.def.demo || {}; const female = R() < (d.female ?? 0.45);
    const h = game.timeOfDay ?? 12, night = h > 20 || h < 4;
    let outfit = 'casual';
    if (R() < (d.beach ?? (s.zone === 'beach' ? 0.6 : 0))) outfit = 'beach';
    else if (R() < (d.business ?? ((s.zone === 'downtown' || s.zone === 'business') && !night ? 0.45 : 0))) outfit = 'business';
    else if (s.type === 'bar' || s.type === 'club' || (s.zone === 'nightlife' && night)) outfit = 'nightlife';
    else if (s.type === 'sport') outfit = 'sport';
    return (female ? 'f' : 'm') + ':' + outfit;
  }
  function place(s, p) {
    const w = s.toWorld(p.x, p.z, tmpV);
    p.char.root.position.set(w.x, w.y + s.FY + (p.bob || 0), w.z); p.char.root.rotation.y = s.facing + p.heading;
    if (p.body) p.body.setNextKinematicTranslation({ x: w.x, y: w.y + 0.9 + s.FY, z: w.z });
  }
  const outside = (s) => ({ x: s.doorX + (Math.random() - 0.5) * 1.5, z: s.D / 2 + 2.5 });
  function routeTo(s, p, tx, tz) {
    const b = s.built; const inside = p.z < s.D / 2 - 0.2;
    const pts = [];
    if (!inside) pts.push({ x: s.doorX, z: s.D / 2 + 0.6 }, { ...b.nav.door });
    const from = inside ? p : b.nav.door;
    const path = b.nav.path(from.x, from.z, tx, tz) || [{ x: tx, z: tz }];
    p.route = pts.concat(path);
  }
  function chooseActivity(s, p) {
    const b = s.built; const R = Math.random;
    if (p.leaving) { const o = outside(s); routeTo(s, p, b.nav.door.x, b.nav.door.z); p.route.push({ x: s.doorX, z: s.D / 2 + 0.6 }, o); p.exit = true; return; }
    const seatsFirst = /restaurant|cafe|bar|club|icecream|laundromat|barber|bank/.test(s.type);
    if (seatsFirst && b.seats.length && R() < 0.75) {
      const free = b.seats.filter((x) => !x.taken); if (free.length) { const st = free[Math.floor(R() * free.length)]; st.taken = p; p.seat = st; routeTo(s, p, st.x, st.z); p.next = 'sit'; return; }
    }
    const visits = (p.visits = (p.visits || 0) + 1);
    if (visits > 3 + Math.floor(R() * 3) && b.pay.length) { const t = b.pay[Math.floor(R() * b.pay.length)]; routeTo(s, p, t.x, t.z); p.next = 'pay'; return; }
    const t = b.pts[Math.floor(R() * b.pts.length)]; if (!t) return; p.target = t; routeTo(s, p, t.x, t.z); p.next = 'browse';
  }
  function stepPerson(s, p, dt, night) {
    if (p.wait > 0) {
      p.wait -= dt; p.speed = 0;
      if (p.dancing) { p.bob = Math.abs(Math.sin(performance.now() / 260 + p.phase)) * 0.08; p.heading += Math.sin(performance.now() / 700 + p.phase) * dt * 1.5; }
      if (p.wait > 0) return;
      p.bob = 0; p.dancing = false;
      if (p.seat) { p.seat.taken = null; p.seat = null; }
      if (p.next === 'leave-after') p.leaving = true;
      chooseActivity(s, p); return;
    }
    if (!p.route.length) {
      if (p.exit) { p.gone = true; return; }
      if (p.next === 'sit' && p.seat) { p.heading = p.seat.ry ?? p.heading; p.wait = p.seat.dance ? 10 + Math.random() * 25 : 15 + Math.random() * 40; p.dancing = !!p.seat.dance && night; p.phase = Math.random() * 6; if (Math.random() < 0.35) p.next = 'leave-after'; else p.next = null; return; }
      if (p.next === 'pay') { p.wait = 3 + Math.random() * 3; p.heading = (p.target?.ry ?? p.heading); p.next = 'leave-after'; return; }
      if (p.target) p.heading = p.target.ry ?? p.heading;
      p.wait = 2 + Math.random() * 6; p.next = null; return;
    }
    const tgt = p.route[0]; const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
    const sp = p.flee ? 4.2 : 1.15;
    if (d < 0.1) { p.route.shift(); return; }
    const v = Math.min(sp, d / Math.max(dt, 1e-3)); p.x += (dx / d) * v * dt; p.z += (dz / d) * v * dt; p.speed = sp;
    let dh = Math.atan2(dx, dz) - p.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); p.heading += dh * Math.min(1, dt * 10);
  }
  function panic(s) {
    const b = s.built; if (!b) return;
    for (const p of b.people) { if (p.flee || p.gone) continue; p.flee = true; p.wait = Math.random() * 0.3; p.dancing = false; if (p.seat) { p.seat.taken = null; p.seat = null; } routeTo(s, p, b.nav.door.x, b.nav.door.z); p.route.push({ x: s.doorX, z: s.D / 2 + 0.8 }, { x: s.doorX + (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4), z: s.D / 2 + 7 }); p.exit = true; }
  }
  function updatePeople(s, dt, hour, night, pl) {
    const b = s.built; if (!b) return;
    const R = Math.random;
    // staff
    const wantStaff = s.open ? Math.min(b.L.clerks.length, 4) : (s.seed % 2 === 0 ? 1 : 0);
    while (b.staff.length < wantStaff && !b.spawnedThisFrame) {
      const c = b.L.clerks[b.staff.length]; const p = acquire((R() < 0.5 ? 'f' : 'm') + ':' + (/bank|jewelry|electronics/.test(s.type) ? 'business' : s.type === 'club' ? 'nightlife' : 'casual'), s.seed + 7 + b.staff.length * 17); if (!p) break;
      p.store = s; p.x = c.x; p.z = c.z; p.heading = c.ry; p.role = c.role || 'clerk'; p.home = c; p.route = []; p.wait = 0; p.gone = false; p.char.setVisible(true); p.char.root.visible = true;
      b.staff.push(p); b.spawnedThisFrame = true;
    }
    while (b.staff.length > wantStaff) release(b.staff.pop());
    s.clerk = b.staff[0] || null;
    for (const c of b.staff) {
      if (!s.open) { // cleaner wanders
        if (!c.route.length && c.wait <= 0) { const t = b.pts[Math.floor(R() * b.pts.length)]; if (t) routeTo(s, c, t.x, t.z); c.wait = 0; }
        stepPerson(s, c, dt * 0.6, night); if (c.wait <= 0 && !c.route.length) c.wait = 3 + R() * 5;
      } else {
        c.x = c.home.x; c.z = c.home.z; c.heading = c.home.ry; c.speed = 0;
        c.bob = c.role === 'dj' && night ? Math.abs(Math.sin(performance.now() / 240)) * 0.06 : 0;
      }
      place(s, c);
      c.char.update(dt, { speed: c.speed, grounded: true });
      if (s.open && c.head && s.dist < 15 && c === s.clerk) { let a = Math.atan2(pl.x - c.x, pl.z - c.z) - c.heading; a = Math.atan2(Math.sin(a), Math.cos(a)); c.head.rotation.y += THREE.MathUtils.clamp(a, -1.0, 1.0) * 0.8; }
      if (c === s.clerk && (s.robbery || (s.robbed && s.alarmT > 0)) && c.armL && c.armR) { c.armL.rotation.z += 1.3; c.armR.rotation.z -= 1.3; c.armL.rotation.x -= 0.4; c.armR.rotation.x -= 0.4; }
    }
    // patrons
    const area = s.W * s.D; const cap = Math.min(s.def.patrons, Math.floor(area / 10) + 1);
    const want = s.open && !s.robbed && !s.robbery ? Math.round(cap * busyFactor(hour, s.def.busy)) : 0;
    const active = b.people.filter((p) => !p.gone && !p.flee).length;
    b.spawnT = (b.spawnT || 0) - dt;
    if (active < want && b.spawnT <= 0 && !b.spawnedThisFrame) {
      const sr = srng(s.seed + (b.spawnN = (b.spawnN || 0) + 1) * 13);
      const p = acquire(patronClass(s, sr), s.seed + 101 + b.spawnN * 29);
      if (p) {
        p.store = s; p.gone = false; p.flee = false; p.exit = false; p.leaving = false; p.visits = 0; p.seat = null; p.next = null; p.wait = 0;
        // first arrivals appear already inside; later ones walk in from the street
        const t = b.people.length < want && !b.warm ? b.pts[Math.floor(R() * b.pts.length)] : null;
        if (t) { p.x = t.x; p.z = t.z; p.heading = t.ry || 0; p.wait = R() * 4; } else { const o = outside(s); p.x = o.x; p.z = o.z; p.heading = Math.PI; chooseActivity(s, p); }
        p.char.setVisible(true); p.char.root.visible = true; b.people.push(p); b.spawnedThisFrame = true;
      }
      b.spawnT = b.warm ? 3 + R() * 6 : 0;
    }
    if (active >= want) b.warm = true;
    for (let i = b.people.length - 1; i >= 0; i--) {
      const p = b.people[i];
      if (!p.leaving && active > want + 1 && !p.flee && R() < dt * 0.05) p.leaving = true;
      stepPerson(s, p, dt, night);
      if (p.gone) { if (p.seat) p.seat.taken = null; release(p); b.people.splice(i, 1); continue; }
      place(s, p);
      p.char.update(dt, { speed: p.speed, grounded: true, sprint: !!p.flee });
    }
  }

  // ---------------------------------------------------------------- interactions
  const notify = (t, ms = 2500) => { try { game.hud?.notify?.(t, ms); } catch (e) { /* */ } };
  let helpShown = null;
  const setHelp = (t) => { if (t === helpShown) return; helpShown = t; try { game.hud?.help?.(t); } catch (e) { /* */ } };
  const clerkSees = (s) => {
    const c = s.clerk; const P = game.player; if (!c || !s.open) return false;
    const cw = s.toWorld(c.x, c.z); cw.y += 1.6 + s.FY;
    const tx = P.position.x - cw.x, tz = P.position.z - cw.z, ty = P.position.y + 1.5 - cw.y; const dist = Math.hypot(tx, ty, tz); if (dist > 16) return false;
    const fx = Math.sin(s.facing + c.heading), fz = Math.cos(s.facing + c.heading); if ((tx * fx + tz * fz) / Math.hypot(tx, tz) < -0.35) return false;
    try { const hit = world.castRay(new RAPIER.Ray(cw, { x: tx / dist, y: ty / dist, z: tz / dist }), dist, true, undefined, undefined, undefined, c.body); if (!hit) return true; if (P.collider && hit.collider?.handle === P.collider.handle) return true; return hit.timeOfImpact >= dist - 0.6; } catch (e) { return true; }
  };
  function startRobbery(s) {
    if (s.robbery || s.robbed || !s.open || !s.clerk || s.type === 'club') return;
    s.robbery = { t: 0, paid: false };
    notify(s.type === 'bank' ? 'Teller: "Please, take it, just don\'t shoot!"' : 'Clerk: "Okay, okay! Don\'t hurt me!"', 2500);
    try { game.audio?.play?.('scream', { position: s.center }); } catch (e) { /* */ }
    panic(s);
  }
  try { game.on?.('punch', (e) => { const s = current; if (!s || !e?.position) return; if (Math.hypot(e.position.x - s.counterPos.x, e.position.z - s.counterPos.z) < 2.4) startRobbery(s); }); } catch (e) { /* */ }
  try { game.on?.('shot', () => { const s = current; if (s) { panic(s); startRobbery(s); } }); } catch (e) { /* */ }

  function interact(s, pp, P) {
    let help = null;
    if (!(s.open && s.clerk)) return null;
    if (P.aiming && P.weapon && P.weapon !== 'fist' && !s.robbery && !s.robbed) {
      const cw = s.toWorld(s.clerk.x, s.clerk.z); const dx = cw.x - pp.x, dz = cw.z - pp.z, dist = Math.hypot(dx, dz);
      const yaw = game.cameraYaw ?? P.heading; const ax = -Math.sin(yaw), az = -Math.cos(yaw), fx = Math.sin(P.heading), fz = Math.cos(P.heading);
      if (dist < 14 && Math.max(ax * dx + az * dz, fx * dx + fz * dz) / dist > 0.85) startRobbery(s);
    }
    if (s.robbery && !s.robbery.paid) return s.type === 'bank' ? 'Keep them covered… the teller is filling the bag' : 'Keep it on the clerk… emptying the register';
    let best = null, bd = 1.3;
    for (const it of s.items) { const d = Math.hypot(pp.x - it.pos.x, pp.z - it.pos.z); if (d < bd) { bd = d; best = it; } }
    if (!best) return null;
    help = best.action?.smash ? (best.smashed ? `${best.name}: case smashed` : `E  Ask about ${best.name} $${best.price}    G  Smash case`) : best.price === 0 ? `E  Use ${best.name}` : `E  Buy ${best.name} $${best.price}    G  Steal`;
    const inp = game.input;
    if (inp?.pressed?.('KeyE')) {
      if (best.action?.smash) notify(`${best.name}: $${best.price}. Not today? (G smashes the case)`);
      else if (best.price === 0) notify('Card declined. Try robbing the place instead.');
      else if ((P.money || 0) >= best.price) {
        P.money -= best.price; const a = best.action;
        if (a?.gun) { try { if (game.weapons?.give) game.weapons.give(a.gun, a.ammo); else { P.weapon = a.gun; P.ammo = P.ammo || {}; P.ammo[a.gun] = (P.ammo[a.gun] || 0) + a.ammo; } } catch (e) { console.warn(e); } }
        if (a?.ammo && !a.gun) { try { if (game.weapons?.buyAmmo) game.weapons.buyAmmo(a.ammo, a.n); else { P.ammo = P.ammo || {}; P.ammo[a.ammo] = (P.ammo[a.ammo] || 0) + a.n; } } catch (e) { console.warn(e); } }
        if (a?.armor) P.armor = Math.max(P.armor || 0, a.armor);
        if (best.heal) P.health = Math.min(100, (P.health || 0) + best.heal);
        notify(`Bought ${best.name} -$${best.price}${best.heal ? '  +' + best.heal + ' health' : ''}`);
        try { game.audio?.play?.('cash', { position: best.pos }); } catch (e) { /* */ }
      } else notify('Not enough cash');
    } else if (inp?.pressed?.('KeyG') && best.action?.smash) {
      if (best.smashed) notify('Case already smashed');
      else { best.smashed = true; const cash = 400 + Math.floor(Math.random() * 1100); P.money = (P.money || 0) + cash; notify(`Smashed the case: +$${cash} in jewelry`, 3000); try { game.audio?.play?.('glass', { position: best.pos }); } catch (e) { /* */ } try { game.emit?.('crime', { type: 'robbery', position: pp.clone(), severity: 2, witnessed: true }); } catch (e) { /* */ } panic(s); s.alarmT = 6; }
    } else if (inp?.pressed?.('KeyG') && best.price > 0) {
      if (clerkSees(s)) { notify('Clerk: "Hey! Put that back! I\'m calling the cops!"', 3000); s.alarmT = 3; try { game.emit?.('crime', { type: 'shoplift', position: pp.clone(), severity: 1, witnessed: true }); } catch (e) { /* */ } }
      else { if (best.heal) P.health = Math.min(100, (P.health || 0) + best.heal); notify(`Pocketed ${best.name}${best.heal ? '  +' + best.heal + ' health' : ''}`); }
    }
    return help;
  }

  // ---------------------------------------------------------------- frame update
  const lights = [new THREE.PointLight(0xfff1dc, 0, 16, 1.4), new THREE.PointLight(0xfff1dc, 0, 16, 1.4)];
  lights.forEach((l) => scene.add(l));
  let absH = 0, lastTod = null, scanT = 0, pollT = 0, lastInside = null, pending = null;
  let nearList = [];
  // warm product templates + atlas labels a few ms per frame so the first store doesn't hitch
  const warm = []; { const seen = new Set(); const addK = (k, n) => { for (let v = 0; v < n; v++) { const key = k + ':' + v; if (!seen.has(key)) { seen.add(key); warm.push([k, v]); } } };
    for (const mix of Object.values(MIX)) for (const [k, n] of mix) addK(k, n);
    for (const [k, n] of [['garment', 13], ['dress', 13], ['shirts', 6], ['shoe', 12], ['tee', 4], ['tvbox', 3], ['plate', 3], ['mug', 1], ['glassware', 1], ['tub', 7], ['pastry', 4], ['donut', 4], ['cups', 1], ['candy', 5], ['postcard', 4], ['mag', 6], ['blister', 4], ['ammo', 4], ['pistol', 1], ['rifle', 2], ['vest', 1], ['ring', 2], ['necklace', 2], ['watch', 2], ['guitar', 2], ['tire', 1], ['produce', 7], ['bananas', 1], ['wineLying', 5], ['perfume', 4], ['lipstick', 2], ['palette', 5], ['sunglasses', 2], ['flamingo', 1], ['snowglobe', 2], ['detergent', 3], ['beer', 5], ['napkin', 1], ['menu', 2], ['cash', 1], ['bulbs', 3], ['shoebox', 4], ['hat', 3], ['purse', 6], ['sauce', 4], ['coffeebag', 3], ['bottlecleaner', 5], ['pillbottle', 6], ['tea', 3], ['paint', 4]]) addK(k, n); }
  const posterCats = ['cereal', 'soda', 'liquor', 'pharm', 'tech', 'mag', 'beauty', 'souvenir', 'coffee', 'sauce', 'energy', 'icecream'];
  function prewarm(ms) { const t = performance.now(); while (warm.length && performance.now() - t < ms) { const [k, v] = warm.shift(); try { productGeo(k, v); } catch (e) { /* */ } } if (!warm.length && !prewarm.done) { prewarm.done = true; atlasSync(); } }
  function atlasSync() { const A = getAtlas(); if (A.dirty) { A.dirty = false; A.tex.needsUpdate = true; } }
  // ---- load time: draw every label, build every shared material, compile + upload behind the loading screen ----
  prewarm(1e9); for (const c of posterCats) for (let v = 0; v < 5; v++) getAtlas().label(c, v, { art: ['face', 'circle', 'wave'][v % 3], sub: ['NEW', 'SALE', '2 FOR 1', 'FRESH'][v % 4] }); atlasSync(); glyphAtlas();
  const warmMats = [...Object.values(M).flat().filter((m) => m && m.isMaterial), ...Object.values(panelMats()), ...Object.values(floorMats(floorTex)), danceMat(), ...screenMats];
  for (const t of Object.values(TYPES)) { warmMats.push(stdMat(trimHex(t), 0.55), glowMat(new THREE.Color(t.neon).multiplyScalar(2.2))); for (let k = 0; k < 7; k++) warmMats.push(stdMat(wallHex(t, k), 0.9)); }
  for (const h of [...VINYL]) warmMats.push(stdMat(h, 0.45)); for (const h of TABLE) warmMats.push(stdMat(h, 0.4)); for (const h of CHAIR) warmMats.push(stdMat(h, 0.6));
  for (const c of GARMENT_COLORS) warmMats.push(stdMat(new THREE.Color(c).getHex(), 0.7));
  for (const st of ['#ffffff', '#1d3557']) warmMats.push(stdMat(new THREE.Color(st).getHex(), 0.8));
  let unwarm = null; try { unwarm = warmup(game, warmMats); } catch (e) { console.warn('[interiors] warmup', e); }
  let warmFrames = 0;
  function update(dt) {
    const P = game.player; if (!P) return;
    if (unwarm && ++warmFrames > 90) { unwarm(); unwarm = null; }
    if (warm.length) prewarm(2.5);
    if (deadBodies.length) flushBodies();
    if (charThrottle > 0) charThrottle--;
    const pp = P.position; const hour = game.timeOfDay ?? 12; const night = hour < 6.5 || hour > 18.5;
    if (lastTod != null) { let dh = hour - lastTod; if (dh < -12) dh += 24; if (Math.abs(dh) < 1) absH += dh; }
    lastTod = hour;
    pollT -= dt; if (pollT <= 0) { pollT = 1; ingest(); }
    scanT -= dt; if (scanT <= 0) { scanT = 0.25; nearList = near(pp.x, pp.z, DISPOSE_R + 20); for (const s of nearList) s.dist = Math.hypot(pp.x - s.center.x, pp.z - s.center.z); nearList.sort((a, b) => a.dist - b.dist); }
    else for (const s of nearList) s.dist = Math.hypot(pp.x - s.center.x, pp.z - s.center.z);

    // build / show / hide / dispose (one heavy op per frame)
    // only the MAX_ACTIVE nearest storefronts within ACTIVE_R get a live interior (dense Miami blocks have dozens)
    const wanted = new Set(); for (const s of nearList) { if (s.dist >= ACTIVE_R || wanted.size >= MAX_ACTIVE) break; if (!s.failed) wanted.add(s); }
    for (const s of wanted) {
      if (!s.built) { if (!pending && hasShell(s)) { refreshShellFields(s); pending = { s, it: buildInteriorGen(s) }; } }
      else if (!s.built.visible) showInterior(s);
    }
    const built = list.filter((s) => s.built);
    for (const s of built) { if (!nearList.includes(s)) s.dist = Math.hypot(pp.x - s.center.x, pp.z - s.center.z); if (s.built.visible && (s.dist > DISPOSE_R || (!wanted.has(s) && s.dist > 25 && !s.isInside(pp)))) { hideInterior(s); s.lastSeen = performance.now(); } }
    const hidden = built.filter((s) => s.built && !s.built.visible).sort((a, b) => b.dist - a.dist);
    while (hidden.length > CACHE) disposeInterior(hidden.shift());

    if (pending) { // incremental build, ~5 ms per frame
      const t = performance.now();
      try { while (performance.now() - t < 5) { const r = pending.it.next(); if (r.done) { pending = null; break; } } } catch (e) { console.warn('[interiors] build failed', pending.s.name, e); pending.s.failed = true; pending = null; }
    }
    // detail set: nearest few built + visible
    const detail = built.filter((s) => s.built?.visible && (s.dist < DETAIL_R || s.isInside(pp))).sort((a, b) => a.dist - b.dist).slice(0, MAX_DETAIL);
    stepped = false;
    for (const s of built) {
      const b = s.built; if (!b || !b.visible) continue;
      const isDetail = detail.includes(s);
      b.spawnedThisFrame = false;
      // open/closed
      if (s.robbed && absH > s.robbedUntil) s.robbed = false;
      const open = isOpenAt(hour, s.hours); if (open !== s.open) { s.open = open; applyOpen(s); }
      if (s.facade) setSign(s, s.open ? (night ? 1.7 : 1.05) : 0.22);
      if (isDetail) {
        updateProducts(s, pp);
        for (const a of b.anim) a(dt, night);
        updatePeople(s, dt, hour, night, s.toLocal(pp.x, pp.z));
      } else { if (b.people.length || b.staff.length) releasePeople(s); if (b.stepper || [...b.chunks.values()].some((c) => c.mesh)) dropProducts(s); }
      if (s.alarmT > 0) s.alarmT -= dt;
    }
    // sliding doors. They never close onto anyone: the doorway volume (gap ±0.6 m deep) is probed for any
    // non-static collider (player capsule, peds, cars); leaves are visual-only while moving and the closed-door
    // collider is only enabled when the store is closed, the leaves are fully shut and the doorway is empty.
    for (const s of nearList) {
      if (!s.facade || s.dist > 40) continue;
      const fz = s.facade.doorZ ?? s.D / 2;
      const loc = s.toLocal(pp.x, pp.z); const inVeh = !!P.state?.inVehicle;
      const dx = loc.x - s.doorX, dz = loc.z - fz, dPlayer = Math.hypot(dx, dz);
      const insideSide = dz < 0 && Math.abs(dx) < s.W / 2 && loc.z > -s.D / 2;
      const wide = doorwayOccupied(s, fz, 0.6); const thin = s.locked ? ((!inVeh && Math.abs(dx) < s.doorW / 2 && Math.abs(dz) < 0.15) || doorwayOccupied(s, fz, 0.01, true)) : wide;
      const occupied = s.locked ? thin : wide; // locked doors only yield to something actually embedded in them
      let wantOpen = 0;
      if (!inVeh && dPlayer < 3 && (s.open || insideSide)) wantOpen = 1; // closed stores still let you out
      if (!inVeh && dPlayer < 1.5) wantOpen = Math.max(wantOpen, s.open || insideSide ? 1 : 0);
      if (occupied) wantOpen = 1;
      if (s.built) for (const p of s.built.people) if (Math.hypot(p.x - s.doorX, p.z - fz) < 2.2) wantOpen = 1;
      s.doorOpen += Math.sign(wantOpen - s.doorOpen) * Math.min(Math.abs(wantOpen - s.doorOpen), dt * 2.5);
      for (const d of s.facade.doors) d.position.x = s.doorX + d.userData.side * (s.doorW / 4 + s.doorOpen * s.doorW / 2 * 0.98);
      const lock = !s.open && s.doorOpen <= 0.001 && !(s.locked ? thin : wide) && !(dPlayer < 1.5 && !inVeh && insideSide);
      if (s.facade.doorCol && s.locked !== lock) { s.locked = lock; try { s.facade.doorCol.setEnabled(lock); } catch (e) { /* */ } }
      // safety net: never leave the player embedded in the doorway of a locked door
      if (s.locked && !inVeh && Math.abs(dx) < s.doorW / 2 + 0.2 && Math.abs(dz) < 0.45 && Math.abs(pp.y - s.baseY) < 2.5) pushOut(s, loc, fz, dz);
      if (!s.open) setSign(s, 0.22);
    }
    // robbery progress
    for (const s of detail) {
      if (!s.robbery) continue;
      s.robbery.t += dt;
      const inside = s.isInside(pp);
      if (!inside && s.robbery.t > 0.5 && !s.robbery.paid) s.robbery = null;
      else if (s.robbery.t > 3 && !s.robbery.paid) {
        s.robbery.paid = true; const bank = s.type === 'bank'; const cash = bank ? 2000 + Math.floor(Math.random() * 4000) : 200 + Math.floor(Math.random() * 700);
        P.money = (P.money || 0) + cash; notify(`Robbed ${s.name}: +$${cash}`, 3000);
        try { game.audio?.play?.('cash', { position: s.counterPos }); } catch (e) { /* */ }
        try { game.emit?.('crime', { type: 'robbery', position: s.counterPos.clone(), severity: bank ? 4 : 2, witnessed: true }); } catch (e) { /* */ }
        s.robbed = true; s.robbedUntil = absH + 5; s.alarmT = 8;
      } else if (s.robbery.paid && s.robbery.t > 6) s.robbery = null;
    }
    // lights: nearest open detailed store
    const ls = detail.find((s) => s.open);
    if (ls) { const a = ls.toWorld(0, -ls.D / 4), c = ls.toWorld(0, ls.D / 4); lights[0].position.set(a.x, ls.baseY + ls.H - 1.0, a.z); lights[1].position.set(c.x, ls.baseY + ls.H - 1.0, c.z); const k = Math.min(30, 10 + ls.W * ls.D / 12); lights.forEach((l) => { l.intensity = k; l.distance = Math.max(ls.W, ls.D) * 0.9; }); }
    else lights.forEach((l) => { l.intensity = 0; });

    // inside detection, notify, indoor flag, interactions
    let inside = null; if (!P.state?.inVehicle) for (const s of nearList) { if ((s.built || !s.shell) && s.dist < Math.max(s.W, s.D) && s.isInside(pp)) { inside = s; break; } }
    if (inside && inside !== lastInside) notify(inside.open ? inside.name : `${inside.name} (closed)`, 2000);
    lastInside = inside; current = inside; api.current = inside;
    const indoor = !!inside;
    if (P.state && P.state.indoor !== indoor) { P.state.indoor = indoor; try { game.env?.setIndoor?.(indoor); } catch (e) { /* */ } }
    setHelp(inside && inside.built ? interact(inside, pp, P) : null);
  }

  ingest();
  const api = { list, update, current: null, get fitStats() { return fitStats; }, stats: () => ({ stores: list.length, built: list.filter((s) => s.built).length, chars: charCount, prodVerts: list.reduce((a, s) => a + (s.built ? [...s.built.chunks.values()].reduce((b, c) => b + (c.mesh ? c.verts : 0), 0) : 0), 0) }) };
  return api;
}

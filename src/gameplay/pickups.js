// GTA-style pickups: the real weapon model (the user's library models, src/gameplay/gunModels.js) turning slowly just
// above the ground with a soft rim glow and a faint ground halo; no light beams. Also ammo, armor, health, cash.
// Caches + starter stash.  game.pickups.list -> [{ pos, type, key, mapIcon, active }]  (HUD draws mapIcon when non-null)
import * as THREE from 'three';
import { rand, pick, pointNear, sfx, tryCall, distXZ, groundAt, sharedBox } from './util.js';
import { buildWeaponModel, libVariants } from './gunModels.js';
import { createCellStreamer } from './stream.js';
import { WEAP } from './weapons.js';

export { buildWeaponModel };

const isWeapon = (t) => !!WEAP[t] && t !== 'fist';
// warm amber for guns, softer gold for melee, cool tones for the rest (rim glow + halo)
const COLOR = (t) => (isWeapon(t) ? (t === 'grenade' || t === 'molotov' ? 0xff8a4a : WEAP[t].melee ? 0xffd9a0 : 0xffc070) : { armor: 0x6ab4ff, health: 0x6dff9a, cash: 0x9dff6a, ammo: 0xffd27a }[t] ?? 0xffffff);
const LABEL = (t) => (isWeapon(t) ? WEAP[t].name : { armor: 'Body armor', health: 'First-aid kit', cash: 'Cash', ammo: 'Ammo' }[t] || t);
const ICON = (t) => (isWeapon(t) ? 'weapon' : t);
const HOVER = 0.3;   // model center above the ground (m)

function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(sharedBox(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; }
const _protos = new Map();
function pickupModel(type, color) { // non-weapon prototypes are shared; weapons are library models (shared geometry + materials)
  if (isWeapon(type)) return buildPickupModel(type, color);
  let p = _protos.get(type);
  if (!p) { p = buildPickupModel(type, color); _protos.set(type, p); }
  return p.clone();
}
// rim glow: additive fresnel shell drawn over the model's own geometry
const _rimMats = new Map();
function rimMat(color) {
  let m = _rimMats.get(color);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uI; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = pow(f, 3.2) * 0.75; gl_FragColor = vec4(uColor * f * uI, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, depthFunc: THREE.LessEqualDepth, toneMapped: false,
    });
    m.userData.noWet = true; _rimMats.set(color, m);
  }
  return m;
}
function addRim(root, color) {
  const mat = rimMat(color), add = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.rim && o.material !== mat) add.push(o); });
  for (const o of add) { const r = new THREE.Mesh(o.geometry, mat); r.userData.rim = true; r.renderOrder = 4; r.castShadow = false; o.add(r); o.userData.rimmed = true; }
}
function buildPickupModel(type, color) {
  const g = new THREE.Group();
  const glowMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4 });
  if (isWeapon(type)) {
    const vars = libVariants(type);
    const w = buildWeaponModel(type, { variant: vars ? vars[(Math.random() * vars.length) | 0] : undefined });
    const d = WEAP[type], small = d.cls === 'handgun' || type === 'microsmg' || type === 'knife' || type === 'grenade';
    w.scale.setScalar(small ? 1.25 : 1.06);
    g.userData.weapon = w; g.userData.variant = w.userData.lib || null;
    g.add(w);
  } else if (type === 'armor') {
    g.add(box(0.42, 0.5, 0.14, new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.8 })));
    g.add(box(0.3, 0.12, 0.15, glowMat, 0, 0.1, 0.005));
  } else if (type === 'health') {
    g.add(box(0.42, 0.3, 0.22, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 })));
    const red = new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xff2a3a, emissiveIntensity: 1.2 });
    g.add(box(0.24, 0.07, 0.23, red)); g.add(box(0.07, 0.24, 0.23, red));
  } else if (type === 'cash') {
    const bill = new THREE.MeshStandardMaterial({ color: 0x6fbf5a, emissive: 0x2f7f2a, emissiveIntensity: 0.8, roughness: 0.7 });
    for (let i = 0; i < 3; i++) g.add(box(0.3, 0.06, 0.14, bill, (i - 1) * 0.05, i * 0.065 - 0.06, (i % 2) * 0.03));
    g.add(box(0.04, 0.2, 0.15, new THREE.MeshStandardMaterial({ color: 0xe8d070, roughness: 0.5 })));
  } else {
    g.add(box(0.36, 0.22, 0.2, new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.7 })));
    g.add(box(0.37, 0.05, 0.21, glowMat));
    for (let i = 0; i < 4; i++) g.add(box(0.03, 0.08, 0.03, new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.9, roughness: 0.3 }), -0.1 + i * 0.065, 0.15, 0));
  }
  if (!isWeapon(type)) addRim(g, color);
  return g;
}
// weapon pickups: center the model on its pivot (after the library model loads) and add the rim glow
function settleWeapon(p) {
  const w = p.model.userData.weapon; if (!w || p.settled) return;
  if (!w.userData.libReady && w.userData.lib) return;          // still the stand-in: wait for the real model
  // center the model on the pickup's pivot (bounds measured in the pivot's own frame)
  w.position.set(0, 0, 0); w.rotation.set(0, 0, 0); p.root.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(w, true).getCenter(new THREE.Vector3());
  p.model.worldToLocal(c); w.position.copy(c).negate();
  addRim(w, p.color);
  p.settled = true; p.rimOn = undefined;
}
// soft ground halo
let haloTex = null;
function texes() {
  if (haloTex) return;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c); haloTex.colorSpace = THREE.SRGBColorSpace;
}
const _haloGeo = new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2);
const _haloMats = new Map();
function haloMat(color) {
  let m = _haloMats.get(color);
  if (!m) { texes(); m = new THREE.MeshBasicMaterial({ map: haloTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }); _haloMats.set(color, m); }
  return m;
}
const crateMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.85 });
// glint: a small four-point star that catches the eye every few seconds (readable from 10-15 m in daylight)
let glintTex = null;
const _glintMats = new Map();
function glintMat(color) {
  let m = _glintMats.get(color);
  if (!m) {
    if (!glintTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.12, 'rgba(255,255,255,0.7)'); r.addColorStop(0.35, 'rgba(255,255,255,0.08)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      g.globalCompositeOperation = 'lighter';
      for (const [w, h] of [[30, 1.6], [1.6, 30]]) { const l = g.createRadialGradient(32, 32, 0, 32, 32, 30); l.addColorStop(0, 'rgba(255,255,255,0.9)'); l.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = l; g.fillRect(32 - w, 32 - h, w * 2, h * 2); }
      glintTex = new THREE.CanvasTexture(c); glintTex.colorSpace = THREE.SRGBColorSpace;
    }
    m = new THREE.SpriteMaterial({ map: glintTex, color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
    _glintMats.set(color, m);
  }
  return m.clone();   // per pickup: each twinkles on its own beat
}

export function createPickups(game, G) {
  const { scene } = game;
  const P = game.player;
  const list = [];

  function spawn(type, pos, opts = {}) {
    if (!type || (type !== 'armor' && type !== 'health' && type !== 'cash' && type !== 'ammo' && !isWeapon(type))) return null;
    const color = COLOR(type);
    const root = new THREE.Group();
    const model = pickupModel(type, color);
    model.position.y = HOVER;
    const halo = new THREE.Mesh(_haloGeo, haloMat(color));
    halo.position.y = 0.025; halo.renderOrder = 2;
    const glint = new THREE.Sprite(glintMat(color)); glint.renderOrder = 6; glint.scale.setScalar(0.3);
    root.add(model, halo, glint);
    // sit on the real surface (sidewalk, curb, dock planks): ray down onto the fixed colliders around the given point
    let y = pos.y || 0;
    const gy = tryCall('pickupGround', () => groundAt(game, pos.x, pos.z, y + 0.5), 0);
    if (gy && Math.abs(gy - y) < 1.0) y = gy;
    root.position.set(pos.x, y, pos.z);
    scene.add(root);
    const p = {
      type, key: type, pos: root.position, root, model, halo, glint, color, active: true, respawnT: 0, temp: !!opts.temp, life: opts.life ?? 45,
      amount: opts.amount ?? 0, ammo: opts.ammo, phase: Math.random() * 6, mapIcon: ICON(type), label: LABEL(type), cache: !!opts.cache,
      variant: model.userData.variant || null, settled: !isWeapon(type),
    };
    if (isWeapon(type)) settleWeapon(p);
    list.push(p);
    return p;
  }
  function remove(p) { scene.remove(p.root); p.glint?.material.dispose(); const i = list.indexOf(p); if (i >= 0) list.splice(i, 1); }

  // ---------------- placement (city API, streamed per ~200 m cell)
  const C = G.city;
  const spawnPt = game.city?.playerSpawn || new THREE.Vector3();
  // starter stash: pistol + ammo right by the spawn (persistent)
  const stashPos = C?.sidewalkPoint(spawnPt, 5, 16) || (pointNear(game, spawnPt, 5, 14, 'sidewalk', false, 120)?.position ?? null);
  if (stashPos) {
    const sp1 = spawn('pistol', stashPos, { ammo: 45 });
    const sp2 = spawn('ammo', stashPos.clone().add(new THREE.Vector3(1.4, 0, 0.6)));
    if (sp1) sp1.starter = true;
    if (sp2) sp2.starter = true;
    const crate = box(0.9, 0.5, 0.6, crateMat, stashPos.x - 1.0, stashPos.y + 0.25, stashPos.z - 0.6); crate.receiveShadow = true; scene.add(crate);
  }
  const stash = stashPos ? { position: stashPos } : null;
  const POOLS = {
    beach: ['health', 'health', 'armor', 'cash', 'cash', 'ammo', 'knife', 'bat', 'machete', 'pistol', 'slimpistol', 'revolver', 'sniper'],
    industrial: ['rifle', 'carbine', 'assaultrifle', 'shotgun', 'smg', 'grenade', 'grenade', 'ammo', 'ammo', 'armor', 'sawnoff', 'crowbar', 'crowbar', 'lmg', 'battlerifle'],
    park: ['health', 'health', 'cash', 'bat', 'bat', 'nailbat', 'knife', 'revolver', 'armor', 'pistol', 'compactpistol'],
    nightlife: ['pistol', 'microsmg', 'knife', 'cash', 'cash', 'health', 'armor', 'revolver', 'sawnoff', 'heavypistol', 'chromepistol', 'slimpistol'],
    default: ['pistol', 'pistol', 'compactpistol', 'snspistol', 'tacpistol', 'microsmg', 'smg', 'shotgun', 'sawnoff', 'revolver', 'health', 'health', 'armor', 'armor', 'cash', 'cash', 'ammo', 'ammo', 'grenade', 'rifle', 'carbine', 'assaultrifle', 'bat', 'crowbar', 'nailbat', 'machete', 'knife'],
  };
  POOLS.port = POOLS.industrial; POOLS.causeway = POOLS.beach;
  const CACHE_POOL = ['rifle', 'carbine', 'assaultrifle', 'specialrifle', 'tacrifle', 'battlerifle', 'lmg', 'smg', 'shotgun', 'sawnoff', 'sniper', 'grenade', 'revolver', 'heavypistol', 'tacpistol', 'microsmg', 'armor', 'ammo'];
  function cacheSpot(cell) {
    for (let k = 0; k < 30; k++) {
      const x = cell.cx + rand(-95, 95), z = cell.cz + rand(-95, 95);
      if (!C.inBounds({ x, z }) || C.isWater(x, z)) continue;
      const ne = C.nearestEdge(x, z);
      if (ne && ne.dist < (ne.edge.width || 12) / 2 + 4) continue;
      const gh = C.groundHeight(x, z);
      let blocked = false;
      for (const [ox, oz] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) { const y = groundAt(game, x + ox, z + oz, gh + 40); if (y > gh + 0.6) { blocked = true; break; } }
      if (blocked) continue;
      return new THREE.Vector3(x, gh, z);
    }
    return null;
  }
  function generate(cell) {
    const items = [], crates = [];
    if (!C) return { items, crates };
    const center = new THREE.Vector3(cell.cx, 0, cell.cz);
    const zone = C.zoneAt(cell.cx, cell.cz);
    if (zone === 'water' && !C.sidewalkPoint(center, 0, 110)) return { items, crates };
    const pool = POOLS[zone] || POOLS.default;
    const n = 3 + (['downtown', 'business', 'nightlife', 'beach'].includes(zone) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const p = C.sidewalkPoint(center, 0, 115, null, { tries: 6 });
      if (!p) continue;
      { const ne = C.nearestEdge(p.x, p.z); if (ne && ne.dist < (ne.edge?.width || 10) / 2 + 0.8) continue; }
      const type = pick(pool);
      items.push({ type, x: p.x, y: p.y, z: p.z, amount: type === 'cash' ? (40 + Math.random() * 180) | 0 : 0, respawnAt: 0 });
    }
    const cacheChance = ['beach', 'industrial', 'port', 'park', 'causeway'].includes(zone) ? 0.4 : 0.18;
    if (Math.random() < cacheChance) {
      const cp = cacheSpot(cell);
      if (cp) {
        crates.push({ x: cp.x, y: cp.y, z: cp.z, rot: Math.random() * 6 });
        const nn = 2 + (Math.random() < 0.45 ? 1 : 0);
        for (let k = 0; k < nn; k++) {
          const a = (k / nn) * Math.PI * 2 + 0.5;
          items.push({ type: k === 0 ? pick(['rifle', 'carbine', 'assaultrifle', 'specialrifle', 'tacrifle', 'battlerifle', 'lmg', 'sniper', 'shotgun']) : pick(CACHE_POOL), x: cp.x + Math.cos(a) * 1.6, y: cp.y, z: cp.z + Math.sin(a) * 1.6, cache: true, respawnAt: 0 });
        }
      }
    }
    return { items, crates };
  }
  function load(cell) {
    const d = cell.data; d.objs = []; d.meshes = [];
    const now = game.clock.elapsed;
    for (const it of d.items || []) {
      const p = spawn(it.type, new THREE.Vector3(it.x, it.y, it.z), { cache: it.cache, amount: it.amount });
      if (!p) continue;
      p.item = it;
      if (it.respawnAt > now) { p.active = false; p.root.visible = false; p.respawnT = it.respawnAt - now; p.mapIcon = null; }
      d.objs.push(p);
    }
    for (const c of d.crates || []) {
      const crate = new THREE.Group();
      crate.add(box(1.0, 0.6, 0.7, crateMat, 0, 0.3, 0)); crate.add(box(1.02, 0.08, 0.72, crateLid, 0, 0.62, 0));
      crate.position.set(c.x, c.y, c.z); crate.rotation.y = c.rot; scene.add(crate); d.meshes.push(crate);
    }
  }
  function unload(cell) {
    const d = cell.data;
    const now = game.clock.elapsed;
    for (const p of d.objs || []) { if (p.item && !p.active) p.item.respawnAt = now + Math.max(0, p.respawnT); remove(p); }
    for (const m of d.meshes || []) scene.remove(m);
    d.objs = []; d.meshes = [];
  }
  const streamer = createCellStreamer(game, { cell: 200, loadR: 250, unloadR: 400, perTick: 2, generate, load, unload });
  const crateLid = new THREE.MeshStandardMaterial({ color: 0x2f3a2a, roughness: 0.8 });
  try { streamer.tick(0, true); } catch (e) { console.warn('[pickups] initial stream', e); }
  const caches = 0;

  // ---------------- collection
  function collect(p) {
    const inv = P.inventory, W = game.weapons;
    let msg = null;
    const t = p.type;
    if (isWeapon(t)) {
      const d = WEAP[t], had = inv.includes(t);
      if (d.melee && had) return false;
      const add = p.ammo ?? d.ammoPick ?? 30;
      if (W?.give) W.give(t, d.melee ? 0 : add, { variant: p.variant || undefined });
      else { if (!had) inv.push(t); if (!d.melee) P.ammo[t] = (P.ammo[t] || 0) + add; }
      msg = had ? `${d.name}: +${add} ammo` : `Picked up: ${d.name}`;
      sfx(game, d.melee ? 'pickup' : 'reload', p.pos, 0.8);
    } else if (t === 'ammo') {
      const guns = Object.keys(WEAP).filter((g2) => inv.includes(g2) && !WEAP[g2].melee);
      if (!guns.length) return false;
      for (const g2 of guns) { const n = Math.max(1, Math.round((WEAP[g2].ammoPack || WEAP[g2].ammoPick || 30) * (WEAP[g2].throw ? 1 : 0.6))); if (W?.buyAmmo) W.buyAmmo(g2, n); else P.ammo[g2] = (P.ammo[g2] || 0) + n; }
      msg = 'Ammo restocked'; sfx(game, 'reload', p.pos);
    } else if (t === 'armor') {
      if (P.armor >= 100) return false;
      P.armor = Math.min(100, (P.armor || 0) + 50); msg = 'Body armor +50'; sfx(game, 'armor', p.pos);
    } else if (t === 'health') {
      if (P.health >= 100) return false;
      P.health = Math.min(100, P.health + 40); msg = 'Health +40'; sfx(game, 'health', p.pos);
    } else if (t === 'cash') {
      P.money = (P.money || 0) + Math.max(1, Math.round(p.amount || 20)); sfx(game, 'cash', p.pos);
    }
    if (msg) tryCall('notify', () => game.hud?.notify?.(msg, 2200));
    game.emit?.('pickup', { type: t, position: p.pos.clone() });
    return true;
  }

  let t = 0, hinted = false;
  function update(dt) {
    t += dt;
    streamer.tick(dt);
    const pp = P.position, inCar = !!P.state.inVehicle;
    const dead = G.dead || G.busted;
    if (!hinted && stash && game.ui && !game.ui.title && t > 3) {
      hinted = true;
      tryCall('notify', () => game.hud?.notify?.('Psst: there\'s a pistol stashed nearby. It\'s marked on your map.', 6000));
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (!p.active) {
        p.respawnT -= dt;
        if (p.respawnT <= 0 && distXZ(p.pos, pp) > 25) { p.active = true; p.root.visible = true; p.mapIcon = ICON(p.type); }
        continue;
      }
      if (p.temp) { p.life -= dt; if (p.life <= 0) { remove(p); continue; } }
      const d = distXZ(p.pos, pp);
      const blink = !p.temp || p.life > 5 || (t * 6 | 0) % 2 === 0;
      p.root.visible = d < 90 && blink;
      if (!p.root.visible) continue;
      if (!p.settled) settleWeapon(p);
      const rimOn = d < 40;   // rim glow shells only near the player (they double the pickup's draw calls)
      if (p.rimOn !== rimOn) { p.rimOn = rimOn; p.model.traverse((o) => { if (o.userData.rim) o.visible = rimOn; }); }
      // slow turn + gentle bob; the glow breathes (a little stronger at night)
      p.model.rotation.y = t * 0.9 + p.phase;
      p.model.position.y = HOVER + Math.sin(t * 1.6 + p.phase) * 0.04;
      // twinkle: a quick glint every ~2.6 s near the top of the model; it grows with distance so it stays a few pixels wide
      const gp = ((t + p.phase * 0.43) % 2.2) / 2.2, flash = gp < 0.14 ? Math.sin(gp / 0.12 * Math.PI) : 0;
      p.glint.material.opacity = (0.28 + 0.72 * flash) * (d > 3 ? 1 : d / 3);
      p.glint.position.set(Math.sin(t * 0.9 + p.phase) * 0.06, p.model.position.y + 0.1, Math.cos(t * 0.9 + p.phase) * 0.06);
      p.glint.scale.setScalar((0.18 + Math.min(0.5, d * 0.03)) * (0.7 + 0.6 * flash));
      const night = 1 - (game.env?.dayFactor ?? 1);
      p.halo.material.opacity = 0.42 + night * 0.25;
      for (const m of _rimMats.values()) m.uniforms.uI.value = (0.8 + 0.2 * Math.sin(t * 2.2)) * (0.55 + night * 0.5);
      const r = inCar ? 2.6 : 1.3;
      if (!dead && d < r && Math.abs(p.pos.y - pp.y) < 2.2 && (!inCar || p.type === 'cash' || p.type === 'health' || p.type === 'armor' || p.type === 'ammo')) {
        if (collect(p)) {
          if (p.temp) remove(p);
          else { p.active = false; p.root.visible = false; p.respawnT = p.cache ? 120 : 60; p.mapIcon = null; if (p.item) p.item.respawnAt = game.clock.elapsed + p.respawnT; }
        }
      }
    }
  }
  const api = { list, spawn, remove, update, caches, streamer };
  game.pickups = api;
  return api;
}

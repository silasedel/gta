// Shared helpers for the activities in src/activities (jet ski rentals, subway life, yacht party, dock shift, ambient life).
// One hub per game (game.activityHub): a site streamer (each site builds when the player comes within `on` meters and
// is dropped past `off`, so far-away activities cost nothing), map blips (game.mapBlips), a GTA-style subtitle line,
// money with sound, prompts that never clobber another system's help text, and a cached GLB loader.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { help, notify, canAct, fmt, getPanel } from '../jobs/kit.js';

export { help, notify, canAct, fmt };
export function getPanelSafe(game) { try { return getPanel(game); } catch (e) { return null; } }
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
export const assetUrl = (p) => BASE + p.replace(/^\//, '');

// ---------------------------------------------------------------- small math
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
export const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const dxz = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// local (lx along heading's right, lz along heading) -> world, heading 0 faces +Z
export function local(o, lx, lz, h = o.heading || 0) {
  const c = Math.cos(h), s = Math.sin(h);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
}
export function groundY(game, x, z, hint) {
  try { const y = game.city?.groundHeightAt?.(x, z, hint); return Number.isFinite(y) ? y : 0; } catch (e) { return 0; }
}

// ---------------------------------------------------------------- GLB loader (cached; clones share geometry and materials)
const loader = new GLTFLoader();
const cache = new Map();
export function loadGLB(path) {
  if (!cache.has(path)) cache.set(path, new Promise((res) => loader.load(assetUrl(path), (g) => res(g.scene), undefined, (e) => { console.warn('[activities] load failed', path, e?.message || e); res(null); })));
  return cache.get(path).then((s) => (s ? s.clone(true) : null));
}
// fit a loaded model: scale to a target size along one axis, sit it on y = 0, center x/z
export function fit(obj, { height, length, width } = {}) {
  const b = new THREE.Box3().setFromObject(obj), s = new THREE.Vector3(); b.getSize(s);
  let k = 1;
  if (height) k = height / (s.y || 1); else if (length) k = length / (Math.max(s.x, s.z) || 1); else if (width) k = width / (s.x || 1);
  obj.scale.multiplyScalar(k);
  b.setFromObject(obj); const c = new THREE.Vector3(); b.getCenter(c);
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b.min.y;
  const g = new THREE.Group(); g.add(obj); return g;
}
export function shadows(obj, cast = true, receive = true) { obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } }); return obj; }
export function tint(obj, color, k = 0.5) {
  const c = new THREE.Color(color);
  obj.traverse((o) => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; o.material = ms.map((m) => { const n = m.clone(); if (n.color) n.color.lerp(c, k); return n; }); if (o.material.length === 1) o.material = o.material[0]; });
  return obj;
}

// ---------------------------------------------------------------- canvas textures (signs, prints)
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.75, metalness: o.m ?? 0, ...o.extra }); }

// ---------------------------------------------------------------- the hub
export function getHub(game) {
  if (game.activityHub) return game.activityHub;
  const H = {
    sites: [],
    apis: {},
    /** register an activity's public API under game.activityHub.apis[id] (and game[id] if free) */
    api(id, obj) { H.apis[id] = obj; if (!(id in game)) game[id] = obj; return obj; },
    /** site: { id, x, z, on = 220, off = 300, build(site), drop(site), tick(dt, site, dist), always? } */
    site(s) { s.on ??= 220; s.off ??= Math.max(s.on + 60, 300); s.active = false; s.dist = 1e9; H.sites.push(s); return s; },
    blip, unblip, subtitle, earn, pay, sfx,
  };
  game.activityHub = H;
  let t = 0;
  game.updaters.push(function activityHubTick(dt) {
    if (!(dt > 0)) return;
    const pp = game.player?.position; if (!pp) return;
    t -= dt;
    if (t <= 0) {
      t = 0.5;
      for (const s of H.sites) {
        const p = s.anchor ? s.anchor() : s;
        s.dist = p ? Math.hypot(p.x - pp.x, p.z - pp.z) : 1e9;
        if (!s.active && (s.dist < s.on || s.force)) { s.active = true; try { s.build?.(s); } catch (e) { console.error('[activities] build ' + s.id, e); } }
        else if (s.active && s.dist > s.off && !s.force && !s.busy) { s.active = false; try { s.drop?.(s); } catch (e) { console.error('[activities] drop ' + s.id, e); } }
      }
    }
    for (const s of H.sites) {
      if (!s.active || !s.tick) continue;
      const p = s.anchor ? s.anchor() : s;
      if (p) s.dist = Math.hypot(p.x - pp.x, p.z - pp.z);
      try { s.tick(dt, s, s.dist); } catch (e) { console.error('[activities] tick ' + s.id, e); s.tick = null; }
    }
    subTick(dt);
  });
  return H;
}

// ---------------------------------------------------------------- map blips (minimap + pause map, through game.mapBlips)
const ICON = new Map();
function iconCanvas(kind, color) {
  const k = kind + color; if (ICON.has(k)) return ICON.get(k);
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.fillStyle = '#10141c'; g.fill(); g.lineWidth = 4; g.strokeStyle = color; g.stroke();
  g.strokeStyle = g.fillStyle = color; g.lineWidth = 5; g.lineCap = g.lineJoin = 'round';
  if (kind === 'jetski') { // a wave under a small craft
    g.beginPath(); g.moveTo(13, 40); g.quadraticCurveTo(22, 32, 32, 40); g.quadraticCurveTo(42, 48, 51, 40); g.stroke();
    g.beginPath(); g.moveTo(16, 31); g.lineTo(44, 31); g.lineTo(50, 24); g.lineTo(30, 24); g.lineTo(26, 18); g.lineTo(22, 24); g.closePath(); g.fill();
  } else if (kind === 'yacht') { // cocktail glass
    g.beginPath(); g.moveTo(16, 17); g.lineTo(48, 17); g.lineTo(32, 34); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(32, 34); g.lineTo(32, 47); g.moveTo(23, 48); g.lineTo(41, 48); g.stroke();
  } else if (kind === 'job') { // crate / box
    g.strokeRect(17, 20, 30, 26); g.beginPath(); g.moveTo(17, 29); g.lineTo(47, 29); g.moveTo(32, 20); g.lineTo(32, 29); g.stroke();
  } else if (kind === 'danger') { // fist
    g.fillRect(19, 24, 24, 18); g.fillRect(41, 28, 6, 12); g.beginPath(); g.moveTo(25, 24); g.lineTo(25, 19); g.moveTo(31, 24); g.lineTo(31, 19); g.moveTo(37, 24); g.lineTo(37, 19); g.stroke();
  } else { g.beginPath(); g.arc(32, 32, 9, 0, Math.PI * 2); g.fill(); }
  ICON.set(k, c); return c;
}
export function blip(game, { x, z, kind = 'dot', color = '#2fe0d0', label = '', prio = 82, size = 8 }) {
  const img = iconCanvas(kind, color);
  const b = { x, z, kind: 'act:' + kind, label, prio, draw(g, sx, sy, k = 1) { const r = size * k; g.drawImage(img, sx - r, sy - r, r * 2, r * 2); } };
  game.mapBlips = (game.mapBlips || []).concat([b]);
  return b;
}
export function unblip(game, b) { if (b && Array.isArray(game.mapBlips)) game.mapBlips = game.mapBlips.filter((q) => q !== b); }

// ---------------------------------------------------------------- subtitles (GTA style: "Name: line", bottom center)
let subEl = null, subQ = [], subT = 0;
function subtitle(game, who, text, ms = 3200, color = '#ffd25a', now = false) {
  if (now) { subQ.length = 0; subT = 0; }
  if (!subEl) {
    subEl = document.createElement('div');
    subEl.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);max-width:62vw;text-align:center;z-index:40;pointer-events:none;' +
      'font:600 20px/1.35 Inter,system-ui,sans-serif;color:#fff;text-shadow:0 2px 3px #000,0 0 8px rgba(0,0,0,.8);opacity:0;transition:opacity .18s';
    document.body.appendChild(subEl);
  }
  subQ.push({ who, text, ms, color });
  if (subQ.length > 4) subQ.shift();
  if (subT <= 0) nextSub();
}
function nextSub() {
  const s = subQ.shift(); if (!s) { if (subEl) subEl.style.opacity = '0'; subT = 0; return; }
  subEl.innerHTML = (s.who ? `<span style="color:${s.color}">${esc(s.who)}:</span> ` : '') + esc(s.text);
  subEl.style.opacity = '1'; subT = s.ms / 1000;
}
function subTick(dt) { if (subT > 0) { subT -= dt; if (subT <= 0) nextSub(); } }
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// ---------------------------------------------------------------- timer / status pill (top center; one owner at a time)
let pillEl = null, pillOwner = null;
export function pill(owner, html, warn = false) {
  if (!html) { if (pillOwner === owner && pillEl) { pillEl.style.opacity = '0'; pillOwner = null; } return; }
  if (!pillEl) {
    pillEl = document.createElement('div');
    pillEl.style.cssText = 'position:fixed;left:50%;top:22px;transform:translateX(-50%);z-index:41;pointer-events:none;padding:7px 18px;border-radius:999px;' +
      'background:rgba(10,13,20,.78);border:1px solid rgba(255,255,255,.14);color:#eef2f6;font:700 15px/1.2 Inter,system-ui,sans-serif;letter-spacing:.3px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.35);transition:opacity .2s;opacity:0;white-space:nowrap';
    document.body.appendChild(pillEl);
  }
  pillOwner = owner;
  if (pillEl._h !== html) { pillEl.innerHTML = html; pillEl._h = html; }
  pillEl.style.borderColor = warn ? 'rgba(255,90,80,.8)' : 'rgba(255,255,255,.14)';
  pillEl.style.opacity = '1';
}
export const clock = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ---------------------------------------------------------------- money + sound
export function sfx(game, name, pos, volume = 0.8) {
  try { game.audio?.play?.(name, pos ? { position: { x: pos.x, y: (pos.y ?? game.player.position.y) + 1, z: pos.z }, volume } : { volume }); } catch (e) { /* */ }
}
function earn(game, amount, memo, from, category = 'activities') {
  amount = Math.round(amount); if (!(amount > 0)) return;
  if (game.wallet?.earn) game.wallet.earn(amount, { category, memo, from }); else game.player.money = (game.player.money || 0) + amount;
  sfx(game, 'cash', game.player.position, 0.7);
}
/** returns true when paid */
function pay(game, amount, { to, memo, place, category = 'leisure', accepts } = {}) {
  amount = Math.round(amount);
  if (!game.wallet?.pay) { if ((game.player.money || 0) < amount) return false; game.player.money -= amount; sfx(game, 'cash', game.player.position, 0.6); return true; }
  const r = game.wallet.pay(amount, { to, memo, place, category, accepts });
  if (r?.ok) { sfx(game, 'cash', game.player.position, 0.6); return true; }
  return false;
}
export { blip as addBlip, subtitle as say, earn as earnCash, pay as payCash };

// ---------------------------------------------------------------- shore finder (map data: works before tiles stream in)
/** nearest open-water shore from (x, z): { shore: last land point, out: unit dir to the water, wet: distance, heading
 *  (facing inland) } or null. opts: { maxR = 220, openLen = 60, depthAt = 9, minDepth = 0.7 } */
export function findShore(game, x, z, o = {}) {
  const city = game.city, SEA = city.seaLevel ?? -0.12;
  const depth = (px, pz) => { try { const d = city.seabedDepthAt?.(px, pz); if (Number.isFinite(d)) return d; } catch (e) { /* */ } return SEA - groundY(game, px, pz); };
  let best = null;
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    let wet = -1; for (let r = 0; r < (o.maxR ?? 220); r += 2) if (city.isWater(x + dx * r, z + dz * r)) { wet = r; break; }
    if (wet < 0) continue;
    let open = true; for (let r = wet; r < wet + (o.openLen ?? 60); r += 6) if (!city.isWater(x + dx * r, z + dz * r)) { open = false; break; }
    if (!open || depth(x + dx * (wet + (o.depthAt ?? 9)), z + dz * (wet + (o.depthAt ?? 9))) < (o.minDepth ?? 0.7)) continue;
    if (!best || wet < best.wet) best = { wet, dx, dz };
  }
  if (!best) return null;
  const { wet, dx, dz } = best;
  return { shore: { x: x + dx * (wet - 1), z: z + dz * (wet - 1) }, out: { x: dx, z: dz }, wet, heading: Math.atan2(-dx, -dz), depth };
}

// ---------------------------------------------------------------- casting: a ped of the right kind of person
// The crowd's casting fills 'gang' / 'rough' from whoever fits the area when the few real gang members / the homeless man
// are already used nearby: retry a few times and keep only people who look the part (rejects vanish at once).
const NOT_STREET = /manager|mail_carrier|delivery|vendor|jogger|surfer|farmer|ranger|hunter|guide|business|tourist|police|swat|detective|kid|lifeguard|nurse|paramedic|chef|maid|valet|bartender|server|office|student|beachgoer|swimmer/;
const ACCEPT = {
  gang: (m) => m.role === 'gang' || (m.g === 'm' && !NOT_STREET.test(m.role) && !/retiree/.test(m.role) && (m.years ?? 30) < 45),
  rough: (m) => m.role === 'homeless' || (m.g === 'm' && !NOT_STREET.test(m.role) && (m.years ?? 40) > 24),
  security: (m) => m.g === 'm' && /security|bouncer|bodybuilder|police|gang|worker|construction/.test(m.role),
};
export function castPed(game, pos, outfit, tries = 5, any = false) {
  const ok = ACCEPT[outfit] || (() => true);
  let last = null;
  for (let i = 0; i < tries; i++) {
    let p = null; try { p = game.peds?.spawnAt?.(pos, { outfit }); } catch (e) { p = null; }
    if (!p) return last;
    const m = p.char?.personMeta;
    if (!m || ok(m)) { if (last) { last.despawnNow = true; if (last.root) last.root.visible = false; } p._actChar = tok(p); return p; }
    if (last) { last.despawnNow = true; if (last.root) last.root.visible = false; }
    last = p; p.pinned = 0.5;
  }
  if (last && any) { last._actChar = tok(last); return last; }
  if (last) { last.despawnNow = true; if (last.root) last.root.visible = false; }
  return null;
}
/** is this ped still the one castPed gave us (the crowd recycles peds when its pool runs dry)? */
export const stillOurs = (p) => !!(p && p.active && !p.dead && p._actChar && tok(p) === p._actChar);
function tok(p) { return p.identity || p.look || p.applied || p.char; }

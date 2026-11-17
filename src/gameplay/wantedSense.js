// POLICE track: the senses of the knowledge model. Everything here turns game state into observations:
//   reality()        the player's current appearance (outfit per garment, face cover, weapons, vehicle, plate, traces)
//   crimes           a 'crime' event becomes an incident; only what actually observed it produces facts (officers,
//                    witnesses who finish their call, cameras whose recorder survives, alarms)
//   witnesses        people who saw it: they call it in unless they are intimidated, bribed, silenced or never reach a phone
//   cameras          store cameras with a destroyable recorder, traffic cameras (tickets, plate reads during chases)
// Other tracks feed this through events ('witness', 'evidence', 'outfit:changed') and guarded APIs; every one of them has a
// local fallback here so the system works alone.
import * as THREE from 'three';
import { rand, clamp, sfx, tryCall, hasLOS, distXZ, warnOnce } from './util.js';
import { colorName, vehicleLabel, compassOf, crimeName, weaponWord } from './evidenceWords.js';
import { buildTrafficCamera, buildRecorder, buildWitnessMarker } from './police/models.js';

const hash = (n) => { let x = (n | 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };
const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

export function createSense(game, G, law) {
  const P = game.player, ev = law.ev, core = law.core;
  const now = () => game.clock.elapsed;
  const S = { witnesses: [], incidents: [], extWitness: false, extCameras: false, tickets: [], stats: { crimes: 0, silent: 0, reported: 0, camHits: 0 } };

  // ================================================================== reality
  // ---- outfit (CHARACTER track: game.wardrobe.describe(); local fallback below)
  const localOutfit = {
    top: { id: 'nico_tropic_teal', label: 'teal tropical shirt' },
    bottom: { id: 'jeans_blue', label: 'blue jeans' },
    shoes: { id: 'sneakers_white', label: 'white sneakers' },
  };
  const SLOT = { top: 'top', shirt: 'top', torso: 'top', jacket: 'top', upper: 'top', tee: 'top', hoodie: 'top', bottom: 'bottom', pants: 'bottom', shorts: 'bottom', legs: 'bottom', lower: 'bottom', jeans: 'bottom',
    shoes: 'shoes', feet: 'shoes', sneakers: 'shoes', footwear: 'shoes', hat: 'head', head: 'head', cap: 'head', headwear: 'head', helmet: 'head',
    glasses: 'eyes', eyes: 'eyes', sunglasses: 'eyes', eyewear: 'eyes', mask: 'mask', face: 'mask', jewelry: 'extra', chain: 'extra', watch: 'extra', bag: 'extra', backpack: 'extra', extra: 'extra', accessory: 'extra' };
  function garmentOf(it) {
    if (it == null || it === false) return null;
    if (typeof it === 'string') return it ? { id: it.toLowerCase(), label: it } : null;
    const label = it.label || it.description || it.text || it.name || [it.colorName || (it.color != null ? colorName(it.color) : ''), it.item || it.type || it.kind || ''].filter(Boolean).join(' ');
    if (!label) return null;
    return { id: it.id ?? it.key ?? it.sku ?? label.toLowerCase(), label: String(label).toLowerCase() };
  }
  function normalizeOutfit(d) {
    const out = { garments: {}, masked: false, hat: false, glasses: false, uniform: null, sex: 'male' };
    if (!d) return null;
    const put = (slotName, it) => {
      const slot = SLOT[String(slotName || '').toLowerCase()]; const g = garmentOf(it); if (!slot || !g) return;
      if (slot === 'mask') { out.masked = true; out.garments.extra = g; return; }
      if (slot === 'eyes') { out.glasses = true; if (!out.garments.extra) out.garments.extra = g; return; }
      if (slot === 'head') { out.hat = true; if (/mask|balaclava|bandana over|helmet with visor/.test(g.label)) out.masked = true; }
      out.garments[slot] = g;
    };
    const list = Array.isArray(d) ? d : Array.isArray(d.garments) ? d.garments : Array.isArray(d.items) ? d.items : null;
    if (list) for (const it of list) put(it?.slot || it?.category || it?.type || it?.kind, it);
    else for (const k of Object.keys(d.garments && typeof d.garments === 'object' ? d.garments : d)) put(k, (d.garments && typeof d.garments === 'object' ? d.garments : d)[k]);
    if (typeof d === 'object' && !Array.isArray(d)) {
      if (d.masked != null) out.masked = !!d.masked; if (d.hat != null) out.hat = !!d.hat; if (d.glasses != null) out.glasses = !!d.glasses;
      if (d.uniform || d.disguise) out.uniform = d.uniform || d.disguise; if (d.sex || d.gender) out.sex = d.sex || d.gender;
    }
    return Object.keys(out.garments).length ? out : null;
  }
  let outfitCache = null, outfitT = -9;
  function outfit() {
    const t = now();
    if (outfitCache && t - outfitT < 1.5) return outfitCache;
    outfitT = t;
    let o = null;
    if (game.wardrobe?.describe) o = tryCall('wardrobe.describe', () => normalizeOutfit(game.wardrobe.describe()), null);
    if (!o) { o = { garments: { ...localOutfit }, masked: !!localOutfit.mask, hat: !!localOutfit.head, glasses: !!localOutfit.eyes, uniform: localOutfit.uniform || null, sex: 'male' }; delete o.garments.mask; delete o.garments.eyes; delete o.garments.uniform; if (localOutfit.mask) o.garments.extra = localOutfit.mask; else if (localOutfit.eyes && !o.garments.extra) o.garments.extra = localOutfit.eyes; }
    outfitCache = o; return o;
  }
  game.on?.('outfit:changed', () => { outfitT = -9; });
  // fallback wardrobe (used until the CHARACTER track's wardrobe exists; also handy for tests): slot = top|bottom|shoes|head|eyes|mask|extra
  function setGarment(slot, g) { if (g) localOutfit[slot] = garmentOf(g); else delete localOutfit[slot]; outfitT = -9; game.emit?.('outfit:changed', { slot, source: 'police-fallback' }); }

  // ---- vehicle identity (VEHICLES-CORE: model, color, plate; fallback: derive color from paint and issue our own plate)
  const plates = new WeakMap();
  function makePlate(seed) { // original Southline plate format: three letters, three digits
    let h = hash(seed), s = '';
    for (let i = 0; i < 3; i++) { s += LETTERS[h % LETTERS.length]; h = hash(h + i); }
    s += ' '; for (let i = 0; i < 3; i++) { s += String(h % 10); h = hash(h + 7 + i); }
    return s;
  }
  function plateOf(v) {
    if (!v || v.isBoat || v.isAircraft) return null;
    const ext = v.plate?.text ?? (typeof v.plate === 'string' ? v.plate : null) ?? v.identity?.plate ?? v.licensePlate ?? null;
    if (ext) return String(ext).toUpperCase();
    let p = plates.get(v); if (!p) { p = makePlate(strHash(String(v.id ?? v.name ?? Math.random()))); plates.set(v, p); }
    return p;
  }
  function paintHex(v) {
    if (v.identity?.color != null) return v.identity.color;
    if (v.paintColor != null) return v.paintColor;
    const pc = v.car?.paint?.color; if (pc?.getHex) return pc.getHex();
    if (v.variant?.color != null) return v.variant.color;
    return v.color ?? null;
  }
  function vehicleInfo(v) {
    if (!v) return null;
    const cls = v.isBoat ? (v.isJetski ? 'jetski' : 'boat') : v.isAircraft ? (v.isHeli ? 'heli' : 'plane') : v.identity?.class || v.model?.class || v.spec?.cls || 'sedan';
    const hx = paintHex(v);
    const color = v.identity?.colorName || (typeof hx === 'string' && !/^#/.test(hx) ? hx : hx != null ? colorName(hx) : '');
    const info = { uid: String(v.uid ?? v.id ?? v.name), cls, color, plate: plateOf(v), model: v.identity?.model || v.model?.name || v.name || '', ref: v };
    info.label = vehicleLabel(info);
    return info;
  }
  // fallbacks for garages until VEHICLES-CORE exposes its own paint / plate API
  function repaint(v, hex) { if (!v) return false; tryCall('repaint', () => { if (v.setPaint) v.setPaint(hex); else if (v.car?.paint?.color) v.car.paint.color.setHex(hex); v.paintColor = hex; if (v.variant) v.variant.color = hex; }); game.emit?.('vehicle:repainted', { vehicle: v, color: hex }); return true; }
  function changePlates(v) { if (!v) return null; const p = makePlate(hash((Math.random() * 1e9) | 0)); if (v.plate && typeof v.plate === 'object' && 'text' in v.plate) v.plate.text = p; else if (typeof v.setPlate === 'function') v.setPlate(p); else plates.set(v, p); if (typeof v.plate === 'string') v.plate = p; game.emit?.('vehicle:plateChanged', { vehicle: v, plate: p }); return p; }
  function isOwned(v) { return !!v && (v.playerOwned === true || v.owned === true || !!tryCall('garage.owns', () => game.garage?.owns?.(v) || game.property?.ownsVehicle?.(v), false)); }

  // ---- weapons
  function weaponCls(key) { if (!key || key === 'fist') return null; if (key === 'bat' || key === 'knife') return key; const d = game.weapons?.defs?.[key]; return d ? (d.cls === 'melee' ? key : d.cls) : null; }
  function ditchWeapon(key = P.weapon) {
    if (!key || key === 'fist' || !P.inventory?.includes(key)) return false;
    const ammo = P.ammo?.[key] || 0;
    P.inventory.splice(P.inventory.indexOf(key), 1); if (P.ammo) P.ammo[key] = 0; if (P.clip) P.clip[key] = 0;
    if (P.weapon === key) { P.weapon = 'fist'; game.emit?.('weaponChange', { weapon: 'fist' }); }
    game.emit?.('inventoryChange', { key, had: true, ditched: true });
    tryCall('ditch drop', () => G.pickups?.spawn?.(key, new THREE.Vector3(P.position.x + Math.sin(P.heading) * 0.8, P.position.y + 0.05, P.position.z + Math.cos(P.heading) * 0.8), { temp: true, life: 240, ammo }));
    sfx(game, 'reload', P.position, 0.5);
    return true;
  }

  // ---- traces ("seen at the crime": blood, dye, soot, soaked). A shower clears them (CORE-SYSTEMS calls game.wanted.shower()).
  const traces = new Map(); // id -> { label, t }
  const TRACE = { blood: 'blood on his clothes', dye: 'red dye stains', soot: 'soot and scorch marks', wet: 'soaking wet clothes' };
  function addTrace(id) { if (!TRACE[id]) return; traces.set(id, { label: TRACE[id], t: now() }); }
  function shower() { const had = traces.size > 0; traces.clear(); ev.forget('traces', 'showered'); game.emit?.('wanted:showered', { had }); return had; }
  let swimT = 0;
  game.on?.('hit', (d) => {
    if (!d || d.target !== 'ped' || !d.byPlayer) return;
    const p = d.point || d.object?.pos; if (!p) return;
    const close = distXZ(p, P.position) < 3.2;
    if (close && (d.kind === 'melee' || d.kind === 'punch') && (d.object?.dead || (d.damage || 0) > 30)) addTrace('blood');
    else if (close && d.kind === 'bullet' && distXZ(p, P.position) < 2.2) addTrace('blood');
  });
  game.on?.('explosion', (d) => { if (d?.position && distXZ(d.position, P.position) < 9) addTrace('soot'); });
  for (const n of ['shower', 'needs:shower', 'player:showered']) game.on?.(n, () => shower());

  // ---- the snapshot
  let lastVehicle = null, lastVehicleInfo = null;
  const R = { garments: {}, masked: false, faceCover: 0, weapons: [], weaponVisible: null, vehicle: null, lastVehicle: null, lastVehicleDist: 1e9, companions: 0, traces: [], uniform: null, sex: 'male' };
  function reality() {
    const o = outfit();
    R.garments = o.garments; R.masked = !!o.masked; R.faceCover = (o.hat ? 0.5 : 0) + (o.glasses ? 0.5 : 0); R.uniform = o.uniform; R.sex = o.sex || 'male';
    const inv = P.inventory || [];
    R.weapons = []; for (const k of inv) { const c = weaponCls(k); if (c && !R.weapons.includes(c)) R.weapons.push(c); }
    const v = P.state.inVehicle ? P.state.vehicle : null;
    R.weaponVisible = v ? null : weaponCls(P.weapon);
    if (v) { lastVehicle = v; }
    R.vehicle = v ? vehicleInfo(v) : null;
    if (lastVehicle && (lastVehicle.disposed || lastVehicle.alive === false)) lastVehicle = null;
    lastVehicleInfo = lastVehicle ? (v === lastVehicle ? R.vehicle : vehicleInfo(lastVehicle)) : null;
    R.lastVehicle = lastVehicleInfo;
    R.lastVehicleDist = lastVehicle && !v ? tryCall('lvd', () => distXZ(lastVehicle.body.translation(), P.position), 1e9) : 0;
    R.companions = tryCall('companions', () => (game.crew?.following?.length || 0) + (game.pet?.following ? 1 : 0) + (v?.passengers?.length || 0), 0) || 0;
    R.traces = [...traces.keys()];
    return R;
  }
  const hiddenNow = () => !!(P.state.indoor || P.headUnderwater || P.hiding || game.interiors?.current);

  // ================================================================== observations
  // what an observer at `dist` with a clear view can make out right now -> evidence facts from `src`
  //   vis = { dist, kind: 'officer'|'witness'|'camera'|'alpr'|'heli'|'drone'|'tip', k (quality 0..1), plateChars (int|undefined) }
  function observe(src, vis = {}) {
    const R0 = reality(), d = vis.dist ?? 10, k = vis.k ?? 1, kind = vis.kind || src.type;
    const inVeh = !!P.state.inVehicle;
    const air = kind === 'heli';
    if (!air && kind !== 'alpr') {
      if (!R0.masked && d < (inVeh ? 8 : 22)) ev.observe(src, 'face', { label: 'face' }, k * (1 - R0.faceCover * 0.6) * clamp(1.15 - d / 26, 0.3, 1));
      if (!inVeh || d < 6) {
        for (const slot of ['top', 'bottom', 'shoes', 'head', 'extra']) {
          const g = R0.garments[slot]; if (!g) continue;
          const far = slot === 'shoes' || slot === 'extra' ? 16 : 60;
          if (d < far) ev.observe(src, 'outfit.' + slot, g, k * clamp(1.2 - d / far, 0.35, 1) * (inVeh ? 0.5 : 1));
        }
        for (const id of R0.traces) if (d < 20) ev.observe(src, 'traces', { id, label: traces.get(id)?.label || id }, k);
      }
      if (R0.weaponVisible && d < 45) ev.observe(src, 'weapon', { cls: R0.weaponVisible, label: weaponWord(R0.weaponVisible) }, k * clamp(1.2 - d / 45, 0.4, 1));
    } else if (air && !inVeh) {
      for (const slot of ['top', 'bottom', 'head']) { const g = R0.garments[slot]; if (g) ev.observe(src, 'outfit.' + slot, g, k * 0.8); }
    }
    if (R0.companions > 0 && d < 40) ev.observe(src, 'companions', { n: R0.companions, label: R0.companions > 1 ? `with ${R0.companions} others` : 'with one other person' }, k);
    if (inVeh && R0.vehicle) {
      const vi = R0.vehicle;
      ev.observe(src, 'vehicle', { uid: vi.uid, cls: vi.cls, color: vi.color, model: vi.model, label: vi.label }, k);
      if (vi.plate && !air) {
        const n = vi.plate.replace(/\s/g, '').length;
        let chars = vis.plateChars ?? (kind === 'alpr' || kind === 'officer' ? (d < 35 ? n : 0) : d < 9 ? n : d < 20 ? Math.round(n * clamp(k * (1.2 - d / 24), 0.3, 0.85)) : 0);
        if (chars > 0) {
          const mask = new Array(n).fill(false);
          if (chars >= n) mask.fill(true); else { let h = strHash(src.id + vi.plate); const idx = [...mask.keys()]; for (let i = 0; i < chars; i++) { const j = h % idx.length; mask[idx[j]] = true; idx.splice(j, 1); h = hash(h + i); } }
          ev.observe(src, 'plate', { text: vi.plate, mask, uid: vi.uid }, k);
        }
      }
    }
    if (vis.direction !== false) observeDirection(src, k);
  }
  function directionNow() {
    const vel = P.velocity || { x: 0, z: 0 }, sp = Math.hypot(vel.x, vel.z);
    const still = sp < 1.2;
    const dx = still ? Math.sin(P.heading) : vel.x / sp, dz = still ? Math.cos(P.heading) : vel.z / sp;
    const street = tryCall('street', () => G.city?.city?.streetNameAt?.(P.position.x, P.position.z), null) || null;
    const v = P.state.inVehicle ? P.state.vehicle : null;
    return { compass: compassOf(dx, dz), street, district: G.city?.districtAt?.(P.position.x, P.position.z) || null, still, mode: v ? (v.isBoat ? 'boat' : 'vehicle') : 'foot', x: P.position.x, z: P.position.z };
  }
  function observeDirection(src, k = 1) { ev.observe(src, 'direction', directionNow(), k); }

  // ================================================================== cameras
  const cams = new Map();      // id -> { id, kind, name, pos, range, recorder, uploads, alive }
  const recorders = new Map(); // id -> { id, name, pos, destroyed, model, cams: Set }
  function registerCamera(c) {
    const id = c.id || `cam:${cams.size + 1}`;
    const cam = { id, kind: c.kind || 'store', name: c.name || 'Security camera', pos: new THREE.Vector3(c.position?.x ?? c.pos?.x ?? 0, c.position?.y ?? c.pos?.y ?? 2.6, c.position?.z ?? c.pos?.z ?? 0), range: c.range || 14,
      recorder: c.recorderId || c.recorder || null, uploads: c.uploads || 'local', alive: true, quality: c.quality ?? 0.9, sees: c.sees || null, ext: !!c.ext };
    cams.set(id, cam); if (cam.recorder && recorders.has(cam.recorder)) recorders.get(cam.recorder).cams.add(id);
    return cam;
  }
  function registerRecorder(r) {
    const id = r.id || `rec:${recorders.size + 1}`;
    const rec = { id, name: r.name || 'Recorder', pos: new THREE.Vector3(r.position?.x ?? r.pos?.x ?? 0, r.position?.y ?? r.pos?.y ?? 1, r.position?.z ?? r.pos?.z ?? 0), destroyed: false, model: r.model || null, cams: new Set(), ext: !!r.ext };
    recorders.set(id, rec); for (const [cid, c] of cams) if (c.recorder === id) rec.cams.add(cid);
    return rec;
  }
  function destroyRecorder(id, how = 'smashed') {
    const rec = recorders.get(id); if (!rec || rec.destroyed) return false;
    rec.destroyed = true;
    tryCall('rec model', () => rec.model?.setDestroyed?.(true));
    tryCall('fx', () => game.fx?.sparks?.(rec.pos.clone(), new THREE.Vector3(0, 1, 0)));
    sfx(game, 'glass', rec.pos, 0.7);
    let averted = 0;
    for (const cid of rec.cams) { const c = cams.get(cid); if (c) c.alive = false; if (ev.cancelSource('camera:' + cid, 'destroyed')) averted++; }
    game.emit?.('evidence:recorderDestroyed', { id, name: rec.name, averted });
    law.notify?.(averted ? `Recorder destroyed. The footage is gone.` : `Recorder destroyed.`, 2600);
    return true;
  }
  // INTERIORS-ENGINE contract: game.emit('evidence', { op: 'camera'|'recorder'|'destroy'|'record', id, recorderId, name, position, range, uploads, sees })
  game.on?.('evidence', (d) => {
    if (!d) return;
    S.extCameras = true;
    const op = d.op || d.kind || d.type;
    if (op === 'camera' || op === 'register') registerCamera({ ...d, ext: true });
    else if (op === 'recorder') registerRecorder({ ...d, ext: true });
    else if (op === 'destroy' || op === 'recorderDestroyed') destroyRecorder(d.recorderId || d.id, d.how);
    else if (op === 'record' || op === 'seen') cameraSees(cams.get(d.id) || registerCamera({ ...d, ext: true }), null, { force: true });
    else if (op === 'unregister') { cams.delete(d.id); recorders.delete(d.id); }
  });
  // fallback store security for the legacy interiors: one camera over the counter and a recorder on the back counter
  const storeSec = new WeakMap();
  function ensureStoreSecurity(shop) {
    if (!shop || S.extCameras || storeSec.has(shop) || !shop.counterPos || shop.type === 'club') return storeSec.get(shop) || null;
    const cp = shop.counterPos, key = shop.key || shop.name;
    const dx = shop.center ? cp.x - shop.center.x : 0, dz = shop.center ? cp.z - shop.center.z : 1, dl = Math.hypot(dx, dz) || 1;
    const rp = new THREE.Vector3(cp.x + (dx / dl) * 0.55 - (dz / dl) * 0.9, (cp.y || 0) + 1.02, cp.z + (dz / dl) * 0.55 + (dx / dl) * 0.9);
    let model = null;
    tryCall('recorder model', () => { model = buildRecorder(THREE, { seed: strHash(String(key)) }); model.group.position.copy(rp); model.group.rotation.y = Math.atan2(-dx, -dz); game.scene.add(model.group); });
    const rec = registerRecorder({ id: 'rec:' + key, name: `${shop.name} recorder`, position: rp, model });
    const cam = registerCamera({ id: 'store:' + key, kind: shop.type === 'bank' ? 'bank' : 'store', name: `Store camera, ${shop.name}`, position: { x: cp.x, y: (cp.y || 0) + 2.7, z: cp.z }, range: 13, recorderId: rec.id, uploads: shop.type === 'bank' ? 'remote' : 'local' });
    const sec = { rec, cam, shop }; storeSec.set(shop, sec); return sec;
  }
  // a camera has the player in view: footage is recorded. It only reaches the police once somebody reports the incident and
  // an officer pulls it (local recorder) or the monitoring company sends it (remote). Destroy the recorder first and it never does.
  function cameraSees(cam, incident, o = {}) {
    if (!cam || !cam.alive) return null;
    const rec = cam.recorder ? recorders.get(cam.recorder) : null;
    if (rec?.destroyed) return null;
    const id = 'camera:' + cam.id;
    let src = ev.source(id);
    if (!src || (src.state !== 'pending' && src.state !== 'live')) {
      const pull = cam.uploads === 'remote' ? rand(6, 9) : cam.kind === 'traffic' ? 0 : rand(22, 32);
      src = ev.addSource({ id, type: cam.kind === 'traffic' ? 'alpr' : 'camera', label: cam.name, reliability: cam.quality, pending: pull, where: { x: cam.pos.x, z: cam.pos.z }, pendingKind: 'footage', meta: { cam: cam.id } });
      if (src.state === 'pending' && !(incident?.reported || o.reported)) ev.setHold(id, true); // nobody is looking for footage yet
      if (incident) incident.cams.push(id);
    }
    observe(src, { dist: Math.max(2, distXZ(cam.pos, P.position)), kind: cam.kind === 'traffic' ? 'alpr' : 'camera', k: cam.quality, direction: cam.kind === 'traffic' });
    return src;
  }
  function camerasNear(pos, y) {
    const out = [];
    for (const [, c] of cams) {
      if (!c.alive || c.kind === 'traffic') continue;
      if (distXZ(c.pos, pos) > c.range || Math.abs((c.pos.y - 2.5) - (y ?? pos.y ?? 0)) > 4) continue;
      out.push(c);
    }
    return out;
  }

  // ---- traffic cameras: picked once from the road graph, streamed near the player.
  // Placed the way a real Florida city does it: red-light / speed cameras sit only at big arterial crossings
  // (primary or trunk meeting another major road) inside the dense urban core, a kilometre or more apart.
  // Suburbs get very few, rural and island roads get none. Urban density is measured from the road graph itself
  // (junctions per 500 m cell, 3x3 neighbourhood), and only the densest ~25% of built-up cells qualify.
  const TC = { list: [], grid: new Map(), built: false, cursor: 0, pass: 0, dens: new Map(), densMin: Infinity, models: new Map(), cell: 240, flashT: 0, light: null };
  const MAJOR = /primary|trunk/, BIG = /primary|secondary|trunk/;
  const DCELL = 500, CAM_SPACING = 1300;
  const nodeEdges = (n, edges) => (n.edges || []).map((k) => (typeof k === 'number' ? edges[k] : k)).filter(Boolean);
  function densityAt(x, z) {
    const cx = Math.floor(x / DCELL), cz = Math.floor(z / DCELL); let d = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) d += TC.dens.get((cx + i) + ',' + (cz + j)) || 0;
    return d;
  }
  function trafficCamBuildStep(budget = 1500) {
    const rg = game.city?.roadGraph; if (TC.built || !rg?.nodes) { TC.built = true; return; }
    const nodes = rg.nodes, edges = rg.edges;
    const end = Math.min(nodes.length, TC.cursor + budget);
    if (TC.pass === 0) { // pass 0: junction density per cell
      for (let i = TC.cursor; i < end; i++) {
        const n = nodes[i]; if (!n || (n.edges || []).length < 3) continue;
        const k = Math.floor(n.x / DCELL) + ',' + Math.floor(n.z / DCELL); TC.dens.set(k, (TC.dens.get(k) || 0) + 1);
      }
      TC.cursor = end;
      if (end >= nodes.length) { // threshold = 75th percentile of the 3x3 density over built-up cells
        const vals = [];
        for (const k of TC.dens.keys()) { const [a, b] = k.split(',').map(Number); vals.push(densityAt((a + 0.5) * DCELL, (b + 0.5) * DCELL)); }
        vals.sort((a, b) => a - b);
        TC.densMin = Math.max(40, vals[Math.floor(vals.length * 0.75)] || Infinity);
        TC.pass = 1; TC.cursor = 0;
      }
      return;
    }
    for (let i = TC.cursor; i < end; i++) {
      const n = nodes[i]; if (!n) continue;
      const ne = nodeEdges(n, edges);
      if (ne.length < 3) continue;
      let major = 0, big = 0, name = [], spd = 0, dir = null, skip = false;
      for (const e of ne) {
        const k = e.kind || '';
        if (e.bridge || e.elevated || /motorway|_link/.test(k)) skip = true;
        if (BIG.test(k)) { big++; if (MAJOR.test(k)) major++; if (!dir && e.pts?.length > 1) { const a = e.a === n.id ? e.pts[0] : e.pts[e.pts.length - 1], b = e.a === n.id ? e.pts[1] : e.pts[e.pts.length - 2]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; dir = { x: (b[0] - a[0]) / l, z: (b[1] - a[1]) / l }; } spd = Math.max(spd, e.speedKmh || 50); }
        if (e.name && !name.includes(e.name)) name.push(e.name);
      }
      if (skip || !dir || major < 1 || big < 3 || spd > 75) continue; // a real arterial crossing (both roads through), not a highway
      if (name.length < 2) continue;                                   // two different named roads actually cross here
      if (densityAt(n.x, n.z) < TC.densMin) continue;                  // dense urban core only: no cameras in suburbs, rural areas or the Keys
      if (hash(n.id | 0) % 100 > 45) continue;                         // not every qualifying crossing has one
      if (TC.list.some((c) => Math.hypot(c.x - n.x, c.z - n.z) < CAM_SPACING)) continue;
      const cx = Math.floor(n.x / TC.cell), cz = Math.floor(n.z / TC.cell), key = cx + ',' + cz;
      if (TC.grid.has(key)) continue;
      const w = Math.max(...ne.map((e) => e.width || 8));
      const cam = { id: 'tc' + n.id, node: n, x: n.x, z: n.z, dir, name: `Traffic camera, ${name.slice(0, 2).join(' & ')}`, limit: spd, px: n.x + dir.x * (w * 0.5 + 6) - dir.z * (w * 0.5 + 2.2), pz: n.z + dir.z * (w * 0.5 + 6) + dir.x * (w * 0.5 + 2.2), cd: 0, hitCd: 0 };
      TC.grid.set(key, cam); TC.list.push(cam);
      registerCamera({ id: cam.id, kind: 'traffic', name: cam.name, position: { x: cam.px, y: 5.2, z: cam.pz }, range: 30, uploads: 'remote', quality: 0.98 });
    }
    TC.cursor = end; if (end >= nodes.length) { TC.built = true; game.trafficCams = TC.list; console.info(`[traffic cams] ${TC.list.length} placed (density >= ${TC.densMin})`); }
  }
  function trafficCamsNear(x, z, r) {
    const out = [], c0 = Math.floor((x - r) / TC.cell), c1 = Math.floor((x + r) / TC.cell), d0 = Math.floor((z - r) / TC.cell), d1 = Math.floor((z + r) / TC.cell);
    for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) { const c = TC.grid.get(i + ',' + j); if (c && Math.hypot(c.x - x, c.z - z) < r) out.push(c); }
    return out;
  }
  let tcStreamT = 0;
  function trafficCamTick(dt) {
    if (!TC.built) { trafficCamBuildStep(); return; }
    const pp = P.position;
    tcStreamT -= dt;
    if (tcStreamT <= 0) { // stream the pole models in and out
      tcStreamT = 1.2;
      const near = new Set(trafficCamsNear(pp.x, pp.z, 260));
      for (const c of near) if (!TC.models.has(c)) tryCall('tc model', () => {
        const m = buildTrafficCamera(THREE, { seed: hash(c.node.id | 0) });
        const gy = G.city?.groundHeight?.(c.px, c.pz) ?? 0;
        m.group.position.set(c.px, Math.max(gy, 0), c.pz); m.group.rotation.y = Math.atan2(c.x - c.px, c.z - c.pz);
        game.scene.add(m.group); TC.models.set(c, m);
      });
      for (const [c, m] of TC.models) if (!near.has(c)) { game.scene.remove(m.group); m.dispose?.(); TC.models.delete(c); }
    }
    for (const [, m] of TC.models) m.update?.(dt);
    const v = P.state.inVehicle ? P.state.vehicle : null;
    if (!v || v.isBoat || v.isAircraft) return;
    for (const c of trafficCamsNear(pp.x, pp.z, 30)) {
      c.cd -= dt; c.hitCd -= dt;
      const kmh = v.speedKmh || 0, wanted = core.S.level > 0;
      const over = kmh - (c.limit + 22);
      const red = !!tryCall('signal', () => game.traffic?.ranRedLight?.(v, c.node.id), false);
      if ((over > 0 || red) && c.cd <= 0) {
        c.cd = 40; flash(c);
        issueTicket(v, red ? 'red_light' : 'speeding', c, kmh);
      }
      if (wanted && c.hitCd <= 0) { // a wanted plate rolls past a camera: the chase is caught on camera and adds heat
        const cam = cams.get(c.id); if (!cam) continue;
        const believed = ev.get('plate') || ev.get('vehicle');
        if (!believed || !believed.valid) continue; // they do not know this car
        c.hitCd = 45; flash(c); S.stats.camHits++;
        const src = ev.addSource({ id: 'camera:' + c.id, type: 'alpr', label: c.name, reliability: 0.98, where: { x: c.x, z: c.z } });
        observe(src, { dist: 12, kind: 'alpr', k: 1 });
        core.escalate(0.5, 'camera');
        if (!core.S.seen) core.sighting(pp, { by: 'camera', radiusK: 0.45 });
        law.radio?.say('camera', { name: c.name });
        game.emit?.('evidence:cameraHit', { camera: c.name, pos: { x: c.x, z: c.z } });
      }
    }
  }
  function flash(c) {
    const m = TC.models.get(c); tryCall('flash', () => m?.flash?.());
    sfx(game, 'beep', new THREE.Vector3(c.px, 4, c.pz), 0.5);
  }
  function issueTicket(v, type, c, kmh) {
    const owned = isOwned(v), vi = vehicleInfo(v);
    const amount = type === 'red_light' ? 160 : Math.round((90 + Math.max(0, kmh - c.limit - 22) * 6) / 5) * 5;
    const tk = { id: 'T' + (S.tickets.length + 1001), type, name: crimeName(type), amount, where: c.name.replace('Traffic camera, ', ''), plate: vi?.plate, kmh: Math.round(kmh), limit: c.limit, day: game.day ?? 0, tod: game.timeOfDay, toPlayer: owned, paid: false };
    if (owned) {
      S.tickets.push(tk);
      law.notify?.(`Camera flash: ${tk.name} (${tk.kmh} in a ${tk.limit}). A $${tk.amount} ticket is in the mail.`, 4200);
      tryCall('mail', () => game.mail?.send?.({ kind: 'ticket', title: `${tk.name}: $${tk.amount}`, body: `Plate ${tk.plate}, ${tk.where}. Pay within three days.`, ticket: tk }));
      game.emit?.('ticket:issued', tk);
    } else law.notify?.(`Camera flash: ${tk.name}. The ticket goes to this car's registered owner.`, 3400);
    return tk;
  }
  function payTicket(id) {
    const tk = S.tickets.find((t) => t.id === id && !t.paid); if (!tk) return false;
    if (!law.money.pay(tk.amount, 'ticket')) { law.notify?.('Not enough money to pay that ticket.', 2200); return false; }
    tk.paid = true; game.emit?.('ticket:paid', tk); return true;
  }

  // ================================================================== witnesses
  // NPC-AI contract: game.emit('witness', { id?, who?, ped?, what (crime type), where {x,z}, description?, reliability 0..1, pending? (s before the call completes) })
  // and game.emit('witness:silenced', { id, how }). Until that track emits them, the fallback below finds witnesses itself.
  game.on?.('witness', (d) => { try { extWitness(d); } catch (e) { warnOnce('witness event', e); } });
  game.on?.('witness:silenced', (d) => { if (d?.id) ev.cancelSource('witness:' + d.id, d.how || 'silenced'); });
  function extWitness(d) {
    if (!d) return;
    S.extWitness = true;
    const pos = d.where || d.position || P.position, id = 'witness:' + (d.id ?? d.ped?.id ?? Math.random().toString(36).slice(2, 8));
    const inc = incidentFor(d.what || d.type || 'assault', pos);
    const src = ev.addSource({ id, type: 'witness', label: d.who || d.name || 'A witness', reliability: d.reliability ?? 0.6, pending: d.pending ?? 0, where: { x: pos.x, z: pos.z }, onDeliver: () => incidentReported(inc, 'witness', src) });
    const desc = d.description;
    if (desc && typeof desc === 'object') {
      const o = normalizeOutfit(desc.outfit || desc.garments || desc) || { garments: {} };
      for (const slot of Object.keys(o.garments)) ev.observe(src, 'outfit.' + slot, o.garments[slot], 1);
      if (desc.face) ev.observe(src, 'face', { label: 'face' }, typeof desc.face === 'number' ? desc.face : 0.8);
      if (desc.weapon) ev.observe(src, 'weapon', typeof desc.weapon === 'string' ? { cls: desc.weapon, label: weaponWord(desc.weapon) } : { cls: reality().weaponVisible || 'handgun', label: weaponWord(reality().weaponVisible || 'handgun') }, 0.9);
      if (desc.vehicle || desc.plate) { const k = desc; const save = P.state.inVehicle; if (save || lastVehicleInfo) observe(src, { dist: desc.plate ? 6 : 14, kind: 'witness', k: 0.9, direction: false }); void k; }
      if (desc.direction) observeDirection(src, 0.9);
    } else observe(src, { dist: d.dist ?? 12, kind: 'witness', k: 0.9 });
    if (src.state === 'live') incidentReported(inc, 'witness', src);
  }
  const NAMES_F = ['Marisol', 'Dayana', 'Carmen', 'Tasha', 'Lourdes', 'Ines', 'Jo', 'Mirta', 'Bianca', 'Renee', 'Yoli', 'Petra'], NAMES_M = ['Rolando', 'Dre', 'Hector', 'Manny', 'Luis', 'Curtis', 'Abel', 'Joaquin', 'Teo', 'Wendell', 'Osvaldo', 'Rick'];
  function pedName(ped) {
    if (ped.name) return ped.name;
    const h = strHash(String(ped.id ?? ped.seed ?? 1)); const f = ped.char?.base === 'female' || ped.gender === 'f';
    return (f ? NAMES_F : NAMES_M)[h % 12];
  }
  function findWitnesses(pos, exclude, max = 3) {
    const out = [], tgt = new THREE.Vector3(pos.x, (pos.y || 0) + 1.2, pos.z);
    for (const ped of game.peds?.list || []) {
      if (ped === exclude || ped.active === false || ped.dead || ped.state === 'dead' || ped.state === 'down' || ped._gpCriminal || ped.isCop || !ped.pos) continue;
      if (S.witnesses.some((w) => w.ped === ped && w.state !== 'done')) continue;
      const d = distXZ(ped.pos, pos); if (d > 32) continue;
      if (!hasLOS(game, new THREE.Vector3(ped.pos.x, ped.pos.y + 1.6, ped.pos.z), tgt)) continue;
      out.push({ ped, d });
    }
    out.sort((a, b) => a.d - b.d);
    // bystander effect: the closest people call; the rest assume somebody already did
    return out.slice(0, max);
  }
  function addWitness(inc, who, o = {}) {
    const ped = who.ped || null, seed = strHash(String(ped?.id ?? o.name ?? inc.id));
    const reliability = o.reliability ?? clamp(0.35 + ((seed % 100) / 100) * 0.6, 0.3, 0.95);
    const courage = ((seed >>> 8) % 100) / 100, greed = ((seed >>> 16) % 100) / 100;
    const hasPhone = o.hasPhone ?? (ped ? ped.char?.hasPhone !== false && (seed >>> 4) % 10 > 1 : true);
    const callT = o.callT ?? (hasPhone ? rand(5, 8) : rand(13, 20)); // no phone: they have to run and find one
    const name = o.name || (ped ? pedName(ped) : 'A witness');
    const id = 'witness:' + (ped?.id ?? seed) + ':' + inc.id;
    const w = { id, ped, name, inc, reliability, courage, greed, hasPhone, state: 'calling', aimT: 0, clerk: !!o.clerk, pos: who.pos || ped?.pos, marker: null, d: who.d ?? 8, recallT: 0, bribe: Math.round((120 + inc.sev * 140 + greed * 200) / 10) * 10 };
    w.src = ev.addSource({ id, type: 'witness', label: o.label || (o.clerk ? name : `${name}, a bystander`), reliability, pending: callT, where: { x: inc.pos.x, z: inc.pos.z }, who: ped, pendingKind: hasPhone ? 'call' : 'run',
      onDeliver: (src) => { w.state = 'done'; observeDirectionFrom(w, src); incidentReported(inc, 'witness', src, w); } });
    // what they noticed, captured now (a witness reports what they saw at the time)
    observe(w.src, { dist: w.d, kind: 'witness', k: reliability, direction: false });
    tryCall('wit marker', () => { w.marker = buildWitnessMarker(THREE); game.scene.add(w.marker.sprite); });
    if (ped) { ped.state = hasPhone ? (ped.char?.hasPhone ? 'film' : 'cower') : 'flee'; ped.stateT = callT + 1; ped.threat = { x: inc.pos.x, z: inc.pos.z }; ped.pending = null; ped.idleStyle = hasPhone ? 'phone' : null; if (!hasPhone) ped.fleeT = callT; }
    S.witnesses.push(w); inc.wits.push(w);
    return w;
  }
  function observeDirectionFrom(w, src) { if (w.lastSeen) ev.observe(src, 'direction', w.lastSeen, w.reliability); }
  function dropWitness(w, how) {
    if (w.state === 'done') return;
    w.state = 'done';
    if (w.marker) { game.scene.remove(w.marker.sprite); w.marker.dispose?.(); w.marker = null; }
    if (how) { ev.cancelSource(w.id, how); game.emit?.('witness:stopped', { id: w.id, how, name: w.name }); }
  }
  let witnessHelp = null;
  function witnessTick(dt) {
    const pp = P.position, t = now();
    witnessHelp = null;
    for (let i = S.witnesses.length - 1; i >= 0; i--) {
      const w = S.witnesses[i], ped = w.ped, wp = ped?.pos || w.pos;
      if (w.state === 'done') {
        if (w.marker) { game.scene.remove(w.marker.sprite); w.marker.dispose?.(); w.marker = null; }
        // an intimidated witness with nerve calls once you are gone
        if (w.recallT > 0) { w.recallT -= dt; if (w.recallT <= 0 && ped && !ped.dead && ped.active !== false && distXZ(wp, pp) > 35) { const nw = addWitness(w.inc, { ped, d: w.d }, { callT: rand(6, 10), reliability: w.reliability * 0.9 }); nw.recalled = true; } if (w.recallT > 0) continue; }
        S.witnesses.splice(i, 1); continue;
      }
      const src = w.src;
      if (src.state !== 'pending') { dropWitness(w, null); continue; }
      const gone = ped && (ped.dead || ped.state === 'dead' || ped.state === 'down' || ped.active === false || !!ped.rag);
      if (gone) { dropWitness(w, 'silenced'); law.notify?.(`${w.name} never made the call.`, 2200); continue; }
      const d = wp ? distXZ(wp, pp) : 99;
      // they keep watching while they can see you: the direction you left in is part of the report
      if (wp && d < 60 && (w.seeT = (w.seeT || 0) - dt) <= 0) { w.seeT = 0.5; if (hasLOS(game, new THREE.Vector3(wp.x, wp.y + 1.6, wp.z), new THREE.Vector3(pp.x, pp.y + 1.2, pp.z))) w.lastSeen = directionNow(); }
      // intimidation: hold a gun on them
      const gun = !!game.weapons?.isGun?.(P.weapon) || P.weapon === 'bat' || P.weapon === 'knife';
      if (wp && gun && !P.state.inVehicle && d < (P.aiming ? 16 : 3.2)) {
        const yaw = game.cameraYaw ?? 0, ax = -Math.sin(yaw), az = -Math.cos(yaw), dx = (wp.x - pp.x) / (d || 1), dz = (wp.z - pp.z) / (d || 1);
        if ((P.aiming && ax * dx + az * dz > 0.965) || (!P.aiming && d < 3.2)) w.aimT += dt; else w.aimT = Math.max(0, w.aimT - dt * 2);
        if (w.aimT > (w.clerk ? 0.9 : 0.5) + w.courage * 0.5) {
          dropWitness(w, 'intimidated'); law.notify?.(`${w.name} drops the phone.`, 2000);
          if (ped) { ped.state = 'cower'; ped.stateT = 8; ped.handsUp = true; ped.idleStyle = null; }
          if (w.courage > 0.62) { w.recallT = rand(12, 20); } // brave ones call back once you leave
          continue;
        }
      } else w.aimT = Math.max(0, w.aimT - dt);
      // bribe: stand next to them
      if (wp && d < 2.4 && !P.state.inVehicle && !gun) {
        witnessHelp = `Press <b>B</b> to pay ${w.name} $${w.bribe} to hang up`;
        if (game.input?.pressed?.('KeyB')) {
          if (w.reliability > 0.86 && w.greed < 0.5) { law.notify?.(`${w.name}: "Keep your money. I saw what you did."`, 2600); src.eta = Math.min(src.eta, 1.5); w.bribe = 0; }
          else if (law.money.pay(w.bribe, 'bribe')) { dropWitness(w, 'bribed'); law.notify?.(`${w.name} pockets $${w.bribe} and hangs up.`, 2400); if (ped) { ped.state = 'walk'; ped.idleStyle = null; } continue; }
          else law.notify?.('Not enough cash.', 1600);
        }
      }
      if (ped && ped.state !== 'film' && ped.state !== 'cower' && ped.state !== 'flee') { ped.state = w.hasPhone ? 'film' : 'flee'; ped.stateT = 2; if (!w.hasPhone) { ped.threat = { x: pp.x, z: pp.z }; ped.fleeT = 3; } }
      if (w.marker && wp) { w.marker.sprite.position.set(wp.x, wp.y + 2.3 + Math.sin(t * 5) * 0.04, wp.z); w.marker.set(1 - src.eta / Math.max(0.1, src.total), w.hasPhone ? 'call' : 'run'); }
    }
  }

  // ================================================================== incidents
  let incSeq = 0;
  function incidentFor(type, pos) {
    const t = now();
    let inc = S.incidents.find((i) => t - i.t < 25 && distXZ(i.pos, pos) < 30);
    if (inc) { if ((core && inc.sev < (law.SEV[type] ?? 1))) { inc.type = type; inc.sev = law.SEV[type] ?? 1; inc.upgraded = true; } inc.t = t; return inc; }
    inc = { id: ++incSeq, type, pos: { x: pos.x, y: pos.y || 0, z: pos.z }, t, t0: t, sev: law.SEV[type] ?? 1, reported: false, reportedSev: 0, cams: [], wits: [], by: null };
    S.incidents.push(inc); if (S.incidents.length > 30) S.incidents.shift();
    return inc;
  }
  // somebody told the police: stars are added once per incident (again only if it got worse), footage starts being pulled
  function incidentReported(inc, by, src, w) {
    const first = !inc.reported;
    const worse = inc.sev > inc.reportedSev;
    inc.reported = true; inc.by = inc.by || by;
    for (const id of inc.cams) ev.setHold(id, false);
    if (first || worse) {
      const sev = first ? inc.sev : inc.sev - inc.reportedSev;
      inc.reportedSev = inc.sev;
      S.stats.reported++;
      const visual = by === 'officer' && !!law.police?.anySees?.();
      core.report({ type: inc.type, pos: inc.pos, severity: sev, stars: Math.min(3, inc.sev), by, visual, floorOnly: !first });
      law.onReported?.(inc, by, src, w);
    }
  }

  // d = the 'crime' event payload. Returns what observed it.
  function onCrime(d) {
    if (!d) return null;
    S.stats.crimes++;
    let type = d.type || 'assault';
    const pos = d.position ? new THREE.Vector3(d.position.x, d.position.y || 0, d.position.z) : P.position.clone();
    const victim = d.victim || null;
    if (victim && victim._gpCriminal && (type === 'assault' || type === 'murder')) { victim._gpHitByPlayer = true; return null; } // stopping a criminal is not a crime
    if (victim && victim.isCop) { if (type === 'murder') type = 'cop_murder'; else if (type === 'assault') type = 'cop_assault'; }
    if (law.SEV[type] === undefined && d.severity != null) law.SEV[type] = clamp(d.severity, 0, 3);
    const inc = incidentFor(type, pos);
    const seenBy = { officer: false, witnesses: 0, cameras: 0, alarm: false };
    const nearPlayer = distXZ(pos, P.position) < 40;
    // 1. officers: anything aimed at police is known at once; otherwise an officer has to see it
    const copVictim = type.startsWith('cop_') || !!d.police;
    const copSaw = copVictim || !!tryCall('copWitness', () => law.police?.copWitnessReal?.(pos), false) || (core.S.level > 0 && core.S.seen && nearPlayer);
    // 2. cameras that cover the spot
    const shop = game.interiors?.current || null;
    if (shop && nearPlayer) ensureStoreSecurity(shop);
    if (nearPlayer) for (const c of camerasNear(P.position, P.position.y)) { if (cameraSees(c, inc)) seenBy.cameras++; }
    if (copSaw) {
      seenBy.officer = true;
      const src = ev.addSource({ id: 'officer:units', type: 'officer', label: law.police?.witnessName?.() || 'Responding officer', reliability: 1 });
      if (nearPlayer && (law.police?.anySees?.() || copVictim)) observe(src, { dist: law.police?.nearestDist?.() ?? 15, kind: 'officer', k: 1 });
      incidentReported(inc, 'officer', src);
      return { inc, seenBy };
    }
    if (d.copOnly) { finishSilent(inc, seenBy); return { inc, seenBy }; }
    // 3. alarms (location only)
    if (d.alarm) { seenBy.alarm = true; const src = ev.addSource({ id: 'alarm:' + inc.id, type: 'alarm', label: d.alarmName || 'Alarm', pending: d.alarmDelay ?? 3, where: { x: pos.x, z: pos.z }, onDeliver: (s) => incidentReported(inc, 'alarm', s) }); void src; }
    // 4. witnesses: a clerk the store module vouches for, then bystanders with a line of sight
    if (!S.extWitness || d.witnessed === true) {
      if (d.witnessed === true && shop && (type === 'shoplift' || type === 'robbery') && !inc.wits.some((w) => w.clerk)) {
        const c = shop.clerk, cw = c && shop.toWorld ? tryCall('clerk pos', () => shop.toWorld(c.x, c.z), null) : null;
        const clerkName = c?.persona?.name ? `${c.persona.name}, clerk at ${shop.name}` : `The clerk at ${shop.name}`;
        addWitness(inc, { ped: null, pos: cw ? new THREE.Vector3(cw.x, shop.counterPos?.y || P.position.y, cw.z) : shop.counterPos, d: 3 }, { clerk: true, name: clerkName, label: clerkName, reliability: 0.85, callT: type === 'robbery' ? rand(5, 7) : rand(3, 4.5), hasPhone: true });
        seenBy.witnesses++;
      } else if (d.witnessed === true && !shop && !findWitnesses(pos, victim, 1).length && !inc.wits.length) {
        // another module vouches for a witness we cannot see in the pedestrian list
        addWitness(inc, { ped: null, pos, d: 8 }, { name: d.witnessName || 'A bystander', reliability: 0.6 }); seenBy.witnesses++;
      }
      if (!S.extWitness) {
        const room = Math.max(0, 3 - inc.wits.filter((w) => w.state !== 'done').length);
        for (const c of findWitnesses(pos, victim, room)) { addWitness(inc, c); seenBy.witnesses++; }
      }
    }
    if (!seenBy.witnesses && !seenBy.alarm && !inc.wits.length) finishSilent(inc, seenBy);
    else if (seenBy.witnesses) law.notify?.(seenBy.witnesses > 1 ? `${seenBy.witnesses} witnesses are calling it in.` : `${inc.wits[inc.wits.length - 1].name} is calling it in.`, 2400, { kind: 'witness' });
    return { inc, seenBy };
  }
  function finishSilent(inc, seenBy) { if (!inc.reported && !inc.wits.length) { S.stats.silent++; game.emit?.('crime:unseen', { type: inc.type, cameras: seenBy.cameras }); } }

  // ================================================================== recorder interaction (shoot it, hit it, or press X next to it)
  let recHelp = null;
  const _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
  game.on?.('shot', (d) => {
    if (!d?.origin || !d.dir) return;
    for (const [id, r] of recorders) {
      if (r.destroyed || distXZ(r.pos, P.position) > 30) continue;
      _ro.copy(r.pos).sub(d.origin); const along = _ro.dot(d.dir); if (along < 0) continue;
      _rd.copy(d.dir).multiplyScalar(along).sub(_ro);
      if (_rd.length() < 0.32) destroyRecorder(id, 'shot');
    }
  });
  game.on?.('punch', (d) => {
    const p = d?.position || P.position;
    for (const [id, r] of recorders) if (!r.destroyed && distXZ(r.pos, p) < 1.5 && Math.abs(r.pos.y - (p.y + 1)) < 1.6) destroyRecorder(id, 'smashed');
  });
  function recorderTick() {
    recHelp = null;
    const shop = game.interiors?.current;
    if (shop) ensureStoreSecurity(shop);
    if (P.state.inVehicle) return;
    for (const [id, r] of recorders) {
      r.model?.update?.(game.clock.dt, now());
      if (r.destroyed) continue;
      if (distXZ(r.pos, P.position) < 1.7 && Math.abs(r.pos.y - (P.position.y + 1)) < 1.8) {
        recHelp = 'Press <b>X</b> to smash the camera recorder';
        if (game.input?.pressed?.('KeyX')) destroyRecorder(id, 'smashed');
      }
    }
  }

  // ================================================================== tick
  function tick(dt) {
    tryCall('sense.witness', () => witnessTick(dt));
    tryCall('sense.recorder', () => recorderTick());
    tryCall('sense.trafficCams', () => trafficCamTick(dt));
    // swimming washes blood and soot off, and leaves you soaked for a while
    if (P.swimming) { swimT += dt; if (swimT > 6) { if (traces.delete('blood') | traces.delete('soot')) { /* washed */ } addTrace('wet'); } }
    else { swimT = 0; const w = traces.get('wet'); if (w && now() - w.t > 120) traces.delete('wet'); }
    // unreported incidents with held footage: nobody ever asked for it
    for (const inc of S.incidents) if (!inc.reported && !inc.dropped && now() - inc.t > 150) { inc.dropped = true; for (const id of inc.cams) ev.cancelSource(id, 'never reported'); }
  }
  const help = () => witnessHelp || recHelp;

  return { S, reality, hiddenNow, observe, observeDirection, directionNow, vehicleInfo, plateOf, repaint, changePlates, isOwned, setGarment, localOutfit, ditchWeapon, weaponCls,
    addTrace, shower, traces, registerCamera, registerRecorder, destroyRecorder, cameraSees, camerasNear, cams, recorders, ensureStoreSecurity, trafficCams: TC, trafficCamsNear,
    onCrime, incidentFor, incidentReported, addWitness, findWitnesses, tick, help, payTicket, issueTicket, get tickets() { return S.tickets; } };
}

// People (NPC-AI track): gives every pedestrian of src/npc/peds.js an identity, a unique look, a mind (traits ->
// behavior), a schedule-driven reason to be here, reactions by courage, witness reports, lines with speech bubbles,
// and a far instanced crowd tier (crowd.js) so streets read full at distance. game.people is the API; peds.js calls
// its hooks guarded (game.people?.dress?.()), so the game runs unchanged if this module fails.
import * as THREE from 'three';
import { unlockAllBodies, loadedBodies } from './library.js';
import { makeLook, applyLook, realizedSignature, crowdLook, settleHanging, lookAudit } from './look.js';
import { moodToday, districtKey } from './identity.js';
import { HERITAGE } from './identity.js';
import { PERSONAS } from './personality.js';
import { personParams, chooseReaction, witnessReport, personForPlace, streetDensity, sampleSchedule, activityAt } from './mind.js';
import { pickLine, lineCount } from './lines.js';
import { createCrowd, POSE } from './crowd.js';
import { createPeopleCrowd } from './people/farCrowd.js';
import { clamp } from './rand.js';
import { createTalk } from './talk.js';
import * as PR from './props.js';
import { createSignals, createSpots, createGovernor } from './streetlife.js';

export const order = 120;

export async function initV2(game) {
  const peds = game.peds;
  if (!peds || !Array.isArray(peds.list)) return;
  const now = () => game.clock?.elapsed ?? performance.now() / 1000;
  const hour = () => (((game.timeOfDay ?? 14) % 24) + 24) % 24;
  const weather = () => { const w = game.weather; const k = typeof w === 'string' ? w : (w?.kind || w?.type || w?.current || w?.state || 'clear'); return String(k).toLowerCase(); };
  const districtAt = (x, z) => { try { return game.city?.districtAt?.(x, z) || ''; } catch (e) { return ''; } };
  const zoneKey = (z) => (z === 'water' || z === 'causeway' ? 'beach' : z === 'downtown' ? 'business' : z || 'residential');

  // ---------------------------------------------------------------- bodies
  const bodyStatus = { unlocked: false, loaded: 0, total: 0 };
  unlockAllBodies().then((r) => { Object.assign(bodyStatus, r, { unlocked: !!r.ok }); }).catch((e) => console.warn('[people] bodies', e));
  let entryMap = new Map(), entryN = -1;
  const entryOf = (bodyId) => { const L = loadedBodies(); if (L.length !== entryN) { entryMap = new Map(L.map((e) => [e.id, e])); entryN = L.length; } return entryMap.get(bodyId) || null; };

  // ---------------------------------------------------------------- uniqueness audit
  const audit = { spawned: 0, crowdSpawned: 0, dup: 0, dupInView: 0, lookFailed: 0, applyFailed: 0, sigs: new Map(), dupList: [] };
  const record = (sig, idKey) => {
    const prev = audit.sigs.get(sig);
    if (prev !== undefined && prev !== idKey) { audit.dup++; if (audit.dupList.length < 10) audit.dupList.push(sig); }
    else audit.sigs.set(sig, idKey);
  };

  // ---------------------------------------------------------------- dress: identity + look + mind for a near (skinned) ped
  function stripLook(ch) {
    const kill = [];
    ch.root.traverse((o) => { if (o.userData?.npcAcc) kill.push(o); });
    for (const h of kill) { h.parent?.remove(h); h.traverse((m) => { if (m.isMesh) m.geometry?.dispose?.(); }); }
    const head = ch.getBone?.('Head'); if (head) head.scale.setScalar(1);
    ch.root.scale.setScalar(1);
  }
  function raceFit(id, entry) { const H = HERITAGE[id.heritage] || HERITAGE.mixed; return (H?.race?.[entry.race] ?? 0.1); }
  function dress(ped, { zone, act }) {
    const ch = ped.char; if (!ch?.human) return;
    // bodies outside the unlocked library (v1 boot set still streaming) get a minimal entry so they are still individuals
    const entry = entryOf(ch.human.id) || { id: ch.human.id, gender: ch.human.gender === 'f' ? 'f' : 'm', race: ch.human.race || 'mixed', zone: ch.human.zone || ch.zoneTag || 'casual', years: ch.human.years || 32, shells: ch.human.shells || [], clothes: [] };
    const x = ped.pos.x, z = ped.pos.z, h = hour(), district = districtAt(x, z), zk = zoneKey(zone);
    // pick, among people who would be out here now, the one whose heritage fits this body best
    let best = null, bs = -1;
    // the body's own clothes must fit the job: suits for office workers, work clothes for trades, swimwear on the beach
    const KIND_FIT = {
      business: { office: 1.2, care: 0.4 },
      port: { street: 0.9, trade: 1.2 },
      beach: { none: 0.8, street: 0.5, service: 0.4 },
      nightlife: { service: 0.6, none: 0.6 },
    };
    for (let k = 0; k < 7; k++) {
      const p = personForPlace({ zone: zk, district, hour: h, gender: entry.gender });
      const kind = p.id.jobDef?.kind || 'none';
      const fitTable = KIND_FIT[entry.zone];
      const jobFit = fitTable ? (fitTable[kind] || -0.8) : (kind === 'office' ? -0.3 : 0.3);
      const s = raceFit(p.id, entry) + jobFit + Math.random() * 0.05;
      if (s > bs) { bs = s; best = p; }
    }
    const id = best.id;
    const ctx = { zone: zk, hour: h, weather: weather(), activity: act, onShift: /^work/.test(best.act.act), noCarry: act !== 'walk' };
    let L = null;
    for (let salt = 0; salt < 4 && !L; salt++) L = makeLook(id, ctx, [entry], null, salt);
    if (!L) { audit.lookFailed++; return; }
    let applied = null;
    try { stripLook(ch); applied = applyLook(ch, L); }
    catch (e) { audit.applyFailed++; console.warn('[people] applyLook', e); try { ch.root.scale.setScalar(1); } catch (e2) { /* */ } }
    const mood = moodToday(id, Math.floor((game.clock?.elapsed ?? 0) / 1440), weather());
    ped.identity = id; ped.look = L; ped.applied = applied; ped.mood = mood; ped.doing = best.act.act;
    ped.personality = id.persona;
    ped.P = personParams(id, PERSONAS[id.persona] || PERSONAS.calm, mood);
    ped.tough = Math.random() < ped.P.fight;
    ped.call = Math.random() < ped.P.call;
    if (act !== 'jog') ped.walkSpeed = clamp(L.gait.speed * (zk === 'beach' ? 0.85 : 1) * (mood < 0.35 ? 0.94 : 1) * (best.act.act === 'commute' ? 1.1 : 1), 0.5, 2.1);
    try { ch.setPersonality?.(ped.personality); } catch (e) { /* */ }
    const sig = applied ? realizedSignature(ch, applied, L) : L.sig;
    ped.sig = sig;
    audit.spawned++; record(sig, id.id);
    // two people in view must never be the same body with the same colors
    for (const o of peds.list) if (o !== ped && o.active && o.sig && o.sig.split('|').slice(0, 3).join('|') === sig.split('|').slice(0, 3).join('|')) audit.dupInView++;
    roster.set(ped, id);
  }
  function undress(ch) { try { stripLook(ch); } catch (e) { /* */ } }
  const roster = new Map();

  // ---------------------------------------------------------------- reactions
  const reactStats = {};
  function react(ped, ev) {
    const id = ped.identity; if (!id) return null;
    if (ped.act === 'swim') return 'swimAway';
    const src = ev.src === 'crash' ? 'crash' : 'shot';
    const r = chooseReaction(id, { src, d: ev.d, phone: id.ageGroup !== 'kid' });
    const band = id.traits.courage < 0.33 ? 'low' : id.traits.courage < 0.66 ? 'mid' : 'high';
    ((reactStats[ev.src] ||= {})[band] ||= {})[r] = (reactStats[ev.src][band][r] || 0) + 1;
    ped.lastSrc = ev.src;
    return r;
  }
  function seenNow() {
    const P = game.player || {}; const v = P.vehicle || P.state?.vehicle;
    const vel = P.velocity || P.state?.velocity; let heading = null;
    if (vel && Math.hypot(vel.x || 0, vel.z || 0) > 1) { const a = Math.atan2(vel.x, -vel.z); heading = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
    return { gender: 'm', vehicle: P.state?.inVehicle ? (v?.def?.name || v?.name || 'car') : null, vehicleColor: v?.colorName || null, weapon: P.weapon && !/fist|unarmed|none/.test(P.weapon) ? String(P.weapon) : null, heading };
  }
  const witnessLog = [];
  function callDone(ped, pe) {
    const id = ped.identity; if (!id) return;
    const what = pe.src === 'crash' ? 'crash' : pe.src === 'threat' ? 'threats' : pe.src === 'weapon' ? 'armed person' : pe.src === 'hit' || pe.src === 'knockdown' ? 'assault' : 'shots fired';
    const rep = witnessReport(id, what, { x: pe.x, z: pe.z }, Math.hypot(ped.pos.x - pe.x, ped.pos.z - pe.z), seenNow());
    witnessLog.push(rep); if (witnessLog.length > 40) witnessLog.shift();
    try { game.emit?.('witness', rep); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------- lines and speech bubbles
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;overflow:hidden;font:600 13px/1.25 system-ui,-apple-system,sans-serif';
  document.body.appendChild(layer);
  const bubbles = []; const lineLog = []; let lastGlobal = 0;
  const _hp = new THREE.Vector3();
  function say(ped, situation, ctx = {}) {
    const id = ped?.identity; if (!id || !ped.active || ped.dead) return null;
    const t = now();
    if (ped.sayT && t - ped.sayT < (ctx.force ? 1.5 : 7)) return null;
    const cam = game.camera?.position; if (cam && Math.hypot(ped.pos.x - cam.x, ped.pos.z - cam.z) > (ctx.far ? 45 : 32)) return null;
    if (!ctx.force && t - lastGlobal < 0.7) return null;
    const text = pickLine(id, situation, ctx); if (!text) return null;
    ped.sayT = t; lastGlobal = t;
    lineLog.push({ t: Math.round(t), who: id.name, voice: id.voice, situation, text }); if (lineLog.length > 200) lineLog.shift();
    bubble(ped, text);
    try { game.emit?.('pedLine', { ped, text, situation, voice: id.voice, name: id.name }); } catch (e) { /* */ }
    return text;
  }
  function bubble(ped, text, ms = 0) {
    const t = now();
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i].ped === ped || (ped.isPlayer && bubbles[i].ped.isPlayer)) {
        bubbles[i].el.remove();
        bubbles.splice(i, 1);
      }
    }
    while (bubbles.length >= 5) { const b = bubbles.shift(); b.el.remove(); }
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;top:0;max-width:240px;padding:5px 9px;border-radius:10px;background:rgba(250,248,242,0.93);color:#1d1d1f;box-shadow:0 2px 8px rgba(0,0,0,0.25);transform:translate(-50%,-100%);white-space:normal;text-align:center;opacity:0;transition:opacity .2s';
    el.textContent = text;
    layer.appendChild(el); requestAnimationFrame(() => { el.style.opacity = '1'; });
    if (ped.isPlayer) el.style.background = 'rgba(255,214,120,0.95)';
    bubbles.push({ el, ped, until: t + (ms ? ms / 1000 : 2.2 + text.length * 0.045) });
  }
  function voiceLine(ped, kind) {
    const m = { greet: 'greet', drunk: 'greet', apologise: 'bumped', insult: 'bumped', argue: 'bumped', scream: ped.lastSrc === 'crash' ? 'crash' : 'gunfire' };
    if (m[kind]) say(ped, m[kind], { force: kind !== 'greet' });
  }
  function updateBubbles() {
    const cam = game.camera; if (!cam) return;
    const W = window.innerWidth, H = window.innerHeight, t = now();
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; const p = b.ped;
      if (t > b.until || !p.active || p.dead) { b.el.remove(); bubbles.splice(i, 1); continue; }
      _hp.set(p.pos.x, p.pos.y + (p.look?.height || 1.75) + 0.32, p.pos.z).project(cam);
      if (_hp.z > 1 || Math.abs(_hp.x) > 1.1 || Math.abs(_hp.y) > 1.1) { b.el.style.display = 'none'; continue; }
      b.el.style.display = ''; b.el.style.left = ((_hp.x + 1) / 2 * W).toFixed(1) + 'px'; b.el.style.top = ((1 - _hp.y) / 2 * H).toFixed(1) + 'px';
    }
  }

  // ---------------------------------------------------------------- awareness: honks, weapon out, car comments, weather, chat
  function nearPeds(c, r) { const out = []; for (const p of peds.list) if (p.active && !p.dead && p.identity && p.state !== 'cop' && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < r) out.push(p); return out; }
  function honk(pos) {
    if (!pos) return;
    let spoke = 0;
    for (const p of nearPeds(pos, 16)) {
      const T = p.identity.traits; p.lookUntil = now() + 2.5;
      if (p.state === 'walk' || p.state === 'talk' || p.state === 'bench' || p.state === 'lean') {
        if (T.temper > 0.66 && T.courage > 0.5) { p.state = 'argue'; p.argueT = 2.5 + T.temper * 2; p.shoveBack = false; }
        else if (T.nerve < 0.3) { p.state = 'flee'; p.fleeT = 1.2; p.threat = { x: pos.x, z: pos.z }; p.scream = false; }
        else if (p.nav?.cross) p.walkBoostT = 3;
      }
      if (spoke < 2 && say(p, 'honked', { force: true })) spoke++;
    }
  }
  try { game.on?.('honk', (e) => honk(e?.position || e?.pos || game.player?.position)); game.on?.('horn', (e) => honk(e?.position || e?.pos || game.player?.position)); } catch (e) { /* */ }
  let honkCd = 0;
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyH' || e.repeat || !game.player?.state?.inVehicle || now() < honkCd) return;
    honkCd = now() + 0.6; honk(game.player.position);
  });
  let senseT = 0, ambientT = 0, carT = 0;
  function sense(dt) {
    senseT -= dt; if (senseT > 0) return; senseT = 0.4;
    const P = game.player; if (!P?.position) return;
    const pp = P.position, inCar = !!P.state?.inVehicle;
    // weapon out on foot: people who can see it react by courage
    const armed = !inCar && P.weapon && !/fist|unarmed|none|phone/.test(String(P.weapon)) && (P.aiming || P.weaponDrawn !== false);
    if (armed) {
      const fx = Math.sin(P.heading || 0), fz = Math.cos(P.heading || 0);
      for (const p of nearPeds(pp, 14)) {
        if (p.sawWeapon || !['walk', 'talk', 'bench', 'lean', 'dance', 'garden'].includes(p.state)) continue;
        const dx = pp.x - p.pos.x, dz = pp.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
        const facing = (Math.sin(p.heading) * dx + Math.cos(p.heading) * dz) / d;
        if (facing < -0.2 && d > 4) continue; // behind them
        p.sawWeapon = true;
        const r = chooseReaction(p.identity, { src: 'weapon', d, phone: true });
        ((reactStats.weapon ||= {})[p.identity.traits.courage < 0.33 ? 'low' : p.identity.traits.courage < 0.66 ? 'mid' : 'high'] ||= {})[r] = 1 + (reactStats.weapon[p.identity.traits.courage < 0.33 ? 'low' : p.identity.traits.courage < 0.66 ? 'mid' : 'high'][r] || 0);
        p.lastSrc = 'weapon';
        if (r !== 'ignore') p.pending = { react: r, x: pp.x, z: pp.z, t: 0.2 + Math.random() * 0.5, src: 'weapon' };
        say(p, 'weapon', { force: true });
      }
      void fx; void fz;
    }
    // slow car next to people: comments on the car
    const v = P.vehicle || P.state?.vehicle;
    if (inCar && v && Math.abs(v.speedKmh || 0) < 18 && now() > carT) {
      const cand = nearPeds(pp, 9).filter((p) => p.state === 'walk' || p.state === 'lean' || p.state === 'bench');
      if (cand.length) {
        const p = cand[(Math.random() * cand.length) | 0]; const T = p.identity.traits;
        const worn = (v.health ?? 1000) < 500 || (v.damage ?? 0) > 0.5;
        const praise = !worn && (Math.random() < 0.35 + T.kindness * 0.4 - (p.identity.voice === 'snob' ? 0.4 : 0));
        if (Math.random() < 0.25 + T.talk * 0.5 && say(p, praise ? 'carPraise' : 'carInsult', { car: v.def?.kind || v.def?.class || 'car' })) carT = now() + 14;
        else carT = now() + 4;
      }
    }
    // ambient: weather remarks and group chat
    ambientT -= 0.4;
    if (ambientT <= 0) {
      ambientT = 3 + Math.random() * 3;
      const near = nearPeds(game.camera?.position || pp, 26);
      const talkers = near.filter((p) => p.state === 'talk' && p.group);
      if (talkers.length && Math.random() < 0.8) { const p = talkers[(Math.random() * talkers.length) | 0]; if (p.identity.traits.talk > 0.25) say(p, 'chat'); }
      else if (near.length) {
        const w = weather(), h = hour();
        const sit = /rain|storm|shower/.test(w) ? 'rain' : h >= 11 && h < 17 ? 'heat' : null;
        const p = near[(Math.random() * near.length) | 0];
        if (sit && Math.random() < 0.35) say(p, sit);
      }
    }
  }

  // ---------------------------------------------------------------- far tier: instanced crowd on the sidewalks
  const NAV = peds._nav || null;
  let crowd = null;
  // the far tier wears the user's own people (src/npc/people/farCrowd.js: each person's LOD2 mesh, GPU-skinned by the
  // game's clips); '?farcrowd=old' = the procedural mannequin body (crowd.js) for A/B
  // user (Nov 17): every NPC is one of the user's models, repeats are fine -> on by default; '?farcrowd=old' = A/B
  const FAR_PEOPLE = !(typeof location !== 'undefined' && /[?&](farcrowd=old|people=0|npc=legacy)/.test(location.search));
  try { if (NAV) crowd = FAR_PEOPLE ? createPeopleCrowd(game, { max: 380 }) : createCrowd(game, { max: 380, castShadow: false }); } catch (e) { console.warn('[people] crowd', e); crowd = null; }
  if (!crowd && NAV) { try { crowd = createCrowd(game, { max: 380, castShadow: false }); } catch (e) { crowd = null; } }
  const walkers = [];
  let towelN = 0;
  // playtest: "too few people" -> 240 at full street density (was 170); people fade (dithered) instead of popping
  const crowdCfg = { target: 240, near: 30, far: 185, enabled: true, fadeRate: 2.0 };
  if (crowd) {
    crowd.setBands(0, 0.01, crowdCfg.far - 18, crowdCfg.far);
  }
  // npc-life: walk signals, stationary spots, frame-budget governor, district weights
  const signals = createSignals(game);
  const spots = createSpots(game);
  const governor = createGovernor(game);
  crowdCfg.target = FAR_PEOPLE ? 200 : 300;   // real meshes cost more per person than the mannequin: a few less, still full streets
  const lifeStats = { sit: 0, cafe: 0, group: 0, doorOut: 0, enteredShop: 0, signalWaits: 0, panics: 0, avoid: 0 };
  function districtWeight(x, z) {
    const zone = NAV ? NAV.zoneAt(x, z) : 'residential';
    const dk = districtKey(zoneKey(zone), districtAt(x, z));
    const h = hour();
    const night = h >= 21 || h < 3;
    let k = { beach: 1.3, brickell: 1.3, downtown: 1.25, wynwood: 1.2, havana: 0.9, overtown: 0.7, haiti: 0.7, port: 0.5, keys: 0.6, airport: 0.5, rural: 0.15 }[dk] ?? 0.4;
    if (night && (zone === 'nightlife' || dk === 'wynwood' || dk === 'beach')) {
      k *= 1.35;
    }
    return k;
  }
  const rainy = () => /rain|storm|shower/.test(weather());
  // far tier wears the user's people (src/npc/people/cast.js palettes: skin, top, bottom, hair, shoes, sleeve and leg cut)
  function farLook(L, pos, still = false) {
    const base = crowdLook(L);
    const cast = game.npc?.cast; if (!cast?.farPerson) return base;
    try {
      const zn = NAV ? NAV.zoneAt(pos.x, pos.z) : 'residential'; const p = cast.farPerson(zn, pos, still && (zn === 'beach' || zn === 'water') ? 'sunbathe' : null); const c = p?.cols; if (!c) return base;
      L.height = p.height * (0.97 + Math.random() * 0.06); L.gender = p.g; L.personId = p.id;
      const f = p.g === 'f';
      return { ...base, personId: p.id, gender: p.g, skin: c.skin ?? base.skin, top: c.top ?? base.top, bottom: c.bottom ?? base.bottom, hair: c.hair ?? base.hair, shoes: c.shoes ?? base.shoes,
        sleeve: c.sleeve ?? base.sleeve, leg: c.leg ?? base.leg, hatKind: c.hat ? 1 : 0, hat: c.hat ? (c.hair ?? base.hat) : base.hat,
        hairStyle: f ? (base.hairStyle >= 2 ? base.hairStyle : 3) : Math.min(1, base.hairStyle ?? 1), bust: f ? Math.max(0.6, base.bust || 0.8) : 0,
        girth: p.build === 'heavy' ? 1.25 : f ? Math.min(base.girth ?? 1, 1.05) : base.girth };
    } catch (e) { return base; }
  }
  function placeStill(w, spot, pose, cadence) {
    w.still = true;
    w.pose = pose;
    w.spotKey = spot.key || null;
    spots.take(w.spotKey);
    w.pos.set(spot.x, spot.y, spot.z);
    w.gy = spot.y;
    w.heading = spot.heading ?? w.heading;
    crowd.setPose(w.i, pose, cadence, w.phase, 1);
    crowd.setTransform(w.i, w.pos.x, w.gy, w.pos.z, w.heading, w.look.height);
  }
  // gait: stride length follows leg swing and body height, cadence follows speed, so feet plant without sliding
  const STRIDE_REF = 1.41; // meters per full cycle of the crowd walk at amp 1 for a 1.75 m person
  function gaitFor(w) {
    const sc = (w.look?.height || 1.75) / 1.75;
    const amp = clamp(0.78 + 0.3 * (w.speed / 1.35), 0.8, 1.15) * (w.ampJit || 1);
    const stride = STRIDE_REF * amp * sc;
    const cadence = (Math.PI * 2 * w.speed) / stride;
    return { cadence, amp };
  }
  const _fwd = new THREE.Vector3();
  const _rayO = { x: 0, y: 0, z: 0 };
  const _rayD = { x: 0, y: -1, z: 0 };
  function surfaceY(x, z, hint) {
    try {
      const R = game.RAPIER;
      const W = game.world;
      if (!R || !W) {
        return hint;
      }
      _rayO.x = x;
      _rayO.y = hint + 3;
      _rayO.z = z;
      const hit = W.castRay(new R.Ray(_rayO, _rayD), 8, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC | (R.QueryFilterFlags.EXCLUDE_KINEMATIC || 0) | R.QueryFilterFlags.EXCLUDE_SENSORS);
      if (hit && Number.isFinite(hit.timeOfImpact)) {
        const y = _rayO.y - hit.timeOfImpact;
        // trust the physics ground only when it is close to the navigation ground (not a roof or a pier above)
        if (Math.abs(y - hint) < 1.2) {
          return y;
        }
      }
    } catch (e) {
      // keep the hint
    }
    return hint;
  }
  function spawnWalker(cam, beachy) {
    // denser near the viewer and in front of the camera (people behind you are never seen)
    game.camera.getWorldDirection(_fwd);
    let pos = null, bestDot = -2;
    const lounger = beachy && NAV.sandPoint && Math.random() < 0.6;
    const shoreWalker = beachy && NAV.sandPoint && !lounger && Math.random() < 0.6;
    for (let k = 0; k < 3; k++) {
      const r = crowdCfg.near + 12 + Math.pow(Math.random(), 1.4) * (crowdCfg.far - crowdCfg.near - 25);
      const q = lounger ? NAV.sandPoint(cam, r) : shoreWalker ? NAV.sandPoint(cam, r, true) : NAV.sidewalkNear(cam, r);
      if (!q) continue;
      if (NAV.spotOK && !NAV.spotOK(q.x, q.z)) continue; // never on a carriageway, highway, bridge or deck
      const dx = q.x - cam.x, dz = q.z - cam.z, dl = Math.hypot(dx, dz) || 1, dot = (dx * _fwd.x + dz * _fwd.z) / dl;
      // far away: prefer in front (where people are seen); closer: prefer behind or beside the camera, so nobody
      // appears in plain sight
      const score = dl > 110 ? dot : -dot;
      if (score > bestDot) { bestDot = score; pos = q; }
    }
    if (!pos) return false;
    const d = Math.hypot(pos.x - cam.x, pos.z - cam.z); if (d < crowdCfg.near + 6) return false;
    const zone = NAV.zoneAt(pos.x, pos.z); if (zone === 'water') return false;
    const bodies = loadedBodies(); if (!bodies.length) return false;
    const h = hour(), zk = zoneKey(zone), district = districtAt(pos.x, pos.z);
    const pick = personForPlace({ zone: zk, district, hour: h });
    const L = makeLook(pick.id, { zone: zk, hour: h, weather: weather(), activity: 'walk', onShift: /^work/.test(pick.act.act), noCarry: true }, bodies, null, 0);
    if (!L) { audit.lookFailed++; return false; }
    const i = crowd.alloc(); if (i < 0) return false;
    const w = { i, pos: new THREE.Vector3(pos.x, pos.y || 0, pos.z), nav: null, heading: Math.random() * 6.28, id: pick.id, look: L, speed: L.gait.speed, gy: NAV.groundAt(pos.x, pos.z, pos.y || 0), phase: Math.random() * 6.28, still: lounger, fade: 0, leaving: false, ampJit: 0.92 + Math.random() * 0.16 };
    crowd.setFade(i, 0);
    crowd.setLook(i, farLook(L, w.pos, w.still));
    if (lounger) { // beach crowd: lying, sitting, standing around, talking, playing
      // sit on the surface that is really there (physics ground), so neither the person nor the towel hovers (playtest P4)
      w.gy = surfaceY(w.pos.x, w.pos.z, w.gy);
      const LP = [POSE.lie, POSE.lie, POSE.lieFront, POSE.sitGround, POSE.sitGround, POSE.lounge, POSE.stand, POSE.talk, POSE.talk, POSE.phone, POSE.sip]; // no volleyball players
      const pose = LP[(Math.random() * LP.length) | 0];
      w.pose = pose; crowd.setPose(i, pose, pose === POSE.talk || pose === POSE.volley ? 2.2 : 1, w.phase, 1);
      crowd.setTransform(i, w.pos.x, w.gy, w.pos.z, w.heading, L.height, pose === POSE.lie || pose === POSE.lieFront ? 1.5 : 1);
      if ((pose === POSE.lie || pose === POSE.lieFront || pose === POSE.sitGround || pose === POSE.lounge) && towelN < 60) {
        // a towel under people lying or sitting on the sand
        const towel = PR.beachTowel((i * 7919 + walkers.length) >>> 0);
        towel.position.set(w.pos.x, w.gy + 0.012, w.pos.z);
        towel.rotation.y = w.heading;
        towel.receiveShadow = true;
        game.scene.add(towel);
        w.towel = towel;
        towelN++;
      }
    } else if (shoreWalker) { // walking the waterline
      w.shore = true;
      let bestH = 0, bestS = -1;
      for (let a = 0; a < 8; a++) {
        const h2 = (a / 8) * Math.PI * 2;
        let sc = 0;
        for (const dd of [6, 12, 18]) {
          const x2 = w.pos.x + Math.sin(h2) * dd, z2 = w.pos.z + Math.cos(h2) * dd;
          if (NAV.zoneAt(x2, z2) === 'beach' && !game.city?.isWater?.(x2, z2)) sc++;
        }
        if (sc > bestS) { bestS = sc; bestH = h2; }
      }
      w.heading = bestH;
      w.speed = Math.min(1.3, w.speed);
      const g0 = gaitFor(w);
      crowd.setPose(i, POSE.walk, g0.cadence, w.phase, g0.amp);
    } else {
      // npc-life routines by what this person is out doing (mind.js activityAt)
      const act = pick.act.act;
      w.act = act;
      const r = Math.random();
      const h2 = h;
      const meal = (h2 >= 11.5 && h2 < 14.5) || (h2 >= 18 && h2 < 23);
      const wet = rainy();
      let spot = null;
      if (!wet && (act === 'lunch' || act === 'dinner' || (meal && r < 0.25))) {
        spot = spots.cafeSeat(pos.x, pos.z, 0, 25);
        if (spot) {
          placeStill(w, spot, Math.random() < 0.7 ? POSE.sitEat : POSE.sit, 1.6);
          lifeStats.cafe++;
        }
      } else if (!wet && (act === 'socialize' || r < 0.1)) {
        spot = spots.benchSeat(pos.x, pos.z, 0, 30);
        if (spot) {
          placeStill(w, spot, Math.random() < 0.25 ? POSE.sitEat : POSE.sit, 1.2);
          lifeStats.sit++;
        }
      }
      if (!spot && r > 0.88 && (act === 'errands' || act === 'stroll' || act === 'lunch')) {
        // walking out of a shop door onto the sidewalk
        const dr = spots.door(pos.x, pos.z, 0, 25);
        if (dr) {
          w.pos.set(dr.x, dr.y, dr.z);
          w.gy = dr.y;
          w.heading = dr.facing;
          w.exitT = 2.2;
          lifeStats.doorOut++;
        }
      }
      if (!w.still) {
        w.nav = NAV.navFromPos(w); if (!w.nav) { spots.free(w.spotKey); crowd.release(i); return false; }
        if (act === 'exercise' && Math.random() < 0.6) {
          w.jog = true;
          w.speed = 2.6 + Math.random() * 0.6;
        } else if (wet) {
          w.speed = Math.min(2.0, w.speed * 1.3);
        }
        w.baseSpeed = w.speed;
        const g1 = gaitFor(w);
        crowd.setPose(i, w.jog ? POSE.run : POSE.walk, w.jog ? g1.cadence * 0.62 : g1.cadence, w.phase, w.jog ? 0.75 : g1.amp);
      }
    }
    walkers.push(w); audit.crowdSpawned++; record('crowd|' + L.sig, pick.id.id);
    return true;
  }
  /** a small group talking on the sidewalk in front of a shop (2-4 people in a ring) */
  function spawnGroup(cam) {
    const r = crowdCfg.near + 10 + Math.random() * 110;
    const q = NAV.sidewalkNear(cam, r);
    if (!q || rainy()) {
      return 0;
    }
    const g = spots.group(q.x, q.z, 0, 30);
    if (!g || Math.hypot(g.x - cam.x, g.z - cam.z) < crowdCfg.near + 6 || (NAV.spotOK && !NAV.spotOK(g.x, g.z))) {
      return 0;
    }
    spots.take(g.key);
    const zone = NAV.zoneAt(g.x, g.z);
    const zk = zoneKey(zone);
    const bodies = loadedBodies();
    if (!bodies.length) {
      return 0;
    }
    const h = hour();
    const night = h >= 21 || h < 3;
    let made = 0;
    for (let m = 0; m < g.n; m++) {
      const pick = personForPlace({ zone: zk, district: districtAt(g.x, g.z), hour: h });
      const L = makeLook(pick.id, { zone: zk, hour: h, weather: weather(), activity: 'talk', noCarry: true }, bodies, null, m);
      if (!L) {
        continue;
      }
      const i = crowd.alloc();
      if (i < 0) {
        break;
      }
      const a = (m / g.n) * Math.PI * 2 + Math.random() * 0.4;
      const rad = 0.55 + g.n * 0.12;
      const x = g.x + Math.sin(a) * rad;
      const z = g.z + Math.cos(a) * rad;
      const w = { i, pos: new THREE.Vector3(x, g.y, z), nav: null, heading: a + Math.PI, id: pick.id, look: L, speed: L.gait.speed, gy: g.y, phase: Math.random() * 6.28, still: true, fade: 0, leaving: false, ampJit: 1, groupKey: m === 0 ? g.key : null };
      crowd.setFade(i, 0);
      crowd.setLook(i, farLook(L, w.pos, w.still));
      const roll = Math.random();
      const pose = night && roll < 0.3 ? POSE.dance : roll < 0.62 ? POSE.talk : roll < 0.74 ? POSE.argue : roll < 0.86 ? POSE.sip : roll < 0.94 ? POSE.phone : POSE.film;
      w.pose = pose;
      crowd.setPose(i, pose, pose === POSE.dance ? 3 : 2.2, w.phase, 1);
      crowd.setTransform(i, x, g.y, z, w.heading, L.height);
      walkers.push(w);
      audit.crowdSpawned++;
      record('crowd|' + L.sig, pick.id.id);
      made++;
    }
    lifeStats.group++;
    return made;
  }
  // ---- gunfire: the crowd tier panics (run away along the sidewalk, cower, or stop and call)
  function crowdPanic(x, z, radius) {
    for (const w of walkers) {
      if (w.leaving || w.shore) {
        continue;
      }
      const d = Math.hypot(w.pos.x - x, w.pos.z - z);
      if (d > radius) {
        continue;
      }
      lifeStats.panics++;
      w.panicT = 8 + Math.random() * 6;
      w.threat = { x, z };
      const roll = Math.random();
      if (w.still && roll < 0.3) {
        w.cowerT = 2 + Math.random() * 2.5;
        crowd.setPose(w.i, POSE.cower, 1, null, 1);
      } else if (roll > 0.88 && d > 25) {
        w.callT = 4 + Math.random() * 4;
        crowd.setPose(w.i, POSE.call, 1, null, 1);
      } else {
        w.cowerT = 0;
      }
      if (w.still) {
        spots.free(w.spotKey);
        spots.free(w.groupKey);
        w.still = false;
        w.pose = null;
        w.nav = NAV.navFromPos(w);
        if (!w.nav) {
          w.leaving = true;
        }
      }
    }
  }
  try {
    game.on?.('shot', (e) => {
      const o = e?.origin;
      if (o) {
        crowdPanic(o.x, o.z, 90);
      }
    });
  } catch (e) { /* */ }
  // ---- avoidance grid (fixed arrays, no per-frame allocation)
  const GRID = 4096;
  const gHead = new Int32Array(GRID);
  const gNext = new Int32Array(1024);
  const gCell = (x, z) => ((((Math.floor(x / 2.5) * 73856093) ^ (Math.floor(z / 2.5) * 19349663)) >>> 0) & (GRID - 1));
  function buildGrid() {
    gHead.fill(-1);
    const n = Math.min(walkers.length, gNext.length);
    for (let k = 0; k < n; k++) {
      const w = walkers[k];
      const c = gCell(w.pos.x, w.pos.z);
      gNext[k] = gHead[c];
      gHead[c] = k;
    }
  }
  /** someone within 1.3 m ahead in a narrow cone: returns -1/1 (which side they are on), or 0 */
  function blockedAhead(w, k) {
    const fx = Math.sin(w.heading);
    const fz = Math.cos(w.heading);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        let j = gHead[gCell(w.pos.x + ox * 2.5, w.pos.z + oz * 2.5)];
        while (j >= 0) {
          if (j !== k) {
            const o = walkers[j];
            if (!o) {
              break;
            }
            const dx = o.pos.x - w.pos.x;
            const dz = o.pos.z - w.pos.z;
            const ahead = dx * fx + dz * fz;
            const side = dx * fz - dz * fx;
            if (ahead > 0.1 && ahead < 1.4 && Math.abs(side) < 0.6) {
              return side >= 0 ? 1 : -1;
            }
          }
          j = gNext[j];
        }
      }
    }
    return 0;
  }
  let crowdFrame = 0;
  /** per-walker street behavior; returns true when it moved the walker itself (skip the plain sidewalk step) */
  function lifeStep(w, n, dt) {
    // panic after gunfire: cower or call first, then run away along the sidewalk
    if (w.panicT > 0) {
      w.panicT -= dt;
      if (w.cowerT > 0 || w.callT > 0) {
        w.cowerT = (w.cowerT || 0) - dt;
        w.callT = (w.callT || 0) - dt;
        if (w.cowerT <= 0 && w.callT <= 0) {
          crowd.setPose(w.i, POSE.panic, 11, null, 1);
        }
        return true;
      }
      if (!w.panicPose) {
        w.panicPose = true;
        crowd.setPose(w.i, Math.random() < 0.5 ? POSE.panic : POSE.run, 11, null, 1);
      }
      if (w.nav && w.threat) {
        const away = (w.pos.x - w.threat.x) * Math.sin(w.heading) + (w.pos.z - w.threat.z) * Math.cos(w.heading);
        if (away < 0 && !w.nav.cross) {
          w.nav.dir *= -1;
        }
      }
      w.curSpeed = 4.4;
      if (w.panicT <= 0) {
        w.panicPose = false;
        w.curSpeed = null;
        const g = gaitFor(w);
        crowd.setPose(w.i, POSE.walk, g.cadence, null, g.amp);
      }
      return false;
    }
    // walking out of a shop door to the sidewalk
    if (w.exitT > 0) {
      w.exitT -= dt;
      w.pos.x += Math.sin(w.heading) * w.speed * dt;
      w.pos.z += Math.cos(w.heading) * w.speed * dt;
      crowd.setTransform(w.i, w.pos.x, w.gy, w.pos.z, w.heading, w.look.height);
      return true;
    }
    // walking into a shop: straight to the door, then gone inside (dithered fade)
    if (w.goal) {
      const dx = w.goal.x - w.pos.x;
      const dz = w.goal.z - w.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) {
        if (!w.leaving) {
          lifeStats.enteredShop++;
        }
        w.leaving = true;
        return true;
      }
      const hd = Math.atan2(dx, dz);
      w.heading += Math.atan2(Math.sin(hd - w.heading), Math.cos(hd - w.heading)) * Math.min(1, dt * 5);
      w.pos.x += (dx / d) * w.speed * dt;
      w.pos.z += (dz / d) * w.speed * dt;
      crowd.setTransform(w.i, w.pos.x, w.gy, w.pos.z, w.heading, w.look.height);
      return true;
    }
    const nc = w.nav?.cross;
    // walk signal: wait at the corner (standing, some on the phone) until the walk phase
    if (nc && nc.node !== undefined && !w.jog) {
      if (((nc.sig || 0) - dt) <= 0) {
        nc.sig = 0.5;
        const ws = signals.walkState(nc.node, nc.x - w.pos.x, nc.z - w.pos.z);
        if (!ws || ws.walk) {
          nc.node = undefined;
          if (w.waiting) {
            w.waiting = false;
            const g = gaitFor(w);
            crowd.setPose(w.i, POSE.walk, g.cadence, null, g.amp);
          }
        } else if (!w.waiting) {
          w.waiting = true;
          lifeStats.signalWaits++;
          crowd.setPose(w.i, Math.random() < 0.3 ? POSE.phone : POSE.stand, 1, null, 1);
        }
      } else {
        nc.sig -= dt;
      }
      if (w.waiting) {
        return true;
      }
    }
    // errands: now and then step into a shop the walker is passing
    if ((w.act === 'errands' || w.act === 'stroll') && ((crowdFrame + n) % 90) === 0 && Math.random() < 0.25) {
      const dr = spots.door(w.pos.x, w.pos.z, 0, 7);
      if (dr) {
        w.goal = dr;
        return true;
      }
    }
    // avoidance: slow down and drift to the free side when someone is right ahead
    const base = w.baseSpeed ?? w.speed;
    const side = blockedAhead(w, n);
    if (side !== 0 && w.nav) {
      lifeStats.avoid++;
      w.nav.jit = clamp(w.nav.jit - side * dt * 1.6, -0.6, 1.2);
      w.curSpeed = base * 0.55;
    } else {
      w.curSpeed = base;
    }
    return false;
  }
  const _frus = new THREE.Frustum();
  const _pm = new THREE.Matrix4();
  const _sp = new THREE.Sphere(new THREE.Vector3(), 1.2);
  function inViewXZ(x, y, z) {
    _sp.center.set(x, y, z);
    return _frus.intersectsSphere(_sp);
  }
  function updateCrowd(dt) {
    if (!crowd || !NAV) return;
    const cam = game.camera?.position; if (!cam) return;
    game.camera.updateMatrixWorld();
    _pm.multiplyMatrices(game.camera.projectionMatrix, game.camera.matrixWorldInverse);
    _frus.setFromProjectionMatrix(_pm);
    crowdFrame++;
    const fps = game.perf?.fps || 60;
    const dens = streetDensity(zoneKey(NAV.zoneAt(cam.x, cam.z)), districtAt(cam.x, cam.z), hour());
    // a frame-rate dip no longer wipes out most of the crowd at once (that read as mass pop-out)
    void fps;
    const gk = governor.update(dt);
    const want = !crowdCfg.enabled ? 0 : Math.round(crowdCfg.target * clamp(dens / 0.6, 0.08, 1.15) * clamp(districtWeight(cam.x, cam.z), 0.15, 1.6) * gk);
    const camZone = NAV.zoneAt(cam.x, cam.z), beachy = camZone === 'beach' || camZone === 'water' || /beach/i.test(districtAt(cam.x, cam.z));
    let staying = 0;
    for (const w of walkers) {
      if (!w.leaving) {
        staying++;
      }
    }
    for (let k = 0; k < 4 && staying < want; k++) {
      if (!beachy && Math.random() < 0.08) {
        staying += spawnGroup(cam);
      } else if (spawnWalker(cam, beachy)) {
        staying++;
      }
    }
    buildGrid();
    let excess = staying - (want + 8);
    for (let n = walkers.length - 1; n >= 0; n--) {
      const w = walkers[n];
      const d = Math.hypot(w.pos.x - cam.x, w.pos.z - cam.z);
      // leaving (too close for the crowd tier, too far, or over the target): fade out over about half a second
      // never fade someone out close to the player while they can be seen (playtest P3): a person who comes within
      // the near range keeps walking until they are out of view, and only then hands over
      const tooNear = d < (w.still || w.shore ? 14 : crowdCfg.near);
      const seen = inViewXZ(w.pos.x, w.gy + 1, w.pos.z);
      if (!w.leaving && ((tooNear && !seen) || d > crowdCfg.far + 10 || (excess > 0 && !(d < 60 && seen)))) {
        if (excess > 0) {
          excess--;
        }
        w.leaving = true;
      }
      const fadeTo = w.leaving ? 0 : 1;
      if (w.fade !== fadeTo) {
        w.fade = fadeTo > w.fade ? Math.min(1, w.fade + dt * crowdCfg.fadeRate) : Math.max(0, w.fade - dt * crowdCfg.fadeRate);
        crowd.setFade(w.i, w.fade);
      }
      if (w.leaving && w.fade <= 0) {
        spots.free(w.spotKey);
        spots.free(w.groupKey);
        crowd.release(w.i);
        if (w.towel) { game.scene.remove(w.towel); w.towel.geometry?.dispose?.(); towelN--; }
        walkers.splice(n, 1);
        continue;
      }
      if (w.still) continue;
      // r2-perf: walkers beyond 60 m step at half rate (the GPU animation is time-based; 30 Hz positions are invisible there)
      let sdt = dt;
      if (d > 60) { if (((crowdFrame + w.i) & 1) === 1) { w._acc = (w._acc || 0) + dt; continue; } sdt = dt + (w._acc || 0); w._acc = 0; } else if (w._acc) { sdt = dt + w._acc; w._acc = 0; }
      if (lifeStep(w, n, sdt)) continue;
      if (w.shore) {
        w.pos.x += Math.sin(w.heading) * w.speed * sdt;
        w.pos.z += Math.cos(w.heading) * w.speed * sdt;
        w.turnT = (w.turnT || 0) - sdt;
        if (w.turnT <= 0) {
          w.turnT = 1;
          const ax = w.pos.x + Math.sin(w.heading) * 3, az = w.pos.z + Math.cos(w.heading) * 3;
          if (game.city?.isWater?.(ax, az) || NAV.zoneAt(ax, az) !== 'beach') w.heading += Math.PI * (0.8 + Math.random() * 0.4);
          w.gy = NAV.groundAt(w.pos.x, w.pos.z, w.gy);
        }
        crowd.setTransform(w.i, w.pos.x, w.gy, w.pos.z, w.heading, w.look.height);
        continue;
      }
      try { const hd = NAV.navStep(w, sdt, w.curSpeed ?? w.speed); w.heading += Math.atan2(Math.sin(hd - w.heading), Math.cos(hd - w.heading)) * Math.min(1, sdt * 5); } catch (e) { crowd.release(w.i); walkers.splice(n, 1); continue; }
      if (((crowdFrame + n) & 7) === 0) w.gy = NAV.groundAt(w.pos.x, w.pos.z, w.gy);
      crowd.setTransform(w.i, w.pos.x, w.gy, w.pos.z, w.heading, w.look.height);
    }
    crowd.update(dt);
  }

  // ---------------------------------------------------------------- Low Tide Lola's: staff and customers at the bar's anchors
  const barPeople = [];
  let barT = 0;
  function populateBar() {
    const bar = game.keysBar; if (!bar?.anchors || !peds.spawnAt) return;
    const list = bar.anchors.staff.concat(bar.anchors.patrons.filter((a) => !/^(dance|chat|rail[01])/.test(a.id || '')));
    for (const a of list) {
      const p = peds.spawnAt(new THREE.Vector3(a.pos[0], a.pos[1], a.pos[2]), { heading: a.heading });
      if (!p) continue;
      const pose = String(a.pose || '');
      p.nav = null; p.target = null; p.heading = a.heading || 0; p.pinned = 1e9; p.venue = 'keys_bar'; p.barAnchor = a;
      p.pos.set(a.pos[0], a.pos[1], a.pos[2]); p.groundY = a.pos[1];
      if (/sit|stool|chair|booth|bench/.test(pose)) { p.state = 'bench'; p.act = 'bench'; p.idleStyle = 'sitBench'; }
      else if (a.role) { p.state = 'lean'; p.act = 'lean'; p.idleStyle = a.role === 'bartender' ? 'talk' : null; }
      else { p.state = 'talk'; p.act = 'talk'; p.idleStyle = /drink/.test(pose) ? 'phone' : 'talk'; p.styleT = 1e9; }
      p.stateT = 1e9;
      p.collider?.setEnabled(false);
      barPeople.push(p);
    }
  }
  function updateBar(dt) {
    barT -= dt; if (barT > 0) return; barT = 2;
    const bar = game.keysBar, P = game.player?.position; if (!bar?.position || !P) return;
    const d = P.distanceTo(bar.position);
    const alive = barPeople.filter((p) => p.active && p.venue === 'keys_bar').length;
    if (d < 150 && alive < 3) { barPeople.length = 0; populateBar(); }
  }
  try { game.on?.('keysBar:ready', () => { barT = 0; }); } catch (e) { /* */ }

  // ---------------------------------------------------------------- per-frame
  game.updaters?.push?.((dt) => {
    try { sense(dt); } catch (e) { /* never break the frame */ }
    try { updateCrowd(Math.min(dt, 0.1)); } catch (e) { console.warn('[people] crowd', e); }
    try { updateBubbles(); } catch (e) { /* */ }
    try { updateBar(dt); } catch (e) { console.warn('[people] bar', e); }
    try { game.people?.talk?.update(dt); } catch (e) { console.warn('[people] talk', e); }
    try { for (const p of peds.list) if (p.active && p.applied && p.root?.visible && p.applied.props.length) settleHanging(p.applied, p.root); } catch (e) { /* */ }
    for (const [p] of roster) if (!p.active) roster.delete(p);
  });

  // ---------------------------------------------------------------- API
  game.people = {
    dress, undress, react, callDone, say, voiceLine, honk, bubble,
    barPeople: () => barPeople.filter((p) => p.active).map((p) => ({ name: p.identity?.name, job: p.identity?.job, state: p.state, anchor: p.barAnchor?.id })),
    densityFor: (x, z) => streetDensity(zoneKey(NAV?.zoneAt?.(x, z) || 'residential'), districtAt(x, z), hour()),
    sample: (zone, district, h) => sampleSchedule(zone, district, h),
    audit: () => ({ spawned: audit.spawned, crowdSpawned: audit.crowdSpawned, total: audit.spawned + audit.crowdSpawned, distinct: audit.sigs.size, dup: audit.dup, dupInView: audit.dupInView, lookFailed: audit.lookFailed, applyFailed: audit.applyFailed, dupList: audit.dupList.slice(), look: lookAudit(), bodies: { ...bodyStatus, loaded: loadedBodies().length } }),
    reactStats: () => JSON.parse(JSON.stringify(reactStats)),
    resetReactStats: () => { for (const k in reactStats) delete reactStats[k]; },
    witnesses: () => witnessLog.slice(),
    lines: () => lineLog.slice(), lineCount,
    roster: () => [...roster.values()].map((id) => ({ name: id.name, age: id.age, job: id.job, home: id.districtKey, voice: id.voice, traits: Object.fromEntries(Object.entries(id.traits).map(([k, v]) => [k, Math.round(v * 100) / 100])) })),
    life: { stats: () => ({ ...lifeStats }), governor: () => ({ k: governor.k, avgMs: governor.avgMs }), panic: crowdPanic, walkState: signals.walkState },
    crowd: { cfg: crowdCfg, get impl() { return crowd; }, get count() { return walkers.length; }, get tris() { return crowd?.tris || 0; }, positions: () => walkers.map((w) => [w.pos.x, w.pos.z]) },
    sigList: () => [...audit.sigs.keys()],
    inView() { // people inside the camera frustum (near tier + crowd tier)
      const cam = game.camera; if (!cam) return null; cam.updateMatrixWorld();
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const v = new THREE.Vector3(); let near = 0, far = 0;
      for (const p of peds.list) if (p.active && p.root?.visible && fr.containsPoint(v.set(p.pos.x, p.pos.y + 1, p.pos.z))) near++;
      for (const w of walkers) if (fr.containsPoint(v.set(w.pos.x, w.gy + 1, w.pos.z))) far++;
      return { near, far, total: near + far };
    },
    activityAt, districtKey,
  };
  try { game.people.talk = createTalk(game, game.people); } catch (e) { console.warn('[people] talk', e); }
}

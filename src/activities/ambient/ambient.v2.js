// AMBIENT LIFE (activities): small things everywhere, spawned only near the player.
//   - Street performers at fixed spots (sites.data.js AMBIENT_PERFORMERS): a gold living statue on a plinth, a bucket
//     drummer (with a synthesized beat you hear as you walk past), a street dancer with a boombox. E to tip $5.
//   - Fishermen on seawalls / pier ends (AMBIENT_FISHING): rod and line held in the hand, bucket, cooler, tackle.
//   - Hobos along building walls in Downtown, Overtown, Liberty City and Little Havana: sitting on cardboard, sleeping,
//     asking for change as you pass (E to give $5); hit one and he fights back.
//   - Gang hangouts in Overtown and Liberty City: a crew on a corner ahead of you; they notice you, taunt, try to mug you
//     if you hang around, and fight as a group (src/activities/crew.js).
// API (game.ambientLife): { stats(), performers, crews, hobos }. Off with ?ambient=0 (parts: ?ambient=perf,fish,hobo,gang).
import * as THREE from 'three';
import { getHub, help, canAct, say, payCash, sfx, findShore, local, groundY, loadGLB, fit, shadows, canvasTex, notify, castPed, stillOurs } from '../common.js';
import { createCrew } from '../crew.js';
import { AMBIENT_PERFORMERS, AMBIENT_FISHING, HOBO_DISTRICTS, GANG_DISTRICTS } from '../sites.data.js';

export const order = 192;

export async function initV2(game) {
  const q = new URLSearchParams(location.search).get('ambient');
  if (q === '0') return;
  const on = (k) => !q || q === '1' || q.split(',').includes(k);
  const city = game.city; if (!city) return;
  const H = getHub(game);
  const P = () => game.player.position;
  const A = { performers: [], fishers: [], hobos: [], crews: [] };

  // ---------------------------------------------------------------- shared bits
  const tipLines = { statue: ['(the statue winks at you)', '(the statue bows, very slowly)'], drummer: ['Ayy, thank you!', 'Respect, my friend!'], dancer: ['Appreciate you!', 'Tell your friends!'] };
  function snapSidewalk(x, z) {
    try { const p = city.randomSidewalkPoint?.({ x, z }, 30); if (p && Math.hypot(p.x - x, p.z - z) < 45) return { x: p.x, z: p.z }; } catch (e) { /* */ }
    return { x, z };
  }
  // procedural bucket beat (WebAudio, positional through the ambience bus); one at a time
  function makeBeat(pos) {
    const A2 = game.audio, ctx = A2?.ctx; if (!ctx) return null;
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.refDistance = 4; pan.rolloffFactor = 1.4; pan.maxDistance = 120;
    pan.positionX.value = pos.x; pan.positionY.value = pos.y + 0.6; pan.positionZ.value = pos.z;
    out.connect(pan).connect(A2.ambienceBus || ctx.destination);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
    const hit = (t, f, g, noise) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.12); og.gain.setValueAtTime(g, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(og).connect(out); o.start(t); o.stop(t + 0.2);
      if (noise) { const s = ctx.createBufferSource(); s.buffer = nb; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; const sg = ctx.createGain(); sg.gain.value = noise; s.connect(bp).connect(sg).connect(out); s.start(t); }
    };
    const PAT = [[150, 0.9, 0], [0, 0, 0], [320, 0.35, 0.5], [0, 0, 0], [150, 0.7, 0], [150, 0.5, 0], [320, 0.4, 0.6], [420, 0.2, 0.25]];
    let next = ctx.currentTime + 0.1, step = 0;
    return {
      tick(near) { out.gain.setTargetAtTime(near ? 0.55 : 0, ctx.currentTime, 0.3); if (!near) return; while (next < ctx.currentTime + 0.25) { const [f, g, n] = PAT[step++ % PAT.length]; if (f) hit(next, f, g * (0.85 + Math.random() * 0.3), n); next += 60 / 104 / 2; } if (next < ctx.currentTime) next = ctx.currentTime + 0.05; },
      stop() { try { out.gain.setTargetAtTime(0, ctx.currentTime, 0.1); setTimeout(() => { try { out.disconnect(); } catch (e) { /* */ } }, 500); } catch (e) { /* */ } },
    };
  }

  // ---------------------------------------------------------------- street performers
  if (on('perf')) for (const def of AMBIENT_PERFORMERS) {
    const S = { def, root: null, h: null, beat: null, tipped: 0 };
    A.performers.push(S);
    H.site({ id: 'perf:' + def.id, x: def.x, z: def.z, on: 140, off: 190,
      build() {
        if (!S.at) S.at = snapSidewalk(def.x, def.z);
        const y = groundY(game, S.at.x, S.at.z), root = new THREE.Group(); root.position.set(S.at.x, y, S.at.z); game.scene.add(root); S.root = root;
        const heading = def.heading ?? 0;
        let py = y;
        if (def.kind === 'statue') {   // a painted plinth with a tip jar
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.8), new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.6, metalness: 0.4 })); plinth.position.y = 0.225; plinth.castShadow = plinth.receiveShadow = true; root.add(plinth); py = y + 0.45;
          const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.18, 14), new THREE.MeshPhysicalMaterial({ color: 0xdfeef0, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.6 })); jar.position.set(0.32, 0.09, 0.6); root.add(jar);
        } else if (def.kind === 'drummer') {
          const bucket = new THREE.MeshStandardMaterial({ color: 0xe8661e, roughness: 0.55 }), white = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.5 });
          [[-0.35, 0.45, 0.3], [0.05, 0.55, 0.4], [0.42, 0.4, 0.26]].forEach(([x, z, r], i) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, 0.42, 18, 1, true), i === 1 ? white : bucket); b.position.set(x, 0.21, z); b.castShadow = true; root.add(b); const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.85, 18), i === 1 ? white : bucket); top.rotation.x = -Math.PI / 2; top.position.set(x, 0.42, z); root.add(top); });
          const crate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.36, 0.38), new THREE.MeshStandardMaterial({ color: 0x2d5ea8, roughness: 0.7 })); crate.position.set(0, 0.18, -0.25); root.add(crate);
          S.beat = null; S.wantBeat = true;
        } else if (def.kind === 'dancer') {
          const bb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.18), new THREE.MeshStandardMaterial({ color: 0x1c1d22, roughness: 0.4, metalness: 0.3 })); bb.position.set(1.0, 0.15, 0.4); root.add(bb);
          for (const x of [-0.14, 0.14]) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.8, roughness: 0.3 })); sp.rotation.x = Math.PI / 2; sp.position.set(1.0 + x, 0.15, 0.5); root.add(sp); }
          const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })); mat.rotation.x = -Math.PI / 2; mat.position.y = 0.01; root.add(mat);
          S.wantBeat = true;
        }
        root.rotation.y = heading;
        const pos = { x: S.at.x, y: py, z: S.at.z };
        try { S.h = (def.person && game.npc?.spawnPosed?.({ person: def.person, pose: def.pose, pos, rot: heading })) || game.npc?.spawnPosed?.({ place: def.place || 'street', pose: def.pose, pos, rot: heading, seed: def.seed || 5 }) || null; } catch (e) { S.h = null; }
        if (S.h && def.kind === 'statue') { S.h.root.traverse((o) => { if (o.isMesh && o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; o.material = ms.map((m) => { const n = m.clone(); if (n.color) n.color.setHex(0xd4b25c); n.metalness = 0.85; n.roughness = 0.35; n.map = null; return n; }); if (o.material.length === 1) o.material = o.material[0]; } }); S.frozen = true; }
        if (S.wantBeat) S.beat = makeBeat({ x: S.at.x, y, z: S.at.z });
      },
      drop() { if (S.root) game.scene.remove(S.root); S.root = null; try { S.h?.remove(); } catch (e) { /* */ } S.h = null; S.beat?.stop(); S.beat = null; help(game, 'perf', null); },
      tick(dt, s, d) {
        S.beat?.tick(d < 70);
        if (S.h && def.kind === 'statue') { S.h.speed = 0; if (S.frozen && S.h.character?.mixer) S.h.character.mixer.timeScale = 0.02; }
        if (S.h && d < 10) S.h.lookAt = def.kind === 'statue' ? null : P();
        if (d < 2.6 && canAct(game) && !game.player.state?.inVehicle) {
          help(game, 'perf', `Press <b>E</b> to tip the ${def.label} $5`);
          if (game.input.pressed('KeyE')) {
            if (payCash(game, 5, { to: def.label, memo: 'Tip', category: 'gift', accepts: ['cash'] })) { S.tipped++; say(game, def.kind === 'statue' ? null : def.label, tipLines[def.kind][(Math.random() * 2) | 0], 2400, '#7dffb0'); if (def.kind === 'statue' && S.h) { try { S.h.setPose('shake'); setTimeout(() => { try { S.h?.setPose(def.pose); } catch (e) { /* */ } }, 1600); } catch (e) { /* */ } } }
            else notify(game, 'No cash on you.', 1800);
          }
        } else if (d < 5) help(game, 'perf', null);
      } });
  }

  // ---------------------------------------------------------------- fishermen
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4 }), lineMat = new THREE.LineBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.6 });
  if (on('fish')) for (const def of AMBIENT_FISHING) {
    const S = { def, root: null, men: [] };
    A.fishers.push(S);
    H.site({ id: 'fish:' + def.id, x: def.x, z: def.z, on: 160, off: 220,
      build() {
        if (S.geo === undefined) { const s = findShore(game, def.x, def.z, { openLen: 30, depthAt: 4, minDepth: 0.4, maxR: 120 }); S.geo = s ? { x: s.shore.x - s.out.x * 0.6, z: s.shore.z - s.out.z * 0.6, out: s.out } : null; }
        const G = S.geo; if (!G) return;
        const root = new THREE.Group(); game.scene.add(root); S.root = root;
        const face = Math.atan2(G.out.x, G.out.z), side = { x: G.out.z, z: -G.out.x };
        for (let i = 0; i < (def.n || 2); i++) {
          const x = G.x + side.x * (i - 0.5) * 3.2, z = G.z + side.z * (i - 0.5) * 3.2, y = groundY(game, x, z);
          let h = null; const rot = face + (Math.random() - 0.5) * 0.3, pid = ['p03', 'p159', 'p162'][(i + (def.seed || 0)) % 3];
          try { h = game.npc?.spawnPosed?.({ person: pid, pose: 'idle', pos: { x, y, z }, rot }) || game.npc?.spawnPosed?.({ place: 'fisherman', pose: i % 2 ? 'idle' : 'idle_old', pos: { x, y, z }, rot, seed: 300 + i + (def.seed || 0) }) || null; } catch (e) { h = null; }
          if (h) {
            // rod in the right hand, tip out over the water, line hanging into it
            const hand = h.character?.getBone?.('RightHand');
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.014, 2.6, 6), rodMat); rod.geometry.translate(0, 1.3, 0);
            if (hand) { const g = new THREE.Group(); hand.add(g); g.add(rod); g.userData.fix = true; rod.rotation.x = 1.0; S.men.push({ h, rod, hand }); } else { rod.position.set(x, y + 0.9, z); rod.rotation.set(1.0, face, 0, 'YXZ'); root.add(rod); S.men.push({ h, rod }); }
            const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const line = new THREE.Line(lg, lineMat); line.frustumCulled = false; root.add(line); S.men[S.men.length - 1].line = line;
          }
          // bucket and gear beside each man
          const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.6, side: THREE.DoubleSide })); bucket.position.set(x - side.x * 0.7 - G.out.x * 0.4, y + 0.15, z - side.z * 0.7 - G.out.z * 0.4); bucket.castShadow = true; root.add(bucket);
        }
        loadGLB('assets/models/keys/coolers.glb').then((m) => { if (!m || !S.root) return; const c = shadows(fit(m, { height: 0.42 })); c.position.set(G.x - G.out.x * 1.3, groundY(game, G.x, G.z), G.z - G.out.z * 1.3); c.rotation.y = face + 0.5; S.root.add(c); });
        loadGLB('assets/models/keys/fishing_gear.glb').then((m) => { if (!m || !S.root) return; const c = shadows(fit(m, { length: 0.6 })); const p = { x: G.x + side.x * 2.4 - G.out.x * 1.0, z: G.z + side.z * 2.4 - G.out.z * 1.0 }; c.position.set(p.x, groundY(game, p.x, p.z), p.z); c.rotation.y = face; S.root.add(c); });
        S.face = face;
      },
      drop() { if (S.root) game.scene.remove(S.root); S.root = null; for (const m of S.men) { try { m.rod.parent?.parent?.remove(m.rod.parent); m.h.remove(); } catch (e) { /* */ } } S.men = []; },
      tick(dt, s, d) {
        if (d > 90) return;
        const t = performance.now() / 1000, SEA = city.seaLevel ?? -0.12;
        for (const [i, m] of S.men.entries()) {
          if (!m.line) continue;
          const tip = new THREE.Vector3(0, 2.6, 0); m.rod.localToWorld(tip);
          const end = new THREE.Vector3(tip.x + Math.sin(S.face) * 1.5, SEA, tip.z + Math.cos(S.face) * 1.5);
          const p = m.line.geometry.attributes.position; p.setXYZ(0, tip.x, tip.y, tip.z); p.setXYZ(1, end.x, end.y + Math.sin(t * 1.3 + i) * 0.03, end.z); p.needsUpdate = true;
          m.rod.rotation.z = Math.sin(t * 0.7 + i * 2) * 0.03;
        }
      } });
  }

  // ---------------------------------------------------------------- hobos and gang hangouts (roaming spawners)
  const HOBO_RE = new RegExp('^(' + HOBO_DISTRICTS.join('|') + ')$'), GANG_RE = new RegExp('^(' + GANG_DISTRICTS.join('|') + ')$');
  let scanT = 0, gangCd = 0;
  const lean = (x, z, r) => { try { return city.leanSpotsNear?.(x, z, r) || []; } catch (e) { return []; } };
  const spawnPed = (pos, outfit, style, heading) => {
    const p = castPed(game, new THREE.Vector3(pos.x, pos.y ?? groundY(game, pos.x, pos.z), pos.z), outfit);
    if (!p) return null;
    p.pinned = 1e9; p.v21 = { ambient: true }; p.nav = null; p.group = null; p.state = 'talk'; p.act = 'talk'; p.stateT = 1e9; p.idleStyle = style; p.style0 = style; p.heading = heading;
    if (p.root) { p.root.position.copy(p.pos); p.root.rotation.y = heading; }
    return p;
  };
  const freeP = (p) => { if (stillOurs(p)) { p.pinned = 0; p.v21 = null; if (p.state === 'talk') { p.state = 'walk'; p.act = 'walk'; p.idleStyle = null; } } };
  let cardMat = null;
  function hoboSpawn() {
    const pp = P(); const spots = lean(pp.x, pp.z, 90).filter((s) => { const d = Math.hypot(s.pos.x - pp.x, s.pos.z - pp.z); return d > 35 && !A.hobos.some((h) => Math.hypot(h.p.pos.x - s.pos.x, h.p.pos.z - s.pos.z) < 40); });
    if (!spots.length) return;
    const s = spots[(Math.random() * spots.length) | 0];
    const style = Math.random() < 0.6 ? 'sitGround' : 'lie';
    const p = spawnPed(s.pos, 'rough', style, s.heading + (style === 'lie' ? Math.PI / 2 : 0)); if (!p) return;
    cardMat ||= new THREE.MeshStandardMaterial({ color: 0x9b7a52, roughness: 0.95 });
    const card = new THREE.Mesh(new THREE.BoxGeometry(style === 'lie' ? 1.9 : 1.0, 0.015, style === 'lie' ? 0.8 : 1.0), cardMat); card.position.set(s.pos.x, s.pos.y + 0.01, s.pos.z); card.rotation.y = s.heading; card.receiveShadow = true; game.scene.add(card);
    A.hobos.push({ p, card, asked: false, done: false });
  }
  function gangSpawn() {
    const pp = P(); const spots = lean(pp.x, pp.z, 120).filter((s) => { const d = Math.hypot(s.pos.x - pp.x, s.pos.z - pp.z); return d > 55 && d < 115; });
    if (!spots.length) return;
    const s = spots[(Math.random() * spots.length) | 0];
    const n = 3 + (Math.random() < 0.4 ? 1 : 0), peds = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, c = { x: s.pos.x + Math.sin(s.heading) * 1.6, z: s.pos.z + Math.cos(s.heading) * 1.6 };
      const x = c.x + Math.cos(a) * 1.15, z = c.z + Math.sin(a) * 1.15;
      const p = spawnPed({ x, z }, 'gang', i === 0 ? 'talk' : i === 1 ? 'lean_wall' : i === 2 ? 'cross_arms' : 'phone', Math.atan2(c.x - x, c.z - z)); if (p) peds.push(p);
    }
    if (!peds.length) return;
    const crew = createCrew(game, { peds, name: 'Corner boy', knife: 0.4, noticeR: 12, onEnd: () => { gangCd = 60; } });
    A.crews.push({ crew, peds, at: { x: s.pos.x, z: s.pos.z } });
  }
  game.updaters.push(function ambientTick(dt) {
    if (!(dt > 0) || game.ui?.paused) return;
    const pp = P();
    scanT -= dt; gangCd -= dt;
    if (scanT <= 0) {
      scanT = 2;
      const dist = (() => { try { return city.districtAt(pp.x, pp.z) || ''; } catch (e) { return ''; } })();
      const indoor = game.player.state?.indoor || game.metro?.mode && game.metro.mode !== 'street';
      // retire far ones
      for (const h of A.hobos.slice()) if (!stillOurs(h.p) || Math.hypot(h.p.pos.x - pp.x, h.p.pos.z - pp.z) > 160) { freeP(h.p); game.scene.remove(h.card); A.hobos.splice(A.hobos.indexOf(h), 1); }
      for (const c of A.crews.slice()) if (Math.hypot(c.at.x - pp.x, c.at.z - pp.z) > 200 || c.crew.state === 'done' && Math.hypot(c.at.x - pp.x, c.at.z - pp.z) > 60) { c.crew.release(); A.crews.splice(A.crews.indexOf(c), 1); }
      if (!indoor && !game.player.state?.inVehicle) {
        if (on('hobo') && HOBO_RE.test(dist) && A.hobos.length < 3) hoboSpawn();
        if (on('gang') && GANG_RE.test(dist) && A.crews.length < 1 && gangCd <= 0) gangSpawn();
      }
    }
    // hobos ask for change
    let ask = null;
    for (const h of A.hobos) {
      if (!h.p.active || h.p.dead) continue;
      const d = Math.hypot(h.p.pos.x - pp.x, h.p.pos.z - pp.z);
      if ((h.p.health ?? 100) < 96 && !h.fought) { h.fought = true; h.p.idleStyle = null; h.p.state = 'fight'; h.p.stateT = 10; h.p.guard = true; say(game, 'Hobo', 'What\'s your problem, man?!', 2000, '#c9b38a'); }
      if (!h.done && d < 3) { ask = h; if (!h.asked) { h.asked = true; say(game, 'Hobo', ['Spare some change?', 'Anything helps, brother.', 'Got a dollar? Just one?'][(Math.random() * 3) | 0], 2400, '#c9b38a'); } }
      else if (h.asked && !h.done && d > 5) { h.done = true; }
    }
    if (ask && canAct(game) && !game.player.state?.inVehicle) {
      help(game, 'hobo', 'Press <b>E</b> to give him $5');
      if (game.input.pressed('KeyE')) { ask.done = true; help(game, 'hobo', null); if (payCash(game, 5, { to: 'A man on the street', memo: 'Spare change', category: 'gift', accepts: ['cash'] })) { say(game, 'Hobo', 'Bless you, man. Bless you.', 2200, '#c9b38a'); game.stats?.add?.('charity', 5); } else say(game, 'Hobo', 'Broke too, huh? I feel you.', 2200, '#c9b38a'); }
    } else help(game, 'hobo', null);
    for (const c of A.crews) { for (const p of c.peds) if (p.active && p.state === 'talk' && c.crew.state === 'idle') p.idleStyle = p.style0; c.crew.tick(dt); }
    for (const h of A.hobos) if (h.p.active && h.p.state === 'talk' && !h.asked) h.p.idleStyle = h.p.style0;
    void sfx; void local; void canvasTex;
  });
  H.api('ambientLife', { stats: () => ({ performers: A.performers.filter((p) => p.root).length, fishers: A.fishers.filter((f) => f.root).length, hobos: A.hobos.length, crews: A.crews.length }), performers: A.performers, crews: A.crews, hobos: A.hobos });
}

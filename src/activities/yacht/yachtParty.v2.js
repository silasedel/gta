// YACHT PARTY (activities): the "Midnight Tide" (partyYacht.def.js, built with the yacht kit) moored stern-to at the end
// of a private pier on the bay side of Miami Beach, with a party on board: music from the DJ table, dancers on the aft
// deck, drinkers at the bar, people in the hot tub and on the sun pads, string lights and colored party lights at night.
// A bouncer stands at the foot of the gangway. Ways in:
//   - look the part (dress shoes, a gold watch, long pants, a smart shirt: the bouncer waves you through),
//   - talk your way in ("I'm on the list": a gamble), slip him cash, or show up in a staff uniform (valet / security...),
//   - sneak aboard from the water: swim or boat to the swim ladder at the stern and climb up (E).
// On board: free drinks at the bar, pickpocket guests (E behind them). Gatecrashers and pickpockets raise suspicion with
// the deck security; spotted = security comes to throw you overboard; hit him and it is a fight (and trespass).
// API (game.yachtParty): { status, suspicion, site, admit(how), spot(why), throwOut() }. Off with ?yachtparty=0.
import * as THREE from 'three';
import { buildYacht } from '../../vehicles/yachts/buildYacht.js';
import { PARTY_YACHT, MD, FLY } from './partyYacht.def.js';
import { getHub, blip, help, notify, canAct, getPanelSafe, say, earnCash, payCash, pill, sfx, findShore, local, groundY, fmt, canvasTex, castPed } from '../common.js';
import { standMats } from '../jetski/stand.js';
import { keepFighting, pedOut } from '../../jobs/kit.js';
import { YACHT_PARTY } from '../sites.data.js';

export const order = 188;
const PIER_Y = 0.75;
const BOUNCER = 'Bouncer', SECURITY = 'Security', BARMAN = 'Bartender', GUEST = 'Guest';
const GUEST_LINES = ['Have you tried the champagne? It\'s ridiculous.', 'Whose boat is this anyway?', 'I lost my shoe somewhere around midnight.', 'This DJ is actually good.', 'Are you with the band?', 'Don\'t tell my husband I\'m here.'];
const DRINKS = ['Champagne. On the house, obviously.', 'Rum punch. Careful, it bites.', 'One mojito. Don\'t fall in.', 'Last one. You look like you need it.'];

export async function initV2(game) {
  if (/[?&]yachtparty=0\b/.test(location.search)) return;
  const city = game.city; if (!city?.isWater) return;
  const H = getHub(game);
  const SEA = city.seaLevel ?? -0.12;
  const def = YACHT_PARTY;
  const Y = { status: 'outside', suspicion: 0, site: null, geo: undefined, built: null, root: null, body: null, gateCol: null, guests: [], peds: {}, music: null, lights: null, refusedT: 0, bannedT: 0, drinks: 0, picked: new Set(), spotted: false, fight: false };
  const P = () => game.player.position;
  Y.blip = blip(game, { x: def.x, z: def.z, kind: 'yacht', color: '#ff5fa8', label: def.name, prio: 81 });

  // ---------------------------------------------------------------- geometry: shore, pier, yacht position
  function locate() {
    const s = findShore(game, def.x, def.z, { openLen: 80, depthAt: 30, minDepth: 2.0 }); if (!s) return null;
    const { shore, out, depth } = s, heading = Math.atan2(out.x, out.z);   // pier and yacht bow point out to sea
    let len = 14;
    for (; len < 60; len += 1) { const e = { x: shore.x + out.x * (len + 14), z: shore.z + out.z * (len + 14) }; if (depth(e.x, e.z) > 2.2 && depth(shore.x + out.x * (len + 3), shore.z + out.z * (len + 3)) > 1.4) break; }
    const base = { x: shore.x - out.x * 3, z: shore.z - out.z * 3 }, end = { x: shore.x + out.x * len, z: shore.z + out.z * len };
    return { shore, out, heading, base, end, len: len + 3, side: { x: out.z, z: -out.x } };
  }
  // ---------------------------------------------------------------- build / drop
  function build() {
    if (Y.geo === undefined) { Y.geo = locate(); if (Y.geo) { Y.blip.x = Y.geo.end.x; Y.blip.z = Y.geo.end.z; } else console.warn('[yachtParty] no site'); }
    const G = Y.geo; if (!G) return;
    const root = new THREE.Group(); root.name = 'yacht-party'; game.scene.add(root); Y.root = root;
    const { world, RAPIER } = game;
    Y.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    // pier: plank deck on piles from the seawall to the yacht's stern, a T-head, rope stanchions, lamp posts
    const M = standMats();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.heading);
    const mid = { x: (G.base.x + G.end.x) / 2, z: (G.base.z + G.end.z) / 2 };
    const pier = new THREE.Group(); pier.position.set(mid.x, 0, mid.z); pier.quaternion.copy(q); pier.userData.surface = 'wood'; root.add(pier);
    const deckGeo = new THREE.BoxGeometry(2.6, 0.14, G.len); { const uv = deckGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.4, uv.getY(i) * G.len / 3); }
    const deck = new THREE.Mesh(deckGeo, M.planks); deck.position.y = PIER_Y - 0.07; deck.castShadow = deck.receiveShadow = true; pier.add(deck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(7, 0.14, 3.4), M.planks); head.position.set(0, PIER_Y - 0.07, G.len / 2 - 1.7); head.castShadow = head.receiveShadow = true; pier.add(head);
    const pileG = new THREE.CylinderGeometry(0.14, 0.16, 4, 8);
    for (let z = -G.len / 2 + 1; z < G.len / 2; z += 3) for (const x of [-1.3, 1.3]) { const p = new THREE.Mesh(pileG, M.post); p.position.set(x, PIER_Y - 1.6 + 0.35, z); p.castShadow = true; pier.add(p); }
    for (const x of [-3.4, 3.4]) { const p = new THREE.Mesh(pileG, M.post); p.position.set(x, PIER_Y - 1.6 + 0.35, G.len / 2 - 1.7); pier.add(p); }
    // velvet rope stanchions at the gangway foot and a "PRIVATE EVENT" sign
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 1 }), velvet = new THREE.MeshStandardMaterial({ color: 0x8a1030, roughness: 0.7 });
    for (const x of [-1.6, -0.9, 0.9, 1.6]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8), brass); s.position.set(x, PIER_Y + 0.48, G.len / 2 - 3.6); pier.add(s); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.04, 14), brass); b.position.set(x, PIER_Y + 0.02, G.len / 2 - 3.6); pier.add(b); }
    for (const [a, b] of [[-1.6, -0.9], [0.9, 1.6]]) { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(a + (b - a) * t, PIER_Y + 0.86 - Math.sin(t * Math.PI) * 0.16, G.len / 2 - 3.6)); } pier.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.022, 6), velvet)); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({ roughness: 0.5, map: canvasTex(512, 320, (g, w, h) => { g.fillStyle = '#0e0e14'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a14a'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28); g.fillStyle = '#c9a14a'; g.textAlign = 'center'; g.font = 'italic 700 64px Georgia, serif'; g.fillText('Midnight Tide', w / 2, 130); g.font = '600 34px Inter, Arial'; g.fillStyle = '#f1e7cf'; g.fillText('PRIVATE EVENT', w / 2, 200); g.font = '500 26px Inter, Arial'; g.fillText('guests & crew only', w / 2, 250); }) }));
    sign.position.set(-2.3, PIER_Y + 1.0, G.len / 2 - 3.7); sign.rotation.y = Math.PI; pier.add(sign);
    const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), brass); signPost.position.set(-2.3, PIER_Y + 0.5, G.len / 2 - 3.66); pier.add(signPost);
    try { game.footSurface?.tag?.(pier, 'wood'); } catch (e) { /* */ }
    const pc = (x, y, z, hx, hy, hz) => { const p = local({ x: mid.x, z: mid.z, heading: G.heading }, x, z); world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x, y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }), Y.body); };
    pc(0, PIER_Y - 0.25, 0, 1.3, 0.25, G.len / 2); pc(0, PIER_Y - 0.25, G.len / 2 - 1.7, 3.5, 0.25, 1.7);
    // the yacht, stern-to at the T-head
    const built = buildYacht(PARTY_YACHT, { seed: 7 }); Y.built = built;
    const zAft = built.meta.swim?.zAft ?? -11;
    const yc = { x: G.end.x + G.out.x * (1.3 - zAft), z: G.end.z + G.out.z * (1.3 - zAft) };
    Y.yacht = { x: yc.x, z: yc.z, heading: G.heading };
    const yg = built.group; yg.position.set(yc.x, SEA, yc.z); yg.quaternion.copy(q); root.add(yg); yg.updateMatrixWorld(true);
    yg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const yb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(yc.x, SEA, yc.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })); Y.ybody = yb;
    let nc = 0;
    for (const c of built.colliders) {
      if (c.enabled === false) continue;
      let d = null;
      try {
        if (c.type === 'box') d = RAPIER.ColliderDesc.cuboid(c.h[0], c.h[1], c.h[2]);
        else if (c.type === 'cyl') d = RAPIER.ColliderDesc.cylinder(c.hh, c.r);
        else if (c.type === 'ball') d = RAPIER.ColliderDesc.ball(c.r);
        else if (c.type === 'mesh') d = RAPIER.ColliderDesc.trimesh(c.verts, Uint32Array.from(c.idx));
        if (!d) continue;
        if (c.p) d.setTranslation(c.p[0], c.p[1], c.p[2]).setRotation({ x: c.q[0], y: c.q[1], z: c.q[2], w: c.q[3] });
        world.createCollider(d, yb); nc++;
      } catch (e) { /* skip a bad shape */ }
    }
    Y.toW = (x, y, z) => yg.localToWorld(new THREE.Vector3(x, y, z));
    Y.toL = (v) => yg.worldToLocal(v.clone());
    // gangway (passerelle): T-head to the swim platform
    const sw = built.meta.swim || { pos: [0, 0.45, -10.5], d: 1.4 };
    const ga = { x: G.end.x - G.out.x * 0.4, z: G.end.z - G.out.z * 0.4 }, gb = Y.toW(0, sw.pos[1], sw.zAft + 0.3 ?? sw.pos[2]);
    const gl = Math.hypot(gb.x - ga.x, gb.z - ga.z), gmid = { x: (ga.x + gb.x) / 2, z: (ga.z + gb.z) / 2 }, gy = (PIER_Y + gb.y) / 2;
    const pitch = Math.atan2(PIER_Y - gb.y, gl), qg = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
    const gw = new THREE.Group(); gw.position.set(gmid.x, gy, gmid.z); gw.quaternion.copy(qg); root.add(gw);
    const steel = new THREE.MeshStandardMaterial({ color: 0xd6d9de, roughness: 0.3, metalness: 0.9 });
    const tread = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, gl + 0.4), M.planks); gw.add(tread);
    for (const x of [-0.45, 0.45]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, gl + 0.3, 6), steel); r.rotation.x = Math.PI / 2; r.position.set(x, 0.9, 0); gw.add(r); for (let z = -gl / 2; z <= gl / 2; z += gl / 3) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), steel); s.position.set(x, 0.45, z); gw.add(s); } }
    { const p = local({ x: gmid.x, z: gmid.z, heading: G.heading }, 0, 0); world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.1, gl / 2 + 0.3).setTranslation(p.x, gy - 0.1, p.z).setRotation({ x: qg.x, y: qg.y, z: qg.z, w: qg.w }), Y.body); }
    Y.gangFoot = { x: G.end.x - G.out.x * 3.9, z: G.end.z - G.out.z * 3.9 };   // the pier neck, just before the T-head
    Y.ladder = Y.toW(-(sw.w || 3) * 0.25, 0, sw.zAft - 0.6);
    Y.deckBox = { x0: -2.9, x1: 2.9, z0: (sw.zAft ?? -11) - 0.2, z1: 11 };
    setGate(true);
    // music, lights, people
    buildLights(); startMusic(); spawnPeople();
    try { game.audio?.venue?.('yachtparty', 'bar', Y.toW(0, MD + 1, -6), true, 1.2); } catch (e) { /* */ }
    console.info(`[yachtParty] built: pier ${G.len.toFixed(0)} m, yacht at (${yc.x.toFixed(0)}, ${yc.z.toFixed(0)}), ${nc} colliders`);
  }
  function setGate(on) {
    const { world, RAPIER } = game;
    if (on && !Y.gateCol && Y.body) { const G = Y.geo, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.heading), p = Y.gangFoot; Y.gateCol = world.createCollider(RAPIER.ColliderDesc.cuboid(1.4, 1.0, 0.15).setTranslation(p.x, PIER_Y + 1, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }), Y.body); }
    if (!on && Y.gateCol) { try { world.removeCollider(Y.gateCol, true); } catch (e) { /* */ } Y.gateCol = null; }
  }
  function drop() {
    stopMusic(); clearPeople();
    try { game.audio?.venue?.('yachtparty', null, null, false); } catch (e) { /* */ }
    if (Y.root) { game.scene.remove(Y.root); Y.root = null; }
    for (const b of [Y.body, Y.ybody]) if (b) { try { game.world.removeRigidBody(b); } catch (e) { /* */ } }
    Y.body = Y.ybody = Y.gateCol = null;
    try { Y.built?.dispose(); } catch (e) { /* */ } Y.built = null; Y.lights = null;
    if (Y.status !== 'banned') Y.status = 'outside';
    pill('yacht', null); help(game, 'yacht', null);
  }

  // ---------------------------------------------------------------- lights: string lights, DJ beams, a dance-floor light
  function buildLights() {
    const g = new THREE.Group(); Y.built.group.add(g);
    const bulbOn = new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), bulbGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const runs = [[[2.4, FLY + 2.25, -4.3], [2.0, MD + 1.0, -10.3]], [[-2.4, FLY + 2.25, -4.3], [-2.0, MD + 1.0, -10.3]], [[0, FLY + 2.3, -4.3], [0, MD + 1.2, -10.4]], [[2.45, FLY + 1.0, -7.3], [-2.45, FLY + 1.0, -7.3]]];
    const pts = [];
    for (const [a, b] of runs) for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.35, a[2] + (b[2] - a[2]) * t]); }
    const inst = new THREE.InstancedMesh(bulbGeo, bulbOn, pts.length); const m4 = new THREE.Matrix4();
    pts.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); inst.setMatrixAt(i, m4); }); g.add(inst);
    const wire = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const [a, b] of runs) { const c = []; for (let i = 0; i <= 14; i++) { const t = i / 14; c.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.35 + 0.05, a[2] + (b[2] - a[2]) * t)); } g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(c), 28, 0.006, 4), wire)); }
    // DJ beams: two additive cones that sweep over the dance floor
    const beamMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beams = [0xff3db8, 0x3dc8ff].map((c, i) => { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 20, 1, true), beamMat(c)); cone.geometry.translate(0, -2.25, 0); const piv = new THREE.Group(); piv.position.set(i ? -1.6 : 1.6, FLY - 0.2, -4.4); piv.add(cone); g.add(piv); return piv; });
    const light = new THREE.PointLight(0xff4fc0, 0, 14, 1.6); light.position.set(0, MD + 2.4, -7.2); g.add(light);
    Y.lights = { g, inst, beams, light, bulbOn };
  }
  function lightsTick(dt) {
    const L = Y.lights; if (!L) return;
    const h = ((game.timeOfDay ?? 14) % 24 + 24) % 24, night = h > 19 || h < 6.5;
    const t = performance.now() / 1000, beat = Math.max(0, Math.sin(t * Math.PI * 2 * (124 / 60)));
    L.bulbOn.color.setHex(night ? 0xffd9a0 : 0xb8ab96);
    L.beams.forEach((b, i) => { b.visible = night; b.rotation.z = Math.sin(t * 0.9 + i * 2) * 0.55; b.rotation.x = Math.cos(t * 0.7 + i) * 0.35; b.children[0].material.opacity = 0.08 + beat * 0.08; });
    L.light.intensity = night ? 3 + beat * 4 : 0;
    if (night) L.light.color.setHSL((t * 0.08) % 1, 0.9, 0.55);
  }

  // ---------------------------------------------------------------- music (CC BY tracks, positional, muffled from outside)
  function startMusic() {
    const A = game.audio, ctx = A?.ctx; if (!ctx || Y.music) return;
    try {
      const el = new Audio(); el.crossOrigin = 'anonymous'; el.loop = false; el.preload = 'auto';
      const list = def.tracks.slice(); let i = (Math.random() * list.length) | 0;
      const next = () => { el.src = (import.meta.env?.BASE_URL || '/') + 'assets/audio/music/' + list[i++ % list.length]; el.play().catch(() => { /* resumes after a gesture */ }); };
      el.addEventListener('ended', next);
      const src = ctx.createMediaElementSource(el), lp = ctx.createBiquadFilter(), bass = ctx.createBiquadFilter(), g = ctx.createGain(), pan = ctx.createPanner();
      lp.type = 'lowpass'; lp.frequency.value = 800; bass.type = 'lowshelf'; bass.frequency.value = 120; bass.gain.value = 6; g.gain.value = 0;
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 10; pan.rolloffFactor = 1.1; pan.maxDistance = 400;
      const at = Y.toW(0, MD + 1.5, -5); pan.positionX.value = at.x; pan.positionY.value = at.y; pan.positionZ.value = at.z;
      src.connect(bass).connect(lp).connect(g).connect(pan).connect(A.ambienceBus || ctx.destination);
      Y.music = { el, lp, g, pan, src }; next();
    } catch (e) { console.warn('[yachtParty] music', e); Y.music = null; }
  }
  function musicTick() {
    const m = Y.music; if (!m) return; const ctx = game.audio.ctx, t = ctx.currentTime;
    const onBoard = isOnBoard(), d = Math.hypot(P().x - Y.yacht.x, P().z - Y.yacht.z);
    m.lp.frequency.setTargetAtTime(onBoard ? 14000 : Math.max(500, 4000 * Math.exp(-d / 40)), t, 0.3);
    m.g.gain.setTargetAtTime(game.audio.muted ? 0 : (onBoard ? 0.9 : 1.2), t, 0.5);
  }
  function stopMusic() { const m = Y.music; if (!m) return; Y.music = null; try { m.g.gain.setTargetAtTime(0, game.audio.ctx.currentTime, 0.2); setTimeout(() => { try { m.el.pause(); m.el.removeAttribute('src'); m.el.load(); m.src.disconnect(); } catch (e) { /* */ } }, 600); } catch (e) { /* */ } }

  // ---------------------------------------------------------------- people
  function staged(place, pose, lx, ly, lz, heading, seed) {
    if (!game.npc?.spawnPosed) return null;
    const w = Y.toW(lx, ly, lz);
    let h = null; try { h = game.npc.spawnPosed({ place, pose, pos: { x: w.x, y: w.y, z: w.z }, rot: Y.geo.heading + heading, seed }); } catch (e) { h = null; }
    if (h) { h.home = { lx, ly, lz, pose }; Y.guests.push(h); }
    return h;
  }
  function pedAt(lx, ly, lz, heading, outfit, worldPos) {
    const w = worldPos || Y.toW(lx, ly, lz);
    const p = castPed(game, w, outfit);
    if (!p) return null;
    p.pinned = 1e9; p.v21 = { venue: 'yacht', y: w.y }; p.nav = null; p.group = null; p.state = 'talk'; p.act = 'talk'; p.stateT = 1e9;
    p.idleStyle = 'cross_arms'; p.heading = heading; p.pos.copy(w); p.groundY = w.y; p.health = 140; p.tough = true;
    if (p.root) { p.root.position.copy(w); p.root.rotation.y = heading; }
    p.home = { x: w.x, y: w.y, z: w.z, heading };
    return p;
  }
  function spawnPeople() {
    const B = Y.built, G = Y.geo; let seed = 900;
    // dancers on the aft deck, the DJ, the bartender
    const dance = ['dance', 'dance_arms', 'dance_sway'];
    [[-0.5, -7.6], [0.5, -8.1], [-0.2, -9.0], [0.7, -6.9], [-0.9, -8.6], [0.1, -5.6]].forEach(([x, z], i) => staged('nightlife', dance[i % 3], x, MD, z, Math.random() * 6.28, seed++));
    staged('nightlife', 'dance_arms', 0, MD, -3.45, Math.PI, seed++);
    const bs = B.spots.find((s) => s.type === 'bar' && s.tags.includes('bartender'));
    if (bs) Y.barman = staged('bartender', 'bartend', bs.x, bs.y, bs.z, bs.heading, seed++);
    // at the bar (standing drinkers), on the sofa, in the hot tub, on the sun pads, a couple at the bow
    [[-0.4, -5.3, -Math.PI / 2], [-0.35, -6.7, -Math.PI / 2]].forEach(([x, z, h]) => staged('nightlife', 'drink', x, MD, z, h, seed++));
    B.spots.filter((s) => s.type === 'seat').slice(0, 2).forEach((s) => staged('nightlife', 'sit', s.x, s.y, s.z, s.heading, seed++));
    B.spots.filter((s) => s.type === 'tub').slice(0, 3).forEach((s) => staged('beach', 'sit', s.x, s.y + 0.15, s.z, s.heading, seed++));
    B.spots.filter((s) => s.type === 'lounge').slice(0, 3).forEach((s) => staged('beach', 'lie', s.x, s.y, s.z, s.heading, seed++));
    staged('nightlife', 'talk_g', 0.6, FLY, -2.6, 2.4, seed++); staged('nightlife', 'drink', -0.5, FLY, -2.3, -0.8, seed++);
    // security: the bouncer at the gangway foot (faces the shore), one on deck by the stern steps
    const bf = { x: Y.gangFoot.x - G.out.x * 0.7 + G.side.x * 0.85, z: Y.gangFoot.z - G.out.z * 0.7 + G.side.z * 0.85 };
    Y.peds.bouncer = pedAt(0, 0, 0, G.heading + Math.PI, 'security', new THREE.Vector3(bf.x, PIER_Y, bf.z));
    Y.peds.guard = pedAt(-1.3, MD, -9.3, G.heading + Math.PI * 0.8, 'security');
  }
  function clearPeople() {
    for (const h of Y.guests) { try { h.remove(); } catch (e) { /* */ } } Y.guests = []; Y.barman = null;
    for (const k of Object.keys(Y.peds)) { const p = Y.peds[k]; if (p?.active) { p.pinned = 0; p.v21 = null; p.despawnNow = true; } } Y.peds = {};
  }

  // ---------------------------------------------------------------- state
  function isOnBoard() {
    if (!Y.built || !Y.toL) return false;
    const l = Y.toL(P()); const b = Y.deckBox;
    return l.x > b.x0 && l.x < b.x1 && l.z > b.z0 && l.z < b.z1 && l.y > 0.2 && l.y < FLY + 3;
  }
  function looks() {
    let s = 0, why = [];
    try {
      const c = game.wardrobe?.current?.() || {}, ids = Object.values(c).filter(Boolean).join(' ');
      if (/shoes_dress/.test(ids)) { s += 2; why.push('the shoes'); }
      if (/watch_gold/.test(ids)) { s += 2; why.push('the watch'); }
      if (/chain_silver\b|chain_gold/.test(ids)) s += 0.5;
      if (/pants|trousers|chinos/.test(ids)) { s += 1; why.push('long pants'); }
      if (/shirt_linen_white|shirt_black|shirt_tropical_midnight/.test(ids)) { s += 1; why.push('the shirt'); }
      if (/swim_trunks|shorts_camo|uniform_delivery/.test(ids)) s -= 1.5;
      const dz = game.wardrobe?.disguise?.() || null; void dz;
    } catch (e) { /* */ }
    return { score: s, why };
  }
  function disguise() {
    try { const c = game.wardrobe?.current?.() || {}; const ids = Object.values(c).filter(Boolean).join(' '); const m = /uniform_(valet|security|delivery)_shirt/.exec(ids); return m ? m[1] : null; } catch (e) { return null; }
  }
  function admit(how) {
    Y.status = how === 'staff' ? 'staff' : 'guest'; setGate(false);
    const lines = { looks: 'Looking sharp. Go on up.', list: 'Huh. There you are. Go ahead.', bribe: 'I didn\'t see anything. Enjoy the party.', staff: 'Kitchen\'s through the saloon. Move it.' };
    say(game, BOUNCER, lines[how] || 'Go ahead.', 2600, '#c9a14a');
    notify(game, 'You\'re in. Free drinks at the bar. Don\'t get caught doing anything stupid.', 4200);
    game.emit?.('activity:start', { id: 'yachtParty', how });
  }
  function talkToBouncer() {
    const panel = getPanelSafe(game); if (!panel) return;
    if (Y.status === 'banned') { say(game, BOUNCER, 'You again? Beat it before I throw you in myself.', 2600, '#c9a14a'); return; }
    if (Y.refusedT > 0) { say(game, BOUNCER, 'I said no. Walk away.', 2200, '#c9a14a'); return; }
    const L = looks(), dz = disguise();
    say(game, BOUNCER, L.score >= 3 ? `Nice ${L.why[0] || 'outfit'}. Name?` : L.score <= -1 ? 'Swim trunks. Really. Name?' : 'Private party. Name?', 2600, '#c9a14a');
    const acts = [];
    if (L.score >= 3) acts.push({ label: 'Just nod. You look like you belong here.', fn: () => { panel.hide(); admit('looks'); } });
    acts.push({ label: '"I\'m on the list. Check again."', price: 'risky', fn: () => { panel.hide(); if (Math.random() < 0.2 + Math.max(0, L.score) * 0.12) admit('list'); else { Y.refusedT = 45; say(game, BOUNCER, 'Funny, you\'re not. Get lost.', 2600, '#c9a14a'); notify(game, 'Refused. Dress the part, pay him, or find another way aboard.', 4200); } } });
    acts.push({ label: 'Slip him some cash', price: fmt(def.bribe), fn: () => { panel.hide(); if (payCash(game, def.bribe, { to: 'Bouncer', memo: 'Bribe', category: 'bribe', accepts: ['cash'] })) admit('bribe'); else say(game, BOUNCER, 'Cash only, and you don\'t have enough of it.', 2400, '#c9a14a'); } });
    if (dz) acts.push({ label: `"Staff. ${dz === 'valet' ? 'Valet' : dz === 'security' ? 'Extra security' : 'Catering delivery'}."`, fn: () => { panel.hide(); admit('staff'); } });
    acts.push({ label: 'Walk away', fn: () => panel.hide() });
    panel.show('yacht', `<h2>Midnight Tide</h2><div class="sub">Private party · the bouncer looks you up and down</div><div class="row"><span>Your look</span><span>${L.score >= 3 ? 'sharp' : L.score >= 1 ? 'so-so' : 'not the dress code'}</span></div>`, acts);
  }
  function spot(why) {
    if (Y.spotted || Y.status === 'outside') return;
    Y.spotted = true; Y.suspicion = 1;
    say(game, GUEST, why === 'pickpocket' ? 'Hey! He took my wallet! SECURITY!' : 'Who is that? He wasn\'t at the gangway... SECURITY!', 2800, '#ff5fa8');
    sfx(game, 'scream', P(), 0.5);
    for (const h of Y.guests) { const d = h.root.position.distanceTo(P()); if (d < 7 && h !== Y.barman) { try { h.setPose(Math.random() < 0.5 ? 'cower' : 'photo'); } catch (e) { /* */ } } }
    const g = Y.peds.guard; if (g && !pedOut(g)) { g.idleStyle = null; g.state = 'fight'; g.stateT = 20; g.hitCd = 99; g.guard = false; }
    say(game, SECURITY, 'You. Off the boat. Now.', 2400, '#c9a14a');
    game.emit?.('activity:yachtSpotted', { why });
  }
  function throwOut() {
    const G = Y.geo; if (!G) return;
    const w = { x: Y.yacht.x + G.side.x * 6, z: Y.yacht.z + G.side.z * 6 };
    game.teleport(w.x, SEA - 0.4, w.z, G.heading);
    sfx(game, 'splash', w, 1);
    notify(game, 'Security threw you overboard. You\'re banned from the Midnight Tide tonight.', 4500);
    say(game, SECURITY, 'And stay out!', 2000, '#c9a14a');
    Y.status = 'banned'; Y.bannedT = 240; Y.spotted = false; Y.suspicion = 0; setGate(true); resetGuard();
    game.emit?.('activity:end', { id: 'yachtParty', outcome: 'thrownOut' });
  }
  function resetGuard() {
    const g = Y.peds.guard; if (!g || pedOut(g)) return;
    g.state = 'talk'; g.stateT = 1e9; g.idleStyle = 'cross_arms'; g.guard = false; g.pos.set(g.home.x, g.home.y, g.home.z); g.heading = g.home.heading;
    try { g.body?.setTranslation({ x: g.home.x, y: g.home.y + 0.9, z: g.home.z }, true); g.teleported = true; } catch (e) { /* */ }
  }
  function startFight() {
    if (Y.fight) return; Y.fight = true; Y.spotted = true;
    say(game, SECURITY, 'Oh, you wanna go?!', 2000, '#c9a14a');
    for (const h of Y.guests) { try { if (h !== Y.barman) h.setPose('cower'); } catch (e) { /* */ } }
    try { game.emit?.('crime', { type: 'trespass', position: P().clone(), severity: 1, by: 'witness', witnessed: true }); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------- per frame
  function tick(dt, s, d) {
    if (!Y.built) return;
    if (Y.refusedT > 0) Y.refusedT -= dt;
    if (Y.bannedT > 0 && (Y.bannedT -= dt) <= 0 && Y.status === 'banned') Y.status = 'outside';
    lightsTick(dt); musicTick();
    for (const p of [Y.peds.bouncer, Y.peds.guard]) if (p?.active && p.home) { if (Math.abs(p.pos.y - p.home.y) > 0.01) { p.pos.y = p.home.y; if (p.root) p.root.position.y = p.home.y; } if (p.state === 'talk') p.idleStyle = 'cross_arms'; }
    // staged people: small life (turn the drinkers now and then, someone says a line when you pass)
    const now = performance.now() / 1000;
    for (const h of Y.guests) if (h.root.position.distanceTo(P()) < 2.2 && (!h.saidT || now - h.saidT > 25) && Y.status !== 'outside' && !Y.spotted && h !== Y.barman && h.home.pose !== 'lie') { h.saidT = now; if (Math.random() < 0.5) say(game, GUEST, GUEST_LINES[(Math.random() * GUEST_LINES.length) | 0], 2600, '#ff5fa8'); }
    const onBoard = isOnBoard();
    if (onBoard && Y.status === 'outside') { Y.status = 'sneak'; notify(game, 'You slipped aboard. Stay away from security, and blend in.', 4200); game.emit?.('activity:start', { id: 'yachtParty', how: 'sneak' }); }
    if (Y.status === 'banned' && onBoard && !Y.spotted) spot('banned');
    if (!onBoard && (Y.status === 'guest' || Y.status === 'staff' || Y.status === 'sneak') && Math.hypot(P().x - Y.yacht.x, P().z - Y.yacht.z) > 60) { Y.status = Y.status === 'sneak' ? 'outside' : Y.status; }
    // security fight: once you hit one of them, both come at you
    const sec = [Y.peds.bouncer, Y.peds.guard].filter((p) => p && !pedOut(p));
    if (!Y.fight && sec.some((p) => (p.health ?? 140) < 135 || p.state === 'down')) startFight();
    if (Y.fight) { for (const p of sec) keepFighting(p); if (!sec.length || d > 150) { Y.fight = false; Y.spotted = false; Y.status = 'banned'; Y.bannedT = 300; setGate(true); } }
    // spotted: the guard walks you down; within reach he throws you overboard
    else if (Y.spotted && Y.peds.guard && !pedOut(Y.peds.guard)) {
      const g = Y.peds.guard; g.state = 'fight'; g.stateT = 10; g.hitCd = 99;
      if (Math.hypot(g.pos.x - P().x, g.pos.z - P().z) < 1.5) throwOut();
      else if (!onBoard && Math.hypot(P().x - Y.yacht.x, P().z - Y.yacht.z) > 25) { Y.spotted = false; Y.status = 'banned'; Y.bannedT = 240; resetGuard(); notify(game, 'You got off the boat before security caught you.', 3000); }
    }
    // suspicion while sneaking (the guard's eyes, guests who notice a wet stranger)
    if (Y.status === 'sneak' && onBoard && !Y.spotted) {
      const g = Y.peds.guard;
      if (g && !pedOut(g)) {
        const dx = P().x - g.pos.x, dz = P().z - g.pos.z, dg = Math.hypot(dx, dz);
        let fa = Math.atan2(dx, dz) - g.heading; fa = Math.atan2(Math.sin(fa), Math.cos(fa));
        if (dg < 9 && Math.abs(fa) < 1.2 && Math.abs(P().y - g.pos.y) < 2) Y.suspicion += dt * (dg < 4 ? 0.7 : 0.35);
        g.heading += Math.sin(now * 0.4) * dt * 0.4; if (g.root) g.root.rotation.y = g.heading;   // he looks around
      }
      for (const h of Y.guests) if (h.root.position.distanceTo(P()) < 1.8) Y.suspicion += dt * 0.05;
      Y.suspicion = Math.max(0, Y.suspicion - dt * 0.03);
      if (Y.suspicion >= 1) spot('sneak');
    }
    if (onBoard && Y.status !== 'outside' && !Y.fight) {
      const bars = Math.round(Math.min(1, Y.suspicion) * 10);
      pill('yacht', Y.spotted ? '<span style="color:#ff6b5a">SPOTTED</span> &nbsp;get off the boat' : `<span style="color:#ff5fa8">MIDNIGHT TIDE</span> &nbsp;${Y.status === 'sneak' ? 'gatecrashing' : Y.status === 'staff' ? 'staff' : 'guest'}${Y.suspicion > 0.02 ? ` &nbsp;<span style="letter-spacing:-1px;color:${bars > 6 ? '#ff6b5a' : '#ffd25a'}">${'█'.repeat(bars)}${'░'.repeat(10 - bars)}</span>` : ''}`, Y.spotted || Y.suspicion > 0.6);
    } else pill('yacht', null);
    prompts(dt, onBoard);
  }
  function prompts(dt, onBoard) {
    if (!canAct(game) || game.player.state?.inVehicle && !nearLadder()) { help(game, 'yacht', null); return; }
    // the bouncer
    const b = Y.peds.bouncer;
    if (b && !pedOut(b) && !Y.fight && !onBoard && Math.hypot(P().x - b.pos.x, P().z - b.pos.z) < 2.6) {
      if (Y.status === 'guest' || Y.status === 'staff') { help(game, 'yacht', null); return; }
      help(game, 'yacht', 'Press <b>E</b> to talk to the bouncer');
      if (game.input.pressed('KeyE')) talkToBouncer();
      return;
    }
    // climb aboard from the water / a boat at the stern ladder
    if (nearLadder()) {
      help(game, 'yacht', 'Press <b>E</b> to climb aboard');
      if (game.input.pressed('KeyE')) {
        if (game.player.state?.inVehicle) game.exitVehicle?.();
        const top = Y.toW(0, 0.5, (Y.built.meta.swim?.pos?.[2] ?? -10.4));
        setTimeout(() => { game.teleport(top.x, top.y + 0.05, top.z, Y.geo.heading); sfx(game, 'splash', top, 0.5); }, 120);
      }
      return;
    }
    if (!onBoard || Y.spotted) { help(game, 'yacht', null); return; }
    // the bar: a free drink
    if (Y.barman && Y.barman.root.position.distanceTo(P()) < 2.4) {
      help(game, 'yacht', 'Press <b>E</b> for a drink');
      if (game.input.pressed('KeyE')) {
        say(game, BARMAN, DRINKS[Math.min(Y.drinks, DRINKS.length - 1)], 2600, '#7dffb0'); Y.drinks++; sfx(game, 'glass', P(), 0.3);
        if (Y.drinks === 4) notify(game, 'You\'ve had a few. Maybe slow down.', 3000);
        game.stats?.add?.('partyDrinks', 1);
      }
      return;
    }
    // pickpocket: right behind a standing guest
    for (const h of Y.guests) {
      if (Y.picked.has(h) || h === Y.barman || /lie|sit/.test(h.home.pose)) continue;
      const p = h.root.position; if (p.distanceTo(P()) > 1.2) continue;
      let behind = Math.atan2(P().x - p.x, P().z - p.z) - h.root.rotation.y; behind = Math.abs(Math.atan2(Math.sin(behind), Math.cos(behind)));
      if (behind < 1.6) continue;
      help(game, 'yacht', 'Press <b>E</b> to pickpocket');
      if (game.input.pressed('KeyE')) {
        Y.picked.add(h);
        const risk = Y.status === 'sneak' ? 0.45 : 0.3;
        if (Math.random() < risk) { spot('pickpocket'); return; }
        const amt = 40 + Math.round(Math.random() * 160); earnCash(game, amt, 'Pickpocketed a guest', 'Midnight Tide', 'crime');
        notify(game, `Lifted ${fmt(amt)} from a guest's pocket.`, 2600); Y.suspicion += Y.status === 'sneak' ? 0.15 : 0.08;
      }
      return;
    }
    help(game, 'yacht', null);
  }
  function nearLadder() { if (!Y.ladder) return false; const p = P(); const sw = game.player.state?.swimming || game.player.state?.inWater || p.y < SEA + 0.4; return sw && Math.hypot(p.x - Y.ladder.x, p.z - Y.ladder.z) < 3.2 && !Y.spotted; }

  Y.site = H.site({ id: 'yachtParty', x: def.x, z: def.z, on: 420, off: 520, build, drop, tick });
  H.api('yachtParty', { get status() { return Y.status; }, get suspicion() { return Y.suspicion; }, get state() { return Y; }, admit, spot, throwOut, talkToBouncer, looks });
}

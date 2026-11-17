// Southline — pedestrians (CHARACTER agent), wave 4.
// Population streams around the player using the city API only (zoneAt, randomSidewalkPoint, roadGraph,
// benches, leanSpots, storefronts, groundHeightAt, isWater, surfaceAt). People follow sidewalks along the road
// graph and cross at intersections (crosswalks). Zone/time behaviours: beach sunbathers, volleyball, frisbee,
// swimmers/waders, shoreline walks; business pairs + phone calls; nightlife crowds dancing after 20h;
// residential dog walkers, joggers, gardeners; benches and leaning. Reactions: look-at, step aside, shove,
// panic (flee / cower / film), fight back, cops. Realistic ragdolls + get-up for non-lethal knockdowns.
import * as THREE from 'three';
import { createCharacter, humansLoaded, humansTotal } from '../player/characterModel.js';
import { createRagdollSystem } from './ragdoll.js';
import { PERSONAS, pickPersona } from './personality.js';
import { createSignals } from './streetlife.js';

const DESPAWN = 300, SPAWN_MIN = 20, SPAWN_MAX = 165;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _nt = { x: 0, z: 0 }, _frustum = new THREE.Frustum(), _proj = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 1.3);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const approachAngle = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * Math.min(1, k); };
const TOWEL_COLS = [0xe07f68, 0x2f8a86, 0xf0ede6, 0xe8d78a, 0x9cc1de, 0xb8a8d2, 0xe6b3b5, 0x3b6fb6];
const NONMOVING = new Set(['convo', 'freeze', 'call', 'watch', 'talk', 'dance', 'bench', 'lean', 'garden', 'sunbathe', 'volley', 'frisbee', 'wade', 'cower', 'film', 'gettingUp', 'argue']);
const LIMB_PART = { head: 'head', neck: 'head', torso_upper: 'chest', torso_lower: 'pelvis', upperarm_l: 'uArmL', forearm_l: 'lArmL', upperarm_r: 'uArmR', forearm_r: 'lArmR', thigh_l: 'thighL', shin_l: 'shinL', thigh_r: 'thighR', shin_r: 'shinR' };

const _gcache = new Map();
const SG = (key, Ctor, ...a) => { const k = key + ':' + a.join(','); let g = _gcache.get(k); if (!g) { g = new Ctor(...a); _gcache.set(k, g); } return g; };
export async function createPeds(game) {
  const { scene, world, RAPIER } = game;
  const city = game.city || {};
  const list = [];
  const playerPos = () => game.player?.position || _v.set(0, 0, 0);
  const hourNow = () => (((game.timeOfDay ?? 14) % 24) + 24) % 24;
  const zoneAt = (x, z) => { try { return city.zoneAt?.(x, z) || 'residential'; } catch (e) { return 'residential'; } };
  // height of the surface at the person's own level (hint just above the feet), never the highest deck overhead
  const groundAt = (x, z, fallback = 0) => { try { const g = city.groundHeightAt?.(x, z, fallback + 1.2); return Number.isFinite(g) ? g : fallback; } catch (e) { return fallback; } };
  const isWater = (x, z) => { try { return !!city.isWater?.(x, z); } catch (e) { return false; } };
  const surfaceAt = (x, z) => { try { return city.surfaceAt?.(x, z) || 'concrete'; } catch (e) { return 'concrete'; } };
  const seaLevel = city.seaLevel ?? -0.12;
  const collidersReady = (x, z) => { try { return city.collidersReadyAt ? !!city.collidersReadyAt(x, z) : true; } catch (e) { return true; } };

  let rag = null;
  try { rag = createRagdollSystem(game, 6); } catch (e) { rag = null; }
  let kcc = null;
  try {
    kcc = world.createCharacterController(0.02);
    kcc.enableAutostep(0.32, 0.15, true);
    kcc.enableSnapToGround(0.4);
    kcc.setSlideEnabled(true);
    kcc.setApplyImpulsesToDynamicBodies(false);
    kcc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
  } catch (e) { kcc = null; console.warn('[peds] no character controller', e); }

  const signals = createSignals(game);
  // ---------------------------------------------------------------- road graph sidewalk navigation
  const RG = city.roadGraph && city.roadGraph.edges && city.roadGraph.nearestEdge ? city.roadGraph : null;
  const cumCache = new WeakMap();
  function cum(edge) {
    let c = cumCache.get(edge);
    if (!c) { c = [0]; const p = edge.pts; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); cumCache.set(edge, c); }
    return c;
  }
  const edgeLen = (e) => { const c = cum(e); return c[c.length - 1]; };
  function edgeAt(e, d, out) {
    const c = cum(e), p = e.pts; const L = c[c.length - 1];
    d = Math.max(0, Math.min(L, d));
    let i = 1; while (i < c.length - 1 && c[i] < d) i++;
    const seg = c[i] - c[i - 1] || 1, t = (d - c[i - 1]) / seg;
    const x0 = p[i - 1][0], z0 = p[i - 1][1], x1 = p[i][0], z1 = p[i][1];
    const tx = (x1 - x0) / seg, tz = (z1 - z0) / seg;
    out.x = x0 + (x1 - x0) * t; out.z = z0 + (z1 - z0) * t; out.tx = tx; out.tz = tz;
    return out;
  }
  const walkable = (e) => e && e.pts && e.pts.length > 1 && !/motorway|trunk|_link|rail|ferry/.test(e.kind || '') && (e.speedKmh || 40) < 75 && !(e.bridge && (e.speedKmh || 40) > 55);
  const sideOffset = (e) => (e.width || 8) / 2 + 2.0;
  const nodeEdges = (id) => { try { return RG.edgesAt(id) || []; } catch (e) { return []; } };
  const _ep = { x: 0, z: 0, tx: 0, tz: 1 };
  // place a ped's nav on the nearest walkable edge
  function navFromPos(ped) {
    if (!RG) return null;
    let r = null; try { r = RG.nearestEdge(ped.pos.x, ped.pos.z); } catch (e) { r = null; }
    if (!r || !walkable(r.edge) || r.dist > 40) return null;
    const e = r.edge, L = edgeLen(e);
    const s = Math.max(0, Math.min(L, (r.t ?? 0.5) <= 1 ? (r.t ?? 0.5) * L : r.t));
    edgeAt(e, s, _ep);
    const nx = -_ep.tz, nz = _ep.tx;
    const side = ((ped.pos.x - _ep.x) * nx + (ped.pos.z - _ep.z) * nz) >= 0 ? 1 : -1;
    const dir = Math.random() < 0.5 ? 1 : -1;
    return { edge: e, s, dir, hand: side * dir, jit: rand(-0.5, 0.9), cross: null };
  }
  function navTarget(ped, out) {
    const n = ped.nav; const e = n.edge;
    edgeAt(e, n.s, _ep);
    const side = n.hand * n.dir;
    const off = sideOffset(e) + n.jit;
    out.x = _ep.x - _ep.tz * side * off; out.z = _ep.z + _ep.tx * side * off;
    return Math.atan2(_ep.tx * n.dir, _ep.tz * n.dir);
  }
  // advance along the sidewalk; returns desired heading; moves ped.pos in xz
  function navStep(ped, dt, speed) {
    const n = ped.nav;
    if (n.cross) { // crossing an intersection / crosswalk in a straight line
      const dx = n.cross.x - ped.pos.x, dz = n.cross.z - ped.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.35 || n.crossT > 12) { n.cross = null; }
      else { n.crossT += dt; const k = Math.min(1, speed * dt / d); ped.pos.x += dx * k; ped.pos.z += dz * k; return Math.atan2(dx, dz); }
    }
    const L = edgeLen(n.edge);
    n.s += n.dir * speed * dt;
    if (n.s < 0 || n.s > L) {
      const atEnd = n.s > L;
      const node = atEnd ? n.edge.b : n.edge.a;
      let cands = nodeEdges(node).filter((e) => e !== n.edge && walkable(e));
      if (!cands.length) { n.dir *= -1; n.s = Math.max(0, Math.min(L, n.s)); }
      else {
        // prefer going roughly straight
        edgeAt(n.edge, atEnd ? L : 0, _ep);
        const hx = _ep.tx * n.dir, hz = _ep.tz * n.dir;
        const scored = cands.map((e) => { const fwd = e.a === node; const q = edgeAt(e, fwd ? 0.5 : edgeLen(e) - 0.5, { x: 0, z: 0, tx: 0, tz: 0 }); const dd = fwd ? 1 : -1; return { e, fwd, w: 0.35 + Math.max(0, q.tx * dd * hx + q.tz * dd * hz) }; });
        let tot = scored.reduce((a, b) => a + b.w, 0), r = Math.random() * tot, ch = scored[0];
        for (const sc of scored) { r -= sc.w; if (r <= 0) { ch = sc; break; } }
        if (Math.random() < 0.18) n.hand *= -1; // cross over to the other side at the crosswalk
        n.edge = ch.e; n.dir = ch.fwd ? 1 : -1; n.s = ch.fwd ? 0.01 : edgeLen(ch.e) - 0.01;
        const t = _nt; navTarget(ped, t);
        n.cross = { x: t.x, z: t.z }; n.crossT = 0;
        // npc-life: remember the corner, so walkers can wait for the walk signal there (streetlife.js)
        n.cross.node = node;
        n.cross.sig = 0;
        // patient people wait at the corner before crossing; impatient ones go straight (people.v2.js traits)
        if (ped.P && ped.P.patience !== undefined && ped.state === 'walk' && ped.P.patience > 0.4 && Math.random() < 0.7) ped.waitT = rand(0.8, 1.5 + ped.P.patience * 4);
        return Math.atan2(t.x - ped.pos.x, t.z - ped.pos.z);
      }
    }
    const t = _nt; const h = navTarget(ped, t);
    const dx = t.x - ped.pos.x, dz = t.z - ped.pos.z, d = Math.hypot(dx, dz);
    if (d > 6) { n.cross = { x: t.x, z: t.z }; n.crossT = 0; return Math.atan2(dx, dz); }
    // follow the sidewalk line with gentle lateral correction
    ped.pos.x += Math.sin(h) * speed * dt + dx * Math.min(1, dt * 2);
    ped.pos.z += Math.cos(h) * speed * dt + dz * Math.min(1, dt * 2);
    return h;
  }
  function freeStep(ped, dt, speed) {
    if (!ped.target || Math.hypot(ped.target.x - ped.pos.x, ped.target.z - ped.pos.z) < 1.2) {
      ped.target = ped.act === 'shore' ? shorePoint(ped.pos, 40) : sidewalkNear(ped.pos, 35);
      if (!ped.target) ped.target = new THREE.Vector3(ped.pos.x + rand(-15, 15), ped.pos.y, ped.pos.z + rand(-15, 15));
    }
    const dx = ped.target.x - ped.pos.x, dz = ped.target.z - ped.pos.z, d = Math.hypot(dx, dz) || 1;
    ped.pos.x += (dx / d) * speed * dt; ped.pos.z += (dz / d) * speed * dt;
    return Math.atan2(dx, dz);
  }

  // ---------------------------------------------------------------- spots
  function sidewalkNear(c, r, zone = null) {
    try { const p = city.randomSidewalkPoint?.(c, r, zone); if (p && Number.isFinite(p.x)) return p.clone ? p.clone() : new THREE.Vector3(p.x, p.y || 0, p.z); } catch (e) { /* ignore */ }
    return null;
  }
  // sand near the water (for sunbathers / shoreline walkers)
  function sandPoint(c, r, nearWater = false) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (isWater(x, z) || zoneAt(x, z) !== 'beach') continue;
      const s = surfaceAt(x, z); if (s !== 'sand') continue;
      if (nearWater) { let w = false; for (const [ox, oz] of [[6, 0], [-6, 0], [0, 6], [0, -6], [12, 0], [-12, 0], [0, 12], [0, -12]]) if (isWater(x + ox, z + oz)) { w = true; break; } if (!w) continue; }
      return new THREE.Vector3(x, groundAt(x, z, 0), z);
    }
    return null;
  }
  function shorePoint(c, r) { return sandPoint(c, r, true) || sandPoint(c, r); }
  function waterPoint(c, r, shallow) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (!isWater(x, z)) continue;
      const bed = groundAt(x, z, -2);
      const depth = seaLevel - bed;
      if (shallow ? (depth > 0.15 && depth < 0.9) : (depth > 1.2 && depth < 6)) {
        // must be close to a beach
        let ok = false; for (const [ox, oz] of [[15, 0], [-15, 0], [0, 15], [0, -15], [30, 0], [-30, 0], [0, 30], [0, -30]]) if (!isWater(x + ox, z + oz) && zoneAt(x + ox, z + oz) === 'beach') { ok = true; break; }
        if (ok) return new THREE.Vector3(x, bed, z);
      }
    }
    return null;
  }
  // spot lists near the player (benches / lean spots / storefronts), refreshed every few seconds
  let spotsT = 99; const spots = { benches: [], lean: [], fronts: [] }; const used = new Set();
  function refreshSpots(pp) {
    const near = (arr, r, getP) => { const out = []; if (!Array.isArray(arr)) return out; for (const s of arr) { const p = getP(s); if (p && Math.abs(p.x - pp.x) < r && Math.abs(p.z - pp.z) < r) out.push(s); } return out; };
    spots.benches = near(city.benches, 150, (s) => s.pos);
    spots.lean = near(city.leanSpots, 150, (s) => s.pos);
    spots.fronts = near(city.storefronts || city.shopLots, 160, (s) => s);
  }
  const freeSpot = (arr, pp) => {
    const c = arr.filter((s) => !used.has(s)); if (!c.length) return null;
    for (let i = 0; i < 6; i++) { const s = pick(c); const p = s.pos || s; const d = Math.hypot(p.x - pp.x, p.z - pp.z); if (d > SPAWN_MIN && d < SPAWN_MAX) return s; }
    return null;
  };

  // ---------------------------------------------------------------- props (towels, umbrellas, balls, discs, dogs)
  const propGeo = {
    towel: (() => { const g = new THREE.PlaneGeometry(0.95, 1.9); g.rotateX(-Math.PI / 2); return g; })(),
    pole: new THREE.CylinderGeometry(0.022, 0.022, 2.2, 6), canopy: new THREE.ConeGeometry(1.15, 0.45, 12, 1, true),
    ball: new THREE.SphereGeometry(0.11, 12, 8), disc: new THREE.CylinderGeometry(0.13, 0.12, 0.025, 16),
  };
  const propMat = new Map(); let netMat = null; const leashMat = new THREE.LineBasicMaterial({ color: 0x222222 });
  const pmat = (c, r = 0.8, side = THREE.FrontSide) => { const k = c + ':' + r + ':' + side; if (!propMat.has(k)) propMat.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, side })); return propMat.get(k); };
  const props = new Set();
  function addProp(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); props.add(mesh); return mesh; }
  function removeProp(m) { if (!m) return; scene.remove(m); props.delete(m); }
  function makeUmbrella(x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const pole = new THREE.Mesh(propGeo.pole, pmat(0xdddddd, 0.4)); pole.position.y = 1.1; g.add(pole);
    const can = new THREE.Mesh(propGeo.canopy, pmat(pick([0xe07f68, 0x2f8a86, 0xe8d78a, 0xf0ede6, 0x3b6fb6]), 0.85, THREE.DoubleSide)); can.position.y = 2.15; g.add(can);
    g.rotation.z = rand(-0.12, 0.12);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    scene.add(g); props.add(g); return g;
  }
  // a simple procedural dog (low poly, animated legs) + leash line
  const dogMat = [0x3b2a1e, 0xd8c3a0, 0x1c1a18, 0x8a6a46, 0xe9e2d6].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  function makeDog() {
    const s = rand(0.75, 1.25); const m = pick(dogMat);
    const g = new THREE.Group(); g.scale.setScalar(s);
    const body = new THREE.Mesh(SG('CapsuleGeometry', THREE.CapsuleGeometry, 0.11, 0.38, 3, 8), m); body.rotation.x = Math.PI / 2; body.position.y = 0.36; g.add(body);
    const head = new THREE.Mesh(SG('SphereGeometry', THREE.SphereGeometry, 0.1, 10, 8), m); head.position.set(0, 0.5, 0.3); g.add(head);
    const snout = new THREE.Mesh(SG('CapsuleGeometry', THREE.CapsuleGeometry, 0.045, 0.07, 3, 6), m); snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.47, 0.41); g.add(snout);
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(SG('ConeGeometry', THREE.ConeGeometry, 0.04, 0.09, 5), m); ear.position.set(sx * 0.06, 0.6, 0.28); g.add(ear); }
    const tail = new THREE.Mesh(SG('CylinderGeometry', THREE.CylinderGeometry, 0.015, 0.025, 0.22, 5), m); tail.position.set(0, 0.45, -0.3); tail.rotation.x = -0.7; g.add(tail);
    const legs = [];
    for (const [lx, lz] of [[-0.07, 0.18], [0.07, 0.18], [-0.07, -0.18], [0.07, -0.18]]) {
      const pivot = new THREE.Group(); pivot.position.set(lx, 0.32, lz);
      const leg = new THREE.Mesh(SG('CylinderGeometry', THREE.CylinderGeometry, 0.025, 0.02, 0.32, 5), m); leg.position.y = -0.16; pivot.add(leg); g.add(pivot); legs.push(pivot);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const leash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), leashMat);
    leash.frustumCulled = false;
    scene.add(g); scene.add(leash);
    return { g, legs, tail, leash, phase: 0, pos: new THREE.Vector3(), heading: 0 };
  }
  function updateDog(ped, dt) {
    const d = ped.dog; if (!d) return;
    const side = _v3.set(Math.cos(ped.heading), 0, -Math.sin(ped.heading)); // ped's right
    const want = _v.copy(ped.pos).addScaledVector(side, -0.9); want.x += Math.sin(ped.heading) * 0.6; want.z += Math.cos(ped.heading) * 0.6;
    const dx = want.x - d.pos.x, dz = want.z - d.pos.z, dist = Math.hypot(dx, dz);
    if (dist > 6) d.pos.copy(want);
    const sp = Math.min(4, dist * 3);
    if (dist > 0.05) { d.pos.x += dx / dist * sp * dt; d.pos.z += dz / dist * sp * dt; d.heading = approachAngle(d.heading, Math.atan2(dx, dz), dt * 6); }
    d.pos.y = ped.pos.y;
    d.phase += dt * (2 + sp * 4);
    const sw = Math.min(1, sp) * 0.6;
    d.legs.forEach((l, i) => { l.rotation.x = Math.sin(d.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * sw; });
    d.tail.rotation.z = Math.sin(d.phase * 2) * 0.4;
    d.g.position.copy(d.pos); d.g.rotation.y = d.heading;
    // leash from the ped's right hand to the collar
    const hand = ped.char.getBone?.('RightHand');
    const a = hand ? hand.getWorldPosition(_v2) : ped.pos.clone().setY(ped.pos.y + 0.9);
    const b = _v3.copy(d.pos); b.x += Math.sin(d.heading) * 0.28; b.y += 0.48 * d.g.scale.y; b.z += Math.cos(d.heading) * 0.28;
    const arr = d.leash.geometry.attributes.position.array; arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z; d.leash.geometry.attributes.position.needsUpdate = true;
  }
  function removeDog(ped) { if (!ped.dog) return; scene.remove(ped.dog.g); scene.remove(ped.dog.leash); ped.dog.leash.geometry.dispose(); ped.dog = null; }

  // ---------------------------------------------------------------- character pool (reuse by zone)
  const pool = [];
  let seedN = 1;
  let createdThisFrame = 0;
  const canSpawn = (n) => pool.length + (createdThisFrame ? 0 : 1) >= n;
  function getChar(zone, opts = {}) {
    const want = zone;
    // people already on screen: avoid duplicates (every person should look different)
    const activeIds = new Set(list.filter((p) => p.active && p.char?.human).map((p) => p.char.human.id));
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (c.human && activeIds.has(c.human.id)) continue;
      if (c.zoneTag && zoneFits(c.zoneTag, want) && (!opts.gender || (c.human?.gender === (opts.gender[0] === 'f' ? 'f' : 'm')))) { pool.splice(i, 1); c.root.visible = true; return c; }
    }
    if (createdThisFrame >= 1 && !opts.force) { // creation budget (<=1 per frame) spent: reuse any pooled person
      if (pool.length) { const c = pool.pop(); c.root.visible = true; return c; }
      return null;
    }
    createdThisFrame++;
    const sd = 1000 + (seedN++) * 37;
    // archetype people (src/npc/arch, PEOPLE-LOOK) when loaded for this place; the legacy library body otherwise
    const c = game.npc?.createPed?.({ seed: sd, zone: want, gender: opts.gender }) || createCharacter(game, { variant: 'ped', seed: sd, zone: want, gender: opts.gender, exclude: activeIds });
    scene.add(c.root);
    return c;
  }
  function zoneFits(tag, zone) {
    const m = { beach: ['beach', 'casual', 'sport'], business: ['business', 'casual'], downtown: ['business', 'casual'], nightlife: ['nightlife', 'casual'], night: ['nightlife', 'casual'], port: ['port'], industrial: ['port', 'casual'], park: ['sport', 'casual'], causeway: ['sport', 'casual'], cop: ['cop'] };
    return (m[zone] || ['casual', 'sport']).includes(tag);
  }
  // bounded pool; characters beyond it are truly removed and their GPU resources freed (bone textures, per-instance materials)
  function releaseChar(c) { if (!c) return; c.root.visible = false; if (pool.length < 12) pool.push(c); else { try { game.people?.undress?.(c); } catch (e) { /* ignore */ } scene.remove(c.root); c.dispose?.(); } }

  // ---------------------------------------------------------------- ped lifecycle
  // Is (x, z) a place a person can stand? Not inside a road's carriageway, not near a motorway / trunk / link / bridge
  // edge, and not where an elevated deck exists (deck height and street height differ there). Playtest: idle
  // "parked people" on highways, bridges and causeways.
  function spotOK(x, z) {
    try {
      if (RG) {
        const r = RG.nearestEdge(x, z);
        const e = r?.edge;
        if (e && Number.isFinite(r.dist)) {
          const half = (e.width || 8) / 2;
          if (r.dist < half + 0.3) {
            return false;
          }
          if ((/motorway|_link/.test(e.kind || '') || e.bridge || (e.speedKmh || 40) >= 75) && r.dist < half + 6) {
            return false;
          }
        }
      }
      const low = city.groundHeightAt?.(x, z, -50);
      const high = city.groundHeightAt?.(x, z, 200);
      if (Number.isFinite(low) && Number.isFinite(high) && high - low > 1.5) {
        return false;
      }
    } catch (e) {
      // no data: allow
    }
    return true;
  }
  let idN = 0;
  function newPed() {
    const ped = {
      id: idN++, char: null, root: null, pos: new THREE.Vector3(), heading: 0, speed: 0, walkSpeed: 1.3, state: 'walk', act: 'walk', nav: null, target: null,
      knock: new THREE.Vector3(), shoveT: 0, health: 100, dead: false, deadT: 0, pending: null, threat: null, stateT: 0, fleeT: 0,
      body: null, collider: null, rag: null, tough: Math.random() < 0.2, idleStyle: null, isCop: false, zone: 'residential', active: false, group: null,
    };
    // voices (pain, grunts, screams in src/core/audio.js) read ped.gender / ped.female: take them from the body actually
    // worn, then the identity, so a woman never gets a male voice (playtest P5)
    Object.defineProperty(ped, 'gender', {
      configurable: true,
      enumerable: false,
      get() {
        const g = ped.char?.human?.gender || ped.identity?.gender || ped.char?.gender || null;
        return g ? (/^f/i.test(String(g)) ? 'f' : 'm') : undefined;
      },
    });
    Object.defineProperty(ped, 'female', {
      configurable: true,
      enumerable: false,
      get() {
        const g = ped.gender;
        return g === undefined ? undefined : g === 'f';
      },
    });
    try {
      ped.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -200, 0));
      ped.collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.28).setFriction(0.5), ped.body);
      ped.collider.setEnabled(false);
    } catch (e) { console.warn('[peds] collider failed', e); }
    list.push(ped);
    return ped;
  }
  function despawn(ped) {
    if (ped.rag) { try { rag.remove(ped.rag); } catch (e) { /* ignore */ } ped.rag = null; }
    removeDog(ped);
    if (ped.towel) { removeProp(ped.towel); ped.towel = null; }
    if (ped.ownProps) { ped.ownProps.forEach(removeProp); ped.ownProps = null; }
    if (ped.spot) { used.delete(ped.spot); ped.spot = null; }
    if (ped.group) { ped.group.members = ped.group.members.filter((m) => m !== ped); if (!ped.group.members.length) endGroup(ped.group); ped.group = null; }
    releaseChar(ped.char); ped.char = null; ped.root = null;
    ped.active = false; ped.dead = false; ped.state = 'off';
    ped.collider?.setEnabled(false);
    try { ped.body?.setTranslation({ x: 0, y: -200, z: 0 }, false); } catch (e) { /* ignore */ }
  }
  const groups = new Set();
  function endGroup(g) { if (g.props) g.props.forEach(removeProp); groups.delete(g); }

  function activate(ped, pos, zone, act, opts = {}) {
    ped.pos.copy(pos);
    ped.zone = zone; ped.act = act;
    ped.char = getChar(opts.outfit || zone, opts);
    if (!ped.char) { ped.active = false; return null; }
    ped.root = ped.char.root;
    ped.char.restyle?.(opts.outfit || zone);
    ped.active = true; ped.dead = false; ped.health = 100; ped.state = act === 'walk' || act === 'jog' || act === 'dog' || act === 'shore' ? 'walk' : act;
    ped.idleStyle = null; ped.pending = null; ped.threat = null; ped.knock.set(0, 0, 0); ped.shoveT = 0; ped.deadT = 0; ped.isCop = false; ped.foughtBack = false; ped.guard = false;
    ped.personality = opts.personality || (zone === 'cop' ? 'tough' : pickPersona(zone, hourNow()));
    ped.P = PERSONAS[ped.personality] || PERSONAS.calm;
    ped.tough = Math.random() < ped.P.fight;
    ped.walkSpeed = (act === 'jog' ? rand(2.6, 3.2) : zone === 'business' || zone === 'downtown' ? rand(1.4, 1.75) : zone === 'beach' ? rand(0.9, 1.25) : rand(1.05, 1.5)) * (act === 'jog' ? 1 : ped.P.walk);
    ped.call = Math.random() < ped.P.call;
    ped.greeted = false; ped.lookT = 0; ped.argueT = 0;
    ped.char.setPersonality?.(ped.personality);
    ped.nav = (act === 'walk' || act === 'jog' || act === 'dog') ? navFromPos(ped) : null;
    ped.target = null; ped.heading = opts.heading ?? Math.random() * Math.PI * 2;
    if (ped.nav) { ped.heading = navTarget(ped, _nt); }
    const gy = groundAt(pos.x, pos.z, pos.y || 0); ped.pos.y = opts.y ?? gy; ped.groundY = ped.pos.y;
    if (ped.collider) { ped.collider.setEnabled(!opts.noCollider); ped.body.setTranslation({ x: ped.pos.x, y: ped.pos.y + 0.9, z: ped.pos.z }, true); ped.teleported = true; }
    if (act === 'dog') { ped.dog = makeDog(); ped.dog.pos.copy(ped.pos); }
    // identity, unique look and traits (people.v2.js); a failure leaves the v1 person as is
    ped.identity = null; ped.look = null; ped.applied = null; ped.sig = null; ped.sawWeapon = false; ped.waitT = 0; ped.handsUp = false; ped.walkBoostT = 0; ped.callPe = null; ped.helper = false;
    if (zone !== 'cop' && opts.outfit !== 'cop') { try { game.people?.dress?.(ped, { zone, act, opts }); } catch (e) { console.warn('[peds] dress', e); } }
    ped.root.position.copy(ped.pos); ped.root.rotation.y = ped.heading;
    return ped;
  }

  // ---------------------------------------------------------------- scenarios (what spawns where)
  function freePeds(n) { const out = []; for (const p of list) { if (!p.active) { out.push(p); if (out.length >= n) break; } } while (out.length < n) out.push(newPed()); return out; }
  function spawnScenario(pp, budget) {
    if (!canSpawn(1)) return [];
    const h = hourNow();
    const night = h >= 20 || h < 3;
    // a candidate spawn location on a sidewalk around the player (prefer behind the camera or far)
    let base = null;
    for (let i = 0; i < 6 && !base; i++) {
      const p = sidewalkNear(pp, Math.random() < 0.75 ? 60 : 110); // close enough to be seen (playtest: streets looked empty)
      if (!p) continue;
      const d = Math.hypot(p.x - pp.x, p.z - pp.z);
      if (d < SPAWN_MIN) continue;
      if (!collidersReady(p.x, p.z)) continue;
      if (!spotOK(p.x, p.z)) continue;
      const cam = game.camera; let behind = true;
      if (cam) { cam.getWorldDirection(_v2); behind = (_v2.x * (p.x - cam.position.x) + _v2.z * (p.z - cam.position.z)) < 0; }
      if (!behind && d < 45 && Math.random() < 0.85) continue;
      base = p;
    }
    const zone0 = base ? zoneAt(base.x, base.z) : zoneAt(pp.x, pp.z);
    const beachNear = zone0 === 'beach' || zoneAt(pp.x, pp.z) === 'beach';
    const r = Math.random();
    // ---- beach life
    if (beachNear && budget >= 2 && !night && r < 0.65) {
      const k = Math.random();
      if (k < 0.38) { const c = sandPoint(pp, 140); if (c) return sunbathers(c, Math.min(budget, 1 + (Math.random() * 3 | 0))); }
      // (no beach volleyball games: removed in stage 1 job 6)
      else if (k < 0.6 && countGroups('disc') < 2) { const c = sandPoint(pp, 130); if (c) return frisbee(c); }
      else if (k < 0.8) { const w = waterPoint(pp, 140, Math.random() < 0.5); if (w) return swimmer(w); }
      else { const c = shorePoint(pp, 140); if (c) return [activate(freePeds(1)[0], c, 'beach', 'shore')]; }
    }
    if (!base) return [];
    // ---- benches / leaning
    if (spots.benches.length && r < 0.12) { const s = freeSpot(spots.benches, pp); if (s) return seat(s, zone0); }
    if (spots.lean.length && r < 0.2 && list.filter((p) => p.active && p.state === 'lean').length < 6) { const s = freeSpot(spots.lean, pp); if (s) return leaner(s, zone0); }
    // ---- nightlife crowds
    if (night && (zone0 === 'nightlife' || zone0 === 'commercial' || zone0 === 'beach') && budget >= 3 && r < 0.55) {
      const f = spots.fronts.length ? freeSpot(spots.fronts, pp) : null;
      const c = f ? new THREE.Vector3(f.x, f.y ?? groundAt(f.x, f.z), f.z) : base;
      return crowd(c, 'nightlife', Math.min(budget, 3 + (Math.random() * 5 | 0)), true, f);
    }
    // ---- business pairs outside offices
    if ((zone0 === 'business' || zone0 === 'downtown') && budget >= 2 && r < 0.35) return crowd(base, 'business', 2 + (Math.random() < 0.3 ? 1 : 0), false);
    // ---- residential: dog walkers, joggers, gardeners
    if (zone0 === 'residential' || zone0 === 'park') {
      if (r < 0.32) return [activate(freePeds(1)[0], base, zone0, 'dog')];
      if (r < 0.5) return [activate(freePeds(1)[0], base, zone0 === 'park' ? 'park' : 'residential', 'jog', { outfit: 'sport' })];
      if (r < 0.58 && !night) return [gardener(base, zone0)];
    }
    if ((zone0 === 'beach' || zone0 === 'causeway') && r < 0.35) return [activate(freePeds(1)[0], base, zone0, 'jog', { outfit: 'sport' })];
    // ---- talking groups anywhere
    if (budget >= 2 && r < 0.62) return crowd(base, zone0, 2 + (Math.random() < 0.35 ? 1 : 0), false);
    // ---- default: walker
    return [activate(freePeds(1)[0], base, zone0, 'walk')];
  }
  const countGroups = (k) => { let n = 0; for (const g of groups) if (g[k]) n++; return n; };
  function crowd(c, zone, n, dance, front) {
    if (!canSpawn(n)) return [];
    const g = { members: [], center: c.clone(), props: [] }; groups.add(g);
    // face the storefront for nightlife crowds, otherwise a ring
    const ps = freePeds(n);
    ps.forEach((p, k) => {
      const a = (k / n) * Math.PI * 2 + rand(-0.25, 0.25), rr = n <= 2 ? 0.62 : rand(0.75, 1.1);
      const pos = new THREE.Vector3(c.x + Math.sin(a) * rr, 0, c.z + Math.cos(a) * rr);
      activate(p, pos, zone, dance && Math.random() < 0.75 ? 'dance' : 'talk', { heading: Math.atan2(c.x - pos.x, c.z - pos.z) });
      p.group = g; g.members.push(p); p.stateT = rand(25, 70);
      p.idleStyle = p.act === 'dance' ? 'dance' : (Math.random() < 0.6 ? 'talk' : null); p.styleT = rand(1, 4);
    });
    if (front) { used.add(front); ps[0].spot = front; }
    return ps;
  }
  function seat(s, zone) {
    const p = freePeds(1)[0]; used.add(s);
    // root slightly in front of the bench's seat edge, facing away from the backrest
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    activate(p, new THREE.Vector3(s.pos.x + fx * 0.12, s.pos.y, s.pos.z + fz * 0.12), zone, 'bench', { heading: s.heading, noCollider: false });
    p.spot = s; p.idleStyle = 'sitBench'; p.stateT = rand(20, 80); p.call = Math.random() < 0.15;
    return [p];
  }
  function leaner(s, zone) {
    const p = freePeds(1)[0]; used.add(s);
    activate(p, s.pos, zone, 'lean', { heading: s.heading });
    p.spot = s; p.idleStyle = 'lean'; p.stateT = rand(20, 70); p.call = Math.random() < 0.25;
    return [p];
  }
  function gardener(c, zone) {
    const p = freePeds(1)[0];
    activate(p, c, zone, 'garden'); p.idleStyle = 'kneel'; p.stateT = rand(25, 60);
    return p;
  }
  function sunbathers(c, n) {
    if (!canSpawn(n)) return [];
    const g = { members: [], center: c.clone(), props: [] }; groups.add(g);
    const hd = Math.random() * Math.PI * 2;
    if (Math.random() < 0.6) g.props.push(makeUmbrella(c.x + Math.cos(hd) * 0.6, c.y, c.z - Math.sin(hd) * 0.6));
    const ps = freePeds(n);
    ps.forEach((p, k) => {
      const ox = Math.cos(hd) * (k - (n - 1) / 2) * 1.25, oz = -Math.sin(hd) * (k - (n - 1) / 2) * 1.25;
      const pos = new THREE.Vector3(c.x + ox, 0, c.z + oz);
      activate(p, pos, 'beach', 'sunbathe', { heading: hd + rand(-0.15, 0.15) + (Math.random() < 0.3 ? Math.PI : 0), outfit: 'beach' });
      p.idleStyle = Math.random() < 0.65 ? 'lie' : 'sitGround'; p.group = g; g.members.push(p); p.stateT = rand(60, 200);
      const towel = new THREE.Mesh(propGeo.towel, pmat(pick(TOWEL_COLS), 0.95));
      towel.receiveShadow = true;
      towel.position.set(0, 0.02, p.idleStyle === 'lie' ? -0.42 : 0.15);
      p.root.add(towel); p.towel = towel; props.add(towel);
    });
    return ps;
  }
  function volleyball(c) {
    if (!canSpawn(4)) return [];
    const g = { members: [], center: c.clone(), props: [], ball: null }; groups.add(g);
    const hd = Math.random() * Math.PI * 2, fx = Math.sin(hd), fz = Math.cos(hd), rx = Math.cos(hd), rz = -Math.sin(hd);
    const slots = [[-3.2, -1.2], [-3.2, 1.2], [3.2, -1.2], [3.2, 1.2]];
    const ps = freePeds(4);
    ps.forEach((p, k) => {
      const [a, b] = slots[k];
      const pos = new THREE.Vector3(c.x + fx * a + rx * b, 0, c.z + fz * a + rz * b);
      activate(p, pos, 'beach', 'volley', { heading: Math.atan2(c.x - pos.x, c.z - pos.z) * 0 + (a < 0 ? hd : hd + Math.PI), outfit: 'beach' });
      p.idleStyle = 'volley'; p.group = g; g.members.push(p); p.stateT = 400;
    });
    // net: two poles + a translucent mesh panel across the middle
    const net = new THREE.Group(); net.position.set(c.x, c.y, c.z); net.rotation.y = hd + Math.PI / 2;
    for (const sx of [-3.4, 3.4]) { const pl = new THREE.Mesh(propGeo.pole, pmat(0xdedede, 0.4)); pl.position.set(sx, 1.1, 0); pl.castShadow = true; net.add(pl); }
    const panel = new THREE.Mesh(SG('PlaneGeometry', THREE.PlaneGeometry, 6.8, 0.9, 1, 1), (netMat ||= new THREE.MeshStandardMaterial({ color: 0x111111, transparent: true, opacity: 0.45, side: THREE.DoubleSide, roughness: 1 })));
    panel.position.y = 1.85; net.add(panel);
    const band = new THREE.Mesh(SG('BoxGeometry', THREE.BoxGeometry, 6.8, 0.06, 0.02), pmat(0xf5f5f5, 0.6)); band.position.y = 2.3; net.add(band);
    scene.add(net); props.add(net); g.props.push(net);
    const ball = addProp(new THREE.Mesh(propGeo.ball, pmat(0xf2efe6, 0.6))); g.props.push(ball);
    g.ball = { mesh: ball, from: 0, to: 2, t: 0, dur: 1.3 };
    return ps;
  }
  function frisbee(c) {
    if (!canSpawn(2)) return [];
    const g = { members: [], center: c.clone(), props: [], disc: null }; groups.add(g);
    const hd = Math.random() * Math.PI * 2, fx = Math.sin(hd), fz = Math.cos(hd);
    const ps = freePeds(2);
    ps.forEach((p, k) => {
      const s = k ? 1 : -1;
      const pos = new THREE.Vector3(c.x + fx * 5 * s, 0, c.z + fz * 5 * s);
      activate(p, pos, 'beach', 'frisbee', { heading: hd + (k ? Math.PI : 0), outfit: 'beach' });
      p.group = g; g.members.push(p); p.stateT = 300;
    });
    const disc = addProp(new THREE.Mesh(propGeo.disc, pmat(pick([0xe07f68, 0xf2d84a, 0x2f8a86, 0xffffff]), 0.5))); g.props.push(disc);
    g.disc = { mesh: disc, from: 0, to: 1, t: -0.8, dur: 1.4 };
    return ps;
  }
  function swimmer(w) {
    const p = freePeds(1)[0];
    const depth = seaLevel - w.y;
    const wade = depth < 0.9;
    activate(p, w, 'beach', wade ? 'wade' : 'swim', { outfit: 'beach', y: wade ? w.y : seaLevel - 0.05, noCollider: true });
    p.idleStyle = wade ? null : 'swim'; p.stateT = rand(40, 120); p.swimDir = Math.random() * Math.PI * 2;
    return p ? [p] : [];
  }

  // voice reactions (AUDIO agent may listen): kind = greet | apologise | insult | argue | scream | drunk
  function voice(ped, kind) {
    const now = game.clock?.elapsed ?? 0;
    if (ped.voiceT && now - ped.voiceT < 2.5) return;
    ped.voiceT = now;
    try { game.emit?.('pedVoice', { ped, kind, voice: ped.P?.voice || 'calm', personality: ped.personality, gender: ped.char?.human?.gender, position: ped.pos.clone() }); } catch (e) { /* ignore */ }
    try { game.people?.voiceLine?.(ped, kind); } catch (e) { /* ignore */ }
  }
  // ---------------------------------------------------------------- incidents / damage / API
  function emitHit(ped, kind, damage, dir, info = {}) {
    if (kind === 'car') return; // vehicles emit their own impact event
    try {
      game.emit?.('hit', { target: 'ped', object: ped, point: info.point ? info.point.clone() : ped.pos.clone().setY(ped.pos.y + 1.1), normal: dir ? dir.clone().negate() : new THREE.Vector3(0, 1, 0),
        damage, kind, zone: info.zone, limb: info.limb, strength: info.strength, byPlayer: info.byPlayer, weapon: info.weapon });
    } catch (e) { /* ignore */ }
  }
  function panic(x, z, radius = 20, src = 'incident') {
    for (const o of list) {
      if (!o.active || o.dead || o.state === 'fight' || o.state === 'cop' || o.rag) continue;
      const dx = o.pos.x - x, dz = o.pos.z - z; const d2 = dx * dx + dz * dz;
      const pr = o.P ? o.P.panic : 1;
      if (d2 > radius * radius * pr * pr) continue;
      const d = Math.sqrt(d2), r = Math.random();
      let react = null;
      if (o.identity && game.people?.react) { try { react = game.people.react(o, { src, d, x, z }); } catch (e) { react = null; } if (react === 'ignore') continue; }
      if (react) { /* chosen from the person's traits (people.v2.js) */ }
      else if (o.act === 'swim') react = 'swimAway';
      else if (d < 7 && r < (o.P ? o.P.cower : 0.22)) react = 'cower';
      else if (d > 6 && r < (o.P ? o.P.film : 0.3) + (o.P ? o.P.cower : 0) && o.char?.hasPhone) react = 'film';
      else react = 'flee';
      o.pending = { react, x, z, t: 0.15 + d * 0.03 + Math.random() * 0.35, src };
    }
  }
  function knockDown(ped, dir, opts = {}) {
    if (ped.dead && ped.rag) return;
    const lethal = opts.lethal !== false;
    ped.state = lethal ? 'dead' : 'down'; ped.deadT = 0; ped.guard = false; ped.idleStyle = null;
    if (lethal) { ped.dead = true; ped.health = 0; }
    ped.collider?.setEnabled(false);
    removeDog(ped);
    if (ped.towel) ped.towel.visible = false;
    if (ped.group) { ped.group.members = ped.group.members.filter((m) => m !== ped); ped.group = null; }
    if (ped.spot) { used.delete(ped.spot); ped.spot = null; }
    if (rag && !ped.rag) {
      try {
        ped.root.position.copy(ped.pos); ped.root.updateMatrixWorld(true);
        const part = opts.limb ? LIMB_PART[opts.limb] : null;
        ped.rag = rag.start(ped.char, { vel: opts.vel || { x: 0, y: 0, z: 0 }, spin: opts.spin || 0, hit: opts.impulse ? { impulse: opts.impulse, point: opts.point || null, part } : null, kind: opts.kind, strength: opts.strength, lethal, balance: !!opts.balance });
      } catch (e) { ped.rag = null; }
    }
    panic(ped.pos.x, ped.pos.z, 20, 'knockdown');
  }
  // public: damage(ped, amount, dir, kind, info{zone, limb, point, strength, byPlayer, weapon, heavy})
  function damage(ped, amount = 25, dir = null, kind = 'melee', info = {}) {
    if (!ped || !ped.active || (ped.dead && ped.state === 'dead')) return;
    const d = dir ? new THREE.Vector3(dir.x, 0, dir.z) : new THREE.Vector3(0, 0, 1);
    if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
    d.normalize();
    ped.health = (ped.health ?? 100) - amount;
    emitHit(ped, kind, amount, d, info);
    const strength = info.strength ?? Math.min(1, amount / 100);
    const pt = info.point || ped.pos.clone().setY(ped.pos.y + 1.1);
    if (kind === 'car') {
      // vehicle impact: momentum from the car's velocity (dir carries the car's travel direction incl. slight lift)
      const kmh = amount / 1.5;
      const v = Math.min(16, kmh / 3.6) * 0.8;
      const lethal = ped.health <= 0 || kmh > 32;
      ped.knock.set(0, 0, 0);
      knockDown(ped, d, { kind: 'car', strength: Math.min(1, kmh / 60), lethal, vel: { x: d.x * v, y: Math.min(3.2, kmh / 22), z: d.z * v }, spin: Math.min(3, kmh / 20), point: pt, impulse: new THREE.Vector3(d.x * v * 6, 0, d.z * v * 6) });
      if (!lethal) ped.getUpT = rand(2.2, 3.5);
      return;
    }
    if (ped.health <= 0) {
      const I = kind === 'bullet' ? 9 + strength * 14 : kind === 'explosion' ? 120 : 25 + strength * 40;
      knockDown(ped, d, { kind, strength, lethal: true, vel: { x: d.x * (kind === 'explosion' ? 5 : 0.6), y: kind === 'explosion' ? 4 : 0, z: d.z * (kind === 'explosion' ? 5 : 0.6) }, point: pt, limb: info.limb, impulse: new THREE.Vector3(d.x * I, I * 0.1, d.z * I) });
      return;
    }
    // non-lethal: heavy blows knock people down (they get back up), others stagger + flinch
    if ((info.heavy || strength > 0.85) && kind !== 'bullet' && Math.random() < 0.6) {
      knockDown(ped, d, { kind, strength, balance: true, lethal: false, vel: { x: d.x * 1.5, y: 0.3, z: d.z * 1.5 }, point: pt, limb: info.limb, impulse: new THREE.Vector3(d.x * 30, 3, d.z * 30) });
      ped.getUpT = rand(1.8, 3.2);
      return;
    }
    ped.hitNow = true;
    ped.knock.set(d.x * (1.2 + strength * 2), 0, d.z * (1.2 + strength * 2)); ped.shoveT = 0.35;
    if (ped.isCop) { ped.state = 'cop'; return; }
    if (ped.tough && !ped.foughtBack && kind !== 'bullet') { ped.state = 'fight'; ped.stateT = rand(6, 10); ped.foughtBack = true; ped.hitCd = 0.6; ped.guard = true; ped.idleStyle = null; ped.leaveGroup = true; }
    else { ped.state = 'flee'; ped.fleeT = rand(4, 7); ped.threat = { x: ped.pos.x - d.x, z: ped.pos.z - d.z }; ped.scream = true; ped.idleStyle = null; ped.leaveGroup = true; }
    panic(ped.pos.x, ped.pos.z, 20, 'hit');
  }
  function spawnAt(pos, o = {}) {
    let p = list.find((q) => !q.active) || null;
    if (!p) { let bd = -1; const pp = playerPos(); for (const q of list) { const dd = q.pos.distanceTo(pp); if (dd > bd && q.state !== 'fight' && q.state !== 'cop') { bd = dd; p = q; } } if (p) despawn(p); }
    if (!p) p = newPed();
    const zone = o.state === 'cop' ? 'cop' : (o.outfit || zoneAt(pos.x, pos.z));
    if (!activate(p, new THREE.Vector3(pos.x, pos.y ?? groundAt(pos.x, pos.z), pos.z), zone, 'walk', { outfit: o.state === 'cop' ? 'cop' : o.outfit, gender: o.gender, y: pos.y, force: true, personality: o.personality })) return null;
    const pp = playerPos();
    if (o.state === 'flee') { p.state = 'flee'; p.fleeT = rand(4, 7); p.threat = { x: pp.x, z: pp.z }; p.scream = true; }
    else if (o.state === 'fight') { p.state = 'fight'; p.stateT = 15; p.hitCd = 1; p.guard = true; }
    else if (o.state === 'cop') { p.state = 'cop'; p.isCop = true; p.tough = true; p.hitCd = 1; p.char.restyle?.('cop'); }
    p.pinned = 20; // spawned by gameplay: don't recycle immediately
    return p;
  }
  try {
    game.on?.('shot', (e) => { const o = e?.origin; if (o) panic(o.x, o.z, 40, 'shot'); });
    game.on?.('crash', (e) => { const pt = e?.point || e?.vehicle?.body?.translation?.(); if (pt && (e.impulse === undefined || e.impulse > 2000)) panic(pt.x, pt.z, 25, 'crash'); });
    game.on?.('punch', (e) => { const o = e?.position; if (o) for (const p of list) if (p.active && !p.dead && p.pos.distanceTo(o) < 8 && Math.random() < 0.5) p.lookUntil = (game.clock?.elapsed ?? 0) + 3; });
  } catch (e) { /* ignore */ }
  // tiles whose colliders are being removed: freeze ragdolls + despawn peds there (they would fall through)
  try {
    city.onTileCollidersRemoving?.((b) => {
      for (const p of list) {
        if (!p.active) continue;
        if (p.pos.x >= b.minX - 1 && p.pos.x <= b.maxX + 1 && p.pos.z >= b.minZ - 1 && p.pos.z <= b.maxZ + 1) {
          if (p.rag) { try { rag.freeze(p.rag); } catch (e) { /* ignore */ } }
          p.despawnNow = true;
        }
      }
    });
  } catch (e) { /* ignore */ }

  // ---------------------------------------------------------------- update
  const vPrev = new WeakMap();
  let spawnT = 0, lastPunch = false;
  function targetCount() {
    const h = hourNow();
    let base = h >= 1 && h < 5 ? 10 : h < 7 ? 18 : h < 9 ? 26 : h < 20 ? 32 : h < 23 ? 30 : 20;
    // people.v2.js: who would really be out here at this hour (district x hour schedules)
    try { const pp = playerPos(); const dn = game.people?.densityFor?.(pp.x, pp.z); if (Number.isFinite(dn)) base = Math.round(8 + 40 * dn); } catch (e) { /* ignore */ }
    const fps = game.perf?.fps || 60;
    // playtest: more people on the street; a dip in frame rate trims the crowd gently instead of halving it
    const cap = fps >= 50 ? 40 : fps >= 38 ? 34 : 28;
    // quality preset (src/render/quality.v2.js) scales how many full characters walk around
    const qs = game.quality?.current?.pedScale ?? 1;
    return Math.round(Math.min(base, cap) * qs);
  }
  // ---- personal space (playtest: people clipped through each other and the player)
  // Within SEP_R of the player, people on foot keep at least SEP_MIN apart (spatial hash, 2 m cells) and stay out
  // of the player's body. Positions are nudged before the wall check, so the KCC still resolves walls afterward.
  const SEP_R = 30;
  const SEP_MIN = 0.62;
  const SEP_PLAYER = 0.72;
  const sepCells = new Map();
  const sepList = [];
  const SEP_SKIP = new Set(['swim', 'off', 'bench', 'sunbathe', 'convo', 'talk']);
  function separate(pp, inCar) {
    sepCells.clear();
    sepList.length = 0;
    for (const ped of list) {
      if (!ped.active || ped.dead || ped.rag || SEP_SKIP.has(ped.state)) {
        continue;
      }
      if (Math.abs(ped.pos.x - pp.x) > SEP_R || Math.abs(ped.pos.z - pp.z) > SEP_R) {
        continue;
      }
      const k = (Math.floor(ped.pos.x / 2) * 73856093) ^ (Math.floor(ped.pos.z / 2) * 19349663);
      let c = sepCells.get(k);
      if (!c) {
        c = [];
        sepCells.set(k, c);
      }
      c.push(ped);
      sepList.push(ped);
    }
    for (const a of sepList) {
      const cx = Math.floor(a.pos.x / 2);
      const cz = Math.floor(a.pos.z / 2);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const c = sepCells.get((ix * 73856093) ^ (iz * 19349663));
          if (!c) {
            continue;
          }
          for (const b of c) {
            if (b.id <= a.id) {
              continue;
            }
            const dx = b.pos.x - a.pos.x;
            const dz = b.pos.z - a.pos.z;
            const d2 = dx * dx + dz * dz;
            if (d2 >= SEP_MIN * SEP_MIN) {
              continue;
            }
            const d = Math.sqrt(d2) || 0.001;
            const push = (SEP_MIN - d) * 0.5;
            const nx = d2 > 1e-8 ? dx / d : Math.cos(a.id);
            const nz = d2 > 1e-8 ? dz / d : Math.sin(a.id);
            // people standing together (in a conversation group) give way less than walkers
            const wa = NONMOVING.has(a.state) ? 0.3 : 1;
            const wb = NONMOVING.has(b.state) ? 0.3 : 1;
            const ws = wa + wb;
            a.pos.x -= nx * push * 2 * (wa / ws);
            a.pos.z -= nz * push * 2 * (wa / ws);
            b.pos.x += nx * push * 2 * (wb / ws);
            b.pos.z += nz * push * 2 * (wb / ws);
          }
        }
      }
      // the player on foot is solid to people
      if (!inCar) {
        const dx = a.pos.x - pp.x;
        const dz = a.pos.z - pp.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < SEP_PLAYER * SEP_PLAYER) {
          const d = Math.sqrt(d2) || 0.001;
          const nx = d2 > 1e-8 ? dx / d : Math.cos(a.id);
          const nz = d2 > 1e-8 ? dz / d : Math.sin(a.id);
          a.pos.x += nx * (SEP_PLAYER - d);
          a.pos.z += nz * (SEP_PLAYER - d);
        }
      }
    }
  }
  let frameN = 0;
  function update(dt) {
    dt = Math.min(dt, 0.1);
    createdThisFrame = 0; frameN++;
    const P = game.player || {};
    const pp = playerPos();
    const ph = P.heading || 0;
    const fwdX = Math.sin(ph), fwdZ = Math.cos(ph);
    const pSpeed = P.state?.speed || 0;
    const inCar = !!P.state?.inVehicle;
    const vlist = (game.vehicles && Array.isArray(game.vehicles.list)) ? game.vehicles.list : [];
    const cam = game.camera?.position || pp;
    const now = game.clock?.elapsed ?? 0;
    try { rag?.update(dt); } catch (e) { console.warn('[ragdoll]', e); }

    // crash detection fallback (sudden deceleration)
    for (const v of vlist) {
      if (!v) continue;
      const k = Math.abs(v.speedKmh || 0); const prev = vPrev.get(v);
      if (prev !== undefined && prev - k > 25) { try { const t = v.body.translation(); panic(t.x, t.z, 25, 'crash'); } catch (e) { /* ignore */ } }
      vPrev.set(v, k);
    }

    // ---- population management
    spotsT += dt; if (spotsT > 3) { spotsT = 0; refreshSpots(pp); }
    let activeN = 0; for (const p of list) if (p.active) activeN++;
    // while the human library is still streaming in, grow the crowd with it (more distinct people)
    const hl = humansLoaded(), ht = humansTotal();
    const want = targetCount();
    spawnT -= dt;
    if (spawnT <= 0 && activeN < want) {
      spawnT = activeN < want * 0.5 ? 0.08 : 0.35;
      try { spawnScenario(pp, Math.min(8, want - activeN)); } catch (e) { console.warn('[peds] spawn', e); }
    }
    // warm the character pool in the background: at most one new person per frame
    if (!createdThisFrame && pool.length < 6 && activeN + pool.length < want + 4) {
      const z = zoneAt(pp.x, pp.z);
      const c = getChar(z === 'water' ? 'beach' : z, {});
      if (c) { c.root.visible = false; pool.push(c); }
    }
    // camera frustum for animation LOD (offscreen peds don't animate)
    const camO = game.camera;
    if (camO) { camO.updateMatrixWorld(); _proj.multiplyMatrices(camO.projectionMatrix, camO.matrixWorldInverse); _frustum.setFromProjectionMatrix(_proj); }

    // ---- groups: volleyball ball / frisbee disc flights
    for (const g of groups) {
      if (!g.members.length) { endGroup(g); continue; }
      if (g.ball && g.members.length >= 2) {
        const b = g.ball; b.t += dt;
        const A = g.members[b.from % g.members.length], B = g.members[b.to % g.members.length];
        if (!A || !B) continue;
        const k = Math.min(1, b.t / b.dur);
        b.mesh.position.set(A.pos.x + (B.pos.x - A.pos.x) * k, A.pos.y + 1.9 + Math.sin(k * Math.PI) * 3.2, A.pos.z + (B.pos.z - A.pos.z) * k);
        if (k >= 1) { b.t = 0; b.from = b.to; let n = (Math.random() * g.members.length) | 0; if (n === b.from) n = (n + 1) % g.members.length; b.to = n; b.dur = rand(1.1, 1.6); }
      }
      if (g.disc && g.members.length >= 2) {
        const dsc = g.disc; dsc.t += dt;
        const A = g.members[dsc.from], B = g.members[dsc.to];
        if (!A || !B) continue;
        if (dsc.t < 0) { dsc.mesh.position.set(A.pos.x, A.pos.y + 1.0, A.pos.z); if (dsc.t > -0.3) A.throwNow = true; continue; }
        const k = Math.min(1, dsc.t / dsc.dur);
        dsc.mesh.position.set(A.pos.x + (B.pos.x - A.pos.x) * k, A.pos.y + 1.2 + Math.sin(k * Math.PI) * 1.0, A.pos.z + (B.pos.z - A.pos.z) * k);
        dsc.mesh.rotation.y += dt * 20;
        if (k >= 1) { dsc.t = rand(-2.2, -1.2); [dsc.from, dsc.to] = [dsc.to, dsc.from]; }
      }
    }

    // colliders may have been added/removed this frame (tile streaming, ragdolls): refresh the query BVH before KCC queries
    try { world.updateSceneQueries?.(); } catch (e) { /* older rapier */ }
    try {
      separate(pp, inCar);
    } catch (e) {
      // separation is cosmetic: never break the crowd
    }
    for (const ped of list) {
      if (!ped.active) continue;
      const dpx = ped.pos.x - pp.x, dpz = ped.pos.z - pp.z;
      const dPlayer = Math.hypot(dpx, dpz);
      if (ped.pinned > 0) ped.pinned -= dt;
      // despawn far away / on unloading tiles / long-dead
      if (ped.despawnNow || (dPlayer > DESPAWN && !(ped.pinned > 0)) || (ped.dead && (ped.deadT += dt) > 25 && dPlayer > 40)) { ped.despawnNow = false; despawn(ped); continue; }
      // nobody strolls on an elevated road deck (playtest): a walker standing well above the street-level ground is
      // removed (checked about twice a second per person, out of view first)
      if (((frameN + ped.id) % 30) === 0 && ped.nav && !ped.dead && ped.state === 'walk') {
        try {
          const street = city.groundHeightAt?.(ped.pos.x, ped.pos.z, -50);
          if (Number.isFinite(street) && ped.pos.y - street > 2.5) {
            despawn(ped);
            continue;
          }
        } catch (e) {
          // no height data here
        }
      }
      let targetSpeed = 0, lookAt = null, moveHeading = ped.heading;
      ped.handsUp = false;

      // ---- knocked down (ragdoll): wait, then get up if alive
      if (ped.state === 'down' || ped.state === 'dead') {
        if (ped.rag) {
          const pt = rag.pelvisPos(ped.rag);
          if (pt) ped.pos.set(pt.x, pt.y - 0.9, pt.z);
          if (ped.state === 'down') {
            ped.getUpT -= dt;
            if (ped.rag.recovered) { // active ragdoll kept its feet: blend straight back into animation (ragdoll.js)
              const info = rag.poseInfo(ped.rag);
              if (info) { ped.heading = info.heading; ped.pos.set(info.pelvis.x, groundAt(info.pelvis.x, info.pelvis.z, ped.pos.y), info.pelvis.z); ped.root.position.copy(ped.pos); ped.root.rotation.y = ped.heading; }
              rag.handoff(ped.rag); ped.rag = null;
              ped.char.snapshotPose?.(0.4);
              ped.state = 'flee'; ped.fleeT = rand(3, 6); ped.threat = { x: pp.x, z: pp.z }; ped.nav = navFromPos(ped);
              ped.collider?.setEnabled(true); ped.teleported = true;
              try { ped.body.setTranslation({ x: ped.pos.x, y: ped.pos.y + 0.9, z: ped.pos.z }, true); } catch (e) { /* ignore */ }
              continue;
            }
            if (rag.readyToGetUp(ped.rag) || ped.getUpT < -2.5) { // get up once the body has settled (cap: getUpT + 2.5 s)
              const info = rag.poseInfo(ped.rag);
              const rd0 = ped.rag; ped.rag = null;
              if (!info) rag.remove(rd0);
              if (info) {
                // place the root under the pelvis, oriented so the clip's lying pose matches the body
                const hx = info.head.x - info.pelvis.x, hz = info.head.z - info.pelvis.z;
                const face = info.faceUp ? 'back' : 'fwd';
                // getUpBack lies with the head toward local -Z, getUpFwd with the head toward local +Z
                ped.heading = face === 'back' ? Math.atan2(-hx, -hz) : Math.atan2(hx, hz);
                ped.pos.set(info.pelvis.x, groundAt(info.pelvis.x, info.pelvis.z, ped.pos.y), info.pelvis.z);
                ped.root.position.copy(ped.pos); ped.root.rotation.y = ped.heading;
                rag.handoff(rd0); // bones re-expressed under the moved root, so the snapshot blend has no pop
                ped.char.snapshotPose?.(0.6);
                ped.getUp = face; ped.getUpClock = 2.5;
                ped.state = 'gettingUp';
                ped.collider?.setEnabled(true); ped.teleported = true;
                try { ped.body.setTranslation({ x: ped.pos.x, y: ped.pos.y + 0.9, z: ped.pos.z }, true); } catch (e) { /* ignore */ }
              } else ped.state = 'walk';
            }
          }
          continue; // bones are physics driven
        }
        if (ped.state === 'down') { ped.state = 'walk'; }
        else { // dead without ragdoll (limit reached): animated death
          ped.root.position.copy(ped.pos);
          ped.char.update(dt, { speed: 0, grounded: true, dead: true });
          continue;
        }
      }
      if (ped.state === 'gettingUp') {
        ped.getUpClock -= dt;
        if (ped.getUpClock <= 0) { ped.getUp = null; ped.state = 'flee'; ped.fleeT = rand(3, 6); ped.threat = { x: pp.x, z: pp.z }; ped.scream = false; ped.nav = navFromPos(ped); }
      }

      // ---- delayed reactions to incidents
      if (ped.pending && ped.state !== 'fight' && ped.state !== 'cop' && ped.state !== 'gettingUp') {
        ped.pending.t -= dt;
        if (ped.pending.t <= 0) {
          const pe = ped.pending; ped.pending = null;
          ped.threat = { x: pe.x, z: pe.z }; ped.idleStyle = null; ped.leaveGroup = true;
          if (ped.towel) ped.towel.visible = false;
          if (pe.react === 'swimAway') { ped.swimDir = Math.atan2(ped.pos.x - pe.x, ped.pos.z - pe.z); ped.stateT = 20; }
          else if (pe.react === 'cower') { ped.state = 'cower'; ped.stateT = rand(2.5, 5); }
          else if (pe.react === 'film') { ped.state = 'film'; ped.stateT = rand(6, 12); }
          else if (pe.react === 'freeze') { ped.state = 'freeze'; ped.stateT = rand(1.2, 3.5); }
          else if (pe.react === 'call911') { ped.state = 'call'; ped.stateT = rand(5, 9); ped.callPe = pe; try { game.people?.say?.(ped, 'call911', { force: true, topic: pe.src === 'crash' ? 'crash' : pe.src === 'hit' ? 'fight' : 'shot' }); } catch (e) { /* ignore */ } }
          else if (pe.react === 'fight') { ped.state = 'fight'; ped.stateT = rand(5, 9); ped.foughtBack = true; ped.hitCd = 0.8; ped.guard = true; }
          else if (pe.react === 'help' || pe.react === 'crowd') {
            const a = Math.random() * Math.PI * 2, rr = pe.react === 'help' ? 2.2 : rand(4, 7);
            ped.state = 'approach'; ped.helper = pe.react === 'help'; ped.stateT = 20;
            ped.target = new THREE.Vector3(pe.x + Math.sin(a) * rr, ped.pos.y, pe.z + Math.cos(a) * rr);
            try { game.people?.say?.(ped, 'crash', { force: true }); } catch (e) { /* ignore */ }
          }
          else { ped.state = 'flee'; ped.fleeT = rand(4, 8); ped.scream = Math.random() < 0.6; if (ped.scream) voice(ped, 'scream'); }
        }
      }
      if (ped.leaveGroup) {
        ped.leaveGroup = false;
        if (ped.group) { ped.group.members = ped.group.members.filter((m) => m !== ped); ped.group = null; }
        if (ped.spot) { used.delete(ped.spot); ped.spot = null; }
        removeDog(ped);
        if (!ped.nav && ped.act !== 'swim') ped.nav = navFromPos(ped);
      }

      // ---- state machine
      switch (ped.state) {
        case 'flee': {
          ped.fleeT -= dt; ped.handsUp = ped.scream;
          const th = ped.threat || { x: pp.x, z: pp.z };
          const ax = ped.pos.x - th.x, az = ped.pos.z - th.z, al = Math.hypot(ax, az) || 1;
          if (ped.nav) {
            edgeAt(ped.nav.edge, ped.nav.s, _ep);
            const along = _ep.tx * ax + _ep.tz * az;
            if (Math.abs(along) > 0.2 * al) ped.nav.dir = along > 0 ? 1 : -1;
          } else (ped.target ||= new THREE.Vector3()).set(ped.pos.x + ax / al * 25, ped.pos.y, ped.pos.z + az / al * 25);
          targetSpeed = 4.7;
          if (ped.fleeT <= 0) { ped.state = 'walk'; ped.act = 'walk'; }
          break;
        }
        case 'cower': {
          ped.stateT -= dt; ped.idleStyle = 'cower';
          if (ped.threat) ped.heading = approachAngle(ped.heading, Math.atan2(ped.threat.x - ped.pos.x, ped.threat.z - ped.pos.z), dt * 3);
          if (ped.stateT <= 0) { ped.idleStyle = null; ped.state = 'flee'; ped.fleeT = rand(3, 5); ped.scream = true; }
          break;
        }
        case 'film': {
          ped.stateT -= dt; ped.idleStyle = 'film';
          if (ped.threat) { ped.heading = approachAngle(ped.heading, Math.atan2(ped.threat.x - ped.pos.x, ped.threat.z - ped.pos.z), dt * 4); lookAt = ped.threat; }
          if (ped.stateT <= 0) { ped.idleStyle = null; ped.state = 'walk'; ped.act = 'walk'; }
          break;
        }
        case 'fight': {
          ped.stateT -= dt; ped.hitCd -= dt; ped.guard = true;
          ped.heading = approachAngle(ped.heading, Math.atan2(-dpx, -dpz), dt * 8); lookAt = pp;
          if (dPlayer > 1.05 && dPlayer < 14 && !inCar) targetSpeed = dPlayer > 3 ? 3.4 : 1.3;
          if (dPlayer < 1.4 && ped.hitCd <= 0 && !inCar) { ped.punchNow = true; ped.hitCd = rand(0.7, 1.1); if (P.health !== undefined && Math.random() < 0.7) P.health = Math.max(0, P.health - 4 - Math.random() * 4); }
          if (ped.stateT <= 0 || dPlayer > 20 || inCar) { ped.state = 'walk'; ped.act = 'walk'; ped.guard = false; }
          break;
        }
        case 'cop': {
          const wanted = (P.wanted || 0) > 0 && !inCar;
          ped.guard = wanted && dPlayer < 4; ped.hitCd -= dt;
          if (wanted && dPlayer < 60) {
            ped.heading = approachAngle(ped.heading, Math.atan2(-dpx, -dpz), dt * 8); lookAt = pp;
            targetSpeed = dPlayer > 6 ? 5.2 : dPlayer > 1.2 ? 2.2 : 0;
            if (dPlayer < 1.4 && ped.hitCd <= 0) { ped.punchNow = true; ped.hitCd = rand(0.8, 1.2); if (P.health !== undefined) P.health = Math.max(0, P.health - 5); }
          } else targetSpeed = ped.walkSpeed * 0.8;
          break;
        }
        case 'convo': { // talking with the player (talk.js): face them, point when giving directions
          ped.stateT -= dt;
          ped.idleStyle = ped.speakT > 0 ? 'talk' : null;
          const tgt = ped.pointAt || pp;
          ped.heading = approachAngle(ped.heading, Math.atan2(tgt.x - ped.pos.x, tgt.z - ped.pos.z), dt * 4);
          lookAt = pp;
          if (ped.stateT <= 0) {
            ped.state = 'walk';
            ped.act = 'walk';
            ped.idleStyle = null;
          }
          break;
        }
        case 'freeze': { // frozen in place, hands up, eyes on the danger
          ped.stateT -= dt; ped.handsUp = true; ped.idleStyle = null;
          if (ped.threat) ped.heading = approachAngle(ped.heading, Math.atan2(ped.threat.x - ped.pos.x, ped.threat.z - ped.pos.z), dt * 5);
          if (ped.stateT <= 0) { ped.handsUp = false; ped.state = 'flee'; ped.fleeT = rand(3, 6); ped.scream = Math.random() < 0.5; }
          break;
        }
        case 'call': { // on the phone to 911, turned away from the danger; reports when done
          ped.stateT -= dt; ped.idleStyle = 'phone';
          if (ped.threat) ped.heading = approachAngle(ped.heading, Math.atan2(ped.pos.x - ped.threat.x, ped.pos.z - ped.threat.z), dt * 2);
          if (ped.stateT <= 0) { try { game.people?.callDone?.(ped, ped.callPe || { x: ped.pos.x, z: ped.pos.z, src: 'shot' }); } catch (e) { /* ignore */ } ped.callPe = null; ped.idleStyle = null; ped.state = 'walk'; ped.act = 'walk'; }
          break;
        }
        case 'approach': { // walking over to a crash to help or to look
          ped.stateT -= dt; targetSpeed = ped.helper ? 3.2 : ped.walkSpeed * 1.1;
          if (!ped.target || Math.hypot(ped.target.x - ped.pos.x, ped.target.z - ped.pos.z) < 1.4 || ped.stateT <= 0) {
            ped.state = 'watch'; ped.stateT = rand(8, 16); ped.target = null;
            ped.idleStyle = ped.helper ? 'kneel' : (ped.identity && ped.identity.phoneAddict > 0.5 ? 'film' : 'talk');
          }
          break;
        }
        case 'watch': {
          ped.stateT -= dt;
          if (ped.threat) { ped.heading = approachAngle(ped.heading, Math.atan2(ped.threat.x - ped.pos.x, ped.threat.z - ped.pos.z), dt * 3); lookAt = ped.threat; }
          if (ped.stateT <= 0) { ped.idleStyle = null; ped.state = 'walk'; ped.act = 'walk'; ped.helper = false; }
          break;
        }
        case 'gettingUp': break;
        case 'argue': {
          ped.argueT -= dt; lookAt = pp;
          ped.heading = approachAngle(ped.heading, Math.atan2(-dpx, -dpz), dt * 6);
          if (ped.shoveBack && dPlayer < 1.2) { ped.shoveBack = false; ped.punchNow = true; try { game.emit?.('pedShove', { ped, dir: new THREE.Vector3(-dpx, 0, -dpz).normalize() }); } catch (e) { /* ignore */ } }
          if (Math.random() < dt * 0.4) voice(ped, 'argue');
          if (ped.argueT <= 0 || dPlayer > 12) { ped.state = 'walk'; ped.act = 'walk'; }
          break;
        }
        case 'talk': case 'dance': {
          ped.stateT -= dt; ped.styleT -= dt;
          if (ped.group) ped.heading = approachAngle(ped.heading, Math.atan2(ped.group.center.x - ped.pos.x, ped.group.center.z - ped.pos.z), dt * 2);
          if (ped.state === 'talk' && ped.styleT <= 0) { ped.styleT = rand(2.5, 6); ped.idleStyle = Math.random() < 0.6 ? 'talk' : (Math.random() < 0.35 ? 'phone' : null); }
          if (ped.stateT <= 0) { ped.leaveGroup = true; ped.state = 'walk'; ped.act = 'walk'; ped.idleStyle = null; }
          if (dPlayer < 5 && !inCar) lookAt = pp;
          break;
        }
        case 'bench': case 'lean': case 'garden': case 'sunbathe': case 'volley': case 'wade': {
          ped.stateT -= dt;
          if (ped.state === 'wade') { ped.idleStyle = Math.random() < 0.002 ? 'talk' : ped.idleStyle; }
          if (ped.stateT <= 0 && ped.state !== 'volley') {
            // stand up and walk off (sit/stand transitions via style blending)
            if (ped.towel) { ped.towel.visible = false; }
            ped.leaveGroup = true; ped.idleStyle = null; ped.state = 'walk'; ped.act = ped.zone === 'beach' ? 'shore' : 'walk';
          }
          if (dPlayer < 5 && !inCar && ped.state !== 'sunbathe') lookAt = pp;
          break;
        }
        case 'frisbee': {
          if (ped.group) ped.heading = approachAngle(ped.heading, Math.atan2(ped.group.center.x - ped.pos.x, ped.group.center.z - ped.pos.z), dt * 3);
          break;
        }
        case 'swim': {
          ped.stateT -= dt; ped.idleStyle = 'swim';
          targetSpeed = 0.8;
          const nx = ped.pos.x + Math.sin(ped.swimDir) * 3, nz = ped.pos.z + Math.cos(ped.swimDir) * 3;
          if (!isWater(nx, nz) || seaLevel - groundAt(nx, nz, -3) < 1.0) ped.swimDir += Math.PI * rand(0.6, 1.4);
          ped.swimDir += (Math.random() - 0.5) * dt * 0.4;
          moveHeading = ped.swimDir;
          if (ped.stateT <= 0) { const sp = shorePoint(ped.pos, 60); if (sp) { despawn(ped); continue; } ped.stateT = 30; }
          break;
        }
        default: { // walk / jog / dog / shore
          ped.handsUp = false;
          // npc-life: at a signalized corner, wait for the walk phase (impatient people sometimes go anyway)
          const nc = ped.nav?.cross;
          if (nc && nc.node !== undefined && ped.act !== 'jog' && (nc.sig -= dt) <= 0) {
            nc.sig = 0.5;
            const ws = signals.walkState(nc.node, nc.x - ped.pos.x, nc.z - ped.pos.z);
            const bold = (ped.P?.jaywalk || 0) > 0.5 && Math.random() < 0.15;
            if (!ws || ws.walk || bold) { nc.node = undefined; ped.sigWaitT = 0; }
            else { ped.sigWaitT = 0.6; }
          }
          if (ped.sigWaitT > 0) { ped.sigWaitT -= dt; targetSpeed = 0; ped.speed *= Math.exp(-dt * 8); ped.idleStyle = ped.call ? 'phone' : null; break; }
          if (ped.waitT > 0) { ped.waitT -= dt; targetSpeed = 0; ped.idleStyle = ped.call ? 'phone' : null; break; } // waiting at the corner
          if (ped.pause > 0) {
            ped.pause -= dt; targetSpeed = 0;
            if (!ped.idleStyle && ped.pauseStyle) ped.idleStyle = ped.pauseStyle;
            if (ped.pause <= 0) ped.idleStyle = null;
          } else {
            targetSpeed = ped.walkSpeed; ped.idleStyle = null;
            if (ped.act !== 'jog' && Math.random() < dt / (ped.P.pauseEvery || 45)) { ped.pause = rand(4, 12); const ids = ped.P.idles; ped.pauseStyle = ids[(Math.random() * ids.length) | 0]; }
          }
          // impatient people cut across the street mid-block; honked-at people hurry
          // (only on quiet local streets: busy primary / secondary / tertiary / trunk roads are crossed at junctions only)
          if (ped.nav && !ped.nav.cross && ped.act === 'walk' && ped.P.jaywalk && /residential|service|living|unclassified|pedestrian|footway|path/.test(ped.nav.edge?.kind || '') && Math.random() < dt * ped.P.jaywalk / 40) { ped.nav.hand *= -1; ped.jaywalks = (ped.jaywalks || 0) + 1; }
          if (ped.walkBoostT > 0) { ped.walkBoostT -= dt; targetSpeed *= 1.6; }
          // step aside when the player walks into us; stumble when shoved by a sprinting player
          if (dPlayer < 1.15 && pSpeed > 0.6 && !inCar) {
            const approaching = (dpx * fwdX + dpz * fwdZ) / Math.max(dPlayer, 0.01) > 0.4;
            const sx = fwdZ, sz = -fwdX; const sgn = (dpx * sx + dpz * sz) >= 0 ? 1 : -1;
            if (pSpeed > 4 && dPlayer < 0.85) {
              ped.knock.set(fwdX * 3 + sx * sgn, 0, fwdZ * 3 + sz * sgn); ped.hitNow = true; ped.shoveT = 0.5;
              const sh = ped.P.shove;
              if (sh === 'shove' || sh === 'argue') { ped.state = 'argue'; ped.argueT = rand(3, 6); ped.shoveBack = sh === 'shove'; voice(ped, sh === 'shove' ? 'insult' : 'argue'); }
              else if (sh === 'flee') { ped.state = 'flee'; ped.fleeT = rand(2, 4); ped.threat = { x: pp.x, z: pp.z }; ped.scream = true; voice(ped, 'scream'); }
              else if (sh === 'apologise') { voice(ped, 'apologise'); }
              else { ped.state = 'flee'; ped.fleeT = rand(1, 2); ped.threat = { x: pp.x, z: pp.z }; ped.scream = false; }
            }
            else if (approaching) { ped.asideT = ped.P.shove === 'shove' ? 0.25 : 0.7; ped.asideDir = { x: sx * sgn, z: sz * sgn }; ped.pause = 0; if (ped.P.shove === 'shove' && Math.random() < 0.3) voice(ped, 'insult'); }
          }
          // personality look-at + greeting
          if (dPlayer < ped.P.look && !inCar) { ped.lookT += dt; if (ped.lookT < ped.P.lookHold + 2) lookAt = pp; } else ped.lookT = 0;
          if (!ped.greeted && dPlayer < 3.5 && !inCar && Math.random() < ped.P.greet * dt * 2) { ped.greeted = true; ped.waveT = 1.4; voice(ped, ped.personality === 'drunk' ? 'drunk' : 'greet'); }
        }
      }
      if (ped.waveT > 0) ped.waveT -= dt;
      if (ped.lookUntil && now < ped.lookUntil) lookAt = lookAt || pp;

      // ---- integrate
      const accel = ped.state === 'flee' ? 7 : 3;
      ped.speed += (targetSpeed - ped.speed) * Math.min(1, dt * accel);
      if (ped.shoveT > 0 || ped.knock.lengthSq() > 0.01) {
        ped.shoveT -= dt;
        ped.pos.x += ped.knock.x * dt; ped.pos.z += ped.knock.z * dt;
        ped.knock.multiplyScalar(Math.exp(-dt * 3.5));
      }
      if (ped.asideT > 0) { ped.asideT -= dt; ped.pos.x += ped.asideDir.x * 1.3 * dt; ped.pos.z += ped.asideDir.z * 1.3 * dt; }
      const moving = ped.speed > 0.02 && !NONMOVING.has(ped.state);
      if (moving) {
        if (ped.state === 'fight' || (ped.state === 'cop' && (P.wanted || 0) > 0)) {
          const hd = ped.heading + (ped.detourT > 0 ? ped.detourA : 0); if (ped.detourT > 0) ped.detourT -= dt;
          ped.pos.x += Math.sin(hd) * ped.speed * dt; ped.pos.z += Math.cos(hd) * ped.speed * dt;
        } else if (ped.state === 'swim') {
          ped.pos.x += Math.sin(ped.swimDir) * ped.speed * dt; ped.pos.z += Math.cos(ped.swimDir) * ped.speed * dt;
          ped.heading = approachAngle(ped.heading, ped.swimDir, dt * 2);
        } else {
          moveHeading = ped.nav && ped.act !== 'shore' && ped.state !== 'approach' ? navStep(ped, dt, ped.speed) : freeStep(ped, dt, ped.speed);
          ped.heading = approachAngle(ped.heading, moveHeading + (ped.P.sway ? Math.sin(now * 1.3 + ped.id) * ped.P.sway : 0), dt * (ped.state === 'flee' ? 9 : 4.5));
        }
      }

      // ---- collide & slide (Rapier KCC) on loaded tiles; otherwise follow the ground height
      const groundOK = collidersReady(ped.pos.x, ped.pos.z);
      let kccOk = false;
      // wall checks: every frame close to the player (no clipping where it can be seen), every third frame to 25 m
      const kccTurn = dPlayer < 10 || (dPlayer < 25 && ((frameN + ped.id) % 3 === 0));
      if (kccTurn && kcc && ped.collider && ped.collider.isEnabled?.() !== false && ped.state !== 'swim' && ped.state !== 'wade' && !ped.teleported && groundOK) {
        try {
          const base = ped.collider.translation();
          const want = { x: ped.pos.x - base.x, y: -0.12, z: ped.pos.z - base.z };
          const wl = Math.hypot(want.x, want.z);
          if (wl < 3) {
            kcc.computeColliderMovement(ped.collider, want);
            const mv = kcc.computedMovement();
            ped.pos.set(base.x + mv.x, base.y + mv.y - 0.9, base.z + mv.z);
            kccOk = true;
            const got = Math.hypot(mv.x, mv.z);
            if (wl > 0.004 && got < wl * 0.35 && moving) {
              ped.stuckT = (ped.stuckT || 0) + dt;
              if (ped.stuckT > 0.7) {
                ped.stuckT = 0;
                if (ped.state === 'fight' || ped.state === 'cop' || ped.state === 'flee') { ped.detourT = rand(0.6, 1.1); ped.detourA = (Math.random() < 0.5 ? -1 : 1) * rand(0.9, 1.4); }
                if (ped.nav) { ped.nav.dir *= -1; ped.nav.cross = null; ped.nav.jit = rand(-0.5, 1.0); }
                ped.target = null;
              }
            } else ped.stuckT = 0;
          }
        } catch (e) { kccOk = false; }
      }
      ped.teleported = false;
      if (!kccOk) {
        if (ped.state === 'swim') ped.pos.y = seaLevel - 0.05;
        else {
          if (ped.gy === undefined || ((frameN + ped.id) & 3) === 0) ped.gy = groundAt(ped.pos.x, ped.pos.z, ped.pos.y);
          if (dPlayer >= 25 || ped.teleported) ped.pos.y += (ped.gy - ped.pos.y) * Math.min(1, dt * 10);
        }
      }
      if (ped.body && ped.collider?.isEnabled?.() !== false) { try { ped.body.setNextKinematicTranslation({ x: ped.pos.x, y: ped.pos.y + 0.9, z: ped.pos.z }); } catch (e) { /* ignore */ } }

      // ---- visuals
      const root = ped.root;
      root.position.copy(ped.pos);
      root.rotation.y = ped.heading;
      if (ped.dog) updateDog(ped, dt);
      const dCam = Math.hypot(ped.pos.x - cam.x, ped.pos.z - cam.z);
      root.visible = dCam < 190;
      const punch = !!ped.punchNow; ped.punchNow = false;
      const hit = !!ped.hitNow; ped.hitNow = false;
      const thr = !!ped.throwNow; ped.throwNow = false;
      if (!root.visible) continue;
      _sph.center.set(ped.pos.x, ped.pos.y + 1, ped.pos.z);
      const inView = !camO || _frustum.intersectsSphere(_sph);
      // in view: animate every frame up to 60 m, every other frame beyond (skipping more made walks look choppy and
      // "stubbly" at a distance); off screen: rarely
      ped.char.setLOD?.(!inView ? 30 : dCam < 60 ? 1 : 2);
      const swimming = ped.state === 'swim';
      ped.char.update(dt, {
        speed: swimming ? 0 : ped.speed, grounded: true, jumping: false, sprint: ped.state === 'flee', driving: false, punch,
        dead: false, idleStyle: swimming ? 'swim' : (ped.speed < 0.4 || ['cower', 'film'].includes(ped.state)) ? ped.idleStyle : null,
        handsUp: ped.handsUp || ped.shoveT > 0.2, guard: ped.state === 'fight', lookAt: dCam < 40 ? lookAt : null,
        call: ped.call && (ped.state === 'walk' || ped.state === 'bench' || ped.state === 'lean'), wave: ped.waveT > 0, argue: ped.state === 'argue', leash: !!ped.dog, hit, throw: thr, getUp: ped.getUp || null,
      });
    }
  }

  return { list, update, panic, damage, spawnAt, _nav: { navFromPos, navStep, sidewalkNear, sandPoint, groundAt, zoneAt, spotOK }, get count() { return list.filter((p) => p.active).length; } };
}

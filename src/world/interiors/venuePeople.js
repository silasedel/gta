// Venue people (interiors-art): staff and guests for V2 venue interiors (nightclub, bar, restaurant, cafe), placed and posed at the
// interior's people spots (ctx.poi). People come from the shared ped system (game.peds, dressed by people.v2.js), so they get the same
// models and looks as the street; this module only decides who stands, sits, leans or dances where, and releases them on leave.
// Hooked as engine.hooks.people (see README "staff and customers"). Stores opt in by setting store.venue in their fixtures().
import * as THREE from 'three';

const STAFF_KIT = { top: [0x141416, 0xf2f0ea], bottom: [0x0d0d0f], shoes: [0x0a0a0a], hats: [], chain: 0 };
const BOUNCER_KIT = { top: [0x0b0b0c], bottom: [0x0b0b0c], shoes: [0x0a0a0a], hats: [], chain: 0 };
const inHours = (h, [o, c]) => (o < c ? h >= o && h < c : h >= o || h < c);

export function createVenuePeople(game, opts = {}) {
  const live = new Map(); let applyKit = null; const v3 = new THREE.Vector3();
  import('../../jobs/kit.js').then((m) => { applyKit = m.applyKit; }).catch(() => { /* kit is optional: guests keep their own clothes */ });
  // what each venue wants on the floor: [role, poi tag, state, count]
  function cast(s, hour) {
    const v = s.venue || {}, busy = v.busy || s.profile?.busy || [18, 2], on = inHours(hour, busy), k = on ? 1 : 0.35, R = (n) => Math.max(0, Math.round(n * k));
    if (v.kind === 'nightclub') return [['bartender', 'bartend', 'talk', 2], ['dj', 'dj', 'dance', 1], ['bouncer', 'door', 'talk', 1], ['guest', 'sit', 'bench', R(5)], ['guest', 'barStand', 'talk', R(2)], ['guest', 'dance', 'dance', R(2)], ['guest', 'lean', 'lean', R(1)]];
    if (v.kind === 'bar') return [['bartender', 'bartend', 'talk', 1], ['guest', 'sit', 'bench', R(4)], ['guest', 'barStand', 'talk', R(3)], ['guest', 'lean', 'lean', R(1)]];
    if (v.kind === 'restaurant') return [['server', 'serve', 'talk', 1], ['guest', 'sit', 'bench', R(6)], ['host', 'host', 'talk', 1]];
    if (v.kind === 'shop') return [['clerk', 'counter', 'talk', 1], ['guest', 'browse', 'talk', R(3)]];
    if (v.kind === 'lobby') return [['host', 'host', 'talk', 1], ['guest', 'sit', 'bench', R(3)]];
    if (v.kind === 'cafe') return [['barista', 'counter', 'talk', 1], ['guest', 'sit', 'bench', R(3)], ['guest', 'queue', 'talk', R(1)]];
    return [];
  }
  function spawnOne(s, role, poi, state) {
    const peds = game.peds; if (!peds?.spawnAt) return null; const w = s.toWorld(poi.x, poi.z, v3), heading = s.facing + (poi.ry || 0);
    let x = w.x, z = w.z; if (state === 'bench') { x += Math.sin(heading) * 0.1; z += Math.cos(heading) * 0.1; }
    const p = peds.spawnAt(new THREE.Vector3(x, s.baseY, z), { outfit: role === 'guest' ? ((s.venue?.kind === 'nightclub' || s.venue?.kind === 'bar') ? 'club' : 'casual') : role === 'clerk' ? 'casual' : role }); if (!p) return null;
    p.pinned = 1e9; p.v21 = { venue: s.key, role }; p.nav = null; p.group = null; p.target = null; p.state = state; p.act = state; p.stateT = 1e9; p.styleT = 1 + Math.random() * 4;
    p.heading = heading; p.idleStyle = state === 'bench' ? 'sitBench' : state === 'lean' ? 'lean' : state === 'dance' ? 'dance' : (Math.random() < 0.5 ? 'talk' : null); p.pos.y = s.baseY; p.groundY = s.baseY;
    if (p.root) { p.root.position.copy(p.pos); p.root.rotation.y = heading; }
    if (applyKit && (role === 'bartender' || role === 'server' || role === 'barista' || role === 'host' || role === 'clerk')) applyKit(game, p, STAFF_KIT, (s.seed + live.get(s)?.peds.length) % 97);
    else if (applyKit && role === 'bouncer') applyKit(game, p, BOUNCER_KIT, s.seed % 89);
    return p;
  }
  function update(s, dt, hour) {
    if (!s.venue || !s.built?.visible) return; const P = game.player?.position; if (!P || s.dist > (opts.radius ?? 32)) { release(s); return; }
    let L = live.get(s); if (!L) { L = { peds: [], used: new Set(), t: 0 }; live.set(s, L); }
    for (let i = L.peds.length - 1; i >= 0; i--) { const e = L.peds[i], p = e.p; if (!p.active || p.dead || p.state === 'flee' || p.state === 'fight' || p.v21?.venue !== s.key) { L.used.delete(e.poi); L.peds.splice(i, 1); } else if (p.state !== e.state && p.state === 'walk') { p.state = e.state; p.act = e.state; p.stateT = 1e9; } }
    L.t -= dt; if (L.t > 0) return; L.t = 0.12; // one person per few frames: dressing a body is not free
    const pois = s.built.pois || [], want = cast(s, hour);
    for (const [role, tag, state, n] of want) {
      const have = L.peds.filter((e) => e.role === role && e.tag === tag).length; if (have >= n) continue;
      const free = pois.filter((q) => (q.tag === tag || (tag === 'barStand' && q.tag === 'stool')) && !L.used.has(q)); if (!free.length) continue;
      let poi = free[Math.floor(Math.random() * free.length)];
      if (tag === 'barStand') { const fx = Math.sin(poi.ry), fz = Math.cos(poi.ry), sx = Math.cos(poi.ry), sz = -Math.sin(poi.ry); poi = { ...poi, x: poi.x - fx * 0.32 + sx * 0.32, z: poi.z - fz * 0.32 + sz * 0.32, base: poi }; }
      const p = spawnOne(s, role, poi, state); L.used.add(poi.base || poi); if (p) L.peds.push({ p, role, tag, state, poi: poi.base || poi }); return;
    }
  }
  function release(s) { const L = live.get(s); if (!L) return; for (const { p } of L.peds) { if (!p.active) continue; p.pinned = 0; p.v21 = null; p.despawnNow = true; } live.delete(s); }
  return { update, release, live, stats: () => [...live.entries()].map(([s, L]) => ({ store: s.name, people: L.peds.length })) };
}

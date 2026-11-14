// Houses in the world (track: houses). Generated houses on residential lots, streamed with importance LOD:
//   near (< 55 m): full-detail build per lot (real geometry: boards, sashes, shutters, rails, tiles, clutter)
//   mid  (cluster within 230 m): every lot of a cluster merged into one mesh per material (lod 1)
//   far  (beyond): merged shells (lod 2) with lit window cards
// A lot whose near build is up is masked out of the merged meshes (lot-hide texture, see materials.js).
// Lots: the Keys spawn street (placed by world-dressing through the lot API, lots.js) and every claimed map house
// footprint (lots.claims) in the city tiles the streamer has at full detail. Colliders within 90 m of the player.
// API: game.houses = { stats(), clusters, lots (the lot API), rebuild() }; game.lots = lot API.
import * as THREE from 'three';
import { createHouseKit } from './materials.js';
import { planHouse, buildHouse } from './generator.js';
import { lots } from './lots.js';

export const order = 75;   // after world-dressing (70), which registers the spawn-street lots

const NEAR_IN = 55, NEAR_OUT = 70, MID_R = 230, COL_IN = 90, COL_OUT = 120, MAP_R = 420;

export async function initV2(game) {
  const { scene, world, RAPIER } = game;
  game.lots = lots;
  if (!lots.enabled) return;
  const hk = createHouseKit(THREE, { shareTex: game.nicoHouse?.house?.kit?.tex });
  const root = new THREE.Group(); root.name = 'houses'; scene.add(root);
  const hm = hk.mat, noCast = new Set([hm.concrete(), hm.metalPaint(), hm.plastic(), hm.houseWindow(), hm.digits(), hm.chainlink(), hm.screen(), hm.poolWater()]);
  const D = game.miamiData, city = game.city;
  const TH = (x, z) => (D?.terrainHeightAt ? D.terrainHeightAt(x, z) : 0);
  const stats = { lots: 0, clusters: 0, near: 0, mid: 0, far: 0, cols: 0, buildMs: 0, maxNearMs: 0, nearBuilt: 0, tris: { near: 0, mid: 0, far: 0 } };

  // ---------- lot ids (1..4095, recycled) for the hide mask ----------
  const freeIds = []; let nextId = 1;
  const takeId = () => freeIds.pop() ?? (nextId < hk.lotMask.size ? nextId++ : 0);
  const dropId = (id) => { if (id > 0) { hk.lotMask.set(id, false); freeIds.push(id); } };

  // ---------- merge per-lot batches into cluster meshes ----------
  const _v = new THREE.Vector3(), _n = new THREE.Vector3();
  function mergeCluster(cl, lod) {
    const buckets = new Map();
    for (const L of cl.lots) {
      if (!(Number.isFinite(L.x) && Number.isFinite(L.z) && Number.isFinite(L.y) && Number.isFinite(L.ry) && Number.isFinite(L.sp.w) && Number.isFinite(L.sp.d))) { L.bad = true; continue; }
      const res = buildHouse(hk, L.sp, lod);
      const c = Math.cos(L.ry), s = Math.sin(L.ry), ox = L.x - cl.ox, oy = L.y, oz = L.z - cl.oz;
      if (lod === 1) { L.colliders = res.colliders; L.lamps = res.lamps; for (const p of res.plants) (cl.plants[p.kind] ||= []).push({ x: L.x + c * p.x + s * p.z, y: L.y, z: L.z - s * p.x + c * p.z, ry: (p.x * 7 + p.z * 3) % 6.28, s: p.s }); }
      for (const [m, k] of res.batch.b) {
        if (!k.n) continue;
        let o = buckets.get(m); if (!o) buckets.set(m, (o = { pos: [], nor: [], uv: [], col: [], wear: [], lot: [], idx: [], n: 0 }));
        const base = o.n;
        for (let i = 0; i < k.n; i++) {
          const x = k.pos[i * 3], y = k.pos[i * 3 + 1], z = k.pos[i * 3 + 2];
          o.pos.push(ox + c * x + s * z, oy + y, oz - s * x + c * z);
          const nx = k.nor[i * 3], nz = k.nor[i * 3 + 2]; o.nor.push(c * nx + s * nz, k.nor[i * 3 + 1], -s * nx + c * nz);
          o.lot.push(L.id);
        }
        for (const v of k.uv) o.uv.push(v); for (const v of k.col) o.col.push(v); for (const v of k.wear) o.wear.push(v);
        for (const v of k.idx) o.idx.push(base + v);
        o.n += k.n;
      }
      res.batch.b.clear();
    }
    const g = new THREE.Group(); g.position.set(cl.ox, 0, cl.oz); let tris = 0;
    for (const [m, o] of buckets) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
      geo.setAttribute('aWear', new THREE.Float32BufferAttribute(o.wear, 1)); geo.setAttribute('aLot', new THREE.Float32BufferAttribute(o.lot, 1));
      geo.setIndex(o.n > 65535 ? new THREE.Uint32BufferAttribute(o.idx, 1) : new THREE.Uint16BufferAttribute(o.idx, 1)); geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, hk.hideHook(m)); mesh.name = `houses:${cl.key}:${lod}:${m.name}`;
      mesh.castShadow = lod === 1 && !m.transparent; mesh.receiveShadow = true; mesh.customDepthMaterial = hk.hideDepth; if (m.transparent) mesh.renderOrder = 2;
      g.add(mesh); tris += o.idx.length / 3;
    }
    g.userData.tris = tris; return g;
  }

  // ---------- clusters ----------
  const clusters = new Map();
  function addCluster(key, list, opts = {}) {
    if (!list.length) return null;
    let ox = 0, oz = 0; for (const L of list) { ox += L.x; oz += L.z; } ox /= list.length; oz /= list.length;
    let r = 0; for (const L of list) r = Math.max(r, Math.hypot(L.x - ox, L.z - oz) + 14);
    const cl = { key, lots: list, ox, oz, r, mid: null, far: null, tile: opts.tile ?? null, always: !!opts.always, plants: {}, fields: [] };
    for (const L of list) { L.id = takeId(); L.cl = cl; L.near = null; L.col = null; L.lampIds = null; }
    const t0 = performance.now();
    cl.mid = mergeCluster(cl, 1); cl.far = mergeCluster(cl, 2);
    stats.buildMs += performance.now() - t0;
    root.add(cl.mid, cl.far); clusters.set(key, cl);
    // yard planting: one instanced vegetation field per kind and cluster (the vegetation system's own LODs and impostors)
    if (game.vegetation?.field) for (const [kind, items] of Object.entries(cl.plants)) { try { cl.fields.push(game.vegetation.field(kind, items, { variants: 2, seed: 7, parent: root })); } catch (e) { console.warn('[houses] plants', kind, e); } } stats.lots += list.length; stats.clusters++;
    return cl;
  }
  function removeCluster(cl) {
    for (const L of cl.lots) { dropNear(L); dropCols(L); lots.remove(L.lotKey); dropId(L.id); }
    for (const g of [cl.mid, cl.far]) { g.traverse((o) => o.geometry?.dispose()); g.removeFromParent(); }
    for (const f of cl.fields) { try { f.remove(); } catch (e) { /* */ } }
    clusters.delete(cl.key); stats.lots -= cl.lots.length; stats.clusters--;
  }

  // ---------- near builds, colliders, lamps ----------
  function buildNear(L) {
    const t0 = performance.now(), res = buildHouse(hk, L.sp, 0), g = new THREE.Group();
    res.batch.build(g); g.position.set(L.x, L.y, L.z); g.rotation.y = L.ry; g.name = 'house:' + L.lotKey;
    // sun shadows only from the big surfaces (walls, roofs, structure); glass, slabs, metal and plastic bits do not cast
    g.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = false; if (noCast.has(o.material)) o.castShadow = false; } });
    g.updateMatrixWorld(true); root.add(g); L.near = g; L.nearLamps = res.lamps;
    // parked car on the driveway: a real (parked, locked) traffic vehicle while the lot is at full detail
    if (res.cars.length && game.vehicles?.spawn && !L.carDone) { L.carDone = true; const cr = res.cars[0], c = Math.cos(L.ry), s = Math.sin(L.ry);
      const T = ['sedan', 'compact', 'suv', 'pickup', 'van', 'sedan', 'suv'][(L.sp.seed >>> 3) % 7];
      try { L.car = game.vehicles.spawn(T, new THREE.Vector3(L.x + c * cr.x + s * cr.z, L.y + 0.6, L.z - s * cr.x + c * cr.z), L.ry + cr.ry, { snap: false }); } catch (e) { L.car = null; } }
    hk.lotMask.set(L.id, true);
    const ms = performance.now() - t0; stats.maxNearMs = Math.max(stats.maxNearMs, ms); stats.nearBuilt++;
    let tris = 0; g.traverse((o) => { if (o.isMesh) tris += o.geometry.index.count / 3; }); g.userData.tris = tris;
  }
  function dropNear(L) {
    if (!L.near) return; hk.lotMask.set(L.id, false);
    L.near.traverse((o) => o.geometry?.dispose()); L.near.removeFromParent(); L.near = null; setLamps(L, false);
    if (L.car) { const V = game.vehicles, car = L.car; L.car = null; L.carDone = false; try { if (V?.list?.includes(car) && game.player?.state?.vehicle !== car && !car.driver?.isPlayer) V.remove(car); } catch (e) { /* */ } }
  }
  const qy = new THREE.Quaternion(), qe = new THREE.Euler();
  function makeCols(L) {
    if (!world || !RAPIER || !L.colliders) return;
    qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), L.ry);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(L.x, L.y, L.z).setRotation({ x: qy.x, y: qy.y, z: qy.z, w: qy.w }));
    for (const c of L.colliders) {
      try {
        const d = c.shape === 'cyl' ? RAPIER.ColliderDesc.cylinder(c.hh, c.r) : RAPIER.ColliderDesc.cuboid(c.h[0], c.h[1], c.h[2]);
        const q = new THREE.Quaternion().setFromEuler(qe.set(c.rx || 0, c.ry || 0, 0, 'YXZ'));
        d.setTranslation(c.p[0], c.p[1], c.p[2]).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        world.createCollider(d, body);
      } catch (e) { /* skip a bad descriptor */ }
    }
    L.col = body; stats.cols++;
  }
  function dropCols(L) { if (L.col) { try { world.removeRigidBody(L.col); } catch (e) { /* already gone */ } L.col = null; stats.cols--; } }
  const _lp = new THREE.Vector3();
  function setLamps(L, on) {
    const lamps = game.env?.lamps; if (!lamps?.add) return;
    if (on && !L.lampIds && L.nearLamps?.length) {
      L.lampIds = L.nearLamps.slice(0, 2).map((l) => { _lp.set(l.pos[0], l.pos[1], l.pos[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), L.ry).add(new THREE.Vector3(L.x, L.y, L.z)); return lamps.add(_lp.x, _lp.y, _lp.z, { color: l.color, intensity: (l.intensity ?? 20) * 2, range: l.range ?? 7, gy: L.y }); });
    } else if (!on && L.lampIds) { for (const id of L.lampIds) lamps.removeGroup?.(id); L.lampIds = null; }
  }

  // ---------- lot sources ----------
  // (1) the spawn street: lots registered by world-dressing (house size, stilts, driveway side)
  const districtAt = (x, z) => { try { return city?.districtAt?.(x, z) || ''; } catch (e) { return ''; } };
  {
    const list = [];
    for (const l of lots.list.values()) {
      if (l.source !== 'street' || !l.house) continue;
      const h = l.house;
      const sp = planHouse({ seed: l.seed, w: h.w, d: h.d, stilt: h.stilt, base: h.base, district: districtAt(l.x, l.z), drvU: h.drvU ?? undefined, front: Math.min(3.2, (h.roadV ?? 8) - 3) });
      list.push({ lotKey: l.id, x: l.x, y: l.y, z: l.z, ry: l.heading, sp });
      l.style = sp.style;
    }
    addCluster('spawn', list, { always: true });
  }
  // (2) claimed map footprints, per city tile at full detail
  // free distance from (x, z) along (dx, dz) before another footprint or a street (max m)
  function freeRun(x, z, dx, dz, others, self, max) {
    for (let t = 0.5; t <= max; t += 0.75) { const px = x + dx * t, pz = z + dz * t;
      if (D?.roadGraph?.nearestEdge) { const e = D.roadGraph.nearestEdge(px, pz, _ne, 12); if (e && e.dist < e.edge.width / 2 + 1.2) return t - 0.5; }
      for (const o of others) { if (o === self || !o._bb) continue; const bb = o._bb; if (px < bb[0] || px > bb[1] || pz < bb[2] || pz > bb[3]) continue; if (pip(o.rings[0], px, pz)) return t - 0.5; } }
    return max;
  }
  const _ne = {};
  const pip = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  function lotFromBuilding(b, others = []) {
    const ring = b.rings[0]; let cx = 0, cz = 0; for (const [x, z] of ring) { cx += x; cz += z; } cx /= ring.length; cz /= ring.length;
    // facing: the footprint axis (longest edge) closest to the direction of the nearest street
    let ang = 0, best = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > best) { best = l; ang = Math.atan2(q[0] - p[0], q[1] - p[1]); } }
    const rd = D?.roadGraph?.nearestEdge?.(cx, cz, {}, 60); let fx = 0, fz = 1, gap = 6;
    if (rd) { fx = rd.point.x - cx; fz = rd.point.z - cz; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l; gap = rd.dist - rd.edge.width / 2; }
    const want = Math.atan2(fx, fz); let ry = ang, bd = 9;
    for (let k = 0; k < 4; k++) { const a = ang + k * Math.PI / 2, dd = Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want))); if (dd < bd) { bd = dd; ry = a; } }
    const c = Math.cos(ry), s = Math.sin(ry); let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of ring) { const dx = x - cx, dz = z - cz, u = dx * c - dz * s, v = dx * s + dz * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2, x = cx + c * mu + s * mv, z = cz - s * mu + c * mv;
    const w = (u1 - u0) * 0.95, d = (v1 - v0) * 0.95;
    let y = Infinity; for (const [px, pz] of ring) y = Math.min(y, TH(px, pz)); if (!Number.isFinite(y)) y = 0;
    for (const o of others) if (!o._bb && o.rings) { let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const [px, pz] of o.rings[0]) { a0 = Math.min(a0, px); a1 = Math.max(a1, px); b0 = Math.min(b0, pz); b1 = Math.max(b1, pz); } o._bb = [a0, a1, b0, b1]; }
    const fx2 = s, fz2 = c, rx2 = c, rz2 = -s;   // lot +Z (street) and +X in world
    const gapF = freeRun(x + fx2 * d / 2, z + fz2 * d / 2, fx2, fz2, others, b, 16);
    const back = freeRun(x - fx2 * d / 2, z - fz2 * d / 2, -fx2, -fz2, others, b, 14);
    const sideL = freeRun(x - rx2 * w / 2, z - rz2 * w / 2, -rx2, -rz2, others, b, 8), sideR = freeRun(x + rx2 * w / 2, z + rz2 * w / 2, rx2, rz2, others, b, 8);
    const front = Math.max(0.8, Math.min(3, gapF - 1.5));
    const sp = planHouse({ seed: (b.id * 2654435761) >>> 0, w, d, stilt: b.style === 'stilt', base: b.style === 'stilt' ? Math.max(2.4, b.minH || 2.7) : undefined, district: districtAt(cx, cz), front, tall: (b.h || 0) > 6.2, drvU: (sideR >= sideL ? 1 : -1) * (w / 2 + 2), yard: { gap: gapF, back: back * 0.5, side: Math.min(sideL, sideR) * 0.5 + 0.3 } });
    if ((b.h || 0) <= 6.2 && sp.stories > 1) sp.stories = 1;
    const lotKey = 'map:' + b.id;
    lots.add({ id: lotKey, x, z, y, heading: ry, w: w + Math.min(sideL, sideR), d: d + back * 0.5 + Math.max(0, gapF - 0.9), roadGap: 0.9, style: sp.style, source: 'map', buildingId: b.id, seed: sp.seed });
    return { lotKey, x, y, z, ry, sp };
  }
  const tilePending = [];
  function scanTiles(px, pz) {
    const S = city?.streamer; if (!S?.tiles || !D?.getTile) return;
    const TS = S.tileSize || 200;
    for (const t of S.tiles.values()) {
      const k = 'tile:' + t.tx + '_' + t.tz, has = clusters.has(k) || t._houseEmpty;
      const d = Math.hypot(t.cx - px, t.cz - pz);
      if (!has && t.near && d < MAP_R && !tilePending.includes(t)) tilePending.push(t);
      if (clusters.has(k) && (!t.near || d > MAP_R + 120)) removeCluster(clusters.get(k));
    }
    if (TS && tilePending.length) {
      tilePending.sort((a, b) => Math.hypot(a.cx - px, a.cz - pz) - Math.hypot(b.cx - px, b.cz - pz));
      const t = tilePending.shift(), tile = D.getTile(t.tx, t.tz);
      if (!tile) { t._houseEmpty = true; return; }
      const list = []; for (const b of tile.buildings || []) if (lots.claims(b)) list.push(lotFromBuilding(b, tile.buildings));
      if (!list.length) { t._houseEmpty = true; return; }
      addCluster('tile:' + t.tx + '_' + t.tz, list, { tile: t });
    }
  }

  // ---------- per-frame ----------
  const cam = new THREE.Vector3(); let scanT = 0, nearQueue = null;
  game.updaters.push(function housesTick(dt) {
    try {
      const h = game.timeOfDay ?? 12; hk.uNight.value = h >= 19.2 || h < 5.4 ? 1 : h > 17.8 ? (h - 17.8) / 1.4 : h < 6.6 ? (6.6 - h) / 1.2 : 0;
      cam.copy(game.camera.position); const P = game.player?.position || cam;
      if ((scanT -= dt) <= 0) { scanT = 0.5; scanTiles(cam.x, cam.z); }
      const night = hk.uNight.value > 0.5;
      let bestNear = null, bestD = Infinity; stats.near = stats.mid = stats.far = 0; stats.tris.near = stats.tris.mid = stats.tris.far = 0;
      for (const cl of clusters.values()) {
        const dc = Math.max(0, Math.hypot(cl.ox - cam.x, cl.oz - cam.z) - cl.r), vis = cl.always ? dc < 1400 : !!(cl.tile && cl.tile.near);
        const mid = vis && dc < MID_R; cl.mid.visible = mid; cl.far.visible = vis && !mid;
        if (mid) { stats.mid++; stats.tris.mid += cl.mid.userData.tris; } else if (vis) { stats.far++; stats.tris.far += cl.far.userData.tris; }
        if (dc > NEAR_OUT + 20 && dc > COL_OUT) { for (const L of cl.lots) { if (L.near) dropNear(L); if (L.col) dropCols(L); } continue; }
        for (const L of cl.lots) {
          const d = Math.hypot(L.x - cam.x, L.z - cam.z), dp = Math.hypot(L.x - P.x, L.z - P.z);
          if (L.near && d > NEAR_OUT) dropNear(L); else if (!L.near && !L.bad && d < NEAR_IN && vis && d < bestD) { bestD = d; bestNear = L; }
          if (L.near) { stats.near++; stats.tris.near += L.near.userData.tris; L.near.visible = vis; setLamps(L, night); }
          if (!L.col && !L.bad && dp < COL_IN) makeCols(L); else if (L.col && dp > COL_OUT) dropCols(L);
        }
      }
      if (bestNear) buildNear(bestNear);   // one full build per frame (5-60 ms), nearest first
    } catch (e) { if (!housesTick._err) { housesTick._err = true; console.error('[houses] update failed', e); } }
  });

  game.houses = {
    lots, clusters, kit: hk,
    stats: () => ({ ...stats, buildMs: Math.round(stats.buildMs), maxNearMs: Math.round(stats.maxNearMs), styles: [...clusters.values()].flatMap((c) => c.lots.map((l) => l.sp.style)).reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {}) }),
  };
  game.emit?.('houses:ready', game.houses);
}

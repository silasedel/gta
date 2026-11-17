// r2-qa playtest, page side (tools/v2/qa/tour.mjs evaluates this in the game page). Defines window.__qa.
// Everything here only READS the game or drives it like a player (teleport, keys, enter/exit); it never patches game code.
(() => {
  const g = window.game, T = g.THREE || window.THREE, R = g.RAPIER, W = g.world, QF = R.QueryFilterFlags, P = g.player;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const STATIC = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS;
  const ST = R.ShapeType || {};
  const groundC = (c) => { try { const t = c.shapeType(); if (t === ST.TriMesh || t === ST.HeightField) return true; if (t === ST.Cuboid) { const he = c.halfExtents(); return he.x > 4 && he.z > 4; } } catch (e) { /* */ } return false; };
  const toi = (h) => h.timeOfImpact ?? h.time_of_impact ?? h.toi;
  const r2 = (x) => Math.round(x * 100) / 100;
  // physics ground: first static collider straight down from yTop (groundOnly: terrain / trimesh / big slabs only)
  function physY(x, z, yTop = 60, groundOnly = false) {
    try { const h = W.castRay(new R.Ray({ x, y: yTop, z }, { x: 0, y: -1, z: 0 }), yTop + 90, true, STATIC, undefined, P.collider, P.body, groundOnly ? groundC : undefined); return h ? yTop - toi(h) : null; } catch (e) { return null; }
  }
  const SOFT = /grass|blade|lawn|weed|flower|fern|bush|shrub|leaf|leaves|frond|canopy|crown|foliage|decal|water|ocean|sky|cloud|shadow|particle|smoke|fog|rain|bird|wire|cable|string|road|asphalt|sidewalk|terrain|ground|sand|seabed|land-base|puddle|paint|mark|glow|beam|pool|footprint|flare|halo|cone|sun|occluder|proxy|collider|helper|hud|reticle|ivy|vine|moss|litter|impostor|billboard|distant|r2-physics|curtain|window|glass/i;
  const KINDS = [
    ['deck', /dock|deck|pier|piling|\bpile|boardwalk|jetty|wharf/i],
    ['mailbox', /mail/i],
    ['bin', /\bbins?\b|bin_|trash|garbage|dumpster|recycl|waste/i],
    ['bench', /bench|picnic|seat/i],
    ['fence', /fence|chainlink|railing|guard_?rail|gate|picket|balust/i],
    ['sign', /sign/i],
    ['pole', /pole|lamp|streetlight|light_?post|utility|hydrant|bollard|meter|\bpost|signal|mast|column/i],
    ['wall', /wall|barrier|jersey|planter|retain|parapet|block/i],
    ['tree', /palm|tree|trunk|veg|flora|bark|oak|pine|mangrove|cypress|plant/i],
  ];
  const classify = (label) => { for (const [k, re] of KINDS) if (re.test(label)) return k; return 'other'; };
  const under = (o, set) => { for (let q = o; q; q = q.parent) if (set.has(q)) return true; return false; };
  const matOf = (o) => (Array.isArray(o.material) ? o.material[0] : o.material);
  const labelOf = (o) => [o.name, o.parent?.name, o.parent?.parent?.name, matOf(o)?.name].filter(Boolean).join('|').slice(0, 90);
  function excluded() {
    const s = new Set(); for (const v of g.vehicles.all ? g.vehicles.all() : g.vehicles.list) if (v.mesh) s.add(v.mesh);
    if (g.playerCharacter?.root) s.add(g.playerCharacter.root); return s;
  }
  const visible = (o) => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };

  // ------------------------------------------------------------------ objects near (cx, cz)
  function objects(cx, cz, rad) {
    const out = [], ex = excluded(), M = new T.Matrix4(), box = new T.Box3(), v = new T.Vector3(), sz = new T.Vector3();
    g.scene.traverseVisible((o) => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry) return;
      const m = matOf(o); if (!m) return;
      if (SOFT.test((o.name || '') + '|' + (m.name || ''))) return;
      if ((m.transparent && m.opacity < 0.9) || m.depthWrite === false) return;
      if (under(o, ex)) return;
      const geo = o.geometry; if (!geo.boundingBox) geo.computeBoundingBox(); if (!geo.boundingSphere) geo.computeBoundingSphere();
      const label = labelOf(o), kind = classify(label);
      const add = (i, Mw) => {
        box.copy(geo.boundingBox).applyMatrix4(Mw); box.getSize(sz); box.getCenter(v);
        if (Math.hypot(v.x - cx, v.z - cz) > rad) return;
        if (Math.max(sz.x, sz.z) > (kind === 'other' ? 6 : 12) || sz.y < 0.45 || sz.y > 40) return;
        const org = new T.Vector3().setFromMatrixPosition(Mw);
        const ox = o.isInstancedMesh ? org.x : v.x, oz = o.isInstancedMesh ? org.z : v.z;
        out.push({ o, i, kind, label, box: box.clone(), x: ox, z: oz, d: Math.hypot(ox - cx, oz - cz) });
      };
      if (o.isInstancedMesh) {
        if (!o.count) return;
        const Mw = new T.Matrix4(), step = o.count > 6000 ? Math.ceil(o.count / 6000) : 1;
        for (let i = 0; i < o.count; i += step) { o.getMatrixAt(i, M); if (M.elements[0] === 0 && M.elements[5] === 0 && M.elements[10] === 0) continue; Mw.multiplyMatrices(o.matrixWorld, M); add(i, Mw); }
      } else add(-1, o.matrixWorld);
    });
    return out;
  }
  // meshes to raycast against near (cx, cz) (rendered surfaces; foliage, water, cars and people excluded)
  function rayCands(cx, cz, rad) {
    const out = [], ex = excluded(), s = new T.Sphere();
    g.scene.traverseVisible((o) => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry) return; const m = matOf(o); if (!m) return;
      if (/grass|blade|lawn|weed|flower|fern|bush|shrub|leaf|leaves|frond|canopy|crown|foliage|water|ocean|sky|cloud|particle|smoke|fog|rain|bird|wire|cable|glow|beam|flare|halo|cone|occluder|proxy|collider|helper|hud|impostor|billboard|distant|r2-physics|footprint|shadow/i.test((o.name || '') + '|' + (m.name || ''))) return;
      if ((m.transparent && m.opacity < 0.5) || m.visible === false || m.colorWrite === false) return;
      if (under(o, ex)) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (!o.isInstancedMesh) { s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); if (Math.hypot(s.center.x - cx, s.center.z - cz) - s.radius > rad) return; }
      out.push(o);
    });
    return out;
  }
  const rc = new T.Raycaster();
  function castMeshes(cands, org, dir, far, skip) {
    rc.set(org, dir); rc.near = 0; rc.far = far; const hits = [];
    for (const m of cands) { try { (m.isInstancedMesh ? T.InstancedMesh : T.Mesh).prototype.raycast.call(m, rc, hits); } catch (e) { /* */ } }
    let best = null; for (const h of hits) { if (skip && skip(h)) continue; if (!best || h.distance < best.distance) best = h; } return best;
  }
  function castObj(ob, org, dir, far) {
    rc.set(org, dir); rc.near = 0; rc.far = far; const hits = [];
    try { (ob.o.isInstancedMesh ? T.InstancedMesh : T.Mesh).prototype.raycast.call(ob.o, rc, hits); } catch (e) { /* */ }
    let best = Infinity; for (const h of hits) if ((ob.i < 0 || h.instanceId === ob.i) && h.distance < best) best = h.distance; return best;
  }
  function castTree(root, org, dir, far) { rc.set(org, dir); rc.near = 0; rc.far = far; const h = rc.intersectObject(root, true).filter((x) => x.object.visible !== false); return h.length ? h[0] : null; }

  // ------------------------------------------------------------------ hitbox: capsule cast vs visual surface
  const CAP = new R.Capsule(P.capsule?.half ?? 0.62, P.capsule?.r ?? 0.28), CR = P.capsule?.r ?? 0.28;
  function hitbox(ob, carV) {
    const gy = physY(ob.x, ob.z, (ob.box?.min.y ?? 0) + 4, true) ?? ob.box?.min.y ?? 0;
    const sz = ob.box ? ob.box.getSize(new T.Vector3()) : new T.Vector3(4, 1.5, 4);
    const rStart = Math.max(sz.x, sz.z) / 2 + 1.6, seed = ((ob.x * 7.13 + ob.z * 3.7) % 6.283);
    const res = { pen: -9, dir: null, dm: null, dc: null, tested: 0 };
    for (let k = 0; k < 4; k++) {
      const a = seed + k * Math.PI / 2, dx = Math.sin(a), dz = Math.cos(a), sx = ob.x - dx * rStart, sz2 = ob.z - dz * rStart;
      const d3 = new T.Vector3(dx, 0, dz); let dm = Infinity;
      for (const h of [0.5, 1.1]) { const org = new T.Vector3(sx, gy + h, sz2); const d = carV ? (castTree(carV.mesh, org, d3, rStart + 0.5)?.distance ?? Infinity) : castObj(ob, org, d3, rStart + 0.5); dm = Math.min(dm, d); }
      if (!Number.isFinite(dm)) continue;
      let hit = null; try { hit = W.castShape({ x: sx, y: gy + 0.9 + 0.3, z: sz2 }, { x: 0, y: 0, z: 0, w: 1 }, { x: dx, y: 0, z: dz }, CAP, 0, rStart + 0.5, true, QF.EXCLUDE_SENSORS, undefined, P.collider, P.body); } catch (e) { hit = null; }
      let dc = Infinity;
      if (hit) { dc = toi(hit); const n = hit.normal1 || hit.normal2 || { y: 0 }; if (Math.abs(n.y) > 0.75 || dc < 0.02) continue; } // ground / start inside: not conclusive
      res.tested++;
      const pen = Number.isFinite(dc) ? dc + CR - dm : rStart + 0.5 + CR - dm;
      if (pen > res.pen) Object.assign(res, { pen: r2(pen), dir: [r2(dx), r2(dz)], start: [r2(sx), r2(gy), r2(sz2)], dm: r2(dm), dc: Number.isFinite(dc) ? r2(dc) : null, through: !Number.isFinite(dc) || dc > dm });
    }
    return res;
  }

  // ------------------------------------------------------------------ real walk (player input)
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  async function realWalk(start, dir, dm, car) {
    const h = Math.atan2(dir[0], dir[1]);
    g.teleport(start[0], start[1], start[2], h); await sleep(700);
    const t0 = car ? car.body.translation() : null; await sleep(500);
    const t1 = car ? car.body.translation() : null; const drift = car ? Math.hypot(t1.x - t0.x, t1.y - t0.y, t1.z - t0.z) : 0;
    const q0 = car ? car.body.rotation() : null;
    const s0 = P.position.clone(); let maxAlong = -9, maxLat = 0;
    key('KeyW', true); key('ShiftLeft', true);
    const dur = Math.min(3200, ((dm ?? 3) + 1.5) / 4.5 * 1000 + 900), tEnd = performance.now() + dur;
    while (performance.now() < tEnd) { g.cameraYaw = h + Math.PI; await new Promise((r) => requestAnimationFrame(r)); const a = (P.position.x - s0.x) * dir[0] + (P.position.z - s0.z) * dir[1], lat = Math.abs(-(P.position.x - s0.x) * dir[1] + (P.position.z - s0.z) * dir[0]); if (lat < 0.25 && a > maxAlong) maxAlong = a; if (lat > maxLat) maxLat = lat; }
    key('KeyW', false); key('ShiftLeft', false); await sleep(600);
    const out = { maxAlong: r2(maxAlong), pen: dm != null ? r2(maxAlong + CR - dm) : null, travelled: r2(Math.hypot(P.position.x - s0.x, P.position.z - s0.z)), maxLat: r2(maxLat) };
    if (car) { const t2 = car.body.translation(), q2 = car.body.rotation(); out.carMovedMm = Math.round(Math.hypot(t2.x - t1.x, t2.y - t1.y, t2.z - t1.z) * 1000 * 10) / 10; out.driftMm = Math.round(drift * 10000) / 10; out.carTurnDeg = r2(2 * Math.acos(Math.min(1, Math.abs(q0.x * q2.x + q0.y * q2.y + q0.z * q2.z + q0.w * q2.w))) * 57.3); }
    return out;
  }

  // ------------------------------------------------------------------ area readiness
  async function goArea(x, z, h = 0, maxS = 40) {
    g.teleport(x, undefined, z, h);
    const C = g.city, st = C.streamer; const t0 = performance.now();
    while (performance.now() - t0 < maxS * 1000) {
      const col = C.collidersReadyAt ? C.collidersReadyAt(x, z) : true, near = st?.readyAround ? st.readyAround(x, z, 120) : true;
      if (col && near) break; await sleep(500);
    }
    const ready = (performance.now() - t0) / 1000;
    g.teleport(x, undefined, z, h); await sleep(2500);
    return { readyS: r2(ready), timedOut: ready >= maxS - 0.5 };
  }
  // a sidewalk point next to the nearest road edge
  function sidewalkNear(x, z) {
    const G = g.city.roadGraph; const r = G?.nearestEdge?.(x, z, {}, 600); if (!r) return { x, z, h: 0 };
    const e = r.edge, p = e.pts; let bi = 0, bd = 1e9; for (let i = 0; i < p.length - 1; i++) { const d = Math.hypot(p[i][0] - x, p[i][1] - z); if (d < bd) { bd = d; bi = i; } }
    const a = p[bi], b = p[bi + 1] || p[bi - 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, off = (e.width || 7) / 2 + 2.2;
    return { x: a[0] - dz / L * off, z: a[1] + dx / L * off, h: Math.atan2(dx, dz), road: { x: a[0], z: a[1], h: Math.atan2(dx, dz), w: e.width || 7, kind: e.kind } };
  }

  // ------------------------------------------------------------------ scans
  function scanArea(cx, cz, rad = 55, perKind = 30) {
    const t0 = performance.now(); const obs = objects(cx, cz, rad); const byKind = {};
    for (const ob of obs) (byKind[ob.kind] ||= []).push(ob);
    const res = { counts: {}, hitbox: [], tested: {}, float: [], sink: [], floatChecked: 0, labelHist: {} };
    for (const k in byKind) { res.counts[k] = byKind[k].length; byKind[k].sort((a, b) => a.d - b.d); }
    for (const ob of obs) { const l = ob.label.split('|')[0] || ob.label; res.labelHist[ob.kind + ':' + l] = (res.labelHist[ob.kind + ':' + l] || 0) + 1; }
    // hitbox: nearest perKind per kind (one instance per (mesh, cell) so 30 trees are 30 different trees)
    const cands = rayCands(cx, cz, rad + 10); res.walkPicks = {};
    for (const k in byKind) {
      let n = 0; const seen = new Set(); res.tested[k] = 0;
      for (const ob of byKind[k]) {
        if (n >= perKind) break; const cell = ob.o.uuid + Math.round(ob.x) + ',' + Math.round(ob.z); if (seen.has(cell)) continue; seen.add(cell);
        const hb = hitbox(ob); if (!hb.tested) continue; n++; res.tested[k]++;
        if (hb.pen > 0.12) res.hitbox.push({ kind: k, label: ob.label, x: r2(ob.x), y: r2(ob.box.min.y), z: r2(ob.z), ...hb });
        if (hb.pen <= 0.12 && (res.walkPicks[k] || []).length < 2) (res.walkPicks[k] ||= []).push({ label: ob.label, x: r2(ob.x), z: r2(ob.z), start: hb.start, dir: hb.dir, dm: hb.dm });
      }
    }
    // pass-through objects also get a real walk (first 2 per kind)
    const pk = {}; for (const f of res.hitbox) { if ((pk[f.kind] = (pk[f.kind] || 0) + 1) > 2) continue; (res.walkPicks[f.kind] ||= []).push({ label: f.label, x: f.x, z: f.z, start: f.start, dir: f.dir, dm: f.dm, flagged: true }); }
    // floating / sinking: object base vs the physics ground; confirmed against the rendered surface
    const fl = [];
    for (const ob of obs) {
      const top = ob.box.min.y + 3; const gy = physY(ob.x, ob.z, top, true); if (gy === null) continue;
      const d = ob.box.min.y - gy; if (Math.abs(d) > 2) continue; // on a deck, roof or under a bridge
      if (d > 0.08 || d < -0.3) fl.push([ob, d, gy]);
    }
    fl.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const fseen = new Set();
    for (const [ob, d, gy] of fl) {
      if (res.floatChecked >= 260) break; const kk = ob.label + Math.round(ob.x / 3) + ',' + Math.round(ob.z / 3); if (fseen.has(kk)) continue; fseen.add(kk); res.floatChecked++;
      const self = (h) => h.object === ob.o && (ob.i < 0 || h.instanceId === ob.i);
      if (d > 0) { // anything rendered under the base? (a mailbox box on its post, a sign on a pole, a pot on a wall)
        const hb = castMeshes(cands, new T.Vector3(ob.x, ob.box.min.y + 0.02, ob.z), new T.Vector3(0, -1, 0), d + 0.02, self);
        const hb2 = castMeshes(cands, new T.Vector3((ob.box.min.x + ob.box.max.x) / 2, ob.box.min.y + 0.02, (ob.box.min.z + ob.box.max.z) / 2), new T.Vector3(0, -1, 0), d + 0.02, self);
        if (hb && hb.distance < d - 0.06 || hb2 && hb2.distance < d - 0.06) continue;
        res.float.push({ kind: ob.kind, label: ob.label, x: r2(ob.x), z: r2(ob.z), base: r2(ob.box.min.y), ground: r2(gy), gap: r2(d), renderGap: hb ? r2(hb.distance) : null });
      } else {
        const hr = castMeshes(cands, new T.Vector3(ob.x, gy + 1.5, ob.z), new T.Vector3(0, -1, 0), 4, self);
        const ry = hr ? gy + 1.5 - hr.distance : gy; if (ob.box.min.y > ry - 0.3) continue;
        res.sink.push({ kind: ob.kind, label: ob.label, x: r2(ob.x), z: r2(ob.z), base: r2(ob.box.min.y), ground: r2(ry), sunk: r2(ob.box.min.y - ry), h: r2(ob.box.max.y - ob.box.min.y) });
      }
    }
    // parked cars: plants inside the car footprint, car height vs ground
    res.cars = []; res.plantsInCars = [];
    const veg = obs.filter((o) => o.kind === 'tree'); const plants = [];
    g.scene.traverseVisible((o) => { if (!o.isInstancedMesh || !o.count) return; if (!/veg|palm|tree|plant|flora|bush|shrub|fern|flower|hedge/i.test(labelOf(o)) || /grass|blade|lawn|weed/i.test(labelOf(o))) return; plants.push(o); });
    for (const v of g.vehicles.list) {
      if (!v.body || v.playerDriven || v.ai) continue; const t = v.body.translation(); if (Math.hypot(t.x - cx, t.z - cz) > rad) continue;
      const q = v.body.rotation(), inv = new T.Quaternion(q.x, q.y, q.z, q.w).invert(), L = v.spec?.L || 4.6, Wd = v.spec?.W || 1.9;
      const M = new T.Matrix4(), p = new T.Vector3(); let hits = 0, lbl = '';
      for (const o of plants) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); p.setFromMatrixPosition(M).applyMatrix4(o.matrixWorld); if (Math.abs(p.x - t.x) > 4 || Math.abs(p.z - t.z) > 4) continue; const l = p.clone().sub(new T.Vector3(t.x, p.y, t.z)).applyQuaternion(inv); if (Math.abs(l.x) < Wd / 2 - 0.05 && Math.abs(l.z) < L / 2 - 0.05) { hits++; lbl = labelOf(o); } } }
      if (hits) res.plantsInCars.push({ car: v.typeKey, x: r2(t.x), z: r2(t.z), plants: hits, label: lbl });
      res.cars.push({ v, key: v.typeKey, x: t.x, z: t.z, d: Math.hypot(t.x - cx, t.z - cz) });
    }
    res.cars.sort((a, b) => a.d - b.d);
    res.carHitbox = [];
    for (const c of res.cars.slice(0, 30)) { const hb = hitbox({ x: c.x, z: c.z, box: new T.Box3().setFromObject(c.v.mesh), i: -1 }, c.v); if (hb.tested && hb.pen > 0.12) res.carHitbox.push({ car: c.key, x: r2(c.x), z: r2(c.z), ...hb }); }
    res.carsTested = Math.min(30, res.cars.length);
    res.carWalk = res.cars.slice(0, 4).map((c) => { const hb = hitbox({ x: c.x, z: c.z, box: new T.Box3().setFromObject(c.v.mesh), i: -1 }, c.v); return { id: c.v.id, key: c.key, x: r2(c.x), z: r2(c.z), start: hb.start, dir: hb.dir, dm: hb.dm }; }).filter((c) => c.start);
    res.cars = res.cars.length;
    res.ms = Math.round(performance.now() - t0);
    return res;
  }

  // ground: physics vs rendered surface at random points (and road-side points)
  function groundScan(cx, cz, n = 220, rad = 70) {
    const cands = rayCands(cx, cz, rad + 5); const out = { n: 0, mismatch: [], missing: [], water: 0, waterMissing: [], hist: {} };
    const sea = g.city.seaLevel ?? 0; const G = g.city.roadGraph; let seed = 1 + Math.abs(Math.round(cx * 13 + cz * 7)) % 1000;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pts = [];
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * rad; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, 'rand']); }
    for (let i = 0; i < 60; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * rad; const e = G?.nearestEdge?.(cx + Math.cos(a) * r, cz + Math.sin(a) * r, {}, 60); if (!e) continue; const p = e.edge.pts[Math.floor(rnd() * (e.edge.pts.length - 1))], q = e.edge.pts[e.edge.pts.indexOf(p) + 1] || p; const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1, off = (e.edge.width || 7) / 2 + 0.4 + rnd() * 2.5, s = rnd() < 0.5 ? 1 : -1; pts.push([p[0] - dz / L * off * s, p[1] + dx / L * off * s, 'curbside']); }
    for (const [x, z, src] of pts) {
      const hr = castMeshes(cands, new T.Vector3(x, 80, z), new T.Vector3(0, -1, 0), 160); if (!hr) continue;
      const ry = 80 - hr.distance; const py = physY(x, z, 80); out.n++;
      const lbl = (hr.object.name || hr.object.parent?.name || '?').slice(0, 40); out.hist[lbl] = (out.hist[lbl] || 0) + 1;
      const wat = g.city.isWater ? g.city.isWater(x, z) : false; const depth = sea - ry;
      if (wat && depth > 0 && depth < 1.5) out.water++;
      if (py === null || py < ry - 1.0) { const rec = { x: r2(x), z: r2(z), src, render: r2(ry), phys: py === null ? null : r2(py), mesh: lbl, water: wat, depth: r2(depth) }; (wat && depth > 0 && depth < 1.5 ? out.waterMissing : out.missing).push(rec); continue; }
      const d = py - ry; if (Math.abs(d) > 0.05) out.mismatch.push({ x: r2(x), z: r2(z), src, render: r2(ry), phys: r2(py), diff: r2(d), mesh: lbl, water: wat });
    }
    out.mismatch.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return out;
  }

  // ------------------------------------------------------------------ camera for screenshots
  function aim(x, y, z, fx, fz, dist = 5, hgt = 1.8) {
    let dx = fx ?? 0.7, dz = fz ?? 0.7; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    g.cameraOverride = (dt, cam) => { cam.position.set(x - dx * dist, y + hgt, z - dz * dist); cam.lookAt(x, y + 0.6, z); return true; };
  }
  const unaim = () => { g.cameraOverride = null; };

  // ------------------------------------------------------------------ vehicles
  function headBone() { let hb = null; g.playerCharacter?.root?.traverse((o) => { if (!hb && o.isBone && /head$|^head|Head$/i.test(o.name) && !/top|end|nub/i.test(o.name)) hb = o; }); return hb; }
  function headClip(v) {
    const hb = headBone(); if (!hb) return { err: 'no head bone' }; const hp = hb.getWorldPosition(new T.Vector3());
    const skull = hp.y + 0.2; const h = castTree(v.mesh, new T.Vector3(hp.x, hp.y + 2.5, hp.z), new T.Vector3(0, -1, 0), 3.2);
    const roofY = h ? hp.y + 2.5 - h.distance : null;
    return { head: r2(hp.y), skullTop: r2(skull), roofOuter: roofY === null ? null : r2(roofY), roofMesh: h ? (h.object.name || h.object.parent?.name || '').slice(0, 40) : null, clip: roofY !== null && roofY > hp.y - 0.35 && roofY < skull + 0.0 };
  }
  function carState(v) {
    const t = v.body.translation(), q = v.body.rotation(), lv = v.body.linvel();
    const up = new T.Vector3(0, 1, 0).applyQuaternion(new T.Quaternion(q.x, q.y, q.z, q.w)).y;
    const gy = physY(t.x, t.z, t.y + 1.5, true);
    let wheelSink = 0, wheelAir = 0, nW = 0; const v3 = new T.Vector3();
    for (const w of v.car?.wheels || []) { const o = w.steer || w.mesh || w; if (!o.getWorldPosition) continue; o.getWorldPosition(v3); const hy = (() => { try { const h = W.castRay(new R.Ray({ x: v3.x, y: v3.y + 0.4, z: v3.z }, { x: 0, y: -1, z: 0 }), 3, true, STATIC); return h ? v3.y + 0.4 - toi(h) : null; } catch (e) { return null; } })(); if (hy === null) { wheelAir++; continue; } const e = v3.y - (v.spec?.r || 0.33) - hy; nW++; wheelSink = Math.min(wheelSink, e); if (e > 0.15) wheelAir++; }
    return { x: t.x, y: t.y, z: t.z, nan: ![t.x, t.y, t.z, q.x, q.y, q.z, q.w].every(Number.isFinite), up, kmh: Math.hypot(lv.x, lv.z) * 3.6, vy: lv.y, gy, wheelSink, wheelAir, nW };
  }
  async function driveScript(v, secs, plan, rec) {
    const t0 = performance.now(); let held = new Set();
    const set = (codes) => { for (const c of held) if (!codes.includes(c)) key(c, false); for (const c of codes) if (!held.has(c)) key(c, true); held = new Set(codes); };
    let lastS = 0;
    while ((performance.now() - t0) / 1000 < secs) {
      const t = (performance.now() - t0) / 1000; const s = carState(v);
      set(plan(t, s));
      if (t - lastS > 0.2) { lastS = t; rec.push({ t: r2(t), ...Object.fromEntries(Object.entries(s).map(([k, x]) => [k, typeof x === 'number' ? r2(x) : x])) }); }
      await new Promise((r) => requestAnimationFrame(r));
    }
    set([]);
  }
  function judge(rec, label, opts = {}) {
    const f = []; let stuckT = 0, airT = 0, last = null;
    for (const s of rec) {
      if (s.nan) { f.push(['NaN position', s]); break; }
      if (s.up < 0.5) { f.push(['rolled over', s]); break; }
      if (s.gy !== null && s.y - s.gy > (opts.flyY ?? 2.6)) { f.push(['flying', s]); }
      if (s.wheelSink < -0.12) f.push(['wheel in ground', s]);
      if (s.nW && s.wheelAir >= 4 && s.kmh > 5) { airT += last ? s.t - last.t : 0; if (airT > 1.2 && !opts.allowAir) f.push(['all wheels airborne > 1.2 s', s]); } else airT = 0;
      if (opts.stuck && s.t > 2.5 && s.kmh < 2 && opts.stuck(s.t)) { stuckT += last ? s.t - last.t : 0; if (stuckT > 4) { f.push(['stuck (no speed with throttle)', s]); stuckT = -99; } } else if (stuckT > 0) stuckT = 0;
      last = s;
    }
    const seen = new Set(); return f.filter(([k]) => (seen.has(k) ? false : (seen.add(k), true))).map(([k, s]) => ({ what: k, label, t: s.t, at: [r2(s.x), r2(s.y), r2(s.z)], kmh: r2(s.kmh), up: r2(s.up), gy: s.gy, wheelSink: s.wheelSink }));
  }

  window.__qa = { sleep, physY, objects, rayCands, castMeshes, hitbox, realWalk, goArea, sidewalkNear, scanArea, groundScan, aim, unaim, headBone, headClip, carState, driveScript, judge, key, r2 };
})();

// r2-perf in-page probes (eval'd by tools/v2/perf/r2-probe.mjs; idempotent). window.__r2q:
//   colliders(r)    colliders within r m of the player: shape type, triangle / vertex counts, body type, source generator
//   stream()        tile streamer stats (maxStep per job kind, queue, budget) and city.update split
//   programs()      program / material census: materials per program, duplicate materials (same type + textures + params),
//                   programs per material type, onBeforeCompile materials without customProgramCacheKey
//   movers(ms)      objects under city.root whose local matrix changes within ms (must stay auto-updated)
//   freeze(on)      A/B: matrixAutoUpdate = false on every city.root descendant that did not move (on = false restores)
(() => {
  if (window.__r2q) return 'already';
  const THREE = game.THREE, R = game.RAPIER, W = game.world, r = game.renderer;
  const SHAPE = {}; try { for (const [k, v] of Object.entries(R.ShapeType)) if (typeof v === 'number') SHAPE[v] = k; } catch (e) { /* */ }
  function colliders(rad = 6) {
    const p = game.player.position, out = [];
    const seen = new Set();
    try {
      W.collidersWithAabbIntersectingAabb({ x: p.x, y: p.y + 1, z: p.z }, { x: rad, y: rad, z: rad }, (c) => {
        if (seen.has(c.handle)) return true; seen.add(c.handle);
        const t = c.shapeType(), b = c.parent();
        let tris = 0, verts = 0, extra = '';
        try { const ix = c.indices?.(); const vx = c.vertices?.(); if (ix) tris = ix.length / 3; if (vx) verts = vx.length / 3; } catch (e) { /* */ }
        try { if (SHAPE[t] === 'HeightField') { const h = c.heights?.(); extra = 'heights ' + (h ? h.length : '?'); } } catch (e) { /* */ }
        const tr = c.translation();
        let src = '';
        try { src = JSON.stringify(game.city?.colliderSourceAt?.(tr.x, tr.z, 1)?.slice?.(0, 3) || ''); } catch (e) { /* */ }
        out.push({ h: c.handle, shape: SHAPE[t] || t, tris, verts, extra, sensor: c.isSensor(), body: b ? (b.isFixed() ? 'fixed' : b.isKinematic() ? 'kin' : 'dyn') : 'none', at: [+tr.x.toFixed(1), +tr.y.toFixed(1), +tr.z.toFixed(1)], src: src.slice(0, 160), ud: JSON.stringify(b?.userData || c.userData || '').slice(0, 120) });
        return true;
      });
    } catch (e) { return { error: String(e) }; }
    out.sort((a, b) => b.tris - a.tris || b.verts - a.verts);
    return { n: out.length, top: out.slice(0, 25), byShape: out.reduce((m, c) => { m[c.shape] = (m[c.shape] || 0) + 1; return m; }, {}) };
  }
  // time a player KCC move with each nearby collider excluded in turn: which collider costs the controller
  function kccBlame(rad = 6, reps = 20) {
    const res = colliders(rad); if (res.error) return res;
    return res;
  }
  function stream() {
    const s = game.city?.streamer; if (!s) return null;
    return { stats: JSON.parse(JSON.stringify(s.stats)), pending: s.pending(), tiles: s.tiles.size };
  }
  function programs() {
    const props = r.properties;
    const byProg = new Map(), mats = new Set();
    game.scene.traverse((o) => { if (!o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) mats.add(m); });
    const sig = new Map(); let obcNoKey = 0; const obcKinds = {};
    const typeCount = {};
    for (const m of mats) {
      typeCount[m.type] = (typeCount[m.type] || 0) + 1;
      const p = props.get(m).currentProgram;
      const pk = p ? p.id : -1;
      let e = byProg.get(pk); if (!e) byProg.set(pk, e = { n: 0, name: p ? p.name : 'none', type: m.type, names: new Set() }); e.n++; if (e.names.size < 6) e.names.add(m.name || '?');
      if (m.onBeforeCompile && m.onBeforeCompile.toString() !== THREE.Material.prototype.onBeforeCompile.toString()) {
        const own = m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey;
        if (!own) { obcNoKey++; const k = (m.name || m.type).replace(/[0-9]+/g, '#').slice(0, 40); obcKinds[k] = (obcKinds[k] || 0) + 1; }
      }
      // duplicate signature: type + textures + main params + defines + onBeforeCompile source
      const tex = []; for (const k in m) { const v = m[k]; if (v && v.isTexture) tex.push(k + ':' + (v.source?.uuid || v.uuid)); }
      const s2 = [m.type, m.name.replace(/[0-9]+/g, '#'), tex.sort().join(','), m.color?.getHexString?.(), m.roughness, m.metalness, m.transparent, m.side, m.alphaTest, m.vertexColors, JSON.stringify(m.defines || {}), m.onBeforeCompile ? m.onBeforeCompile.toString().length : 0].join('|');
      let d = sig.get(s2); if (!d) sig.set(s2, d = []); d.push(m);
    }
    const dups = [...sig.entries()].filter(([, a]) => a.length > 1).map(([k, a]) => [a.length, k.slice(0, 140)]).sort((x, y) => y[0] - x[0]);
    const dupMats = dups.reduce((s, d) => s + d[0] - 1, 0);
    // programs: group by shader name / material type; programs whose name repeats many times = variants of one shader
    const progNames = {}; for (const p of r.info.programs) { const k = (p.name || '?').replace(/[0-9]+/g, '#').slice(0, 50); progNames[k] = (progNames[k] || 0) + 1; }
    // what varies between programs of the same material type: the cacheKey parts
    const keyParts = {};
    for (const p of r.info.programs) { const parts = String(p.cacheKey).split(','); keyParts[parts.length] = (keyParts[parts.length] || 0) + 1; }
    return {
      materials: mats.size, programsLive: r.info.programs.length, programsUsed: byProg.size, typeCount,
      matsPerProgramTop: [...byProg.values()].sort((a, b) => b.n - a.n).slice(0, 15).map((e) => [e.n, e.name, e.type, [...e.names].join('/')]),
      duplicateSets: dups.length, duplicateMaterials: dupMats, dupTop: dups.slice(0, 25),
      onBeforeCompileWithoutKey: obcNoKey, obcKinds: Object.entries(obcKinds).sort((a, b) => b[1] - a[1]).slice(0, 20),
      programNames: Object.entries(progNames).sort((a, b) => b[1] - a[1]).slice(0, 25),
    };
  }
  async function movers(ms = 4000) {
    const root = game.city?.root; if (!root) return null;
    const snap = new Map();
    root.traverse((o) => { snap.set(o, [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z]); });
    await new Promise((res) => setTimeout(res, ms));
    const moved = []; let total = 0;
    root.traverse((o) => { total++; const a = snap.get(o); if (!a) return; const b = [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z]; for (let i = 0; i < 10; i++) if (Math.abs(a[i] - b[i]) > 1e-6) { moved.push(o); break; } });
    const names = {}; for (const o of moved) { let n = o.name || o.type; let p = o.parent; while (p && p !== root && !(p.name)) p = p.parent; const k = (p && p !== root ? p.name + '/' : '') + n; names[k.replace(/[0-9]+/g, '#')] = (names[k.replace(/[0-9]+/g, '#')] || 0) + 1; }
    window.__r2moved = new Set(moved);
    return { total, moved: moved.length, names: Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 20) };
  }
  const frozen = [];
  function freeze(on) {
    const root = game.city?.root; if (!root) return 0;
    if (on) {
      const mv = window.__r2moved || new Set();
      // an object stays live if it, or anything under it, moved (its children's world matrices depend on it)
      const live = new Set(); for (const o of mv) for (let p = o; p && p !== root; p = p.parent) live.add(p);
      root.traverse((o) => { if (o === root || live.has(o) || !o.matrixAutoUpdate) return; o.updateMatrix(); o.matrixAutoUpdate = false; frozen.push(o); });
      return frozen.length;
    }
    for (const o of frozen) o.matrixAutoUpdate = true;
    const n = frozen.length; frozen.length = 0; return n;
  }
  // active dynamic bodies: what they are (vehicle kind / parked / AI), speed, distance to the player, why awake
  function bodies() {
    const p = game.player.position, out = { dynamic: 0, active: 0, activeSlow: 0, byKind: {}, sample: [] };
    const vehOf = new Map(); for (const v of game.vehicles?.list || []) { try { if (v.body) vehOf.set(v.body.handle, v); } catch (e) { /* */ } }
    W.bodies.forEach((b) => {
      if (!b.isDynamic()) return; out.dynamic++;
      if (b.isSleeping()) return; out.active++;
      const lv = b.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z), t = b.translation(), d = Math.hypot(t.x - p.x, t.z - p.z);
      const v = vehOf.get(b.handle);
      const kind = v ? 'veh:' + (v === game.player.state.vehicle ? 'player' : v.parked ? 'parked' : v.ai || v.driver ? 'ai' : (v.state || v.mode || 'other')) : 'other:' + (JSON.stringify(b.userData || '').slice(0, 30));
      out.byKind[kind] = (out.byKind[kind] || 0) + 1;
      if (sp < 0.05) out.activeSlow++;
      if (out.sample.length < 14) out.sample.push({ kind, sp: +sp.toFixed(3), d: Math.round(d), cols: b.numColliders(), ccd: b.isCcdEnabled?.() });
    });
    return out;
  }
  // instanced meshes drawn this frame: instance-count histogram and the biggest groups of small-count draws
  function instCensus() {
    const cam = game.camera, fr = new THREE.Frustum(), m = new THREE.Matrix4();
    cam.updateMatrixWorld(); m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(m);
    const vis = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
    const hist = { '0': 0, '1': 0, '2-4': 0, '5-16': 0, '17-64': 0, '65+': 0 }, byName = {}; let n = 0, plain = 0, plainTri = 0;
    game.scene.traverse((o) => {
      if (!o.isMesh || !vis(o) || !o.layers.test(cam.layers)) return;
      if (o.frustumCulled) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); const sp = o.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(sp)) return; } else if (!fr.intersectsObject(o)) return; }
      if (!o.isInstancedMesh) { plain++; plainTri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position?.count || 0) / 3; return; }
      n++; const c = o.count;
      hist[c === 0 ? '0' : c === 1 ? '1' : c <= 4 ? '2-4' : c <= 16 ? '5-16' : c <= 64 ? '17-64' : '65+']++;
      if (c <= 4) { const k = ((o.name || o.parent?.name || '?') + ' | ' + (Array.isArray(o.material) ? 'multi' : o.material?.name || o.material?.type)).replace(/[0-9]+/g, '#').slice(0, 70); byName[k] = (byName[k] || 0) + 1; }
    });
    return { instancedInView: n, hist, plainInView: plain, plainTriK: Math.round(plainTri / 1000), smallTop: Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 25) };
  }
  window.__r2q = { colliders, kccBlame, stream, programs, movers, freeze, bodies, instCensus };
  return 'probe installed';
})()

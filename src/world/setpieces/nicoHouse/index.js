// Nico's house: a weathered Keys stilt house on the water (track: nico-house). Top-priority set piece of V2.
//
//   const house = await buildNicoHouse(THREE, opts)
//   house = { group, colliders, interact, lights, update(dt, env), anchors, loaded, stats, plan, setTime(h) }
//
// Pure builder: needs only THREE (and three/addons). House-local meters, +X east, +Z south (street side), yard grade y = 0,
// water at y = opts.seaY (default -1.0) on the north and east sides. Place `group` in the world; colliders, interaction
// points, lights and anchors are all in the same house-local frame (use group.matrixWorld to convert).
//   colliders: [{ shape:'box'|'cyl', p:[x,y,z], h:[hx,hy,hz] | r,hh, q:[x,y,z,w], tag, id?, enabled }]   (enabled may change: doors)
//   interact:  [{ id, kind, label | label(), pos: Vector3, radius, use(env) }]   env = { game?, emit(name, data), notify(text) }
//   lights:    [{ id, pos:[x,y,z], color, intensity, range, on: bool }]          (on changes with switches and time of day)
//   anchors:   { spawn, bed, wardrobe, dock, carport, truck, bike, kayak, skiff, ... } each { pos: Vector3, heading }
//   update(dt, env): env = { timeOfDay, camera?: Vector3 in house-local space, game? }
// Parts live in ./parts/*.js; each exports `order` and `build(ctx)` and is picked up automatically.
import { createKit, createContext } from './kit.js';
import { PLAN, WALLS, PARTITIONS } from './plan.js';

const partMods = import.meta.glob('./parts/*.js', { eager: true });

export async function buildNicoHouse(THREE, opts = {}) {
  const plan = { ...PLAN, seaY: opts.seaY ?? PLAN.seaY, dock: opts.dock ?? PLAN.dock, WALLS, PARTITIONS }; // dock: placed on the real waterline by nicoHouse.v2.js
  const kit = createKit(THREE, { ...opts, seaY: plan.seaY });
  opts = { ...opts, residentName: opts.residentName ?? 'N. Marrero' };
  const ctx = createContext(THREE, kit, plan, opts);
  ctx.time = opts.timeOfDay ?? 9;
  const parts = Object.entries(partMods).map(([k, m]) => ({ name: k.replace(/^.*\/|\.js$/g, ''), order: m.order ?? 100, build: m.build })).filter((p) => typeof p.build === 'function')
    .filter((p) => !opts.only || opts.only.includes(p.name)).filter((p) => !opts.skip || !opts.skip.includes(p.name))
    .sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : 1));
  const t0 = performance.now(), partMs = {};
  for (const p of parts) {
    const t1 = performance.now();
    try { await p.build(ctx); } catch (e) { console.error(`[nicoHouse] part "${p.name}" failed`, e); (ctx.stats.failed ||= []).push(p.name); }
    partMs[p.name] = Math.round(performance.now() - t1);
  }
  const count = { ext: ctx.ext.count(), int: ctx.int.count(), detail: ctx.detail.count() };
  ctx.ext.build(ctx.groups.ext); ctx.int.build(ctx.groups.int); ctx.detail.build(ctx.groups.detail); ctx.site.build(ctx.groups.site);
  if (opts.shell !== false) { buildShell(ctx); ctx.groups.shell.visible = false; }
  const roomProxy = buildRoomProxy(ctx);   // what the windows show while the interior is not drawn
  // camera occluder (perf pass): the game's camera ray tests this house every frame (playtest P2 roofs). Testing 1.2M
  // triangles cost about 16 ms a frame at the spawn; a 200-triangle hull of walls, roofs and decks answers the same
  // question. The hull is never drawn (material.visible = false: no draw call); every other mesh skips raycasts.
  const occluder = buildOccluder(ctx);
  const noRay = () => {};
  const muteRaycasts = () => ctx.group.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o !== occluder && o.raycast !== noRay) o.raycast = noRay; });
  muteRaycasts();
  ctx.stats.parts = partMs; ctx.stats.buildMs = Math.round(performance.now() - t0); ctx.stats.batched = count;

  // ---- importance LOD (perf pass, track: houses) ----
  // Every mesh of the interior, detail and dynamic groups gets its own cull distance from its size and its triangle density:
  // a lone small object fades at ~70x its radius, a batch of fine detail (nails, screws, weeds, shells) at ~2500x its mean
  // triangle edge, clamped to [14, 200] m. Interior meshes and small detail never cast sun shadows (the walls and roof do).
  // GLTF props arrive late, so new meshes are measured as they appear.
  const lodK = { r: opts.lodRadiusK ?? 48, e: opts.lodEdgeK ?? 1700, min: opts.lodMin ?? 10, max: opts.lodMax ?? 200 };
  const lodList = [], _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _c = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
  const lodStats = { meshes: 0, shadowOff: 0, culled: 0 };
  const measure = (o, grp) => {
    const g = o.geometry; if (!g?.attributes?.position) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    let bs = g.boundingSphere; if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); bs = o.boundingSphere; }
    const p = g.attributes.position, ix = g.index, nT = (ix ? ix.count : p.count) / 3, step = Math.max(1, Math.floor(nT / 4000));
    let area = 0, n = 0;
    for (let t = 0; t < nT; t += step) { const i0 = ix ? ix.getX(t * 3) : t * 3, i1 = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, i2 = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
      _a.fromBufferAttribute(p, i0); _b.fromBufferAttribute(p, i1); _d.fromBufferAttribute(p, i2); area += _b.sub(_a).cross(_d.sub(_a)).length() / 2; n++; }
    o.updateWorldMatrix(true, false); _m.multiplyMatrices(_inv, o.matrixWorld);
    const sc = Math.cbrt(Math.abs(_m.determinant())) || 1, edge = Math.sqrt((2 * area / Math.max(1, n))) * sc, rad = bs.radius * sc;
    const d = Math.max(lodK.min, Math.min(lodK.max, Math.min(rad * lodK.r, edge * lodK.e)));
    const c = bs.center.clone().applyMatrix4(_m);
    o.userData.nhLod = { d, c };
    if (grp === 'int' || (grp !== 'ext' && d < 45)) { if (o.castShadow) lodStats.shadowOff++; o.castShadow = false; }
    lodList.push(o); lodStats.meshes++;
  };
  const scanLod = () => {
    ctx.group.updateWorldMatrix(true, false); _inv.copy(ctx.group.matrixWorld).invert();
    for (const k of ['int', 'detail', 'dyn']) ctx.groups[k].traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && !o.userData.nhLod) measure(o, k); });
    muteRaycasts();   // late GLTF props too
    // exterior: only the plant and weed batches (the shell batches stay up to the far cutoff), never closer than 60 m
    ctx.groups.ext.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && !o.userData.nhLod && /plants|weed|grass/.test(o.name)) { measure(o, 'ext'); o.userData.nhLod.d = Math.max(45, o.userData.nhLod.d); } });
  };
  let lodT = 0, lodScanT = 0;
  const env0 = { timeOfDay: ctx.time, camera: null, game: null };
  const house = {
    group: ctx.group, stairs: ctx.stairs || [], colliders: ctx.colliders, interact: ctx.interact, lights: ctx.lights, anchors: ctx.anchors, plan, stats: ctx.stats, kit, lodStats,
    // resolves when every texture and model has arrived (the house is already usable before that)
    loaded: Promise.all([...kit.pending, ...ctx.async]).then(() => true),
    update(dt, env = env0) {
      ctx.time = env.timeOfDay ?? ctx.time;
      // distance LOD: interior and small clutter are hidden when the camera is far away
      if (env.camera) {
        const d = Math.hypot(env.camera.x, env.camera.z - 2);
        // far shell (perf pass): beyond ~55 m the full exterior (64 material batches) swaps for a 6-batch shell; site, palms and plants stay
        const shell = opts.shell !== false && (ctx.groups.shell.visible ? d > (opts.shellDist ?? 55) - 6 : d > (opts.shellDist ?? 55));
        if (shell !== ctx.groups.shell.visible) { ctx.groups.shell.visible = shell; for (const o of ctx.groups.ext.children) if (!/^vegPalm|^plants/.test(o.name)) o.visible = !shell; }
        if (shell) { ctx.groups.int.visible = ctx.groups.detail.visible = ctx.groups.dyn.visible = false; if (roomProxy) roomProxy.visible = false; }
        else {
        // the interior (45 batches, 0.24M tris) only when the camera can really look in: inside, on the porch / decks, or
        // within a few meters of a window; otherwise each window shows a lit room card at the same depth
        const cx = env.camera.x, cz = env.camera.z, cy = env.camera.y ?? 1.7, P = plan;
        const near = (r, pad) => cx > r.x0 - pad && cx < r.x1 + pad && cz > r.z0 - pad && cz < r.z1 + pad;
        const lookIn = near(P.A, 1.2) || near(P.B, 1.2) || ((near(P.porch, 1.5) || near(P.deckW, 1.5) || near(P.deckN, 1.5)) && cy > P.F - 1.2) || (opts.intNear != null && d < opts.intNear);
        // keys pass (draw calls): from the decks the interior only draws while the camera faces the house (the deck views of the
        // street looked away from it and still paid ~270 draw calls for the rooms behind the camera)
        const facing = !env.camDir || (env.camDir.x * (-1.2 - cx) + env.camDir.z * (0.6 - cz)) > -0.35 * Math.hypot(-1.2 - cx, 0.6 - cz) || near(P.A, 0.2) || near(P.B, 0.2);
        ctx.groups.int.visible = lookIn && facing && d < (opts.intDist ?? 70); if (roomProxy) roomProxy.visible = !ctx.groups.int.visible; ctx.groups.detail.visible = d < (opts.detailDist ?? 110); ctx.groups.dyn.visible = d < (opts.detailDist ?? 110);
        if (opts.lod !== false && (lodScanT -= dt) <= 0) { lodScanT = 2; scanLod(); }
        if (opts.lod !== false && (lodT -= dt) <= 0 && d < (opts.detailDist ?? 110) + 10) {
          lodT = 0.2; let cul = 0; const cy = env.camera.y ?? 1.7;
          for (const o of lodList) { const L = o.userData.nhLod, v = Math.hypot(env.camera.x - L.c.x, cy - L.c.y, env.camera.z - L.c.z) < L.d; if (o.visible !== v) o.visible = v; if (!v) cul++; }
          lodStats.culled = cul;
        }
        }
      }
      for (const u of ctx.updaters) { try { u(dt, env, ctx); } catch (e) { if (!u._err) { u._err = true; console.error('[nicoHouse] updater failed', e); } } }
    },
    dispose() { ctx.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const m of kit.materials.values()) { for (const k of ['map', 'normalMap', 'roughnessMap', 'bumpMap', 'emissiveMap']) m[k]?.dispose?.(); m.dispose(); } },
  };
  return house;
}
export { PLAN };

// Far shell of the house (perf pass, track: houses): massing, siding color, window and shutter cards, tin roofs, decks with
// rails, piles and stairs, from the same plan. About 6 draw calls in place of the 64 exterior batches past ~55 m.
function buildShell(ctx) {
  const { THREE, kit, plan: P } = ctx, M = kit.M, B = kit.batch('shell'), mat = kit.mat, C = P.colors, F = P.F, top = F + P.wallH;
  const PAINT = mat.paint({ peel: 'a', fade: 0.28 }), TIN = mat.tin(), WOOD = mat.wood(), GL = mat.plasticGloss();
  const box = (m, sx, sy, sz, x, y, z, o = {}, rx = 0, ry = 0, rz = 0) => B.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), o);
  for (const x of P.pileXs) for (const z of P.pileZs) box(WOOD, 0.3, F, 0.3, x, F / 2 - 0.3, z, { color: C.pile, wear: 0.5 });
  for (const r of [P.A, P.B, P.porch, P.deckW, P.deckN]) box(WOOD, r.x1 - r.x0, 0.3, r.z1 - r.z0, (r.x0 + r.x1) / 2, F - 0.15, (r.z0 + r.z1) / 2, { color: C.deck, wear: 0.4 });
  for (const r of [P.A, P.B]) box(PAINT, r.x1 - r.x0, top - F + 0.4, r.z1 - r.z0, (r.x0 + r.x1) / 2, (F + top + 0.4) / 2, (r.z0 + r.z1) / 2, { color: C.body, wear: 0.45 });
  // windows, doors and shutters as cards on the outside faces
  for (const w of P.WALLS) {
    const [ax, az] = w.a, [bx, bz] = w.b, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux, ry = Math.atan2(-uz, ux);
    for (const o of w.openings) {
      const x = ax + ux * o.u + nx * 0.03, z = az + uz * o.u + nz * 0.03, yc = F + o.sill + o.h / 2;
      if (o.kind === 'vent') { box(PAINT, o.w, o.h, 0.04, x, yc, z, { color: C.trim, wear: 0.3 }, 0, ry); continue; }
      box(PAINT, o.w + 0.16, o.h + 0.16, 0.03, x, yc, z, { color: C.trim, wear: 0.3 }, 0, ry);
      box(o.kind === 'door' && !o.glazed ? PAINT : GL, o.w, o.h, 0.03, x + nx * 0.015, yc, z + nz * 0.015, { color: o.kind === 'door' && !o.glazed ? C.accent : 0x1c2426 }, 0, ry);
      if (o.shutter && o.shutter !== 'none') for (const sg of [-1, 1]) box(PAINT, o.w * 0.5, o.h + 0.05, 0.03, x + ux * sg * (o.w * 0.75 + 0.06), yc, z + uz * sg * (o.w * 0.75 + 0.06), { color: C.accent, wear: 0.5 }, 0, ry);
    }
    if (w.gable && (w.id === 'B_south' || w.id === 'B_north')) { const half = (P.B.x1 - P.B.x0) / 2, rise = P.ridgeB.y - top - 0.05, tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(L, 0); tri.lineTo(w.gable.u, rise); tri.lineTo(0, 0);
      B.geo(PAINT, new THREE.ShapeGeometry(tri), M(ax + nx * 0.01, top + 0.4, az + nz * 0.01, 0, ry), { color: C.body, wear: 0.45, uvMul: [1 / 0.75, 1 / 0.75] }); void half; }
  }
  // roofs: low shed over the main block, gable over the wing, porch roof
  const sh = P.shed, dz = sh.z1 - sh.z0, a = Math.atan(sh.pitch);
  box(TIN, sh.x1 - sh.x0, 0.08, dz / Math.cos(a), (sh.x0 + sh.x1) / 2, sh.y0 - dz / 2 * sh.pitch, (sh.z0 + sh.z1) / 2, { color: 0xb8bcc0, wear: 0.6 }, a);
  const hw = (P.B.x1 - P.B.x0) / 2 + P.eaveOv, ab = Math.atan(P.pitchB), zl = P.B.z1 - P.B.z0 + 2 * P.rakeOv;
  for (const sg of [-1, 1]) box(TIN, hw / Math.cos(ab), 0.08, zl, P.ridgeB.x + sg * hw / 2, P.ridgeB.y - hw / 2 * P.pitchB, (P.B.z0 + P.B.z1) / 2, { color: 0xb8bcc0, wear: 0.6 }, 0, 0, -sg * ab);
  const pr = P.porchRoof, pd = pr.zOut - P.A.z1, ap = Math.atan(pr.pitch);
  box(TIN, pr.x1 - pr.x0, 0.08, pd / Math.cos(ap), (pr.x0 + pr.x1) / 2, pr.yWall - pd / 2 * pr.pitch, (P.A.z1 + pr.zOut) / 2, { color: 0xb8bcc0, wear: 0.6 }, ap);
  for (const x of [pr.x0 + 0.1, (pr.x0 + pr.x1) / 2, pr.x1 - 0.1]) box(PAINT, 0.12, pr.yWall - F - 0.3, 0.12, x, (F + pr.yWall - 0.3) / 2, P.porch.z1 - 0.1, { color: C.trim, wear: 0.3 });
  // deck rails (top and bottom rails, posts) along the open deck edges
  const rail = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const y of [F + 1.04, F + 0.12]) box(PAINT, L, 0.07, 0.07, cx, y, cz, { color: C.trim, wear: 0.4 }, 0, ry);
    for (let t = 0; t <= L; t += 1.4) box(PAINT, 0.09, 1.07, 0.09, x0 + (x1 - x0) * t / L, F + 0.53, z0 + (z1 - z0) * t / L, { color: C.trim, wear: 0.4 });
    box(PAINT, L, 0.85, 0.01, cx, F + 0.56, cz, { color: kit.mul(C.trim, 0.55), wear: 0.4 }, 0, ry); };
  rail(P.deckW.x0, P.deckN.z0, P.deckW.x0, P.deckW.z1); rail(P.deckN.x0, P.deckN.z0, P.deckN.x1, P.deckN.z0); rail(P.deckW.x0, P.deckW.z1, P.deckW.x1, P.deckW.z1); rail(P.porch.x0, P.porch.z1, P.porch.x1, P.porch.z1);
  // west stair (two flights) as stringer slabs
  const ld = P.stairW.landing;
  B.strut(WOOD, [P.deckW.x0, F - 0.1, (ld.z0 + ld.z1) / 2], [ld.x1, ld.y, (ld.z0 + ld.z1) / 2], 1.2, 0.12, { color: C.deck, roll: Math.PI / 2 });
  B.strut(WOOD, [(ld.x0 + ld.x1) / 2, ld.y, ld.z1], [(ld.x0 + ld.x1) / 2, 0.05, ld.z1 + ld.y / P.rise * P.run], 1.2, 0.12, { color: C.deck, roll: Math.PI / 2 });
  box(WOOD, ld.x1 - ld.x0, 0.1, ld.z1 - ld.z0, (ld.x0 + ld.x1) / 2, ld.y, (ld.z0 + ld.z1) / 2, { color: C.deck });
  B.build(ctx.groups.shell);
}

// Room cards behind every window and glazed door (perf pass): one merged mesh in place of the interior while the camera
// is outside. A dim, warm room tone with a lighter band (curtain / blind) and a floor line; at night it glows when the
// house lights are on (uLit follows the lights). Sits 0.45 m behind the glass, so parallax still reads at gameplay range.
function buildRoomProxy(ctx) {
  const { THREE, kit, plan: P } = ctx, B = kit.batch('rooms'), T = P.wallT, uLit = { value: 0 };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }); m.name = 'nh:roomProxy'; m.userData.uvScale = 0;
  m.onBeforeCompile = (sh) => { sh.uniforms.uLit = uLit; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLit;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.8, 0.55 ) * uLit * 1.4;'); };
  m.customProgramCacheKey = () => 'nh:roomProxy';
  let n = 0;
  for (const o of Object.values(ctx.openings || {})) {
    if (o.partition || !o.wall?.wm || !/window|slider|door/.test(o.kind) || o.frosted) continue;
    const w = o.wall, yc = (o.y0 + o.y1) / 2, h = o.y1 - o.y0;
    B.box(m, o.w + 0.4, h + 0.4, 0.02, w.wm(o.u, yc, -T - 0.45), { color: [0.16, 0.13, 0.1] });
    B.box(m, o.w + 0.3, h * 0.35, 0.02, w.wm(o.u, o.y1 - h * 0.2, -T - 0.42), { color: [0.42, 0.36, 0.27] });     // curtain / blind band
    B.box(m, o.w + 0.4, 0.1, 0.5, w.wm(o.u, P.F + 0.02, -T - 0.2), { color: [0.2, 0.14, 0.09] });                   // floor edge
    n++;
  }
  if (!n) return null;
  const g = new THREE.Group(); g.name = 'nh_roomProxy'; B.build(g, { cast: false }); ctx.group.add(g);
  ctx.updaters.push(() => { uLit.value = (ctx.lights || []).some((l) => l.on) ? 1 : 0; });
  return g;
}

function buildOccluder(ctx) {
  const { THREE, kit, plan: P } = ctx, M = kit.M, B = kit.batch('occ'), F = P.F, top = F + P.wallH;
  const m = new THREE.MeshBasicMaterial({ visible: false }); m.name = 'nh:occluder'; m.userData.uvScale = 1;
  const box = (sx, sy, sz, x, y, z, rx = 0, rz = 0) => B.box(m, sx, sy, sz, M(x, y, z, rx, 0, rz), {});
  for (const r of [P.A, P.B]) box(r.x1 - r.x0, top - F + 0.4, r.z1 - r.z0, (r.x0 + r.x1) / 2, (F + top + 0.4) / 2, (r.z0 + r.z1) / 2);
  box(7.5, 0.3, 3.55, 4.35, F - 0.15, 6.18); box(1.5, 0.3, 10.8, 7.35, F - 0.15, -1.0);   // east wing front deck and its east run (12_frontdeck)
  for (const r of [P.porch, P.deckW, P.deckN]) box(r.x1 - r.x0, 0.3, r.z1 - r.z0, (r.x0 + r.x1) / 2, F - 0.15, (r.z0 + r.z1) / 2);
  const sh = P.shed, dz = sh.z1 - sh.z0, a = Math.atan(sh.pitch); box(sh.x1 - sh.x0, 0.12, dz / Math.cos(a), (sh.x0 + sh.x1) / 2, sh.y0 - dz / 2 * sh.pitch, (sh.z0 + sh.z1) / 2, a);
  const hw = (P.B.x1 - P.B.x0) / 2 + P.eaveOv, ab = Math.atan(P.pitchB), zl = P.B.z1 - P.B.z0 + 2 * P.rakeOv;
  for (const sg of [-1, 1]) box(hw / Math.cos(ab), 0.12, zl, P.ridgeB.x + sg * hw / 2, P.ridgeB.y - hw / 2 * P.pitchB, (P.B.z0 + P.B.z1) / 2, 0, -sg * ab);
  const pr = P.porchRoof, pd = pr.zOut - P.A.z1, ap = Math.atan(pr.pitch); box(pr.x1 - pr.x0, 0.12, pd / Math.cos(ap), (pr.x0 + pr.x1) / 2, pr.yWall - pd / 2 * pr.pitch, (P.A.z1 + pr.zOut) / 2, ap);
  const out = B.build(ctx.group, { cast: false, receive: false })[0]; if (out) { out.name = 'nh_occluder'; out.frustumCulled = false; }
  return out;
}

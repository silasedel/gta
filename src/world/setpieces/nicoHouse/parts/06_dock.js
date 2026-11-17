// Nico's house, part 06 (track: keys): the dock, built from the user's modular weathered pier kit
// (Models/Docks/Dock 6 -> public/assets/models/docks/pier_kit.glb, tools/v2/keys/build_models.sh). It starts on the sand at the
// foot of the bay-side stair with a short plank ramp (no step: the boards meet the ground, sand banked over their ends), runs
// out over the beach to the real waterline (measured by nicoHouse.v2.js) and past it on piles that reach down to the sea bed
// (the kit's posts are extended under water with marine-growth timber), ends in a T-head with the kit's hoist frame, cleats,
// a ladder and a ring buoy, and has two boats moored alongside on lines (the user's worn rowboat and small fishing boat),
// bobbing on the swell. Colliders: one box per section top, a sloped ramp, the T-head, the piles; the player walks on smoothly.
import { loadKeysModels } from '../models.js';
export const order = 6;

export function build(ctx) {
  const { THREE, kit, mat, col, plan: P } = ctx, Dk = P.dock, M = kit.M, PI = Math.PI, r = kit.rng(606);
  if (!Dk?.kit) return;   // only when nicoHouse.v2.js measured the waterline (else part 05 keeps the old plank dock)
  const B = ctx.site, D = ctx.detail, sea = P.seaY, y = Dk.y, X = Dk.x, W = 2.45, ground = ctx.opts.groundAt || (() => 0);
  const lib = loadKeysModels(THREE, ['pier_kit', 'rowboat', 'skiff', 'lifebuoy', 'rocks']);
  // ---- layout: sections from the land end (z1) out to z0, chosen in a fixed order (no two neighbors alike) ----
  const ORDER = ['modular_wooden_pier_section_02'];   // one kit piece, flipped / tinted for variety (03 / 04 dropped out of the draw in tests)
  const LEN = { modular_wooden_pier_section_02: 3.39, modular_wooden_pier_section_03: 3.39, modular_wooden_pier_section_04: 3.16 };
  const secs = []; let z = Dk.z1; for (let i = 0; z > Dk.z0 + 1; i++) { const n = ORDER[i % ORDER.length], L = LEN[n] - 0.04; secs.push({ n, zc: z - L / 2, L, flip: i % 2 === 1 }); z -= L; }
  const zEnd = z, headZ = zEnd - 1.15;
  // colliders (sync): deck tops, ramp, T-head
  col.box(X, y - 0.1, (Dk.z1 + zEnd) / 2, W, 0.2, Dk.z1 - zEnd, { tag: 'dock', surface: 'wood' });
  // ---- landing (lead review, Nov 17): the dock starts AT the waterline on a short concrete seawall with a limestone riprap edge
  // along the shore (ref 2_back_dock), reached from the sand by three timber steps; nothing of it lies on the beach ----
  const WD = mat.wood({ marine: true }), ST = mat.steel(), CONC = mat.concrete({ marine: true }), Ls = Dk.z1, wallZ = Ls + 0.35;
  for (const [x0, x1] of [[X - 3.2, X + 3.2]]) { B.box(CONC, x1 - x0, 1.9, 0.45, M((x0 + x1) / 2, y - 0.1 - 0.95, wallZ), { color: kit.vary(0xc4bfb0, r, 0.05), wear: 1, bevel: 0.015, rand: r }); B.box(CONC, x1 - x0 + 0.04, 0.14, 0.62, M((x0 + x1) / 2, y - 0.12, wallZ), { color: kit.vary(0xd2ccbd, r, 0.04), wear: 0.8, bevel: 0.02, rand: r }); col.box((x0 + x1) / 2, y - 0.6, wallZ, x1 - x0, 1.2, 0.62, { tag: 'seawall' }); }
  // beach sand banked against the landing's land face and around the step stringers (no exposed concrete face, no floating step)
  { const g = new THREE.SphereGeometry(1, 28, 8, 0, PI * 2, 0, PI / 2); g.scale(3.3, y - 0.08, 1.25); const pp = g.attributes.position; for (let i = 0; i < pp.count; i++) { const a = Math.atan2(pp.getZ(i), pp.getX(i)); pp.setX(i, pp.getX(i) * (1 + 0.12 * Math.sin(a * 3 + 1))); } g.computeVertexNormals();
    B.geo(mat.pbr('shell_floor_01', { rep: 2.6, gain: 1.5, grunge: true }), g, M(X, -0.03, wallZ + 0.45), { color: [0.9, 0.8, 0.64], uvMul: [2.6, 1.0] }); g.dispose(); }   // same scan + tone as the yard's beach edge
  const stepRise = (y - 0.02) / 2, stepRun = 0.36;
  for (let k = 0; k < 1; k++) { const top = y - stepRise * (k + 1) + 0.02, zz = wallZ + 0.31 + stepRun * (k + 0.5); for (let b = 0; b < 2; b++) B.box(WD, W - 0.3, 0.045, 0.15, M(X, top - 0.022, zz - 0.08 + b * 0.16), { grain: 0, color: kit.vary(0x9a9388, r, 0.1), wear: 0.6, bevel: 0.004, rand: r });
    for (const s2 of [-1, 1]) B.box(WD, 0.06, top + 0.05, 0.3, M(X + s2 * (W / 2 - 0.2), (top - 0.05) / 2, zz), { grain: 1, color: 0x6f675c, wear: 0.8 }); }
  { const L = stepRun * 2 + 0.6, a = Math.atan2(y - 0.02, L); col.box(X, (y + 0.02) / 2 - 0.08, wallZ + 0.31 + L / 2, W - 0.3, 0.16, Math.hypot(L, y), { rx: a, tag: 'dock', surface: 'wood' }); }   // smooth walk-up
  // riprap: pale limestone blocks along the waterline of Nico's frontage (both sides of the landing), half in the water
  const shore = []; const wAt = ctx.opts.waterAt;
  if (wAt) for (let x = -20; x <= 12; x += 1.1) { if (Math.abs(x - X) < 3.4) continue; let zz = null; for (let z2 = -6; z2 > -60; z2 -= 0.5) if (wAt(x, z2)) { zz = z2; break; } if (zz !== null) shore.push([x, zz]); }
  ctx.anchors.shore = shore;   // nicoHouse.v2.js plants mangroves at the riprap ends
  const RIP = shore.flatMap(([x, zz], i) => [[x + (r() - 0.5) * 0.5, zz + 0.4 + (r() - 0.5) * 0.4, 0.34 + r() * 0.2], [x + 0.55 + (r() - 0.5) * 0.4, zz - 0.5 + (r() - 0.5) * 0.4, 0.3 + r() * 0.18], ...(i % 2 ? [[x + (r() - 0.5) * 0.6, zz + 1.3 + r() * 0.4, 0.22 + r() * 0.12]] : [])]);
  for (const [x, zz, sc] of RIP) col.box(x, sc * 0.5 - 0.25, zz, sc * 1.6, sc * 1.2, sc * 1.6, { tag: 'rock' });
  // chain-link fences down the side lot lines to the water (ref 2_back_dock)
  { const chain = kit.canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(170,174,170,1)'; g.lineWidth = 3; for (let k = -w; k < w * 2; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); } }, { srgb: true });
    chain.wrapS = chain.wrapT = THREE.RepeatWrapping;
    const MESH = new THREE.MeshStandardMaterial({ map: chain, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5, opacity: 0.85 }); MESH.name = 'keys:chainlink'; MESH.userData.uvScale = 1;   // blended, mip-mapped: no alpha-test shimmer
    const fence = (fx, za, zb) => { const len = Math.abs(zb - za), zc = (za + zb) / 2, n = Math.max(1, Math.round(len / 2.4));
      for (let k = 0; k <= n; k++) { const zz = za + (zb - za) * k / n; B.cyl(ST, 0.03, 0.03, 1.32, M(fx, 0.64, zz), { seg: 8, color: 0xaeb2ae }); }
      B.cyl(ST, 0.02, 0.02, len, M(fx, 1.25, zc, Math.PI / 2, 0, 0), { seg: 6, color: 0xaeb2ae });
      const g = new THREE.PlaneGeometry(len, 1.2); g.rotateY(Math.PI / 2); B.geo(MESH, g, M(fx, 0.62, zc), { uvMul: [len / 0.75, 1.2 / 0.75] }); g.dispose();
      col.box(fx, 0.65, zc, 0.06, 1.3, len, { tag: 'fence' }); };
    const edgeAt = (x) => { if (!wAt) return -20; for (let z2 = -6; z2 > -60; z2 -= 0.5) if (wAt(x, z2)) return z2 + 1.0; return -20; };
    fence(-23.6, -4.0, Math.max(edgeAt(-23.6), Dk.zw - 1.5)); fence(11.2, -4.0, Math.max(edgeAt(11.2), Dk.zw - 1.5)); }   // the lot lines end at the bay edge by the dock
  ctx.async.push(lib.ready.then(() => { const I = lib.instancer('keysRiprap'), names = lib.names('rocks').sort();
    RIP.forEach(([x, zz, sc], i) => I.add('rocks', names[i % 3], M(x, -0.28, zz, (r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3, sc, sc * 0.75, sc), { tint: [0.98 + r() * 0.06, 0.96 + r() * 0.06, 0.9 + r() * 0.06] }));
    for (const m of I.build(ctx.groups.site)) m.raycast = () => {}; }));
  // ---- piles under water: the kit posts end about 3.3 m below the deck; marine timber carries them to the sea bed ----
  const MW = mat.wood({ marine: true });
  const pileAt = (px, pz, top) => { const gb = Math.min(ground(px, pz), sea - 0.4); if (top - gb < 0.2) return; const h = top - gb + 0.4; B.cyl(MW, 0.12, 0.135, h, M(px, top - h / 2, pz, (r() - 0.5) * 0.02, r() * 6, 0), { seg: 10, hseg: 3, color: kit.vary(0x6f665a, r, 0.1), wear: 1 }); col.cyl(px, (top + gb) / 2, pz, 0.14, top - gb, { tag: 'pile' }); };
  for (const s of secs) for (const dx of [-1.08, 1.08]) for (const dz of [-s.L / 2 + 0.15, s.L / 2 - 0.15]) { const px = X + dx, pz = s.zc + dz, gb = ground(px, pz); if (gb < sea - 0.3) col.cyl(px, (y - 3.2 + gb) / 2, pz, 0.14, Math.max(0.2, y - 3.2 - gb), { tag: 'pile' }); }   // visuals: from the kit's own post feet (below)
  // ---- T-head deck (own boards on the kit's look: the planks piece is too short for it) ----
  for (let zz = headZ - 1.1; zz < headZ + 1.12; zz += 0.152) B.box(WD, 7.1 + (r() - 0.5) * 0.04, 0.045, 0.145, M(X + (r() - 0.5) * 0.03, y - 0.022 + (r() - 0.5) * 0.004, zz, 0, (r() - 0.5) * 0.004, (r() - 0.5) * 0.006), { grain: 0, color: kit.vary(r() < 0.07 ? 0xb49a70 : 0x8f887c, r, 0.12), wear: 0.4 + r() * 0.5, bevel: 0.005, rand: r });
  for (const zz of [headZ - 1.15, headZ + 1.15]) B.box(WD, 7.2, 0.26, 0.08, M(X, y - 0.18, zz), { grain: 0, color: 0x6f675c, wear: 0.8, bevel: 0.006 });
  for (const xx of [X - 3.55, X - 1.2, X + 1.2, X + 3.55]) for (const zz of [headZ - 1.12, headZ + 1.12]) { const top = y + (Math.abs(xx - X) > 3 ? 0.95 + r() * 0.15 : -0.05); pileAt(xx, zz, top); B.cyl(MW, 0.13, 0.13, Math.max(0.1, top - (y - 3.3)), M(xx, (top + y - 3.3) / 2, zz), { seg: 12, color: kit.vary(0x7d7467, r, 0.1), wear: 1 }); }
  // cleats, coiled line, ladder
  const cleat = (cx, cz, ry) => { B.box(ST, 0.26, 0.024, 0.045, M(cx, y + 0.06, cz, 0, ry, 0), { color: 0xa9a59a, bevel: 0.01 }); for (const s of [-1, 1]) B.cyl(ST, 0.015, 0.02, 0.05, M(cx + Math.cos(ry) * s * 0.06, y + 0.025, cz - Math.sin(ry) * s * 0.06), { color: 0xa9a59a, seg: 8 }); };
  const cleats = [[X + W / 2 - 0.12, (Dk.z1 + zEnd) / 2, PI / 2], [X + W / 2 - 0.12, zEnd + 3.0, PI / 2], [X - W / 2 + 0.12, zEnd + 2.0, PI / 2], [X + 3.3, headZ + 0.9, 0], [X - 3.3, headZ - 0.9, 0]];
  for (const [cx, cz, ry] of cleats) cleat(cx, cz, ry);
  for (const s of [-1, 1]) B.box(ST, 0.04, 2.6, 0.04, M(X + 3.62, y - 0.9, headZ + s * 0.22), { color: 0xa9a59a, bevel: 0.008 });
  for (let k = 0; k < 7; k++) B.cyl(ST, 0.016, 0.016, 0.44, M(X + 3.62, y - 0.15 - k * 0.3, headZ, PI / 2, 0, 0), { color: 0xa9a59a, seg: 8 });
  { const pts = []; for (let i = 0; i < 90; i++) { const t = i / 90, a = t * 6.283 * 5, rr = 0.07 + t * 0.2; pts.push([X - 2.6 + Math.cos(a) * rr, y + 0.02 + (i % 18) * 0.0004, headZ + 0.4 + Math.sin(a) * rr]); } D.tube(mat.fabric('wool_boucle', { rep: 0.05 }), pts, 0.011, { seg: 5, color: 0xd8cfae, steps: 150 }); }
  // ---- dock light on a post at the head (on from dusk to dawn) ----
  { const WDp = mat.wood(), lx = X + 3.5, lz = headZ - 1.05; B.cyl(WDp, 0.06, 0.07, 2.7, M(lx, y + 1.35, lz), { seg: 10, color: 0x7d7467, wear: 0.8 }); B.box(ST, 0.5, 0.03, 0.03, M(lx - 0.24, y + 2.62, lz), { color: 0x8c8a82 });
    B.cyl(mat.metalPaint(), 0.16, 0.05, 0.14, M(lx - 0.46, y + 2.56, lz), { color: 0x3f6f5f, seg: 14 }); B.geo(mat.emissive(0xffe2ae, 2.5, 'dock'), new THREE.SphereGeometry(0.045, 10, 8), M(lx - 0.46, y + 2.5, lz), {});
    const lt = ctx.addLight({ id: 'dock_light', pos: [lx - 0.46, y + 2.42, lz], color: 0xffd9a0, intensity: 55, range: 14, on: false }); ctx.updaters.push((dt, env) => { const t = env.timeOfDay ?? 12; lt.on = t < 6.3 || t > 18.4; }); col.cyl(lx, y + 1.35, lz, 0.08, 2.7, { tag: 'post' }); }
  // ---- boats on lines: positions in the water alongside (bobbing in part updaters) ----
  const boats = [
    { k: 'rowboat', x: X + W / 2 + 0.75, z: zEnd + 4.2, h: 0.04, cleat: 1, draft: 0.12 },
    { k: 'skiff', x: X - W / 2 - 1.3, z: zEnd + 3.0, h: PI - 0.05, cleat: 2, draft: 0.32 },
  ];
  ctx.anchors.dock = { pos: new THREE.Vector3(X, y, (Dk.z1 + zEnd) / 2), heading: PI };
  ctx.anchors.skiff = { pos: new THREE.Vector3(boats[1].x, sea, boats[1].z), heading: boats[1].h };
  ctx.anchors.dockHead = { pos: new THREE.Vector3(X, y, headZ), heading: PI };
  // ---- library pieces (async) ----
  ctx.async.push(lib.ready.then(() => {
    const I = lib.instancer('keysDock');
    for (const s of secs) I.add('pier_kit', s.n, M(X, y, s.zc, 0, s.flip ? PI : 0, 0), { tint: [0.96 + r() * 0.08, 0.96 + r() * 0.06, 0.95 + r() * 0.06] });
    I.add('pier_kit', 'modular_wooden_pier_section_05', M(X - 3.3, y, headZ, 0, PI / 2, 0));   // the hoist frame across the head's west wing
    const meshes = I.build(ctx.groups.site); for (const m of meshes) m.raycast = () => {};
    // every kit post foot that ends above the sea bed carries on down in marine-growth timber (same radius, sunk into the bed)
    const PB = kit.batch('dockPiles'); let nExt = 0;
    for (const s of secs) for (const L of lib.legs('pier_kit', s.n, { band: 0.7 })) {
      const lx = s.flip ? -L.x : L.x, lz = s.flip ? -L.z : L.z, px = X + lx, pz = s.zc + lz, top = y + L.y + 0.12, gb = ground(px, pz) - 0.4;
      if (top - gb < 0.25 || gb > sea) continue; const h = top - gb; PB.cyl(MW, Math.max(0.09, L.r * 0.95), Math.max(0.1, L.r * 1.05), h, M(px, top - h / 2, pz), { seg: 10, hseg: 3, color: kit.vary(0x6f665a, r, 0.1), wear: 1 }); nExt++;
    }
    PB.build(ctx.groups.site);
    // boats: their own meshes (they move)
    const dyn = new THREE.Group(); dyn.name = 'keysDockBoats'; ctx.groups.site.add(dyn);
    for (const b of boats) {
      const p = lib.piece(b.k, 'dock'); if (!p) continue; const g = new THREE.Group(); g.position.set(b.x, sea - b.draft, b.z); g.rotation.y = b.h;
      for (const q of p.parts) { const m = new THREE.Mesh(q.geometry, q.material); m.castShadow = false; m.receiveShadow = true; m.raycast = () => {}; g.add(m); }   // on the water: no sun-shadow draw calls
      dyn.add(g); b.g = g; b.ph = r() * 6.28;
      // mooring line: cleat -> bow ring, sagging a little into the water
      const c = cleats[b.cleat], bow = new THREE.Vector3(0, 0.45, (p.box.max.z - 0.25)).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.h).add(g.position);
      const a = [c[0], y + 0.07, c[1]], pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([a[0] + (bow.x - a[0]) * t, a[1] + (bow.y - a[1]) * t - 0.35 * 4 * t * (1 - t), a[2] + (bow.z - a[2]) * t]); }
      const tb = kit.batch('line'); tb.tube(mat.fabric('wool_boucle', { rep: 0.05 }), pts, 0.012, { seg: 5, color: 0xcfc4a2 }); tb.build(dyn, { cast: false });
    }
    { const p = lib.piece('lifebuoy', 'dock'); if (p) for (const q of p.parts) { const m = new THREE.Mesh(q.geometry, q.material); m.position.set(X + 3.55, y + 0.35, headZ + 1.25); m.rotation.y = 0; m.castShadow = true; m.raycast = () => {}; ctx.groups.site.add(m); } }
    ctx.updaters.push((dt, env) => { const t = performance.now() / 1000; for (const b of boats) if (b.g) { b.g.position.y = sea - b.draft + Math.sin(t * 0.9 + b.ph) * 0.035; b.g.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.025; b.g.rotation.x = Math.sin(t * 0.55 + b.ph * 2) * 0.015; } });
    ctx.stats.keysDock = { sections: secs.length, instances: I.count(), zEnd: +zEnd.toFixed(1), pileExt: nExt };
  }));
}

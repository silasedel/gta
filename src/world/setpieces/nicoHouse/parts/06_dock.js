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
  const lib = loadKeysModels(THREE, ['pier_kit', 'rowboat', 'skiff', 'lifebuoy']);
  // ---- layout: sections from the land end (z1) out to z0, chosen in a fixed order (no two neighbors alike) ----
  const ORDER = ['modular_wooden_pier_section_02', 'modular_wooden_pier_section_03', 'modular_wooden_pier_section_04', 'modular_wooden_pier_section_03', 'modular_wooden_pier_section_02', 'modular_wooden_pier_section_04'];
  const LEN = { modular_wooden_pier_section_02: 3.39, modular_wooden_pier_section_03: 3.39, modular_wooden_pier_section_04: 3.16 };
  const secs = []; let z = Dk.z1; for (let i = 0; z > Dk.z0 + 1; i++) { const n = ORDER[i % ORDER.length], L = LEN[n] - 0.04; secs.push({ n, zc: z - L / 2, L, flip: i % 3 === 1 }); z -= L; }
  const zEnd = z, headZ = zEnd - 1.15;
  // colliders (sync): deck tops, ramp, T-head
  col.box(X, y - 0.1, (Dk.z1 + zEnd) / 2, W, 0.2, Dk.z1 - zEnd, { tag: 'dock', surface: 'wood' });
  const rampL = 2.3, rampA = Math.atan2(y - 0.02, rampL);
  col.box(X, (y + 0.02) / 2 - 0.08, Dk.z1 + rampL / 2, W, 0.16, Math.hypot(rampL, y), { rx: -rampA, tag: 'dock', surface: 'wood' });
  col.box(X, y - 0.1, headZ, 7.2, 0.2, 2.3, { tag: 'dock', surface: 'wood' });
  // ---- ramp: weathered boards from the sand up to the first section, sand banked over the low end ----
  const WD = mat.wood({ marine: true });
  for (let k = 0; k < 15; k++) { const t = (k + 0.5) / 15, zz = Dk.z1 + rampL * t, yy = y - (y - 0.02) * t; B.box(WD, W - 0.1 + (r() - 0.5) * 0.04, 0.038, 0.145, M(X + (r() - 0.5) * 0.02, yy - 0.02, zz, -rampA, (r() - 0.5) * 0.01, 0), { grain: 0, color: kit.vary(0x9a9388, r, 0.1), wear: 0.5 + r() * 0.4, bevel: 0.004, rand: r }); }
  for (const s of [-1, 1]) B.box(WD, 0.07, 0.2, Math.hypot(rampL, y), M(X + s * (W / 2 - 0.15), (y + 0.02) / 2 - 0.12, Dk.z1 + rampL / 2, -rampA, 0, 0), { grain: 2, color: 0x6f675c, wear: 0.8 });
  { const g = new THREE.SphereGeometry(1, 20, 8, 0, PI * 2, 0, PI / 2); g.scale(W / 2 + 0.9, 0.16, 1.4); B.geo(mat.pbr('sand_01', { rep: 2.5, gain: 1.4, grunge: true }), g, M(X, -0.08, Dk.z1 + rampL + 0.35), { color: [0.86, 0.82, 0.72], uvMul: [3, 3] }); g.dispose(); }
  // ---- piles under water: the kit posts end about 3.3 m below the deck; marine timber carries them to the sea bed ----
  const MW = mat.wood({ marine: true });
  const pileAt = (px, pz, top) => { const gb = Math.min(ground(px, pz), sea - 0.4); if (top - gb < 0.2) return; const h = top - gb + 0.4; B.cyl(MW, 0.12, 0.135, h, M(px, top - h / 2, pz, (r() - 0.5) * 0.02, r() * 6, 0), { seg: 10, hseg: 3, color: kit.vary(0x6f665a, r, 0.1), wear: 1 }); col.cyl(px, (top + gb) / 2, pz, 0.14, top - gb, { tag: 'pile' }); };
  for (const s of secs) for (const dx of [-1.08, 1.08]) for (const dz of [-s.L / 2 + 0.15, s.L / 2 - 0.15]) { const px = X + dx, pz = s.zc + dz; if (ground(px, pz) < sea - 0.3) pileAt(px, pz, y - 3.25); }
  // ---- T-head deck (own boards on the kit's look: the planks piece is too short for it) ----
  for (let zz = headZ - 1.1; zz < headZ + 1.12; zz += 0.152) B.box(WD, 7.1 + (r() - 0.5) * 0.04, 0.045, 0.145, M(X + (r() - 0.5) * 0.03, y - 0.022 + (r() - 0.5) * 0.004, zz, 0, (r() - 0.5) * 0.004, (r() - 0.5) * 0.006), { grain: 0, color: kit.vary(r() < 0.07 ? 0xb49a70 : 0x8f887c, r, 0.12), wear: 0.4 + r() * 0.5, bevel: 0.005, rand: r });
  for (const zz of [headZ - 1.15, headZ + 1.15]) B.box(WD, 7.2, 0.26, 0.08, M(X, y - 0.18, zz), { grain: 0, color: 0x6f675c, wear: 0.8, bevel: 0.006 });
  for (const xx of [X - 3.55, X - 1.2, X + 1.2, X + 3.55]) for (const zz of [headZ - 1.12, headZ + 1.12]) { const top = y + (Math.abs(xx - X) > 3 ? 0.95 + r() * 0.15 : -0.05); pileAt(xx, zz, top); B.cyl(MW, 0.13, 0.13, Math.max(0.1, top - (y - 3.3)), M(xx, (top + y - 3.3) / 2, zz), { seg: 12, color: kit.vary(0x7d7467, r, 0.1), wear: 1 }); }
  // cleats, coiled line, ladder
  const ST = mat.steel(), cleat = (cx, cz, ry) => { B.box(ST, 0.26, 0.024, 0.045, M(cx, y + 0.06, cz, 0, ry, 0), { color: 0xa9a59a, bevel: 0.01 }); for (const s of [-1, 1]) B.cyl(ST, 0.015, 0.02, 0.05, M(cx + Math.cos(ry) * s * 0.06, y + 0.025, cz - Math.sin(ry) * s * 0.06), { color: 0xa9a59a, seg: 8 }); };
  const cleats = [[X + W / 2 - 0.12, (Dk.z1 + zEnd) / 2 - 3, PI / 2], [X + W / 2 - 0.12, zEnd + 3.0, PI / 2], [X - W / 2 + 0.12, zEnd + 2.0, PI / 2], [X + 3.3, headZ + 0.9, 0], [X - 3.3, headZ - 0.9, 0]];
  for (const [cx, cz, ry] of cleats) cleat(cx, cz, ry);
  for (const s of [-1, 1]) B.box(ST, 0.04, 2.6, 0.04, M(X + 3.62, y - 0.9, headZ + s * 0.22), { color: 0xa9a59a, bevel: 0.008 });
  for (let k = 0; k < 7; k++) B.cyl(ST, 0.016, 0.016, 0.44, M(X + 3.62, y - 0.15 - k * 0.3, headZ, PI / 2, 0, 0), { color: 0xa9a59a, seg: 8 });
  { const pts = []; for (let i = 0; i < 90; i++) { const t = i / 90, a = t * 6.283 * 5, rr = 0.07 + t * 0.2; pts.push([X - 2.6 + Math.cos(a) * rr, y + 0.02 + (i % 18) * 0.0004, headZ + 0.4 + Math.sin(a) * rr]); } D.tube(mat.fabric('wool_boucle', { rep: 0.05 }), pts, 0.011, { seg: 5, color: 0xd8cfae, steps: 150 }); }
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
    // boats: their own meshes (they move)
    const dyn = new THREE.Group(); dyn.name = 'keysDockBoats'; ctx.groups.site.add(dyn);
    for (const b of boats) {
      const p = lib.piece(b.k, 'dock'); if (!p) continue; const g = new THREE.Group(); g.position.set(b.x, sea - b.draft, b.z); g.rotation.y = b.h;
      for (const q of p.parts) { const m = new THREE.Mesh(q.geometry, q.material); m.castShadow = true; m.receiveShadow = true; m.raycast = () => {}; g.add(m); }
      dyn.add(g); b.g = g; b.ph = r() * 6.28;
      // mooring line: cleat -> bow ring, sagging a little into the water
      const c = cleats[b.cleat], bow = new THREE.Vector3(0, 0.45, (p.box.max.z - 0.25)).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.h).add(g.position);
      const a = [c[0], y + 0.07, c[1]], pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([a[0] + (bow.x - a[0]) * t, a[1] + (bow.y - a[1]) * t - 0.35 * 4 * t * (1 - t), a[2] + (bow.z - a[2]) * t]); }
      const tb = kit.batch('line'); tb.tube(mat.fabric('wool_boucle', { rep: 0.05 }), pts, 0.012, { seg: 5, color: 0xcfc4a2 }); tb.build(dyn, { cast: false });
    }
    { const p = lib.piece('lifebuoy', 'dock'); if (p) for (const q of p.parts) { const m = new THREE.Mesh(q.geometry, q.material); m.position.set(X + 3.55, y + 0.35, headZ + 1.25); m.rotation.y = 0; m.castShadow = true; m.raycast = () => {}; ctx.groups.site.add(m); } }
    ctx.updaters.push((dt, env) => { const t = performance.now() / 1000; for (const b of boats) if (b.g) { b.g.position.y = sea - b.draft + Math.sin(t * 0.9 + b.ph) * 0.035; b.g.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.025; b.g.rotation.x = Math.sin(t * 0.55 + b.ph * 2) * 0.015; } });
    ctx.stats.keysDock = { sections: secs.length, instances: I.count(), zEnd: +zEnd.toFixed(1) };
  }));
}

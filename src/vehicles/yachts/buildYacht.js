// Port Solana V2 yachts: assemble one yacht from its definition.
// buildYacht(def, { seed, maxLod }) -> a pure data + scene-graph bundle (no game, no physics):
//   group (THREE.Group, yacht-local frame), lods [g0, g1, g2], setLod(n), mats, colliders (fine, for the walk world),
//   coarse (few shapes for the main physics world), nav { nodes, links }, spots, interacts, areas, lights, ladders, doors,
//   parts (movable Object3Ds by id), updaters [fn(dt, rt)], decks, meta, stats { tris, meshes, colliders }, dispose()
import * as THREE from 'three';
import { Builder, rng } from './kit/builder.js';
import { createMats } from './kit/mats.js';

export function buildYacht(def, opts = {}) {
  const seed = opts.seed ?? def.id;
  const R = rng(seed + ':vary');
  // seeded owner choices on top of the hand design: cushion and canvas colors, pillows, flags, toys
  const vary = def.variants ? def.variants(R) : {};
  const mats = createMats({ ...(def.palette || {}), ...(vary.palette || {}) });
  const ctx = new Builder({ mats, seed, maxLod: opts.maxLod ?? 2 });
  ctx.def = def; ctx.vary = vary; ctx.R = R;
  def.build(ctx);
  const group = ctx.toGroup(); group.name = 'yacht:' + def.id;
  const lods = [0, 1, 2].map((n) => group.getObjectByName('lod' + n));
  for (const id of Object.keys(ctx.parts)) { const p = ctx.parts[id]; lods[Math.min(2, p.lod)].add(p.group); }
  let tris = group.userData.tris, meshes = group.userData.meshes;
  for (const id of Object.keys(ctx.parts)) { tris += ctx.parts[id].group.userData.tris || 0; meshes += ctx.parts[id].group.userData.meshes || 0; }
  const out = {
    def, seed, vary, group, lods, mats,
    colliders: ctx.colliders, coarse: ctx.coarse, nav: ctx.nav, spots: ctx.spots, interacts: ctx.interacts, areas: ctx.areas,
    lights: ctx.lights, ladders: ctx.ladders, doors: ctx.doors, parts: ctx.parts, updaters: ctx.updaters, decks: ctx.decks.sort((a, b) => a.y - b.y), meta: ctx.meta,
    stats: { tris, meshes, colliders: ctx.colliders.length, prims: ctx.stats.prims, maxLod: ctx.maxLod },
    lod: 2,
    /** 0 = silhouette only, 1 = exterior detail, 2 = everything (interiors, small props). */
    setLod(n) { out.lod = n; lods[1].visible = n >= 1; lods[2].visible = n >= 2; },
    dispose() { group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); mats.dispose(); },
  };
  return out;
}

/** Triangle counts per LOD level (for budgets and reports). */
export function lodStats(built) {
  const count = (g) => { let t = 0, m = 0; g.traverse((o) => { if (o.isMesh) { t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; m++; } }); return { tris: Math.round(t), meshes: m }; };
  const a = count(built.lods[0]), b = count(built.lods[1]), c = count(built.lods[2]);
  return { far: a, mid: { tris: a.tris + b.tris, meshes: a.meshes + b.meshes }, full: { tris: a.tris + b.tris + c.tris, meshes: a.meshes + b.meshes + c.meshes } };
}
export { THREE };

// Nico's house r7 (playtest Nov 18 eve, item 4: "put the junk and stored stuff back under the house, it had it before"): the
// round-3 carport clutter (part 45: workbench with pegboard and vise, crab and lobster traps, coolers, buckets, jerrycans, the
// old tire, crates, the trash can and the rest of the gear) rebuilt under the r4 stilt house. Part 45 runs unchanged in its
// own frame; this part hands it a context whose batch, groups and colliders sit in a sub-frame moved so its carport rows land
// in the west bay of the r4 house, between the post lines (seen from the drive and the street, 1 / 4), clear of the ground room
// and the drive-through bay. Anything that hung on the old house's walls, posts or joists, or stood in the old yard,
// is dropped by position (it would float here). House frame of r4/plan4.js.
import { R4 } from '../r4/plan4.js';
import { frame } from '../r4/frame.js';
import { build as buildCarport } from './45_carport.js';
export const order = 46;

// old r3 frame (x, z) -> r4 house frame: (x + OX, z + OZ) (the gear rows run along the posts at x -6.5 / -8.5, the workbench at the back)
const OX = -6.5, OZ = -7.1, TURN = 0;
const keep = (x, y, z) => x > -3.0 && x < 2.2 && z > -3.2 && z < 4.6 && y < 2.2;

export async function build(ctx) {
  if (!R4) return;
  const { THREE, kit } = ctx, Fr = frame(ctx, 'house');
  const g = new THREE.Group(); g.name = 'r7_junk'; g.rotation.y = TURN; g.position.set(OX, 0.05, OZ); Fr.groups.detail.add(g);   // y 0.05: on top of the r4 pavers (the r3 slab was at grade)
  const J = kit.batch('r7junk'), _v = new THREE.Vector3(), _b = new THREE.Box3();
  const box0 = J.box.bind(J), geo0 = J.geo.bind(J);
  J.box = (m, sx, sy, sz, m4, o) => { const e = m4?.elements; if (e && !keep(e[12], e[13], e[14])) return J; return box0(m, sx, sy, sz, m4, o); };
  J.geo = (m, gg, m4, o) => { if (!gg.boundingBox) gg.computeBoundingBox(); _b.copy(gg.boundingBox); if (m4) _b.applyMatrix4(m4); _b.getCenter(_v); if (!keep(_v.x, _v.y, _v.z)) return J; return geo0(m, gg, m4, o); };
  // colliders: old frame -> r4 house frame (ry turns with the frame)
  const map = (x, z) => [x + OX, z + OZ];
  const col = {
    box(x, y, z, sx, sy, sz, o = {}) { if (!keep(x, Math.min(y, 1), z)) return null; const [hx, hz] = map(x, z); return Fr.col.box(hx, y + 0.05, hz, sx, sy, sz, { ...o, ry: (o.ry || 0) + TURN }); },
    cyl(x, y, z, r, h, o = {}) { if (!keep(x, Math.min(y, 1), z)) return null; const [hx, hz] = map(x, z); return Fr.col.cyl(hx, y + 0.05, hz, r, h, o); },
  };
  // the props part 45 loads (Poly Haven) are baked into meshes added to groups.detail: they go into the turned frame and are
  // filtered by their merged bounds after the build (see below)
  const sub = { ext: g, int: g, detail: g, dyn: new THREE.Group(), site: g };   // dyn: the old clothesline's laundry (north yard) is dropped
  const ctx2 = Object.assign(Object.create(ctx), {
    detail: J, col, groups: { ...ctx.groups, ...sub }, anchors: {}, updaters: [],
    addLight: (l) => { const [hx, hz] = map(l.pos[0], l.pos[2]); return Fr.light({ ...l, pos: [hx, l.pos[1], hz] }); },
    addInteract: () => null, stats: ctx.stats,
  });
  await buildCarport(ctx2);
  J.build(g);
  // props baked by part 45 (one merged mesh per material) may include things outside the kept area: those were placed with
  // prop(); drop their triangles outside the area
  for (const o of [...g.children]) {
    if (!o.isMesh || !/^carport:/.test(o.name)) continue;
    const gg = o.geometry, pa = gg.attributes.position, ix = gg.index; if (!ix) continue;
    const keepTri = []; for (let t = 0; t < ix.count; t += 3) { let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { const i = ix.getX(t + k); cx += pa.getX(i); cy += pa.getY(i); cz += pa.getZ(i); } if (keep(cx / 3, cy / 3, cz / 3)) keepTri.push(ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)); }
    if (!keepTri.length) { g.remove(o); gg.dispose(); continue; }
    if (keepTri.length < ix.count) gg.setIndex(keepTri);
  }
  for (const u of ctx2.updaters) ctx.updaters.push(u);
  ctx.stats.junk = { meshes: g.children.length };
}

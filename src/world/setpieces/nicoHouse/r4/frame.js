// r4 parts build in the lot's STREET frame (plan4.js). This wraps the build context so every r4 part can place geometry,
// colliders, interactions, lights, anchors and stair flights in S while the set piece's group stays in the yard frame G.
import { YAW, toG, ryG } from './plan4.js';

const cache = new WeakMap();
export function frame(ctx) {
  if (cache.has(ctx)) return cache.get(ctx);
  const { THREE, kit } = ctx;
  const sub = (parent, name) => { const g = new THREE.Group(); g.name = name; g.rotation.y = -YAW; parent.add(g); return g; };
  const groups = { ext: sub(ctx.groups.ext, 'r4_ext'), int: sub(ctx.groups.int, 'r4_int'), detail: sub(ctx.groups.detail, 'r4_detail'), dyn: sub(ctx.groups.dyn, 'r4_dyn') };
  const q4 = (rx, ry, rz) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ryG(ry), rz, 'YXZ')); return [q.x, q.y, q.z, q.w]; };
  const F = {
    groups,
    ext: kit.batch('r4ext'), int: kit.batch('r4int'), detail: kit.batch('r4det'),
    // colliders in S (ry about Y in S; rx / rz applied after it in the box's own frame, YXZ)
    col: {
      box(x, y, z, sx, sy, sz, o = {}) { const [gx, gz] = toG(x, z); const c = { shape: 'box', p: [gx, y, gz], h: [sx / 2, sy / 2, sz / 2], q: q4(o.rx || 0, o.ry || 0, o.rz || 0), tag: o.tag || 'solid', id: o.id, enabled: o.enabled !== false, surface: o.surface }; ctx.colliders.push(c); return c; },
      cyl(x, y, z, r, h, o = {}) { const [gx, gz] = toG(x, z); const c = { shape: 'cyl', p: [gx, y, gz], r, hh: h / 2, q: q4(0, 0, 0), tag: o.tag || 'solid', id: o.id, enabled: o.enabled !== false }; ctx.colliders.push(c); return c; },
      // a box collider from a quaternion in S (stairs ramps)
      boxQ(p, h, q, o = {}) { const [gx, gz] = toG(p[0], p[2]); const qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -YAW).multiply(q); const c = { shape: 'box', p: [gx, p[1], gz], h, q: [qq.x, qq.y, qq.z, qq.w], tag: o.tag || 'solid', enabled: true, surface: o.surface }; ctx.colliders.push(c); return c; },
    },
    v: (x, y, z) => { const [gx, gz] = toG(x, z); return new THREE.Vector3(gx, y, gz); },
    interact(it) { const p = it.pos.isVector3 ? it.pos : new THREE.Vector3(...it.pos); it.pos = F.v(p.x, p.y, p.z); return ctx.addInteract(it); },
    light(l) { const [gx, gz] = toG(l.pos[0], l.pos[2]); l.pos = [gx, l.pos[1], gz]; return ctx.addLight(l); },
    anchor(name, x, y, z, heading = 0, extra = {}) { ctx.anchors[name] = { pos: F.v(x, y, z), heading: heading - YAW, ...extra }; return ctx.anchors[name]; },
    flight(f) { const [gx, gz] = toG(f.x, f.z), d = toG(f.dir[0], f.dir[1]); (ctx.stairs ||= []).push({ ...f, x: gx, z: gz, dir: d }); },
    // finish: merge the batches into the S-frame subgroups
    build() {
      F.ext.build(groups.ext); F.int.build(groups.int, { cast: false }); F.detail.build(groups.detail);
    },
  };
  cache.set(ctx, F);
  return F;
}

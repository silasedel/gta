// r4 parts build in the lot's STREET frame (plan4.js). This wraps the build context so every r4 part can place geometry,
// colliders, interactions, lights, anchors and stair flights in S while the set piece's group stays in the yard frame G.
import { YAW, P4, HtoS, toG as toG0, ryG as ryG0 } from './plan4.js';

const cache = new WeakMap();
// frame(ctx): the lot frame S (+ the measured house offset P4.oz); frame(ctx, 'house'): the house frame H, turned P4.rot about the
// house center inside S. Geometry, colliders, interactions, lights, anchors and stairs all go through the same transform.
export function frame(ctx, kind = 'lot') {
  let per = cache.get(ctx); if (!per) cache.set(ctx, (per = {})); if (per[kind]) return per[kind];
  const { THREE, kit } = ctx, H = kind === 'house', th = H ? P4.rot.theta : 0;
  const toS = H ? HtoS : (x, z) => [x, z], toG = (x, z) => toG0(...toS(x, z)), ryG = (ry) => ryG0(ry + th);
  const [ox, oz] = toG0(0, 0);
  const sub = (parent, name) => { const g = new THREE.Group(); g.name = name; g.rotation.y = -YAW; g.position.set(ox, 0, oz); parent.add(g);
    if (!H) return g; const p = new THREE.Group(); p.name = name + '_h'; const R = P4.rot, c2 = Math.cos(th), s2 = Math.sin(th); p.rotation.y = th; p.position.set(R.cx - (R.cx * c2 + R.cz * s2), 0, R.cz - (-R.cx * s2 + R.cz * c2)); g.add(p); return p; };
  const groups = { ext: sub(ctx.groups.ext, 'r4_ext_' + kind), int: sub(ctx.groups.int, 'r4_int_' + kind), detail: sub(ctx.groups.detail, 'r4_detail_' + kind), dyn: sub(ctx.groups.dyn, 'r4_dyn_' + kind) };
  const q4 = (rx, ry, rz) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ryG(ry), rz, 'YXZ')); return [q.x, q.y, q.z, q.w]; };
  const F = {
    groups,
    ext: kit.batch('r4ext'), int: kit.batch('r4int'), detail: kit.batch('r4det'),
    // colliders in S (ry about Y in S; rx / rz applied after it in the box's own frame, YXZ)
    col: {
      box(x, y, z, sx, sy, sz, o = {}) { const [gx, gz] = toG(x, z); const c = { shape: 'box', p: [gx, y, gz], h: [sx / 2, sy / 2, sz / 2], q: q4(o.rx || 0, o.ry || 0, o.rz || 0), tag: o.tag || 'solid', id: o.id, enabled: o.enabled !== false, surface: o.surface }; ctx.colliders.push(c); return c; },
      cyl(x, y, z, r, h, o = {}) { const [gx, gz] = toG(x, z); const c = { shape: 'cyl', p: [gx, y, gz], r, hh: h / 2, q: q4(0, 0, 0), tag: o.tag || 'solid', id: o.id, enabled: o.enabled !== false }; ctx.colliders.push(c); return c; },
      // a box collider from a quaternion in S (stairs ramps)
      boxQ(p, h, q, o = {}) { const [gx, gz] = toG(p[0], p[2]); const qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), th - YAW).multiply(q); const c = { shape: 'box', p: [gx, p[1], gz], h, q: [qq.x, qq.y, qq.z, qq.w], tag: o.tag || 'solid', enabled: true, surface: o.surface }; ctx.colliders.push(c); return c; },
    },
    toS, toG, th,
    v: (x, y, z) => { const [gx, gz] = toG(x, z); return new THREE.Vector3(gx, y, gz); },
    interact(it) { const p = it.pos.isVector3 ? it.pos : new THREE.Vector3(...it.pos); it.pos = F.v(p.x, p.y, p.z); return ctx.addInteract(it); },
    light(l) { const [gx, gz] = toG(l.pos[0], l.pos[2]); l.pos = [gx, l.pos[1], gz]; return ctx.addLight(l); },
    anchor(name, x, y, z, heading = 0, extra = {}) { ctx.anchors[name] = { pos: F.v(x, y, z), heading: heading + th - YAW, ...extra }; return ctx.anchors[name]; },
    flight(f) { const [gx, gz] = toG(f.x, f.z), [a0, b0] = toG(0, 0), [a1, b1] = toG(f.dir[0], f.dir[1]), d = [a1 - a0, b1 - b0]; (ctx.stairs ||= []).push({ ...f, x: gx, z: gz, dir: d }); },
    // finish: merge the batches into the S-frame subgroups
    build() {
      F.ext.build(groups.ext); F.int.build(groups.int, { cast: false }); F.detail.build(groups.detail);
    },
  };
  per[kind] = F;
  return F;
}

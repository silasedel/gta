// r2-physics: collider audit overlay. Draws a wireframe of every Rapier collider near the camera over the rendered scene,
// so each collider can be compared with the mesh it stands for (invisible walls, walk-through props, floating contacts).
//
//   ?colliders=1 at load, or F9 in game, or game.physics.colliderOverlay.enable(true, { radius: 60 })
//   colors:  ground / walkable faces (slope < 40 deg) green, walls / steep faces yellow, fixed props and primitive shapes
//            orange, dynamic bodies (push props) red, cars cyan (+ wheel contact / shape-cast cylinders white),
//            characters (player, peds) magenta, sensors gray (off unless opts.sensors)
//   game.physics.colliderOverlay.stats() -> counts per category in range (audit numbers for the report)
//   game.physics.colliderOverlay.list(radius) -> [{ handle, shape, cat, x, y, z, size }]  (for automated checks)
import * as THREE from 'three';

const CAT = {
  ground: 0x3dff6a, wall: 0xffd23a, prim: 0xff8a1e, dynamic: 0xff3b3b, car: 0x35e6ff, char: 0xff4bf0, sensor: 0x8a8a8a, wheel: 0xffffff,
};

export function installOverlay(game) {
  const { RAPIER, world, scene } = game;
  if (!RAPIER || !world || !scene) return null;
  const ST = RAPIER.ShapeType;
  const P = (game.physics ||= {});
  const root = new THREE.Group(); root.name = 'r2-physics:colliders'; root.renderOrder = 999; root.visible = false;
  root.matrixAutoUpdate = false;
  scene.add(root);
  // lines drawn with a small depth bias toward the camera, so a collider face coincident with its mesh still shows
  const mats = new Map();
  const matFor = (hex) => {
    let m = mats.get(hex); if (m) return m;
    m = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(hex) }, opacity: { value: 0.9 } },
      vertexShader: 'void main(){ vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z -= 0.0012 * p.w; gl_Position = p; }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; void main(){ gl_FragColor = vec4(color, opacity); }',
      transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false,
    });
    mats.set(hex, m); return m;
  };
  const state = { on: false, radius: 60, sensors: false, built: new Map(), t: 0, center: new THREE.Vector3(), lastBuildC: new THREE.Vector3(1e9, 0, 0), wheels: true };
  const carBodies = () => { const s = new Map(); for (const v of game.vehicles?.list || []) { try { if (v.body) s.set(v.body.handle, v); } catch (e) { /* */ } } return s; };

  // ---- segment generators (local space of the collider) ----
  function boxSegs(hx, hy, hz, out) {
    const c = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]];
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) out.push(...c[a], ...c[b]);
  }
  function circle(r, y, n, out, axis = 'y') {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = [Math.cos(a0) * r, y, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, y, Math.sin(a1) * r];
      if (axis === 'y') out.push(...p0, ...p1); else out.push(p0[1], p0[0], p0[2], p1[1], p1[0], p1[2]);
    }
  }
  function cylSegs(r, hh, out, n = 14) {
    circle(r, -hh, n, out); circle(r, hh, n, out);
    for (let i = 0; i < n; i += 2) { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r; out.push(x, -hh, z, x, hh, z); }
  }
  function ballSegs(r, out) { circle(r, 0, 16, out); for (const ax of [0, 1]) for (let i = 0; i < 16; i++) { const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2; if (ax) out.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0); else out.push(0, Math.sin(a0) * r, Math.cos(a0) * r, 0, Math.sin(a1) * r, Math.cos(a1) * r); } }
  function capsuleSegs(r, hh, out) {
    cylSegs(r, hh, out, 12);
    for (const s of [1, -1]) for (let i = 0; i < 8; i++) { const a0 = (i / 16) * Math.PI, a1 = ((i + 1) / 16) * Math.PI; for (const ph of [0, Math.PI / 2]) { const c = Math.cos(ph), sn = Math.sin(ph); out.push(Math.cos(a0) * r * c, s * (hh + Math.sin(a0) * r), Math.cos(a0) * r * sn, Math.cos(a1) * r * c, s * (hh + Math.sin(a1) * r), Math.cos(a1) * r * sn); } }
  }
  // triangle soups: only triangles inside the audit radius; walkable faces vs walls get their own color
  function triSegs(V, I, xf, center, R2, outG, outW) {
    const n = I ? I.length / 3 : V.length / 9;
    const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let t = 0; t < n; t++) {
      for (let k = 0; k < 3; k++) { const i = I ? I[t * 3 + k] : t * 3 + k; p[k].set(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]); if (xf) p[k].applyMatrix4(xf); }
      const cx = (p[0].x + p[1].x + p[2].x) / 3 - center.x, cz = (p[0].z + p[1].z + p[2].z) / 3 - center.z;
      if (cx * cx + cz * cz > R2) continue;
      e1.subVectors(p[1], p[0]); e2.subVectors(p[2], p[0]); e1.cross(e2); const len = e1.length(); if (!(len > 1e-9)) continue;
      const out = Math.abs(e1.y / len) > 0.766 ? outG : outW;
      out.push(p[0].x, p[0].y, p[0].z, p[1].x, p[1].y, p[1].z, p[1].x, p[1].y, p[1].z, p[2].x, p[2].y, p[2].z, p[2].x, p[2].y, p[2].z, p[0].x, p[0].y, p[0].z);
    }
  }
  function lines(arr, hex) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const l = new THREE.LineSegments(g, matFor(hex)); l.frustumCulled = false; l.renderOrder = 999; l.matrixAutoUpdate = false; return l;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  function xfOf(c) { const t = c.translation(), r = c.rotation(); return _m.compose(_p.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _one).clone(); }
  function categoryOf(c, cars) {
    if (c.isSensor()) return 'sensor';
    const b = c.parent();
    if (b) {
      if (cars.has(b.handle)) return 'car';
      if (b.isKinematic()) return 'char';
      if (b.isDynamic()) return 'dynamic';
    }
    return 'prim';
  }
  // one record per collider: static ones are built once in world space, moving ones in local space and re-posed every frame
  function buildOne(c, cars) {
    const type = c.shapeType(), cat = categoryOf(c, cars);
    if (cat === 'sensor' && !state.sensors) return null;
    const grp = new THREE.Group(); grp.matrixAutoUpdate = false;
    const loc = [];
    const moving = !!c.parent() && !c.parent().isFixed();
    switch (type) {
      case ST.Cuboid: case ST.RoundCuboid: { const h = c.halfExtents(), rr = type === ST.RoundCuboid ? c.roundRadius() : 0; boxSegs(h.x + rr, h.y + rr, h.z + rr, loc); break; }
      case ST.Ball: ballSegs(c.radius(), loc); break;
      case ST.Cylinder: case ST.RoundCylinder: cylSegs(c.radius() + (type === ST.RoundCylinder ? c.roundRadius() : 0), c.halfHeight() + (type === ST.RoundCylinder ? c.roundRadius() : 0), loc); break;
      case ST.Cone: case ST.RoundCone: cylSegs(c.radius() * 0.5, c.halfHeight(), loc, 10); break;
      case ST.Capsule: capsuleSegs(c.radius(), c.halfHeight(), loc); break;
      case ST.ConvexPolyhedron: case ST.RoundConvexPolyhedron: case ST.TriMesh: {
        const V = c.vertices(), I = c.indices();
        if (!V || !V.length) break;
        if (type === ST.TriMesh && !moving) {
          const G = [], W = [], xf = xfOf(c);
          triSegs(V, I, xf, state.center, (state.radius + 4) ** 2, G, W);
          if (G.length) grp.add(lines(G, CAT.ground)); if (W.length) grp.add(lines(W, CAT.wall));
          return grp.children.length ? { grp, moving: false, cat: 'mesh', c, type } : null;
        }
        if (I) triSegs(V, I, null, new THREE.Vector3(), 1e12, loc, loc);
        else { // convex hull without indices: connect each vertex to its 3 nearest neighbors (reads as the hull outline)
          const n = V.length / 3;
          for (let i = 0; i < n; i++) { const d = []; for (let j = 0; j < n; j++) if (j !== i) d.push([(V[i * 3] - V[j * 3]) ** 2 + (V[i * 3 + 1] - V[j * 3 + 1]) ** 2 + (V[i * 3 + 2] - V[j * 3 + 2]) ** 2, j]); d.sort((a, b) => a[0] - b[0]); for (const [, j] of d.slice(0, 3)) if (j > i) loc.push(V[i * 3], V[i * 3 + 1], V[i * 3 + 2], V[j * 3], V[j * 3 + 1], V[j * 3 + 2]); }
        }
        break;
      }
      case ST.HeightField: {
        const H = c.heightfieldHeights(), sc = c.heightfieldScale(), nr = c.heightfieldNRows(), nc = c.heightfieldNCols(), xf = xfOf(c);
        const G = [], at = (i, j) => new THREE.Vector3(-sc.x / 2 + (j / nc) * sc.x, H[i + j * (nr + 1)] * sc.y, -sc.z / 2 + (i / nr) * sc.z).applyMatrix4(xf);
        const R2 = (state.radius + 4) ** 2;
        for (let i = 0; i <= nr; i++) for (let j = 0; j <= nc; j++) {
          const a = at(i, j); if ((a.x - state.center.x) ** 2 + (a.z - state.center.z) ** 2 > R2) continue;
          if (j < nc) { const b = at(i, j + 1); G.push(a.x, a.y, a.z, b.x, b.y, b.z); }
          if (i < nr) { const b = at(i + 1, j); G.push(a.x, a.y, a.z, b.x, b.y, b.z); }
        }
        if (G.length) grp.add(lines(G, CAT.ground));
        return grp.children.length ? { grp, moving: false, cat: 'mesh', c, type } : null;
      }
      default: return null;
    }
    if (!loc.length) return null;
    grp.add(lines(loc, CAT[cat] || CAT.prim));
    grp.matrix.copy(xfOf(c));
    return { grp, moving, cat, c, type };
  }
  const wheelGrp = new THREE.Group(); wheelGrp.matrixAutoUpdate = false; root.add(wheelGrp);
  function rebuild() {
    for (const r of state.built.values()) { root.remove(r.grp); r.grp.traverse((o) => o.geometry?.dispose?.()); }
    state.built.clear();
    const cars = carBodies(), R = state.radius, c0 = state.center;
    const seen = [];
    try { world.collidersWithAabbIntersectingAabb({ x: c0.x, y: c0.y, z: c0.z }, { x: R, y: 60, z: R }, (c) => { seen.push(c); return true; }); }
    catch (e) { world.forEachCollider((c) => seen.push(c)); }
    for (const c of seen) {
      try {
        const rec = buildOne(c, cars); if (!rec) continue;
        state.built.set(c.handle, rec); root.add(rec.grp);
      } catch (e) { /* freed during build */ }
    }
    state.lastBuildC.copy(c0);
  }
  function tick(dt) {
    if (!state.on) return;
    const cam = game.camera; if (!cam) return;
    const focus = game.player?.position || cam.position;
    state.center.set(focus.x, focus.y || 0, focus.z);
    state.t -= dt;
    if (state.t <= 0 || state.center.distanceTo(state.lastBuildC) > state.radius * 0.3) { state.t = 1.5; rebuild(); }
    for (const [h, r] of state.built) {
      if (!r.moving) continue;
      try { if (!world.getCollider(h)) { root.remove(r.grp); state.built.delete(h); continue; } r.grp.matrix.copy(xfOf(r.c)); } catch (e) { root.remove(r.grp); state.built.delete(h); }
    }
    // wheel contact shapes of the shape-cast suspension (white): where each tire touches, its sweep cylinder
    while (wheelGrp.children.length) { const o = wheelGrp.children.pop(); o.geometry?.dispose?.(); }
    if (state.wheels) {
      const W = [];
      for (const v of game.vehicles?.list || []) {
        const dbg = v.vc?.debugWheels?.(); if (!dbg) continue;
        const t = v.body.translation(); if ((t.x - state.center.x) ** 2 + (t.z - state.center.z) ** 2 > state.radius ** 2) continue;
        for (const w of dbg) {
          // tire outline: circle in the wheel plane at the solved wheel center, plus the contact normal
          const n = 16; for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2; for (const sx of [-1, 1]) { const o = sx * w.hw;
            W.push(w.c.x + w.ax.x * o + (w.fw.x * Math.cos(a0) + w.up.x * Math.sin(a0)) * w.r, w.c.y + w.ax.y * o + (w.fw.y * Math.cos(a0) + w.up.y * Math.sin(a0)) * w.r, w.c.z + w.ax.z * o + (w.fw.z * Math.cos(a0) + w.up.z * Math.sin(a0)) * w.r,
              w.c.x + w.ax.x * o + (w.fw.x * Math.cos(a1) + w.up.x * Math.sin(a1)) * w.r, w.c.y + w.ax.y * o + (w.fw.y * Math.cos(a1) + w.up.y * Math.sin(a1)) * w.r, w.c.z + w.ax.z * o + (w.fw.z * Math.cos(a1) + w.up.z * Math.sin(a1)) * w.r); } }
          if (w.contact) { const p = w.p, nn = w.n; W.push(p.x, p.y, p.z, p.x + nn.x * 0.5, p.y + nn.y * 0.5, p.z + nn.z * 0.5); }
        }
      }
      if (W.length) wheelGrp.add(lines(W, CAT.wheel));
    }
  }
  game.updaters?.push?.(tick);
  function enable(on = true, opts = {}) {
    state.on = !!on; root.visible = state.on; if (opts.radius) state.radius = opts.radius; if (opts.sensors != null) state.sensors = !!opts.sensors; if (opts.wheels != null) state.wheels = !!opts.wheels;
    state.t = 0; if (!state.on) { for (const r of state.built.values()) root.remove(r.grp); state.built.clear(); }
    return state.on;
  }
  function stats() { const s = {}; for (const r of state.built.values()) s[r.cat] = (s[r.cat] || 0) + 1; return s; }
  function list(radius = state.radius) {
    const out = [], c0 = state.center, cars = carBodies();
    world.collidersWithAabbIntersectingAabb({ x: c0.x, y: c0.y, z: c0.z }, { x: radius, y: 60, z: radius }, (c) => {
      try { const t = c.translation(), type = c.shapeType(); out.push({ handle: c.handle, shape: Object.keys(ST).find((k) => ST[k] === type), cat: categoryOf(c, cars), x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2) }); } catch (e) { /* */ }
      return true;
    });
    return out;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => { if (e.code === 'F9') { enable(!state.on); e.preventDefault?.(); } });
    if (/[?&]colliders=1/.test(window.location?.search || '')) enable(true);
  }
  P.colliderOverlay = { enable, stats, list, rebuild: () => { state.t = 0; }, get on() { return state.on; }, root, colors: CAT };
  return P.colliderOverlay;
}

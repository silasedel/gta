// ItemField: every product in an interior is its own object. Items are drawn as instances (one InstancedMesh per product shape and
// atlas page) until touched; taking one hides its instance, leaves the gap on the shelf (persisted in store.state.taken) and returns
// a real mesh for the hand. Slot indices are deterministic for a store seed, which is what makes the gaps persistent.
import * as THREE from 'three';
import { getProduct, productGeometry, productCell } from './catalog.js';

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const HELD = new Map(); // atlas page texture id -> shared material for items in hands
const heldMat = (tex) => {
  let m = HELD.get(tex.id);
  if (!m) HELD.set(tex.id, (m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })));
  return m;
};

export class ItemField {
  constructor(store, M) {
    this.store = store;
    this.M = M;
    this.slots = [];
    this.groups = new Map();
    this.meshes = [];
    this.cell = 0.6;
    this.grid = new Map();
  }
  // Place one item at a store-local position. o: { rx, rz, s, gain (0..1 extra shade, e.g. deep in a shelf), host (openable that must be open to reach it),
  //   zone (fixture id), free (not for sale: staff props), price (override), row (0 = front) }. Returns the slot (or null if persisted as taken).
  add(pid, x, y, z, ry = 0, o = {}) {
    const i = this.slots.length,
      prod = getProduct(pid);
    if (!prod) {
      console.warn('[interiors] unknown product', pid);
      return null;
    }
    const slot = {
      i,
      pid,
      x,
      y,
      z,
      ry,
      rx: o.rx || 0,
      rz: o.rz || 0,
      s: o.s || 1,
      gain: o.gain ?? 1,
      host: o.host || null,
      zone: o.zone || null,
      free: !!o.free,
      price: o.price ?? null,
      row: o.row || 0,
      taken: !!this.store.state?.taken?.has(i),
      im: null,
      ii: -1,
    };
    this.slots.push(slot);
    if (slot.taken) return slot;
    const cell = productCell(pid),
      geo = productGeometry(pid),
      key = geo.uuid + ':' + cell.page;
    let g = this.groups.get(key);
    if (!g) this.groups.set(key, (g = { geo, tex: cell.tex, list: [] }));
    slot.rect = cell.rect;
    g.list.push(slot);
    const k = Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell);
    let c = this.grid.get(k);
    if (!c) this.grid.set(k, (c = []));
    c.push(slot);
    return slot;
  }
  _matrix(s, out = _m) {
    _e.set(s.rx, s.ry, s.rz, 'YXZ');
    return out.compose(_p.set(s.x, s.y, s.z), _q.setFromEuler(_e), _s.set(s.s, s.s, s.s));
  }
  // -> { pos, nor, gain, count } bake sample points (one per instance), in the order applyBake expects
  build(group) {
    const it = this.buildIter(group, 0);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }
  *buildIter(group, slice = 0) {
    let t0 = performance.now();
    let n = 0;
    for (const g of this.groups.values()) n += g.list.length;
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      gain = new Float32Array(n);
    let k = 0;
    this.order = [];
    for (const g of this.groups.values()) {
      if (slice && performance.now() - t0 > slice) {
        yield;
        t0 = performance.now();
      }
      const geo = g.geo.clone(),
        cnt = g.list.length,
        im = new THREE.InstancedMesh(geo, this.M.items(g.tex), cnt),
        uv = new Float32Array(cnt * 4),
        h = g.geo.userData.size.h;
      g.list.forEach((s, ii) => {
        s.im = im;
        s.ii = ii;
        im.setMatrixAt(ii, this._matrix(s));
        const r = s.rect;
        uv.set([r[0], r[1], r[2] - r[0], r[3] - r[1]], ii * 4);
        const up = Math.cos(s.rx) * Math.cos(s.rz);
        pos[k * 3] = s.x + Math.sin(s.ry) * 0.04;
        pos[k * 3 + 1] = s.y + h * 0.6 * s.s * Math.max(0.3, up);
        pos[k * 3 + 2] = s.z + Math.cos(s.ry) * 0.04;
        const nl = Math.hypot(1, 0.55);
        nor[k * 3] = Math.sin(s.ry) / nl;
        nor[k * 3 + 1] = 0.55 / nl;
        nor[k * 3 + 2] = Math.cos(s.ry) / nl;
        gain[k] = s.gain;
        k++;
      });
      geo.setAttribute('iUv', new THREE.InstancedBufferAttribute(uv, 4));
      for (const a of ['bk0', 'bk1', 'bk2'])
        geo.setAttribute(a, new THREE.InstancedBufferAttribute(new Float32Array(cnt * 3), 3));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = false;
      im.receiveShadow = false;
      im.userData.noProbe = true;
      /* r7: thousands of products are not worth a reflection pass */ im.matrixAutoUpdate = false;
      group.add(im);
      this.meshes.push(im);
      this.order.push({ im, cnt });
    }
    return { pos, nor, gain, count: n };
  }
  applyBake(bk0, bk1, bk2, off) {
    let k = off;
    for (const { im, cnt } of this.order) {
      const g = im.geometry;
      g.attributes.bk0.array.set(bk0.subarray(k * 3, (k + cnt) * 3));
      g.attributes.bk1.array.set(bk1.subarray(k * 3, (k + cnt) * 3));
      g.attributes.bk2.array.set(bk2.subarray(k * 3, (k + cnt) * 3));
      g.attributes.bk0.needsUpdate =
        g.attributes.bk1.needsUpdate =
        g.attributes.bk2.needsUpdate =
          true;
      k += cnt;
    }
  }
  // a real, separate mesh of a product (for hands, trays, counters). Geometry is cloned with the product's atlas rect baked in.
  static mesh(pid) {
    const cell = productCell(pid),
      base = productGeometry(pid),
      g = base.clone(),
      U = g.attributes.uv,
      r = cell.rect;
    for (let i = 0; i < U.count; i++)
      U.setXY(i, r[0] + U.getX(i) * (r[2] - r[0]), r[1] + U.getY(i) * (r[3] - r[1]));
    const m = new THREE.Mesh(g, heldMat(cell.tex));
    m.userData = {
      productId: pid,
      product: getProduct(pid),
      size: base.userData.size,
      hold: base.userData.hold || 'hand',
      ownGeometry: true,
    };
    return m;
  }
  // Take an item off its shelf: the instance disappears (the gap stays, persisted) and a real mesh at the same store-local pose is returned.
  take(slot) {
    if (!slot || slot.taken) return null;
    slot.taken = true;
    if (slot.im) {
      slot.im.setMatrixAt(slot.ii, ZERO);
      slot.im.instanceMatrix.needsUpdate = true;
    }
    this.store.state?.taken?.add(slot.i);
    const m = ItemField.mesh(slot.pid);
    this._matrix(slot).decompose(m.position, m.quaternion, m.scale);
    m.userData.slot = slot;
    return m;
  }
  putBack(slot) {
    if (!slot || !slot.taken) return;
    slot.taken = false;
    this.store.state?.taken?.delete(slot.i);
    if (slot.im) {
      slot.im.setMatrixAt(slot.ii, this._matrix(slot));
      slot.im.instanceMatrix.needsUpdate = true;
    }
  }
  // nearest reachable item to a store-local point, preferring what the view direction (dx, dz) points at. hostOpen(host) -> bool
  nearest(x, y, z, dx, dz, reach = 1.15, hostOpen = () => true) {
    let best = null,
      bs = Infinity;
    const r = Math.ceil(reach / this.cell),
      cx = Math.floor(x / this.cell),
      cz = Math.floor(z / this.cell);
    for (let i = cx - r; i <= cx + r; i++)
      for (let j = cz - r; j <= cz + r; j++) {
        const c = this.grid.get(i + ',' + j);
        if (!c) continue;
        for (const s of c) {
          if (s.taken || s.free || (s.row > 0 && !this._frontGone(s))) continue;
          const ex = s.x - x,
            ez = s.z - z,
            ey = s.y - y,
            d = Math.hypot(ex, ez);
          if (d > reach || ey > 1.0 || ey < -1.45) continue;
          if (s.host && !hostOpen(s.host)) continue;
          const along = (ex * dx + ez * dz) / (d || 1);
          if (along < 0.25) continue;
          const score = d * (1.6 - along) + Math.abs(ey + 0.25) * 0.35;
          if (score < bs) {
            bs = score;
            best = s;
          }
        }
      }
    return best;
  }
  _frontGone(s) {
    return !s.front || s.front.taken;
  }
  count() {
    let n = 0;
    for (const s of this.slots) if (!s.taken) n++;
    return n;
  }
  dispose() {
    for (const im of this.meshes) {
      im.geometry.dispose();
      im.dispose();
    }
    this.meshes.length = 0;
    this.groups.clear();
    this.grid.clear();
  }
}

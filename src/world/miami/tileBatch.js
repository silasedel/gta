// Cross-tile batching of the streamed city's plain meshes (perf, Nov 19).
// Every near tile and every mid / far chunk builds one mesh per material (sidewalk, lanes, lines, decals, panels, glass,
// neon, shop signs, terrain ...). The materials are shared, so downtown drew the same ~12 materials once per tile: about
// 150 draws in the main view. Here those meshes are copied into shared BatchedMeshes per material (plus shadow flags,
// render order and attribute layout), so each material is one multi-draw per batch (a batch holds ~24 tiles' worth).
// BatchedMesh keeps per-tile frustum culling (one instance per tile mesh, tested against the camera every render).
//
// What is batched: opaque, non-shadow-casting plain meshes with identity world transforms (tile geometry is written in
// world space). Casters stay as they are, so the static sun maps see exactly the same objects; transparent meshes stay
// as they are, so their sort against other transparent objects does not change.
//
// The original meshes stay in their tile groups (raycasts, audits and dispose keep working) but are not drawn: their
// `visible` reads false while the scene renders. Code that sets `visible` on them (or on a parent group) still decides:
// the batch instance follows the original's visibility, checked once per frame before the render.
//
// Slots: each tile mesh gets a geometry range with ~25 % headroom; a freed range is reused by a later mesh that fits.
// A batch never grows or compacts (both re-upload the whole buffer: a hitch while driving); when no batch of the family
// has room, a sibling batch is made. An emptied batch restarts at the top of its buffers (or is freed if the family
// already has an empty one). New batch programs compile in the background (compileAsync); until they are ready the originals keep drawing.
// ?tilebatch=0 turns it off (before load).
import * as THREE from 'three';

const ON = !(typeof location !== 'undefined' && /[?&]tilebatch=0\b/.test(location.search));
const MAX_VERTS_PER_MESH = 120000; // the big far facade chunks stay single meshes (no duplicate copy of 100+ MB)
const BATCH_MIN_VERTS = 1 << 14;
const BATCH_MAX_VERTS = 1 << 17; // a new batch allocates and uploads its whole buffer once: keep that step small
const MIN_BATCH_INSTANCES = 64;
const SLACK = 1.25;

const _identity = new THREE.Matrix4();
const meshBeforeRender = THREE.Mesh.prototype.onBeforeRender;
const meshAfterRender = THREE.Mesh.prototype.onAfterRender;

function attrKey(g) {
  const parts = [];
  for (const k of Object.keys(g.attributes).sort()) {
    const a = g.attributes[k];
    parts.push(k + a.itemSize + (a.normalized ? 'n' : '') + a.array.constructor.name);
  }
  return parts.join(',') + (g.index ? '|I' : '|N');
}

function isIdentity(m) {
  const e = m.elements,
    I = _identity.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(e[i] - I[i]) > 1e-6) return false;
  return true;
}

// a mesh that can be drawn from a shared batch without any visible difference
function eligible(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh) return false;
  if (o.type !== 'Mesh' || o.castShadow || o.children.length) return false;
  if (!(o.layers.mask & 1)) return false; // only the default layer (the shadow tagging adds its own bits later)
  if (o.userData.noBatch || o.userData.noTileBatch) return false;
  if (o.onBeforeRender !== meshBeforeRender || o.onAfterRender !== meshAfterRender) return false;
  const m = o.material;
  if (!m || Array.isArray(m) || m.transparent || m.userData.noTileBatch) return false;
  if (o.userData.ownedMaterial) return false;
  const g = o.geometry;
  const pos = g?.attributes?.position;
  if (!pos || pos.count === 0 || pos.count > MAX_VERTS_PER_MESH) return false;
  if (g.groups && g.groups.length > 1) return false;
  if (g.morphAttributes && Object.keys(g.morphAttributes).length) return false;
  for (const k in g.attributes) if (g.attributes[k].isInterleavedBufferAttribute) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  o.updateWorldMatrix(true, false);
  return isIdentity(o.matrixWorld);
}

export function createTileBatcher(root) {
  const families = new Map(); // material + flags + attribute layout -> { key, batches }
  const allBatches = []; // every batch of every family (the per-frame loop)
  const entries = []; // every adopted mesh (dense; swap-remove)
  const byGroup = new WeakMap(); // tile group -> its entries
  let inRender = false;
  let renderer = null,
    camera = null,
    scene = null;
  const cfg = { bypass: false }; // A/B at run time: true = the originals draw, the batches do not
  const stats = { on: ON, families: 0, batches: 0, meshes: 0, verts: 0, adoptMs: 0, maxStepMs: 0 };

  function familyKey(o) {
    return [
      o.material.uuid,
      o.receiveShadow ? 1 : 0,
      o.renderOrder,
      o.frustumCulled ? 1 : 0,
      attrKey(o.geometry),
    ].join('|');
  }

  // one BatchedMesh of a family; sized for ~24 tile meshes like the first one, never grown (no full re-upload while
  // driving): a full batch simply gets a sibling, and batches fill in streaming order, so each one holds a
  // neighbourhood (its bounds cull as one) and empties out as the player moves away
  function newBatch(fam, o, rv, ri) {
    const capV = Math.max(rv, Math.min(BATCH_MAX_VERTS, Math.max(BATCH_MIN_VERTS, rv * 24)));
    const capI = ri > 0 ? Math.max(ri, Math.ceil((capV * ri) / rv)) : undefined;
    const bm = new THREE.BatchedMesh(MIN_BATCH_INSTANCES, capV, capI, o.material);
    bm.name = 'tile-batch:' + (o.material.name || o.name || 'mesh');
    bm.receiveShadow = o.receiveShadow;
    bm.castShadow = false;
    bm.renderOrder = o.renderOrder;
    bm.frustumCulled = o.frustumCulled;
    bm.matrixAutoUpdate = false;
    bm.userData.noDetailCull = true;
    bm.userData.tileCullSkip = true; // its bounds change as tiles stream (render/tileCull.v2.js)
    bm.raycast = () => {}; // the originals answer raycasts
    const b = { fam, bm, free: [], live: 0, ready: false, compiling: false };
    root.add(bm);
    fam.batches.push(b);
    allBatches.push(b);
    stats.batches = allBatches.length;
    compile(b);
    return b;
  }

  // the batch's own shader variant (USE_BATCHING) links in the background; the originals draw until it is ready
  function compile(b) {
    if (b.ready || b.compiling || !renderer || !camera || !scene) return;
    b.compiling = true;
    const done = () => {
      b.ready = true;
      b.compiling = false;
    };
    try {
      const p = renderer.compileAsync(b.bm, camera, scene);
      p.then(done, done);
    } catch (e) {
      done();
    }
  }

  // an empty batch starts over from the beginning of its buffers (nothing to copy)
  function resetBatch(b) {
    const bm = b.bm;
    const infos = bm._geometryInfo;
    for (let id = 0; id < infos.length; id++) if (infos[id].active) bm.deleteGeometry(id);
    bm._nextVertexStart = 0;
    bm._nextIndexStart = 0;
    b.free.length = 0;
  }

  function disposeBatch(b) {
    const list = b.fam.batches;
    list.splice(list.indexOf(b), 1);
    allBatches.splice(allBatches.indexOf(b), 1);
    root.remove(b.bm);
    b.bm.dispose();
    stats.batches = allBatches.length;
  }

  // best fit among the freed ranges (at most twice the size needed, so big ranges are not wasted on small meshes)
  function takeFree(b, v, i) {
    let best = -1;
    for (let k = 0; k < b.free.length; k++) {
      const s = b.free[k];
      if (s.v < v || s.i < i || s.v > v * 2 + 256) continue;
      if (best < 0 || s.v < b.free[best].v) best = k;
    }
    if (best < 0) return null;
    const s = b.free[best];
    b.free[best] = b.free[b.free.length - 1];
    b.free.pop();
    return s;
  }

  function fitsAtEnd(b, rv, ri) {
    const bm = b.bm;
    if (bm._nextVertexStart + rv > bm._maxVertexCount) return false;
    return ri <= 0 || bm._nextIndexStart + ri <= bm._maxIndexCount;
  }

  function addToFamily(fam, o) {
    const g = o.geometry;
    const v = g.attributes.position.count,
      i = g.index ? g.index.count : 0;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingSphere) g.computeBoundingSphere();
    const rv = Math.ceil((v * SLACK) / 64) * 64,
      ri = i ? Math.ceil((i * SLACK) / 192) * 192 : -1;
    let b = null,
      slot = null;
    for (const c of fam.batches) {
      slot = takeFree(c, v, i);
      if (slot) {
        b = c;
        c.bm.setGeometryAt(slot.id, g);
        break;
      }
    }
    if (!b) {
      for (const c of fam.batches) {
        if (c.live === 0) resetBatch(c);
        if (fitsAtEnd(c, rv, ri)) {
          b = c;
          break;
        }
      }
      if (!b) b = newBatch(fam, o, rv, ri);
      const id = b.bm.addGeometry(g, rv, ri);
      slot = { id, v: rv, i: Math.max(0, ri) };
    }
    const bm = b.bm;
    if (bm._instanceInfo.length >= bm.maxInstanceCount && !bm._availableInstanceIds.length)
      bm.setInstanceCount(bm.maxInstanceCount * 2);
    const inst = bm.addInstance(slot.id);
    b.live++;
    bm.boundingBox = null;
    bm.boundingSphere = null;
    return { b, slot, inst };
  }

  // the original mesh: drawn only when its batch is not ready yet; `visible` writes still reach the batch
  function hideOriginal(e) {
    const o = e.mesh;
    e.want = o.visible;
    Object.defineProperty(o, 'visible', {
      configurable: true,
      enumerable: true,
      get() {
        return inRender && e.batch.ready && !cfg.bypass ? false : e.want;
      },
      set(v) {
        e.want = v;
      },
    });
  }

  function restoreOriginal(e) {
    const o = e.mesh;
    delete o.visible;
    o.visible = e.want;
  }

  function adoptMesh(group, o) {
    const key = familyKey(o);
    let fam = families.get(key);
    if (!fam) {
      fam = { key, batches: [] };
      families.set(key, fam);
      stats.families = families.size;
    }
    const { b, slot, inst } = addToFamily(fam, o);
    const e = {
      mesh: o,
      group,
      batch: b,
      slot,
      inst,
      want: true,
      shown: true,
      idx: entries.length,
    };
    entries.push(e);
    hideOriginal(e);
    let list = byGroup.get(group);
    if (!list) byGroup.set(group, (list = []));
    list.push(e);
    stats.meshes = entries.length;
    stats.verts += o.geometry.attributes.position.count;
  }

  // adopt every eligible mesh of a finished tile / chunk group (a generator: yields between meshes so a big tile
  // never takes one long step)
  function* adoptG(group) {
    if (!ON || !group) return;
    const list = [];
    group.traverse((o) => {
      if (eligible(o)) list.push(o);
    });
    let work = 0;
    let t0 = performance.now();
    for (let k = 0; k < list.length; k++) {
      adoptMesh(group, list[k]);
      // about 16 k copied vertices per streaming step (a step cannot be split, and it runs inside a frame)
      work += list[k].geometry.attributes.position.count;
      if (work > 16000 || k === list.length - 1) {
        const ms = performance.now() - t0;
        stats.adoptMs += ms;
        if (ms > stats.maxStepMs) stats.maxStepMs = ms;
        work = 0;
        yield;
        t0 = performance.now();
      }
    }
  }

  function release(group) {
    const list = group && byGroup.get(group);
    if (!list) return;
    byGroup.delete(group);
    for (const e of list) {
      const b = e.batch;
      b.bm.deleteInstance(e.inst);
      b.free.push(e.slot);
      b.live--;
      b.bm.boundingBox = null;
      b.bm.boundingSphere = null;
      restoreOriginal(e);
      stats.verts -= e.mesh.geometry.attributes.position.count;
      const last = entries.pop();
      if (last !== e) {
        entries[e.idx] = last;
        last.idx = e.idx;
      }
    }
    stats.meshes = entries.length;
    for (const e of list)
      if (e.batch.live === 0 && e.batch.fam.batches.includes(e.batch)) emptied(e.batch);
  }

  // an emptied batch is kept for reuse when it is the only empty one of its family, otherwise freed
  function emptied(b) {
    for (const c of b.fam.batches)
      if (c !== b && c.live === 0) {
        disposeBatch(b);
        return;
      }
    resetBatch(b);
  }

  // the original's visibility, its parents included (read before tileCull hides groups for the main view)
  function effectiveVisible(e) {
    if (!e.want) return false;
    let p = e.mesh.parent;
    while (p && p !== root) {
      if (!p.visible) return false;
      p = p.parent;
    }
    return !!p;
  }

  // once per frame, before the main render: follow the originals' visibility, start pending compiles
  function sync(r, cam, sc) {
    renderer = r;
    camera = cam;
    scene = sc;
    for (let k = 0; k < entries.length; k++) {
      const e = entries[k];
      const v = effectiveVisible(e);
      if (v !== e.shown) {
        e.shown = v;
        e.batch.bm.setVisibleAt(e.inst, v);
      }
    }
    for (let k = 0; k < allBatches.length; k++) {
      const b = allBatches[k];
      if (!b.ready) compile(b);
      b.bm.visible = b.ready && b.live > 0 && !cfg.bypass;
    }
  }

  function setRendering(v) {
    inRender = v;
  }

  return { adoptG, release, sync, setRendering, stats, families, batches: allBatches, cfg, on: ON };
}

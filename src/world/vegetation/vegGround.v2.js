// Vegetation ground-truth pass (user, Nov 19: "some of the palm trees are still too high ... make sure all the trees are perfectly
// connected to the ground", "not a single tree through a building", plants growing in a canal).
// Every drawn library plant near the camera (city tile palms / street trees, countryside streamer, every vegetation field: set
// pieces, dressing, yards, Nico's street) is checked ONCE against the physics world, which is built from the same triangles the
// ground is drawn with (terrain, city ground, sidewalks, curbs, planters, decks, mounds):
//   - ground: the LOWEST solid surface under the trunk footprint (center + 4 points at the trunk radius, so a slope leaves no gap);
//     the base is put 4-10 cm into it (palms / trees, the root flare stays visible), shrubs 5 cm, mangroves keep their mud sink but
//     may not float. A base buried more than 30 cm is raised to the same rule.
//   - dropped (hidden, scale 0): a trunk or crown through a building / roof / bridge deck / wall / fence (any static solid between
//     0.4 m over the base and the crown), a trunk in a map building footprint, on a carriageway, or a plant in water (canals, sea,
//     lakes) unless it is a mangrove within 8 m of the shore.
// Static solids only (cars, people, sensors excluded); trunk colliders (capsules / cylinders / balls) are not ground. A plant whose
// footprint has no collider yet (physics not streamed in) is retried later. Budgeted per frame (?veggfix=0 off, A/B).
// game.vegetation.groundAudit(x, z, r) -> per drawn plant: base vs ground (footprint min), obstruction, water, road; worst lists.
import * as THREE from 'three';
import { inMapBuilding } from '../ground/occupancy.js';

export const order = 61;
const OFF = typeof location !== 'undefined' && /[?&]veggfix=0\b/.test(location.search);
const R_FIX = 170,
  BUDGET_MS = 0.7;
const WET_OK = /reed|rush|sawgrass|lily|cattail|spatter|pickerel|cypress/; // marsh plants grow in shallow water on purpose (glades)
const H_OF = { palm: 9, tree: 7.5, shrub: 1.3 },
  CROWN_R = { palm: 2.2, tree: 2.8, shrub: 0 };

export async function initV2(game) {
  const R = game.RAPIER;
  let ray = null,
    filt = 0;
  const notTrunk = (c) => {
    const t = c.shape?.type;
    return (
      t !== R.ShapeType.Capsule &&
      t !== R.ShapeType.Cylinder &&
      t !== R.ShapeType.Ball &&
      t !== R.ShapeType.Cone &&
      !c.isSensor()
    );
  };
  // first static non-trunk hit straight down from (x, y0, z) within len -> y or NaN
  function down(x, y0, z, len) {
    const W = game.world;
    if (!W || !R) return NaN;
    ray ||= new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    filt ||=
      R.QueryFilterFlags.EXCLUDE_DYNAMIC |
      R.QueryFilterFlags.EXCLUDE_KINEMATIC |
      R.QueryFilterFlags.EXCLUDE_SENSORS;
    ray.origin = { x, y: y0, z };
    let h = null;
    try {
      h = W.castRay(ray, len, true, filt, undefined, undefined, undefined, notTrunk);
    } catch (e) {
      return NaN;
    }
    return h ? y0 - (h.timeOfImpact ?? h.toi) : NaN;
  }
  // every static non-trunk surface crossing the vertical line between y1 (top) and y0 -> sorted descending
  function allDown(x, y1, y0, z) {
    const W = game.world,
      out = [];
    if (!W || !R) return out;
    ray ||= new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    filt ||=
      R.QueryFilterFlags.EXCLUDE_DYNAMIC |
      R.QueryFilterFlags.EXCLUDE_KINEMATIC |
      R.QueryFilterFlags.EXCLUDE_SENSORS;
    ray.origin = { x, y: y1, z };
    try {
      W.intersectionsWithRay(
        ray,
        y1 - y0,
        false,
        (h) => {
          if (notTrunk(h.collider)) out.push(y1 - h.timeOfImpact);
          return true;
        },
        filt,
      );
    } catch (e) {
      /* */
    }
    return out.sort((a, b) => b - a);
  }
  const _ne = {},
    SOFT = /service|track|path|driveway|footway|dirt|cycleway|steps|pedestrian/;
  const roadGap = (x, z) => {
    const G = game.miamiData?.roadGraph || game.city?.roadGraph;
    if (!G?.nearestEdge) return null;
    let e = null;
    try {
      e = G.nearestEdge(x, z, _ne, 12);
    } catch (er) {
      return null;
    }
    if (!e?.edge || !e.point || SOFT.test(String(e.edge.kind || ''))) return null;
    return { gap: e.dist - (e.edge.width || 6) / 2, px: e.point.x, pz: e.point.z };
  };
  const surf = (x, z) => {
    try {
      return String(game.city?.surfaceAt?.(x, z) || '');
    } catch (e) {
      return '';
    }
  };
  const isW = (x, z) => {
    try {
      return !!game.city?.isWater?.(x, z);
    } catch (e) {
      return false;
    }
  };
  const nearShore = (x, z) => {
    for (let a = 0; a < 8; a++)
      for (const d of [3, 6, 8])
        if (!isW(x + Math.cos(a * 0.785) * d, z + Math.sin(a * 0.785) * d)) return true;
    return false;
  };

  // first static non-trunk hit along a horizontal ray -> distance or Infinity
  let hray = null;
  function side(x, y, z, dx, dz, len) {
    const W = game.world;
    if (!W || !R) return Infinity;
    hray ||= new R.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    filt ||= R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC;
    filt |= R.QueryFilterFlags.EXCLUDE_SENSORS;
    hray.origin = { x, y, z };
    hray.dir = { x: dx, y: 0, z: dz };
    let h = null;
    try {
      h = W.castRay(hray, len, true, filt, undefined, undefined, undefined, notTrunk);
    } catch (e) {
      return Infinity;
    }
    return h ? (h.timeOfImpact ?? h.toi) : Infinity;
  }
  // W4 (Nov 19 playtest: "palms colliding with things"): a wall / facade beside the trunk or through the crown. Trimesh buildings
  // are hollow, so the down rays above (started inside a tall building) never saw them: 12 horizontal rays at trunk height
  // (anything within bark + 0.1 m: the trunk is in it) and at two crown heights (55 % of the model's crown radius; a wall spans
  // >= 2 neighbouring rays of 8, a lone pole (lamp, sign) at most one, so poles never drop a crown). ?vegwall=0 = old.
  const WALL = !(typeof location !== 'undefined' && /[?&]vegwall=0\b/.test(location.search));
  const DIRS = [...Array(8).keys()].map((k) => {
    const a = (k / 8) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  });
  // a wall: two neighbouring rays of 8 hit within len
  function walled(x, y, z, len) {
    const hits = DIRS.map(([dx, dz]) => side(x, y, z, dx, dz, len) < len);
    for (let k = 0; k < 8; k++) {
      if (hits[k] && hits[(k + 1) % 8]) return true;
    }
    return false;
  }
  // anything at all within len
  function touching(x, y, z, len) {
    for (const [dx, dz] of DIRS) {
      if (side(x, y, z, dx, dz, len) < len) return true;
    }
    return false;
  }

  // judge one plant base: -> { st: 'ok' | 'fix' | 'drop' | 'wait', y?, why?, g?, d? }
  function judge(x, y, z, s, cls, key, mv = false, nr = false) {
    const md = WALL ? game.city?.flora?.models?.[key] : null; // the model's real size (royal palms are 17 m, a rubber fig 4 m)
    const mangrove = /mangrove/.test(key || ''),
      H = (md?.height > 1 ? md.height : H_OF[cls] || 4) * s;
    if (isW(x, z) && !(mangrove && nearShore(x, z)) && !WET_OK.test(key || ''))
      return { st: 'drop', why: 'water' };
    if (cls !== 'shrub' && !nr && game.placement?.onRoad?.(x, z, 0.25 * s))
      return { st: 'drop', why: 'road' };
    if (cls !== 'shrub' && inMapBuilding(game, x, z, 0.3)) return { st: 'drop', why: 'building' };
    if (cls !== 'shrub' && !mv && !nr) {
      // (QA: a car pinned against palms at a Keys road edge) trunks keep ~1.5 m from a carriageway edge
      const q = roadGap(x, z),
        need = q && (/sidewalk|pavers|concrete|plaza|tile/.test(surf(x, z)) ? 0.8 : 1.5); // behind a curb / on a sidewalk: 0.8 m
      if (q && q.gap < need) {
        const dx = x - q.px,
          dz = z - q.pz,
          l = Math.hypot(dx, dz) || 1,
          sh = need - q.gap + 0.05;
        if (sh > 2.2) return { st: 'drop', why: 'road' };
        const nx = x + (dx / l) * sh,
          nz = z + (dz / l) * sh;
        if (isW(nx, nz) || inMapBuilding(game, nx, nz, 0.3)) return { st: 'drop', why: 'road' };
        const r2 = judge(nx, y, nz, s, cls, key, true);
        if (r2.st === 'wait' || r2.st === 'drop')
          return r2.st === 'drop' ? { ...r2, why: 'road' } : r2;
        return {
          st: 'move',
          x: nx,
          z: nz,
          y: r2.st === 'fix' ? r2.y : y,
          g: r2.g,
          d: r2.d,
          why: 'roadEdge',
        };
      }
    }
    // trunk line: every solid from the crown down to 3 m under the base
    const L = allDown(x, y + H + 0.5, y - 3, z);
    const gC = L.find((h) => h <= y + 1.2); // the first surface at or below the base (a deck / planter / mound counts)
    if (!Number.isFinite(gC)) return { st: 'wait' };
    const over = L.find((h) => h > gC + 0.4 && h < y + H * 0.92); // something solid across the trunk / crown
    if (over !== undefined) return { st: 'drop', why: 'solid', over: +(over - y).toFixed(2) };
    if (md && cls !== 'shrub' && !mangrove) {
      // trunk against a wall, crown through a facade
      const bark = (md.trunk?.[1]?.[3] || md.trunkR || 0.3) * s;
      const crownY = (md.crownY > 0 ? md.crownY : (H * 0.6) / s) * s;
      const crownR = (md.radius || CROWN_R[cls] || 2) * s;
      if (touching(x, gC + 1.2, z, bark + 0.1)) return { st: 'drop', why: 'wall' };
      const reach = Math.max(bark + 0.4, crownR * 0.55);
      for (const yy of [gC + crownY + 0.4, gC + (crownY + H) * 0.5]) {
        if (walled(x, yy, z, reach)) return { st: 'drop', why: 'crown' };
      }
    }
    const cr = (md?.radius ? md.radius * 0.6 : CROWN_R[cls] || 0) * s * 0.6; // crown against a roof / wall top / awning next to the trunk
    if (cr > 0)
      for (const [dx, dz] of [
        [cr, 0],
        [-cr, 0],
        [0, cr],
        [0, -cr],
      ]) {
        const h = down(x + dx, y + H, z + dz, H * 0.45);
        if (Number.isFinite(h) && h > gC + 2.2) return { st: 'drop', why: 'crown' };
      }
    // footprint: lowest ground under the trunk (no gap on the downhill side)
    const r = mangrove ? 0.9 : cls === 'shrub' ? 0.18 * s : Math.min(0.45, 0.3 * s);
    let g = gC;
    for (const [dx, dz] of [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ]) {
      if (!mangrove && isW(x + dx, z + dz)) continue;
      const h = down(x + dx, gC + 0.6, z + dz, 1.6);
      if (Number.isFinite(h)) g = Math.min(g, h);
    }
    const sink = mangrove
      ? 0.25 + 0.55 * s
      : cls === 'shrub'
        ? 0.05 * s
        : Math.min(0.1, Math.max(0.04, (cls === 'palm' ? 0.07 : 0.06) * s));
    const d = y - g;
    if (cls === 'shrub' && d > 0.25) return { st: 'ok', g, d, raised: 1 }; // a pot / planter box (drawn, no collider): planted on purpose
    if (d > 0.02 || (!mangrove && y < gC - 0.3))
      return { st: 'fix', y: g - (mangrove ? Math.min(sink, d + sink) : sink), g, d }; // floating, or buried past its flare
    return { st: 'ok', g, d };
  }

  // decisions keyed by plant position (every LOD / part of a plant shares the instance position -> the same decision)
  const memo = new Map();
  const kq = (x, z) => Math.round(x * 20) + ',' + Math.round(z * 20);
  const stats = {
    checked: 0,
    fixed: 0,
    moved: 0,
    dropped: { water: 0, road: 0, building: 0, solid: 0, crown: 0, wall: 0 },
    waits: 0,
    msMax: 0,
    msSum: 0,
    frames: 0,
  };
  function decide(x, y, z, s, cls, key, nr = false) {
    const k = kq(x, z);
    let r = memo.get(k);
    if (r && r.y0 === y) return r;
    if (r)
      return (r.st === 'fix' || r.st === 'move') && Math.abs(r.y - y) < 1e-3 ? { st: 'ok' } : r;
    r = judge(x, y, z, s, cls, key, false, nr);
    if (r.st === 'wait') return r;
    r.y0 = y;
    memo.set(k, r);
    stats.checked++;
    if (r.st === 'fix') stats.fixed++;
    else if (r.st === 'move') stats.moved = (stats.moved || 0) + 1;
    else if (r.st === 'drop') stats.dropped[r.why] = (stats.dropped[r.why] || 0) + 1;
    if (memo.size > 60000) memo.clear();
    return r;
  }
  const clsOf = (ud) =>
    ud?.vegCls === 'palm' || ud?.vegCls === 'tree' || ud?.vegCls === 'shrub' ? ud.vegCls : null;

  // ---- sources ----
  // (1) vegetation fields: items + mats4 (re-bucketed from mats4 every frame)
  function* fieldJobs() {
    for (const f of game.vegetation?._fields || []) {
      if (!f.mats4 || !f.items) continue;
      const ud = f.variants?.[0]?.parts?.[0]?.im?.material?.userData,
        cls = clsOf(ud);
      if (!cls) continue;
      const done = (f._gfx ||= new Uint8Array(f.items.length));
      for (let i = 0; i < f.items.length; i++) {
        if (done[i]) continue;
        const e = f.mats4[i].elements;
        yield {
          x: e[12],
          y: e[13],
          z: e[14],
          s: Math.hypot(e[0], e[1], e[2]),
          cls,
          key: ud.vegKey,
          nr: !!f.items[i].noRoad,
          apply(r) {
            done[i] = 1;
            if (r.st === 'move') {
              e[12] = r.x;
              e[14] = r.z;
              f.items[i].x = r.x;
              f.items[i].z = r.z;
            }
            if (r.st === 'fix' || r.st === 'move') {
              e[13] = r.y;
              f.items[i].y = r.y;
            } else if (r.st === 'drop') {
              f.mats4[i].makeScale(0, 0, 0);
            }
          },
        };
      }
    }
  }
  // (2) countryside streamer: sealed per-cell lists
  function* csJobs() {
    const cs = game.vegetation?.countryside;
    if (!cs?.cells || !cs.protos) return;
    for (const c of cs.cells.values())
      for (const [pi, L] of c.lists) {
        if (!(L.m instanceof Float32Array) || !L.n) continue;
        const P = cs.protos[pi];
        const cls =
          L.cls === 'tree'
            ? /palm|sabal|coconut|royal|queen|fan|date/.test(P.key)
              ? 'palm'
              : 'tree'
            : L.cls === 'shrub'
              ? 'shrub'
              : null;
        if (!cls) continue;
        const done = L._gfx && L._gfx.length === L.n ? L._gfx : (L._gfx = new Uint8Array(L.n));
        for (let i = 0; i < L.n; i++) {
          if (done[i]) continue;
          const o = i * 16,
            M = L.m;
          yield {
            x: M[o + 12],
            y: M[o + 13],
            z: M[o + 14],
            s: Math.hypot(M[o], M[o + 1], M[o + 2]),
            cls,
            key: P.key,
            apply(r) {
              done[i] = 1;
              if (r.st === 'move') {
                M[o + 12] = r.x;
                M[o + 14] = r.z;
              }
              if (r.st === 'fix' || r.st === 'move') M[o + 13] = r.y;
              else if (r.st === 'drop') for (let k = 0; k < 15; k++) M[o + k] = 0;
              if (r.st !== 'ok') cs.touch();
            },
          };
        }
      }
  }
  // (3) static instanced meshes (city tiles: street palms, park / swale trees, tile flora)
  let statics = [],
    tScan = 1e9; // rescan on the first sweep
  const _m = new THREE.Matrix4();
  function rescan() {
    const skip = new Set();
    for (const f of game.vegetation?._fields || []) skip.add(f.group);
    const csg = game.vegetation?.countryside?.group;
    if (csg) skip.add(csg);
    const out = [];
    const walk = (o) => {
      if (skip.has(o) || o.name === 'vegCollars') return;
      if (o.isInstancedMesh && o.count && clsOf(o.material?.userData)) out.push(o);
      for (const ch of o.children) walk(ch);
    };
    walk(game.scene);
    statics = out;
  }
  function* staticJobs() {
    for (const im of statics) {
      if (!im.parent) continue;
      const ud = im.material.userData,
        cls = clsOf(ud);
      const n = im.count,
        done =
          im._gfx && im._gfx.length >= n
            ? im._gfx
            : (im._gfx = new Uint8Array(im.instanceMatrix.count));
      im.updateWorldMatrix(true, false);
      const W = im.matrixWorld,
        A = im.instanceMatrix.array,
        identity =
          W.elements[13] === 0 &&
          W.elements[12] === 0 &&
          W.elements[14] === 0 &&
          W.elements[0] === 1;
      for (let i = 0; i < n; i++) {
        if (done[i]) continue;
        const o = i * 16;
        let x = A[o + 12],
          y = A[o + 13],
          z = A[o + 14];
        if (!identity) {
          _m.fromArray(A, o).premultiply(W);
          x = _m.elements[12];
          y = _m.elements[13];
          z = _m.elements[14];
        }
        yield {
          x,
          y,
          z,
          s: Math.hypot(A[o], A[o + 1], A[o + 2]),
          cls,
          key: ud.vegKey,
          apply(r) {
            done[i] = 1;
            if (r.st === 'move') {
              A[o + 12] += (r.x - x) / (identity ? 1 : W.elements[0] || 1);
              A[o + 14] += (r.z - z) / (identity ? 1 : W.elements[10] || 1);
            }
            if (r.st === 'fix' || r.st === 'move') {
              A[o + 13] += (r.y - y) / (identity ? 1 : W.elements[5] || 1);
              im.instanceMatrix.needsUpdate = true;
            } else if (r.st === 'drop') {
              for (let k = 0; k < 15; k++) A[o + k] = 0;
              im.instanceMatrix.needsUpdate = true;
            }
          },
        };
      }
    }
  }
  let gen = null,
    cam = new THREE.Vector3(),
    sweepT = 0;
  const waitT = new Map();
  function* all() {
    yield* fieldJobs();
    yield* csJobs();
    yield* staticJobs();
  }
  function step() {
    const C = game.camera;
    if (!C || !game.world) return;
    const t0 = performance.now();
    cam.copy(C.position);
    if (!gen) {
      if (++tScan > 4) {
        tScan = 0;
        rescan();
      }
      gen = all();
      sweepT = t0;
    } // a scene walk once every few full sweeps
    let n = 0,
      it = 0;
    for (;;) {
      if ((++it & 63) === 0 && performance.now() - t0 > BUDGET_MS) break;
      const r = gen.next();
      if (r.done) {
        gen = null;
        break;
      }
      const j = r.value;
      if ((j.x - cam.x) ** 2 + (j.z - cam.z) ** 2 > R_FIX * R_FIX) continue;
      const wk = kq(j.x, j.z),
        wt = waitT.get(wk);
      if (wt !== undefined && t0 - wt < 2000) continue; // no collider there yet: retry in 2 s
      const d = decide(j.x, j.y, j.z, j.s, j.cls, j.key, j.nr);
      if (d.st === 'wait') {
        stats.waits++;
        waitT.set(wk, t0);
        if (waitT.size > 20000) waitT.clear();
        continue;
      }
      j.apply(d);
      ++n;
      if (performance.now() - t0 > BUDGET_MS) break;
    } // every plant (a judged plant casts up to ~30 rays)
    const ms = performance.now() - t0;
    stats.frames++;
    stats.msSum += ms;
    if (ms > stats.msMax) stats.msMax = ms;
  }
  if (!OFF)
    game.updaters.push(() => {
      try {
        step();
      } catch (e) {
        /* never take the frame down */
      }
    });

  // ---- audit over every drawn plant (truth = physics ground, same rules as above, nothing changed) ----
  function groundAudit(x, z, r = 200, o = {}) {
    const out = {
        n: 0,
        floating: 0,
        floating5: 0,
        sunk: 0,
        water: 0,
        road: 0,
        building: 0,
        solid: 0,
        crown: 0,
        wait: 0,
        hidden: 0,
        byCls: {},
        worstFloat: [],
        worstSunk: [],
        offenders: [],
      },
      seen = new Set(),
      m = new THREE.Matrix4();
    const take = (px, py, pz, s, cls, key, src) => {
      if ((px - x) ** 2 + (pz - z) ** 2 > r * r) return;
      const k = kq(px, pz);
      if (seen.has(k)) return;
      seen.add(k);
      if (s < 1e-4) {
        out.hidden++;
        return;
      }
      const j = judge(px, py, pz, s, cls, key);
      out.n++;
      const b = (out.byCls[cls] ||= { n: 0, floating5: 0, off: 0 });
      b.n++;
      const e = [src, key, +px.toFixed(1), +pz.toFixed(1), +py.toFixed(2)];
      if (j.st === 'wait') {
        out.wait++;
        return;
      }
      if (j.st === 'drop') {
        out[j.why]++;
        b.off++;
        if (out.offenders.length < 60) out.offenders.push([j.why, ...e, j.over ?? '']);
        return;
      }
      if (j.st === 'move') {
        out.roadEdge = (out.roadEdge || 0) + 1;
        if (out.offenders.length < 60) out.offenders.push(['roadEdge', ...e]);
        return;
      }
      if (j.raised) {
        out.raised = (out.raised || 0) + 1;
        return;
      }
      const d = py - j.g;
      if (d > 0.02) out.floating++;
      if (d > 0.05) {
        out.floating5++;
        b.floating5++;
        out.worstFloat.push([+d.toFixed(3), ...e]);
      }
      if (!/mangrove/.test(key) && d < -0.3) {
        out.sunk++;
        out.worstSunk.push([+d.toFixed(3), ...e]);
      }
    };
    game.scene.traverse((im) => {
      if (!im.isInstancedMesh || !im.count || !im.visible) return;
      const ud = im.material?.userData,
        cls = clsOf(ud);
      if (!cls || ud.veg?.family === 'imp') return;
      if (o.cls && !o.cls.includes(cls)) return;
      im.updateWorldMatrix(true, false);
      const src = im.parent?.name?.startsWith('vegField_')
        ? 'field'
        : im.parent?.parent?.name === 'countryside' || im.parent?.name === 'countryside'
          ? 'countryside'
          : 'tile';
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        m.premultiply(im.matrixWorld);
        const e = m.elements;
        take(e[12], e[13], e[14], Math.hypot(e[0], e[1], e[2]), cls, ud.vegKey || '?', src);
      }
    });
    out.worstFloat.sort((a, b) => b[0] - a[0]);
    out.worstFloat = out.worstFloat.slice(0, 15);
    out.worstSunk.sort((a, b) => a[0] - b[0]);
    out.worstSunk = out.worstSunk.slice(0, 10);
    return out;
  }
  const api = {
    groundAudit,
    stats,
    judge,
    down,
    off: OFF,
    flush() {
      memo.clear();
    },
  };
  const hook = () => {
    if (game.vegetation) {
      game.vegetation.groundFix = api;
      return true;
    }
    return false;
  };
  if (!hook()) game.on?.('vegetation:ready', hook);
  game.vegGround = api;
}

// r2-physics collider audit, page side (tools/v2/physics/colaudit.mjs). Defines window.__colAudit:
//   __colAudit.sweep(cx, cz, { grid: 5, step: 8, heights: [0.45, 1.2], dirs: 48, range: 12 }) -> { rays, walkThrough: [...], invisible: [...] }
// From a grid of standing points around (cx, cz), horizontal rays at knee and chest height are cast twice: against the
// RENDERED meshes (three.js raycast, also on meshes whose raycast was turned off for speed) and against the PHYSICS colliders.
//   walk-through: a solid mesh is hit, but no collider within 0.35 m behind it (you can walk / drive through it)
//   invisible wall: a collider is hit, but no mesh within 0.5 m behind it
// Foliage, decals, glass-free lights, water, sky, particles and sensors are not solid by design and are skipped.
(() => {
  const g = window.game, T = g.THREE || window.THREE, R = g.RAPIER, W = g.world, QF = R.QueryFilterFlags;
  const SKIP_NAME = /leaf|leaves|grass|foliage|canopy|frond|bush|shrub|flower|fern|weed|vine|ivy|decal|water|ocean|sea|sky|cloud|shadow|pool|glow|light|beam|cone_light|particle|smoke|fog|marker|blob|contact|ground_cover|lawn|sand|terrain|road|asphalt|sidewalk|curbweed|paint|mark|wire|cable|line|r2-physics|helper|hud|reticle|puddle|crown|palm_top|umbrella|awning|canopy/i;
  const raycaster = new T.Raycaster(); raycaster.firstHitOnly = true;
  function candidates(cx, cz, rad) {
    const out = []; const sph = new T.Sphere(), v = new T.Vector3();
    g.scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isInstancedMesh) || o.isSkinnedMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m) return;
      const nm = (o.name || '') + ' ' + (o.parent?.name || '') + ' ' + (m.name || '');
      if (SKIP_NAME.test(nm)) return;
      if ((m.transparent && m.opacity < 0.9) || m.alphaTest > 0.05 || m.depthWrite === false || m.isShaderMaterial && !m.lights) return;
      if (!o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (o.isInstancedMesh) { out.push(o); return; }
      sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      v.set(cx, sph.center.y, cz); if (sph.center.distanceTo(v) - sph.radius > rad) return;
      out.push(o);
    });
    return out;
  }
  function meshHit(cands, o, d, far) {
    raycaster.set(o, d); raycaster.near = 0; raycaster.far = far;
    const hits = [];
    for (const m of cands) { const proto = m.isInstancedMesh ? T.InstancedMesh.prototype : T.Mesh.prototype; try { proto.raycast.call(m, raycaster, hits); } catch (e) { /* */ } }
    let best = null; for (const h of hits) if (!best || h.distance < best.distance) best = h;
    return best;
  }
  const ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  const meshLabel = (m) => { const mt = Array.isArray(m.material) ? m.material[0] : m.material; return ((m.name || m.parent?.name || '?') + '|' + (mt?.name || mt?.type || '')).slice(0, 80); };
  function groundAt(x, z) { const y0 = (g.player?.position?.y ?? 0) + 2.2; const h = W.castRay(new R.Ray({ x, y: y0, z }, { x: 0, y: -1, z: 0 }), 6, true, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS); return h ? y0 - (h.timeOfImpact ?? h.toi) : null; } // from the player's level: never a roof
  window.__colAudit = {
    sweep(cx, cz, o = {}) {
      const grid = o.grid ?? 5, step = o.step ?? 8, H = o.heights ?? [0.45, 1.2], N = o.dirs ?? 48, far = o.range ?? 12;
      const cands = candidates(cx, cz, grid * step / 2 + far + 4);
      const res = { cands: cands.length, rays: 0, walkThrough: [], invisible: [], ok: 0, meshHits: 0, colHits: 0, bothHits: 0, points: 0, insideSkipped: 0 };
      const org = new T.Vector3(), dir = new T.Vector3();
      for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
        const x = cx + (i - (grid - 1) / 2) * step, z = cz + (j - (grid - 1) / 2) * step, gy = groundAt(x, z); if (gy == null) continue;
        // never start inside a collider (inside a building / car): a tiny ball must be free
        let inside = false; try { inside = !!W.intersectionWithShape({ x, y: gy + 1, z }, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(0.25), QF.EXCLUDE_SENSORS | QF.EXCLUDE_KINEMATIC); } catch (e) { /* */ }
        if (inside) { res.insideSkipped++; try { const c = W.intersectionWithShape({ x, y: gy + 1, z }, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(0.25), QF.EXCLUDE_SENSORS | QF.EXCLUDE_KINEMATIC); (res.insideTags ||= []).push((g.city?.colTags?.get?.(c.handle) || '') + ':' + c.shapeType() + '@' + x.toFixed(0) + ',' + gy.toFixed(1) + ',' + z.toFixed(0)); } catch (e) { /* */ } continue; } res.points++;
        for (const hh of H) for (let k = 0; k < N; k++) {
          const a = (k / N) * Math.PI * 2; dir.set(Math.cos(a), 0, Math.sin(a)); org.set(x, gy + hh, z);
          const mh = meshHit(cands, org, dir, far);
          ray.origin.x = org.x; ray.origin.y = org.y; ray.origin.z = org.z; ray.dir.x = dir.x; ray.dir.y = 0; ray.dir.z = dir.z;
          let ch = null; try { ch = W.castRay(ray, far, true, QF.EXCLUDE_SENSORS | QF.EXCLUDE_KINEMATIC); } catch (e) { ch = null; }
          const dm = mh ? mh.distance : Infinity, dc = ch ? (ch.timeOfImpact ?? ch.toi) : Infinity;
          res.rays++; if (dm < far) res.meshHits++; if (dc < far) res.colHits++; if (dm < far && dc < far) res.bothHits++;
          if (dm < far && dc > dm + 0.35) { const p = org.clone().addScaledVector(dir, dm); res.walkThrough.push({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), dm: +dm.toFixed(2), dc: dc === Infinity ? null : +dc.toFixed(2), mesh: meshLabel(mh.object), h: hh }); }
          else if (dc < far && dm > dc + 0.5) { const p = org.clone().addScaledVector(dir, dc); let tag = '?'; try { const c = ch.collider, pb = c.parent(); tag = (g.city?.colTags?.get?.(c.handle)) || (pb ? (pb.isDynamic() ? 'dynamic' : pb.isKinematic() ? 'kinematic' : 'fixed-body') : 'static') + ':' + c.shapeType(); } catch (e) { /* */ }
            res.invisible.push({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), dc: +dc.toFixed(2), dm: dm === Infinity ? null : +dm.toFixed(2), col: tag, h: hh }); }
          else res.ok++;
        }
      }
      return res;
    },
    // group nearby offenders (1.5 m cells) so one fence = one finding
    cluster(list, cell = 1.5) { const m = new Map(); for (const f of list) { const k = Math.round(f.x / cell) + ',' + Math.round(f.z / cell) + ',' + (f.mesh || f.col); const e = m.get(k); if (e) e.n++; else m.set(k, { ...f, n: 1 }); } return [...m.values()].sort((a, b) => b.n - a.n); },
  };
  return true;
})();

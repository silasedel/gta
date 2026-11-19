// Road seam probe (round 2, r2-roads, item 11), used by tools/v2/roads/seams.mjs in the page:
//   const M = await import('/src/world/surfaces/seamProbe.js'); M.seamProbe(game, nodeId)
// Samples the drawn ground surfaces straight down along every curb return and leg curb line around one graph node (0.25 m along,
// 6 offsets across the curb). The opaque, up-facing triangles of every visible mesh within 45 m are collected once into a 0.5 m
// grid (world space), so each sample is a cheap point-in-triangle test instead of a scene raycast. Flags:
//   raised = curb / slab height inside the carriageway (spikes, triangles poking into the road)
//   notch  = road height 0.3 m behind the curb line right after slab samples (gaps, missing wedges in the sidewalk)
//   zfight = two different opaque materials within 3 mm at one point (decals / paint / covers / colliders excluded)
//   step   = a jump > 4 cm in the curb top along the curb line (broken / doubled curb tops)
import * as THREE from 'three';
const OVER =
  /roadDecals|roadLines|markings|graffiti|decal|cover-|lines|paint|shadow|water|ocean|M\.far|terrain-lod|lod/i; // overlays and distance LOD layers (drawn only far away)
const visUp = (o) => {
  for (let a = o; a; a = a.parent) if (a.visible === false) return false;
  return true;
};

function collect(game, cx, cz, R) {
  const tris = [],
    grid = new Map(),
    C = 0.5,
    v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const key = (i, j) => i * 100003 + j;
  game.scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !visUp(o)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (
      !m ||
      m.visible === false ||
      m.colorWrite === false ||
      m.transparent ||
      m.depthWrite === false
    )
      return;
    const nm = (m.name || m.type) + '';
    if (OVER.test(nm) || OVER.test(o.name || '')) return;
    const g = o.geometry,
      P = g && g.attributes.position;
    if (!P) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const bs = g.boundingSphere.clone().applyMatrix4(o.matrixWorld);
    if (
      Math.hypot(bs.center.x - cx, bs.center.z - cz) - bs.radius > R ||
      bs.center.y - bs.radius > 2
    )
      return;
    const idx = g.index,
      n = idx ? idx.count : P.count,
      Mw = o.matrixWorld;
    for (let t = 0; t < n; t += 3) {
      for (let k = 0; k < 3; k++)
        v[k].fromBufferAttribute(P, idx ? idx.getX(t + k) : t + k).applyMatrix4(Mw);
      const x0 = Math.min(v[0].x, v[1].x, v[2].x),
        x1 = Math.max(v[0].x, v[1].x, v[2].x),
        z0 = Math.min(v[0].z, v[1].z, v[2].z),
        z1 = Math.max(v[0].z, v[1].z, v[2].z);
      if (x1 < cx - R || x0 > cx + R || z1 < cz - R || z0 > cz + R) continue;
      if (Math.max(v[0].y, v[1].y, v[2].y) > 1.2) continue; // ground layer only
      const ex = v[1].x - v[0].x,
        ez = v[1].z - v[0].z,
        fx = v[2].x - v[0].x,
        fz = v[2].z - v[0].z,
        den = ex * fz - ez * fx;
      if (Math.abs(den) < 1e-6) continue; // vertical faces (curb fronts) are not tops
      const T = {
        a: [v[0].x, v[0].y, v[0].z],
        ex,
        ez,
        fx,
        fz,
        ey: v[1].y - v[0].y,
        fy: v[2].y - v[0].y,
        den,
        mat: nm,
        obj: o.id,
      };
      const k0 = tris.length;
      tris.push(T);
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
        for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
          const kk = key(i, j);
          let c = grid.get(kk);
          if (!c) grid.set(kk, (c = []));
          c.push(k0);
        }
    }
  });
  const hits = (x, z) => {
    const c = grid.get(key(Math.floor(x / C), Math.floor(z / C)));
    const out = [];
    if (!c) return out;
    for (const k of c) {
      const T = tris[k],
        px = x - T.a[0],
        pz = z - T.a[2],
        u = (px * T.fz - pz * T.fx) / T.den,
        w = (T.ex * pz - T.ez * px) / T.den;
      if (u < -1e-6 || w < -1e-6 || u + w > 1 + 1e-6) continue;
      out.push({ y: T.a[1] + u * T.ey + w * T.fy, mat: T.mat, obj: T.obj });
    }
    out.sort((p, q) => q.y - p.y);
    return out;
  };
  return { hits, count: tris.length };
}

export function seamProbe(game, id) {
  const C = game.city,
    G = C.roadGraph,
    n = G.nodes[id],
    J = C.junctionOf ? C.junctionOf(n.id) : null;
  const t0 = performance.now(),
    S = collect(game, n.x, n.z, 45);
  const rep = {
    node: n.id,
    deg: (n.edges || []).length,
    kinds: n.edges.map((k) => G.edges[k].kind),
    sw: n.edges.map((k) => G.edges[k].sidewalk || 0),
    corners: J ? J.corners.map((c) => c.kind) : null,
    raised: 0,
    notch: 0,
    zfight: 0,
    step: 0,
    samples: 0,
    tris: S.count,
    pairs: {},
    worst: [],
    at: { raised: [], notch: [], zfight: [], step: [] },
  };
  const flag = (k, x, z, y, extra) => {
    rep[k]++;
    if (rep.at[k].length < 12)
      rep.at[k].push([+x.toFixed(2), +z.toFixed(2), y == null ? null : +y.toFixed(3), extra || '']);
  };
  const lines = [];
  const frAt = (L, s) => {
    const fr = L.fr;
    let i = 0;
    while (i < fr.length - 2 && fr[i + 1].s < s) i++;
    const A = fr[i],
      B = fr[i + 1] || A,
      l = B.s - A.s || 1,
      t = Math.max(0, Math.min(1, (s - A.s) / l));
    return {
      x: A.x + (B.x - A.x) * t,
      z: A.z + (B.z - A.z) * t,
      nx: A.nx + (B.nx - A.nx) * t,
      nz: A.nz + (B.nz - A.nz) * t,
    };
  };
  if (J) {
    for (const c of J.corners)
      if (c.arc && c.arc.length > 1)
        lines.push({
          pts: c.arc,
          kind: 'return:' + c.kind,
          curbed: (J.legs[c.i].sw || 0) > 0 && (J.legs[c.j].sw || 0) > 0,
        });
    for (const L of J.legs)
      for (const side of [-1, 1]) {
        const pts = [];
        for (let s = L.D; s < Math.min(L.D + 25, L.len * 0.5); s += 1) {
          const q = frAt(L, s);
          pts.push([q.x + q.nx * side * L.hw, q.z + q.nz * side * L.hw]);
        }
        if (pts.length > 1) lines.push({ pts, kind: 'leg', curbed: (L.sw || 0) > 0 });
      }
  } else
    for (const k of n.edges) {
      const e = G.edges[k],
        P = e.a === n.id ? e.pts : e.pts.slice().reverse();
      for (const side of [-1, 1]) {
        const pts = [];
        let acc = 0;
        for (let i = 0; i < P.length - 1 && acc < 30; i++) {
          const ax = P[i][0],
            az = P[i][1],
            dx = P[i + 1][0] - ax,
            dz = P[i + 1][1] - az,
            L = Math.hypot(dx, dz) || 1;
          acc += L;
          pts.push([ax - ((dz / L) * side * e.width) / 2, az + ((dx / L) * side * e.width) / 2]);
        }
        lines.push({ pts, kind: 'end', curbed: (e.sidewalk || 0) > 0 });
      }
    }
  const inRoad = (x, z) => {
    for (const k of n.edges) {
      const e = G.edges[k],
        P = e.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const ax = P[i][0],
          az = P[i][1],
          dx = P[i + 1][0] - ax,
          dz = P[i + 1][1] - az,
          L2 = dx * dx + dz * dz || 1;
        const t = ((x - ax) * dx + (z - az) * dz) / L2;
        if (t < 0 || t > 1) continue;
        if (Math.hypot(ax + dx * t - x, az + dz * t - z) < e.width / 2 - 0.25) return true;
      }
    }
    if (J) {
      const P = J.poly;
      let ins = false;
      for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
        const xa = P[a][0],
          za = P[a][1],
          xb = P[b][0],
          zb = P[b][1];
        if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) ins = !ins;
      }
      if (ins) {
        let bd = 9;
        for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
          const xa = P[a][0],
            za = P[a][1],
            dx = P[b][0] - xa,
            dz = P[b][1] - za,
            L2 = dx * dx + dz * dz || 1;
          let t = ((x - xa) * dx + (z - za) * dz) / L2;
          t = Math.max(0, Math.min(1, t));
          bd = Math.min(bd, Math.hypot(xa + dx * t - x, za + dz * t - z));
        }
        if (bd > 0.25) return true;
      }
    }
    return false;
  };
  for (const ln of lines) {
    const P = ln.pts;
    let prevTop = null;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i][0],
        az = P[i][1],
        dx = P[i + 1][0] - ax,
        dz = P[i + 1][1] - az,
        L = Math.hypot(dx, dz) || 1,
        ux = dx / L,
        uz = dz / L;
      let ox = -uz,
        oz = ux;
      const mx = ax + dx / 2,
        mz = az + dz / 2;
      if (inRoad(mx + ox * 0.6, mz + oz * 0.6) && !inRoad(mx - ox * 0.6, mz - oz * 0.6)) {
        ox = -ox;
        oz = -oz;
      } // +o: away from the carriageway
      for (let t = 0; t < L; t += 0.25) {
        const x0 = ax + ux * t,
          z0 = az + uz * t;
        let yIn = null;
        for (const off of [-0.6, -0.3, -0.1, 0.1, 0.3, 0.7]) {
          const x = x0 + ox * off,
            z = z0 + oz * off,
            h = S.hits(x, z);
          rep.samples++;
          const y = h.length ? h[0].y : null;
          if (off === 0.3) yIn = y;
          if ((off === -0.3 || off === -0.1) && ln.curbed && /^return/.test(ln.kind)) {
            rep.gutterN = (rep.gutterN || 0) + 1;
            if (y != null && y > 0.051 && y < 0.057) rep.gutterHit = (rep.gutterHit || 0) + 1;
          } // gutter pan strip along curbed returns
          if (y != null && y > 0.11 && y < 0.6 && off <= -0.3 && inRoad(x, z))
            flag('raised', x, z, y, ln.kind + ':' + h[0].mat);
          for (let a2 = 0; a2 + 1 < h.length; a2++) {
            const A = h[a2],
              B = h[a2 + 1];
            if (A.y - B.y < 0.003 && A.obj !== B.obj && A.mat !== B.mat) {
              const pk = [A.mat, B.mat].sort().join(' | ');
              rep.pairs[pk] = (rep.pairs[pk] || 0) + 1;
              if (rep.pairs[pk] <= 3)
                rep.at.zfight.push([+x.toFixed(2), +z.toFixed(2), +A.y.toFixed(3), pk]);
              rep.zfight++;
              break;
            }
          }
        }
        if (
          prevTop != null &&
          prevTop > 0.12 &&
          yIn != null &&
          yIn < 0.09 &&
          !inRoad(x0 + ox * 0.3, z0 + oz * 0.3) &&
          ln.curbed !== false
        )
          flag('notch', x0 + ox * 0.3, z0 + oz * 0.3, yIn, ln.kind);
        if (
          prevTop != null &&
          yIn != null &&
          prevTop > 0.12 &&
          yIn > 0.12 &&
          Math.abs(prevTop - yIn) > 0.04
        )
          flag('step', x0, z0, yIn, ln.kind);
        prevTop = yIn;
      }
    }
  }
  rep.gutter = rep.gutterN ? +(rep.gutterHit / rep.gutterN).toFixed(2) : null; // share of curbed-return gutter samples on the pan strip
  rep.ms = Math.round(performance.now() - t0);
  return rep;
}

// Guardrail / railing audit (r2-roads): every triangle of the rail meshes (material M.guardrail) within R m of (x, z):
//   wet    = rail or post over water / sand (centroid), i.e. a railing running off the paving onto the beach or the shallows
//   sunk   = lowest vertex more than 0.3 m under the ground there (post or rail not standing on the ground)
//   flat   = a rail strip lying down (a long thin triangle whose normal is near vertical while the strip is not a post top)
export function railAudit(game, x, z, R = 120) {
  const C = game.city,
    out = { tris: 0, wet: 0, sunk: 0, flat: 0, at: [] },
    v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const surf = (px, pz) => {
    try {
      return String(C.surfaceAt ? C.surfaceAt(px, pz) : '');
    } catch (e) {
      return '';
    }
  };
  game.scene.traverse((o) => {
    if (!o.isMesh || !visUp(o)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || !/guardrail/i.test(m.name || '')) return;
    if (/cable|wire/i.test(o.name || '')) return;
    const g = o.geometry,
      P = g.attributes.position,
      idx = g.index,
      n = idx ? idx.count : P.count;
    for (let t = 0; t < n; t += 3) {
      for (let k = 0; k < 3; k++)
        v[k].fromBufferAttribute(P, idx ? idx.getX(t + k) : t + k).applyMatrix4(o.matrixWorld);
      const cx = (v[0].x + v[1].x + v[2].x) / 3,
        cz = (v[0].z + v[1].z + v[2].z) / 3;
      if (Math.hypot(cx - x, cz - z) > R) continue;
      const ymin = Math.min(v[0].y, v[1].y, v[2].y),
        ymax = Math.max(v[0].y, v[1].y, v[2].y);
      if (ymin > 3) continue; // decks / wires overhead
      out.tris++;
      const gy = C.groundHeightAt ? C.groundHeightAt(cx, cz) || 0 : 0,
        wet = (C.isWater && C.isWater(cx, cz)) || /sand|water/.test(surf(cx, cz));
      const e1 = v[1].clone().sub(v[0]),
        e2 = v[2].clone().sub(v[0]),
        nrm = e1.clone().cross(e2),
        area = nrm.length() / 2;
      nrm.normalize();
      const long = Math.max(e1.length(), e2.length(), v[2].distanceTo(v[1])),
        flat =
          Math.abs(nrm.y) > 0.9 &&
          long > 1.5 &&
          ymax - ymin < 0.05 &&
          ymax < gy + 1.4 &&
          area < long * 0.2;
      const sunk = ymin < gy - 0.3;
      if (wet) out.wet++;
      if (sunk) out.sunk++;
      if (flat) out.flat++;
      if ((wet || sunk || flat) && out.at.length < 12)
        out.at.push([
          +cx.toFixed(1),
          +cz.toFixed(1),
          +ymin.toFixed(2),
          wet ? 'wet' : sunk ? 'sunk' : 'flat',
        ]);
    }
  });
  return out;
}

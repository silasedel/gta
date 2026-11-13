// ELEVATED tools: build the whole elevated network into a Rapier world (all tiles), plus a flat "street" plane at 0.05
import { loadData } from './env.mjs';
import * as THREE from 'three'; import RAPIER from '@dimforge/rapier3d-compat';
import { createElevated } from '../../elevated.js';
export async function makeWorld({ ground = true } = {}) {
  await RAPIER.init();
  const data = await loadData();
  const t0 = performance.now();
  const el = createElevated({ THREE, RAPIER, data });
  const tCreate = performance.now() - t0;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const kind = new Map(); let worstStep = 0, worstTile = null;
  const keys = data.tileKeys.map((k) => String(k).split(/[,_:]/).map(Number));
  for (const [tx, tz] of keys) {
    const it = el.buildTileSteps(tx, tz, null, { visual: false }); let r;
    while (true) { const a = performance.now(); r = it.next(); const dt = performance.now() - a; if (dt > worstStep) { worstStep = dt; worstTile = [tx, tz]; } if (r.done) break; }
    for (const c of r.value.colliderDescs) { const h = world.createCollider(c.desc); kind.set(h.handle, c.kind); }
  }
  if (ground) {
    const g = world.createCollider(RAPIER.ColliderDesc.cuboid(20000, 1, 20000).setTranslation(0, -1, 0)); kind.set(g.handle, 'ground');
    // the city's street ribbons (y = 0.05) for every non-owned edge near the elevated network
    const near = new Set(); for (const c of el.network.chains) for (let i = 0; i < c.n; i += 5) near.add(Math.floor(c.x[i] / 50) * 100000 + Math.floor(c.z[i] / 50));
    const isNear = (x, z) => { const a = Math.floor(x / 50), b = Math.floor(z / 50); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (near.has((a + i) * 100000 + b + j)) return true; return false; };
    const v = [];
    for (const e of data.roadGraph.edges) { if (el.ownsEdge(e.id)) continue; const P = e.pts; if (!P.some((p) => isNear(p[0], p[1]))) continue; const hw = e.width / 2;
      for (let i = 0; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * hw, nz = dx / l * hw;
        v.push(ax - nx, 0.05, az - nz, ax + nx, 0.05, az + nz, bx + nx, 0.05, bz + nz, ax - nx, 0.05, az - nz, bx + nx, 0.05, bz + nz, bx - nx, 0.05, bz - nz); }
      // junction discs
    }
    for (const n of data.roadGraph.nodes) { if (n.edges.length < 3 || !isNear(n.x, n.z) || el.isGroundJunctionBlocked(n.id)) continue; if (!n.edges.some((k) => !el.ownsEdge(k)) && n.y >= 0.3) continue;
      let w = 0; for (const k of n.edges) w = Math.max(w, data.roadGraph.edges[k].width); const R = w / 2 + 3;
      for (let k = 0; k < 24; k++) { const a0 = k / 24 * Math.PI * 2, a1 = (k + 1) / 24 * Math.PI * 2; v.push(n.x, 0.055, n.z, n.x + Math.cos(a0) * R, 0.055, n.z + Math.sin(a0) * R, n.x + Math.cos(a1) * R, 0.055, n.z + Math.sin(a1) * R); } }
    const idx = new Uint32Array(v.length / 3); for (let i = 0; i < idx.length; i++) idx[i] = i;
    const h = world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(v), idx)); kind.set(h.handle, 'street');
  }
  world.step();
  return { RAPIER, THREE, data, el, net: el.network, world, kind, tCreate, worstStep, worstTile };
}

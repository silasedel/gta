// Seated people on real furniture (r2-people; user: "they look terrible and unrealistic when sitting"). Benches, chairs,
// armchairs, sofas, stools: the seat is probed on the actual meshes under the sitter (rays down along the seat's center
// line find the cushion and the backrest front; rays to the sides find armrests), then the shared seat solver
// (src/npc/seat.js) puts the hips ~9 cm above the cushion and ~13 cm in front of the backrest, feet on the floor, the
// torso against the backrest, and adds slow low-amplitude life (breathing-scale recline drift, weight shifts, looking
// around). Each sitter gets a natural variant: leaning back with hands on the thighs, leaning forward with the hands
// clasped by the knees, hands clasped in the lap, a phone held low, an arm over the armrest, turned a little toward a
// neighbor. Seats too small or not found keep the clip pose. Called by src/npc/peds.js for state 'bench'.
import * as THREE from 'three';
import { seatCharacter, solveSeat, unseatCharacter } from './seat.js';

const _rc = new THREE.Raycaster();
const PROBES = new Map();
export const DEBUG = { last: null };
const DOWN = new THREE.Vector3(0, -1, 0);
function isPerson(o) { for (let p = o; p; p = p.parent) if (p.name && /^(npc-|character-|npc-crowd|npc-people)/.test(p.name)) return true; return false; }
function nearMeshes(scene, c, r) {
  const out = []; const sph = new THREE.Sphere();
  scene.traverse((o) => {
    if (!o.visible) return;
    if (!(o.isMesh || o.isInstancedMesh) || o.isSkinnedMesh || isPerson(o)) return;
    const g = o.geometry; if (!g) return; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingSphere) return;
    sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
    if (o.isInstancedMesh) { out.push(o); return; }
    if (sph.center.distanceTo(c) < sph.radius + r) out.push(o);
  });
  return out;
}
function castY(meshes, x, y, z, far) {
  _rc.set(new THREE.Vector3(x, y, z), DOWN); _rc.far = far;
  const sides = []; for (const m of meshes) for (const mt of Array.isArray(m.material) ? m.material : [m.material]) if (mt && mt.side !== THREE.DoubleSide) { sides.push([mt, mt.side]); mt.side = THREE.DoubleSide; }
  try { const h = _rc.intersectObjects(meshes, false).find((i) => !i.object.material?.transparent); return h ? h.point.y : null; } finally { for (const [mt, sd] of sides) mt.side = sd; }
}
/** probe a seat at the sitter's spot (world): { cushion, backZ (local, from the spot), front, armL, armR } or null */
export function probeFurniture(scene, pos, heading, floorY) {
  const key = Math.round(pos.x * 4) + ',' + Math.round(pos.z * 4) + ',' + Math.round(heading * 10);
  if (PROBES.has(key)) return PROBES.get(key);
  const fx = Math.sin(heading), fz = Math.cos(heading), lx = Math.cos(heading), lz = -Math.sin(heading);
  const meshes = nearMeshes(scene, pos, 1.6);
  const top = floorY + 1.6;
  // walk along the seat's center line from 0.35 m in front of the spot to 0.75 m behind it
  const prof = [];
  for (let t = 0.35; t >= -0.75; t -= 0.05) { const y = castY(meshes, pos.x + fx * t, top, pos.z + fz * t, 1.75); prof.push([t, y === null ? null : y - floorY]); }
  // cushion: the LOWEST flat run (>= 3 neighboring samples within 3 cm) between 0.28 and 0.8 m: armrests, backs and
  // table tops are higher, so the most common height is not the seat (lobby armchairs: people sat on the arm)
  const hs = prof.filter(([, h]) => h !== null && h > 0.28 && h < 0.8);
  let res = null;
  let best = null;
  for (let i = 0; i + 2 < prof.length; i++) {
    const r = [prof[i][1], prof[i + 1][1], prof[i + 2][1]];
    if (prof[i][0] > 0.2 || r.some((h) => h === null || h < 0.28 || h > 0.8)) continue;   // on the seat, not a coffee table in front
    if (Math.max(...r) - Math.min(...r) > 0.03) continue;
    const h = (r[0] + r[1] + r[2]) / 3; if (best === null || h < best - 0.02) best = h;
  }
  if (best !== null) {
    const cush = hs.filter(([, h]) => Math.abs(h - best) < 0.05);
    const front = Math.max(...cush.map(([t]) => t));
    const behind = prof.filter(([t, h]) => t < front && h !== null && h > best + 0.15);   // the backrest rises behind the cushion
    const backZ = behind.length ? Math.max(...behind.map(([t]) => t)) : Math.min(...cush.map(([t]) => t)) - 0.05;
    const depth = front - backZ;
    if (depth > 0.28) {
      // armrests: a raised surface 0.2-0.45 m to each side at mid-seat
      const mid = backZ + depth * 0.5; const arm = [];
      for (const sg of [1, -1]) {
        let found = null;
        for (let o = 0.22; o <= 0.46 && !found; o += 0.04) { const y = castY(meshes, pos.x + fx * mid + lx * o * sg, top, pos.z + fz * mid + lz * o * sg, 1.75); if (y !== null && y - floorY > best + 0.12 && y - floorY < best + 0.45) found = { o, h: y - floorY }; }
        arm.push(found);
      }
      res = { cushion: best, front, backZ, depth, armL: arm[0], armR: arm[1], back: !!behind.length };
    }
  }
  PROBES.set(key, res); DEBUG.last = { key, res, prof, meshes: meshes.length };
  return res;
}

const VARIANTS = ['back', 'back', 'forward', 'clasped', 'phone', 'armrest', 'turned'];
/** after ped.char.update(): pose a bench / chair sitter on the probed seat (call every frame while seated) */
export function sitOnFurniture(game, ped, dt) {
  const ch = ped.char; if (!ch?.root) return;
  let F = ped._furn;
  if (!F) {
    F = ped._furn = { ok: false };
    const floor = ped.groundY ?? ped.pos.y;
    const pr = probeFurniture(game.scene, ped.spot?.pos || ped.pos, ped.heading, floor);
    F.pr = pr; F.floor = floor; F.prof = DEBUG.last?.prof;
    if (!pr) return;
    const fx = Math.sin(ped.heading), fz = Math.cos(ped.heading), lx = Math.cos(ped.heading), lz = -Math.sin(ped.heading);
    const base = ped.spot?.pos || ped.pos;
    const hz = pr.backZ + 0.13 + (pr.back ? 0 : 0.1);                       // ~13 cm in front of the backrest
    const seed = ((ped.id || 1) * 2654435761 >>> 0) / 4294967296;
    let v = VARIANTS[Math.floor(seed * VARIANTS.length)];
    const kid = ch.personMeta?.age === 'kid';
    if (v === 'armrest' && !pr.armL && !pr.armR) v = 'back';
    const hip = new THREE.Vector3(base.x + fx * hz, floor + pr.cushion + 0.09, base.z + fz * hz);
    const knee = 0.44 + seed * 0.12 + (v === 'forward' ? 0.06 : 0);          // heels 0.44-0.62 m ahead of the hips (knees ~90-105 deg)
    // feet on the floor in front of the seat's front edge (deep sofas: never tucked under the cushion)
    const heelZ = Math.max(hz + knee, pr.front + 0.06 + seed * 0.16) - hz;
    const heel = new THREE.Vector3(hip.x + fx * heelZ, floor, hip.z + fz * heelZ);
    const W = (x, y, z) => new THREE.Vector3(hip.x + fx * z + lx * x, hip.y + y, hip.z + fz * z + lz * x);
    const A = { id: 'front', i: 1, open: true, roofY: NaN, doorX: 3, wheel: null, hip, heel, yaw: ped.heading + (v === 'turned' ? (seed < 0.5 ? 0.3 : -0.3) : 0),
      recline: v === 'forward' ? -14 : v === 'phone' ? 8 : v === 'clasped' ? 12 : (pr.back ? 20 : 6) + seed * 6 };
    if (v === 'forward') A.grips = [{ side: 'Left', p: W(0.05, 0.12, heelZ * 0.78) }, { side: 'Right', p: W(-0.05, 0.12, heelZ * 0.78) }];
    else if (v === 'clasped') A.grips = [{ side: 'Left', p: W(0.04, 0.14, 0.24) }, { side: 'Right', p: W(-0.04, 0.14, 0.24) }];
    else if (v === 'phone' && !kid) A.grips = [{ side: 'Right', p: W(-0.06, 0.36, 0.3) }];
    else if (v === 'armrest') { const a = pr.armL || pr.armR, sg = pr.armL ? 1 : -1; A.grips = [{ side: sg > 0 ? 'Left' : 'Right', p: W(sg * (a.o - 0.02), a.h - pr.cushion - 0.09 + 0.05, 0.12) }]; }
    seatCharacter(ch, A, { role: 'passenger', manual: true, probe: false });
    if (v === 'phone' && ch._seat) ch._seat.chin = 14;                       // looking down at the phone
    F.ok = true; F.v = v;
  }
  if (F.ok) solveSeat(ch, dt);
}
/** the sitter got up (or was released): drop the seat pose */
export function standUp(ped) { if (ped?._furn) { ped._furn = null; unseatCharacter(ped.char); } }

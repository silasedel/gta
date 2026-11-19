// W7 naval pier (airports agent, Nov 19): a small Navy pier on the shore next to Southline Air Station, with the
// mission props agent's ships moored alongside: the coastal patrol ship (mission/navy_patrol, 55 m) on one side and
// the destroyer (mission/navy_destroyer, 155 m, moored bow out with open water round it) on the other. The site is
// searched on the shore near the main gate: a land root, open water for the pier and both berths, and nothing under
// the runways' approach paths (the destroyer's mast is 51 m). A chain-link fence (fence-11mb) closes the pier root,
// with a guard hut (checkpoint-building) and a steel watchtower (military-watchtower-1) at the entrance.
import * as THREE from 'three';
import { pip } from './geom.js';
import { cutoutModel, instanceProp } from './dressing.js';

const PIER_W = 10; // deck width
const PIER_L = 185; // deck length beyond the waterline
const DESTROYER = { path: 'mission/navy_destroyer', half: 77.8, beam: 11, draft: 8.0, lod: 400 };
const PATROL = { path: 'mission/navy_patrol', half: 27.5, beam: 4.2, draft: 2.0, lod: 250 };

// Sites: land points on a 20 m grid round the base; for each, 24 headings out to sea. A site needs land at the root,
// water within 30 m and then water all along the pier, the destroyer berth (+side) and the patrol berth (-side).
function findSite(game, ap, gate) {
  const water = (x, z) => !!game.city.isWater?.(x, z);
  const cx = gate ? gate.x : ap.center[0];
  const cz = gate ? gate.z : ap.center[1];
  // the runways' extended centerlines (2 km out from each end, 220 m either side) stay clear
  const underApproach = (x, z) =>
    ap.runways.some((r) => {
      for (const [e, o] of [
        [r.a, r.b],
        [r.b, r.a],
      ]) {
        const dx = e[0] - o[0];
        const dz = e[1] - o[1];
        const L = Math.hypot(dx, dz);
        const ux = dx / L;
        const uz = dz / L;
        const along = (x - e[0]) * ux + (z - e[1]) * uz;
        const side = Math.abs((x - e[0]) * uz - (z - e[1]) * ux);
        if (along > -100 && along < 2000 && side < 220) return true;
      }
      return false;
    });
  // nearest first, so the search stops at the first good site that nothing nearer can beat
  const grid = [];
  for (let gx = -700; gx <= 700; gx += 20) {
    for (let gz = -700; gz <= 700; gz += 20) grid.push([gx, gz, Math.hypot(gx, gz)]);
  }
  grid.sort((p, q) => p[2] - q[2]);
  const nearShore = (x, z) =>
    [0, 1, 2, 3, 4, 5, 6, 7].some((k) =>
      water(x + Math.sin(k * 0.785) * 26, z + Math.cos(k * 0.785) * 26),
    );
  let best = null;
  for (const [gx, gz, d] of grid) {
    const px = cx + gx;
    const pz = cz + gz;
    if (best && d > best.score) break;
    if (water(px, pz) || !nearShore(px, pz) || pip(ap.airside, px, pz)) continue;
    for (let k = 0; k < 24; k++) {
      const h = (k / 24) * Math.PI * 2;
      const ux = Math.sin(h);
      const uz = Math.cos(h);
      const rx = Math.cos(h);
      const rz = -Math.sin(h);
      let shore = -1;
      for (let s = 2; s <= 30; s += 2) {
        if (water(px + ux * s, pz + uz * s)) {
          shore = s;
          break;
        }
      }
      if (shore < 0) continue;
      let ok = true;
      for (let a = shore + 8; a <= shore + PIER_L + 60 && ok; a += 10) {
        for (const side of [-30, -18, -8, 0, 8, 18, 30, 45, 60]) {
          const x = px + ux * a + rx * side;
          const z = pz + uz * a + rz * side;
          if (!water(x, z) || underApproach(x, z)) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      const score = d + shore;
      if (!best || score < best.score) best = { x: px, z: pz, h, shore, score };
    }
  }
  return best;
}

export async function buildPier(kit) {
  const { game, ap, group, ground, boxCol, place, lodSwap, out, signMesh } = kit;
  const site = findSite(game, ap, out.gate);
  if (!site) {
    console.warn('[base] no naval pier site');
    return null;
  }
  const SEA = game.city.seaLevel ?? -0.12;
  const h = site.h;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const rx = Math.cos(h);
  const rz = -Math.sin(h);
  // the root: a few meters back on land; local (along, side) from there
  const root = { x: site.x, z: site.z };
  const P = (along, side) => ({
    x: root.x + fx * along + rx * side,
    z: root.z + fz * along + rz * side,
  });
  const groundRoot = ground(root.x, root.z);
  const deckTop = Math.max(SEA + 1.6, groundRoot + 0.12);
  const len = site.shore + PIER_L;

  // deck (concrete) with a curb, piles and bollards
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3d3f42, roughness: 0.7, metalness: 0.3 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd8b03a, roughness: 0.6 });
  const mid = P(len / 2, 0);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(PIER_W, 1.0, len), concrete);
  deck.position.set(mid.x, deckTop - 0.5, mid.z);
  deck.rotation.y = h;
  deck.receiveShadow = true;
  deck.castShadow = true;
  group.add(deck);
  boxCol(mid.x, deckTop - 0.5, mid.z, PIER_W / 2, 0.5, len / 2, h);
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, len), yellow);
    const c = P(len / 2, side * (PIER_W / 2 - 0.15));
    curb.position.set(c.x, deckTop + 0.12, c.z);
    curb.rotation.y = h;
    group.add(curb);
  }
  // a ramp from the ground up to the deck when the shore is low
  if (deckTop - groundRoot > 0.3) {
    const rise = deckTop - groundRoot;
    const run = Math.max(6, rise * 6);
    const rc = P(-run / 2, 0);
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(PIER_W, 0.4, Math.hypot(run, rise)),
      concrete,
    );
    ramp.position.set(rc.x, groundRoot + rise / 2 - 0.2, rc.z);
    ramp.rotation.set(0, h, 0, 'YXZ');
    ramp.rotateX(-Math.atan2(rise, run));
    group.add(ramp);
    const q = new THREE.Quaternion().setFromEuler(ramp.rotation);
    try {
      const { world, RAPIER, body } = kit.physics;
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(PIER_W / 2, 0.2, Math.hypot(run, rise) / 2)
          .setTranslation(rc.x, groundRoot + rise / 2 - 0.2, rc.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
        body,
      );
    } catch (e) {
      /* */
    }
  }
  const piles = [];
  const bollards = [];
  for (let a = site.shore; a <= len; a += 9) {
    for (const side of [-1, 1]) {
      const p = P(a, side * (PIER_W / 2 - 0.4));
      piles.push(p);
      if (Math.round(a / 9) % 2 === 0) bollards.push(P(a, side * (PIER_W / 2 - 0.7)));
    }
  }
  const pileDepth = deckTop - (SEA - 6);
  addInstanced(group, new THREE.CylinderGeometry(0.35, 0.35, pileDepth, 8), dark, piles, (p) => [
    p.x,
    deckTop - 1 - pileDepth / 2 + 0.5,
    p.z,
  ]);
  addInstanced(group, new THREE.CylinderGeometry(0.22, 0.28, 0.6, 10), dark, bollards, (p) => [
    p.x,
    deckTop + 0.3,
    p.z,
  ]);
  // lamp posts every 30 m on the patrol side (light pools come from the base's night lights)
  const poles = [];
  const heads = [];
  for (let a = site.shore + 10; a <= len; a += 30) {
    const p = P(a, -(PIER_W / 2 - 0.6));
    poles.push(p);
    heads.push(P(a, -(PIER_W / 2 - 1.4)));
  }
  addInstanced(group, new THREE.CylinderGeometry(0.09, 0.12, 7, 6), dark, poles, (p) => [
    p.x,
    deckTop + 3.5,
    p.z,
  ]);
  const lampM = new THREE.MeshStandardMaterial({
    color: 0xfff2d0,
    emissive: 0xffe2a0,
    emissiveIntensity: 1.2,
  });
  addInstanced(group, new THREE.BoxGeometry(0.5, 0.18, 1.6), lampM, heads, (p) => [
    p.x,
    deckTop + 7,
    p.z,
  ]);

  // the ships, bow out
  const ships = [];
  async function moor(S, along, side) {
    const p = P(along, side);
    const y = SEA - S.draft;
    const src = await kit.loadModel(S.path);
    if (!src) return null;
    const o = src.clone(true);
    o.position.set(p.x, y, p.z);
    o.rotation.y = h;
    group.add(o);
    lodSwap(o, S.path + '_lod1', S.lod);
    // the hull: a box from the keel to the main deck, so nothing drives or swims through it
    boxCol(p.x, SEA + 1.5, p.z, S.beam * 0.8, S.draft + 1.5, S.half * 0.92, h);
    ships.push({ id: S.path.split('/')[1], x: p.x, z: p.z, heading: h });
    return o;
  }
  const patrolAlong = site.shore + 14 + PATROL.half;
  await moor(PATROL, patrolAlong, -(PIER_W / 2 + PATROL.beam + 1.6));
  await moor(DESTROYER, site.shore + 22 + DESTROYER.half, PIER_W / 2 + DESTROYER.beam + 2.2);

  // the pier root: a chain-link fence across the shore with a gap for the pier, a guard hut and a watchtower
  await cutoutModel('airport/base_mesh_fence');
  const panels = [];
  for (let side = -50; side <= 50; side += 5.6) {
    if (Math.abs(side) < 7) continue;
    const p = P(-14, side);
    if (game.city.isWater?.(p.x, p.z)) continue;
    panels.push({ x: p.x, y: ground(p.x, p.z), z: p.z, h });
  }
  await instanceProp(group, 'airport/base_mesh_fence', panels, false);
  for (const s of [-1, 1]) {
    const c = P(-14, s * 29);
    boxCol(c.x, ground(c.x, c.z) + 1.75, c.z, 22, 1.75, 0.15, h);
  }
  const hut = P(-20, -12);
  await place('airport/base_checkpoint', hut.x, hut.z, h + Math.PI / 2, 1, true);
  const tower = P(-22, 15);
  const t = await place('airport/base_mil_tower', tower.x, tower.z, h + Math.PI, 1, true);
  if (t) lodSwap(t, 'airport/base_mil_tower_lod1', 260);
  // name board at the entrance
  const board = signMesh(4.2, 1.5, (g, w, hh) => {
    g.fillStyle = '#1f2a3a';
    g.fillRect(0, 0, w, hh);
    g.strokeStyle = '#d9c78a';
    g.lineWidth = 8;
    g.strokeRect(8, 8, w - 16, hh - 16);
    g.fillStyle = '#efe6c8';
    g.textAlign = 'center';
    g.font = 'bold 46px Arial';
    g.fillText('SOUTHLINE NAVAL PIER', w / 2, hh * 0.45);
    g.font = 'bold 26px Arial';
    g.fillText('AUTHORIZED PERSONNEL ONLY', w / 2, hh * 0.78);
  });
  const bp = P(-17, 8.5);
  board.position.set(bp.x, ground(bp.x, bp.z) + 1.9, bp.z);
  board.rotation.y = h + Math.PI;
  group.add(board);

  const result = {
    x: root.x,
    z: root.z,
    heading: h,
    length: len,
    deckTop,
    ships,
    end: P(len, 0),
  };
  out.pier = result;
  return result;
}

// Instanced simple meshes at points; pos(p) -> [x, y, z].
function addInstanced(group, geo, mat, points, pos) {
  if (!points.length) return;
  const im = new THREE.InstancedMesh(geo, mat, points.length);
  const M = new THREE.Matrix4();
  points.forEach((p, i) => {
    const [x, y, z] = pos(p);
    M.makeTranslation(x, y, z);
    im.setMatrixAt(i, M);
  });
  im.computeBoundingSphere();
  im.castShadow = true;
  im.receiveShadow = true;
  group.add(im);
}

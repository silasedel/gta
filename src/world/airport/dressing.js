// W7 base dressing (airports agent, Nov 19): the user's downloaded camp and perimeter props make Southline Air Station
// read as a working base: a tent camp with a wire fence, sandbag lines and a wooden watchtower, two operations huts
// with sandbag walls at their doors, sandbag gun nests by the flight line, a radio mast by the tower and a steel
// watchtower at the south end. Models (tools/v2/airport/prep_base_props.py + convert.sh, models.json base_*):
//   airport/base_tent (tent-military), base_sb_line / base_sb_nest / base_sb_store (sandbags-defense-line),
//   base_sb_wall (sandbag-wall-24mb), base_wire_fence (wire-fence), base_mesh_fence (fence-11mb),
//   base_wood_tower (wooden-watchtower), base_hut (military-style-building-with-animations, outside only),
//   base_mil_tower (military-watchtower-1), base_mast (simple-signal-tower), base_checkpoint (checkpoint-building).
// Repeated props (fence sections, sandbag walls) are instanced: one draw call per material for the whole line.
import * as THREE from 'three';
import { loadModel } from './models.js';

// Fence wire, chain link and the mast lattice are alpha textures: cut them out instead of blending (no sorting,
// shadows keep the holes).
const CUTOUT = /base_(wire_fence|mesh_fence|mast)/;

export async function cutoutModel(path) {
  const src = await loadModel(path);
  if (!src || !CUTOUT.test(path) || src.userData.cutout) return src;
  src.traverse((m) => {
    if (!m.isMesh) return;
    for (const mt of [].concat(m.material)) {
      if (!mt.map && !mt.alphaMap) continue;
      mt.transparent = false;
      mt.depthWrite = true;
      mt.alphaTest = 0.45;
      mt.side = THREE.DoubleSide;
      mt.needsUpdate = true;
    }
  });
  src.userData.cutout = true;
  return src;
}

// One InstancedMesh per mesh of the model for a list of placements [{ x, y, z, h }].
export async function instanceProp(group, path, items, castShadow = true) {
  const src = await cutoutModel(path);
  if (!src || !items.length) return null;
  src.updateMatrixWorld(true);
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const P = new THREE.Vector3();
  const made = [];
  src.traverse((m) => {
    if (!m.isMesh) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, items.length);
    items.forEach((it, i) => {
      Q.setFromAxisAngle(up, it.h);
      P.set(it.x, it.y, it.z);
      M.compose(P, Q, one).multiply(m.matrixWorld);
      im.setMatrixAt(i, M);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = castShadow;
    im.receiveShadow = true;
    group.add(im);
    made.push(im);
  });
  return made;
}

export async function dressBase(kit) {
  const { ap, ground, boxCol, place, lodSwap, freeSpot, out, group, signMesh } = kit;
  const placed = (out.dressing = {});
  const walls = [];
  const fences = [];

  // a frame on the ground: c = center, h = heading; local (along, side) -> world
  const frame = (c, h) => {
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    return (along, side) => ({ x: c.x + fx * along + rx * side, z: c.z + fz * along + rz * side });
  };

  // The parallel taxiway runs along the east side of the field; the long hangar stands between the runways.
  const twA = ap.taxiways.find((t) => t.id === 'A');
  const twHeading = twA
    ? Math.atan2(twA.pts[1][0] - twA.pts[0][0], twA.pts[1][1] - twA.pts[0][1])
    : kit.th + Math.PI / 2;
  const westOf = kit.th; // the old terminal heading faces west, toward the runways

  // A row of sandbag wall segments (3.3 m each) from a along a heading.
  function sandbagRow(a, h, count) {
    const ux = Math.sin(h);
    const uz = Math.cos(h);
    for (let i = 0; i < count; i++) {
      const x = a.x + ux * (i + 0.5) * 3.2;
      const z = a.z + uz * (i + 0.5) * 3.2;
      walls.push({ x, y: ground(x, z), z, h: h + Math.PI / 2 });
    }
    const mx = a.x + (ux * count * 3.2) / 2;
    const mz = a.z + (uz * count * 3.2) / 2;
    boxCol(mx, ground(mx, mz) + 0.55, mz, 0.4, 0.55, (count * 3.2) / 2, h);
  }

  // A straight run of wire fence sections (4 m each, model length along +Z), skipping water.
  function fenceRun(a, b) {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(L / 4.0));
    const h = Math.atan2(b.x - a.x, b.z - a.z);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (kit.game.city.isWater?.(x, z)) continue;
      fences.push({ x, y: ground(x, z), z, h });
    }
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    boxCol(mx, ground(mx, mz) + 0.8, mz, 0.1, 0.8, L / 2, h);
  }

  // Field camp: four tents on a central lane, a wire fence round it (gap at the entrance), sandbag lines at
  // the entrance, a sandbag store and a wooden watchtower in a corner.
  async function placeCamp() {
    const hl = out.hangars?.long;
    const near = hl
      ? [
          { x: hl.x + Math.sin(westOf) * 70, z: hl.z + Math.cos(westOf) * 70 },
          { x: hl.x + Math.sin(twHeading) * 110, z: hl.z + Math.cos(twHeading) * 110 },
          { x: hl.x - Math.sin(twHeading) * 110, z: hl.z - Math.cos(twHeading) * 110 },
        ]
      : [];
    const c = freeSpot([...near, { x: -4880, z: 6320 }, { x: -4950, z: 6390 }], twHeading, 31, 25);
    if (!c) return;
    const h = twHeading;
    const P = frame(c, h);
    for (const along of [-9, 9]) {
      for (const side of [-12.5, 12.5]) {
        const p = P(along, side);
        const face = side > 0 ? h - Math.PI / 2 : h + Math.PI / 2;
        await place('airport/base_tent', p.x, p.z, face, 1, true);
      }
    }
    const store = P(21, 0);
    await place('airport/base_sb_store', store.x, store.z, h + Math.PI / 2, 1, true);
    const tower = P(25, 19);
    const t = await place('airport/base_wood_tower', tower.x, tower.z, h + Math.PI, 1, true);
    if (t) (out.towers ||= []).push(tower);
    // the fence: closed except a 10 m gap at the -along end
    const corners = [P(-29, 23), P(29, 23), P(29, -23), P(-29, -23)];
    fenceRun(corners[0], corners[1]);
    fenceRun(corners[1], corners[2]);
    fenceRun(corners[2], corners[3]);
    fenceRun(corners[3], P(-29, -5));
    fenceRun(P(-29, 5), corners[0]);
    for (const side of [-11, 11]) {
      const p = P(-33, side);
      await place('airport/base_sb_line', p.x, p.z, h + Math.PI / 2, 1, true);
    }
    placed.camp = { x: c.x, z: c.z, h };
  }

  // Two operations huts by the flight line, doors toward the runways, sandbag walls beside the doors.
  async function placeHuts() {
    const T = ap.tower;
    const cand = [
      { x: T.x + 14, z: T.z + 40 },
      { x: T.x + 10, z: T.z + 64 },
      { x: T.x + 22, z: T.z - 30 },
      kit.at(-20, 160),
      kit.at(-20, 185),
      kit.at(-24, 300),
      kit.at(-24, 325),
    ];
    placed.huts = [];
    for (let k = 0; k < 2; k++) {
      const s = freeSpot(cand, westOf, 11, 7, 260);
      if (!s) break;
      const hut = await place('airport/base_hut', s.x, s.z, westOf, 1, true);
      if (hut) lodSwap(hut, 'airport/base_hut_lod1', 240);
      const P = frame(s, westOf);
      sandbagRow(P(11.5, -6.2), westOf + Math.PI / 2, 1);
      sandbagRow(P(11.5, 6.2), westOf - Math.PI / 2, 1);
      placed.huts.push({ x: s.x, z: s.z });
    }
  }

  // Sandbag gun nests by the flight line, facing the runway.
  async function placeNests() {
    const cand = [
      kit.at(52, -95),
      kit.at(52, 110),
      kit.at(20, 215),
      kit.at(20, 330),
      kit.at(60, 260),
    ];
    placed.nests = [];
    for (let k = 0; k < 3; k++) {
      const s = freeSpot(cand, westOf, 5, 5, 140);
      if (!s) break;
      await place('airport/base_sb_nest', s.x, s.z, westOf, 1, true);
      placed.nests.push({ x: s.x, z: s.z });
    }
  }

  // The radio mast near the tower (guyed lattice, red / white), sandbags round its foot.
  async function placeMast() {
    const T = ap.tower;
    const s = freeSpot(
      [
        { x: T.x + 16, z: T.z - 14 },
        { x: T.x + 18, z: T.z + 18 },
        { x: T.x - 20, z: T.z - 20 },
      ],
      0,
      3,
      3,
      120,
    );
    if (!s) return;
    await cutoutModel('airport/base_mast');
    await cutoutModel('airport/base_mast_lod1');
    const m = await place('airport/base_mast', s.x, s.z, 0.3, 1, false);
    if (m) lodSwap(m, 'airport/base_mast_lod1', 300);
    boxCol(s.x, ground(s.x, s.z) + 15, s.z, 1.1, 15, 1.1, 0.3);
    sandbagRow({ x: s.x - 3.5, z: s.z - 3.5 }, Math.PI / 2, 2);
    sandbagRow({ x: s.x - 3.5, z: s.z + 3.5 }, Math.PI / 2, 2);
    placed.mast = { x: s.x, z: s.z };
  }

  // A steel watchtower at the south end of the flight line.
  async function placeSouthTower() {
    const s = freeSpot([kit.at(30, 430), kit.at(10, 410), kit.at(40, 380)], westOf, 3.5, 3.5, 160);
    if (!s) return;
    const t = await place('airport/base_mil_tower', s.x, s.z, westOf, 1, true);
    if (t) lodSwap(t, 'airport/base_mil_tower_lod1', 260);
    (out.towers ||= []).push({ x: s.x, z: s.z });
    placed.southTower = { x: s.x, z: s.z };
  }

  // A base map board inside the gate (the made-up station name only).
  function gateBoard() {
    const G = out.gate;
    if (!G) return;
    const board = signMesh(3.2, 1.6, (g, w, h) => {
      g.fillStyle = '#2d3324';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8dcb0';
      g.textAlign = 'center';
      g.font = 'bold 40px Arial';
      g.fillText('FLIGHT LINE', w / 2, h * 0.32);
      g.fillText('FIELD CAMP', w / 2, h * 0.58);
      g.fillText('NAVAL PIER', w / 2, h * 0.84);
    });
    const x = G.x - G.ox * 16 - G.ux * 8;
    const z = G.z - G.oz * 16 - G.uz * 8;
    board.position.set(x, ground(x, z) + 1.6, z);
    board.rotation.y = Math.atan2(G.ox, G.oz);
    group.add(board);
  }

  await placeHuts();
  await placeMast();
  await placeNests();
  await placeSouthTower();
  await placeCamp();
  gateBoard();
  await instanceProp(group, 'airport/base_sb_wall', walls);
  await instanceProp(group, 'airport/base_wire_fence', fences, false);
  placed.counts = { walls: walls.length, fences: fences.length };
}

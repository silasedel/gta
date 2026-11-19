// W6 military air base (airports agent, Nov 19): Key West International (the smaller airport) becomes "Southline Air
// Station", a fictional military airfield. No airline traffic, no terminal: a hangar stands where the terminal was.
//   planBase(ap, ctx)            -> { climbSpots, pad, gate } (before the fence: the fence needs the climb spots)
//   buildBase(ap, ctx, plan, F)  -> dressing (hangars, the four-engine cargo jet, gate checkpoint with a guard booth, jersey
//                                   barrier chicane, barbed-wire barriers, signs and sandbags, crates at the climb spots,
//                                   helipad), two stealable fighters (game.air), olive Humvees (game.vehicles),
//                                   and the stealth zone config (guards, cameras) for src/gameplay/stealth/zone.js
// Models (Nov 19 models pass): the user's library: hangars 1 / 2 / 4 (buildings/hangar_arch, hangar_quonset, hangar_long),
// Plane 8 cargo jet (airport/cargo_jet); from the user's downloads: C-130J (airport/c130), F-22 / F-16 / F-35 (game.air
// types jet_f22 / jet_f16 / jet_f35, far LOD swapped in here), UH-60M Black Hawk on the pad (game.heli model 'blackhawk'), Booth 3 (airport/guard_booth), the downloaded military base asset pack (airport/mil_outpost, mil_watchtower,
// mil_garage, mil_tank, mil_barrels), Barrier 1 / 2 (airport/barbed_barrier, jersey_barrier), Security Camera 1
// heads (airport/sec_cam), guards p185 / p173 / p172 (the user's soldiers and officer). Converters: tools/v2/airport/convert_w6.py, convert.sh.
// The fence (fence.js) is 3.4 m with a concertina coil, climbable only at the climb spots (crates stacked outside; a
// sweeping camera and a patrol cover each one, so it can be done but needs timing). No real-world insignia anywhere.
// W7 (Nov 19): fighters park facing open pavement (F-22 on connector A3, nose to runway 17/35; F-16 / F-35 on the GA
// apron facing taxiway A), with their taxi lanes reserved first; camp / hut / tower dressing in dressing.js; the naval
// pier with the patrol ship and the destroyer in pier.js. Check: node tools/v2/airport/w7.mjs (shots + jet takeoff).
import * as THREE from 'three';
import { loadModel } from './models.js';
import { pip } from './geom.js';
import { buildHelipad } from './heli.v2.js';
import { dressBase } from './dressing.js';
import { buildPier } from './pier.js';

export const BASE_NAME = 'Southline Air Station';
const OLIVE = 0x4b5320;

// perimeter walk: points every `step` m with the inward normal
function walkRing(ring, step) {
  const out = [],
    n = ring.length;
  let s = 0;
  for (let k = 0; k < n; k++) {
    const [ax, az] = ring[k],
      [bx, bz] = ring[(k + 1) % n],
      L = Math.hypot(bx - ax, bz - az);
    if (L < 0.01) continue;
    const ux = (bx - ax) / L,
      uz = (bz - az) / L;
    for (let d = 0; d < L; d += step) {
      out.push({ x: ax + ux * d, z: az + uz * d, ux, uz, s: s + d });
    }
    s += L;
  }
  for (const p of out) {
    let nx = -p.uz,
      nz = p.ux;
    if (!pip(ring, p.x + nx * 3, p.z + nz * 3)) {
      nx = -nx;
      nz = -nz;
    }
    p.nx = nx;
    p.nz = nz;
  } // inward
  return { pts: out, L: s };
}

export function planBase(ap, ctx) {
  const { game } = ctx,
    city = game.city,
    ring = ap.airside;
  const W = walkRing(ring, 6);
  const gates = ap.fenceGates || [];
  const T = ap.terminal;
  const ok = (p) => {
    if (gates.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 220)) return false;
    if (T && Math.hypot(T.x - p.x, T.z - p.z) < 120) return false;
    for (const k of [-4, 4, -9, 9]) {
      const x = p.x + p.nx * k,
        z = p.z + p.nz * k;
      if (city.isWater?.(x, z)) return false;
    }
    const g0 = city.groundHeightAt(p.x - p.nx * 4, p.z - p.nz * 4),
      g1 = city.groundHeightAt(p.x + p.nx * 4, p.z + p.nz * 4);
    if (Math.abs(g0 - g1) > 1.0) return false;
    // not on a runway or taxiway
    for (const r of ap.runways) {
      const dx = r.b[0] - r.a[0],
        dz = r.b[1] - r.a[1],
        L2 = dx * dx + dz * dz,
        t = Math.max(0, Math.min(1, ((p.x - r.a[0]) * dx + (p.z - r.a[1]) * dz) / L2));
      if (Math.hypot(r.a[0] + dx * t - p.x, r.a[1] + dz * t - p.z) < 90) return false;
    }
    return true;
  };
  const cands = W.pts.filter(ok);
  const climbSpots = [];
  for (const f of [0.12, 0.42, 0.7]) {
    // three spots spread round the perimeter
    let best = null,
      bd = 1e9;
    for (const p of cands) {
      const d = Math.abs(p.s - f * W.L);
      if (d < bd && climbSpots.every((c) => Math.hypot(c.x - p.x, c.z - p.z) > 400)) {
        bd = d;
        best = p;
      }
    }
    if (best) climbSpots.push(best);
  }
  // main gate: the landside gate by the old terminal (the one without a road of its own sits on the forecourt)
  const main = gates.find((g) => !g.road) || gates[0],
    back = gates.find((g) => g !== main) || null;
  const pad = { x: -4566, z: 6128, r: 10 };
  return { climbSpots, main, back, pad, perimeter: W.L };
}

function fenceSign(g) {
  // the base's warning signs (fictional, no insignia)
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#b3171d';
  g.fillRect(0, 0, 256, 34);
  g.fillStyle = '#fff';
  g.font = 'bold 22px Arial';
  g.textAlign = 'center';
  g.fillText('WARNING', 128, 25);
  g.fillStyle = '#1b1b1b';
  g.font = 'bold 17px Arial';
  g.fillText('RESTRICTED AREA', 128, 56);
  g.font = '13px Arial';
  g.fillText('Southline Air Station. Use of', 128, 80);
  g.fillText('deadly force authorized.', 128, 98);
  g.fillText('Photography prohibited.', 128, 116);
}
export const fenceOpts = { height: 3.4, razor: true, sign: fenceSign };

function signMesh(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d');
  draw(g, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, side: THREE.DoubleSide }),
  );
}

export async function buildBase(ap, ctx, plan, F) {
  const { group, ground, world, RAPIER, game } = ctx;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const out = { jets: [], humvees: [], statics: [] };
  const boxCol = (cx, cy, cz, hx, hy, hz, rotY = 0) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    try {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(cx, cy, cz)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
        body,
      );
    } catch (e) {
      /* */
    }
  };
  const T = ap.terminal,
    th = T.heading,
    fx = Math.sin(th),
    fz = Math.cos(th),
    axx = Math.sin(th + Math.PI / 2),
    axz = Math.cos(th + Math.PI / 2);
  const at = (f, a) => ({ x: T.x + fx * f + axx * a, z: T.z + fz * f + axz * a });
  const grey = (o, hex = 0x6d7379, keepMap = false) =>
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.material = [].concat(m.material).map((mt) => {
        const c = mt.clone();
        if (!keepMap) c.map = null;
        c.color?.setHex(hex);
        c.roughness = 0.62;
        c.metalness = 0.35;
        return c;
      });
      if (m.material.length === 1) m.material = m.material[0];
    });
  async function place(path, x, z, heading, scale = 1, col = true, tint = null) {
    const src = await loadModel(path);
    if (!src) return null;
    const o = src.clone(true),
      y = ground(x, z);
    o.position.set(x, y, z);
    o.rotation.y = heading;
    o.scale.setScalar(scale);
    if (tint != null) grey(o, tint);
    group.add(o);
    if (col) {
      const bb = new THREE.Box3().setFromObject(src),
        hx = ((bb.max.x - bb.min.x) / 2) * scale,
        hy = ((bb.max.y - bb.min.y) / 2) * scale,
        hz = ((bb.max.z - bb.min.z) / 2) * scale;
      boxCol(x, y + hy, z, hx, hy, hz, heading);
    }
    await new Promise((r) => requestAnimationFrame(() => r()));
    return o;
  }
  // Far LOD for a placed static (the model's own _lod1 file), swapped by a THREE.LOD at `far` m.
  async function lodSwap(object, farPath, far) {
    const src = await loadModel(farPath);
    if (!src || !object.parent) return;
    const lod = new THREE.LOD();
    lod.position.copy(object.position);
    lod.rotation.copy(object.rotation);
    lod.scale.copy(object.scale);
    object.parent.add(lod);
    object.parent.remove(object);
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.setScalar(1);
    const farModel = src.clone(true);
    farModel.traverse((m) => {
      if (m.isMesh) m.castShadow = false;
    });
    lod.addLevel(object, 0);
    lod.addLevel(farModel, far);
  }

  // Free ground for a footprint (half sizes along / across the heading): flat, dry, inside the
  // fence, clear of the runways and of everything placed so far.
  const taken = [];
  const reserve = (x, z, r) => taken.push({ x, z, r });

  function runwayDistance(x, z) {
    let best = 1e9;
    for (const r of ap.runways) {
      const dx = r.b[0] - r.a[0];
      const dz = r.b[1] - r.a[1];
      const t = Math.max(
        0,
        Math.min(1, ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / (dx * dx + dz * dz)),
      );
      best = Math.min(best, Math.hypot(r.a[0] + dx * t - x, r.a[1] + dz * t - z));
    }
    return best;
  }

  function fits(x, z, heading, halfLength, halfWidth) {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const g0 = ground(x, z);
    const radius = Math.hypot(halfLength, halfWidth);
    if (runwayDistance(x, z) < Math.max(halfLength, halfWidth) + 60) return false;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + radius * 0.85)) return false;
    for (const a of [-1, -0.5, 0, 0.5, 1]) {
      for (const b of [-1, 0, 1]) {
        const px = x + s * a * halfLength + c * b * halfWidth;
        const pz = z + c * a * halfLength - s * b * halfWidth;
        if (game.city.isWater?.(px, pz)) return false;
        if (!pip(ap.airside, px, pz)) return false;
        if (Math.abs(ground(px, pz) - g0) > 0.8) return false;
      }
    }
    return true;
  }

  // The first preferred spot that fits, else the nearest free patch on a 12 m grid around it.
  function freeSpot(candidates, heading, halfLength, halfWidth, searchRadius = 320) {
    const take = (p) => {
      reserve(p.x, p.z, Math.hypot(halfLength, halfWidth));
      return p;
    };
    for (const p of candidates) {
      if (p && fits(p.x, p.z, heading, halfLength, halfWidth)) return take(p);
    }
    const first = candidates.find(Boolean);
    if (!first) return null;
    const grid = [];
    for (let dx = -searchRadius; dx <= searchRadius; dx += 12) {
      for (let dz = -searchRadius; dz <= searchRadius; dz += 12) {
        grid.push({ d: dx * dx + dz * dz, x: first.x + dx, z: first.z + dz });
      }
    }
    grid.sort((p, q) => p.d - q.d);
    for (const p of grid) {
      if (fits(p.x, p.z, heading, halfLength, halfWidth)) return take(p);
    }
    return null;
  }

  // Static box colliders along a parked aircraft: [along, up, side, hx, hy, hz] in its frame.
  function aircraftColliders(spot, heading, boxes) {
    const y0 = ground(spot.x, spot.z);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    for (const [along, up, side, hx, hy, hz] of boxes) {
      const x = spot.x + fx * along + rx * side;
      const z = spot.z + fz * along + rz * side;
      boxCol(x, y0 + up, z, hx, hy, hz, heading);
    }
  }

  // Hangar 1 where the terminal stood (long side along the old terminal front, doors to the
  // apron); Hangar 2 (quonset) and Hangar 4 (long multi-bay block) on free ground beside it.
  const hangarHeading = th + Math.PI / 2;
  const hc = at(6, 0);
  out.statics.push(await place('buildings/hangar_arch', hc.x, hc.z, hangarHeading, 1, true));
  reserve(hc.x, hc.z, 33);
  reserve(plan.pad.x, plan.pad.z, 22);
  reserve(ap.tower.x, ap.tower.z, 14);
  for (const stand of ap.stands) reserve(stand.x, stand.z, 18);
  // Fighters park facing open pavement with a straight run to a runway (W7: the F-22 sat nose-in on gate G2,
  // facing the C-130 on G1, and drove into it when taken). Their spots and the first 40 m ahead of each nose are
  // reserved before anything else is placed.
  const jetSpots = planJetSpots();
  for (const j of jetSpots) {
    const ux = Math.sin(j.heading);
    const uz = Math.cos(j.heading);
    for (let d = -6; d <= 40; d += 8) reserve(j.x + ux * d, j.z + uz * d, 10);
  }

  const quonsetSpots = [at(6, -52), at(6, 56), at(-6, -54), at(-6, 58), at(-20, -40), at(-20, 40)];
  const hq = freeSpot(quonsetSpots, hangarHeading, 14.5, 10.5);
  if (hq) {
    out.statics.push(await place('buildings/hangar_quonset', hq.x, hq.z, hangarHeading, 1, true));
  }
  const longSpots = [
    at(0, -120),
    at(0, 125),
    at(-14, -125),
    at(-14, 128),
    at(-30, -110),
    at(-30, 112),
  ];
  const hlg = freeSpot(longSpots, hangarHeading, 69, 23.5);
  if (hlg) {
    // the source is untextured: painted hangar grey
    const hangar = await place(
      'buildings/hangar_long',
      hlg.x,
      hlg.z,
      hangarHeading,
      1,
      true,
      0x8e9499,
    );
    out.statics.push(hangar);
  }
  out.hangars = { quonset: hq, long: hlg };

  // The C-130 (downloaded C-130J) at stand G1, and the four-engine cargo jet (Plane 8) on the
  // nearest open patch of apron that takes its 53 m span.
  const g1 = ap.stands.find((s) => s.id === 'G1') || ap.stands[0];
  if (g1) await placeTransports(g1);

  async function placeTransports(stand) {
    const h = stand.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const own = taken.findIndex((t) => t.x === stand.x && t.z === stand.z);
    if (own >= 0) taken.splice(own, 1);

    const herculesSpots = [
      { x: stand.x - 8, z: stand.z + 2 },
      { x: stand.x, z: stand.z },
      { x: stand.x - fx * 12, z: stand.z - fz * 12 },
    ];
    const hs = freeSpot(herculesSpots, h, 15.5, 20.5) || herculesSpots[0];
    const hercules = await place('airport/c130', hs.x, hs.z, h, 1, false);
    if (hercules) {
      aircraftColliders(hs, h, [
        [1, 2.6, 0, 2.3, 2.0, 14], // fuselage
        [1.5, 5.0, 0, 20, 0.45, 2.2], // wing
        [-12.5, 7.5, 0, 0.4, 4.0, 2.4], // fin
      ]);
      out.statics.push(hercules);
      out.c130 = { x: hs.x, z: hs.z, heading: h };
      lodSwap(hercules, 'airport/c130_lod1', 320);
    }

    const cargoSpots = [
      { x: stand.x - fx * 60, z: stand.z - fz * 60 },
      at(40, -60),
      at(40, 60),
      at(55, -20),
      at(55, 20),
      at(35, 0),
    ];
    const cs = freeSpot(cargoSpots, h, 27.5, 26.5);
    if (!cs) return;
    const cargo = await place('airport/cargo_jet', cs.x, cs.z, h, 1, false);
    if (!cargo) return;
    aircraftColliders(cs, h, [
      [2, 4.5, 0, 3.3, 2.6, 24], // fuselage
      [-1, 7.6, 0, 26, 0.5, 4.2], // wing
      [-24, 11.5, 0, 0.5, 5.5, 3], // fin
      [4, 5.0, -15.5, 1.2, 1.2, 3.2], // engines
      [4, 5.0, -8.5, 1.2, 1.2, 3.2],
      [4, 5.0, 8.5, 1.2, 1.2, 3.2],
      [4, 5.0, 15.5, 1.2, 1.2, 3.2],
    ]);
    out.statics.push(cargo);
    out.cargo = { x: cs.x, z: cs.z, heading: h };
    lodSwap(cargo, 'airport/cargo_jet_lod1', 380);
  }
  // gate checkpoint: big sign, sandbag walls, a stop sign and a second barrier inside the gate
  const mg = plan.main,
    gs = F?.gates?.find(
      (s) => Math.hypot((s.a.x + s.b.x) / 2 - mg.x, (s.a.z + s.b.z) / 2 - mg.z) < 15,
    );
  if (gs) {
    const mx = (gs.a.x + gs.b.x) / 2,
      mz = (gs.a.z + gs.b.z) / 2,
      dx = gs.b.x - gs.a.x,
      dz = gs.b.z - gs.a.z,
      L = Math.hypot(dx, dz),
      ux = dx / L,
      uz = dz / L;
    let ox = -uz,
      oz = ux;
    if (pip(ap.airside, mx + ox * 3, mz + oz * 3)) {
      ox = -ox;
      oz = -oz;
    } // outward
    out.gate = { x: mx, z: mz, ox, oz, ux, uz };
    const big = signMesh(6, 2.2, (g, w, h) => {
      g.fillStyle = '#2d3324';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d9c78a';
      g.lineWidth = 10;
      g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#e8dcb0';
      g.textAlign = 'center';
      g.font = 'bold 50px Arial';
      g.fillText('SOUTHLINE AIR STATION', w / 2, h * 0.42);
      g.font = 'bold 28px Arial';
      g.fillText('MAIN GATE  ·  ALL VISITORS STOP FOR INSPECTION', w / 2, h * 0.72);
    });
    const sx = mx + ox * 14 + ux * (L / 2 + 7),
      sz = mz + oz * 14 + uz * (L / 2 + 7);
    big.position.set(sx, ground(sx, sz) + 2.2, sz);
    big.rotation.y = Math.atan2(ox, oz);
    group.add(big);
    const legM = new THREE.MeshStandardMaterial({ color: 0x3a3d33 });
    for (const k of [-2.6, 2.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), legM);
      leg.position.set(sx + ux * k, ground(sx, sz) + 1.1, sz + uz * k);
      group.add(leg);
    }
    const stop = signMesh(1, 1, (g, w, h) => {
      g.fillStyle = '#c3121b';
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + (i * Math.PI) / 4;
        g.lineTo(w / 2 + (Math.cos(a) * w) / 2, h / 2 + (Math.sin(a) * h) / 2);
      }
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 150px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('STOP', w / 2, h / 2 + 8);
    });
    const px = mx + ox * 9 - ux * (L / 2 + 1.5),
      pz = mz + oz * 9 - uz * (L / 2 + 1.5);
    stop.position.set(px, ground(px, pz) + 2.0, pz);
    stop.rotation.y = Math.atan2(ox, oz);
    group.add(stop);
    // sandbag walls (rounded boxes) flanking the approach
    const bagM = new THREE.MeshStandardMaterial({ color: 0x8c7c5a, roughness: 1 }),
      bagG = new THREE.BoxGeometry(0.62, 0.24, 0.36);
    const bags = [];
    const wall = (cx, cz, along, n, rows) => {
      for (let r = 0; r < rows; r++)
        for (let i = 0; i < n - (r % 2); i++) {
          const k = (i - (n - 1) / 2 + (r % 2) * 0.5) * 0.64;
          bags.push([
            cx + along[0] * k,
            ground(cx, cz) + 0.12 + r * 0.24,
            cz + along[1] * k,
            Math.atan2(along[0], along[1]) + Math.PI / 2,
          ]);
        }
      boxCol(
        cx,
        ground(cx, cz) + rows * 0.12,
        cz,
        0.2,
        rows * 0.12,
        n * 0.32,
        Math.atan2(along[0], along[1]),
      );
    };
    for (const s of [-1, 1])
      wall(
        mx + ox * 18 + ux * s * (L / 2 + 3),
        mz + oz * 18 + uz * s * (L / 2 + 3),
        [ox, oz],
        7,
        4,
      );
    wall(mx - ox * 10 + ux * (L / 2 + 4), mz - oz * 10 + uz * (L / 2 + 4), [ox, oz], 6, 4);
    const im = new THREE.InstancedMesh(bagG, bagM, bags.length);
    const M = new THREE.Matrix4(),
      Q = new THREE.Quaternion();
    bags.forEach(([x, y, z, r], i) => {
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r + (Math.random() - 0.5) * 0.12);
      M.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, M);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
    // a second barrier arm inside the gate (red / white, with a collider: no driving straight through)
    const armT = (() => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 8;
      const g = c.getContext('2d');
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#fff' : '#d01a1a';
        g.fillRect(i * 16, 0, 16, 8);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const ix = mx - ox * 7,
      iz = mz - oz * 7,
      arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, L),
        new THREE.MeshStandardMaterial({ map: armT }),
      );
    arm.position.set(ix, ground(ix, iz) + 1.0, iz);
    arm.rotation.y = Math.atan2(ux, uz);
    group.add(arm);
    boxCol(ix, ground(ix, iz) + 0.6, iz, 0.15, 0.6, L / 2, Math.atan2(ux, uz));
    await dressGate({ mx, mz, ox, oz, ux, uz, L });
  }
  // climb spots: pallets and crates stacked against the outside of the fence (no colliders: the climb needs the fence face)
  const crateM = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }),
    palM = new THREE.MeshStandardMaterial({ color: 0xa88a5c, roughness: 1 });
  for (const c of plan.climbSpots) {
    const ox = -c.nx,
      oz = -c.nz,
      h = Math.atan2(c.ux, c.uz);
    for (const [a, o, s, y, m] of [
      [2.6, 1.2, [1.2, 0.9, 1.0], 0, crateM],
      [2.4, 1.3, [1.0, 0.8, 0.9], 0.9, crateM],
      [-2.4, 1.0, [1.2, 0.14, 1.0], 0, palM],
      [-2.4, 1.0, [1.2, 0.14, 1.0], 0.14, palM],
      [-2.6, 1.1, [1.2, 0.14, 1.0], 0.28, palM],
    ]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(...s), m);
      const x = c.x + c.ux * a + ox * o,
        z = c.z + c.uz * a + oz * o;
      b.position.set(x, ground(x, z) + y + s[1] / 2, z);
      b.rotation.y = h + (Math.random() - 0.5) * 0.2;
      b.castShadow = true;
      group.add(b);
    }
  }
  await placeClimbTowers();
  await placeServiceYard();
  // the base helipad, by the tower
  out.pad = buildHelipad(game, plan.pad.x, plan.pad.z, plan.pad.r, group);
  out.heli = spawnPadHeli(out.pad);
  // W7 dressing (tent camp, huts, nests, mast, towers) and the naval pier outside the fence
  const kit = {
    game,
    ap,
    group,
    ground,
    boxCol,
    place,
    lodSwap,
    freeSpot,
    reserve,
    out,
    at,
    th,
    signMesh,
    loadModel,
    physics: { world, RAPIER, body },
  };
  try {
    await dressBase(kit);
  } catch (e) {
    console.warn('[base] dressing', e);
  }
  try {
    await buildPier(kit);
  } catch (e) {
    console.warn('[base] pier', e);
  }
  await spawnFighters();
  // Humvees (the vehicles agent's humvee1 when it is in the car index, else an olive SUV)
  let hkey = 'suv1';
  try {
    const idx = await (
      await fetch((import.meta.env?.BASE_URL || '/') + 'assets/vehicles/cars/index.json')
    ).json();
    if (idx.humvee1) hkey = 'humvee1';
  } catch (e) {
    /* */
  }
  const hv = [
    at(-2, 36),
    at(-10, 36),
    out.gate
      ? {
          x: out.gate.x - out.gate.ox * 16 + out.gate.ux * 9,
          z: out.gate.z - out.gate.oz * 16 + out.gate.uz * 9,
        }
      : null,
  ].filter(Boolean);
  for (const p of hv) {
    try {
      const v = await game.vehicles?.spawnParked?.(hkey, {
        x: p.x,
        z: p.z,
        heading: th + Math.PI / 2,
        color: OLIVE,
        keepSpot: true,
        locked: false,
      });
      if (v) {
        v.military = true;
        out.humvees.push(v);
      }
    } catch (e) {
      console.warn('[base] humvee', e);
    }
  }
  out.humveeModel = hkey;
  return out;

  // The gate checkpoint from the user's models: the guard booth (Booth 3) outside the lane, the
  // guard post building and a watchtower inside (military base asset pack), a jersey barrier
  // chicane in the approach (Barrier 2) and barbed-wire barriers along the fence (Barrier 1).
  async function dressGate(gate) {
    const { mx, mz, ox, oz, ux, uz, L } = gate;
    const point = (out_, along) => ({
      x: mx + ox * out_ + ux * along,
      z: mz + oz * out_ + uz * along,
    });
    const laneHeading = Math.atan2(ux, uz);

    const booth = point(6, L / 2 + 2.4);
    out.booth = await place('airport/guard_booth', booth.x, booth.z, Math.atan2(-ux, -uz), 1, true);

    const post = point(-11, L / 2 + 7);
    out.post = await place('airport/mil_outpost', post.x, post.z, Math.atan2(-ux, -uz), 1, true);
    if (out.post) lodSwap(out.post, 'airport/mil_outpost_lod1', 220);

    const tower = point(-5, -(L / 2 + 4));
    const t = await place('airport/mil_watchtower', tower.x, tower.z, Math.atan2(ox, oz), 1, true);
    if (t) {
      lodSwap(t, 'airport/mil_watchtower_lod1', 260);
      out.towers = [tower];
    }

    // two staggered rows, each closing a bit over half the lane
    const perRow = Math.max(2, Math.ceil((L * 0.55) / 2.15));
    for (const [distance, side] of [
      [12, -1],
      [19, 1],
    ]) {
      for (let i = 0; i < perRow; i++) {
        const p = point(distance, side * (L / 2 - 1.1 - i * 2.15));
        await place('airport/jersey_barrier', p.x, p.z, laneHeading + Math.PI / 2, 1, true);
      }
    }

    for (const side of [-1, 1]) {
      for (const k of [L / 2 + 5, L / 2 + 10.5, L / 2 + 16]) {
        const p = point(2.4, side * k);
        if (Math.abs(ground(p.x, p.z) - ground(mx, mz)) > 1.2) continue;
        await place('airport/barbed_barrier', p.x, p.z, laneHeading + Math.PI / 2, 1, false);
      }
    }
  }

  // A watchtower inside the fence by each climb spot (on the far side from its camera).
  async function placeClimbTowers() {
    for (const c of plan.climbSpots) {
      const x = c.x + c.nx * 9 - c.ux * 22;
      const z = c.z + c.nz * 9 - c.uz * 22;
      if (!pip(ap.airside, x, z) || game.city.isWater?.(x, z)) continue;
      const t = await place('airport/mil_watchtower', x, z, Math.atan2(-c.nx, -c.nz), 1, true);
      if (!t) continue;
      lodSwap(t, 'airport/mil_watchtower_lod1', 260);
      (out.towers ||= []).push({ x, z });
    }
  }

  // Service dressing by the hangars: a garage, a fuel tank and barrels (military base asset pack).
  async function placeServiceYard() {
    const h = th + Math.PI / 2;
    const garage = freeSpot(
      [at(-14, -40), at(-14, 44), at(-24, -30), at(-24, 30), at(-30, 0)],
      h,
      5.5,
      5.5,
    );
    if (garage) {
      await place('airport/mil_garage', garage.x, garage.z, h, 1, true);
      const bx = garage.x + Math.sin(h) * 7;
      const bz = garage.z + Math.cos(h) * 7;
      await place('airport/mil_barrels', bx, bz, h, 1, false);
    }
    const tank = freeSpot([at(-18, -62), at(-18, 66), at(-30, -50), at(-30, 50)], h, 5, 4);
    if (tank) await place('airport/mil_tank', tank.x, tank.z, h, 1, true);
  }

  // The base's Black Hawk on its pad (flyable through heli.v2.js).
  function spawnPadHeli(pad) {
    try {
      const heading = Math.atan2(ap.tower.x - pad.x, ap.tower.z - pad.z) + Math.PI / 2;
      const pos = new THREE.Vector3(pad.x, pad.y + 1, pad.z);
      return (
        game.heli?.spawn?.(pos, heading, { model: 'blackhawk', y: pad.y, home: 'base-pad' }) || null
      );
    } catch (e) {
      console.warn('[base] heli', e);
      return null;
    }
  }

  // Stealable fighters (the downloaded F-22 / F-16 / F-35 as game.air types) with their far LOD
  // (types.js lod1) past 260 m.
  async function spawnJet(key, x, z, heading) {
    try {
      const A = await game.air?.spawn?.(key, new THREE.Vector3(x, 0, z), heading, {
        home: { id: 'base' },
      });
      if (!A) return;
      A.military = true;
      A.name = A.T.model + ' (base)';
      out.jets.push(A);
      await addJetLod(A);
    } catch (e) {
      console.warn('[base] jet', e);
    }
  }

  async function addJetLod(A) {
    const farSrc = A.T.lod1 && (await loadModel('../vehicles/air/' + A.T.lod1));
    const model = A.mesh.children.find((c) => c.name !== 'air-gear' && !c.isLOD);
    if (!farSrc || !model) return;
    const lod = new THREE.LOD();
    lod.position.copy(model.position);
    model.position.set(0, 0, 0);
    A.mesh.remove(model);
    lod.addLevel(model, 0);
    const far = farSrc.clone(true);
    far.traverse((m) => {
      if (m.isMesh) m.castShadow = false;
    });
    lod.addLevel(far, 260);
    A.mesh.add(lod);
  }

  // Where the fighters park: the F-22 on the apron end of connector A3, nose down A3 to runway 17/35 (about
  // 100 m of clear pavement); the F-16 and F-35 on the GA apron, noses to taxiway A.
  function planJetSpots() {
    const spots = [];
    const a3 = ap.taxiways.find((t) => t.id === 'A3');
    if (a3) {
      const [p0, p1] = a3.pts;
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const ux = (p1[0] - p0[0]) / L;
      const uz = (p1[1] - p0[1]) / L;
      spots.push({
        key: 'jet_f22',
        x: p0[0] - ux * 24,
        z: p0[1] - uz * 24,
        heading: Math.atan2(ux, uz),
      });
    }
    const ga = (ap.gaStands || [])[2];
    if (ga) {
      const rx = Math.cos(ga.heading);
      const rz = -Math.sin(ga.heading);
      spots.push({ key: 'jet_f16', x: ga.x - 6, z: ga.z, heading: ga.heading });
      spots.push({ key: 'jet_f35', x: ga.x - 6 + rx * 22, z: ga.z + rz * 22, heading: ga.heading });
    }
    return spots;
  }

  async function spawnFighters() {
    for (const j of jetSpots) await spawnJet(j.key, j.x, j.z, j.heading);
  }
}

// guards and cameras for the stealth zone
export function zoneConfig(ap, plan, built, F) {
  const inside = (x, z) => pip(ap.airside, x, z);
  const guards = [],
    cams = [];
  const T = ap.terminal,
    th = T.heading,
    fx = Math.sin(th),
    fz = Math.cos(th),
    axx = Math.sin(th + Math.PI / 2),
    axz = Math.cos(th + Math.PI / 2);
  const at = (f, a) => [T.x + fx * f + axx * a, T.z + fz * f + axz * a];
  const G = built.gate;
  if (G) {
    // two at the booth outside (watching the road), one inside the gate
    guards.push({
      x: G.x + G.ox * 5 + G.ux * 4,
      z: G.z + G.oz * 5 + G.uz * 4,
      heading: Math.atan2(G.ox, G.oz),
      range: 40,
    });
    guards.push({
      x: G.x + G.ox * 5 - G.ux * 4,
      z: G.z + G.oz * 5 - G.uz * 4,
      heading: Math.atan2(G.ox, G.oz),
      range: 40,
    });
    guards.push({
      x: G.x - G.ox * 9 - G.ux * 3,
      z: G.z - G.oz * 9 - G.uz * 3,
      heading: Math.atan2(-G.ox, -G.oz) + 0.6,
      range: 45,
    });
    cams.push({
      x: G.x - G.ox * 12 + G.ux * 8,
      z: G.z - G.oz * 12 + G.uz * 8,
      yaw: Math.atan2(G.ox, G.oz),
      sweep: 0.5,
      period: 8,
      range: 34,
    });
  }
  // each climb spot: a sweeping camera and a patrol along the inside of the fence
  for (const c of plan.climbSpots) {
    const cx = c.x + c.nx * 13 + c.ux * 16,
      cz = c.z + c.nz * 13 + c.uz * 16;
    cams.push({
      x: cx,
      z: cz,
      yaw: Math.atan2(c.x - cx, c.z - cz),
      sweep: 1.0,
      period: 11,
      range: 36,
      fov: 0.75,
    });
    const r = [
      [c.x + c.nx * 9 - c.ux * 60, c.z + c.nz * 9 - c.uz * 60],
      [c.x + c.nx * 9 + c.ux * 60, c.z + c.nz * 9 + c.uz * 60],
    ].filter(([x, z]) => inside(x, z));
    if (r.length === 2) guards.push({ route: r, speed: 1.3 });
  }
  // apron patrols (two out of phase), the hangars, the helipad and the tower
  const apron = [at(18, -55), at(18, 55), at(40, 55), at(40, -55)].filter(([x, z]) => inside(x, z));
  if (apron.length >= 3) {
    guards.push({ route: apron });
    guards.push({ route: apron.slice(2).concat(apron.slice(0, 2)) });
  }
  const ga = ap.aprons.find((a) => a.id === 'GA');
  if (ga) {
    const cxz = ga.poly.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
    const r = ga.poly.map(([x, z]) => [x + (cxz[0] - x) * 0.25, z + (cxz[1] - z) * 0.25]);
    guards.push({ route: r });
  }
  const pd = plan.pad;
  guards.push({ x: pd.x + 14, z: pd.z + 6, heading: Math.atan2(-14, -6), range: 50, who: 2 });
  cams.push({
    x: pd.x + 16,
    z: pd.z - 12,
    yaw: Math.atan2(-16, 12),
    sweep: 0.6,
    period: 10,
    range: 40,
  });
  const tw = ap.tower;
  guards.push({ x: tw.x + 9, z: tw.z - 3, heading: -1.3, range: 50, who: 2 });
  cams.push({ x: at(26, -30)[0], z: at(26, -30)[1], yaw: th, sweep: 1.1, period: 14, range: 40 });
  cams.push({ x: at(26, 32)[0], z: at(26, 32)[1], yaw: th, sweep: 1.1, period: 12, range: 40 });
  if (plan.back) {
    const b = plan.back,
      p = F?.nearest?.(b.x, b.z, 20);
    const nx = p ? -p.nx : 0,
      nz = p ? -p.nz : 0;
    guards.push({ x: b.x + nx * 8, z: b.z + nz * 8, heading: Math.atan2(-nx, -nz), range: 45 });
    cams.push({
      x: b.x + nx * 12 + 6,
      z: b.z + nz * 12,
      yaw: Math.atan2(-nx, -nz),
      sweep: 0.5,
      range: 32,
    });
  }
  // a runway-crossing patrol by vehicle road
  const rw = ap.runways[0],
    mid = [(rw.a[0] + rw.b[0]) / 2, (rw.a[1] + rw.b[1]) / 2];
  const tA = at(45, 0);
  if (inside(mid[0] + 60, mid[1]) && inside(tA[0], tA[1]))
    guards.push({ route: [tA, [mid[0] + 60, mid[1]]], speed: 1.5 });
  // the user's soldiers (Nov 19 people): the woodland-camo guard (p185) and the desert-tan soldier (p173) take
  // turns on the patrols and gates; the olive-uniform officer (p172, no rifle) holds the tower and helipad posts
  guards.forEach((g, i) => {
    g.who ??= i % 2;
  });
  const people = [{ id: 'p185' }, { id: 'p173' }, { id: 'p172', rifle: false }];
  return { guards, cams, people, camModel: 'airport/sec_cam' };
}

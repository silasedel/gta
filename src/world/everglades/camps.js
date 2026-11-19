// Everglades r7: the people of the glades. A handful of hand-styled places, each found on the real map data at boot
// (a bank on land with tea water straight ahead and a road behind it), so they follow the map if it is redrawn:
//   tour   - "Gator Gus Airboat Rides": a thatched boathouse over the water, a long pier, three airboats for rent ($25 when
//            you climb aboard one), the guide on the pier, a hand-painted sign at the road, a gravel lot with cars
//   stilt  - a rusty stilt house half over the water, a mossy pier with a classic fan airboat tied up, fuel tank, gas cans,
//            coolers, laundry on the line, tin fence around the junk, an old pickup; two locals on the porch / the bank
//   tarp   - a ramshackle tarp shack on a hammock, a rowboat flipped on the bank, oil drums, a skiff on blocks, tin fence
//   island - an airboat-only squatter stilt shack deep in the sloughs (no road), a classic airboat at its little pier
// Each place: a dirt track to its road, a dirt yard, colliders (buildings, decks), porch light, the user's people
// (game.npc.spawnPosed with their cast ids: fishermen, hunters, the airboat guide, overalls farmer...), pickups
// (game.vehicles.spawnParked) and drivable airboats (game.boatSystem.spawn). Built within ~650 m, dropped past ~950 m.
import * as THREE from 'three';
import { loadModel } from './models.js';
import { dirtTexture, signTexture, snagTexture } from './textures.js';
import { staticBatch } from '../../render/staticBatch.js';

// targets on the map (world x, z) and the kind of place wanted there; the finder looks for the best bank within ~260 m
const PLACES = [
  {
    id: 'gator_gus',
    kind: 'tour',
    at: [-1700, -860],
    people: [
      ['p161', 'idle', 'guide'],
      ['p58', 'cross_arms', 'yard'],
    ],
    name: 'Gator Gus Airboat Rides',
  },
  {
    id: 'stilt_south',
    kind: 'stilt',
    at: [-2600, -330],
    people: [
      ['p43', 'sit', 'porch'],
      ['p95', 'drink', 'bank'],
    ],
  },
  {
    id: 'tarp_north',
    kind: 'tarp',
    at: [-2550, -1420],
    people: [
      ['p79', 'idle_old', 'yard'],
      ['p03', 'cross_arms', 'bank'],
    ],
  },
  {
    id: 'stilt_west',
    kind: 'stilt',
    at: [-2950, -820],
    people: [
      ['p162', 'idle', 'bank'],
      ['p80', 'talk_g', 'yard'],
    ],
  },
  { id: 'island', kind: 'island', at: [-2400, -950], people: [['p159', 'idle_old', 'bank']] },
];
const BUILD_R = 650,
  DROP_R = 950,
  PEOPLE_R = 170,
  BOAT_R = 420;
const TOUR_FEE = 25;

export function createCamps(game, G) {
  const city = game.city,
    scene = game.scene,
    SEA = G.SEA;
  const sites = [];
  let finder = null,
    found = false;
  const stats = { sites: 0, built: 0, people: 0, boats: 0, find: [] };
  // ------------------------------------------------------------ site finder (generator, a few ms per frame)
  function* findAll() {
    let t0 = performance.now();
    const tick = function* () {
      if (performance.now() - t0 > 3) {
        yield;
        t0 = performance.now();
      }
    };
    for (const P of PLACES) {
      const needRoad = P.kind !== 'island';
      let best = null;
      for (let r = 0; r <= (needRoad ? 260 : 600); r += 10) {
        for (let a = 0; a < Math.max(1, Math.round(r / 10) * 6); a++) {
          const an = (a / Math.max(1, Math.round(r / 10) * 6)) * 6.283,
            x = P.at[0] + Math.cos(an) * r,
            z = P.at[1] + Math.sin(an) * r;
          yield* tick();
          if (G.isWater(x, z) || !G.inGlades(x, z)) continue;
          const gy = G.ground(x, z);
          if (!(gy > SEA + 0.02 && gy < SEA + 2.2)) continue;
          const rd = G.roadDist(x, z, 160);
          if (needRoad && (rd < 18 || rd > 120)) continue;
          if (!needRoad && rd < 150) continue;
          if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < 300)) continue;
          // the bank: shortest run to deep-ish water (still water 14 m beyond the edge) in 16 directions
          let dir = null,
            dW = 1e9;
          for (let k = 0; k < 16; k++) {
            const h = (k / 16) * 6.283,
              fx = Math.sin(h),
              fz = Math.cos(h);
            for (let d = 8; d <= 34; d += 2)
              if (G.isWater(x + fx * d, z + fz * d)) {
                if (
                  d < dW &&
                  G.isWater(x + fx * (d + 8), z + fz * (d + 8)) &&
                  G.isWater(x + fx * (d + 14), z + fz * (d + 14)) &&
                  G.isWater(x + fx * (d + 6) + fz * 6, z + fz * (d + 6) - fx * 6) &&
                  G.isWater(x + fx * (d + 6) - fz * 6, z + fz * (d + 6) + fx * 6)
                ) {
                  dW = d;
                  dir = h;
                }
                break;
              }
          }
          if (dir === null || dW < (needRoad ? 12 : 8)) continue;
          // a dry, level yard behind the bank
          const fx = Math.sin(dir),
            fz = Math.cos(dir);
          let ok = true,
            lo = 1e9,
            hi = -1e9;
          for (const [lx, lz] of needRoad
            ? [
                [0, 0],
                [-12, -6],
                [12, -6],
                [-12, -18],
                [12, -18],
                [0, -22],
                [-8, dW - 6],
                [8, dW - 6],
                [-16, 4],
                [16, 4],
              ]
            : [
                [0, 0],
                [-6, -4],
                [6, -4],
                [-6, dW - 5],
                [0, dW - 4],
              ]) {
            const wx = x + lx * Math.cos(dir) + lz * fx,
              wz = z - lx * fx + lz * fz;
            if (G.isWater(wx, wz)) {
              ok = false;
              break;
            }
            const h = G.ground(wx, wz);
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
          }
          if (!ok || hi - lo > 1.1) continue;
          const score =
            Math.abs(dW - 16) * 1.2 + (needRoad ? Math.abs(rd - 40) * 0.25 : 0) + r * 0.03;
          if (!best || score < best.score) best = { x, z, heading: dir, dW, rd, score, y: gy };
        }
        if (best && r > 80) break;
      }
      if (best) {
        const s = { ...P, ...best, state: 'idle' };
        sites.push(s);
        try {
          game.vegetation?.block?.({
            x: s.x + Math.sin(s.heading) * 4,
            z: s.z + Math.cos(s.heading) * 4,
            r: 30,
          });
        } catch (e) {
          /* */
        }
      }
      stats.find.push(
        P.id + (best ? ` ok ${best.x.toFixed(0)},${best.z.toFixed(0)} dW ${best.dW}` : ' none'),
      );
    }
    stats.sites = sites.length;
  }
  // ------------------------------------------------------------ helpers
  const W = (s, lx, lz) => {
    const c = Math.cos(s.heading),
      sn = Math.sin(s.heading);
    return [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
  };
  const dirtMat = new THREE.MeshStandardMaterial({
    name: 'gl7Dirt',
    map: dirtTexture(),
    roughness: 0.92,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  function ribbon(pts, width, vScale = 1 / 8) {
    // pts [[x, z]...] -> a ground-draped strip
    const P = [],
      U = [],
      I = [];
    let v = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)],
        b = pts[Math.min(pts.length - 1, i + 1)],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        L = Math.hypot(dx, dz) || 1,
        nx = -dz / L,
        nz = dx / L;
      if (i) v += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * vScale;
      for (const s of [-1, 1]) {
        const x = pts[i][0] + (nx * s * width) / 2,
          z = pts[i][1] + (nz * s * width) / 2;
        P.push(x, G.ground(x, z) + 0.035, z);
        U.push(s < 0 ? 0 : 1, v);
      }
      if (i) {
        const k = (i - 1) * 2;
        I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, dirtMat);
    m.receiveShadow = true;
    m.renderOrder = -2;
    m.userData.noBatch = true;
    return m;
  }
  function yard(s, r) {
    // a rough dirt disc as a fan of ribbons (same texture), centered behind the bank
    const out = [];
    for (let k = 0; k < 3; k++) {
      const a = s.heading + k * 1.05;
      const pts = [];
      for (let d = -r; d <= r; d += 3) {
        const [x, z] = W(s, Math.cos(a - s.heading) * d, -6 + Math.sin(a - s.heading) * d);
        pts.push([x, z]);
      }
      out.push(ribbon(pts, r * 0.9, 1 / 10));
    }
    return out;
  }
  const signMats = new Map();
  function sign(lines, opts) {
    const k = lines.join('|');
    let m = signMats.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ map: signTexture(lines, opts), roughness: 0.85 });
      signMats.set(k, m);
    }
    return m;
  }
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5d5246, roughness: 0.95 });
  const skirtTex = snagTexture();
  skirtTex.repeat.set(3, 0.35);
  const skirtMat = new THREE.MeshStandardMaterial({
    name: 'gl7Skirt',
    map: skirtTex,
    color: 0x8a7a64,
    roughness: 0.95,
  });
  function signBoard(lines, opts, w = 2.4, h = 1.2) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), [
      postMat,
      postMat,
      postMat,
      postMat,
      sign(lines, opts),
      postMat,
    ]);
    b.position.y = 1.5 + h / 2;
    b.castShadow = true;
    g.add(b);
    for (const sx of [-w / 2 + 0.12, w / 2 - 0.12]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3 + h, 0.12), postMat);
      p.position.set(sx, (2.3 + h) / 2 - 0.2, -0.06);
      p.castShadow = true;
      g.add(p);
    }
    b.userData.noBatch = true;
    return g;
  }
  // ------------------------------------------------------------ build one place
  function build(s) {
    s.state = 'loading';
    const grp = new THREE.Group();
    grp.name = 'gl7Camp_' + s.id;
    s.group = grp;
    s.colliders = [];
    s.lamps = null;
    s.items = [];
    const put = (path, lx, lz, o = {}) => s.items.push({ path, lx, lz, ...o });
    const dW = s.dW,
      kind = s.kind;
    // --- layout per kind (local: +z toward the water, the bank at z = dW)
    if (kind === 'stilt' || kind === 'island') {
      put('buildings/stilt_shack.glb', -6, dW - 3.5, { s: 11, yaw: Math.PI, col: [4.1, 3.6, 5.2] });
      put('docks/mossy_pier.glb', 4, dW + 3.2, { deck: SEA + 0.55, col: 'deck' });
      put('everglades/airboat_classic.glb', 7.4, dW + 5, { water: -0.12, yaw: Math.PI / 2 });
      put('keys/coolers.glb', 3.6, dW + 1, { y: SEA + 0.55, yaw: 0.3 });
      put('keys/fishing_gear.glb', 4.4, dW + 6, { y: SEA + 0.55, yaw: 1.4 });
      put('everglades/gas_can.glb', 2.2, dW - 2.5, { yaw: 0.6 });
      put('everglades/gas_can.glb', 2.6, dW - 2.2, { yaw: 2.1 });
      put('keys/galv_can.glb', -0.5, dW - 8, {});
      // r7b junk from the user's downloads (aged / rusted in tools/v2/everglades): drums, a wrecked car, mossy rocks on the bank
      put('everglades/drum_rust.glb', 10.5, dW - 9, { yaw: 0.4 });
      put('everglades/drum_blue.glb', 11.2, dW - 9.6, { yaw: 1.9 });
      put('everglades/drum_rust.glb', 10.2, dW - 10.4, { yaw: 2.7, tip: true });
      put('everglades/mossy_stone.glb', -9, dW + 0.6, { yaw: 1.1, s: 0.7, y0: -0.25 });
      put('everglades/mossy_stone.glb', 9.5, dW + 0.2, { yaw: 2.4, s: 0.55, y0: -0.25 });
      if (kind === 'stilt') put('everglades/junk_car.glb', -15, dW - 21, { yaw: 0.6, y0: -0.08 });
      if (kind === 'stilt') {
        put('everglades/fuel_tank.glb', 9, dW - 13, { yaw: 1.3, col: [1.6, 0.7, 0.55] });
        put('everglades/clothesline.glb', -14, dW - 14, { yaw: 0.2 });
        put('keys/rowboat.glb', -1, dW - 4.5, { yaw: 1.2, flip: true });
        put('keys/crate.glb', 6, dW - 12, { yaw: 0.4 });
        put('keys/crate.glb', 6.5, dW - 11.2, { yaw: 1.1, y0: 0.6 });
        put('keys/crate.glb', 6.8, dW - 12.4, { yaw: 2 });
        put('keys/lawn_chair.glb', -2.5, dW - 9, { yaw: 2.6 });
        put('keys/lawn_chair.glb', -4, dW - 10, { yaw: 2.9 });
        for (const lx of [-11, -7.6, -4.2])
          put('keys/fence_rustic.glb', lx, dW - 25, { yaw: Math.PI / 2 + lx * 0.01, s: 0.2 });
      }
    } else if (kind === 'tarp') {
      put('buildings/tarp_shack.glb', -5, dW - 10, { yaw: Math.PI + 0.25, col: [3.2, 1.3, 2.6] });
      put('keys/rowboat.glb', 0, dW - 2.5, { yaw: 1.5, flip: true });
      put('everglades/rv_trailer.glb', 10, dW - 11, {
        yaw: Math.PI / 2 + 0.25,
        skirt: [3.3, 1.55, 0.62],
        col: [3.6, 1.6, 1.7],
      });
      put('everglades/flatbed.glb', -13, dW - 15, { yaw: 0.35, sv: [1.6, 1, 0.75] });
      put('keys/skiff.glb', -13, dW - 15, { yaw: 0.35, y0: 0.66 });
      put('everglades/junk_car.glb', 15, dW - 23, { yaw: 2.2, y0: -0.08 });
      put('everglades/drum_rust.glb', 4.2, dW - 13, { yaw: 0.2 });
      put('everglades/drum_rust.glb', 4.9, dW - 13.5, { yaw: 1.2 });
      put('everglades/drum_blue.glb', 4.4, dW - 14.2, { yaw: 2.2 });
      put('everglades/fuel_tank.glb', -13, dW - 4, { yaw: 0.2, col: [1.6, 0.7, 0.55] });
      put('keys/galv_can.glb', 1.5, dW - 11, {});
      put('keys/galv_can.glb', 2.2, dW - 10.2, {});
      put('everglades/gas_can.glb', 2.8, dW - 9.4, { yaw: 1 });
      put('keys/coolers.glb', -1, dW - 7, { yaw: 1.9 });
      put('keys/lawn_chair.glb', 1, dW - 6, { yaw: 3.4 });
      for (const lx of [-14, -10.6, 8, 11.4])
        put('keys/fence_rustic.glb', lx, dW - 22, { yaw: Math.PI / 2 - lx * 0.006, s: 0.2 });
      put('everglades/clothesline.glb', 10, dW - 6, { yaw: 1.8 });
      put('docks/mossy_pier.glb', 6, dW + 3.2, { deck: SEA + 0.5, col: 'deck', yaw: 0.15 });
    } else if (kind === 'tour') {
      put('docks/boathouse.glb', -8, dW + 5, {
        deck: SEA + 0.6,
        col: [6.4, 0.15, 6.9],
        yaw: Math.PI / 2,
      });
      put('docks/mossy_pier.glb', 4, dW + 3.2, { deck: SEA + 0.55, col: 'deck' });
      put('docks/mossy_pier.glb', 4, dW + 12.3, { deck: SEA + 0.55, col: 'deck' });
      put('keys/coolers.glb', 3.4, dW + 1.5, { y: SEA + 0.55, yaw: 0.1 });
      put('everglades/gas_can.glb', 4.8, dW + 14, { y: SEA + 0.55 });
      put('everglades/gas_can.glb', 5.1, dW + 14.4, { y: SEA + 0.55, yaw: 1 });
      put('everglades/fuel_tank.glb', 12, dW - 6, { yaw: 1.5, col: [1.6, 0.7, 0.55] });
      put('everglades/airboat_classic.glb', -1.8, dW + 15, {
        water: -0.12,
        yaw: -Math.PI / 2 + 0.1,
      });
      put('everglades/drum_blue.glb', 13.5, dW - 4.6, { yaw: 0.5 });
      put('everglades/drum_rust.glb', 14.1, dW - 5.3, { yaw: 1.5 });
      put('everglades/mossy_stone.glb', -1, dW - 0.4, { yaw: 0.4, s: 0.6, y0: -0.25 });
      put('keys/lawn_chair.glb', 2.5, dW - 3, { yaw: 2.8 });
      put('keys/lawn_chair.glb', 1.2, dW - 3.4, { yaw: 3.3 });
    }
    // --- dirt track to the road, yard
    if (kind !== 'island') {
      const [ox, oz] = W(s, 0, dW - 18),
        ne = city.roadGraph?.nearestEdge?.(ox, oz, {}, 200);
      if (ne?.point) {
        const pts = [],
          dx = ne.point.x - ox,
          dz = ne.point.z - oz,
          L = Math.hypot(dx, dz),
          n = Math.max(2, Math.ceil(L / 3)),
          wob = (s.x % 7) - 3.5;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          pts.push([
            ox + dx * t + Math.sin(t * Math.PI) * wob * (-dz / L),
            oz + dz * t + Math.sin(t * Math.PI) * wob * (dx / L),
          ]);
        }
        // stop at the road's edge
        const keep = pts.filter((p) => G.roadDist(p[0], p[1], 30) > -0.5 || p === pts[0]);
        if (keep.length > 1) grp.add(ribbon(keep, 3.4));
        s.roadPt = [ne.point.x, ne.point.z];
        s.roadDir = ne.dir ? [ne.dir.x, ne.dir.z] : [1, 0];
      }
      for (const m of yard(s, 15)) grp.add(m);
    }
    // --- sign at the road (tour) / a no-trespassing board (camps)
    if (s.roadPt) {
      const [rx, rz] = s.roadPt,
        [ox, oz] = W(s, 0, dW - 18),
        L = Math.hypot(ox - rx, oz - rz) || 1,
        ux = (ox - rx) / L,
        uz = (oz - rz) / L;
      const sx = rx + ux * 9 + uz * 3.2,
        sz = rz + uz * 9 - ux * 3.2;
      const b =
        kind === 'tour'
          ? signBoard(
              ['GATOR GUS', 'AIRBOAT RIDES', `$${TOUR_FEE}  ·  SEE REAL GATORS`],
              { bg: '#e2d6b4', edge: '#2f5d3a' },
              3.2,
              1.6,
            )
          : signBoard(
              kind === 'tarp'
                ? ['NO', 'TRESPASSING', 'BEWARE OF DOG']
                : ['BAIT  ICE', 'NIGHTCRAWLERS', 'HONK FOR SERVICE'],
              {
                bg: kind === 'tarp' ? '#cfc8b4' : '#d7cfb6',
                edge: kind === 'tarp' ? '#6a1c14' : '#33424d',
                ink: ['#6a1c14', '#1d1d1d', '#1d1d1d'],
              },
              1.8,
              0.95,
            );
      b.position.set(sx, G.ground(sx, sz) - 0.1, sz);
      b.rotation.y = Math.atan2(-ux, -uz) + Math.PI;
      scene.add(b);
      s.sign = b;
    }
    scene.add(grp);
    // --- load and place the models
    const jobs = s.items.map((it) =>
      loadModel(it.path).then((src) => {
        if (!src || s.state === 'dropped') return;
        const m = src.clone(true),
          [x, z] = W(s, it.lx, it.lz),
          yaw = s.heading + (it.yaw || 0);
        let y;
        if (it.deck !== undefined) y = it.deck;
        else if (it.water !== undefined) y = SEA + it.water;
        else if (it.y !== undefined) y = it.y;
        else y = G.ground(x, z) - 0.03 + (it.y0 || 0);
        if (it.s) m.scale.setScalar(it.s);
        if (it.sv) m.scale.set(...it.sv);
        if (it.tip) {
          m.rotation.set(0, yaw, Math.PI / 2, 'YXZ');
          y += 0.3;
        }
        if (it.tip) {
          /* set above */
        } else if (it.flip) {
          m.rotation.set(Math.PI, yaw, 0, 'YXZ');
          const b = src.userData.box;
          y += (b ? b.max.y - b.min.y : 0.5) * (it.s || 1);
        } else m.rotation.y = yaw;
        m.position.set(x, y, z);
        grp.add(m);
        if (it.skirt) {
          // weathered board skirting around a trailer's base (hides the wheels and the gap, like a lived-in single-wide)
          const [hx, hz, hh] = it.skirt;
          for (const [px, pz, w, rot] of [
            [0, hz, hx * 2, 0],
            [0, -hz, hx * 2, 0],
            [hx, 0, hz * 2, Math.PI / 2],
            [-hx, 0, hz * 2, Math.PI / 2],
          ]) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.04), skirtMat);
            const c = Math.cos(yaw),
              sn = Math.sin(yaw);
            b.position.set(
              x + px * c + pz * sn,
              G.ground(x, z) + hh / 2 - 0.05,
              z - px * sn + pz * c,
            );
            b.rotation.y = yaw + rot;
            b.castShadow = true;
            b.receiveShadow = true;
            grp.add(b);
          }
        }
        // colliders: a deck slab for piers / boathouse decks, a box for buildings and big props
        if (it.col && game.world && game.RAPIER) {
          const R = game.RAPIER,
            q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          let hx, hy, hz, cy;
          if (it.col === 'deck') {
            hx = 1.42;
            hy = 0.08;
            hz = 4.55;
            cy = y - 0.08;
          } else {
            [hx, hy, hz] = it.col;
            cy = it.deck !== undefined ? y - hy : y + hy;
          }
          try {
            const body = game.world.createRigidBody(
              R.RigidBodyDesc.fixed()
                .setTranslation(x, cy, z)
                .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
            );
            game.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.8), body);
            s.colliders.push(body);
          } catch (e) {
            /* visual only */
          }
        }
      }),
    );
    Promise.all(jobs).then(() => {
      if (s.state === 'dropped') return;
      try {
        staticBatch(grp, { deep: true });
      } catch (e) {
        console.warn('[everglades] batch', e);
      }
      s.state = 'built';
      stats.built++;
    });
    // porch / dock light
    try {
      const [lx, lz] =
        kind === 'tarp' ? W(s, -3, dW - 7) : kind === 'tour' ? W(s, 2, dW + 1) : W(s, -3, dW - 1);
      const gy = G.ground(lx, lz);
      s.lamps = game.env?.lamps?.add?.(lx, gy + 2.8, lz, {
        color: 0xffbb66,
        intensity: 70,
        range: 11,
        gy,
      });
    } catch (e) {
      /* */
    }
  }
  function drop(s) {
    s.state = 'dropped';
    if (s.group) {
      scene.remove(s.group);
      s.group.traverse((o) => {
        if (o.isMesh && o.geometry && o.userData.noBatch !== false) {
          /* shared clones keep their geometry */
        }
      });
      s.group = null;
    }
    if (s.sign) {
      scene.remove(s.sign);
      s.sign = null;
    }
    for (const b of s.colliders || []) {
      try {
        game.world.removeRigidBody(b);
      } catch (e) {
        /* */
      }
    }
    s.colliders = [];
    if (s.lamps != null) {
      try {
        game.env?.lamps?.removeGroup?.(s.lamps);
      } catch (e) {
        /* */
      }
      s.lamps = null;
    }
    dropPeople(s);
    s.state = 'idle';
  }
  // ------------------------------------------------------------ people, trucks, airboats
  function spotOf(s, where, i) {
    const dW = s.dW;
    const L = {
      porch: s.kind === 'tarp' ? [1, dW - 6] : [-2.5, dW - 9],
      bank: [1.5 + i, dW - 1.6],
      yard: [3 + i * 1.2, dW - 12],
      guide: [3.4, dW + 6.5],
    }[where] || [0, dW - 10];
    return L;
  }
  function wantPeople(s) {
    try {
      game.npc?.cast?.want?.(s.people.map((p) => p[0]));
    } catch (e) {
      /* */
    }
  }
  function spawnPeople(s) {
    s.posed ||= [];
    const cast = game.npc?.cast;
    if (!game.npc?.spawnPosed) return;
    s.people.forEach(([id, pose, where], i) => {
      if (s.posed[i]) return;
      if (cast?.get && !cast.get(id)) return; // still loading
      const [lx, lz] = spotOf(s, where, i),
        [x, z] = W(s, lx, lz);
      const onDeck = where === 'guide',
        y = onDeck ? SEA + 0.55 : G.ground(x, z);
      const yaw =
        s.heading +
        (where === 'porch'
          ? s.kind === 'tarp'
            ? 3.4
            : 2.6
          : where === 'bank'
            ? 0.2
            : where === 'guide'
              ? -Math.PI / 2
              : Math.PI * 0.85 + i);
      let h = null;
      try {
        h = game.npc.spawnPosed({ person: id, pos: { x, y, z }, rot: yaw, pose, place: 'fishing' });
      } catch (e) {
        h = null;
      }
      s.posed[i] = h || 'failed';
      if (h) stats.people++;
    });
  }
  function dropPeople(s) {
    for (const h of s.posed || [])
      if (h && h !== 'failed') {
        try {
          h.remove();
          stats.people--;
        } catch (e) {
          /* */
        }
      }
    s.posed = [];
  }
  function spawnVehicles(s) {
    if (s.truckDone || s.kind === 'island') return;
    s.truckDone = true;
    const V = game.vehicles;
    if (!V?.spawnParked) return;
    const spots =
      s.kind === 'tour'
        ? [
            [12, s.dW - 20, 0.2, 'suv12'],
            [16, s.dW - 26, 0.1, 'sedan'],
            [8, s.dW - 27, -0.2, 'suv'],
          ]
        : [[8, s.dW - 20, 1.3, 'suv14']];
    for (const [lx, lz, yaw, key] of spots) {
      const [x, z] = W(s, lx, lz);
      V.spawnParked(key, {
        x,
        z,
        heading: s.heading + yaw,
        wear: /suv1[24]/.test(key) ? 0.85 : 0.4,
        old: key === 'suv14',
        locked: !/suv1[24]/.test(key),
      }).catch(() => null);
    }
  }
  const tourBoats = new Set();
  let paidFor = null;
  function spawnBoats(s) {
    const B = game.boatSystem;
    if (!B?.spawn) return;
    s.boats = (s.boats || []).filter((b) => b && !b.disposed);
    if (s.boats.length) return;
    const list =
      s.kind === 'tour'
        ? [
            [7.4, s.dW + 4.2],
            [7.4, s.dW + 9.6],
            [7.4, s.dW + 15],
          ]
        : s.kind === 'island'
          ? []
          : [[-1.5, s.dW + 7]];
    for (const [lx, lz] of list) {
      const [x, z] = W(s, lx, lz);
      if (!G.isWater(x, z)) continue;
      try {
        const b = B.spawn('airboat', { x, z }, s.heading + (s.kind === 'tour' ? 0.04 : 2.6));
        if (b) {
          s.boats.push(b);
          if (s.kind === 'tour') tourBoats.add(b);
          stats.boats++;
        }
      } catch (e) {
        console.warn('[everglades] airboat', e);
      }
    }
  }
  function dropBoats(s) {
    const B = game.boatSystem;
    s.boats = (s.boats || []).filter((b) => {
      if (!b || b.disposed) return false;
      if (b.playerDriven || b.everDriven) return false;
      try {
        B?.remove?.(b);
        stats.boats--;
        tourBoats.delete(b);
      } catch (e) {
        /* */
      }
      return false;
    });
  }
  // rent: climbing aboard one of Gator Gus's airboats costs the fee (once per boat)
  try {
    game.on?.('enterVehicle', (e) => {
      const v = e?.vehicle;
      if (!v || !tourBoats.has(v) || v.gl7Paid) return true;
      const r = game.wallet?.pay?.(TOUR_FEE, {
        to: 'Gator Gus Airboat Rides',
        place: 'Gator Gus Airboat Rides',
        memo: 'Airboat rental',
        category: 'leisure',
      });
      if (r && r.ok === false) {
        game.hud?.notify?.(`Airboat rental is $${TOUR_FEE}. You can't pay.`, 2600);
        return true;
      } // (still lets you take it: stealing is the player's call)
      v.gl7Paid = true;
      paidFor = v;
      game.hud?.notify?.(`Airboat rented · $${TOUR_FEE}`, 2400);
      return true;
    });
  } catch (e) {
    /* */
  }
  // ------------------------------------------------------------ per frame
  let tick = 0;
  function update(dt, cam, active, player) {
    if (finder) {
      const t0 = performance.now();
      try {
        while (performance.now() - t0 < 3) {
          if (finder.next().done) {
            finder = null;
            found = true;
            break;
          }
        }
      } catch (e) {
        console.warn('[everglades] site finder', e);
        finder = null;
        found = true;
      }
      return;
    }
    if (!found) {
      if (active) finder = findAll();
      return;
    }
    if ((tick -= dt) > 0) return;
    tick = 0.5;
    const p = player || cam;
    for (const s of sites) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (
        d < BUILD_R &&
        s.state === 'idle' &&
        (!city.collidersReadyAt || city.collidersReadyAt(s.x, s.z))
      )
        build(s);
      else if (d > DROP_R && (s.state === 'built' || s.state === 'loading')) {
        dropBoats(s);
        drop(s);
      }
      if (s.state === 'built' || s.state === 'loading') {
        if (d < 600) wantPeople(s);
        if (d < PEOPLE_R) spawnPeople(s);
        else if (d > PEOPLE_R + 90 && s.posed?.length) dropPeople(s);
        if (d < BOAT_R) spawnBoats(s);
        else if (d > BOAT_R + 300) dropBoats(s);
        if (d < 300) spawnVehicles(s);
      }
    }
  }
  return {
    update,
    sites,
    stats,
    get paid() {
      return paidFor;
    },
  };
}

// world-dressing (V2 module): fills empty ground.
// 1. Plain land (city-look's M.land, the gray concrete "parking lot" ground under every real-Miami block) is re-skinned at
//    runtime as a lawn / sparse grass / bare dirt blend in world space, and the global low-detail land base (what shows
//    while tiles stream and at mid range) is recolored from gray to a muted green-brown.
// 2. Plain land in real Miami gets palms, sea grape, hibiscus and oaks scattered in clusters (vegetation fields, 3 LODs).
// 3. The spawn street at Nico's house (Key Paloma): neighbors' houses and yards, mailboxes, bins, fences, boats on
//    trailers, crab traps, kayaks, parked cars, power poles with wires and service drops, a bait shop, mangroves, palms.
//    All static parts are merged into one textured mesh (one draw call plus shadow); vegetation goes through fields.
// API: game.dressing = { stats(), spawnArea, landPatched }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPropMaterial } from '../city/propmat.js';
import { loadSet } from '../city/pbr.js';
import * as K from './kit.js';
import { lots as houseLots } from '../setpieces/houses/lots.js';
import { occupancy } from '../ground/occupancy.js';
import { breakables } from '../miami/breakables.js';
import { lotProps } from '../props/lotProps.v2.js';
import { buildKeysLots } from './keysLots.js';
import { preloadLib, libInstancer } from '../libprops.js';
import { HAND_R } from './keysStreet.data.js';
const CLIP_OFF = typeof location !== 'undefined' && /[?&]clipfix=0/.test(location.search); // clipping-sweep before/after switch (audit only)
// clipping sweep: trunk radius, height, crown radius of the tall plants placed here (shared occupancy index, src/world/ground/occupancy.js)
const TALL = { coconut: [0.3, 9, 2.6], sabal: [0.3, 8, 2.4], liveoak: [0.35, 9, 3.2], royal: [0.35, 12, 2.6], gumbo: [0.35, 8, 3] };

export const order = 70;

const hash2 = (x, z, s = 0) => {
  const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
function vnoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export async function initV2(game) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nodress')) return; // before/after shots
  const { scene, renderer, world, RAPIER } = game;
  const city = game.city;
  const data = game.miamiData;
  if (!city || !data) throw new Error('world-dressing: no city data');
  const stats = { landPatched: false, landBase: false, scatter: 0, spawn: null, msInit: 0 };
  const t0 = performance.now();
  const shared = { uEmis: { value: 0 } };
  const propMat = await createPropMaterial(renderer, shared, { roughness: 1 });
  propMat.name = 'dressing-props';
  game.updaters.push(() => {
    const h = game.timeOfDay ?? 12;
    shared.uEmis.value = h < 6.3 || h > 19.2 ? 1 : 0;
  });

  // ------------------------------------------------------------------ 1. plain land re-skin
  const [grassSet, sparseSet, dirtSet] = await Promise.all([loadSet(renderer, 'leafy_grass'), loadSet(renderer, 'sparse_grass'), loadSet(renderer, 'dirt')]);
  function patchLand(mat) {
    mat.map = grassSet.map;
    mat.normalMap = grassSet.normalMap;
    mat.roughnessMap = grassSet.arm;
    mat.color.setRGB(0.92, 0.95, 0.88);
    mat.userData.pbr = 'dressing-land-blend';
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tSparse = { value: sparseSet.map };
      sh.uniforms.tDirt = { value: dirtSet.map };
      sh.vertexShader = 'varying vec3 vLandWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLandWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `uniform sampler2D tSparse;
uniform sampler2D tDirt;
varying vec3 vLandWP;
float lHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lHash(i), lHash(i + vec2(1.0, 0.0)), u.x), mix(lHash(i + vec2(0.0, 1.0)), lHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
` + sh.fragmentShader.replace('#include <map_fragment>', `
  {
    vec2 wp = vLandWP.xz;
    vec2 uv1 = wp / 5.0;
    vec4 cg = texture2D(map, uv1);
    vec4 cs = texture2D(tSparse, wp / 4.3 + 0.37);
    vec4 cd = texture2D(tDirt, wp / 3.7 + 0.11);
    float n1 = lNoise(wp * 0.031) * 0.65 + lNoise(wp * 0.11) * 0.35;
    float n2 = lNoise(wp * 0.017 + 7.3) * 0.7 + lNoise(wp * 0.07) * 0.3;
    float wS = smoothstep(0.42, 0.62, n2);
    float wD = smoothstep(0.6, 0.78, n1);
    vec4 c = mix(mix(cg, cs, wS), cd, wD);
    // dry, sun-bleached patches and darker damp hollows
    float dry = smoothstep(0.55, 0.85, lNoise(wp * 0.009 + 3.1));
    c.rgb = mix(c.rgb, c.rgb * vec3(1.18, 1.08, 0.82), dry * 0.6);
    c.rgb *= 0.9 + 0.2 * lNoise(wp * 0.23);
    diffuseColor *= c;
  }
`);
    };
    mat.customProgramCacheKey = () => 'dressing-land-v1';
    mat.needsUpdate = true;
  }
  let landMat = null;
  function findLand() {
    if (landMat) return true;
    city.root.traverse((o) => {
      const m = o.material;
      if (!landMat && o.isMesh && m && !Array.isArray(m) && m.polygonOffset && m.polygonOffsetUnits === -1 && m.polygonOffsetFactor === -0.5 && m.map) landMat = m;
    });
    if (landMat) {
      patchLand(landMat);
      stats.landPatched = true;
    }
    // global low-detail land base: gray -> muted green-brown, varied per vertex
    if (!stats.landBase) {
      const lb = city.root.getObjectByName('miami-land-base');
      const mesh = lb && lb.children[0];
      const C = mesh?.geometry?.attributes?.color;
      const P = mesh?.geometry?.attributes?.position;
      if (C && P) {
        for (let i = 0; i < C.count; i++) {
          const k = 0.85 + vnoise(P.getX(i) * 0.004, P.getZ(i) * 0.004) * 0.3;
          C.setXYZ(i, 0.36 * k, 0.4 * k, 0.27 * k);
        }
        C.needsUpdate = true;
        stats.landBase = true;
      }
    }
    return !!landMat;
  }
  findLand();
  // stage 1 perf: each try walks the whole city tree. The new map has no 'miami-land-base' (and may have no land material
  // of this kind), so this searched forever every 1.5 s (a periodic spike). Retry with back-off and stop after ~2 min.
  let landPoll = 0, landWait = 1.5, landTries = 0;
  game.updaters.push((dt) => {
    if ((landMat && stats.landBase) || landTries >= 8) return;
    landPoll += dt;
    if (landPoll > landWait) {
      landPoll = 0; landWait = Math.min(30, landWait * 2); landTries++;
      findLand();
    }
  });

  // ------------------------------------------------------------------ shared builders
  const groundY = (x, z) => {
    const y = city.groundHeightAt ? city.groundHeightAt(x, z) : 0;
    return Number.isFinite(y) ? y : 0;
  };
  const isWater = (x, z) => city.isWater(x, z);
  const _ne = {};
  const roadDist = (x, z) => {
    const r = data.roadGraph.nearestEdge(x, z, _ne, 60);
    return r ? r.dist - r.edge.width / 2 : 99;
  };
  const vegKinds = {};
  const addVeg = (kind, it) => {
    if (!CLIP_OFF && kind !== 'mangrove') { // never through a pole, lamp, sign, bench or another trunk (city tile props included)
      const s = it.s || 1, T = TALL[kind];
      if (T) {
        const o = { y: it.y || 0, h: T[1] * s, gap: 0.1, crown: { r: T[2] * s * 0.8, y0: (it.y || 0) + T[1] * s * 0.55 } };
        const inBld = data.surfaceAt ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => data.surfaceAt(it.x + dx * (T[0] * s + 0.4), it.z + dz * (T[0] * s + 0.4)) === 'building') : false; // trunk through a map building wall
        if (inBld || occupancy.blocked(it.x, it.z, T[0] * s, o)) { stats.clipDropped = (stats.clipDropped || 0) + 1; return; }
        occupancy.add({ x: it.x, z: it.z, r: T[0] * s, y: o.y, h: o.h, kind: 'palm', src: 'dressing.v2.js:addVeg', crown: o.crown, owner: 'dressing', audit: false });
      } else if (occupancy.blocked(it.x, it.z, 0.5 * s, { y: it.y || 0, h: 1.5, soft: true, gap: 0.05 })) { stats.clipDropped = (stats.clipDropped || 0) + 1; return; }
    }
    (vegKinds[kind] ||= []).push(it);
  };
  const geos = [];
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  function place(geo, x, y, z, ry, s = 1) {
    tmpQ.setFromAxisAngle(Y, ry);
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(s, s, s));
    const g = geo.clone();
    g.applyMatrix4(tmpM);
    geos.push(g);
  }
  // X1: breakable small props (fences, mailboxes, wheelie bins): their own merged mesh (vertex range per piece, collapsed when a car
  // knocks one over) and their own box collider through src/world/miami/breakables.js
  // r4-library: picnic tables are the user's Picnic Table 1 (street/picnic_table.glb, 2.4 x 2.25 m as placed), instanced; the code table
  // (kit.js picnicTable) only if the file is missing
  preloadLib(['picnic_table']);
  const picnicI = libInstancer(scene, 'picnic_table').onMissing((m) => { const g = K.picnicTable(); g.applyMatrix4(m); const pm = new THREE.Mesh(g, propMat); pm.castShadow = pm.receiveShadow = true; scene.add(pm); });
  function placePicnic(x, y, z, ry) { tmpQ.setFromAxisAngle(Y, ry); picnicI.add(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(0.8, 1, 1))); } // 0.8 along the planks: 2.4 m (8 ft) long
  const brkGeos = [];
  function placeBreak(geo, x, y, z, ry, box, kind) {
    if (CLIP_OFF || !breakables.enabled) return place(geo, x, y, z, ry);
    tmpQ.setFromAxisAngle(Y, ry);
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(1, 1, 1));
    const g = geo.clone();
    g.applyMatrix4(tmpM);
    brkGeos.push({ g, x, y, z, ry, box, kind });
  }
  const colliders = [];
  function boxCol(x, y, z, hx, hy, hz, ry) {
    colliders.push({ t: 'box', x, y, z, hx, hy, hz, ry });
  }
  function cylCol(x, y, z, h, r) {
    colliders.push({ t: 'cyl', x, y, z, h, r });
  }

  // ------------------------------------------------------------------ 3. spawn street (Key Paloma)
  const NH = game.nicoHouse;
  const spot = NH?.spot || (data.setpieces || []).find((s) => s.id === 'nico_house');
  const extras = [];
  if (spot && Number.isFinite(spot.x)) {
    const hx = spot.x;
    const hz = spot.z;
    // keys pass (Nov 17): within HAND_R of Nico's house the neighbors are hand placed (keysStreet.data.js, keysLots.js)
    const KEYS_HAND = !/[?&]keys=0\b/.test(location.search);
    const avoid = [{ x: hx, z: hz, r: KEYS_HAND ? HAND_R : 46 }];
    for (const s of data.setpieces || []) if (s.id !== 'nico_house' && Math.hypot(s.x - hx, s.z - hz) < 900) avoid.push({ x: s.x, z: s.z, r: 30 });
    const clear = (x, z, r) => avoid.every((a) => Math.hypot(a.x - x, a.z - z) > a.r + r);
    const landBox = (x, z, ux, uz, w, d) => {
      // footprint fully on land
      for (const a of [-0.5, 0, 0.5]) {
        for (const b of [-0.5, 0, 0.5]) {
          const px = x + ux * a * w - uz * b * d;
          const pz = z + uz * a * w + ux * b * d;
          if (isWater(px, pz)) return false;
        }
      }
      return true;
    };
    // walk the road past the house both ways
    const r0 = data.roadGraph.nearestEdge(hx, hz, {}, 250);
    const samples = [];
    if (r0) {
      for (const dir of [1, -1]) {
        let px = r0.point.x;
        let pz = r0.point.z;
        let dx = r0.dir.x * dir;
        let dz = r0.dir.z * dir;
        for (let k = 0; k < 75; k++) {
          px += dx * 6;
          pz += dz * 6;
          const r = data.roadGraph.nearestEdge(px, pz, {}, 40);
          if (!r || r.dist > 25) break;
          px = r.point.x;
          pz = r.point.z;
          let ndx = r.dir.x;
          let ndz = r.dir.z;
          if (ndx * dx + ndz * dz < 0) {
            ndx = -ndx;
            ndz = -ndz;
          }
          dx = ndx;
          dz = ndz;
          samples.push({ x: px, z: pz, dx, dz, hw: r.edge.width / 2, s: k * 6 * dir, dir });
        }
      }
    }
    samples.sort((a, b) => a.s - b.s);
    // power line: wooden poles every ~42 m on one side, three sagging conductors, service drops to houses
    const wire = new K.Parts();
    const poles = [];
    const poleR = K.rng(7);
    for (let i = 0; i < samples.length; i += 7) {
      const q = samples[i];
      const nx = -q.dz;
      const nz = q.dx;
      const side = -1;
      let x = q.x + nx * side * (q.hw + 2.6);
      let z = q.z + nz * side * (q.hw + 2.6);
      if (isWater(x, z) || !clear(x, z, 2)) continue;
      if (!CLIP_OFF) { // slide along the verge off any tile prop / palm crown; the line skips a pole rather than clip one
        const f = occupancy.free(x, z, 0.16, { y: groundY(x, z), h: 10.4, pole: true, gap: 0.12, dir: [q.dx, q.dz] }, 4, (ax, az) => !isWater(ax, az) && clear(ax, az, 2));
        if (!f) continue;
        x = f[0];
        z = f[1];
      }
      const y = groundY(x, z);
      if (!CLIP_OFF) occupancy.add({ x, z, r: 0.16, y, h: 10.4, kind: 'upole', src: 'dressing.v2.js:spawn power line', pole: true, owner: 'dressing' });
      const ry = Math.atan2(q.dx, q.dz);
      const pole = { x, y, z, ry, top: y + 10.36 };
      place(K.utilityPole(poleR, i % 21 === 0), x, y, z, ry);
      cylCol(x, y + 5.5, z, 5.5, 0.16);
      const prev = poles[poles.length - 1];
      if (prev && Math.hypot(prev.x - x, prev.z - z) < 70) {
        for (const off of [-1.05, 0, 1.05]) {
          const a = new THREE.Vector3(prev.x + Math.sin(prev.ry + Math.PI / 2) * off * 0, prev.top, prev.z);
          a.x = prev.x + Math.cos(prev.ry) * off;
          a.z = prev.z - Math.sin(prev.ry) * off;
          const b = new THREE.Vector3(x + Math.cos(ry) * off, pole.top, z - Math.sin(ry) * off);
          const L = a.distanceTo(b);
          const sag = 0.4 + L * 0.014;
          let pp = null;
          for (let k = 0; k <= 8; k++) {
            const t = k / 8;
            const P = new THREE.Vector3().lerpVectors(a, b, t);
            P.y -= sag * 4 * t * (1 - t);
            if (pp) wire.beam(pp, P, 0.022, K.SURF.rubber, 0x1a1a1a);
            pp = P;
          }
        }
      }
      poles.push(pole);
    }
    // lots on both sides
    const lots = [];
    const R = K.rng(1234);
    let next = -9999;
    let baitDone = false;
    for (const q of samples) {
      if (q.s < next) continue;
      for (const side of [1, -1]) {
        const nx = -q.dz * side;
        const nz = q.dx * side;
        const seed = Math.round(q.x * 3 + q.z * 7 + side * 11);
        const isBait = !baitDone && Math.abs(q.s) > 110 && Math.abs(q.s) < 320 && side === 1;
        const H = isBait ? K.baitShop(seed) : K.keysHouse(seed);
        const set = (isBait ? 8 : 9 + R() * 6) + H.d / 2 + (H.stilt ? 1 : 0);
        const cx = q.x + nx * (q.hw + set);
        const cz = q.z + nz * (q.hw + set);
        const span = Math.max(H.w, H.d) / 2 + 4;
        if (!clear(cx, cz, span)) continue;
        if (!landBox(cx, cz, q.dx, q.dz, H.w + 4, H.d + 6)) continue;
        if (roadDist(cx, cz) < H.d / 2 + 4) continue;
        if (lots.some((l) => Math.hypot(l.x - cx, l.z - cz) < span + l.span + 3)) continue;
        if (!isBait && R() < 0.12) continue; // the odd empty lot
        const ry = Math.atan2(-nx, -nz);
        const y = groundY(cx, cz);
        // houses: drawn by the house generator (src/world/setpieces/houses) on this lot; the bait shop stays here
        const gen = !isBait && houseLots.enabled && !game.v2DressingBoxHouses
          ? houseLots.add({ id: 'spawn:' + seed, x: cx, z: cz, y, heading: ry, w: H.w + 13, d: H.d + 6, front: H.d / 2 + 3, roadGap: Math.max(0, set - H.d / 2 - 3), source: 'street', seed,
            house: { w: H.w, d: H.d, stilt: H.stilt, base: H.base, roadV: set - H.d / 2, drvU: null } })
          : null;
        if (!gen) {
          place(H.geo, cx, y, cz, ry);
          for (const c of H.colliders) {
            const wx = cx + Math.cos(ry) * c.x + Math.sin(ry) * c.z;
            const wz = cz - Math.sin(ry) * c.x + Math.cos(ry) * c.z;
            boxCol(wx, y + c.y, wz, c.hx, c.hy, c.hz, ry);
          }
        }
        lots.push({ x: cx, z: cz, y, ry, span, nx, nz, q, side, H, bait: isBait, seed, gen });
        if (isBait) {
          baitDone = true;
          const tex = K.signTexture([{ text: 'LIVE BAIT  ·  ICE  ·  TACKLE', px: 92 }], { bg: '#efe6cf', ink: '#1d4a5a' });
          const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
          const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.3), sm);
          board.position.set(cx + Math.sin(ry) * H.signZ, y + H.signY, cz + Math.cos(ry) * H.signZ);
          board.rotation.y = ry;
          board.castShadow = true;
          extras.push(board);
          const tex2 = K.signTexture([{ text: 'BAIT', px: 150 }, { text: 'OPEN 5 AM', px: 70, color: '#a8322a' }], { w: 512, h: 512, bg: '#f4f0e4', edge: '#a8322a', ink: '#a8322a' });
          const roadSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: tex2, roughness: 0.8, side: THREE.DoubleSide }));
          const sx = q.x + nx * (q.hw + 2.2) + q.dx * 6;
          const sz = q.z + nz * (q.hw + 2.2) + q.dz * 6;
          roadSign.position.set(sx, groundY(sx, sz) + 2.2, sz);
          roadSign.rotation.y = Math.atan2(q.dx, q.dz) + Math.PI / 2;
          extras.push(roadSign);
          const post = new K.Parts();
          for (const o of [-0.6, 0.6]) post.box(o * q.dz, 1.2, -o * q.dx, 0.1, 2.4, 0.1, K.SURF.planks, 0x9a8a70);
          place(post.build(), sx, groundY(sx, sz), sz, 0);
        }
      }
      next = q.s + 26 + R() * 14;
    }
    if (KEYS_HAND) { try { buildKeysLots(game, { THREE, spot, place, placePicnic, placeBreak, boxCol, cylCol, groundY, isWater, houseLots: houseLots.enabled && !game.v2DressingBoxHouses ? houseLots : null, K }); } catch (e) { console.error('[dressing] keys lots', e); } }
    // yards
    const carSpots = [];
    for (const L of lots) {
      const r = K.rng(L.seed + 5);
      const fx = Math.sin(L.ry);
      const fz = Math.cos(L.ry);
      const rx = Math.cos(L.ry);
      const rz = -Math.sin(L.ry);
      const at = (u, v) => [L.x + rx * u + fx * v, L.z + rz * u + fz * v];
      const H = L.H;
      const roadV = H.d / 2 + (Math.hypot(L.x - L.q.x, L.z - L.q.z) - L.q.hw - H.d / 2);
      const drvU = (H.w / 2 + 2.2) * (r() < 0.5 ? -1 : 1);
      if (L.gen) L.gen.house.drvU = drvU;
      // crushed-shell driveway from the road to the house
      const dlen = roadV - H.d / 2 + 1;
      const [dx0, dz0] = at(drvU, H.d / 2 + dlen / 2 - 1);
      if (!(game.groundMask && game.groundMask.addDrive && game.groundMask.addDrive(dx0, dz0, L.ry, 3.4 + ((L.seed * 0.618) % 1) * 0.8, dlen + 1.5))) { // ground pass: drawn into the ground (crushed shell, ragged edges) by the terrain shader, not a slab
        const drive = new K.Parts().box(0, 0.025, 0, 3.4, 0.05, dlen, K.SURF.plaster, 0xe6e0d0);
        place(drive.build(), dx0, groundY(dx0, dz0), dz0, L.ry); }
      const [mx, mz] = at(drvU + 2.3, roadV - 1.2);
      const LIBP = lotProps.enabled; // props pass: library mailbox + carts per house (src/world/props/lotProps.v2.js); the rng sequence is kept
      const mbG = K.mailbox(r); if (!LIBP) placeBreak(mbG, mx, groundY(mx, mz), mz, L.ry, [0.14, 0.7, 0.3], 'mailbox');
      const [bx, bz] = at(drvU - 2.3, roadV - 1.6);
      if (!LIBP) placeBreak(K.wheelieBin(r() < 0.5 ? 0x2f5a3a : 0x3a3e44), bx, groundY(bx, bz), bz, L.ry + (r() - 0.5) * 0.4, [0.3, 0.52, 0.38], 'bin'); else { r(); r(); }
      if (r() < 0.5) { if (!LIBP) placeBreak(K.wheelieBin(0x2c4f7c), bx - rx * 0.8, groundY(bx, bz), bz - rz * 0.8, L.ry + (r() - 0.5) * 0.4, [0.3, 0.52, 0.38], 'bin'); else r(); }
      if (LIBP) { const [sx, sz] = at(-Math.sign(drvU) * (H.w / 2 + 0.8), H.d / 2 - 1.4);
        lotProps.add('dressing:' + L.seed, [{ kind: 'mailbox', x: mx, y: groundY(mx, mz), z: mz, ry: L.ry, seed: L.seed }, { kind: 'carts', x: bx - rx * 0.4, y: groundY(bx, bz), z: bz - rz * 0.4, ry: L.ry, seed: L.seed + 1, side: { x: sx, y: groundY(sx, sz), z: sz, ry: L.ry } }]); }
      if (L.bait) {
        carSpots.push({ x: at(-3, H.d / 2 + 6)[0], z: at(-3, H.d / 2 + 6)[1], ry: L.ry + Math.PI / 2 });
        carSpots.push({ x: at(3.5, H.d / 2 + 6)[0], z: at(3.5, H.d / 2 + 6)[1], ry: L.ry + Math.PI / 2 });
        const [px, pz] = at(-H.w / 2 - 3, 1);
        placePicnic(px, groundY(px, pz), pz, L.ry + 0.3);
        const [cx2, cz2] = at(H.w / 2 + 1.5, -1);
        place(K.crabTrapStack(r), cx2, groundY(cx2, cz2), cz2, r() * 6);
        place(K.dumpster(), at(H.w / 2 + 2, -H.d / 2)[0], groundY(L.x, L.z), at(H.w / 2 + 2, -H.d / 2)[1], L.ry);
        boxCol(at(H.w / 2 + 2, -H.d / 2)[0], groundY(L.x, L.z) + 0.75, at(H.w / 2 + 2, -H.d / 2)[1], 0.95, 0.75, 0.7, L.ry);
      } else {
        const [cx, cz] = at(drvU, H.d / 2 + 4);
        carSpots.push({ x: cx, z: cz, ry: L.ry + Math.PI });
      }
      // boat on a trailer beside the house
      if (r() < 0.55) {
        const B = K.boatOnTrailer(r);
        const u = -drvU * 0.2 - Math.sign(drvU) * (H.w / 2 + 2.2);
        const [tx, tz] = at(u, H.d / 2 - B.L / 2 + 1.5);
        if (!isWater(tx, tz)) {
          place(B.geo, tx, groundY(tx, tz), tz, L.ry + Math.PI + (r() - 0.5) * 0.1);
          boxCol(tx, groundY(tx, tz) + 1, tz, B.W / 2, 1, B.L / 2, L.ry);
        }
      }
      // fences along the side lot lines
      if (r() < 0.45) {
        const type = r() < 0.5 ? 'chain' : 'picket';
        for (const s of [-1, 1]) {
          const u = s * (H.w / 2 + 6.5);
          for (let v = -H.d / 2; v < roadV - 3; v += 3) {
            const [fx2, fz2] = at(u, v + 1.5);
            if (isWater(fx2, fz2) || r() < 0.07) continue;
            placeBreak(K.fenceSegment(type, 3, r), fx2, groundY(fx2, fz2), fz2, L.ry + Math.PI / 2 + (r() - 0.5) * 0.05, [1.5, 0.75, 0.08], type === 'chain' ? 'chain' : 'fence');
          }
        }
      }
      // yard clutter
      const clutter = [
        [0.3, () => K.crabTrapStack(r)],
        [0.25, () => K.kayak([0xe85a2a, 0x2a8ab8, 0xe8c82a, 0x3aa86a][(r() * 4) | 0])],
        [0.35, () => K.propaneTank()],
        [0.3, 'picnic'],
        [0.25, () => K.buoyPile(r)],
      ];
      for (const [p, mk] of clutter) {
        if (r() > p) continue;
        const u = (r() - 0.5) * (H.w + 6);
        const v = -H.d / 2 - 2 - r() * 6;
        const [cx, cz] = at(u, v);
        if (isWater(cx, cz)) continue;
        if (mk === 'picnic') { const [qx, qz] = at(u, v - 0.7); placePicnic(qx, groundY(qx, qz), qz, r() * 6.28); } else place(mk(), cx, groundY(cx, cz), cz, r() * 6.28);
      }
      // coral rock edging along the driveway
      if (r() < 0.4) {
        for (let v = H.d / 2 + 1; v < roadV - 1; v += 1.3) {
          const [cx, cz] = at(drvU + 2.0 * (r() < 0.5 ? 1 : -1), v);
          place(K.coralRock(r), cx, groundY(cx, cz), cz, r() * 6.28, 0.5 + r() * 0.4);
        }
      }
      // service drop from the nearest pole
      let best = null;
      let bd = 80;
      for (const p of poles) {
        const d = Math.hypot(p.x - L.x, p.z - L.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) {
        const [ex, ez] = at(H.w / 2 - 0.3, H.d / 2);
        const a = new THREE.Vector3(best.x, best.top - 1.0, best.z);
        const b = new THREE.Vector3(ex, L.y + (H.roofY || 5) - 0.6, ez);
        let pp = null;
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          const P = new THREE.Vector3().lerpVectors(a, b, t);
          P.y -= 0.6 * 4 * t * (1 - t);
          if (pp) wire.beam(pp, P, 0.018, K.SURF.rubber, 0x1a1a1a);
          pp = P;
        }
      }
      // planting: palms, sea grape, hibiscus, croton (never inside the house volume: porch, deck, stairs, carport; houses track)
      const inHouse = (px, pz) => { const dx = px - L.x, dz = pz - L.z, u = (dx * rx + dz * rz) * Math.sign(drvU || 1), v = dx * fx + dz * fz;
        return v > -H.d / 2 - 1.6 && v < H.d / 2 + (L.gen ? 8 : 3.5) && u < H.w / 2 + (L.gen ? 4.4 : 1.5) && u > -H.w / 2 - 1.6; };
      const np = 2 + ((r() * 3) | 0);
      for (let i = 0; i < np; i++) {
        const [px, pz] = at((r() - 0.5) * (H.w + 10), (r() - 0.3) * (H.d + 10));
        if (isWater(px, pz) || Math.hypot(px - L.x, pz - L.z) < Math.max(H.w, H.d) / 2 + 1.5 || inHouse(px, pz)) continue;
        addVeg(r() < 0.75 ? 'coconut' : 'sabal', { x: px, y: groundY(px, pz), z: pz, ry: r() * 6.28, s: 0.8 + r() * 0.4 });
      }
      for (let i = 0; i < 6; i++) {
        const [px, pz] = at((r() - 0.5) * (H.w + 8), (r() - 0.5) * (H.d + 8));
        if (isWater(px, pz) || Math.hypot(px - L.x, pz - L.z) < Math.max(H.w, H.d) / 2 + 1 || inHouse(px, pz)) continue;
        addVeg(['seagrape', 'hibiscus', 'croton', 'seagrape'][(r() * 4) | 0], { x: px, y: groundY(px, pz), z: pz, ry: r() * 6.28, s: 0.7 + r() * 0.6 });
      }
    }
    // roadside: palms and sea grape on the verge, mangroves on every shore within 450 m
    for (let i = 3; i < samples.length; i += 4) {
      const q = samples[i];
      for (const side of [1, -1]) {
        const h = hash2(q.x, q.z, side);
        if (h > 0.45) continue;
        const o = q.hw + 4 + h * 10;
        const x = q.x - q.dz * side * o;
        const z = q.z + q.dx * side * o;
        if (isWater(x, z) || !clear(x, z, 3) || lots.some((l) => Math.hypot(l.x - x, l.z - z) < l.span + 1)) continue;
        addVeg(h < 0.2 ? 'coconut' : 'seagrape', { x, y: groundY(x, z), z, ry: h * 40, s: 0.8 + h });
      }
    }
    let mg = 0;
    for (let x = hx - 450; x < hx + 450; x += 4.5) {
      for (let z = hz - 450; z < hz + 450; z += 4.5) {
        const h = hash2(x, z, 3);
        if (h > 0.5) continue;
        const jx = x + (hash2(x, z, 4) - 0.5) * 3;
        const jz = z + (hash2(x, z, 5) - 0.5) * 3;
        // keys pass: mangroves stand on the shore fringe (a land cell with water within 3 m) with their prop roots sunk into the
        // wet sand at the waterline; the sea bed here drops to -5 m, so a mangrove out in the water hovered with its roots in the air
        const wet = isWater(jx, jz); let near = false;
        for (const [ox, oz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (isWater(jx + ox, jz + oz) !== wet) near = true;
        if (!near) continue;
        const gy = wet ? null : groundY(jx, jz); if (wet || gy > 0.9) continue;
        if (!clear(jx, jz, 8) || Math.hypot(jx - spot.dock?.[0], jz - spot.dock?.[1]) < 14) continue;
        if (vnoise(jx * 0.02, jz * 0.02) < 0.38) continue;
        addVeg('mangrove', { x: jx, y: Math.min(gy, 0.25) - 0.35, z: jz, ry: h * 60, s: 0.7 + h * 0.8 });
        mg++;
      }
    }
    if (wire.list.length) geos.push(wire.build());
    stats.spawn = { lots: lots.length, bait: baitDone, poles: poles.length, mangroves: mg, cars: carSpots.length };
    // parked cars: real traffic models through the vehicles API (parked, locked), the nearest few to the spawn
    const spawnCars = () => {
      const V = game.vehicles;
      if (!V?.spawn) return;
      const types = ['pickup', 'sedan', 'suv', 'compact', 'van', 'muscle'];
      carSpots.sort((a, b) => Math.hypot(a.x - hx, a.z - hz) - Math.hypot(b.x - hx, b.z - hz));
      let n = 0;
      for (const c of carSpots.slice(0, 6)) {
        try {
          const v = V.spawn(types[n % types.length], new THREE.Vector3(c.x, groundY(c.x, c.z) + 0.6, c.z), c.ry, { snap: false });
          if (v) n++;
        } catch (e) {
          console.warn('[dressing] parked car', e);
        }
      }
      stats.spawn.carsSpawned = n;
    };
    game.dressing_spawnCars = spawnCars;
    if (game.ready) spawnCars();
    else {
      let waited = 0;
      const tick = (dt) => {
        waited += dt;
        if (!game.ready && waited < 120) return;
        const i = game.updaters.indexOf(tick);
        if (i >= 0) game.updaters.splice(i, 1);
        spawnCars();
      };
      game.updaters.push(tick);
    }
  }

  picnicI.flush();
  // one merged static mesh for the spawn street
  if (geos.length) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged, propMat);
    mesh.name = 'dressing-spawn-street';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    stats.spawnTris = (merged.attributes.position.count / 3) | 0;
  }
  if (brkGeos.length) { // X1 breakables: one mesh, one box collider per piece
    const merged = mergeGeometries(brkGeos.map((b) => b.g), false);
    const mesh = new THREE.Mesh(merged, propMat);
    mesh.name = 'dressing-breakables';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    const P = merged.attributes.position;
    let off = 0;
    for (const b of brkGeos) {
      const n = b.g.attributes.position.count, v0 = off;
      off += n;
      b.g.dispose();
      breakables.add({ x: b.x, y: b.y, z: b.z, hx: b.box[0], hy: b.box[1], hz: b.box[2], ry: b.ry, kind: b.kind, owner: 'dressing',
        hide: () => { for (let i = v0; i < v0 + n; i++) P.setXYZ(i, b.x, b.y - 1, b.z); P.needsUpdate = true; } });
      occupancy.add({ x: b.x, z: b.z, r: Math.min(b.box[0], b.box[2]) + 0.1, y: b.y, h: b.box[1] * 2, kind: b.kind, src: 'dressing.v2.js:spawn yards', owner: 'dressing' });
    }
    stats.breakables = brkGeos.length;
  }
  for (const e of extras) {
    e.updateMatrix();
    e.matrixAutoUpdate = false;
    scene.add(e);
  }
  // colliders (static, created once)
  if (world && RAPIER) {
    for (const c of colliders) {
      try {
        if (c.t === 'box') {
          const q = new THREE.Quaternion().setFromAxisAngle(Y, c.ry);
          world.createCollider(RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(c.x, c.y, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
        } else {
          world.createCollider(RAPIER.ColliderDesc.cylinder(c.h, c.r).setTranslation(c.x, c.y, c.z));
        }
      } catch (e) {
        console.warn('[dressing] collider', e);
      }
    }
    stats.colliders = colliders.length;
  }

  // ------------------------------------------------------------------ 2. real-Miami plain land: clustered planting (time-sliced)
  const RR = data.realRect;
  const BAD = new Set(['building', 'asphalt', 'sidewalk', 'water', 'pier', 'wood', 'sand', 'tile', 'pavers']);
  const OK = new Set(['concrete', 'grass_short', 'grass_long', 'dirt', 'gravel']);
  const scatter = {};
  const STEP = 7;
  let sx = RR.minX;
  function scatterSlice(budget) {
    const tEnd = performance.now() + budget;
    while (sx < RR.maxX && performance.now() < tEnd) {
      for (let z = RR.minZ; z < RR.maxZ; z += STEP) {
        const x = sx + hash2(sx, z, 1) * STEP;
        const zz = z + hash2(sx, z, 2) * STEP;
        const h = hash2(x, zz, 9);
        const n = vnoise(x * 0.014, zz * 0.014);
        // clusters (groves) plus a thin sprinkle of loners
        if (!(n > 0.62 ? h < 0.16 : h < 0.012)) continue;
        if (data.coverAt(x, zz) !== 'none' || !OK.has(data.surfaceAt(x, zz))) continue;
        let bad = false;
        for (const [ox, oz] of [[5, 0], [-5, 0], [0, 5], [0, -5], [3.5, 3.5], [-3.5, -3.5]]) {
          if (BAD.has(data.surfaceAt(x + ox, zz + oz))) {
            bad = true;
            break;
          }
        }
        if (bad) continue;
        const k = vnoise(x * 0.005 + 11, zz * 0.005);
        const pick = hash2(x, zz, 13);
        const kind = k < 0.35 ? (pick < 0.6 ? 'coconut' : pick < 0.85 ? 'seagrape' : 'hibiscus') : k < 0.6 ? (pick < 0.45 ? 'sabal' : pick < 0.8 ? 'seagrape' : 'croton') : (pick < 0.3 ? 'liveoak' : pick < 0.6 ? 'seagrape' : pick < 0.85 ? 'coconut' : 'hibiscus');
        (scatter[kind] ||= []).push({ x, y: 0, z: zz, ry: h * 60, s: 0.75 + hash2(x, zz, 17) * 0.5 });
      }
      sx += STEP;
    }
    return sx >= RR.maxX;
  }
  const fields = [];
  function makeFields(lists, seed) {
    const V = game.vegetation;
    if (!V?.field) return 0;
    let n = 0;
    for (const [kind, items] of Object.entries(lists)) {
      if (!items.length) continue;
      try {
        fields.push(V.field(kind, items, { variants: 3, seed }));
        n += items.length;
      } catch (e) {
        console.warn('[dressing] field', kind, e);
      }
    }
    return n;
  }
  // sampled once during loading (about 0.3 s), so nothing is built while playing; one field per species for both sets
  const ts = performance.now();
  scatterSlice(Infinity);
  stats.scatterMs = Math.round(performance.now() - ts);
  for (const [k, items] of Object.entries(scatter)) {
    stats.scatter += items.length;
    for (const it of items) addVeg(k, it);
  }
  stats.veg = makeFields(vegKinds, 5);
  stats.msInit = Math.round(performance.now() - t0);
  game.dressing = {
    stats: () => ({ ...stats, fields: fields.map((f) => f.stats?.()) }),
    spawnArea: spot ? { x: spot.x, z: spot.z } : null,
    get landPatched() {
      return stats.landPatched;
    },
  };
  console.info('[dressing] ready', JSON.stringify(stats));
}
